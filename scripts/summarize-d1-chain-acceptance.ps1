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
$Output=Join-Path $Evidence "d1-chain-acceptance-20261005-$Round"
if(Test-Path -LiteralPath $Output){throw 'Retain previous D1 chain report'}
[IO.Directory]::CreateDirectory($Output)|Out-Null
$Hashes=@{}
$EvidenceHashes=@{}
function Read-Evidence([string]$Relative){
    $File=Join-Path $Evidence $Relative
    $EvidenceHashes[$Relative]=(Get-FileHash -LiteralPath $File).Hash
    Get-Content -LiteralPath $File -Raw
}
foreach($Snapshot in @("d1-chain-live-20261005-$ActualRound/inputs.json","h3-portal-finance-adjacent-20261002-$AdjacentRound/inputs.json")){
    $Inputs=@((Read-Evidence $Snapshot)|ConvertFrom-Json)
    if(-not $Inputs.Count){throw 'Empty D1 chain input snapshot'}
    foreach($Input in $Inputs){
        $Resolved=[IO.Path]::GetFullPath((Join-Path $Root $Input.Path))
        if(-not $Resolved.StartsWith($Root+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)){throw 'Input outside workspace'}
        if((Get-FileHash -LiteralPath $Resolved).Hash -ne $Input.Hash){throw "D1 chain execution input changed: $($Input.Path)"}
        if($Hashes.ContainsKey($Input.Path) -and $Hashes[$Input.Path] -ne $Input.Hash){throw 'Conflicting stage inputs'}
        $Hashes[$Input.Path]=$Input.Hash
    }
}
$ReportPath='scripts/summarize-d1-chain-acceptance.ps1'
$Hashes[$ReportPath]=(Get-FileHash -LiteralPath (Join-Path $Root $ReportPath)).Hash
$Actual=(Read-Evidence "d1-chain-live-20261005-$ActualRound/result.json")|ConvertFrom-Json
foreach($Key in @('passed','allocation','approval','carry','expiry','chain','page','preservation','restoration','secrets')){
    if($Actual.$Key -ne $true){throw "D1 chain evidence missing: $Key"}
}
if($Actual.browserErrors -ne 0 -or $Actual.checks.Count -lt 40 -or $Actual.requests -lt 7){throw 'D1 chain review evidence scope incomplete'}
$Fixture=(Read-Evidence "d1-chain-live-20261005-$ActualRound/fixture.json")|ConvertFrom-Json
if($Fixture.executions.Count -ne 4 -or -not $Fixture.employeeId -or @($Fixture.types.PSObject.Properties).Count -ne 1){throw 'Chain fixture evidence incomplete'}
if($Fixture.resumedFrom -notmatch '^r[1-9][0-9]*$'){throw 'Real operation source required'}
$OperationsRound=$Fixture.resumedFrom
$Operations=(Read-Evidence "d1-chain-live-20261005-$OperationsRound/result.json")|ConvertFrom-Json
foreach($Key in @('allocation','approval','carry','expiry','chain','restoration','preservation','secrets')){if($Operations.$Key -ne $true){throw 'Real source operations incomplete'}}
if($Operations.passed -ne $false -or $Operations.page -ne $false -or $Operations.failure -notlike 'locator.click: Error: strict mode violation:*' -or $Operations.checks.Count -lt 100 -or $Operations.requests -lt 35){throw 'Unexpected source failure boundary'}
$OperationsFixture=(Read-Evidence "d1-chain-live-20261005-$OperationsRound/fixture.json")|ConvertFrom-Json
if($OperationsFixture.employeeId -ne $Fixture.employeeId -or $OperationsFixture.types.base -ne $Fixture.types.base -or $OperationsFixture.resumedFrom -notmatch '^r[1-9][0-9]*$'){throw 'Resume changed employee or leave type'}
$AllocationRound=$OperationsFixture.resumedFrom
$Allocation=(Read-Evidence "d1-chain-live-20261005-$AllocationRound/result.json")|ConvertFrom-Json
if(-not $Allocation.allocation -or -not $Allocation.restoration -or -not $Allocation.preservation -or $Allocation.failure -ne 'POST_/hr/ess/leave:status_400_code_INVALID_LEAVE_DURATION'){throw 'Original allocation evidence missing'}
$AllocationFixture=(Read-Evidence "d1-chain-live-20261005-$AllocationRound/fixture.json")|ConvertFrom-Json
if($AllocationFixture.employeeId -ne $Fixture.employeeId -or $AllocationFixture.types.base -ne $Fixture.types.base -or $AllocationFixture.requests.Count -ne 0){throw 'Original allocation fixture mismatch'}
foreach($SourceRound in @($OperationsRound,$AllocationRound)){
    $SourceInputs=(Read-Evidence "d1-chain-live-20261005-$SourceRound/inputs.json")|ConvertFrom-Json
    foreach($Input in @($SourceInputs|Where-Object {$_.Path -like 'cloudflow-backend/*' -or $_.Path -like 'cloudflow-frontend/*'})){
        if((Get-FileHash -LiteralPath (Join-Path $Root $Input.Path)).Hash -ne $Input.Hash){throw 'Historical chain product differs from current product'}
    }
    $Recorded=@($SourceInputs|Where-Object Path -eq 'scripts/verify-d1-chain-live.mjs')
    $SourceFile=Join-Path $Evidence "d1-chain-live-20261005-$SourceRound/verification-source.mjs"
    if($Recorded.Count -ne 1 -or (Get-FileHash -LiteralPath $SourceFile).Hash -ne $Recorded[0].Hash){throw 'Original verification source not retained exactly'}
    $EvidenceHashes["d1-chain-live-20261005-$SourceRound/verification-source.mjs"]=$Recorded[0].Hash
    $SourceLog=Read-Evidence "d1-chain-live-20261005-$SourceRound-launch.log"
    if(-not $SourceLog.Contains('OWNED_CAPTCHA_RESTORED: original_limit=100; original_ttl=-1;') -or -not $SourceLog.Contains('changed=0; exit=1')){throw 'Original failed stage terminal evidence missing'}
}
$Chain=(Read-Evidence "d1-chain-live-20261005-$ActualRound/chain.json")|ConvertFrom-Json
if($Chain.Count -ne 8 -or @($Chain|Where-Object {$_.transactionType -eq 'APPLICATION'}).Count -ne 1){throw 'Real complete ledger chain missing'}
$Image=Join-Path $Evidence "d1-chain-live-20261005-$ActualRound/complete-chain-desktop.png"
if((Get-Item -LiteralPath $Image).Length -lt 10000){throw 'Empty chain screenshot'}
$EvidenceHashes["d1-chain-live-20261005-$ActualRound/complete-chain-desktop.png"]=(Get-FileHash -LiteralPath $Image).Hash
foreach($Restored in $Fixture.restorations.PSObject.Properties){if($Restored.Value -ne $true){throw 'Restoration incomplete'}}
$Launch=Read-Evidence "d1-chain-live-20261005-$ActualRound-launch.log"
foreach($Pattern in @('D1_CHAIN_RUN_EXIT=0','changed=0; exit=0','OWNED_CAPTCHA_RESTORED: original_limit=100; original_ttl=-1;',
    'counter_writes=0; database_unchanged=true; production_modified=false')){
    if(-not $Launch.Contains($Pattern)){throw 'Original runner completion or captcha restoration missing'}
}
foreach($Build in @("backend-$BackendRound","frontend-$FrontendRound")){
    $BuildLog=Read-Evidence "h3-portal-finance-20261002-$Build.log"
    if($BuildLog -notmatch 'FINANCE_BUILD: phase=\w+; files=\d+; changed=0; exit=0'){throw 'Build completion missing'}
}
$Bridges=Read-Evidence 'd1-pages-owner-bridges-r1-launch.log'
if($Bridges -notmatch 'PASS: D1 leave rule bridge checks=\d+' -or $Bridges -notmatch 'PASS: D1 leave client checks=4' -or
    $Bridges -notmatch 'H access bridges: stable source SHA256='){throw 'Rule bridge checks incomplete'}
