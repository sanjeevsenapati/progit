#!/usr/bin/env bash
set -euo pipefail
echo "==> Removing ProGit container..."
docker rm -f progit 2>/dev/null || true
echo "✓ Container removed. Persistent volumes (progit-data, progit-repositories) were kept safe."
