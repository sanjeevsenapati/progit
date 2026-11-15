#!/usr/bin/env bash
set -euo pipefail

if [ $# -lt 3 ]; then
    echo "Usage: $0 <username> <email> <password>"
    exit 1
fi

USERNAME="$1"
EMAIL="$2"
PASSWORD="$3"

echo "==> Creating administrator account: ${USERNAME} (${EMAIL})..."

if podman ps --format "{{.Names}}" | grep -w "^progit$" >/dev/null 2>&1; then
    podman exec progit /usr/local/bin/progit admin create-user \
      --username="${USERNAME}" \
      --email="${EMAIL}" \
      --password="${PASSWORD}" \
      --admin
else
    ./progit admin create-user \
      --username="${USERNAME}" \
      --email="${EMAIL}" \
      --password="${PASSWORD}" \
      --admin
fi

echo "==> Administrator account created."

