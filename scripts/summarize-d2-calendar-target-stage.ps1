param([ValidatePattern('^r[1-9][0-9]*$')][string]$Round='r1',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$AdjacentRound='r153')
$ErrorActionPreference='Stop'
. 'D:\CloudFlowPro\.cloudflow-runtime\use-data-drive.ps1'
$Root='D:\CloudFlowPro';$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
$Run=Join-Path $Root '.cloudflow-runtime/batch-g-integration/9799534e1a3a47b5958330f14ae16dc7'
$Output=Join-Path $Evidence "d2-calendar-target-stage-20261007-$Round.json"
if(Test-Path -LiteralPath $Output){throw 'Retain previous calendar target stage'}
function Require([bool]$Value,[string]$Message){if(-not $Value){throw $Message}}
function Read-Json([string]$Path){Get-Content -LiteralPath $Path -Raw|ConvertFrom-Json}
$Inputs=@{}
function Add-Input([string]$Path,[string]$Hash){
    $Full=[IO.Path]::GetFullPath($Path,$Root)
    Require ($Full.StartsWith($Root+'\',[StringComparison]::OrdinalIgnoreCase) -or $Full.StartsWith('D:\CloudFlowProCache\',[StringComparison]::OrdinalIgnoreCase)) 'Input outside owned data drive roots'
    Require (-not $Inputs.ContainsKey($Full) -or $Inputs[$Full] -eq $Hash) 'Input snapshots conflict'
    $Inputs[$Full]=$Hash
}
function Add-File([string]$Path){Add-Input $Path (Get-FileHash -LiteralPath $Path).Hash}
function Merge-Inputs([string]$Path){Add-File $Path;foreach($Item in @(Read-Json $Path)){Add-Input $Item.Path $Item.Hash}}
Add-File $PSCommandPath
$Current=Join-Path $Evidence 'd2-current-adjacent-20261007-r3'
$First=Join-Path $Evidence 'd2-current-first-20261006-r8'
$Database=Join-Path $Evidence 'd2-month-batch-checks-20261005-r10'
$Packages=Join-Path $Evidence 'backend-executable-verification-20261006-r7'
$Adjacent=Join-Path $Evidence "h3-portal-finance-adjacent-20261002-$AdjacentRound"
foreach($Directory in @($Current,$First,$Database,$Packages,$Adjacent)){Merge-Inputs (Join-Path $Directory 'inputs.json')}
Merge-Inputs (Join-Path $Database 'binary-inputs.json')
Merge-Inputs (Join-Path $First 'layered-runtime-inputs.json')
$Actual=Read-Json (Join-Path $Current 'result.json')
Require (-not $Actual.Passed -and $Actual.Backend -eq 'r116' -and $Actual.Frontend -eq 'r75' -and $Actual.InputsPreserved -and $Actual.OriginalPackagesPreserved -and $Actual.Steps.Count -eq 3) 'Retained partial execution differs'
Require ($Actual.Steps[0].Passed -and $Actual.Steps[0].Exit -eq 0 -and $Actual.Steps[1].Passed -and $Actual.Steps[1].Exit -eq 0 -and -not $Actual.Steps[2].Passed -and $Actual.Steps[2].Exit -eq 1 -and $Actual.Steps[2].Checks -eq 0 -and $Actual.Steps[2].CaptchaRestored) 'Retained login-stage failure differs'
$FailedAppeals=Join-Path $Evidence 'd2-attendance-appeals-20261005-r5'
Require (-not (Test-Path (Join-Path $FailedAppeals 'fixture.json')) -and -not (Test-Path (Join-Path $FailedAppeals 'result.json')) -and (Get-Content (Join-Path $FailedAppeals 'live.log') -Raw).Contains('请求过于频繁')) 'Initial appeal failure must precede business setup'
foreach($Path in @((Join-Path $Current 'result.json'),(Join-Path $FailedAppeals 'live.log'))){Add-File $Path}
$Steps=@();$Scans=@()
foreach($Case in @(
    @{Name='rules';Directory='d2-rules-live-20261005-r11';Checks=476;Requests=231;Prefix='RULES';Flags=@('configuration','rules','rawFacts','recalculation','calendar','geofence','preservation','secrets')},
    @{Name='privacy';Directory='d2-attendance-privacy-20261005-r6';Checks=94;Requests=46;Prefix='PRIVACY';Flags=@('correctness','selfEntry','geofence','scope','tenant','anonymous','preservation','restoration','secrets')},
    @{Name='appeals';Directory='d2-attendance-appeals-20261005-r6';Checks=117;Requests=58;Prefix='APPEALS';Flags=@('correctness','approval','appendOnly','rollback','closedMonth','preservation','restoration','secrets')},
    @{Name='leave';Directory='d2-leave-attendance-20261005-r22';Checks=37;Requests=4;Prefix='LEAVE';Flags=@('correctness','approval','exclusion','fractions','preservation','restoration','secrets')}
)){
    $Directory=Join-Path $Evidence $Case.Directory;$ResultPath=Join-Path $Directory 'result.json';$Result=Read-Json $ResultPath
    Require ($Result.passed -and $Result.checks.Count -eq $Case.Checks -and $Result.requests -eq $Case.Requests -and -not $Result.all17Complete -and -not $Result.globalComplete) 'Business result incomplete'
    foreach($Flag in $Case.Flags){Require ($Result.$Flag -eq $true) 'Business outcome missing'}
    Merge-Inputs (Join-Path $Directory 'inputs.json');Add-File $ResultPath;Add-File (Join-Path $Directory 'fixture.json')
    $LogPath=Join-Path $Directory 'live.log';$Log=Get-Content -LiteralPath $LogPath -Raw;Add-File $LogPath
    Require ($Log -match ('D2_'+$Case.Prefix+'_LOG_SCAN: (\{[^\r\n]+\})')) 'Business secret scan missing'
    $Scan=$Matches[1]|ConvertFrom-Json;Require ($Scan.leaks -eq 0 -and $Scan.sensitiveValues -gt 0 -and $Scan.files -ge 6) 'Secret scan failed'
    $Scans+=[pscustomobject]@{Name=$Case.Name;Files=$Scan.files;SensitiveValues=$Scan.sensitiveValues;Leaks=$Scan.leaks}
    $Steps+=[pscustomobject]@{Name=$Case.Name;Checks=$Result.checks.Count;Requests=$Result.requests;Result=$ResultPath;Hash=(Get-FileHash $ResultPath).Hash}
    if($Case.Name -eq 'appeals'){Require ($Result.appealCount -eq 10) 'Ten actual appeals required'}
    if($Case.Name -eq 'privacy'){Require ($Result.matrix.Count -eq 22) 'Privacy matrix incomplete'}
    if($Case.Name -eq 'leave'){$Leave=$Result}
}
$Measurement=Read-Json (Join-Path $First 'measurement-result.json');Add-File (Join-Path $First 'measurement-result.json')
Require ($Measurement.Passed -and $Measurement.BusinessPassed -and $Measurement.BackendRound -eq 'r116' -and $Measurement.FrontendRound -eq 'r75' -and $Measurement.HrReloadedLast -and $Measurement.Layered -and -not $Measurement.Profiling -and -not $Measurement.PerformanceMet -and $Measurement.InputChanges -eq 0 -and $Measurement.RuntimeInputChanges -eq 0 -and $Measurement.Services.Count -eq 6 -and @($Measurement.Services|Where-Object Exit -ne 0).Count -eq 0) 'Ordinary restart measurement incomplete'
Require (-not $Leave.profiling -and -not $Leave.performanceMet -and $Leave.measurements[0].milliseconds -eq 721.31 -and ($Leave.measurements|ConvertTo-Json -Depth 4 -Compress) -ceq ($Measurement.Measurements|ConvertTo-Json -Depth 4 -Compress)) 'Retained full request result differs'
$Db=Read-Json (Join-Path $Database 'result.json');Add-File (Join-Path $Database 'result.json')
Require ($Db.Passed -and $Db.Checks -eq 386 -and $Db.BackendRound -eq 'r116' -and $Db.InputChanges -eq 0 -and $Db.ActualDatabase -and $Db.ActualService -and $Db.ScratchCleaned -and -not $Db.Http) 'Calendar database coverage incomplete'
$Package=Read-Json (Join-Path $Packages 'result.json');Add-File (Join-Path $Packages 'result.json')
Require ($Package.Passed -and $Package.BackendRound -eq 'r116' -and $Package.Services.Count -eq 6 -and $Package.InputChanges -eq 0) 'Six verified packages required'
foreach($Item in $Package.Services){Add-Input $Item.Path $Item.Hash}
$Before=@{};$PriorBuild=Join-Path $Evidence 'h3-portal-finance-20261002-backend-r115-inputs.json';Add-File $PriorBuild
foreach($Item in @(Read-Json $PriorBuild)){$Before[$Item.Path]=$Item.Hash}
$After=Read-Json (Join-Path $Evidence 'h3-portal-finance-20261002-backend-r116-inputs.json')
$Changes=@($After|Where-Object{-not $Before.ContainsKey($_.Path) -or $Before[$_.Path] -ne $_.Hash})
$Mapper='cloudflow-backend\cloudflow-common\cloudflow-common-holiday\src\main\resources\mapper\holiday\HolidayResolverMapper.xml'
Require ($After.Count -eq $Before.Count -and $Changes.Count -eq 1 -and $Changes[0].Path -eq $Mapper) 'Only intended mapper product change allowed'
$Baseline=Join-Path $Evidence 'd2-calendar-target-originals-20261007-r1/HolidayResolverMapper.xml';Add-File $Baseline
Require ((Get-FileHash $Baseline).Hash -eq $Before[$Mapper]) 'Baseline differs from B115 input'
$PlanDirectory=Join-Path $Evidence 'd2-calendar-query-plan-20261007-r2';$Plan=Read-Json (Join-Path $PlanDirectory 'result.json')
Require ($Plan.passed -and $Plan.sameResult -and $Plan.rows -eq 30 -and $Plan.candidateFromCurrentMapper -and -not $Plan.actualTenantInterceptor -and -not $Plan.ordinaryHttpPerformanceMeasured -and $Plan.plans.Count -eq 4) 'Read-only query plan boundary incomplete'
foreach($Item in $Plan.inputs){Add-Input $Item.path $Item.hash}
foreach($Item in $Plan.plans){Add-Input (Join-Path $PlanDirectory $Item.file) $Item.hash}
foreach($Name in @('result.json','original.sql','candidate.sql','original-analyzer.mjs')){Add-File (Join-Path $PlanDirectory $Name)}
$OriginalRoot=Join-Path $Current 'originals';$Originals=@(Get-ChildItem -LiteralPath $OriginalRoot -Recurse -File)
Require ($Originals.Count -eq $Actual.ExecutionOriginals) 'Actual execution originals missing'
foreach($File in $Originals){$Source=Join-Path $Root ([IO.Path]::GetRelativePath($OriginalRoot,$File.FullName));Require ($Inputs.ContainsKey($Source) -and (Get-FileHash $File.FullName).Hash -eq $Inputs[$Source]) 'Execution original differs';Add-File $File.FullName}
$Captcha=@()
foreach($LogPath in @((Join-Path $First 'verification.log'),(Join-Path $Current 'rules.log'),(Join-Path $Current 'privacy.log'),(Join-Path $Current 'appeals.log'),(Join-Path $Evidence 'd2-calendar-target-appeals-20261007-r6-launch.log'))){
    $Log=Get-Content -LiteralPath $LogPath -Raw;Add-File $LogPath
    Require ($Log -match 'OWNED_CAPTCHA_RESTORED: original_limit=100; original_ttl=-1; counter_before=(\d+); counter_after=(\d+); counter_writes=0; database_unchanged=true; production_modified=false') 'Captcha restoration missing'
    $Captcha+=[pscustomobject]@{Before=[int]$Matches[1];After=[int]$Matches[2]}
}
for($Index=1;$Index -lt $Captcha.Count;$Index++){Require ($Captcha[$Index-1].After -eq $Captcha[$Index].Before) 'Captcha counter sequence differs'}
$SummaryLog=Get-Content (Join-Path $Adjacent 'summary.log') -Raw
Require ($SummaryLog -match 'H3_FINANCE_ADJACENT: files=(\d+); changed=0; exit=0; production_modified=false' -and $SummaryLog.Contains('regenerated_matches_formal=true; formal_modified=false')) 'Adjacent regression incomplete'
$Oa=Get-Content (Join-Path $Adjacent 'oa-database.log') -Raw
Require ($Oa.Contains('Complete approved schema table count; expected=374; actual=374') -and $Oa.Contains('PASS: 1012 OA boundary assertions')) 'Formal database checks incomplete'
$Menu=Get-Content (Join-Path $Adjacent 'menu.log') -Raw
Require ($Menu.Contains('EMPLOYEE_UNEXPECTED_GRANTS=0; EMPLOYEE_UNEXPECTED_WRITE_PERMISSIONS=0') -and $Menu.Contains('APPROVED_MENU_SCOPE_PASS=true')) 'Permission scope check failed'
foreach($Name in @('summary.log','oa-database.log','menu.log')){Add-File (Join-Path $Adjacent $Name)}
foreach($Path in $Inputs.Keys){Require ((Get-FileHash -LiteralPath $Path).Hash -eq $Inputs[$Path]) 'Current input changed'}
$State=Read-Json (Join-Path $Run 'state.json');Require ($State.status -eq 'RUNNING' -and $State.processes.Count -eq 9 -and $State.services.Count -eq 6) 'Owned runtime incomplete'
foreach($Process in $State.processes){$Observed=Get-CimInstance Win32_Process -Filter "ProcessId=$($Process.id)";Require ($Observed -and $Observed.CommandLine.Contains($Process.marker)) 'Owned process identity differs'}
$LayeredFiles=0
foreach($Service in $State.services){
    $Arguments=@(Get-Content (Join-Path $Run "$($Service.name)/service.args"));$Index=[Array]::IndexOf($Arguments,'-cp')
    Require ($Index -ge 0 -and $Arguments[$Index+2] -eq 'org.springframework.boot.loader.launch.JarLauncher') 'Actual launch differs'
    $Directory=[IO.Path]::GetFullPath($Arguments[$Index+1].Trim('"'));Require ((Split-Path -Parent $Directory) -eq (Join-Path $Run "$($Service.name)/artifacts")) 'Artifact outside owned service'
    $Files=@(Get-ChildItem -LiteralPath $Directory -Recurse -Force);Require (@($Files|Where-Object{$_.Attributes -band [IO.FileAttributes]::ReparsePoint}).Count -eq 0) 'Artifact redirected'
    foreach($File in $Files|Where-Object{-not $_.PSIsContainer}){Require ($Inputs.ContainsKey($File.FullName)) 'Untracked running file';$LayeredFiles++}
    Require ((Invoke-RestMethod "http://127.0.0.1:$($Service.healthPort)/actuator/health" -TimeoutSec 15).status -eq 'UP') 'Service unhealthy'
}
Require ($LayeredFiles -eq $Actual.LayeredFiles -and $LayeredFiles -eq $Measurement.RuntimeInputs) 'Layered file set changed'
@($Inputs.Keys|Sort-Object|ForEach-Object{[pscustomobject]@{Path=$_;Hash=$Inputs[$_]}})|ConvertTo-Json|Set-Content ($Output.Replace('.json','-inputs.json')) -Encoding utf8NoBOM
[pscustomobject]@{Passed=$true;Backend='r116';Frontend='r75';ProductChanges=@($Changes.Path);DatabaseChecks=386;Business=$Steps;OrdinaryMeasurements=$Leave.measurements;
    OrdinaryPerformanceMet=$false;QueryPlans=$Plan.plans;DirectQueryPlanIsNotHttp=$true;CurrentInputs=$Inputs.Count;ExecutionOriginals=$Originals.Count;LayeredFiles=$LayeredFiles;
    PartialRunPassed=$false;AppealsResumedAfterLoginThrottle=$true;FailedAppealBusinessChecks=0;Captcha=$Captcha;Secrets=$Scans;AdjacentRound=$AdjacentRound;
    FormalTables=374;OaAssertions=1012;OwnedProcesses=9;HealthyServices=6;AllD2Complete=$false;GlobalComplete=$false
}|ConvertTo-Json -Depth 7|Set-Content -LiteralPath $Output -Encoding utf8NoBOM
"D2_CALENDAR_TARGET_STAGE: inputs=$($Inputs.Count); originals=$($Originals.Count); layered_files=$LayeredFiles; database_checks=386; ordinary_first_ms=721.31; healthy=6; performance_met=false; global_complete=false"
