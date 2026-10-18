param([Parameter(Mandatory=$true)][ValidatePattern('^r[1-9][0-9]*$')][string]$Round,
    [Parameter(Mandatory=$true)][ValidatePattern('^r[1-9][0-9]*$')][string]$BackendRound)
$ErrorActionPreference='Stop'
. 'D:\CloudFlowPro\.cloudflow-runtime\use-data-drive.ps1'
$Root='D:\CloudFlowPro'
$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
$Output=Join-Path $Evidence "h3-commission-wire-20261011-$Round"
if(Test-Path -LiteralPath $Output){throw 'Retain earlier commission wire evidence'}
[IO.Directory]::CreateDirectory($Output)|Out-Null
$BuildInputs=Join-Path $Evidence "h3-portal-finance-20261002-backend-$BackendRound-inputs.json"
$Inputs=@(Get-Content -LiteralPath $BuildInputs -Raw|ConvertFrom-Json)
foreach($Relative in @('scripts/run-h3-commission-wire.ps1','scripts/hr-checks/HrCommissionWireChecks.java')){
    $Source=Join-Path $Root $Relative
    $Copy=Join-Path $Output ('originals/'+$Relative)
    [IO.Directory]::CreateDirectory((Split-Path -Parent $Copy))|Out-Null
    [IO.File]::Copy($Source,$Copy,$false)
    $Inputs+=[pscustomobject]@{Path=$Source;Hash=(Get-FileHash -LiteralPath $Source).Hash}
}
$Module=Join-Path $Root 'cloudflow-backend/cloudflow-service-hr'
$ClasspathFile=Join-Path $Module 'target/report-classpath.txt'
$Entries=@((Join-Path $Module 'target/classes'))+(Get-Content -LiteralPath $ClasspathFile -Raw).Trim().Split([IO.Path]::PathSeparator)
$BinaryPaths=@($ClasspathFile)
foreach($Entry in $Entries){
    if([IO.Path]::GetPathRoot([IO.Path]::GetFullPath($Entry)) -ne 'D:\'){throw 'Data drive dependency required'}
    if(Test-Path -LiteralPath $Entry -PathType Container){$BinaryPaths+=@(Get-ChildItem -LiteralPath $Entry -File -Recurse|ForEach-Object FullName)}else{$BinaryPaths+=$Entry}
}
$Binaries=@($BinaryPaths|Sort-Object -Unique|ForEach-Object{[pscustomobject]@{Path=$_;Hash=(Get-FileHash -LiteralPath $_).Hash}})
function Assert-Inputs {
    foreach($Item in @($Inputs)+@($Binaries)){
        $Path=[IO.Path]::GetFullPath($Item.Path,$Root)
        if((Get-FileHash -LiteralPath $Path).Hash -ne $Item.Hash){throw 'Frozen commission wire input changed'}
    }
}
Assert-Inputs
$Inputs|ConvertTo-Json -Depth 4|Set-Content -LiteralPath (Join-Path $Output 'inputs.json') -Encoding utf8NoBOM
$Binaries|ConvertTo-Json -Depth 4|Set-Content -LiteralPath (Join-Path $Output 'binary-inputs.json') -Encoding utf8NoBOM
$Classes=Join-Path $Output 'classes';[IO.Directory]::CreateDirectory($Classes)|Out-Null
$Classpath=($Entries -join [IO.Path]::PathSeparator).Replace('\','/')
$Compile=Join-Path $Output 'compile.args'
[IO.File]::WriteAllLines($Compile,@('-encoding','UTF-8','-cp',('"'+$Classpath+'"'),'-d',('"'+$Classes.Replace('\','/')+'"'),('"'+(Join-Path $Root 'scripts/hr-checks/HrCommissionWireChecks.java').Replace('\','/')+'"')),[Text.UTF8Encoding]::new($false))
$Failure=$null;$Exit=0
try{
    & javac "@$Compile" *> (Join-Path $Output 'compile.log')
    if($LASTEXITCODE -ne 0){throw 'Commission wire compilation failed'}
    $ArgumentsFile=Join-Path $Output 'run.args'
    [IO.File]::WriteAllLines($ArgumentsFile,@('-Dfile.encoding=UTF-8','-cp',('"'+($Classes+[IO.Path]::PathSeparator+$Classpath).Replace('\','/')+'"'),'com.cloudflow.hr.checks.HrCommissionWireChecks'),[Text.UTF8Encoding]::new($false))
    & java "@$ArgumentsFile" *> (Join-Path $Output 'live.log')
    if($LASTEXITCODE -ne 0){throw 'Commission wire compatibility failed'}
}catch{$Exit=1;$Failure=$_.Exception.Message}
Assert-Inputs
$Log=if(Test-Path -LiteralPath (Join-Path $Output 'live.log')){Get-Content -LiteralPath (Join-Path $Output 'live.log') -Raw}else{''}
$Summary=[regex]::Match($Log,'H3_COMMISSION_WIRE: checks=(\d+); failed=0;')
$Passed=$Exit -eq 0 -and $Summary.Success
[pscustomobject]@{Passed=$Passed;BackendRound=$BackendRound;Checks=if($Summary.Success){[int]$Summary.Groups[1].Value}else{0};SourceInputs=$Inputs.Count;BinaryInputs=$Binaries.Count;InputChanges=0;Failure=$Failure;BusinessRuntimeVerified=$false}|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $Output 'result.json') -Encoding utf8NoBOM
if($Log){$Log -split '\r?\n'|Where-Object{$_ -match '^H3_COMMISSION_WIRE'}}
"H3_COMMISSION_WIRE_INPUTS: source=$($Inputs.Count); binary=$($Binaries.Count); changed=0; passed=$Passed"
if(-not $Passed){throw 'Commission wire verification failed; original evidence retained'}
