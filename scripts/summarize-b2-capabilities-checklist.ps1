param([ValidatePattern('^r[1-9][0-9]*$')][string]$RuntimeRound='r25',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$AdjacentRound='r34',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$FrontendRound='r9',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$NaturalRound='r2',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$RecoveryRound='r4')
$ErrorActionPreference='Stop'
$Root='D:\CloudFlowPro'
. (Join-Path $Root '.cloudflow-runtime/use-data-drive.ps1')
$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
$Log=Get-Content -LiteralPath (Join-Path $Evidence "a3-anomaly-scan-20261003-http-$RuntimeRound.log") -Raw
foreach($Marker in @('"b2Capabilities":true','"definitionFixtureArchive":true','"signingWeightPass":true','"signingWeightReject":true','"signingFourModes":true','"signingRepeat":true','"signingRestoration":true',
    '"timerInvalidation":true','"timerManual":true','"timerPostActionScan":true','"timerActionsRestoration":true',
    '"workdayTimerDates":true','"workdayTimerRestoration":true','"instanceStateActions":true','"instanceStateDenials":true','"draftStoredSeparately":true',
    '"instanceStateMonitorApi":true','"instanceStateBrowser":true','"instanceStatesRestoration":true','"b2DesignerSettings":true','"b2DesignerRestoration":true',
    '"hrLevelVotes":true','"hrOutageVotes":true','"hrOutageNotice":true','"hrRecoveredVotes":true','"hrVotingRestoration":true','"instanceStateMobileMonitor":true')) {
    if($Log -notmatch $Marker){throw 'Required B2 capability completion evidence missing'}
}
function Read-Result([string]$Text,[string]$Prefix) {
    $Lines=@($Text -split '\r?\n' | Where-Object {$_.StartsWith($Prefix)})
    if($Lines.Count -ne 1){throw "Exactly one result required: $Prefix"}
    return ($Lines[0].Substring($Prefix.Length)|ConvertFrom-Json)
}
$Signing=Read-Result $Log 'B2_SIGNING_MODES_ACTUAL: '
 $Hr=Read-Result $Log 'B2_HR_VOTING_ACTUAL: '
if($Hr.workflows -ne 3 -or $Hr.successfulVotes -ne 6 -or -not $Hr.actualHrJobLevels -or -not $Hr.actualProcessStop -or
    -not $Hr.actualProcessRecovery -or -not $Hr.restoredOriginalHr -or -not $Hr.oldVotesFrozenAcrossHrChange -or
    -not $Hr.actualInitiatorNotice -or $Hr.outageThreshold -ne 2 -or $Hr.forcedWorkflowOutcomeWrites -ne 0 -or
    $Hr.helperSecretLeaks -ne 0 -or $Hr.productionModified -or ($Hr.beforeOutageWeights -join ',') -ne '3,2,1' -or
    ($Hr.outageWeights -join ',') -ne '1,1,1' -or ($Hr.recoveredWeights -join ',') -ne '3,2,1'){throw 'Actual HR service voting, outage or recovery differs'}
if($Signing.workflows -ne 10 -or $Signing.successfulVotes -ne 20 -or $Signing.signModes -ne 5 -or $Signing.weightedThreshold -ne 5 -or
    ($Signing.weightedApprovals -join ',') -ne '3,2' -or -not $Signing.earlyWeightedReject -or $Signing.forcedWorkflowOutcomeWrites -ne 0){throw 'Actual signing evidence differs'}
$Timers=Read-Result $Log 'B2_TIMER_ACTIONS_ACTUAL: '
if($Timers.workflows -ne 2 -or -not $Timers.invalidated -or -not $Timers.manualCompletion -or -not $Timers.actualAdministratorAudit -or
    -not $Timers.subsequentRealScan -or $Timers.forcedWorkflowOutcomeWrites -ne 0 -or $Timers.naturalTimerSampleModified){throw 'Actual timer management evidence differs'}
