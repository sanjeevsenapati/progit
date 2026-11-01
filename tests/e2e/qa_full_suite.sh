#!/usr/bin/env bash
set -euo pipefail

PROGIT_URL="${PROGIT_URL:-http://localhost:3000}"
SSH_HOST="${PROGIT_SSH_HOST:-localhost}"
SSH_PORT="${PROGIT_SSH_PORT:-2222}"

TEST_DIR=$(mktemp -d /tmp/progit-qa-XXXXXX)
trap 'rm -rf "${TEST_DIR}"' EXIT

PASSED_COUNT=0
FAILED_COUNT=0
TOTAL_COUNT=0

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

log_test() {
  TOTAL_COUNT=$((TOTAL_COUNT + 1))
  local test_name="$1"
  printf "  [%02d] %-60s " "${TOTAL_COUNT}" "${test_name}"
}

assert_pass() {
  local msg="${1:-}"
  PASSED_COUNT=$((PASSED_COUNT + 1))
  if [ -n "$msg" ]; then
    printf "${GREEN}PASS${NC} (%s)\n" "$msg"
  else
    printf "${GREEN}PASS${NC}\n"
  fi
}

assert_fail() {
  local reason="$1"
  FAILED_COUNT=$((FAILED_COUNT + 1))
  printf "${RED}FAIL${NC}\n"
  echo "       Error: ${reason}"
  exit 1
}

echo -e "${CYAN}========================================================================${NC}"
echo -e "${CYAN}             PROGIT PLATFORM QA FULL FEATURE TEST SUITE                ${NC}"
echo -e "${CYAN}========================================================================${NC}"
echo "Target URL:      ${PROGIT_URL}"
echo "SSH Endpoint:    ${SSH_HOST}:${SSH_PORT}"
echo "Temp Workspace:  ${TEST_DIR}"
echo "Date:            $(date)"
echo ""

# -----------------------------------------------------------------------------
# SUITE 1: System Health, Readiness & Frontend Delivery
# -----------------------------------------------------------------------------
echo -e "${BLUE}=== [1/10] SYSTEM HEALTH, READINESS & FRONTEND SPA DELIVERY ===${NC}"

log_test "Check /api/health endpoint"
HEALTH=$(curl -s -f "${PROGIT_URL}/api/health")
echo "${HEALTH}" | grep -q '"status":"ok"' || assert_fail "Invalid health response: ${HEALTH}"
assert_pass "status=ok"

log_test "Check /api/ready endpoint"
curl -s -f "${PROGIT_URL}/api/ready" >/dev/null || assert_fail "Readiness endpoint failed"
assert_pass "HTTP 200"

log_test "Serve SPA HTML at root (GET /)"
ROOT_HTML=$(curl -s -f "${PROGIT_URL}/")
echo "${ROOT_HTML}" | grep -q 'id="root"' || assert_fail "Root HTML missing React root container"
echo "${ROOT_HTML}" | grep -q '/assets/' || assert_fail "Root HTML missing bundled assets"
assert_pass "Embedded UI loaded"

log_test "Serve SPA deep client routes (GET /explore, /settings)"
EXPLORE_HTML=$(curl -s -f "${PROGIT_URL}/explore")
echo "${EXPLORE_HTML}" | grep -q 'id="root"' || assert_fail "SPA fallback failed for /explore"
assert_pass "SPA fallback functional"

log_test "Verify Frontpage Attributions & Prettier: Prodevans, Sanjeev Senapati, Gogs credit"
ASSET_JS=$(echo "${ROOT_HTML}" | grep -o 'src="/assets/index-[^"]*\.js"' | head -n1 | cut -d'"' -f2)
[ -n "${ASSET_JS}" ] || assert_fail "Could not find JS asset in root HTML"
JS_FILE="${TEST_DIR}/bundle.js"
curl -s -f "${PROGIT_URL}${ASSET_JS}" -o "${JS_FILE}"
grep -qi "Prodevans" "${JS_FILE}" || assert_fail "Frontpage missing 'Supported by Prodevans'"
grep -qi "Sanjeev Senapati" "${JS_FILE}" || assert_fail "Frontpage missing 'Created by Sanjeev Senapati'"
grep -qi "Gogs source code" "${JS_FILE}" || assert_fail "Frontpage missing 'Built on top of Gogs source code'"
grep -qi "Prettier" "${JS_FILE}" || assert_fail "Prettier theme / editor missing in bundle"
assert_pass "Frontpage attributions and Prettier theme confirmed"

log_test "Verify HSTS security headers & HTTPS readiness"
HSTS_HEADER=$(curl -s -I -H "X-Forwarded-Proto: https" "${PROGIT_URL}/api/health" | grep -i "strict-transport-security" || true)
echo "${HSTS_HEADER}" | grep -q "max-age=" || assert_fail "Missing Strict-Transport-Security header when HTTPS requested"
assert_pass "HSTS header enforced"

# -----------------------------------------------------------------------------
# SUITE 2: Installation Wizard & Super Admin Setup
# -----------------------------------------------------------------------------
echo -e "\n${BLUE}=== [2/10] INSTALLATION WIZARD & SUPER ADMIN SETUP ===${NC}"

log_test "Inspect installation status (/api/v1/install/status)"
INSTALL_STATUS=$(curl -s -f "${PROGIT_URL}/api/v1/install/status")
echo "${INSTALL_STATUS}" | grep -q '"app_name"' || assert_fail "Install status missing app_name"
assert_pass "status retrieved"

TIMESTAMP=$(date +%s)
ADMIN_USER="super_qa_${TIMESTAMP}"
ADMIN_PASS="SuperSecureQA2026!"
ADMIN_EMAIL="${ADMIN_USER}@example.com"

log_test "Create Super Admin account via CLI or Install API"
if command -v podman >/dev/null 2>&1 && podman ps --filter "name=progit" --format "{{.Names}}" | grep -q "^progit$"; then
  podman exec progit /usr/local/bin/progit admin create-user --username="${ADMIN_USER}" --email="${ADMIN_EMAIL}" --password="${ADMIN_PASS}" --admin >/dev/null
  assert_pass "Created via CLI"
else
  INSTALL_RES=$(curl -s -X POST "${PROGIT_URL}/api/v1/install" \
    -H "Content-Type: application/json" \
    -d "{\"app_name\":\"ProGit\",\"domain\":\"localhost\",\"http_port\":3000,\"root_url\":\"http://localhost:3000/\",\"admin_username\":\"${ADMIN_USER}\",\"admin_email\":\"${ADMIN_EMAIL}\",\"admin_password\":\"${ADMIN_PASS}\"}")
  echo "${INSTALL_RES}" | grep -q '"token":' || assert_fail "Failed to install: ${INSTALL_RES}"
  assert_pass "Created via API"
fi

# -----------------------------------------------------------------------------
# SUITE 3: User Authentication, PAT & SSH Key Lifecycle
# -----------------------------------------------------------------------------
echo -e "\n${BLUE}=== [3/10] AUTHENTICATION, PERSONAL ACCESS TOKENS & SSH KEYS ===${NC}"

log_test "Authenticate Super Admin via /api/v1/auth/login"
LOGIN_RES=$(curl -s -c "${TEST_DIR}/admin_cookies.txt" -X POST "${PROGIT_URL}/api/v1/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"username\":\"${ADMIN_USER}\",\"password\":\"${ADMIN_PASS}\"}")
echo "${LOGIN_RES}" | grep -q '"message":"Login successful"' || assert_fail "Login failed: ${LOGIN_RES}"
ADMIN_TOKEN=$(echo "${LOGIN_RES}" | sed -n 's/.*"token":"\([^"]*\)".*/\1/p')
assert_pass "Session created"

log_test "Verify authenticated identity via /api/v1/auth/me"
ME_RES=$(curl -s -b "${TEST_DIR}/admin_cookies.txt" "${PROGIT_URL}/api/v1/auth/me")
echo "${ME_RES}" | grep -q "\"username\":\"${ADMIN_USER}\"" || assert_fail "Auth me mismatch: ${ME_RES}"
echo "${ME_RES}" | grep -q '"is_admin":true' || assert_fail "User is not marked as admin"
assert_pass "Super Admin verified"

# Register standard developer user
DEV_USER="developer_${TIMESTAMP}"
DEV_PASS="DevPass12345!"
DEV_EMAIL="${DEV_USER}@example.com"

log_test "Register standard developer user (/api/v1/auth/register)"
REG_RES=$(curl -s -c "${TEST_DIR}/dev_cookies.txt" -X POST "${PROGIT_URL}/api/v1/auth/register" \
  -H "Content-Type: application/json" \
  -d "{\"username\":\"${DEV_USER}\",\"email\":\"${DEV_EMAIL}\",\"password\":\"${DEV_PASS}\",\"full_name\":\"Test Developer\"}")
echo "${REG_RES}" | grep -q '"token":' || assert_fail "Registration failed: ${REG_RES}"
DEV_TOKEN=$(echo "${REG_RES}" | sed -n 's/.*"token":"\([^"]*\)".*/\1/p')
assert_pass "Registered successfully"

# Register unprivileged stranger user for security access control testing
STRANGER_USER="stranger_${TIMESTAMP}"
STRANGER_PASS="StrangerPass12345!"
STRANGER_EMAIL="${STRANGER_USER}@example.com"

log_test "Register unprivileged stranger user for security checks"
STRANGER_RES=$(curl -s -c "${TEST_DIR}/stranger_cookies.txt" -X POST "${PROGIT_URL}/api/v1/auth/register" \
  -H "Content-Type: application/json" \
  -d "{\"username\":\"${STRANGER_USER}\",\"email\":\"${STRANGER_EMAIL}\",\"password\":\"${STRANGER_PASS}\",\"full_name\":\"Test Stranger\"}")
echo "${STRANGER_RES}" | grep -q '"token":' || assert_fail "Stranger registration failed: ${STRANGER_RES}"
STRANGER_TOKEN=$(echo "${STRANGER_RES}" | sed -n 's/.*"token":"\([^"]*\)".*/\1/p')
assert_pass "Stranger registered successfully"

log_test "Prevent duplicate username registration"
DUP_RES=$(curl -s -w "%{http_code}" -o /dev/null -X POST "${PROGIT_URL}/api/v1/auth/register" \
  -H "Content-Type: application/json" \
  -d "{\"username\":\"${DEV_USER}\",\"email\":\"unique_${TIMESTAMP}@example.com\",\"password\":\"DevPass12345!\"}")
