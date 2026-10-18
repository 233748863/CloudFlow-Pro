param([Parameter(Mandatory = $true)][string]$StatePath, [switch]$SyncPreview, [switch]$SyncWrite, [switch]$SyncEffects, [switch]$SyncExecute, [switch]$SyncSchedule, [switch]$LoginAccounts, [switch]$BindingIdentity, [switch]$BindingFlow, [switch]$Callbacks)

$ErrorActionPreference = 'Stop'
$Root = [IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
. (Join-Path $Root '.cloudflow-runtime/use-data-drive.ps1')
$StateFile = (Resolve-Path -LiteralPath $StatePath).Path
$Run = Split-Path -Parent $StateFile
$Runtime = Join-Path $Root '.cloudflow-runtime/batch-g-integration'
if ((Split-Path -Parent $Run) -ne $Runtime -or (Split-Path -Leaf $Run) -notmatch '^[a-f0-9]{32}$' -or (Split-Path -Leaf $StateFile) -ne 'state.json') { throw 'Owned isolated state required' }
$Data = Join-Path $Run 'mysql-data'
foreach ($Candidate in @($Root, $Runtime, $Run, $StateFile, $Data)) {
    if ((Get-Item -LiteralPath $Candidate).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Redirected test path rejected' }
}
$State = Get-Content -LiteralPath $StateFile -Raw | ConvertFrom-Json
if ($State.status -ne 'RUNNING' -or [IO.Path]::GetFullPath($State.run) -ne $Run -or $State.mysqlPort -lt 1024 -or $State.mysqlPort -gt 65535) { throw 'Running isolated environment required' }
$Owned = @($State.processes | Where-Object name -EQ 'mysql')
if ($Owned.Count -ne 1 -or $Owned[0].marker -ne $Data) { throw 'Unique owned database marker required' }
$Process = Get-CimInstance Win32_Process -Filter "ProcessId = $($Owned[0].id)"
if (-not $Process -or $Process.Name -ne 'mysqld.exe' -or -not $Process.CommandLine.Contains($Data)) { throw 'Database ownership mismatch' }
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
    foreach ($Argument in @('--no-defaults','--protocol=TCP','--host=127.0.0.1',"--port=$($State.mysqlPort)",'--user=root','--batch','--raw','--skip-column-names','--default-character-set=utf8mb4')) { $Info.ArgumentList.Add($Argument) }
    $Child = [Diagnostics.Process]::Start($Info)
    $Output = $Child.StandardOutput.ReadToEndAsync(); $Errors = $Child.StandardError.ReadToEndAsync()
    $Child.StandardInput.WriteLine($Sql); $Child.StandardInput.Close()
    if (-not $Child.WaitForExit(120000)) { $Child.Kill(); throw 'Owned SQL client timed out' }
    if ($Child.ExitCode -ne 0) { throw $Errors.GetAwaiter().GetResult() }
    return $Output.GetAwaiter().GetResult().Trim()
}
function Confirm-OwnedData {
    if ([IO.Path]::GetFullPath((Invoke-OwnedSql 'SELECT @@datadir;')).TrimEnd('\','/') -ne $Data.TrimEnd('\','/')) { throw 'Database data directory mismatch' }
}
Confirm-OwnedData
$Database = 'g4_im_config_' + [Guid]::NewGuid().ToString('N')
if ($Database -notmatch '^g4_im_config_[a-f0-9]{32}$' -or (Invoke-OwnedSql "SELECT COUNT(*) FROM information_schema.schemata WHERE schema_name='$Database';") -ne '0') { throw 'Scratch schema must not exist' }
$Scripts = @(Get-ChildItem -LiteralPath (Join-Path $Root 'cloudflow-backend/DB') -File | Where-Object Name -Match '^0[1-6]\.' | Sort-Object Name)
$Inputs = @($Scripts.FullName) + @(Get-ChildItem -LiteralPath (Join-Path $Root 'scripts/im-checks') -Filter '*.java' | ForEach-Object FullName)
$Hashes = @($Inputs | ForEach-Object { [PSCustomObject]@{ Path = $_; Hash = (Get-FileHash -LiteralPath $_).Hash } })
$OriginalCount = Invoke-OwnedSql "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='cloud_flow_db' AND table_type='BASE TABLE';"
$Previous = @{}
foreach ($Name in @('IM_CHECK_REDIS_PORT', 'IM_CHECK_REDIS_PASSWORD', 'IM_CHECK_SYNC_EFFECTS')) { $Previous[$Name] = [Environment]::GetEnvironmentVariable($Name) }
try {
    $env:IM_CHECK_SYNC_EFFECTS = 'false'
    if ($SyncEffects -or $SyncExecute -or $SyncSchedule -or $LoginAccounts -or $BindingIdentity -or $BindingFlow -or $Callbacks) {
        $RedisOwner = @($State.processes | Where-Object name -EQ 'redis')
        if ($RedisOwner.Count -ne 1 -or $State.redisPort -le 1024 -or $State.redisPort -ge 65536) { throw 'Unique owned Redis required' }
        $RedisPath = [IO.Path]::GetFullPath((Join-Path $Run $RedisOwner[0].marker))
        if ((Split-Path -Parent $RedisPath) -ne $Run -or (Get-Item -LiteralPath $RedisPath).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Owned Redis configuration required' }
        $RedisProcess = Get-CimInstance Win32_Process -Filter "ProcessId = $($RedisOwner[0].id)"
        if (-not $RedisProcess -or -not $RedisProcess.CommandLine.Contains($RedisOwner[0].marker)) { throw 'Redis ownership mismatch' }
        $RedisConfiguration = [IO.File]::ReadAllText($RedisPath)
        if ($RedisConfiguration -notmatch '(?m)^bind 127\.0\.0\.1\r?$' -or $RedisConfiguration -notmatch ('(?m)^port ' + $State.redisPort + '\r?$')) { throw 'Loopback-only Redis required' }
        $RedisSecret = [regex]::Match($RedisConfiguration, '(?m)^requirepass (.+)\r?$')
        if (-not $RedisSecret.Success) { throw 'Redis secret required' }
        $env:IM_CHECK_REDIS_PORT = "$($State.redisPort)"
        $env:IM_CHECK_REDIS_PASSWORD = $RedisSecret.Groups[1].Value.TrimEnd([char]13)
        $env:IM_CHECK_SYNC_EFFECTS = 'true'
    }
    foreach ($Script in $Scripts) {
        if ($Script.Name.StartsWith('06.')) {
            $Conflicts = Invoke-OwnedSql "SELECT menu_id,menu_name,perms FROM $Database.sys_menu WHERE menu_id BETWEEN 1780 AND 1799;"
            if ($Conflicts) { throw 'G4 reserved menu range conflict before scratch seed' }
            Write-Output 'G4_IM_EMPTY_DB_PREINSERT: range=1780-1799; rows=0'
        }
        $Sql = [regex]::Replace([IO.File]::ReadAllText($Script.FullName), '\bcloud_flow_db\b', $Database)
        if (-not $Script.Name.StartsWith('01.')) { $Sql = "USE $Database;`n" + $Sql }
        Invoke-OwnedSql $Sql | Out-Null
        Write-Output "G4_IM_EMPTY_DB_SCRIPT: file=$($Script.Name); exit=0"
    }
    $Count = Invoke-OwnedSql "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='$Database' AND table_type='BASE TABLE';"
    if ($Count -ne '366') { throw "Expected 366 scratch tables, found $Count" }
    Write-Output "G4_IM_EMPTY_DATABASE: scripts=01-06; expected=366; actual=$Count; runtime_tables=$OriginalCount; runtime_unchanged=true"
    $Auth = Join-Path $Root 'cloudflow-backend/cloudflow-auth'
    $Classpath = (Join-Path $Auth 'target/classes') + [IO.Path]::PathSeparator + (Get-Content -LiteralPath (Join-Path $Auth 'target/im-classpath.txt') -Raw).Trim()
    $Output = Join-Path $Root 'cloudflow-backend/target/im-config-database'
    [IO.Directory]::CreateDirectory($Output) | Out-Null
    $Sources = @('ImConfigChecks.java','ImConfigDatabaseChecks.java','ImSyncDatabaseChecks.java','ImSyncHttpChecks.java','ImSyncWriteDatabaseChecks.java','ImSessionPolicyDatabaseChecks.java','ImSyncEffectsDatabaseChecks.java','ImSyncRunnerDatabaseChecks.java','ImSyncExecutionHttpChecks.java','ImSyncJobPlatformChecks.java','ImScheduledSyncDatabaseChecks.java','ImScheduledPlatformChecks.java') | ForEach-Object { Join-Path $Root ('scripts/im-checks/' + $_) }
    $Compile = Join-Path $Output 'compile.args'
    $Sources += Join-Path $Root 'scripts/im-checks/ImLoginAccountDatabaseChecks.java'
    $Sources += Join-Path $Root 'scripts/im-checks/ImLoginMfaChecks.java'
    $Sources += Join-Path $Root 'scripts/im-checks/ImLoginFlowDatabaseChecks.java'
    $Sources += Join-Path $Root 'scripts/im-checks/ImLoginRequestChecks.java'
    $Sources += Join-Path $Root 'scripts/im-checks/ImLoginLockDatabaseChecks.java'
    $Sources += Join-Path $Root 'scripts/im-checks/ImLoginHttpChecks.java'
    $Sources += Join-Path $Root 'scripts/im-checks/ImBindingIdentityChecks.java'
    $Sources += Join-Path $Root 'scripts/im-checks/ImBindingFlowDatabaseChecks.java'
    $Sources += Join-Path $Root 'scripts/im-checks/ImBindingHttpChecks.java'
    $Sources += Join-Path $Root 'scripts/im-checks/ImCallbackDatabaseChecks.java'
    $Sources += Join-Path $Root 'scripts/im-checks/ImCallbackHttpChecks.java'
    $Sources += Join-Path $Root 'scripts/im-checks/ImCallbackActorDatabaseChecks.java'
    $Sources += Join-Path $Root 'scripts/im-checks/ImTodoDeliveryDatabaseChecks.java'
    $Sources += Join-Path $Root 'scripts/im-checks/ImCallbackRecoveryDatabaseChecks.java'
    [IO.File]::WriteAllLines($Compile, @('-encoding','UTF-8','-cp',('"' + $Classpath.Replace('\','/') + '"'),'-d',('"' + $Output.Replace('\','/') + '"')) + @($Sources | ForEach-Object { '"' + $_.Replace('\','/') + '"' }), [Text.UTF8Encoding]::new($false))
    & javac "@$Compile"
    if ($LASTEXITCODE -ne 0) { throw 'IM configuration database checks compilation failed' }
    $Url = "jdbc:mysql://127.0.0.1:$($State.mysqlPort)/${Database}?useSSL=false&allowPublicKeyRetrieval=true&serverTimezone=Asia/Shanghai&characterEncoding=UTF-8"
    $RunArguments = Join-Path $Output 'run.args'
    [IO.File]::WriteAllLines($RunArguments, @('-Dfile.encoding=UTF-8','-Dsun.stdout.encoding=UTF-8','-Dsun.stderr.encoding=UTF-8','-cp',('"' + ($Output + [IO.Path]::PathSeparator + $Classpath).Replace('\','/') + '"'),'com.cloudflow.auth.im.ImConfigDatabaseChecks',('"' + $Url + '"'),('"' + $Data.Replace('\','/') + '"')), [Text.UTF8Encoding]::new($false))
    if ($Callbacks) { [IO.File]::AppendAllLines($RunArguments, [string[]]@('callbacks'), [Text.UTF8Encoding]::new($false)) }
    elseif ($BindingFlow) { [IO.File]::AppendAllLines($RunArguments, [string[]]@('binding-flow'), [Text.UTF8Encoding]::new($false)) }
    elseif ($BindingIdentity) { [IO.File]::AppendAllLines($RunArguments, [string[]]@('binding-identity'), [Text.UTF8Encoding]::new($false)) }
    elseif ($LoginAccounts) { [IO.File]::AppendAllLines($RunArguments, [string[]]@('login-accounts'), [Text.UTF8Encoding]::new($false)) }
    elseif ($SyncSchedule) { [IO.File]::AppendAllLines($RunArguments, [string[]]@('sync-schedule'), [Text.UTF8Encoding]::new($false)) }
    elseif ($SyncExecute) { [IO.File]::AppendAllLines($RunArguments, [string[]]@('sync-execute'), [Text.UTF8Encoding]::new($false)) }
    elseif ($SyncWrite -or $SyncEffects) { [IO.File]::AppendAllLines($RunArguments, [string[]]@('sync-write'), [Text.UTF8Encoding]::new($false)) }
    elseif ($SyncPreview) { [IO.File]::AppendAllLines($RunArguments, [string[]]@('sync-preview'), [Text.UTF8Encoding]::new($false)) }
    & java "@$RunArguments"
    if ($LASTEXITCODE -ne 0) { throw 'IM configuration database checks failed' }
    $Changed = @($Hashes | Where-Object { (Get-FileHash -LiteralPath $_.Path).Hash -ne $_.Hash })
    if ($Changed.Count -ne 0) { throw 'IM database check inputs changed during validation' }
    Write-Output "G4_IM_DATABASE_INPUTS: files=$($Hashes.Count); changed=0"
} finally {
    foreach ($Name in $Previous.Keys) { [Environment]::SetEnvironmentVariable($Name, $Previous[$Name]) }
    Confirm-OwnedData
    if ($Database -notmatch '^g4_im_config_[a-f0-9]{32}$') { throw 'Scratch cleanup target rejected' }
    Invoke-OwnedSql "DROP DATABASE IF EXISTS $Database;" | Out-Null
    $Remaining = Invoke-OwnedSql "SELECT COUNT(*) FROM information_schema.schemata WHERE schema_name='$Database';"
    $AfterCount = Invoke-OwnedSql "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='cloud_flow_db' AND table_type='BASE TABLE';"
    if ($Remaining -ne '0' -or $AfterCount -ne $OriginalCount) { throw 'Scratch cleanup or runtime table count mismatch' }
    Write-Output "G4_IM_DATABASE_CLEANUP: owned_schema_remaining=$Remaining; runtime_tables=$AfterCount; shared_redis_flush=false; production_modified=false"
}
