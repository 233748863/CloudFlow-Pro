param([Parameter(Mandatory = $true)][string]$StatePath, [switch]$EnablePortal, [switch]$CurrentSchema, [switch]$BeforeServices)

$ErrorActionPreference = 'Stop'
$Root = [IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
if ([IO.Path]::GetPathRoot($Root) -eq ($env:SystemDrive + '\')) { throw 'Portal preparation requires a data drive' }
. (Join-Path $Root '.cloudflow-runtime/use-data-drive.ps1')
$Runtime = [IO.Path]::GetFullPath((Join-Path $Root '.cloudflow-runtime/batch-g-integration'))
$StateFile = (Resolve-Path -LiteralPath $StatePath).Path
$Run = Split-Path -Parent $StateFile
if ((Split-Path -Parent $Run) -ne $Runtime -or (Split-Path -Leaf $Run) -notmatch '^[a-f0-9]{32}$' -or (Split-Path -Leaf $StateFile) -ne 'state.json') { throw 'Owned isolated state required' }
$Data = Join-Path $Run 'mysql-data'
$Private = Join-Path $Run 'private'
foreach ($Candidate in @($Root, $Runtime, $Run, $StateFile, $Data, $Private)) {
    if ((Get-Item -LiteralPath $Candidate).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Redirected isolated path rejected' }
}
$State = Get-Content -LiteralPath $StateFile -Raw | ConvertFrom-Json
if ([IO.Path]::GetFullPath($State.run) -ne $Run -or $State.mysqlPort -lt 1024 -or $State.mysqlPort -gt 65535) { throw 'Owned integration identity required' }
if ($BeforeServices) {
    if (-not $CurrentSchema -or $State.status -ne 'STARTING' -or $State.verification.mode -ne 'H3_CORE_INDEPENDENT' -or $State.verification.inputsFrozen -ne $false) { throw 'BeforeServices requires an unfrozen STARTING independent H3 runtime with the current schema' }
    if ($State.verification.scenario -notin @('PortalAuth','PortalDisabled','PortalKnowledge','PortalTicket','PortalContract','PortalFinance','PortalOAuth') -or $State.verification.portalRequired -ne $true -or $State.verification.portalEnabled -ne [bool]$EnablePortal) { throw 'Portal preparation must match the explicit independent scenario' }
    $EvidenceDirectory = [IO.Path]::GetFullPath($State.verification.output)
    if ((Split-Path -Parent $EvidenceDirectory) -ne [IO.Path]::GetFullPath((Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime')) -or (Split-Path -Leaf $EvidenceDirectory) -notmatch '^h3-core-independent-20261011-r[1-9][0-9]*$' -or (Test-Path -LiteralPath (Join-Path $EvidenceDirectory 'runtime-inputs.json'))) { throw 'Portal configuration cannot change frozen runtime inputs' }
    if ((Get-Item -LiteralPath $EvidenceDirectory).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Redirected independent evidence rejected' }
    if (-not (Get-Acl -LiteralPath $Run).AreAccessRulesProtected -or @($State.processes | Where-Object { $_.name -in @($State.services.name) }).Count) { throw 'Private independent runtime must have no started services' }
    $ServiceProcesses = @(Get-CimInstance Win32_Process -Filter "Name='java.exe'" | Where-Object { $_.CommandLine -and $_.CommandLine.IndexOf($Run, [StringComparison]::OrdinalIgnoreCase) -ge 0 -and $_.CommandLine.Contains('service.args') })
    if ($ServiceProcesses.Count) { throw 'Service processes already use this runtime; BeforeServices preparation refused' }
} elseif ($State.status -ne 'RUNNING') { throw 'Running owned integration required' }
$Owned = @($State.processes | Where-Object name -EQ 'mysql')
if ($Owned.Count -ne 1 -or $Owned[0].marker -ne $Data) { throw 'Unique owned MySQL marker required' }
$Process = Get-CimInstance Win32_Process -Filter "ProcessId = $($Owned[0].id)"
if (-not $Process -or $Process.Name -ne 'mysqld.exe' -or -not $Process.CommandLine.Contains($Data)) { throw 'Owned MySQL process mismatch' }
$Listeners = @(Get-NetTCPConnection -State Listen -LocalPort $State.mysqlPort)
if ($Listeners.Count -ne 1 -or $Listeners[0].LocalAddress -ne '127.0.0.1') { throw 'Owned loopback MySQL listener required' }
$ListenerProcess = Get-CimInstance Win32_Process -Filter "ProcessId = $($Listeners[0].OwningProcess)"
if (-not $ListenerProcess -or $ListenerProcess.Name -ne 'mysqld.exe' -or -not $ListenerProcess.CommandLine.Contains($Data) -or ($ListenerProcess.ProcessId -ne $Owned[0].id -and $ListenerProcess.ParentProcessId -ne $Owned[0].id)) { throw 'MySQL listener must be owned process or its verified child' }
$Mysql = (Get-Command mysql.exe).Source

function Invoke-OwnedSql([string]$Sql) {
    $Info = [Diagnostics.ProcessStartInfo]::new($Mysql)
    $Info.UseShellExecute = $false
    $Info.CreateNoWindow = $true
    $Info.RedirectStandardInput = $true
    $Info.RedirectStandardOutput = $true
    $Info.RedirectStandardError = $true
    $Info.StandardInputEncoding = [Text.UTF8Encoding]::new($false)
    $Info.StandardOutputEncoding = [Text.UTF8Encoding]::new($false)
    $Info.Environment.Remove('MYSQL_PWD') | Out-Null
    foreach ($Argument in @('--no-defaults', '--protocol=TCP', '--host=127.0.0.1', "--port=$($State.mysqlPort)", '--user=root', '--skip-password', '--batch', '--raw', '--skip-column-names', '--default-character-set=utf8mb4', 'cloud_flow_db')) { $Info.ArgumentList.Add($Argument) }
    $Child = [Diagnostics.Process]::Start($Info)
    $Output = $Child.StandardOutput.ReadToEndAsync()
    $ErrorOutput = $Child.StandardError.ReadToEndAsync()
    $Child.StandardInput.WriteLine($Sql)
    $Child.StandardInput.Close()
    if (-not $Child.WaitForExit(120000)) { $Child.Kill(); throw 'Owned SQL client timed out' }
    if ($Child.ExitCode -ne 0) { throw $ErrorOutput.GetAwaiter().GetResult() }
    return $Output.GetAwaiter().GetResult().Trim()
}

$ActualData = Invoke-OwnedSql 'SELECT @@datadir;'
if ([IO.Path]::GetFullPath($ActualData).TrimEnd('\', '/') -ne $Data.TrimEnd('\', '/')) { throw 'Database directory is not owned' }
$EmployeeSql = "SET SESSION group_concat_max_len=8388608; SELECT SHA2(GROUP_CONCAT(CONCAT_WS(':',tenant_id,role_id,menu_id) ORDER BY tenant_id,role_id,menu_id SEPARATOR ','),256) FROM sys_role_menu WHERE role_id=5;"
$EmployeeBefore = Invoke-OwnedSql $EmployeeSql
$AllRolesSql = "SET SESSION group_concat_max_len=8388608; SELECT SHA2(GROUP_CONCAT(CONCAT_WS(':',tenant_id,role_id,menu_id) ORDER BY tenant_id,role_id,menu_id SEPARATOR ','),256) FROM sys_role_menu;"
$AllRolesBefore = if ($CurrentSchema) { Invoke-OwnedSql $AllRolesSql } else { $null }
$CountSql = "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='cloud_flow_db' AND table_type='BASE TABLE';"
$Count = [int](Invoke-OwnedSql $CountSql)
$Existing = Invoke-OwnedSql "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='cloud_flow_db' AND table_name='sys_portal_user';"
if ($CurrentSchema) {
    if ($Count -ne 374 -or $Existing -ne '1') { throw 'Current approved 374-table portal schema required; no DDL is applied in this mode' }
} elseif ($Count -eq 337 -and $Existing -eq '0') {
    $Rows = Invoke-OwnedSql 'SELECT menu_id,menu_name,perms FROM sys_menu WHERE menu_id IN (1912,1913);'
    if ($Rows) { throw 'Approved portal menu identifiers are occupied; refusing changes' }
    Write-Output 'SQL=SELECT menu_id,menu_name,perms FROM sys_menu WHERE menu_id IN (1912,1913);'
    Write-Output 'H3_PORTAL_PREINSERT_CONFLICTS: ids=1912,1913; range=1900-1949; rows=0; isolated=true'
    $Formal = [IO.File]::ReadAllText((Join-Path $Root 'cloudflow-backend/DB/01.cloudflow-common.sql'))
    $Definition = [regex]::Match($Formal, '(?ms)^CREATE TABLE sys_portal_user\s*\(.*?^\) ENGINE=.*?;')
    $Seed = [IO.File]::ReadAllText((Join-Path $Root 'cloudflow-backend/DB/06.cloudflow-business-seed.sql'))
    $Block = [regex]::Match($Seed, '(?s)-- batch-h3-portal-accounts:start.*?-- batch-h3-portal-accounts:end')
    if (-not $Definition.Success -or -not $Block.Success) { throw 'Approved formal portal definition and seed required' }
    Invoke-OwnedSql $Definition.Value | Out-Null
    Invoke-OwnedSql ("START TRANSACTION;`n" + $Block.Value + "`nCOMMIT;") | Out-Null
} elseif ($Count -ne 338 -or $Existing -ne '1') { throw "Unexpected or partial portal schema: tables=$Count; portal_tables=$Existing" }
$ExpectedTables = if ($CurrentSchema) { '374' } else { '338' }
if ((Invoke-OwnedSql $CountSql) -ne $ExpectedTables) { throw 'Portal physical table count differs from approval' }
if ((Invoke-OwnedSql "SELECT COUNT(*) FROM information_schema.columns WHERE table_schema='cloud_flow_db' AND table_name='sys_portal_user';") -ne '25') { throw 'Portal columns differ from approval' }
$ExpectedH3Menus = if ($CurrentSchema) { (1900..1917) -join ',' } else { '1900,1901,1902,1903,1904,1905,1906,1909,1910,1911,1912,1913,1914,1915' }
if ((Invoke-OwnedSql 'SELECT GROUP_CONCAT(menu_id ORDER BY menu_id) FROM sys_menu WHERE menu_id BETWEEN 1900 AND 1949;') -ne $ExpectedH3Menus) { throw 'Exact H3 menu set differs from approval' }
foreach ($MenuId in @(1912, 1913)) {
    $TenantScope = if ($CurrentSchema) { ' AND tenant_id=100000' } else { '' }
    if ((Invoke-OwnedSql "SELECT GROUP_CONCAT(CONCAT(tenant_id,':',role_id) ORDER BY tenant_id,role_id) FROM sys_role_menu WHERE menu_id=$MenuId$TenantScope;") -ne '100000:1,100000:8,100000:10') { throw 'Portal role grants differ from approval' }
}
if ((Invoke-OwnedSql $EmployeeSql) -ne $EmployeeBefore) { throw 'Employee grants changed during portal preparation' }
if ($CurrentSchema -and (Invoke-OwnedSql $AllRolesSql) -ne $AllRolesBefore) { throw 'Existing multi-tenant role grants changed during runtime-only preparation' }
Write-Output "H3_PORTAL_SCHEMA_READY: tables=$ExpectedTables; columns=25; menu_ids=1912,1913; role_grants=6; employee_grants_changed=0; production_modified=false"

$Directory = Join-Path $Private 'portal'
if (-not $State.portalFixture) {
    if (Test-Path -LiteralPath $Directory) { throw 'Existing unowned portal fixture requires inspection' }
    [IO.Directory]::CreateDirectory($Directory) | Out-Null
    $Password = [Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(24))
    [IO.File]::WriteAllText((Join-Path $Directory 'store-password.txt'), $Password, [Text.UTF8Encoding]::new($false))
    $PreviousPassword = $env:CLOUDFLOW_PORTAL_FIXTURE_PASSWORD
    try {
        $env:CLOUDFLOW_PORTAL_FIXTURE_PASSWORD = $Password
        & keytool '-J-Dfile.encoding=UTF-8' -genkeypair -alias portal-test -dname 'CN=localhost' -ext 'SAN=dns:localhost,ip:127.0.0.1' -validity 2 -keyalg RSA -keysize 2048 -storetype PKCS12 -keystore (Join-Path $Directory 'tls.p12') -storepass:env CLOUDFLOW_PORTAL_FIXTURE_PASSWORD -noprompt
        if ($LASTEXITCODE -ne 0) { throw 'Isolated portal TLS identity creation failed' }
    } finally { $env:CLOUDFLOW_PORTAL_FIXTURE_PASSWORD = $PreviousPassword }
    $ReservedPorts = @($State.mysqlPort, $State.redisPort, $State.smtpFixture.port) + @($State.services | ForEach-Object { $_.port; $_.healthPort })
    do {
        $Reservation = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, 0)
        $Reservation.Start()
        try { $Port = ([Net.IPEndPoint]$Reservation.LocalEndpoint).Port } finally { $Reservation.Stop() }
    } while ($Port -in $ReservedPorts)
    $State | Add-Member -Force -NotePropertyName portalFixture -NotePropertyValue @{ port = $Port; directory = $Directory; loopback = $true; publicUrl = "https://127.0.0.1:$Port" }
    $State | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $StateFile -Encoding utf8
}
if ([IO.Path]::GetFullPath($State.portalFixture.directory) -ne $Directory -or -not $State.portalFixture.loopback -or $State.portalFixture.publicUrl -ne "https://127.0.0.1:$($State.portalFixture.port)" -or $State.portalFixture.port -le 1024 -or $State.portalFixture.port -gt 65535) { throw 'Owned loopback portal fixture required' }
foreach ($Candidate in @($Directory, (Join-Path $Directory 'tls.p12'), (Join-Path $Directory 'store-password.txt'))) {
    if ((Get-Item -LiteralPath $Candidate).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Redirected portal fixture rejected' }
}
$Enabled = if ($EnablePortal) { 'true' } else { 'false' }
foreach ($ServiceName in @('auth', 'gateway')) {
    $ServiceDirectory = Join-Path $Run $ServiceName
    $PropertiesFile = Join-Path $ServiceDirectory 'integration.properties'
    foreach ($Candidate in @($ServiceDirectory, $PropertiesFile)) {
        if ((Get-Item -LiteralPath $Candidate).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Redirected service configuration rejected' }
    }
    $Settings = [IO.File]::ReadAllLines($PropertiesFile)
    foreach ($Required in @('server.address=127.0.0.1', 'management.server.address=127.0.0.1', 'spring.cloud.nacos.config.enabled=false', 'spring.cloud.nacos.discovery.enabled=false', 'spring.data.redis.host=127.0.0.1', "spring.data.redis.port=$($State.redisPort)")) {
        if ($Required -notin $Settings) { throw 'Isolated service configuration required' }
    }
    $ProxySettings = @($Settings | Where-Object { $_ -match '^cloudflow\.ratelimit\.trusted-proxies' })
    if ($ProxySettings.Count -gt 0 -and ($ProxySettings.Count -ne 1 -or $ProxySettings[0] -ne 'cloudflow.ratelimit.trusted-proxies[0]=127.0.0.1/32')) { throw 'Existing non-fixture proxy policy requires inspection' }
    $NewSettings = @($Settings | Where-Object { $_ -notmatch '^cloudflow\.(portal\.(enabled|public-url)=|ratelimit\.trusted-proxies)' }) + @("cloudflow.portal.enabled=$Enabled", "cloudflow.portal.public-url=$($State.portalFixture.publicUrl)", 'cloudflow.ratelimit.trusted-proxies[0]=127.0.0.1/32')
    if ($ServiceName -eq 'gateway') {
        $Cors = "CLOUDFLOW_CORS_ALLOWED_ORIGINS=$($State.portalFixture.publicUrl)"
        $PreviousCors = @($Settings | Where-Object { $_ -match '^CLOUDFLOW_CORS_ALLOWED_ORIGINS=' })
        if ($PreviousCors.Count -gt 0 -and ($PreviousCors.Count -ne 1 -or $PreviousCors[0] -ne $Cors)) { throw 'Existing non-fixture CORS policy requires inspection' }
        $NewSettings = @($NewSettings | Where-Object { $_ -notmatch '^CLOUDFLOW_CORS_ALLOWED_ORIGINS=' }) + @($Cors)
    }
    if (($Settings -join "`n") -ne ($NewSettings -join "`n")) {
        Copy-Item -LiteralPath $PropertiesFile -Destination (Join-Path $ServiceDirectory ('integration-before-portal-' + [Guid]::NewGuid().ToString('N') + '.properties'))
        [IO.File]::WriteAllLines($PropertiesFile, $NewSettings, [Text.UTF8Encoding]::new($false))
    }
}
$RestartRequired = (-not $BeforeServices).ToString().ToLowerInvariant()
Write-Output "H3_PORTAL_RUNTIME_PREPARED: enabled=$Enabled; public_url=$($State.portalFixture.publicUrl); trusted_proxy=127.0.0.1/32; auth_gateway_restart_required=$RestartRequired; before_services=$($BeforeServices.IsPresent.ToString().ToLowerInvariant()); production_modified=false"
