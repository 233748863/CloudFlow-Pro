param([ValidatePattern('^r[1-9][0-9]*$')][string]$Round='r1',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$VerificationRound='r6',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$ResumeSource='r5',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$BackendRound='r89',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$FrontendRound='r58',
    [ValidateSet('Detailed','Cpu')][string]$ProfileMode='Detailed',
    [switch]$ReloadAllServices)
$ErrorActionPreference='Stop'
. 'D:\CloudFlowPro\.cloudflow-runtime\use-data-drive.ps1'
$Root='D:\CloudFlowPro'
$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
$Output=Join-Path $Evidence "d2-cold-first-profile-20261005-$Round"
$Run=Join-Path $Root '.cloudflow-runtime/batch-g-integration/9799534e1a3a47b5958330f14ae16dc7'
foreach($Target in @($Output,(Join-Path $Evidence "d2-leave-attendance-20261005-$VerificationRound"),(Join-Path $Evidence "owned-captcha-d2-leave-attendance-20261005-$VerificationRound.json"))){
    if(Test-Path -LiteralPath $Target){throw 'Retain earlier first-request profile and business evidence'}
}
[IO.Directory]::CreateDirectory($Output)|Out-Null
$ExecutionSources=@(rg --files scripts -g '*.mjs')+@('scripts/run-d2-cold-profile.ps1','scripts/restart-isolated-integration-service.ps1','scripts/run-d2-leave-attendance.ps1','scripts/owned-layered-artifact.ps1')
$Paths=@($ExecutionSources);$BuildInputs=@()
foreach($Build in @("backend-$BackendRound","frontend-$FrontendRound")){
    $BuildPath=Join-Path $Evidence "h3-portal-finance-20261002-$Build-inputs.json"
    $BuildInputs+=@(Get-Content -LiteralPath $BuildPath -Raw|ConvertFrom-Json)
    $Paths+=$BuildPath
}
foreach($Item in $BuildInputs){if((Get-FileHash -LiteralPath (Join-Path $Root $Item.Path)).Hash -ne $Item.Hash){throw 'Profile build input changed'}}
$Paths+=@($BuildInputs|ForEach-Object Path)
$State=Get-Content -LiteralPath (Join-Path $Run 'state.json') -Raw|ConvertFrom-Json
if($State.status -ne 'RUNNING' -or [IO.Path]::GetFullPath($State.run) -ne $Run){throw 'Owned running fixture required'}
foreach($Entry in $State.processes){
    $Observed=Get-CimInstance Win32_Process -Filter "ProcessId=$($Entry.id)"
    if(-not $Observed -or -not $Observed.CommandLine.Contains($Entry.marker)){throw 'Owned process verification failed'}
}
. (Join-Path $Root 'scripts/owned-layered-artifact.ps1')
$LayeredDirectories=@{};$LayeredFiles=0
foreach($Service in $State.services){
    $ArgumentPath=Join-Path $Run "$($Service.name)/service.args"
    $PropertyPath=Join-Path $Run "$($Service.name)/integration.properties"
    $Paths+=@($ArgumentPath,$PropertyPath)
    foreach($Setting in @(Get-Content -LiteralPath $PropertyPath|Where-Object{$_ -like 'spring.redis.redisson.file=file:*'})){
        $Config=[IO.Path]::GetFullPath($Setting.Substring('spring.redis.redisson.file=file:'.Length))
        if(-not $Config.StartsWith($Run+'\private\',[StringComparison]::OrdinalIgnoreCase)){throw 'Owned Redis configuration required'}
        $Paths+=$Config
    }
    $Arguments=@(Get-Content -LiteralPath $ArgumentPath)
    $JarMarkers=@(0..($Arguments.Count-1)|Where-Object{$Arguments[$_] -eq '-jar'})
    $ClassMarkers=@(0..($Arguments.Count-1)|Where-Object{$Arguments[$_] -eq '-cp'})
    $ArtifactDirectory=Join-Path $Run "$($Service.name)/artifacts"
    if($JarMarkers.Count -eq 1 -and $ClassMarkers.Count -eq 0 -and $JarMarkers[0]+1 -lt $Arguments.Count){
        $JarPath=[IO.Path]::GetFullPath($Arguments[$JarMarkers[0]+1].Trim('"'))
        if((Split-Path -Parent $JarPath) -ne $ArtifactDirectory -or (Split-Path -Leaf $JarPath) -notmatch '^([a-f0-9]{64})\.jar$'){throw 'Owned immutable executable package required'}
        if((Get-FileHash -LiteralPath $JarPath).Hash -ne $Matches[1]){throw 'Executable package content differs'}
        $Paths+=$JarPath
    }elseif($JarMarkers.Count -eq 0 -and $ClassMarkers.Count -eq 1 -and $ClassMarkers[0]+2 -lt $Arguments.Count -and $Arguments[$ClassMarkers[0]+2] -eq 'org.springframework.boot.loader.launch.JarLauncher'){
        $LayeredPath=[IO.Path]::GetFullPath($Arguments[$ClassMarkers[0]+1].Trim('"'))
        if((Split-Path -Parent $LayeredPath) -ne $ArtifactDirectory -or (Split-Path -Leaf $LayeredPath) -notmatch '^([a-f0-9]{64})-layered$' -or -not (Test-Path -LiteralPath $LayeredPath -PathType Container)){throw 'Existing owned layered package required'}
        $PackageHash=$Matches[1];$JarPath=Join-Path $ArtifactDirectory ($PackageHash+'.jar')
        $Proof=Get-OwnedLayeredArtifact -JarPath $JarPath -ArtifactDirectory $ArtifactDirectory -ExpectedHash $PackageHash
        if($Proof.Path -ne $LayeredPath){throw 'Actual layered launch differs from source package'}
        $Paths+=@($JarPath,($LayeredPath+'.json'))+@($Proof.Files|ForEach-Object{Join-Path $LayeredPath $_.Path})
        $LayeredDirectories[$LayeredPath]=$Proof.Files.Count;$LayeredFiles+=$Proof.Files.Count
    }else{throw 'Actual immutable executable or layered launch required'}
    $ModulePackage=Join-Path $Root "cloudflow-backend/$($Service.module)/target/$($Service.module)-1.0.0.jar"
    if((Get-FileHash -LiteralPath $ModulePackage).Hash -ne (Get-FileHash -LiteralPath $JarPath).Hash){throw 'Running package differs from build package'}
    $Paths+=$ModulePackage
}
$SourcePath=Join-Path $Evidence "d2-leave-attendance-20261005-$ResumeSource"
foreach($Name in @('fixture.json','result.json','inputs.json','original-verify-d2-leave-attendance.mjs','original-run-d2-leave-attendance.ps1','original-run-d2-leave-attendance-allowance.mjs')){$Paths+=Join-Path $SourcePath $Name}
$Inputs=@($Paths|ForEach-Object{[IO.Path]::GetFullPath($_,$Root)}|Sort-Object -Unique|ForEach-Object{[pscustomobject]@{Path=$_;Hash=(Get-FileHash -LiteralPath $_).Hash}})
function Assert-CurrentInputs {
    foreach($Item in $Inputs){if((Get-FileHash -LiteralPath $Item.Path).Hash -ne $Item.Hash){throw 'Profile execution input changed'}}
    foreach($Directory in $LayeredDirectories.Keys){
        $Files=@(Get-ChildItem -LiteralPath $Directory -Recurse -Force)
        if(@($Files|Where-Object{-not $_.PSIsContainer}).Count -ne $LayeredDirectories[$Directory] -or @($Files|Where-Object{$_.Attributes -band [IO.FileAttributes]::ReparsePoint}).Count){throw 'Profile layered file set changed'}
    }
}
$Inputs|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $Output 'inputs.json') -Encoding utf8NoBOM
foreach($Source in $ExecutionSources){
    $Original=Join-Path (Join-Path $Output 'originals') $Source
    [IO.Directory]::CreateDirectory((Split-Path -Parent $Original))|Out-Null
    [IO.File]::Copy((Join-Path $Root $Source),$Original,$false)
}
[IO.File]::Copy((Join-Path $Root 'scripts/run-d2-cold-profile.ps1'),(Join-Path $Output 'original-run-d2-cold-profile.ps1'),$false)
$Configuration=Join-Path $Output 'first-request.jfc'
$Jfc=@'
<?xml version="1.0" encoding="UTF-8"?>
<configuration version="2.0" label="D2 first request diagnostics" description="Read-only samples; never a performance acceptance run" provider="CloudFlow checks">
  <event name="jdk.ExecutionSample"><setting name="enabled">true</setting><setting name="period">1 ms</setting></event>
  <event name="jdk.NativeMethodSample"><setting name="enabled">true</setting><setting name="period">1 ms</setting></event>
  <event name="jdk.SocketRead"><setting name="enabled">true</setting><setting name="stackTrace">true</setting><setting name="threshold">1 ms</setting></event>
  <event name="jdk.SocketWrite"><setting name="enabled">true</setting><setting name="stackTrace">true</setting><setting name="threshold">1 ms</setting></event>
  <event name="jdk.ThreadPark"><setting name="enabled">true</setting><setting name="stackTrace">true</setting><setting name="threshold">1 ms</setting></event>
  <event name="jdk.JavaMonitorEnter"><setting name="enabled">true</setting><setting name="stackTrace">true</setting><setting name="threshold">1 ms</setting></event>
  <event name="jdk.ClassLoad"><setting name="enabled">true</setting><setting name="stackTrace">true</setting><setting name="threshold">1 ms</setting></event>
  <event name="jdk.GarbageCollection"><setting name="enabled">true</setting></event>
  <event name="jdk.GCPhasePause"><setting name="enabled">true</setting></event>
</configuration>
'@
if($ProfileMode -eq 'Cpu'){
    # Sampling without class-load stack traces keeps startup instrumentation smaller.
    # This remains diagnostic and is never used as an ordinary performance result.
    $Jfc=$Jfc.Replace('<setting name="period">1 ms</setting>','<setting name="period">5 ms</setting>')
    $Jfc=$Jfc.Replace('<event name="jdk.NativeMethodSample"><setting name="enabled">true</setting>','<event name="jdk.NativeMethodSample"><setting name="enabled">false</setting>')
    $Jfc=$Jfc.Replace('<event name="jdk.ClassLoad"><setting name="enabled">true</setting>','<event name="jdk.ClassLoad"><setting name="enabled">false</setting>')
}
[IO.File]::WriteAllText($Configuration,$Jfc,[Text.UTF8Encoding]::new($false))
$ReloadNames=if($ReloadAllServices){@('auth','oa','crm','workflow','gateway','hr')}else{@('hr')}
$ReloadResults=[Collections.Generic.List[object]]::new()
foreach($ServiceName in $ReloadNames){
    $LogName=if($ReloadAllServices){"reload-$ServiceName"}else{'reload'}
    $Reload=Start-Process -FilePath (Get-Process -Id $PID).Path -WindowStyle Hidden -PassThru -ArgumentList @('-NoLogo','-NoProfile','-File','scripts/restart-isolated-integration-service.ps1','-StatePath',(Join-Path $Run 'state.json'),'-ServiceName',$ServiceName) -WorkingDirectory $Root -RedirectStandardOutput (Join-Path $Output ($LogName+'.log')) -RedirectStandardError (Join-Path $Output ($LogName+'.err'))
    $Reload.WaitForExit();$Reload.Refresh()
    $ReloadResults.Add([pscustomobject]@{Name=$ServiceName;Exit=$Reload.ExitCode})
    $ReloadResults|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $Output 'reload-progress.json') -Encoding utf8NoBOM
    if($Reload.ExitCode -ne 0){throw 'Retain original service reload failure; do not launch a duplicate'}
    Assert-CurrentInputs
    "D2_PROFILE_RELOADED: service=$ServiceName; exit=0"
}
$State=Get-Content -LiteralPath (Join-Path $Run 'state.json') -Raw|ConvertFrom-Json
$Profiles=[Collections.Generic.List[object]]::new()
$Name='D2ColdFirst'+$Round
$PriorProfile=$env:CLOUDFLOW_D2_PROFILE_FIRST
$Failure=$null;$VerifierExit=$null
try{
    foreach($ServiceName in @('hr','auth','gateway')){
        $Owned=@($State.processes|Where-Object name -EQ $ServiceName)
        if($Owned.Count -ne 1){throw 'Unique profile process required'}
        $Current=Get-CimInstance Win32_Process -Filter "ProcessId=$($Owned[0].id)"
        if($Owned.Count -ne 1 -or -not $Current -or -not $Current.CommandLine.Contains($Owned[0].marker)){throw 'Profile process ownership mismatch'}
        $File=Join-Path $Output "$ServiceName.jfr"
        & jcmd $Owned[0].id JFR.start "name=$Name" "settings=$($Configuration.Replace('\','/'))" "filename=$($File.Replace('\','/'))" dumponexit=true *> (Join-Path $Output "$ServiceName-start.log")
        if($LASTEXITCODE -ne 0 -or (Get-Content -LiteralPath (Join-Path $Output "$ServiceName-start.log") -Raw) -notmatch 'Started recording'){throw 'Profile recording did not start'}
        $Profiles.Add([pscustomobject]@{name=$ServiceName;id=$Owned[0].id;marker=$Owned[0].marker;file=$File;stopped=$false})
    }
    $env:CLOUDFLOW_D2_PROFILE_FIRST='1'
    & node scripts/run-d2-leave-attendance-allowance.mjs $VerificationRound $BackendRound $FrontendRound $ResumeSource *> (Join-Path $Output 'verification.log')
    $VerifierExit=$LASTEXITCODE
    if($VerifierExit -ne 0){throw 'Diagnostic replay failed; keep original evidence'}
}catch{$Failure=$_.Exception.Message}
finally{
    $env:CLOUDFLOW_D2_PROFILE_FIRST=$PriorProfile
    foreach($Profile in $Profiles){
        $Current=Get-CimInstance Win32_Process -Filter "ProcessId=$($Profile.id)"
        if($Current -and $Current.CommandLine.Contains($Profile.marker)){
            & jcmd $Profile.id JFR.stop "name=$Name" *> (Join-Path $Output "$($Profile.name)-stop.log")
            $Profile.stopped=$LASTEXITCODE -eq 0 -and (Test-Path -LiteralPath $Profile.file) -and (Get-Item -LiteralPath $Profile.file).Length -gt 0
        }
    }
    $Changed=0
    try{Assert-CurrentInputs}catch{$Changed=1;$Failure=$Failure ?? $_.Exception.Message}
    $Stopped=$Profiles.Count -eq 3 -and @($Profiles|Where-Object {-not $_.stopped}).Count -eq 0
    $Result=@{passed=($null -eq $Failure -and $VerifierExit -eq 0 -and $Changed -eq 0 -and $Stopped);failure=$Failure;profiling=$true;profileMode=$ProfileMode;performanceAcceptance=$false;backendRound=$BackendRound;frontendRound=$FrontendRound;verificationRound=$VerificationRound;resumeSource=$ResumeSource;profiles=@($Profiles);inputs=$Inputs.Count;originalScripts=$ExecutionSources.Count;layeredFiles=$LayeredFiles;onlyHrReloaded=(-not $ReloadAllServices);allServicesReloaded=[bool]$ReloadAllServices;reloads=@($ReloadResults.ToArray());hrReloadedLast=($ReloadNames[-1] -eq 'hr');inputsUnchanged=($Changed -eq 0);profilesStopped=$Stopped;reloadExit=$Reload.ExitCode;verificationExit=$VerifierExit}
    $Result|ConvertTo-Json -Depth 5|Set-Content -LiteralPath (Join-Path $Output 'result.json') -Encoding utf8NoBOM
    Write-Output "D2_COLD_PROFILE: passed=$($Result.passed); profiles=$($Profiles.Count); stopped=$Stopped; inputs_changed=$Changed; performance_acceptance=false"
}
if(-not $Result.passed){throw "Cold request diagnostic failed: $Failure"}
