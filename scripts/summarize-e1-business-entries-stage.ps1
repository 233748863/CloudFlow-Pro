param([ValidatePattern('^r[1-9][0-9]*$')][string]$Round='r1',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$AdjacentRound='r170')
$ErrorActionPreference='Stop'
. 'D:\CloudFlowPro\.cloudflow-runtime\use-data-drive.ps1'
$Root='D:\CloudFlowPro'
$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
$Run=Join-Path $Root '.cloudflow-runtime/batch-g-integration/9799534e1a3a47b5958330f14ae16dc7'
$Core=Join-Path $Evidence 'e1-activity-core-20261007-r12'
$Database=Join-Path $Evidence 'e1-reminder-database-20261007-r4'
$Packages=Join-Path $Evidence 'backend-executable-verification-20261006-r11'
$Deployment=Join-Path $Evidence 'e1-reminder-deployment-20261007-r2'
$Adjacent=Join-Path $Evidence "h3-portal-finance-adjacent-20261002-$AdjacentRound"
$Output=Join-Path $Evidence "e1-business-entries-stage-20261007-$Round.json"
if(Test-Path -LiteralPath $Output){throw 'Retain original business entry stage evidence'}
$Inputs=@{}
function Require([bool]$Value,[string]$Message){if(-not $Value){throw $Message}}
function Read-Json([string]$File){Get-Content -LiteralPath $File -Raw|ConvertFrom-Json}
function Full-Path([string]$File){if([IO.Path]::IsPathRooted($File)){[IO.Path]::GetFullPath($File)}else{[IO.Path]::GetFullPath((Join-Path $Root $File))}}
function Track([string]$File,[string]$Expected=''){
    $Full=Full-Path $File
    $Hash=(Get-FileHash -LiteralPath $Full).Hash
    if($Expected){Require ($Hash -eq $Expected) 'Recorded evidence changed'}
    if($Inputs.ContainsKey($Full)){Require ($Inputs[$Full] -eq $Hash) 'Conflicting evidence'}
    $Inputs[$Full]=$Hash
}
foreach($Directory in @($Core,$Database,$Packages,$Deployment,$Adjacent)){
    $File=Join-Path $Directory 'inputs.json'
    foreach($Entry in @(Read-Json $File)){Track $Entry.Path $Entry.Hash}
    Track $File
}
$C=Read-Json (Join-Path $Core 'result.json')
$Execution=Read-Json (Join-Path $Core 'execution.json')
Require ($C.passed -and $C.core -and $C.mobileWorkspace -and $C.mobileDirect -and $C.desktopDeepLink -and $C.workspaceInvoices -and $C.nextActivity -and $C.businessEntries -and $C.preservation -and $C.secrets -and -not $C.allAcceptanceComplete) 'Current core and next activity checks incomplete'
Require ($C.checks.Count -eq 503 -and $C.requests.Count -eq 183 -and $C.uiRequests.Count -eq 713 -and $C.finalFailures.Count -eq 0) 'Current execution count differs'
Require ($Execution.Exit -eq 0 -and $Execution.Backend -eq 'r120' -and $Execution.Frontend -eq 'r82' -and $Execution.SourceAndRuntimeInputs -eq 11731 -and $Execution.RuntimeFiles -eq 6382 -and $Execution.InputChanges -eq 0 -and $Execution.HealthyServices -eq 6) 'Runtime execution differs'
Require ($C.secretScan.files -eq 53 -and $C.secretScan.sensitiveValues -eq 10 -and $C.secretScan.leaks -eq 0) 'Secret scan incomplete'
foreach($Case in @('short','boundary','long','empty','custom','cleared')){
    foreach($Layer in @('api','ui')){foreach($Boundary in @('content','inheritance','persisted','source_retained')){Require ("next_${Layer}_${Case}_$Boundary" -in $C.checks) 'Next activity persistence boundary absent'}}
    foreach($Boundary in @('fresh_read','defaults','business','owner_visible','mail_label','saved','submitted_owner')){Require ("next_ui_${Case}_$Boundary" -in $C.checks) 'Next activity UI boundary absent'}
    if($Case -ne 'short'){Require ("next_ui_${Case}_owner_locked" -in $C.checks) 'Owner restriction absent'}
}
foreach($Label in @('next_denied_sales','next_denied_foreign','next_denied_employee','next_denied_creates_no_rows','next_ui_participant_button_absent','next_ui_participant_can_read','next_ui_no_unexpected_http_failure')){Require ($Label -in $C.checks) 'Next activity permission boundary absent'}
foreach($Case in @('customer','opportunity','lead','ticket','contract','contract_without_customer')){
    foreach($Boundary in @('button_enabled','type_default','object_default','object_name','current_owner_visible','saved','saved_relation','saved_current_owner','saved_no_reminder','detail_persisted','database_persisted','saved_name_retained','source_unchanged','full_source_preserved_during_write')){
        Require (('entry_'+$Case+'_'+$Boundary) -in $C.checks) 'Business entry boundary absent'
    }
    foreach($Actor in @('foreign','employee')){
        foreach($Boundary in @('read_denied','create_denied','denial_has_no_write')){
            Require (('entry_'+$Case+'_'+$Boundary+'_'+$Actor) -in $C.checks) 'Business entry denial absent'
        }
    }
    Require (('entry_final_source_preserved_'+$Case) -in $C.checks) 'Source preservation absent'
}
foreach($Label in @('entry_lead_fresh_read','entry_lead_unconverted','entry_lead_customer_default','entry_contract_customer_default','entry_contract_without_customer_customer_default','entry_lead_detail_denied_foreign','entry_lead_detail_denied_employee','entry_admin_does_not_inherit_sales_owner','business_entries_do_not_load_dashboard','business_entries_ui_only_expected_denials','browser_no_runtime_errors')){Require ($Label -in $C.checks) 'Business entry coverage incomplete'}
foreach($Table in @('crm_activity','crm_activity_participant','crm_activity_reminder','crm_customer','crm_follow_up','oa_invoice','crm_lead','crm_opportunity','crm_service_ticket','oa_contract')){Require (('original_rows_preserved_'+$Table) -in $C.checks) 'Original business preservation absent'}
Require ('role_grants_preserved' -in $C.checks) 'Original grants changed'
Require (@($C.uiRequests|Where-Object path -eq '/api/crm/dashboard/summary').Count -eq 0) 'Unrelated dashboard requested'
$UiFailures=@($C.uiRequests|Where-Object status -ge 400)
Require ($UiFailures.Count -eq 2 -and @($UiFailures|Where-Object{$_.status -eq 400 -and $_.method -eq 'GET' -and $_.path -match '^/api/crm/activity/[0-9]+$'}).Count -eq 2) 'Unexpected browser request failure'
$BaselinePath=Join-Path $Evidence 'e1-activity-core-20261007-r9/result.json'
$Baseline=Read-Json $BaselinePath
Require ($Baseline.passed -and $Baseline.checks.Count -eq 326) 'Previous core baseline unavailable'
$Counts=@{}
foreach($Label in $C.checks){$Key=$Label -replace '/[0-9]+(?=[:/])','/{id}';$Counts[$Key]++}
foreach($Label in $Baseline.checks){$Key=$Label -replace '/[0-9]+(?=[:/])','/{id}';Require ($Counts[$Key] -gt 0) 'Previous core assertion omitted';$Counts[$Key]--}
Track $BaselinePath
$OriginalFiles=0
foreach($Item in @(@{Directory=$Core;Count=9},@{Directory=$Database;Count=41},@{Directory=$Deployment;Count=4})){
    $Base=Join-Path $Item.Directory 'originals'
    $Files=@(Get-ChildItem -LiteralPath $Base -Recurse -File)
    Require ($Files.Count -eq $Item.Count) 'Execution originals incomplete'
    foreach($File in $Files){Track $File.FullName (Get-FileHash -LiteralPath (Join-Path $Root ([IO.Path]::GetRelativePath($Base,$File.FullName)))).Hash;$OriginalFiles++}
}
Track (Join-Path $Packages 'original.ps1') (Get-FileHash -LiteralPath (Join-Path $Root 'scripts/verify-backend-executable-packages.ps1')).Hash
$OriginalFiles++
$FailedOriginals=0
foreach($FailedRound in @('r10','r11')){
    $Failed=Join-Path $Evidence "e1-activity-core-20261007-$FailedRound"
    $F=Read-Json (Join-Path $Failed 'result.json');$E=Read-Json (Join-Path $Failed 'execution.json')
    Require (-not $F.passed -and $E.Exit -eq 1 -and $E.InputChanges -eq 0 -and $E.Backend -eq 'r120' -and $E.Frontend -eq 'r81') 'Failed evidence differs'
    if($FailedRound -eq 'r10'){Require ($F.checks.Count -eq 355 -and $F.requests.Count -eq 144 -and $F.failure -eq 'entry_final_source_preserved_customer' -and $F.preservation -and $F.secrets) 'R10 failure differs'}
    else{Require ($F.checks.Count -eq 493 -and $F.requests.Count -eq 183 -and $F.businessEntries -and $F.failure -eq 'original_rows_preserved_crm_customer' -and -not $F.preservation -and -not $F.secrets) 'R11 failure differs'}
    $Saved=@{};foreach($Entry in @(Read-Json (Join-Path $Failed 'inputs.json'))){$Saved[(Full-Path $Entry.Path)]=$Entry.Hash}
    $Base=Join-Path $Failed 'originals';$Files=@(Get-ChildItem -LiteralPath $Base -Recurse -File)
    Require ($Files.Count -eq 9) 'Failed originals incomplete'
    foreach($File in $Files){$Source=Full-Path ([IO.Path]::GetRelativePath($Base,$File.FullName));Require ($Saved.ContainsKey($Source)) 'Failed original untracked';Track $File.FullName $Saved[$Source];$FailedOriginals++}
    foreach($Name in @('inputs.json','result.json','execution.json','live.log')){Track (Join-Path $Failed $Name)}
}
$RetainedFile=Join-Path $Evidence 'e1-retained-secret-scan-20261007-r11.json'
$Retained=Read-Json $RetainedFile
Require ($Retained.passed -and $Retained.files -eq 53 -and $Retained.sensitiveValues -eq 10 -and $Retained.leaks -eq 0 -and $Retained.databaseAuditScanned -and $Retained.retainedRoundTokensVerified -eq 5 -and $Retained.redisWrites -eq 0 -and $Retained.databaseWrites -eq 0 -and -not $Retained.businessPassed) 'Failed supplemental scan incomplete'
Track $RetainedFile
Track (Join-Path $Evidence 'e1-retained-secret-scan-20261007-r11-launch.log')
Track 'scripts/scan-e1-retained-secrets.mjs'
foreach($Name in @('inputs.json','result.json','execution.json','live.log')){Track (Join-Path $Core $Name)}
$Images=@('workspace-320-complete-name.png','workspace-390-complete-name.png','mobile-workspace-completed.png','mobile-direct-entry.png','mobile-320-direct-completed.png','mobile-320-list.png','desktop-direct-entry.png','workspace-authorized-invoice-choices.png','next-short-draft.png','next-long-draft.png','next-custom-draft.png','next-cleared-draft.png','next-participant-read-only.png')
foreach($Case in @('customer','opportunity','lead','ticket','contract','contract_without_customer')){foreach($Kind in @('draft','saved')){$Images+="business-$Case-$Kind.png"}}
Require (@(Get-ChildItem -LiteralPath $Core -Filter '*.png' -File).Count -eq $Images.Count) 'Current screenshots incomplete'
foreach($Name in $Images){Track (Join-Path $Core $Name)}
$Db=Read-Json (Join-Path $Database 'result.json')
Require ($Db.Passed -and $Db.Backend -eq 'r120' -and $Db.InputChanges -eq 0 -and $Db.Inputs -eq 5322 -and $Db.TemporaryDatabaseRemoved -and -not $Db.ProductionModified) 'Database verification incomplete'
$DbLog=Get-Content -LiteralPath (Join-Path $Database 'checks.log') -Raw
Require ($DbLog.Contains('PASS: 15569 CRM boundary assertions') -and $DbLog.Contains('Temporary data removed; logs retained')) 'Database completion absent'
foreach($Name in @('result.json','checks.log')){Track (Join-Path $Database $Name)}
$P=Read-Json (Join-Path $Packages 'result.json')
$D=Read-Json (Join-Path $Deployment 'result.json')
Require ($P.Passed -and $P.BackendRound -eq 'r120' -and $P.InputChanges -eq 0 -and $P.Services.Count -eq 6) 'Six current packages required'
Require ($D.Passed -and $D.Backend -eq 'r120' -and $D.PackageRound -eq 'r11' -and $D.RuntimeFiles -eq 6382 -and $D.InputChanges -eq 0 -and $D.Services.Count -eq 6) 'Six current deployments required'
foreach($Package in $P.Services){Track $Package.Path $Package.Hash;$Match=@($D.Services|Where-Object Service -eq $Package.Name);Require ($Match.Count -eq 1 -and $Match[0].Exit -eq 0 -and $Match[0].PackageHash -eq $Package.Hash) 'Deployment differs from verified package'}
foreach($Directory in @($Packages,$Deployment)){Track (Join-Path $Directory 'result.json')}
$Allowed=@('src/components/crm/operations/ActivityBusinessButton.tsx','src/components/crm/operations/LeadDetailDialog.tsx','src/components/crm/operations/ActivityEditor.tsx','src/components/crm/opportunity/OpportunityDetailDialog.tsx','src/components/crm/management/dialogs/TicketDetailDialog.tsx','src/components/crm/management/store.tsx','src/pages/ContractPage.tsx','src/pages/CrmLeadPage.tsx','src/services/api/crm/lead.ts','src/services/api/crm.ts')|ForEach-Object{'cloudflow-frontend/'+$_}
$OldFile=Join-Path $Evidence 'h3-portal-finance-20261002-frontend-r80-inputs.json'
$NewFile=Join-Path $Evidence 'h3-portal-finance-20261002-frontend-r82-inputs.json'
$Old=@{};foreach($Entry in @(Read-Json $OldFile)){$Old[$Entry.Path.Replace('\','/')]=$Entry.Hash}
$New=@(Read-Json $NewFile);Require ($Old.Count -eq 1481 -and $New.Count -eq 1483) 'Frontend input count differs'
$Changed=@();foreach($Entry in $New){$Key=$Entry.Path.Replace('\','/');Track $Entry.Path $Entry.Hash;if($Old[$Key] -ne $Entry.Hash){$Changed+=$Key}}
Require ($Changed.Count -eq 10 -and @($Changed|Where-Object{$_ -notin $Allowed}).Count -eq 0) 'Unexpected product changes'
Track $OldFile;Track $NewFile
foreach($Build in @(@{Module='backend';Round='r120';Marker='Backend; files=3839'},@{Module='frontend';Round='r82';Marker='Frontend; files=1483'})){
    $Log=Join-Path $Evidence "h3-portal-finance-20261002-$($Build.Module)-$($Build.Round).log"
    Require ((Get-Content -LiteralPath $Log -Raw).Contains("FINANCE_BUILD: phase=$($Build.Marker); changed=0; exit=0")) 'Build incomplete';Track $Log
}
foreach($Entry in @(@{Round='r10';Before=1497;After=1502},@{Round='r11';Before=1502;After=1507},@{Round='r12';Before=1507;After=1512})){
    $Log=Join-Path $Evidence "e1-activity-core-20261007-$($Entry.Round)-launch.log"
    Require ((Get-Content -LiteralPath $Log -Raw).Contains("original_limit=100; original_ttl=-1; counter_before=$($Entry.Before); counter_after=$($Entry.After); counter_writes=0; database_unchanged=true; production_modified=false")) 'Captcha configuration not restored';Track $Log
}
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
[pscustomobject]@{Passed=$true;Backend='r120';Frontend='r82';CurrentInputs=$Inputs.Count;RuntimeFiles=$RuntimeFiles;Checks=503;Requests=183;UiRequests=713;UnchangedBackendDatabaseChecks=15569;CurrentExecutionOriginals=$OriginalFiles;FailedExecutionOriginals=$FailedOriginals;Images=25;HealthyServices=6;Adjacent=$AdjacentRound;ProductChanges=$Changed;CaptchaRestored=$true;BusinessEntriesActualCheckComplete=$true;AllE1AcceptanceComplete=$false;GlobalComplete=$false}|ConvertTo-Json -Depth 5|Set-Content -LiteralPath $Output -Encoding utf8NoBOM
"E1_BUSINESS_ENTRIES_STAGE: inputs=$($Inputs.Count); runtime_files=$RuntimeFiles; checks=503; requests=183; ui_requests=713; images=25; healthy=6; all_e1_complete=false; global_complete=false"
