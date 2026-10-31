#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

echo "==> Updating ProGit deployment..."
"${SCRIPT_DIR}/build.sh"
"${SCRIPT_DIR}/deploy.sh"
echo "==> ProGit update completed successfully."

