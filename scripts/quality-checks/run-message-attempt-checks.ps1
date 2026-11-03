param([string]$OutputDirectory)
$ErrorActionPreference = 'Stop'
$ProjectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$Backend = Join-Path $ProjectRoot 'cloudflow-backend'
if (-not $OutputDirectory) { $OutputDirectory = Join-Path $ProjectRoot ('.cloudflow-runtime/quality-message-attempt-' + [Guid]::NewGuid().ToString('N')) }
$OutputDirectory = [IO.Path]::GetFullPath($OutputDirectory)
[IO.Directory]::CreateDirectory($OutputDirectory) | Out-Null
$DependencyFile = Join-Path $Backend 'cloudflow-auth/target/quality-platform-classpath.txt'
$Modules = @((Join-Path $Backend 'cloudflow-auth')) + @(Get-ChildItem -LiteralPath (Join-Path $Backend 'cloudflow-common') -Directory | Select-Object -ExpandProperty FullName)
$Classes = @($Modules | ForEach-Object { Join-Path $_ 'target/classes' } | Where-Object { Test-Path -LiteralPath $_ })
$ClassPath = (@($Classes) + @((Get-Content -LiteralPath $DependencyFile -Raw).Trim()) + @('D:/CloudFlowProCache/m2/repository/com/h2database/h2/2.3.232/h2-2.3.232.jar')) -join [IO.Path]::PathSeparator
$CompileFile = Join-Path $OutputDirectory 'compile.args'
[IO.File]::WriteAllLines($CompileFile, @('-encoding', 'UTF-8', '-parameters', '-cp', ('"' + $ClassPath.Replace('\', '/') + '"'),
    '-d', ('"' + $OutputDirectory.Replace('\', '/') + '"'), ('"' + (Join-Path $PSScriptRoot 'MessageAttemptChecks.java').Replace('\', '/') + '"')), [Text.UTF8Encoding]::new($false))
& javac '-J-Dfile.encoding=UTF-8' ('@' + $CompileFile)
if ($LASTEXITCODE -ne 0) { throw 'Message attempt check compilation failed.' }
$RunFile = Join-Path $OutputDirectory 'run.args'
[IO.File]::WriteAllLines($RunFile, @('-Dfile.encoding=UTF-8', '-Dsun.stdout.encoding=UTF-8', '-Dsun.stderr.encoding=UTF-8', '-cp',
    ('"' + ($OutputDirectory + [IO.Path]::PathSeparator + $ClassPath).Replace('\', '/') + '"'),
    'com.cloudflow.auth.message.MessageAttemptChecks', ('"' + (Join-Path $Backend 'DB/01.cloudflow-common.sql').Replace('\', '/') + '"'),
    ('"' + (Join-Path $Backend 'cloudflow-auth/src/main/resources/mapper/SysMessageDeliveryMapper.xml').Replace('\', '/') + '"')), [Text.UTF8Encoding]::new($false))
& java ('@' + $RunFile)
if ($LASTEXITCODE -ne 0) { throw 'Message attempt checks failed.' }
Write-Output "MESSAGE_ATTEMPT_OUTPUT=$OutputDirectory"
