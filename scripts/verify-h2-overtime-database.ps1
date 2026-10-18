param([Parameter(Mandatory=$true)][ValidateRange(1025,65535)][int]$SourcePort,
    [Parameter(Mandatory=$true)][string]$SourceDataDirectory,
    [Parameter(Mandatory=$true)][string]$ArtifactRoot,
    [switch]$KeepArtifacts, [ValidateRange(1, 10)][int]$RaceRounds = 3)

$ErrorActionPreference = 'Stop'
. 'D:\CloudFlowPro\.cloudflow-runtime\use-data-drive.ps1'
$Workspace = [IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
$Backend = Join-Path $Workspace 'cloudflow-backend'
$Hr = Join-Path $Backend 'cloudflow-service-hr'
$Checks = Join-Path $PSScriptRoot 'hr-db-checks'
$DependencyFile = Join-Path $Hr 'target/report-classpath.txt'
$TestSource = Join-Path $Checks 'Hr09DatabaseChecks.java'
$FixtureRoot = Join-Path $PSScriptRoot 'fixture-checks'
$FixtureXml = Join-Path $FixtureRoot 'mapper/FixtureInspectionMapper.xml'
if($Workspace -ne 'D:\CloudFlowPro'){throw 'Current overtime requires the data-drive workspace'}
$ArtifactRoot=[IO.Path]::GetFullPath($ArtifactRoot)
$SourceDataDirectory=[IO.Path]::GetFullPath($SourceDataDirectory)
if(-not $ArtifactRoot.StartsWith((Join-Path $Workspace '.cloudflow-runtime')+'\',[StringComparison]::OrdinalIgnoreCase) -or
    -not $SourceDataDirectory.StartsWith($ArtifactRoot+'\',[StringComparison]::OrdinalIgnoreCase) -or
    -not (Test-Path -LiteralPath $SourceDataDirectory -PathType Container)){throw 'Owned scratch source directory required'}
$Scratch = [IO.Path]::GetFullPath((Join-Path $ArtifactRoot ('hr09-db-' + [Guid]::NewGuid().ToString('N'))))
$Database = 'hr09_verify_' + [Guid]::NewGuid().ToString('N')
$Utf8 = [Text.UTF8Encoding]::new($false)
$EnvironmentBefore = @{}
Get-ChildItem Env: | ForEach-Object { $EnvironmentBefore[$_.Name] = $_.Value }
$Succeeded = $false

function ConvertTo-JavaArgument([string]$Value) {
    if ($Value.Contains('"') -or $Value.Contains([char]10) -or $Value.Contains([char]13)) { throw 'Unsafe Java argument' }
    return '"' + $Value.Replace('\', '/') + '"'
}

function Get-Fingerprints([string[]]$Paths) {
    $Entries = foreach ($SourcePath in ($Paths | Sort-Object -Unique)) {
        [ordered]@{ path = $SourcePath.Substring($Workspace.Length + 1).Replace('\', '/'); sha256 = (Get-FileHash -LiteralPath $SourcePath -Algorithm SHA256).Hash.ToLowerInvariant() }
    }
    return ConvertTo-Json -InputObject @($Entries) -Depth 4 -Compress
}

function Get-TextHash([string]$Value) {
    $Hasher = [Security.Cryptography.SHA256]::Create()
    try { return [BitConverter]::ToString($Hasher.ComputeHash([Text.Encoding]::UTF8.GetBytes($Value))).Replace('-', '').ToLowerInvariant() }
    finally { $Hasher.Dispose() }
}

function Get-CurrentFingerprints {
    $CurrentPaths = @($TestSource, $PSCommandPath, $FixtureXml)
    foreach ($SourceRoot in $SourceRoots) { $CurrentPaths += @(Get-ChildItem -LiteralPath $SourceRoot -Recurse -File -Filter '*.java' | Select-Object -ExpandProperty FullName) }
    foreach ($MapperRoot in $MapperRoots) { $CurrentPaths += @(Get-ChildItem -LiteralPath $MapperRoot -Recurse -File -Filter '*.xml' | Select-Object -ExpandProperty FullName) }
    return Get-Fingerprints $CurrentPaths
}

function Remove-CheckedArtifact([string]$Path) {
    if (-not (Test-Path -LiteralPath $Path)) { return }
    $Resolved = (Resolve-Path -LiteralPath $Path).ProviderPath
    if (-not $Resolved.StartsWith(($Scratch.TrimEnd('\') + '\'), [StringComparison]::OrdinalIgnoreCase)) { throw 'Artifact cleanup escaped this verification directory' }
    Remove-Item -LiteralPath $Resolved -Recurse -Force
}

try {
    foreach ($Required in @($DependencyFile, $TestSource)) {
        if (-not (Test-Path -LiteralPath $Required -PathType Leaf)) { throw 'Missing existing connection, dependency list or verification source; runtime initialization is forbidden' }
    }
    if ($Database -notmatch '^hr09_verify_[a-f0-9]{32}$') { throw 'Unsafe verification database name' }
    $AllowedRoot = $ArtifactRoot.TrimEnd('\') + '\'
    if (-not $Scratch.StartsWith($AllowedRoot, [StringComparison]::OrdinalIgnoreCase) -or (Split-Path -Leaf $Scratch) -notmatch '^hr09-db-[a-f0-9]{32}$') { throw 'Unsafe independent compiler directory' }
    $Java = (Get-Command java -ErrorAction Stop).Source
    $Javac = (Get-Command javac -ErrorAction Stop).Source
    $AllDependencies = (Get-Content -LiteralPath $DependencyFile -Raw).Trim().Split([IO.Path]::PathSeparator)
    foreach($DependencyPath in $AllDependencies){if([IO.Path]::GetPathRoot([IO.Path]::GetFullPath($DependencyPath)) -ne 'D:\'){throw 'Current overtime dependency outside data drive'}}
    $Dependencies = @($AllDependencies | Where-Object { [IO.Path]::GetFileName($_) -notmatch '^cloudflow-' -and [IO.Path]::GetExtension($_) -ne '.pom' })
    $SpringCore = @($Dependencies | Where-Object { [IO.Path]::GetFileName($_) -match '^spring-core-.*\.jar$' })
    if ($SpringCore.Count -ne 1) { throw 'Existing dependency list must identify one Spring framework version' }
    $SpringVersion = Split-Path -Leaf (Split-Path -Parent $SpringCore[0])
    $SpringRoot = Split-Path -Parent (Split-Path -Parent (Split-Path -Parent $SpringCore[0]))
    $ProvidedWebSocket = Join-Path $SpringRoot ('spring-websocket/' + $SpringVersion + '/spring-websocket-' + $SpringVersion + '.jar')
    $Dependencies = @(@($Dependencies) + @($ProvidedWebSocket) | Sort-Object -Unique)
    foreach ($Dependency in $Dependencies) {
        if (-not (Test-Path -LiteralPath $Dependency -PathType Leaf) -or [IO.Path]::GetExtension($Dependency) -ne '.jar' -or $Dependency -match '[\\/]target[\\/]') { throw 'Only existing external dependency JARs are allowed' }
    }
    $InternalNames = @($AllDependencies | ForEach-Object { [IO.Path]::GetFileName($_) } | Where-Object { $_ -match '^cloudflow-' })
    $Modules = @(Get-ChildItem -LiteralPath (Join-Path $Backend 'cloudflow-common') -Directory | Where-Object {
        $Prefix = $_.Name + '-'
        $_.Name -eq 'cloudflow-common-static-rules' -or @($InternalNames | Where-Object { $_.StartsWith($Prefix, [StringComparison]::Ordinal) }).Count -gt 0
    })
    $SourceRoots = @((Join-Path $Hr 'src/main/java'))
    $MapperRoots = @((Join-Path $Hr 'src/main/resources/mapper'))
    foreach ($Module in $Modules) {
        $SourceRoot = Join-Path $Module.FullName 'src/main/java'
        $MapperRoot = Join-Path $Module.FullName 'src/main/resources/mapper'
        if (Test-Path -LiteralPath $SourceRoot -PathType Container) { $SourceRoots += $SourceRoot }
        if (Test-Path -LiteralPath $MapperRoot -PathType Container) { $MapperRoots += $MapperRoot }
    }
    $SourceRoots += $FixtureRoot
    $Sources = @($TestSource)
    foreach ($SourceRoot in $SourceRoots) { $Sources += @(Get-ChildItem -LiteralPath $SourceRoot -Recurse -File -Filter '*.java' | Select-Object -ExpandProperty FullName) }
    $Mappers = @()
    foreach ($MapperRoot in $MapperRoots) { $Mappers += @(Get-ChildItem -LiteralPath $MapperRoot -Recurse -File -Filter '*.xml' | Select-Object -ExpandProperty FullName) }
    $FingerprintPaths = @($Sources) + @($Mappers) + @($PSCommandPath, $FixtureXml)
    $Manifest = Get-Fingerprints $FingerprintPaths
    $Fingerprint = Get-TextHash $Manifest
    $Snapshot = Join-Path $Scratch 'snapshot'
    $Classes = Join-Path $Scratch 'classes'
    $Generated = Join-Path $Scratch 'generated'
    foreach ($Directory in @($Scratch, $Snapshot, $Classes, $Generated)) { [IO.Directory]::CreateDirectory($Directory) | Out-Null }
    foreach ($Source in $FingerprintPaths) {
        $Destination = Join-Path $Snapshot $Source.Substring($Workspace.Length + 1)
        [IO.Directory]::CreateDirectory((Split-Path -Parent $Destination)) | Out-Null
        Copy-Item -LiteralPath $Source -Destination $Destination
    }
    foreach ($Entry in (ConvertFrom-Json -InputObject $Manifest)) {
        if ((Get-FileHash -LiteralPath (Join-Path $Snapshot $Entry.path) -Algorithm SHA256).Hash.ToLowerInvariant() -ne $Entry.sha256) { throw 'Copied source snapshot does not match the captured fingerprint' }
    }
    if ((Get-CurrentFingerprints) -ne $Manifest) { throw 'Sources changed during snapshot capture; rerun before database verification' }
    [IO.Directory]::CreateDirectory((Join-Path $Classes 'mapper')) | Out-Null
    Copy-Item -LiteralPath (Join-Path $Snapshot $FixtureXml.Substring($Workspace.Length + 1)) -Destination (Join-Path $Classes 'mapper/FixtureInspectionMapper.xml')
    [IO.File]::WriteAllText((Join-Path $Scratch 'source-fingerprints.json'), $Manifest, $Utf8)
    [IO.File]::WriteAllText((Join-Path $Scratch 'source.sha256'), $Fingerprint, $Utf8)
    $DependencyManifest = @($Dependencies | ForEach-Object { [ordered]@{ name = [IO.Path]::GetFileName($_); sha256 = (Get-FileHash -LiteralPath $_ -Algorithm SHA256).Hash.ToLowerInvariant() } })
    [IO.File]::WriteAllText((Join-Path $Scratch 'dependency-fingerprints.json'), (ConvertTo-Json -InputObject $DependencyManifest -Depth 4), $Utf8)
    $SnapshotSources = @($Sources | ForEach-Object { Join-Path $Snapshot $_.Substring($Workspace.Length + 1) })
    $SnapshotRoots = @($SourceRoots | ForEach-Object { Join-Path $Snapshot $_.Substring($Workspace.Length + 1) })
    $SnapshotMappers = @($MapperRoots | ForEach-Object { Join-Path $Snapshot $_.Substring($Workspace.Length + 1) })
    $ClassPath = $Dependencies -join [IO.Path]::PathSeparator
    $CompileArguments = @('--release', '17', '-encoding', 'UTF-8', '-parameters', '-Xprefer:source', '-cp', (ConvertTo-JavaArgument $ClassPath), '-sourcepath', (ConvertTo-JavaArgument ($SnapshotRoots -join [IO.Path]::PathSeparator)), '-d', (ConvertTo-JavaArgument $Classes), '-s', (ConvertTo-JavaArgument $Generated))
    $CompileArguments += @($SnapshotSources | ForEach-Object { ConvertTo-JavaArgument $_ })
    $CompileFile = Join-Path $Scratch 'compile.args'
    [IO.File]::WriteAllLines($CompileFile, $CompileArguments, $Utf8)
    [IO.File]::WriteAllText((Join-Path $Scratch 'logback.xml'), '<configuration><root level="OFF"/></configuration>', $Utf8)
    Write-Output ('HR09: compiling current HR/common sources=' + $Sources.Count + '; no Maven, target classes, internal JARs or service changes.')
    & $Javac '-J-Duser.language=en' '-J-Duser.country=US' '-J-Dfile.encoding=UTF-8' "@$CompileFile"
    if ($LASTEXITCODE -ne 0) { throw 'HR09 source compilation failed; no database result is claimed' }
    if ((Get-CurrentFingerprints) -ne $Manifest) { throw 'Sources changed during compilation; rerun against current sources' }
    $env:HR09_DB_HOST = '127.0.0.1'
    $env:HR09_DB_PORT = [string]$SourcePort
    $env:HR09_DB_SOURCE = 'cloud_flow_db'
    $env:HR09_DB_TARGET = $Database
    $env:HR09_DB_USERNAME = 'root'
    [Environment]::SetEnvironmentVariable('HR09_DB_PASSWORD',$null,'Process')
    $env:HR09_DB_DATA_DIRECTORY = $SourceDataDirectory
    $env:HR09_DB_OWNER = [Guid]::NewGuid().ToString('N')
    $env:HR09_MAPPER_ROOTS = $SnapshotMappers -join [IO.Path]::PathSeparator
    $env:HR09_REPORT = Join-Path $Scratch 'database-report.json'
    $env:HR09_RACE_ROUNDS = [string]$RaceRounds
    $env:HR09_SOURCE_SHA256 = $Fingerprint
    $env:HR09_SOURCE_COUNT = [string]$Sources.Count
    $RunArguments = @('-Duser.timezone=Asia/Shanghai', '-Dfile.encoding=UTF-8', '-Dsun.stdout.encoding=UTF-8', '-Dsun.stderr.encoding=UTF-8', ('-Dlogback.configurationFile=' + (ConvertTo-JavaArgument (Join-Path $Scratch 'logback.xml'))), '-cp', (ConvertTo-JavaArgument ($Classes + [IO.Path]::PathSeparator + $ClassPath)), 'com.cloudflow.hr.service.Hr09DatabaseChecks')
    $RunFile = Join-Path $Scratch 'run.args'
    [IO.File]::WriteAllLines($RunFile, $RunArguments, $Utf8)
    & $Java "@$RunFile" | Tee-Object -FilePath (Join-Path $Scratch 'console.txt')
    if ($LASTEXITCODE -ne 0) { throw 'HR09 database verification failed; see the sanitized database report' }
    if ((Get-CurrentFingerprints) -ne $Manifest) { throw 'Sources changed during verification; this snapshot cannot certify current sources' }
    [IO.File]::WriteAllText((Join-Path $Scratch 'source-stability.json'), ('{"stable":true,"sha256":"' + $Fingerprint + '"}'), $Utf8)
    Write-Output ('HR09: stable source SHA256=' + $Fingerprint + '; report=' + (Join-Path $Scratch 'database-report.json'))
    $Succeeded = $true
} finally {
    foreach ($EnvironmentName in @(Get-ChildItem Env: | Select-Object -ExpandProperty Name)) {
        if (-not $EnvironmentBefore.ContainsKey($EnvironmentName)) { [Environment]::SetEnvironmentVariable($EnvironmentName, $null, 'Process') }
    }
    foreach ($EnvironmentName in $EnvironmentBefore.Keys) { [Environment]::SetEnvironmentVariable($EnvironmentName, $EnvironmentBefore[$EnvironmentName], 'Process') }
    if (Test-Path -LiteralPath $Scratch) {
        if ($Succeeded -and -not $KeepArtifacts) {
            foreach ($Artifact in @('classes', 'generated', 'snapshot', 'compile.args', 'run.args', 'logback.xml')) { Remove-CheckedArtifact (Join-Path $Scratch $Artifact) }
        }
        Write-Output ('HR09: credential-free evidence retained at ' + $Scratch)
    }
}
