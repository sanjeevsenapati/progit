# ProGit Kubernetes Deployment Guide

This guide details how to deploy, manage, and scale ProGit (v1.8.0) on Kubernetes clusters (EKS, GKE, AKS, k3s, OpenShift, KinD, Minikube) as well as locally using Podman's native `podman kube play` capability.

ProGit is packaged as a lightweight, single-binary sovereign Git collaboration platform. In Kubernetes, it runs securely as a rootless pod (UID:GID 1000:1000) with dedicated Persistent Volume Claims for bare repository storage and high-speed SQLite database engine (WAL mode).

---

## 1. Kubernetes Architecture Overview

ProGit's Kubernetes deployment architecture consists of standard, composable Kubernetes API resources:

```
                          Internet / Developers
                                    │
                                    ▼
                         ┌──────────────────────┐
                         │   Ingress Controller │ (nginx-ingress / traefik)
                         │ (TLS / proxy-body)   │
                         └──────────┬───────────┘
                                    │ (ClusterIP)
                         ┌──────────▼───────────┐
                         │   Service: progit    │ Ports: 3000 (HTTP), 3443 (HTTPS), 2222 (SSH)
                         └──────────┬───────────┘
                                    │
                         ┌──────────▼───────────┐
                         │   Deployment: progit │ Strategy: Recreate
                         │   (UID/GID: 1000)    │
                         └──────────┬───────────┘
                                    │ Mount /data
                         ┌──────────▼───────────┐
                         │   PVC: progit-data   │ (ReadWriteOnce - 10Gi+)
                         │ (DB WAL + Git Repos) │
                         └──────────────────────┘
```

### Key Architectural Highlights:
1. **Deployment Strategy (`Recreate`)**:
   - ProGit uses an embedded SQLite WAL database and filesystem-level bare Git repositories stored at `/data`.
   - The `Recreate` deployment strategy guarantees that the terminating pod fully releases SQLite locks and detaches the `ReadWriteOnce` persistent volume before the new pod mounts and initializes the database.
2. **Rootless Security Context**:
   - ProGit enforces non-root execution (`runAsUser: 1000`, `runAsGroup: 1000`, `fsGroup: 1000`), complying with Kubernetes Pod Security Standards (Restricted).
3. **Dual Liveness & Readiness Probes**:
   - **Readiness (`/api/ready`)**: Verifies internal HTTP router initialization and basic responsiveness.
   - **Liveness (`/api/health`)**: Actively validates the SQLite database connection, WAL lock integrity, and Git repository directory accessibility.
4. **Git Buffer Sizing**:
   - Ingress annotations configure `proxy-body-size: "1024m"` and 1800-second timeouts to support pushing and fetching multi-gigabyte Git repositories without stream truncation.

---

## 2. Directory Layout & Manifests

The Kubernetes manifests are located in `deploy/k8s/`:

```
deploy/k8s/
├── progit-deployment.yaml   # Unified Kubernetes manifest (PVC, ConfigMap, Secret, Deployment, Service, Ingress)
├── kustomization.yaml       # Kustomize manifest for overlays and environment tailoring
└── test-podman-kube.sh      # Automated Podman 'kube play' end-to-end integration test
```

### Component Breakdown:
| Resource Kind | Name | Purpose |
| :--- | :--- | :--- |
| `PersistentVolumeClaim` | `progit-data-pvc` | 10Gi+ persistent volume mounted at `/data` (`/data/db`, `/data/repositories`, `/data/config`) |
| `ConfigMap` | `progit-config` | Application name, domain, default branch, listening ports, and system paths |
| `Secret` | `progit-secrets` | Administrative seed credentials and sovereign application secret key |
| `Deployment` | `progit` | 1-replica sovereign controller running `localhost/progit:1.8.0` or `ghcr.io/sanjeevsenapati/progit:1.8.0` |
| `Service` | `progit-service` | ClusterIP service routing ports 3000 (HTTP), 3443 (HTTPS), and 2222 (SSH) |
| `Ingress` | `progit-ingress` | Ingress routing for `progit.local` with large Git push buffer optimizations |

---

## 3. Local Testing with Podman (`podman kube play`)

Podman features native support for deploying and testing standard Kubernetes YAML manifests without spinning up a heavy Kubernetes cluster.

### 3.1 Automated Verification Script
Run the automated test script included in the repository:
```bash
./deploy/k8s/test-podman-kube.sh
```

The script automatically executes:
1. Prior test pod cleanup (`podman kube down`).
2. Pod and volume provisioning (`podman kube play deploy/k8s/progit-deployment.yaml`).
3. Readiness polling against `https://localhost:3443/api/health`.
4. JSON payload validation (verifying `"database":"healthy"`).
5. Prometheus metrics inspection (verifying `progit_info` and runtime counters).
6. In-container diagnostic doctor execution (`podman exec progit-pod-progit /usr/local/bin/progit doctor`).
7. Autonomous database maintenance API test (`POST /api/v1/admin/maintenance`).
8. Graceful teardown (`podman kube down`).

### 3.2 Manual Podman Kube Workflow

#### 1. Launch the Deployment:
```bash
podman kube play deploy/k8s/progit-deployment.yaml
```

#### 2. Inspect Running Pods and Containers:
```bash
podman pod ps
podman ps --filter "pod=progit-pod"
```

