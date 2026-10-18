param([ValidatePattern('^r[1-9][0-9]*$')][string]$Round='r1')
$ErrorActionPreference='Stop'
. 'D:\CloudFlowPro\.cloudflow-runtime\use-data-drive.ps1'
$Root='D:\CloudFlowPro'
$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
$Run=Join-Path $Root '.cloudflow-runtime/batch-g-integration/9799534e1a3a47b5958330f14ae16dc7'
$Output=Join-Path $Evidence "d3-current-core-stage-20261006-$Round.json"
if(Test-Path -LiteralPath $Output){throw 'Retain original current core evidence'}
$ReportHash=(Get-FileHash -LiteralPath $PSCommandPath).Hash
function Require([bool]$Condition,[string]$Message){if(-not $Condition){throw $Message}}
function Read-Json([string]$File){Get-Content -LiteralPath (Join-Path $Evidence $File) -Raw|ConvertFrom-Json}
$Cancellation='d3-batch-cancellation-20261006-r3'
$Simulator='d3-simulator-20261006-r7'
$Configuration='d3-simulator-config-20261006-r2'
$Cancel=Read-Json "$Cancellation/result.json"
foreach($Flag in @('passed','roles','scope','tenant','anonymous','atomicDenial','exactCancellation','audits','preservation','restoration','secrets')){Require ($Cancel.$Flag -eq $true) "Current cancellation missing: $Flag"}
Require ($Cancel.checks.Count -eq 149 -and $Cancel.matrix -eq 25 -and $Cancel.batches -eq 5) 'Cancellation scope differs'
$Simulation=Read-Json "$Simulator/result.json"
foreach($Flag in @('passed','calculation','baseline','validation','scope','tenant','browser','preservation','restoration','secrets')){Require ($Simulation.$Flag -eq $true) "Current simulator missing: $Flag"}
foreach($Result in @($Cancel,$Simulation)){Require (-not $Result.all18Complete -and -not $Result.globalComplete -and -not $Result.officialTaxPolicyVerified) 'Current scope changed'}
$Config=Read-Json "$Configuration/result.json"
Require ($Config.Passed -and $Config.Checks -eq 99 -and $Config.BackendRound -eq 'r108' -and $Config.ActualDatabase -and $Config.ActualService -and $Config.ConfigurationReadFixture -and $Config.ScratchCleaned -and $Config.InputChanges -eq 0 -and -not $Config.OfficialTaxPolicy -and -not $Config.Http) 'Current simulator configuration evidence incomplete'
$Current=@{}
foreach($Group in @("$Cancellation/inputs.json","$Simulator/inputs.json","$Configuration/inputs.json",'h3-portal-finance-adjacent-20261002-r121/inputs.json','h3-portal-finance-20261002-backend-r108-inputs.json','h3-portal-finance-20261002-frontend-r66-inputs.json')){
    foreach($Item in @(Read-Json $Group)){
        if(-not $Current.ContainsKey($Item.Path)){$Current[$Item.Path]=(Get-FileHash -LiteralPath (Join-Path $Root $Item.Path)).Hash}
        Require ($Current[$Item.Path] -eq $Item.Hash) 'Verified current input changed'
    }
}
$Binaries=@(Read-Json "$Configuration/binary-inputs.json")
foreach($Item in $Binaries){Require ((Get-FileHash -LiteralPath $Item.Path).Hash -eq $Item.Hash) 'Compiled dependency changed'}
$OriginalCount=0
foreach($Phase in @(@{Folder=$Cancellation;Count=6;Terminal='D3_CANCEL_RUN_EXIT=0'},@{Folder=$Simulator;Count=7;Terminal='D3_SIMULATOR_RUN_EXIT=0'},@{Folder=$Configuration;Count=3;Terminal='D3_SIMULATOR_CONFIG_RUN_EXIT=0'})){
    $Inputs=@(Read-Json "$($Phase.Folder)/inputs.json")
    $Originals=@(Get-ChildItem -LiteralPath (Join-Path $Evidence $Phase.Folder) -Filter 'original-*' -File)
    Require ($Originals.Count -eq $Phase.Count) 'Original execution file count differs'
    foreach($Original in $Originals){
        $Name=$Original.Name.Substring('original-'.Length)
        $Input=@($Inputs|Where-Object {(Split-Path -Leaf $_.Path) -eq $Name})
        Require ($Input.Count -eq 1 -and (Get-FileHash -LiteralPath $Original.FullName).Hash -eq $Input[0].Hash) 'Original executed file differs';$OriginalCount++
    }
    Require ((Get-Content -LiteralPath (Join-Path $Evidence "$($Phase.Folder)-launch.log") -Raw).Contains($Phase.Terminal)) 'Original execution terminal missing'
}
$Captcha=@()
foreach($Folder in @($Cancellation,$Simulator)){
    $Log=Get-Content -LiteralPath (Join-Path $Evidence "$Folder-launch.log") -Raw
    Require ($Log -match 'OWNED_CAPTCHA_RESTORED: original_limit=100; original_ttl=-1; counter_before=(\d+); counter_after=(\d+); counter_writes=0; database_unchanged=true; production_modified=false') 'Captcha restoration missing'
    $Captcha+=[pscustomobject]@{Folder=$Folder;Before=[int]$Matches[1];After=[int]$Matches[2]}
}
$Fixture=Read-Json "$Cancellation/fixture.json"
Require ($Fixture.matrix.Count -eq 25 -and @($Fixture.matrix|Where-Object allowed -eq $false).Count -eq 20 -and @($Fixture.matrix|Where-Object allowed -eq $true).Count -eq 5 -and @($Fixture.periods|Where-Object closed -eq $true).Count -eq 2) 'Current permission matrix or cleanup incomplete'
$SimFixture=Read-Json "$Simulator/fixture.json"
Require ($SimFixture.created.Count -eq 12 -and $SimFixture.restored.Count -eq 12 -and $SimFixture.roleGrantRestored) 'Simulator fixture cleanup incomplete'
foreach($Name in @('simulator-desktop.png','simulator-mobile.png','simulator-mobile-result.png')){Require ((Get-Item -LiteralPath (Join-Path $Evidence "$Simulator/$Name")).Length -gt 0) 'Current simulator browser evidence missing'}
$Previous=Read-Json 'd3-period-boundaries-stage-20261006-r1.json'
Require ($Previous.passed -and $Previous.backend -eq 'r108' -and $Previous.frontend -eq 'r66' -and $Previous.creationChecks -eq 32 -and $Previous.actualChecks -eq 109) 'Current period boundaries stage missing'
$Adjacent=Get-Content -LiteralPath (Join-Path $Evidence 'h3-portal-finance-adjacent-20261002-r121/summary.log') -Raw
Require ($Adjacent.Contains('H3_FINANCE_ADJACENT: files=6515; changed=0; exit=0; production_modified=false')) 'Preserved related regression incomplete'
$State=Get-Content -LiteralPath (Join-Path $Run 'state.json') -Raw|ConvertFrom-Json
Require ($State.status -eq 'RUNNING' -and [IO.Path]::GetFullPath($State.run) -eq $Run) 'Owned runtime required'
foreach($Entry in $State.processes){$Observed=Get-CimInstance Win32_Process -Filter "ProcessId=$($Entry.id)";Require ($Observed -and $Observed.CommandLine.Contains($Entry.marker)) 'Owned process mismatch'}
$Healthy=0
foreach($Service in $State.services){Require ((Invoke-RestMethod "http://127.0.0.1:$($Service.healthPort)/actuator/health" -TimeoutSec 5).status -eq 'UP') 'Unhealthy service';$Healthy++}
Require ((Get-FileHash -LiteralPath $PSCommandPath).Hash -eq $ReportHash) 'Stage report changed during execution'
$Summary=[pscustomobject]@{passed=$true;backend='r108';frontend='r66';cancellationChecks=$Cancel.checks.Count;simulatorChecks=$Simulation.checks.Count;configurationChecks=$Config.Checks;cancellationRequests=$Cancel.requests;simulatorRequests=$Simulation.requests;currentInputs=$Current.Count;binaryInputs=$Binaries.Count;originalScripts=$OriginalCount;relatedRound='r121';relatedInputs=6515;reportHash=$ReportHash;reportAddedAfterRelatedRound=$true;processes=$State.processes.Count;healthyServices=$Healthy;captcha=$Captcha;officialTaxPolicyVerified=$false;all18Complete=$false;globalComplete=$false;remaining=@('Other D3 phases with older product inputs','Official tax policy','D2 first ordinary request below500ms','Global35PRD681')}
$Summary|ConvertTo-Json -Depth 6|Set-Content -LiteralPath $Output -Encoding utf8NoBOM
"D3_CURRENT_CORE_STAGE: cancellation=$($Cancel.checks.Count); simulator=$($Simulation.checks.Count); configuration=$($Config.Checks); inputs=$($Current.Count); binaries=$($Binaries.Count); originals=$OriginalCount; healthy=$Healthy; global_complete=false"
