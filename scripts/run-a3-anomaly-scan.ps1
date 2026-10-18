param([ValidatePattern('^r[1-9][0-9]*$')][string]$Round='r1',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$BackendRound='r40',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$FrontendRound='r15',
    [switch]$TriggerOnly,
    [switch]$TransactionOnly,
    [switch]$OffboardOnly)
$ErrorActionPreference='Stop'
if($env:CLOUDFLOW_B1_APPROVAL_POLICIES -and ($env:CLOUDFLOW_B1_APPROVAL_POLICIES -notin @('1','designer','controls','launch','rejection','rejection-ui','timeout','legacy','semantics','nodes','manual-policy','manual-required','legacy-nodes') -or -not $TriggerOnly -or $TransactionOnly -or $OffboardOnly -or $env:CLOUDFLOW_B2_CAPABILITIES)){throw 'B1 approval policies require an independent workflow focus'}
if($env:CLOUDFLOW_B2_CAPABILITIES -and ($env:CLOUDFLOW_B2_CAPABILITIES -notin @('1','ui','designer','hr') -or -not $TriggerOnly -or $TransactionOnly -or $OffboardOnly)){throw 'B2 capabilities require exactly the HTTP trigger focus'}
if(@($TriggerOnly,$TransactionOnly,$OffboardOnly|Where-Object {$_}).Count -gt 1){throw 'Choose one verification focus'}
. 'D:\CloudFlowPro\.cloudflow-runtime/use-data-drive.ps1'
$Root='D:\CloudFlowPro'
$Run=Join-Path $Root '.cloudflow-runtime/batch-g-integration/9799534e1a3a47b5958330f14ae16dc7'
$StatePath=Join-Path $Run 'state.json'
$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
$Prefix='a3-anomaly-scan-20261003'
$Log=Join-Path $Evidence "$Prefix-http-$Round.log"
$InputPath=Join-Path $Evidence "$Prefix-inputs-$Round.json"
foreach($File in @($Log,$InputPath)){if(Test-Path -LiteralPath $File){throw 'Existing evidence must be retained'}}
$State=Get-Content -LiteralPath $StatePath -Raw|ConvertFrom-Json
if($State.status -ne 'RUNNING' -or [IO.Path]::GetFullPath($State.run) -ne $Run){throw 'Owned running fixture required'}
foreach($Entry in $State.processes) {
    $Observed=Get-CimInstance Win32_Process -Filter "ProcessId=$($Entry.id)"
    if($null -eq $Observed -or -not $Observed.CommandLine.Contains($Entry.marker)){throw 'Owned process verification failed'}
}
function Assert-ProductInputs {
    foreach($Build in @("backend-$BackendRound","frontend-$FrontendRound")) {
        $Snapshot=@(Get-Content -LiteralPath (Join-Path $Evidence "h3-portal-finance-20261002-$Build-inputs.json") -Raw|ConvertFrom-Json)
        if(@($Snapshot|Where-Object{(Get-FileHash -LiteralPath (Join-Path $Root $_.Path)).Hash -ne $_.Hash}).Count){throw 'Product differs from verified build'}
    }
}
Push-Location $Root
try {
    Assert-ProductInputs
    $Paths=@('scripts/verify-batch-g-integration.mjs','scripts/verify-a3-anomaly-scan.mjs','scripts/verify-anomaly-event-delivery.mjs','scripts/verify-disabled-user-delivery.mjs','scripts/run-a3-anomaly-scan.ps1',
        'scripts/portal-checks/scan-access-logs.mjs','scripts/run-owned-captcha-allowance.mjs','scripts/owned-gateway-redis.mjs','scripts/job-internal-signing.mjs')
    $Paths+=@('scripts/verify-trigger-anomaly-delivery.mjs','scripts/verify-workflow-http-trigger.mjs')
    $Paths+=@('scripts/verify-b2-capabilities.mjs','scripts/verify-b2-signing-modes.mjs','scripts/verify-b2-timer-actions.mjs',
        'scripts/verify-b2-workday-timers.mjs','scripts/verify-b2-instance-states.mjs','scripts/verify-b2-status-ui.mjs','scripts/verify-b2-designer-ui.mjs')
    $Paths+='scripts/repair-b2-definition-fixtures.mjs'
    $Paths+='scripts/b2-mobile-browser.mjs'
    $Paths+='scripts/verify-b2-mobile-monitor.mjs'
    $Paths+='scripts/verify-b1-approval-policies.mjs'
    $Paths+='scripts/verify-b1-designer-ui.mjs'
    $Paths+='scripts/verify-b1-task-controls.mjs'
    $Paths+='scripts/verify-b1-launch-selection.mjs'
    $Paths+='scripts/verify-b1-rejection-strategies.mjs'
    $Paths+='scripts/b1-rejection-ui.mjs'
    $Paths+='scripts/verify-b1-timeout-strategies.mjs'
    $Paths+='scripts/verify-b1-legacy-assignees.mjs'
    $Paths+='scripts/verify-b1-task-semantics.mjs'
    $Paths+='scripts/verify-b1-node-designer-ui.mjs'
    $Paths+='scripts/verify-b1-manual-policy-probe.mjs'
    $Paths+='scripts/verify-b1-manual-required.mjs'
    $Paths+='scripts/verify-b1-legacy-nodes.mjs'
    $Paths+=@('scripts/verify-b2-hr-voting.mjs','scripts/operate-b2-hr-outage.ps1','scripts/restart-isolated-integration-service.ps1')
    $Paths+=@('scripts/verify-a3-transaction-scan.mjs')
    $Paths+=@('scripts/verify-workflow-offboard-delivery.mjs')
    $Paths+=@('scripts/verify-workflow-h-advance-offboard.mjs','scripts/verify-hr-advance-approval-real.mjs','scripts/verify-hr-advance-approval-ui.mjs')
    $Paths+=@($State.services|ForEach-Object{Join-Path $Run "$($_.name)/service.args"; Join-Path $Run "$($_.name)/integration.properties"})
    $Inputs=@($Paths|Sort-Object -Unique|ForEach-Object{[pscustomobject]@{Path=$_;Hash=(Get-FileHash -LiteralPath $_).Hash}})
    $Inputs|ConvertTo-Json|Set-Content -LiteralPath $InputPath -Encoding utf8
    [string[]]$ExtraArguments=@(if($TriggerOnly){'--trigger-only'}; if($TransactionOnly){'--transaction-only'}; if($OffboardOnly){'--offboard-only'})
    & node scripts/verify-batch-g-integration.mjs $StatePath --settlement-schema --contract-performance-only --a3-anomaly-scan @ExtraArguments *> $Log
    $Result=$LASTEXITCODE
    if(@($Inputs|Where-Object{(Get-FileHash -LiteralPath $_.Path).Hash -ne $_.Hash}).Count){throw 'A3 anomaly scan verification or runtime inputs changed'}
    Assert-ProductInputs
    "A3_ANOMALY_SCAN_INPUTS: files=$($Inputs.Count); changed=0; product_changed=0; exit=$Result"|Add-Content -LiteralPath $Log
    Get-Content -LiteralPath $Log|Where-Object{$_ -match '^(PASS |A3_)'}|Select-Object -Last 12
    if($Result -ne 0){throw 'A3 anomaly scan verification failed; original evidence retained'}
    $Content=Get-Content -LiteralPath $Log -Raw
    if($env:CLOUDFLOW_B1_APPROVAL_POLICIES -eq 'manual-required'){
        foreach($Pattern in @('"b1ManualRequired":true','"b1ManualRequiredRestoration":true','"secrets":true','B1_MANUAL_REQUIRED_ACTUAL:','"starts":6','"completions":11','"pageCompletions":4','"traceViews":5','"rejected":3','"legacyRuntimePreserved":true','"legacySaveCleaned":true','"ordinaryApprovalPreserved":true','"forcedWorkflowOutcomeWrites":0','failed=0; requests=')){
            if($Content -notmatch $Pattern){throw 'B1 manual required completion evidence missing'}
        }
        'B1_MANUAL_REQUIRED_RUN_EXIT=0'
        return
    }
    if($env:CLOUDFLOW_B1_APPROVAL_POLICIES -eq 'legacy-nodes'){
        foreach($Pattern in @('"b1LegacyManualCopyNotification":true','"b1LegacyGateways":true','"b1LegacySubprocess":true','"b1LegacyApiScript":true','"b1LegacyTimers":true','"b1LegacyNodesRestoration":true','"secrets":true','B1_LEGACY_NODES_ACTUAL:','"oldModelFieldsOnly":true','"oldTimersNaturallyExpired":2','"actualApiRequests":2','"forcedWorkflowOutcomeWrites":0','failed=0; requests=')){
            if($Content -notmatch $Pattern){throw 'B1 legacy node completion evidence missing'}
        }
        'B1_LEGACY_NODES_RUN_EXIT=0'
        return
    }
    if($env:CLOUDFLOW_B1_APPROVAL_POLICIES -eq 'manual-policy'){
        foreach($Pattern in @('"b1ManualPolicyProbe":true','"b1ManualPolicyRestoration":true','"secrets":true','B1_MANUAL_POLICY_PROBE:','"observations":2','"realStarts":2','"businessAcceptanceComplete":false','"forcedWorkflowOutcomeWrites":0','failed=0; requests=')){
            if($Content -notmatch $Pattern){throw 'B1 manual policy diagnostic evidence missing'}
        }
        'B1_MANUAL_POLICY_PROBE_RUN_EXIT=0'
        return
    }
    if($env:CLOUDFLOW_B1_APPROVAL_POLICIES -eq 'nodes'){
        foreach($Pattern in @('"b1NodeDesignerDesktop":true','"b1NodeDesignerMobileBoundary":true','"b1NodeDesignerRestoration":true','"secrets":true','B1_NODE_DESIGNER_ACTUAL:','"saves":6','"blocked":8','"mobileBoundaryVerified":true','"businessLaunches":0','failed=0; requests=')){
            if($Content -notmatch $Pattern){throw 'B1 other node designer completion evidence missing'}
        }
        'B1_NODE_DESIGNER_RUN_EXIT=0'
        return
    }
    if($env:CLOUDFLOW_B1_APPROVAL_POLICIES -eq 'semantics'){
        foreach($Pattern in @('"b1SemanticsRecords":true','"b1SemanticsDesktop":true','"b1SemanticsMobile":true','"b1SemanticsRestoration":true','"secrets":true','B1_TASK_SEMANTICS_ACTUAL:','"semanticCount":18','"singleEndVerified":true','"repeatedVisitsPreserved":true','"forcedWorkflowOutcomeWrites":0','failed=0; requests=')){
            if($Content -notmatch $Pattern){throw 'B1 task semantics completion evidence missing'}
        }
        $UiResults=@(Get-Content -LiteralPath $Log|Where-Object{$_ -like 'B1_TASK_SEMANTICS_UI: *'}|ForEach-Object{$_.Substring('B1_TASK_SEMANTICS_UI: '.Length)|ConvertFrom-Json})
        if($UiResults.Count -ne 2 -or @($UiResults.device|Sort-Object -Unique).Count -ne 2){throw 'Both task semantics browser results required'}
        foreach($Ui in $UiResults){if($Ui.device -notin @('desktop','mobile') -or $Ui.semantics -ne 18 -or $Ui.screenshots -ne 18 -or $Ui.pageErrors -ne 0 -or -not $Ui.readOnly -or -not $Ui.singleEndVerified -or ($Ui.device -eq 'mobile' -and -not $Ui.actualTouch)){throw 'Incomplete task semantics browser result'}}
        'B1_TASK_SEMANTICS_RUN_EXIT=0'
        return
    }
    if($env:CLOUDFLOW_B1_APPROVAL_POLICIES -eq 'legacy'){
        foreach($Pattern in @('"b1LegacyNineSources":true','"b1LegacyVariants":true','"b1LegacyInvalidVariables":true','"b1LegacyRestoration":true','"secrets":true','B1_LEGACY_ASSIGNEES_ACTUAL:','"sourceCount":9','"realStarts":34','"rejectedStarts":4','"oldModelFieldsOnly":true','failed=0; requests=')){
            if($Content -notmatch $Pattern){throw 'B1 legacy assignee completion evidence missing'}
        }
        'B1_LEGACY_ASSIGNEES_RUN_EXIT=0'
        return
    }
    if($env:CLOUDFLOW_B1_APPROVAL_POLICIES -eq 'timeout'){
        foreach($Pattern in @('"b1TimeoutLinear":true','"b1TimeoutTerminate":true','"b1TimeoutParent":true','"b1TimeoutDegrade":true','"b1TimeoutDefault":true','"b1TimeoutRepeat":true','"b1TimeoutRestoration":true','"secrets":true','B1_TIMEOUT_STRATEGIES_ACTUAL:','"automaticCompleted":7','"strategies":5','failed=0; requests=')){
            if($Content -notmatch $Pattern){throw 'B1 timeout completion evidence missing'}
        }
        'B1_TIMEOUT_STRATEGIES_RUN_EXIT=0'
        return
    }
    if($env:CLOUDFLOW_B1_APPROVAL_POLICIES -in @('rejection','rejection-ui')){
        foreach($Pattern in @('"b1RejectionLinear":true','"b1RejectionTargets":true','"b1RejectionTerminate":true','"b1RejectionParent":true','"b1RejectionDegrade":true','"b1RejectionDefault":true','"b1RejectionLegacy":true','"b1RejectionRestoration":true','"secrets":true','B1_REJECTION_STRATEGIES_ACTUAL:','"strategies":5','failed=0; requests=')){
            if($Content -notmatch $Pattern){throw 'B1 rejection strategy completion evidence missing'}
        }
        if($env:CLOUDFLOW_B1_APPROVAL_POLICIES -eq 'rejection-ui'){
            foreach($Pattern in @('"b1RejectionDesktop":true','"b1RejectionMobile":true')){
                if($Content -notmatch $Pattern){throw 'B1 rejection device completion evidence missing'}
            }
            $UiResults=@(Get-Content -LiteralPath $Log|Where-Object{$_ -like 'B1_REJECTION_UI_ACTUAL: *'}|ForEach-Object{$_.Substring('B1_REJECTION_UI_ACTUAL: '.Length)|ConvertFrom-Json})
            if($UiResults.Count -ne 2 -or @($UiResults.device|Sort-Object -Unique).Count -ne 2){throw 'Both rejection browser results required'}
            foreach($Ui in $UiResults){if($Ui.device -notin @('desktop','mobile') -or $Ui.pageRejections -ne 9 -or $Ui.pageApprovals -ne 4 -or $Ui.traceViews -ne 4 -or $Ui.readResponses -lt 13 -or $Ui.readConflicts -ne 0 -or -not $Ui.returnedFormEdited -or -not $Ui.cancellationChecked -or -not $Ui.reasonRequired -or -not $Ui.upstreamTargetsOnly -or ($Ui.device -eq 'mobile' -and -not $Ui.actualTouch)){throw 'Incomplete rejection browser result'}}
            'B1_REJECTION_UI_RUN_EXIT=0'
        } else {'B1_REJECTION_STRATEGIES_RUN_EXIT=0'}
        return
    }
    if($env:CLOUDFLOW_B1_APPROVAL_POLICIES -eq 'launch'){
        foreach($Pattern in @('"b1LaunchScopes":true','"b1LaunchDrafts":true','"b1LaunchStarts":true','"b1LaunchEmpty":true','"b1LaunchRestoration":true','"secrets":true','B1_LAUNCH_SELECTION_ACTUAL:','"realStarts":12','failed=0; requests=')){
            if($Content -notmatch $Pattern){throw 'B1 launch selection completion evidence missing'}
        }
        'B1_LAUNCH_SELECTION_RUN_EXIT=0'
        return
    }
    if($env:CLOUDFLOW_B1_APPROVAL_POLICIES -eq 'controls'){
        foreach($Pattern in @('"b1ControlsDenials":true','"b1ControlsDefaults":true','"b1ControlsReduction":true','"b1ControlsRollback":true','"b1ControlsCopy":true','"b1ControlsSelection":true','"b1ControlsButtons":true','"b1ControlsUrgeButtons":true','"b1ControlsPendingManagement":true','"pendingReductionButtonsVerified":true','"realPageReductions":2','"b1ControlsRestoration":true','"secrets":true','B1_TASK_CONTROLS_ACTUAL:','failed=0; requests=')){
            if($Content -notmatch $Pattern){throw 'B1 task controls completion evidence missing'}
        }
        'B1_TASK_CONTROLS_RUN_EXIT=0'
        return
    }
    if($env:CLOUDFLOW_B1_APPROVAL_POLICIES -eq 'designer'){
        foreach($Pattern in @('"b1DesignerScope":true','"b1DesignerPolicies":true','"b1DesignerReject":true','"b1DesignerSwitches":true','"b1DesignerTimeout":true','"b1DesignerSettings":true','"b1DesignerRestoration":true','"secrets":true','B1_DESIGNER_UI_ACTUAL:','failed=0; requests=')){
            if($Content -notmatch $Pattern){throw 'B1 designer completion evidence missing'}
        }
        'B1_DESIGNER_RUN_EXIT=0'
        return
    }
    if($env:CLOUDFLOW_B1_APPROVAL_POLICIES -eq '1'){
        foreach($Pattern in @('"b1SelfPolicies":true','"b1SelfLoop":true','"b1ManagerFallbacks":true','"b1ManagerBounds":true','"b1SelectionScope":true','"b1PoliciesRestoration":true','"secrets":true','B1_APPROVAL_POLICIES_ACTUAL:','failed=0; requests=')){
            if($Content -notmatch $Pattern){throw 'B1 approval policy completion evidence missing'}
        }
        'B1_APPROVAL_POLICIES_RUN_EXIT=0'
        return
    }
    if($env:CLOUDFLOW_B2_CAPABILITIES -eq 'hr'){
        foreach($Pattern in @('"b2HrOnly":true','"definitionFixtureArchive":true','"secrets":true','"hrLevelVotes":true',
            '"hrOutageVotes":true','"hrOutageNotice":true','"hrRecoveredVotes":true','"hrVotingRestoration":true','failed=0; requests=')){
            if($Content -notmatch $Pattern){throw 'B2 real HR focus completion evidence missing'}
        }
        'B2_HR_ONLY_RUN_EXIT=0'
        return
    }
    if($env:CLOUDFLOW_B2_CAPABILITIES -eq 'designer'){
        foreach($Pattern in @('"b2DesignerOnly":true','"definitionFixtureArchive":true','"secrets":true',
            '"b2DesignerSettings":true','"b2DesignerRestoration":true','failed=0; requests=')){
            if($Content -notmatch $Pattern){throw 'B2 designer focus completion evidence missing'}
        }
        'B2_DESIGNER_ONLY_RUN_EXIT=0'
        return
    }
    if($env:CLOUDFLOW_B2_CAPABILITIES -eq 'ui'){
        foreach($Pattern in @('"b2UiCapabilities":true','"definitionFixtureArchive":true','"secrets":true','"instanceStateActions":true',
            '"instanceStateDenials":true','"draftStoredSeparately":true','"instanceStateMonitorApi":true','"instanceStateBrowser":true',
            '"instanceStatesRestoration":true','"instanceStateMobileMonitor":true','"b2DesignerSettings":true','"b2DesignerRestoration":true','failed=0; requests=')){
            if($Content -notmatch $Pattern){throw 'B2 UI focus completion evidence missing'}
        }
        'B2_UI_CAPABILITIES_RUN_EXIT=0'
        return
    }
    if($env:CLOUDFLOW_B2_CAPABILITIES -eq '1'){
        foreach($Pattern in @('"hrLevelVotes":true','"hrOutageVotes":true','"hrOutageNotice":true','"hrRecoveredVotes":true','"hrVotingRestoration":true')){
            if($Content -notmatch $Pattern){throw 'Actual HR voting or restoration evidence missing'}
        }
        if($Content -notmatch '"definitionFixtureArchive":true'){throw 'Owned definition fixture archive repair incomplete'}
        foreach($Pattern in @('"b2Capabilities":true','"signingWeightPass":true','"signingWeightReject":true','"signingFourModes":true','"signingRepeat":true','"signingRestoration":true',
            '"timerInvalidation":true','"timerManual":true','"timerPostActionScan":true','"timerActionsRestoration":true',
            '"workdayTimerDates":true','"workdayTimerRestoration":true','"instanceStateActions":true','"instanceStateDenials":true','"draftStoredSeparately":true',
            '"instanceStateMonitorApi":true','"instanceStateBrowser":true','"instanceStateMobileMonitor":true','"instanceStatesRestoration":true','"b2DesignerSettings":true','"b2DesignerRestoration":true')){
            if($Content -notmatch $Pattern){throw 'Actual B2 capability completion evidence missing'}
        }
    }
    if($OffboardOnly){
        foreach($Pattern in @('"hAdvanceDirect":true','"hAdvanceReleased":true','"hAdvanceHr":true','"hAdvanceRepeat":true','"hAdvanceRestoration":true')){
            if($Content -notmatch $Pattern){throw 'Actual frozen advance offboard verification incomplete'}
        }
        foreach($Pattern in @('"offboardOnly":true','"offboardCapacityRestoration":true','"offboardRelease":true','"offboardRollback":true','"offboardRecovery":true','"offboardSuccessorRead":true','"offboardRepeat":true','"offboardLegacy":true','"offboardRestoration":true','"secrets":true','failed=0; requests=')){
            if($Content -notmatch $Pattern){throw 'Actual offboard handover verification incomplete'}
        }
        'A3_OFFBOARD_RUN_EXIT=0'
        return
    }
    if($TransactionOnly){
        foreach($Pattern in @('"transactionOnly":true','"counts":true','"failure":true','"retention":true','"alarm":true','"recovery":true','"repeat":true','"permissions":true','"restoration":true','"secrets":true','"asyncRollback":true','"asyncDelivery":true','"cleanupFailure":true','"cleanupRecovery":true','"demoRestoration":true','failed=0; requests=')){
            if($Content -notmatch $Pattern){throw 'Actual transaction task verification incomplete'}
        }
        'A3_TRANSACTION_SCAN_RUN_EXIT=0'
        return
    }
    if(-not $TriggerOnly -and $Content -notmatch '"disabledCapacityRestoration":true'){throw 'Owned disabled-user capacity restoration missing'}
    foreach($Pattern in @('"triggerLongTitle":true','"triggerDelivery":true','"triggerRollback":true','"triggerStatsRollback":true','"triggerRecovery":true','"triggerRepeat":true','"triggerRestoration":true')) {
        if($Content -notmatch $Pattern){throw 'Actual trigger anomaly checks incomplete'}
    }
    $Required=if($TriggerOnly){@('"triggerOnly":true','"secrets":true','"httpAddressProtection":true','"httpSyncSuccess":true','"httpFailureStrategies":true','"httpReplay":true','"httpNoRedirect":true','"httpTimeout":true','"httpAsyncSuccess":true','"httpRestoration":true','failed=0; requests=')}else{@('"counts":true','"failure":true','"retention":true','"alarm":true','"recovery":true','"repeat":true','"permissions":true','"restoration":true','"secrets":true','"eventRollback":true','"eventDelivery":true','"eventRestoration":true','"disabledFailure":true','"disabledRollback":true','"disabledRecovery":true','"disabledDelivery":true','"disabledRepeat":true','"disabledRestoration":true','failed=0; requests=')}
    foreach($Pattern in $Required) {
        if($Content -notmatch $Pattern){throw 'A3 anomaly scan completion evidence missing'}
    }
    'A3_ANOMALY_SCAN_RUN_EXIT=0'
} finally { Pop-Location }
