from __future__ import annotations

import subprocess
import json
import logging
import math
import os
import shutil
import time
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

import cv2
from sqlalchemy import delete

from .database import STORAGE_DIR, SessionLocal
from .models import Analysis, ClassStat, FrameMetric
from .storage_security import ensure_within_storage, storage_path

NET_MIN_CONFIDENCE = 0.60
TEMPORAL_MIN_CONSECUTIVE_FRAMES = 3
TEMPORAL_IOU_THRESHOLD = 0.25
DEFAULT_VIDEO_FPS = 30.0
MIN_REASONABLE_FPS = 0.1
MAX_REASONABLE_FPS = 240.0
MAX_REASONABLE_FRAME_COUNT = 100_000_000
MAX_ANALYSIS_RUNTIME_SECONDS = int(os.getenv("MAX_ANALYSIS_RUNTIME_SECONDS", "3600"))
MAX_ANALYSIS_PROCESSED_FRAMES = int(os.getenv("MAX_ANALYSIS_PROCESSED_FRAMES", "50000"))
logger = logging.getLogger("floatwatch.analysis")
ANALYSIS_ERROR_MESSAGES = {
    "MODEL_LOAD_FAILED": "AI 모델을 불러오지 못했습니다.",
    "MEDIA_READ_FAILED": "미디어 파일을 읽지 못했습니다.",
    "VIDEO_CODEC_UNSUPPORTED": "지원하지 않는 영상 형식 또는 코덱입니다.",
    "OUTPUT_CREATE_FAILED": "분석 결과 파일을 생성하지 못했습니다.",
    "INSUFFICIENT_STORAGE": "결과를 저장할 공간이 부족합니다.",
    "SERVER_RESTARTED": "서버가 재시작되어 분석이 중단됐습니다.",
    "RECOVERY_INPUT_MISSING": "서버 재시작 후 분석 입력 파일을 확인할 수 없어 작업을 복구하지 못했습니다.",
    "USER_CANCELLED": "사용자가 분석을 중단했습니다.",
    "INFERENCE_FAILED": "AI 분석 중 문제가 발생했습니다.",
    "ANALYSIS_TIMEOUT": "분석 가능 시간을 초과해 작업을 안전하게 중단했습니다.",
    "RESOURCE_LIMIT_EXCEEDED": "서버 자원 보호 한도를 초과해 분석을 중단했습니다.",
}


ANALYSIS_STATE_TRANSITIONS = {
    "queued": frozenset({"processing", "cancelled", "failed"}),
    "processing": frozenset({"completed", "cancelled", "failed"}),
    "completed": frozenset(),
    "failed": frozenset(),
    "cancelled": frozenset(),
}


class AnalysisCancelled(Exception):
    """Stop a worker after the user has cancelled its persisted analysis job."""


class AnalysisTimeout(RuntimeError):
    """Stop analysis work that exceeded its execution budget."""


class AnalysisResourceLimit(RuntimeError):
    """Stop analysis work that exceeded its bounded processing budget."""


class InvalidAnalysisTransition(RuntimeError):
    """Reject an analysis state change that violates the lifecycle contract."""


def transition_analysis(analysis: Analysis, target_status: str) -> None:
    """Move an analysis to an allowed next state without reopening terminal work."""
    current_status = str(analysis.status)
    allowed = ANALYSIS_STATE_TRANSITIONS.get(current_status)
    if allowed is None or target_status not in allowed:
        raise InvalidAnalysisTransition(f"invalid analysis transition: {current_status} -> {target_status}")
    analysis.status = target_status


def advance_progress(analysis: Analysis, value: float) -> None:
    """Move persisted progress forward without ever allowing it to regress."""
    analysis.progress = min(99.0, max(float(analysis.progress or 0), float(value)))


def normalize_video_metadata(
    raw_fps: float,
    raw_width: float,
    raw_height: float,
    raw_total_frames: float,
) -> tuple[float, int, int, int]:
    """Normalize unreliable OpenCV metadata without inventing a frame total."""
    fps = float(raw_fps) if math.isfinite(raw_fps) and MIN_REASONABLE_FPS <= raw_fps <= MAX_REASONABLE_FPS else DEFAULT_VIDEO_FPS
    width = int(raw_width) if math.isfinite(raw_width) and raw_width > 0 else 0
    height = int(raw_height) if math.isfinite(raw_height) and raw_height > 0 else 0
    total_frames = int(raw_total_frames) if math.isfinite(raw_total_frames) and 0 < raw_total_frames <= MAX_REASONABLE_FRAME_COUNT else 0
    return fps, width, height, total_frames


