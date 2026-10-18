param([ValidatePattern('^r[1-9][0-9]*$')][string]$Round='r1',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$LiveRound='r2',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$AdjacentRound='r117')
$ErrorActionPreference='Stop'
. 'D:\CloudFlowPro\.cloudflow-runtime\use-data-drive.ps1'
$Root='D:\CloudFlowPro'
$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
$Run=Join-Path $Root '.cloudflow-runtime/batch-g-integration/9799534e1a3a47b5958330f14ae16dc7'
$Output=Join-Path $Evidence "d3-batch-cancellation-stage-20261006-$Round.json"
if(Test-Path -LiteralPath $Output){throw 'Retain original cancellation stage evidence'}
function Require([bool]$Condition,[string]$Message){if(-not $Condition){throw $Message}}
function Read-Json([string]$File){Get-Content -LiteralPath (Join-Path $Evidence $File) -Raw|ConvertFrom-Json}
$Folder="d3-batch-cancellation-20261006-$LiveRound"
$Result=Read-Json "$Folder/result.json"
foreach($Name in @('passed','roles','scope','tenant','anonymous','atomicDenial','exactCancellation','audits','preservation','restoration','secrets')){Require ($Result.$Name -eq $true) "Missing cancellation evidence: $Name"}
Require (-not $Result.all18Complete -and -not $Result.globalComplete -and -not $Result.officialTaxPolicyVerified) 'Stage scope changed'
$Fixture=Read-Json "$Folder/fixture.json"
Require ($Fixture.batches.Count -eq 5 -and $Fixture.periods.Count -eq 2 -and $Fixture.matrix.Count -eq 25 -and $Result.matrix -eq 25 -and $Fixture.audits.Count -eq 5) 'Actual matrix accounting differs'
Require (@($Fixture.matrix|Where-Object {-not $_.allowed}).Count -eq 20 -and @($Fixture.matrix|Where-Object {$_.allowed}).Count -eq 5) 'Allow/deny matrix incomplete'
foreach($Batch in $Fixture.batches){Require ($Fixture.restorations.($Batch.id) -eq $true -and $Result.checks.Contains("owned_batch_restored_$($Batch.id)")) 'Owned batch restoration missing'}
foreach($Period in $Fixture.periods){Require ($Period.closed -eq $true -and $Result.checks.Contains("owned_period_closed_$($Period.id)")) 'Owned period close missing'}
Require (@($Fixture.original.PSObject.Properties).Count -eq 15 -and @($Fixture.bounds.PSObject.Properties).Count -eq 14 -and $Result.checks.Contains('original_business_and_grants_unchanged')) 'Original financial data or grants protection missing'
$Requests=@(Read-Json "$Folder/requests.json")
Require ($Requests.Count -eq $Result.requests) 'Request accounting differs'
$Current=@{}
foreach($Group in @("$Folder/inputs.json","h3-portal-finance-adjacent-20261002-$AdjacentRound/inputs.json",'h3-portal-finance-20261002-backend-r106-inputs.json','h3-portal-finance-20261002-frontend-r66-inputs.json')){
    foreach($Item in @(Read-Json $Group)){
        if(-not $Current.ContainsKey($Item.Path)){$Current[$Item.Path]=(Get-FileHash -LiteralPath (Join-Path $Root $Item.Path)).Hash}
        Require ($Current[$Item.Path] -eq $Item.Hash) 'Verified source input changed'
    }
}
$Inputs=@(Read-Json "$Folder/inputs.json")
$Originals=0
foreach($Name in @('run-d3-batch-cancellation.ps1','verify-d3-batch-cancellation.mjs','run-d3-batch-cancellation-allowance.mjs','d1-leave-runtime.mjs','d2-privacy-browser-auth.mjs','form-browser-auth.mjs')){
    $Input=@($Inputs|Where-Object {(Split-Path -Leaf $_.Path) -eq $Name})
    Require ($Input.Count -eq 1 -and (Get-FileHash -LiteralPath (Join-Path $Evidence "$Folder/original-$Name")).Hash -eq $Input[0].Hash) 'Original executed script changed';$Originals++
}
$OldInputs=@(Read-Json 'h3-portal-finance-adjacent-20261002-r116/inputs.json')
foreach($Name in @('form-browser-auth.mjs','d2-privacy-browser-auth.mjs')){
    $Original=Join-Path $Evidence "d3-cancel-original-$Name"
    $OriginalInput=@($OldInputs|Where-Object {(Split-Path -Leaf $_.Path) -eq $Name})
    Require ($OriginalInput.Count -eq 1 -and (Get-FileHash -LiteralPath $Original).Hash -eq $OriginalInput[0].Hash) 'Previous browser authentication helper original differs'
    $Before=[IO.File]::ReadAllText($Original).Replace("`r`n","`n")
    $PreviousFlag=if($Name -eq 'form-browser-auth.mjs'){'--d3-approved-income'}else{'--d3-simulator'}
    $Expected=$Before.Replace("process.argv.includes('$PreviousFlag'))","process.argv.includes('$PreviousFlag') || process.argv.includes('--d3-batch-cancellation'))")
    Require ($Expected -eq [IO.File]::ReadAllText((Join-Path $Root "scripts/runtime-checks/$Name")).Replace("`r`n","`n")) 'Authentication helper change exceeds the explicit owned cancellation mode'
}
$Prior=Read-Json 'd3-batch-filters-stage-20261006-r2.json'
Require ($Prior.passed -and $Prior.checks -eq 102 -and $Prior.frontend -eq 'r66' -and -not $Prior.globalComplete) 'Previous batch filters stage missing'
$Failed=Read-Json 'd3-batch-cancellation-20261006-r1/result.json'
$FailedFixture=Read-Json 'd3-batch-cancellation-20261006-r1/fixture.json'
Require (-not $Failed.passed -and $Failed.preservation -and $Failed.restoration -and $Failed.matrix -eq 20 -and $Failed.failure -eq 'Owned D1 read failed') 'Original verifier schema failure changed'
Require ($FailedFixture.batches.Count -eq 5 -and $FailedFixture.periods.Count -eq 2 -and @($FailedFixture.periods|Where-Object {-not $_.closed}).Count -eq 0) 'Original failed round recovery missing'
foreach($Batch in $FailedFixture.batches){Require ($FailedFixture.restorations.($Batch.id) -eq $true) 'Original failed round batch not restored'}
$Launch=Get-Content (Join-Path $Evidence "d3-batch-cancellation-20261006-$LiveRound-launch.log") -Raw
Require ($Launch.Contains('D3_CANCEL_RUN_EXIT=0') -and $Launch -match 'OWNED_CAPTCHA_RESTORED: original_limit=100; original_ttl=-1; counter_before=(\d+); counter_after=(\d+); counter_writes=0; database_unchanged=true; production_modified=false') 'Original terminal or configuration restoration missing'
$CaptchaBefore=[int]$Matches[1];$CaptchaAfter=[int]$Matches[2]
$Adjacent=Get-Content (Join-Path $Evidence "h3-portal-finance-adjacent-20261002-$AdjacentRound/summary.log") -Raw
Require ($Adjacent -match 'H3_FINANCE_ADJACENT: files=(\d+); changed=0; exit=0; production_modified=false') 'Related regression incomplete'
$AdjacentInputs=[int]$Matches[1]
$State=Get-Content (Join-Path $Run 'state.json') -Raw|ConvertFrom-Json
Require ($State.status -eq 'RUNNING' -and [IO.Path]::GetFullPath($State.run) -eq $Run) 'Owned runtime required'
foreach($Entry in $State.processes){$Observed=Get-CimInstance Win32_Process -Filter "ProcessId=$($Entry.id)";Require ($Observed -and $Observed.CommandLine.Contains($Entry.marker)) 'Owned process mismatch'}
$Healthy=0
foreach($Service in $State.services){Require ((Invoke-RestMethod "http://127.0.0.1:$($Service.healthPort)/actuator/health" -TimeoutSec 5).status -eq 'UP') 'Unhealthy service';$Healthy++}
$Summary=[pscustomobject]@{passed=$true;backend='r106';frontend='r66';liveRound=$LiveRound;checks=$Result.checks.Count;requests=$Result.requests;matrix=$Result.matrix;denials=20;allowed=5;originalBusinessTables=14;liveInputs=$Inputs.Count;currentInputs=$Current.Count;adjacentInputs=$AdjacentInputs;originalScripts=$Originals;reviewedAuthenticationChanges=2;processes=$State.processes.Count;healthyServices=$Healthy;captchaBefore=$CaptchaBefore;captchaAfter=$CaptchaAfter;officialTaxPolicyVerified=$false;all18Complete=$false;globalComplete=$false;remaining=@('Internal execution reentry','Concurrent creation wins against closing','Pending correction and period closing','Official tax policy','D2 first ordinary request below500ms','Global35PRD681')}
$Summary|ConvertTo-Json -Depth 5|Set-Content -LiteralPath $Output -Encoding utf8NoBOM
"D3_CANCEL_STAGE: checks=$($Result.checks.Count); requests=$($Result.requests); matrix=$($Result.matrix); inputs=$($Current.Count); adjacent=$AdjacentInputs; originals=$Originals; processes=$($State.processes.Count); healthy=$Healthy; global_complete=false"
