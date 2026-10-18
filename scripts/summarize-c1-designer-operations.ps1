param([ValidatePattern('^r[1-9][0-9]*$')][string]$LiveRound='r31',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$BackendRound='r73',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$FrontendRound='r38',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$RegressionRound='r16',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$AdjacentRound='r65',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$MobileRound='r1')
$ErrorActionPreference='Stop'
. 'D:\CloudFlowPro\.cloudflow-runtime/use-data-drive.ps1'
$Root='D:\CloudFlowPro'
$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
function Read-Json([string]$File){Get-Content -LiteralPath (Join-Path $Evidence $File) -Raw|ConvertFrom-Json}
function Assert-Inputs([string]$File){
    $Inputs=@(Read-Json $File)
    if(-not $Inputs.Count){throw 'Designer operation input snapshot required'}
    foreach($Input in $Inputs){if((Get-FileHash -LiteralPath (Join-Path $Root $Input.Path)).Hash -ne $Input.Hash){throw "Designer operation input changed: $($Input.Path)"}}
    "C1_DESIGNER_INPUTS: files=$($Inputs.Count); changed=0; snapshot=$File"
}
$Live="c1-form-live-20261005-$LiveRound"
$Result=Read-Json "$Live/result.json"
if(-not $Result.passed -or -not $Result.isolated -or -not $Result.designerOperationsExecuted -or $Result.scope -ne 'FULL_C' -or @($Result.checks|Where-Object{-not $_.passed}).Count){throw 'Designer operation live scope incomplete'}
$Pages=Read-Json "c1-designer-operations-$($Result.runId)/result.json"
if(-not $Pages.passed -or -not $Pages.realPages -or $Pages.groups -ne 8 -or $Pages.devices.Count -ne 1 -or $Pages.devices[0] -ne 'desktop' -or $Pages.propertyTypes -ne 7 -or -not $Pages.savedVersion -or $Pages.pageErrors.Count -or $Pages.fabricatedResponses -ne 0 -or $Pages.forcedModelWrites -ne 0){throw 'Designer operation pages incomplete'}
$Mobile=Read-Json "c1-palette-mobile-20261005-$MobileRound/result.json"
if(-not $Mobile.passed -or $Mobile.scope -ne 'COMPONENT_ONLY' -or $Mobile.groups -ne 8 -or $Mobile.mobileDesignerRoute -or $Mobile.businessDatabaseWrites -ne 0 -or $Mobile.pageErrors.Count -or $Mobile.blockedRequests.Count -or @($Mobile.checks|Where-Object{-not $_.passed}).Count){throw 'Mobile palette component evidence incomplete'}
foreach($Group in @('文本','数值','日期','选择','组织','文件','静态','布局与明细')){
    foreach($Suffix in @('keyboard_collapses_group','keyboard_expands_group')){
        if(@($Result.checks|Where-Object{$_.label -eq "desktop_${Group}_$Suffix" -and $_.passed}).Count -ne 1){throw 'Desktop keyboard group evidence missing'}
    }
    foreach($Suffix in @('group_touch_target','group_collapses','group_expands')){
        if(@($Mobile.checks|Where-Object{$_.label -eq "mobile_${Group}_$Suffix" -and $_.passed}).Count -ne 1){throw 'Mobile component group evidence missing'}
    }
}
foreach($Name in @('designer_search_reveals_collapsed_matches','designer_clear_search_restores_collapsed_preference','designer_group_actions_preserve_definition',
    'designer_actual_copy_preserves_content_with_unique_ids','designer_actual_batch_delete_handles_nested_and_root_fields','designer_empty_container_blocks_before_request','designer_missing_dictionary_blocks_before_request',
    'designer_duplicate_ids_rejected_by_server_without_write','designer_seven_property_types_preserved_in_model','designer_actual_save_creates_version_and_preserves_original','designer_reload_retains_copies_deletion_and_properties',
    'designer_operation_pages_have_no_browser_errors','current_service_logs_hide_credentials_and_private_form_values','all_approval_requests_retain_access_and_error_audits','current_approval_audits_hide_private_form_values')){
    if(@($Result.checks|Where-Object{$_.label -eq $Name -and $_.passed}).Count -ne 1){throw 'Designer operation or audit evidence missing'}
}
foreach($Name in @('mobile_search_reveals_collapsed_matches','mobile_clear_search_restores_collapsed_preference','mobile_group_actions_do_not_add_fields','mobile_palette_no_browser_errors_or_business_requests')){
    if(@($Mobile.checks|Where-Object{$_.label -eq $Name -and $_.passed}).Count -ne 1){throw 'Mobile palette interaction evidence missing'}
}
foreach($File in @("$Live/inputs.json","h3-portal-finance-20261002-backend-$BackendRound-inputs.json","h3-portal-finance-20261002-frontend-$FrontendRound-inputs.json","c1-form-regression-20261005-$RegressionRound/inputs.json","h3-portal-finance-adjacent-20261002-$AdjacentRound/inputs.json","c1-palette-mobile-20261005-$MobileRound/inputs.json")){Assert-Inputs $File}
$Rules=Get-Content -LiteralPath (Join-Path $Evidence "c1-form-regression-20261005-$RegressionRound/capabilities.log") -Raw
$Browser=Get-Content -LiteralPath (Join-Path $Evidence "c1-form-regression-20261005-$RegressionRound/browser.log") -Raw
if($Rules -notmatch 'form foundation checks passed: 188;' -or $Browser -notmatch 'PASS form browser checks=52;'){throw 'Designer operation regression incomplete'}
$Adjacent=Get-Content -LiteralPath (Join-Path $Evidence "h3-portal-finance-adjacent-20261002-$AdjacentRound/summary.log") -Raw
$Database=Get-Content -LiteralPath (Join-Path $Evidence "h3-portal-finance-adjacent-20261002-$AdjacentRound/oa-database.log") -Raw
if($Adjacent -notmatch 'changed=0; exit=0; production_modified=false' -or $Database -notmatch 'expected=374; actual=374' -or $Database -notmatch 'PASS: 1012 OA boundary assertions'){throw 'Designer operation adjacent evidence incomplete'}
$Launch=Get-Content -LiteralPath (Join-Path $Evidence "c1-designer-operations-live-$LiveRound-launch.log") -Raw
if($Launch -notmatch 'OWNED_CAPTCHA_RESTORED: original_limit=100; original_ttl=-1;' -or $Launch -notmatch 'counter_writes=0; database_unchanged=true; production_modified=false'){throw 'Designer operation captcha restoration missing'}
$State=Get-Content -LiteralPath (Join-Path $Root '.cloudflow-runtime/batch-g-integration/9799534e1a3a47b5958330f14ae16dc7/state.json') -Raw|ConvertFrom-Json
if($State.status -ne 'RUNNING' -or $State.processes.Count -ne 9 -or $State.services.Count -ne 6){throw 'Owned services incomplete'}
foreach($Entry in $State.processes){$Observed=Get-CimInstance Win32_Process -Filter "ProcessId=$($Entry.id)";if(-not $Observed -or -not $Observed.CommandLine.Contains($Entry.marker)){throw 'Owned process identity changed'}}
foreach($Service in $State.services){$Health=Invoke-RestMethod -Uri "http://127.0.0.1:$($Service.healthPort)/actuator/health" -TimeoutSec 15;if($Health.status -ne 'UP'){throw 'Owned service unhealthy'}}
"C1_DESIGNER_SUMMARY: groups=8; real_desktop=true; mobile_component_checks=$($Mobile.checks.Count); mobile_designer_route=false; property_types=7; actual_checks=$($Result.checks.Count); recorded_requests=$($Result.requests.Count); healthy_services=6; whole_c1_acceptance=false; complete_35_prd=false; production_modified=false"
