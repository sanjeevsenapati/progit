#!/usr/bin/env bash
set -euo pipefail

echo "==> Cleaning up ProGit container and persistent volumes..."
podman rm -f progit >/dev/null 2>&1 || true
podman volume rm -f progit-data progit-repositories progit-config progit-logs >/dev/null 2>&1 || true
echo "==> Cleanup complete."

