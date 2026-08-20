import io
import os
import zipfile
from concurrent.futures import Future
from datetime import datetime, timezone
from pathlib import Path
from types import SimpleNamespace

import cv2
import numpy as np
import pytest

from app import main
from app.analysis_service import ANALYSIS_ERROR_MESSAGES, AnalysisResourceLimit, AnalysisTimeout, InvalidAnalysisTransition, advance_progress, classify_analysis_error, cleanup_analysis_artifacts, finalize_analysis, log_frame_count_mismatch, normalize_video_metadata, run_analysis, transition_analysis
from app.models import Analysis, ClassStat, FrameMetric, ModelArtifact, RealtimeSession, Session, User
from app.storage_security import ensure_within_storage, normalize_upload_name
from app.storage_security import InsufficientStorageError, ensure_disk_capacity


def register(client, name: str, email: str):
    return client.post("/auth/register", json={"name": name, "email": email, "password": "password123"})


def pt_checkpoint_bytes(payload_size: int = 2048) -> bytes:
    output = io.BytesIO()
    with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_STORED) as archive:
        archive.writestr("model/data.pkl", b"checkpoint metadata")
        archive.writestr("model/version", b"3")
        archive.writestr("model/data/0", os.urandom(payload_size))
    return output.getvalue()


def test_analysis_progress_only_moves_forward():
    analysis = Analysis(progress=18)
    advance_progress(analysis, 8)
    assert analysis.progress == 18
    advance_progress(analysis, 92)
    assert analysis.progress == 92
    advance_progress(analysis, 120)
    assert analysis.progress == 99


def test_unreliable_video_metadata_is_normalized(caplog):
    fps, width, height, total_frames = normalize_video_metadata(float("nan"), 1920, 1080, -1)
    assert fps == 30.0
    assert (width, height, total_frames) == (1920, 1080, 0)

    fps, width, height, total_frames = normalize_video_metadata(1000, float("nan"), 0, 1_000_000_000)
    assert fps == 30.0
    assert (width, height, total_frames) == (0, 0, 0)

    assert log_frame_count_mismatch(7, 1000, 980) is False
    assert log_frame_count_mismatch(7, 1000, 700) is True
    assert "video_frame_count_mismatch" in caplog.text


def test_authentication_and_inactive_user(client):
    admin = register(client, "관리자", "admin@example.com")
    assert admin.status_code == 201
    assert admin.json()["role"] == "admin"

    client.post("/auth/logout")
    member = register(client, "사용자", "user@example.com")
    assert member.status_code == 201
    member_id = member.json()["id"]
    with client.app.state.testing_session() as db:
        assert db.query(Session).filter_by(user_id=member_id).count() == 1

    client.post("/auth/logout")
    assert client.post("/auth/login", json={"email": "admin@example.com", "password": "password123"}).status_code == 200
    assert client.patch(f"/admin/users/{member_id}", json={"active": False, "reason": "이용 정책 점검"}).status_code == 200
    with client.app.state.testing_session() as db:
        assert db.query(Session).filter_by(user_id=member_id).count() == 0

    client.post("/auth/logout")
    denied = client.post("/auth/login", json={"email": "user@example.com", "password": "password123"})
    assert denied.status_code == 403
    assert "floatwatch_session" not in client.cookies


def test_login_rate_limit_returns_retry_after(client, monkeypatch):
    monkeypatch.setitem(main.RATE_LIMIT_RULES, "login_account", (2, 60))
    payload = {"email": "limited@example.com", "password": "wrong-password"}

    assert client.post("/auth/login", json=payload).status_code == 401
    assert client.post("/auth/login", json=payload).status_code == 401
    limited = client.post("/auth/login", json=payload)

    assert limited.status_code == 429
    assert limited.json()["detail"] == "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요."
    assert int(limited.headers["retry-after"]) > 0


def test_rate_limit_sliding_window_reopens_after_window(monkeypatch):
    monkeypatch.setitem(main.RATE_LIMIT_RULES, "analysis", (2, 10))
    with main.rate_limit_lock:
        main.rate_limit_events.clear()

    main.enforce_rate_limit("analysis", "user-1", now=100)
    main.enforce_rate_limit("analysis", "user-1", now=101)
    with pytest.raises(main.HTTPException) as blocked:
        main.enforce_rate_limit("analysis", "user-1", now=102)
    assert blocked.value.status_code == 429

    main.enforce_rate_limit("analysis", "user-1", now=111)


def test_analysis_resource_failures_have_distinct_codes():
    assert classify_analysis_error(AnalysisTimeout("late")) == "ANALYSIS_TIMEOUT"
    assert classify_analysis_error(AnalysisResourceLimit("too many frames")) == "RESOURCE_LIMIT_EXCEEDED"
    assert classify_analysis_error(MemoryError()) == "RESOURCE_LIMIT_EXCEEDED"


def test_server_queue_limit_rejects_analysis_without_creating_record(client, monkeypatch):
    register(client, "queue user", "queue-limit@example.com")
    model = client.post(
        "/models?name=queue-model",
        files={"file": ("queue.pt", pt_checkpoint_bytes(), "application/octet-stream")},
    ).json()
    image = np.zeros((24, 32, 3), dtype=np.uint8)
    _, encoded = cv2.imencode(".jpg", image)
    media = client.post(
        "/videos",
        files={"file": ("queue.jpg", encoded.tobytes(), "image/jpeg")},
    ).json()
    monkeypatch.setattr(main, "MAX_SERVER_ANALYSIS_JOBS", 0)

    blocked = client.post(
        "/analyses",
        json={"model_id": model["id"], "video_id": media["id"], "confidence": 0.25, "frame_stride": 1},
    )

    assert blocked.status_code == 503
    assert blocked.headers["retry-after"] == "30"
    assert "분석 요청이 많습니다" in blocked.json()["detail"]
    assert client.get("/analyses").json() == []


def test_password_change_requires_current_password_and_revokes_sessions(client):
    register(client, "관리자", "admin@example.com")
    client.post("/auth/logout")
    register(client, "사용자", "user@example.com")

    wrong = client.patch(
        "/auth/me/password",
        json={"current_password": "wrong-password", "new_password": "new-password123"},
    )
    assert wrong.status_code == 401
    assert client.get("/auth/me").json()["name"] == "사용자"

    changed = client.patch(
        "/auth/me/password",
        json={"current_password": "password123", "new_password": "new-password123"},
    )
    assert changed.status_code == 204
    assert client.get("/auth/me").status_code == 401
    assert client.post("/auth/login", json={"email": "user@example.com", "password": "password123"}).status_code == 401
    relogin = client.post("/auth/login", json={"email": "user@example.com", "password": "new-password123"})
    assert relogin.status_code == 200


