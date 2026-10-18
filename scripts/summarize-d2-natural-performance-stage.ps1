param([ValidatePattern('^r[1-9][0-9]*$')][string]$Round='r1')
$ErrorActionPreference='Stop'
. 'D:\CloudFlowPro\.cloudflow-runtime\use-data-drive.ps1'
$Root='D:\CloudFlowPro'
$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
$Report=Join-Path $Evidence "d2-natural-performance-stage-20261005-$Round.json"
if(Test-Path -LiteralPath $Report){throw 'Retain previous stage report'}
function Read-Json([string]$Relative){Get-Content -LiteralPath (Join-Path $Evidence $Relative) -Raw|ConvertFrom-Json}
function Require([bool]$Condition,[string]$Message){if(-not $Condition){throw $Message}}
$Current=@{}
foreach($Relative in @('d2-natural-daily-20261005-r2/inputs.json','d2-natural-daily-20261005-r2/runtime-inputs.json',
    'd2-leave-attendance-20261005-r6/inputs.json','d2-cold-first-profile-20261005-r1/inputs.json',
    'h3-portal-finance-adjacent-20261002-r95/inputs.json')){
    foreach($Item in @(Read-Json $Relative)){
        $Path=if([IO.Path]::IsPathRooted($Item.Path)){[IO.Path]::GetFullPath($Item.Path)}else{[IO.Path]::GetFullPath((Join-Path $Root $Item.Path))}
        Require (-not $Current.ContainsKey($Path) -or $Current[$Path] -eq $Item.Hash) 'Current input hashes conflict'
        $Current[$Path]=$Item.Hash
    }
}
foreach($Path in $Current.Keys){Require ((Get-FileHash -LiteralPath $Path).Hash -eq $Current[$Path]) 'Current stage input changed'}
$Retained=@()
foreach($RoundId in @('r1','r2')){
    $Directory="d2-natural-daily-20261005-$RoundId"
    $Launcher=Read-Json "$Directory/launcher-result.json"
    Require ($Launcher.inputsUnchanged -and $Launcher.processesStopped -and -not $Launcher.priorRuntimeWritten) 'Independent runtime protection incomplete'
    foreach($Name in @('run-d2-natural-daily.ps1','verify-d2-natural-daily.mjs')){
        $Expected=@((Read-Json "$Directory/inputs.json")|Where-Object {$_.Path.Replace('\','/').EndsWith("scripts/$Name")})
        Require ($Expected.Count -eq 1 -and (Get-FileHash -LiteralPath (Join-Path $Evidence "$Directory/original-$Name")).Hash -eq $Expected[0].Hash) 'Retained natural original differs'
    }
    $Remain=@(Get-CimInstance Win32_Process|Where-Object {$_.CommandLine -and ($_.CommandLine.Contains($Launcher.run) -or $_.CommandLine.Contains('redis-'+(Split-Path -Leaf $Launcher.run)+'.conf'))})
    Require ($Remain.Count -eq 0) 'Independent natural runtime still running'
    $Retained+=[pscustomobject]@{Round=$RoundId;Passed=$Launcher.passed;Inputs=$Launcher.inputs;OriginalSourcesVerified=$true;ProcessesRemaining=0}
}
$Natural=Read-Json 'd2-natural-daily-20261005-r2/result.json'
Require ($Natural.passed -and $Natural.checks -eq 66 -and $Natural.secrets.leaks -eq 0 -and $Natural.naturalScheduler -and -not $Natural.originalFiveAmObserved) 'Natural delivery result differs'
$NaturalObserved=Read-Json 'd2-natural-daily-20261005-r2/observed.json'
Require ($NaturalObserved.earlyObservations -eq 43 -and $NaturalObserved.logs.Count -eq 1 -and $NaturalObserved.logs[0].affected -eq 4) 'Natural observation evidence incomplete'
$Direct=@()
foreach($RoundId in @('r5','r6')){
    $Directory="d2-leave-attendance-20261005-$RoundId"
    $Result=Read-Json "$Directory/result.json"
    Require ($Result.passed -and $Result.correctness -and $Result.preservation -and $Result.restoration -and $Result.secrets -and -not $Result.performanceMet) 'Direct replay facts or unresolved performance boundary differs'
    Require ($Result.checks.Count -eq 37 -and $Result.requests -eq 4 -and $Result.measurements.Count -eq 4) 'Direct replay counts differ'
    Require ($Result.profiling -eq ($RoundId -eq 'r6')) 'Ordinary and diagnostic runs must remain distinct'
    foreach($Name in @('verify-d2-leave-attendance.mjs','run-d2-leave-attendance.ps1','run-d2-leave-attendance-allowance.mjs')){
        $Expected=@((Read-Json "$Directory/inputs.json")|Where-Object {$_.Path.Replace('\','/') -eq "scripts/$Name"})
        Require ($Expected.Count -eq 1 -and (Get-FileHash -LiteralPath (Join-Path $Evidence "$Directory/original-$Name")).Hash -eq $Expected[0].Hash) 'Retained replay original differs'
    }
    $Direct+=[pscustomobject]@{Round=$RoundId;Checks=37;Requests=4;Profiling=$Result.profiling;PerformanceMet=$false;Milliseconds=@($Result.measurements|ForEach-Object milliseconds)}
}
$Profile=Read-Json 'd2-cold-first-profile-20261005-r1/result.json'
Require ($Profile.passed -and $Profile.profilesStopped -and $Profile.inputsUnchanged -and -not $Profile.performanceAcceptance) 'Profile was not fully stopped'
$Analyzer=Read-Json 'd2-cold-first-profile-20261005-r1/analyzer-input-r2.json'
Require ((Get-FileHash -LiteralPath $Analyzer.Path).Hash -eq $Analyzer.Hash) 'Profile analyzer changed'
$Adjacent=Get-Content -LiteralPath (Join-Path $Evidence 'h3-portal-finance-adjacent-20261002-r95/summary.log') -Raw
Require ($Adjacent -match 'H3_FINANCE_ADJACENT: files=(\d+); changed=0; exit=0; production_modified=false') 'Adjacent regression incomplete'
$AdjacentInputs=[int]$Matches[1]
$State=Get-Content -LiteralPath (Join-Path $Root '.cloudflow-runtime/batch-g-integration/9799534e1a3a47b5958330f14ae16dc7/state.json') -Raw|ConvertFrom-Json
foreach($Owned in $State.processes){
    $Process=Get-CimInstance Win32_Process -Filter "ProcessId=$($Owned.id)"
    Require ($Process -and $Process.CommandLine.Contains($Owned.marker)) 'Reference runtime process ownership differs'
}
$Healthy=0
foreach($Service in $State.services){Require ((Invoke-RestMethod -Uri "http://127.0.0.1:$($Service.healthPort)/actuator/health" -TimeoutSec 5).status -eq 'UP') 'Reference service unhealthy';$Healthy++}
foreach($ProfileService in $Profile.profiles){
    $Owned=@($State.processes|Where-Object name -EQ $ProfileService.name)[0]
    $CheckPath=Join-Path $Evidence "d2-natural-performance-stage-$Round-$($ProfileService.name)-jfr-check.log"
    & jcmd $Owned.id JFR.check *> $CheckPath
    Require ($LASTEXITCODE -eq 0 -and (Get-Content -LiteralPath $CheckPath -Raw) -notmatch 'name=D2ColdFirst') 'First-request profile still active'
}
$Summary=[pscustomobject]@{passed=$true;backend='r89';frontend='r58';currentInputs=$Current.Count;adjacentInputs=$AdjacentInputs;natural=$Retained;naturalChecks=66;naturalBusinessChecks=23;earlyObservations=43;naturalAffected=4;originalFiveAmObserved=$false;direct=$Direct;profilesStopped=$true;processes=$State.processes.Count;healthyServices=$Healthy;globalComplete=$false;d2All17Complete=$false;remaining=@('Direct first-request performance below500ms','Current D2 all17 unified acceptance','D3 and global35PRD681')}
$Summary|ConvertTo-Json -Depth 6|Set-Content -LiteralPath $Report -Encoding utf8NoBOM
Write-Output "D2_NATURAL_PERFORMANCE_STAGE: inputs=$($Current.Count); adjacent=$AdjacentInputs; natural=true; profiles_stopped=true; processes=$($State.processes.Count); healthy=$Healthy; first_request_performance=false; global_complete=false"
