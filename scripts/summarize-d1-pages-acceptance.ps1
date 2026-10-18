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
$Output=Join-Path $Evidence "d1-pages-acceptance-20261005-$Round"
if(Test-Path -LiteralPath $Output){throw 'Retain previous D1 pages report'}
[IO.Directory]::CreateDirectory($Output)|Out-Null
$Hashes=@{}
$EvidenceHashes=@{}
function Read-Evidence([string]$Relative){
    $File=Join-Path $Evidence $Relative
    $EvidenceHashes[$Relative]=(Get-FileHash -LiteralPath $File).Hash
    Get-Content -LiteralPath $File -Raw
}
foreach($Snapshot in @("d1-pages-live-20261005-$ActualRound/inputs.json","h3-portal-finance-adjacent-20261002-$AdjacentRound/inputs.json")){
    $Inputs=@((Read-Evidence $Snapshot)|ConvertFrom-Json)
    if(-not $Inputs.Count){throw 'Empty D1 pages input snapshot'}
    foreach($Input in $Inputs){
        $Resolved=[IO.Path]::GetFullPath((Join-Path $Root $Input.Path))
        if(-not $Resolved.StartsWith($Root+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)){throw 'Input outside workspace'}
        if((Get-FileHash -LiteralPath $Resolved).Hash -ne $Input.Hash){throw "D1 pages execution input changed: $($Input.Path)"}
        if($Hashes.ContainsKey($Input.Path) -and $Hashes[$Input.Path] -ne $Input.Hash){throw 'Conflicting stage inputs'}
        $Hashes[$Input.Path]=$Input.Hash
    }
}
$ReportPath='scripts/summarize-d1-pages-acceptance.ps1'
$Hashes[$ReportPath]=(Get-FileHash -LiteralPath (Join-Path $Root $ReportPath)).Hash
$Actual=(Read-Evidence "d1-pages-live-20261005-$ActualRound/result.json")|ConvertFrom-Json
foreach($Key in @('passed','adminDesktop','adminMobile','employeeDesktop','employeeMobile','preservation','bindingRestored','secrets')){
    if($Actual.$Key -ne $true){throw "D1 pages evidence missing: $Key"}
}
if($Actual.browserErrors -ne 0 -or $Actual.checks.Count -lt 100 -or $Actual.pageRequests -lt 20){throw 'D1 pages evidence scope incomplete'}
if($Actual.screenshots.Count -ne 10){throw 'Page screenshot evidence incomplete'}
foreach($Screenshot in $Actual.screenshots){
    if($Screenshot -notmatch '^[a-z_-]+\.png$'){throw 'Invalid screenshot path'}
    $Image=Join-Path $Evidence "d1-pages-live-20261005-$ActualRound/$Screenshot"
    if((Get-Item -LiteralPath $Image).Length -lt 10000){throw 'Empty page screenshot'}
    $EvidenceHashes["d1-pages-live-20261005-$ActualRound/$Screenshot"]=(Get-FileHash -LiteralPath $Image).Hash
}
$Launch=Read-Evidence "d1-pages-live-20261005-$ActualRound-launch.log"
foreach($Pattern in @('D1_PAGES_RUN_EXIT=0','changed=0; exit=0','OWNED_CAPTCHA_RESTORED: original_limit=100; original_ttl=-1;',
    'counter_writes=0; database_unchanged=true; production_modified=false')){
    if(-not $Launch.Contains($Pattern)){throw 'Original runner completion or captcha restoration missing'}
}
foreach($Build in @("backend-$BackendRound","frontend-$FrontendRound")){
    $BuildLog=Read-Evidence "h3-portal-finance-20261002-$Build.log"
    if($BuildLog -notmatch 'FINANCE_BUILD: phase=\w+; files=\d+; changed=0; exit=0'){throw 'Build completion missing'}
}
$Bridges=Read-Evidence 'd1-pages-owner-bridges-r1-launch.log'
if($Bridges -notmatch 'PASS: D1 leave rule bridge checks=\d+' -or $Bridges -notmatch 'PASS: D1 leave client checks=4' -or
    $Bridges -notmatch 'PASS: D1 leave owner read checks=85' -or $Bridges -notmatch 'H access bridges: stable source SHA256='){throw 'Rule bridge checks incomplete'}
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
    VerifiedCriteria=@();PartialCriteria=@('AC-2','AC-4');D1All17Complete=$false;Screenshots=$Actual.screenshots.Count;PageRequests=$Actual.pageRequests
    ActualChecks=$Actual.checks.Count;Requests=$Actual.requests;CurrentInputFiles=$Hashes.Count;InputChanges=0;Processes=$State.processes.Count;Services=$Health
    PriorEvidence='Policy B77/F50 and leave/cycle B78/F50 retain historical inputs. Current pages add ledger columns and translated types, plus the employee mobile route; admin mobile retains desktop guidance. Captcha runner has a new pages mode.'
}
$Result|ConvertTo-Json -Depth 5|Set-Content -LiteralPath (Join-Path $Output 'result.json') -Encoding utf8NoBOM
@($Hashes.GetEnumerator()|Sort-Object Key|ForEach-Object{[pscustomobject]@{Path=$_.Key;Hash=$_.Value}})|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $Output 'inputs.json') -Encoding utf8NoBOM
$EvidenceHashes|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $Output 'evidence-hashes.json') -Encoding utf8NoBOM
"D1_PAGES_ACCEPTANCE: criteria=0; partial_criteria=2; actual_checks=$($Actual.checks.Count); requests=$($Actual.requests); inputs=$($Hashes.Count); changed=0; processes=9; services=6; all17_complete=false; exit=0"
