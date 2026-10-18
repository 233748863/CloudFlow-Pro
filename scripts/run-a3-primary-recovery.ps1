param([ValidatePattern('^r[1-9][0-9]*$')][string]$Round='r1',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$BackendRound='r10',
    [Parameter(Mandatory=$true)][ValidatePattern('^[a-f0-9]{12}$')][string]$Marker)
$ErrorActionPreference='Stop'
. 'D:\CloudFlowPro\.cloudflow-runtime/use-data-drive.ps1'
$Root='D:\CloudFlowPro'
$Run=Join-Path $Root '.cloudflow-runtime/batch-g-integration/9799534e1a3a47b5958330f14ae16dc7'
$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
$Log=Join-Path $Evidence "a3-primary-recovery-20261002-http-$Round.log"
$InputPath=Join-Path $Evidence "a3-primary-recovery-20261002-inputs-$Round.json"
foreach($File in @($Log,$InputPath)){if(Test-Path $File){throw 'Retain existing recovery evidence'}}
$Fault=Get-Content (Join-Path $Run "private/a3-primary-$Marker/fault.json") -Raw|ConvertFrom-Json
$Paths=@('scripts/verify-batch-g-integration.mjs','scripts/verify-a3-job-primary-fault.mjs',
    'scripts/operate-a3-primary-fault.ps1','scripts/operate-a3-job-peer.ps1','scripts/a3-auth-discovery.ps1','scripts/a3-auth-health-client.xml',
    'scripts/operate-a3-peer-capacity.ps1','scripts/restart-isolated-integration-service.ps1','scripts/observe-a3-scheduler-redis.mjs',
    'scripts/run-a3-primary-recovery.ps1','scripts/portal-checks/scan-access-logs.mjs','scripts/run-owned-captcha-allowance.mjs',
    'scripts/owned-gateway-redis.mjs','scripts/job-internal-signing.mjs')
$Inputs=@($Paths|ForEach-Object{[pscustomobject]@{path=$_;hash=(Get-FileHash (Join-Path $Root $_)).Hash}})
$Inputs|ConvertTo-Json|Set-Content $InputPath -Encoding utf8NoBOM
function Assert-Product {
    foreach($Build in @("backend-$BackendRound",'frontend-r7')){
        $Snapshot=@(Get-Content (Join-Path $Evidence "h3-portal-finance-20261002-$Build-inputs.json") -Raw|ConvertFrom-Json)
        foreach($File in $Snapshot){if((Get-FileHash (Join-Path $Root $File.Path)).Hash -ne $File.Hash){throw 'Verified product changed'}}
    }
}
Push-Location $Root
try{
    Assert-Product
    & node scripts/verify-batch-g-integration.mjs (Join-Path $Run 'state.json') --settlement-schema --contract-performance-only --a3-job-primary-fault "--a3-primary-recover=$Marker" *> $Log
    $Result=$LASTEXITCODE
    foreach($File in $Inputs){if((Get-FileHash (Join-Path $Root $File.path)).Hash -ne $File.hash){throw 'Recovery tool changed'}}
    foreach($File in $Fault.inputs){if((Get-FileHash $File.path).Hash -ne $File.hash){throw 'Original runtime configuration did not restore'}}
    Assert-Product
    "A3_PRIMARY_RECOVERY_INPUTS: tools=$($Inputs.Count); original_runtime_inputs=12; changed=0; product_changed=0; exit=$Result"|Add-Content $Log
    Get-Content $Log|Where-Object{$_ -match '^(PASS |A3_)'}|Select-Object -Last 14
    if($Result -ne 0){throw 'Recovery incomplete; retain evidence'}
    $Content=Get-Content $Log -Raw
    foreach($Name in @('recoveryOnly','restoration','runtimeRestoration','peerRestoration','capacityRestoration','secrets')){
        if(-not $Content.Contains('"'+$Name+'":true')){throw 'Recovery completion evidence missing'}
    }
    'A3_PRIMARY_RECOVERY_RUN_EXIT=0'
}finally{Pop-Location}

