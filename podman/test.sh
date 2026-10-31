#!/usr/bin/env bash
set -euo pipefail

PROGIT_URL="${PROGIT_URL:-http://localhost:3000}"
TEST_DIR=$(mktemp -d /tmp/progit-test-XXXXXX)
trap 'rm -rf "${TEST_DIR}"' EXIT

echo "=========================================================="
echo "      PROGIT LIVE CONTAINER FUNCTIONAL TEST SUITE         "
echo "=========================================================="
echo "Target URL: ${PROGIT_URL}"
echo "Temp directory: ${TEST_DIR}"

# 1. Health check
echo -n "[1/12] Verifying /api/health and /api/ready... "
HEALTH_RES=$(curl -s -f "${PROGIT_URL}/api/health")
echo "${HEALTH_RES}" | grep -q '"status":"ok"' || { echo "FAILED: ${HEALTH_RES}"; exit 1; }
curl -s -f "${PROGIT_URL}/api/ready" >/dev/null
echo "PASSED"

# 2. Register Admin User
echo -n "[2/12] Registering Administrator account... "
TIMESTAMP=$(date +%s)
ADMIN_USER="admin_${TIMESTAMP}"
ADMIN_PASS="AdminSecure123!"

if command -v podman >/dev/null 2>&1 && podman ps --filter "name=progit" --format "{{.Names}}" | grep -q "^progit$"; then
  podman exec progit /usr/local/bin/progit admin create-user --username="${ADMIN_USER}" --email="${ADMIN_USER}@example.com" --password="${ADMIN_PASS}" --admin >/dev/null
else
  REGISTER_RES=$(curl -s -X POST "${PROGIT_URL}/api/v1/auth/register" \
    -H "Content-Type: application/json" \
    -d "{\"username\":\"${ADMIN_USER}\",\"email\":\"${ADMIN_USER}@example.com\",\"password\":\"${ADMIN_PASS}\",\"full_name\":\"Test Admin\"}")
  echo "${REGISTER_RES}" | grep -q '"user"' || { echo "FAILED: ${REGISTER_RES}"; exit 1; }
fi
echo "PASSED"

# 3. Authenticate & Obtain Token
echo -n "[3/12] Authenticating administrator and getting session... "
LOGIN_RES=$(curl -s -c "${TEST_DIR}/cookies.txt" -X POST "${PROGIT_URL}/api/v1/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"username\":\"${ADMIN_USER}\",\"password\":\"${ADMIN_PASS}\"}")
echo "${LOGIN_RES}" | grep -q '"message":"Login successful"' || { echo "FAILED: ${LOGIN_RES}"; exit 1; }

AUTH_USER=$(curl -s -b "${TEST_DIR}/cookies.txt" "${PROGIT_URL}/api/v1/auth/me")
echo "${AUTH_USER}" | grep -q "\"username\":\"${ADMIN_USER}\"" || { echo "FAILED: ${AUTH_USER}"; exit 1; }
echo "PASSED"

# 4. Create Repository via REST API
echo -n "[4/12] Creating new repository via REST API... "
REPO_NAME="live-test-repo"
CREATE_REPO_RES=$(curl -s -b "${TEST_DIR}/cookies.txt" -X POST "${PROGIT_URL}/api/v1/repos" \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"${REPO_NAME}\",\"description\":\"Automated test repository\",\"private\":false,\"auto_init\":true}")
echo "${CREATE_REPO_RES}" | grep -q "\"name\":\"${REPO_NAME}\"" || { echo "FAILED: ${CREATE_REPO_RES}"; exit 1; }
echo "PASSED"

# 5. Git CLI Clone over HTTP
echo -n "[5/12] Executing live Git CLI clone over HTTP... "
CLONE_URL="http://${ADMIN_USER}:${ADMIN_PASS}@localhost:3000/${ADMIN_USER}/${REPO_NAME}.git"
cd "${TEST_DIR}"
git clone "${CLONE_URL}" "local_clone" >/dev/null 2>&1
test -f "local_clone/README.md" || { echo "FAILED: README.md not found in clone"; exit 1; }
echo "PASSED"

# 6. Git Push New File over HTTP
echo -n "[6/12] Committing changes and pushing to ProGit... "
cd "${TEST_DIR}/local_clone"
echo "ProGit Production Test Content" > "test-file.txt"
git config user.name "Test Admin"
git config user.email "${ADMIN_USER}@example.com"
git add "test-file.txt"
git commit -m "Add test file" >/dev/null
git push origin main >/dev/null 2>&1
echo "PASSED"

# 7. Git Pull and Verify Remote State
echo -n "[7/12] Cloning to a second directory to verify remote state... "
cd "${TEST_DIR}"
git clone "${CLONE_URL}" "verify_clone" >/dev/null 2>&1
test -f "verify_clone/test-file.txt" || { echo "FAILED: Pushed file not found in verify clone"; exit 1; }
echo "PASSED"

# 8. Issues & Discussion Workflow
echo -n "[8/12] Testing Issue creation and commenting... "
ISSUE_RES=$(curl -s -b "${TEST_DIR}/cookies.txt" -X POST "${PROGIT_URL}/api/v1/repos/${ADMIN_USER}/${REPO_NAME}/issues" \
  -H "Content-Type: application/json" \
  -d '{"title":"Automated Test Issue","content":"Verifying issue tracking"}')
