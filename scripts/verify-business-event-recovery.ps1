param([Parameter(Mandatory = $true)][string]$StatePath)

$ErrorActionPreference = 'Stop'
$Root = [IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
if ([IO.Path]::GetPathRoot($Root).TrimEnd('\') -eq $env:SystemDrive) { throw 'Event verification must write outside the system drive' }
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
$Previous = @{}
foreach ($Name in @('EVENT_CHECK_REDIS_PORT', 'EVENT_CHECK_REDIS_PASSWORD', 'EVENT_CHECK_CLASSES')) { $Previous[$Name] = [Environment]::GetEnvironmentVariable($Name) }
$Run = Join-Path $Root ('.cloudflow-runtime\business-event-recovery\' + [Guid]::NewGuid().ToString('N'))
$Backend = Join-Path $Root 'cloudflow-backend'
$Common = Join-Path $Backend 'cloudflow-common'
$Classes = Join-Path $Run 'classes'
[IO.Directory]::CreateDirectory($Classes) | Out-Null
function Quote-Java([string]$Value) {
    if ($Value.Contains('"') -or $Value.Contains([char]10) -or $Value.Contains([char]13)) { throw 'Invalid Java argument' }
    return '"' + $Value.Replace('\', '/') + '"'
}
try {
    $Modules = @((Join-Path $Backend 'cloudflow-auth')) + @(Get-ChildItem -LiteralPath $Common -Directory | Select-Object -ExpandProperty FullName)
    $Dependencies = (Get-Content -LiteralPath (Join-Path $Backend 'cloudflow-auth\target\message-delivery-classpath.txt') -Raw).Trim()
    $Classpath = (@($Modules | ForEach-Object { Join-Path $_ 'target/classes' } | Where-Object { Test-Path -LiteralPath $_ }) + @($Dependencies)) -join [IO.Path]::PathSeparator
    $Sources = @(Get-ChildItem -LiteralPath (Join-Path $Common 'cloudflow-common-event\src\main\java') -Recurse -Filter '*.java' -File | Select-Object -ExpandProperty FullName)
    $Sources += Join-Path $PSScriptRoot 'event-checks\BusinessEventRecoveryChecks.java'
    $Arguments = @('-encoding','UTF-8','-parameters','-cp',(Quote-Java $Classpath),'-d',(Quote-Java $Classes))
    $Arguments += @($Sources | ForEach-Object { Quote-Java $_ })
    [IO.File]::WriteAllLines((Join-Path $Run 'compile.args'), $Arguments, [Text.UTF8Encoding]::new($false))
    & javac '-J-Dfile.encoding=UTF-8' ('@' + (Join-Path $Run 'compile.args'))
    if ($LASTEXITCODE -ne 0) { throw 'Business event recovery checks compilation failed' }
    $env:EVENT_CHECK_REDIS_PORT = "$($State.redisPort)"
    $env:EVENT_CHECK_REDIS_PASSWORD = $Secret.Groups[1].Value.TrimEnd([char]13)
    $env:EVENT_CHECK_CLASSES = $Classes
    $Logback = Join-Path $Run 'logback.xml'
    [IO.File]::WriteAllText($Logback, '<configuration><appender name="console" class="ch.qos.logback.core.ConsoleAppender"><encoder><pattern>%level %msg%n</pattern></encoder></appender><root level="WARN"><appender-ref ref="console"/></root></configuration>', [Text.UTF8Encoding]::new($false))
    $Arguments = @('-Dfile.encoding=UTF-8', ('-Dlogback.configurationFile=' + (Quote-Java $Logback)), '-cp',
            (Quote-Java ($Classes + [IO.Path]::PathSeparator + $Classpath)), 'com.cloudflow.common.event.config.BusinessEventRecoveryChecks')
    [IO.File]::WriteAllLines((Join-Path $Run 'run.args'), $Arguments, [Text.UTF8Encoding]::new($false))
    & java ('@' + (Join-Path $Run 'run.args'))
    if ($LASTEXITCODE -ne 0) { throw 'Business event Redis recovery checks failed; diagnostics retained' }
    Write-Output 'EVENT_RECOVERY_EXIT_CODE=0; PRODUCTION_MODIFIED=false; MYSQL_WRITES=0'
} finally {
    foreach ($Name in $Previous.Keys) { [Environment]::SetEnvironmentVariable($Name, $Previous[$Name]) }
    Write-Output "EVENT_RECOVERY_ARTIFACTS=$Run"
}
