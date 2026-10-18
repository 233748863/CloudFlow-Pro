param([switch]$KeepArtifacts, [string]$StatePath)

$ErrorActionPreference = 'Stop'
$Workspace = [IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
$Backend = Join-Path $Workspace 'cloudflow-backend'
$Workflow = Join-Path $Backend 'cloudflow-service-workflow'
$ConnectionFile = Join-Path $Workspace '.cloudflow-runtime/batch-e-runtime/connection.ps1'
$DependencyFile = Join-Path $Workflow 'target/batch-h-classpath.txt'
$TestSource = Join-Path $PSScriptRoot 'workflow-checks/WorkflowDraftDatabaseChecks.java'
$FixtureRoot = Join-Path $PSScriptRoot 'fixture-checks'
$Scratch = Join-Path ([IO.Path]::GetTempPath()) ('wf11-draft-db-' + [Guid]::NewGuid().ToString('N'))
$Database = 'wf11_draft_verify_' + [Guid]::NewGuid().ToString('N')
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
            $SourcePath + ':' + (Get-FileHash -LiteralPath $SourcePath -Algorithm SHA256).Hash
        }
        return [BitConverter]::ToString($Hasher.ComputeHash([Text.Encoding]::UTF8.GetBytes(($Entries -join [char]10)))).Replace('-', '').ToLowerInvariant()
    } finally {
        $Hasher.Dispose()
    }
}

