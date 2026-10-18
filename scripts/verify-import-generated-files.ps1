param()
$ErrorActionPreference='Stop'
$Root=Split-Path -Parent $PSScriptRoot
. (Join-Path $Root '.cloudflow-runtime/use-data-drive.ps1')
$Backend=Join-Path $Root 'cloudflow-backend'
$Module=Join-Path $Backend 'cloudflow-auth'
$Entries=@((Join-Path $Module 'target/classes'))
$Entries+=@(Get-ChildItem -LiteralPath (Join-Path $Backend 'cloudflow-common') -Directory | ForEach-Object {
    Join-Path $_.FullName 'target/classes'
} | Where-Object { Test-Path -LiteralPath $_ })
$Entries+=(Get-Content -LiteralPath (Join-Path $Module 'target/batch-g-classpath.txt') -Raw).Trim().Split([IO.Path]::PathSeparator)
$Entries=@($Entries | Where-Object { [IO.Path]::GetFileName($_) -notlike 'cloudflow-common-*.jar' } | Select-Object -Unique)
foreach ($Entry in $Entries) {
    if (-not (Test-Path -LiteralPath $Entry)) { throw 'Missing generated-file verification dependency' }
    if ($Entry -match '[/\\]target[/\\]classes[/\\]?$' -and
        -not [IO.Path]::GetFullPath($Entry).StartsWith($Root+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)) {
        throw 'Generated-file verification dependency references another workspace'
    }
}
$Output=Join-Path $Root '.cloudflow-runtime/import-generated-checks/classes'
$Fixtures=Join-Path $Root '.cloudflow-runtime/import-generated-checks/fixtures'
[IO.Directory]::CreateDirectory($Output) | Out-Null
[IO.Directory]::CreateDirectory($Fixtures) | Out-Null
$ClassPath=$Entries -join [IO.Path]::PathSeparator
$Compile=@('-encoding','UTF-8','-cp',('"'+$ClassPath.Replace('\','/')+'"'),'-d',('"'+$Output.Replace('\','/')+'"'))
$Compile+=@('ImportChecks.java','ImportGeneratedFileChecks.java') | ForEach-Object {
    '"'+(Join-Path $PSScriptRoot "platform-checks/$_").Replace('\','/')+'"'
}
$CompileFile=Join-Path $Output 'compile.args'
[IO.File]::WriteAllLines($CompileFile,$Compile,[Text.UTF8Encoding]::new($false))
& javac "@$CompileFile"
if ($LASTEXITCODE -ne 0) { throw 'Generated-file checks compilation failed' }
$Run=@('-Dfile.encoding=UTF-8','-Dstdout.encoding=UTF-8','-Dstderr.encoding=UTF-8','-cp',
    ('"'+($Output+[IO.Path]::PathSeparator+$ClassPath).Replace('\','/')+'"'),
    'com.cloudflow.common.excel.importing.ImportGeneratedFileChecks',('"'+$Fixtures.Replace('\','/')+'"'))
$RunFile=Join-Path $Output 'run.args'
[IO.File]::WriteAllLines($RunFile,$Run,[Text.UTF8Encoding]::new($false))
& java "@$RunFile"
if ($LASTEXITCODE -ne 0) { throw 'Generated-file preservation checks failed' }