$Adjacent=Read-Evidence "h3-portal-finance-adjacent-20261002-$AdjacentRound/summary.log"
if($Adjacent -notmatch 'H3_FINANCE_ADJACENT: files=\d+; changed=0; exit=0; production_modified=false'){throw 'Adjacent completion missing'}
$Database=Read-Evidence "h3-portal-finance-adjacent-20261002-$AdjacentRound/oa-database.log"
foreach($Pattern in @('PASS: 1012 OA boundary assertions','PASS: Complete approved schema table count; expected=374; actual=374')){
    if(-not $Database.Contains($Pattern)){throw 'Adjacent database completion missing'}
}
$State=Get-Content -LiteralPath (Join-Path $Run 'state.json') -Raw|ConvertFrom-Json
if($State.status -ne 'RUNNING' -or [IO.Path]::GetFullPath($State.run) -ne $Run){throw 'Owned running fixture required'}
foreach($Entry in $State.processes){
    $Observed=Get-CimInstance Win32_Process -Filter "ProcessId=$($Entry.id)"
    if($null -eq $Observed -or -not $Observed.CommandLine.Contains($Entry.marker)){throw 'Owned process identity changed'}
}
$Health=@()
foreach($Service in $State.services){
    $Response=Invoke-WebRequest -Uri "http://127.0.0.1:$($Service.healthPort)/actuator/health" -TimeoutSec 10
    $Content=if($Response.Content -is [byte[]]){[Text.Encoding]::UTF8.GetString($Response.Content)}else{[string]$Response.Content}
    if(($Content|ConvertFrom-Json).status -ne 'UP'){throw 'Owned service unhealthy'}
    $Health+=[pscustomobject]@{Name=$Service.name;Healthy=$true}
}
if($State.processes.Count -ne 9 -or $Health.Count -ne 6){throw 'Unexpected process or service count'}
foreach($Entry in $Hashes.GetEnumerator()){
    if((Get-FileHash -LiteralPath (Join-Path $Root $Entry.Key)).Hash -ne $Entry.Value){throw 'Input changed during report'}
}
$Result=[pscustomobject]@{
    Passed=$true;Product="B$($BackendRound.Substring(1))/F$($FrontendRound.Substring(1))";ActualRound=$ActualRound;AdjacentRound=$AdjacentRound
    VerifiedCriteria=@('AC-2');PartialCriteria=@();D1All17Complete=$false;OperationsRound=$OperationsRound;OperationsChecks=$Operations.checks.Count;AllocationRound=$AllocationRound
    ActualChecks=$Actual.checks.Count;Requests=$Actual.requests;CurrentInputFiles=$Hashes.Count;InputChanges=0;Processes=$State.processes.Count;Services=$Health
    PriorEvidence='Policy B77/F50, leave/cycle B78/F50 and pages B79/F52 retain original stage inputs. Chain product remains B79/F52; captcha wrapper adds chain mode.'
}
$Result|ConvertTo-Json -Depth 5|Set-Content -LiteralPath (Join-Path $Output 'result.json') -Encoding utf8NoBOM
@($Hashes.GetEnumerator()|Sort-Object Key|ForEach-Object{[pscustomobject]@{Path=$_.Key;Hash=$_.Value}})|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $Output 'inputs.json') -Encoding utf8NoBOM
$EvidenceHashes|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $Output 'evidence-hashes.json') -Encoding utf8NoBOM
"D1_CHAIN_ACCEPTANCE: criteria=1; partial_criteria=0; actual_checks=$($Actual.checks.Count); requests=$($Actual.requests); inputs=$($Hashes.Count); changed=0; processes=9; services=6; all17_complete=false; exit=0"
