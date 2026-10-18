param([ValidatePattern('^r[1-9][0-9]*$')][string]$Round='r1',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$BackendRound='r11')
$ErrorActionPreference='Stop'
$Root='D:\CloudFlowPro'
. (Join-Path $Root '.cloudflow-runtime/use-data-drive.ps1')
$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
$Output=Join-Path $Evidence "a4-yearly-checks-20261003-$Round"
if(Test-Path -LiteralPath $Output){throw 'Previous checks retained'}
[IO.Directory]::CreateDirectory($Output)|Out-Null
$Product=Get-Content (Join-Path $Evidence "h3-portal-finance-20261002-backend-$BackendRound-inputs.json") -Raw|ConvertFrom-Json
function Assert-Product {foreach($Item in $Product){if((Get-FileHash (Join-Path $Root $Item.Path)).Hash -ne $Item.Hash){throw 'Product differs from build'}}}
Assert-Product
$Source=Join-Path $Root 'scripts/platform-checks/HolidayYearlyReminderChecks.java'
$Sources=@($Source,$PSCommandPath)
$Inputs=@($Sources|ForEach-Object{[pscustomobject]@{Path=$_;Hash=(Get-FileHash $_).Hash}})
$Inputs|ConvertTo-Json|Set-Content (Join-Path $Output 'inputs.json') -Encoding utf8NoBOM
$Classpath=(Join-Path $Root 'cloudflow-backend/cloudflow-auth/target/classes')+';'+(Get-Content (Join-Path $Root 'cloudflow-backend/cloudflow-auth/target/im-classpath.txt') -Raw).Trim()
$Compile=Join-Path $Output 'compile.args'
[IO.File]::WriteAllLines($Compile,@('-encoding','UTF-8','-proc:none','-classpath',('"'+$Classpath.Replace('\','/')+'"'),'-d',('"'+$Output.Replace('\','/')+'"'),('"'+$Source.Replace('\','/')+'"')),[Text.UTF8Encoding]::new($false))
& javac "@$Compile" *> (Join-Path $Output 'compile.log')
if($LASTEXITCODE -ne 0){throw 'Yearly reminder checks compilation failed'}
$RunArgs=Join-Path $Output 'run.args'
[IO.File]::WriteAllLines($RunArgs,@('-Xmx128m','-classpath',('"'+($Output+';'+$Classpath).Replace('\','/')+'"'),'com.cloudflow.auth.service.HolidayYearlyReminderChecks'),[Text.UTF8Encoding]::new($false))
& java "@$RunArgs" *> (Join-Path $Output 'checks.log')
if($LASTEXITCODE -ne 0){throw 'Yearly reminder service checks failed'}
Get-Content (Join-Path $Output 'checks.log')|Where-Object{$_ -match '^HOLIDAY_YEARLY_'}
& java scripts/java-style-checks/JavaExplicitTypeChecks.java . *> (Join-Path $Output 'java-types.log')
if($LASTEXITCODE -ne 0){throw 'Java explicit types failed'}
Assert-Product
foreach($InputFile in $Inputs){if((Get-FileHash $InputFile.Path).Hash -ne $InputFile.Hash){throw 'Verification source changed'}}
'A4_YEARLY_CHECKS_EXIT=0'
