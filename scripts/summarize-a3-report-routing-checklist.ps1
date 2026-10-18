$ErrorActionPreference='Stop'
$Root='D:\CloudFlowPro'
. (Join-Path $Root '.cloudflow-runtime/use-data-drive.ps1')
$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
function Require-Markers([string]$File,[string[]]$Markers){
    $Text=Get-Content (Join-Path $Evidence $File) -Raw
    foreach($Marker in $Markers){if($Text -notmatch $Marker){throw "Required evidence missing: $File"}}
    "A3_ROUTING_EVIDENCE: file=$File; markers=true"
}
function Assert-Inputs([string]$File){
    $Inputs=@(Get-Content (Join-Path $Evidence $File) -Raw|ConvertFrom-Json)
    if(-not $Inputs.Count){throw 'Nonempty evidence snapshot required'}
    foreach($InputFile in $Inputs){
        $Path=if([IO.Path]::IsPathRooted($InputFile.Path)){$InputFile.Path}else{Join-Path $Root $InputFile.Path}
        if((Get-FileHash $Path).Hash -ne $InputFile.Hash){throw "Current input mismatch: $File"}
    }
    "A3_ROUTING_INPUTS: file=$File; count=$($Inputs.Count); changed=0"
}
Require-Markers 'a3-failover-checklist-20261002-r1.log' @('A3_FAILOVER_CHECKLIST: items=14; missing=0;')
Require-Markers 'h3-portal-finance-20261002-backend-r10.log' @('BUILD SUCCESS','\[static-rules\] no findings','FINANCE_BUILD: phase=Backend; files=3816; changed=0; exit=0')
Require-Markers 'h3-portal-finance-20261002-frontend-r7.log' @('> tsc --noEmit','built in ','FINANCE_BUILD: phase=Frontend; files=1475; changed=0; exit=0')
Assert-Inputs 'h3-portal-finance-20261002-backend-r10-inputs.json'
Assert-Inputs 'h3-portal-finance-20261002-frontend-r7-inputs.json'
$Before=@(Get-Content (Join-Path $Evidence 'h3-portal-finance-20261002-backend-r9-inputs.json') -Raw|ConvertFrom-Json)
$After=@(Get-Content (Join-Path $Evidence 'h3-portal-finance-20261002-backend-r10-inputs.json') -Raw|ConvertFrom-Json)
if(@(Compare-Object $Before.Path $After.Path).Count){throw 'Unexpected product file addition or removal'}
$Changes=@($Before|Where-Object{(Get-FileHash (Join-Path $Root $_.Path)).Hash -ne $_.Hash})
$Permitted=@('cloudflow-backend/cloudflow-common/cloudflow-common-job/pom.xml',
    'cloudflow-backend/cloudflow-common/cloudflow-common-job/src/main/java/com/cloudflow/common/job/client/JobReportClient.java',
    'cloudflow-backend/cloudflow-auth/src/main/resources/application.yml')
if($Changes.Count -ne 3 -or @($Changes|Where-Object{$_.Path.Replace('\','/') -notin $Permitted}).Count){throw 'Product delta exceeds report routing repair'}
Require-Markers 'h3-portal-finance-adjacent-20261002-r5/oa-database.log' @('Complete approved schema table count; expected=374; actual=374','PASS: 1012 OA boundary assertions')
Require-Markers 'h3-portal-finance-adjacent-20261002-r5/summary.log' @('regenerated_matches_formal=true; formal_modified=false','changed=0; exit=0; production_modified=false')
Require-Markers 'a3-report-routing-checks-20261002-r2/JobReportRoutingChecks.log' @('JOB_REPORT_ROUTING_CHECKS: passed=63; failed=0;','real_spring_load_balancer=true; real_http=true; controlled_discovery=true;')
Require-Markers 'a3-report-routing-checks-20261002-r2/JobInternalAuthenticationChecks.log' @('JOB_INTERNAL_AUTH_CHECKS: passed=81; failed=0;')
Require-Markers 'a3-report-routing-checks-20261002-r2/JobExecutionChecks.log' @('Batch G job execution checks passed: 18')
Require-Markers 'a3-report-routing-checks-20261002-r2/java-types.log' @('JAVA_EXPLICIT_TYPES: files=3677; inferred_declarations=0;')
Require-Markers 'a3-report-routing-checks-launch-20261002-r2.log' @('A3_REPORT_ROUTING_CHECKS: input_files=43; changed=0; backend=r10;')
Assert-Inputs 'a3-report-routing-checks-20261002-r2/inputs.json'
Require-Markers 'a3-report-routing-runtime-b10-20261002-r1.log' @('A3_REPORT_RUNTIME_B10: restarted_services=5; owned_processes=9; healthy_services=6; original_inputs=12; changed=0; exit=0')
Assert-Inputs 'a3-report-routing-runtime-b10-inputs-20261002-r1.json'
Require-Markers 'a3-job-report-fault-20261002-http-r3.log' @('A3_JOB_REPORT_FAULT_REAL_RESULT: checks=35; failed=0; requests=15;',
    '"route":true','"dropped":true','"business":true','"recovered":true','"successReplay":true','"unreachable":true','"timeout":true','"alarm":true',
    '"lateReplay":true','"permissions":true','"runtimeRestoration":true','"restoration":true','"proxyRestoration":true','"secrets":true',
    'A3_JOB_REPORT_FAULT_INPUTS: files=22; changed=0; product_changed=0; exit=0','A3_REPORT_FAULT_SECRET_SCAN: .* leaks=0; .*database_leaks=0')
Assert-Inputs 'a3-job-report-fault-20261002-inputs-r3.json'
Require-Markers 'owned-captcha-a3-job-report-fault-20261002-r3.log' @('A3_JOB_REPORT_FAULT_RUN_EXIT=0','OWNED_CAPTCHA_RESTORED: original_limit=100; original_ttl=-1;','counter_writes=0; database_unchanged=true; production_modified=false')
'A3_REPORT_ROUTING_REUSE: unchanged_schema=374; historical_menu_seed_source_checks_reused=true; backend=r10; frontend=r7; product_changed=3; historical_b9_protocols_not_claimed_current=true'
'A3_REPORT_ROUTING_CHECKLIST: items=14; missing=0; native_discovery_protocol=63; internal_auth=81; execution=18; actual_report_fault=35; current_full_runtime_auth_failover=false; complete_35_prd=false; production_modified=false'
