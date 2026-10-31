#!/usr/bin/env bash
set -euo pipefail

podman logs -f --tail 100 progit

