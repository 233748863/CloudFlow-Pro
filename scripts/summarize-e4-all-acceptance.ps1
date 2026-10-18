param([ValidatePattern('^r[1-9][0-9]*$')][string]$Round='r1',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$IndependentRound='r1',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$BackendRound='r142',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$FrontendRound='r95',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$PackageRound='r30',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$DeploymentRound='r12',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$AdjacentRound='r183',
    [Parameter(Mandatory=$true)][string]$TerminalReceiptsPath)
$ErrorActionPreference='Stop'
. 'D:\CloudFlowPro\.cloudflow-runtime\use-data-drive.ps1'
$Root='D:\CloudFlowPro'
$CacheRoot='D:\CloudFlowProCache'
$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
$Reference=Join-Path $Root '.cloudflow-runtime/batch-g-integration/9799534e1a3a47b5958330f14ae16dc7'
$Output=Join-Path $Evidence "e4-all-acceptance-20261010-$Round"
if(Test-Path -LiteralPath $Output){throw 'Retain prior E4 reconciliation evidence'}
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
$Builds=@{}
foreach($Prior in Get-ChildItem -LiteralPath $Evidence -Directory|Where-Object {$_.Name -match '^e4-all-acceptance-20261010-r([1-9][0-9]*)$' -and [int]$Matches[1] -lt [int]$Round.Substring(1)}){
    foreach($File in Get-ChildItem -LiteralPath $Prior.FullName -File){
        $Copy=Track $File.FullName
        $Archives[$Inputs[$Copy]]=$Copy
    }
}
foreach($Definition in @(@{Kind='backend';Version=$BackendRound;Phase='Backend';Count=3849},@{Kind='frontend';Version=$FrontendRound;Phase='Frontend';Count=1483})){
    $Index=Manifest (Join-Path $Evidence "h3-portal-finance-20261002-$($Definition.Kind)-$($Definition.Version)-inputs.json")
    Require ($Index.Count -eq $Definition.Count) 'E4 product input count differs'
    foreach($Path in $Index.Keys){$null=Track $Path $Index[$Path]}
    $Builds[$Definition.Kind]=$Index
    $Log=Track (Join-Path $Evidence "h3-portal-finance-20261002-$($Definition.Kind)-$($Definition.Version).log")
    Require ((Get-Content -LiteralPath $Log -Raw).Contains("FINANCE_BUILD: phase=$($Definition.Phase); files=$($Definition.Count); changed=0; exit=0")) 'Original E4 build success missing'
}
$Preparation=Join-Path $Evidence 'e4-profile-prep-20261010-r1'
foreach($File in Get-ChildItem -LiteralPath (Join-Path $Preparation 'before') -Recurse -File){
    $Copy=Track $File.FullName
    $Archives[$Inputs[$Copy]]=$Copy
}
Bind (Manifest (Join-Path $Preparation 'before-inputs.json'))
foreach($File in Get-ChildItem -LiteralPath (Join-Path $Preparation 'before-runtime') -Recurse -File){
    $Copy=Track $File.FullName
    $Archives[$Inputs[$Copy]]=$Copy
}
Bind (Manifest (Join-Path $Preparation 'before-runtime-inputs.json'))
$ContactPreparation=Join-Path $Evidence 'e4-contact-edit-prep-20261010-r1'
foreach($File in Get-ChildItem -LiteralPath (Join-Path $ContactPreparation 'before') -Recurse -File){
    $Copy=Track $File.FullName
    $Archives[$Inputs[$Copy]]=$Copy
}
Bind (Manifest (Join-Path $ContactPreparation 'before-inputs.json'))
foreach($MobileRound in @('r1','r2')){
    $MobilePreparation=Join-Path $Evidence "e4-mobile-lead-prep-20261010-$MobileRound"
    foreach($File in Get-ChildItem -LiteralPath (Join-Path $MobilePreparation 'before') -Recurse -File){
        $Copy=Track $File.FullName
        $Archives[$Inputs[$Copy]]=$Copy
    }
    Bind (Manifest (Join-Path $MobilePreparation 'before-inputs.json'))
}
foreach($Maintenance in Get-ChildItem -LiteralPath $Evidence -Directory|Where-Object Name -Like 'e4-smtp-maintenance-20261010-*'){
    $BeforeDirectory=Join-Path $Maintenance.FullName 'before'
    if(Test-Path -LiteralPath $BeforeDirectory){
        foreach($File in Get-ChildItem -LiteralPath $BeforeDirectory -Recurse -File){
            $Copy=Track $File.FullName
            $Archives[$Inputs[$Copy]]=$Copy
        }
        Bind (Manifest (Join-Path $Maintenance.FullName 'before-inputs.json'))
    }
}
$null=Track (Join-Path $Preparation 'original.ps1')
$PreparationResult=Json (Track (Join-Path $Preparation 'result.json'))
Require ($PreparationResult.OriginalsPreserved -and $PreparationResult.ProductFiles -eq 9 -and $PreparationResult.RuntimeFiles -eq 13 -and $PreparationResult.BaselineBackend -eq 'r141' -and $PreparationResult.BaselineFrontend -eq 'r91') 'E4 preserved baseline differs'
$ExpectedChanges=@(
    'cloudflow-backend/cloudflow-service-crm/src/main/java/com/cloudflow/crm/service/impl/CrmLeadScoreEngine.java',
    'cloudflow-frontend/src/components/crm/operations/ProfileFields.tsx',
    'cloudflow-frontend/src/services/api/crm/types.ts',
    'cloudflow-frontend/src/pages/CrmTerritoryPage.tsx',
    'cloudflow-frontend/src/pages/CrmLeadScorePage.tsx',
    'cloudflow-frontend/src/components/crm/operations/LeadActions.tsx',
    'cloudflow-backend/cloudflow-service-crm/src/main/java/com/cloudflow/crm/domain/CrmLead.java',
    'cloudflow-backend/cloudflow-service-crm/src/main/java/com/cloudflow/crm/domain/CrmCustomer.java',
    'cloudflow-frontend/src/router.tsx',
    'cloudflow-frontend/src/pages/CrmLeadPage.tsx'
)|ForEach-Object{Full $_}
$ProductImpact=@()
foreach($Definition in @(@{Kind='backend';Version='r141'},@{Kind='frontend';Version='r91'})){
    $Before=Manifest (Join-Path $Evidence "h3-portal-finance-20261002-$($Definition.Kind)-$($Definition.Version)-inputs.json")
    $After=$Builds[$Definition.Kind]
    foreach($Path in $After.Keys|Where-Object{$Before[$_] -ne $After[$_]}){
        Require ($ExpectedChanges -contains $Path -and $Before.ContainsKey($Path)) 'Unexpected E4 product impact'
        Require ($Archives.ContainsKey($Before[$Path])) 'E4 original source absent'
        $null=Track $Archives[$Before[$Path]] $Before[$Path]
        $ProductImpact+=@{Path=$Path;BeforeHash=$Before[$Path];AfterHash=$After[$Path];Added=$false}
    }
    Require (@($Before.Keys|Where-Object{-not $After.ContainsKey($_)}).Count -eq 0) 'Unexpected removed E4 product file'
}
Require ($ProductImpact.Count -eq 10) 'E4 expected ten-file product change differs'
$CurrentDirectory=Join-Path $Evidence "e4-profile-independent-20261010-$IndependentRound"
$Directories=@(Get-ChildItem -LiteralPath $Evidence -Directory|Where-Object {$_.Name -match '^e4-profile-independent-20261010-r([1-9][0-9]*)$' -and [int]$Matches[1] -le [int]$IndependentRound.Substring(1)}|Sort-Object Name)
Require ($Directories.Count -eq [int]$IndependentRound.Substring(1) -and $Directories.FullName -contains $CurrentDirectory) 'E4 run history incomplete'
foreach($Directory in $Directories){
    foreach($File in Get-ChildItem -LiteralPath (Join-Path $Directory.FullName 'originals') -Recurse -File){
        $Copy=Track $File.FullName
        $Archives[$Inputs[$Copy]]=$Copy
    }
}
$Failures=[Collections.Generic.List[object]]::new()
foreach($Directory in $Directories){
    $Launcher=Json (Join-Path $Directory.FullName 'launcher-result.json')
    $Business=Json (Join-Path $Directory.FullName 'result.json')
    $RunNumber=[int]($Directory.Name -replace '^.*-r','')
    $ExpectedFrontend=if($RunNumber -le 2){'r92'}elseif($RunNumber -le 7){'r93'}elseif($RunNumber -eq 8){'r94'}else{$FrontendRound}
    Require ($Launcher.backend -eq $BackendRound -and $Launcher.frontend -eq $ExpectedFrontend -and $Business.backendRound -eq $Launcher.backend -and $Business.frontendRound -eq $Launcher.frontend) 'Historical E4 product version differs from its original execution'
    foreach($Build in @(@{Kind='backend';Version=$Launcher.backend},@{Kind='frontend';Version=$Launcher.frontend})){
        Bind (Manifest (Join-Path $Evidence "h3-portal-finance-20261002-$($Build.Kind)-$($Build.Version)-inputs.json"))
    }
    Require ($Launcher.inputsUnchanged -and $Launcher.processesStopped -and $Launcher.referenceKept -and $Launcher.referenceBusinessTables -eq 31 -and -not $Launcher.priorRuntimeWritten -and $Launcher.databaseRetained) 'E4 preservation boundary differs'
    Require ($Launcher.stopErrors.Count -eq 0 -and $Launcher.captchaCounterWrites -eq 0 -and $Launcher.captchaConfigurationWrites -eq 0 -and -not $Launcher.externalMessagesSent -and -not $Launcher.systemClockChanged) 'E4 run side-effect boundary differs'
    $RunInputs=Manifest (Join-Path $Directory.FullName 'inputs.json')
    $RuntimeInputs=Manifest (Join-Path $Directory.FullName 'runtime-inputs.json')
    $Originals=@(Get-ChildItem -LiteralPath (Join-Path $Directory.FullName 'originals') -Recurse -File)
    Require ($RunInputs.Count -eq $Launcher.inputs -and $RuntimeInputs.Count -eq $Launcher.runtimeInputs -and $Originals.Count -eq $Launcher.executionOriginals) 'E4 executed input inventory differs'
    Bind $RunInputs
    Bind $RuntimeInputs
    $Before=Json (Join-Path $Directory.FullName 'reference-business-before.json')
    $After=Json (Join-Path $Directory.FullName 'reference-business-after.json')
    Require (@($Before.PSObject.Properties).Count -eq 31) 'E4 original business coverage differs'
    foreach($Property in $Before.PSObject.Properties){Require ($After.($Property.Name) -eq $Property.Value) 'Original business table changed'}
    $Run=Full $Launcher.run
    Require ((Split-Path -Parent $Run) -eq (Join-Path $Root '.cloudflow-runtime/batch-g-integration') -and $Run -ne $Reference) 'E4 independent runtime path differs'
    $State=Json (Join-Path $Run 'state.json')
    Require ($State.status -eq 'STOPPED' -and $State.processes.Count -eq 8 -and $State.services.Count -eq 6) 'E4 owned services not fully stopped'
    foreach($Entry in $State.processes){$Observed=Get-CimInstance Win32_Process -Filter "ProcessId=$($Entry.id)";Require (-not $Observed -or -not $Observed.CommandLine.Contains($Entry.marker)) 'E4 independent process still active'}
    $Protection=Json (Join-Path $Directory.FullName 'runtime-after.json')
    Require ($Protection.passed -and $Protection.leaks -eq 0 -and $Protection.databaseLeaks -eq 0 -and $Protection.counterWrites -eq 0 -and $Protection.configurationWrites -eq 0) 'E4 runtime protection failed'
    Require ($Protection.persistentLimit -eq '100' -and $Protection.cachedLimit -eq '"100"' -and $Protection.counterBefore -eq 0 -and $Protection.counter -eq 8) 'E4 captcha read-only boundary differs'
    Require ($Business.cleanupFailures.Count -eq 0 -and $Business.secretScan.leaks -eq 0) 'E4 cleanup or secret scan failed'
    $null=Track (Join-Path $Run 'state.json')
    foreach($File in Get-ChildItem -LiteralPath $Directory.FullName -Recurse -File){$null=Track $File.FullName}
    if($Directory.FullName -eq $CurrentDirectory){
        Require ($Launcher.passed -and $Launcher.verifierExit -eq 0 -and $Business.passed) 'Current E4 business run failed'
        $Current=$Business;$CurrentLauncher=$Launcher;$CurrentProtection=$Protection;$CurrentInputs=$RunInputs;$CurrentRuntimeInputs=$RuntimeInputs
    }else{
        if($Business.passed){
            $Visual=Json (Track (Join-Path $Directory.FullName 'visual-review.json'))
            Require ($Launcher.passed -and $Launcher.verifierExit -eq 0 -and $Visual.ActuallyViewed -and -not $Visual.VisualAccepted -and $Visual.Images.Count -eq 18) 'Historical E4 visual rejection missing'
            foreach($Image in $Visual.Images){Require ($Image.ActuallyViewed) 'Historical E4 image not actually viewed';$null=Track (Join-Path $Directory.FullName $Image.Name) $Image.Hash}
            $Failures.Add(@{Round=$Directory.Name;Passed=$false;BusinessPassed=$true;VisualAccepted=$false;Reason=$Visual.Reason;Checks=$Business.checks.Count;Requests=$Business.requests.Count;UiRequests=$Business.uiRequests.Count;ReviewedImages=18;InputsUnchanged=$true;ProcessesStopped=$true;Retained=$true})
        }else{
            Require (-not $Launcher.passed -and $Launcher.verifierExit -eq 1) 'Historical E4 failure was changed'
            $Failures.Add(@{Round=$Directory.Name;Passed=$false;BusinessPassed=$false;Reason=$Business.failure;Checks=$Business.checks.Count;Requests=$Business.requests.Count;UiRequests=$Business.uiRequests.Count;InputsUnchanged=$true;ProcessesStopped=$true;Retained=$true})
        }
    }
}
Require ($Current.backendRound -eq $BackendRound -and $Current.frontendRound -eq $FrontendRound -and $Current.finalAcceptancePending -and -not $Current.globalComplete) 'Current E4 acceptance boundary differs'
Require ($Current.independentDatabaseOnly -and -not $Current.originalEnvironmentWritten -and -not $Current.systemClockChanged -and -not $Current.externalMessagesSent) 'Current E4 execution scope differs'
Require ($Current.browserErrors.Count -eq 0 -and $Current.cleanupFailures.Count -eq 0 -and $Current.secretScan.leaks -eq 0) 'Current E4 browser, cleanup or secrets failed'
foreach($Flag in @('profileFields','qualification','conversionGuard','conversionMapping','territories','scoring','batch','filters','consent','reports','audits','permissions','desktop','mobile','preservation','secrets')){
    Require ($Current.evidence.$Flag -eq $true) ('Actual E4 evidence missing: '+$Flag)
}
foreach($Actor in @('sales','manager','readonly')){Require ($Current.checks -contains "actual_data_scope_$Actor") 'E4 logged-in data scope proof missing'}
$Fixture=Json (Join-Path $CurrentDirectory 'fixture.json')

