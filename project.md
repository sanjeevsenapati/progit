# PROJECT: PROGIT — Modern Self-Hosted Git Hosting & Developer Collaboration Platform

## 1. ROLE AND OBJECTIVE

Act as a Principal Software Architect, Senior Go Engineer, DevOps Engineer, Security Engineer and Senior UI/UX Designer.

Your task is to build **ProGit**, a complete, production-ready, self-hosted Git hosting and source-code collaboration platform.

Use the official Gogs source code as the functional and technical reference and, where appropriate, as the codebase foundation.

Official reference:
https://github.com/gogs/gogs

The objective is to retain and implement ALL meaningful Gogs features while completely modernizing the frontend to deliver a premium, GitHub-like user experience.

Do not simply change the Gogs logo, colors or templates.

Build ProGit as a distinct product with:

- Its own branding.
- Its own modern UI/UX.
- Clean and maintainable Go architecture.
- SQLite as the default database.
- Complete Git repository management.
- Production-grade security.
- Responsive web application.
- Simple installation and deployment.

The finished application must be usable, not just a prototype or collection of static screens.

## 2. FIRST TASK: SOURCE CODE AUDIT

Before making changes:

1. Inspect the entire Gogs source repository.
2. Understand the existing architecture, application entry points, packages, database models, routes, middleware, services, templates and static assets.
3. Identify all implemented features.
4. Identify incomplete features, deprecated components and technical debt.
5. Review existing automated tests.
6. Review the Gogs MIT license and preserve applicable copyright and license notices.
7. Create a feature inventory and implementation mapping.

Create these documents:

- docs/ARCHITECTURE.md
- docs/FEATURE_INVENTORY.md
- docs/IMPLEMENTATION_PLAN.md
- docs/DATABASE_DESIGN.md
- docs/API_DESIGN.md
- docs/SECURITY.md
- docs/DEPLOYMENT.md
- docs/USER_GUIDE.md

Do not start blindly rewriting existing code.

Use working Gogs functionality wherever appropriate. Refactor incrementally without breaking Git compatibility.

## 3. TECHNOLOGY STACK

### Backend

- Go (Golang).
- Use a stable Go version supported by the development environment.
- Modular monolithic architecture.
- REST API.
- Server-side authentication and authorization.
- Native Git command-line integration.
- Background workers for asynchronous operations.

### Database

Default: SQLite.

Requirements:

- SQLite database stored under the configurable data directory.
- Use modernc.org/sqlite or another well-maintained SQLite driver.
- Enable WAL mode.
- Configure appropriate busy timeout.
- Enable foreign key constraints.
- Implement proper transaction management.
- Support database migrations.
- Add database backup and restore functionality.
- Avoid SQLite locking problems through appropriate connection-pool configuration.
- Ensure database migrations are versioned and repeatable.

Keep database access behind a repository/data-access abstraction so PostgreSQL can be supported in the future without rewriting business logic.

SQLite is the default and must work immediately after installation.

### Frontend

Build a modern, responsive GitHub-inspired interface.

Preferred frontend:

- React.
- TypeScript.
- Vite.
- Tailwind CSS.
- Lucide icons.
- Reusable component library.

Use the existing frontend only if it can be cleanly modernized without introducing architectural compromises.

The backend should serve the built frontend assets so ProGit can be deployed as a single application.

### Infrastructure

- Git CLI.
- Linux support.
- macOS support.
- Windows support where practical.
- Docker and Podman compatibility.
- Nginx reverse-proxy compatibility.
- HTTPS support.
- Single-binary deployment wherever practical.

Avoid unnecessary microservices.

## 4. PRODUCT BRANDING AND DESIGN

Product name: ProGit

Positioning:
A lightweight, powerful, self-hosted developer collaboration and Git hosting platform.

Design inspiration:

- GitHub.
- GitLab.
- Modern developer SaaS products.

Do not copy their branding, logos or proprietary assets.

### Design requirements

Build a premium interface with:

