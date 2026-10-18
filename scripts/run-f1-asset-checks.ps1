param([Parameter(Mandatory=$true)][ValidatePattern('^r[1-9][0-9]*$')][string]$Round,
    [ValidateSet('Rules','Database','Performance')][string]$Phase='Rules',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$BackendRound='r157')
$ErrorActionPreference='Stop'
. 'D:\CloudFlowPro\.cloudflow-runtime\use-data-drive.ps1'
$Root='D:\CloudFlowPro'
$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
$Output=Join-Path $Evidence "f1-asset-checks-20261012-$Round"
if(Test-Path -LiteralPath $Output){throw 'Retain previous F1 check evidence; choose a new round'}
[IO.Directory]::CreateDirectory($Output)|Out-Null
$BuildInput=Join-Path $Evidence "h3-portal-finance-20261002-backend-$BackendRound-inputs.json"
$Inputs=[Collections.Generic.List[object]]::new()
foreach($Item in @(Get-Content -LiteralPath $BuildInput -Raw|ConvertFrom-Json)){
    $FullPath=[IO.Path]::GetFullPath($Item.Path,$Root)
    if((Get-FileHash -LiteralPath $FullPath).Hash -ne $Item.Hash){throw 'F1 source differs from the completed backend build'}
    $Inputs.Add([pscustomobject]@{Path=$FullPath;Hash=$Item.Hash})
}
$Sources=@('scripts/run-f1-asset-checks.ps1','scripts/verify-batch-f.ps1','scripts/verify-batch-f-db.ps1')+
    @(Get-ChildItem -LiteralPath (Join-Path $Root 'scripts/oa-checks') -Filter '*.java' -File|ForEach-Object{[IO.Path]::GetRelativePath($Root,$_.FullName)})
foreach($Source in $Sources){
    $Original=Join-Path $Root $Source
    $Copy=Join-Path $Output "originals/$Source"
    [IO.Directory]::CreateDirectory((Split-Path -Parent $Copy))|Out-Null
    [IO.File]::Copy($Original,$Copy,$false)
}
$ClassDirectories=@((Join-Path $Root 'cloudflow-backend/cloudflow-service-oa/target/classes'))+
    @(Get-ChildItem -LiteralPath (Join-Path $Root 'cloudflow-backend/cloudflow-common') -Directory|ForEach-Object{Join-Path $_.FullName 'target/classes'}|Where-Object{Test-Path -LiteralPath $_})
$ClassFiles=@($ClassDirectories|ForEach-Object{Get-ChildItem -LiteralPath $_ -File -Recurse|Select-Object -ExpandProperty FullName}|Sort-Object -Unique)
$ExtraPaths=@($BuildInput)+@($Sources|ForEach-Object{Join-Path $Root $_})+$ClassFiles+
    @((Join-Path $Root 'cloudflow-backend/cloudflow-service-oa/target/batch-f-classpath.txt'))
foreach($File in $ExtraPaths){$Inputs.Add([pscustomobject]@{Path=$File;Hash=(Get-FileHash -LiteralPath $File).Hash})}
$Inputs|ConvertTo-Json -Depth 3|Set-Content -LiteralPath (Join-Path $Output 'inputs.json') -Encoding utf8NoBOM
$Log=Join-Path $Output 'live.log'
$Failure=$null;$Passed=$false;$Unchanged=$false
Push-Location $Root
try{
    if($Phase -eq 'Rules'){& .\scripts\verify-batch-f.ps1 -SkipBuild *> $Log}
    else{& .\scripts\verify-batch-f-db.ps1 -SkipBuild -SkipDemo -AssetPerformance:($Phase -eq 'Performance') *> $Log}
    $Passed=$true
}catch{
    $Failure=$_.Exception.Message
    $Failure|Add-Content -LiteralPath $Log -Encoding utf8NoBOM
}finally{
    Pop-Location
    $Changed=@($Inputs|Where-Object{-not(Test-Path -LiteralPath $_.Path) -or (Get-FileHash -LiteralPath $_.Path).Hash -ne $_.Hash})
    $CurrentClasses=@($ClassDirectories|ForEach-Object{Get-ChildItem -LiteralPath $_ -File -Recurse|Select-Object -ExpandProperty FullName}|Sort-Object -Unique)
    $Unchanged=$Changed.Count -eq 0 -and @(Compare-Object $ClassFiles $CurrentClasses).Count -eq 0
    $LastCount=@(Select-String -LiteralPath $Log -Pattern '^PASS: ([0-9]+) OA boundary assertions'|ForEach-Object{[int]$_.Matches[0].Groups[1].Value})
    [pscustomobject]@{passed=($Passed -and $Unchanged);phase=$Phase;backend=$BackendRound;inputs=$Inputs.Count;
        inputsUnchanged=$Unchanged;boundaryAssertions=if($LastCount.Count){$LastCount[-1]}else{$null};failure=$Failure;
        actualApplicationHttp=$false;allF1AcceptanceComplete=$false;globalComplete=$false}|
        ConvertTo-Json -Depth 3|Set-Content -LiteralPath (Join-Path $Output 'result.json') -Encoding utf8NoBOM
    Get-Content -LiteralPath $Log|Where-Object{$_ -match '^PASS: [0-9]+ OA boundary assertions|^Isolated MySQL:|^F1_|^Exception:|^java.lang.AssertionError'}|Select-Object -Last 12
    "F1_ASSET_CHECKS: phase=$Phase; passed=$Passed; inputs=$($Inputs.Count); unchanged=$Unchanged"
}
if(-not $Passed -or -not $Unchanged){throw "F1 $Phase checks failed; original evidence retained in $Output"}
