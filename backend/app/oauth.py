from __future__ import annotations

import json
import os
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass


@dataclass(frozen=True)
class OAuthProfile:
    provider_user_id: str
    email: str
    name: str


@dataclass(frozen=True)
class ProviderConfig:
    client_id: str
    client_secret: str
    redirect_uri: str
    authorize_url: str
    token_url: str
    scopes: str


PROVIDERS = {
    "google": ProviderConfig(
        os.getenv("GOOGLE_CLIENT_ID", ""), os.getenv("GOOGLE_CLIENT_SECRET", ""),
        os.getenv("GOOGLE_REDIRECT_URI", "http://localhost:8000/auth/oauth/google/callback"),
        "https://accounts.google.com/o/oauth2/v2/auth", "https://oauth2.googleapis.com/token",
        "openid email profile",
    ),
    "kakao": ProviderConfig(
        os.getenv("KAKAO_CLIENT_ID", ""), os.getenv("KAKAO_CLIENT_SECRET", ""),
        os.getenv("KAKAO_REDIRECT_URI", "http://localhost:8000/auth/oauth/kakao/callback"),
        "https://kauth.kakao.com/oauth/authorize", "https://kauth.kakao.com/oauth/token",
        "",
    ),
    "naver": ProviderConfig(
        os.getenv("NAVER_CLIENT_ID", ""), os.getenv("NAVER_CLIENT_SECRET", ""),
        os.getenv("NAVER_REDIRECT_URI", "http://localhost:8000/auth/oauth/naver/callback"),
        "https://nid.naver.com/oauth2.0/authorize", "https://nid.naver.com/oauth2.0/token",
        "",
    ),
}


def authorization_url(provider: str, state: str) -> str:
    config = PROVIDERS[provider]
    params = {
        "response_type": "code", "client_id": config.client_id,
        "redirect_uri": config.redirect_uri, "state": state,
    }
    if config.scopes:
        params["scope"] = config.scopes
    return f"{config.authorize_url}?{urllib.parse.urlencode(params)}"


def _json_request(url: str, *, data: dict[str, str] | None = None, token: str | None = None) -> dict:
    body = urllib.parse.urlencode(data).encode() if data is not None else None
    headers = {"Accept": "application/json", "User-Agent": "FloatWatch/0.1"}
    if body is not None:
        headers["Content-Type"] = "application/x-www-form-urlencoded"
    if token:
        headers["Authorization"] = f"Bearer {token}"
    request = urllib.request.Request(url, data=body, headers=headers)
    try:
        with urllib.request.urlopen(request, timeout=15) as response:
            return json.loads(response.read().decode("utf-8"))
    except (urllib.error.URLError, json.JSONDecodeError) as exc:
        raise ValueError("인증 서버와 통신하지 못했습니다.") from exc


def exchange_profile(provider: str, code: str, state: str) -> OAuthProfile:
    config = PROVIDERS[provider]
    token_data = {
        "grant_type": "authorization_code", "client_id": config.client_id,
        "client_secret": config.client_secret, "redirect_uri": config.redirect_uri, "code": code,
    }
    if provider == "naver":
        token_data["state"] = state
    token = _json_request(config.token_url, data=token_data).get("access_token")
    if not token:
        raise ValueError("인증 토큰을 발급받지 못했습니다.")

    if provider == "google":
        raw = _json_request("https://openidconnect.googleapis.com/v1/userinfo", token=token)
        profile = OAuthProfile(str(raw.get("sub", "")), raw.get("email", ""), raw.get("name", ""))
    elif provider == "kakao":
        raw = _json_request("https://kapi.kakao.com/v2/user/me", token=token)
        account = raw.get("kakao_account") or {}
        profile_data = account.get("profile") or {}
        profile = OAuthProfile(str(raw.get("id", "")), account.get("email", ""), profile_data.get("nickname", ""))
    else:
        raw = _json_request("https://openapi.naver.com/v1/nid/me", token=token).get("response") or {}
        profile = OAuthProfile(str(raw.get("id", "")), raw.get("email", ""), raw.get("nickname") or raw.get("name", ""))

    if not profile.provider_user_id:
        raise ValueError("소셜 계정 식별 정보를 확인하지 못했습니다.")
    if not profile.email and provider == "kakao":
        profile = OAuthProfile(
            profile.provider_user_id,
            f"kakao_{profile.provider_user_id}@oauth.floatwatch.local",
            profile.name,
        )
    if not profile.email:
        raise ValueError("이메일 제공 동의가 필요합니다.")
    return OAuthProfile(profile.provider_user_id, profile.email.lower().strip(), profile.name.strip() or "FloatWatch 사용자")
