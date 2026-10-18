param([ValidatePattern('^r[1-9][0-9]*$')][string]$RecoveryRound='r4')
$ErrorActionPreference='Stop'
$Root='D:\CloudFlowPro'
. (Join-Path $Root '.cloudflow-runtime/use-data-drive.ps1')
$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
$Original=Get-Content -LiteralPath (Join-Path $Evidence 'a3-natural-cadence-20261003-http-r2.log') -Raw
foreach($Marker in @('切换自有自然周期任务: HTTP 401','A3_NATURAL_INPUTS: files=20; changed=0; product_changed=0; exit=1',
    '"configuredWaitMs":3600000','"timerUnit":"HOUR"','"timerCompleted":false')){if($Original -notmatch $Marker){throw 'Original failure and natural observation evidence missing'}}
$Log=Get-Content -LiteralPath (Join-Path $Evidence "a3-natural-cadence-20261003-http-$RecoveryRound.log") -Raw
foreach($Marker in @('A3_NATURAL_CADENCE_REAL_RESULT: checks=[1-9][0-9]*; failed=0; requests=[0-9]+;',
    '"restoration":true','"secrets":true','"naturalRecovery":true','"recoveredOriginalTimer":true',
    'A3_NATURAL_INPUTS: files=21; changed=0; product_changed=0; exit=0')){if($Log -notmatch $Marker){throw 'Original timer recovery completion evidence missing'}}
$Lines=@($Log -split '\r?\n'|Where-Object{$_.StartsWith('B2_NATURAL_RECOVERY_ACTUAL: ')})
if($Lines.Count -ne 1){throw 'Exactly one recovery result required'}
$Result=$Lines[0].Substring('B2_NATURAL_RECOVERY_ACTUAL: '.Length)|ConvertFrom-Json
if($Result.originalRound -ne 'r2' -or $Result.originalRunPassed -or $Result.instance -ne '41ebab28-0f79-4b02-b9c2-1b7ca1d0b555' -or
    $Result.configuredWaitMs -ne 3600000 -or $Result.timerHistoryAt-$Result.timerRequestAt -lt 3599000 -or
    $Result.timerDelayMs -lt -1000 -or $Result.timerDelayMs -gt 180000 -or $Result.timerHistoryAt-$Result.timerExpireAt -ne $Result.timerDelayMs -or
    $Result.newTimers -ne 0 -or $Result.manualTriggers -ne 0 -or $Result.clockChanges -ne 0 -or $Result.databaseTimeWrites -ne 0 -or
    $Result.restoredOwnJobs -ne 4 -or $Result.fullDayObserved -or $Result.secrets.leaks -ne 0 -or $Result.secrets.databaseLeaks -ne 0){throw 'Recovered natural timing or restoration differs'}
$OriginalInputs=@(Get-Content -LiteralPath (Join-Path $Evidence 'a3-natural-cadence-20261003-inputs-r2.json') -Raw|ConvertFrom-Json)
$RecoveryInputs=@(Get-Content -LiteralPath (Join-Path $Evidence "a3-natural-cadence-20261003-inputs-$RecoveryRound.json") -Raw|ConvertFrom-Json)
if($OriginalInputs.Count -ne 20 -or $RecoveryInputs.Count -ne 21){throw 'Natural snapshot count differs'}
$AllowedChanges=@('scripts/verify-a3-natural-cadence.mjs','scripts/run-a3-natural-cadence.ps1')
$Changed=@()
foreach($Item in $OriginalInputs){$Path=if([IO.Path]::IsPathRooted($Item.Path)){$Item.Path}else{Join-Path $Root $Item.Path};if((Get-FileHash -LiteralPath $Path).Hash -ne $Item.Hash){$Changed+=$Item.Path}}
if((($Changed|Sort-Object) -join ',') -ne (($AllowedChanges|Sort-Object) -join ',')){throw 'Unexpected original timer input change'}
foreach($Item in $RecoveryInputs){$Path=if([IO.Path]::IsPathRooted($Item.Path)){$Item.Path}else{Join-Path $Root $Item.Path};if((Get-FileHash -LiteralPath $Path).Hash -ne $Item.Hash){throw 'Recovery input changed'}}
foreach($Round in @('r2',$RecoveryRound)){
    $Name=if($Round -eq 'r2'){'b2-hour-timer-launch-20261004-r2.log'}else{"b2-hour-timer-recovery-launch-20261004-$Round.log"}
    $Launch=Get-Content -LiteralPath (Join-Path $Evidence $Name) -Raw
    foreach($Marker in @('OWNED_CAPTCHA_RESTORED: original_limit=100; original_ttl=-1;','counter_writes=0; database_unchanged=true; production_modified=false')){if($Launch -notmatch $Marker){throw 'Captcha restoration evidence missing'}}
    if($Round -ne 'r2' -and $Launch -notmatch 'B2_NATURAL_RECOVERY_RUN_EXIT=0'){throw 'Recovery launch incomplete'}
}
"B2_NATURAL_RECOVERY_CHECKLIST: original_run_passed=false; recovered_original_timer=true; actual_delay_ms=$($Result.timerDelayMs); original_inputs=20; known_recovery_edits=2; recovery_inputs=21; recovery_changed=0; full_day_observed=false; production_modified=false"
