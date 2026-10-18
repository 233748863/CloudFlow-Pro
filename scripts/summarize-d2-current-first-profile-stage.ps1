param([ValidatePattern('^r[1-9][0-9]*$')][string]$Round='r1',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$AdjacentRound='r152')
$ErrorActionPreference='Stop'
. 'D:\CloudFlowPro\.cloudflow-runtime\use-data-drive.ps1'
$Root='D:\CloudFlowPro'
$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
$Run=Join-Path $Root '.cloudflow-runtime/batch-g-integration/9799534e1a3a47b5958330f14ae16dc7'
$Output=Join-Path $Evidence "d2-current-first-profile-stage-20261007-$Round.json"
if(Test-Path -LiteralPath $Output){throw 'Retain previous stage report'}
function Require([bool]$Value,[string]$Message){if(-not $Value){throw $Message}}
function Read-Json([string]$Path){Get-Content -LiteralPath $Path -Raw|ConvertFrom-Json}
$Ordinary=Join-Path $Evidence 'd2-current-first-20261006-r7'
$Profile=Join-Path $Evidence 'd2-cold-first-profile-20261005-r7'
$Analysis=Join-Path $Profile 'analysis-r2'
$Packages=Join-Path $Evidence 'backend-executable-verification-20261006-r6'
$Adjacent=Join-Path $Evidence "h3-portal-finance-adjacent-20261002-$AdjacentRound"
$Measurement=Read-Json (Join-Path $Ordinary 'measurement-result.json')
$Diagnostic=Read-Json (Join-Path $Profile 'result.json')
$Analyzed=Read-Json (Join-Path $Analysis 'result.json')
$Packaged=Read-Json (Join-Path $Packages 'result.json')
Require ($Measurement.Passed -and $Measurement.BusinessPassed -and -not $Measurement.PerformanceMet -and -not $Measurement.Profiling -and $Measurement.BackendRound -eq 'r115' -and $Measurement.FrontendRound -eq 'r75' -and $Measurement.VerificationRound -eq 'r20' -and $Measurement.HrReloadedLast -and $Measurement.Layered -and $Measurement.PackageVerificationRound -eq 'r6' -and $Measurement.Services.Count -eq 6 -and @($Measurement.Services|Where-Object Exit -ne 0).Count -eq 0 -and $Measurement.InputChanges -eq 0 -and $Measurement.RuntimeInputChanges -eq 0) 'Ordinary current measurement incomplete'
Require ($Diagnostic.passed -and $Diagnostic.profiling -and -not $Diagnostic.performanceAcceptance -and $Diagnostic.onlyHrReloaded -and $Diagnostic.backendRound -eq 'r115' -and $Diagnostic.frontendRound -eq 'r75' -and $Diagnostic.verificationRound -eq 'r21' -and $Diagnostic.resumeSource -eq 'r20' -and $Diagnostic.inputsUnchanged -and $Diagnostic.profilesStopped -and $Diagnostic.profiles.Count -eq 3 -and @($Diagnostic.profiles|Where-Object{-not $_.stopped}).Count -eq 0 -and $Diagnostic.reloadExit -eq 0 -and $Diagnostic.verificationExit -eq 0) 'Diagnostic evidence or stop incomplete'
Require ($Analyzed.Passed -and $Analyzed.ProfileRound -eq 'r7' -and $Analyzed.VerificationRound -eq 'r21' -and $Analyzed.InputChanges -eq 0 -and $Analyzed.ProfilesStopped -and -not $Analyzed.OrdinaryPerformanceAcceptance -and -not $Analyzed.BusinessReexecuted -and -not $Analyzed.ProductModified) 'Read-only analysis incomplete'
Require ($Packaged.Passed -and $Packaged.BackendRound -eq 'r115' -and $Packaged.Services.Count -eq 6 -and $Packaged.InputChanges -eq 0) 'Six current packages required'
$Inputs=@{}
function Add-Input([string]$Path,[string]$Hash){
    $Full=[IO.Path]::GetFullPath($Path,$Root)
    Require ($Full.StartsWith($Root+'\',[StringComparison]::OrdinalIgnoreCase)) 'Input outside owned workspace'
    Require (-not $Inputs.ContainsKey($Full) -or $Inputs[$Full] -eq $Hash) 'Input snapshots conflict'
    $Inputs[$Full]=$Hash
}
function Add-File([string]$Path){Add-Input $Path (Get-FileHash -LiteralPath $Path).Hash}
Add-File $PSCommandPath
foreach($Directory in @($Ordinary,$Profile,$Analysis,$Packages,$Adjacent)){
    $Snapshot=Join-Path $Directory 'inputs.json';Add-File $Snapshot
    foreach($Item in @(Read-Json $Snapshot)){Add-Input $Item.Path $Item.Hash}
}
foreach($Item in @(Read-Json (Join-Path $Ordinary 'layered-runtime-inputs.json'))){Add-Input $Item.Path $Item.Hash}
foreach($Package in $Packaged.Services){Add-Input $Package.Path $Package.Hash}
foreach($Path in @((Join-Path $Ordinary 'measurement-result.json'),(Join-Path $Profile 'result.json'),(Join-Path $Analysis 'result.json'),(Join-Path $Packages 'result.json'))){Add-File $Path}
$Business=@();$Scans=@();$Captcha=@()
foreach($Case in @(@{Round='r20';Profiling=$false;Log=(Join-Path $Ordinary 'verification.log')},@{Round='r21';Profiling=$true;Log=(Join-Path $Profile 'verification.log')})){
    $Directory=Join-Path $Evidence "d2-leave-attendance-20261005-$($Case.Round)"
    $Actual=Read-Json (Join-Path $Directory 'result.json')
    foreach($Flag in @('passed','correctness','approval','exclusion','fractions','preservation','restoration','secrets')){Require ($Actual.$Flag -eq $true) 'Business outcome missing'}
    Require ($Actual.profiling -eq $Case.Profiling -and $Actual.checks.Count -eq 37 -and $Actual.requests -eq 4 -and $Actual.measurements.Count -eq 4 -and -not $Actual.performanceMet -and -not $Actual.all17Complete -and -not $Actual.globalComplete) 'Business count or boundary differs'
    foreach($Item in @(Read-Json (Join-Path $Directory 'inputs.json'))){Add-Input $Item.Path $Item.Hash}
    foreach($Name in @('result.json','inputs.json','fixture.json','requests.json','live.log')){Add-File (Join-Path $Directory $Name)}
    foreach($Name in @('verify-d2-leave-attendance.mjs','run-d2-leave-attendance.ps1','run-d2-leave-attendance-allowance.mjs')){
        $Original=Join-Path $Directory ('original-'+$Name);$Source=Join-Path $Root ('scripts/'+$Name)
        Require ($Inputs.ContainsKey($Source) -and (Get-FileHash -LiteralPath $Original).Hash -eq $Inputs[$Source]) 'Original business script differs'
        Add-File $Original
    }
    $Log=Get-Content -LiteralPath $Case.Log -Raw
    Require ($Log -match 'OWNED_CAPTCHA_RESTORED: original_limit=100; original_ttl=-1; counter_before=(\d+); counter_after=(\d+); counter_writes=0; database_unchanged=true; production_modified=false') 'Captcha restoration missing'
    $Captcha+=[pscustomobject]@{Round=$Case.Round;Before=[int]$Matches[1];After=[int]$Matches[2]};Add-File $Case.Log
    $Live=Get-Content -LiteralPath (Join-Path $Directory 'live.log') -Raw
    Require ($Live -match 'D2_LEAVE_LOG_SCAN: (\{[^\r\n]+\})') 'Secret scan missing'
    $Scan=$Matches[1]|ConvertFrom-Json
    Require ($Scan.files -ge 6 -and $Scan.sensitiveValues -gt 0 -and $Scan.leaks -eq 0) 'Secret scan failed'
    $Scans+=[pscustomobject]@{Round=$Case.Round;Files=$Scan.files;SensitiveValues=$Scan.sensitiveValues;Leaks=$Scan.leaks}
    $Business+=[pscustomobject]@{Round=$Case.Round;Checks=$Actual.checks.Count;Requests=$Actual.requests;Profiling=$Actual.profiling;Measurements=$Actual.measurements}
}
Require ($Captcha[0].After -eq $Captcha[1].Before) 'Captcha counter sequence differs'
Require (($Business[0].Measurements|ConvertTo-Json -Depth 4 -Compress) -ceq ($Measurement.Measurements|ConvertTo-Json -Depth 4 -Compress)) 'Ordinary measurements differ'
Require ($Business[0].Measurements[0].milliseconds -eq 550.21 -and $Business[1].Measurements[0].milliseconds -eq 1407.37) 'Retained first observations differ'
$OriginalRoot=Join-Path $Profile 'originals';$Originals=@(Get-ChildItem -LiteralPath $OriginalRoot -Recurse -File)
Require ($Originals.Count -eq $Diagnostic.originalScripts) 'Diagnostic originals missing'
foreach($Original in $Originals){$Source=Join-Path $Root ([IO.Path]::GetRelativePath($OriginalRoot,$Original.FullName));Require ($Inputs.ContainsKey($Source) -and (Get-FileHash -LiteralPath $Original.FullName).Hash -eq $Inputs[$Source]) 'Diagnostic original differs';Add-File $Original.FullName}
foreach($Result in $Analyzed.Outputs){$Path=Join-Path $Analysis $Result.Path;Require ((Get-FileHash -LiteralPath $Path).Hash -eq $Result.Hash) 'Analysis output changed';Add-File $Path}
$ClassLog=Get-Content -LiteralPath (Join-Path $Analysis 'hr-class-load.log') -Raw
Require ($ClassLog -match 'CLASS_LOAD_UNION thread=[^\r\n ]+ count=179 nonoverlapping_ms=344.436' -and $ClassLog.Contains('groups_may_overlap=true')) 'Class load timing or overlap boundary differs'
$Failure=Read-Json (Join-Path $Evidence 'd2-cold-first-profile-20261005-r6/preflight-failure.json')
Require (-not $Failure.Passed -and $Failure.ServicesRestarted -eq 0 -and $Failure.RecordingsStarted -eq 0 -and $Failure.BusinessRequests -eq 0) 'Original preflight failure boundary missing'
Add-File (Join-Path $Evidence 'd2-cold-first-profile-20261005-r6/preflight-failure.json')
$AdjacentLog=Get-Content -LiteralPath (Join-Path $Adjacent 'summary.log') -Raw
Require ($AdjacentLog -match 'H3_FINANCE_ADJACENT: files=(\d+); changed=0; exit=0; production_modified=false' -and $AdjacentLog.Contains('regenerated_matches_formal=true; formal_modified=false')) 'Adjacent regression incomplete'
$Oa=Get-Content -LiteralPath (Join-Path $Adjacent 'oa-database.log') -Raw
Require ($Oa.Contains('Complete approved schema table count; expected=374; actual=374') -and $Oa.Contains('PASS: 1012 OA boundary assertions')) 'Formal database checks incomplete'
$Menu=Get-Content -LiteralPath (Join-Path $Adjacent 'menu.log') -Raw
Require ($Menu.Contains('EMPLOYEE_UNEXPECTED_GRANTS=0; EMPLOYEE_UNEXPECTED_WRITE_PERMISSIONS=0') -and $Menu.Contains('APPROVED_MENU_SCOPE_PASS=true')) 'Permission regression incomplete'
foreach($Name in @('summary.log','oa-database.log','menu.log')){Add-File (Join-Path $Adjacent $Name)}
foreach($Path in $Inputs.Keys){Require ((Get-FileHash -LiteralPath $Path).Hash -eq $Inputs[$Path]) 'Stage input changed'}
$State=Read-Json (Join-Path $Run 'state.json')
Require ($State.status -eq 'RUNNING' -and $State.processes.Count -eq 9 -and $State.services.Count -eq 6) 'Owned runtime incomplete'
foreach($Process in $State.processes){$Observed=Get-CimInstance Win32_Process -Filter "ProcessId=$($Process.id)";Require ($Observed -and $Observed.CommandLine.Contains($Process.marker)) 'Owned process identity differs'}
$LayeredFiles=0
foreach($Service in $State.services){
    $Arguments=@(Get-Content -LiteralPath (Join-Path $Run "$($Service.name)/service.args"));$Index=[Array]::IndexOf($Arguments,'-cp')
    Require ($Index -ge 0 -and $Arguments[$Index+2] -eq 'org.springframework.boot.loader.launch.JarLauncher') 'Actual layered launch differs'
    $Directory=[IO.Path]::GetFullPath($Arguments[$Index+1].Trim('"'))
    Require ((Split-Path -Parent $Directory) -eq (Join-Path $Run "$($Service.name)/artifacts")) 'Layered path outside owned service'
    $Files=@(Get-ChildItem -LiteralPath $Directory -Recurse -Force)
    Require (@($Files|Where-Object{$_.Attributes -band [IO.FileAttributes]::ReparsePoint}).Count -eq 0) 'Layered artifact redirected'
    foreach($File in $Files|Where-Object{-not $_.PSIsContainer}){Require ($Inputs.ContainsKey($File.FullName)) 'Untracked layered file';$LayeredFiles++}
    Require ((Invoke-RestMethod "http://127.0.0.1:$($Service.healthPort)/actuator/health" -TimeoutSec 15).status -eq 'UP') 'Owned service unhealthy'
}
Require ($LayeredFiles -eq $Diagnostic.layeredFiles -and $LayeredFiles -eq $Measurement.RuntimeInputs) 'Actual layered set differs'
$Snapshot=@($Inputs.Keys|Sort-Object|ForEach-Object{[pscustomobject]@{Path=$_;Hash=$Inputs[$_]}})
$Snapshot|ConvertTo-Json|Set-Content -LiteralPath ($Output.Replace('.json','-inputs.json')) -Encoding utf8NoBOM
[pscustomobject]@{Passed=$true;Backend='r115';Frontend='r75';Ordinary=$Business[0];Diagnostic=$Business[1];ProfilesStopped=$true;OnlyHrReloadedForDiagnostics=$true;
    PackageServices=6;CurrentInputs=$Inputs.Count;DiagnosticInputs=$Diagnostic.inputs;DiagnosticOriginals=$Originals.Count;LayeredFiles=$LayeredFiles;
    ClassLoadEvents=179;ClassLoadUnionMilliseconds=344.436;ClassLoadGroupsMayOverlap=$true;OrdinaryPerformanceMet=$false;Captcha=$Captcha;Secrets=$Scans;
    AdjacentRound=$AdjacentRound;FormalTables=374;OaAssertions=1012;OwnedProcesses=9;HealthyServices=6;ProductModified=$false;AllD2Complete=$false;GlobalComplete=$false
}|ConvertTo-Json -Depth 7|Set-Content -LiteralPath $Output -Encoding utf8NoBOM
"D2_CURRENT_FIRST_PROFILE_STAGE: current_inputs=$($Inputs.Count); originals=$($Originals.Count); layered_files=$LayeredFiles; ordinary_first_ms=550.21; profiles_stopped=true; healthy=6; performance_met=false; global_complete=false"
