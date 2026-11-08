#!/usr/bin/env bash
set -euo pipefail

CONTAINER_NAME="progit"

echo "==> Checking ProGit Docker container status..."
docker ps -f "name=^${CONTAINER_NAME}$"

echo ""
echo "==> Testing HTTPS health endpoint (port 3443)..."
if curl -k -s -f https://localhost:3443/api/health; then
    echo -e "\n✓ ProGit HTTPS health check PASSED"
else
    echo -e "\n✗ ProGit HTTPS health check FAILED"
fi

echo ""
echo "==> Testing HTTP health redirect (port 3000)..."
if curl -s -f http://localhost:3000/api/health; then
    echo -e "\n✓ ProGit HTTP health check PASSED"
else
    echo -e "\n✗ ProGit HTTP health check FAILED"
fi
