param([ValidatePattern('^r[1-9][0-9]*$')][string]$LiveRound='r15',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$BackendRound='r71',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$FrontendRound='r26',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$AdjacentRound='r58',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$ResponseRound='r4',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$RegressionRound='r7')
$ErrorActionPreference='Stop'
. 'D:\CloudFlowPro\.cloudflow-runtime\use-data-drive.ps1'
$Root='D:\CloudFlowPro'
$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
function Read-Json([string]$File){Get-Content -LiteralPath (Join-Path $Evidence $File) -Raw|ConvertFrom-Json}
function Assert-Inputs([string]$File){
    $Inputs=@(Read-Json $File)
    if(-not $Inputs.Count){throw 'A nonempty input snapshot is required'}
    foreach($Input in $Inputs){if((Get-FileHash -LiteralPath (Join-Path $Root $Input.Path)).Hash -ne $Input.Hash){throw "Page input changed: $($Input.Path)"}}
    "C1_PAGE_INPUTS: files=$($Inputs.Count); changed=0; snapshot=$File"
}
$Live="c1-form-live-20261005-$LiveRound"
$Result=Read-Json "$Live/result.json"
if(-not $Result.passed -or -not $Result.isolated -or -not $Result.valuePagesExecuted -or $Result.scope -ne 'FULL_C' -or @($Result.checks|Where-Object{-not $_.passed}).Count){throw 'Actual value pages did not complete'}
$PageDirectory="c1-value-pages-$($Result.runId)"
$Pages=Read-Json "$PageDirectory/result.json"
$Types=@('TEXT','TEXTAREA','RICH_TEXT','NUMBER','AMOUNT','DATE','DATETIME','TIME','DATE_RANGE','SELECT','MULTI_SELECT','RADIO_GROUP','CHECKBOX_GROUP','SWITCH','DICT_SELECT','EMPLOYEE','DEPT','POST','POSITION','USER_MULTI','DEPT_MULTI','UPLOAD_FILE','UPLOAD_IMAGE','SUB_TABLE')
if(-not $Pages.passed -or -not $Pages.realPages -or $Pages.fabricatedResponses -ne 0 -or $Pages.injectedValues -ne 0 -or $Pages.pageErrors.Count -or $Pages.cases.Count -ne 2){throw 'Real page evidence is incomplete'}
foreach($Device in @('desktop','mobile')){
    $Cases=@($Pages.cases|Where-Object device -EQ $Device)
    if($Cases.Count -ne 1 -or -not $Cases[0].saved -or -not $Cases[0].restored -or -not $Cases[0].started -or -not $Cases[0].approved -or -not $Cases[0].richTextSafe -or @((Compare-Object ($Types|Sort-Object) ($Cases[0].types|Sort-Object))).Count){throw 'A device did not complete every field'}
    foreach($Phase in @('input','restored','approval')){if((Get-Item -LiteralPath (Join-Path $Evidence "$PageDirectory/$Device-$Phase-rich.png")).Length -le 0){throw 'Rich text page evidence is missing'}}
    foreach($Name in @('all_24_page_values_saved','all_24_values_started_from_page','all_24_values_retained_after_page_approval','page_approval_has_unique_history','starter_cannot_read_reviewers_reference_options','other_tenant_cannot_read_task_reference_options','undeclared_task_reference_rejected')){
        if(@($Result.checks|Where-Object{$_.label -eq "${Device}_$Name" -and $_.passed}).Count -ne 1){throw "Required page behavior missing: ${Device}_$Name"}
    }
    foreach($Type in @('employee','dept','post','position','user_multi','dept_multi','dict_select')){
        if(@($Result.checks|Where-Object{$_.label -eq "${Device}_${Type}_task_scoped_reference_allowed" -and $_.passed}).Count -ne 1){throw 'An authorized reference type was not verified'}
    }
}
if($Pages.uploads.Count -ne 4 -or @($Pages.uploads|Where-Object{$_.status -ne 200 -or $_.code -ne 200 -or -not $_.multipartWithBoundary -or -not $_.hasFileId}).Count){throw 'Four native multipart uploads are required'}
foreach($Name in @('all_value_pages_have_no_browser_exceptions','both_devices_complete_all_24_actual_value_pages','current_service_logs_hide_credentials_and_private_form_values','all_approval_requests_retain_access_and_error_audits','current_approval_audits_hide_private_form_values')){
    if(@($Result.checks|Where-Object{$_.label -eq $Name -and $_.passed}).Count -ne 1){throw "Required page audit behavior missing: $Name"}
}
foreach($File in @("$Live/inputs.json","h3-portal-finance-20261002-backend-$BackendRound-inputs.json","h3-portal-finance-20261002-frontend-$FrontendRound-inputs.json","c1-form-response-20261005-$ResponseRound/inputs.json","c1-form-regression-20261005-$RegressionRound/inputs.json","h3-portal-finance-adjacent-20261002-$AdjacentRound/inputs.json")){Assert-Inputs $File}
$FormChecks=Get-Content -LiteralPath (Join-Path $Evidence "c1-form-response-20261005-$ResponseRound/form.log") -Raw
$Privacy=Get-Content -LiteralPath (Join-Path $Evidence "c1-form-response-20261005-$ResponseRound/privacy.log") -Raw
if($FormChecks -notmatch 'form input service checks passed: 229;' -or $FormChecks -notmatch 'form response integration checks passed: 286;' -or $FormChecks -notmatch 'TASK_REFERENCE_SCOPE: checks=92;' -or $Privacy -notmatch 'SensitiveLogPipelineChecks: 1294 checks passed' -or $Privacy -notmatch 'SensitiveLogPolicyChecks: 871 checks passed'){throw 'Current service or privacy regression is missing'}
$Rules=Get-Content -LiteralPath (Join-Path $Evidence "c1-form-regression-20261005-$RegressionRound/capabilities.log") -Raw
$Browser=Get-Content -LiteralPath (Join-Path $Evidence "c1-form-regression-20261005-$RegressionRound/browser.log") -Raw
if($Rules -notmatch 'form foundation checks passed: 185;' -or $Browser -notmatch 'PASS form browser checks=52;'){throw 'Current frontend regression is missing'}
$Adjacent=Get-Content -LiteralPath (Join-Path $Evidence "h3-portal-finance-adjacent-20261002-$AdjacentRound/summary.log") -Raw
$Database=Get-Content -LiteralPath (Join-Path $Evidence "h3-portal-finance-adjacent-20261002-$AdjacentRound/oa-database.log") -Raw
if($Adjacent -notmatch 'changed=0; exit=0; production_modified=false' -or $Database -notmatch 'expected=374; actual=374' -or $Database -notmatch 'PASS: 1012 OA boundary assertions'){throw 'Current adjacent evidence is incomplete'}
$State=Get-Content -LiteralPath (Join-Path $Root '.cloudflow-runtime/batch-g-integration/9799534e1a3a47b5958330f14ae16dc7/state.json') -Raw|ConvertFrom-Json
if($State.status -ne 'RUNNING' -or $State.processes.Count -ne 9 -or $State.services.Count -ne 6){throw 'Owned services are incomplete'}
foreach($Entry in $State.processes){$Observed=Get-CimInstance Win32_Process -Filter "ProcessId=$($Entry.id)";if(-not $Observed -or -not $Observed.CommandLine.Contains($Entry.marker)){throw 'Owned process identity changed'}}
foreach($Service in $State.services){$Health=Invoke-RestMethod -Uri "http://127.0.0.1:$($Service.healthPort)/actuator/health" -TimeoutSec 15;if($Health.status -ne 'UP'){throw 'Owned service is unhealthy'}}
"C1_VALUE_PAGE_SUMMARY: devices=2; types_per_device=24; native_uploads=4; actual_checks=$($Result.checks.Count); recorded_requests=$($Result.requests.Count); owned_processes=9; healthy_services=6; whole_c1_acceptance=false; complete_35_prd=false; production_modified=false"
