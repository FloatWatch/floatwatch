from __future__ import annotations

import re
import shutil
import unicodedata
from pathlib import Path


WINDOWS_RESERVED_NAMES = {
    "CON", "PRN", "AUX", "NUL",
    *(f"COM{index}" for index in range(1, 10)),
    *(f"LPT{index}" for index in range(1, 10)),
}
INVALID_FILENAME_CHARS = re.compile(r'[<>:"/\\|?*\x00-\x1f\x7f]')


class InsufficientStorageError(RuntimeError):
    pass


def normalize_upload_name(value: str | None, fallback: str = "upload") -> str:
    raw = unicodedata.normalize("NFC", value or "")
    raw = raw.replace("\\", "/").split("/")[-1]
    cleaned = INVALID_FILENAME_CHARS.sub("_", raw).strip(" .")
    cleaned = re.sub(r"\s+", " ", cleaned)
    if not cleaned:
        cleaned = fallback

    path = Path(cleaned)
    stem = path.stem.strip(" .") or fallback
    suffix = path.suffix.lower()[:16]
    if stem.upper() in WINDOWS_RESERVED_NAMES:
        stem = f"_{stem}"
    max_stem_length = max(1, 180 - len(suffix))
    return f"{stem[:max_stem_length]}{suffix}"


def ensure_within_storage(path: Path | str, storage_root: Path) -> Path:
    root = storage_root.resolve(strict=False)
    candidate = Path(path).resolve(strict=False)
    try:
        candidate.relative_to(root)
    except ValueError:
        raise ValueError("저장소 외부 경로에는 접근할 수 없습니다.") from None
    return candidate


def storage_path(storage_root: Path, *parts: str) -> Path:
    return ensure_within_storage(storage_root.joinpath(*parts), storage_root)


def safe_unlink(path: Path | str, storage_root: Path, *, missing_ok: bool = True) -> None:
    ensure_within_storage(path, storage_root).unlink(missing_ok=missing_ok)


def ensure_disk_capacity(path: Path, required_bytes: int, reserve_bytes: int) -> int:
    probe = path if path.exists() else path.parent
    while not probe.exists() and probe != probe.parent:
        probe = probe.parent
    free_bytes = shutil.disk_usage(probe).free
    needed = max(0, required_bytes) + max(0, reserve_bytes)
    if free_bytes < needed:
        raise InsufficientStorageError(
            f"디스크 여유 공간이 부족합니다. 필요 {needed}바이트, 사용 가능 {free_bytes}바이트"
        )
    return free_bytes
