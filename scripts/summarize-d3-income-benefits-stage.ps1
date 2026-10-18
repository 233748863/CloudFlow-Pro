param([ValidatePattern('^r[1-9][0-9]*$')][string]$Round='r1',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$LiveRound='r3',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$AdjacentRound='r110')
$ErrorActionPreference='Stop'
. 'D:\CloudFlowPro\.cloudflow-runtime\use-data-drive.ps1'
$Root='D:\CloudFlowPro'
$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
$Run=Join-Path $Root '.cloudflow-runtime/batch-g-integration/9799534e1a3a47b5958330f14ae16dc7'
$Output=Join-Path $Evidence "d3-income-benefits-stage-20261006-$Round.json"
if(Test-Path -LiteralPath $Output){throw 'Retain original income and benefit evidence'}
function Require([bool]$Condition,[string]$Message){if(-not $Condition){throw $Message}}
function Read-Json([string]$File){Get-Content -LiteralPath (Join-Path $Evidence $File) -Raw|ConvertFrom-Json}
$Folder="d3-income-benefits-20261006-$LiveRound"
$Result=Read-Json "$Folder/result.json"
foreach($Name in @('passed','mixedSources','sourceFilters','benefitGeneration','snapshots','browser','preservation','restoration','secrets')){Require ($Result.$Name -eq $true) "Missing income evidence: $Name"}
Require (-not $Result.all18Complete -and -not $Result.globalComplete -and -not $Result.officialTaxPolicyVerified) 'Stage scope changed'
Require ($Result.cases -eq 3 -and $Result.tasks -eq 1) 'Actual sample count differs'
$Fixture=Read-Json "$Folder/fixture.json"
Require ($Fixture.cases.Count -eq 3 -and $Fixture.tasks.Count -eq 1 -and $Fixture.tasks[0].terminal -eq 'SUCCESS') 'Owned task incomplete'
foreach($Name in @('batches','syntheticTax','originalBusiness')){Require ($Fixture.restorations.$Name -eq $true) 'Restoration incomplete'}
foreach($Sample in $Fixture.cases){
    Require ($Sample.payments.Count -eq 2 -and @($Sample.changes|Where-Object included -EQ $true).Count -eq 2) 'Expected source rows missing'
    Require (Test-Path -LiteralPath (Join-Path $Evidence "$Folder/$($Sample.name)-salary-page.png")) 'Actual page evidence missing'
}
$Requests=@(Read-Json "$Folder/requests.json")
Require ($Requests.Count -eq $Result.requests) 'Request accounting differs'
$Current=@{}
foreach($Group in @("$Folder/inputs.json","h3-portal-finance-adjacent-20261002-$AdjacentRound/inputs.json",'h3-portal-finance-20261002-backend-r103-inputs.json','h3-portal-finance-20261002-frontend-r62-inputs.json')){
    foreach($Item in @(Read-Json $Group)){$Actual=(Get-FileHash -LiteralPath (Join-Path $Root $Item.Path)).Hash;Require ($Actual -eq $Item.Hash) 'Verified input changed';$Current[$Item.Path]=$Actual}
}
$Inputs=@(Read-Json "$Folder/inputs.json")
$Originals=0
foreach($Name in @('run-d3-income-benefits.ps1','verify-d3-income-benefits.mjs','run-d3-income-benefits-allowance.mjs','d1-leave-runtime.mjs','form-browser-auth.mjs')){
    $Input=@($Inputs|Where-Object {(Split-Path -Leaf $_.Path) -eq $Name})
    Require ($Input.Count -eq 1 -and (Get-FileHash -LiteralPath (Join-Path $Evidence "$Folder/original-$Name")).Hash -eq $Input[0].Hash) 'Original executed script changed';$Originals++
}
foreach($Build in @('backend-r103','frontend-r62')){Require ((Get-Content (Join-Path $Evidence "h3-portal-finance-20261002-$Build.log") -Raw).Contains('changed=0; exit=0')) 'Prior exact build incomplete'}
$Launch=Get-Content (Join-Path $Evidence "d3-income-benefits-20261006-$LiveRound-launch.log") -Raw
Require ($Launch.Contains('D3_INCOME_BENEFITS_RUN_EXIT=0') -and $Launch -match 'OWNED_CAPTCHA_RESTORED: original_limit=100; original_ttl=-1; counter_before=(\d+); counter_after=(\d+); counter_writes=0; database_unchanged=true; production_modified=false') 'Original terminal or configuration restoration missing'
$CaptchaBefore=[int]$Matches[1];$CaptchaAfter=[int]$Matches[2]
$Prior=@()
foreach($PriorRound in @('r1','r2')){
    $Previous=Read-Json "d3-income-benefits-20261006-$PriorRound/result.json"
    Require (-not $Previous.passed -and $Previous.preservation -eq $true -and $Previous.restoration -eq $true -and $Previous.secrets -eq $true) 'Prior result or restoration changed'
    $Prior+=@{round=$PriorRound;checks=$Previous.checks.Count;requests=$Previous.requests;failure=$Previous.failure}
}
$Adjacent=Get-Content (Join-Path $Evidence "h3-portal-finance-adjacent-20261002-$AdjacentRound/summary.log") -Raw
Require ($Adjacent -match 'H3_FINANCE_ADJACENT: files=(\d+); changed=0; exit=0; production_modified=false') 'Related regression incomplete'
$AdjacentInputs=[int]$Matches[1]
$State=Get-Content (Join-Path $Run 'state.json') -Raw|ConvertFrom-Json
Require ($State.status -eq 'RUNNING' -and [IO.Path]::GetFullPath($State.run) -eq $Run) 'Owned runtime required'
foreach($Entry in $State.processes){$Observed=Get-CimInstance Win32_Process -Filter "ProcessId=$($Entry.id)";Require ($Observed -and $Observed.CommandLine.Contains($Entry.marker)) 'Owned process mismatch'}
$Healthy=0
foreach($Service in $State.services){Require ((Invoke-RestMethod "http://127.0.0.1:$($Service.healthPort)/actuator/health" -TimeoutSec 5).status -eq 'UP') 'Unhealthy service';$Healthy++}
$Summary=[pscustomobject]@{passed=$true;backend='r103';frontend='r62';liveRound=$LiveRound;checks=$Result.checks.Count;requests=$Result.requests;tasks=$Fixture.tasks.Count;cases=$Fixture.cases.Count;liveInputs=$Inputs.Count;currentInputs=$Current.Count;adjacentInputs=$AdjacentInputs;originalScripts=$Originals;originalBusinessTables=@($Fixture.originalDigests.psobject.Properties).Count;processes=$State.processes.Count;healthyServices=$Healthy;captchaBefore=$CaptchaBefore;captchaAfter=$CaptchaAfter;prior=$Prior;officialTaxPolicyVerified=$false;all18Complete=$false;globalComplete=$false;remaining=@('Approved overtime, referral, encashment and loan source combinations','Official tax policy and D3 unified acceptance','D2 first ordinary request below500ms','Global35PRD681')}
$Summary|ConvertTo-Json -Depth 5|Set-Content -LiteralPath $Output -Encoding utf8NoBOM
"D3_INCOME_BENEFITS_STAGE: cases=$($Result.cases); checks=$($Result.checks.Count); requests=$($Result.requests); inputs=$($Current.Count); adjacent=$AdjacentInputs; originals=$Originals; processes=$($State.processes.Count); healthy=$Healthy; global_complete=false"