- Clean typography.
- Professional spacing.
- Consistent design tokens.
- Modern cards and tables.
- Subtle borders and shadows.
- Rounded but restrained UI elements.
- Clear visual hierarchy.
- Responsive layouts.
- Dark mode and light mode.
- Keyboard-friendly navigation.
- Accessible components.
- Loading states.
- Empty states.
- Error states.
- Toast notifications.
- Confirmation dialogs.
- Skeleton loading.

Use a consistent design system.

### Main navigation

Top navigation:

- ProGit logo.
- Search.
- Dashboard.
- Explore.
- Issues.
- Pull Requests.
- Notifications.
- Create (+).
- User profile menu.

Repository navigation:

- Code.
- Issues.
- Pull Requests.
- Actions (only if implemented).
- Projects (only if implemented).
- Wiki.
- Security.
- Insights.
- Settings.

Do not show nonfunctional navigation items.

## 5. CORE FUNCTIONAL REQUIREMENTS

Implement all Gogs features, organized into the following modules.

### A. Authentication and user management

- User registration.
- Login/logout.
- Email verification.
- Forgot password.
- Password reset.
- Secure password hashing.
- Session management.
- Remember me.
- Two-factor authentication.
- Personal access tokens.
- SSH public key management.
- User profiles.
- Avatars.
- User settings.
- Account deletion.
- Account suspension by administrator.

### B. Dashboard

Create a personalized dashboard containing:

- Recently visited repositories.
- My repositories.
- Starred repositories.
- Assigned issues.
- Open pull requests.
- Recent activity.
- Organization activity.
- Notifications.
- Repository creation shortcuts.

### C. Git repository management

Support:

- Create repository.
- Public/private repositories.
- Internal visibility if supported by the architecture.
- Initialize repository.
- README creation.
- .gitignore templates.
- License templates.
- Repository description.
- Repository topics.
- Fork repository.
- Star/unstar.
- Watch/unwatch.
- Archive/unarchive.
- Transfer ownership.
- Delete repository.
- Repository size and statistics.
- Default branch configuration.
- Branch management.
- Tag management.
- Release management.

### D. Git operations

This is a critical module.

Fully support:

- Git over HTTP.
- Git over HTTPS.
- Git over SSH.
- Clone.
- Fetch.
- Pull.
- Push.
- Branch creation.
- Branch deletion.
- Tag creation.
- Commit history.
- Git references.
- Repository initialization.
- Bare repository storage.
- Git hooks.
- Git garbage collection.

The Git protocol implementation must be reliable.

Use Git's native smart HTTP and SSH capabilities. Never simulate Git operations using database records.

Implement proper authorization before allowing Git upload-pack and receive-pack operations.

### E. Repository code browser

Build a GitHub-like repository browsing experience.

Features:

- File and directory browser.
- Breadcrumb navigation.
- File icons.
- Syntax highlighting.
- Markdown rendering.
- README preview.
- Raw file view.
- File download.
- Copy file contents.
- File history.
- Blame view.
- Commit history.
- Branch selector.
- Tag selector.
- Commit details.
- Diff viewer.
- Compare branches.
- Repository clone URL with HTTPS and SSH tabs.

Provide a polished code browsing experience.

### F. Issues

Implement:

- Create issue.
- Edit issue.
- Close/reopen issue.
- Issue comments.
- Markdown descriptions.
- Labels.
- Milestones.
- Assignees.
- Mention users.
- Issue references.
- Issue templates.
- Issue search.
- Filters.
- Sorting.
- Issue activity timeline.

### G. Pull requests

Implement:

- Create pull request.
- Select source and target branches.
- Branch comparison.
- Changed file listing.
- Unified and split diffs.
- Inline comments.
- Review comments.
- Approve/request changes where supported.
- Merge pull request.
- Close pull request.
- Reopen pull request.
- Merge commit.
- Squash merge.
- Rebase merge.
- Merge conflict detection.
- Pull request activity.
- Review history.

Ensure that merges actually modify Git repositories.

### H. Organizations and teams

- Create organizations.
- Organization profiles.
- Organization repositories.
- Team management.
- Team permissions.
- Team membership.
- Repository access control.
- Organization ownership.
- Organization settings.

### I. Collaboration

- Repository collaborators.
- Read/write/admin permissions.
- Branch protection.
- Protected tags where supported.
- Deploy keys.
- SSH key management.
- Repository webhooks.
- Organization webhooks.
- Webhook delivery history.
- Webhook retry.
- Activity feeds.
- Notifications.
- Email notifications.

