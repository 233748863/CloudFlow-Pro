param([ValidatePattern('^r[1-9][0-9]*$')][string]$Round='r1',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$DirectRound='r9',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$RulesRound='r7',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$PrivacyRound='r4',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$NaturalRound='r3',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$AdjacentRound='r96')
$ErrorActionPreference='Stop'
. 'D:\CloudFlowPro\.cloudflow-runtime\use-data-drive.ps1'
$Root='D:\CloudFlowPro'
$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
$Report=Join-Path $Evidence "d2-read-session-stage-20261006-$Round.json"
if(Test-Path -LiteralPath $Report){throw 'Retain previous stage report'}
function Read-Json([string]$Relative){Get-Content -LiteralPath (Join-Path $Evidence $Relative) -Raw|ConvertFrom-Json}
function Require([bool]$Condition,[string]$Message){if(-not $Condition){throw $Message}}
$Current=@{}
foreach($Relative in @("d2-leave-attendance-20261005-$DirectRound/inputs.json",
    "d2-rules-live-20261005-$RulesRound/inputs.json","d2-attendance-privacy-20261005-$PrivacyRound/inputs.json",
    'login-session-read-checks-20261006-r1/inputs.json','login-session-read-checks-20261006-r1/binary-inputs.json',
    "d2-natural-daily-20261005-$NaturalRound/inputs.json","d2-natural-daily-20261005-$NaturalRound/runtime-inputs.json",
    "h3-portal-finance-adjacent-20261002-$AdjacentRound/inputs.json",'d2-month-read-reuse-reload-20261005-r91/inputs.json')){
    foreach($Item in @(Read-Json $Relative)){
        $Path=if([IO.Path]::IsPathRooted($Item.Path)){[IO.Path]::GetFullPath($Item.Path)}else{[IO.Path]::GetFullPath((Join-Path $Root $Item.Path))}
        Require (-not $Current.ContainsKey($Path) -or $Current[$Path] -eq $Item.Hash) 'Current input hashes conflict'
        $Current[$Path]=$Item.Hash
    }
}
foreach($Path in $Current.Keys){Require ((Get-FileHash -LiteralPath $Path).Hash -eq $Current[$Path]) 'Current stage input changed'}
$OriginalInputs=@(Read-Json 'd2-session-read-20261006-r1/original-inputs.json')
foreach($Item in $OriginalInputs){
    $Original=Join-Path $Evidence ('d2-session-read-20261006-r1/original-source/'+$Item.Path)
    Require ((Get-FileHash -LiteralPath $Original).Hash -eq $Item.Hash) 'Retained original source differs'
}
$Xml='cloudflow-backend/cloudflow-common/cloudflow-common-data/src/main/resources/mapper/tenant/LoginSessionMapper.xml'
$XmlBefore=@($OriginalInputs|Where-Object Path -EQ $Xml)
Require ($XmlBefore.Count -eq 1 -and (Get-FileHash -LiteralPath (Join-Path $Root $Xml)).Hash -eq $XmlBefore[0].Hash) 'Identity query SQL changed'
$HistoricalChanges=@()
foreach($Item in @(Read-Json 'd2-month-batch-checks-20261005-r6/inputs.json')){
    if((Get-FileHash -LiteralPath (Join-Path $Root $Item.Path)).Hash -eq $Item.Hash){continue}
    $Original=@($OriginalInputs|Where-Object {$_.Path.Replace('\','/') -eq $Item.Path.Replace('\','/')})
    Require ($Original.Count -eq 1 -and $Original[0].Hash -eq $Item.Hash) 'Historical B90 month input changed without retained original'
    $HistoricalChanges+=$Item.Path
}
$Month=Read-Json 'd2-month-batch-checks-20261005-r6/result.json'
Require ($Month.Passed -and $Month.Checks -eq 318 -and $Month.ScratchCleaned -and $Month.BackendRound -eq 'r90') 'Historical month result missing'
$Identity=Read-Json 'login-session-read-checks-20261006-r1/result.json'
Require ($Identity.Passed -and $Identity.Checks -eq 121 -and $Identity.ScratchCleaned -and $Identity.SessionParses -eq 0 -and $Identity.NormalQueriesFiltered -and $Identity.CommittedRevision -and $Identity.BackendRound -eq 'r91') 'Identity database checks incomplete'
$Direct=Read-Json "d2-leave-attendance-20261005-$DirectRound/result.json"
Require ($Direct.passed -and $Direct.correctness -and $Direct.preservation -and $Direct.restoration -and $Direct.secrets -and -not $Direct.profiling -and $Direct.checks.Count -eq 37 -and $Direct.requests -eq 4 -and $Direct.measurements.Count -eq 4) 'Ordinary direct checks incomplete'
$MeasuredMet=@($Direct.measurements|Where-Object {-not $_.meets500ms -or $_.milliseconds -ge 500}).Count -eq 0
Require ($Direct.performanceMet -eq $MeasuredMet) 'Performance result differs from measurements'
$Rules=Read-Json "d2-rules-live-20261005-$RulesRound/result.json"
Require ($Rules.passed -and $Rules.rules -and $Rules.rawFacts -and $Rules.recalculation -and $Rules.preservation -and $Rules.secrets -and $Rules.checks.Count -eq 476) 'Rule replay incomplete'
$Privacy=Read-Json "d2-attendance-privacy-20261005-$PrivacyRound/result.json"
Require ($Privacy.passed -and $Privacy.correctness -and $Privacy.preservation -and $Privacy.restoration -and $Privacy.secrets -and $Privacy.checks.Count -eq 94) 'Privacy replay incomplete'
$Natural=Read-Json "d2-natural-daily-20261005-$NaturalRound/result.json"
$NaturalObserved=Read-Json "d2-natural-daily-20261005-$NaturalRound/observed.json"
$NaturalLauncher=Read-Json "d2-natural-daily-20261005-$NaturalRound/launcher-result.json"
Require ($Natural.passed -and $Natural.naturalScheduler -and -not $Natural.originalFiveAmObserved -and $Natural.secrets.leaks -eq 0 -and $Natural.checks -eq 23+$NaturalObserved.earlyObservations -and $NaturalObserved.logs.Count -eq 1 -and $NaturalObserved.logs[0].affected -eq 4) 'Natural daily delivery incomplete'
Require ($NaturalLauncher.passed -and $NaturalLauncher.backend -eq 'r91' -and $NaturalLauncher.frontend -eq 'r58' -and $NaturalLauncher.inputsUnchanged -and $NaturalLauncher.processesStopped -and -not $NaturalLauncher.priorRuntimeWritten) 'Independent natural runtime protection incomplete'
$RemainingNatural=@(Get-CimInstance Win32_Process|Where-Object {$_.CommandLine -and ($_.CommandLine.Contains($NaturalLauncher.run) -or $_.CommandLine.Contains('redis-'+(Split-Path -Leaf $NaturalLauncher.run)+'.conf'))})
Require ($RemainingNatural.Count -eq 0) 'Independent natural runtime still running'
$Profile=Read-Json 'd2-cold-first-profile-20261005-r2/result.json'
Require ($Profile.passed -and $Profile.profilesStopped -and $Profile.inputsUnchanged -and $Profile.backendRound -eq 'r90' -and -not $Profile.performanceAcceptance) 'B90 diagnostic boundary differs'
$Reload=Read-Json 'd2-month-read-reuse-reload-20261005-r91/result.json'
Require ($Reload.Passed -and $Reload.BackendRound -eq 'r91' -and $Reload.Services.Count -eq 6 -and $Reload.HrReloadedLast) 'Six-service B91 load incomplete'
$Adjacent=Get-Content -LiteralPath (Join-Path $Evidence "h3-portal-finance-adjacent-20261002-$AdjacentRound/summary.log") -Raw
Require ($Adjacent -match 'H3_FINANCE_ADJACENT: files=(\d+); changed=0; exit=0; production_modified=false') 'Adjacent regression incomplete'
$AdjacentInputs=[int]$Matches[1]
$State=Get-Content -LiteralPath (Join-Path $Root '.cloudflow-runtime/batch-g-integration/9799534e1a3a47b5958330f14ae16dc7/state.json') -Raw|ConvertFrom-Json
Require ($State.status -eq 'RUNNING') 'Reference runtime stopped'
foreach($Owned in $State.processes){
    $Process=Get-CimInstance Win32_Process -Filter "ProcessId=$($Owned.id)"
    Require ($Process -and $Process.CommandLine.Contains($Owned.marker)) 'Reference process ownership differs'
}
$Healthy=0
foreach($Service in $State.services){
    $Loaded=@($Reload.Services|Where-Object Name -EQ $Service.name)
    $Owned=@($State.processes|Where-Object name -EQ $Service.name)
    Require ($Loaded.Count -eq 1 -and $Owned.Count -eq 1 -and $Owned[0].id -eq $Loaded[0].Pid) 'Service changed after B91 loading'
    Require ((Invoke-RestMethod -Uri "http://127.0.0.1:$($Service.healthPort)/actuator/health" -TimeoutSec 5).status -eq 'UP') 'Reference service unhealthy'
    $Healthy++
}
$Remaining=@('Current D2 all17 unified acceptance','D3 and global35PRD681')
if(-not $MeasuredMet){$Remaining=@('Direct first-request performance below500ms')+$Remaining}
$Summary=[pscustomobject]@{passed=$true;backend='r91';frontend='r58';currentInputs=$Current.Count;adjacentInputs=$AdjacentInputs;identityChecks=121;identitySqlUnchanged=$true;historicalMonthVersion='r90';historicalMonthChecks=318;historicalChangedInputs=$HistoricalChanges;historicalDiagnosticVersion='r90';profilesStopped=$true;directRound=$DirectRound;directChecks=37;performanceMet=$MeasuredMet;milliseconds=@($Direct.measurements|ForEach-Object milliseconds);rulesChecks=476;privacyChecks=94;naturalChecks=$Natural.checks;naturalEarlyObservations=$NaturalObserved.earlyObservations;naturalAffected=4;naturalProcessesStopped=$true;originalFiveAmObserved=$false;processes=$State.processes.Count;healthyServices=$Healthy;globalComplete=$false;d2All17Complete=$false;remaining=$Remaining}
$Summary|ConvertTo-Json -Depth 5|Set-Content -LiteralPath $Report -Encoding utf8NoBOM
Write-Output "D2_READ_SESSION_STAGE: inputs=$($Current.Count); adjacent=$AdjacentInputs; identity=121; rules=476; privacy=94; natural=$($Natural.checks); first_request_performance=$MeasuredMet; processes=$($State.processes.Count); healthy=$Healthy; global_complete=false"
