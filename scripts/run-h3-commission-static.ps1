param([ValidatePattern('^r[1-9][0-9]*$')][string]$Round='r1')
$ErrorActionPreference='Stop'
. 'D:\CloudFlowPro\.cloudflow-runtime\use-data-drive.ps1'
$Root='D:\CloudFlowPro'
$Output=Join-Path $Root ".cloudflow-runtime/full-prd-20260915/approved-runtime/h3-commission-static-20261010-$Round"
if(Test-Path -LiteralPath $Output){throw 'Retain earlier commission static results'}
[IO.Directory]::CreateDirectory($Output)|Out-Null
$Scripts=@('scripts/java-style-checks/JavaExplicitTypeChecks.java','scripts/check-batch-h-contracts.mjs',
    'scripts/check-batch-h-contracts-sql.mjs','scripts/check-batch-h-contracts-selftest.mjs','scripts/run-h3-commission-static.ps1')
$Paths=@(rg --files cloudflow-backend cloudflow-frontend/src scripts docs/design -g '!**/target/**' -g '!**/node_modules/**')
$Inputs=@(foreach($Relative in @($Paths+$Scripts|Sort-Object -Unique)){
    $Path=Join-Path $Root $Relative
    [pscustomobject]@{Path=$Path;Hash=(Get-FileHash -LiteralPath $Path).Hash}
})
$Inputs|ConvertTo-Json -Depth 4|Set-Content -LiteralPath (Join-Path $Output 'inputs.json') -Encoding utf8NoBOM
foreach($Relative in $Scripts){
    $Copy=Join-Path $Output ('originals/'+$Relative)
    [IO.Directory]::CreateDirectory((Split-Path -Parent $Copy))|Out-Null
    [IO.File]::Copy((Join-Path $Root $Relative),$Copy,$false)
}
$Exit=0
try {
    & java scripts/java-style-checks/JavaExplicitTypeChecks.java --self-test *> (Join-Path $Output 'java-style.log')
    if($LASTEXITCODE -ne 0){throw 'Java explicit type self-check failed'}
    & java scripts/java-style-checks/JavaExplicitTypeChecks.java . *>> (Join-Path $Output 'java-style.log')
    if($LASTEXITCODE -ne 0){throw 'Java explicit type check failed'}
    & node scripts/check-batch-h-contracts.mjs --json *> (Join-Path $Output 'contracts.json')
    if($LASTEXITCODE -ne 0){throw 'Formal menu and seed contracts failed'}
    & node --test scripts/check-batch-h-contracts-selftest.mjs *> (Join-Path $Output 'contracts-self-test.log')
    if($LASTEXITCODE -ne 0){throw 'Formal contract checker self-tests failed'}
} catch { $Exit=1; $_.Exception.Message|Set-Content -LiteralPath (Join-Path $Output 'failure.txt') -Encoding utf8NoBOM }
$Changed=@($Inputs|Where-Object{-not (Test-Path -LiteralPath $_.Path) -or (Get-FileHash -LiteralPath $_.Path).Hash -ne $_.Hash}).Count
$Passed=$Exit -eq 0 -and $Changed -eq 0
[pscustomobject]@{Passed=$Passed;InputFiles=$Inputs.Count;Changed=$Changed;Exit=$Exit;CommissionBusinessValidated=$false}|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $Output 'result.json') -Encoding utf8NoBOM
Get-Content -LiteralPath (Join-Path $Output 'java-style.log')|Select-Object -Last 3
if(Test-Path -LiteralPath (Join-Path $Output 'contracts.json')){Get-Content -LiteralPath (Join-Path $Output 'contracts.json') -Raw|ConvertFrom-Json|Select-Object -ExpandProperty summary}
"H3_COMMISSION_STATIC: passed=$Passed; inputs=$($Inputs.Count); changed=$Changed"
if(-not $Passed){throw 'Commission static check failed; original inputs and logs retained'}