def test_account_deletion_requires_confirmation_and_password(client):
    register(client, "관리자", "admin@example.com")
    client.post("/auth/logout")
    register(client, "사용자", "user@example.com")

    model = client.post(
        "/models?name=delete-me",
        files={"file": ("delete-me.pt", pt_checkpoint_bytes(), "application/octet-stream")},
    )
    assert model.status_code == 201
    image = np.zeros((24, 32, 3), dtype=np.uint8)
    _, encoded = cv2.imencode(".jpg", image)
    media = client.post("/videos", files={"file": ("delete-me.jpg", encoded.tobytes(), "image/jpeg")})
    assert media.status_code == 201
    inquiry = client.post("/inquiries", json={"title": "탈퇴 전 문의", "content": "함께 삭제될 문의입니다."})
    assert inquiry.status_code == 201
    attachment = client.post(
        f"/inquiries/{inquiry.json()['id']}/attachments",
        files={"file": ("note.txt", b"delete this attachment", "text/plain")},
    )
    assert attachment.status_code == 201
    assert list((main.STORAGE_DIR / "models").iterdir())
    assert list((main.STORAGE_DIR / "videos").iterdir())
    assert list((main.STORAGE_DIR / "attachments").iterdir())

    assert client.request("DELETE", "/auth/me", json={"confirmation": "탈퇴"}).status_code == 400
    assert client.request(
        "DELETE", "/auth/me", json={"confirmation": "회원 탈퇴", "current_password": "wrong-password"}
    ).status_code == 401

    deleted = client.request(
        "DELETE", "/auth/me", json={"confirmation": "회원 탈퇴", "current_password": "password123"}
    )
    assert deleted.status_code == 204
    assert not list((main.STORAGE_DIR / "models").iterdir())
    assert not list((main.STORAGE_DIR / "videos").iterdir())
    assert not list((main.STORAGE_DIR / "attachments").iterdir())
    assert client.get("/auth/me").status_code == 401
    assert client.post("/auth/login", json={"email": "user@example.com", "password": "password123"}).status_code == 401


def test_last_active_admin_cannot_delete_account(client):
    register(client, "관리자", "admin@example.com")
    blocked = client.request(
        "DELETE", "/auth/me", json={"confirmation": "회원 탈퇴", "current_password": "password123"}
    )
    assert blocked.status_code == 409


def test_board_permissions_and_comments(client):
    register(client, "관리자", "admin@example.com")
    client.post("/auth/logout")
    register(client, "사용자", "user@example.com")

    forbidden = client.post("/content", json={"category": "notice", "title": "공지", "content": "내용입니다."})
    assert forbidden.status_code == 403

    created = client.post("/content", json={"category": "free", "title": "관측 기록", "content": "부유물을 확인했습니다."})
    assert created.status_code == 201
    content_id = created.json()["id"]
    comment = client.post(f"/content/{content_id}/comments", json={"content": "좋은 정보입니다."})
    assert comment.status_code == 201
    assert client.get(f"/content/{content_id}").json()["comments"][0]["content"] == "좋은 정보입니다."

    assert [item["id"] for item in client.get("/content?category=free&q=관측").json()] == [content_id]
    assert [item["id"] for item in client.get("/content?category=free&q=부유물").json()] == [content_id]
    assert client.get("/content?category=free&q=없는검색어").json() == []

    updated = client.patch(f"/content/{content_id}", json={"title": "수정한 관측 기록"})
    assert updated.status_code == 200
    assert updated.json()["title"] == "수정한 관측 기록"

    client.post("/auth/logout")
    register(client, "다른 사용자", "other-board@example.com")
    assert client.patch(f"/content/{content_id}", json={"title": "권한 없는 수정"}).status_code == 403
    assert client.delete(f"/content/{content_id}").status_code == 403

    client.post("/auth/logout")
    assert client.post("/auth/login", json={"email": "user@example.com", "password": "password123"}).status_code == 200
    assert client.delete(f"/content/{content_id}").status_code == 204


def test_inquiry_answer_notification_and_owner_permissions(client):
    register(client, "관리자", "admin@example.com")
    client.post("/auth/logout")
    register(client, "문의 작성자", "owner@example.com")
    inquiry = client.post("/inquiries", json={"title": "분석 문의", "content": "결과 확인 방법이 궁금합니다."})
    assert inquiry.status_code == 201
    inquiry_id = inquiry.json()["id"]
    attachment = client.post(
        f"/inquiries/{inquiry_id}/attachments",
        files={"file": ("question.txt", b"private inquiry", "text/plain")},
    )
    assert attachment.status_code == 201
    attachment_id = attachment.json()["id"]

    client.post("/auth/logout")
    register(client, "다른 사용자", "other@example.com")
    assert client.get(f"/inquiries/{inquiry_id}").status_code == 404
    assert client.patch(f"/inquiries/{inquiry_id}/read").status_code == 404
    assert client.get(f"/inquiry-attachments/{attachment_id}").status_code == 404
    assert all(item["id"] != inquiry_id for item in client.get("/inquiries").json())

    client.post("/auth/logout")
    assert client.post("/auth/login", json={"email": "admin@example.com", "password": "password123"}).status_code == 200
    answered = client.patch(
        f"/inquiries/{inquiry_id}/answer",
        json={"answer": "탐색 기록에서 결과를 확인할 수 있습니다.", "reason": "사용 방법 안내"},
    )
    assert answered.status_code == 200
    assert answered.json()["status"] == "answered"
    assert answered.json()["has_new_answer"] is True
    assert client.get(f"/inquiry-attachments/{attachment_id}").status_code == 200

    client.post("/auth/logout")
    assert client.post("/auth/login", json={"email": "owner@example.com", "password": "password123"}).status_code == 200
    unread = client.get(f"/inquiries/{inquiry_id}")
    assert unread.status_code == 200
    assert unread.json()["has_new_answer"] is True
    read = client.patch(f"/inquiries/{inquiry_id}/read")
    assert read.status_code == 200
    assert read.json()["has_new_answer"] is False
    assert client.get("/inquiries").json()[0]["has_new_answer"] is False


