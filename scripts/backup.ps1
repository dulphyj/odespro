# Odespro - Backup Script for Windows
param(
    [string]$BackupDir = ".\backups",
    [switch]$NoDatabase,
    [switch]$NoStorage
)

$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$backupPath = Join-Path -LiteralPath $BackupDir -ChildPath $timestamp

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Odespro - Backup" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Create backup directory
if (-not (Test-Path -LiteralPath $BackupDir)) {
    New-Item -ItemType Directory -Path $BackupDir -Force | Out-Null
}
New-Item -ItemType Directory -Path $backupPath -Force | Out-Null

Write-Host "Backup destination: $backupPath" -ForegroundColor Yellow

# Backup PostgreSQL
if (-not $NoDatabase) {
    Write-Host "Backing up PostgreSQL database..." -ForegroundColor Yellow
    $containerName = "odespro-postgres"
    $backupFile = Join-Path -LiteralPath $backupPath -ChildPath "odespro_db_$timestamp.sql"
    
    docker exec $containerName pg_dump -U odespro odespro > $backupFile 2>&1
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "  ✓ Database backup completed: $backupFile" -ForegroundColor Green
    } else {
        Write-Host "  ✗ Database backup failed" -ForegroundColor Red
    }
}

# Backup MinIO storage
if (-not $NoStorage) {
    Write-Host "Backing up MinIO storage..." -ForegroundColor Yellow
    $storageFile = Join-Path -LiteralPath $backupPath -ChildPath "minio_data_$timestamp.tar.gz"
    
    docker run --rm -v odespro_minio_data:/data -v "${backupPath}:/backup" alpine tar czf "/backup/minio_data_$timestamp.tar.gz" -C /data .
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "  ✓ Storage backup completed: $storageFile" -ForegroundColor Green
    } else {
        Write-Host "  ✗ Storage backup failed" -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "Backup completed: $backupPath" -ForegroundColor Green
