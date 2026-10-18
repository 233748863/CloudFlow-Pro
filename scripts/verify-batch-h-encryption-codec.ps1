param([switch]$WithDatabase, [switch]$KeepArtifacts)

$ErrorActionPreference = 'Stop'
$Workspace = [IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
$Backend = Join-Path $Workspace 'cloudflow-backend'
$Hr = Join-Path $Backend 'cloudflow-service-hr'
$Common = Join-Path $Backend 'cloudflow-common'
$DependencyFile = Join-Path $Hr 'target/batch-g-classpath.txt'
$FixtureRoot = Join-Path $PSScriptRoot 'fixture-checks'
$FixtureXml = Join-Path $FixtureRoot 'mapper/FixtureInspectionMapper.xml'
$Scratch = Join-Path ([IO.Path]::GetTempPath()) ('encrypt-codec-' + [Guid]::NewGuid().ToString('N'))
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
    } finally { $Hasher.Dispose() }
}

try {
    if (-not (Test-Path -LiteralPath $DependencyFile -PathType Leaf)) { throw 'Existing HR classpath is required; service builds are forbidden' }
    $Dependencies = (Get-Content -LiteralPath $DependencyFile -Raw).Trim().Split([IO.Path]::PathSeparator)
    foreach ($Dependency in $Dependencies) {
        if (-not (Test-Path -LiteralPath $Dependency -PathType Leaf)) { throw ('Missing existing dependency: ' + [IO.Path]::GetFileName($Dependency)) }
    }
    $ExistingClasses = @((Join-Path $Hr 'target/classes'))
    if (-not (Test-Path -LiteralPath $ExistingClasses[0] -PathType Container)) { throw 'Existing HR dependency classes are required' }
    foreach ($Module in (Get-ChildItem -LiteralPath $Common -Directory)) {
        $Candidate = Join-Path $Module.FullName 'target/classes'
        if (Test-Path -LiteralPath $Candidate -PathType Container) { $ExistingClasses += $Candidate }
    }
    $Sources = @(Get-ChildItem -LiteralPath (Join-Path $Common 'cloudflow-common-encrypt/src/main/java') -Filter '*.java' -Recurse -File | Select-Object -ExpandProperty FullName)
    foreach ($Relative in @('domain/dto/HrEmployeeCompPayload.java', 'domain/dto/HrTaxProfilePayload.java',
            'domain/dto/HrCompChangePayload.java', 'domain/dto/HrSalarySlipPayload.java', 'domain/dto/HrFieldCodec.java',
            'domain/entity/HrEmployeeComp.java', 'domain/entity/HrTaxProfile.java', 'domain/entity/HrCompChange.java',
            'domain/entity/HrSalarySlip.java', 'mapper/HrEmployeeCompMapper.java', 'mapper/HrTaxProfileMapper.java',
            'service/HrHCipherService.java', 'service/HrHException.java')) {
        $Sources += Join-Path $Hr ('src/main/java/com/cloudflow/hr/' + $Relative)
    }
    $Sources += @(Get-ChildItem -LiteralPath (Join-Path $PSScriptRoot 'encrypt-checks') -Filter '*.java' -Recurse -File | Select-Object -ExpandProperty FullName)
    $Sources += Join-Path $FixtureRoot 'FixtureInspectionSql.java'
    $FingerprintPaths = @($Sources) + @($PSCommandPath, $DependencyFile, $FixtureXml)
    $Fingerprint = Get-SourceFingerprint $FingerprintPaths
    $Classes = Join-Path $Scratch 'classes'
    $Generated = Join-Path $Scratch 'generated'
    $EmptySources = Join-Path $Scratch 'empty-sourcepath'
    foreach ($Directory in @($Classes, $Generated, $EmptySources)) { [IO.Directory]::CreateDirectory($Directory) | Out-Null }
    $Classpath = (@($ExistingClasses) + @($Dependencies)) -join [IO.Path]::PathSeparator
    $CompileArguments = @('-encoding', 'UTF-8', '-parameters', '-implicit:none', '-sourcepath',
        (ConvertTo-JavaArgument $EmptySources), '-cp', (ConvertTo-JavaArgument $Classpath),
        '-d', (ConvertTo-JavaArgument $Classes), '-s', (ConvertTo-JavaArgument $Generated))
    $CompileArguments += @($Sources | ForEach-Object { ConvertTo-JavaArgument $_ })
    $CompileFile = Join-Path $Scratch 'compile.args'
    [IO.File]::WriteAllLines($CompileFile, $CompileArguments, [Text.UTF8Encoding]::new($false))
    $LogConfiguration = Join-Path $Scratch 'logback.xml'
    [IO.File]::WriteAllText($LogConfiguration, '<configuration><root level="OFF"/></configuration>', [Text.UTF8Encoding]::new($false))
    $env:ENCRYPT_CHECK_CLASS_DIR = $Classes
    $env:ENCRYPT_CHECK_DATABASE = '0'
    if ($WithDatabase) {
        $ConnectionFile = Join-Path $Workspace '.cloudflow-runtime/batch-e-runtime/connection.ps1'
        if (-not (Test-Path -LiteralPath $ConnectionFile -PathType Leaf)) { throw 'Protected connection settings are unavailable' }
        . $ConnectionFile
        if (-not $env:DB_USERNAME -or -not $env:DB_PASSWORD) { throw 'Protected database credentials are unavailable' }
        $env:ENCRYPT_CHECK_DATABASE = '1'
        $env:ENCRYPT_CHECK_DB_HOST = '192.168.1.173'
        $env:ENCRYPT_CHECK_DB_PORT = '3306'
        $env:ENCRYPT_CHECK_DB_SOURCE = 'cloud_flow_db'
        $env:ENCRYPT_CHECK_DB_TARGET = 'encrypt_codec_verify_' + [Guid]::NewGuid().ToString('N')
        $env:ENCRYPT_CHECK_DB_OWNER = [Guid]::NewGuid().ToString('N')
        $env:ENCRYPT_CHECK_DB_USERNAME = $env:DB_USERNAME
        $env:ENCRYPT_CHECK_DB_PASSWORD = $env:DB_PASSWORD
    }
    Push-Location $Scratch
    try {
        [IO.Directory]::CreateDirectory((Join-Path $Classes 'mapper')) | Out-Null
        Copy-Item -LiteralPath $FixtureXml -Destination (Join-Path $Classes 'mapper/FixtureInspectionMapper.xml')
        Write-Output ('Codec checks: independently compile ' + $Sources.Count + ' current sources; target and dependency JARs are read-only.')
        & (Get-Command javac -ErrorAction Stop).Source '-J-Dfile.encoding=UTF-8' "@$CompileFile"
        if ($LASTEXITCODE -ne 0) { throw 'Isolated codec compilation failed' }
        if ((Get-SourceFingerprint $FingerprintPaths) -ne $Fingerprint) { throw 'Sources changed during compilation; rerun verification' }
        $RunArguments = @(('-Dlogback.configurationFile=' + (ConvertTo-JavaArgument $LogConfiguration)),
            ('-Djava.io.tmpdir=' + (ConvertTo-JavaArgument $Scratch)), '-cp',
            (ConvertTo-JavaArgument ($Classes + [IO.Path]::PathSeparator + $Classpath)), 'EncryptionCodecChecks')
        $RunFile = Join-Path $Scratch 'run.args'
        [IO.File]::WriteAllLines($RunFile, $RunArguments, [Text.UTF8Encoding]::new($false))
        & (Get-Command java -ErrorAction Stop).Source "@$RunFile"
        if ($LASTEXITCODE -ne 0) { throw 'Encryption codec checks failed; no service deployment was performed' }
        if ((Get-SourceFingerprint $FingerprintPaths) -ne $Fingerprint) { throw 'Sources changed during verification; results do not certify current sources' }
        Write-Output ('Codec checks: stable source SHA256=' + $Fingerprint + '; no Maven, target writes, runtime database writes or service restarts.')
    } finally { Pop-Location }
} finally {
    foreach ($Name in @(Get-ChildItem Env: | Select-Object -ExpandProperty Name)) {
        if (-not $EnvironmentBefore.ContainsKey($Name)) { [Environment]::SetEnvironmentVariable($Name, $null, 'Process') }
    }
    foreach ($Name in $EnvironmentBefore.Keys) { [Environment]::SetEnvironmentVariable($Name, $EnvironmentBefore[$Name], 'Process') }
    if (Test-Path -LiteralPath $Scratch -PathType Container) {
        if ($KeepArtifacts) { Write-Output ('Credential-free compiler artifacts retained at ' + $Scratch) }
        else {
            $Resolved = (Resolve-Path -LiteralPath $Scratch).ProviderPath
            $TempRoot = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\') + '\'
            if (-not $Resolved.StartsWith($TempRoot, [StringComparison]::OrdinalIgnoreCase) -or
                    (Split-Path -Leaf $Resolved) -notmatch '^encrypt-codec-[a-f0-9]{32}$' -or
                    -not $Resolved.Equals([IO.Path]::GetFullPath($Scratch), [StringComparison]::OrdinalIgnoreCase)) {
                throw 'Unsafe temporary cleanup target'
            }
            Remove-Item -LiteralPath $Resolved -Recurse -Force
        }
    }
}
