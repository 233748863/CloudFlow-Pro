param([switch]$SkipBuild)

$ErrorActionPreference = 'Stop'
$Root = [IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
. (Join-Path $Root '.cloudflow-runtime/use-data-drive.ps1')
$Backend = Join-Path $Root 'cloudflow-backend'
$Auth = Join-Path $Backend 'cloudflow-auth'
if (-not $SkipBuild) {
    Push-Location $Backend
    try {
        & mvn -q -pl cloudflow-auth -am '-DskipTests' install
        if ($LASTEXITCODE -ne 0) { throw 'IM security dependency installation failed' }
        & mvn -q -f (Join-Path $Auth 'pom.xml') dependency:build-classpath '-Dmdep.outputFile=target/im-classpath.txt'
        if ($LASTEXITCODE -ne 0) { throw 'IM standalone installed dependency resolution failed' }
    } finally { Pop-Location }
}
$Entries = @((Join-Path $Auth 'target/classes')) + (Get-Content -LiteralPath (Join-Path $Auth 'target/im-classpath.txt') -Raw).Trim().Split([IO.Path]::PathSeparator)
foreach ($Entry in $Entries) {
    if (-not (Test-Path -LiteralPath $Entry) -or [IO.Path]::GetPathRoot([IO.Path]::GetFullPath($Entry)) -ne [IO.Path]::GetPathRoot($Root)) {
        throw 'IM dependencies must exist on the data drive; install and resolve the standalone auth classpath before using SkipBuild'
    }
}
$Classpath = (@($Entries | Select-Object -Unique) -join [IO.Path]::PathSeparator)
$Output = Join-Path $Backend 'target/im-security-checks'
[IO.Directory]::CreateDirectory($Output) | Out-Null
$Sources = @(Get-ChildItem -LiteralPath (Join-Path $Root 'scripts/im-checks') -Filter '*.java' | Sort-Object Name | ForEach-Object FullName)
$CompileFile = Join-Path $Output 'compile.args'
$CompileArguments = @('-encoding', 'UTF-8', '-cp', ('"' + $Classpath.Replace('\', '/') + '"'), '-d', ('"' + $Output.Replace('\', '/') + '"'))
$CompileArguments += @($Sources | ForEach-Object { '"' + $_.Replace('\', '/') + '"' })
[IO.File]::WriteAllLines($CompileFile, $CompileArguments, [Text.UTF8Encoding]::new($false))
& javac "@$CompileFile"
if ($LASTEXITCODE -ne 0) { throw 'IM checks compilation failed' }
foreach ($Main in @('ImSecurityChecks', 'WeComProtocolChecks', 'WeComMessageProtocolChecks', 'WeComTodoProtocolChecks', 'ImConfigChecks', 'WeComOrgChecks', 'ImOrgSnapshotChecks', 'ImSyncPlannerChecks', 'ImSyncApplicationChecks', 'ImBindingLogChecks')) {
    $RunFile = Join-Path $Output ($Main + '.args')
    [IO.File]::WriteAllLines($RunFile, @('-Dfile.encoding=UTF-8', '-Dsun.stdout.encoding=UTF-8', '-Dsun.stderr.encoding=UTF-8', '-cp',
        ('"' + ($Output + [IO.Path]::PathSeparator + $Classpath).Replace('\', '/') + '"'), ('com.cloudflow.auth.im.' + $Main)), [Text.UTF8Encoding]::new($false))
    & java "@$RunFile"
    if ($LASTEXITCODE -ne 0) { throw ($Main + ' failed') }
}
