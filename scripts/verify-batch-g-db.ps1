param([switch]$SkipBuild, [switch]$KeepArtifacts)

$ErrorActionPreference = 'Stop'
$Root = [IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
$Backend = Join-Path $Root 'cloudflow-backend'
$Target = Join-Path $Backend 'target'
$Scratch = Join-Path $Target ('batch-g-mysql-' + [Guid]::NewGuid().ToString('N'))
$Data = Join-Path $Scratch 'data'
$Mysql = (Get-Command mysql.exe -ErrorAction Stop).Source
$Mysqld = Join-Path (Split-Path -Parent $Mysql) 'mysqld.exe'
if (-not (Test-Path -LiteralPath $Mysqld)) { throw 'MySQL server binary not found' }
if (Test-Path -LiteralPath $Target) {
    if ((Get-Item -LiteralPath $Target).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Refusing a redirected test directory' }
}
[IO.Directory]::CreateDirectory($Scratch) | Out-Null

function Start-HiddenNative([string]$Executable, [string[]]$Arguments) {
    $Info = [Diagnostics.ProcessStartInfo]::new($Executable)
    $Info.UseShellExecute = $false
    $Info.CreateNoWindow = $true
    $Info.RedirectStandardInput = $true
    $Info.RedirectStandardOutput = $true
    $Info.RedirectStandardError = $true
    $Info.StandardInputEncoding = [Text.UTF8Encoding]::new($false)
    $Info.StandardOutputEncoding = [Text.UTF8Encoding]::new($false)
    $Info.StandardErrorEncoding = [Text.UTF8Encoding]::new($false)
    $Info.Environment.Remove('MYSQL_PWD') | Out-Null
    foreach ($Argument in $Arguments) { $Info.ArgumentList.Add($Argument) }
    $Child = [Diagnostics.Process]::Start($Info)
    return @{ Process = $Child; Output = $Child.StandardOutput.ReadToEndAsync(); Error = $Child.StandardError.ReadToEndAsync() }
}

function Invoke-Mysql([string]$Sql) {
    $Child = Start-HiddenNative $Mysql @('--no-defaults','--protocol=TCP','--host=127.0.0.1',"--port=$Port",'--user=root','--batch','--skip-column-names','--default-character-set=utf8mb4')
    $InputFailure = $null
    try { $Child.Process.StandardInput.WriteLine($Sql) } catch { $InputFailure = $_ }
    try { $Child.Process.StandardInput.Close() } catch { }
    if (-not $Child.Process.WaitForExit(300000)) { $Child.Process.Kill(); throw 'Isolated MySQL client timed out' }
    $Output = $Child.Output.GetAwaiter().GetResult()
    $ErrorText = $Child.Error.GetAwaiter().GetResult()
    if ($Child.Process.ExitCode -ne 0) { throw $ErrorText }
    if ($InputFailure) { throw $InputFailure }
    return $Output.Trim()
}

$Server = $null
$ServerPid = $null
$Succeeded = $false
try {
    if (-not $SkipBuild) {
        & (Join-Path $PSScriptRoot 'verify-batch-g.ps1')
        if ($LASTEXITCODE -ne 0) { throw 'Batch G checks build failed' }
    }
    $Init = Start-HiddenNative $Mysqld @('--no-defaults','--initialize-insecure',"--datadir=$Data",'--innodb-buffer-pool-size=64M',"--log-error=$(Join-Path $Scratch 'initialize.log')")
    $Init.Process.StandardInput.Close()
    if (-not $Init.Process.WaitForExit(120000)) { $Init.Process.Kill(); throw 'Isolated MySQL initialization timed out' }
    if ($Init.Process.ExitCode -ne 0) { throw ('Isolated MySQL initialization failed: ' + $Init.Error.GetAwaiter().GetResult()) }
    $Listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, 0)
    $Listener.Start()
    $Port = $Listener.LocalEndpoint.Port
    $Listener.Stop()
    $Server = Start-HiddenNative $Mysqld @('--no-defaults',"--datadir=$Data",'--bind-address=127.0.0.1',"--port=$Port",'--mysqlx=OFF','--skip-log-bin','--innodb-buffer-pool-size=64M','--innodb-redo-log-capacity=64M','--max-connections=20',"--log-error=$(Join-Path $Scratch 'server.log')")
    $ServerPid = $Server.Process.Id
    $Server.Process.StandardInput.Close()
    $Deadline = [DateTime]::UtcNow.AddSeconds(60)
    $Ready = $false
    while ([DateTime]::UtcNow -lt $Deadline -and -not $Server.Process.HasExited) {
        try { if ((Invoke-Mysql 'SELECT 1;') -eq '1') { $Ready = $true; break } } catch { Start-Sleep -Milliseconds 500 }
    }
    if (-not $Ready) { throw 'Isolated MySQL server did not become ready' }
    $Scripts = @(Get-ChildItem -LiteralPath (Join-Path $Backend 'DB') -File | Where-Object { $_.Name -match '^0[1-6]\.' } | Sort-Object Name)
    foreach ($Script in $Scripts) {
        $Sql = [IO.File]::ReadAllText($Script.FullName)
        if (-not $Script.Name.StartsWith('01.')) { $Sql = "USE cloud_flow_db;`n" + $Sql }
        Invoke-Mysql $Sql | Out-Null
        Write-Output ('Initialized ' + $Script.Name)
    }
    $Count = Invoke-Mysql "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='cloud_flow_db' AND table_type='BASE TABLE';"
    if ($Count -ne '374') { throw "Expected 374 tables, found $Count" }
    $EmployeeManagementGrants = Invoke-Mysql 'SELECT COUNT(*) FROM cloud_flow_db.sys_role_menu WHERE role_id=5 AND menu_id BETWEEN 1750 AND 1799 AND menu_id NOT IN (1762,1788,1789,1790);'
    if ($EmployeeManagementGrants -ne '0') { throw 'Unexpected G management grants on EMPLOYEE role' }
    $EmployeeReadOnlyAndSelfServiceGrants = Invoke-Mysql 'SELECT COUNT(*) FROM cloud_flow_db.sys_role_menu WHERE role_id=5 AND menu_id IN (1762,1788,1789,1790);'
    if ($EmployeeReadOnlyAndSelfServiceGrants -ne '4') { throw 'Expected read-only lookup and own-account self-service grants on EMPLOYEE role' }
    $ExpectedMenus = Invoke-Mysql 'SELECT COUNT(*) FROM cloud_flow_db.sys_menu WHERE menu_id BETWEEN 1750 AND 1761;'
    if ($ExpectedMenus -ne '12') { throw 'G menu seed does not match implementation' }
    $Checks = Join-Path $Backend 'cloudflow-auth/target/batch-g-checks'
    $Run = @(Get-Content -LiteralPath (Join-Path $Checks 'run.args'))
    $Run[$Run.Count - 1] = 'com.cloudflow.auth.storage.ObservabilityDatabaseChecks'
    $Run += "jdbc:mysql://127.0.0.1:$Port/cloud_flow_db?useSSL=false&allowPublicKeyRetrieval=true&serverTimezone=Asia/Shanghai"
    $RunFile = Join-Path $Scratch 'database.args'
    [IO.File]::WriteAllLines($RunFile, $Run, [Text.UTF8Encoding]::new($false))
    & java "@$RunFile"
    if ($LASTEXITCODE -ne 0) { throw 'Database checks failed' }
    $Run[$Run.Count - 2] = 'com.cloudflow.common.excel.importing.ImportDatabaseChecks'
    $Run += '"' + (Join-Path $Root '.cloudflow-runtime/batch-g-import-tests').Replace('\', '/') + '"'
    [IO.File]::WriteAllLines($RunFile, $Run, [Text.UTF8Encoding]::new($false))
    & java "@$RunFile"
    if ($LASTEXITCODE -ne 0) { throw 'Import database checks failed' }
    Write-Output 'Batch G: 374 tables initialized; EMPLOYEE has no G management permissions.'
    $Succeeded = $true
} finally {
    if ($ServerPid) {
        try { Invoke-Mysql 'SHUTDOWN;' | Out-Null } catch { }
        Wait-Process -Id $ServerPid -Timeout 10 -ErrorAction SilentlyContinue
        $Owned = Get-CimInstance Win32_Process -Filter "ProcessId = $ServerPid"
        if ($Owned -and $Owned.CommandLine.Contains($Data)) {
            Stop-Process -Id $ServerPid -Force
            Wait-Process -Id $ServerPid -Timeout 30 -ErrorAction SilentlyContinue
        } elseif ($Owned) { throw 'Test helper identity changed; refusing to stop another process' }
    }
    if ($Succeeded -and -not $KeepArtifacts -and (Test-Path -LiteralPath $Scratch)) {
        $Resolved = (Resolve-Path -LiteralPath $Scratch).Path
        $ExpectedParent = [IO.Path]::GetFullPath($Target).TrimEnd('\') + '\'
        if (-not $Resolved.StartsWith($ExpectedParent, [StringComparison]::OrdinalIgnoreCase) -or (Split-Path -Leaf $Resolved) -notmatch '^batch-g-mysql-[a-f0-9]{32}$') { throw 'Unsafe cleanup target' }
        Remove-Item -LiteralPath $Resolved -Recurse -Force
    } elseif (-not $Succeeded) {
        Write-Warning "Isolated database diagnostics retained at $Scratch"
    }
}