def test_upload_validation(client):
    register(client, "관리자", "admin@example.com")

    unsupported_media = client.post(
        "/videos",
        files={"file": ("sample.txt", b"not media", "text/plain")},
    )
    assert unsupported_media.status_code == 400

    empty_model = client.post("/models?name=test", files={"file": ("model.pt", b"", "application/octet-stream")})
    assert empty_model.status_code == 400
    tiny_model = client.post("/models?name=test", files={"file": ("model.pt", b"x" * 100, "application/octet-stream")})
    assert tiny_model.status_code == 400
    fake_model = client.post(
        "/models?name=fake",
        files={"file": ("renamed.pt", b"not a pytorch checkpoint" * 100, "application/octet-stream")},
    )
    assert fake_model.status_code == 400
    bad_image = client.post("/videos", files={"file": ("sample.jpg", b"not-an-image", "image/jpeg")})
    assert bad_image.status_code == 400
    corrupted_image = client.post(
        "/videos",
        files={"file": ("corrupted.jpg", b"\xff\xd8\xff" + b"broken-image-data", "image/jpeg")},
    )
    assert corrupted_image.status_code == 400
    assert "손상" in corrupted_image.json()["detail"]
    corrupted_video = client.post(
        "/videos",
        files={"file": ("corrupted.mp4", b"\x00\x00\x00\x18ftypisom" + b"broken-video-data", "video/mp4")},
    )
    assert corrupted_video.status_code == 400

    image = np.zeros((24, 32, 3), dtype=np.uint8)
    ok, encoded = cv2.imencode(".jpg", image)
    assert ok
    uploaded = client.post("/videos", files={"file": ("sample.jpg", encoded.tobytes(), "image/jpeg")})
    assert uploaded.status_code == 201
    assert uploaded.json()["media_type"] == "image"

    disguised_image = client.post(
        "/videos",
        files={"file": ("renamed.png", encoded.tobytes(), "image/png")},
    )
    assert disguised_image.status_code == 400
    disguised_video = client.post(
        "/videos",
        files={"file": ("renamed.mp4", encoded.tobytes(), "video/mp4")},
    )
    assert disguised_video.status_code == 400
    assert len(client.get("/videos").json()) == 1

    model_files = list((main.STORAGE_DIR / "models").rglob("*")) if (main.STORAGE_DIR / "models").exists() else []
    assert not [path for path in model_files if path.is_file()]


def test_storage_quota_and_unused_asset_deletion(client, monkeypatch):
    register(client, "관리자", "admin@example.com")
    monkeypatch.setattr(main, "USER_STORAGE_LIMIT", 1024)
    over_quota = client.post(
        "/models?name=large-model",
        files={"file": ("model.pt", pt_checkpoint_bytes(), "application/octet-stream")},
    )
    assert over_quota.status_code == 413

    monkeypatch.setattr(main, "USER_STORAGE_LIMIT", 10 * 1024)
    model = client.post(
        "/models?name=unused-model",
        files={"file": ("model.pt", pt_checkpoint_bytes(), "application/octet-stream")},
    )
    assert model.status_code == 201
    assert client.delete(f"/models/{model.json()['id']}").status_code == 204


def test_analysis_is_scoped_to_owner(client):
    register(client, "관리자", "admin@example.com")
    model = client.post(
        "/models?name=demo-model",
        files={"file": ("model.pt", pt_checkpoint_bytes(), "application/octet-stream")},
    ).json()
    image = np.zeros((24, 32, 3), dtype=np.uint8)
    _, encoded = cv2.imencode(".jpg", image)
    media = client.post("/videos", files={"file": ("sample.jpg", encoded.tobytes(), "image/jpeg")}).json()
    analysis = client.post("/analyses", json={"model_id": model["id"], "video_id": media["id"], "confidence": 0.25, "frame_stride": 3})
    assert analysis.status_code == 202
    analysis_id = analysis.json()["id"]

    client.post("/auth/logout")
    register(client, "다른 사용자", "other@example.com")
    assert client.get(f"/analyses/{analysis_id}").status_code == 404


def test_analysis_output_requires_completed_and_valid_result_file(client):
    register(client, "결과 검증 사용자", "result-validation@example.com")
    model = client.post(
        "/models?name=demo-model",
        files={"file": ("model.pt", pt_checkpoint_bytes(), "application/octet-stream")},
    ).json()
    image = np.zeros((24, 32, 3), dtype=np.uint8)
    _, encoded = cv2.imencode(".jpg", image)
    media = client.post(
        "/videos",
        files={"file": ("sample.jpg", encoded.tobytes(), "image/jpeg")},
    ).json()
    created = client.post(
        "/analyses",
        json={"model_id": model["id"], "video_id": media["id"], "confidence": 0.25, "frame_stride": 1},
    ).json()

    assert client.get(f"/analyses/{created['id']}/output").status_code == 409

    result_path = main.STORAGE_DIR / "outputs" / f"analysis-{created['id']}.jpg"
    result_path.parent.mkdir(parents=True, exist_ok=True)
    result_path.write_bytes(b"")
    with client.app.state.testing_session() as db:
        stored = db.get(Analysis, created["id"])
        stored.status = "completed"
        stored.progress = 100
        stored.output_path = str(result_path)
        db.commit()

    assert client.get(f"/analyses/{created['id']}/output").status_code == 404

    result_path.write_bytes(encoded.tobytes())
    valid = client.get(f"/analyses/{created['id']}/output")
    assert valid.status_code == 200
    assert valid.headers["content-type"].startswith("image/jpeg")

    working_path = main.STORAGE_DIR / "outputs" / f"analysis-{created['id']}-working.mp4"
    working_path.write_bytes(b"partial video")
    with client.app.state.testing_session() as db:
        stored = db.get(Analysis, created["id"])
        stored.status = "failed"
        stored.progress = 63
        stored.total_detections = 4
        stored.processed_frames = 2
        stored.avg_confidence = 0.44
        stored.processing_fps = 1.2
        db.add(FrameMetric(analysis_id=stored.id, frame_number=0, timestamp_seconds=0, detection_count=2, avg_confidence=0.44, has_masks=False))
        db.add(ClassStat(analysis_id=stored.id, class_id=0, class_name="PET_Bottle", count=2, avg_confidence=0.44))
        db.commit()

        cleanup_analysis_artifacts(db, stored)
        db.commit()

    with client.app.state.testing_session() as db:
        cleaned = db.get(Analysis, created["id"])
        assert cleaned.progress == 63
        assert cleaned.output_path is None
        assert cleaned.total_detections == 0
        assert cleaned.processed_frames == 0
        assert cleaned.avg_confidence is None
        assert cleaned.processing_fps is None
        assert db.query(FrameMetric).filter_by(analysis_id=cleaned.id).count() == 0
        assert db.query(ClassStat).filter_by(analysis_id=cleaned.id).count() == 0
    assert not result_path.exists()
    assert not working_path.exists()

    result_path.write_bytes(encoded.tobytes())
    with client.app.state.testing_session() as db:
        cleaned = db.get(Analysis, created["id"])
        cleaned.status = "processing"
        db.commit()
        finalize_analysis(
            db,
            cleaned,
            result_path,
            [{"frame_number": 0, "timestamp_seconds": 0, "detection_count": 1, "avg_confidence": 0.81, "has_masks": False}],
            {0: [0.81]},
            {0: "PET_Bottle"},
            1,
            1,
            0.81,
            2.5,
        )

    with client.app.state.testing_session() as db:
        completed = db.get(Analysis, created["id"])
        assert completed.status == "completed"
        assert completed.progress == 100
        assert completed.output_path == str(result_path)
        assert db.query(FrameMetric).filter_by(analysis_id=completed.id).count() == 1
        assert db.query(ClassStat).filter_by(analysis_id=completed.id).count() == 1