[ "${DUP_RES}" = "409" ] || [ "${DUP_RES}" = "400" ] || assert_fail "Expected 409/400 for duplicate user, got ${DUP_RES}"
assert_pass "Duplicate rejected"

log_test "Generate Personal Access Token (PAT)"
PAT_RES=$(curl -s -b "${TEST_DIR}/dev_cookies.txt" -X POST "${PROGIT_URL}/api/v1/user/tokens" \
  -H "Content-Type: application/json" \
  -d '{"name":"ci-cd-token","scopes":"repo"}')
echo "${PAT_RES}" | grep -q '"raw_token":' || assert_fail "PAT creation failed: ${PAT_RES}"
DEV_PAT=$(echo "${PAT_RES}" | sed -n 's/.*"raw_token":"\([^"]*\)".*/\1/p')
assert_pass "PAT generated"

log_test "Authenticate REST API using Bearer PAT"
PAT_AUTH_RES=$(curl -s -H "Authorization: Bearer ${DEV_PAT}" "${PROGIT_URL}/api/v1/auth/me")
echo "${PAT_AUTH_RES}" | grep -q "\"username\":\"${DEV_USER}\"" || assert_fail "PAT Bearer auth failed: ${PAT_AUTH_RES}"
assert_pass "Bearer PAT authorized"

log_test "Register Ed25519 SSH Public Key"
ssh-keygen -t ed25519 -N "" -f "${TEST_DIR}/id_ed25519" -C "${DEV_EMAIL}" >/dev/null 2>&1
DEV_PUB_KEY=$(cat "${TEST_DIR}/id_ed25519.pub")
KEY_RES=$(curl -s -b "${TEST_DIR}/dev_cookies.txt" -X POST "${PROGIT_URL}/api/v1/user/keys" \
  -H "Content-Type: application/json" \
  -d "{\"title\":\"QA Test Key\",\"key\":\"${DEV_PUB_KEY}\"}")
echo "${KEY_RES}" | grep -q '"fingerprint":' || assert_fail "Failed to add SSH key: ${KEY_RES}"
KEY_ID=$(echo "${KEY_RES}" | python3 -c "import sys, json; print(json.load(sys.stdin)['id'])")
assert_pass "SSH key registered (id: ${KEY_ID})"

log_test "List SSH Public Keys (Verify JSON array serialization)"
KEYS_LIST=$(curl -s -b "${TEST_DIR}/dev_cookies.txt" "${PROGIT_URL}/api/v1/user/keys")
echo "${KEYS_LIST}" | grep -q "QA Test Key" || assert_fail "SSH keys list missing newly added key: ${KEYS_LIST}"
assert_pass "SSH keys enumerated as array"

log_test "Update User Profile Settings (PUT /api/v1/user/settings)"
SETTINGS_RES=$(curl -s -b "${TEST_DIR}/dev_cookies.txt" -X PUT "${PROGIT_URL}/api/v1/user/settings" \
  -H "Content-Type: application/json" \
  -d '{"full_name":"Lead Software Architect","bio":"Passionate full-stack developer building scalable platforms","location":"Bangalore, India","website":"https://progit.io"}')
echo "${SETTINGS_RES}" | grep -q "Lead Software Architect" || assert_fail "Profile update failed: ${SETTINGS_RES}"
echo "${SETTINGS_RES}" | grep -q "Bangalore, India" || assert_fail "Location update failed: ${SETTINGS_RES}"
assert_pass "Profile settings updated"

log_test "Update User Password (PUT /api/v1/user/password)"
CHANGE_PWD_RES=$(curl -s -b "${TEST_DIR}/dev_cookies.txt" -X PUT "${PROGIT_URL}/api/v1/user/password" \
  -H "Content-Type: application/json" \
  -d "{\"old_password\":\"${DEV_PASS}\",\"new_password\":\"NewSecurePass2026!\"}")
echo "${CHANGE_PWD_RES}" | grep -q "Password updated successfully" || assert_fail "Password change failed: ${CHANGE_PWD_RES}"
# Re-login with new password to ensure session validity
REAUTH_RES=$(curl -s -c "${TEST_DIR}/dev_cookies.txt" -X POST "${PROGIT_URL}/api/v1/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"username\":\"${DEV_USER}\",\"password\":\"NewSecurePass2026!\"}")
echo "${REAUTH_RES}" | grep -q "Login successful" || assert_fail "Login with updated password failed: ${REAUTH_RES}"
DEV_PASS="NewSecurePass2026!"
assert_pass "Password changed and re-authenticated"

log_test "Inspect User Dashboard Overview API (/api/v1/user/dashboard)"
DASH_RES=$(curl -s -b "${TEST_DIR}/dev_cookies.txt" "${PROGIT_URL}/api/v1/user/dashboard")
echo "${DASH_RES}" | grep -q '"repositories":' || assert_fail "Dashboard missing repositories: ${DASH_RES}"
echo "${DASH_RES}" | grep -q '"activities":' || assert_fail "Dashboard missing activities: ${DASH_RES}"
echo "${DASH_RES}" | grep -q '"organizations":' || assert_fail "Dashboard missing organizations: ${DASH_RES}"
assert_pass "Dashboard overview API verified"

log_test "Inspect User Profile Overview API (/api/v1/users/:username)"
PROF_RES=$(curl -s "${PROGIT_URL}/api/v1/users/${DEV_USER}")
echo "${PROF_RES}" | grep -q "Lead Software Architect" || assert_fail "Profile overview missing full_name: ${PROF_RES}"
echo "${PROF_RES}" | grep -q "Bangalore, India" || assert_fail "Profile overview missing location: ${PROF_RES}"
echo "${PROF_RES}" | grep -q '"repositories":' || assert_fail "Profile overview missing repositories: ${PROF_RES}"
assert_pass "Profile overview API verified"

log_test "Delete SSH Public Key (DELETE /api/v1/user/keys/:id)"
DEL_KEY_RES=$(curl -s -b "${TEST_DIR}/dev_cookies.txt" -X DELETE "${PROGIT_URL}/api/v1/user/keys/${KEY_ID}")
echo "${DEL_KEY_RES}" | grep -q "Key deleted successfully" || assert_fail "Delete key failed: ${DEL_KEY_RES}"
POST_DEL_KEYS=$(curl -s -b "${TEST_DIR}/dev_cookies.txt" "${PROGIT_URL}/api/v1/user/keys")
echo "${POST_DEL_KEYS}" | grep -q "QA Test Key" && assert_fail "Deleted key still in list: ${POST_DEL_KEYS}"
assert_pass "SSH key deleted and removed"

# Register Ed25519 key again so SSH git CLI tests in Suite 5 continue working seamlessly
ssh-keygen -t ed25519 -N "" -f "${TEST_DIR}/id_ed25519_new" -C "${DEV_EMAIL}" >/dev/null 2>&1
DEV_NEW_PUB=$(cat "${TEST_DIR}/id_ed25519_new.pub")
mv -f "${TEST_DIR}/id_ed25519_new" "${TEST_DIR}/id_ed25519"
mv -f "${TEST_DIR}/id_ed25519_new.pub" "${TEST_DIR}/id_ed25519.pub"
curl -s -b "${TEST_DIR}/dev_cookies.txt" -X POST "${PROGIT_URL}/api/v1/user/keys" \
  -H "Content-Type: application/json" \
  -d "{\"title\":\"QA Git CLI Key\",\"key\":\"${DEV_NEW_PUB}\"}" >/dev/null

# -----------------------------------------------------------------------------
# SUITE 4: Repository Management & Visibility Controls
# -----------------------------------------------------------------------------
echo -e "\n${BLUE}=== [4/10] REPOSITORY LIFECYCLE & ACCESS CONTROLS ===${NC}"

PUBLIC_REPO="qa-public-repo"
PRIVATE_REPO="qa-private-repo"

log_test "Create Public Repository with Auto-Init (README & main branch)"
PUB_REPO_RES=$(curl -s -b "${TEST_DIR}/dev_cookies.txt" -X POST "${PROGIT_URL}/api/v1/repos" \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"${PUBLIC_REPO}\",\"description\":\"Public QA test repository\",\"private\":false,\"auto_init\":true}")
echo "${PUB_REPO_RES}" | grep -q "\"name\":\"${PUBLIC_REPO}\"" || assert_fail "Failed to create public repo: ${PUB_REPO_RES}"
assert_pass "Public repo created"

log_test "Create Private Repository (Bare, no auto-init)"
PRIV_REPO_RES=$(curl -s -b "${TEST_DIR}/dev_cookies.txt" -X POST "${PROGIT_URL}/api/v1/repos" \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"${PRIVATE_REPO}\",\"description\":\"Confidential internal project\",\"private\":true,\"auto_init\":false}")
echo "${PRIV_REPO_RES}" | grep -q "\"name\":\"${PRIVATE_REPO}\"" || assert_fail "Failed to create private repo: ${PRIV_REPO_RES}"
assert_pass "Private repo created"

log_test "Verify Unauthenticated Access to Public Repository"
UNAUTH_PUB=$(curl -s -w "%{http_code}" -o /dev/null "${PROGIT_URL}/api/v1/repos/${DEV_USER}/${PUBLIC_REPO}")
[ "${UNAUTH_PUB}" = "200" ] || assert_fail "Expected 200 for public repo, got ${UNAUTH_PUB}"
assert_pass "Public repo accessible"

log_test "Verify Unauthenticated Access to Private Repository is Denied"
UNAUTH_PRIV=$(curl -s -w "%{http_code}" -o /dev/null "${PROGIT_URL}/api/v1/repos/${DEV_USER}/${PRIVATE_REPO}")
[ "${UNAUTH_PRIV}" = "404" ] || [ "${UNAUTH_PRIV}" = "403" ] || assert_fail "Expected 404/403 for private repo, got ${UNAUTH_PRIV}"
assert_pass "Private repo protected"

