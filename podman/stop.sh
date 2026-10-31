#!/usr/bin/env bash
set -euo pipefail

CONTAINER_NAME="progit"
echo "==> Stopping ${CONTAINER_NAME}..."
podman stop -t 10 "${CONTAINER_NAME}" || true
echo "==> ${CONTAINER_NAME} stopped."

