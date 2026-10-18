param([Parameter(Mandatory = $true)][string]$StatePath, [switch]$SkipTimeout)

$ErrorActionPreference = 'Stop'
$Root = [IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
. (Join-Path $Root '.cloudflow-runtime/use-data-drive.ps1')
$StateFile = (Resolve-Path -LiteralPath $StatePath).Path
$Run = Split-Path -Parent $StateFile
if ((Split-Path -Parent $Run) -ne (Join-Path $Root '.cloudflow-runtime/batch-g-integration') -or (Split-Path -Leaf $Run) -notmatch '^[a-f0-9]{32}$' -or (Split-Path -Leaf $StateFile) -ne 'state.json') { throw 'Owned isolated integration state required' }
$State = Get-Content -Raw -LiteralPath $StateFile | ConvertFrom-Json
if ($State.status -ne 'RUNNING' -or [IO.Path]::GetFullPath($State.run) -ne $Run -or $State.mysqlPort -lt 1025 -or $State.mysqlPort -gt 65535) { throw 'Owned running integration database required' }
if (-not $SkipTimeout) {
    $Listeners = @(Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Where-Object LocalPort -In @($State.services.port))
    if ($Listeners.Count -gt 0) { throw 'Stop all six isolated services before the real SQL timeout check' }
}
$Backend = Join-Path $Root 'cloudflow-backend'
$Modules = @('cloudflow-auth', 'cloudflow-service-hr', 'cloudflow-service-crm', 'cloudflow-service-oa', 'cloudflow-service-workflow')
$Entries = @($Modules | ForEach-Object { Join-Path $Backend "$_/target/classes" })
foreach ($Module in $Modules) { $Entries += (Get-Content -LiteralPath (Join-Path $Backend "$Module/target/report-classpath.txt") -Raw).Trim().Split([IO.Path]::PathSeparator) }
$Classpath = (@($Entries | Select-Object -Unique) -join [IO.Path]::PathSeparator)
$Output = Join-Path $Backend 'target/report-database-checks'
[IO.Directory]::CreateDirectory($Output) | Out-Null
$Source = Join-Path $Root 'scripts/report-checks/ReportDatabaseChecks.java'
$CompileFile = Join-Path $Output 'compile.args'
[IO.File]::WriteAllLines($CompileFile, @('-encoding', 'UTF-8', '-cp', ('"' + $Classpath.Replace('\', '/') + '"'), '-d', ('"' + $Output.Replace('\', '/') + '"'), ('"' + $Source.Replace('\', '/') + '"')), [Text.UTF8Encoding]::new($false))
& javac "@$CompileFile"
if ($LASTEXITCODE -ne 0) { throw 'Report database checks compilation failed' }
$RunFile = Join-Path $Output 'run.args'
$Database = "jdbc:mysql://127.0.0.1:$($State.mysqlPort)/cloud_flow_db?useSSL=false&allowPublicKeyRetrieval=true&serverTimezone=Asia/Shanghai&characterEncoding=UTF-8"
[IO.File]::WriteAllLines($RunFile, @('-Dfile.encoding=UTF-8', '-Dsun.stdout.encoding=UTF-8', '-Dsun.stderr.encoding=UTF-8', '-cp', ('"' + ($Output + [IO.Path]::PathSeparator + $Classpath).Replace('\', '/') + '"'), 'com.cloudflow.hr.service.ReportDatabaseChecks', ('"' + $Database + '"'), ('"' + (Join-Path $Run 'mysql-data').Replace('\', '/') + '"'), $(if ($SkipTimeout) { 'skip-timeout' } else { 'verify-timeout' }), ('"' + $Root.Replace('\', '/') + '"')), [Text.UTF8Encoding]::new($false))
& java "@$RunFile"
if ($LASTEXITCODE -ne 0) { throw 'Report database checks failed' }
