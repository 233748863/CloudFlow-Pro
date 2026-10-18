param([ValidatePattern('^r[1-9][0-9]*$')][string]$RuntimeRound='r2',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$AdjacentRound='r11',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$BackendRound='r32',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$FrontendRound='r7',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$RulesRound='r3',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$OwnershipRound='r4',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$RestartRound='r2',
    [ValidateRange(1,100000)][int]$ExpectedRulesChecks=684,
    [ValidateRange(1,100000)][int]$ExpectedBackendFiles=3820,
    [ValidateRange(1,100000)][int]$ExpectedOwnershipChecks=84,
    [switch]$RegistrationChecks,
    [switch]$SharedMonitorChecks,
    [switch]$EventMetadataChecks,
    [switch]$RecoveryChecks,
    [switch]$BusinessLockChecks,
    [ValidateRange(1,1000)][int]$ExpectedRuntimeInputs=19,
    [string]$RuntimeLaunchFile,
    [string]$RestartLogFile)
$ErrorActionPreference='Stop'
$Root='D:\CloudFlowPro'
. (Join-Path $Root '.cloudflow-runtime/use-data-drive.ps1')
$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
function Require-Markers([string]$File,[string[]]$Markers){
    $Content=Get-Content -LiteralPath (Join-Path $Evidence $File) -Raw
    foreach($Marker in $Markers){if($Content -notmatch $Marker){throw "Required evidence missing: $File"}}
    "A3_DEADLOCK_SCAN_EVIDENCE: file=$File; markers=true"
}
function Assert-Inputs([string]$File){
    $Inputs=@(Get-Content -LiteralPath (Join-Path $Evidence $File) -Raw|ConvertFrom-Json)
    if(-not $Inputs.Count){throw 'Nonempty snapshot required'}
    foreach($Item in $Inputs){$Path=if([IO.Path]::IsPathRooted($Item.Path)){$Item.Path}else{Join-Path $Root $Item.Path};if((Get-FileHash -LiteralPath $Path).Hash -ne $Item.Hash){throw "Input differs: $File"}}
    "A3_DEADLOCK_SCAN_INPUTS: file=$File; files=$($Inputs.Count); changed=0"
}
Require-Markers "h3-portal-finance-20261002-backend-$BackendRound.log" @('BUILD SUCCESS','\[static-rules\] no findings',"FINANCE_BUILD: phase=Backend; files=$ExpectedBackendFiles; changed=0; exit=0")
Require-Markers "h3-portal-finance-20261002-frontend-$FrontendRound.log" @('> tsc --noEmit','built in ','FINANCE_BUILD: phase=Frontend; files=1475; changed=0; exit=0')
Assert-Inputs "h3-portal-finance-20261002-backend-$BackendRound-inputs.json"
Assert-Inputs "h3-portal-finance-20261002-frontend-$FrontendRound-inputs.json"
$Adjacent="h3-portal-finance-adjacent-20261002-$AdjacentRound"
Require-Markers "$Adjacent/summary.log" @('regenerated_matches_formal=true; formal_modified=false','changed=0; exit=0; production_modified=false')
Require-Markers "$Adjacent/oa-database.log" @('Complete approved schema table count; expected=374; actual=374','PASS: 1012 OA boundary assertions')
Require-Markers "$Adjacent/sources.log" @('MP_SQL_LAST_APPLY: matches=0','MYBATIS_ANNOTATION_SQL: matches=0','login_only_external_endpoints=0','JAVA_PERMISSION_PREFIXES:.*invalid=0','STATIC_WHITELIST:.*stale_lines=0','EXIT_CODE=0')
Require-Markers "$Adjacent/menu.log" @('EMPLOYEE_UNEXPECTED_GRANTS=0; EMPLOYEE_UNEXPECTED_WRITE_PERMISSIONS=0','APPROVED_MENU_SCOPE_PASS=true')
Assert-Inputs "$Adjacent/inputs.json"
Require-Markers "a3-deadlock-scan-checks-20261003-$RulesRound/rules.log" @("DEADLOCK_SCAN_CHECKS: checks=$ExpectedRulesChecks; failed=0; real_detector=true; redis_locks_users_controlled=true")
Assert-Inputs "a3-deadlock-scan-checks-20261003-$RulesRound/inputs.json"
$Ownership="a3-deadlock-ownership-database-20261003-$OwnershipRound"
Require-Markers "$Ownership/checks.stdout.log" @('DEADLOCK_OWNERSHIP_FINAL: checks=[1-9][0-9]*; safety_defects=0; cleanup_verified=true',
    'same_owner_after_real_expiration_retained=PASS','same_owner_new_generation_and_records_retained=PASS',
    'new_owner_during_notice_retained=PASS','partial_reentrant_unlock_retains_monitoring=PASS',
    'mysql_second_insert_rollback=PASS; actual_release_recovery=PASS; repeat=PASS','real_waiter_wakeup=PASS')