### J. Wiki

- Enable/disable wiki.
- Create wiki pages.
- Edit pages.
- Markdown rendering.
- Page history.
- Revision comparison.
- Wiki Git repository integration.

### K. Repository migration and mirroring

Implement:

- Import repository from URL.
- Import from GitHub.
- Import from GitLab.
- Import from other Git servers.
- Import wiki where supported.
- Repository mirroring.
- Scheduled mirror synchronization.
- Mirror status.
- Mirror error reporting.

### L. Web editor

Provide a browser-based editor with:

- Create file.
- Edit file.
- Delete file.
- Create directory.
- Upload files.
- Commit changes.
- Select target branch.
- Markdown preview.
- Syntax highlighting.
- Diff before commit.

### M. Git LFS

Support Git Large File Storage:

- LFS object storage.
- Upload/download.
- Authentication.
- Quota configuration.
- Repository-level settings.

### N. Administration

Build a comprehensive admin dashboard.

Include:

- System overview.
- User management.
- Organization management.
- Repository management.
- Site configuration.
- Email configuration.
- Authentication configuration.
- SSH configuration.
- Git configuration.
- Repository storage settings.
- System logs.
- Audit logs.
- Background jobs.
- Database management.
- Backup and restore.
- Maintenance mode.

### O. Integrations

Preserve Gogs integrations and add a clean integration architecture for:

- SMTP.
- LDAP.
- Reverse proxy authentication.
- OAuth providers.
- GitHub OAuth.
- GitHub Enterprise authentication.
- Webhooks.
- Slack.
- Discord.
- External CI/CD integrations.

Implement only integrations that are actually functional. Clearly document configuration requirements.

### P. API

Build a documented REST API.

Requirements:

- Versioned API (/api/v1).
- Authentication using access tokens.
- Pagination.
- Filtering.
- Consistent JSON responses.
- Proper HTTP status codes.
- Rate limiting.
- OpenAPI/Swagger documentation.

Expose APIs for users, organizations, repositories, issues, pull requests, branches, tags, releases, collaborators, webhooks and notifications.

Maintain compatibility with existing Gogs API behavior where practical.

## 6. DATABASE DESIGN

Use SQLite as the default database.

Review existing Gogs models and migrations before changing the schema.

Organize the data layer into logical entities:

- users
- sessions
- email_addresses
- access_tokens
- two_factor_auth
- ssh_keys
- repositories
- branches and references where database metadata is needed
- collaborators
- organizations
- teams
- team_members
- issues
- issue_comments
- labels
- milestones
- pull_requests
- pull_request_reviews
- pull_request_comments
- releases
- attachments
- webhooks
- webhook_deliveries
- notifications
- activities
- deploy_keys
- protected_branches
- repository_mirrors
- wiki_metadata
- audit_logs
- system_settings

Important:
Git objects, commits, trees and blobs must remain in actual Git repositories. Do not duplicate Git's object database inside SQLite.

Add:

- Foreign keys.
- Appropriate indexes.
- Unique constraints.
- Created/updated timestamps.
- Soft deletion where appropriate.
- Database migrations.

## 7. ARCHITECTURE AND CODE QUALITY

Follow these principles:

- SOLID.
- DRY.
- KISS.
- YAGNI.
- Separation of concerns.
- Dependency inversion.
- Explicit interfaces.
- Testability.
- Secure-by-default design.

Organize the application into logical modules:

- internal/auth
- internal/user
- internal/repository
- internal/git
- internal/issue
- internal/pullrequest
- internal/organization
- internal/team
- internal/webhook
- internal/notification
- internal/mirror
- internal/lfs
- internal/admin
- internal/api
- internal/database
- internal/config
- internal/middleware
- internal/worker

Use a structure that fits the existing codebase rather than forcing unnecessary rewrites.

Avoid:

- Giant controllers.
- Giant service files.
- Circular dependencies.
- Duplicated business logic.
- Global mutable state.
- Hardcoded configuration.
- Unnecessary abstractions.
- Unnecessary dependencies.

