param(
    [Parameter(Mandatory = $true)][string]$StatePath,
    [Parameter(Mandatory = $true)][string]$RedisServer
)

$ErrorActionPreference = 'Stop'
$Root = [IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
. (Join-Path $Root '.cloudflow-runtime/use-data-drive.ps1')
$Runtime = [IO.Path]::GetFullPath((Join-Path $Root '.cloudflow-runtime/batch-g-integration'))
$StatePath = (Resolve-Path -LiteralPath $StatePath).Path
$Run = Split-Path -Parent $StatePath
if ((Split-Path -Parent $Run) -ne $Runtime -or (Split-Path -Leaf $Run) -notmatch '^[a-f0-9]{32}$' -or (Split-Path -Leaf $StatePath) -ne 'state.json') { throw 'Owned integration state required' }
$State = Get-Content -LiteralPath $StatePath -Raw | ConvertFrom-Json
if ([IO.Path]::GetFullPath($State.run) -ne $Run -or $State.status -ne 'RUNNING') { throw 'Previously running isolated environment required' }
$Data = Join-Path $Run 'mysql-data'
$RedisConfig = Join-Path $Run ('redis-' + (Split-Path -Leaf $Run) + '.conf')
$RedisServer = (Resolve-Path -LiteralPath $RedisServer).Path
if (-not $RedisServer.StartsWith($Root + '\', [StringComparison]::OrdinalIgnoreCase)) { throw 'Workspace Redis executable required' }
foreach ($Target in @($Root, $Runtime, $Run, $StatePath, $Data, $RedisConfig)) {
    if ((Get-Item -LiteralPath $Target).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Redirected integration path rejected' }
}
$RedisLines = Get-Content -LiteralPath $RedisConfig
if ('bind 127.0.0.1' -notin $RedisLines -or "port $($State.redisPort)" -notin $RedisLines -or 'logfile "redis.log"' -notin $RedisLines -or
    @($RedisLines | Where-Object { $_ -match '^\s*(dir|pidfile|include)\s' }).Count -gt 0) { throw 'Owned loopback Redis configuration required' }
$Mysql = (Get-Command mysql.exe -ErrorAction Stop).Source
$Mysqld = Join-Path (Split-Path -Parent $Mysql) 'mysqld.exe'
$Java = Join-Path $env:JAVA_HOME 'bin/java.exe'
if (-not (Test-Path -LiteralPath $Java)) { throw 'JDK required' }
$Revision = [Guid]::NewGuid().ToString('N')

function Save-State {
    $State | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $StatePath -Encoding utf8
}

function Get-OwnedMysqlWorker([object[]]$Candidates, [object[]]$Listeners, [string]$ExpectedExecutable) {
    if ($Candidates.Count -ne 2 -or $Listeners.Count -ne 1 -or $Listeners[0].LocalAddress -ne '127.0.0.1') { throw 'Owned MySQL watchdog requires two processes and one loopback listener' }
    $Executable = [IO.Path]::GetFullPath($ExpectedExecutable)
    if (@($Candidates | Where-Object { $_.Name -ne 'mysqld.exe' -or -not $_.ExecutablePath -or [IO.Path]::GetFullPath($_.ExecutablePath) -ne $Executable }).Count -gt 0) { throw 'Owned MySQL watchdog executable mismatch' }
    $Workers = @($Candidates | Where-Object ProcessId -EQ $Listeners[0].OwningProcess)
    if ($Workers.Count -ne 1) { throw 'Owned MySQL listener process mismatch' }
    $Parents = @($Candidates | Where-Object { $_.ProcessId -eq $Workers[0].ParentProcessId -and $_.ProcessId -ne $Workers[0].ProcessId })
    if ($Parents.Count -ne 1 -or -not $Parents[0].CreationDate -or -not $Workers[0].CreationDate -or $Parents[0].CreationDate -gt $Workers[0].CreationDate) { throw 'Owned MySQL watchdog parent identity mismatch' }
    return $Workers[0]
}

function Owned-Process([string]$Name, [string]$Marker, [int[]]$Ports) {
    $Entries = @($State.processes | Where-Object name -EQ $Name)
    if ($Entries.Count -ne 1 -or $Entries[0].marker -ne $Marker) { throw "Owned $Name marker mismatch" }
    $Matching = @(Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -and $_.CommandLine.Contains($Marker) -and $_.Name -in @('java.exe', 'mysqld.exe', 'redis-server.exe') })
    $Listeners = @(Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Where-Object LocalPort -In $Ports)
    if ($Name -eq 'mysql' -and $Matching.Count -eq 2) {
        $Matching = @(Get-OwnedMysqlWorker $Matching $Listeners $Mysqld)
        Write-Host "ISOLATED_MYSQL_WATCHDOG: parent_child_verified=true; listener_process=$($Matching[0].ProcessId); processes_stopped=0"
    }
    if ($Matching.Count -gt 1) { throw "Multiple owned $Name processes" }
    if ($Matching.Count -eq 1) {
        if (@($Listeners | Where-Object { $_.OwningProcess -ne $Matching[0].ProcessId -or $_.LocalAddress -ne '127.0.0.1' }).Count -gt 0) { throw "Unrelated $Name listener present" }
        $Entries[0].id = $Matching[0].ProcessId
        Save-State
        return [Diagnostics.Process]::GetProcessById($Matching[0].ProcessId)
    }
    if ($Listeners.Count -gt 0) { throw "Reserved $Name ports are occupied; unrelated processes left untouched" }
    return $null
}

function Start-Owned([string]$Name, [string]$Executable, [string]$Directory, [string[]]$Arguments, [string]$LogPrefix) {
    foreach ($Kind in @('stdout', 'stderr')) {
        $Log = Join-Path $Directory "$LogPrefix$Kind.log"
        if (Test-Path -LiteralPath $Log) { Copy-Item -LiteralPath $Log -Destination (Join-Path $Directory "$LogPrefix$Kind-before-$Revision.log") }
    }
    $Process = Start-Process -FilePath $Executable -WindowStyle Hidden -PassThru -WorkingDirectory $Directory -ArgumentList $Arguments -RedirectStandardOutput (Join-Path $Directory "${LogPrefix}stdout.log") -RedirectStandardError (Join-Path $Directory "${LogPrefix}stderr.log")
    ($State.processes | Where-Object name -EQ $Name).id = $Process.Id
    Save-State
    Write-Output "ISOLATED_RESUME_STARTED: service=$Name; process=$($Process.Id); loopback=true; production_modified=false"
    return $Process
}

$Database = Owned-Process 'mysql' $Data @([int]$State.mysqlPort)
if (-not $Database) {
    $Started = @(Start-Owned 'mysql' $Mysqld $Run @('--no-defaults', "--datadir=`"$Data`"", '--bind-address=127.0.0.1', "--port=$($State.mysqlPort)", '--mysqlx=OFF', '--skip-log-bin', '--innodb-buffer-pool-size=128M', '--max-connections=100', "--log-error=`"$(Join-Path $Run 'mysql.log')`"") 'mysql.')
    $Started | Where-Object { $_ -is [string] } | Write-Output
    $Database = $Started | Where-Object { $_ -is [Diagnostics.Process] }
}
$Deadline = [DateTime]::UtcNow.AddSeconds(90)
do {
    if ($Database.HasExited) { throw 'Owned MySQL exited; retained logs contain diagnostics' }
    $OriginalMysqlPassword = $env:MYSQL_PWD
    try {
        Remove-Item Env:MYSQL_PWD -ErrorAction SilentlyContinue
        $ActualData = & $Mysql --no-defaults --protocol=TCP --host=127.0.0.1 "--port=$($State.mysqlPort)" --user=root --batch --skip-column-names -e 'SELECT @@datadir;' 2>$null
        if ($LASTEXITCODE -eq 0) {
            if ([IO.Path]::GetFullPath($ActualData.Trim()).TrimEnd('\', '/') -ne $Data) { throw 'Unexpected MySQL data directory' }
            break
        }
    } finally { $env:MYSQL_PWD = $OriginalMysqlPassword }
    Start-Sleep -Milliseconds 500
} while ([DateTime]::UtcNow -lt $Deadline)
if ([DateTime]::UtcNow -ge $Deadline) { throw 'Owned MySQL readiness timed out' }
Write-Output 'ISOLATED_MYSQL_RESUMED: existing_data=true; database_reimported=false; production_modified=false'

$Redis = Owned-Process 'redis' (Split-Path -Leaf $RedisConfig) @([int]$State.redisPort)
if (-not $Redis) {
    $Started = @(Start-Owned 'redis' $RedisServer $Run @((Split-Path -Leaf $RedisConfig)) 'redis.')
    $Started | Where-Object { $_ -is [string] } | Write-Output
    $Redis = $Started | Where-Object { $_ -is [Diagnostics.Process] }
}
$OriginalRedisPassword = $env:REDISCLI_AUTH
try {
    $Passwords = @($RedisLines | Where-Object { $_ -match '^requirepass ' })
    if ($Passwords.Count -ne 1) { throw 'Owned Redis password configuration required' }
    $env:REDISCLI_AUTH = $Passwords[0].Substring(12).Trim('"')
    $Deadline = [DateTime]::UtcNow.AddSeconds(30)
    do {
        if ($Redis.HasExited) { throw 'Owned Redis exited; retained logs contain diagnostics' }
        $Ping = & (Join-Path (Split-Path -Parent $RedisServer) 'redis-cli.exe') -h 127.0.0.1 -p $State.redisPort PING 2>$null
        if ($LASTEXITCODE -eq 0 -and $Ping -eq 'PONG') { break }
        Start-Sleep -Milliseconds 500
    } while ([DateTime]::UtcNow -lt $Deadline)
    if ([DateTime]::UtcNow -ge $Deadline) { throw 'Owned Redis readiness timed out' }
} finally { $env:REDISCLI_AUTH = $OriginalRedisPassword }
Write-Output 'ISOLATED_REDIS_RESUMED: ping=PONG; database_flush=false; production_modified=false'

foreach ($Name in @('auth', 'hr', 'oa', 'crm', 'workflow', 'gateway')) {
    $Services = @($State.services | Where-Object name -EQ $Name)
    if ($Services.Count -ne 1) { throw 'Six owned services required' }
    $Service = $Services[0]
    $Directory = Join-Path $Run $Name
    $Arguments = Join-Path $Directory 'service.args'
    $PropertiesFile = Join-Path $Directory 'integration.properties'
    foreach ($Target in @($Directory, $Arguments, $PropertiesFile)) {
        if ((Get-Item -LiteralPath $Target).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Redirected service path rejected' }
    }
    $Properties = Get-Content -LiteralPath $PropertiesFile
    foreach ($Required in @('server.address=127.0.0.1', 'management.server.address=127.0.0.1', 'spring.data.redis.host=127.0.0.1', "spring.data.redis.port=$($State.redisPort)", 'spring.cloud.nacos.discovery.enabled=false', 'spring.cloud.nacos.config.enabled=false', "server.port=$($Service.port)", "management.server.port=$($Service.healthPort)")) {
        if ($Required -notin $Properties) { throw 'Loopback-only service configuration required' }
    }
    $DatabaseUrls = @($Properties | Where-Object { $_ -match '^(spring.datasource(.dynamic.datasource.master)?.url|DB_URL)=' })
    if ($DatabaseUrls.Count -ne 3 -or @($DatabaseUrls | Where-Object { -not $_.Contains("jdbc:mysql://127.0.0.1:$($State.mysqlPort)/cloud_flow_db?") }).Count -gt 0) { throw 'Owned service database required' }
    $Process = Owned-Process $Name $Arguments @([int]$Service.port, [int]$Service.healthPort)
    if (-not $Process) {
        $Started = @(Start-Owned $Name $Java $Directory @(('"@' + $Arguments + '"')) '')
        $Started | Where-Object { $_ -is [string] } | Write-Output
        $Process = $Started | Where-Object { $_ -is [Diagnostics.Process] }
    }
    $Deadline = [DateTime]::UtcNow.AddSeconds(180)
    do {
        if ($Process.HasExited) { throw "Owned $Name exited; retained logs contain diagnostics" }
        try {
            $Health = Invoke-RestMethod -Uri "http://127.0.0.1:$($Service.healthPort)/actuator/health" -TimeoutSec 2
            if ($Health.status -eq 'UP') { break }
        } catch { }
        Start-Sleep -Seconds 2
    } while ([DateTime]::UtcNow -lt $Deadline)
    if ([DateTime]::UtcNow -ge $Deadline) { throw "Owned $Name readiness timed out; process retained" }
    Write-Output "ISOLATED_RESUME_READY: service=$Name; port=$($Service.port); process=$($Process.Id); health=UP; production_modified=false"
}
Write-Output 'ISOLATED_RESUME_COMPLETE: services=6; mysql=true; redis=true; database_reimported=false; production_modified=false'
