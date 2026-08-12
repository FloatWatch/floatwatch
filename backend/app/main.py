from __future__ import annotations

import json
import logging
import os
import shutil
import secrets
import urllib.parse
import uuid
import zipfile
from concurrent.futures import Future, ThreadPoolExecutor
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path

import cv2
from fastapi import Cookie, Depends, FastAPI, File, HTTPException, Query, Response, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, RedirectResponse
from sqlalchemy import delete, func, select, text
from sqlalchemy.orm import Session as DbSession

from .analysis_service import run_analysis
from .database import Base, STORAGE_DIR, SessionLocal, engine
from .models import Analysis, AuditLog, ContentAttachment, ContentComment, ContentItem, Inquiry, InquiryAttachment, ModelArtifact, OAuthIdentity, Session, User, VideoAsset
from .oauth import PROVIDERS, authorization_url, exchange_profile
from .schemas import AccountDelete, AnalysisCreate, CommentCreate, ContentCreate, ContentUpdate, InquiryAnswer, InquiryCreate, LoginBody, PasswordChange, ProfileUpdate, RegisterBody, UserAdminUpdate
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

IMAGE_SUFFIXES = {".jpg", ".jpeg", ".png", ".webp", ".bmp"}
VIDEO_SUFFIXES = {".mp4", ".avi", ".mov", ".mkv", ".webm"}


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
    try:
        future.result()
    except Exception:
        logger.exception("analysis worker crashed", extra={"analysis_id": analysis_id})


def enqueue_analysis(analysis_id: int) -> None:
    future = analysis_executor.submit(run_analysis, analysis_id)
    future.add_done_callback(lambda result: _analysis_done(analysis_id, result))

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
        inquiry_columns = {row[1] for row in connection.execute(text("PRAGMA table_info(inquiries)"))}
        if "answer_read_at" not in inquiry_columns:
            connection.execute(text("ALTER TABLE inquiries ADD COLUMN answer_read_at DATETIME"))
    for folder in ("models", "videos", "outputs", "attachments", "quarantine"):
        (STORAGE_DIR / folder).mkdir(parents=True, exist_ok=True)
    db = SessionLocal()
    try:
        db.execute(delete(Session).where(Session.expires_at <= datetime.now(timezone.utc)))
        stale = db.scalars(select(Analysis).where(Analysis.status == "processing")).all()
        for item in stale:
            item.status = "failed"
            item.error_message = "서버가 재시작되어 분석이 중단되었습니다. 다시 분석해 주세요."
            item.completed_at = datetime.now(timezone.utc)
        queued_ids = list(db.scalars(select(Analysis.id).where(Analysis.status == "queued").order_by(Analysis.id.asc())).all())
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
                db.add(ContentItem(category=category, title=title, content=content, pinned=category != "free" and count < 2))
                existing.add(title)
                count += 1
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
    if not session or session.expires_at.replace(tzinfo=timezone.utc) <= now:
        raise HTTPException(401, "세션이 만료되었습니다.")
    user = db.get(User, session.user_id)
    if not user or not user.active:
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


def delete_analysis_files(item: Analysis) -> None:
    if item.output_path:
        safe_unlink(item.output_path, STORAGE_DIR)


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
    }