## 8. SECURITY REQUIREMENTS

Treat security as a first-class requirement.

Implement:

- Secure password hashing.
- CSRF protection.
- XSS protection.
- SQL injection protection.
- SSRF protection for repository migration and webhooks.
- Path traversal protection.
- Git command argument injection protection.
- Secure session cookies.
- Permission checks at service and API levels.
- Rate limiting.
- Login throttling.
- Secure SSH key validation.
- Audit logging.
- Secret management.
- Secure file upload validation.
- Webhook signature verification.
- Protection against unauthorized repository access.

Never expose private repository data through raw file URLs, Git endpoints or APIs.

Never execute user-provided shell commands.

Use context-aware command execution with timeouts and controlled Git arguments.

## 9. PERFORMANCE AND SCALABILITY

Optimize for lightweight self-hosted deployment.

Requirements:

- Low memory consumption.
- Efficient Git operations.
- Pagination for large datasets.
- Database indexing.
- Connection-pool tuning.
- Background processing.
- Caching where justified.
- Efficient repository statistics.
- Configurable worker concurrency.
- Structured logging.
- Graceful shutdown.
- Health and readiness endpoints.

SQLite must remain suitable for small and medium teams.

Document when PostgreSQL would be preferable for high-concurrency installations.

## 10. DEPLOYMENT AND INSTALLATION

Provide multiple installation options.

### Option 1: Single binary

The user should be able to download ProGit, execute it and access the web interface.

Example:

./progit web

First startup:

- Create data directory.
- Initialize SQLite database.
- Apply migrations.
- Create administrator account through a secure setup wizard.
- Initialize repository storage.
- Start HTTP server.

### Option 2: Podman

Provide:

- Containerfile.
- Podman Compose configuration.
- Persistent volumes.
- Health checks.
- Environment variables.
- Non-root container execution.
- SELinux-compatible volume documentation.

### Option 3: Docker

Provide:

- Dockerfile.
- Docker Compose.
- Persistent database and repository storage.
- Health checks.
- Upgrade instructions.

### Option 4: Linux systemd

Provide:

- Systemd service.
- Dedicated application user.
- Configurable data directory.
- Log management.
- Restart policies.

### Nginx

Provide an example reverse-proxy configuration with:

- HTTP to HTTPS redirection.
- WebSocket support if required.
- Correct forwarded headers.
- Large Git upload support.
- SSH configuration guidance.

## 11. CONFIGURATION

Create a straightforward configuration file.

Example:

[server]
APP_NAME = ProGit
DOMAIN = localhost
HTTP_PORT = 3000
ROOT_URL = http://localhost:3000/
PROTOCOL = http

[database]
TYPE = sqlite3
PATH = ./data/progit.db
WAL_MODE = true

[repository]
ROOT = ./data/repositories

[security]
INSTALL_LOCK = false
SECRET_KEY = CHANGE_ME
COOKIE_SECURE = false

[ssh]
ENABLED = true
PORT = 2222

[mailer]
ENABLED = false
HOST =
USER =
PASSWORD =

[log]
MODE = console
LEVEL = info

Support environment variable overrides.

Never store production secrets in source code.

## 12. UI/UX SCREENS

Create complete working screens for:

1. Login.
2. Registration.
3. Forgot password.
4. User dashboard.
5. Explore repositories.
6. Repository creation.
7. Repository overview.
8. Repository code browser.
9. File viewer.
10. Commit history.
11. Commit details.
12. Branches.
13. Tags.
14. Releases.
15. Issues list.
16. Issue details.
17. Create issue.
18. Pull request list.
19. Pull request details.
20. Pull request comparison and diff.
21. Organization dashboard.
22. Organization repositories.
23. Team management.
24. User profile.
25. User settings.
26. Repository settings.
27. Webhooks.
28. Notifications.
29. Wiki.
30. Administration dashboard.
31. System settings.

Every screen must use real backend data and working API endpoints.

Do not use hardcoded sample data in production screens.

## 13. TESTING

Create a comprehensive test strategy.

### Unit tests

- Authentication.
- Authorization.
- Database repositories.
- Git services.
- Issue management.
- Pull request logic.
- Webhooks.
- API handlers.

