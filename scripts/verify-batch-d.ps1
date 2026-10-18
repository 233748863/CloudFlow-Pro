param([switch]$SkipBuild, [string]$JdbcUrl = '')

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
$Backend = Join-Path $Root 'cloudflow-backend'
$Module = Join-Path $Backend 'cloudflow-service-hr'

if (-not $SkipBuild) {
    Push-Location $Backend
    try {
        & mvn -q -pl cloudflow-service-hr -am '-DskipTests' compile dependency:build-classpath '-Dmdep.outputFile=target/batch-d-classpath.txt'
        if ($LASTEXITCODE -ne 0) { throw 'HR batch D compilation failed' }
    } finally {
        Pop-Location
    }
}

$Dependencies = (Get-Content -LiteralPath (Join-Path $Module 'target/batch-d-classpath.txt') -Raw).Trim()
$CommonModules = @(Get-ChildItem -LiteralPath (Join-Path $Backend 'cloudflow-common') -Directory | Where-Object { Test-Path -LiteralPath (Join-Path $_.FullName 'target/classes') })
$CommonClasses = @($CommonModules | ForEach-Object { Join-Path $_.FullName 'target/classes' })
$DependencyPaths = @($Dependencies.Split([IO.Path]::PathSeparator) | Where-Object { $_.Replace('\', '/') -notmatch '/cloudflow-common/[^/]+/target/classes/?$' })
foreach ($CommonModule in $CommonModules) {
    $DependencyPaths = @($DependencyPaths | Where-Object { [IO.Path]::GetFileName($_) -notlike "$($CommonModule.Name)-*.jar" })
}
$ClassPath = (@((Join-Path $Module 'target/classes')) + $CommonClasses + $DependencyPaths) -join [IO.Path]::PathSeparator
$CheckOutput = Join-Path $Module 'target/batch-d-checks'
[IO.Directory]::CreateDirectory($CheckOutput) | Out-Null
$CheckSources = @(Get-ChildItem -LiteralPath (Join-Path $PSScriptRoot 'hr-checks') -Filter '*.java' -File | Select-Object -ExpandProperty FullName)
$CompileArguments = @('-encoding', 'UTF-8', '-cp', ('"' + $ClassPath.Replace('\', '/') + '"'),
    '-d', ('"' + $CheckOutput.Replace('\', '/') + '"'))
$CompileArguments += @($CheckSources | ForEach-Object { '"' + $_.Replace('\', '/') + '"' })
$CompileArgumentFile = Join-Path $CheckOutput 'compile.args'
[IO.File]::WriteAllLines($CompileArgumentFile, $CompileArguments, [Text.UTF8Encoding]::new($false))
& javac '-J-Dfile.encoding=UTF-8' '-J-Dstdout.encoding=UTF-8' '-J-Dstderr.encoding=UTF-8' "@$CompileArgumentFile"
if ($LASTEXITCODE -ne 0) { throw 'HR batch D checks compilation failed' }
$RunArguments = @('-cp', ('"' + ($CheckOutput + [IO.Path]::PathSeparator + $ClassPath).Replace('\', '/') + '"'),
    'com.cloudflow.hr.service.HrRulePrecisionChecks')
if ($JdbcUrl) { $RunArguments += '"' + $JdbcUrl + '"' }
$RunArgumentFile = Join-Path $CheckOutput 'run.args'
[IO.File]::WriteAllLines($RunArgumentFile, $RunArguments, [Text.UTF8Encoding]::new($false))
& java "@$RunArgumentFile"
if ($LASTEXITCODE -ne 0) { throw 'HR batch D checks failed' }
