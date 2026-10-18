param([ValidatePattern('^r[1-9][0-9]*$')][string]$Round='r1',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$LiveRound='r6',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$AdjacentRound='r114')
$ErrorActionPreference='Stop'
. 'D:\CloudFlowPro\.cloudflow-runtime\use-data-drive.ps1'
$Root='D:\CloudFlowPro'
$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
$Run=Join-Path $Root '.cloudflow-runtime/batch-g-integration/9799534e1a3a47b5958330f14ae16dc7'
$Output=Join-Path $Evidence "d3-simulator-stage-20261006-$Round.json"
if(Test-Path -LiteralPath $Output){throw 'Retain original simulator stage evidence'}
function Require([bool]$Condition,[string]$Message){if(-not $Condition){throw $Message}}
function Read-Json([string]$File){Get-Content -LiteralPath (Join-Path $Evidence $File) -Raw|ConvertFrom-Json}
$Folder="d3-simulator-20261006-$LiveRound"
$Result=Read-Json "$Folder/result.json"
foreach($Name in @('passed','calculation','baseline','validation','scope','tenant','browser','preservation','restoration','secrets')){Require ($Result.$Name -eq $true) "Missing simulator evidence: $Name"}
Require (-not $Result.all18Complete -and -not $Result.globalComplete -and -not $Result.officialTaxPolicyVerified) 'Stage scope changed'
$Fixture=Read-Json "$Folder/fixture.json"
Require ($Fixture.created.Count -eq 12 -and $Fixture.restored.Count -eq 12 -and $Fixture.roleGrantRestored) 'Temporary fixture restoration incomplete'
Require ($Fixture.mixed.gross -eq '10100.01' -and $Fixture.mixed.personalTax -eq '185.00' -and $Fixture.mixed.netSalary -eq '8865.01') 'Actual monthly calculation differs'
foreach($File in @('simulator-desktop.png','simulator-mobile.png','simulator-mobile-result.png')){Require (Test-Path -LiteralPath (Join-Path $Evidence "$Folder/$File")) 'Real browser evidence missing'}
$Requests=@(Read-Json "$Folder/requests.json")
Require ($Requests.Count -eq $Result.requests) 'Request accounting differs'
$Current=@{}
foreach($Group in @("$Folder/inputs.json","h3-portal-finance-adjacent-20261002-$AdjacentRound/inputs.json",'h3-portal-finance-20261002-backend-r106-inputs.json','h3-portal-finance-20261002-frontend-r64-inputs.json')){
    foreach($Item in @(Read-Json $Group)){$Actual=(Get-FileHash -LiteralPath (Join-Path $Root $Item.Path)).Hash;Require ($Actual -eq $Item.Hash) 'Verified input changed';$Current[$Item.Path]=$Actual}
}
$Inputs=@(Read-Json "$Folder/inputs.json")
$Originals=0
foreach($Name in @('run-d3-simulator.ps1','verify-d3-simulator.mjs','run-d3-simulator-allowance.mjs','d1-leave-runtime.mjs','d2-privacy-browser-auth.mjs','d3-simulator-fixtures.mjs','d3-simulator-role.mjs')){
    $Input=@($Inputs|Where-Object {(Split-Path -Leaf $_.Path) -eq $Name})
    Require ($Input.Count -eq 1 -and (Get-FileHash -LiteralPath (Join-Path $Evidence "$Folder/original-$Name")).Hash -eq $Input[0].Hash) 'Original executed script changed';$Originals++
}
foreach($Build in @('backend-r106','frontend-r64')){Require ((Get-Content (Join-Path $Evidence "h3-portal-finance-20261002-$Build.log") -Raw).Contains('changed=0; exit=0')) 'Exact build incomplete'}
$Launch=Get-Content (Join-Path $Evidence "d3-simulator-20261006-$LiveRound-launch.log") -Raw
Require ($Launch.Contains('D3_SIMULATOR_RUN_EXIT=0') -and $Launch -match 'OWNED_CAPTCHA_RESTORED: original_limit=100; original_ttl=-1; counter_before=(\d+); counter_after=(\d+); counter_writes=0; database_unchanged=true; production_modified=false') 'Original terminal or configuration restoration missing'
$CaptchaBefore=[int]$Matches[1];$CaptchaAfter=[int]$Matches[2]
$Prior1=Read-Json 'd3-simulator-20261006-r1/result.json'
$Prior2=Read-Json 'd3-simulator-20261006-r2/result.json'
$Prior3=Read-Json 'd3-simulator-20261006-r3/result.json'
$Prior4=Read-Json 'd3-simulator-20261006-r4/result.json'
$Recovery=Read-Json 'd3-simulator-recovery-20261006-r2/result.json'
Require (-not $Prior1.passed -and $Prior1.preservation -and -not $Prior1.restoration) 'Original first failure changed'
Require (-not $Prior2.passed -and $Prior2.preservation -and $Prior2.restoration) 'Original second failure changed'
Require (-not $Prior3.passed -and $Prior3.requests -eq 0 -and $Prior3.checks.Count -eq 0 -and (Read-Json 'd3-simulator-20261006-r3/fixture.json').created.Count -eq 0) 'Original startup failure changed'
Require (-not $Prior4.passed -and $Prior4.preservation -and $Prior4.restoration -and (Read-Json 'd3-simulator-20261006-r4/fixture.json').roleGrantRestored) 'Original login-window failure or restoration changed'
Require ($Recovery.passed -and $Recovery.restoration -and $Recovery.preservation -and $Recovery.secrets -and $Recovery.restored -eq 12) 'Independent first fixture recovery incomplete'
$Adjacent=Get-Content (Join-Path $Evidence "h3-portal-finance-adjacent-20261002-$AdjacentRound/summary.log") -Raw
Require ($Adjacent -match 'H3_FINANCE_ADJACENT: files=(\d+); changed=0; exit=0; production_modified=false') 'Related regression incomplete'
$AdjacentInputs=[int]$Matches[1]
$State=Get-Content (Join-Path $Run 'state.json') -Raw|ConvertFrom-Json
Require ($State.status -eq 'RUNNING' -and [IO.Path]::GetFullPath($State.run) -eq $Run) 'Owned runtime required'
foreach($Entry in $State.processes){$Observed=Get-CimInstance Win32_Process -Filter "ProcessId=$($Entry.id)";Require ($Observed -and $Observed.CommandLine.Contains($Entry.marker)) 'Owned process mismatch'}
$Healthy=0
foreach($Service in $State.services){Require ((Invoke-RestMethod "http://127.0.0.1:$($Service.healthPort)/actuator/health" -TimeoutSec 5).status -eq 'UP') 'Unhealthy service';$Healthy++}
$Summary=[pscustomobject]@{passed=$true;backend='r106';frontend='r64';liveRound=$LiveRound;checks=$Result.checks.Count;requests=$Result.requests;liveInputs=$Inputs.Count;currentInputs=$Current.Count;adjacentInputs=$AdjacentInputs;originalScripts=$Originals;processes=$State.processes.Count;healthyServices=$Healthy;captchaBefore=$CaptchaBefore;captchaAfter=$CaptchaAfter;recoveryChecks=$Recovery.checks.Count;recoveryRestored=$Recovery.restored;officialTaxPolicyVerified=$false;all18Complete=$false;globalComplete=$false;remaining=@('Remaining simulator configuration boundaries and D3 unified acceptance','Official tax policy','D2 first ordinary request below500ms','Global35PRD681')}
$Summary|ConvertTo-Json -Depth 5|Set-Content -LiteralPath $Output -Encoding utf8NoBOM
"D3_SIMULATOR_STAGE: checks=$($Result.checks.Count); requests=$($Result.requests); inputs=$($Current.Count); adjacent=$AdjacentInputs; originals=$Originals; processes=$($State.processes.Count); healthy=$Healthy; global_complete=false"
