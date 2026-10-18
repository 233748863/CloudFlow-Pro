param([ValidatePattern('^r[1-9][0-9]*$')][string]$Round='r1',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$BackendRound='r77',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$FrontendRound='r50')
$ErrorActionPreference='Stop'
. 'D:\CloudFlowPro\.cloudflow-runtime/use-data-drive.ps1'
$Root='D:\CloudFlowPro'
$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
$Output=Join-Path $Evidence "c3-expression-parity-20261005-$Round"
if(Test-Path -LiteralPath $Output){throw 'Retain previous C3 expression evidence'}
[IO.Directory]::CreateDirectory($Output)|Out-Null
$Inputs=@()
foreach($Build in @("backend-$BackendRound","frontend-$FrontendRound")){$Inputs+=@(Get-Content -LiteralPath (Join-Path $Evidence "h3-portal-finance-20261002-$Build-inputs.json") -Raw|ConvertFrom-Json)}
foreach($File in @('scripts/run-c3-expression-parity.ps1','scripts/form-checks/C3ExpressionParityChecks.java','scripts/form-checks/C3ExpressionParityChecks.ts')){$Inputs+=[pscustomobject]@{Path=$File;Hash=(Get-FileHash -LiteralPath (Join-Path $Root $File)).Hash}}
function Assert-Inputs{foreach($Input in $Inputs){if((Get-FileHash -LiteralPath (Join-Path $Root $Input.Path)).Hash -ne $Input.Hash){throw 'C3 expression input changed'}}}
Assert-Inputs
$Inputs|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $Output 'inputs.json') -Encoding utf8NoBOM
$Module=Join-Path $Root 'cloudflow-backend/cloudflow-service-workflow'
$Dependencies=(Get-Content -LiteralPath (Join-Path $Module 'target/batch-c-classpath.txt') -Raw).Trim()
$Classpath=(Join-Path $Module 'src/main/resources')+[IO.Path]::PathSeparator+(Join-Path $Module 'target/classes')+[IO.Path]::PathSeparator+$Dependencies
Push-Location (Join-Path $Root 'cloudflow-frontend')
try {
    & npx --no-install tsx (Join-Path $Root 'scripts/form-checks/C3ExpressionParityChecks.ts') $Output *> (Join-Path $Output 'frontend.log')
    if($LASTEXITCODE -ne 0){throw 'C3 frontend expression validation failed'}
    & java '-Dfile.encoding=UTF-8' '-Dstdout.encoding=UTF-8' '-Dstderr.encoding=UTF-8' -cp $Classpath (Join-Path $Root 'scripts/form-checks/C3ExpressionParityChecks.java') $Output *> (Join-Path $Output 'backend.log')
    if($LASTEXITCODE -ne 0){throw 'C3 backend expression validation failed'}
    & npx --no-install tsx (Join-Path $Root 'scripts/form-checks/C3ExpressionParityChecks.ts') $Output --compare *> (Join-Path $Output 'parity.log')
    if($LASTEXITCODE -ne 0){throw 'C3 frontend/backend expression results differ'}
    Get-Content -LiteralPath (Join-Path $Output 'parity.log')|Where-Object{$_ -match '^C3_EXPRESSION_PARITY:'}
    "C3_EXPRESSION_RESULT: inputs=$($Inputs.Count); changed=0; exit=0; runtime_database_writes=0"|Tee-Object -FilePath (Join-Path $Output 'summary.log')
} finally {Pop-Location;Assert-Inputs}
