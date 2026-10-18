param([ValidatePattern('^r[1-9][0-9]*$')][string]$RowRound='r3',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$FrontendRound='r50',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$BackendRound='r76',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$NativeRound='r5',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$MobileRound='r7',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$LocationRound='r17',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$RegressionRound='r24',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$DesktopLiveRound='r57',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$MobileLiveRound='r58',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$AdjacentRound='r73',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$ResponseRound='r7')
$ErrorActionPreference='Stop'
. 'D:\CloudFlowPro\.cloudflow-runtime/use-data-drive.ps1'
$Root='D:\CloudFlowPro'
$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
$Result=Get-Content -LiteralPath (Join-Path $Evidence "c2-row-renders-20261005-$RowRound/result.json") -Raw|ConvertFrom-Json
if(-not $Result.passed -or -not $Result.componentOnly -or -not $Result.runtimeInstrumentationOnly -or $Result.businessDatabaseWrites -ne 0 -or $Result.pageErrors.Count -or $Result.blockedRequests.Count -or $Result.checks.Count -ne 217 -or @($Result.checks|Where-Object{-not $_.passed}).Count -or $Result.samples.Count -ne 52){throw 'Complete row execution evidence required'}
if(@($Result.actualComponents|Sort-Object -Unique).Count -ne 2 -or 'FormSubTable' -notin $Result.actualComponents -or 'FormScalarControl' -notin $Result.actualComponents){throw 'Actual row and field execution counters required'}
$Actions=@('edit_0_name','edit_1_name','edit_0_amount','root_dependency_closed','root_dependency_open','first_row_error','second_row_error','clear_error','root_error','copy','delete','sort','add')
foreach($Device in @('desktop','mobile')){foreach($Count in @(3,100)){
    foreach($Action in $Actions){
        $Samples=@($Result.samples|Where-Object{$_.device -eq $Device -and $_.count -eq $Count -and $_.action -eq $Action})
        if($Samples.Count -ne 1){throw 'Row execution device or action missing'}
        if(-not $Action.StartsWith('edit_')){continue}
        $Sample=$Samples[0]
        $Changed=if($Action -eq 'edit_1_name'){'row-1'}else{'row-0'}
        $Unchanged=@($Sample.beforeMounted|Where-Object{$_ -in $Sample.afterMounted -and $_ -ne $Changed})
        if(-not $Unchanged.Count){throw 'No unchanged mounted row observed'}
        foreach($Identity in $Unchanged){foreach($Component in @('TableRow','RowFields','Scalar')){
            if($Sample.executions.$Component.$Identity){throw 'An unchanged row executed during a cell edit'}
        }}
        if($Sample.executions.RowFields.$Changed -lt 1 -or $Sample.executions.Scalar.$Changed -lt 1){throw 'Changed row execution missing'}
    }
}}
$Inputs=@(Get-Content -LiteralPath (Join-Path $Evidence "c2-row-renders-20261005-$RowRound/inputs.json") -Raw|ConvertFrom-Json)
if(-not $Inputs.Count){throw 'Row input snapshot required'}
foreach($Input in $Inputs){if((Get-FileHash -LiteralPath (Join-Path $Root $Input.Path)).Hash -ne $Input.Hash){throw "Row input changed: $($Input.Path)"}}
"C2_ROW_INPUTS: files=$($Inputs.Count); changed=0"
& (Join-Path $Root 'scripts/summarize-c2-native-table.ps1') -FrontendRound $FrontendRound -BackendRound $BackendRound -NativeRound $NativeRound -MobileRound $MobileRound -LocationRound $LocationRound -RegressionRound $RegressionRound -DesktopLiveRound $DesktopLiveRound -MobileLiveRound $MobileLiveRound -AdjacentRound $AdjacentRound -ResponseRound $ResponseRound
'C2_ROW_SUMMARY: combinations=4; checks=217; actions=52; cell_edits=12; unchanged_outer_rows=0; unchanged_field_rows=0; unchanged_controls=0; whole_c2_acceptance=false; complete_35_prd=false; production_modified=false'
