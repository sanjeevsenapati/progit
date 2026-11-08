#!/usr/bin/env bash
set -euo pipefail
echo "==> Restarting ProGit container..."
docker restart progit
./docker/health-check.sh
