$ErrorActionPreference='Stop'
$Root='D:\CloudFlowPro'
. (Join-Path $Root '.cloudflow-runtime/use-data-drive.ps1')
$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
function Require-Markers([string]$File,[string[]]$Markers){
    $Content=Get-Content -LiteralPath (Join-Path $Evidence $File) -Raw
    foreach($Marker in $Markers){if($Content -notmatch $Marker){throw "Required evidence missing: $File"}}
    "A3_OA_EVIDENCE: file=$File; markers=true"
}
function Assert-Inputs([string]$File){
    $Inputs=@(Get-Content -LiteralPath (Join-Path $Evidence $File) -Raw|ConvertFrom-Json)
    if(-not $Inputs.Count){throw 'Nonempty evidence snapshot required'}
    foreach($Item in $Inputs){
        $InputFile=if([IO.Path]::IsPathRooted($Item.Path)){$Item.Path}else{Join-Path $Root $Item.Path}
        if((Get-FileHash -LiteralPath $InputFile).Hash -ne $Item.Hash){throw "Current input mismatch: $File"}
    }
    "A3_OA_INPUTS: file=$File; files=$($Inputs.Count); changed=0"
}
Require-Markers 'a3-quote-checklist-20261003-r1.log' @('A3_QUOTE_CHECKLIST: items=14; missing=0;')
Require-Markers 'h3-portal-finance-20261002-backend-r15.log' @('BUILD SUCCESS','\[static-rules\] no findings','FINANCE_BUILD: phase=Backend; files=3817; changed=0; exit=0')
Require-Markers 'h3-portal-finance-20261002-frontend-r7.log' @('> tsc --noEmit','built in ','FINANCE_BUILD: phase=Frontend; files=1475; changed=0; exit=0')
Assert-Inputs 'h3-portal-finance-20261002-backend-r15-inputs.json'
Assert-Inputs 'h3-portal-finance-20261002-frontend-r7-inputs.json'
$Before=@(Get-Content -LiteralPath (Join-Path $Evidence 'h3-portal-finance-20261002-backend-r14-inputs.json') -Raw|ConvertFrom-Json)
$After=@(Get-Content -LiteralPath (Join-Path $Evidence 'h3-portal-finance-20261002-backend-r15-inputs.json') -Raw|ConvertFrom-Json)
if(@(Compare-Object $Before.Path $After.Path).Count){throw 'Unexpected product addition or removal'}
$Changes=@($Before|Where-Object{(Get-FileHash -LiteralPath (Join-Path $Root $_.Path)).Hash -ne $_.Hash})
$Allowed=@('cloudflow-backend/cloudflow-service-oa/src/main/java/com/cloudflow/oa/job/OaBorrowOverdueJob.java',
    'cloudflow-backend/cloudflow-service-oa/src/main/java/com/cloudflow/oa/service/impl/OaRiskScanServiceImpl.java')
if($Changes.Count -ne 2 -or @($Changes|Where-Object{$_.Path.Replace('\','/') -notin $Allowed}).Count){throw 'Product delta exceeds OA result reporting and risk transaction'}
Require-Markers 'h3-portal-finance-adjacent-20261002-r5/oa-database.log' @('Complete approved schema table count; expected=374; actual=374','PASS: 1012 OA boundary assertions')
Require-Markers 'h3-portal-finance-adjacent-20261002-r5/summary.log' @('regenerated_matches_formal=true; formal_modified=false','changed=0; exit=0; production_modified=false')
Require-Markers 'a3-oa-checks-20261003-r1/checks.log' @('OA_SCHEDULED_JOB_CHECKS: checks=33; failed=0; real_jobs_and_risk_scan=true; real_spring_transaction_interceptor=true; controlled_business_and_transaction_resources=true; actual_database=false')
Require-Markers 'a3-oa-checks-20261003-r1/java-types.log' @('JAVA_EXPLICIT_TYPES: files=3681; inferred_declarations=0;')
Assert-Inputs 'a3-oa-checks-20261003-r1/inputs.json'
Require-Markers 'a3-oa-scans-20261003-http-r2.log' @('A3_OA_SCANS_REAL_RESULT: checks=41; failed=0; requests=28;',
    '"borrowFailure":true','"borrow":true','"expiry":true','"riskRollback":true','"risk":true','"delivery":true','"permissions":true','"deduplication":true','"restoration":true','"secrets":true',
    'A3_OA_RISK_FAULT_RESTORED: rule_value_and_timestamp=true; cache_value_and_expiry=true;',
    '"businessMessages":10','"successes":5','"skipped":5','"forcedTerminalWrites":0','"leaks":0','"databaseLeaks":0',
    'A3_OA_SCANS_INPUTS: files=19; changed=0; product_changed=0; exit=0')
Assert-Inputs 'a3-oa-scans-20261003-inputs-r2.json'
Require-Markers 'a3-oa-scans-launch-20261003-r2.log' @('A3_OA_SCANS_RUN_EXIT=0','OWNED_CAPTCHA_RESTORED: original_limit=100; original_ttl=-1;','counter_writes=0; database_unchanged=true; production_modified=false')
Require-Markers 'a3-oa-service-restart-20261003-r1.log' @('ISOLATED_RESTART_READY: service=oa;')
$State=Get-Content -LiteralPath (Join-Path $Root '.cloudflow-runtime/batch-g-integration/9799534e1a3a47b5958330f14ae16dc7/state.json') -Raw|ConvertFrom-Json
if($State.status -ne 'RUNNING' -or $State.processes.Count -ne 9 -or $State.services.Count -ne 6){throw 'Owned environment incomplete'}
foreach($Entry in $State.processes){$Observed=Get-CimInstance Win32_Process -Filter "ProcessId=$($Entry.id)";if(-not $Observed -or -not $Observed.CommandLine.Contains($Entry.marker)){throw 'Owned process identity mismatch'}}
foreach($Service in $State.services){$Health=Invoke-RestMethod -Uri "http://127.0.0.1:$($Service.healthPort)/actuator/health" -TimeoutSec 15;if($Health.status -ne 'UP'){throw 'Owned service not healthy'}}
'A3_OA_REUSE: schema=374; product_delta=2; schema_menus_seed_and_frontend_unchanged=true; prior_structural_checks_reused=true; backend=r15; frontend=r7; historical_protocols_not_claimed_current=true'
'A3_OA_RESTORATION: owned_processes=9; healthy_services=6; verification_inputs=19; changed=0; prior_round_evidence_retained=true'
'A3_OA_CHECKLIST: items=14; missing=0; service_rules=33; actual_checks=41; complete_35_prd=false; production_modified=false'
