param([ValidatePattern('^r[1-9][0-9]*$')][string]$HttpRound='r15',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$AdjacentRound='r1',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$BackendRound='r5',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$FrontendRound='r6',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$RulesRound='r4',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$DatabaseRound='r4')
$ErrorActionPreference='Stop'
. 'D:\CloudFlowPro\.cloudflow-runtime/use-data-drive.ps1'
$Root='D:\CloudFlowPro'
$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
$Adjacent="h3-portal-finance-adjacent-20261002-$AdjacentRound"
$Verified=[Collections.Generic.HashSet[int]]::new()
function Require-Evidence([int[]]$Items,[string]$File,[string[]]$Patterns) {
    $Content=Get-Content -LiteralPath (Join-Path $Evidence $File) -Raw
    foreach($Pattern in $Patterns){if($Content -notmatch $Pattern){throw "Missing finance evidence: $File"}}
    foreach($Item in $Items){[void]$Verified.Add($Item)}
    "H3_FINANCE_CHECKLIST_EVIDENCE: items=$($Items -join ','); file=$File; required_markers=true"
}
Require-Evidence @(1) "h3-portal-finance-20261002-backend-$BackendRound.log" @('BUILD SUCCESS','\[static-rules\] no findings','FINANCE_BUILD: phase=Backend; files=3816; changed=0; exit=0')
$BuildText=Get-Content -LiteralPath (Join-Path $Evidence "h3-portal-finance-20261002-backend-$BackendRound.log") -Raw
if([regex]::Matches($BuildText,'(?m)^\[INFO\] .+\.{2,}\s+SUCCESS\s+\[').Count -ne 29){throw 'All 29 backend modules required'}
Require-Evidence @(2,3) "h3-portal-finance-20261002-frontend-$FrontendRound.log" @('> tsc --noEmit','built in ','FINANCE_BUILD: phase=Frontend; files=1475; changed=0; exit=0')
Require-Evidence @(4) "$Adjacent/oa-database.log" @('PASS: 01.cloudflow-common.sql','PASS: 02.cloudflow-workflow.sql','PASS: 03.cloudflow-hr.sql','PASS: 04.cloudflow-oa.sql','PASS: 05.cloudflow-crm.sql','PASS: 06.cloudflow-business-seed.sql','PASS: isolated 01-07 OA database acceptance','Complete approved schema table count; expected=374; actual=374','H3_PORTAL_FINANCE_SCHEMA: approved_columns=8; enforced_constraints=2; indexes=2; invalid_states_rejected=34;', 'PASS: 1012 OA boundary assertions')
Require-Evidence @(5,6) "$Adjacent/menu.log" @('expected=885; actual=885; missing=0; unexpected=0','EMPLOYEE_UNEXPECTED_GRANTS=0; EMPLOYEE_UNEXPECTED_WRITE_PERMISSIONS=0','APPROVED_MENU_SCOPE_PASS=true')
$Preflight=Get-Content -LiteralPath (Join-Path $Evidence 'h3-portal-finance-proposal-preflight-20261002-r5.json') -Raw | ConvertFrom-Json
foreach($Kind in @('menuConflict','fieldConflict','indexConflict','constraintConflict')) {
    $Rows=@($Preflight.Rows | Where-Object kind -EQ $Kind)
    if($Rows.Count -ne 1 -or $Rows[0].value -ne 0){throw 'Missing approved pre-installation conflict evidence'}
}
Require-Evidence @(7,8,9,10,11,13) "$Adjacent/sources.log" @('JAVA_SQL_CONCAT: matches=0','MP_SQL_LAST_APPLY: matches=0','MYBATIS_ANNOTATION_SQL: matches=0','login_only_external_endpoints=0','JAVA_PERMISSION_PREFIXES:.*invalid=0','FRONTEND_PERMISSION_LITERALS:.*invalid=0','STATIC_WHITELIST: entries=9; unique_locations=4; stale_lines=0')
Require-Evidence @(12) "h3-portal-finance-http-20261002-$HttpRound.log" @('H3_PORTAL_FINANCE_REAL_RESULT: checks=\d+; failed=0; requests=','"permissions":true','"precision":true','"concurrency":true','"withdrawal":true','"identity":true','"files":true','"audit":true','"desktop":true','"mobile":true','"lostResponse":true','PASS 财务门户邮件密码保存为非明文','PASS 财务门户邮件接口仅回显密码末四位','PASS 门户真实TLS邮件认证成功','H3_PORTAL_FINANCE_LOG_SCAN:.*leaks=0; database_bytes=\d+; database_leaks=0; all_service_audit_tables=3','H3_FINANCE_INPUTS: files=\d+; changed=0; product_changed=0; exit=0','H3_FINANCE_MAIL_CONFIG_RESTORED: files=2; production_modified=false','OWNED_CAPTCHA_RESTORED: original_limit=100; original_ttl=-1;')
Require-Evidence @(14) "$Adjacent/summary.log" @('H3_FINANCE_DEMO: regenerated_matches_formal=true; formal_modified=false','H3_FINANCE_ADJACENT: files=\d+; changed=0; exit=0; production_modified=false')
Require-Evidence @() "$Adjacent/java-types.log" @('JAVA_EXPLICIT_TYPES_SELFTEST: passed=14; failed=0','JAVA_EXPLICIT_TYPES: files=3676; inferred_declarations=0')
$Static=Get-Content -LiteralPath (Join-Path $Evidence "$Adjacent/h-static.json") -Raw | ConvertFrom-Json
if($Static.summary.passed -ne 42 -or $Static.summary.failed -ne 0 -or $Static.summary.pending -ne 0){throw 'All H static checks required'}
Require-Evidence @() "h3-portal-finance-rules-20261002-$RulesRound/checks.log" @('PORTAL_FINANCE_RULE_CHECKS: passed=179; failed=0')
Require-Evidence @() "h3-portal-finance-database-20261002-$DatabaseRound/checks.log" @('PORTAL_FINANCE_DATABASE_CHECKS: passed=104; failed=0')
foreach($Build in @("backend-$BackendRound","frontend-$FrontendRound")) {
    $Inputs=@(Get-Content -LiteralPath (Join-Path $Evidence "h3-portal-finance-20261002-$Build-inputs.json") -Raw | ConvertFrom-Json)
    if(@($Inputs | Where-Object {(Get-FileHash -LiteralPath (Join-Path $Root $_.Path)).Hash -ne $_.Hash}).Count){throw 'Product differs from verified build'}
}
foreach($InputFile in @("$Adjacent/inputs.json","h3-portal-finance-rules-20261002-$RulesRound/inputs.json","h3-portal-finance-database-20261002-$DatabaseRound/inputs.json")) {
    $Inputs=@(Get-Content -LiteralPath (Join-Path $Evidence $InputFile) -Raw | ConvertFrom-Json)
    if(@($Inputs | Where-Object {(Get-FileHash -LiteralPath $_.Path).Hash -ne $_.Hash}).Count){throw 'Verified finance inputs changed'}
}
$Restoration=Get-Content -LiteralPath (Join-Path $Evidence "h3-portal-finance-http-fixture-20261002-$HttpRound/manifest.json") -Raw | ConvertFrom-Json
if(-not $Restoration.Restored -or $Restoration.ProductionModified){throw 'Mail configuration restoration required'}
$Overrides=@{}
foreach($File in $Restoration.Files){$Overrides[$File.Path]=$File}
$HttpInputs=@(Get-Content -LiteralPath (Join-Path $Evidence "h3-portal-finance-http-inputs-20261002-$HttpRound.json") -Raw | ConvertFrom-Json)
foreach($Input in $HttpInputs) {
    $Expected=$Input.Hash
    if($Overrides.ContainsKey($Input.Path)) {
        if($Input.Hash -ne $Overrides[$Input.Path].AppliedHash){throw 'Verified temporary mail configuration mismatch'}
        $Expected=$Overrides[$Input.Path].OriginalHash
    }
    if((Get-FileHash -LiteralPath $Input.Path).Hash -ne $Expected){throw 'Finance HTTP input or restoration changed'}
}
if($Verified.Count -ne 14){throw 'All 14 checklist items required'}
'H3_PORTAL_FINANCE_CHECKLIST: items=14; missing=0; backend_modules=29; complete_35_prd=false; production_modified=false'
