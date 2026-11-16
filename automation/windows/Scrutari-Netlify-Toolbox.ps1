#requires -Version 5.1
<#
.SYNOPSIS
  Portable, no-admin Node/npm/Netlify CLI toolbox for Windows PowerShell 5.1.
.DESCRIPTION
  Three explicit layers:
    1. Manifest and npm lockfile: durable, reviewable rebuild recipe.
    2. Toolchain and packages: disposable/reconstructable; no global installs.
    3. Authentication state: separate, opt-in persistent profile, not in Git.

  No system PATH/registry modification, Docker, admin, permanent npm global
  installation, automatic Netlify login, deploy, or production changes.
.EXAMPLE
  & .\Scrutari-Netlify-Toolbox.ps1 -Mode Install
  & .\Scrutari-Netlify-Toolbox.ps1 -Mode Login
  & .\Scrutari-Netlify-Toolbox.ps1 -Mode Sites
  & .\Scrutari-Netlify-Toolbox.ps1 -Mode Run -CliArgs @('api','--list')
  & .\Scrutari-Netlify-Toolbox.ps1 -Mode Clean
#>
[CmdletBinding()]
param(
    [ValidateSet('Install','Status','Login','Sites','Run','Clean','Rebuild')]
    [string]$Mode = 'Install',
    [string]$Root = (Join-Path (Join-Path $env:USERPROFILE 'Projects') 'scrutari-netlify-toolbox'),
    [string[]]$CliArgs = @(),
    [switch]$AllowMutatingCommands
)

Set-StrictMode -Version 2.0
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

# Pin by version and official published Windows ZIP SHA-256. This is the
# nodejs.org/download/release/v24.22.3/SHASUMS256.txt digest, not a value
# accepted from the downloaded archive itself.
$NodeVersion = 'v24.22.3'
$NetlifyCliVersion = '27.19.0'
$SupportedArchitectures = @{
    'AMD64' = @{ ZipName = 'node-v24.22.3-win-x64.zip'; Sha256 = 'e612af99f626ab415ea225af6bce5c971feb448cb5cae250bb1c3fa50c5f7d9f' }
    'ARM64' = @{ ZipName = 'node-v24.22.3-win-arm64.zip'; Sha256 = 'b3cc74a295b39d4f273271e96f58c06dd2b35757ca12abec64c7d0598b434f14' }
}
$Architecture = $env:PROCESSOR_ARCHITECTURE
if (-not $SupportedArchitectures.ContainsKey($Architecture)) {
    throw "Unsupported Windows architecture '$Architecture'. Supported: AMD64 and ARM64."
}
$NodeZipName = $SupportedArchitectures[$Architecture].ZipName
$ExpectedNodeSha256 = $SupportedArchitectures[$Architecture].Sha256
$Root = [System.IO.Path]::GetFullPath($Root)
if (($Root -eq [System.IO.Path]::GetPathRoot($Root)) -or ($Root.Length -lt 12)) {
    throw 'Refusing unsafe workspace root.'
}
$Toolchains = Join-Path $Root 'toolchains'
$Packages = Join-Path $Root 'packages\netlify-cli'
$Cache = Join-Path $Root 'cache'
$State = Join-Path $Root 'state\auth'
$RunRoot = Join-Path $Root 'runs'
$NodeDirName = [System.IO.Path]::GetFileNameWithoutExtension($NodeZipName)
$NodeDir = Join-Path $Toolchains $NodeDirName
$NodeExe = Join-Path $NodeDir 'node.exe'
$NpmCmd = Join-Path $NodeDir 'npm.cmd'
$NetlifyCmd = Join-Path $Packages 'node_modules\.bin\netlify.cmd'
$LockFile = Join-Path $Packages 'package-lock.json'
$ManifestFile = Join-Path $Root 'toolbox-manifest.json'
$Utf8NoBom = New-Object System.Text.UTF8Encoding -ArgumentList $false