#### 3. Test Endpoints:
```bash
# Health check
curl -k https://localhost:3443/api/health

# Prometheus metrics
curl -k https://localhost:3443/metrics | head -n 15

# Run Self-Diagnostics
podman exec -it progit-pod-progit /usr/local/bin/progit doctor
```

#### 4. Clean Up:
```bash
podman kube down deploy/k8s/progit-deployment.yaml
```

---

## 4. Production Kubernetes Deployment

### 4.1 Prerequisites
- Kubernetes cluster 1.24+ (k3s, EKS, GKE, AKS, or bare metal).
- `kubectl` configured with cluster administrator or namespace access.
- Ingress controller installed (e.g., `ingress-nginx`).
- Default `StorageClass` configured for dynamic PVC provisioning.

### 4.2 Step-by-Step Deployment

#### 1. Customize Secrets
Create your production secret with secure credentials:
```bash
kubectl create secret generic progit-secrets \
  --from-literal=PROGIT_SECRET_KEY="$(openssl rand -hex 32)" \
  --from-literal=PROGIT_ADMIN_USER="admin" \
  --from-literal=PROGIT_ADMIN_PASSWORD="StrongProductionPassword123!" \
  --from-literal=PROGIT_ADMIN_EMAIL="admin@yourdomain.com" \
  --dry-run=client -o yaml | kubectl apply -f -
```

#### 2. Apply Manifests with Kustomize or Kubectl
Using Kustomize:
```bash
kubectl apply -k deploy/k8s/
```
Or directly:
```bash
kubectl apply -f deploy/k8s/progit-deployment.yaml
```

#### 3. Monitor Deployment Rollout:
```bash
kubectl rollout status deployment/progit
kubectl get pods -l app.kubernetes.io/name=progit
kubectl get pvc -l app.kubernetes.io/name=progit
```

#### 4. View Application Logs:
```bash
kubectl logs -f deployment/progit -c progit
```

---

## 5. Ingress & TLS Configuration

For production environments with Let's Encrypt via `cert-manager`:

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: progit-ingress
  annotations:
    kubernetes.io/ingress.class: nginx
    cert-manager.io/cluster-issuer: letsencrypt-prod
    nginx.ingress.kubernetes.io/proxy-body-size: "1024m"
    nginx.ingress.kubernetes.io/proxy-read-timeout: "1800"
    nginx.ingress.kubernetes.io/proxy-send-timeout: "1800"
spec:
  tls:
    - hosts:
        - git.example.com
      secretName: progit-tls-cert
  rules:
    - host: git.example.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: progit-service
                port:
                  number: 3000
```

---

## 6. SSH Exposure in Kubernetes

Git over SSH operates over TCP port 2222. In Kubernetes, configure SSH access using one of the following methods:

### Method A: NodePort Service
Expose port 2222 directly on cluster nodes:
```yaml
apiVersion: v1
kind: Service
metadata:
  name: progit-ssh-nodeport
spec:
  type: NodePort
  selector:
    app.kubernetes.io/name: progit
  ports:
    - name: ssh
      port: 2222
      targetPort: 2222
      nodePort: 32222
```

### Method B: Ingress-Nginx TCP Streams
Configure `ingress-nginx` to route external port 22 or 2222 directly to `progit-service:2222`:
```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: tcp-services
  namespace: ingress-nginx
data:
  2222: "default/progit-service:2222"
```

---

## 7. Operational Runbook & Diagnostics

### Running Self-Diagnostic Doctor
Run ProGit's built-in self-diagnostic doctor inside the Kubernetes pod:
```bash
kubectl exec -it deployment/progit -- /usr/local/bin/progit doctor
```

### Executing Autonomous Database Maintenance
Trigger SQLite WAL checkpoint and query planner optimization:
```bash
kubectl exec -it deployment/progit -- progit admin maintenance --optimize
```

### Backup & Disaster Recovery
Create an atomic, non-blocking backup of the live SQLite database and bare repositories:
```bash
# 1. Vacuum online database into snapshot
kubectl exec deployment/progit -- sqlite3 /data/db/progit.db "VACUUM INTO '/data/db/backup.sqlite';"

# 2. Copy backup out of the cluster pod
kubectl cp $(kubectl get pod -l app.kubernetes.io/name=progit -o jsonpath='{.items[0].metadata.name}'):/data/db/backup.sqlite ./progit-backup.sqlite
```

---

## 8. Summary Checklist

| Requirement | Recommendation | Validated |
| :--- | :--- | :---: |
| Container Image | `localhost/progit:1.8.0` or `ghcr.io/sanjeevsenapati/progit:1.8.0` | [✓] |
| Storage Mode | Persistent Volume Claim (`ReadWriteOnce`, 10Gi+) | [✓] |
| Deployment Strategy | `Recreate` (strictly prevents concurrent SQLite writers) | [✓] |
| Security Context | `runAsUser: 1000`, `fsGroup: 1000` (rootless) | [✓] |
| Health Probes | `/api/health` (Liveness) & `/api/ready` (Readiness) | [✓] |
| Git Buffer Size | `proxy-body-size: "1024m"`, `proxy-timeout: "1800s"` | [✓] |
| Podman Compatibility | `podman kube play` and `podman kube down` | [✓] |

