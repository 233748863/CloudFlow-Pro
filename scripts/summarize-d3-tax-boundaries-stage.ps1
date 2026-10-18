param([ValidatePattern('^r[1-9][0-9]*$')][string]$Round='r1',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$LiveRound='r1',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$AdjacentRound='r108')
$ErrorActionPreference='Stop'
. 'D:\CloudFlowPro\.cloudflow-runtime\use-data-drive.ps1'
$Root='D:\CloudFlowPro'
$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
$Run=Join-Path $Root '.cloudflow-runtime/batch-g-integration/9799534e1a3a47b5958330f14ae16dc7'
$Output=Join-Path $Evidence "d3-tax-boundaries-stage-20261006-$Round.json"
if(Test-Path -LiteralPath $Output){throw 'Retain original tax boundary evidence'}
function Require([bool]$Condition,[string]$Message){if(-not $Condition){throw $Message}}
function Read-Json([string]$File){Get-Content -LiteralPath (Join-Path $Evidence $File) -Raw|ConvertFrom-Json}
$Folder="d3-tax-boundaries-20261006-$LiveRound"
$Result=Read-Json "$Folder/result.json"
foreach($Name in @('passed','boundaries','rounding','threshold','snapshots','browser','preservation','restoration','secrets')){Require ($Result.$Name -eq $true) "Missing tax boundary evidence: $Name"}
Require (-not $Result.all18Complete -and -not $Result.globalComplete -and -not $Result.officialTaxPolicyVerified) 'Stage scope changed'
Require ($Result.cases -eq 24 -and $Result.tasks -eq 1) 'Actual sample count differs'
Require (@($Result.findings|Where-Object passed -NE $true).Count -eq 0) 'Actual amount finding failed'
$Fixture=Read-Json "$Folder/fixture.json"
Require ($Fixture.cases.Count -eq 24 -and $Fixture.tasks.Count -eq 1 -and $Fixture.tasks[0].terminal -eq 'SUCCESS') 'Owned task incomplete'
Require (@($Fixture.cases|Where-Object {$_.name.StartsWith('edge')}).Count -eq 18) 'Six exact boundary triples missing'
foreach($Name in @('batches','syntheticTax','originalBusiness')){Require ($Fixture.restorations.$Name -eq $true) 'Restoration incomplete'}
foreach($Name in @('edge6-above','rounding-5','threshold-below')){Require (Test-Path -LiteralPath (Join-Path $Evidence "$Folder/$Name-page.png")) 'Actual page evidence missing'}
$Current=@{}
$ReportChanges=@()
$ReportSource='scripts/summarize-d3-tax-boundaries-stage.ps1'
$ReportOriginal=Join-Path $Evidence 'd3-tax-boundaries-stage-before-count-fix-20261006.ps1'
foreach($Group in @("$Folder/inputs.json","h3-portal-finance-adjacent-20261002-$AdjacentRound/inputs.json",'h3-portal-finance-20261002-backend-r102-inputs.json','h3-portal-finance-20261002-frontend-r61-inputs.json')){
    foreach($Item in @(Read-Json $Group)){
        $Actual=(Get-FileHash -LiteralPath (Join-Path $Root $Item.Path)).Hash
        if($Item.Path.Replace('\','/') -eq $ReportSource -and $Actual -ne $Item.Hash){
            Require ((Get-FileHash -LiteralPath $ReportOriginal).Hash -eq $Item.Hash) 'Original reporting source missing'
            $ReportChanges+=@{path=$ReportSource;before=$Item.Hash;after=$Actual;reason='Reporting collection count and explicit original-source accounting only; product and executed business checks unchanged'}
        }else{Require ($Actual -eq $Item.Hash) 'Verified input changed'}
        $Current[$Item.Path]=$Actual
    }
}
$Inputs=@(Read-Json "$Folder/inputs.json")
$Originals=0
foreach($Name in @('run-d3-tax-boundaries.ps1','verify-d3-tax-boundaries.mjs','run-d3-tax-boundaries-allowance.mjs','d1-leave-runtime.mjs','form-browser-auth.mjs')){
    $Input=@($Inputs|Where-Object {(Split-Path -Leaf $_.Path) -eq $Name})
    Require ($Input.Count -eq 1 -and (Get-FileHash -LiteralPath (Join-Path $Evidence "$Folder/original-$Name")).Hash -eq $Input[0].Hash) 'Original executed script changed';$Originals++
}
foreach($Build in @('backend-r102','frontend-r61')){Require ((Get-Content (Join-Path $Evidence "h3-portal-finance-20261002-$Build.log") -Raw).Contains('changed=0; exit=0')) 'Prior exact build incomplete'}
$Launch=Get-Content (Join-Path $Evidence "d3-tax-boundaries-20261006-$LiveRound-launch.log") -Raw
Require ($Launch.Contains('D3_TAX_BOUNDARIES_RUN_EXIT=0') -and $Launch -match 'OWNED_CAPTCHA_RESTORED: original_limit=100; original_ttl=-1; counter_before=(\d+); counter_after=(\d+); counter_writes=0; database_unchanged=true; production_modified=false') 'Original terminal or configuration restoration missing'
$CaptchaBefore=[int]$Matches[1];$CaptchaAfter=[int]$Matches[2]
$Adjacent=Get-Content (Join-Path $Evidence "h3-portal-finance-adjacent-20261002-$AdjacentRound/summary.log") -Raw
Require ($Adjacent -match 'H3_FINANCE_ADJACENT: files=(\d+); changed=0; exit=0; production_modified=false') 'Related regression incomplete'
$AdjacentInputs=[int]$Matches[1]
$State=Get-Content (Join-Path $Run 'state.json') -Raw|ConvertFrom-Json
Require ($State.status -eq 'RUNNING' -and [IO.Path]::GetFullPath($State.run) -eq $Run) 'Owned runtime required'
foreach($Entry in $State.processes){$Observed=Get-CimInstance Win32_Process -Filter "ProcessId=$($Entry.id)";Require ($Observed -and $Observed.CommandLine.Contains($Entry.marker)) 'Owned process mismatch'}
$Healthy=0
foreach($Service in $State.services){Require ((Invoke-RestMethod "http://127.0.0.1:$($Service.healthPort)/actuator/health" -TimeoutSec 5).status -eq 'UP') 'Unhealthy service';$Healthy++}
$Summary=[pscustomobject]@{passed=$true;backend='r102';frontend='r61';checks=$Result.checks.Count;findings=$Result.findings.Count;requests=$Result.requests;tasks=$Fixture.tasks.Count;cases=$Fixture.cases.Count;liveInputs=$Inputs.Count;currentInputs=$Current.Count;adjacentInputs=$AdjacentInputs;originalScripts=$Originals;originalBusinessTables=@($Fixture.originalDigests.psobject.Properties).Count;reportOnlyInputChanges=$ReportChanges;processes=$State.processes.Count;healthyServices=$Healthy;captchaBefore=$CaptchaBefore;captchaAfter=$CaptchaAfter;officialTaxPolicyVerified=$false;all18Complete=$false;globalComplete=$false;remaining=@('All salary item and deduction combinations','Official tax policy and D3 unified acceptance','D2 first ordinary request below500ms','Global35PRD681')}
$Summary|ConvertTo-Json -Depth 4|Set-Content -LiteralPath $Output -Encoding utf8NoBOM
"D3_TAX_BOUNDARIES_STAGE: cases=$($Result.cases); checks=$($Result.checks.Count); findings=$($Result.findings.Count); requests=$($Result.requests); inputs=$($Current.Count); adjacent=$AdjacentInputs; originals=$Originals; processes=$($State.processes.Count); healthy=$Healthy; global_complete=false"