def test_user_cannot_create_multiple_active_analyses(client):
    register(client, "분석 사용자", "analysis@example.com")
    model = client.post(
        "/models?name=demo-model",
        files={"file": ("model.pt", pt_checkpoint_bytes(), "application/octet-stream")},
    ).json()
    image = np.zeros((24, 32, 3), dtype=np.uint8)
    _, encoded = cv2.imencode(".jpg", image)
    media = client.post("/videos", files={"file": ("sample.jpg", encoded.tobytes(), "image/jpeg")}).json()
    payload = {"model_id": model["id"], "video_id": media["id"], "confidence": 0.25, "frame_stride": 1}

    first = client.post("/analyses", json=payload)
    second = client.post("/analyses", json=payload)

    assert first.status_code == 202
    assert second.status_code == 409
    assert "이미 진행 중인 분석" in second.json()["detail"]
    assert len(client.get("/analyses").json()) == 1


def test_cancelled_analysis_has_distinct_status_and_can_retry(client):
    register(client, "analysis user", "cancelled-analysis@example.com")
    model = client.post(
        "/models?name=demo-model",
        files={"file": ("model.pt", pt_checkpoint_bytes(), "application/octet-stream")},
    ).json()
    image = np.zeros((24, 32, 3), dtype=np.uint8)
    _, encoded = cv2.imencode(".jpg", image)
    media = client.post(
        "/videos",
        files={"file": ("sample.jpg", encoded.tobytes(), "image/jpeg")},
    ).json()
    payload = {
        "model_id": model["id"],
        "video_id": media["id"],
        "confidence": 0.25,
        "frame_stride": 1,
    }

    created = client.post("/analyses", json=payload)
    assert created.status_code == 202

    cancelled = client.post(f"/analyses/{created.json()['id']}/cancel")
    assert cancelled.status_code == 200
    assert cancelled.json()["status"] == "cancelled"
    assert cancelled.json()["error_code"] == "USER_CANCELLED"
    assert cancelled.json()["error_message"]

    retried = client.post(f"/analyses/{created.json()['id']}/retry")
    assert retried.status_code == 202
    assert retried.json()["status"] == "queued"
    assert retried.json()["id"] != created.json()["id"]

    records = client.get("/analyses").json()
    assert [record["status"] for record in records] == ["queued", "cancelled"]


def test_admin_audit_log_records_actor_target_time_and_reason(client):
    admin = register(client, "관리자", "admin@example.com").json()
    client.post("/auth/logout")
    member = register(client, "사용자", "user@example.com").json()
    client.post("/auth/logout")
    assert client.post("/auth/login", json={"email": "admin@example.com", "password": "password123"}).status_code == 200

    changed = client.patch(
        f"/admin/users/{member['id']}",
        json={"active": False, "reason": "반복된 운영 정책 위반"},
    )
    assert changed.status_code == 200

    logs = client.get("/admin/audit-logs")
    assert logs.status_code == 200
    entry = logs.json()[0]
    assert entry["actor"] == {"id": admin["id"], "name": "관리자"}
    assert entry["action"] == "user.update"
    assert entry["target_type"] == "user"
    assert entry["target_id"] == str(member["id"])
    assert entry["reason"] == "반복된 운영 정책 위반"
    assert entry["before"] == {"role": "user", "active": True}
    assert entry["after"] == {"role": "user", "active": False}
    assert entry["created_at"]

    client.post("/auth/logout")
    assert client.post("/auth/login", json={"email": "user@example.com", "password": "password123"}).status_code == 403


def test_audit_log_is_admin_only(client):
    register(client, "관리자", "admin@example.com")
    client.post("/auth/logout")
    register(client, "사용자", "user@example.com")
    assert client.get("/admin/audit-logs").status_code == 403


def test_admin_server_side_pagination_contracts(client):
    register(client, "관리자", "admin@example.com")
    client.post("/auth/logout")
    register(client, "사용자", "user@example.com")
    client.post("/inquiries", json={"title": "페이지 문의", "content": "관리자 페이지 목록 확인용 문의입니다."})
    client.post("/auth/logout")
    assert client.post("/auth/login", json={"email": "admin@example.com", "password": "password123"}).status_code == 200

    users = client.get("/admin/users-page?page=1&page_size=1")
    assert users.status_code == 200
    assert len(users.json()["items"]) == 1
    assert users.json()["total"] == 2
    assert users.json()["pages"] == 2

    analyses = client.get("/admin/analyses-page?page=1&page_size=10&status=failed")
    assert analyses.status_code == 200
    assert analyses.json()["items"] == []
    assert analyses.json()["counts"]["failed"] == 0

    inquiries = client.get("/admin/inquiries-page?page=1&page_size=10")
    assert inquiries.status_code == 200
    assert inquiries.json()["total"] == 1
    assert inquiries.json()["pending"] == 1

    audit_logs = client.get("/admin/audit-logs-page?page=1&page_size=10")
    assert audit_logs.status_code == 200
    assert {"items", "total", "page", "page_size", "pages"} <= audit_logs.json().keys()


