param([Parameter(Mandatory=$true)][string]$StatePath)
$ErrorActionPreference='Stop'
. 'D:\CloudFlowPro\.cloudflow-runtime\use-data-drive.ps1'
$Root='D:\CloudFlowPro'
$Run=Join-Path $Root '.cloudflow-runtime/batch-g-integration/9799534e1a3a47b5958330f14ae16dc7'
if((Resolve-Path -LiteralPath $StatePath).Path -ne (Join-Path $Run 'state.json')){throw 'Owned state required'}
$State=Get-Content -LiteralPath $StatePath -Raw|ConvertFrom-Json
if($State.status -ne 'RUNNING' -or [IO.Path]::GetFullPath($State.run) -ne $Run){throw 'Owned running fixture required'}
$Module=Join-Path $Root 'cloudflow-backend/cloudflow-auth'
$Classpath=(Join-Path $Module 'target/classes')+[IO.Path]::PathSeparator+(Get-Content -LiteralPath (Join-Path $Module 'target/report-classpath.txt') -Raw).Trim()
$Output=Join-Path $Root ('cloudflow-backend/target/job-deletion-'+[Guid]::NewGuid().ToString('N'))
[IO.Directory]::CreateDirectory($Output)|Out-Null
$Sources=@((Join-Path $Module 'src/main/java/com/cloudflow/auth/service/JobPlatformService.java'),(Join-Path $Root 'scripts/job-checks/JobDeletionDatabaseChecks.java'))
$Inputs=@($Sources|ForEach-Object{[pscustomobject]@{Path=$_;Hash=(Get-FileHash -LiteralPath $_).Hash}})
$Compile=Join-Path $Output 'compile.args'
$CompileArgs=@('-encoding','UTF-8','-cp',('"'+$Classpath.Replace('\','/')+'"'),'-d',('"'+$Output.Replace('\','/')+'"'))
$CompileArgs+=$Sources|ForEach-Object{'"'+$_.Replace('\','/')+'"'}
[IO.File]::WriteAllLines($Compile,$CompileArgs,[Text.UTF8Encoding]::new($false))
& javac "@$Compile"
if($LASTEXITCODE -ne 0){throw 'Job deletion checks compile failed'}
$JavaRun=Join-Path $Output 'run.args'
$Database="jdbc:mysql://127.0.0.1:$($State.mysqlPort)/cloud_flow_db?useSSL=false&allowPublicKeyRetrieval=true&serverTimezone=Asia/Shanghai&characterEncoding=UTF-8"
[IO.File]::WriteAllLines($JavaRun,@('-Dfile.encoding=UTF-8','-cp',('"'+($Output+[IO.Path]::PathSeparator+$Classpath).Replace('\','/')+'"'),'com.cloudflow.auth.service.JobDeletionDatabaseChecks',('"'+$Database+'"'),('"'+(Join-Path $Run 'mysql-data').Replace('\','/')+'"')),[Text.UTF8Encoding]::new($false))
& java "@$JavaRun"
if($LASTEXITCODE -ne 0){throw 'Job deletion database checks failed'}
foreach($Item in $Inputs){if((Get-FileHash -LiteralPath $Item.Path).Hash -ne $Item.Hash){throw 'Job deletion inputs changed'}}
'JOB_DELETE_SOURCE_INPUTS: files=2; changed=0'
