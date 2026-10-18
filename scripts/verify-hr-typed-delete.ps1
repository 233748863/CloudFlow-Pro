param([Parameter(Mandatory = $true)][string]$StatePath)

$ErrorActionPreference = 'Stop'
$Root = [IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
. (Join-Path $Root '.cloudflow-runtime/use-data-drive.ps1')
$StateFile = (Resolve-Path -LiteralPath $StatePath).Path
$Run = Split-Path -Parent $StateFile
if ((Split-Path -Parent $Run) -ne (Join-Path $Root '.cloudflow-runtime/batch-g-integration') -or (Split-Path -Leaf $Run) -notmatch '^[a-f0-9]{32}$' -or (Split-Path -Leaf $StateFile) -ne 'state.json') { throw 'Owned isolated state required' }
$State = Get-Content -LiteralPath $StateFile -Raw | ConvertFrom-Json
if ($State.run -ne $Run -or $State.status -ne 'RUNNING' -or $State.mysqlPort -lt 1025 -or $State.mysqlPort -gt 65535) { throw 'Owned isolated database required' }
$Backend = Join-Path $Root 'cloudflow-backend'
$Module = Join-Path $Backend 'cloudflow-service-hr'
$Classpath = (Join-Path $Module 'target/classes') + [IO.Path]::PathSeparator + (Get-Content -LiteralPath (Join-Path $Module 'target/report-classpath.txt') -Raw).Trim()
$Output = Join-Path $Backend 'target/hr-typed-delete-checks'
[IO.Directory]::CreateDirectory($Output) | Out-Null
$Sources = @((Join-Path $Module 'src/main/java/com/cloudflow/hr/service/HrTypedCrudService.java'), (Join-Path $Root 'scripts/hr-checks/HrTypedDeleteChecks.java'))
$Inputs = @($Sources | ForEach-Object { [PSCustomObject]@{ Path = $_; Hash = (Get-FileHash -LiteralPath $_).Hash } })
$CompileFile = Join-Path $Output 'compile.args'
$CompileArguments = @('-encoding', 'UTF-8', '-cp', ('"' + $Classpath.Replace('\', '/') + '"'), '-d', ('"' + $Output.Replace('\', '/') + '"'))
$CompileArguments += $Sources | ForEach-Object { '"' + $_.Replace('\', '/') + '"' }
[IO.File]::WriteAllLines($CompileFile, $CompileArguments, [Text.UTF8Encoding]::new($false))
& javac "@$CompileFile"
if ($LASTEXITCODE -ne 0) { throw 'HR typed delete checks compilation failed' }
$Database = "jdbc:mysql://127.0.0.1:$($State.mysqlPort)/cloud_flow_db?useSSL=false&allowPublicKeyRetrieval=true&serverTimezone=Asia/Shanghai&characterEncoding=UTF-8"
$RunFile = Join-Path $Output 'run.args'
[IO.File]::WriteAllLines($RunFile, @('-Dfile.encoding=UTF-8', '-Dsun.stdout.encoding=UTF-8', '-Dsun.stderr.encoding=UTF-8', '-cp', ('"' + ($Output + [IO.Path]::PathSeparator + $Classpath).Replace('\', '/') + '"'), 'com.cloudflow.hr.service.HrTypedDeleteChecks', ('"' + $Database + '"'), ('"' + (Join-Path $Run 'mysql-data').Replace('\', '/') + '"'), ('"' + $Root.Replace('\', '/') + '"')), [Text.UTF8Encoding]::new($false))
& java "@$RunFile"
if ($LASTEXITCODE -ne 0) { throw 'HR typed delete database checks failed' }
$Changed = @($Inputs | Where-Object { (Get-FileHash -LiteralPath $_.Path).Hash -ne $_.Hash })
if ($Changed.Count -ne 0) { throw 'HR deletion sources changed during validation' }
Write-Output "HR_TYPED_DELETE_SOURCE_HASHES: files=$($Inputs.Count); changed=0; service_compiled_from_current_source=true"
