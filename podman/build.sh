#!/usr/bin/env bash
set -euo pipefail

IMAGE_NAME="localhost/progit:latest"

echo "==> Building ProGit container image: ${IMAGE_NAME}..."
podman build -t "${IMAGE_NAME}" -f Containerfile .

echo "==> Image build successful: ${IMAGE_NAME}"
podman images | grep progit || true