def log_frame_count_mismatch(analysis_id: int, declared_frames: int, actual_frames: int) -> bool:
    """Log material metadata drift and return whether a mismatch was detected."""
    if declared_frames <= 0:
        logger.info("event=video_frame_count_unknown analysis_id=%s actual_frames=%s", analysis_id, actual_frames)
        return False
    difference = abs(actual_frames - declared_frames)
    tolerance = max(10, round(declared_frames * 0.05))
    if difference <= tolerance:
        return False
    logger.warning(
        "event=video_frame_count_mismatch analysis_id=%s declared_frames=%s actual_frames=%s difference=%s",
        analysis_id,
        declared_frames,
        actual_frames,
        difference,
    )
    return True


def class_confidence_indices(
    class_ids: list[int],
    confidences: list[float],
    names: dict[int, str],
    base_confidence: float,
) -> list[int]:
    """Apply the user threshold to every class and a stricter threshold to Net."""
    kept: list[int] = []
    for index, (class_id, confidence) in enumerate(zip(class_ids, confidences)):
        class_name = str(names.get(class_id, class_id)).strip().casefold()
        threshold = max(base_confidence, NET_MIN_CONFIDENCE) if class_name == "net" else base_confidence
        if confidence >= threshold:
            kept.append(index)
    return kept


def box_iou(left: tuple[float, float, float, float], right: tuple[float, float, float, float]) -> float:
    x1 = max(left[0], right[0])
    y1 = max(left[1], right[1])
    x2 = min(left[2], right[2])
    y2 = min(left[3], right[3])
    intersection = max(0.0, x2 - x1) * max(0.0, y2 - y1)
    left_area = max(0.0, left[2] - left[0]) * max(0.0, left[3] - left[1])
    right_area = max(0.0, right[2] - right[0]) * max(0.0, right[3] - right[1])
    union = left_area + right_area - intersection
    return intersection / union if union > 0 else 0.0


class TemporalDetectionFilter:
    """Keep detections that persist across consecutive processed video frames."""

    def __init__(self, minimum_consecutive: int = TEMPORAL_MIN_CONSECUTIVE_FRAMES, iou_threshold: float = TEMPORAL_IOU_THRESHOLD):
        self.minimum_consecutive = minimum_consecutive
        self.iou_threshold = iou_threshold
        self.previous: list[tuple[int, tuple[float, float, float, float], int]] = []

    def update(self, detections: list[tuple[int, int, tuple[float, float, float, float]]]) -> list[int]:
        current: list[tuple[int, tuple[float, float, float, float], int]] = []
        matched_previous: set[int] = set()
        kept_indices: list[int] = []
        for result_index, class_id, coordinates in detections:
            best_index = -1
            best_iou = self.iou_threshold
            for previous_index, (previous_class, previous_box, _streak) in enumerate(self.previous):
                if previous_index in matched_previous or previous_class != class_id:
                    continue
                overlap = box_iou(previous_box, coordinates)
                if overlap >= best_iou:
                    best_index = previous_index
                    best_iou = overlap
            streak = 1
            if best_index >= 0:
                matched_previous.add(best_index)
                streak = self.previous[best_index][2] + 1
            current.append((class_id, coordinates, streak))
            if streak >= self.minimum_consecutive:
                kept_indices.append(result_index)
        self.previous = current
        return kept_indices


def filter_result(result, indices: list[int]):
    """Keep all Ultralytics result payloads aligned with the selected boxes."""
    result.boxes = result.boxes[indices]
    if result.masks is not None:
        result.masks = result.masks[indices]
    if result.keypoints is not None:
        result.keypoints = result.keypoints[indices]
    return result


class ModelLoadError(RuntimeError):
    pass


