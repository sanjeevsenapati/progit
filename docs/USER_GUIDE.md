# ProGit User Guide

Welcome to **ProGit** — a modern, self-hosted Git collaboration platform.

---

## 1. Getting Started

### 1.1 Installation & Super Administrator Setup
1. If this is a fresh instance, navigate to `http://localhost:3000/install`.
2. Configure application parameters and specify the **Super Administrator** username, email, and password.
3. Once completed, the Super Admin account is initialized with full management privileges and access to the **Administration Panel** (`/admin`).
4. Subsequent users can register at `/register` or be created directly by an administrator.

### 1.2 Accessing the Dashboard
The dashboard displays:
- Your repositories and starred projects.
- Recent push, issue, and pull request activity.
- Quick navigation shortcuts.

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
From the repository overview, copy the clone URL:

- **HTTP / HTTPS**:
  ```bash
  git clone http://localhost:3000/<username>/<reponame>.git
  ```
  Authenticate with your ProGit username and password, or a Personal Access Token.

- **SSH**:
  ```bash
  git clone ssh://git@localhost:2222/<username>/<reponame>.git
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

---

## 3. Code Browsing & Navigation

- **File Tree**: Click any folder or file to browse its contents.
- **Syntax Highlighting & Markdown**: Source code is highlighted automatically; Markdown READMEs are formatted with GitHub-style aesthetics.
- **Branch & Tag Selector**: Switch branches or tags using the dropdown at the top of the file tree.
- **Commit History**: Click **Commits** to view the commit timeline and click any commit SHA to inspect unified diffs.

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


