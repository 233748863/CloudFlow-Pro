param([ValidatePattern('^r[1-9][0-9]*$')][string]$RuntimeRound='r6',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$AdjacentRound='r9',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$BackendRound='r60',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$FrontendRound='r10',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$RulesRound='r9')
$ErrorActionPreference='Stop'
$Root='D:\CloudFlowPro'
. (Join-Path $Root '.cloudflow-runtime/use-data-drive.ps1')
$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
function Require-Markers([string]$File,[string[]]$Markers){
    $Content=Get-Content -LiteralPath (Join-Path $Evidence $File) -Raw
    foreach($Marker in $Markers){if($Content -notmatch $Marker){throw "Required evidence missing: $File"}}
    "A3_TIMER_SCAN_EVIDENCE: file=$File; markers=true"
}
function Assert-Inputs([string]$File){
    $Inputs=@(Get-Content -LiteralPath (Join-Path $Evidence $File) -Raw|ConvertFrom-Json)
    if(-not $Inputs.Count){throw 'Nonempty snapshot required'}
    foreach($Item in $Inputs){$Path=if([IO.Path]::IsPathRooted($Item.Path)){$Item.Path}else{Join-Path $Root $Item.Path};if((Get-FileHash -LiteralPath $Path).Hash -ne $Item.Hash){throw "Input differs: $File"}}
    "A3_TIMER_SCAN_INPUTS: file=$File; files=$($Inputs.Count); changed=0"
}
Require-Markers "h3-portal-finance-20261002-backend-$BackendRound.log" @('BUILD SUCCESS','\[static-rules\] no findings','FINANCE_BUILD: phase=Backend; files=[1-9][0-9]*; changed=0; exit=0')
Require-Markers "h3-portal-finance-20261002-frontend-$FrontendRound.log" @('> tsc --noEmit','built in ','FINANCE_BUILD: phase=Frontend; files=1475; changed=0; exit=0')
Assert-Inputs "h3-portal-finance-20261002-backend-$BackendRound-inputs.json"
Assert-Inputs "h3-portal-finance-20261002-frontend-$FrontendRound-inputs.json"
$Adjacent="h3-portal-finance-adjacent-20261002-$AdjacentRound"
Require-Markers "$Adjacent/summary.log" @('regenerated_matches_formal=true; formal_modified=false','changed=0; exit=0; production_modified=false')
Require-Markers "$Adjacent/oa-database.log" @('Complete approved schema table count; expected=374; actual=374','PASS: 1012 OA boundary assertions')
Require-Markers "$Adjacent/sources.log" @('MP_SQL_LAST_APPLY: matches=0','MYBATIS_ANNOTATION_SQL: matches=0','login_only_external_endpoints=0','JAVA_PERMISSION_PREFIXES:.*invalid=0','STATIC_WHITELIST:.*stale_lines=0','EXIT_CODE=0')
Require-Markers "$Adjacent/menu.log" @('EMPLOYEE_UNEXPECTED_GRANTS=0; EMPLOYEE_UNEXPECTED_WRITE_PERMISSIONS=0','APPROVED_MENU_SCOPE_PASS=true')
Assert-Inputs "$Adjacent/inputs.json"
Require-Markers "a3-timer-scan-checks-20261003-$RulesRound/timer.log" @('TIMER_SCAN_CHECKS: checks=[1-9][0-9]*; failed=0; real_scan_continuation_scheduler=true; database_redis_downstream_controlled=true')
Require-Markers "a3-timer-scan-checks-20261003-$RulesRound/batch-b.log" @('PASS: [1-9][0-9]* workflow batch B checks')
Require-Markers "a3-timer-scan-checks-20261003-$RulesRound/java-types.log" @('inferred_declarations=0;')
Assert-Inputs "a3-timer-scan-checks-20261003-$RulesRound/inputs.json"
$TimerContent=Get-Content (Join-Path $Evidence "a3-timer-scan-checks-20261003-$RulesRound/timer.log") -Raw
$TimerCount=[regex]::Match($TimerContent,'TIMER_SCAN_CHECKS: checks=([1-9][0-9]*);').Groups[1].Value
$BatchContent=Get-Content (Join-Path $Evidence "a3-timer-scan-checks-20261003-$RulesRound/batch-b.log") -Raw
$BatchCount=[regex]::Match($BatchContent,'PASS: ([1-9][0-9]*) workflow batch B checks').Groups[1].Value
Require-Markers "a3-timer-scan-20261003-http-$RuntimeRound.log" @('A3_TIMER_SCAN_REAL_RESULT: checks=[1-9][0-9]*; failed=0; requests=[1-9][0-9]*;',
    '"failure":true','"rollback":true','"continuation":true','"alarm":true','"backoff":true','"recovery":true',
    '"notification":true','"repeat":true','"cleanup":true','"permissions":true','"restoration":true','"secrets":true',
    '"invalidCacheIdentity":true','A3_TIMER_IDENTITY_ACTUAL: invalid_per_run=14; scan_and_cleanup=true; missing_wait_id_removed=true; persistent_waits_unchanged=true; extra_tasks=0; extra_messages=0',
    '"exhaustedRollback":true','"exhaustedRecipients":true','"exhaustedLimit":true','"exhaustedRecovery":true','"exhaustedRepeat":true',
    '"realStarts":8','"automaticCompleted":3','"notificationOnly":1','"timerMessages":4','"realMessageFailure":true',
    '"automaticAttemptsPerInstance":4','"blockedWaits":2','"notificationCollision":true','"durableRecovery":true','"fifthAutomaticExecution":false',
    '"forcedTerminalWrites":0','"naturalThreeMinuteWait":false','"leaks":0','"databaseLeaks":0',
    'A3_TIMER_SCAN_INPUTS: files=19; changed=0; product_changed=0; exit=0')
