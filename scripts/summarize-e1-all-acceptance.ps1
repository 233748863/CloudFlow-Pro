param([ValidatePattern('^r[1-9][0-9]*$')][string]$Round='r1')
$ErrorActionPreference='Stop'
. 'D:\CloudFlowPro\.cloudflow-runtime\use-data-drive.ps1'
$Root='D:\CloudFlowPro'
$CacheRoot='D:\CloudFlowProCache'
$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
$Run=Join-Path $Root '.cloudflow-runtime/batch-g-integration/9799534e1a3a47b5958330f14ae16dc7'
$Output=Join-Path $Evidence "e1-all-acceptance-20261009-$Round.json"
$Original=$Output.Replace('.json','-original.ps1')
if((Test-Path -LiteralPath $Output) -or (Test-Path -LiteralPath $Original)){throw 'Retain original E1 acceptance evidence'}
[IO.File]::Copy($PSCommandPath,$Original,$false)
$Inputs=@{}
$Builds=@{}
$Actual=@{}
$SuiteEvidence=@{}
$Rows=@{}
$StageEvidence=[Collections.Generic.List[object]]::new()
$Impact=[Collections.Generic.List[object]]::new()
$MailEvidence=[Collections.Generic.List[object]]::new()
$OriginalCount=0
$ImageCount=0
function Require([bool]$Condition,[string]$Message){if(-not $Condition){throw $Message}}
function Read-Json([string]$File){Get-Content -LiteralPath $File -Raw|ConvertFrom-Json -Depth 100}
function Full-Path([string]$File){[IO.Path]::GetFullPath($File,$Root)}
function File-Hash([string]$File){
    $Before=Get-Item -LiteralPath $File
    $Length=$Before.Length
    $Written=$Before.LastWriteTimeUtc
    $Stream=[IO.File]::Open($File,[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::ReadWrite)
    try{$Hash=(Get-FileHash -InputStream $Stream).Hash}finally{$Stream.Dispose()}
    $After=Get-Item -LiteralPath $File
    Require ($Length -eq $After.Length -and $Written -eq $After.LastWriteTimeUtc) 'Input changed while reading'
    return $Hash
}
function Track([string]$File,[string]$Expected=''){
    $Path=Full-Path $File
    Require ($Path.StartsWith($Root+'\',[StringComparison]::OrdinalIgnoreCase) -or $Path.StartsWith($CacheRoot+'\',[StringComparison]::OrdinalIgnoreCase)) 'Input left approved workspace or cache'
    if($Inputs.ContainsKey($Path)){
        if($Expected){Require ($Inputs[$Path] -eq $Expected) "Conflicting recorded input: $Path"}
        return
    }
    $Hash=File-Hash $Path
    if($Expected){Require ($Hash -eq $Expected) "Recorded input changed: $Path"}
    $Inputs[$Path]=$Hash
}
function Product([string]$Kind,[string]$Version,[int]$ExpectedCount){
    $Key="$Kind-$Version"
    if($Builds.ContainsKey($Key)){return $Builds[$Key]}
    $File=Join-Path $Evidence "h3-portal-finance-20261002-$Key-inputs.json"
    $Entries=@(Read-Json $File)
    Require ($Entries.Count -eq $ExpectedCount) 'Product snapshot count differs'
    $Snapshot=@{}
    foreach($Entry in $Entries){
        $Path=Full-Path $Entry.Path
        Require (-not $Snapshot.ContainsKey($Path)) 'Duplicate product snapshot path'
        $Snapshot[$Path]=$Entry.Hash
    }
    Track $File
    $Builds[$Key]=$Snapshot
    return $Snapshot
}
$CurrentBackend=Product 'backend' 'r127' 3839
$CurrentFrontend=Product 'frontend' 'r84' 1483
foreach($Snapshot in @($CurrentBackend,$CurrentFrontend)){
    foreach($Path in $Snapshot.Keys){Track $Path $Snapshot[$Path]}
}
$CustomerChanges=@(
    'cloudflow-backend/cloudflow-service-crm/src/main/java/com/cloudflow/crm/controller/CrmCustomerController.java',
    'cloudflow-backend/cloudflow-service-crm/src/main/java/com/cloudflow/crm/controller/CrmLeadController.java',
    'cloudflow-backend/cloudflow-service-crm/src/main/java/com/cloudflow/crm/domain/CrmCustomer.java',
    'cloudflow-backend/cloudflow-service-crm/src/main/java/com/cloudflow/crm/service/impl/CrmCustomerServiceImpl.java',
    'cloudflow-backend/cloudflow-service-crm/src/main/resources/mapper/CrmCustomerMapper.xml'
)
$ActivityChanges=@(
    'cloudflow-backend/cloudflow-service-crm/src/main/java/com/cloudflow/crm/mapper/CrmActivityMapper.java',
    'cloudflow-backend/cloudflow-service-crm/src/main/java/com/cloudflow/crm/mapper/CrmActivityParticipantMapper.java',
    'cloudflow-backend/cloudflow-service-crm/src/main/java/com/cloudflow/crm/service/impl/CrmActivityService.java',
    'cloudflow-backend/cloudflow-service-crm/src/main/resources/mapper/CrmActivityMapper.xml',
    'cloudflow-backend/cloudflow-service-crm/src/main/resources/mapper/CrmActivityParticipantMapper.xml',
    'cloudflow-backend/DB/06.cloudflow-business-seed.sql'
)
$CustomerFrontendChanges=@(
    'cloudflow-frontend/src/components/crm/management/store.tsx',
    'cloudflow-frontend/src/services/api/crm/customer.ts',
    'cloudflow-frontend/src/components/crm/operations/CustomerTimeline.tsx'
)
$ActivityFrontendChanges=@(
    'cloudflow-frontend/src/components/crm/management/dialogs/TicketDetailDialog.tsx',
    'cloudflow-frontend/src/components/crm/operations/ActivityBusinessButton.tsx',
    'cloudflow-frontend/src/components/crm/operations/ActivityEditor.tsx',
    'cloudflow-frontend/src/components/crm/operations/LeadDetailDialog.tsx',
    'cloudflow-frontend/src/components/crm/opportunity/OpportunityDetailDialog.tsx',
    'cloudflow-frontend/src/pages/ContractPage.tsx',
    'cloudflow-frontend/src/pages/CrmActivityPage.tsx',
    'cloudflow-frontend/src/pages/CrmLeadPage.tsx',
    'cloudflow-frontend/src/services/api/crm.ts',
    'cloudflow-frontend/src/services/api/crm/lead.ts'
)
foreach($Definition in @(
    @{Kind='backend';Before='r119';After='r127';Count=3839;Expected=@($CustomerChanges+$ActivityChanges);Added=0;Coverage=@('core','normal','queued','departments','calendar','conflicts','references')},
    @{Kind='backend';Before='r125';After='r127';Count=3839;Expected=$CustomerChanges;Added=0;Coverage=@('core','references','timeline')},
    @{Kind='frontend';Before='r79';After='r84';Count=1481;Expected=@($CustomerFrontendChanges+$ActivityFrontendChanges);Added=2;Coverage=@('core','references','timeline','calendar','conflicts','departments')},
    @{Kind='frontend';Before='r82';After='r84';Count=1483;Expected=$CustomerFrontendChanges;Added=0;Coverage=@('core','references','timeline')},
    @{Kind='frontend';Before='r83';After='r84';Count=1483;Expected=@('cloudflow-frontend/src/components/crm/operations/CustomerTimeline.tsx');Added=0;Coverage=@('core','timeline')}
)){
    $Before=Product $Definition.Kind $Definition.Before $Definition.Count
    $After=if($Definition.Kind -eq 'backend'){$CurrentBackend}else{$CurrentFrontend}
    $Changed=@($After.Keys|Where-Object{-not $Before.ContainsKey($_) -or $Before[$_] -ne $After[$_]})
    $Expected=@($Definition.Expected|ForEach-Object{Full-Path $_})
    Require ($Changed.Count -eq $Expected.Count -and @($Changed|Where-Object{$_ -notin $Expected}).Count -eq 0) 'Unreviewed product change'
    Require (@($Before.Keys|Where-Object{-not $After.ContainsKey($_)}).Count -eq 0) 'Historical product file removed'
    Require (@($Changed|Where-Object{-not $Before.ContainsKey($_)}).Count -eq $Definition.Added) 'Added product scope differs'
    $Details=@($Changed|Sort-Object|ForEach-Object{[pscustomobject]@{Path=$_;BeforeHash=$Before[$_];AfterHash=$After[$_];Added=(-not $Before.ContainsKey($_))}})
    $Impact.Add([pscustomobject]@{Product=$Definition.Kind;Before=$Definition.Before;After=$Definition.After;Changes=$Details;CurrentCoverage=$Definition.Coverage})
}
$InternalBackend=Product 'backend' 'r119' 3839
foreach($Name in @('CrmActivityReminderService.java','CrmActivityMessageSourceService.java')){
    $Path=Full-Path "cloudflow-backend/cloudflow-service-crm/src/main/java/com/cloudflow/crm/service/impl/$Name"
    Require ($InternalBackend[$Path] -eq $CurrentBackend[$Path]) 'Historical internal delivery implementation changed'
}
$StageDefinitions=@(
    @{Name='e1-reminder-internal-stage-20261007-r1';Backend='r119';Frontend='r79'},
    @{Name='e1-departments-stage-20261008-r1';Backend='r125';Frontend='r82'},
    @{Name='e1-references-stage-20261009-r1';Backend='r127';Frontend='r83'},
    @{Name='e1-timeline-stage-20261009-r2';Backend='r127';Frontend='r84'}
)
$HistoricalArchives=@{}
foreach($Definition in $StageDefinitions){
    $File=Join-Path $Evidence ($Definition.Name+'.json')
    $Stage=Read-Json $File
    Require ($Stage.Passed -and $Stage.Backend -eq $Definition.Backend -and $Stage.Frontend -eq $Definition.Frontend -and -not $Stage.AllE1AcceptanceComplete -and -not $Stage.GlobalComplete) 'Historical stage boundary differs'
    $Manifest=$File.Replace('.json','-inputs.json')
    foreach($Entry in @(Read-Json $Manifest)){
        $Path=Full-Path $Entry.Path
        if($Path.StartsWith($Evidence+'\',[StringComparison]::OrdinalIgnoreCase)){
            Track $Path $Entry.Hash
            $HistoricalArchives[$Path]=$Entry.Hash
        }
    }
    Track $File
    Track $Manifest
    $StageEvidence.Add([pscustomobject]@{Result=$File;ResultHash=$Inputs[$File];InputManifest=$Manifest;InputManifestHash=$Inputs[$Manifest];Backend=$Stage.Backend;Frontend=$Stage.Frontend})
}
Require ($HistoricalArchives.Count -eq 897) 'Historical archive scope differs'
$Definitions=@(
    @{Name='core';Folder='e1-activity-core-20261007-r20';Backend='r127';Frontend='r84';Checks=626;Requests=223;UiRequests=1192;Images=31;Inputs=11732;Originals=10;Current=$true;Flags=@('core','mobileWorkspace','mobileDirect','desktopDeepLink','workspaceInvoices','nextActivity','businessEntries','participants')},
    @{Name='timeline';Folder='e1-timeline-20261009-r4';Backend='r127';Frontend='r84';Checks=1646;Requests=165;UiRequests=156;Images=26;Inputs=11731;Originals=9;Current=$true;Flags=@('timeline','pagination','performance','ui')},
    @{Name='normal';Folder='e1-reminder-runtime-20261007-r4';Backend='r127';Frontend='r84';Checks=164;Requests=37;UiRequests=0;Images=0;Inputs=11762;Originals=9;Current=$true;Mail='e1-reminder-mail-20261007-r4';CaptchaBefore=1654;CaptchaAfter=1659;Flags=@('dualChannels','reschedule','cancel')},
    @{Name='queued';Folder='e1-reminder-queued-runtime-20261007-r2';Backend='r127';Frontend='r84';Checks=158;Requests=41;UiRequests=0;Images=0;Inputs=11762;Originals=9;Current=$true;Mail='e1-reminder-queued-mail-20261007-r2';CaptchaBefore=1659;CaptchaAfter=1664;Flags=@('queuedRevocations','ordinaryEdit','newSchedule')},
    @{Name='departments';Folder='e1-departments-20261008-r3';Backend='r125';Frontend='r82';Checks=237;Requests=91;UiRequests=155;Images=11;Inputs=11729;Originals=7;Current=$false;Flags=@('departments','selfAccess','scopeChanges','ui')},
    @{Name='calendar';Folder='e1-calendar-20261007-r7';Backend='r125';Frontend='r82';Checks=101;Requests=36;UiRequests=120;Images=9;Inputs=11729;Originals=7;Current=$false;Flags=@('calendar','views','drag','rollback','overdue')},
    @{Name='conflicts';Folder='e1-conflicts-20261007-r2';Backend='r125';Frontend='r82';Checks=51;Requests=20;UiRequests=121;Images=2;Inputs=11729;Originals=7;Current=$false;Flags=@('conflicts','privacy','states','ui')},
    @{Name='references';Folder='e1-references-20261009-r4';Backend='r127';Frontend='r83';Checks=313;Requests=137;UiRequests=145;Images=4;Inputs=11732;Originals=10;Current=$false;Flags=@('boundaries','search','capacity','ui')},
    @{Name='internal';Folder='e1-reminder-internal-runtime-20261007-r3';Backend='r119';Frontend='r79';Checks=136;Requests=42;UiRequests=0;Images=0;Inputs=11760;Originals=9;Current=$false;Flags=@('queuedRevocations','ordinaryEdit','newSchedule','queuedInternalActualCheckComplete')}
)
foreach($Definition in $Definitions){
    $Directory=Join-Path $Evidence $Definition.Folder
    $Result=Read-Json (Join-Path $Directory 'result.json')
    $Execution=Read-Json (Join-Path $Directory 'execution.json')
    foreach($Flag in (@('passed','preservation','secrets')+$Definition.Flags)){Require ($Result.$Flag -eq $true) "Missing business evidence: $($Definition.Name).$Flag"}
    Require (-not $Result.allAcceptanceComplete -and $Result.finalFailures.Count -eq 0 -and $Result.cleanupFailures.Count -eq 0 -and $Result.secretScan.leaks -eq 0) 'Business failure or scope changed'
    Require ($Result.checks.Count -eq $Definition.Checks -and $Result.requests.Count -eq $Definition.Requests -and $Result.uiRequests.Count -eq $Definition.UiRequests) 'Business assertion or request count differs'
    Require ($Execution.Exit -eq 0 -and $Execution.Backend -eq $Definition.Backend -and $Execution.Frontend -eq $Definition.Frontend -and $Execution.InputChanges -eq 0 -and $Execution.SourceAndRuntimeInputs -eq $Definition.Inputs -and $Execution.RuntimeFiles -eq 6382 -and $Execution.HealthyServices -eq 6) 'Business execution version or integrity differs'
    $Controlled=@{}
    if($Definition.Mail){
        $MailDirectory=Join-Path $Evidence $Definition.Mail
        $Mail=Read-Json (Join-Path $MailDirectory 'manifest.json')
        Require ($Mail.Restored -and -not $Mail.ProductionModified -and $Mail.Files.Count -eq 2 -and $Mail.Backend -eq 'r127' -and $Mail.Frontend -eq 'r84' -and (Full-Path $Mail.StatePath) -eq (Join-Path $Run 'state.json')) 'Mail restoration or runtime differs'
        foreach($File in $Mail.Files){
            $Path=Full-Path $File.Path
            Require ($Path -in @((Join-Path $Run 'auth/service.args'),(Join-Path $Run 'auth/integration.properties')) -and -not $Controlled.ContainsKey($Path)) 'Unexpected temporary mail input'
            $Backup=Join-Path $MailDirectory ((Split-Path -Leaf $Path)+'.original')
            Require ((Full-Path $File.Backup) -eq $Backup) 'Mail backup outside its original fixture'
            Track $Backup $File.OriginalHash
            Track (Join-Path $MailDirectory ((Split-Path -Leaf $Path)+'.applied')) $File.AppliedHash
            Track $Path $File.OriginalHash
            $Controlled[$Path]=$File
        }
        $Allowance=Get-Content -LiteralPath (Join-Path $MailDirectory 'allowance.log') -Raw
        Require ($Allowance.Contains("original_limit=100; original_ttl=-1; counter_before=$($Definition.CaptchaBefore); counter_after=$($Definition.CaptchaAfter); counter_writes=0; database_unchanged=true; production_modified=false")) 'Mail captcha restoration absent'
        Track (Join-Path $MailDirectory 'run-e1-reminders.original.ps1') (File-Hash (Join-Path $Root 'scripts/run-e1-reminders.ps1'))
        foreach($File in Get-ChildItem -LiteralPath $MailDirectory -File){Track $File.FullName}
        $MailEvidence.Add([pscustomobject]@{Suite=$Definition.Name;Manifest=(Join-Path $MailDirectory 'manifest.json');Restored=$true;CaptchaBefore=$Definition.CaptchaBefore;CaptchaAfter=$Definition.CaptchaAfter;OriginalFiles=2})
    }
    $Manifest=@{}
    $RestoredInputs=0
    foreach($Entry in @(Read-Json (Join-Path $Directory 'inputs.json'))){
        $Path=Full-Path $Entry.Path
        Require (-not $Manifest.ContainsKey($Path)) 'Duplicate execution input'
        $Manifest[$Path]=$Entry.Hash
        if($Definition.Current){
            if($Controlled.ContainsKey($Path)){
                Require ($Entry.Hash -eq $Controlled[$Path].AppliedHash) 'Execution did not use recorded temporary mail configuration'
                $RestoredInputs++
            }else{Track $Path $Entry.Hash}
        }
    }
    Require ($Manifest.Count -eq $Definition.Inputs -and $RestoredInputs -eq $Controlled.Count) 'Execution manifest or restored input count differs'
    $Backend=Product 'backend' $Definition.Backend 3839
    $FrontendCount=if($Definition.Frontend -eq 'r79'){1481}else{1483}
    $Frontend=Product 'frontend' $Definition.Frontend $FrontendCount
    foreach($Snapshot in @($Backend,$Frontend)){
        foreach($Path in $Snapshot.Keys){Require ($Manifest.ContainsKey($Path) -and $Manifest[$Path] -eq $Snapshot[$Path]) 'Execution product snapshot differs'}
    }
    $OriginalDirectory=Join-Path $Directory 'originals'
    $Copies=@(Get-ChildItem -LiteralPath $OriginalDirectory -File -Recurse)
    Require ($Copies.Count -eq $Definition.Originals) 'Execution original count differs'
    foreach($Copy in $Copies){
        $Source=Full-Path ([IO.Path]::GetRelativePath($OriginalDirectory,$Copy.FullName))
        Require ($Manifest.ContainsKey($Source)) 'Execution original absent from input manifest'
        Track $Copy.FullName $Manifest[$Source]
        if($Definition.Current){Track $Source $Manifest[$Source]}
    }
    $Images=@(Get-ChildItem -LiteralPath $Directory -File -Filter '*.png')
    Require ($Images.Count -eq $Definition.Images) 'Business screenshot scope differs'
    foreach($File in Get-ChildItem -LiteralPath $Directory -File){Track $File.FullName}
    $OriginalCount+=$Copies.Count
    $ImageCount+=$Images.Count
    $Actual[$Definition.Name]=$Result
    $SuiteEvidence[$Definition.Name]=[pscustomobject]@{Name=$Definition.Name;Backend=$Definition.Backend;Frontend=$Definition.Frontend;CurrentExecution=$Definition.Current;Checks=$Definition.Checks;Requests=$Definition.Requests;UiRequests=$Definition.UiRequests;Result=(Join-Path $Directory 'result.json');ResultHash=$Inputs[(Join-Path $Directory 'result.json')];Execution=(Join-Path $Directory 'execution.json');Inputs=(Join-Path $Directory 'inputs.json');Originals=@($Copies.FullName);Images=@($Images.FullName)}
}
Require ($OriginalCount -eq 77 -and $ImageCount -eq 83) 'Combined original or screenshot scope differs'
"E1_ALL_INPUTS: suites=9; execution_originals=$OriginalCount; screenshots=$ImageCount; historical_archives=$($HistoricalArchives.Count)"
$Prd=Join-Path $Root 'docs/prd/E1-CRM-01-活动管理-PRD.md'
$PrdRows=[regex]::Matches((Get-Content -LiteralPath $Prd -Raw),'(?m)^\| AC-(\d+) \| (.+) \|')
Require ($PrdRows.Count -eq 15) 'PRD acceptance count differs'
foreach($PrdRow in $PrdRows){
    $Number=[int]$PrdRow.Groups[1].Value
    Require ($Number -ge 1 -and $Number -le 15 -and -not $Rows.ContainsKey($Number)) 'PRD acceptance identifiers differ'
    $Rows[$Number]=[pscustomobject]@{Id="AC-$Number";Requirement=$PrdRow.Groups[2].Value;Passed=$true;Evidence=[Collections.Generic.List[object]]::new()}
}
Track $Prd
function Proof([int]$Number,[string]$Suite,[string[]]$Labels){
    Require ($Rows.ContainsKey($Number) -and $Actual.ContainsKey($Suite) -and $Labels.Count -gt 0) 'Unmapped acceptance proof'
    $Checks=@()
    foreach($Label in @($Labels|Select-Object -Unique)){
        $Occurrences=@($Actual[$Suite].checks|Where-Object{$_ -ceq $Label}).Count
        Require ($Occurrences -gt 0) "Missing named acceptance check: $Suite/$Label"
        $Checks+=[pscustomobject]@{Name=$Label;Occurrences=$Occurrences}
    }
    $Source=$SuiteEvidence[$Suite]
    $Rows[$Number].Evidence.Add([pscustomobject]@{Suite=$Suite;Backend=$Source.Backend;Frontend=$Source.Frontend;CurrentExecution=$Source.CurrentExecution;Result=$Source.Result;ResultHash=$Source.ResultHash;Checks=$Checks;Originals=$Source.Originals;Images=$Source.Images})
}
foreach($Type in @('MEETING','CALL','TASK')){
    Proof 1 'core' @("created_$($Type)_complete","$($Type)_edited","$($Type)_completed_and_followup","created_$($Type)_cancel","$($Type)_cancelled","$($Type)_cannot_reopen")
    Proof 7 'core' @("$($Type)_completed_and_followup","$($Type)_customer_followup_time")
}
foreach($Kind in @('customer','opportunity','lead','ticket','contract','contract_without_customer')){
    Proof 2 'core' @("entry_$($Kind)_button_enabled","entry_$($Kind)_type_default","entry_$($Kind)_object_default","entry_$($Kind)_current_owner_visible","entry_$($Kind)_saved_relation","entry_$($Kind)_detail_persisted","entry_$($Kind)_database_persisted","entry_$($Kind)_full_source_preserved_during_write")
}
Proof 2 'core' @('entry_admin_does_not_inherit_sales_owner','entry_lead_customer_default','entry_contract_without_customer_customer_default')
Proof 2 'references' @('unconverted_lead_activity_customer_optional','unconverted_lead_activity_explicit_customer')
foreach($Status in @('NONE','ACCEPTED','DECLINED','TENTATIVE')){
    Proof 3 'core' @("participant_response_$Status","participants_self_$Status","participants_stale_save_$Status","participants_ui_$($Status)_database_CONTACT","participants_ui_$($Status)_database_LEAD","participants_ui_external_$Status","participants_ui_internal_unchanged_$Status")
}
Proof 3 'core' @('participants_new_colleague_not_forged','participants_removed_reply_no_write','participants_rejoined_unresponded','participants_ui_resolved_names','participants_ui_stale_keeps_reply','participants_ui_stale_keeps_edit','participants_ui_self_cannot_save_owner_activity')
Proof 4 'core' @('participant_can_read','participant_calendar','participant_cannot_complete_others_activity')
foreach($Scope in @('1','2','3')){
    Proof 4 'departments' @("scope_$($Scope)_calendar_union","scope_$($Scope)_personal_TODAY","scope_$($Scope)_personal_WEEK","scope_$($Scope)_detail_invited","scope_$($Scope)_ui_invitation_readonly")
    Proof 12 'departments' @("scope_$($Scope)_real_login_cache_scope","scope_$($Scope)_pagination_complete","scope_$($Scope)_denied_unrelated","scope_$($Scope)_readonly_invited","scope_$($Scope)_rejected_write_preserved_invited","scope_$($Scope)_foreign_tenant_detail_denied","scope_$($Scope)_ui_month_union","scope_$($Scope)_ui_list_union")
}
Proof 4 'departments' @('declined_invitation_still_readable','declined_invitation_still_personal','removed_invitation_detail_denied','removed_invitation_not_personal','removed_invitation_ui_hidden')
Proof 5 'normal' @('only_thirty_minute_sent','zero_minute_waits','records_success_and_link_zero_due','recipient_channel_counts_initial','persistent_events_initial','six_exact_local_smtp_messages','owner_participant_deduplicated_and_declined_excluded','actual_smtp_content','smtp_message_ids_unique')
Proof 6 'normal' @('same_time_edit_retains_sent','postpone_replaces_all_reminders','postponed_remains_pending','records_success_and_link_new_schedule','cancel_retains_sent_only','cancelled_and_completed_never_delivered','records_success_and_link_repeat_zero')
Proof 6 'queued' @('temporary_refusal_not_delivered','ordinary_edit_keeps_queued_ids','reschedule_new_pending_ids','queued_until_recovery','only_three_valid_queued_messages','removed_participant_not_sent','repeat_recovery_does_not_repeat_attempts','new_schedule_has_new_event_ids','old_schedule_remains_skipped','new_schedule_does_not_repeat','five_exact_local_messages','all_records_terminal','smtp_control_restored')
foreach($Scenario in @('edit','reschedule','cancel','delete','complete','remove_reminder','remove_participant')){
    Proof 6 'queued' @("known_smtp_rejection_$Scenario","recovered_$($Scenario)_1","recovered_$($Scenario)_3","original_records_reused_$Scenario")
}
Proof 6 'internal' @('all_changes_before_delivery','ordinary_edit_preserves_pending_id','reschedule_replaces_pending_id','self_decline_recorded','old_schedule_never_attempted','recovery_repeat_unchanged','new_schedule_not_repeated','exact_internal_outcome','effective_subscriptions_restored','no_email_attempts')
foreach($Scenario in @('edit','reschedule','cancel','delete','complete','remove_reminder','decline')){
    Proof 6 'internal' @("not_sent_during_quiet_$Scenario","internal_source_$Scenario","same_internal_record_$Scenario")
}
foreach($Scenario in @('short','boundary','long','empty','custom','cleared')){
    Proof 8 'core' @("next_api_$($Scenario)_content","next_api_$($Scenario)_inheritance","next_api_$($Scenario)_persisted","next_ui_$($Scenario)_fresh_read","next_ui_$($Scenario)_defaults","next_ui_$($Scenario)_content","next_ui_$($Scenario)_inheritance","next_ui_$($Scenario)_persisted","next_ui_$($Scenario)_source_retained")
}
Proof 8 'core' @('next_denied_sales','next_denied_foreign','next_denied_employee','next_denied_creates_no_rows','next_ui_participant_button_absent','next_ui_participant_can_read')
Proof 9 'calendar' @('month_contains_invited','month_excludes_unrelated','week_contains_invited','week_has_seven_days','day_only_today','day_contains_invited','day_excludes_tomorrow','month_drag_saved','month_drag_one_day','month_drag_database','month_drag_reopened','stale_drag_denied','stale_drag_database_preserved','stale_drag_display_reverted','network_drag_aborted_once','network_drag_database_preserved','network_drag_display_reverted','invited_dialog_readonly')
Proof 10 'calendar' @('view_TODAY_exact_membership','view_TODAY_page_membership','view_WEEK_exact_membership','view_WEEK_page_membership','overdue_detects_elapsed_deadline_without_edit','overdue_read_does_not_write','overdue_only_open_tasks','overdue_excludes_future_and_terminal','overdue_page_membership')
Proof 11 'timeline' @('six_real_sources_and_three_ui_pages','timeline_foreign_customer_denied','timeline_other_employee_private_customer_denied')
foreach($Width in @('1440','390')){
    foreach($Page in @('1','2','3')){
        Proof 11 'timeline' @("ui_$($Width)_all_$($Page)_source_rows","ui_$($Width)_all_$($Page)_visible_count","ui_$($Width)_all_$($Page)_no_horizontal_overflow")
    }
    foreach($Type in @('ACTIVITY','FOLLOW_UP','OPPORTUNITY','QUOTE','RECEIVABLE','TICKET')){
        Proof 11 'timeline' @("ui_$($Width)_$($Type)_1_source_rows","ui_$($Width)_$($Type)_reset_first_page")
    }
    Proof 11 'timeline' @("ui_$($Width)_last_page_disabled","ui_$($Width)_detail_0_source","ui_$($Width)_detail_1_source","ui_$($Width)_detail_1_write_scope","ui_$($Width)_empty_source_rows","ui_$($Width)_empty_pagination_disabled")
}
Proof 12 'core' @('sales_cannot_read_unrelated','sales_list_excludes_unrelated','manager_sees_subordinate','foreign_tenant_denied','employee_without_permission_denied')
Proof 12 'departments' @('scope_3_denied_child_department','scope_2_detail_child_department','scope_1_denied_same_department','scope_1_detail_child_department','scope_2_previous_session_revoked','scope_1_previous_session_revoked','role_grants_preserved','user_role_bindings_preserved','owned_fixtures_inactive')
Proof 13 'conflicts' @('shared_participant_conflict_saved','private_busy_period_only','admin_sees_authorized_conflict','participant_sees_both_activities','private_detail_remains_denied','ui_conflict_does_not_block_save','ui_saved_description_persisted','ui_reopened_keeps_private_notice','ui_conflict_manager','declined_source_participant_releases_conflict','declined_other_participant_releases_conflict','tentative_participant_keeps_conflict','removed_source_participant_releases_conflict','rejoined_participant_restores_conflict','completed_source_has_no_conflict')
foreach($Type in @('CUSTOMER','OPPORTUNITY','LEAD','TICKET','CONTRACT')){
    Proof 14 'core' @("missing_$($Type)_rejected")
    Proof 14 'references' @("foreign_own_source_is_accessible_$Type","matching_customer_derived_$Type","matching_relation_persisted_$Type","cross_customer_create_$($Type)_rejected","cross_customer_create_$($Type)_no_activity_write","foreign_source_create_$($Type)_rejected","reverse_tenant_create_$($Type)_rejected","foreign_customer_create_$($Type)_rejected","cross_customer_edit_$($Type)_rejected","foreign_source_edit_$($Type)_rejected","rejected_edit_keeps_original_relation_$Type")
}
Proof 15 'core' @('mobile_customer_workspace_completed','mobile_reminder_opens_correct_activity','mobile_reminder_complete_persisted','mobile_320_dialog_within_viewport','mobile_320_list_within_viewport','customer_name_complete_320','customer_name_complete_390','closing_clears_activity_parameter','mobile_refresh_stays_on_list','invalid_link_has_clear_error','unrelated_link_denied_in_page')
Require ($Rows.Count -eq 15 -and @($Rows.Values|Where-Object{$_.Evidence.Count -eq 0}).Count -eq 0) 'Acceptance mapping incomplete'
function Check-Frequencies($Result){
    @($Result.checks|ForEach-Object{$_.Replace($Result.marker,'{marker}') -replace '/[0-9]+(?=[:/])','/{id}' -replace '(owned_channel_record_)[0-9]+$','$1{id}'}|Group-Object|ForEach-Object{"$($_.Name):$($_.Count)"})
}
$RetainedChecks=@()
foreach($Pair in @(
    @{Suite='core';Baseline='e1-activity-core-20261007-r19/result.json';Count=626},
    @{Suite='normal';Baseline='e1-reminder-runtime-20261007-r3/result.json';Count=164},
    @{Suite='queued';Baseline='e1-reminder-queued-runtime-20261007-r1/result.json';Count=158}
)){
    $File=Join-Path $Evidence $Pair.Baseline
    $Baseline=Read-Json $File
    Require ($Baseline.passed -and $Baseline.checks.Count -eq $Pair.Count) 'Prior successful check baseline differs'
    $Difference=@(Compare-Object (Check-Frequencies $Baseline) (Check-Frequencies $Actual[$Pair.Suite]))
    Require ($Difference.Count -eq 0) 'Prior check names or multiplicities omitted'
    Track $File
    $RetainedChecks+=[pscustomobject]@{Suite=$Pair.Suite;Baseline=$File;Checks=$Pair.Count;GeneratedIdentifiersNormalized=$true;NamesAndMultiplicitiesRetained=$true}
}
foreach($Spec in @(@{Name='normal';Tasks=7;Mail=6},@{Name='queued';Tasks=5;Mail=5},@{Name='internal';Tasks=5;Mail=0})){
    $Result=$Actual[$Spec.Name]
    Require ($Result.executions.Count -eq $Spec.Tasks -and @($Result.executions|Where-Object status -ne 'SUCCESS').Count -eq 0 -and @($Result.executions.executeNo|Sort-Object -Unique).Count -eq $Spec.Tasks) 'Actual reminder task scope differs'
    if($Spec.Mail -gt 0){Require ($Result.smtp.count -eq $Spec.Mail -and $Result.smtp.localOnly -and @($Result.smtp.messageIds|Sort-Object -Unique).Count -eq $Spec.Mail) 'Local reminder delivery count differs'}
}
Require ($Actual.queued.email.initialRetryable -eq 14 -and $Actual.queued.email.skipped -eq 11 -and $Actual.queued.email.sent -eq 5) 'Queued mail outcome differs'
Require ($Actual.internal.internal.initialQuietPending -eq 7 -and $Actual.internal.internal.skipped -eq 6 -and $Actual.internal.internal.sent -eq 3 -and $Actual.internal.internal.attempts -eq 3) 'Quiet internal outcome differs'
Require ($Actual.internal.subscription.id -eq 100 -and $Actual.internal.subscription.userId -eq 990000701 -and $Actual.internal.subscription.newRecord -and $Actual.internal.subscription.restoredToDefault) 'Historical subscription restoration differs'
Track (Join-Path $Run 'private/smtp/control.json') (File-Hash (Join-Path $Evidence 'e1-reminder-queued-runtime-20261007-r2/smtp-control.original.json'))
"E1_ALL_MAPPING: items=15; ordinary_reminders=164; queued_reminders=158; quiet_internal=136; names_and_multiplicities_retained=true"
$Database=Join-Path $Evidence 'e1-reminder-database-20261007-r18'
$Packages=Join-Path $Evidence 'backend-executable-verification-20261006-r17'
$Deployment=Join-Path $Evidence 'e1-reminder-deployment-20261007-r8'
$Adjacent=Join-Path $Evidence 'h3-portal-finance-adjacent-20261002-r177'
foreach($Directory in @($Database,$Packages,$Deployment,$Adjacent)){
    $Manifest=Join-Path $Directory 'inputs.json'
    foreach($Entry in @(Read-Json $Manifest)){Track $Entry.Path $Entry.Hash}
    Track $Manifest
}
$DatabaseResult=Read-Json (Join-Path $Database 'result.json')
$DatabaseLog=Get-Content -LiteralPath (Join-Path $Database 'checks.log') -Raw
Require ($DatabaseResult.Passed -and $DatabaseResult.Backend -eq 'r127' -and $DatabaseResult.Inputs -eq 5326 -and $DatabaseResult.InputChanges -eq 0 -and $DatabaseResult.TemporaryDatabaseRemoved -and -not $DatabaseResult.ProductionModified) 'Current database execution differs'
Require ($DatabaseLog.Contains('PASS: 15777 CRM boundary assertions') -and $DatabaseLog.Contains('Temporary data removed; logs retained')) 'Database verification incomplete'
Track (Join-Path $Database 'result.json')
Track (Join-Path $Database 'checks.log')
$PackageResult=Read-Json (Join-Path $Packages 'result.json')
$DeploymentResult=Read-Json (Join-Path $Deployment 'result.json')
Require ($PackageResult.Passed -and $PackageResult.BackendRound -eq 'r127' -and $PackageResult.InputChanges -eq 0 -and $PackageResult.Services.Count -eq 6) 'Current executable packages differ'
Require ($DeploymentResult.Passed -and $DeploymentResult.Backend -eq 'r127' -and $DeploymentResult.PackageRound -eq 'r17' -and $DeploymentResult.RuntimeFiles -eq 6382 -and $DeploymentResult.InputChanges -eq 0 -and $DeploymentResult.Services.Count -eq 6) 'Current deployment differs'
foreach($Package in $PackageResult.Services){
    Track $Package.Path $Package.Hash
    $Installed=@($DeploymentResult.Services|Where-Object Service -eq $Package.Name)
    Require ($Installed.Count -eq 1 -and $Installed[0].Exit -eq 0 -and $Installed[0].PackageHash -eq $Package.Hash) 'Installed package hash differs'
}
foreach($Directory in @($Packages,$Deployment)){Track (Join-Path $Directory 'result.json')}
$SupportOriginals=0
foreach($Spec in @(@{Directory=$Database;Count=45},@{Directory=$Deployment;Count=4})){
    $Manifest=@{}
    foreach($Entry in @(Read-Json (Join-Path $Spec.Directory 'inputs.json'))){$Manifest[(Full-Path $Entry.Path)]=$Entry.Hash}
    $OriginalDirectory=Join-Path $Spec.Directory 'originals'
    $Copies=@(Get-ChildItem -LiteralPath $OriginalDirectory -File -Recurse)
    Require ($Copies.Count -eq $Spec.Count) 'Supporting execution originals incomplete'
    foreach($Copy in $Copies){
        $Source=Full-Path ([IO.Path]::GetRelativePath($OriginalDirectory,$Copy.FullName))
        Require ($Manifest.ContainsKey($Source)) 'Supporting original absent from execution manifest'
        Track $Copy.FullName $Manifest[$Source]
        Track $Source $Manifest[$Source]
    }
    $SupportOriginals+=$Copies.Count
}
Track (Join-Path $Packages 'original.ps1') (File-Hash (Join-Path $Root 'scripts/verify-backend-executable-packages.ps1'))
$SupportOriginals++
Require ($SupportOriginals -eq 50) 'Supporting execution original scope differs'
foreach($Build in @(@{Name='backend-r127';Count=3839},@{Name='frontend-r84';Count=1483})){
    $File=Join-Path $Evidence "h3-portal-finance-20261002-$($Build.Name).log"
    Require ((Get-Content -LiteralPath $File -Raw).Contains("files=$($Build.Count); changed=0; exit=0")) 'Complete current build absent'
    Track $File
}
$AdjacentLog=Get-Content -LiteralPath (Join-Path $Adjacent 'summary.log') -Raw
$OaLog=Get-Content -LiteralPath (Join-Path $Adjacent 'oa-database.log') -Raw
Require ($AdjacentLog.Contains('files=6692; changed=0; exit=0; production_modified=false')) 'Current adjacent verification differs'
Require ($OaLog.Contains('Complete approved schema table count; expected=374; actual=374') -and $OaLog.Contains('PASS: 1012 OA boundary assertions')) 'Current adjacent database coverage differs'
Require ((Get-Content -LiteralPath (Join-Path $Adjacent 'menu.log') -Raw).Contains('EMPLOYEE_UNEXPECTED_GRANTS=0; EMPLOYEE_UNEXPECTED_WRITE_PERMISSIONS=0')) 'Current permission verification differs'
foreach($File in Get-ChildItem -LiteralPath $Adjacent -File){Track $File.FullName}
$Timeline=Join-Path $Evidence 'e1-timeline-20261009-r4'
$Measurement=Read-Json (Join-Path $Timeline 'calendar-performance.json')
Require ($Measurement.passed -and $Measurement.sampleCount -eq 31 -and $Measurement.samples.Count -eq 31 -and $Measurement.limitMs -eq 200 -and $Measurement.ownActivities -eq 33 -and $Measurement.teamActivities -eq 34) 'Calendar measurement scope differs'
Require ($Measurement.warmupRequests -eq 0 -and -not $Measurement.restartedServices -and -not $Measurement.firstAfterProcessStart) 'Calendar measurement boundary differs'
Require (@($Measurement.samples|Where-Object{$_.durationMs -le 0 -or $_.durationMs -ge 200 -or $_.rows -ne 33 -or $_.status -ne 200 -or $_.code -ne 200}).Count -eq 0) 'A calendar sample failed'
$Durations=@($Measurement.samples.durationMs|Sort-Object)
Require ($Measurement.firstMs -eq $Measurement.samples[0].durationMs -and $Measurement.maximumMs -eq $Durations[-1] -and $Measurement.medianMs -eq $Durations[15] -and $Measurement.p95Ms -eq $Durations[29]) 'Calendar sample summary differs'
foreach($Label in @('calendar_all_31_requests_below_200_ms','calendar_team_pagination_complete','calendar_team_pagination_unique','calendar_other_tenant_owner_empty','calendar_reversed_range_rejected','owned_activities_removed')){
    Require ($Actual.timeline.checks -ccontains $Label) 'Calendar nonfunctional proof absent'
}
$TimezoneChecks=@($Actual.timeline.checks|Where-Object{$_ -like 'activity_server_timezone_*'})
Require ($TimezoneChecks.Count -eq 38 -and @($TimezoneChecks|Sort-Object -Unique).Count -eq 38) 'Server timezone checks incomplete'
$OriginalRows=@(Read-Json (Join-Path $Timeline 'preservation-before.json'))
Require ($OriginalRows.Count -eq 22 -and @($OriginalRows.table|Sort-Object -Unique).Count -eq 22) 'Original table preservation scope differs'
foreach($Entry in $OriginalRows){Require ($Actual.timeline.checks -ccontains ('original_rows_preserved_'+$Entry.table)) 'Original table preservation absent'}
$Sources=@(Read-Json (Join-Path $Timeline 'source-fixtures.json'))
Require ($Sources.Count -eq 13) 'Real timeline source scope differs'
foreach($Source in $Sources){
    Require ($Actual.timeline.checks -ccontains ('timeline_calendar_complete_source_preserved_'+$Source.table+'_'+$Source.id)) 'Read-only source preservation absent'
    Require ($Actual.timeline.checks -ccontains ('source_preserved_'+$Source.table+'_'+$Source.id)) 'Final source preservation absent'
}
$Refreshed=@($Sources|Where-Object workspaceRefreshAuditFields)
Require ($Refreshed.Count -eq 2) 'Workspace refresh scope differs'
foreach($Source in $Refreshed){
    Require ($Source.table -eq 'crm_customer' -and ($Source.workspaceRefreshAuditFields -join ',') -eq 'update_by,update_time' -and $Actual.timeline.checks -ccontains ('workspace_customer_refresh_audit_'+$Source.id)) 'Workspace audit field exception is unverified'
}
$Expected=@(Read-Json (Join-Path $Timeline 'timeline-expected.json'))
Require ($Expected.Count -eq 41 -and @($Expected.type|Sort-Object -Unique).Count -eq 6) 'Six-source timeline expectation differs'
"E1_ALL_SUPPORT: database_checks=15777; support_originals=$SupportOriginals; adjacent=r177; calendar_samples=31; all_below_200_ms=true"
$FailedResults=@()
foreach($Path in @($HistoricalArchives.Keys|Where-Object{(Split-Path -Leaf $_) -eq 'result.json'}|Sort-Object)){
    $Historical=Read-Json $Path
    if($Historical.PSObject.Properties.Name -contains 'passed' -and $Historical.passed -eq $false){
        $FailedResults+=[pscustomobject]@{Result=$Path;ResultHash=$HistoricalArchives[$Path];Passed=$false}
    }
}
foreach($Failure in @(@{Round='r1';Checks=192;Requests=84;Preserved=$true},@{Round='r2';Checks=206;Requests=91;Preserved=$true},@{Round='r3';Checks=1626;Requests=163;Preserved=$false})){
    $Directory=Join-Path $Evidence "e1-timeline-20261009-$($Failure.Round)"
    $Result=Read-Json (Join-Path $Directory 'result.json')
    $Execution=Read-Json (Join-Path $Directory 'execution.json')
    Require (-not $Result.passed -and $Result.checks.Count -eq $Failure.Checks -and $Result.requests.Count -eq $Failure.Requests -and $Result.preservation -eq $Failure.Preserved -and $Execution.Exit -eq 1) 'Timeline historical failure changed'
}
$FailedSummary=Join-Path $Evidence 'e1-timeline-stage-20261009-r1-original.ps1'
Track $FailedSummary (File-Hash (Join-Path $Evidence 'e1-timeline-stage-20261009-r2-original.ps1'))
$FailedSummaryError=Join-Path $Evidence 'e1-timeline-stage-r1-20261009.err'
Require ((Get-Content -LiteralPath $FailedSummaryError -Raw).Contains('Owned process identity differs')) 'Original SMTP exit failure absent'
foreach($Name in @(
    'e1-timeline-stage-r1-20261009.log','e1-timeline-stage-r1-20261009.err',
    'e1-timeline-stage-r2-20261009.log','e1-timeline-stage-r2-20261009.err',
    'e1-timeline-smtp-restore-20261009-r1.log','e1-timeline-smtp-restore-20261009-r1.err',
    'e1-unified-reminder-r4-20261009.log','e1-unified-reminder-r4-20261009.err',
    'e1-unified-reminder-queued-r2-20261009.log','e1-unified-reminder-queued-r2-20261009.err'
)){Track (Join-Path $Evidence $Name)}
$PriorReconciliationFailures=@()
$RoundNumber=[int]$Round.Substring(1)
if($RoundNumber -gt 1){
    foreach($PreviousNumber in 1..($RoundNumber-1)){
        $PreviousStem="e1-all-acceptance-20261009-r$PreviousNumber"
        $PreviousOriginal=Join-Path $Evidence ($PreviousStem+'-original.ps1')
        $PreviousLog=Join-Path $Evidence "e1-all-acceptance-r$PreviousNumber-20261009.log"
        $PreviousError=Join-Path $Evidence "e1-all-acceptance-r$PreviousNumber-20261009.err"
        Require (-not (Test-Path -LiteralPath (Join-Path $Evidence ($PreviousStem+'.json'))) -and (Get-Item -LiteralPath $PreviousError).Length -gt 0) 'Prior reconciliation failure boundary differs'
        foreach($File in @($PreviousOriginal,$PreviousLog,$PreviousError)){Track $File}
        $PriorReconciliationFailures+=[pscustomobject]@{Round="r$PreviousNumber";Passed=$false;Original=$PreviousOriginal;OriginalHash=$Inputs[$PreviousOriginal];Log=$PreviousLog;Error=$PreviousError;ErrorHash=$Inputs[$PreviousError]}
    }
}
$State=Read-Json (Join-Path $Run 'state.json')
Require ($State.status -eq 'RUNNING' -and (Full-Path $State.run) -eq $Run -and $State.processes.Count -eq 9 -and $State.services.Count -eq 6) 'Owned runtime scope differs'
foreach($Entry in $State.processes){
    $Observed=Get-CimInstance Win32_Process -Filter "ProcessId=$($Entry.id)"
    Require ($null -ne $Observed -and $Observed.CommandLine.Contains($Entry.marker)) 'Owned process identity differs'
}
$RuntimeFiles=0
foreach($Service in $State.services){
    $Arguments=@(Get-Content -LiteralPath (Join-Path $Run "$($Service.name)/service.args"))
    $Index=[Array]::IndexOf($Arguments,'-cp')
    Require ($Index -ge 0 -and $Arguments[$Index+2] -eq 'org.springframework.boot.loader.launch.JarLauncher') 'Layered runtime required'
    $Layer=[IO.Path]::GetFullPath($Arguments[$Index+1].Trim('"'))
    $Package=@($PackageResult.Services|Where-Object Name -eq $Service.name)
    Require ($Package.Count -eq 1 -and $Layer -eq (Join-Path $Run ("$($Service.name)/artifacts/"+$Package[0].Hash.ToLowerInvariant()+'-layered'))) 'Running service differs from verified package'
    foreach($File in Get-ChildItem -LiteralPath $Layer -Recurse -File){Require ($Inputs.ContainsKey($File.FullName)) 'Untracked runtime file';$RuntimeFiles++}
    Require ((Invoke-RestMethod "http://127.0.0.1:$($Service.healthPort)/actuator/health" -TimeoutSec 15).status -eq 'UP') 'Service unhealthy'
}
Require ($RuntimeFiles -eq 6382) 'Runtime file scope differs'
$OwnedSmtp=@($State.processes|Where-Object name -eq 'smtp-fixture')
$Listeners=@(Get-NetTCPConnection -State Listen -LocalPort $State.smtpFixture.port)
Require ($State.smtpFixture.loopback -and $OwnedSmtp.Count -eq 1 -and $Listeners.Count -eq 1 -and $Listeners[0].LocalAddress -eq '127.0.0.1' -and $Listeners[0].OwningProcess -eq $OwnedSmtp[0].id) 'SMTP fixture ownership differs'
Track $PSCommandPath
Track $Original (File-Hash $PSCommandPath)
$CacheInputs=@($Inputs.Keys|Where-Object{$_.StartsWith($CacheRoot+'\',[StringComparison]::OrdinalIgnoreCase)})
Require ($CacheInputs.Count -eq 285) 'Approved dependency cache scope differs'
foreach($Path in $Inputs.Keys){Require ((File-Hash $Path) -eq $Inputs[$Path]) "Acceptance input changed: $Path"}
$Inputs.Keys|Sort-Object|ForEach-Object{[pscustomobject]@{Path=$_;Hash=$Inputs[$_]}}|ConvertTo-Json|Set-Content -LiteralPath $Output.Replace('.json','-inputs.json') -Encoding utf8NoBOM
$Summary=[pscustomobject]@{
    Passed=$true;Backend='r127';Frontend='r84';AcceptanceCount=15;Items=@(1..15|ForEach-Object{$Rows[$_]})
    Suites=@($SuiteEvidence.Values|Sort-Object Name);Stages=@($StageEvidence.ToArray());ProductImpact=@($Impact.ToArray())
    CurrentInputs=$Inputs.Count;RuntimeFiles=$RuntimeFiles;SuiteExecutionOriginals=$OriginalCount;SupportingExecutionOriginals=$SupportOriginals;MailWrapperOriginals=2
    Screenshots=$ImageCount;CurrentScreenshots=57;HistoricalScreenshots=26;HistoricalArchives=$HistoricalArchives.Count;HistoricalFailedResults=$FailedResults
    FailedTimelineStageRetained=$true;SmtpRecoveryRetained=$true;HistoricalVersionsRetained=$true;SuiteCheckCountsAreNotAdditive=$true;PriorReconciliationFailures=$PriorReconciliationFailures;ApprovedCacheInputs=$CacheInputs.Count
    RetainedCheckNamesAndMultiplicities=$RetainedChecks;MailRestorations=@($MailEvidence.ToArray());LocalOnlyMail=$true;CaptchaCounterWrites=0;ProductionModified=$false
    DatabaseChecks=15777;Adjacent='r177';AdjacentInputs=6692;Processes=9;HealthyServices=6;CalendarPerformance=$Measurement;TimezoneChecks=$TimezoneChecks
    InternalQuietEvidenceBackend='r119';InternalQuietEvidenceFrontend='r79';InternalQuietDeliveryImplementationUnchanged=$true;InternalQuietNewRun=$false
    InputManifest=$Output.Replace('.json','-inputs.json');ReportHash=$Inputs[(Full-Path $PSCommandPath)];AllE1AcceptanceComplete=$true;GlobalComplete=$false
    Remaining=@('D2 ordinary first request is 559.79ms and must be below 500ms','D2 17-item reconciliation and other PRDs','Whole-project 35 PRDs / 681 items and approved deferred external integration')
}
$Summary|ConvertTo-Json -Depth 18|Set-Content -LiteralPath $Output -Encoding utf8NoBOM
"E1_ALL_ACCEPTANCE: passed=true; items=15; suites=9; inputs=$($Inputs.Count); runtime_files=$RuntimeFiles; screenshots=$ImageCount; healthy=6; all_e1_complete=true; global_complete=false"
