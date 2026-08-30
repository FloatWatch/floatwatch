from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import sqlite3
import tempfile
import zipfile
from contextlib import closing
from datetime import datetime, timezone
from pathlib import Path, PurePosixPath

from .database import BASE_DIR, DATABASE_URL, STORAGE_DIR
from .storage_security import ensure_disk_capacity


BACKUP_DIR = BASE_DIR / "backups"
RESTORE_CONFIRMATION = "FLOATWATCH RESTORE"


def sqlite_database_path() -> Path:
    prefix = "sqlite:///"
    if not DATABASE_URL.startswith(prefix):
        raise RuntimeError("Backup currently supports SQLite databases only.")
    value = DATABASE_URL[len(prefix) :]
    path = Path(value)
    return path if path.is_absolute() else (BASE_DIR / path).resolve()


def file_hash(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def storage_files() -> list[Path]:
    if not STORAGE_DIR.exists():
        return []
    files: list[Path] = []
    for path in STORAGE_DIR.rglob("*"):
        if path.is_symlink():
            raise RuntimeError(f"Storage symlinks cannot be backed up: {path}")
        if path.is_file():
            files.append(path)
    return sorted(files)


def create_backup(output: Path | None = None) -> Path:
    database = sqlite_database_path()
    if not database.exists():
        raise RuntimeError(f"SQLite database was not found: {database}")
    files = storage_files()
    estimated = database.stat().st_size + sum(path.stat().st_size for path in files)
    destination = output or BACKUP_DIR / f"floatwatch-{datetime.now().strftime('%Y%m%d-%H%M%S')}.zip"
    destination.parent.mkdir(parents=True, exist_ok=True)
    ensure_disk_capacity(destination, max(estimated, 16 * 1024 * 1024), 64 * 1024 * 1024)

    with tempfile.TemporaryDirectory(prefix="floatwatch-backup-") as temp_name:
        temp = Path(temp_name)
        snapshot = temp / "app.db"
        with closing(sqlite3.connect(database)) as source, closing(sqlite3.connect(snapshot)) as target:
            source.backup(target)
        with closing(sqlite3.connect(snapshot)) as connection:
            if connection.execute("PRAGMA integrity_check").fetchone()[0] != "ok":
                raise RuntimeError("SQLite snapshot failed its integrity check.")

        entries = [{"path": "database/app.db", "size": snapshot.stat().st_size, "sha256": file_hash(snapshot)}]
        entries.extend(
            {
                "path": f"storage/{path.relative_to(STORAGE_DIR).as_posix()}",
                "size": path.stat().st_size,
                "sha256": file_hash(path),
            }
            for path in files
        )
        manifest = {
            "format": 1,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "database": "database/app.db",
            "entries": entries,
        }

        partial = destination.with_suffix(destination.suffix + ".partial")
        try:
            with zipfile.ZipFile(partial, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
                archive.write(snapshot, "database/app.db")
                for path in files:
                    archive.write(path, f"storage/{path.relative_to(STORAGE_DIR).as_posix()}")
                archive.writestr("manifest.json", json.dumps(manifest, ensure_ascii=True, indent=2))
            partial.replace(destination)
        finally:
            partial.unlink(missing_ok=True)
    verify_backup(destination)
    return destination


def safe_archive_name(value: str) -> str:
    path = PurePosixPath(value)
    if path.is_absolute() or ".." in path.parts or "\\" in value:
        raise RuntimeError(f"Unsafe backup archive path: {value}")
    return path.as_posix()


def verify_backup(archive_path: Path, extract_to: Path | None = None) -> dict:
    if not archive_path.is_file():
        raise RuntimeError(f"Backup archive was not found: {archive_path}")
    with zipfile.ZipFile(archive_path) as archive:
        names = {safe_archive_name(name) for name in archive.namelist()}
        if "manifest.json" not in names:
            raise RuntimeError("Backup archive does not contain manifest.json.")
        manifest = json.loads(archive.read("manifest.json"))
        if manifest.get("format") != 1:
            raise RuntimeError("Unsupported backup format.")
        database_entry = safe_archive_name(str(manifest.get("database", "")))
        expected = {safe_archive_name(entry["path"]): entry for entry in manifest.get("entries", [])}
        if database_entry not in expected or not set(expected).issubset(names):
            raise RuntimeError("Backup manifest does not match the archive contents.")
        target_root = extract_to or Path(tempfile.mkdtemp(prefix="floatwatch-verify-"))
        owns_target = extract_to is None
        try:
            for name, entry in expected.items():
                target = target_root / PurePosixPath(name)
                target.parent.mkdir(parents=True, exist_ok=True)
                with archive.open(name) as source, target.open("wb") as output:
                    shutil.copyfileobj(source, output)
                if target.stat().st_size != entry["size"] or file_hash(target) != entry["sha256"]:
                    raise RuntimeError(f"Backup entry failed verification: {name}")
            with closing(sqlite3.connect(target_root / database_entry)) as connection:
                if connection.execute("PRAGMA integrity_check").fetchone()[0] != "ok":
                    raise RuntimeError("Backup SQLite database is corrupted.")
        finally:
            if owns_target:
                shutil.rmtree(target_root, ignore_errors=True)
    return manifest


def remove_sqlite_sidecars(database: Path) -> None:
    Path(f"{database}-wal").unlink(missing_ok=True)
    Path(f"{database}-shm").unlink(missing_ok=True)


def restore_backup(archive_path: Path, confirmation: str) -> None:
    if confirmation != RESTORE_CONFIRMATION:
        raise RuntimeError(f'Restore requires --confirm "{RESTORE_CONFIRMATION}".')
    database = sqlite_database_path()
    with tempfile.TemporaryDirectory(prefix="floatwatch-restore-") as temp_name:
        stage = Path(temp_name)
        manifest = verify_backup(archive_path, stage)
        staged_database = stage / safe_archive_name(manifest["database"])
        staged_storage = stage / "storage"
        staged_storage.mkdir(exist_ok=True)
        required = staged_database.stat().st_size + sum(path.stat().st_size for path in staged_storage.rglob("*") if path.is_file())
        ensure_disk_capacity(STORAGE_DIR, required * 2, 64 * 1024 * 1024)

        rollback = Path(tempfile.mkdtemp(prefix="floatwatch-rollback-", dir=BASE_DIR))
        rollback_db = rollback / "app.db"
        rollback_storage = rollback / "storage"
        try:
            database.parent.mkdir(parents=True, exist_ok=True)
            if database.exists():
                shutil.copy2(database, rollback_db)
            if STORAGE_DIR.exists():
                shutil.move(str(STORAGE_DIR), rollback_storage)
            shutil.copytree(staged_storage, STORAGE_DIR)
            remove_sqlite_sidecars(database)
            shutil.copy2(staged_database, database)
            with closing(sqlite3.connect(database)) as connection:
                if connection.execute("PRAGMA integrity_check").fetchone()[0] != "ok":
                    raise RuntimeError("Restored SQLite database failed its integrity check.")
        except Exception:
            shutil.rmtree(STORAGE_DIR, ignore_errors=True)
            if rollback_storage.exists():
                shutil.move(str(rollback_storage), STORAGE_DIR)
            remove_sqlite_sidecars(database)
            if rollback_db.exists():
                shutil.copy2(rollback_db, database)
            raise
        finally:
            shutil.rmtree(rollback, ignore_errors=True)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Back up or restore FloatWatch SQLite data and uploaded files.")
    commands = parser.add_subparsers(dest="command", required=True)
    backup = commands.add_parser("backup", help="Create a verified backup ZIP archive.")
    backup.add_argument("--output", type=Path)
    verify = commands.add_parser("verify", help="Verify archive hashes and SQLite integrity.")
    verify.add_argument("archive", type=Path)
    restore = commands.add_parser("restore", help="Restore a verified archive. Stop the backend first.")
    restore.add_argument("archive", type=Path)
    restore.add_argument("--confirm", default="")
    return parser


def main() -> None:
    args = build_parser().parse_args()
    if args.command == "backup":
        print(create_backup(args.output))
    elif args.command == "verify":
        manifest = verify_backup(args.archive)
        print(f"Verified: {manifest['created_at']} / {len(manifest['entries'])} entries")
    else:
        restore_backup(args.archive, args.confirm)
        print("Restore completed.")


if __name__ == "__main__":
    main()
