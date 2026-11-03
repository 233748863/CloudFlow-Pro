param([string]$OutputDirectory)

$ErrorActionPreference = 'Stop'
$ProjectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$Backend = Join-Path $ProjectRoot 'cloudflow-backend'
$DependencyFile = Join-Path $Backend 'cloudflow-auth/target/quality-platform-classpath.txt'
if (-not $OutputDirectory) { $OutputDirectory = Join-Path $ProjectRoot ('.cloudflow-runtime/quality-platform-core-' + [Guid]::NewGuid().ToString('N')) }
$OutputDirectory = [IO.Path]::GetFullPath($OutputDirectory)
[IO.Directory]::CreateDirectory($OutputDirectory) | Out-Null
$Modules = @((Join-Path $Backend 'cloudflow-auth')) + @(Get-ChildItem -LiteralPath (Join-Path $Backend 'cloudflow-common') -Directory | Select-Object -ExpandProperty FullName)
$ClassDirectories = @($Modules | ForEach-Object { Join-Path $_ 'target/classes' } | Where-Object { Test-Path -LiteralPath $_ })
$ClassPath = (@($ClassDirectories) + @((Get-Content -LiteralPath $DependencyFile -Raw).Trim())) -join [IO.Path]::PathSeparator
$Sources = @(
    'cloudflow-common/cloudflow-common-core/src/main/java/com/cloudflow/common/core/file/HrFileDownloadTypes.java',
    'cloudflow-common/cloudflow-common-core/src/main/java/com/cloudflow/common/core/domain/ProcessStartResult.java',
    'cloudflow-auth/src/main/java/com/cloudflow/auth/download/HrFileAccessChecker.java',
    'cloudflow-auth/src/main/java/com/cloudflow/auth/service/report/ReportDatasetService.java',
    'cloudflow-auth/src/main/java/com/cloudflow/auth/service/report/ReportDefinitionService.java',
    'cloudflow-auth/src/main/java/com/cloudflow/auth/service/remote/RemoteWorkflowService.java',
    'cloudflow-auth/src/main/java/com/cloudflow/auth/service/remote/RemoteWorkflowFallbackFactory.java',
    'cloudflow-auth/src/main/java/com/cloudflow/auth/service/impl/SysDictTypeServiceImpl.java',
    'cloudflow-auth/src/main/java/com/cloudflow/auth/event/consumer/WorkflowStartFallbackRetryConsumer.java',
    'cloudflow-auth/src/main/java/com/cloudflow/auth/message/MessageDispatchService.java'
) | ForEach-Object { Join-Path $Backend $_ }
$Sources += Join-Path $PSScriptRoot 'PlatformCoreChecks.java'
$CompileArguments = @('-encoding', 'UTF-8', '-parameters', '-cp', ('"' + $ClassPath.Replace('\', '/') + '"'),
    '-d', ('"' + $OutputDirectory.Replace('\', '/') + '"')) + @($Sources | ForEach-Object { '"' + $_.Replace('\', '/') + '"' })
$CompileFile = Join-Path $OutputDirectory 'compile.args'
[IO.File]::WriteAllLines($CompileFile, $CompileArguments, [Text.UTF8Encoding]::new($false))
& javac ('@' + $CompileFile)
if ($LASTEXITCODE -ne 0) { throw 'Platform core component compilation failed.' }
$RunFile = Join-Path $OutputDirectory 'run.args'
[IO.File]::WriteAllLines($RunFile, @('-Dfile.encoding=UTF-8', '-Dsun.stdout.encoding=UTF-8', '-Dsun.stderr.encoding=UTF-8',
    '-cp', ('"' + ($OutputDirectory + [IO.Path]::PathSeparator + $ClassPath).Replace('\', '/') + '"'),
    'com.cloudflow.auth.checks.PlatformCoreChecks'), [Text.UTF8Encoding]::new($false))
& java ('@' + $RunFile)
if ($LASTEXITCODE -ne 0) { throw 'Platform core component checks failed.' }
Write-Output "PLATFORM_CORE_OUTPUT=$OutputDirectory"