log_test "Star & Unstar Repository"
STAR_RES=$(curl -s -b "${TEST_DIR}/admin_cookies.txt" -X POST "${PROGIT_URL}/api/v1/repos/${DEV_USER}/${PUBLIC_REPO}/star")
echo "${STAR_RES}" | grep -q '"starred":true' || assert_fail "Failed to star repo: ${STAR_RES}"
UNSTAR_RES=$(curl -s -b "${TEST_DIR}/admin_cookies.txt" -X POST "${PROGIT_URL}/api/v1/repos/${DEV_USER}/${PUBLIC_REPO}/star")
echo "${UNSTAR_RES}" | grep -q '"starred":false' || assert_fail "Failed to unstar repo: ${UNSTAR_RES}"
assert_pass "Star toggle functional"

# -----------------------------------------------------------------------------
# SUITE 4B: Branch Management & UI Branch Operations
# -----------------------------------------------------------------------------
echo -e "\n${BLUE}=== [4B/10] BRANCH MANAGEMENT & UI BRANCH LIFECYCLE ===${NC}"

log_test "List Repository Branches (GET /api/v1/repos/:owner/:repo/branches)"
BRANCHES_RES=$(curl -s "${PROGIT_URL}/api/v1/repos/${DEV_USER}/${PUBLIC_REPO}/branches")
echo "${BRANCHES_RES}" | grep -q "main" || assert_fail "Branches missing main: ${BRANCHES_RES}"
assert_pass "Branches listed"

log_test "List Branch Details with commit info (GET /branches?detail=true)"
BRANCH_DETAILS=$(curl -s "${PROGIT_URL}/api/v1/repos/${DEV_USER}/${PUBLIC_REPO}/branches?detail=true")
echo "${BRANCH_DETAILS}" | grep -q '"is_default":true' || assert_fail "Branch details missing is_default: ${BRANCH_DETAILS}"
echo "${BRANCH_DETAILS}" | grep -q '"commit_sha":' || assert_fail "Branch details missing commit_sha: ${BRANCH_DETAILS}"
assert_pass "Branch details retrieved with commit info"

log_test "Create New Branch via UI API (POST /branches)"
CREATE_BRANCH_RES=$(curl -s -b "${TEST_DIR}/dev_cookies.txt" -X POST "${PROGIT_URL}/api/v1/repos/${DEV_USER}/${PUBLIC_REPO}/branches" \
  -H "Content-Type: application/json" \
  -d '{"branch_name":"ui-feature-branch","base_ref":"main"}')
echo "${CREATE_BRANCH_RES}" | grep -q '"branch":"ui-feature-branch"' || assert_fail "Failed to create branch: ${CREATE_BRANCH_RES}"
assert_pass "Branch created successfully via UI API"

log_test "Enforce Branch Protection: Block Deleting Default Branch (DELETE /branches/main)"
DEL_MAIN_CODE=$(curl -s -b "${TEST_DIR}/dev_cookies.txt" -w "%{http_code}" -o /dev/null -X DELETE "${PROGIT_URL}/api/v1/repos/${DEV_USER}/${PUBLIC_REPO}/branches/main")
[ "${DEL_MAIN_CODE}" = "400" ] || assert_fail "Expected 400 when attempting to delete main, got ${DEL_MAIN_CODE}"
assert_pass "Default branch deletion blocked"

log_test "Delete Non-Default Branch via UI API (DELETE /branches/:branch)"
DEL_BRANCH_RES=$(curl -s -b "${TEST_DIR}/dev_cookies.txt" -X DELETE "${PROGIT_URL}/api/v1/repos/${DEV_USER}/${PUBLIC_REPO}/branches/ui-feature-branch")
echo "${DEL_BRANCH_RES}" | grep -q "Branch deleted successfully" || assert_fail "Failed to delete branch: ${DEL_BRANCH_RES}"
POST_DEL_BRANCHES=$(curl -s "${PROGIT_URL}/api/v1/repos/${DEV_USER}/${PUBLIC_REPO}/branches")
echo "${POST_DEL_BRANCHES}" | grep -q "ui-feature-branch" && assert_fail "Deleted branch still exists: ${POST_DEL_BRANCHES}"
assert_pass "Branch deleted successfully"

# -----------------------------------------------------------------------------
# SUITE 5: Git CLI Operations (Smart HTTP & Native SSH)
# -----------------------------------------------------------------------------
echo -e "\n${BLUE}=== [5A/10] GIT CLI OPERATIONS (SMART HTTP & SSH) ===${NC}"

log_test "Git Clone Public Repository over Smart HTTP"
HTTP_CLONE_URL="http://${DEV_USER}:${DEV_PASS}@localhost:3000/${DEV_USER}/${PUBLIC_REPO}.git"
cd "${TEST_DIR}"
git clone "${HTTP_CLONE_URL}" "http_clone" >/dev/null 2>&1 || assert_fail "HTTP Git clone failed"
test -f "http_clone/README.md" || assert_fail "README.md missing in cloned repo"
assert_pass "Cloned successfully"

log_test "Git Push commits and new files to main branch over HTTP"
cd "${TEST_DIR}/http_clone"
echo "console.log('ProGit QA Test');" > app.js
mkdir -p src docs
echo "module.exports = {};" > src/index.js
echo "# Documentation" > docs/index.md
git config user.name "Test Developer"
git config user.email "${DEV_EMAIL}"
git add .
git commit -m "Add core project files" >/dev/null
git push origin main >/dev/null 2>&1 || assert_fail "Git push to main failed"
assert_pass "Pushed commits to main"

log_test "Verify Remote File Tree via REST API"
TREE_RES=$(curl -s "${PROGIT_URL}/api/v1/repos/${DEV_USER}/${PUBLIC_REPO}/tree?ref=main")
echo "${TREE_RES}" | grep -q '"name":"app.js"' || assert_fail "app.js missing from remote tree"
echo "${TREE_RES}" | grep -q '"name":"src"' || assert_fail "src directory missing from remote tree"
assert_pass "Remote tree synchronized"

log_test "Verify Blob & Raw Content API"
RAW_RES=$(curl -s "${PROGIT_URL}/api/v1/repos/${DEV_USER}/${PUBLIC_REPO}/raw?ref=main&path=app.js")
echo "${RAW_RES}" | grep -q "console.log('ProGit QA Test');" || assert_fail "Raw content mismatch"
assert_pass "Blob and Raw API functional"

log_test "Verify Commit Unified Diff API"
COMMITS_RES=$(curl -s "${PROGIT_URL}/api/v1/repos/${DEV_USER}/${PUBLIC_REPO}/commits?ref=main")
LATEST_SHA=$(echo "${COMMITS_RES}" | sed -n 's/.*"sha":"\([^"]*\)".*/\1/p' | head -n 1)
DIFF_RES=$(curl -s "${PROGIT_URL}/api/v1/repos/${DEV_USER}/${PUBLIC_REPO}/commits/${LATEST_SHA}")
echo "${DIFF_RES}" | grep -q '"patch":' || assert_fail "Commit diff missing patch content"
assert_pass "Commit diff rendered"

# -----------------------------------------------------------------------------
# SUITE 5B: Online File Operations (Create, Edit, Delete, Upload & Online Commit)
# -----------------------------------------------------------------------------
echo -e "\n${BLUE}=== [5B/10] ONLINE FILE OPERATIONS (CREATE, EDIT, UPLOAD, COMMIT) ===${NC}"

log_test "Online File Creation (Create src/config/database.json)"
CREATE_FILE_RES=$(curl -s -b "${TEST_DIR}/dev_cookies.txt" -X POST "${PROGIT_URL}/api/v1/repos/${DEV_USER}/${PUBLIC_REPO}/contents/src/config/database.json" \
  -H "Content-Type: application/json" \
  -d '{"branch":"main","content":"{\n  \"host\": \"localhost\",\n  \"port\": 5432\n}","message":"Create database config online"}')
echo "${CREATE_FILE_RES}" | grep -q '"commit_sha":' || assert_fail "Online file creation failed: ${CREATE_FILE_RES}"
assert_pass "Created file with online commit"

log_test "Verify newly created file blob via API"
BLOB_RES=$(curl -s "${PROGIT_URL}/api/v1/repos/${DEV_USER}/${PUBLIC_REPO}/blob?ref=main&path=src/config/database.json")
echo "${BLOB_RES}" | grep -q 'localhost' || assert_fail "Blob content mismatch after online creation: ${BLOB_RES}"
assert_pass "File content verified on main"

log_test "Online File Edit (Update src/config/database.json)"
EDIT_FILE_RES=$(curl -s -b "${TEST_DIR}/dev_cookies.txt" -X POST "${PROGIT_URL}/api/v1/repos/${DEV_USER}/${PUBLIC_REPO}/contents/src/config/database.json" \
  -H "Content-Type: application/json" \
  -d '{"branch":"main","content":"{\n  \"host\": \"db.internal\",\n  \"port\": 5432,\n  \"ssl\": true\n}","message":"Update DB host for production"}')
echo "${EDIT_FILE_RES}" | grep -q '"commit_sha":' || assert_fail "Online file edit failed: ${EDIT_FILE_RES}"
assert_pass "Online edit committed"

log_test "Verify updated content via Raw API"
RAW_EDIT_RES=$(curl -s "${PROGIT_URL}/api/v1/repos/${DEV_USER}/${PUBLIC_REPO}/raw?ref=main&path=src/config/database.json")
echo "${RAW_EDIT_RES}" | grep -q '"db.internal"' || assert_fail "Raw content not updated: ${RAW_EDIT_RES}"
assert_pass "Online edit reflected in Git"

log_test "Multi-File and Directory Upload via Multipart Form"
echo "<svg viewBox='0 0 100 100'></svg>" > "${TEST_DIR}/logo.svg"
echo "User-agent: *\nDisallow: /admin" > "${TEST_DIR}/robots.txt"
UPLOAD_RES=$(curl -s -b "${TEST_DIR}/dev_cookies.txt" -X POST "${PROGIT_URL}/api/v1/repos/${DEV_USER}/${PUBLIC_REPO}/upload" \
  -F "branch=main" \
  -F "message=Upload branding and public assets" \
  -F "files=@${TEST_DIR}/logo.svg;filename=logo.svg" \
  -F "files=@${TEST_DIR}/robots.txt;filename=robots.txt" \
  -F 'relative_paths=["assets/images/logo.svg","public/robots.txt"]')
echo "${UPLOAD_RES}" | grep -q '"num_files":2' || assert_fail "Upload failed: ${UPLOAD_RES}"
assert_pass "2 files with directory structure uploaded"

