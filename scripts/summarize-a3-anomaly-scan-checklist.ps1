param([ValidatePattern('^r[1-9][0-9]*$')][string]$RuntimeRound='r8',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$AdjacentRound='r14',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$BackendRound='r40',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$DatabaseRound='r13')
$ErrorActionPreference='Stop'
$Root='D:\CloudFlowPro'
. (Join-Path $Root '.cloudflow-runtime/use-data-drive.ps1')
$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
function Require-Markers([string]$File,[string[]]$Markers){
    $Content=Get-Content -LiteralPath (Join-Path $Evidence $File) -Raw
    foreach($Marker in $Markers){if($Content -notmatch $Marker){throw "Required evidence missing: $File"}}
    "A3_ANOMALY_SCAN_EVIDENCE: file=$File; markers=true"
}
function Assert-Inputs([string]$File){
    $Inputs=@(Get-Content -LiteralPath (Join-Path $Evidence $File) -Raw|ConvertFrom-Json)
    if(-not $Inputs.Count){throw 'Nonempty snapshot required'}
    foreach($Item in $Inputs){$Path=if([IO.Path]::IsPathRooted($Item.Path)){$Item.Path}else{Join-Path $Root $Item.Path};if((Get-FileHash -LiteralPath $Path).Hash -ne $Item.Hash){throw "Input differs: $File"}}
    "A3_ANOMALY_SCAN_INPUTS: file=$File; files=$($Inputs.Count); changed=0"
}
Require-Markers "h3-portal-finance-20261002-backend-$BackendRound.log" @('BUILD SUCCESS','\[static-rules\] no findings','FINANCE_BUILD: phase=Backend; files=3820; changed=0; exit=0')
Require-Markers 'h3-portal-finance-20261002-frontend-r7.log' @('> tsc --noEmit','built in ','FINANCE_BUILD: phase=Frontend; files=1475; changed=0; exit=0')
Assert-Inputs "h3-portal-finance-20261002-backend-$BackendRound-inputs.json"
Assert-Inputs 'h3-portal-finance-20261002-frontend-r7-inputs.json'
$Database="a3-anomaly-scan-database-20261003-$DatabaseRound"
Require-Markers "$Database/checks.stdout.log" @('ANOMALY_SCAN_FINAL: checks=98; failed=0; cleanup_verified=true',
    'message_rollback_continuation_recovery=PASS','statistics_flag_rollback_and_pending_repair=PASS',
    'concurrency=same-monitor; result=PASS','concurrency=same-statistics-bucket; result=PASS',
    'page_rows=501; simultaneous_database_sessions=2; http=false; delivery=false',
    'event_notifications_real_spring_transactions=PASS','event_same_source_concurrency=PASS',
    'user_disabled_real_cleanup_transactions=PASS','disabled_last_candidate_concurrency=PASS',
    'disabled_stale_assignment_protection=PASS','disabled_reminder_process_identity=PASS')
Assert-Inputs "$Database/inputs.json"
$Outcome=Get-Content (Join-Path $Evidence "$Database/outcome.json") -Raw|ConvertFrom-Json
if($Outcome.ExitCode -ne 0 -or $Outcome.BackendRound -ne $BackendRound -or -not $Outcome.InputsUnchanged){throw 'Actual database checks incomplete'}
Require-Markers "a3-anomaly-scan-20261003-http-$RuntimeRound.log" @('A3_ANOMALY_SCAN_REAL_RESULT: checks=[1-9][0-9]*; failed=0; requests=[1-9][0-9]*;',
    '"counts":true','"failure":true','"retention":true','"alarm":true','"recovery":true','"repeat":true',
    '"permissions":true','"restoration":true','"secrets":true','"realThresholdFailure":true',
    '"positiveWorkflowAlarm":false','"naturalSchedule":false','"forcedBusinessWrites":0','"leaks":0','"databaseLeaks":0',
    '"eventRollback":true','"eventDelivery":true','"eventRestoration":true',
    '"httpBusinessRollback":true','"initiatorRead":true','"source":"WEIGHT_FALLBACK"',
    '"disabledFailure":true','"disabledRollback":true','"disabledRecovery":true','"disabledDelivery":true','"disabledRepeat":true','"disabledRestoration":true',
    '"automaticPendingRecovery":true','"originalEventReplay":true','"disabledCapacityRestoration":true',
    'A3_ANOMALY_SCAN_INPUTS: files=21; changed=0; product_changed=0; exit=0')
