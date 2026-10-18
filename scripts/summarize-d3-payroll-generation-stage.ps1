param([ValidatePattern('^r[1-9][0-9]*$')][string]$Round='r1',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$ReplayRound='r4',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$LiveRound='r6',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$AdjacentRound='r119')
$ErrorActionPreference='Stop'
. 'D:\CloudFlowPro\.cloudflow-runtime\use-data-drive.ps1'
$Root='D:\CloudFlowPro'
$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
$Run=Join-Path $Root '.cloudflow-runtime/batch-g-integration/9799534e1a3a47b5958330f14ae16dc7'
$Output=Join-Path $Evidence "d3-payroll-generation-stage-20261006-$Round.json"
if(Test-Path -LiteralPath $Output){throw 'Retain original payroll replay stage evidence'}
function Require([bool]$Condition,[string]$Message){if(-not $Condition){throw $Message}}
function Read-Json([string]$File){Get-Content -LiteralPath (Join-Path $Evidence $File) -Raw|ConvertFrom-Json}
$Replay="d3-payroll-replay-20261006-$ReplayRound"
$Live="d3-batch-filters-20261006-$LiveRound"
$Result=Read-Json "$Replay/result.json"
Require ($Result.Passed -and $Result.ActualDatabase -and $Result.ActualService -and $Result.ActualTaskHandler -and $Result.TaskAdmissionFixture -and $Result.DistributedLock -and $Result.CheckpointFixture -and -not $Result.FreshCalculation -and $Result.ScratchCleaned -and $Result.InputChanges -eq 0) 'Actual replay boundary evidence incomplete'
$Actual=Read-Json "$Live/result.json"
foreach($Name in @('passed','filters','persisted','failurePage','retry','cancelPermission','closed','preservation','restoration','secrets')){Require ($Actual.$Name -eq $true) "Missing current actual batch evidence: $Name"}
Require (-not $Actual.all18Complete -and -not $Actual.globalComplete -and -not $Actual.officialTaxPolicyVerified) 'Actual scope changed'
$Fixture=Read-Json "$Live/fixture.json"
Require ($Fixture.batches.Count -eq 3 -and $Fixture.tasks.Count -eq 3 -and $Fixture.employees.Count -eq 3) 'Current actual fixture accounting differs'
foreach($Task in $Fixture.tasks){Require ($Task.terminal -eq 'SUCCESS' -and $Task.affectedRows -eq 1) 'Current original task terminal differs'}
foreach($Batch in $Fixture.batches){Require ($Fixture.restorations.($Batch.id) -eq $true) 'Current actual batch restoration missing'}
foreach($Check in @('only_failed_employee_retried','previous_successful_salary_all_fields_unchanged','owned_test_period_closed','owned_tax_disabled','all_original_business_rows_and_grants_preserved','mobile_failure_reason_fits_viewport')){Require ($Actual.checks.Contains($Check)) "Missing current actual check: $Check"}
foreach($File in @('mixed-failure-desktop.png','mixed-failure-mobile.png','mixed-retry-mobile.png')){Require ((Get-Item -LiteralPath (Join-Path $Evidence "$Live/$File")).Length -gt 0) 'Current browser evidence missing'}
$Current=@{}
foreach($Group in @("$Replay/inputs.json","$Live/inputs.json","h3-portal-finance-adjacent-20261002-$AdjacentRound/inputs.json",'h3-portal-finance-20261002-backend-r108-inputs.json','h3-portal-finance-20261002-frontend-r66-inputs.json')){
    foreach($Item in @(Read-Json $Group)){
        if(-not $Current.ContainsKey($Item.Path)){$Current[$Item.Path]=(Get-FileHash -LiteralPath (Join-Path $Root $Item.Path)).Hash}
        Require ($Current[$Item.Path] -eq $Item.Hash) 'Verified source input changed'
    }
}
$Binaries=@(Read-Json "$Replay/binary-inputs.json")
foreach($Item in $Binaries){Require ((Get-FileHash -LiteralPath $Item.Path).Hash -eq $Item.Hash) 'Compiled replay dependency changed'}
$Originals=0
foreach($Group in @(@{Folder=$Replay;Names=@('run-d3-payroll-replay.ps1','verify-hr-settlement-foundation.ps1','HrPayrollReplayChecks.java')},@{Folder=$Live;Names=@('run-d3-batch-filters.ps1','verify-d3-batch-filters.mjs','run-d3-batch-filters-allowance.mjs','d1-leave-runtime.mjs')})){
    $Inputs=@(Read-Json "$($Group.Folder)/inputs.json")
    foreach($Name in $Group.Names){
        $Input=@($Inputs|Where-Object {(Split-Path -Leaf $_.Path) -eq $Name})
        Require ($Input.Count -eq 1 -and (Get-FileHash -LiteralPath (Join-Path $Evidence "$($Group.Folder)/original-$Name")).Hash -eq $Input[0].Hash) 'Original executed script changed';$Originals++
    }
}
$OldInputs=@(Read-Json 'h3-portal-finance-adjacent-20261002-r117/inputs.json')
$Original=Join-Path $Evidence 'd3-payroll-replay-original-foundation-20261006.ps1'
$OriginalInput=@($OldInputs|Where-Object {(Split-Path -Leaf $_.Path) -eq 'verify-hr-settlement-foundation.ps1'})
Require ($OriginalInput.Count -eq 1 -and (Get-FileHash -LiteralPath $Original).Hash -eq $OriginalInput[0].Hash) 'Previous shared runner original differs'
$Before=[IO.File]::ReadAllText($Original).Replace("`r`n","`n")
$Expected=$Before.Replace('[string]$StatePath, [switch]$SimulatorConfiguration','[string]$StatePath, [switch]$PayrollReplay, [switch]$SimulatorConfiguration').Replace('@($SimulatorConfiguration,','@($PayrollReplay, $SimulatorConfiguration,').Replace('$CheckClass = if ($SimulatorConfiguration)','$CheckClass = if ($PayrollReplay) { ''HrPayrollReplayChecks'' } elseif ($SimulatorConfiguration)').Replace('    if ($SourceReservation -or $Funds) {','    if ($PayrollReplay -or $SourceReservation -or $Funds) {')
Require ($Expected -eq [IO.File]::ReadAllText((Join-Path $Root 'scripts/verify-hr-settlement-foundation.ps1')).Replace("`r`n","`n")) 'Shared runner change exceeds the five isolated mode additions'
$OldBuild=@(Read-Json 'h3-portal-finance-20261002-backend-r107-inputs.json')
$NewBuild=@(Read-Json 'h3-portal-finance-20261002-backend-r108-inputs.json')
Require ($OldBuild.Count -eq $NewBuild.Count) 'Unexpected product input count change'
$OldMap=@{};foreach($Item in $OldBuild){$OldMap[$Item.Path]=$Item.Hash}
$Changed=@($NewBuild|Where-Object {$OldMap[$_.Path] -ne $_.Hash})
Require ($Changed.Count -eq 2 -and (@($Changed|ForEach-Object {Split-Path -Leaf $_.Path}|Sort-Object) -join ',') -eq 'HrPayrollBatchService.java,HrRulePrecisionJobs.java') 'Product changes exceed the execution service and task handler'
foreach($Item in $Changed){
    $OriginalName=if((Split-Path -Leaf $Item.Path) -eq 'HrPayrollBatchService.java'){'d3-payroll-generation-original-b107-service.java'}else{'d3-payroll-generation-original-b107-job.java'}
    Require ((Get-FileHash -LiteralPath (Join-Path $Evidence $OriginalName)).Hash -eq $OldMap[$Item.Path]) 'Original reproduced source differs from B107'
}
$PreviousStage=Read-Json 'd3-payroll-replay-stage-20261006-r1.json'
Require ($PreviousStage.passed -and $PreviousStage.checks -eq 62 -and $PreviousStage.backend -eq 'r107') 'Previous completion guard stage missing'
$PreviousInputs=@(Read-Json 'h3-portal-finance-adjacent-20261002-r118/inputs.json')
foreach($Pair in @(@{Name='HrPayrollReplayChecks.java';Original='d3-payroll-generation-original-replay-checks.java'},@{Name='run-d3-payroll-replay.ps1';Original='d3-payroll-generation-original-runner.ps1'})){
    $Old=@($PreviousInputs|Where-Object {(Split-Path -Leaf $_.Path) -eq $Pair.Name})
    Require ($Old.Count -eq 1 -and (Get-FileHash -LiteralPath (Join-Path $Evidence $Pair.Original)).Hash -eq $Old[0].Hash) 'Earlier checker or runner original changed'
}
$OriginalRunner=[IO.File]::ReadAllText((Join-Path $Evidence 'd3-payroll-generation-original-runner.ps1')).Replace("`r`n","`n")
$ExpectedRunner=$OriginalRunner.Replace('ActualService=$true;CheckpointFixture=$true','ActualService=$true;ActualTaskHandler=$true;TaskAdmissionFixture=$true;CheckpointFixture=$true')
Require ($ExpectedRunner -eq [IO.File]::ReadAllText((Join-Path $Root 'scripts/run-d3-payroll-replay.ps1')).Replace("`r`n","`n")) 'Replay runner changes exceed explicit evidence scope metadata'
Require ((Get-Content (Join-Path $Evidence 'h3-portal-finance-20261002-backend-r108.log') -Raw).Contains('changed=0; exit=0')) 'B108 build terminal missing'
Require ((Get-Content (Join-Path $Evidence 'd3-payroll-generation-hr-reload-b108-launch.log') -Raw).Contains('ISOLATED_RESTART_READY: service=hr;')) 'B108 HR reload terminal missing'
Require ((Get-Content (Join-Path $Evidence 'd3-payroll-generation-smtp-recovery-r1-launch.log') -Raw).Contains('ISOLATED_SMTP_READY:')) 'Owned mail receiver recovery terminal missing'
$Failed=Read-Json 'd3-payroll-replay-20261006-r3/result.json'
Require (-not $Failed.Passed -and $Failed.ScratchCleaned -and $Failed.InputChanges -eq 0) 'Original failing baseline or cleanup changed'
Require ((Get-Content (Join-Path $Evidence 'd3-payroll-replay-20261006-r3/live.log') -Raw).Contains('delayed previous round preserves active retry; actual=CALCULATED')) 'Original defect reproduction missing'
Require ((Get-Content (Join-Path $Evidence "d3-payroll-replay-20261006-$ReplayRound-launch.log") -Raw).Contains('D3_PAYROLL_REPLAY_RUN_EXIT=0')) 'Replay original successful terminal missing'
$Launch=Get-Content (Join-Path $Evidence "d3-batch-filters-20261006-$LiveRound-launch.log") -Raw
Require ($Launch.Contains('D3_FILTERS_RUN_EXIT=0') -and $Launch -match 'OWNED_CAPTCHA_RESTORED: original_limit=100; original_ttl=-1; counter_before=(\d+); counter_after=(\d+); counter_writes=0; database_unchanged=true; production_modified=false') 'Current actual terminal or configuration restoration missing'
$CaptchaBefore=[int]$Matches[1];$CaptchaAfter=[int]$Matches[2]
$Adjacent=Get-Content (Join-Path $Evidence "h3-portal-finance-adjacent-20261002-$AdjacentRound/summary.log") -Raw
Require ($Adjacent -match 'H3_FINANCE_ADJACENT: files=(\d+); changed=0; exit=0; production_modified=false') 'Related regression incomplete'
$AdjacentInputs=[int]$Matches[1]
$State=Get-Content (Join-Path $Run 'state.json') -Raw|ConvertFrom-Json
Require ($State.status -eq 'RUNNING' -and [IO.Path]::GetFullPath($State.run) -eq $Run) 'Owned runtime required'
foreach($Entry in $State.processes){$Observed=Get-CimInstance Win32_Process -Filter "ProcessId=$($Entry.id)";Require ($Observed -and $Observed.CommandLine.Contains($Entry.marker)) 'Owned process mismatch'}
$Healthy=0
foreach($Service in $State.services){Require ((Invoke-RestMethod "http://127.0.0.1:$($Service.healthPort)/actuator/health" -TimeoutSec 5).status -eq 'UP') 'Unhealthy service';$Healthy++}
$Summary=[pscustomobject]@{passed=$true;backend='r108';frontend='r66';replayRound=$ReplayRound;liveRound=$LiveRound;checks=$Result.Checks;liveChecks=$Actual.checks.Count;requests=$Actual.requests;tasks=$Actual.tasks;binaryInputs=$Binaries.Count;currentInputs=$Current.Count;adjacentInputs=$AdjacentInputs;originalScripts=$Originals;reviewedSharedRunnerChanges=5;changedProductInputs=2;processes=$State.processes.Count;healthyServices=$Healthy;captchaBefore=$CaptchaBefore;captchaAfter=$CaptchaAfter;officialTaxPolicyVerified=$false;all18Complete=$false;globalComplete=$false;remaining=@('Same employee interrupted generation replay','Concurrent creation wins against closing','Pending correction and period closing','Official tax policy','D2 first ordinary request below500ms','Global35PRD681')}
$Summary|ConvertTo-Json -Depth 5|Set-Content -LiteralPath $Output -Encoding utf8NoBOM
"D3_PAYROLL_GENERATION_STAGE: checks=$($Result.Checks); live_checks=$($Actual.checks.Count); inputs=$($Current.Count); binaries=$($Binaries.Count); adjacent=$AdjacentInputs; originals=$Originals; processes=$($State.processes.Count); healthy=$Healthy; global_complete=false"
