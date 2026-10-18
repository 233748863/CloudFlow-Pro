$ErrorActionPreference='Stop'
$Root='D:\CloudFlowPro'
. (Join-Path $Root '.cloudflow-runtime/use-data-drive.ps1')
$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
function Require-Markers([string]$File,[string[]]$Markers){
    $Content=Get-Content -LiteralPath (Join-Path $Evidence $File) -Raw
    foreach($Marker in $Markers){if($Content -notmatch $Marker){throw "Required evidence missing: $File"}}
    "A3_RECONCILE_BINDINGS_EVIDENCE: file=$File; markers=true"
}
function Assert-Inputs([string]$File){
    $Inputs=@(Get-Content -LiteralPath (Join-Path $Evidence $File) -Raw|ConvertFrom-Json)
    if(-not $Inputs.Count){throw 'Nonempty evidence snapshot required'}
    foreach($Item in $Inputs){
        $InputFile=if([IO.Path]::IsPathRooted($Item.Path)){$Item.Path}else{Join-Path $Root $Item.Path}
        if((Get-FileHash -LiteralPath $InputFile).Hash -ne $Item.Hash){throw "Current input mismatch: $File"}
    }
    "A3_RECONCILE_BINDINGS_INPUTS: file=$File; files=$($Inputs.Count); changed=0"
}
Require-Markers 'a3-process-reconcile-checklist-20261003-r1.log' @('A3_PROCESS_RECONCILE_CHECKLIST: items=14; missing=0;')
Require-Markers 'h3-portal-finance-20261002-backend-r21.log' @('BUILD SUCCESS','\[static-rules\] no findings','FINANCE_BUILD: phase=Backend; files=3817; changed=0; exit=0')
Require-Markers 'h3-portal-finance-20261002-frontend-r7.log' @('> tsc --noEmit','built in ','FINANCE_BUILD: phase=Frontend; files=1475; changed=0; exit=0')
Assert-Inputs 'h3-portal-finance-20261002-backend-r21-inputs.json'
Assert-Inputs 'h3-portal-finance-20261002-frontend-r7-inputs.json'
$Before=@(Get-Content -LiteralPath (Join-Path $Evidence 'h3-portal-finance-20261002-backend-r19-inputs.json') -Raw|ConvertFrom-Json)
$After=@(Get-Content -LiteralPath (Join-Path $Evidence 'h3-portal-finance-20261002-backend-r21-inputs.json') -Raw|ConvertFrom-Json)
if(@(Compare-Object $Before.Path $After.Path).Count){throw 'Unexpected product addition or removal'}
$Changes=@($Before|Where-Object{(Get-FileHash -LiteralPath (Join-Path $Root $_.Path)).Hash -ne $_.Hash}|ForEach-Object{$_.Path.Replace('\','/')})
$Allowed=@('cloudflow-backend/cloudflow-common/cloudflow-common-workflow-callback/src/main/java/com/cloudflow/common/workflow/callback/registry/BusinessTypeDef.java',
    'cloudflow-backend/cloudflow-service-workflow/src/main/java/com/cloudflow/workflow/config/WorkflowBusinessTypeContributor.java',
    'cloudflow-backend/cloudflow-service-workflow/src/main/resources/mapper/workflow/WfReconcileAlertMapper.xml')
if(@(Compare-Object $Allowed $Changes).Count){throw 'Product delta exceeds reconciliation bindings and query'}
Require-Markers 'h3-portal-finance-adjacent-20261002-r5/oa-database.log' @('Complete approved schema table count; expected=374; actual=374','PASS: 1012 OA boundary assertions')
Require-Markers 'h3-portal-finance-adjacent-20261002-r5/summary.log' @('regenerated_matches_formal=true; formal_modified=false','changed=0; exit=0; production_modified=false')
Require-Markers 'a3-reconcile-bindings-checks-20261003-r2/checks.log' @('RECONCILE_BINDINGS_DATABASE: checks=6536; scenarios=774; bindings=43; tables=40; fixtures=44; failed=0;',
    'real_registry=true; real_mapper=true; schema=374; transaction_rolled_back=true; committed_samples=0;',
    'RECONCILE_BINDINGS_ROLLBACK: marker=A3B[a-f0-9]+; business_samples=0; process_samples=0; committed_samples=0')
Require-Markers 'a3-reconcile-bindings-checks-20261003-r2/java-types.log' @('JAVA_EXPLICIT_TYPES: files=3686; inferred_declarations=0;')
Assert-Inputs 'a3-reconcile-bindings-checks-20261003-r2/inputs.json'
Require-Markers 'a3-process-reconcile-checks-20261003-r2/checks.log' @('PROCESS_RECONCILE_CHECKS: checks=267; failed=0;')
Assert-Inputs 'a3-process-reconcile-checks-20261003-r2/inputs.json'
Require-Markers 'a3-process-reconcile-20261003-http-r5.log' @('A3_PROCESS_RECONCILE_REAL_RESULT: checks=28; failed=0; requests=14;',
    '"injection":true','"rollback":true','"continuation":true','"failure":true','"alarm":true','"recovery":true','"counts":true','"repeat":true',
    '"boundaries":true','"delivery":true','"permissions":true','"restoration":true','"secrets":true','"samples":7','"newAlerts":3','"messages":41',
    '"recovered":1','"repeated":0','"realInsertFailure":true','"forcedTerminalWrites":0','"leaks":0','"databaseLeaks":0',
    'A3_PROCESS_RECONCILE_INPUTS: files=19; changed=0; product_changed=0; exit=0')
Assert-Inputs 'a3-process-reconcile-20261003-inputs-r5.json'
Require-Markers 'a3-process-reconcile-launch-20261003-r5.log' @('A3_PROCESS_RECONCILE_RUN_EXIT=0','OWNED_CAPTCHA_RESTORED: original_limit=100; original_ttl=-1;',
    'counter_writes=0; database_unchanged=true; production_modified=false')
Require-Markers 'a3-reconcile-bindings-service-restart-20261003-r1.log' @('ISOLATED_RESTART_READY: service=workflow;')
Require-Markers 'a3-reconcile-bindings-smtp-restart-20261003-r1.log' @('ISOLATED_SMTP_READY:','previous_evidence_retained=true; production_modified=false')
$State=Get-Content -LiteralPath (Join-Path $Root '.cloudflow-runtime/batch-g-integration/9799534e1a3a47b5958330f14ae16dc7/state.json') -Raw|ConvertFrom-Json
if($State.status -ne 'RUNNING' -or $State.processes.Count -ne 9 -or $State.services.Count -ne 6){throw 'Owned environment incomplete'}
foreach($Entry in $State.processes){$Observed=Get-CimInstance Win32_Process -Filter "ProcessId=$($Entry.id)";if(-not $Observed -or -not $Observed.CommandLine.Contains($Entry.marker)){throw 'Owned process identity mismatch'}}
foreach($Service in $State.services){$Health=Invoke-RestMethod -Uri "http://127.0.0.1:$($Service.healthPort)/actuator/health" -TimeoutSec 15;if($Health.status -ne 'UP'){throw 'Owned service not healthy'}}
'A3_RECONCILE_BINDINGS_REUSE: schema=374; product_delta=3; schema_menus_seed_and_frontend_unchanged=true; prior_structural_checks_reused=true; backend=r21; frontend=r7; historical_protocols_not_claimed_current=true'
'A3_RECONCILE_BINDINGS_RESTORATION: owned_processes=9; healthy_services=6; verification_inputs=19; changed=0; prior_round_evidence_retained=true'
'A3_RECONCILE_BINDINGS_CHECKLIST: items=14; missing=0; database_scenarios=774; service_rules=267; actual_checks=28; complete_35_prd=false; production_modified=false'
