#!/usr/bin/env bash
set -euo pipefail

CONTAINER_NAME="progit"
IMAGE_NAME="${1:-ghcr.io/sanjeevsenapati/progit:latest}"

echo "==> Ensuring persistent volumes exist..."
docker volume create progit-data >/dev/null 2>&1 || true
docker volume create progit-repositories >/dev/null 2>&1 || true
docker volume create progit-config >/dev/null 2>&1 || true
docker volume create progit-logs >/dev/null 2>&1 || true

# Remove existing container if running
if docker ps -a --format "{{.Names}}" | grep -w "^${CONTAINER_NAME}$" >/dev/null 2>&1; then
    echo "==> Stopping and removing existing ${CONTAINER_NAME} container..."
    docker rm -f "${CONTAINER_NAME}" >/dev/null 2>&1
fi

echo "==> Launching ${CONTAINER_NAME} with Docker..."
if docker run -d \
  --name "${CONTAINER_NAME}" \
  --restart=unless-stopped \
  -p 443:3443 \
  -p 80:3000 \
  -p 3000:3000 \
  -p 3443:3443 \
  -p 2222:2222 \
  -v progit-data:/data/db \
  -v progit-repositories:/data/repositories \
  -v progit-config:/data/config \
  -v progit-logs:/data/logs \
  "${IMAGE_NAME}" >/dev/null 2>&1; then
    echo "==> Mapped standard ports 443 (HTTPS), 80 (HTTP redirect), 3443, 3000, and 2222 (SSH)"
else
    echo "==> Note: Direct binding to ports 443/80 failed or requires root."
    echo "==> Falling back to user ports 3443 (HTTPS), 3000 (HTTP redirect), and 2222 (SSH)..."
    docker rm -f "${CONTAINER_NAME}" >/dev/null 2>&1 || true
    docker run -d \
      --name "${CONTAINER_NAME}" \
      --restart=unless-stopped \
      -p 3000:3000 \
      -p 3443:3443 \
      -p 2222:2222 \
      -v progit-data:/data/db \
      -v progit-repositories:/data/repositories \
      -v progit-config:/data/config \
      -v progit-logs:/data/logs \
      "${IMAGE_NAME}"
fi

echo "==> Waiting for ProGit HTTPS health check..."
for i in {1..20}; do
    if curl -k -s -f https://localhost:3443/api/health >/dev/null 2>&1 || curl -s -f http://localhost:3000/api/health >/dev/null 2>&1; then
        echo "==> ProGit is UP and HEALTHY!"
        echo "==> Default Access URL: https://progit.local:3443"
        echo "==> (Add '127.0.0.1 progit.local' to your /etc/hosts file for local DNS resolution)"
        exit 0
    fi
    sleep 1
done

echo "==> Warning: Container started, but health endpoint timed out. Check logs:"
docker logs --tail 20 "${CONTAINER_NAME}"
