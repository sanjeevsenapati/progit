#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# ProGit Semantic Version Bumper
# Usage:
#   ./scripts/bump-version.sh patch   # Bug fixes / security patches (x.y.Z)
#   ./scripts/bump-version.sh minor   # Backward-compatible features (x.Y.0)
#   ./scripts/bump-version.sh major   # Breaking changes (X.0.0)
#   ./scripts/bump-version.sh 1.4.1   # Explicit version override
# ==============================================================================

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VERSION_FILE="${REPO_ROOT}/VERSION"

if [ $# -lt 1 ]; then
    echo "Usage: $0 {patch|minor|major|<X.Y.Z>}" >&2
    exit 1
fi

ARG="${1#v}"

if [ -f "${VERSION_FILE}" ]; then
    CURRENT_RAW="$(tr -d '[:space:]' < "${VERSION_FILE}")"
else
    CURRENT_RAW="$(sed -n 's/^var Version = "\(.*\)"/\1/p' "${REPO_ROOT}/cmd/progit/main.go" | head -n 1)"
fi

SUFFIX=""
if [[ "${CURRENT_RAW}" == *-* ]]; then
    SUFFIX="-${CURRENT_RAW#*-}"
fi
CURRENT_BASE="${CURRENT_RAW%%-*}"

IFS='.' read -r MAJOR MINOR PATCH <<< "${CURRENT_BASE}"

case "${ARG}" in
    patch)
        NEW_BASE="${MAJOR}.${MINOR}.$((PATCH + 1))"
        ;;
    minor)
        NEW_BASE="${MAJOR}.$((MINOR + 1)).0"
        ;;
    major)
        NEW_BASE="$((MAJOR + 1)).0.0"
        ;;
    *)
        if ! [[ "${ARG}" =~ ^[0-9]+\.[0-9]+\.[0-9]+(-[A-Za-z0-9._-]+)?$ ]]; then
            echo "Invalid version or bump type: ${ARG}" >&2
            exit 1
        fi
        if [[ "${ARG}" == *-* ]]; then
            NEW_BASE="${ARG%%-*}"
            SUFFIX="-${ARG#*-}"
        else
            NEW_BASE="${ARG}"
        fi
        ;;
esac

NEW_VERSION="${NEW_BASE}${SUFFIX}"
echo "Bumping version: ${CURRENT_RAW} -> ${NEW_VERSION}"

printf "%s\n" "${NEW_VERSION}" > "${VERSION_FILE}"

CURRENT_BASE="${CURRENT_RAW%%-*}"
export REPO_ROOT CURRENT_RAW CURRENT_BASE NEW_VERSION NEW_BASE

python3 - <<'PY'
import os
import re
from pathlib import Path

root = Path(os.environ["REPO_ROOT"])
old_full = os.environ["CURRENT_RAW"]
old_base = os.environ["CURRENT_BASE"]
new_full = os.environ["NEW_VERSION"]
new_base = os.environ["NEW_BASE"]

def sub_file(rel, pattern, repl):
    p = root / rel
    if not p.exists():
        return
    txt = p.read_text()
    new_txt, n = re.subn(pattern, repl, txt, flags=re.M)
    if n > 0:
        p.write_text(new_txt)
        print(f"  updated {rel} ({n})")

sub_file("cmd/progit/main.go", r'^(var Version = ")[^"]*(")', rf'\g<1>{new_full}\g<2>')
sub_file("internal/api/api.go", r'^(\s*Version\s*=\s*")[^"]*(")', rf'\g<1>{new_full}\g<2>')
sub_file("Containerfile", r'-X main\.Version=[^ ]+ -X progit\.io/progit/internal/api\.Version=[^ "]+', f'-X main.Version={new_full} -X progit.io/progit/internal/api.Version={new_full}')
sub_file("Dockerfile", r'-X main\.Version=[^ ]+ -X progit\.io/progit/internal/api\.Version=[^ "]+', f'-X main.Version={new_full} -X progit.io/progit/internal/api.Version={new_full}')
sub_file("scripts/build-release.sh", r'DEFAULT_VERSION="[^"]+"', f'DEFAULT_VERSION="{new_full}"')
sub_file("scripts/build-release.sh", r'VERSION="\$\{1:-[^}]+\}"', f'VERSION="${{1:-{new_full}}}"')
sub_file("web/package.json", r'^(\s*"version":\s*")[^"]*(")', rf'\g<1>{new_base}\g<2>')
lock_p = root / "web/package-lock.json"
if lock_p.exists():
    txt = lock_p.read_text()
    idx = txt.find('"dependencies"')
    if idx != -1:
        head, tail = txt[:idx], txt[idx:]
        head, n = re.subn(r'^(\s*"version":\s*")[^"]*(")', rf'\g<1>{new_base}\g<2>', head, flags=re.M)
        if n > 0:
            lock_p.write_text(head + tail)
            print(f"  updated web/package-lock.json ({n})")
sub_file("internal/audit/audit.go", r'(ProGit\|ProGit Enterprise\|)[^|]+(\|)', rf'\g<1>{new_base}\g<2>')
sub_file("compose.ha.yaml", rf'ghcr\.io/sanjeevsenapati/progit:{re.escape(old_full)}', f'ghcr.io/sanjeevsenapati/progit:{new_full}')
sub_file("deploy/k8s/progit-ha.yaml", rf'ghcr\.io/sanjeevsenapati/progit:{re.escape(old_full)}', f'ghcr.io/sanjeevsenapati/progit:{new_full}')

for rel in ["docs/PODMAN_DEPLOYMENT.md", "docs/DOCKER_DEPLOYMENT.md", "index.html", "docs/index.html"]:
    p = root / rel
    if not p.exists():
        continue
    txt = p.read_text()
    new_txt = txt
    new_txt = new_txt.replace(f'progit:{old_base}', f'progit:{new_base}')
    new_txt = new_txt.replace(f':{old_base}`', f':{new_base}`')
    new_txt = new_txt.replace(f'Release {old_base}', f'Release {new_base}')
    new_txt = new_txt.replace(f'{old_base}-linux-', f'{new_base}-linux-')
    new_txt = new_txt.replace(f'"version": "{old_base}"', f'"version": "{new_base}"')
    new_txt = new_txt.replace(f'"softwareVersion": "{old_base}"', f'"softwareVersion": "{new_base}"')
    new_txt = new_txt.replace(f'<span class="version-pill">v{old_base}</span>', f'<span class="version-pill">v{new_base}</span>')
    new_txt = new_txt.replace(f'tag <code>{old_base}</code>', f'tag <code>{new_base}</code>')
    if new_txt != txt:
        p.write_text(new_txt)
        print(f"  updated {rel}")
PY

echo "Done. Updated version to ${NEW_VERSION}."
