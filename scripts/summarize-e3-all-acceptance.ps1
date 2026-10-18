param([ValidatePattern('^r[1-9][0-9]*$')][string]$Round='r1',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$IndependentRound='r18',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$AdjacentRound='r182',
    [Parameter(Mandatory=$true)][ValidateRange(1,2147483647)][int]$IndependentSessionId,
    [Parameter(Mandatory=$true)][ValidatePattern('^[a-f0-9]+$')][string]$IndependentTerminalChunk,
    [Parameter(Mandatory=$true)][ValidateRange(1,2147483647)][int]$AdjacentSessionId,
    [Parameter(Mandatory=$true)][ValidatePattern('^[a-f0-9]+$')][string]$AdjacentTerminalChunk)
$ErrorActionPreference='Stop'
. 'D:\CloudFlowPro\.cloudflow-runtime\use-data-drive.ps1'
$Root='D:\CloudFlowPro'
$CacheRoot='D:\CloudFlowProCache'
$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
$Reference=Join-Path $Root '.cloudflow-runtime/batch-g-integration/9799534e1a3a47b5958330f14ae16dc7'
$Output=Join-Path $Evidence "e3-all-acceptance-20261010-$Round"
if(Test-Path -LiteralPath $Output){throw 'Retain original E3 reconciliation evidence'}
[IO.Directory]::CreateDirectory($Output)|Out-Null
[IO.File]::Copy($PSCommandPath,(Join-Path $Output 'original.ps1'),$false)
$Inputs=@{}
$Archives=@{}
$Bindings=[Collections.Generic.List[object]]::new()
function Require([bool]$Condition,[string]$Message){if(-not $Condition){throw $Message}}
function Full([string]$File){[IO.Path]::GetFullPath($File,$Root)}
function Json([string]$File){Get-Content -LiteralPath $File -Raw|ConvertFrom-Json -Depth 100}
function Hash([string]$File){
    $Before=Get-Item -LiteralPath $File
    $Length=$Before.Length;$Written=$Before.LastWriteTimeUtc
    $Stream=[IO.File]::Open($File,[IO.FileMode]::Open,[IO.FileAccess]::Read,([IO.FileShare]::ReadWrite -bor [IO.FileShare]::Delete))
    try{$Digest=(Get-FileHash -InputStream $Stream).Hash}finally{$Stream.Dispose()}
    $After=Get-Item -LiteralPath $File
    Require ($Length -eq $After.Length -and $Written -eq $After.LastWriteTimeUtc) 'Evidence changed during read'
    return $Digest
}
function Track([string]$File,[string]$Expected=''){
    $Path=Full $File
    Require ($Path.StartsWith($Root+'\',[StringComparison]::OrdinalIgnoreCase) -or $Path.StartsWith($CacheRoot+'\',[StringComparison]::OrdinalIgnoreCase)) 'Evidence outside approved workspace and cache'
    Require (-not ((Get-Item -LiteralPath $Path).Attributes -band [IO.FileAttributes]::ReparsePoint)) 'Redirected evidence rejected'
    if(-not $Inputs.ContainsKey($Path)){$Inputs[$Path]=Hash $Path}
    if($Expected){Require ($Inputs[$Path] -eq $Expected) ("Recorded input changed: "+$Path)}
    return $Path
}
function Manifest([string]$File){
    $null=Track $File
    $Index=@{}
    foreach($Entry in @(Json $File)){
        $Path=Full $Entry.Path
        Require (-not $Index.ContainsKey($Path) -or $Index[$Path] -eq $Entry.Hash) 'Conflicting manifest entry'
        $Index[$Path]=$Entry.Hash
    }
    return $Index
}
function Bind([hashtable]$Index){
    foreach($Path in $Index.Keys){
        $Expected=$Index[$Path]
        if($Inputs.ContainsKey($Path) -and $Inputs[$Path] -eq $Expected){continue}
        if(-not $Inputs.ContainsKey($Path) -and (Test-Path -LiteralPath $Path -PathType Leaf) -and (Hash $Path) -eq $Expected){$null=Track $Path $Expected;continue}
        Require ($Archives.ContainsKey($Expected)) ("Preserved execution input unavailable: "+$Path)
        $Copy=Track $Archives[$Expected] $Expected
        $Bindings.Add([pscustomobject]@{ExecutedPath=$Path;Hash=$Expected;PreservedAt=$Copy;CurrentFileReplaced=$true})
    }
}
$ParserSourceDirectory=Join-Path $Evidence 'e3-parser-source-followup-20261010-r1'
foreach($File in Get-ChildItem -LiteralPath (Join-Path $ParserSourceDirectory 'before') -Recurse -File){
    $Copy=Track $File.FullName
    $Archives[$Inputs[$Copy]]=$Copy
}
Bind (Manifest (Join-Path $ParserSourceDirectory 'before-inputs.json'))
$Builds=@{}
foreach($Definition in @(@{Kind='backend';Version='r141';Phase='Backend';Count=3849},@{Kind='frontend';Version='r91';Phase='Frontend';Count=1483})){
    $Index=Manifest (Join-Path $Evidence "h3-portal-finance-20261002-$($Definition.Kind)-$($Definition.Version)-inputs.json")
    Require ($Index.Count -eq $Definition.Count) 'Product source count differs'
    foreach($Path in $Index.Keys){$null=Track $Path $Index[$Path]}
    $Builds[$Definition.Kind]=$Index
    $LogPath=Track (Join-Path $Evidence "h3-portal-finance-20261002-$($Definition.Kind)-$($Definition.Version).log")
    Require ((Get-Content -LiteralPath $LogPath -Raw).Contains("FINANCE_BUILD: phase=$($Definition.Phase); files=$($Definition.Count); changed=0; exit=0")) 'Original build result absent'
}
foreach($Preparation in @('e3-credit-prep-20261009-r1','e3-rule-hit-query-prep-20261009-r1','e3-hit-transition-prep-20261010-r1','e3-competitor-fields-prep-20261010-r1','e3-mobile-entry-prep-20261010-r1','e3-rule-parser-prep-20261010-r1','e3-hit-presentation-prep-20261010-r1')){
    $Directory=Join-Path $Evidence $Preparation
    foreach($File in Get-ChildItem -LiteralPath (Join-Path $Directory 'before') -File -Recurse){
        $Copy=Track $File.FullName
        $Archives[$Inputs[$Copy]]=$Copy
    }
    Bind (Manifest (Join-Path $Directory 'before-inputs.json'))
}
$BackendBefore=Manifest (Join-Path $Evidence 'h3-portal-finance-20261002-backend-r138-inputs.json')
$FrontendBefore=Manifest (Join-Path $Evidence 'h3-portal-finance-20261002-frontend-r86-inputs.json')
$ExpectedChanges=@(
    'cloudflow-backend/cloudflow-auth/src/main/java/com/cloudflow/auth/service/CrmRuleBridgeService.java',
    'cloudflow-backend/cloudflow-auth/src/main/java/com/cloudflow/auth/controller/BusinessRuleController.java',
    'cloudflow-backend/cloudflow-auth/src/main/java/com/cloudflow/auth/service/IBusinessRuleService.java',
    'cloudflow-backend/cloudflow-auth/src/main/java/com/cloudflow/auth/service/impl/BusinessRuleServiceImpl.java',
    'cloudflow-backend/cloudflow-auth/src/main/java/com/cloudflow/auth/mapper/BusinessRuleHitRecordMapper.java',
    'cloudflow-backend/cloudflow-auth/src/main/resources/mapper/BusinessRuleHitRecordMapper.xml',
    'cloudflow-frontend/src/pages/CrmLostAnalysisPage.tsx',
    'cloudflow-frontend/src/pages/system/BusinessRulePage.tsx',
    'cloudflow-frontend/src/services/api/businessRule.ts',
    'cloudflow-frontend/src/services/api/crm/operations.ts',
    'cloudflow-frontend/src/router.tsx',
    'cloudflow-frontend/src/styles/features/admin-business.css'
)|ForEach-Object{Full $_}
$ProductImpact=@()
foreach($Kind in @('backend','frontend')){
    $Before=if($Kind -eq 'backend'){$BackendBefore}else{$FrontendBefore}
    $After=$Builds[$Kind]
    foreach($Path in $After.Keys|Where-Object{$Before[$_] -ne $After[$_]}){
        Require ($ExpectedChanges -contains $Path) 'Unreviewed E3 product change'
        if($Before.ContainsKey($Path)){
            Require ($Archives.ContainsKey($Before[$Path])) 'Original product source not preserved'
            $null=Track $Archives[$Before[$Path]] $Before[$Path]
        }
        $ProductImpact+=@{Path=$Path;BeforeHash=$Before[$Path];AfterHash=$After[$Path];Added=(-not $Before.ContainsKey($Path))}
    }
    Require (@($Before.Keys|Where-Object{-not $After.ContainsKey($_)}).Count -eq 0) 'Unexpected removed product file'
}
Require ($ProductImpact.Count -eq 12 -and @($ProductImpact|Where-Object Added).Count -eq 1) 'E3 product impact differs'
$CurrentDirectory=Join-Path $Evidence "e3-credit-independent-20261009-$IndependentRound"
$Directories=@(Get-ChildItem -LiteralPath $Evidence -Directory|Where-Object {$_.Name -match '^e3-credit-independent-20261009-r([1-9][0-9]*)$' -and [int]$Matches[1] -le [int]$IndependentRound.Substring(1)}|Sort-Object Name)
Require ($Directories.FullName -contains $CurrentDirectory -and $Directories.Count -eq [int]$IndependentRound.Substring(1)) 'E3 round history incomplete'
foreach($Directory in $Directories){
    foreach($File in Get-ChildItem -LiteralPath (Join-Path $Directory.FullName 'originals') -Recurse -File){
        $Copy=Track $File.FullName
        $Archives[$Inputs[$Copy]]=$Copy
    }
}
$SmtpPreparation=Join-Path $Evidence 'e3-smtp-state-prep-20261010-r1'
foreach($File in Get-ChildItem -LiteralPath (Join-Path $SmtpPreparation 'before') -File -Recurse){
    $Copy=Track $File.FullName
    $Archives[$Inputs[$Copy]]=$Copy
}
Bind (Manifest (Join-Path $SmtpPreparation 'before-inputs.json'))
$SmtpInspection=Join-Path $Evidence 'e3-smtp-state-inspection-20261010-r1'
$SmtpMaintenance=Json (Track (Join-Path $SmtpInspection 'result.json'))
$null=Track (Join-Path $SmtpInspection 'original.ps1')
Require (-not $SmtpMaintenance.OriginalWrapperCompleted -and $SmtpMaintenance.OriginalWrapperExit -eq -1 -and $SmtpMaintenance.OriginalWrapperTerminal -eq '83d2b1' -and $SmtpMaintenance.StateChangedOnlySmtpProcess -and $SmtpMaintenance.HealthyServices -eq 6) 'Interrupted SMTP wrapper and actual completion boundary differs'
Require ($SmtpMaintenance.Passed -and $SmtpMaintenance.PreservedFiles -eq 4 -and $SmtpMaintenance.HistoricalInputBindings.Count -eq 4 -and $SmtpMaintenance.ExistingServicesKept -and -not $SmtpMaintenance.CertificateRenewed -and -not $SmtpMaintenance.ProductModified -and -not $SmtpMaintenance.ProductionModified) 'Owned SMTP maintenance evidence differs'
foreach($Entry in $SmtpMaintenance.HistoricalInputBindings){$null=Track $Entry.Manifest $Entry.ManifestHash}
foreach($File in @('original.ps1','restart-original.ps1','restart.log')){$null=Track (Join-Path $SmtpPreparation $File)}

$ParserRuntimeArchive=Join-Path $Evidence 'e3-rule-parser-prep-20261010-r1/before-runtime'
foreach($File in Get-ChildItem -LiteralPath $ParserRuntimeArchive -Recurse -File){
    $Copy=Track $File.FullName
    $Archives[$Inputs[$Copy]]=$Copy
}
Bind (Manifest (Join-Path $Evidence 'e3-rule-parser-prep-20261010-r1/before-runtime-inputs.json'))
$RuntimeArchive=Join-Path $Evidence 'e3-hit-transition-prep-20261010-r1/before-runtime'
foreach($File in Get-ChildItem -LiteralPath $RuntimeArchive -Recurse -File){
    $Copy=Track $File.FullName
    $Archives[$Inputs[$Copy]]=$Copy
}
Bind (Manifest (Join-Path $Evidence 'e3-hit-transition-prep-20261010-r1/before-runtime-inputs.json'))
foreach($Directory in $Directories){
    $ManifestPath=Join-Path $Directory.FullName 'runtime-inputs.json'
    if(-not (Test-Path -LiteralPath $ManifestPath)){continue}
    foreach($Entry in @(Json $ManifestPath)|Where-Object {$_.Path -match '[\\/]artifacts[\\/][a-f0-9]{64}\.jar$'}){
        $Copy=Track $Entry.Path $Entry.Hash
        $Archives[$Entry.Hash]=$Copy
    }
}
$Failures=[Collections.Generic.List[object]]::new()
$VisualFailures=[Collections.Generic.List[object]]::new()
foreach($Directory in $Directories){
    if($Directory.Name -eq 'e3-credit-independent-20261009-r1'){
        $FailureFile=Track (Join-Path $Directory.FullName 'post-failure-originals.json')
        $Failed=Json $FailureFile
        Require ($Failed.CapturedAfterFailure -and $Failed.CapturedBeforeAnyScriptChange -and -not $Failed.BusinessStarted -and $Failed.Failure -eq 'Reference package differs from current build') 'First preflight failure changed'
        foreach($Entry in $Failed.Originals){$null=Track (Join-Path $Directory.FullName ('originals/'+$Entry.Path)) $Entry.Hash}
        Require (-not (Test-Path -LiteralPath (Join-Path $Directory.FullName 'launcher-result.json'))) 'First round terminal boundary changed'
        $Failures.Add(@{Folder=$Directory.Name;Passed=$false;BusinessStarted=$false;Reason=$Failed.Failure;InputManifestPresent=$false;CapturedAfterFailure=$true;Retained=$true})
        continue
    }
    $Launcher=Json (Join-Path $Directory.FullName 'launcher-result.json')
    $Business=Json (Join-Path $Directory.FullName 'result.json')
    Require ($Launcher.inputsUnchanged -and $Launcher.processesStopped -and $Launcher.referenceKept -and -not $Launcher.priorRuntimeWritten) 'Independent preservation differs'
    $RecordedRound=[int][regex]::Match($Directory.Name,'-r([1-9][0-9]*)$').Groups[1].Value
    $ExpectedBackend=if($RecordedRound -ge 16){'r141'}elseif($RecordedRound -ge 10){'r140'}else{'r139'}
    $ExpectedFrontend=if($RecordedRound -ge 17){'r91'}elseif($RecordedRound -ge 15){'r90'}elseif($RecordedRound -ge 13){'r89'}else{'r88'}
    Require ($Launcher.referenceBusinessTables -eq 23 -and $Launcher.backend -eq $ExpectedBackend -and $Launcher.frontend -eq $ExpectedFrontend) 'Independent source boundary differs'
    Require ($Launcher.stopErrors.Count -eq 0 -and $Launcher.databaseRetained -and $Launcher.captchaCounterWrites -eq 0 -and $Launcher.captchaConfigurationWrites -eq 0) 'Independent cleanup or captcha boundary differs'
    $RunInputs=Manifest (Join-Path $Directory.FullName 'inputs.json')
    $RuntimeInputs=Manifest (Join-Path $Directory.FullName 'runtime-inputs.json')
    Require ($RunInputs.Count -eq $Launcher.inputs -and $RuntimeInputs.Count -eq $Launcher.runtimeInputs -and $Launcher.executionOriginals -eq 572) 'Independent manifest count differs'
    Bind $RunInputs
    Bind $RuntimeInputs
    $ReferenceBefore=Json (Join-Path $Directory.FullName 'reference-business-before.json')
    $ReferenceAfter=Json (Join-Path $Directory.FullName 'reference-business-after.json')
    Require (@($ReferenceBefore.PSObject.Properties).Count -eq 23) 'Reference table coverage differs'
    foreach($Property in $ReferenceBefore.PSObject.Properties){Require ($ReferenceAfter.($Property.Name) -eq $Property.Value) 'Original business table differs'}
    $IndependentRun=Full $Launcher.run
    Require ((Split-Path -Parent $IndependentRun) -eq (Join-Path $Root '.cloudflow-runtime/batch-g-integration') -and $IndependentRun -ne $Reference) 'Independent run path differs'
    $RunState=Json (Join-Path $IndependentRun 'state.json')
    Require ($RunState.status -eq 'STOPPED' -and $RunState.processes.Count -eq 8 -and $RunState.services.Count -eq 6) 'Independent services not fully stopped'
    foreach($Entry in $RunState.processes){
        $Observed=Get-CimInstance Win32_Process -Filter "ProcessId=$($Entry.id)"
        Require (-not $Observed -or -not $Observed.CommandLine.Contains($Entry.marker)) 'Independent process remains active'
    }
    $RuntimeAfter=Json (Join-Path $Directory.FullName 'runtime-after.json')
    Require ($RuntimeAfter.passed -and $RuntimeAfter.leaks -eq 0 -and $RuntimeAfter.databaseLeaks -eq 0 -and $RuntimeAfter.counterWrites -eq 0 -and $RuntimeAfter.configurationWrites -eq 0) 'Runtime protection failed'
    Require ($RuntimeAfter.persistentLimit -eq '100' -and $RuntimeAfter.cachedLimit -eq '"100"' -and $RuntimeAfter.counterBefore -eq 0 -and $RuntimeAfter.counter -eq 8) 'Captcha read-only boundary differs'
    Require ($Business.cleanupFailures.Count -eq 0 -and $Business.secretScan.leaks -eq 0) 'Business cleanup or secret protection failed'
    $null=Track (Join-Path $IndependentRun 'state.json')
    foreach($File in Get-ChildItem -LiteralPath $Directory.FullName -Recurse -File){$null=Track $File.FullName}
    if($Directory.FullName -eq $CurrentDirectory){
        Require ($Launcher.passed -and $Launcher.verifierExit -eq 0 -and $Business.passed) 'Current E3 result did not pass'
        $CurrentLauncher=$Launcher;$Current=$Business;$CurrentInputs=$RunInputs;$CurrentRuntimeInputs=$RuntimeInputs;$CurrentRuntimeAfter=$RuntimeAfter
    }elseif($RecordedRound -eq 16){
        Require ($Launcher.passed -and $Launcher.verifierExit -eq 0 -and $Business.passed -and $Business.checks.Count -eq 740) 'Historical successful R16 business result changed'
        $PriorReview=Json (Track (Join-Path $Directory.FullName 'image-review.json'))
        Require ($PriorReview.businessPassed -and $PriorReview.allActuallyViewed -and -not $PriorReview.visualAccepted -and $PriorReview.images.Count -eq 17 -and @($PriorReview.images|Where-Object{-not $_.accepted}).Count -eq 2) 'R16 business success and visual findings must remain separate'
        foreach($Image in $PriorReview.images){Require $Image.actuallyViewed 'Unviewed R16 image';$null=Track (Join-Path $Directory.FullName $Image.name) $Image.sha256}
        $VisualFailures.Add(@{Folder=$Directory.Name;BusinessPassed=$true;VisualAccepted=$false;OriginalExit=0;Checks=740;ImagesViewed=17;ImagesRejected=2;OriginalResultRetained=$true;Review=(Join-Path $Directory.FullName 'image-review.json')})
    }else{
        Require (-not $Launcher.passed -and $Launcher.verifierExit -eq 1 -and -not $Business.passed) 'Historical failure outcome changed'
        $Failures.Add(@{Folder=$Directory.Name;Passed=$false;Preservation=$true;ProcessesStopped=$true;Reason=$Business.failure;Checks=$Business.checks.Count;Requests=$Business.requests.Count;UiRequests=$Business.uiRequests.Count;Retained=$true})
    }
}
Require ($Current.backendRound -eq 'r141' -and $Current.frontendRound -eq 'r91' -and $Current.finalAcceptancePending -and -not $Current.globalComplete) 'Business version or acceptance boundary differs'
Require ($Current.independentDatabaseOnly -and -not $Current.originalEnvironmentWritten -and -not $Current.externalMessagesSent -and -not $Current.systemClockChanged) 'Business execution scope differs'
Require ($Current.browserErrors.Count -eq 0 -and $Current.cleanupFailures.Count -eq 0 -and $Current.secretScan.leaks -eq 0) 'Current browser, cleanup or secret protection failed'
Require ($CurrentInputs.Count -eq 12320 -and $CurrentRuntimeInputs.Count -eq 6413) 'Current runtime source count differs'
foreach($Flag in @('masterData','lossValidation','lossApproval','lossReport','competitorStats','creditApproval','creditExposure','creditRules','entryPoints','ruleVersions','bypass','audits','recordedQueries','permissions','desktop','mobile','preservation','secrets')){
    Require ($Current.evidence.$Flag -eq $true) 'E3 evidence flag missing'
}
foreach($Actor in @('sales','manager','readonly')){Require ($Current.checks -contains "actual_data_scope_$Actor") 'Actual logged-in data scope proof missing'}
Require ($Current.checks -contains 'actual_pages_have_no_unexpected_read_errors') 'Actual page read boundary missing'
$Fixture=Json (Join-Path $CurrentDirectory 'fixture.json')
Require ($Fixture.ruleHitPresentation.fields.Count -eq 7 -and $Fixture.ruleHitPresentation.desktopValuesVerified -and $Fixture.ruleHitPresentation.mobileValuesVerified -and $Fixture.ruleHitPresentation.mobileFieldLabelsVerified -and $Fixture.ruleHitPresentation.bypassBusinessLabelVerified -and $Fixture.ruleHitPresentation.desktopBypassFilterVerified -and $Fixture.ruleHitPresentation.mobileBypassFilterVerified -and $Fixture.ruleHitPresentation.phoneWidth -eq 390) 'Actual seven-field and bypass presentation evidence missing'
$PresentationDirectory=Join-Path $Evidence 'e3-hit-presentation-prep-20261010-r1'
$PresentationDiagnosis=Json (Track (Join-Path $PresentationDirectory 'result.json'))
Require ($PresentationDiagnosis.Passed -and $PresentationDiagnosis.RuntimeRound -eq 'r16' -and $PresentationDiagnosis.BaselineFrontend -eq 'r90' -and $PresentationDiagnosis.BusinessPassed -and $PresentationDiagnosis.OriginalsPreserved -and $PresentationDiagnosis.ImagesViewed -eq 17 -and $PresentationDiagnosis.ImagesRejected -eq 2 -and $PresentationDiagnosis.BusinessWrites -eq 0 -and -not $PresentationDiagnosis.RuntimeStarted -and -not $PresentationDiagnosis.ProductModified) 'Actual completed R16 visual diagnosis differs'
foreach($File in Get-ChildItem -LiteralPath $PresentationDirectory -Recurse -File){$null=Track $File.FullName}
Bind (Manifest (Join-Path $PresentationDirectory 'inputs.json'))
Require ($Fixture.mobileEntries.width -eq 390 -and $Fixture.mobileEntries.lostAnalysisRefreshed -and $Fixture.mobileEntries.dashboardRefreshed -and $Fixture.mobileEntries.competitorSavedAndRefreshed -and $Fixture.mobileEntries.creditDirectLoaded -and $Fixture.mobileEntries.ruleCenterRefreshedAndQueried) 'Actual mobile direct-load and refresh proof missing'
Require ($Fixture.workflowPacing.limit -eq 10 -and $Fixture.workflowPacing.windowSeconds -eq 60 -and $Fixture.workflowPacing.startAttemptsReserved -eq 2 -and $Fixture.workflowPacing.intervalMs -eq 12150 -and $Fixture.workflowPacing.observations.Count -gt 0) 'Actual workflow workload pacing differs'
$PacingIndex=0
foreach($Observation in $Fixture.workflowPacing.observations){
    $PacingIndex++
    Require ($null -eq $Observation.previousAt -or ($Observation.startedAt-$Observation.previousAt) -ge $Fixture.workflowPacing.intervalMs) 'Workflow submission pacing was not observed'
    Require ($Current.checks -contains "workflow_submission_$($PacingIndex)_respects_actual_start_limit") 'Workflow pacing lacks executed assertion'
}

Require ($Fixture.competitorPage.submittedServerFields -and $Fixture.competitorPage.storedAndReopened -and $Fixture.competitorPage.strength -eq '交付响应与服务保障' -and $Fixture.competitorPage.weakness -eq '价格较高且交期较长') 'Actual competitor field save and reopen proof missing'
Require ($Fixture.ruleHitTransitions.consecutiveDuplicatesCoalesced -and $Fixture.ruleHitTransitions.changedThenRestoredValuesRetained -and $Fixture.ruleHitTransitions.actualReceipt -and $Fixture.ruleHitTransitions.hitIds.Count -eq 3) 'Real hit transition proof missing'

Require ($Fixture.creditRejection.boundVersion -eq ($Fixture.creditRejection.submittedVersion+1) -and $Fixture.creditRejection.rejectedVersion -eq $Fixture.creditRejection.boundVersion) 'Credit binding and rejection version proof missing'
Require ($Fixture.creditRejection.approvedLimitUnchanged -and $Fixture.creditRejection.approvedThresholdUnchanged -and $Fixture.creditRejection.effectivePeriodAndBypassUnchanged -and $Fixture.creditRejection.pendingApprovalCleared) 'Credit rejection preservation proof missing'
Require ($Fixture.creditApprovalHistories.Count -eq 6) 'Six actual two-stage credit histories required'
foreach($History in $Fixture.creditApprovalHistories){
    Require ($History.sequentialStagesObserved -and $History.managerTask -ne $History.financeTask -and $History.managerTime -le $History.financeTime) 'Actual task sequence proof differs'
    Require ($Current.checks -contains "credit_$($History.approvalId)_real_manager_then_finance_history") 'History is not bound to executed task check'
}
$Measurement=@($Fixture.measurements|Where-Object kind -EQ 'actual_exposure_database_statements')
Require ($Measurement.Count -eq 1 -and $Measurement[0].count -gt 0 -and $Measurement[0].maximumMs -lt 100 -and $Measurement[0].limitMs -eq 100 -and -not $Measurement[0].includesHttp) 'Strict database calculation latency proof missing'
Require ($Current.fixtureChanges.Count -gt 0 -and @($Current.fixtureChanges|Where-Object {-not $_.independentDatabaseOnly -or -not $_.reason}).Count -eq 0) 'Historical fixture changes must be explicit and independent'
Require (@($Current.fixtureChanges|Where-Object {$_.kind -eq 'credit' -and $_.fields -contains 'bypass_expire_date'}).Count -eq 1) 'Owned prior-day bypass expiry input missing'
$Required='{"AC-1":["loss_rejects_empty","loss_rejects_without_primary","loss_rejects_two_primary","loss_rejects_duplicate","loss_rejects_inactive_reason","loss_rejects_foreign_reason"],"AC-2":[],"AC-3":["count_and_amount_rankings_have_different_leaders","desktop_rankings_render_in_two_separate_columns","keyboard_amount_table_preserves_exact_top_ten_and_unit","mobile_rankings_have_no_document_horizontal_overflow","both_rankings_show_explicit_empty_state","actual_dashboard_summary_includes_both_report_dimensions"],"AC-4":["multiple_reasons_count_each_competitor_loss_once_per_opportunity","unused_competitor_retains_zero_wins_and_losses","department_report_adds_manager_loss_but_excludes_other_department_win","full_scope_adds_outside_win_but_excludes_other_tenant"],"AC-5":[],"AC-6":["reason_disabled_and_version_incremented","competitor_disabled_and_version_incremented","reason_rejected_stale_save_preserves_entire_master","competitor_rejected_stale_save_preserves_entire_master","reason_reopened_from_server_keeps_saved_remark","mobile_competitor_editor_reads_saved_business_fields","competitor_saved_strength_and_weakness_match_real_server_contract","competitor_page_actual_save_uses_server_fields","competitor_page_save_preserves_exact_business_fields","competitor_reopened_from_server_keeps_saved_strength_and_weakness"],"AC-7":["concurrent_credit_submission_creates_one_actual_approval","first_pending_credit_is_disabled_zero_and_not_effective","finance_approval_activates_exact_credit_and_ends_pending","new_approval_binding_advances_only_credit_record_version_once","finance_rejection_keeps_approved_credit_and_bound_version","approval_changes_credit_and_preserves_independent_latest_bypass"],"AC-8":["credit_desktop_shows_exact_credit_occupied_available_and_overdue","credit_mobile_shows_exact_credit_occupied_available_and_overdue","customer_workspace_credit_shows_exact_credit_occupied_available_and_overdue","readonly_credit_page_hides_adjustment_and_bypass"],"AC-9":["unpaid_sum_excludes_closed_cancelled_deleted_other_customer_and_tenant","real_partial_collection_preserves_exact_cents","real_full_collection_zeroes_original_exposure","new_unpaid_invoice_immediately_reoccupies_credit"],"AC-10":["overdue_sum_excludes_today_future_and_null_due_dates","next_credit_read_immediately_releases_partial_receipt"],"AC-11":["overdue_blocks_quote_contract_generation","overdue_blocks_customer_workspace_contract","both_blocked_contract_entries_leave_contract_count_unchanged","CRM_QUOTE_CONTRACT_records_real_overdue_block_hit_and_audit","CRM_CUSTOMER_CONTRACT_records_real_overdue_block_hit_and_audit","one_cent_above_limit_uses_exact_total_and_boundary"],"AC-12":["credit_limit_warn_independently_allows_submission_has_actual_warning_header_and_amounts","warn_quote_actually_leaves_draft","credit_warning_is_visible_to_sales_on_actual_page","quote_page_submission_reaches_business_state"],"AC-13":["draft_rule_does_not_change_effective_overdue_block","publishing_warn_takes_effect_without_service_restart","pass_effect_has_no_warning_and_keeps_pass_record"],"AC-14":["rollback_restores_old_effect_as_new_published_version","block_warn_block_transitions_preserve_latest_actual_rule_result"],"AC-15":["bypass_includes_expiration_day_and_records_real_actor_time_reason","bypass_passes_both_block_rules_and_records_both_hits"],"AC-16":["expired_bypass_is_inactive_and_preserves_original_operator_evidence","bypass_revocation_keeps_credit_and_records_audit"],"AC-17":["raw_hit_query_preserves_actual_changed_and_restored_block_results","deduplicated_hit_query_returns_latest_record_for_same_rule_and_document","deduplicated_query_does_not_delete_raw_hit_history","latest_result_filter_excludes_documents_whose_old_block_became_pass","dedup_partitions_by_tenant_rule_type_and_document","hits_without_document_id_remain_independent_records","deduplicated_query_isolates_same_rule_and_document_across_tenants","result_filter_applies_after_latest_selection","deduplicated_pagination_is_complete_stable_and_without_overlap","rule_page_dedup_switch_resets_page_and_reduces_rows","rule_hit_query_switch_remains_accessible_on_phone","rule_phone_refresh_retains_actual_hit_query","rule_phone_latest_results_match_desktop_after_refresh","actual_credit_exposure_sql_is_observed_and_each_calculation_under_100ms","changed_then_restored_exposure_records_three_ordered_business_results","identical_consecutive_blocks_coalesce_without_losing_changed_history","rule_hit_desktop_seven_fields_match_actual_server_values","rule_hit_desktop_all_seven_fields_are_visible","rule_hit_desktop_contains_actual_bypassed_business","rule_hit_desktop_bypassed_record_displays_exact_business_label","rule_hit_phone_seven_fields_match_actual_server_values","rule_hit_phone_all_seven_fields_are_visible","rule_hit_phone_every_field_has_visible_mobile_label","rule_hit_phone_all_fields_fit_phone_width","rule_hit_phone_preserves_desktop_record_order_and_values","rule_hit_phone_heading_and_description_fit_viewport","rule_hit_phone_has_no_horizontal_document_overflow","rule_hit_desktop_bypass_filter_queries_actual_latest_results","rule_hit_desktop_filtered_bypass_seven_fields_match_actual_server_values","rule_hit_phone_bypass_filter_queries_actual_latest_results","rule_hit_phone_filtered_bypass_all_seven_fields_are_visible","rule_hit_phone_filtered_bypass_all_fields_fit_phone_width"],"AC-18":["credit_submission_and_approval_are_auditable","crm.credit.overdue_bypass_has_separate_high_risk_audit","crm.credit.limit_bypass_has_separate_high_risk_audit"]}'|ConvertFrom-Json -AsHashtable
$FirstLoss=@($Fixture.approvals|Where-Object {$_.kind -eq 'loss' -and $_.comment.EndsWith('_价格与交付补充说明')})
Require ($FirstLoss.Count -eq 1 -and $FirstLoss[0].reasons.Count -eq 3) 'Actual multireason loss sample missing'
$LossId=[string]$FirstLoss[0].opportunityId
$Required.'AC-2'=@("loss_$($LossId)_actual_approval_writes_stage_comment_and_all_details")+@($FirstLoss[0].reasons|ForEach-Object{"loss_$($LossId)_reason_$($_.reasonId)_saved_exactly"})
$Required.'AC-5'=@("loss_$($LossId)_pending_preserves_original_stage","loss_$($LossId)_actual_approval_writes_stage_comment_and_all_details")
$Blocked=@($Fixture.quotes|Where-Object {$_.name.EndsWith('_RULE_BLOCKED')})
Require ($Blocked.Count -eq 1) 'Actual blocked quote sample missing'
$Required.'AC-11'+=@("crm.credit.overdue_blocks_quote_$($Blocked[0].id)")
$Required.'AC-18'+=@("blocked_quote_$($Blocked[0].id)_persists_hit_despite_business_rollback","blocked_quote_$($Blocked[0].id)_persists_high_risk_audit")
$Items=@(foreach($Number in 1..18){
    $Key="AC-$Number";$Executed=$Current.acceptance.$Key
    Require ($Executed.executed -and $Executed.checks.Count -gt 0 -and $Required.$Key.Count -gt 0) 'Acceptance item has no actual checks'
    foreach($Label in $Required.$Key){Require ($Current.checks -contains $Label -and $Executed.checks -contains $Label) ("Required acceptance check missing: "+$Label)}
    [pscustomobject]@{Id=$Key;Passed=$true;BusinessResult=(Join-Path $CurrentDirectory 'result.json');RequiredChecks=@($Required.$Key);ExecutedChecks=@($Executed.checks)}
})
$ReviewPath=Track (Join-Path $Evidence 'e3-credit-image-review-20261010-r1/manifest.json')
$Review=Json $ReviewPath
Require ($Review.ActuallyViewed -and $Review.VisualAccepted -and $Review.Round -eq $IndependentRound -and $Review.Images.Count -eq 17 -and $Fixture.images.Count -eq 17) 'Actual screenshot review incomplete'
foreach($Image in $Review.Images){
    Require ($Image.ActuallyViewed -and $Image.VisualAccepted -and @($Fixture.images|Where-Object name -EQ $Image.Name).Count -eq 1) 'Reviewed image does not belong to current business run'
    $null=Track (Join-Path $CurrentDirectory $Image.Name) $Image.Hash
}
$Inspections=@()
foreach($InspectionRound in @('r6','r7','r8','r13')){
    $Directory=Join-Path $Evidence "e3-credit-workflow-inspection-20261010-$InspectionRound"
    $Inspection=Json (Join-Path $Directory 'result.json')
    Require ($Inspection.SuperReadOnly -and $Inspection.BusinessWrites -eq 0 -and $Inspection.InspectionProcessStopped -and -not $Inspection.ReferenceRuntimeAccessed) 'Read-only diagnosis boundary differs'
    foreach($File in Get-ChildItem -LiteralPath $Directory -File){$null=Track $File.FullName}
    $Inspections+=@{Round=$InspectionRound;ReadOnly=$true;BusinessWrites=0;ProcessStopped=$true;Result=(Join-Path $Directory 'result.json')}
}
$CollisionDirectory=Join-Path $Evidence 'e3-credit-quote-collision-20261010-r10'
$Collision=Json (Join-Path $CollisionDirectory 'result.json')
Require ($Collision.DeterministicFixtureNumberCollision -and $Collision.BusinessWrites -eq 0 -and -not $Collision.RuntimeStarted -and $Collision.OriginalRoundUnchanged) 'Quote fixture collision diagnosis differs'
foreach($File in Get-ChildItem -LiteralPath $CollisionDirectory -File){$null=Track $File.FullName}
Bind (Manifest (Join-Path $CollisionDirectory 'inputs.json'))
$LabelDirectory=Join-Path $Evidence 'e3-reason-label-inspection-20261010-r1'
$LabelInspection=Json (Join-Path $LabelDirectory 'result.json')
Require ($LabelInspection.diagnosticOnly -and -not $LabelInspection.actualBusinessAcceptance -and $LabelInspection.networkRequests -eq 0 -and $LabelInspection.initialLabelMatches -eq 1 -and $LabelInspection.reopenedLabelMatches -eq 0 -and $LabelInspection.reopenedRoleMatches -eq 1 -and $LabelInspection.browserClosed) 'Textarea locator diagnosis differs'
foreach($File in Get-ChildItem -LiteralPath $LabelDirectory -File){$null=Track $File.FullName}
Bind (Manifest (Join-Path $LabelDirectory 'inputs.json'))
$CompetitorDirectory=Join-Path $Evidence 'e3-competitor-fields-prep-20261010-r1'
$CompetitorDiagnosis=Json (Join-Path $CompetitorDirectory 'result.json')
Require ($CompetitorDiagnosis.HistoricalRequestUsedPluralFields -and $CompetitorDiagnosis.StoredStrengthIsNull -and $CompetitorDiagnosis.StoredWeaknessIsNull -and $CompetitorDiagnosis.SuperReadOnly -and $CompetitorDiagnosis.BusinessWrites -eq 0 -and $CompetitorDiagnosis.InspectionProcessStopped -and $CompetitorDiagnosis.OriginalRoundUnchanged) 'Actual competitor field-loss diagnosis differs'
foreach($File in Get-ChildItem -LiteralPath $CompetitorDirectory -File){$null=Track $File.FullName}
Bind (Manifest (Join-Path $CompetitorDirectory 'inputs.json'))
$Inspections+=@{Round='r12';ReadOnly=$true;BusinessWrites=0;ProcessStopped=$true;Result=(Join-Path $CompetitorDirectory 'result.json')}


$TimingDirectory=Join-Path $Evidence 'e3-credit-binding-timing-20261010-r13'
$BindingTiming=Json (Track (Join-Path $TimingDirectory 'result.json'))
Require ($BindingTiming.SuperReadOnly -and $BindingTiming.BusinessWrites -eq 0 -and $BindingTiming.InspectionProcessStopped -and -not $BindingTiming.ReferenceRuntimeAccessed -and $BindingTiming.Timeline.creationToBindingSeconds -eq 65 -and $BindingTiming.Outbox.Count -eq 1 -and $BindingTiming.Outbox[0].retryCount -eq 0) 'Actual binding timing diagnosis differs'
foreach($File in Get-ChildItem -LiteralPath $TimingDirectory -File){$null=Track $File.FullName}
$null=Track (Join-Path $Evidence 'e3-credit-independent-20261009-r13/result.json') $BindingTiming.BusinessResultSha256
$null=Track (Join-Path $Evidence 'e3-credit-independent-20261009-r13/fixture.json') $BindingTiming.FixtureSha256
$LimitDirectory=Join-Path $Evidence 'e3-credit-start-limit-inspection-20261010-r1'
$StartLimit=Json (Track (Join-Path $LimitDirectory 'result.json'))
Require ($StartLimit.ActualStartLimitEvents.Count -gt 0 -and $StartLimit.ActualStartLimitEvents[0].Count -eq 11 -and $StartLimit.ActualStartLimitEvents[0].Limit -eq 10 -and $StartLimit.BindingDelaySeconds -eq 65 -and -not $StartLimit.RuntimeStarted -and $StartLimit.BusinessWrites -eq 0 -and -not $StartLimit.RateCountersChanged -and -not $StartLimit.ConfigurationChanged -and -not $StartLimit.RawLogsEmitted) 'Actual workflow start limit diagnosis differs'
foreach($File in Get-ChildItem -LiteralPath $LimitDirectory -File){$null=Track $File.FullName}
$null=Track (Join-Path $Root '.cloudflow-runtime/batch-g-integration/daa8f7adb4934ac89338ea6b715df24f/workflow/stdout.log') $StartLimit.WorkflowLogSha256
$null=Track (Join-Path $TimingDirectory 'result.json') $StartLimit.TimingResultSha256
$null=Track (Join-Path $Root 'cloudflow-backend/cloudflow-service-workflow/src/main/java/com/cloudflow/workflow/service/RateLimiterService.java') $StartLimit.LimiterSourceSha256
$Inspections+=@{Round='r13';ReadOnly=$true;BusinessWrites=0;ProcessStopped=$true;Result=(Join-Path $TimingDirectory 'result.json')}

$MobileDirectory=Join-Path $Evidence 'e3-mobile-entry-prep-20261010-r1'
$MobileDiagnosis=Json (Track (Join-Path $MobileDirectory 'result.json'))
Require ($MobileDiagnosis.RuntimeRound -eq 'r14' -and $MobileDiagnosis.BaselineFrontend -eq 'r89' -and $MobileDiagnosis.MissingMobileRoutes.Count -eq 4 -and $MobileDiagnosis.FailureAfterActualMobileReload -and $MobileDiagnosis.OriginalsPreserved -and $MobileDiagnosis.BusinessWrites -eq 0 -and -not $MobileDiagnosis.RuntimeStarted -and -not $MobileDiagnosis.ProductModified) 'Actual mobile entry diagnosis differs'
foreach($File in Get-ChildItem -LiteralPath $MobileDirectory -File){$null=Track $File.FullName}
Bind (Manifest (Join-Path $MobileDirectory 'inputs.json'))
$Inspections+=@{Round='r14';ReadOnly=$true;BusinessWrites=0;ProcessStopped=$true;Result=(Join-Path $MobileDirectory 'result.json')}

$ParserDirectory=Join-Path $Evidence 'e3-rule-parser-prep-20261010-r1'
$ParserDiagnosis=Json (Track (Join-Path $ParserDirectory 'result.json'))
$ParserReproduction=Json (Track (Join-Path $ParserDirectory 'parser-result.json'))
Require ($ParserDiagnosis.Passed -and $ParserDiagnosis.RuntimeRound -eq 'r15' -and $ParserDiagnosis.BaselineBackend -eq 'r140' -and $ParserDiagnosis.ActualHttpFailureStatus -eq 500 -and $ParserDiagnosis.ActualParserFailure -and $ParserDiagnosis.NullSafeOperatorRejected -and $ParserDiagnosis.StandardNullComparisonAccepted -and $ParserDiagnosis.BusinessWrites -eq 0 -and -not $ParserDiagnosis.RuntimeStarted) 'Actual query parser diagnosis differs'
Require (-not $ParserReproduction.originalParsed -and -not $ParserReproduction.originalCountParsed -and $ParserReproduction.compatibleParsed -and $ParserReproduction.compatibleCountParsed -and $ParserReproduction.productionParser -and $ParserReproduction.actualMapperSource) 'Actual query and count parser reproduction differs'
foreach($File in Get-ChildItem -LiteralPath $ParserDirectory -File){$null=Track $File.FullName}
Bind (Manifest (Join-Path $ParserDirectory 'inputs.json'))
$Inspections+=@{Round='r15';ReadOnly=$true;BusinessWrites=0;ProcessStopped=$true;Result=(Join-Path $ParserDirectory 'result.json')}
$SourceFollowup=Json (Track (Join-Path $ParserSourceDirectory 'result.json'))
Require ($SourceFollowup.Passed -and $SourceFollowup.FailedAdjacent -eq 'r181' -and $SourceFollowup.OriginalTerminal -eq 'a6ce6e' -and $SourceFollowup.OriginalExit -eq 1 -and $SourceFollowup.ParserChecksRetained -and $SourceFollowup.ActualPaginationGenerator -and $SourceFollowup.InputsUnchanged -and $SourceFollowup.OriginalsPreserved -and -not $SourceFollowup.ProductModified -and $SourceFollowup.DatabaseWrites -eq 0 -and -not $SourceFollowup.RuntimeStarted) 'Original source-constraint failure or actual parser followup differs'
$SourceParser=Json (Track (Join-Path $ParserSourceDirectory 'parser-result.json'))
Require (-not $SourceParser.originalParsed -and -not $SourceParser.originalCountParsed -and $SourceParser.compatibleParsed -and $SourceParser.compatibleCountParsed) 'Actual parser and count checks were not retained'
foreach($File in Get-ChildItem -LiteralPath $ParserSourceDirectory -Recurse -File){$null=Track $File.FullName}
Bind (Manifest (Join-Path $ParserSourceDirectory 'inputs.json'))
$FailedAdjacentDirectory=Join-Path $Evidence 'h3-portal-finance-adjacent-20261002-r181'
Bind (Manifest (Join-Path $FailedAdjacentDirectory 'inputs.json'))
$FailedSourceLog=Get-Content -LiteralPath (Track (Join-Path $FailedAdjacentDirectory 'sources.log')) -Raw
Require ($FailedSourceLog.Contains('JAVA_SQL_CONCAT: matches=2; rg_exit=0') -and $FailedSourceLog.Contains('E3RuleQueryParserInspection.java:22:') -and $FailedSourceLog.Contains('E3RuleQueryParserInspection.java:23:')) 'Historical adjacent failure changed'
$FailedAdjacentLog=Get-Content -LiteralPath (Join-Path $FailedAdjacentDirectory 'summary.log') -Raw
Require (-not $FailedAdjacentLog.Contains('H3_FINANCE_ADJACENT: files=')) 'Historical adjacent failure was relabelled as success'
foreach($File in Get-ChildItem -LiteralPath $FailedAdjacentDirectory -File){$null=Track $File.FullName}
$AdjacentDirectory=Join-Path $Evidence "h3-portal-finance-adjacent-20261002-$AdjacentRound"
$AdjacentInputs=Manifest (Join-Path $AdjacentDirectory 'inputs.json')
Bind $AdjacentInputs
$AdjacentLog=Get-Content -LiteralPath (Join-Path $AdjacentDirectory 'summary.log') -Raw
Require ($AdjacentLog.Contains("H3_FINANCE_ADJACENT: files=$($AdjacentInputs.Count); changed=0; exit=0; production_modified=false") -and $AdjacentLog.Contains('name=formal-01-07-and-oa-behavior; exit=0')) 'Adjacent original execution did not pass'
foreach($File in Get-ChildItem -LiteralPath $AdjacentDirectory -File){$null=Track $File.FullName}
$PackageDirectory=Join-Path $Evidence 'backend-executable-verification-20261006-r29'
$Packages=Json (Join-Path $PackageDirectory 'result.json')
Require ($Packages.Passed -and $Packages.BackendRound -eq 'r141' -and $Packages.InputChanges -eq 0 -and $Packages.Services.Count -eq 6) 'Current package proof differs'
$null=Track (Join-Path $PackageDirectory 'result.json')
$State=Json (Track (Join-Path $Reference 'state.json'))
Require ($State.status -eq 'RUNNING' -and $State.processes.Count -eq 9 -and $State.services.Count -eq 6) 'Reference runtime differs'
foreach($Entry in $State.processes){
    $Observed=Get-CimInstance Win32_Process -Filter "ProcessId=$($Entry.id)"
    Require ($Observed -and $Observed.CommandLine.Contains($Entry.marker)) 'Reference process ownership changed'
}
$RuntimeFiles=0
foreach($Service in $State.services){
    $Arguments=@(Get-Content -LiteralPath (Join-Path $Reference "$($Service.name)/service.args"))
    $Index=[Array]::IndexOf($Arguments,'-cp')
    Require ($Index -ge 0 -and $Arguments[$Index+2] -eq 'org.springframework.boot.loader.launch.JarLauncher') 'Layered runtime launch absent'
    $Layer=Full ($Arguments[$Index+1].Trim('"'))
    $Package=@($Packages.Services|Where-Object Name -EQ $Service.name)
    Require ($Package.Count -eq 1 -and $Layer -eq (Join-Path $Reference ("$($Service.name)/artifacts/"+$Package[0].Hash.ToLowerInvariant()+'-layered'))) 'Runtime package differs from build'
    $null=Track (Join-Path $Root $Package[0].Path) $Package[0].Hash
    $Files=@(Get-ChildItem -LiteralPath $Layer -Recurse -Force)
    Require (@($Files|Where-Object{$_.Attributes -band [IO.FileAttributes]::ReparsePoint}).Count -eq 0) 'Redirected runtime layer'
    foreach($File in @($Files|Where-Object{-not $_.PSIsContainer})){Require ($Inputs.ContainsKey($File.FullName)) 'Untracked runtime file';$RuntimeFiles++}
    Require ((Invoke-RestMethod -Uri "http://127.0.0.1:$($Service.healthPort)/actuator/health" -TimeoutSec 15).status -eq 'UP') 'Reference service unhealthy'
}
Require ($RuntimeFiles -eq 6389) 'Current runtime file count differs'
$DeploymentPath=Track (Join-Path $Evidence 'e1-reminder-deployment-20261007-r11/result.json')
$Deployment=Json $DeploymentPath
Require ($Deployment.Passed -and $Deployment.Backend -eq 'r141' -and $Deployment.PackageRound -eq 'r29' -and $Deployment.InputChanges -eq 0 -and $Deployment.HealthyServices -eq 6 -and $Deployment.RuntimeFiles -eq 6389 -and -not $Deployment.ProductionModified) 'Actual six-service deployment proof differs'
$Receipts=@('[{"Name":"backend139","Session":53857,"Exit":0,"Chunk":"cacc8c","TerminalCollected":true},{"Name":"frontend87","Session":25989,"Exit":0,"Chunk":"7a1064","TerminalCollected":true},{"Name":"frontend88","Session":21314,"Exit":0,"Chunk":"a8fea9","TerminalCollected":true},{"Name":"packages27","Session":1338,"Exit":0,"Chunk":"6276e5","TerminalCollected":true},{"Name":"deployment9","Session":38886,"Exit":0,"Chunk":"f59478","TerminalCollected":true},{"Name":"smtpRenewal","Session":22780,"Exit":0,"Chunk":"18b0be","TerminalCollected":true},{"Name":"javaStyle140","Session":28493,"Exit":0,"Chunk":"a1a99c","TerminalCollected":true},{"Name":"backend140","Session":82961,"Exit":0,"Chunk":"161fc7","TerminalCollected":true},{"Name":"packages28","Session":13959,"Exit":0,"Chunk":"945866","TerminalCollected":true},{"Name":"deployment10","Session":18278,"Exit":0,"Chunk":"6d7df2","TerminalCollected":true},{"Name":"independent1","Session":null,"Exit":1,"Chunk":"8b2322","TerminalCollected":true},{"Name":"independent2","Session":27291,"Exit":1,"Chunk":"c24e92","TerminalCollected":true},{"Name":"independent3","Session":10586,"Exit":1,"Chunk":"faeeb8","TerminalCollected":true},{"Name":"independent4","Session":80275,"Exit":1,"Chunk":"2d3167","TerminalCollected":true},{"Name":"independent5","Session":69523,"Exit":1,"Chunk":"c0873d","TerminalCollected":true},{"Name":"independent6","Session":72917,"Exit":1,"Chunk":"b41e19","TerminalCollected":true},{"Name":"independent7","Session":77699,"Exit":1,"Chunk":"8d353e","TerminalCollected":true},{"Name":"independent8","Session":19083,"Exit":1,"Chunk":"932aac","TerminalCollected":true},{"Name":"independent9","Session":50982,"Exit":1,"Chunk":"749903","TerminalCollected":true}]'|ConvertFrom-Json -Depth 8)
$Receipts+=@(
    @{Name='adjacent181';Session=17766;Exit=1;Chunk='a6ce6e';TerminalCollected=$true},
    @{Name='parserSourcePreparation';Session=$null;Exit=0;Chunk='0aa94b';TerminalCollected=$true},
    @{Name='parserSourceFollowup';Session=$null;Exit=0;Chunk='6f81e8';TerminalCollected=$true},
    @{Name='independent17';Session=99760;Exit=1;Chunk='92d1a7';TerminalCollected=$true},
    @{Name='independent16';Session=82119;Exit=0;Chunk='57a74e';TerminalCollected=$true},
    @{Name='frontend91';Session=67197;Exit=0;Chunk='6224b3';TerminalCollected=$true},
    @{Name='hitPresentationDiagnosis';Session=$null;Exit=0;Chunk='412ca0';TerminalCollected=$true},
    @{Name='deployment11';Session=93868;Exit=0;Chunk='3843c9';TerminalCollected=$true},
    @{Name='backend141';Session=95433;Exit=0;Chunk='73425a';TerminalCollected=$true},
    @{Name='packages29';Session=58665;Exit=0;Chunk='9a8cad';TerminalCollected=$true},
    @{Name='independent15';Session=1263;Exit=1;Chunk='340456';TerminalCollected=$true},
    @{Name='ruleParserDiagnosis';Session=$null;Exit=0;Chunk='37895b';TerminalCollected=$true},
    @{Name='frontend90';Session=77382;Exit=0;Chunk='aa5915';TerminalCollected=$true},
    @{Name='independent14';Session=7410;Exit=1;Chunk='7c08bc';TerminalCollected=$true},
    @{Name='mobileEntryDiagnosis';Session=$null;Exit=0;Chunk='f64a70';TerminalCollected=$true},
    @{Name='smtpMaintenanceWrapper';Session=54337;Exit=-1;Chunk='83d2b1';TerminalCollected=$true},
    @{Name='smtpCompletionInspection';Session=$null;Exit=0;Chunk='ccba6b';TerminalCollected=$true},
    @{Name='independent13';Session=45758;Exit=1;Chunk='1bc051';TerminalCollected=$true},
    @{Name='bindingInspection13';Session=$null;Exit=0;Chunk='dc2b97';TerminalCollected=$true},
    @{Name='bindingTiming13';Session=$null;Exit=0;Chunk='9d9453';TerminalCollected=$true},
    @{Name='startLimitInspection13';Session=$null;Exit=0;Chunk='38408a';TerminalCollected=$true},
    @{Name='frontend89';Session=66933;Exit=0;Chunk='76313d';TerminalCollected=$true},
    @{Name='independent12';Session=98499;Exit=1;Chunk='def327';TerminalCollected=$true},
    @{Name='competitorFieldDiagnosis';Session=$null;Exit=0;Chunk='4c4b94';TerminalCollected=$true},
    @{Name='independent11';Session=46345;Exit=1;Chunk='cfa724';TerminalCollected=$true},
    @{Name='reasonLabelDiagnostic';Session=$null;Exit=0;Chunk='8da9b5';TerminalCollected=$true},
    @{Name='independent10';Session=44755;Exit=1;Chunk='812527';TerminalCollected=$true},
    @{Name='quoteCollision10';Session=$null;Exit=0;Chunk='38ac18';TerminalCollected=$true},
    @{Name=('independent'+$IndependentRound.Substring(1));Session=$IndependentSessionId;Exit=0;Chunk=$IndependentTerminalChunk;TerminalCollected=$true},
    @{Name=('adjacent'+$AdjacentRound.Substring(1));Session=$AdjacentSessionId;Exit=0;Chunk=$AdjacentTerminalChunk;TerminalCollected=$true}
)
Require (@($Receipts|Where-Object{-not $_.TerminalCollected -or -not $_.Chunk}).Count -eq 0) 'Original terminal receipt missing'
$Receipts|ConvertTo-Json -Depth 4|Set-Content -LiteralPath (Join-Path $Output 'original-terminal-receipts.json') -Encoding utf8NoBOM
$null=Track (Join-Path $Output 'original-terminal-receipts.json')
$null=Track $PSCommandPath
$null=Track (Join-Path $Output 'original.ps1') (Hash $PSCommandPath)
foreach($Path in $Inputs.Keys){Require ((Hash $Path) -eq $Inputs[$Path]) ("Reconciliation input changed: "+$Path)}
$InputFile=Join-Path $Output 'inputs.json'
@($Inputs.Keys|Sort-Object|ForEach-Object{[pscustomobject]@{Path=$_;Hash=$Inputs[$_]}})|ConvertTo-Json -Depth 3|Set-Content -LiteralPath $InputFile -Encoding utf8NoBOM
$Summary=[pscustomobject]@{
    Passed=$true;Backend='r141';Frontend='r91';AcceptanceCount=18;Items=$Items;All18Complete=$true;GlobalComplete=$false
    Independent=$IndependentRound;Checks=$Current.checks.Count;Requests=$Current.requests.Count;UiRequests=$Current.uiRequests.Count
    CurrentInputs=$Inputs.Count;InputChanges=0;CurrentRuntimeFiles=$RuntimeFiles;IndependentInputCount=$CurrentInputs.Count;IndependentRuntimeInputCount=$CurrentRuntimeInputs.Count
    ProductImpact=$ProductImpact;HistoricalFailures=@($Failures.ToArray());HistoricalVisualFailures=@($VisualFailures.ToArray());HistoricalInputBindings=@($Bindings.ToArray());OriginalFailureResultsChanged=$false
    BusinessRunsPriorRuntimeWritten=$false;ReferenceSmtpStateUpdatedBetweenRuns=$true;ReferenceBusinessTables=23;ReferenceKept=$true;IndependentProcessesStopped=$true;IndependentDatabasesRetained=$true
    ReviewedImages=$Review.Images.Count;ImageReview=$ReviewPath;BrowserErrors=0;SecretScan=$Current.secretScan;RuntimeProtection=$CurrentRuntimeAfter
    CaptchaCounterWrites=0;CaptchaConfigurationWrites=0;SystemClockChanged=$false;ExternalMessagesSent=$false
    HistoricalDateFixturesDisclosed=$true;CreditExposureMeasurement=$Measurement[0];CreditRejection=$Fixture.creditRejection;RuleHitTransitions=$Fixture.ruleHitTransitions;CreditApprovalHistories=$Fixture.creditApprovalHistories;CompetitorFields=$Fixture.competitorPage;MobileEntries=$Fixture.mobileEntries;MobileEntryDiagnosis=$MobileDiagnosis;ParserDiagnosis=$ParserDiagnosis;HitPresentation=$Fixture.ruleHitPresentation;PresentationDiagnosis=$PresentationDiagnosis;ReadOnlyInspections=$Inspections;WorkflowWorkloadPacing=$Fixture.workflowPacing;PriorBindingDelayDiagnosis=$BindingTiming;LocalSmtpMaintenance=$SmtpMaintenance
    RuleVersionEvidence='Actual publish and rollback versions retained separately; hit-record table has no version field'
    ParserSourceFollowup=$SourceFollowup;HistoricalAdjacentFailures=@(@{Round='r181';Exit=1;OriginalTerminal='a6ce6e';OriginalsPreserved=$true;SourceConcatMatches=2;ChecksRetained=$true})
    OriginalTerminalReceipts=$Receipts;Adjacent=$AdjacentRound;AdjacentInputs=$AdjacentInputs.Count;Processes=9;HealthyServices=6;DeploymentResult=$DeploymentPath
    InputManifest=$InputFile;ProductModified=$false;ProductionModified=$false
    Remaining=@('E4 and remaining PRD items','Whole-project 35 PRDs / 681 items and deferred external integration')
}
$Summary|ConvertTo-Json -Depth 30|Set-Content -LiteralPath (Join-Path $Output 'result.json') -Encoding utf8NoBOM
"E3_ALL_ACCEPTANCE: passed=true; items=18; checks=$($Current.checks.Count); inputs=$($Inputs.Count); runtime_files=$RuntimeFiles; images=17; healthy=6; all18_complete=true; global_complete=false"
