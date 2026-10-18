param([ValidatePattern('^r[1-9][0-9]*$')][string]$LiveRound='r19',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$BackendRound='r71',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$FrontendRound='r29',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$ComponentRound='r3',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$LocationRound='r9',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$RegressionRound='r10',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$AdjacentRound='r60')
$ErrorActionPreference='Stop'
. 'D:\CloudFlowPro\.cloudflow-runtime\use-data-drive.ps1'
$Root='D:\CloudFlowPro'
$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
function Read-Json([string]$File){Get-Content -LiteralPath (Join-Path $Evidence $File) -Raw|ConvertFrom-Json}
function Assert-Inputs([string]$File){
    $Inputs=@(Read-Json $File)
    if(-not $Inputs.Count){throw 'Layout input snapshot required'}
    foreach($Input in $Inputs){if((Get-FileHash -LiteralPath (Join-Path $Root $Input.Path)).Hash -ne $Input.Hash){throw "Layout input changed: $($Input.Path)"}}
    "C1_LAYOUT_INPUTS: files=$($Inputs.Count); changed=0; snapshot=$File"
}
$Live="c1-form-live-20261005-$LiveRound"
$Result=Read-Json "$Live/result.json"
if(-not $Result.passed -or -not $Result.isolated -or -not $Result.layoutPagesExecuted -or $Result.scope -ne 'FULL_C' -or @($Result.checks|Where-Object{-not $_.passed}).Count){throw 'Actual layout pages did not complete'}
$Pages=Read-Json "c1-layout-pages-$($Result.runId)/result.json"
if(-not $Pages.passed -or -not $Pages.realPages -or -not $Pages.designerSaved -or -not $Pages.depthRejected -or $Pages.pageErrors.Count -or $Pages.fabricatedResponses -ne 0 -or $Pages.injectedValues -ne 0 -or $Pages.cases.Count -ne 2){throw 'Actual layout evidence incomplete'}
foreach($Name in @('four_layer_direct_save_rejected_without_form','real_designer_drag_order_and_cross_container','real_designer_rejects_fourth_layer_without_change','real_designer_save_succeeds','real_designer_dragged_definition_persisted','real_designer_reload_keeps_saved_tree','real_preview_retains_moved_field_default','real_designer_mobile_preview_preserves_value','real_designer_desktop_preview_preserves_value','real_preview_does_not_modify_saved_definition','layout_real_designer_and_both_devices_complete','current_service_logs_hide_credentials_and_private_form_values','all_approval_requests_retain_access_and_error_audits','current_approval_audits_hide_private_form_values')){
    if(@($Result.checks|Where-Object{$_.label -eq $Name -and $_.passed}).Count -ne 1){throw "Layout check missing: $Name"}
}
foreach($Device in @('desktop','mobile')){
    $Cases=@($Pages.cases|Where-Object device -EQ $Device)
    if($Cases.Count -ne 1 -or -not $Cases[0].restored -or -not $Cases[0].started -or -not $Cases[0].approved -or -not $Cases[0].semantics -or $Cases[0].fields -lt 1){throw 'A real layout device did not complete'}
    foreach($Name in @('actual_collapsed_layout_starts_closed','nested_layout_started_from_page','nested_layout_page_approval_succeeds','nested_layout_values_retained_after_approval')){
        if(@($Result.checks|Where-Object{$_.label -eq "${Device}_$Name" -and $_.passed}).Count -ne 1){throw 'A layout device behavior is missing'}
    }
}
$Component=Read-Json "c1-layout-designer-20261005-$ComponentRound/result.json"
if(-not $Component.passed -or -not $Component.componentOnly -or $Component.checks.Count -ne 39 -or @($Component.checks|Where-Object{-not $_.passed}).Count -or $Component.pageErrors.Count -or $Component.businessRequests.Count){throw 'Layout component verification is incomplete'}
$Location=Read-Json "c1-error-location-20261005-$LocationRound/result.json"
if(-not $Location.passed -or -not $Location.componentOnly -or $Location.mode -ne 'verify' -or $Location.results.Count -ne 18 -or @($Location.results|Where-Object{-not $_.inView -or -not $_.focused}).Count -or $Location.pageErrors.Count -or $Location.businessRequests.Count){throw 'Nested error focus verification incomplete'}
foreach($File in @("$Live/inputs.json","h3-portal-finance-20261002-backend-$BackendRound-inputs.json","h3-portal-finance-20261002-frontend-$FrontendRound-inputs.json","c1-layout-designer-20261005-$ComponentRound/inputs.json","c1-error-location-20261005-$LocationRound/inputs.json","c1-form-regression-20261005-$RegressionRound/inputs.json","h3-portal-finance-adjacent-20261002-$AdjacentRound/inputs.json")){Assert-Inputs $File}
$Rules=Get-Content -LiteralPath (Join-Path $Evidence "c1-form-regression-20261005-$RegressionRound/capabilities.log") -Raw
$Browser=Get-Content -LiteralPath (Join-Path $Evidence "c1-form-regression-20261005-$RegressionRound/browser.log") -Raw
if($Rules -notmatch 'form foundation checks passed: 185;' -or $Browser -notmatch 'PASS form browser checks=52;'){throw 'Frontend regression is incomplete'}
$Adjacent=Get-Content -LiteralPath (Join-Path $Evidence "h3-portal-finance-adjacent-20261002-$AdjacentRound/summary.log") -Raw
$Database=Get-Content -LiteralPath (Join-Path $Evidence "h3-portal-finance-adjacent-20261002-$AdjacentRound/oa-database.log") -Raw
if($Adjacent -notmatch 'changed=0; exit=0; production_modified=false' -or $Database -notmatch 'expected=374; actual=374' -or $Database -notmatch 'PASS: 1012 OA boundary assertions'){throw 'Adjacent layout evidence incomplete'}
$State=Get-Content -LiteralPath (Join-Path $Root '.cloudflow-runtime/batch-g-integration/9799534e1a3a47b5958330f14ae16dc7/state.json') -Raw|ConvertFrom-Json
if($State.status -ne 'RUNNING' -or $State.processes.Count -ne 9 -or $State.services.Count -ne 6){throw 'Owned services incomplete'}
foreach($Entry in $State.processes){$Observed=Get-CimInstance Win32_Process -Filter "ProcessId=$($Entry.id)";if(-not $Observed -or -not $Observed.CommandLine.Contains($Entry.marker)){throw 'Owned process identity changed'}}
foreach($Service in $State.services){$Health=Invoke-RestMethod -Uri "http://127.0.0.1:$($Service.healthPort)/actuator/health" -TimeoutSec 15;if($Health.status -ne 'UP'){throw 'Owned service unhealthy'}}
"C1_LAYOUT_SUMMARY: devices=2; component_checks=39; error_focus_scenarios=18; actual_checks=$($Result.checks.Count); recorded_requests=$($Result.requests.Count); designer_persisted=true; healthy_services=6; whole_c1_acceptance=false; complete_35_prd=false; production_modified=false"
