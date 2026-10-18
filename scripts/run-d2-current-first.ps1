param([Parameter(Mandatory=$true)][ValidatePattern('^r[1-9][0-9]*$')][string]$Round,
    [ValidatePattern('^r[1-9][0-9]*$')][string]$BackendRound='r110',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$FrontendRound='r70',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$VerificationRound='r14',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$ResumeSource='r13',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$PackageVerificationRound,
    [switch]$Layered)
$ErrorActionPreference='Stop'
. 'D:\CloudFlowPro\.cloudflow-runtime\use-data-drive.ps1'
$Root='D:\CloudFlowPro'
$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
$Output=Join-Path $Evidence "d2-current-first-20261006-$Round"
$StatePath=Join-Path $Root '.cloudflow-runtime/batch-g-integration/9799534e1a3a47b5958330f14ae16dc7/state.json'
if(Test-Path Env:CLOUDFLOW_D2_PROFILE_FIRST){throw 'Ordinary first request measurement must not enable profiling'}
if($Layered -and -not $PackageVerificationRound){throw 'Layered launch requires verified executable packages'}
if(Test-Path -LiteralPath (Join-Path $Evidence "d2-leave-attendance-20261005-$VerificationRound")){throw 'Verification round occupied'}
if(Test-Path -LiteralPath $Output){throw 'Retain previous reload; verify original process before any retry'}
[IO.Directory]::CreateDirectory($Output)|Out-Null
$Inputs=@(Get-Content -LiteralPath (Join-Path $Evidence "h3-portal-finance-20261002-backend-$BackendRound-inputs.json") -Raw|ConvertFrom-Json)
$Inputs+=@(Get-Content -LiteralPath (Join-Path $Evidence "h3-portal-finance-20261002-frontend-$FrontendRound-inputs.json") -Raw|ConvertFrom-Json)
foreach($File in @('scripts/run-d2-current-first.ps1','scripts/restart-isolated-integration-service.ps1','scripts/run-d2-leave-attendance.ps1','scripts/run-d2-leave-attendance-allowance.mjs','scripts/verify-d2-leave-attendance.mjs')){$Inputs+=[pscustomobject]@{Path=$File;Hash=(Get-FileHash -LiteralPath $File).Hash}}
if($Layered){$Inputs+=[pscustomobject]@{Path='scripts/owned-layered-artifact.ps1';Hash=(Get-FileHash -LiteralPath 'scripts/owned-layered-artifact.ps1').Hash}}
$Packages=@{}
if($PackageVerificationRound){
    $PackageReportPath=Join-Path $Evidence "backend-executable-verification-20261006-$PackageVerificationRound/result.json"
    $PackageReport=Get-Content -LiteralPath $PackageReportPath -Raw|ConvertFrom-Json
    if(-not $PackageReport.Passed -or $PackageReport.BackendRound -ne $BackendRound -or @($PackageReport.Services).Count -ne 6){throw 'Matching verified executable packages required'}
    foreach($Package in $PackageReport.Services){
        if($Packages.ContainsKey($Package.Name)){throw 'Duplicate executable service'}
        $Packages[$Package.Name]=Join-Path $Root $Package.Path
        $Inputs+=[pscustomobject]@{Path=$Package.Path;Hash=$Package.Hash}
    }
    foreach($Name in @('auth','oa','crm','workflow','gateway','hr')){if(-not $Packages.ContainsKey($Name)){throw 'Executable service missing'}}
    $Inputs+=[pscustomobject]@{Path=[IO.Path]::GetRelativePath($Root,$PackageReportPath);Hash=(Get-FileHash -LiteralPath $PackageReportPath).Hash}
}
function Assert-Inputs {foreach($Item in $Inputs){if((Get-FileHash -LiteralPath (Join-Path $Root $Item.Path)).Hash -ne $Item.Hash){throw 'Reload input changed'}}}
Assert-Inputs
$Inputs|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $Output 'inputs.json') -Encoding utf8NoBOM
Copy-Item -LiteralPath $PSCommandPath -Destination (Join-Path $Output 'original.ps1')
$State=Get-Content -LiteralPath $StatePath -Raw|ConvertFrom-Json
if($State.status -ne 'RUNNING'){throw 'Owned environment must be running'}
foreach($Entry in $State.processes){
    $Observed=Get-CimInstance Win32_Process -Filter "ProcessId=$($Entry.id)"
    if($null -eq $Observed -or -not $Observed.CommandLine.Contains($Entry.marker)){throw 'Owned process verification failed'}
}
$Results=[Collections.Generic.List[object]]::new()
$RuntimeInputs=[Collections.Generic.List[object]]::new()
foreach($Name in @('auth','oa','crm','workflow','gateway','hr')){
    $RestartArgs=@('-NoLogo','-NoProfile','-File','scripts/restart-isolated-integration-service.ps1','-StatePath',$StatePath,'-ServiceName',$Name)
    if($PackageVerificationRound){$RestartArgs+=@('-ExecutableJar',('"'+$Packages[$Name]+'"'))}
    if($Layered){$RestartArgs+='-Layered'}
    $Process=Start-Process -FilePath (Get-Process -Id $PID).Path -WindowStyle Hidden -PassThru -ArgumentList $RestartArgs -WorkingDirectory $Root -RedirectStandardOutput (Join-Path $Output "$Name.log") -RedirectStandardError (Join-Path $Output "$Name.err")
    $Process.WaitForExit();$Process.Refresh()
    $State=Get-Content -LiteralPath $StatePath -Raw|ConvertFrom-Json
    $Owned=@($State.processes|Where-Object name -EQ $Name)
    $Results.Add([pscustomobject]@{Name=$Name;Exit=$Process.ExitCode;Pid=$Owned[0].id})
    $Results|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $Output 'progress.json') -Encoding utf8NoBOM
    if($Process.ExitCode -ne 0){throw "Original $Name restart terminated with failure; do not start a duplicate"}
    $Log=Get-Content -LiteralPath (Join-Path $Output "$Name.log") -Raw
    if($Log -notmatch 'ISOLATED_RESTART_READY:'){throw 'Readiness proof missing'}
    if($PackageVerificationRound){
        if($Log -notmatch 'ISOLATED_EXECUTABLE_VERIFIED:'){throw 'Executable launch proof missing'}
        $ArgsNow=@(Get-Content -LiteralPath (Join-Path $State.run "$Name/service.args"))
        if($Layered){
            if($Log -notmatch 'ISOLATED_LAYERED_VERIFIED:'){throw 'Layered byte identity proof missing'}
            $ClassPathMarkers=@(0..($ArgsNow.Count-1)|Where-Object{$ArgsNow[$_] -eq '-cp'})
            if($ClassPathMarkers.Count -ne 1 -or $ClassPathMarkers[0]+2 -ge $ArgsNow.Count -or $ArgsNow[$ClassPathMarkers[0]+2] -ne 'org.springframework.boot.loader.launch.JarLauncher'){throw 'Layered launch arguments incomplete'}
            $LaunchedRoot=[IO.Path]::GetFullPath($ArgsNow[$ClassPathMarkers[0]+1].Trim('"'))
            $ExpectedRoot=Join-Path (Join-Path $State.run "$Name/artifacts") (((Get-FileHash -LiteralPath $Packages[$Name]).Hash).ToLowerInvariant()+'-layered')
            if($LaunchedRoot -ne $ExpectedRoot){throw 'Layered launch root differs from verified package'}
            $ProofPath=$ExpectedRoot+'.json'
            $Proof=Get-Content -LiteralPath $ProofPath -Raw|ConvertFrom-Json
            if($Proof.Path -ne $ExpectedRoot -or $Proof.PackageHash -ne (Get-FileHash -LiteralPath $Packages[$Name]).Hash -or $Proof.Files.Count -eq 0){throw 'Layered byte manifest does not match current package'}
            Copy-Item -LiteralPath $ProofPath -Destination (Join-Path $Output "$Name-layered-original.json")
            foreach($File in $Proof.Files){
                $RuntimePath=[IO.Path]::GetFullPath((Join-Path $ExpectedRoot $File.Path))
                if(-not $RuntimePath.StartsWith($ExpectedRoot+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)){throw 'Layered input escaped original artifact'}
                $RuntimeInputs.Add([pscustomobject]@{Path=[IO.Path]::GetRelativePath($Root,$RuntimePath);Hash=$File.Hash})
            }
        }else{
        $JarMarkers=@(0..($ArgsNow.Count-1)|Where-Object{$ArgsNow[$_] -eq '-jar'})
        if($JarMarkers.Count -ne 1 -or $JarMarkers[0]+1 -ge $ArgsNow.Count){throw 'Actual executable launch arguments missing'}
        $LaunchedJar=[IO.Path]::GetFullPath($ArgsNow[$JarMarkers[0]+1].Trim('"'))
        $ExpectedArtifactDirectory=Join-Path $State.run "$Name/artifacts"
        if((Split-Path -Parent $LaunchedJar) -ne $ExpectedArtifactDirectory -or (Get-FileHash -LiteralPath $LaunchedJar).Hash -ne (Get-FileHash -LiteralPath $Packages[$Name]).Hash){throw 'Actual launch artifact does not match the verified package'}
        }
    }
    Assert-Inputs
    Write-Output "D2_CURRENT_FIRST_RELOADED: service=$Name; pid=$($Owned[0].id); exit=0"
}
if($Layered){$RuntimeInputs|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $Output 'layered-runtime-inputs.json') -Encoding utf8NoBOM}
[pscustomobject]@{Passed=$true;BackendRound=$BackendRound;Inputs=$Inputs.Count;InputChanges=0;Services=@($Results);HrReloadedLast=$true;ExecutablePackages=[bool]$PackageVerificationRound;Layered=[bool]$Layered;PackageVerificationRound=$PackageVerificationRound}|ConvertTo-Json -Depth 4|Set-Content -LiteralPath (Join-Path $Output 'result.json') -Encoding utf8NoBOM
& node scripts/run-d2-leave-attendance-allowance.mjs $VerificationRound $BackendRound $FrontendRound $ResumeSource *> (Join-Path $Output 'verification.log')
$VerificationExit=$LASTEXITCODE
Assert-Inputs
foreach($File in $RuntimeInputs){if((Get-FileHash -LiteralPath (Join-Path $Root $File.Path)).Hash -ne $File.Hash){throw 'Layered executable file changed during ordinary verification'}}
Get-Content -LiteralPath (Join-Path $Output 'verification.log')|Where-Object{$_ -match '^(D2_|OWNED_CAPTCHA_)'}
if($VerificationExit -ne 0){throw 'Ordinary verification failed; original evidence retained'}
$VerificationPath=Join-Path $Evidence "d2-leave-attendance-20261005-$VerificationRound/result.json"
$Verification=Get-Content -LiteralPath $VerificationPath -Raw|ConvertFrom-Json
if(-not $Verification.passed -or -not $Verification.correctness -or -not $Verification.preservation -or -not $Verification.restoration -or -not $Verification.secrets -or $Verification.profiling -or @($Verification.measurements).Count -ne 4){throw 'Ordinary verification evidence incomplete'}
Copy-Item -LiteralPath $VerificationPath -Destination (Join-Path $Output 'verification-result-original.json')
[pscustomobject]@{
    Passed=$true;BusinessPassed=$Verification.passed;PerformanceMet=$Verification.performanceMet
    BackendRound=$BackendRound;FrontendRound=$FrontendRound;VerificationRound=$VerificationRound;ResumeSource=$ResumeSource
    Inputs=$Inputs.Count;InputChanges=0;Services=@($Results);HrReloadedLast=$true;Profiling=$false
    ExecutablePackages=[bool]$PackageVerificationRound;PackageVerificationRound=$PackageVerificationRound
    Layered=[bool]$Layered
    RuntimeInputs=$RuntimeInputs.Count;RuntimeInputChanges=0
    Measurements=@($Verification.measurements);RequirementMilliseconds=500;All17Complete=$false;GlobalComplete=$false
}|ConvertTo-Json -Depth 6|Set-Content -LiteralPath (Join-Path $Output 'measurement-result.json') -Encoding utf8NoBOM
"D2_CURRENT_FIRST_SUMMARY: business_passed=$($Verification.passed); performance_met=$($Verification.performanceMet); measurements=$(@($Verification.measurements|ForEach-Object{$_.milliseconds}) -join ','); inputs=$($Inputs.Count); changed=0"
'D2_CURRENT_FIRST_EXIT=0'
