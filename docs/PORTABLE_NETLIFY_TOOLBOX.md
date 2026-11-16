# Scrutari portable Netlify toolbox — Windows PowerShell 5.1

**Purpose:** Install a repeatable Node.js + npm + Netlify CLI toolchain without Administrator rights, a global npm installation, Docker Desktop, or permanent PATH/registry changes.

## Pinned releases

- Node.js **v24.22.3**, Windows x64 ZIP SHA-256 `e612af99f626ab415ea225af6bce5c971feb448cb5cae250bb1c3fa50c5f7d9f` (Windows ARM64 ZIP SHA-256 `b3cc74a295b39d4f273271e96f58c06dd2b35757ca12abec64c7d0598b434f14`), from nodejs.org.
- Netlify CLI **27.19.0** as an **exact** local npm dependency. First install creates `package-lock.json` with transitive package integrities; `Rebuild` uses `npm ci` for repeatability.

## Layout

By default, `%USERPROFILE%\Projects\scrutari-netlify-toolbox`:

| Layer | Directory | Lifecycle |
| --- | --- | --- |
| Durable desired state | `toolbox-manifest.json`, `packages\netlify-cli\package.json`, `package-lock.json` | Keep and version in Git for recovery |
| Disposable toolchain | `toolchains\node-v24.22.3-win-x64\` | Rebuild from official checksum-pinned ZIP |
| Disposable application | `packages\netlify-cli\node_modules\` | Rebuild using lockfile |
| Disposable cache and scratch | `cache\`, `runs\` | `Clean` removes these |
| **Separate persistent authentication** | `state\auth\` | Kept intentionally; do not commit/share |

Netlify CLI login may leave an OAuth credential in the isolated `state\auth` profile. Protect this folder like a password. The script temporarily redirects profile/config directories for its child tools and restores the original Windows environment afterwards. It does not inspect or print token values.

## Run in PowerShell 5.1

Save `Scrutari-Netlify-Toolbox.ps1` to Downloads. Review it before execution. Then:

```powershell
& "$env:USERPROFILE\Downloads\Scrutari-Netlify-Toolbox.ps1" -Mode Install
& "$env:USERPROFILE\Downloads\Scrutari-Netlify-Toolbox.ps1" -Mode Status
& "$env:USERPROFILE\Downloads\Scrutari-Netlify-Toolbox.ps1" -Mode Login
& "$env:USERPROFILE\Downloads\Scrutari-Netlify-Toolbox.ps1" -Mode Sites
```

If Windows blocks a trusted downloaded `.ps1`, use `Unblock-File -LiteralPath <path>` after reviewing the file. Do not change machine-wide execution policy.

For read-only Netlify CLI operations:

```powershell
& "$env:USERPROFILE\Downloads\Scrutari-Netlify-Toolbox.ps1" -Mode Run -CliArgs @('api','--list')
```

To reconstitute disposable tool layers later while retaining authentication:

```powershell
& "$env:USERPROFILE\Downloads\Scrutari-Netlify-Toolbox.ps1" -Mode Rebuild
```

For cache cleanup only:

```powershell
& "$env:USERPROFILE\Downloads\Scrutari-Netlify-Toolbox.ps1" -Mode Clean
```

**No production deployment, Netlify project creation, environment secret mutation, or synthetic visitor submission occurs during installation.** `Login` is an intentional, separate user action, and `Run` permits read-only CLI commands unless `-AllowMutatingCommands` is passed for a separately approved operation.

## Security and qualification

- Official Node.js archive is compared to a pinned published SHA-256 before extraction.
- npm package version is exact; npm lockfile captures transitive integrity values. The **first** lockfile creation requires registry access and is not yet equivalent to a reviewed, committed lockfile. Preserve/version that generated lockfile before reuse on other hosts.
- The installed toolchain is only activated inside the wrapper's process. No MSI, system PATH, registry, global npm prefix, Docker, admin, or WSL requirements.
- All downloaded code remains third-party executable software; pinning + integrity checks reduce version drift but do not establish a malware-free supply chain.
- PowerShell 5.1 uses TLS 1.2 when downloading Node. If corporate policy blocks nodejs.org or registry.npmjs.org, install will fail without trying an unverified mirror.
- The script does not automatically authenticate with Netlify or assert that a project is configured.

Sources: https://nodejs.org/download/release/v24.22.3/SHASUMS256.txt and https://github.com/netlify/cli and https://cli.netlify.com/.