param([ValidatePattern('^r[1-9][0-9]*$')][string]$Round='r1')
$ErrorActionPreference='Stop'
. 'D:\CloudFlowPro\.cloudflow-runtime/use-data-drive.ps1'
$Root='D:\CloudFlowPro'
$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
$Output=Join-Path $Evidence "a3-internal-auth-checks-20261002-$Round"
if(Test-Path -LiteralPath $Output){throw 'Retain existing evidence'}
[IO.Directory]::CreateDirectory($Output)|Out-Null
$Classpath=(Join-Path $Root 'cloudflow-backend/cloudflow-auth/target/classes')+';'+(Get-Content -LiteralPath (Join-Path $Root 'cloudflow-backend/cloudflow-auth/target/im-classpath.txt') -Raw).Trim()
$Source=Join-Path $Root 'scripts/job-checks/JobInternalAuthenticationChecks.java'
$ArgsFile=Join-Path $Output 'compile.args'
[IO.File]::WriteAllLines($ArgsFile,@('-encoding','UTF-8','-proc:none','-classpath',('"'+$Classpath.Replace('\','/')+'"'),'-d',('"'+$Output.Replace('\','/')+'"'),('"'+$Source.Replace('\','/')+'"')),[Text.UTF8Encoding]::new($false))
& javac "@$ArgsFile" *> (Join-Path $Output 'compile.log')
if($LASTEXITCODE -ne 0){throw 'Job authentication checks compilation failed; retained log'}
$State=Join-Path $Root '.cloudflow-runtime/batch-g-integration/9799534e1a3a47b5958330f14ae16dc7/state.json'
$RunArgs=Join-Path $Output 'run.args'
[IO.File]::WriteAllLines($RunArgs,@('-classpath',('"'+($Output+';'+$Classpath).Replace('\','/')+'"'),'com.cloudflow.job.checks.JobInternalAuthenticationChecks',('"'+$State.Replace('\','/')+'"')),[Text.UTF8Encoding]::new($false))
& java "@$RunArgs" *> (Join-Path $Output 'checks.log')
if($LASTEXITCODE -ne 0){throw 'Job authentication checks failed; retained log'}
Get-Content -LiteralPath (Join-Path $Output 'checks.log')|Where-Object{$_ -match '^JOB_INTERNAL_AUTH_CHECKS:'}
