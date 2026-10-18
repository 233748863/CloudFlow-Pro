param(
    [Parameter(Mandatory = $true)][string]$StatePath,
    [Parameter(Mandatory = $true)][ValidateSet('auth', 'hr', 'oa', 'crm', 'workflow', 'gateway')][string]$ServiceName,
    [string]$ClassPathFile,
    [string]$ExecutableJar,
    [switch]$Layered,
    [switch]$RecoverExited
)

$ErrorActionPreference = 'Stop'
if ($ClassPathFile -and $ExecutableJar) { throw 'Select one launch form: classpath or executable jar' }
if ($Layered -and -not $ExecutableJar) { throw 'Layered launch requires a verified executable jar' }
$Root = [IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
$Runtime = [IO.Path]::GetFullPath((Join-Path $Root '.cloudflow-runtime/batch-g-integration'))
$StateFile = (Resolve-Path -LiteralPath $StatePath).Path
$Run = Split-Path -Parent $StateFile
if ((Split-Path -Parent $Run) -ne $Runtime -or (Split-Path -Leaf $Run) -notmatch '^[a-f0-9]{32}$' -or (Split-Path -Leaf $StateFile) -ne 'state.json') { throw 'Owned integration state required' }
$Directory = Join-Path $Run $ServiceName
foreach ($Candidate in @($Runtime, $Run, $Directory, $StateFile)) {
    if ((Get-Item -LiteralPath $Candidate).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Redirected integration path rejected' }
}
$State = Get-Content -LiteralPath $StateFile -Raw | ConvertFrom-Json
if ($State.status -ne 'RUNNING' -or [IO.Path]::GetFullPath($State.run) -ne $Run) { throw 'Running isolated environment required' }
$Services = @($State.services | Where-Object name -EQ $ServiceName)
$Processes = @($State.processes | Where-Object name -EQ $ServiceName)
if ($Services.Count -ne 1 -or $Processes.Count -ne 1) { throw 'Unique owned service required' }
$Service = $Services[0]
$Owned = $Processes[0]
$ArgumentFile = Join-Path $Directory 'service.args'
$PropertiesFile = Join-Path $Directory 'integration.properties'
foreach ($Candidate in @($ArgumentFile, $PropertiesFile)) {
    if ((Get-Item -LiteralPath $Candidate).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Redirected service configuration rejected' }
}
if ($Owned.marker -ne $ArgumentFile) { throw 'Owned Java argument file mismatch' }
$Properties = Get-Content -LiteralPath $PropertiesFile
foreach ($Required in @('server.address=127.0.0.1', 'management.server.address=127.0.0.1', 'spring.data.redis.host=127.0.0.1', "spring.data.redis.port=$($State.redisPort)", 'spring.cloud.nacos.discovery.enabled=false', 'spring.cloud.nacos.config.enabled=false', "server.port=$($Service.port)", "management.server.port=$($Service.healthPort)")) {
    if ($Required -notin $Properties) { throw 'Loopback-only isolated configuration required' }
}
$DatabaseUrls = @($Properties | Where-Object { $_ -match '^(spring.datasource(.dynamic.datasource.master)?.url|DB_URL)=' })
if ($DatabaseUrls.Count -ne 3 -or @($DatabaseUrls | Where-Object { -not $_.Contains("jdbc:mysql://127.0.0.1:$($State.mysqlPort)/cloud_flow_db?") }).Count -gt 0) { throw 'Isolated database configuration required' }
$ArgumentLines = $null
$ArgumentHash = (Get-FileHash -LiteralPath $ArgumentFile).Hash
$JarHash = $null
$MainClasses = @{
    auth = 'com.cloudflow.auth.AuthApplication'; gateway = 'com.cloudflow.gateway.GatewayApplication'
    hr = 'com.cloudflow.hr.HrServiceApplication'; oa = 'com.cloudflow.oa.OaApplication'
    crm = 'com.cloudflow.crm.CrmApplication'; workflow = 'com.cloudflow.workflow.WorkflowApplication'
}
$ExpectedModule = switch ($ServiceName) {
    auth { 'cloudflow-auth' }; gateway { 'cloudflow-gateway' }; default { "cloudflow-service-$ServiceName" }
}
if ($Service.module -ne $ExpectedModule) { throw 'Owned service module mismatch' }
$ModuleTarget = [IO.Path]::GetFullPath((Join-Path $Root "cloudflow-backend/$ExpectedModule/target"))
function Set-LaunchArguments([string[]]$Lines, [string[]]$Replacement) {
    $Indices = @(0..($Lines.Count - 1) | Where-Object { $Lines[$_] -match '^"?(-cp|-classpath|--class-path|-jar)"?$' })
    if ($Indices.Count -ne 1) { throw 'Exactly one existing Java launch argument required' }
    $Index = $Indices[0]
    $Length = if ($Lines[$Index].Trim('"') -eq '-jar') { 2 } else { 3 }
    if ($Index + $Length -gt $Lines.Count) { throw 'Existing Java launch arguments incomplete' }
    if ($Length -eq 3 -and $Lines[$Index + 2].Trim('"') -ne $MainClasses[$ServiceName]) {
        $ExistingLayered=[IO.Path]::GetFullPath($Lines[$Index + 1].Trim('"'))
        if($Lines[$Index + 2].Trim('"') -ne 'org.springframework.boot.loader.launch.JarLauncher' -or (Split-Path -Parent $ExistingLayered) -ne (Join-Path $Directory 'artifacts') -or (Split-Path -Leaf $ExistingLayered) -notmatch '^[a-f0-9]{64}-layered$'){throw 'Existing service main class mismatch'}
        . (Join-Path $PSScriptRoot 'owned-layered-artifact.ps1')
        $ExistingHash=(Split-Path -Leaf $ExistingLayered).Substring(0,64)
        $VerifiedLayered=Get-OwnedLayeredArtifact (Join-Path (Split-Path -Parent $ExistingLayered) ($ExistingHash+'.jar')) (Split-Path -Parent $ExistingLayered) $ExistingHash
        if($VerifiedLayered.Path -ne $ExistingLayered){throw 'Existing layered launch differs from retained package'}
    }
    if ($Index -gt 0) { $Lines[0..($Index - 1)] }
    $Replacement
    if ($Index + $Length -lt $Lines.Count) { $Lines[($Index + $Length)..($Lines.Count - 1)] }
}
if ($ClassPathFile) {
    $DependencyFile = (Resolve-Path -LiteralPath $ClassPathFile).Path
    if (-not $DependencyFile.StartsWith($ModuleTarget + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw 'Dependency classpath must belong to the selected module target' }
    if ((Get-Item -LiteralPath $DependencyFile).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Redirected dependency classpath rejected' }
    $ClassPathEntries = @((Join-Path $ModuleTarget 'classes')) + @((Get-Content -LiteralPath $DependencyFile -Raw).Trim().Split([IO.Path]::PathSeparator))
    foreach ($Entry in $ClassPathEntries) {
        $ResolvedEntry = (Resolve-Path -LiteralPath $Entry).Path
        if ([IO.Path]::GetPathRoot($ResolvedEntry) -ne [IO.Path]::GetPathRoot($Root)) { throw 'Dependencies must remain on the data drive' }
        if ((Get-Item -LiteralPath $ResolvedEntry).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Redirected dependency entry rejected' }
    }
    $ClassPathValue = '"' + (($ClassPathEntries | Select-Object -Unique) -join [IO.Path]::PathSeparator).Replace('\', '/') + '"'
    $ArgumentLines = @(Set-LaunchArguments @(Get-Content -LiteralPath $ArgumentFile) @('-cp', $ClassPathValue, $MainClasses[$ServiceName]))
    Write-Output "ISOLATED_CLASSPATH_VERIFIED: service=$ServiceName; current_entries=$($ClassPathEntries.Count); data_drive_only=true"
}
if ($ExecutableJar) {
    $JarPath = (Resolve-Path -LiteralPath $ExecutableJar).Path
    if ((Split-Path -Parent $JarPath) -ne $ModuleTarget -or [IO.Path]::GetExtension($JarPath) -ne '.jar') { throw 'Executable jar must belong to the selected module target' }
    foreach ($Candidate in @((Join-Path $Root 'cloudflow-backend'), (Split-Path -Parent $ModuleTarget), $ModuleTarget, $JarPath)) {
        if ((Get-Item -LiteralPath $Candidate).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Redirected executable artifact path rejected' }
    }
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $Jar = [IO.Compression.ZipFile]::OpenRead($JarPath)
    try {
        $Reader = [IO.StreamReader]::new($Jar.GetEntry('META-INF/MANIFEST.MF').Open())
        try { $Manifest = $Reader.ReadToEnd() } finally { $Reader.Dispose() }
        if ($Manifest -notmatch '(?m)^Main-Class: org\.springframework\.boot\.loader\.launch\.JarLauncher\r?$' -or $Manifest -notmatch ('(?m)^Start-Class: ' + [regex]::Escape($MainClasses[$ServiceName]) + '\r?$')) { throw 'Executable service manifest mismatch' }
        if ($null -eq $Jar.GetEntry('BOOT-INF/classes/' + $MainClasses[$ServiceName].Replace('.', '/') + '.class') -or $null -eq $Jar.GetEntry('BOOT-INF/classpath.idx')) { throw 'Executable service layout incomplete' }
    } finally { $Jar.Dispose() }
    $JarHash = (Get-FileHash -LiteralPath $JarPath).Hash
    $ArtifactDirectory = Join-Path $Directory 'artifacts'
    if (-not (Test-Path -LiteralPath $ArtifactDirectory)) { [IO.Directory]::CreateDirectory($ArtifactDirectory) | Out-Null }
    if ((Get-Item -LiteralPath $ArtifactDirectory).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Redirected deployed artifact directory rejected' }
    $DeployedJar = Join-Path $ArtifactDirectory ($JarHash.ToLowerInvariant() + '.jar')
    if (-not (Test-Path -LiteralPath $DeployedJar)) { [IO.File]::Copy($JarPath, $DeployedJar, $false) }
    if ((Get-Item -LiteralPath $DeployedJar).Attributes -band [IO.FileAttributes]::ReparsePoint -or (Get-FileHash -LiteralPath $DeployedJar).Hash -ne $JarHash) { throw 'Deployed executable artifact identity mismatch' }
    if($Layered){
        . (Join-Path $PSScriptRoot 'owned-layered-artifact.ps1')
        $LayeredArtifact=Get-OwnedLayeredArtifact $DeployedJar $ArtifactDirectory $JarHash
        if(-not (Test-Path -LiteralPath (Join-Path $LayeredArtifact.Path 'org/springframework/boot/loader/launch/JarLauncher.class'))){throw 'Layered launcher missing'}
        $LayeredProof=Join-Path $ArtifactDirectory ($JarHash.ToLowerInvariant()+'-layered.json')
        $LayeredJson=$LayeredArtifact|ConvertTo-Json -Depth 4
        if(Test-Path -LiteralPath $LayeredProof){
            if((Get-Item -LiteralPath $LayeredProof).Attributes -band [IO.FileAttributes]::ReparsePoint -or (Get-Content -LiteralPath $LayeredProof -Raw).Trim() -ne $LayeredJson.Trim()){throw 'Retained layered byte manifest differs'}
        }else{[IO.File]::WriteAllText($LayeredProof,$LayeredJson,[Text.UTF8Encoding]::new($false))}
        $ArgumentLines = @(Set-LaunchArguments @(Get-Content -LiteralPath $ArgumentFile) @('-cp',('"'+$LayeredArtifact.Path.Replace('\','/')+'"'),'org.springframework.boot.loader.launch.JarLauncher'))
        Write-Output "ISOLATED_LAYERED_VERIFIED: service=$ServiceName; files=$($LayeredArtifact.Files.Count); package_entries_equal=true; business_warmup=false"
    }else{
        $ArgumentLines = @(Set-LaunchArguments @(Get-Content -LiteralPath $ArgumentFile) @('-jar', ('"' + $DeployedJar.Replace('\', '/') + '"')))
    }
    Write-Output "ISOLATED_EXECUTABLE_VERIFIED: service=$ServiceName; manifest=true; hash=$JarHash; data_drive_only=true"
}
$Revision = [Guid]::NewGuid().ToString('N')
if ($ArgumentLines) { Copy-Item -LiteralPath $ArgumentFile -Destination (Join-Path $Directory "service-before-$Revision.args") }
if ((Get-FileHash -LiteralPath $ArgumentFile).Hash -ne $ArgumentHash) { throw 'Service arguments changed before restart' }
if ($JarHash -and (Get-FileHash -LiteralPath $JarPath).Hash -ne $JarHash) { throw 'Executable artifact changed before restart' }
if ($JarHash -and (Get-FileHash -LiteralPath $DeployedJar).Hash -ne $JarHash) { throw 'Deployed artifact changed before restart' }
$Current = Get-CimInstance Win32_Process -Filter "ProcessId = $($Owned.id)"
if ($Current) {
    if ($Current.Name -ne 'java.exe' -or -not $Current.CommandLine.Contains($ArgumentFile)) { throw 'Owned Java process identity mismatch' }
    $Listeners = @(Get-NetTCPConnection -State Listen -OwningProcess $Owned.id -ErrorAction Stop)
    if (@($Listeners | Where-Object LocalAddress -NE '127.0.0.1').Count -gt 0 -or $Service.port -notin $Listeners.LocalPort -or $Service.healthPort -notin $Listeners.LocalPort) { throw 'Owned loopback listeners required' }
    $Executable = $Current.ExecutablePath
    $CreationDate = $Current.CreationDate
    $Verified = Get-CimInstance Win32_Process -Filter "ProcessId = $($Owned.id)"
    if (-not $Verified -or $Verified.CreationDate -ne $CreationDate -or $Verified.CommandLine -ne $Current.CommandLine) { throw 'Process changed during ownership verification' }
    Write-Output "ISOLATED_RESTART_VERIFIED: service=$ServiceName; loopback=true; process=$($Owned.id); production_modified=false"
    [Diagnostics.Process]::GetProcessById($Owned.id).Kill()
    Wait-Process -Id $Owned.id -Timeout 30 -ErrorAction SilentlyContinue
    if (Get-Process -Id $Owned.id -ErrorAction SilentlyContinue) { throw 'Owned service did not exit' }
} else {
    if (-not $RecoverExited) { throw 'Owned service has exited; explicit recovery is required' }
    $Duplicates = @(Get-CimInstance Win32_Process -Filter "Name = 'java.exe'" | Where-Object { $_.CommandLine -and $_.CommandLine.Contains($ArgumentFile) })
    if ($Duplicates.Count -gt 0) { throw 'Service argument file is already in use by another process' }
    $Occupied = @(Get-NetTCPConnection -State Listen | Where-Object { $_.LocalPort -in @($Service.port, $Service.healthPort) })
    if ($Occupied.Count -gt 0) { throw 'Recovery ports are already in use' }
    if (-not $env:JAVA_HOME) { throw 'Verified JAVA_HOME is required for recovery' }
    $Executable = (Resolve-Path -LiteralPath (Join-Path $env:JAVA_HOME 'bin/java.exe')).Path
    $PeerExecutables = @($State.processes | Where-Object { $_.name -in @('auth', 'hr', 'oa', 'crm', 'workflow', 'gateway') -and $_.name -ne $ServiceName } | ForEach-Object {
        $Peer = Get-CimInstance Win32_Process -Filter "ProcessId = $($_.id)"
        if ($Peer -and $Peer.Name -eq 'java.exe' -and $Peer.CommandLine -and $Peer.CommandLine.Contains($_.marker)) { $Peer.ExecutablePath }
    } | Select-Object -Unique)
    if ($Executable -notin $PeerExecutables -or (Get-Item -LiteralPath $Executable).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Recovery Java must match a verified running isolated service' }
    Write-Output "ISOLATED_RECOVERY_VERIFIED: service=$ServiceName; previous_process_absent=true; ports_free=true; previous_pid=$($Owned.id); production_modified=false"
}
if ($ArgumentLines) { [IO.File]::WriteAllLines($ArgumentFile, $ArgumentLines, [Text.UTF8Encoding]::new($false)) }
foreach ($Log in @('stdout', 'stderr')) {
    $Original = Join-Path $Directory "$Log.log"
    if (Test-Path -LiteralPath $Original) { Copy-Item -LiteralPath $Original -Destination (Join-Path $Directory "$Log-before-$Revision.log") }
}
$Process = Start-Process -FilePath $Executable -WindowStyle Hidden -PassThru -WorkingDirectory $Directory -ArgumentList ('"@' + $ArgumentFile + '"') -RedirectStandardOutput (Join-Path $Directory 'stdout.log') -RedirectStandardError (Join-Path $Directory 'stderr.log')
$Owned.id = $Process.Id
$State | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $StateFile -Encoding utf8
$Deadline = [DateTime]::UtcNow.AddSeconds(360)
while ([DateTime]::UtcNow -lt $Deadline) {
    if ($Process.HasExited) { throw 'Restarted isolated service exited; inspect its retained logs' }
    try {
        $Response = Invoke-WebRequest -Uri "http://127.0.0.1:$($Service.healthPort)/actuator/health" -TimeoutSec 2
        $Content = if ($Response.Content -is [byte[]]) { [Text.Encoding]::UTF8.GetString($Response.Content) } else { [string]$Response.Content }
        $Health = $Content | ConvertFrom-Json
        if ($Health.status -eq 'UP') {
            Write-Output "ISOLATED_RESTART_READY: service=$ServiceName; port=$($Service.port); process=$($Process.Id); production_modified=false"
            exit 0
        }
    } catch { }
    Start-Sleep -Seconds 2
}
throw 'Restarted isolated service readiness timed out; process and diagnostics retained'
