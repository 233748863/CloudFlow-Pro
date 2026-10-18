param()

$ErrorActionPreference = 'Stop'
$Root = [IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
if ([IO.Path]::GetPathRoot($Root) -eq ($env:SystemDrive + '\')) { throw 'Portal ticket checks require a data drive' }
. (Join-Path $Root '.cloudflow-runtime/use-data-drive.ps1')
$Backend = Join-Path $Root 'cloudflow-backend'
$Dependencies = (Get-Content -LiteralPath (Join-Path $Backend 'cloudflow-auth/target/portal-classpath.txt') -Raw).Trim()
$Modules = @((Join-Path $Backend 'cloudflow-auth'), (Join-Path $Backend 'cloudflow-service-crm')) + @(Get-ChildItem -LiteralPath (Join-Path $Backend 'cloudflow-common') -Directory | Select-Object -ExpandProperty FullName)
$Classes = @($Modules | ForEach-Object { Join-Path $_ 'target/classes' } | Where-Object { Test-Path -LiteralPath $_ })
$ClassPath = (@($Classes) + @($Dependencies)) -join [IO.Path]::PathSeparator
$Output = Join-Path $Backend 'cloudflow-service-crm/target/portal-ticket-checks'
[IO.Directory]::CreateDirectory($Output) | Out-Null
$Source = Join-Path $PSScriptRoot 'portal-checks/PortalTicketChecks.java'
$Compile = @('-encoding','UTF-8','-parameters','-cp',('"' + $ClassPath.Replace('\','/') + '"'),'-d',('"' + $Output.Replace('\','/') + '"'),('"' + $Source.Replace('\','/') + '"'))
[IO.File]::WriteAllLines((Join-Path $Output 'compile.args'), $Compile, [Text.UTF8Encoding]::new($false))
& javac ('@' + (Join-Path $Output 'compile.args'))
if ($LASTEXITCODE -ne 0) { throw 'Portal ticket rules compilation failed' }
$Run = @('-Dfile.encoding=UTF-8','-cp',('"' + ($Output + [IO.Path]::PathSeparator + $ClassPath).Replace('\','/') + '"'),'com.cloudflow.crm.service.impl.PortalTicketChecks')
[IO.File]::WriteAllLines((Join-Path $Output 'run.args'), $Run, [Text.UTF8Encoding]::new($false))
& java ('@' + (Join-Path $Output 'run.args'))
if ($LASTEXITCODE -ne 0) { throw 'Portal ticket rules checks failed' }
