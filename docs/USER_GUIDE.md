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

### 1.3 Logging In & Single Sign-On (SSO)
ProGit supports both standard local database authentication and enterprise Single Sign-On:
- **Local Login**: Enter your registered username and password to log in directly.
- **Single Sign-On (OIDC)**: If your administrator has enabled SSO, a branded login button appears on the sign-in page (e.g., **Sign in with Google Workspace**, **Sign in with GitHub**, **Sign in with Microsoft**, or **Sign in with SSO**).
- **Just-In-Time (JIT) Provisioning**: When signing in via corporate SSO for the first time, ProGit automatically creates your developer profile, maps your corporate email address, and logs you into the dashboard instantly without manual admin intervention.
- **Domain Restriction**: If domain filtering is enabled, only users with email addresses matching your organization's allowed domains can log in. Attempting to log in with an unauthorized email will present an immediate security alert.
- **Fail-Safe Access**: Administrators can always use standard credentials to log in even if third-party SSO providers experience temporary upstream downtime.

---

## 2. Managing Repositories

### 2.1 Creating a Repository
1. Click the **+** (Create) icon in the top navigation or click **New Repository**.
2. Select the repository owner (yourself or an organization).
3. Provide a repository name and optional description.
4. Choose visibility: **Public** (open to anyone) or **Private** (restricted to collaborators).
5. Optionally select **Initialize with README**.
6. Click **Create Repository**.

### 2.2 Cloning & Downloading a Repository
From the repository **Code** popover, the **Tags** page, or the Git CLI Quick Reference card, download an archive or copy the clone URL:

- **Download ZIP Archive**:
  - Open the green **Code** dropdown on the repository home page and click **Download ZIP (<branch>)**, or click **Download ZIP** next to any release tag on the **Tags** page.
  - Note: Download ZIP, Raw file downloads, Fork, and Git `clone`/`pull` are hidden and blocked (`403 Forbidden`) if your user account is download-restricted by an administrator, if your repository/team role is `view_only`, or if the repository has **Allow Downloads (ZIP / Clone) & Pull Requests** disabled for non-write users.

- **Smart HTTP / HTTPS**:
  ```bash
  # Standard HTTPS clone with custom port:
  git clone https://progit.local:3443/<username>/<reponame>.git

  # If using the self-signed TLS certificate without installing root CA:
  git -c http.sslVerify=false clone https://progit.local:3443/<username>/<reponame>.git
  ```
  Authenticate with your ProGit username and password, or a Personal Access Token.
  > [!TIP]
  > You can download the ProGit Root CA certificate directly from the Clone dropdown in the web UI (`Download Root CA`) to trust it system-wide.

- **Native SSH**:
  ```bash
  git clone ssh://git@progit.local:2222/<username>/<reponame>.git
  ```
  Ensure your public SSH key is uploaded to your ProGit user settings. Connecting to `ssh -p 2222 git@progit.local` prints an interactive GitHub-style welcome banner:
  ```text
  Hi <username>! You've successfully authenticated over SSH on ProGit, but interactive shell access is disabled.
  ```

### 2.3 Recently Pushed Branches & Quick PR Creation
When pushing a new branch via the command line, ProGit automatically:
1. Prints the direct Pull Request creation URL in the Git terminal output (`remote: Create a pull request for 'branch': https://progit.local:3443/owner/repo/pulls/new`).
2. Displays a sticky **"Recently pushed branches"** banner on the repository homepage with a 1-click **[Compare & pull request]** button.

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

## 3. Code Browsing & Explorer Layout

ProGit features a GitHub-style two-column file explorer interface:
- **Collapsible File Explorer Sidebar**: Browse the full folder and file tree directly alongside the file content without losing context.
  - Quick keyboard search: Press `t` from anywhere in the file view to jump to the "Go to file" filter.
  - Branch switching within the explorer: Quickly switch branches while keeping your position in the tree.
  - Dedicated `+` button to create a new file in the active directory.
- **Syntax Highlighting & Auto-Theme**: Code highlighting automatically matches the global light or dark theme with zero user configuration required.
- **Clickable Line Anchors & Permalinks**: Click any line number in the code viewer to jump to that line and automatically copy the permalink (`#L42`) to your clipboard.
- **Git Blame View**: Switch between **Code** and **Blame** tabs to inspect line-by-line history, including commit author, short SHA, commit summary, and relative date.

