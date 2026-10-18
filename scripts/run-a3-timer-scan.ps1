param([ValidatePattern('^r[1-9][0-9]*$')][string]$Round='r1',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$BackendRound='r26',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$FrontendRound='r10')
$ErrorActionPreference='Stop'
. 'D:\CloudFlowPro\.cloudflow-runtime/use-data-drive.ps1'
$Root='D:\CloudFlowPro'
$Run=Join-Path $Root '.cloudflow-runtime/batch-g-integration/9799534e1a3a47b5958330f14ae16dc7'
$StatePath=Join-Path $Run 'state.json'
$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
$Prefix='a3-timer-scan-20261003'
$Log=Join-Path $Evidence "$Prefix-http-$Round.log"
$InputPath=Join-Path $Evidence "$Prefix-inputs-$Round.json"
foreach($File in @($Log,$InputPath)){if(Test-Path -LiteralPath $File){throw 'Existing evidence must be retained'}}
$State=Get-Content -LiteralPath $StatePath -Raw|ConvertFrom-Json
if($State.status -ne 'RUNNING' -or [IO.Path]::GetFullPath($State.run) -ne $Run){throw 'Owned running fixture required'}
foreach($Entry in $State.processes) {
    $Observed=Get-CimInstance Win32_Process -Filter "ProcessId=$($Entry.id)"
    if($null -eq $Observed -or -not $Observed.CommandLine.Contains($Entry.marker)){throw 'Owned process verification failed'}
}
function Assert-ProductInputs {
    foreach($Build in @("backend-$BackendRound","frontend-$FrontendRound")) {
        $Snapshot=@(Get-Content -LiteralPath (Join-Path $Evidence "h3-portal-finance-20261002-$Build-inputs.json") -Raw|ConvertFrom-Json)
        if(@($Snapshot|Where-Object{(Get-FileHash -LiteralPath (Join-Path $Root $_.Path)).Hash -ne $_.Hash}).Count){throw 'Product differs from verified build'}
    }
}
Push-Location $Root
try {
    Assert-ProductInputs
    $Paths=@('scripts/verify-batch-g-integration.mjs','scripts/verify-a3-timer-scan.mjs','scripts/run-a3-timer-scan.ps1',
        'scripts/portal-checks/scan-access-logs.mjs','scripts/run-owned-captcha-allowance.mjs','scripts/owned-gateway-redis.mjs','scripts/job-internal-signing.mjs')
    $Paths+=@($State.services|ForEach-Object{Join-Path $Run "$($_.name)/service.args"; Join-Path $Run "$($_.name)/integration.properties"})
    $Inputs=@($Paths|Sort-Object -Unique|ForEach-Object{[pscustomobject]@{Path=$_;Hash=(Get-FileHash -LiteralPath $_).Hash}})
    $Inputs|ConvertTo-Json|Set-Content -LiteralPath $InputPath -Encoding utf8
    & node scripts/verify-batch-g-integration.mjs $StatePath --settlement-schema --contract-performance-only --a3-timer-scan *> $Log
    $Result=$LASTEXITCODE
    if(@($Inputs|Where-Object{(Get-FileHash -LiteralPath $_.Path).Hash -ne $_.Hash}).Count){throw 'A3 timer scan verification or runtime inputs changed'}
    Assert-ProductInputs
    "A3_TIMER_SCAN_INPUTS: files=$($Inputs.Count); changed=0; product_changed=0; exit=$Result"|Add-Content -LiteralPath $Log
    Get-Content -LiteralPath $Log|Where-Object{$_ -match '^(PASS |A3_)'}|Select-Object -Last 12
    if($Result -ne 0){throw 'A3 timer scan verification failed; original evidence retained'}
    $Content=Get-Content -LiteralPath $Log -Raw
    if($Content -notmatch '"invalidCacheIdentity":true' -or $Content -notmatch 'A3_TIMER_IDENTITY_ACTUAL: invalid_per_run=14; scan_and_cleanup=true; missing_wait_id_removed=true; persistent_waits_unchanged=true; extra_tasks=0; extra_messages=0'){throw 'Current timer identity evidence missing'}
    foreach($Pattern in @('"failure":true','"rollback":true','"continuation":true','"alarm":true','"backoff":true','"recovery":true','"notification":true','"repeat":true','"cleanup":true','"permissions":true','"restoration":true','"secrets":true','"exhaustedRollback":true','"exhaustedRecipients":true','"exhaustedLimit":true','"exhaustedRecovery":true','"exhaustedRepeat":true','failed=0; requests=')) {
        if($Content -notmatch $Pattern){throw 'A3 timer scan completion evidence missing'}
    }
    'A3_TIMER_SCAN_RUN_EXIT=0'
} finally { Pop-Location }
