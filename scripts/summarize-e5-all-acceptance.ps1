param([ValidatePattern('^r[1-9][0-9]*$')][string]$Round='r1',
    [Parameter(Mandatory=$true)][ValidatePattern('^r[1-9][0-9]*$')][string]$IndependentRound,
    [ValidatePattern('^r[1-9][0-9]*$')][string]$BackendRound='r145',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$FrontendRound='r97',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$PackageRound='r33',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$DeploymentRound='r13',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$AdjacentRound='r184',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$SchemaRound='r1',
    [Parameter(Mandatory=$true)][string]$ImageReviewPath,
    [Parameter(Mandatory=$true)][string]$TerminalReceiptsPath)
$ErrorActionPreference='Stop'
. 'D:\CloudFlowPro\.cloudflow-runtime\use-data-drive.ps1'
$Root='D:\CloudFlowPro'
$CacheRoot='D:\CloudFlowProCache'
$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
$Reference=Join-Path $Root '.cloudflow-runtime/batch-g-integration/9799534e1a3a47b5958330f14ae16dc7'
$Output=Join-Path $Evidence "e5-all-acceptance-20261010-$Round"
if(Test-Path -LiteralPath $Output){throw 'Retain prior E5 reconciliation evidence'}
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

function ArchiveDirectory([string]$Directory){
    if(-not (Test-Path -LiteralPath $Directory -PathType Container)){return}
    foreach($File in Get-ChildItem -LiteralPath $Directory -Recurse -File){
        $Copy=Track $File.FullName
        $Archives[$Inputs[$Copy]]=$Copy
    }
}
$CurrentDirectory=Join-Path $Evidence "e5-marketing-independent-20261010-$IndependentRound"
$Directories=@(Get-ChildItem -LiteralPath $Evidence -Directory|Where-Object {$_.Name -match '^e5-marketing-independent-20261010-r([1-9][0-9]*)$' -and [int]$Matches[1] -le [int]$IndependentRound.Substring(1)}|Sort-Object Name)
Require ($Directories.Count -eq [int]$IndependentRound.Substring(1) -and $Directories.FullName -contains $CurrentDirectory) 'E5 original round history incomplete'
$Preparations=@('e5-marketing-prep-20261010-r1','e5-export-audit-prep-20261010-r1','e5-tracking-status-prep-20261010-r1','e5-channel-config-prep-20261010-r1','e5-delivery-diagnosis-prep-20261010-r1','e5-quota-observation-prep-20261010-r1','e5-channel-diagnosis-20261010-r1','e5-delivery-diagnosis-20261010-r1','e5-quota-projection-prep-20261010-r1','e5-delivery-diagnosis-20261010-r2','e5-retention-verifier-prep-20261010-r1','e5-refund-fixture-prep-20261010-r1','e5-refund-diagnosis-20261010-r1','e5-refund-diagnosis-20261010-r2','e5-funnel-visual-prep-20261010-r1')
foreach($PreparationName in $Preparations){ArchiveDirectory (Join-Path $Evidence $PreparationName)}
$MaintenanceDirectories=@(Get-ChildItem -LiteralPath $Evidence -Directory|Where-Object Name -Match '^e[45]-smtp-maintenance-20261010-r[1-9][0-9]*$')
foreach($Maintenance in $MaintenanceDirectories){ArchiveDirectory $Maintenance.FullName}
$SchemaDirectory=Join-Path $Evidence "e5-campaign-archive-schema-20261010-$SchemaRound"
ArchiveDirectory $SchemaDirectory
foreach($Prior in Get-ChildItem -LiteralPath $Evidence -Directory|Where-Object {$_.Name -match '^e5-all-acceptance-20261010-r([1-9][0-9]*)$' -and [int]$Matches[1] -lt [int]$Round.Substring(1)}){ArchiveDirectory $Prior.FullName}
foreach($Directory in $Directories){ArchiveDirectory $Directory.FullName}
foreach($Version in @('r31','r32',$PackageRound)|Select-Object -Unique){ArchiveDirectory (Join-Path $Evidence "backend-executable-verification-20261006-$Version")}
foreach($PreparationName in $Preparations){
    $Preparation=Join-Path $Evidence $PreparationName
    foreach($ManifestName in @('before-inputs.json','before-runtime-inputs.json','before-extra.json')){
        $ManifestPath=Join-Path $Preparation $ManifestName
        if(Test-Path -LiteralPath $ManifestPath){Bind (Manifest $ManifestPath)}
    }
}
foreach($Maintenance in $MaintenanceDirectories){
    $ManifestPath=Join-Path $Maintenance.FullName 'before-inputs.json'
    if(Test-Path -LiteralPath $ManifestPath){Bind (Manifest $ManifestPath)}
}
Bind (Manifest (Join-Path $SchemaDirectory 'before-inputs.json'))
$Builds=@{}
foreach($Definition in @(@{Kind='backend';Version=$BackendRound;Phase='Backend';Count=3851},@{Kind='frontend';Version=$FrontendRound;Phase='Frontend';Count=1483})){
    $Index=Manifest (Join-Path $Evidence "h3-portal-finance-20261002-$($Definition.Kind)-$($Definition.Version)-inputs.json")
    Require ($Index.Count -eq $Definition.Count) 'E5 product input count differs'
    foreach($Path in $Index.Keys){$null=Track $Path $Index[$Path]}
    $Builds[$Definition.Kind]=$Index
    $Log=Track (Join-Path $Evidence "h3-portal-finance-20261002-$($Definition.Kind)-$($Definition.Version).log")
    Require ((Get-Content -LiteralPath $Log -Raw).Contains("FINANCE_BUILD: phase=$($Definition.Phase); files=$($Definition.Count); changed=0; exit=0")) 'Original E5 build success missing'
}
$ExpectedChanges=@('cloudflow-backend/cloudflow-auth/src/main/java/com/cloudflow/auth/controller/SysMessageChannelController.java','cloudflow-backend/cloudflow-auth/src/main/java/com/cloudflow/auth/service/impl/MessageChannelServiceImpl.java','cloudflow-backend/cloudflow-service-crm/src/main/java/com/cloudflow/crm/domain/CrmCampaign.java','cloudflow-backend/cloudflow-service-crm/src/main/java/com/cloudflow/crm/domain/CrmCampaignLog.java','cloudflow-backend/cloudflow-service-crm/src/main/java/com/cloudflow/crm/job/CrmCustomerOperationsJobs.java','cloudflow-backend/cloudflow-service-crm/src/main/java/com/cloudflow/crm/mapper/CrmCampaignLogMapper.java','cloudflow-backend/cloudflow-service-crm/src/main/java/com/cloudflow/crm/service/impl/CrmCampaignLogArchiveService.java','cloudflow-backend/cloudflow-service-crm/src/main/java/com/cloudflow/crm/service/impl/CrmTargetListService.java','cloudflow-backend/cloudflow-service-crm/src/main/java/com/cloudflow/crm/support/CrmCampaignLogArchiveCodec.java','cloudflow-backend/cloudflow-service-crm/src/main/resources/mapper/CrmCampaignLogMapper.xml','cloudflow-backend/DB/05.cloudflow-crm.sql','cloudflow-backend/DB/06.cloudflow-business-seed.sql','cloudflow-backend/DB/07.cloudflow-demo-seed.sql','cloudflow-frontend/src/components/crm/operations/OperationsKit.tsx','cloudflow-frontend/src/pages/CrmCampaignPage.tsx','cloudflow-frontend/src/pages/CrmTargetListPage.tsx','cloudflow-frontend/src/router.tsx')
$ExpectedChanges=@($ExpectedChanges|ForEach-Object{Full $_})
$ProductImpact=@()
foreach($Definition in @(@{Kind='backend';Version='r142'},@{Kind='frontend';Version='r95'})){
    $Before=Manifest (Join-Path $Evidence "h3-portal-finance-20261002-$($Definition.Kind)-$($Definition.Version)-inputs.json")
    $After=$Builds[$Definition.Kind]
    foreach($Path in $After.Keys|Where-Object{$Before[$_] -ne $After[$_]}){
        Require ($ExpectedChanges -contains $Path) 'Unexpected E5 product impact'
        if($Before.ContainsKey($Path)){
            Require ($Archives.ContainsKey($Before[$Path])) 'Original E5 product source unavailable'
            $null=Track $Archives[$Before[$Path]] $Before[$Path]
        }
        $ProductImpact+=@{Path=$Path;BeforeHash=$Before[$Path];AfterHash=$After[$Path];Added=(-not $Before.ContainsKey($Path))}
    }
    Require (@($Before.Keys|Where-Object{-not $After.ContainsKey($_)}).Count -eq 0) 'Unexpected removed E5 product input'
}
Require ($ProductImpact.Count -eq 17 -and @($ProductImpact|Where-Object Added).Count -eq 2) 'Expected E5 seventeen-file product change differs'
$History=[Collections.Generic.List[object]]::new()
foreach($Directory in $Directories){
    $Launcher=Json (Join-Path $Directory.FullName 'launcher-result.json')
    $RunNumber=[int]($Directory.Name -replace '^.*-r','')
    $ExpectedBackend=if($RunNumber -le 4){'r143'}elseif($RunNumber -le 6){'r144'}else{$BackendRound}
    $ExpectedFrontend=if($RunNumber -le 10){'r96'}else{$FrontendRound}
    Require ($Launcher.backend -eq $ExpectedBackend -and $Launcher.frontend -eq $ExpectedFrontend) 'Original E5 execution versions differ'
    foreach($Build in @(@{Kind='backend';Version=$Launcher.backend},@{Kind='frontend';Version=$Launcher.frontend})){
        Bind (Manifest (Join-Path $Evidence "h3-portal-finance-20261002-$($Build.Kind)-$($Build.Version)-inputs.json"))
    }
    Require ($Launcher.inputsUnchanged -and $Launcher.processesStopped -and $Launcher.referenceKept -and $Launcher.referenceBusinessTables -eq 40 -and -not $Launcher.priorRuntimeWritten -and $Launcher.databaseRetained) 'Original E5 preservation boundary differs'
    Require ($Launcher.stopErrors.Count -eq 0 -and $Launcher.captchaCounterWrites -eq 0 -and $Launcher.captchaConfigurationWrites -eq 0 -and -not $Launcher.externalMessagesSent -and -not $Launcher.systemClockChanged) 'E5 side-effect boundary differs'
    $RunInputs=Manifest (Join-Path $Directory.FullName 'inputs.json')
    $RuntimeInputs=Manifest (Join-Path $Directory.FullName 'runtime-inputs.json')
    $Originals=@(Get-ChildItem -LiteralPath (Join-Path $Directory.FullName 'originals') -Recurse -File)
    Require ($RunInputs.Count -eq $Launcher.inputs -and $RuntimeInputs.Count -eq $Launcher.runtimeInputs -and $Originals.Count -eq $Launcher.executionOriginals) 'E5 executed input inventory differs'
    Bind $RunInputs;Bind $RuntimeInputs
    $Database=Json (Join-Path $Directory.FullName 'database/result.json')
    Bind (Manifest (Join-Path $Directory.FullName 'database/inputs.json'))
    Require ($Database.backend -eq $Launcher.backend -and $Database.databaseRetained -and -not $Database.originalRuntimeWritten -and $Database.actualPackagedDependencies) 'E5 database execution scope differs'
    $Before=Json (Join-Path $Directory.FullName 'reference-business-before.json')
    $After=Json (Join-Path $Directory.FullName 'reference-business-after.json')
    Require (@($Before.PSObject.Properties).Count -eq 40) 'E5 original business coverage differs'
    foreach($Property in $Before.PSObject.Properties){Require ($After.($Property.Name) -eq $Property.Value) 'Original business table changed'}
    $Run=Full $Launcher.run
    Require ((Split-Path -Parent $Run) -eq (Join-Path $Root '.cloudflow-runtime/batch-g-integration') -and $Run -ne $Reference) 'E5 independent runtime path differs'
    $State=Json (Track (Join-Path $Run 'state.json'))
    $ExpectedProcesses=if($Launcher.databaseOnly){3}else{9}
    Require ($State.status -eq 'STOPPED' -and $State.processes.Count -eq $ExpectedProcesses -and $State.services.Count -eq 6) 'E5 independent processes not stopped'
    foreach($Entry in $State.processes){$Observed=Get-CimInstance Win32_Process -Filter "ProcessId=$($Entry.id)";Require (-not $Observed -or -not $Observed.CommandLine.Contains($Entry.marker)) 'Independent E5 process still active'}
    $Business=$null;$Protection=$null
    $BusinessPath=Join-Path $Directory.FullName 'result.json'
    if(Test-Path -LiteralPath $BusinessPath){
        $Business=Json $BusinessPath
        Require ($Business.backend -eq $Launcher.backend -and $Business.frontend -eq $Launcher.frontend -and -not $Launcher.databaseOnly) 'E5 business result version or phase differs'
        $Protection=Json (Join-Path $Directory.FullName 'runtime-after.json')
        Require ($Protection.passed -and $Protection.leaks -eq 0 -and $Protection.databaseLeaks -eq 0 -and $Protection.counterWrites -eq 0 -and $Protection.configurationWrites -eq 0) 'E5 runtime protection failed'
        Require ($Business.evidence.preservation -and $Business.evidence.secrets -and $Business.privacy.leaks -eq 0) 'E5 business preservation or privacy failed'
    }
    if($Directory.FullName -eq $CurrentDirectory){
        Require ($Launcher.passed -and $Launcher.verifierExit -eq 0 -and -not $Launcher.databaseOnly -and $Launcher.businessHttpExecuted -and $Database.passed -and $Business.passed) 'Current complete E5 execution did not pass'
        $Current=$Business;$CurrentLauncher=$Launcher;$CurrentDatabase=$Database;$CurrentProtection=$Protection;$CurrentInputs=$RunInputs;$CurrentRuntimeInputs=$RuntimeInputs
    }else{
        if($Launcher.databaseOnly){
            Require (-not $Business -and -not $Launcher.businessHttpExecuted -and [bool]$Launcher.passed -eq [bool]$Database.passed) 'Database-only E5 result was overstated'
            $Kind='DATABASE_ONLY'
        }elseif(-not $Business){
            Require (-not $Launcher.passed -and -not $Database.passed) 'Failed database phase was overstated'
            $Kind='DATABASE_FAILURE_BEFORE_BUSINESS'
        }elseif($RunNumber -eq 10){
            Require ($Launcher.passed -and $Business.passed -and $Launcher.verifierExit -eq 0) 'Original R10 business success was changed'
            $Kind='BUSINESS_PASSED_VISUAL_REJECTED'
        }else{
            Require (-not $Launcher.passed -and -not $Business.passed -and $Launcher.verifierExit -eq 1) 'Historical E5 business failure was changed'
            $Kind='BUSINESS_FAILURE'
        }
        $History.Add(@{Round=$Directory.Name;Kind=$Kind;Passed=[bool]$Launcher.passed;All21Complete=$false;DatabasePassed=[bool]$Database.passed;BusinessExecuted=($null -ne $Business);Checks=$Business.checks.Count;Reason=if($Business){$Business.failure}else{$Database.failure};InputsUnchanged=$true;ProcessesStopped=$true;Retained=$true})
    }
}

