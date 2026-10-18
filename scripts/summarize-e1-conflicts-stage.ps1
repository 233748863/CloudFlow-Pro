param([ValidatePattern('^r[1-9][0-9]*$')][string]$Round='r1',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$AdjacentRound='r174')
$ErrorActionPreference='Stop'
. 'D:\CloudFlowPro\.cloudflow-runtime\use-data-drive.ps1'
$Root='D:\CloudFlowPro'
$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
$Run=Join-Path $Root '.cloudflow-runtime/batch-g-integration/9799534e1a3a47b5958330f14ae16dc7'
$Core=Join-Path $Evidence 'e1-activity-core-20261007-r16'
$Calendar=Join-Path $Evidence 'e1-calendar-20261007-r6'
$Conflicts=Join-Path $Evidence 'e1-conflicts-20261007-r1'
$Database=Join-Path $Evidence 'e1-reminder-database-20261007-r14'
$Packages=Join-Path $Evidence 'backend-executable-verification-20261006-r14'
$Deployment=Join-Path $Evidence 'e1-reminder-deployment-20261007-r5'
$Adjacent=Join-Path $Evidence "h3-portal-finance-adjacent-20261002-$AdjacentRound"
$Output=Join-Path $Evidence "e1-conflicts-stage-20261008-$Round.json"
$Original=$Output.Replace('.json','-original.ps1')
if((Test-Path -LiteralPath $Output) -or (Test-Path -LiteralPath $Original)){throw 'Retain original conflict stage evidence'}
[IO.File]::Copy($PSCommandPath,$Original,$false)
$Inputs=@{}
function Require([bool]$Value,[string]$Message){if(-not $Value){throw $Message}}
function Read-Json([string]$File){Get-Content -LiteralPath $File -Raw|ConvertFrom-Json}
function Full-Path([string]$File){if([IO.Path]::IsPathRooted($File)){[IO.Path]::GetFullPath($File)}else{[IO.Path]::GetFullPath((Join-Path $Root $File))}}
function File-Hash([string]$File){
    $Stream=[IO.File]::Open($File,[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::ReadWrite)
    try{return (Get-FileHash -InputStream $Stream).Hash}finally{$Stream.Dispose()}
}
function Track([string]$File,[string]$Expected=''){
    $Full=Full-Path $File;$Hash=File-Hash $Full
    if($Expected){Require ($Hash -eq $Expected) 'Recorded evidence changed'}
    if($Inputs.ContainsKey($Full)){Require ($Inputs[$Full] -eq $Hash) 'Conflicting evidence'}
    $Inputs[$Full]=$Hash
}
function Originals([string]$Directory,[int]$ExpectedCount,[bool]$Current){
    $Manifest=@{};foreach($Entry in @(Read-Json (Join-Path $Directory 'inputs.json'))){$Manifest[(Full-Path $Entry.Path)]=$Entry.Hash}
    $Base=Join-Path $Directory 'originals';$Files=@(Get-ChildItem -LiteralPath $Base -Recurse -File)
    Require ($Files.Count -eq $ExpectedCount) 'Execution originals incomplete'
    foreach($File in $Files){
        $Source=Full-Path ([IO.Path]::GetRelativePath($Base,$File.FullName))
        Require ($Manifest.ContainsKey($Source)) 'Original was not an execution input'
        Track $File.FullName $Manifest[$Source]
        if($Current){Track $Source $Manifest[$Source]}
    }
    return $Files.Count
}
function Same-Checks($CurrentResult,[string]$BaselineFile,[int]$ExpectedCount){
    $BaselineResult=Read-Json $BaselineFile
    Require ($BaselineResult.passed -and $BaselineResult.checks.Count -eq $ExpectedCount) 'Previous baseline unavailable'
    $Counts=@{}
    foreach($Label in $CurrentResult.checks){$Key=$Label.Replace($CurrentResult.marker,'{marker}') -replace '/[0-9]+(?=[:/])','/{id}';$Counts[$Key]++}
    foreach($Label in $BaselineResult.checks){$Key=$Label.Replace($BaselineResult.marker,'{marker}') -replace '/[0-9]+(?=[:/])','/{id}';Require ($Counts[$Key] -gt 0) 'Previous assertion omitted';$Counts[$Key]--}
    Require (@($Counts.Values|Where-Object{$_ -ne 0}).Count -eq 0) 'Acceptance assertion multiset differs'
    Track $BaselineFile
}
foreach($Directory in @($Core,$Calendar,$Conflicts,$Database,$Packages,$Deployment,$Adjacent)){
    $Manifest=Join-Path $Directory 'inputs.json'
    foreach($Entry in @(Read-Json $Manifest)){Track $Entry.Path $Entry.Hash}
    Track $Manifest
}
$CoreResult=Read-Json (Join-Path $Core 'result.json')
$CalendarResult=Read-Json (Join-Path $Calendar 'result.json')
$ConflictResult=Read-Json (Join-Path $Conflicts 'result.json')
Require ($CoreResult.core -and $CoreResult.mobileWorkspace -and $CoreResult.mobileDirect -and $CoreResult.desktopDeepLink -and $CoreResult.workspaceInvoices -and $CoreResult.nextActivity -and $CoreResult.businessEntries -and $CoreResult.participants) 'Core coverage incomplete'
Require ($CalendarResult.calendar -and $CalendarResult.views -and $CalendarResult.drag -and $CalendarResult.rollback -and $CalendarResult.overdue) 'Calendar coverage incomplete'
Require ($ConflictResult.conflicts -and $ConflictResult.privacy -and $ConflictResult.states -and $ConflictResult.ui) 'Conflict coverage incomplete'
$ActualResults=@(
    @{Directory=$Core;Result=$CoreResult;Checks=626;Requests=223;UiRequests=1207;Inputs=11732;Images=31;Failures=2},
    @{Directory=$Calendar;Result=$CalendarResult;Checks=101;Requests=36;UiRequests=120;Inputs=11729;Images=9;Failures=1},
    @{Directory=$Conflicts;Result=$ConflictResult;Checks=51;Requests=20;UiRequests=121;Inputs=11729;Images=2;Failures=0})
foreach($Actual in $ActualResults){
    $Result=$Actual.Result;$Execution=Read-Json (Join-Path $Actual.Directory 'execution.json')
    Require ($Result.passed -and $Result.preservation -and $Result.secrets -and -not $Result.allAcceptanceComplete -and $Result.finalFailures.Count -eq 0) 'Business result incomplete'
    Require ($Result.checks.Count -eq $Actual.Checks -and $Result.requests.Count -eq $Actual.Requests -and $Result.uiRequests.Count -eq $Actual.UiRequests) 'Actual execution count differs'
    Require ($Execution.Exit -eq 0 -and $Execution.Backend -eq 'r124' -and $Execution.Frontend -eq 'r82' -and $Execution.SourceAndRuntimeInputs -eq $Actual.Inputs -and $Execution.RuntimeFiles -eq 6382 -and $Execution.InputChanges -eq 0 -and $Execution.HealthyServices -eq 6) 'Actual runtime differs'
    Require ($Result.secretScan.files -eq 56 -and $Result.secretScan.sensitiveValues -eq 10 -and $Result.secretScan.leaks -eq 0) 'Secret scan incomplete'
    foreach($Table in @('crm_activity','crm_activity_participant','crm_activity_reminder','crm_customer','crm_follow_up')){Require (('original_rows_preserved_'+$Table) -in $Result.checks) 'Original business preservation absent'}
    Require ('role_grants_preserved' -in $Result.checks) 'Original grants changed'
    $Failures=@($Result.uiRequests|Where-Object status -ge 400)
    Require ($Failures.Count -eq $Actual.Failures) 'Unexpected browser failure count'
    foreach($Failure in $Failures){
        if($Actual.Directory -eq $Core){Require ($Failure.status -eq 400 -and $Failure.method -eq 'GET' -and $Failure.path -match '^/api/crm/activity/[0-9]+$') 'Unexpected core browser failure'}
        else{Require ($Failure.status -eq 400 -and $Failure.method -eq 'PUT' -and $Failure.path -eq '/api/crm/activity') 'Unexpected calendar browser failure'}
    }
    foreach($Name in @('inputs.json','result.json','execution.json','live.log')){Track (Join-Path $Actual.Directory $Name)}
    $Images=@(Get-ChildItem -LiteralPath $Actual.Directory -Filter '*.png' -File)
    Require ($Images.Count -eq $Actual.Images) 'Screenshots incomplete'
    foreach($File in $Images){Track $File.FullName}
}
Same-Checks $CoreResult (Join-Path $Evidence 'e1-activity-core-20261007-r15/result.json') 626
Same-Checks $CalendarResult (Join-Path $Evidence 'e1-calendar-20261007-r5/result.json') 101
Require (@($CoreResult.uiRequests|Where-Object path -eq '/api/crm/dashboard/summary').Count -eq 0) 'Unrelated dashboard requested'
foreach($Table in @('oa_invoice','crm_lead','crm_opportunity','crm_service_ticket','oa_contract','crm_contact')){Require (('original_rows_preserved_'+$Table) -in $CoreResult.checks) 'Core source business preservation absent'}
foreach($Label in @('shared_participant_conflict_saved','private_busy_period_only','admin_sees_authorized_conflict','participant_sees_both_activities','private_detail_remains_denied','foreign_detail_denied','employee_detail_denied','ui_conflict_sales','ui_conflict_does_not_block_save','ui_saved_description_persisted','ui_reopened_keeps_private_notice','ui_conflict_manager','declined_source_participant_releases_conflict','declined_other_participant_releases_conflict','tentative_participant_keeps_conflict','removed_source_participant_releases_conflict','rejoined_participant_restores_conflict','completed_source_has_no_conflict','browser_no_runtime_errors','ui_requests_all_successful')){Require ($Label -in $ConflictResult.checks) 'Conflict acceptance absent'}
$CurrentOriginals=(Originals $Core 10 $true)+(Originals $Calendar 7 $true)+(Originals $Conflicts 7 $true)+(Originals $Database 44 $true)+(Originals $Deployment 4 $true)
Track (Join-Path $Packages 'original.ps1') (File-Hash (Join-Path $Root 'scripts/verify-backend-executable-packages.ps1'))
$CurrentOriginals++
Require ($CurrentOriginals -eq 73) 'Current execution originals incomplete'
$DatabaseResult=Read-Json (Join-Path $Database 'result.json');$DatabaseLog=Get-Content -LiteralPath (Join-Path $Database 'checks.log') -Raw
Require ($DatabaseResult.Passed -and $DatabaseResult.Backend -eq 'r124' -and $DatabaseResult.Inputs -eq 5325 -and $DatabaseResult.InputChanges -eq 0 -and $DatabaseResult.TemporaryDatabaseRemoved -and -not $DatabaseResult.ProductionModified) 'Database verification incomplete'
Require ($DatabaseLog.Contains('PASS: 15709 CRM boundary assertions') -and $DatabaseLog.Contains('Temporary data removed; logs retained')) 'Database completion absent'
foreach($Name in @('result.json','checks.log')){Track (Join-Path $Database $Name)}
$FailedOriginals=0
foreach($Failure in @(
    @{Round='r11';Message='ERROR 1114'},
    @{Round='r12';Message='shared internal participant causes an activity conflict: expected=[1849065], actual=[]'},
    @{Round='r13';Message='in-progress overlap is reported and save remains allowed: expected=[1849067], actual=[1849069, 1849067]'})){
    $FailedDirectory=Join-Path $Evidence "e1-reminder-database-20261007-$($Failure.Round)"
    Require (-not (Test-Path -LiteralPath (Join-Path $FailedDirectory 'result.json'))) 'Failed database round marked passed'
    $FailureLog=Get-Content -LiteralPath (Join-Path $FailedDirectory 'checks.log') -Raw
    Require ($FailureLog.Contains($Failure.Message) -and $FailureLog.Contains('Temporary data removed; logs retained')) 'Original failure or cleanup absent'
    Require (@(Get-ChildItem -LiteralPath $FailedDirectory -Directory -Recurse -Filter 'data').Count -eq 0) 'Failed temporary database retained'
    $FailedOriginals+=Originals $FailedDirectory 44 $false
    foreach($File in Get-ChildItem -LiteralPath $FailedDirectory -File){Track $File.FullName}
}
Require ($FailedOriginals -eq 132) 'Failed execution originals incomplete'
$PackageResult=Read-Json (Join-Path $Packages 'result.json');$DeploymentResult=Read-Json (Join-Path $Deployment 'result.json')
Require ($PackageResult.Passed -and $PackageResult.BackendRound -eq 'r124' -and $PackageResult.InputChanges -eq 0 -and $PackageResult.Services.Count -eq 6) 'Six current packages required'
Require ($DeploymentResult.Passed -and $DeploymentResult.Backend -eq 'r124' -and $DeploymentResult.PackageRound -eq 'r14' -and $DeploymentResult.Inputs -eq 3843 -and $DeploymentResult.RuntimeFiles -eq 6382 -and $DeploymentResult.InputChanges -eq 0 -and $DeploymentResult.Services.Count -eq 6) 'Six current deployments required'
foreach($Package in $PackageResult.Services){
    Track $Package.Path $Package.Hash
    $Match=@($DeploymentResult.Services|Where-Object Service -eq $Package.Name)
    Require ($Match.Count -eq 1 -and $Match[0].Exit -eq 0 -and $Match[0].PackageHash -eq $Package.Hash) 'Deployment differs from verified package'
}
foreach($Directory in @($Packages,$Deployment)){Track (Join-Path $Directory 'result.json')}
$Allowed=@('src/main/java/com/cloudflow/crm/mapper/CrmActivityMapper.java','src/main/java/com/cloudflow/crm/service/impl/CrmActivityService.java','src/main/resources/mapper/CrmActivityMapper.xml')|ForEach-Object{'cloudflow-backend/cloudflow-service-crm/'+$_}
$OldFile=Join-Path $Evidence 'h3-portal-finance-20261002-backend-r123-inputs.json';$NewFile=Join-Path $Evidence 'h3-portal-finance-20261002-backend-r124-inputs.json'
$Old=@{};foreach($Entry in @(Read-Json $OldFile)){$Old[$Entry.Path.Replace('\','/')]=$Entry.Hash}
$New=@(Read-Json $NewFile);Require ($Old.Count -eq 3839 -and $New.Count -eq 3839) 'Backend input count differs'
$Changed=@();foreach($Entry in $New){$Key=$Entry.Path.Replace('\','/');Track $Entry.Path $Entry.Hash;if($Old[$Key] -ne $Entry.Hash){$Changed+=$Key}}
Require ($Changed.Count -eq 3 -and @($Changed|Where-Object{$_ -notin $Allowed}).Count -eq 0) 'Unexpected product changes'
Track $OldFile;Track $NewFile
foreach($Build in @(@{Module='backend';Round='r124';Marker='Backend; files=3839'},@{Module='frontend';Round='r82';Marker='Frontend; files=1483'})){
    $Log=Join-Path $Evidence "h3-portal-finance-20261002-$($Build.Module)-$($Build.Round).log"
    Require ((Get-Content -LiteralPath $Log -Raw).Contains("FINANCE_BUILD: phase=$($Build.Marker); changed=0; exit=0")) 'Build incomplete'
    Track $Log
}
foreach($Login in @(
    @{Log='e1-conflicts-20261007-r1-launch.log';Before=1542;After=1547},
    @{Log='e1-activity-core-20261007-r16-launch.log';Before=1547;After=1552},
    @{Log='e1-calendar-20261007-r6-launch.log';Before=1552;After=1557})){
    $Log=Join-Path $Evidence $Login.Log
    Require ((Get-Content -LiteralPath $Log -Raw).Contains("original_limit=100; original_ttl=-1; counter_before=$($Login.Before); counter_after=$($Login.After); counter_writes=0; database_unchanged=true; production_modified=false")) 'Captcha configuration not restored'
    Track $Log
}
foreach($Name in @('e1-conflict-deployment-20261008-r5.log','e1-conflict-deployment-20261008-r5.err','e1-conflict-smtp-restore-20261008-r1.log','e1-conflict-smtp-restore-20261008-r1.err')){Track (Join-Path $Evidence $Name)}
$Cleanup=Join-Path $Evidence 'verified-artifact-cleanup-20261008-r1';$CleanupResult=Read-Json (Join-Path $Cleanup 'result.json')
Require ($CleanupResult.Passed -and $CleanupResult.Targets -eq 242 -and $CleanupResult.DeletedFiles -eq 119849 -and $CleanupResult.FreedBytes -eq 39827005440 -and $CleanupResult.RetainedFiles -eq 9933 -and $CleanupResult.RetainedChanges -eq 0 -and -not $CleanupResult.SourceRemoved -and -not $CleanupResult.ReportsRemoved -and -not $CleanupResult.ScreenshotsRemoved -and -not $CleanupResult.DatabasesRemoved) 'Verified cleanup boundary differs'
foreach($Name in @('original.ps1','plan.json','deleted.jsonl','result.json')){Track (Join-Path $Cleanup $Name)}
Require ((Get-Content -LiteralPath (Join-Path $Adjacent 'summary.log') -Raw).Contains('changed=0; exit=0; production_modified=false')) 'Adjacent checks incomplete'
$OaLog=Get-Content -LiteralPath (Join-Path $Adjacent 'oa-database.log') -Raw
Require ($OaLog.Contains('Complete approved schema table count; expected=374; actual=374') -and $OaLog.Contains('PASS: 1012 OA boundary assertions')) 'Adjacent database checks incomplete'
Require ((Get-Content -LiteralPath (Join-Path $Adjacent 'menu.log') -Raw).Contains('EMPLOYEE_UNEXPECTED_GRANTS=0; EMPLOYEE_UNEXPECTED_WRITE_PERMISSIONS=0')) 'Permission regression incomplete'
foreach($File in Get-ChildItem -LiteralPath $Adjacent -File){Track $File.FullName}
$State=Read-Json (Join-Path $Run 'state.json')
Require ($State.status -eq 'RUNNING' -and $State.processes.Count -eq 9 -and $State.services.Count -eq 6) 'Owned runtime incomplete'
foreach($Entry in $State.processes){$Observed=Get-CimInstance Win32_Process -Filter "ProcessId=$($Entry.id)";Require ($null -ne $Observed -and $Observed.CommandLine.Contains($Entry.marker)) 'Owned process identity differs'}
$RuntimeFiles=0
foreach($Service in $State.services){
    $Arguments=@(Get-Content -LiteralPath (Join-Path $Run "$($Service.name)/service.args"));$Index=[Array]::IndexOf($Arguments,'-cp')
    Require ($Index -ge 0 -and $Arguments[$Index+2] -eq 'org.springframework.boot.loader.launch.JarLauncher') 'Layered launch required'
    $Layer=[IO.Path]::GetFullPath($Arguments[$Index+1].Trim('"'));$Package=@($PackageResult.Services|Where-Object Name -eq $Service.name)
    Require ($Package.Count -eq 1 -and $Layer -eq (Join-Path $Run ("$($Service.name)/artifacts/"+$Package[0].Hash.ToLowerInvariant()+'-layered'))) 'Runtime differs from verified package'
    foreach($File in Get-ChildItem -LiteralPath $Layer -File -Recurse){Require ($Inputs.ContainsKey($File.FullName)) 'Untracked runtime file';$RuntimeFiles++}
    Require ((Invoke-RestMethod "http://127.0.0.1:$($Service.healthPort)/actuator/health" -TimeoutSec 15).status -eq 'UP') 'Service unhealthy'
}
Require ($RuntimeFiles -eq 6382) 'Runtime file count differs'
Track $PSCommandPath;Track $Original (File-Hash $PSCommandPath)
foreach($File in $Inputs.Keys){Require ((File-Hash $File) -eq $Inputs[$File]) 'Current stage input changed'}
$Inputs.Keys|Sort-Object|ForEach-Object{[pscustomobject]@{Path=$_;Hash=$Inputs[$_]}}|ConvertTo-Json|Set-Content -LiteralPath $Output.Replace('.json','-inputs.json') -Encoding utf8NoBOM
[pscustomobject]@{Passed=$true;Backend='r124';Frontend='r82';CurrentInputs=$Inputs.Count;RuntimeFiles=$RuntimeFiles;CoreChecks=626;CoreRequests=223;CoreUiRequests=1207;CalendarChecks=101;CalendarRequests=36;CalendarUiRequests=120;ConflictChecks=51;ConflictRequests=20;ConflictUiRequests=121;DatabaseChecks=15709;PreviousCoreChecksRetained=626;PreviousCalendarChecksRetained=101;CurrentExecutionOriginals=$CurrentOriginals;FailedDatabaseOriginals=$FailedOriginals;Images=42;HealthyServices=6;Adjacent=$AdjacentRound;ProductChanges=$Changed;CaptchaRestored=$true;RemovedHistoricalArtifactsRecorded=$true;ConflictAcceptanceComplete=$true;AllE1AcceptanceComplete=$false;GlobalComplete=$false}|ConvertTo-Json -Depth 5|Set-Content -LiteralPath $Output -Encoding utf8NoBOM
"E1_CONFLICTS_STAGE: inputs=$($Inputs.Count); runtime_files=$RuntimeFiles; core_checks=626; calendar_checks=101; conflict_checks=51; images=42; healthy=6; all_e1_complete=false; global_complete=false"
