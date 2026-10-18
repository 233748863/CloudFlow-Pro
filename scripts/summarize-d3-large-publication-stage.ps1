param([ValidatePattern('^r[1-9][0-9]*$')][string]$Round='r1',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$LiveRound='r2',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$AdjacentRound='r107')
$ErrorActionPreference='Stop'
. 'D:\CloudFlowPro\.cloudflow-runtime\use-data-drive.ps1'
$Root='D:\CloudFlowPro'
$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
$Run=Join-Path $Root '.cloudflow-runtime/batch-g-integration/9799534e1a3a47b5958330f14ae16dc7'
$Output=Join-Path $Evidence "d3-large-publication-stage-20261006-$Round.json"
if(Test-Path -LiteralPath $Output){throw 'Retain original stage evidence'}
function Require([bool]$Condition,[string]$Message){if(-not $Condition){throw $Message}}
function Read-Json([string]$File){Get-Content -LiteralPath (Join-Path $Evidence $File) -Raw|ConvertFrom-Json}
$Folder="d3-large-publication-20261006-$LiveRound"
$Result=Read-Json "$Folder/result.json"
foreach($Name in @('passed','storage','calculation','transport','browser','input','publication','pdf','ess','nextPeriod','presentation','compensationUi','preservation','restoration','secrets')){Require ($Result.$Name -eq $true) "Missing publication evidence: $Name"}
Require (-not $Result.all18Complete -and -not $Result.globalComplete -and -not $Result.officialTaxPolicyVerified) 'Scope boundary changed'
$Fixture=Read-Json "$Folder/fixture.json"
Require ($Fixture.cases.Count -eq 3 -and $Fixture.tasks.Count -eq 4 -and $Fixture.published.Count -eq 4 -and $Fixture.pdfs.Count -eq 4 -and $Fixture.bindingRestored) 'Actual publication or binding recovery incomplete'
Require (@($Fixture.tasks|Where-Object terminal -NE SUCCESS).Count -eq 0) 'Original task not successful'
Require ($Fixture.nextPayroll.tax -eq '9007199254741.00' -and $Fixture.nextPayroll.net -eq '81064793292668.93') 'Actual next-period amount differs'
Require ($Result.checks -contains 'compensation_failed_request_keeps_input') 'Failed request input retention unverified'
foreach($Entry in $Fixture.restorations.psobject.Properties){Require ($Entry.Value -eq $true) 'Restoration failed'}
$Current=@{}
foreach($Group in @("$Folder/inputs.json","h3-portal-finance-adjacent-20261002-$AdjacentRound/inputs.json",'d3-money-codec-20261006-r2/inputs.json','h3-portal-finance-20261002-backend-r102-inputs.json','h3-portal-finance-20261002-frontend-r61-inputs.json')){
    foreach($Item in @(Read-Json $Group)){Require ((Get-FileHash -LiteralPath (Join-Path $Root $Item.Path)).Hash -eq $Item.Hash) 'Verified input changed';$Current[$Item.Path]=$Item.Hash}
}
$Inputs=@(Read-Json "$Folder/inputs.json")
$Originals=0
foreach($Name in @('run-d3-large-publication.ps1','verify-d3-large-amounts.mjs','run-d3-large-publication-allowance.mjs','d1-leave-runtime.mjs','form-browser-auth.mjs')){
    $Input=@($Inputs|Where-Object {(Split-Path -Leaf $_.Path) -eq $Name})
    Require ($Input.Count -eq 1 -and (Get-FileHash -LiteralPath (Join-Path $Evidence "$Folder/original-$Name")).Hash -eq $Input[0].Hash) 'Original executed script changed';$Originals++
}
$StageCopies=@()
foreach($Name in @('scripts/runtime-checks/d3-large-publication.mjs','scripts/runtime-checks/D3SalaryPdfProbe.java')){
    $Input=@($Inputs|Where-Object Path -EQ $Name);Require ($Input.Count -eq 1) 'Executed helper input absent'
    $Copy=Join-Path $Evidence ("d3-large-publication-stage-20261006-$Round-verified-"+(Split-Path -Leaf $Name))
    if(Test-Path $Copy){throw 'Retain original verified helper copy'}
    [IO.File]::Copy((Join-Path $Root $Name),$Copy,$false)
    Require ((Get-FileHash $Copy).Hash -eq $Input[0].Hash) 'Verified helper copy differs'
    $StageCopies+=@{path=$Copy;sha256=$Input[0].Hash}
}
foreach($Build in @('backend-r102','frontend-r61')){Require ((Get-Content (Join-Path $Evidence "h3-portal-finance-20261002-$Build.log") -Raw).Contains('changed=0; exit=0')) 'Build incomplete'}
$Launch=Get-Content (Join-Path $Evidence "d3-large-publication-20261006-$LiveRound-launch.log") -Raw
Require ($Launch.Contains('D3_LARGE_PUBLICATION_RUN_EXIT=0') -and $Launch -match 'OWNED_CAPTCHA_RESTORED: original_limit=100; original_ttl=-1; counter_before=(\d+); counter_after=(\d+); counter_writes=0; database_unchanged=true; production_modified=false') 'Original terminal or configuration restoration missing'
$CaptchaBefore=[int]$Matches[1];$CaptchaAfter=[int]$Matches[2]
$Adjacent=Get-Content (Join-Path $Evidence "h3-portal-finance-adjacent-20261002-$AdjacentRound/summary.log") -Raw
Require ($Adjacent -match 'H3_FINANCE_ADJACENT: files=(\d+); changed=0; exit=0; production_modified=false') 'Related regression incomplete'
$AdjacentInputs=[int]$Matches[1]
$Failed=Read-Json 'd3-large-publication-20261006-r1/result.json'
Require (-not $Failed.passed -and $Failed.preservation -and $Failed.restoration -and $Failed.secrets) 'Original first failure missing'
$Earlier=Read-Json 'd3-large-publication-20261006-r1/fixture.json'
Require ($Earlier.published.Count -eq 3 -and $Earlier.pdfs.Count -eq 3) 'Original actual earlier payments missing'
$Foundation=Read-Json 'd3-large-amounts-stage-20261006-r1.json'
Require ($Foundation.passed -and $Foundation.backend -eq 'r102' -and $Foundation.frontend -eq 'r59') 'Original foundation version missing'
$State=Get-Content (Join-Path $Run 'state.json') -Raw|ConvertFrom-Json
Require ($State.status -eq 'RUNNING' -and [IO.Path]::GetFullPath($State.run) -eq $Run) 'Owned runtime required'
foreach($Entry in $State.processes){$Observed=Get-CimInstance Win32_Process -Filter "ProcessId=$($Entry.id)";Require ($Observed -and $Observed.CommandLine.Contains($Entry.marker)) 'Owned process mismatch'}
$Healthy=0
foreach($Service in $State.services){Require ((Invoke-RestMethod "http://127.0.0.1:$($Service.healthPort)/actuator/health" -TimeoutSec 5).status -eq 'UP') 'Unhealthy service';$Healthy++}
$Summary=[pscustomobject]@{passed=$true;backend='r102';frontend='r61';checks=$Result.checks.Count;findings=$Result.findings.Count;requests=$Result.requests;tasks=$Fixture.tasks.Count;paid=$Fixture.published.Count;pdfs=$Fixture.pdfs.Count;currentInputs=$Current.Count;adjacentInputs=$AdjacentInputs;originalScripts=$Originals;verifiedHelperCopies=$StageCopies;processes=$State.processes.Count;healthyServices=$Healthy;captchaBefore=$CaptchaBefore;captchaAfter=$CaptchaAfter;earlierActualPaymentsPreserved=$Earlier.published;all18Complete=$false;globalComplete=$false;remaining=@('All salary items deductions and tax boundary matrix','D3 all18 official policy and current unified','D2 first ordinary request below500ms','Global35PRD681')}
$Summary|ConvertTo-Json -Depth 5|Set-Content $Output -Encoding utf8NoBOM
"D3_LARGE_PUBLICATION_STAGE: checks=$($Result.checks.Count); findings=$($Result.findings.Count); requests=$($Result.requests); paid=$($Fixture.published.Count); pdfs=$($Fixture.pdfs.Count); inputs=$($Current.Count); adjacent=$AdjacentInputs; originals=$Originals; processes=$($State.processes.Count); healthy=$Healthy; global_complete=false"
