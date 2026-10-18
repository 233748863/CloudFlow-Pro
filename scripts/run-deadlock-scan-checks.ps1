param([ValidatePattern('^r[1-9][0-9]*$')][string]$Round='r1')
$ErrorActionPreference='Stop'
$Root='D:\CloudFlowPro'
. (Join-Path $Root '.cloudflow-runtime/use-data-drive.ps1')
$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
$Output=Join-Path $Evidence "a3-deadlock-scan-checks-20261003-$Round"
if(Test-Path -LiteralPath $Output){throw 'Previous evidence retained'}
[IO.Directory]::CreateDirectory($Output)|Out-Null
$ServiceArgs=Join-Path $Root '.cloudflow-runtime/batch-g-integration/9799534e1a3a47b5958330f14ae16dc7/workflow/service.args'
$Sources=@('cloudflow-backend/cloudflow-service-workflow/src/main/java/com/cloudflow/workflow/service/DeadlockDetectionService.java','scripts/job-checks/DeadlockScanChecks.java')|ForEach-Object{Join-Path $Root $_}
$Inputs=@(@($Sources)+@($PSCommandPath,$ServiceArgs)|ForEach-Object{[pscustomobject]@{Path=$_;Hash=(Get-FileHash $_).Hash}})
$Inputs|ConvertTo-Json|Set-Content (Join-Path $Output 'inputs.json') -Encoding utf8NoBOM
$Lines=Get-Content -LiteralPath $ServiceArgs
$Indices=@(0..($Lines.Count-1)|Where-Object{$Lines[$_] -match '^"?(-cp|-classpath|--class-path)"?$'})
if($Indices.Count -ne 1){throw 'Unique service classpath required'}
$Classpath=$Lines[$Indices[0]+1].Trim('"')
foreach($Entry in $Classpath.Split(';')){if([IO.Path]::GetPathRoot((Resolve-Path -LiteralPath $Entry).Path) -ne 'D:\'){throw 'Only data drive dependencies allowed'}}
$Compile=Join-Path $Output 'compile.args'
[IO.File]::WriteAllLines($Compile,@('-encoding','UTF-8','-proc:none','-classpath',('"'+$Classpath.Replace('\','/')+'"'),'-d',('"'+$Output.Replace('\','/')+'"'))+@($Sources|ForEach-Object{'"'+$_.Replace('\','/')+'"'}),[Text.UTF8Encoding]::new($false))
& javac '-J-Dfile.encoding=UTF-8' "@$Compile" *> (Join-Path $Output 'compile.log')
if($LASTEXITCODE){throw 'Deadlock checks compilation failed'}
$RunArgs=Join-Path $Output 'run.args'
[IO.File]::WriteAllLines($RunArgs,@('-Xmx256m','-classpath',('"'+($Output+';'+$Classpath).Replace('\','/')+'"'),'com.cloudflow.workflow.service.DeadlockScanChecks'),[Text.UTF8Encoding]::new($false))
& java "@$RunArgs" *> (Join-Path $Output 'rules.log')
if($LASTEXITCODE){throw 'Deadlock rules failed'}
Get-Content (Join-Path $Output 'rules.log')|Where-Object{$_ -match '^DEADLOCK_SCAN_'}
foreach($Item in $Inputs){if((Get-FileHash $Item.Path).Hash -ne $Item.Hash){throw 'Verification input changed'}}
'A3_DEADLOCK_SCAN_CHECKS_EXIT=0'
