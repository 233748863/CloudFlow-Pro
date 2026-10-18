param([ValidatePattern('^r[1-9][0-9]*$')][string]$LiveRound='r26',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$BackendRound='r72',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$FrontendRound='r36',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$ComponentRound='r7',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$RegressionRound='r15',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$ResponseRound='r5',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$DraftRound='r4',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$AdjacentRound='r62')
$ErrorActionPreference='Stop'
. 'D:\CloudFlowPro\.cloudflow-runtime\use-data-drive.ps1'
$Root='D:\CloudFlowPro'
$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
function Read-Json([string]$File){Get-Content -LiteralPath (Join-Path $Evidence $File) -Raw|ConvertFrom-Json}
function Assert-Inputs([string]$File){
    $Inputs=@(Read-Json $File)
    if(-not $Inputs.Count){throw 'Original field input snapshot required'}
    foreach($Input in $Inputs){if((Get-FileHash -LiteralPath (Join-Path $Root $Input.Path)).Hash -ne $Input.Hash){throw "Original field input changed: $($Input.Path)"}}
    "C1_ORIGINAL_INPUTS: files=$($Inputs.Count); changed=0; snapshot=$File"
}
$Live="c1-form-live-20261005-$LiveRound"
$Result=Read-Json "$Live/result.json"
if(-not $Result.passed -or -not $Result.isolated -or -not $Result.originalPagesExecuted -or $Result.scope -ne 'FULL_C' -or @($Result.checks|Where-Object{-not $_.passed}).Count){throw 'Original field actual pages incomplete'}
$Pages=Read-Json "c1-original-pages-$($Result.runId)/result.json"
if(-not $Pages.passed -or -not $Pages.realPages -or $Pages.pageErrors.Count -or $Pages.referenceRequests.Count -or $Pages.fabricatedResponses -ne 0 -or $Pages.injectedValues -ne 0 -or $Pages.cases.Count -ne 2){throw 'Original field actual page evidence incomplete'}
foreach($Device in @('desktop','mobile')){
    $Cases=@($Pages.cases|Where-Object device -EQ $Device)
    if($Cases.Count -ne 1 -or $Cases[0].fields -ne 9 -or -not $Cases[0].defaultsSaved -or -not $Cases[0].clearedRestored -or -not $Cases[0].readonlyApproved){throw 'Original field device case incomplete'}
    foreach($Field in @('text','number','date','select','textarea','employee','dept','post','position')){
        foreach($Suffix in @('actual_readonly_display','actual_readonly_has_no_input')){
            if(@($Result.checks|Where-Object{$_.label -eq "${Device}_${Field}_$Suffix" -and $_.passed}).Count -ne 1){throw 'Original readonly field evidence missing'}
        }
    }
    foreach($Suffix in @('all_nine_defaults_saved','restored_clear_does_not_reapply_default','edited_values_restore_over_defaults','original_fields_start_from_page','original_readonly_approval_succeeds','original_readonly_approval_keeps_raw_values')){
        if(@($Result.checks|Where-Object{$_.label -eq "${Device}_$Suffix" -and $_.passed}).Count -ne 1){throw 'Original field business transition missing'}
    }
}
foreach($Name in @('original_nine_explicit_nulls_persist_as_present_keys','original_nine_nulls_survive_actual_response','original_readonly_pages_do_not_load_editable_references','original_real_pages_have_no_browser_exceptions','original_nine_fields_complete_on_both_devices','current_service_logs_hide_credentials_and_private_form_values','all_approval_requests_retain_access_and_error_audits','current_approval_audits_hide_private_form_values')){
    if(@($Result.checks|Where-Object{$_.label -eq $Name -and $_.passed}).Count -ne 1){throw 'Original field scope or audit evidence missing'}
}
$Component=Read-Json "c1-original-fields-20261005-$ComponentRound/result.json"
if(-not $Component.passed -or -not $Component.componentOnly -or $Component.checks.Count -ne 60 -or @($Component.checks|Where-Object{-not $_.passed}).Count -or $Component.pageErrors.Count -or $Component.businessRequests.Count){throw 'Original field component verification incomplete'}
foreach($File in @("$Live/inputs.json","h3-portal-finance-20261002-backend-$BackendRound-inputs.json","h3-portal-finance-20261002-frontend-$FrontendRound-inputs.json","c1-original-fields-20261005-$ComponentRound/inputs.json","c1-form-regression-20261005-$RegressionRound/inputs.json","c1-form-response-20261005-$ResponseRound/inputs.json","c1-original-drafts-20261005-$DraftRound/inputs.json","h3-portal-finance-adjacent-20261002-$AdjacentRound/inputs.json")){Assert-Inputs $File}
$Rules=Get-Content -LiteralPath (Join-Path $Evidence "c1-form-regression-20261005-$RegressionRound/capabilities.log") -Raw
$Browser=Get-Content -LiteralPath (Join-Path $Evidence "c1-form-regression-20261005-$RegressionRound/browser.log") -Raw
if($Rules -notmatch 'form foundation checks passed: 188;' -or $Browser -notmatch 'PASS form browser checks=52;'){throw 'Original field regression incomplete'}
$Response=Get-Content -LiteralPath (Join-Path $Evidence "c1-form-response-20261005-$ResponseRound/summary.log") -Raw
$Drafts=Get-Content -LiteralPath (Join-Path $Evidence "c1-original-drafts-20261005-$DraftRound/summary.log") -Raw
if($Response -notmatch 'changed=0; exit=0' -or $Drafts -notmatch 'changed=0; exit=0'){throw 'Original field response or draft regression incomplete'}
$Adjacent=Get-Content -LiteralPath (Join-Path $Evidence "h3-portal-finance-adjacent-20261002-$AdjacentRound/summary.log") -Raw
$Database=Get-Content -LiteralPath (Join-Path $Evidence "h3-portal-finance-adjacent-20261002-$AdjacentRound/oa-database.log") -Raw
if($Adjacent -notmatch 'changed=0; exit=0; production_modified=false' -or $Database -notmatch 'expected=374; actual=374' -or $Database -notmatch 'PASS: 1012 OA boundary assertions'){throw 'Original field adjacent evidence incomplete'}
$State=Get-Content -LiteralPath (Join-Path $Root '.cloudflow-runtime/batch-g-integration/9799534e1a3a47b5958330f14ae16dc7/state.json') -Raw|ConvertFrom-Json
if($State.status -ne 'RUNNING' -or $State.processes.Count -ne 9 -or $State.services.Count -ne 6){throw 'Owned services incomplete'}
foreach($Entry in $State.processes){$Observed=Get-CimInstance Win32_Process -Filter "ProcessId=$($Entry.id)";if(-not $Observed -or -not $Observed.CommandLine.Contains($Entry.marker)){throw 'Owned process identity changed'}}
foreach($Service in $State.services){$Health=Invoke-RestMethod -Uri "http://127.0.0.1:$($Service.healthPort)/actuator/health" -TimeoutSec 15;if($Health.status -ne 'UP'){throw 'Owned service unhealthy'}}
"C1_ORIGINAL_SUMMARY: devices=2; original_fields=9; component_checks=60; actual_checks=$($Result.checks.Count); recorded_requests=$($Result.requests.Count); healthy_services=6; whole_c1_acceptance=false; complete_35_prd=false; production_modified=false"
