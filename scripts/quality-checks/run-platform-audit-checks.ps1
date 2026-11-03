param([string]$OutputDirectory)

$ErrorActionPreference = 'Stop'
$ProjectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$Backend = Join-Path $ProjectRoot 'cloudflow-backend'
$DependencyFile = Join-Path $Backend 'cloudflow-auth/target/quality-platform-classpath.txt'
if (-not (Test-Path -LiteralPath $DependencyFile)) { throw 'Compile Auth and create quality-platform-classpath.txt before running these checks.' }
if (-not $OutputDirectory) {
    $OutputDirectory = Join-Path $ProjectRoot ('.cloudflow-runtime/quality-platform-audit-' + [Guid]::NewGuid().ToString('N'))
}
$OutputDirectory = [IO.Path]::GetFullPath($OutputDirectory)
[IO.Directory]::CreateDirectory($OutputDirectory) | Out-Null
$Modules = @((Join-Path $Backend 'cloudflow-auth')) + @(Get-ChildItem -LiteralPath (Join-Path $Backend 'cloudflow-common') -Directory | Select-Object -ExpandProperty FullName)
$ClassDirectories = @($Modules | ForEach-Object { Join-Path $_ 'target/classes' } | Where-Object { Test-Path -LiteralPath $_ })
$ClassPath = (@($ClassDirectories) + @((Get-Content -LiteralPath $DependencyFile -Raw).Trim())) -join [IO.Path]::PathSeparator
$AuditSources = @(Get-ChildItem -LiteralPath (Join-Path $Backend 'cloudflow-common/cloudflow-common-audit/src/main/java') -Recurse -Filter '*.java' -File | Select-Object -ExpandProperty FullName)
$Sources = $AuditSources + @(
    (Join-Path $Backend 'cloudflow-service-oa/src/main/java/com/cloudflow/oa/domain/vo/knowledge/KnowledgeExternalStateVO.java'),
    (Join-Path $ProjectRoot 'scripts/auth-checks/PasswordResetAuditChecks.java'),
    (Join-Path $ProjectRoot 'scripts/platform-checks/AuditSnapshotProxyChecks.java'),
    (Join-Path $ProjectRoot 'scripts/platform-checks/PlatformAccessChecks.java'),
    (Join-Path $PSScriptRoot 'PlatformAuditChecks.java')
)
$CompileArguments = @('-encoding', 'UTF-8', '-parameters', '-cp', ('"' + $ClassPath.Replace('\', '/') + '"'),
    '-d', ('"' + $OutputDirectory.Replace('\', '/') + '"')) + @($Sources | ForEach-Object { '"' + $_.Replace('\', '/') + '"' })
$CompileFile = Join-Path $OutputDirectory 'compile.args'
[IO.File]::WriteAllLines($CompileFile, $CompileArguments, [Text.UTF8Encoding]::new($false))
& javac ('@' + $CompileFile)
if ($LASTEXITCODE -ne 0) { throw 'Platform audit component compilation failed.' }
$RuntimePath = $OutputDirectory + [IO.Path]::PathSeparator + $ClassPath
foreach ($MainClass in @('com.cloudflow.auth.checks.PasswordResetAuditChecks',
        'com.cloudflow.oa.service.impl.AuditSnapshotProxyChecks', 'com.cloudflow.auth.checks.PlatformAuditChecks',
        'com.cloudflow.auth.platform.PlatformAccessChecks')) {
    $RunFile = Join-Path $OutputDirectory ($MainClass.Substring($MainClass.LastIndexOf('.') + 1) + '.args')
    [IO.File]::WriteAllLines($RunFile, @('-Dfile.encoding=UTF-8', '-Dsun.stdout.encoding=UTF-8', '-Dsun.stderr.encoding=UTF-8',
        '-cp', ('"' + $RuntimePath.Replace('\', '/') + '"'), $MainClass), [Text.UTF8Encoding]::new($false))
    & java ('@' + $RunFile)
    if ($LASTEXITCODE -ne 0) { throw "Platform component check failed: $MainClass" }
}
Write-Output "PLATFORM_AUDIT_OUTPUT=$OutputDirectory"