Assert-Inputs "$Ownership/inputs.json"
if($RegistrationChecks){
    Require-Markers "$Ownership/checks.stdout.log" @("DEADLOCK_OWNERSHIP_FINAL: checks=$ExpectedOwnershipChecks; safety_defects=0; cleanup_verified=true",
        'waiter-write_reports_original_failure=PASS','holder-before_reports_original_failure=PASS','holder-after_reports_original_failure=PASS',
        'waiter-remove_reports_original_failure=PASS','failed_reentry_releases_only_new_layer=PASS','failed_reentry_preserves_original_record=PASS',
        'failed_registration_preserves_new_owner=PASS','failed_registration_does_not_delete_new_record=PASS',
        'stale_wrapper_release_preserves_new_same_thread_generation=PASS','release_cleanup_failure_visible_after_actual_unlock=PASS',
        'failed_release_metadata_retained_for_retry=PASS','release_cleanup_retry_finishes_without_reacquiring_lock=PASS')
}
if($SharedMonitorChecks){
    Require-Markers "$Ownership/checks.stdout.log" @("DEADLOCK_OWNERSHIP_FINAL: checks=$ExpectedOwnershipChecks; safety_defects=0; cleanup_verified=true",
        'fresh_instance_reads_both_remote_holders=PASS','fresh_instance_detects_cross_client_cycle=PASS',
        'fresh_instance_releases_timed_out_generation_with_real_notice_transaction=PASS','remote_scan_preserves_unexpired_peer_lock=PASS',
        'legacy_holder_without_lease_remains_readable=PASS','malformed_remote_record_reports_failure_without_release=PASS',
        'remote_holder_scan_is_tenant_scoped=PASS','concurrent_registration_preserves_all_waiters=PASS',
        'shared_holder_scan_requires_tenant_context=PASS',
        'concurrent_remove_preserves_new_waiter=PASS','victim_cleanup_preserves_concurrent_new_waiter=PASS',
        'busy_waiter_mutex_does_not_mutate_or_release_foreign_owner=PASS','waiter_mutex_interruption_visible_and_flag_retained=PASS',
        'waiter_mutex_interrupt_during_wait_preserves_owner_and_records=PASS',
        'waiter_mutex_recovers_after_owner_releases=PASS')
}
$OwnershipOutcome=Get-Content (Join-Path $Evidence "$Ownership/outcome.json") -Raw|ConvertFrom-Json
if($EventMetadataChecks){
    Require-Markers "$Ownership/checks.stdout.log" @("DEADLOCK_OWNERSHIP_FINAL: checks=$ExpectedOwnershipChecks; safety_defects=0; cleanup_verified=true",
        'cross_instance_events_have_unique_ids_and_complete_statistics=PASS','same_recovery_event_is_counted_once_across_instances=PASS',
        'recent_events_sort_numeric_ids_before_limit=PASS','concurrent_event_commits_preserve_both_events_and_counts=PASS',
        'statistics_type_failure_does_not_partially_save_event=PASS','lost_event_ack_keeps_committed_event_and_statistics_together=PASS',
        'lost_event_ack_retry_from_other_instance_is_idempotent=PASS','event_identity_seven_day_and_statistics_thirty_day_retention=PASS',
        'legacy_event_ids_and_statistics_are_preserved=PASS','event_ids_above_double_precision_are_preserved_exactly=PASS',
        'counter_overflow_fails_before_writing_event_or_statistics=PASS')
}
if($OwnershipOutcome.ExitCode -ne 0 -or $OwnershipOutcome.BackendRound -ne $BackendRound -or -not $OwnershipOutcome.InputsUnchanged -or $OwnershipOutcome.RedisCredentialScan -ne 'PASS'){throw 'Actual ownership checks incomplete'}
if($RecoveryChecks){
    Require-Markers "$Ownership/checks.stdout.log" @("DEADLOCK_OWNERSHIP_FINAL: checks=$ExpectedOwnershipChecks; safety_defects=0; cleanup_verified=true",
        'stale_unstarted_plan_is_cancelled_without_releasing_normal_locks=PASS',
        'cancel-before_retains_only_uncommitted_cancellation_without_side_effects=PASS','cancel-after_retains_only_uncommitted_cancellation_without_side_effects=PASS',
        'unstarted_plan_cancels_when_lock_generation_changes_even_with_same_cycle=PASS',
        'no-admin_changed_state_recovers_original_work_once=PASS','partial_replay_counts_only_remaining_release_and_preserves_both_original_outcomes=PASS',
        'partial_replay_preserves_new_lock_and_recreated_waiter=PASS','malformed_pending_plan_is_retained_without_side_effects=PASS',
        'pending_replay_does_not_read_or_change_another_tenant=PASS','lost_commit_ack_and_expired_event_do_not_recreate_completed_recovery=PASS',
        'absent_plan_cannot_commit_event_or_statistics=PASS','changed_plan_cannot_commit_or_delete_current_plan=PASS',
        'exact_plan_commits_event_statistics_and_removal_together=PASS','existing_event_removes_matching_plan_without_counting_again=PASS')
    foreach($Boundary in @('prepare-before','prepare-after','release-before','release-after','cleanup-before','waiter-before','waiter-after','commit-before','commit-after')){
        Require-Markers "$Ownership/checks.stdout.log" @("${Boundary}_event_and_statistics_remain_together=PASS", "${Boundary}_pending_survives_required_boundary=PASS",
            "${Boundary}_fresh_scan_finishes_once=PASS", "${Boundary}_actual_release_count_and_notice_deduplication=PASS", "${Boundary}_journal_preserves_real_release_outcome=PASS", "${Boundary}_repeat_has_no_duplicate_effects=PASS")
    }
}
Require-Markers "a3-deadlock-scan-20261003-http-$RuntimeRound.log" @('A3_DEADLOCK_SCAN_REAL_RESULT: checks=[1-9][0-9]*; failed=0; requests=[1-9][0-9]*;',
    '"counts":true','"failure":true','"retention":true','"alarm":true','"recovery":true','"repeat":true',
    '"permissions":true','"restoration":true','"secrets":true','"realMalformedCache":true',
    '"actualBusinessLockRelease":false','"naturalTenMinuteWait":false','"forcedBusinessWrites":0','"leaks":0','"databaseLeaks":0',
    "A3_DEADLOCK_SCAN_INPUTS: files=$ExpectedRuntimeInputs; changed=0; product_changed=0; exit=0")
