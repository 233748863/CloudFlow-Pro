param([Parameter(Mandatory = $true)][string]$StatePath)

$ErrorActionPreference = 'Stop'
$Root = [IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
. (Join-Path $Root '.cloudflow-runtime/use-data-drive.ps1')
$StateFile = (Resolve-Path -LiteralPath $StatePath).Path
$Run = Split-Path -Parent $StateFile
if ((Split-Path -Parent $Run) -ne (Join-Path $Root '.cloudflow-runtime/batch-g-integration') -or (Split-Path -Leaf $Run) -notmatch '^[a-f0-9]{32}$' -or (Split-Path -Leaf $StateFile) -ne 'state.json') { throw 'Owned isolated state required' }
$State = Get-Content -LiteralPath $StateFile -Raw | ConvertFrom-Json
if ($State.run -ne $Run -or $State.status -ne 'RUNNING' -or $State.mysqlPort -lt 1025 -or $State.mysqlPort -gt 65535) { throw 'Owned isolated database required' }
foreach ($Candidate in @($Root, $Run, $StateFile, (Join-Path $Run 'mysql-data'))) {
    if ((Get-Item -LiteralPath $Candidate).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Redirected test path rejected' }
}
$Owned = @($State.processes | Where-Object name -EQ 'mysql')
if ($Owned.Count -ne 1 -or $Owned[0].marker -ne (Join-Path $Run 'mysql-data')) { throw 'Unique owned database required' }
$Process = Get-CimInstance Win32_Process -Filter "ProcessId = $($Owned[0].id)"
if (-not $Process -or $Process.Name -ne 'mysqld.exe' -or -not $Process.CommandLine.Contains($Owned[0].marker)) { throw 'Owned database process mismatch' }
$Listeners = @(Get-NetTCPConnection -State Listen -LocalPort $State.mysqlPort)
if ($Listeners.Count -ne 1 -or $Listeners[0].LocalAddress -ne '127.0.0.1') { throw 'Loopback-only database required' }
$Listener = Get-CimInstance Win32_Process -Filter "ProcessId = $($Listeners[0].OwningProcess)"
if (-not $Listener -or $Listener.Name -ne 'mysqld.exe' -or -not $Listener.CommandLine.Contains($Owned[0].marker) -or ($Listener.ProcessId -ne $Owned[0].id -and $Listener.ParentProcessId -ne $Owned[0].id)) { throw 'Database listener ownership mismatch' }
$Module = Join-Path $Root 'cloudflow-backend/cloudflow-common/cloudflow-common-datasource'
$Classpath = (Join-Path $Module 'target/classes') + [IO.Path]::PathSeparator + (Get-Content -LiteralPath (Join-Path $Module 'target/datasource-classpath.txt') -Raw).Trim()
$Output = Join-Path $Root 'cloudflow-backend/target/datasource-readonly-database'
[IO.Directory]::CreateDirectory($Output) | Out-Null
$Source = Join-Path $Root 'scripts/datasource-checks/DataSourceReadOnlyDatabaseChecks.java'
$Verifier = Join-Path $Module 'src/main/java/com/cloudflow/common/datasource/runtime/MysqlDataSourceReadOnlyVerifier.java'
$PoolFactory = Join-Path $Module 'src/main/java/com/cloudflow/common/datasource/runtime/DataSourcePoolFactory.java'
$Managed = Join-Path $Module 'src/main/java/com/cloudflow/common/datasource/runtime/ManagedRuntimeDataSource.java'
$Inputs = @($Source, $Verifier, $PoolFactory, $Managed) | ForEach-Object { [PSCustomObject]@{ Path = $_; Hash = (Get-FileHash -LiteralPath $_).Hash } }
$Compile = Join-Path $Output 'compile.args'
[IO.File]::WriteAllLines($Compile, @('-encoding', 'UTF-8', '-cp', ('"' + $Classpath.Replace('\', '/') + '"'), '-d', ('"' + $Output.Replace('\', '/') + '"'), ('"' + $Source.Replace('\', '/') + '"'), ('"' + $Verifier.Replace('\', '/') + '"'), ('"' + $PoolFactory.Replace('\', '/') + '"'), ('"' + $Managed.Replace('\', '/') + '"')), [Text.UTF8Encoding]::new($false))
& javac "@$Compile"
if ($LASTEXITCODE -ne 0) { throw 'Read-only database checks compilation failed' }
$Database = "jdbc:mysql://127.0.0.1:$($State.mysqlPort)/cloud_flow_db?useSSL=false&allowPublicKeyRetrieval=true&serverTimezone=Asia/Shanghai&characterEncoding=UTF-8"
$RunFile = Join-Path $Output 'run.args'
[IO.File]::WriteAllLines($RunFile, @('-Dfile.encoding=UTF-8', '-Dsun.stdout.encoding=UTF-8', '-Dsun.stderr.encoding=UTF-8', '-cp', ('"' + ($Output + [IO.Path]::PathSeparator + $Classpath).Replace('\', '/') + '"'), 'com.cloudflow.common.datasource.runtime.DataSourceReadOnlyDatabaseChecks', ('"' + $Database + '"'), ('"' + (Join-Path $Run 'mysql-data').Replace('\', '/') + '"'), ('"' + $Root.Replace('\', '/') + '"')), [Text.UTF8Encoding]::new($false))
& java "@$RunFile"
if ($LASTEXITCODE -ne 0) { throw 'Read-only database checks failed' }
$Changed = @($Inputs | Where-Object { (Get-FileHash -LiteralPath $_.Path).Hash -ne $_.Hash })
if ($Changed.Count -ne 0) { throw 'Read-only check inputs changed during validation' }
Write-Output "DATASOURCE_READONLY_INPUTS: files=$($Inputs.Count); changed=0; compiled_from_current_source=true"
