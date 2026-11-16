#requires -Version 5.1
<#
.SYNOPSIS
  Read-only Netlify site/deployment audit with strict output minimization.
.DESCRIPTION
  Queries only Netlify's getSite operation via the already-installed portable
  toolbox. Emits allowlisted facts; never prints raw site JSON or credential
  values. -FixturePath is for offline CI testing and labels itself as a fixture.
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory=$true)]
    [ValidatePattern('^[a-zA-Z0-9-]{10,128}$')]
    [string]$ProjectId,
    [string]$ToolboxPath = (Join-Path $env:USERPROFILE 'Downloads\Scrutari-Netlify-Toolbox.ps1'),
    [string]$FixturePath = ''
)
Set-StrictMode -Version 2.0
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

function Get-Allowed([object]$Object, [string]$Name) {
    if ($null -eq $Object) { return $null }
    $prop = $Object.PSObject.Properties[$Name]
    if ($null -eq $prop) { return $null }
    return $prop.Value
}
if ($FixturePath) {
    $raw = [System.IO.File]::ReadAllText([System.IO.Path]::GetFullPath($FixturePath))
    $mode = 'offline-fixture-not-account-verified'
} else {
    if (-not (Test-Path -LiteralPath $ToolboxPath -PathType Leaf)) {
        throw 'Portable toolbox script not found; use your existing downloaded file.'
    }
    $request = '{"site_id":"' + $ProjectId + '"}'
    try {
        $lines = @(& $ToolboxPath -Mode Run -CliArgs @('api','getSite','--data',$request) 2>$null)
        $raw = $lines -join [Environment]::NewLine
    } catch {
        throw 'Netlify read-only site inspection failed. The current local CLI session may require authorization.'
    }
    $mode = 'authenticated-cli-read-only'
}
try {
    $site = ConvertFrom-Json -InputObject $raw -ErrorAction Stop
} catch {
    throw 'Could not parse Netlify site response; raw provider payload withheld.'
}
$id = Get-Allowed $site 'id'
if ($id -ne $ProjectId) {
    throw 'Netlify site identity mismatch; raw provider payload withheld.'
}
$published = Get-Allowed $site 'published_deploy'
$functions = @(Get-Allowed $published 'available_functions')
$names = @($functions | ForEach-Object {
    $name = Get-Allowed $_ 'n'
    if ($name -is [string] -and $name -match '^[a-zA-Z0-9_-]{1,64}$') { $name }
} | Sort-Object -Unique)
$runtimes = @($functions | ForEach-Object {
    $runtime = Get-Allowed $_ 'r'
    if ($runtime -is [string] -and $runtime -match '^[a-zA-Z0-9._-]{1,50}$') { $runtime }
} | Sort-Object -Unique)

$build = Get-Allowed $site 'build_settings'
$repository = Get-Allowed $build 'repo_url'
$commit = Get-Allowed $published 'commit_ref'
if ($commit -isnot [string] -or $commit -notmatch '^[a-f0-9]{7,40}$') { $commit = $null }
$publishMode = Get-Allowed $published 'deploy_source'
if (-not $publishMode) { $publishMode = Get-Allowed $site 'deploy_source' }

$result = [ordered]@{
    auditMode = $mode
    readOnly = $true
    projectName = Get-Allowed $site 'name'
    projectId = $id
    accountPlan = Get-Allowed (Get-Allowed $site 'account_type') 'value'
    currentDeploymentId = Get-Allowed $published 'id'
    deployedAtUTC = Get-Allowed $published 'published_at'
    deployContext = Get-Allowed $published 'context'
    deploySource = $publishMode
    gitCommitRef = $commit
    linkedBuildRepositoryIndicated = [bool]$repository
    functionNames = $names
    functionRuntimes = $runtimes
    deploymentGitProvenanceVerified = [bool]$commit
}
# Everything else, including transient OAuth tickets, skew-protection
# metadata, internal function IDs, user/account IDs, and API tokens, is dropped.
$result | ConvertTo-Json -Depth 5 -Compress
