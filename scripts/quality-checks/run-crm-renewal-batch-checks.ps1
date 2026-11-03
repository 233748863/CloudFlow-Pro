param([string]$OutputDirectory)
$ErrorActionPreference = 'Stop'
$ProjectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$Backend = Join-Path $ProjectRoot 'cloudflow-backend'
if (-not $OutputDirectory) { $OutputDirectory = Join-Path $ProjectRoot '.cloudflow-runtime/quality-crm-renewal-20261103' }
$OutputDirectory = [IO.Path]::GetFullPath($OutputDirectory)
[IO.Directory]::CreateDirectory($OutputDirectory) | Out-Null
$Modules = @((Join-Path $Backend 'cloudflow-service-crm')) + @(Get-ChildItem -LiteralPath (Join-Path $Backend 'cloudflow-common') -Directory | Select-Object -ExpandProperty FullName)
$ClassDirectories = @($Modules | ForEach-Object { Join-Path $_ 'target/classes' } | Where-Object { Test-Path -LiteralPath $_ })
$Dependencies = (Get-Content -LiteralPath (Join-Path $Backend 'cloudflow-service-crm/target/quality-renewal-classpath.txt') -Raw).Trim()
$ClassPath = (@($ClassDirectories) + @($Dependencies)) -join [IO.Path]::PathSeparator
$Source = Join-Path $PSScriptRoot 'CrmRenewalBatchChecks.java'
$CompileArguments = @('-encoding','UTF-8','-parameters','-proc:none','-cp',('"' + $ClassPath.Replace('\','/') + '"'),
    '-d',('"' + $OutputDirectory.Replace('\','/') + '"'),('"' + $Source.Replace('\','/') + '"'))
$CompileFile = Join-Path $OutputDirectory 'compile.args'
[IO.File]::WriteAllLines($CompileFile,$CompileArguments,[Text.UTF8Encoding]::new($false))
& javac ('@' + $CompileFile)
if ($LASTEXITCODE -ne 0) { throw 'CRM renewal batch check compilation failed.' }
$Arguments = @('-Xmx384m','-Dfile.encoding=UTF-8','-Dsun.stdout.encoding=UTF-8','-Dsun.stderr.encoding=UTF-8',
    '-cp',('"' + ($OutputDirectory + [IO.Path]::PathSeparator + $ClassPath).Replace('\','/') + '"'),
    'com.cloudflow.crm.service.impl.CrmRenewalBatchChecks')
$RunFile = Join-Path $OutputDirectory 'run.args'
[IO.File]::WriteAllLines($RunFile,$Arguments,[Text.UTF8Encoding]::new($false))
& java ('@' + $RunFile)
if ($LASTEXITCODE -ne 0) { throw 'CRM renewal batch checks failed.' }
Write-Output "CRM_RENEWAL_BATCH_OUTPUT=$OutputDirectory"
