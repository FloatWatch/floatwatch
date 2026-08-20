from __future__ import annotations

import json
import hashlib
import logging
import os
import re
import shutil
import secrets
import subprocess
import urllib.parse
import urllib.request
import uuid
import zipfile
from collections import deque
from concurrent.futures import CancelledError as FutureCancelledError, Future, ThreadPoolExecutor
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path
from threading import Lock
from time import monotonic

import cv2
import numpy as np
from imageio_ffmpeg import get_ffmpeg_exe
from PIL import Image
from fastapi import Cookie, Depends, FastAPI, File, Form, HTTPException, Query, Request, Response, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, RedirectResponse
from sqlalchemy import delete, func, select, text
from sqlalchemy.orm import Session as DbSession

from .analysis_service import (
    ANALYSIS_ERROR_MESSAGES,
    InvalidAnalysisTransition,
    analysis_media_type,
    cleanup_analysis_artifacts,
    run_analysis,
    transition_analysis,
    validate_result_file,
)
from .coastal import COASTAL_DISTANCE_METERS, classify_coastal_location
from .database import Base, STORAGE_DIR, SessionLocal, engine
from .models import Analysis, AuditLog, ContentAttachment, ContentComment, ContentItem, Inquiry, InquiryAttachment, ModelArtifact, OAuthIdentity, RealtimeEvent, RealtimeSession, Session, User, VideoAsset
from .oauth import PROVIDERS, authorization_url, exchange_profile
from .schemas import AccountDelete, AnalysisCreate, CommentCreate, ContentCreate, ContentUpdate, InquiryAnswer, InquiryCreate, LoginBody, MediaLocationUpdate, PasswordChange, ProfileUpdate, RealtimeEventProtect, RealtimeSessionCreate, RealtimeSessionUpdate, RegisterBody, UserAdminUpdate
from .security import hash_password, new_session_token, token_digest, verify_password
from .storage_security import InsufficientStorageError, ensure_disk_capacity, ensure_within_storage, normalize_upload_name, safe_unlink, storage_path


MAX_MODEL_SIZE = 500 * 1024 * 1024
MAX_VIDEO_SIZE = 2 * 1024 * 1024 * 1024
MAX_ATTACHMENT_SIZE = 20 * 1024 * 1024
USER_STORAGE_LIMIT = int(os.getenv("USER_STORAGE_LIMIT_BYTES", str(5 * 1024 * 1024 * 1024)))
MAX_VIDEO_DURATION_SECONDS = int(os.getenv("MAX_VIDEO_DURATION_SECONDS", "3600"))
MAX_MEDIA_PIXELS = int(os.getenv("MAX_MEDIA_PIXELS", str(3840 * 2160)))
MIN_FREE_DISK_BYTES = int(os.getenv("MIN_FREE_DISK_BYTES", str(512 * 1024 * 1024)))
ANALYSIS_DISK_MULTIPLIER = int(os.getenv("ANALYSIS_DISK_MULTIPLIER", "3"))
COOKIE_NAME = "floatwatch_session"
OAUTH_STATE_COOKIE = "floatwatch_oauth_state"
FRONTEND_ORIGIN = os.getenv("FRONTEND_ORIGIN", "http://localhost:3000").rstrip("/")
logger = logging.getLogger("floatwatch")
logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"), format="%(asctime)s %(levelname)s %(name)s %(message)s")
analysis_executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="floatwatch-analysis")
analysis_creation_lock = Lock()
analysis_queue_lock = Lock()
analysis_futures: dict[int, Future[None]] = {}
realtime_model_lock = Lock()
realtime_inference_lock = Lock()
realtime_model_cache: dict[int, tuple[float, object]] = {}
REALTIME_EVIDENCE_LIMIT_BYTES = int(os.getenv("REALTIME_EVIDENCE_LIMIT_BYTES", str(10 * 1024 * 1024 * 1024)))
REALTIME_EVIDENCE_CLEANUP_START_BYTES = int(os.getenv("REALTIME_EVIDENCE_CLEANUP_START_BYTES", str(8 * 1024 * 1024 * 1024)))
REALTIME_EVIDENCE_CLEANUP_TARGET_BYTES = int(os.getenv("REALTIME_EVIDENCE_CLEANUP_TARGET_BYTES", str(6 * 1024 * 1024 * 1024)))
REALTIME_EVIDENCE_MAX_PER_SESSION = int(os.getenv("REALTIME_EVIDENCE_MAX_PER_SESSION", "50"))
REALTIME_EVIDENCE_INTERVAL_SECONDS = int(os.getenv("REALTIME_EVIDENCE_INTERVAL_SECONDS", "10"))
ORPHAN_FILE_GRACE_SECONDS = int(os.getenv("ORPHAN_FILE_GRACE_SECONDS", "3600"))
MAX_SERVER_ANALYSIS_JOBS = int(os.getenv("MAX_SERVER_ANALYSIS_JOBS", "20"))
RATE_LIMIT_RULES = {
    "login_account": (10, 60),
    "login_ip": (30, 60),
    "upload_model": (10, 300),
    "upload_media": (20, 300),
    "analysis": (6, 60),
    "realtime_detect": (300, 60),
}
rate_limit_lock = Lock()
rate_limit_events: dict[tuple[str, str], deque[float]] = {}

IMAGE_SUFFIXES = {".jpg", ".jpeg", ".png", ".webp", ".bmp"}
VIDEO_SUFFIXES = {".mp4", ".avi", ".mov", ".mkv", ".webm"}


def request_client_key(request: Request) -> str:
    # Do not trust a client-supplied forwarding header unless a trusted proxy
    # middleware is configured at deployment time.
    return request.client.host if request.client else "unknown"


def enforce_rate_limit(scope: str, subject: str, *, now: float | None = None) -> None:
    """Apply an in-process sliding-window limit for costly or sensitive APIs."""
    limit, window_seconds = RATE_LIMIT_RULES[scope]
    timestamp = monotonic() if now is None else now
    key = (scope, subject)
    with rate_limit_lock:
        events = rate_limit_events.setdefault(key, deque())
        cutoff = timestamp - window_seconds
        while events and events[0] <= cutoff:
            events.popleft()
        if len(events) >= limit:
            retry_after = max(1, int(window_seconds - (timestamp - events[0])) + 1)
            logger.warning("event=rate_limit_exceeded scope=%s subject=%s", scope, subject)
            raise HTTPException(
                429,
                "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.",
                headers={"Retry-After": str(retry_after)},
            )
        events.append(timestamp)


def detected_media_format(path: Path) -> str | None:
    with path.open("rb") as source:
        header = source.read(16)
    if header.startswith(b"\xff\xd8\xff"):
        return "jpeg"
    if header.startswith(b"\x89PNG\r\n\x1a\n"):
        return "png"
    if header.startswith(b"BM"):
        return "bmp"
    if header[:4] == b"RIFF" and header[8:12] == b"WEBP":
        return "webp"
    if header[:4] == b"RIFF" and header[8:12] == b"AVI ":
        return "avi"
    if len(header) >= 12 and header[4:8] == b"ftyp":
        return "iso-bmff"
    if header.startswith(b"\x1aE\xdf\xa3"):
        return "matroska"
    return None


def validate_media_signature(path: Path, suffix: str) -> None:
    detected = detected_media_format(path)
    allowed = {
        ".jpg": {"jpeg"}, ".jpeg": {"jpeg"}, ".png": {"png"}, ".webp": {"webp"}, ".bmp": {"bmp"},
        ".avi": {"avi"}, ".mp4": {"iso-bmff"}, ".mov": {"iso-bmff"},
        ".mkv": {"matroska"}, ".webm": {"matroska"},
    }
    if detected not in allowed.get(suffix, set()):
        path.unlink(missing_ok=True)
        raise HTTPException(400, "파일 확장자와 실제 미디어 형식이 일치하지 않습니다.")


def _gps_decimal(values: object, reference: object) -> float | None:
    try:
        degrees, minutes, seconds = values  # type: ignore[misc]
        coordinate = float(degrees) + float(minutes) / 60 + float(seconds) / 3600
        if str(reference).upper() in {"S", "W"}:
            coordinate *= -1
        return coordinate
    except (TypeError, ValueError):
        return None


def _parse_capture_time(value: object) -> datetime | None:
    if not value:
        return None
    raw = str(value).strip().replace("Z", "+00:00")
    for pattern in (None, "%Y:%m:%d %H:%M:%S", "%Y-%m-%dT%H:%M:%S%z"):
        try:
            parsed = datetime.fromisoformat(raw) if pattern is None else datetime.strptime(raw, pattern)
            return parsed.replace(tzinfo=parsed.tzinfo or timezone.utc)
        except ValueError:
            continue
    return None


def extract_media_metadata(path: Path, suffix: str) -> tuple[float | None, float | None, datetime | None]:
    latitude = longitude = None
    captured_at = None
    if suffix in IMAGE_SUFFIXES:
        try:
            with Image.open(path) as image:
                exif = image.getexif()
                captured_at = _parse_capture_time(exif.get(36867) or exif.get(306))
                gps = exif.get_ifd(34853) if exif else {}
                latitude = _gps_decimal(gps.get(2), gps.get(1))
                longitude = _gps_decimal(gps.get(4), gps.get(3))
        except (OSError, KeyError, TypeError, ValueError):
            logger.info("event=image_metadata_unavailable path=%s", path.name)
    elif suffix in VIDEO_SUFFIXES:
        try:
            result = subprocess.run([get_ffmpeg_exe(), "-hide_banner", "-i", str(path), "-f", "ffmetadata", "-"], capture_output=True, text=True, timeout=20)
            metadata = f"{result.stdout}\n{result.stderr}"
            location = re.search(r"(?:location|location-eng|com\.apple\.quicktime\.location\.ISO6709)\s*[:=]\s*([+-]\d+(?:\.\d+)?)([+-]\d+(?:\.\d+)?)", metadata, re.IGNORECASE)
            if location:
                latitude, longitude = float(location.group(1)), float(location.group(2))
            created = re.search(r"(?:creation_time|date)\s*[:=]\s*([^\r\n]+)", metadata, re.IGNORECASE)
            captured_at = _parse_capture_time(created.group(1)) if created else None
        except (OSError, subprocess.SubprocessError, ValueError):
            logger.info("event=video_metadata_unavailable path=%s", path.name)
    if latitude is not None and not -90 <= latitude <= 90:
        latitude = None
    if longitude is not None and not -180 <= longitude <= 180:
        longitude = None
    return latitude, longitude, captured_at


def validate_pt_container(path: Path) -> None:
    try:
        if not zipfile.is_zipfile(path):
            raise ValueError("not a zip-based PyTorch checkpoint")
        with zipfile.ZipFile(path) as archive:
            names = archive.namelist()
            if len(names) > 100_000:
                raise ValueError("too many checkpoint entries")
            total_size = sum(info.file_size for info in archive.infolist())
            if total_size > MAX_MODEL_SIZE * 2:
                raise ValueError("expanded checkpoint is too large")
            if not any(name.endswith("/data.pkl") or name == "data.pkl" for name in names):
                raise ValueError("missing checkpoint metadata")
            if not any(name.endswith("/version") or name == "version" for name in names):
                raise ValueError("missing checkpoint version")
    except (OSError, ValueError, zipfile.BadZipFile):
        path.unlink(missing_ok=True)
        raise HTTPException(400, "유효한 PyTorch PT 체크포인트 파일이 아닙니다.") from None


def model_file_problem(item: ModelArtifact) -> str | None:
    try:
        path = ensure_within_storage(item.path, STORAGE_DIR)
        if not path.is_file():
            return "모델 파일이 저장소에 존재하지 않습니다."
        if path.stat().st_size != item.size_bytes:
            return "모델 파일 크기가 등록 당시와 달라 파일이 변경되었거나 손상되었습니다."
        if not zipfile.is_zipfile(path):
            return "유효한 PyTorch PT 체크포인트 형식이 아닙니다."
        with zipfile.ZipFile(path) as archive:
            names = archive.namelist()
            if not any(name.endswith("/data.pkl") or name == "data.pkl" for name in names):
                return "모델 체크포인트 메타데이터가 손상되었습니다."
            if not any(name.endswith("/version") or name == "version" for name in names):
                return "모델 체크포인트 버전 정보가 손상되었습니다."
    except (OSError, ValueError, zipfile.BadZipFile):
        return "모델 파일을 읽을 수 없거나 손상되었습니다."
    return None


def quarantine_unusable_model(item: ModelArtifact, reason: str) -> None:
    item.quarantined = True
    item.quarantine_reason = reason[:1000]
    item.quarantined_at = datetime.now(timezone.utc)


def require_model_file(item: ModelArtifact, db: DbSession) -> None:
    problem = model_file_problem(item)
    if not problem:
        return
    quarantine_unusable_model(item, problem)
    db.commit()
    raise HTTPException(409, f"사용할 수 없는 AI 모델입니다. {problem}")


def add_audit_log(
    db: DbSession,
    actor: User,
    *,
    action: str,
    target_type: str,
    target_id: int | str | None,
    target_label: str | None,
    reason: str,
    before: dict | None = None,
    after: dict | None = None,
) -> None:
    db.add(AuditLog(
        actor_id=actor.id,
        actor_name=actor.name,
        action=action,
        target_type=target_type,
        target_id=str(target_id) if target_id is not None else None,
        target_label=target_label,
        before_json=json.dumps(before, ensure_ascii=False) if before is not None else None,
        after_json=json.dumps(after, ensure_ascii=False) if after is not None else None,
        reason=reason.strip(),
    ))


def _analysis_done(analysis_id: int, future: Future[None]) -> None:
    with analysis_queue_lock:
        if analysis_futures.get(analysis_id) is future:
            analysis_futures.pop(analysis_id, None)
    try:
        future.result()
    except FutureCancelledError:
        logger.info("event=analysis_queue_cancelled analysis_id=%s", analysis_id)
    except Exception:
        logger.exception("analysis worker crashed", extra={"analysis_id": analysis_id})


def enqueue_analysis(analysis_id: int) -> bool:
    """Submit an analysis once and track it until the worker finishes."""
    with analysis_queue_lock:
        if analysis_id in analysis_futures:
            logger.info("event=analysis_queue_duplicate_ignored analysis_id=%s", analysis_id)
            return False
        future = analysis_executor.submit(run_analysis, analysis_id)
        analysis_futures[analysis_id] = future
    future.add_done_callback(lambda result: _analysis_done(analysis_id, result))
    return True


def cancel_enqueued_analysis(analysis_id: int) -> bool:
    """Remove work that has not started; running workers observe persisted cancellation."""
    with analysis_queue_lock:
        future = analysis_futures.get(analysis_id)
    return bool(future and future.cancel())


REALTIME_DEMO_MARKER = "DEMO_DATA:"


