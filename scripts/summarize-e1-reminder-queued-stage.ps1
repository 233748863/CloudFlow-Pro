param([ValidatePattern('^r[1-9][0-9]*$')][string]$Round='r1',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$AdjacentRound='r167')
$ErrorActionPreference='Stop'
. 'D:\CloudFlowPro\.cloudflow-runtime\use-data-drive.ps1'
$Root='D:\CloudFlowPro'
$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
$Run=Join-Path $Root '.cloudflow-runtime/batch-g-integration/9799534e1a3a47b5958330f14ae16dc7'
$Runtime=Join-Path $Evidence 'e1-reminder-queued-runtime-20261007-r1'
$Mail=Join-Path $Evidence 'e1-reminder-queued-mail-20261007-r1'
$BaseFile=Join-Path $Evidence 'e1-reminder-stage-20261007-r1.json'
$Adjacent=Join-Path $Evidence "h3-portal-finance-adjacent-20261002-$AdjacentRound"
$Output=Join-Path $Evidence "e1-reminder-queued-stage-20261007-$Round.json"
if(Test-Path -LiteralPath $Output){throw 'Retain original queued reminder stage evidence'}
$Inputs=@{}
$Controlled=@{}
function Require([bool]$Value,[string]$Message){if(-not $Value){throw $Message}}
function Read-Json([string]$File){Get-Content -LiteralPath $File -Raw|ConvertFrom-Json}
function Full-Path([string]$File){if([IO.Path]::IsPathRooted($File)){[IO.Path]::GetFullPath($File)}else{[IO.Path]::GetFullPath((Join-Path $Root $File))}}
function Track([string]$File,[string]$Expected=''){
    $Full=Full-Path $File
    $Hash=(Get-FileHash -LiteralPath $Full).Hash
    if($Expected){Require ($Hash -eq $Expected) 'Recorded evidence changed'}
    if($Inputs.ContainsKey($Full)){Require ($Inputs[$Full] -eq $Hash) 'Conflicting current evidence'}
    $Inputs[$Full]=$Hash
}
$Base=Read-Json $BaseFile
Require ($Base.Passed -and $Base.Backend -eq 'r119' -and $Base.Frontend -eq 'r79' -and $Base.ReminderChecks -eq 164 -and $Base.CoreChecks -eq 162 -and $Base.DatabaseChecks -eq 15552 -and $Base.ExecutionOriginals -eq 63 -and $Base.CurrentInputs -eq 14620 -and -not $Base.AllE1AcceptanceComplete) 'Completed ordinary reminder stage required'
Track $BaseFile
# The three launch wrappers gained only a separate queued-mode entry after the
# completed ordinary stage. Retain their executed originals; the new execution
# below independently checks their current bytes. All product inputs stay exact.
$WrapperNames=@('scripts/run-e1-reminders.ps1','scripts/run-e1-reminder-runtime.ps1','scripts/run-e1-reminder-allowance.mjs')
$Wrappers=@($WrapperNames|ForEach-Object{Full-Path $_})
$HistoricalScripts=@()
$BaseInputs=$BaseFile.Replace('.json','-inputs.json')
foreach($Entry in @(Read-Json $BaseInputs)){
    $Full=Full-Path $Entry.Path
    if($Full -in $Wrappers){
        $Original=Join-Path $Evidence ('e1-reminder-runtime-20261007-r3/originals/'+[IO.Path]::GetRelativePath($Root,$Full))
        Track $Original $Entry.Hash
        Track $Full
        Require ($Inputs[$Full] -ne $Entry.Hash) 'Expected queued entry extension absent'
        $HistoricalScripts+=[pscustomobject]@{Path=$Full;Original=$Original;ExecutedHash=$Entry.Hash;CurrentHash=$Inputs[$Full]}
    }else{Track $Full $Entry.Hash}
}
Require ($HistoricalScripts.Count -eq 3) 'Only three historical launcher versions may differ'
Track $BaseInputs
$Manifest=Read-Json (Join-Path $Mail 'manifest.json')
Require ($Manifest.Restored -and $Manifest.Files.Count -eq 2 -and -not $Manifest.ProductionModified -and $Manifest.Backend -eq 'r119' -and $Manifest.Frontend -eq 'r79') 'Queued mail restoration incomplete'
Require ((Full-Path $Manifest.StatePath) -eq (Join-Path $Run 'state.json')) 'Owned mail fixture required'
$Allowed=@((Join-Path $Run 'auth/service.args'),(Join-Path $Run 'auth/integration.properties'))
foreach($File in $Manifest.Files){
    $Full=Full-Path $File.Path
    Require ($Full -in $Allowed -and -not $Controlled.ContainsKey($Full)) 'Unexpected temporary mail configuration'
    $Backup=Join-Path $Mail ((Split-Path -Leaf $Full)+'.original')
    Require ((Full-Path $File.Backup) -eq $Backup) 'Unexpected mail backup'
    Track $Backup $File.OriginalHash
    Track (Join-Path $Mail ((Split-Path -Leaf $Full)+'.applied')) $File.AppliedHash
    Track $Full $File.OriginalHash
    $Controlled[$Full]=$File
}
$Restored=0
foreach($Entry in @(Read-Json (Join-Path $Runtime 'inputs.json'))){
    $Full=Full-Path $Entry.Path
    if($Controlled.ContainsKey($Full)){
        Require ($Entry.Hash -eq $Controlled[$Full].AppliedHash) 'Queued execution did not use recorded temporary mail configuration'
        Track $Full $Controlled[$Full].OriginalHash
        $Restored++
    }else{Track $Full $Entry.Hash}
}
Require ($Restored -eq 2) 'Two restored execution inputs required'
foreach($Entry in @(Read-Json (Join-Path $Adjacent 'inputs.json'))){Track $Entry.Path $Entry.Hash}
$Execution=Read-Json (Join-Path $Runtime 'execution.json')
Require ($Execution.Exit -eq 0 -and $Execution.Backend -eq 'r119' -and $Execution.Frontend -eq 'r79' -and $Execution.SourceAndRuntimeInputs -eq 11760 -and $Execution.RuntimeFiles -eq 6382 -and $Execution.InputChanges -eq 0 -and $Execution.HealthyServices -eq 6) 'Queued execution incomplete'
$Result=Read-Json (Join-Path $Runtime 'result.json')
Require ($Result.passed -and $Result.queuedRevocations -and $Result.ordinaryEdit -and $Result.newSchedule -and $Result.preservation -and $Result.secrets -and -not $Result.queuedInternalActualCheckComplete -and -not $Result.allAcceptanceComplete) 'Queued result incomplete or scope changed'
Require ($Result.checks.Count -eq 158 -and $Result.requests.Count -eq 41 -and $Result.executions.Count -eq 5 -and $Result.cleanupFailures.Count -eq 0) 'Queued result count differs'
Require (@($Result.executions|Where-Object status -ne 'SUCCESS').Count -eq 0 -and @($Result.executions.executeNo|Sort-Object -Unique).Count -eq 5) 'Actual queued task evidence incomplete'
Require ($Result.email.initialRetryable -eq 14 -and $Result.email.skipped -eq 11 -and $Result.email.sent -eq 5 -and $Result.smtp.count -eq 5 -and $Result.smtp.localOnly -and @($Result.smtp.messageIds|Sort-Object -Unique).Count -eq 5) 'Queued local mail outcome differs'
Require ($Result.secretScan.files -eq 53 -and $Result.secretScan.sensitiveValues -eq 11 -and $Result.secretScan.leaks -eq 0) 'Queued secret scan incomplete'
foreach($Label in @('ordinary_edit_keeps_queued_ids','reschedule_new_pending_ids','temporary_refusal_not_delivered','queued_until_recovery','removed_participant_not_sent','repeat_recovery_does_not_repeat_attempts','new_schedule_has_new_event_ids','old_schedule_remains_skipped','all_records_terminal','smtp_control_restored','original_rows_preserved_sys_message_record','original_rows_preserved_sys_message_delivery')){Require ($Label -in $Result.checks) 'Required queued boundary absent'}
$Control=Join-Path $Runtime 'smtp-control.original.json'
Track $Control
Track (Join-Path $Run 'private/smtp/control.json') $Inputs[(Full-Path $Control)]
foreach($Name in @('inputs.json','execution.json','result.json','live.log')){Track (Join-Path $Runtime $Name)}
foreach($Name in @('manifest.json','allowance.log')){Track (Join-Path $Mail $Name)}
Track (Join-Path $Mail 'run-e1-reminders.original.ps1') (Get-FileHash -LiteralPath (Join-Path $Root 'scripts/run-e1-reminders.ps1')).Hash
$Originals=@(Get-ChildItem -LiteralPath (Join-Path $Runtime 'originals') -File -Recurse)
Require ($Originals.Count -eq 9) 'Queued original count differs'
foreach($File in $Originals){Track $File.FullName (Get-FileHash -LiteralPath (Join-Path $Root ([IO.Path]::GetRelativePath((Join-Path $Runtime 'originals'),$File.FullName)))).Hash}
Require ((Get-Content -LiteralPath (Join-Path $Mail 'allowance.log') -Raw).Contains('original_limit=100; original_ttl=-1; counter_before=1467; counter_after=1472; counter_writes=0; database_unchanged=true; production_modified=false')) 'Queued captcha restoration incomplete'
Require ((Get-Content -LiteralPath (Join-Path $Adjacent 'summary.log') -Raw).Contains('changed=0; exit=0; production_modified=false')) 'Adjacent verification incomplete'
$Oa=Get-Content -LiteralPath (Join-Path $Adjacent 'oa-database.log') -Raw
Require ($Oa.Contains('Complete approved schema table count; expected=374; actual=374') -and $Oa.Contains('PASS: 1012 OA boundary assertions')) 'Adjacent database result incomplete'
Require ((Get-Content -LiteralPath (Join-Path $Adjacent 'menu.log') -Raw).Contains('EMPLOYEE_UNEXPECTED_GRANTS=0; EMPLOYEE_UNEXPECTED_WRITE_PERMISSIONS=0')) 'Adjacent permission result incomplete'
foreach($Name in @('inputs.json','summary.log','oa-database.log','menu.log')){Track (Join-Path $Adjacent $Name)}
$State=Read-Json (Join-Path $Run 'state.json')
Require ($State.status -eq 'RUNNING' -and $State.processes.Count -eq 9 -and $State.services.Count -eq 6) 'Owned runtime incomplete'
foreach($Entry in $State.processes){$Observed=Get-CimInstance Win32_Process -Filter "ProcessId=$($Entry.id)";Require ($null -ne $Observed -and $Observed.CommandLine.Contains($Entry.marker)) 'Owned process identity differs'}
$RuntimeFiles=0
foreach($Service in $State.services){
    $Arguments=@(Get-Content -LiteralPath (Join-Path $Run "$($Service.name)/service.args"))
    $Index=[Array]::IndexOf($Arguments,'-cp')
    Require ($Index -ge 0 -and $Arguments[$Index+2] -eq 'org.springframework.boot.loader.launch.JarLauncher') 'Layered launch required'
    $Layer=[IO.Path]::GetFullPath($Arguments[$Index+1].Trim('"'))
    Require ((Split-Path -Parent $Layer) -eq (Join-Path $Run "$($Service.name)/artifacts")) 'Runtime layer outside fixture'
    foreach($File in Get-ChildItem -LiteralPath $Layer -Recurse -File){Require ($Inputs.ContainsKey($File.FullName)) 'Untracked runtime file';$RuntimeFiles++}
    Require ((Invoke-RestMethod "http://127.0.0.1:$($Service.healthPort)/actuator/health" -TimeoutSec 15).status -eq 'UP') 'Service unhealthy'
}
Require ($RuntimeFiles -eq 6382) 'Runtime file count differs'
foreach($File in $Inputs.Keys){Require ((Get-FileHash -LiteralPath $File).Hash -eq $Inputs[$File]) 'Current queued stage input changed'}
$Inputs.Keys|Sort-Object|ForEach-Object{[pscustomobject]@{Path=$_;Hash=$Inputs[$_]}}|ConvertTo-Json|Set-Content -LiteralPath $Output.Replace('.json','-inputs.json') -Encoding utf8NoBOM
[pscustomobject]@{Passed=$true;Backend='r119';Frontend='r79';Checks=158;Requests=41;ActualTasks=5;InitialRetryable=14;SkippedMail=11;LocalMail=5;CurrentInputs=$Inputs.Count;RuntimeFiles=$RuntimeFiles;NewExecutionOriginals=10;PreviousExecutionOriginals=63;PreviousImages=8;HistoricalScripts=$HistoricalScripts;RestoredMailFiles=2;HealthyServices=6;Adjacent=$AdjacentRound;ProductChanges=0;QueuedInternalActualCheckComplete=$false;AllE1AcceptanceComplete=$false;GlobalComplete=$false}|ConvertTo-Json -Depth 5|Set-Content -LiteralPath $Output -Encoding utf8NoBOM
"E1_REMINDER_QUEUED_STAGE: inputs=$($Inputs.Count); runtime_files=$RuntimeFiles; checks=158; tasks=5; skipped_mail=11; local_mail=5; healthy=6; all_e1_complete=false; global_complete=false"
