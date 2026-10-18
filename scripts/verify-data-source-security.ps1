param([switch]$SkipBuild)

$ErrorActionPreference = 'Stop'
$Root = [IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
. (Join-Path $Root '.cloudflow-runtime/use-data-drive.ps1')
$Backend = Join-Path $Root 'cloudflow-backend'
$Module = Join-Path $Backend 'cloudflow-common/cloudflow-common-datasource'
if (-not $SkipBuild) {
    Push-Location $Backend
    try {
        & mvn -q -pl cloudflow-common/cloudflow-common-datasource -am '-DskipTests' compile dependency:build-classpath '-Dmdep.outputFile=target/datasource-classpath.txt'
        if ($LASTEXITCODE -ne 0) { throw 'Data source security compilation failed' }
    } finally { Pop-Location }
}
$Entries = @((Join-Path $Module 'target/classes')) + (Get-Content -LiteralPath (Join-Path $Module 'target/datasource-classpath.txt') -Raw).Trim().Split([IO.Path]::PathSeparator)
$ClassPath = (@($Entries | Select-Object -Unique) -join [IO.Path]::PathSeparator)
$Output = Join-Path $Backend 'target/datasource-security-checks'
[IO.Directory]::CreateDirectory($Output) | Out-Null
$Source = Join-Path $Root 'scripts/datasource-checks/DataSourceSecurityChecks.java'
$ReadOnlySource = Join-Path $Root 'scripts/datasource-checks/DataSourceReadOnlyChecks.java'
$ReadOnlyVerifier = Join-Path $Module 'src/main/java/com/cloudflow/common/datasource/runtime/MysqlDataSourceReadOnlyVerifier.java'
$Compile = Join-Path $Output 'compile.args'
[IO.File]::WriteAllLines($Compile, @('-encoding','UTF-8','-cp',('"' + $ClassPath.Replace('\','/') + '"'),'-d',('"' + $Output.Replace('\','/') + '"'),('"' + $Source.Replace('\','/') + '"'),('"' + $ReadOnlySource.Replace('\','/') + '"'),('"' + $ReadOnlyVerifier.Replace('\','/') + '"')), [Text.UTF8Encoding]::new($false))
& javac "@$Compile"
if ($LASTEXITCODE -ne 0) { throw 'Data source security check source compilation failed' }
$Run = Join-Path $Output 'run.args'
[IO.File]::WriteAllLines($Run, @('-Dfile.encoding=UTF-8','-Dsun.stdout.encoding=UTF-8','-Dsun.stderr.encoding=UTF-8','-cp',('"' + ($Output + [IO.Path]::PathSeparator + $ClassPath).Replace('\','/') + '"'),'com.cloudflow.common.datasource.runtime.DataSourceSecurityChecks'), [Text.UTF8Encoding]::new($false))
& java "@$Run"
if ($LASTEXITCODE -ne 0) { throw 'Data source security checks failed' }
$ReadOnlyRun = Join-Path $Output 'readonly-run.args'
[IO.File]::WriteAllLines($ReadOnlyRun, @('-Dfile.encoding=UTF-8','-Dsun.stdout.encoding=UTF-8','-Dsun.stderr.encoding=UTF-8','-cp',('"' + ($Output + [IO.Path]::PathSeparator + $ClassPath).Replace('\','/') + '"'),'com.cloudflow.common.datasource.runtime.DataSourceReadOnlyChecks'), [Text.UTF8Encoding]::new($false))
& java "@$ReadOnlyRun"
if ($LASTEXITCODE -ne 0) { throw 'Data source read-only checks failed' }
