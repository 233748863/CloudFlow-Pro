param([ValidatePattern('^r[1-9][0-9]*$')][string]$DictionaryRound='r17',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$ValueRound='r18',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$BackendRound='r71',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$FrontendRound='r27',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$AdjacentRound='r59',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$ResponseRound='r4',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$RegressionRound='r8')
$ErrorActionPreference='Stop'
. 'D:\CloudFlowPro\.cloudflow-runtime\use-data-drive.ps1'
$Root='D:\CloudFlowPro'
$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
$Live=Join-Path $Evidence "c1-form-live-20261005-$DictionaryRound"
$Result=Get-Content -LiteralPath (Join-Path $Live 'result.json') -Raw|ConvertFrom-Json
if(-not $Result.passed -or -not $Result.isolated -or -not $Result.dictionaryPagesExecuted -or $Result.scope -ne 'FULL_C' -or @($Result.checks|Where-Object{-not $_.passed}).Count){throw 'Dictionary maintenance real pages did not complete'}
$Pages=Get-Content -LiteralPath (Join-Path $Evidence "c1-dictionary-pages-$($Result.runId)/result.json") -Raw|ConvertFrom-Json
if(-not $Pages.passed -or -not $Pages.realPages -or -not $Pages.realAdminMaintenance -or $Pages.pageErrors.Count -or $Pages.fabricatedResponses -ne 0 -or $Pages.injectedValues -ne 0 -or $Pages.cases.Count -ne 2){throw 'Dictionary page evidence is incomplete'}
foreach($Device in @('desktop','mobile')){
    $Cases=@($Pages.cases|Where-Object device -EQ $Device)
    if($Cases.Count -ne 1 -or -not $Cases[0].mountedDraftUpdated -or -not $Cases[0].mountedTaskUpdated -or -not $Cases[0].restored -or -not $Cases[0].approved -or -not $Cases[0].definitionUnchanged){throw 'A dictionary device did not complete'}
    foreach($Name in @('mounted_form_dictionary_refresh_preserves_note','dictionary_draft_restores_values_and_note','updated_dictionary_values_start','dictionary_page_approval_succeeds','dictionary_changes_keep_values_and_definition')){
        if(@($Result.checks|Where-Object{$_.label -eq "${Device}_$Name" -and $_.passed}).Count -ne 1){throw 'Dictionary behavior is missing'}
    }
    foreach($Field in @('single','multi')){
        $Observations=@($Pages.observations|Where-Object{$_.device -eq $Device -and $_.field -eq $Field})
        if($Observations.Count -ne 3){throw 'Dictionary initial, draft and task observations are required'}
        foreach($Observation in $Observations){
            foreach($Expected in $Observation.expected){if($Expected -notin $Observation.observed){throw 'Updated dictionary option missing'}}
            foreach($Absent in $Observation.absent){if($Absent -in $Observation.observed){throw 'Stale dictionary option remains'}}
        }
    }
}
foreach($Name in @('current_service_logs_hide_credentials_and_private_form_values','all_approval_requests_retain_access_and_error_audits','current_approval_audits_hide_private_form_values','both_devices_complete_dictionary_maintenance_chain')){
    if(@($Result.checks|Where-Object{$_.label -eq $Name -and $_.passed}).Count -ne 1){throw 'Dictionary audit or completion evidence missing'}
}
$Inputs=@(Get-Content -LiteralPath (Join-Path $Live 'inputs.json') -Raw|ConvertFrom-Json)
if(-not $Inputs.Count){throw 'Dictionary input snapshot required'}
foreach($Input in $Inputs){if((Get-FileHash -LiteralPath (Join-Path $Root $Input.Path)).Hash -ne $Input.Hash){throw 'Dictionary input changed'}}
& (Join-Path $PSScriptRoot 'summarize-c1-value-pages.ps1') -LiveRound $ValueRound -BackendRound $BackendRound -FrontendRound $FrontendRound -AdjacentRound $AdjacentRound -ResponseRound $ResponseRound -RegressionRound $RegressionRound
"C1_DICTIONARY_SUMMARY: devices=2; observations=$($Pages.observations.Count); checks=$($Result.checks.Count); recorded_requests=$($Result.requests.Count); inputs=$($Inputs.Count); changed=0; admin_maintenance_api=true; dictionary_admin_ui_verified=false; complete_35_prd=false; production_modified=false"
