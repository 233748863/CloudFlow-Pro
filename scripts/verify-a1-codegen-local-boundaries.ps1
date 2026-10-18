param([Parameter(Mandatory)][ValidatePattern('^r[1-9][0-9]*$')][string]$Round)
$ErrorActionPreference='Stop'
. 'D:\CloudFlowPro\.cloudflow-runtime\use-data-drive.ps1'
$Root='D:\CloudFlowPro'
$Output=Join-Path $Root ".cloudflow-runtime/full-prd-20260915/approved-runtime/a1-codegen-local-boundaries-20261016-$Round"
if(Test-Path -LiteralPath $Output){throw 'Boundary evidence already exists'}
[IO.Directory]::CreateDirectory($Output)|Out-Null
$Layer=Join-Path 'D:\CloudFlowProCache\h3-core-artifacts\hr' '6b378fe2a8026a4dd8890c6c7ad1024d22ecae43b4af269d229542ecf5039a39-layered'
$Auth=Join-Path $Root 'cloudflow-backend/cloudflow-auth/target/classes'
$Libraries=@(Get-ChildItem -LiteralPath (Join-Path $Layer 'BOOT-INF/lib') -File -Filter '*.jar'|Sort-Object Name|ForEach-Object FullName)
$Libraries+=@('D:\CloudFlowProCache\m2\repository\net\java\dev\jna\jna\5.15.0\jna-5.15.0.jar','D:\CloudFlowProCache\m2\repository\net\java\dev\jna\jna-platform\5.15.0\jna-platform-5.15.0.jar')
$Classpath=(@($Auth)+$Libraries)-join [IO.Path]::PathSeparator
$Sources=@('scripts/platform-checks/CodegenBoundaryChecks.java','scripts/codegen-checks/GeneratedInnerHttpChecks.java')|ForEach-Object{Join-Path $Root $_}
$Classes=Join-Path $Output 'classes'
[IO.Directory]::CreateDirectory($Classes)|Out-Null
$Inputs=@($Sources)+$Libraries+@(Get-ChildItem -LiteralPath (Join-Path $Auth 'com/cloudflow/auth') -Recurse -File|Where-Object{$_.FullName -match 'Codegen'}|ForEach-Object FullName)
$Hashes=@($Inputs|ForEach-Object{[pscustomobject]@{Path=$_;Hash=(Get-FileHash -LiteralPath $_).Hash}})
$Passed=$false
$Failure=$null
try{
    $CompileArgs=Join-Path $Output 'compile.args'
    [IO.File]::WriteAllLines($CompileArgs,@('-encoding','UTF-8','--release','17','-cp',('"'+$Classpath.Replace('\','/')+'"'),'-d',('"'+$Classes.Replace('\','/')+'"'))+@($Sources|ForEach-Object{'"'+$_.Replace('\','/')+'"'}),[Text.UTF8Encoding]::new($false))
    & (Join-Path $env:JAVA_HOME 'bin/javac.exe') ('@'+$CompileArgs) *> (Join-Path $Output 'compile.log')
    if($LASTEXITCODE -ne 0){throw 'Boundary harness compilation failed'}
    $RunArgs=Join-Path $Output 'run.args'
    [IO.File]::WriteAllLines($RunArgs,@('-Dfile.encoding=UTF-8','-cp',('"'+($Classes+[IO.Path]::PathSeparator+$Classpath).Replace('\','/')+'"'),'CodegenBoundaryChecks',('"'+$Output.Replace('\','/')+'"')),[Text.UTF8Encoding]::new($false))
    & (Join-Path $env:JAVA_HOME 'bin/java.exe') ('@'+$RunArgs) *> (Join-Path $Output 'run.log')
    if($LASTEXITCODE -ne 0){throw 'Actual product boundary checks failed'}
    foreach($Entry in $Hashes){if((Get-FileHash -LiteralPath $Entry.Path).Hash -ne $Entry.Hash){throw 'Boundary input changed'}}
    $Passed=$true
}catch{$Failure=$_.Exception.Message}finally{
    $Hashes|ConvertTo-Json -Depth 4|Set-Content -LiteralPath (Join-Path $Output 'inputs.json') -Encoding utf8NoBOM
    @{passed=$Passed;failure=$Failure;actualProductService=$true;databaseWritten=$false;referenceRuntimeWritten=$false;linuxExecuted=$false}|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $Output 'result.json') -Encoding utf8NoBOM
}
Get-Content -LiteralPath (Join-Path $Output 'compile.log') -Tail 12
if(Test-Path -LiteralPath (Join-Path $Output 'run.log')){Get-Content -LiteralPath (Join-Path $Output 'run.log') -Tail 18}
if(-not $Passed){throw $Failure}
