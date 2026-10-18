param([ValidatePattern('^r[1-9][0-9]*$')][string]$HttpRound='r3',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$BackendRound='r7',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$FrontendRound='r6',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$AdjacentRound='r4')
$ErrorActionPreference='Stop'
. 'D:\CloudFlowPro\.cloudflow-runtime/use-data-drive.ps1'
$Root='D:\CloudFlowPro'
$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
$Adjacent="h3-portal-finance-adjacent-20261002-$AdjacentRound"
$Verified=[Collections.Generic.HashSet[int]]::new()
function Require-Evidence([int[]]$Items,[string]$File,[string[]]$Patterns) {
    $Content=Get-Content -LiteralPath (Join-Path $Evidence $File) -Raw
    foreach($Pattern in $Patterns){if($Content -notmatch $Pattern){throw "Missing A3 business evidence: $File"}}
    foreach($Item in $Items){[void]$Verified.Add($Item)}
    "A3_BUSINESS_CHECKLIST_EVIDENCE: items=$($Items -join ','); file=$File; required_markers=true"
}
function Assert-Inputs([string]$Name) {
    $Inputs=@(Get-Content -LiteralPath (Join-Path $Evidence $Name) -Raw | ConvertFrom-Json)
    if(-not $Inputs.Count){throw 'Empty evidence inputs'}
    foreach($Input in $Inputs) {
        $InputPath=if([IO.Path]::IsPathRooted($Input.Path)){$Input.Path}else{Join-Path $Root $Input.Path}
        if((Get-FileHash -LiteralPath $InputPath).Hash -ne $Input.Hash){throw "Verified A3 inputs changed: $Name"}
    }
    "A3_BUSINESS_INPUTS_MATCH: file=$Name; count=$($Inputs.Count); changed=0"
}
Require-Evidence @(1) "h3-portal-finance-20261002-backend-$BackendRound.log" @('BUILD SUCCESS','\[static-rules\] no findings','FINANCE_BUILD: phase=Backend; files=3816; changed=0; exit=0')
$Build=Get-Content -LiteralPath (Join-Path $Evidence "h3-portal-finance-20261002-backend-$BackendRound.log") -Raw
if([regex]::Matches($Build,'(?m)^\[INFO\] .+\.{2,}\s+SUCCESS\s+\[').Count -ne 29){throw 'All 29 backend modules required'}
Require-Evidence @(2,3) "h3-portal-finance-20261002-frontend-$FrontendRound.log" @('> tsc --noEmit','built in ','FINANCE_BUILD: phase=Frontend; files=1475; changed=0; exit=0')
Require-Evidence @(4) "$Adjacent/oa-database.log" @('PASS: 01.cloudflow-common.sql','PASS: 02.cloudflow-workflow.sql','PASS: 03.cloudflow-hr.sql','PASS: 04.cloudflow-oa.sql','PASS: 05.cloudflow-crm.sql','PASS: 06.cloudflow-business-seed.sql','PASS: isolated 01-07 OA database acceptance','Complete approved schema table count; expected=374; actual=374','PASS: 1012 OA boundary assertions')
Require-Evidence @(5,6) "$Adjacent/menu.log" @('expected=885; actual=885; missing=0; unexpected=0','EMPLOYEE_UNEXPECTED_GRANTS=0; EMPLOYEE_UNEXPECTED_WRITE_PERMISSIONS=0','APPROVED_MENU_SCOPE_PASS=true')
Require-Evidence @(7,8,9,10,11,13) "$Adjacent/sources.log" @('JAVA_SQL_CONCAT: matches=0','MP_SQL_LAST_APPLY: matches=0','MYBATIS_ANNOTATION_SQL: matches=0','login_only_external_endpoints=0','JAVA_PERMISSION_PREFIXES:.*invalid=0','FRONTEND_PERMISSION_LITERALS:.*invalid=0','STATIC_WHITELIST: entries=9; unique_locations=4; stale_lines=0')
Require-Evidence @(12) "a3-job-business-20261002-http-$HttpRound.log" @('A3_JOB_BUSINESS_REAL_RESULT: checks=\d+; failed=0; requests=','"contract":true','"pool":true','"delivery":true','"scheduling":true','"metrics":true','"ui":true','"permissions":true','"restoration":true','"secrets":true','A3_BUSINESS_SECRET_SCAN:.*leaks=0; database_bytes=\d+; database_leaks=0','A3_JOB_BUSINESS_INPUTS: files=19; changed=0; product_changed=0; exit=0')
Require-Evidence @() "owned-captcha-a3-job-business-20261002-$HttpRound.log" @('OWNED_CAPTCHA_RESTORED: original_limit=100; original_ttl=-1;','counter_writes=0; database_unchanged=true; production_modified=false')
Assert-Inputs "a3-job-business-20261002-inputs-$HttpRound.json"
# Credential storage and schema/menu installation are unchanged since the proven finance snapshot.
$PreviousInputs=@(Get-Content -LiteralPath (Join-Path $Evidence 'h3-portal-finance-20261002-backend-r5-inputs.json') -Raw | ConvertFrom-Json)
$Permitted=@('cloudflow-backend/cloudflow-service-oa/src/main/java/com/cloudflow/oa/util/OaContractConstants.java',
    'cloudflow-backend/cloudflow-service-oa/src/main/java/com/cloudflow/oa/service/impl/OaContractFulfilmentService.java',
    'cloudflow-backend/cloudflow-service-oa/src/main/resources/mapper/OaOperationsReportMapper.xml',
    'cloudflow-backend/cloudflow-service-crm/src/main/java/com/cloudflow/crm/job/CrmLifecycleJob.java',
    'cloudflow-backend/cloudflow-service-hr/src/main/java/com/cloudflow/hr/job/EmployeeContractExpireJob.java')
