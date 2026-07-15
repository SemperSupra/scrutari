# Discoverability & Rendezvous Analysis

**Date:** 2026-07-15
**Scope:** Scrutari system — SPA, serverless API, Docker components

---

## 1. Architecture Inventory

| Component | Deployment | Network | Discoverable? |
|-----------|-----------|---------|:-------------:|
| SPA (index.html) | Netlify CDN | Public internet | ✅ DNS (scrutari-submit-*.netlify.app) |
| Submit API | Netlify Serverless | Public internet | ✅ Via SPA configuration |
| Classify API | Netlify Edge | Public internet | ✅ Via SPA configuration |
| Analysis API | Netlify Serverless | Public internet | ✅ Via SPA configuration |
| Challenge API | Netlify Serverless | Public internet | ✅ Via SPA configuration |
| Honeypot | Netlify Edge | Public internet | ⚠️ Discoverable via DNS (part of site) |
| Docker submit endpoint | Docker (local) | Localhost:3456 | ❌ Not discoverable |
| Docker ML training | Docker (local) | Local only | ❌ Not discoverable |
| Docker scheduler | Docker (local) | IPC/named volumes | ❌ Not discoverable |
| Dev test server | Python (local) | Localhost:8765 | ❌ Not discoverable |

---

## 2. Discovery Domains Analysis

### 2.1 Local Network (mDNS/Avahi/Bonjour)

**Applicable to:** Docker submit endpoint, Docker ML training

**Scenario:** Multiple researchers running Scrutari Docker instances on the same
local network want to share research data or coordinate baseline runs.

**Battle-tested solutions:**
- **Avahi** (Linux, standard mDNS daemon) — `_scrutari-submit._tcp` service type
- **mDNSResponder** (Bonjour, Apple) — cross-platform
- **Docker DNS** — automatic container name resolution within compose networks

**Analysis:** The submission endpoint already uses environment variables for
configuration (`SUBMISSION_ENDPOINT`, `CLASSIFY_ENDPOINT`). Adding mDNS
discovery would allow instances to find each other without manual IP configuration.

**Recommendation:** ➡ **DEFER** — Low priority for current deployment model.
The standalone Docker endpoint is used on a single machine. Add mDNS if and when
multi-machine deployment occurs.

### 2.2 Public Internet (DNS-based)

**Applicable to:** Well-known Netlify endpoints

**Current state:** The SPA and API endpoints have fixed DNS names:
- `scrutari-submit-1783887159.netlify.app` (auto-generated)
- `leak-detector.scrutari.cloud-ip.cc` (custom domain, CNAME to Netlify)

**Analysis:** Netlify handles TLS termination and DNS routing. The SPA discovers
API endpoints via JavaScript configuration (`window.SUBMISSION_ENDPOINT` and
`localStorage`). This is already working and doesn't need additional discovery.

**Recommendation:** ➡ **IGNORE** — DNS discovery is already in place via Netlify.

### 2.3 Containerized/Virtualized Environments

**Applicable to:** Docker compose, NAT'd/bridged networks

**Scenario:** Docker containers need to discover each other across compose services.

**Current state:** Docker Compose provides automatic DNS-based service discovery
within the compose network. The `docker-compose.scheduler.yml` references services
by name (`weekly-baselines`, `ml-train`, `status-check`). This works.

**Container orchestration options:**
- **Docker Compose DNS** — already used ✅
- **Kubernetes DNS (CoreDNS)** — overkill for current scale
- **Consul** — overkill for current scale
- **etcd** — overkill for current scale

**Recommendation:** ➡ **IGNORE** — Docker Compose DNS handles current needs.
If Kubernetes deployment is needed in the future, CoreDNS provides built-in discovery.

### 2.4 P2P/DHT-based (Nostr, IPFS, libp2p)

**Applicable to:** Decentralized research data exchange

**Analysis:** These would allow Scrutari instances to find each other without
a central registry. Benefits: censorship resistance, offline-first data sharing.
Costs: significant complexity, NAT traversal challenges, key management overhead.

**Battle-tested options:**
- **libp2p** (Protocol Labs) — modular P2P networking stack, used by IPFS and Filecoin
- **IPFS** — content-addressed P2P storage, could share research datasets
- **Nostr** — simple relay-based protocol, could broadcast research findings

**Trade-offs:**
- libp2p: ~500KB bundle, significant integration effort, NAT traversal built-in
- IPFS: ~2MB daemon, great for dataset distribution, poor for real-time comms
- Nostr: lightweight, relay-dependent, simple but no NAT traversal

**Recommendation:** ➡ **DEFER** — Interesting future direction for distributed
research data sharing, but not aligned with current centralized deployment model.

### 2.5 Across VLANs/Subnets

**Applicable to:** Enterprise deployments with network segmentation

**Analysis:** mDNS doesn't cross subnets. For multi-subnet discovery, options are:
- **DNS-SD** (RFC 6763) — DNS-based service discovery, works across subnets
- **Consul** — multi-datacenter service mesh, battle-tested
- **Kubernetes** — built-in cross-node discovery via kube-proxy

**Recommendation:** ➡ **IGNORE** — Enterprise deployment is not a current requirement.

---

## 3. Discovery Domain AAA (Authentication, Authorization, Auditing)

If discovery were implemented, the AAA lifecycle would be:

