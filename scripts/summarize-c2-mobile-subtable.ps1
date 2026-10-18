param([string]$FrontendRound='r40',[string]$BackendRound='r74',[string]$ComponentRound='r3',
    [string]$LocationRound='r11',[string]$RegressionRound='r18',[string]$LiveRound='r35',[string]$AdjacentRound='r67',[string]$ResponseRound='r6')
$ErrorActionPreference='Stop'
. 'D:\CloudFlowPro\.cloudflow-runtime/use-data-drive.ps1'
$Root='D:\CloudFlowPro'
$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
foreach($Round in @($FrontendRound,$BackendRound,$ComponentRound,$LocationRound,$RegressionRound,$LiveRound,$AdjacentRound,$ResponseRound)){if($Round -notmatch '^r[1-9][0-9]*$'){throw 'Invalid verification round'}}
function Read-Json([string]$File){Get-Content -LiteralPath (Join-Path $Evidence $File) -Raw|ConvertFrom-Json}
function Assert-Inputs([string]$File){
    $Inputs=@(Read-Json $File)
    if(-not $Inputs.Count){throw 'Mobile subtable input snapshot required'}
    foreach($Input in $Inputs){if((Get-FileHash -LiteralPath (Join-Path $Root $Input.Path)).Hash -ne $Input.Hash){throw "Mobile subtable input changed: $($Input.Path)"}}
    "C2_MOBILE_INPUTS: files=$($Inputs.Count); changed=0; snapshot=$File"
}
$Component=Read-Json "c2-mobile-subtable-20261005-$ComponentRound/result.json"
if(-not $Component.completed -or $Component.mode -ne 'verify' -or -not $Component.componentOnly -or $Component.checks.Count -ne 20 -or @($Component.checks|Where-Object{-not $_.passed}).Count -or $Component.pageErrors.Count -or $Component.businessRequests.Count){throw 'Mobile subtable component evidence incomplete'}
$Location=Read-Json "c1-error-location-20261005-$LocationRound/result.json"
if(-not $Location.passed -or $Location.mode -ne 'verify' -or $Location.results.Count -ne 18 -or @($Location.results|Where-Object{-not $_.inView -or -not $_.focused}).Count -or $Location.pageErrors.Count -or $Location.businessRequests.Count){throw 'Mobile subtable error focus evidence incomplete'}
$Live="c1-form-live-20261005-$LiveRound"
$Result=Read-Json "$Live/result.json"
if(-not $Result.passed -or -not $Result.isolated -or -not $Result.subtableMobileExecuted -or $Result.scope -ne 'FULL_C' -or @($Result.checks|Where-Object{-not $_.passed}).Count){throw 'Mobile subtable actual scope incomplete'}
$Pages=Read-Json "c2-mobile-subtable-pages-$($Result.runId)/result.json"
if(-not $Pages.passed -or -not $Pages.realPages -or $Pages.stage -ne 'approval' -or -not $Pages.instanceId -or $Pages.rows -ne 4 -or $Pages.pageErrors.Count -or $Pages.fabricatedResponses -ne 0 -or $Pages.forcedModelWrites -ne 0){throw 'Mobile subtable actual pages incomplete'}
foreach($Name in @('c2_real_mobile_initial_rows_have_unique_ids','c2_real_mobile_copy_persists_new_identity',
    'c2_real_mobile_reorder_delete_add_preserve_row_ids','c2_real_mobile_exact_sum_after_operations',
    'c2_real_mobile_starts_from_saved_rows','c2_real_mobile_approval_succeeds','c2_real_mobile_final_rows_and_ids_retained',
    'c2_real_mobile_definition_unchanged','c2_real_mobile_no_browser_errors','form_definition_requests_retain_safe_audits','form_definition_gateway_denial_exercised',
    'current_service_logs_hide_credentials_and_private_form_values','all_approval_requests_retain_access_and_error_audits','current_approval_audits_hide_private_form_values')){
    if(@($Result.checks|Where-Object{$_.label -eq $Name -and $_.passed}).Count -ne 1){throw "Mobile subtable actual evidence missing: $Name"}
}
foreach($Index in 0..3){foreach($Prefix in @('c2_real_mobile_restores_row_','c2_real_mobile_approval_row_')){
    if(@($Result.checks|Where-Object{$_.label -eq "$Prefix$Index" -and $_.passed}).Count -ne 1){throw 'Mobile subtable restored or approval row missing'}
}}
foreach($Endpoint in @('/workflow/wf/draft','/workflow/wf/start','/workflow/wf/complete')){
    if(-not @($Result.requests|Where-Object{$_.path -eq $Endpoint -and $_.method -eq 'POST' -and $_.realPage -and $_.device -eq 'mobile' -and $_.status -eq 200}).Count){throw 'Mobile subtable actual page request missing'}
}
foreach($File in @("h3-portal-finance-20261002-backend-$BackendRound-inputs.json","h3-portal-finance-20261002-frontend-$FrontendRound-inputs.json",
    "c2-mobile-subtable-20261005-$ComponentRound/inputs.json","c1-error-location-20261005-$LocationRound/inputs.json",
    "c1-form-regression-20261005-$RegressionRound/inputs.json","c1-form-response-20261005-$ResponseRound/inputs.json","$Live/inputs.json","h3-portal-finance-adjacent-20261002-$AdjacentRound/inputs.json")){Assert-Inputs $File}