def test_missing_model_is_quarantined_before_analysis_record_is_created(client):
    register(client, "관리자", "admin@example.com")
    model = client.post(
        "/models?name=missing-model",
        files={"file": ("missing.pt", pt_checkpoint_bytes(), "application/octet-stream")},
    ).json()
    image = np.zeros((24, 32, 3), dtype=np.uint8)
    _, encoded = cv2.imencode(".jpg", image)
    media = client.post("/videos", files={"file": ("sample.jpg", encoded.tobytes(), "image/jpeg")}).json()

    testing_session = client.app.state.testing_session
    with testing_session() as db:
        stored_model = db.get(ModelArtifact, model["id"])
        os.remove(stored_model.path)

    response = client.post(
        "/analyses",
        json={"model_id": model["id"], "video_id": media["id"], "confidence": 0.25, "frame_stride": 1},
    )
    assert response.status_code == 409
    assert "존재하지 않습니다" in response.json()["detail"]
    assert client.get("/analyses").json() == []
    assert client.get("/models").json() == []
    quarantined = client.get("/models/quarantined").json()
    assert quarantined[0]["id"] == model["id"]
    assert quarantined[0]["quarantined"] is True


def test_model_load_failure_quarantines_file_and_blocks_reuse(client, monkeypatch):
    register(client, "관리자", "admin@example.com")
    model = client.post(
        "/models?name=broken-model",
        files={"file": ("broken.pt", pt_checkpoint_bytes(), "application/octet-stream")},
    ).json()
    image = np.zeros((24, 32, 3), dtype=np.uint8)
    _, encoded = cv2.imencode(".jpg", image)
    media = client.post("/videos", files={"file": ("sample.jpg", encoded.tobytes(), "image/jpeg")}).json()

    analysis = client.post(
        "/analyses",
        json={"model_id": model["id"], "video_id": media["id"], "confidence": 0.25, "frame_stride": 1},
    ).json()
    testing_session = client.app.state.testing_session
    monkeypatch.setattr("app.analysis_service.SessionLocal", testing_session)
    monkeypatch.setattr("ultralytics.YOLO", lambda _path: (_ for _ in ()).throw(RuntimeError("invalid checkpoint")))
    run_analysis(analysis["id"])

    with testing_session() as db:
        stored_model = db.get(ModelArtifact, model["id"])
        stored_analysis = db.get(Analysis, analysis["id"])
        assert stored_model.quarantined is True
        assert "invalid checkpoint" in stored_model.quarantine_reason
        assert stored_model.quarantined_at is not None
        assert "quarantine" in stored_model.path
        assert stored_analysis.status == "failed"
        assert stored_analysis.error_code == "MODEL_LOAD_FAILED"
        assert stored_analysis.error_message == "AI 모델을 불러오지 못했습니다."
        assert "invalid checkpoint" not in stored_analysis.error_message

    assert client.get("/models").json() == []
    quarantined = client.get("/models/quarantined")
    assert quarantined.status_code == 200
    assert quarantined.json()[0]["id"] == model["id"]
    assert quarantined.json()[0]["quarantined"] is True
    retry = client.post(
        "/analyses",
        json={"model_id": model["id"], "video_id": media["id"], "confidence": 0.25, "frame_stride": 1},
    )
    assert retry.status_code == 404


def test_upload_names_are_normalized_and_storage_escape_is_blocked(client, tmp_path):
    assert normalize_upload_name(r"..\..\CON.txt") == "_CON.txt"
    assert normalize_upload_name("folder/hello\x00world.png") == "hello_world.png"
    assert len(normalize_upload_name("a" * 300 + ".jpg")) <= 180

    register(client, "관리자", "admin@example.com")
    image = np.zeros((24, 32, 3), dtype=np.uint8)
    _, encoded = cv2.imencode(".jpg", image)
    uploaded = client.post(
        "/videos",
        files={"file": (r"..\..\CON.jpg", encoded.tobytes(), "image/jpeg")},
    )
    assert uploaded.status_code == 201
    assert uploaded.json()["name"] == "_CON.jpg"

    outside = tmp_path.parent / "outside.txt"
    outside.write_text("keep", encoding="utf-8")
    try:
        ensure_within_storage(outside, main.STORAGE_DIR)
        assert False, "storage escape must be rejected"
    except ValueError:
        pass
    assert outside.read_text(encoding="utf-8") == "keep"


def test_disk_capacity_guard_rejects_upload_and_analysis(client, monkeypatch):
    register(client, "관리자", "admin@example.com")

    monkeypatch.setattr(
        main,
        "ensure_disk_capacity",
        lambda *_args, **_kwargs: (_ for _ in ()).throw(InsufficientStorageError("full")),
    )
    refused = client.post(
        "/models?name=no-space",
        files={"file": ("model.pt", pt_checkpoint_bytes(), "application/octet-stream")},
    )
    assert refused.status_code == 507
    model_files = list((main.STORAGE_DIR / "models").rglob("*")) if (main.STORAGE_DIR / "models").exists() else []
    assert not [path for path in model_files if path.is_file()]

    monkeypatch.setattr(main, "ensure_disk_capacity", ensure_disk_capacity)
    model = client.post(
        "/models?name=valid",
        files={"file": ("model.pt", pt_checkpoint_bytes(), "application/octet-stream")},
    ).json()
    image = np.zeros((24, 32, 3), dtype=np.uint8)
    _, encoded = cv2.imencode(".jpg", image)
    media = client.post("/videos", files={"file": ("sample.jpg", encoded.tobytes(), "image/jpeg")}).json()

    monkeypatch.setattr(
        main,
        "ensure_disk_capacity",
        lambda *_args, **_kwargs: (_ for _ in ()).throw(InsufficientStorageError("full")),
    )
    blocked = client.post(
        "/analyses",
        json={"model_id": model["id"], "video_id": media["id"], "confidence": 0.25, "frame_stride": 1},
    )
    assert blocked.status_code == 507
    assert client.get("/analyses").json() == []


def create_analysis_fixture(client, email: str):
    register(client, "analysis lifecycle user", email)
    model = client.post(
        "/models?name=demo-model",
        files={"file": ("model.pt", pt_checkpoint_bytes(), "application/octet-stream")},
    ).json()
    image = np.zeros((24, 32, 3), dtype=np.uint8)
    _, encoded = cv2.imencode(".jpg", image)
    media = client.post(
        "/videos",
        files={"file": ("sample.jpg", encoded.tobytes(), "image/jpeg")},
    ).json()
    created = client.post(
        "/analyses",
        json={"model_id": model["id"], "video_id": media["id"], "confidence": 0.25, "frame_stride": 1},
    ).json()
    return model, media, created, encoded.tobytes()


