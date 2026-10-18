param([ValidatePattern('^r[1-9][0-9]*$')][string]$Round='r1',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$MonthRound='r9',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$DirectRound='r12',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$HrOnlyRound='r13',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$RulesRound='r8',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$AdjacentRound='r97')
$ErrorActionPreference='Stop'
. 'D:\CloudFlowPro\.cloudflow-runtime\use-data-drive.ps1'
$Root='D:\CloudFlowPro'
$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
$Report=Join-Path $Evidence "d2-month-values-stage-20261006-$Round.json"
if(Test-Path -LiteralPath $Report){throw 'Retain previous stage report'}
function Read-Json([string]$Relative){Get-Content -LiteralPath (Join-Path $Evidence $Relative) -Raw|ConvertFrom-Json}
function Require([bool]$Condition,[string]$Message){if(-not $Condition){throw $Message}}
$Current=@{}
foreach($Relative in @("d2-month-batch-checks-20261005-$MonthRound/inputs.json",
    "d2-month-batch-checks-20261005-$MonthRound/binary-inputs.json",
    "d2-leave-attendance-20261005-$DirectRound/inputs.json",
    "d2-leave-attendance-20261005-$HrOnlyRound/inputs.json",
    "d2-rules-live-20261005-$RulesRound/inputs.json",
    'd2-month-read-reuse-reload-20261005-r93/inputs.json',
    "h3-portal-finance-adjacent-20261002-$AdjacentRound/inputs.json")){
    foreach($Item in @(Read-Json $Relative)){
        $Path=if([IO.Path]::IsPathRooted($Item.Path)){[IO.Path]::GetFullPath($Item.Path)}else{[IO.Path]::GetFullPath((Join-Path $Root $Item.Path))}
        Require (-not $Current.ContainsKey($Path) -or $Current[$Path] -eq $Item.Hash) 'Current input hashes conflict'
        $Current[$Path]=$Item.Hash
    }
}
foreach($Path in $Current.Keys){Require ((Get-FileHash -LiteralPath $Path).Hash -eq $Current[$Path]) 'Stage input changed'}
$Originals=@()
foreach($Archive in @('d2-month-values-20261006-r1','d2-calendar-values-20261006-r1')){
    foreach($Item in @(Read-Json "$Archive/original-inputs.json")){
        Require ((Get-FileHash -LiteralPath (Join-Path $Evidence ($Archive+'/original-source/'+$Item.Path))).Hash -eq $Item.Hash) 'Retained original changed'
        $Originals+=$Item
    }
}
$Changed=@()
foreach($Item in @(Read-Json 'h3-portal-finance-20261002-backend-r91-inputs.json')){
    if((Get-FileHash -LiteralPath (Join-Path $Root $Item.Path)).Hash -eq $Item.Hash){continue}
    $Original=@($Originals|Where-Object {$_.Path.Replace('\','/') -eq $Item.Path.Replace('\','/')})
    Require ($Original.Count -eq 1 -and $Original[0].Hash -eq $Item.Hash) 'B91 product changed without original'
    $Changed+=$Item.Path.Replace('\','/')
}
$Mapper='cloudflow-backend/cloudflow-service-hr/src/main/resources/mapper/HrAttendanceRecordMapper.xml'
$CalendarMapper='cloudflow-backend/cloudflow-common/cloudflow-common-holiday/src/main/resources/mapper/holiday/HolidayResolverMapper.xml'
Require ($Changed.Count -eq 2 -and $Mapper -in $Changed -and $CalendarMapper -in $Changed) 'Unexpected product change from B91'
Require ((Get-FileHash -LiteralPath (Join-Path $Root $Mapper)).Hash -eq (Get-FileHash -LiteralPath (Join-Path $Root 'cloudflow-backend/cloudflow-service-hr/target/classes/mapper/HrAttendanceRecordMapper.xml')).Hash) 'Loaded mapper differs from source'
Require ((Get-FileHash -LiteralPath (Join-Path $Root $CalendarMapper)).Hash -eq (Get-FileHash -LiteralPath (Join-Path $Root 'cloudflow-backend/cloudflow-common/cloudflow-common-holiday/target/classes/mapper/holiday/HolidayResolverMapper.xml')).Hash) 'Calendar mapper differs from source'
$Month=Read-Json "d2-month-batch-checks-20261005-$MonthRound/result.json"
Require ($Month.Passed -and $Month.Checks -eq 336 -and $Month.ScratchCleaned -and $Month.BackendRound -eq 'r93') 'Actual month checks incomplete'
$Direct=Read-Json "d2-leave-attendance-20261005-$DirectRound/result.json"
Require ($Direct.passed -and $Direct.correctness -and $Direct.preservation -and $Direct.restoration -and $Direct.secrets -and -not $Direct.profiling -and $Direct.checks.Count -eq 37 -and $Direct.requests -eq 4 -and $Direct.measurements.Count -eq 4) 'Ordinary direct checks incomplete'
$MeasuredMet=@($Direct.measurements|Where-Object {-not $_.meets500ms -or $_.milliseconds -ge 500}).Count -eq 0
Require ($Direct.performanceMet -eq $MeasuredMet) 'Performance differs from actual measurements'
$HrOnly=Read-Json "d2-leave-attendance-20261005-$HrOnlyRound/result.json"
Require ($HrOnly.passed -and $HrOnly.correctness -and $HrOnly.preservation -and $HrOnly.restoration -and $HrOnly.secrets -and -not $HrOnly.profiling -and $HrOnly.checks.Count -eq 37 -and $HrOnly.requests -eq 4 -and $HrOnly.measurements.Count -eq 4) 'HR-only restart comparison incomplete'
$HrOnlyMet=@($HrOnly.measurements|Where-Object {-not $_.meets500ms -or $_.milliseconds -ge 500}).Count -eq 0
Require ($HrOnly.performanceMet -eq $HrOnlyMet) 'HR-only performance differs from measurements'
$PerformanceMet=$MeasuredMet -and $HrOnlyMet
$Rules=Read-Json "d2-rules-live-20261005-$RulesRound/result.json"
Require ($Rules.passed -and $Rules.rules -and $Rules.rawFacts -and $Rules.recalculation -and $Rules.preservation -and $Rules.secrets -and $Rules.checks.Count -eq 476) 'Actual rules checks incomplete'
$Profile=Read-Json 'd2-cold-first-profile-20261005-r3/result.json'
Require ($Profile.passed -and $Profile.profilesStopped -and $Profile.inputsUnchanged -and $Profile.backendRound -eq 'r91' -and $Profile.profiling -and -not $Profile.performanceAcceptance) 'Historical profile boundary differs'
$Analyzer=Read-Json 'd2-cold-first-profile-20261005-r3/analyzer-input-r1.json'
Require ((Get-FileHash -LiteralPath (Join-Path $Root $Analyzer.Path)).Hash -eq $Analyzer.Hash) 'Profile analyzer changed'
foreach($Name in @('hr','auth','gateway')){
    $Log=Get-Content -LiteralPath (Join-Path $Evidence "d2-cold-first-profile-20261005-r3/$Name-summary-r1.log") -Raw
    Require ($Log.Contains('payloads_printed=false')) 'Profile summary missing'
}
$Adjacent=Get-Content -LiteralPath (Join-Path $Evidence "h3-portal-finance-adjacent-20261002-$AdjacentRound/summary.log") -Raw
Require ($Adjacent -match 'H3_FINANCE_ADJACENT: files=(\d+); changed=0; exit=0; production_modified=false') 'Adjacent checks incomplete'
$AdjacentInputs=[int]$Matches[1]
$Reload=Read-Json 'd2-month-read-reuse-reload-20261005-r93/result.json'
Require ($Reload.Passed -and $Reload.BackendRound -eq 'r93' -and $Reload.Services.Count -eq 6 -and $Reload.HrReloadedLast) 'Six-service B93 loading incomplete'
$HrPid=[int](@($Reload.Services|Where-Object Name -EQ 'hr')[0].Pid)
$HrRestart=Get-Content -LiteralPath (Join-Path $Evidence 'd2-values-hr-only-reload-r93-launch.log') -Raw
Require ($HrRestart -match ('ISOLATED_RESTART_VERIFIED: service=hr; loopback=true; process='+$HrPid+';')) 'HR-only restart original identity mismatch'
Require ($HrRestart -match 'ISOLATED_RESTART_READY: service=hr; port=\d+; process=(\d+);') 'HR-only restart incomplete'
$HrPid=[int]$Matches[1]
$State=Get-Content -LiteralPath (Join-Path $Root '.cloudflow-runtime/batch-g-integration/9799534e1a3a47b5958330f14ae16dc7/state.json') -Raw|ConvertFrom-Json
Require ($State.status -eq 'RUNNING') 'Reference runtime stopped'
foreach($Owned in $State.processes){
    $Process=Get-CimInstance Win32_Process -Filter "ProcessId=$($Owned.id)"
    Require ($Process -and $Process.CommandLine.Contains($Owned.marker)) 'Reference process ownership differs'
}
$Healthy=0
foreach($Service in $State.services){
    $Owned=@($State.processes|Where-Object name -EQ $Service.name)
    $Loaded=@($Reload.Services|Where-Object Name -EQ $Service.name)
    $ExpectedPid=if($Service.name -eq 'hr'){$HrPid}else{$Loaded[0].Pid}
    Require ($Loaded.Count -eq 1 -and $Owned.Count -eq 1 -and $Owned[0].id -eq $ExpectedPid) 'Service changed after tested B93 loading'
    Require ((Invoke-RestMethod -Uri "http://127.0.0.1:$($Service.healthPort)/actuator/health" -TimeoutSec 5).status -eq 'UP') 'Reference service unhealthy'
    $Healthy++
}
$Remaining=@('Current D2 all17 unified acceptance','D3 and global35PRD681')
if(-not $PerformanceMet){$Remaining=@('Direct first-request performance below500ms')+$Remaining}
$Summary=[pscustomobject]@{passed=$true;backend='r93';frontend='r58';currentInputs=$Current.Count;adjacentInputs=$AdjacentInputs;changedProduct=$Changed;monthChecks=336;monthRound=$MonthRound;directChecks=37;directRound=$DirectRound;rulesChecks=476;rulesRound=$RulesRound;performanceMet=$PerformanceMet;sixServiceReloadPerformanceMet=$MeasuredMet;milliseconds=@($Direct.measurements|ForEach-Object milliseconds);hrOnlyRound=$HrOnlyRound;hrOnlyChecks=37;hrOnlyPerformanceMet=$HrOnlyMet;hrOnlyMilliseconds=@($HrOnly.measurements|ForEach-Object milliseconds);historicalProfileVersion='r91';historicalProfileStopped=$true;historicalIdentityPrivacyNaturalVersion='r91';priorChecksRelabeled=$false;hrPid=$HrPid;processes=$State.processes.Count;healthyServices=$Healthy;globalComplete=$false;d2All17Complete=$false;remaining=$Remaining}
$Summary|ConvertTo-Json -Depth 5|Set-Content -LiteralPath $Report -Encoding utf8NoBOM
Write-Output "D2_MONTH_VALUES_STAGE: inputs=$($Current.Count); adjacent=$AdjacentInputs; month=336; direct=37; hr_only=37; rules=476; performance=$PerformanceMet; processes=$($State.processes.Count); healthy=$Healthy; global_complete=false"