echo "${ISSUE_RES}" | grep -q '"index_number":' || { echo "FAILED: ${ISSUE_RES}"; exit 1; }

COMMENT_RES=$(curl -s -b "${TEST_DIR}/cookies.txt" -X POST "${PROGIT_URL}/api/v1/repos/${ADMIN_USER}/${REPO_NAME}/issues/1/comments" \
  -H "Content-Type: application/json" \
  -d '{"content":"This is an automated comment"}')
echo "${COMMENT_RES}" | grep -q '"content":"This is an automated comment"' || { echo "FAILED: ${COMMENT_RES}"; exit 1; }
echo "PASSED"

# 9. Pull Request & Native Git Merge Workflow
echo -n "[9/12] Testing Branch creation, PR, and real Git merge... "
cd "${TEST_DIR}/local_clone"
git checkout -b "feature-test" >/dev/null 2>&1
echo "Feature content" > "feature.txt"
git add "feature.txt"
git commit -m "Feature commit" >/dev/null
git push origin "feature-test" >/dev/null 2>&1

PR_RES=$(curl -s -b "${TEST_DIR}/cookies.txt" -X POST "${PROGIT_URL}/api/v1/repos/${ADMIN_USER}/${REPO_NAME}/pulls" \
  -H "Content-Type: application/json" \
  -d '{"title":"Feature PR","content":"Testing merge","head_branch":"feature-test","base_branch":"main"}')
echo "${PR_RES}" | grep -q '"head_branch":"feature-test"' || { echo "FAILED: ${PR_RES}"; exit 1; }

MERGE_RES=$(curl -s -b "${TEST_DIR}/cookies.txt" -X POST "${PROGIT_URL}/api/v1/repos/${ADMIN_USER}/${REPO_NAME}/pulls/2/merge" \
  -H "Content-Type: application/json" \
  -d '{"merge_style":"merge"}')
echo "${MERGE_RES}" | grep -q '"merge_commit_sha"' || { echo "FAILED: ${MERGE_RES}"; exit 1; }

# Verify merged commit was pushed to bare repo by pulling in verify_clone
cd "${TEST_DIR}/verify_clone"
git pull origin main >/dev/null 2>&1
test -f "feature.txt" || { echo "FAILED: Merged file not present on main branch after pull"; exit 1; }
echo "PASSED"

# 10. Admin Telemetry
echo -n "[10/12] Verifying Admin telemetry API... "
STATS_RES=$(curl -s -b "${TEST_DIR}/cookies.txt" "${PROGIT_URL}/api/v1/admin/stats")
echo "${STATS_RES}" | grep -q '"users_count":' || { echo "FAILED: ${STATS_RES}"; exit 1; }
echo "PASSED"

# 11. Wiki Engine & Git-backed Wiki Bare Repository
echo -n "[11/12] Testing Git-backed Wiki engine & CLI clone... "
WIKI_SAVE_RES=$(curl -s -b "${TEST_DIR}/cookies.txt" -X POST "${PROGIT_URL}/api/v1/repos/${ADMIN_USER}/${REPO_NAME}/wiki/pages" \
  -H "Content-Type: application/json" \
  -d '{"slug":"Architecture","title":"System Architecture","content":"# Architecture\n\nWiki content test","message":"Init wiki"}')
echo "${WIKI_SAVE_RES}" | grep -q '"slug":"Architecture"' || { echo "FAILED: ${WIKI_SAVE_RES}"; exit 1; }

WIKI_CLONE_URL="http://${ADMIN_USER}:${ADMIN_PASS}@localhost:3000/${ADMIN_USER}/${REPO_NAME}.wiki.git"
cd "${TEST_DIR}"
git clone "${WIKI_CLONE_URL}" "wiki_clone" >/dev/null 2>&1
test -f "wiki_clone/Architecture.md" || { echo "FAILED: Architecture.md not found in cloned wiki repo"; exit 1; }
echo "PASSED"

# 12. ProGit Pages (GitHub Pages clone)
echo -n "[12/12] Testing ProGit Pages hosting & markdown fallback... "
# Enable pages on main branch
PAGES_CONFIG_RES=$(curl -s -b "${TEST_DIR}/cookies.txt" -X POST "${PROGIT_URL}/api/v1/repos/${ADMIN_USER}/${REPO_NAME}/pages" \
  -H "Content-Type: application/json" \
  -d '{"enable_pages":true,"pages_branch":"main","pages_folder":"/"}')
echo "${PAGES_CONFIG_RES}" | grep -q '"pages_url":' || { echo "FAILED: ${PAGES_CONFIG_RES}"; exit 1; }

# Request /pages/:owner/:repo/ which falls back to README.md
PAGES_RES=$(curl -s -f "${PROGIT_URL}/pages/${ADMIN_USER}/${REPO_NAME}/")
echo "${PAGES_RES}" | grep -q "${REPO_NAME}" || { echo "FAILED: Pages content missing repo name. Body: ${PAGES_RES}"; exit 1; }
echo "PASSED"

echo "=========================================================="
echo "    ALL 12 LIVE INTEGRATION TEST SUITES PASSED (100%)    "
echo "=========================================================="

