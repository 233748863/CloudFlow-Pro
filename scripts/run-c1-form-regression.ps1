param([ValidatePattern('^r[1-9][0-9]*$')][string]$Round,
    [ValidatePattern('^r[1-9][0-9]*$')][string]$FrontendRound)
$ErrorActionPreference='Stop'
. 'D:\CloudFlowPro\.cloudflow-runtime\use-data-drive.ps1'
$Root='D:\CloudFlowPro'
$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
$Output=Join-Path $Evidence "c1-form-regression-20261005-$Round"
if(Test-Path -LiteralPath $Output){throw 'Retain previous form regression evidence'}
[IO.Directory]::CreateDirectory($Output) | Out-Null
$Inputs=@(Get-Content -LiteralPath (Join-Path $Evidence "h3-portal-finance-20261002-frontend-$FrontendRound-inputs.json") -Raw | ConvertFrom-Json)
$Inputs+= [pscustomobject]@{Path='scripts/run-c1-form-regression.ps1';Hash=(Get-FileHash -LiteralPath $PSCommandPath).Hash}
function Assert-Inputs {
    if(@($Inputs | Where-Object {(Get-FileHash -LiteralPath (Join-Path $Root $_.Path)).Hash -ne $_.Hash}).Count){throw 'Form regression inputs changed'}
}
Assert-Inputs
$Inputs | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $Output 'inputs.json') -Encoding utf8NoBOM
$PreviousBrowserModule=$env:CLOUDFLOW_PLAYWRIGHT_MODULE
$env:CLOUDFLOW_PLAYWRIGHT_MODULE=Join-Path $Root '.cloudflow-runtime/playwright/node_modules/playwright-core/index.mjs'
Push-Location (Join-Path $Root 'cloudflow-frontend')
try {
    & npx --no-install tsx scripts/check-form-capabilities.ts *> (Join-Path $Output 'capabilities.log')
    if($LASTEXITCODE -ne 0){throw 'Form behavior regression failed'}
    & node scripts/check-form-browser.mjs *> (Join-Path $Output 'browser.log')
    if($LASTEXITCODE -ne 0){throw 'Form browser regression failed'}
    Assert-Inputs
    Get-Content (Join-Path $Output 'capabilities.log') | Where-Object {$_ -match '^Batch C form foundation'}
    Get-Content (Join-Path $Output 'browser.log') | Where-Object {$_ -match '^PASS form browser|^Evidence:'}
    "C1_FORM_REGRESSION: inputs=$($Inputs.Count); changed=0; exit=0; business_database_writes=0" | Tee-Object -FilePath (Join-Path $Output 'summary.log')
} finally {
    Pop-Location
    $env:CLOUDFLOW_PLAYWRIGHT_MODULE=$PreviousBrowserModule
    Assert-Inputs
}
