param([ValidatePattern('^r[1-9][0-9]*$')][string]$RuntimeRound='r24',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$AdjacentRound='r32',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$FrontendRound='r7')
$ErrorActionPreference='Stop'
$Root='D:\CloudFlowPro'
. (Join-Path $Root '.cloudflow-runtime/use-data-drive.ps1')
$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
function Require-Markers([string]$File,[string[]]$Markers){
    $Content=Get-Content -LiteralPath (Join-Path $Evidence $File) -Raw
    foreach($Marker in $Markers){if($Content -notmatch $Marker){throw "Required HTTP trigger evidence missing: $File"}}
    "B2_HTTP_TRIGGER_EVIDENCE: file=$File; markers=true"
}
$Snapshot=@(Get-Content -LiteralPath (Join-Path $Evidence "a3-anomaly-scan-20261003-inputs-$RuntimeRound.json") -Raw|ConvertFrom-Json)
if(-not $Snapshot.Count){throw 'Nonempty HTTP verification snapshot required'}
foreach($Item in $Snapshot){$Path=if([IO.Path]::IsPathRooted($Item.Path)){$Item.Path}else{Join-Path $Root $Item.Path};if((Get-FileHash -LiteralPath $Path).Hash -ne $Item.Hash){throw 'HTTP verification inputs changed'}}
Require-Markers "a3-anomaly-scan-20261003-http-$RuntimeRound.log" @('A3_ANOMALY_SCAN_REAL_RESULT: checks=[1-9][0-9]*; failed=0; requests=[1-9][0-9]*;',
    '"triggerOnly":true','"triggerRollback":true','"triggerStatsRollback":true','"triggerRecovery":true','"triggerRestoration":true',
    '"httpAddressProtection":true','"httpSyncSuccess":true','"httpFailureStrategies":true','"httpReplay":true','"httpNoRedirect":true',
    '"httpTimeout":true','"httpAsyncSuccess":true','"httpRestoration":true','"secrets":true',
    'B2_HTTP_TRIGGER_ACTUAL:','"listenerLoopback":true','"realWorkflowEndpoints":true','"failStrategies":3','"realDeadLetterReplay":true',
    '"forcedWorkflowOutcomeWrites":0','"leaks":0','"databaseLeaks":0',"A3_ANOMALY_SCAN_INPUTS: files=$($Snapshot.Count); changed=0; product_changed=0; exit=0")
Require-Markers "b2-http-trigger-actual-launch-20261004-$RuntimeRound.log" @('A3_ANOMALY_SCAN_RUN_EXIT=0',
    'OWNED_CAPTCHA_RESTORED: original_limit=100; original_ttl=-1;','counter_writes=0; database_unchanged=true; production_modified=false')
# The unchanged B59 build and earlier lock runtime remain the product baseline. The fresh adjacent round verifies all current scripts.
& (Join-Path $Root 'scripts/summarize-a3-deadlock-scan-checklist.ps1') -RuntimeRound r11 -AdjacentRound $AdjacentRound -BackendRound r59 -FrontendRound $FrontendRound -RulesRound r8 -OwnershipRound r21 `
    -ExpectedRulesChecks 797 -ExpectedBackendFiles 3822 -ExpectedOwnershipChecks 422 -ExpectedRuntimeInputs 20 `
    -RegistrationChecks -SharedMonitorChecks -EventMetadataChecks -RecoveryChecks -BusinessLockChecks `
    -RuntimeLaunchFile 'a3-workflow-lock-actual-launch-20261004-r11.log' -RestartLogFile 'a3-workflow-lock-refresh-20261004-b59.log'
"B2_HTTP_TRIGGER_CHECKLIST: items=14; missing=0; actual_http=true; controlled_receiving_service=true; verification_inputs=$($Snapshot.Count); changed=0; original_whitelist_restored=true; complete_35_prd=false; production_modified=false"
