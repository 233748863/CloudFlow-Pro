param([ValidatePattern('^r[1-9][0-9]*$')][string]$Round,
    [ValidatePattern('^r[1-9][0-9]*$')][string]$BackendRound)
$ErrorActionPreference='Stop'
. 'D:\CloudFlowPro\.cloudflow-runtime\use-data-drive.ps1'
$Root='D:\CloudFlowPro'
$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
$Output=Join-Path $Evidence "c1-form-response-20261005-$Round"
if(Test-Path -LiteralPath $Output){throw 'Retain previous response evidence'}
[IO.Directory]::CreateDirectory($Output) | Out-Null
$Inputs=@(Get-Content -LiteralPath (Join-Path $Evidence "h3-portal-finance-20261002-backend-$BackendRound-inputs.json") -Raw|ConvertFrom-Json)
$Scripts=@('scripts/run-c1-response-checks.ps1','scripts/verify-batch-c.ps1')+@(rg --files scripts/form-checks -g '*.java')+@('scripts/workflow-checks/WorkflowDraftChecks.java')
$Inputs+=@($Scripts|ForEach-Object{[pscustomobject]@{Path=$_;Hash=(Get-FileHash -LiteralPath (Join-Path $Root $_)).Hash}})
function Assert-Inputs {
    foreach($Item in $Inputs){if((Get-FileHash -LiteralPath (Join-Path $Root $Item.Path)).Hash -ne $Item.Hash){throw 'Response check input changed'}}
}
Assert-Inputs
$Inputs|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $Output 'inputs.json') -Encoding utf8NoBOM
Push-Location $Root
try {
    & scripts/verify-batch-c.ps1 -SkipBuild -SkipFrontend *> (Join-Path $Output 'form.log')
    if($LASTEXITCODE -ne 0){throw 'Form validation checks failed'}
    & cloudflow-backend/cloudflow-common/cloudflow-common-log/src/test/run-sensitive-log-checks.ps1 *> (Join-Path $Output 'privacy.log')
    if($LASTEXITCODE -ne 0){throw 'Sensitive response checks failed'}
    Assert-Inputs
    Get-Content -LiteralPath (Join-Path $Output 'form.log')|Where-Object{$_ -match '^Batch C|^PASS C|^Workflow draft'}
    Get-Content -LiteralPath (Join-Path $Output 'privacy.log')|Where-Object{$_ -match '^PASS|passed|checks='}
    "C1_RESPONSE_CHECKS: inputs=$($Inputs.Count); changed=0; exit=0; runtime_database_writes=0"|Tee-Object -FilePath (Join-Path $Output 'summary.log')
} finally {Pop-Location;Assert-Inputs}
