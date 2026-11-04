#!/usr/bin/env bash
set -euo pipefail

CONTAINER_NAME="progit"
IMAGE_NAME="${1:-localhost/progit:latest}"

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
if podman run -d \
  --name "${CONTAINER_NAME}" \
  --restart=unless-stopped \
  -p 443:3443 \
  -p 80:3000 \
  -p 3000:3000 \
  -p 3443:3443 \
  -p 2222:2222 \
  -v progit-data:/data/db:Z \
  -v progit-repositories:/data/repositories:Z \
  -v progit-config:/data/config:Z \
  -v progit-logs:/data/logs:Z \
  "${IMAGE_NAME}" >/dev/null 2>&1; then
    echo "==> Mapped standard ports 443 (HTTPS), 80 (HTTP redirect), 3443, 3000, and 2222 (SSH)"
else
    echo "==> Note: Direct binding to ports 443/80 requires root/sudo or 'sysctl net.ipv4.ip_unprivileged_port_start=80'."
    echo "==> Falling back to user ports 3443 (HTTPS), 3000 (HTTP), and 2222 (SSH)..."
    podman run -d \
      --name "${CONTAINER_NAME}" \
      --restart=unless-stopped \
      -p 3000:3000 \
      -p 3443:3443 \
      -p 2222:2222 \
      -v progit-data:/data/db:Z \
      -v progit-repositories:/data/repositories:Z \
      -v progit-config:/data/config:Z \
      -v progit-logs:/data/logs:Z \
      "${IMAGE_NAME}"
fi

echo "==> Container deployed. Waiting for health check..."
for i in {1..20}; do
    if curl -k -s https://localhost:3443/api/health >/dev/null 2>&1 || curl -k -s http://localhost:3000/api/health >/dev/null 2>&1; then
        echo "==> ProGit is UP and HEALTHY!"
        echo "==> Default Access URL: https://progit.local"
        echo "==> (Add '127.0.0.1 progit.local' to your /etc/hosts file for local DNS resolution)"
        exit 0
    fi
    sleep 1
done

echo "==> Warning: Container started, but health endpoint timed out. Check logs:"
podman logs --tail 20 "${CONTAINER_NAME}"

