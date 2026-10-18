param([ValidatePattern('^r[1-9][0-9]*$')][string]$Round='r1',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$LiveRound='r7',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$AdjacentRound='r111',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$RestorationRound='r2')
$ErrorActionPreference='Stop'
. 'D:\CloudFlowPro\.cloudflow-runtime\use-data-drive.ps1'
$Root='D:\CloudFlowPro'
$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
$Run=Join-Path $Root '.cloudflow-runtime/batch-g-integration/9799534e1a3a47b5958330f14ae16dc7'
$Output=Join-Path $Evidence "d3-funded-encashment-stage-20261006-$Round.json"
if(Test-Path -LiteralPath $Output){throw 'Retain original funded loan stage evidence'}
function Require([bool]$Condition,[string]$Message){if(-not $Condition){throw $Message}}
function Read-Json([string]$File){Get-Content -LiteralPath (Join-Path $Evidence $File) -Raw|ConvertFrom-Json}
$Folder="d3-funded-encashment-20261006-$LiveRound"
$Result=Read-Json "$Folder/result.json"
foreach($Name in @('passed','funding','encashment','mixedPayroll','cancellation','payment','duplicates','browser','preservation','restoration','secrets')){Require ($Result.$Name -eq $true) "Missing funded loan evidence: $Name"}
Require (-not $Result.all18Complete -and -not $Result.globalComplete -and -not $Result.officialTaxPolicyVerified) 'Stage scope changed'
$Fixture=Read-Json "$Folder/fixture.json"
Require ($Result.tasks -eq 2 -and $Fixture.tasks.Count -eq 2 -and $Fixture.batches.Count -eq 2) 'Actual task count differs'
foreach($Task in $Fixture.tasks){Require ($Task.terminal -eq 'SUCCESS') 'Original task incomplete'}
foreach($Name in @('batches','loanWorkflow','binding','syntheticTax','advanceRules','advanceConfig','department','originalBusiness')){Require ($Fixture.restorations.$Name -eq $true) "Restoration incomplete: $Name"}
Require (Test-Path -LiteralPath (Join-Path $Evidence "$Folder/paid-salary-page.png")) 'Actual page evidence missing'
$Requests=@(Read-Json "$Folder/requests.json")
Require ($Requests.Count -eq $Result.requests -and $Result.checks.Count -eq 213) 'Request or check accounting differs'
$Current=@{}
foreach($Group in @("$Folder/inputs.json","h3-portal-finance-adjacent-20261002-$AdjacentRound/inputs.json",'h3-portal-finance-20261002-backend-r104-inputs.json','h3-portal-finance-20261002-frontend-r62-inputs.json')){
    foreach($Item in @(Read-Json $Group)){$Actual=(Get-FileHash -LiteralPath (Join-Path $Root $Item.Path)).Hash;Require ($Actual -eq $Item.Hash) 'Verified input changed';$Current[$Item.Path]=$Actual}
}
$Inputs=@(Read-Json "$Folder/inputs.json")
Require ($Inputs.Count -eq 5343) 'Live input count differs'
$Originals=0
foreach($Name in @('run-d3-funded-encashment.ps1','verify-d3-funded-encashment.mjs','run-d3-funded-encashment-allowance.mjs','d1-leave-runtime.mjs','form-browser-auth.mjs')){
    $Input=@($Inputs|Where-Object {(Split-Path -Leaf $_.Path) -eq $Name})
    Require ($Input.Count -eq 1 -and (Get-FileHash -LiteralPath (Join-Path $Evidence "$Folder/original-$Name")).Hash -eq $Input[0].Hash) 'Original executed script changed';$Originals++
}
foreach($Build in @('backend-r104','frontend-r62')){Require ((Get-Content (Join-Path $Evidence "h3-portal-finance-20261002-$Build.log") -Raw).Contains('changed=0; exit=0')) 'Prior exact build incomplete'}
Require ((Get-Content (Join-Path $Evidence 'd3-funded-payment-timestamp-checks-20261006-r1.log') -Raw).Contains('HR_ADVANCE_PAYMENT_TIMESTAMP_CHECKS: passed=true; checks=25')) 'Timestamp DTO checks missing'
$Launch=Get-Content (Join-Path $Evidence "d3-funded-encashment-20261006-$LiveRound-launch.log") -Raw
Require ($Launch.Contains('D3_FUNDED_ENCASHMENT_RUN_EXIT=0') -and $Launch -match 'OWNED_CAPTCHA_RESTORED: original_limit=100; original_ttl=-1; counter_before=(\d+); counter_after=(\d+); counter_writes=0; database_unchanged=true; production_modified=false') 'Original terminal or configuration restoration missing'
$CaptchaBefore=[int]$Matches[1];$CaptchaAfter=[int]$Matches[2]
$Prior=@()
foreach($PriorRound in @('r1','r2','r3','r4','r5','r6')){
    $Previous=Read-Json "d3-funded-encashment-20261006-$PriorRound/result.json"
    Require (-not $Previous.passed -and $Previous.secrets -eq $true) 'Prior failure or secret scan changed'
    if($PriorRound -in @('r3','r6')){Require ($Previous.preservation -eq $false -and $Previous.restoration -eq $false) 'Original failed preservation must remain failed'}
    else {Require ($Previous.preservation -eq $true -and $Previous.restoration -eq $true) 'Prior restoration changed'}
    $Prior+=@{round=$PriorRound;checks=$Previous.checks.Count;requests=$Previous.requests;preservation=$Previous.preservation;restoration=$Previous.restoration;failure=$Previous.failure}
}
$Department=Read-Json 'd3-funded-department-restoration-20261006-r1.json'
foreach($Name in @('passed','failedEvidenceRetained','originalDepartmentProjectionRestored','otherFieldsUnchanged','versionUnchanged')){Require ($Department.$Name -eq $true) 'Department recovery incomplete'}
$RecoveryBaseline=Read-Json 'd3-funded-payment-recovery-20261006-r1.json'
Require ($RecoveryBaseline.passed -eq $false -and $RecoveryBaseline.httpStatus -eq 400 -and $RecoveryBaseline.fundedAudits -eq 0) 'Original payment failure changed'
foreach($RecoveryRound in @('r2','r3')){
    $Recovery=Read-Json "d3-funded-payment-recovery-20261006-$RecoveryRound.json"
    foreach($Name in @('passed','originalPaymentUnchanged','eventUnchanged','originalFailureRetained')){Require ($Recovery.$Name -eq $true) 'Original payment recovery incomplete'}
    Require ($Recovery.httpStatus -eq 200 -and $Recovery.fundedAudits -eq 1 -and $Recovery.originalEventDigest -eq $RecoveryBaseline.originalEventDigest -and $Recovery.after.outstanding -eq '100.01') 'Original payment amount or identity differs'
}
$Restoration=Read-Json "d3-funded-prior-restoration-20261006-$RestorationRound.json"
Require ($Restoration.passed -eq $true -and $Restoration.readOnly -eq $true -and $Restoration.originalPaymentEventUnchanged -eq $true -and $Restoration.fundedAudits -eq 1 -and $Restoration.reports.Count -eq 2) 'Independent prior preservation incomplete'
foreach($Report in $Restoration.reports){Require ($Report.tables -eq 21 -and $Report.originalBusinessFieldsPreserved -eq $true -and $Report.periodRevisionRetained -eq $true -and $Report.originalFailureRetained -eq $true) 'Prior business fields differ'}
$Adjacent=Get-Content (Join-Path $Evidence "h3-portal-finance-adjacent-20261002-$AdjacentRound/summary.log") -Raw
Require ($Adjacent -match 'H3_FINANCE_ADJACENT: files=(\d+); changed=0; exit=0; production_modified=false') 'Related regression incomplete'
$AdjacentInputs=[int]$Matches[1]
$State=Get-Content (Join-Path $Run 'state.json') -Raw|ConvertFrom-Json
Require ($State.status -eq 'RUNNING' -and [IO.Path]::GetFullPath($State.run) -eq $Run) 'Owned runtime required'
foreach($Entry in $State.processes){$Observed=Get-CimInstance Win32_Process -Filter "ProcessId=$($Entry.id)";Require ($Observed -and $Observed.CommandLine.Contains($Entry.marker)) 'Owned process mismatch'}
$Healthy=0
foreach($Service in $State.services){Require ((Invoke-RestMethod "http://127.0.0.1:$($Service.healthPort)/actuator/health" -TimeoutSec 5).status -eq 'UP') 'Unhealthy service';$Healthy++}
$Summary=[pscustomobject]@{passed=$true;backend='r104';frontend='r62';liveRound=$LiveRound;checks=$Result.checks.Count;requests=$Result.requests;tasks=$Fixture.tasks.Count;liveInputs=$Inputs.Count;currentInputs=$Current.Count;adjacentInputs=$AdjacentInputs;originalScripts=$Originals;timestampChecks=25;originalBusinessTables=@($Fixture.originalDigests.psobject.Properties).Count;independentRestoration=$RestorationRound;processes=$State.processes.Count;healthyServices=$Healthy;captchaBefore=$CaptchaBefore;captchaAfter=$CaptchaAfter;prior=$Prior;originalPaymentRestored=$true;originalPaymentEventUnchanged=$true;fundedAudits=1;officialTaxPolicyVerified=$false;all18Complete=$false;globalComplete=$false;remaining=@('Actual approved overtime and referral source combinations','Official tax policy and D3 unified acceptance','D2 first ordinary request below500ms','Global35PRD681')}
$Summary|ConvertTo-Json -Depth 5|Set-Content -LiteralPath $Output -Encoding utf8NoBOM
"D3_FUNDED_ENCASHMENT_STAGE: checks=$($Result.checks.Count); requests=$($Result.requests); inputs=$($Current.Count); adjacent=$AdjacentInputs; originals=$Originals; processes=$($State.processes.Count); healthy=$Healthy; global_complete=false"
