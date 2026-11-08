#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# ProGit Docker Build Script
# Usage:
#   ./docker/build.sh                   # Build for local native architecture
#   ./docker/build.sh amd64             # Build explicitly for Linux x86_64 (amd64)
#   ./docker/build.sh arm64             # Build explicitly for Linux ARM64 (arm64)
#   ./docker/build.sh all               # Build multi-platform manifest (amd64 + arm64) using buildx
#   ./docker/build.sh amd64 --save      # Build amd64 and export progit-linux-amd64.tar
# ==============================================================================

PLATFORM_ARG="${1:-native}"
SAVE_TAR=false

if [ "${2:-}" = "--save" ] || [ "${1:-}" = "--save" ]; then
    SAVE_TAR=true
    if [ "${1:-}" = "--save" ]; then
        PLATFORM_ARG="amd64"
    fi
fi

IMAGE_BASE="progit"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${REPO_ROOT}"

echo "============================================================"
echo " Building ProGit Docker Container"
echo " Platform target: ${PLATFORM_ARG}"
echo "============================================================"

case "${PLATFORM_ARG}" in
    native)
        echo "--> Building native architecture container..."
        docker build -t "${IMAGE_BASE}:latest" -f Dockerfile .
        echo "✓ Successfully built: ${IMAGE_BASE}:latest"
        ;;

    amd64|linux/amd64|x86_64)
        TARGET_PLATFORM="linux/amd64"
        IMAGE_TAG="${IMAGE_BASE}:linux-amd64"
        echo "--> Building single-arch container for ${TARGET_PLATFORM}..."
        docker build --platform "${TARGET_PLATFORM}" -t "${IMAGE_TAG}" -t "${IMAGE_BASE}:latest" -f Dockerfile .
        echo "✓ Successfully built: ${IMAGE_TAG} and tagged as ${IMAGE_BASE}:latest"

        if [ "${SAVE_TAR}" = true ]; then
            TAR_FILE="${REPO_ROOT}/progit-docker-amd64.tar"
            echo "--> Exporting image to ${TAR_FILE}..."
            docker save "${IMAGE_TAG}" -o "${TAR_FILE}"
            echo "✓ Saved: ${TAR_FILE} ($(du -h "${TAR_FILE}" | cut -f1))"
            echo "  Transfer to your Linux server and run:"
            echo "    docker load -i ${TAR_FILE##*/}"
            echo "    ./docker/deploy.sh ${IMAGE_TAG}"
        fi
        ;;

    arm64|linux/arm64|aarch64)
        TARGET_PLATFORM="linux/arm64"
        IMAGE_TAG="${IMAGE_BASE}:linux-arm64"
        echo "--> Building single-arch container for ${TARGET_PLATFORM}..."
        docker build --platform "${TARGET_PLATFORM}" -t "${IMAGE_TAG}" -t "${IMAGE_BASE}:latest" -f Dockerfile .
        echo "✓ Successfully built: ${IMAGE_TAG} and tagged as ${IMAGE_BASE}:latest"

        if [ "${SAVE_TAR}" = true ]; then
            TAR_FILE="${REPO_ROOT}/progit-docker-arm64.tar"
            echo "--> Exporting image to ${TAR_FILE}..."
            docker save "${IMAGE_TAG}" -o "${TAR_FILE}"
            echo "✓ Saved: ${TAR_FILE} ($(du -h "${TAR_FILE}" | cut -f1))"
            echo "  Transfer to your Linux server and run:"
            echo "    docker load -i ${TAR_FILE##*/}"
            echo "    ./docker/deploy.sh ${IMAGE_TAG}"
        fi
        ;;

    all|multiarch)
        echo "--> Building multi-arch manifest (linux/amd64, linux/arm64) using docker buildx..."
        docker buildx create --use --name progit-builder 2>/dev/null || docker buildx use progit-builder
        docker buildx build --platform linux/amd64,linux/arm64 -t "${IMAGE_BASE}:latest" -f Dockerfile .
        echo "✓ Successfully built multi-arch image: ${IMAGE_BASE}:latest"
        ;;

    *)
        echo "Unknown platform: ${PLATFORM_ARG}. Use amd64, arm64, native, or all."
        exit 1
        ;;
esac
