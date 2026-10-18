param([ValidatePattern('^r[1-9][0-9]*$')][string]$Round='r1',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$BackendRound='r46')
$ErrorActionPreference='Stop'
$Root='D:\CloudFlowPro'
. (Join-Path $Root '.cloudflow-runtime/use-data-drive.ps1')
$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
$Output=Join-Path $Evidence "a3-transaction-redis-20261003-$Round"
if(Test-Path -LiteralPath $Output){throw 'Previous evidence retained'}
[IO.Directory]::CreateDirectory($Output)|Out-Null
$Product=Get-Content (Join-Path $Evidence "h3-portal-finance-20261002-backend-$BackendRound-inputs.json") -Raw|ConvertFrom-Json
function Assert-Product {foreach($Item in $Product){if((Get-FileHash (Join-Path $Root $Item.Path)).Hash -ne $Item.Hash){throw 'Product differs from build'}}}
Assert-Product
$Run=Join-Path $Root '.cloudflow-runtime/batch-g-integration/9799534e1a3a47b5958330f14ae16dc7'
$State=Get-Content (Join-Path $Run 'state.json') -Raw|ConvertFrom-Json
if($State.status -ne 'RUNNING' -or [IO.Path]::GetFullPath($State.run) -ne $Run){throw 'Owned fixture required'}
foreach($Entry in $State.processes){$Observed=Get-CimInstance Win32_Process -Filter "ProcessId=$($Entry.id)";if(-not $Observed -or -not $Observed.CommandLine.Contains($Entry.marker)){throw 'Owned process mismatch'}}
$Redis=@($State.processes|Where-Object name -EQ 'redis')
if($Redis.Count -ne 1){throw 'Unique owned Redis required'}
$RedisConfig=[IO.Path]::GetFullPath((Join-Path $Run $Redis[0].marker))
$Source=Join-Path $Root 'scripts/job-checks/TransactionConsistencyRedisChecks.java'
$ServiceArgs=Join-Path $Run 'workflow/service.args'
$Inputs=@(@($Source,$PSCommandPath,$ServiceArgs,$RedisConfig)|ForEach-Object{[pscustomobject]@{Path=$_;Hash=(Get-FileHash $_).Hash}})
$Inputs|ConvertTo-Json|Set-Content (Join-Path $Output 'inputs.json') -Encoding utf8NoBOM
$Lines=Get-Content $ServiceArgs
$Indices=@(0..($Lines.Count-1)|Where-Object{$Lines[$_] -match '^"?(-cp|-classpath|--class-path)"?$'})
if($Indices.Count -ne 1){throw 'Unique service classpath required'}
$Classpath=$Lines[$Indices[0]+1].Trim('"')
foreach($Entry in $Classpath.Split(';')){if([IO.Path]::GetPathRoot((Resolve-Path -LiteralPath $Entry).Path) -ne 'D:\'){throw 'Only data drive dependencies allowed'}}
$Compile=Join-Path $Output 'compile.args'
[IO.File]::WriteAllLines($Compile,@('-encoding','UTF-8','-proc:none','-classpath',('"'+$Classpath.Replace('\','/')+'"'),'-d',('"'+$Output.Replace('\','/')+'"'),('"'+$Source.Replace('\','/')+'"')),[Text.UTF8Encoding]::new($false))
$Compiler=Start-Process -FilePath (Get-Command javac).Source -ArgumentList "@$Compile" -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $Output 'compile.stdout.log') -RedirectStandardError (Join-Path $Output 'compile.stderr.log')
$Compiler.WaitForExit()
if($Compiler.ExitCode){throw 'Actual Redis checks compilation failed'}
$Logging=Join-Path $Output 'logging.xml'
[IO.File]::WriteAllText($Logging,'<configuration><root level="OFF"/></configuration>',[Text.UTF8Encoding]::new($false))
$RunArgs=Join-Path $Output 'run.args'
[IO.File]::WriteAllLines($RunArgs,@('-Xmx256m',('-Dlogback.configurationFile='+$Logging.Replace('\','/')),'-classpath',('"'+($Output+';'+$Classpath).Replace('\','/')+'"'),'com.cloudflow.workflow.service.TransactionConsistencyRedisChecks',('"'+$Run.Replace('\','/')+'"'),('"'+$RedisConfig.Replace('\','/')+'"')),[Text.UTF8Encoding]::new($false))
$Check=Start-Process -FilePath (Get-Command java).Source -ArgumentList "@$RunArgs" -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $Output 'checks.stdout.log') -RedirectStandardError (Join-Path $Output 'checks.stderr.log')
$Check.WaitForExit()
Get-Content (Join-Path $Output 'checks.stdout.log')|Where-Object{$_ -match '^TXN_CONSISTENCY_'}
Assert-Product
foreach($Item in $Inputs){if((Get-FileHash $Item.Path).Hash -ne $Item.Hash){throw 'Verification inputs changed'}}
[pscustomobject]@{ExitCode=$Check.ExitCode;BackendRound=$BackendRound;InputsUnchanged=$true}|ConvertTo-Json|Set-Content (Join-Path $Output 'outcome.json') -Encoding utf8NoBOM
"A3_TXN_REDIS_CHECKS_EXIT=$($Check.ExitCode)"
exit $Check.ExitCode
