# ProGit OpenID Connect (OIDC) & Single Sign-On Guide (Keycloak & ZTrust)

ProGit OSS includes a built-in, pure-Go **OpenID Connect (OIDC) / OAuth2** authentication engine with **live hot-reload** from the Admin Dashboard — no external OAuth proxy, sidecar, or paid enterprise add-on is required.

This guide walks through configuring and using ProGit SSO with **Keycloak**, **ZTrust IAM**, or any standard OIDC identity provider.

---

## Table of Contents
1. [Prerequisites & Callback URI](#1-prerequisites--callback-uri)
2. [Part 1: Configure Keycloak (v24 / v25 / v26+)](#2-part-1-configure-keycloak-v24--v25--v26)
3. [Part 2: Configure ZTrust IAM](#3-part-2-configure-ztrust-iam)
4. [Part 3: Connect ProGit to Keycloak or ZTrust](#4-part-3-connect-progit-to-keycloak-or-ztrust)
   - [Method A: Admin Web UI (Recommended — Live Hot-Reload)](#method-a-admin-web-ui-recommended--live-hot-reload)
   - [Method B: Configuration File (`app.ini`)](#method-b-configuration-file-appini)
   - [Method C: Environment Variables (Podman / Docker / Kubernetes)](#method-c-environment-variables-podman--docker--kubernetes)
5. [Part 4: How Users Sign In & Use ProGit with SSO](#5-part-4-how-users-sign-in--use-progit-with-sso)
6. [Part 5: Local Podman Pod Testing (ProGit + Keycloak)](#6-part-5-local-podman-pod-testing-progit--keycloak)
7. [Part 6: Security & Troubleshooting](#7-part-6-security--troubleshooting)

---

## 1. Prerequisites & Callback URI

Before configuring your Identity Provider (Keycloak or ZTrust), note your ProGit server's **Root URL** and **Authorized Callback URI**:

| Parameter | Example Value |
| :--- | :--- |
| **ProGit Root URL** | `https://git.yourcompany.com` (or `http://localhost:3000` locally) |
| **Authorized Redirect / Callback URI** | `https://git.yourcompany.com/api/v1/auth/oidc/callback` |
| **Web Origin** | `https://git.yourcompany.com` |
| **Required OIDC Scopes** | `openid email profile` |

> **Important**: The `ROOT_URL` configured in ProGit (`PROGIT_ROOT_URL` or `[server] ROOT_URL` in `app.ini`) must match the exact scheme, hostname, and port that users visit in their browser. ProGit automatically derives the callback URI as `<ROOT_URL>/api/v1/auth/oidc/callback`.

---

## 2. Part 1: Configure Keycloak (v24 / v25 / v26+)

### Step 1: Select or Create a Realm
1. Sign in to the **Keycloak Admin Console** (e.g. `https://sso.yourcompany.com/admin`).
2. Select your target realm (or click the realm dropdown &rarr; **Create realm**, e.g. `progit` or `corporate`).

### Step 2: Create an OpenID Connect Client
1. In the left navigation menu, go to **Clients** &rarr; click **Create client**.
2. **General Settings**:
   - **Client type**: `OpenID Connect`
   - **Client ID**: `progit-client`
   - **Name**: `ProGit`
   - Click **Next**.
3. **Capability config**:
   - **Client authentication**: `ON` *(creates a confidential client with a Client Secret)*
   - **Authentication flow**: Check **Standard flow** (`Authorization Code Flow`).
   - Click **Next**.
4. **Login settings**:
   - **Root URL**: `https://git.yourcompany.com`
   - **Home URL**: `https://git.yourcompany.com`
   - **Valid redirect URIs**: `https://git.yourcompany.com/api/v1/auth/oidc/callback`
   - **Web origins**: `https://git.yourcompany.com` (or `+`)
   - Click **Save**.

### Step 3: Copy Client Secret & Issuer URL
1. Open the **Credentials** tab of `progit-client` and copy the **Client Secret**.
2. Your Keycloak **Issuer URL** is:
   ```text
   https://<your-keycloak-host>/realms/<your-realm>
   ```
   *(Verify discovery works by opening `https://<your-keycloak-host>/realms/<your-realm>/.well-known/openid-configuration` in a browser — it must return valid JSON.)*

### Step 4: Verify User Email Claims
1. Go to **Users** &rarr; select or create a user.
2. Ensure **Email** is populated (e.g. `alice@yourcompany.com`) and **Email verified** is turned `ON`.
3. Under the **Credentials** tab, set a password if testing with local Keycloak users.

---

## 3. Part 2: Configure ZTrust IAM

**ZTrust IAM** is fully OpenID Connect 1.0 compliant and supports automatic endpoint discovery (`/.well-known/openid-configuration`).

### Step 1: Open Your Realm / Tenant in ZTrust Console
1. Sign in to the **ZTrust Admin Console** (e.g. `https://ztrust.yourcompany.com`).
2. Select your organization's **Realm** (e.g. `enterprise` or `prodevans`).

### Step 2: Register ProGit as an OIDC Application / Client
1. Navigate to **Clients / Applications** &rarr; **Create Client** (or **Add Application**).
2. Configure the client settings:
   - **Protocol / Type**: `OpenID Connect (OIDC)`
   - **Client ID**: `progit-client`
   - **Client Authentication / Confidential Access**: `Enabled (ON)`
   - **Standard Flow (Authorization Code)**: `Enabled (ON)`
   - **Valid Redirect URIs**:
     ```text
     https://git.yourcompany.com/api/v1/auth/oidc/callback
     ```
   - **Web Origins**:
     ```text
     https://git.yourcompany.com
     ```
3. Save the client, open the **Credentials** tab, and copy the **Client Secret**.

### Step 3: Note Your ZTrust Issuer URL
Your ZTrust **Issuer URL** follows the standard realm path:
```text
https://<your-ztrust-host>/realms/<your-realm>
```
Verify the discovery endpoint returns JSON:
```bash
curl -s https://<your-ztrust-host>/realms/<your-realm>/.well-known/openid-configuration | head -c 400
```
Confirm the JSON includes `authorization_endpoint`, `token_endpoint`, and `userinfo_endpoint`.

### Step 4: Ensure Email & Profile Scopes Are Assigned
Confirm the `progit-client` has the default `openid`, `email`, and `profile` scopes assigned so ZTrust sends `email`, `preferred_username`, and `name` claims in UserInfo / ID Token.

---

## 4. Part 3: Connect ProGit to Keycloak or ZTrust

You can configure ProGit using any of the three methods below.

### Method A: Admin Web UI (Recommended — Live Hot-Reload)

No container restart or SSH access is required:

1. Sign in to ProGit as an **Administrator** and open **Admin** (`/admin`).
2. Click the **SSO / OIDC** tab.
3. Verify/copy the **Authorized Redirect / Callback URI** shown at the top of the panel.
4. Toggle **Enable OpenID Connect (OIDC) SSO** to **ON**.
5. Fill in the provider form:
   - **Identity Provider**: Select **Keycloak (OIDC Discovery)** or **ZTrust IAM (OIDC Discovery)**.
   - **Login Button Display Name**: e.g. `Sign in with ZTrust` or `Keycloak SSO` *(optional; auto-defaults if blank)*.
   - **Client ID**: `progit-client`
   - **Client Secret**: Paste the secret copied from Keycloak or ZTrust.
   - **Issuer / Discovery URL**:
     - Keycloak: `https://sso.yourcompany.com/realms/progit`
     - ZTrust: `https://ztrust.yourcompany.com/realms/enterprise`
6. Click **Test Discovery** &mdash; ProGit queries `/.well-known/openid-configuration` live and displays a green confirmation along with the resolved Authorization, Token, and UserInfo URLs.
7. *(Optional)* Set **Allowed Email Domains** (e.g. `yourcompany.com`) to restrict logins strictly to corporate email addresses.
8. Ensure **Auto-Provision Users (JIT)** is checked so new SSO users get a ProGit account automatically on their first login.
9. Click **Save OIDC Settings & Apply Live**.

The status badge switches to **Active on /login** immediately, and the SSO button appears on `/login`.

---

### Method B: Configuration File (`app.ini`)

Add or update the `[oidc]` section in `/data/config/app.ini` (or `conf/app.ini`):

#### Keycloak Example
```ini
[oidc]
ENABLED = true
PROVIDER = keycloak
DISPLAY_NAME = Keycloak SSO
CLIENT_ID = progit-client
CLIENT_SECRET = your-keycloak-client-secret
ISSUER_URL = https://sso.yourcompany.com/realms/progit
ALLOWED_DOMAINS = yourcompany.com
AUTO_PROVISION = true
```

#### ZTrust Example
```ini
[oidc]
ENABLED = true
PROVIDER = ztrust
DISPLAY_NAME = ZTrust SSO
CLIENT_ID = progit-client
CLIENT_SECRET = your-ztrust-client-secret
ISSUER_URL = https://ztrust.yourcompany.com/realms/enterprise
ALLOWED_DOMAINS = yourcompany.com
AUTO_PROVISION = true
```

---

### Method C: Environment Variables (Podman / Docker / Kubernetes)

#### Podman / Docker (ZTrust or Keycloak)
```bash
podman run -d \
  --name progit \
  --restart=unless-stopped \
  -p 3443:3443 -p 3000:3000 -p 2222:2222 \
  -v progit-data:/data/db:Z \
  -v progit-repositories:/data/repositories:Z \
  -v progit-config:/data/config:Z \
  -e PROGIT_ROOT_URL="https://git.yourcompany.com/" \
  -e PROGIT_OIDC_ENABLED="true" \
  -e PROGIT_OIDC_PROVIDER="ztrust" \
  -e PROGIT_OIDC_DISPLAY_NAME="ZTrust SSO" \
  -e PROGIT_OIDC_CLIENT_ID="progit-client" \
  -e PROGIT_OIDC_CLIENT_SECRET="your-client-secret" \
  -e PROGIT_OIDC_ISSUER_URL="https://ztrust.yourcompany.com/realms/enterprise" \
  -e PROGIT_OIDC_ALLOWED_DOMAINS="yourcompany.com" \
  -e PROGIT_OIDC_AUTO_PROVISION="true" \
  ghcr.io/sanjeevsenapati/progit:latest
```
*(For Keycloak, set `PROGIT_OIDC_PROVIDER="keycloak"`, `PROGIT_OIDC_DISPLAY_NAME="Keycloak SSO"`, and `PROGIT_OIDC_ISSUER_URL="https://sso.yourcompany.com/realms/progit"`.)*

#### Kubernetes Secret / Deployment Env Snippet
```yaml
env:
  - name: PROGIT_OIDC_ENABLED
    value: "true"
  - name: PROGIT_OIDC_PROVIDER
    value: "ztrust" # or "keycloak"
  - name: PROGIT_OIDC_DISPLAY_NAME
    value: "ZTrust SSO"
  - name: PROGIT_OIDC_ISSUER_URL
    value: "https://ztrust.yourcompany.com/realms/enterprise"
  - name: PROGIT_OIDC_ALLOWED_DOMAINS
    value: "yourcompany.com"
  - name: PROGIT_OIDC_AUTO_PROVISION
    value: "true"
  - name: PROGIT_OIDC_CLIENT_ID
    valueFrom:
      secretKeyRef:
        name: progit-oidc-secret
        key: client-id
  - name: PROGIT_OIDC_CLIENT_SECRET
    valueFrom:
      secretKeyRef:
        name: progit-oidc-secret
        key: client-secret
```

---

## 5. Part 4: How Users Sign In & Use ProGit with SSO

### 1. Web UI Sign-In
1. Navigate to `https://git.yourcompany.com/login`.
2. Click the **Keycloak SSO** or **ZTrust SSO** button above the password form.
3. Authenticate on your organization's Keycloak / ZTrust login screen (including MFA/OTP if enforced by ZTrust or Keycloak).
4. You are redirected back to ProGit and signed directly into `/dashboard`.

### 2. First-Time Account Creation (JIT Provisioning)
- If your email matches an existing ProGit account, ProGit signs you into that existing account automatically.
- If you are signing in for the first time and `AUTO_PROVISION = true`, ProGit automatically creates your user account using `preferred_username` (or email prefix), `email`, and `name`.

### 3. Using Git CLI (`git clone` / `git push`) as an SSO User
Because SSO users authenticate via Keycloak/ZTrust rather than a local ProGit password, use either **SSH Keys** or a **Personal Access Token (PAT)** for Git CLI operations:

- **Option 1 — SSH Keys (Recommended)**:
  1. In ProGit, go to **User Settings &rarr; SSH Keys** and paste your `~/.ssh/id_ed25519.pub`.
  2. Clone via SSH:
     ```bash
     git clone ssh://git@git.yourcompany.com:2222/<owner>/<repo>.git
     ```
- **Option 2 — Personal Access Token (HTTPS Git CLI)**:
  1. In ProGit, go to **User Settings &rarr; Access Tokens** and create a new token.
  2. When running `git clone` / `git push` over HTTPS, enter your ProGit **username** and paste the **Personal Access Token** as the password.

### 4. Emergency Local Admin Fallback
Local password authentication always remains available on `/login` below the SSO button so administrators can always log in and adjust SSO settings even during an identity provider outage.

---

## 6. Part 5: Local Podman Pod Testing (ProGit + Keycloak)

To spin up both ProGit and Keycloak locally in the same Podman pod (sharing `localhost` so OIDC discovery and browser redirects use the exact same URLs):

```bash
# 1. Create a shared Podman pod exposing ProGit (3000/2222) and Keycloak (8080)
podman pod create --name progit-sso-pod -p 3000:3000 -p 3443:3443 -p 2222:2222 -p 8080:8080

# 2. Start Keycloak inside the pod
podman run -d --pod progit-sso-pod --name keycloak \
  -e KC_BOOTSTRAP_ADMIN_USERNAME=admin \
  -e KC_BOOTSTRAP_ADMIN_PASSWORD=admin \
  -e KC_HTTP_ENABLED=true \
  -e KC_HOSTNAME_STRICT=false \
  quay.io/keycloak/keycloak:26.0 start-dev

# 3. Start ProGit OSS inside the same pod
podman run -d --pod progit-sso-pod --name progit \
  -e PROGIT_PROTOCOL="http" \
  -e PROGIT_HTTP_PORT="3000" \
  -e PROGIT_DOMAIN="localhost" \
  -e PROGIT_ROOT_URL="http://localhost:3000/" \
  -e PROGIT_COOKIE_SECURE="false" \
  -e PROGIT_ADMIN_USER="admin" \
  -e PROGIT_ADMIN_EMAIL="admin@progit.local" \
  -e PROGIT_ADMIN_PASSWORD="Admin12345!" \
  ghcr.io/sanjeevsenapati/progit:latest
```

Then open `http://localhost:8080` to create realm `progit` + client `progit-client`, and configure it live inside `http://localhost:3000/admin` &rarr; **SSO / OIDC** using Issuer URL `http://localhost:8080/realms/progit`.

---

## 7. Part 6: Security & Troubleshooting

| Error / Symptom | Root Cause | Resolution |
| :--- | :--- | :--- |
| **`Invalid parameter: redirect_uri`** on Keycloak/ZTrust | Callback URI in IdP does not exactly match ProGit's `ROOT_URL` | Copy the exact **Authorized Redirect / Callback URI** from **Admin &rarr; SSO / OIDC** and paste it into Keycloak/ZTrust **Valid redirect URIs**. |
| **`OIDC authentication expired or state mismatch`** (`invalid_state`) | Cookie blocked due to `COOKIE_SECURE=true` on plain HTTP, or browser/domain mismatch | Ensure `PROGIT_ROOT_URL` matches the URL in your browser address bar. If testing on plain `http://`, set `PROGIT_COOKIE_SECURE="false"`. |
| **`Failed to verify OIDC token`** (`exchange_failed`) | Wrong Client Secret, or ProGit container cannot reach IdP Token URL over the network | Re-copy the **Client Secret** from Keycloak/ZTrust **Credentials** tab. Ensure ProGit container can resolve/reach the IdP host (or mount internal CA cert if using a private corporate CA). |
| **`Your email domain is not authorized`** (`domain_not_allowed`) | User's email domain is not listed in `ALLOWED_DOMAINS` | Add the user's domain to **Allowed Email Domains** in **Admin &rarr; SSO / OIDC**, or leave it blank to allow all domains from your IdP. |
| **`No email address provided by OIDC identity provider`** | User account in Keycloak/ZTrust has an empty email field | Populate the user's **Email** attribute in Keycloak/ZTrust and ensure the `email` scope is attached to the client. |
| **Test Discovery fails inside container with `connection refused` on `localhost:8080`** | ProGit and Keycloak are in separate containers instead of a shared pod/network | Place both containers in the same Podman pod (`--pod`), or use a reachable DNS name/IP instead of `localhost`. |
