param([ValidatePattern('^r[1-9][0-9]*$')][string]$Round='r1',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$BackendRound='r73',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$FrontendRound='r37')
$ErrorActionPreference='Stop'
. 'D:\CloudFlowPro\.cloudflow-runtime\use-data-drive.ps1'
$Root='D:\CloudFlowPro'
$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
$Output=Join-Path $Evidence "b1-manual-required-checks-20261005-$Round"
if(Test-Path -LiteralPath $Output){throw 'Retain manual task evidence'}
[IO.Directory]::CreateDirectory($Output)|Out-Null
$Inputs=@()
foreach($Build in @("backend-$BackendRound","frontend-$FrontendRound")){
    $Inputs+=@(Get-Content -LiteralPath (Join-Path $Evidence "h3-portal-finance-20261002-$Build-inputs.json") -Raw|ConvertFrom-Json)
}
$Paths=@('scripts/run-b1-manual-required-checks.ps1','scripts/verify-batch-b.ps1')+@(rg --files scripts/workflow-checks -g '*.java')
foreach($Path in $Paths){$Inputs+=[pscustomobject]@{Path=$Path;Hash=(Get-FileHash -LiteralPath (Join-Path $Root $Path)).Hash}}
function Assert-Inputs{foreach($Input in $Inputs){if((Get-FileHash -LiteralPath (Join-Path $Root $Input.Path)).Hash -ne $Input.Hash){throw 'Manual task check input changed'}}}
Assert-Inputs
$Inputs|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $Output 'inputs.json') -Encoding utf8NoBOM
Push-Location $Root
try{
    & scripts/verify-batch-b.ps1 -SkipBuild *> (Join-Path $Output 'batch-b.log')
    if($LASTEXITCODE -ne 0){throw 'Workflow rules failed'}
    Push-Location (Join-Path $Root 'cloudflow-frontend')
    try{
        & npx --no-install tsx scripts/check-workflow-semantics.ts *> (Join-Path $Output 'frontend.log')
        if($LASTEXITCODE -ne 0){throw 'Frontend workflow rules failed'}
        & npx --no-install tsx scripts/check-workflow-gateways.ts *> (Join-Path $Output 'gateways.log')
        if($LASTEXITCODE -ne 0){throw 'Frontend graph rules failed'}
    }finally{Pop-Location}
    Assert-Inputs
    Get-Content -LiteralPath (Join-Path $Output 'batch-b.log')|Where-Object{$_ -match '^PASS: [0-9]|^PASS: SQL'}
    Get-Content -LiteralPath (Join-Path $Output 'frontend.log') -Tail 1
    Get-Content -LiteralPath (Join-Path $Output 'gateways.log') -Tail 1
    "B1_MANUAL_REQUIRED_CHECKS: inputs=$($Inputs.Count); changed=0; exit=0; production_modified=false"|Tee-Object -FilePath (Join-Path $Output 'summary.log')
}finally{Pop-Location;Assert-Inputs}