Assert-Inputs "a3-anomaly-scan-20261003-inputs-$RuntimeRound.json"
Require-Markers "a3-anomaly-scan-launch-20261003-$RuntimeRound.log" @('A3_ANOMALY_SCAN_RUN_EXIT=0','OWNED_CAPTCHA_RESTORED: original_limit=100; original_ttl=-1;',
    'counter_writes=0; database_unchanged=true; production_modified=false')
Require-Markers 'a3-disabled-user-restart-workflow-20261003-r2.log' @('ISOLATED_RESTART_READY: service=workflow;')
Require-Markers 'a3-disabled-user-batch-b-20261003-r2.log' @('PASS: 712','DISABLED_USER_BATCH_B: inputs=6; product_changed=0; changed=0; exit=0')
Assert-Inputs 'a3-disabled-user-batch-b-inputs-20261003-r2.json'
$Adjacent="h3-portal-finance-adjacent-20261002-$AdjacentRound"
Require-Markers "$Adjacent/summary.log" @('regenerated_matches_formal=true; formal_modified=false','name=java-explicit-types; exit=0','changed=0; exit=0; production_modified=false')
Require-Markers "$Adjacent/oa-database.log" @('Complete approved schema table count; expected=374; actual=374','PASS: 1012 OA boundary assertions')
Require-Markers "$Adjacent/sources.log" @('MP_SQL_LAST_APPLY: matches=0','MYBATIS_ANNOTATION_SQL: matches=0','login_only_external_endpoints=0','JAVA_PERMISSION_PREFIXES:.*invalid=0','STATIC_WHITELIST:.*stale_lines=0','EXIT_CODE=0')
Require-Markers "$Adjacent/menu.log" @('EMPLOYEE_UNEXPECTED_GRANTS=0; EMPLOYEE_UNEXPECTED_WRITE_PERMISSIONS=0','APPROVED_MENU_SCOPE_PASS=true')
Assert-Inputs "$Adjacent/inputs.json"
$State=Get-Content -LiteralPath (Join-Path $Root '.cloudflow-runtime/batch-g-integration/9799534e1a3a47b5958330f14ae16dc7/state.json') -Raw|ConvertFrom-Json
if($State.status -ne 'RUNNING' -or $State.processes.Count -ne 9 -or $State.services.Count -ne 6){throw 'Owned environment incomplete'}
foreach($Entry in $State.processes){$Observed=Get-CimInstance Win32_Process -Filter "ProcessId=$($Entry.id)";if(-not $Observed -or -not $Observed.CommandLine.Contains($Entry.marker)){throw 'Owned process identity mismatch'}}
foreach($Service in $State.services){$Health=Invoke-RestMethod -Uri "http://127.0.0.1:$($Service.healthPort)/actuator/health" -TimeoutSec 15;if($Health.status -ne 'UP'){throw 'Owned service unhealthy'}}
$Items=@('maven-install-and-static-rules','frontend-types','frontend-build','formal-schema-374','menu-scope',
    'employee-grants','sql-concatenation','external-endpoint-protection','mybatis-last-apply','annotation-sql',
    'permission-prefixes','secret-protection-and-runtime-scan','static-whitelist','regenerated-demo')
foreach($Item in $Items){"A3_ANOMALY_SCAN_CHECKLIST_ITEM: item=$Item; passed=true"}
'A3_ANOMALY_SCAN_RESTORATION: owned_processes=9; healthy_services=6; verification_inputs=21; original_config_unchanged=true'
"A3_ANOMALY_SCAN_CHECKLIST: items=$($Items.Count); missing=0; database_assertions=98; positive_workflow_alarm=false; positive_event_alarm=true; user_disabled_consumer=true; adjacent_database_checks=1012; complete_35_prd=false; production_modified=false"