$Workdays=Read-Result $Log 'B2_WORKDAY_TIMERS_ACTUAL: '
if($Workdays.workflows -ne 2 -or -not $Workdays.explicitOwnedCalendar -or $Workdays.originalDefaultModified -or $Workdays.clockChanges -ne 0 -or
    $Workdays.forcedWorkflowOutcomeWrites -ne 0 -or $Workdays.naturalMultiDayWait){throw 'Actual workday date evidence differs'}
$LongWorkday=@($Workdays.results|Where-Object {$_.amount -eq 8})
if($LongWorkday.Count -ne 1 -or $LongWorkday[0].skippedHolidays -ne 1 -or $LongWorkday[0].skippedWeekends -lt 1 -or $LongWorkday[0].makeupDays -ne 1){throw 'Actual workday exceptions not covered'}
$States=Read-Result $Log 'B2_INSTANCE_STATES_ACTUAL: '
$ExpectedStates=@('RUNNING','PASSED','AUTO_PASSED','REJECTED','TERMINATED','INVALIDATED','CANCELLED','WITHDRAWN','TASK_BACK','PAUSED','RESTARTED','PENDING','FAILED')
if($States.workflows -ne 9 -or $States.instanceStateCount -ne 13 -or $States.monitorApiStates -ne 13 -or $States.browserStateFilters -ne 13 -or
    $States.browserFilterOptions -ne 14 -or -not $States.desktopBrowserVerified -or $States.mobileBrowserVerified -or
    $States.draftStorage -ne 'wf_form_draft' -or -not $States.draftIsNotPrematureInstance -or $States.forcedWorkflowOutcomeWrites -ne 0 -or
    (($States.instanceStates|Sort-Object) -join ',') -ne (($ExpectedStates|Sort-Object) -join ',')){throw 'Actual instance and monitor evidence differs'}
$Designer=Read-Result $Log 'B2_DESIGNER_UI_ACTUAL: '
$Mobile=Read-Result $Log 'B2_MOBILE_MONITOR_ACTUAL: '
if($Mobile.states -ne 13 -or $Mobile.distributionRows -ne 13 -or -not $Mobile.realTouchRefresh -or -not $Mobile.realMetricsAndAnalysis -or
    $Mobile.viewport -ne '390x844' -or -not $Mobile.mobileBrowserEmulated -or $Mobile.physicalPhoneTested -or
    $Mobile.mobileApplicationsAvailable -or $Mobile.mobileDesignerAvailable -or $Mobile.draftIncludedInInstanceCounts -or
    $Mobile.interfaceDoubles -ne 0 -or $States.mobileMonitorStates -ne 13){throw 'Actual mobile monitor evidence differs'}
if($Designer.definitions -ne 3 -or $Designer.realEditorSaves -ne 15 -or $Designer.timerTypes -ne 3 -or $Designer.delayUnits -ne 4 -or
    $Designer.timerActions -ne 3 -or $Designer.triggerTypes -ne 3 -or $Designer.weightSources -ne 3 -or $Designer.configuredUsers -ne 3 -or
    $Designer.callbackExecutions -ne 0 -or -not $Designer.desktopBrowser -or -not $Designer.mobilePersonSelector -or $Designer.mobileBrowser){throw 'Actual designer and mobile selector evidence differs'}