try {
    foreach ($RequiredFile in @($DependencyFile, $TestSource)) {
        if (-not (Test-Path -LiteralPath $RequiredFile -PathType Leaf)) { throw 'Missing existing connection, dependency list or test source; no runtime initialization is allowed' }
    }
    $Java = (Get-Command java -ErrorAction Stop).Source
    $Javac = (Get-Command javac -ErrorAction Stop).Source
    if ($StatePath) {
        $StatePath = (Resolve-Path -LiteralPath $StatePath).Path
        $Run = Split-Path -Parent $StatePath
        $Allowed = (Resolve-Path -LiteralPath (Join-Path $Workspace '.cloudflow-runtime/batch-g-integration')).Path
        if ((Split-Path -Parent $Run) -ne $Allowed -or (Split-Path -Leaf $Run) -notmatch '^[a-f0-9]{32}$' -or (Split-Path -Leaf $StatePath) -ne 'state.json') { throw 'Draft source is outside the owned integration workspace' }
        $State = Get-Content -LiteralPath $StatePath -Raw | ConvertFrom-Json
        if ([IO.Path]::GetFullPath($State.run) -ne $Run -or $State.status -ne 'RUNNING' -or $State.mysqlPort -le 1024 -or $State.mysqlPort -ge 65536) { throw 'Draft source is not a running owned MySQL' }
        $DatabaseServer = '127.0.0.1'
        $DatabasePort = $State.mysqlPort
        $DatabaseName = 'cloud_flow_db'
        $env:DB_USERNAME = 'root'
        $env:DB_PASSWORD = ''
        $env:WF11_OWNED_DATA = (Resolve-Path -LiteralPath (Join-Path $Run 'mysql-data')).Path
    } else {
        . $ConnectionFile *> $null
        if ($env:DB_URL -notmatch '^jdbc:mysql://(?<host>192\.168\.1\.173):(?<port>3306)/(?<database>cloud_flow_db)(?:\?.*)?$') { throw 'Runtime JDBC target changed; refusing verification' }
        $DatabaseServer = $Matches.host
        $DatabasePort = [int]$Matches.port
        $DatabaseName = $Matches.database
        if ($DatabaseServer -ne '192.168.1.173' -or $DatabasePort -ne 3306 -or $DatabaseName -ne 'cloud_flow_db') { throw 'Runtime connection target changed; refusing verification' }
        if (-not $env:DB_USERNAME -or -not $env:DB_PASSWORD) { throw 'Existing runtime credentials are unavailable' }
        Remove-Item Env:WF11_OWNED_DATA -ErrorAction SilentlyContinue
    }
    if ($Database -notmatch '^wf11_draft_verify_[a-f0-9]{32}$' -or $Database -eq $DatabaseName) { throw 'Unsafe verification database name' }
    $Dependencies = (Get-Content -LiteralPath $DependencyFile -Raw).Trim().Split([IO.Path]::PathSeparator)
    foreach ($Dependency in $Dependencies) {
        if (-not (Test-Path -LiteralPath $Dependency -PathType Leaf)) { throw ('Missing existing dependency: ' + [IO.Path]::GetFileName($Dependency)) }
    }
    $DependencyNames = @($Dependencies | ForEach-Object { [IO.Path]::GetFileName($_) })
    $Modules = @(Get-ChildItem -LiteralPath (Join-Path $Backend 'cloudflow-common') -Directory | Where-Object {
        $ModulePrefix = $_.Name + '-'
        @($DependencyNames | Where-Object { $_.StartsWith($ModulePrefix, [StringComparison]::Ordinal) }).Count -gt 0
    })
    $SourceRoots = @((Join-Path $Workflow 'src/main/java'), $FixtureRoot)
    $Resources = @((Join-Path $Workflow 'src/main/resources'), $FixtureRoot)
    $ExistingClasses = @((Join-Path $Workflow 'target/classes'))
    foreach ($Module in $Modules) {
        foreach ($Pair in @(@('src/main/java', 'source'), @('src/main/resources', 'resource'), @('target/classes', 'classes'))) {
            $Candidate = Join-Path $Module.FullName $Pair[0]
            if (Test-Path -LiteralPath $Candidate -PathType Container) {
                switch ($Pair[1]) {
                    'source' { $SourceRoots += $Candidate }
                    'resource' { $Resources += $Candidate }
                    'classes' { $ExistingClasses += $Candidate }
                }
            }
        }
    }
    $CompileSources = @()
    $FingerprintPaths = @($TestSource, $PSCommandPath)
    foreach ($SourceRoot in $SourceRoots) {
        $ModuleSources = @(Get-ChildItem -LiteralPath $SourceRoot -Filter '*.java' -Recurse -File | Select-Object -ExpandProperty FullName)
        $FingerprintPaths += $ModuleSources
        $CompileSources += $ModuleSources
    }
    foreach ($ResourceRoot in $Resources) {
        $MapperRoot = Join-Path $ResourceRoot 'mapper'
        if (Test-Path -LiteralPath $MapperRoot) {
            $FingerprintPaths += @(Get-ChildItem -LiteralPath $MapperRoot -Filter '*.xml' -Recurse -File | Select-Object -ExpandProperty FullName)
        }
    }
    $Fingerprint = Get-SourceFingerprint $FingerprintPaths
    $Classes = Join-Path $Scratch 'classes'
    $Generated = Join-Path $Scratch 'generated'
    [IO.Directory]::CreateDirectory($Classes) | Out-Null
    [IO.Directory]::CreateDirectory($Generated) | Out-Null
    $ClassPath = (@($Resources) + @($ExistingClasses) + @($Dependencies)) -join [IO.Path]::PathSeparator
    $CompileArguments = @('-encoding', 'UTF-8', '-parameters', '-Xprefer:source', '-cp', (ConvertTo-JavaArgument $ClassPath), '-sourcepath', (ConvertTo-JavaArgument ($SourceRoots -join [IO.Path]::PathSeparator)), '-d', (ConvertTo-JavaArgument $Classes), '-s', (ConvertTo-JavaArgument $Generated))
    $CompileArguments += @(@($TestSource) + $CompileSources | ForEach-Object { ConvertTo-JavaArgument $_ })
    $CompileFile = Join-Path $Scratch 'compile.args'
    [IO.File]::WriteAllLines($CompileFile, $CompileArguments, [Text.UTF8Encoding]::new($false))
    $LogConfiguration = Join-Path $Scratch 'logback.xml'
    [IO.File]::WriteAllText($LogConfiguration, '<configuration><root level="OFF"/></configuration>', [Text.UTF8Encoding]::new($false))
    Write-Output 'WF11: compile current Java sources into an independent temporary directory; Maven/build outputs/services remain untouched.'
    Push-Location $Scratch
    try {
        & $Javac '-J-Duser.language=en' '-J-Duser.country=US' '-J-Dfile.encoding=UTF-8' "@$CompileFile"
        if ($LASTEXITCODE -ne 0) { throw 'WF11 javac failed; no database verification was claimed' }
        if ((Get-SourceFingerprint $FingerprintPaths) -ne $Fingerprint) { throw 'Sources changed during compilation; rerun against a stable source snapshot' }
        $env:WF11_DB_HOST = $DatabaseServer
        $env:WF11_DB_PORT = [string]$DatabasePort
        $env:WF11_DB_SOURCE = $DatabaseName
        $env:WF11_DB_TARGET = $Database
        $env:WF11_DB_USERNAME = $env:DB_USERNAME
        $env:WF11_DB_PASSWORD = $env:DB_PASSWORD
        $env:WF11_DB_OWNER = [Guid]::NewGuid().ToString('N')
        $MapperRoots = @($Resources | ForEach-Object { Join-Path $_ 'mapper' } |
            Where-Object { Test-Path -LiteralPath $_ -PathType Container } | Sort-Object -Unique)
        $env:WF11_MAPPER_ROOTS = $MapperRoots -join [IO.Path]::PathSeparator
        $RunArguments = @('-Duser.timezone=Asia/Shanghai', ('-Dlogback.configurationFile=' + (ConvertTo-JavaArgument $LogConfiguration)), '-cp', (ConvertTo-JavaArgument ($Classes + [IO.Path]::PathSeparator + $ClassPath)), 'WorkflowDraftDatabaseChecks')
        $RunFile = Join-Path $Scratch 'run.args'
        [IO.File]::WriteAllLines($RunFile, $RunArguments, [Text.UTF8Encoding]::new($false))
        & $Java "@$RunFile"
        if ($LASTEXITCODE -ne 0) { throw 'WF11 isolated database checks failed; inspect the credential-free summary' }
        if ((Get-SourceFingerprint $FingerprintPaths) -ne $Fingerprint) { throw 'Sources changed while tests ran; results belong to the compiled snapshot and require rerunning' }
        Write-Output ('WF11: stable source SHA256=' + $Fingerprint + '; credentials were never written to arguments or reports.')
        $Succeeded = $true
    } finally {
        Pop-Location
    }
} finally {
    $CurrentNames = @(Get-ChildItem Env: | Select-Object -ExpandProperty Name)
    foreach ($EnvironmentName in $CurrentNames) {
        if (-not $EnvironmentBefore.ContainsKey($EnvironmentName)) { [Environment]::SetEnvironmentVariable($EnvironmentName, $null, 'Process') }
    }
    foreach ($EnvironmentName in $EnvironmentBefore.Keys) {
        [Environment]::SetEnvironmentVariable($EnvironmentName, $EnvironmentBefore[$EnvironmentName], 'Process')
    }
    if (Test-Path -LiteralPath $Scratch) {
        if ($Succeeded -and -not $KeepArtifacts) {
            $ResolvedScratch = (Resolve-Path -LiteralPath $Scratch).ProviderPath
            $TempRoot = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\') + '\'
            if (-not $ResolvedScratch.StartsWith($TempRoot, [StringComparison]::OrdinalIgnoreCase) -or (Split-Path -Leaf $ResolvedScratch) -notmatch '^wf11-draft-db-[a-f0-9]{32}$') { throw 'Unsafe temporary cleanup target' }
            Remove-Item -LiteralPath $ResolvedScratch -Recurse -Force
        } else {
            Write-Output ('WF11: credential-free compiler artifacts retained at ' + $Scratch)
        }
    }
}
