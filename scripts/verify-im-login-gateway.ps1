$ErrorActionPreference = 'Stop'
$Root = [IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
. (Join-Path $Root '.cloudflow-runtime/use-data-drive.ps1')
$Gateway = Join-Path $Root 'cloudflow-backend/cloudflow-gateway'
$Entries = @((Join-Path $Gateway 'target/classes')) + (Get-Content -LiteralPath (Join-Path $Gateway 'target/im-login-classpath.txt') -Raw).Trim().Split([IO.Path]::PathSeparator)
foreach ($Entry in $Entries) {
    if (-not (Test-Path -LiteralPath $Entry) -or [IO.Path]::GetPathRoot([IO.Path]::GetFullPath($Entry)) -ne [IO.Path]::GetPathRoot($Root)) { throw 'Installed data-drive gateway dependencies required' }
}
$Output = Join-Path $Root 'cloudflow-backend/target/im-login-gateway'
[IO.Directory]::CreateDirectory($Output) | Out-Null
$Classpath = $Entries -join [IO.Path]::PathSeparator
$Source = Join-Path $Root 'scripts/platform-checks/ImLoginGatewayChecks.java'
$Compile = Join-Path $Output 'compile.args'
[IO.File]::WriteAllLines($Compile, @('-encoding','UTF-8','-cp',('"' + $Classpath.Replace('\','/') + '"'),'-d',('"' + $Output.Replace('\','/') + '"'),('"' + $Source.Replace('\','/') + '"')), [Text.UTF8Encoding]::new($false))
& javac "@$Compile"
if ($LASTEXITCODE -ne 0) { throw 'IM gateway checks compilation failed' }
$Run = Join-Path $Output 'run.args'
[IO.File]::WriteAllLines($Run, @('-Dfile.encoding=UTF-8','-cp',('"' + ($Output + [IO.Path]::PathSeparator + $Classpath).Replace('\','/') + '"'),'com.cloudflow.gateway.filter.ImLoginGatewayChecks'), [Text.UTF8Encoding]::new($false))
& java "@$Run"
if ($LASTEXITCODE -ne 0) { throw 'IM gateway checks failed' }
