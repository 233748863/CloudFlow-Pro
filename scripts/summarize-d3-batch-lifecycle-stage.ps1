param([ValidatePattern('^r[1-9][0-9]*$')][string]$Round='r1',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$LifecycleRound='r1',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$AdjacentRound='r100')
$ErrorActionPreference='Stop'
. 'D:\CloudFlowPro\.cloudflow-runtime\use-data-drive.ps1'
$Root='D:\CloudFlowPro'
$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
$Run=Join-Path $Root '.cloudflow-runtime/batch-g-integration/9799534e1a3a47b5958330f14ae16dc7'
$Report=Join-Path $Evidence "d3-batch-lifecycle-stage-20261006-$Round.json"
if(Test-Path -LiteralPath $Report){throw 'Retain existing stage evidence'}
function Require([bool]$Condition,[string]$Message){if(-not $Condition){throw $Message}}
function Read-Json([string]$Relative){Get-Content -LiteralPath (Join-Path $Evidence $Relative) -Raw|ConvertFrom-Json}
$Folder="d3-batch-lifecycle-20261006-$LifecycleRound"
$Result=Read-Json "$Folder/result.json"
foreach($Property in @('passed','duplicate','competing','attendance','immutable','closed','preservation','restoration','secrets','syntheticPolicy')){
    Require ($Result.$Property -eq $true) "Lifecycle evidence missing: $Property"
}
Require (-not $Result.all18Complete -and -not $Result.globalComplete -and -not $Result.officialTaxPolicyVerified) 'Lifecycle scope boundary changed'
$Fixture=Read-Json "$Folder/fixture.json"
Require ($Fixture.source -eq 'd3-batch-scale-20261006-r3' -and $Fixture.periodId -eq '122' -and $Fixture.slabId -eq '1509') 'Reused sample identity changed'
Require ($Fixture.tasks.Count -eq 5 -and @($Fixture.tasks|Where-Object terminal -NE 'SUCCESS').Count -eq 0) 'Original lifecycle tasks not completed'
Require (@($Fixture.tasks.executeNo|Select-Object -Unique).Count -eq 5 -and ($Fixture.tasks.affectedRows|Measure-Object -Sum).Sum -eq 4) 'Original task counts changed'
Require ($Fixture.selectedEmployees.Count -eq 3 -and $Fixture.batches.Count -ge 5 -and $Fixture.batches.Count -le 6) 'Lifecycle sample scope changed'
Require (@($Fixture.restorations.PSObject.Properties|Where-Object Value -NE $true).Count -eq 0 -and $Fixture.restorations.PSObject.Properties.Name.Count -eq $Fixture.batches.Count) 'Owned batch finalization incomplete'
$Duplicate=@($Fixture.races|Where-Object kind -EQ 'same_batch')
$Competing=@($Fixture.races|Where-Object kind -EQ 'two_batches')
$Closing=@($Fixture.races|Where-Object kind -EQ 'create_and_close')
Require ($Duplicate.Count -eq 1 -and @($Duplicate[0].outcomes|Where-Object code -EQ 200).Count -eq 1) 'Same batch execution race missing'
Require ($Competing.Count -eq 1 -and @($Competing[0].outcomes|Where-Object code -EQ 200).Count -eq 2) 'Competing execution requests missing'
Require ($Closing.Count -eq 1 -and @($Closing[0].outcomes|Where-Object code -EQ 200).Count -eq 1) 'Create-close serialization evidence missing'
$Current=@{}
foreach($Relative in @("$Folder/inputs.json","h3-portal-finance-adjacent-20261002-$AdjacentRound/inputs.json")){
    foreach($Item in @(Read-Json $Relative)){
        $Path=if([IO.Path]::IsPathRooted($Item.Path)){[IO.Path]::GetFullPath($Item.Path)}else{[IO.Path]::GetFullPath((Join-Path $Root $Item.Path))}
        Require ($Path.StartsWith($Root+'\',[StringComparison]::OrdinalIgnoreCase)) 'Input outside owned workspace'
        Require (-not $Current.ContainsKey($Path) -or $Current[$Path] -eq $Item.Hash) 'Lifecycle input hashes conflict'
        $Current[$Path]=$Item.Hash
    }
}
foreach($Path in $Current.Keys){Require ((Get-FileHash -LiteralPath $Path).Hash -eq $Current[$Path]) 'Current lifecycle input changed'}
$Inputs=@(Read-Json "$Folder/inputs.json")
$OriginalCount=0
foreach($Name in @('scripts/verify-d3-batch-lifecycle.mjs','scripts/run-d3-batch-lifecycle.ps1','scripts/run-d3-batch-lifecycle-allowance.mjs','scripts/runtime-checks/d1-leave-runtime.mjs')){
    $Input=@($Inputs|Where-Object {$_.Path.Replace('\','/') -eq $Name})
    Require ($Input.Count -eq 1 -and (Get-FileHash -LiteralPath (Join-Path $Evidence "$Folder/original-$(Split-Path -Leaf $Name)")).Hash -eq $Input[0].Hash) 'Original execution script changed'
    $OriginalCount++
}
$Launch=Get-Content -LiteralPath (Join-Path $Evidence "d3-batch-lifecycle-live-$LifecycleRound-launch.log") -Raw
Require ($Launch -match 'D3_LIFECYCLE_RUN_EXIT=0' -and $Launch -match 'OWNED_CAPTCHA_RESTORED: original_limit=100; original_ttl=-1; counter_before=668; counter_after=671; counter_writes=0; database_unchanged=true; production_modified=false') 'Original live exit or captcha restoration missing'
$Adjacent=Get-Content -LiteralPath (Join-Path $Evidence "h3-portal-finance-adjacent-20261002-$AdjacentRound/summary.log") -Raw
Require ($Adjacent -match 'H3_FINANCE_ADJACENT: files=(\d+); changed=0; exit=0; production_modified=false') 'Related regression incomplete'
$AdjacentInputs=[int]$Matches[1]
foreach($Build in @('backend-r95','frontend-r58')){
    foreach($Item in @(Read-Json "h3-portal-finance-20261002-$Build-inputs.json")){
        Require ((Get-FileHash -LiteralPath (Join-Path $Root $Item.Path)).Hash -eq $Item.Hash) 'Product differs from B95/F58'
    }
}
$State=Get-Content -LiteralPath (Join-Path $Run 'state.json') -Raw|ConvertFrom-Json
Require ($State.status -eq 'RUNNING' -and [IO.Path]::GetFullPath($State.run) -eq $Run) 'Owned runtime changed'
$Reload=Get-Content -LiteralPath (Join-Path $Evidence 'd3-batch-selection-hr-reload-r95-launch.log') -Raw
Require ($Reload -match 'ISOLATED_RESTART_READY: service=hr; port=\d+; process=(\d+);') 'B95 reload record missing'
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
$Summary=[pscustomobject]@{passed=$true;backend='r95';frontend='r58';lifecycleRound=$LifecycleRound;checks=$Result.checks.Count;requests=$Result.requests;tasks=$Fixture.tasks.Count;batches=$Fixture.batches.Count;currentInputs=$Current.Count;adjacentInputs=$AdjacentInputs;originalScripts=$OriginalCount;captchaRestored=$true;productChanged=$false;processes=$State.processes.Count;healthyServices=$Healthy;hrPid=$HrPid;original500SalaryRowsPreserved=$true;reusedPeriodClosed=$true;reusedTaxInactive=$true;closeRace=$Closing[0].outcomes;priorChecksRelabeled=$false;officialTaxPolicyVerified=$false;all18Complete=$false;globalComplete=$false;remaining=@('D3 permissions deductions correction large amounts and complete attendance cases','D3 complementary create-wins close race and employee-confirmed paths','D2 first request below500ms and all17','Official tax policy','Global35PRD681 unified regression')}
$Summary|ConvertTo-Json -Depth 6|Set-Content -LiteralPath $Report -Encoding utf8NoBOM
"D3_LIFECYCLE_STAGE: checks=$($Result.checks.Count); requests=$($Result.requests); tasks=$($Fixture.tasks.Count); batches=$($Fixture.batches.Count); inputs=$($Current.Count); adjacent=$AdjacentInputs; originals=$OriginalCount; processes=$($State.processes.Count); healthy=$Healthy; product_changed=false; global_complete=false"