### Integration tests

- User registration/login.
- Repository creation.
- Git clone.
- Git push.
- Git pull.
- Branch creation.
- Issue creation.
- Pull request creation.
- Pull request merge.
- Organization permissions.
- Private repository access.
- Webhooks.
- Database migration.

### End-to-end tests

Test complete user workflows using browser automation.

Verify:

- No broken navigation.
- No nonfunctional buttons.
- No fake data.
- No missing API integration.
- No unauthorized data access.
- Responsive behavior.

Add CI checks for:

- gofmt.
- go vet.
- go test.
- Frontend lint.
- Frontend build.
- Security checks.

## 14. DEVELOPMENT EXECUTION STRATEGY

Work incrementally.

Do not attempt a superficial one-shot implementation.

### Phase 1 — Audit and foundation

- Audit Gogs.
- Create feature inventory.
- Finalize architecture.
- Establish ProGit branding.
- Configure SQLite.
- Establish frontend design system.
- Make the application start successfully.

### Phase 2 — Core Git hosting

- Authentication.
- User management.
- Repository creation.
- Git HTTP/HTTPS.
- Git SSH.
- Code browser.
- Branches.
- Commits.
- Tags.

### Phase 3 — Collaboration

- Issues.
- Labels.
- Milestones.
- Pull requests.
- Reviews.
- Merge functionality.
- Organizations.
- Teams.
- Permissions.

### Phase 4 — Advanced features

- Wiki.
- Webhooks.
- Notifications.
- Mirroring.
- Migration.
- Git LFS.
- Deploy keys.
- Protected branches.
- Web editor.

### Phase 5 — Administration and integrations

- Admin dashboard.
- SMTP.
- LDAP.
- OAuth.
- Audit logs.
- Backup and restore.
- API documentation.

### Phase 6 — Production readiness

- Security testing.
- Performance testing.
- E2E testing.
- Container deployment.
- systemd.
- Documentation.
- Upgrade and migration procedures.

## 15. IMPORTANT IMPLEMENTATION RULES

1. Do not stop after creating architecture documents.
2. Do not deliver only UI mockups.
3. Do not replace real functionality with placeholder buttons.
4. Do not remove existing Gogs functionality without a documented reason.
5. Do not break existing Git protocol compatibility.
6. Do not store Git objects in SQLite.
7. Do not use SQLite as a substitute for Git repository storage.
8. Do not introduce microservices without a compelling reason.
9. Do not create unnecessary abstractions.
10. Do not compromise security for convenience.
11. Do not silently ignore errors.
12. Do not mark features completed unless they are implemented and tested.
13. Maintain a feature implementation tracker.
14. Update documentation with every significant architectural change.
15. Preserve the ability to upgrade and migrate existing data where practical.

When migrating an existing Gogs installation, provide a documented and tested migration path. Never modify the original Gogs database or repositories destructively.

## 16. DEFINITION OF DONE

ProGit is considered complete only when:

- The application starts successfully.
- SQLite initializes automatically.
- Administrator setup works.
- Users can register and log in.
- Users can create repositories.
- Git clone works.
- Git push works.
- Git pull works.
- SSH and HTTP/HTTPS access work.
- Repository browsing works.
- Issues work.
- Pull requests work.
- Pull request merges modify real Git repositories.
- Organizations and permissions work.
- Webhooks work.
- Notifications work.
- Administration works.
- Security tests pass.
- Automated tests pass.
- The UI is responsive.
- Dark and light themes work.
- Podman and Docker deployments work.
- Documentation is complete.

## 17. FINAL EXPECTATION

Build ProGit as a complete, modern, production-quality alternative to Gogs.

The user experience should feel familiar to GitHub users while retaining the simplicity and lightweight deployment philosophy of Gogs.

Prioritize functional completeness, code quality, reliability, security and excellent UI/UX.

Start by auditing the repository and producing the feature inventory and architecture documents. Then immediately proceed with implementation.

Do not wait for additional approval after completing each phase. Make reasonable engineering decisions, document them, implement, test and continue.

At the end of each phase:

- Summarize completed functionality.
- List changed files.
- Report tests executed and results.
- List remaining gaps.
- Update the implementation tracker.

