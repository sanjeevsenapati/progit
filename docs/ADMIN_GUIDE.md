# ProGit Super Administrator & Management Guide

This guide details how to create the **Super Administrator** account during installation, manage all platform resources using the ProGit Administration Panel, and configure enterprise domain, SSL/TLS, and persistence settings.

Official Documentation Portal: [https://progit.co.in](https://progit.co.in)

---

## 1. Creating the Super Administrator Account

ProGit provides three methods to initialize the Super Admin account:

### Method A: Web Installation Wizard (`/install`)
When ProGit is launched for the first time:
1. Navigate to `https://progit.local:3443/install` (or `http://localhost:3000/install`).
2. The **ProGit Initial Setup** wizard prompts you for:
   - **Application Settings**: Application Name (default: `ProGit`), Domain (default: `progit.local`), Protocol (`https`), HTTP Port (`3000`), HTTPS Port (`3443`), Root URL (`https://progit.local/`).
   - **Super Administrator Account**:
     - Admin Username (e.g. `admin` or custom)
     - Admin Email Address
     - Admin Password (minimum 6 characters)
3. Click **Complete Installation & Create Super Admin**.
4. The wizard initializes the Super Admin account with full administrative privileges, sets `INSTALL_LOCK = true` in `app.ini`, automatically signs in the Super Admin, and redirects to the **Administration Dashboard**.

### Method B: Environment Variables (Automated / Container Deployments)
For hands-free container deployments, set the following environment variables:
```bash
PROGIT_ADMIN_USER="admin"
PROGIT_ADMIN_EMAIL="admin@example.com"
PROGIT_ADMIN_PASSWORD="YourSecurePassword123!"
```
On startup, ProGit automatically verifies if the Super Admin user exists; if not, it initializes the account with `is_admin = true`.

### Method C: Command-Line Interface (CLI Operations)
At any time, the Ops team can manage administrators and users directly from the command line without using the web browser:

**1. Create a New Administrator:**
```bash
# Inside Podman Container
podman exec -it progit /usr/local/bin/progit admin create-user \
  --username="opsadmin" \
  --email="ops@example.com" \
  --password="SecurePassword123!" \
  --admin

# Using Local Binary
./progit admin create-user --username="opsadmin" --email="ops@example.com" --password="SecurePassword123!" --admin
```

**2. Reset an Administrator / User Password:**
```bash
podman exec -it progit /usr/local/bin/progit admin reset-password \
  --username="admin" \
  --password="NewSecurePassword456!"
```

**3. Promote an Existing User to Administrator:**
```bash
podman exec -it progit /usr/local/bin/progit admin make-admin --username="developer1"
```

**4. List All Users & Administrative Roles:**
```bash
podman exec -it progit /usr/local/bin/progit admin list-users
```

**5. Permanently Lock the Web Installation Wizard:**
```bash
podman exec -it progit /usr/local/bin/progit admin lock-install
```

> [!IMPORTANT]
> **Automatic Defense-in-Depth Installation Locking**:
> Once an administrator or any user account exists in the database, ProGit automatically locks the installation wizard (`INSTALL_LOCK = true`) and persists it to `app.ini`. All subsequent web browser requests to `/install` are immediately redirected to `/login` (returning HTTP 403 / 404 to API clients) to prevent account hijacking or unauthorized reconfiguration.

---

## 2. Managing ProGit from the Administration Panel

Once logged in as a Super Admin, click the **Admin** link in the top navigation or navigate to `https://progit.local:3443/admin`.

### 2.1 System Settings & Base URL Configuration
Administrators can update core server parameters live from the Admin Dashboard:
- **Application Name**: Name displayed in headers and browser tabs.
- **Domain & Base URL**: Change `progit.local` to a corporate domain (e.g., `git.company.internal` or `https://git.company.com/`).
- **Dynamic Propagation**: Updating the base URL immediately updates all Git clone instructions (Smart HTTP and SSH), Git CLI Quick Reference cards, and web links across all repositories without requiring a server reboot.
- **Persistence**: Configuration is automatically saved to `/data/config/app.ini` so it survives container restarts.

### 2.2 User Management
- **Add New User**:
  - Click **Create User** in the admin header.
  - Fill in Username, Email, Full Name, and Password.
  - Check **Grant Administrator Privileges** if the user should also have admin rights.
- **Promote / Demote Admins**:
  - Click **Make Admin** on any standard user to grant full administrative rights.
  - Click **Demote** to convert an administrator back to a standard user.
  - *Safety Guard*: Super Admins cannot demote themselves to prevent accidental lockouts.
- **Suspend / Activate Accounts**:
  - Click **Suspend** on any user to immediately revoke active access.
  - Click **Activate** to restore access.
- **Delete User**:
  - Click the **Trash** icon to delete a user account and their bare repositories from disk.

### 2.3 Repository Oversight & Feature Controls
- **Global Repository Oversight**:
  - Switch to the **Repositories** tab to see all public and private repositories across all users and organizations.
- **Repository Feature Controls**:
  - Each repository provides granular toggles under **Settings > Features** for **Wikis** (`enable_wiki`) and **ProGit Pages** (`enable_pages`).
  - When disabled, backend endpoints enforce 403 Forbidden checks, and navigation items are dynamically hidden.
- **Administrative Delete**:
  - Click **Delete Repo** to immediately remove any repository from SQLite and purge the bare repository tree from disk.

### 2.4 System Diagnostics & Database Operations
- **System Metrics**: Go runtime version, active goroutines, memory allocation, active sessions, and SSH uptime.
- **Checkpoint & Truncate WAL**: Flushes and truncates the SQLite write-ahead log (`PRAGMA wal_checkpoint(TRUNCATE)`), reclaiming storage.
- **Database VACUUM**: Defragments the database file and reclaims freed storage space.

---

## 3. Administrative REST API Endpoints

All admin endpoints require an active session or Personal Access Token from a user with `is_admin = true`:

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/health` | Public service health check (checks DB & repositories) |
| `GET` | `/api/ready` | Public service readiness probe (returns HTTP 200) |
| `GET` | `/api/v1/install/status` | Check installation lock status and server configuration |
| `POST` | `/api/v1/install` | Complete setup wizard and create Super Admin |
| `GET` | `/api/v1/admin/stats` | System telemetry, runtime metrics, and storage paths |
| `PUT` | `/api/v1/admin/config` | Update application name, domain, root URL, and ports |
| `GET` | `/api/v1/admin/users` | List all users across the system |
| `POST` | `/api/v1/admin/users` | Admin creates user account with optional admin flag |
| `PATCH` | `/api/v1/admin/users/{id}` | Update user (toggle `is_admin` or `is_active`) |
| `DELETE` | `/api/v1/admin/users/{id}` | Delete user account and all repositories |
| `GET` | `/api/v1/admin/repos` | List all repositories across the system |
| `DELETE` | `/api/v1/admin/repos/{id}` | Admin deletes any repository from database and disk |
| `POST` | `/api/v1/admin/maintenance` | Run maintenance: `checkpoint_wal` or `vacuum` |

---

## 4. Configuring HTTPS & TLS

ProGit includes native, pure-Go HTTPS support with zero CGO dependencies.

### 4.1 Zero-Config Self-Signed HTTPS (Out-of-the-Box Default)
ProGit defaults to HTTPS with automatic ECDSA self-signed certificate generation:
```ini
[server]
PROTOCOL = https
DOMAIN = progit.local
ROOT_URL = https://progit.local/
HTTPS_PORT = 3443
HTTP_PORT = 3000
REDIRECT_OTHER_PORT = true
GENERATE_LOCAL_CERT = true
CERT_FILE = /data/config/https/cert.pem
KEY_FILE = /data/config/https/key.pem
HSTS_MAX_AGE = 31536000
```
When ProGit launches:
1. It automatically generates a secure ECDSA P-256 certificate with Subject Alternative Names (SANs) covering `progit.local`, `*.progit.local`, `localhost`, `*.localhost`, `127.0.0.1`, and `::1`.
2. It listens on port `3443` for HTTPS and starts an HTTP redirect server on port `3000`.
3. Health check requests to `/api/health` respond with `200 OK` on both ports without redirection delay.

### 4.2 Custom Corporate TLS Certificates
Place your certificate and private key in the persistent config directory:
```ini
[server]
PROTOCOL = https
DOMAIN = git.yourcompany.com
ROOT_URL = https://git.yourcompany.com/
HTTPS_PORT = 443
HTTP_PORT = 80
CERT_FILE = /data/config/https/cert.pem
KEY_FILE = /data/config/https/key.pem
REDIRECT_OTHER_PORT = true
HSTS_MAX_AGE = 31536000
```

### 4.3 Automated Let's Encrypt / ACME
For public domains with automated TLS certificate issuance and zero-downtime renewal:
```ini
[server]
PROTOCOL = https
DOMAIN = git.yourcompany.com
ROOT_URL = https://git.yourcompany.com/
HTTPS_PORT = 443
HTTP_PORT = 80
ENABLE_ACME = true
ACME_DOMAIN = git.yourcompany.com
ACME_EMAIL = devops@yourcompany.com
ACME_DIR = /data/config/https/acme
REDIRECT_OTHER_PORT = true
```
ProGit automatically responds to ACME challenges, issues certificates, and handles renewals.

---

## 5. OpenID Connect (OIDC) & OAuth2 Single Sign-On (SSO)

ProGit features built-in support for OpenID Connect (OIDC) and OAuth2 identity providers, allowing developers to authenticate using their corporate Google Workspace, GitHub, Microsoft 365, or Keycloak credentials with automated Just-In-Time (JIT) account provisioning.

### 5.1 Provider Presets & Configuration

ProGit supports built-in presets for major identity providers or standard OIDC auto-discovery via `/.well-known/openid-configuration`:

| Provider Preset | Parameter `PROVIDER` | Discovery / Auth Flow | Notes |
| :--- | :--- | :--- | :--- |
| **Google Workspace** | `google` | Auto-configured endpoints (`accounts.google.com`) | Ideal for corporate Google accounts |
| **GitHub** | `github` | OAuth2 (`github.com/login/oauth/authorize`) | Standard developer OAuth2 login |
| **Microsoft 365** | `microsoft` | Multi-tenant OIDC (`login.microsoftonline.com/common`) | Azure AD / Entra ID |
| **Keycloak / Okta / Generic** | `keycloak` or `generic` | Auto-discovery via `ISSUER_URL` (`/.well-known/openid-configuration`) | Self-hosted or enterprise IDP |

### 5.2 Configuration via `app.ini`

Add the `[oidc]` section to `/data/config/app.ini`:

```ini
[oidc]
ENABLED = true
PROVIDER = google
CLIENT_ID = your-client-id.apps.googleusercontent.com
CLIENT_SECRET = your-google-client-secret
DISPLAY_NAME = Google Workspace
ALLOWED_DOMAINS = yourcompany.com,subsidiary.com
AUTO_PROVISION = true
```

#### Generic OIDC / Keycloak Example:
```ini
[oidc]
ENABLED = true
PROVIDER = generic
CLIENT_ID = progit-client
CLIENT_SECRET = your-keycloak-secret
ISSUER_URL = https://idp.yourcompany.com/realms/master
DISPLAY_NAME = Corporate SSO
ALLOWED_DOMAINS = yourcompany.com
AUTO_PROVISION = true
```

### 5.3 Configuration via Environment Variables

For container and cloud deployments, configure OIDC via `PROGIT_OIDC_*` environment variables:

```bash
PROGIT_OIDC_ENABLED="true"
PROGIT_OIDC_PROVIDER="google"
PROGIT_OIDC_CLIENT_ID="your-client-id.apps.googleusercontent.com"
PROGIT_OIDC_CLIENT_SECRET="your-client-secret"
PROGIT_OIDC_DISPLAY_NAME="Google Workspace"
PROGIT_OIDC_ALLOWED_DOMAINS="yourcompany.com"
PROGIT_OIDC_AUTO_PROVISION="true"
```

> [!TIP]
> **Explicit Disable**: To temporarily disable OIDC without removing credentials from environment files, set `PROGIT_OIDC_ENABLED="false"`. The explicit disable flag takes precedence over configured client credentials.

### 5.4 Security & Domain Whitelisting

- **Domain Restriction**: Setting `ALLOWED_DOMAINS` strictly rejects authentication attempts from email addresses outside authorized domain suffixes (e.g., blocks personal `@gmail.com` when only `@yourcompany.com` is whitelisted).
- **Cryptographic State Protection**: Authentication requests generate a cryptographically random 32-byte CSRF token stored in a `SameSite=Lax`, `HttpOnly`, `Secure` cookie (`progit_oidc_state`). Mismatched or missing states are immediately rejected.
- **Fail-Safe Local Authentication**: Standard database credentials remain active alongside SSO, ensuring administrators can access the system even during third-party IDP outages.

---

## 6. Platform Feature Flags & Collaboration Security

### 6.1 Developer Direct Messaging Feature Flag (`ENABLE_MESSAGING`)
Administrators can enable or disable developer direct messaging globally across the instance:

**Configuration in `conf/app.ini`:**
```ini
[features]
ENABLE_MESSAGING = true   ; Set to false to disable messaging entirely
```

**Configuration via Environment Variables:**
```bash
PROGIT_ENABLE_MESSAGING="false"            # Disables messaging
# or
PROGIT_FEATURES_ENABLE_MESSAGING="false"
```

**Enforcement Behavior:**
- **Navigation & Polling**: The messages envelope icon is completely removed from the navbar header, unread polling is stopped, and "Messages" is hidden from user menus.
- **API Guarding**: All messaging endpoints (`POST /api/v1/messages`, `GET /api/v1/messages/inbox`, `GET /api/v1/messages/sent`, `GET /api/v1/developers`, etc.) return `403 Forbidden` with a descriptive error message.
- **Direct Navigation**: Visiting `/messages` renders a clean "Direct Messaging Disabled" informational screen.

### 6.2 Pull Request Permissions & Public Visibility
ProGit implements a granular, zero-trust permission model for pull requests on public repositories:
- **Public Browsing (Anonymous / Unauthenticated)**: Anyone can view pull requests, commit lists, diffs, and review comments on public repositories without logging in.
- **Restricted Creation**: Only authenticated (logged-in) users can create pull requests.
- **Restricted Merge Execution**: The **Merge** action and merge strategy selector (Create merge commit, Squash and merge, Rebase and merge) are strictly restricted to:
  1. Repository collaborators / members with write permissions, OR
  2. The author (requester) of the pull request.
- **API Defense**: Direct HTTP POST requests to `/api/v1/repos/{owner}/{repo}/pulls/{index}/merge` require a valid session (`401 Unauthorized` for anonymous requests) and verify that the user is either a repo collaborator or the PR author (`403 Forbidden` for other logged-in users).