function Ensure-Directory([string]$Path) {
    if (-not (Test-Path -LiteralPath $Path -PathType Container)) {
        New-Item -ItemType Directory -Force -Path $Path | Out-Null
    }
}
function Write-Utf8NoBom([string]$File, [string]$Body) {
    [System.IO.File]::WriteAllText($File, $Body, $Utf8NoBom)
}
function Test-Sha256([string]$File, [string]$Expected) {
    if (-not (Test-Path -LiteralPath $File -PathType Leaf)) { return $false }
    $Actual = (Get-FileHash -LiteralPath $File -Algorithm SHA256).Hash.ToLowerInvariant()
    return ($Actual -eq $Expected.ToLowerInvariant())
}
function Ensure-Manifest {
    Ensure-Directory $Root
    $Recipe = [ordered]@{
        schema = 1
        nodeVersion = $NodeVersion
        nodeZip = $NodeZipName
        nodeSha256 = $ExpectedNodeSha256
        nodeSource = "https://nodejs.org/download/release/$NodeVersion/$NodeZipName"
        netlifyCliVersion = $NetlifyCliVersion
        architecture = $Architecture
        usage = 'Manifest/lockfile durable; packages rebuildable; auth state separate; runner temp disposable.'
    }
    $Canonical = ($Recipe | ConvertTo-Json -Depth 5)
    if (Test-Path -LiteralPath $ManifestFile) {
        $Old = (Get-Content -LiteralPath $ManifestFile -Raw | ConvertFrom-Json)
        if ($Old.nodeVersion -ne $NodeVersion -or $Old.netlifyCliVersion -ne $NetlifyCliVersion -or
            $Old.nodeSha256 -ne $ExpectedNodeSha256 -or $Old.architecture -ne $Architecture) {
            throw 'Existing manifest differs from pinned release. Use a new workspace or review an explicit upgrade.'
        }
    } else {
        Write-Utf8NoBom $ManifestFile ($Canonical + [Environment]::NewLine)
    }
}
function Ensure-Node {
    if ((Test-Path $NodeExe -PathType Leaf) -and (Test-Path $NpmCmd -PathType Leaf)) { return }
    Ensure-Directory $Toolchains
    Ensure-Directory $Cache
    $ZipFile = Join-Path $Cache $NodeZipName
    if (-not (Test-Sha256 $ZipFile $ExpectedNodeSha256)) {
        if (Test-Path $ZipFile) { Remove-Item -LiteralPath $ZipFile -Force }
        $Url = "https://nodejs.org/download/release/$NodeVersion/$NodeZipName"
        Write-Host "Downloading official portable Node.js $NodeVersion ($Architecture)..."
        $PriorTls = [Net.ServicePointManager]::SecurityProtocol
        try {
            [Net.ServicePointManager]::SecurityProtocol = $PriorTls -bor [Net.SecurityProtocolType]::Tls12
            Invoke-WebRequest -Uri $Url -OutFile $ZipFile -UseBasicParsing
        } finally {
            [Net.ServicePointManager]::SecurityProtocol = $PriorTls
        }
    }
    if (-not (Test-Sha256 $ZipFile $ExpectedNodeSha256)) {
        Remove-Item -LiteralPath $ZipFile -Force -ErrorAction SilentlyContinue
        throw 'Node.js archive SHA-256 verification failed; refusing extraction.'
    }
    $Stage = Join-Path $Toolchains ('extract-' + [Guid]::NewGuid().ToString('N'))
    Ensure-Directory $Stage
    try {
        Expand-Archive -LiteralPath $ZipFile -DestinationPath $Stage -Force
        $Extracted = Join-Path $Stage $NodeDirName
        if (-not ((Test-Path (Join-Path $Extracted 'node.exe')) -and (Test-Path (Join-Path $Extracted 'npm.cmd')))) {
            throw 'Official archive did not contain the expected Node/npm files.'
        }
        if (Test-Path -LiteralPath $NodeDir) {
            Remove-Item -LiteralPath $NodeDir -Force -Recurse
        }
        Move-Item -LiteralPath $Extracted -Destination $NodeDir
    } finally {
        if (Test-Path $Stage) { Remove-Item -LiteralPath $Stage -Force -Recurse }
    }
    Write-Host 'Portable Node.js extracted and verified; system installation unchanged.'
}
function Test-Installed {
    return ((Test-Path $NodeExe -PathType Leaf) -and
            (Test-Path $NpmCmd -PathType Leaf) -and
            (Test-Path $NetlifyCmd -PathType Leaf) -and
            (Test-Path $LockFile -PathType Leaf))
}
function Invoke-Isolated([scriptblock]$Task) {
    $EnvironmentNames = @('Path','USERPROFILE','HOME','APPDATA','LOCALAPPDATA','XDG_CONFIG_HOME','TEMP','TMP',
        'npm_config_cache','npm_config_update_notifier','npm_config_fund','npm_config_audit','NPM_CONFIG_PREFIX')
    $Original = @{}
    foreach ($Name in $EnvironmentNames) {
        $Original[$Name] = [Environment]::GetEnvironmentVariable($Name, 'Process')
    }
    $Scratch = Join-Path $RunRoot ([Guid]::NewGuid().ToString('N'))
    Ensure-Directory $RunRoot
    Ensure-Directory $Scratch
    Ensure-Directory (Join-Path $Scratch 'tmp')
    # Auth is separate and opt-in persistent. This prevents credentials from
    # being stored inside replaceable CLI/node packages or disposable temp.
    foreach ($Path in @($State, (Join-Path $State 'profile'), (Join-Path $State 'appdata'),
                        (Join-Path $State 'localappdata'), (Join-Path $State 'xdg'))) {
        Ensure-Directory $Path
    }
    try {
        $env:Path = "$NodeDir;$($Packages)\node_modules\.bin;$($Original['Path'])"
        $env:USERPROFILE = Join-Path $State 'profile'
        $env:HOME = $env:USERPROFILE
        $env:APPDATA = Join-Path $State 'appdata'
        $env:LOCALAPPDATA = Join-Path $State 'localappdata'
        $env:XDG_CONFIG_HOME = Join-Path $State 'xdg'
        $env:TEMP = Join-Path $Scratch 'tmp'
        $env:TMP = $env:TEMP
        $env:npm_config_cache = Join-Path $Cache 'npm'
        $env:npm_config_update_notifier = 'false'
        $env:npm_config_fund = 'false'
        $env:npm_config_audit = 'false'
        $env:NPM_CONFIG_PREFIX = Join-Path $Root 'disabled-global-prefix'
        & $Task
        if ($LASTEXITCODE -ne 0) { throw "Tool exited with status $LASTEXITCODE" }
    } finally {
        foreach ($Name in $EnvironmentNames) {
            [Environment]::SetEnvironmentVariable($Name, $Original[$Name], 'Process')
        }
        if (Test-Path -LiteralPath $Scratch) {
            Remove-Item -LiteralPath $Scratch -Recurse -Force -ErrorAction SilentlyContinue
        }
    }
}
function Ensure-Netlify {
    Ensure-Manifest
    Ensure-Node
    Ensure-Directory $Packages
    Ensure-Directory $Cache
    $PackageFile = Join-Path $Packages 'package.json'
    if (-not (Test-Path -LiteralPath $PackageFile -PathType Leaf)) {
        $PackageBody = (@{
            name = 'scrutari-netlify-toolbox'
            private = $true
            version = '1.0.0'
            description = 'Disposable pinned Netlify CLI package layer'
            devDependencies = @{ 'netlify-cli' = $NetlifyCliVersion }
        } | ConvertTo-Json -Depth 4)
        Write-Utf8NoBom $PackageFile ($PackageBody + [Environment]::NewLine)
    } else {
        $Spec = Get-Content -LiteralPath $PackageFile -Raw | ConvertFrom-Json
        if ($Spec.devDependencies.'netlify-cli' -ne $NetlifyCliVersion) {
            throw 'package.json version differs from the pinned CLI release.'
        }
    }
    if (-not (Test-Path -LiteralPath $LockFile -PathType Leaf)) {
        Invoke-Isolated {
            Write-Host "Locking Netlify CLI $NetlifyCliVersion (no global installation)..."
            & $NpmCmd --prefix $Packages install --package-lock-only --ignore-scripts --no-audit --no-fund
        }
    }
    if (-not (Test-Path -LiteralPath $NetlifyCmd -PathType Leaf)) {
        Invoke-Isolated {
            Write-Host 'Installing Netlify CLI from locally pinned npm lockfile...'
            & $NpmCmd --prefix $Packages ci --no-audit --no-fund
        }
    }
    if (-not (Test-Installed)) { throw 'Toolbox incomplete after installation.' }
    Invoke-Isolated {
        Write-Host ('Node.js: ' + (& $NodeExe --version))
        Write-Host ('npm: ' + (& $NpmCmd --version))
        Write-Host ('Netlify CLI: ' + (& $NetlifyCmd --version))
    }
}
function Show-Status {
    Write-Host ('Workspace: ' + $Root)
    Write-Host ('Architecture: ' + $Architecture)
    Write-Host ('Pinned Node.js: ' + $NodeVersion)
    Write-Host ('Pinned Netlify CLI: ' + $NetlifyCliVersion)
    Write-Host ('Node present: ' + (Test-Path $NodeExe -PathType Leaf))
    Write-Host ('Netlify present: ' + (Test-Path $NetlifyCmd -PathType Leaf))
    Write-Host ('npm lockfile present: ' + (Test-Path $LockFile -PathType Leaf))
    Write-Host 'Authentication: isolated; not inspected or printed.'
}

