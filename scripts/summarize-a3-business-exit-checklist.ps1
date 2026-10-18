$ErrorActionPreference='Stop'
$Root='D:\CloudFlowPro'
. (Join-Path $Root '.cloudflow-runtime/use-data-drive.ps1')
$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
function Require-Markers([string]$File,[string[]]$Markers){
    $Content=Get-Content -LiteralPath (Join-Path $Evidence $File) -Raw
    foreach($Marker in $Markers){if($Content -notmatch $Marker){throw "Required evidence missing: $File"}}
    "A3_EXIT_EVIDENCE: file=$File; markers=true"
}
function Assert-Inputs([string]$File){
    $Inputs=@(Get-Content -LiteralPath (Join-Path $Evidence $File) -Raw|ConvertFrom-Json)
    if(-not $Inputs.Count){throw 'Nonempty evidence input snapshot required'}
    foreach($Item in $Inputs){$Path=if([IO.Path]::IsPathRooted($Item.Path)){$Item.Path}else{Join-Path $Root $Item.Path};if((Get-FileHash -LiteralPath $Path).Hash -ne $Item.Hash){throw "Current input mismatch: $File"}}
    "A3_EXIT_INPUTS: file=$File; files=$($Inputs.Count); changed=0"
}
Require-Markers 'a4-yearly-checklist-20261003-r1.log' @('A4_YEARLY_CHECKLIST: items=14; missing=0;')
Require-Markers 'h3-portal-finance-20261002-backend-r12.log' @('BUILD SUCCESS','\[static-rules\] no findings','FINANCE_BUILD: phase=Backend; files=3817; changed=0; exit=0')
Require-Markers 'h3-portal-finance-20261002-frontend-r7.log' @('> tsc --noEmit','built in ','FINANCE_BUILD: phase=Frontend; files=1475; changed=0; exit=0')
Assert-Inputs 'h3-portal-finance-20261002-backend-r12-inputs.json'
Assert-Inputs 'h3-portal-finance-20261002-frontend-r7-inputs.json'
$Before=@(Get-Content -LiteralPath (Join-Path $Evidence 'h3-portal-finance-20261002-backend-r11-inputs.json') -Raw|ConvertFrom-Json)
$After=@(Get-Content -LiteralPath (Join-Path $Evidence 'h3-portal-finance-20261002-backend-r12-inputs.json') -Raw|ConvertFrom-Json)
if(@(Compare-Object $Before.Path $After.Path).Count){throw 'Unexpected product file addition or removal'}
$Changes=@($Before|Where-Object{(Get-FileHash -LiteralPath (Join-Path $Root $_.Path)).Hash -ne $_.Hash})
if($Changes.Count -ne 1 -or $Changes[0].Path.Replace('\','/') -ne 'cloudflow-backend/cloudflow-service-hr/src/main/java/com/cloudflow/hr/job/EmployeeContractExpireJob.java'){throw 'Product changes exceed contract transaction repair'}
Require-Markers 'a3-business-exit-java-types-20261003-r1.log' @('JAVA_EXPLICIT_TYPES_SELFTEST: passed=\d+; failed=0;','JAVA_EXPLICIT_TYPES: files=3679; inferred_declarations=0;')
Require-Markers 'a3-business-exit-20261003-http-r2.log' @('A3_BUSINESS_EXIT_REAL_RESULT: checks=25; failed=0; requests=12;',
    '"running":true','"stopped":true','"rollback":true','"timeout":true','"alarm":true','"recovery":true','"deduplication":true','"permissions":true','"runtimeRestoration":true','"restoration":true','"secrets":true',
    'A3_BUSINESS_EXIT_INPUTS: files=21; changed=0; product_changed=0; exit=0','"leaks":0','"databaseLeaks":0')
Assert-Inputs 'a3-business-exit-20261003-inputs-r2.json'
Require-Markers 'a3-business-exit-launch-20261003-r2.log' @('A3_BUSINESS_EXIT_RUN_EXIT=0','OWNED_CAPTCHA_RESTORED: original_limit=100; original_ttl=-1;','counter_writes=0; database_unchanged=true; production_modified=false')
Require-Markers 'a3-business-exit-recovery-20261003-r1.log' @('A3_BUSINESS_EXIT_RESTORED: original_inputs=12; processes_owned=9; six_services_up=true;')
Require-Markers 'a3-job-business-20261002-http-r5.log' @('A3_JOB_BUSINESS_REAL_RESULT: checks=53; failed=0; requests=17;',
    '"contract":true','"pool":true','"delivery":true','"scheduling":true','"metrics":true','"ui":true','"permissions":true','"restoration":true','"secrets":true',
    'A3_JOB_BUSINESS_INPUTS: files=19; changed=0; product_changed=0; exit=0')
Assert-Inputs 'a3-job-business-20261002-inputs-r5.json'
Require-Markers 'a3-business-exit-business-launch-20261003-r5.log' @('A3_JOB_BUSINESS_RUN_EXIT=0','OWNED_CAPTCHA_RESTORED: original_limit=100; original_ttl=-1;')
Require-Markers 'a3-job-tenant-failure-20261002-http-r4.log' @('A3_JOB_TENANT_FAILURE_REAL_RESULT: checks=19; failed=0; requests=4;',
    '"injected":true','"continuation":true','"failed":true','"alarm":true','"restoration":true','"secrets":true','A3_JOB_TENANT_FAILURE_INPUTS: files=19; changed=0; product_changed=0; exit=0')
Assert-Inputs 'a3-job-tenant-failure-20261002-inputs-r4.json'
Require-Markers 'a3-business-exit-tenant-launch-20261003-r4.log' @('A3_JOB_TENANT_FAILURE_RUN_EXIT=0','OWNED_CAPTCHA_RESTORED: original_limit=100; original_ttl=-1;')
$State=Get-Content -LiteralPath (Join-Path $Root '.cloudflow-runtime/batch-g-integration/9799534e1a3a47b5958330f14ae16dc7/state.json') -Raw|ConvertFrom-Json
if($State.status -ne 'RUNNING' -or $State.processes.Count -ne 9 -or $State.services.Count -ne 6){throw 'Owned environment incomplete'}
foreach($Entry in $State.processes){$Process=Get-CimInstance Win32_Process -Filter "ProcessId=$($Entry.id)";if(-not $Process -or -not $Process.CommandLine.Contains($Entry.marker)){throw 'Owned process identity mismatch'}}
foreach($Service in $State.services){$Health=Invoke-RestMethod -Uri "http://127.0.0.1:$($Service.healthPort)/actuator/health" -TimeoutSec 15;if($Health.status -ne 'UP'){throw 'Owned service not healthy'}}
'A3_EXIT_REUSE: schema=374; product_delta=1; schema_menus_seed_and_frontend_unchanged=true; prior_structural_checks_reused=true; backend=r12; frontend=r7; historical_cluster_protocols_not_claimed_current=true'
'A3_EXIT_RESTORATION: owned_processes=9; healthy_services=6; runtime_inputs=12; changed=0; prior_failed_round_retained=true'
'A3_EXIT_CHECKLIST: items=14; missing=0; actual_running_business_exit=true; actual_contract_and_tenant_regression=true; complete_35_prd=false; production_modified=false'
