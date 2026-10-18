param([ValidatePattern('^r[1-9][0-9]*$')][string]$Round='r1',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$AdjacentRound='r163')
$ErrorActionPreference='Stop'
. 'D:\CloudFlowPro\.cloudflow-runtime\use-data-drive.ps1'
$Root='D:\CloudFlowPro'
$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
$Run=Join-Path $Root '.cloudflow-runtime/batch-g-integration/9799534e1a3a47b5958330f14ae16dc7'
$Output=Join-Path $Evidence "d2-employee-projection-stage-20261007-$Round.json"
if(Test-Path -LiteralPath $Output){throw 'Retain previous startup stage'}
function Require([bool]$Value,[string]$Message){if(-not $Value){throw $Message}}
function Read-Json([string]$File){Get-Content -LiteralPath $File -Raw|ConvertFrom-Json}
$Inputs=@{}
$CorrectionFile=Join-Path $Evidence 'd2-employee-projection-prep-20261007-r1/summary-correction.json'
$Correction=Read-Json $CorrectionFile
$script:SummaryReconciliations=0
Require ($Correction.Source -eq $PSCommandPath -and $Correction.AfterHash -eq (Get-FileHash $PSCommandPath).Hash -and $Correction.OnlySummarySourceChanged) 'Summary-only correction metadata differs'
function Track([string]$File,[string]$Hash){
    $Path=[IO.Path]::GetFullPath($File,$Root)
    Require ($Path.StartsWith($Root+'\',[StringComparison]::OrdinalIgnoreCase)) 'Input outside owned workspace'
    if(-not $Hash){$Hash=(Get-FileHash -LiteralPath $Path).Hash}
    # The completed adjacent run fingerprints the original, unexecuted report draft.
    # Preserve that exact draft and reconcile only this report's corrected polling count.
    if($Path -eq $PSCommandPath -and $Inputs.ContainsKey($Path) -and $Inputs[$Path] -ne $Hash){
        Require ($Hash -eq $Correction.BeforeHash -and $Inputs[$Path] -eq $Correction.AfterHash -and (Get-FileHash $Correction.Original).Hash -eq $Hash) 'Unreviewed summary input change'
        Track $Correction.Original $Hash
        $script:SummaryReconciliations++
        return
    }
    Require (-not $Inputs.ContainsKey($Path) -or $Inputs[$Path] -eq $Hash) 'Evidence snapshots conflict'
    $Inputs[$Path]=$Hash
}
function Merge([string]$File){Track $File '';foreach($Item in @(Read-Json $File)){Track $Item.Path $Item.Hash}}
Track $PSCommandPath ''
Track $CorrectionFile ''
$Startup=Join-Path $Evidence 'd2-current-first-20261006-r10'
$First=Join-Path $Evidence 'd2-employee-first-continuation-20261007-r1'
$Business=Join-Path $Evidence 'd2-leave-attendance-20261005-r26'
$Package=Join-Path $Evidence 'backend-executable-verification-20261006-r9'
$Adjacent=Join-Path $Evidence "h3-portal-finance-adjacent-20261002-$AdjacentRound"
foreach($Directory in @($First,$Business,$Package,$Adjacent)){Merge (Join-Path $Directory 'inputs.json')}
Merge (Join-Path $Startup 'layered-runtime-inputs.json')
$Measurement=Read-Json (Join-Path $First 'measurement-result.json')
$Actual=Read-Json (Join-Path $Business 'result.json')
$Precondition=Read-Json (Join-Path $First 'precondition.json')
Require ($Precondition.OriginalStartup -eq 'r10' -and $Precondition.FailedBusiness -eq 'r25' -and $Precondition.ServicesUnchanged -and $Precondition.PriorBusinessRequests -eq 0 -and $Precondition.NoBusinessWarmup -and -not $Precondition.Profiling -and $Precondition.OriginalFailureRetained) 'Unmeasured startup continuation evidence incomplete'
Require ($Measurement.OriginalHandle -eq 52892 -and $Measurement.OriginalExit -eq 1 -and $Measurement.NoPriorBusinessRequest -and $Measurement.OriginalServicesUnchanged) 'Original failed invocation must remain explicit'
Track (Join-Path $First 'precondition.json') ''
$FailureFile=Join-Path $Evidence 'd2-employee-projection-prep-20261007-r1/first-preflight-failure.json'
$Failure=Read-Json $FailureFile
Require ($Failure.Exit -eq 1 -and $Failure.BusinessRequests -eq 0 -and $Failure.CaptchaBefore -eq $Failure.CaptchaAfter -and $Failure.Restored -and $Failure.Originals.Count -eq 3) 'Retained preflight failure differs'
Track $FailureFile ''
foreach($Item in $Failure.Originals){Require ((Get-FileHash $Item.Original).Hash -eq $Item.Hash) 'Recovered original differs';Track $Item.Original ''}

Require ($Measurement.Passed -and $Measurement.BusinessPassed -and $Measurement.BackendRound -eq 'r118' -and $Measurement.FrontendRound -eq 'r76' -and $Measurement.HrReloadedLast -and $Measurement.Layered -and -not $Measurement.Profiling -and $Measurement.InputChanges -eq 0 -and $Measurement.RuntimeInputChanges -eq 0 -and $Measurement.Services.Count -eq 6 -and @($Measurement.Services|Where-Object Exit -ne 0).Count -eq 0) 'Ordinary first request evidence incomplete'
Require ($Actual.passed -and $Actual.checks.Count -eq 37 -and $Actual.requests -eq 4 -and -not $Actual.profiling) 'Business coverage differs'
foreach($Flag in @('correctness','approval','exclusion','fractions','preservation','restoration','secrets')){Require ($Actual.$Flag -eq $true) 'Business protection failed'}
Require ($Actual.measurements.Count -eq 4 -and $Actual.performanceMet -eq (@($Actual.measurements|Where-Object milliseconds -ge 500).Count -eq 0)) 'Measured performance flag differs from all four observations'
Require (($Actual.measurements|ConvertTo-Json -Depth 4 -Compress) -ceq ($Measurement.Measurements|ConvertTo-Json -Depth 4 -Compress)) 'Measurement copy differs'
foreach($File in @((Join-Path $First 'measurement-result.json'),(Join-Path $Business 'result.json'),(Join-Path $Business 'fixture.json'),(Join-Path $First 'verification-result-original.json'))){Track $File ''}
Require ((Get-FileHash (Join-Path $Business 'result.json')).Hash -eq (Get-FileHash (Join-Path $First 'verification-result-original.json')).Hash) 'Original result copy differs'
$Packages=Read-Json (Join-Path $Package 'result.json')
Require ($Packages.Passed -and $Packages.BackendRound -eq 'r118' -and $Packages.Services.Count -eq 6 -and $Packages.InputChanges -eq 0) 'Six verified packages required'
Track (Join-Path $Package 'result.json') ''
foreach($Item in $Packages.Services){Track $Item.Path $Item.Hash}
$Before=@{}
$BeforeFile=Join-Path $Evidence 'h3-portal-finance-20261002-backend-r117-inputs.json'
Track $BeforeFile ''
foreach($Item in @(Read-Json $BeforeFile)){$Before[$Item.Path]=$Item.Hash}
$AfterFile=Join-Path $Evidence 'h3-portal-finance-20261002-backend-r118-inputs.json'
Track $AfterFile ''
$After=@(Read-Json $AfterFile)
$Changes=@($After|Where-Object{-not $Before.ContainsKey($_.Path) -or $Before[$_.Path] -ne $_.Hash})
$ExpectedChanges=@(
    'cloudflow-backend\cloudflow-service-hr\src\main\java\com\cloudflow\hr\service\HrRuleSupport.java',
    'cloudflow-backend\cloudflow-service-hr\src\main\java\com\cloudflow\hr\service\HrAttendanceBusinessService.java')
Require ($After.Count -eq $Before.Count -and $Changes.Count -eq 2 -and @(Compare-Object @($Changes.Path) $ExpectedChanges).Count -eq 0) 'Only two intended employee projection source changes allowed'
$Prep=Join-Path $Evidence 'd2-employee-projection-prep-20261007-r1'
$Originals=@(Read-Json (Join-Path $Prep 'originals.json'))
$Audited=@(Read-Json (Join-Path $Prep 'changes.json'))
Require ($Originals.Count -eq 3 -and $Audited.Count -eq 3) 'Three original sources required'
foreach($Original in $Originals){
    $Path=[IO.Path]::GetFullPath($Original.Path,$Root)
    $AuditedFile=@($Audited|Where-Object {[IO.Path]::GetFullPath($_.Path,$Root) -eq $Path})
    Require ($AuditedFile.Count -eq 1 -and $AuditedFile[0].BeforeHash -eq $Original.Hash -and (Get-FileHash $Original.Original).Hash -eq $Original.Hash -and $AuditedFile[0].AfterHash -eq $Inputs[$Path]) 'Source original or audited change differs'
    if($Original.Path.StartsWith('cloudflow-backend/')){Require ($Before[$Original.Path.Replace('/','\')] -eq $Original.Hash) 'Product original differs from B117'}
    Track $Original.Original ''
}
Track (Join-Path $Prep 'originals.json') '';Track (Join-Path $Prep 'changes.json') ''
$Database=Join-Path $Evidence 'd2-month-batch-checks-20261005-r11'
$Db=Read-Json (Join-Path $Database 'result.json')
Require ($Db.Passed -and $Db.Checks -eq 445 -and $Db.BackendRound -eq 'r118' -and $Db.ActualDatabase -and $Db.ActualService -and -not $Db.DistributedLock -and -not $Db.Http -and $Db.ScratchCleaned -and $Db.InputChanges -eq 0) 'Actual projected employee database coverage incomplete'
Merge (Join-Path $Database 'inputs.json')
# Compiled dependencies are verified separately because the approved cache is outside the workspace.
$BinaryInputs=@(Read-Json (Join-Path $Database 'binary-inputs.json'))
foreach($Item in $BinaryInputs){
    $Path=[IO.Path]::GetFullPath($Item.Path,$Root)
    Require ($Path.StartsWith($Root+'\',[StringComparison]::OrdinalIgnoreCase) -or $Path.StartsWith('D:\CloudFlowProCache\',[StringComparison]::OrdinalIgnoreCase)) 'Compiled dependency outside approved drive roots'
    Require ((Get-FileHash -LiteralPath $Path).Hash -eq $Item.Hash) 'Compiled database dependency changed'
}
Track (Join-Path $Database 'binary-inputs.json') '';Track (Join-Path $Database 'result.json') ''
$Cases=@(
    @{Name='rules';Directory='d2-rules-live-20261005-r12';Checks=476;Requests=231;Prefix='RULES';Flags=@('configuration','rules','rawFacts','recalculation','calendar','geofence','preservation','secrets')},
    @{Name='scale';Directory='d2-scale-attendance-20261005-r3';Checks=1063;Requests=1026;Prefix='SCALE';Flags=@('correctness','asynchronous','results','ownership','preservation','secrets')})
$Suites=@();$SuiteScans=@();$CaptchaLogs=@((Join-Path $First 'verification.log'))
foreach($Case in $Cases){
    $Directory=Join-Path $Evidence $Case.Directory
    $Result=Read-Json (Join-Path $Directory 'result.json')
    if($Case.Name -eq 'scale'){
        $PriorFile=Join-Path $Evidence 'd2-scale-attendance-20261005-r2/result.json'
        $Prior=Read-Json $PriorFile
        $BeforeBusiness=@($Prior.checks|Where-Object{$_ -notmatch '^GET_/hr/attendance/tasks/' -and $_ -notmatch '^completed_days_do_not_decrease_\d+$'})
        $AfterBusiness=@($Result.checks|Where-Object{$_ -notmatch '^GET_/hr/attendance/tasks/' -and $_ -notmatch '^completed_days_do_not_decrease_\d+$'})
        Require ($BeforeBusiness.Count -eq 1031 -and ($BeforeBusiness|ConvertTo-Json -Compress) -ceq ($AfterBusiness|ConvertTo-Json -Compress)) 'Non-poll scale assertions differ'
        Track $PriorFile '';Track (Join-Path $Prep 'scale-coverage-comparison.json') ''
    }
    Require ($Result.passed -and $Result.checks.Count -eq $Case.Checks -and $Result.requests -eq $Case.Requests) 'Associated business coverage incomplete'
    foreach($Flag in $Case.Flags){Require ($Result.$Flag -eq $true) 'Associated business outcome failed'}
    Merge (Join-Path $Directory 'inputs.json')
    foreach($Name in @('result.json','fixture.json','live.log')){Track (Join-Path $Directory $Name) ''}
    $Log=Get-Content (Join-Path $Directory 'live.log') -Raw
    Require ($Log -match ('D2_'+$Case.Prefix+'_LOG_SCAN: (\{[^\r\n]+\})')) 'Associated secret scan missing'
    $CaseScan=$Matches[1]|ConvertFrom-Json
    Require ($CaseScan.files -ge 6 -and $CaseScan.sensitiveValues -gt 0 -and $CaseScan.leaks -eq 0) 'Associated secret scan failed'
    $SuiteScans+=[pscustomobject]@{Name=$Case.Name;Scan=$CaseScan}
    $Suites+=[pscustomobject]@{Name=$Case.Name;Checks=$Case.Checks;Requests=$Case.Requests;Result=(Join-Path $Directory 'result.json');Hash=(Get-FileHash (Join-Path $Directory 'result.json')).Hash}
    $CaptchaLogs+=Join-Path $Evidence ("d2-employee-projection-"+$Case.Name+"-20261007-"+$(if($Case.Name -eq 'rules'){'r12'}else{'r3'})+"-launch.log")
}
$CaptchaSequence=@()
foreach($File in $CaptchaLogs){
    $Log=Get-Content $File -Raw
    Require ($Log -match 'OWNED_CAPTCHA_RESTORED: original_limit=100; original_ttl=-1; counter_before=(\d+); counter_after=(\d+); counter_writes=0; database_unchanged=true; production_modified=false') 'Suite captcha restoration missing'
    $CaptchaSequence+=[pscustomobject]@{Before=[int]$Matches[1];After=[int]$Matches[2];Writes=0}
    Track $File ''
}
for($Index=1;$Index -lt $CaptchaSequence.Count;$Index++){Require ($CaptchaSequence[$Index].Before -eq $CaptchaSequence[$Index-1].After) 'Captcha sequence differs'}
$Log=Get-Content (Join-Path $Business 'live.log') -Raw
Require ($Log -match 'D2_LEAVE_LOG_SCAN: (\{[^\r\n]+\})') 'Business secret scan missing'
$Scan=$Matches[1]|ConvertFrom-Json
Require ($Scan.files -ge 6 -and $Scan.sensitiveValues -gt 0 -and $Scan.leaks -eq 0) 'Secret scan failed'
Track (Join-Path $Business 'live.log') ''
$Log=Get-Content (Join-Path $First 'verification.log') -Raw
Require ($Log -match 'OWNED_CAPTCHA_RESTORED: original_limit=100; original_ttl=-1; counter_before=(\d+); counter_after=(\d+); counter_writes=0; database_unchanged=true; production_modified=false') 'Captcha restoration missing'
$Captcha=[pscustomobject]@{Before=[int]$Matches[1];After=[int]$Matches[2];Writes=0}
Track (Join-Path $First 'verification.log') ''
Require ((Get-FileHash (Join-Path $First 'original.ps1')).Hash -eq $Inputs[(Join-Path $Root 'scripts/run-d2-employee-first-continuation.ps1')]) 'Actual launch original changed'
Track (Join-Path $First 'original.ps1') ''
$AdjacentLog=Get-Content (Join-Path $Adjacent 'summary.log') -Raw
Require ($AdjacentLog -match 'H3_FINANCE_ADJACENT: files=(\d+); changed=0; exit=0; production_modified=false' -and $AdjacentLog.Contains('regenerated_matches_formal=true; formal_modified=false')) 'Adjacent checks incomplete'
$Oa=Get-Content (Join-Path $Adjacent 'oa-database.log') -Raw
Require ($Oa.Contains('Complete approved schema table count; expected=374; actual=374') -and $Oa.Contains('PASS: 1012 OA boundary assertions')) 'Database checks incomplete'
$Menu=Get-Content (Join-Path $Adjacent 'menu.log') -Raw
Require ($Menu.Contains('EMPLOYEE_UNEXPECTED_GRANTS=0; EMPLOYEE_UNEXPECTED_WRITE_PERMISSIONS=0') -and $Menu.Contains('APPROVED_MENU_SCOPE_PASS=true')) 'Menu scope check failed'
foreach($Name in @('summary.log','oa-database.log','menu.log')){Track (Join-Path $Adjacent $Name) ''}
foreach($File in $Inputs.Keys){Require ((Get-FileHash -LiteralPath $File).Hash -eq $Inputs[$File]) 'Current input changed'}
$State=Read-Json (Join-Path $Run 'state.json')
Require ($State.status -eq 'RUNNING' -and $State.processes.Count -eq 9 -and $State.services.Count -eq 6) 'Owned runtime incomplete'
foreach($Entry in $State.processes){$Observed=Get-CimInstance Win32_Process -Filter "ProcessId=$($Entry.id)";Require ($Observed -and $Observed.CommandLine.Contains($Entry.marker)) 'Owned process identity differs'}
$LayeredFiles=0
foreach($Service in $State.services){
    $Arguments=@(Get-Content (Join-Path $Run "$($Service.name)/service.args"))
    $Index=[Array]::IndexOf($Arguments,'-cp')
    Require ($Index -ge 0 -and $Arguments[$Index+2] -eq 'org.springframework.boot.loader.launch.JarLauncher') 'Actual layered launch differs'
    $Layer=[IO.Path]::GetFullPath($Arguments[$Index+1].Trim('"'))
    Require ((Split-Path -Parent $Layer) -eq (Join-Path $Run "$($Service.name)/artifacts")) 'Layer outside owned service'
    $Files=@(Get-ChildItem -LiteralPath $Layer -Recurse -Force)
    Require (@($Files|Where-Object{$_.Attributes -band [IO.FileAttributes]::ReparsePoint}).Count -eq 0) 'Layer redirected'
    foreach($File in $Files|Where-Object{-not $_.PSIsContainer}){Require ($Inputs.ContainsKey($File.FullName)) 'Untracked runtime file';$LayeredFiles++}
    Require ((Invoke-RestMethod "http://127.0.0.1:$($Service.healthPort)/actuator/health" -TimeoutSec 15).status -eq 'UP') 'Service unhealthy'
}
Require ($LayeredFiles -eq $Measurement.RuntimeInputs) 'Actual layered file count differs'
Require ($script:SummaryReconciliations -eq 1) 'Exactly one report-only input reconciliation required'
$Snapshot=@($Inputs.Keys|Sort-Object|ForEach-Object{[pscustomobject]@{Path=$_;Hash=$Inputs[$_]}})
$Snapshot|ConvertTo-Json|Set-Content -LiteralPath ($Output.Replace('.json','-inputs.json')) -Encoding utf8NoBOM
[pscustomobject]@{Passed=$true;Backend='r118';Frontend='r76';Checks=37;Requests=4;InputChanges=0;CurrentInputs=$Inputs.Count;
    LayeredFiles=$LayeredFiles;ProductChanges=2;DatabaseChecks=445;AdditionalDatabaseChecks=59;BinaryInputs=$BinaryInputs.Count;
    SummarySourceChangedAfterAdjacent=$true;SummaryReconciliations=$script:SummaryReconciliations;SummaryCorrection=$Correction;NonPollScaleAssertionsUnchanged=1031;
    OrdinaryMilliseconds=@($Actual.measurements.milliseconds);OrdinaryPerformanceMet=$Actual.performanceMet;StablePerformanceImprovementProven=$false;
    BusinessPreserved=$true;Restored=$true;OriginalStartupHandle=52892;OriginalStartupExit=1;PreflightFailurePreserved=$true;FirstBusinessContinuation=$true;Captcha=$CaptchaSequence;Secrets=$Scan;AssociatedSuites=$Suites;AssociatedScans=$SuiteScans;
    AdjacentRound=$AdjacentRound;FormalTables=374;OaAssertions=1012;OwnedProcesses=9;HealthyServices=6;
    ActualResultHash=(Get-FileHash (Join-Path $Business 'result.json')).Hash;AllD2Complete=$false;GlobalComplete=$false
}|ConvertTo-Json -Depth 7|Set-Content -LiteralPath $Output -Encoding utf8NoBOM
"D2_EMPLOYEE_PROJECTION_STAGE: current_inputs=$($Inputs.Count); layered_files=$LayeredFiles; database_checks=445; ordinary_first_ms=$($Actual.measurements[0].milliseconds); performance_met=$($Actual.performanceMet); healthy=6; global_complete=false"
