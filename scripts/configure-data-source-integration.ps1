param(
    [Parameter(Mandatory = $true)][string]$StatePath,
    [ValidateSet('Prepare', 'Restore')][string]$Action = 'Prepare',
    [string]$FixturePath,
    [switch]$EnableTotp
)

$ErrorActionPreference = 'Stop'
$Root = [IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
. (Join-Path $Root '.cloudflow-runtime/use-data-drive.ps1')
$Runtime = Join-Path $Root '.cloudflow-runtime/batch-g-integration'
$StateFile = (Resolve-Path -LiteralPath $StatePath).Path
$Run = Split-Path -Parent $StateFile
if ((Split-Path -Parent $Run) -ne $Runtime -or (Split-Path -Leaf $Run) -notmatch '^[a-f0-9]{32}$' -or (Split-Path -Leaf $StateFile) -ne 'state.json') { throw 'Owned integration state required' }
$State = Get-Content -LiteralPath $StateFile -Raw | ConvertFrom-Json
if ($State.status -ne 'RUNNING' -or [IO.Path]::GetFullPath($State.run) -ne $Run) { throw 'Running isolated environment required' }
$Private = Join-Path $Run 'private'
foreach ($Candidate in @($Root, $Runtime, $Run, $StateFile, $Private)) {
    if ((Get-Item -LiteralPath $Candidate).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Redirected integration path rejected' }
}
$Names = @('auth', 'hr', 'oa', 'crm', 'workflow')
function Get-Hash([byte[]]$Bytes) { return [Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($Bytes)).ToLowerInvariant() }
function Assert-ConfigurationPath([string]$Name) {
    if ($Name -notin $Names) { throw 'Unknown fixture service' }
    $Directory = Join-Path $Run $Name
    $File = Join-Path $Directory 'integration.properties'
    foreach ($Candidate in @($Directory, $File)) {
        if ((Get-Item -LiteralPath $Candidate).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Redirected service path rejected' }
    }
    return $File
}
if ($Action -eq 'Restore') {
    if (-not $FixturePath) { throw 'Fixture path required for restore' }
    $ManifestFile = (Resolve-Path -LiteralPath $FixturePath).Path
    $Fixture = Split-Path -Parent $ManifestFile
    if ((Split-Path -Parent $Fixture) -ne $Private -or (Split-Path -Leaf $Fixture) -notmatch '^data-source-[a-f0-9]{32}$' -or (Split-Path -Leaf $ManifestFile) -ne 'fixture.json') { throw 'Owned data source fixture required' }
    foreach ($Candidate in @($Fixture, $ManifestFile)) {
        if ((Get-Item -LiteralPath $Candidate).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Redirected fixture rejected' }
    }
    $Manifest = Get-Content -LiteralPath $ManifestFile -Raw | ConvertFrom-Json
    if ($Manifest.statePath -ne $StateFile -or $Manifest.status -notin @('PREPARED', 'APPLIED') -or $Manifest.files.Count -ne 5) { throw 'Restorable fixture ownership mismatch' }
    if (Compare-Object $Names @($Manifest.files | ForEach-Object name)) { throw 'Exact service fixture set required' }
    foreach ($Record in $Manifest.files) {
        $File = Assert-ConfigurationPath $Record.name
        $Backup = Join-Path $Fixture ($Record.name + '.properties.before')
        if ((Get-Item -LiteralPath $Backup).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Redirected fixture backup rejected' }
        if ((Get-Hash ([IO.File]::ReadAllBytes($File))) -notin @($Record.originalHash, $Record.appliedHash) -or (Get-Hash ([IO.File]::ReadAllBytes($Backup))) -ne $Record.originalHash) { throw 'Configuration changed outside this fixture; restore refused' }
    }
    foreach ($Record in $Manifest.files) {
        $File = Assert-ConfigurationPath $Record.name
        [IO.File]::WriteAllBytes($File, [IO.File]::ReadAllBytes((Join-Path $Fixture ($Record.name + '.properties.before'))))
        if ((Get-Hash ([IO.File]::ReadAllBytes($File))) -ne $Record.originalHash) { throw 'Byte-for-byte restoration failed' }
    }
    $Manifest.status = 'RESTORED'
    $Manifest | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $ManifestFile -Encoding utf8
    Write-Output 'H5_DATASOURCE_FIXTURE_RESTORED: files=5; exact_bytes=true; runtime_restart_required=true; production_modified=false'
    exit 0
}
if ($FixturePath) { throw 'Prepare creates its own new fixture path' }
foreach ($Existing in @(Get-ChildItem -LiteralPath $Private -Directory -Filter 'data-source-*')) {
    if ($Existing.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Redirected prior fixture rejected' }
    $PriorManifest = Join-Path $Existing.FullName 'fixture.json'
    if ((Test-Path -LiteralPath $PriorManifest) -and (Get-Content -LiteralPath $PriorManifest -Raw | ConvertFrom-Json).status -ne 'RESTORED') { throw 'Restore the previous data source fixture first' }
}
$Owned = @($State.processes | Where-Object name -EQ 'mysql')
$Data = Join-Path $Run 'mysql-data'
if ($Owned.Count -ne 1 -or $Owned[0].marker -ne $Data) { throw 'Unique owned database required' }
$Process = Get-CimInstance Win32_Process -Filter "ProcessId = $($Owned[0].id)"
if (-not $Process -or $Process.Name -ne 'mysqld.exe' -or -not $Process.CommandLine.Contains($Data)) { throw 'Owned database process mismatch' }
if ($State.mysqlPort -lt 1024 -or $State.mysqlPort -gt 65535) { throw 'Invalid database port' }
$Listeners = @(Get-NetTCPConnection -State Listen -LocalPort $State.mysqlPort)
if ($Listeners.Count -ne 1 -or $Listeners[0].LocalAddress -ne '127.0.0.1') { throw 'Loopback-only database required' }
$Listener = Get-CimInstance Win32_Process -Filter "ProcessId = $($Listeners[0].OwningProcess)"
if (-not $Listener -or $Listener.Name -ne 'mysqld.exe' -or -not $Listener.CommandLine.Contains($Data) -or ($Listener.ProcessId -ne $Owned[0].id -and $Listener.ParentProcessId -ne $Owned[0].id)) { throw 'Database listener ownership mismatch' }
$PreviousMysqlPassword = $env:MYSQL_PWD
$ExpectedTables = @()
foreach ($Number in 1..5) {
    $Files = @(Get-ChildItem -LiteralPath (Join-Path $Root 'cloudflow-backend/DB') -Filter ('0' + $Number + '.*.sql'))
    if ($Files.Count -ne 1) { throw 'One formal SQL file per module required' }
    $Definitions = [regex]::Matches([IO.File]::ReadAllText($Files[0].FullName), '(?im)^\s*CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?`?([A-Za-z0-9_]+)`?\s*\(')
    $ExpectedTables += @($Definitions | ForEach-Object { $_.Groups[1].Value })
}
if ($ExpectedTables.Count -eq 0 -or @($ExpectedTables | Sort-Object -Unique).Count -ne $ExpectedTables.Count) { throw 'Unique formal table names required' }
try {
    Remove-Item Env:MYSQL_PWD -ErrorAction SilentlyContinue
    $DatabaseState = @(& mysql.exe --no-defaults --protocol=TCP --host=127.0.0.1 "--port=$($State.mysqlPort)" --user=root --batch --raw --skip-column-names --default-character-set=utf8mb4 cloud_flow_db --execute="SELECT @@datadir; SELECT user_id FROM sys_user WHERE user_name='g_import_admin' AND tenant_id=100000 AND deleted=0 AND status='0'; SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='cloud_flow_db' AND table_type='BASE TABLE';")
    if ($LASTEXITCODE -ne 0 -or $DatabaseState.Count -ne 3 -or [IO.Path]::GetFullPath($DatabaseState[0]).TrimEnd('\', '/') -ne $Data.TrimEnd('\', '/') -or $DatabaseState[1] -notmatch '^[1-9][0-9]*$' -or $DatabaseState[2] -ne [string]$ExpectedTables.Count) { throw 'Owned database or test administrator mismatch' }
    $ActualTables = @(& mysql.exe --no-defaults --protocol=TCP --host=127.0.0.1 "--port=$($State.mysqlPort)" --user=root --batch --raw --skip-column-names cloud_flow_db --execute="SELECT TABLE_NAME FROM information_schema.tables WHERE TABLE_SCHEMA='cloud_flow_db' AND TABLE_TYPE='BASE TABLE' ORDER BY TABLE_NAME;")
    if ($LASTEXITCODE -ne 0 -or @(Compare-Object ($ExpectedTables | Sort-Object) $ActualTables).Count -ne 0) { throw 'Exact formal database table set required' }
    if ($EnableTotp) {
        $TotpCount = & mysql.exe --no-defaults --protocol=TCP --host=127.0.0.1 "--port=$($State.mysqlPort)" --user=root --batch --raw --skip-column-names cloud_flow_db --execute='SELECT COUNT(*) FROM sys_user_totp;'
        if ($LASTEXITCODE -ne 0 -or $TotpCount -ne '0') { throw 'A new TOTP fixture key cannot replace any existing account registration' }
    }
} finally { $env:MYSQL_PWD = $PreviousMysqlPassword }
$Secret = [Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(48))
$Control = [Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(48))
$TotpSecret = if ($EnableTotp) { [Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(48)) } else { $null }
$Common = @(
    'cloudflow.datasource.runtime.enabled=true',
    'cloudflow.datasource.runtime.management-tenant-id=100000',
    "cloudflow.datasource.runtime.secret-key=$Secret",
    "cloudflow.datasource.runtime.control-key=$Control",
    'cloudflow.datasource.runtime.instance-host=127.0.0.1',
    'cloudflow.datasource.runtime.allowed-auth-addresses[0]=127.0.0.1',
    'cloudflow.datasource.runtime.targets[0].host=127.0.0.1',
    "cloudflow.datasource.runtime.targets[0].port=$($State.mysqlPort)",
    'cloudflow.datasource.runtime.targets[0].database=cloud_flow_db',
    'cloudflow.datasource.runtime.targets[0].addresses[0]=127.0.0.1',
    'cloudflow.datasource.runtime.targets[0].usernames[0]=h5_source_ro',
    'cloudflow.datasource.runtime.targets[0].usernames[1]=h5_source_rw'
)
for ($Index = 0; $Index -lt $Names.Count; $Index++) {
    $Application = if ($Names[$Index] -eq 'auth') { 'cloudflow-auth' } else { 'cloudflow-service-' + $Names[$Index] }
    $Common += "cloudflow.datasource.runtime.allowed-services[$Index]=$Application"
}
$Fixture = Join-Path $Private ('data-source-' + [Guid]::NewGuid().ToString('N'))
[IO.Directory]::CreateDirectory($Fixture) | Out-Null
$Records = @()
$Applied = @{}
foreach ($Name in $Names) {
    $File = Assert-ConfigurationPath $Name
    $Original = [IO.File]::ReadAllBytes($File)
    $Text = [Text.Encoding]::UTF8.GetString($Original)
    if ($Text -notmatch '(?m)^server.address=127\.0\.0\.1\r?$' -or $Text -notmatch '(?m)^spring.cloud.nacos.discovery.enabled=false\r?$') { throw 'Loopback-only service configuration required' }
    $Extra = @($Common)
    if ($Name -eq 'auth') { $Extra += @('cloudflow.platform.access.management-tenant-id=100000', "cloudflow.platform.access.administrator-user-ids[0]=$($DatabaseState[1])") }
    if ($Name -eq 'auth' -and $EnableTotp) { $Extra += @('cloudflow.auth.totp.enabled=true', "cloudflow.auth.totp.encryption-key=$TotpSecret") }
    $Bytes = [Text.UTF8Encoding]::new($false).GetBytes($Text + "`n" + ($Extra -join "`n") + "`n")
    [IO.File]::WriteAllBytes((Join-Path $Fixture ($Name + '.properties.before')), $Original)
    $Applied[$Name] = $Bytes
    $Records += @{ name = $Name; originalHash = (Get-Hash $Original); appliedHash = (Get-Hash $Bytes) }
}
$ManifestFile = Join-Path $Fixture 'fixture.json'
$Manifest = @{ statePath = $StateFile; status = 'PREPARED'; files = $Records; productionModified = $false }
$Manifest | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $ManifestFile -Encoding utf8
foreach ($Record in $Records) {
    $File = Assert-ConfigurationPath $Record.name
    if ((Get-Hash ([IO.File]::ReadAllBytes($File))) -ne $Record.originalHash) { throw 'Configuration changed during fixture preparation' }
    [IO.File]::WriteAllBytes($File, $Applied[$Record.name])
}
$Manifest.status = 'APPLIED'
$Manifest | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $ManifestFile -Encoding utf8
Write-Output 'H5_DATASOURCE_FIXTURE_PREPARED: files=5; secrets=independent_random; account_permission_queries=0; database_writes=0; runtime_restart_required=true; production_modified=false'
Write-Output "H5_DATASOURCE_FIXTURE=$ManifestFile"
