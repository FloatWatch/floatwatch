$ErrorActionPreference = "Stop"

$BackendRoot = Split-Path -Parent $PSScriptRoot
$Python = Join-Path $BackendRoot ".venv\Scripts\python.exe"

if (-not (Test-Path -LiteralPath $Python)) {
    throw "Virtual environment Python was not found: $Python"
}

Push-Location $BackendRoot
try {
    $Output = & $Python -m app.backup_restore backup
    if ($LASTEXITCODE -ne 0) { throw "Backup creation failed." }
    $BackupPath = ($Output | Select-Object -Last 1).Trim()
    & $Python -m app.backup_restore verify $BackupPath
    if ($LASTEXITCODE -ne 0) { throw "Backup verification failed." }
    Write-Host "Pre-demo backup ready: $BackupPath"
}
finally {
    Pop-Location
}
