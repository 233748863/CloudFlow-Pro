param(
    [Parameter(Mandatory = $true)][string]$StatePath,
    [Parameter(Mandatory = $true)][ValidateSet('auth', 'hr', 'oa', 'crm', 'workflow', 'gateway')][string]$ServiceName,
    [Parameter(Mandatory = $true)][ValidateSet('Stop', 'Start')][string]$Action,
    [switch]$CompiledDependencies
)

$ErrorActionPreference = 'Stop'
$Root = [IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
$Allowed = (Join-Path $Root '.cloudflow-runtime/batch-g-integration').TrimEnd('\', '/') + [IO.Path]::DirectorySeparatorChar
$StatePath = (Resolve-Path -LiteralPath $StatePath).Path
if (-not $StatePath.StartsWith($Allowed, [StringComparison]::OrdinalIgnoreCase) -or (Split-Path -Leaf $StatePath) -ne 'state.json') { throw 'Integration state is outside the expected workspace' }
$State = Get-Content -LiteralPath $StatePath -Raw | ConvertFrom-Json
$Run = [IO.Path]::GetFullPath($State.run)
if ($Run -ne (Split-Path -Parent $StatePath) -or (Split-Path -Leaf $Run) -notmatch '^[a-f0-9]{32}$' -or $State.status -ne 'RUNNING') { throw 'Integration state is not a running isolated instance' }
$Directory = Join-Path $Run $ServiceName
foreach ($Target in @($Run, $Directory)) {
    if ((Get-Item -LiteralPath $Target).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Refusing redirected integration workspace' }
}
$ArgumentFile = Join-Path $Directory 'service.args'
$Service = @($State.services | Where-Object name -EQ $ServiceName)
$Owned = @($State.processes | Where-Object name -EQ $ServiceName)
if ($Service.Count -ne 1 -or $Owned.Count -ne 1 -or [IO.Path]::GetFullPath($Owned[0].marker) -ne $ArgumentFile) { throw 'Service is not owned by this isolated instance' }
$Current = Get-CimInstance Win32_Process -Filter "ProcessId = $($Owned[0].id)"
if ($Current -and (-not $Current.CommandLine -or -not $Current.CommandLine.Contains($ArgumentFile))) { throw 'Process identity changed; leaving the unrelated process untouched' }
if ($Action -eq 'Stop') {
    if (-not $Current) { throw 'The owned service is already stopped' }
    $OwnedProcess = [Diagnostics.Process]::GetProcessById($Current.ProcessId)
    try {
        $OwnedProcess.Kill($true)
        if (-not $OwnedProcess.WaitForExit(20000)) { throw 'Owned service has not finished stopping' }
    } finally { $OwnedProcess.Dispose() }
    $StopDeadline = [DateTime]::UtcNow.AddSeconds(20)
    while (Get-CimInstance Win32_Process -Filter "ProcessId = $($Current.ProcessId)") {
        if ([DateTime]::UtcNow -ge $StopDeadline) { throw 'Stopped process identity is still present; restart deferred' }
        Start-Sleep -Milliseconds 200
    }
    Write-Output "Owned $ServiceName process stopped for interruption verification."
    return
}
if ($Current) { throw 'The owned service is already running' }
if ($CompiledDependencies) {
    $Arguments = [IO.File]::ReadAllLines($ArgumentFile)
    $ClassPathIndex = [Array]::IndexOf($Arguments, '-cp') + 1
    if ($ClassPathIndex -lt 1 -or $ClassPathIndex -ge $Arguments.Length) { throw 'Owned service classpath is missing' }
    $CommonRoot = Join-Path $Root 'cloudflow-backend/cloudflow-common'
    $Entries = $Arguments[$ClassPathIndex].Trim('"').Split([IO.Path]::PathSeparator) | ForEach-Object {
        if ($_ -match '[/\\]com[/\\]cloudflow[/\\](cloudflow-common-[a-z0-9-]+)[/\\][^/\\]+[/\\][^/\\]+\.jar$') {
            $Classes = Join-Path $CommonRoot "$($Matches[1])/target/classes"
            if (-not (Test-Path -LiteralPath $Classes -PathType Container)) { throw 'Compile common dependencies before restarting the owned service' }
            $Classes
        } else { $_ }
    }
    $Arguments[$ClassPathIndex] = '"' + (($Entries -join [IO.Path]::PathSeparator).Replace('\', '/')) + '"'
    [IO.File]::WriteAllLines($ArgumentFile, $Arguments, [Text.UTF8Encoding]::new($false))
}
$Java = Join-Path $env:JAVA_HOME 'bin/java.exe'
if (-not (Test-Path -LiteralPath $Java)) { throw 'Set JAVA_HOME to JDK 17 before restarting an isolated service' }
$Suffix = [Guid]::NewGuid().ToString('N')
foreach ($Filename in @('stdout.log', 'stderr.log')) {
    Copy-Item -LiteralPath (Join-Path $Directory $Filename) -Destination (Join-Path $Directory "$Suffix-$Filename")
}
$Process = Start-Process -FilePath $Java -WindowStyle Hidden -PassThru -WorkingDirectory $Directory -ArgumentList ('"@' + $ArgumentFile + '"') -RedirectStandardOutput (Join-Path $Directory 'stdout.log') -RedirectStandardError (Join-Path $Directory 'stderr.log')
$Owned[0].id = $Process.Id
$State | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $StatePath -Encoding utf8
$Deadline = [DateTime]::UtcNow.AddMinutes(4)
do {
    if ($Process.HasExited) { throw 'Restarted isolated service exited before readiness' }
    try {
        $Health = Invoke-RestMethod -Uri "http://127.0.0.1:$($Service[0].healthPort)/actuator/health" -TimeoutSec 3
        if ($Health.status -eq 'UP') { Write-Output "Owned $ServiceName restarted and healthy."; return }
    } catch { Start-Sleep -Milliseconds 500 }
} while ([DateTime]::UtcNow -lt $Deadline)
throw 'Restarted isolated service readiness timed out'
