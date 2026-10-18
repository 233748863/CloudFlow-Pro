param([ValidatePattern('^r[1-9][0-9]*$')][string]$Round='r1',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$AdjacentRound='r179',
    [Parameter(Mandatory=$true)][ValidateRange(1,2147483647)][int]$AdjacentSessionId,
    [Parameter(Mandatory=$true)][ValidatePattern('^[a-f0-9]+$')][string]$AdjacentTerminalChunk)
$ErrorActionPreference='Stop'
. 'D:\CloudFlowPro\.cloudflow-runtime\use-data-drive.ps1'
$Root='D:\CloudFlowPro'
$CacheRoot='D:\CloudFlowProCache'
$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
$Run=Join-Path $Root '.cloudflow-runtime/batch-g-integration/9799534e1a3a47b5958330f14ae16dc7'
$Output=Join-Path $Evidence "d2-all-acceptance-20261009-$Round"
if(Test-Path -LiteralPath $Output){throw 'Retain prior D2 reconciliation evidence'}
[IO.Directory]::CreateDirectory($Output)|Out-Null
[IO.File]::Copy($PSCommandPath,(Join-Path $Output 'original.ps1'),$false)
$Inputs=@{}
$Archives=@{}
$Bindings=[Collections.Generic.List[object]]::new()
$Products=@{}
$Parents=@{}
$Actual=@{}
$Suites=[Collections.Generic.List[object]]::new()
$Items=@{}
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
    if(-not $Inputs.ContainsKey($Path)){$Inputs[$Path]=Hash $Path}
    if($Expected){Require ($Inputs[$Path] -eq $Expected) ("Recorded evidence changed: "+$Path)}
    return $Path
}
function Manifest([string]$File){
    $null=Track $File
    $Index=@{}
    foreach($Entry in @(Json $File)){
        $Path=Full $Entry.Path
        if($Index.ContainsKey($Path)){Require ($Index[$Path] -eq $Entry.Hash) 'Conflicting input entries'}
        $Index[$Path]=$Entry.Hash
        if($Path.StartsWith($Run+'\',[StringComparison]::OrdinalIgnoreCase) -and $Path.Contains('\artifacts\')){$Archives[$Entry.Hash]=$Path}
    }
    return $Index
}
function Bind([string]$File,[string]$Expected){
    $Path=Full $File
    if($Inputs.ContainsKey($Path) -and $Inputs[$Path] -eq $Expected){return}
    if(-not $Inputs.ContainsKey($Path) -and (Test-Path -LiteralPath $Path -PathType Leaf) -and (Hash $Path) -eq $Expected){$null=Track $Path $Expected;return}
    Require ($Archives.ContainsKey($Expected)) ("Original input unavailable: "+$Path)
    $Preserved=Track $Archives[$Expected] $Expected
    $Bindings.Add([pscustomobject]@{ExecutedPath=$Path;Hash=$Expected;PreservedAt=$Preserved;CurrentFileReplaced=$true})
}
function Bind-Manifest([hashtable]$Index){foreach($Path in $Index.Keys){Bind $Path $Index[$Path]}}
function Product([string]$Kind,[string]$Version,[int]$Count){
    $Key="$Kind-$Version"
    if(-not $Products.ContainsKey($Key)){
        $Index=Manifest (Join-Path $Evidence "h3-portal-finance-20261002-$Key-inputs.json")
        Require ($Index.Count -eq $Count) 'Build source count differs'
        $Products[$Key]=$Index
    }
    return $Products[$Key]
}
$Backend=Product 'backend' 'r138' 3848
$Frontend=Product 'frontend' 'r85' 1483
$OldBackend=Product 'backend' 'r136' 3847
$OldFrontend=Product 'frontend' 'r84' 1483
foreach($Index in @($Backend,$Frontend)){foreach($Path in $Index.Keys){$null=Track $Path $Index[$Path]}}
$ChangedBackend=@('cloudflow-backend/cloudflow-service-hr/src/main/java/com/cloudflow/hr/controller/HrAttendanceResourceControllers.java','cloudflow-backend/cloudflow-service-hr/src/main/java/com/cloudflow/hr/mapper/HrAttendanceRecordMapper.java','cloudflow-backend/cloudflow-service-hr/src/main/java/com/cloudflow/hr/service/HrAttendanceRecordQueryService.java','cloudflow-backend/cloudflow-service-hr/src/main/resources/mapper/HrAttendanceRecordMapper.xml')
$ChangedFrontend=@('cloudflow-frontend/src/pages/hr/HrDomainWorkspace.tsx','cloudflow-frontend/src/pages/hr/rules/HrAttendanceRulesPage.tsx','cloudflow-frontend/src/pages/hr/rules/RuleWorkspace.tsx')
$Impact=[Collections.Generic.List[object]]::new()
foreach($Definition in @(@{Kind='backend';Before=$OldBackend;After=$Backend;Expected=$ChangedBackend},@{Kind='frontend';Before=$OldFrontend;After=$Frontend;Expected=$ChangedFrontend})){
    $Changed=@($Definition.After.Keys|Where-Object{$Definition.Before[$_] -ne $Definition.After[$_]})
    $Expected=@($Definition.Expected|ForEach-Object{Full $_})
    Require ($Changed.Count -eq $Expected.Count -and @($Changed|Where-Object{$_ -notin $Expected}).Count -eq 0) 'Unreviewed product change'
    Require (@($Definition.Before.Keys|Where-Object{-not $Definition.After.ContainsKey($_)}).Count -eq 0) 'Historical product file removed'
    foreach($Path in $Changed){
        $BeforeHash=$Definition.Before[$Path]
        if($BeforeHash){
            $Copy=Track (Join-Path $Evidence ('d2-record-page-prep-20261009-r1/before/'+[IO.Path]::GetRelativePath($Root,$Path))) $BeforeHash
            $Archives[$BeforeHash]=$Copy
        }
        $Impact.Add([pscustomobject]@{Product=$Definition.Kind;Path=$Path;BeforeHash=$BeforeHash;AfterHash=$Definition.After[$Path];Added=(-not $BeforeHash)})
    }
}
$Untouched=[Collections.Generic.List[object]]::new()
foreach($Definition in @(
    @{Relative=$ChangedBackend[0];Marker='    @SysLog("新增HR考勤记录")'},
    @{Relative=$ChangedBackend[1];Marker='    java.util.List<HrAttendanceRecord> selectEmployeeDates'},
    @{Relative=$ChangedBackend[3];Marker='    <select id="selectEmployeeDates"'}
)){
    $Current=Get-Content -LiteralPath (Full $Definition.Relative) -Raw
    $Previous=Get-Content -LiteralPath (Join-Path $Evidence ('d2-record-page-prep-20261009-r1/before/'+$Definition.Relative)) -Raw
    $CurrentOffset=$Current.IndexOf($Definition.Marker,[StringComparison]::Ordinal)
    $PreviousOffset=$Previous.IndexOf($Definition.Marker,[StringComparison]::Ordinal)
    Require ($CurrentOffset -ge 0 -and $PreviousOffset -ge 0 -and $Current.Substring($CurrentOffset) -ceq $Previous.Substring($PreviousOffset)) 'Calculation or mutation methods changed'
    $Untouched.Add([pscustomobject]@{Path=$Definition.Relative;From=$Definition.Marker;ExactTextThroughEndUnchanged=$true})
}
$Shared=Full 'cloudflow-backend/cloudflow-service-hr/src/main/java/com/cloudflow/hr/service/HrTypedCrudService.java'
Require ($Backend[$Shared] -eq $OldBackend[$Shared]) 'Shared CRUD source changed'
foreach($Number in @(8,9,10,11,12)){
    $Directory=Join-Path $Evidence "d2-current-adjacent-20261007-r$Number"
    $Result=Json (Join-Path $Directory 'result.json')
    Require ($Result.InputsPreserved -and $Result.OriginalPackagesPreserved -and $Result.ActualServices -and $Result.StepsRunSerially -and -not $Result.AllD2Complete -and -not $Result.GlobalComplete) 'Parent execution boundary differs'
    Require ($Result.Passed -eq ($Number -in @(8,12))) 'Historical parent outcome changed'
    $Index=Manifest (Join-Path $Directory 'inputs.json')
    $OriginalDirectory=Join-Path $Directory 'originals'
    $Copies=@(Get-ChildItem -LiteralPath $OriginalDirectory -Recurse -File)
    Require ($Copies.Count -eq $Result.ExecutionOriginals) 'Parent execution originals incomplete'
    foreach($Copy in $Copies){
        $Source=Full ([IO.Path]::GetRelativePath($OriginalDirectory,$Copy.FullName))
        Require ($Index.ContainsKey($Source)) 'Original absent from execution manifest'
        $null=Track $Copy.FullName $Index[$Source]
        $Archives[$Index[$Source]]=$Copy.FullName
    }
    foreach($File in Get-ChildItem -LiteralPath $Directory -File){$null=Track $File.FullName}
    $Parents["r$Number"]=@{Result=$Result;Index=$Index;Directory=$Directory}
}
foreach($Service in @('auth','hr','oa','crm','workflow','gateway')){
    foreach($Copy in Get-ChildItem -LiteralPath (Join-Path $Run $Service) -File -Filter 'service-before-*.args'){$Archives[(Hash $Copy.FullName)]=$Copy.FullName}
}
foreach($Parent in $Parents.Values){Bind-Manifest $Parent.Index}
$Definitions=@(
    @{Name='rules';Folder='d2-rules-live-20261005-r14';Backend='r136';Frontend='r84';Checks=476;Requests=231;Parent='r8';Step='rules';Flags=@('configuration','rules','rawFacts','recalculation','calendar','geofence')},
    @{Name='appeals';Folder='d2-attendance-appeals-20261005-r7';Backend='r136';Frontend='r84';Checks=117;Requests=58;Parent='r8';Step='appeals';Flags=@('correctness','approval','appendOnly','rollback','closedMonth','restoration')},
    @{Name='scale';Folder='d2-scale-attendance-20261005-r4';Backend='r136';Frontend='r84';Checks=1065;Requests=1027;Parent='r9';Step='scale';Flags=@('correctness','asynchronous','results','ownership')},
    @{Name='config';Folder='d2-attendance-config-20261005-r10';Backend='r138';Frontend='r85';Checks=72;Requests=13;Parent='r10';Step='config';Flags=@('shifts','rules','schedules','punches','preview')},
    @{Name='privacy';Folder='d2-attendance-privacy-20261005-r9';Backend='r138';Frontend='r85';Checks=189;Requests=90;Flags=@('correctness','selfEntry','geofence','scope','tenant','anonymous','recordPages','restoration')},
    @{Name='page';Folder='d2-attendance-page-20261005-r8';Backend='r138';Frontend='r85';Checks=145;Requests=26;Parent='r12';Step='page';Flags=@('page','pagination','confirmation','correctness')},
    @{Name='monthPage';Folder='d2-month-appeal-page-20261005-r7';Backend='r138';Frontend='r85';Checks=123;Requests=83;Parent='r12';Step='month';Flags=@('monthly','employeeSubmit','reviews','cancel','closedMonth','restoration')},
    @{Name='first';Folder='d2-leave-attendance-20261005-r42';Backend='r138';Frontend='r85';Checks=37;Requests=4;Flags=@('correctness','approval','exclusion','fractions','restoration','performanceMet')}
)
foreach($Definition in $Definitions){
    $Directory=Join-Path $Evidence $Definition.Folder
    $ResultPath=Join-Path $Directory 'result.json'
    $Result=Json $ResultPath
    foreach($Flag in @('passed','preservation','secrets')+$Definition.Flags){Require ($Result.$Flag -eq $true) ("Required outcome missing: "+$Definition.Name+'/'+$Flag)}
    Require ($Result.checks.Count -eq $Definition.Checks -and $Result.requests -eq $Definition.Requests -and -not $Result.all17Complete -and -not $Result.globalComplete) 'Suite count or boundary differs'
    $Index=Manifest (Join-Path $Directory 'inputs.json')
    foreach($ProductKey in @("backend-$($Definition.Backend)","frontend-$($Definition.Frontend)")){
        Require ($Products.ContainsKey($ProductKey)) 'Suite build snapshot absent'
        foreach($Path in $Products[$ProductKey].Keys){Require ($Index[$Path] -eq $Products[$ProductKey][$Path]) 'Suite product version differs'}
    }
    Bind-Manifest $Index
    if($Definition.Parent){
        $Step=@($Parents[$Definition.Parent].Result.Steps|Where-Object Name -eq $Definition.Step)
        Require ($Step.Count -eq 1 -and $Step[0].Exit -eq 0 -and $Step[0].Passed -and $Step[0].CaptchaRestored -and $Step[0].ResultHash -eq (Hash $ResultPath)) 'Original successful child exit missing'
    }
    $SourceCopies=[Collections.Generic.List[object]]::new()
    foreach($Path in @($Index.Keys|Where-Object{$_.StartsWith($Root+'\scripts\',[StringComparison]::OrdinalIgnoreCase)})){
        $Copy=Join-Path $Output ('suite-originals/'+$Definition.Name+'/'+[IO.Path]::GetRelativePath($Root,$Path))
        [IO.Directory]::CreateDirectory((Split-Path -Parent $Copy))|Out-Null
        $Source=if((Test-Path -LiteralPath $Path) -and (Hash $Path) -eq $Index[$Path]){$Path}else{$Archives[$Index[$Path]]}
        [IO.File]::Copy($Source,$Copy,$false)
        $null=Track $Copy $Index[$Path]
        $SourceCopies.Add([pscustomobject]@{Path=$Path;Copy=$Copy;Hash=$Index[$Path];CapturedAfterOriginalExit=$true;ExecutionInputHashMatched=$true})
    }
    foreach($File in Get-ChildItem -LiteralPath $Directory -File){$null=Track $File.FullName}
    $Actual[$Definition.Name]=$Result
    $Suites.Add([pscustomobject]@{Name=$Definition.Name;Backend=$Definition.Backend;Frontend=$Definition.Frontend;Checks=$Definition.Checks;Requests=$Definition.Requests;Result=$ResultPath;Hash=$Inputs[$ResultPath];OriginalParent=$Definition.Parent;OriginalSources=@($SourceCopies.ToArray());Inputs=$Index.Count})
}
$FirstDirectory=Join-Path $Evidence 'd2-record-page-first-continuation-20261009-r1'
$First=Json (Join-Path $FirstDirectory 'measurement-result.json')
$Precondition=Json (Join-Path $FirstDirectory 'precondition.json')
Require ($First.Passed -and $First.PerformanceMet -and $First.BackendRound -eq 'r138' -and $First.FrontendRound -eq 'r85' -and $First.InputChanges -eq 0 -and $First.RuntimeInputs -eq 6388 -and $First.RuntimeInputChanges -eq 0 -and -not $First.Profiling) 'Ordinary first request evidence differs'
Require ($Precondition.PriorRecalculations -eq 0 -and $Precondition.FailureBeforeAuthentication -and $Precondition.NoBusinessWarmup -and $Precondition.OriginalExit -eq 1 -and $Precondition.ServicesUnchanged) 'Original failed startup continuity differs'
Require ($Actual.first.measurements.Count -eq 4 -and @($Actual.first.measurements|Where-Object{$_.milliseconds -ge 500 -or -not $_.meets500ms}).Count -eq 0 -and -not $Actual.first.profiling) 'Required first request performance not met'
Require ((Hash (Join-Path $FirstDirectory 'verification-result-original.json')) -eq (Hash (Join-Path $Evidence 'd2-leave-attendance-20261005-r42/result.json'))) 'Original business result copy differs'
Bind-Manifest (Manifest (Join-Path $FirstDirectory 'inputs.json'))
foreach($File in Get-ChildItem -LiteralPath $FirstDirectory -File){$null=Track $File.FullName}
$PrivacyLogPath=Join-Path $Evidence 'd2-record-page-privacy-r9.log'
$PrivacyLog=Get-Content -LiteralPath $PrivacyLogPath -Raw
Require ($PrivacyLog.Contains('D2_PRIVACY_RUN_EXIT=0') -and $PrivacyLog.Contains('checks=189; requests=90; matrix=22') -and $PrivacyLog.Contains('counter_before=1737; counter_after=1742; counter_writes=0; database_unchanged=true; production_modified=false')) 'Original privacy terminal or restoration missing'
$null=Track $PrivacyLogPath
$null=Track (Join-Path $Evidence 'd2-record-page-privacy-r9.err')
$DatabaseSuites=[Collections.Generic.List[object]]::new()
foreach($Definition in @(
    @{Name='monthDatabasePrevious';Folder='d2-month-batch-checks-20261005-r16';Backend='r136';Checks=607},
    @{Name='monthDatabase';Folder='d2-month-batch-checks-20261005-r17';Backend='r138';Checks=607},
    @{Name='dailyDatabase';Folder='d2-daily-calendar-checks-20261005-r5';Backend='r138';Checks=32}
)){
    $Directory=Join-Path $Evidence $Definition.Folder
    $Result=Json (Join-Path $Directory 'result.json')
    Require ($Result.Passed -and $Result.BackendRound -eq $Definition.Backend -and $Result.Checks -eq $Definition.Checks -and $Result.ActualDatabase -and $Result.ActualService -and $Result.InputChanges -eq 0 -and $Result.ScratchCleaned) 'Database execution differs'
    $Index=Manifest (Join-Path $Directory 'inputs.json')
    foreach($Copy in Get-ChildItem -LiteralPath $Directory -File -Filter 'original-*'){$Archives[(Hash $Copy.FullName)]=$Copy.FullName;$null=Track $Copy.FullName}
    Bind-Manifest $Index
    Bind-Manifest (Manifest (Join-Path $Directory 'binary-inputs.json'))
    foreach($File in Get-ChildItem -LiteralPath $Directory -Recurse -File){$null=Track $File.FullName}
    $DatabaseSuites.Add([pscustomobject]@{Name=$Definition.Name;Backend=$Definition.Backend;Checks=$Result.Checks;Result=(Join-Path $Directory 'result.json');Sources=$Result.SourceInputs;Binaries=$Result.BinaryInputs;ScratchCleaned=$true})
}
$NaturalDirectory=Join-Path $Evidence 'd2-natural-daily-20261005-r5'
$Natural=Json (Join-Path $NaturalDirectory 'result.json')
$NaturalLauncher=Json (Join-Path $NaturalDirectory 'launcher-result.json')
Require ($Natural.passed -and $Natural.checks -eq 66 -and $Natural.failed -eq 0 -and $Natural.requests -eq 4 -and $Natural.naturalScheduler -and $Natural.realHttp -and $Natural.realDistributedLock -and $Natural.secrets.leaks -eq 0) 'Natural daily execution incomplete'
Require ($NaturalLauncher.passed -and $NaturalLauncher.verifierExit -eq 0 -and $NaturalLauncher.inputsUnchanged -and $NaturalLauncher.processesStopped -and $NaturalLauncher.referenceHealthy -and -not $NaturalLauncher.priorRuntimeWritten -and $NaturalLauncher.backend -eq 'r138' -and $NaturalLauncher.frontend -eq 'r85') 'Natural daily environment restoration differs'
Require ($Natural.schedule.originalCron -eq '0 0 5 * * ?' -and $Natural.schedule.periodDays -eq 1 -and $Natural.schedule.manualTriggers -eq 0 -and $Natural.schedule.databaseTimeWrites -eq 0 -and $Natural.schedule.clockChanges -eq 0 -and -not $Natural.originalFiveAmObserved) 'Natural scheduler timing boundary differs'
Require ($Natural.execution.Count -eq 1 -and $Natural.execution[0].status -eq 'SUCCESS' -and $Natural.execution[0].affected -eq 4 -and $Natural.execution[0].trigger -eq 'CRON') 'Original daily task outcome differs'
Bind-Manifest (Manifest (Join-Path $NaturalDirectory 'inputs.json'))
Bind-Manifest (Manifest (Join-Path $NaturalDirectory 'runtime-inputs.json'))
foreach($File in Get-ChildItem -LiteralPath $NaturalDirectory -Recurse -File){$null=Track $File.FullName}
$Prd=Track (Full 'docs/prd/D2-HR-考勤判定与打卡-PRD.md')
$Requirements=[regex]::Matches((Get-Content -LiteralPath $Prd -Raw),'(?m)^\| AC-(\d+) \| (.+) \|\r?$')
Require ($Requirements.Count -eq 17) 'D2 requirement set differs'
foreach($Requirement in $Requirements){
    $Number=[int]$Requirement.Groups[1].Value
    Require (-not $Items.ContainsKey($Number)) 'Duplicate acceptance item'
    $Items[$Number]=[pscustomobject]@{Id="AC-$Number";Requirement=$Requirement.Groups[2].Value;Passed=$true;Proof=[Collections.Generic.List[object]]::new()}
}
function Proof([int]$Number,[string]$Suite,[string[]]$Labels){
    foreach($Label in $Labels){Require ($Actual[$Suite].checks -ccontains $Label) ("Required assertion absent: "+$Suite+'/'+$Label)}
    $Record=@($Suites|Where-Object Name -eq $Suite)[0]
    $Items[$Number].Proof.Add([pscustomobject]@{Suite=$Suite;Backend=$Record.Backend;Frontend=$Record.Frontend;Result=$Record.Result;Hash=$Record.Hash;Assertions=$Labels})
}
function Pattern-Proof([int]$Number,[string]$Suite,[string]$Pattern,[int]$Count){
    $Labels=@($Actual[$Suite].checks|Where-Object{$_ -cmatch $Pattern})
    Require ($Labels.Count -eq $Count) ("Required assertion set differs: "+$Suite+'/'+$Pattern)
    Proof $Number $Suite $Labels
}
Pattern-Proof 1 'rules' '^configured_field_' 13
Pattern-Proof 1 'config' '^shift_roundtrip_' 13
Pattern-Proof 1 'config' '^shift_persisted_' 13
$Items[1].Proof.Add([pscustomobject]@{Suite='naturalDaily';Backend='r138';Frontend='r85';Result=(Join-Path $NaturalDirectory 'result.json');Hash=$Inputs[(Join-Path $NaturalDirectory 'result.json')];Checks=66;OriginalFiveAmObserved=$false;DailyPeriodDays=1;NaturalExecutions=1})
Proof 2 'rules' @('late8_saved_status','late8_saved_lateMinutes','late10_saved_status','late12_saved_status','late12_saved_lateMinutes')
Pattern-Proof 3 'rules' '^.+(?:119|120|121|239|240|241)_saved_status$' 6
Proof 4 'rules' @('both_exact_window_edges_included_and_outside_seconds_marked','windows_saved_checkinCount')
Proof 5 'rules' @('six_methods_devices_and_seven_decimal_coordinates_preserved')
Proof 5 'privacy' @('self_entry_controls_identity_time_method_and_skip','self_entry_preserves_seven_decimal_coordinates_and_device')
Proof 6 'rules' @('raw_card_PUT_not_supported','raw_card_DELETE_not_supported','unsupported_writes_keep_original_raw_facts','manual_punch_only_appends_original_six_retained')
Proof 6 'appeals' @('manual_append_count_1','manual_append_count_2','partial_punches_daily_month_and_approval_rollback','all_original_punch_facts_unchanged')
Proof 7 'rules' @('concurrent_recalculation_creates_exactly_one_daily_record','daily_unique_index_covers_tenant_employee_date')
Proof 7 'scale' @('every_employee_has_each_day_once')
Proof 8 'rules' @('night_0200_and_0600_belong_to_previous_day','night_actual_conclusion_480_minutes')
Proof 8 'appeals' @('night_manual_punch_belongs_to_previous_date')
Proof 9 'rules' @('rule_change_recalculates_same_record_late3','rule_change_preserves_all_original_punch_facts')
Proof 9 'page' @('exactly_four_real_page_recalculations','approved_requests_ledger_quota_raw_facts_preserved')
Proof 10 'rules' @('default_recalculation_preserves_exact_manual_record','explicit_override_restores_rule_result_and_clears_manual_mark')
Proof 10 'monthPage' @('closed_month_force_recalculation_skips','closed_page_attempt_preserves_rows')
Proof 11 'rules' @('holiday_saved_status','holiday_saved_absentFlag','rest_saved_status','makeup_saved_status','makeup_saved_dateType','holiday-mark_saved_status')
Proof 12 'first' @('resumed_32_approved_and_two_closed_requests','thirty_leave_days_resume-repeat-1','thirty_leave_days_resume-repeat-2','half_resume-repeat-1_no_late_early_absence','hours_resume-repeat-1_no_late_early_absence','rejected_resume-repeat-1_one_day_expected_status','cancelled_resume-repeat-1_one_day_expected_status')
Proof 13 'rules' @('outside_fence_kept_and_client_valid_flag_ignored','outside_fence_marks_saved_conclusion_for_hr')
Proof 13 'privacy' @('encoded_geofence_boundary_0','encoded_geofence_boundary_1','missing_coordinates_are_retained_as_invalid','invalid_coordinate_attempts_create_no_rows')
Proof 14 'appeals' @('approved_day_1','manager_approval_does_not_apply_correction','first_daily_identity_retained','repeat_final_review_is_idempotent')
Proof 14 'monthPage' @('manager_only_advances_review','hr_rewrites_original_day','hr_actual_decision')
Proof 15 'rules' @('rule_table_work_days_removed','holiday_saved_dateType','makeup_saved_dateType')
Proof 15 'config' @('all_rule_responses_omit_removed_workdays')
$Items[15].Proof.Add([pscustomobject]@{Suite='dailyDatabase';Backend='r138';Result=(Join-Path $Evidence 'd2-daily-calendar-checks-20261005-r5/result.json');Checks=32;ActualTenantIterator=$true;ActualHandler=$true})
Proof 16 'scale' @('original_async_task_reached_terminal','original_async_task_succeeded','response_returned_before_full_month_finished','exact_30000_absent_days_for_1000_employees','1000_month_summaries_match_daily_results','status_reads_do_not_rerun_task')
Pattern-Proof 17 'privacy' '^(?:employee|manager)_(?:own|same|outside|foreign)_denied$' 8
Proof 17 'privacy' @('admin_foreign_denied','hr_outside_denied','hr_foreign_denied','foreign_own_denied','anonymous_own_denied','anonymous_self_endpoint_denied','daily_record_department_filter_cannot_expand_scope')
Pattern-Proof 17 'privacy' '^daily_record_page_does_not_expose_location_' 24
Require ($Items.Count -eq 17 -and @($Items.Values|Where-Object{$_.Proof.Count -eq 0}).Count -eq 0) 'Acceptance proof incomplete'
Require ($Actual.page.recordPagination.sourceRows -eq 121482 -and $Actual.page.recordPagination.maximumPageSize -eq 500 -and $Actual.page.recordPagination.filters -and $Actual.page.recordPagination.mobile -and $Actual.page.recordPagination.staleResponses) 'Record pagination proof differs'
$PriorPageDirectory=Join-Path $Evidence 'd2-attendance-page-20261005-r7'
$PriorPage=Json (Join-Path $PriorPageDirectory 'fixture.json')
$CurrentPage=Json (Join-Path $Evidence 'd2-attendance-page-20261005-r8/fixture.json')
Require (-not (Test-Path -LiteralPath (Join-Path $PriorPageDirectory 'result.json'))) 'Original incomplete result must remain absent'
Require ($PriorPage.employeeId -eq $CurrentPage.employeeId -and $PriorPage.sourceRound -eq $CurrentPage.sourceRound -and @($PriorPage.originalDigest.PSObject.Properties).Count -eq 11) 'Failed page baseline scope differs'
foreach($Property in $PriorPage.originalDigest.PSObject.Properties){Require ($Property.Value -ceq $CurrentPage.originalDigest.($Property.Name)) 'Failed page baseline differs from successful continuation'}
$FailedPageRecovery=[pscustomobject]@{OriginalRound='r7';OriginalResultMissing=$true;OriginalFailureRetained=$true;SuccessfulRound='r8';SameEmployeeAndSource=$true;IdenticalBaselineTables=11;SuccessfulEndPreservation=$Actual.page.preservation;EarlierFailureRelabeled=$false}
$ImageDefinitions=@(
    @{Folder='d2-attendance-config-20261005-r10';Names=@('shift-fields.png','rule-reopened.png','schedule-reopened.png','preview-NORMAL.png','preview-LATE.png');Failed=$false},
    @{Folder='d2-attendance-page-20261005-r8';Names=@('record-page-filtered-desktop.png','record-page-filtered-mobile.png','confirmed-range.png','completed-range.png');Failed=$false},
    @{Folder='d2-month-appeal-page-20261005-r7';Names=@('month-before.png','month-closed.png','employee-submitted.png','appeal-approved-detail.png','closed-punch-rejected.png');Failed=$false},
    @{Folder='d2-attendance-page-20261005-r6';Names=@('failure-page.png');Failed=$true},
    @{Folder='d2-attendance-page-20261005-r7';Names=@('failure-page.png');Failed=$true}
)
$Images=@(foreach($Definition in $ImageDefinitions){foreach($Name in $Definition.Names){$Path=Track (Join-Path $Evidence ($Definition.Folder+'/'+$Name));[pscustomobject]@{Path=$Path;Hash=$Inputs[$Path];ActuallyViewed=$true;FailureEvidence=$Definition.Failed}}})
Require ($Images.Count -eq 16) 'Reviewed image scope differs'
$Failures=[Collections.Generic.List[object]]::new()
foreach($Folder in @('d2-rules-live-20261005-r13','d2-attendance-config-20261005-r9','d2-attendance-privacy-20261005-r8','d2-attendance-page-20261005-r6','d2-attendance-page-20261005-r7','d2-leave-attendance-20261005-r41')){
    $Directory=Join-Path $Evidence $Folder
    Require (Test-Path -LiteralPath $Directory) 'Original failure directory missing'
    $ResultPath=Join-Path $Directory 'result.json'
    $Failed=if(Test-Path -LiteralPath $ResultPath){Json $ResultPath}else{$null}
    Require ($null -eq $Failed -or -not $Failed.passed) 'Historical failure outcome changed'
    foreach($File in Get-ChildItem -LiteralPath $Directory -Recurse -File){$null=Track $File.FullName}
    $Failures.Add([pscustomobject]@{Folder=$Folder;ResultPresent=($null -ne $Failed);OriginalPassed=if($Failed){$Failed.passed}else{$null};OriginalPreservation=if($Failed){$Failed.preservation}else{$null};Retained=$true})
}
$PackageDirectory=Join-Path $Evidence 'backend-executable-verification-20261006-r26'
$Packages=Json (Join-Path $PackageDirectory 'result.json')
Require ($Packages.Passed -and $Packages.BackendRound -eq 'r138' -and $Packages.InputChanges -eq 0 -and $Packages.Services.Count -eq 6 -and -not $Packages.DockerImageExecuted) 'Executable package proof differs'
Bind-Manifest (Manifest (Join-Path $PackageDirectory 'inputs.json'))
foreach($File in Get-ChildItem -LiteralPath $PackageDirectory -Recurse -File){$null=Track $File.FullName}
foreach($Definition in @(@{Kind='backend';Version='r138';Phase='Backend';Count=3848},@{Kind='frontend';Version='r85';Phase='Frontend';Count=1483})){
    $LogPath=Join-Path $Evidence "h3-portal-finance-20261002-$($Definition.Kind)-$($Definition.Version).log"
    $Log=Get-Content -LiteralPath $LogPath -Raw
    Require ($Log.Contains("FINANCE_BUILD: phase=$($Definition.Phase); files=$($Definition.Count); changed=0; exit=0")) 'Original complete build result absent'
    $null=Track $LogPath
}
$FailedAdjacentDirectory=Join-Path $Evidence 'h3-portal-finance-adjacent-20261002-r178'
$SummaryPreparation=Join-Path $Evidence 'd2-all-acceptance-prep-20261009-r1'
$Capture=Json (Join-Path $SummaryPreparation 'capture.json')
Require ($Capture.OriginalRun -eq 'r178' -and $Capture.OriginalSession -eq 63039 -and $Capture.OriginalTerminal -eq 'c714f8' -and $Capture.OriginalExit -eq 1 -and $Capture.CapturedAfterOriginalExit -and $Capture.ExecutionInputHashMatched) 'Failed adjacent source capture differs'
$Archives[$Capture.Hash]=Track $Capture.Copy $Capture.Hash
$null=Track (Join-Path $SummaryPreparation 'capture.json')
$FailedAdjacentIndex=Manifest (Join-Path $FailedAdjacentDirectory 'inputs.json')
Require ($FailedAdjacentIndex[(Full $PSCommandPath)] -eq $Capture.Hash) 'Failed adjacent original summary differs'
Bind-Manifest $FailedAdjacentIndex
$FailedAdjacentLog=Get-Content -LiteralPath (Join-Path $FailedAdjacentDirectory 'summary.log') -Raw
$FailedAdjacentError=Get-Content -LiteralPath (Join-Path $Evidence 'd2-current-adjacent-r178.err') -Raw
Require (-not $FailedAdjacentLog.Contains('H3_FINANCE_ADJACENT:') -and $FailedAdjacentError.Contains('source-constraints')) 'Failed adjacent outcome changed'
foreach($File in Get-ChildItem -LiteralPath $FailedAdjacentDirectory -File){$null=Track $File.FullName}
foreach($Name in @('d2-current-adjacent-r178.log','d2-current-adjacent-r178.err','d2-month-database-r17.log','d2-month-database-r17.err')){$null=Track (Join-Path $Evidence $Name)}
$Failures.Add([pscustomobject]@{Folder='h3-portal-finance-adjacent-20261002-r178';OriginalExit=1;Reason='JAVA_SQL_CONCAT in verification Java';Retained=$true;ProductModified=$false;CorrectedMonthDatabase='r17'})
$AdjacentDirectory=Join-Path $Evidence "h3-portal-finance-adjacent-20261002-$AdjacentRound"
$AdjacentIndex=Manifest (Join-Path $AdjacentDirectory 'inputs.json')
Bind-Manifest $AdjacentIndex
$AdjacentLog=Get-Content -LiteralPath (Join-Path $AdjacentDirectory 'summary.log') -Raw
Require ($AdjacentLog.Contains("H3_FINANCE_ADJACENT: files=$($AdjacentIndex.Count); changed=0; exit=0; production_modified=false")) 'Adjacent execution terminal missing'
Require ($AdjacentLog.Contains('name=formal-01-07-and-oa-behavior; exit=0') -and $AdjacentLog.Contains('regenerated_matches_formal=true; formal_modified=false')) 'Adjacent database or initialization proof incomplete'
foreach($File in Get-ChildItem -LiteralPath $AdjacentDirectory -File){$null=Track $File.FullName}
$State=Json (Join-Path $Run 'state.json')
Require ($State.status -eq 'RUNNING' -and (Full $State.run) -eq $Run -and $State.processes.Count -eq 9 -and $State.services.Count -eq 6) 'Current owned runtime differs'
foreach($Entry in $State.processes){
    $Observed=Get-CimInstance Win32_Process -Filter "ProcessId=$($Entry.id)"
    Require ($Observed -and $Observed.CommandLine.Contains($Entry.marker)) 'Current process ownership changed'
}
$RuntimeFiles=0
foreach($Service in $State.services){
    $Arguments=@(Get-Content -LiteralPath (Join-Path $Run "$($Service.name)/service.args"))
    $Index=[Array]::IndexOf($Arguments,'-cp')
    Require ($Index -ge 0 -and $Arguments[$Index+2] -eq 'org.springframework.boot.loader.launch.JarLauncher') 'Current immutable layered launch absent'
    $Layer=Full ($Arguments[$Index+1].Trim('"'))
    $Package=@($Packages.Services|Where-Object Name -eq $Service.name)
    Require ($Package.Count -eq 1 -and $Layer -eq (Join-Path $Run ("$($Service.name)/artifacts/"+$Package[0].Hash.ToLowerInvariant()+'-layered'))) 'Runtime differs from verified package'
    $null=Track (Join-Path $Root $Package[0].Path) $Package[0].Hash
    $Files=@(Get-ChildItem -LiteralPath $Layer -Recurse -Force)
    Require (@($Files|Where-Object{$_.Attributes -band [IO.FileAttributes]::ReparsePoint}).Count -eq 0) 'Redirected runtime files rejected'
    foreach($File in @($Files|Where-Object{-not $_.PSIsContainer})){Require ($Inputs.ContainsKey($File.FullName)) 'Untracked runtime file';$RuntimeFiles++}
    Require ((Invoke-RestMethod -Uri "http://127.0.0.1:$($Service.healthPort)/actuator/health" -TimeoutSec 15).status -eq 'UP') 'Current service unhealthy'
    $OriginallyStarted=@($First.Services|Where-Object Name -eq $Service.name)
    $Running=@($State.processes|Where-Object name -eq $Service.name)
    Require ($OriginallyStarted.Count -eq 1 -and $Running.Count -eq 1 -and $OriginallyStarted[0].Pid -eq $Running[0].id) 'Current service differs from measured startup'
}
Require ($RuntimeFiles -eq 6388) 'Current runtime file count differs'
$NaturalStatePath=Join-Path $NaturalLauncher.run 'state.json'
$NaturalState=Json $NaturalStatePath
Require ($NaturalState.status -eq 'STOPPED' -and $NaturalState.processes.Count -eq 4) 'Independent natural fixture not fully stopped'
foreach($Entry in $NaturalState.processes){
    $Observed=Get-CimInstance Win32_Process -Filter "ProcessId=$($Entry.id)"
    Require (-not $Observed -or -not $Observed.CommandLine.Contains($Entry.marker)) 'Independent natural process still running'
}
$null=Track $NaturalStatePath
$Receipts=@(
    @{Name='backend138';Session=13903;Exit=0;Chunk='b76792'},@{Name='frontend85';Session=96068;Exit=0;Chunk='a5dd4f'},
    @{Name='packages26';Session=61944;Exit=0;Chunk='6fb331'},@{Name='originalFirst20';Session=64291;Exit=1;Chunk='bbc47b'},
    @{Name='firstContinuation1';Session=81036;Exit=0;Chunk='1c6d73'},@{Name='privacy8';Session=98329;Exit=1;Chunk='3b6d05'},
    @{Name='privacy9';Session=89190;Exit=0;Chunk='74f006'},@{Name='rulesPrivacyAppeals8';Session=78895;Exit=0;Chunk='897621'},
    @{Name='scaleAndPages9';Session=50008;Exit=1;Chunk='3de593'},@{Name='pages10';Session=67364;Exit=1;Chunk='4cdc12'},
    @{Name='pages11';Session=81807;Exit=1;Chunk='f171b1'},@{Name='pages12';Session=78258;Exit=0;Chunk='aa7842'},
    @{Name='dailyDatabase5';Session=10628;Exit=0;Chunk='c8d4ce'},@{Name='naturalDaily5';Session=8725;Exit=0;Chunk='d4c012'},
    @{Name='monthDatabase17';Session=50825;Exit=0;Chunk='cdf49a'},@{Name='adjacent178';Session=63039;Exit=1;Chunk='c714f8'},
    @{Name=('adjacent'+$AdjacentRound.Substring(1));Session=$AdjacentSessionId;Exit=0;Chunk=$AdjacentTerminalChunk}
)
$Receipts|ConvertTo-Json -Depth 4|Set-Content -LiteralPath (Join-Path $Output 'original-terminal-receipts.json') -Encoding utf8NoBOM
$Images|ConvertTo-Json -Depth 4|Set-Content -LiteralPath (Join-Path $Output 'reviewed-images.json') -Encoding utf8NoBOM
$null=Track (Join-Path $Output 'original-terminal-receipts.json')
$null=Track (Join-Path $Output 'reviewed-images.json')
$null=Track $PSCommandPath
$null=Track (Join-Path $Output 'original.ps1') (Hash $PSCommandPath)
foreach($Path in $Inputs.Keys){Require ((Hash $Path) -eq $Inputs[$Path]) ("Frozen reconciliation input changed: "+$Path)}
$InputFile=Join-Path $Output 'inputs.json'
@($Inputs.Keys|Sort-Object|ForEach-Object{[pscustomobject]@{Path=$_;Hash=$Inputs[$_]}})|ConvertTo-Json -Depth 3|Set-Content -LiteralPath $InputFile -Encoding utf8NoBOM
$Summary=[pscustomobject]@{
    Passed=$true;Backend='r138';Frontend='r85';AcceptanceCount=17;Items=@(1..17|ForEach-Object{$Items[$_]})
    Suites=@($Suites.ToArray());DatabaseSuites=@($DatabaseSuites.ToArray());ProductImpact=@($Impact.ToArray());UnchangedCalculationAndMutationBlocks=@($Untouched.ToArray());SharedCrudUnchanged=$true
    CurrentInputs=$Inputs.Count;InputChanges=0;HistoricalInputBindings=@($Bindings.ToArray());HistoricalVersionsRetained=$true;AllTestsReexecuted=$false;SuiteCheckCountsAreNotAdditive=$true
    FirstRequestPerformance=@($Actual.first.measurements);FirstRequestPerformanceMet=$true;FirstRequestRepeatedDuringReconciliation=$false;FirstRequestOriginalStartup='r20';FirstRequestContinuation='r1';FirstRequestBusiness='r42'
    NaturalDaily=[pscustomobject]@{Backend='r138';Checks=66;Requests=4;SqlCalls=109;PeriodDays=1;Executions=1;Affected=4;DurationMilliseconds=$Natural.execution[0].duration;OriginalFiveAmObserved=$false;SecondDayObserved=$false;ProcessesStopped=$true;ReferenceHealthy=$true}
    RecordPagination=$Actual.page.recordPagination;PositionReadCases=22;RecordReadCases=24;FailedPageRecovery=$FailedPageRecovery
    ReviewedImages=$Images.Count;CurrentImages=14;FailedImages=2;HistoricalFailures=@($Failures.ToArray());OriginalTerminalReceipts=$Receipts
    Adjacent=$AdjacentRound;AdjacentInputs=$AdjacentIndex.Count;CurrentRuntimeFiles=$RuntimeFiles;Processes=9;HealthyServices=6;InputManifest=$InputFile;ReportHash=$Inputs[(Full $PSCommandPath)]
    OriginalFailureResultsChanged=$false;ProductModified=$false;ProductionModified=$false;CaptchaCounterWrites=0;All17Complete=$true;GlobalComplete=$false
    Remaining=@('E2 and remaining PRD acceptance items','Whole-project 35 PRDs / 681 items and previously deferred external integration')
}
$Summary|ConvertTo-Json -Depth 18|Set-Content -LiteralPath (Join-Path $Output 'result.json') -Encoding utf8NoBOM
"D2_ALL_ACCEPTANCE: passed=true; items=17; inputs=$($Inputs.Count); runtime_files=$RuntimeFiles; images=$($Images.Count); historical_versions_retained=true; healthy=6; all17_complete=true; global_complete=false"
