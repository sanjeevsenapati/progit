#!/usr/bin/env bash
set -euo pipefail

BACKUP_FILE="${1:-}"

if [ -z "${BACKUP_FILE}" ] || [ ! -f "${BACKUP_FILE}" ]; then
    echo "Usage: ./docker/restore.sh <path-to-progit-backup.tar.gz>"
    exit 1
fi

echo "==> Restoring ProGit from ${BACKUP_FILE}..."
echo "==> Stopping running container..."
docker stop progit 2>/dev/null || true

BACKUP_ABS="$(cd "$(dirname "${BACKUP_FILE}")" && pwd)/$(basename "${BACKUP_FILE}")"

docker run --rm \
  -v progit-data:/data/db \
  -v progit-repositories:/data/repositories \
  -v progit-config:/data/config \
  -v "${BACKUP_ABS}":/backup/restore.tar.gz:ro \
  alpine:3.21 sh -c "tar -xzf /backup/restore.tar.gz -C /data && chown -R 1000:1000 /data"

echo "==> Restarting container..."
docker start progit || ./docker/deploy.sh
echo "✓ Restore complete!"
