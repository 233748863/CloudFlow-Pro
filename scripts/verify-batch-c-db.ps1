param()

$ErrorActionPreference = 'Stop'
$Workspace = [IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
$Module = Join-Path $Workspace 'cloudflow-backend/cloudflow-service-workflow'
$Output = Join-Path $Workspace '.cloudflow-runtime/full-prd-20260915/form-checks'
$ConnectionFile = Join-Path $Workspace '.cloudflow-runtime/batch-e-runtime/connection.ps1'
$ClasspathFile = Join-Path $Module 'target/batch-c-classpath.txt'
if (-not (Test-Path -LiteralPath $ClasspathFile)) { $ClasspathFile = Join-Path $Module 'target/batch-h-classpath.txt' }
$EnvironmentBefore = @{}
Get-ChildItem Env: | ForEach-Object { $EnvironmentBefore[$_.Name] = $_.Value }

function Get-CurrentSourceHash {
    $Files = @((Join-Path $Workspace 'cloudflow-backend/DB/01.cloudflow-common.sql'), (Join-Path $Workspace 'cloudflow-backend/DB/02.cloudflow-workflow.sql'), $PSCommandPath)
    foreach ($Directory in @((Join-Path $Module 'src/main'), (Join-Path $PSScriptRoot 'form-checks'))) {
        $Files += @(Get-ChildItem -LiteralPath $Directory -Recurse -File | Where-Object { $_.Extension -in @('.java', '.xml') } | Select-Object -ExpandProperty FullName)
    }
    $Content = ($Files | Sort-Object -Unique | ForEach-Object { $_ + ':' + (Get-FileHash -LiteralPath $_ -Algorithm SHA256).Hash }) -join "`n"
    $Hasher = [Security.Cryptography.SHA256]::Create()
    try { return [BitConverter]::ToString($Hasher.ComputeHash([Text.Encoding]::UTF8.GetBytes($Content))).Replace('-', '').ToLowerInvariant() }
    finally { $Hasher.Dispose() }
}

try {
    if (-not (Test-Path -LiteralPath $ConnectionFile) -or -not (Test-Path -LiteralPath $ClasspathFile)) { throw 'Missing existing connection or compiled dependency list' }
    $Fingerprint = Get-CurrentSourceHash
    & (Join-Path $PSScriptRoot 'verify-batch-c.ps1') -SkipBuild -SkipFrontend
    if ($LASTEXITCODE -ne 0) { throw 'C current-source checks failed before database access' }
    if ((Get-CurrentSourceHash) -ne $Fingerprint) { throw 'Sources changed during compilation; rerun verification' }
    . $ConnectionFile
    $ConnectionMatch = [regex]::Match($env:DB_URL, '^jdbc:mysql://(?<host>[^:/?#]+):(?<port>[0-9]+)/(?<database>[^?/#]+)(?:\?.*)?$')
    if (-not $ConnectionMatch.Success -or $ConnectionMatch.Groups['host'].Value -ne '192.168.1.173' -or
        [int]$ConnectionMatch.Groups['port'].Value -ne 3306 -or $ConnectionMatch.Groups['database'].Value -ne 'cloud_flow_db' -or
        -not $env:DB_USERNAME -or -not $env:DB_PASSWORD) { throw 'Unexpected runtime credential source' }
    $DatabaseServer = $ConnectionMatch.Groups['host'].Value
    $DatabasePort = [int]$ConnectionMatch.Groups['port'].Value
    $env:C4_DB_HOST = $DatabaseServer
    $env:C4_DB_PORT = [string]$DatabasePort
    $env:C4_DB_TARGET = 'wf_c4_verify_' + [Guid]::NewGuid().ToString('N')
    $env:C4_DB_OWNER = [Guid]::NewGuid().ToString('N')
    [IO.File]::WriteAllText((Join-Path $Output 'c4-db-ownership.json'), (@{ database = $env:C4_DB_TARGET; owner = $env:C4_DB_OWNER } | ConvertTo-Json), [Text.UTF8Encoding]::new($false))
    $env:C4_DDL_ROOT = Join-Path $Workspace 'cloudflow-backend/DB'
    $env:C4_MAPPER_ROOT = Join-Path $Module 'src/main/resources/mapper'
    $Dependencies = (Get-Content -LiteralPath $ClasspathFile -Raw).Trim()
    $Classpath = $Output + [IO.Path]::PathSeparator + (Join-Path $Module 'src/main/resources') + [IO.Path]::PathSeparator + (Join-Path $Module 'target/classes') + [IO.Path]::PathSeparator + $Dependencies
    $LogConfiguration = Join-Path $Output 'c4-db-logback.xml'
    [IO.File]::WriteAllText($LogConfiguration, '<configuration><root level="OFF"/></configuration>', [Text.UTF8Encoding]::new($false))
    $ArgumentsFile = Join-Path $Output 'c4-db-run.args'
    [IO.File]::WriteAllLines($ArgumentsFile, @('-Dfile.encoding=UTF-8', '-Dstdout.encoding=UTF-8', '-Dstderr.encoding=UTF-8', '-Duser.timezone=Asia/Shanghai', ('"-Dlogback.configurationFile=' + $LogConfiguration.Replace('\', '/') + '"'), '-cp', ('"' + $Classpath.Replace('\', '/') + '"'), 'FormVersionDatabaseChecks'), [Text.UTF8Encoding]::new($false))
    & java "@$ArgumentsFile"
    if ($LASTEXITCODE -ne 0) { throw 'C4 isolated database verification failed' }
    if ((Get-CurrentSourceHash) -ne $Fingerprint) { throw 'Sources changed while database checks ran; evidence must be rerun' }
    Write-Output ('C4_SOURCE_SHA256=' + $Fingerprint)
    Write-Output 'PASS C4 database verification; credentials were not written to arguments or evidence'
} finally {
    foreach ($Name in @(Get-ChildItem Env: | Select-Object -ExpandProperty Name)) {
        if (-not $EnvironmentBefore.ContainsKey($Name)) { [Environment]::SetEnvironmentVariable($Name, $null, 'Process') }
    }
    foreach ($Name in $EnvironmentBefore.Keys) { [Environment]::SetEnvironmentVariable($Name, $EnvironmentBefore[$Name], 'Process') }
}