def test_normalize_analysis_records_repairs_legacy_terminal_states(client):
    _, _, cancelled_record, _ = create_analysis_fixture(client, "normalize-records@example.com")
    with client.app.state.testing_session() as db:
        cancelled = db.get(Analysis, cancelled_record["id"])
        cancelled.status = "failed"
        cancelled.error_code = "USER_CANCELLED"
        cancelled.error_message = "legacy cancellation message"
        cancelled.output_path = str(main.STORAGE_DIR / "outputs" / f"analysis-{cancelled.id}.jpg")
        Path(cancelled.output_path).parent.mkdir(parents=True, exist_ok=True)
        Path(cancelled.output_path).write_bytes(b"partial")
        db.add(FrameMetric(analysis_id=cancelled.id, frame_number=0, timestamp_seconds=0, detection_count=1, avg_confidence=.5, has_masks=False))
        db.commit()

        repaired = main.normalize_analysis_records(db)
        db.commit()

        assert repaired["cancelled"] == 1
        assert cancelled.status == "cancelled"
        assert cancelled.error_code == "USER_CANCELLED"
        assert cancelled.error_message == ANALYSIS_ERROR_MESSAGES["USER_CANCELLED"]
        assert cancelled.output_path is None
        assert db.query(FrameMetric).filter_by(analysis_id=cancelled.id).count() == 0


def test_normalize_analysis_records_rejects_completed_record_without_output(client):
    _, _, created, _ = create_analysis_fixture(client, "normalize-invalid-completed@example.com")
    with client.app.state.testing_session() as db:
        analysis = db.get(Analysis, created["id"])
        analysis.status = "completed"
        analysis.progress = 100
        analysis.output_path = None
        analysis.error_code = "INFERENCE_FAILED"
        analysis.error_message = "stale error"
        db.add(ClassStat(analysis_id=analysis.id, class_id=0, class_name="PET_Bottle", count=1, avg_confidence=.7))
        db.commit()

        repaired = main.normalize_analysis_records(db)
        db.commit()

        assert repaired["invalid_completed"] == 1
        assert analysis.status == "failed"
        assert analysis.error_code == "OUTPUT_CREATE_FAILED"
        assert analysis.error_message == ANALYSIS_ERROR_MESSAGES["OUTPUT_CREATE_FAILED"]
        assert analysis.output_path is None
        assert db.query(ClassStat).filter_by(analysis_id=analysis.id).count() == 0


def test_processing_analysis_can_be_cancelled_and_cleans_partial_results(client):
    _, _, created, _ = create_analysis_fixture(client, "processing-cancel@example.com")
    working_path = main.STORAGE_DIR / "outputs" / f"analysis-{created['id']}-working.mp4"
    working_path.parent.mkdir(parents=True, exist_ok=True)
    working_path.write_bytes(b"partial")
    with client.app.state.testing_session() as db:
        analysis = db.get(Analysis, created["id"])
        analysis.status = "processing"
        analysis.progress = 48
        db.add(FrameMetric(analysis_id=analysis.id, frame_number=0, timestamp_seconds=0, detection_count=1, avg_confidence=0.5, has_masks=False))
        db.commit()

    cancelled = client.post(f"/analyses/{created['id']}/cancel")
    assert cancelled.status_code == 200
    assert cancelled.json()["status"] == "cancelled"
    with client.app.state.testing_session() as db:
        analysis = db.get(Analysis, created["id"])
        cleanup_analysis_artifacts(db, analysis)
        db.commit()
        assert db.query(FrameMetric).filter_by(analysis_id=analysis.id).count() == 0
        assert db.query(ClassStat).filter_by(analysis_id=analysis.id).count() == 0
        assert analysis.output_path is None
    assert not working_path.exists()


def test_retry_request_is_blocked_while_retried_analysis_is_active(client):
    _, _, source, _ = create_analysis_fixture(client, "retry-conflict@example.com")
    client.post(f"/analyses/{source['id']}/cancel")
    first_retry = client.post(f"/analyses/{source['id']}/retry")
    second_retry = client.post(f"/analyses/{source['id']}/retry")
    assert first_retry.status_code == 202
    assert second_retry.status_code == 409
    assert len(client.get("/analyses").json()) == 2


def test_restart_recovery_fails_processing_and_preserves_queued_work(client):
    model, media, created, _ = create_analysis_fixture(client, "restart@example.com")
    with client.app.state.testing_session() as db:
        processing = db.get(Analysis, created["id"])
        processing.status = "processing"
        processing.output_path = str(main.STORAGE_DIR / "outputs" / f"analysis-{processing.id}.jpg")
        queued = Analysis(user_id=processing.user_id, model_id=model["id"], video_id=media["id"], status="queued")
        db.add(queued)
        db.flush()
        queued_id = queued.id
        db.add(ClassStat(analysis_id=processing.id, class_id=0, class_name="PET_Bottle", count=1, avg_confidence=0.5))
        db.commit()

        queued_ids = main.recover_interrupted_analyses(db)
        db.commit()
        recovered = db.get(Analysis, created["id"])
        assert recovered.status == "failed"
        assert recovered.error_code == "SERVER_RESTARTED"
        assert recovered.error_message == ANALYSIS_ERROR_MESSAGES["SERVER_RESTARTED"]
        assert recovered.output_path is None
        assert db.query(ClassStat).filter_by(analysis_id=recovered.id).count() == 0
        assert queued_ids == [queued_id]
        assert db.get(Analysis, queued_id).status == "queued"


def test_restart_recovery_fails_queued_work_with_missing_input(client):
    _, _, created, _ = create_analysis_fixture(client, "restart-missing@example.com")
    with client.app.state.testing_session() as db:
        queued = db.get(Analysis, created["id"])
        queued.status = "queued"
        os.remove(queued.video.path)
        db.commit()

        queued_ids = main.recover_interrupted_analyses(db)
        db.commit()
        recovered = db.get(Analysis, created["id"])
        assert queued_ids == []
        assert recovered.status == "failed"
        assert recovered.error_code == "RECOVERY_INPUT_MISSING"
        assert recovered.error_message == ANALYSIS_ERROR_MESSAGES["RECOVERY_INPUT_MISSING"]


