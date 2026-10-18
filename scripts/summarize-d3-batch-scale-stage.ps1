param([ValidatePattern('^r[1-9][0-9]*$')][string]$Round='r1',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$ScaleRound='r3',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$AdjacentRound='r99')
$ErrorActionPreference='Stop'
. 'D:\CloudFlowPro\.cloudflow-runtime\use-data-drive.ps1'
$Root='D:\CloudFlowPro'
$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
$Run=Join-Path $Root '.cloudflow-runtime/batch-g-integration/9799534e1a3a47b5958330f14ae16dc7'
$Report=Join-Path $Evidence "d3-batch-scale-stage-20261006-$Round.json"
if(Test-Path -LiteralPath $Report){throw 'Retain existing stage evidence'}
function Require([bool]$Condition,[string]$Message){if(-not $Condition){throw $Message}}
function Read-Json([string]$Relative){Get-Content -LiteralPath (Join-Path $Evidence $Relative) -Raw|ConvertFrom-Json}
$Folder="d3-batch-scale-20261006-$ScaleRound"
$Result=Read-Json "$Folder/result.json"
foreach($Property in @('passed','selection','selectionPage','scale','progressPage','cancellation','preservation','restoration','secrets','syntheticPolicy')){
    Require ($Result.$Property -eq $true) "D3 scale verification missing: $Property"
}
Require (-not $Result.all18Complete -and -not $Result.globalComplete -and -not $Result.officialTaxPolicyVerified) 'Scale evidence boundary changed'
$Fixture=Read-Json "$Folder/fixture.json"
Require ($Fixture.employees.Count -eq 501 -and $Fixture.batches.Count -eq 1 -and $Fixture.tasks.Count -eq 1 -and $Fixture.slipIds.Count -eq 500) 'Actual scale differs from requirement'
$Task=$Fixture.tasks[0]
Require ($Task.terminal -eq 'SUCCESS' -and [int]$Task.affectedRows -eq 500 -and $Task.responseMilliseconds -gt 0 -and $Task.responseMilliseconds -lt $Task.elapsedMilliseconds) 'Scale original execution not completed asynchronously'
Require ($Result.performanceMet -eq ($Task.elapsedMilliseconds -lt 180000)) 'Scale performance differs from original timing'
Require ($Fixture.r1Recovery.taxInactive -and @($Fixture.restorations.PSObject.Properties|Where-Object Value -NE $true).Count -eq 0) 'Scale cleanup or R1 recovery incomplete'
$Current=@{}
foreach($Relative in @("$Folder/inputs.json","h3-portal-finance-adjacent-20261002-$AdjacentRound/inputs.json")){
    foreach($Item in @(Read-Json $Relative)){
        $Path=if([IO.Path]::IsPathRooted($Item.Path)){[IO.Path]::GetFullPath($Item.Path)}else{[IO.Path]::GetFullPath((Join-Path $Root $Item.Path))}
        Require (-not $Current.ContainsKey($Path) -or $Current[$Path] -eq $Item.Hash) 'Scale input hashes conflict'
        $Current[$Path]=$Item.Hash
    }
}
foreach($Path in $Current.Keys){Require ((Get-FileHash -LiteralPath $Path).Hash -eq $Current[$Path]) 'Current scale source changed'}
$OriginalCount=0
foreach($Attempt in @('r1','r2',$ScaleRound)|Select-Object -Unique){
    $AttemptFolder="d3-batch-scale-20261006-$Attempt"
    $Inputs=@(Read-Json "$AttemptFolder/inputs.json")
    foreach($Name in @('verify-d3-batch-scale.mjs','run-d3-batch-scale.ps1','run-d3-batch-scale-allowance.mjs')){
        $Input=@($Inputs|Where-Object {$_.Path.Replace('\','/') -eq "scripts/$Name"})
        Require ($Input.Count -eq 1 -and (Get-FileHash -LiteralPath (Join-Path $Evidence "$AttemptFolder/original-$Name")).Hash -eq $Input[0].Hash) 'Original scale script changed'
        $OriginalCount++
    }
    $Launch=Get-Content -LiteralPath (Join-Path $Evidence "d3-batch-scale-live-$Attempt-launch.log") -Raw
    Require ($Launch -match 'OWNED_CAPTCHA_RESTORED: original_limit=100; original_ttl=-1; counter_before=\d+; counter_after=\d+; counter_writes=0; database_unchanged=true; production_modified=false') 'Scale captcha restoration missing'
}
$R1=Read-Json 'd3-batch-scale-20261006-r1/result.json'
$R2=Read-Json 'd3-batch-scale-20261006-r2/result.json'
$R2Fixture=Read-Json 'd3-batch-scale-20261006-r2/fixture.json'
Require (-not $R1.passed -and -not $R1.restoration -and $R1.preservation -and $R1.tasks -eq 0) 'R1 original failure changed'
Require (-not $R2.passed -and $R2.restoration -and $R2.preservation -and $R2.tasks -eq 0 -and $R2Fixture.r1Recovery.taxInactive -and $R2Fixture.selectionObservation.actualRows.Count -eq 2 -and $R2Fixture.selectionObservation.reopenedSelectedCount -eq 0) 'R2 defect or recovery evidence changed'
$Originals=@(Read-Json 'd3-batch-selection-20261006-r1/original-inputs.json')
Require ($Originals.Count -eq 1) 'Original batch source missing'
$Changed=@()
foreach($Item in @(Read-Json 'h3-portal-finance-20261002-backend-r94-inputs.json')){
    if((Get-FileHash -LiteralPath (Join-Path $Root $Item.Path)).Hash -eq $Item.Hash){continue}
    Require ($Item.Path.Replace('\','/') -eq $Originals[0].Path.Replace('\','/') -and $Item.Hash -eq $Originals[0].Hash) 'Unrecorded product change'
    Require ((Get-FileHash -LiteralPath (Join-Path $Evidence ('d3-batch-selection-20261006-r1/original-source/'+$Originals[0].Path))).Hash -eq $Originals[0].Hash) 'Original product source changed'
    $Changed+=$Item.Path
}
Require ($Changed.Count -eq 1) 'Unexpected scope of batch selection change'
$Build=Get-Content -LiteralPath (Join-Path $Evidence 'h3-portal-finance-20261002-backend-r95.log') -Raw
Require ($Build.Contains('BUILD SUCCESS') -and $Build.Contains('FINANCE_BUILD: phase=Backend; files=3832; changed=0; exit=0')) 'B95 build incomplete'
$Adjacent=Get-Content -LiteralPath (Join-Path $Evidence "h3-portal-finance-adjacent-20261002-$AdjacentRound/summary.log") -Raw
Require ($Adjacent -match 'H3_FINANCE_ADJACENT: files=(\d+); changed=0; exit=0; production_modified=false') 'Scale adjacent verification incomplete'
$AdjacentInputs=[int]$Matches[1]
$State=Get-Content -LiteralPath (Join-Path $Run 'state.json') -Raw|ConvertFrom-Json
Require ($State.status -eq 'RUNNING' -and [IO.Path]::GetFullPath($State.run) -eq $Run) 'Owned runtime changed'
$Reload=Get-Content -LiteralPath (Join-Path $Evidence 'd3-batch-selection-hr-reload-r95-launch.log') -Raw
Require ($Reload -match 'ISOLATED_RESTART_READY: service=hr; port=\d+; process=(\d+);') 'B95 HR reload incomplete'
$HrPid=[int]$Matches[1]
Require (@($State.processes|Where-Object {$_.name -eq 'hr' -and $_.id -eq $HrPid}).Count -eq 1) 'B95 HR process changed'
foreach($Entry in $State.processes){
    $Observed=Get-CimInstance Win32_Process -Filter "ProcessId=$($Entry.id)"
    Require ($Observed -and $Observed.CommandLine.Contains($Entry.marker)) 'Reference process ownership failed'
}
$Healthy=0
foreach($Service in $State.services){
    Require ((Invoke-RestMethod -Uri "http://127.0.0.1:$($Service.healthPort)/actuator/health" -TimeoutSec 5).status -eq 'UP') 'Reference service unhealthy'
    $Healthy++
}
$Summary=[pscustomobject]@{passed=$true;backend='r95';frontend='r58';scaleRound=$ScaleRound;checks=$Result.checks.Count;requests=$Result.requests;employees=$Result.employees;tasks=1;responseMilliseconds=$Task.responseMilliseconds;elapsedMilliseconds=$Task.elapsedMilliseconds;performanceMet=$Result.performanceMet;currentInputs=$Current.Count;adjacentInputs=$AdjacentInputs;originalScripts=$OriginalCount;r1Recovered=$true;failuresPreserved=$true;captchaRestored=$true;changedProduct=$Changed;processes=$State.processes.Count;healthyServices=$Healthy;hrPid=$HrPid;historicalCumulativeVersion='r94';priorChecksRelabeled=$false;officialTaxPolicyVerified=$false;all18Complete=$false;globalComplete=$false;remaining=@('D3 current remaining concurrency permissions deductions and closed-period checks','D2 first-request below500ms and all17','Official tax policy','Global35PRD681 unified regression')}
$Summary|ConvertTo-Json -Depth 5|Set-Content -LiteralPath $Report -Encoding utf8NoBOM
"D3_SCALE_STAGE: checks=$($Result.checks.Count); requests=$($Result.requests); employees=501; tasks=1; inputs=$($Current.Count); adjacent=$AdjacentInputs; performance=$($Result.performanceMet); originals=$OriginalCount; processes=$($State.processes.Count); healthy=$Healthy; global_complete=false"
