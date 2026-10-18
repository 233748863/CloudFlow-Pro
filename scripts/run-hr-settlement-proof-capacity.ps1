param([ValidatePattern('^r[1-9][0-9]*$')][string]$Round='r1')
$ErrorActionPreference='Stop'
. 'D:\CloudFlowPro\.cloudflow-runtime/use-data-drive.ps1'
$Root='D:\CloudFlowPro'
$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
$Run=Join-Path $Root '.cloudflow-runtime/batch-g-integration/9799534e1a3a47b5958330f14ae16dc7'
$StatePath=Join-Path $Run 'state.json'
$Log=Join-Path $Evidence "h5-settlement-capacity-20261002-http-$Round.log"
$InputPath=Join-Path $Evidence "h5-settlement-capacity-20261002-inputs-$Round.json"
if ((Test-Path -LiteralPath $Log) -or (Test-Path -LiteralPath $InputPath)) { throw 'Existing evidence must be retained' }
if ((Get-Content -LiteralPath (Join-Path $Evidence 'h5-generated-import-20261002-checklist-r2.log') -Raw) -notmatch 'H5_GENERATED_IMPORT_CHECKLIST: items=14; missing=0') { throw 'Complete generated-file recovery and checklist before the next service run' }
$State=Get-Content -LiteralPath $StatePath -Raw | ConvertFrom-Json
if ($State.status -ne 'RUNNING' -or [IO.Path]::GetFullPath($State.run) -ne $Run) { throw 'Owned running fixture required' }
function Assert-ProductInputs {
    foreach ($File in @('h5-generated-import-20261002-backend-inputs-r1.json','h2-asset-reminder-frontend-inputs-20261001-r2.json')) {
        $Inputs=@(Get-Content -LiteralPath (Join-Path $Evidence $File) -Raw | ConvertFrom-Json)
        if (@($Inputs | Where-Object {(Get-FileHash -LiteralPath $_.Path).Hash -ne $_.Hash}).Count) { throw 'Product differs from the verified build' }
    }
}
Push-Location $Root
try {
    Assert-ProductInputs
    $Paths=@(rg --files scripts -g 'verify-hr-settlement-*.mjs') + @('scripts/verify-batch-g-integration.mjs',
        'scripts/owned-gateway-redis.mjs','scripts/portal-checks/scan-access-logs.mjs',
        'docs/design/H-G剩余设计菜单清单.json','scripts/run-hr-settlement-proof-capacity.ps1')
    $Paths+=@($State.services | ForEach-Object { Join-Path $Run "$($_.name)/service.args"; Join-Path $Run "$($_.name)/integration.properties" })
    $Inputs=@($Paths | Sort-Object -Unique | ForEach-Object {[pscustomobject]@{Path=$_;Hash=(Get-FileHash -LiteralPath $_).Hash}})
    $Inputs | ConvertTo-Json | Set-Content -LiteralPath $InputPath -Encoding utf8
    & node scripts/verify-batch-g-integration.mjs $StatePath --settlement-schema --hr-settlement-draft-only --hr-settlement-funds-receipt --hr-settlement-proof-capacity *> $Log
    $Result=$LASTEXITCODE
    if (@($Inputs | Where-Object {(Get-FileHash -LiteralPath $_.Path).Hash -ne $_.Hash}).Count) { throw 'Verification or service inputs changed during receipt capacity run' }
    Assert-ProductInputs
    "SETTLEMENT_CAPACITY_INPUTS: files=$($Inputs.Count); changed=0; product_changed=0; exit=$Result" | Add-Content -LiteralPath $Log
    Get-Content -LiteralPath $Log | Where-Object {$_ -match '^(PASS |H2_|H5_|SETTLEMENT_CAPACITY_)'} | Select-Object -Last 8
    if ($Result -ne 0) { throw 'Receipt capacity run failed; retained original evidence' }
    $Content=Get-Content -LiteralPath $Log -Raw
    foreach ($Pattern in @('"storageSettlementProof":true','"storageSettlementProofCleanup":true','"storageSettlementProofSecrets":true','"fundsClosed":true','"fundsPosted":true','failed=0; requests=')) {
        if ($Content -notmatch $Pattern) { throw 'Receipt capacity completion evidence is missing' }
    }
    'SETTLEMENT_CAPACITY_RUN_EXIT=0'
} finally { Pop-Location }