def _demo_evidence_image(class_name: str, confidence: float, seed: int) -> bytes:
    """Create a deterministic preview that behaves like captured evidence."""
    height, width = 360, 640
    image = np.zeros((height, width, 3), dtype=np.uint8)
    image[:, :, 0] = np.linspace(72, 26, height, dtype=np.uint8)[:, None]
    image[:, :, 1] = np.linspace(105, 62, height, dtype=np.uint8)[:, None]
    image[:, :, 2] = np.linspace(112, 54, height, dtype=np.uint8)[:, None]
    for offset in range(0, width, 70):
        points = np.array([[offset, 220 + (seed % 4) * 6], [offset + 34, 210], [offset + 70, 224]], np.int32)
        cv2.polylines(image, [points], False, (156, 184, 183), 1, cv2.LINE_AA)
    x1 = 120 + (seed * 37) % 210
    y1 = 150 + (seed * 19) % 65
    x2, y2 = min(width - 40, x1 + 150), min(height - 35, y1 + 80)
    cv2.ellipse(image, ((x1 + x2) // 2, (y1 + y2) // 2), (58, 22), -12, 0, 360, (82, 116, 132), -1)
    cv2.rectangle(image, (x1, y1), (x2, y2), (74, 211, 199), 3)
    label = f"{class_name} {round(confidence * 100)}%"
    cv2.rectangle(image, (x1, max(0, y1 - 29)), (min(width - 5, x1 + 215), y1), (6, 58, 63), -1)
    cv2.putText(image, label, (x1 + 7, y1 - 9), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (239, 255, 253), 1, cv2.LINE_AA)
    cv2.putText(image, "DEMO EVIDENCE", (18, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (110, 224, 213), 1, cv2.LINE_AA)
    encoded, buffer = cv2.imencode(".jpg", image, [int(cv2.IMWRITE_JPEG_QUALITY), 84])
    return buffer.tobytes() if encoded else b""


def seed_realtime_demo(db: DbSession) -> int:
    """Seed a balanced demo set for each existing user that owns a usable model."""
    now = datetime.now(timezone.utc)
    scenarios = [
        ("completed", 1, 68, "부산광역시 해운대구 우동 해운대해수욕장", 35.1587, 129.1604, 110.0, [("PET_Bottle", .91), ("Plastic ETC", .76), ("Net", .68)], 12),
        ("completed", 3, 42, "강원특별자치도 속초시 조양동 속초해수욕장", 38.1890, 128.6013, 85.0, [("Styrofoam Box", .87), ("Rope", .72), ("Plastic Buoy", .64)], 9),
        ("completed", 6, 31, "인천광역시 중구 을왕동 을왕리해수욕장", 37.4475, 126.3721, 145.0, [("Glass", .83), ("Metal", .79), ("PET_Bottle", .74)], 10),
        ("interrupted", 9, 18, "제주특별자치도 제주시 조천읍 함덕리 함덕해수욕장", 33.5434, 126.6695, 95.0, [("Styrofoam Piece", .58), ("Plastic Buoy(China)", .51)], 5),
    ]
    created = 0
    for user in db.scalars(select(User).order_by(User.id)).all():
        model = db.scalar(select(ModelArtifact).where(ModelArtifact.user_id == user.id, ModelArtifact.quarantined.is_(False)).order_by(ModelArtifact.id.desc()).limit(1))
        if not model:
            continue
        already_seeded = db.scalar(select(RealtimeSession.id).where(RealtimeSession.user_id == user.id, RealtimeSession.location_description.like(f"{REALTIME_DEMO_MARKER}%")).limit(1))
        if already_seeded:
            continue
        for scenario_index, (status, days_ago, minutes, location, latitude, longitude, coast_distance, classes, count) in enumerate(scenarios):
            started_at = now - timedelta(days=days_ago, minutes=minutes)
            ended_at = started_at + timedelta(minutes=11 + scenario_index * 7)
            session = RealtimeSession(user_id=user.id, model_id=model.id, status=status, total_events=count, started_at=started_at, ended_at=ended_at, latitude=latitude, longitude=longitude, location_name=location, location_description=f"{REALTIME_DEMO_MARKER} 실시간 탐색 화면 확인용 가상 관측 기록", coastal_eligible=True, coast_distance_m=coast_distance)
            db.add(session)
            db.flush()
            evidence_dir = storage_path(STORAGE_DIR, "realtime-evidence", f"session-{session.id}")
            evidence_dir.mkdir(parents=True, exist_ok=True)
            for event_index in range(count):
                class_name, base_confidence = classes[event_index % len(classes)]
                confidence = max(.35, min(.97, base_confidence - (event_index % 4) * .025))
                offset = (event_index % 5) * .035
                event = RealtimeEvent(session_id=session.id, class_id=event_index % len(classes), class_name=class_name, confidence=confidence, x1=.16 + offset, y1=.30 + (event_index % 3) * .04, x2=.48 + offset, y2=.58 + (event_index % 3) * .04, detected_at=started_at + timedelta(seconds=22 + event_index * 37), protected=scenario_index == 0 and event_index == 0)
                db.add(event)
                db.flush()
                if event_index < 4:
                    payload = _demo_evidence_image(class_name, confidence, scenario_index * 20 + event_index)
                    if payload:
                        evidence_path = storage_path(evidence_dir, f"event-{event.id}.jpg")
                        evidence_path.write_bytes(payload)
                        event.evidence_path = str(evidence_path)
                        event.evidence_bytes = len(payload)
            created += 1
    return created

def recover_interrupted_analyses(db: DbSession) -> list[int]:
    """Fail interrupted work and return queued work that can be resumed."""
    stale = db.scalars(select(Analysis).where(Analysis.status == "processing")).all()
    for item in stale:
        transition_analysis(item, "failed")
        item.error_code = "SERVER_RESTARTED"
        item.error_message = ANALYSIS_ERROR_MESSAGES["SERVER_RESTARTED"]
        item.completed_at = datetime.now(timezone.utc)
        cleanup_analysis_artifacts(db, item)
    resumable: list[int] = []
    queued = db.scalars(select(Analysis).where(Analysis.status == "queued").order_by(Analysis.id.asc())).all()
    for item in queued:
        model_problem = model_file_problem(item.model)
        try:
            media_path = ensure_within_storage(item.video.path, STORAGE_DIR)
            media_missing = not media_path.is_file()
        except (OSError, ValueError):
            media_missing = True
        if model_problem or media_missing:
            transition_analysis(item, "failed")
            item.error_code = "RECOVERY_INPUT_MISSING"
            item.error_message = ANALYSIS_ERROR_MESSAGES["RECOVERY_INPUT_MISSING"]
            item.completed_at = datetime.now(timezone.utc)
            cleanup_analysis_artifacts(db, item)
            if model_problem:
                quarantine_unusable_model(item.model, model_problem)
            continue
        resumable.append(item.id)
    return resumable


def normalize_analysis_records(db: DbSession) -> dict[str, int]:
    """Repair legacy or contradictory terminal analysis records in place."""
    repaired = {"cancelled": 0, "completed": 0, "invalid_completed": 0, "cleaned_terminal": 0}
    terminal = db.scalars(
        select(Analysis).where(Analysis.status.in_(("completed", "failed", "cancelled"))).order_by(Analysis.id)
    ).all()
    for item in terminal:
        if item.status == "completed":
            try:
                if not item.output_path:
                    raise ValueError("missing result path")
                validate_result_file(Path(item.output_path), analysis_media_type(item))
            except (OSError, ValueError):
                logger.warning("event=analysis_record_invalid_completed analysis_id=%s", item.id)
                item.status = "failed"
                item.progress = min(99, max(0, item.progress))
                item.error_code = "OUTPUT_CREATE_FAILED"
                item.error_message = ANALYSIS_ERROR_MESSAGES["OUTPUT_CREATE_FAILED"]
                item.completed_at = item.completed_at or datetime.now(timezone.utc)
                cleanup_analysis_artifacts(db, item)
                repaired["invalid_completed"] += 1
                continue
            changed = item.progress != 100 or item.error_code is not None or item.error_message is not None
            item.progress = 100
            item.error_code = None
            item.error_message = None
            item.completed_at = item.completed_at or datetime.now(timezone.utc)
            if changed:
                repaired["completed"] += 1
            continue

        if item.status == "failed" and item.error_code == "USER_CANCELLED":
            item.status = "cancelled"
            repaired["cancelled"] += 1

        if item.status == "cancelled":
            item.error_code = "USER_CANCELLED"
            item.error_message = ANALYSIS_ERROR_MESSAGES["USER_CANCELLED"]
        else:
            item.error_code = item.error_code if item.error_code in ANALYSIS_ERROR_MESSAGES and item.error_code != "USER_CANCELLED" else "INFERENCE_FAILED"
            item.error_message = ANALYSIS_ERROR_MESSAGES[item.error_code]
        item.completed_at = item.completed_at or datetime.now(timezone.utc)
        cleanup_analysis_artifacts(db, item)
        repaired["cleaned_terminal"] += 1

    if any(repaired.values()):
        logger.info("event=analysis_records_normalized counts=%s", repaired)
    return repaired


def initialize_app() -> list[int]:
    Base.metadata.create_all(engine)
    with engine.begin() as connection:
        columns = {row[1] for row in connection.execute(text("PRAGMA table_info(users)"))}
        if "role" not in columns:
            connection.execute(text("ALTER TABLE users ADD COLUMN role VARCHAR(20) NOT NULL DEFAULT 'user'"))
        if "active" not in columns:
            connection.execute(text("ALTER TABLE users ADD COLUMN active BOOLEAN NOT NULL DEFAULT 1"))
        model_columns = {row[1] for row in connection.execute(text("PRAGMA table_info(model_artifacts)"))}
        if "quarantined" not in model_columns:
            connection.execute(text("ALTER TABLE model_artifacts ADD COLUMN quarantined BOOLEAN NOT NULL DEFAULT 0"))
        if "quarantine_reason" not in model_columns:
            connection.execute(text("ALTER TABLE model_artifacts ADD COLUMN quarantine_reason TEXT"))
        if "quarantined_at" not in model_columns:
            connection.execute(text("ALTER TABLE model_artifacts ADD COLUMN quarantined_at DATETIME"))
        analysis_columns = {row[1] for row in connection.execute(text("PRAGMA table_info(analyses)"))}
        if "error_code" not in analysis_columns:
            connection.execute(text("ALTER TABLE analyses ADD COLUMN error_code VARCHAR(40)"))
            connection.execute(text("CREATE INDEX IF NOT EXISTS ix_analyses_error_code ON analyses (error_code)"))
        video_columns = {row[1] for row in connection.execute(text("PRAGMA table_info(video_assets)"))}
        for column, definition in {
            "latitude": "FLOAT",
            "longitude": "FLOAT",
            "captured_at": "DATETIME",
            "location_name": "VARCHAR(160)",
            "location_description": "VARCHAR(300)",
            "content_sha256": "VARCHAR(64)",
            "location_source": "VARCHAR(20)",
            "location_confirmed": "BOOLEAN NOT NULL DEFAULT 0",
            "coastal_eligible": "BOOLEAN",
            "coast_distance_m": "FLOAT",
            "coastal_reason": "VARCHAR(40)",
        }.items():
            if column not in video_columns:
                connection.execute(text(f"ALTER TABLE video_assets ADD COLUMN {column} {definition}"))
        realtime_columns = {row[1] for row in connection.execute(text("PRAGMA table_info(realtime_sessions)"))}
        for column, definition in {
            "latitude": "FLOAT",
            "longitude": "FLOAT",
            "location_name": "VARCHAR(160)",
            "location_description": "VARCHAR(300)",
            "coastal_eligible": "BOOLEAN",
            "coast_distance_m": "FLOAT",
        }.items():
            if column not in realtime_columns:
                connection.execute(text(f"ALTER TABLE realtime_sessions ADD COLUMN {column} {definition}"))
        realtime_event_columns = {row[1] for row in connection.execute(text("PRAGMA table_info(realtime_events)"))}
        for column, definition in {
            "evidence_path": "TEXT",
            "evidence_bytes": "INTEGER",
            "protected": "BOOLEAN NOT NULL DEFAULT 0",
        }.items():
            if column not in realtime_event_columns:
                connection.execute(text(f"ALTER TABLE realtime_events ADD COLUMN {column} {definition}"))
        for media_id, media_path in connection.execute(text("SELECT id, path FROM video_assets WHERE content_sha256 IS NULL")):
            try:
                source = ensure_within_storage(media_path, STORAGE_DIR)
                if not source.is_file():
                    continue
                digest = hashlib.sha256()
                with source.open("rb") as media_file:
                    for chunk in iter(lambda: media_file.read(1024 * 1024), b""):
                        digest.update(chunk)
                connection.execute(
                    text("UPDATE video_assets SET content_sha256 = :digest WHERE id = :media_id"),
                    {"digest": digest.hexdigest(), "media_id": media_id},
                )
            except (OSError, ValueError):
                logger.warning("event=media_hash_backfill_failed media_id=%s", media_id)
        for media_id, latitude, longitude in connection.execute(text(
            "SELECT id, latitude, longitude FROM video_assets "
            "WHERE location_confirmed = 1 AND latitude IS NOT NULL AND longitude IS NOT NULL AND coastal_eligible IS NULL"
        )):
            coastal = classify_coastal_location(latitude, longitude)
            connection.execute(text(
                "UPDATE video_assets SET coastal_eligible = :eligible, coast_distance_m = :distance, coastal_reason = :reason WHERE id = :media_id"
            ), {"eligible": coastal["eligible"], "distance": coastal["distance_m"], "reason": coastal["reason"], "media_id": media_id})
        inquiry_columns = {row[1] for row in connection.execute(text("PRAGMA table_info(inquiries)"))}
        if "answer_read_at" not in inquiry_columns:
            connection.execute(text("ALTER TABLE inquiries ADD COLUMN answer_read_at DATETIME"))
    for folder in ("models", "videos", "outputs", "attachments", "quarantine", "realtime-evidence"):
        (STORAGE_DIR / folder).mkdir(parents=True, exist_ok=True)
    db = SessionLocal()
    try:
        db.execute(delete(Session).where(Session.expires_at <= datetime.now(timezone.utc)))
        queued_ids = recover_interrupted_analyses(db)
        normalize_analysis_records(db)
        cleanup_orphaned_storage_files(db)
        interrupted_live_sessions = db.scalars(
            select(RealtimeSession).where(RealtimeSession.status.in_(("running", "paused")))
        ).all()
        for live_session in interrupted_live_sessions:
            live_session.status = "interrupted"
            live_session.ended_at = datetime.now(timezone.utc)
        stale = db.scalars(select(Analysis).where(Analysis.status == "processing")).all()
        for item in stale:
            item.status = "failed"
            item.error_code = "SERVER_RESTARTED"
            item.error_message = "서버가 재시작되어 분석이 중단됐습니다."
            item.completed_at = datetime.now(timezone.utc)
        legacy_cancelled = db.scalars(
            select(Analysis).where(
                Analysis.status == "failed",
                Analysis.error_message == "사용자가 분석을 중단했습니다.",
            )
        ).all()
        for item in legacy_cancelled:
            item.status = "cancelled"
            item.error_code = "USER_CANCELLED"
        legacy_failures = db.scalars(select(Analysis).where(Analysis.status == "failed", Analysis.error_code.is_(None))).all()
        for item in legacy_failures:
            if item.error_message and "모델" in item.error_message:
                item.error_code = "MODEL_LOAD_FAILED"
            elif item.error_message and "서버" in item.error_message:
                item.error_code = "SERVER_RESTARTED"
            elif item.error_message and "결과" in item.error_message:
                item.error_code = "OUTPUT_CREATE_FAILED"
            else:
                item.error_code = "INFERENCE_FAILED"
        if not db.scalar(select(func.count(User.id)).where(User.role == "admin")):
            first_user = db.scalar(select(User).order_by(User.id.asc()).limit(1))
            if first_user:
                first_user.role = "admin"
        seed_content = {
            "notice": [
                ("FloatWatch 시연 서비스 안내", "학습된 YOLO 모델과 동영상을 업로드하여 부유물 탐지 결과를 확인할 수 있습니다."),
                ("영상 분석 서비스 이용 안내", "분석 센터에서 PT 모델과 대상 영상을 등록한 뒤 분석을 시작할 수 있습니다."),
                ("지원 모델 형식 안내", "YOLOv8 및 YOLO11 기반 detection, segmentation PT 파일을 지원합니다."),
                ("분석 기록 보관 정책 안내", "완료된 분석 결과는 사용자별 탐색 기록에서 확인할 수 있습니다."),
                ("권장 영상 형식 안내", "원활한 시연을 위해 MP4 형식의 영상을 권장합니다."),
                ("CPU 분석 시간 관련 안내", "로컬 CPU 환경에서는 영상 길이와 프레임 간격에 따라 처리 시간이 달라질 수 있습니다."),
                ("신뢰도 필터 사용 안내", "최소 신뢰도 값을 조절해 표시되는 탐지 결과의 범위를 변경할 수 있습니다."),
                ("클래스 통계 제공 안내", "분석이 완료되면 탐지 개수와 클래스별 통계를 함께 제공합니다."),
                ("모델 비교 기능 안내", "동일 영상에 적용한 모델별 처리 속도와 탐지 결과를 비교할 수 있습니다."),
                ("회원 전용 기능 안내", "모델 등록, 영상 분석, 기록 조회 기능은 로그인 후 이용할 수 있습니다."),
                ("서비스 점검 안내", "안정적인 시연 환경 구성을 위해 간헐적으로 서비스 점검이 진행될 수 있습니다."),
                ("게시판 이용 수칙 안내", "개인정보와 부적절한 내용이 포함된 게시글은 관리자에 의해 제한될 수 있습니다."),
                ("결과 영상 저장 안내", "바운딩 박스 또는 세그먼트가 표시된 결과 영상을 분석 기록에서 확인할 수 있습니다."),
                ("MVP 구현 범위 안내", "현재 MVP는 보유 영상 업로드와 로컬 CPU 기반 추론에 집중합니다."),
                ("향후 관측 장비 연계 계획", "드론과 연안 CCTV 영상 연계는 향후 확장 단계에서 진행할 예정입니다."),
            ],
            "free": [
                ("부유물 탐지 테스트 영상을 공유합니다", "다양한 거리에서 촬영한 부유물 영상으로 모델별 결과를 비교해 보았습니다."),
                ("신뢰도 기준은 어느 정도가 적당할까요?", "영상 환경에 따라 적절한 신뢰도 기준이 달라지는 것 같습니다. 경험을 공유해 주세요."),
                ("긴 영상 분석 시 프레임 간격 설정", "CPU 환경에서 긴 영상을 분석할 때 사용한 프레임 간격 설정을 공유합니다."),
                ("플라스틱 병 클래스 탐지 결과", "플라스틱 병 클래스의 탐지 결과와 오탐 사례를 정리했습니다."),
                ("수면 반사광이 많은 영상 테스트", "반사광이 강한 환경에서 탐지 결과가 어떻게 달라지는지 확인했습니다."),
                ("YOLOv8과 YOLO11 처리 속도 비교", "같은 영상으로 두 모델의 처리 속도와 탐지 수를 비교했습니다."),
                ("세그먼트 모델 결과 확인 후기", "박스 모델과 비교해 객체 형태를 확인하기 편리했습니다."),
                ("야간 촬영 영상 분석 경험", "조도가 낮은 영상에서 신뢰도 값을 조절하며 테스트한 결과입니다."),
                ("영상 해상도에 따른 차이가 있나요?", "해상도를 낮춘 영상과 원본 영상의 분석 차이가 궁금합니다."),
                ("부표와 쓰레기 분류 기준 공유", "유실 부표와 일반 부유 쓰레기의 라벨링 기준에 대해 의견을 나누고 싶습니다."),
                ("분석 결과 영상 활용 방법", "결과 영상을 발표 자료에 활용하면서 유용했던 방법을 공유합니다."),
                ("클래스별 탐지 통계 확인 후기", "영상 전체를 다시 확인하지 않아도 클래스 분포를 파악할 수 있어 편리했습니다."),
                ("오탐이 많은 구간을 찾는 방법", "탐지 결과 영상과 프레임 지표를 함께 확인하는 방법을 정리했습니다."),
                ("짧은 시연 영상 제작 팁", "시연용 영상은 탐지 대상이 명확한 구간을 중심으로 구성하는 것이 좋았습니다."),
                ("다음 기능으로 무엇이 필요할까요?", "지도 연계와 실시간 영상 입력 중 어떤 기능이 우선인지 의견을 듣고 싶습니다."),
            ],
            "bug": [
                ("[확인 중] 동영상 분석 진행률이 50%에서 멈춥니다", "MP4 동영상을 등록하고 분석을 시작하면 진행률이 50%까지 올라간 뒤 더 이상 변경되지 않습니다. 새로고침 후에도 같은 상태가 유지됩니다. 분석이 계속 진행 중인지 또는 실패했는지 명확한 안내가 필요합니다."),
                ("[재현 요청] 웹캠 권한 허용 후 화면이 검게 표시됩니다", "실시간 탐색에서 카메라 연결을 누르고 브라우저 권한을 허용했지만 미리보기 화면이 검게 표시됩니다. 카메라를 사용하는 다른 프로그램은 종료한 상태입니다. 카메라 장치 선택이나 재연결 기능이 있으면 좋겠습니다."),
                ("[해결] 탐색 기록의 더보기 메뉴가 깜빡입니다", "탐색 기록 목록에서 더보기 버튼을 누르면 메뉴가 잠깐 나타났다가 사라지는 현상이 있었습니다. 마우스를 메뉴 방향으로 이동할 때도 안정적으로 유지되어야 합니다."),
                ("[확인 중] 분석 완료 후 결과 화면으로 전환되지 않습니다", "이미지 분석 진행률이 100%로 표시되었지만 결과 이미지와 클래스별 신뢰도 영역이 나타나지 않았습니다. 탐색 기록에서는 완료된 결과를 확인할 수 있었습니다."),
                ("[재현 요청] 모델 선택 목록에 삭제한 모델이 남아 있습니다", "모델 관리에서 모델을 삭제한 직후 실시간 탐색의 모델 선택 목록을 열면 삭제한 모델이 잠시 표시됩니다. 관리 모달을 닫는 즉시 최신 목록이 반영되면 좋겠습니다."),
                ("[확인 중] 주소 검색 결과를 선택해도 지도 위치가 이동하지 않습니다", "미디어 촬영 위치 설정에서 주소를 검색한 뒤 결과를 선택했지만 지도 중심과 마커가 기존 위치에 남아 있었습니다. 선택한 주소와 지도 위치가 함께 변경되어야 합니다."),
                ("[해결] 로그인 패널을 닫을 때 우측 배경이 겹쳐 보입니다", "로그인 또는 마이페이지 패널을 닫는 애니메이션 중 우측에 배경 이미지 일부가 별도 영역처럼 보였습니다. 패널이 완전히 닫힐 때까지 배경이 자연스럽게 이어져야 합니다."),
                ("[확인 중] 긴 파일명이 탐색 기록 목록 밖으로 넘어갑니다", "이름이 긴 동영상 파일을 분석한 뒤 탐색 기록을 확인하면 파일명이 날짜 영역까지 침범합니다. 일정 길이 이후에는 말줄임표로 표시하고 전체 이름은 도움말로 확인할 수 있으면 좋겠습니다."),
                ("[재현 요청] 분석 중단 후 같은 파일을 다시 분석할 수 없습니다", "분석 중단 버튼으로 작업을 취소한 뒤 동일한 영상과 모델을 선택해 다시 시작하면 이전 작업 상태가 남아 실행되지 않는 경우가 있습니다. 중단된 작업과 새로운 작업이 분리되어야 합니다."),
                ("[확인 중] 결과 영상 다운로드 버튼이 반응하지 않습니다", "동영상 분석 완료 후 탐색 기록에서 결과 다운로드 버튼을 눌렀지만 파일 저장이 시작되지 않았습니다. 이미지 결과 다운로드는 정상적으로 동작했습니다."),
                ("[해결] 클래스별 신뢰도 목록 높이가 결과 이미지와 맞지 않습니다", "탐색 기록 상세 화면에서 클래스별 신뢰도 카드가 결과 이미지보다 짧게 표시되어 화면 균형이 맞지 않았습니다. 두 영역의 하단선이 같은 위치에 오도록 조정이 필요했습니다."),
                ("[확인 중] 모바일 화면에서 챗봇 도움말 버튼이 겹칩니다", "화면 폭이 좁은 모바일 환경에서 챗봇의 빠른 질문 버튼이 입력창 위로 겹쳐 보입니다. 버튼이 두 열 또는 한 열로 자연스럽게 재배치되어야 합니다."),
                ("[재현 요청] 탐색 기록 필터가 페이지 이동 후 초기화됩니다", "실패 기록만 보도록 필터를 선택한 뒤 상세 기록을 열고 목록으로 돌아오면 필터가 전체로 바뀝니다. 이전 검색어와 필터 상태가 유지되면 좋겠습니다."),
                ("[확인 중] 같은 미디어가 여러 번 등록됩니다", "업로드 버튼을 빠르게 두 번 누르면 동일한 파일이 목록에 중복 등록되는 경우가 있습니다. 업로드 처리 중에는 버튼을 비활성화하고 중복 요청을 막아야 합니다."),
                ("[재현 요청] 브라우저 뒤로가기 후 열린 패널이 남아 있습니다", "마이페이지 패널을 연 상태에서 브라우저 뒤로가기를 누르면 주소는 변경되지만 패널이 화면에 남는 경우가 있습니다. 화면 이동 시 열린 패널과 모달이 함께 정리되어야 합니다."),
            ],
            "faq": [
                ("어떤 모델 파일을 사용할 수 있나요?", "Ultralytics YOLOv8 또는 YOLO11 기반 detection, segmentation PT 파일을 지원합니다."),
                ("mAP와 Precision은 왜 표시되지 않나요?", "정확도 지표 계산에는 정답 라벨이 있는 검증 데이터셋이 필요합니다. 라벨 없는 영상에서는 탐지 수, 평균 신뢰도, 처리 속도를 제공합니다."),
                ("AI 모델을 이 서비스에서 학습할 수 있나요?", "현재 MVP는 AI 학습을 제공하지 않으며 외부에서 학습한 PT 모델의 영상 추론과 성능 확인에 집중합니다."),
                ("어떤 영상 파일을 업로드할 수 있나요?", "시연 환경에서는 MP4 형식 사용을 권장합니다."),
                ("분석은 GPU 없이도 가능한가요?", "가능합니다. 현재 환경은 CPU 추론을 기준으로 구성되어 처리 시간이 더 길 수 있습니다."),
                ("신뢰도 값은 무엇인가요?", "모델이 탐지 결과를 얼마나 확신하는지 나타내는 값으로, 기준을 높이면 더 확실한 결과만 표시됩니다."),
                ("프레임 간격은 왜 조절하나요?", "일부 프레임을 건너뛰어 처리하면 분석 시간을 줄일 수 있습니다."),
                ("박스와 세그먼트 모델의 차이는 무엇인가요?", "박스 모델은 사각 영역으로, 세그먼트 모델은 객체의 형태를 따라 탐지 결과를 표시합니다."),
                ("분석 결과는 어디에서 확인하나요?", "탐색 기록에서 결과 영상, 탐지 개수, 클래스 통계와 처리 지표를 확인할 수 있습니다."),
                ("여러 모델의 성능을 비교할 수 있나요?", "동일한 영상으로 실행한 분석 기록을 AI 성능 비교 화면에서 비교할 수 있습니다."),
                ("업로드한 모델은 다른 사용자에게 보이나요?", "모델과 분석 기록은 등록한 사용자의 계정에 귀속됩니다."),
                ("분석 도중 브라우저를 닫아도 되나요?", "백엔드 작업이 계속 실행되는 동안 다시 접속해 진행 상태를 확인할 수 있습니다."),
                ("탐지 클래스 이름은 어디에서 가져오나요?", "PT 모델 내부에 저장된 클래스 정보를 불러와 통계와 결과 화면에 사용합니다."),
                ("실시간 CCTV 분석을 지원하나요?", "현재 MVP에서는 지원하지 않으며 드론과 연안 CCTV 연계는 향후 확장 목표입니다."),
                ("문의는 어디에서 남길 수 있나요?", "로그인 후 마이페이지의 1대1 문의 메뉴에서 비공개 문의를 등록할 수 있습니다."),
            ],
        }
        for category, candidates in seed_content.items():
            existing = set(db.scalars(select(ContentItem.title).where(ContentItem.category == category)).all())
            count = len(existing)
            for title, content in candidates:
                if count >= 15:
                    break
                if title in existing:
                    continue
                db.add(ContentItem(category=category, title=title, content=content, pinned=category in {"notice", "faq"} and count < 2))
                existing.add(title)
                count += 1
        seed_realtime_demo(db)
        db.commit()
        return queued_ids
    finally:
        db.close()


@asynccontextmanager
async def lifespan(_app: FastAPI):
    for analysis_id in initialize_app():
        enqueue_analysis(analysis_id)
    try:
        yield
    finally:
        analysis_executor.shutdown(wait=False, cancel_futures=True)


app = FastAPI(title="FloatWatch API", version="0.1.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[FRONTEND_ORIGIN],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def current_user(
    floatwatch_session: str | None = Cookie(default=None),
    db: DbSession = Depends(get_db),
) -> User:
    if not floatwatch_session:
        raise HTTPException(401, "로그인이 필요합니다.")
    session = db.scalar(select(Session).where(Session.token_hash == token_digest(floatwatch_session)))
    now = datetime.now(timezone.utc)
    if not session:
        raise HTTPException(401, "세션이 만료되었습니다.")
    if session.expires_at.replace(tzinfo=timezone.utc) <= now:
        db.delete(session)
        db.commit()
        raise HTTPException(401, "세션이 만료되었습니다.")
    user = db.get(User, session.user_id)
    if not user or not user.active:
        db.delete(session)
        db.commit()
        raise HTTPException(401, "사용자를 찾을 수 없습니다.")
    return user


def admin_user(user: User = Depends(current_user)) -> User:
    if user.role != "admin":
        raise HTTPException(403, "관리자 권한이 필요합니다.")
    return user


def set_session_cookie(response: Response, db: DbSession, user: User) -> None:
    token, digest, expires_at = new_session_token()
    db.add(Session(token_hash=digest, user_id=user.id, expires_at=expires_at))
    db.commit()
    response.set_cookie(
        COOKIE_NAME,
        token,
        httponly=True,
        samesite="lax",
        secure=False,
        max_age=7 * 24 * 60 * 60,
    )


async def save_upload(upload: UploadFile, target: Path, max_bytes: int) -> int:
    size = 0
    target.parent.mkdir(parents=True, exist_ok=True)
    try:
        ensure_disk_capacity(target, min(max_bytes, 1024 * 1024), MIN_FREE_DISK_BYTES)
        with target.open("wb") as output:
            while chunk := await upload.read(1024 * 1024):
                size += len(chunk)
                if size > max_bytes:
                    raise HTTPException(413, "허용된 파일 크기를 초과했습니다.")
                ensure_disk_capacity(target, len(chunk), MIN_FREE_DISK_BYTES)
                output.write(chunk)
    except InsufficientStorageError as exc:
        target.unlink(missing_ok=True)
        raise HTTPException(507, "디스크 여유 공간이 부족해 파일을 저장할 수 없습니다.") from exc
    except Exception:
        target.unlink(missing_ok=True)
        raise
    if size == 0:
        target.unlink(missing_ok=True)
        raise HTTPException(400, "빈 파일은 업로드할 수 없습니다.")
    return size


def remaining_user_storage(db: DbSession, user_id: int) -> int:
    model_bytes = db.scalar(select(func.coalesce(func.sum(ModelArtifact.size_bytes), 0)).where(ModelArtifact.user_id == user_id)) or 0
    media_bytes = db.scalar(select(func.coalesce(func.sum(VideoAsset.size_bytes), 0)).where(VideoAsset.user_id == user_id)) or 0
    return max(0, USER_STORAGE_LIMIT - int(model_bytes) - int(media_bytes))


def upload_limit(db: DbSession, user_id: int, per_file_limit: int) -> int:
    remaining = remaining_user_storage(db, user_id)
    if remaining <= 0:
        raise HTTPException(413, "사용자 저장공간 한도를 초과했습니다. 기존 파일을 삭제해 주세요.")
    return min(per_file_limit, remaining)


def analysis_file_paths(item: Analysis) -> set[Path]:
    """Return every final or partial result path owned by an analysis."""
    paths = {
        storage_path(STORAGE_DIR, "outputs", f"analysis-{item.id}.jpg"),
        storage_path(STORAGE_DIR, "outputs", f"analysis-{item.id}.mp4"),
        storage_path(STORAGE_DIR, "outputs", f"analysis-{item.id}-working.mp4"),
    }
    if item.output_path:
        paths.add(ensure_within_storage(item.output_path, STORAGE_DIR))
    return paths


def delete_analysis_files(item: Analysis) -> None:
    for path in analysis_file_paths(item):
        safe_unlink(path, STORAGE_DIR)


def unlink_after_commit(paths: set[Path]) -> None:
    """Best-effort filesystem cleanup after the database no longer references files."""
    for path in paths:
        try:
            safe_unlink(path, STORAGE_DIR)
        except (OSError, ValueError):
            logger.exception("event=storage_delete_failed path=%s", path)


def cleanup_orphaned_storage_files(db: DbSession, *, grace_seconds: int | None = None) -> int:
    """Remove old managed files that no database record or active analysis owns."""
    grace = ORPHAN_FILE_GRACE_SECONDS if grace_seconds is None else max(0, grace_seconds)
    referenced: set[Path] = set()
    for value in db.scalars(select(ModelArtifact.path)).all():
        try:
            referenced.add(ensure_within_storage(value, STORAGE_DIR))
        except ValueError:
            logger.warning("event=unsafe_model_path_ignored path=%s", value)
    for value in db.scalars(select(VideoAsset.path)).all():
        try:
            referenced.add(ensure_within_storage(value, STORAGE_DIR))
        except ValueError:
            logger.warning("event=unsafe_media_path_ignored path=%s", value)
    analyses = db.scalars(select(Analysis)).all()
    for item in analyses:
        try:
            if item.output_path:
                referenced.add(ensure_within_storage(item.output_path, STORAGE_DIR))
            if item.status in {"queued", "processing"}:
                referenced.update(analysis_file_paths(item))
        except ValueError:
            logger.warning("event=unsafe_analysis_path_ignored analysis_id=%s", item.id)

    cutoff = datetime.now(timezone.utc).timestamp() - grace
    removed = 0
    for folder_name in ("models", "videos", "outputs", "quarantine"):
        folder = storage_path(STORAGE_DIR, folder_name)
        if not folder.exists():
            continue
        for candidate in folder.rglob("*"):
            if not candidate.is_file():
                continue
            safe_candidate = ensure_within_storage(candidate, STORAGE_DIR)
            if safe_candidate in referenced or safe_candidate.stat().st_mtime > cutoff:
                continue
            safe_candidate.unlink(missing_ok=True)
            removed += 1
    if removed:
        logger.info("event=orphan_storage_cleaned removed=%s", removed)
    return removed


def user_auth_provider(db: DbSession, user_id: int) -> str:
    identity = db.scalar(select(OAuthIdentity).where(OAuthIdentity.user_id == user_id).order_by(OAuthIdentity.id.asc()))
    return identity.provider if identity else "password"


def user_owned_paths(db: DbSession, user_id: int) -> list[Path]:
    paths = [Path(value) for value in db.scalars(select(ModelArtifact.path).where(ModelArtifact.user_id == user_id)).all()]
    paths.extend(Path(value) for value in db.scalars(select(VideoAsset.path).where(VideoAsset.user_id == user_id)).all())
    paths.extend(
        Path(value)
        for value in db.scalars(
            select(Analysis.output_path).where(Analysis.user_id == user_id, Analysis.output_path.is_not(None))
        ).all()
        if value
    )
    inquiry_files = db.scalars(
        select(InquiryAttachment.stored_name)
        .join(Inquiry, InquiryAttachment.inquiry_id == Inquiry.id)
        .where(Inquiry.user_id == user_id)
    ).all()
    paths.extend(storage_path(STORAGE_DIR, "attachments", value) for value in inquiry_files)
    return paths


def model_json(item: ModelArtifact) -> dict:
    return {
        "id": item.id, "name": item.name, "original_name": item.original_name,
        "size_bytes": item.size_bytes, "task": item.task,
        "class_names": json.loads(item.class_names_json) if item.class_names_json else [],
        "quarantined": item.quarantined,
        "quarantine_reason": item.quarantine_reason,
        "quarantined_at": item.quarantined_at,
        "created_at": item.created_at,
    }


def video_json(item: VideoAsset) -> dict:
    media_type = "image" if Path(item.path).suffix.lower() in {".jpg", ".jpeg", ".png", ".webp", ".bmp"} else "video"
    return {
        "id": item.id, "name": item.name, "size_bytes": item.size_bytes,
        "duration_seconds": item.duration_seconds, "fps": item.fps,
        "frame_count": item.frame_count, "created_at": item.created_at, "media_type": media_type,
        "latitude": item.latitude, "longitude": item.longitude,
        "captured_at": item.captured_at, "location_name": item.location_name, "location_description": item.location_description,
        "location_source": item.location_source, "location_confirmed": item.location_confirmed,
        "coastal_eligible": item.coastal_eligible, "coast_distance_m": item.coast_distance_m,
        "coastal_reason": item.coastal_reason,
        "content_sha256": item.content_sha256,
    }


def analysis_json(item: Analysis, detail: bool = False) -> dict:
    public_status = "cancelled" if item.status == "failed" and item.error_code == "USER_CANCELLED" else item.status
    data = {
        "id": item.id, "status": public_status, "confidence": item.confidence,
        "frame_stride": item.frame_stride, "progress": item.progress,
        "total_detections": item.total_detections, "processed_frames": item.processed_frames,
        "avg_confidence": item.avg_confidence, "processing_fps": item.processing_fps,
        "error_code": item.error_code, "error_message": item.error_message, "created_at": item.created_at,
        "completed_at": item.completed_at,
        "model": model_json(item.model), "video": video_json(item.video),
        "output_url": f"/analyses/{item.id}/output" if item.output_path else None,
    }
    if detail:
        data["class_stats"] = [
            {"class_id": stat.class_id, "class_name": stat.class_name, "count": stat.count,
             "avg_confidence": stat.avg_confidence}
            for stat in sorted(item.class_stats, key=lambda row: row.count, reverse=True)
        ]
        data["frame_metrics"] = [
            {"frame_number": metric.frame_number, "timestamp_seconds": metric.timestamp_seconds,
             "detection_count": metric.detection_count, "avg_confidence": metric.avg_confidence,
             "has_masks": metric.has_masks}
            for metric in sorted(item.frame_metrics, key=lambda row: row.frame_number)
        ]
    return data


def content_json(item: ContentItem) -> dict:
    return {
        "id": item.id, "category": item.category, "title": item.title, "content": item.content,
        "pinned": item.pinned, "views": item.views, "created_at": item.created_at,
        "updated_at": item.updated_at,
        "author": {"id": item.author.id, "name": item.author.name} if item.author else None,
        "attachments": [{"id": row.id, "name": row.original_name, "size_bytes": row.size_bytes, "url": f"/attachments/{row.id}"} for row in item.attachments],
        "comments": [{"id": row.id, "content": row.content, "created_at": row.created_at, "author": {"id": row.author.id, "name": row.author.name} if row.author else None} for row in sorted(item.comments, key=lambda value: value.id)],
    }


def utc_timestamp(value: datetime | None) -> float | None:
    if value is None:
        return None
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.timestamp()


def inquiry_json(item: Inquiry) -> dict:
    answered_at = utc_timestamp(item.answered_at)
    answer_read_at = utc_timestamp(item.answer_read_at)
    return {
        "id": item.id, "title": item.title, "content": item.content, "status": item.status,
        "answer": item.answer, "answered_at": item.answered_at, "answer_read_at": item.answer_read_at,
        "has_new_answer": bool(item.answer and answered_at is not None and (answer_read_at is None or answer_read_at < answered_at)),
        "created_at": item.created_at,
        "user": {"id": item.user.id, "name": item.user.name, "email": item.user.email},
        "attachments": [{"id": row.id, "name": row.original_name, "size_bytes": row.size_bytes, "url": f"/inquiry-attachments/{row.id}"} for row in item.attachments],
    }


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


@app.get("/content")
def list_content(
    category: str,
    q: str | None = Query(default=None, max_length=100),
    db: DbSession = Depends(get_db),
) -> list[dict]:
    if category not in {"free", "bug", "notice", "faq"}:
        raise HTTPException(400, "지원하지 않는 게시판입니다.")
    query = select(ContentItem).where(ContentItem.category == category)
    keyword = q.strip() if q else ""
    if keyword:
        pattern = f"%{keyword}%"
        query = query.where(ContentItem.title.ilike(pattern) | ContentItem.content.ilike(pattern))
    items = db.scalars(query.order_by(ContentItem.pinned.desc(), ContentItem.updated_at.desc(), ContentItem.id.desc())).all()
    return [content_json(item) for item in items]


@app.get("/attachments/{attachment_id}")
def download_attachment(attachment_id: int, db: DbSession = Depends(get_db)) -> FileResponse:
    attachment = db.get(ContentAttachment, attachment_id)
    if not attachment:
        raise HTTPException(404, "첨부파일을 찾을 수 없습니다.")
    path = storage_path(STORAGE_DIR, "attachments", attachment.stored_name)
    if not path.exists():
        raise HTTPException(404, "첨부파일이 존재하지 않습니다.")
    return FileResponse(path, filename=attachment.original_name)


@app.post("/content/{content_id}/attachments", status_code=201)
async def upload_content_attachment(content_id: int, file: UploadFile = File(...), user: User = Depends(current_user), db: DbSession = Depends(get_db)) -> dict:
    item = db.get(ContentItem, content_id)
    if not item:
        raise HTTPException(404, "게시글을 찾을 수 없습니다.")
    if user.role != "admin" and item.author_id != user.id:
        raise HTTPException(403, "첨부파일을 등록할 권한이 없습니다.")
    original_name = normalize_upload_name(file.filename, "attachment")
    suffix = Path(original_name).suffix.lower()[:12]
    stored_name = f"{uuid.uuid4().hex}{suffix}"
    size = await save_upload(file, storage_path(STORAGE_DIR, "attachments", stored_name), MAX_ATTACHMENT_SIZE)
    attachment = ContentAttachment(content_id=item.id, original_name=original_name, stored_name=stored_name, size_bytes=size)
    db.add(attachment)
    db.commit()
    db.refresh(attachment)
    return {"id": attachment.id, "name": attachment.original_name, "size_bytes": attachment.size_bytes, "url": f"/attachments/{attachment.id}"}


@app.delete("/attachments/{attachment_id}", status_code=204)
def delete_attachment(attachment_id: int, user: User = Depends(current_user), db: DbSession = Depends(get_db)) -> Response:
    attachment = db.get(ContentAttachment, attachment_id)
    if not attachment:
        raise HTTPException(404, "첨부파일을 찾을 수 없습니다.")
    item = attachment.content_item
    if user.role != "admin" and item.author_id != user.id:
        raise HTTPException(403, "첨부파일을 삭제할 권한이 없습니다.")
    path = storage_path(STORAGE_DIR, "attachments", attachment.stored_name)
    safe_unlink(path, STORAGE_DIR)
    db.delete(attachment)
    db.commit()
    return Response(status_code=204)


@app.post("/content/{content_id}/comments", status_code=201)
def create_comment(content_id: int, body: CommentCreate, user: User = Depends(current_user), db: DbSession = Depends(get_db)) -> dict:
    item = db.get(ContentItem, content_id)
    if not item:
        raise HTTPException(404, "게시글을 찾을 수 없습니다.")
    if item.category not in {"free", "bug"}:
        raise HTTPException(400, "댓글을 지원하지 않는 게시판입니다.")
    comment = ContentComment(content_id=item.id, author_id=user.id, content=body.content.strip())
    db.add(comment)
    db.commit()
    db.refresh(comment)
    return {"id": comment.id, "content": comment.content, "created_at": comment.created_at, "author": {"id": user.id, "name": user.name}}


@app.delete("/comments/{comment_id}", status_code=204)
def delete_comment(comment_id: int, user: User = Depends(current_user), db: DbSession = Depends(get_db)) -> Response:
    comment = db.get(ContentComment, comment_id)
    if not comment:
        raise HTTPException(404, "댓글을 찾을 수 없습니다.")
    if user.role != "admin" and comment.author_id != user.id:
        raise HTTPException(403, "댓글을 삭제할 권한이 없습니다.")
    db.delete(comment)
    db.commit()
    return Response(status_code=204)


@app.get("/content/{content_id}")
def get_content(content_id: int, db: DbSession = Depends(get_db)) -> dict:
    item = db.get(ContentItem, content_id)
    if not item:
        raise HTTPException(404, "게시글을 찾을 수 없습니다.")
    item.views += 1
    db.commit()
    return content_json(item)


@app.post("/content", status_code=201)
def create_content(body: ContentCreate, user: User = Depends(current_user), db: DbSession = Depends(get_db)) -> dict:
    if body.category not in {"free", "bug"} and user.role != "admin":
        raise HTTPException(403, "공지사항과 FAQ는 관리자만 작성할 수 있습니다.")
    item = ContentItem(
        author_id=user.id, category=body.category, title=body.title.strip(), content=body.content.strip(),
        pinned=body.pinned if user.role == "admin" else False,
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return content_json(item)


@app.patch("/content/{content_id}")
def update_content(content_id: int, body: ContentUpdate, reason: str | None = Query(default=None, max_length=500), user: User = Depends(current_user), db: DbSession = Depends(get_db)) -> dict:
    item = db.get(ContentItem, content_id)
    if not item:
        raise HTTPException(404, "게시글을 찾을 수 없습니다.")
    if user.role != "admin" and item.author_id != user.id:
        raise HTTPException(403, "게시글을 수정할 권한이 없습니다.")
    before = {"title": item.title, "content": item.content, "pinned": item.pinned}
    for field, value in body.model_dump(exclude_unset=True).items():
        if field == "pinned" and user.role != "admin":
            continue
        setattr(item, field, value.strip() if isinstance(value, str) else value)
    if user.role == "admin":
        add_audit_log(
            db, user, action="content.update", target_type="content", target_id=item.id,
            target_label=item.title, reason=reason or "관리자 게시글 수정",
            before=before, after={"title": item.title, "content": item.content, "pinned": item.pinned},
        )
    db.commit()
    return content_json(item)


@app.delete("/content/{content_id}", status_code=204)
def delete_content(content_id: int, reason: str | None = Query(default=None, max_length=500), user: User = Depends(current_user), db: DbSession = Depends(get_db)) -> Response:
    item = db.get(ContentItem, content_id)
    if not item:
        raise HTTPException(404, "게시글을 찾을 수 없습니다.")
    if user.role != "admin" and item.author_id != user.id:
        raise HTTPException(403, "게시글을 삭제할 권한이 없습니다.")
    for attachment in item.attachments:
        safe_unlink(storage_path(STORAGE_DIR, "attachments", attachment.stored_name), STORAGE_DIR)
    if user.role == "admin":
        add_audit_log(
            db, user, action="content.delete", target_type="content", target_id=item.id,
            target_label=item.title, reason=reason or "관리자 게시글 삭제",
            before={"category": item.category, "title": item.title, "pinned": item.pinned},
        )
    db.delete(item)
    db.commit()
    return Response(status_code=204)


@app.get("/inquiries")
def list_inquiries(user: User = Depends(current_user), db: DbSession = Depends(get_db)) -> list[dict]:
    query = select(Inquiry)
    if user.role != "admin":
        query = query.where(Inquiry.user_id == user.id)
    items = db.scalars(query.order_by(Inquiry.id.desc())).all()
    return [inquiry_json(item) for item in items]


def accessible_inquiry(inquiry_id: int, user: User, db: DbSession) -> Inquiry:
    query = select(Inquiry).where(Inquiry.id == inquiry_id)
    if user.role != "admin":
        query = query.where(Inquiry.user_id == user.id)
    item = db.scalar(query)
    if not item:
        raise HTTPException(404, "문의를 찾을 수 없습니다.")
    return item


@app.get("/inquiries/{inquiry_id}")
def get_inquiry(inquiry_id: int, user: User = Depends(current_user), db: DbSession = Depends(get_db)) -> dict:
    return inquiry_json(accessible_inquiry(inquiry_id, user, db))


@app.patch("/inquiries/{inquiry_id}/read")
def read_inquiry_answer(inquiry_id: int, user: User = Depends(current_user), db: DbSession = Depends(get_db)) -> dict:
    item = accessible_inquiry(inquiry_id, user, db)
    if user.role != "admin" and item.answer:
        item.answer_read_at = datetime.now(timezone.utc)
        db.commit()
    return inquiry_json(item)


@app.post("/inquiries", status_code=201)
def create_inquiry(body: InquiryCreate, user: User = Depends(current_user), db: DbSession = Depends(get_db)) -> dict:
    item = Inquiry(user_id=user.id, title=body.title.strip(), content=body.content.strip())
    db.add(item)
    db.commit()
    db.refresh(item)
    return inquiry_json(item)


@app.post("/inquiries/{inquiry_id}/attachments", status_code=201)
async def upload_inquiry_attachment(inquiry_id: int, file: UploadFile = File(...), user: User = Depends(current_user), db: DbSession = Depends(get_db)) -> dict:
    item = accessible_inquiry(inquiry_id, user, db)
    original_name = normalize_upload_name(file.filename, "attachment")
    suffix = Path(original_name).suffix.lower()[:12]
    stored_name = f"inquiry-{uuid.uuid4().hex}{suffix}"
    size = await save_upload(file, storage_path(STORAGE_DIR, "attachments", stored_name), MAX_ATTACHMENT_SIZE)
    attachment = InquiryAttachment(inquiry_id=item.id, original_name=original_name, stored_name=stored_name, size_bytes=size)
    db.add(attachment)
    db.commit()
    db.refresh(attachment)
    return {"id": attachment.id, "name": attachment.original_name, "size_bytes": attachment.size_bytes, "url": f"/inquiry-attachments/{attachment.id}"}


@app.get("/inquiry-attachments/{attachment_id}")
def download_inquiry_attachment(attachment_id: int, user: User = Depends(current_user), db: DbSession = Depends(get_db)) -> FileResponse:
    query = select(InquiryAttachment).where(InquiryAttachment.id == attachment_id)
    if user.role != "admin":
        query = query.join(Inquiry).where(Inquiry.user_id == user.id)
    attachment = db.scalar(query)
    if not attachment:
        raise HTTPException(404, "첨부파일을 찾을 수 없습니다.")
    path = storage_path(STORAGE_DIR, "attachments", attachment.stored_name)
    if not path.exists():
        raise HTTPException(404, "첨부파일이 존재하지 않습니다.")
    return FileResponse(path, filename=attachment.original_name)


@app.patch("/inquiries/{inquiry_id}/answer")
def answer_inquiry(inquiry_id: int, body: InquiryAnswer, _admin: User = Depends(admin_user), db: DbSession = Depends(get_db)) -> dict:
    item = db.get(Inquiry, inquiry_id)
    if not item:
        raise HTTPException(404, "문의를 찾을 수 없습니다.")
    before = {"status": item.status, "answer": item.answer}
    item.answer = body.answer.strip()
    item.status = "answered"
    item.answered_at = datetime.now(timezone.utc)
    item.answer_read_at = None
    add_audit_log(
        db, _admin, action="inquiry.answer", target_type="inquiry", target_id=item.id,
        target_label=item.title, reason=body.reason,
        before=before, after={"status": item.status, "answer": item.answer},
    )
    db.commit()
    return inquiry_json(item)


@app.get("/admin/users")
def admin_list_users(_admin: User = Depends(admin_user), db: DbSession = Depends(get_db)) -> list[dict]:
    users = db.scalars(select(User).order_by(User.id.desc())).all()
    return [{"id": user.id, "name": user.name, "email": user.email, "role": user.role, "active": user.active, "created_at": user.created_at} for user in users]


@app.get("/admin/users-page")
def admin_users_page(
    page: int = Query(default=1, ge=1), page_size: int = Query(default=10, ge=1, le=100),
    _admin: User = Depends(admin_user), db: DbSession = Depends(get_db),
) -> dict:
    total = db.scalar(select(func.count(User.id))) or 0
    items = db.scalars(select(User).order_by(User.id.desc()).offset((page - 1) * page_size).limit(page_size)).all()
    return {"items": [{"id": item.id, "name": item.name, "email": item.email, "role": item.role, "active": item.active, "created_at": item.created_at} for item in items], "total": total, "page": page, "page_size": page_size, "pages": max(1, (total + page_size - 1) // page_size)}


@app.patch("/admin/users/{user_id}")
def admin_update_user(user_id: int, body: UserAdminUpdate, admin: User = Depends(admin_user), db: DbSession = Depends(get_db)) -> dict:
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(404, "회원을 찾을 수 없습니다.")
    if user.id == admin.id and (body.active is False or body.role == "user"):
        raise HTTPException(400, "현재 관리자 자신의 권한은 해제할 수 없습니다.")
    before = {"role": user.role, "active": user.active}
    for field, value in body.model_dump(exclude_unset=True, exclude={"reason"}).items():
        setattr(user, field, value)
    after = {"role": user.role, "active": user.active}
    if before == after:
        raise HTTPException(400, "변경된 회원 정보가 없습니다.")
    add_audit_log(
        db, admin, action="user.update", target_type="user", target_id=user.id,
        target_label=f"{user.name} ({user.email})", reason=body.reason, before=before, after=after,
    )
    if before["active"] and not after["active"]:
        db.execute(delete(Session).where(Session.user_id == user.id))
    db.commit()
    return {"id": user.id, "name": user.name, "email": user.email, "role": user.role, "active": user.active, "created_at": user.created_at}


@app.get("/admin/analyses")
def admin_list_analyses(_admin: User = Depends(admin_user), db: DbSession = Depends(get_db)) -> list[dict]:
    items = db.scalars(select(Analysis).order_by(Analysis.id.desc())).all()
    return [{**analysis_json(item, detail=True), "owner": {"id": item.user_id, "name": db.get(User, item.user_id).name}} for item in items]


@app.get("/admin/analyses-page")
def admin_analyses_page(
    page: int = Query(default=1, ge=1), page_size: int = Query(default=10, ge=1, le=100),
    status: str = Query(default="all", pattern="^(all|active|completed|failed|cancelled)$"),
    _admin: User = Depends(admin_user), db: DbSession = Depends(get_db),
) -> dict:
    cancelled_condition = (Analysis.status == "cancelled") | ((Analysis.status == "failed") & (Analysis.error_code == "USER_CANCELLED"))
    failed_condition = (Analysis.status == "failed") & ((Analysis.error_code.is_(None)) | (Analysis.error_code != "USER_CANCELLED"))
    active_condition = Analysis.status.in_(["queued", "processing"])
    conditions = {"active": active_condition, "completed": Analysis.status == "completed", "failed": failed_condition, "cancelled": cancelled_condition}
    query = select(Analysis)
    count_query = select(func.count(Analysis.id))
    if status != "all":
        query = query.where(conditions[status])
        count_query = count_query.where(conditions[status])
    total = db.scalar(count_query) or 0
    items = db.scalars(query.order_by(Analysis.id.desc()).offset((page - 1) * page_size).limit(page_size)).all()
    count = lambda condition: db.scalar(select(func.count(Analysis.id)).where(condition)) or 0
    counts = {"all": count(Analysis.id > 0), "active": count(active_condition), "completed": count(Analysis.status == "completed"), "failed": count(failed_condition), "cancelled": count(cancelled_condition)}
    return {"items": [{**analysis_json(item, detail=True), "owner": {"id": item.user_id, "name": (db.get(User, item.user_id).name if db.get(User, item.user_id) else "탈퇴한 사용자")}} for item in items], "total": total, "page": page, "page_size": page_size, "pages": max(1, (total + page_size - 1) // page_size), "counts": counts}


@app.get("/admin/realtime-sessions")
def admin_list_realtime_sessions(_admin: User = Depends(admin_user), db: DbSession = Depends(get_db)) -> list[dict]:
    items = db.scalars(select(RealtimeSession).order_by(RealtimeSession.id.desc())).all()
    return [
        {**realtime_session_json(item, include_events=True), "owner": {"id": item.user_id, "name": db.get(User, item.user_id).name}}
        for item in items
    ]


@app.delete("/admin/analyses/{analysis_id}", status_code=204)
def admin_delete_analysis(analysis_id: int, reason: str = Query(min_length=2, max_length=500), _admin: User = Depends(admin_user), db: DbSession = Depends(get_db)) -> Response:
    item = db.get(Analysis, analysis_id)
    if not item:
        raise HTTPException(404, "분석 기록을 찾을 수 없습니다.")
    if item.status in {"queued", "processing"}:
        raise HTTPException(409, "진행 중인 분석은 삭제할 수 없습니다.")
    owner = db.get(User, item.user_id)
    add_audit_log(
        db, _admin, action="analysis.delete", target_type="analysis", target_id=item.id,
        target_label=item.video.name, reason=reason,
        before={"owner_id": item.user_id, "owner_name": owner.name if owner else None, "status": item.status, "model": item.model.name, "media": item.video.name},
    )
    result_paths = analysis_file_paths(item)
    db.delete(item)
    db.commit()
    unlink_after_commit(result_paths)
    return Response(status_code=204)


@app.get("/admin/audit-logs")
def admin_list_audit_logs(
    action: str | None = Query(default=None, max_length=60),
    target_type: str | None = Query(default=None, max_length=40),
    limit: int = Query(default=100, ge=1, le=200),
    _admin: User = Depends(admin_user),
    db: DbSession = Depends(get_db),
) -> list[dict]:
    query = select(AuditLog)
    if action:
        query = query.where(AuditLog.action == action)
    if target_type:
        query = query.where(AuditLog.target_type == target_type)
    items = db.scalars(query.order_by(AuditLog.created_at.desc(), AuditLog.id.desc()).limit(limit)).all()
    return [{
        "id": item.id,
        "actor": {"id": item.actor_id, "name": item.actor_name},
        "action": item.action,
        "target_type": item.target_type,
        "target_id": item.target_id,
        "target_label": item.target_label,
        "before": json.loads(item.before_json) if item.before_json else None,
        "after": json.loads(item.after_json) if item.after_json else None,
        "reason": item.reason,
        "created_at": item.created_at,
    } for item in items]


@app.get("/admin/audit-logs-page")
def admin_audit_logs_page(
    page: int = Query(default=1, ge=1), page_size: int = Query(default=10, ge=1, le=100),
    _admin: User = Depends(admin_user), db: DbSession = Depends(get_db),
) -> dict:
    total = db.scalar(select(func.count(AuditLog.id))) or 0
    items = db.scalars(select(AuditLog).order_by(AuditLog.created_at.desc(), AuditLog.id.desc()).offset((page - 1) * page_size).limit(page_size)).all()
    return {"items": [{"id": item.id, "actor": {"id": item.actor_id, "name": item.actor_name}, "action": item.action, "target_type": item.target_type, "target_id": item.target_id, "target_label": item.target_label, "before": json.loads(item.before_json) if item.before_json else None, "after": json.loads(item.after_json) if item.after_json else None, "reason": item.reason, "created_at": item.created_at} for item in items], "total": total, "page": page, "page_size": page_size, "pages": max(1, (total + page_size - 1) // page_size)}


@app.get("/admin/inquiries-page")
def admin_inquiries_page(
    page: int = Query(default=1, ge=1), page_size: int = Query(default=10, ge=1, le=100),
    _admin: User = Depends(admin_user), db: DbSession = Depends(get_db),
) -> dict:
    total = db.scalar(select(func.count(Inquiry.id))) or 0
    pending = db.scalar(select(func.count(Inquiry.id)).where(Inquiry.status != "answered")) or 0
    items = db.scalars(select(Inquiry).order_by(Inquiry.id.desc()).offset((page - 1) * page_size).limit(page_size)).all()
    return {"items": [inquiry_json(item) for item in items], "total": total, "pending": pending, "page": page, "page_size": page_size, "pages": max(1, (total + page_size - 1) // page_size)}


@app.post("/auth/register", status_code=201)
def register(body: RegisterBody, response: Response, db: DbSession = Depends(get_db)) -> dict:
    email = body.email.lower()
    if db.scalar(select(User).where(User.email == email)):
        raise HTTPException(409, "이미 가입된 이메일입니다.")
    role = "admin" if not db.scalar(select(func.count(User.id)).where(User.role == "admin")) else "user"
    user = User(name=body.name.strip(), email=email, password_hash=hash_password(body.password), role=role)
    db.add(user)
    db.commit()
    db.refresh(user)
    set_session_cookie(response, db, user)
    return {"id": user.id, "name": user.name, "email": user.email, "role": user.role}


@app.post("/auth/login")
def login(body: LoginBody, request: Request, response: Response, db: DbSession = Depends(get_db)) -> dict:
    email = body.email.strip().lower()
    enforce_rate_limit("login_ip", request_client_key(request))
    enforce_rate_limit("login_account", email)
    user = db.scalar(select(User).where(User.email == body.email.lower()))
    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(401, "이메일 또는 비밀번호가 올바르지 않습니다.")
    if not user.active:
        raise HTTPException(403, "비활성화된 계정입니다.")
    set_session_cookie(response, db, user)
    return {"id": user.id, "name": user.name, "email": user.email, "role": user.role}


@app.get("/auth/oauth/{provider}")
def oauth_start(provider: str) -> RedirectResponse:
    if provider not in PROVIDERS:
        raise HTTPException(404, "지원하지 않는 로그인 방식입니다.")
    config = PROVIDERS[provider]
    if not config.client_id or not config.client_secret:
        raise HTTPException(503, f"{provider} 로그인 환경변수가 설정되지 않았습니다.")
    state = secrets.token_urlsafe(32)
    response = RedirectResponse(authorization_url(provider, state), status_code=302)
    response.set_cookie(OAUTH_STATE_COOKIE, state, httponly=True, samesite="lax", secure=False, max_age=600, path="/auth/oauth")
    return response


@app.get("/auth/oauth/{provider}/callback")
def oauth_callback(
    provider: str,
    code: str | None = None,
    state: str | None = None,
    error: str | None = None,
    floatwatch_oauth_state: str | None = Cookie(default=None),
    db: DbSession = Depends(get_db),
) -> RedirectResponse:
    def failure(message: str) -> RedirectResponse:
        query = urllib.parse.urlencode({"login": "1", "oauth_error": message})
        result = RedirectResponse(f"{FRONTEND_ORIGIN}/auth?{query}", status_code=302)
        result.delete_cookie(OAUTH_STATE_COOKIE, path="/auth/oauth")
        return result

    if provider not in PROVIDERS:
        return failure("지원하지 않는 로그인 방식입니다.")
    if error:
        return failure("소셜 로그인이 취소되었습니다.")
    if not code or not state or not floatwatch_oauth_state or not secrets.compare_digest(state, floatwatch_oauth_state):
        return failure("로그인 요청이 만료되었거나 올바르지 않습니다.")
    try:
        profile = exchange_profile(provider, code, state)
    except ValueError as exc:
        return failure(str(exc))

    identity = db.scalar(select(OAuthIdentity).where(
        OAuthIdentity.provider == provider,
        OAuthIdentity.provider_user_id == profile.provider_user_id,
    ))
    user = db.get(User, identity.user_id) if identity else None
    if not user:
        user = db.scalar(select(User).where(User.email == profile.email))
        if not user:
            role = "admin" if not db.scalar(select(func.count(User.id)).where(User.role == "admin")) else "user"
            user = User(name=profile.name, email=profile.email, password_hash=hash_password(secrets.token_urlsafe(48)), role=role)
            db.add(user)
            db.flush()
        db.add(OAuthIdentity(user_id=user.id, provider=provider, provider_user_id=profile.provider_user_id))
        db.commit()
    if not user.active:
        return failure("비활성화된 계정입니다.")

    response = RedirectResponse(f"{FRONTEND_ORIGIN}/auth", status_code=302)
    set_session_cookie(response, db, user)
    response.delete_cookie(OAUTH_STATE_COOKIE, path="/auth/oauth")
    return response


@app.post("/auth/logout", status_code=204)
def logout(floatwatch_session: str | None = Cookie(default=None), db: DbSession = Depends(get_db)) -> Response:
    if floatwatch_session:
        session = db.scalar(select(Session).where(Session.token_hash == token_digest(floatwatch_session)))
        if session:
            db.delete(session)
            db.commit()
    result = Response(status_code=204)
    result.delete_cookie(COOKIE_NAME)
    return result


@app.get("/auth/me")
def me(user: User = Depends(current_user), db: DbSession = Depends(get_db)) -> dict:
    return {"id": user.id, "name": user.name, "email": user.email, "role": user.role, "auth_provider": user_auth_provider(db, user.id)}


@app.patch("/auth/me")
def update_me(body: ProfileUpdate, user: User = Depends(current_user), db: DbSession = Depends(get_db)) -> dict:
    if body.name is not None:
        user.name = body.name.strip()
    db.commit()
    logger.info("event=profile_updated user_id=%s", user.id)
    return {"id": user.id, "name": user.name, "email": user.email, "role": user.role, "auth_provider": user_auth_provider(db, user.id)}


@app.patch("/auth/me/password", status_code=204)
def change_password(body: PasswordChange, user: User = Depends(current_user), db: DbSession = Depends(get_db)) -> Response:
    provider = user_auth_provider(db, user.id)
    if provider != "password":
        raise HTTPException(409, f"{provider} 소셜 로그인 계정은 비밀번호를 변경할 수 없습니다.")
    if not verify_password(body.current_password, user.password_hash):
        raise HTTPException(401, "현재 비밀번호가 올바르지 않습니다.")
    if verify_password(body.new_password, user.password_hash):
        raise HTTPException(400, "새 비밀번호는 현재 비밀번호와 다르게 입력해 주세요.")
    user.password_hash = hash_password(body.new_password)
    db.execute(delete(Session).where(Session.user_id == user.id))
    db.commit()
    logger.info("event=password_changed user_id=%s", user.id)
    result = Response(status_code=204)
    result.delete_cookie(COOKIE_NAME)
    return result


@app.delete("/auth/me", status_code=204)
def delete_me(body: AccountDelete, user: User = Depends(current_user), db: DbSession = Depends(get_db)) -> Response:
    if body.confirmation.strip() != "회원 탈퇴":
        raise HTTPException(400, "확인란에 '회원 탈퇴'를 정확히 입력해 주세요.")
    provider = user_auth_provider(db, user.id)
    if provider == "password":
        if not body.current_password or not verify_password(body.current_password, user.password_hash):
            raise HTTPException(401, "현재 비밀번호가 올바르지 않습니다.")
    running = db.scalar(
        select(func.count(Analysis.id)).where(Analysis.user_id == user.id, Analysis.status.in_(("queued", "processing")))
    ) or 0
    if running:
        raise HTTPException(409, "진행 중인 분석이 있어 탈퇴할 수 없습니다. 분석이 끝난 뒤 다시 시도해 주세요.")
    if user.role == "admin":
        active_admins = db.scalar(select(func.count(User.id)).where(User.role == "admin", User.active.is_(True))) or 0
        if active_admins <= 1:
            raise HTTPException(409, "마지막 활성 관리자 계정은 탈퇴할 수 없습니다. 다른 관리자에게 권한을 먼저 부여해 주세요.")

    owned_paths = user_owned_paths(db, user.id)
    user_id = user.id
    db.delete(user)
    db.commit()
    user_directories: set[Path] = set()
    for path in owned_paths:
        try:
            path = ensure_within_storage(path, STORAGE_DIR)
            safe_unlink(path, STORAGE_DIR)
            if path.parent.parent in {STORAGE_DIR / "models", STORAGE_DIR / "videos", STORAGE_DIR / "outputs"}:
                user_directories.add(path.parent)
        except OSError:
            logger.exception("account file cleanup failed", extra={"user_id": user_id, "path": str(path)})
    for directory in user_directories:
        try:
            directory.rmdir()
        except OSError:
            logger.exception("account directory cleanup failed", extra={"user_id": user_id, "path": str(directory)})
    logger.info("event=account_deleted user_id=%s auth_provider=%s", user_id, provider)
    result = Response(status_code=204)
    result.delete_cookie(COOKIE_NAME)
    return result


@app.get("/auth/me/summary")
def my_summary(user: User = Depends(current_user), db: DbSession = Depends(get_db)) -> dict:
    return {
        "analyses": db.scalar(select(func.count(Analysis.id)).where(Analysis.user_id == user.id)) or 0,
        "inquiries": db.scalar(select(func.count(Inquiry.id)).where(Inquiry.user_id == user.id)) or 0,
    }


@app.get("/models")
def list_models(user: User = Depends(current_user), db: DbSession = Depends(get_db)) -> list[dict]:
    items = db.scalars(select(ModelArtifact).where(ModelArtifact.user_id == user.id, ModelArtifact.quarantined.is_(False)).order_by(ModelArtifact.id.desc())).all()
    available: list[ModelArtifact] = []
    changed = False
    for item in items:
        problem = model_file_problem(item)
        if problem:
            quarantine_unusable_model(item, problem)
            changed = True
        else:
            available.append(item)
    if changed:
        db.commit()
    return [model_json(item) for item in available]


@app.get("/models/quarantined")
def list_quarantined_models(user: User = Depends(current_user), db: DbSession = Depends(get_db)) -> list[dict]:
    items = db.scalars(
        select(ModelArtifact)
        .where(ModelArtifact.user_id == user.id, ModelArtifact.quarantined.is_(True))
        .order_by(ModelArtifact.quarantined_at.desc(), ModelArtifact.id.desc())
    ).all()
    return [model_json(item) for item in items]


@app.post("/models", status_code=201)
async def upload_model(
    name: str,
    file: UploadFile = File(...),
    user: User = Depends(current_user),
    db: DbSession = Depends(get_db),
) -> dict:
    enforce_rate_limit("upload_model", str(user.id))
    original_name = normalize_upload_name(file.filename, "model.pt")
    if Path(original_name).suffix.lower() != ".pt":
        raise HTTPException(400, ".pt 모델 파일만 업로드할 수 있습니다.")
    model_name = name.strip()[:120]
    if not model_name:
        raise HTTPException(400, "모델 이름을 입력해 주세요.")
    target = storage_path(STORAGE_DIR, "models", str(user.id), f"{uuid.uuid4().hex}.pt")
    size = await save_upload(file, target, upload_limit(db, user.id, MAX_MODEL_SIZE))
    if size < 1024:
        target.unlink(missing_ok=True)
        raise HTTPException(400, "유효한 PT 모델 파일인지 확인해 주세요.")
    validate_pt_container(target)
    item = ModelArtifact(user_id=user.id, name=model_name, original_name=original_name, path=str(target), size_bytes=size)
    db.add(item)
    db.commit()
    db.refresh(item)
    logger.info("event=model_uploaded user_id=%s model_id=%s size_bytes=%s", user.id, item.id, size)
    return model_json(item)


@app.delete("/models/{model_id}", status_code=204)
def delete_model(model_id: int, user: User = Depends(current_user), db: DbSession = Depends(get_db)) -> Response:
    item = db.scalar(select(ModelArtifact).where(ModelArtifact.id == model_id, ModelArtifact.user_id == user.id))
    if not item:
        raise HTTPException(404, "모델을 찾을 수 없습니다.")
    if db.scalar(select(func.count(Analysis.id)).where(Analysis.model_id == item.id)):
        raise HTTPException(409, "분석 기록에서 사용 중인 모델은 삭제할 수 없습니다.")
    if db.scalar(select(func.count(RealtimeSession.id)).where(RealtimeSession.model_id == item.id)):
        raise HTTPException(409, "실시간 탐지 기록에서 사용 중인 모델은 삭제할 수 없습니다.")
    model_path = ensure_within_storage(item.path, STORAGE_DIR)
    db.delete(item)
    db.commit()
    with realtime_model_lock:
        realtime_model_cache.pop(model_id, None)
    unlink_after_commit({model_path})
    return Response(status_code=204)


@app.get("/videos")
def list_videos(user: User = Depends(current_user), db: DbSession = Depends(get_db)) -> list[dict]:
    items = db.scalars(select(VideoAsset).where(VideoAsset.user_id == user.id).order_by(VideoAsset.id.desc())).all()
    return [video_json(item) for item in items]


@app.get("/videos/{video_id}/preview")
def preview_video(video_id: int, user: User = Depends(current_user), db: DbSession = Depends(get_db)) -> FileResponse:
    item = db.scalar(select(VideoAsset).where(VideoAsset.id == video_id, VideoAsset.user_id == user.id))
    if not item:
        raise HTTPException(404, "미디어를 찾을 수 없습니다.")
    path = ensure_within_storage(item.path, STORAGE_DIR)
    if not path.is_file():
        raise HTTPException(404, "미디어 파일을 찾을 수 없습니다.")
    media_types = {
        ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png",
        ".webp": "image/webp", ".bmp": "image/bmp", ".mp4": "video/mp4",
        ".avi": "video/x-msvideo", ".mov": "video/quicktime",
    }
    return FileResponse(path, media_type=media_types.get(path.suffix.lower(), "application/octet-stream"))


@app.post("/videos", status_code=201)
async def upload_video(
    file: UploadFile = File(...),
    user: User = Depends(current_user),
    db: DbSession = Depends(get_db),
) -> dict:
    enforce_rate_limit("upload_media", str(user.id))
    original_name = normalize_upload_name(file.filename, "media")
    suffix = Path(original_name).suffix.lower()
    if suffix not in VIDEO_SUFFIXES | IMAGE_SUFFIXES:
        raise HTTPException(400, "지원하지 않는 이미지 또는 동영상 형식입니다.")
    target = storage_path(STORAGE_DIR, "videos", str(user.id), f"{uuid.uuid4().hex}{suffix}")
    size = await save_upload(file, target, upload_limit(db, user.id, MAX_VIDEO_SIZE))
    validate_media_signature(target, suffix)
    fps = frame_count = duration = None
    if suffix in VIDEO_SUFFIXES:
        capture = cv2.VideoCapture(str(target))
        if not capture.isOpened():
            capture.release()
            target.unlink(missing_ok=True)
            raise HTTPException(400, "동영상 파일을 읽을 수 없습니다.")
        fps = capture.get(cv2.CAP_PROP_FPS) or None
        frame_count = int(capture.get(cv2.CAP_PROP_FRAME_COUNT)) or None
        width = int(capture.get(cv2.CAP_PROP_FRAME_WIDTH))
        height = int(capture.get(cv2.CAP_PROP_FRAME_HEIGHT))
        duration = frame_count / fps if frame_count and fps else None
        decoded, first_frame = capture.read()
        capture.release()
        if not decoded or first_frame is None or first_frame.size == 0:
            target.unlink(missing_ok=True)
            raise HTTPException(400, "동영상의 첫 프레임을 읽지 못했습니다. 파일 손상 또는 코덱을 확인해 주세요.")
        if width <= 0 or height <= 0 or width * height > MAX_MEDIA_PIXELS:
            target.unlink(missing_ok=True)
            raise HTTPException(400, "지원 해상도를 초과했거나 영상 크기가 올바르지 않습니다.")
        if duration and duration > MAX_VIDEO_DURATION_SECONDS:
            target.unlink(missing_ok=True)
            raise HTTPException(400, "분석 가능한 영상 길이를 초과했습니다.")
    else:
        try:
            with Image.open(target) as source_image:
                source_image.verify()
        except (OSError, SyntaxError, ValueError):
            target.unlink(missing_ok=True)
            raise HTTPException(400, "이미지 파일이 손상되어 내용을 읽을 수 없습니다.")
        image = cv2.imread(str(target))
        if image is None:
            target.unlink(missing_ok=True)
            raise HTTPException(400, "이미지 파일을 읽을 수 없습니다.")
        if image.shape[0] * image.shape[1] > MAX_MEDIA_PIXELS:
            target.unlink(missing_ok=True)
            raise HTTPException(400, "지원 이미지 해상도를 초과했습니다.")
    latitude, longitude, captured_at = extract_media_metadata(target, suffix)
    digest = hashlib.sha256()
    with target.open("rb") as uploaded_file:
        for chunk in iter(lambda: uploaded_file.read(1024 * 1024), b""):
            digest.update(chunk)
    item = VideoAsset(
        user_id=user.id, name=original_name, path=str(target), size_bytes=size,
        fps=fps, frame_count=frame_count, duration_seconds=duration,
        latitude=latitude, longitude=longitude, captured_at=captured_at,
        location_source="metadata" if latitude is not None and longitude is not None else None,
        location_confirmed=False,
        content_sha256=digest.hexdigest(),
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    logger.info("event=media_uploaded user_id=%s media_id=%s size_bytes=%s", user.id, item.id, size)
    return video_json(item)


@app.patch("/videos/{video_id}/location")
def update_video_location(video_id: int, body: MediaLocationUpdate, user: User = Depends(current_user), db: DbSession = Depends(get_db)) -> dict:
    item = db.scalar(select(VideoAsset).where(VideoAsset.id == video_id, VideoAsset.user_id == user.id))
    if not item:
        raise HTTPException(404, "미디어를 찾을 수 없습니다.")
    has_coordinates = body.latitude is not None and body.longitude is not None
    if (body.latitude is None) != (body.longitude is None):
        raise HTTPException(400, "위도와 경도를 함께 입력해 주세요.")
    item.latitude = body.latitude
    item.longitude = body.longitude
    item.location_name = body.location_name.strip()[:160] if body.location_name else None
    item.location_description = body.location_description.strip()[:300] if body.location_description else None
    item.captured_at = body.captured_at or item.captured_at
    item.location_source = (body.location_source or "manual") if has_coordinates else "none"
    item.location_confirmed = body.location_confirmed
    if has_coordinates and body.location_confirmed:
        coastal = classify_coastal_location(body.latitude, body.longitude)
        item.coastal_eligible = bool(coastal["eligible"])
        item.coast_distance_m = float(coastal["distance_m"])
        item.coastal_reason = str(coastal["reason"])
    else:
        item.coastal_eligible = None
        item.coast_distance_m = None
        item.coastal_reason = None
    db.commit()
    db.refresh(item)
    return video_json(item)


@app.get("/locations/coastal-check")
def check_coastal_location(
    latitude: float = Query(ge=-90, le=90),
    longitude: float = Query(ge=-180, le=180),
    user: User = Depends(current_user),
) -> dict:
    result = classify_coastal_location(latitude, longitude)
    return {**result, "threshold_m": COASTAL_DISTANCE_METERS}


@app.get("/locations/search")
def search_locations(q: str = Query(min_length=2, max_length=120), user: User = Depends(current_user)) -> list[dict]:
    params = urllib.parse.urlencode({
        "q": q.strip(), "format": "jsonv2", "limit": 5, "accept-language": "ko",
        "countrycodes": "kr", "addressdetails": 1, "viewbox": "124.0,38.7,132.0,32.8", "bounded": 1,
    })
    request = urllib.request.Request(
        f"https://nominatim.openstreetmap.org/search?{params}",
        headers={"User-Agent": "FloatWatch-Education-MVP/0.1", "Accept": "application/json"},
    )
    try:
        with urllib.request.urlopen(request, timeout=8) as response:
            items = json.loads(response.read().decode("utf-8"))
    except (OSError, TimeoutError, json.JSONDecodeError) as exc:
        logger.warning("event=location_search_failed query=%s error=%s", q[:40], exc)
        raise HTTPException(503, "장소 검색 서비스에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.") from exc
    results = []
    for item in items:
        try:
            latitude, longitude = float(item["lat"]), float(item["lon"])
        except (KeyError, TypeError, ValueError):
            continue
        results.append({"name": format_korean_address(item, str(item.get("display_name") or q)), "latitude": latitude, "longitude": longitude, "type": item.get("type")})
    return results


def format_korean_address(item: dict, fallback: str) -> str:
    address = item.get("address") if isinstance(item.get("address"), dict) else {}
    if str(address.get("country_code", "")).lower() != "kr":
        return fallback[:300]
    ordered_keys = (
        "state", "province", "city", "county", "borough", "city_district", "district",
        "town", "municipality", "suburb", "quarter", "neighbourhood", "village", "hamlet",
    )
    parts: list[str] = []
    for key in ordered_keys:
        value = str(address.get(key) or "").strip()
        if value and value not in parts:
            parts.append(value)
    label = " ".join(parts) or fallback
    postcode = str(address.get("postcode") or "").strip()
    if postcode:
        label = f"{label} ({postcode})"
    return label[:300]


@app.get("/locations/reverse")
def reverse_location(latitude: float = Query(ge=-90, le=90), longitude: float = Query(ge=-180, le=180), user: User = Depends(current_user)) -> dict:
    if not (32.8 <= latitude <= 38.7 and 124.0 <= longitude <= 132.0):
        raise HTTPException(400, "대한민국 내 위치만 선택할 수 있습니다.")
    params = urllib.parse.urlencode({"lat": latitude, "lon": longitude, "format": "jsonv2", "accept-language": "ko", "zoom": 18, "addressdetails": 1})
    request = urllib.request.Request(
        f"https://nominatim.openstreetmap.org/reverse?{params}",
        headers={"User-Agent": "FloatWatch-Education-MVP/0.1", "Accept": "application/json"},
    )
    try:
        with urllib.request.urlopen(request, timeout=8) as response:
            item = json.loads(response.read().decode("utf-8"))
    except (OSError, TimeoutError, json.JSONDecodeError) as exc:
        logger.warning("event=location_reverse_failed latitude=%s longitude=%s error=%s", latitude, longitude, exc)
        raise HTTPException(503, "선택한 위치의 주소를 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.") from exc
    address = item.get("address") if isinstance(item.get("address"), dict) else {}
    if str(address.get("country_code", "")).lower() != "kr":
        raise HTTPException(400, "대한민국 내 위치만 선택할 수 있습니다.")
    return {
        "name": format_korean_address(item, str(item.get("display_name") or f"{latitude:.6f}, {longitude:.6f}")),
        "latitude": latitude,
        "longitude": longitude,
    }


@app.delete("/videos/{video_id}", status_code=204)
def delete_video(video_id: int, user: User = Depends(current_user), db: DbSession = Depends(get_db)) -> Response:
    item = db.scalar(select(VideoAsset).where(VideoAsset.id == video_id, VideoAsset.user_id == user.id))
    if not item:
        raise HTTPException(404, "미디어를 찾을 수 없습니다.")
    if db.scalar(select(func.count(Analysis.id)).where(Analysis.video_id == item.id)):
        raise HTTPException(409, "분석 기록에서 사용 중인 미디어는 삭제할 수 없습니다.")
    media_path = ensure_within_storage(item.path, STORAGE_DIR)
    db.delete(item)
    db.commit()
    unlink_after_commit({media_path})
    return Response(status_code=204)


@app.get("/analyses")
def list_analyses(user: User = Depends(current_user), db: DbSession = Depends(get_db)) -> list[dict]:
    items = db.scalars(select(Analysis).where(Analysis.user_id == user.id).order_by(Analysis.id.desc())).all()
    return [analysis_json(item) for item in items]


def cleanup_realtime_evidence(db: DbSession) -> int:
    total = int(db.scalar(select(func.coalesce(func.sum(RealtimeEvent.evidence_bytes), 0))) or 0)
    if total < REALTIME_EVIDENCE_CLEANUP_START_BYTES:
        return total
    protected_since = datetime.now(timezone.utc) - timedelta(hours=24)
    candidates = db.scalars(
        select(RealtimeEvent)
        .where(RealtimeEvent.evidence_path.is_not(None), RealtimeEvent.protected.is_(False), RealtimeEvent.detected_at < protected_since)
        .order_by(RealtimeEvent.detected_at.asc())
    ).all()
    for event in candidates:
        if total <= REALTIME_EVIDENCE_CLEANUP_TARGET_BYTES:
            break
        if event.evidence_path:
            try:
                safe_unlink(event.evidence_path, STORAGE_DIR)
            except (OSError, ValueError):
                logger.warning("event=realtime_evidence_cleanup_failed event_id=%s", event.id)
        total -= event.evidence_bytes or 0
        event.evidence_path = None
        event.evidence_bytes = None
    db.commit()
    return max(0, total)


def annotated_realtime_frame(image: np.ndarray, detections: list[dict]) -> np.ndarray:
    output = image.copy()
    height, width = output.shape[:2]
    for item in detections:
        x1, y1 = int(item["x1"] * width), int(item["y1"] * height)
        x2, y2 = int(item["x2"] * width), int(item["y2"] * height)
        label = f'{item["class_name"]} {round(item["confidence"] * 100)}%'
        cv2.rectangle(output, (x1, y1), (x2, y2), (74, 211, 199), 2)
        cv2.rectangle(output, (x1, max(0, y1 - 24)), (min(width, x1 + max(100, len(label) * 8)), y1), (8, 63, 68), -1)
        cv2.putText(output, label, (x1 + 5, max(16, y1 - 7)), cv2.FONT_HERSHEY_SIMPLEX, 0.48, (245, 255, 254), 1, cv2.LINE_AA)
    return output


def realtime_session_json(item: RealtimeSession, include_events: bool = False) -> dict:
    is_demo = bool(item.location_description and item.location_description.startswith(REALTIME_DEMO_MARKER))
    payload = {
        "id": item.id,
        "model_id": item.model_id,
        "model_name": item.model.name,
        "status": item.status,
        "total_events": item.total_events,
        "started_at": item.started_at,
        "ended_at": item.ended_at,
        "latitude": item.latitude,
        "longitude": item.longitude,
        "location_name": item.location_name,
        "location_description": item.location_description.removeprefix(REALTIME_DEMO_MARKER).strip() if is_demo else item.location_description,
        "is_demo": is_demo,
        "coastal_eligible": item.coastal_eligible,
        "coast_distance_m": item.coast_distance_m,
    }
    if include_events:
        payload["events"] = [
            {
                "id": event.id,
                "class_id": event.class_id,
                "class_name": event.class_name,
                "confidence": event.confidence,
                "x1": event.x1,
                "y1": event.y1,
                "x2": event.x2,
                "y2": event.y2,
                "detected_at": event.detected_at,
                "evidence_url": f"/realtime/events/{event.id}/evidence" if event.evidence_path else None,
                "protected": event.protected,
            }
            for event in sorted(item.events, key=lambda value: value.detected_at, reverse=True)
        ]
    return payload


@app.get("/realtime/sessions")
def list_realtime_sessions(user: User = Depends(current_user), db: DbSession = Depends(get_db)) -> list[dict]:
    items = db.scalars(
        select(RealtimeSession)
        .where(RealtimeSession.user_id == user.id)
        .order_by(RealtimeSession.id.desc())
    ).all()
    return [realtime_session_json(item) for item in items]


@app.get("/realtime/sessions/{session_id}")
def get_realtime_session(session_id: int, user: User = Depends(current_user), db: DbSession = Depends(get_db)) -> dict:
    item = db.scalar(select(RealtimeSession).where(RealtimeSession.id == session_id, RealtimeSession.user_id == user.id))
    if not item:
        raise HTTPException(404, "실시간 탐지 기록을 찾을 수 없습니다.")
    return realtime_session_json(item, include_events=True)


@app.get("/realtime/events/{event_id}/evidence")
def get_realtime_evidence(event_id: int, user: User = Depends(current_user), db: DbSession = Depends(get_db)) -> FileResponse:
    event = db.scalar(select(RealtimeEvent).join(RealtimeSession).where(RealtimeEvent.id == event_id, RealtimeSession.user_id == user.id))
    if not event or not event.evidence_path:
        raise HTTPException(404, "증거 이미지를 찾을 수 없습니다.")
    target = ensure_within_storage(event.evidence_path, STORAGE_DIR)
    if not target.is_file() or target.stat().st_size <= 0:
        raise HTTPException(404, "증거 이미지 파일을 찾을 수 없습니다.")
    return FileResponse(target, media_type="image/jpeg", filename=f"realtime-event-{event.id}.jpg")


@app.patch("/realtime/events/{event_id}/protection")
def protect_realtime_evidence(event_id: int, body: RealtimeEventProtect, user: User = Depends(current_user), db: DbSession = Depends(get_db)) -> dict:
    event = db.scalar(select(RealtimeEvent).join(RealtimeSession).where(RealtimeEvent.id == event_id, RealtimeSession.user_id == user.id))
    if not event:
        raise HTTPException(404, "실시간 탐지 이벤트를 찾을 수 없습니다.")
    event.protected = body.protected
    db.commit()
    return {"id": event.id, "protected": event.protected}


@app.post("/realtime/sessions", status_code=201)
def create_realtime_session(body: RealtimeSessionCreate, user: User = Depends(current_user), db: DbSession = Depends(get_db)) -> dict:
    model = db.scalar(select(ModelArtifact).where(ModelArtifact.id == body.model_id, ModelArtifact.user_id == user.id, ModelArtifact.quarantined.is_(False)))
    if not model:
        raise HTTPException(404, "사용 가능한 AI 모델을 찾을 수 없습니다.")
    require_model_file(model, db)
    active = db.scalar(select(RealtimeSession).where(RealtimeSession.user_id == user.id, RealtimeSession.status.in_(("running", "paused"))))
    if active:
        active.status = "completed"
        active.ended_at = datetime.now(timezone.utc)
    if (body.latitude is None) != (body.longitude is None):
        raise HTTPException(422, "위도와 경도는 함께 입력해야 합니다.")
    coastal = classify_coastal_location(body.latitude, body.longitude) if body.latitude is not None and body.longitude is not None else None
    item = RealtimeSession(
        user_id=user.id,
        model_id=model.id,
        status="running",
        latitude=body.latitude,
        longitude=body.longitude,
        location_name=body.location_name.strip()[:160] if body.location_name else None,
        location_description=body.location_description.strip()[:300] if body.location_description else None,
        coastal_eligible=coastal["eligible"] if coastal else None,
        coast_distance_m=coastal["distance_m"] if coastal else None,
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return realtime_session_json(item)


@app.patch("/realtime/sessions/{session_id}")
def update_realtime_session(session_id: int, body: RealtimeSessionUpdate, user: User = Depends(current_user), db: DbSession = Depends(get_db)) -> dict:
    item = db.scalar(select(RealtimeSession).where(RealtimeSession.id == session_id, RealtimeSession.user_id == user.id))
    if not item:
        raise HTTPException(404, "실시간 탐지 기록을 찾을 수 없습니다.")
    if item.status in {"completed", "interrupted"} and body.status != item.status:
        raise HTTPException(409, "이미 종료된 실시간 탐지 기록입니다.")
    item.status = body.status
    item.ended_at = datetime.now(timezone.utc) if body.status == "completed" else None
    db.commit()
    db.refresh(item)
    return realtime_session_json(item)


@app.post("/realtime/detect")
async def realtime_detect(
    model_id: int = Form(...),
    session_id: int | None = Form(None),
    confidence: float = Form(0.25, ge=0.05, le=0.95),
    frame: UploadFile = File(...),
    user: User = Depends(current_user),
    db: DbSession = Depends(get_db),
) -> dict:
    enforce_rate_limit("realtime_detect", str(user.id))
    model_artifact = db.scalar(
        select(ModelArtifact).where(
            ModelArtifact.id == model_id,
            ModelArtifact.user_id == user.id,
            ModelArtifact.quarantined.is_(False),
        )
    )
    if not model_artifact:
        raise HTTPException(404, "사용 가능한 AI 모델을 찾을 수 없습니다.")
    live_session = None
    if session_id is not None:
        live_session = db.scalar(
            select(RealtimeSession).where(
                RealtimeSession.id == session_id,
                RealtimeSession.user_id == user.id,
                RealtimeSession.model_id == model_id,
            )
        )
        if not live_session:
            raise HTTPException(404, "실시간 탐지 세션을 찾을 수 없습니다.")
        if live_session.status != "running":
            raise HTTPException(409, "현재 실행 중인 실시간 탐지 세션이 아닙니다.")
    payload = await frame.read(4 * 1024 * 1024 + 1)
    if not payload or len(payload) > 4 * 1024 * 1024:
        raise HTTPException(400, "실시간 프레임의 크기가 올바르지 않습니다.")
    image = cv2.imdecode(np.frombuffer(payload, dtype=np.uint8), cv2.IMREAD_COLOR)
    if image is None:
        raise HTTPException(400, "카메라 프레임을 읽을 수 없습니다.")
    height, width = image.shape[:2]
    if width <= 0 or height <= 0 or width * height > MAX_MEDIA_PIXELS:
        raise HTTPException(400, "카메라 프레임의 해상도가 지원 범위를 벗어났습니다.")

    model_path = ensure_within_storage(model_artifact.path, STORAGE_DIR)
    try:
        modified_at = model_path.stat().st_mtime
    except OSError as exc:
        raise HTTPException(404, "AI 모델 파일을 찾을 수 없습니다.") from exc
    with realtime_model_lock:
        cached = realtime_model_cache.get(model_artifact.id)
        if cached is None or cached[0] != modified_at:
            try:
                from ultralytics import YOLO
                cached = (modified_at, YOLO(str(model_path)))
                realtime_model_cache[model_artifact.id] = cached
            except Exception as exc:
                logger.exception("event=realtime_model_load_failed model_id=%s", model_artifact.id)
                raise HTTPException(422, "AI 모델을 불러오지 못했습니다.") from exc
    try:
        with realtime_inference_lock:
            result = cached[1].predict(image, conf=confidence, device="cpu", verbose=False)[0]
    except Exception as exc:
        logger.exception("event=realtime_inference_failed model_id=%s", model_artifact.id)
        raise HTTPException(500, "실시간 탐지 중 문제가 발생했습니다.") from exc

    names = result.names if isinstance(result.names, dict) else dict(enumerate(result.names))
    discovered_task = getattr(cached[1], "task", None)
    discovered_classes = [str(names[key]) for key in sorted(names)]
    discovered_classes_json = json.dumps(discovered_classes)
    if model_artifact.task != discovered_task or model_artifact.class_names_json != discovered_classes_json:
        model_artifact.task = discovered_task
        model_artifact.class_names_json = discovered_classes_json
        db.commit()
    boxes = result.boxes
    coordinates = boxes.xyxy.cpu().tolist() if boxes is not None else []
    confidences = boxes.conf.cpu().tolist() if boxes is not None else []
    class_ids = [int(value) for value in boxes.cls.cpu().tolist()] if boxes is not None else []
    detections = [
        {
            "class_id": class_id,
            "class_name": str(names.get(class_id, class_id)),
            "confidence": round(float(score), 4),
            "x1": max(0.0, min(float(box[0]) / width, 1.0)),
            "y1": max(0.0, min(float(box[1]) / height, 1.0)),
            "x2": max(0.0, min(float(box[2]) / width, 1.0)),
            "y2": max(0.0, min(float(box[3]) / height, 1.0)),
        }
        for box, score, class_id in zip(coordinates, confidences, class_ids)
    ]
    saved_event_ids: list[int] = []
    if live_session and detections:
        detected_at = datetime.now(timezone.utc)
        evidence_count = int(db.scalar(select(func.count(RealtimeEvent.id)).where(RealtimeEvent.session_id == live_session.id, RealtimeEvent.evidence_path.is_not(None))) or 0)
        evidence_usage = cleanup_realtime_evidence(db)
        evidence_frame: bytes | None = None
        strongest_by_class: dict[int, dict] = {}
        for detection in detections:
            current = strongest_by_class.get(detection["class_id"])
            if current is None or detection["confidence"] > current["confidence"]:
                strongest_by_class[detection["class_id"]] = detection
        for detection in strongest_by_class.values():
            latest = db.scalar(
                select(RealtimeEvent)
                .where(RealtimeEvent.session_id == live_session.id, RealtimeEvent.class_id == detection["class_id"])
                .order_by(RealtimeEvent.detected_at.desc())
                .limit(1)
            )
            latest_at = latest.detected_at.replace(tzinfo=None) if latest else None
            if latest_at and (detected_at.replace(tzinfo=None) - latest_at).total_seconds() < 3:
                continue
            event = RealtimeEvent(session_id=live_session.id, detected_at=detected_at, **detection)
            db.add(event)
            db.flush()
            latest_evidence = db.scalar(
                select(RealtimeEvent)
                .where(
                    RealtimeEvent.session_id == live_session.id,
                    RealtimeEvent.class_id == detection["class_id"],
                    RealtimeEvent.id != event.id,
                    RealtimeEvent.evidence_path.is_not(None),
                )
                .order_by(RealtimeEvent.detected_at.desc())
                .limit(1)
            )
            latest_evidence_at = latest_evidence.detected_at.replace(tzinfo=None) if latest_evidence else None
            interval_ready = not latest_evidence_at or (detected_at.replace(tzinfo=None) - latest_evidence_at).total_seconds() >= REALTIME_EVIDENCE_INTERVAL_SECONDS
            if evidence_count < REALTIME_EVIDENCE_MAX_PER_SESSION and interval_ready and evidence_usage < REALTIME_EVIDENCE_LIMIT_BYTES:
                if evidence_frame is None:
                    ok, encoded = cv2.imencode(".jpg", annotated_realtime_frame(image, detections), [cv2.IMWRITE_JPEG_QUALITY, 78])
                    evidence_frame = encoded.tobytes() if ok else b""
                if evidence_frame and evidence_usage + len(evidence_frame) <= REALTIME_EVIDENCE_LIMIT_BYTES:
                    evidence_dir = STORAGE_DIR / "realtime-evidence" / f"session-{live_session.id}"
                    evidence_dir.mkdir(parents=True, exist_ok=True)
                    evidence_path = evidence_dir / f"event-{event.id}.jpg"
                    evidence_path.write_bytes(evidence_frame)
                    event.evidence_path = str(evidence_path)
                    event.evidence_bytes = len(evidence_frame)
                    evidence_usage += len(evidence_frame)
                    evidence_count += 1
            saved_event_ids.append(event.id)
        if saved_event_ids:
            live_session.total_events += len(saved_event_ids)
            db.commit()
    return {"width": width, "height": height, "detections": detections, "saved_event_ids": saved_event_ids, "captured_at": datetime.now(timezone.utc).isoformat()}


@app.post("/analyses", status_code=202)
def create_analysis(
    body: AnalysisCreate,
    user: User = Depends(current_user),
    db: DbSession = Depends(get_db),
) -> dict:
    enforce_rate_limit("analysis", str(user.id))
    model = db.scalar(select(ModelArtifact).where(ModelArtifact.id == body.model_id, ModelArtifact.user_id == user.id, ModelArtifact.quarantined.is_(False)))
    video = db.scalar(select(VideoAsset).where(VideoAsset.id == body.video_id, VideoAsset.user_id == user.id))
    if not model or not video:
        raise HTTPException(404, "모델 또는 동영상을 찾을 수 없습니다.")
    require_model_file(model, db)
    estimated_output_bytes = max(64 * 1024 * 1024, video.size_bytes * ANALYSIS_DISK_MULTIPLIER)
    try:
        ensure_disk_capacity(STORAGE_DIR, estimated_output_bytes, MIN_FREE_DISK_BYTES)
    except InsufficientStorageError as exc:
        raise HTTPException(507, "분석 결과를 저장할 디스크 여유 공간이 부족합니다.") from exc
    with analysis_creation_lock:
        active = db.scalar(
            select(Analysis)
            .where(Analysis.user_id == user.id, Analysis.status.in_(("queued", "processing")))
            .order_by(Analysis.id.desc())
        )
        if active:
            raise HTTPException(409, f"이미 진행 중인 분석이 있습니다. 분석 #{active.id}을 확인해 주세요.")
        server_jobs = db.scalar(select(func.count(Analysis.id)).where(Analysis.status.in_(("queued", "processing")))) or 0
        if server_jobs >= MAX_SERVER_ANALYSIS_JOBS:
            raise HTTPException(503, "현재 분석 요청이 많습니다. 잠시 후 다시 시도해 주세요.", headers={"Retry-After": "30"})
        item = Analysis(user_id=user.id, model_id=model.id, video_id=video.id, confidence=body.confidence, frame_stride=body.frame_stride)
        db.add(item)
        db.commit()
        db.refresh(item)
    logger.info("event=analysis_queued user_id=%s analysis_id=%s model_id=%s media_id=%s", user.id, item.id, model.id, video.id)
    enqueue_analysis(item.id)
    return analysis_json(item)


@app.post("/analyses/{analysis_id}/retry", status_code=202)
def retry_analysis(analysis_id: int, user: User = Depends(current_user), db: DbSession = Depends(get_db)) -> dict:
    enforce_rate_limit("analysis", str(user.id))
    source = db.scalar(select(Analysis).where(Analysis.id == analysis_id, Analysis.user_id == user.id))
    if not source:
        raise HTTPException(404, "분석 기록을 찾을 수 없습니다.")
    if source.status not in {"failed", "cancelled", "completed"}:
        raise HTTPException(409, "진행 중인 분석은 다시 시작할 수 없습니다.")
    model = db.scalar(select(ModelArtifact).where(ModelArtifact.id == source.model_id, ModelArtifact.user_id == user.id, ModelArtifact.quarantined.is_(False)))
    video = db.scalar(select(VideoAsset).where(VideoAsset.id == source.video_id, VideoAsset.user_id == user.id))
    if not model:
        raise HTTPException(409, "기존 모델을 사용할 수 없습니다. 새 모델을 등록한 뒤 다시 시도해 주세요.")
    if not video:
        raise HTTPException(409, "기존 미디어를 찾을 수 없습니다. 미디어를 다시 등록해 주세요.")
    require_model_file(model, db)
    estimated_output_bytes = max(64 * 1024 * 1024, video.size_bytes * ANALYSIS_DISK_MULTIPLIER)
    try:
        ensure_disk_capacity(STORAGE_DIR, estimated_output_bytes, MIN_FREE_DISK_BYTES)
    except InsufficientStorageError as exc:
        raise HTTPException(507, "분석 결과를 저장할 디스크 여유 공간이 부족합니다.") from exc
    with analysis_creation_lock:
        active = db.scalar(
            select(Analysis)
            .where(Analysis.user_id == user.id, Analysis.status.in_(("queued", "processing")))
            .order_by(Analysis.id.desc())
        )
        if active:
            raise HTTPException(409, f"이미 진행 중인 분석이 있습니다. 분석 #{active.id}을 확인해 주세요.")
        server_jobs = db.scalar(select(func.count(Analysis.id)).where(Analysis.status.in_(("queued", "processing")))) or 0
        if server_jobs >= MAX_SERVER_ANALYSIS_JOBS:
            raise HTTPException(503, "현재 분석 요청이 많습니다. 잠시 후 다시 시도해 주세요.", headers={"Retry-After": "30"})
        item = Analysis(user_id=user.id, model_id=model.id, video_id=video.id, confidence=source.confidence, frame_stride=source.frame_stride)
        db.add(item)
        db.commit()
        db.refresh(item)
    logger.info("event=analysis_retried user_id=%s source_analysis_id=%s analysis_id=%s", user.id, source.id, item.id)
    enqueue_analysis(item.id)
    return analysis_json(item)


@app.post("/analyses/{analysis_id}/cancel")
def cancel_analysis(analysis_id: int, user: User = Depends(current_user), db: DbSession = Depends(get_db)) -> dict:
    item = db.scalar(select(Analysis).where(Analysis.id == analysis_id, Analysis.user_id == user.id))
    if not item:
        raise HTTPException(404, "분석 기록을 찾을 수 없습니다.")
    if item.status not in {"queued", "processing"}:
        raise HTTPException(409, "이미 종료된 분석입니다.")
    try:
        transition_analysis(item, "cancelled")
    except InvalidAnalysisTransition as exc:
        raise HTTPException(409, "이미 종료된 분석입니다.") from exc
    item.error_code = "USER_CANCELLED"
    item.error_message = "사용자가 분석을 중단했습니다."
    item.completed_at = datetime.now(timezone.utc)
    cleanup_analysis_artifacts(db, item)
    db.commit()
    db.refresh(item)
    removed_from_queue = cancel_enqueued_analysis(item.id)
    logger.info("event=analysis_cancelled user_id=%s analysis_id=%s", user.id, item.id)
    if removed_from_queue:
        logger.info("event=analysis_cancelled_before_start analysis_id=%s", item.id)
    return analysis_json(item, detail=True)


@app.delete("/analyses/{analysis_id}", status_code=204)
def delete_analysis(analysis_id: int, user: User = Depends(current_user), db: DbSession = Depends(get_db)) -> Response:
    item = db.scalar(select(Analysis).where(Analysis.id == analysis_id, Analysis.user_id == user.id))
    if not item:
        raise HTTPException(404, "분석 기록을 찾을 수 없습니다.")
    if item.status in {"queued", "processing"}:
        raise HTTPException(409, "진행 중인 분석은 삭제할 수 없습니다.")
    result_paths = analysis_file_paths(item)
    db.delete(item)
    db.commit()
    unlink_after_commit(result_paths)
    return Response(status_code=204)


@app.get("/analyses/{analysis_id}")
def get_analysis(analysis_id: int, user: User = Depends(current_user), db: DbSession = Depends(get_db)) -> dict:
    item = db.scalar(select(Analysis).where(Analysis.id == analysis_id, Analysis.user_id == user.id))
    if not item:
        raise HTTPException(404, "분석 기록을 찾을 수 없습니다.")
    return analysis_json(item, detail=True)


@app.get("/analyses/{analysis_id}/output")
def analysis_output(analysis_id: int, download: bool = False, user: User = Depends(current_user), db: DbSession = Depends(get_db)) -> FileResponse:
    item = db.scalar(select(Analysis).where(Analysis.id == analysis_id, Analysis.user_id == user.id))
    if not item:
        raise HTTPException(404, "분석 기록을 찾을 수 없습니다.")
    if item.status != "completed":
        raise HTTPException(409, "완료되지 않은 분석의 결과는 열거나 다운로드할 수 없습니다.")
    if not item.output_path:
        raise HTTPException(404, "결과 파일을 찾을 수 없습니다.")
    try:
        output_path = ensure_within_storage(item.output_path, STORAGE_DIR)
    except ValueError:
        raise HTTPException(404, "결과 파일을 찾을 수 없습니다.") from None
    is_image = output_path.suffix.lower() in IMAGE_SUFFIXES
    media_type = "image" if is_image else "video" if output_path.suffix.lower() in VIDEO_SUFFIXES else ""
    try:
        validate_result_file(output_path, media_type)
    except (OSError, ValueError):
        raise HTTPException(404, "결과 파일이 없거나 정상적인 형식이 아닙니다.") from None
    suffix = output_path.suffix.lower()
    filename = f"floatwatch-result-{item.id}{suffix}" if download else None
    return FileResponse(output_path, media_type="image/jpeg" if is_image else "video/mp4", filename=filename)
