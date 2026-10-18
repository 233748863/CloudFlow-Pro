param([ValidatePattern('^r[1-9][0-9]*$')][string]$LiveRound='r52',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$BackendRound='r75',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$FrontendRound='r47',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$RegressionRound='r22',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$AdjacentRound='r71')
$ErrorActionPreference='Stop'
. 'D:\CloudFlowPro\.cloudflow-runtime/use-data-drive.ps1'
$Root='D:\CloudFlowPro'
$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
function Read-Json([string]$File){Get-Content -LiteralPath (Join-Path $Evidence $File) -Raw|ConvertFrom-Json}
function Assert-Inputs([string]$File){
    $Inputs=@(Read-Json $File)
    if(-not $Inputs.Count){throw 'Designer input snapshot required'}
    foreach($Input in $Inputs){if((Get-FileHash -LiteralPath (Join-Path $Root $Input.Path)).Hash -ne $Input.Hash){throw "Designer input changed: $($Input.Path)"}}
    "C2_DESIGNER_INPUTS: files=$($Inputs.Count); changed=0; snapshot=$File"
}
function Require-Check([string]$Label){if(@($Result.checks|Where-Object{$_.label -eq $Label -and $_.passed}).Count -ne 1){throw "Designer check missing: $Label"}}
$Live="c1-form-live-20261005-$LiveRound"
$Result=Read-Json "$Live/result.json"
if(-not $Result.passed -or -not $Result.isolated -or -not $Result.subtableDesignerExecuted -or $Result.scope -ne 'FULL_C' -or @($Result.checks|Where-Object{-not $_.passed}).Count){throw 'Subtable designer live scope incomplete'}
$Pages=Read-Json "c2-designer-pages-$($Result.runId)/result.json"
if(-not $Pages.passed -or -not $Pages.realPages -or $Pages.allowedTypes -ne 10 -or $Pages.excludedTypes -ne 20 -or $Pages.devices.Count -ne 1 -or $Pages.devices[0] -ne 'desktop' -or
    -not $Pages.mobileLayoutPreviewOnly -or $Pages.cases.Count -ne 8 -or $Pages.pageErrors.Count -or $Pages.fabricatedResponses -ne 0 -or $Pages.forcedModelWrites -ne 0 -or $Pages.savedVersion -ne 2){throw 'Subtable designer actual evidence incomplete'}
foreach($Type in @('TEXT','NUMBER','AMOUNT','DATE','SELECT','DICT_SELECT','SWITCH','EMPLOYEE','DEPT','UPLOAD_FILE')){Require-Check "c2_designer_allows_$Type"}
foreach($Label in @('多行文本','Markdown文本','日期时间','时间','日期范围','多选下拉','单选组','复选组','岗位选择','职位选择','用户多选','部门多选','图片上传','说明文字','分隔线','分组','网格','标签页','折叠面板','明细子表')){Require-Check "c2_designer_excludes_$Label"}
foreach($Label in @('pointer_adds_empty_subtable','empty_columns_block_before_request','file_column_locks_single_attachment','all_ten_columns_created_in_table','column_properties_preserved','copy_and_delete_column_preserve_unique_ids',
    'pointer_reorders_columns_without_value_changes','above_hard_row_limit_blocks_before_request','summaries_only_offer_numeric_columns','table_settings_preserved','save_preserves_all_settings_and_original_version','reload_matches_saved_definition',
    'preview_uses_minimum_and_readonly_default','preview_never_writes_form_or_changes_definition','invalid_definitions_preserve_existing_versions','no_browser_errors')){Require-Check "c2_designer_$Label"}