### 3.1 Online File Creation and Colorful Syntax Highlighting Editor
ProGit features a responsive, full-featured web code editor with live syntax highlighting:
- **Live Colorful Syntax Highlighting**: Real-time Prism-powered syntax highlighting renders as you type with vibrant token palettes (keywords in purple, strings in green, functions in blue, numbers/booleans in orange, tags/properties in coral, and comments in italic gray).
- **Synchronized Typography & Line Numbers**: Pixel-perfect alignment between code line numbers, transparent interactive editing textarea, and syntax underlay.
- **Language Auto-Detection & Override**: The editor automatically detects languages from file extensions (Go, Python, TypeScript, JavaScript, Rust, C, C++, Java, Bash/Shell, SQL, JSON, YAML, HTML, CSS, Markdown, Dockerfile, INI/Config). You can also manually switch syntax highlighters using the **Language** dropdown.
- **Syntax Highlighting Toggle**: Quickly switch between live colorful syntax highlighting and plain text mode with the 1-click **Syntax: Colorful / Plain** toggle.
- **Indentation Controls**: Toggle between 2 spaces and 4 spaces indentation on the fly, with automated Tab key capture.
- **Prettier Code Formatting**: 1-click **Format with Prettier** button standardizes indentation, brackets, JSON syntax, and spacing.
- **Real-Time Coordinates**: Status footer reports live cursor coordinates (`Ln X, Col Y`), total line count, character count, file size, encoding (UTF-8), and auto light/dark theme adaptation.
- **Create New File**: Click **Add file > Create new file** or click the `+` icon in the explorer sidebar. You can type nested paths (e.g. `src/utils/math.js`) and ProGit will automatically create the required directories.
- **Edit Existing File**: In the file view (`FileView`), click the **Edit** (pencil) button. This opens the online editor with the same explorer sidebar, auto-theme matching, line numbers, and a **Preview** tab for Markdown files.

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
- **Public Visibility Without Login**: Pull requests on public repositories are accessible to the public without requiring a login, allowing open-source communities and external developers to browse code reviews, compare diffs, and inspect review comments.
- **Role-Based Merge & Review Security**: The **Merge pull request** button, merge strategy dropdown (Create merge commit, Squash and merge, Rebase and merge), and review changes panel are strictly protected. They are displayed and operable **only** for authenticated users who are:
  1. Repository collaborators / members with write permissions, OR
  2. The original author (requester) of the pull request.
- **Unauthenticated Visitor Experience**: Anonymous visitors browsing a pull request see the complete conversation and diffs, accompanied by an informational banner: `"Pull requests are open for public viewing. Sign in to merge or review this pull request"`.
- **Third-Party Logged-In User Experience**: Authenticated users who are not repository collaborators and not the pull request author see a clear notice: `"Merge options are restricted to repository members and the pull request author"`. Direct API merge attempts from unauthorized users are rejected with `403 Forbidden`.
- **New Pull Request Gating**: The **New pull request** button is visible exclusively to logged-in users. Anonymous visitors see a prompt to log in before creating a pull request.
- **Split Diff vs. Unified Diff**: Use the mode toggle on the review bar to switch between side-by-side **Split Diff** and classic **Unified Diff**.
- **Changed Files Sidebar**: Sticky file list on the left displays all changed files with additions and deletions counts; click any file to jump directly to its diff.
- **Line-by-Line Review**: Logged-in users can click the `+` icon on any line to leave an inline review comment.
- **Auto-Closing Issues**: Referencing issues in PR descriptions or commit messages using `Fixes #X`, `Closes #X`, or `Resolves #X` automatically closes the referenced issues when the PR is merged.
- **Post-Merge Branch Deletion**: Once merged, a 1-click **Delete branch** button is displayed to immediately delete the head branch and keep the repository clean.

---

## 5. Repository Settings & Branch Protection

