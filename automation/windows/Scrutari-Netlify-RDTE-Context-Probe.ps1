#requires -Version 5.1
[CmdletBinding()]
param(
  [ValidateSet('Plan','Deploy')][string]$Mode='Plan',
  [switch]$ApproveDraftDeployment,
  [string]$Toolbox=(Join-Path $env:USERPROFILE 'Downloads\Scrutari-Netlify-Toolbox.ps1')
)
Set-StrictMode -Version 2.0
$ErrorActionPreference='Stop'
$rdte='c7bb4aae-c13d-431b-bc93-4e79a85e1f37'
$production='07a114de-1ed2-4268-b692-8e3690e4e51f'
if($rdte -eq $production){throw 'RDTE must never equal production'}
Write-Host "Target: scrutari-rdte-sempersupra ($rdte); production excluded."
if($Mode -eq 'Plan'){
  Write-Host 'PLAN_ONLY: no files, Netlify calls or deployments.'
  return
}
if(-not $ApproveDraftDeployment){throw 'Use -ApproveDraftDeployment to authorize this draft.'}
if(-not (Test-Path -LiteralPath $Toolbox -PathType Leaf)){throw 'Portable toolbox script missing.'}
$root=Join-Path ([IO.Path]::GetTempPath()) ('scrutari-rdte-'+[Guid]::NewGuid().ToString('N'))
$pub=Join-Path $root 'public'
$functions=Join-Path $root 'netlify\functions'
$utf8=New-Object Text.UTF8Encoding($false)
try{
  [IO.Directory]::CreateDirectory($pub)|Out-Null
  [IO.Directory]::CreateDirectory($functions)|Out-Null
  $html='<!doctype html><title>Scrutari RDTE read-only probe</title><p>No visitor data or storage.</p>'
  [IO.File]::WriteAllText((Join-Path $pub 'index.html'),$html,$utf8)
  $config=@'
[build]
publish = "public"
[functions]
directory = "netlify/functions"
'@
  [IO.File]::WriteAllText((Join-Path $root 'netlify.toml'),$config,$utf8)
  $handler=@'
export default async (req,ctx)=>{
  if(req.method!=='GET')return new Response('',{status:405});
  const match=ctx?.site?.id==='c7bb4aae-c13d-431b-bc93-4e79a85e1f37';
  const d=ctx?.deploy;
  return new Response(JSON.stringify({
    probe:'scrutari-rdte-context-v1',
    expectedSiteMatches:match,
    deployContext:typeof d?.context==='string'?d.context:null,
    deployedAsPublished:typeof d?.published==='boolean'?d.published:null,
    deployIdPresent:typeof d?.id==='string'&&d.id.length>0,
    writesPerformed:false,credentialsInspected:false
  }),{status:match?200:403,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
};
'@
  [IO.File]::WriteAllText((Join-Path $functions 'rdte-context.mjs'),$handler,$utf8)
  $cli=@('deploy','--site',$rdte,'--context','deploy-preview',
    '--no-build','--dir','public','--functions','netlify/functions',
    '--message','Scrutari synthetic-only context probe')
  Push-Location $root
  try{
    & $Toolbox -Mode Run -AllowMutatingCommands -CliArgs $cli
  }finally{Pop-Location}
  Write-Host 'DRAFT_ONLY: Append /.netlify/functions/rdte-context to the draft URL.'
  Write-Host 'Copy only the small returned JSON, never full project metadata or auth tokens.'
}finally{
  if(Test-Path -LiteralPath $root){Remove-Item -LiteralPath $root -Recurse -Force -ErrorAction SilentlyContinue}
}
