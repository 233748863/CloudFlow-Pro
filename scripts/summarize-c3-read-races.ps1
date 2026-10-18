param([ValidatePattern('^r[1-9][0-9]*$')][string]$Round='r1',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$ReadRound='r68',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$RaceRound='r70',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$AdjacentRound='r76')
$ErrorActionPreference='Stop'
. 'D:\CloudFlowPro\.cloudflow-runtime/use-data-drive.ps1'
$Root='D:\CloudFlowPro'
$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
$Output=Join-Path $Evidence "c3-read-races-checkpoint-20261005-$Round"
if(Test-Path -LiteralPath $Output){throw 'Retain previous C3 read/race summary'}
[IO.Directory]::CreateDirectory($Output)|Out-Null
function Read-Json([string]$Relative){Get-Content -LiteralPath (Join-Path $Evidence $Relative) -Raw|ConvertFrom-Json}
function Require-Text([string]$Relative,[string]$Pattern){if(-not (Select-String -LiteralPath (Join-Path $Evidence $Relative) -Pattern $Pattern -Quiet)){throw "Required verification summary absent: $Relative"}}
$Step='inputs'
try {
    $Hashes=@{};$Revisions=[Collections.Generic.List[object]]::new();$Results=[Collections.Generic.List[object]]::new()
    foreach($Snapshot in @('h3-portal-finance-20261002-backend-r77-inputs.json','h3-portal-finance-20261002-frontend-r50-inputs.json',"h3-portal-finance-adjacent-20261002-$AdjacentRound/inputs.json")){
        foreach($Input in @(Read-Json $Snapshot)){
            $Resolved=[IO.Path]::GetFullPath((Join-Path $Root $Input.Path));if(-not $Resolved.StartsWith($Root+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)){throw 'Snapshot outside workspace'}
            $Actual=if($Hashes.ContainsKey($Resolved)){$Hashes[$Resolved]}else{(Get-FileHash -LiteralPath $Resolved).Hash}
            if($Actual -ne $Input.Hash){throw "Current input changed: $($Input.Path)"};$Hashes[$Resolved]=$Actual
        }
    }
    foreach($Scope in @(@{Name='read-entries';Round=$ReadRound;Flag='readEntriesExecuted'},@{Name='permission-races';Round=$RaceRound;Flag='permissionRacesExecuted'})){
        $Step=$Scope.Name;$Base="c1-form-live-20261005-$($Scope.Round)";$Live=Read-Json "$Base/result.json"
        if(-not $Live.passed -or -not $Live.isolated -or -not $Live.($Scope.Flag) -or $Live.checks.Count -eq 0 -or @($Live.checks|Where-Object{-not $_.passed}).Count){throw 'Actual scope incomplete'}
        $Detail=Read-Json "c3-$($Scope.Name)-$($Live.runId)/result.json"
        if(-not $Detail.passed -or $Detail.fabricatedResponses -ne 0){throw 'Actual detail incomplete'}
        if($Scope.Name -eq 'read-entries' -and ($Detail.flows.Count -ne 2 -or $Detail.cases.Count -lt 76)){throw 'Mixed permission reads incomplete'}
        if($Scope.Name -eq 'permission-races' -and ($Detail.races.Count -ne 2 -or @($Detail.races|Where-Object{$_.observedWaiters -lt 2 -or $_.publishStatus -ne 200}).Count)){throw 'Actual overlapping writers not proven'}
        Require-Text "$Base/summary.log" 'changed=0; exit=0; passed=True'
        foreach($Prefix in @('C_LOG_SCAN','C_AUDIT_SCAN','C2_FORM_SAVE_AUDIT:')){Require-Text "$Base/live.log" "$Prefix .*plaintext_hits=0"}
        foreach($Input in @(Read-Json "$Base/inputs.json")){
            $Resolved=[IO.Path]::GetFullPath((Join-Path $Root $Input.Path));if(-not $Resolved.StartsWith($Root+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)){throw 'Historical input outside workspace'}
            $Actual=if($Hashes.ContainsKey($Resolved)){$Hashes[$Resolved]}else{(Get-FileHash -LiteralPath $Resolved).Hash}
            if($Actual -ne $Input.Hash){
                if($Input.Path -notin @('scripts/verify-batch-c-live.mjs','scripts/run-c1-form-live.ps1','scripts/run-owned-captcha-allowance.mjs')){throw "Historical executed dependency changed: $($Input.Path)"}
                $Revisions.Add([pscustomobject]@{round=$Scope.Round;path=$Input.Path;historical=$Input.Hash;current=$Actual;reason='Subsequent verification mode connected after original process ended'})
            };$Hashes[$Resolved]=$Actual
        }
        $Results.Add([pscustomobject]@{scope=$Scope.Name;round=$Scope.Round;checks=$Live.checks.Count;requests=$Live.requests.Count;passed=$true})
    }
    $Step='adjacent'
    Require-Text "h3-portal-finance-adjacent-20261002-$AdjacentRound/summary.log" 'changed=0; exit=0'
    Require-Text "h3-portal-finance-adjacent-20261002-$AdjacentRound/oa-database.log" '^PASS: Complete approved schema table count; expected=374; actual=374'
    Require-Text "h3-portal-finance-adjacent-20261002-$AdjacentRound/oa-database.log" '1012'
    $Step='runtime'
    $State=Get-Content -LiteralPath (Join-Path $Root '.cloudflow-runtime/batch-g-integration/9799534e1a3a47b5958330f14ae16dc7/state.json') -Raw|ConvertFrom-Json
    if($State.status -ne 'RUNNING' -or $State.processes.Count -ne 9 -or $State.services.Count -ne 6){throw 'Owned runtime incomplete'}
    foreach($Owned in $State.processes){$Current=Get-CimInstance Win32_Process -Filter "ProcessId = $($Owned.id)";if(-not $Current -or -not $Owned.marker -or -not $Current.CommandLine.Contains($Owned.marker)){throw "Owned process unavailable: $($Owned.name)"}}
    foreach($Service in $State.services){$Health=Invoke-RestMethod -Uri "http://127.0.0.1:$($Service.healthPort)/actuator/health" -TimeoutSec 5;if($Health.status -ne 'UP'){throw "Owned service unhealthy: $($Service.name)"}}
    [ordered]@{passed=$true;backend='r77';frontend='r50';scopes=$Results;currentInputFiles=$Hashes.Count;historicalRoutingRevisions=$Revisions;healthyServices=6;ownedProcesses=9;c3All16Complete=$false;complete35Prd=$false;productionModified=$false}|ConvertTo-Json -Depth 8|Set-Content -LiteralPath (Join-Path $Output 'result.json') -Encoding utf8NoBOM
    "C3_READ_RACES_CHECKPOINT: passed=true; current_inputs=$($Hashes.Count); historical_routing_revisions=$($Revisions.Count); services=6; processes=9; c3_all_16_complete=false; complete_35_prd=false"|Tee-Object -FilePath (Join-Path $Output 'summary.log')
} catch {
    [ordered]@{passed=$false;step=$Step;c3All16Complete=$false;complete35Prd=$false}|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $Output 'result.json') -Encoding utf8NoBOM
    throw
}
