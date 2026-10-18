param([ValidatePattern('^r[1-9][0-9]*$')][string]$Round='r1',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$AdjacentRound='r177')
$ErrorActionPreference='Stop'
. 'D:\CloudFlowPro\.cloudflow-runtime\use-data-drive.ps1'
$Root='D:\CloudFlowPro'
$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
$Run=Join-Path $Root '.cloudflow-runtime/batch-g-integration/9799534e1a3a47b5958330f14ae16dc7'
$Core=Join-Path $Evidence 'e1-activity-core-20261007-r20'
$Timeline=Join-Path $Evidence 'e1-timeline-20261009-r4'
$Database=Join-Path $Evidence 'e1-reminder-database-20261007-r18'
$Packages=Join-Path $Evidence 'backend-executable-verification-20261006-r17'
$Deployment=Join-Path $Evidence 'e1-reminder-deployment-20261007-r8'
$Adjacent=Join-Path $Evidence "h3-portal-finance-adjacent-20261002-$AdjacentRound"
$Output=Join-Path $Evidence "e1-timeline-stage-20261009-$Round.json"
$Original=$Output.Replace('.json','-original.ps1')
if((Test-Path -LiteralPath $Output) -or (Test-Path -LiteralPath $Original)){throw 'Retain original timeline stage evidence'}
[IO.File]::Copy($PSCommandPath,$Original,$false)
$Inputs=@{}
function Require([bool]$Value,[string]$Message){if(-not $Value){throw $Message}}
function Read-Json([string]$File){Get-Content -LiteralPath $File -Raw|ConvertFrom-Json -Depth 100}
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
foreach($Directory in @($Core,$Timeline,$Database,$Packages,$Deployment,$Adjacent)){
    $Manifest=Join-Path $Directory 'inputs.json'
    foreach($Entry in @(Read-Json $Manifest)){Track $Entry.Path $Entry.Hash}
    Track $Manifest
}
$CoreResult=Read-Json (Join-Path $Core 'result.json')
$TimelineResult=Read-Json (Join-Path $Timeline 'result.json')
Require ($CoreResult.core -and $CoreResult.mobileWorkspace -and $CoreResult.mobileDirect -and $CoreResult.desktopDeepLink -and $CoreResult.workspaceInvoices -and $CoreResult.nextActivity -and $CoreResult.businessEntries -and $CoreResult.participants) 'Core coverage incomplete'
Require ($TimelineResult.timeline -and $TimelineResult.pagination -and $TimelineResult.performance -and $TimelineResult.ui -and $TimelineResult.sourceFixtures.Count -eq 13) 'Timeline coverage incomplete'
foreach($Actual in @(
    @{Directory=$Core;Result=$CoreResult;Checks=626;Requests=223;UiRequests=1192;Images=31;Inputs=11732;BrowserFailures=2},
    @{Directory=$Timeline;Result=$TimelineResult;Checks=1646;Requests=165;UiRequests=156;Images=26;Inputs=11731;BrowserFailures=0})){
    $Result=$Actual.Result;$Execution=Read-Json (Join-Path $Actual.Directory 'execution.json')
    Require ($Result.passed -and $Result.preservation -and $Result.secrets -and -not $Result.allAcceptanceComplete -and $Result.finalFailures.Count -eq 0) 'Business verification incomplete'
    Require ($Result.checks.Count -eq $Actual.Checks -and $Result.requests.Count -eq $Actual.Requests -and $Result.uiRequests.Count -eq $Actual.UiRequests) 'Actual verification count differs'
    Require ($Execution.Exit -eq 0 -and $Execution.Backend -eq 'r127' -and $Execution.Frontend -eq 'r84' -and $Execution.SourceAndRuntimeInputs -eq $Actual.Inputs -and $Execution.RuntimeFiles -eq 6382 -and $Execution.InputChanges -eq 0 -and $Execution.HealthyServices -eq 6) 'Actual runtime differs'
    Require ($Result.secretScan.files -eq 60 -and $Result.secretScan.sensitiveValues -eq 10 -and $Result.secretScan.leaks -eq 0) 'Secret scan incomplete'
    foreach($Table in @('crm_activity','crm_activity_participant','crm_activity_reminder','crm_customer','crm_follow_up','crm_opportunity','crm_lead','crm_service_ticket','oa_contract','crm_contact')){Require (('original_rows_preserved_'+$Table) -in $Result.checks) 'Original business preservation absent'}
    $BrowserFailures=@($Result.uiRequests|Where-Object status -ge 400)
    Require ($BrowserFailures.Count -eq $Actual.BrowserFailures) 'Unexpected browser failure count'
    foreach($Failure in $BrowserFailures){Require ($Actual.Directory -eq $Core -and $Failure.status -eq 400 -and $Failure.method -eq 'GET' -and $Failure.path -match '^/api/crm/activity/[0-9]+$') 'Unexpected browser failure'}
    Require (@(Get-ChildItem -LiteralPath $Actual.Directory -Filter '*.png' -File).Count -eq $Actual.Images) 'Screenshots incomplete'
    foreach($File in Get-ChildItem -LiteralPath $Actual.Directory -File){Track $File.FullName}
}
Require ('role_grants_preserved' -in $CoreResult.checks) 'Core permissions changed'
$OriginalRows=@(Read-Json (Join-Path $Timeline 'preservation-before.json'))
Require ($OriginalRows.Count -eq 22 -and @($OriginalRows.table|Sort-Object -Unique).Count -eq 22) 'Timeline original business and permission scope differs'
foreach($Entry in $OriginalRows){Require (('original_rows_preserved_'+$Entry.table) -in $TimelineResult.checks) 'Timeline original rows changed'}
$Sources=@(Read-Json (Join-Path $Timeline 'source-fixtures.json'))
Require ($Sources.Count -eq 13) 'Timeline source scope differs'
foreach($Source in $Sources){
    Require (('timeline_calendar_complete_source_preserved_'+$Source.table+'_'+$Source.id) -in $TimelineResult.checks) 'Read-only query changed complete source rows'
    Require (('source_preserved_'+$Source.table+'_'+$Source.id) -in $TimelineResult.checks) 'Timeline source preservation absent'
}
$Refreshed=@($Sources|Where-Object workspaceRefreshAuditFields)
Require ($Refreshed.Count -eq 2) 'Workspace refresh boundary differs'
foreach($Source in $Refreshed){
    Require ($Source.table -eq 'crm_customer' -and ($Source.workspaceRefreshAuditFields -join ',') -eq 'update_by,update_time') 'Unexpected workspace exclusion'
    Require (('workspace_customer_refresh_audit_'+$Source.id) -in $TimelineResult.checks) 'Workspace refresh operator or time unverified'
}
$Expected=@(Read-Json (Join-Path $Timeline 'timeline-expected.json'))
Require ($Expected.Count -eq 41 -and @($Expected.type|Sort-Object -Unique).Count -eq 6) 'Six-source timeline or pagination scope differs'
foreach($Label in @('six_real_sources_and_three_ui_pages','calendar_team_pagination_complete','calendar_team_pagination_unique','calendar_other_tenant_owner_empty','calendar_reversed_range_rejected','timeline_foreign_customer_denied','timeline_other_employee_private_customer_denied','calendar_all_31_requests_below_200_ms','owned_activities_removed')){Require ($Label -in $TimelineResult.checks) 'Timeline or calendar acceptance absent'}
$Measurement=Read-Json (Join-Path $Timeline 'calendar-performance.json')
Require ($Measurement.passed -and $Measurement.sampleCount -eq 31 -and $Measurement.samples.Count -eq 31 -and $Measurement.limitMs -eq 200 -and $Measurement.ownActivities -eq 33 -and $Measurement.teamActivities -eq 34) 'Calendar performance scope differs'
Require ($Measurement.warmupRequests -eq 0 -and -not $Measurement.restartedServices -and -not $Measurement.firstAfterProcessStart) 'Calendar measurement boundary differs'
Require (@($Measurement.samples|Where-Object{$_.durationMs -le 0 -or $_.durationMs -ge 200 -or $_.rows -ne 33 -or $_.status -ne 200 -or $_.code -ne 200}).Count -eq 0) 'Calendar sample failed'
$Durations=@($Measurement.samples.durationMs|Sort-Object)
Require ($Measurement.firstMs -eq $Measurement.samples[0].durationMs -and $Measurement.maximumMs -eq $Durations[-1] -and $Measurement.medianMs -eq $Durations[15] -and $Measurement.p95Ms -eq $Durations[29]) 'Performance summary differs from samples'
$BaselineFile=Join-Path $Evidence 'e1-activity-core-20261007-r19/result.json'
$Baseline=Read-Json $BaselineFile
Require ($Baseline.passed -and $Baseline.checks.Count -eq 626) 'Previous core baseline missing'
$Counts=@{}
foreach($Label in $CoreResult.checks){$Key=$Label.Replace($CoreResult.marker,'{marker}') -replace '/[0-9]+(?=[:/])','/{id}';$Counts[$Key]++}
foreach($Label in $Baseline.checks){$Key=$Label.Replace($Baseline.marker,'{marker}') -replace '/[0-9]+(?=[:/])','/{id}';Require ($Counts[$Key] -gt 0) 'Previous core assertion omitted';$Counts[$Key]--}
Require (@($Counts.Values|Where-Object{$_ -ne 0}).Count -eq 0) 'Core assertion multiset differs'
Track $BaselineFile
$CurrentOriginals=(Originals $Core 10 $true)+(Originals $Timeline 9 $true)+(Originals $Database 45 $true)+(Originals $Deployment 4 $true)
Track (Join-Path $Packages 'original.ps1') (File-Hash (Join-Path $Root 'scripts/verify-backend-executable-packages.ps1'))
$CurrentOriginals++
Require ($CurrentOriginals -eq 69) 'Current execution original count differs'
$DatabaseResult=Read-Json (Join-Path $Database 'result.json')
Require ($DatabaseResult.Passed -and $DatabaseResult.Backend -eq 'r127' -and $DatabaseResult.Inputs -eq 5326 -and $DatabaseResult.InputChanges -eq 0 -and $DatabaseResult.TemporaryDatabaseRemoved -and -not $DatabaseResult.ProductionModified) 'Database verification incomplete'
$DatabaseLog=Get-Content -LiteralPath (Join-Path $Database 'checks.log') -Raw
Require ($DatabaseLog.Contains('PASS: 15777 CRM boundary assertions') -and $DatabaseLog.Contains('Temporary data removed; logs retained')) 'Database completion absent'
foreach($Name in @('result.json','checks.log')){Track (Join-Path $Database $Name)}
$FailedOriginals=0
foreach($Failure in @(
    @{Round='r1';Checks=192;Requests=84;UiRequests=0;Preserved=$true;FinalFailures=0},
    @{Round='r2';Checks=206;Requests=91;UiRequests=0;Preserved=$true;FinalFailures=0},
    @{Round='r3';Checks=1626;Requests=163;UiRequests=152;Preserved=$false;FinalFailures=2})){
    $Directory=Join-Path $Evidence "e1-timeline-20261009-$($Failure.Round)"
    $Result=Read-Json (Join-Path $Directory 'result.json');$Execution=Read-Json (Join-Path $Directory 'execution.json')
    Require (-not $Result.passed -and $Result.preservation -eq $Failure.Preserved -and $Result.secrets -and $Result.finalFailures.Count -eq $Failure.FinalFailures) 'Historical failure boundary changed'
    Require ($Result.checks.Count -eq $Failure.Checks -and $Result.requests.Count -eq $Failure.Requests -and $Result.uiRequests.Count -eq $Failure.UiRequests) 'Historical failure counts differ'
    Require ($Execution.Exit -eq 1 -and $Execution.InputChanges -eq 0 -and $Execution.HealthyServices -eq 6 -and $Result.secretScan.leaks -eq 0) 'Failed execution integrity absent'
    if($Failure.Round -eq 'r3'){Require (($Result.finalFailures -join ',') -eq 'source_preserved_crm_customer_9083,source_preserved_crm_customer_9085') 'Historical source refresh failure changed'}
    foreach($File in Get-ChildItem -LiteralPath $Directory -File){Track $File.FullName}
    $FailedOriginals+=Originals $Directory 9 $false
}
$PackageResult=Read-Json (Join-Path $Packages 'result.json');$DeploymentResult=Read-Json (Join-Path $Deployment 'result.json')
Require ($PackageResult.Passed -and $PackageResult.BackendRound -eq 'r127' -and $PackageResult.InputChanges -eq 0 -and $PackageResult.Services.Count -eq 6) 'Current packages incomplete'
Require ($DeploymentResult.Passed -and $DeploymentResult.Backend -eq 'r127' -and $DeploymentResult.PackageRound -eq 'r17' -and $DeploymentResult.RuntimeFiles -eq 6382 -and $DeploymentResult.InputChanges -eq 0 -and $DeploymentResult.Services.Count -eq 6) 'Current deployment incomplete'
foreach($Package in $PackageResult.Services){Track $Package.Path $Package.Hash;$Match=@($DeploymentResult.Services|Where-Object Service -eq $Package.Name);Require ($Match.Count -eq 1 -and $Match[0].Exit -eq 0 -and $Match[0].PackageHash -eq $Package.Hash) 'Deployed package differs'}
foreach($Directory in @($Packages,$Deployment)){Track (Join-Path $Directory 'result.json')}
$BeforeFile=Join-Path $Evidence 'h3-portal-finance-20261002-frontend-r83-inputs.json'
$AfterFile=Join-Path $Evidence 'h3-portal-finance-20261002-frontend-r84-inputs.json'
$Before=@{};foreach($Entry in @(Read-Json $BeforeFile)){$Before[$Entry.Path.Replace('\','/')]=$Entry.Hash}
$After=@(Read-Json $AfterFile);Require ($Before.Count -eq 1483 -and $After.Count -eq 1483) 'Frontend input count differs'
$Changed=@();foreach($Entry in $After){$Key=$Entry.Path.Replace('\','/');Track $Entry.Path $Entry.Hash;if($Before[$Key] -ne $Entry.Hash){$Changed+=$Key}}
Require ($Changed.Count -eq 1 -and $Changed[0] -eq 'cloudflow-frontend/src/components/crm/operations/CustomerTimeline.tsx') 'Unexpected product change'
$Prep=Join-Path $Evidence 'e1-timeline-prep-20261009-r1';$PrepResult=Read-Json (Join-Path $Prep 'before.json')
Require ($PrepResult.Baseline -eq 'r83' -and $PrepResult.Path -eq $Changed[0] -and $PrepResult.Hash -eq $Before[$Changed[0]]) 'Product original not bound to baseline'
Track (Join-Path $Prep 'CustomerTimeline.tsx') $PrepResult.Hash;Track (Join-Path $Prep 'before.json');Track $BeforeFile;Track $AfterFile
$BuildLog=Join-Path $Evidence 'h3-portal-finance-20261002-frontend-r84.log'
Require ((Get-Content -LiteralPath $BuildLog -Raw).Contains('files=1483; changed=0; exit=0')) 'Frontend build incomplete';Track $BuildLog
foreach($Login in @(
    @{Name='e1-timeline-r1-20261009';Before=1629;After=1634},@{Name='e1-timeline-r2-20261009';Before=1634;After=1639},
    @{Name='e1-timeline-r3-20261009';Before=1639;After=1644},@{Name='e1-timeline-r4-20261009';Before=1644;After=1649},
    @{Name='e1-activity-core-r20-20261009';Before=1649;After=1654})){
    $Log=Join-Path $Evidence ($Login.Name+'.log')
    Require ((Get-Content -LiteralPath $Log -Raw).Contains("original_limit=100; original_ttl=-1; counter_before=$($Login.Before); counter_after=$($Login.After); counter_writes=0; database_unchanged=true; production_modified=false")) 'Captcha configuration restoration absent'
    Track $Log;Track ($Log.Replace('.log','.err'))
}
$ImageCount=0
foreach($Review in @(@{Name='e1-timeline-image-review-20261009-r2';Count=26},@{Name='e1-timeline-core-image-review-20261009-r1';Count=31},@{Name='e1-timeline-image-review-20261009-r1';Count=26})){
    $Directory=Join-Path $Evidence $Review.Name;$Manifest=@(Read-Json (Join-Path $Directory 'manifest.json'));$Paths=@()
    foreach($Sheet in $Manifest){Track (Join-Path $Directory $Sheet.sheet);foreach($Entry in $Sheet.images){Track (Join-Path $Evidence $Entry.path) $Entry.sha256;$Paths+=$Entry.path}}
    Require ($Paths.Count -eq $Review.Count -and @($Paths|Sort-Object -Unique).Count -eq $Review.Count) 'Image review coverage incomplete'
    Track (Join-Path $Directory 'manifest.json');$ImageCount+=$Paths.Count
}
$PreviousStage=Join-Path $Evidence 'e1-references-stage-20261009-r1.json';Require ((Read-Json $PreviousStage).Passed) 'Previous reference stage absent';Track $PreviousStage
Require ((Get-Content -LiteralPath (Join-Path $Adjacent 'summary.log') -Raw).Contains('changed=0; exit=0; production_modified=false')) 'Adjacent verification incomplete'
$OaLog=Get-Content -LiteralPath (Join-Path $Adjacent 'oa-database.log') -Raw
Require ($OaLog.Contains('Complete approved schema table count; expected=374; actual=374') -and $OaLog.Contains('PASS: 1012 OA boundary assertions')) 'Adjacent database verification incomplete'
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
    Require ($Package.Count -eq 1 -and $Layer -eq (Join-Path $Run ("$($Service.name)/artifacts/"+$Package[0].Hash.ToLowerInvariant()+'-layered'))) 'Runtime package differs'
    foreach($File in Get-ChildItem -LiteralPath $Layer -File -Recurse){Require ($Inputs.ContainsKey($File.FullName)) 'Runtime file untracked';$RuntimeFiles++}
    Require ((Invoke-RestMethod "http://127.0.0.1:$($Service.healthPort)/actuator/health" -TimeoutSec 15).status -eq 'UP') 'Service unhealthy'
}
Require ($RuntimeFiles -eq 6382 -and $ImageCount -eq 83 -and $FailedOriginals -eq 27) 'Stage evidence scope differs'
Track $PSCommandPath;Track $Original (File-Hash $PSCommandPath)
foreach($File in $Inputs.Keys){Require ((File-Hash $File) -eq $Inputs[$File]) 'Stage input changed'}
$Inputs.Keys|Sort-Object|ForEach-Object{[pscustomobject]@{Path=$_;Hash=$Inputs[$_]}}|ConvertTo-Json|Set-Content -LiteralPath $Output.Replace('.json','-inputs.json') -Encoding utf8NoBOM
[pscustomobject]@{Passed=$true;Backend='r127';Frontend='r84';CurrentInputs=$Inputs.Count;RuntimeFiles=$RuntimeFiles;TimelineChecks=1646;TimelineRequests=165;TimelineUiRequests=156;CoreChecks=626;CoreRequests=223;CoreUiRequests=1192;PreviousCoreChecksRetained=626;DatabaseChecks=15777;CurrentExecutionOriginals=$CurrentOriginals;FailedExecutionOriginals=$FailedOriginals;Images=57;FailedImages=26;HealthyServices=6;Adjacent=$AdjacentRound;ProductChanges=$Changed;CaptchaRestored=$true;TimelineAcceptanceComplete=$true;CalendarPerformanceMet=$true;CalendarFirstMs=$Measurement.firstMs;CalendarP95Ms=$Measurement.p95Ms;CalendarMaximumMs=$Measurement.maximumMs;CalendarFirstAfterProcessStart=$false;HistoricalReferenceDepartmentCalendarConflictEvidenceRetained=$true;AllE1AcceptanceComplete=$false;GlobalComplete=$false}|ConvertTo-Json -Depth 5|Set-Content -LiteralPath $Output -Encoding utf8NoBOM
"E1_TIMELINE_STAGE: inputs=$($Inputs.Count); runtime_files=$RuntimeFiles; timeline_checks=1646; core_checks=626; images=57; healthy=6; all_e1_complete=false; global_complete=false"
