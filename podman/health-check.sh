#!/usr/bin/env bash
set -euo pipefail

echo "==> Checking ProGit container and API health..."

# 1. Container Status
if ! podman ps --format "{{.Names}}" | grep -w "^progit$" >/dev/null 2>&1; then
    echo "ERROR: 'progit' container is NOT running!"
    exit 1
fi
echo "[OK] Container 'progit' is active."

# 2. HTTP Health Endpoint
HEALTH_JSON=$(curl -s -f http://localhost:3000/api/health || { echo "ERROR: /api/health failed"; exit 1; })
echo "[OK] /api/health returned: ${HEALTH_JSON}"

# 3. HTTP Readiness Endpoint
READY=$(curl -s -f http://localhost:3000/api/ready || { echo "ERROR: /api/ready failed"; exit 1; })
echo "[OK] /api/ready returned: ${READY}"

echo "==> ProGit deployment is fully healthy and ready."

