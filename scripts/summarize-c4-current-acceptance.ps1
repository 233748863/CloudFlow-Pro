param([ValidatePattern('^r[1-9][0-9]*$')][string]$Round='r1',
    [Parameter(Mandatory=$true)][ValidatePattern('^r[1-9][0-9]*$')][string]$ActualRound,
    [Parameter(Mandatory=$true)][ValidatePattern('^r[1-9][0-9]*$')][string]$RetentionRound,
    [Parameter(Mandatory=$true)][ValidatePattern('^r[1-9][0-9]*$')][string]$AdjacentRound)
$ErrorActionPreference='Stop'
. 'D:\CloudFlowPro\.cloudflow-runtime\use-data-drive.ps1'
$Root='D:\CloudFlowPro'
$Run=Join-Path $Root '.cloudflow-runtime/batch-g-integration/9799534e1a3a47b5958330f14ae16dc7'
$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
$Output=Join-Path $Evidence "c4-current-acceptance-20261005-$Round"
if(Test-Path -LiteralPath $Output){throw 'Retain previous C4 acceptance evidence'}
[IO.Directory]::CreateDirectory($Output)|Out-Null
$Hashes=@{}
$EvidenceHashes=@{}
$ReportRevisions=[Collections.Generic.List[object]]::new()
$ReportBeforeTablePattern='FEDC3A82298A378F6144E127E8EBE3EC46E5D92ACB2F4D66FCF716E85A915202'
function Read-Json([string]$Relative){
    $File=Join-Path $Evidence $Relative
    $EvidenceHashes[$Relative]=(Get-FileHash -LiteralPath $File).Hash
    Get-Content -LiteralPath $File -Raw|ConvertFrom-Json
}
function Require-Text([string]$Relative,[string]$Pattern){
    $File=Join-Path $Evidence $Relative
    if(-not (Select-String -LiteralPath $File -Pattern $Pattern -Quiet)){throw "Required evidence absent: $Relative"}
    $EvidenceHashes[$Relative]=(Get-FileHash -LiteralPath $File).Hash
}
function Verify-Inputs([string]$Snapshot){
    $Inputs=@(Read-Json $Snapshot)
    if(-not $Inputs.Count){throw 'Empty input snapshot'}
    foreach($Input in $Inputs){
        $Resolved=[IO.Path]::GetFullPath((Join-Path $Root $Input.Path))
        if(-not $Resolved.StartsWith($Root+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)){throw 'Input outside workspace'}
        $Actual=(Get-FileHash -LiteralPath $Resolved).Hash
        if($Actual -ne $Input.Hash){
            # Adjacent checks hash this report but never execute it. Preserve the exact prior report hash.
            if($Snapshot -eq "h3-portal-finance-adjacent-20261002-$AdjacentRound/inputs.json" -and $Resolved -eq $PSCommandPath -and $Input.Hash -eq $ReportBeforeTablePattern){
                $ReportRevisions.Add([pscustomobject]@{snapshot=$Snapshot;path=$Input.Path;historical=$Input.Hash;current=$Actual;reason='Report table-count matcher corrected to the exact successful log message; no executed business input changed'})
            }else{throw "Executed input changed: $($Input.Path)"}
        }
        $Hashes[$Resolved]=$Actual
    }
}
function Require-Check($Live,[string]$Label){
    if(@($Live.checks|Where-Object{$_.label -eq $Label -and $_.passed}).Count -ne 1){throw "Required assertion absent: $Label"}
}
$Step='inputs'
try {
    foreach($Snapshot in @('h3-portal-finance-20261002-backend-r77-inputs.json','h3-portal-finance-20261002-frontend-r50-inputs.json',
        "c1-form-live-20261005-$ActualRound/inputs.json","c4-owned-retention-20261005-$RetentionRound/inputs.json","h3-portal-finance-adjacent-20261002-$AdjacentRound/inputs.json")){Verify-Inputs $Snapshot}
    $Step='actual-pages-and-records'
    $Live=Read-Json "c1-form-live-20261005-$ActualRound/result.json"
    if(-not $Live.passed -or -not $Live.isolated -or $Live.scope -ne 'FULL_C' -or -not $Live.versionRecordsExecuted -or @($Live.checks|Where-Object{-not $_.passed}).Count){throw 'Version actual verification incomplete'}
    $Records=Read-Json "c4-version-records-$($Live.runId)/result.json"
    $Pages=Read-Json "c4-version-records-$($Live.runId)/pages-result.json"
    if(-not $Records.passed -or -not $Records.historyPagesExecuted -or -not $Records.realHttp -or $Records.databaseWrites -ne 0 -or $Records.redisDeletes -ne 0 -or $Records.versions.Count -ne 7 -or $Records.observations.Count -ne 13){throw 'Version records scope incomplete'}
    if(-not $Pages.passed -or -not $Pages.realPages -or $Pages.pageErrors.Count -ne 0 -or $Pages.cases.Count -ne 5 -or $Pages.fabricatedResponses -ne 0){throw 'Version pages scope incomplete'}
    foreach($Device in @('desktop','mobile')){
        if(@($Pages.cases|Where-Object{$_.label -eq 'historical-task' -and $_.device -eq $Device -and $_.originalVersion -eq 1 -and $_.latestVersion -eq 6 -and $_.rows -eq 2}).Count -ne 1){throw 'Historical device coverage missing'}
    }
    $Criteria=@(
        @{id='AC-1';checks=@('c4_versions_increment_2','c4_versions_increment_6')},
        @{id='AC-2';checks=@('c4_versions_equivalent_does_not_create_version')},
        @{id='AC-3';checks=@('c4_versions_change_type_2','c4_versions_change_type_3','c4_versions_change_type_4','c4_versions_change_type_5','c4_versions_change_type_6')},
        @{id='AC-4';checks=@('c4_versions_instance_pins_version_one','c4_versions_done_employee_original_definition')},
        @{id='AC-5';checks=@('c4_pages_desktop_deleted_field_preserved','c4_pages_mobile_deleted_field_preserved','c4_pages_mobile_old_row_1_obsolete','c4_versions_done_employee_original_values')},
        @{id='AC-6';checks=@('c4_pages_desktop_original_text_control','c4_pages_mobile_original_text_control','c4_pages_mobile_original_text_touch_focus')},
        @{id='AC-7';checks=@('c4_versions_history_descending_contiguous','c4_versions_history_creator_and_latest','c4_versions_detail_identity_1','c4_versions_detail_identity_6','c4_pages_history_six_records_and_creator')},
        @{id='AC-8';checks=@('c4_versions_diff_added_removed_nested','c4_versions_diff_modified_nested','c4_versions_diff_layout_separate','c4_pages_same_version_difference_empty')},
        @{id='AC-9';checks=@('c4_versions_rollback_creates_seventh','c4_versions_rollback_keeps_intermediate_versions','c4_pages_rollback_cancel_preserves_rows','c4_pages_rollback_refreshes_history','c4_pages_rollback_survives_reload')},
        @{id='AC-10';checks=@();ownedRetention=$true},
        @{id='AC-11';checks=@('c4_versions_latest_identity_id','c4_versions_default_returns_rollback','c4_pages_return_to_latest_editor','c4_pages_selector_previews_original_default','c4_pages_history_preview_is_readonly')},
        @{id='AC-12';checks=@('c4_pages_difference_extra_label_and_semantic_color','c4_pages_difference_items.tax_label_and_semantic_color','c4_pages_difference_obsolete_label_and_semantic_color','c4_pages_difference_items.obsolete_label_and_semantic_color','c4_pages_difference_note_label_and_semantic_color','c4_pages_difference_items.note_label_and_semantic_color','c4_pages_difference_layout_label_and_semantic_color')}
    )
    foreach($Criterion in $Criteria){foreach($Label in $Criterion.checks){Require-Check $Live $Label}}
    foreach($Label in @('c4_pages_change_log_dialog_limit','c4_pages_save_cancel_keeps_version','c4_pages_change_log_persisted_and_original_kept','c4_pages_no_browser_exceptions','current_service_logs_hide_credentials_and_private_form_values')){Require-Check $Live $Label}
    Require-Text "c1-form-live-20261005-$ActualRound/live.log" 'C_AUDIT_SCAN .*plaintext_hits=0'
    Require-Text "c1-form-live-20261005-$ActualRound/live.log" 'C2_FORM_SAVE_AUDIT: .*plaintext_hits=0'
    Require-Text "c4-version-pages-actual-$ActualRound-launch.log" 'OWNED_CAPTCHA_RESTORED: original_limit=100; original_ttl=-1;.*counter_writes=0; database_unchanged=true'
    $Step='retention'
    $Retention=Read-Json "c4-owned-retention-20261005-$RetentionRound/result.json"
    if(-not $Retention.passed -or -not $Retention.result.realService -or -not $Retention.result.realMapper -or -not $Retention.result.temporaryDatabaseRemoved -or $Retention.result.latestRetained -ne 20 -or $Retention.result.referencedRetained -ne 3 -or $Retention.result.obsoleteRemoved -ne 2 -or $Retention.result.applicationDatabaseWrites -ne 0){throw 'Owned retention evidence incomplete'}
    $Step='adjacent-and-runtime'
    Require-Text "h3-portal-finance-adjacent-20261002-$AdjacentRound/summary.log" 'H3_FINANCE_ADJACENT: .*changed=0; exit=0'
    Require-Text "h3-portal-finance-adjacent-20261002-$AdjacentRound/oa-database.log" 'PASS: Complete approved schema table count; expected=374; actual=374'
    Require-Text "h3-portal-finance-adjacent-20261002-$AdjacentRound/oa-database.log" '1012'
    $State=Get-Content -LiteralPath (Join-Path $Run 'state.json') -Raw|ConvertFrom-Json
    if($State.status -ne 'RUNNING' -or $State.processes.Count -ne 9 -or $State.services.Count -ne 6){throw 'Owned runtime incomplete'}
    foreach($Owned in $State.processes){
        $Current=Get-CimInstance Win32_Process -Filter "ProcessId = $($Owned.id)"
        if(-not $Current -or -not $Owned.marker -or -not $Current.CommandLine.Contains($Owned.marker)){throw "Owned process unavailable: $($Owned.name)"}
    }
    foreach($Service in $State.services){
        $Health=Invoke-RestMethod -Uri "http://127.0.0.1:$($Service.healthPort)/actuator/health" -TimeoutSec 5
        if($Health.status -ne 'UP'){throw "Owned service unhealthy: $($Service.name)"}
    }
    $Step='prd-mapping'
    $Prd='docs/prd/C4-LC-08-表单版本管理-PRD.md'
    $Mapping='docs/design/C4-全项验收映射-20261004.md'
    $PrdIds=@(Select-String -LiteralPath (Join-Path $Root $Prd) -Pattern '^\| (AC-\d+) \|'|ForEach-Object{$_.Matches[0].Groups[1].Value})
    if($PrdIds.Count -ne 12 -or (Compare-Object $PrdIds $Criteria.id)){throw 'C4 acceptance mapping differs from PRD'}
    foreach($File in @($Prd,$Mapping,'docs/design/C4-版本记录与历史读取接续-20261005.md')){$Resolved=Join-Path $Root $File;$Hashes[$Resolved]=(Get-FileHash -LiteralPath $Resolved).Hash}
    foreach($File in @($Hashes.Keys)){if((Get-FileHash -LiteralPath $File).Hash -ne $Hashes[$File]){throw 'Input changed during acceptance'}}
    foreach($File in @($EvidenceHashes.Keys)){if((Get-FileHash -LiteralPath (Join-Path $Evidence $File)).Hash -ne $EvidenceHashes[$File]){throw 'Evidence changed during acceptance'}}
    [ordered]@{passed=$true;backend='r77';frontend='r50';acceptanceCount=12;criteria=$Criteria;extraRequirement='FR-5.2';prd=$Prd;mapping=$Mapping;currentInputs=$Hashes.Count;actualRound=$ActualRound;retentionRound=$RetentionRound;adjacentRound=$AdjacentRound;healthyServices=6;ownedProcesses=9;evidenceHashes=$EvidenceHashes;reportRevisions=$ReportRevisions;c4All12Complete=$true;complete35Prd=$false;productionModified=$false}|ConvertTo-Json -Depth 8|Set-Content -LiteralPath (Join-Path $Output 'result.json') -Encoding utf8NoBOM
    "C4_CURRENT_ACCEPTANCE: criteria=12; actual=$ActualRound; retention=$RetentionRound; adjacent=$AdjacentRound; current_inputs=$($Hashes.Count); services=6; processes=9; passed=true; complete_35_prd=false"|Tee-Object -FilePath (Join-Path $Output 'summary.log')
}catch{
    [ordered]@{passed=$false;step=$Step;c4All12Complete=$false;complete35Prd=$false}|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $Output 'result.json') -Encoding utf8NoBOM
    throw
}
