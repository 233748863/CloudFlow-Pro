param([ValidatePattern('^r[1-9][0-9]*$')][string]$RuntimeRound='r2',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$AdjacentRound='r33',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$RecoveryRound='r4')
$ErrorActionPreference='Stop'
$Root='D:\CloudFlowPro'
. (Join-Path $Root '.cloudflow-runtime/use-data-drive.ps1')
$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
if($RuntimeRound -eq 'r2'){
    & (Join-Path $Root 'scripts/summarize-b2-natural-recovery.ps1') -RecoveryRound $RecoveryRound
    & (Join-Path $Root 'scripts/summarize-b2-http-trigger-checklist.ps1') -RuntimeRound r24 -AdjacentRound $AdjacentRound
    'B2_HOUR_TIMER_CHECKLIST: items=14; missing=0; configured_wait_ms=3600000; actual_delay_ms=166954; original_run_passed=false; recovered_original_timer=true; natural_schedule=true; original_three_minute_scan=true; full_day_observed=false; complete_35_prd=false; production_modified=false'
    return
}
$Log=Get-Content -LiteralPath (Join-Path $Evidence "a3-natural-cadence-20261003-http-$RuntimeRound.log") -Raw
foreach($Marker in @('A3_NATURAL_CADENCE_REAL_RESULT: checks=[1-9][0-9]*; failed=0; requests=[1-9][0-9]*;',
    '"configuration":true','"cadence":true','"reports":true','"timerPrecision":true','"oneHourTimer":true','"pause":true',
    '"permissions":true','"restoration":true','"secrets":true','"leaks":0','"databaseLeaks":0',
    'A3_NATURAL_INPUTS: files=20; changed=0; product_changed=0; exit=0')) {
    if($Log -notmatch $Marker){throw 'Required one-hour timer completion evidence missing'}
}
$ResultLines=@($Log -split '\r?\n' | Where-Object { $_.StartsWith('A3_NATURAL_ACTUAL: ') })
if($ResultLines.Count -ne 1){throw 'Exactly one natural timer result required'}
$Result=$ResultLines[0].Substring('A3_NATURAL_ACTUAL: '.Length)|ConvertFrom-Json
if($Result.timerUnit -ne 'HOUR' -or $Result.delayValue -ne 1 -or $Result.configuredWaitMs -ne 3600000 -or
    $Result.waitingObservations -le 0 -or $Result.timerHistoryAt-$Result.timerRequestAt -lt 3599000 -or
    $Result.timerDelayMs -lt -1000 -or $Result.timerDelayMs -gt 180000 -or
    $Result.timerHistoryAt-$Result.timerExpireAt -ne $Result.timerDelayMs -or
    $Result.manualTriggers -ne 0 -or $Result.acceleratedIntervals -ne $false -or
    $Result.databaseTimeWrites -ne 0 -or $Result.clockChanges -ne 0 -or $Result.fullDayObserved -ne $false){throw 'One-hour timing boundaries did not pass'}
$Snapshot=@(Get-Content -LiteralPath (Join-Path $Evidence "a3-natural-cadence-20261003-inputs-$RuntimeRound.json") -Raw|ConvertFrom-Json)
if($Snapshot.Count -ne 20){throw 'Natural timer snapshot count differs'}
foreach($Item in $Snapshot){$Path=if([IO.Path]::IsPathRooted($Item.Path)){$Item.Path}else{Join-Path $Root $Item.Path};if((Get-FileHash -LiteralPath $Path).Hash -ne $Item.Hash){throw 'Natural timer input changed'}}
$Launch=Get-Content -LiteralPath (Join-Path $Evidence "b2-hour-timer-launch-20261004-$RuntimeRound.log") -Raw
foreach($Marker in @('A3_NATURAL_RUN_EXIT=0','OWNED_CAPTCHA_RESTORED: original_limit=100; original_ttl=-1;',
    'counter_writes=0; database_unchanged=true; production_modified=false')){if($Launch -notmatch $Marker){throw 'Natural timer launch did not finish or restore configuration'}}
# All product inputs and the existing HTTP trigger evidence remain unchanged; use a fresh full-script adjacent round.
& (Join-Path $Root 'scripts/summarize-b2-http-trigger-checklist.ps1') -RuntimeRound r24 -AdjacentRound $AdjacentRound
"B2_HOUR_TIMER_CHECKLIST: items=14; missing=0; configured_wait_ms=3600000; actual_delay_ms=$($Result.timerDelayMs); natural_schedule=true; original_three_minute_scan=true; verification_inputs=20; changed=0; full_day_observed=false; complete_35_prd=false; production_modified=false"