log_test "Verify uploaded directory tree (assets/images/logo.svg)"
LOGO_BLOB=$(curl -s "${PROGIT_URL}/api/v1/repos/${DEV_USER}/${PUBLIC_REPO}/raw?ref=main&path=assets/images/logo.svg")
echo "${LOGO_BLOB}" | grep -q "viewBox" || assert_fail "Uploaded file not found in tree: ${LOGO_BLOB}"
assert_pass "Uploaded directory tree verified"

log_test "Online File Deletion (Delete src/config/database.json)"
DELETE_FILE_RES=$(curl -s -b "${TEST_DIR}/dev_cookies.txt" -X DELETE "${PROGIT_URL}/api/v1/repos/${DEV_USER}/${PUBLIC_REPO}/contents/src/config/database.json" \
  -H "Content-Type: application/json" \
  -d '{"branch":"main","message":"Remove obsolete DB config"}')
echo "${DELETE_FILE_RES}" | grep -q '"commit_sha":' || assert_fail "Delete failed: ${DELETE_FILE_RES}"
assert_pass "File deleted with online commit"

log_test "Verify deleted file is gone from remote tree"
DELETED_BLOB=$(curl -s -w "%{http_code}" -o /dev/null "${PROGIT_URL}/api/v1/repos/${DEV_USER}/${PUBLIC_REPO}/raw?ref=main&path=src/config/database.json")
[ "${DELETED_BLOB}" = "404" ] || [ "${DELETED_BLOB}" = "500" ] || assert_fail "Expected 404 for deleted file, got ${DELETED_BLOB}"
assert_pass "File removal confirmed"

# -----------------------------------------------------------------------------
# SUITE 5C: Security & Access Control Enforcement
# -----------------------------------------------------------------------------
echo -e "\n${BLUE}=== [5C/10] SECURITY & ACCESS CONTROL ENFORCEMENT ===${NC}"

log_test "Enforce Authentication: Unauthenticated file edit blocked (HTTP 401)"
UNAUTH_EDIT_CODE=$(curl -s -w "%{http_code}" -o /dev/null -X POST "${PROGIT_URL}/api/v1/repos/${DEV_USER}/${PUBLIC_REPO}/contents/hack.txt" \
  -H "Content-Type: application/json" \
  -d '{"branch":"main","content":"evil","message":"unauth commit"}')
[ "${UNAUTH_EDIT_CODE}" = "401" ] || assert_fail "Expected 401 unauthenticated, got ${UNAUTH_EDIT_CODE}"
assert_pass "Unauthenticated write blocked"

log_test "Enforce Authentication: Unauthenticated file upload blocked (HTTP 401)"
UNAUTH_UPLOAD_CODE=$(curl -s -w "%{http_code}" -o /dev/null -X POST "${PROGIT_URL}/api/v1/repos/${DEV_USER}/${PUBLIC_REPO}/upload" \
  -F "branch=main" \
  -F "message=evil upload" \
  -F "files=@${TEST_DIR}/logo.svg;filename=evil.svg")
[ "${UNAUTH_UPLOAD_CODE}" = "401" ] || assert_fail "Expected 401 unauthenticated, got ${UNAUTH_UPLOAD_CODE}"
assert_pass "Unauthenticated upload blocked"

log_test "Enforce Authorization: Stranger denied file write access (HTTP 403)"
STRANGER_WRITE_CODE=$(curl -s -b "${TEST_DIR}/stranger_cookies.txt" -w "%{http_code}" -o /dev/null -X POST "${PROGIT_URL}/api/v1/repos/${DEV_USER}/${PUBLIC_REPO}/contents/unauthorized.txt" \
  -H "Content-Type: application/json" \
  -d '{"branch":"main","content":"stranger hack","message":"unauthorized commit"}')
[ "${STRANGER_WRITE_CODE}" = "403" ] || assert_fail "Expected 403 forbidden for stranger, got ${STRANGER_WRITE_CODE}"
assert_pass "Stranger write blocked (403)"

log_test "Enforce Authorization: Stranger denied upload access (HTTP 403)"
STRANGER_UPLOAD_CODE=$(curl -s -b "${TEST_DIR}/stranger_cookies.txt" -w "%{http_code}" -o /dev/null -X POST "${PROGIT_URL}/api/v1/repos/${DEV_USER}/${PUBLIC_REPO}/upload" \
  -F "branch=main" \
  -F "message=stranger upload" \
  -F "files=@${TEST_DIR}/logo.svg;filename=stranger.svg")
[ "${STRANGER_UPLOAD_CODE}" = "403" ] || assert_fail "Expected 403 forbidden for stranger upload, got ${STRANGER_UPLOAD_CODE}"
assert_pass "Stranger upload blocked (403)"

log_test "Grant Collaborator write permissions via Repo Owner"
ADD_COLLAB_RES=$(curl -s -b "${TEST_DIR}/dev_cookies.txt" -X PUT "${PROGIT_URL}/api/v1/repos/${DEV_USER}/${PUBLIC_REPO}/collaborators/${STRANGER_USER}" \
  -H "Content-Type: application/json" \
  -d '{"mode":"write"}')
echo "${ADD_COLLAB_RES}" | grep -q '"message":"Collaborator updated successfully"' || assert_fail "Failed to add collaborator: ${ADD_COLLAB_RES}"
assert_pass "Collaborator granted write access"

log_test "Verify Collaborator permission reflected in Repo metadata"
COLLAB_REPO_META=$(curl -s -b "${TEST_DIR}/stranger_cookies.txt" "${PROGIT_URL}/api/v1/repos/${DEV_USER}/${PUBLIC_REPO}")
echo "${COLLAB_REPO_META}" | grep -q '"can_write":true' || assert_fail "Collaborator does not have can_write:true"
assert_pass "can_write is true for collaborator"

log_test "Verify Collaborator can now perform online file commit"
COLLAB_COMMIT_RES=$(curl -s -b "${TEST_DIR}/stranger_cookies.txt" -X POST "${PROGIT_URL}/api/v1/repos/${DEV_USER}/${PUBLIC_REPO}/contents/src/collab.txt" \
  -H "Content-Type: application/json" \
  -d '{"branch":"main","content":"Collaborator contribution","message":"Collaborator commit"}')
echo "${COLLAB_COMMIT_RES}" | grep -q '"commit_sha":' || assert_fail "Collaborator failed to commit file: ${COLLAB_COMMIT_RES}"
assert_pass "Collaborator committed successfully"

log_test "Revoke Collaborator permissions via Repo Owner"
REVOKE_RES=$(curl -s -b "${TEST_DIR}/dev_cookies.txt" -X DELETE "${PROGIT_URL}/api/v1/repos/${DEV_USER}/${PUBLIC_REPO}/collaborators/${STRANGER_USER}")
echo "${REVOKE_RES}" | grep -q '"message":"Collaborator removed successfully"' || assert_fail "Failed to remove collaborator: ${REVOKE_RES}"
assert_pass "Collaborator access revoked"

log_test "Verify Revoked Collaborator is blocked again (HTTP 403)"
POST_REVOKE_CODE=$(curl -s -b "${TEST_DIR}/stranger_cookies.txt" -w "%{http_code}" -o /dev/null -X POST "${PROGIT_URL}/api/v1/repos/${DEV_USER}/${PUBLIC_REPO}/contents/after_revoke.txt" \
  -H "Content-Type: application/json" \
  -d '{"branch":"main","content":"revoked","message":"revoked commit"}')
[ "${POST_REVOKE_CODE}" = "403" ] || assert_fail "Expected 403 after revocation, got ${POST_REVOKE_CODE}"
assert_pass "Access revoked and blocked (403)"

# -----------------------------------------------------------------------------
# SUITE 6: Issues, Pull Requests & Real Git Merge
# -----------------------------------------------------------------------------
echo -e "\n${BLUE}=== [6/10] ISSUES, PULL REQUESTS & NATIVE GIT MERGES ===${NC}"

log_test "Create Issue with Markdown description"
ISSUE_RES=$(curl -s -b "${TEST_DIR}/dev_cookies.txt" -X POST "${PROGIT_URL}/api/v1/repos/${DEV_USER}/${PUBLIC_REPO}/issues" \
  -H "Content-Type: application/json" \
  -d '{"title":"Implement payment gateway","content":"## Requirements\n- Stripe API integration\n- Webhook listeners"}')
echo "${ISSUE_RES}" | grep -q '"index_number":1' || assert_fail "Failed to create issue: ${ISSUE_RES}"
assert_pass "Issue #1 created"

log_test "Add Threaded Comments to Issue"
COMMENT_RES=$(curl -s -b "${TEST_DIR}/admin_cookies.txt" -X POST "${PROGIT_URL}/api/v1/repos/${DEV_USER}/${PUBLIC_REPO}/issues/1/comments" \
  -H "Content-Type: application/json" \
  -d '{"content":"I will review the Stripe documentation."}')
echo "${COMMENT_RES}" | grep -q '"content":"I will review the Stripe documentation."' || assert_fail "Failed to add comment"
assert_pass "Comment posted"

log_test "Create Feature Branch and Push Changes"
cd "${TEST_DIR}/http_clone"
git checkout -b "feature-payment" >/dev/null 2>&1
echo "const stripe = require('stripe');" >> app.js
git add app.js
git commit -m "Integrate stripe client" >/dev/null
git push origin "feature-payment" >/dev/null 2>&1 || assert_fail "Push feature branch failed"
assert_pass "Feature branch pushed"

log_test "Compare Branches via API (/compare)"
COMPARE_RES=$(curl -s "${PROGIT_URL}/api/v1/repos/${DEV_USER}/${PUBLIC_REPO}/compare?base=main&head=feature-payment")
echo "${COMPARE_RES}" | grep -q '"commits":' || assert_fail "Branch comparison failed"
assert_pass "Branches compared"

log_test "Open Pull Request (feature-payment -> main)"
PR_RES=$(curl -s -b "${TEST_DIR}/dev_cookies.txt" -X POST "${PROGIT_URL}/api/v1/repos/${DEV_USER}/${PUBLIC_REPO}/pulls" \
  -H "Content-Type: application/json" \
  -d '{"title":"Feature: Stripe Integration","content":"Connects to Stripe payment gateway","head_branch":"feature-payment","base_branch":"main"}')