def classify_analysis_error(error: Exception) -> str:
    if isinstance(error, ModelLoadError):
        return "MODEL_LOAD_FAILED"
    if isinstance(error, (AnalysisTimeout, subprocess.TimeoutExpired)):
        return "ANALYSIS_TIMEOUT"
    if isinstance(error, (AnalysisResourceLimit, MemoryError)):
        return "RESOURCE_LIMIT_EXCEEDED"
    message = str(error).casefold()
    if isinstance(error, OSError) and getattr(error, "errno", None) == 28 or "no space left" in message:
        return "INSUFFICIENT_STORAGE"
    if isinstance(error, subprocess.CalledProcessError) or "결과" in message:
        return "OUTPUT_CREATE_FAILED"
    if "인코더" in message or "코덱" in message or "화면 크기" in message:
        return "VIDEO_CODEC_UNSUPPORTED"
    if "파일을 읽" in message or "파일을 열" in message or "영상 프레임" in message:
        return "MEDIA_READ_FAILED"
    return "INFERENCE_FAILED"


def validate_result_file(path: Path, media_type: str) -> Path:
    """Verify that a generated result is safe, non-empty, and decodable."""
    safe_path = ensure_within_storage(path, STORAGE_DIR)
    if not safe_path.is_file() or safe_path.stat().st_size <= 0:
        raise ValueError("분석 결과 파일을 정상적으로 생성하지 못했습니다.")
    if media_type == "image":
        if cv2.imread(str(safe_path)) is None:
            raise ValueError("분석 결과 이미지를 확인할 수 없습니다.")
        return safe_path
    if media_type == "video":
        result_capture = cv2.VideoCapture(str(safe_path))
        try:
            if not result_capture.isOpened():
                raise ValueError("분석 결과 영상을 열 수 없습니다.")
            readable, frame = result_capture.read()
            if not readable or frame is None or frame.size == 0:
                raise ValueError("분석 결과 영상의 프레임을 확인할 수 없습니다.")
        finally:
            result_capture.release()
        return safe_path
    raise ValueError("지원하지 않는 분석 결과 형식입니다.")


def analysis_media_type(analysis: Analysis) -> str:
    """Infer the persisted source media type from its trusted storage suffix."""
    suffix = Path(analysis.video.path).suffix.lower()
    return "image" if suffix in {".jpg", ".jpeg", ".png", ".webp", ".bmp"} else "video"


def cleanup_analysis_artifacts(db, analysis: Analysis) -> None:
    """Remove partial outputs and statistics while preserving status and progress."""
    candidates = {
        storage_path(STORAGE_DIR, "outputs", f"analysis-{analysis.id}-working.mp4"),
        storage_path(STORAGE_DIR, "outputs", f"analysis-{analysis.id}.mp4"),
        storage_path(STORAGE_DIR, "outputs", f"analysis-{analysis.id}.jpg"),
    }
    if analysis.output_path:
        try:
            candidates.add(ensure_within_storage(analysis.output_path, STORAGE_DIR))
        except ValueError:
            logger.warning("event=analysis_cleanup_unsafe_path analysis_id=%s", analysis.id)
    for candidate in candidates:
        try:
            candidate.unlink(missing_ok=True)
        except OSError:
            logger.exception("event=analysis_cleanup_file_failed analysis_id=%s path=%s", analysis.id, candidate.name)

    db.execute(delete(FrameMetric).where(FrameMetric.analysis_id == analysis.id))
    db.execute(delete(ClassStat).where(ClassStat.analysis_id == analysis.id))
    analysis.output_path = None
    analysis.total_detections = 0
    analysis.processed_frames = 0
    analysis.avg_confidence = None
    analysis.processing_fps = None


def safely_cleanup_analysis(db, analysis: Analysis) -> Analysis:
    """Best-effort cleanup that never replaces the analysis' original failure."""
    try:
        cleanup_analysis_artifacts(db, analysis)
        return analysis
    except Exception:
        logger.exception("event=analysis_cleanup_failed analysis_id=%s", analysis.id)
        db.rollback()
        return db.get(Analysis, analysis.id) or analysis


def finalize_analysis(
    db,
    analysis: Analysis,
    output_path: Path,
    frame_metrics: list[dict],
    class_confidences: dict[int, list[float]],
    class_names: dict[int, str],
    total_detections: int,
    processed_frames: int,
    average_confidence: float,
    processing_fps: float,
) -> None:
    """Persist all result statistics and completion state in one transaction."""
    db.refresh(analysis)
    transition_analysis(analysis, "completed")
    validate_result_file(output_path, analysis_media_type(analysis))
    db.execute(delete(FrameMetric).where(FrameMetric.analysis_id == analysis.id))
    db.execute(delete(ClassStat).where(ClassStat.analysis_id == analysis.id))
    db.add_all(FrameMetric(analysis_id=analysis.id, **metric) for metric in frame_metrics)
    db.add_all(
        ClassStat(
            analysis_id=analysis.id,
            class_id=class_id,
            class_name=str(class_names.get(class_id, class_id)),
            count=len(values),
            avg_confidence=sum(values) / len(values),
        )
        for class_id, values in class_confidences.items()
    )
    analysis.progress = 100
    analysis.output_path = str(output_path)
    analysis.total_detections = total_detections
    analysis.processed_frames = processed_frames
    analysis.avg_confidence = average_confidence
    analysis.processing_fps = processing_fps
    analysis.error_code = None
    analysis.error_message = None
    analysis.completed_at = datetime.now(timezone.utc)
    db.commit()


