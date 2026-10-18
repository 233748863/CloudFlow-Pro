param([switch]$SkipBuild, [string]$JdbcUrl = '', [switch]$MigrationRehearsal, [switch]$MeetingChecks, [switch]$AssetPerformance,
    [switch]$SupplierChecks, [string]$SupplierResultPath = '', [switch]$ProjectPersistenceChecks, [string]$ProjectResultPath = '', [switch]$RfqChecks, [string]$RfqResultPath = '')

$ErrorActionPreference = 'Stop'
if ($MigrationRehearsal -and -not $JdbcUrl) { throw 'Migration rehearsal requires an isolated JDBC URL' }
if ($MeetingChecks -and (-not $JdbcUrl -or $MigrationRehearsal)) { throw 'Meeting checks require their isolated JDBC URL and cannot use migration mode' }
if ($AssetPerformance -and (-not $JdbcUrl -or $MigrationRehearsal -or $MeetingChecks)) { throw 'Asset performance requires isolated OA database checks' }
if ($SupplierChecks -and (-not $JdbcUrl -or -not $SupplierResultPath -or $MigrationRehearsal -or $MeetingChecks -or $AssetPerformance -or $ProjectPersistenceChecks -or $RfqChecks)) { throw 'Supplier checks require their isolated database and separate result path' }
if ($RfqChecks -and (-not $JdbcUrl -or -not $RfqResultPath -or $MigrationRehearsal -or $MeetingChecks -or $AssetPerformance -or $ProjectPersistenceChecks -or $SupplierChecks)) { throw 'RFQ checks require their isolated database and result path' }
if ($ProjectPersistenceChecks -and (-not $JdbcUrl -or -not $ProjectResultPath -or $MigrationRehearsal -or $MeetingChecks -or $AssetPerformance -or $SupplierChecks -or $RfqChecks)) { throw 'Project persistence checks require their isolated database and result path' }
$Root = Split-Path -Parent $PSScriptRoot
$Backend = Join-Path $Root 'cloudflow-backend'
$Module = Join-Path $Backend 'cloudflow-service-oa'
if (-not $SkipBuild) {
    Push-Location $Backend
    try {
        $Modules = if ($MeetingChecks) { 'cloudflow-service-oa,cloudflow-service-crm,cloudflow-auth' } else { 'cloudflow-service-oa' }
        & mvn -q -pl $Modules -am '-DskipTests' compile dependency:build-classpath '-Dmdep.outputFile=target/batch-f-classpath.txt'
        if ($LASTEXITCODE -ne 0) { throw 'OA compilation failed' }
    } finally { Pop-Location }
}
$Dependencies = (Get-Content -LiteralPath (Join-Path $Module 'target/batch-f-classpath.txt') -Raw).Trim()
$CommonModules = @(Get-ChildItem -LiteralPath (Join-Path $Backend 'cloudflow-common') -Directory | Where-Object { Test-Path -LiteralPath (Join-Path $_.FullName 'target/classes') })
$CommonClasses = @($CommonModules | ForEach-Object { Join-Path $_.FullName 'target/classes' })
$DependencyPaths = @($Dependencies.Split([IO.Path]::PathSeparator) | Where-Object { $_.Replace('\', '/') -notmatch '/cloudflow-common/[^/]+/target/classes/?$' })
foreach ($CommonModule in $CommonModules) {
    $DependencyPaths = @($DependencyPaths | Where-Object { [IO.Path]::GetFileName($_) -notlike "$($CommonModule.Name)-*.jar" })
}
$ClassPath = (@((Join-Path $Module 'target/classes')) + $CommonClasses + $DependencyPaths) -join [IO.Path]::PathSeparator
if ($MeetingChecks) {
    foreach ($Extra in @('cloudflow-service-crm', 'cloudflow-auth')) {
        $ExtraModule = Join-Path $Backend $Extra
        $ClassPath += [IO.Path]::PathSeparator + (Join-Path $ExtraModule 'target/classes') + [IO.Path]::PathSeparator +
            (Get-Content -LiteralPath (Join-Path $ExtraModule 'target/batch-f-classpath.txt') -Raw).Trim()
    }
}
$ClasspathEntries = @($ClassPath.Split([IO.Path]::PathSeparator) | Where-Object {
    [IO.Path]::GetFileName($_) -notlike 'cloudflow-common-*.jar'
} | Select-Object -Unique)
foreach ($Entry in $ClasspathEntries) {
    if (-not (Test-Path -LiteralPath $Entry)) { throw 'Missing OA verification dependency; regenerate the classpath' }
    if ($Entry -match '[/\\]target[/\\]classes[/\\]?$' -and
        -not [IO.Path]::GetFullPath($Entry).StartsWith($Root + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
        throw 'OA verification dependency references another workspace; regenerate the classpath'
    }
}
$ClassPath = $ClasspathEntries -join [IO.Path]::PathSeparator
$Output = Join-Path $Module 'target/batch-f-checks'
[IO.Directory]::CreateDirectory($Output) | Out-Null
$Sources = @(Get-ChildItem -LiteralPath (Join-Path $PSScriptRoot 'oa-checks') -Filter '*.java' -File | Select-Object -ExpandProperty FullName)
if (-not $MeetingChecks) { $Sources = @($Sources | Where-Object { [IO.Path]::GetFileName($_) -ne 'OaMeetingDatabaseChecks.java' }) }
else { $Sources += @(Get-ChildItem -LiteralPath (Join-Path $PSScriptRoot 'meeting-checks') -Filter '*.java' -File | Select-Object -ExpandProperty FullName) }
$Compile = @('-encoding', 'UTF-8', '-cp', ('"' + $ClassPath.Replace('\', '/') + '"'), '-d', ('"' + $Output.Replace('\', '/') + '"'))
if ($SupplierChecks -or $ProjectPersistenceChecks -or $RfqChecks) { $Compile = @('-J-Xms16m', '-J-Xmx256m') + $Compile }
$Compile += @($Sources | ForEach-Object { '"' + $_.Replace('\', '/') + '"' })
$CompileFile = Join-Path $Output 'compile.args'
[IO.File]::WriteAllLines($CompileFile, $Compile, [Text.UTF8Encoding]::new($false))
& javac "@$CompileFile"
if ($LASTEXITCODE -ne 0) { throw 'OA check compilation failed' }
$MainClass = if ($RfqChecks) { 'com.cloudflow.oa.service.impl.OaRfqPersistenceDatabaseChecks' } elseif ($ProjectPersistenceChecks) { 'com.cloudflow.oa.service.impl.OaProjectPersistenceDatabaseChecks' } elseif ($SupplierChecks) { 'com.cloudflow.oa.service.impl.OaSupplierGovernanceDatabaseChecks' } elseif ($MeetingChecks) { 'com.cloudflow.oa.service.impl.OaMeetingDatabaseChecks' } elseif ($MigrationRehearsal) { 'com.cloudflow.oa.service.impl.OaProjectMigrationChecks' } else { 'com.cloudflow.oa.service.impl.OaOperationsChecks' }
$Run = @('-Dfile.encoding=UTF-8', '-cp', ('"' + ($Output + [IO.Path]::PathSeparator + $ClassPath).Replace('\', '/') + '"'), $MainClass)
if ($SupplierChecks -or $ProjectPersistenceChecks -or $RfqChecks) { $Run = @('-Xms32m', '-Xmx256m') + $Run }
if ($JdbcUrl) { $Run += '"' + $JdbcUrl + '"' }
if ($SupplierChecks) { $Run += '"' + [IO.Path]::GetFullPath($SupplierResultPath).Replace('\', '/') + '"' }
if ($ProjectPersistenceChecks) { $Run += '"' + [IO.Path]::GetFullPath($ProjectResultPath).Replace('\', '/') + '"' }
if ($RfqChecks) { $Run += '"' + [IO.Path]::GetFullPath($RfqResultPath).Replace('\', '/') + '"' }
if ($AssetPerformance) { $Run += '--asset-plan-performance' }
$RunFile = Join-Path $Output 'run.args'
[IO.File]::WriteAllLines($RunFile, $Run, [Text.UTF8Encoding]::new($false))
& java "@$RunFile"
if ($LASTEXITCODE -ne 0) { throw 'OA checks failed' }