echo "${PR_RES}" | grep -q '"head_branch":"feature-payment"' || assert_fail "Failed to open PR: ${PR_RES}"
PR_INDEX=$(echo "${PR_RES}" | sed -n 's/.*"index_number":\([0-9]*\).*/\1/p' | head -n 1)
assert_pass "PR #${PR_INDEX} opened"

log_test "Inspect Pull Request Diff"
PR_DIFF=$(curl -s "${PROGIT_URL}/api/v1/repos/${DEV_USER}/${PUBLIC_REPO}/pulls/${PR_INDEX}/diff")
echo "${PR_DIFF}" | grep -q "const stripe = require" || assert_fail "PR diff missing modified line"
assert_pass "PR diff accurate"

log_test "Submit Pull Request Review (State: APPROVED)"
REVIEW_RES=$(curl -s -b "${TEST_DIR}/admin_cookies.txt" -X POST "${PROGIT_URL}/api/v1/repos/${DEV_USER}/${PUBLIC_REPO}/pulls/${PR_INDEX}/reviews" \
  -H "Content-Type: application/json" \
  -d '{"state":"APPROVED","content":"Looks great! Verified stripe dependency and integration."}')
echo "${REVIEW_RES}" | grep -q '"state":"APPROVED"' || assert_fail "Failed to submit review: ${REVIEW_RES}"
REVIEW_ID=$(echo "${REVIEW_RES}" | python3 -c "import sys, json; print(json.load(sys.stdin)['id'])")
assert_pass "Review submitted (id: ${REVIEW_ID})"

log_test "Submit Line-by-Line Inline Review Comment"
INLINE_RES=$(curl -s -b "${TEST_DIR}/admin_cookies.txt" -X POST "${PROGIT_URL}/api/v1/repos/${DEV_USER}/${PUBLIC_REPO}/pulls/${PR_INDEX}/reviews/comments" \
  -H "Content-Type: application/json" \
  -d "{\"review_id\":${REVIEW_ID},\"file_path\":\"app.js\",\"line_number\":1,\"content\":\"Ensure stripe secret key is loaded from ENV.\"}")
echo "${INLINE_RES}" | grep -q "Ensure stripe secret key" || assert_fail "Failed to submit inline comment: ${INLINE_RES}"
assert_pass "Inline line comment recorded"

log_test "List Pull Request Reviews and Verify Approval"
LIST_REVIEWS=$(curl -s "${PROGIT_URL}/api/v1/repos/${DEV_USER}/${PUBLIC_REPO}/pulls/${PR_INDEX}/reviews")
echo "${LIST_REVIEWS}" | grep -q '"state":"APPROVED"' || assert_fail "Review list missing approval: ${LIST_REVIEWS}"
assert_pass "Reviews verified on pull request"

log_test "List Pull Request Review Comments"
LIST_REV_COMMENTS=$(curl -s "${PROGIT_URL}/api/v1/repos/${DEV_USER}/${PUBLIC_REPO}/pulls/${PR_INDEX}/reviews/comments")
echo "${LIST_REV_COMMENTS}" | grep -q "Ensure stripe secret key" || assert_fail "Review comments list missing comment: ${LIST_REV_COMMENTS}"
assert_pass "Review comments verified on pull request"

log_test "Execute Native Git Merge on Pull Request"
MERGE_RES=$(curl -s -b "${TEST_DIR}/admin_cookies.txt" -X POST "${PROGIT_URL}/api/v1/repos/${DEV_USER}/${PUBLIC_REPO}/pulls/${PR_INDEX}/merge" \
  -H "Content-Type: application/json" \
  -d '{"merge_style":"merge"}')
echo "${MERGE_RES}" | grep -q '"merge_commit_sha"' || assert_fail "Git merge failed: ${MERGE_RES}"
assert_pass "PR merged successfully"

log_test "Verify Merged Commit on Main Branch"
cd "${TEST_DIR}"
git clone "${HTTP_CLONE_URL}" "verify_merge_clone" >/dev/null 2>&1
grep -q "const stripe = require" "verify_merge_clone/app.js" || assert_fail "Merged code not present on remote main branch"
assert_pass "Merge verified on remote"

log_test "Fork Repository (admin forks dev_user's repo)"
FORK_RES=$(curl -s -b "${TEST_DIR}/admin_cookies.txt" -X POST "${PROGIT_URL}/api/v1/repos/${DEV_USER}/${PUBLIC_REPO}/forks" \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"${PUBLIC_REPO}-fork\"}")
echo "${FORK_RES}" | grep -q '"is_fork":true' || assert_fail "Fork failed: ${FORK_RES}"
assert_pass "Repository forked into admin account"

log_test "Verify Fork Metadata and Parent Relationship"
FORK_DETAIL=$(curl -s "${PROGIT_URL}/api/v1/repos/${ADMIN_USER}/${PUBLIC_REPO}-fork")
echo "${FORK_DETAIL}" | grep -q '"is_fork":true' || assert_fail "Fork metadata missing is_fork: ${FORK_DETAIL}"
echo "${FORK_DETAIL}" | grep -q "\"owner_name\":\"${DEV_USER}\"" || assert_fail "Fork parent owner missing: ${FORK_DETAIL}"
assert_pass "Fork parent relationship verified"

log_test "List Forks on Original Repository"
FORKS_LIST=$(curl -s "${PROGIT_URL}/api/v1/repos/${DEV_USER}/${PUBLIC_REPO}/forks")
echo "${FORKS_LIST}" | grep -q "${ADMIN_USER}" || assert_fail "Forks list does not contain admin fork: ${FORKS_LIST}"
assert_pass "Fork appears in original repo forks list"

log_test "Clone Forked Repository via Git HTTP"
cd "${TEST_DIR}"
FORK_CLONE_URL="http://${ADMIN_USER}:${ADMIN_PASS}@${PROGIT_URL#http*://}/${ADMIN_USER}/${PUBLIC_REPO}-fork.git"
git clone "${FORK_CLONE_URL}" "fork_clone" >/dev/null 2>&1 || assert_fail "Clone forked repository failed"
test -f "fork_clone/app.js" || assert_fail "Forked clone missing app.js"
grep -q "const stripe = require" "fork_clone/app.js" || assert_fail "Fork missing merged commit content"
assert_pass "Forked repository cloned and all data intact"

# -----------------------------------------------------------------------------
# SUITE 7: Git-Backed Wiki Engine
# -----------------------------------------------------------------------------
echo -e "\n${BLUE}=== [7/10] GIT-BACKED WIKI ENGINE ===${NC}"

log_test "Auto-provision Wiki repository and list pages"
WIKI_LIST=$(curl -s "${PROGIT_URL}/api/v1/repos/${DEV_USER}/${PUBLIC_REPO}/wiki/pages")
echo "${WIKI_LIST}" | grep -q '"slug":"Home"' || assert_fail "Default Home page not initialized. Response was: ${WIKI_LIST}"
assert_pass "Home page present"

log_test "Create and Save custom Wiki Page (Architecture)"
WIKI_SAVE=$(curl -s -b "${TEST_DIR}/dev_cookies.txt" -X POST "${PROGIT_URL}/api/v1/repos/${DEV_USER}/${PUBLIC_REPO}/wiki/pages" \
  -H "Content-Type: application/json" \
  -d '{"slug":"Architecture","title":"System Architecture","content":"# System Architecture\n\nModular Go micro-architecture.","message":"Add architecture guide"}')
echo "${WIKI_SAVE}" | grep -q '"slug":"Architecture"' || assert_fail "Failed to save wiki page: ${WIKI_SAVE}"
assert_pass "Wiki page saved"

log_test "Inspect Wiki Page Revision History"
WIKI_HIST=$(curl -s "${PROGIT_URL}/api/v1/repos/${DEV_USER}/${PUBLIC_REPO}/wiki/pages/Architecture/history")
echo "${WIKI_HIST}" | grep -q '"message":"Add architecture guide"' || assert_fail "Wiki history missing commit"
assert_pass "History verified"

log_test "Git CLI clone of Wiki bare repository (<repo>.wiki.git)"
WIKI_CLONE_URL="http://${DEV_USER}:${DEV_PASS}@localhost:3000/${DEV_USER}/${PUBLIC_REPO}.wiki.git"
cd "${TEST_DIR}"
git clone "${WIKI_CLONE_URL}" "wiki_git_clone" >/dev/null 2>&1 || assert_fail "Wiki Git clone failed"
test -f "wiki_git_clone/Architecture.md" || assert_fail "Architecture.md missing in cloned wiki"
assert_pass "Wiki cloned via Git CLI"

log_test "Push new Wiki page via Git CLI"
cd "${TEST_DIR}/wiki_git_clone"
echo "# Deployment Guide" > Deployment.md
git config user.name "Test Developer"
git config user.email "${DEV_EMAIL}"
git add Deployment.md
git commit -m "Add deployment guide via CLI" >/dev/null
git push origin main >/dev/null 2>&1 || assert_fail "Git push to wiki failed"
assert_pass "Pushed to wiki via CLI"

log_test "Verify CLI-pushed wiki page in REST API"
WIKI_GET_DEPLOY=$(curl -s "${PROGIT_URL}/api/v1/repos/${DEV_USER}/${PUBLIC_REPO}/wiki/pages/Deployment")
echo "${WIKI_GET_DEPLOY}" | grep -q "Deployment Guide" || assert_fail "CLI-pushed page not reflected in API"
assert_pass "CLI push reflected in Web/API"

# -----------------------------------------------------------------------------
# SUITE 8: ProGit Pages (GitHub Pages Hosting) & Administration
# -----------------------------------------------------------------------------
echo -e "\n${BLUE}=== [8/10] PROGIT PAGES HOSTING & ADMINISTRATION ===${NC}"

log_test "Configure and Enable ProGit Pages on main branch"
PAGES_CONF=$(curl -s -b "${TEST_DIR}/dev_cookies.txt" -X POST "${PROGIT_URL}/api/v1/repos/${DEV_USER}/${PUBLIC_REPO}/pages" \
  -H "Content-Type: application/json" \
  -d '{"enable_pages":true,"pages_branch":"main","pages_folder":"/"}')
echo "${PAGES_CONF}" | grep -q '"pages_url":' || assert_fail "Failed to enable pages: ${PAGES_CONF}"
assert_pass "ProGit Pages enabled"

