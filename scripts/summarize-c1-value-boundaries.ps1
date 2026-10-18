param([ValidatePattern('^r[1-9][0-9]*$')][string]$LiveRound,
    [ValidatePattern('^r[1-9][0-9]*$')][string]$BackendRound='r70',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$FrontendRound='r24',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$AdjacentRound='r57',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$ResponseRound='r3')
$ErrorActionPreference='Stop'
. 'D:\CloudFlowPro\.cloudflow-runtime\use-data-drive.ps1'
$Root='D:\CloudFlowPro'
$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
function Read-Json([string]$File){Get-Content -LiteralPath (Join-Path $Evidence $File) -Raw|ConvertFrom-Json}
function Assert-Inputs([string]$File){
    $Inputs=@(Read-Json $File)
    if(-not $Inputs.Count){throw 'A nonempty input snapshot is required'}
    foreach($Input in $Inputs){if((Get-FileHash -LiteralPath (Join-Path $Root $Input.Path)).Hash -ne $Input.Hash){throw "Matrix input changed: $($Input.Path)"}}
    "C1_MATRIX_INPUTS: files=$($Inputs.Count); changed=0; snapshot=$File"
}
$Live="c1-form-live-20261005-$LiveRound"
$Result=Read-Json "$Live/result.json"
if(-not $Result.passed -or -not $Result.isolated -or -not $Result.valueBoundariesExecuted -or $Result.scope -ne 'FULL_C' -or @($Result.checks|Where-Object{-not $_.passed}).Count){throw 'Actual value matrix did not complete'}
$Matrix=Read-Json "c1-value-boundaries-$($Result.runId)/result.json"
$Types=@('TEXT','TEXTAREA','RICH_TEXT','NUMBER','AMOUNT','DATE','DATETIME','TIME','DATE_RANGE','SELECT','MULTI_SELECT','RADIO_GROUP','CHECKBOX_GROUP','SWITCH','DICT_SELECT','EMPLOYEE','DEPT','POST','POSITION','USER_MULTI','DEPT_MULTI','UPLOAD_FILE','UPLOAD_IMAGE','SUB_TABLE')
if(-not $Matrix.passed -or -not $Matrix.realServices -or $Matrix.fabricatedResponses -ne 0 -or $Matrix.browserRenderingVerified -or $Matrix.types.Count -ne 24 -or @((Compare-Object ($Types|Sort-Object) ($Matrix.types|Sort-Object))).Count){throw 'Incomplete actual field type coverage'}
if($Matrix.cases.Count -ne 96 -or @($Matrix.cases|Where-Object{-not $_.passed -or $_.status -ne 400}).Count){throw 'All 96 submitted invalid values must be rejected by field validation'}
foreach($Phase in @{draft=31;start=32;draft_submit=1;approval=32}.GetEnumerator()){
    if(@($Matrix.cases|Where-Object phase -EQ $Phase.Key).Count -ne $Phase.Value){throw 'An input phase is missing'}
}
foreach($Name in @('matrix_executable_disguised_as_jpg_rejected_without_file_record','matrix_valid_pdf_uploaded','matrix_valid_png_uploaded','matrix_all_24_types_saved_in_draft','matrix_all_24_values_retained_in_actual_instance','matrix_incomplete_draft_can_be_saved','matrix_incomplete_draft_submission_preserves_draft','matrix_corrected_instance_reaches_passed','matrix_approval_preserves_other_23_values','matrix_corrected_approval_has_exactly_one_history','matrix_rate_configuration_unchanged','current_service_logs_hide_credentials_and_private_form_values','all_approval_requests_retain_access_and_error_audits','current_approval_audits_hide_private_form_values')){
    if(@($Result.checks|Where-Object{$_.label -eq $Name -and $_.passed}).Count -ne 1){throw "Required matrix behavior missing: $Name"}
}
Assert-Inputs "$Live/inputs.json"
Assert-Inputs "h3-portal-finance-20261002-backend-$BackendRound-inputs.json"
Assert-Inputs "h3-portal-finance-20261002-frontend-$FrontendRound-inputs.json"
$Responses="c1-form-response-20261005-$ResponseRound"
$FormChecks=Get-Content -LiteralPath (Join-Path $Evidence "$Responses/form.log") -Raw
$PrivacyChecks=Get-Content -LiteralPath (Join-Path $Evidence "$Responses/privacy.log") -Raw
if($FormChecks -notmatch 'Batch C form input service checks passed: 229;' -or $PrivacyChecks -notmatch 'SensitiveLogPipelineChecks: 1294 checks passed' -or $PrivacyChecks -notmatch 'SensitiveLogPolicyChecks: 871 checks passed'){throw 'Type preservation or privacy regression checks are missing'}
Assert-Inputs "$Responses/inputs.json"
$Adjacent="h3-portal-finance-adjacent-20261002-$AdjacentRound"
$PriorSummary=Get-Content -LiteralPath (Join-Path $Evidence "$Adjacent/summary.log") -Raw
$PriorDatabase=Get-Content -LiteralPath (Join-Path $Evidence "$Adjacent/oa-database.log") -Raw
if($PriorSummary -notmatch 'changed=0; exit=0; production_modified=false' -or $PriorDatabase -notmatch 'expected=374; actual=374' -or $PriorDatabase -notmatch 'PASS: 1012 OA boundary assertions'){throw 'Prior adjacent evidence is incomplete'}
$PriorInputs=@(Read-Json "$Adjacent/inputs.json")
$Changes=@($PriorInputs|Where-Object{(Get-FileHash -LiteralPath (Join-Path $Root $_.Path)).Hash -ne $_.Hash})
$Allowed=@('scripts/verify-batch-c-live.mjs','scripts/run-c1-form-live.ps1','scripts/run-owned-captcha-allowance.mjs','scripts/verify-c1-value-boundaries.mjs','scripts/cleanup-c1-error-page-roles.mjs')
if(@($Changes|Where-Object{$_.Path.Replace('\','/') -notin $Allowed}).Count){throw 'Adjacent evidence has an unreviewed input change'}
"C1_MATRIX_ADJACENT_REUSE: original_round=$AdjacentRound; original_inputs=$($PriorInputs.Count); changed_execution_scripts=$($Changes.Count); product_changed=0; original_script_snapshot_unchanged=$($Changes.Count -eq 0)"
$State=Get-Content -LiteralPath (Join-Path $Root '.cloudflow-runtime/batch-g-integration/9799534e1a3a47b5958330f14ae16dc7/state.json') -Raw|ConvertFrom-Json
if($State.status -ne 'RUNNING' -or $State.processes.Count -ne 9 -or $State.services.Count -ne 6){throw 'Owned services are incomplete'}
foreach($Entry in $State.processes){$Observed=Get-CimInstance Win32_Process -Filter "ProcessId=$($Entry.id)";if(-not $Observed -or -not $Observed.CommandLine.Contains($Entry.marker)){throw 'Owned process identity changed'}}
foreach($Service in $State.services){$Health=Invoke-RestMethod -Uri "http://127.0.0.1:$($Service.healthPort)/actuator/health" -TimeoutSec 15;if($Health.status -ne 'UP'){throw 'Owned service is unhealthy'}}
"C1_VALUE_MATRIX_SUMMARY: types=24; rejected_submissions=96; actual_checks=$($Result.checks.Count); actual_requests=$($Result.requests.Count); owned_processes=9; healthy_services=6; browser_rendering_verified=false; whole_c1_acceptance=false; complete_35_prd=false; production_modified=false"
