param([ValidatePattern('^r[1-9][0-9]*$')][string]$Round='r1',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$BackendRound='r6',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$FrontendRound='r6')
$ErrorActionPreference='Stop'
. 'D:\CloudFlowPro\.cloudflow-runtime/use-data-drive.ps1'
$Root='D:\CloudFlowPro'
$Run=Join-Path $Root '.cloudflow-runtime/batch-g-integration/9799534e1a3a47b5958330f14ae16dc7'
$StatePath=Join-Path $Run 'state.json'
$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
$Prefix='f4-contract-terms-20261002'
$Log=Join-Path $Evidence "$Prefix-http-$Round.log"
$InputPath=Join-Path $Evidence "$Prefix-inputs-$Round.json"
foreach($File in @($Log,$InputPath)){if(Test-Path -LiteralPath $File){throw 'Existing evidence must be retained'}}
$State=Get-Content -LiteralPath $StatePath -Raw|ConvertFrom-Json
if($State.status -ne 'RUNNING' -or [IO.Path]::GetFullPath($State.run) -ne $Run){throw 'Owned running fixture required'}
function Assert-ProductInputs {
    foreach($Build in @("backend-$BackendRound","frontend-$FrontendRound")) {
        $Snapshot=@(Get-Content -LiteralPath (Join-Path $Evidence "h3-portal-finance-20261002-$Build-inputs.json") -Raw|ConvertFrom-Json)
        if(@($Snapshot|Where-Object{(Get-FileHash -LiteralPath $_.Path).Hash -ne $_.Hash}).Count){throw 'Product differs from verified build'}
    }
}
Push-Location $Root
try {
    Assert-ProductInputs
    $Paths=@('scripts/verify-batch-g-integration.mjs','scripts/verify-oa-contract-terms.mjs','scripts/verify-oa-contract-edit-conflicts.mjs','scripts/run-oa-contract-terms.ps1',
        'scripts/portal-checks/scan-access-logs.mjs','scripts/run-owned-captcha-allowance.mjs','scripts/owned-gateway-redis.mjs')
    $Paths+=@($State.services|ForEach-Object{Join-Path $Run "$($_.name)/service.args"; Join-Path $Run "$($_.name)/integration.properties"})
    $Inputs=@($Paths|Sort-Object -Unique|ForEach-Object{[pscustomobject]@{Path=$_;Hash=(Get-FileHash -LiteralPath $_).Hash}})
    $Inputs|ConvertTo-Json|Set-Content -LiteralPath $InputPath -Encoding utf8
    & node scripts/verify-batch-g-integration.mjs $StatePath --settlement-schema --contract-performance-only --oa-contract-terms *> $Log
    $Result=$LASTEXITCODE
    if(@($Inputs|Where-Object{(Get-FileHash -LiteralPath $_.Path).Hash -ne $_.Hash}).Count){throw 'Terms verification or runtime inputs changed'}
    Assert-ProductInputs
    "F4_CONTRACT_TERMS_INPUTS: files=$($Inputs.Count); changed=0; product_changed=0; exit=$Result"|Add-Content -LiteralPath $Log
    Get-Content -LiteralPath $Log|Where-Object{$_ -match '^(PASS |F4_)'}|Select-Object -Last 9
    if($Result -ne 0){throw 'Contract terms verification failed; original evidence retained'}
    $Content=Get-Content -LiteralPath $Log -Raw
    foreach($Pattern in @('"terms":true','"states":true','"templates":true','"audit":true','"timeline":true','"reports":true','"secrets":true','failed=0; requests=')) {
        if($Content -notmatch $Pattern){throw 'Contract terms completion evidence missing'}
    }
    'F4_CONTRACT_TERMS_RUN_EXIT=0'
} finally { Pop-Location }
