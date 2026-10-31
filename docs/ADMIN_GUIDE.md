# ProGit Super Administrator & Management Guide

This guide details how to create the **Super Administrator** account during installation and manage all platform resources using the ProGit Administration Panel.

---

## 1. Creating the Super Administrator Account

ProGit provides three methods to initialize the Super Admin account:

### Method A: Web Installation Wizard (`/install`)
When ProGit is launched for the first time:
1. Navigate to `http://localhost:3000/install` (or your configured port).
2. The **ProGit Initial Setup** wizard prompts you for:
   - **Application Settings**: Application Name, Domain, HTTP Port, Root URL.
   - **Super Administrator Account**:
     - Admin Username (e.g. `admin` or custom)
     - Admin Email Address
     - Admin Password (minimum 6 characters)
3. Click **Complete Installation & Create Super Admin**.
4. The wizard initializes the Super Admin account with full administrative privileges, sets `INSTALL_LOCK = true` in `conf/app.ini`, automatically signs in the Super Admin, and redirects to the **Administration Dashboard**.

### Method B: Environment Variables (Automated / Container Deployments)
For hands-free container deployments, set the following environment variables:
```bash
PROGIT_ADMIN_USER="superadmin"
PROGIT_ADMIN_EMAIL="superadmin@example.com"
PROGIT_ADMIN_PASSWORD="YourSecurePassword123!"
```
On startup, ProGit automatically verifies if the Super Admin user exists; if not, it initializes the account with `is_admin = true`.

### Method C: Command-Line Interface (CLI)
At any time, you can create a Super Admin user directly from the host or inside a container:

**Inside Podman Container:**
```bash
podman exec progit /usr/local/bin/progit admin create-user \
  --username="admin" \
  --email="admin@example.com" \
  --password="SecurePassword123!" \
  --admin
```

**Using the Local Binary / Script:**
```bash
./scripts/create-admin.sh admin admin@example.com SecurePassword123!
```

---

## 2. Managing ProGit from the Administration Panel

Once logged in as a Super Admin, click the **Admin** badge in the top navigation or navigate to `http://localhost:3000/admin`.

### 2.1 User Management
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

### 2.2 Repository Management
- **Global Repository Oversight**:
  - Switch to the **Repositories** tab to see all public and private repositories across all users and organizations.
- **Administrative Delete**:
  - Click **Delete Repo** to immediately remove any repository from SQLite and purge the bare repository tree from disk.

### 2.3 System Telemetry & Runtime Metrics
The **System Overview** tab provides live diagnostics:
- **Go Runtime Version**: Active Go compiler version (e.g. `Go 1.27.3`).
- **Goroutines**: Number of active concurrent goroutines.
- **Allocated Memory**: Current heap allocations.
- **Active Sessions**: Number of unexpired web sessions.
- **Uptime & SSH Status**: Uptime counter and built-in SSH listener port.

### 2.4 Online Database Maintenance
From the **Database Operations** section in the Admin Panel:
- **Checkpoint & Truncate WAL**: Flushes and truncates the SQLite write-ahead log (`PRAGMA wal_checkpoint(TRUNCATE)`), keeping database file size minimal.
- **Run Database VACUUM**: Defragments the database file and reclaims freed storage space.

---

## 3. Administrative REST API Endpoints

All admin endpoints require an active session or Personal Access Token from a user with `is_admin = true`:

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/v1/install/status` | Check installation lock status and server configuration |
| `POST` | `/api/v1/install` | Complete setup wizard and create Super Admin |
| `GET` | `/api/v1/admin/stats` | System telemetry, runtime metrics, and storage paths |
| `GET` | `/api/v1/admin/users` | List all users across the system |
| `POST` | `/api/v1/admin/users` | Admin creates user account with optional admin flag |
| `PATCH` | `/api/v1/admin/users/{id}` | Update user (toggle `is_admin` or `is_active`) |
| `DELETE` | `/api/v1/admin/users/{id}` | Delete user account and all repositories |
| `GET` | `/api/v1/admin/repos` | List all repositories across the system |
| `DELETE` | `/api/v1/admin/repos/{id}` | Admin deletes any repository from database and disk |
| `POST` | `/api/v1/admin/maintenance` | Run maintenance: `checkpoint_wal` or `vacuum` |

