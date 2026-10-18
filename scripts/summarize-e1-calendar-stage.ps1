param([ValidatePattern('^r[1-9][0-9]*$')][string]$Round='r1',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$AdjacentRound='r173')
$ErrorActionPreference='Stop'
. 'D:\CloudFlowPro\.cloudflow-runtime\use-data-drive.ps1'
$Root='D:\CloudFlowPro'
$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
$Run=Join-Path $Root '.cloudflow-runtime/batch-g-integration/9799534e1a3a47b5958330f14ae16dc7'
$Core=Join-Path $Evidence 'e1-activity-core-20261007-r15'
$Calendar=Join-Path $Evidence 'e1-calendar-20261007-r5'
$Database=Join-Path $Evidence 'e1-reminder-database-20261007-r10'
$Packages=Join-Path $Evidence 'backend-executable-verification-20261006-r13'
$Deployment=Join-Path $Evidence 'e1-reminder-deployment-20261007-r4'
$Adjacent=Join-Path $Evidence "h3-portal-finance-adjacent-20261002-$AdjacentRound"
$Output=Join-Path $Evidence "e1-calendar-stage-20261007-$Round.json"
if(Test-Path -LiteralPath $Output){throw 'Retain original calendar stage evidence'}
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
function Original-Files([string]$Directory,[int]$Count,[bool]$Current){
    $Manifest=@{};foreach($Entry in @(Read-Json (Join-Path $Directory 'inputs.json'))){$Manifest[(Full-Path $Entry.Path)]=$Entry.Hash}
    $Base=Join-Path $Directory 'originals';$Files=@(Get-ChildItem -LiteralPath $Base -Recurse -File)
    Require ($Files.Count -eq $Count) 'Execution originals incomplete'
    foreach($File in $Files){
        $Source=Full-Path ([IO.Path]::GetRelativePath($Base,$File.FullName))
        Require ($Manifest.ContainsKey($Source)) 'Original was not an execution input'
        Track $File.FullName $Manifest[$Source]
        if($Current){Track $Source $Manifest[$Source]}
    }
    return $Files.Count
}
foreach($Directory in @($Core,$Calendar,$Database,$Packages,$Deployment,$Adjacent)){
    $File=Join-Path $Directory 'inputs.json'
    foreach($Entry in @(Read-Json $File)){
        if($Directory -eq $Adjacent -and (Full-Path $Entry.Path) -eq $PSCommandPath){
            # Adjacent business checks used the retained collector version; current collection is checked below.
            Track (Join-Path $Adjacent 'originals/scripts/summarize-e1-calendar-stage.ps1') $Entry.Hash
        }else{Track $Entry.Path $Entry.Hash}
    }
    Track $File
}
$C=Read-Json (Join-Path $Core 'result.json');$Execution=Read-Json (Join-Path $Core 'execution.json')
Require ($C.passed -and $C.core -and $C.mobileWorkspace -and $C.mobileDirect -and $C.desktopDeepLink -and $C.workspaceInvoices -and $C.nextActivity -and $C.businessEntries -and $C.participants -and $C.preservation -and $C.secrets -and -not $C.allAcceptanceComplete) 'Current business checks incomplete'
Require ($C.checks.Count -eq 626 -and $C.requests.Count -eq 223 -and $C.uiRequests.Count -eq 1209 -and $C.finalFailures.Count -eq 0) 'Current execution count differs'
Require ($Execution.Exit -eq 0 -and $Execution.Backend -eq 'r123' -and $Execution.Frontend -eq 'r82' -and $Execution.SourceAndRuntimeInputs -eq 11732 -and $Execution.RuntimeFiles -eq 6382 -and $Execution.InputChanges -eq 0 -and $Execution.HealthyServices -eq 6) 'Runtime execution differs'
Require ($C.secretScan.files -eq 53 -and $C.secretScan.sensitiveValues -eq 10 -and $C.secretScan.leaks -eq 0) 'Secret scan incomplete'
foreach($Table in @('crm_activity','crm_activity_participant','crm_activity_reminder','crm_customer','crm_follow_up','oa_invoice','crm_lead','crm_opportunity','crm_service_ticket','oa_contract','crm_contact')){Require (('original_rows_preserved_'+$Table) -in $C.checks) 'Original business preservation absent'}
Require ('role_grants_preserved' -in $C.checks) 'Original grants changed'
$UiFailures=@($C.uiRequests|Where-Object status -ge 400)
Require ($UiFailures.Count -eq 2 -and @($UiFailures|Where-Object{$_.status -eq 400 -and $_.method -eq 'GET' -and $_.path -match '^/api/crm/activity/[0-9]+$'}).Count -eq 2) 'Unexpected browser request failure'
Require (@($C.uiRequests|Where-Object path -eq '/api/crm/dashboard/summary').Count -eq 0) 'Unrelated dashboard requested'
$BaselinePath=Join-Path $Evidence 'e1-activity-core-20261007-r13/result.json';$Baseline=Read-Json $BaselinePath
Require ($Baseline.passed -and $Baseline.checks.Count -eq 626) 'Previous core baseline unavailable'
$Counts=@{};foreach($Label in $C.checks){$Key=$Label.Replace($C.marker,'{marker}') -replace '/[0-9]+(?=[:/])','/{id}';$Counts[$Key]++}
foreach($Label in $Baseline.checks){$Key=$Label.Replace($Baseline.marker,'{marker}') -replace '/[0-9]+(?=[:/])','/{id}';Require ($Counts[$Key] -gt 0) 'Previous core assertion omitted';$Counts[$Key]--}
Require (@($Counts.Values|Where-Object{$_ -ne 0}).Count -eq 0) 'Core assertion multiset differs'
Track $BaselinePath
$Cal=Read-Json (Join-Path $Calendar 'result.json');$CalExecution=Read-Json (Join-Path $Calendar 'execution.json')
Require ($Cal.passed -and $Cal.calendar -and $Cal.views -and $Cal.drag -and $Cal.rollback -and $Cal.overdue -and $Cal.preservation -and $Cal.secrets -and -not $Cal.allAcceptanceComplete) 'Calendar business checks incomplete'
Require ($Cal.checks.Count -eq 101 -and $Cal.requests.Count -eq 36 -and $Cal.uiRequests.Count -eq 120 -and $Cal.finalFailures.Count -eq 0) 'Calendar counts differ'
Require ($CalExecution.Exit -eq 0 -and $CalExecution.Backend -eq 'r123' -and $CalExecution.Frontend -eq 'r82' -and $CalExecution.SourceAndRuntimeInputs -eq 11729 -and $CalExecution.RuntimeFiles -eq 6382 -and $CalExecution.InputChanges -eq 0 -and $CalExecution.HealthyServices -eq 6) 'Calendar execution differs'
Require ($Cal.secretScan.files -eq 53 -and $Cal.secretScan.sensitiveValues -eq 10 -and $Cal.secretScan.leaks -eq 0) 'Calendar secret scan incomplete'
foreach($Label in @('month_contains_invited','month_excludes_unrelated','own_activity_draggable','readonly_event_invited','readonly_event_completed','readonly_event_cancelled','invited_dialog_readonly','week_contains_invited','week_has_seven_days','day_only_today','day_contains_invited','day_excludes_tomorrow','month_drag_saved','month_drag_one_day','month_drag_database','month_drag_reopened','stale_drag_denied','stale_drag_database_preserved','stale_drag_display_reverted','network_drag_aborted_once','network_drag_database_preserved','network_drag_display_reverted','view_TODAY_exact_membership','view_TODAY_page_membership','view_WEEK_exact_membership','view_WEEK_page_membership','foreign_calendar_excludes_other_tenant','employee_calendar_denied','calendar_owner_includes_participant','calendar_pagination_exact','overdue_includes_original_past','overdue_detects_elapsed_deadline_without_edit','overdue_current_row_marked','overdue_read_does_not_write','overdue_only_open_tasks','overdue_excludes_future_and_terminal','overdue_page_membership','only_expected_stale_ui_failure','browser_no_runtime_errors','role_grants_preserved')){Require ($Label -in $Cal.checks) 'Calendar acceptance check absent'}
foreach($Table in @('crm_activity','crm_activity_participant','crm_activity_reminder','crm_customer','crm_follow_up')){Require (('original_rows_preserved_'+$Table) -in $Cal.checks) 'Calendar original business preservation absent'}
$CalFailures=@($Cal.uiRequests|Where-Object status -ge 400)
Require ($CalFailures.Count -eq 1 -and $CalFailures[0].status -eq 400 -and $CalFailures[0].method -eq 'PUT' -and $CalFailures[0].path -eq '/api/crm/activity') 'Unexpected calendar browser failure'
foreach($Name in @('inputs.json','result.json','execution.json','live.log')){Track (Join-Path $Calendar $Name)}
$CalendarImages=@(Get-ChildItem -LiteralPath $Calendar -Filter '*.png' -File)
Require ($CalendarImages.Count -eq 9) 'Calendar screenshots incomplete'
foreach($Name in @('calendar-month.png','calendar-week.png','calendar-day.png','calendar-drag-saved.png','calendar-stale-drag-reverted.png','calendar-network-drag-reverted.png','calendar-list-today.png','calendar-list-week.png','calendar-list-overdue.png')){Require ($Name -in $CalendarImages.Name) 'Calendar screenshot absent'}
foreach($File in $CalendarImages){Track $File.FullName}
$OriginalFiles=(Original-Files $Core 10 $true)+(Original-Files $Database 43 $true)+(Original-Files $Calendar 7 $true)+(Original-Files $Deployment 4 $true)
Track (Join-Path $Packages 'original.ps1') (Get-FileHash -LiteralPath (Join-Path $Root 'scripts/verify-backend-executable-packages.ps1')).Hash
$OriginalFiles++
Require ($OriginalFiles -eq 65) 'Current execution originals incomplete'
$FailedOriginals=0
foreach($FailedRound in @('r1','r2','r3','r4')){
    $Failed=Join-Path $Evidence "e1-calendar-20261007-$FailedRound"
    $FailureExecution=Read-Json (Join-Path $Failed 'execution.json')
    Require ($FailureExecution.Exit -eq 1) 'Failed calendar round incorrectly marked successful'
    if($FailedRound -eq 'r1'){Require (-not (Test-Path -LiteralPath (Join-Path $Failed 'result.json'))) 'Pre-login failure has business result'}
    else{
        $FailureResult=Read-Json (Join-Path $Failed 'result.json')
        Require (-not $FailureResult.passed -and $FailureResult.preservation -and $FailureResult.secrets) 'Failed calendar round preservation incomplete'
        if($FailedRound -eq 'r4'){Require ((Get-Content -LiteralPath (Join-Path $Failed 'live.log') -Raw).Contains('Error: overdue_detects_elapsed_deadline_without_edit')) 'Original overdue failure absent'}
    }
    $FailedOriginals+=Original-Files $Failed 7 $false
    foreach($File in Get-ChildItem -LiteralPath $Failed -File){Track $File.FullName}
}
Require ($FailedOriginals -eq 28) 'Failed calendar originals incomplete'
foreach($Name in @('inputs.json','result.json','execution.json','live.log')){Track (Join-Path $Core $Name)}
$Images=@(Get-ChildItem -LiteralPath $Core -Filter '*.png' -File)
Require ($Images.Count -eq 31) 'Current screenshots incomplete'
foreach($Name in @('none','tentative','accepted','declined')){Require ("participants-contacts-$Name.png" -in $Images.Name) 'Contact state screenshot absent'}
foreach($Name in @('participants-stale-owner-saved.png','participants-self-replied.png')){Require ($Name -in $Images.Name) 'Participant reply screenshot absent'}
foreach($File in $Images){Track $File.FullName}
$Db=Read-Json (Join-Path $Database 'result.json');$DbLog=Get-Content -LiteralPath (Join-Path $Database 'checks.log') -Raw
Require ($Db.Passed -and $Db.Backend -eq 'r123' -and $Db.InputChanges -eq 0 -and $Db.Inputs -eq 5324 -and $Db.TemporaryDatabaseRemoved -and -not $Db.ProductionModified) 'Database verification incomplete'
Require ($DbLog.Contains('PASS: 15675 CRM boundary assertions') -and $DbLog.Contains('Temporary data removed; logs retained')) 'Database completion absent'
foreach($Name in @('result.json','checks.log')){Track (Join-Path $Database $Name)}
$P=Read-Json (Join-Path $Packages 'result.json');$D=Read-Json (Join-Path $Deployment 'result.json')
Require ($P.Passed -and $P.BackendRound -eq 'r123' -and $P.InputChanges -eq 0 -and $P.Services.Count -eq 6) 'Six current packages required'
Require ($D.Passed -and $D.Backend -eq 'r123' -and $D.PackageRound -eq 'r13' -and $D.RuntimeFiles -eq 6382 -and $D.InputChanges -eq 0 -and $D.Services.Count -eq 6) 'Six current deployments required'
foreach($Package in $P.Services){Track $Package.Path $Package.Hash;$Match=@($D.Services|Where-Object Service -eq $Package.Name);Require ($Match.Count -eq 1 -and $Match[0].Exit -eq 0 -and $Match[0].PackageHash -eq $Package.Hash) 'Deployment differs from verified package'}
foreach($Directory in @($Packages,$Deployment)){Track (Join-Path $Directory 'result.json')}
$Allowed=@('src/main/java/com/cloudflow/crm/mapper/CrmActivityMapper.java','src/main/java/com/cloudflow/crm/service/impl/CrmActivityService.java','src/main/resources/mapper/CrmActivityMapper.xml')|ForEach-Object{'cloudflow-backend/cloudflow-service-crm/'+$_}
$OldFile=Join-Path $Evidence 'h3-portal-finance-20261002-backend-r122-inputs.json';$NewFile=Join-Path $Evidence 'h3-portal-finance-20261002-backend-r123-inputs.json'
$Old=@{};foreach($Entry in @(Read-Json $OldFile)){$Old[$Entry.Path.Replace('\','/')]=$Entry.Hash}
$New=@(Read-Json $NewFile);Require ($Old.Count -eq 3839 -and $New.Count -eq 3839) 'Backend input count differs'
$Changed=@();foreach($Entry in $New){$Key=$Entry.Path.Replace('\','/');Track $Entry.Path $Entry.Hash;if($Old[$Key] -ne $Entry.Hash){$Changed+=$Key}}
Require ($Changed.Count -eq 3 -and @($Changed|Where-Object{$_ -notin $Allowed}).Count -eq 0) 'Unexpected product changes'
Track $OldFile;Track $NewFile
foreach($Build in @(@{Module='backend';Round='r123';Marker='Backend; files=3839'},@{Module='frontend';Round='r82';Marker='Frontend; files=1483'})){
    $Log=Join-Path $Evidence "h3-portal-finance-20261002-$($Build.Module)-$($Build.Round).log"
    Require ((Get-Content -LiteralPath $Log -Raw).Contains("FINANCE_BUILD: phase=$($Build.Marker); changed=0; exit=0")) 'Build incomplete';Track $Log
}
$CaptchaLog=Join-Path $Evidence 'e1-activity-core-20261007-r15-launch.log'
Require ((Get-Content -LiteralPath $CaptchaLog -Raw).Contains('original_limit=100; original_ttl=-1; counter_before=1537; counter_after=1542; counter_writes=0; database_unchanged=true; production_modified=false')) 'Captcha configuration not restored'
Track $CaptchaLog
$CalendarCaptchaLog=Join-Path $Evidence 'e1-calendar-20261007-r5-launch.log'
Require ((Get-Content -LiteralPath $CalendarCaptchaLog -Raw).Contains('original_limit=100; original_ttl=-1; counter_before=1532; counter_after=1537; counter_writes=0; database_unchanged=true; production_modified=false')) 'Calendar captcha configuration not restored'
Track $CalendarCaptchaLog
$FailedCore=Join-Path $Evidence 'e1-activity-core-20261007-r14'
Require ((Test-Path -LiteralPath $FailedCore) -and @(Get-ChildItem -LiteralPath $FailedCore -Recurse -File).Count -eq 0) 'Core startup failure created business evidence'
foreach($Name in @('e1-activity-core-20261007-r14-launch.log','e1-activity-core-20261007-r14-launch.err','e1-calendar-smtp-20261007-r1-launch.log','e1-calendar-smtp-20261007-r1-launch.err')){Track (Join-Path $Evidence $Name)}
Require ((Get-Content -LiteralPath (Join-Path $Evidence 'e1-activity-core-20261007-r14-launch.log') -Raw).Contains('counter_before=1537; counter_after=1537; counter_writes=0; database_unchanged=true; production_modified=false')) 'Startup failure captcha not restored'
Require ((Get-Content -LiteralPath (Join-Path $Evidence 'e1-calendar-smtp-20261007-r1-launch.log') -Raw).Contains('loopback=true; maximum_lifetime_seconds=14400; previous_evidence_retained=true; production_modified=false')) 'SMTP recovery evidence absent'
$FailedAdjacent=Join-Path $Evidence 'h3-portal-finance-adjacent-20261002-r172'
$FailedAdjacentLog=Get-Content -LiteralPath (Join-Path $FailedAdjacent 'oa-database.log') -Raw
Require ($FailedAdjacentLog.Contains('ERROR 2013 (HY000) at line 1058') -and $FailedAdjacentLog.Contains('Temporary data removed; logs retained')) 'Failed adjacent database evidence missing'
Require (-not (Get-Content -LiteralPath (Join-Path $FailedAdjacent 'summary.log') -Raw).Contains('changed=0; exit=0; production_modified=false')) 'Failed adjacent incorrectly marked passed'
$FailedDatabasePath=($FailedAdjacentLog -split '\r?\n'|Where-Object{$_ -like 'Isolated MySQL:*'}|Select-Object -First 1) -split '; artifacts: '
$FailedDatabase=[IO.Path]::GetFullPath($FailedDatabasePath[1])
Require ($FailedDatabase.StartsWith((Join-Path $Root 'cloudflow-backend/target')+'\',[StringComparison]::OrdinalIgnoreCase) -and -not(Test-Path -LiteralPath (Join-Path $FailedDatabase 'data'))) 'Failed database cleanup incomplete'
Track (Join-Path $FailedDatabase 'mysql-error.log')
Require ((Get-Content -LiteralPath (Join-Path $FailedDatabase 'mysql-error.log') -Raw).Contains('[MY-012639]')) 'Original disk write failure absent'
foreach($File in Get-ChildItem -LiteralPath $FailedAdjacent -Recurse -File){Track $File.FullName}
$FailedStageEntry=@(Read-Json (Join-Path $FailedAdjacent 'inputs.json')|Where-Object{$_.Path.Replace('\','/') -eq 'scripts/summarize-e1-calendar-stage.ps1'})
Require ($FailedStageEntry.Count -eq 1) 'Failed stage source was not recorded'
Track (Join-Path $FailedAdjacent 'originals/scripts/summarize-e1-calendar-stage.ps1') $FailedStageEntry[0].Hash
$Compression=Join-Path $Evidence 'retained-input-compression-20261007-r1';$Storage=Read-Json (Join-Path $Compression 'result.json')
Require ($Storage.Passed -and $Storage.Files -eq 1177 -and $Storage.ContentChanges -eq 0 -and $Storage.DeletedFiles -eq 0 -and -not $Storage.ProductModified -and -not $Storage.RunningDatabaseFilesModified -and $Storage.AfterFree -gt $Storage.BeforeFree) 'Manifest compression evidence incomplete'
foreach($Entry in @(Read-Json (Join-Path $Compression 'before.json'))){Track $Entry.Path $Entry.Hash}
foreach($File in Get-ChildItem -LiteralPath $Compression -File){Track $File.FullName}
Track 'scripts/compress-retained-input-manifests.ps1' (Get-FileHash -LiteralPath (Join-Path $Compression 'original.ps1')).Hash
foreach($Name in @('e1-calendar-stage-20261007-r1-launch.log','e1-calendar-stage-20261007-r1-launch.err','e1-calendar-stage-20261007-r1-original.ps1')){Track (Join-Path $Evidence $Name)}
Track (Join-Path $Evidence 'e1-calendar-stage-20261007-r1-original.ps1') (File-Hash (Join-Path $Adjacent 'originals/scripts/summarize-e1-calendar-stage.ps1'))
Require ((Get-Content -LiteralPath (Join-Path $Adjacent 'summary.log') -Raw).Contains('changed=0; exit=0; production_modified=false')) 'Adjacent checks incomplete'
$Oa=Get-Content -LiteralPath (Join-Path $Adjacent 'oa-database.log') -Raw
Require ($Oa.Contains('Complete approved schema table count; expected=374; actual=374') -and $Oa.Contains('PASS: 1012 OA boundary assertions')) 'Adjacent database checks incomplete'
Require ((Get-Content -LiteralPath (Join-Path $Adjacent 'menu.log') -Raw).Contains('EMPLOYEE_UNEXPECTED_GRANTS=0; EMPLOYEE_UNEXPECTED_WRITE_PERMISSIONS=0')) 'Permission regression incomplete'
foreach($Name in @('summary.log','oa-database.log','menu.log')){Track (Join-Path $Adjacent $Name)}
$State=Read-Json (Join-Path $Run 'state.json')
Require ($State.status -eq 'RUNNING' -and $State.processes.Count -eq 9 -and $State.services.Count -eq 6) 'Owned runtime incomplete'
foreach($Entry in $State.processes){$Observed=Get-CimInstance Win32_Process -Filter "ProcessId=$($Entry.id)";Require ($null -ne $Observed -and $Observed.CommandLine.Contains($Entry.marker)) 'Owned process identity differs'}
$RuntimeFiles=0
foreach($Service in $State.services){
    $Arguments=@(Get-Content -LiteralPath (Join-Path $Run "$($Service.name)/service.args"));$Index=[Array]::IndexOf($Arguments,'-cp')
    Require ($Index -ge 0 -and $Arguments[$Index+2] -eq 'org.springframework.boot.loader.launch.JarLauncher') 'Layered launch required'
    $Layer=[IO.Path]::GetFullPath($Arguments[$Index+1].Trim('"'));$Package=@($P.Services|Where-Object Name -eq $Service.name)
    Require ($Package.Count -eq 1 -and $Layer -eq (Join-Path $Run ("$($Service.name)/artifacts/"+$Package[0].Hash.ToLowerInvariant()+'-layered'))) 'Runtime differs from verified package'
    foreach($File in Get-ChildItem -LiteralPath $Layer -File -Recurse){Require ($Inputs.ContainsKey($File.FullName)) 'Untracked runtime file';$RuntimeFiles++}
    Require ((Invoke-RestMethod "http://127.0.0.1:$($Service.healthPort)/actuator/health" -TimeoutSec 15).status -eq 'UP') 'Service unhealthy'
}
Require ($RuntimeFiles -eq 6382) 'Runtime file count differs'
Track $PSCommandPath
foreach($File in $Inputs.Keys){Require ((File-Hash $File) -eq $Inputs[$File]) 'Current stage input changed'}
$Inputs.Keys|Sort-Object|ForEach-Object{[pscustomobject]@{Path=$_;Hash=$Inputs[$_]}}|ConvertTo-Json|Set-Content -LiteralPath $Output.Replace('.json','-inputs.json') -Encoding utf8NoBOM
[pscustomobject]@{Passed=$true;Backend='r123';Frontend='r82';CurrentInputs=$Inputs.Count;RuntimeFiles=$RuntimeFiles;Checks=626;Requests=223;UiRequests=1209;DatabaseChecks=15675;PreviousCoreChecksRetained=626;CurrentExecutionOriginals=$OriginalFiles;FailedCalendarOriginals=$FailedOriginals;Images=40;HealthyServices=6;Adjacent=$AdjacentRound;ProductChanges=$Changed;CaptchaRestored=$true;CalendarChecks=101;CalendarRequests=36;CalendarUiRequests=120;CalendarActualCheckComplete=$true;AllE1AcceptanceComplete=$false;GlobalComplete=$false}|ConvertTo-Json -Depth 5|Set-Content -LiteralPath $Output -Encoding utf8NoBOM
"E1_CALENDAR_STAGE: inputs=$($Inputs.Count); runtime_files=$RuntimeFiles; checks=626; requests=223; ui_requests=1209; calendar_checks=101; calendar_requests=36; calendar_ui_requests=120; images=40; healthy=6; all_e1_complete=false; global_complete=false"
