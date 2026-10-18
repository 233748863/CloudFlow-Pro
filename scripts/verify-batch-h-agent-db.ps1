param([ValidateSet('All', 'Mapping', 'Snapshot')][string]$Scenario = 'All')

$ErrorActionPreference = 'Stop'
$Root = [IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
$Backend = Join-Path $Root 'cloudflow-backend'
$Workflow = Join-Path $Backend 'cloudflow-service-workflow'
$Run = Join-Path $Root ('.cloudflow-runtime/workflow-agent-db/' + [Guid]::NewGuid().ToString('N'))
$Data = Join-Path $Run 'data'
$Mysql = (Get-Command mysql.exe -ErrorAction Stop).Source
$Mysqld = Join-Path (Split-Path -Parent $Mysql) 'mysqld.exe'
$Java = (Get-Command java -ErrorAction Stop).Source
$Javac = (Get-Command javac -ErrorAction Stop).Source
$DependencyFile = Join-Path $Workflow 'target/batch-h-classpath.txt'
if (-not (Test-Path -LiteralPath $DependencyFile)) { throw 'Prepare the workflow dependency classpath before running agent checks' }
foreach ($Directory in @((Split-Path -Parent $Run), $Run, (Join-Path $Run 'classes'), (Join-Path $Run 'generated'))) {
    [IO.Directory]::CreateDirectory($Directory) | Out-Null
    if ((Get-Item -LiteralPath $Directory).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Refusing a redirected agent test directory' }
}

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

function Invoke-OwnedMysql([string]$Sql) {
    $Child = Start-HiddenNative $Mysql @('--no-defaults', '--protocol=TCP', '--host=127.0.0.1', "--port=$Port", '--user=root', '--batch', '--skip-column-names', '--default-character-set=utf8mb4')
    $InputFailure = $null
    try { $Child.Process.StandardInput.WriteLine($Sql) } catch { $InputFailure = $_ }
    try { $Child.Process.StandardInput.Close() } catch { }
    if (-not $Child.Process.WaitForExit(300000)) { $Child.Process.Kill(); throw 'Owned MySQL client timed out' }
    $Output = $Child.Output.GetAwaiter().GetResult()
    $Errors = $Child.Error.GetAwaiter().GetResult()
    if ($Child.Process.ExitCode -ne 0) { throw $Errors }
    if ($InputFailure) { throw $InputFailure }
    return $Output.Trim()
}

function Quote-Java([string]$Value) {
    if ($Value.Contains('"') -or $Value.Contains([char]10) -or $Value.Contains([char]13)) { throw 'Unsafe Java argument' }
    return '"' + $Value.Replace('\', '/') + '"'
}

function Get-Fingerprint([string[]]$Paths) {
    $Entries = foreach ($Path in ($Paths | Sort-Object -Unique)) { $Path + ':' + (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash }
    return [Convert]::ToHexString([Security.Cryptography.SHA256]::HashData([Text.Encoding]::UTF8.GetBytes(($Entries -join [char]10)))).ToLowerInvariant()
}

$Dependencies = (Get-Content -LiteralPath $DependencyFile -Raw).Trim().Split([IO.Path]::PathSeparator)
$DependencyNames = @($Dependencies | ForEach-Object { [IO.Path]::GetFileName($_) })
$Modules = @(Get-ChildItem -LiteralPath (Join-Path $Backend 'cloudflow-common') -Directory | Where-Object {
    $Prefix = $_.Name + '-'
    @($DependencyNames | Where-Object { $_.StartsWith($Prefix, [StringComparison]::Ordinal) }).Count -gt 0
})
$Sources = @((Join-Path $PSScriptRoot 'workflow-checks/WorkflowAgentDatabaseChecks.java'),
    (Join-Path $PSScriptRoot 'workflow-checks/WorkflowDatabaseTaskFixture.java'),
    (Join-Path $PSScriptRoot 'workflow-checks/WorkflowImCompletionChecks.java'),
    (Join-Path $PSScriptRoot 'workflow-checks/WorkflowImCallbackDatabaseChecks.java'),
    (Join-Path $PSScriptRoot 'workflow-checks/WorkflowImTodoDatabaseChecks.java'))
$Resources = @()
foreach ($Module in @($Workflow) + @($Modules.FullName)) {
    $SourceRoot = Join-Path $Module 'src/main/java'
    $ResourceRoot = Join-Path $Module 'src/main/resources'
    if (Test-Path -LiteralPath $SourceRoot) { $Sources += @(Get-ChildItem -LiteralPath $SourceRoot -Filter '*.java' -File -Recurse | Select-Object -ExpandProperty FullName) }
    if (Test-Path -LiteralPath $ResourceRoot) { $Resources += $ResourceRoot }
}
$FingerprintPaths = @($Sources) + @($PSCommandPath)
foreach ($Resource in $Resources) { $FingerprintPaths += @(Get-ChildItem -LiteralPath $Resource -File -Recurse | Select-Object -ExpandProperty FullName) }
$Scripts = @(Get-ChildItem -LiteralPath (Join-Path $Backend 'DB') -File | Where-Object Name -Match '^0[1-6]\.' | Sort-Object Name)
$FingerprintPaths += @($Scripts.FullName)
$Fingerprint = Get-Fingerprint $FingerprintPaths
$Classes = Join-Path $Run 'classes'
$ClassPath = (@($Resources) + @($Dependencies)) -join [IO.Path]::PathSeparator
$CompileArguments = @('-encoding', 'UTF-8', '-parameters', '-cp', (Quote-Java $ClassPath), '-d', (Quote-Java $Classes), '-s', (Quote-Java (Join-Path $Run 'generated')))
$CompileArguments += @($Sources | ForEach-Object { Quote-Java $_ })
$CompileFile = Join-Path $Run 'compile.args'
[IO.File]::WriteAllLines($CompileFile, $CompileArguments, [Text.UTF8Encoding]::new($false))
& $Javac '-J-Dfile.encoding=UTF-8' "@$CompileFile"
if ($LASTEXITCODE -ne 0) { throw 'Agent test compilation failed; no database result is claimed' }
if ((Get-Fingerprint $FingerprintPaths) -ne $Fingerprint) { throw 'Source snapshot changed during compilation' }

$ServerPid = $null
try {
    $Init = Start-HiddenNative $Mysqld @('--no-defaults', '--initialize-insecure', "--datadir=$Data", '--innodb-buffer-pool-size=64M', "--log-error=$(Join-Path $Run 'initialize.log')")
    $Init.Process.StandardInput.Close()
    if (-not $Init.Process.WaitForExit(120000)) { $Init.Process.Kill(); throw 'Owned MySQL initialization timed out' }
    if ($Init.Process.ExitCode -ne 0) { throw ('Owned MySQL initialization failed: ' + $Init.Error.GetAwaiter().GetResult()) }
    $Listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, 0)
    $Listener.Start()
    $Port = $Listener.LocalEndpoint.Port
    $Listener.Stop()
    $Server = Start-HiddenNative $Mysqld @('--no-defaults', "--datadir=$Data", '--bind-address=127.0.0.1', "--port=$Port", '--mysqlx=OFF', '--skip-log-bin', '--innodb-buffer-pool-size=64M', '--innodb-redo-log-capacity=64M', '--max-connections=30', "--log-error=$(Join-Path $Run 'server.log')")
    $ServerPid = $Server.Process.Id
    $Server.Process.StandardInput.Close()
    $Deadline = [DateTime]::UtcNow.AddSeconds(60)
    $Ready = $false
    while ([DateTime]::UtcNow -lt $Deadline -and -not $Server.Process.HasExited) {
        try { if ((Invoke-OwnedMysql 'SELECT 1;') -eq '1') { $Ready = $true; break } } catch { Start-Sleep -Milliseconds 500 }
    }
    if (-not $Ready) { throw 'Owned MySQL did not become ready' }
    $ActualData = Invoke-OwnedMysql 'SELECT @@datadir;'
    if ([IO.Path]::GetFullPath($ActualData).TrimEnd('\', '/') -ne [IO.Path]::GetFullPath($Data).TrimEnd('\', '/')) { throw 'Database is not owned by this test run' }
    foreach ($Script in $Scripts) {
        if ($Script.Name.StartsWith('06.')) {
            $Conflicts = Invoke-OwnedMysql 'SELECT COUNT(*) FROM cloud_flow_db.sys_menu WHERE menu_id BETWEEN 1850 AND 1859;'
            Write-Output "AGENT_MENU_CONFLICTS_BEFORE_SEED=$Conflicts"
            if ($Conflicts -ne '0') { throw 'Approved H1 menu range is occupied before seed' }
        }
        $Sql = [IO.File]::ReadAllText($Script.FullName)
        if (-not $Script.Name.StartsWith('01.')) { $Sql = "USE cloud_flow_db;`n" + $Sql }
        Invoke-OwnedMysql $Sql | Out-Null
        Write-Output ('AGENT_EMPTY_DATABASE: ' + $Script.Name + ' PASS')
    }
    $Count = Invoke-OwnedMysql "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='cloud_flow_db' AND table_type='BASE TABLE';"
    if ($Count -ne '374') { throw "Expected 374 current tables including approved message delivery, found $Count" }
    Write-Output "AGENT_DATABASE_TABLES=$Count; EXPECTED=374; GATEWAY_TABLE_INCLUDED=true"
    $Logback = Join-Path $Run 'logback.xml'
    [IO.File]::WriteAllText($Logback, '<configuration><root level="OFF"/></configuration>', [Text.UTF8Encoding]::new($false))
    $Url = "jdbc:mysql://127.0.0.1:$Port/cloud_flow_db?useSSL=false&allowPublicKeyRetrieval=true&serverTimezone=Asia/Shanghai"
    $RunArguments = @('-Dfile.encoding=UTF-8', '-Duser.timezone=Asia/Shanghai', ('-Dlogback.configurationFile=' + (Quote-Java $Logback)), '-cp', (Quote-Java ($Classes + [IO.Path]::PathSeparator + $ClassPath)), 'WorkflowAgentDatabaseChecks', (Quote-Java $Url), (Quote-Java $Data), $Scenario)
    $RunFile = Join-Path $Run 'run.args'
    [IO.File]::WriteAllLines($RunFile, $RunArguments, [Text.UTF8Encoding]::new($false))
    & $Java "@$RunFile"
    if ($LASTEXITCODE -ne 0) { throw 'Agent current-source database checks failed' }
    if ((Get-Fingerprint $FingerprintPaths) -ne $Fingerprint) { throw 'Sources changed during verification; rerun against a stable snapshot' }
    Write-Output "AGENT_SOURCE_SHA256=$Fingerprint"
} finally {
    if ($ServerPid) {
        try {
            $ActualData = Invoke-OwnedMysql 'SELECT @@datadir;'
            if ([IO.Path]::GetFullPath($ActualData).TrimEnd('\', '/') -eq [IO.Path]::GetFullPath($Data).TrimEnd('\', '/')) { Invoke-OwnedMysql 'SHUTDOWN;' | Out-Null }
        } catch { }
        Wait-Process -Id $ServerPid -Timeout 10 -ErrorAction SilentlyContinue
        $Owned = Get-CimInstance Win32_Process -Filter "ProcessId = $ServerPid"
        if ($Owned -and $Owned.CommandLine.Contains($Data)) { Stop-Process -Id $ServerPid -Force }
        elseif ($Owned) { throw 'Process identity changed; refusing to stop an unrelated process' }
        Write-Output 'AGENT_DATABASE_LISTENER_STOPPED=true'
    }
    Write-Output "AGENT_DATABASE_EVIDENCE=$Run; PRODUCTION_DATABASE_MODIFIED=false"
}
