# Scrutari CI/CD — Local Development Guide

## Overview

We conserve GitHub Actions minutes (exhausted until 2026-08-01) by running
CI entirely locally. The CI pipeline validates every commit before merge.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Git Bash (Windows)                        │
│                                                             │
│  bash ci-local.sh ci                                        │
│       │                                                     │
│       ├── WSL2 available? ──► wsl -d ubuntu -- act ...     │
│       │                        (Docker, full GitHub Actions) │
│       │                                                     │
│       └── No WSL2/Docker ──► Runs tests directly            │
│                               (no Docker, no containers)     │
│                                                             │
│  node --test "test/**/*.test.mjs"    ◄── Fastest: 2s        │
└─────────────────────────────────────────────────────────────┘
```

### Paths

| Context | How act runs | Docker connection |
|---------|-------------|-------------------|
| **WSL2 Ubuntu** | `act` natively | `unix:///var/run/docker.sock` (native) |
| **Git Bash** | Delegates to `wsl.exe -d ubuntu -- act` | Same — forwarded into WSL2 |
| **Direct runner** | No Docker, runs directly on host | N/A |

## Quick Start

```bash
# Full CI pipeline (test + lint + Python ML + OPSEC regression)
bash ci-local.sh ci

# Individual jobs
bash ci-local.sh test       # 52 unit tests across 9 suites
bash ci-local.sh lint       # Git hygiene, Docker SHA, IPv4 checks
bash ci-local.sh python-ml  # Python ML import verification
bash ci-local.sh opsec      # OPSEC regression (13 invariants)
```

## What the CI Validates

### test job
- All 52 unit tests across 9 test suites
- IPv6 normalization (18 cases)
- Rate limiter correctness (7 cases)
- Schema validation (8 cases)
- Honeypot privacy (6 cases)
- OPSEC invariants (13 cases)

### lint job
- `.gitignore` hygiene — no `package.json` exclusion
- Docker SHA pinning — no unpinned `FROM` lines
- IPv4 hardcoding — avoids `127.0.0.1` as base URL in IPv6 test files

### python-ml job
- Python dependencies import correctly (numpy, sklearn, onnx)
- Non-fatal if deps not installed locally

### ipv6-test job
- Playwright-based IPv6 connectivity suite (5 tests)
- Validates SPA works over `[::1]` (IPv6 loopback)
- Requires IPv6 on the host

## Docker Setup (WSL2)

Docker Engine runs natively inside WSL2 Ubuntu (not Docker Desktop).
The daemon is configured with two listeners:

```
/etc/systemd/system/docker.service.d/tcp.conf:
  ExecStart=/usr/bin/dockerd -H fd:// -H tcp://127.0.0.1:2375 ...
```

- `unix:///var/run/docker.sock` — accessed natively from WSL2
- `tcp://127.0.0.1:2375` — forwarded to Windows via WSL2 localhost proxy

The `act` runner images are already cached:
- `catthehacker/ubuntu:runner-latest`
- `catthehacker/ubuntu:act-24.04`

## Configuration Files

| File | Purpose |
|------|---------|
| `.github/workflows/ci.yml` | CI workflow (GitHub Actions) |
| `.github/workflows/weekly-baselines.yml` | Weekly baseline collection |
| `ci-local.sh` | Local CI runner (auto-detects environment) |
| `Makefile` | Make targets for CI (fallback runner) |
| `~/.config/act/actrc` | act configuration (WSL2) |

## When GitHub Actions Minutes Return

The `.github/workflows/ci.yml` and `weekly-baselines.yml` workflows
will run automatically on push/PR and weekly schedules after minutes
reset (2026-08-01). No changes needed — they've been validated
locally via act.

## Troubleshooting

**"Could not find test files":** The act container's bash doesn't
expand `**` globs by default. The workflow uses `shopt -s globstar`
to enable this. If you add a new workflow file, include the same.

**Docker connection refused:** Ensure the WSL2 Docker daemon is
running with TCP listener:
```bash
wsl -d ubuntu -- sudo service docker restart
wsl -d ubuntu -- ss -tlnp | grep 2375
```

**Path not found when forwarding to WSL2:** The ci-local.sh converts
MSYS2 paths (`/c/Users/...`) to WSL2 paths (`/mnt/c/Users/...`)
automatically. If you add new path-sensitive code, ensure the
conversion handles your case.
