param([ValidatePattern('^r[1-9][0-9]*$')][string]$Round='r1',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$BackendRound='r75')
$ErrorActionPreference='Stop'
. 'D:\CloudFlowPro\.cloudflow-runtime/use-data-drive.ps1'
$Root='D:\CloudFlowPro'
$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
$Output=Join-Path $Evidence "c2-precision-input-20261005-$Round"
if(Test-Path -LiteralPath $Output){throw 'Retain previous precision input evidence'}
[IO.Directory]::CreateDirectory($Output)|Out-Null
$Module=Join-Path $Root 'cloudflow-backend/cloudflow-service-workflow'
$DependencyFile=Join-Path $Module 'target/batch-c-classpath.txt'
if(-not(Test-Path -LiteralPath $DependencyFile)){$DependencyFile=Join-Path $Module 'target/batch-h-classpath.txt'}
$Dependencies=(Get-Content -LiteralPath $DependencyFile -Raw).Trim()
$Classpath=(Join-Path $Module 'src/main/resources')+[IO.Path]::PathSeparator+(Join-Path $Module 'target/classes')+[IO.Path]::PathSeparator+$Dependencies
$Inputs=@(Get-Content -LiteralPath (Join-Path $Evidence "h3-portal-finance-20261002-backend-$BackendRound-inputs.json") -Raw|ConvertFrom-Json)
foreach($File in @('scripts/run-c2-precision-input.ps1','scripts/form-checks/C2PrecisionInputChecks.java')){$Inputs+=[pscustomobject]@{Path=$File;Hash=(Get-FileHash -LiteralPath (Join-Path $Root $File)).Hash}}
function Assert-Inputs{foreach($Input in $Inputs){if((Get-FileHash -LiteralPath (Join-Path $Root $Input.Path)).Hash -ne $Input.Hash){throw 'Precision input source changed'}}}
Assert-Inputs
$Inputs|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $Output 'inputs.json') -Encoding utf8NoBOM
try {
    & java '-Dfile.encoding=UTF-8' '-Dstdout.encoding=UTF-8' '-Dstderr.encoding=UTF-8' -cp $Classpath (Join-Path $Root 'scripts/form-checks/C2PrecisionInputChecks.java') *> (Join-Path $Output 'checks.log')
    $RunExit=$LASTEXITCODE
    Get-Content -LiteralPath (Join-Path $Output 'checks.log')|Where-Object{$_ -match '^C2_PRECISION_INPUT:|^Exception|^\s+at C2PrecisionInputChecks|^\s+at com\.cloudflow\.'}
    "C2_PRECISION_INPUT_RESULT: inputs=$($Inputs.Count); exit=$RunExit; database_writes=0"
    if($RunExit -ne 0){throw 'Precision input validation failed; retained diagnostics'}
} finally {Assert-Inputs}