foreach($Flag in @('campaigns','audiences','smtp','publicTracking','scheduling','cancellation','rateLimits','attribution','revenue','retention','reports','audits','permissions','desktop','mobile','preservation','secrets')){
    Require ($Current.evidence.$Flag -eq $true) ('Current E5 evidence missing: '+$Flag)
}
Require ($Current.browserErrors.Count -eq 0 -and -not $Current.officialProviderContacted -and -not $Current.priorRuntimeWritten -and -not $Current.globalComplete) 'E5 business boundary differs'
Require ($CurrentDatabase.assertions -eq 2567 -and $CurrentDatabase.archiveAssertions -eq 2112) 'E5 current database coverage differs'
$Required='{"1":["maximum_campaign_budget_is_exact_string","stale_save_cannot_overwrite_exact_budget","no_receipts_give_negative_one_roi","desktop_restores_exact_maximum_budget","mobile_reload_exact_campaign_amount_390","mobile_reload_exact_campaign_amount_320","mobile_reopen_restores_saved_cost_390","mobile_reopen_restores_saved_cost_320"],"2":["query_list_applies_department_filter_and_industry","manual_list_preserves_selected_member_and_masks_email","manual_lists_support_all_three_real_member_types","query_refresh_includes_new_matching_member","mobile_target_list_restores_saved_query_source"],"3":["真实名单按排除退订无效重复邮箱计算精确两人","普通预览不返回完整收件邮箱","冻结两名正式收件人且测试独立保留"],"4":["实际TLS认证成功且连通性测试不发送业务邮件","逐人真实SMTP接纳且不存在抄送泄露","联系人公司活动正文真实个性化并转义","channel_editor_receives_full_sender_and_masked_secrets","channel_readonly_sender_stays_masked","channel_readonly_cannot_edit_sender","channel_foreign_tenant_cannot_read_sender"],"5":["测试仅发送到指定邮箱且不计活动统计","冻结两名正式收件人且测试独立保留"],"6":["定时发送沿用正式三十秒周期","定时未到只冻结名单而未发送","安排后五点五秒观察仍保持未发","实际发送时间不早于指定时间","到期集中任务完成实际邮件发送"],"7":["cancellation_observed_during_actual_sending","cancelled_unsent_recipients_never_attempted_smtp","cancellation_retains_one_sent_and_stops_two","cancelled_campaign_has_exactly_one_actual_email","channel_page_restores_valid_sender_1440","channel_page_reopen_preserves_sender_and_limit_1440"],"8":["third_recipient_waits_at_minute_boundary","actual_smtp_attempts_do_not_exceed_two_per_minute","all_three_actual_emails_arrive_once_across_minutes","channel_page_restores_valid_sender_390","channel_page_reopen_preserves_sender_and_limit_390"],"9":["匿名并发打开返回不可缓存GIF","并发打开仅产生一条唯一观察","archived_sent_permits_one_late_open"],"10":["点击只跳转已冻结白名单地址","重复点击仅计一名收件人","archived_original_click_keeps_canonical_dedup"],"11":["白名单移除的冻结跳转地址立即拒绝","开放重定向参数被拒绝"],"12":["同一邮件三个用途的令牌互不相同","打开令牌不能用作点击权限","随机伪造令牌不能用作退订","真实Redis单令牌每分钟前20次允许第21次限流","更换令牌仍受真实IP每分钟前120次允许第121次拒绝"],"13":["退订确认页不回显客户邮箱且GET不产生退订","浏览器隐藏来源的公开退订表单可以真实提交","真实退订原因保留文字且不明文保存任何追踪令牌","公开退订配置不放宽登录接口的来源限制","停用追踪后匿名页面仍可立即退订","重复匿名POST退订保持同一抑制事实"],"14":["跨任务退订和同邮箱去重即时生效"],"15":["actual_campaign_lead_conversion_inherits_source","created_source_contributes_one_lead_and_opportunity"],"16":["before_won_actual_receipt_sum","before_won_exact_roi","won_without_receipt_actual_receipt_sum","first_actual_receipt_actual_receipt_sum","first_actual_receipt_exact_roi","two_actual_receipts_actual_receipt_sum","two_actual_receipts_exact_roi","unlinked_receipt_excluded_actual_receipt_sum","zero_cost_roi_undefined_exact_roi","refunds_keep_original_receipt_facts","duplicate_completed_task_preserves_revenue_facts"],"17":["formal_attribution_window_is_thirty_days","attribution_before_start_exact_revenue_and_funnel","attribution_at_start_exact_revenue_and_funnel","attribution_last_window_second_exact_revenue_and_funnel","attribution_next_day_excluded_exact_revenue_and_funnel"],"18":["funnel_actual_SENT_count","funnel_actual_DELIVERED_count","funnel_actual_OPENED_count","funnel_actual_CLICKED_count","funnel_actual_UNSUBSCRIBED_count","funnel_business_stages_match_actual_source","actual_funnel_explains_observed_delivery_1440","actual_funnel_explains_observed_delivery_320","comparison_displays_two_actual_campaigns","actual_funnel_all_seven_stage_counts_1440","actual_funnel_labels_not_clipped_1440","actual_funnel_all_seven_stage_counts_320","actual_funnel_labels_not_clipped_320"],"19":["repeated_recalculation_keeps_all_business_counters","archival_keeps_all_event_identity_and_historical_count","actual_aggregate_preserves_email_statistics","repeat_archive_keeps_immutable_event_contents"],"20":["超过配置阈值要求精确人数二次确认","人数确认必须与当前预览完全相同","活动变化后旧预览不能继续确认","重新预览得到绑定最新内容的摘要"],"21":["authorized_export_returns_masked_csv","export_has_real_high_risk_audit","export_audit_binds_actual_actor_list_count_time_and_no_contact_details","readonly_cannot_export_contacts","personal_scope_cannot_read_department_owned_list","cross_tenant_cannot_read_target_list"]}'|ConvertFrom-Json -AsHashtable
Require ($Required.Count -eq 21 -and @($Current.acceptance.PSObject.Properties).Count -eq 21) 'E5 acceptance inventory incomplete'
$Items=@(foreach($Number in 1..21){
    $Key=[string]$Number
    $Labels=@($Current.acceptance.$Key)
    Require ($Labels.Count -gt 0) ('E5 empty actual acceptance group: '+$Key)
    foreach($Label in $Labels){Require ($Current.checks -contains $Label) 'E5 acceptance references an unexecuted assertion'}
    foreach($Expected in $Required[$Key]){Require ($Labels -contains $Expected) ('E5 required actual assertion missing from AC-'+$Key+': '+$Expected)}
    [pscustomobject]@{Id=('AC-'+$Key);Passed=$true;BusinessResult=(Join-Path $CurrentDirectory 'result.json');RequiredChecks=$Required[$Key];ExecutedChecks=@($Labels|Select-Object -Unique)}
})
$Fixture=$Current.fixture
Require ($Fixture.mailFlow.testRecipientCount -eq 1 -and $Fixture.mailFlow.formalRecipientCount -eq 2 -and $Fixture.mailFlow.naturalScheduledCount -eq 1 -and -not $Fixture.mailFlow.externalDelivery) 'E5 actual local email delivery facts missing'
Require ($Fixture.scheduledEmail.naturalScheduler -and $Fixture.scheduledEmail.dispatchIntervalMs -eq 30000) 'E5 natural scheduled delivery differs'
Require ($Fixture.cancellation.sent -eq 1 -and $Fixture.cancellation.stopped -eq 2 -and $Fixture.cancellation.neverAttempted -eq 2 -and $Fixture.cancellation.naturalRecovery) 'E5 cancellation during actual sending incomplete'
Require ($Fixture.channelRate.limitPerMinute -eq 2 -and $Fixture.channelRate.totalAccepted -eq 3 -and $Fixture.channelRate.naturalRecovery -and $Fixture.channelRate.counterWrites -eq 0) 'E5 actual channel rate limit incomplete'
$MinuteCounts=@($Fixture.channelRate.actualAttemptsByMinute.PSObject.Properties.Value|Sort-Object)
Require ($MinuteCounts.Count -eq 2 -and ($MinuteCounts -join ',') -eq '1,2') 'Actual delivery attempts exceed channel minute boundary'
Require ($Fixture.trackingRate.tokenAllowed -eq 20 -and $Fixture.trackingRate.tokenRejected -eq 21 -and $Fixture.trackingRate.ipAllowed -eq 120 -and $Fixture.trackingRate.ipRejected -eq 121 -and $Fixture.trackingRate.naturalWindow -and $Fixture.trackingRate.redisWrites -eq 0) 'E5 real tracking limit coverage incomplete'
Require ($Fixture.refunds.Count -eq 3 -and $Fixture.revenue.actualWorkflow -and $Fixture.revenue.finalIncome -eq '0.00' -and $Fixture.revenue.refunds -eq 3) 'E5 actual receipt-specific refund chain incomplete'
foreach($Refund in $Fixture.refunds){
    Require ($Refund.stages.Count -eq 2 -and $Refund.stages[0].actor -ne $Refund.stages[1].actor -and $Refund.stages[0].node -eq 'customer_owner' -and $Refund.stages[1].node -eq 'finance_review') 'Refund lacked the two independent actual approval stages'
    foreach($Suffix in @('_only_selected_receipt','_receivable_updated')){Require ($Current.acceptance.'16' -contains ('approved_refund_'+$Refund.id+$Suffix)) 'Refund evidence does not bind selected original receipt'}
    foreach($Suffix in @('_actual_receipt_sum','_exact_roi')){Require ($Current.acceptance.'16' -contains ('refund_'+$Refund.id+$Suffix)) 'Refund revenue or exact ROI evidence missing'}
}
Require (@($Fixture.measurements|Where-Object kind -EQ 'attribution_boundary').Count -eq 4) 'E5 exact attribution boundary count differs'
Require ($Fixture.retention.realJob -and $Fixture.retention.months -eq 12 -and $Fixture.retention.batchLimit -eq 200 -and $Fixture.retention.maximumRestoredBytes -eq 32768 -and $Fixture.retention.scheduleIntervalMs -eq 300000 -and $Fixture.retention.lateOpenAdded -eq 1 -and $Fixture.retention.repeatedClickAdded -eq 0 -and -not $Fixture.retention.systemClockChanged) 'E5 lossless archived metadata and late tracking evidence incomplete'
Require ($Fixture.retentionJobs.Count -eq 2 -and @($Fixture.retentionJobs.executeNo|Select-Object -Unique).Count -eq 2) 'E5 archive completion identities missing'
foreach($Execution in $Fixture.retentionJobs){
    Require ($Execution.status -eq 'SUCCESS' -and -not [string]::IsNullOrWhiteSpace([string]$Execution.ended) -and -not [string]::IsNullOrWhiteSpace([string]$Execution.executeNo)) 'E5 archive job was not observed complete'
}
Require ($Current.acceptance.'19' -contains 'archive_job_has_actual_execution_identity' -and $Current.acceptance.'19' -contains 'repeat_archive_has_two_completed_executions') 'E5 successful archive executions are not bound to acceptance'
$ReviewPath=Track $ImageReviewPath
$Review=Json $ReviewPath
Require ($Review.ActuallyViewed -and $Review.VisualAccepted -and $Review.Round -eq $IndependentRound -and $Review.Images.Count -eq $Current.images.Count -and $Review.Images.Count -eq 12) 'E5 actual image review incomplete'
foreach($Image in $Review.Images){
    $Actual=@($Current.images|Where-Object name -EQ $Image.Name)
    Require ($Image.ActuallyViewed -and $Image.VisualAccepted -and $Actual.Count -eq 1 -and -not $Actual[0].actuallyViewed -and -not $Actual[0].visualAccepted -and $Actual[0].hash -eq $Image.Hash) 'E5 original screenshot metadata was changed or image was not viewed'
    $null=Track (Join-Path $CurrentDirectory $Image.Name) $Image.Hash
}
$HistoricalReviews=@()
foreach($ReviewDirectory in Get-ChildItem -LiteralPath $Evidence -Directory|Where-Object Name -Match '^e5-image-review-20261010-r[1-9][0-9]*$'){
    $HistoricalReviewPath=Join-Path $ReviewDirectory.FullName 'manifest.json'
    if([IO.Path]::GetFullPath($HistoricalReviewPath) -eq $ReviewPath){continue}
    $HistoricalReview=Json (Track $HistoricalReviewPath)
    Require ($HistoricalReview.ActuallyViewed -and -not $HistoricalReview.OriginalResultChanged) 'Historical E5 image review incomplete'
    $PriorDirectory=Join-Path $Evidence ('e5-marketing-independent-20261010-'+$HistoricalReview.Round)
    $Prior=Json (Track (Join-Path $PriorDirectory 'result.json'))
    foreach($Image in $HistoricalReview.Images){
        $Actual=@($Prior.images|Where-Object name -EQ $Image.Name)
        Require ($Image.ActuallyViewed -and $Actual.Count -eq 1 -and $Actual[0].hash -eq $Image.Hash -and -not $Actual[0].actuallyViewed) 'Historical E5 image binding differs'
        $null=Track (Join-Path $PriorDirectory $Image.Name) $Image.Hash
    }
    $HistoricalReviews+=@{Round=$HistoricalReview.Round;ActuallyViewed=$true;VisualAccepted=$HistoricalReview.VisualAccepted;Images=$HistoricalReview.Images.Count;Manifest=$HistoricalReviewPath}
}
foreach($Historical in $History){
    $Directory=Join-Path $Evidence $Historical.Round
    $ResultPath=Join-Path $Directory 'result.json'
    if(Test-Path -LiteralPath $ResultPath){
        $Prior=Json $ResultPath
        if($Prior.images.Count -gt 0){
            $RoundName='r'+($Historical.Round -replace '^.*-r','')
            $Found=@($HistoricalReviews|Where-Object Round -EQ $RoundName)
            Require ($Found.Count -eq 1 -and $Found[0].Images -eq $Prior.images.Count) 'Historical E5 screenshots not actually reviewed'
        }
    }
}
$Schema=Json (Track (Join-Path $SchemaDirectory 'result.json'))
Require ($Schema.Passed -and $Schema.Backend -eq $BackendRound -and $Schema.Tables -eq 374 -and $Schema.Columns -eq 4 -and $Schema.Indexes -eq 1 -and $Schema.ReferenceBusinessTables -eq 40 -and $Schema.OriginalBusinessValuesKept -and $Schema.ArchiveRowsWritten -eq 0 -and -not $Schema.ProductMigrationCreated -and -not $Schema.ProductionModified) 'Owned local archive schema preparation differs'
$AdjacentDirectory=Join-Path $Evidence "h3-portal-finance-adjacent-20261002-$AdjacentRound"
$AdjacentInputs=Manifest (Join-Path $AdjacentDirectory 'inputs.json')
Bind $AdjacentInputs
$AdjacentLog=Get-Content -LiteralPath (Track (Join-Path $AdjacentDirectory 'summary.log')) -Raw
Require ($AdjacentLog.Contains("H3_FINANCE_ADJACENT: files=$($AdjacentInputs.Count); changed=0; exit=0; production_modified=false") -and $AdjacentLog.Contains('name=formal-01-07-and-oa-behavior; exit=0')) 'E5 adjacent original execution did not pass'
foreach($File in Get-ChildItem -LiteralPath $AdjacentDirectory -File){$null=Track $File.FullName}
$PackageDirectory=Join-Path $Evidence "backend-executable-verification-20261006-$PackageRound"
$Packages=Json (Track (Join-Path $PackageDirectory 'result.json'))
Require ($Packages.Passed -and $Packages.BackendRound -eq $BackendRound -and $Packages.InputChanges -eq 0 -and $Packages.Services.Count -eq 6) 'E5 current package proof differs'
$DeploymentDirectory=Join-Path $Evidence "e1-reminder-deployment-20261007-$DeploymentRound"
ArchiveDirectory $DeploymentDirectory
Bind (Manifest (Join-Path $DeploymentDirectory 'inputs.json'))
$DeploymentPath=Track (Join-Path $DeploymentDirectory 'result.json')
$Deployment=Json $DeploymentPath
Require ($Deployment.Passed -and $Deployment.Backend -eq $BackendRound -and $Deployment.PackageRound -eq $PackageRound -and $Deployment.InputChanges -eq 0 -and $Deployment.HealthyServices -eq 6 -and -not $Deployment.ProductionModified) 'E5 actual local deployment proof differs'
$State=Json (Track (Join-Path $Reference 'state.json'))
Require ($State.status -eq 'RUNNING' -and $State.processes.Count -eq 9 -and $State.services.Count -eq 6) 'Reference runtime structure differs'
foreach($Entry in $State.processes){
    $Observed=Get-CimInstance Win32_Process -Filter "ProcessId=$($Entry.id)"
    Require ($Observed -and $Observed.CommandLine.Contains($Entry.marker)) 'Reference process ownership changed'
}
$RuntimeFiles=0
foreach($Service in $State.services){
    $Arguments=@(Get-Content -LiteralPath (Track (Join-Path $Reference "$($Service.name)/service.args")))
    $Index=[Array]::IndexOf($Arguments,'-cp')
    Require ($Index -ge 0 -and $Arguments[$Index+2] -eq 'org.springframework.boot.loader.launch.JarLauncher') 'E5 layered runtime launch absent'
    $Layer=Full ($Arguments[$Index+1].Trim('"'))
    $Package=@($Packages.Services|Where-Object Name -EQ $Service.name)
    Require ($Package.Count -eq 1 -and $Layer -eq (Join-Path $Reference ("$($Service.name)/artifacts/"+$Package[0].Hash.ToLowerInvariant()+'-layered'))) 'E5 runtime package differs from actual build'
    $null=Track (Join-Path $Root $Package[0].Path) $Package[0].Hash
    $Files=@(Get-ChildItem -LiteralPath $Layer -Recurse -Force)
    Require (@($Files|Where-Object{$_.Attributes -band [IO.FileAttributes]::ReparsePoint}).Count -eq 0) 'Redirected E5 runtime layer'
    foreach($File in @($Files|Where-Object{-not $_.PSIsContainer})){$null=Track $File.FullName;$RuntimeFiles++}
    Require ((Invoke-RestMethod -Uri "http://127.0.0.1:$($Service.healthPort)/actuator/health" -TimeoutSec 15).status -eq 'UP') 'Reference service unhealthy'
}
Require ($RuntimeFiles -eq $Deployment.RuntimeFiles) 'E5 deployment runtime file count differs'
$ReceiptFile=Track $TerminalReceiptsPath
$Receipts=@(Json $ReceiptFile)
foreach($Name in @(('backend'+$BackendRound.Substring(1)),('frontend'+$FrontendRound.Substring(1)),('packages'+$PackageRound.Substring(1)),('deployment'+$DeploymentRound.Substring(1)),('independent'+$IndependentRound.Substring(1)),('adjacent'+$AdjacentRound.Substring(1)),('schema'+$SchemaRound.Substring(1)))){
    $Receipt=@($Receipts|Where-Object Name -EQ $Name)
    Require ($Receipt.Count -eq 1 -and $Receipt[0].TerminalCollected -and $Receipt[0].Exit -eq 0 -and [string]$Receipt[0].Chunk -match '^[a-f0-9]+$') 'Original E5 successful terminal receipt missing'
}
foreach($Receipt in $Receipts){Require ($Receipt.TerminalCollected -and [string]$Receipt.Chunk -match '^[a-f0-9]+$') 'Original E5 terminal evidence incomplete'}
$null=Track $PSCommandPath
$null=Track (Join-Path $Output 'original.ps1') (Hash $PSCommandPath)
foreach($Path in $Inputs.Keys){Require ((Hash $Path) -eq $Inputs[$Path]) ("E5 reconciliation input changed: "+$Path)}
$InputFile=Join-Path $Output 'inputs.json'
@($Inputs.Keys|Sort-Object|ForEach-Object{[pscustomobject]@{Path=$_;Hash=$Inputs[$_]}})|ConvertTo-Json -Depth 3|Set-Content -LiteralPath $InputFile -Encoding utf8NoBOM
$Summary=[pscustomobject]@{
    Passed=$true;Backend=$BackendRound;Frontend=$FrontendRound;AcceptanceCount=21;Items=$Items;All21Complete=$true;GlobalComplete=$false
    Independent=$IndependentRound;Checks=$Current.checks.Count;DatabaseChecks=$CurrentDatabase.assertions;ArchiveDatabaseChecks=$CurrentDatabase.archiveAssertions;Requests=$Current.requests.Count;UiRequests=$Current.uiRequests.Count
    CurrentInputs=$Inputs.Count;InputChanges=0;CurrentRuntimeFiles=$RuntimeFiles;IndependentInputCount=$CurrentInputs.Count;IndependentRuntimeInputCount=$CurrentRuntimeInputs.Count;ExecutionOriginals=$CurrentLauncher.executionOriginals
    ProductImpact=$ProductImpact;HistoricalRounds=@($History.ToArray());HistoricalImageReviews=$HistoricalReviews;HistoricalInputBindings=@($Bindings.ToArray());OriginalFailureResultsChanged=$false
    IndependentPriorRuntimeWritten=$false;ReferenceBusinessTables=40;ReferenceKeptDuringIndependentChecks=$true;IndependentProcessesStopped=$true;IndependentDatabasesRetained=$true
    ReviewedImages=$Review.Images.Count;ImageReview=$ReviewPath;BrowserErrors=0;Privacy=$Current.privacy;RuntimeProtection=$CurrentProtection
    MailFlow=$Fixture.mailFlow;Cancellation=$Fixture.cancellation;ChannelRate=$Fixture.channelRate;TrackingRate=$Fixture.trackingRate;Revenue=$Fixture.revenue;Refunds=$Fixture.refunds;Retention=$Fixture.retention;RetentionJobs=$Fixture.retentionJobs
    CaptchaCounterWrites=0;CaptchaConfigurationWrites=0;SystemClockChanged=$false;ExternalMessagesSent=$false
    AmountSchema='Campaign budget, cost and revenue DECIMAL(16,2) maximum 99999999999999.99 with exact JSON strings; ROI DECIMAL(20,4) exact JSON string; zero cost has undefined ROI'
    OriginalTerminalReceipts=$Receipts;Adjacent=$AdjacentRound;AdjacentInputs=$AdjacentInputs.Count;Processes=9;HealthyServices=6;PackageRound=$PackageRound;DeploymentRound=$DeploymentRound;DeploymentResult=$DeploymentPath;SchemaPreparation=$Schema
    InputManifest=$InputFile;ProductModified=$false;ProductionModified=$false
    Remaining=@('H3 current-month reversal statistics and commission/payroll','Whole-project 35 PRDs / 681 items and deferred external integration')
}
$Summary|ConvertTo-Json -Depth 40|Set-Content -LiteralPath (Join-Path $Output 'result.json') -Encoding utf8NoBOM
"E5_ALL_ACCEPTANCE: passed=true; items=21; checks=$($Current.checks.Count); database=$($CurrentDatabase.assertions); inputs=$($Inputs.Count); runtime_files=$RuntimeFiles; images=$($Review.Images.Count); healthy=6; all21_complete=true; global_complete=false"

