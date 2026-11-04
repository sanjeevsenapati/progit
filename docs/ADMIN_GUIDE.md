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

### Method C: Command-Line Interface (CLI)
At any time, you can create a Super Admin user directly from the host or inside a container:

**Inside Podman Container:**
```bash
podman exec -it progit /usr/local/bin/progit admin create-user \
  --username="admin" \
  --email="admin@example.com" \
  --password="SecurePassword123!" \
  --admin
```

**Using the Local Binary / Script:**
```bash
./progit admin create-user --username="admin" --email="admin@example.com" --password="SecurePassword123!" --admin
```

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

### 2.3 Repository Oversight
- **Global Repository Oversight**:
  - Switch to the **Repositories** tab to see all public and private repositories across all users and organizations.
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
