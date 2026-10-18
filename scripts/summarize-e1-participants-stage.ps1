param([ValidatePattern('^r[1-9][0-9]*$')][string]$Round='r1',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$AdjacentRound='r171')
$ErrorActionPreference='Stop'
. 'D:\CloudFlowPro\.cloudflow-runtime\use-data-drive.ps1'
$Root='D:\CloudFlowPro'
$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
$Run=Join-Path $Root '.cloudflow-runtime/batch-g-integration/9799534e1a3a47b5958330f14ae16dc7'
$Core=Join-Path $Evidence 'e1-activity-core-20261007-r13'
$Database=Join-Path $Evidence 'e1-reminder-database-20261007-r9'
$Packages=Join-Path $Evidence 'backend-executable-verification-20261006-r12'
$Deployment=Join-Path $Evidence 'e1-reminder-deployment-20261007-r3'
$Adjacent=Join-Path $Evidence "h3-portal-finance-adjacent-20261002-$AdjacentRound"
$Output=Join-Path $Evidence "e1-participants-stage-20261007-$Round.json"
if(Test-Path -LiteralPath $Output){throw 'Retain original participant stage evidence'}
$Inputs=@{}
function Require([bool]$Value,[string]$Message){if(-not $Value){throw $Message}}
function Read-Json([string]$File){Get-Content -LiteralPath $File -Raw|ConvertFrom-Json}
function Full-Path([string]$File){if([IO.Path]::IsPathRooted($File)){[IO.Path]::GetFullPath($File)}else{[IO.Path]::GetFullPath((Join-Path $Root $File))}}
function Track([string]$File,[string]$Expected=''){
    $Full=Full-Path $File;$Hash=(Get-FileHash -LiteralPath $Full).Hash
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
foreach($Directory in @($Core,$Database,$Packages,$Deployment,$Adjacent)){
    $File=Join-Path $Directory 'inputs.json'
    foreach($Entry in @(Read-Json $File)){Track $Entry.Path $Entry.Hash}
    Track $File
}
$C=Read-Json (Join-Path $Core 'result.json');$Execution=Read-Json (Join-Path $Core 'execution.json')
Require ($C.passed -and $C.core -and $C.mobileWorkspace -and $C.mobileDirect -and $C.desktopDeepLink -and $C.workspaceInvoices -and $C.nextActivity -and $C.businessEntries -and $C.participants -and $C.preservation -and $C.secrets -and -not $C.allAcceptanceComplete) 'Current business checks incomplete'
Require ($C.checks.Count -eq 626 -and $C.requests.Count -eq 223 -and $C.uiRequests.Count -eq 1209 -and $C.finalFailures.Count -eq 0) 'Current execution count differs'
Require ($Execution.Exit -eq 0 -and $Execution.Backend -eq 'r122' -and $Execution.Frontend -eq 'r82' -and $Execution.SourceAndRuntimeInputs -eq 11732 -and $Execution.RuntimeFiles -eq 6382 -and $Execution.InputChanges -eq 0 -and $Execution.HealthyServices -eq 6) 'Runtime execution differs'
Require ($C.secretScan.files -eq 53 -and $C.secretScan.sensitiveValues -eq 10 -and $C.secretScan.leaks -eq 0) 'Secret scan incomplete'
foreach($StateName in @('NONE','TENTATIVE','ACCEPTED','DECLINED')){
    foreach($Prefix in @('participants_self_','participants_stale_save_','participants_ui_external_','participants_ui_internal_unchanged_')){Require (($Prefix+$StateName) -in $C.checks) 'Participant state protection absent'}
    foreach($Type in @('CONTACT','LEAD','USER')){Require (("participants_ui_${StateName}_database_$Type") -in $C.checks) 'Participant database persistence absent'}
    foreach($Name in @('客户联系人','线索联系人')){Require (("participants_ui_reread_$($C.marker)_${Name}_$StateName") -in $C.checks) 'Contact page reread absent'}
}
foreach($StateName in @('TENTATIVE','ACCEPTED','DECLINED')){
    foreach($Prefix in @('participants_ui_self_response_','participants_ui_self_persisted_')){Require (($Prefix+$StateName) -in $C.checks) 'Self-service page reply absent'}
}
foreach($Label in @('participants_new_colleague_not_forged','participants_reply_denied_foreign','participants_reply_denied_employee','participants_removed_reply_denied','participants_removed_reply_no_write','participants_rejoined_unresponded','participants_actual_contacts','participants_ui_added_three','participants_ui_colleague_locked','participants_ui_resolved_names','participants_ui_self_cannot_save_owner_activity','participants_ui_old_form_is_stale','participants_ui_stale_keeps_reply','participants_ui_stale_keeps_edit','participants_ui_only_expected_denials','browser_no_runtime_errors')){Require ($Label -in $C.checks) 'Participant boundary absent'}
foreach($Table in @('crm_activity','crm_activity_participant','crm_activity_reminder','crm_customer','crm_follow_up','oa_invoice','crm_lead','crm_opportunity','crm_service_ticket','oa_contract','crm_contact')){Require (('original_rows_preserved_'+$Table) -in $C.checks) 'Original business preservation absent'}
Require ('role_grants_preserved' -in $C.checks) 'Original grants changed'
$UiFailures=@($C.uiRequests|Where-Object status -ge 400)
Require ($UiFailures.Count -eq 2 -and @($UiFailures|Where-Object{$_.status -eq 400 -and $_.method -eq 'GET' -and $_.path -match '^/api/crm/activity/[0-9]+$'}).Count -eq 2) 'Unexpected browser request failure'
Require (@($C.uiRequests|Where-Object path -eq '/api/crm/dashboard/summary').Count -eq 0) 'Unrelated dashboard requested'
$BaselinePath=Join-Path $Evidence 'e1-activity-core-20261007-r12/result.json';$Baseline=Read-Json $BaselinePath
Require ($Baseline.passed -and $Baseline.checks.Count -eq 503) 'Previous core baseline unavailable'
$Counts=@{};foreach($Label in $C.checks){$Key=$Label -replace '/[0-9]+(?=[:/])','/{id}';$Counts[$Key]++}
foreach($Label in $Baseline.checks){$Key=$Label -replace '/[0-9]+(?=[:/])','/{id}';Require ($Counts[$Key] -gt 0) 'Previous core assertion omitted';$Counts[$Key]--}
Track $BaselinePath
$OriginalFiles=(Original-Files $Core 10 $true)+(Original-Files $Database 42 $true)+(Original-Files $Deployment 4 $true)
Track (Join-Path $Packages 'original.ps1') (Get-FileHash -LiteralPath (Join-Path $Root 'scripts/verify-backend-executable-packages.ps1')).Hash
$OriginalFiles++
$FailedOriginals=0
$FailureMarkers=@{r5='new colleague cannot be marked accepted by organizer: expected=NONE, actual=ACCEPTED';r6='FOR UPDATE ORDER BY participant_id';r7='removed colleague is no longer active: expected=0, actual=1';r8='ERROR 1114'}
foreach($FailedRound in @('r5','r6','r7','r8')){
    $Failed=Join-Path $Evidence "e1-reminder-database-20261007-$FailedRound"
    $Text=Get-Content -LiteralPath (Join-Path $Failed 'checks.log') -Raw
    Require ($Text.Contains($FailureMarkers[$FailedRound]) -and $Text.Contains('Temporary data removed; logs retained')) 'Failed database evidence or cleanup missing'
    Require (-not (Test-Path -LiteralPath (Join-Path $Failed 'result.json'))) 'Failed database incorrectly marked successful'
    $FailedOriginals+=Original-Files $Failed 42 $false
    Track (Join-Path $Failed 'inputs.json');Track (Join-Path $Failed 'checks.log')
}
foreach($Name in @('inputs.json','result.json','execution.json','live.log')){Track (Join-Path $Core $Name)}
$Images=@(Get-ChildItem -LiteralPath $Core -Filter '*.png' -File)
Require ($Images.Count -eq 31) 'Current screenshots incomplete'
foreach($Name in @('none','tentative','accepted','declined')){Require ("participants-contacts-$Name.png" -in $Images.Name) 'Contact state screenshot absent'}
foreach($Name in @('participants-stale-owner-saved.png','participants-self-replied.png')){Require ($Name -in $Images.Name) 'Participant reply screenshot absent'}
foreach($File in $Images){Track $File.FullName}
$Db=Read-Json (Join-Path $Database 'result.json');$DbLog=Get-Content -LiteralPath (Join-Path $Database 'checks.log') -Raw
Require ($Db.Passed -and $Db.Backend -eq 'r122' -and $Db.InputChanges -eq 0 -and $Db.Inputs -eq 5323 -and $Db.TemporaryDatabaseRemoved -and -not $Db.ProductionModified) 'Database verification incomplete'
Require ($DbLog.Contains('PASS: 15643 CRM boundary assertions') -and $DbLog.Contains('Temporary data removed; logs retained')) 'Database completion absent'
foreach($Name in @('result.json','checks.log')){Track (Join-Path $Database $Name)}
$P=Read-Json (Join-Path $Packages 'result.json');$D=Read-Json (Join-Path $Deployment 'result.json')
Require ($P.Passed -and $P.BackendRound -eq 'r122' -and $P.InputChanges -eq 0 -and $P.Services.Count -eq 6) 'Six current packages required'
Require ($D.Passed -and $D.Backend -eq 'r122' -and $D.PackageRound -eq 'r12' -and $D.RuntimeFiles -eq 6382 -and $D.InputChanges -eq 0 -and $D.Services.Count -eq 6) 'Six current deployments required'
foreach($Package in $P.Services){Track $Package.Path $Package.Hash;$Match=@($D.Services|Where-Object Service -eq $Package.Name);Require ($Match.Count -eq 1 -and $Match[0].Exit -eq 0 -and $Match[0].PackageHash -eq $Package.Hash) 'Deployment differs from verified package'}
foreach($Directory in @($Packages,$Deployment)){Track (Join-Path $Directory 'result.json')}
$Allowed=@('src/main/java/com/cloudflow/crm/mapper/CrmActivityParticipantMapper.java','src/main/java/com/cloudflow/crm/service/impl/CrmActivityService.java','src/main/resources/mapper/CrmActivityParticipantMapper.xml')|ForEach-Object{'cloudflow-backend/cloudflow-service-crm/'+$_}
$OldFile=Join-Path $Evidence 'h3-portal-finance-20261002-backend-r120-inputs.json';$NewFile=Join-Path $Evidence 'h3-portal-finance-20261002-backend-r122-inputs.json'
$Old=@{};foreach($Entry in @(Read-Json $OldFile)){$Old[$Entry.Path.Replace('\','/')]=$Entry.Hash}
$New=@(Read-Json $NewFile);Require ($Old.Count -eq 3839 -and $New.Count -eq 3839) 'Backend input count differs'
$Changed=@();foreach($Entry in $New){$Key=$Entry.Path.Replace('\','/');Track $Entry.Path $Entry.Hash;if($Old[$Key] -ne $Entry.Hash){$Changed+=$Key}}
Require ($Changed.Count -eq 3 -and @($Changed|Where-Object{$_ -notin $Allowed}).Count -eq 0) 'Unexpected product changes'
Track $OldFile;Track $NewFile
foreach($Build in @(@{Module='backend';Round='r122';Marker='Backend; files=3839'},@{Module='frontend';Round='r82';Marker='Frontend; files=1483'})){
    $Log=Join-Path $Evidence "h3-portal-finance-20261002-$($Build.Module)-$($Build.Round).log"
    Require ((Get-Content -LiteralPath $Log -Raw).Contains("FINANCE_BUILD: phase=$($Build.Marker); changed=0; exit=0")) 'Build incomplete';Track $Log
}
$CaptchaLog=Join-Path $Evidence 'e1-activity-core-20261007-r13-launch.log'
Require ((Get-Content -LiteralPath $CaptchaLog -Raw).Contains('original_limit=100; original_ttl=-1; counter_before=1512; counter_after=1517; counter_writes=0; database_unchanged=true; production_modified=false')) 'Captcha configuration not restored'
Track $CaptchaLog
$Compression=Join-Path $Evidence 'stopped-evidence-compression-20261007-r1';$Storage=Read-Json (Join-Path $Compression 'result.json')
Require ($Storage.Passed -and $Storage.Runs.Count -eq 29 -and $Storage.ContentChanges -eq 0 -and $Storage.DeletedFiles -eq 0 -and -not $Storage.RunningEnvironmentsModified -and $Storage.AfterFree -gt $Storage.BeforeFree) 'Archive compression evidence incomplete'
foreach($File in Get-ChildItem -LiteralPath $Compression -File){Track $File.FullName}
Track 'scripts/compress-stopped-integration-evidence.ps1' (Get-FileHash -LiteralPath (Join-Path $Compression 'original.ps1')).Hash
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
foreach($File in $Inputs.Keys){Require ((Get-FileHash -LiteralPath $File).Hash -eq $Inputs[$File]) 'Current stage input changed'}
$Inputs.Keys|Sort-Object|ForEach-Object{[pscustomobject]@{Path=$_;Hash=$Inputs[$_]}}|ConvertTo-Json|Set-Content -LiteralPath $Output.Replace('.json','-inputs.json') -Encoding utf8NoBOM
[pscustomobject]@{Passed=$true;Backend='r122';Frontend='r82';CurrentInputs=$Inputs.Count;RuntimeFiles=$RuntimeFiles;Checks=626;Requests=223;UiRequests=1209;DatabaseChecks=15643;PreviousCoreChecksRetained=503;CurrentExecutionOriginals=$OriginalFiles;FailedDatabaseOriginals=$FailedOriginals;Images=31;HealthyServices=6;Adjacent=$AdjacentRound;ProductChanges=$Changed;CaptchaRestored=$true;ParticipantsActualCheckComplete=$true;AllE1AcceptanceComplete=$false;GlobalComplete=$false}|ConvertTo-Json -Depth 5|Set-Content -LiteralPath $Output -Encoding utf8NoBOM
"E1_PARTICIPANTS_STAGE: inputs=$($Inputs.Count); runtime_files=$RuntimeFiles; checks=626; requests=223; ui_requests=1209; images=31; healthy=6; all_e1_complete=false; global_complete=false"
