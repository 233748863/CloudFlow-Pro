param([string]$OutputDirectory)

$ErrorActionPreference = 'Stop'
$ProjectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$Backend = Join-Path $ProjectRoot 'cloudflow-backend'
$DependencyFile = Join-Path $Backend 'cloudflow-auth/target/quality-platform-classpath.txt'
if (-not $OutputDirectory) { $OutputDirectory = Join-Path $ProjectRoot ('.cloudflow-runtime/quality-platform-integration-' + [Guid]::NewGuid().ToString('N')) }
$OutputDirectory = [IO.Path]::GetFullPath($OutputDirectory)
[IO.Directory]::CreateDirectory($OutputDirectory) | Out-Null
$Modules = @((Join-Path $Backend 'cloudflow-auth')) + @(Get-ChildItem -LiteralPath (Join-Path $Backend 'cloudflow-common') -Directory | Select-Object -ExpandProperty FullName)
$ClassDirectories = @($Modules | ForEach-Object { Join-Path $_ 'target/classes' } | Where-Object { Test-Path -LiteralPath $_ })
$ClassPath = (@($ClassDirectories) + @((Get-Content -LiteralPath $DependencyFile -Raw).Trim())) -join [IO.Path]::PathSeparator
$Sources = @('PlatformIntegrationChecks.java', 'PlatformCoreChecks.java') | ForEach-Object { Join-Path $PSScriptRoot $_ }
$CompileArguments = @('-encoding', 'UTF-8', '-parameters', '-cp', ('"' + $ClassPath.Replace('\', '/') + '"'),
    '-d', ('"' + $OutputDirectory.Replace('\', '/') + '"')) + @($Sources | ForEach-Object { '"' + $_.Replace('\', '/') + '"' })
$CompileFile = Join-Path $OutputDirectory 'compile.args'
[IO.File]::WriteAllLines($CompileFile, $CompileArguments, [Text.UTF8Encoding]::new($false))
& javac ('@' + $CompileFile)
if ($LASTEXITCODE -ne 0) { throw 'Platform integration check compilation failed.' }
$RunFile = Join-Path $OutputDirectory 'run.args'
[IO.File]::WriteAllLines($RunFile, @('-Dfile.encoding=UTF-8', '-Dsun.stdout.encoding=UTF-8', '-Dsun.stderr.encoding=UTF-8',
    '-cp', ('"' + ($OutputDirectory + [IO.Path]::PathSeparator + $ClassPath).Replace('\', '/') + '"'),
    'com.cloudflow.auth.checks.PlatformIntegrationChecks'), [Text.UTF8Encoding]::new($false))
& java ('@' + $RunFile)
if ($LASTEXITCODE -ne 0) { throw 'Platform integration checks failed.' }
Write-Output "PLATFORM_INTEGRATION_OUTPUT=$OutputDirectory"