### 5.1 Branch Protection Rules
Protect important branches like `main` or release branches:
1. Navigate to **Settings > Branch Protection Rules**.
2. Enter the target branch name (e.g., `main`).
3. Configure enforcement rules:
   - **Require pull request before merging**: Blocks direct online commits and non-PR pushes to the branch.
   - **Prevent force pushes**: Blocks destructive force-pushes (`git push --force`) and branch deletion.
4. Click **Save Protection Rule**.

### 5.2 Access Controls & Collaborators
- **Combined Repository Feature Toggle (`Allow Downloads & Pull Requests`)**: Under **Settings > Features**, repository owners and admins can disable **Allow Downloads (ZIP / Clone) & Pull Requests** with a single switch. When disabled:
  - `Write` collaborators, Repo Admins, Repo Owners, and Super Admins retain ZIP download, Git clone/pull, Raw file, and Fork access.
  - `Read`, `View-Only`, and anonymous/public visitors can still browse code in the Web UI, while Download ZIP, Git clone/pull, Raw, `Copy`, and Fork are hidden/blocked (`403 Forbidden`).
  - Pull Requests and branch comparison are disabled repository-wide (`Pull Requests` tab hidden; API returns `403 Forbidden`).
- Grant users `view_only`, `read`, `write`, or `admin` permissions to match their workflow.

---

## 6. Organizations & Team Management

### 6.1 Organization Profile & Editing
- Organizations are accessible directly via `/org/:orgname` or `/:orgname` (e.g. `https://progit.local:3443/acme`).
- Organization owners can update display names, descriptions, locations, and website URLs either via the inline **Edit Organization** modal or the **Settings** tab.
- Quick navigation: Access all your organizations from the top-right user menu under **Your Organizations**.

---

## 7. Account Settings & Authentication

- **SSH Keys**: Go to **Settings > SSH Keys** to register your public key (`id_ed25519.pub`).
- **Personal Access Tokens (PAT)**: Go to **Settings > Access Tokens** to generate tokens for CLI or CI/CD pipelines.
- **Theme Preferences**: Toggle between Dark Mode and Light Mode using the sun/moon icon in the navigation bar.

---

## 6. Project Wiki Documentation

Each ProGit repository includes a built-in, Git-backed wiki for architecture documents, guides, walkthroughs, and roadmaps.

### 6.1 First-Time Wiki Experience (GitHub-Style Onboarding)
When navigating to the **Wiki** tab for a repository that does not yet have any wiki content:
- **Clean Empty State**: ProGit does not automatically generate unneeded files or phantom commits. Instead, users are greeted with a welcoming, GitHub-style onboarding screen:
  - Feature highlights explaining documentation versioning, Markdown support, and offline Git cloning.
  - An informational notice for read-only visitors indicating the wiki has not yet been initialized.
  - A prominent **"Create the first page"** button for repository collaborators with write permissions.
- **One-Click Page Initialization**:
  - Clicking **"Create the first page"** immediately opens the full-featured wiki editor pre-populated with title `"Home"`, slug `"Home"`, and a structured starter template.
  - Saving creates the initial Git commit (`Initial wiki page Home`) authored by the logged-in user and smoothly transitions into the two-column wiki interface.

### 6.2 Browsing & Editing Pages
- Click the **Wiki** tab in the repository header.
- The sidebar lists all pages in the wiki, with instant search filtering.
- Click **New Wiki Page** to draft additional pages with a custom title, slug, and markdown body.
- Use the **Write / Preview** editor tabs with syntax-highlighted markdown to verify formatting before committing.
- Click **History** on any page to view previous revisions, commit hashes, timestamps, and author details.
- Collaborative editing is tracked natively in Git with full commit logs.

### 6.3 Enabling / Disabling Wikis (Repository Settings)
Repository administrators can toggle the Wiki feature on or off according to project needs:
1. Navigate to repository **Settings > Features**.
2. Locate the **Wikis** feature card.
3. Toggle the switch to **Disabled** or **Enabled** and click **Save Changes**.
4. **Behavior when Disabled**:
   - The **Wiki** tab is hidden from repository navigation.
   - Wiki clone URLs (`.wiki.git`) are removed from repository clone dropdowns.
   - All backend wiki API endpoints strictly enforce permissions and return `403 Forbidden` (`Wikis are disabled for this repository`).
   - Re-enabling the wiki at any time immediately restores access to all previously created pages and revision history without data loss.