foreach($Property in @('allowAdd','allowDelete','allowSort','allowCopyRow')){Require-Check "c2_designer_disables_$Property"}
foreach($Layout in @('桌面布局','手机布局')){foreach($Value in @('0.60','2','0.15')){Require-Check "c2_designer_${Layout}_${Value}_summary"}}
foreach($Scenario in @('empty_columns','duplicate_columns','excluded_column','nested_subtable','text_summary','invalid_aggregation','too_many_rows','multiple_files')){
    if(@($Pages.cases|Where-Object{$_.scenario -eq $Scenario -and $_.status -eq 400 -and $_.passed}).Count -ne 1){throw 'Each invalid definition must be rejected'}
    Require-Check "c2_designer_server_rejects_$Scenario"
}
foreach($Label in @('employee_menu_grants_unchanged','current_service_logs_hide_credentials_and_private_form_values','all_approval_requests_retain_access_and_error_audits','current_approval_audits_hide_private_form_values','form_definition_requests_retain_safe_audits')){Require-Check $Label}
$Posts=@($Result.requests|Where-Object{$_.method -eq 'POST'})
if(@($Posts|Where-Object{-not $_.traceId}).Count -or @($Posts.traceId|Sort-Object -Unique).Count -ne $Posts.Count){throw 'Recorded POST requests must have unique traces'}
foreach($File in @("$Live/inputs.json","h3-portal-finance-20261002-backend-$BackendRound-inputs.json","h3-portal-finance-20261002-frontend-$FrontendRound-inputs.json","c1-form-regression-20261005-$RegressionRound/inputs.json","h3-portal-finance-adjacent-20261002-$AdjacentRound/inputs.json")){Assert-Inputs $File}
$Rules=Get-Content -LiteralPath (Join-Path $Evidence "c1-form-regression-20261005-$RegressionRound/capabilities.log") -Raw
$Browser=Get-Content -LiteralPath (Join-Path $Evidence "c1-form-regression-20261005-$RegressionRound/browser.log") -Raw
if($Rules -notmatch 'form foundation checks passed: 188;' -or $Browser -notmatch 'PASS form browser checks=52;'){throw 'Unchanged-product form regression evidence incomplete'}
$Adjacent=Get-Content -LiteralPath (Join-Path $Evidence "h3-portal-finance-adjacent-20261002-$AdjacentRound/summary.log") -Raw
$Database=Get-Content -LiteralPath (Join-Path $Evidence "h3-portal-finance-adjacent-20261002-$AdjacentRound/oa-database.log") -Raw
if($Adjacent -notmatch 'changed=0; exit=0; production_modified=false' -or $Database -notmatch 'expected=374; actual=374' -or $Database -notmatch 'PASS: 1012 OA boundary assertions'){throw 'Designer adjacent checks incomplete'}
$Launch=Get-Content -LiteralPath (Join-Path $Evidence "c2-designer-live-$LiveRound-launch.log") -Raw
if($Launch -notmatch 'OWNED_CAPTCHA_RESTORED: original_limit=100; original_ttl=-1;' -or $Launch -notmatch 'counter_writes=0; database_unchanged=true; production_modified=false'){throw 'Designer captcha restoration evidence missing'}
$State=Get-Content -LiteralPath (Join-Path $Root '.cloudflow-runtime/batch-g-integration/9799534e1a3a47b5958330f14ae16dc7/state.json') -Raw|ConvertFrom-Json
if($State.status -ne 'RUNNING' -or $State.processes.Count -ne 9 -or $State.services.Count -ne 6){throw 'Owned services incomplete'}
foreach($Entry in $State.processes){$Observed=Get-CimInstance Win32_Process -Filter "ProcessId=$($Entry.id)";if(-not $Observed -or -not $Observed.CommandLine.Contains($Entry.marker)){throw 'Owned process identity changed'}}
foreach($Service in $State.services){$Health=Invoke-RestMethod -Uri "http://127.0.0.1:$($Service.healthPort)/actuator/health" -TimeoutSec 15;if($Health.status -ne 'UP'){throw 'Owned service unhealthy'}}
"C2_DESIGNER_SUMMARY: real_desktop=true; mobile_layout_preview_only=true; allowed_types=10; excluded_types=20; rejected_definitions=8; actual_checks=$($Result.checks.Count); recorded_requests=$($Result.requests.Count); healthy_services=6; whole_c2_acceptance=false; complete_35_prd=false; production_modified=false"
