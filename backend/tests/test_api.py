import io
import os
import zipfile

import cv2
import numpy as np

from app import main
from app.analysis_service import run_analysis
from app.models import Analysis, ModelArtifact
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


def test_authentication_and_inactive_user(client):
    admin = register(client, "관리자", "admin@example.com")
    assert admin.status_code == 201
    assert admin.json()["role"] == "admin"

    client.post("/auth/logout")
    member = register(client, "사용자", "user@example.com")
    assert member.status_code == 201
    member_id = member.json()["id"]

    client.post("/auth/logout")
    assert client.post("/auth/login", json={"email": "admin@example.com", "password": "password123"}).status_code == 200
    assert client.patch(f"/admin/users/{member_id}", json={"active": False, "reason": "이용 정책 점검"}).status_code == 200

    client.post("/auth/logout")
    denied = client.post("/auth/login", json={"email": "user@example.com", "password": "password123"})
    assert denied.status_code == 403
    assert "floatwatch_session" not in client.cookies


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
    assert client.get(f"/inquiries/{inquiry_id}").status_code == 403
    assert client.patch(f"/inquiries/{inquiry_id}/read").status_code == 403
    assert client.get(f"/inquiry-attachments/{attachment_id}").status_code == 403
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
        assert "격리" in stored_analysis.error_message

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
