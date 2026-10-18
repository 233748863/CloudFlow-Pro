param([ValidatePattern('^r[1-9][0-9]*$')][string]$LiveRound='r47',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$BackendRound='r75',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$FrontendRound='r47',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$RegressionRound='r22',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$AdjacentRound='r70')
$ErrorActionPreference='Stop'
. 'D:\CloudFlowPro\.cloudflow-runtime/use-data-drive.ps1'
$Root='D:\CloudFlowPro'
$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
function Read-Json([string]$File){Get-Content -LiteralPath (Join-Path $Evidence $File) -Raw|ConvertFrom-Json}
function Assert-Inputs([string]$File){
    $Inputs=@(Read-Json $File)
    if(-not $Inputs.Count){throw 'Typed subtable input snapshot required'}
    foreach($Input in $Inputs){if((Get-FileHash -LiteralPath (Join-Path $Root $Input.Path)).Hash -ne $Input.Hash){throw "Typed subtable input changed: $($Input.Path)"}}
    "C2_TYPES_INPUTS: files=$($Inputs.Count); changed=0; snapshot=$File"
}
function Require-Check([string]$Label){
    if(@($Result.checks|Where-Object{$_.label -eq $Label -and $_.passed}).Count -ne 1){throw "Typed subtable check missing: $Label"}
}
$Live="c1-form-live-20261005-$LiveRound"
$Result=Read-Json "$Live/result.json"
if(-not $Result.passed -or -not $Result.isolated -or -not $Result.subtableTypesExecuted -or $Result.scope -ne 'FULL_C' -or @($Result.checks|Where-Object{-not $_.passed}).Count){throw 'Typed subtable live scope incomplete'}
$PageDirectory="c2-type-pages-$($Result.runId)"
$Pages=Read-Json "$PageDirectory/result.json"
if(-not $Pages.passed -or -not $Pages.realPages -or $Pages.pageErrors.Count -or $Pages.fabricatedResponses -ne 0 -or $Pages.forcedModelWrites -ne 0){throw 'Typed subtable real pages incomplete'}
if($Pages.uploads.Count -ne 6 -or @($Pages.uploads|Where-Object{-not $_.passed -or $_.status -ne 200}).Count){throw 'Six real row uploads required'}
foreach($Device in @('desktop','mobile')){
    if(@($Pages.cases|Where-Object{$_.device -eq $Device -and $_.phase -eq 'complete' -and $_.rows -eq 3 -and $_.types -eq 10 -and $_.passed}).Count -ne 1){throw 'Each device must complete ten types and three rows'}
    foreach($Suffix in @('submit_waits_for_both_uploads','first_upload_does_not_release_second','ten_types_persist_values','real_sort_preserves_every_column_and_id','ten_types_start','ten_types_approve','all_values_and_ids_survive_approval','definition_unchanged')){Require-Check "${Device}_c2_$Suffix"}
    foreach($Index in 0..2){
        if(@($Pages.uploads|Where-Object{$_.device -eq $Device -and $_.row -eq $Index}).Count -ne 1){throw 'Unique upload per row required'}
        foreach($Suffix in @('real_upload','full_filename_fits','one_file_limit')){Require-Check "${Device}_c2_row_${Index}_$Suffix"}
        Require-Check "${Device}_c2_approved_file_${Index}_content"
    }
    foreach($Phase in @('restore','approval')){
        foreach($Index in 0..2){foreach($Field in @('text','amount','count_number','avg_number','date','switch','select','employee','dept','dict','file')){Require-Check "${Device}_c2_${Phase}_${Index}_$Field"}}
        if(-not (Test-Path -LiteralPath (Join-Path $Evidence "$PageDirectory/$Device-$Phase.png"))){throw 'Actual page screenshot missing'}
    }
}
$Boundaries=@($Pages.cases|Where-Object{$_.endpoint -in @('draft','start')})
if($Boundaries.Count -ne 10 -or @($Boundaries|Where-Object{-not $_.passed -or $_.status -ne 400}).Count){throw 'Ten rejected boundary requests required'}
foreach($Sample in @('above_maximum','numeric_range','outside_options','unknown_column','missing_required','below_minimum')){
    $Endpoints=if($Sample -in @('missing_required','below_minimum')){@('start')}else{@('draft','start')}
    foreach($Endpoint in $Endpoints){
        Require-Check "c2_${Endpoint}_${Sample}_rejected_with_safe_field_errors"
        Require-Check "c2_${Endpoint}_${Sample}_preserves_draft_and_no_instance"
    }
}
foreach($Label in @('c2_types_no_browser_errors','employee_menu_grants_unchanged','current_service_logs_hide_credentials_and_private_form_values','all_approval_requests_retain_access_and_error_audits','current_approval_audits_hide_private_form_values','form_definition_requests_retain_safe_audits')){Require-Check $Label}
$Posts=@($Result.requests|Where-Object{$_.method -eq 'POST'})
if(@($Posts|Where-Object{-not $_.traceId}).Count -or @($Posts.traceId|Sort-Object -Unique).Count -ne $Posts.Count){throw 'Recorded POST requests must have unique traces'}
foreach($File in @("$Live/inputs.json","h3-portal-finance-20261002-backend-$BackendRound-inputs.json","h3-portal-finance-20261002-frontend-$FrontendRound-inputs.json","c1-form-regression-20261005-$RegressionRound/inputs.json","h3-portal-finance-adjacent-20261002-$AdjacentRound/inputs.json")){Assert-Inputs $File}
$Rules=Get-Content -LiteralPath (Join-Path $Evidence "c1-form-regression-20261005-$RegressionRound/capabilities.log") -Raw
$Browser=Get-Content -LiteralPath (Join-Path $Evidence "c1-form-regression-20261005-$RegressionRound/browser.log") -Raw
if($Rules -notmatch 'form foundation checks passed: 188;' -or $Browser -notmatch 'PASS form browser checks=52;'){throw 'Form behavior regression incomplete'}
$Adjacent=Get-Content -LiteralPath (Join-Path $Evidence "h3-portal-finance-adjacent-20261002-$AdjacentRound/summary.log") -Raw
$Database=Get-Content -LiteralPath (Join-Path $Evidence "h3-portal-finance-adjacent-20261002-$AdjacentRound/oa-database.log") -Raw
if($Adjacent -notmatch 'changed=0; exit=0; production_modified=false' -or $Database -notmatch 'expected=374; actual=374' -or $Database -notmatch 'PASS: 1012 OA boundary assertions'){throw 'Adjacent checks incomplete'}
$Launch=Get-Content -LiteralPath (Join-Path $Evidence "c2-types-live-$LiveRound-launch.log") -Raw
if($Launch -notmatch 'OWNED_CAPTCHA_RESTORED: original_limit=100; original_ttl=-1;' -or $Launch -notmatch 'counter_writes=0; database_unchanged=true; production_modified=false'){throw 'Captcha restoration evidence missing'}
$State=Get-Content -LiteralPath (Join-Path $Root '.cloudflow-runtime/batch-g-integration/9799534e1a3a47b5958330f14ae16dc7/state.json') -Raw|ConvertFrom-Json
if($State.status -ne 'RUNNING' -or $State.processes.Count -ne 9 -or $State.services.Count -ne 6){throw 'Owned services incomplete'}
foreach($Entry in $State.processes){$Observed=Get-CimInstance Win32_Process -Filter "ProcessId=$($Entry.id)";if(-not $Observed -or -not $Observed.CommandLine.Contains($Entry.marker)){throw 'Owned process identity changed'}}
foreach($Service in $State.services){$Health=Invoke-RestMethod -Uri "http://127.0.0.1:$($Service.healthPort)/actuator/health" -TimeoutSec 15;if($Health.status -ne 'UP'){throw 'Owned service unhealthy'}}
"C2_TYPES_SUMMARY: real_devices=2; column_types=10; rows_per_device=3; uploads=6; rejected_boundaries=10; actual_checks=$($Result.checks.Count); recorded_requests=$($Result.requests.Count); healthy_services=6; whole_c2_acceptance=false; complete_35_prd=false; production_modified=false"
