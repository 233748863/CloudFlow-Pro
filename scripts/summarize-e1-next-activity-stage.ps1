param([ValidatePattern('^r[1-9][0-9]*$')][string]$Round='r1',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$AdjacentRound='r169')
$ErrorActionPreference='Stop'
. 'D:\CloudFlowPro\.cloudflow-runtime\use-data-drive.ps1'
$Root='D:\CloudFlowPro'
$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
$Run=Join-Path $Root '.cloudflow-runtime/batch-g-integration/9799534e1a3a47b5958330f14ae16dc7'
$Core=Join-Path $Evidence 'e1-activity-core-20261007-r9'
$Database=Join-Path $Evidence 'e1-reminder-database-20261007-r4'
$Packages=Join-Path $Evidence 'backend-executable-verification-20261006-r11'
$Deployment=Join-Path $Evidence 'e1-reminder-deployment-20261007-r2'
$Adjacent=Join-Path $Evidence "h3-portal-finance-adjacent-20261002-$AdjacentRound"
$Output=Join-Path $Evidence "e1-next-activity-stage-20261007-$Round.json"
if(Test-Path -LiteralPath $Output){throw 'Retain original next activity stage evidence'}
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
Require ($C.passed -and $C.core -and $C.mobileWorkspace -and $C.mobileDirect -and $C.desktopDeepLink -and $C.workspaceInvoices -and $C.nextActivity -and $C.preservation -and $C.secrets -and -not $C.allAcceptanceComplete) 'Current core and next activity checks incomplete'
Require ($C.checks.Count -eq 326 -and $C.requests.Count -eq 134 -and $C.uiRequests.Count -eq 336) 'Current execution count differs'
Require ($Execution.Exit -eq 0 -and $Execution.Backend -eq 'r120' -and $Execution.Frontend -eq 'r80' -and $Execution.SourceAndRuntimeInputs -eq 11728 -and $Execution.RuntimeFiles -eq 6382 -and $Execution.InputChanges -eq 0 -and $Execution.HealthyServices -eq 6) 'Runtime execution differs'
Require ($C.secretScan.files -eq 53 -and $C.secretScan.sensitiveValues -eq 10 -and $C.secretScan.leaks -eq 0) 'Secret scan incomplete'
foreach($Case in @('short','boundary','long','empty','custom','cleared')){
    foreach($Layer in @('api','ui')){foreach($Boundary in @('content','inheritance','persisted','source_retained')){Require ("next_${Layer}_${Case}_$Boundary" -in $C.checks) 'Next activity persistence boundary absent'}}
    foreach($Boundary in @('fresh_read','defaults','business','owner_visible','mail_label','saved','submitted_owner')){Require ("next_ui_${Case}_$Boundary" -in $C.checks) 'Next activity UI boundary absent'}
    if($Case -ne 'short'){Require ("next_ui_${Case}_owner_locked" -in $C.checks) 'Owner restriction absent'}
}
foreach($Label in @('next_denied_sales','next_denied_foreign','next_denied_employee','next_denied_creates_no_rows','next_ui_participant_button_absent','next_ui_participant_can_read','next_ui_no_unexpected_http_failure')){Require ($Label -in $C.checks) 'Next activity permission boundary absent'}
$UiFailures=@($C.uiRequests|Where-Object status -ge 400)
Require ($UiFailures.Count -eq 2 -and @($UiFailures|Where-Object{$_.status -eq 400 -and $_.method -eq 'GET' -and $_.path -match '^/api/crm/activity/[0-9]+$'}).Count -eq 2) 'Unexpected browser request failure'
$BaselinePath=Join-Path $Evidence 'e1-activity-core-20261007-r7/result.json'
$Baseline=Read-Json $BaselinePath
Require ($Baseline.passed -and $Baseline.checks.Count -eq 162) 'Previous core baseline unavailable'
$Counts=@{}
foreach($Label in $C.checks){$Key=$Label -replace '/[0-9]+(?=[:/])','/{id}';$Counts[$Key]++}
foreach($Label in $Baseline.checks){$Key=$Label -replace '/[0-9]+(?=[:/])','/{id}';Require ($Counts[$Key] -gt 0) 'Previous core assertion omitted';$Counts[$Key]--}
Track $BaselinePath
$OriginalFiles=0
foreach($Item in @(@{Directory=$Core;Count=8},@{Directory=$Database;Count=41},@{Directory=$Deployment;Count=4})){
    $Base=Join-Path $Item.Directory 'originals'
    $Files=@(Get-ChildItem -LiteralPath $Base -Recurse -File)
    Require ($Files.Count -eq $Item.Count) 'Execution originals incomplete'
    foreach($File in $Files){Track $File.FullName (Get-FileHash -LiteralPath (Join-Path $Root ([IO.Path]::GetRelativePath($Base,$File.FullName)))).Hash;$OriginalFiles++}
}
Track (Join-Path $Packages 'original.ps1') (Get-FileHash -LiteralPath (Join-Path $Root 'scripts/verify-backend-executable-packages.ps1')).Hash
$OriginalFiles++
$Failed=Join-Path $Evidence 'e1-activity-core-20261007-r8'
$FailedResult=Read-Json (Join-Path $Failed 'result.json')
$FailedExecution=Read-Json (Join-Path $Failed 'execution.json')
Require (-not $FailedResult.passed -and $FailedResult.checks.Count -eq 234 -and $FailedResult.requests.Count -eq 116 -and $FailedResult.failure.Contains('locator.inputValue') -and $FailedResult.preservation -and $FailedResult.secrets -and $FailedExecution.Exit -eq 1 -and $FailedExecution.InputChanges -eq 0) 'Retained UI locator failure differs'
$Saved=@{}
foreach($Entry in @(Read-Json (Join-Path $Failed 'inputs.json'))){$Saved[(Full-Path $Entry.Path)]=$Entry.Hash}
$FailedOriginals=@(Get-ChildItem -LiteralPath (Join-Path $Failed 'originals') -File -Recurse)
Require ($FailedOriginals.Count -eq 8) 'Failed execution originals incomplete'
foreach($File in $FailedOriginals){$Source=Full-Path ([IO.Path]::GetRelativePath((Join-Path $Failed 'originals'),$File.FullName));Require ($Saved.ContainsKey($Source)) 'Failed original untracked';Track $File.FullName $Saved[$Source]}
foreach($Directory in @($Core,$Failed)){foreach($Name in @('inputs.json','result.json','execution.json','live.log')){Track (Join-Path $Directory $Name)}}
$Images=@('workspace-320-complete-name.png','workspace-390-complete-name.png','mobile-workspace-completed.png','mobile-direct-entry.png','mobile-320-direct-completed.png','mobile-320-list.png','desktop-direct-entry.png','workspace-authorized-invoice-choices.png','next-short-draft.png','next-long-draft.png','next-custom-draft.png','next-cleared-draft.png','next-participant-read-only.png')
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
$Allowed=@('cloudflow-backend/cloudflow-service-crm/src/main/java/com/cloudflow/crm/service/impl/CrmActivityService.java','cloudflow-backend/DB/06.cloudflow-business-seed.sql','cloudflow-frontend/src/components/crm/operations/ActivityEditor.tsx','cloudflow-frontend/src/pages/CrmActivityPage.tsx')
$Changed=@()
foreach($Build in @(@{Module='backend';Previous='r119';Current='r120';Marker='Backend; files=3839'},@{Module='frontend';Previous='r79';Current='r80';Marker='Frontend; files=1481'})){
    $OldFile=Join-Path $Evidence "h3-portal-finance-20261002-$($Build.Module)-$($Build.Previous)-inputs.json"
    $NewFile=Join-Path $Evidence "h3-portal-finance-20261002-$($Build.Module)-$($Build.Current)-inputs.json"
    $Old=@{}
    foreach($Entry in @(Read-Json $OldFile)){$Old[$Entry.Path.Replace('\','/')]=$Entry.Hash}
    $New=@(Read-Json $NewFile);Require ($New.Count -eq $Old.Count) 'Unexpected product file count change'
    foreach($Entry in $New){$Key=$Entry.Path.Replace('\','/');Require ($Old.ContainsKey($Key)) 'Unexpected new product input';Track $Entry.Path $Entry.Hash;if($Old[$Key] -ne $Entry.Hash){$Changed+=$Key}}
    Track $OldFile;Track $NewFile
    $Log=Join-Path $Evidence "h3-portal-finance-20261002-$($Build.Module)-$($Build.Current).log"
    Require ((Get-Content -LiteralPath $Log -Raw).Contains("FINANCE_BUILD: phase=$($Build.Marker); changed=0; exit=0")) 'Build incomplete';Track $Log
}
Require ($Changed.Count -eq 4 -and @($Changed|Where-Object{$_ -notin $Allowed}).Count -eq 0) 'Unexpected product changes'
foreach($Entry in @(@{Round='r8';Before=1487;After=1492},@{Round='r9';Before=1492;After=1497})){
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
[pscustomobject]@{Passed=$true;Backend='r120';Frontend='r80';CurrentInputs=$Inputs.Count;RuntimeFiles=$RuntimeFiles;Checks=326;Requests=134;UiRequests=336;DatabaseChecks=15569;NewDatabaseChecks=17;CurrentExecutionOriginals=$OriginalFiles;FailedExecutionOriginals=8;Images=13;HealthyServices=6;Adjacent=$AdjacentRound;ProductChanges=$Changed;CaptchaRestored=$true;NextActivityActualCheckComplete=$true;AllE1AcceptanceComplete=$false;GlobalComplete=$false}|ConvertTo-Json -Depth 5|Set-Content -LiteralPath $Output -Encoding utf8NoBOM
"E1_NEXT_ACTIVITY_STAGE: inputs=$($Inputs.Count); runtime_files=$RuntimeFiles; checks=326; requests=134; ui_requests=336; images=13; healthy=6; all_e1_complete=false; global_complete=false"