def quarantine_model(analysis: Analysis, reason: str) -> None:
    model = analysis.model
    source = ensure_within_storage(model.path, STORAGE_DIR)
    quarantine_dir = storage_path(STORAGE_DIR, "quarantine", str(model.user_id))
    quarantine_dir.mkdir(parents=True, exist_ok=True)
    target = quarantine_dir / f"model-{model.id}-{source.name}"
    try:
        if source.exists():
            shutil.move(str(source), str(target))
            model.path = str(target)
    except OSError as exc:
        reason = f"{reason}; 격리 파일 이동 실패: {exc}"
    model.quarantined = True
    model.quarantine_reason = reason[:1000]
    model.quarantined_at = datetime.now(timezone.utc)


def run_analysis(analysis_id: int) -> None:
    from ultralytics import YOLO

    db = SessionLocal()
    analysis = db.get(Analysis, analysis_id)
    if not analysis:
        db.close()
        return

    # A queued job can be cancelled before the single worker reaches it.
    if analysis.status != "queued":
        db.close()
        return

    transition_analysis(analysis, "processing")
    analysis.progress = 2
    analysis.started_at = datetime.now(timezone.utc)
    db.commit()

    capture = None
    writer = None
    worker_started = time.monotonic()

    def ensure_runtime_budget() -> None:
        if time.monotonic() - worker_started > MAX_ANALYSIS_RUNTIME_SECONDS:
            raise AnalysisTimeout("analysis runtime exceeded")
    try:
        advance_progress(analysis, 8)
        db.commit()
        try:
            model_path = ensure_within_storage(analysis.model.path, STORAGE_DIR)
            model = YOLO(str(model_path))
        except Exception as exc:
            raise ModelLoadError(str(exc)) from exc
        analysis.model.task = getattr(model, "task", None)
        names = model.names if isinstance(model.names, dict) else dict(enumerate(model.names))
        analysis.model.class_names_json = json.dumps([str(names[key]) for key in sorted(names)])
        advance_progress(analysis, 18)
        db.commit()

        db.refresh(analysis)
        if analysis.status != "processing":
            raise AnalysisCancelled()

        source_path = ensure_within_storage(analysis.video.path, STORAGE_DIR)
        if source_path.suffix.lower() in {".jpg", ".jpeg", ".png", ".webp", ".bmp"}:
            frame = cv2.imread(str(source_path))
            if frame is None:
                raise ValueError("이미지 파일을 읽을 수 없습니다.")
            advance_progress(analysis, 25)
            db.commit()
            started = time.perf_counter()
            result = model.predict(frame, conf=analysis.confidence, device="cpu", verbose=False)[0]
            ensure_runtime_budget()
            db.refresh(analysis)
            if analysis.status != "processing":
                raise AnalysisCancelled()
            elapsed = max(time.perf_counter() - started, 0.001)
            advance_progress(analysis, 78)
            db.commit()
            boxes = result.boxes
            raw_confidences = boxes.conf.cpu().tolist() if boxes is not None else []
            raw_class_ids = [int(value) for value in boxes.cls.cpu().tolist()] if boxes is not None else []
            result = filter_result(result, class_confidence_indices(raw_class_ids, raw_confidences, names, analysis.confidence))
            output_path = storage_path(STORAGE_DIR, "outputs", f"analysis-{analysis.id}.jpg")
            output_path.parent.mkdir(parents=True, exist_ok=True)
            advance_progress(analysis, 92)
            db.commit()
            if not cv2.imwrite(str(output_path), result.plot()):
                raise ValueError("결과 이미지를 저장할 수 없습니다.")
            try:
                validate_result_file(output_path, "image")
            except (OSError, ValueError):
                output_path.unlink(missing_ok=True)
                raise ValueError("결과 파일을 생성했지만 정상적으로 확인하지 못했습니다.") from None
            advance_progress(analysis, 98)
            db.commit()
            boxes = result.boxes
            confidences = boxes.conf.cpu().tolist() if boxes is not None else []
            class_ids = [int(value) for value in boxes.cls.cpu().tolist()] if boxes is not None else []
            grouped: dict[int, list[float]] = defaultdict(list)
            for class_id, confidence in zip(class_ids, confidences):
                grouped[class_id].append(confidence)
            finalize_analysis(
                db,
                analysis,
                output_path,
                [{
                    "frame_number": 0,
                    "timestamp_seconds": 0,
                    "detection_count": len(confidences),
                    "avg_confidence": sum(confidences) / len(confidences) if confidences else 0,
                    "has_masks": result.masks is not None,
                }],
                grouped,
                names,
                len(confidences),
                1,
                sum(confidences) / len(confidences) if confidences else 0,
                1 / elapsed,
            )
            return

        capture = cv2.VideoCapture(analysis.video.path)
        if not capture.isOpened():
            raise ValueError("동영상 파일을 열 수 없습니다.")

        fps, width, height, total_frames = normalize_video_metadata(
            capture.get(cv2.CAP_PROP_FPS),
            capture.get(cv2.CAP_PROP_FRAME_WIDTH),
            capture.get(cv2.CAP_PROP_FRAME_HEIGHT),
            capture.get(cv2.CAP_PROP_FRAME_COUNT),
        )
        if width <= 0 or height <= 0:
            raise ValueError("동영상 화면 크기를 확인할 수 없습니다.")
        advance_progress(analysis, 20)
        db.commit()
        output_path = storage_path(STORAGE_DIR, "outputs", f"analysis-{analysis.id}.mp4")
        working_path = output_path.with_name(f"analysis-{analysis.id}-working.mp4")
        output_path.parent.mkdir(parents=True, exist_ok=True)
        writer = cv2.VideoWriter(str(working_path), cv2.VideoWriter_fourcc(*"mp4v"), fps, (width, height))
        if not writer.isOpened():
            raise ValueError("결과 동영상 인코더를 시작할 수 없습니다.")

        class_confidences: dict[int, list[float]] = defaultdict(list)
        confidence_sum = 0.0
        detection_total = 0
        processed = 0
        frame_number = 0
        last_annotated = None
        started = time.perf_counter()
        temporal_filter = TemporalDetectionFilter()
        pending_frame_metrics: list[dict] = []

        while True:
            ok, frame = capture.read()
            if not ok:
                break

            should_process = frame_number % analysis.frame_stride == 0
            if should_process:
                if processed >= MAX_ANALYSIS_PROCESSED_FRAMES:
                    raise AnalysisResourceLimit("processed frame limit exceeded")
                result = model.predict(frame, conf=analysis.confidence, device="cpu", verbose=False)[0]
                ensure_runtime_budget()
                boxes = result.boxes
                raw_confidences = boxes.conf.cpu().tolist() if boxes is not None else []
                raw_class_ids = [int(value) for value in boxes.cls.cpu().tolist()] if boxes is not None else []
                raw_coordinates = boxes.xyxy.cpu().tolist() if boxes is not None else []
                confidence_indices = class_confidence_indices(raw_class_ids, raw_confidences, names, analysis.confidence)
                candidates = [
                    (index, raw_class_ids[index], tuple(float(value) for value in raw_coordinates[index]))
                    for index in confidence_indices
                ]
                persistent_indices = temporal_filter.update(candidates)
                result = filter_result(result, persistent_indices)
                annotated = result.plot()
                last_annotated = annotated
                boxes = result.boxes
                frame_confidences = boxes.conf.cpu().tolist() if boxes is not None else []
                class_ids = [int(value) for value in boxes.cls.cpu().tolist()] if boxes is not None else []
                for class_id, confidence in zip(class_ids, frame_confidences):
                    class_confidences[class_id].append(confidence)
                count = len(frame_confidences)
                confidence_sum += sum(frame_confidences)
                detection_total += count
                processed += 1
                pending_frame_metrics.append({
                    "frame_number": frame_number,
                    "timestamp_seconds": frame_number / fps,
                    "detection_count": count,
                    "avg_confidence": sum(frame_confidences) / count if count else 0,
                    "has_masks": result.masks is not None,
                })
            else:
                annotated = frame if last_annotated is None else frame

            writer.write(annotated)
            frame_number += 1
            if frame_number % 10 == 0:
                ensure_runtime_budget()
                db.refresh(analysis)
                if analysis.status != "processing":
                    raise AnalysisCancelled()
                analysis.processed_frames = processed
                if total_frames > 0:
                    frame_ratio = min(frame_number / total_frames, 1.0)
                    advance_progress(analysis, 20.0 + frame_ratio * 70.0)
                else:
                    # Unknown-length streams expose processed frames in the UI.
                    # Keep a monotonic, bounded stage value until the stream ends.
                    advance_progress(analysis, min(89.0, 20.0 + frame_number / 10.0))
                db.commit()

        if frame_number == 0:
            raise ValueError("분석할 수 있는 영상 프레임이 없습니다.")
        log_frame_count_mismatch(analysis.id, total_frames, frame_number)
        elapsed = max(time.perf_counter() - started, 0.001)
        db.refresh(analysis)
        if analysis.status != "processing":
            raise AnalysisCancelled()
        writer.release()
        writer = None
        analysis.processed_frames = processed
        advance_progress(analysis, 92)
        db.commit()
        from imageio_ffmpeg import get_ffmpeg_exe
        remaining_runtime = max(1, int(MAX_ANALYSIS_RUNTIME_SECONDS - (time.monotonic() - worker_started)))
        subprocess.run(
            [get_ffmpeg_exe(), "-y", "-i", str(working_path), "-c:v", "libx264", "-preset", "veryfast",
             "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(output_path)],
            check=True,
            capture_output=True,
            timeout=remaining_runtime,
        )
        try:
            validate_result_file(output_path, "video")
        except (OSError, ValueError):
            output_path.unlink(missing_ok=True)
            raise ValueError("결과 파일을 생성했지만 정상적으로 확인하지 못했습니다.") from None
        working_path.unlink(missing_ok=True)
        advance_progress(analysis, 98)
        db.commit()
        db.refresh(analysis)
        if analysis.status != "processing":
            output_path.unlink(missing_ok=True)
            raise AnalysisCancelled()
        finalize_analysis(
            db,
            analysis,
            output_path,
            pending_frame_metrics,
            class_confidences,
            names,
            detection_total,
            processed,
            confidence_sum / detection_total if detection_total else 0,
            processed / elapsed,
        )
    except AnalysisCancelled:
        # The API already persisted the user-facing cancellation state.
        db.rollback()
        analysis = db.get(Analysis, analysis_id)
        if analysis:
            analysis = safely_cleanup_analysis(db, analysis)
            db.commit()
    except ModelLoadError as exc:
        logger.exception("event=analysis_model_load_failed analysis_id=%s detail=%s", analysis_id, exc)
        db.rollback()
        analysis = db.get(Analysis, analysis_id)
        if not analysis:
            return
        reason = f"모델 로딩 실패: {exc}"
        if analysis.status not in {"queued", "processing"}:
            analysis = safely_cleanup_analysis(db, analysis)
            db.commit()
            return
        quarantine_model(analysis, reason)
        analysis = safely_cleanup_analysis(db, analysis)
        transition_analysis(analysis, "failed")
        analysis.error_code = "MODEL_LOAD_FAILED"
        analysis.error_message = ANALYSIS_ERROR_MESSAGES[analysis.error_code]
        analysis.completed_at = datetime.now(timezone.utc)
        db.commit()
    except Exception as exc:
        error_code = classify_analysis_error(exc)
        logger.exception("event=analysis_failed analysis_id=%s error_code=%s detail=%s", analysis_id, error_code, exc)
        db.rollback()
        analysis = db.get(Analysis, analysis_id)
        if not analysis:
            return
        if analysis.status not in {"queued", "processing"}:
            analysis = safely_cleanup_analysis(db, analysis)
            db.commit()
            return
        analysis = safely_cleanup_analysis(db, analysis)
        transition_analysis(analysis, "failed")
        analysis.error_code = error_code
        analysis.error_message = ANALYSIS_ERROR_MESSAGES[error_code]
        analysis.completed_at = datetime.now(timezone.utc)
        db.commit()
    finally:
        if capture is not None:
            capture.release()
        if writer is not None:
            writer.release()
        db.close()
