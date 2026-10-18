param([switch]$SkipBuild, [string]$JdbcUrl = '', [string]$DataDirectory = '')

$ErrorActionPreference = 'Stop'
$OutputEncoding = [Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
$Root = Split-Path -Parent $PSScriptRoot
$Backend = Join-Path $Root 'cloudflow-backend'
$Module = Join-Path $Backend 'cloudflow-service-crm'
if (-not $SkipBuild) {
    Push-Location $Backend
    try {
        & mvn -q -pl cloudflow-service-crm -am '-DskipTests' compile dependency:build-classpath '-Dmdep.outputFile=target/batch-e-classpath.txt'
        if ($LASTEXITCODE -ne 0) { throw 'CRM compilation failed' }
    } finally { Pop-Location }
}
$Dependencies = (Get-Content -LiteralPath (Join-Path $Module 'target/batch-e-classpath.txt') -Raw).Trim()
$CommonModules = @(Get-ChildItem -LiteralPath (Join-Path $Backend 'cloudflow-common') -Directory | Where-Object { Test-Path -LiteralPath (Join-Path $_.FullName 'target/classes') })
$CommonClasses = @($CommonModules | ForEach-Object { Join-Path $_.FullName 'target/classes' })
$DependencyPaths = @($Dependencies.Split([IO.Path]::PathSeparator))
foreach ($CommonModule in $CommonModules) {
    $DependencyPaths = @($DependencyPaths | Where-Object { [IO.Path]::GetFileName($_) -notlike "$($CommonModule.Name)-*.jar" })
}
$ClassPath = (@((Join-Path $Module 'target/classes')) + $CommonClasses + $DependencyPaths) -join [IO.Path]::PathSeparator
$Output = Join-Path $Module 'target/batch-e-checks'
[IO.Directory]::CreateDirectory($Output) | Out-Null
$Sources = @(Get-ChildItem -LiteralPath (Join-Path $PSScriptRoot 'crm-checks') -Filter '*.java' -File | Where-Object Name -NotLike 'CrmEmail*DatabaseChecks.java' | Select-Object -ExpandProperty FullName)
$Compile = @('-encoding', 'UTF-8', '-cp', ('"' + $ClassPath.Replace('\', '/') + '"'), '-d', ('"' + $Output.Replace('\', '/') + '"'))
$Compile += @($Sources | ForEach-Object { '"' + $_.Replace('\', '/') + '"' })
$CompileFile = Join-Path $Output 'compile.args'
[IO.File]::WriteAllLines($CompileFile, $Compile, [Text.UTF8Encoding]::new($false))
& javac '-J-Dfile.encoding=UTF-8' "@$CompileFile"
if ($LASTEXITCODE -ne 0) { throw 'CRM check compilation failed' }
$Run = @('-Dfile.encoding=UTF-8', '-Duser.timezone=Asia/Shanghai', '-cp', ('"' + ($Output + [IO.Path]::PathSeparator + $ClassPath).Replace('\', '/') + '"'), 'com.cloudflow.crm.service.impl.CrmOperationsChecks')
if ($JdbcUrl) {
    if (-not $DataDirectory) { throw 'Isolated database data directory is required' }
    $Run = @('"-Dcloudflow.crm.check.dataDirectory=' + [IO.Path]::GetFullPath($DataDirectory).Replace('\', '/') + '"') + $Run
    $Run += '"' + $JdbcUrl + '"'
}
$RunFile = Join-Path $Output 'run.args'
[IO.File]::WriteAllLines($RunFile, $Run, [Text.UTF8Encoding]::new($false))
& java "@$RunFile"
if ($LASTEXITCODE -ne 0) { throw 'CRM checks failed' }
