param([Parameter(Mandatory=$true)][ValidatePattern('^r[1-9][0-9]*$')][string]$Round,
    [Parameter(Mandatory=$true)][ValidatePattern('^r[1-9][0-9]*$')][string]$BackendRound)
$ErrorActionPreference='Stop'
. 'D:\CloudFlowPro\.cloudflow-runtime\use-data-drive.ps1'
$Root='D:\CloudFlowPro'
$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
$Output=Join-Path $Evidence "oa-approval-key-checks-20261015-$Round"
if(Test-Path -LiteralPath $Output){throw 'Retain original approval identity verification evidence'}
[IO.Directory]::CreateDirectory($Output)|Out-Null
$BuildInput=Join-Path $Evidence "h3-portal-finance-20261002-backend-$BackendRound-inputs.json"
$Inputs=@{}
function Track([string]$Path,[string]$Expected=''){
    $FullPath=[IO.Path]::GetFullPath($Path,$Root)
    $Hash=(Get-FileHash -LiteralPath $FullPath).Hash
    if($Expected -and $Hash -ne $Expected){throw 'Approval identity inputs differ from the completed backend build'}
    $Inputs[$FullPath]=$Hash
}
Track $BuildInput
foreach($Entry in @(Get-Content -LiteralPath $BuildInput -Raw|ConvertFrom-Json)){Track $Entry.Path $Entry.Hash}
$Sources=@('scripts/run-oa-approval-key-checks.ps1','scripts/verify-batch-f.ps1')+
    @(Get-ChildItem -LiteralPath (Join-Path $Root 'scripts/oa-checks') -Filter '*.java' -File|ForEach-Object{[IO.Path]::GetRelativePath($Root,$_.FullName)})
foreach($Source in $Sources){
    Track $Source
    $Copy=Join-Path $Output "originals/$Source"
    [IO.Directory]::CreateDirectory((Split-Path -Parent $Copy))|Out-Null
    [IO.File]::Copy((Join-Path $Root $Source),$Copy,$false)
}
$ClassDirectories=@((Join-Path $Root 'cloudflow-backend/cloudflow-service-oa/target/classes'))+
    @(Get-ChildItem -LiteralPath (Join-Path $Root 'cloudflow-backend/cloudflow-common') -Directory|ForEach-Object{Join-Path $_.FullName 'target/classes'}|Where-Object{Test-Path -LiteralPath $_})
$ClassFiles=@($ClassDirectories|ForEach-Object{Get-ChildItem -LiteralPath $_ -Recurse -File|Select-Object -ExpandProperty FullName}|Sort-Object -Unique)
foreach($File in $ClassFiles){Track $File}
Track (Join-Path $Root 'cloudflow-backend/cloudflow-service-oa/target/batch-f-classpath.txt')
@($Inputs.Keys|Sort-Object|ForEach-Object{[pscustomobject]@{Path=$_;Hash=$Inputs[$_]}})|ConvertTo-Json -Depth 3|Set-Content -LiteralPath (Join-Path $Output 'inputs.json') -Encoding utf8NoBOM
$Log=Join-Path $Output 'live.log'
$Failure=$null
$Passed=$false
$Unchanged=$false
$Assertions=0
$ActualConsumerExecuted=$false
$PreviousJavaOptions=$env:JAVA_TOOL_OPTIONS
try{
    $env:JAVA_TOOL_OPTIONS='-Xms32m -Xmx512m'
    & .\scripts\verify-batch-f.ps1 -SkipBuild *> $Log
    $Completion=@(Get-Content -LiteralPath $Log|Where-Object{$_ -match '^PASS: (\d+) OA boundary assertions$'})
    if($Completion.Count -ne 1){throw 'Original OA rule verification completion was not observed'}
    $Assertions=[int]([regex]::Match($Completion[0],'^PASS: (\d+)').Groups[1].Value)
    $Passed=$Assertions -gt 0
}catch{
    $Failure=$_.Exception.Message
    $Failure|Add-Content -LiteralPath $Log -Encoding utf8NoBOM
}finally{
    $env:JAVA_TOOL_OPTIONS=$PreviousJavaOptions
    if(Test-Path -LiteralPath $Log){
        $ActualConsumerExecuted=@(Get-Content -LiteralPath $Log|Where-Object{$_ -ceq 'PASS: OA approval identity consumer checks'}).Count -eq 1
    }
    $Changed=@($Inputs.Keys|Where-Object{-not(Test-Path -LiteralPath $_) -or (Get-FileHash -LiteralPath $_).Hash -ne $Inputs[$_]})
    $CurrentClasses=@($ClassDirectories|ForEach-Object{Get-ChildItem -LiteralPath $_ -Recurse -File|Select-Object -ExpandProperty FullName}|Sort-Object -Unique)
    $Unchanged=$Changed.Count -eq 0 -and @(Compare-Object $ClassFiles $CurrentClasses).Count -eq 0
    [pscustomobject]@{passed=($Passed -and $Unchanged -and $ActualConsumerExecuted);backend=$BackendRound;assertions=$Assertions;inputs=$Inputs.Count;inputsUnchanged=$Unchanged;failure=$Failure;
        actualConsumerExecuted=$ActualConsumerExecuted;workflowTransportDoubled=$true;actualDatabase=$false;actualApplicationHttp=$false;
        productModified=$false;referenceRuntimeWritten=$false;allF2AcceptanceComplete=$false;globalComplete=$false}|
        ConvertTo-Json -Depth 3|Set-Content -LiteralPath (Join-Path $Output 'result.json') -Encoding utf8NoBOM
    Get-Content -LiteralPath $Log|Where-Object{$_ -match '^PASS:|^Exception|error:'}|Select-Object -Last 12
    "OA_APPROVAL_KEY_CHECKS: passed=$Passed; assertions=$Assertions; inputs=$($Inputs.Count); unchanged=$Unchanged"
}
if(-not $Passed -or -not $Unchanged -or -not $ActualConsumerExecuted){throw "Approval identity checks failed; retain original evidence in $Output"}
