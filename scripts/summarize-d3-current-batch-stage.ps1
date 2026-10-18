param([ValidatePattern('^r[1-9][0-9]*$')][string]$Round='r1',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$AdjacentRound='r122')
$ErrorActionPreference='Stop'
. 'D:\CloudFlowPro\.cloudflow-runtime\use-data-drive.ps1'
$Root='D:\CloudFlowPro'
$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
$Run=Join-Path $Root '.cloudflow-runtime/batch-g-integration/9799534e1a3a47b5958330f14ae16dc7'
$Output=Join-Path $Evidence "d3-current-batch-stage-20261006-$Round.json"
if(Test-Path -LiteralPath $Output){throw 'Retain original current batch stage evidence'}
$ReportHash=(Get-FileHash -LiteralPath $PSCommandPath).Hash
function Require([bool]$Condition,[string]$Message){if(-not $Condition){throw $Message}}
function Read-Json([string]$File){Get-Content -LiteralPath (Join-Path $Evidence $File) -Raw|ConvertFrom-Json}
$Groups=@(
    @{Folder='d3-batch-scale-20261006-r4';Launch='d3-batch-scale-live-r4';Terminal='D3_SCALE_RUN_EXIT=0';Originals=3;Flags=@('selection','selectionPage','scale','progressPage','cancellation','performanceMet')},
    @{Folder='d3-batch-lifecycle-20261006-r2';Launch='d3-batch-lifecycle-live-r2';Terminal='D3_LIFECYCLE_RUN_EXIT=0';Originals=4;Flags=@('duplicate','competing','attendance','immutable','closed')},
    @{Folder='d3-cumulative-tax-20261006-r5';Launch='d3-cumulative-tax-live-r5';Terminal='D3_TAX_RUN_EXIT=0';Originals=3;Flags=@('cumulative','retry','yearReset','midHire','snapshot','taxTableReplacement','unverifiedDeduction','cancellation')},
    @{Folder='d3-payroll-deductions-20261006-r3';Launch='d3-payroll-deductions-live-r3';Terminal='D3_DEDUCTIONS_RUN_EXIT=0';Originals=4;Flags=@('approval','attendance','deductions','mixedBatch','snapshot')}
)
$Current=@{};$Phases=@();$OriginalCount=0;$Captcha=@();$LastCaptcha=930
function Verify-Inputs([string]$File){
    foreach($Item in @(Read-Json $File)){
        if(-not $Current.ContainsKey($Item.Path)){$Current[$Item.Path]=(Get-FileHash -LiteralPath (Join-Path $Root $Item.Path)).Hash}
        Require ($Current[$Item.Path] -eq $Item.Hash) 'Current executed input changed'
    }
}
foreach($Group in $Groups){
    $Result=Read-Json "$($Group.Folder)/result.json"
    foreach($Flag in (@('passed','preservation','restoration','secrets','syntheticPolicy')+$Group.Flags)){Require ($Result.$Flag -eq $true) "Required batch evidence missing: $Flag"}
    Require (-not $Result.all18Complete -and -not $Result.globalComplete -and -not $Result.officialTaxPolicyVerified) 'Batch scope changed'
    Verify-Inputs "$($Group.Folder)/inputs.json"
    $Inputs=@(Read-Json "$($Group.Folder)/inputs.json")
    $Originals=@(Get-ChildItem -LiteralPath (Join-Path $Evidence $Group.Folder) -Filter 'original-*' -File)
    Require ($Originals.Count -eq $Group.Originals) 'Executed script original count differs'
    foreach($Original in $Originals){
        $Name=$Original.Name.Substring('original-'.Length)
        $Input=@($Inputs|Where-Object {(Split-Path -Leaf $_.Path) -eq $Name})
        Require ($Input.Count -eq 1 -and (Get-FileHash -LiteralPath $Original.FullName).Hash -eq $Input[0].Hash) 'Original executed script differs';$OriginalCount++
    }
    $Launch=Get-Content -LiteralPath (Join-Path $Evidence "$($Group.Launch)-launch.log") -Raw
    Require ($Launch.Contains($Group.Terminal)) 'Original execution terminal missing'
    Require ($Launch -match 'OWNED_CAPTCHA_RESTORED: original_limit=100; original_ttl=-1; counter_before=(\d+); counter_after=(\d+); counter_writes=0; database_unchanged=true; production_modified=false') 'Captcha restoration missing'
    $Before=[int]$Matches[1];$After=[int]$Matches[2]
    Require ($Before -eq $LastCaptcha -and $After -ge $Before) 'Captcha sequence differs';$LastCaptcha=$After
    $Captcha+=[pscustomobject]@{Folder=$Group.Folder;Before=$Before;After=$After}
    $Phases+=[pscustomobject]@{Folder=$Group.Folder;Checks=$Result.checks.Count;Requests=$Result.requests;Tasks=$Result.tasks;Inputs=$Inputs.Count}
}
$Scale=Read-Json 'd3-batch-scale-20261006-r4/fixture.json'
$Lifecycle=Read-Json 'd3-batch-lifecycle-20261006-r2/fixture.json'
$Tax=Read-Json 'd3-cumulative-tax-20261006-r5/fixture.json'
$Deductions=Read-Json 'd3-payroll-deductions-20261006-r3/fixture.json'
Require ($Scale.employees.Count -eq 501 -and $Scale.slipIds.Count -eq 500 -and $Scale.tasks.Count -eq 1 -and $Scale.tasks[0].terminal -eq 'SUCCESS' -and $Scale.tasks[0].affectedRows -eq 500) 'Current scale sample incomplete'
$Task=$Scale.tasks[0]
Require ($Task.responseMilliseconds -gt 0 -and $Task.responseMilliseconds -lt $Task.elapsedMilliseconds -and $Task.elapsedMilliseconds -lt 180000) 'Current scale performance not met'
Require ($Lifecycle.source -eq 'd3-batch-scale-20261006-r4' -and $Lifecycle.periodId -eq $Scale.periodId -and $Lifecycle.slabId -eq $Scale.slabId -and $Lifecycle.tasks.Count -eq 5) 'Lifecycle source or task scope differs'
Require (@($Lifecycle.tasks|Where-Object terminal -ne 'SUCCESS').Count -eq 0 -and @($Lifecycle.races).Count -eq 3) 'Lifecycle tasks or races incomplete'
Require ($Tax.tasks.Count -eq 8 -and $Tax.slips.Count -eq 11 -and $Tax.replacementFailure.secondInsertOverflow -and $Tax.replacementFailure.originalRowsRestored) 'Cumulative actual calculation or rollback evidence missing'
Require ($Deductions.requests.Count -eq 3 -and $Deductions.tasks.Count -eq 1 -and $Deductions.tasks[0].terminal -eq 'SUCCESS' -and $Deductions.tasks[0].affectedRows -eq 1) 'Actual approved leave or mixed batch missing'
foreach($Fixture in @($Scale,$Lifecycle,$Tax,$Deductions)){foreach($Property in $Fixture.restorations.PSObject.Properties){Require ($Property.Value -eq $true) 'Fixture restoration incomplete'}}
foreach($Entry in @(@{Folder=$Groups[0].Folder;Names=@('selection-reopened.png','scale-running.png','scale-completed.png')},@{Folder=$Groups[1].Folder;Names=@('attendance-skipped.png')},@{Folder=$Groups[3].Folder;Names=@('mixed-deductions.png')})){
    foreach($Name in $Entry.Names){Require ((Get-Item -LiteralPath (Join-Path $Evidence "$($Entry.Folder)/$Name")).Length -gt 0) 'Browser evidence missing'}
}
foreach($File in @("h3-portal-finance-adjacent-20261002-$AdjacentRound/inputs.json",'h3-portal-finance-20261002-backend-r108-inputs.json','h3-portal-finance-20261002-frontend-r66-inputs.json','d3-batch-cancellation-20261006-r3/inputs.json','d3-simulator-20261006-r7/inputs.json','d3-simulator-config-20261006-r2/inputs.json')){Verify-Inputs $File}
$Binaries=@(Read-Json 'd3-simulator-config-20261006-r2/binary-inputs.json')
foreach($Item in $Binaries){Require ((Get-FileHash -LiteralPath $Item.Path).Hash -eq $Item.Hash) 'Compiled dependency changed'}
$Prior=Read-Json 'd3-current-core-stage-20261006-r1.json'
Require ($Prior.passed -and $Prior.backend -eq 'r108' -and $Prior.frontend -eq 'r66' -and $Prior.cancellationChecks -eq 149 -and $Prior.simulatorChecks -eq 123 -and $Prior.configurationChecks -eq 99) 'Previous current core stage incomplete'
$PriorInputs=@(Read-Json 'h3-portal-finance-adjacent-20261002-r121/inputs.json')
$Changed=@($PriorInputs|Where-Object {(Get-FileHash -LiteralPath (Join-Path $Root $_.Path)).Hash -ne $_.Hash}|ForEach-Object {$_.Path.Replace('\','/')})
$ExpectedChanged=@('scripts/run-d3-batch-lifecycle.ps1','scripts/verify-d3-batch-lifecycle.mjs','scripts/run-d3-batch-lifecycle-allowance.mjs')
Require ($Changed.Count -eq 3 -and @($Changed|Where-Object {$_ -notin $ExpectedChanged}).Count -eq 0) 'Changes since prior related round exceed explicit lifecycle sample parameter'
foreach($Name in $ExpectedChanged){
    $Previous=@($PriorInputs|Where-Object {$_.Path.Replace('\','/') -eq $Name})
    $Original=Join-Path $Evidence ('d3-batch-lifecycle-20261006-r1/original-'+(Split-Path -Leaf $Name))
    Require ($Previous.Count -eq 1 -and (Get-FileHash -LiteralPath $Original).Hash -eq $Previous[0].Hash) 'Previous lifecycle original unavailable'
}
$Adjacent=Get-Content -LiteralPath (Join-Path $Evidence "h3-portal-finance-adjacent-20261002-$AdjacentRound/summary.log") -Raw
Require ($Adjacent -match 'H3_FINANCE_ADJACENT: files=(\d+); changed=0; exit=0; production_modified=false') 'Current related regression incomplete';$AdjacentInputs=[int]$Matches[1]
$State=Get-Content -LiteralPath (Join-Path $Run 'state.json') -Raw|ConvertFrom-Json
Require ($State.status -eq 'RUNNING' -and [IO.Path]::GetFullPath($State.run) -eq $Run) 'Owned runtime required'
foreach($Entry in $State.processes){$Observed=Get-CimInstance Win32_Process -Filter "ProcessId=$($Entry.id)";Require ($Observed -and $Observed.CommandLine.Contains($Entry.marker)) 'Owned process mismatch'}
$Healthy=0
foreach($Service in $State.services){Require ((Invoke-RestMethod "http://127.0.0.1:$($Service.healthPort)/actuator/health" -TimeoutSec 5).status -eq 'UP') 'Unhealthy service';$Healthy++}
Require ((Get-FileHash -LiteralPath $PSCommandPath).Hash -eq $ReportHash) 'Report changed during execution'
$Summary=[pscustomobject]@{passed=$true;backend='r108';frontend='r66';phases=$Phases;responseMilliseconds=$Task.responseMilliseconds;scaleMilliseconds=$Task.elapsedMilliseconds;currentInputs=$Current.Count;binaryInputs=$Binaries.Count;originalScripts=$OriginalCount;relatedRound=$AdjacentRound;relatedInputs=$AdjacentInputs;lifecycleScriptChanges=$Changed;reportHash=$ReportHash;processes=$State.processes.Count;healthyServices=$Healthy;captcha=$Captcha;officialTaxPolicyVerified=$false;all18Complete=$false;globalComplete=$false;remaining=@('Other D3 phases with older product inputs','Official tax policy','D2 first ordinary request below500ms','Global35PRD681')}
$Summary|ConvertTo-Json -Depth 7|Set-Content -LiteralPath $Output -Encoding utf8NoBOM
"D3_CURRENT_BATCH_STAGE: phases=$($Phases.Count); scale_ms=$($Task.elapsedMilliseconds); inputs=$($Current.Count); binaries=$($Binaries.Count); originals=$OriginalCount; adjacent=$AdjacentInputs; healthy=$Healthy; global_complete=false"
