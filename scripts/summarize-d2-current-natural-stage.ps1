param([ValidatePattern('^r[1-9][0-9]*$')][string]$Round='r1',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$RuntimeRound='r4',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$AdjacentRound='r156')
$ErrorActionPreference='Stop'
. 'D:\CloudFlowPro\.cloudflow-runtime\use-data-drive.ps1'
$Root='D:\CloudFlowPro'
$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
$Directory=Join-Path $Evidence "d2-natural-daily-20261005-$RuntimeRound"
$Output=Join-Path $Evidence "d2-current-natural-stage-20261007-$Round.json"
if(Test-Path -LiteralPath $Output){throw 'Retain previous current natural stage'}
function Require([bool]$Condition,[string]$Message){if(-not $Condition){throw $Message}}
function Read-Json([string]$File){Get-Content -LiteralPath $File -Raw|ConvertFrom-Json}
$ReportHash=(Get-FileHash -LiteralPath $PSCommandPath).Hash
$Runtime=Read-Json (Join-Path $Directory 'launcher-result.json')
$Actual=Read-Json (Join-Path $Directory 'result.json')
$Observed=Read-Json (Join-Path $Directory 'observed.json')
Require ($Runtime.passed -and $Runtime.verifierExit -eq 0 -and $Runtime.inputsUnchanged -and $Runtime.processesStopped -and $Runtime.referenceHealthy -and -not $Runtime.priorRuntimeWritten -and $Runtime.backend -eq 'r116' -and $Runtime.frontend -eq 'r75') 'Current natural runtime incomplete'
Require ($Actual.passed -and $Actual.failed -eq 0 -and $Actual.checks -eq $Actual.checkResults.Count -and @($Actual.checkResults|Where-Object{-not $_.passed}).Count -eq 0 -and $Actual.requests -eq 4 -and $Actual.naturalScheduler -and $Actual.independentMysql -and $Actual.independentRedis -and $Actual.realHttp -and $Actual.realDistributedLock) 'Current natural business incomplete'
Require ($Actual.secrets.leaks -eq 0 -and $Actual.secrets.files -ge 4 -and -not $Actual.originalFiveAmObserved) 'Current natural secret check or scope missing'
$Schedule=$Observed.schedule
Require ($Schedule.originalCron -eq '0 0 5 * * ?' -and $Schedule.periodDays -eq 1 -and $Schedule.manualTriggers -eq 0 -and $Schedule.databaseTimeWrites -eq 0 -and $Schedule.clockChanges -eq 0 -and -not $Schedule.originalFiveAmObserved -and $Schedule.timezone -eq 'Asia/Shanghai' -and $Observed.earlyObservations -gt 0) 'Natural scheduling scope differs'
Require ($Observed.logs.Count -eq 1) 'Natural task executed more than once'
$Execution=$Observed.logs[0]
Require ($Execution.status -eq 'SUCCESS' -and $Execution.affected -eq 4 -and $Execution.trigger -eq 'CRON' -and -not $Execution.actor -and $Execution.report -and $Execution.start -ge $Schedule.expectedAt-1000 -and $Execution.start -le $Schedule.expectedAt+10000 -and $Execution.end -ge $Execution.start) 'Natural execution or report incomplete'
Require ($Observed.requests.Count -eq 4 -and @($Observed.requests|Where-Object{$_.status -in @(401,403)}).Count -eq 3 -and @($Observed.requests|Where-Object{$_.status -eq 200}).Count -eq 1) 'Internal authentication verification incomplete'
$Run=[IO.Path]::GetFullPath($Runtime.run)
Require ((Split-Path -Parent $Run) -eq (Join-Path $Root '.cloudflow-runtime/d2-natural-daily') -and (Split-Path -Leaf $Run) -match '^[a-f0-9]{32}$') 'Natural runtime ownership mismatch'
$State=Read-Json (Join-Path $Run 'state.json')
Require ($State.status -eq 'STOPPED' -and $State.processes.Count -eq 4 -and $State.services.Count -eq 2 -and $State.tables -eq 374) 'Independent natural process set incomplete'
foreach($Entry in $State.processes){$Process=Get-CimInstance Win32_Process -Filter "ProcessId=$($Entry.id)";Require (-not $Process -or -not $Process.CommandLine.Contains($Entry.marker)) 'Independent natural process remains running'}
$Adjacent=Join-Path $Evidence "h3-portal-finance-adjacent-20261002-$AdjacentRound"
$AdjacentLog=Get-Content -LiteralPath (Join-Path $Adjacent 'summary.log') -Raw
Require ($AdjacentLog -match 'H3_FINANCE_ADJACENT: files=\d+; changed=0; exit=0; production_modified=false' -and $AdjacentLog -match 'regenerated_matches_formal=true; formal_modified=false') 'Current adjacent regression incomplete'
$Oa=Get-Content -LiteralPath (Join-Path $Adjacent 'oa-database.log') -Raw
Require ($Oa -match 'Complete approved schema table count; expected=374; actual=374' -and $Oa -match 'PASS: 1012 OA boundary assertions') 'Formal schema regression incomplete'
$Menu=Get-Content -LiteralPath (Join-Path $Adjacent 'menu.log') -Raw
Require ($Menu -match 'EMPLOYEE_UNEXPECTED_GRANTS=0; EMPLOYEE_UNEXPECTED_WRITE_PERMISSIONS=0' -and $Menu -match 'APPROVED_MENU_SCOPE_PASS=true') 'Menu regression incomplete'
$Inputs=@{}
foreach($File in @((Join-Path $Directory 'inputs.json'),(Join-Path $Directory 'runtime-inputs.json'),(Join-Path $Adjacent 'inputs.json'))){
    foreach($Item in @(Read-Json $File)){
        $Path=[IO.Path]::GetFullPath($Item.Path,$Root)
        Require ($Path.StartsWith($Root+'\',[StringComparison]::OrdinalIgnoreCase)) 'Input outside workspace'
        Require (-not $Inputs.ContainsKey($Path) -or $Inputs[$Path] -eq $Item.Hash) 'Current input snapshots conflict'
        $Inputs[$Path]=$Item.Hash
    }
}
foreach($File in $Inputs.Keys){Require ((Get-FileHash -LiteralPath $File).Hash -eq $Inputs[$File]) 'Current input changed'}
foreach($Name in @('run-d2-natural-daily.ps1','verify-d2-natural-daily.mjs')){
    $Original=Join-Path $Directory "original-$Name"
    Require ((Get-FileHash -LiteralPath $Original).Hash -eq $Inputs[(Join-Path $Root "scripts/$Name")]) 'Actual execution original changed'
}
$LayeredFiles=0
foreach($Service in $State.services){
    $Arguments=@(Get-Content -LiteralPath (Join-Path $Run "$($Service.name)/service.args"))
    $Index=[Array]::IndexOf($Arguments,'-cp')
    Require ($Index -ge 0 -and $Arguments[$Index+2] -eq 'org.springframework.boot.loader.launch.JarLauncher') 'Actual natural launch changed'
    $Layer=[IO.Path]::GetFullPath($Arguments[$Index+1].Trim('"'))
    $Files=@(Get-ChildItem -LiteralPath $Layer -Recurse -Force)
    Require (@($Files|Where-Object{$_.Attributes -band [IO.FileAttributes]::ReparsePoint}).Count -eq 0) 'Reference layer redirected'
    foreach($File in $Files|Where-Object{-not $_.PSIsContainer}){Require ($Inputs.ContainsKey($File.FullName)) 'Untracked layered file';$LayeredFiles++}
}
Require ($LayeredFiles -eq $Runtime.layeredFiles) 'Natural layered file count changed'
$Preparation=Join-Path $Evidence 'd2-natural-current-prep-20261007-r1'
$Old=Read-Json (Join-Path $Preparation 'original.json')
$OldCopy=Join-Path $Preparation 'original-run-d2-natural-daily.ps1'
Require ((Get-FileHash -LiteralPath $OldCopy).Hash -eq $Old.Hash) 'Pre-change natural runner original changed'
$OldAdjacent=@(Read-Json (Join-Path $Evidence 'h3-portal-finance-adjacent-20261002-r155/inputs.json'))|Where-Object{[IO.Path]::GetFullPath($_.Path,$Root) -eq $Old.Source}
Require ($OldAdjacent.Hash -eq $Old.Hash) 'Previous H2 adjacent source is not preserved'
$Reference=Read-Json (Join-Path $Root '.cloudflow-runtime/batch-g-integration/9799534e1a3a47b5958330f14ae16dc7/state.json')
Require ($Reference.status -eq 'RUNNING' -and $Reference.processes.Count -eq 9 -and $Reference.services.Count -eq 6) 'Reference service set changed'
foreach($Entry in $Reference.processes){$Process=Get-CimInstance Win32_Process -Filter "ProcessId=$($Entry.id)";Require ($Process -and $Process.CommandLine.Contains($Entry.marker)) 'Reference process identity changed'}
foreach($Service in $Reference.services){Require ((Invoke-RestMethod "http://127.0.0.1:$($Service.healthPort)/actuator/health" -TimeoutSec 10).status -eq 'UP') 'Reference service unhealthy'}
Require ((Get-FileHash -LiteralPath $PSCommandPath).Hash -eq $ReportHash) 'Stage source changed'
$Summary=[pscustomobject]@{passed=$true;backend='r116';frontend='r75';checks=$Actual.checks;requests=$Actual.requests;sqlCalls=$Actual.sqlCalls;
    currentInputs=$Inputs.Count;layeredFiles=$LayeredFiles;executionOriginals=2;previousRunnerOriginalHash=$Old.Hash;independentRun=$Run;independentProcessesStopped=4;
    referenceProcesses=9;referenceHealthyServices=6;naturalScheduler=$true;schedule=$Schedule;execution=$Execution;earlyObservations=$Observed.earlyObservations;
    originalFiveAmObserved=$false;nextDayIntervalObserved=$false;secrets=$Actual.secrets;adjacentRound=$AdjacentRound;formalTables=374;oaAssertions=1012;
    actualResultHash=(Get-FileHash -LiteralPath (Join-Path $Directory 'result.json')).Hash;reportHash=$ReportHash;productModified=$false;globalComplete=$false;
    remaining=@('D2 ordinary first request: R22 721.31ms exceeds 500ms','D2 all 17 acceptance items','H2 all 37 acceptance items and current referral repayment','Global35PRD681')}
$Summary|ConvertTo-Json -Depth 8|Set-Content -LiteralPath $Output -Encoding utf8NoBOM
"D2_CURRENT_NATURAL_STAGE: passed=true; checks=$($Actual.checks); requests=$($Actual.requests); current_inputs=$($Inputs.Count); layered_files=$LayeredFiles; reference_healthy_services=6; global_complete=false"
