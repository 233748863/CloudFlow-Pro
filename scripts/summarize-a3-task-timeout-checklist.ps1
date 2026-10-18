$ErrorActionPreference='Stop'
$Root='D:\CloudFlowPro'
. (Join-Path $Root '.cloudflow-runtime/use-data-drive.ps1')
$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
function Require-Markers([string]$File,[string[]]$Markers){
    $Content=Get-Content -LiteralPath (Join-Path $Evidence $File) -Raw
    foreach($Marker in $Markers){if($Content -notmatch $Marker){throw "Required evidence missing: $File"}}
    "A3_TASK_TIMEOUT_EVIDENCE: file=$File; markers=true"
}
function Assert-Inputs([string]$File){
    $Inputs=@(Get-Content -LiteralPath (Join-Path $Evidence $File) -Raw|ConvertFrom-Json)
    if(-not $Inputs.Count){throw 'Nonempty evidence snapshot required'}
    foreach($Item in $Inputs){
        $InputFile=if([IO.Path]::IsPathRooted($Item.Path)){$Item.Path}else{Join-Path $Root $Item.Path}
        if((Get-FileHash -LiteralPath $InputFile).Hash -ne $Item.Hash){throw "Current input mismatch: $File"}
    }
    "A3_TASK_TIMEOUT_INPUTS: file=$File; files=$($Inputs.Count); changed=0"
}
Require-Markers 'h3-portal-finance-20261002-backend-r24.log' @('BUILD SUCCESS','\[static-rules\] no findings','FINANCE_BUILD: phase=Backend; files=3818; changed=0; exit=0')
Require-Markers 'h3-portal-finance-20261002-frontend-r7.log' @('> tsc --noEmit','built in ','FINANCE_BUILD: phase=Frontend; files=1475; changed=0; exit=0')
Assert-Inputs 'h3-portal-finance-20261002-backend-r24-inputs.json'
Assert-Inputs 'h3-portal-finance-20261002-frontend-r7-inputs.json'