### 6.4 Offline Editing via Git CLI
The wiki is backed by an independent bare Git repository:
```bash
git clone https://localhost:3443/<owner>/<repo>.wiki.git
# Or via SSH:
git clone ssh://git@progit.local:2222/<owner>/<repo>.wiki.git

cd <repo>.wiki
echo "# Architecture" > Architecture.md
git add Architecture.md
git commit -m "Add architecture guide"
git push origin main
```
Changes pushed over HTTPS or SSH are instantly indexed and reflected in the ProGit Web UI.

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
   - `view_only`: Web UI browsing only — can view code, commits, and issues in browser, but cannot Download ZIP, `git clone`/`git pull`, view Raw, download release assets, or fork.
   - `read`: Read-only access to browse code and clone/download repositories (when allowed by repository settings).
   - `write`: Can edit, create, delete, upload files, push code, download/clone, and open/manage issues and PRs.
   - `admin`: Full administrative control over the repository including settings and collaborator management.
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
- **Teams Tab**: Create developer teams (e.g. `Frontend Engineers`, `DevOps`, `External Auditors`) and assign team-wide default permissions (`view_only`, `read`, `write`, `admin`).
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

## 11. Developer Direct Messaging & Collaboration

ProGit includes a secure, privacy-preserving messaging portal allowing developers to collaborate directly without external tooling:

### 11.1 Recipient Discovery & Anti-Enumeration Protection
To safeguard user privacy and prevent account harvesting or credential scraping:
- **No Account Dumps**: ProGit strictly disallows bulk account listing. User directories are never enumerated in dropdowns.
- **Dynamic Search**: When composing a message, enter a username or numeric User ID. The system dynamically matches active developers and displays a search dropdown.
- **Account Verification**: If a developer account exists, their profile chip and user ID are shown for selection. If no match is found, an explicit `"User does not exist"` alert is presented.
- **Privacy Enforcement**: Unauthenticated requests to developer search endpoints are rejected (`401 Unauthorized`), and queries without search criteria return empty lists.

### 11.2 Message Request & Acceptance Workflow
Direct messages between developers require mutual consent to prevent unsolicited spam and harassment:
1. **Initial Message Request**: When Developer A sends an initial message to Developer B, it enters the **Pending Request** state (`status = 'pending'`).
2. **Review & Consent**: Developer B receives an action banner in their Inbox:
   - **Accept Request**: Confirms the conversation (`status = 'accepted'`), unlocks the **Reply** button, and enables bidirectional messaging.
   - **Decline Request**: Rejects the conversation (`status = 'rejected'`). Developer A is automatically sent a notification that their message request was declined, and further messages from Developer A to Developer B are strictly blocked (`403 Forbidden`).
3. **Status Badges**: Conversations clearly display their state:
   - `Request Pending` (Amber) - Awaiting receiver review.
   - `Accepted` (Emerald) - Mutual conversation active; replies allowed.
   - `Declined` (Red) - Request declined; replies blocked.
4. **Threaded Replies**: Once accepted, either party can reply with automated subject quoting (`Re: ...`).
5. **Inbox & Sent Mailboxes**: Switch between received and sent messages, and delete messages with confirmation.

### 11.3 Platform Feature Toggle (`ENABLE_MESSAGING`)
Server administrators can enable or disable direct developer messaging globally:
- **Configuration**:
  - `conf/app.ini`: Set `[features] ENABLE_MESSAGING = false`
  - Environment Variable: Set `PROGIT_ENABLE_MESSAGING=false` (or `PROGIT_FEATURES_ENABLE_MESSAGING=false`)
- **Seamless UI Adaptation**:
  - When disabled, the navigation envelope icon and unread polling are completely hidden.
  - Direct messaging links in user menus are removed.
  - If a user navigates directly to `/messages`, a dedicated `"Direct Messaging Disabled"` screen is presented.
  - Backend messaging API endpoints return `403 Forbidden` (`{"error": "Direct messaging feature is disabled on this server"}`).
- **Default State**: Enabled (`true`) by default for backward compatibility.

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




