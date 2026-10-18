param([ValidatePattern('^r[1-9][0-9]*$')][string]$Round='r1',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$AdjacentRound='r168')
$ErrorActionPreference='Stop'
. 'D:\CloudFlowPro\.cloudflow-runtime\use-data-drive.ps1'
$Root='D:\CloudFlowPro'
$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
$Run=Join-Path $Root '.cloudflow-runtime/batch-g-integration/9799534e1a3a47b5958330f14ae16dc7'
$Runtime=Join-Path $Evidence 'e1-reminder-internal-runtime-20261007-r3'
$BaseFile=Join-Path $Evidence 'e1-reminder-queued-stage-20261007-r1.json'
$Adjacent=Join-Path $Evidence "h3-portal-finance-adjacent-20261002-$AdjacentRound"
$Output=Join-Path $Evidence "e1-reminder-internal-stage-20261007-$Round.json"
if(Test-Path -LiteralPath $Output){throw 'Retain original internal reminder stage evidence'}
$Inputs=@{}
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
Require ($Base.Passed -and $Base.Backend -eq 'r119' -and $Base.Frontend -eq 'r79' -and $Base.Checks -eq 158 -and $Base.SkippedMail -eq 11 -and $Base.LocalMail -eq 5 -and $Base.CurrentInputs -eq 14650 -and $Base.ProductChanges -eq 0 -and -not $Base.AllE1AcceptanceComplete) 'Completed queued mail stage required'
Track $BaseFile
$Wrappers=@('scripts/run-e1-reminder-runtime.ps1','scripts/run-e1-reminder-allowance.mjs')|ForEach-Object{Full-Path $_}
$HistoricalScripts=@()
$BaseInputs=$BaseFile.Replace('.json','-inputs.json')
foreach($Entry in @(Read-Json $BaseInputs)){
    $Full=Full-Path $Entry.Path
    if($Full -in $Wrappers){
        $Original=Join-Path $Evidence ('e1-reminder-queued-runtime-20261007-r1/originals/'+[IO.Path]::GetRelativePath($Root,$Full))
        Track $Original $Entry.Hash
        Track $Full
        Require ($Inputs[$Full] -ne $Entry.Hash) 'Internal entry extension absent'
        $HistoricalScripts+=[pscustomobject]@{Path=$Full;Original=$Original;ExecutedHash=$Entry.Hash;CurrentHash=$Inputs[$Full]}
    }else{Track $Full $Entry.Hash}
}
Require ($HistoricalScripts.Count -eq 2) 'Only two historical launcher versions may differ'
Track $BaseInputs
foreach($Directory in @($Runtime,$Adjacent)){
    $InputFile=Join-Path $Directory 'inputs.json'
    foreach($Entry in @(Read-Json $InputFile)){Track $Entry.Path $Entry.Hash}
    Track $InputFile
}
$Execution=Read-Json (Join-Path $Runtime 'execution.json')
Require ($Execution.Exit -eq 0 -and $Execution.Backend -eq 'r119' -and $Execution.Frontend -eq 'r79' -and $Execution.SourceAndRuntimeInputs -eq 11760 -and $Execution.RuntimeFiles -eq 6382 -and $Execution.InputChanges -eq 0 -and $Execution.HealthyServices -eq 6) 'Internal execution incomplete'
$Result=Read-Json (Join-Path $Runtime 'result.json')
Require ($Result.passed -and $Result.queuedRevocations -and $Result.ordinaryEdit -and $Result.newSchedule -and $Result.queuedInternalActualCheckComplete -and $Result.preservation -and $Result.secrets -and -not $Result.allAcceptanceComplete) 'Internal result incomplete'
Require ($Result.checks.Count -eq 136 -and $Result.requests.Count -eq 42 -and $Result.executions.Count -eq 5 -and $Result.cleanupFailures.Count -eq 0) 'Internal result count differs'
Require (@($Result.executions|Where-Object status -ne 'SUCCESS').Count -eq 0 -and @($Result.executions.executeNo|Sort-Object -Unique).Count -eq 5) 'Actual internal tasks incomplete'
Require ($Result.internal.initialQuietPending -eq 7 -and $Result.internal.skipped -eq 6 -and $Result.internal.sent -eq 3 -and $Result.internal.attempts -eq 3) 'Internal delivery counts differ'
Require ($Result.subscription.id -eq 100 -and $Result.subscription.userId -eq 990000701 -and $Result.subscription.newRecord -and $Result.subscription.restoredToDefault) 'Owned subscription not restored'
Require ($Result.secretScan.files -eq 53 -and $Result.secretScan.sensitiveValues -eq 10 -and $Result.secretScan.leaks -eq 0) 'Internal secret scan incomplete'
foreach($Label in @('all_changes_before_delivery','ordinary_edit_preserves_pending_id','reschedule_replaces_pending_id','self_decline_recorded','internal_source_edit','internal_source_reschedule','internal_source_cancel','internal_source_delete','internal_source_complete','internal_source_remove_reminder','internal_source_decline','old_schedule_never_attempted','recovery_repeat_unchanged','new_schedule_not_repeated','effective_subscriptions_restored','no_email_attempts')){Require ($Label -in $Result.checks) 'Required internal boundary absent'}
foreach($Name in @('execution.json','result.json','live.log')){Track (Join-Path $Runtime $Name)}
$Originals=@(Get-ChildItem -LiteralPath (Join-Path $Runtime 'originals') -File -Recurse)
Require ($Originals.Count -eq 9) 'Internal execution originals incomplete'
foreach($File in $Originals){Track $File.FullName (Get-FileHash -LiteralPath (Join-Path $Root ([IO.Path]::GetRelativePath((Join-Path $Runtime 'originals'),$File.FullName)))).Hash}
$FailedOriginals=0
foreach($Failure in @(@{Round='r1';Checks=21;Requests=0;Reason='admin_owns_subscription'},@{Round='r2';Checks=31;Requests=1;Reason='bounded_quiet_window'})){
    $Directory=Join-Path $Evidence "e1-reminder-internal-runtime-20261007-$($Failure.Round)"
    $Failed=Read-Json (Join-Path $Directory 'result.json')
    $FailedExecution=Read-Json (Join-Path $Directory 'execution.json')
    Require (-not $Failed.passed -and $Failed.checks.Count -eq $Failure.Checks -and $Failed.requests.Count -eq $Failure.Requests -and $Failed.failure -eq $Failure.Reason -and $Failed.executions.Count -eq 0 -and $Failed.preservation -and $Failed.secrets -and $FailedExecution.Exit -eq 1 -and $FailedExecution.InputChanges -eq 0) 'Retained failed preflight differs'
    $Saved=@{}
    foreach($Entry in @(Read-Json (Join-Path $Directory 'inputs.json'))){$Saved[(Full-Path $Entry.Path)]=$Entry.Hash}
    $Copies=@(Get-ChildItem -LiteralPath (Join-Path $Directory 'originals') -File -Recurse)
    Require ($Copies.Count -eq 9) 'Failed preflight originals incomplete'
    foreach($File in $Copies){
        $Source=Full-Path ([IO.Path]::GetRelativePath((Join-Path $Directory 'originals'),$File.FullName))
        Require ($Saved.ContainsKey($Source)) 'Failed original absent from its execution inputs'
        Track $File.FullName $Saved[$Source]
        $FailedOriginals++
    }
    foreach($Name in @('inputs.json','execution.json','result.json','live.log')){Track (Join-Path $Directory $Name)}
}
$Allowance=Join-Path $Evidence 'e1-reminder-internal-20261007-r3-launch.log'
Require ((Get-Content -LiteralPath $Allowance -Raw).Contains('original_limit=100; original_ttl=-1; counter_before=1482; counter_after=1487; counter_writes=0; database_unchanged=true; production_modified=false')) 'Internal captcha configuration not restored'
Track $Allowance
Require ((Get-Content -LiteralPath (Join-Path $Adjacent 'summary.log') -Raw).Contains('changed=0; exit=0; production_modified=false')) 'Adjacent checks incomplete'
$Oa=Get-Content -LiteralPath (Join-Path $Adjacent 'oa-database.log') -Raw
Require ($Oa.Contains('Complete approved schema table count; expected=374; actual=374') -and $Oa.Contains('PASS: 1012 OA boundary assertions')) 'Adjacent database result incomplete'
Require ((Get-Content -LiteralPath (Join-Path $Adjacent 'menu.log') -Raw).Contains('EMPLOYEE_UNEXPECTED_GRANTS=0; EMPLOYEE_UNEXPECTED_WRITE_PERMISSIONS=0')) 'Adjacent permission result incomplete'
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
    Require ((Split-Path -Parent $Layer) -eq (Join-Path $Run "$($Service.name)/artifacts")) 'Runtime layer outside fixture'
    foreach($File in Get-ChildItem -LiteralPath $Layer -Recurse -File){Require ($Inputs.ContainsKey($File.FullName)) 'Untracked runtime file';$RuntimeFiles++}
    Require ((Invoke-RestMethod "http://127.0.0.1:$($Service.healthPort)/actuator/health" -TimeoutSec 15).status -eq 'UP') 'Service unhealthy'
}
Require ($RuntimeFiles -eq 6382 -and $FailedOriginals -eq 18) 'Evidence file count differs'
foreach($File in $Inputs.Keys){Require ((Get-FileHash -LiteralPath $File).Hash -eq $Inputs[$File]) 'Current internal stage input changed'}
$Inputs.Keys|Sort-Object|ForEach-Object{[pscustomobject]@{Path=$_;Hash=$Inputs[$_]}}|ConvertTo-Json|Set-Content -LiteralPath $Output.Replace('.json','-inputs.json') -Encoding utf8NoBOM
[pscustomobject]@{Passed=$true;Backend='r119';Frontend='r79';Checks=136;Requests=42;ActualTasks=5;InitialQuietPending=7;SkippedInternal=6;SentInternal=3;CurrentInputs=$Inputs.Count;RuntimeFiles=$RuntimeFiles;CurrentExecutionOriginals=9;FailedExecutionOriginals=18;PreviousExecutionOriginals=73;HistoricalScripts=$HistoricalScripts;SubscriptionRestoredToDefault=$true;HealthyServices=6;Adjacent=$AdjacentRound;ProductChanges=0;QueuedInternalActualCheckComplete=$true;AllE1AcceptanceComplete=$false;GlobalComplete=$false}|ConvertTo-Json -Depth 5|Set-Content -LiteralPath $Output -Encoding utf8NoBOM
"E1_REMINDER_INTERNAL_STAGE: inputs=$($Inputs.Count); runtime_files=$RuntimeFiles; checks=136; tasks=5; skipped_internal=6; sent_internal=3; healthy=6; all_e1_complete=false; global_complete=false"