# R6 already tested the final template, schema, permissions and adjacent database behavior.
# Since R6 only the renewable timeout lock and its two verification sources changed.
$Prior=@(Get-Content -LiteralPath (Join-Path $Evidence 'h3-portal-finance-adjacent-20261002-r6/inputs.json') -Raw|ConvertFrom-Json)
$Changed=@($Prior|Where-Object{(Get-FileHash -LiteralPath (Join-Path $Root $_.Path)).Hash -ne $_.Hash}|ForEach-Object{$_.Path.Replace('\','/')})
$Allowed=@('cloudflow-backend/cloudflow-service-workflow/src/main/java/com/cloudflow/workflow/job/TaskTimeoutJob.java',
    'scripts/job-checks/TaskTimeoutScanChecks.java','scripts/verify-a3-task-timeout.mjs')
if(@(Compare-Object $Allowed $Changed).Count){throw 'Delta exceeds the reverified timeout lock and runtime checks'}
Require-Markers 'h3-portal-finance-adjacent-20261002-r6/summary.log' @('regenerated_matches_formal=true; formal_modified=false','files=6120; changed=0; exit=0; production_modified=false')
Require-Markers 'h3-portal-finance-adjacent-20261002-r6/oa-database.log' @('Complete approved schema table count; expected=374; actual=374','PASS: 1012 OA boundary assertions')
Require-Markers 'h3-portal-finance-adjacent-20261002-r6/sources.log' @('MP_SQL_LAST_APPLY: matches=0','MYBATIS_ANNOTATION_SQL: matches=0','login_only_external_endpoints=0','JAVA_PERMISSION_PREFIXES:.*invalid=0','STATIC_WHITELIST:.*stale_lines=0','EXIT_CODE=0')
Require-Markers 'h3-portal-finance-adjacent-20261002-r6/menu.log' @('EMPLOYEE_UNEXPECTED_GRANTS=0; EMPLOYEE_UNEXPECTED_WRITE_PERMISSIONS=0','APPROVED_MENU_SCOPE_PASS=true')
Require-Markers 'a3-task-timeout-checks-20261003-r2/checks.log' @('TASK_TIMEOUT_SCAN_CHECKS: checks=252; failed=0;','real_job_notifications_and_spring_transactions=true; controlled_engine_redis_locks_and_mappers=true; actual_database=false')
Require-Markers 'a3-task-timeout-checks-20261003-r2/batch-b.log' @('PASS: 712 workflow batch B checks')
Require-Markers 'a3-task-timeout-checks-20261003-r2/java-types.log' @('JAVA_EXPLICIT_TYPES: files=3688; inferred_declarations=0;')
Assert-Inputs 'a3-task-timeout-checks-20261003-r2/inputs.json'
Require-Markers 'a3-task-timeout-20261003-http-r3.log' @('A3_TASK_TIMEOUT_REAL_RESULT: checks=44; failed=0; requests=56;',
    '"messageFailure":true','"rollback":true','"continuation":true','"alarm":true','"backoff":true','"recovery":true',
    '"manualFailure":true','"manualLimit":true','"delivery":true','"repeat":true','"cleanup":true','"permissions":true','"restoration":true','"secrets":true',
    '"realStarts":5','"automaticCompleted":3','"manualTransfers":1','"timeoutMessages":7','"automaticRetryLimit":3','"backoffMs":300000',
    '"realMessageRegistrationFailure":true','"realManualRegistrationFailure":true','"forcedTerminalWrites":0','"naturalFiveMinuteWait":false',
    '"leaks":0','"databaseLeaks":0','A3_TASK_TIMEOUT_INPUTS: files=19; changed=0; product_changed=0; exit=0')
Assert-Inputs 'a3-task-timeout-20261003-inputs-r3.json'
Require-Markers 'a3-task-timeout-launch-20261003-r3.log' @('A3_TASK_TIMEOUT_RUN_EXIT=0','OWNED_CAPTCHA_RESTORED: original_limit=100; original_ttl=-1;','counter_writes=0; database_unchanged=true; production_modified=false')
Require-Markers 'a3-task-timeout-service-restart-20261003-r1.log' @('ISOLATED_RESTART_READY: service=workflow;')
Require-Markers 'a3-task-timeout-template-20261003-r1.json' @('Only approved WF_TASK_TIMEOUT seed template in owned fixture','\$\{title\}','\$\{content\}')
foreach($Round in @('r1','r2')){
    Require-Markers "a3-task-timeout-20261003-http-$Round.log" @('failed=1;','"restoration":true','"secrets":true','A3_TASK_TIMEOUT_INPUTS: files=19; changed=0; product_changed=0; exit=1')
    Require-Markers "a3-task-timeout-launch-20261003-$Round.log" @('OWNED_CAPTCHA_RESTORED: original_limit=100; original_ttl=-1;')
}
$State=Get-Content -LiteralPath (Join-Path $Root '.cloudflow-runtime/batch-g-integration/9799534e1a3a47b5958330f14ae16dc7/state.json') -Raw|ConvertFrom-Json
if($State.status -ne 'RUNNING' -or $State.processes.Count -ne 9 -or $State.services.Count -ne 6){throw 'Owned environment incomplete'}
foreach($Entry in $State.processes){$Observed=Get-CimInstance Win32_Process -Filter "ProcessId=$($Entry.id)";if(-not $Observed -or -not $Observed.CommandLine.Contains($Entry.marker)){throw 'Owned process identity mismatch'}}
foreach($Service in $State.services){$Health=Invoke-RestMethod -Uri "http://127.0.0.1:$($Service.healthPort)/actuator/health" -TimeoutSec 15;if($Health.status -ne 'UP'){throw 'Owned service not healthy'}}
$Checklist=@('maven-install-and-static-rules','frontend-types','frontend-build','formal-schema-374','menu-scope',
    'employee-grants','sql-concatenation','external-endpoint-protection','mybatis-last-apply','annotation-sql',
    'permission-prefixes','secret-protection-and-runtime-scan','static-whitelist','regenerated-demo')
foreach($Item in $Checklist){"A3_TASK_TIMEOUT_CHECKLIST_ITEM: item=$Item; passed=true"}
'A3_TASK_TIMEOUT_REUSE: adjacent=r6; changed_inputs=3; changed_product_files=1; remaining_prior_inputs=6117; schema_menus_and_frontend_unchanged=true; backend=r24; frontend=r7; historical_protocols_not_claimed_current=true'
'A3_TASK_TIMEOUT_RESTORATION: owned_processes=9; healthy_services=6; verification_inputs=19; changed=0; prior_round_evidence_retained=true'
"A3_TASK_TIMEOUT_CHECKLIST: items=$($Checklist.Count); missing=0; service_rules=252; adjacent_workflow_rules=712; actual_checks=44; complete_35_prd=false; production_modified=false"
