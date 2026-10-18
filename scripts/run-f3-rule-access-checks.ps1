param([Parameter(Mandatory=$true)][ValidatePattern('^r[1-9][0-9]*$')][string]$Round,
    [ValidatePattern('^r[1-9][0-9]*$')][string]$BackendRound='r175')
$ErrorActionPreference='Stop'
. 'D:\CloudFlowPro\.cloudflow-runtime\use-data-drive.ps1'
$Root='D:\CloudFlowPro'
$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
$Output=Join-Path $Evidence "f3-rule-access-checks-20261015-$Round"
if(Test-Path -LiteralPath $Output){throw 'Retain original rule access evidence; choose a new round'}
[IO.Directory]::CreateDirectory($Output)|Out-Null
$Inputs=@{}
$BuildInput=Join-Path $Evidence "h3-portal-finance-20261002-backend-$BackendRound-inputs.json"
$Inputs[$BuildInput]=(Get-FileHash -LiteralPath $BuildInput).Hash
foreach($Entry in @(Get-Content -LiteralPath $BuildInput -Raw|ConvertFrom-Json)){
    $FullPath=[IO.Path]::GetFullPath($Entry.Path,$Root)
    if((Get-FileHash -LiteralPath $FullPath).Hash -ne $Entry.Hash){throw 'Product differs from the completed build'}
    $Inputs[$FullPath]=$Entry.Hash
}
$Sources=@('scripts/run-f3-rule-access-checks.ps1','scripts/verify-h-access-bridges.ps1')+
    @(Get-ChildItem -LiteralPath (Join-Path $Root 'scripts/platform-checks') -Filter '*RuleBridgeChecks.java' -File|ForEach-Object{[IO.Path]::GetRelativePath($Root,$_.FullName)})+
    @('scripts/workflow-checks/WorkflowDraftReferenceChecks.java','scripts/hr-checks/HrLeaveRuleClientChecks.java','scripts/hr-checks/HrLeaveOwnerReadChecks.java','scripts/hr-checks/HrLeaveEncashmentComponentChecks.java')
foreach($Source in $Sources){
    $FullPath=Join-Path $Root $Source
    $Inputs[$FullPath]=(Get-FileHash -LiteralPath $FullPath).Hash
    $Copy=Join-Path $Output "originals/$Source"
    [IO.Directory]::CreateDirectory((Split-Path -Parent $Copy))|Out-Null
    [IO.File]::Copy($FullPath,$Copy,$false)
}
@($Inputs.Keys|Sort-Object|ForEach-Object{[pscustomobject]@{Path=$_;Hash=$Inputs[$_]}})|ConvertTo-Json -Depth 3|Set-Content -LiteralPath (Join-Path $Output 'inputs.json') -Encoding utf8NoBOM
$Log=Join-Path $Output 'live.log'
$Passed=$false
$Unchanged=$false
$Failure=$null
try{
    & .\scripts\verify-h-access-bridges.ps1 -KeepArtifacts *> $Log
    $Passed=$true
}catch{
    $Failure=$_.Exception.Message
    $Failure|Add-Content -LiteralPath $Log -Encoding utf8NoBOM
}finally{
    $Changed=@($Inputs.Keys|Where-Object{-not(Test-Path -LiteralPath $_) -or (Get-FileHash -LiteralPath $_).Hash -ne $Inputs[$_]})
    $Unchanged=$Changed.Count -eq 0
    [pscustomobject]@{passed=($Passed -and $Unchanged);backend=$BackendRound;inputs=$Inputs.Count;inputsUnchanged=$Unchanged;
        failure=$Failure;offline=$true;actualDatabase=$false;actualApplicationHttp=$false;productModified=$false;referenceRuntimeWritten=$false}|
        ConvertTo-Json -Depth 3|Set-Content -LiteralPath (Join-Path $Output 'result.json') -Encoding utf8NoBOM
    Get-Content -LiteralPath $Log|Where-Object{$_ -match '^PASS|^H access bridges:|^Exception|error:'}|Select-Object -Last 20
    "F3_RULE_ACCESS_CHECKS: passed=$Passed; inputs=$($Inputs.Count); unchanged=$Unchanged"
}
if(-not $Passed -or -not $Unchanged){throw 'Rule access checks failed; original evidence retained'}
