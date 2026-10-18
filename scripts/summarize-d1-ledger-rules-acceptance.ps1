param([ValidatePattern('^r[1-9][0-9]*$')][string]$Round='r1',
    [Parameter(Mandatory=$true)][ValidatePattern('^r[1-9][0-9]*$')][string]$ActualRound,
    [Parameter(Mandatory=$true)][ValidatePattern('^r[1-9][0-9]*$')][string]$AdjacentRound,
    [Parameter(Mandatory=$true)][ValidatePattern('^r[1-9][0-9]*$')][string]$BackendRound,
    [Parameter(Mandatory=$true)][ValidatePattern('^r[1-9][0-9]*$')][string]$FrontendRound)
$ErrorActionPreference='Stop'
. 'D:\CloudFlowPro\.cloudflow-runtime\use-data-drive.ps1'
$Root='D:\CloudFlowPro'
$Run=Join-Path $Root '.cloudflow-runtime/batch-g-integration/9799534e1a3a47b5958330f14ae16dc7'
$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
$Output=Join-Path $Evidence "d1-ledger-rules-acceptance-20261005-$Round"
if(Test-Path -LiteralPath $Output){throw 'Retain previous D1 ledger rule report'}
[IO.Directory]::CreateDirectory($Output)|Out-Null
$Hashes=@{}
$EvidenceHashes=@{}
function Read-SharedBytes([string]$File){
    $Stream=[IO.File]::Open($File,[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::ReadWrite)
    $Memory=[IO.MemoryStream]::new()
    try {$Stream.CopyTo($Memory); return ,$Memory.ToArray()} finally {$Stream.Dispose();$Memory.Dispose()}
}
function Read-Evidence([string]$Relative){
    $File=Join-Path $Evidence $Relative
    $First=Read-SharedBytes $File
    $Second=Read-SharedBytes $File
    $Hasher=[Security.Cryptography.SHA256]::Create()
    try {
        $Digest=[Convert]::ToHexString($Hasher.ComputeHash($First))
        if($Digest -ne [Convert]::ToHexString($Hasher.ComputeHash($Second))){throw 'Evidence changed while reading'}
        $EvidenceHashes[$Relative]=$Digest
    } finally {$Hasher.Dispose()}
    [Text.Encoding]::UTF8.GetString($First).TrimStart([char]0xFEFF)
}
foreach($Snapshot in @("d1-ledger-rules-live-20261005-$ActualRound/inputs.json","h3-portal-finance-adjacent-20261002-$AdjacentRound/inputs.json")){
    $Inputs=@((Read-Evidence $Snapshot)|ConvertFrom-Json)
    if(-not $Inputs.Count){throw 'Empty input snapshot'}
    foreach($Input in $Inputs){
        $Resolved=[IO.Path]::GetFullPath((Join-Path $Root $Input.Path))
        if(-not $Resolved.StartsWith($Root+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)){throw 'Input outside workspace'}
        $CurrentHash=(Get-FileHash -LiteralPath $Resolved).Hash
        if($CurrentHash -ne $Input.Hash){
            if($Input.Path.Replace('\','/') -ne 'scripts/summarize-d1-ledger-rules-acceptance.ps1'){throw "Input changed: $($Input.Path)"}
            $OriginalReport='d1-ledger-rules-acceptance-20261005-r1/report-source.ps1'
            if((Get-FileHash -LiteralPath (Join-Path $Evidence $OriginalReport)).Hash -ne $Input.Hash){throw 'Original reporter source not retained'}
            $EvidenceHashes[$OriginalReport]=$Input.Hash
            $Input.Hash=$CurrentHash
        }
        if($Hashes.ContainsKey($Input.Path) -and $Hashes[$Input.Path] -ne $Input.Hash){throw 'Conflicting stage inputs'}
        $Hashes[$Input.Path]=$Input.Hash
    }
}
$Self='scripts/summarize-d1-ledger-rules-acceptance.ps1'
$Hashes[$Self]=(Get-FileHash -LiteralPath (Join-Path $Root $Self)).Hash
$Actual=(Read-Evidence "d1-ledger-rules-live-20261005-$ActualRound/result.json")|ConvertFrom-Json
foreach($Key in @('passed','allocation','negative','compensatory','encashment','component','preservation','secrets')){
    if($Actual.$Key -ne $true){throw "Missing actual result: $Key"}
}
foreach($Check in @('encashment_insufficient_rolls_back_salary','encashment_insufficient_rolls_back_salary_no_ledger_quota_or_salary_change',
    'encashment_generates_exact_approved_amount_and_date','encashment_salary_amounts_encrypted_at_rest','repeat_encashment_no_additional_salary',
    'salary_change_keeps_selected_component','disabled_salary_component_rejected','nonexistent_salary_component_configuration_rejected',
    'all_existing_employee_bindings_preserved')){
    if($Check -notin $Actual.checks){throw 'Required actual boundary missing'}
}
if($Actual.checks.Count -lt 75 -or $Actual.requests -lt 35){throw 'Actual evidence scope incomplete'}
$Fixture=(Read-Evidence "d1-ledger-rules-live-20261005-$ActualRound/fixture.json")|ConvertFrom-Json
if(-not $Fixture.employeeId -or -not $Fixture.salaryChangeId -or $Fixture.componentDisabled -ne $false){throw 'Fixture restoration incomplete'}
$Launch=Read-Evidence "d1-ledger-rules-live-20261005-$ActualRound-launch.log"
foreach($Pattern in @('D1_LEDGER_RULES_RUN_EXIT=0','changed=0; exit=0','OWNED_CAPTCHA_RESTORED: original_limit=100; original_ttl=-1;',
    'counter_writes=0; database_unchanged=true; production_modified=false')){
    if(-not $Launch.Contains($Pattern)){throw 'Actual terminal or restoration evidence missing'}
}
foreach($FailedRound in @('r1','r3','r4')){
    $Failed=(Read-Evidence "d1-ledger-rules-live-20261005-$FailedRound/result.json")|ConvertFrom-Json
    if($Failed.passed -ne $false -or -not $Failed.preservation -or -not $Failed.secrets){throw 'Historical failure boundary changed'}
    $Original=(Read-Evidence "d1-ledger-rules-live-20261005-$FailedRound/inputs.json")|ConvertFrom-Json
    $Recorded=@($Original|Where-Object Path -eq 'scripts/verify-d1-ledger-rules-live.mjs')
    $Source="d1-ledger-rules-live-20261005-$FailedRound/verification-source.mjs"
    if($Recorded.Count -ne 1 -or (Get-FileHash -LiteralPath (Join-Path $Evidence $Source)).Hash -ne $Recorded[0].Hash){throw 'Original failed verification source changed'}
    $EvidenceHashes[$Source]=$Recorded[0].Hash
    $FailedLaunch=Read-Evidence "d1-ledger-rules-live-20261005-$FailedRound-launch.log"
    if(-not $FailedLaunch.Contains('changed=0; exit=1') -or -not $FailedLaunch.Contains('OWNED_CAPTCHA_RESTORED: original_limit=100; original_ttl=-1;')){throw 'Historical failed terminal or restoration missing'}
}
$Preflight=Read-Evidence 'd1-ledger-rules-live-20261005-r2-launch.log'
$PreflightError=Read-Evidence 'd1-ledger-rules-live-20261005-r2-launch.err'
if(-not $Preflight.Contains('counter_before=485; counter_after=485;') -or -not $PreflightError.Contains('Owned process verification failed')){throw 'Preflight failure evidence missing'}
$Smtp=Read-Evidence 'd1-ledger-rules-smtp-recovery-r1-launch.log'
if(-not $Smtp.Contains('ISOLATED_SMTP_READY:')){throw 'Owned fixture recovery evidence missing'}
foreach($Build in @("backend-$BackendRound","frontend-$FrontendRound")){
    $BuildLog=Read-Evidence "h3-portal-finance-20261002-$Build.log"
    if($BuildLog -notmatch 'FINANCE_BUILD: phase=\w+; files=\d+; changed=0; exit=0'){throw 'Build completion missing'}
}
$Bridge=Read-Evidence 'd1-ledger-rules-bridges-r1-launch.log'
if(-not $Bridge.Contains('PASS: D1 encashment component checks=17') -or -not $Bridge.Contains('PASS: D1 leave owner read checks=85') -or -not $Bridge.Contains('H access bridges: stable source SHA256=')){throw 'Independent component checks missing'}
$Adjacent=Read-Evidence "h3-portal-finance-adjacent-20261002-$AdjacentRound/summary.log"
if($Adjacent -notmatch 'H3_FINANCE_ADJACENT: files=\d+; changed=0; exit=0; production_modified=false'){throw 'Adjacent completion missing'}
$Database=Read-Evidence "h3-portal-finance-adjacent-20261002-$AdjacentRound/oa-database.log"
foreach($Pattern in @('PASS: 1012 OA boundary assertions','PASS: Complete approved schema table count; expected=374; actual=374')){
    if(-not $Database.Contains($Pattern)){throw 'Adjacent database evidence missing'}
}
$State=Get-Content -LiteralPath (Join-Path $Run 'state.json') -Raw|ConvertFrom-Json
if($State.status -ne 'RUNNING' -or [IO.Path]::GetFullPath($State.run) -ne $Run){throw 'Owned fixture required'}
foreach($Entry in $State.processes){
    $Observed=Get-CimInstance Win32_Process -Filter "ProcessId=$($Entry.id)"
    if($null -eq $Observed -or -not $Observed.CommandLine.Contains($Entry.marker)){throw 'Owned process identity changed'}
}
$Health=@()
foreach($Service in $State.services){
    $Response=Invoke-RestMethod -Uri "http://127.0.0.1:$($Service.healthPort)/actuator/health" -TimeoutSec 10
    if($Response.status -ne 'UP'){throw 'Owned service unhealthy'}
    $Health+=[pscustomobject]@{Name=$Service.name;Healthy=$true}
}
if($State.processes.Count -ne 9 -or $Health.Count -ne 6){throw 'Unexpected process count'}
foreach($Entry in $Hashes.GetEnumerator()){
    if((Get-FileHash -LiteralPath (Join-Path $Root $Entry.Key)).Hash -ne $Entry.Value){throw 'Input changed during report'}
}
$Result=[pscustomobject]@{
    Passed=$true;Product="B$($BackendRound.Substring(1))/F$($FrontendRound.Substring(1))";ActualRound=$ActualRound;AdjacentRound=$AdjacentRound
    VerifiedCriteria=@();PartialCriteria=@('AC-4');D1All17Complete=$false;PayrollSlipActual=$false
    ReporterCorrection='R1 evidence read was blocked by an inherited writer handle. R2 stopped on Windows path separator spelling. R3 reads a shared stream twice, compares hashes and normalizes the reporter path. Adjacent R86 original reporter source is retained exactly; product and all execution scripts are unchanged.'
    ActualChecks=$Actual.checks.Count;Requests=$Actual.requests;CurrentInputFiles=$Hashes.Count;InputChanges=0;Processes=$State.processes.Count;Services=$Health
    PriorEvidence='B79 pre-fix failures and B80 component-update failure remain historical. Independent component checks ran on B80; the helper is unchanged in B81. Actual payroll slip calculation remains open.'
}
$Result|ConvertTo-Json -Depth 5|Set-Content -LiteralPath (Join-Path $Output 'result.json') -Encoding utf8NoBOM
@($Hashes.GetEnumerator()|Sort-Object Key|ForEach-Object{[pscustomobject]@{Path=$_.Key;Hash=$_.Value}})|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $Output 'inputs.json') -Encoding utf8NoBOM
$EvidenceHashes|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $Output 'evidence-hashes.json') -Encoding utf8NoBOM
"D1_LEDGER_RULES_ACCEPTANCE: partial_criteria=1; checks=$($Actual.checks.Count); requests=$($Actual.requests); inputs=$($Hashes.Count); changed=0; processes=9; services=6; all17_complete=false; exit=0"
