$ErrorActionPreference='Stop'
$Root='D:\CloudFlowPro'
. (Join-Path $Root '.cloudflow-runtime/use-data-drive.ps1')
$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
function Require-Markers([string]$File,[string[]]$Markers){
    $Content=Get-Content -LiteralPath (Join-Path $Evidence $File) -Raw
    foreach($Marker in $Markers){if($Content -notmatch $Marker){throw "Required evidence missing: $File"}}
    "A3_TRAINING_EVIDENCE: file=$File; markers=true"
}
function Assert-Inputs([string]$File){
    $Inputs=@(Get-Content -LiteralPath (Join-Path $Evidence $File) -Raw|ConvertFrom-Json)
    if(-not $Inputs.Count){throw 'Nonempty evidence snapshot required'}
    foreach($Item in $Inputs){
        $InputFile=if([IO.Path]::IsPathRooted($Item.Path)){$Item.Path}else{Join-Path $Root $Item.Path}
        if((Get-FileHash -LiteralPath $InputFile).Hash -ne $Item.Hash){throw "Current input mismatch: $File"}
    }
    "A3_TRAINING_INPUTS: file=$File; files=$($Inputs.Count); changed=0"
}
Require-Markers 'a3-business-exit-checklist-20261003-r1.log' @('A3_EXIT_CHECKLIST: items=14; missing=0;')
Require-Markers 'h3-portal-finance-20261002-backend-r13.log' @('BUILD SUCCESS','\[static-rules\] no findings','FINANCE_BUILD: phase=Backend; files=3817; changed=0; exit=0')
Require-Markers 'h3-portal-finance-20261002-frontend-r7.log' @('> tsc --noEmit','built in ','FINANCE_BUILD: phase=Frontend; files=1475; changed=0; exit=0')
Assert-Inputs 'h3-portal-finance-20261002-backend-r13-inputs.json'
Assert-Inputs 'h3-portal-finance-20261002-frontend-r7-inputs.json'
$Before=@(Get-Content -LiteralPath (Join-Path $Evidence 'h3-portal-finance-20261002-backend-r12-inputs.json') -Raw|ConvertFrom-Json)
$After=@(Get-Content -LiteralPath (Join-Path $Evidence 'h3-portal-finance-20261002-backend-r13-inputs.json') -Raw|ConvertFrom-Json)
if(@(Compare-Object $Before.Path $After.Path).Count){throw 'Unexpected product addition or removal'}
$Changes=@($Before|Where-Object{(Get-FileHash -LiteralPath (Join-Path $Root $_.Path)).Hash -ne $_.Hash})
$Allowed=@('cloudflow-backend/cloudflow-service-hr/src/main/java/com/cloudflow/hr/job/TrainingArchiveRebuildJob.java',
    'cloudflow-backend/cloudflow-service-hr/src/main/java/com/cloudflow/hr/service/impl/HrTrainingArchiveServiceImpl.java')
if($Changes.Count -ne 2 -or @($Changes|Where-Object{$_.Path.Replace('\','/') -notin $Allowed}).Count){throw 'Product delta exceeds training result and failure reporting'}
Require-Markers 'h3-portal-finance-adjacent-20261002-r5/oa-database.log' @('Complete approved schema table count; expected=374; actual=374','PASS: 1012 OA boundary assertions')
Require-Markers 'h3-portal-finance-adjacent-20261002-r5/summary.log' @('regenerated_matches_formal=true; formal_modified=false','changed=0; exit=0; production_modified=false')
Require-Markers 'a3-training-checks-20261003-r1/checks.log' @('TRAINING_ARCHIVE_JOB_CHECKS: checks=17; failed=0; real_job_and_rebuild_loop=true; controlled_employee_query_and_write=true; actual_database=false')
Require-Markers 'a3-training-checks-20261003-r1/java-types.log' @('JAVA_EXPLICIT_TYPES: files=3680; inferred_declarations=0;')
Assert-Inputs 'a3-training-checks-20261003-r1/inputs.json'
Require-Markers 'a3-training-archive-20261003-http-r2.log' @('A3_TRAINING_ARCHIVE_REAL_RESULT: checks=20; failed=0; requests=8;',
    '"injection":true','"continuation":true','"failure":true','"alarm":true','"recovery":true','"counts":true','"repeat":true','"permissions":true','"restoration":true','"secrets":true',
    '"expectedEmployees":156','"realQueryFailure":true','"forcedTerminalWrites":0',
    'A3_TRAINING_ARCHIVE_INPUTS: files=19; changed=0; product_changed=0; exit=0','"leaks":0','"databaseLeaks":0')
Assert-Inputs 'a3-training-archive-20261003-inputs-r2.json'
Require-Markers 'a3-training-launch-20261003-r2.log' @('A3_TRAINING_ARCHIVE_RUN_EXIT=0','OWNED_CAPTCHA_RESTORED: original_limit=100; original_ttl=-1;','counter_writes=0; database_unchanged=true; production_modified=false')
Require-Markers 'a3-training-archive-20261003-http-r1.log' @('failed=1; requests=3;','"restoration":true','"secrets":true')
Require-Markers 'a3-training-launch-20261003-r1.log' @('OWNED_CAPTCHA_RESTORED: original_limit=100; original_ttl=-1;')
Require-Markers 'a3-training-hr-restart-20261003-r1.log' @('ISOLATED_RESTART_READY: service=hr;')
$State=Get-Content -LiteralPath (Join-Path $Root '.cloudflow-runtime/batch-g-integration/9799534e1a3a47b5958330f14ae16dc7/state.json') -Raw|ConvertFrom-Json
if($State.status -ne 'RUNNING' -or $State.processes.Count -ne 9 -or $State.services.Count -ne 6){throw 'Owned environment incomplete'}
foreach($Entry in $State.processes){$Observed=Get-CimInstance Win32_Process -Filter "ProcessId=$($Entry.id)";if(-not $Observed -or -not $Observed.CommandLine.Contains($Entry.marker)){throw 'Owned process identity mismatch'}}
foreach($Service in $State.services){$Health=Invoke-RestMethod -Uri "http://127.0.0.1:$($Service.healthPort)/actuator/health" -TimeoutSec 15;if($Health.status -ne 'UP'){throw 'Owned service not healthy'}}
'A3_TRAINING_REUSE: schema=374; product_delta=2; schema_menus_seed_and_frontend_unchanged=true; prior_structural_checks_reused=true; backend=r13; frontend=r7; historical_protocols_not_claimed_current=true'
'A3_TRAINING_RESTORATION: owned_processes=9; healthy_services=6; verification_inputs=19; changed=0; failed_round_retained=true'
'A3_TRAINING_CHECKLIST: items=14; missing=0; service_rules=17; actual_checks=20; complete_35_prd=false; production_modified=false'
