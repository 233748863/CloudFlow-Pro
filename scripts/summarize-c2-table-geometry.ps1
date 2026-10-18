param([string]$FrontendRound='r46',[string]$BackendRound='r74',[string]$GeometryRound='r4',[string]$NativeRound='r4',
    [string]$MobileRound='r6',[string]$LocationRound='r16',[string]$RegressionRound='r21',
    [string]$DesktopLiveRound='r39',[string]$MobileLiveRound='r40',[string]$AdjacentRound='r69',[string]$ResponseRound='r6')
$ErrorActionPreference='Stop'
. 'D:\CloudFlowPro\.cloudflow-runtime/use-data-drive.ps1'
$Root='D:\CloudFlowPro'
$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
foreach($Round in @($FrontendRound,$BackendRound,$GeometryRound,$NativeRound,$MobileRound,$LocationRound,$RegressionRound,$DesktopLiveRound,$MobileLiveRound,$AdjacentRound,$ResponseRound)){
    if($Round -notmatch '^r[1-9][0-9]*$'){throw 'Invalid table geometry verification round'}
}
$Directory=Join-Path $Evidence "c2-table-geometry-20261005-$GeometryRound"
$Result=Get-Content -LiteralPath (Join-Path $Directory 'result.json') -Raw|ConvertFrom-Json
if(-not $Result.completed -or $Result.mode -ne 'verify' -or -not $Result.componentOnly -or $Result.checks.Count -ne 97 -or $Result.observations.Count -ne 18 -or @($Result.checks|Where-Object{-not $_.passed}).Count -or $Result.pageErrors.Count -or $Result.businessRequests.Count){throw 'Table geometry component evidence incomplete'}
foreach($Name in @('actual_pointer_drag_preserves_all_values_and_ids','scroll_keeps_only_one_extra_focused_row','leaving_table_releases_offscreen_focused_row')){
    if(@($Result.checks|Where-Object{$_.label -eq $Name -and $_.passed}).Count -ne 1){throw 'Table geometry focus or pointer evidence missing'}
}
$Inputs=@(Get-Content -LiteralPath (Join-Path $Directory 'inputs.json') -Raw|ConvertFrom-Json)
if(-not $Inputs.Count){throw 'Table geometry input snapshot required'}
foreach($Input in $Inputs){if((Get-FileHash -LiteralPath (Join-Path $Root $Input.Path)).Hash -ne $Input.Hash){throw "Table geometry input changed: $($Input.Path)"}}
"C2_GEOMETRY_INPUTS: files=$($Inputs.Count); changed=0; snapshot=c2-table-geometry-20261005-$GeometryRound/inputs.json"
& (Join-Path $Root 'scripts/summarize-c2-native-table.ps1') -FrontendRound $FrontendRound -BackendRound $BackendRound -NativeRound $NativeRound -MobileRound $MobileRound -LocationRound $LocationRound -RegressionRound $RegressionRound -DesktopLiveRound $DesktopLiveRound -MobileLiveRound $MobileLiveRound -AdjacentRound $AdjacentRound -ResponseRound $ResponseRound
"C2_GEOMETRY_SUMMARY: geometry_checks=97; device_scenarios=18; native_checks=21; mobile_checks=20; widths=120,800; header_characters=200; error_characters=156; exact_widths=true; pointer_component_only=true; whole_c2_acceptance=false; complete_35_prd=false; production_modified=false"
