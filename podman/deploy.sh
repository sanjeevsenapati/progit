#!/usr/bin/env bash
set -euo pipefail

CONTAINER_NAME="progit"
IMAGE_NAME="localhost/progit:latest"

echo "==> Ensuring persistent volumes exist..."
podman volume create progit-data >/dev/null 2>&1 || true
podman volume create progit-repositories >/dev/null 2>&1 || true
podman volume create progit-config >/dev/null 2>&1 || true
podman volume create progit-logs >/dev/null 2>&1 || true

# Remove existing container if running
if podman ps -a --format "{{.Names}}" | grep -w "^${CONTAINER_NAME}$" >/dev/null 2>&1; then
    echo "==> Stopping and removing existing ${CONTAINER_NAME} container..."
    podman rm -f "${CONTAINER_NAME}" >/dev/null 2>&1
fi

echo "==> Launching ${CONTAINER_NAME}..."
podman run -d \
  --name "${CONTAINER_NAME}" \
  --restart=unless-stopped \
  -p 3000:3000 \
  -p 2222:2222 \
  -v progit-data:/data/db:Z \
  -v progit-repositories:/data/repositories:Z \
  -v progit-config:/data/config:Z \
  -v progit-logs:/data/logs:Z \
  "${IMAGE_NAME}"

echo "==> Container deployed. Waiting for health check..."
for i in {1..20}; do
    if curl -s http://localhost:3000/api/health >/dev/null 2>&1; then
        echo "==> ProGit is UP and HEALTHY on http://localhost:3000"
        exit 0
    fi
    sleep 1
done

echo "==> Warning: Container started, but health endpoint timed out. Check logs:"
podman logs --tail 20 "${CONTAINER_NAME}"

