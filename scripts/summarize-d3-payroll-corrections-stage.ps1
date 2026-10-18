param([ValidatePattern('^r[1-9][0-9]*$')][string]$Round='r1',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$LiveRound='r4',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$AdjacentRound='r105')
$ErrorActionPreference='Stop'
. 'D:\CloudFlowPro\.cloudflow-runtime\use-data-drive.ps1'
$Root='D:\CloudFlowPro'
$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
$Run=Join-Path $Root '.cloudflow-runtime/batch-g-integration/9799534e1a3a47b5958330f14ae16dc7'
$Output=Join-Path $Evidence "d3-payroll-corrections-stage-20261006-$Round.json"
if(Test-Path -LiteralPath $Output){throw 'Retain original stage evidence'}
function Require([bool]$Condition,[string]$Message){if(-not $Condition){throw $Message}}
function Read-Json([string]$File){Get-Content -LiteralPath (Join-Path $Evidence $File) -Raw|ConvertFrom-Json}
$Folder="d3-payroll-corrections-20261006-$LiveRound"
$Result=Read-Json "$Folder/result.json"
foreach($Name in @('passed','approval','samePeriod','negative','nextPeriod','boundaries','ui','audits','preservation','restoration','secrets')){Require ($Result.$Name -eq $true) "Missing correction evidence: $Name"}
Require (-not $Result.all18Complete -and -not $Result.globalComplete -and -not $Result.officialTaxPolicyVerified) 'Scope boundary changed'
$Fixture=Read-Json "$Folder/fixture.json"
Require ($Fixture.corrections.Count -eq 4 -and @($Fixture.corrections|Where-Object decision -EQ 'REJECTED').Count -eq 1 -and @($Fixture.corrections|Where-Object paid -EQ $true).Count -eq 3) 'Actual correction terminal evidence incomplete'
foreach($Entry in $Fixture.restorations.psobject.Properties){Require ($Entry.Value -eq $true) 'Restoration failed'}
Require ($Fixture.earlierPaid.Count -eq 1 -and $Fixture.earlierPaid[0] -eq '111') 'Original earlier payment not preserved'
$Current=@{}
foreach($Group in @("$Folder/inputs.json","h3-portal-finance-adjacent-20261002-$AdjacentRound/inputs.json",'h3-portal-finance-20261002-backend-r100-inputs.json','h3-portal-finance-20261002-frontend-r58-inputs.json')){
    foreach($Item in @(Read-Json $Group)){Require ((Get-FileHash -LiteralPath (Join-Path $Root $Item.Path)).Hash -eq $Item.Hash) 'Verified input changed';$Current[$Item.Path]=$Item.Hash}
}
$Inputs=@(Read-Json "$Folder/inputs.json")
$Originals=0
foreach($Name in @('run-d3-payroll-corrections.ps1','verify-d3-payroll-corrections.mjs','run-d3-payroll-corrections-allowance.mjs','d1-leave-runtime.mjs','form-browser-auth.mjs')){
    $Input=@($Inputs|Where-Object {(Split-Path -Leaf $_.Path) -eq $Name})
    Require ($Input.Count -eq 1 -and (Get-FileHash -LiteralPath (Join-Path $Evidence "$Folder/original-$Name")).Hash -eq $Input[0].Hash) 'Original executed script changed';$Originals++
}
$Build=Get-Content -LiteralPath (Join-Path $Evidence 'h3-portal-finance-20261002-backend-r100.log') -Raw
Require ($Build.Contains('BUILD SUCCESS') -and $Build.Contains('changed=0; exit=0')) 'B100 build incomplete'
$Launch=Get-Content -LiteralPath (Join-Path $Evidence "d3-payroll-corrections-live-$LiveRound-launch.log") -Raw
Require ($Launch.Contains('D3_CORRECTIONS_RUN_EXIT=0') -and $Launch -match 'OWNED_CAPTCHA_RESTORED: original_limit=100; original_ttl=-1; counter_before=(\d+); counter_after=(\d+); counter_writes=0; database_unchanged=true; production_modified=false') 'Original terminal or restoration missing'
$CaptchaBefore=[int]$Matches[1];$CaptchaAfter=[int]$Matches[2]
$Adjacent=Get-Content -LiteralPath (Join-Path $Evidence "h3-portal-finance-adjacent-20261002-$AdjacentRound/summary.log") -Raw
Require ($Adjacent -match 'H3_FINANCE_ADJACENT: files=(\d+); changed=0; exit=0; production_modified=false') 'Related regression incomplete'
$AdjacentInputs=[int]$Matches[1]
foreach($Failed in @('r1','r2','r3')){
    $Earlier=Read-Json "d3-payroll-corrections-20261006-$Failed/result.json"
    Require (-not $Earlier.passed -and $Earlier.preservation -and $Earlier.restoration) 'Earlier failure was overwritten or preservation missing'
}
$Denied=Read-Json 'd3-denied-query-audit-20261006-r2/result.json'
Require ($Denied.passed -and $Denied.denied -eq 77 -and $Denied.requests -eq 117 -and $Denied.deniedQueryAuditVerified) 'Original rejected query audit evidence missing'
foreach($Source in $Denied.sources){Require ((Get-FileHash -LiteralPath $Source.path).Hash.ToLowerInvariant() -eq $Source.sha256) 'Original privacy source evidence changed'}
$State=Get-Content -LiteralPath (Join-Path $Run 'state.json') -Raw|ConvertFrom-Json
Require ($State.status -eq 'RUNNING' -and [IO.Path]::GetFullPath($State.run) -eq $Run) 'Owned runtime required'
foreach($Entry in $State.processes){$Observed=Get-CimInstance Win32_Process -Filter "ProcessId=$($Entry.id)";Require ($Observed -and $Observed.CommandLine.Contains($Entry.marker)) 'Owned process mismatch'}
$Healthy=0
foreach($Service in $State.services){Require ((Invoke-RestMethod "http://127.0.0.1:$($Service.healthPort)/actuator/health" -TimeoutSec 5).status -eq 'UP') 'Unhealthy service';$Healthy++}
$Summary=[pscustomobject]@{passed=$true;backend='r100';frontend='r58';checks=$Result.checks.Count;requests=$Result.requests;corrections=$Result.corrections;currentInputs=$Current.Count;adjacentInputs=$AdjacentInputs;originalScripts=$Originals;processes=$State.processes.Count;healthyServices=$Healthy;captchaBefore=$CaptchaBefore;captchaAfter=$CaptchaAfter;originalFailuresRetained=$true;cancelledSalarySealed=$true;earlierPaidCorrectionPreserved='111';originalPaidConfirmedSalaryPreserved='98209280908';deniedAuditSourceVersion='B99/F58';all18Complete=$false;globalComplete=$false;remaining=@('D3 large amounts official policy and all18 unified','D3/D2 presentation and remaining acceptance boundaries','D2 first ordinary request below500ms','Global35PRD681')}
$Summary|ConvertTo-Json -Depth 5|Set-Content -LiteralPath $Output -Encoding utf8NoBOM
"D3_CORRECTIONS_STAGE: checks=$($Result.checks.Count); requests=$($Result.requests); corrections=$($Result.corrections); inputs=$($Current.Count); adjacent=$AdjacentInputs; originals=$Originals; processes=$($State.processes.Count); healthy=$Healthy; global_complete=false"
