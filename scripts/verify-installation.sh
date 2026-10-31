#!/usr/bin/env bash
set -euo pipefail

PROGIT_URL="${PROGIT_URL:-http://localhost:3000}"

echo "==> Verifying ProGit installation at ${PROGIT_URL}..."

echo -n "Checking health endpoint... "
HEALTH=$(curl -s -f "${PROGIT_URL}/api/health")
echo "OK"
echo "${HEALTH}"

echo -n "Checking readiness endpoint... "
READY=$(curl -s -f "${PROGIT_URL}/api/ready")
echo "OK (${READY})"

echo -n "Checking Web UI index page... "
INDEX=$(curl -s -f "${PROGIT_URL}/")
if echo "${INDEX}" | grep -q "ProGit"; then
    echo "OK (ProGit UI loaded)"
else
    echo "Warning: Index response did not contain 'ProGit'"
fi

echo "==> Verification completed successfully."

