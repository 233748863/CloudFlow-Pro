param([ValidatePattern('^r[1-9][0-9]*$')][string]$Round='r1',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$IndependentRound='r5',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$PageRound='r6',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$AdjacentRound='r180',
    [Parameter(Mandatory=$true)][ValidateRange(1,2147483647)][int]$IndependentSessionId,
    [Parameter(Mandatory=$true)][ValidatePattern('^[a-f0-9]+$')][string]$IndependentTerminalChunk,
    [Parameter(Mandatory=$true)][ValidateRange(1,2147483647)][int]$PageSessionId,
    [Parameter(Mandatory=$true)][ValidatePattern('^[a-f0-9]+$')][string]$PageTerminalChunk,
    [Parameter(Mandatory=$true)][ValidateRange(1,2147483647)][int]$AdjacentSessionId,
    [Parameter(Mandatory=$true)][ValidatePattern('^[a-f0-9]+$')][string]$AdjacentTerminalChunk)
$ErrorActionPreference='Stop'
. 'D:\CloudFlowPro\.cloudflow-runtime\use-data-drive.ps1'
$Root='D:\CloudFlowPro'
$CacheRoot='D:\CloudFlowProCache'
$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
$Reference=Join-Path $Root '.cloudflow-runtime/batch-g-integration/9799534e1a3a47b5958330f14ae16dc7'
$Output=Join-Path $Evidence "e2-all-acceptance-20261009-$Round"
if(Test-Path -LiteralPath $Output){throw 'Retain original E2 reconciliation evidence'}
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
foreach($Definition in @(@{Kind='backend';Version='r138';Phase='Backend';Count=3848},@{Kind='frontend';Version='r86';Phase='Frontend';Count=1483})){
    $Index=Manifest (Join-Path $Evidence "h3-portal-finance-20261002-$($Definition.Kind)-$($Definition.Version)-inputs.json")
    Require ($Index.Count -eq $Definition.Count) 'Product source count differs'
    foreach($Path in $Index.Keys){$null=Track $Path $Index[$Path]}
    $Builds[$Definition.Kind]=$Index
    $LogPath=Track (Join-Path $Evidence "h3-portal-finance-20261002-$($Definition.Kind)-$($Definition.Version).log")
    $Log=Get-Content -LiteralPath $LogPath -Raw
    Require ($Log.Contains("FINANCE_BUILD: phase=$($Definition.Phase); files=$($Definition.Count); changed=0; exit=0")) 'Completed original build result absent'
}
$Before=Manifest (Join-Path $Evidence 'h3-portal-finance-20261002-frontend-r85-inputs.json')
$Changed=@($Builds.frontend.Keys|Where-Object{$Before[$_] -ne $Builds.frontend[$_]})
$Product=Full 'cloudflow-frontend/src/pages/CrmSlaPage.tsx'
Require ($Changed.Count -eq 1 -and $Changed[0] -eq $Product -and $Before.Count -eq $Builds.frontend.Count) 'E2 product change differs from reviewed page'
$BeforeCopy=Track (Join-Path $Evidence 'e2-sla-prep-20261009-r1/before/CrmSlaPage.tsx') $Before[$Product]
$Archives[$Before[$Product]]=$BeforeCopy
$CurrentDirectory=Join-Path $Evidence "e2-sla-independent-20261009-$IndependentRound"
$PageDirectory=Join-Path $Evidence "e2-sla-independent-20261009-$PageRound"
$Directories=@(Get-ChildItem -LiteralPath $Evidence -Directory|Where-Object Name -Match '^e2-sla-independent-20261009-r[1-9][0-9]*$'|Sort-Object Name)
Require ($Directories.FullName -contains $CurrentDirectory -and $Directories.FullName -contains $PageDirectory) 'Current E2 run directory missing'
foreach($Directory in $Directories){
    foreach($File in Get-ChildItem -LiteralPath (Join-Path $Directory.FullName 'originals') -Recurse -File){
        $Copy=Track $File.FullName
        $Archives[$Inputs[$Copy]]=$Copy
    }
}
$Failures=[Collections.Generic.List[object]]::new()
foreach($Directory in $Directories){
    $Launcher=Json (Join-Path $Directory.FullName 'launcher-result.json')
    $BusinessPath=Join-Path $Directory.FullName 'result.json'
    $Business=if(Test-Path -LiteralPath $BusinessPath){Json $BusinessPath}else{$null}
    Require ($Launcher.inputsUnchanged -and $Launcher.processesStopped -and $Launcher.referenceKept -and -not $Launcher.priorRuntimeWritten) 'Independent environment preservation differs'
    Require ($Launcher.referenceBusinessTables -eq 16 -and $Launcher.backend -eq 'r138' -and $Launcher.frontend -eq 'r86') 'Independent source boundary differs'
    $RunInputs=Manifest (Join-Path $Directory.FullName 'inputs.json')
    $RuntimeManifestPath=Join-Path $Directory.FullName 'runtime-inputs.json'
    $RuntimeInputs=if(Test-Path -LiteralPath $RuntimeManifestPath){Manifest $RuntimeManifestPath}else{@{}}
    Require ($RunInputs.Count -eq $Launcher.inputs) 'Independent source manifest count differs'
    Require (($RuntimeInputs.Count -eq $Launcher.runtimeInputs) -or ($Directory.Name -eq 'e2-sla-independent-20261009-r1' -and $RuntimeInputs.Count -eq 0 -and $null -eq $Business)) 'Independent runtime manifest differs'
    Bind $RunInputs
    Bind $RuntimeInputs
    $ReferenceBefore=Json (Join-Path $Directory.FullName 'reference-business-before.json')
    $ReferenceAfter=Json (Join-Path $Directory.FullName 'reference-business-after.json')
    foreach($Property in $ReferenceBefore.PSObject.Properties){Require ($ReferenceAfter.($Property.Name) -eq $Property.Value) 'Original business table differs'}
    $IndependentRun=Full $Launcher.run
    Require ((Split-Path -Parent $IndependentRun) -eq (Join-Path $Root '.cloudflow-runtime/batch-g-integration') -and $IndependentRun -ne $Reference) 'Independent run path differs'
    $RunState=Json (Join-Path $IndependentRun 'state.json')
    Require ($RunState.status -eq 'STOPPED' -and $RunState.processes.Count -eq $(if($Directory.Name -eq 'e2-sla-independent-20261009-r1'){2}else{8}) -and $RunState.services.Count -eq 6) 'Independent services not fully stopped'
    foreach($Entry in $RunState.processes){
        $Observed=Get-CimInstance Win32_Process -Filter "ProcessId=$($Entry.id)"
        Require (-not $Observed -or -not $Observed.CommandLine.Contains($Entry.marker)) 'Independent process remains active'
    }
    $null=Track (Join-Path $IndependentRun 'state.json')
    foreach($File in Get-ChildItem -LiteralPath $Directory.FullName -Recurse -File){$null=Track $File.FullName}
    if($Directory.FullName -eq $CurrentDirectory){
        Require ($Launcher.passed -and $Launcher.verifierExit -eq 0 -and $Business.passed) 'Current E2 result did not pass'
        $CurrentLauncher=$Launcher;$Current=$Business;$CurrentInputs=$RunInputs;$CurrentRuntimeInputs=$RuntimeInputs
    }elseif($Directory.FullName -eq $PageDirectory){
        Require ($Launcher.passed -and $Launcher.verifierExit -eq 0 -and $Business.passed -and $Business.verificationSuite -eq 'pages' -and $Launcher.suite -eq 'Pages') 'Focused E2 page result did not pass'
        $Pages=$Business;$PageLauncher=$Launcher;$PageInputs=$RunInputs;$PageRuntimeInputs=$RuntimeInputs
    }else{
        Require (-not $Launcher.passed -and ($null -eq $Business -or -not $Business.passed)) 'Historical failure outcome changed'
        $Failures.Add([pscustomobject]@{Folder=$Directory.Name;Passed=$false;Preservation=$true;ProcessesStopped=$true;Reason=if($Business){$Business.failure}else{$Launcher.failure};Checks=if($Business){$Business.checks.Count}else{0};BusinessResultPresent=($null -ne $Business);RuntimeManifestPresent=($RuntimeInputs.Count -gt 0);RuntimeInputClaim=$Launcher.runtimeInputs;Retained=$true})
    }
}
Require ($Current.backendRound -eq 'r138' -and $Current.frontendRound -eq 'r86' -and $Current.finalAcceptancePending -and -not $Current.globalComplete) 'Business result version or acceptance boundary differs'
Require ($Current.independentDatabaseOnly -and -not $Current.originalEnvironmentWritten -and -not $Current.externalMessagesSent -and -not $Current.systemClockChanged) 'Business execution scope differs'
Require ($Current.browserErrors.Count -eq 0 -and $Current.cleanupFailures.Count -eq 0 -and $Current.secretScan.leaks -eq 0) 'Business cleanup or secret protection failed'
foreach($Flag in @('policies','noPolicy','calendar','response','pause','restart','fulfillment','priority','reminders','legacyEntry','reports','fallback','deduplication','permissions','desktop','mobile','preservation','secrets')){
    Require ($Current.evidence.$Flag -eq $true) 'E2 evidence flag missing'
}
foreach($Actor in @('sales','manager','readonly')){Require ($Current.checks -contains "actual_data_scope_$Actor") 'Actual logged-in data scope proof missing'}
$RuntimeAfter=Json (Join-Path $CurrentDirectory 'runtime-after.json')
Require ($RuntimeAfter.passed -and $RuntimeAfter.leaks -eq 0 -and $RuntimeAfter.databaseLeaks -eq 0 -and $RuntimeAfter.counterWrites -eq 0 -and $RuntimeAfter.configurationWrites -eq 0) 'Runtime protection proof failed'
Require ($RuntimeAfter.persistentLimit -eq '100' -and $RuntimeAfter.cachedLimit -eq '"100"' -and $RuntimeAfter.cacheTtl -eq -1 -and $RuntimeAfter.counterBefore -eq 0 -and $RuntimeAfter.counter -eq 7) 'Captcha read-only boundary differs'
Require ($CurrentLauncher.crmRestarts.Count -eq 2) 'Both real CRM restart receipts required'
foreach($Restart in $CurrentLauncher.crmRestarts){Require ($Restart.Healthy -and $Restart.InputsUnchanged -and -not $Restart.OriginalEnvironmentTouched -and $Restart.PreviousPid -ne $Restart.CurrentPid) 'Actual restart proof differs'}
$Required='{"AC-1":["specific_customer_beats_level","customer_level_beats_industry","industry_beats_global","same_rank_and_sort_choose_lower_policy_id","policy_page_reopen_preserves_all_tiers_and_changed_values"],"AC-2":["unmatched_ticket_not_applicable_and_all_due_fields_empty"],"AC-3":["friday_1700_four_hours_ends_monday_noon","lunch_is_excluded_from_four_and_eight_hour_budgets","night_creation_skips_nonwork_and_weekend","work_deadlines_are_persisted_by_actual_ticket_create"],"AC-4":["holiday_monday_is_skipped_after_weekend","holiday_deadlines_are_actually_persisted"],"AC-5":["first_response_records_actual_minute_and_consumed_minutes","repeat_response_preserves_first_response_and_entire_ticket","actual_status_change_records_first_response"],"AC-6":["resume_after_real_restarts_adds_each_elapsed_minute_once","second_pause_accumulates_only_its_own_minutes","historical_pause_consumes_only_actual_calendar_work_minutes","historical_pause_deadline_uses_work_calendar_when_resumed"],"AC-7":["real_process_restart_keeps_database_pause_and_promises","real_crm_restart_pause"],"AC-8":["deadline_minute_itself_is_not_a_breach","resolution_exactly_at_deadline_is_fulfilled","one_minute_overdue_marks_both_breaches","response_only_policy_does_not_assess_resolution"],"AC-9":["priority_change_keeps_original_start_and_already_consumed_time","priority_after_response_preserves_response_and_recomputes_remaining_resolution","priority_change_during_pause_keeps_pause_and_consumption"],"AC-10":["eighty_percent_reminder_naturally_dispatched_by_job_platform","eighty_percent_each_dimension_delivered_once_to_owner","deadline_each_dimension_delivered_once_to_owner","RESPONSE_BREACHED_delivered_once_to_owner_and_leader","RESOLUTION_BREACHED_delivered_once_to_owner_and_leader"],"AC-11":["legacy_dispatch_uses_response_and_resolution_due_despite_future_due_time"],"AC-12":["POLICY_report_totals_and_averages_match_actual_tickets","PRIORITY_report_group_keys_and_numbers_match","OWNER_report_group_keys_and_numbers_match","combined_filters_apply_together","foreign_report_stays_inside_its_tenant","duration_chart_retains_zero_and_null_gap","keyboard_table_switch_exposes_dates_zero_and_missing_values","phone_chart_fits_390_pixels_and_preserves_both_series","readonly_report_has_no_permission_error_toasts","report_pages_have_no_unexpected_read_errors"],"AC-13":["unavailable_calendar_allows_create_with_natural_time_deadlines","calendar_fallback_alert_delivered_once_to_owner_and_leader","calendar_fallback_audit_recorded"],"AC-14":["repeated_fulfillment_does_not_duplicate_delivered_alerts","after_restart_breach_and_due_scans_do_not_duplicate_any_target_record","repeat_fulfillment_preserves_entire_result"]}'|ConvertFrom-Json -AsHashtable
foreach($Flag in @('reports','permissions','desktop','mobile','preservation','secrets')){Require ($Pages.evidence.$Flag -eq $true) 'Focused page evidence flag missing'}
Require ($Pages.backendRound -eq 'r138' -and $Pages.frontendRound -eq 'r86' -and $Pages.browserErrors.Count -eq 0 -and $Pages.cleanupFailures.Count -eq 0 -and $PageLauncher.crmRestarts.Count -eq 0) 'Focused page execution boundary differs'
foreach($Label in @('readonly_report_has_no_permission_error_toasts','report_pages_have_no_unexpected_read_errors','page_read_dependencies_sales','page_read_dependencies_manager','page_read_dependencies_readonly','policy_page_reopen_preserves_all_tiers_and_changed_values')){Require ($Pages.checks -contains $Label) 'Focused page regression check missing'}
$PageRuntimeAfter=Json (Join-Path $PageDirectory 'runtime-after.json')
Require ($PageRuntimeAfter.passed -and $PageRuntimeAfter.leaks -eq 0 -and $PageRuntimeAfter.databaseLeaks -eq 0 -and $PageRuntimeAfter.counterBefore -eq 0 -and $PageRuntimeAfter.counter -eq 7 -and $PageRuntimeAfter.counterWrites -eq 0 -and $PageRuntimeAfter.configurationWrites -eq 0) 'Focused page runtime protection failed'
$Items=@(foreach($Number in 1..14){
    $Key="AC-$Number";$Suite=if($Number -eq 12){$Pages}else{$Current};$SuiteDirectory=if($Number -eq 12){$PageDirectory}else{$CurrentDirectory};$Executed=$Suite.acceptance.$Key
    Require ($Executed.executed -and $Executed.checks.Count -gt 0) 'Acceptance item has no actual checks'
    foreach($Label in $Required.$Key){Require ($Suite.checks -contains $Label -and $Executed.checks -contains $Label) ("Required acceptance check missing: "+$Label)}
    [pscustomobject]@{Id=$Key;Passed=$true;BusinessResult=(Join-Path $SuiteDirectory 'result.json');RequiredChecks=@($Required.$Key);ExecutedChecks=@($Executed.checks)}
})
$ReviewPath=Track (Join-Path $Evidence 'e2-sla-image-review-20261009-r2/manifest.json')
$Review=Json $ReviewPath
$Fixture=Json (Join-Path $PageDirectory 'fixture.json')
Require ($Review.ActuallyViewed -and $Review.VisualAccepted -and $Review.Round -eq $PageRound -and $Review.Images.Count -eq 7 -and $Fixture.images.Count -eq 7) 'Actual screenshot review incomplete'
foreach($Image in $Review.Images){
    Require ($Image.ActuallyViewed -and $Image.VisualAccepted -and @($Fixture.images|Where-Object name -EQ $Image.Name).Count -eq 1) 'Reviewed image does not belong to current business run'
    $null=Track (Join-Path $PageDirectory $Image.Name) $Image.Hash
}
$OriginalReviewPath=Track (Join-Path $Evidence 'e2-sla-image-review-20261009-r1/manifest.json')
$OriginalReview=Json $OriginalReviewPath
Require ($OriginalReview.Round -eq $IndependentRound -and $OriginalReview.ActuallyViewed -and -not $OriginalReview.VisualAccepted -and $OriginalReview.Images.Count -eq 7) 'Original visual failure evidence changed'
foreach($Image in $OriginalReview.Images){$null=Track (Join-Path $CurrentDirectory $Image.Name) $Image.Hash}
$AdjacentDirectory=Join-Path $Evidence "h3-portal-finance-adjacent-20261002-$AdjacentRound"
$AdjacentInputs=Manifest (Join-Path $AdjacentDirectory 'inputs.json')
Bind $AdjacentInputs
$AdjacentLog=Get-Content -LiteralPath (Join-Path $AdjacentDirectory 'summary.log') -Raw
Require ($AdjacentLog.Contains("H3_FINANCE_ADJACENT: files=$($AdjacentInputs.Count); changed=0; exit=0; production_modified=false") -and $AdjacentLog.Contains('name=formal-01-07-and-oa-behavior; exit=0')) 'Adjacent original execution did not pass'
foreach($File in Get-ChildItem -LiteralPath $AdjacentDirectory -File){$null=Track $File.FullName}
$PackageDirectory=Join-Path $Evidence 'backend-executable-verification-20261006-r26'
$Packages=Json (Join-Path $PackageDirectory 'result.json')
Require ($Packages.Passed -and $Packages.BackendRound -eq 'r138' -and $Packages.InputChanges -eq 0 -and $Packages.Services.Count -eq 6) 'Current package proof differs'
$null=Track (Join-Path $PackageDirectory 'result.json')
$State=Json (Join-Path $Reference 'state.json')
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
Require ($RuntimeFiles -eq 6388) 'Current runtime file count differs'
$Receipts=@(
    @{Name='backend138';Session=13903;Exit=0;Chunk='b76792'},@{Name='frontend86';Session=46032;Exit=0;Chunk='affc46'},
    @{Name='independent1';Session=56569;Exit=1;Chunk='55db4d'},@{Name='independent2';Session=96110;Exit=1;Chunk='f20411'},
    @{Name='independent3';Session=79262;Exit=1;Chunk='bab50f'},@{Name='independent4';Session=6026;Exit=1;Chunk='de7de7'},
    @{Name=('independent'+$IndependentRound.Substring(1));Session=$IndependentSessionId;Exit=0;Chunk=$IndependentTerminalChunk},
    @{Name=('pages'+$PageRound.Substring(1));Session=$PageSessionId;Exit=0;Chunk=$PageTerminalChunk},
    @{Name=('adjacent'+$AdjacentRound.Substring(1));Session=$AdjacentSessionId;Exit=0;Chunk=$AdjacentTerminalChunk}
)
$Receipts|ConvertTo-Json -Depth 4|Set-Content -LiteralPath (Join-Path $Output 'original-terminal-receipts.json') -Encoding utf8NoBOM
$null=Track (Join-Path $Output 'original-terminal-receipts.json')
$null=Track $PSCommandPath
$null=Track (Join-Path $Output 'original.ps1') (Hash $PSCommandPath)
foreach($Path in $Inputs.Keys){Require ((Hash $Path) -eq $Inputs[$Path]) ("Reconciliation input changed: "+$Path)}
$InputFile=Join-Path $Output 'inputs.json'
@($Inputs.Keys|Sort-Object|ForEach-Object{[pscustomobject]@{Path=$_;Hash=$Inputs[$_]}})|ConvertTo-Json -Depth 3|Set-Content -LiteralPath $InputFile -Encoding utf8NoBOM
$Summary=[pscustomobject]@{
    Passed=$true;Backend='r138';Frontend='r86';AcceptanceCount=14;Items=$Items;All14Complete=$true;GlobalComplete=$false
    Independent=$IndependentRound;Checks=$Current.checks.Count;Requests=$Current.requests.Count;UiRequests=$Current.uiRequests.Count
    PageFollowup=$PageRound;PageChecks=$Pages.checks.Count;PageRequests=$Pages.requests.Count;PageUiRequests=$Pages.uiRequests.Count;PageRuntimeProtection=$PageRuntimeAfter
    PageInputCount=$PageInputs.Count;PageRuntimeInputCount=$PageRuntimeInputs.Count;OriginalVisualFailureRetained=$true;OriginalImageReview=$OriginalReviewPath;AllBusinessChecksRepeated=$false
    CurrentInputs=$Inputs.Count;InputChanges=0;CurrentRuntimeFiles=$RuntimeFiles;IndependentInputCount=$CurrentInputs.Count;IndependentRuntimeInputCount=$CurrentRuntimeInputs.Count
    ProductImpact=@(@{Path=$Product;Before='r85';After='r86';BeforeHash=$Before[$Product];AfterHash=$Builds.frontend[$Product];PreservedBefore=$BeforeCopy})
    HistoricalFailures=@($Failures.ToArray());HistoricalInputBindings=@($Bindings.ToArray());OriginalFailureResultsChanged=$false
    PriorRuntimeWritten=$false;ReferenceBusinessTables=16;ReferenceKept=$true;IndependentProcessesStopped=$true;IndependentDatabasesRetained=$true;RealCrmRestarts=@($CurrentLauncher.crmRestarts)
    ReviewedImages=$Review.Images.Count;ImageReview=$ReviewPath;BrowserErrors=0;SecretScan=$Current.secretScan;RuntimeProtection=$RuntimeAfter
    CaptchaCounterWrites=0;CaptchaConfigurationWrites=0;OriginalHourlyCronObserved=$false;SystemClockChanged=$false;ExternalMessagesSent=$false
    HistoricalDateFixturesDisclosed=$true;OldR2SecretScanLimitationRetained='Initialization failure omitted partial checks and one authenticated token; original scan coverage not expanded'
    OriginalTerminalReceipts=$Receipts;Adjacent=$AdjacentRound;AdjacentInputs=$AdjacentInputs.Count;Processes=9;HealthyServices=6
    InputManifest=$InputFile;ProductModified=$false;ProductionModified=$false
    Remaining=@('E3 and remaining PRD items','Whole-project 35 PRDs / 681 items and deferred external integration')
}
$Summary|ConvertTo-Json -Depth 30|Set-Content -LiteralPath (Join-Path $Output 'result.json') -Encoding utf8NoBOM
"E2_ALL_ACCEPTANCE: passed=true; items=14; checks=$($Current.checks.Count); inputs=$($Inputs.Count); runtime_files=$RuntimeFiles; images=7; healthy=6; all14_complete=true; global_complete=false"
