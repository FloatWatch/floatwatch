from __future__ import annotations

import json
import os
import shutil
import secrets
import urllib.parse
import uuid
from datetime import datetime, timezone
from pathlib import Path

import cv2
from fastapi import BackgroundTasks, Cookie, Depends, FastAPI, File, HTTPException, Response, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, RedirectResponse
from sqlalchemy import delete, func, select, text
from sqlalchemy.orm import Session as DbSession

from .analysis_service import run_analysis
from .database import Base, STORAGE_DIR, SessionLocal, engine
from .models import Analysis, ContentAttachment, ContentComment, ContentItem, Inquiry, InquiryAttachment, ModelArtifact, OAuthIdentity, Session, User, VideoAsset
from .oauth import PROVIDERS, authorization_url, exchange_profile
from .schemas import AnalysisCreate, CommentCreate, ContentCreate, ContentUpdate, InquiryAnswer, InquiryCreate, LoginBody, ProfileUpdate, RegisterBody, UserAdminUpdate
from .security import hash_password, new_session_token, token_digest, verify_password


MAX_MODEL_SIZE = 500 * 1024 * 1024
MAX_VIDEO_SIZE = 2 * 1024 * 1024 * 1024
MAX_ATTACHMENT_SIZE = 20 * 1024 * 1024
COOKIE_NAME = "floatwatch_session"
OAUTH_STATE_COOKIE = "floatwatch_oauth_state"
FRONTEND_ORIGIN = os.getenv("FRONTEND_ORIGIN", "http://localhost:3000").rstrip("/")

