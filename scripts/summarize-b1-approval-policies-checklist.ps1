param([ValidatePattern('^r[1-9][0-9]*$')][string]$RuntimeRound='r40',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$AdjacentRound='r38',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$BackendRound='r62',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$FrontendRound='r10',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$RulesRound='r11',
    [ValidateSet('Policies','Designer','Controls','Launch','Rejection','RejectionUi','Timeout','Legacy','Semantics','Nodes','LegacyNodes')][string]$Focus='Policies',
    [switch]$PendingManagement)
$ErrorActionPreference='Stop'
$Root='D:\CloudFlowPro'
. (Join-Path $Root '.cloudflow-runtime/use-data-drive.ps1')
$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
function Require-Markers([string]$File,[string[]]$Markers){
    $Content=Get-Content -LiteralPath (Join-Path $Evidence $File) -Raw
    foreach($Marker in $Markers){if($Content -notmatch $Marker){throw "Required evidence missing: $File"}}
    "B1_APPROVAL_EVIDENCE: file=$File; markers=true"
}
function Assert-Inputs([string]$File){
    $Inputs=@(Get-Content -LiteralPath (Join-Path $Evidence $File) -Raw|ConvertFrom-Json)
    if(-not $Inputs.Count){throw 'Nonempty snapshot required'}
    foreach($Item in $Inputs){$Path=if([IO.Path]::IsPathRooted($Item.Path)){$Item.Path}else{Join-Path $Root $Item.Path};if((Get-FileHash -LiteralPath $Path).Hash -ne $Item.Hash){throw "Input differs: $File"}}
    "B1_APPROVAL_INPUTS: file=$File; files=$($Inputs.Count); changed=0"
}
Require-Markers "h3-portal-finance-20261002-backend-$BackendRound.log" @('BUILD SUCCESS','\[static-rules\] no findings','FINANCE_BUILD: phase=Backend; files=[1-9][0-9]*; changed=0; exit=0')
Require-Markers "h3-portal-finance-20261002-frontend-$FrontendRound.log" @('> tsc --noEmit','built in ','FINANCE_BUILD: phase=Frontend; files=1475; changed=0; exit=0')
Assert-Inputs "h3-portal-finance-20261002-backend-$BackendRound-inputs.json"
Assert-Inputs "h3-portal-finance-20261002-frontend-$FrontendRound-inputs.json"
$Adjacent="h3-portal-finance-adjacent-20261002-$AdjacentRound"
Require-Markers "$Adjacent/summary.log" @('regenerated_matches_formal=true; formal_modified=false','changed=0; exit=0; production_modified=false')
Require-Markers "$Adjacent/oa-database.log" @('Complete approved schema table count; expected=374; actual=374')
$OaContent=Get-Content -LiteralPath (Join-Path $Evidence "$Adjacent/oa-database.log") -Raw
$OaMatches=[regex]::Matches($OaContent,'(?m)^PASS: ([0-9]+) OA boundary assertions\r?$')
$InvoiceMatches=[regex]::Matches($OaContent,'(?m)^H3_INVOICE_RECEIPT_OA_DATABASE_CHECKS: assertions=([0-9]+); failed=0; concurrency_groups=3;')
if($OaMatches.Count -ne 1 -or $InvoiceMatches.Count -ne 1){throw 'Unique OA and invoice receipt completion results required'}
$OaAssertions=[int]$OaMatches[0].Groups[1].Value
$InvoiceAssertions=[int]$InvoiceMatches[0].Groups[1].Value
$ReceiptCallbacks=[regex]::Matches($OaContent,'发票已保存，CRM待消费持久来源:').Count
# The bind/delete race performs one additional committed-source assertion when binding wins.
if($InvoiceAssertions -notin @(126,127) -or $InvoiceAssertions -ne 116+$ReceiptCallbacks -or $OaAssertions -ne 886+$InvoiceAssertions){throw 'OA assertion totals differ from the verified invoice race branches'}
"B1_APPROVAL_OA_COUNTS: assertions=$OaAssertions; invoice_receipt_assertions=$InvoiceAssertions; receipt_callbacks=$ReceiptCallbacks; fixed_other_assertions=886; reconciled=true"
Require-Markers "$Adjacent/sources.log" @('MP_SQL_LAST_APPLY: matches=0','MYBATIS_ANNOTATION_SQL: matches=0','login_only_external_endpoints=0','JAVA_PERMISSION_PREFIXES:.*invalid=0','STATIC_WHITELIST:.*stale_lines=0','EXIT_CODE=0')
Require-Markers "$Adjacent/menu.log" @('EMPLOYEE_UNEXPECTED_GRANTS=0; EMPLOYEE_UNEXPECTED_WRITE_PERMISSIONS=0','APPROVED_MENU_SCOPE_PASS=true')
Assert-Inputs "$Adjacent/inputs.json"
$Rules="a3-timer-scan-checks-20261003-$RulesRound"
Require-Markers "$Rules/timer.log" @('TIMER_SCAN_CHECKS: checks=[1-9][0-9]*; failed=0;')
Require-Markers "$Rules/batch-b.log" @('PASS: [1-9][0-9]* workflow batch B checks')
Require-Markers "$Rules/java-types.log" @('inferred_declarations=0;')
Assert-Inputs "$Rules/inputs.json"
$Runtime="a3-anomaly-scan-20261003-http-$RuntimeRound.log"
if($Focus -eq 'LegacyNodes'){
Require-Markers $Runtime @('A3_ANOMALY_SCAN_REAL_RESULT: checks=[1-9][0-9]*; failed=0; requests=[1-9][0-9]*;',
    '"b1LegacyManualCopyNotification":true','"b1LegacyGateways":true','"b1LegacySubprocess":true','"b1LegacyApiScript":true','"b1LegacyTimers":true','"b1LegacyNodesRestoration":true','"secrets":true',
    '"leaks":0','"databaseLeaks":0','A3_ANOMALY_SCAN_INPUTS: files=53; changed=0; product_changed=0; exit=0')
$ActualResults=@(Get-Content -LiteralPath (Join-Path $Evidence $Runtime)|Where-Object{$_ -like 'B1_LEGACY_NODES_ACTUAL: *'}|ForEach-Object{$_.Substring('B1_LEGACY_NODES_ACTUAL: '.Length)|ConvertFrom-Json})
if($ActualResults.Count -ne 1){throw 'Unique legacy node actual result required'}
$Actual=$ActualResults[0]
if($Actual.realStarts -ne 10 -or $Actual.instances -ne 12 -or $Actual.humanCompletions -ne 15 -or $Actual.traceChecks -ne 13 -or $Actual.oldTimersNaturallyExpired -ne 2 -or $Actual.actualTimerScans -ne 2 -or $Actual.actualApiRequests -ne 2 -or -not $Actual.oldModelFieldsOnly -or -not $Actual.manualSelfPolicyDecisionSeparate -or $Actual.forcedWorkflowOutcomeWrites -ne 0){throw 'Incomplete legacy node actual behavior'}
if(($Actual.nodeTypes|Sort-Object) -join ',' -ne 'CONDITION,COPY,MANUAL,NOTIFICATION,PARALLEL,SCRIPT,SUBPROCESS,TIMER'){throw 'All eight legacy node types required'}
Require-Markers "b1-legacy-nodes-actual-launch-20261005-$RuntimeRound.log" @('B1_LEGACY_NODES_RUN_EXIT=0',
    'OWNED_CAPTCHA_RESTORED: original_limit=100; original_ttl=-1;','counter_writes=0; database_unchanged=true; production_modified=false')
} elseif($Focus -eq 'Nodes'){
Require-Markers $Runtime @('A3_ANOMALY_SCAN_REAL_RESULT: checks=[1-9][0-9]*; failed=0; requests=[1-9][0-9]*;',
    '"b1NodeDesignerDesktop":true','"b1NodeDesignerMobileBoundary":true','"b1NodeDesignerRestoration":true','"secrets":true',
    'B1_NODE_DESIGNER_ACTUAL:','"saves":6','"blocked":8','"nodeTypes":6','"businessLaunches":0','"executionPolicyVerified":false',
    '"leaks":0','"databaseLeaks":0','A3_ANOMALY_SCAN_INPUTS: files=51; changed=0; product_changed=0; exit=0')
$UiResults=@(Get-Content -LiteralPath (Join-Path $Evidence $Runtime)|Where-Object{$_ -like 'B1_NODE_DESIGNER_UI: *'}|ForEach-Object{$_.Substring('B1_NODE_DESIGNER_UI: '.Length)|ConvertFrom-Json})
if($UiResults.Count -ne 1 -or $UiResults[0].device -ne 'desktop'){throw 'Desktop other-node designer browser result required'}
foreach($Ui in $UiResults){if($Ui.nodeTypes -ne 6 -or $Ui.saves -ne 6 -or $Ui.blocked -ne 8 -or $Ui.pageErrors -ne 0 -or $Ui.executionPolicyVerified){throw 'Incomplete other-node designer browser result'}}
$MobileResults=@(Get-Content -LiteralPath (Join-Path $Evidence $Runtime)|Where-Object{$_ -like 'B1_NODE_DESIGNER_MOBILE_BOUNDARY: *'}|ForEach-Object{$_.Substring('B1_NODE_DESIGNER_MOBILE_BOUNDARY: '.Length)|ConvertFrom-Json})
if($MobileResults.Count -ne 1 -or $MobileResults[0].routes -ne 2 -or $MobileResults[0].refreshes -ne 2 -or -not $MobileResults[0].actualTouch -or $MobileResults[0].editorRequests -ne 0 -or $MobileResults[0].editingSupported -or -not $MobileResults[0].unchanged -or $MobileResults[0].pageErrors -ne 0){throw 'Mobile designer boundary result required'}
Require-Markers "b1-node-designer-actual-launch-20261005-$RuntimeRound.log" @('B1_NODE_DESIGNER_RUN_EXIT=0',
    'OWNED_CAPTCHA_RESTORED: original_limit=100; original_ttl=-1;','counter_writes=0; database_unchanged=true; production_modified=false')
} elseif($Focus -eq 'Semantics'){
Require-Markers $Runtime @('A3_ANOMALY_SCAN_REAL_RESULT: checks=[1-9][0-9]*; failed=0; requests=[1-9][0-9]*;',
    '"b1SemanticsRecords":true','"b1SemanticsDesktop":true','"b1SemanticsMobile":true','"b1SemanticsRestoration":true','"secrets":true',
    'B1_TASK_SEMANTICS_ACTUAL:','"semanticCount":18','"singleEndVerified":true','"repeatedVisitsPreserved":true','"copyUsesPersistedNode":true','"timeoutEvidenceSeparate":true','"forcedWorkflowOutcomeWrites":0',
    '"leaks":0','"databaseLeaks":0','A3_ANOMALY_SCAN_INPUTS: files=50; changed=0; product_changed=0; exit=0')
$UiResults=@(Get-Content -LiteralPath (Join-Path $Evidence $Runtime)|Where-Object{$_ -like 'B1_TASK_SEMANTICS_UI: *'}|ForEach-Object{$_.Substring('B1_TASK_SEMANTICS_UI: '.Length)|ConvertFrom-Json})
if($UiResults.Count -ne 2 -or @($UiResults.device|Sort-Object -Unique).Count -ne 2){throw 'Both task semantics browser results required'}
foreach($Ui in $UiResults){if($Ui.device -notin @('desktop','mobile') -or $Ui.semantics -ne 18 -or $Ui.screenshots -ne 18 -or $Ui.pageErrors -ne 0 -or -not $Ui.readOnly -or -not $Ui.singleEndVerified -or ($Ui.device -eq 'mobile' -and -not $Ui.actualTouch)){throw 'Incomplete task semantics browser result'}}
Require-Markers "b1-semantics-actual-launch-20261005-$RuntimeRound.log" @('B1_TASK_SEMANTICS_RUN_EXIT=0',
    'OWNED_CAPTCHA_RESTORED: original_limit=100; original_ttl=-1;','counter_writes=0; database_unchanged=true; production_modified=false')
} elseif($Focus -eq 'Legacy'){
Require-Markers $Runtime @('A3_ANOMALY_SCAN_REAL_RESULT: checks=[1-9][0-9]*; failed=0; requests=[1-9][0-9]*;',
    '"b1LegacyNineSources":true','"b1LegacyVariants":true','"b1LegacyInvalidVariables":true','"b1LegacyRestoration":true','"secrets":true',
    'B1_LEGACY_ASSIGNEES_ACTUAL:','"sourceCount":9','"variants":8','"realStarts":34','"humanCompletions":41','"traceChecks":34','"rejectedStarts":4',
    '"oldModelFieldsOnly":true','"roleOverlapDeduplicated":true','"legacyUnvotedCancelled":true','"variableArrayDeduplicated":true','"forcedWorkflowOutcomeWrites":0',
    '"leaks":0','"databaseLeaks":0','A3_ANOMALY_SCAN_INPUTS: files=49; changed=0; product_changed=0; exit=0')
Require-Markers "b1-legacy-actual-launch-20261005-$RuntimeRound.log" @('B1_LEGACY_ASSIGNEES_RUN_EXIT=0',
    'OWNED_CAPTCHA_RESTORED: original_limit=100; original_ttl=-1;','counter_writes=0; database_unchanged=true; production_modified=false')
} elseif($Focus -eq 'Timeout'){
Require-Markers $Runtime @('A3_ANOMALY_SCAN_REAL_RESULT: checks=[1-9][0-9]*; failed=0; requests=[1-9][0-9]*;',
    '"b1TimeoutLinear":true','"b1TimeoutTerminate":true','"b1TimeoutParent":true','"b1TimeoutDegrade":true',
    '"b1TimeoutDefault":true','"b1TimeoutRepeat":true','"b1TimeoutRestoration":true','"secrets":true',
    'B1_TIMEOUT_STRATEGIES_ACTUAL:','"automaticCompleted":7','"autoRejections":6','"defaultAutoPass":1','"strategies":5','"forcedWorkflowOutcomeWrites":0',
    '"leaks":0','"databaseLeaks":0','A3_ANOMALY_SCAN_INPUTS: files=48; changed=0; product_changed=0; exit=0')
Require-Markers "b1-timeout-actual-launch-20261005-$RuntimeRound.log" @('B1_TIMEOUT_STRATEGIES_RUN_EXIT=0',
    'OWNED_CAPTCHA_RESTORED: original_limit=100; original_ttl=-1;','counter_writes=0; database_unchanged=true; production_modified=false')
} elseif($Focus -eq 'RejectionUi'){
Require-Markers $Runtime @('A3_ANOMALY_SCAN_REAL_RESULT: checks=[1-9][0-9]*; failed=0; requests=[1-9][0-9]*;',
    '"b1RejectionLinear":true','"b1RejectionTargets":true','"b1RejectionTerminate":true','"b1RejectionParent":true',
    '"b1RejectionDegrade":true','"b1RejectionDefault":true','"b1RejectionLegacy":true','"b1RejectionRestoration":true','"secrets":true',
    '"b1RejectionDesktop":true','"b1RejectionMobile":true','"uiVerified":true','"parentEndedNaturally":true','"forcedWorkflowOutcomeWrites":0',
    '"leaks":0','"databaseLeaks":0','A3_ANOMALY_SCAN_INPUTS: files=47; changed=0; product_changed=0; exit=0')
$UiResults=@(Get-Content -LiteralPath (Join-Path $Evidence $Runtime)|Where-Object{$_ -like 'B1_REJECTION_UI_ACTUAL: *'}|ForEach-Object{$_.Substring('B1_REJECTION_UI_ACTUAL: '.Length)|ConvertFrom-Json})
if($UiResults.Count -ne 2 -or @($UiResults.device|Sort-Object -Unique).Count -ne 2){throw 'Both rejection browser results required'}
foreach($Ui in $UiResults){if($Ui.device -notin @('desktop','mobile') -or $Ui.pageRejections -ne 9 -or $Ui.pageApprovals -ne 4 -or $Ui.traceViews -ne 4 -or $Ui.readResponses -lt 13 -or $Ui.readConflicts -ne 0 -or -not $Ui.returnedFormEdited -or -not $Ui.cancellationChecked -or -not $Ui.reasonRequired -or -not $Ui.upstreamTargetsOnly -or ($Ui.device -eq 'mobile' -and -not $Ui.actualTouch)){throw 'Incomplete rejection browser result'}}
Require-Markers "b1-rejection-ui-actual-launch-20261005-$RuntimeRound.log" @('B1_REJECTION_UI_RUN_EXIT=0',
    'OWNED_CAPTCHA_RESTORED: original_limit=100; original_ttl=-1;','counter_writes=0; database_unchanged=true; production_modified=false')
} elseif($Focus -eq 'Rejection'){
Require-Markers $Runtime @('A3_ANOMALY_SCAN_REAL_RESULT: checks=[1-9][0-9]*; failed=0; requests=[1-9][0-9]*;',
    '"b1RejectionLinear":true','"b1RejectionTargets":true','"b1RejectionTerminate":true','"b1RejectionParent":true',
    '"b1RejectionDegrade":true','"b1RejectionDefault":true','"b1RejectionLegacy":true','"b1RejectionRestoration":true','"secrets":true',
    'B1_REJECTION_STRATEGIES_ACTUAL:','"strategies":5','"uiVerified":false','"parentEndedNaturally":true','"forcedWorkflowOutcomeWrites":0',
    '"leaks":0','"databaseLeaks":0','A3_ANOMALY_SCAN_INPUTS: files=46; changed=0; product_changed=0; exit=0')
Require-Markers "b1-rejection-actual-launch-20261005-$RuntimeRound.log" @('B1_REJECTION_STRATEGIES_RUN_EXIT=0',
    'OWNED_CAPTCHA_RESTORED: original_limit=100; original_ttl=-1;','counter_writes=0; database_unchanged=true; production_modified=false')
} elseif($Focus -eq 'Launch'){
Require-Markers $Runtime @('A3_ANOMALY_SCAN_REAL_RESULT: checks=[1-9][0-9]*; failed=0; requests=[1-9][0-9]*;',
    '"b1LaunchScopes":true','"b1LaunchDrafts":true','"b1LaunchStarts":true','"b1LaunchEmpty":true','"b1LaunchRestoration":true','"secrets":true',
    'B1_LAUNCH_SELECTION_ACTUAL:','"realStarts":12','"desktopBrowser":true','"mobileBrowser":true','"candidateScopes":4',
    '"orderedSelection":true','"draftRestorationViaCatalog":true','"draftRestorationViaList":true','"forcedWorkflowOutcomeWrites":0',
    '"leaks":0','"databaseLeaks":0','A3_ANOMALY_SCAN_INPUTS: files=45; changed=0; product_changed=0; exit=0')
Require-Markers "b1-launch-actual-launch-20261004-$RuntimeRound.log" @('B1_LAUNCH_SELECTION_RUN_EXIT=0',
    'OWNED_CAPTCHA_RESTORED: original_limit=100; original_ttl=-1;','counter_writes=0; database_unchanged=true; production_modified=false')
} elseif($Focus -eq 'Controls'){
Require-Markers $Runtime @('A3_ANOMALY_SCAN_REAL_RESULT: checks=[1-9][0-9]*; failed=0; requests=[1-9][0-9]*;',
    '"b1ControlsDenials":true','"b1ControlsDefaults":true','"b1ControlsReduction":true','"b1ControlsRollback":true',
    '"b1ControlsCopy":true','"b1ControlsSelection":true','"b1ControlsButtons":true','"b1ControlsUrgeButtons":true','"b1ControlsRestoration":true','"secrets":true',
    'B1_TASK_CONTROLS_ACTUAL:','"desktopBrowser":true','"mobileBrowser":true','"urgeButtonsVerified":true','"forcedWorkflowOutcomeWrites":0',
    '"leaks":0','"databaseLeaks":0','A3_ANOMALY_SCAN_INPUTS: files=44; changed=0; product_changed=0; exit=0')
Require-Markers "b1-controls-actual-launch-20261004-$RuntimeRound.log" @('B1_TASK_CONTROLS_RUN_EXIT=0',
    'OWNED_CAPTCHA_RESTORED: original_limit=100; original_ttl=-1;','counter_writes=0; database_unchanged=true; production_modified=false')
if($PendingManagement){Require-Markers $Runtime @('"b1ControlsPendingManagement":true','"pendingReductionButtonsVerified":true','"realPageReductions":2')}
} elseif($Focus -eq 'Designer'){
Require-Markers $Runtime @('A3_ANOMALY_SCAN_REAL_RESULT: checks=[1-9][0-9]*; failed=0; requests=[1-9][0-9]*;',
    '"b1DesignerScope":true','"b1DesignerPolicies":true','"b1DesignerReject":true','"b1DesignerSwitches":true',
    '"b1DesignerTimeout":true','"b1DesignerSettings":true','"b1DesignerRestoration":true','"secrets":true',
    'B1_DESIGNER_UI_ACTUAL:','"realEditorSaves":21','"originalRoleKeyPreserved":true','"desktopBrowser":true','"mobileBrowser":false',
    '"leaks":0','"databaseLeaks":0','A3_ANOMALY_SCAN_INPUTS: files=43; changed=0; product_changed=0; exit=0')
Require-Markers "b1-designer-actual-launch-20261004-$RuntimeRound.log" @('B1_DESIGNER_RUN_EXIT=0',
    'OWNED_CAPTCHA_RESTORED: original_limit=100; original_ttl=-1;','counter_writes=0; database_unchanged=true; production_modified=false')
} else {
Require-Markers $Runtime @('A3_ANOMALY_SCAN_REAL_RESULT: checks=[1-9][0-9]*; failed=0; requests=[1-9][0-9]*;',
    '"b1SelfPolicies":true','"b1SelfLoop":true','"b1ManagerFallbacks":true','"b1ManagerBounds":true',
    '"b1SelectionScope":true','"b1PoliciesRestoration":true','"secrets":true',
    'B1_APPROVAL_POLICIES_ACTUAL:','"forcedWorkflowOutcomeWrites":0','"uiVerified":false',
    '"leaks":0','"databaseLeaks":0','A3_ANOMALY_SCAN_INPUTS: files=42; changed=0; product_changed=0; exit=0')
Require-Markers "b1-approval-policies-actual-launch-20261004-$RuntimeRound.log" @('B1_APPROVAL_POLICIES_RUN_EXIT=0',
    'OWNED_CAPTCHA_RESTORED: original_limit=100; original_ttl=-1;','counter_writes=0; database_unchanged=true; production_modified=false')
}
Assert-Inputs "a3-anomaly-scan-20261003-inputs-$RuntimeRound.json"
if($Focus -in @('Semantics','Nodes','LegacyNodes')){
Require-Markers 'b1-semantics-restart-workflow-20261005-r1.log' @('ISOLATED_RESTART_READY: service=workflow;')
Require-Markers "$Rules/batch-b.log" @('WORKFLOW_NODE_EVENT_ORDERING: checks=25; workers=4; committed_transactions=32; rollback_writes=0; repeated_visits_preserved=true')
} elseif($Focus -in @('RejectionUi','Timeout','Legacy')){
Require-Markers 'b1-rejection-ui-restart-workflow-20261005-r1.log' @('ISOLATED_RESTART_READY: service=workflow;')
} elseif($Focus -eq 'Rejection'){
Require-Markers 'b1-rejection-restart-workflow-20261005-r1.log' @('ISOLATED_RESTART_READY: service=workflow;')
} elseif($Focus -in @('Controls','Launch')){
Require-Markers 'b1-controls-restart-workflow-20261004-r2.log' @('ISOLATED_RESTART_READY: service=workflow;')
} else {
Require-Markers 'b1-approval-restart-workflow-20261004-r2.log' @('ISOLATED_RESTART_READY: service=workflow;')
}
$State=Get-Content -LiteralPath (Join-Path $Root '.cloudflow-runtime/batch-g-integration/9799534e1a3a47b5958330f14ae16dc7/state.json') -Raw|ConvertFrom-Json
if($State.status -ne 'RUNNING' -or $State.processes.Count -ne 9 -or $State.services.Count -ne 6){throw 'Owned environment incomplete'}
foreach($Entry in $State.processes){$Observed=Get-CimInstance Win32_Process -Filter "ProcessId=$($Entry.id)";if(-not $Observed -or -not $Observed.CommandLine.Contains($Entry.marker)){throw 'Owned process identity mismatch'}}
foreach($Service in $State.services){$Health=Invoke-RestMethod -Uri "http://127.0.0.1:$($Service.healthPort)/actuator/health" -TimeoutSec 15;if($Health.status -ne 'UP'){throw 'Owned service unhealthy'}}
$Items=@('maven-install-and-static-rules','frontend-types','frontend-build','formal-schema-374','menu-scope',
    'employee-grants','sql-concatenation','external-endpoint-protection','mybatis-last-apply','annotation-sql',
    'permission-prefixes','secret-protection-and-runtime-scan','static-whitelist','regenerated-demo')
