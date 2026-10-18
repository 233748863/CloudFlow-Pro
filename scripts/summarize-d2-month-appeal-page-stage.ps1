param([ValidatePattern('^r[1-9][0-9]*$')][string]$Round='r1')
$ErrorActionPreference='Stop'
. 'D:\CloudFlowPro\.cloudflow-runtime\use-data-drive.ps1'
$Root='D:\CloudFlowPro'
$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
$Report=Join-Path $Evidence "d2-month-appeal-page-stage-20261005-$Round.json"
if(Test-Path -LiteralPath $Report){throw 'Retain prior stage report'}
function Read-Json([string]$Relative){Get-Content -LiteralPath (Join-Path $Evidence $Relative) -Raw|ConvertFrom-Json}
function Require([bool]$Condition,[string]$Message){if(-not $Condition){throw $Message}}
$Current=@{}
foreach($Relative in @('h3-portal-finance-20261002-backend-r89-inputs.json','h3-portal-finance-20261002-frontend-r58-inputs.json',
    'd2-month-appeal-page-20261005-r5/inputs.json','d2-attendance-privacy-20261005-r3/inputs.json',
    'd2-attendance-appeals-20261005-r3/inputs.json','h3-portal-finance-adjacent-20261002-r94/inputs.json')){
    foreach($Item in @(Read-Json $Relative)){
        $Key=$Item.Path.Replace('\','/')
        Require (-not $Current.ContainsKey($Key) -or $Current[$Key] -eq $Item.Hash) 'Current evidence hashes conflict'
        $Current[$Key]=$Item.Hash
    }
}
foreach($Key in $Current.Keys){Require ((Get-FileHash -LiteralPath (Join-Path $Root $Key)).Hash -eq $Current[$Key]) 'Current input changed'}
$Results=@()
foreach($Spec in @(
    @{Directory='d2-month-appeal-page-20261005-r5';Count=123;Requests=83;LogMarker='D2_MONTH_APPEAL_RUN_EXIT=0'},
    @{Directory='d2-attendance-privacy-20261005-r3';Count=94;Requests=46;LogMarker='D2_PRIVACY_RUN_EXIT=0'},
    @{Directory='d2-attendance-appeals-20261005-r3';Count=117;Requests=58;LogMarker='D2_APPEALS_RUN_EXIT=0'}
)){
    $Result=Read-Json "$($Spec.Directory)/result.json"
    Require ($Result.passed -and $Result.preservation -and $Result.restoration -and $Result.secrets) 'Actual test evidence incomplete'
    Require ($Result.checks.Count -eq $Spec.Count -and $Result.requests -eq $Spec.Requests) 'Test counts differ from reviewed result'
    $Log=Get-Content -LiteralPath (Join-Path $Evidence "$($Spec.Directory)-launch.log") -Raw
    Require ($Log.Contains($Spec.LogMarker) -and $Log.Contains('original_limit=100; original_ttl=-1;') -and $Log.Contains('counter_writes=0; database_unchanged=true; production_modified=false')) 'Runner or configuration restoration proof missing'
    $Results+=[pscustomobject]@{Directory=$Spec.Directory;Backend='r89';Frontend='r58';Checks=$Result.checks.Count;RecordedRequests=$Result.requests;Preservation=$true;Restoration=$true;SecretScan=$true}
}
$Page=Read-Json 'd2-month-appeal-page-20261005-r5/fixture.json'
Require ($Page.appeals.Count -eq 6 -and $Page.screenshots.Count -eq 5) 'Page evidence artifacts differ'
foreach($Name in $Page.screenshots){Require (Test-Path -LiteralPath (Join-Path $Evidence "d2-month-appeal-page-20261005-r5/$Name")) 'Screenshot missing'}
$Failures=@()
foreach($FailureRound in @('r1','r2','r3','r4')){
    $Directory="d2-month-appeal-page-20261005-$FailureRound"
    $Result=Read-Json "$Directory/result.json"
    Require (-not $Result.passed -and $Result.preservation -and $Result.restoration -and $Result.secrets) 'Retained failure or cleanup evidence missing'
    $Originals=@(Get-ChildItem -LiteralPath (Join-Path $Evidence "$Directory/original-source") -Recurse -File -ErrorAction SilentlyContinue)
    $Inputs=@(Read-Json "$Directory/inputs.json")
    foreach($File in $Originals){
        $Key=[IO.Path]::GetRelativePath((Join-Path $Evidence "$Directory/original-source"),$File.FullName).Replace('\','/')
        $Expected=@($Inputs|Where-Object {$_.Path.Replace('\','/') -eq $Key})
        Require ($Expected.Count -eq 1 -and (Get-FileHash -LiteralPath $File.FullName).Hash -eq $Expected[0].Hash) 'Retained original hash differs'
    }
    if($FailureRound -eq 'r3'){
        $Expected=@($Inputs|Where-Object Path -eq 'scripts/verify-d2-month-appeal-page.mjs')
        Require ((Get-FileHash -LiteralPath (Join-Path $Evidence "$Directory/verify-d2-month-appeal-page-original.mjs")).Hash -eq $Expected[0].Hash) 'R3 original checker mismatch'
    }else{Require ($Originals.Count -gt 0) 'Original product or checker sources missing'}
    $Failures+=[pscustomobject]@{Directory=$Directory;ChecksBeforeFailure=$Result.checks.Count;Preservation=$Result.preservation;Restoration=$Result.restoration;OriginalSourcesVerified=$true}
}
foreach($Spec in @(
    @{Log='d2-own-attendance-backend-r89-launch.log';Marker='FINANCE_BUILD: phase=Backend; files=3830; changed=0; exit=0'},
    @{Log='d2-appeal-labels-frontend-r58-launch.log';Marker='FINANCE_BUILD: phase=Frontend; files=1478; changed=0; exit=0'},
    @{Log='d2-own-attendance-hr-r89-launch.log';Marker='ISOLATED_RESTART_READY: service=hr;'}
)){
    Require ((Get-Content -LiteralPath (Join-Path $Evidence $Spec.Log) -Raw).Contains($Spec.Marker)) 'Build or actual HR reload evidence missing'
}
$Adjacent=Get-Content -LiteralPath (Join-Path $Evidence 'h3-portal-finance-adjacent-20261002-r94/summary.log') -Raw
Require ($Adjacent -match 'H3_FINANCE_ADJACENT: files=(\d+); changed=0; exit=0; production_modified=false') 'Adjacent regression incomplete'
$AdjacentInputs=[int]$Matches[1]
$Run=Join-Path $Root '.cloudflow-runtime/batch-g-integration/9799534e1a3a47b5958330f14ae16dc7'
$State=Get-Content -LiteralPath (Join-Path $Run 'state.json') -Raw|ConvertFrom-Json
Require ($State.status -eq 'RUNNING' -and [IO.Path]::GetFullPath($State.run) -eq $Run) 'Owned runtime mismatch'
$Processes=@()
foreach($Entry in $State.processes){
    $Observed=Get-CimInstance Win32_Process -Filter "ProcessId=$($Entry.id)"
    Require ($null -ne $Observed -and $Observed.CommandLine.Contains($Entry.marker)) 'Owned process missing'
    $Processes+=[pscustomobject]@{Name=$Entry.name;Pid=$Entry.id;Owned=$true}
}
$Health=@()
foreach($Service in $State.services){
    $Response=Invoke-RestMethod -Uri "http://127.0.0.1:$($Service.healthPort)/actuator/health" -TimeoutSec 5
    Require ($Response.status -eq 'UP') 'Service unhealthy'
    $Health+=[pscustomobject]@{Name=$Service.name;Status=$Response.status}
}
Require ($Processes.Count -eq 9 -and $Health.Count -eq 6) 'Unexpected runtime size'
$Value=[pscustomobject]@{
    Passed=$true;Backend='r89';Frontend='r58';LoadedBackend='hr=r89; auth=r87; oa,crm,workflow,gateway=r86; non-HR source unchanged'
    CurrentInputs=$Current.Count;InputChanges=0;Results=$Results;RetainedFailures=$Failures;PageAppeals=6;ScreenshotsReviewed=5
    AdjacentRound='r94';AdjacentInputs=$AdjacentInputs;Processes=$Processes;Health=$Health
    OriginalCaptchaConfigurationRestored=$true;All17Complete=$false;Global35Prd681Complete=$false
    HistoricalEvidenceRelabelled=$false
    Remaining=@('true natural daily scheduler delivery','direct first HTTP request below 500ms','whole D2 current-version acceptance','remaining D3 and global35PRD681')
}
$Value|ConvertTo-Json -Depth 7|Set-Content -LiteralPath $Report -Encoding utf8NoBOM
"D2_MONTH_APPEAL_STAGE: inputs=$($Current.Count); page_checks=123; privacy_checks=94; appeal_checks=117; adjacent_inputs=$AdjacentInputs; processes=$($Processes.Count); healthy_services=$($Health.Count); global_complete=false; exit=0"
