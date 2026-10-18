param([ValidatePattern('^r[1-9][0-9]*$')][string]$LiveRound='r56',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$BackendRound='r76',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$FrontendRound='r49',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$PrecisionRound='r3',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$InputRound='r3',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$ResponseRound='r7',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$RegressionRound='r23',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$AdjacentRound='r72')
$ErrorActionPreference='Stop'
. 'D:\CloudFlowPro\.cloudflow-runtime/use-data-drive.ps1'
$Root='D:\CloudFlowPro'
$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
function Read-Json([string]$File){Get-Content -LiteralPath (Join-Path $Evidence $File) -Raw|ConvertFrom-Json}
function Assert-Inputs([string]$File){
    $Inputs=@(Read-Json $File)
    if(-not $Inputs.Count){throw 'Precision input snapshot required'}
    foreach($Input in $Inputs){if((Get-FileHash -LiteralPath (Join-Path $Root $Input.Path)).Hash -ne $Input.Hash){throw "Precision input changed: $($Input.Path)"}}
    "C2_PRECISION_INPUTS: files=$($Inputs.Count); changed=0; snapshot=$File"
}
function Require-Check([string]$Label){if(@($Result.checks|Where-Object{$_.label -eq $Label -and $_.passed}).Count -ne 1){throw "Precision check missing: $Label"}}
$Live="c1-form-live-20261005-$LiveRound"
$Result=Read-Json "$Live/result.json"
if(-not $Result.passed -or -not $Result.isolated -or -not $Result.subtablePrecisionExecuted -or $Result.scope -ne 'FULL_C' -or @($Result.checks|Where-Object{-not $_.passed}).Count){throw 'Precision real page scope incomplete'}
$Pages=Read-Json "c2-precision-pages-$($Result.runId)/result.json"
if(-not $Pages.passed -or -not $Pages.realPages -or $Pages.cases.Count -ne 2 -or $Pages.pageErrors.Count -or $Pages.fabricatedResponses -ne 0 -or $Pages.forcedModelWrites -ne 0){throw 'Precision page evidence incomplete'}
foreach($Device in @('desktop','mobile')){
    if(@($Pages.cases|Where-Object{$_.device -eq $Device -and $_.passed -and $_.rows -eq 3 -and $_.summaries -eq 4 -and $_.largestIntegerDigits -eq 90}).Count -ne 1){throw 'Exact decimal complete device missing'}
    if(@($Pages.draftResponses|Where-Object{$_.device -eq $Device -and $_.status -eq 200 -and $_.code -eq '200' -and $_.definitionMatches -and $_.contextHashValid -and $_.rowsMatch}).Count -ne 1){throw 'Exact decimal saved draft confirmation missing'}
    foreach($Name in @('form_saved','process_saved','process_deployed','draft_keeps_all_digits_and_row_ids','start','approve','approval_preserves_exact_values_and_ids','definition_unchanged')){Require-Check "${Device}_c2_precision_$Name"}
    foreach($Phase in @('filled','restore','approval')){foreach($Label in @('完整金额 · 合计','抵消金额 · 合计','平均金额 · 平均','计数样本 · 计数')){Require-Check "${Device}_c2_precision_${Phase}_$Label";Require-Check "${Device}_c2_precision_${Phase}_${Label}_fits"}}
    foreach($Phase in @('restore','approval')){foreach($Row in @(0,1,2)){foreach($Field in @('text','gross','net','average','counted')){Require-Check "${Device}_c2_precision_${Phase}_${Row}_$Field"}}}
}
foreach($Label in @('c2_precision_no_browser_errors','employee_menu_grants_unchanged','current_service_logs_hide_credentials_and_private_form_values','all_approval_requests_retain_access_and_error_audits','current_approval_audits_hide_private_form_values','form_definition_requests_retain_safe_audits')){Require-Check $Label}
$Posts=@($Result.requests|Where-Object{$_.method -eq 'POST'})
if(@($Posts|Where-Object{-not $_.traceId}).Count -or @($Posts.traceId|Sort-Object -Unique).Count -ne $Posts.Count){throw 'Recorded POST requests must have unique traces'}
$Precision=Read-Json "c2-summary-precision-20261005-$PrecisionRound/result.json"
if(-not $Precision.passed -or $Precision.mode -ne 'verify' -or -not $Precision.independentIntegerOracle -or $Precision.checks.Count -ne 12 -or @($Precision.checks|Where-Object{-not $_.passed -or -not $_.acceptedInputs}).Count -or $Precision.businessRequests -ne 0){throw 'Independent exact decimal rules incomplete'}
foreach($File in @("$Live/inputs.json","h3-portal-finance-20261002-backend-$BackendRound-inputs.json","h3-portal-finance-20261002-frontend-$FrontendRound-inputs.json","c2-summary-precision-20261005-$PrecisionRound/inputs.json","c2-precision-input-20261005-$InputRound/inputs.json","c1-form-response-20261005-$ResponseRound/inputs.json","c1-form-regression-20261005-$RegressionRound/inputs.json","h3-portal-finance-adjacent-20261002-$AdjacentRound/inputs.json")){Assert-Inputs $File}
$InputChecks=Get-Content -LiteralPath (Join-Path $Evidence "c2-precision-input-20261005-$InputRound/checks.log") -Raw
if($InputChecks -notmatch 'C2_PRECISION_INPUT: cases=10; full_digits=true; saved_integer_schema=true; draft_and_start=true; database_writes=0'){throw 'Saved integer schema boundary evidence incomplete'}
$Response=Get-Content -LiteralPath (Join-Path $Evidence "c1-form-response-20261005-$ResponseRound/summary.log") -Raw
if($Response -notmatch 'changed=0; exit=0; runtime_database_writes=0'){throw 'Form response and version regression incomplete'}
$Rules=Get-Content -LiteralPath (Join-Path $Evidence "c1-form-regression-20261005-$RegressionRound/capabilities.log") -Raw
$Browser=Get-Content -LiteralPath (Join-Path $Evidence "c1-form-regression-20261005-$RegressionRound/browser.log") -Raw
if($Rules -notmatch 'form foundation checks passed: 188;' -or $Browser -notmatch 'PASS form browser checks=52;'){throw 'Precision form regression incomplete'}
$Adjacent=Get-Content -LiteralPath (Join-Path $Evidence "h3-portal-finance-adjacent-20261002-$AdjacentRound/summary.log") -Raw
$Database=Get-Content -LiteralPath (Join-Path $Evidence "h3-portal-finance-adjacent-20261002-$AdjacentRound/oa-database.log") -Raw
if($Adjacent -notmatch 'changed=0; exit=0; production_modified=false' -or $Database -notmatch 'expected=374; actual=374' -or $Database -notmatch 'PASS: 1012 OA boundary assertions'){throw 'Precision adjacent checks incomplete'}
$Launch=Get-Content -LiteralPath (Join-Path $Evidence "c2-precision-live-$LiveRound-launch.log") -Raw
if($Launch -notmatch 'OWNED_CAPTCHA_RESTORED: original_limit=100; original_ttl=-1;' -or $Launch -notmatch 'counter_writes=0; database_unchanged=true; production_modified=false'){throw 'Precision captcha restoration missing'}
$State=Get-Content -LiteralPath (Join-Path $Root '.cloudflow-runtime/batch-g-integration/9799534e1a3a47b5958330f14ae16dc7/state.json') -Raw|ConvertFrom-Json
if($State.status -ne 'RUNNING' -or $State.processes.Count -ne 9 -or $State.services.Count -ne 6){throw 'Owned services incomplete'}
foreach($Entry in $State.processes){$Observed=Get-CimInstance Win32_Process -Filter "ProcessId=$($Entry.id)";if(-not $Observed -or -not $Observed.CommandLine.Contains($Entry.marker)){throw 'Owned process identity changed'}}
foreach($Service in $State.services){$Health=Invoke-RestMethod -Uri "http://127.0.0.1:$($Service.healthPort)/actuator/health" -TimeoutSec 15;if($Health.status -ne 'UP'){throw 'Owned service unhealthy'}}
"C2_PRECISION_SUMMARY: real_devices=2; actual_checks=$($Result.checks.Count); recorded_requests=$($Result.requests.Count); exact_decimal_cases=12; healthy_services=6; whole_c2_acceptance=false; complete_35_prd=false; production_modified=false"
