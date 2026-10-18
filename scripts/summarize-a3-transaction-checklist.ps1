param([ValidatePattern('^r[1-9][0-9]*$')][string]$RuntimeRound='r15',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$AdjacentRound='r17',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$RedisRound='r2')
$ErrorActionPreference='Stop'
$Root='D:\CloudFlowPro'
. (Join-Path $Root '.cloudflow-runtime/use-data-drive.ps1')
$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
function Require-Markers([string]$File,[string[]]$Markers){
    $Content=Get-Content -LiteralPath (Join-Path $Evidence $File) -Raw
    foreach($Marker in $Markers){if($Content -notmatch $Marker){throw "Required evidence missing: $File"}}
    "A3_TRANSACTION_EVIDENCE: file=$File; markers=true"
}
function Assert-Inputs([string]$File){
    $Inputs=@(Get-Content -LiteralPath (Join-Path $Evidence $File) -Raw|ConvertFrom-Json)
    if(-not $Inputs.Count){throw 'Nonempty snapshot required'}
    foreach($Item in $Inputs){$Path=if([IO.Path]::IsPathRooted($Item.Path)){$Item.Path}else{Join-Path $Root $Item.Path};if((Get-FileHash -LiteralPath $Path).Hash -ne $Item.Hash){throw "Input differs: $File"}}
    "A3_TRANSACTION_INPUTS: file=$File; files=$($Inputs.Count); changed=0"
}
Require-Markers 'h3-portal-finance-20261002-backend-r46.log' @('BUILD SUCCESS','\[static-rules\] no findings','FINANCE_BUILD: phase=Backend; files=3821; changed=0; exit=0')
Require-Markers 'h3-portal-finance-20261002-frontend-r7.log' @('> tsc --noEmit','built in ','FINANCE_BUILD: phase=Frontend; files=1475; changed=0; exit=0')
Assert-Inputs 'h3-portal-finance-20261002-backend-r46-inputs.json'
Assert-Inputs 'h3-portal-finance-20261002-frontend-r7-inputs.json'
Require-Markers "a3-anomaly-scan-20261003-http-$RuntimeRound.log" @(
    'A3_ANOMALY_SCAN_REAL_RESULT: checks=46; failed=0; requests=40;',
    '"transactionOnly":true','"counts":true','"failure":true','"retention":true','"alarm":true','"recovery":true',
    '"repeat":true','"permissions":true','"restoration":true','"secrets":true','"asyncRollback":true',
    '"asyncDelivery":true','"cleanupFailure":true','"cleanupRecovery":true','"demoRestoration":true',
    'A3_TRANSACTION_SCAN_ACTUAL:','"internalRequests":7','"realAsyncStarts":2','"realFailedTaskRuns":2',
    '"successfulRetryRows":1','"cleanupRows":1','"adjustedRetryDates":2','"successTimestampAged":true',
    '"naturalSchedule":false','"forcedBusinessTerminalWrites":0','"leaks":0','"databaseLeaks":0',
    'A3_ANOMALY_SCAN_INPUTS: files=23; changed=0; product_changed=0; exit=0')
Assert-Inputs "a3-anomaly-scan-20261003-inputs-$RuntimeRound.json"
Require-Markers "a3-anomaly-scan-launch-20261003-$RuntimeRound.log" @('A3_TRANSACTION_SCAN_RUN_EXIT=0',
    'OWNED_CAPTCHA_RESTORED: original_limit=100; original_ttl=-1;','counter_writes=0; database_unchanged=true; production_modified=false')
Require-Markers 'a3-transaction-restart-workflow-20261003-r1.log' @('ISOLATED_RESTART_READY: service=workflow;')
Require-Markers 'a3-offboard-batch-b-20261003-r6.log' @('PASS: 715 workflow batch B checks','OFFBOARD_BATCH_B: inputs=7; backend=r46; product_changed=0; changed=0; exit=0')
Assert-Inputs 'a3-offboard-batch-b-20261003-r6-inputs.json'
Require-Markers 'a3-transaction-callback-checks-20261003-r1.log' @('PASS: callback offline checks=254; real source, simulated database/Redis protocol; no online approval',
    'Callback checks: stable source SHA256=','no Maven, target writes, database access or service restarts')
$Rules='a3-transaction-consistency-checks-20261003-r4'
$Database='a3-transaction-consistency-database-20261003-r2'
$Redis="a3-transaction-redis-20261003-$RedisRound"
Require-Markers "$Rules/checks.stdout.log" @('TXN_CONSISTENCY_CHECKS: passed=449; failed=0;')
Require-Markers "$Database/checks.stdout.log" @('TXN_CONSISTENCY_DATABASE_FINAL: checks=20; failed=0','original_schema_untouched=true; temporary_schema_removed=true')
Require-Markers "$Redis/checks.stdout.log" @('TXN_CONSISTENCY_REDIS: checks=[1-9][0-9]*; failed=0; actual_redis=true; clients=2;',
    'production_service=true; controlled_mapper_transactions=true; isolated_names=true;','watchdog_ms=3000; observed_hold_ms=7000; database_access=false; owned_locks_removed=true')
foreach($Directory in @($Rules,$Database,$Redis)){
    $Outcome=Get-Content (Join-Path $Evidence "$Directory/outcome.json") -Raw|ConvertFrom-Json
    if($Outcome.ExitCode -ne 0 -or $Outcome.BackendRound -ne 'r46' -or -not $Outcome.InputsUnchanged){throw 'Rule/database/Redis completion mismatch'}
    Assert-Inputs "$Directory/inputs.json"
}
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
foreach($Item in $Items){"A3_TRANSACTION_CHECKLIST_ITEM: item=$Item; passed=true"}
'A3_TRANSACTION_RESTORATION: owned_processes=9; healthy_services=6; verification_inputs=23; captcha_restored=true; demo_restored=true'
"A3_TRANSACTION_CHECKLIST: items=$($Items.Count); missing=0; actual_retry_cleanup=true; real_redis_clients=2; natural_schedule=false; adjacent_database_checks=1012; complete_35_prd=false; production_modified=false"
