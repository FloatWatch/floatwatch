import cv2
import numpy as np

from app import main


def register(client, name: str, email: str):
    return client.post("/auth/register", json={"name": name, "email": email, "password": "password123"})


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
    assert client.patch(f"/admin/users/{member_id}", json={"active": False}).status_code == 200

    client.post("/auth/logout")
    denied = client.post("/auth/login", json={"email": "user@example.com", "password": "password123"})
    assert denied.status_code == 403
    assert "floatwatch_session" not in client.cookies


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


def test_upload_validation(client):
    register(client, "관리자", "admin@example.com")

    empty_model = client.post("/models?name=test", files={"file": ("model.pt", b"", "application/octet-stream")})
    assert empty_model.status_code == 400
    tiny_model = client.post("/models?name=test", files={"file": ("model.pt", b"x" * 100, "application/octet-stream")})
    assert tiny_model.status_code == 400
    bad_image = client.post("/videos", files={"file": ("sample.jpg", b"not-an-image", "image/jpeg")})
    assert bad_image.status_code == 400

    image = np.zeros((24, 32, 3), dtype=np.uint8)
    ok, encoded = cv2.imencode(".jpg", image)
    assert ok
    uploaded = client.post("/videos", files={"file": ("sample.jpg", encoded.tobytes(), "image/jpeg")})
    assert uploaded.status_code == 201
    assert uploaded.json()["media_type"] == "image"


def test_storage_quota_and_unused_asset_deletion(client, monkeypatch):
    register(client, "관리자", "admin@example.com")
    monkeypatch.setattr(main, "USER_STORAGE_LIMIT", 1024)
    over_quota = client.post(
        "/models?name=large-model",
        files={"file": ("model.pt", b"x" * 2048, "application/octet-stream")},
    )
    assert over_quota.status_code == 413

    monkeypatch.setattr(main, "USER_STORAGE_LIMIT", 10 * 1024)
    model = client.post(
        "/models?name=unused-model",
        files={"file": ("model.pt", b"x" * 2048, "application/octet-stream")},
    )
    assert model.status_code == 201
    assert client.delete(f"/models/{model.json()['id']}").status_code == 204


def test_analysis_is_scoped_to_owner(client):
    register(client, "관리자", "admin@example.com")
    model = client.post(
        "/models?name=demo-model",
        files={"file": ("model.pt", b"x" * 2048, "application/octet-stream")},
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
