param([switch]$SkipBuild, [switch]$KeepArtifacts)

$ErrorActionPreference = 'Stop'
$Root = [IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
$Backend = Join-Path $Root 'cloudflow-backend'
$Target = Join-Path $Backend 'target'
$Scratch = Join-Path $Target ('holiday-db-' + [Guid]::NewGuid().ToString('N'))
$Data = Join-Path $Scratch 'data'
$Evidence = Join-Path $Root ('.cloudflow-runtime/holiday-database-checks/' + (Split-Path -Leaf $Scratch))
$Mysql = (Get-Command mysql.exe -ErrorAction Stop).Source
$Mysqld = Join-Path (Split-Path -Parent $Mysql) 'mysqld.exe'
if (-not (Test-Path -LiteralPath $Mysqld)) { throw 'MySQL server binary not found' }
if (Test-Path -LiteralPath $Target) {
    if ((Get-Item -LiteralPath $Target).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Refusing a redirected test directory' }
}
$Connection = Join-Path $Root '.cloudflow-runtime/batch-e-runtime/connection.ps1'
if (Test-Path -LiteralPath $Connection) {
    . $Connection
} else {
    $EnvironmentFile = Join-Path $Root '.env.local'
    if (-not (Test-Path -LiteralPath $EnvironmentFile)) { throw 'Local Redis test configuration is unavailable' }
    $RedisNames = @('REDIS_HOST', 'REDIS_PORT', 'REDIS_PASSWORD', 'HOLIDAY_CHECK_REDIS_DATABASE')
    foreach ($Line in Get-Content -LiteralPath $EnvironmentFile) {
        $Trimmed = $Line.Trim()
        if ([string]::IsNullOrWhiteSpace($Trimmed) -or $Trimmed.StartsWith('#')) { continue }
        $Parts = $Trimmed -split '=', 2
        if ($Parts.Count -ne 2) { continue }
        $Name = $Parts[0].Trim()
        if ($Name -notin $RedisNames -or -not [string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable($Name, 'Process'))) { continue }
        $Value = $Parts[1].Trim()
        if (($Value.StartsWith('"') -and $Value.EndsWith('"')) -or ($Value.StartsWith("'") -and $Value.EndsWith("'"))) {
            $Value = $Value.Substring(1, $Value.Length - 2)
        }
        [Environment]::SetEnvironmentVariable($Name, $Value, [EnvironmentVariableTarget]::Process)
    }
}
if ([string]::IsNullOrWhiteSpace($env:REDIS_HOST) -or [string]::IsNullOrWhiteSpace($env:REDIS_PASSWORD)) {
    throw 'Local Redis test configuration is incomplete'
}
[IO.Directory]::CreateDirectory($Scratch) | Out-Null
[IO.Directory]::CreateDirectory($Evidence) | Out-Null
$CheckOutput = Join-Path $Evidence 'classes'
[IO.Directory]::CreateDirectory($CheckOutput) | Out-Null

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

function Invoke-IsolatedMysql([string]$Sql) {
    $Child = Start-HiddenNative $Mysql @('--no-defaults', '--protocol=TCP', '--host=127.0.0.1', "--port=$Port", '--user=root', '--batch', '--skip-column-names', '--default-character-set=utf8mb4')
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

$ServerPid = $null
$Succeeded = $false
try {
    if (-not $SkipBuild) {
        Push-Location $Backend
        try {
            & mvn -q -pl cloudflow-auth,cloudflow-gateway,cloudflow-service-oa,cloudflow-service-hr,cloudflow-service-crm,cloudflow-service-workflow -am '-DskipTests' compile dependency:build-classpath '-Dmdep.outputFile=target/batch-g-classpath.txt'
            if ($LASTEXITCODE -ne 0) { throw 'Holiday database check compilation failed' }
        } finally { Pop-Location }
    }
    $Dependencies = (Get-Content -LiteralPath (Join-Path $Backend 'cloudflow-auth/target/batch-g-classpath.txt') -Raw).Trim()
    $ModuleClasses = @((Join-Path $Backend 'cloudflow-auth/target/classes'))
    foreach ($Extra in @('cloudflow-gateway', 'cloudflow-service-oa', 'cloudflow-service-hr', 'cloudflow-service-crm', 'cloudflow-service-workflow')) {
        $ExtraModule = Join-Path $Backend $Extra
        $ModuleClasses += Join-Path $ExtraModule 'target/classes'
        $Dependencies += [IO.Path]::PathSeparator + (Get-Content -LiteralPath (Join-Path $ExtraModule 'target/batch-g-classpath.txt') -Raw).Trim()
    }
    $ModuleClasses += @(Get-ChildItem -LiteralPath (Join-Path $Backend 'cloudflow-common') -Directory | ForEach-Object { Join-Path $_.FullName 'target/classes' } | Where-Object { Test-Path -LiteralPath $_ })
    $ClassPath = ($ModuleClasses -join [IO.Path]::PathSeparator) + [IO.Path]::PathSeparator + $Dependencies
    $ClasspathEntries = @($ClassPath.Split([IO.Path]::PathSeparator) | Where-Object {
        [IO.Path]::GetFileName($_) -notlike 'cloudflow-common-*.jar'
    } | Select-Object -Unique)
    # Maven emits target/classes for the source-free config-secret module; omit that absent empty entry.
    $ClasspathEntries = @($ClasspathEntries | Where-Object { Test-Path -LiteralPath $_ })
    foreach ($Entry in $ClasspathEntries) {
        if (-not (Test-Path -LiteralPath $Entry)) { throw "Missing holiday database verification dependency: $Entry" }
        if ($Entry -match '[/\\]target[/\\]classes[/\\]?$' -and
            -not [IO.Path]::GetFullPath($Entry).StartsWith($Root + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
            throw 'Holiday verification dependency references another workspace'
        }
    }
    $ClassPath = $ClasspathEntries -join [IO.Path]::PathSeparator
    $Sources = @(
        (Join-Path $PSScriptRoot 'platform-checks/HolidayDatabaseChecks.java'),
        (Join-Path $PSScriptRoot 'platform-checks/HolidayRedisFixture.java')
    )
    $Compile = @('-encoding', 'UTF-8', '-cp', ('"' + $ClassPath.Replace('\', '/') + '"'), '-d', ('"' + $CheckOutput.Replace('\', '/') + '"'))
    $Compile += @($Sources | ForEach-Object { '"' + $_.Replace('\', '/') + '"' })
    $CompileFile = Join-Path $Evidence 'compile.args'
    [IO.File]::WriteAllLines($CompileFile, $Compile, [Text.UTF8Encoding]::new($false))
    & javac '-J-Dfile.encoding=UTF-8' '-J-Dstdout.encoding=UTF-8' '-J-Dstderr.encoding=UTF-8' "@$CompileFile"
    if ($LASTEXITCODE -ne 0) { throw 'Holiday database checks compilation failed' }
    $Init = Start-HiddenNative $Mysqld @('--no-defaults', '--initialize-insecure', "--datadir=$Data", '--innodb-buffer-pool-size=64M', "--log-error=$(Join-Path $Evidence 'initialize.log')")
    $Init.Process.StandardInput.Close()
    if (-not $Init.Process.WaitForExit(120000)) { $Init.Process.Kill(); throw 'Isolated MySQL initialization timed out' }
    if ($Init.Process.ExitCode -ne 0) { throw ('Isolated MySQL initialization failed: ' + $Init.Error.GetAwaiter().GetResult()) }
    $Listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, 0)
    $Listener.Start()
    $Port = $Listener.LocalEndpoint.Port
    $Listener.Stop()
    $Server = Start-HiddenNative $Mysqld @('--no-defaults', "--datadir=$Data", '--bind-address=127.0.0.1', "--port=$Port", '--mysqlx=OFF', '--skip-log-bin', '--innodb-buffer-pool-size=64M', '--innodb-redo-log-capacity=64M', '--max-connections=30', "--log-error=$(Join-Path $Evidence 'server.log')")
    $ServerPid = $Server.Process.Id
    $Server.Process.StandardInput.Close()
    $Deadline = [DateTime]::UtcNow.AddSeconds(60)
    $Ready = $false
    while ([DateTime]::UtcNow -lt $Deadline -and -not $Server.Process.HasExited) {
        try { if ((Invoke-IsolatedMysql 'SELECT 1;') -eq '1') { $Ready = $true; break } } catch { Start-Sleep -Milliseconds 500 }
    }
    if (-not $Ready) { throw 'Isolated MySQL server did not become ready' }
    $Scripts = @(Get-ChildItem -LiteralPath (Join-Path $Backend 'DB') -File | Where-Object { $_.Name -match '^0[1-6]\.' } | Sort-Object Name)
    foreach ($Script in $Scripts) {
        if ($Script.Name.StartsWith('06.')) {
            $Conflicts = Invoke-IsolatedMysql 'SELECT COUNT(*) FROM cloud_flow_db.sys_menu WHERE menu_id BETWEEN 1300 AND 1349;'
            Write-Output "HOLIDAY_MENU_CONFLICTS_BEFORE_SEED=$Conflicts"
            if ($Conflicts -ne '0') { throw 'A menu range has conflicts before seed' }
        }
        $Sql = [IO.File]::ReadAllText($Script.FullName)
        if (-not $Script.Name.StartsWith('01.')) { $Sql = "USE cloud_flow_db;`n" + $Sql }
        Invoke-IsolatedMysql $Sql | Out-Null
        Write-Output ('Initialized ' + $Script.Name)
    }
    $Count = Invoke-IsolatedMysql "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='cloud_flow_db' AND table_type='BASE TABLE';"
    if ($Count -ne '374') { throw "Expected 374 tables from the current 01-06 schema baseline, found $Count" }
    $Menus = Invoke-IsolatedMysql "SELECT GROUP_CONCAT(menu_id ORDER BY menu_id) FROM cloud_flow_db.sys_menu WHERE perms LIKE 'system:holiday:%';"
    $OutOfRange = Invoke-IsolatedMysql "SELECT COUNT(*) FROM cloud_flow_db.sys_menu WHERE perms LIKE 'system:holiday:%' AND menu_id NOT BETWEEN 1300 AND 1349;"
    $EmployeeWrite = Invoke-IsolatedMysql "SELECT COUNT(*) FROM cloud_flow_db.sys_role_menu relation JOIN cloud_flow_db.sys_menu menu ON menu.menu_id=relation.menu_id WHERE relation.role_id=5 AND menu.perms LIKE 'system:holiday:%' AND menu.perms <> 'system:holiday:query';"
    Write-Output "HOLIDAY_SCHEMA_TABLES=$Count"
    Write-Output "HOLIDAY_MENU_IDS=$Menus; OUT_OF_RANGE=$OutOfRange; EMPLOYEE_NONQUERY=$EmployeeWrite"
    if ($Menus -ne '1320,1321,1322,1323,1324,1325' -or $OutOfRange -ne '0' -or $EmployeeWrite -ne '0') { throw 'Holiday menu or employee permissions differ from approved range' }
    $MaintenanceRoles = Invoke-IsolatedMysql "SELECT GROUP_CONCAT(CONCAT(role_id, ':', grants) ORDER BY role_id) FROM (SELECT role_id, COUNT(*) grants FROM cloud_flow_db.sys_role_menu WHERE menu_id BETWEEN 1320 AND 1324 GROUP BY role_id) granted;"
    $HrParent = Invoke-IsolatedMysql 'SELECT COUNT(*) FROM cloud_flow_db.sys_role_menu WHERE role_id=4 AND menu_id=6;'
    Write-Output "HOLIDAY_MAINTENANCE_ROLES=$MaintenanceRoles; HR_PARENT_MENU=$HrParent; APPROVED_ROLES=ADMIN,HR"
    if ($MaintenanceRoles -ne '1:5,4:5' -or $HrParent -ne '1') { throw 'Holiday maintenance roles differ from the 2026-09-16 user decision' }
    $HrImport = Invoke-IsolatedMysql 'SELECT COUNT(*) FROM cloud_flow_db.sys_role_menu WHERE role_id=4 AND menu_id IN (1756,1757);'
    Write-Output "HOLIDAY_HR_IMPORT_PREREQUISITES=$HrImport; EXPECTED=2"
    if ($HrImport -ne '2') { throw 'HR cannot use the holiday import without both shared import permissions' }
    $Calendar2026 = Invoke-IsolatedMysql "WITH RECURSIVE days AS (SELECT DATE('2026-01-01') day_value UNION ALL SELECT DATE_ADD(day_value, INTERVAL 1 DAY) FROM days WHERE day_value < '2026-12-31'), dates AS (SELECT COUNT(*) records, SUM(date_type='HOLIDAY') holidays, SUM(date_type='REST') rest_days, SUM(date_type='WORKDAY') adjusted_workdays, SUM(triple_pay_flag=1) triple_pay, COUNT(DISTINCT holiday_date) unique_dates, SUM(holiday_date NOT BETWEEN '2026-01-01' AND '2026-12-31') out_of_year, SUM((date_type='HOLIDAY') <> (triple_pay_flag=1)) invalid_pay_flags FROM cloud_flow_db.sys_holiday_date WHERE tenant_id=100000 AND calendar_id=100 AND year_no=2026 AND deleted=0), resolved AS (SELECT COUNT(*) days, SUM(CASE WHEN dates.date_type='WORKDAY' THEN 1 WHEN dates.date_type IN ('HOLIDAY','REST') THEN 0 WHEN FIND_IN_SET(WEEKDAY(days.day_value)+1, calendar.weekly_rest_days)=0 THEN 1 ELSE 0 END) workdays FROM days CROSS JOIN cloud_flow_db.sys_holiday_calendar calendar LEFT JOIN cloud_flow_db.sys_holiday_date dates ON dates.tenant_id=calendar.tenant_id AND dates.calendar_id=calendar.calendar_id AND dates.holiday_date=days.day_value AND dates.deleted=0 WHERE calendar.tenant_id=100000 AND calendar.calendar_id=100 AND calendar.deleted=0) SELECT CONCAT(records,':',holidays,':',rest_days,':',adjusted_workdays,':',triple_pay,':',unique_dates,':',out_of_year,':',invalid_pay_flags,':',resolved.days,':',resolved.workdays) FROM dates CROSS JOIN resolved;"
    Write-Output "HOLIDAY_2026_DATABASE_CALENDAR=$Calendar2026; EXPECTED=28:13:9:6:13:28:0:0:365:248"
    if ($Calendar2026 -ne '28:13:9:6:13:28:0:0:365:248') { throw '2026 holiday seed differs from the approved daily calendar' }
    $Run = @('-Dfile.encoding=UTF-8', '-Dstdout.encoding=UTF-8', '-Dstderr.encoding=UTF-8', '-cp', ('"' + ($CheckOutput + [IO.Path]::PathSeparator + $ClassPath).Replace('\', '/') + '"'), 'com.cloudflow.common.holiday.service.HolidayDatabaseChecks')
    $Run += "jdbc:mysql://127.0.0.1:$Port/cloud_flow_db?useSSL=false&allowPublicKeyRetrieval=true&serverTimezone=Asia/Shanghai"
    $Run += '"' + $Evidence.Replace('\', '/') + '"'
    $RunFile = Join-Path $Evidence 'run.args'
    [IO.File]::WriteAllLines($RunFile, $Run, [Text.UTF8Encoding]::new($false))
    & java "@$RunFile"
    if ($LASTEXITCODE -ne 0) { throw 'Holiday database and Redis checks failed' }
    $Succeeded = $true
} finally {
    if ($ServerPid) {
        try { Invoke-IsolatedMysql 'SHUTDOWN;' | Out-Null } catch { }
        Wait-Process -Id $ServerPid -Timeout 10 -ErrorAction SilentlyContinue
        $Owned = Get-CimInstance Win32_Process -Filter "ProcessId = $ServerPid"
        if ($Owned -and $Owned.CommandLine.Contains($Data)) {
            Stop-Process -Id $ServerPid -Force
            Wait-Process -Id $ServerPid -Timeout 30 -ErrorAction SilentlyContinue
        } elseif ($Owned) { throw 'Test helper identity changed; refusing to stop another process' }
        Write-Output 'HOLIDAY_DATABASE_LISTENER_STOPPED=true'
    }
    if ($Succeeded -and -not $KeepArtifacts) {
        foreach ($Owned in @(@{ Path = $Scratch; Parent = $Target }, @{ Path = $Evidence; Parent = (Join-Path $Root '.cloudflow-runtime/holiday-database-checks') })) {
            if (-not (Test-Path -LiteralPath $Owned.Path)) { continue }
            $Item = Get-Item -LiteralPath $Owned.Path -Force
            $Resolved = (Resolve-Path -LiteralPath $Owned.Path).Path
            $ExpectedParent = [IO.Path]::GetFullPath($Owned.Parent).TrimEnd('\') + '\'
            if (($Item.Attributes -band [IO.FileAttributes]::ReparsePoint) -or
                -not $Resolved.StartsWith($ExpectedParent, [StringComparison]::OrdinalIgnoreCase) -or
                (Split-Path -Leaf $Resolved) -notmatch '^holiday-db-[a-f0-9]{32}$') { throw 'Unsafe cleanup target' }
            Remove-Item -LiteralPath $Resolved -Recurse -Force
        }
        Write-Output 'HOLIDAY_DATABASE_TEMPORARY_FILES_REMOVED=true'
    } elseif (-not $Succeeded) {
        Write-Warning "Isolated database diagnostics retained at $Scratch and $Evidence"
    }
    if (-not $Succeeded -or $KeepArtifacts) { Write-Output "HOLIDAY_EVIDENCE=$Evidence" }
}
