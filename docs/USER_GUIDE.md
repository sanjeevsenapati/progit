# ProGit User Guide

Welcome to **ProGit** — a modern, lightweight, self-hosted Git collaboration platform with full HTTPS encryption, zero-reload SPA performance, and built-in SSH.

Official Documentation Portal: [https://progit.co.in](https://progit.co.in)

---

## 1. Getting Started

### 1.1 Local Domain & Installation
1. Add `progit.local` to your client machine's `/etc/hosts`:
   ```bash
   echo "127.0.0.1 progit.local" | sudo tee -a /etc/hosts
   ```
2. If this is a fresh instance, navigate to `https://progit.local` (or `https://progit.local:3443`).
3. Configure application parameters and specify the **Super Administrator** username, email, and password.
4. Once completed, the Super Admin account is initialized with full management privileges and access to the **Administration Panel** (`/admin`).
5. Subsequent users can register at `/register` or be created directly by an administrator.

### 1.2 Accessing the Dashboard & Fast SPA Navigation
ProGit is built as a zero-page reload single-page application (SPA):
- Clicking any link, tab, branch, or repository navigates **instantly without full page flushes**.
- Dashboard telemetry and repository details are cached in memory for sub-millisecond tab switching.
- User authentication is persisted in `localStorage` eliminating flash-of-loading screens on page refreshes.

---

## 2. Managing Repositories

### 2.1 Creating a Repository
1. Click the **+** (Create) icon in the top navigation or click **New Repository**.
2. Select the repository owner (yourself or an organization).
3. Provide a repository name and optional description.
4. Choose visibility: **Public** (open to anyone) or **Private** (restricted to collaborators).
5. Optionally select **Initialize with README**.
6. Click **Create Repository**.

### 2.2 Cloning a Repository
From the repository overview or the Git CLI Quick Reference card, copy the clone URL:

- **Smart HTTP / HTTPS**:
  ```bash
  git clone https://progit.local/<username>/<reponame>.git
  # Or with custom port:
  git clone https://progit.local:3443/<username>/<reponame>.git
  ```
  Authenticate with your ProGit username and password, or a Personal Access Token.

- **Native SSH**:
  ```bash
  git clone ssh://git@progit.local:2222/<username>/<reponame>.git
  ```
  Ensure your public SSH key is uploaded to your ProGit user settings.

### 2.3 Pushing Commits
```bash
cd <reponame>
echo "Hello ProGit" > test.txt
git add test.txt
git commit -m "First commit"
git push origin main
```

### 2.4 Repository Search & Exploration
ProGit features a global, real-time repository search engine:
- **Navbar Instant Search**: Click the search input in the top navigation bar or press `/` on your keyboard from anywhere to immediately focus the search field.
- **Live Autocomplete Dropdown**: As you type, matching repositories appear with owner badges, repository name, star counts, private locks, and descriptions.
- **Keyboard Navigation**:
  - `ArrowDown` / `ArrowUp`: Navigate through autocomplete suggestions.
  - `Enter`: Navigate directly to the highlighted repository, or perform a full explore search for the typed query.
  - `Escape`: Dismiss the search dropdown.
- **Explore Page Search (`/explore?q=...`)**: Full search results page with deep URL synchronization, allowing users to bookmark or share search queries.
- **Access Control & Privacy**: Repository search strictly adheres to security boundaries. Public repositories are discoverable by everyone. Private repositories only appear in search results for their authenticated owners, collaborators, and organization members. Stranger and unauthenticated queries never leak the existence of private repositories.

---

## 3. Code Browsing & Navigation

- **File Tree**: Click any folder or file to browse its contents.
- **Syntax Highlighting & Markdown**: Source code is highlighted automatically; Markdown READMEs are formatted with GitHub-style aesthetics.
- **Branch & Tag Selector**: Switch branches or tags using the dropdown at the top of the file tree.
- **Commit History**: Click **Commits** to view the commit timeline and click any commit SHA to inspect unified diffs.

### 3.1 Online File Creation and Editing
- **Create New File**: Click **Add file > Create new file** from any directory view. You can type nested paths (e.g. `src/utils/math.js`) and ProGit will automatically create the required directories. Enter your code, provide a commit message, choose to commit directly or to a new branch, and click **Commit changes**.
- **Edit Existing File**: In the file view (`FileView`), click the **Edit** (pencil) button. This opens the online editor with syntax highlighting, line numbers, and a **Preview** tab for Markdown files. Update your code and submit an online commit.

### 3.2 Uploading Files and Directories
- Click **Add file > Upload files** from any repository code view.
- **Drag & Drop**: Drag one or more files directly into the upload dropzone.
- **Choose Files**: Click **choose files** to pick multiple files.
- **Upload Directory**: Click **upload a directory** to select an entire folder structure. ProGit preserves relative subdirectories (e.g., `assets/images/logo.svg`).
- Review the staged file list, enter a commit message, select the target branch, and click **Commit changes**. All uploaded files are committed in a single atomic Git commit.

### 3.3 Online File Deletion
- In the file view, click the **Delete** (trash) button.
- Enter a commit message in the confirmation modal and click **Delete file**. The file will be removed from the target branch with an online commit.

---

## 4. Collaboration: Issues & Pull Requests

### 4.1 Issues
1. Navigate to the **Issues** tab.
2. Click **New Issue** to report bugs or track feature ideas.
3. Add comments, assign team members, and track status.

### 4.2 Pull Requests & Merges
1. Navigate to the **Pull Requests** tab and click **New Pull Request**.
2. Select your head branch and target base branch.
3. Review the live diff comparison of files changed.
4. Click **Create Pull Request**.
5. Once approved, merge using your preferred strategy:
   - **Merge Commit**: Standard non-fast-forward merge.
   - **Squash and Merge**: Combines all commits into a single commit on the base branch.
   - **Rebase and Merge**: Rebases head commits linearly on top of the base branch.

---

## 5. Account Settings & Authentication

- **SSH Keys**: Go to **Settings > SSH Keys** to register your public key (`id_ed25519.pub`).
- **Personal Access Tokens (PAT)**: Go to **Settings > Access Tokens** to generate tokens for CLI or CI/CD pipelines.
- **Theme Preferences**: Toggle between Dark Mode and Light Mode using the sun/moon icon in the navigation bar.

---

## 6. Project Wiki Documentation

Each ProGit repository includes a built-in, Git-backed wiki for architecture documents, guides, and manuals.

### 6.1 Browsing & Editing Pages
- Click the **Wiki** tab in the repository header.
- The sidebar lists all pages in the wiki, with instant search filtering.
- Click **New Wiki Page** to draft a new page with a custom title, slug, and markdown body.
- Use the **Write / Preview** editor tabs to verify formatting before committing.
- Click **History** on any page to view previous revisions and authors.

### 6.2 Offline Editing via Git CLI
The wiki is backed by an independent bare Git repository:
```bash
git clone http://localhost:3000/<owner>/<repo>.wiki.git
cd <repo>.wiki
echo "# New Guide" > Guide.md
git add Guide.md
git commit -m "Add guide"
git push origin main
```
Changes pushed over HTTP or SSH are instantly reflected in the Web UI.

---

## 7. ProGit Pages (GitHub Pages Hosting)

ProGit Pages lets you host static websites, portfolios, or documentation directly from any Git branch.

### 7.1 Enabling ProGit Pages
1. Go to repository **Settings** (or the **Pages** tab).
2. Check **Enable ProGit Pages**.
3. Select the **Source Branch** (e.g. `gh-pages` or `main`).
4. Select the **Source Folder** (`/` root or `/docs`).
5. Click **Save Pages Configuration**.

### 7.2 Accessing Your Site
Once enabled, your site is available at:
```
http://localhost:3000/pages/<owner>/<repo>/
```
- **Serving Cascade**: ProGit Pages looks for `index.html`. If not found, it automatically falls back to `index.md` or `README.md`, rendering clean styled HTML.
- **Static Assets**: Supported formats include `.css`, `.js`, `.png`, `.jpg`, `.svg`, `.json`, `.woff2`, etc.
- **Custom 404 Pages**: If a page is not found, ProGit serves `404.html` if present in the source folder.
- **Security**: For private repositories, pages are protected and require active session credentials.

---

## 8. Security & Collaborator Permissions

ProGit strictly enforces access control boundaries across all online write operations (file editing, file creation, file deletion, and file/folder uploading):

### 8.1 Write Access Rules
- **Authentication**: All online write operations strictly require an active authenticated user session or valid Bearer PAT. Unauthenticated requests return `HTTP 401 Unauthorized`.
- **Authorization**: Write operations are permitted only if:
  1. The user is a **Site Administrator** (`is_admin = true`).
  2. The user is the **Repository Owner**.
  3. The user is an **Explicit Collaborator** with `write` or `admin` permission mode.
  4. The user is an **Organization Owner/Admin** or a member of an authorized team for an organization-owned repository.
- **Unauthorized Protection**: Unauthorized users receive `HTTP 403 Forbidden` from the API, and the Web UI automatically hides the "Add file", "Edit", and "Delete" buttons, while direct navigation displays a warning and disables the commit buttons.

### 8.2 Managing Collaborators
1. In your repository, click **Settings**.
2. Scroll to the **Collaborators & Edit Permissions** section.
3. Enter the collaborator's username and select their permission level:
   - `write`: Can edit, create, delete, upload files, push code, and open/manage issues and PRs.
   - `admin`: Full administrative control over the repository including settings and collaborator management.
   - `read`: Read-only access to browse code and clone private repositories.
4. Click **Add Collaborator**.
5. To revoke access, click the **Remove** button next to any collaborator in the list.

---

## 9. Organizations & Teams

Like GitHub, ProGit allows users to create Organizations to manage shared repositories, access permissions, and developer teams.

### 9.1 Creating an Organization
1. Click the **+** (Create) menu in the navigation bar and select **New Organization** (or visit `/org/new`).
2. Enter a unique organization handle (e.g. `acme-corp`), full name, and description.
3. Click **Create Organization**. The creator is automatically assigned the `owner` role.

### 9.2 Managing Organization Members & Teams
- Navigate to `/org/<orgname>` to view the organization profile.
- **Repositories Tab**: View all repositories owned by the organization or create a new one directly.
- **Members Tab**: Invite existing users by username and assign them roles (`owner`, `admin`, or `member`).
- **Teams Tab**: Create developer teams (e.g. `Frontend Engineers`, `DevOps`) and assign team-wide default permissions (`read`, `write`, `admin`).
- **Organization Repositories**: When creating a new repository (`/new`), choose the organization as the owner in the dropdown. Git clone/push URLs automatically reflect the organization namespace:
  ```bash
  git clone http://localhost:3000/acme-corp/service-backend.git
  ```

---

## 10. Projects & Kanban Boards

ProGit features interactive Kanban project boards for repositories to organize sprint tasks, roadmap epics, and repository issues.

### 10.1 Creating a Project Board
1. In your repository header, click the **Projects** tab.
2. Click **New Project**.
3. Enter a title (e.g. `Q1 Sprint Roadmap`) and optional description.
4. Click **Create Project**. ProGit automatically provisions the board with default columns:
   - **To do**
   - **In progress**
   - **Done**

### 10.2 Kanban Board Workflows
- **Add Custom Columns**: Click **Add column** to insert custom stages (e.g., `In Review`, `QA Testing`).
- **Add Task Cards**: Click the **+** button on any column to create a card. You can create standalone Markdown notes or link directly to open repository issues.
- **Drag & Drop**: Easily drag task cards between columns as work progresses, or use the card position controls.
- **Automated Progress Tracking**: The project board automatically tracks completed tasks (`Done` column) against total cards, displaying real-time completion percentage bars.
- **Close & Reopen**: Mark projects as closed when completed, or reopen them anytime.

---

## 11. Developer Direct Messaging

ProGit includes an integrated messaging portal allowing developers to communicate directly without external tooling:

### 11.1 Sending and Managing Messages
- **Accessing Messages**: Click the **Messages** envelope icon in the top navigation header or navigate directly to `/messages`.
- **Unread Notification Badge**: The navigation envelope badge displays a live counter of unread messages.
- **Compose**: Click **New Message**, select a recipient developer from the active developer list, enter a subject line, and draft your message in Markdown.
- **Threaded Replies**: Open any message from your Inbox and click **Reply** to respond with automated subject quoting (`Re: ...`).
- **Inbox & Sent Tabs**: Switch between your received **Inbox** and sent **Outbox** items.
- **Delete / Cleanup**: Delete messages from your view with a single click.

---

## 12. Webhooks & Automated Integrations

Webhooks allow external services (CI/CD engines, Slack, Discord, custom servers) to be notified whenever repository events occur.

### 12.1 Configuring a Webhook
1. In your repository, navigate to **Settings > Webhooks**.
2. Click **Add Webhook**.
3. Configure the webhook parameters:
   - **Payload URL**: The HTTP/HTTPS target endpoint (e.g. `https://ci.example.com/hooks/progit`).
   - **Secret Token**: Optional secret used for cryptographic HMAC-SHA256 signature generation.
   - **Content Type**: `application/json`.
   - **Event Triggers**: Choose all events or select specific triggers (`push`, `issues`, `pull_request`).
4. Click **Create Webhook**.

### 12.2 Signature Verification (HMAC-SHA256)
ProGit signs every webhook request using your secret key. Verify incoming webhooks by checking the `X-Hub-Signature-256` or `X-ProGit-Signature` headers:
```http
X-ProGit-Event: push
X-ProGit-Delivery: 7f83b165-2134-4b52-b8ec-f6215a782b13
X-Hub-Signature-256: sha256=d254f3879...
```

### 12.3 Delivery History & Ping Testing
- Click **Test Delivery** to send an instant `ping` event.
- Inspect the **Deliveries Log** to view recent delivery status codes (e.g. `200 OK`), round-trip latency, request headers, and response payloads.

---

## 13. Repository Danger Zone & Protection

Located in **Settings > Danger Zone**, these actions provide high-stakes repository lifecycle operations with multiple confirmation safeguards:

### 13.1 Changing Repository Visibility
- Toggle your repository between **Public** and **Private**.
- Public repositories are visible to any user or anonymous visitor; Private repositories require explicit collaborator permissions or team membership.

### 13.2 Archiving a Repository (Read-Only Lock)
- Mark a repository as **Archived** to place it into permanent read-only mode.
- When archived, all write operations are strictly blocked across the platform:
  - Git CLI pushes over HTTP and SSH (`receive-pack`) are rejected.
  - In-browser file editing, file creation, file deletion, and directory uploads are disabled.
  - Creating issues, opening pull requests, and modifying Kanban cards are blocked with `HTTP 400 Bad Request`.
- Owners can **Unarchive** the repository at any time to restore full write capabilities.

### 13.3 Transferring Ownership
- Transfer a repository to another developer or an organization.
- ProGit atomically moves the underlying bare Git directory on disk and reassigns all SQLite records to the new owner namespace.
- Clone and remote URLs update immediately to the new owner (e.g. `/<new_owner>/<repo>.git`).

### 13.4 Deleting a Repository
- Purges the repository permanently from SQLite and deletes the bare repository from disk (`/data/repositories/<owner>/<repo>.git`).
- Requires entering the exact repository name in a confirmation dialog.

---

## 14. Collaborator-Scoped Issue Assignment

To safeguard project privacy and prevent unauthorized user targeting, issue assignees are strictly restricted:
- Only confirmed **repository owners and collaborators** appear in the issue assignee selector (`/api/v1/repos/{owner}/{repo}/assignees`).
- Any attempt to assign an issue to an unauthorized external user is blocked with `HTTP 400 Bad Request`.




