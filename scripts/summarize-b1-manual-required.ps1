param([ValidatePattern('^r[1-9][0-9]*$')][string]$RuntimeRound='r83',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$BackendRound='r73',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$FrontendRound='r37',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$RulesRound='r1',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$AdjacentRound='r63')
$ErrorActionPreference='Stop'
. 'D:\CloudFlowPro\.cloudflow-runtime\use-data-drive.ps1'
$Root='D:\CloudFlowPro'
$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
function Assert-Inputs([string]$File){
    $Inputs=@(Get-Content -LiteralPath (Join-Path $Evidence $File) -Raw|ConvertFrom-Json)
    if(-not $Inputs.Count){throw 'Manual required input snapshot missing'}
    foreach($Input in $Inputs){$FilePath=if([IO.Path]::IsPathRooted($Input.Path)){$Input.Path}else{Join-Path $Root $Input.Path};if((Get-FileHash -LiteralPath $FilePath).Hash -ne $Input.Hash){throw "Manual required input changed: $File"}}
    "B1_MANUAL_REQUIRED_INPUTS: files=$($Inputs.Count); changed=0; snapshot=$File"
}
foreach($File in @("h3-portal-finance-20261002-backend-$BackendRound-inputs.json","h3-portal-finance-20261002-frontend-$FrontendRound-inputs.json","b1-manual-required-checks-20261005-$RulesRound/inputs.json","a3-anomaly-scan-20261003-inputs-$RuntimeRound.json","h3-portal-finance-adjacent-20261002-$AdjacentRound/inputs.json")){Assert-Inputs $File}
$Rules=Get-Content -LiteralPath (Join-Path $Evidence "b1-manual-required-checks-20261005-$RulesRound/summary.log") -Raw
if($Rules -notmatch 'changed=0; exit=0'){throw 'Manual required rules incomplete'}
$Log=Get-Content -LiteralPath (Join-Path $Evidence "a3-anomaly-scan-20261003-http-$RuntimeRound.log")
$Raw=$Log -join "`n"
foreach($Marker in @('"b1ManualRequired":true','"b1ManualRequiredRestoration":true','"secrets":true','"leaks":0','"databaseLeaks":0','failed=0; requests=','product_changed=0; exit=0')){if($Raw -notmatch $Marker){throw 'Manual required actual evidence incomplete'}}
$Records=@($Log|Where-Object{$_ -like 'B1_MANUAL_REQUIRED_ACTUAL: *'}|ForEach-Object{$_.Substring('B1_MANUAL_REQUIRED_ACTUAL: '.Length)|ConvertFrom-Json})
if($Records.Count -ne 1){throw 'Unique manual required actual result required'}
$Actual=$Records[0]
if($Actual.starts -ne 6 -or $Actual.completions -ne 11 -or $Actual.pageCompletions -ne 4 -or $Actual.traceViews -ne 5 -or $Actual.rejected -ne 3 -or -not $Actual.legacyRuntimePreserved -or -not $Actual.legacySaveCleaned -or -not $Actual.ordinaryApprovalPreserved -or $Actual.pageErrors -ne 0 -or $Actual.forcedWorkflowOutcomeWrites -ne 0){throw 'Manual required behavior incomplete'}
$Launch=Get-Content -LiteralPath (Join-Path $Evidence "b1-manual-required-live-$RuntimeRound-launch.log") -Raw
if($Launch -notmatch 'B1_MANUAL_REQUIRED_RUN_EXIT=0' -or $Launch -notmatch 'OWNED_CAPTCHA_RESTORED: original_limit=100; original_ttl=-1;' -or $Launch -notmatch 'counter_writes=0; database_unchanged=true; production_modified=false'){throw 'Manual required allowance restoration incomplete'}
$Adjacent=Get-Content -LiteralPath (Join-Path $Evidence "h3-portal-finance-adjacent-20261002-$AdjacentRound/summary.log") -Raw
$Database=Get-Content -LiteralPath (Join-Path $Evidence "h3-portal-finance-adjacent-20261002-$AdjacentRound/oa-database.log") -Raw
if($Adjacent -notmatch 'changed=0; exit=0; production_modified=false' -or $Database -notmatch 'expected=374; actual=374' -or $Database -notmatch 'PASS: 1012 OA boundary assertions'){throw 'Manual required adjacent evidence incomplete'}
$State=Get-Content -LiteralPath (Join-Path $Root '.cloudflow-runtime/batch-g-integration/9799534e1a3a47b5958330f14ae16dc7/state.json') -Raw|ConvertFrom-Json
if($State.status -ne 'RUNNING' -or $State.processes.Count -ne 9 -or $State.services.Count -ne 6){throw 'Owned services incomplete'}
foreach($Entry in $State.processes){$Observed=Get-CimInstance Win32_Process -Filter "ProcessId=$($Entry.id)";if(-not $Observed -or -not $Observed.CommandLine.Contains($Entry.marker)){throw 'Owned process identity changed'}}
foreach($Service in $State.services){$Health=Invoke-RestMethod -Uri "http://127.0.0.1:$($Service.healthPort)/actuator/health" -TimeoutSec 15;if($Health.status -ne 'UP'){throw 'Owned service unhealthy'}}
'B1_MANUAL_REQUIRED_SUMMARY: starts=6; human_completions=11; page_completions=4; trace_views=5; rejected_policies=3; healthy_services=6; complete_35_prd=false; production_modified=false'
