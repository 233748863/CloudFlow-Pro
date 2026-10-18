param([ValidatePattern('^r[1-9][0-9]*$')][string]$Round='r1',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$BackendRound='r55',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$FrontendRound='r7')
$ErrorActionPreference='Stop'
if($env:CLOUDFLOW_NATURAL_RECOVER -and $env:CLOUDFLOW_NATURAL_RECOVER -ne 'r2'){throw 'Only the retained R2 natural timer may be recovered'}
. 'D:\CloudFlowPro\.cloudflow-runtime/use-data-drive.ps1'
$Root='D:\CloudFlowPro'
$Run=Join-Path $Root '.cloudflow-runtime/batch-g-integration/9799534e1a3a47b5958330f14ae16dc7'
$StatePath=Join-Path $Run 'state.json'
$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
$Prefix='a3-natural-cadence-20261003'
$Log=Join-Path $Evidence "$Prefix-http-$Round.log"
$InputPath=Join-Path $Evidence "$Prefix-inputs-$Round.json"
foreach($File in @($Log,$InputPath)){if(Test-Path -LiteralPath $File){throw 'Existing evidence must be retained'}}
$State=Get-Content -LiteralPath $StatePath -Raw|ConvertFrom-Json
if($State.status -ne 'RUNNING' -or [IO.Path]::GetFullPath($State.run) -ne $Run){throw 'Owned running fixture required'}
foreach($Entry in $State.processes){
    $Observed=Get-CimInstance Win32_Process -Filter "ProcessId=$($Entry.id)"
    if(-not $Observed -or -not $Observed.CommandLine.Contains($Entry.marker)){throw 'Owned process verification failed'}
}
function Assert-ProductInputs {
    foreach($Build in @("backend-$BackendRound","frontend-$FrontendRound")){
        $Snapshot=@(Get-Content -LiteralPath (Join-Path $Evidence "h3-portal-finance-20261002-$Build-inputs.json") -Raw|ConvertFrom-Json)
        foreach($Item in $Snapshot){if((Get-FileHash -LiteralPath (Join-Path $Root $Item.Path)).Hash -ne $Item.Hash){throw 'Product differs from verified build'}}
    }
}
Push-Location $Root
try {
    Assert-ProductInputs
    $Paths=@('scripts/verify-batch-g-integration.mjs','scripts/verify-a3-timer-scan.mjs','scripts/verify-a3-natural-cadence.mjs',
        'scripts/run-a3-natural-cadence.ps1','scripts/portal-checks/scan-access-logs.mjs','scripts/run-owned-captcha-allowance.mjs',
        'scripts/owned-gateway-redis.mjs','scripts/job-internal-signing.mjs')
    $Paths+=@($State.services|ForEach-Object{Join-Path $Run "$($_.name)/service.args";Join-Path $Run "$($_.name)/integration.properties"})
    if($env:CLOUDFLOW_NATURAL_RECOVER){$Paths+='scripts/recover-b2-natural-timer.mjs'}
    $Inputs=@($Paths|Sort-Object -Unique|ForEach-Object{[pscustomobject]@{Path=$_;Hash=(Get-FileHash -LiteralPath $_).Hash}})
    $Inputs|ConvertTo-Json|Set-Content -LiteralPath $InputPath -Encoding utf8NoBOM
    & node scripts/verify-batch-g-integration.mjs $StatePath --settlement-schema --contract-performance-only --a3-timer-scan --a3-natural-cadence *> $Log
    $Result=$LASTEXITCODE
    foreach($Item in $Inputs){if((Get-FileHash -LiteralPath $Item.Path).Hash -ne $Item.Hash){throw 'Natural cadence input changed'}}
    Assert-ProductInputs
    "A3_NATURAL_INPUTS: files=$($Inputs.Count); changed=0; product_changed=0; exit=$Result"|Add-Content -LiteralPath $Log
    Get-Content -LiteralPath $Log|Where-Object{$_ -match '^(PASS |A3_NATURAL_)'}|Select-Object -Last 16
    if($Result -ne 0){throw 'Natural cadence failed; evidence retained'}
    $Content=Get-Content -LiteralPath $Log -Raw
    if($env:CLOUDFLOW_NATURAL_RECOVER){
        foreach($Pattern in @('"naturalRecovery":true','"recoveredOriginalTimer":true','"restoration":true','"secrets":true','failed=0; requests=')){
            if($Content -notmatch $Pattern){throw 'Natural timer recovery incomplete'}
        }
        'B2_NATURAL_RECOVERY_RUN_EXIT=0'
        return
    }
    foreach($Pattern in @('"configuration":true','"cadence":true','"reports":true','"timerPrecision":true','"pause":true',
        '"permissions":true','"restoration":true','"secrets":true','"manualTriggers":0','"acceleratedIntervals":false',
        '"databaseTimeWrites":0','"fullDayObserved":false','failed=0; requests=')){
        if($Content -notmatch $Pattern){throw 'Natural cadence evidence missing'}
    }
    if($env:CLOUDFLOW_NATURAL_TIMER_UNIT -eq 'HOUR') {
        foreach($Pattern in @('"oneHourTimer":true','"timerUnit":"HOUR"','"configuredWaitMs":3600000','"clockChanges":0')) {
            if($Content -notmatch $Pattern){throw 'Required one-hour timer evidence missing'}
        }
    }
    'A3_NATURAL_RUN_EXIT=0'
} finally {Pop-Location}