$BackendBuild=Get-Content -LiteralPath (Join-Path $Evidence "h3-portal-finance-20261002-backend-$BackendRound.log") -Raw
if($BackendBuild -notmatch 'FINANCE_BUILD: phase=Backend; files=3825; changed=0; exit=0'){throw 'Mobile subtable backend build incomplete'}
$Response=Get-Content -LiteralPath (Join-Path $Evidence "c1-form-response-20261005-$ResponseRound/summary.log") -Raw
$Privacy=Get-Content -LiteralPath (Join-Path $Evidence "c1-form-response-20261005-$ResponseRound/privacy.log") -Raw
if($Response -notmatch 'changed=0; exit=0;' -or $Privacy -notmatch 'SensitiveLogPipelineChecks: [0-9]+ checks passed' -or $Privacy -notmatch 'SensitiveLogPolicyChecks: [0-9]+ checks passed'){throw 'Mobile subtable response and privacy checks incomplete'}
$Build=Get-Content -LiteralPath (Join-Path $Evidence "h3-portal-finance-20261002-frontend-$FrontendRound.log") -Raw
if($Build -notmatch 'FINANCE_BUILD: phase=Frontend; files=1478; changed=0; exit=0'){throw 'Mobile subtable frontend build incomplete'}
$Rules=Get-Content -LiteralPath (Join-Path $Evidence "c1-form-regression-20261005-$RegressionRound/capabilities.log") -Raw
$Browser=Get-Content -LiteralPath (Join-Path $Evidence "c1-form-regression-20261005-$RegressionRound/browser.log") -Raw
if($Rules -notmatch 'form foundation checks passed: 188;' -or $Browser -notmatch 'PASS form browser checks=52;'){throw 'Mobile subtable frontend regression incomplete'}
$Adjacent=Get-Content -LiteralPath (Join-Path $Evidence "h3-portal-finance-adjacent-20261002-$AdjacentRound/summary.log") -Raw
$Database=Get-Content -LiteralPath (Join-Path $Evidence "h3-portal-finance-adjacent-20261002-$AdjacentRound/oa-database.log") -Raw
if($Adjacent -notmatch 'changed=0; exit=0; production_modified=false' -or $Database -notmatch 'expected=374; actual=374' -or $Database -notmatch 'PASS: 1012 OA boundary assertions'){throw 'Mobile subtable adjacent evidence incomplete'}
$Launch=Get-Content -LiteralPath (Join-Path $Evidence "c2-mobile-subtable-live-$LiveRound-launch.log") -Raw
if($Launch -notmatch 'OWNED_CAPTCHA_RESTORED: original_limit=100; original_ttl=-1;' -or $Launch -notmatch 'counter_writes=0; database_unchanged=true; production_modified=false'){throw 'Mobile subtable captcha restoration missing'}
$State=Get-Content -LiteralPath (Join-Path $Root '.cloudflow-runtime/batch-g-integration/9799534e1a3a47b5958330f14ae16dc7/state.json') -Raw|ConvertFrom-Json
if($State.status -ne 'RUNNING' -or $State.processes.Count -ne 9 -or $State.services.Count -ne 6){throw 'Owned services incomplete'}
foreach($Entry in $State.processes){$Observed=Get-CimInstance Win32_Process -Filter "ProcessId=$($Entry.id)";if(-not $Observed -or -not $Observed.CommandLine.Contains($Entry.marker)){throw 'Owned process identity changed'}}
foreach($Service in $State.services){$Health=Invoke-RestMethod -Uri "http://127.0.0.1:$($Service.healthPort)/actuator/health" -TimeoutSec 15;if($Health.status -ne 'UP'){throw 'Owned service unhealthy'}}
"C2_MOBILE_SUMMARY: component_checks=20; focus_scenarios=18; actual_checks=$($Result.checks.Count); recorded_requests=$($Result.requests.Count); saved_and_approved_rows=4; healthy_services=6; whole_c2_acceptance=false; complete_35_prd=false; production_modified=false"
