param([switch]$KeepArtifacts, [string]$IsolatedState = '')

$ErrorActionPreference = 'Stop'
$Workspace = [IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
$Backend = Join-Path $Workspace 'cloudflow-backend'
$ConnectionFile = Join-Path $Workspace '.cloudflow-runtime/batch-e-runtime/connection.ps1'
$CheckRoot = Join-Path $PSScriptRoot 'oa-db-checks'
$FixtureRoot = Join-Path $PSScriptRoot 'fixture-checks'
$FixtureXml = Join-Path $FixtureRoot 'mapper/FixtureInspectionMapper.xml'
$Scratch = Join-Path ([IO.Path]::GetTempPath()) ('oa08-db-' + [Guid]::NewGuid().ToString('N'))
$Database = 'oa08_verify_' + [Guid]::NewGuid().ToString('N')
$EnvironmentBefore = @{}
Get-ChildItem Env: | ForEach-Object { $EnvironmentBefore[$_.Name] = $_.Value }
$Succeeded = $false

function ConvertTo-JavaArgument([string]$Value) {
    if ($Value.Contains('"') -or $Value.Contains([char]10) -or $Value.Contains([char]13)) { throw 'Unsafe Java argument' }
    return '"' + $Value.Replace('\', '/') + '"'
}

function Get-SourceFingerprint([string[]]$Paths) {
    $Hasher = [Security.Cryptography.SHA256]::Create()
    try {
        $Entries = foreach ($SourcePath in ($Paths | Sort-Object -Unique)) {
            [IO.Path]::GetRelativePath($Workspace, $SourcePath).Replace('\', '/') + ':' + (Get-FileHash -LiteralPath $SourcePath -Algorithm SHA256).Hash
        }
        return [BitConverter]::ToString($Hasher.ComputeHash([Text.Encoding]::UTF8.GetBytes(($Entries -join [char]10)))).Replace('-', '').ToLowerInvariant()
    } finally {
        $Hasher.Dispose()
    }
}

try {
    $Java = (Get-Command java -ErrorAction Stop).Source
    $Javac = (Get-Command javac -ErrorAction Stop).Source
    $DependencyName = 'batch-g-classpath.txt'
    $LocalDirectory = $null
    if ($IsolatedState) {
        $StateFile = (Resolve-Path -LiteralPath $IsolatedState).ProviderPath
        $Run = Split-Path -Parent $StateFile
        $Runtime = [IO.Path]::GetFullPath((Join-Path $Workspace '.cloudflow-runtime/batch-g-integration'))
        if ((Split-Path -Parent $Run) -ne $Runtime -or (Split-Path -Leaf $Run) -notmatch '^[a-f0-9]{32}$' -or (Split-Path -Leaf $StateFile) -ne 'state.json') { throw 'Owned isolated integration state required' }
        $LocalDirectory = (Resolve-Path -LiteralPath (Join-Path $Run 'mysql-data')).ProviderPath
        foreach ($Candidate in @($Runtime, $Run, $StateFile, $LocalDirectory)) {
            if ((Get-Item -LiteralPath $Candidate).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Redirected isolated database path refused' }
        }
        $State = Get-Content -LiteralPath $StateFile -Raw -Encoding UTF8 | ConvertFrom-Json
        if ($State.status -ne 'RUNNING' -or [IO.Path]::GetFullPath($State.run) -ne $Run -or $State.mysqlPort -le 1024 -or $State.mysqlPort -ge 65536) { throw 'Running loopback-only isolated database required' }
        $Owned = @($State.processes | Where-Object name -EQ 'mysql')
        if ($Owned.Count -ne 1) { throw 'Unique owned MySQL process required' }
        $Process = Get-CimInstance Win32_Process -Filter "ProcessId = $($Owned[0].id)"
        if (-not $Process -or $Process.Name -ne 'mysqld.exe' -or -not $Process.CommandLine.Contains($LocalDirectory)) { throw 'Owned MySQL identity mismatch' }
        $Listeners = @(Get-NetTCPConnection -State Listen -LocalPort $State.mysqlPort -ErrorAction Stop)
        if ($Listeners.Count -ne 1 -or $Listeners[0].LocalAddress -ne '127.0.0.1') { throw 'Unique loopback MySQL listener required' }
        $Serving = Get-CimInstance Win32_Process -Filter "ProcessId = $($Listeners[0].OwningProcess)"
        if (-not $Serving -or $Serving.Name -ne 'mysqld.exe' -or -not $Serving.CommandLine.Contains($LocalDirectory) -or
            ($Serving.ProcessId -ne $Process.ProcessId -and $Serving.ParentProcessId -ne $Process.ProcessId)) { throw 'Owned MySQL listener process required' }
        $DatabaseServer = '127.0.0.1'; $DatabasePort = $State.mysqlPort; $DatabaseName = 'cloud_flow_db'
        $env:DB_USERNAME = 'root'; $env:DB_PASSWORD = ''
        $DependencyName = 'batch-f-classpath.txt'
    } else {
        if (-not (Test-Path -LiteralPath $ConnectionFile -PathType Leaf)) { throw 'Existing runtime connection file is required; initialization is forbidden' }
        try { . $ConnectionFile *> $null }
        catch { throw 'Existing runtime connection could not be loaded; details redacted' }
        if ($env:DB_URL -notmatch '^jdbc:mysql://(?<host>192\.168\.1\.173):(?<port>3306)/(?<database>cloud_flow_db)(?:\?.*)?$') { throw 'Runtime JDBC target changed; refusing verification' }
        $DatabaseServer = $Matches.host
        $DatabasePort = [int]$Matches.port
        $DatabaseName = $Matches.database
        if ($DatabaseServer -ne '192.168.1.173' -or $DatabasePort -ne 3306 -or $DatabaseName -ne 'cloud_flow_db') { throw 'Unexpected runtime connection target' }
        if (-not $env:DB_USERNAME -or -not $env:DB_PASSWORD) { throw 'Existing runtime credentials are unavailable' }
    }
    if ($Database -notmatch '^oa08_verify_[a-f0-9]{32}$' -or $Database -eq $DatabaseName) { throw 'Unsafe verification database name' }
    $ApplicationModules = @('cloudflow-service-oa', 'cloudflow-auth')
    $Dependencies = @()
    foreach ($ModuleName in $ApplicationModules) {
        $DependencyFile = Join-Path $Backend ($ModuleName + '/target/' + $DependencyName)
        if (-not (Test-Path -LiteralPath $DependencyFile -PathType Leaf)) { throw ('Existing dependency list missing for ' + $ModuleName + '; Maven is forbidden') }
        $Dependencies += (Get-Content -LiteralPath $DependencyFile -Raw).Trim().Split([IO.Path]::PathSeparator)
    }
    $Dependencies = @($Dependencies | Sort-Object -Unique)
    $DependencyNames = @($Dependencies | ForEach-Object { [IO.Path]::GetFileName($_) })
    $CommonModules = @(Get-ChildItem -LiteralPath (Join-Path $Backend 'cloudflow-common') -Directory | Where-Object {
        $Pattern = '^' + [Regex]::Escape($_.Name) + '-[0-9].*\.jar$'
        $ClassesPattern = '[/\\]' + [Regex]::Escape($_.Name) + '[/\\]target[/\\]classes$'
        @($DependencyNames | Where-Object { $_ -match $Pattern }).Count -gt 0 -or @($Dependencies | Where-Object { $_ -match $ClassesPattern }).Count -gt 0
    })
    $Modules = @($ApplicationModules | ForEach-Object { Get-Item -LiteralPath (Join-Path $Backend $_) }) + $CommonModules
    $ExternalDependencies = @($Dependencies | Where-Object { [IO.Path]::GetFileName($_) -notmatch '^cloudflow-' -and [IO.Path]::GetExtension($_) -eq '.jar' })
    foreach ($Dependency in $ExternalDependencies) {
        if (-not (Test-Path -LiteralPath $Dependency -PathType Leaf) -or [IO.Path]::GetExtension($Dependency) -ne '.jar') { throw ('Missing external dependency: ' + [IO.Path]::GetFileName($Dependency)) }
    }
    $CompileSources = @(Get-ChildItem -LiteralPath $CheckRoot -Recurse -Filter '*.java' -File | Select-Object -ExpandProperty FullName)
    $CompileSources += Join-Path $FixtureRoot 'FixtureInspectionSql.java'
    if ($CompileSources.Count -lt 2) { throw 'OA database check sources are incomplete' }
    $FingerprintPaths = @($CompileSources) + @($PSCommandPath, $FixtureXml)
    $MapperPaths = @()
    $SourceRoots = @($CheckRoot, $FixtureRoot)
    foreach ($Module in $Modules) {
        $SourceRoot = Join-Path $Module.FullName 'src/main/java'
        if (-not (Test-Path -LiteralPath $SourceRoot -PathType Container)) {
            if ($Module.Name -eq 'cloudflow-common-config-secret') { continue }
            throw ('Latest source root missing for ' + $Module.Name)
        }
        $SourceRoots += $SourceRoot
        $Sources = @(Get-ChildItem -LiteralPath $SourceRoot -Recurse -Filter '*.java' -File | Select-Object -ExpandProperty FullName)
        $CompileSources += $Sources
        $FingerprintPaths += $Sources
        $MapperRoot = Join-Path $Module.FullName 'src/main/resources/mapper'
        if (Test-Path -LiteralPath $MapperRoot -PathType Container) {
            $MapperPaths += @(Get-ChildItem -LiteralPath $MapperRoot -Recurse -Filter '*.xml' -File | Select-Object -ExpandProperty FullName)
        }
    }
    $FingerprintPaths += $MapperPaths
    $Fingerprint = Get-SourceFingerprint $FingerprintPaths
    $Classes = Join-Path $Scratch 'classes'
    $Generated = Join-Path $Scratch 'generated'
    [IO.Directory]::CreateDirectory($Classes) | Out-Null
    [IO.Directory]::CreateDirectory($Generated) | Out-Null
    [IO.Directory]::CreateDirectory((Join-Path $Classes 'mapper')) | Out-Null
    Copy-Item -LiteralPath $FixtureXml -Destination (Join-Path $Classes 'mapper/FixtureInspectionMapper.xml')
    $MapperCopies = @()
    foreach ($Mapper in $MapperPaths) {
        $Relative = [IO.Path]::GetRelativePath($Backend, $Mapper)
        $Destination = Join-Path (Join-Path $Scratch 'mapper-snapshot') $Relative
        [IO.Directory]::CreateDirectory((Split-Path -Parent $Destination)) | Out-Null
        Copy-Item -LiteralPath $Mapper -Destination $Destination
        $MapperCopies += $Destination
    }
    $MapperList = Join-Path $Scratch 'mapper-files.txt'
    [IO.File]::WriteAllLines($MapperList, $MapperCopies, [Text.UTF8Encoding]::new($false))
    $ClassPath = $ExternalDependencies -join [IO.Path]::PathSeparator
    $CompileArguments = @('-encoding', 'UTF-8', '-parameters', '-Xprefer:source', '-cp', (ConvertTo-JavaArgument $ClassPath), '-sourcepath', (ConvertTo-JavaArgument ($SourceRoots -join [IO.Path]::PathSeparator)), '-d', (ConvertTo-JavaArgument $Classes), '-s', (ConvertTo-JavaArgument $Generated))
    $CompileArguments += @($CompileSources | Sort-Object -Unique | ForEach-Object { ConvertTo-JavaArgument $_ })
    $CompileFile = Join-Path $Scratch 'compile.args'
    [IO.File]::WriteAllLines($CompileFile, $CompileArguments, [Text.UTF8Encoding]::new($false))
    $LogConfiguration = Join-Path $Scratch 'logback.xml'
    [IO.File]::WriteAllText($LogConfiguration, '<configuration><root level="OFF"/></configuration>', [Text.UTF8Encoding]::new($false))
    Write-Output ('OA08 COMPILE: latest-java=' + $CompileSources.Count + '; mapper-xml=' + $MapperPaths.Count + '; no Maven, old target classes, internal project jars, service restart or runtime initialization.')
    Write-Output ('OA08 SOURCE: SHA256=' + $Fingerprint)
    Push-Location $Scratch
    try {
        & $Javac '-J-Duser.language=en' '-J-Duser.country=US' '-J-Dfile.encoding=UTF-8' "@$CompileFile" *> (Join-Path $Scratch 'compile.log')
        if ($LASTEXITCODE -ne 0) { throw 'OA08 javac failed; database tests were not started; inspect local compiler artifacts' }
        if ((Get-SourceFingerprint $FingerprintPaths) -ne $Fingerprint) { throw 'Latest sources changed during compilation; no database success claimed' }
        $env:OA08_DB_HOST = $DatabaseServer
        $env:OA08_DB_PORT = [string]$DatabasePort
        $env:OA08_DB_SOURCE = $DatabaseName
        $env:OA08_DB_TARGET = $Database
        $env:OA08_DB_USERNAME = $env:DB_USERNAME
        $env:OA08_DB_PASSWORD = $env:DB_PASSWORD
        $env:OA08_DB_DIRECTORY = $LocalDirectory
        $env:OA08_DB_RUNTIME = if ($LocalDirectory) { $Runtime } else { $null }
        $env:OA08_DB_OWNER = [Guid]::NewGuid().ToString('N')
        $env:OA08_MAPPER_FILES = $MapperList
        $env:OA08_COMPILED_CLASSES = $Classes
        $env:OA08_SOURCE_SHA256 = $Fingerprint
        $RunArguments = @('-Duser.timezone=Asia/Shanghai', '-Dfile.encoding=UTF-8', ('-Dlogback.configurationFile=' + (ConvertTo-JavaArgument $LogConfiguration)), '-cp', (ConvertTo-JavaArgument ($Classes + [IO.Path]::PathSeparator + $ClassPath)), 'OaConsumableDatabaseChecks')
        $RunFile = Join-Path $Scratch 'run.args'
        [IO.File]::WriteAllLines($RunFile, $RunArguments, [Text.UTF8Encoding]::new($false))
        & $Java "@$RunFile"
        $CheckExit = $LASTEXITCODE
        if ((Get-SourceFingerprint $FingerprintPaths) -ne $Fingerprint) { throw 'Sources changed during execution; results belong to the printed compiled fingerprint and require rerunning' }
        Write-Output ('OA08 SOURCE: stable SHA256=' + $Fingerprint + '; credentials and inventory payloads excluded from reports.')
        if ($CheckExit -ne 0) { throw 'OA08 strict database acceptance has failures; see the redacted group summary' }
        $Succeeded = $true
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
    if (Test-Path -LiteralPath $Scratch) {
        if ($Succeeded -and -not $KeepArtifacts) {
            $ResolvedScratch = (Resolve-Path -LiteralPath $Scratch).ProviderPath
            $TempRoot = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\') + '\'
            if (-not $ResolvedScratch.StartsWith($TempRoot, [StringComparison]::OrdinalIgnoreCase) -or (Split-Path -Leaf $ResolvedScratch) -notmatch '^oa08-db-[a-f0-9]{32}$') { throw 'Unsafe compiler artifact cleanup path' }
            Remove-Item -LiteralPath $ResolvedScratch -Recurse -Force
            Write-Output 'OA08 ARTIFACTS: temporary compilation directory removed.'
        } else {
            Write-Output ('OA08 ARTIFACTS: credential-free compilation files retained at ' + $Scratch)
        }
    }
}