log_test "Serve ProGit Pages with Markdown fallback (README.md)"
PAGES_RES=$(curl -s -f "${PROGIT_URL}/pages/${DEV_USER}/${PUBLIC_REPO}/")
echo "${PAGES_RES}" | grep -q "${PUBLIC_REPO}" || assert_fail "Pages output missing repository name"
echo "${PAGES_RES}" | grep -q "ProGit Pages" || assert_fail "Pages output missing styled wrapper"
assert_pass "Markdown rendered as styled HTML"

log_test "Push custom index.html and style.css to repository"
cd "${TEST_DIR}/http_clone"
git checkout main >/dev/null 2>&1
git pull origin main >/dev/null 2>&1
echo '<!DOCTYPE html><html><head><title>ProGit Hosted Site</title><link rel="stylesheet" href="style.css"></head><body><h1>Welcome to ProGit Pages</h1></body></html>' > index.html
echo 'body { background-color: #f0fdf4; color: #166534; font-family: sans-serif; }' > style.css
git add index.html style.css
git commit -m "Add static pages website" >/dev/null
git push origin main >/dev/null 2>&1 || assert_fail "Git push of pages site failed"
assert_pass "Custom static site committed"

log_test "Verify custom index.html served at /pages/:owner/:repo/"
INDEX_SERVE=$(curl -s -f "${PROGIT_URL}/pages/${DEV_USER}/${PUBLIC_REPO}/")
echo "${INDEX_SERVE}" | grep -q "Welcome to ProGit Pages" || assert_fail "Custom index.html not served"
assert_pass "index.html served accurately"

log_test "Verify static CSS asset served with text/css Content-Type"
CSS_HEADERS=$(curl -s -I "${PROGIT_URL}/pages/${DEV_USER}/${PUBLIC_REPO}/style.css")
echo "${CSS_HEADERS}" | grep -iq "content-type: text/css" || assert_fail "CSS Content-Type mismatch: ${CSS_HEADERS}"
assert_pass "CSS mime-type verified"

log_test "Verify Super Admin Telemetry API (/api/v1/admin/stats)"
ADMIN_STATS=$(curl -s -b "${TEST_DIR}/admin_cookies.txt" "${PROGIT_URL}/api/v1/admin/stats")
echo "${ADMIN_STATS}" | grep -q '"users_count":' || assert_fail "Admin stats missing users_count"
echo "${ADMIN_STATS}" | grep -q '"memory_alloc_mb":' || assert_fail "Admin stats missing memory telemetry"
echo "${ADMIN_STATS}" | grep -q '"is_https":' || assert_fail "Admin stats missing is_https"
echo "${ADMIN_STATS}" | grep -q '"https_port":' || assert_fail "Admin stats missing https_port"
assert_pass "System telemetry operational"

log_test "Trigger Database Maintenance (SQLite WAL Checkpoint)"
MAINT_RES=$(curl -s -b "${TEST_DIR}/admin_cookies.txt" -X POST "${PROGIT_URL}/api/v1/admin/maintenance" \
  -H "Content-Type: application/json" \
  -d '{"operation":"checkpoint_wal"}')
echo "${MAINT_RES}" | grep -q '"message":' || assert_fail "Maintenance operation failed: ${MAINT_RES}"
assert_pass "WAL checkpoint executed"

# -----------------------------------------------------------------------------
# SUITE 9: Organizations, Teams & Enterprise Access
# -----------------------------------------------------------------------------
echo -e "\n${BLUE}=== [9/10] ORGANIZATIONS, TEAMS & ENTERPRISE COLLABORATION ===${NC}"

ORG_NAME="org-${TIMESTAMP}"

log_test "Create Organization (POST /api/v1/orgs)"
ORG_RES=$(curl -s -b "${TEST_DIR}/dev_cookies.txt" -X POST "${PROGIT_URL}/api/v1/orgs" \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"${ORG_NAME}\",\"full_name\":\"Enterprise QA Org\",\"description\":\"Team organization for QA automation\"}")
echo "${ORG_RES}" | grep -q "\"name\":\"${ORG_NAME}\"" || assert_fail "Failed to create organization: ${ORG_RES}"
assert_pass "Organization created"

log_test "Inspect Organization profile and metadata"
ORG_META=$(curl -s -b "${TEST_DIR}/dev_cookies.txt" "${PROGIT_URL}/api/v1/orgs/${ORG_NAME}")
echo "${ORG_META}" | grep -q "\"full_name\":\"Enterprise QA Org\"" || assert_fail "Org metadata mismatch: ${ORG_META}"
echo "${ORG_META}" | grep -q '"is_admin":true' || assert_fail "Org creator should be org admin"
assert_pass "Organization metadata verified"

log_test "Add Stranger as Member to Organization"
ADD_MEMBER_RES=$(curl -s -b "${TEST_DIR}/dev_cookies.txt" -X POST "${PROGIT_URL}/api/v1/orgs/${ORG_NAME}/members" \
  -H "Content-Type: application/json" \
  -d "{\"username\":\"${STRANGER_USER}\",\"role\":\"member\"}")
echo "${ADD_MEMBER_RES}" | grep -q "Member added to organization successfully" || assert_fail "Failed to add org member: ${ADD_MEMBER_RES}"
assert_pass "Organization member added"

log_test "List Organization Members"
ORG_MEMBERS=$(curl -s -b "${TEST_DIR}/dev_cookies.txt" "${PROGIT_URL}/api/v1/orgs/${ORG_NAME}/members")
echo "${ORG_MEMBERS}" | grep -q "\"username\":\"${STRANGER_USER}\"" || assert_fail "Stranger missing from org members: ${ORG_MEMBERS}"
assert_pass "Organization members enumerated"

log_test "Create Organization Team (Developers)"
CREATE_TEAM_RES=$(curl -s -b "${TEST_DIR}/dev_cookies.txt" -X POST "${PROGIT_URL}/api/v1/orgs/${ORG_NAME}/teams" \
  -H "Content-Type: application/json" \
  -d '{"name":"Developers","description":"Core development team","permission":"write"}')
echo "${CREATE_TEAM_RES}" | grep -q '"name":"Developers"' || assert_fail "Failed to create team: ${CREATE_TEAM_RES}"
assert_pass "Organization team created"

log_test "Create Organization-owned Repository"
ORG_REPO_NAME="service-backend"
ORG_REPO_RES=$(curl -s -b "${TEST_DIR}/dev_cookies.txt" -X POST "${PROGIT_URL}/api/v1/repos" \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"${ORG_REPO_NAME}\",\"owner\":\"${ORG_NAME}\",\"description\":\"Backend microservice\",\"private\":false,\"auto_init\":true}")
echo "${ORG_REPO_RES}" | grep -q "\"name\":\"${ORG_REPO_NAME}\"" || assert_fail "Failed to create org repository: ${ORG_REPO_RES}"
echo "${ORG_REPO_RES}" | grep -q "\"owner_name\":\"${ORG_NAME}\"" || assert_fail "Org repo owner mismatch: ${ORG_REPO_RES}"
assert_pass "Organization repository created"

log_test "List Repositories owned by Organization"
ORG_REPOS_LIST=$(curl -s "${PROGIT_URL}/api/v1/orgs/${ORG_NAME}/repos")
echo "${ORG_REPOS_LIST}" | grep -q "\"name\":\"${ORG_REPO_NAME}\"" || assert_fail "Org repo not in org repos list: ${ORG_REPOS_LIST}"
assert_pass "Org repository enumerated"

# -----------------------------------------------------------------------------
# SUITE 10: Projects & Kanban Boards
# -----------------------------------------------------------------------------
echo -e "\n${BLUE}=== [10/10] PROJECTS & KANBAN BOARDS ===${NC}"

log_test "Create Repository Project Board"
PROJ_CREATE_RES=$(curl -s -b "${TEST_DIR}/dev_cookies.txt" -X POST "${PROGIT_URL}/api/v1/repos/${DEV_USER}/${PUBLIC_REPO}/projects" \
  -H "Content-Type: application/json" \
  -d '{"title":"Q1 Release Planning","description":"Tracking core deliverables for release"}')
echo "${PROJ_CREATE_RES}" | grep -q '"title":"Q1 Release Planning"' || assert_fail "Failed to create project: ${PROJ_CREATE_RES}"
PROJECT_ID=$(echo "${PROJ_CREATE_RES}" | python3 -c "import sys, json; print(json.load(sys.stdin)['id'])")
assert_pass "Project board created (id: ${PROJECT_ID})"

log_test "Verify default Kanban Columns (To do, In progress, Done)"
PROJ_BOARD_RES=$(curl -s "${PROGIT_URL}/api/v1/repos/${DEV_USER}/${PUBLIC_REPO}/projects/${PROJECT_ID}")
echo "${PROJ_BOARD_RES}" | grep -q '"title":"To do"' || assert_fail "Missing 'To do' column: ${PROJ_BOARD_RES}"
echo "${PROJ_BOARD_RES}" | grep -q '"title":"In progress"' || assert_fail "Missing 'In progress' column: ${PROJ_BOARD_RES}"
echo "${PROJ_BOARD_RES}" | grep -q '"title":"Done"' || assert_fail "Missing 'Done' column: ${PROJ_BOARD_RES}"
TODO_COL_ID=$(echo "${PROJ_BOARD_RES}" | python3 -c "import sys, json; print(next(c['id'] for c in json.load(sys.stdin)['columns'] if c['title'] == 'To do'))")
DONE_COL_ID=$(echo "${PROJ_BOARD_RES}" | python3 -c "import sys, json; print(next(c['id'] for c in json.load(sys.stdin)['columns'] if c['title'] == 'Done'))")
assert_pass "Default columns verified"

log_test "Add Custom Column to Project (In Review)"
ADD_COL_RES=$(curl -s -b "${TEST_DIR}/dev_cookies.txt" -X POST "${PROGIT_URL}/api/v1/repos/${DEV_USER}/${PUBLIC_REPO}/projects/${PROJECT_ID}/columns" \
  -H "Content-Type: application/json" \
  -d '{"title":"In Review"}')
echo "${ADD_COL_RES}" | grep -q '"title":"In Review"' || assert_fail "Failed to add column: ${ADD_COL_RES}"
assert_pass "Custom column added"

