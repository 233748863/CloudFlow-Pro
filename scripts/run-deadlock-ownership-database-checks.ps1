param([ValidatePattern('^r[1-9][0-9]*$')][string]$Round='r1',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$BackendRound='r30')
$ErrorActionPreference='Stop'
$Root='D:\CloudFlowPro'
. (Join-Path $Root '.cloudflow-runtime/use-data-drive.ps1')
$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
$Output=Join-Path $Evidence "a3-deadlock-ownership-database-20261003-$Round"
if(Test-Path -LiteralPath $Output){throw 'Previous evidence retained'}
[IO.Directory]::CreateDirectory($Output)|Out-Null
$Product=Get-Content (Join-Path $Evidence "h3-portal-finance-20261002-backend-$BackendRound-inputs.json") -Raw|ConvertFrom-Json
function Assert-Product {foreach($Item in $Product){if((Get-FileHash (Join-Path $Root $Item.Path)).Hash -ne $Item.Hash){throw 'Product differs from build'}}}
Assert-Product
$Run=Join-Path $Root '.cloudflow-runtime/batch-g-integration/9799534e1a3a47b5958330f14ae16dc7'
$State=Get-Content (Join-Path $Run 'state.json') -Raw|ConvertFrom-Json
if($State.status -ne 'RUNNING' -or [IO.Path]::GetFullPath($State.run) -ne $Run){throw 'Owned running environment required'}
foreach($Entry in $State.processes){
    $Observed=Get-CimInstance Win32_Process -Filter "ProcessId=$($Entry.id)"
    if(-not $Observed -or -not $Observed.CommandLine.Contains($Entry.marker)){throw 'Owned process mismatch'}
}
$Redis=@($State.processes|Where-Object{$_.name -eq 'redis'})
if($Redis.Count -ne 1){throw 'Unique owned Redis required'}
$RedisConfig=(Resolve-Path -LiteralPath (Join-Path $Run $Redis[0].marker)).Path
if((Split-Path $RedisConfig -Parent) -ne $Run){throw 'Owned Redis config required'}
$RedisText=Get-Content -LiteralPath $RedisConfig -Raw
if($RedisText -notmatch '(?m)^bind 127\.0\.0\.1\r?$' -or $RedisText -notmatch "(?m)^port $($State.redisPort)\r?$"){throw 'Owned Redis address required'}
$Secret=[regex]::Match($RedisText,'(?m)^requirepass (.+)\r?$').Groups[1].Value.Trim()
if(-not $Secret){throw 'Owned Redis credential required'}
$ServiceArgs=Join-Path $Run 'workflow/service.args'
$Source=Join-Path $Root 'scripts/job-checks/DeadlockOwnershipDatabaseChecks.java'
$Inputs=@(@($Source,$PSCommandPath,$ServiceArgs,$RedisConfig)|ForEach-Object{[pscustomobject]@{Path=$_;Hash=(Get-FileHash $_).Hash}})
$Inputs|ConvertTo-Json|Set-Content (Join-Path $Output 'inputs.json') -Encoding utf8NoBOM
$Lines=Get-Content -LiteralPath $ServiceArgs
$Indices=@(0..($Lines.Count-1)|Where-Object{$Lines[$_] -match '^"?(-cp|-classpath|--class-path)"?$'})
if($Indices.Count -ne 1){throw 'Unique service classpath required'}
$Classpath=$Lines[$Indices[0]+1].Trim('"')
foreach($Entry in $Classpath.Split(';')){if([IO.Path]::GetPathRoot((Resolve-Path -LiteralPath $Entry).Path) -ne 'D:\'){throw 'Only data drive dependencies allowed'}}
$Compile=Join-Path $Output 'compile.args'
[IO.File]::WriteAllLines($Compile,@('-encoding','UTF-8','-proc:none','-classpath',('"'+$Classpath.Replace('\','/')+'"'),'-d',('"'+$Output.Replace('\','/')+'"'),('"'+$Source.Replace('\','/')+'"')),[Text.UTF8Encoding]::new($false))
$Compiler=Start-Process -FilePath (Get-Command javac).Source -ArgumentList @('-J-Dfile.encoding=UTF-8',"@$Compile") -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $Output 'compile.stdout.log') -RedirectStandardError (Join-Path $Output 'compile.stderr.log')
$Compiler.WaitForExit()
if($Compiler.ExitCode){throw 'Deadlock ownership compilation failed; evidence retained'}
$Logging=Join-Path $Output 'logging.xml'
[IO.File]::WriteAllText($Logging,'<configuration><root level="OFF"/></configuration>',[Text.UTF8Encoding]::new($false))
$RunArgs=Join-Path $Output 'run.args'
$Jdbc="jdbc:mysql://127.0.0.1:$($State.mysqlPort)/cloud_flow_db?useSSL=false&allowPublicKeyRetrieval=true&serverTimezone=Asia/Shanghai&characterEncoding=utf8"
[IO.File]::WriteAllLines($RunArgs,@('-Xmx256m',('-Dlogback.configurationFile='+$Logging.Replace('\','/')),'-classpath',('"'+($Output+';'+$Classpath).Replace('\','/')+'"'),'com.cloudflow.workflow.service.DeadlockOwnershipDatabaseChecks',('"'+$Jdbc+'"'),('"'+(Join-Path $Run 'mysql-data').Replace('\','/')+'"'),('"'+$Root.Replace('\','/')+'"')),[Text.UTF8Encoding]::new($false))
$PreviousPort=$env:LOCK_CHECK_REDIS_PORT
$PreviousSecret=$env:LOCK_CHECK_REDIS_PASSWORD
try {
    $env:LOCK_CHECK_REDIS_PORT=[string]$State.redisPort
    $env:LOCK_CHECK_REDIS_PASSWORD=$Secret
    $Check=Start-Process -FilePath (Get-Command java).Source -ArgumentList "@$RunArgs" -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $Output 'checks.stdout.log') -RedirectStandardError (Join-Path $Output 'checks.stderr.log')
    $Check.WaitForExit()
} finally {
    $env:LOCK_CHECK_REDIS_PORT=$PreviousPort
    $env:LOCK_CHECK_REDIS_PASSWORD=$PreviousSecret
}
Get-Content (Join-Path $Output 'checks.stdout.log')|Where-Object{$_ -match '^DEADLOCK_OWNERSHIP_'}
Assert-Product
foreach($Item in $Inputs){if((Get-FileHash $Item.Path).Hash -ne $Item.Hash){throw 'Verification input changed'}}
foreach($Log in Get-ChildItem -LiteralPath $Output -Filter '*.log'){
    if([IO.File]::ReadAllText($Log.FullName).Contains($Secret)){throw 'Credential exposure detected; inspect without printing logs'}
}
'DEADLOCK_OWNERSHIP_INPUTS_UNCHANGED=true; REDIS_CREDENTIAL_SCAN=PASS'
[pscustomobject]@{ExitCode=$Check.ExitCode;BackendRound=$BackendRound;InputsUnchanged=$true;RedisCredentialScan='PASS'}|ConvertTo-Json|Set-Content (Join-Path $Output 'outcome.json') -Encoding utf8NoBOM
"A3_DEADLOCK_OWNERSHIP_DATABASE_EXIT=$($Check.ExitCode)"
if($Check.ExitCode){exit $Check.ExitCode}