$Required='{"AC-1":["profile_fields_survive_actual_create_and_query","create_cannot_forge_qualification_or_score_metadata","create_unsubscribe_has_server_timestamp","invalid_profile_creates_leave_no_partial_leads","page_profile_save_preserves_maximum_amount_to_the_cent","phone_reopened_profile_keeps_exact_amount_and_profile_choices","profile_page_edit_preserves_full_source_contact_values"],"AC-2":["start_qualifying_sets_only_assessment_state","qualify_records_actual_actor_name_and_time","disqualify_persists_reason_actor_and_time","stale_qualification_keeps_entire_lead","page_disqualification_is_persisted","phone_qualification_is_persisted"],"AC-3":["disqualification_empty_reason_is_rejected","disqualification_blank_reason_is_rejected","disqualification_too_long_reason_is_rejected","qualification_page_disables_disqualify_without_reason"],"AC-4":["UNQUALIFIED_cannot_convert","UNQUALIFIED_conversion_preserves_lead_and_creates_no_customer_contact_or_opportunity","QUALIFYING_cannot_convert","QUALIFYING_conversion_preserves_lead_and_creates_no_customer_contact_or_opportunity","DISQUALIFIED_cannot_convert","DISQUALIFIED_conversion_preserves_lead_and_creates_no_customer_contact_or_opportunity"],"AC-5":["disqualified_must_start_reassessment_before_qualification","reassessment_clears_previous_decision_metadata","converted_lead_cannot_be_reassessed","phone_disqualified_dialog_starts_with_reassessment","phone_reassessment_is_persisted"],"AC-6":["five_level_tree_and_subtree_include_each_descendant_once","sixth_level_is_rejected","sixth_level_rejection_rolls_back_insert","invalid_tree_move_self","invalid_tree_move_descendant","invalid_tree_move_excess_depth","parent_with_children_cannot_be_deleted","unreferenced_leaf_is_deleted","territory_boundary_values_save_from_actual_page","territory_long_name_and_code_reopen_without_truncation","territory_mobile_refresh_keeps_saved_name_and_code"],"AC-7":["moving_branch_rewrites_all_descendant_paths","old_subtree_query_excludes_moved_branch","foreign_subtree_cannot_be_read","actual_drag_and_drop_saves_moved_branch","browser_drag_rewrites_entire_branch_path"],"AC-8":["conversion_maps_all_eight_profile_and_attribution_fields","conversion_keeps_website_contact_channels_and_combines_remarks","conversion_creates_exact_contact_from_source_fields","converted_contact_preserves_full_encrypted_mobile_and_email","optional_opportunity_keeps_source_and_exact_amount","repeated_conversion_keeps_all_records","phone_conversion_preserves_exact_revenue_and_segmentation","phone_conversion_submits_exact_decimal_amount","phone_conversion_persists_exact_maximum_opportunity_amount","phone_conversion_amount_uses_actual_opportunity_maximum","conversion_rejects_opportunity_amount_beyond_twelve_integer_digits","oversized_conversion_rolls_back_customer_contact_opportunity_and_source","phone_conversion_uses_server_source_for_unedited_contact_fields","phone_conversion_customer_keeps_full_source_email","phone_conversion_creates_source_contact_once","phone_conversion_contact_keeps_full_source_mobile_and_email"],"AC-9":["invalid_score_rule_missing_field","invalid_score_rule_missing_operator","all_eleven_score_operators_accumulate_and_disabled_rule_is_ignored","score_rule_edit_preserves_other_rules_and_increments_version","stale_score_edit_preserves_entire_catalog","single_recalculate_returns_updated_score","normal_profile_edit_recalculates_exact_nonmatching_rules","score_rule_reopens_all_120_name_characters","page_rule_rename_preserves_scoring_semantics","score_rule_mobile_refresh_keeps_saved_full_name"],"AC-10":["batch_returns_durable_event_identifier","batch_event_preserves_tenant_and_deduplicates_lead_ids","asynchronous_batch_updates_each_lead_once_and_keeps_manual_qualification","denied_batches_create_no_outbox_event","score_range_filter_includes_only_expected_owned_rows","score_order_ASC_matches_actual_values","score_order_DESC_matches_actual_values","actual_score_filters_and_order_show_expected_rows","phone_batch_button_submits_real_async_request","phone_async_batch_keeps_manual_status_and_updates_each_record_once"],"AC-11":["single_score_recalculation_preserves_all_qualification_metadata","normal_profile_edit_preserves_qualification_and_cannot_forge_it","asynchronous_batch_updates_each_lead_once_and_keeps_manual_qualification","phone_async_batch_keeps_manual_status_and_updates_each_record_once"],"AC-12":["actual_marketing_audience_excludes_opted_out_lead_and_customer","resubscription_clears_time_and_immediately_returns_to_audience","customer_unsubscribe_immediately_removes_existing_list_member","denied_consent_updates_do_not_change_marketing_audience","unsubscribed_lead_can_still_be_qualified_for_normal_business","unsubscribed_lead_converts_and_customer_keeps_optout"],"AC-13":["report_rejects_unknown_dimension","report_requires_explicit_permission","department_report_excludes_other_department_owned_records","keyboard_report_table_preserves_every_group_and_count","phone_profile_chart_keeps_both_real_series","readonly_lead_page_hides_profile_and_qualification_mutations","readonly_territory_page_hides_create_edit_and_delete","sales_territory_funnel_matches_all_visible_real_leads","sales_territory_distribution_matches_independent_sql_aggregation","sales_territory_totals_include_each_visible_record_once","sales_segment_funnel_matches_all_visible_real_leads","sales_segment_distribution_matches_independent_sql_aggregation","sales_segment_totals_include_each_visible_record_once","sales_industry_funnel_matches_all_visible_real_leads","sales_industry_distribution_matches_independent_sql_aggregation","sales_industry_totals_include_each_visible_record_once","sales_score_funnel_matches_all_visible_real_leads","sales_score_distribution_matches_independent_sql_aggregation","sales_score_totals_include_each_visible_record_once","sales_score_report_does_not_invent_customer_scores","manager_territory_funnel_matches_all_visible_real_leads","manager_territory_distribution_matches_independent_sql_aggregation","manager_territory_totals_include_each_visible_record_once","manager_segment_funnel_matches_all_visible_real_leads","manager_segment_distribution_matches_independent_sql_aggregation","manager_segment_totals_include_each_visible_record_once","manager_industry_funnel_matches_all_visible_real_leads","manager_industry_distribution_matches_independent_sql_aggregation","manager_industry_totals_include_each_visible_record_once","manager_score_funnel_matches_all_visible_real_leads","manager_score_distribution_matches_independent_sql_aggregation","manager_score_totals_include_each_visible_record_once","manager_score_report_does_not_invent_customer_scores","readonly_territory_funnel_matches_all_visible_real_leads","readonly_territory_distribution_matches_independent_sql_aggregation","readonly_territory_totals_include_each_visible_record_once","readonly_segment_funnel_matches_all_visible_real_leads","readonly_segment_distribution_matches_independent_sql_aggregation","readonly_segment_totals_include_each_visible_record_once","readonly_industry_funnel_matches_all_visible_real_leads","readonly_industry_distribution_matches_independent_sql_aggregation","readonly_industry_totals_include_each_visible_record_once","readonly_score_funnel_matches_all_visible_real_leads","readonly_score_distribution_matches_independent_sql_aggregation","readonly_score_totals_include_each_visible_record_once","readonly_score_report_does_not_invent_customer_scores","admin_territory_funnel_matches_all_visible_real_leads","admin_territory_distribution_matches_independent_sql_aggregation","admin_territory_totals_include_each_visible_record_once","admin_segment_funnel_matches_all_visible_real_leads","admin_segment_distribution_matches_independent_sql_aggregation","admin_segment_totals_include_each_visible_record_once","admin_industry_funnel_matches_all_visible_real_leads","admin_industry_distribution_matches_independent_sql_aggregation","admin_industry_totals_include_each_visible_record_once","admin_score_funnel_matches_all_visible_real_leads","admin_score_distribution_matches_independent_sql_aggregation","admin_score_totals_include_each_visible_record_once","admin_score_report_does_not_invent_customer_scores","foreign_territory_funnel_matches_all_visible_real_leads","foreign_territory_distribution_matches_independent_sql_aggregation","foreign_territory_totals_include_each_visible_record_once","foreign_segment_funnel_matches_all_visible_real_leads","foreign_segment_distribution_matches_independent_sql_aggregation","foreign_segment_totals_include_each_visible_record_once","foreign_industry_funnel_matches_all_visible_real_leads","foreign_industry_distribution_matches_independent_sql_aggregation","foreign_industry_totals_include_each_visible_record_once","foreign_score_funnel_matches_all_visible_real_leads","foreign_score_distribution_matches_independent_sql_aggregation","foreign_score_totals_include_each_visible_record_once","foreign_score_report_does_not_invent_customer_scores","actual_territory_chart_series_match_visible_business_totals","actual_segment_chart_series_match_visible_business_totals","actual_industry_chart_series_match_visible_business_totals","actual_score_chart_series_match_visible_business_totals"],"AC-14":["all_qualification_actions_have_durable_audits","all_consent_changes_are_auditable_with_operator_and_risk"]}'|ConvertFrom-Json -AsHashtable
$Required.'AC-1'+=@('profile_edit_omits_unchanged_masked_contact_fields','phone_contact_changed_persists_exact_user_input','phone_contact_cleared_persists_exact_user_input','phone_contact_restored_persists_exact_user_input')
$Required.'AC-10'+=@('phone_list_keeps_each_full_lead_name_visible_beside_actions','phone_lead_actions_wrap_without_covering_identity_and_keep_44px_targets')
$SharedChecks=@{'AC-5'=@{Source='AC-8';Checks=@('converted_lead_cannot_be_reassessed','rejected_converted_reassessment_preserves_source')}}
$Items=@(foreach($Number in 1..14){
    $Key="AC-$Number";$Executed=$Current.acceptance.$Key
    $ExecutedLabels=@($Executed.checks)
    $SourceGroups=@($Key)
    if($SharedChecks.ContainsKey($Key)){
        $Shared=$SharedChecks[$Key]
        $SourceGroup=$Current.acceptance.($Shared.Source)
        foreach($Label in $Shared.Checks){Require ($SourceGroup.executed -and $Current.checks -contains $Label -and $SourceGroup.checks -contains $Label) 'Shared E4 check lacks its actual source execution'}
        $ExecutedLabels+=@($Shared.Checks)
        $SourceGroups+=@($Shared.Source)
    }
    Require ($Executed.executed -and $Executed.checks.Count -gt 0 -and $Required.$Key.Count -gt 0) 'E4 item lacks executed acceptance checks'
    foreach($Label in $Required.$Key){Require ($Current.checks -contains $Label -and $ExecutedLabels -contains $Label) ("Required E4 acceptance missing: "+$Label)}
    [pscustomobject]@{Id=$Key;Passed=$true;BusinessResult=(Join-Path $CurrentDirectory 'result.json');RequiredChecks=@($Required.$Key);ExecutedChecks=@($ExecutedLabels|Select-Object -Unique);SourceAcceptanceGroups=$SourceGroups}
})
Require ($Fixture.reportObservations.Count -eq 20 -and $Fixture.pageReportChecks.dimensions -eq 4 -and $Fixture.pageReportChecks.keyboardTable -and $Fixture.pageReportChecks.readonlyActionsHidden -and $Fixture.pageReportChecks.mobileRefreshed) 'E4 actual report coverage incomplete'
Require ($Fixture.batches.Count -eq 2 -and @($Fixture.batches|Where-Object {-not $_.actualConsumer -or $_.leadIds.Count -ne 3}).Count -eq 0) 'E4 actual asynchronous batch evidence incomplete'
$MobileConversion=@($Fixture.conversions|Where-Object actualMobilePage)
Require ($MobileConversion.Count -eq 1 -and $MobileConversion[0].exactRevenue -eq '99999999999999.99' -and $MobileConversion[0].exactOpportunityAmount -eq '999999999999.99' -and $MobileConversion[0].opportunity -and $MobileConversion[0].contact -and $MobileConversion[0].fullContactPreserved) 'Exact mobile conversion and opportunity amount proof missing'
Require ($Fixture.consentCases.finalRecipients -eq 1 -and -not $Fixture.consentCases.externalDeliveryAttempted) 'E4 marketing audience proof or delivery boundary differs'
$ReviewPath=Track (Join-Path $Evidence 'e4-profile-image-review-20261010-r1/manifest.json')
$Review=Json $ReviewPath
Require ($Review.ActuallyViewed -and $Review.VisualAccepted -and $Review.Round -eq $IndependentRound -and $Review.Images.Count -eq 18 -and $Fixture.images.Count -eq 18) 'Actual E4 image review incomplete'
foreach($Image in $Review.Images){
    Require ($Image.ActuallyViewed -and $Image.VisualAccepted -and @($Fixture.images|Where-Object name -EQ $Image.Name).Count -eq 1) 'Reviewed image is not from the actual E4 run'
    $null=Track (Join-Path $CurrentDirectory $Image.Name) $Image.Hash
}
$AdjacentDirectory=Join-Path $Evidence "h3-portal-finance-adjacent-20261002-$AdjacentRound"
$AdjacentInputs=Manifest (Join-Path $AdjacentDirectory 'inputs.json')
Bind $AdjacentInputs
$AdjacentLog=Get-Content -LiteralPath (Join-Path $AdjacentDirectory 'summary.log') -Raw
Require ($AdjacentLog.Contains("H3_FINANCE_ADJACENT: files=$($AdjacentInputs.Count); changed=0; exit=0; production_modified=false") -and $AdjacentLog.Contains('name=formal-01-07-and-oa-behavior; exit=0')) 'E4 adjacent original execution did not pass'
foreach($File in Get-ChildItem -LiteralPath $AdjacentDirectory -File){$null=Track $File.FullName}
$PackageDirectory=Join-Path $Evidence "backend-executable-verification-20261006-$PackageRound"
$Packages=Json (Track (Join-Path $PackageDirectory 'result.json'))
Require ($Packages.Passed -and $Packages.BackendRound -eq $BackendRound -and $Packages.InputChanges -eq 0 -and $Packages.Services.Count -eq 6) 'E4 actual package proof differs'
$DeploymentPath=Track (Join-Path $Evidence "e1-reminder-deployment-20261007-$DeploymentRound/result.json")
$Deployment=Json $DeploymentPath
Require ($Deployment.Passed -and $Deployment.Backend -eq $BackendRound -and $Deployment.PackageRound -eq $PackageRound -and $Deployment.InputChanges -eq 0 -and $Deployment.HealthyServices -eq 6 -and -not $Deployment.ProductionModified) 'E4 actual local deployment proof differs'
$State=Json (Track (Join-Path $Reference 'state.json'))
Require ($State.status -eq 'RUNNING' -and $State.processes.Count -eq 9 -and $State.services.Count -eq 6) 'Reference runtime structure differs'
foreach($Entry in $State.processes){
    $Observed=Get-CimInstance Win32_Process -Filter "ProcessId=$($Entry.id)"
    Require ($Observed -and $Observed.CommandLine.Contains($Entry.marker)) 'Reference process ownership changed'
}
$RuntimeFiles=0
foreach($Service in $State.services){
    $Arguments=@(Get-Content -LiteralPath (Join-Path $Reference "$($Service.name)/service.args"))
    $Index=[Array]::IndexOf($Arguments,'-cp')
    Require ($Index -ge 0 -and $Arguments[$Index+2] -eq 'org.springframework.boot.loader.launch.JarLauncher') 'E4 layered runtime launch absent'
    $Layer=Full ($Arguments[$Index+1].Trim('"'))
    $Package=@($Packages.Services|Where-Object Name -EQ $Service.name)
    Require ($Package.Count -eq 1 -and $Layer -eq (Join-Path $Reference ("$($Service.name)/artifacts/"+$Package[0].Hash.ToLowerInvariant()+'-layered'))) 'E4 runtime package differs from actual build'
    $null=Track (Join-Path $Root $Package[0].Path) $Package[0].Hash
    $Files=@(Get-ChildItem -LiteralPath $Layer -Recurse -Force)
    Require (@($Files|Where-Object{$_.Attributes -band [IO.FileAttributes]::ReparsePoint}).Count -eq 0) 'Redirected E4 runtime layer'
    foreach($File in @($Files|Where-Object{-not $_.PSIsContainer})){Require ($Inputs.ContainsKey($File.FullName)) 'Untracked E4 runtime file';$RuntimeFiles++}
    Require ((Invoke-RestMethod -Uri "http://127.0.0.1:$($Service.healthPort)/actuator/health" -TimeoutSec 15).status -eq 'UP') 'Reference service unhealthy'
}
Require ($RuntimeFiles -eq $Deployment.RuntimeFiles) 'E4 deployment runtime file count differs'
$ReceiptFile=Track $TerminalReceiptsPath
$Receipts=@(Json $ReceiptFile)
foreach($Name in @(('backend'+$BackendRound.Substring(1)),('frontend'+$FrontendRound.Substring(1)),('packages'+$PackageRound.Substring(1)),('deployment'+$DeploymentRound.Substring(1)),('independent'+$IndependentRound.Substring(1)),('adjacent'+$AdjacentRound.Substring(1)))){
    $Receipt=@($Receipts|Where-Object Name -EQ $Name)
    Require ($Receipt.Count -eq 1 -and $Receipt[0].TerminalCollected -and $Receipt[0].Exit -eq 0 -and [string]$Receipt[0].Chunk -match '^[a-f0-9]+$') 'Original E4 successful terminal receipt missing'
}
foreach($Receipt in $Receipts){Require ($Receipt.TerminalCollected -and [string]$Receipt.Chunk -match '^[a-f0-9]+$') 'Original E4 terminal evidence incomplete'}
$null=Track $PSCommandPath
$null=Track (Join-Path $Output 'original.ps1') (Hash $PSCommandPath)
foreach($Path in $Inputs.Keys){Require ((Hash $Path) -eq $Inputs[$Path]) ("E4 reconciliation input changed: "+$Path)}
$InputFile=Join-Path $Output 'inputs.json'
@($Inputs.Keys|Sort-Object|ForEach-Object{[pscustomobject]@{Path=$_;Hash=$Inputs[$_]}})|ConvertTo-Json -Depth 3|Set-Content -LiteralPath $InputFile -Encoding utf8NoBOM
$Summary=[pscustomobject]@{
    Passed=$true;Backend=$BackendRound;Frontend=$FrontendRound;AcceptanceCount=14;Items=$Items;All14Complete=$true;GlobalComplete=$false
    Independent=$IndependentRound;Checks=$Current.checks.Count;Requests=$Current.requests.Count;UiRequests=$Current.uiRequests.Count
    CurrentInputs=$Inputs.Count;InputChanges=0;CurrentRuntimeFiles=$RuntimeFiles;IndependentInputCount=$CurrentInputs.Count;IndependentRuntimeInputCount=$CurrentRuntimeInputs.Count;ExecutionOriginals=$CurrentLauncher.executionOriginals
    ProductImpact=$ProductImpact;HistoricalFailures=@($Failures.ToArray());HistoricalInputBindings=@($Bindings.ToArray());OriginalFailureResultsChanged=$false
    PriorRuntimeWritten=$false;ReferenceBusinessTables=31;ReferenceKept=$true;IndependentProcessesStopped=$true;IndependentDatabasesRetained=$true
    ReviewedImages=$Review.Images.Count;ImageReview=$ReviewPath;BrowserErrors=0;SecretScan=$Current.secretScan;RuntimeProtection=$CurrentProtection
    Conversions=$Fixture.conversions;Batches=$Fixture.batches;Consent=$Fixture.consentCases;ReportObservations=$Fixture.reportObservations;PageReportChecks=$Fixture.pageReportChecks
    CaptchaCounterWrites=0;CaptchaConfigurationWrites=0;SystemClockChanged=$false;ExternalMessagesSent=$false
    AmountSchema='Annual revenue DECIMAL(16,2), maximum 99999999999999.99, JSON string; opportunity business maximum 999999999999.99 under CrmSalesAmounts.expected; PRD initial revenue DECIMAL(14,2) difference disclosed'
    OriginalTerminalReceipts=$Receipts;Adjacent=$AdjacentRound;AdjacentInputs=$AdjacentInputs.Count;Processes=9;HealthyServices=6;PackageRound=$PackageRound;DeploymentRound=$DeploymentRound;DeploymentResult=$DeploymentPath
    InputManifest=$InputFile;ProductModified=$false;ProductionModified=$false
    Remaining=@('E5 and remaining PRD items','Whole-project 35 PRDs / 681 items and deferred external integration')
}
$Summary|ConvertTo-Json -Depth 35|Set-Content -LiteralPath (Join-Path $Output 'result.json') -Encoding utf8NoBOM
"E4_ALL_ACCEPTANCE: passed=true; items=14; checks=$($Current.checks.Count); inputs=$($Inputs.Count); runtime_files=$RuntimeFiles; images=18; healthy=6; all14_complete=true; global_complete=false"