Assert-Inputs "a3-deadlock-scan-20261003-inputs-$RuntimeRound.json"
if(-not $RuntimeLaunchFile){$RuntimeLaunchFile="a3-deadlock-scan-launch-20261003-$RuntimeRound.log"}
if(-not $RestartLogFile){$RestartLogFile="a3-deadlock-scan-restart-workflow-20261003-$RestartRound.log"}
foreach($File in @($RuntimeLaunchFile,$RestartLogFile)){if($File -notmatch '^[a-z0-9-]+\.log$'){throw 'Evidence filename required'}}
Require-Markers $RuntimeLaunchFile @('A3_DEADLOCK_SCAN_RUN_EXIT=0','OWNED_CAPTCHA_RESTORED: original_limit=100; original_ttl=-1;','counter_writes=0; database_unchanged=true; production_modified=false')
Require-Markers $RestartLogFile @('ISOLATED_RESTART_READY: service=workflow;')
if($BusinessLockChecks){
    Require-Markers "a3-deadlock-scan-20261003-http-$RuntimeRound.log" @('"businessRollback":true','"businessCountersign":true','"businessParent":true','"businessRestoration":true',
        '"realApprovalRevocations":2','"realCountersignRenewal":true','"realParentProtection":true','"forcedWorkflowOutcomeWrites":0')
    Require-Markers "$Ownership/checks.stdout.log" @('business_revoked_request_rolls_back_real_mysql_before_commit=PASS',
        'business_commit_gate_blocks_timeout_release_and_retains_monitor=PASS','business_old_renewal_cannot_extend_same_owner_new_generation=PASS',
        'business_missing_monitor_stops_renewal_and_rolls_back_real_mysql=PASS','business_real_circular_wait_commits_one_request_and_rejects_revoked_request=PASS',
        'business_independent_commit_preserves_suspended_outer_lock_and_releases_inner=PASS','business_independent_commit_survives_outer_real_rollback=PASS',
        'business_after_commit_independent_transaction_commits_real_write=PASS','business_nested_and_after_commit_clear_all_locks_and_transaction_context=PASS')
}
$State=Get-Content -LiteralPath (Join-Path $Root '.cloudflow-runtime/batch-g-integration/9799534e1a3a47b5958330f14ae16dc7/state.json') -Raw|ConvertFrom-Json
if($State.status -ne 'RUNNING' -or $State.processes.Count -ne 9 -or $State.services.Count -ne 6){throw 'Owned environment incomplete'}
foreach($Entry in $State.processes){$Observed=Get-CimInstance Win32_Process -Filter "ProcessId=$($Entry.id)";if(-not $Observed -or -not $Observed.CommandLine.Contains($Entry.marker)){throw 'Owned process identity mismatch'}}
foreach($Service in $State.services){$Health=Invoke-RestMethod -Uri "http://127.0.0.1:$($Service.healthPort)/actuator/health" -TimeoutSec 15;if($Health.status -ne 'UP'){throw 'Owned service unhealthy'}}
$Items=@('maven-install-and-static-rules','frontend-types','frontend-build','formal-schema-374','menu-scope',
    'employee-grants','sql-concatenation','external-endpoint-protection','mybatis-last-apply','annotation-sql',
    'permission-prefixes','secret-protection-and-runtime-scan','static-whitelist','regenerated-demo')
