param([switch]$RefreshClasspath)

$ErrorActionPreference = 'Stop'
$Root = [IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
. (Join-Path $Root '.cloudflow-runtime/use-data-drive.ps1')
$Backend = Join-Path $Root 'cloudflow-backend'
$Modules = @('cloudflow-auth', 'cloudflow-service-hr', 'cloudflow-service-crm', 'cloudflow-service-oa', 'cloudflow-service-workflow')
$Missing = @($Modules | Where-Object { -not (Test-Path -LiteralPath (Join-Path $Backend "$_/target/report-classpath.txt")) })
if ($RefreshClasspath -or $Missing.Count -gt 0) {
    Push-Location $Backend
    try {
        & mvn -q -pl ($Modules -join ',') dependency:build-classpath '-Dmdep.outputFile=target/report-classpath.txt'
        if ($LASTEXITCODE -ne 0) { throw 'Report classpath resolution failed; run the full install first' }
    } finally { Pop-Location }
}
$Entries = @($Modules | ForEach-Object { Join-Path $Backend "$_/target/classes" })
foreach ($Module in $Modules) {
    $Entries += (Get-Content -LiteralPath (Join-Path $Backend "$Module/target/report-classpath.txt") -Raw).Trim().Split([IO.Path]::PathSeparator)
}
$Classpath = (@($Entries | Select-Object -Unique) -join [IO.Path]::PathSeparator)
$Output = Join-Path $Backend 'target/report-rule-checks'
[IO.Directory]::CreateDirectory($Output) | Out-Null
$Source = Join-Path $Root 'scripts/report-checks/ReportRuleChecks.java'
$CompileFile = Join-Path $Output 'compile.args'
[IO.File]::WriteAllLines($CompileFile, @('-encoding', 'UTF-8', '-cp', ('"' + $Classpath.Replace('\', '/') + '"'), '-d', ('"' + $Output.Replace('\', '/') + '"'), ('"' + $Source.Replace('\', '/') + '"')), [Text.UTF8Encoding]::new($false))
& javac "@$CompileFile"
if ($LASTEXITCODE -ne 0) { throw 'Report rule checks compilation failed' }
$RunFile = Join-Path $Output 'run.args'
[IO.File]::WriteAllLines($RunFile, @('-Dfile.encoding=UTF-8', '-Dsun.stdout.encoding=UTF-8', '-Dsun.stderr.encoding=UTF-8', '-cp', ('"' + ($Output + [IO.Path]::PathSeparator + $Classpath).Replace('\', '/') + '"'), 'com.cloudflow.report.checks.ReportRuleChecks'), [Text.UTF8Encoding]::new($false))
& java "@$RunFile"
if ($LASTEXITCODE -ne 0) { throw 'Report rule checks failed' }
