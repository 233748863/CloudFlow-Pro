param([ValidatePattern('^r[1-9][0-9]*$')][string]$Round='r1',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$BackendRound='r21')
$ErrorActionPreference='Stop'
$Root='D:\CloudFlowPro'
. (Join-Path $Root '.cloudflow-runtime/use-data-drive.ps1')
$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
$Output=Join-Path $Evidence "a3-reconcile-bindings-checks-20261003-$Round"
if(Test-Path -LiteralPath $Output){throw 'Previous evidence retained'}
[IO.Directory]::CreateDirectory($Output)|Out-Null
$Product=Get-Content (Join-Path $Evidence "h3-portal-finance-20261002-backend-$BackendRound-inputs.json") -Raw|ConvertFrom-Json
function Assert-Product {foreach($Item in $Product){if((Get-FileHash (Join-Path $Root $Item.Path)).Hash -ne $Item.Hash){throw 'Product differs from build'}}}
Assert-Product
$Run=Join-Path $Root '.cloudflow-runtime/batch-g-integration/9799534e1a3a47b5958330f14ae16dc7'
$State=Get-Content (Join-Path $Run 'state.json') -Raw|ConvertFrom-Json
if($State.status -ne 'RUNNING' -or [IO.Path]::GetFullPath($State.run) -ne $Run){throw 'Owned running database required'}
$Mysql=@($State.processes|Where-Object{$_.name -eq 'mysql'})
if($Mysql.Count -ne 1){throw 'Unique owned mysql required'}
$Observed=Get-CimInstance Win32_Process -Filter "ProcessId=$($Mysql[0].id)"
if(-not $Observed -or -not $Observed.CommandLine.Contains($Mysql[0].marker)){throw 'Owned mysql process mismatch'}
$Source=Join-Path $Root 'scripts/job-checks/ReconcileBindingDatabaseChecks.java'
$ServiceArgs=Join-Path $Run 'workflow/service.args'
$Inputs=@(@($Source,(Join-Path $Root 'scripts/job-checks/ReconcileBindingFixtures.xml'),$PSCommandPath,$ServiceArgs)|ForEach-Object{[pscustomobject]@{Path=$_;Hash=(Get-FileHash $_).Hash}})
$Inputs|ConvertTo-Json|Set-Content (Join-Path $Output 'inputs.json') -Encoding utf8NoBOM
$Lines=Get-Content -LiteralPath $ServiceArgs
$Indices=@(0..($Lines.Count-1)|Where-Object{$Lines[$_] -match '^"?(-cp|-classpath|--class-path)"?$'})
if($Indices.Count -ne 1){throw 'Unique service classpath required'}
$Classpath=$Lines[$Indices[0]+1].Trim('"')
foreach($Entry in $Classpath.Split(';')){if([IO.Path]::GetPathRoot((Resolve-Path -LiteralPath $Entry).Path) -ne 'D:\'){throw 'Only data drive dependencies allowed'}}
$Compile=Join-Path $Output 'compile.args'
[IO.File]::WriteAllLines($Compile,@('-encoding','UTF-8','-proc:none','-classpath',('"'+$Classpath.Replace('\','/')+'"'),'-d',('"'+$Output.Replace('\','/')+'"'),('"'+$Source.Replace('\','/')+'"')),[Text.UTF8Encoding]::new($false))
& javac "@$Compile" *> (Join-Path $Output 'compile.log')
if($LASTEXITCODE){throw 'Binding checks compilation failed; evidence retained'}
$RunArgs=Join-Path $Output 'run.args'
$Jdbc="jdbc:mysql://127.0.0.1:$($State.mysqlPort)/cloud_flow_db?useSSL=false&allowPublicKeyRetrieval=true&serverTimezone=Asia/Shanghai&characterEncoding=utf8"
[IO.File]::WriteAllLines($RunArgs,@('-Xmx256m','-classpath',('"'+($Output+';'+$Classpath).Replace('\','/')+'"'),'com.cloudflow.workflow.job.ReconcileBindingDatabaseChecks',('"'+$Jdbc+'"'),('"'+(Join-Path $Run 'mysql-data').Replace('\','/')+'"')),[Text.UTF8Encoding]::new($false))
& java "@$RunArgs" *> (Join-Path $Output 'checks.log')
if($LASTEXITCODE){throw 'Real binding database checks failed; transaction closed and evidence retained'}
Get-Content (Join-Path $Output 'checks.log')|Where-Object{$_ -match '^RECONCILE_BINDINGS_DATABASE:'}
& java scripts/java-style-checks/JavaExplicitTypeChecks.java . *> (Join-Path $Output 'java-types.log')
if($LASTEXITCODE){throw 'Java explicit types failed'}
Assert-Product
foreach($Item in $Inputs){if((Get-FileHash $Item.Path).Hash -ne $Item.Hash){throw 'Verification input changed'}}
'A3_RECONCILE_BINDINGS_CHECKS_EXIT=0'
