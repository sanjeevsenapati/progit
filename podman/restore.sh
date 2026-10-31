#!/usr/bin/env bash
set -euo pipefail

if [ $# -lt 1 ]; then
    echo "Usage: $0 <path-to-progit-backup.tar.gz>"
    exit 1
fi

BACKUP_ARCHIVE="$1"

if [ ! -f "${BACKUP_ARCHIVE}" ]; then
    echo "Error: Backup archive '${BACKUP_ARCHIVE}' not found."
    exit 1
fi

echo "==> Restoring from ${BACKUP_ARCHIVE}..."
ARCHIVE_ABS="$(cd "$(dirname "${BACKUP_ARCHIVE}")" && pwd)/$(basename "${BACKUP_ARCHIVE}")"

if podman ps -a --format "{{.Names}}" | grep -w "^progit$" >/dev/null 2>&1; then
    echo "==> Stopping running container..."
    podman stop -t 5 progit || true
    echo "==> Restoring persistent data inside volume..."
    podman run --rm \
      -v "${ARCHIVE_ABS}:/restore.tar.gz:ro,Z" \
      -v progit-data:/data/db:Z \
      -v progit-repositories:/data/repositories:Z \
      localhost/progit:latest restore /restore.tar.gz
    podman start progit
else
    ./progit restore "${ARCHIVE_ABS}"
fi

echo "==> Restore complete. Checking health..."
sleep 2
curl -s http://localhost:3000/api/health || true

