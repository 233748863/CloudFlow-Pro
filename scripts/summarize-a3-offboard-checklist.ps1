param([ValidatePattern('^r[1-9][0-9]*$')][string]$BackendRound='r53',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$DatabaseRound='r21',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$BatchRound='r8',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$RuntimeRound='r21',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$AdjacentRound='r23',
    [ValidateRange(1,100000)][int]$ExpectedDatabaseChecks=198)
$ErrorActionPreference='Stop'
$Root='D:\CloudFlowPro'
. (Join-Path $Root '.cloudflow-runtime/use-data-drive.ps1')
$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
function Require-Markers([string]$File,[string[]]$Markers){
    $Content=Get-Content -LiteralPath (Join-Path $Evidence $File) -Raw
    foreach($Marker in $Markers){if($Content -notmatch $Marker){throw "Required evidence missing: $File"}}
    "A3_OFFBOARD_EVIDENCE: file=$File; markers=true"
}
function Assert-Inputs([string]$File){
    $Inputs=@(Get-Content -LiteralPath (Join-Path $Evidence $File) -Raw|ConvertFrom-Json)
    if(-not $Inputs.Count){throw 'Nonempty snapshot required'}
    foreach($Item in $Inputs){$Path=if([IO.Path]::IsPathRooted($Item.Path)){$Item.Path}else{Join-Path $Root $Item.Path};if((Get-FileHash -LiteralPath $Path).Hash -ne $Item.Hash){throw "Input differs: $File"}}
    "A3_OFFBOARD_INPUTS: file=$File; files=$($Inputs.Count); changed=0"
}
Require-Markers "h3-portal-finance-20261002-backend-$BackendRound.log" @('BUILD SUCCESS','\[static-rules\] no findings','FINANCE_BUILD: phase=Backend; files=3821; changed=0; exit=0')
Require-Markers 'h3-portal-finance-20261002-frontend-r7.log' @('> tsc --noEmit','built in ','FINANCE_BUILD: phase=Frontend; files=1475; changed=0; exit=0')
Assert-Inputs "h3-portal-finance-20261002-backend-$BackendRound-inputs.json"
Assert-Inputs 'h3-portal-finance-20261002-frontend-r7-inputs.json'
$Adjacent="h3-portal-finance-adjacent-20261002-$AdjacentRound"
Require-Markers "$Adjacent/summary.log" @('regenerated_matches_formal=true; formal_modified=false','changed=0; exit=0; production_modified=false')
Require-Markers "$Adjacent/oa-database.log" @('Complete approved schema table count; expected=374; actual=374','PASS: 1012 OA boundary assertions')
Require-Markers "$Adjacent/sources.log" @('JAVA_SQL_CONCAT: matches=0','MP_SQL_LAST_APPLY: matches=0','MYBATIS_ANNOTATION_SQL: matches=0','login_only_external_endpoints=0','JAVA_PERMISSION_PREFIXES:.*invalid=0','STATIC_WHITELIST:.*stale_lines=0','EXIT_CODE=0')
Require-Markers "$Adjacent/menu.log" @('EMPLOYEE_UNEXPECTED_GRANTS=0; EMPLOYEE_UNEXPECTED_WRITE_PERMISSIONS=0','APPROVED_MENU_SCOPE_PASS=true')
Assert-Inputs "$Adjacent/inputs.json"
$Database="a3-anomaly-scan-database-20261003-$DatabaseRound"
Require-Markers "$Database/checks.stdout.log" @("ANOMALY_SCAN_FINAL: checks=$ExpectedDatabaseChecks; failed=0; cleanup_verified=true",'long_name_and_released_handover_in_default_suite=true',
    'offboard_long_name=PASS; boundaries=64,65,100','offboard_after_disable=PASS','released_handover_scope_and_version=PASS',
    'released_handover_transaction_recovery=PASS','released_handover_concurrent_change=PASS; version_only=false','released_handover_concurrent_change=PASS; version_only=true',
    'offboard_frozen_h_participants=PASS; real_model_freeze_and_database=true; hr_http=false','original_schema_untouched=true')
