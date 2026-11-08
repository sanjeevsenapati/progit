#!/usr/bin/env bash
set -euo pipefail

BACKUP_DIR="${1:-./backups}"
mkdir -p "${BACKUP_DIR}"
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
TARGET_FILE="${BACKUP_DIR}/progit_docker_backup_${TIMESTAMP}.tar.gz"

echo "==> Creating ProGit live database & repositories backup..."
docker run --rm \
  -v progit-data:/data/db:ro \
  -v progit-repositories:/data/repositories:ro \
  -v progit-config:/data/config:ro \
  -v "$(cd "${BACKUP_DIR}" && pwd)":/backup \
  alpine:3.21 tar -czf "/backup/progit_docker_backup_${TIMESTAMP}.tar.gz" -C /data db repositories config

echo "✓ Backup created successfully: ${TARGET_FILE}"