log_test "Create Task Card in To Do Column"
ADD_CARD_RES=$(curl -s -b "${TEST_DIR}/dev_cookies.txt" -X POST "${PROGIT_URL}/api/v1/repos/${DEV_USER}/${PUBLIC_REPO}/projects/${PROJECT_ID}/cards" \
  -H "Content-Type: application/json" \
  -d "{\"column_id\":${TODO_COL_ID},\"content\":\"Implement OAuth2 Provider support\"}")
echo "${ADD_CARD_RES}" | grep -q "OAuth2 Provider" || assert_fail "Failed to create card: ${ADD_CARD_RES}"
CARD_ID=$(echo "${ADD_CARD_RES}" | python3 -c "import sys, json; print(json.load(sys.stdin)['id'])")
assert_pass "Task card created (id: ${CARD_ID})"

log_test "Move Card from 'To do' to 'Done'"
MOVE_CARD_RES=$(curl -s -b "${TEST_DIR}/dev_cookies.txt" -X PUT "${PROGIT_URL}/api/v1/repos/${DEV_USER}/${PUBLIC_REPO}/projects/${PROJECT_ID}/cards/${CARD_ID}" \
  -H "Content-Type: application/json" \
  -d "{\"column_id\":${DONE_COL_ID},\"order_num\":0}")
echo "${MOVE_CARD_RES}" | grep -q '"message":"Card moved successfully"' || assert_fail "Failed to move card: ${MOVE_CARD_RES}"
assert_pass "Card moved to Done"

log_test "Verify Project Progress Metrics (total_cards=1, done_cards=1)"
PROJ_UPDATED=$(curl -s "${PROGIT_URL}/api/v1/repos/${DEV_USER}/${PUBLIC_REPO}/projects/${PROJECT_ID}")
echo "${PROJ_UPDATED}" | grep -q '"total_cards":1' || assert_fail "total_cards metric incorrect: ${PROJ_UPDATED}"
echo "${PROJ_UPDATED}" | grep -q '"done_cards":1' || assert_fail "done_cards metric incorrect: ${PROJ_UPDATED}"
assert_pass "Progress metrics 100% accurate"

# -----------------------------------------------------------------------------
# 11. 10 DEVELOPERS, ISSUE ASSIGNMENT & DIRECT MESSAGING SYSTEM
# -----------------------------------------------------------------------------
echo -e "\n${BLUE}=== [11/11] 10 DEVELOPERS, ISSUE ASSIGNMENT & MESSAGING SYSTEM ===${NC}"

log_test "Provision 10 Developers (dev_alice to dev_julia)"
DEV_NAMES=("dev_alice" "dev_bob" "dev_charlie" "dev_diana" "dev_evan" "dev_fiona" "dev_george" "dev_hannah" "dev_ian" "dev_julia")
for dname in "${DEV_NAMES[@]}"; do
  curl -s -X POST "${PROGIT_URL}/api/v1/auth/register" \
    -H "Content-Type: application/json" \
    -d "{\"username\":\"${dname}\",\"email\":\"${dname}@progit.local\",\"password\":\"DevSecret123!\",\"full_name\":\"Developer ${dname}\"}" > /dev/null || true
done
assert_pass "10 developer accounts provisioned"

log_test "List Active Developers via /api/v1/developers"
DEV_LIST_RES=$(curl -s "${PROGIT_URL}/api/v1/developers")
echo "${DEV_LIST_RES}" | grep -q "dev_alice" || assert_fail "dev_alice missing from developers list"
echo "${DEV_LIST_RES}" | grep -q "dev_julia" || assert_fail "dev_julia missing from developers list"
assert_pass "Developers list verified"

log_test "Security Check: Block assigning non-collaborator (dev_alice)"
BLOCKED_ASSIGN_RES=$(curl -s -b "${TEST_DIR}/dev_cookies.txt" -X PUT "${PROGIT_URL}/api/v1/repos/${DEV_USER}/${PUBLIC_REPO}/issues/1/assignee" \
  -H "Content-Type: application/json" \
  -d '{"assignee":"dev_alice"}')
echo "${BLOCKED_ASSIGN_RES}" | grep -q "collaborator or owner" || assert_fail "Security vulnerability: non-collaborator was not blocked: ${BLOCKED_ASSIGN_RES}"
assert_pass "Non-collaborator assignment rejected (HTTP 400)"

log_test "Add dev_alice as Repository Collaborator"
ADD_COLLAB_RES=$(curl -s -b "${TEST_DIR}/dev_cookies.txt" -X PUT "${PROGIT_URL}/api/v1/repos/${DEV_USER}/${PUBLIC_REPO}/collaborators/dev_alice" \
  -H "Content-Type: application/json" \
  -d '{"mode":"write"}')
assert_pass "dev_alice added as collaborator"

log_test "Verify GET /assignees only returns repo collaborators & owner"
REPO_ASSIGNEES_RES=$(curl -s -b "${TEST_DIR}/dev_cookies.txt" "${PROGIT_URL}/api/v1/repos/${DEV_USER}/${PUBLIC_REPO}/assignees")
echo "${REPO_ASSIGNEES_RES}" | grep -q "dev_alice" || assert_fail "dev_alice missing from assignees: ${REPO_ASSIGNEES_RES}"
echo "${REPO_ASSIGNEES_RES}" | grep -q "${DEV_USER}" || assert_fail "${DEV_USER} missing from assignees: ${REPO_ASSIGNEES_RES}"
# Verify stranger users (e.g. dev_fiona who is not a collaborator) are NOT in the assignees list
echo "${REPO_ASSIGNEES_RES}" | grep -q "dev_fiona" && assert_fail "Security vulnerability: non-collaborator dev_fiona leaked in assignees: ${REPO_ASSIGNEES_RES}"
assert_pass "Only repository collaborators and owner are returned in assignees"

log_test "Assign Issue #1 to dev_alice (PUT /issues/1/assignee)"
ASSIGN_RES=$(curl -s -b "${TEST_DIR}/dev_cookies.txt" -X PUT "${PROGIT_URL}/api/v1/repos/${DEV_USER}/${PUBLIC_REPO}/issues/1/assignee" \
  -H "Content-Type: application/json" \
  -d '{"assignee":"dev_alice"}')
echo "${ASSIGN_RES}" | grep -q '"assignee_name":"dev_alice"' || assert_fail "Issue assignment failed: ${ASSIGN_RES}"
assert_pass "Issue #1 assigned to dev_alice"

log_test "Filter Issues by Assignee (GET /issues?assignee=dev_alice)"
FILTER_RES=$(curl -s "${PROGIT_URL}/api/v1/repos/${DEV_USER}/${PUBLIC_REPO}/issues?assignee=dev_alice")
echo "${FILTER_RES}" | grep -q '"assignee_name":"dev_alice"' || assert_fail "Assignee filter failed: ${FILTER_RES}"
assert_pass "Filtered issues matching assignee dev_alice"

log_test "Rename Kanban Column (PUT /columns/:id)"
RENAME_COL_RES=$(curl -s -b "${TEST_DIR}/dev_cookies.txt" -X PUT "${PROGIT_URL}/api/v1/repos/${DEV_USER}/${PUBLIC_REPO}/projects/${PROJECT_ID}/columns/${TODO_COL_ID}" \
  -H "Content-Type: application/json" \
  -d '{"title":"Backlog"}')
echo "${RENAME_COL_RES}" | grep -q "successfully" || assert_fail "Failed to rename column: ${RENAME_COL_RES}"
assert_pass "Kanban column renamed"

log_test "Edit Kanban Card Content (PUT /cards/:id with content)"
EDIT_CARD_RES=$(curl -s -b "${TEST_DIR}/dev_cookies.txt" -X PUT "${PROGIT_URL}/api/v1/repos/${DEV_USER}/${PUBLIC_REPO}/projects/${PROJECT_ID}/cards/${CARD_ID}" \
  -H "Content-Type: application/json" \
  -d '{"content":"Refactored OAuth2 Provider with PKCE"}')
echo "${EDIT_CARD_RES}" | grep -q "successfully" || assert_fail "Failed to edit card note: ${EDIT_CARD_RES}"
assert_pass "Kanban card note updated"

log_test "Login as dev_alice and dev_bob"
curl -s -c "${TEST_DIR}/alice_cookies.txt" -X POST "${PROGIT_URL}/api/v1/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"username":"dev_alice","password":"DevSecret123!"}' > /dev/null
curl -s -c "${TEST_DIR}/bob_cookies.txt" -X POST "${PROGIT_URL}/api/v1/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"username":"dev_bob","password":"DevSecret123!"}' > /dev/null
assert_pass "Developer sessions authenticated"

log_test "dev_alice sends message to dev_bob (POST /api/v1/messages)"
SEND_MSG_RES=$(curl -s -b "${TEST_DIR}/alice_cookies.txt" -X POST "${PROGIT_URL}/api/v1/messages" \
  -H "Content-Type: application/json" \
  -d '{"recipient_username":"dev_bob","subject":"Sprint Planning Discussion","content":"Hi Bob, let us sync on sprint targets today."}')
echo "${SEND_MSG_RES}" | grep -q "Sprint Planning Discussion" || assert_fail "Failed to send message: ${SEND_MSG_RES}"
MSG_ID=$(echo "${SEND_MSG_RES}" | python3 -c "import sys, json; print(json.load(sys.stdin)['id'])")
assert_pass "Message sent from dev_alice to dev_bob (id: ${MSG_ID})"

log_test "dev_bob unread message count is 1"
BOB_UNREAD=$(curl -s -b "${TEST_DIR}/bob_cookies.txt" "${PROGIT_URL}/api/v1/messages/unread-count")
echo "${BOB_UNREAD}" | grep -q '"unread_count":1' || assert_fail "Unread count incorrect: ${BOB_UNREAD}"
assert_pass "dev_bob unread count verified"

log_test "dev_bob reads inbox and marks message read"
BOB_INBOX=$(curl -s -b "${TEST_DIR}/bob_cookies.txt" "${PROGIT_URL}/api/v1/messages/inbox")
echo "${BOB_INBOX}" | grep -q "Sprint Planning Discussion" || assert_fail "Message not found in dev_bob inbox: ${BOB_INBOX}"
curl -s -b "${TEST_DIR}/bob_cookies.txt" -X PATCH "${PROGIT_URL}/api/v1/messages/${MSG_ID}/read" > /dev/null
BOB_UNREAD_AFTER=$(curl -s -b "${TEST_DIR}/bob_cookies.txt" "${PROGIT_URL}/api/v1/messages/unread-count")
echo "${BOB_UNREAD_AFTER}" | grep -q '"unread_count":0' || assert_fail "Unread count should be 0 after reading: ${BOB_UNREAD_AFTER}"
assert_pass "Message read and unread count decremented to 0"

