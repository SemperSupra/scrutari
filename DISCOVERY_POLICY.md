# Scrutari Discovery Policy

**Status:** ADOPTED — 2026-07-15
**Scope:** All Scrutari components (SPA, API, Docker, ML)

## Policy Statement

Service discovery is **not applicable** to Scrutari's current architecture.
The system is designed as a browser-based SPA communicating with well-known
serverless API endpoints over HTTPS. There are no peer-to-peer, local-network,
or mesh-topology requirements.

Docker Compose provides automatic DNS-based service discovery for the
containerized components (submission endpoint, ML training, scheduler) via
its built-in network, which is sufficient for the current single-host
deployment model.

## What We Do Instead

| Requirement | Solution |
|-------------|----------|
| SPA discovers API endpoints | JavaScript config (`window.SUBMISSION_ENDPOINT`) + `localStorage` |
| Netlify DNS routing | Netlify-managed TLS + DNS for all public endpoints |
| Docker service discovery | Docker Compose DNS (automatic within compose network) |
| Custom domain | CNAME `leak-detector.scrutari.cloud-ip.cc` → Netlify |

## Configuration Points (Reserved for Future Use)

These environment variables are reserved for future discovery implementations.
They currently have no effect but are documented to ensure forward compatibility.

| Variable | Default | Purpose |
|----------|---------|---------|
| `DISCOVERY_ENABLED` | `false` | Master switch for all discovery features |
| `DISCOVERY_DOMAIN` | `scrutari` | Scope discovery to a named domain/group |
| `DISCOVERY_PORT` | `3456` | Service port for discovery announcements |
| `DISCOVERY_INTERFACE` | `eth0` | Network interface for discovery binding |
| `DISCOVERY_TTL` | `30` | mDNS/DNS-SD announcement interval (seconds) |

## When to Revisit

Discovery should be reconsidered when:
1. Multiple Scrutari instances deployed across different machines
2. Research data sharing between institutions becomes a requirement
3. Enterprise deployment with VLAN segmentation occurs
4. Decentralized/offline-first data collection is needed

## AAA Design (Reference for Future Implementation)

If discovery is implemented, it must follow this lifecycle:

```
REGISTRATION → DISCOVERY → AUTHENTICATION → AUTHORIZATION
  → AUDITING → REVOCATION → RENEWAL
```

See [`docs/discoverability-analysis.md`](docs/discoverability-analysis.md) §3
for the complete AAA lifecycle state machine and transition matrix.

## Related Issues

- [#1](https://github.com/SemperSupra/scrutari/issues/1) — mDNS/Avahi discovery for Docker endpoint (deferred)
- [#2](https://github.com/SemperSupra/scrutari/issues/2) — P2P/libp2p for distributed research data (deferred)
- [#3](https://github.com/SemperSupra/scrutari/issues/3) — DNS-SD discovery across VLANs/subnets (deferred)
- [#4](https://github.com/SemperSupra/scrutari/issues/4) — Discovery protocol formal verification (TLA+) (deferred)