Assert-Inputs "$Database/inputs.json"
$Outcome=Get-Content (Join-Path $Evidence "$Database/outcome.json") -Raw|ConvertFrom-Json
if($Outcome.ExitCode -ne 0 -or $Outcome.BackendRound -ne $BackendRound -or $Outcome.Focus -ne 'suite' -or -not $Outcome.InputsUnchanged){throw 'Database outcome mismatch'}
Require-Markers "a3-offboard-batch-b-20261003-$BatchRound.log" @('PASS: 723 workflow batch B checks',"OFFBOARD_BATCH_B: inputs=7; backend=$BackendRound; product_changed=0; changed=0; exit=0")
Assert-Inputs "a3-offboard-batch-b-20261003-$BatchRound-inputs.json"
Require-Markers "a3-anomaly-scan-20261003-http-$RuntimeRound.log" @('A3_ANOMALY_SCAN_REAL_RESULT: checks=[1-9][0-9]*; failed=0; requests=[1-9][0-9]*;',
    '"offboardOnly":true','"offboardCapacityRestoration":true','"offboardRelease":true','"offboardRollback":true','"offboardRecovery":true','"offboardSuccessorRead":true',
    '"offboardRepeat":true','"offboardLegacy":true','"offboardRestoration":true','"secrets":true','"leaks":0','"databaseLeaks":0','"forcedBusinessTerminalWrites":0',
    '人事停用真实成功且原密码摘要完整保持','A3_ANOMALY_SCAN_INPUTS: files=27; changed=0; product_changed=0; exit=0',
    '"hAdvanceDirect":true','"hAdvanceReleased":true','"hAdvanceHr":true','"hAdvanceRepeat":true','"hAdvanceRestoration":true',
    'A3_OFFBOARD_H_ADVANCE_ACTUAL: stages=2; direct_target_cases=6; released_target_cases=6; real_hr_applications=2; original_events_replayed=4; actual_business_withdrawals=2; all_h_business_types=false; forced_business_terminal_writes=0')
Assert-Inputs "a3-anomaly-scan-20261003-inputs-$RuntimeRound.json"
Require-Markers "a3-offboard-runtime-launch-20261003-$RuntimeRound.log" @('A3_OFFBOARD_RUN_EXIT=0','OWNED_CAPTCHA_RESTORED: original_limit=100; original_ttl=-1;','counter_writes=0; database_unchanged=true; production_modified=false')
Require-Markers 'a3-offboard-restart-workflow-20261003-r2.log' @('ISOLATED_RESTART_READY: service=workflow;')
Require-Markers 'a3-offboard-restart-auth-20261003-r1.log' @('ISOLATED_RESTART_READY: service=auth;')
$Before=@(Get-Content (Join-Path $Evidence 'a3-offboard-schema-20261003-r2/before-row-digests.json') -Raw|ConvertFrom-Json)
$After=@(Get-Content (Join-Path $Evidence 'a3-offboard-schema-20261003-r2/after-row-digests.json') -Raw|ConvertFrom-Json)
if($Before.Count -ne 11 -or (Compare-Object $Before $After -Property Table,Rows,Digest)){throw 'Original schema row preservation evidence differs'}
Assert-Inputs 'a3-offboard-schema-20261003-r2/inputs.json'
$State=Get-Content (Join-Path $Root '.cloudflow-runtime/batch-g-integration/9799534e1a3a47b5958330f14ae16dc7/state.json') -Raw|ConvertFrom-Json
if($State.status -ne 'RUNNING' -or $State.processes.Count -ne 9 -or $State.services.Count -ne 6){throw 'Owned environment incomplete'}
foreach($Entry in $State.processes){$Observed=Get-CimInstance Win32_Process -Filter "ProcessId=$($Entry.id)";if(-not $Observed -or -not $Observed.CommandLine.Contains($Entry.marker)){throw 'Owned process identity mismatch'}}
foreach($Service in $State.services){$Health=Invoke-RestMethod -Uri "http://127.0.0.1:$($Service.healthPort)/actuator/health" -TimeoutSec 15;if($Health.status -ne 'UP'){throw 'Owned service unhealthy'}}
$Items=@('maven-install-and-static-rules','frontend-types','frontend-build','formal-schema-374','menu-scope','employee-grants','sql-concatenation','external-endpoint-protection','mybatis-last-apply','annotation-sql','permission-prefixes','secret-protection-and-runtime-scan','static-whitelist','regenerated-demo')
foreach($Item in $Items){"A3_OFFBOARD_CHECKLIST_ITEM: item=$Item; passed=true"}
"A3_OFFBOARD_CHECKLIST: items=$($Items.Count); missing=0; database_checks=$ExpectedDatabaseChecks; adjacent_database_checks=1012; owned_processes=9; healthy_services=6; actual_hr_handover=true; frozen_h_database=true; actual_hr_h_advance_policy=true; all_h_business_types=false; complete_35_prd=false; production_modified=false"