def analysis_json(item: Analysis, detail: bool = False) -> dict:
    data = {
        "id": item.id, "status": item.status, "confidence": item.confidence,
        "frame_stride": item.frame_stride, "progress": item.progress,
        "total_detections": item.total_detections, "processed_frames": item.processed_frames,
        "avg_confidence": item.avg_confidence, "processing_fps": item.processing_fps,
        "error_message": item.error_message, "created_at": item.created_at,
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
    if category not in {"free", "notice", "faq"}:
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
    if item.category != "free":
        raise HTTPException(400, "댓글은 자유게시판에서만 작성할 수 있습니다.")
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
    if body.category != "free" and user.role != "admin":
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
    item = db.get(Inquiry, inquiry_id)
    if not item:
        raise HTTPException(404, "문의를 찾을 수 없습니다.")
    if user.role != "admin" and item.user_id != user.id:
        raise HTTPException(403, "문의에 접근할 권한이 없습니다.")
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
    attachment = db.get(InquiryAttachment, attachment_id)
    if not attachment:
        raise HTTPException(404, "첨부파일을 찾을 수 없습니다.")
    if user.role != "admin" and attachment.inquiry.user_id != user.id:
        raise HTTPException(403, "첨부파일을 확인할 권한이 없습니다.")
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
    db.commit()
    return {"id": user.id, "name": user.name, "email": user.email, "role": user.role, "active": user.active, "created_at": user.created_at}


@app.get("/admin/analyses")
def admin_list_analyses(_admin: User = Depends(admin_user), db: DbSession = Depends(get_db)) -> list[dict]:
    items = db.scalars(select(Analysis).order_by(Analysis.id.desc())).all()
    return [{**analysis_json(item), "owner": {"id": item.user_id, "name": db.get(User, item.user_id).name}} for item in items]


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
    delete_analysis_files(item)
    db.delete(item)
    db.commit()
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
def login(body: LoginBody, response: Response, db: DbSession = Depends(get_db)) -> dict:
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
    return [model_json(item) for item in items]


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
    safe_unlink(item.path, STORAGE_DIR)
    db.delete(item)
    db.commit()
    return Response(status_code=204)


@app.get("/videos")
def list_videos(user: User = Depends(current_user), db: DbSession = Depends(get_db)) -> list[dict]:
    items = db.scalars(select(VideoAsset).where(VideoAsset.user_id == user.id).order_by(VideoAsset.id.desc())).all()
    return [video_json(item) for item in items]


@app.post("/videos", status_code=201)
async def upload_video(
    file: UploadFile = File(...),
    user: User = Depends(current_user),
    db: DbSession = Depends(get_db),
) -> dict:
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
        capture.release()
        if width <= 0 or height <= 0 or width * height > MAX_MEDIA_PIXELS:
            target.unlink(missing_ok=True)
            raise HTTPException(400, "지원 해상도를 초과했거나 영상 크기가 올바르지 않습니다.")
        if duration and duration > MAX_VIDEO_DURATION_SECONDS:
            target.unlink(missing_ok=True)
            raise HTTPException(400, "분석 가능한 영상 길이를 초과했습니다.")
    else:
        image = cv2.imread(str(target))
        if image is None:
            target.unlink(missing_ok=True)
            raise HTTPException(400, "이미지 파일을 읽을 수 없습니다.")
        if image.shape[0] * image.shape[1] > MAX_MEDIA_PIXELS:
            target.unlink(missing_ok=True)
            raise HTTPException(400, "지원 이미지 해상도를 초과했습니다.")
    item = VideoAsset(user_id=user.id, name=original_name, path=str(target), size_bytes=size, fps=fps, frame_count=frame_count, duration_seconds=duration)
    db.add(item)
    db.commit()
    db.refresh(item)
    logger.info("event=media_uploaded user_id=%s media_id=%s size_bytes=%s", user.id, item.id, size)
    return video_json(item)


@app.delete("/videos/{video_id}", status_code=204)
def delete_video(video_id: int, user: User = Depends(current_user), db: DbSession = Depends(get_db)) -> Response:
    item = db.scalar(select(VideoAsset).where(VideoAsset.id == video_id, VideoAsset.user_id == user.id))
    if not item:
        raise HTTPException(404, "미디어를 찾을 수 없습니다.")
    if db.scalar(select(func.count(Analysis.id)).where(Analysis.video_id == item.id)):
        raise HTTPException(409, "분석 기록에서 사용 중인 미디어는 삭제할 수 없습니다.")
    safe_unlink(item.path, STORAGE_DIR)
    db.delete(item)
    db.commit()
    return Response(status_code=204)


@app.get("/analyses")
def list_analyses(user: User = Depends(current_user), db: DbSession = Depends(get_db)) -> list[dict]:
    items = db.scalars(select(Analysis).where(Analysis.user_id == user.id).order_by(Analysis.id.desc())).all()
    return [analysis_json(item) for item in items]


@app.post("/analyses", status_code=202)
def create_analysis(
    body: AnalysisCreate,
    user: User = Depends(current_user),
    db: DbSession = Depends(get_db),
) -> dict:
    model = db.scalar(select(ModelArtifact).where(ModelArtifact.id == body.model_id, ModelArtifact.user_id == user.id, ModelArtifact.quarantined.is_(False)))
    video = db.scalar(select(VideoAsset).where(VideoAsset.id == body.video_id, VideoAsset.user_id == user.id))
    if not model or not video:
        raise HTTPException(404, "모델 또는 동영상을 찾을 수 없습니다.")
    estimated_output_bytes = max(64 * 1024 * 1024, video.size_bytes * ANALYSIS_DISK_MULTIPLIER)
    try:
        ensure_disk_capacity(STORAGE_DIR, estimated_output_bytes, MIN_FREE_DISK_BYTES)
    except InsufficientStorageError as exc:
        raise HTTPException(507, "분석 결과를 저장할 디스크 여유 공간이 부족합니다.") from exc
    item = Analysis(user_id=user.id, model_id=model.id, video_id=video.id, confidence=body.confidence, frame_stride=body.frame_stride)
    db.add(item)
    db.commit()
    db.refresh(item)
    logger.info("event=analysis_queued user_id=%s analysis_id=%s model_id=%s media_id=%s", user.id, item.id, model.id, video.id)
    enqueue_analysis(item.id)
    return analysis_json(item)


@app.delete("/analyses/{analysis_id}", status_code=204)
def delete_analysis(analysis_id: int, user: User = Depends(current_user), db: DbSession = Depends(get_db)) -> Response:
    item = db.scalar(select(Analysis).where(Analysis.id == analysis_id, Analysis.user_id == user.id))
    if not item:
        raise HTTPException(404, "분석 기록을 찾을 수 없습니다.")
    if item.status in {"queued", "processing"}:
        raise HTTPException(409, "진행 중인 분석은 삭제할 수 없습니다.")
    delete_analysis_files(item)
    db.delete(item)
    db.commit()
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
    if not item or not item.output_path:
        raise HTTPException(404, "결과 동영상을 찾을 수 없습니다.")
    try:
        output_path = ensure_within_storage(item.output_path, STORAGE_DIR)
    except ValueError:
        raise HTTPException(404, "결과 파일을 찾을 수 없습니다.") from None
    if not output_path.exists():
        raise HTTPException(404, "결과 파일을 찾을 수 없습니다.")
    is_image = output_path.suffix.lower() in IMAGE_SUFFIXES
    suffix = output_path.suffix.lower()
    filename = f"floatwatch-result-{item.id}{suffix}" if download else None
    return FileResponse(output_path, media_type="image/jpeg" if is_image else "video/mp4", filename=filename)
