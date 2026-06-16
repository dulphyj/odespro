#!/bin/bash
# Odespro - Backup Script for Linux
set -e

BACKUP_DIR="${1:-./backups}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_PATH="$BACKUP_DIR/$TIMESTAMP"

mkdir -p "$BACKUP_PATH"

echo "========================================"
echo "  Odespro - Backup"
echo "========================================"
echo ""
echo "Backup destination: $BACKUP_PATH"

# Backup PostgreSQL
echo "Backing up PostgreSQL database..."
docker exec odespro-postgres pg_dump -U odespro odespro > "$BACKUP_PATH/odespro_db_$TIMESTAMP.sql"
echo "  ✓ Database backup completed"

# Backup MinIO storage
echo "Backing up MinIO storage..."
docker run --rm -v odespro_minio_data:/data -v "${BACKUP_PATH}:/backup" alpine tar czf "/backup/minio_data_$TIMESTAMP.tar.gz" -C /data .
echo "  ✓ Storage backup completed"

echo ""
echo "Backup completed: $BACKUP_PATH"
