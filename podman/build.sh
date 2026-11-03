#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# ProGit Container Build Script
# Usage:
#   ./podman/build.sh                   # Build for default platform (linux/amd64 & linux/arm64 multi-arch)
#   ./podman/build.sh amd64             # Build explicitly for Linux x86_64 (amd64)
#   ./podman/build.sh arm64             # Build explicitly for Linux ARM64 (arm64)
#   ./podman/build.sh all               # Build multi-platform manifest (amd64 + arm64)
#   ./podman/build.sh amd64 --save      # Build amd64 and export progit-linux-amd64.tar
# ==============================================================================

PLATFORM_ARG="${1:-all}"
SAVE_TAR=false

if [ "${2:-}" = "--save" ] || [ "${1:-}" = "--save" ]; then
    SAVE_TAR=true
    if [ "${1:-}" = "--save" ]; then
        PLATFORM_ARG="amd64"
    fi
fi

IMAGE_BASE="localhost/progit"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${REPO_ROOT}"

echo "============================================================"
echo " Building ProGit Container"
echo " Platform target: ${PLATFORM_ARG}"
echo "============================================================"

case "${PLATFORM_ARG}" in
    amd64|linux/amd64|x86_64)
        TARGET_PLATFORM="linux/amd64"
        IMAGE_TAG="${IMAGE_BASE}:linux-amd64"
        echo "--> Building single-arch container for ${TARGET_PLATFORM}..."
        podman build --platform "${TARGET_PLATFORM}" -t "${IMAGE_TAG}" -t "${IMAGE_BASE}:latest" -f Containerfile .
        echo "✓ Successfully built: ${IMAGE_TAG} and tagged as ${IMAGE_BASE}:latest"

        if [ "${SAVE_TAR}" = true ]; then
            TAR_FILE="${REPO_ROOT}/progit-linux-amd64.tar"
            echo "--> Exporting image to ${TAR_FILE}..."
            podman save "${IMAGE_TAG}" -o "${TAR_FILE}"
            echo "✓ Saved: ${TAR_FILE} ($(du -h "${TAR_FILE}" | cut -f1))"
            echo "  Transfer to your Linux server and run:"
            echo "    podman load -i ${TAR_FILE##*/}"
            echo "    ./podman/deploy.sh"
        fi
        ;;

    arm64|linux/arm64|aarch64)
        TARGET_PLATFORM="linux/arm64"
        IMAGE_TAG="${IMAGE_BASE}:linux-arm64"
        echo "--> Building single-arch container for ${TARGET_PLATFORM}..."
        podman build --platform "${TARGET_PLATFORM}" -t "${IMAGE_TAG}" -t "${IMAGE_BASE}:latest" -f Containerfile .
        echo "✓ Successfully built: ${IMAGE_TAG} and tagged as ${IMAGE_BASE}:latest"

        if [ "${SAVE_TAR}" = true ]; then
            TAR_FILE="${REPO_ROOT}/progit-linux-arm64.tar"
            echo "--> Exporting image to ${TAR_FILE}..."
            podman save "${IMAGE_TAG}" -o "${TAR_FILE}"
            echo "✓ Saved: ${TAR_FILE} ($(du -h "${TAR_FILE}" | cut -f1))"
        fi
        ;;

    all|multi)
        MANIFEST_NAME="${IMAGE_BASE}:latest"
        echo "--> Building multi-arch manifest (${MANIFEST_NAME}) for linux/amd64 & linux/arm64..."
        podman manifest rm "${MANIFEST_NAME}" >/dev/null 2>&1 || true
        podman rmi "${MANIFEST_NAME}" >/dev/null 2>&1 || true

        echo "  [1/2] Building linux/amd64..."
        podman build --platform linux/amd64 -t "${IMAGE_BASE}:linux-amd64" -f Containerfile .

        echo "  [2/2] Building linux/arm64..."
        podman build --platform linux/arm64 -t "${IMAGE_BASE}:linux-arm64" -f Containerfile .

        echo "  Creating multi-arch manifest..."
        podman manifest create "${MANIFEST_NAME}"
        podman manifest add "${MANIFEST_NAME}" "${IMAGE_BASE}:linux-amd64"
        podman manifest add "${MANIFEST_NAME}" "${IMAGE_BASE}:linux-arm64"

        echo "✓ Multi-arch manifest created: ${MANIFEST_NAME} (supports both amd64 and arm64)"
        ;;

    *)
        echo "Unknown platform: ${PLATFORM_ARG}. Supported: amd64, arm64, all"
        exit 1
        ;;
esac

echo "============================================================"
podman images | grep progit || true
echo "============================================================"