Assert-Inputs "a3-timer-scan-20261003-inputs-$RuntimeRound.json"
Require-Markers "a3-timer-scan-launch-20261003-$RuntimeRound.log" @('A3_TIMER_SCAN_RUN_EXIT=0','OWNED_CAPTCHA_RESTORED: original_limit=100; original_ttl=-1;','counter_writes=0; database_unchanged=true; production_modified=false')
Require-Markers 'a3-timer-identity-restart-workflow-20261004-r1.log' @('ISOLATED_RESTART_READY: service=workflow;')
$State=Get-Content -LiteralPath (Join-Path $Root '.cloudflow-runtime/batch-g-integration/9799534e1a3a47b5958330f14ae16dc7/state.json') -Raw|ConvertFrom-Json
if($State.status -ne 'RUNNING' -or $State.processes.Count -ne 9 -or $State.services.Count -ne 6){throw 'Owned environment incomplete'}
foreach($Entry in $State.processes){$Observed=Get-CimInstance Win32_Process -Filter "ProcessId=$($Entry.id)";if(-not $Observed -or -not $Observed.CommandLine.Contains($Entry.marker)){throw 'Owned process identity mismatch'}}
foreach($Service in $State.services){$Health=Invoke-RestMethod -Uri "http://127.0.0.1:$($Service.healthPort)/actuator/health" -TimeoutSec 15;if($Health.status -ne 'UP'){throw 'Owned service unhealthy'}}
$Items=@('maven-install-and-static-rules','frontend-types','frontend-build','formal-schema-374','menu-scope',
    'employee-grants','sql-concatenation','external-endpoint-protection','mybatis-last-apply','annotation-sql',
    'permission-prefixes','secret-protection-and-runtime-scan','static-whitelist','regenerated-demo')
foreach($Item in $Items){"A3_TIMER_SCAN_CHECKLIST_ITEM: item=$Item; passed=true"}
'A3_TIMER_SCAN_RESTORATION: owned_processes=9; healthy_services=6; verification_inputs=19; original_config_unchanged=true'
"A3_TIMER_SCAN_CHECKLIST: items=$($Items.Count); missing=0; timer_assertions=$TimerCount; original_workflow_checks=$BatchCount; adjacent_database_checks=1012; complete_35_prd=false; production_modified=false"
