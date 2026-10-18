param([ValidatePattern('^r[1-9][0-9]*$')][string]$Round='r1',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$LiveRound='r5',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$AdjacentRound='r104')
$ErrorActionPreference='Stop'
. 'D:\CloudFlowPro\.cloudflow-runtime\use-data-drive.ps1'
$Root='D:\CloudFlowPro'
$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
$Run=Join-Path $Root '.cloudflow-runtime/batch-g-integration/9799534e1a3a47b5958330f14ae16dc7'
$Report=Join-Path $Evidence "d3-salary-privacy-stage-20261006-$Round.json"
if(Test-Path -LiteralPath $Report){throw 'Retain prior stage evidence'}
function Require([bool]$Condition,[string]$Message){if(-not $Condition){throw $Message}}
function Read-Json([string]$Relative){Get-Content -LiteralPath (Join-Path $Evidence $Relative) -Raw|ConvertFrom-Json}
$Folder="d3-salary-privacy-20261006-$LiveRound"
$Result=Read-Json "$Folder/result.json"
foreach($Name in @('passed','scope','tenant','unpublished','downloads','confirmation','audits','preservation','restoration','secrets')){Require ($Result.$Name -eq $true) "Missing salary privacy evidence: $Name"}
Require (-not $Result.deniedQueryAuditVerified -and -not $Result.officialTaxPolicyVerified -and -not $Result.all18Complete -and -not $Result.globalComplete) 'Scope boundary changed'
$Fixture=Read-Json "$Folder/fixture.json"
Require ($Fixture.confirmButtonCount -eq 1 -and $Fixture.employeeConfirmPermission) 'Actual employee confirmation permission missing'
Require (@($Fixture.tasks|Where-Object {$_.terminal -ne 'SUCCESS'}).Count -eq 0 -and $Fixture.tasks.Count -eq 1) 'Original business task incomplete'
foreach($Item in $Fixture.restorations.psobject.Properties){Require ($Item.Value -eq $true) 'Restoration incomplete'}
$Preparation=Read-Json 'd3-salary-privacy-preparation-20261006-r1/result.json'
Require ($Preparation.passed -and $Preparation.formalSeed -and $Preparation.exactGrants -and $Preparation.jobRecovered -and $Preparation.granted.Count -eq 10) 'Preparation incomplete'
$Recovery=Read-Json 'd3-employee-creator-restoration-20261006-r2.json'
Require ($Recovery.passed -and $Recovery.restored -eq 2 -and $Recovery.onlyCreateByChanged) 'Original employee restoration incomplete'
foreach($Name in @('d3-employee-audit-fixed-r2-launch.log','d3-job-delete-fixed-r1-launch.log')){
    $Text=Get-Content -LiteralPath (Join-Path $Evidence $Name) -Raw
    Require ($Text.Contains('fixtures_rolled_back=true') -and $Text.Contains('changed=0')) 'Actual database regression incomplete'
}
$BuildLog=Get-Content -LiteralPath (Join-Path $Evidence 'h3-portal-finance-20261002-backend-r99.log') -Raw
Require ($BuildLog.Contains('BUILD SUCCESS') -and $BuildLog.Contains('changed=0; exit=0')) 'B99 build incomplete'
$InputGroups=@("$Folder/inputs.json",'d3-salary-privacy-preparation-20261006-r1/inputs.json',"h3-portal-finance-adjacent-20261002-$AdjacentRound/inputs.json",'h3-portal-finance-20261002-backend-r99-inputs.json','h3-portal-finance-20261002-frontend-r58-inputs.json')
$Current=@{}
foreach($Group in $InputGroups){foreach($Item in @(Read-Json $Group)){
    Require ((Get-FileHash -LiteralPath (Join-Path $Root $Item.Path)).Hash -eq $Item.Hash) 'Current input differs from verified execution'
    $Current[$Item.Path]=$Item.Hash
}}
$Inputs=@(Read-Json "$Folder/inputs.json")
$Originals=0
foreach($Name in @('run-d3-salary-privacy.ps1','verify-d3-salary-privacy.mjs','run-d3-salary-privacy-allowance.mjs','d1-leave-runtime.mjs','d2-privacy-browser-auth.mjs')){
    $Input=@($Inputs|Where-Object {(Split-Path -Leaf $_.Path) -eq $Name})
    Require ($Input.Count -eq 1 -and (Get-FileHash -LiteralPath (Join-Path $Evidence "$Folder/original-$Name")).Hash -eq $Input[0].Hash) 'Original executed script changed'
    $Originals++
}
$Launch=Get-Content -LiteralPath (Join-Path $Evidence "d3-salary-privacy-live-$LiveRound-launch.log") -Raw
Require ($Launch.Contains('D3_PRIVACY_RUN_EXIT=0') -and $Launch -match 'OWNED_CAPTCHA_RESTORED: original_limit=100; original_ttl=-1; counter_before=(\d+); counter_after=(\d+); counter_writes=0; database_unchanged=true; production_modified=false') 'Original terminal result or captcha restoration missing'
$CaptchaBefore=[int]$Matches[1];$CaptchaAfter=[int]$Matches[2]
$Adjacent=Get-Content -LiteralPath (Join-Path $Evidence "h3-portal-finance-adjacent-20261002-$AdjacentRound/summary.log") -Raw
Require ($Adjacent -match 'H3_FINANCE_ADJACENT: files=(\d+); changed=0; exit=0; production_modified=false') 'Related regression incomplete'
$AdjacentInputs=[int]$Matches[1]
foreach($FailedRound in @('r1','r2','r3','r4')){Require (Test-Path -LiteralPath (Join-Path $Evidence "d3-salary-privacy-20261006-$FailedRound/inputs.json")) 'Original failure evidence missing'}
$State=Get-Content -LiteralPath (Join-Path $Run 'state.json') -Raw|ConvertFrom-Json
Require ($State.status -eq 'RUNNING' -and [IO.Path]::GetFullPath($State.run) -eq $Run) 'Owned runtime required'
foreach($Entry in $State.processes){$Observed=Get-CimInstance Win32_Process -Filter "ProcessId=$($Entry.id)";Require ($Observed -and $Observed.CommandLine.Contains($Entry.marker)) 'Process ownership failed'}
$Healthy=0
foreach($Service in $State.services){Require ((Invoke-RestMethod "http://127.0.0.1:$($Service.healthPort)/actuator/health" -TimeoutSec 5).status -eq 'UP') 'Service unhealthy';$Healthy++}
$Summary=[pscustomobject]@{passed=$true;backend='r99';frontend='r58';checks=$Result.checks.Count;requests=$Result.requests;matrix=$Result.matrix;auditedOperations=$Result.auditedOperations;currentInputs=$Current.Count;adjacentInputs=$AdjacentInputs;originalScripts=$Originals;processes=$State.processes.Count;healthyServices=$Healthy;captchaBefore=$CaptchaBefore;captchaAfter=$CaptchaAfter;newExistingPermissionGrants=10;restoredEmployeeCreators=2;ownedTaskDeletionRecovered=$true;originalFailuresRetained=$true;employeeConfirmed=$true;deniedQueryAuditVerified=$false;all18Complete=$false;globalComplete=$false;remaining=@('Denied salary query audit','D3 correction large amounts official policy and unified acceptance','D2 first ordinary request below500ms and all17','Global35PRD681')}
$Summary|ConvertTo-Json -Depth 5|Set-Content -LiteralPath $Report -Encoding utf8NoBOM
"D3_PRIVACY_STAGE: checks=$($Result.checks.Count); requests=$($Result.requests); matrix=$($Result.matrix); inputs=$($Current.Count); adjacent=$AdjacentInputs; originals=$Originals; processes=$($State.processes.Count); healthy=$Healthy; global_complete=false"
