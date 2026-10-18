param([ValidatePattern('^r[1-9][0-9]*$')][string]$Round='r1',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$AdjacentRound='r166')
$ErrorActionPreference='Stop'
. 'D:\CloudFlowPro\.cloudflow-runtime\use-data-drive.ps1'
$Root='D:\CloudFlowPro'
$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
$Run=Join-Path $Root '.cloudflow-runtime/batch-g-integration/9799534e1a3a47b5958330f14ae16dc7'
$Reminder=Join-Path $Evidence 'e1-reminder-runtime-20261007-r3'
$Mail=Join-Path $Evidence 'e1-reminder-mail-20261007-r3'
$Core=Join-Path $Evidence 'e1-activity-core-20261007-r7'
$Database=Join-Path $Evidence 'e1-reminder-database-20261007-r3'
$Deployment=Join-Path $Evidence 'e1-reminder-deployment-20261007-r1'
$Packages=Join-Path $Evidence 'backend-executable-verification-20261006-r10'
$Adjacent=Join-Path $Evidence "h3-portal-finance-adjacent-20261002-$AdjacentRound"
$Output=Join-Path $Evidence "e1-reminder-stage-20261007-$Round.json"
if(Test-Path -LiteralPath $Output){throw 'Retain original E1 reminder stage evidence'}
$Inputs=@{}
$Controlled=@{}
function Require([bool]$Value,[string]$Message){if(-not $Value){throw $Message}}
function Read-Json([string]$File){Get-Content -LiteralPath $File -Raw|ConvertFrom-Json}
function Full-Path([string]$File){if([IO.Path]::IsPathRooted($File)){[IO.Path]::GetFullPath($File)}else{[IO.Path]::GetFullPath((Join-Path $Root $File))}}
function Track([string]$File,[string]$Expected=''){
    $Full=Full-Path $File
    $Hash=(Get-FileHash -LiteralPath $Full).Hash
    if($Expected){Require ($Hash -eq $Expected) 'Recorded input changed'}
    if($Inputs.ContainsKey($Full)){Require ($Inputs[$Full] -eq $Hash) 'Conflicting current input'}
    $Inputs[$Full]=$Hash
}
function Track-Inputs([string]$Directory,[bool]$TemporaryMail=$false){
    $Changed=0
    $File=Join-Path $Directory 'inputs.json'
    foreach($Entry in @(Read-Json $File)){
        $Full=Full-Path $Entry.Path
        if($TemporaryMail -and $Controlled.ContainsKey($Full)){
            $Saved=$Controlled[$Full]
            Require ($Entry.Hash -eq $Saved.AppliedHash) 'Reminder did not use the recorded temporary configuration'
            Track $Full $Saved.OriginalHash
            $Changed++
        }else{Track $Full $Entry.Hash}
    }
    if($TemporaryMail){Require ($Changed -eq 2) 'Exactly two controlled mail inputs required'}
    Track $File
}
function Track-Originals([string]$Directory,[int]$Expected){
    $Base=Join-Path $Directory 'originals'
    $Files=@(Get-ChildItem -LiteralPath $Base -File -Recurse)
    Require ($Files.Count -eq $Expected) 'Execution original count differs'
    foreach($File in $Files){Track $File.FullName (Get-FileHash -LiteralPath (Join-Path $Root ([IO.Path]::GetRelativePath($Base,$File.FullName)))).Hash}
}
$Manifest=Read-Json (Join-Path $Mail 'manifest.json')
Require ($Manifest.Restored -and -not $Manifest.ProductionModified -and $Manifest.Files.Count -eq 2 -and $Manifest.Backend -eq 'r119' -and $Manifest.Frontend -eq 'r79') 'Mail restoration incomplete'
Require ((Full-Path $Manifest.StatePath) -eq (Join-Path $Run 'state.json')) 'Mail fixture differs'
$Allowed=@((Join-Path $Run 'auth/service.args'),(Join-Path $Run 'auth/integration.properties'))
foreach($File in $Manifest.Files){
    $Full=Full-Path $File.Path
    Require ($Full -in $Allowed -and -not $Controlled.ContainsKey($Full)) 'Unexpected temporary mail file'
    $Original=Join-Path $Mail ((Split-Path -Leaf $Full)+'.original')
    Require ((Full-Path $File.Backup) -eq $Original) 'Mail backup outside recorded fixture'
    Track $Original $File.OriginalHash
    Track (Join-Path $Mail ((Split-Path -Leaf $Full)+'.applied')) $File.AppliedHash
    Require ($File.OriginalHash -ne $File.AppliedHash) 'Temporary mail change not recorded'
    Track $Full $File.OriginalHash
    $Controlled[$Full]=$File
}
Track (Join-Path $Mail 'manifest.json')
Track (Join-Path $Mail 'run-e1-reminders.original.ps1') (Get-FileHash -LiteralPath (Join-Path $Root 'scripts/run-e1-reminders.ps1')).Hash
Track-Inputs $Reminder $true
foreach($Directory in @($Core,$Database,$Deployment,$Packages,$Adjacent)){Track-Inputs $Directory}
$ReminderExecution=Read-Json (Join-Path $Reminder 'execution.json')
$CoreExecution=Read-Json (Join-Path $Core 'execution.json')
foreach($Execution in @($ReminderExecution,$CoreExecution)){
    Require ($Execution.Exit -eq 0 -and $Execution.Backend -eq 'r119' -and $Execution.Frontend -eq 'r79' -and $Execution.InputChanges -eq 0 -and $Execution.RuntimeFiles -eq 6382 -and $Execution.HealthyServices -eq 6) 'Current runtime execution incomplete'
}
$R=Read-Json (Join-Path $Reminder 'result.json')
Require ($R.passed -and $R.dualChannels -and $R.reschedule -and $R.cancel -and $R.preservation -and $R.secrets -and -not $R.allAcceptanceComplete) 'Reminder evidence incomplete'
Require ($R.checks.Count -eq 164 -and $R.requests.Count -eq 37 -and $R.executions.Count -eq 7 -and $R.cleanupFailures.Count -eq 0) 'Reminder result count differs'
Require (@($R.executions|Where-Object status -ne 'SUCCESS').Count -eq 0 -and @($R.executions.executeNo|Sort-Object -Unique).Count -eq 7) 'Actual reminder tasks incomplete'
Require ($R.smtp.count -eq 6 -and $R.smtp.receiverCount -eq 2 -and $R.smtp.localOnly -and @($R.smtp.messageIds|Sort-Object -Unique).Count -eq 6) 'Actual local mail evidence incomplete'
Require ($R.secretScan.files -eq 53 -and $R.secretScan.sensitiveValues -eq 11 -and $R.secretScan.leaks -eq 0) 'Reminder secret check incomplete'
foreach($Label in @('only_thirty_minute_sent','zero_minute_waits','same_time_edit_retains_sent','postpone_replaces_all_reminders','postponed_remains_pending','cancel_retains_sent_only','cancelled_and_completed_never_delivered','owner_participant_deduplicated_and_declined_excluded','actual_smtp_content')){Require ($Label -in $R.checks) 'Reminder scenario absent'}
$C=Read-Json (Join-Path $Core 'result.json')
Require ($C.passed -and $C.core -and $C.mobileWorkspace -and $C.mobileDirect -and $C.desktopDeepLink -and $C.workspaceInvoices -and $C.preservation -and $C.secrets -and -not $C.allAcceptanceComplete) 'Current core regression incomplete'
Require ($C.checks.Count -eq 162 -and $C.requests.Count -eq 76 -and $C.uiRequests.Count -eq 211) 'Core result count differs'
Require ($C.secretScan.files -eq 53 -and $C.secretScan.sensitiveValues -eq 10 -and $C.secretScan.leaks -eq 0) 'Core secret check incomplete'
$UiFailures=@($C.uiRequests|Where-Object status -ge 400)
Require ($UiFailures.Count -eq 2 -and @($UiFailures|Where-Object{$_.path -match '^/api/crm/activity/[0-9]+$' -and $_.status -eq 400}).Count -eq 2) 'Unexpected UI rejection'
foreach($Directory in @($Reminder,$Core)){foreach($Name in @('result.json','execution.json','live.log')){Track (Join-Path $Directory $Name)}}
Track-Originals $Reminder 9
Track-Originals $Core 7
Track-Originals $Database 41
Track-Originals $Deployment 4
Track (Join-Path $Packages 'original.ps1') (Get-FileHash -LiteralPath (Join-Path $Root 'scripts/verify-backend-executable-packages.ps1')).Hash
$Images=@('mobile-workspace-completed.png','mobile-direct-entry.png','mobile-320-direct-completed.png','mobile-320-list.png','desktop-direct-entry.png','workspace-320-complete-name.png','workspace-390-complete-name.png','workspace-authorized-invoice-choices.png')
Require (@(Get-ChildItem -LiteralPath $Core -Filter '*.png' -File).Count -eq 8) 'Core screenshot count differs'
foreach($Name in $Images){Track (Join-Path $Core $Name)}
$Db=Read-Json (Join-Path $Database 'result.json')
Require ($Db.Passed -and $Db.Backend -eq 'r119' -and $Db.InputChanges -eq 0 -and $Db.Inputs -eq 5322 -and $Db.TemporaryDatabaseRemoved -and -not $Db.ProductionModified) 'Database verification incomplete'
$DbLog=Get-Content -LiteralPath (Join-Path $Database 'checks.log') -Raw
Require ($DbLog.Contains('PASS: 15552 CRM boundary assertions') -and $DbLog.Contains('Temporary data removed; logs retained')) 'Database result incomplete'
foreach($Name in @('result.json','checks.log')){Track (Join-Path $Database $Name)}
$PackageResult=Read-Json (Join-Path $Packages 'result.json')
$Deployed=Read-Json (Join-Path $Deployment 'result.json')
Require ($PackageResult.Passed -and $PackageResult.BackendRound -eq 'r119' -and $PackageResult.InputChanges -eq 0 -and $PackageResult.Services.Count -eq 6) 'Six current packages required'
Require ($Deployed.Passed -and $Deployed.Backend -eq 'r119' -and $Deployed.PackageRound -eq 'r10' -and $Deployed.RuntimeFiles -eq 6382 -and $Deployed.InputChanges -eq 0 -and $Deployed.Services.Count -eq 6) 'Six current deployments required'
foreach($Package in $PackageResult.Services){
    Track $Package.Path $Package.Hash
    $Match=@($Deployed.Services|Where-Object Service -eq $Package.Name)
    Require ($Match.Count -eq 1 -and $Match[0].Exit -eq 0 -and $Match[0].PackageHash -eq $Package.Hash) 'Deployment does not match package'
}
foreach($Directory in @($Packages,$Deployment)){Track (Join-Path $Directory 'result.json')}
foreach($Build in @(@{Name='backend-r119';Marker='Backend; files=3839'},@{Name='frontend-r79';Marker='Frontend; files=1481'})){
    $File=Join-Path $Evidence "h3-portal-finance-20261002-$($Build.Name).log"
    Require ((Get-Content -LiteralPath $File -Raw).Contains("FINANCE_BUILD: phase=$($Build.Marker); changed=0; exit=0")) 'Build incomplete'
    Track $File
}
foreach($Item in @(@{File=(Join-Path $Mail 'allowance.log');Before=1457;After=1462},@{File=(Join-Path $Evidence 'e1-activity-core-20261007-r7-launch.log');Before=1462;After=1467})){
    Require ((Get-Content -LiteralPath $Item.File -Raw).Contains("original_limit=100; original_ttl=-1; counter_before=$($Item.Before); counter_after=$($Item.After); counter_writes=0; database_unchanged=true; production_modified=false")) 'Captcha configuration not restored'
    Track $Item.File
}
$Summary=Get-Content -LiteralPath (Join-Path $Adjacent 'summary.log') -Raw
Require ($Summary.Contains('changed=0; exit=0; production_modified=false')) 'Adjacent checks incomplete'
$Oa=Get-Content -LiteralPath (Join-Path $Adjacent 'oa-database.log') -Raw
Require ($Oa.Contains('Complete approved schema table count; expected=374; actual=374') -and $Oa.Contains('PASS: 1012 OA boundary assertions')) 'Adjacent database checks incomplete'
Require ((Get-Content -LiteralPath (Join-Path $Adjacent 'menu.log') -Raw).Contains('EMPLOYEE_UNEXPECTED_GRANTS=0; EMPLOYEE_UNEXPECTED_WRITE_PERMISSIONS=0')) 'Menu regression incomplete'
foreach($Name in @('summary.log','oa-database.log','menu.log')){Track (Join-Path $Adjacent $Name)}
$State=Read-Json (Join-Path $Run 'state.json')
Require ($State.status -eq 'RUNNING' -and $State.processes.Count -eq 9 -and $State.services.Count -eq 6) 'Owned runtime incomplete'
foreach($Entry in $State.processes){$Observed=Get-CimInstance Win32_Process -Filter "ProcessId=$($Entry.id)";Require ($null -ne $Observed -and $Observed.CommandLine.Contains($Entry.marker)) 'Owned process identity differs'}
$RuntimeFiles=0
foreach($Service in $State.services){
    $Arguments=@(Get-Content -LiteralPath (Join-Path $Run "$($Service.name)/service.args"))
    $Index=[Array]::IndexOf($Arguments,'-cp')
    Require ($Index -ge 0 -and $Arguments[$Index+2] -eq 'org.springframework.boot.loader.launch.JarLauncher') 'Layered launch required'
    $Layer=[IO.Path]::GetFullPath($Arguments[$Index+1].Trim('"'))
    $Package=@($PackageResult.Services|Where-Object Name -eq $Service.name)
    Require ($Package.Count -eq 1 -and $Layer -eq (Join-Path $Run ("$($Service.name)/artifacts/"+$Package[0].Hash.ToLowerInvariant()+'-layered'))) 'Current layer differs from verified deployment'
    foreach($File in Get-ChildItem -LiteralPath $Layer -Recurse -File){Require ($Inputs.ContainsKey($File.FullName)) 'Untracked runtime file';$RuntimeFiles++}
    Require ((Invoke-RestMethod "http://127.0.0.1:$($Service.healthPort)/actuator/health" -TimeoutSec 15).status -eq 'UP') 'Service unhealthy'
}
Require ($RuntimeFiles -eq 6382) 'Runtime file count differs'
foreach($File in $Inputs.Keys){Require ((Get-FileHash -LiteralPath $File).Hash -eq $Inputs[$File]) 'Stage input changed'}
$Inputs.Keys|Sort-Object|ForEach-Object{[pscustomobject]@{Path=$_;Hash=$Inputs[$_]}}|ConvertTo-Json|Set-Content -LiteralPath $Output.Replace('.json','-inputs.json') -Encoding utf8NoBOM
[pscustomobject]@{Passed=$true;Backend='r119';Frontend='r79';ReminderChecks=164;ReminderRequests=37;ActualTasks=7;LocalMail=6;CoreChecks=162;CoreRequests=76;UiRequests=211;DatabaseChecks=15552;CurrentInputs=$Inputs.Count;RuntimeFiles=$RuntimeFiles;InputChanges=0;ControlledRestoredMailFiles=2;ExecutionOriginals=63;Images=8;HealthyServices=6;Adjacent=$AdjacentRound;QueuedDeliveryActualCheckComplete=$false;AllE1AcceptanceComplete=$false;GlobalComplete=$false}|ConvertTo-Json|Set-Content -LiteralPath $Output -Encoding utf8NoBOM
"E1_REMINDER_STAGE: inputs=$($Inputs.Count); runtime_files=$RuntimeFiles; reminder_checks=164; actual_tasks=7; local_mail=6; core_checks=162; healthy=6; all_e1_complete=false; global_complete=false"
