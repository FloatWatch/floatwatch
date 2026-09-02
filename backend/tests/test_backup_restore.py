import json
import sqlite3
import zipfile
from pathlib import Path

import pytest

from app import backup_restore


def prepare_runtime(tmp_path: Path, monkeypatch):
    database = tmp_path / "data" / "app.db"
    storage = tmp_path / "storage"
    backups = tmp_path / "backups"
    database.parent.mkdir()
    storage.mkdir()
    with sqlite3.connect(database) as connection:
        connection.execute("CREATE TABLE demo (id INTEGER PRIMARY KEY, value TEXT)")
        connection.execute("INSERT INTO demo (value) VALUES ('before')")
    (storage / "models").mkdir()
    (storage / "models" / "model.pt").write_bytes(b"model-data")
    monkeypatch.setattr(backup_restore, "DATABASE_URL", f"sqlite:///{database}")
    monkeypatch.setattr(backup_restore, "STORAGE_DIR", storage)
    monkeypatch.setattr(backup_restore, "BACKUP_DIR", backups)
    monkeypatch.setattr(backup_restore, "BASE_DIR", tmp_path)
    return database, storage, backups


def test_backup_verify_and_restore(tmp_path, monkeypatch):
    database, storage, _backups = prepare_runtime(tmp_path, monkeypatch)
    archive = backup_restore.create_backup()
    manifest = backup_restore.verify_backup(archive)
    assert manifest["format"] == 1
    assert {entry["path"] for entry in manifest["entries"]} == {"database/app.db", "storage/models/model.pt"}

    with sqlite3.connect(database) as connection:
        connection.execute("UPDATE demo SET value = 'after'")
    (storage / "models" / "model.pt").write_bytes(b"changed")
    (storage / "outputs").mkdir()
    (storage / "outputs" / "extra.mp4").write_bytes(b"extra")
    Path(f"{database}-wal").write_bytes(b"stale")
    Path(f"{database}-shm").write_bytes(b"stale")

    backup_restore.restore_backup(archive, backup_restore.RESTORE_CONFIRMATION)
    with sqlite3.connect(database) as connection:
        assert connection.execute("SELECT value FROM demo").fetchone()[0] == "before"
    assert (storage / "models" / "model.pt").read_bytes() == b"model-data"
    assert not (storage / "outputs" / "extra.mp4").exists()
    assert not Path(f"{database}-wal").exists()
    assert not Path(f"{database}-shm").exists()


def test_restore_requires_confirmation_and_rejects_tampering(tmp_path, monkeypatch):
    _database, _storage, _backups = prepare_runtime(tmp_path, monkeypatch)
    archive = backup_restore.create_backup()
    with pytest.raises(RuntimeError, match="--confirm"):
        backup_restore.restore_backup(archive, "wrong")

    tampered = tmp_path / "tampered.zip"
    with zipfile.ZipFile(archive) as source, zipfile.ZipFile(tampered, "w") as target:
        for name in source.namelist():
            payload = source.read(name)
            target.writestr(name, b"tampered" if name == "storage/models/model.pt" else payload)
    with pytest.raises(RuntimeError, match="failed verification"):
        backup_restore.verify_backup(tampered)


def test_backup_rejects_path_traversal(tmp_path, monkeypatch):
    _database, _storage, _backups = prepare_runtime(tmp_path, monkeypatch)
    archive = tmp_path / "escape.zip"
    manifest = {"format": 1, "created_at": "now", "database": "database/app.db", "entries": []}
    with zipfile.ZipFile(archive, "w") as target:
        target.writestr("manifest.json", json.dumps(manifest))
        target.writestr("../escape.txt", "escape")
    with pytest.raises(RuntimeError, match="Unsafe backup archive path"):
        backup_restore.verify_backup(archive)


def test_empty_storage_can_be_restored(tmp_path, monkeypatch):
    database, storage, _backups = prepare_runtime(tmp_path, monkeypatch)
    (storage / "models" / "model.pt").unlink()
    (storage / "models").rmdir()
    archive = backup_restore.create_backup()
    (storage / "temporary.txt").write_text("remove me", encoding="utf-8")
    backup_restore.restore_backup(archive, backup_restore.RESTORE_CONFIRMATION)
    assert database.exists()
    assert storage.is_dir()
    assert list(storage.iterdir()) == []
