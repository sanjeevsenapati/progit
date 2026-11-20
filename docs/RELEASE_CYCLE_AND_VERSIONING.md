# ProGit Release Cycle & Version Management Policy

This document defines the formal software release lifecycle, versioning semantics, support policies, and upgrade management guidelines for **ProGit**. It outlines the operational rules governing version number increments, the structural differences between **LTS (Long-Term Support)** and **Non-LTS (Standard / Feature)** releases, maintenance timelines, security backport SLAs, and branching strategies.

---

## 1. Executive Summary & Core Objectives

As an enterprise-grade, single-binary Git collaboration and developer productivity platform, ProGit balances rapid innovation with mission-critical stability. Production environments—including on-premises corporate installations, air-gapped data centers, and multi-cloud Kubernetes clusters—require predictable upgrade paths, zero unexpected breaking changes, and clear support lifecycles.

### Key Tenets
1. **Predictability**: System administrators and DevOps engineers know well in advance when releases occur, what changes they contain, and how long they will receive security updates.
2. **Deterministic Versioning**: Every version string (`MAJOR.MINOR.PATCH[-PRERELEASE]`) communicates exact operational risk and upgrade impact.
3. **Decoupled Innovation vs. Stability**: Teams desiring bleeding-edge developer tools can track standard feature releases, while enterprise teams can standardize on LTS releases with 36 months of guaranteed maintenance.
4. **Automated Migration Guarantees**: Database schemas (pure-Go SQLite WAL) and bare Git storage formats strictly adhere to forward migration guarantees with safe automated rollback boundaries.

---

## 2. Semantic Versioning Specification

