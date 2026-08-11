from __future__ import annotations

import subprocess
import json
import time
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

import cv2
from sqlalchemy import delete

from .database import SessionLocal
from .models import Analysis, ClassStat, FrameMetric


def run_analysis(analysis_id: int) -> None:
    from ultralytics import YOLO

    db = SessionLocal()
    analysis = db.get(Analysis, analysis_id)
    if not analysis:
        db.close()
        return

    analysis.status = "processing"
    analysis.started_at = datetime.now(timezone.utc)
    db.commit()

    capture = None
    writer = None
    try:
        model = YOLO(analysis.model.path)
        analysis.model.task = getattr(model, "task", None)
        names = model.names if isinstance(model.names, dict) else dict(enumerate(model.names))
        analysis.model.class_names_json = json.dumps([str(names[key]) for key in sorted(names)])

        source_path = Path(analysis.video.path)
        if source_path.suffix.lower() in {".jpg", ".jpeg", ".png", ".webp", ".bmp"}:
            frame = cv2.imread(str(source_path))
            if frame is None:
                raise ValueError("이미지 파일을 읽을 수 없습니다.")
            started = time.perf_counter()
            result = model.predict(frame, conf=analysis.confidence, device="cpu", verbose=False)[0]
            elapsed = max(time.perf_counter() - started, 0.001)
            output_path = source_path.parents[2] / "outputs" / f"analysis-{analysis.id}.jpg"
            output_path.parent.mkdir(parents=True, exist_ok=True)
            if not cv2.imwrite(str(output_path), result.plot()):
                raise ValueError("결과 이미지를 저장할 수 없습니다.")
            boxes = result.boxes
            confidences = boxes.conf.cpu().tolist() if boxes is not None else []
            class_ids = [int(value) for value in boxes.cls.cpu().tolist()] if boxes is not None else []
            grouped: dict[int, list[float]] = defaultdict(list)
            for class_id, confidence in zip(class_ids, confidences):
                grouped[class_id].append(confidence)
            db.execute(delete(FrameMetric).where(FrameMetric.analysis_id == analysis.id))
            db.execute(delete(ClassStat).where(ClassStat.analysis_id == analysis.id))
            db.add(FrameMetric(analysis_id=analysis.id, frame_number=0, timestamp_seconds=0, detection_count=len(confidences), avg_confidence=sum(confidences) / len(confidences) if confidences else 0, has_masks=result.masks is not None))
            for class_id, values in grouped.items():
                db.add(ClassStat(analysis_id=analysis.id, class_id=class_id, class_name=str(names.get(class_id, class_id)), count=len(values), avg_confidence=sum(values) / len(values)))
            analysis.status = "completed"
            analysis.progress = 100
            analysis.output_path = str(output_path)
            analysis.total_detections = len(confidences)
            analysis.processed_frames = 1
            analysis.avg_confidence = sum(confidences) / len(confidences) if confidences else 0
            analysis.processing_fps = 1 / elapsed
            analysis.completed_at = datetime.now(timezone.utc)
            db.commit()
            return

        capture = cv2.VideoCapture(analysis.video.path)
        if not capture.isOpened():
            raise ValueError("동영상 파일을 열 수 없습니다.")

        fps = capture.get(cv2.CAP_PROP_FPS) or 30.0
        width = int(capture.get(cv2.CAP_PROP_FRAME_WIDTH))
        height = int(capture.get(cv2.CAP_PROP_FRAME_HEIGHT))
        total_frames = int(capture.get(cv2.CAP_PROP_FRAME_COUNT))
        output_path = Path(analysis.video.path).parents[2] / "outputs" / f"analysis-{analysis.id}.mp4"
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

        db.execute(delete(FrameMetric).where(FrameMetric.analysis_id == analysis.id))
        db.execute(delete(ClassStat).where(ClassStat.analysis_id == analysis.id))

        while True:
            ok, frame = capture.read()
            if not ok:
                break

            should_process = frame_number % analysis.frame_stride == 0
            if should_process:
                result = model.predict(frame, conf=analysis.confidence, device="cpu", verbose=False)[0]
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
                db.add(FrameMetric(
                    analysis_id=analysis.id,
                    frame_number=frame_number,
                    timestamp_seconds=frame_number / fps,
                    detection_count=count,
                    avg_confidence=sum(frame_confidences) / count if count else 0,
                    has_masks=result.masks is not None,
                ))
            else:
                annotated = frame if last_annotated is None else frame

            writer.write(annotated)
            frame_number += 1
            if frame_number % 30 == 0:
                analysis.progress = min(99.0, frame_number / max(total_frames, 1) * 100)
                db.commit()

        elapsed = max(time.perf_counter() - started, 0.001)
        writer.release()
        writer = None
        from imageio_ffmpeg import get_ffmpeg_exe
        subprocess.run(
            [get_ffmpeg_exe(), "-y", "-i", str(working_path), "-c:v", "libx264", "-preset", "veryfast",
             "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(output_path)],
            check=True,
            capture_output=True,
        )
        working_path.unlink(missing_ok=True)
        for class_id, values in class_confidences.items():
            db.add(ClassStat(
                analysis_id=analysis.id,
                class_id=class_id,
                class_name=str(names.get(class_id, class_id)),
                count=len(values),
                avg_confidence=sum(values) / len(values),
            ))

        analysis.status = "completed"
        analysis.progress = 100
        analysis.output_path = str(output_path)
        analysis.total_detections = detection_total
        analysis.processed_frames = processed
        analysis.avg_confidence = confidence_sum / detection_total if detection_total else 0
        analysis.processing_fps = processed / elapsed
        analysis.completed_at = datetime.now(timezone.utc)
        db.commit()
    except Exception as exc:
        analysis.status = "failed"
        analysis.error_message = str(exc)[:1000]
        analysis.completed_at = datetime.now(timezone.utc)
        db.commit()
    finally:
        if capture is not None:
            capture.release()
        if writer is not None:
            writer.release()
        db.close()
