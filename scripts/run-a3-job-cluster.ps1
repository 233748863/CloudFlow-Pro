param([ValidatePattern('^r[1-9][0-9]*$')][string]$Round='r1',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$BackendRound='r10',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$FrontendRound='r7')
$ErrorActionPreference='Stop'
. 'D:\CloudFlowPro\.cloudflow-runtime/use-data-drive.ps1'
$Root='D:\CloudFlowPro'
$Run=Join-Path $Root '.cloudflow-runtime/batch-g-integration/9799534e1a3a47b5958330f14ae16dc7'
$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
$Log=Join-Path $Evidence "a3-job-cluster-20261002-http-$Round.log"
$InputPath=Join-Path $Evidence "a3-job-cluster-20261002-inputs-$Round.json"
foreach($File in @($Log,$InputPath)){if(Test-Path -LiteralPath $File){throw 'Existing evidence must be retained'}}
$StatePath=Join-Path $Run 'state.json'
$State=Get-Content -LiteralPath $StatePath -Raw|ConvertFrom-Json
if($State.status -ne 'RUNNING' -or [IO.Path]::GetFullPath($State.run) -ne $Run){throw 'Owned running fixture required'}
foreach($Entry in $State.processes){
    $Current=Get-CimInstance Win32_Process -Filter "ProcessId=$($Entry.id)"
    if(-not $Current -or -not $Current.CommandLine.Contains($Entry.marker)){throw 'Original process identity mismatch'}
}
function Assert-ProductInputs {
    foreach($Build in @("backend-$BackendRound","frontend-$FrontendRound")){
        $Snapshot=@(Get-Content -LiteralPath (Join-Path $Evidence "h3-portal-finance-20261002-$Build-inputs.json") -Raw|ConvertFrom-Json)
        if(@($Snapshot|Where-Object{(Get-FileHash -LiteralPath (Join-Path $Root $_.Path)).Hash -ne $_.Hash}).Count){throw 'Product differs from verified build'}
    }
}
Push-Location $Root
try {
    Assert-ProductInputs
    $Paths=@('scripts/verify-batch-g-integration.mjs','scripts/verify-a3-job-cluster.mjs','scripts/observe-a3-scheduler-redis.mjs','scripts/a3-execution-observation.mjs',
        'scripts/operate-a3-job-peer.ps1','scripts/operate-a3-peer-capacity.ps1','scripts/operate-a3-cluster.ps1','scripts/a3-cluster-discovery.ps1',
        'scripts/a3-auth-discovery.ps1','scripts/a3-auth-health-client.xml','scripts/restart-isolated-integration-service.ps1',
        'scripts/run-a3-job-cluster.ps1','scripts/portal-checks/scan-access-logs.mjs','scripts/run-owned-captcha-allowance.mjs',
        'scripts/owned-gateway-redis.mjs','scripts/job-internal-signing.mjs')
    $Paths+=@($State.services|ForEach-Object{Join-Path $Run "$($_.name)/service.args";Join-Path $Run "$($_.name)/integration.properties"})
    $Inputs=@($Paths|Sort-Object -Unique|ForEach-Object{[pscustomobject]@{Path=$_;Hash=(Get-FileHash -LiteralPath $_).Hash}})
    $Inputs|ConvertTo-Json|Set-Content -LiteralPath $InputPath -Encoding utf8
    & node scripts/verify-batch-g-integration.mjs $StatePath --settlement-schema --contract-performance-only --a3-job-cluster *> $Log
    $Result=$LASTEXITCODE
    if(@($Inputs|Where-Object{(Get-FileHash -LiteralPath $_.Path).Hash -ne $_.Hash}).Count){throw 'Verification inputs changed'}
    Assert-ProductInputs
    "A3_JOB_CLUSTER_INPUTS: files=$($Inputs.Count); changed=0; product_changed=0; exit=$Result"|Add-Content -LiteralPath $Log
    Get-Content -LiteralPath $Log|Where-Object{$_ -match '^(PASS |A3_)'}|Select-Object -Last 14
    if($Result -ne 0){throw 'Two-by-two cluster verification failed; retain original evidence'}
    $Content=Get-Content -LiteralPath $Log -Raw
    foreach($Name in @('instances','route','routingMatrix','business','deduplication','scheduling','pause','logs','permissions','restoration','runtimeRestoration','peerRestoration','capacityRestoration','secrets')){
        if($Content -notmatch ('"'+$Name+'":true')){throw 'Four-process cluster completion evidence missing'}
    }
    if($Content -notmatch 'failed=0; requests='){throw 'Complete successful result required'}
    'A3_JOB_CLUSTER_RUN_EXIT=0'
} finally { Pop-Location }
