param([Parameter(Mandatory = $true)][string]$StatePath)

$ErrorActionPreference = 'Stop'
$Root = [IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
. (Join-Path $Root '.cloudflow-runtime/use-data-drive.ps1')
$ResolvedState = (Resolve-Path -LiteralPath $StatePath).Path
$OwnedRun = Split-Path -Parent $ResolvedState
$Allowed = Join-Path $Root '.cloudflow-runtime\batch-g-integration'
if ((Split-Path -Parent $OwnedRun) -ne $Allowed -or (Split-Path -Leaf $OwnedRun) -notmatch '^[a-f0-9]{32}$' -or
        (Split-Path -Leaf $ResolvedState) -ne 'state.json') { throw 'Owned isolated Redis state required' }
$State = Get-Content -LiteralPath $ResolvedState -Raw | ConvertFrom-Json
$Owner = @($State.processes | Where-Object name -EQ 'redis')
if ($State.status -ne 'RUNNING' -or [IO.Path]::GetFullPath($State.run) -ne $OwnedRun -or $Owner.Count -ne 1 -or
        $State.redisPort -le 1024 -or $State.redisPort -ge 65536) { throw 'Invalid owned Redis state' }
$ConfigurationPath = [IO.Path]::GetFullPath((Join-Path $OwnedRun $Owner[0].marker))
if ((Split-Path -Parent $ConfigurationPath) -ne $OwnedRun) { throw 'Redis configuration is outside owned directory' }
foreach ($Path in @($OwnedRun, $ResolvedState, $ConfigurationPath)) {
    if ((Get-Item -LiteralPath $Path).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Redirected Redis state rejected' }
}
$Process = Get-CimInstance Win32_Process -Filter "ProcessId = $($Owner[0].id)"
if (-not $Process -or -not $Process.CommandLine.Contains($Owner[0].marker)) { throw 'Owned Redis process changed' }
$Configuration = [IO.File]::ReadAllText($ConfigurationPath)
if ($Configuration -notmatch '(?m)^bind 127\.0\.0\.1\r?$' -or $Configuration -notmatch ('(?m)^port ' + $State.redisPort + '\r?$')) { throw 'Loopback-only Redis required' }
$Secret = [regex]::Match($Configuration, '(?m)^requirepass (.+)\r?$')
if (-not $Secret.Success) { throw 'Owned Redis secret required' }
$Backend = Join-Path $Root 'cloudflow-backend'
$Auth = Join-Path $Backend 'cloudflow-auth'
$Output = Join-Path $Backend 'target/im-redis-checks'
[IO.Directory]::CreateDirectory($Output) | Out-Null
$Entries = @((Join-Path $Auth 'target/classes')) + (Get-Content -LiteralPath (Join-Path $Auth 'target/im-classpath.txt') -Raw).Trim().Split([IO.Path]::PathSeparator)
$Classpath = (@($Entries | Select-Object -Unique) -join [IO.Path]::PathSeparator)
$CompileFile = Join-Path $Output 'compile.args'
$CompileArguments = @('-encoding', 'UTF-8', '-cp', ('"' + $Classpath.Replace('\', '/') + '"'), '-d', ('"' + $Output.Replace('\', '/') + '"'))
$CompileArguments += @('ImRedisChecks.java', 'ImLoginChecks.java') | ForEach-Object { '"' + (Join-Path $Root "scripts/im-checks/$_").Replace('\', '/') + '"' }
[IO.File]::WriteAllLines($CompileFile, $CompileArguments, [Text.UTF8Encoding]::new($false))
& javac "@$CompileFile"
if ($LASTEXITCODE -ne 0) { throw 'IM Redis checks compilation failed' }
$Previous = @{}
foreach ($Name in @('IM_CHECK_REDIS_PORT', 'IM_CHECK_REDIS_PASSWORD')) { $Previous[$Name] = [Environment]::GetEnvironmentVariable($Name) }
try {
    $env:IM_CHECK_REDIS_PORT = "$($State.redisPort)"
    $env:IM_CHECK_REDIS_PASSWORD = $Secret.Groups[1].Value.TrimEnd([char]13)
    foreach ($Main in @('ImRedisChecks', 'ImLoginChecks')) {
        $RunFile = Join-Path $Output "$Main.args"
        [IO.File]::WriteAllLines($RunFile, @('-Dfile.encoding=UTF-8', '-Dsun.stdout.encoding=UTF-8', '-Dsun.stderr.encoding=UTF-8', '-cp',
                ('"' + ($Output + [IO.Path]::PathSeparator + $Classpath).Replace('\', '/') + '"'), "com.cloudflow.auth.im.$Main"), [Text.UTF8Encoding]::new($false))
        & java "@$RunFile"
        if ($LASTEXITCODE -ne 0) { throw "$Main failed" }
    }
} finally {
    foreach ($Name in $Previous.Keys) { [Environment]::SetEnvironmentVariable($Name, $Previous[$Name]) }
}
