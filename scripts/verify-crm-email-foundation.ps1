param([switch]$SkipBuild)

$ErrorActionPreference = 'Stop'
$OutputEncoding = [Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
$Root = Split-Path -Parent $PSScriptRoot
$Backend = Join-Path $Root 'cloudflow-backend'
$Module = Join-Path $Backend 'cloudflow-service-crm'
if (-not $SkipBuild) {
    Push-Location $Backend
    try {
        & mvn -q -pl cloudflow-service-crm -am '-DskipTests' compile dependency:build-classpath '-Dmdep.outputFile=target/e5-classpath.txt'
        if ($LASTEXITCODE -ne 0) { throw 'CRM email compilation failed' }
    } finally { Pop-Location }
}
$Dependencies = (Get-Content -LiteralPath (Join-Path $Module 'target/e5-classpath.txt') -Raw).Trim()
$Modules = @($Module) + @(Get-ChildItem -LiteralPath (Join-Path $Backend 'cloudflow-common') -Directory | Select-Object -ExpandProperty FullName)
$Classes = @($Modules | ForEach-Object { Join-Path $_ 'target/classes' } | Where-Object { Test-Path -LiteralPath $_ })
$ClassPath = (@($Classes) + @($Dependencies)) -join [IO.Path]::PathSeparator
$Output = Join-Path $Module 'target/e5-email-foundation-checks'
[IO.Directory]::CreateDirectory($Output) | Out-Null
$Source = Join-Path $PSScriptRoot 'crm-checks/CrmEmailFoundationChecks.java'
$Compile = @('-encoding', 'UTF-8', '-parameters', '-cp', ('"' + $ClassPath.Replace('\', '/') + '"'), '-d', ('"' + $Output.Replace('\', '/') + '"'), ('"' + $Source.Replace('\', '/') + '"'))
$CompileFile = Join-Path $Output 'compile.args'
[IO.File]::WriteAllLines($CompileFile, $Compile, [Text.UTF8Encoding]::new($false))
& javac "@$CompileFile"
if ($LASTEXITCODE -ne 0) { throw 'CRM email check compilation failed' }
$Run = @('-Dfile.encoding=UTF-8', '-cp', ('"' + ($Output + [IO.Path]::PathSeparator + $ClassPath).Replace('\', '/') + '"'), 'com.cloudflow.crm.service.email.CrmEmailFoundationChecks')
$RunFile = Join-Path $Output 'run.args'
[IO.File]::WriteAllLines($RunFile, $Run, [Text.UTF8Encoding]::new($false))
& java "@$RunFile"
if ($LASTEXITCODE -ne 0) { throw 'CRM email checks failed' }
