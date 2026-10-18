param([string]$FrontendRound='r39',[string]$BackendRound='r73',[string]$TreeRound='r2',
    [string]$LayoutRound='r4',[string]$LocationRound='r10',[string]$RegressionRound='r17',
    [string]$LiveRound='r32',[string]$AdjacentRound='r66')
$ErrorActionPreference='Stop'
. 'D:\CloudFlowPro\.cloudflow-runtime/use-data-drive.ps1'
$Root='D:\CloudFlowPro'
$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
foreach($Round in @($FrontendRound,$BackendRound,$TreeRound,$LayoutRound,$LocationRound,$RegressionRound,$LiveRound,$AdjacentRound)){if($Round -notmatch '^r[1-9][0-9]*$'){throw 'Invalid verification round'}}
function Read-Json([string]$File){Get-Content -LiteralPath (Join-Path $Evidence $File) -Raw|ConvertFrom-Json}
function Assert-Inputs([string]$File){
    $Inputs=@(Read-Json $File)
    if(-not $Inputs.Count){throw 'Tree render input snapshot required'}
    foreach($Input in $Inputs){if((Get-FileHash -LiteralPath (Join-Path $Root $Input.Path)).Hash -ne $Input.Hash){throw "Tree render input changed: $($Input.Path)"}}
    "C1_TREE_INPUTS: files=$($Inputs.Count); changed=0; snapshot=$File"
}
$Tree=Read-Json "c1-tree-renders-20261005-$TreeRound/result.json"
if(-not $Tree.passed -or $Tree.mode -ne 'enforce' -or $Tree.samples.Count -ne 4 -or $Tree.redundantRenders -ne 0 -or -not $Tree.dependenciesUpdate -or $Tree.pageErrors.Count -or $Tree.blockedRequests.Count -or $Tree.businessDatabaseWrites -ne 0){throw 'Tree render optimization incomplete'}
$Layout=Read-Json "c1-layout-designer-20261005-$LayoutRound/result.json"
if(-not $Layout.passed -or -not $Layout.componentOnly -or $Layout.checks.Count -ne 39 -or @($Layout.checks|Where-Object{-not $_.passed}).Count -or $Layout.pageErrors.Count -or $Layout.businessRequests.Count){throw 'Tree layout component evidence incomplete'}
$Location=Read-Json "c1-error-location-20261005-$LocationRound/result.json"
if(-not $Location.passed -or $Location.mode -ne 'verify' -or $Location.results.Count -ne 18 -or @($Location.results|Where-Object{-not $_.inView -or -not $_.focused}).Count -or $Location.pageErrors.Count -or $Location.businessRequests.Count){throw 'Tree error focus evidence incomplete'}
$Live="c1-form-live-20261005-$LiveRound"
$Result=Read-Json "$Live/result.json"
if(-not $Result.passed -or -not $Result.isolated -or -not $Result.layoutPagesExecuted -or $Result.scope -ne 'FULL_C' -or @($Result.checks|Where-Object{-not $_.passed}).Count){throw 'Tree actual layout scope incomplete'}
$Pages=Read-Json "c1-layout-pages-$($Result.runId)/result.json"
if(-not $Pages.passed -or -not $Pages.realPages -or -not $Pages.designerSaved -or -not $Pages.depthRejected -or $Pages.pageErrors.Count -or $Pages.fabricatedResponses -ne 0 -or $Pages.injectedValues -ne 0 -or $Pages.cases.Count -ne 2){throw 'Tree actual layout pages incomplete'}
foreach($Case in $Pages.cases){if(-not $Case.restored -or -not $Case.started -or -not $Case.approved -or -not $Case.semantics){throw 'Tree device business behavior incomplete'}}
foreach($Name in @('layout_real_designer_and_both_devices_complete','current_service_logs_hide_credentials_and_private_form_values','all_approval_requests_retain_access_and_error_audits','current_approval_audits_hide_private_form_values')){
    if(@($Result.checks|Where-Object{$_.label -eq $Name -and $_.passed}).Count -ne 1){throw 'Tree actual safety or device evidence missing'}
}
foreach($File in @("h3-portal-finance-20261002-backend-$BackendRound-inputs.json","h3-portal-finance-20261002-frontend-$FrontendRound-inputs.json",
    "c1-tree-renders-20261005-$TreeRound/inputs.json","c1-layout-designer-20261005-$LayoutRound/inputs.json","c1-error-location-20261005-$LocationRound/inputs.json",
    "c1-form-regression-20261005-$RegressionRound/inputs.json","$Live/inputs.json","h3-portal-finance-adjacent-20261002-$AdjacentRound/inputs.json")){Assert-Inputs $File}
$Rules=Get-Content -LiteralPath (Join-Path $Evidence "c1-form-regression-20261005-$RegressionRound/capabilities.log") -Raw
$Browser=Get-Content -LiteralPath (Join-Path $Evidence "c1-form-regression-20261005-$RegressionRound/browser.log") -Raw
if($Rules -notmatch 'form foundation checks passed: 188;' -or $Browser -notmatch 'PASS form browser checks=52;'){throw 'Tree frontend regression incomplete'}
$Adjacent=Get-Content -LiteralPath (Join-Path $Evidence "h3-portal-finance-adjacent-20261002-$AdjacentRound/summary.log") -Raw
$Database=Get-Content -LiteralPath (Join-Path $Evidence "h3-portal-finance-adjacent-20261002-$AdjacentRound/oa-database.log") -Raw
if($Adjacent -notmatch 'changed=0; exit=0; production_modified=false' -or $Database -notmatch 'expected=374; actual=374' -or $Database -notmatch 'PASS: 1012 OA boundary assertions'){throw 'Tree adjacent evidence incomplete'}
$Launch=Get-Content -LiteralPath (Join-Path $Evidence "c1-tree-renders-live-$LiveRound-launch.log") -Raw
if($Launch -notmatch 'OWNED_CAPTCHA_RESTORED: original_limit=100; original_ttl=-1;' -or $Launch -notmatch 'counter_writes=0; database_unchanged=true; production_modified=false'){throw 'Tree captcha restoration missing'}
$State=Get-Content -LiteralPath (Join-Path $Root '.cloudflow-runtime/batch-g-integration/9799534e1a3a47b5958330f14ae16dc7/state.json') -Raw|ConvertFrom-Json
if($State.status -ne 'RUNNING' -or $State.processes.Count -ne 9 -or $State.services.Count -ne 6){throw 'Owned services incomplete'}
foreach($Entry in $State.processes){$Observed=Get-CimInstance Win32_Process -Filter "ProcessId=$($Entry.id)";if(-not $Observed -or -not $Observed.CommandLine.Contains($Entry.marker)){throw 'Owned process identity changed'}}
foreach($Service in $State.services){$Health=Invoke-RestMethod -Uri "http://127.0.0.1:$($Service.healthPort)/actuator/health" -TimeoutSec 15;if($Health.status -ne 'UP'){throw 'Owned service unhealthy'}}
"C1_TREE_SUMMARY: toggles=4; redundant_reference_renders=0; dependency_updates=true; layout_checks=39; focus_scenarios=18; actual_checks=$($Result.checks.Count); recorded_requests=$($Result.requests.Count); healthy_services=6; whole_c1_acceptance=false; complete_35_prd=false; production_modified=false"
