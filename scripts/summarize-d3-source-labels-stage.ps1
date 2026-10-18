param([ValidatePattern('^r[1-9][0-9]*$')][string]$Round='r1',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$LiveRound='r2',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$AdjacentRound='r113')
$ErrorActionPreference='Stop'
. 'D:\CloudFlowPro\.cloudflow-runtime\use-data-drive.ps1'
$Root='D:\CloudFlowPro'
$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
$Run=Join-Path $Root '.cloudflow-runtime/batch-g-integration/9799534e1a3a47b5958330f14ae16dc7'
$Output=Join-Path $Evidence "d3-source-labels-stage-20261006-$Round.json"
if(Test-Path -LiteralPath $Output){throw 'Retain original salary name evidence'}
function Require([bool]$Condition,[string]$Message){if(-not $Condition){throw $Message}}
function Read-Json([string]$File){Get-Content -LiteralPath (Join-Path $Evidence $File) -Raw|ConvertFrom-Json}
$Folder="d3-source-labels-20261006-$LiveRound"
$Result=Read-Json "$Folder/result.json"
foreach($Name in @('passed','content','browser','pdf','simulatorObserved','preservation','secrets')){Require ($Result.$Name -eq $true) "Missing salary name evidence: $Name"}
Require (-not $Result.all18Complete -and -not $Result.globalComplete -and -not $Result.officialTaxPolicyVerified) 'Stage scope changed'
Require ($Result.observations.Count -eq 11 -and @($Result.observations|Where-Object present -NE $true).Count -eq 0) 'Name observation incomplete'
foreach($Salary in @('98209280973','98209280971')){
    foreach($File in @("$Salary-page.png","$Salary/$Salary.pdf","$Salary/$Salary.txt","$Salary/$Salary-pdf.png","$Salary/certificate.pdf","$Salary/training.pdf")){
        Require (Test-Path -LiteralPath (Join-Path $Evidence "$Folder/$File")) 'Actual page or PDF evidence missing'
    }
}
$Baseline=Read-Json "$Folder/simulator-baseline.json"
Require ($Baseline.status -ge 400 -and $Baseline.request.baseSalary -eq 10000.01 -and -not $Baseline.request.structureId) 'Original simulator failure not observed'
$Requests=@(Read-Json "$Folder/requests.json")
Require ($Requests.Count -eq $Result.requests -and $Requests.Count -eq 3) 'Request accounting differs'
$Current=@{}
foreach($Group in @("$Folder/inputs.json","h3-portal-finance-adjacent-20261002-$AdjacentRound/inputs.json",'h3-portal-finance-20261002-backend-r105-inputs.json','h3-portal-finance-20261002-frontend-r63-inputs.json')){
    foreach($Item in @(Read-Json $Group)){$Actual=(Get-FileHash -LiteralPath (Join-Path $Root $Item.Path)).Hash;Require ($Actual -eq $Item.Hash) 'Verified input changed';$Current[$Item.Path]=$Actual}
}
$Inputs=@(Read-Json "$Folder/inputs.json")
$Originals=0
foreach($Name in @('run-d3-source-labels.ps1','verify-d3-source-labels.mjs','run-d3-source-labels-allowance.mjs','d1-leave-runtime.mjs','D3SalaryPdfProbe.java')){
    $Input=@($Inputs|Where-Object {(Split-Path -Leaf $_.Path) -eq $Name})
    Require ($Input.Count -eq 1 -and (Get-FileHash -LiteralPath (Join-Path $Evidence "$Folder/original-$Name")).Hash -eq $Input[0].Hash) 'Original executed script changed';$Originals++
}
foreach($Name in @('HrSalarySlipPrintService.java','hrPayrollDisplay.ts','HrPayrollPage.tsx')){
    $Input=@($Inputs|Where-Object {(Split-Path -Leaf $_.Path) -eq $Name})
    Require ($Input.Count -eq 1 -and (Get-FileHash -LiteralPath (Join-Path $Evidence "$Folder/executed-$Name")).Hash -eq $Input[0].Hash) 'Executed product snapshot differs'
}
foreach($Build in @('backend-r105','frontend-r63')){Require ((Get-Content (Join-Path $Evidence "h3-portal-finance-20261002-$Build.log") -Raw).Contains('changed=0; exit=0')) 'Exact build incomplete'}
$Launch=Get-Content (Join-Path $Evidence "d3-source-labels-20261006-$LiveRound-launch.log") -Raw
Require ($Launch.Contains('D3_SOURCE_LABELS_RUN_EXIT=0') -and $Launch -match 'OWNED_CAPTCHA_RESTORED: original_limit=100; original_ttl=-1; counter_before=(\d+); counter_after=(\d+); counter_writes=0; database_unchanged=true; production_modified=false') 'Original terminal or configuration restoration missing'
$CaptchaBefore=[int]$Matches[1];$CaptchaAfter=[int]$Matches[2]
$Prior=Read-Json 'd3-source-labels-20261006-r1/result.json'
Require (-not $Prior.passed -and $Prior.preservation -and $Prior.secrets -and $Prior.failure -eq 'pdf_parsed_98209280971') 'Original failed baseline changed'
$Adjacent=Get-Content (Join-Path $Evidence "h3-portal-finance-adjacent-20261002-$AdjacentRound/summary.log") -Raw
Require ($Adjacent -match 'H3_FINANCE_ADJACENT: files=(\d+); changed=0; exit=0; production_modified=false') 'Related regression incomplete'
$AdjacentInputs=[int]$Matches[1]
$State=Get-Content (Join-Path $Run 'state.json') -Raw|ConvertFrom-Json
Require ($State.status -eq 'RUNNING' -and [IO.Path]::GetFullPath($State.run) -eq $Run) 'Owned runtime required'
foreach($Entry in $State.processes){$Observed=Get-CimInstance Win32_Process -Filter "ProcessId=$($Entry.id)";Require ($Observed -and $Observed.CommandLine.Contains($Entry.marker)) 'Owned process mismatch'}
$Healthy=0
foreach($Service in $State.services){Require ((Invoke-RestMethod "http://127.0.0.1:$($Service.healthPort)/actuator/health" -TimeoutSec 5).status -eq 'UP') 'Unhealthy service';$Healthy++}
$Summary=[pscustomobject]@{passed=$true;backend='r105';frontend='r63';liveRound=$LiveRound;checks=$Result.checks.Count;requests=$Result.requests;observations=$Result.observations.Count;liveInputs=$Inputs.Count;currentInputs=$Current.Count;adjacentInputs=$AdjacentInputs;originalScripts=$Originals;processes=$State.processes.Count;healthyServices=$Healthy;captchaBefore=$CaptchaBefore;captchaAfter=$CaptchaAfter;priorFailure=$Prior.failure;simulatorObservedStatus=$Baseline.status;officialTaxPolicyVerified=$false;all18Complete=$false;globalComplete=$false;remaining=@('Simulation contract and remaining D3 boundaries','Official tax policy and D3 unified acceptance','D2 first ordinary request below500ms','Global35PRD681')}
$Summary|ConvertTo-Json -Depth 5|Set-Content -LiteralPath $Output -Encoding utf8NoBOM
"D3_SOURCE_LABELS_STAGE: checks=$($Result.checks.Count); requests=$($Result.requests); observations=$($Result.observations.Count); inputs=$($Current.Count); adjacent=$AdjacentInputs; originals=$Originals; processes=$($State.processes.Count); healthy=$Healthy; global_complete=false"