log_test "dev_bob replies to dev_alice"
REPLY_RES=$(curl -s -b "${TEST_DIR}/bob_cookies.txt" -X POST "${PROGIT_URL}/api/v1/messages" \
  -H "Content-Type: application/json" \
  -d "{\"recipient_username\":\"dev_alice\",\"subject\":\"Re: Sprint Planning Discussion\",\"content\":\"Sounds great, see you at 2 PM!\"}")
echo "${REPLY_RES}" | grep -q "Sounds great" || assert_fail "Failed to send reply: ${REPLY_RES}"
REPLY_ID=$(echo "${REPLY_RES}" | python3 -c "import sys, json; print(json.load(sys.stdin)['id'])")
assert_pass "Reply sent to dev_alice (id: ${REPLY_ID})"

log_test "dev_alice lists sent messages"
ALICE_SENT=$(curl -s -b "${TEST_DIR}/alice_cookies.txt" "${PROGIT_URL}/api/v1/messages/sent")
echo "${ALICE_SENT}" | grep -q "Sprint Planning Discussion" || assert_fail "Sent message not found in dev_alice outbox: ${ALICE_SENT}"
assert_pass "dev_alice sent messages verified"

log_test "Delete developer message (DELETE /api/v1/messages/:id)"
DEL_MSG_RES=$(curl -s -b "${TEST_DIR}/bob_cookies.txt" -X DELETE "${PROGIT_URL}/api/v1/messages/${MSG_ID}")
echo "${DEL_MSG_RES}" | grep -q "successfully" || assert_fail "Failed to delete message: ${DEL_MSG_RES}"
assert_pass "Message deleted successfully"

# -----------------------------------------------------------------------------
# 14. WEBHOOKS & DANGER ZONE MANAGEMENT
# -----------------------------------------------------------------------------
echo ""
echo -e "${YELLOW}--- Suite 14: Webhooks & Danger Zone Management ---${NC}"

log_test "Create Webhook for Repository (POST /hooks)"
CREATE_HOOK_RES=$(curl -s -b "${TEST_DIR}/dev_cookies.txt" -X POST "${PROGIT_URL}/api/v1/repos/${DEV_USER}/${PUBLIC_REPO}/hooks" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://httpbin.org/post","secret":"secret-key-123","content_type":"json","events":"push,issues,pull_request","is_active":true}')
echo "${CREATE_HOOK_RES}" | grep -q "httpbin.org" || assert_fail "Failed to create webhook: ${CREATE_HOOK_RES}"
HOOK_ID=$(echo "${CREATE_HOOK_RES}" | python3 -c "import sys, json; print(json.load(sys.stdin)['id'])")
assert_pass "Webhook registered (id: ${HOOK_ID})"

log_test "List Webhooks for Repository (GET /hooks)"
LIST_HOOKS_RES=$(curl -s -b "${TEST_DIR}/dev_cookies.txt" "${PROGIT_URL}/api/v1/repos/${DEV_USER}/${PUBLIC_REPO}/hooks")
echo "${LIST_HOOKS_RES}" | grep -q "${HOOK_ID}" || assert_fail "Webhook not listed: ${LIST_HOOKS_RES}"
assert_pass "Webhook listed in repository webhooks"

log_test "Test Webhook Ping Delivery (POST /hooks/:id/test)"
TEST_HOOK_RES=$(curl -s -b "${TEST_DIR}/dev_cookies.txt" -X POST "${PROGIT_URL}/api/v1/repos/${DEV_USER}/${PUBLIC_REPO}/hooks/${HOOK_ID}/test")
echo "${TEST_HOOK_RES}" | grep -q "delivery" || assert_fail "Test webhook ping failed: ${TEST_HOOK_RES}"
assert_pass "Webhook ping delivery dispatched"

log_test "List Webhook Deliveries (GET /hooks/:id/deliveries)"
LIST_DELIV_RES=$(curl -s -b "${TEST_DIR}/dev_cookies.txt" "${PROGIT_URL}/api/v1/repos/${DEV_USER}/${PUBLIC_REPO}/hooks/${HOOK_ID}/deliveries")
echo "${LIST_DELIV_RES}" | grep -q "ping" || assert_fail "Deliveries log missing ping event: ${LIST_DELIV_RES}"
assert_pass "Webhook deliveries log verified"

log_test "Delete Webhook (DELETE /hooks/:id)"
DEL_HOOK_RES=$(curl -s -b "${TEST_DIR}/dev_cookies.txt" -X DELETE "${PROGIT_URL}/api/v1/repos/${DEV_USER}/${PUBLIC_REPO}/hooks/${HOOK_ID}")
echo "${DEL_HOOK_RES}" | grep -q "successfully" || assert_fail "Failed to delete webhook: ${DEL_HOOK_RES}"
assert_pass "Webhook deleted successfully"

log_test "Danger Zone: Change Repository Visibility to Private (POST /visibility)"
VIS_RES=$(curl -s -b "${TEST_DIR}/dev_cookies.txt" -X POST "${PROGIT_URL}/api/v1/repos/${DEV_USER}/${PUBLIC_REPO}/visibility" \
  -H "Content-Type: application/json" \
  -d '{"is_private":true}')
echo "${VIS_RES}" | grep -q '"is_private":true' || assert_fail "Failed to set visibility to private: ${VIS_RES}"
assert_pass "Repository visibility toggled to Private"

log_test "Danger Zone: Change Repository Visibility back to Public (POST /visibility)"
VIS_PUB_RES=$(curl -s -b "${TEST_DIR}/dev_cookies.txt" -X POST "${PROGIT_URL}/api/v1/repos/${DEV_USER}/${PUBLIC_REPO}/visibility" \
  -H "Content-Type: application/json" \
  -d '{"is_private":false}')
echo "${VIS_PUB_RES}" | grep -q '"is_private":false' || assert_fail "Failed to set visibility to public: ${VIS_PUB_RES}"
assert_pass "Repository visibility restored to Public"

log_test "Danger Zone: Archive Repository (POST /archive)"
ARCH_RES=$(curl -s -b "${TEST_DIR}/dev_cookies.txt" -X POST "${PROGIT_URL}/api/v1/repos/${DEV_USER}/${PUBLIC_REPO}/archive" \
  -H "Content-Type: application/json" \
  -d '{"archive":true}')
echo "${ARCH_RES}" | grep -q '"is_archived":true' || assert_fail "Failed to archive repository: ${ARCH_RES}"
assert_pass "Repository archived"

log_test "Enforce Read-Only on Archived Repository (POST /issues blocked)"
BLOCKED_ISSUE_RES=$(curl -s -b "${TEST_DIR}/dev_cookies.txt" -X POST "${PROGIT_URL}/api/v1/repos/${DEV_USER}/${PUBLIC_REPO}/issues" \
  -H "Content-Type: application/json" \
  -d '{"title":"Should be rejected on archived repo","content":"Testing read-only"}')
echo "${BLOCKED_ISSUE_RES}" | grep -q "archived and read-only" || assert_fail "Archived repository allowed write: ${BLOCKED_ISSUE_RES}"
assert_pass "Write operation rejected on archived repository"

log_test "Danger Zone: Unarchive Repository (POST /archive)"
UNARCH_RES=$(curl -s -b "${TEST_DIR}/dev_cookies.txt" -X POST "${PROGIT_URL}/api/v1/repos/${DEV_USER}/${PUBLIC_REPO}/archive" \
  -H "Content-Type: application/json" \
  -d '{"archive":false}')
echo "${UNARCH_RES}" | grep -q '"is_archived":false' || assert_fail "Failed to unarchive repository: ${UNARCH_RES}"
assert_pass "Repository unarchived and write access restored"

log_test "Danger Zone: Transfer Repository Ownership to dev_alice (POST /transfer)"
TRANS_REPO="transfer-demo-repo-${RANDOM}"
curl -s -b "${TEST_DIR}/dev_cookies.txt" -X POST "${PROGIT_URL}/api/v1/repos" \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"${TRANS_REPO}\",\"description\":\"Temporary repo to test transfer\",\"private\":false,\"auto_init\":true}" > /dev/null

TRANS_RES=$(curl -s -b "${TEST_DIR}/dev_cookies.txt" -X POST "${PROGIT_URL}/api/v1/repos/${DEV_USER}/${TRANS_REPO}/transfer" \
  -H "Content-Type: application/json" \
  -d '{"new_owner":"dev_alice"}')
echo "${TRANS_RES}" | grep -q "transferred successfully" || assert_fail "Failed to transfer repository: ${TRANS_RES}"
assert_pass "Repository ownership transferred to dev_alice"

log_test "Verify transferred repository is under dev_alice"
TRANS_CHECK=$(curl -s -b "${TEST_DIR}/alice_cookies.txt" "${PROGIT_URL}/api/v1/repos/dev_alice/${TRANS_REPO}")
echo "${TRANS_CHECK}" | grep -q "${TRANS_REPO}" || assert_fail "Transferred repo not found under dev_alice: ${TRANS_CHECK}"
assert_pass "Transferred repository verified under new owner dev_alice"

# -----------------------------------------------------------------------------
# SUMMARY & SCORECARD
# -----------------------------------------------------------------------------
echo ""
echo -e "${CYAN}========================================================================${NC}"
echo -e "${CYAN}                        QA TEST RUN SUMMARY                             ${NC}"
echo -e "${CYAN}========================================================================${NC}"
echo "Total Tests Executed:  ${TOTAL_COUNT}"
echo -e "Passed:                ${GREEN}${PASSED_COUNT}${NC}"
echo -e "Failed:                ${RED}${FAILED_COUNT}${NC}"

if [ "${FAILED_COUNT}" -eq 0 ]; then
  echo -e "\n${GREEN}SUCCESS: 100% of all feature test suites PASSED without errors!${NC}"
  exit 0
else
  echo -e "\n${RED}FAILURE: Some tests did not pass.${NC}"
  exit 1
fi
