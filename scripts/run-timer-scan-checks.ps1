param([ValidatePattern('^r[1-9][0-9]*$')][string]$Round='r1',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$BackendRound='r26')
$ErrorActionPreference='Stop'
$Root='D:\CloudFlowPro'
. (Join-Path $Root '.cloudflow-runtime/use-data-drive.ps1')
$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
$Output=Join-Path $Evidence "a3-timer-scan-checks-20261003-$Round"
if(Test-Path -LiteralPath $Output){throw 'Previous evidence retained'}
[IO.Directory]::CreateDirectory($Output)|Out-Null
$Product=Get-Content (Join-Path $Evidence "h3-portal-finance-20261002-backend-$BackendRound-inputs.json") -Raw|ConvertFrom-Json
function Assert-Product {foreach($Item in $Product){if((Get-FileHash (Join-Path $Root $Item.Path)).Hash -ne $Item.Hash){throw 'Product differs from build'}}}
Assert-Product
$ServiceArgs=Join-Path $Root '.cloudflow-runtime/batch-g-integration/9799534e1a3a47b5958330f14ae16dc7/workflow/service.args'
$Sources=@('scripts/job-checks/TimerScanChecks.java','scripts/workflow-checks/WorkflowBatchBChecks.java','scripts/workflow-checks/WorkflowBusinessLockFixture.java',
    'scripts/workflow-checks/WorkflowBatchBConfigChecks.java','scripts/workflow-checks/WorkflowMonitorMappingChecks.java',
    'scripts/workflow-checks/WorkflowGatewayModelChecks.java','scripts/workflow-checks/WorkflowNodeEventOrderingChecks.java')|ForEach-Object{Join-Path $Root $_}
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
& javac '-J-Dfile.encoding=UTF-8' "@$Compile" *> (Join-Path $Output 'compile.log')
if($LASTEXITCODE){throw 'Timer checks compilation failed'}
foreach($Check in @(@{Name='timer';Main='com.cloudflow.workflow.job.TimerScanChecks'},@{Name='batch-b';Main='WorkflowBatchBChecks'})){
    $ArgsFile=Join-Path $Output "$($Check.Name).args"
    [IO.File]::WriteAllLines($ArgsFile,@('-Xmx256m','-classpath',('"'+($Output+';'+$Classpath).Replace('\','/')+'"'),$Check.Main),[Text.UTF8Encoding]::new($false))
    & java "@$ArgsFile" *> (Join-Path $Output "$($Check.Name).log")
    if($LASTEXITCODE){throw "$($Check.Name) rules failed"}
    Get-Content (Join-Path $Output "$($Check.Name).log")|Where-Object{$_ -match '^TIMER_SCAN_|^PASS:'}
}
& java scripts/java-style-checks/JavaExplicitTypeChecks.java . *> (Join-Path $Output 'java-types.log')
if($LASTEXITCODE){throw 'Java explicit types failed'}
Assert-Product
foreach($Item in $Inputs){if((Get-FileHash $Item.Path).Hash -ne $Item.Hash){throw 'Verification input changed'}}
'A3_TIMER_SCAN_CHECKS_EXIT=0'
