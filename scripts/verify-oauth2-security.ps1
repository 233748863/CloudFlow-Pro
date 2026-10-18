param([switch]$SkipBuild)

$ErrorActionPreference = 'Stop'
$Root = [IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
. (Join-Path $Root '.cloudflow-runtime/use-data-drive.ps1')
$Backend = Join-Path $Root 'cloudflow-backend'
$Auth = Join-Path $Backend 'cloudflow-auth'
if (-not $SkipBuild) {
    Push-Location $Backend
    try {
        & mvn -q -pl cloudflow-auth -am '-DskipTests' compile dependency:build-classpath '-Dmdep.outputFile=target/oauth2-classpath.txt'
        if ($LASTEXITCODE -ne 0) { throw 'OAuth security compilation failed' }
    } finally { Pop-Location }
}
$Entries = @((Join-Path $Auth 'target/classes')) + (Get-Content -LiteralPath (Join-Path $Auth 'target/oauth2-classpath.txt') -Raw).Trim().Split([IO.Path]::PathSeparator)
$Classpath = (@($Entries | Select-Object -Unique) -join [IO.Path]::PathSeparator)
$Output = Join-Path $Backend 'target/oauth2-security-checks'
[IO.Directory]::CreateDirectory($Output) | Out-Null
$Source = Join-Path $Root 'scripts/oauth2-checks/OAuthSecurityChecks.java'
$CompileFile = Join-Path $Output 'compile.args'
[IO.File]::WriteAllLines($CompileFile, @('-encoding','UTF-8','-cp',('"' + $Classpath.Replace('\','/') + '"'),'-d',('"' + $Output.Replace('\','/') + '"'),('"' + $Source.Replace('\','/') + '"')), [Text.UTF8Encoding]::new($false))
& javac "@$CompileFile"
if ($LASTEXITCODE -ne 0) { throw 'OAuth security checks compilation failed' }
$RunFile = Join-Path $Output 'run.args'
[IO.File]::WriteAllLines($RunFile, @('-Dfile.encoding=UTF-8','-Dsun.stdout.encoding=UTF-8','-Dsun.stderr.encoding=UTF-8','-cp',('"' + ($Output + [IO.Path]::PathSeparator + $Classpath).Replace('\','/') + '"'),'com.cloudflow.auth.oauth2.OAuthSecurityChecks'), [Text.UTF8Encoding]::new($false))
& java "@$RunFile"
if ($LASTEXITCODE -ne 0) { throw 'OAuth security checks failed' }