foreach($Item in $Items){"A3_DEADLOCK_SCAN_CHECKLIST_ITEM: item=$Item; passed=true"}
"A3_DEADLOCK_SCAN_RESTORATION: owned_processes=9; healthy_services=6; verification_inputs=$ExpectedRuntimeInputs; original_config_unchanged=true"
if($RegistrationChecks){"A3_LOCK_REGISTRATION_CHECKLIST=true; checks=$ExpectedOwnershipChecks; controlled_metadata_failures=true; actual_redis=true; actual_workflow_lock_integration=$($BusinessLockChecks.IsPresent.ToString().ToLowerInvariant())"}
if($SharedMonitorChecks){"A3_SHARED_LOCK_MONITOR_CHECKLIST=true; checks=$ExpectedOwnershipChecks; real_clients=2; concurrent_waiters=true; controlled_monitor_age=true; actual_workflow_lock_integration=$($BusinessLockChecks.IsPresent.ToString().ToLowerInvariant()); cross_instance_event_statistics=$($EventMetadataChecks.IsPresent.ToString().ToLowerInvariant())"}
if($EventMetadataChecks){"A3_DEADLOCK_EVENT_METADATA_CHECKLIST=true; checks=$ExpectedOwnershipChecks; real_redis=true; atomic_event_statistics=true; controlled_commit_ack_loss=true; precommit_recovery_replay=$($RecoveryChecks.IsPresent.ToString().ToLowerInvariant()); actual_workflow_lock_integration=$($BusinessLockChecks.IsPresent.ToString().ToLowerInvariant())"}
if($RecoveryChecks){"A3_DEADLOCK_RECOVERY_CHECKLIST=true; checks=$ExpectedOwnershipChecks; real_redis=true; persisted_progress=true; atomic_completion=true; stale_plan_cancelled=true; actual_workflow_lock_integration=$($BusinessLockChecks.IsPresent.ToString().ToLowerInvariant()); natural_expiry_wait=false"}
"A3_DEADLOCK_SCAN_CHECKLIST: items=$($Items.Count); missing=0; deadlock_assertions=$ExpectedRulesChecks; independent_real_lock_and_mysql=true; actual_workflow_lock_integration=$($BusinessLockChecks.IsPresent.ToString().ToLowerInvariant()); adjacent_database_checks=1012; complete_35_prd=false; production_modified=false"