ProGit strictly adheres to [Semantic Versioning 2.0.0](https://semver.org/spec/v2.0.0.html) augmented by the **ProGit 10-Minor Rule**.

Versions follow the canonical format:
```
vMAJOR.MINOR.PATCH[-PRERELEASE]
```
*Examples: `v2.0.0-LTS`, `v2.0.1-LTS`, `v2.1.0`, `v2.9.4`, `v3.0.0-LTS`*

```
       v 2  .  1  .  3  -  LTS
         |     |     |      |
         |     |     |      +--- Release Designation (LTS or omitted for Standard)
         |     |     +---------- PATCH: Bug fixes, security patches, perf tuning
         |     +---------------- MINOR: Features, developer tools, non-breaking APIs
         +---------------------- MAJOR: Breaking changes OR 10-Minor boundary rollover
```

### 2.1. PATCH Version Increment (`x.y.Z`)
A patch release increments the third digit (e.g., `2.0.0` -> `2.0.1` -> `2.0.2`).
- **Triggers**:
  - Security vulnerability remediations (CVEs, PenTest findings, VA points).
  - High-priority bug and regression fixes.
  - Performance optimizations and memory footprint reductions.
  - Zero-risk documentation corrections.
- **Constraints**:
  - **Zero Breaking Changes**: Guaranteed drop-in binary replacement.
  - **Zero Database Schema Removals**: No breaking column drops, type changes, or constraint alterations.
  - **Zero API Incompatibilities**: Public REST API parameters and response shapes remain 100% invariant.
  - **Reboot & Replace**: Upgrading a patch version requires simply swapping the binary or updating the container tag.

### 2.2. MINOR Version Increment (`x.Y.0`)
A minor release increments the second digit and resets the patch digit to zero (e.g., `2.0.x` -> `2.1.0` -> `2.2.0`).
- **Triggers**:
  - Introduction of new functional capabilities (e.g., new Developer Toolbox utilities, enhanced PR diffing, new OIDC provider integrations).
  - Additive REST API endpoints and non-breaking response fields.
  - Additive, backward-compatible database schema migrations (e.g., adding nullable columns, indexes).
  - Major UI/UX component enhancements.
- **Constraints**:
  - Full backward compatibility with existing Git CLI workflows, SSH configurations, and API clients.
  - Any deprecated features or configuration keys MUST emit clear runtime deprecation warnings and remain operational for a minimum of **2 minor releases** before removal.

### 2.3. MAJOR Version Increment (`X.0.0`) & The 10-Minor Rule
A major release increments the first digit and resets both minor and patch digits to zero (e.g., `1.19.x` -> `2.0.0`, `2.9.x` -> `3.0.0`).

ProGit implements a strict **10-Minor Version Rollover Rule**:
> **The 10-Minor Rule**: Every 10 minor versions (cycles `x.0` through `x.9`), ProGit **MUST** increment the MAJOR version number on the subsequent release.  
> Following `x.9.y`, the next release is strictly designated as **`(x+1).0.0`**, never `x.10.0`.

#### Rationale for the 10-Minor Rule
1. **Prevents Version Drift**: Uncapped minor versioning (e.g., `v1.27.0`) obfuscates generational architectural progress and creates cognitive fatigue for enterprise procurement and auditing teams.
2. **Predictable Architectural Milestones**: A cycle of 10 minor releases represents a comprehensive generational evolution of the platform. Incrementing the major number provides a predictable cadence for comprehensive security audits, dependency tree modernizations, and platform performance baselines.
3. **LTS Anchor**: Every major release boundary (`2.0.0-LTS`, `3.0.0-LTS`, `4.0.0-LTS`) serves as an official enterprise Long-Term Support baseline.

---

## 3. LTS vs. Non-LTS Releases: Comprehensive Comparison

ProGit provides two distinct release tiers tailored to different organizational requirements:

| Dimension | Long-Term Support (LTS) | Non-LTS (Standard / Feature) |
| :--- | :--- | :--- |
| **Release Identifier** | Suffixed with `-LTS` (e.g., `2.0.0-LTS`, `2.0.1-LTS`) | Standard SemVer (e.g., `2.1.0`, `2.2.0`) |
| **Release Frequency** | At every MAJOR version milestone (approx. every 18–24 months) | Monthly to bi-monthly feature releases |
| **Total Support Lifetime** | **36 Months (3 Years)** | **6 Months** |
| &mdash; *Active Support* | 24 Months: Bug fixes, security patches, perf fixes | 6 Months: Active feature improvements & bug fixes |
| &mdash; *Maintenance Support* | 12 Months: Critical & High CVE security patches only | 0 Months: Superseded immediately by next minor release |
| **Target Deployment** | Mission-critical production, financial, healthcare, government, air-gapped | Early adopters, development teams, agile environments |
| **Allowed Changes** | Strictly bug fixes, security remediations, zero new features | New features, UI overhauls, additive APIs |
| **API / ABI Stability** | 100% frozen; guaranteed stable for 36 months | Backward-compatible; deprecation notices permitted |
| **Database Migration** | Zero destructive migrations; guaranteed safe upgrades | Automatic additive migrations |
| **Security SLA** | Critical CVE: **< 48 hours**<br>High CVE: **< 7 days** | Resolved in next planned minor/patch release |
| **Container Tags** | `ghcr.io/sanjeevsenapati/progit:2.0.0-LTS`<br>`ghcr.io/sanjeevsenapati/progit:2.0-lts`<br>`ghcr.io/sanjeevsenapati/progit:2-lts` | `ghcr.io/sanjeevsenapati/progit:2.1.0`<br>`ghcr.io/sanjeevsenapati/progit:latest` |
| **Upgrade Requirement** | Infrequent: Upgrade within 3-year support window | Frequent: Upgrade every 1-2 months to maintain support |

---

## 4. Release Lifecycle & Support Matrix

```
Timeline (Months) --->
0        6        12       18       24       30       36       42
+--------+--------+--------+--------+--------+--------+--------+
| ProGit 2.0.0-LTS (Active Support: 24 Mo)   | Maint (12 Mo)   | [EOL]
+--------------------------------------------+-----------------+
         | ProGit 2.1.0 (6 Mo) | [EOL]
                  | ProGit 2.2.0 (6 Mo) | [EOL]
                           | ...
                                    +--------------------------------------------+
                                    | ProGit 3.0.0-LTS (Active Support: 24 Mo)   |
                                    +--------------------------------------------+
```

### 4.1. Lifecycle Stages

1. **Development & Feature Freeze**:
   - Features undergo unit testing, integration testing, and static analysis on `main`.
   - 2 weeks prior to release, a release branch `release/vX.Y` is cut, and feature freeze takes effect.
   - Release Candidates (`vX.Y.0-rc.1`) are published for staging validation and pen testing.
2. **Active Support Phase**:
   - The release receives continuous maintenance, performance optimizations, and bug fixes.
   - For LTS releases, Active Support lasts **24 months**.
   - For Standard releases, Active Support lasts **6 months**.
3. **Maintenance Support Phase (LTS Only)**:
   - Months 25 through 36 of the LTS lifecycle.
   - No feature enhancements or non-essential bug fixes are backported.
   - Exclusively reserved for Critical (CVSS >= 9.0) and High (CVSS >= 7.0) security vulnerability remediations and operating system/kernel compatibility patches.
4. **End of Life (EOL)**:
   - Release reaches end of lifecycle. No further patches, security fixes, or container builds are provided.
   - Users are advised to upgrade to the latest active LTS release.

---

## 5. Branching Strategy & Release Engineering

ProGit utilizes a robust Git workflow ensuring total isolation between forward development and production maintenance:

```
                  v2.0.0-LTS     v2.0.1-LTS     v2.0.2-LTS
                       |              |              |
release/v2.0-lts  -----+--------------+--------------+-----> (LTS Maintenance: 36 Months)
                      /              /              / (Cherry-picked security fixes)
                     /              /              /
main  --------------+--------------+--------------+-----> (Active Development: v2.1, v2.2...)
                                  \
release/v2.1                       +--------> (Standard Minor Release: 6 Months)
                                   v2.1.0
```

### 5.1. Branch Hierarchy
- **`main`**: The primary integration branch for ongoing development. All pull requests are merged here. Always in a buildable, tested state.
- **`release/vX.Y[-lts]`**: Dedicated maintenance branches cut for each major/minor release. Only cherry-picked bug fixes, vulnerability mitigations, and doc fixes are merged into these branches.
- **Release Tags**:
  - Annotated and cryptographically signed tags (e.g., `v2.0.0-LTS`, `v2.1.0`).
  - Formatted with comprehensive release notes, changelog digests, and multi-platform build SHA256 checksums.

### 5.2. Multi-Platform Artifact Distribution
Every tagged release triggers multi-platform cross-compilation with zero CGO dependencies via `scripts/build-release.sh`:

1. **Standalone Binaries**:
   - `progit_${VERSION}_darwin_arm64.tar.gz` (Apple Silicon macOS)
   - `progit_${VERSION}_darwin_amd64.tar.gz` (Intel macOS)
   - `progit_${VERSION}_linux_amd64.tar.gz` (Linux x86_64)
   - `progit_${VERSION}_linux_arm64.tar.gz` (Linux AArch64)
   - `progit_${VERSION}_windows_amd64.zip` (Windows 64-bit)
   - `progit_${VERSION}_windows_arm64.zip` (Windows ARM64)
   - `checksums.txt` (Cryptographic SHA-256 digests)

2. **OCI Container Images (`ghcr.io/sanjeevsenapati/progit`)**:
   - Fully qualified LTS tags: `ghcr.io/sanjeevsenapati/progit:2.0.0-LTS`
   - Minor track tags: `ghcr.io/sanjeevsenapati/progit:2.0.0`, `ghcr.io/sanjeevsenapati/progit:2.0`
   - Production stable alias: `ghcr.io/sanjeevsenapati/progit:latest`

---

## 6. Security Vulnerability Response & SLA

ProGit maintains a dedicated Vulnerability Assessment and Patching Policy:

### 6.1. Response SLA by Severity
| Severity Level | CVSS v3.1 Range | LTS Backport SLA | Non-LTS SLA |
| :--- | :--- | :--- | :--- |
| **Critical** | 9.0 – 10.0 | **Within 48 hours** | Within 48 hours (latest release) |
| **High** | 7.0 – 8.9 | **Within 7 days** | Next scheduled patch/minor |
| **Medium** | 4.0 – 6.9 | Next scheduled monthly patch | Next scheduled minor |
| **Low** | 0.1 – 3.9 | Addressed in regular maintenance | Addressed in regular maintenance |

### 6.2. Security Patch Protocol
1. **Triaging**: Vulnerability reports received via security channels are triaged and assigned an internal tracking ID (`VA-XXX`).
2. **Private Remediation**: Fix is developed and tested against regression suites in an isolated workspace.
3. **Simultaneous Backporting**: Fix is applied to `main` and cherry-picked into all supported LTS branches (e.g., `release/v2.0-lts`).
4. **Out-of-Band Release**: Release is tagged (e.g., `v2.0.1-LTS`), container images are pushed to `ghcr.io`, and a public Security Advisory is published detailing the remediation without exposing exploit payloads.

---

## 7. Upgrade Guidelines for Administrators

### 7.1. Upgrading Between Patch Versions (e.g., `2.0.0-LTS` -> `2.0.1-LTS`)
Patch upgrades are 100% backward-compatible and require zero downtime when running behind an HA reverse proxy:
```bash
# Container update (Podman / Docker)
podman pull ghcr.io/sanjeevsenapati/progit:2.0-lts
podman stop progit && podman rm progit
./podman/deploy.sh
```

### 7.2. Upgrading Between Minor Versions (e.g., `2.0.x` -> `2.1.0`)
Minor releases may include additive database migrations. ProGit automatically checks and executes pending migrations in WAL mode on startup:
```bash
# 1. Create backup
./podman/backup.sh

# 2. Deploy updated release
podman pull ghcr.io/sanjeevsenapati/progit:2.1.0
./podman/update.sh
```

### 7.3. Upgrading Across Major LTS Releases (e.g., `2.0.0-LTS` -> `3.0.0-LTS`)
Upgrading across major LTS boundaries should follow the standard verification procedure:
1. Verify system requirements and release notes for any deprecated CLI options.
2. Execute a full offline backup using `./podman/backup.sh`.
3. Test staging deployment with restored data.
4. Apply the update to production during a scheduled maintenance window.

---

## 8. Summary Checklist for Release Engineers

When cutting any release:
- [ ] Determine version scope:
  - Bug fixes / security patches only $\rightarrow$ increment **PATCH** (`x.y.Z`).
  - New features / tools / non-breaking changes $\rightarrow$ increment **MINOR** (`x.Y.0`).
  - 10th minor cycle boundary reached (`x.9.y`) $\rightarrow$ rollover to **MAJOR** (`(x+1).0.0`).
- [ ] For Major releases, evaluate LTS criteria and append `-LTS` suffix if designated.
- [ ] Update `VERSION` file and `CHANGELOG.md`.
- [ ] Run full test suites: unit tests, penetration tests, UI builds.
- [ ] Execute `scripts/build-release.sh <VERSION>` to produce multi-platform archives and `checksums.txt`.
- [ ] Push signed Git tag: `git push origin v<VERSION>`.
- [ ] Publish container images to GitHub Container Registry (`ghcr.io/sanjeevsenapati/progit`).
- [ ] Publish GitHub Release with release notes, binary archives, and SHA-256 checksums.

---
*ProGit Release Engineering &bull; Document Version 1.0 &bull; Effective Date: November 20, 2026*