def test_other_user_cannot_download_completed_output(client):
    _, _, created, encoded = create_analysis_fixture(client, "output-owner@example.com")
    output = main.STORAGE_DIR / "outputs" / f"analysis-{created['id']}.jpg"
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_bytes(encoded)
    with client.app.state.testing_session() as db:
        analysis = db.get(Analysis, created["id"])
        analysis.status = "completed"
        analysis.progress = 100
        analysis.output_path = str(output)
        db.commit()

    client.post("/auth/logout")
    register(client, "other output user", "other-output@example.com")
    assert client.get(f"/analyses/{created['id']}/output").status_code == 404


def test_other_user_cannot_access_or_mutate_private_analysis_assets(client):
    model, media, created, _ = create_analysis_fixture(client, "private-owner@example.com")

    client.post("/auth/logout")
    register(client, "other private user", "private-other@example.com")

    assert client.get(f"/analyses/{created['id']}").status_code == 404
    assert client.post(f"/analyses/{created['id']}/cancel").status_code == 404
    assert client.post(f"/analyses/{created['id']}/retry").status_code == 404
    assert client.delete(f"/analyses/{created['id']}").status_code == 404
    assert client.get(f"/analyses/{created['id']}/output").status_code == 404
    assert client.get(f"/videos/{media['id']}/preview").status_code == 404
    assert client.delete(f"/videos/{media['id']}").status_code == 404
    assert client.delete(f"/models/{model['id']}").status_code == 404


def test_normal_user_cannot_access_admin_apis(client):
    register(client, "관리자", "admin-scope@example.com")
    client.post("/auth/logout")
    register(client, "일반 사용자", "member-scope@example.com")

    assert client.get("/admin/users").status_code == 403
    assert client.get("/admin/analyses").status_code == 403
    assert client.get("/admin/realtime-sessions").status_code == 403


def test_finalize_analysis_supports_zero_detections(client):
    _, _, created, encoded = create_analysis_fixture(client, "zero-detection@example.com")
    output = main.STORAGE_DIR / "outputs" / f"analysis-{created['id']}.jpg"
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_bytes(encoded)
    with client.app.state.testing_session() as db:
        analysis = db.get(Analysis, created["id"])
        transition_analysis(analysis, "processing")
        db.commit()
        finalize_analysis(
            db,
            analysis,
            output,
            [{"frame_number": 0, "timestamp_seconds": 0, "detection_count": 0, "avg_confidence": 0, "has_masks": False}],
            {},
            {},
            0,
            1,
            0,
            1.0,
        )

    detail = client.get(f"/analyses/{created['id']}")
    assert detail.status_code == 200
    assert detail.json()["status"] == "completed"
    assert detail.json()["total_detections"] == 0
    assert detail.json()["class_stats"] == []


def test_terminal_analysis_state_cannot_be_reopened(client):
    _, _, created, _ = create_analysis_fixture(client, "terminal-transition@example.com")
    with client.app.state.testing_session() as db:
        analysis = db.get(Analysis, created["id"])
        transition_analysis(analysis, "cancelled")
        db.commit()

        with pytest.raises(InvalidAnalysisTransition):
            transition_analysis(analysis, "processing")
        with pytest.raises(InvalidAnalysisTransition):
            transition_analysis(analysis, "completed")


def test_cancelled_analysis_cannot_be_finalized(client):
    _, _, created, encoded = create_analysis_fixture(client, "cancel-finalize@example.com")
    output = main.STORAGE_DIR / "outputs" / f"analysis-{created['id']}.jpg"
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_bytes(encoded)
    with client.app.state.testing_session() as db:
        analysis = db.get(Analysis, created["id"])
        transition_analysis(analysis, "cancelled")
        db.commit()

        with pytest.raises(InvalidAnalysisTransition):
            finalize_analysis(db, analysis, output, [], {}, {}, 0, 0, 0, 0)

        db.refresh(analysis)
        assert analysis.status == "cancelled"


def test_analysis_queue_deduplicates_and_releases_finished_work(monkeypatch):
    class DeferredExecutor:
        def __init__(self):
            self.submissions = 0
            self.futures: list[Future] = []

        def submit(self, _worker, _analysis_id):
            self.submissions += 1
            future = Future()
            self.futures.append(future)
            return future

    executor = DeferredExecutor()
    monkeypatch.setattr(main, "analysis_executor", executor)
    with main.analysis_queue_lock:
        main.analysis_futures.clear()

    assert main.enqueue_analysis(101) is True
    assert main.enqueue_analysis(101) is False
    assert executor.submissions == 1

    executor.futures[0].set_result(None)
    assert main.enqueue_analysis(101) is True
    assert executor.submissions == 2
    executor.futures[1].set_result(None)


def test_queued_analysis_future_can_be_cancelled(monkeypatch):
    class DeferredExecutor:
        def __init__(self):
            self.future = Future()

        def submit(self, _worker, _analysis_id):
            return self.future

    executor = DeferredExecutor()
    monkeypatch.setattr(main, "analysis_executor", executor)
    with main.analysis_queue_lock:
        main.analysis_futures.clear()

    assert main.enqueue_analysis(202) is True
    assert main.cancel_enqueued_analysis(202) is True
    assert executor.future.cancelled() is True
    with main.analysis_queue_lock:
        assert 202 not in main.analysis_futures


def test_delete_analysis_removes_final_and_partial_result_files(client):
    _, _, created, encoded = create_analysis_fixture(client, "delete-results@example.com")
    output = main.STORAGE_DIR / "outputs" / f"analysis-{created['id']}.jpg"
    working = main.STORAGE_DIR / "outputs" / f"analysis-{created['id']}-working.mp4"
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_bytes(encoded)
    working.write_bytes(b"partial")
    with client.app.state.testing_session() as db:
        analysis = db.get(Analysis, created["id"])
        transition_analysis(analysis, "processing")
        db.commit()
        finalize_analysis(db, analysis, output, [], {}, {}, 0, 1, 0, 1)

    deleted = client.delete(f"/analyses/{created['id']}")
    assert deleted.status_code == 204
    assert not output.exists()
    assert not working.exists()
    with client.app.state.testing_session() as db:
        assert db.get(Analysis, created["id"]) is None
        assert db.query(FrameMetric).filter_by(analysis_id=created["id"]).count() == 0
        assert db.query(ClassStat).filter_by(analysis_id=created["id"]).count() == 0


