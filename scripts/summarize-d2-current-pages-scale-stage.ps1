param([ValidatePattern('^r[1-9][0-9]*$')][string]$Round='r1',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$AdjacentRound='r154')
$ErrorActionPreference='Stop'
. 'D:\CloudFlowPro\.cloudflow-runtime\use-data-drive.ps1'
$Root='D:\CloudFlowPro'
$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
$Run=Join-Path $Root '.cloudflow-runtime/batch-g-integration/9799534e1a3a47b5958330f14ae16dc7'
$Output=Join-Path $Evidence "d2-current-pages-scale-stage-20261007-$Round.json"
if(Test-Path -LiteralPath $Output){throw 'Retain stage evidence'}
function Require([bool]$Value,[string]$Message){if(-not $Value){throw $Message}}
function Read-Json([string]$Path){Get-Content -LiteralPath $Path -Raw|ConvertFrom-Json}
$PartialPath=Join-Path $Evidence 'd2-current-adjacent-20261007-r4'
$ResumePath=Join-Path $Evidence 'd2-current-adjacent-20261007-r5'
$ProfilePath=Join-Path $Evidence 'd2-cold-first-profile-20261005-r8'
$AnalysisPath=Join-Path $ProfilePath 'analysis-r1'
$AdjacentPath=Join-Path $Evidence "h3-portal-finance-adjacent-20261002-$AdjacentRound"
$Partial=Read-Json (Join-Path $PartialPath 'result.json')
$Resume=Read-Json (Join-Path $ResumePath 'result.json')
$Profile=Read-Json (Join-Path $ProfilePath 'result.json')
$Analysis=Read-Json (Join-Path $AnalysisPath 'result.json')
Require (-not $Partial.Passed -and $Partial.Scope -eq 'PagesAndScale' -and $Partial.Steps.Count -eq 2 -and $Partial.Steps[0].Name -eq 'scale' -and $Partial.Steps[0].Passed -and $Partial.Steps[1].Name -eq 'config' -and -not $Partial.Steps[1].Passed) 'Original partial failure boundary differs'
Require ($Resume.Passed -and $Resume.Scope -eq 'PagesOnly' -and $Resume.Steps.Count -eq 3) 'Page-only continuation incomplete'
foreach($Result in @($Partial,$Resume)){
    Require ($Result.Backend -eq 'r116' -and $Result.Frontend -eq 'r75' -and $Result.InputsPreserved -and $Result.OriginalPackagesPreserved -and $Result.ActualServices -and $Result.StepsRunSerially -and -not $Result.ProductModified -and -not $Result.FirstRequestPerformanceMeasured -and -not $Result.AllD2Complete -and -not $Result.GlobalComplete) 'Current execution boundary differs'
}
Require ($Profile.passed -and $Profile.backendRound -eq 'r116' -and $Profile.frontendRound -eq 'r75' -and $Profile.verificationRound -eq 'r23' -and $Profile.resumeSource -eq 'r22' -and $Profile.inputsUnchanged -and $Profile.profilesStopped -and $Profile.profiles.Count -eq 3 -and @($Profile.profiles|Where-Object{-not $_.stopped}).Count -eq 0 -and $Profile.profiling -and -not $Profile.performanceAcceptance -and $Profile.onlyHrReloaded -and $Profile.reloadExit -eq 0 -and $Profile.verificationExit -eq 0) 'Diagnostic or recording stop incomplete'
Require ($Analysis.Passed -and $Analysis.ProfileRound -eq 'r8' -and $Analysis.VerificationRound -eq 'r23' -and $Analysis.InputChanges -eq 0 -and $Analysis.ProfilesStopped -and -not $Analysis.OrdinaryPerformanceAcceptance -and -not $Analysis.ProductModified) 'Diagnostic analysis incomplete'
$Inputs=@{};$HistoricalChanges=[Collections.Generic.List[object]]::new();$OriginalCount=0
$Allowed=@('scripts/run-d2-current-adjacent.ps1','scripts/verify-d2-attendance-config.mjs','scripts/verify-d2-attendance-page.mjs')|ForEach-Object{[IO.Path]::GetFullPath($_,$Root)}
function Add-Input([string]$Path,[string]$Hash){
    $Full=[IO.Path]::GetFullPath($Path,$Root)
    Require ($Full.StartsWith($Root+'\',[StringComparison]::OrdinalIgnoreCase)) 'Input outside workspace'
    Require (-not $Inputs.ContainsKey($Full) -or $Inputs[$Full] -eq $Hash) 'Conflicting current input'
    $Inputs[$Full]=$Hash
}
function Add-File([string]$Path){Add-Input $Path (Get-FileHash -LiteralPath $Path).Hash}
function Add-Snapshot([string]$Directory,[bool]$Historical=$false){
    $Snapshot=Join-Path $Directory 'inputs.json';Add-File $Snapshot
    foreach($Item in @(Read-Json $Snapshot)){
        $Full=[IO.Path]::GetFullPath($Item.Path,$Root);$Current=(Get-FileHash -LiteralPath $Full).Hash
        if($Current -ne $Item.Hash){
            Require ($Historical -and $Full -in $Allowed) 'Unexpected change since execution'
            $Original=Join-Path (Join-Path $Directory 'originals') ([IO.Path]::GetRelativePath($Root,$Full))
            Require ((Get-FileHash -LiteralPath $Original).Hash -eq $Item.Hash) 'Historical execution source missing'
            $HistoricalChanges.Add([pscustomobject]@{Source=$Full;Before=$Item.Hash;After=$Current;Original=$Original})
            Add-File $Original
        }
        Add-Input $Full $Current
    }
}
function Add-Originals([string]$Directory,[int]$Expected){
    $OriginalRoot=Join-Path $Directory 'originals';$Files=@(Get-ChildItem -LiteralPath $OriginalRoot -Recurse -File)
    Require ($Files.Count -eq $Expected) 'Missing execution originals'
    $Map=@{};foreach($Item in @(Read-Json (Join-Path $Directory 'inputs.json'))){$Map[[IO.Path]::GetFullPath($Item.Path,$Root)]=$Item.Hash}
    foreach($File in $Files){
        $Source=Join-Path $Root ([IO.Path]::GetRelativePath($OriginalRoot,$File.FullName))
        Require ($Map.ContainsKey($Source) -and (Get-FileHash -LiteralPath $File.FullName).Hash -eq $Map[$Source]) 'Original differs from execution input'
        Add-File $File.FullName
    }
    $script:OriginalCount+=$Files.Count
}
Add-File $PSCommandPath
$OrdinaryPath=Join-Path $Evidence 'd2-current-first-20261006-r8/measurement-result.json'
$Ordinary=Read-Json $OrdinaryPath
Require ($Ordinary.Passed -and $Ordinary.BusinessPassed -and $Ordinary.BackendRound -eq 'r116' -and $Ordinary.FrontendRound -eq 'r75' -and $Ordinary.VerificationRound -eq 'r22' -and $Ordinary.HrReloadedLast -and -not $Ordinary.Profiling -and -not $Ordinary.PerformanceMet -and $Ordinary.InputChanges -eq 0 -and $Ordinary.RuntimeInputChanges -eq 0 -and $Ordinary.Measurements[0].milliseconds -eq 721.31) 'Retained ordinary first-request evidence differs'
Add-File $OrdinaryPath
Add-Snapshot $ResumePath
Add-Snapshot $AdjacentPath
Add-Snapshot $AnalysisPath
Add-Snapshot $PartialPath $true
Add-Snapshot $ProfilePath $true
foreach($Pair in @(@{Path=$PartialPath;Count=$Partial.ExecutionOriginals},@{Path=$ResumePath;Count=$Resume.ExecutionOriginals},@{Path=$ProfilePath;Count=$Profile.originalScripts})){Add-Originals $Pair.Path $Pair.Count;Add-File (Join-Path $Pair.Path 'result.json')}
foreach($Item in $Analysis.Outputs){$File=Join-Path $AnalysisPath $Item.Path;Require ((Get-FileHash -LiteralPath $File).Hash -eq $Item.Hash) 'Analysis output changed';Add-File $File}
Add-File (Join-Path $AnalysisPath 'result.json')
$Scans=@();$Counters=@();$Business=@();$AllSteps=@($Partial.Steps)+@($Resume.Steps)
$PriorCounter=1395
foreach($Step in $AllSteps){
    Require ($Step.CaptchaRestored -and $Step.CaptchaBefore -eq $PriorCounter -and $Step.CaptchaAfter -ge $Step.CaptchaBefore) 'Captcha restoration sequence differs'
    $PriorCounter=$Step.CaptchaAfter;$Counters+=[pscustomobject]@{Name=$Step.Name;Round=$Step.Round;Before=$Step.CaptchaBefore;After=$Step.CaptchaAfter}
    Require ((Get-FileHash -LiteralPath $Step.Result).Hash -eq $Step.ResultHash) 'Business result changed'
    $Result=Read-Json $Step.Result
    Require ($Result.checks.Count -eq $Step.Checks -and $Result.requests -eq $Step.Requests -and $Result.preservation -and $Result.secrets -and -not $Result.all17Complete -and -not $Result.globalComplete) 'Business preservation or boundary differs'
    if($Step.Name -eq 'config' -and $Step.Round -eq 'r7'){
        Require (-not $Result.passed -and $Step.Exit -eq 1 -and $Result.failure -eq 'shift_roundtrip_halfDayHoursThreshold' -and $Step.Checks -eq 15 -and $Step.Requests -eq 3) 'Original decimal-format failure differs'
    }else{
        Require ($Result.passed -and $Step.Passed -and $Step.Exit -eq 0) 'Current business case incomplete'
        foreach($Flag in $Step.Flags){Require ($Result.$Flag -eq $true) 'Current business outcome missing'}
        $Business+=[pscustomobject]@{Name=$Step.Name;Round=$Step.Round;Checks=$Step.Checks;Requests=$Step.Requests}
    }
    $Directory=Split-Path -Parent $Step.Result
    foreach($Name in @('result.json','inputs.json','fixture.json','requests.json','live.log')){Add-File (Join-Path $Directory $Name)}
    $Log=Get-Content -LiteralPath (Join-Path $Directory 'live.log') -Raw
    Require ($Log -match 'D2_(?:SCALE|CONFIG|PAGE|MONTH_APPEAL)_LOG_SCAN: (\{[^\r\n]+\})') 'Business secret scan missing'
    $Scan=$Matches[1]|ConvertFrom-Json
    Require ($Scan.files -ge 6 -and $Scan.sensitiveValues -gt 0 -and $Scan.leaks -eq 0) 'Business secret scan failed'
    $Scans+=[pscustomobject]@{Name=$Step.Name;Round=$Step.Round;Files=$Scan.files;Leaks=$Scan.leaks}
}
Require ($Business.Count -eq 4 -and @($Business.Name|Select-Object -Unique).Count -eq 4) 'Four distinct successful cases required'
$Scale=Read-Json (Join-Path $Evidence 'd2-scale-attendance-20261005-r2/result.json')
Require ($Scale.employeeCount -eq 1000 -and $Scale.asynchronous -and $Scale.ownership -and $Scale.initialCounts.days -lt 30000 -and $Scale.finalCounts.days -eq 30000 -and $Scale.finalCounts.employees -eq 1000 -and $Scale.finalCounts.absent -eq 30000 -and $Scale.finalCounts.wrongTenant -eq 0 -and $Scale.finalCounts.outsideMonth -eq 0 -and $Scale.terminal.executeStatus -eq 'SUCCESS' -and $Scale.terminal.affectedRows -eq 30000) 'Thousand-employee result differs'
$Config=Read-Json (Join-Path $Evidence 'd2-attendance-config-20261005-r8/fixture.json')
Require ($Config.shiftObservations.Count -eq 26) 'Thirteen configuration fields require UI and response observations'
foreach($Field in @(@{Name='halfDayHoursThreshold';Value='4.00';Input=4},@{Name='absentHoursThreshold';Value='2.00';Input=2})){
    foreach($Stage in @('roundtrip','persisted')){
        $Observed=@($Config.shiftObservations|Where-Object{$_.field -eq $Field.Name -and $_.stage -eq $Stage})
        Require ($Observed.Count -eq 1 -and $Observed[0].actual -ceq $Field.Value -and $Observed[0].input -eq $Field.Input) 'Original decimal value not preserved'
    }
}
$Page=Read-Json (Join-Path $Evidence 'd2-attendance-page-20261005-r5/result.json')
Require ($Page.path -eq 'real_page_current_services' -and $Page.measurements.Count -eq 4 -and $Page.directFirstRequestStillOpen -and $Page.sourceRound -eq 'r22') 'Page observations must not claim cold performance'
$Diagnostic=Read-Json (Join-Path $Evidence 'd2-leave-attendance-20261005-r23/result.json')
foreach($Flag in @('passed','correctness','approval','exclusion','fractions','preservation','restoration','secrets')){Require ($Diagnostic.$Flag -eq $true) 'Diagnostic business outcome incomplete'}
Require ($Diagnostic.profiling -and $Diagnostic.checks.Count -eq 37 -and $Diagnostic.requests -eq 4 -and $Diagnostic.measurements[0].milliseconds -eq 3140.02 -and -not $Diagnostic.performanceMet -and -not $Diagnostic.all17Complete -and -not $Diagnostic.globalComplete) 'Diagnostic observation differs'
$Log=Get-Content -LiteralPath (Join-Path $ProfilePath 'verification.log') -Raw
Require ($Log -match 'counter_before=1392; counter_after=1395; counter_writes=0; database_unchanged=true; production_modified=false') 'Diagnostic configuration restoration missing'
$ReviewPath=Join-Path $Evidence 'd2-current-pages-image-review-20261007-r1.json'
$Review=Read-Json $ReviewPath
Require ($Review.Passed -and $Review.Method -eq 'view_image' -and $Review.Images.Count -eq 14) 'Visual review missing'
foreach($Item in $Review.Images){Require ((Get-FileHash -LiteralPath $Item.Path).Hash -eq $Item.Hash) 'Reviewed image changed';Add-File $Item.Path}
Add-File $ReviewPath
$Log=Get-Content -LiteralPath (Join-Path $AdjacentPath 'summary.log') -Raw
Require ($Log -match 'H3_FINANCE_ADJACENT: files=(\d+); changed=0; exit=0; production_modified=false' -and $Log.Contains('regenerated_matches_formal=true; formal_modified=false')) 'Adjacent checks incomplete'
$Oa=Get-Content -LiteralPath (Join-Path $AdjacentPath 'oa-database.log') -Raw
Require ($Oa.Contains('Complete approved schema table count; expected=374; actual=374') -and $Oa.Contains('PASS: 1012 OA boundary assertions')) 'Database regression incomplete'
$Menu=Get-Content -LiteralPath (Join-Path $AdjacentPath 'menu.log') -Raw
Require ($Menu.Contains('EMPLOYEE_UNEXPECTED_GRANTS=0; EMPLOYEE_UNEXPECTED_WRITE_PERMISSIONS=0') -and $Menu.Contains('APPROVED_MENU_SCOPE_PASS=true')) 'Permission scope differs'
foreach($Name in @('summary.log','oa-database.log','menu.log')){Add-File (Join-Path $AdjacentPath $Name)}
$State=Read-Json (Join-Path $Run 'state.json')
Require ($State.status -eq 'RUNNING' -and $State.processes.Count -eq 9 -and $State.services.Count -eq 6) 'Owned runtime incomplete'
foreach($Entry in $State.processes){$Observed=Get-CimInstance Win32_Process -Filter "ProcessId=$($Entry.id)";Require ($Observed -and $Observed.CommandLine.Contains($Entry.marker)) 'Owned process identity differs'}
$LayeredFiles=0
foreach($Service in $State.services){
    $Arguments=@(Get-Content -LiteralPath (Join-Path $Run "$($Service.name)/service.args"));$Index=[Array]::IndexOf($Arguments,'-cp')
    Require ($Index -ge 0 -and $Arguments[$Index+2] -eq 'org.springframework.boot.loader.launch.JarLauncher') 'Layered launch differs'
    $Directory=[IO.Path]::GetFullPath($Arguments[$Index+1].Trim('"'))
    Require ((Split-Path -Parent $Directory) -eq (Join-Path $Run "$($Service.name)/artifacts")) 'Owned artifact path differs'
    $Files=@(Get-ChildItem -LiteralPath $Directory -Recurse -Force)
    Require (@($Files|Where-Object{$_.Attributes -band [IO.FileAttributes]::ReparsePoint}).Count -eq 0) 'Redirected artifact'
    foreach($File in $Files|Where-Object{-not $_.PSIsContainer}){Require ($Inputs.ContainsKey($File.FullName)) 'Untracked artifact';$LayeredFiles++}
    Require ((Invoke-RestMethod "http://127.0.0.1:$($Service.healthPort)/actuator/health" -TimeoutSec 15).status -eq 'UP') 'Service unhealthy'
}
Require ($LayeredFiles -eq 6381 -and $LayeredFiles -eq $Resume.LayeredFiles -and $LayeredFiles -eq $Partial.LayeredFiles -and $LayeredFiles -eq $Profile.layeredFiles) 'Layered file count differs'
foreach($Path in $Inputs.Keys){Require ((Get-FileHash -LiteralPath $Path).Hash -eq $Inputs[$Path]) 'Final stage input changed'}
@($Inputs.Keys|Sort-Object|ForEach-Object{[pscustomobject]@{Path=$_;Hash=$Inputs[$_]}})|ConvertTo-Json|Set-Content -LiteralPath ($Output.Replace('.json','-inputs.json')) -Encoding utf8NoBOM
[pscustomobject]@{Passed=$true;Backend='r116';Frontend='r75';Business=$Business;ScaleRequestMilliseconds=$Scale.requestMilliseconds;ScaleDays=30000;ScaleEmployees=1000;
    PageMeasurements=$Page.measurements;PagePerformanceMet=$Page.performanceMet;ColdPerformanceMet=$false;OrdinaryFirstMilliseconds=$Ordinary.Measurements[0].milliseconds;DiagnosticFirstMilliseconds=$Diagnostic.measurements[0].milliseconds;ProfilesStopped=$true;
    CurrentInputs=$Inputs.Count;ExecutionOriginals=$OriginalCount;HistoricalScriptChanges=$HistoricalChanges.ToArray();LayeredFiles=$LayeredFiles;ReviewedImages=$Review.Images.Count;
    Captcha=$Counters;Secrets=$Scans;OriginalEntryPassed=$false;ScaleRerun=$false;ProductModified=$false;AdjacentRound=$AdjacentRound;FormalTables=374;OaAssertions=1012;
    OwnedProcesses=9;HealthyServices=6;AllD2Complete=$false;GlobalComplete=$false}|ConvertTo-Json -Depth 8|Set-Content -LiteralPath $Output -Encoding utf8NoBOM
"D2_CURRENT_PAGES_SCALE_STAGE: inputs=$($Inputs.Count); originals=$OriginalCount; images=$($Review.Images.Count); layered_files=$LayeredFiles; business_groups=4; healthy=6; cold_performance_met=false; global_complete=false"
