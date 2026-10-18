param([ValidatePattern('^r[1-9][0-9]*$')][string]$Round='r1',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$BackendRound='r10')
$ErrorActionPreference='Stop'
$Root='D:\CloudFlowPro'
. (Join-Path $Root '.cloudflow-runtime/use-data-drive.ps1')
$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
$Output=Join-Path $Evidence "a3-report-routing-checks-20261002-$Round"
if(Test-Path -LiteralPath $Output){throw 'Previous verification evidence retained'}
[IO.Directory]::CreateDirectory($Output)|Out-Null
$Product=@(Get-Content (Join-Path $Evidence "h3-portal-finance-20261002-backend-$BackendRound-inputs.json") -Raw|ConvertFrom-Json)
function Assert-Product {
    foreach($Item in $Product){if((Get-FileHash (Join-Path $Root $Item.Path)).Hash -ne $Item.Hash){throw 'Product differs from completed build'}}
}
Assert-Product
$Classpath=(Join-Path $Root 'cloudflow-backend/cloudflow-auth/target/classes')+';'+(Get-Content (Join-Path $Root 'cloudflow-backend/cloudflow-auth/target/im-classpath.txt') -Raw).Trim()
$Sources=@('scripts/job-checks/JobReportRoutingChecks.java','scripts/job-checks/JobInternalAuthenticationChecks.java','scripts/platform-checks/JobExecutionChecks.java')
$Sources+=@(Get-ChildItem (Join-Path $Root 'scripts/im-checks') -File -Filter '*.java'|ForEach-Object{$_.FullName})
$InputFiles=@($Sources)+@('scripts/run-job-report-routing-checks.ps1')
$Inputs=@($InputFiles|ForEach-Object{[pscustomobject]@{Path=$_;Hash=(Get-FileHash $_).Hash}})
$Inputs|ConvertTo-Json|Set-Content (Join-Path $Output 'inputs.json') -Encoding utf8NoBOM
$Compile=Join-Path $Output 'compile.args'
[IO.File]::WriteAllLines($Compile,@('-encoding','UTF-8','-proc:none','-classpath',('"'+$Classpath.Replace('\','/')+'"'),'-d',('"'+$Output.Replace('\','/')+'"'))+@($Sources|ForEach-Object{'"'+(Join-Path $Root (Resolve-Path $_ -Relative)).Replace('\','/')+'"'}),[Text.UTF8Encoding]::new($false))
& javac "@$Compile" *> (Join-Path $Output 'compile.log')
if($LASTEXITCODE -ne 0){throw 'Routing and adjacent checks compilation failed; retain diagnostics'}
$State=Join-Path $Root '.cloudflow-runtime/batch-g-integration/9799534e1a3a47b5958330f14ae16dc7/state.json'
foreach($Test in @('com.cloudflow.job.checks.JobReportRoutingChecks','com.cloudflow.job.checks.JobInternalAuthenticationChecks','com.cloudflow.common.job.service.JobExecutionChecks')){
    $Name=$Test.Split('.')[-1];$RunArgs=Join-Path $Output "$Name.args"
    $Arguments=@('-Xmx256m','-classpath',('"'+($Output+';'+$Classpath).Replace('\','/')+'"'),$Test)
    if($Name -eq 'JobInternalAuthenticationChecks'){$Arguments+=('"'+$State.Replace('\','/')+'"')}
    [IO.File]::WriteAllLines($RunArgs,$Arguments,[Text.UTF8Encoding]::new($false))
    & java "@$RunArgs" *> (Join-Path $Output "$Name.log")
    if($LASTEXITCODE -ne 0){throw "Check failed: $Name; retained diagnostics"}
    Get-Content (Join-Path $Output "$Name.log")|Where-Object{$_ -match '^JOB_|^PASS:'}
}
& java scripts/java-style-checks/JavaExplicitTypeChecks.java . *> (Join-Path $Output 'java-types.log')
if($LASTEXITCODE -ne 0){throw 'Java explicit types failed'}
Assert-Product
foreach($InputFile in $Inputs){if((Get-FileHash $InputFile.Path).Hash -ne $InputFile.Hash){throw 'Verification source changed'}}
"A3_REPORT_ROUTING_CHECKS: input_files=$($Inputs.Count); changed=0; backend=$BackendRound; real_protocols=true; controlled_discovery=true; current_runtime_verified=false; exit=0"