$RuntimeInputs=@(Get-Content -LiteralPath (Join-Path $Evidence "a3-anomaly-scan-20261003-inputs-$RuntimeRound.json") -Raw|ConvertFrom-Json)
foreach($Required in @('scripts/verify-b2-capabilities.mjs','scripts/verify-b2-signing-modes.mjs','scripts/verify-b2-timer-actions.mjs',
    'scripts/verify-b2-workday-timers.mjs','scripts/verify-b2-instance-states.mjs','scripts/verify-b2-status-ui.mjs','scripts/verify-b2-designer-ui.mjs','scripts/repair-b2-definition-fixtures.mjs',
    'scripts/verify-b2-hr-voting.mjs','scripts/operate-b2-hr-outage.ps1','scripts/restart-isolated-integration-service.ps1',
    'scripts/b2-mobile-browser.mjs','scripts/verify-b2-mobile-monitor.mjs')) {
    if($Required -notin $RuntimeInputs.Path){throw 'Capability helper was not frozen in runtime inputs'}
}
# This revalidates the current combined HTTP round, product builds, A3 business locks, all-script adjacent round and 14 shared checks.
& (Join-Path $Root 'scripts/summarize-b2-http-trigger-checklist.ps1') -RuntimeRound $RuntimeRound -AdjacentRound $AdjacentRound -FrontendRound $FrontendRound
if($NaturalRound -eq 'r2'){
    & (Join-Path $Root 'scripts/summarize-b2-natural-recovery.ps1') -RecoveryRound $RecoveryRound
    'B2_CAPABILITIES_CHECKLIST: items=14; missing=0; actual_signing=true; timer_actions=true; workday_dates=true; states=13; separate_draft=true; monitor_api=true; desktop_filters=true; desktop_designer=true; one_hour_natural=true; original_natural_run_passed=false; original_timer_recovered=true; actual_hr_outage=true; mobile_monitor_states=13; mobile_browser_emulated=true; physical_phone_tested=false; mobile_complete=false; complete_35_prd=false; production_modified=false'
    return
}
$NaturalLog=Get-Content -LiteralPath (Join-Path $Evidence "a3-natural-cadence-20261003-http-$NaturalRound.log") -Raw
foreach($Marker in @('A3_NATURAL_CADENCE_REAL_RESULT: checks=[1-9][0-9]*; failed=0; requests=[1-9][0-9]*;',
    '"configuration":true','"cadence":true','"reports":true','"timerPrecision":true','"oneHourTimer":true','"restoration":true','"secrets":true',
    'A3_NATURAL_INPUTS: files=20; changed=0; product_changed=0; exit=0')){if($NaturalLog -notmatch $Marker){throw 'One-hour natural result is incomplete'}}
$Natural=Read-Result $NaturalLog 'A3_NATURAL_ACTUAL: '
if($Natural.timerUnit -ne 'HOUR' -or $Natural.configuredWaitMs -ne 3600000 -or $Natural.timerHistoryAt-$Natural.timerRequestAt -lt 3599000 -or
    $Natural.timerDelayMs -lt -1000 -or $Natural.timerDelayMs -gt 180000 -or $Natural.timerHistoryAt-$Natural.timerExpireAt -ne $Natural.timerDelayMs -or
    $Natural.manualTriggers -ne 0 -or $Natural.acceleratedIntervals -or $Natural.databaseTimeWrites -ne 0 -or $Natural.clockChanges -ne 0 -or $Natural.fullDayObserved){throw 'Natural timing evidence differs'}
$NaturalInputs=@(Get-Content -LiteralPath (Join-Path $Evidence "a3-natural-cadence-20261003-inputs-$NaturalRound.json") -Raw|ConvertFrom-Json)
if($NaturalInputs.Count -ne 20){throw 'Natural timer snapshot differs'}
foreach($Item in $NaturalInputs){$Path=if([IO.Path]::IsPathRooted($Item.Path)){$Item.Path}else{Join-Path $Root $Item.Path};if((Get-FileHash -LiteralPath $Path).Hash -ne $Item.Hash){throw 'Natural timer input changed'}}
$NaturalLaunch=Get-Content -LiteralPath (Join-Path $Evidence "b2-hour-timer-launch-20261004-$NaturalRound.log") -Raw
foreach($Marker in @('A3_NATURAL_RUN_EXIT=0','OWNED_CAPTCHA_RESTORED: original_limit=100; original_ttl=-1;',
    'counter_writes=0; database_unchanged=true; production_modified=false')){if($NaturalLaunch -notmatch $Marker){throw 'Natural timer launch or restoration incomplete'}}
"B2_CAPABILITIES_CHECKLIST: items=14; missing=0; actual_signing=true; timer_actions=true; workday_dates=true; states=13; separate_draft=true; monitor_api=true; desktop_filters=true; desktop_designer=true; one_hour_natural=true; actual_hr_outage=true; mobile_complete=false; complete_35_prd=false; production_modified=false"
