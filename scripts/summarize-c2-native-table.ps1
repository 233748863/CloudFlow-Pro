param([string]$FrontendRound='r43',[string]$BackendRound='r74',[string]$NativeRound='r3',
    [string]$MobileRound='r5',[string]$LocationRound='r15',[string]$RegressionRound='r20',
    [string]$DesktopLiveRound='r37',[string]$MobileLiveRound='r38',[string]$AdjacentRound='r68',[string]$ResponseRound='r6')
$ErrorActionPreference='Stop'
. 'D:\CloudFlowPro\.cloudflow-runtime/use-data-drive.ps1'
$Root='D:\CloudFlowPro'
$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
foreach($Round in @($FrontendRound,$BackendRound,$NativeRound,$MobileRound,$LocationRound,$RegressionRound,$DesktopLiveRound,$MobileLiveRound,$AdjacentRound,$ResponseRound)){if($Round -notmatch '^r[1-9][0-9]*$'){throw 'Invalid native table verification round'}}
function Read-NativeJson([string]$File){Get-Content -LiteralPath (Join-Path $Evidence $File) -Raw|ConvertFrom-Json}
function Assert-NativeInputs([string]$File){
    $Inputs=@(Read-NativeJson $File)
    if(-not $Inputs.Count){throw 'Native table input snapshot required'}
    foreach($Input in $Inputs){if((Get-FileHash -LiteralPath (Join-Path $Root $Input.Path)).Hash -ne $Input.Hash){throw "Native table input changed: $($Input.Path)"}}
    "C2_NATIVE_INPUTS: files=$($Inputs.Count); changed=0; snapshot=$File"
}
& (Join-Path $Root 'scripts/summarize-c2-mobile-subtable.ps1') -FrontendRound $FrontendRound -BackendRound $BackendRound -ComponentRound $MobileRound -LocationRound $LocationRound -RegressionRound $RegressionRound -LiveRound $MobileLiveRound -AdjacentRound $AdjacentRound -ResponseRound $ResponseRound
$Native=Read-NativeJson "c2-native-table-20261005-$NativeRound/result.json"
if(-not $Native.completed -or $Native.mode -ne 'verify' -or -not $Native.componentOnly -or $Native.checks.Count -ne 21 -or @($Native.checks|Where-Object{-not $_.passed}).Count -or $Native.pageErrors.Count -or $Native.businessRequests.Count -or $null -eq $Native.mountMs -or $Native.mountMs -ge 500){throw 'Native table component evidence incomplete'}
$Location=Read-NativeJson "c1-error-location-20261005-$LocationRound/result.json"
foreach($Case in @($Location.results|Where-Object scenario -EQ 'virtual-edit')){
    if(-not $Case.afterRowOperations.inView -or -not $Case.afterRowOperations.focused -or -not $Case.tabReturnStartsAtFirstRow){throw 'Native table last error and tab return incomplete'}
}
$Live="c1-form-live-20261005-$DesktopLiveRound"
$Result=Read-NativeJson "$Live/result.json"
if(-not $Result.passed -or -not $Result.isolated -or -not $Result.subtableNativeExecuted -or $Result.scope -ne 'FULL_C' -or @($Result.checks|Where-Object{-not $_.passed}).Count){throw 'Native table actual scope incomplete'}
$Pages=Read-NativeJson "c2-native-table-pages-$($Result.runId)/result.json"
if(-not $Pages.passed -or -not $Pages.realPages -or $Pages.device -ne 'desktop' -or $Pages.stage -ne 'approval' -or -not $Pages.instanceId -or $Pages.rows -ne 4 -or $Pages.pageErrors.Count -or $Pages.fabricatedResponses -ne 0 -or $Pages.forcedModelWrites -ne 0){throw 'Native table actual pages incomplete'}
foreach($Name in @('c2_real_native_form_has_native_scoped_table','c2_real_native_approval_has_native_scoped_table',
    'c2_real_native_initial_rows_have_unique_ids','c2_real_native_copy_persists_new_identity','c2_real_native_down_preserves_values',
    'c2_real_native_reorder_delete_add_preserve_row_ids','c2_real_native_exact_sum_after_operations',
    'c2_real_native_starts_from_saved_rows','c2_real_native_approval_succeeds','c2_real_native_final_rows_and_ids_retained',
    'c2_real_native_definition_unchanged','c2_real_native_no_browser_errors','form_definition_requests_retain_safe_audits',
    'current_service_logs_hide_credentials_and_private_form_values','all_approval_requests_retain_access_and_error_audits','current_approval_audits_hide_private_form_values')){
    if(@($Result.checks|Where-Object{$_.label -eq $Name -and $_.passed}).Count -ne 1){throw "Native table actual evidence missing: $Name"}
}
foreach($Index in 0..3){foreach($Prefix in @('c2_real_native_restores_row_','c2_real_native_approval_row_')){
    if(@($Result.checks|Where-Object{$_.label -eq "$Prefix$Index" -and $_.passed}).Count -ne 1){throw 'Native table restored or approval row missing'}
}}
foreach($Endpoint in @('/workflow/wf/draft','/workflow/wf/start','/workflow/wf/complete')){
    if(-not @($Result.requests|Where-Object{$_.path -eq $Endpoint -and $_.method -eq 'POST' -and $_.realPage -and $_.device -eq 'desktop' -and $_.status -eq 200}).Count){throw 'Native table actual page request missing'}
}
foreach($File in @("c2-native-table-20261005-$NativeRound/inputs.json","$Live/inputs.json")){Assert-NativeInputs $File}
$Launch=Get-Content -LiteralPath (Join-Path $Evidence "c2-native-table-live-$DesktopLiveRound-launch.log") -Raw
if($Launch -notmatch 'OWNED_CAPTCHA_RESTORED: original_limit=100; original_ttl=-1;' -or $Launch -notmatch 'counter_writes=0; database_unchanged=true; production_modified=false'){throw 'Native table captcha restoration missing'}
"C2_NATIVE_SUMMARY: native_checks=21; mobile_checks=20; focus_scenarios=18; mount_ms=$($Native.mountMs); desktop_actual_checks=$($Result.checks.Count); desktop_requests=$($Result.requests.Count); both_devices_saved_and_approved_rows=4; whole_c2_acceptance=false; complete_35_prd=false; production_modified=false"
