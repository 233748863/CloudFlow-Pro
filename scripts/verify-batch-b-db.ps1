[CmdletBinding()]
param([string]$MySqlBin = '')

$ErrorActionPreference = 'Stop'
$OutputEncoding = [Text.UTF8Encoding]::new($false)
if (-not $MySqlBin) { $MySqlBin = Split-Path -Parent (Get-Command mysqld.exe -ErrorAction Stop).Source }
$MySqlBin = (Resolve-Path -LiteralPath $MySqlBin).ProviderPath
$Server = Join-Path $MySqlBin 'mysqld.exe'
$Client = Join-Path $MySqlBin 'mysql.exe'
$Admin = Join-Path $MySqlBin 'mysqladmin.exe'
foreach ($Executable in @($Server, $Client, $Admin)) {
    if (-not (Test-Path -LiteralPath $Executable -PathType Leaf)) { throw "Missing MySQL executable: $Executable" }
}
$Root = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).ProviderPath
$Target = [IO.Path]::GetFullPath((Join-Path $Root 'cloudflow-backend/target'))
$RunDirectory = [IO.Path]::GetFullPath((Join-Path $Target ('batch-b-mysql-' + [guid]::NewGuid().ToString('N'))))
if (-not $RunDirectory.StartsWith($Target + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
    throw 'Isolated MySQL directory must be inside backend target'
}
if (Test-Path -LiteralPath $RunDirectory) { throw 'Isolated MySQL directory must be new' }
[IO.Directory]::CreateDirectory($RunDirectory) | Out-Null
$DataDirectory = Join-Path $RunDirectory 'data'
$ErrorLog = Join-Path $RunDirectory 'mysql-error.log'
$BaseDirectory = Split-Path -Parent $MySqlBin
$Initialize = Start-Process -FilePath $Server -WindowStyle Hidden -PassThru -Wait -ArgumentList @(
    '--no-defaults', '--initialize-insecure', "--basedir=`"$BaseDirectory`"", "--datadir=`"$DataDirectory`"",
    "--log-error=`"$ErrorLog`"", '--innodb-buffer-pool-size=64M'
)
if ($Initialize.ExitCode -ne 0) { throw "Isolated MySQL initialization failed; see $ErrorLog" }

$Reservation = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, 0)
$Reservation.Start()
$Port = ([Net.IPEndPoint]$Reservation.LocalEndpoint).Port
$Reservation.Stop()
$ClientArguments = @('--no-defaults', '--protocol=TCP', '--host=127.0.0.1', "--port=$Port", '--user=root', '--skip-password',
    '--default-character-set=utf8mb4', '--connect-timeout=2', '--batch', '--skip-column-names')
$DatabaseProcess = $null
try {
    $DatabaseProcess = Start-Process -FilePath $Server -WindowStyle Hidden -PassThru -ArgumentList @(
        '--no-defaults', "--basedir=`"$BaseDirectory`"", "--datadir=`"$DataDirectory`"", "--port=$Port",
        '--bind-address=127.0.0.1', '--mysqlx=OFF', '--skip-log-bin',
        '--innodb-buffer-pool-size=64M', '--max-connections=10', "--log-error=`"$ErrorLog`"",
        "--pid-file=`"$(Join-Path $RunDirectory 'mysql.pid')`""
    )
    $Ready = $false
    for ($Attempt = 0; $Attempt -lt 60; $Attempt++) {
        $DatabaseProcess.Refresh()
        if ($DatabaseProcess.HasExited) { throw "Isolated MySQL exited; see $ErrorLog" }
        $LastProbe = & $Client @ClientArguments '--execute=SELECT 1' 2>&1
        if ($LASTEXITCODE -eq 0) { $Ready = $true; break }
        Start-Sleep -Milliseconds 500
    }
    if (-not $Ready) { throw "Isolated MySQL did not become ready: $($LastProbe -join ' '); see $ErrorLog" }
    Write-Output "Isolated MySQL: 127.0.0.1:$Port; artifacts: $RunDirectory"
    Push-Location (Join-Path $Root 'cloudflow-backend/DB')
    try {
        $Scripts = @('01.cloudflow-common.sql', '02.cloudflow-workflow.sql', '03.cloudflow-hr.sql',
            '04.cloudflow-oa.sql', '05.cloudflow-crm.sql', '06.cloudflow-business-seed.sql')
        foreach ($SqlFile in $Scripts) {
            $ScriptClientArguments = @($ClientArguments)
            if ($SqlFile -ne '01.cloudflow-common.sql') { $ScriptClientArguments += '--database=cloud_flow_db' }
            Get-Content -LiteralPath $SqlFile -Raw -Encoding UTF8 | & $Client @ScriptClientArguments
            if ($LASTEXITCODE -ne 0) { throw "Isolated database script failed: $SqlFile" }
            Write-Output "PASS: $SqlFile"
        }
    } finally { Pop-Location }
    $TableCount = & $Client @ClientArguments "--execute=SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='cloud_flow_db' AND table_type='BASE TABLE'"
    if ($LASTEXITCODE -ne 0 -or [int]$TableCount -ne 374) { throw "Expected 374 physical tables, found $TableCount" }
    Write-Output 'PASS: isolated database has 374 physical tables'
    $MenuConflicts = @(& $Client @ClientArguments "--execute=SELECT menu_id,menu_name,perms FROM cloud_flow_db.sys_menu WHERE menu_id BETWEEN 1350 AND 1399")
    if ($LASTEXITCODE -ne 0 -or $MenuConflicts.Count -ne 0) { throw "Batch B menu range conflict: $($MenuConflicts -join '; ')" }
    Write-Output 'PASS: menu_id 1350-1399 conflict query returns zero rows; batch B adds no permissions'
    $EmployeeWrites = @(& $Client @ClientArguments "--execute=SELECT DISTINCT m.menu_id,m.perms FROM cloud_flow_db.sys_role_menu rm JOIN cloud_flow_db.sys_menu m ON m.menu_id=rm.menu_id WHERE rm.role_id=5 AND m.perms IN ('workflow:definition:edit','workflow:process:resume')")
    if ($LASTEXITCODE -ne 0 -or $EmployeeWrites.Count -ne 0) { throw "EMPLOYEE has unexpected batch B administrative writes: $($EmployeeWrites -join '; ')" }
    Write-Output 'PASS: EMPLOYEE has neither definition-edit nor administrative timer-resume permission'
    & $Client @ClientArguments "--execute=SELECT DISTINCT m.menu_id,m.perms FROM cloud_flow_db.sys_role_menu rm JOIN cloud_flow_db.sys_menu m ON m.menu_id=rm.menu_id WHERE rm.role_id=5 ORDER BY m.menu_id"
    if ($LASTEXITCODE -ne 0) { throw 'EMPLOYEE permission inventory failed' }
} finally {
    if ($DatabaseProcess) {
        $DatabaseProcess.Refresh()
        if (-not $DatabaseProcess.HasExited) {
            & $Admin '--no-defaults' '--protocol=TCP' '--host=127.0.0.1' "--port=$Port" '--user=root' '--skip-password' 'shutdown' *> $null
            if (-not $DatabaseProcess.WaitForExit(10000)) { $DatabaseProcess.Kill(); $DatabaseProcess.WaitForExit() }
        }
        $LiveHelpers = @(Get-CimInstance Win32_Process -Filter "name='mysqld.exe'" | Where-Object { $_.CommandLine -and $_.CommandLine.Contains($RunDirectory) })
        foreach ($LiveHelper in $LiveHelpers) {
            Stop-Process -Id $LiveHelper.ProcessId -Force -ErrorAction SilentlyContinue
            Wait-Process -Id $LiveHelper.ProcessId -Timeout 15 -ErrorAction SilentlyContinue
        }
        Write-Output 'Isolated MySQL stopped; existing database services were not used'
    }
    if (Test-Path -LiteralPath $DataDirectory -PathType Container) {
        $ResolvedDataDirectory = (Resolve-Path -LiteralPath $DataDirectory).ProviderPath
        if (-not $ResolvedDataDirectory.StartsWith($RunDirectory + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
            throw 'Temporary data cleanup path is outside the verified run directory'
        }
        $RemainingServers = @(Get-CimInstance Win32_Process -Filter "name='mysqld.exe'" | Where-Object { $_.CommandLine -and $_.CommandLine.Contains($RunDirectory) })
        if ($RemainingServers.Count -ne 0) { throw 'Temporary database is still running; data files retained' }
        Remove-Item -LiteralPath $ResolvedDataDirectory -Recurse
        Write-Output 'Isolated data files removed; validation logs retained'
    }
}
