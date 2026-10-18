param([ValidatePattern('^r[1-9][0-9]*$')][string]$Round='r1')
$ErrorActionPreference='Stop'
. 'D:\CloudFlowPro\.cloudflow-runtime/use-data-drive.ps1'
$Root='D:\CloudFlowPro'
$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
$Output=Join-Path $Evidence "c3-permission-checkpoint-20261005-$Round"
$PriorReportHash='309A5520CEC0DB015BD66A851946D4E6453F4DBD6ABEB810835266F4791FA345'
$CurrentReportHash=(Get-FileHash -LiteralPath $PSCommandPath).Hash
if(Test-Path -LiteralPath $Output){throw 'Retain previous C3 checkpoint evidence'}
[IO.Directory]::CreateDirectory($Output)|Out-Null
function Read-Json([string]$Relative){Get-Content -LiteralPath (Join-Path $Evidence $Relative) -Raw|ConvertFrom-Json}
function Require-Text([string]$Relative,[string]$Pattern){if(-not (Select-String -LiteralPath (Join-Path $Evidence $Relative) -Pattern $Pattern -Quiet)){throw "Required evidence missing: $Relative"}}
$Step='inputs'
try {
    $Snapshots=@('h3-portal-finance-20261002-backend-r77-inputs.json','h3-portal-finance-20261002-frontend-r50-inputs.json',
        'c3-permission-paths-20261005-r2/inputs.json','c3-expression-parity-20261005-r1/inputs.json',
        'c1-form-live-20261005-r63/inputs.json','c1-form-response-20261005-r8/inputs.json','h3-portal-finance-adjacent-20261002-r74/inputs.json')
    $Verified=@{}
    foreach($Snapshot in $Snapshots){
        $Inputs=@(Read-Json $Snapshot)
        if(-not $Inputs.Count){throw 'Empty checkpoint snapshot'}
        foreach($Input in $Inputs){
            $Resolved=[IO.Path]::GetFullPath((Join-Path $Root $Input.Path))
            if(-not $Resolved.StartsWith($Root+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)){throw 'Input outside owned workspace'}
            # The adjacent runner hashes every script. This report was not executed by it;
            # its log-label correction is tracked separately from product/test inputs.
            if($Resolved -eq $PSCommandPath){
                if($Input.Hash -notin @($PriorReportHash,$CurrentReportHash)){throw 'Unrecognized prior report input'}
                continue
            }
            $Actual=if($Verified.ContainsKey($Resolved)){$Verified[$Resolved]}else{(Get-FileHash -LiteralPath $Resolved).Hash}
            if($Actual -ne $Input.Hash){throw "Checkpoint input changed: $($Input.Path)"}
            $Verified[$Resolved]=$Actual
        }
    }
    $Step='retained-check-results'
    foreach($Name in @('c3-backend-r77','c3-permission-paths-r2','c3-workflow-restart-r77','c3-permission-actual-r63','c3-expression-parity-r1','c3-response-r8','c3-adjacent-r74')){
        Require-Text "$Name-launch.log" '.'
    }
    Require-Text 'c3-permission-paths-20261005-r2/summary.log' 'changed=0; exit=0'
    Require-Text 'c3-permission-paths-20261005-r2/checks.log' 'cases=10; checks=114; failures=0'
    Require-Text 'c3-expression-parity-20261005-r1/parity.log' 'cases=58; result_checks=174; filter_checks=8; same_corpus=true; passed=true'
    Require-Text 'c1-form-response-20261005-r8/summary.log' 'changed=0; exit=0'
    Require-Text 'h3-portal-finance-adjacent-20261002-r74/summary.log' 'changed=0; exit=0'
    Require-Text 'h3-portal-finance-adjacent-20261002-r74/oa-database.log' '^PASS: Complete approved schema table count; expected=374; actual=374'
    Require-Text 'h3-portal-finance-adjacent-20261002-r74/oa-database.log' '1012'
    $Step='actual-pages'
    $Live=Read-Json 'c1-form-live-20261005-r63/result.json'
    if(-not $Live.passed -or -not $Live.isolated -or -not $Live.permissionPagesExecuted -or $Live.checks.Count -ne 165 -or @($Live.checks|Where-Object{-not $_.passed}).Count){throw 'Complete C3 actual permission evidence required'}
    $Pages=Read-Json ("c3-permission-pages-$($Live.runId)/result.json")
    if(-not $Pages.passed -or -not $Pages.realPages -or $Pages.fabricatedResponses -ne 0 -or $Pages.versions.Count -ne 2 -or $Pages.readCases.Count -ne 10 -or $Pages.pageErrors.Count){throw 'Two real page versions required'}
    foreach($Version in @(1,2)){
        foreach($Name in @('c3_tamper_audit_is_durable_and_private_v','c3_omitted_readonly_and_hidden_values_preserved_v','c3_page_node_optional_override_completes_v','c3_hr_node_receives_protected_keys_v')){
            if(@($Live.checks|Where-Object{$_.label -eq "$Name$Version" -and $_.passed}).Count -ne 1){throw 'Required C3 assertion absent'}
        }
    }
    Require-Text 'c1-form-live-20261005-r63/live.log' 'C_LOG_SCAN .*plaintext_hits=0'
    Require-Text 'c1-form-live-20261005-r63/live.log' 'C_AUDIT_SCAN access_requests=12; failed_requests=7; access_rows=12; error_rows=7; plaintext_hits=0'
    Require-Text 'c3-permission-actual-r63-launch.log' 'OWNED_CAPTCHA_RESTORED: original_limit=100; original_ttl=-1; counter_before=343; counter_after=347; counter_writes=0; database_unchanged=true'
    $Step='owned-runtime'
    $State=Get-Content -LiteralPath (Join-Path $Root '.cloudflow-runtime/batch-g-integration/9799534e1a3a47b5958330f14ae16dc7/state.json') -Raw|ConvertFrom-Json
    if($State.status -ne 'RUNNING' -or $State.processes.Count -ne 9 -or $State.services.Count -ne 6){throw 'Expected owned runtime required'}
    foreach($Owned in $State.processes){
        $Current=Get-CimInstance Win32_Process -Filter "ProcessId = $($Owned.id)"
        if(-not $Current -or -not $Owned.marker -or -not $Current.CommandLine.Contains($Owned.marker)){throw "Owned process identity unavailable: $($Owned.name)"}
    }
    foreach($Service in $State.services){
        $Health=Invoke-RestMethod -Uri "http://127.0.0.1:$($Service.healthPort)/actuator/health" -TimeoutSec 5
        if($Health.status -ne 'UP'){throw "Owned service unhealthy: $($Service.name)"}
    }
    [ordered]@{passed=$true;backend='r77';frontend='r50';pathCases=10;pathChecks=114;actualChecks=165;actualRequests=$Live.requests.Count;actualVersions=2;actualReadCases=10;expressionCases=58;expressionChecks=174;filterChecks=8;verifiedInputFiles=$Verified.Count;reportRevision=@{prior=$PriorReportHash;current=$CurrentReportHash;scope='Report log-label correction only; not an executed adjacent check'};healthyServices=6;ownedProcesses=9;c3All16Complete=$false;complete35Prd=$false;productionModified=$false}|ConvertTo-Json -Depth 5|Set-Content -LiteralPath (Join-Path $Output 'result.json') -Encoding utf8NoBOM
    "C3_PERMISSION_CHECKPOINT: passed=true; backend=r77; frontend=r50; actual_checks=165; expression_cases=58; inputs=$($Verified.Count); services=6; processes=9; c3_all_16_complete=false; complete_35_prd=false"|Tee-Object -FilePath (Join-Path $Output 'summary.log')
} catch {
    [ordered]@{passed=$false;step=$Step;c3All16Complete=$false;complete35Prd=$false}|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $Output 'result.json') -Encoding utf8NoBOM
    throw
}
