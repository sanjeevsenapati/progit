#!/usr/bin/env bash
set -euo pipefail

DB_PATH="${PROGIT_DB_PATH:-./data/progit.db}"
mkdir -p "$(dirname "${DB_PATH}")"

echo "==> Initializing SQLite database schema at ${DB_PATH}..."
# Running progit version/admin initializes schema automatically
if [ -f "./progit" ]; then
    ./progit version
else
    echo "ProGit binary not built yet. Building..."
    go build -o progit ./cmd/progit
    ./progit version
fi

echo "==> Database schema initialized successfully."