Continue working until the application reaches the definition of done.

# 18. MANDATORY PODMAN DEPLOYMENT AND CONTAINER TESTING

Podman is the primary container platform for ProGit development, deployment, integration testing and production validation.

Do not treat Docker as the primary deployment platform.

The project is not considered complete until ProGit has been successfully built, deployed, tested and verified using Podman.

## A. Podman deployment architecture

Build ProGit as a production-ready container image.

Preferred architecture:

- One ProGit application container.
- SQLite database persisted using a Podman volume.
- Git repositories persisted using a separate Podman volume.
- Configuration persisted using a configurable mount.
- Logs accessible through Podman logs.
- Optional Nginx reverse proxy container.

Keep the application lightweight. Do not introduce separate database containers for SQLite.

Container image:
localhost/progit:latest

Container name:
progit

Default HTTP port:
3000

Default SSH port:
2222

Persistent storage:

/data/db
/data/repositories
/data/config
/data/logs

Ensure all data survives container deletion, recreation and image upgrades.

## B. Required Podman files

Create the following project files:

Containerfile
.containerignore
compose.yaml
.env.example

podman/
README.md
build.sh
deploy.sh
stop.sh
restart.sh
update.sh
backup.sh
restore.sh
health-check.sh
test.sh
logs.sh
clean.sh

scripts/
init-db.sh
create-admin.sh
verify-installation.sh

tests/
integration/
e2e/
podman/

Use multi-stage builds.

Build the Go application and frontend in the build stage. The final image should contain only the runtime dependencies.

Use a minimal, trusted runtime base image.

Run the application as a non-root user.

Do not embed secrets in the image.

## C. Podman build

Implement and execute:

podman build --no-cache -t localhost/progit:latest -f Containerfile .

Also support an optimized cached build:

podman build -t localhost/progit:latest -f Containerfile .

Build must:

- Compile the Go backend.
- Build the React frontend.
- Include required static assets.
- Include Git runtime dependencies.
- Validate application configuration.
- Produce a runnable image.

Fix all build errors before proceeding.

## D. Podman deployment

Provide a fully working deployment using:

podman volume create progit-data
podman volume create progit-repositories
podman volume create progit-config

Deploy using compose.yaml where a compatible Compose provider is installed.

Also provide a standalone Podman deployment script that does not require Compose.

Example:

podman run -d
--name progit
--restart=unless-stopped
-p 3000:3000
-p 2222:2222
-v progit-data:/data:Z
-v progit-repositories:/repositories:Z
-v progit-config:/config:Z
localhost/progit:latest

Adapt mount paths and environment variables to the actual application configuration.

Ensure the Git repository storage path and SQLite path are consistent across configuration, deployment and backup scripts.

Support rootless Podman wherever possible.

Account for SELinux volume labeling on SELinux-enabled systems. Document the difference between :Z and :z and avoid disabling SELinux as a deployment workaround.

## E. Health checks

Implement a real application health endpoint:

GET /api/health

GET /api/ready

Health checks must verify:

- HTTP server is responding.
- SQLite database is accessible.
- Database migrations are current.
- Repository storage is accessible.
- Required application services are initialized.

Configure Podman container health checks.

Do not report healthy merely because the process is running.

## F. Mandatory live-container functional tests

After deploying the container, execute tests against the actual running ProGit instance.

Do not rely only on unit tests executed outside the container.

Test the following workflows:

1. Container starts successfully.
2. HTTP endpoint responds.
3. SQLite database initializes.
4. Admin setup works.
5. Administrator can log in.
6. User registration works.
7. User can log in and log out.
8. Repository creation works.
9. Repository is stored in persistent storage.
10. HTTPS/HTTP Git clone works.
11. Git push works.
12. Git pull works.
13. Branch creation works.
14. Commit history displays correctly.
15. Private repository permissions work.
16. Issue creation works.
17. Pull request creation works.
18. Pull request merging works.
19. Organization creation works.
20. Webhook configuration works.
21. Restarting the container preserves data.
22. Recreating the container with the same volumes preserves data.
23. Container health checks report correct status.
24. Backup and restore work.

Use temporary test accounts and test repositories. Never use production credentials.

