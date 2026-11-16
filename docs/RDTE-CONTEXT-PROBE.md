# Scrutari RDTE draft context probe

Read-only, no-secrets source for a **separate** Netlify site created
16 November 2026 (`scrutari-rdte-sempersupra`,
`c7bb4aae-c13d-431b-bc93-4e79a85e1f37`).
The production project ID `07a114de-1ed2-4268-b692-8e3690e4e51f`
is explicitly excluded.

The site was created with `--disable-linking`, so the first draft deploy
can use Netlify CLI rather than Git-based Deploy Previews. But
`netlify deploy --context deploy-preview` selects **build** context,
and does not prove `context.deploy.context` will be `deploy-preview`
inside the Function. This probe reports only runtime facts, never
credentials or Blob contents.

Run with the existing PowerShell 5.1 portable Netlify toolbox:
```powershell
$p="$env:USERPROFILE\Downloads\Scrutari-Netlify-RDTE-Context-Probe.ps1"
& $p -Mode Plan
# After review:
& $p -Mode Deploy -ApproveDraftDeployment
```
Use the draft URL printed by CLI and append
`/.netlify/functions/rdte-context`; report only the returned JSON.
Check `expectedSiteMatches=true`, actual `deployContext`,
`deployedAsPublished` (can be null) and `deployIdPresent`.

The script creates temporary files, deploys an inert index and GET-only
function to the *fixed RDTE Project ID*, never uses `--prod`, and removes
local staging files. No secrets, model calls, real visitor data, Netlify
Blob operations or production-domain writes are used.

This does not qualify writable synthetic testing. True Deploy Preview
can alternatively be obtained by connecting an approved Git repository,
after reviewing its Netlify publish directory to prevent private source
exposure.

DLE: https://github.com/SemperSupra/scrutari-private/issues/49
Sources: https://cli.netlify.com/commands/deploy/
https://docs.netlify.com/deploy/deploy-overview/
