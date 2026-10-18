param([Parameter(Mandatory=$true)][ValidatePattern('^r[1-9][0-9]*$')][string]$Round,
    [Parameter(Mandatory=$true)][ValidatePattern('^r[1-9][0-9]*$')][string]$BackendRound)
$ErrorActionPreference='Stop'
. 'D:\CloudFlowPro\.cloudflow-runtime\use-data-drive.ps1'
$Root='D:\CloudFlowPro'
$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
$Output=Join-Path $Evidence "request-log-checks-20261009-$Round"
if(Test-Path -LiteralPath $Output){throw 'Preserve previous request log verification'}
$Runner='cloudflow-backend/cloudflow-common/cloudflow-common-log/src/test/run-sensitive-log-checks.ps1'
$Sources=@('scripts/run-request-log-checks.ps1',$Runner)
$BuildPath=Join-Path $Evidence "h3-portal-finance-20261002-backend-$BackendRound-inputs.json"
$Inputs=@(Get-Content -LiteralPath $BuildPath -Raw|ConvertFrom-Json|ForEach-Object{
    [pscustomobject]@{Path=[IO.Path]::GetFullPath($_.Path,$Root);Hash=$_.Hash}
})
$Paths=@($BuildPath)+@($Sources|ForEach-Object{Join-Path $Root $_})
$Entries=@()
foreach($Module in @('cloudflow-common/cloudflow-common-log','cloudflow-service-workflow')){
    $ClassPathFile=Join-Path $Root "cloudflow-backend/$Module/target/batch-g-classpath.txt"
    $Paths+=$ClassPathFile
    $Entries+=(Get-Content -LiteralPath $ClassPathFile -Raw).Trim().Split(';')
}
foreach($Module in @('cloudflow-common/cloudflow-common-core','cloudflow-common/cloudflow-common-log',
    'cloudflow-common/cloudflow-common-security','cloudflow-service-workflow',
    'cloudflow-common/cloudflow-common-sensitive','cloudflow-common/cloudflow-common-ratelimiter')){
    $Entries+=Join-Path $Root "cloudflow-backend/$Module/target/classes"
}
foreach($Entry in @($Entries|Sort-Object -Unique)){
    $Path=[IO.Path]::GetFullPath($Entry)
    if(-not($Path.StartsWith($Root+'\',[StringComparison]::OrdinalIgnoreCase) -or
        $Path.StartsWith('D:\CloudFlowProCache\',[StringComparison]::OrdinalIgnoreCase))){
        throw 'Unapproved request log verification dependency'
    }
    if(Test-Path -LiteralPath $Path -PathType Container){
        $Paths+=@(Get-ChildItem -LiteralPath $Path -Recurse -File|ForEach-Object FullName)
    }else{$Paths+=$Path}
}
$Inputs+=@($Paths|Sort-Object -Unique|ForEach-Object{[pscustomobject]@{Path=$_;Hash=(Get-FileHash -LiteralPath $_).Hash}})
function Assert-Inputs {
    foreach($Item in $Inputs){
        if((Get-FileHash -LiteralPath $Item.Path).Hash -ne $Item.Hash){throw 'Request log verification input changed'}
    }
}
Assert-Inputs
[IO.Directory]::CreateDirectory($Output)|Out-Null
$Inputs|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $Output 'inputs.json') -Encoding utf8NoBOM
foreach($Source in $Sources){
    [IO.File]::Copy((Join-Path $Root $Source),(Join-Path $Output ('original-'+(Split-Path -Leaf $Source))),$false)
}
& (Join-Path $Root $Runner) *> (Join-Path $Output 'checks.log')
if($LASTEXITCODE -ne 0){throw 'Request log verification failed; original evidence retained'}
Assert-Inputs
$Log=Get-Content -LiteralPath (Join-Path $Output 'checks.log') -Raw
$Pipeline=[regex]::Match($Log,'SensitiveLogPipelineChecks: ([0-9]+) checks passed')
$Policy=[regex]::Match($Log,'SensitiveLogPolicyChecks: ([0-9]+) checks passed')
if(-not $Pipeline.Success -or -not $Policy.Success){throw 'Request log verification markers missing'}
[pscustomobject]@{Passed=$true;BackendRound=$BackendRound;Inputs=$Inputs.Count;InputChanges=0;
    PipelineChecks=[int]$Pipeline.Groups[1].Value;PolicyChecks=[int]$Policy.Groups[1].Value;
    BusinessReexecuted=$false;ExternalMessages=0}|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $Output 'result.json') -Encoding utf8NoBOM
"REQUEST_LOG_CHECKS: pipeline=$($Pipeline.Groups[1].Value); policy=$($Policy.Groups[1].Value); inputs=$($Inputs.Count); changed=0; external_messages=0"