app = FastAPI(title="FloatWatch API", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[os.getenv("FRONTEND_ORIGIN", "http://localhost:3000")],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def startup() -> None:
    Base.metadata.create_all(engine)
    with engine.begin() as connection:
        columns = {row[1] for row in connection.execute(text("PRAGMA table_info(users)"))}
        if "role" not in columns:
            connection.execute(text("ALTER TABLE users ADD COLUMN role VARCHAR(20) NOT NULL DEFAULT 'user'"))
        if "active" not in columns:
            connection.execute(text("ALTER TABLE users ADD COLUMN active BOOLEAN NOT NULL DEFAULT 1"))
    for folder in ("models", "videos", "outputs", "attachments"):
        (STORAGE_DIR / folder).mkdir(parents=True, exist_ok=True)
    db = SessionLocal()
    try:
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
    finally:
        db.close()


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
        with target.open("wb") as output:
            while chunk := await upload.read(1024 * 1024):
                size += len(chunk)
                if size > max_bytes:
                    raise HTTPException(413, "허용된 파일 크기를 초과했습니다.")
                output.write(chunk)
    except Exception:
        target.unlink(missing_ok=True)
        raise
    return size


def model_json(item: ModelArtifact) -> dict:
    return {
        "id": item.id, "name": item.name, "original_name": item.original_name,
        "size_bytes": item.size_bytes, "task": item.task,
        "class_names": json.loads(item.class_names_json) if item.class_names_json else [],
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


def inquiry_json(item: Inquiry) -> dict:
    return {
        "id": item.id, "title": item.title, "content": item.content, "status": item.status,
        "answer": item.answer, "answered_at": item.answered_at, "created_at": item.created_at,
        "user": {"id": item.user.id, "name": item.user.name, "email": item.user.email},
        "attachments": [{"id": row.id, "name": row.original_name, "size_bytes": row.size_bytes, "url": f"/inquiry-attachments/{row.id}"} for row in item.attachments],
    }


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


@app.get("/content")
def list_content(category: str, db: DbSession = Depends(get_db)) -> list[dict]:
    if category not in {"free", "notice", "faq"}:
        raise HTTPException(400, "지원하지 않는 게시판입니다.")
    items = db.scalars(
        select(ContentItem).where(ContentItem.category == category)
        .order_by(ContentItem.pinned.desc(), ContentItem.updated_at.desc(), ContentItem.id.desc())
    ).all()
    return [content_json(item) for item in items]


@app.get("/attachments/{attachment_id}")
def download_attachment(attachment_id: int, db: DbSession = Depends(get_db)) -> FileResponse:
    attachment = db.get(ContentAttachment, attachment_id)
    if not attachment:
        raise HTTPException(404, "첨부파일을 찾을 수 없습니다.")
    path = STORAGE_DIR / "attachments" / attachment.stored_name
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
    original_name = Path(file.filename or "attachment").name[:255]
    suffix = Path(original_name).suffix.lower()[:12]
    stored_name = f"{uuid.uuid4().hex}{suffix}"
    size = await save_upload(file, STORAGE_DIR / "attachments" / stored_name, MAX_ATTACHMENT_SIZE)
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
    path = STORAGE_DIR / "attachments" / attachment.stored_name
    if path.exists(): path.unlink()
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
def update_content(content_id: int, body: ContentUpdate, user: User = Depends(current_user), db: DbSession = Depends(get_db)) -> dict:
    item = db.get(ContentItem, content_id)
    if not item:
        raise HTTPException(404, "게시글을 찾을 수 없습니다.")
    if user.role != "admin" and item.author_id != user.id:
        raise HTTPException(403, "게시글을 수정할 권한이 없습니다.")
    for field, value in body.model_dump(exclude_unset=True).items():
        if field == "pinned" and user.role != "admin":
            continue
        setattr(item, field, value.strip() if isinstance(value, str) else value)
    db.commit()
    return content_json(item)


@app.delete("/content/{content_id}", status_code=204)
def delete_content(content_id: int, user: User = Depends(current_user), db: DbSession = Depends(get_db)) -> Response:
    item = db.get(ContentItem, content_id)
    if not item:
        raise HTTPException(404, "게시글을 찾을 수 없습니다.")
    if user.role != "admin" and item.author_id != user.id:
        raise HTTPException(403, "게시글을 삭제할 권한이 없습니다.")
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


@app.post("/inquiries", status_code=201)
def create_inquiry(body: InquiryCreate, user: User = Depends(current_user), db: DbSession = Depends(get_db)) -> dict:
    item = Inquiry(user_id=user.id, title=body.title.strip(), content=body.content.strip())
    db.add(item)
    db.commit()
    db.refresh(item)
    return inquiry_json(item)


@app.post("/inquiries/{inquiry_id}/attachments", status_code=201)
async def upload_inquiry_attachment(inquiry_id: int, file: UploadFile = File(...), user: User = Depends(current_user), db: DbSession = Depends(get_db)) -> dict:
    item = db.get(Inquiry, inquiry_id)
    if not item:
        raise HTTPException(404, "문의를 찾을 수 없습니다.")
    if user.role != "admin" and item.user_id != user.id:
        raise HTTPException(403, "첨부파일을 등록할 권한이 없습니다.")
    original_name = Path(file.filename or "attachment").name[:255]
    suffix = Path(original_name).suffix.lower()[:12]
    stored_name = f"inquiry-{uuid.uuid4().hex}{suffix}"
    size = await save_upload(file, STORAGE_DIR / "attachments" / stored_name, MAX_ATTACHMENT_SIZE)
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
    path = STORAGE_DIR / "attachments" / attachment.stored_name
    if not path.exists():
        raise HTTPException(404, "첨부파일이 존재하지 않습니다.")
    return FileResponse(path, filename=attachment.original_name)


@app.patch("/inquiries/{inquiry_id}/answer")
def answer_inquiry(inquiry_id: int, body: InquiryAnswer, _admin: User = Depends(admin_user), db: DbSession = Depends(get_db)) -> dict:
    item = db.get(Inquiry, inquiry_id)
    if not item:
        raise HTTPException(404, "문의를 찾을 수 없습니다.")
    item.answer = body.answer.strip()
    item.status = "answered"
    item.answered_at = datetime.now(timezone.utc)
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
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(user, field, value)
    db.commit()
    return {"id": user.id, "name": user.name, "email": user.email, "role": user.role, "active": user.active, "created_at": user.created_at}


@app.get("/admin/analyses")
def admin_list_analyses(_admin: User = Depends(admin_user), db: DbSession = Depends(get_db)) -> list[dict]:
    items = db.scalars(select(Analysis).order_by(Analysis.id.desc())).all()
    return [{**analysis_json(item), "owner": {"id": item.user_id, "name": db.get(User, item.user_id).name}} for item in items]


@app.delete("/admin/analyses/{analysis_id}", status_code=204)
def admin_delete_analysis(analysis_id: int, _admin: User = Depends(admin_user), db: DbSession = Depends(get_db)) -> Response:
    item = db.get(Analysis, analysis_id)
    if not item:
        raise HTTPException(404, "분석 기록을 찾을 수 없습니다.")
    if item.output_path:
        Path(item.output_path).unlink(missing_ok=True)
    db.delete(item)
    db.commit()
    return Response(status_code=204)


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
    set_session_cookie(response, db, user)
    if not user.active:
        raise HTTPException(403, "비활성화된 계정입니다.")
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
def me(user: User = Depends(current_user)) -> dict:
    return {"id": user.id, "name": user.name, "email": user.email, "role": user.role}


@app.patch("/auth/me")
def update_me(body: ProfileUpdate, user: User = Depends(current_user), db: DbSession = Depends(get_db)) -> dict:
    if body.name is not None:
        user.name = body.name.strip()
    if body.password is not None:
        user.password_hash = hash_password(body.password)
    db.commit()
    return {"id": user.id, "name": user.name, "email": user.email, "role": user.role}


@app.get("/auth/me/summary")
def my_summary(user: User = Depends(current_user), db: DbSession = Depends(get_db)) -> dict:
    return {
        "analyses": db.scalar(select(func.count(Analysis.id)).where(Analysis.user_id == user.id)) or 0,
        "inquiries": db.scalar(select(func.count(Inquiry.id)).where(Inquiry.user_id == user.id)) or 0,
    }


@app.get("/models")
def list_models(user: User = Depends(current_user), db: DbSession = Depends(get_db)) -> list[dict]:
    items = db.scalars(select(ModelArtifact).where(ModelArtifact.user_id == user.id).order_by(ModelArtifact.id.desc())).all()
    return [model_json(item) for item in items]


@app.post("/models", status_code=201)
async def upload_model(
    name: str,
    file: UploadFile = File(...),
    user: User = Depends(current_user),
    db: DbSession = Depends(get_db),
) -> dict:
    if Path(file.filename or "").suffix.lower() != ".pt":
        raise HTTPException(400, ".pt 모델 파일만 업로드할 수 있습니다.")
    target = STORAGE_DIR / "models" / str(user.id) / f"{uuid.uuid4().hex}.pt"
    size = await save_upload(file, target, MAX_MODEL_SIZE)
    item = ModelArtifact(user_id=user.id, name=name.strip()[:120], original_name=file.filename or "model.pt", path=str(target), size_bytes=size)
    db.add(item)
    db.commit()
    db.refresh(item)
    return model_json(item)


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
    suffix = Path(file.filename or "").suffix.lower()
    if suffix not in {".mp4", ".avi", ".mov", ".mkv", ".webm", ".jpg", ".jpeg", ".png", ".webp", ".bmp"}:
        raise HTTPException(400, "지원하지 않는 이미지 또는 동영상 형식입니다.")
    target = STORAGE_DIR / "videos" / str(user.id) / f"{uuid.uuid4().hex}{suffix}"
    size = await save_upload(file, target, MAX_VIDEO_SIZE)
    fps = frame_count = duration = None
    if suffix in {".mp4", ".avi", ".mov", ".mkv", ".webm"}:
        capture = cv2.VideoCapture(str(target))
        fps = capture.get(cv2.CAP_PROP_FPS) or None
        frame_count = int(capture.get(cv2.CAP_PROP_FRAME_COUNT)) or None
        duration = frame_count / fps if frame_count and fps else None
        capture.release()
    item = VideoAsset(user_id=user.id, name=file.filename or "video", path=str(target), size_bytes=size, fps=fps, frame_count=frame_count, duration_seconds=duration)
    db.add(item)
    db.commit()
    db.refresh(item)
    return video_json(item)


@app.get("/analyses")
def list_analyses(user: User = Depends(current_user), db: DbSession = Depends(get_db)) -> list[dict]:
    items = db.scalars(select(Analysis).where(Analysis.user_id == user.id).order_by(Analysis.id.desc())).all()
    return [analysis_json(item) for item in items]


@app.post("/analyses", status_code=202)
def create_analysis(
    body: AnalysisCreate,
    background_tasks: BackgroundTasks,
    user: User = Depends(current_user),
    db: DbSession = Depends(get_db),
) -> dict:
    model = db.scalar(select(ModelArtifact).where(ModelArtifact.id == body.model_id, ModelArtifact.user_id == user.id))
    video = db.scalar(select(VideoAsset).where(VideoAsset.id == body.video_id, VideoAsset.user_id == user.id))
    if not model or not video:
        raise HTTPException(404, "모델 또는 동영상을 찾을 수 없습니다.")
    item = Analysis(user_id=user.id, model_id=model.id, video_id=video.id, confidence=body.confidence, frame_stride=body.frame_stride)
    db.add(item)
    db.commit()
    db.refresh(item)
    background_tasks.add_task(run_analysis, item.id)
    return analysis_json(item)


@app.get("/analyses/{analysis_id}")
def get_analysis(analysis_id: int, user: User = Depends(current_user), db: DbSession = Depends(get_db)) -> dict:
    item = db.scalar(select(Analysis).where(Analysis.id == analysis_id, Analysis.user_id == user.id))
    if not item:
        raise HTTPException(404, "분석 기록을 찾을 수 없습니다.")
    return analysis_json(item, detail=True)


@app.get("/analyses/{analysis_id}/output")
def analysis_output(analysis_id: int, download: bool = False, user: User = Depends(current_user), db: DbSession = Depends(get_db)) -> FileResponse:
    item = db.scalar(select(Analysis).where(Analysis.id == analysis_id, Analysis.user_id == user.id))
    if not item or not item.output_path or not Path(item.output_path).exists():
        raise HTTPException(404, "결과 동영상을 찾을 수 없습니다.")
    is_image = Path(item.output_path).suffix.lower() in {".jpg", ".jpeg", ".png", ".webp", ".bmp"}
    suffix = Path(item.output_path).suffix.lower()
    filename = f"floatwatch-result-{item.id}{suffix}" if download else None
    return FileResponse(item.output_path, media_type="image/jpeg" if is_image else "video/mp4", filename=filename)
