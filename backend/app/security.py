import base64
import hashlib
import hmac
import secrets
from datetime import datetime, timedelta, timezone


SESSION_DAYS = 7


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, 310_000)
    return f"pbkdf2_sha256$310000${base64.b64encode(salt).decode()}${base64.b64encode(digest).decode()}"


def verify_password(password: str, encoded: str) -> bool:
    try:
        _, iterations, salt_text, digest_text = encoded.split("$", 3)
        salt = base64.b64decode(salt_text)
        expected = base64.b64decode(digest_text)
        actual = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, int(iterations))
        return hmac.compare_digest(actual, expected)
    except (ValueError, TypeError):
        return False


def new_session_token() -> tuple[str, str, datetime]:
    token = secrets.token_urlsafe(48)
    return token, token_digest(token), datetime.now(timezone.utc) + timedelta(days=SESSION_DAYS)


def token_digest(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()
