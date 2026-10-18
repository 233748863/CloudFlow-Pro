param([switch]$SkipBuild)

$ErrorActionPreference = 'Stop'
$Root = [IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
. (Join-Path $Root '.cloudflow-runtime/use-data-drive.ps1')
$Backend = Join-Path $Root 'cloudflow-backend'
$Module = Join-Path $Backend 'cloudflow-service-hr'
if (-not $SkipBuild) {
    Push-Location $Backend
    try {
        & mvn -q -pl cloudflow-service-hr -am '-DskipTests' compile dependency:build-classpath '-Dmdep.outputFile=target/batch-d-classpath.txt'
        if ($LASTEXITCODE -ne 0) { throw 'HR performance availability compilation failed' }
    } finally { Pop-Location }
}
$Dependencies = (Get-Content -LiteralPath (Join-Path $Module 'target/batch-d-classpath.txt') -Raw).Trim()
$ClassPath = (Join-Path $Module 'target/classes') + [IO.Path]::PathSeparator + $Dependencies
$Output = Join-Path $Module 'target/hr-crm-availability-checks'
[IO.Directory]::CreateDirectory($Output) | Out-Null
$Source = Join-Path $Root 'scripts/hr-checks/HrCrmPerformanceAvailabilityChecks.java'
$CompileArguments = @('-encoding', 'UTF-8', '-cp', ('"' + $ClassPath.Replace('\', '/') + '"'),
    '-d', ('"' + $Output.Replace('\', '/') + '"'), ('"' + $Source.Replace('\', '/') + '"'))
$CompileFile = Join-Path $Output 'compile.args'
[IO.File]::WriteAllLines($CompileFile, $CompileArguments, [Text.UTF8Encoding]::new($false))
& javac "@$CompileFile"
if ($LASTEXITCODE -ne 0) { throw 'HR performance availability checks compilation failed' }
$RunArguments = @('-Dfile.encoding=UTF-8', '-Dsun.stdout.encoding=UTF-8', '-Dsun.stderr.encoding=UTF-8', '-cp', ('"' + ($Output + [IO.Path]::PathSeparator + $ClassPath).Replace('\', '/') + '"'),
    'com.cloudflow.hr.client.HrCrmPerformanceAvailabilityChecks')
$RunFile = Join-Path $Output 'run.args'
[IO.File]::WriteAllLines($RunFile, $RunArguments, [Text.UTF8Encoding]::new($false))
& java "@$RunFile"
if ($LASTEXITCODE -ne 0) { throw 'HR performance availability checks failed' }
