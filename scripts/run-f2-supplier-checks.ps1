param([Parameter(Mandatory=$true)][ValidatePattern('^r[1-9][0-9]*$')][string]$Round,
    [ValidatePattern('^r[1-9][0-9]*$')][string]$BackendRound='r165')
$ErrorActionPreference='Stop'
. 'D:\CloudFlowPro\.cloudflow-runtime\use-data-drive.ps1'
$Root='D:\CloudFlowPro'
$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
$Output=Join-Path $Evidence "f2-supplier-checks-20261012-$Round"
if(Test-Path -LiteralPath $Output){throw 'Retain original supplier check evidence; choose a new round'}
[IO.Directory]::CreateDirectory($Output)|Out-Null
$BuildInput=Join-Path $Evidence "h3-portal-finance-20261002-backend-$BackendRound-inputs.json"
$Inputs=@{}
function Track([string]$Path,[string]$Expected=''){
    $FullPath=[IO.Path]::GetFullPath($Path,$Root)
    $Hash=(Get-FileHash -LiteralPath $FullPath).Hash
    if($Expected -and $Hash -ne $Expected){throw 'Supplier inputs differ from the completed backend build'}
    $Inputs[$FullPath]=$Hash
}
Track $BuildInput
foreach($Entry in @(Get-Content -LiteralPath $BuildInput -Raw|ConvertFrom-Json)){Track $Entry.Path $Entry.Hash}
$Sources=@('scripts/run-f2-supplier-checks.ps1','scripts/verify-batch-f.ps1','scripts/verify-batch-f-db.ps1')+
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
$BusinessPath=Join-Path $Output 'business-result.json'
$Failure=$null;$Passed=$false;$Unchanged=$false;$Business=$null
try{
    & .\scripts\verify-batch-f-db.ps1 -SkipBuild -SkipDemo -SupplierChecks -SupplierResultPath $BusinessPath *> $Log
    $Business=Get-Content -LiteralPath $BusinessPath -Raw|ConvertFrom-Json -Depth 20
    $Passed=$Business.passed
}catch{
    $Failure=$_.Exception.Message
    $Failure|Add-Content -LiteralPath $Log -Encoding utf8NoBOM
}finally{
    if(Test-Path -LiteralPath $BusinessPath){$Business=Get-Content -LiteralPath $BusinessPath -Raw|ConvertFrom-Json -Depth 20}
    $Changed=@($Inputs.Keys|Where-Object{-not(Test-Path -LiteralPath $_) -or (Get-FileHash -LiteralPath $_).Hash -ne $Inputs[$_]})
    $CurrentClasses=@($ClassDirectories|ForEach-Object{Get-ChildItem -LiteralPath $_ -Recurse -File|Select-Object -ExpandProperty FullName}|Sort-Object -Unique)
    $Unchanged=$Changed.Count -eq 0 -and @(Compare-Object $ClassFiles $CurrentClasses).Count -eq 0
    [pscustomobject]@{passed=($Passed -and $Unchanged);backend=$BackendRound;inputs=$Inputs.Count;inputsUnchanged=$Unchanged;failure=$Failure;
        actualDatabase=($null -ne $Business -and $Business.actualDatabase);actualApplicationHttp=$false;productModified=$false;referenceRuntimeWritten=$false;allF2AcceptanceComplete=$false;globalComplete=$false}|
        ConvertTo-Json -Depth 3|Set-Content -LiteralPath (Join-Path $Output 'result.json') -Encoding utf8NoBOM
    Get-Content -LiteralPath $Log|Where-Object{$_ -match '^F2_|^Isolated MySQL|^Temporary data|^Exception'}|Select-Object -Last 15
    "F2_SUPPLIER_CHECKS: passed=$Passed; inputs=$($Inputs.Count); unchanged=$Unchanged"
}
if(-not $Passed -or -not $Unchanged){throw "Supplier database checks failed; original evidence retained in $Output"}