foreach($Item in $Items){"B1_APPROVAL_CHECKLIST_ITEM: item=$Item; passed=true"}
if($Focus -eq 'LegacyNodes'){
'B1_LEGACY_NODES_RESTORATION: owned_processes=9; healthy_services=6; verification_inputs=53; permissions_and_configuration_unchanged=true'
"B1_LEGACY_NODES_CHECKLIST: items=$($Items.Count); missing=0; adjacent_database_checks=$OaAssertions; node_types=8; natural_expiry_timers=2; manual_self_policy_decision_separate=true; complete_35_prd=false; production_modified=false"
} elseif($Focus -eq 'Nodes'){
'B1_NODE_DESIGNER_RESTORATION: owned_processes=9; healthy_services=6; verification_inputs=51; identity_and_permissions_unchanged=true'
"B1_NODE_DESIGNER_CHECKLIST: items=$($Items.Count); missing=0; adjacent_database_checks=$OaAssertions; node_types=6; desktop_verified=true; mobile_boundary_verified=true; mobile_editing_supported=false; execution_policy_verified=false; complete_35_prd=false; production_modified=false"
} elseif($Focus -eq 'Semantics'){
'B1_SEMANTICS_RESTORATION: owned_processes=9; healthy_services=6; verification_inputs=50; identity_and_permissions_unchanged=true'
"B1_SEMANTICS_CHECKLIST: items=$($Items.Count); missing=0; adjacent_database_checks=$OaAssertions; task_semantics=18; desktop_verified=true; mobile_verified=true; complete_35_prd=false; production_modified=false"
} elseif($Focus -eq 'Legacy'){
'B1_LEGACY_RESTORATION: owned_processes=9; healthy_services=6; verification_inputs=49; identity_and_permissions_unchanged=true'
"B1_LEGACY_CHECKLIST: items=$($Items.Count); missing=0; adjacent_database_checks=$OaAssertions; original_sources=9; variants=8; complete_35_prd=false; production_modified=false"
} elseif($Focus -eq 'Timeout'){
'B1_TIMEOUT_RESTORATION: owned_processes=9; healthy_services=6; verification_inputs=48; identity_and_permissions_unchanged=true'
"B1_TIMEOUT_CHECKLIST: items=$($Items.Count); missing=0; adjacent_database_checks=$OaAssertions; actual_auto_rejections=6; default_auto_pass=1; complete_35_prd=false; production_modified=false"
} elseif($Focus -eq 'RejectionUi'){
'B1_REJECTION_UI_RESTORATION: owned_processes=9; healthy_services=6; verification_inputs=47; identity_and_permissions_unchanged=true'
"B1_REJECTION_UI_CHECKLIST: items=$($Items.Count); missing=0; adjacent_database_checks=$OaAssertions; desktop_verified=true; mobile_verified=true; complete_35_prd=false; production_modified=false"
} elseif($Focus -eq 'Rejection'){
'B1_REJECTION_RESTORATION: owned_processes=9; healthy_services=6; verification_inputs=46; identity_and_permissions_unchanged=true'
"B1_REJECTION_CHECKLIST: items=$($Items.Count); missing=0; adjacent_database_checks=$OaAssertions; ui_verified=false; complete_35_prd=false; production_modified=false"
} elseif($Focus -eq 'Launch'){
'B1_LAUNCH_RESTORATION: owned_processes=9; healthy_services=6; verification_inputs=45; identity_and_permissions_restored=true'
"B1_LAUNCH_CHECKLIST: items=$($Items.Count); missing=0; adjacent_database_checks=$OaAssertions; desktop_verified=true; mobile_verified=true; complete_35_prd=false; production_modified=false"
} elseif($Focus -eq 'Controls'){
'B1_CONTROLS_RESTORATION: owned_processes=9; healthy_services=6; verification_inputs=44; identity_and_permissions_unchanged=true'
"B1_CONTROLS_CHECKLIST: items=$($Items.Count); missing=0; adjacent_database_checks=$OaAssertions; desktop_verified=true; mobile_verified=true; complete_35_prd=false; production_modified=false"
} elseif($Focus -eq 'Designer'){
'B1_DESIGNER_RESTORATION: owned_processes=9; healthy_services=6; verification_inputs=43; original_permissions_unchanged=true'
"B1_DESIGNER_CHECKLIST: items=$($Items.Count); missing=0; adjacent_database_checks=$OaAssertions; desktop_verified=true; mobile_verified=false; complete_35_prd=false; production_modified=false"
} else {
'B1_APPROVAL_RESTORATION: owned_processes=9; healthy_services=6; verification_inputs=42; identity_and_permissions_restored=true'
"B1_APPROVAL_CHECKLIST: items=$($Items.Count); missing=0; adjacent_database_checks=$OaAssertions; ui_verified=false; complete_35_prd=false; production_modified=false"
}
