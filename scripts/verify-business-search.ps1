param([switch]$SkipBuild)

$ErrorActionPreference = 'Stop'
$Root = [IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
. (Join-Path $Root '.cloudflow-runtime/use-data-drive.ps1')
$Backend = Join-Path $Root 'cloudflow-backend'
$Modules = @('cloudflow-auth','cloudflow-service-hr','cloudflow-service-crm','cloudflow-service-oa','cloudflow-service-workflow')
if (-not $SkipBuild) {
    Push-Location $Backend
    try {
        & mvn -q -pl ($Modules -join ',') -am '-DskipTests' compile dependency:build-classpath '-Dmdep.outputFile=target/business-search-classpath.txt'
        if ($LASTEXITCODE -ne 0) { throw 'Business search compilation failed' }
    } finally { Pop-Location }
}
$Entries = @($Modules | ForEach-Object { Join-Path $Backend "$_/target/classes" })
foreach ($Module in $Modules) {
    $DependencyFile = Join-Path $Backend "$Module/target/business-search-classpath.txt"
    $Entries += (Get-Content -LiteralPath $DependencyFile -Raw).Trim().Split([IO.Path]::PathSeparator)
}
$ClassPath = (@($Entries | Select-Object -Unique) -join [IO.Path]::PathSeparator)
$Output = Join-Path $Backend 'target/business-search-checks'
[IO.Directory]::CreateDirectory($Output) | Out-Null
$Sources = @('BusinessSearchChecks.java', 'AuthInfoTenantIdentityChecks.java') | ForEach-Object { Join-Path $Root "scripts/platform-checks/$_" }
$CompileArguments = @('-encoding','UTF-8','-cp',('"' + $ClassPath.Replace('\','/') + '"'),'-d',('"' + $Output.Replace('\','/') + '"'))
$CompileArguments += @($Sources | ForEach-Object { '"' + $_.Replace('\','/') + '"' })
$CompileFile = Join-Path $Output 'compile.args'
[IO.File]::WriteAllLines($CompileFile, $CompileArguments, [Text.UTF8Encoding]::new($false))
& javac "@$CompileFile"
if ($LASTEXITCODE -ne 0) { throw 'Business search checks compilation failed' }
$RunFile = Join-Path $Output 'run.args'
$RunArguments = @('-Dfile.encoding=UTF-8','-Dsun.stdout.encoding=UTF-8','-Dsun.stderr.encoding=UTF-8','-cp',('"' + ($Output + [IO.Path]::PathSeparator + $ClassPath).Replace('\','/') + '"'),'com.cloudflow.search.checks.BusinessSearchChecks')
[IO.File]::WriteAllLines($RunFile, $RunArguments, [Text.UTF8Encoding]::new($false))
& java "@$RunFile"
if ($LASTEXITCODE -ne 0) { throw 'Business search checks failed' }
$RunArguments[$RunArguments.Count - 1] = 'com.cloudflow.auth.controller.AuthInfoTenantIdentityChecks'
[IO.File]::WriteAllLines($RunFile, $RunArguments, [Text.UTF8Encoding]::new($false))
& java "@$RunFile"
if ($LASTEXITCODE -ne 0) { throw 'Auth info tenant identity checks failed' }
