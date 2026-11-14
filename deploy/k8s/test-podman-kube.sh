#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# ProGit Kubernetes Deployment Tester for Podman
# Validates Kubernetes YAML manifests locally using `podman kube play`
# ==============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
K8S_MANIFEST="${SCRIPT_DIR}/progit-deployment.yaml"
KEEP_RUNNING=false

if [ "${1:-}" = "--keep" ] || [ "${1:-}" = "-k" ]; then
    KEEP_RUNNING=true
fi

echo "============================================================"
echo " ProGit Kubernetes Podman Integration Test"
echo " Manifest: ${K8S_MANIFEST}"
echo "============================================================"

# 1. Check podman
if ! command -v podman >/dev/null 2>&1; then
    echo "✗ Error: podman CLI not found in PATH" >&2
    exit 1
fi

# 2. Cleanup any prior test pod
echo "--> Cleaning up any prior Kubernetes test pods..."
podman kube down "${K8S_MANIFEST}" >/dev/null 2>&1 || true

# 3. Deploy Kubernetes manifest with podman kube play
echo "--> Launching Kubernetes deployment via 'podman kube play'..."
podman kube play "${K8S_MANIFEST}"

# 4. Wait for pod and containers to become ready
echo "--> Waiting for ProGit Kubernetes Pod to become ready..."
CONTAINER_NAME="progit-pod-progit"
MAX_ATTEMPTS=30
ATTEMPT=0
HEALTHY=false

while [ $ATTEMPT -lt $MAX_ATTEMPTS ]; do
    ATTEMPT=$((ATTEMPT + 1))
    STATUS=$(curl -k -s -m 2 https://localhost:3443/api/health 2>/dev/null || true)
    if echo "${STATUS}" | grep -q '"status":"ok"'; then
        HEALTHY=true
        break
    fi
    sleep 1
done

if [ "${HEALTHY}" != true ]; then
    echo "✗ Error: ProGit pod failed to become healthy within ${MAX_ATTEMPTS} seconds" >&2
    podman logs "${CONTAINER_NAME}" || true
    podman kube down "${K8S_MANIFEST}" || true
    exit 1
fi

echo "✓ ProGit Kubernetes Pod is UP and HEALTHY!"

# 5. Verify Health Endpoint Payload
echo "--> Validating /api/health JSON payload..."
HEALTH_JSON=$(curl -k -s https://localhost:3443/api/health)
echo "    Response: ${HEALTH_JSON}"
if ! echo "${HEALTH_JSON}" | grep -q '"database":"healthy"'; then
    echo "✗ Database is not marked healthy in response" >&2
    exit 1
fi

# 6. Verify Prometheus Metrics Endpoint
echo "--> Validating Prometheus /metrics endpoint..."
METRICS_OUTPUT=$(curl -k -s https://localhost:3443/metrics | head -n 10)
echo "    Metrics Preview:"
echo "${METRICS_OUTPUT}" | sed 's/^/      /'
if ! echo "${METRICS_OUTPUT}" | grep -q 'progit_info'; then
    echo "✗ Expected progit_info gauge missing in /metrics" >&2
    exit 1
fi

# 7. Run 'progit doctor' inside the running Kubernetes pod
echo "--> Executing 'progit doctor' inside Kubernetes container (${CONTAINER_NAME})..."
podman exec "${CONTAINER_NAME}" /usr/local/bin/progit doctor

# 8. Test Autonomous Maintenance API
echo "--> Testing Autonomous Maintenance API in Kubernetes Pod..."
MAINT_JSON=$(curl -k -s -X POST https://localhost:3443/api/v1/admin/maintenance \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $(curl -k -s -X POST https://localhost:3443/api/v1/auth/login -H "Content-Type: application/json" -d '{"username":"admin","password":"AdminPassword123!"}' | grep -o '"token":"[^"]*' | cut -d'"' -f4)" \
    -d '{"operation":"optimize"}')
echo "    Maintenance response: ${MAINT_JSON}"

# 9. Result Summary & Teardown
echo "============================================================"
echo " ✓ KUBERNETES DEPLOYMENT PASSED ALL VALIDATION CHECKS"
echo "============================================================"

if [ "${KEEP_RUNNING}" = true ]; then
    echo "ProGit Kubernetes Pod is kept running at:"
    echo "  HTTPS: https://localhost:3443"
    echo "  HTTP:  http://localhost:3000"
    echo "  SSH:   ssh://git@localhost:2222"
    echo "To stop: podman kube down ${K8S_MANIFEST}"
else
    echo "--> Tearing down Kubernetes test pod..."
    podman kube down "${K8S_MANIFEST}"
    echo "✓ Test pod cleaned up."
fi

