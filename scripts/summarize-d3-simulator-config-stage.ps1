param([ValidatePattern('^r[1-9][0-9]*$')][string]$Round='r1',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$ConfigRound='r1',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$AdjacentRound='r115')
$ErrorActionPreference='Stop'
. 'D:\CloudFlowPro\.cloudflow-runtime\use-data-drive.ps1'
$Root='D:\CloudFlowPro'
$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
$Run=Join-Path $Root '.cloudflow-runtime/batch-g-integration/9799534e1a3a47b5958330f14ae16dc7'
$Output=Join-Path $Evidence "d3-simulator-config-stage-20261006-$Round.json"
if(Test-Path -LiteralPath $Output){throw 'Retain original configuration-stage evidence'}
function Require([bool]$Condition,[string]$Message){if(-not $Condition){throw $Message}}
function Read-Json([string]$File){Get-Content -LiteralPath (Join-Path $Evidence $File) -Raw|ConvertFrom-Json}
$Folder="d3-simulator-config-20261006-$ConfigRound"
$Result=Read-Json "$Folder/result.json"
Require ($Result.Passed -and $Result.ActualDatabase -and $Result.ActualService -and $Result.ConfigurationReadFixture -and -not $Result.OfficialTaxPolicy -and $Result.ScratchCleaned -and $Result.InputChanges -eq 0) 'Configuration boundaries incomplete'
$Prior=Read-Json 'd3-simulator-stage-20261006-r1.json'
Require ($Prior.passed -and $Prior.liveRound -eq 'r6' -and $Prior.checks -eq 123 -and -not $Prior.globalComplete) 'Actual browser and scope stage incomplete'
$Current=@{}
foreach($Group in @("$Folder/inputs.json",'d3-simulator-20261006-r6/inputs.json',"h3-portal-finance-adjacent-20261002-$AdjacentRound/inputs.json")){
    foreach($Item in @(Read-Json $Group)){
        $Actual=(Get-FileHash -LiteralPath (Join-Path $Root $Item.Path)).Hash
        Require ($Actual -eq $Item.Hash) 'Verified source input changed'
        $Current[$Item.Path]=$Actual
    }
}
$Binaries=@(Read-Json "$Folder/binary-inputs.json")
foreach($Item in $Binaries){Require ((Get-FileHash -LiteralPath $Item.Path).Hash -eq $Item.Hash) 'Compiled dependency changed'}
$Inputs=@(Read-Json "$Folder/inputs.json")
foreach($Name in @('run-d3-simulator-config.ps1','verify-hr-settlement-foundation.ps1','HrCompensationSimulatorChecks.java')){
    $Input=@($Inputs|Where-Object {(Split-Path -Leaf $_.Path) -eq $Name})
    Require ($Input.Count -eq 1 -and (Get-FileHash -LiteralPath (Join-Path $Evidence "$Folder/original-$Name")).Hash -eq $Input[0].Hash) 'Original configuration script changed'
}
$OriginalFile=Join-Path $Evidence 'd3-simulator-config-original-foundation-20261006.ps1'
$PriorInput=@(Read-Json 'h3-portal-finance-adjacent-20261002-r114/inputs.json')|Where-Object {(Split-Path -Leaf $_.Path) -eq 'verify-hr-settlement-foundation.ps1'}
Require ($PriorInput.Count -eq 1 -and (Get-FileHash -LiteralPath $OriginalFile).Hash -eq $PriorInput.Hash) 'Previous shared runner original differs'
$Before=[IO.File]::ReadAllText($OriginalFile).Replace("`r`n","`n")
$Expected=$Before.Replace('[string]$StatePath, [switch]$LoginSessionRead','[string]$StatePath, [switch]$SimulatorConfiguration, [switch]$LoginSessionRead').Replace('@($LoginSessionRead,','@($SimulatorConfiguration, $LoginSessionRead,').Replace('$CheckClass = if ($LoginSessionRead)','$CheckClass = if ($SimulatorConfiguration) { ''HrCompensationSimulatorChecks'' } elseif ($LoginSessionRead)')
Require ($Expected -eq [IO.File]::ReadAllText((Join-Path $Root 'scripts/verify-hr-settlement-foundation.ps1')).Replace("`r`n","`n")) 'Shared runner change exceeds the new isolated mode'
$Live=Get-Content (Join-Path $Evidence "$Folder/live.log") -Raw
Require ($Live.Contains("D3_SIMULATOR_CONFIG: checks=$($Result.Checks);") -and $Live.Contains('owned_schema_remaining=0; runtime_tables=374; shared_redis_flush=false; production_modified=false')) 'Actual checks or cleanup missing'
Require ((Get-Content (Join-Path $Evidence "d3-simulator-config-20261006-$ConfigRound-launch.log") -Raw).Contains('D3_SIMULATOR_CONFIG_RUN_EXIT=0')) 'Original configuration run terminal missing'
$Adjacent=Get-Content (Join-Path $Evidence "h3-portal-finance-adjacent-20261002-$AdjacentRound/summary.log") -Raw
Require ($Adjacent -match 'H3_FINANCE_ADJACENT: files=(\d+); changed=0; exit=0; production_modified=false') 'Related regression incomplete'
$AdjacentInputs=[int]$Matches[1]
$State=Get-Content (Join-Path $Run 'state.json') -Raw|ConvertFrom-Json
Require ($State.status -eq 'RUNNING' -and [IO.Path]::GetFullPath($State.run) -eq $Run) 'Owned runtime required'
foreach($Entry in $State.processes){$Observed=Get-CimInstance Win32_Process -Filter "ProcessId=$($Entry.id)";Require ($Observed -and $Observed.CommandLine.Contains($Entry.marker)) 'Owned process mismatch'}
$Healthy=0
foreach($Service in $State.services){Require ((Invoke-RestMethod "http://127.0.0.1:$($Service.healthPort)/actuator/health" -TimeoutSec 5).status -eq 'UP') 'Unhealthy service';$Healthy++}
$Summary=[pscustomobject]@{passed=$true;backend='r106';frontend='r64';configRound=$ConfigRound;checks=$Result.Checks;liveChecks=$Prior.checks;sourceInputs=$Inputs.Count;binaryInputs=$Binaries.Count;currentInputs=$Current.Count;adjacentInputs=$AdjacentInputs;originalScripts=3;reviewedSharedRunnerChanges=3;processes=$State.processes.Count;healthyServices=$Healthy;officialTaxPolicyVerified=$false;all18Complete=$false;globalComplete=$false}
$Summary|ConvertTo-Json -Depth 4|Set-Content -LiteralPath $Output -Encoding utf8NoBOM
"D3_SIMULATOR_CONFIG_STAGE: checks=$($Result.Checks); live_checks=$($Prior.checks); inputs=$($Current.Count); binaries=$($Binaries.Count); adjacent=$AdjacentInputs; processes=$($State.processes.Count); healthy=$Healthy; global_complete=false"
