#!/usr/bin/env bash
set -euo pipefail

CONTAINER_NAME="progit"
echo "==> Restarting ${CONTAINER_NAME}..."
podman restart -t 5 "${CONTAINER_NAME}"
echo "==> ${CONTAINER_NAME} restarted."

