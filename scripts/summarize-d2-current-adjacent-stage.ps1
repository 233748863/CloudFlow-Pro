param([ValidatePattern('^r[1-9][0-9]*$')][string]$Round='r1',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$ExecutionRound='r2',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$AdjacentRound='r151')
$ErrorActionPreference='Stop'
. 'D:\CloudFlowPro\.cloudflow-runtime\use-data-drive.ps1'
$Root='D:\CloudFlowPro'
$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
$Run=Join-Path $Root '.cloudflow-runtime/batch-g-integration/9799534e1a3a47b5958330f14ae16dc7'
$Execution=Join-Path $Evidence "d2-current-adjacent-20261007-$ExecutionRound"
$Adjacent=Join-Path $Evidence "h3-portal-finance-adjacent-20261002-$AdjacentRound"
$Output=Join-Path $Evidence "d2-current-adjacent-stage-20261007-$Round.json"
if(Test-Path -LiteralPath $Output){throw 'Retain existing D2 stage report'}
function Require([bool]$Value,[string]$Message){if(-not $Value){throw $Message}}
function Read-Json([string]$File){Get-Content -LiteralPath $File -Raw|ConvertFrom-Json}
$SourceHash=(Get-FileHash -LiteralPath $PSCommandPath).Hash
$Actual=Read-Json (Join-Path $Execution 'result.json')
Require ($Actual.Passed -and $Actual.Backend -eq 'r115' -and $Actual.Frontend -eq 'r75' -and $Actual.Steps.Count -eq 3 -and $Actual.InputsPreserved -and $Actual.OriginalPackagesPreserved -and $Actual.StepsRunSerially -and -not $Actual.ProductModified -and -not $Actual.FirstRequestPerformanceMeasured -and -not $Actual.AllD2Complete -and -not $Actual.GlobalComplete) 'Current D2 serial result incomplete'
$Expected=@{rules=@{round='r10';checks=476;requests=231};privacy=@{round='r5';checks=94;requests=46};appeals=@{round='r4';checks=117;requests=58}}
$Scans=@();$Results=@{};$LastCounter=$null
foreach($Step in $Actual.Steps){
    Require ($Expected.ContainsKey($Step.Name) -and $Step.Round -eq $Expected[$Step.Name].round -and $Step.Passed -and $Step.Exit -eq 0 -and $Step.Checks -eq $Expected[$Step.Name].checks -and $Step.Requests -eq $Expected[$Step.Name].requests -and $Step.CaptchaRestored) 'D2 individual stage incomplete'
    Require ($null -eq $LastCounter -or $Step.CaptchaBefore -eq $LastCounter) 'Captcha counters disconnected'
    $LastCounter=$Step.CaptchaAfter
    Require ((Get-FileHash -LiteralPath $Step.Result).Hash -eq $Step.ResultHash) 'Actual D2 result changed'
    $Result=Read-Json $Step.Result
    Require ($Result.passed -and $Result.checks.Count -eq $Step.Checks -and $Result.requests -eq $Step.Requests -and -not $Result.all17Complete -and -not $Result.globalComplete) 'Inner D2 result differs'
    foreach($Flag in $Step.Flags){Require ($Result.$Flag -eq $true) 'Current D2 outcome missing'}
    $Results[$Step.Name]=$Result
    $Log=Get-Content -LiteralPath (Join-Path (Split-Path -Parent $Step.Result) 'live.log') -Raw
    Require ($Log -match 'D2_(RULES|PRIVACY|APPEALS)_LOG_SCAN: (\{[^\r\n]+\})') 'D2 secret scan missing'
    $Scan=$Matches[2]|ConvertFrom-Json
    Require ($Scan.files -ge 6 -and $Scan.sensitiveValues -gt 0 -and $Scan.leaks -eq 0) 'D2 secrets exposed'
    $Scans+=[pscustomobject]@{Name=$Step.Name;Files=$Scan.files;SensitiveValues=$Scan.sensitiveValues;Leaks=$Scan.leaks}
}
Require (@($Actual.Steps|Select-Object -ExpandProperty Name -Unique).Count -eq 3) 'Three distinct D2 cases required'
Require ($Results.privacy.matrix.Count -eq 22 -and $Results.appeals.appealCount -eq 10) 'Privacy matrix or real appeal count differs'
$RuleStep=@($Actual.Steps|Where-Object Name -eq 'rules')[0]
$RuleFixture=Read-Json (Join-Path (Split-Path -Parent $RuleStep.Result) 'fixture.json')
Require ($RuleFixture.configurationObservations.Count -eq 13 -and $RuleFixture.cases.Count -eq 22) 'Rule configuration or cases incomplete'
foreach($Pair in @(@{Name='halfDayHoursThreshold';Value='4.00';Input=4},@{Name='absentHoursThreshold';Value='2.00';Input=2})){
    $Observed=@($RuleFixture.configurationObservations|Where-Object field -eq $Pair.Name)
    Require ($Observed.Count -eq 1 -and $Observed[0].actual -ceq $Pair.Value -and $Observed[0].input -eq $Pair.Input) 'Original decimal response must remain recorded'
}
$Prior=Join-Path $Evidence 'd2-current-adjacent-20261007-r1'
$PriorResult=Read-Json (Join-Path $Prior 'result.json')
$PriorRules=Read-Json (Join-Path $Evidence 'd2-rules-live-20261005-r9/result.json')
Require (-not $PriorResult.Passed -and $PriorResult.InputsPreserved -and $PriorResult.Steps.Count -eq 1 -and $PriorResult.Steps[0].CaptchaRestored -and -not $PriorRules.passed -and $PriorRules.failure -eq 'configured_field_halfDayHoursThreshold' -and $PriorRules.checks.Count -eq 14 -and $PriorRules.requests -eq 4 -and $PriorRules.preservation -and $PriorRules.secrets) 'Original failed validator evidence or restoration missing'
function Check-Originals([string]$Directory,[int]$ExpectedCount){
    $Map=@{}
    foreach($Item in @(Read-Json (Join-Path $Directory 'inputs.json'))){$Map[[IO.Path]::GetFullPath($Item.Path,$Root)]=$Item.Hash}
    $Originals=Join-Path $Directory 'originals'
    $Files=@(Get-ChildItem -LiteralPath $Originals -Recurse -File)
    Require ($Files.Count -eq $ExpectedCount) 'Execution originals missing'
    foreach($File in $Files){$Source=Join-Path $Root ([IO.Path]::GetRelativePath($Originals,$File.FullName));Require ($Map.ContainsKey($Source) -and (Get-FileHash -LiteralPath $File.FullName).Hash -eq $Map[$Source]) 'Execution original differs from recorded input'}
}
Check-Originals $Prior $PriorResult.ExecutionOriginals
Check-Originals $Execution $Actual.ExecutionOriginals
$AdjacentLog=Get-Content -LiteralPath (Join-Path $Adjacent 'summary.log') -Raw
Require ($AdjacentLog -match 'H3_FINANCE_ADJACENT: files=(\d+); changed=0; exit=0; production_modified=false') 'Current adjacent regression incomplete'
$AdjacentInputs=[int]$Matches[1]
Require ($AdjacentLog -match 'regenerated_matches_formal=true; formal_modified=false') 'Formal seed differs'
$Oa=Get-Content -LiteralPath (Join-Path $Adjacent 'oa-database.log') -Raw
Require ($Oa -match 'Complete approved schema table count; expected=374; actual=374' -and $Oa -match 'PASS: 1012 OA boundary assertions') 'Formal database behavior incomplete'
$Menu=Get-Content -LiteralPath (Join-Path $Adjacent 'menu.log') -Raw
Require ($Menu -match 'EMPLOYEE_UNEXPECTED_GRANTS=0; EMPLOYEE_UNEXPECTED_WRITE_PERMISSIONS=0' -and $Menu -match 'APPROVED_MENU_SCOPE_PASS=true') 'Employee permission scope differs'
$PostRunChange=Read-Json (Join-Path $Evidence 'd2-current-input-index-20261007-r1.json')
Require ($PostRunChange.Path -eq (Join-Path $Root 'scripts/run-d2-current-adjacent.ps1') -and $PostRunChange.Scope -eq 'retained-input-lookup-only' -and $PostRunChange.SyntaxPassed -and -not $PostRunChange.ProductModified -and -not $PostRunChange.BusinessRunsRepeated) 'Post-run lookup change scope differs'
Require ((Get-FileHash -LiteralPath $PostRunChange.Path).Hash -eq $PostRunChange.After -and (Get-FileHash -LiteralPath (Join-Path $Execution 'originals/scripts/run-d2-current-adjacent.ps1')).Hash -eq $PostRunChange.Before) 'Post-run lookup original or final source differs'
$Inputs=@{}
foreach($File in @((Join-Path $Execution 'inputs.json'),(Join-Path $Adjacent 'inputs.json'))){
    foreach($Item in @(Read-Json $File)){
        $Path=[IO.Path]::GetFullPath($Item.Path,$Root)
        Require ($Path.StartsWith($Root+'\',[StringComparison]::OrdinalIgnoreCase)) 'Input outside owned root'
        $Hash=$Item.Hash
        if($File -eq (Join-Path $Execution 'inputs.json') -and $Path -eq $PostRunChange.Path){
            Require ($Hash -eq $PostRunChange.Before) 'Only exact original lookup input may be superseded'
            $Hash=$PostRunChange.After
        }
        Require (-not $Inputs.ContainsKey($Path) -or $Inputs[$Path] -eq $Hash) 'Current input snapshots conflict'
        $Inputs[$Path]=$Hash
    }
}
foreach($Path in $Inputs.Keys){Require ((Get-FileHash -LiteralPath $Path).Hash -eq $Inputs[$Path]) 'Current stage input changed'}
$State=Read-Json (Join-Path $Run 'state.json')
Require ($State.status -eq 'RUNNING' -and $State.processes.Count -eq 9 -and $State.services.Count -eq 6) 'Owned runtime incomplete'
foreach($Entry in $State.processes){$Observed=Get-CimInstance Win32_Process -Filter "ProcessId=$($Entry.id)";Require ($Observed -and $Observed.CommandLine.Contains($Entry.marker)) 'Owned process identity changed'}
$LayeredFiles=0
foreach($Service in $State.services){
    $Arguments=@(Get-Content -LiteralPath (Join-Path $Run "$($Service.name)/service.args"))
    $Index=[Array]::IndexOf($Arguments,'-cp')
    Require ($Index -ge 0 -and $Arguments[$Index+2] -eq 'org.springframework.boot.loader.launch.JarLauncher') 'Current layered launch differs'
    $Directory=[IO.Path]::GetFullPath($Arguments[$Index+1].Trim('"'))
    Require ($Directory.StartsWith((Join-Path $Run "$($Service.name)/artifacts")+'\',[StringComparison]::OrdinalIgnoreCase)) 'Layered directory outside owned service'
    $Files=@(Get-ChildItem -LiteralPath $Directory -Recurse -Force)
    Require (@($Files|Where-Object{$_.Attributes -band [IO.FileAttributes]::ReparsePoint}).Count -eq 0) 'Layered directory redirected'
    foreach($File in $Files|Where-Object{-not $_.PSIsContainer}){Require ($Inputs.ContainsKey($File.FullName)) 'Untracked actual layered file';$LayeredFiles++}
    Require ((Invoke-RestMethod "http://127.0.0.1:$($Service.healthPort)/actuator/health" -TimeoutSec 15).status -eq 'UP') 'Owned service unhealthy'
}
Require ($LayeredFiles -eq $Actual.LayeredFiles -and (Get-FileHash -LiteralPath $PSCommandPath).Hash -eq $SourceHash) 'Actual layered set or report source changed'
[pscustomobject]@{Passed=$true;Backend='r115';Frontend='r75';ExecutionRound=$ExecutionRound;Steps=$Actual.Steps;ActualInputs=$Actual.Inputs;CurrentInputs=$Inputs.Count;
    ExecutionOriginals=$Actual.ExecutionOriginals;LayeredFiles=$LayeredFiles;RetainedFailure=[pscustomobject]@{Round='r1';RulesRound='r9';Checks=14;Requests=4;Restored=$true;Originals=$PriorResult.ExecutionOriginals};
    ConfigurationObservations=$RuleFixture.configurationObservations;RulesCases=$RuleFixture.cases.Count;PrivacyCases=$Results.privacy.matrix.Count;Appeals=$Results.appeals.appealCount;
    OrdinaryMonthObservation=$Results.rules.singleEmployeeMonthPerformance;FirstRequestPerformanceMeasured=$false;Secrets=$Scans;AdjacentRound=$AdjacentRound;AdjacentInputs=$AdjacentInputs;FormalTables=374;OaAssertions=1012;
    OwnedProcesses=9;HealthyServices=6;ProductModified=$false;PostRunLookupChange=$PostRunChange;ReportHash=$SourceHash;AllD2Complete=$false;GlobalComplete=$false
}|ConvertTo-Json -Depth 9|Set-Content -LiteralPath $Output -Encoding utf8NoBOM
"D2_CURRENT_ADJACENT_STAGE: rules=476; privacy=94; appeals=117; current_inputs=$($Inputs.Count); originals=$($Actual.ExecutionOriginals); layered_files=$LayeredFiles; healthy=6; all_d2_complete=false; global_complete=false"

