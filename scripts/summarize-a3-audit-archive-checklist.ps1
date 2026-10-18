$ErrorActionPreference='Stop'
$Root='D:\CloudFlowPro'
. (Join-Path $Root '.cloudflow-runtime/use-data-drive.ps1')
$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
function Require-Markers([string]$File,[string[]]$Markers){
    $Content=Get-Content -LiteralPath (Join-Path $Evidence $File) -Raw
    foreach($Marker in $Markers){if($Content -notmatch $Marker){throw "Required evidence missing: $File"}}
    "A3_AUDIT_ARCHIVE_EVIDENCE: file=$File; markers=true"
}
function Assert-Inputs([string]$File){
    $Inputs=@(Get-Content -LiteralPath (Join-Path $Evidence $File) -Raw|ConvertFrom-Json)
    if(-not $Inputs.Count){throw 'Nonempty evidence snapshot required'}
    foreach($Item in $Inputs){
        $InputFile=if([IO.Path]::IsPathRooted($Item.Path)){$Item.Path}else{Join-Path $Root $Item.Path}
        if((Get-FileHash -LiteralPath $InputFile).Hash -ne $Item.Hash){throw "Current input mismatch: $File"}
    }
    "A3_AUDIT_ARCHIVE_INPUTS: file=$File; files=$($Inputs.Count); changed=0"
}
Require-Markers 'h3-portal-finance-20261002-backend-r25.log' @('BUILD SUCCESS','\[static-rules\] no findings','FINANCE_BUILD: phase=Backend; files=3818; changed=0; exit=0')
Require-Markers 'h3-portal-finance-20261002-frontend-r7.log' @('> tsc --noEmit','built in ','FINANCE_BUILD: phase=Frontend; files=1475; changed=0; exit=0')
Assert-Inputs 'h3-portal-finance-20261002-backend-r25-inputs.json'
Assert-Inputs 'h3-portal-finance-20261002-frontend-r7-inputs.json'
$Prior=@(Get-Content -LiteralPath (Join-Path $Evidence 'h3-portal-finance-adjacent-20261002-r7/inputs.json') -Raw|ConvertFrom-Json)
$Changed=@($Prior|Where-Object{(Get-FileHash -LiteralPath (Join-Path $Root $_.Path)).Hash -ne $_.Hash}|ForEach-Object{$_.Path.Replace('\','/')})
$Allowed=@('scripts/run-a3-audit-archive.ps1','scripts/run-owned-captcha-allowance.mjs','scripts/verify-a3-audit-archive.mjs')
if(@(Compare-Object $Allowed $Changed).Count){throw 'Delta exceeds the three reverified runtime preparation scripts'}
Require-Markers 'h3-portal-finance-adjacent-20261002-r7/summary.log' @('regenerated_matches_formal=true; formal_modified=false','files=6126; changed=0; exit=0; production_modified=false')
Require-Markers 'h3-portal-finance-adjacent-20261002-r7/oa-database.log' @('Complete approved schema table count; expected=374; actual=374','PASS: 1012 OA boundary assertions')
Require-Markers 'h3-portal-finance-adjacent-20261002-r7/sources.log' @('MP_SQL_LAST_APPLY: matches=0','MYBATIS_ANNOTATION_SQL: matches=0','login_only_external_endpoints=0','JAVA_PERMISSION_PREFIXES:.*invalid=0','STATIC_WHITELIST:.*stale_lines=0','EXIT_CODE=0')
Require-Markers 'h3-portal-finance-adjacent-20261002-r7/menu.log' @('EMPLOYEE_UNEXPECTED_GRANTS=0; EMPLOYEE_UNEXPECTED_WRITE_PERMISSIONS=0','APPROVED_MENU_SCOPE_PASS=true')
Require-Markers 'a3-audit-archive-database-20261003-r3/checks.log' @('AUDIT_ARCHIVE_DATABASE: checks=110; failed=0;','real_job_service_mysql=true; tenant_enumeration_controlled=true; batch_rows=501;',
    'connection_faults_controlled=true; physical_abort_rollback_verified=true; fixed_cutoff_verified=true;','AUDIT_ARCHIVE_DATABASE_RESTORED: own_schema_removed=true; original_schema_untouched=true; production_modified=false')
Require-Markers 'a3-audit-archive-database-20261003-r3/java-types.log' @('JAVA_EXPLICIT_TYPES: files=3689; inferred_declarations=0;')
Assert-Inputs 'a3-audit-archive-database-20261003-r3/inputs.json'
Require-Markers 'a3-audit-archive-database-20261003-r2/checks.log' @('AUDIT_ARCHIVE_DATABASE_RESTORED: own_schema_removed=true;','faulted connection aborted without unsafe commit for reset')
Require-Markers 'a3-audit-archive-20261003-http-r4.log' @('A3_AUDIT_ARCHIVE_REAL_RESULT: checks=31; failed=0; requests=13;',
    '"preview":true','"collision":true','"rollback":true','"continuation":true','"alarm":true','"recovery":true','"duplicate":true','"repeat":true',
    '"permissions":true','"restoration":true','"runtimeRestoration":true','"secrets":true','"samples":7','"archived":4','"retainedPreviewAndExcluded":3',
    '"realCopyConflict":true','"sourceCopiesVerified":true','"forcedTerminalWrites":0','"internalRequests":5','"naturalMonthlyWait":false',
    'A3_AUDIT_RUNTIME_PHASE: actual=false; owned_auth_ready=true; original_restored=true','"leaks":0','"databaseLeaks":0',
    'A3_AUDIT_ARCHIVE_INPUTS: files=20; changed=0; product_changed=0; controlled_config_phases=true; exit=0')
Assert-Inputs 'a3-audit-archive-20261003-inputs-r4.json'
Require-Markers 'a3-audit-archive-launch-20261003-r4.log' @('A3_AUDIT_ARCHIVE_RUN_EXIT=0','OWNED_CAPTCHA_RESTORED: original_limit=100; original_ttl=-1;','counter_writes=0; database_unchanged=true; production_modified=false')
Require-Markers 'a3-audit-archive-20261003-initial-restart-r4.log' @('ISOLATED_RESTART_READY: service=auth;')
Require-Markers 'a3-audit-archive-launch-wait-diagnosis-20261003-r1.log' @('business_run_not_started=true; only_runner_stopped=true; auth_not_stopped=true')
foreach($Round in @('r1','r2','r3')){Require-Markers "a3-audit-archive-launch-20261003-$Round.log" @('OWNED_CAPTCHA_RESTORED: original_limit=100; original_ttl=-1;')}
Require-Markers 'a3-audit-archive-20261003-http-r2.log' @('checks=7; failed=1; requests=0;','今日验证次数已达上限')
Require-Markers 'a3-audit-archive-20261003-http-r3.log' @('checks=9; failed=1; requests=0;','Illegal mix of collations')
Require-Markers 'a3-audit-archive-preflight-recovery-20261003-r1.log' @('"formalTables":374','"databaseWrites":0','"dryRunConfiguration":\["default=true"\]')
$State=Get-Content -LiteralPath (Join-Path $Root '.cloudflow-runtime/batch-g-integration/9799534e1a3a47b5958330f14ae16dc7/state.json') -Raw|ConvertFrom-Json
if($State.status -ne 'RUNNING' -or $State.processes.Count -ne 9 -or $State.services.Count -ne 6){throw 'Owned environment incomplete'}
foreach($Entry in $State.processes){$Observed=Get-CimInstance Win32_Process -Filter "ProcessId=$($Entry.id)";if(-not $Observed -or -not $Observed.CommandLine.Contains($Entry.marker)){throw 'Owned process identity mismatch'}}
foreach($Service in $State.services){$Health=Invoke-RestMethod -Uri "http://127.0.0.1:$($Service.healthPort)/actuator/health" -TimeoutSec 15;if($Health.status -ne 'UP'){throw 'Owned service not healthy'}}
$Checklist=@('maven-install-and-static-rules','frontend-types','frontend-build','formal-schema-374','menu-scope',
    'employee-grants','sql-concatenation','external-endpoint-protection','mybatis-last-apply','annotation-sql',
    'permission-prefixes','secret-protection-and-runtime-scan','static-whitelist','regenerated-demo')
foreach($Item in $Checklist){"A3_AUDIT_ARCHIVE_CHECKLIST_ITEM: item=$Item; passed=true"}
'A3_AUDIT_ARCHIVE_REUSE: adjacent=r7; product_changed_since_adjacent=0; verification_scripts_changed=3; remaining_prior_inputs=6123; backend=r25; frontend=r7; historical_protocols_not_claimed_current=true'
'A3_AUDIT_ARCHIVE_RESTORATION: owned_processes=9; healthy_services=6; verification_inputs=20; original_config_restored=true; prior_round_evidence_retained=true'
"A3_AUDIT_ARCHIVE_CHECKLIST: items=$($Checklist.Count); missing=0; database_checks=110; adjacent_database_checks=1012; actual_checks=31; complete_35_prd=false; production_modified=false"
