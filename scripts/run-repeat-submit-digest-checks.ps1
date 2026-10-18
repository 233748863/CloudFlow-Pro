param([Parameter(Mandatory=$true)][ValidatePattern('^r[1-9][0-9]*$')][string]$Round,
    [Parameter(Mandatory=$true)][ValidatePattern('^r[1-9][0-9]*$')][string]$BackendRound,
    [Parameter(Mandatory=$true)][ValidateSet('Record','Verify')][string]$Mode,
    [ValidatePattern('^r[1-9][0-9]*$')][string]$BaselineRound='r1')
$ErrorActionPreference='Stop'
. 'D:\CloudFlowPro\.cloudflow-runtime\use-data-drive.ps1'
$Root='D:\CloudFlowPro'
$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
$Output=Join-Path $Evidence "repeat-submit-digest-checks-20261009-$Round"
if(Test-Path -LiteralPath $Output){throw 'Preserve previous digest verification'}
if($Mode -eq 'Record' -and $Round -ne $BaselineRound){throw 'Baseline recording must identify its own round'}
$Baseline=Join-Path $Evidence "repeat-submit-digest-checks-20261009-$BaselineRound/baseline-digests.json"
if($Mode -eq 'Verify' -and -not(Test-Path -LiteralPath $Baseline)){throw 'Recorded original digests required'}
$Sources=@('scripts/run-repeat-submit-digest-checks.ps1','scripts/platform-checks/RepeatSubmitDigestChecks.java')
$BuildPath=Join-Path $Evidence "h3-portal-finance-20261002-backend-$BackendRound-inputs.json"
$Inputs=@(Get-Content -LiteralPath $BuildPath -Raw|ConvertFrom-Json|ForEach-Object{
    [pscustomobject]@{Path=[IO.Path]::GetFullPath($_.Path,$Root);Hash=$_.Hash}
})
$ClassPathFile=Join-Path $Root 'cloudflow-backend/cloudflow-service-hr/target/report-classpath.txt'
$ClassPathEntries=@((Join-Path $Root 'cloudflow-backend/cloudflow-service-hr/target/classes'))+(Get-Content -LiteralPath $ClassPathFile -Raw).Trim().Split(';')
$Paths=@($ClassPathFile,$BuildPath)+@($Sources|ForEach-Object{Join-Path $Root $_})
if($Mode -eq 'Verify'){$Paths+=$Baseline}
foreach($Entry in $ClassPathEntries){
    $Path=[IO.Path]::GetFullPath($Entry)
    if(-not($Path.StartsWith($Root+'\',[StringComparison]::OrdinalIgnoreCase) -or $Path.StartsWith('D:\CloudFlowProCache\',[StringComparison]::OrdinalIgnoreCase))){throw 'Unapproved digest dependency path'}
    if(Test-Path -LiteralPath $Path -PathType Container){$Paths+=@(Get-ChildItem -LiteralPath $Path -File -Recurse|ForEach-Object FullName)}else{$Paths+=$Path}
}
$Inputs+=@($Paths|Sort-Object -Unique|ForEach-Object{[pscustomobject]@{Path=$_;Hash=(Get-FileHash -LiteralPath $_).Hash}})
function Assert-Inputs {foreach($Item in $Inputs){if((Get-FileHash -LiteralPath $Item.Path).Hash -ne $Item.Hash){throw 'Digest verification input changed'}}}
Assert-Inputs
[IO.Directory]::CreateDirectory($Output)|Out-Null
$Inputs|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $Output 'inputs.json') -Encoding utf8NoBOM
foreach($Source in $Sources){[IO.File]::Copy((Join-Path $Root $Source),(Join-Path $Output ('original-'+(Split-Path -Leaf $Source))),$false)}
$ClassPath=$ClassPathEntries -join ';'
$Compile=Join-Path $Output 'compile.args'
[IO.File]::WriteAllLines($Compile,@('-encoding','UTF-8','-proc:none','-classpath',('"'+$ClassPath.Replace('\','/')+'"'),'-d',('"'+$Output.Replace('\','/')+'"'),('"'+(Join-Path $Root $Sources[1]).Replace('\','/')+'"')),[Text.UTF8Encoding]::new($false))
& javac "@$Compile" *> (Join-Path $Output 'compile.log')
if($LASTEXITCODE -ne 0){throw 'Digest verification compilation failed'}
$Arguments=Join-Path $Output 'run.args'
[IO.File]::WriteAllLines($Arguments,@('-Xmx256m','-classpath',('"'+($Output+';'+$ClassPath).Replace('\','/')+'"'),'com.cloudflow.common.idempotent.checks.RepeatSubmitDigestChecks',$Mode,('"'+$Baseline.Replace('\','/')+'"'),('"'+(Join-Path $Output 'checks.json').Replace('\','/')+'"')),[Text.UTF8Encoding]::new($false))
& java "@$Arguments" *> (Join-Path $Output 'checks.log')
if($LASTEXITCODE -ne 0){throw 'Digest compatibility verification failed'}
Assert-Inputs
$Checks=Get-Content -LiteralPath (Join-Path $Output 'checks.json') -Raw|ConvertFrom-Json
if(-not $Checks.passed -or $Checks.vectors -ne 40 -or $Checks.parallelCalls -ne 640){throw 'Incomplete digest verification'}
[pscustomobject]@{Passed=$true;Mode=$Mode;BackendRound=$BackendRound;BaselineRound=$BaselineRound;Inputs=$Inputs.Count;InputChanges=0;Vectors=$Checks.vectors;Checks=$Checks.checks;ParallelCalls=$Checks.parallelCalls;BaselineHash=(Get-FileHash -LiteralPath $Baseline).Hash;BusinessRequests=0;RedisWrites=0;ExternalMessages=0}|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $Output 'result.json') -Encoding utf8NoBOM
Get-Content -LiteralPath (Join-Path $Output 'checks.log')|Where-Object{$_ -match '^REPEAT_DIGEST_CHECKS:'}
"REPEAT_DIGEST_SUMMARY: backend=$BackendRound; mode=$Mode; inputs=$($Inputs.Count); changed=0; passed=true"
