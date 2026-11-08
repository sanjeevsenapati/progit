#!/usr/bin/env bash
set -euo pipefail

IMAGE_NAME="${1:-ghcr.io/sanjeevsenapati/progit:latest}"
echo "==> Pulling latest image: ${IMAGE_NAME}..."
docker pull "${IMAGE_NAME}"

echo "==> Re-deploying container..."
./docker/deploy.sh "${IMAGE_NAME}"
