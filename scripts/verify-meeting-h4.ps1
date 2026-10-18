param([switch]$SkipBuild)

$ErrorActionPreference = 'Stop'
$OutputEncoding = [Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
$Root = Split-Path -Parent $PSScriptRoot
$Backend = Join-Path $Root 'cloudflow-backend'
$Module = Join-Path $Backend 'cloudflow-service-oa'
if (-not $SkipBuild) {
    Push-Location $Backend
    try {
        & mvn -q -pl cloudflow-service-oa -am '-DskipTests' compile dependency:build-classpath '-Dmdep.outputFile=target/batch-f-classpath.txt'
        if ($LASTEXITCODE -ne 0) { throw 'Meeting module compilation failed' }
    } finally { Pop-Location }
}
$Dependencies = (Get-Content -LiteralPath (Join-Path $Module 'target/batch-f-classpath.txt') -Raw).Trim()
$ClassPath = (Join-Path $Module 'target/classes') + [IO.Path]::PathSeparator + $Dependencies
$Output = Join-Path $Module 'target/meeting-h4-checks'
[IO.Directory]::CreateDirectory($Output) | Out-Null
$Source = Join-Path $PSScriptRoot 'oa-checks/OaMeetingRulesChecks.java'
$Compile = @('-encoding', 'UTF-8', '-cp', ('"' + $ClassPath.Replace('\', '/') + '"'), '-d', ('"' + $Output.Replace('\', '/') + '"'), ('"' + $Source.Replace('\', '/') + '"'))
$CompileFile = Join-Path $Output 'compile.args'
[IO.File]::WriteAllLines($CompileFile, $Compile, [Text.UTF8Encoding]::new($false))
& javac "@$CompileFile"
if ($LASTEXITCODE -ne 0) { throw 'Meeting checks compilation failed' }
$Run = @('-Dfile.encoding=UTF-8', '-cp', ('"' + ($Output + [IO.Path]::PathSeparator + $ClassPath).Replace('\', '/') + '"'), 'com.cloudflow.oa.service.impl.OaMeetingRulesChecks')
$RunFile = Join-Path $Output 'run.args'
[IO.File]::WriteAllLines($RunFile, $Run, [Text.UTF8Encoding]::new($false))
& java "@$RunFile"
if ($LASTEXITCODE -ne 0) { throw 'Meeting checks failed' }
