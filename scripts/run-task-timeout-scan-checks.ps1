param([ValidatePattern('^r[1-9][0-9]*$')][string]$Round='r1',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$BackendRound='r23')
$ErrorActionPreference='Stop'
$Root='D:\CloudFlowPro'
. (Join-Path $Root '.cloudflow-runtime/use-data-drive.ps1')
$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
$Output=Join-Path $Evidence "a3-task-timeout-checks-20261003-$Round"
if(Test-Path -LiteralPath $Output){throw 'Previous evidence retained'}
[IO.Directory]::CreateDirectory($Output)|Out-Null
$Product=Get-Content (Join-Path $Evidence "h3-portal-finance-20261002-backend-$BackendRound-inputs.json") -Raw|ConvertFrom-Json
function Assert-Product {foreach($Item in $Product){if((Get-FileHash (Join-Path $Root $Item.Path)).Hash -ne $Item.Hash){throw 'Product differs from build'}}}
Assert-Product
$Source=Join-Path $Root 'scripts/job-checks/TaskTimeoutScanChecks.java'
$ServiceArgs=Join-Path $Root '.cloudflow-runtime/batch-g-integration/9799534e1a3a47b5958330f14ae16dc7/workflow/service.args'
$BatchSources=@('WorkflowBatchBChecks.java','WorkflowBatchBConfigChecks.java','WorkflowMonitorMappingChecks.java','WorkflowGatewayModelChecks.java','WorkflowNodeEventOrderingChecks.java','WorkflowBusinessLockFixture.java')|ForEach-Object{Join-Path $Root "scripts/workflow-checks/$_"}
$Sources=@($Source)+@($BatchSources)
$Inputs=@(@($Sources)+@($PSCommandPath,$ServiceArgs)|ForEach-Object{[pscustomobject]@{Path=$_;Hash=(Get-FileHash $_).Hash}})
$Inputs|ConvertTo-Json|Set-Content (Join-Path $Output 'inputs.json') -Encoding utf8NoBOM
$Lines=Get-Content -LiteralPath $ServiceArgs
$Indices=@(0..($Lines.Count-1)|Where-Object{$Lines[$_] -match '^"?(-cp|-classpath|--class-path)"?$'})
if($Indices.Count -ne 1){throw 'Unique service classpath required'}
$Classpath=$Lines[$Indices[0]+1].Trim('"')
foreach($Entry in $Classpath.Split(';')){if([IO.Path]::GetPathRoot((Resolve-Path -LiteralPath $Entry).Path) -ne 'D:\'){throw 'Only data drive dependencies allowed'}}
$Compile=Join-Path $Output 'compile.args'
$CompileLines=@('-encoding','UTF-8','-proc:none','-classpath',('"'+$Classpath.Replace('\','/')+'"'),'-d',('"'+$Output.Replace('\','/')+'"'))+@($Sources|ForEach-Object{'"'+$_.Replace('\','/')+'"'})
[IO.File]::WriteAllLines($Compile,$CompileLines,[Text.UTF8Encoding]::new($false))
& javac "@$Compile" *> (Join-Path $Output 'compile.log')
if($LASTEXITCODE){throw 'Task timeout checks compilation failed'}
$RunArgs=Join-Path $Output 'run.args'
[IO.File]::WriteAllLines($RunArgs,@('-Xmx128m','-classpath',('"'+($Output+';'+$Classpath).Replace('\','/')+'"'),'com.cloudflow.workflow.job.TaskTimeoutScanChecks'),[Text.UTF8Encoding]::new($false))
& java "@$RunArgs" *> (Join-Path $Output 'checks.log')
if($LASTEXITCODE){throw 'Task timeout task rules failed'}
Get-Content (Join-Path $Output 'checks.log')|Where-Object{$_ -match '^TASK_TIMEOUT_'}
$BatchArgs=Join-Path $Output 'batch-b.args'
[IO.File]::WriteAllLines($BatchArgs,@('-Xmx256m','-classpath',('"'+($Output+';'+$Classpath).Replace('\','/')+'"'),'WorkflowBatchBChecks'),[Text.UTF8Encoding]::new($false))
& java "@$BatchArgs" *> (Join-Path $Output 'batch-b.log')
if($LASTEXITCODE){throw 'Adjacent workflow rules failed'}
Get-Content (Join-Path $Output 'batch-b.log')|Where-Object{$_ -match '^PASS:'}
& java scripts/java-style-checks/JavaExplicitTypeChecks.java . *> (Join-Path $Output 'java-types.log')
if($LASTEXITCODE){throw 'Java explicit types failed'}
Assert-Product
foreach($Item in $Inputs){if((Get-FileHash $Item.Path).Hash -ne $Item.Hash){throw 'Verification input changed'}}
'A3_TASK_TIMEOUT_CHECKS_EXIT=0'