switch ($Mode) {
    'Status' { Show-Status; break }
    'Install' { Ensure-Netlify; Show-Status; break }
    'Rebuild' {
        Ensure-Manifest
        if (Test-Path $NodeDir) { Remove-Item -LiteralPath $NodeDir -Recurse -Force }
        $Modules = Join-Path $Packages 'node_modules'
        if (Test-Path $Modules) { Remove-Item -LiteralPath $Modules -Recurse -Force }
        Ensure-Netlify
        Write-Host 'Rebuilt from pinned sources; isolated authorization state preserved.'
        break
    }
    'Clean' {
        foreach ($Path in @($Cache, $RunRoot)) {
            if (Test-Path $Path) { Remove-Item -LiteralPath $Path -Recurse -Force }
        }
        Write-Host 'Removed caches and disposable session directories; pinned packages and auth state preserved.'
        break
    }
    default {
        if (-not (Test-Installed)) { throw 'Toolbox not installed. Run -Mode Install first.' }
        if ($Mode -eq 'Run') {
            if ($CliArgs.Count -lt 1) { throw 'Specify -CliArgs as a string array.' }
            $ReadOnly = @('sites:list','sites:search','deploy:list','status','--version','--help','help')
            $SafeApi = ($CliArgs[0] -eq 'api' -and $CliArgs.Count -ge 2 -and
                        ($CliArgs[1] -eq '--list' -or $CliArgs[1] -eq 'getSite'))
            if (-not $AllowMutatingCommands -and -not ($ReadOnly -contains $CliArgs[0]) -and -not $SafeApi) {
                throw 'CLI command not in read-only allowlist. Use -AllowMutatingCommands only for separately approved operations.'
            }
            Invoke-Isolated { & $NetlifyCmd @CliArgs }
        } elseif ($Mode -eq 'Login') {
            Write-Host 'Netlify browser authorization; isolated login state will persist under toolbox/state/auth.'
            Invoke-Isolated { & $NetlifyCmd login }
        } elseif ($Mode -eq 'Sites') {
            Invoke-Isolated { & $NetlifyCmd sites:list --json }
        }
    }
}