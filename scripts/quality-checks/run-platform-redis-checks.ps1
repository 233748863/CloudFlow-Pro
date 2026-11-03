param([string]$RedisServer, [string]$OutputDirectory)

$ErrorActionPreference = 'Stop'
$ProjectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$Backend = Join-Path $ProjectRoot 'cloudflow-backend'
if (-not $RedisServer) { $RedisServer = Join-Path $ProjectRoot '.cloudflow-runtime/redis-8.10.1/bin/Redis-8.10.1-Windows-x64-msys2/redis-server.exe' }
if (-not $OutputDirectory) { $OutputDirectory = Join-Path $ProjectRoot ('.cloudflow-runtime/quality-platform-redis-' + [Guid]::NewGuid().ToString('N')) }
$OutputDirectory = [IO.Path]::GetFullPath($OutputDirectory)
[IO.Directory]::CreateDirectory($OutputDirectory) | Out-Null
$Dependencies = @('cloudflow-auth', 'cloudflow-gateway') | ForEach-Object {
    (Get-Content -LiteralPath (Join-Path $Backend "$_/target/quality-platform-classpath.txt") -Raw).Trim().Split([IO.Path]::PathSeparator)
}
$SpringCore = $Dependencies | Where-Object { $_ -match '[\\/]spring-core[\\/]([^\\/]+)[\\/]' } | Select-Object -First 1
$SpringVersion = Split-Path -Leaf (Split-Path -Parent $SpringCore)
$SpringTest = Join-Path $OutputDirectory "spring-test-$SpringVersion.jar"
if (-not (Test-Path -LiteralPath $SpringTest)) {
    Invoke-WebRequest -Uri "https://repo.maven.apache.org/maven2/org/springframework/spring-test/$SpringVersion/spring-test-$SpringVersion.jar" -OutFile $SpringTest -TimeoutSec 30
}
$Modules = @((Join-Path $Backend 'cloudflow-auth'), (Join-Path $Backend 'cloudflow-gateway')) + @(Get-ChildItem -LiteralPath (Join-Path $Backend 'cloudflow-common') -Directory | Select-Object -ExpandProperty FullName)
$Classes = @($Modules | ForEach-Object { Join-Path $_ 'target/classes' } | Where-Object { Test-Path -LiteralPath $_ })
$ClassPath = (@($Classes) + @($Dependencies | Select-Object -Unique) + @($SpringTest)) -join [IO.Path]::PathSeparator
$Sources = @((Join-Path $PSScriptRoot 'PlatformRedisChecks.java'),
    (Join-Path $Backend 'cloudflow-gateway/src/main/java/com/cloudflow/gateway/ratelimit/DynamicRateLimitFilter.java'))
$CompileFile = Join-Path $OutputDirectory 'compile.args'
[IO.File]::WriteAllLines($CompileFile, @('-encoding', 'UTF-8', '-parameters', '-cp', ('"' + $ClassPath.Replace('\', '/') + '"'),
    '-d', ('"' + $OutputDirectory.Replace('\', '/') + '"')) + @($Sources | ForEach-Object { '"' + $_.Replace('\', '/') + '"' }), [Text.UTF8Encoding]::new($false))
& javac '-J-Dfile.encoding=UTF-8' ('@' + $CompileFile)
if ($LASTEXITCODE -ne 0) { throw 'Platform Redis check compilation failed.' }
$Listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, 0)
$Listener.Start()
$Port = $Listener.LocalEndpoint.Port
$Listener.Stop()
$Configuration = Join-Path $OutputDirectory 'redis.conf'
[IO.File]::WriteAllLines($Configuration, @('bind 127.0.0.1', 'protected-mode yes', "port $Port", 'save ""',
    'appendonly no', 'dir "."'), [Text.UTF8Encoding]::new($false))
$Process = Start-Process -FilePath $RedisServer -ArgumentList 'redis.conf' -WorkingDirectory $OutputDirectory -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $OutputDirectory 'redis.log') -RedirectStandardError (Join-Path $OutputDirectory 'redis-error.log')
try {
    $Ready = $false
    for ($Attempt = 0; $Attempt -lt 50; $Attempt++) {
        if ($Process.HasExited) { throw 'Owned loopback Redis failed to start.' }
        $Client = [Net.Sockets.TcpClient]::new()
        try { $Client.Connect('127.0.0.1', $Port); $Ready = $true; break } catch { Start-Sleep -Milliseconds 100 } finally { $Client.Dispose() }
    }
    if (-not $Ready) { throw 'Owned loopback Redis startup timed out.' }
    $RunFile = Join-Path $OutputDirectory 'run.args'
    [IO.File]::WriteAllLines($RunFile, @('-Dfile.encoding=UTF-8', '-Dsun.stdout.encoding=UTF-8', '-Dsun.stderr.encoding=UTF-8',
        '-cp', ('"' + ($OutputDirectory + [IO.Path]::PathSeparator + $ClassPath).Replace('\', '/') + '"'),
        'com.cloudflow.auth.checks.PlatformRedisChecks', "$Port"), [Text.UTF8Encoding]::new($false))
    & java ('@' + $RunFile)
    if ($LASTEXITCODE -ne 0) { throw 'Platform Redis checks failed.' }
} finally {
    if (-not $Process.HasExited) { $Process.Kill(); $Process.WaitForExit() }
    $Process.Dispose()
    Write-Output "PLATFORM_REDIS_OUTPUT=$OutputDirectory; owned_redis_stopped=true"
}
