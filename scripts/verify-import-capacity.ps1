param()
$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
. (Join-Path $Root '.cloudflow-runtime/use-data-drive.ps1')
$Backend = Join-Path $Root 'cloudflow-backend'
$Module = Join-Path $Backend 'cloudflow-auth'
$Entries = @((Join-Path $Module 'target/classes'))
$Entries += @(Get-ChildItem -LiteralPath (Join-Path $Backend 'cloudflow-common') -Directory | ForEach-Object {
    Join-Path $_.FullName 'target/classes'
} | Where-Object { Test-Path -LiteralPath $_ })
$Entries += (Get-Content -LiteralPath (Join-Path $Module 'target/batch-g-classpath.txt') -Raw).Trim().Split([IO.Path]::PathSeparator)
$Entries = @($Entries | Where-Object { [IO.Path]::GetFileName($_) -notlike 'cloudflow-common-*.jar' } | Select-Object -Unique)
foreach ($Entry in $Entries) {
    if (-not (Test-Path -LiteralPath $Entry)) { throw 'Missing import verification dependency' }
    if ($Entry -match '[/\\]target[/\\]classes[/\\]?$' -and
        -not [IO.Path]::GetFullPath($Entry).StartsWith($Root + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
        throw 'Import verification dependency references another workspace; regenerate it first'
    }
}
$ClassPath = $Entries -join [IO.Path]::PathSeparator
$Output = Join-Path $Module 'target/import-capacity-checks'
$Fixtures = Join-Path $Root '.cloudflow-runtime/import-capacity-checks'
[IO.Directory]::CreateDirectory($Output) | Out-Null
[IO.Directory]::CreateDirectory($Fixtures) | Out-Null
$Compile = @('-encoding','UTF-8','-cp',('"' + $ClassPath.Replace('\','/') + '"'),'-d',('"' + $Output.Replace('\','/') + '"'))
$Compile += @('ImportChecks.java','ImportStorageBoundaryChecks.java','ImportCapacityChecks.java') | ForEach-Object {
    '"' + (Join-Path $PSScriptRoot "platform-checks/$_").Replace('\','/') + '"'
}
$Arguments = Join-Path $Output 'compile.args'
[IO.File]::WriteAllLines($Arguments,$Compile,[Text.UTF8Encoding]::new($false))
& javac "@$Arguments"
if ($LASTEXITCODE -ne 0) { throw 'Import capacity checks compilation failed' }
$Common = @('-Dfile.encoding=UTF-8','-Dstdout.encoding=UTF-8','-Dstderr.encoding=UTF-8','-cp',('"' + ($Output + [IO.Path]::PathSeparator + $ClassPath).Replace('\','/') + '"'))
$FixtureArgument = '"' + $Fixtures.Replace('\','/') + '"'
$Cases = @(
    @{Name='regular'; Arguments=@('com.cloudflow.common.excel.importing.ImportChecks','regular',$FixtureArgument)},
    @{Name='stream'; Arguments=@('com.cloudflow.common.excel.importing.ImportChecks','stream',$FixtureArgument)},
    @{Name='boundary'; Arguments=@('com.cloudflow.auth.storage.ImportStorageBoundaryChecks',$FixtureArgument)},
    @{Name='capacity'; Arguments=@('com.cloudflow.common.excel.importing.ImportCapacityChecks',$FixtureArgument)}
)
foreach ($Case in $Cases) {
    $Jvm = @(if ($Case.Name -eq 'stream') { '-Xmx64m' })
    $Run = $Jvm + $Common + $Case.Arguments
    $RunFile = Join-Path $Output ($Case.Name + '.args')
    [IO.File]::WriteAllLines($RunFile,$Run,[Text.UTF8Encoding]::new($false))
    & java "@$RunFile"
    if ($LASTEXITCODE -ne 0) { throw "Import verification failed: $($Case.Name)" }
}
'IMPORT_CAPACITY_SUITE: groups=4; failed=0; production_modified=false'