For Git operations, perform actual Git CLI commands from a separate test container or isolated test environment.

Example workflow:

git init
git add .
git commit
git remote add origin <progit-repository-url>
git push -u origin main
git clone <progit-repository-url>
git pull

Verify that the resulting repository contents and commit history match expectations.

## G. Frontend E2E testing

Run browser automation against the deployed Podman instance.

Use Playwright.

Test:

- Login.
- Dashboard navigation.
- Repository creation.
- Code browsing.
- Branch switching.
- File viewing.
- Issue creation.
- Pull request workflow.
- Settings.
- Dark/light mode.
- Responsive mobile layout.

Take screenshots of major screens.

Fix:

- JavaScript errors.
- Failed API calls.
- Broken routes.
- Missing assets.
- Layout problems.
- Nonfunctional controls.

## H. Container security testing

Validate:

- Non-root execution.
- Read/write access only to required mounted directories.
- No secrets baked into image layers.
- Minimal installed packages.
- No unnecessary exposed ports.
- Secure defaults.
- Correct file ownership.
- SELinux compatibility.
- No privileged container requirement.
- No host PID or host network requirement.

Inspect the built image and running container.

## I. Persistence and recovery testing

This is mandatory.

Perform the following sequence:

1. Create a user.
2. Create a private repository.
3. Push source code.
4. Create an issue.
5. Stop the container.
6. Remove the container.
7. Recreate it using the same persistent volumes.
8. Verify that the user, repository, source code and issue still exist.

Then:

1. Execute backup.sh.
2. Create a clean deployment with new volumes.
3. Restore the backup.
4. Verify repository contents and application metadata.

Backups must maintain consistency between SQLite and repository data. Use an appropriate SQLite backup/checkpoint strategy and ensure repository writes are quiesced or otherwise safely coordinated during backup.

## J. Upgrade testing

Build a new ProGit image version.

Deploy it using the existing persistent volumes.

Verify:

- Database migrations run successfully.
- Existing users can log in.
- Existing repositories remain accessible.
- Git clone/push/pull continue working.
- No existing data is lost.
- Rollback instructions are documented.

Never automatically destroy persistent volumes during updates.

## K. Podman deployment documentation

Create:

docs/PODMAN_DEPLOYMENT.md
docs/PODMAN_TROUBLESHOOTING.md
docs/CONTAINER_SECURITY.md
docs/UPGRADE_AND_BACKUP.md

Document:

- Installation.
- Image building.
- Container deployment.
- Rootless operation.
- Port configuration.
- Persistent volumes.
- SELinux configuration.
- Nginx reverse proxy.
- Logs.
- Health checks.
- Backup and restore.
- Upgrade.
- Rollback.
- Troubleshooting.

## L. Mandatory development execution loop

For every significant development phase, follow this sequence:

1. Implement functionality.
2. Run Go unit tests.
3. Run frontend tests and build.
4. Build the Podman image.
5. Deploy using Podman.
6. Verify container health.
7. Execute integration tests against the running container.
8. Execute relevant Git operations.
9. Inspect application and container logs.
10. Fix failures.
11. Rebuild and redeploy.
12. Repeat until successful.

Do not mark a feature complete merely because the code compiles.

Maintain a test report:

docs/PODMAN_TEST_REPORT.md

Include:

- Image tag.
- Build date.
- Go test results.
- Frontend build results.
- Container status.
- Health-check status.
- Integration test results.
- Git operation test results.
- Persistence test results.
- Backup/restore results.
- Known issues.

## M. FINAL ACCEPTANCE CRITERIA

ProGit must be demonstrably deployable with Podman using a simple documented procedure.

The final deliverable must include:

- Working Containerfile.
- Working compose.yaml.
- Working standalone Podman scripts.
- Persistent SQLite database.
- Persistent Git repository storage.
- Working health checks.
- Successful live-container Git tests.
- Successful persistence tests.
- Successful backup/restore tests.
- Successful browser E2E tests.
- Complete Podman documentation.

Do not claim successful deployment or testing without actually executing the commands and verifying their results.

Podman deployment and live-container testing are mandatory acceptance criteria, not optional enhancements.