```
┌─────────────────────────────────────────────────────────────────────┐
│                    DISCOVERY DOMAIN LIFECYCLE                        │
│                                                                     │
│  REGISTRATION                                                        │
│  ├─ Instance generates Ed25519 keypair                              │
│  ├─ Public key registered with discovery domain controller          │
│  ├─ Domain controller issues signed membership token (JWT)          │
│  └─ Token TTL: 24h (configurable)                                  │
│                                                                     │
│  DISCOVERY                                                           │
│  ├─ Instance broadcasts presence via mDNS/DNS-SD                   │
│  ├─ Payload: { instanceId, serviceType, apiVersion, port }         │
│  ├─ Signed with instance private key                                │
│  └─ Receiver verifies signature against domain registry             │
│                                                                     │
│  AUTHENTICATION                                                      │
│  ├─ Mutual TLS (mTLS) between discovered instances                  │
│  ├─ Or: HMAC-signed challenge-response (lighter weight)            │
│  ├─ Domain controller validates token on first connection           │
│  └─ Subsequent connections use cached session keys                  │
│                                                                     │
│  AUTHORIZATION                                                       │
│  ├─ Role-based: admin, researcher, observer                         │
│  ├─ Admin: configure, approve registrations, revoke                 │
│  ├─ Researcher: submit data, query analysis                         │
│  └─ Observer: read-only (view public benchmarks)                    │
│                                                                     │
│  AUDITING                                                            │
│  ├─ Every discovery event logged: { timestamp, instanceId, action } │
│  ├─ Registration/discovery/connection/disconnection recorded        │
│  ├─ Logs forwarded to domain controller for aggregation            │
│  └─ Retention period: 90 days (configurable)                        │
│                                                                     │
│  REVOCATION                                                          │
│  ├─ Instance can revoke its own membership (voluntary exit)        │
│  ├─ Domain controller can revoke any instance (administrative)     │
│  ├─ Revocation list broadcast to all domain members                │
│  └─ CRL TTL: 1 hour (configurable)                                 │
│                                                                     │
│  RENEWAL                                                             │
│  ├─ Membership token auto-renewed at 80% TTL                       │
│  ├─ mDNS announcements re-broadcast every 30s                      │
│  └─ Domain controller verifies instance still active                │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### State Machine for Discovery Domain Membership

```
IDLE → REQUESTING → PENDING_APPROVAL → ACTIVE → EXPIRING → RENEWING → ACTIVE
                                                ↓                    ↓
                                            REVOKED              SUSPENDED
                                                ↓
                                            BANNED
```

Transitions:
- IDLE → REQUESTING: Instance generates keypair, sends registration
- REQUESTING → PENDING_APPROVAL: Domain controller received request
- PENDING_APPROVAL → ACTIVE: Admin approved, token issued
- ACTIVE → EXPIRING: Token at 80% TTL, auto-renew initiated
- EXPIRING → ACTIVE: Token successfully renewed
- ACTIVE → REVOKED: Instance voluntarily left or admin revoked
- REVOKED → BANNED: Instance repeatedly violated policy
- ACTIVE → SUSPENDED: Admin temporarily disabled

---

## 4. Formal Methods for Discovery System

### 4.1 TLA+ for Discovery Protocol

A TLA+ model would verify:
- **Safety:** An unregistered instance cannot discover or be discovered
- **Liveness:** A registered instance eventually discovers all authorized peers
- **Agreement:** All domain members have a consistent view of membership
- **Byzantine tolerance:** A malicious member cannot impersonate another

### 4.2 Model Checking Parameters

```
DomainMembers = {A, B, C}
DiscoveryInterval = 30
TokenTTL = 86400
MaxRevoked = 1
```

### 4.3 Verification Scope

The discovery protocol should be model-checked for:
- No unauthorized discovery (safety invariant)
- Eventually consistent member lists (liveness)
- Revocation propagation within TTL bounds (timeliness)
- Network partition recovery (resilience)

**Recommendation:** ➡ **DEFER** — If discovery is implemented, formal verification
of the protocol should precede deployment.

---

## 5. Configurability

Any discovery implementation must support:
- `DISCOVERY_ENABLED=false` — fully disable discovery
- `DISCOVERY_DOMAIN="scrutari-lab"` — scope discovery to a named domain
- `DISCOVERY_PORT=3456` — override default service port
- `DISCOVERY_INTERFACE="eth0"` — bind to specific network interface
- `DISCOVERY_TTL=30` — mDNS announcement interval (seconds)

All configurable via environment variables with sensible defaults.
Disabled by default — opt-in for security.

---

## 6. Policy Statement

> **Discovery is not applicable to Scrutari's current architecture.**
>
> The system is designed as a browser-based SPA communicating with
> well-known serverless API endpoints over HTTPS. There are no
> peer-to-peer, local-network, or mesh-topology requirements in the
> current architecture.
>
> The Docker-based components (submission endpoint, ML training) run
> on a single host within Docker Compose, which provides automatic
> DNS-based service discovery internally.
>
> If multi-instance deployments become necessary in the future
> (e.g., distributed research data collection across institutions),
> discovery should be implemented using DNS-SD (RFC 6763) for
> local networks with mTLS authentication, and libp2p for
> wide-area P2P discovery. The AAA lifecycle documented in
> Section 3 should serve as the design specification.

---

## 7. Actionable Items

| # | Item | Effort | Recommendation |
|:-:|------|:------:|:--------------:|
| 1 | **mDNS/Avahi for Docker endpoint** | 2 days | **Defer** — add if multi-host deployment occurs |
| 2 | **P2P/libp2p for distributed data** | 2 weeks | **Defer** — interesting but not aligned with current architecture |
| 3 | **DNS-SD across subnets** | 1 week | **Defer** — enterprise requirement, not current |
| 4 | **AAA lifecycle implementation** | 3 weeks | **Defer** — prerequisite for any discovery system |
| 5 | **Formal verification (TLA+)** | 1 week | **Defer** — required before deploying any discovery protocol |
| 6 | **Policy statement** | ✅ Done | Above statement documents that discovery is not applicable |
