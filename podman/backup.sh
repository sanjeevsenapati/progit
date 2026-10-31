#!/usr/bin/env bash
set -euo pipefail

BACKUP_DIR="./backups"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP_FILE="${BACKUP_DIR}/progit-backup-${TIMESTAMP}.tar.gz"

mkdir -p "${BACKUP_DIR}"

echo "==> Creating transactional ProGit backup..."
if podman ps --format "{{.Names}}" | grep -w "^progit$" >/dev/null 2>&1; then
    # Run backup inside container with SQLite WAL truncate
    podman exec progit /usr/local/bin/progit backup --output="/data/backup_temp.tar.gz"
    podman cp "progit:/data/backup_temp.tar.gz" "${BACKUP_FILE}"
    podman exec progit rm -f "/data/backup_temp.tar.gz"
else
    # Offline backup via binary
    ./progit backup --output="${BACKUP_FILE}"
fi

echo "==> Backup created successfully: ${BACKUP_FILE}"
ls -lh "${BACKUP_FILE}"

