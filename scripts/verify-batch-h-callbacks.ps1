param([switch]$WithRedis, [switch]$KeepArtifacts, [string]$StatePath)

$ErrorActionPreference = 'Stop'
$Workspace = [IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
$Backend = Join-Path $Workspace 'cloudflow-backend'
$Workflow = Join-Path $Backend 'cloudflow-service-workflow'
$Callback = Join-Path $Backend 'cloudflow-common/cloudflow-common-workflow-callback'
$DependencyFile = Join-Path $Workflow 'target/batch-h-classpath.txt'
$TestSource = Join-Path $PSScriptRoot 'workflow-checks/WorkflowCallbackDeliveryChecks.java'
$Scratch = Join-Path ([IO.Path]::GetTempPath()) ('h-callback-checks-' + [Guid]::NewGuid().ToString('N'))
$EnvironmentBefore = @{}
Get-ChildItem Env: | ForEach-Object { $EnvironmentBefore[$_.Name] = $_.Value }

function ConvertTo-JavaArgument([string]$Value) {
    if ($Value.Contains('"') -or $Value.Contains([char]10) -or $Value.Contains([char]13)) { throw 'Unsafe Java argument' }
    return '"' + $Value.Replace('\', '/') + '"'
}

function Get-SourceFingerprint([string[]]$Paths) {
    $Hasher = [Security.Cryptography.SHA256]::Create()
    try {
        $Entries = foreach ($SourcePath in ($Paths | Sort-Object -Unique)) {
            $SourcePath + ':' + (Get-FileHash -LiteralPath $SourcePath -Algorithm SHA256).Hash
        }
        return [BitConverter]::ToString($Hasher.ComputeHash([Text.Encoding]::UTF8.GetBytes(($Entries -join [char]10)))).Replace('-', '').ToLowerInvariant()
    } finally {
        $Hasher.Dispose()
    }
}

try {
    foreach ($Required in @($DependencyFile, $TestSource)) {
        if (-not (Test-Path -LiteralPath $Required -PathType Leaf)) { throw 'Missing existing classpath or check source; no service build is permitted' }
    }
    $Java = (Get-Command java -ErrorAction Stop).Source
    $Javac = (Get-Command javac -ErrorAction Stop).Source
    $Dependencies = (Get-Content -LiteralPath $DependencyFile -Raw).Trim().Split([IO.Path]::PathSeparator)
    foreach ($Dependency in $Dependencies) {
        if (-not (Test-Path -LiteralPath $Dependency -PathType Leaf)) { throw ('Missing existing dependency: ' + [IO.Path]::GetFileName($Dependency)) }
    }
    $ExistingClasses = @((Join-Path $Workflow 'target/classes'))
    foreach ($Module in (Get-ChildItem -LiteralPath (Join-Path $Backend 'cloudflow-common') -Directory)) {
        $Candidate = Join-Path $Module.FullName 'target/classes'
        if (Test-Path -LiteralPath $Candidate -PathType Container) { $ExistingClasses += $Candidate }
    }
    if (-not (Test-Path -LiteralPath $ExistingClasses[0] -PathType Container)) { throw 'Existing workflow classes are required; this script never builds a service' }
    $Sources = @(Get-ChildItem -LiteralPath (Join-Path $Callback 'src/main/java') -Filter '*.java' -Recurse -File | Select-Object -ExpandProperty FullName)
    $Sources += Join-Path $Workflow 'src/main/java/com/cloudflow/workflow/event/ApprovalResultStreamPublisher.java'
    $Sources += Join-Path $Workflow 'src/main/java/com/cloudflow/workflow/callback/CallbackDlqReplayer.java'
    $Sources += $TestSource
    $FingerprintPaths = @($Sources) + @($PSCommandPath, $DependencyFile)
    $Fingerprint = Get-SourceFingerprint $FingerprintPaths
    $Classes = Join-Path $Scratch 'classes'
    $Generated = Join-Path $Scratch 'generated'
    $EmptySources = Join-Path $Scratch 'empty-sourcepath'
    foreach ($Directory in @($Classes, $Generated, $EmptySources)) { [IO.Directory]::CreateDirectory($Directory) | Out-Null }
    $Classpath = (@($ExistingClasses) + @($Dependencies)) -join [IO.Path]::PathSeparator
    $CompileArguments = @('-encoding', 'UTF-8', '-parameters', '-sourcepath', (ConvertTo-JavaArgument $EmptySources),
        '-cp', (ConvertTo-JavaArgument $Classpath), '-d', (ConvertTo-JavaArgument $Classes), '-s', (ConvertTo-JavaArgument $Generated))
    $CompileArguments += @($Sources | ForEach-Object { ConvertTo-JavaArgument $_ })
    $CompileFile = Join-Path $Scratch 'compile.args'
    [IO.File]::WriteAllLines($CompileFile, $CompileArguments, [Text.UTF8Encoding]::new($false))
    $LogConfiguration = Join-Path $Scratch 'logback.xml'
    [IO.File]::WriteAllText($LogConfiguration, '<configuration><root level="OFF"/></configuration>', [Text.UTF8Encoding]::new($false))
    $env:CALLBACK_CHECK_REDIS = '0'
    if ($StatePath -and -not $WithRedis) { throw 'Owned Redis state requires -WithRedis' }
    if ($WithRedis) {
        if ($StatePath) {
            $ResolvedState = (Resolve-Path -LiteralPath $StatePath).Path
            $Run = Split-Path -Parent $ResolvedState
            $Allowed = (Resolve-Path -LiteralPath (Join-Path $Workspace '.cloudflow-runtime/batch-g-integration')).Path
            if ((Split-Path -Parent $Run) -ne $Allowed -or (Split-Path -Leaf $Run) -notmatch '^[a-f0-9]{32}$' -or
                    (Split-Path -Leaf $ResolvedState) -ne 'state.json') { throw 'Redis state is outside the owned isolation directory' }
            $State = Get-Content -LiteralPath $ResolvedState -Raw | ConvertFrom-Json
            if ([IO.Path]::GetFullPath($State.run) -ne $Run -or $State.status -ne 'RUNNING' -or
                    $State.redisPort -le 1024 -or $State.redisPort -ge 65536) { throw 'Owned Redis state is invalid' }
            $Owner = @($State.processes | Where-Object name -EQ 'redis')
            if ($Owner.Count -ne 1) { throw 'Owned Redis process is missing' }
            $ConfigurationPath = [IO.Path]::GetFullPath((Join-Path $Run $Owner[0].marker))
            if ((Split-Path -Parent $ConfigurationPath) -ne $Run) { throw 'Redis configuration is outside the owned directory' }
            foreach ($Path in @($Run, $ResolvedState, $ConfigurationPath)) {
                if ((Get-Item -LiteralPath $Path).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Refusing redirected Redis state' }
            }
            $Process = Get-CimInstance Win32_Process -Filter "ProcessId = $($Owner[0].id)"
            if (-not $Process -or -not $Process.CommandLine.Contains($Owner[0].marker)) { throw 'Owned Redis process identity changed' }
            $Configuration = [IO.File]::ReadAllText($ConfigurationPath)
            if ($Configuration -notmatch '(?m)^bind 127\.0\.0\.1\r?$' -or
                    $Configuration -notmatch ('(?m)^port ' + $State.redisPort + '\r?$')) { throw 'Owned Redis must listen only on the declared loopback port' }
            $Secret = [regex]::Match($Configuration, '(?m)^requirepass (.+)\r?$')
            if (-not $Secret.Success) { throw 'Owned Redis password is missing' }
            $env:REDIS_HOST = '127.0.0.1'
            $env:REDIS_PORT = [string]$State.redisPort
            $env:REDIS_DB = '0'
            $env:REDIS_PASSWORD = $Secret.Groups[1].Value.Trim()
            Write-Output 'Redis target: verified owned loopback instance; production Redis is untouched.'
        } else {
            $ConnectionFile = Join-Path $Workspace '.cloudflow-runtime/batch-e-runtime/connection.ps1'
            if (-not (Test-Path -LiteralPath $ConnectionFile -PathType Leaf)) { throw 'Existing connection settings are unavailable' }
            . $ConnectionFile
            $RedisPort = if ([string]::IsNullOrWhiteSpace($env:REDIS_PORT)) { 6379 } else { [int]$env:REDIS_PORT }
            $RedisDatabase = if ([string]::IsNullOrWhiteSpace($env:REDIS_DB)) { 0 } else { [int]$env:REDIS_DB }
            if ($env:REDIS_HOST -ne '192.168.1.173' -or $RedisPort -ne 6379 -or $RedisDatabase -ne 0) {
                throw 'Redis verification target changed; refusing verification'
            }
            $env:REDIS_PORT = [string]$RedisPort
            $env:REDIS_DB = [string]$RedisDatabase
        }
        $env:CALLBACK_CHECK_REDIS = '1'
    }
    $env:CALLBACK_CHECK_CLASS_DIR = $Classes
    Push-Location $Scratch
    try {
        Write-Output ('Callback checks: compile only ' + $Sources.Count + ' callback/check sources into a temporary directory; existing dependency classes are read-only.')
        & $Javac '-J-Dfile.encoding=UTF-8' "@$CompileFile"
        if ($LASTEXITCODE -ne 0) { throw 'Isolated callback check compilation failed' }
        if ((Get-SourceFingerprint $FingerprintPaths) -ne $Fingerprint) { throw 'Callback sources changed during compilation; rerun before accepting results' }
        $RunArguments = @(('-Dlogback.configurationFile=' + (ConvertTo-JavaArgument $LogConfiguration)),
            ('-Djava.io.tmpdir=' + (ConvertTo-JavaArgument $Scratch)), '-cp',
            (ConvertTo-JavaArgument ($Classes + [IO.Path]::PathSeparator + $Classpath)), 'WorkflowCallbackDeliveryChecks')
        $RunFile = Join-Path $Scratch 'run.args'
        [IO.File]::WriteAllLines($RunFile, $RunArguments, [Text.UTF8Encoding]::new($false))
        & $Java "@$RunFile"
        if ($LASTEXITCODE -ne 0) { throw 'Callback delivery checks failed; no service deployment was performed' }
        if ((Get-SourceFingerprint $FingerprintPaths) -ne $Fingerprint) { throw 'Callback sources changed during checks; rerun before accepting results' }
        Write-Output ('Callback checks: stable source SHA256=' + $Fingerprint + '; no Maven, target writes, database access or service restarts.')
    } finally {
        Pop-Location
    }
} finally {
    foreach ($EnvironmentName in @(Get-ChildItem Env: | Select-Object -ExpandProperty Name)) {
        if (-not $EnvironmentBefore.ContainsKey($EnvironmentName)) { [Environment]::SetEnvironmentVariable($EnvironmentName, $null, 'Process') }
    }
    foreach ($EnvironmentName in $EnvironmentBefore.Keys) {
        [Environment]::SetEnvironmentVariable($EnvironmentName, $EnvironmentBefore[$EnvironmentName], 'Process')
    }
    if (Test-Path -LiteralPath $Scratch -PathType Container) {
        if ($KeepArtifacts) {
            Write-Output ('Credential-free compiler artifacts retained at ' + $Scratch)
        } else {
            $ResolvedScratch = (Resolve-Path -LiteralPath $Scratch).ProviderPath
            $TempRoot = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\') + '\'
            if (-not $ResolvedScratch.StartsWith($TempRoot, [StringComparison]::OrdinalIgnoreCase) -or
                    (Split-Path -Leaf $ResolvedScratch) -notmatch '^h-callback-checks-[a-f0-9]{32}$' -or
                    -not $ResolvedScratch.Equals([IO.Path]::GetFullPath($Scratch), [StringComparison]::OrdinalIgnoreCase)) {
                throw 'Unsafe temporary cleanup target'
            }
            Remove-Item -LiteralPath $ResolvedScratch -Recurse -Force
        }
    }
}
