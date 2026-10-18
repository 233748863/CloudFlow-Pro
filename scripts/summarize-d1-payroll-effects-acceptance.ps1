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
$Output=Join-Path $Evidence "d1-payroll-effects-acceptance-20261005-$Round"
if(Test-Path -LiteralPath $Output){throw 'Retain previous D1 payroll report'}
[IO.Directory]::CreateDirectory($Output)|Out-Null
$Hashes=@{}
$EvidenceHashes=@{}
function Read-Bytes([string]$File){
    $Stream=[IO.File]::Open($File,[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::ReadWrite)
    $Memory=[IO.MemoryStream]::new()
    try {$Stream.CopyTo($Memory); return ,$Memory.ToArray()} finally {$Stream.Dispose();$Memory.Dispose()}
}
function Read-Evidence([string]$Relative){
    $File=Join-Path $Evidence $Relative
    $Bytes=Read-Bytes $File
    $Hasher=[Security.Cryptography.SHA256]::Create()
    try {
        $Digest=[Convert]::ToHexString($Hasher.ComputeHash($Bytes))
        if($Digest -ne [Convert]::ToHexString($Hasher.ComputeHash((Read-Bytes $File)))){throw 'Evidence changed while reading'}
        $EvidenceHashes[$Relative]=$Digest
    } finally {$Hasher.Dispose()}
    [Text.Encoding]::UTF8.GetString($Bytes).TrimStart([char]0xFEFF)
}
foreach($Snapshot in @("d1-payroll-effects-live-20261005-$ActualRound/inputs.json","h3-portal-finance-adjacent-20261002-$AdjacentRound/inputs.json")){
    $Inputs=@((Read-Evidence $Snapshot)|ConvertFrom-Json)
    if(-not $Inputs.Count){throw 'Empty input snapshot'}
    foreach($Input in $Inputs){
        $Name=$Input.Path.Replace('\','/')
        $Resolved=[IO.Path]::GetFullPath((Join-Path $Root $Name))
        if(-not $Resolved.StartsWith($Root+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)){throw 'Input outside workspace'}
        if((Get-FileHash -LiteralPath $Resolved).Hash -ne $Input.Hash){throw "Input changed: $Name"}
        if($Hashes.ContainsKey($Name) -and $Hashes[$Name] -ne $Input.Hash){throw 'Conflicting input hashes'}
        $Hashes[$Name]=$Input.Hash
    }
}
$Self='scripts/summarize-d1-payroll-effects-acceptance.ps1'
$Hashes[$Self]=(Get-FileHash -LiteralPath (Join-Path $Root $Self)).Hash
$Actual=(Read-Evidence "d1-payroll-effects-live-20261005-$ActualRound/result.json")|ConvertFrom-Json
foreach($Key in @('passed','approval','negative','payroll','snapshot','preservation','restoration','secrets')){if($Actual.$Key -ne $true){throw "Missing actual result: $Key"}}
foreach($Name in @('unpaid','partial','paid','negative')){
    foreach($Suffix in @('manager_real_assignee','hr_real_assignee','single_actual_application')){
        if("${Name}_$Suffix" -notin $Actual.checks){throw 'Actual leave approval evidence missing'}
    }
}
foreach($Name in @('preview','actual_draft','submitted')){
    foreach($Suffix in @('exact_encashment_source_and_component','unpaid100_partial40_paid0','gross_and_net')){
        if("${Name}_$Suffix" -notin $Actual.checks){throw 'Actual payroll result missing'}
    }
}
if($Actual.checks.Count -lt 104 -or $Actual.requests -lt 55){throw 'Actual scope incomplete'}
$Fixture=(Read-Evidence "d1-payroll-effects-live-20261005-$ActualRound/fixture.json")|ConvertFrom-Json
if($Fixture.requests.Count -ne 4 -or -not $Fixture.slipId -or -not $Fixture.batchId -or -not $Fixture.executeNo){throw 'Original payroll identifiers missing'}
foreach($Item in $Fixture.restorations.PSObject.Properties){if($Item.Value -ne $true){throw 'Restoration incomplete'}}
$Payroll=(Read-Evidence "d1-payroll-effects-live-20261005-$ActualRound/payroll.json")|ConvertFrom-Json
if($Payroll.slipId -ne $Fixture.slipId -or [decimal]$Payroll.gross -ne [decimal]'2823.45' -or [decimal]$Payroll.net -ne [decimal]'2683.45'){throw 'Payroll evidence mismatch'}
$Source=(Read-Evidence 'd1-ledger-rules-live-20261005-r5/result.json')|ConvertFrom-Json
$SourceFixture=(Read-Evidence 'd1-ledger-rules-live-20261005-r5/fixture.json')|ConvertFrom-Json
if(-not $Source.passed -or $SourceFixture.employeeId -ne $Fixture.employeeId){throw 'Original encashment source mismatch'}
$Cash=@($Payroll.components|Where-Object name -eq 'LEAVE_ENCASHMENT')
if($Cash.Count -ne 1 -or [string]$Cash[0].changeId -ne $SourceFixture.salaryChangeId -or [string]$Cash[0].salaryComponentId -ne $SourceFixture.components.cash -or [decimal]$Cash[0].amount -ne [decimal]'123.45'){throw 'Payroll lost original encashment identity'}
$SourceInputs=(Read-Evidence 'd1-ledger-rules-live-20261005-r5/inputs.json')|ConvertFrom-Json
foreach($Input in $SourceInputs){
    $Name=$Input.Path.Replace('\','/')
    if($Name.StartsWith('cloudflow-backend/') -or $Name.StartsWith('cloudflow-frontend/')){
        if((Get-FileHash -LiteralPath (Join-Path $Root $Name)).Hash -ne $Input.Hash){throw 'Product differs from source encashment stage'}
    }
}
$Launch=Read-Evidence "d1-payroll-effects-live-20261005-$ActualRound-launch.log"
foreach($Pattern in @('D1_PAYROLL_EFFECTS_RUN_EXIT=0','changed=0; exit=0','OWNED_CAPTCHA_RESTORED: original_limit=100; original_ttl=-1;',
    'counter_writes=0; database_unchanged=true; production_modified=false')){if(-not $Launch.Contains($Pattern)){throw 'Original completion evidence missing'}}
foreach($Build in @("backend-$BackendRound","frontend-$FrontendRound")){
    if((Read-Evidence "h3-portal-finance-20261002-$Build.log") -notmatch 'FINANCE_BUILD: phase=\w+; files=\d+; changed=0; exit=0'){throw 'Build completion missing'}
}
if((Read-Evidence "h3-portal-finance-adjacent-20261002-$AdjacentRound/summary.log") -notmatch 'H3_FINANCE_ADJACENT: files=\d+; changed=0; exit=0; production_modified=false'){throw 'Adjacent completion missing'}
$Database=Read-Evidence "h3-portal-finance-adjacent-20261002-$AdjacentRound/oa-database.log"
foreach($Pattern in @('PASS: 1012 OA boundary assertions','PASS: Complete approved schema table count; expected=374; actual=374')){if(-not $Database.Contains($Pattern)){throw 'Adjacent database evidence missing'}}
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
foreach($Entry in $Hashes.GetEnumerator()){if((Get-FileHash -LiteralPath (Join-Path $Root $Entry.Key)).Hash -ne $Entry.Value){throw 'Input changed during report'}}
$Result=[pscustomobject]@{
    Passed=$true;Product="B$($BackendRound.Substring(1))/F$($FrontendRound.Substring(1))";ActualRound=$ActualRound;AdjacentRound=$AdjacentRound
    VerifiedCriteria=@();PartialCriteria=@('AC-4');D1All17Complete=$false;PayrollSlipActual=$true
    ActualChecks=$Actual.checks.Count;Requests=$Actual.requests;CurrentInputFiles=$Hashes.Count;InputChanges=0;Processes=$State.processes.Count;Services=$Health
    PriorEvidence='Same B81/F52 encashment from ledger-rules R5, original employee and change preserved. Earlier D1 criteria retain their original stage versions; full 17-criteria current verification remains open.'
}
$Result|ConvertTo-Json -Depth 5|Set-Content -LiteralPath (Join-Path $Output 'result.json') -Encoding utf8NoBOM
@($Hashes.GetEnumerator()|Sort-Object Key|ForEach-Object{[pscustomobject]@{Path=$_.Key;Hash=$_.Value}})|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $Output 'inputs.json') -Encoding utf8NoBOM
$EvidenceHashes|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $Output 'evidence-hashes.json') -Encoding utf8NoBOM
"D1_PAYROLL_EFFECTS_ACCEPTANCE: partial_criteria=1; checks=$($Actual.checks.Count); requests=$($Actual.requests); inputs=$($Hashes.Count); changed=0; processes=9; services=6; all17_complete=false; exit=0"
