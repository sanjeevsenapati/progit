#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# ProGit Multi-Platform Release Build Script
# Targets: macOS (arm64, amd64), Linux (amd64, arm64), Windows (amd64, arm64)
# ==============================================================================

DEFAULT_VERSION="1.7.0"
if [ -f "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/VERSION" ]; then
    DEFAULT_VERSION="$(tr -d '[:space:]' < "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/VERSION")"
fi
VERSION="${1:-${DEFAULT_VERSION}}"
VERSION="${VERSION#v}" # Strip leading 'v' if present
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST_DIR="${REPO_ROOT}/dist/release/v${VERSION}"

echo "============================================================"
echo " Building ProGit v${VERSION} Release Artifacts"
echo " Repo Root: ${REPO_ROOT}"
echo " Output:    ${DIST_DIR}"
echo "============================================================"

# Ensure frontend embedded assets exist
if [ ! -d "${REPO_ROOT}/internal/ui/dist" ] || [ -z "$(ls -A "${REPO_ROOT}/internal/ui/dist")" ]; then
    echo "Frontend dist not found. Building web frontend..."
    (cd "${REPO_ROOT}/web" && npm run build)
    rm -rf "${REPO_ROOT}/internal/ui/dist"
    cp -r "${REPO_ROOT}/web/dist" "${REPO_ROOT}/internal/ui/dist"
else
    echo "✓ Frontend assets verified in internal/ui/dist"
fi

rm -rf "${DIST_DIR}"
mkdir -p "${DIST_DIR}"

# Matrix of targets: OS/ARCH/ARCHIVE_FORMAT
TARGETS=(
    "darwin:arm64:tar.gz:progit"
    "darwin:amd64:tar.gz:progit"
    "linux:amd64:tar.gz:progit"
    "linux:arm64:tar.gz:progit"
    "windows:amd64:zip:progit.exe"
    "windows:arm64:zip:progit.exe"
)

LDFLAGS="-s -w -X main.Version=${VERSION} -X progit.io/progit/internal/api.Version=${VERSION}"

TMP_BUILD_DIR="$(mktemp -d)"
trap 'rm -rf "${TMP_BUILD_DIR}"' EXIT

for target in "${TARGETS[@]}"; do
    IFS=":" read -r GOOS GOARCH FORMAT BINARY_NAME <<< "$target"
    TARGET_NAME="progit_${VERSION}_${GOOS}_${GOARCH}"
    PACKAGE_DIR="${TMP_BUILD_DIR}/${TARGET_NAME}"
    mkdir -p "${PACKAGE_DIR}"

    echo "--> Compiling for ${GOOS}/${GOARCH}..."
    CGO_ENABLED=0 GOOS="${GOOS}" GOARCH="${GOARCH}" go build \
        -trimpath \
        -ldflags="${LDFLAGS}" \
        -o "${PACKAGE_DIR}/${BINARY_NAME}" \
        "${REPO_ROOT}/cmd/progit"

    # Copy documentation / sample configuration if present
    if [ -f "${REPO_ROOT}/README.md" ]; then
        cp "${REPO_ROOT}/README.md" "${PACKAGE_DIR}/"
    fi
    if [ -f "${REPO_ROOT}/config.example.yaml" ]; then
        cp "${REPO_ROOT}/config.example.yaml" "${PACKAGE_DIR}/"
    fi

    # Create archive
    ARCHIVE_PATH="${DIST_DIR}/${TARGET_NAME}.${FORMAT}"
    if [ "${FORMAT}" = "tar.gz" ]; then
        tar -czf "${ARCHIVE_PATH}" -C "${TMP_BUILD_DIR}" "${TARGET_NAME}"
    elif [ "${FORMAT}" = "zip" ]; then
        (cd "${TMP_BUILD_DIR}" && zip -q -r "${ARCHIVE_PATH}" "${TARGET_NAME}")
    fi

    echo "    ✓ Created ${ARCHIVE_PATH##*/} ($(du -h "${ARCHIVE_PATH}" | cut -f1))"
done

# Generate SHA256 Checksums
echo "--> Generating SHA256 checksums..."
cd "${DIST_DIR}"
if command -v sha256sum >/dev/null 2>&1; then
    sha256sum progit_* > checksums.txt
elif command -v shasum >/dev/null 2>&1; then
    shasum -a 256 progit_* > checksums.txt
fi

echo "============================================================"
echo " Release Build Completed Successfully!"
echo " Artifacts located at: ${DIST_DIR}"
ls -lh "${DIST_DIR}"
echo "============================================================"
