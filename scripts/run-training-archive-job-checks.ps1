param([ValidatePattern('^r[1-9][0-9]*$')][string]$Round='r1',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$BackendRound='r13')
$ErrorActionPreference='Stop'
$Root='D:\CloudFlowPro'
. (Join-Path $Root '.cloudflow-runtime/use-data-drive.ps1')
$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
$Output=Join-Path $Evidence "a3-training-checks-20261003-$Round"
if(Test-Path -LiteralPath $Output){throw 'Previous checks retained'}
[IO.Directory]::CreateDirectory($Output)|Out-Null
$Product=Get-Content (Join-Path $Evidence "h3-portal-finance-20261002-backend-$BackendRound-inputs.json") -Raw|ConvertFrom-Json
function Assert-Product {foreach($Item in $Product){if((Get-FileHash (Join-Path $Root $Item.Path)).Hash -ne $Item.Hash){throw 'Product differs from build'}}}
Assert-Product
$Source=Join-Path $Root 'scripts/hr-checks/TrainingArchiveJobChecks.java'
$Inputs=@(@($Source,$PSCommandPath)|ForEach-Object{[pscustomobject]@{Path=$_;Hash=(Get-FileHash $_).Hash}})
$Inputs|ConvertTo-Json|Set-Content (Join-Path $Output 'inputs.json') -Encoding utf8NoBOM
$Classpath=(Join-Path $Root 'cloudflow-backend/cloudflow-service-hr/target/classes')+';'+(Get-Content (Join-Path $Root 'cloudflow-backend/cloudflow-service-hr/target/batch-d-classpath.txt') -Raw).Trim()
$Compile=Join-Path $Output 'compile.args'
[IO.File]::WriteAllLines($Compile,@('-encoding','UTF-8','-proc:none','-classpath',('"'+$Classpath.Replace('\','/')+'"'),'-d',('"'+$Output.Replace('\','/')+'"'),('"'+$Source.Replace('\','/')+'"')),[Text.UTF8Encoding]::new($false))
& javac "@$Compile" *> (Join-Path $Output 'compile.log')
if($LASTEXITCODE){throw 'Training archive checks compilation failed'}
$RunArgs=Join-Path $Output 'run.args'
[IO.File]::WriteAllLines($RunArgs,@('-Xmx128m','-classpath',('"'+($Output+';'+$Classpath).Replace('\','/')+'"'),'com.cloudflow.hr.job.TrainingArchiveJobChecks'),[Text.UTF8Encoding]::new($false))
& java "@$RunArgs" *> (Join-Path $Output 'checks.log')
if($LASTEXITCODE){throw 'Training archive task rules failed'}
Get-Content (Join-Path $Output 'checks.log')|Where-Object{$_ -match '^TRAINING_'}
& java scripts/java-style-checks/JavaExplicitTypeChecks.java . *> (Join-Path $Output 'java-types.log')
if($LASTEXITCODE){throw 'Java explicit types failed'}
Assert-Product
foreach($Item in $Inputs){if((Get-FileHash $Item.Path).Hash -ne $Item.Hash){throw 'Verification input changed'}}
'A3_TRAINING_CHECKS_EXIT=0'
