param([ValidatePattern('^r[1-9][0-9]*$')][string]$Round='r1',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$LiveRound='r6',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$AdjacentRound='r106')
$ErrorActionPreference='Stop'
. 'D:\CloudFlowPro\.cloudflow-runtime\use-data-drive.ps1'
$Root='D:\CloudFlowPro'
$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
$Run=Join-Path $Root '.cloudflow-runtime/batch-g-integration/9799534e1a3a47b5958330f14ae16dc7'
$Output=Join-Path $Evidence "d3-large-amounts-stage-20261006-$Round.json"
if(Test-Path -LiteralPath $Output){throw 'Retain original stage evidence'}
function Require([bool]$Condition,[string]$Message){if(-not $Condition){throw $Message}}
function Read-Json([string]$File){Get-Content -LiteralPath (Join-Path $Evidence $File) -Raw|ConvertFrom-Json}
$Folder="d3-large-amounts-20261006-$LiveRound"
$Result=Read-Json "$Folder/result.json"
foreach($Name in @('passed','storage','calculation','transport','browser','input','preservation','restoration','secrets')){Require ($Result.$Name -eq $true) "Missing money evidence: $Name"}
Require (-not $Result.all18Complete -and -not $Result.globalComplete -and -not $Result.officialTaxPolicyVerified) 'Scope boundary changed'
Require ($Result.findings.Count -eq 88 -and @($Result.findings|Where-Object passed -NE $true).Count -eq 0) 'Money observations incomplete'
Require (@($Result.checks|Where-Object {$_ -like 'original_sealed_salary_readable_*'}).Count -eq 5) 'Existing sealed salaries not checked'
$Fixture=Read-Json "$Folder/fixture.json"
Require ($Fixture.cases.Count -eq 3 -and $Fixture.tasks.Count -eq 3 -and @($Fixture.tasks|Where-Object terminal -NE SUCCESS).Count -eq 0) 'Owned payroll tasks incomplete'
foreach($Entry in $Fixture.restorations.psobject.Properties){Require ($Entry.Value -eq $true) 'Restoration failed'}
$Current=@{}
foreach($Group in @("$Folder/inputs.json","h3-portal-finance-adjacent-20261002-$AdjacentRound/inputs.json",'d3-money-codec-20261006-r2/inputs.json','h3-portal-finance-20261002-backend-r102-inputs.json','h3-portal-finance-20261002-frontend-r59-inputs.json')){
    foreach($Item in @(Read-Json $Group)){Require ((Get-FileHash -LiteralPath (Join-Path $Root $Item.Path)).Hash -eq $Item.Hash) 'Verified input changed';$Current[$Item.Path]=$Item.Hash}
}
$Inputs=@(Read-Json "$Folder/inputs.json")
$Originals=0
foreach($Name in @('run-d3-large-amounts.ps1','verify-d3-large-amounts.mjs','run-d3-large-amounts-allowance.mjs','d1-leave-runtime.mjs','form-browser-auth.mjs')){
    $Input=@($Inputs|Where-Object {(Split-Path -Leaf $_.Path) -eq $Name})
    Require ($Input.Count -eq 1 -and (Get-FileHash -LiteralPath (Join-Path $Evidence "$Folder/original-$Name")).Hash -eq $Input[0].Hash) 'Original executed script changed';$Originals++
}
foreach($Build in @('backend-r102','frontend-r59')){
    $Log=Get-Content -LiteralPath (Join-Path $Evidence "h3-portal-finance-20261002-$Build.log") -Raw
    Require ($Log.Contains('changed=0; exit=0')) 'Build incomplete'
}
$Codec=Get-Content (Join-Path $Evidence 'd3-money-codec-20261006-r2/checks.log') -Raw
Require ($Codec.Contains('HR_MONEY_PRECISION: checks=57; passed=true')) 'Money codec and digest checks incomplete'
$Launch=Get-Content (Join-Path $Evidence "d3-large-amounts-20261006-$LiveRound-launch.log") -Raw
Require ($Launch.Contains('D3_LARGE_RUN_EXIT=0') -and $Launch -match 'OWNED_CAPTCHA_RESTORED: original_limit=100; original_ttl=-1; counter_before=(\d+); counter_after=(\d+); counter_writes=0; database_unchanged=true; production_modified=false') 'Original terminal or restoration missing'
$CaptchaBefore=[int]$Matches[1];$CaptchaAfter=[int]$Matches[2]
$Adjacent=Get-Content (Join-Path $Evidence "h3-portal-finance-adjacent-20261002-$AdjacentRound/summary.log") -Raw
Require ($Adjacent -match 'H3_FINANCE_ADJACENT: files=(\d+); changed=0; exit=0; production_modified=false') 'Related regression incomplete'
$AdjacentInputs=[int]$Matches[1]
foreach($Failed in @('r1','r2','r3','r4')){Require (-not (Read-Json "d3-large-amounts-20261006-$Failed/result.json").passed) 'Earlier failure changed'}
Require (-not (Test-Path (Join-Path $Evidence 'd3-large-amounts-20261006-r5/result.json'))) 'Missing original result must not be invented'
$Recovery=Read-Json 'd3-large-recovery-20261006-r1/result.json'
Require ($Recovery.passed -and $Recovery.preservation -and $Recovery.restoration -and $Recovery.secrets) 'R5 recovery incomplete'
foreach($File in $Recovery.originalFiles){Require ((Get-FileHash (Join-Path $Evidence "d3-large-amounts-20261006-r5/$($File.name)")).Hash.ToLowerInvariant() -eq $File.hash) 'Original interrupted R5 evidence changed'}
$State=Get-Content (Join-Path $Run 'state.json') -Raw|ConvertFrom-Json
Require ($State.status -eq 'RUNNING' -and [IO.Path]::GetFullPath($State.run) -eq $Run) 'Owned runtime required'
foreach($Entry in $State.processes){$Observed=Get-CimInstance Win32_Process -Filter "ProcessId=$($Entry.id)";Require ($Observed -and $Observed.CommandLine.Contains($Entry.marker)) 'Owned process mismatch'}
$Healthy=0
foreach($Service in $State.services){Require ((Invoke-RestMethod "http://127.0.0.1:$($Service.healthPort)/actuator/health" -TimeoutSec 5).status -eq 'UP') 'Unhealthy service';$Healthy++}
$Summary=[pscustomobject]@{passed=$true;backend='r102';frontend='r59';checks=$Result.checks.Count;findings=$Result.findings.Count;requests=$Result.requests;tasks=$Fixture.tasks.Count;codecChecks=57;currentInputs=$Current.Count;adjacentInputs=$AdjacentInputs;originalScripts=$Originals;processes=$State.processes.Count;healthyServices=$Healthy;captchaBefore=$CaptchaBefore;captchaAfter=$CaptchaAfter;originalFailuresRetained=$true;interruptedR5RecoveryChecks=$Recovery.checks.Count;all18Complete=$false;globalComplete=$false;remaining=@('Large payroll payment PDF ESS and next-period reuse','All salary items deductions and tax boundary matrix','D3 all18 official policy and current unified','D3 status labels component names and internal row presentation','D2 first ordinary request below500ms','Global35PRD681')}
$Summary|ConvertTo-Json -Depth 5|Set-Content $Output -Encoding utf8NoBOM
"D3_LARGE_STAGE: checks=$($Result.checks.Count); findings=$($Result.findings.Count); requests=$($Result.requests); inputs=$($Current.Count); adjacent=$AdjacentInputs; originals=$Originals; processes=$($State.processes.Count); healthy=$Healthy; global_complete=false"