foreach($Input in $PreviousInputs) {
    if($Input.Path.Replace('\','/') -notin $Permitted -and (Get-FileHash -LiteralPath (Join-Path $Root $Input.Path)).Hash -ne $Input.Hash){throw 'Changes exceed the reviewed source scope'}
}
$Preflight=Get-Content -LiteralPath (Join-Path $Evidence 'h3-portal-finance-proposal-preflight-20261002-r5.json') -Raw | ConvertFrom-Json
foreach($Kind in @('menuConflict','fieldConflict','indexConflict','constraintConflict')) {
    $Rows=@($Preflight.Rows | Where-Object kind -EQ $Kind)
    if($Rows.Count -ne 1 -or $Rows[0].value -ne 0){throw 'Missing approved installation conflict check'}
}
Require-Evidence @(12) 'h3-portal-finance-http-20261002-r15.log' @('PASS 财务门户邮件密码保存为非明文','PASS 财务门户邮件接口仅回显密码末四位','H3_PORTAL_FINANCE_LOG_SCAN:.*leaks=0; database_bytes=\d+; database_leaks=0')
Require-Evidence @(14) "$Adjacent/summary.log" @('H3_FINANCE_DEMO: regenerated_matches_formal=true; formal_modified=false','H3_FINANCE_ADJACENT: files=\d+; changed=0; exit=0; production_modified=false')
Require-Evidence @() "$Adjacent/java-types.log" @('JAVA_EXPLICIT_TYPES_SELFTEST: passed=14; failed=0','JAVA_EXPLICIT_TYPES: files=3676; inferred_declarations=0')
$Static=Get-Content -LiteralPath (Join-Path $Evidence "$Adjacent/h-static.json") -Raw | ConvertFrom-Json
if($Static.summary.passed -ne 42 -or $Static.summary.failed -ne 0 -or $Static.summary.pending -ne 0){throw 'All H static checks required'}
Assert-Inputs "h3-portal-finance-20261002-backend-$BackendRound-inputs.json"
Assert-Inputs "h3-portal-finance-20261002-frontend-$FrontendRound-inputs.json"
Assert-Inputs "$Adjacent/inputs.json"
if($Verified.Count -ne 14){throw 'All 14 checklist items required'}
'A3_JOB_BUSINESS_CHECKLIST: items=14; missing=0; backend_modules=29; current_schema_tables=374; complete_35_prd=false; production_modified=false'
