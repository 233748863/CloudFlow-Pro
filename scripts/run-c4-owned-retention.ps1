param([ValidatePattern('^r[1-9][0-9]*$')][string]$Round='r1')
$ErrorActionPreference='Stop'
. 'D:\CloudFlowPro\.cloudflow-runtime\use-data-drive.ps1'
$Root='D:\CloudFlowPro'
$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
$Output=Join-Path $Evidence "c4-owned-retention-20261005-$Round"
if(Test-Path -LiteralPath $Output){throw 'Retain previous retention evidence'}
[IO.Directory]::CreateDirectory($Output)|Out-Null
$Module=Join-Path $Root 'cloudflow-backend/cloudflow-service-workflow'
$DependencyFile=Join-Path $Module 'target/batch-c-classpath.txt'
$Inputs=@(Get-Content -LiteralPath (Join-Path $Evidence 'h3-portal-finance-20261002-backend-r77-inputs.json') -Raw|ConvertFrom-Json)
foreach($File in @('scripts/run-c4-owned-retention.ps1','scripts/form-checks/C4OwnedRetention.java','cloudflow-backend/cloudflow-service-workflow/target/batch-c-classpath.txt')){
    $Inputs += [pscustomobject]@{Path=$File;Hash=(Get-FileHash -LiteralPath (Join-Path $Root $File)).Hash}
}
function Assert-Inputs {foreach($Input in $Inputs){if((Get-FileHash -LiteralPath (Join-Path $Root $Input.Path)).Hash -ne $Input.Hash){throw 'Retention input changed'}}}
Assert-Inputs
$Inputs|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $Output 'inputs.json') -Encoding utf8NoBOM
$Dependencies=(Get-Content -LiteralPath $DependencyFile -Raw).Trim()
$Classpath=(Join-Path $Module 'target/classes')+[IO.Path]::PathSeparator+$Dependencies
$Sources=@('service/WorkflowFormVersionService.java','service/WorkflowFormVersionDiff.java','mapper/WfFormDefinitionMapper.java')|ForEach-Object{Join-Path $Module ('src/main/java/com/cloudflow/workflow/'+$_)}
$Sources+=Join-Path $Root 'scripts/form-checks/C4OwnedRetention.java'
$CompileFile=Join-Path $Output 'compile.args'
[IO.File]::WriteAllLines($CompileFile,@('-encoding','UTF-8','-cp',('"'+$Classpath.Replace('\','/')+'"'),'-d',('"'+$Output.Replace('\','/')+'"'))+@($Sources|ForEach-Object{'"'+$_.Replace('\','/')+'"'}),[Text.UTF8Encoding]::new($false))
$LogConfig=Join-Path $Output 'logback.xml'
[IO.File]::WriteAllText($LogConfig,'<configuration><root level="OFF"/></configuration>',[Text.UTF8Encoding]::new($false))
$Step='compile'
try {
    & javac "@$CompileFile" *> (Join-Path $Output 'compile.log')
    if($LASTEXITCODE -ne 0){throw 'Retention helper compilation failed'}
    $Step='owned-database'
    $ArgumentsFile=Join-Path $Output 'run.args'
    $State=Join-Path $Root '.cloudflow-runtime/batch-g-integration/9799534e1a3a47b5958330f14ae16dc7/state.json'
    [IO.File]::WriteAllLines($ArgumentsFile,@('-Dfile.encoding=UTF-8','-Dstdout.encoding=UTF-8','-Dstderr.encoding=UTF-8',('"-Dlogback.configurationFile='+$LogConfig.Replace('\','/')+'"'),'-cp',('"'+($Output+[IO.Path]::PathSeparator+$Classpath).Replace('\','/')+'"'),'C4OwnedRetention',('"'+$State.Replace('\','/')+'"')),[Text.UTF8Encoding]::new($false))
    & java "@$ArgumentsFile" *> (Join-Path $Output 'retention.log')
    if($LASTEXITCODE -ne 0){throw 'Owned retention verification failed; safe diagnostics retained'}
    $Lines=@(Get-Content -LiteralPath (Join-Path $Output 'retention.log')|Where-Object{$_ -match '^C4_OWNED_RETENTION_RESULT='})
    if($Lines.Count -ne 1){throw 'Retention result missing'}
    $Result=$Lines[0].Substring('C4_OWNED_RETENTION_RESULT='.Length)|ConvertFrom-Json
    if(-not $Result.realService -or -not $Result.realMapper -or -not $Result.temporaryDatabaseRemoved -or $Result.applicationDatabaseWrites -ne 0 -or $Result.latestRetained -ne 20 -or $Result.referencedRetained -ne 3 -or $Result.obsoleteRemoved -ne 2){throw 'Retention scope incomplete'}
    Assert-Inputs
    [ordered]@{passed=$true;backend='r77';inputs=$Inputs.Count;result=$Result;productionModified=$false}|ConvertTo-Json -Depth 5|Set-Content -LiteralPath (Join-Path $Output 'result.json') -Encoding utf8NoBOM
    "C4_OWNED_RETENTION: checks=$($Result.checks); inputs=$($Inputs.Count); changed=0; latest=20; referenced=3; removed=2; temporary_database_removed=true; application_database_writes=0; passed=true"|Tee-Object -FilePath (Join-Path $Output 'summary.log')
}catch{
    [ordered]@{passed=$false;step=$Step;productionModified=$false}|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $Output 'result.json') -Encoding utf8NoBOM
    throw
}finally{Assert-Inputs}
