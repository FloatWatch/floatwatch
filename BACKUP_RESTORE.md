# FloatWatch backup and restore

Backups contain a consistent SQLite snapshot and all files under `backend/storage`.
Each archive includes SHA-256 hashes and is verified immediately after creation.
The local `backend/backups` directory is excluded from Git.

## Pre-demo backup

Create and verify a backup immediately before a demo:

```powershell
cd backend
.\scripts\pre-demo-backup.ps1
```

## Manual backup and verification

```powershell
cd backend
.venv\Scripts\python.exe -m app.backup_restore backup
.venv\Scripts\python.exe -m app.backup_restore verify .\backups\floatwatch-YYYYMMDD-HHMMSS.zip
```

## Restore procedure

1. Stop the backend server. Restoring while FastAPI is running is not supported.
2. Keep a copy of the verified archive outside the project directory.
3. Verify the archive.
4. Restore it with the exact confirmation phrase.
5. Restart the backend and verify login, records, and uploaded files.

```powershell
cd backend
.venv\Scripts\python.exe -m app.backup_restore verify .\backups\floatwatch-YYYYMMDD-HHMMSS.zip
.venv\Scripts\python.exe -m app.backup_restore restore .\backups\floatwatch-YYYYMMDD-HHMMSS.zip --confirm "FLOATWATCH RESTORE"
```

Restoring replaces the current database and uploaded files. The command creates a
temporary rollback copy and restores it automatically if validation or replacement
fails. SQLite WAL and SHM sidecar files are removed to prevent stale data replay.
