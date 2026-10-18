param([ValidatePattern('^r[1-9][0-9]*$')][string]$Round='r1',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$BackendRound='r5',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$FrontendRound='r6')
$ErrorActionPreference='Stop'
. 'D:\CloudFlowPro\.cloudflow-runtime/use-data-drive.ps1'
$Root='D:\CloudFlowPro'
$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
$Output=Join-Path $Evidence "h3-portal-finance-adjacent-20261002-$Round"
if(Test-Path -LiteralPath $Output){throw 'Retain previous finance adjacent evidence'}
[IO.Directory]::CreateDirectory($Output) | Out-Null
$BuildInputs=@()
foreach($Build in @("backend-$BackendRound","frontend-$FrontendRound")) {
    $Snapshot=@(Get-Content -LiteralPath (Join-Path $Evidence "h3-portal-finance-20261002-$Build-inputs.json") -Raw | ConvertFrom-Json)
    if(@($Snapshot | Where-Object {(Get-FileHash -LiteralPath (Join-Path $Root $_.Path)).Hash -ne $_.Hash}).Count){throw 'Product differs from verified build'}
    $BuildInputs+=$Snapshot
}
$Paths=@($BuildInputs.Path)+@(rg --files scripts -g '!**/node_modules/**')+@('.cloudflow-runtime/batch-h-delivery-selfcheck-20260915/check-sources.mjs')
$Inputs=@($Paths | Sort-Object -Unique | ForEach-Object {[pscustomobject]@{Path=$_;Hash=(Get-FileHash -LiteralPath (Join-Path $Root $_)).Hash}})
$Inputs | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $Output 'inputs.json') -Encoding utf8
function Require-Success([string]$Name) {
    if($LASTEXITCODE -ne 0){throw "Finance adjacent check failed: $Name; retained diagnostics"}
    "H3_FINANCE_ADJACENT_STEP: name=$Name; exit=0" | Add-Content -LiteralPath (Join-Path $Output 'summary.log')
}
& java scripts/java-style-checks/JavaExplicitTypeChecks.java --self-test *> (Join-Path $Output 'java-types.log')
Require-Success 'java-checker-self-test'
& java scripts/java-style-checks/JavaExplicitTypeChecks.java . *>> (Join-Path $Output 'java-types.log')
Require-Success 'java-explicit-types'
& node .cloudflow-runtime/batch-h-delivery-selfcheck-20260915/check-sources.mjs *> (Join-Path $Output 'sources.log')
Require-Success 'source-constraints'
& node scripts/check-batch-h-contracts.mjs --json *> (Join-Path $Output 'h-static.json')
Require-Success 'h-static'
& node scripts/verify-approved-menu-scope.mjs '.cloudflow-runtime/batch-g-integration/9799534e1a3a47b5958330f14ae16dc7/state.json' *> (Join-Path $Output 'menu.log')
Require-Success 'approved-menu-scope'
$Demo=Join-Path $Output '07.cloudflow-demo-seed.sql'
& scripts/generate-demo-seed.ps1 -OutputPath $Demo *> (Join-Path $Output 'demo.log')
if((Get-FileHash -LiteralPath $Demo).Hash -ne (Get-FileHash -LiteralPath (Join-Path $Root 'cloudflow-backend/DB/07.cloudflow-demo-seed.sql')).Hash){throw 'Regenerated demo differs from formal SQL'}
'H3_FINANCE_DEMO: regenerated_matches_formal=true; formal_modified=false' | Add-Content -LiteralPath (Join-Path $Output 'summary.log')
& scripts/verify-batch-f-db.ps1 -SkipBuild -PortalFinanceChecks *> (Join-Path $Output 'oa-database.log')
Require-Success 'formal-01-07-and-oa-behavior'
if(@($Inputs | Where-Object {(Get-FileHash -LiteralPath (Join-Path $Root $_.Path)).Hash -ne $_.Hash}).Count){throw 'Finance adjacent inputs changed'}
"H3_FINANCE_ADJACENT: files=$($Inputs.Count); changed=0; exit=0; production_modified=false" | Add-Content -LiteralPath (Join-Path $Output 'summary.log')
Get-Content -LiteralPath (Join-Path $Output 'summary.log')
