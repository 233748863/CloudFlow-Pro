param(
    [Parameter(Mandatory = $true)][string]$StatePath,
    [ValidateSet('Prepare','Start','Stop','Restore','ExcludeDiscovery','IncludeDiscovery')][string]$Action = 'Prepare',
    [string]$FixturePath
)

$ErrorActionPreference = 'Stop'
$Root = [IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
. (Join-Path $Root '.cloudflow-runtime/use-data-drive.ps1')
$StateFile = (Resolve-Path -LiteralPath $StatePath).Path
$Run = Split-Path -Parent $StateFile
if ((Split-Path -Parent $Run) -ne (Join-Path $Root '.cloudflow-runtime/batch-g-integration') -or (Split-Path -Leaf $Run) -notmatch '^[a-f0-9]{32}$' -or (Split-Path -Leaf $StateFile) -ne 'state.json') { throw 'Owned integration state required' }
$State = Get-Content -LiteralPath $StateFile -Raw | ConvertFrom-Json
if ($State.run -ne $Run -or $State.status -ne 'RUNNING') { throw 'Running isolated state required' }
$Private = Join-Path $Run 'private'
$AuthFile = Join-Path $Run 'auth/integration.properties'
foreach ($Candidate in @($Root,$Run,$StateFile,$Private,$AuthFile)) {
    if ((Get-Item -LiteralPath $Candidate).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Redirected runtime path rejected' }
}
function Get-Hash([string]$File) { return (Get-FileHash -LiteralPath $File).Hash }
function Assert-BaseService([string]$Name) {
    $Service = @($State.services | Where-Object name -EQ $Name)
    $Owned = @($State.processes | Where-Object name -EQ $Name)
    if ($Service.Count -ne 1 -or $Owned.Count -ne 1 -or $Owned[0].marker -ne (Join-Path $Run "$Name/service.args")) { throw 'Unique owned base service required' }
    $Current = Get-CimInstance Win32_Process -Filter "ProcessId = $($Owned[0].id)"
    if (-not $Current -or $Current.Name -ne 'java.exe' -or -not $Current.CommandLine.Contains($Owned[0].marker)) { throw 'Base process identity mismatch' }
    $Listeners = @(Get-NetTCPConnection -State Listen -OwningProcess $Current.ProcessId)
    if (@($Listeners | Where-Object LocalAddress -NE '127.0.0.1').Count -ne 0 -or $Service[0].port -notin $Listeners.LocalPort -or $Service[0].healthPort -notin $Listeners.LocalPort) { throw 'Base process loopback listeners required' }
    return $Current
}
if ($Action -eq 'Prepare') {
    if ($FixturePath) { throw 'Prepare creates its own fixture' }
    foreach ($Existing in @(Get-ChildItem -LiteralPath $Private -Directory -Filter 'data-source-peer-*')) {
        if ($Existing.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Redirected peer fixture rejected' }
        $Previous = Join-Path $Existing.FullName 'peer.json'
        if ((Test-Path $Previous) -and (Get-Content $Previous -Raw | ConvertFrom-Json).status -ne 'RESTORED') { throw 'Restore previous peer fixture first' }
    }
    $Auth = Assert-BaseService 'auth'
    $Hr = Assert-BaseService 'hr'
    if ($Auth.ExecutablePath -ne $Hr.ExecutablePath) { throw 'Shared verified Java executable required' }
    $SourceArgs = Join-Path $Run 'hr/service.args'
    $SourceConfig = Join-Path $Run 'hr/integration.properties'
    foreach ($Candidate in @($SourceArgs,$SourceConfig,$Hr.ExecutablePath)) {
        if ((Get-Item -LiteralPath $Candidate).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Redirected peer source rejected' }
    }
    $AuthText = [IO.File]::ReadAllText($AuthFile)
    $ConfigText = [IO.File]::ReadAllText($SourceConfig)
    foreach ($Text in @($AuthText,$ConfigText)) {
        foreach ($Required in @('server.address=127.0.0.1','management.server.address=127.0.0.1','spring.cloud.nacos.discovery.enabled=false','cloudflow.datasource.runtime.enabled=true',"spring.data.redis.port=$($State.redisPort)")) {
            if ($Required -notin ($Text -split '\r?\n')) { throw 'Enabled loopback data source fixture required' }
        }
    }
    if ($AuthText -match '(?m)^spring.cloud.discovery.client.simple.instances.cloudflow-service-hr\[1\]') { throw 'Second HR discovery slot already exists' }
    $Reservations = @([Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback,0),[Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback,0))
    try { foreach ($Listener in $Reservations) { $Listener.Start() }; $Port = $Reservations[0].LocalEndpoint.Port; $HealthPort = $Reservations[1].LocalEndpoint.Port } finally { foreach ($Listener in $Reservations) { $Listener.Stop() } }
    $Fixture = Join-Path $Private ('data-source-peer-' + [Guid]::NewGuid().ToString('N'))
    [IO.Directory]::CreateDirectory($Fixture) | Out-Null
    $ManifestFile = Join-Path $Fixture 'peer.json'
    $Config = Join-Path $Fixture 'integration.properties'
    $Arguments = Join-Path $Fixture 'service.args'
    $AuthBackup = Join-Path $Fixture 'auth.properties.before'
    [IO.File]::WriteAllBytes($AuthBackup,[IO.File]::ReadAllBytes($AuthFile))
    [IO.File]::WriteAllText($Config,$ConfigText + "`nserver.port=$Port`nmanagement.server.port=$HealthPort`n",[Text.UTF8Encoding]::new($false))
    $ArgumentText = [IO.File]::ReadAllText($SourceArgs)
    $SourceLocation = '--spring.config.additional-location=file:' + $SourceConfig.Replace('\','/')
    if ([regex]::Matches($ArgumentText,[regex]::Escape($SourceLocation)).Count -ne 1) { throw 'Unique source configuration argument required' }
    [IO.File]::WriteAllText($Arguments,$ArgumentText.Replace($SourceLocation,'--spring.config.additional-location=file:' + $Config.Replace('\','/')),[Text.UTF8Encoding]::new($false))
    $AppliedAuth = $AuthText + "`nspring.cloud.discovery.client.simple.instances.cloudflow-service-hr[1].uri=http://127.0.0.1:$Port`n"
    $Manifest = [PSCustomObject]@{ statePath=$StateFile; status='PREPARED'; directory=$Fixture; application='cloudflow-service-hr'; name='hr-peer'; port=$Port; healthPort=$HealthPort; executable=$Hr.ExecutablePath; executableHash=(Get-Hash $Hr.ExecutablePath); argumentFile=$Arguments; argumentHash=(Get-Hash $Arguments); configurationFile=$Config; configurationHash=(Get-Hash $Config); authOriginalHash=(Get-Hash $AuthBackup); authAppliedHash=$null; processId=0; processCreated=$null; productionModified=$false }
    $Manifest | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $ManifestFile -Encoding utf8NoBOM
    if ((Get-Hash $AuthFile) -ne $Manifest.authOriginalHash) { throw 'Auth configuration changed during preparation' }
    [IO.File]::WriteAllText($AuthFile,$AppliedAuth,[Text.UTF8Encoding]::new($false))
    $Manifest.authAppliedHash = Get-Hash $AuthFile
    $Manifest.status = 'STOPPED'
    $Manifest | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $ManifestFile -Encoding utf8NoBOM
    Write-Output 'DATASOURCE_PEER_PREPARED: production_application=true; auth_discovery_restart_required=true; production_modified=false'
    Write-Output "DATASOURCE_PEER_FIXTURE=$ManifestFile"
    exit 0
}
if (-not $FixturePath) { throw 'Existing fixture path required' }
$ManifestFile = (Resolve-Path -LiteralPath $FixturePath).Path
$Fixture = Split-Path -Parent $ManifestFile
if ((Split-Path -Parent $Fixture) -ne $Private -or (Split-Path -Leaf $Fixture) -notmatch '^data-source-peer-[a-f0-9]{32}$' -or (Split-Path -Leaf $ManifestFile) -ne 'peer.json') { throw 'Owned peer fixture required' }
$Manifest = Get-Content -LiteralPath $ManifestFile -Raw | ConvertFrom-Json
if ($Manifest.statePath -ne $StateFile -or $Manifest.directory -ne $Fixture -or $Manifest.status -eq 'RESTORED' -or
        $Manifest.argumentFile -ne (Join-Path $Fixture 'service.args') -or $Manifest.configurationFile -ne (Join-Path $Fixture 'integration.properties')) { throw 'Peer fixture ownership mismatch' }
foreach ($Candidate in @($Fixture,$ManifestFile,$Manifest.argumentFile,$Manifest.configurationFile,$Manifest.executable)) {
    if ((Get-Item -LiteralPath $Candidate).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Redirected peer path rejected' }
}
if ((Get-Hash $Manifest.executable) -ne $Manifest.executableHash -or (Get-Hash $Manifest.argumentFile) -ne $Manifest.argumentHash -or (Get-Hash $Manifest.configurationFile) -ne $Manifest.configurationHash) { throw 'Peer runtime input changed' }
if ($Action -in @('ExcludeDiscovery','IncludeDiscovery')) {
    if ($Manifest.status -ne 'RUNNING') { throw 'Running peer required for discovery-only changes' }
    $Current = Get-CimInstance Win32_Process -Filter "ProcessId = $($Manifest.processId)"
    if (-not $Current -or $Current.Name -ne 'java.exe' -or $Current.CreationDate.ToUniversalTime() -ne ([DateTime]$Manifest.processCreated).ToUniversalTime() -or -not $Current.CommandLine.Contains($Manifest.argumentFile)) { throw 'Peer process identity changed' }
    $Listeners = @(Get-NetTCPConnection -State Listen -OwningProcess $Current.ProcessId)
    if (@($Listeners | Where-Object LocalAddress -NE '127.0.0.1').Count -ne 0 -or $Manifest.port -notin $Listeners.LocalPort -or $Manifest.healthPort -notin $Listeners.LocalPort) { throw 'Peer loopback listener ownership required' }
    $Backup = Join-Path $Fixture 'auth.properties.before'
    if ((Get-Item -LiteralPath $Backup).Attributes -band [IO.FileAttributes]::ReparsePoint -or (Get-Hash $Backup) -ne $Manifest.authOriginalHash) { throw 'Original auth configuration required' }
    $IncludedText = [IO.File]::ReadAllText($Backup) + "`nspring.cloud.discovery.client.simple.instances.cloudflow-service-hr[1].uri=http://127.0.0.1:$($Manifest.port)`n"
    $IncludedBytes = [Text.UTF8Encoding]::new($false).GetBytes($IncludedText)
    if ([Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($IncludedBytes)) -ne $Manifest.authAppliedHash) { throw 'Exact included discovery configuration required' }
    $Exclude = $Action -eq 'ExcludeDiscovery'
    $ExpectedHash = if ($Exclude) { $Manifest.authAppliedHash } else { $Manifest.authOriginalHash }
    if ((Get-Hash $AuthFile) -ne $ExpectedHash) { throw 'Auth configuration changed outside discovery fixture' }
    $Bytes = if ($Exclude) { [IO.File]::ReadAllBytes($Backup) } else { $IncludedBytes }
    [IO.File]::WriteAllBytes($AuthFile,$Bytes)
    & (Join-Path $PSScriptRoot 'restart-isolated-integration-service.ps1') -StatePath $StateFile -ServiceName auth
    if ($LASTEXITCODE -ne 0) { throw 'Auth discovery restart failed' }
    $Verified = Get-CimInstance Win32_Process -Filter "ProcessId = $($Manifest.processId)"
    if (-not $Verified -or $Verified.CreationDate -ne $Current.CreationDate -or $Verified.CommandLine -ne $Current.CommandLine) { throw 'Peer changed during discovery-only restart' }
    Write-Output "DATASOURCE_PEER_DISCOVERY: action=$Action; auth_restarted=true; peer_process_unchanged=true; production_modified=false"
    exit 0
}
if ($Action -eq 'Stop') {
    if ($Manifest.status -ne 'RUNNING') { throw 'Running peer required' }
    $Current = Get-CimInstance Win32_Process -Filter "ProcessId = $($Manifest.processId)"
    if (-not $Current -or $Current.Name -ne 'java.exe' -or $Current.CreationDate.ToUniversalTime() -ne ([DateTime]$Manifest.processCreated).ToUniversalTime() -or -not $Current.CommandLine.Contains($Manifest.argumentFile)) { throw 'Peer process identity changed' }
    $Listeners = @(Get-NetTCPConnection -State Listen -OwningProcess $Current.ProcessId)
    if (@($Listeners | Where-Object LocalAddress -NE '127.0.0.1').Count -ne 0 -or $Manifest.port -notin $Listeners.LocalPort -or $Manifest.healthPort -notin $Listeners.LocalPort) { throw 'Peer loopback listener ownership required' }
    $Verified = Get-CimInstance Win32_Process -Filter "ProcessId = $($Manifest.processId)"
    if (-not $Verified -or $Verified.CreationDate -ne $Current.CreationDate -or $Verified.CommandLine -ne $Current.CommandLine) { throw 'Peer identity changed before stop' }
    [Diagnostics.Process]::GetProcessById($Current.ProcessId).Kill()
    Wait-Process -Id $Current.ProcessId -Timeout 30 -ErrorAction SilentlyContinue
    if (Get-Process -Id $Current.ProcessId -ErrorAction SilentlyContinue) { throw 'Owned peer did not exit' }
    $Manifest.status = 'STOPPED'
    $Manifest | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $ManifestFile -Encoding utf8NoBOM
    Write-Output 'DATASOURCE_PEER_STOPPED: identity_and_loopback_verified=true; production_modified=false'
    exit 0
}
if ($Manifest.status -ne 'STOPPED') { throw 'Stopped peer required' }
if (@(Get-CimInstance Win32_Process -Filter "Name = 'java.exe'" | Where-Object { $_.CommandLine -and $_.CommandLine.Contains($Manifest.argumentFile) }).Count -ne 0) { throw 'Peer argument file already in use' }
if ($Action -eq 'Restore') {
    $Backup = Join-Path $Fixture 'auth.properties.before'
    if ((Get-Item -LiteralPath $Backup).Attributes -band [IO.FileAttributes]::ReparsePoint -or (Get-Hash $Backup) -ne $Manifest.authOriginalHash -or
            (Get-Hash $AuthFile) -notin @($Manifest.authAppliedHash,$Manifest.authOriginalHash)) { throw 'Auth configuration changed outside peer fixture' }
    [IO.File]::WriteAllBytes($AuthFile,[IO.File]::ReadAllBytes($Backup))
    if ((Get-Hash $AuthFile) -ne $Manifest.authOriginalHash) { throw 'Exact auth configuration restoration failed' }
    $Manifest.status = 'RESTORED'
    $Manifest | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $ManifestFile -Encoding utf8NoBOM
    Write-Output 'DATASOURCE_PEER_RESTORED: exact_auth_bytes=true; peer_stopped=true; auth_restart_required=true; production_modified=false'
    exit 0
}
if ($Action -ne 'Start') { throw 'Unsupported peer action' }
$Hr = Assert-BaseService 'hr'
if ($Hr.ExecutablePath -ne $Manifest.executable) { throw 'Peer executable no longer matches verified HR' }
if (@(Get-NetTCPConnection -State Listen | Where-Object LocalPort -In @($Manifest.port,$Manifest.healthPort)).Count -ne 0) { throw 'Peer ports occupied' }
$Revision = [Guid]::NewGuid().ToString('N')
foreach ($Name in @('stdout','stderr')) {
    $Original = Join-Path $Fixture "$Name.log"
    if (Test-Path $Original) { Copy-Item -LiteralPath $Original -Destination (Join-Path $Fixture "$Name-before-$Revision.log") }
}
$Started = Start-Process -FilePath $Manifest.executable -WindowStyle Hidden -PassThru -WorkingDirectory $Fixture -ArgumentList ('"@' + $Manifest.argumentFile + '"') -RedirectStandardOutput (Join-Path $Fixture 'stdout.log') -RedirectStandardError (Join-Path $Fixture 'stderr.log')
$Current = Get-CimInstance Win32_Process -Filter "ProcessId = $($Started.Id)"
if (-not $Current -or -not $Current.CommandLine.Contains($Manifest.argumentFile)) { throw 'Started peer identity unavailable' }
$Manifest.processId = $Started.Id
$Manifest.processCreated = $Current.CreationDate.ToUniversalTime().ToString('o')
$Manifest.status = 'RUNNING'
$Manifest | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $ManifestFile -Encoding utf8NoBOM
$Deadline = [DateTime]::UtcNow.AddSeconds(360)
while ([DateTime]::UtcNow -lt $Deadline) {
    if ($Started.HasExited) { throw 'Peer exited before readiness' }
    try {
        $Health = Invoke-RestMethod "http://127.0.0.1:$($Manifest.healthPort)/actuator/health" -TimeoutSec 2
        if ($Health.status -eq 'UP') { Write-Output "DATASOURCE_PEER_READY: process=$($Started.Id); port=$($Manifest.port); actual_hr_application=true; production_modified=false"; exit 0 }
    } catch { }
    Start-Sleep -Seconds 2
}
throw 'Peer readiness observation expired; keep process and diagnostics for inspection'
