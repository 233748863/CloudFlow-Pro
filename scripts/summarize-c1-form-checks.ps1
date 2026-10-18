param([ValidatePattern('^r[1-9][0-9]*$')][string]$FrontendRound,
    [ValidatePattern('^r[1-9][0-9]*$')][string]$BackendRound='r67',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$ComponentRound,
    [ValidatePattern('^r[1-9][0-9]*$')][string]$RegressionRound,
    [ValidatePattern('^r[1-9][0-9]*$')][string]$AdjacentRound,
    [ValidatePattern('^r[1-9][0-9]*$')][string]$LocationRound,
    [ValidatePattern('^r[1-9][0-9]*$')][string]$ResponseRound,
    [ValidatePattern('^r[1-9][0-9]*$')][string]$LiveRound)
$ErrorActionPreference='Stop'
. 'D:\CloudFlowPro\.cloudflow-runtime\use-data-drive.ps1'
$Root='D:\CloudFlowPro'
$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
function Require-Markers([string]$File,[string[]]$Markers){
    $Content=Get-Content -LiteralPath (Join-Path $Evidence $File) -Raw
    foreach($Marker in $Markers){if($Content -notmatch $Marker){throw "C1 evidence missing: $File"}}
    "C1_EVIDENCE: file=$File; markers=true"
}
function Assert-Inputs([string]$File){
    $Inputs=@(Get-Content -LiteralPath (Join-Path $Evidence $File) -Raw|ConvertFrom-Json)
    if(-not $Inputs.Count){throw 'Nonempty snapshot required'}
    foreach($Item in $Inputs){$Path=if([IO.Path]::IsPathRooted($Item.Path)){$Item.Path}else{Join-Path $Root $Item.Path};if((Get-FileHash -LiteralPath $Path).Hash -ne $Item.Hash){throw "C1 input differs: $File"}}
    "C1_INPUTS: file=$File; files=$($Inputs.Count); changed=0"
}
Require-Markers "h3-portal-finance-20261002-backend-$BackendRound.log" @('BUILD SUCCESS','\[static-rules\] no findings','FINANCE_BUILD: phase=Backend; files=[1-9][0-9]*; changed=0; exit=0')
$FrontendInputCount=@(Get-Content -LiteralPath (Join-Path $Evidence "h3-portal-finance-20261002-frontend-$FrontendRound-inputs.json") -Raw|ConvertFrom-Json).Count
Require-Markers "h3-portal-finance-20261002-frontend-$FrontendRound.log" @('> tsc --noEmit','built in ',"FINANCE_BUILD: phase=Frontend; files=$FrontendInputCount; changed=0; exit=0")
Assert-Inputs "h3-portal-finance-20261002-backend-$BackendRound-inputs.json"
Assert-Inputs "h3-portal-finance-20261002-frontend-$FrontendRound-inputs.json"
$Component="c1-form-accessibility-20261005-$ComponentRound"
$Result=Get-Content -LiteralPath (Join-Path $Evidence "$Component/result.json") -Raw|ConvertFrom-Json
if(-not $Result.passed -or $Result.mode -ne 'verify' -or -not $Result.componentOnly -or $Result.wholeC1Acceptance -or $Result.frontendBuild -ne $FrontendRound -or $Result.pageErrors.Count -or $Result.blockedRequests.Count -or $Result.results.Count -ne 2){throw 'C1 component result incomplete'}
if(($Result.results.device|Sort-Object) -join ',' -ne 'desktop,mobile'){throw 'Both devices required'}
foreach($Device in $Result.results){
    if($Device.fields -ne 32 -or $Device.unlinkedFields -ne 0 -or $Device.checks.Count -ne 10){throw 'Missing field association or interaction checks'}
    if(@($Device.observations|Where-Object{-not $_.labelLinked -or -not $_.errorVisible -or -not $_.controls.Count}).Count){throw 'Missing control or label'}
    foreach($Field in $Device.observations){if(@($Field.controls|Where-Object{-not $_.errorLinked -or $_.invalid -ne 'true'}).Count){throw 'Missing error description'}}
}
Assert-Inputs "$Component/inputs.json"
$Regression="c1-form-regression-20261005-$RegressionRound"
Require-Markers "$Regression/capabilities.log" @('Batch C form foundation checks passed: 185;')
Require-Markers "$Regression/browser.log" @('PASS form browser checks=[1-9][0-9]*; production fixture; runtime database writes=0; backend restarts=0')
Require-Markers "$Regression/summary.log" @("C1_FORM_REGRESSION: inputs=$($FrontendInputCount+1); changed=0; exit=0; business_database_writes=0")
Assert-Inputs "$Regression/inputs.json"
if($LocationRound){
    $Location="c1-error-location-20261005-$LocationRound"
    $LocationResult=Get-Content -LiteralPath (Join-Path $Evidence "$Location/result.json") -Raw|ConvertFrom-Json
    if(-not $LocationResult.passed -or $LocationResult.mode -ne 'verify' -or -not $LocationResult.componentOnly -or $LocationResult.wholeC1Acceptance -or $LocationResult.frontendBuild -ne $FrontendRound -or $LocationResult.pageErrors.Count -or $LocationResult.businessRequests.Count -or $LocationResult.results.Count -ne 18){throw 'C1 error location result incomplete'}
    foreach($Device in @('desktop','mobile')){
        $Cases=@($LocationResult.results|Where-Object{$_.device -eq $Device})
        if(($Cases.scenario|Sort-Object) -join ',' -ne 'collapse,correction,external,hidden,order,priority,tabs,virtual,virtual-edit'){throw 'All nine error location scenarios required'}
        foreach($Case in $Cases){
            if(-not $Case.rendered -or -not $Case.inView -or -not $Case.focused){throw 'Error target not focused in viewport'}
            if($Case.scenario -eq 'correction' -and (-not $Case.staysWhileEditing -or -not $Case.next.inView -or -not $Case.next.focused)){throw 'Error revalidation did not move to next invalid field'}
            if($Case.scenario -in @('external','virtual') -and (-not $Case.repeated.inView -or -not $Case.repeated.focused)){throw 'Repeated server error was not located'}
            if($Case.scenario -in @('tabs','virtual','virtual-edit') -and -not $Case.canSwitchTab){throw 'Error handling prevented manual tab switching'}
            if($Case.scenario -in @('virtual','virtual-edit')){
                if($Case.rowOperations.Count -ne 4 -or @($Case.rowOperations|Where-Object{-not $_.stayed}).Count -or -not $Case.tabReturnStartsAtFirstRow){throw 'Completed error location repeated during row editing or tab return'}
            }
            if($Case.scenario -eq 'virtual-edit' -and (-not $Case.correctedErrorCleared -or -not $Case.afterRowOperations.inView -or -not $Case.afterRowOperations.focused)){throw 'Corrected row or new validation failed'}
        }
    }
    Assert-Inputs "$Location/inputs.json"
    'C1_ERROR_LOCATION_SUMMARY: devices=2; scenarios_per_device=9; focused_in_view=18; row_operations=16; component_only=true'
}
if($ResponseRound){
    $Responses="c1-form-response-20261005-$ResponseRound"
    Require-Markers "$Responses/form.log" @('Batch C form input service checks passed: 179;','PASS C current-source form checks; runtime database writes=0; service restarts=0')
    Require-Markers "$Responses/privacy.log" @('SensitiveLogPipelineChecks: 1294 checks passed','SensitiveLogPolicyChecks: 871 checks passed')
    Require-Markers "$Responses/summary.log" @('changed=0; exit=0; runtime_database_writes=0')
    Assert-Inputs "$Responses/inputs.json"
}
if($LiveRound){
    $Live="c1-form-live-20261005-$LiveRound"
    $LiveResult=Get-Content -LiteralPath (Join-Path $Evidence "$Live/result.json") -Raw|ConvertFrom-Json
    if(-not $LiveResult.passed -or -not $LiveResult.isolated -or -not $LiveResult.errorPagesExecuted -or $LiveResult.scope -ne 'FULL_C' -or @($LiveResult.checks|Where-Object{-not $_.passed}).Count){throw 'Live field error chain incomplete'}
    foreach($Name in @('production_draft_client_retains_field_error','production_start_client_retains_field_error','production_approval_client_retains_field_error','all_real_error_pages_and_corrections_completed','current_service_logs_hide_credentials_and_private_form_values','all_approval_requests_retain_access_and_error_audits','current_approval_audits_hide_private_form_values')){
        if(@($LiveResult.checks|Where-Object{$_.label -eq $Name -and $_.passed}).Count -ne 1){throw 'Required live form check missing'}
    }
    $Pages=Get-Content -LiteralPath (Join-Path $Evidence "c1-form-error-pages-$($LiveResult.runId)/result.json") -Raw|ConvertFrom-Json
    if(-not $Pages.passed -or -not $Pages.realPages -or $Pages.fabricatedResponses -ne 0 -or $Pages.mutations -ne 8 -or $Pages.pageErrors.Count -or $Pages.results.Count -ne 8){throw 'Real page errors and corrections incomplete'}
    foreach($Device in @('desktop','mobile')){
        $Cases=@($Pages.results|Where-Object{$_.device -eq $Device})
        if(($Cases.kind|Sort-Object) -join ',' -ne 'direct,direct-approval,draft,draft-approval' -or @($Cases|Where-Object{-not $_.visible -or -not $_.focused -or -not $_.corrected}).Count){throw 'Missing real page correction or focus'}
    }
    Assert-Inputs "$Live/inputs.json"
    'C1_REAL_PAGE_SUMMARY: devices=2; error_scenarios=8; corrected=8; injected_request_values=8; fabricated_responses=0'
}
$Adjacent="h3-portal-finance-adjacent-20261002-$AdjacentRound"
Require-Markers "$Adjacent/summary.log" @('regenerated_matches_formal=true; formal_modified=false','changed=0; exit=0; production_modified=false')
Require-Markers "$Adjacent/oa-database.log" @('Complete approved schema table count; expected=374; actual=374','PASS: [1-9][0-9]* OA boundary assertions')
Require-Markers "$Adjacent/sources.log" @('MP_SQL_LAST_APPLY: matches=0','MYBATIS_ANNOTATION_SQL: matches=0','login_only_external_endpoints=0','JAVA_PERMISSION_PREFIXES:.*invalid=0','STATIC_WHITELIST:.*stale_lines=0','EXIT_CODE=0')
Require-Markers "$Adjacent/menu.log" @('EMPLOYEE_UNEXPECTED_GRANTS=0; EMPLOYEE_UNEXPECTED_WRITE_PERMISSIONS=0','APPROVED_MENU_SCOPE_PASS=true')
Assert-Inputs "$Adjacent/inputs.json"
$State=Get-Content -LiteralPath (Join-Path $Root '.cloudflow-runtime/batch-g-integration/9799534e1a3a47b5958330f14ae16dc7/state.json') -Raw|ConvertFrom-Json
if($State.status -ne 'RUNNING' -or $State.processes.Count -ne 9 -or $State.services.Count -ne 6){throw 'Owned environment incomplete'}
foreach($Entry in $State.processes){$Observed=Get-CimInstance Win32_Process -Filter "ProcessId=$($Entry.id)";if(-not $Observed -or -not $Observed.CommandLine.Contains($Entry.marker)){throw 'Owned process identity mismatch'}}
foreach($Service in $State.services){$Health=Invoke-RestMethod -Uri "http://127.0.0.1:$($Service.healthPort)/actuator/health" -TimeoutSec 15;if($Health.status -ne 'UP'){throw 'Owned service unhealthy'}}
'C1_FORM_SUMMARY: devices=2; fields_per_device=32; interaction_groups_per_device=10; regression_passed=true; owned_processes=9; healthy_services=6; whole_c1_acceptance=false; complete_35_prd=false; production_modified=false'
