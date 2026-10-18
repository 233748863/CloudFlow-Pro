param([switch]$SkipBuild)

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
$Backend = Join-Path $Root 'cloudflow-backend'
$Module = Join-Path $Backend 'cloudflow-auth'
if (-not $SkipBuild) {
    Push-Location $Backend
    try {
        & mvn -q -pl cloudflow-auth,cloudflow-gateway,cloudflow-service-oa,cloudflow-service-hr,cloudflow-service-crm,cloudflow-service-workflow -am '-DskipTests' compile dependency:build-classpath '-Dmdep.outputFile=target/batch-g-classpath.txt'
        if ($LASTEXITCODE -ne 0) { throw 'Auth compilation failed' }
    } finally { Pop-Location }
}
$Dependencies = (Get-Content -LiteralPath (Join-Path $Module 'target/batch-g-classpath.txt') -Raw).Trim()
$ModuleClasses = @((Join-Path $Module 'target/classes'))
foreach ($Extra in @('cloudflow-gateway','cloudflow-service-oa','cloudflow-service-hr','cloudflow-service-crm','cloudflow-service-workflow')) {
    $ExtraModule = Join-Path $Backend $Extra
    $ModuleClasses += Join-Path $ExtraModule 'target/classes'
    $Dependencies += [IO.Path]::PathSeparator + (Get-Content -LiteralPath (Join-Path $ExtraModule 'target/batch-g-classpath.txt') -Raw).Trim()
}
$ModuleClasses += @(Get-ChildItem -LiteralPath (Join-Path $Backend 'cloudflow-common') -Directory | ForEach-Object { Join-Path $_.FullName 'target/classes' } | Where-Object { Test-Path -LiteralPath $_ })
$ClassPath = ($ModuleClasses -join [IO.Path]::PathSeparator) + [IO.Path]::PathSeparator + $Dependencies
$ClasspathEntries = @($ClassPath.Split([IO.Path]::PathSeparator) | Where-Object {
    [IO.Path]::GetFileName($_) -notlike 'cloudflow-common-*.jar'
} | Select-Object -Unique)
foreach ($Entry in $ClasspathEntries) {
    if (-not (Test-Path -LiteralPath $Entry)) { throw 'Missing platform verification dependency; regenerate the classpath' }
    if ($Entry -match '[/\\]target[/\\]classes[/\\]?$' -and
        -not [IO.Path]::GetFullPath($Entry).StartsWith($Root + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
        throw 'Platform verification dependency references another workspace; regenerate the classpath'
    }
}
$ClassPath = $ClasspathEntries -join [IO.Path]::PathSeparator
$Output = Join-Path $Module 'target/batch-g-checks'
[IO.Directory]::CreateDirectory($Output) | Out-Null
$Sources = @(Get-ChildItem -LiteralPath (Join-Path $PSScriptRoot 'platform-checks') -Filter '*.java' -File | Select-Object -ExpandProperty FullName)
$Compile = @('-encoding', 'UTF-8', '-cp', ('"' + $ClassPath.Replace('\', '/') + '"'), '-d', ('"' + $Output.Replace('\', '/') + '"'))
$Compile += @($Sources | ForEach-Object { '"' + $_.Replace('\', '/') + '"' })
$CompileFile = Join-Path $Output 'compile.args'
[IO.File]::WriteAllLines($CompileFile, $Compile, [Text.UTF8Encoding]::new($false))
& javac '-J-Dfile.encoding=UTF-8' '-J-Dstdout.encoding=UTF-8' '-J-Dstderr.encoding=UTF-8' "@$CompileFile"
if ($LASTEXITCODE -ne 0) { throw 'Platform checks compilation failed' }
$Run = @('-Dfile.encoding=UTF-8', '-Dstdout.encoding=UTF-8', '-Dstderr.encoding=UTF-8', '-cp', ('"' + ($Output + [IO.Path]::PathSeparator + $ClassPath).Replace('\', '/') + '"'), 'com.cloudflow.oa.service.impl.AuditSnapshotProxyChecks')
$RunFile = Join-Path $Output 'run.args'
[IO.File]::WriteAllLines($RunFile, $Run, [Text.UTF8Encoding]::new($false))
& java "@$RunFile"
if ($LASTEXITCODE -ne 0) { throw 'Audit snapshot proxy checks failed' }
$Run[$Run.Count - 1] = 'com.cloudflow.auth.storage.FileStorageChecks'
[IO.File]::WriteAllLines($RunFile, $Run, [Text.UTF8Encoding]::new($false))
& java "@$RunFile"
if ($LASTEXITCODE -ne 0) { throw 'File storage checks failed' }
$Run[$Run.Count - 1] = 'com.cloudflow.auth.storage.ObservabilityChecks'
[IO.File]::WriteAllLines($RunFile, $Run, [Text.UTF8Encoding]::new($false))
& java "@$RunFile"
if ($LASTEXITCODE -ne 0) { throw 'Observability checks failed' }
$Run[$Run.Count - 1] = 'com.cloudflow.oa.controller.FrontendErrorReportingChecks'
[IO.File]::WriteAllLines($RunFile, $Run, [Text.UTF8Encoding]::new($false))
& java "@$RunFile"
if ($LASTEXITCODE -ne 0) { throw 'Frontend error reporting checks failed' }
$Run[$Run.Count - 1] = 'com.cloudflow.gateway.filter.GatewayAuthenticationChecks'
[IO.File]::WriteAllLines($RunFile, $Run, [Text.UTF8Encoding]::new($false))
& java "@$RunFile"
if ($LASTEXITCODE -ne 0) { throw 'Gateway authentication checks failed' }
$Run[$Run.Count - 1] = 'com.cloudflow.gateway.filter.PortalGatewayHeadersChecks'
[IO.File]::WriteAllLines($RunFile, $Run, [Text.UTF8Encoding]::new($false))
& java "@$RunFile"
if ($LASTEXITCODE -ne 0) { throw 'Portal gateway header checks failed' }
$Run[$Run.Count - 1] = 'com.cloudflow.common.security.aspect.InnerAccessBoundaryChecks'
[IO.File]::WriteAllLines($RunFile, $Run, [Text.UTF8Encoding]::new($false))
& java "@$RunFile"
if ($LASTEXITCODE -ne 0) { throw 'Internal access boundary checks failed' }
$Run[$Run.Count - 1] = 'com.cloudflow.auth.controller.UiLookupBoundaryChecks'
[IO.File]::WriteAllLines($RunFile, $Run, [Text.UTF8Encoding]::new($false))
& java "@$RunFile"
if ($LASTEXITCODE -ne 0) { throw 'UI lookup boundary checks failed' }
$Run[$Run.Count - 1] = 'com.cloudflow.auth.controller.AuthLoginTenantCacheChecks'
[IO.File]::WriteAllLines($RunFile, $Run, [Text.UTF8Encoding]::new($false))
& java "@$RunFile"
if ($LASTEXITCODE -ne 0) { throw 'Auth login tenant cache checks failed' }
$Run[$Run.Count - 1] = 'com.cloudflow.auth.controller.AuthInfoTenantIdentityChecks'
[IO.File]::WriteAllLines($RunFile, $Run, [Text.UTF8Encoding]::new($false))
& java "@$RunFile"
if ($LASTEXITCODE -ne 0) { throw 'Auth info tenant identity checks failed' }
$Run[$Run.Count - 1] = 'com.cloudflow.common.security.service.LoginDomainIsolationChecks'
[IO.File]::WriteAllLines($RunFile, $Run, [Text.UTF8Encoding]::new($false))
& java "@$RunFile"
if ($LASTEXITCODE -ne 0) { throw 'Login domain isolation checks failed' }
$Run[$Run.Count - 1] = 'com.cloudflow.auth.service.HolidayDateWriteChecks'
[IO.File]::WriteAllLines($RunFile, $Run, [Text.UTF8Encoding]::new($false))
& java "@$RunFile"
if ($LASTEXITCODE -ne 0) { throw 'Holiday date write checks failed' }
$Run[$Run.Count - 1] = 'com.cloudflow.common.holiday.service.HolidayCalendarChecks'
[IO.File]::WriteAllLines($RunFile, $Run, [Text.UTF8Encoding]::new($false))
& java "@$RunFile"
if ($LASTEXITCODE -ne 0) { throw 'Holiday calendar checks failed' }
$Run[$Run.Count - 1] = 'com.cloudflow.auth.importing.HolidayImportChecks'
[IO.File]::WriteAllLines($RunFile, $Run, [Text.UTF8Encoding]::new($false))
& java "@$RunFile"
if ($LASTEXITCODE -ne 0) { throw 'Holiday import checks failed' }
$Run[$Run.Count - 1] = 'com.cloudflow.common.staticrules.StaticRuleScannerChecks'
[IO.File]::WriteAllLines($RunFile, $Run, [Text.UTF8Encoding]::new($false))
& java "@$RunFile"
if ($LASTEXITCODE -ne 0) { throw 'Static rule scanner checks failed' }
$Run[$Run.Count - 1] = 'com.cloudflow.auth.storage.FeignCircuitBreakerContextChecks'
[IO.File]::WriteAllLines($RunFile, $Run, [Text.UTF8Encoding]::new($false))
& java "@$RunFile"
if ($LASTEXITCODE -ne 0) { throw 'Feign circuit breaker context checks failed' }
$ImportOutput = Join-Path $Root '.cloudflow-runtime/batch-g-import-tests'
[IO.Directory]::CreateDirectory($ImportOutput) | Out-Null
$Run[$Run.Count - 1] = 'com.cloudflow.common.excel.importing.ImportChecks'
$ImportRun = $Run + @('regular', ('"' + $ImportOutput.Replace('\', '/') + '"'))
[IO.File]::WriteAllLines($RunFile, $ImportRun, [Text.UTF8Encoding]::new($false))
& java "@$RunFile"
if ($LASTEXITCODE -ne 0) { throw 'Import checks failed' }
$ImportRun = @('-Xmx64m') + $Run + @('stream', ('"' + $ImportOutput.Replace('\', '/') + '"'))
[IO.File]::WriteAllLines($RunFile, $ImportRun, [Text.UTF8Encoding]::new($false))
& java "@$RunFile"
if ($LASTEXITCODE -ne 0) { throw 'Import streaming checks failed' }
$Run[$Run.Count - 1] = 'com.cloudflow.auth.storage.ImportStorageBoundaryChecks'
$BoundaryRun = $Run + @(('"' + $ImportOutput.Replace('\', '/') + '"'))
[IO.File]::WriteAllLines($RunFile, $BoundaryRun, [Text.UTF8Encoding]::new($false))
& java "@$RunFile"
if ($LASTEXITCODE -ne 0) { throw 'Import storage boundary checks failed' }
$Run[$Run.Count - 1] = 'com.cloudflow.common.excel.importing.ImportCapacityChecks'
$CapacityRun = $Run + @(('"' + $ImportOutput.Replace('\', '/') + '"'))
[IO.File]::WriteAllLines($RunFile, $CapacityRun, [Text.UTF8Encoding]::new($false))
& java "@$RunFile"
if ($LASTEXITCODE -ne 0) { throw 'Import storage capacity checks failed' }
$Run[$Run.Count - 1] = 'com.cloudflow.common.job.service.JobExecutionChecks'
[IO.File]::WriteAllLines($RunFile, $Run, [Text.UTF8Encoding]::new($false))
& java "@$RunFile"
if ($LASTEXITCODE -ne 0) { throw 'Job execution checks failed' }
$Run[$Run.Count - 1] = 'com.cloudflow.common.excel.importing.ImportChecks'
[IO.File]::WriteAllLines($RunFile, $Run, [Text.UTF8Encoding]::new($false))
