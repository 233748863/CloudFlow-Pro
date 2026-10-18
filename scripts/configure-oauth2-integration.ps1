param([Parameter(Mandatory = $true)][string]$StatePath, [ValidateSet("Prepare","Restore")][string]$Action = "Prepare", [string]$FixturePath, [switch]$BeforeServices)

$ErrorActionPreference = 'Stop'
$Root = [IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
. (Join-Path $Root '.cloudflow-runtime/use-data-drive.ps1')
$Runtime = Join-Path $Root '.cloudflow-runtime/batch-g-integration'
$StateFile = (Resolve-Path -LiteralPath $StatePath).Path
$Run = Split-Path -Parent $StateFile
if ((Split-Path -Parent $Run) -ne $Runtime -or (Split-Path -Leaf $Run) -notmatch '^[a-f0-9]{32}$' -or (Split-Path -Leaf $StateFile) -ne 'state.json') { throw 'Owned isolated state required' }
$Data = Join-Path $Run 'mysql-data'
foreach ($Candidate in @($Root, $Runtime, $Run, $StateFile, $Data)) {
    if ((Get-Item -LiteralPath $Candidate).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Redirected path rejected' }
}
$State = Get-Content -LiteralPath $StateFile -Raw | ConvertFrom-Json
if ([IO.Path]::GetFullPath($State.run) -ne $Run -or $State.mysqlPort -lt 1024 -or $State.mysqlPort -gt 65535) { throw 'Owned isolated environment required' }
if ($BeforeServices) {
    if ($Action -ne 'Prepare' -or $FixturePath -or $State.status -ne 'STARTING' -or $State.verification.mode -ne 'H3_CORE_INDEPENDENT' -or $State.verification.inputsFrozen -ne $false) { throw '启动前配置仅允许尚未冻结输入的独立门户验证环境' }
    if ($State.verification.scenario -ne 'PortalOAuth' -or $State.verification.portalRequired -ne $true -or $State.verification.portalEnabled -ne $true) { throw '启动前授权配置必须对应已启用门户的身份隔离场景' }
    $EvidenceDirectory = [IO.Path]::GetFullPath($State.verification.output)
    if ((Split-Path -Parent $EvidenceDirectory) -ne [IO.Path]::GetFullPath((Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime')) -or (Split-Path -Leaf $EvidenceDirectory) -notmatch '^h3-core-independent-20261011-r[1-9][0-9]*$' -or (Test-Path -LiteralPath (Join-Path $EvidenceDirectory 'runtime-inputs.json'))) { throw '授权配置不得更改已冻结的运行输入' }
    if ((Get-Item -LiteralPath $EvidenceDirectory).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw '授权验证目录不得重定向' }
    if (-not (Get-Acl -LiteralPath $Run).AreAccessRulesProtected -or @($State.processes | Where-Object { $_.name -in @($State.services.name) }).Count) { throw '独立环境必须限制访问且尚未启动业务服务' }
    $ServiceProcesses = @(Get-CimInstance Win32_Process -Filter "Name='java.exe'" | Where-Object { $_.CommandLine -and $_.CommandLine.IndexOf($Run, [StringComparison]::OrdinalIgnoreCase) -ge 0 -and $_.CommandLine.Contains('service.args') })
    if ($ServiceProcesses.Count) { throw '业务服务已经使用当前配置，拒绝启动前修改' }
} elseif ($State.status -ne 'RUNNING') { throw 'Running isolated environment required' }
$Owned = @($State.processes | Where-Object name -EQ 'mysql')
if ($Owned.Count -ne 1 -or $Owned[0].marker -ne $Data) { throw 'Unique owned MySQL marker required' }
$Process = Get-CimInstance Win32_Process -Filter "ProcessId = $($Owned[0].id)"
if (-not $Process -or $Process.Name -ne 'mysqld.exe' -or -not $Process.CommandLine.Contains($Data)) { throw 'Owned MySQL process mismatch' }
$Listeners = @(Get-NetTCPConnection -State Listen -LocalPort $State.mysqlPort)
if ($Listeners.Count -ne 1 -or $Listeners[0].LocalAddress -ne '127.0.0.1') { throw 'Loopback-only database required' }
$Listener = Get-CimInstance Win32_Process -Filter "ProcessId = $($Listeners[0].OwningProcess)"
if (-not $Listener -or $Listener.Name -ne 'mysqld.exe' -or -not $Listener.CommandLine.Contains($Data) -or ($Listener.ProcessId -ne $Owned[0].id -and $Listener.ParentProcessId -ne $Owned[0].id)) { throw 'Database listener ownership mismatch' }
$Mysql = (Get-Command mysql.exe).Source
function Invoke-OwnedSql([string]$Sql) {
    $Info = [Diagnostics.ProcessStartInfo]::new($Mysql)
    $Info.UseShellExecute = $false; $Info.CreateNoWindow = $true
    $Info.RedirectStandardInput = $true; $Info.RedirectStandardOutput = $true; $Info.RedirectStandardError = $true
    $Info.StandardInputEncoding = [Text.UTF8Encoding]::new($false); $Info.StandardOutputEncoding = [Text.UTF8Encoding]::new($false)
    $Info.Environment.Remove('MYSQL_PWD') | Out-Null
    foreach ($Argument in @('--no-defaults','--protocol=TCP','--host=127.0.0.1',"--port=$($State.mysqlPort)",'--user=root','--batch','--raw','--skip-column-names','--default-character-set=utf8mb4','cloud_flow_db')) { $Info.ArgumentList.Add($Argument) }
    $Child = [Diagnostics.Process]::Start($Info)
    $Output = $Child.StandardOutput.ReadToEndAsync(); $Errors = $Child.StandardError.ReadToEndAsync()
    $Child.StandardInput.WriteLine($Sql); $Child.StandardInput.Close()
    if (-not $Child.WaitForExit(30000)) { $Child.Kill(); throw 'Owned SQL client timed out' }
    if ($Child.ExitCode -ne 0) { throw $Errors.GetAwaiter().GetResult() }
    return $Output.GetAwaiter().GetResult().Trim()
}
if ([IO.Path]::GetFullPath((Invoke-OwnedSql 'SELECT @@datadir;')).TrimEnd('\','/') -ne $Data.TrimEnd('\','/')) { throw 'Database directory mismatch' }
$Total = Invoke-OwnedSql "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='cloud_flow_db' AND table_type='BASE TABLE';"
if ($Total -ne '374') { throw 'Expected the approved 374-table isolated schema' }
$Private = Join-Path $Run 'private'
if ((Get-Item -LiteralPath $Private).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Redirected private directory rejected' }
$Names = @('auth','gateway')
function Get-BytesHash([byte[]]$Bytes) { return [Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($Bytes)).ToLowerInvariant() }
function Get-OwnedConfiguration([string]$Name) {
    if ($Name -notin $Names) { throw 'Unexpected OAuth service name' }
    $Directory = Join-Path $Run $Name
    $File = Join-Path $Directory 'integration.properties'
    foreach ($Candidate in @($Directory,$File)) {
        if ((Get-Item -LiteralPath $Candidate).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Redirected service configuration rejected' }
    }
    return $File
}
if ($Action -eq 'Restore') {
    if (-not $FixturePath) { throw 'Explicit fixture manifest required' }
    $ManifestFile = (Resolve-Path -LiteralPath $FixturePath).Path
    $Fixture = Split-Path -Parent $ManifestFile
    if ((Split-Path -Parent $Fixture) -ne $Private -or (Split-Path -Leaf $Fixture) -notmatch '^oauth2-[a-f0-9]{32}$' -or (Split-Path -Leaf $ManifestFile) -ne 'fixture.json') { throw 'Owned OAuth manifest required' }
    foreach ($Candidate in @($Fixture,$ManifestFile)) {
        if ((Get-Item -LiteralPath $Candidate).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Redirected fixture rejected' }
    }
    $Manifest = Get-Content -LiteralPath $ManifestFile -Raw | ConvertFrom-Json
    if ($Manifest.statePath -ne $StateFile -or $Manifest.status -notin @('PREPARED','APPLIED') -or $Manifest.files.Count -ne 2 -or (Compare-Object $Names @($Manifest.files | ForEach-Object name))) { throw 'Restorable OAuth manifest required' }
    if (-not $State.oauth2Fixture -or $State.oauth2Fixture.manifest -ne $ManifestFile) { throw 'State does not own the current OAuth configuration' }
    foreach ($Record in $Manifest.files) {
        $File = Get-OwnedConfiguration $Record.name
        $Backup = Join-Path $Fixture ($Record.name + '.properties.before')
        if ((Get-Item -LiteralPath $Backup).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Redirected backup rejected' }
        if ((Get-BytesHash ([IO.File]::ReadAllBytes($File))) -notin @($Record.originalHash,$Record.appliedHash) -or (Get-BytesHash ([IO.File]::ReadAllBytes($Backup))) -ne $Record.originalHash) { throw 'Configuration changed outside this fixture; restore refused' }
    }
    foreach ($Record in $Manifest.files) {
        [IO.File]::WriteAllBytes((Get-OwnedConfiguration $Record.name), [IO.File]::ReadAllBytes((Join-Path $Fixture ($Record.name + '.properties.before'))))
    }
    $Manifest.status = 'RESTORED'
    $Manifest | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $ManifestFile -Encoding utf8
    $State.PSObject.Properties.Remove('oauth2Fixture')
    $State | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $StateFile -Encoding utf8
    Write-Output 'H5_OAUTH2_FIXTURE_RESTORED: files=2; exact_bytes=true; runtime_restart_required=true; production_modified=false'
    exit 0
}
if ($FixturePath -or $State.oauth2Fixture) { throw 'Restore previous OAuth fixture before preparing another' }
foreach ($Existing in @(Get-ChildItem -LiteralPath $Private -Directory -Filter 'oauth2-*')) {
    if ($Existing.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Redirected prior fixture rejected' }
    $PreviousManifest = Join-Path $Existing.FullName 'fixture.json'
    if ((Test-Path -LiteralPath $PreviousManifest) -and (Get-Content -LiteralPath $PreviousManifest -Raw | ConvertFrom-Json).status -ne 'RESTORED') { throw 'Prior OAuth fixture is still active' }
}
$Admin = Invoke-OwnedSql "SELECT user_id FROM sys_user WHERE user_name='g_import_admin' AND tenant_id=100000 AND deleted=0 AND status='0';"
if ($Admin -notmatch '^[1-9][0-9]*$') { throw 'Unique isolated administrator required' }
$ServiceUserId = 980000000 + [Security.Cryptography.RandomNumberGenerator]::GetInt32(1000000)
if ((Invoke-OwnedSql "SELECT COUNT(*) FROM sys_user WHERE user_id=$ServiceUserId;") -ne '0' -or (Invoke-OwnedSql "SELECT COUNT(*) FROM sys_role WHERE role_id=$ServiceUserId;") -ne '0') { throw 'Fixture identity conflict; no writes performed' }
$Listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback,0)
$Listener.Start()
$Port = $Listener.LocalEndpoint.Port
$Listener.Stop()
$PublicUrl = "http://127.0.0.1:$Port"
$Secret = [Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(48))
$Fixture = Join-Path $Private ('oauth2-' + [Guid]::NewGuid().ToString('N'))
[IO.Directory]::CreateDirectory($Fixture) | Out-Null
$Records = @()
$Applied = @{}
foreach ($Name in $Names) {
    $File = Get-OwnedConfiguration $Name
    $Original = [IO.File]::ReadAllBytes($File)
    $Content = [Text.Encoding]::UTF8.GetString($Original)
    if ($Content -notmatch '(?m)^server.address=127\.0\.0\.1\r?$' -or $Content -notmatch '(?m)^spring.cloud.nacos.discovery.enabled=false\r?$') { throw 'Loopback-only service configuration required' }
    $Extra = @('cloudflow.oauth2.enabled=true','cloudflow.oauth2.allow-loopback-http=true',"cloudflow.oauth2.public-url=$PublicUrl")
    if ($Name -eq 'auth') {
        $Extra += @("cloudflow.oauth2.secret-key=$Secret", "cloudflow.oauth2.service-user-ids[0]=$ServiceUserId",
            'cloudflow.platform.access.management-tenant-id=100000', "cloudflow.platform.access.administrator-user-ids[0]=$Admin")
    }
    $Bytes = [Text.UTF8Encoding]::new($false).GetBytes($Content + [Environment]::NewLine + ($Extra -join [Environment]::NewLine) + [Environment]::NewLine)
    [IO.File]::WriteAllBytes((Join-Path $Fixture ($Name + '.properties.before')), $Original)
    $Applied[$Name] = $Bytes
    $Records += @{ name=$Name; originalHash=(Get-BytesHash $Original); appliedHash=(Get-BytesHash $Bytes) }
}
$ManifestFile = Join-Path $Fixture 'fixture.json'
$Manifest = @{ statePath=$StateFile; status='PREPARED'; files=$Records; port=$Port; publicUrl=$PublicUrl; serviceUserId=$ServiceUserId; productionModified=$false }
$Manifest | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $ManifestFile -Encoding utf8
foreach ($Record in $Records) {
    $File = Get-OwnedConfiguration $Record.name
    if ((Get-BytesHash ([IO.File]::ReadAllBytes($File))) -ne $Record.originalHash) { throw 'Configuration changed during OAuth preparation' }
    [IO.File]::WriteAllBytes($File,$Applied[$Record.name])
}
$Manifest.status='APPLIED'
$Manifest | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $ManifestFile -Encoding utf8
$State | Add-Member -NotePropertyName oauth2Fixture -NotePropertyValue @{manifest=$ManifestFile;port=$Port;publicUrl=$PublicUrl;serviceUserId=$ServiceUserId}
$State | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $StateFile -Encoding utf8
$RestartRequired = (-not $BeforeServices).ToString().ToLowerInvariant()
Write-Output "H5_OAUTH2_FIXTURE_PREPARED: files=2; secret=independent_random; database_writes=0; runtime_restart_required=$RestartRequired; before_services=$($BeforeServices.IsPresent.ToString().ToLowerInvariant()); production_modified=false"
Write-Output "H5_OAUTH2_FIXTURE=$ManifestFile"