def test_model_used_by_realtime_history_is_protected(client):
    user = register(client, "realtime owner", "realtime-model-protect@example.com").json()
    model = client.post(
        "/models?name=live-model",
        files={"file": ("live.pt", pt_checkpoint_bytes(), "application/octet-stream")},
    ).json()
    with client.app.state.testing_session() as db:
        db.add(RealtimeSession(user_id=user["id"], model_id=model["id"], status="completed", total_events=0))
        db.commit()

    response = client.delete(f"/models/{model['id']}")
    assert response.status_code == 409
    assert "실시간 탐지 기록" in response.json()["detail"]


def test_delete_unused_model_clears_file_and_runtime_cache(client):
    register(client, "cache owner", "model-cache-delete@example.com")
    model = client.post(
        "/models?name=cached-model",
        files={"file": ("cached.pt", pt_checkpoint_bytes(), "application/octet-stream")},
    ).json()
    with client.app.state.testing_session() as db:
        model_path = Path(db.get(ModelArtifact, model["id"]).path)
    main.realtime_model_cache[model["id"]] = (0, object())

    response = client.delete(f"/models/{model['id']}")
    assert response.status_code == 204
    assert not model_path.exists()
    assert model["id"] not in main.realtime_model_cache


def test_delete_unused_media_removes_original_file(client):
    register(client, "media owner", "media-delete@example.com")
    image = np.zeros((24, 32, 3), dtype=np.uint8)
    _, encoded = cv2.imencode(".jpg", image)
    media = client.post(
        "/videos",
        files={"file": ("unused.jpg", encoded.tobytes(), "image/jpeg")},
    ).json()
    with client.app.state.testing_session() as db:
        media_path = Path(db.get(main.VideoAsset, media["id"]).path)

    response = client.delete(f"/videos/{media['id']}")
    assert response.status_code == 204
    assert not media_path.exists()


def test_orphan_cleanup_removes_only_unreferenced_old_managed_files(client):
    register(client, "orphan owner", "orphan-cleanup@example.com")
    model = client.post(
        "/models?name=kept-model",
        files={"file": ("kept.pt", pt_checkpoint_bytes(), "application/octet-stream")},
    ).json()
    orphan = main.STORAGE_DIR / "outputs" / "orphan-result.jpg"
    recent = main.STORAGE_DIR / "outputs" / "recent-result.jpg"
    orphan.parent.mkdir(parents=True, exist_ok=True)
    orphan.write_bytes(b"old orphan")
    recent.write_bytes(b"recent orphan")
    old_timestamp = datetime.now(timezone.utc).timestamp() - 7200
    os.utime(orphan, (old_timestamp, old_timestamp))

    with client.app.state.testing_session() as db:
        model_path = Path(db.get(ModelArtifact, model["id"]).path)
        removed = main.cleanup_orphaned_storage_files(db, grace_seconds=3600)

    assert removed == 1
    assert not orphan.exists()
    assert recent.exists()
    assert model_path.exists()


def test_realtime_detection_returns_normalized_boxes_and_updates_model_metadata(client, monkeypatch):
    register(client, "realtime user", "realtime@example.com")
    model = client.post(
        "/models?name=realtime-model",
        files={"file": ("model.pt", pt_checkpoint_bytes(), "application/octet-stream")},
    ).json()
    image = np.zeros((100, 200, 3), dtype=np.uint8)
    _, encoded = cv2.imencode(".jpg", image)

    class FakeTensor:
        def __init__(self, values):
            self.values = values

        def cpu(self):
            return self

        def tolist(self):
            return self.values

    boxes = SimpleNamespace(
        xyxy=FakeTensor([[20.0, 10.0, 120.0, 60.0]]),
        conf=FakeTensor([0.87]),
        cls=FakeTensor([3.0]),
    )
    result = SimpleNamespace(names={3: "PET_Bottle"}, boxes=boxes)

    class FakeYolo:
        task = "detect"

        def __init__(self, _path):
            pass

        def predict(self, _image, **_kwargs):
            return [result]

    main.realtime_model_cache.clear()
    monkeypatch.setattr("ultralytics.YOLO", FakeYolo)
    session = client.post("/realtime/sessions", json={"model_id": model["id"]})
    assert session.status_code == 201
    session_id = session.json()["id"]
    response = client.post(
        "/realtime/detect",
        data={"model_id": str(model["id"]), "session_id": str(session_id), "confidence": "0.25"},
        files={"frame": ("webcam.jpg", encoded.tobytes(), "image/jpeg")},
    )
    assert response.status_code == 200
    detection = response.json()["detections"][0]
    assert detection["class_name"] == "PET_Bottle"
    assert detection["confidence"] == 0.87
    assert detection["x1"] == 0.1
    assert detection["y1"] == 0.1
    assert detection["x2"] == 0.6
    assert detection["y2"] == 0.6
    assert len(response.json()["saved_event_ids"]) == 1
    duplicate = client.post(
        "/realtime/detect",
        data={"model_id": str(model["id"]), "session_id": str(session_id), "confidence": "0.25"},
        files={"frame": ("webcam.jpg", encoded.tobytes(), "image/jpeg")},
    )
    assert duplicate.status_code == 200
    assert duplicate.json()["saved_event_ids"] == []
    detail = client.get(f"/realtime/sessions/{session_id}").json()
    assert detail["total_events"] == 1
    assert len(detail["events"]) == 1
    assert detail["events"][0]["class_name"] == "PET_Bottle"
    assert detail["events"][0]["evidence_url"]
    evidence = client.get(detail["events"][0]["evidence_url"])
    assert evidence.status_code == 200
    assert evidence.headers["content-type"] == "image/jpeg"
    event_id = detail["events"][0]["id"]
    protected = client.patch(f"/realtime/events/{event_id}/protection", json={"protected": True})
    assert protected.status_code == 200
    assert protected.json()["protected"] is True

    paused = client.patch(f"/realtime/sessions/{session_id}", json={"status": "paused"})
    assert paused.status_code == 200
    blocked = client.post(
        "/realtime/detect",
        data={"model_id": str(model["id"]), "session_id": str(session_id)},
        files={"frame": ("webcam.jpg", encoded.tobytes(), "image/jpeg")},
    )
    assert blocked.status_code == 409
    assert client.patch(f"/realtime/sessions/{session_id}", json={"status": "running"}).status_code == 200
    completed = client.patch(f"/realtime/sessions/{session_id}", json={"status": "completed"})
    assert completed.status_code == 200
    assert completed.json()["ended_at"] is not None
    listed = client.get("/models").json()[0]
    assert listed["task"] == "detect"
    assert listed["class_names"] == ["PET_Bottle"]
