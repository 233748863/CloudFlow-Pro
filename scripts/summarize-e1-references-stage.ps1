param([ValidatePattern('^r[1-9][0-9]*$')][string]$Round='r1',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$AdjacentRound='r176')
$ErrorActionPreference='Stop'
. 'D:\CloudFlowPro\.cloudflow-runtime\use-data-drive.ps1'
$Root='D:\CloudFlowPro'
$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
$Run=Join-Path $Root '.cloudflow-runtime/batch-g-integration/9799534e1a3a47b5958330f14ae16dc7'
$Core=Join-Path $Evidence 'e1-activity-core-20261007-r19'
$References=Join-Path $Evidence 'e1-references-20261009-r4'
$Database=Join-Path $Evidence 'e1-reminder-database-20261007-r18'
$Packages=Join-Path $Evidence 'backend-executable-verification-20261006-r17'
$Deployment=Join-Path $Evidence 'e1-reminder-deployment-20261007-r8'
$Adjacent=Join-Path $Evidence "h3-portal-finance-adjacent-20261002-$AdjacentRound"
$Output=Join-Path $Evidence "e1-references-stage-20261009-$Round.json"
$Original=$Output.Replace('.json','-original.ps1')
if((Test-Path -LiteralPath $Output) -or (Test-Path -LiteralPath $Original)){throw 'Retain original reference stage evidence'}
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
foreach($Directory in @($Core,$References,$Database,$Packages,$Deployment,$Adjacent)){
    $Manifest=Join-Path $Directory 'inputs.json'
    foreach($Entry in @(Read-Json $Manifest)){Track $Entry.Path $Entry.Hash}
    Track $Manifest
}
$CoreResult=Read-Json (Join-Path $Core 'result.json')
$ReferenceResult=Read-Json (Join-Path $References 'result.json')
Require ($CoreResult.core -and $CoreResult.mobileWorkspace -and $CoreResult.mobileDirect -and $CoreResult.desktopDeepLink -and $CoreResult.workspaceInvoices -and $CoreResult.nextActivity -and $CoreResult.businessEntries -and $CoreResult.participants) 'Core coverage incomplete'
Require ($ReferenceResult.boundaries -and $ReferenceResult.search -and $ReferenceResult.capacity -and $ReferenceResult.ui -and $ReferenceResult.sourceFixtures.Count -eq 15) 'Reference coverage incomplete'
foreach($Actual in @(
    @{Directory=$Core;Result=$CoreResult;Checks=626;Requests=223;UiRequests=1189;Images=31;BrowserFailures=2},
    @{Directory=$References;Result=$ReferenceResult;Checks=313;Requests=137;UiRequests=145;Images=4;BrowserFailures=0})){
    $Result=$Actual.Result;$Execution=Read-Json (Join-Path $Actual.Directory 'execution.json')
    Require ($Result.passed -and $Result.preservation -and $Result.secrets -and -not $Result.allAcceptanceComplete -and $Result.finalFailures.Count -eq 0) 'Business verification incomplete'
    Require ($Result.checks.Count -eq $Actual.Checks -and $Result.requests.Count -eq $Actual.Requests -and $Result.uiRequests.Count -eq $Actual.UiRequests) 'Actual verification count differs'
    Require ($Execution.Exit -eq 0 -and $Execution.Backend -eq 'r127' -and $Execution.Frontend -eq 'r83' -and $Execution.SourceAndRuntimeInputs -eq 11732 -and $Execution.RuntimeFiles -eq 6382 -and $Execution.InputChanges -eq 0 -and $Execution.HealthyServices -eq 6) 'Actual runtime differs'
    Require ($Result.secretScan.files -eq 60 -and $Result.secretScan.sensitiveValues -eq 10 -and $Result.secretScan.leaks -eq 0) 'Secret scan incomplete'
    foreach($Table in @('crm_activity','crm_activity_participant','crm_activity_reminder','crm_customer','crm_follow_up','crm_opportunity','crm_lead','crm_service_ticket','oa_contract','crm_contact')){Require (('original_rows_preserved_'+$Table) -in $Result.checks) 'Original business preservation absent'}
    Require ('role_grants_preserved' -in $Result.checks) 'Original permissions changed'
    $BrowserFailures=@($Result.uiRequests|Where-Object status -ge 400)
    Require ($BrowserFailures.Count -eq $Actual.BrowserFailures) 'Unexpected browser failure count'
    foreach($Failure in $BrowserFailures){Require ($Actual.Directory -eq $Core -and $Failure.status -eq 400 -and $Failure.method -eq 'GET' -and $Failure.path -match '^/api/crm/activity/[0-9]+$') 'Unexpected browser failure'}
    $Images=@(Get-ChildItem -LiteralPath $Actual.Directory -Filter '*.png' -File)
    Require ($Images.Count -eq $Actual.Images) 'Screenshots incomplete'
    foreach($File in Get-ChildItem -LiteralPath $Actual.Directory -File){Track $File.FullName}
}
$BaselineFile=Join-Path $Evidence 'e1-activity-core-20261007-r18/result.json'
$Baseline=Read-Json $BaselineFile
Require ($Baseline.passed -and $Baseline.checks.Count -eq 626) 'Previous core baseline missing'
$Counts=@{}
foreach($Label in $CoreResult.checks){$Key=$Label.Replace($CoreResult.marker,'{marker}') -replace '/[0-9]+(?=[:/])','/{id}';$Counts[$Key]++}
foreach($Label in $Baseline.checks){$Key=$Label.Replace($Baseline.marker,'{marker}') -replace '/[0-9]+(?=[:/])','/{id}';Require ($Counts[$Key] -gt 0) 'Previous core assertion omitted';$Counts[$Key]--}
Require (@($Counts.Values|Where-Object{$_ -ne 0}).Count -eq 0) 'Core assertion multiset differs'
Track $BaselineFile
Require (@($CoreResult.uiRequests|Where-Object path -eq '/api/crm/dashboard/summary').Count -eq 0) 'Unrelated dashboard requested'
foreach($Kind in @('CUSTOMER','OPPORTUNITY','LEAD','TICKET','CONTRACT')){
    foreach($Prefix in @('foreign_own_source_is_accessible_','matching_customer_derived_','matching_relation_persisted_','rejected_edit_keeps_original_relation_')){Require (($Prefix+$Kind) -in $ReferenceResult.checks) 'Valid source or preserved relation absent'}
    foreach($Prefix in @('cross_customer_create_','foreign_source_create_','reverse_tenant_create_','foreign_customer_create_','cross_customer_edit_','foreign_source_edit_')){
        foreach($Suffix in @('_rejected','_no_activity_write')){Require (($Prefix+$Kind+$Suffix) -in $ReferenceResult.checks) 'Reference refusal or write protection absent'}
    }
}
foreach($Label in @('same_tenant_private_customer_rejected','contract_choices_only_current_customer','foreign_contract_choices_denied','search_name_code_or_tag','search_admin_scope','search_tenant_isolation','search_separate_filters_still_conjoined','search_pagination_complete','search_real_page_exact_scope','search_real_page_one_keyword','ui_name_create_single_error','ui_name_edit_single_error','ui_name_create_draft_retained','ui_name_edit_draft_retained','ui_name_corrected_persisted','ui_name_edit_original_preserved','name_conversion_corrected_name_complete','name_conversion_source_linked_once','name_conversion_contact_created_once','owned_activities_removed')){Require ($Label -in $ReferenceResult.checks) 'Search, capacity or cleanup acceptance absent'}
foreach($Kind in @('ascii','chinese','supplementary')){
    foreach($Prefix in @('name_reread_','name_edit_exact_capacity_','name_create_over_limit_rejected_','name_edit_over_limit_rejected_','name_create_rejection_preserves_rows_','name_edit_rejection_preserves_rows_','name_conversion_over_limit_rejected_','name_conversion_rejection_preserves_rows_')){Require (($Prefix+$Kind) -in $ReferenceResult.checks) 'Character boundary coverage absent'}
}
$CurrentOriginals=(Originals $Core 10 $true)+(Originals $References 10 $true)+(Originals $Database 45 $true)+(Originals $Deployment 4 $true)
Track (Join-Path $Packages 'original.ps1') (File-Hash (Join-Path $Root 'scripts/verify-backend-executable-packages.ps1'))
$CurrentOriginals++
Require ($CurrentOriginals -eq 70) 'Current execution original count differs'
$DatabaseResult=Read-Json (Join-Path $Database 'result.json')
$DatabaseLog=Get-Content -LiteralPath (Join-Path $Database 'checks.log') -Raw
Require ($DatabaseResult.Passed -and $DatabaseResult.Backend -eq 'r127' -and $DatabaseResult.Inputs -eq 5326 -and $DatabaseResult.InputChanges -eq 0 -and $DatabaseResult.TemporaryDatabaseRemoved -and -not $DatabaseResult.ProductionModified) 'Database verification incomplete'
Require ($DatabaseLog.Contains('PASS: 15777 CRM boundary assertions') -and $DatabaseLog.Contains('Temporary data removed; logs retained')) 'Database completion absent'
foreach($Name in @('result.json','checks.log')){Track (Join-Path $Database $Name)}
$HistoricalOriginals=0
foreach($Failure in @(
    @{Round='r1';Checks=40;Requests=15;UiRequests=0;Originals=8;Preserved=$true;Boundary=$false;FinalFailures=0},
    @{Round='r2';Checks=224;Requests=105;UiRequests=0;Originals=8;Preserved=$false;Boundary=$true;FinalFailures=3},
    @{Round='r3';Checks=267;Requests=121;UiRequests=88;Originals=9;Preserved=$true;Boundary=$true;FinalFailures=0})){
    $Directory=Join-Path $Evidence "e1-references-20261009-$($Failure.Round)"
    $Result=Read-Json (Join-Path $Directory 'result.json');$Execution=Read-Json (Join-Path $Directory 'execution.json')
    Require (-not $Result.passed -and $Result.preservation -eq $Failure.Preserved -and $Result.boundaries -eq $Failure.Boundary -and $Result.secrets -and $Result.finalFailures.Count -eq $Failure.FinalFailures) 'Historical failure boundary changed'
    Require ($Result.checks.Count -eq $Failure.Checks -and $Result.requests.Count -eq $Failure.Requests -and $Result.uiRequests.Count -eq $Failure.UiRequests) 'Historical failure counts differ'
    Require ($Execution.Exit -eq 1 -and $Execution.InputChanges -eq 0 -and $Execution.HealthyServices -eq 6 -and $Result.secretScan.leaks -eq 0) 'Failed execution integrity absent'
    foreach($File in Get-ChildItem -LiteralPath $Directory -File){Track $File.FullName}
    $HistoricalOriginals+=Originals $Directory $Failure.Originals $false
}
$Recovery=Join-Path $Evidence 'e1-references-recovery-20261009-r1'
$RecoveryResult=Read-Json (Join-Path $Recovery 'result.json');$RecoveryExecution=Read-Json (Join-Path $Recovery 'execution.json')
Require ($RecoveryResult.passed -and $RecoveryResult.recovered -and $RecoveryResult.preservation -and $RecoveryResult.secrets -and $RecoveryResult.checks.Count -eq 27 -and $RecoveryResult.requests.Count -eq 3 -and $RecoveryResult.finalFailures.Count -eq 0) 'Failed-round recovery incomplete'
Require ($RecoveryExecution.Exit -eq 0 -and $RecoveryExecution.InputChanges -eq 0 -and $RecoveryExecution.HealthyServices -eq 6 -and $RecoveryResult.secretScan.leaks -eq 0) 'Recovery execution integrity absent'
foreach($Customer in @(9049,9050,9051)){Require (('recovery_customer_removed_'+$Customer) -in $RecoveryResult.checks) 'Original failed cleanup unresolved'}
Require ('recovery_failed_evidence_preserved' -in $RecoveryResult.checks) 'Failed evidence changed during recovery'
foreach($File in Get-ChildItem -LiteralPath $Recovery -File){Track $File.FullName}
$HistoricalOriginals+=Originals $Recovery 9 $false
Require ($HistoricalOriginals -eq 34) 'Historical execution original count differs'
$PackageResult=Read-Json (Join-Path $Packages 'result.json');$DeploymentResult=Read-Json (Join-Path $Deployment 'result.json')
Require ($PackageResult.Passed -and $PackageResult.BackendRound -eq 'r127' -and $PackageResult.InputChanges -eq 0 -and $PackageResult.Services.Count -eq 6) 'Current packages incomplete'
Require ($DeploymentResult.Passed -and $DeploymentResult.Backend -eq 'r127' -and $DeploymentResult.PackageRound -eq 'r17' -and $DeploymentResult.Inputs -eq 3843 -and $DeploymentResult.RuntimeFiles -eq 6382 -and $DeploymentResult.InputChanges -eq 0 -and $DeploymentResult.Services.Count -eq 6) 'Current deployment incomplete'
foreach($Package in $PackageResult.Services){
    Track $Package.Path $Package.Hash
    $Match=@($DeploymentResult.Services|Where-Object Service -eq $Package.Name)
    Require ($Match.Count -eq 1 -and $Match[0].Exit -eq 0 -and $Match[0].PackageHash -eq $Package.Hash) 'Deployed package differs'
}
foreach($Directory in @($Packages,$Deployment)){Track (Join-Path $Directory 'result.json')}
$Changes=@{}
foreach($Build in @(
    @{Module='backend';Before='r125';After='r127';Count=3839;Allowed=@('cloudflow-backend/cloudflow-service-crm/src/main/java/com/cloudflow/crm/controller/CrmCustomerController.java','cloudflow-backend/cloudflow-service-crm/src/main/java/com/cloudflow/crm/controller/CrmLeadController.java','cloudflow-backend/cloudflow-service-crm/src/main/java/com/cloudflow/crm/domain/CrmCustomer.java','cloudflow-backend/cloudflow-service-crm/src/main/java/com/cloudflow/crm/service/impl/CrmCustomerServiceImpl.java','cloudflow-backend/cloudflow-service-crm/src/main/resources/mapper/CrmCustomerMapper.xml')},
    @{Module='frontend';Before='r82';After='r83';Count=1483;Allowed=@('cloudflow-frontend/src/components/crm/management/store.tsx','cloudflow-frontend/src/services/api/crm/customer.ts')})){
    $BeforeFile=Join-Path $Evidence "h3-portal-finance-20261002-$($Build.Module)-$($Build.Before)-inputs.json"
    $AfterFile=Join-Path $Evidence "h3-portal-finance-20261002-$($Build.Module)-$($Build.After)-inputs.json"
    $Before=@{};foreach($Entry in @(Read-Json $BeforeFile)){$Before[$Entry.Path.Replace('\','/')]=$Entry.Hash}
    $After=@(Read-Json $AfterFile);Require ($Before.Count -eq $Build.Count -and $After.Count -eq $Build.Count) 'Build input count differs'
    $Changed=@();foreach($Entry in $After){$Key=$Entry.Path.Replace('\','/');Track $Entry.Path $Entry.Hash;if($Before[$Key] -ne $Entry.Hash){$Changed+=$Key}}
    Require ($Changed.Count -eq $Build.Allowed.Count -and @($Changed|Where-Object{$_ -notin $Build.Allowed}).Count -eq 0) 'Unexpected product change'
    $Changes[$Build.Module]=$Changed
    Track $BeforeFile;Track $AfterFile
    $Log=Join-Path $Evidence "h3-portal-finance-20261002-$($Build.Module)-$($Build.After).log"
    Require ((Get-Content -LiteralPath $Log -Raw).Contains("files=$($Build.Count); changed=0; exit=0")) 'Verified build completion absent'
    Track $Log
}
foreach($Login in @(
    @{Name='e1-references-allowance-20261009-r1';Before=1599;After=1604},
    @{Name='e1-references-allowance-20261009-r2';Before=1604;After=1609},
    @{Name='e1-references-recovery-allowance-20261009-r1';Before=1609;After=1614},
    @{Name='e1-references-allowance-20261009-r3';Before=1614;After=1619},
    @{Name='e1-references-allowance-20261009-r4';Before=1619;After=1624},
    @{Name='e1-references-core-20261009-r19';Before=1624;After=1629})){
    $Log=Join-Path $Evidence ($Login.Name+'.log')
    Require ((Get-Content -LiteralPath $Log -Raw).Contains("original_limit=100; original_ttl=-1; counter_before=$($Login.Before); counter_after=$($Login.After); counter_writes=0; database_unchanged=true; production_modified=false")) 'Captcha configuration restoration absent'
    Track $Log;Track ($Log.Replace('.log','.err'))
}
$PreviousStage=Join-Path $Evidence 'e1-departments-stage-20261008-r1.json'
Require ((Read-Json $PreviousStage).Passed) 'Previous department stage absent'
Track $PreviousStage
$Review=Join-Path $Evidence 'e1-references-image-review-20261009-r1'
$ReviewManifest=@(Read-Json (Join-Path $Review 'manifest.json'))
Require ($ReviewManifest.Count -eq 31 -and @($ReviewManifest.source|Sort-Object -Unique).Count -eq 31) 'Core image review coverage incomplete'
foreach($Entry in $ReviewManifest){Track $Entry.source $Entry.sha256;Track (Join-Path $Review $Entry.sheet)}
foreach($File in Get-ChildItem -LiteralPath $Review -File){Track $File.FullName}
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
Require ($RuntimeFiles -eq 6382) 'Runtime file count differs'
Track $PSCommandPath;Track $Original (File-Hash $PSCommandPath)
foreach($File in $Inputs.Keys){Require ((File-Hash $File) -eq $Inputs[$File]) 'Stage input changed'}
$Inputs.Keys|Sort-Object|ForEach-Object{[pscustomobject]@{Path=$_;Hash=$Inputs[$_]}}|ConvertTo-Json|Set-Content -LiteralPath $Output.Replace('.json','-inputs.json') -Encoding utf8NoBOM
[pscustomobject]@{Passed=$true;Backend='r127';Frontend='r83';CurrentInputs=$Inputs.Count;RuntimeFiles=$RuntimeFiles;ReferenceChecks=313;ReferenceRequests=137;ReferenceUiRequests=145;CoreChecks=626;CoreRequests=223;CoreUiRequests=1189;PreviousCoreChecksRetained=626;DatabaseChecks=15777;CurrentExecutionOriginals=$CurrentOriginals;HistoricalExecutionOriginals=$HistoricalOriginals;Images=35;HealthyServices=6;Adjacent=$AdjacentRound;ProductChanges=$Changes;CaptchaRestored=$true;ReferenceAcceptanceComplete=$true;CustomerSearchComplete=$true;CustomerNameCapacityComplete=$true;HistoricalDepartmentCalendarConflictEvidenceRetained=$true;AllE1AcceptanceComplete=$false;GlobalComplete=$false}|ConvertTo-Json -Depth 5|Set-Content -LiteralPath $Output -Encoding utf8NoBOM
"E1_REFERENCES_STAGE: inputs=$($Inputs.Count); runtime_files=$RuntimeFiles; reference_checks=313; core_checks=626; images=35; healthy=6; all_e1_complete=false; global_complete=false"
