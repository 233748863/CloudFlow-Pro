param([ValidatePattern('^r[1-9][0-9]*$')][string]$LiveRound='r27',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$BackendRound='r73',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$FrontendRound='r37',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$AdjacentRound='r64')
$ErrorActionPreference='Stop'
. 'D:\CloudFlowPro\.cloudflow-runtime/use-data-drive.ps1'
$Root='D:\CloudFlowPro'
$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
function Read-Json([string]$File){Get-Content -LiteralPath (Join-Path $Evidence $File) -Raw|ConvertFrom-Json}
function Assert-Inputs([string]$File){
    $Inputs=@(Read-Json $File)
    if(-not $Inputs.Count){throw 'Historical reference input snapshot required'}
    foreach($Input in $Inputs){if((Get-FileHash -LiteralPath (Join-Path $Root $Input.Path)).Hash -ne $Input.Hash){throw "Historical reference input changed: $($Input.Path)"}}
    "C1_HISTORICAL_INPUTS: files=$($Inputs.Count); changed=0; snapshot=$File"
}
$Live="c1-form-live-20261005-$LiveRound"
$Result=Read-Json "$Live/result.json"
if(-not $Result.passed -or -not $Result.isolated -or -not $Result.historicalReferencesExecuted -or $Result.scope -ne 'FULL_C' -or @($Result.checks|Where-Object{-not $_.passed}).Count){throw 'Historical reference live scope incomplete'}
$Pages=Read-Json "c1-historical-references-$($Result.runId)/result.json"
if(-not $Pages.passed -or -not $Pages.retired -or -not $Pages.realPages -or $Pages.fixtureRecords -ne 8 -or $Pages.cases.Count -ne 2 -or $Pages.pageErrors.Count -or $Pages.fabricatedResponses -ne 0 -or $Pages.forcedWorkflowOutcomeWrites -ne 0){throw 'Historical reference pages incomplete'}
foreach($Device in @('desktop','mobile')){
    $Cases=@($Pages.cases|Where-Object device -EQ $Device)
    if($Cases.Count -ne 1 -or $Cases[0].referenceTypes -ne 4 -or $Cases[0].namedAndRawFields -ne 8 -or -not $Cases[0].restored -or -not $Cases[0].replaced -or -not $Cases[0].readonlyApproved -or -not $Cases[0].editableApproved -or -not $Cases[0].historyPreserved){throw 'Historical reference device transitions missing'}
    foreach($Field in @('employee','dept','post','position','employee_raw','dept_raw','post_raw','position_raw')){
        foreach($Suffix in @('restored_history_visible','historical_option_cannot_be_reselected','readonly_history_preserved','editable_history_preserved')){
            if(@($Result.checks|Where-Object{$_.label -eq "${Device}_${Field}_$Suffix" -and $_.passed}).Count -ne 1){throw 'Historical reference field evidence missing'}
        }
    }
}
foreach($Name in @('four_owned_reference_types_retired_after_real_save','historical_reference_pages_have_no_browser_errors','historical_reference_fixtures_retired_and_grants_unchanged','current_service_logs_hide_credentials_and_private_form_values','all_approval_requests_retain_access_and_error_audits','current_approval_audits_hide_private_form_values')){
    if(@($Result.checks|Where-Object{$_.label -eq $Name -and $_.passed}).Count -ne 1){throw 'Historical reference restoration or audit missing'}
}
foreach($File in @("$Live/inputs.json","h3-portal-finance-20261002-backend-$BackendRound-inputs.json","h3-portal-finance-20261002-frontend-$FrontendRound-inputs.json","h3-portal-finance-adjacent-20261002-$AdjacentRound/inputs.json")){Assert-Inputs $File}
$Adjacent=Get-Content -LiteralPath (Join-Path $Evidence "h3-portal-finance-adjacent-20261002-$AdjacentRound/summary.log") -Raw
$Database=Get-Content -LiteralPath (Join-Path $Evidence "h3-portal-finance-adjacent-20261002-$AdjacentRound/oa-database.log") -Raw
if($Adjacent -notmatch 'changed=0; exit=0; production_modified=false' -or $Database -notmatch 'expected=374; actual=374' -or $Database -notmatch 'PASS: 1012 OA boundary assertions'){throw 'Historical reference adjacent evidence incomplete'}
$Launch=Get-Content -LiteralPath (Join-Path $Evidence "c1-historical-references-live-$LiveRound-launch.log") -Raw
if($Launch -notmatch 'OWNED_CAPTCHA_RESTORED: original_limit=100; original_ttl=-1;' -or $Launch -notmatch 'counter_writes=0; database_unchanged=true; production_modified=false'){throw 'Historical reference captcha restoration missing'}
$State=Get-Content -LiteralPath (Join-Path $Root '.cloudflow-runtime/batch-g-integration/9799534e1a3a47b5958330f14ae16dc7/state.json') -Raw|ConvertFrom-Json
if($State.status -ne 'RUNNING' -or $State.processes.Count -ne 9 -or $State.services.Count -ne 6){throw 'Owned services incomplete'}
foreach($Entry in $State.processes){$Observed=Get-CimInstance Win32_Process -Filter "ProcessId=$($Entry.id)";if(-not $Observed -or -not $Observed.CommandLine.Contains($Entry.marker)){throw 'Owned process identity changed'}}
foreach($Service in $State.services){$Health=Invoke-RestMethod -Uri "http://127.0.0.1:$($Service.healthPort)/actuator/health" -TimeoutSec 15;if($Health.status -ne 'UP'){throw 'Owned service unhealthy'}}
"C1_HISTORICAL_SUMMARY: devices=2; reference_types=4; actual_checks=$($Result.checks.Count); recorded_requests=$($Result.requests.Count); healthy_services=6; whole_c1_acceptance=false; complete_35_prd=false; production_modified=false"
