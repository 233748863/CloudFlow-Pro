param([ValidatePattern('^r[1-9][0-9]*$')][string]$Round='r1',
    [Parameter(Mandatory=$true)][ValidatePattern('^r[1-9][0-9]*$')][string]$AdjacentRound,
    [ValidatePattern('^r[1-9][0-9]*$')][string]$BackendRound='r81',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$FrontendRound='r52')
$ErrorActionPreference='Stop'
. 'D:\CloudFlowPro\.cloudflow-runtime\use-data-drive.ps1'
$Root='D:\CloudFlowPro'
$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
$Run=Join-Path $Root '.cloudflow-runtime/batch-g-integration/9799534e1a3a47b5958330f14ae16dc7'
$Output=Join-Path $Evidence "d1-current-acceptance-20261005-$Round"
if(Test-Path $Output){throw 'Retain previous D1 current report'}
[IO.Directory]::CreateDirectory($Output)|Out-Null
$Hashes=@{}; $EvidenceHashes=@{}; $Actuals=@{}; $Summaries=@()
$LauncherAudits=[System.Collections.Generic.List[object]]::new()
$ReportAudits=[System.Collections.Generic.List[object]]::new()
function Read-Bytes([string]$File){
    $Stream=[IO.File]::Open($File,[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::ReadWrite)
    $Memory=[IO.MemoryStream]::new()
    try {$Stream.CopyTo($Memory); return ,$Memory.ToArray()} finally {$Stream.Dispose();$Memory.Dispose()}
}
function Read-Evidence([string]$Name){
    $File=Join-Path $Evidence $Name; $Bytes=Read-Bytes $File
    $Digest=[Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($Bytes))
    if($Digest -ne [Convert]::ToHexString([Security.Cryptography.SHA256]::HashData((Read-Bytes $File)))){throw 'Evidence changed while reading'}
    $EvidenceHashes[$Name]=$Digest
    [Text.Encoding]::UTF8.GetString($Bytes).TrimStart([char]0xFEFF)
}
function Add-Inputs([string]$Snapshot){
    $Inputs=@((Read-Evidence $Snapshot)|ConvertFrom-Json)
    if(-not $Inputs.Count){throw 'Empty execution input snapshot'}
    foreach($Input in $Inputs){
        $Name=$Input.Path.Replace('\','/')
        $File=[IO.Path]::GetFullPath((Join-Path $Root $Name))
        if(-not $File.StartsWith($Root+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)){throw 'Input outside workspace'}
        $CurrentHash=(Get-FileHash -LiteralPath $File).Hash
        $ExpectedHash=$Input.Hash
        if($CurrentHash -ne $ExpectedHash -and $Snapshot -eq "h3-portal-finance-adjacent-20261002-$AdjacentRound/inputs.json" -and $Name -eq 'scripts/summarize-d1-current-acceptance.ps1'){
            $Archive='d1-current-acceptance-20261005-r1/report-source.ps1'
            Read-Evidence $Archive|Out-Null
            if($EvidenceHashes[$Archive] -ne $ExpectedHash){throw 'Original report source differs from adjacent snapshot'}
            $ReportAudits.Add([pscustomobject]@{Path=$Name;OriginalHash=$ExpectedHash;CurrentHash=$CurrentHash;OriginalBytes=$Archive;Change='Accept successful browser-error assertions from legacy result layouts; product and execution scripts unchanged'})
            $ExpectedHash=$CurrentHash
        }
        if($CurrentHash -ne $ExpectedHash){
            if($Snapshot -ne 'd1-ledger-rules-live-20261005-r5/inputs.json' -or $Name -ne 'scripts/run-owned-captcha-allowance.mjs'){throw "Current input differs: $Name"}
            $Archive='d1-current-source-history-20261005/run-owned-captcha-allowance-before-payroll.mjs'
            $Original=Read-Evidence $Archive
            if($EvidenceHashes[$Archive] -ne $ExpectedHash){throw 'Original launcher bytes differ from historical snapshot'}
            $Reconstructed=[IO.File]::ReadAllText($File).Replace(", 'd1-payroll-effects'",'').Replace("requestedMode === 'd1-payroll-effects' ? 'scripts/run-d1-payroll-effects-live.ps1' : ",'')
            if($Reconstructed -cne $Original){throw 'Launcher changed beyond payroll entry addition'}
            $LauncherAudits.Add([pscustomobject]@{Snapshot=$Snapshot;Path=$Name;OriginalHash=$ExpectedHash;CurrentHash=$CurrentHash;Change='Payroll test entry only; original ledger path unchanged';OriginalBytes=$Archive})
            $ExpectedHash=$CurrentHash
        }
        if($Hashes.ContainsKey($Name) -and $Hashes[$Name] -ne $ExpectedHash){throw 'Conflicting current input'}
        $Hashes[$Name]=$ExpectedHash
    }
}
$Phases=@(
    @{Name='policy';Folder='d1-policy-live-20261005-r3';End='D1_RUN_EXIT=0';Flags=@('batch','proration','configuration','ledger','recalculation','permissions','secrets')},
    @{Name='leave';Folder='d1-leave-live-20261005-r3';End='D1_LEAVE_RUN_EXIT=0';Flags=@('calculation','freeze','approval','rejection','withdrawal','concurrency','rules','calendarUnavailable','restoration','secrets')},
    @{Name='cycle';Folder='d1-cycle-live-20261005-r2';End='D1_CYCLE_RUN_EXIT=0';Flags=@('periods','accrual','carry','expiry','ledger','permissions','preservation','secrets')},
    @{Name='chain';Folder='d1-chain-live-20261005-r5';End='D1_CHAIN_RUN_EXIT=0';Flags=@('allocation','approval','carry','expiry','chain','page','preservation','restoration','secrets')},
    @{Name='pages';Folder='d1-pages-live-20261005-r7';End='D1_PAGES_RUN_EXIT=0';Flags=@('adminDesktop','adminMobile','employeeDesktop','employeeMobile','preservation','bindingRestored','secrets')},
    @{Name='ledger';Folder='d1-ledger-rules-live-20261005-r5';End='D1_LEDGER_RULES_RUN_EXIT=0';Flags=@('allocation','negative','compensatory','encashment','component','preservation','secrets')},
    @{Name='payroll';Folder='d1-payroll-effects-live-20261005-r1';End='D1_PAYROLL_EFFECTS_RUN_EXIT=0';Flags=@('approval','negative','payroll','snapshot','preservation','restoration','secrets')}
)
foreach($Phase in $Phases){
    Add-Inputs ($Phase.Folder+'/inputs.json')
    $Actual=(Read-Evidence ($Phase.Folder+'/result.json'))|ConvertFrom-Json
    if(-not $Actual.passed -or $Actual.checks.Count -eq 0){throw 'Failed or empty actual phase'}
    if($null -ne $Actual.PSObject.Properties['browserErrors']){
        if($Actual.browserErrors -ne 0){throw 'Actual browser errors recorded'}
    }else{
        $ErrorAssertion=if($Phase.Name -eq 'ledger'){'browser_has_no_unhandled_errors'}elseif($Phase.Name -eq 'payroll'){'no_browser_errors'}else{throw 'Missing browser outcome'}
        if($ErrorAssertion -notin $Actual.checks){throw 'Successful browser error assertion missing'}
    }
    foreach($Key in $Phase.Flags){if($Actual.$Key -ne $true){throw ('Missing phase result: '+$Phase.Name+'/'+$Key)}}
    $Launch=Read-Evidence ($Phase.Folder+'-launch.log')
    foreach($Pattern in @($Phase.End,'changed=0; exit=0','OWNED_CAPTCHA_RESTORED: original_limit=100; original_ttl=-1;','counter_writes=0; database_unchanged=true; production_modified=false')){
        if(-not $Launch.Contains($Pattern)){throw ('Original completion missing: '+$Phase.Name)}
    }
    $Actuals[$Phase.Name]=$Actual
    $Summaries+=[pscustomobject]@{Phase=$Phase.Name;Evidence=$Phase.Folder;Checks=$Actual.checks.Count;Requests=$Actual.requests}
}
function Require-Check([string]$Phase,[string]$Prefix){
    if(-not @($Actuals[$Phase].checks|Where-Object{$_.StartsWith($Prefix,[StringComparison]::Ordinal)}).Count){throw "Missing check: $Phase/$Prefix"}
}
$RuleProofs=@(
    @('maxDaysPerYear','leave','blocked_rule_hr.leave.annual.limit'),
    @('applicableAfterDays','leave','blocked_rule_hr.leave.probation.limit'),
    @('maxContinuousDays','leave','blocked_rule_hr.leave.continuous.limit'),
    @('carryForwardFlag','cycle','carry_cap_and_assignment_switch_'),
    @('maxCarryForwardDays','cycle','carry_cap_and_assignment_switch_'),
    @('carryForwardExpireDays','cycle','paired_carry_source_and_expiry_'),
    @('earnedLeaveFlag','cycle','earned_policy_defers_ledger_'),
    @('earnedLeaveFrequency','cycle','exact_schedule_dates_and_rounding_'),
    @('roundingMode','leave','full_day_rounding_rounds_half_day_to_one'),
    @('encashmentFlag','ledger','encashment_generates_exact_approved_amount_and_date'),
    @('encashmentComponentId','payroll','submitted_exact_encashment_source_and_component'),
    @('lwpFlag','payroll','submitted_unpaid100_partial40_paid0'),
    @('partialPaidFlag','payroll','submitted_unpaid100_partial40_paid0'),
    @('salaryFractionPerDay','payroll','submitted_unpaid100_partial40_paid0'),
    @('compensatoryFlag','ledger','eight_hours_compensatory_ledger'),
    @('optionalLeaveFlag','leave','optional_leave_rejects_workday'),
    @('includeHolidayFlag','leave','include_holiday_rule_counts_all_ten_days'),
    @('allowNegativeFlag','payroll','approved_negative_leave_ends_at_minus_one'),
    @('allowOverAllocationFlag','ledger','over_allocation_enabled_materialized_balance'),
    @('needAttachmentFlag','leave','blocked_rule_hr.leave.attachment.required')
)
if($RuleProofs.Count -ne 20){throw 'Expected twenty rules'}
foreach($Proof in $RuleProofs){Require-Check 'policy' ('rule_round_trip_'+$Proof[0]);Require-Check $Proof[1] $Proof[2]}
foreach($Prefix in @('batch_assignment_returns_50','outside_level_has_zero_assignments','reversal_appends_linked_negative_entry','every_ledger_sum_matches_recalculated_available_balance')){Require-Check 'policy' $Prefix}
foreach($Prefix in @('national_holiday_span_excludes_seven_days_and_counts_three','server_overrides_employee_duration_unit_status_and_workflow_identity','morning_request_returns_half_day','disabled_calendar_rejection_has_no_business_side_effects','six_distinct_rules_exercised','one_day_balance_allows_exactly_one_concurrent_request')){Require-Check 'leave' $Prefix}
Require-Check 'chain' 'one_employee_one_type_two_periods_eight_entries'
Require-Check 'chain' 'same_group_four_required_types'
Require-Check 'payroll' 'actual_slip_submitted'
$Chain=(Read-Evidence 'd1-chain-live-20261005-r5/fixture.json')|ConvertFrom-Json
if($Chain.requests.Count -ne 1 -or $Chain.executions.Count -ne 4 -or $Chain.resumedFrom){throw 'Fresh complete chain evidence required'}
$Payroll=(Read-Evidence 'd1-payroll-effects-live-20261005-r1/payroll.json')|ConvertFrom-Json
$Cash=@($Payroll.components|Where-Object name -eq 'LEAVE_ENCASHMENT')
$CashSource=(Read-Evidence 'd1-ledger-rules-live-20261005-r5/fixture.json')|ConvertFrom-Json
if([decimal]$Payroll.gross -ne [decimal]'2823.45' -or [decimal]$Payroll.net -ne [decimal]'2683.45' -or $Cash.Count -ne 1 -or [decimal]$Cash[0].amount -ne [decimal]'123.45' -or [string]$Cash[0].changeId -ne [string]$CashSource.salaryChangeId -or [string]$Cash[0].salaryComponentId -ne [string]$CashSource.components.cash){throw 'Original payroll source or amounts differ'}
$BoundaryFolder='d1-expiry-boundaries-20261005-r1'
Add-Inputs ($BoundaryFolder+'/inputs.json')
$Boundary=(Read-Evidence ($BoundaryFolder+'/result.json'))|ConvertFrom-Json
if(-not $Boundary.Passed -or -not $Boundary.ActualDatabase -or -not $Boundary.ActualService -or -not $Boundary.ScratchCleaned -or $Boundary.SystemClockChanged -or $Boundary.Checks -ne 32 -or $Boundary.BackendRound -ne $BackendRound){throw 'Expiry date boundary evidence incomplete'}
if(-not (Read-Evidence ($BoundaryFolder+'-launch.log')).Contains('D1_EXPIRY_BOUNDARY_RUN_EXIT=0')){throw 'Boundary original completion missing'}
$Binaries=@((Read-Evidence ($BoundaryFolder+'/binary-inputs.json'))|ConvertFrom-Json)
foreach($Input in $Binaries){
    if([IO.Path]::GetPathRoot([IO.Path]::GetFullPath($Input.Path)) -ne 'D:\' -or (Get-FileHash -LiteralPath $Input.Path).Hash -ne $Input.Hash){throw 'Boundary binary changed'}
}
Add-Inputs ("h3-portal-finance-adjacent-20261002-$AdjacentRound/inputs.json")
$Adjacent=Read-Evidence "h3-portal-finance-adjacent-20261002-$AdjacentRound/summary.log"
if($Adjacent -notmatch 'H3_FINANCE_ADJACENT: files=\d+; changed=0; exit=0; production_modified=false'){throw 'Adjacent completion missing'}
$Database=Read-Evidence "h3-portal-finance-adjacent-20261002-$AdjacentRound/oa-database.log"
foreach($Pattern in @('PASS: 1012 OA boundary assertions','PASS: Complete approved schema table count; expected=374; actual=374')){if(-not $Database.Contains($Pattern)){throw 'Adjacent database evidence missing'}}
foreach($Build in @("backend-$BackendRound","frontend-$FrontendRound")){
    Add-Inputs ("h3-portal-finance-20261002-$Build-inputs.json")
    if((Read-Evidence "h3-portal-finance-20261002-$Build.log") -notmatch 'FINANCE_BUILD: phase=\w+; files=\d+; changed=0; exit=0'){throw 'Build completion missing'}
}
$State=Get-Content -LiteralPath (Join-Path $Run 'state.json') -Raw|ConvertFrom-Json
if($State.status -ne 'RUNNING' -or [IO.Path]::GetFullPath($State.run) -ne $Run){throw 'Owned fixture required'}
foreach($Entry in $State.processes){
    $Observed=Get-CimInstance Win32_Process -Filter "ProcessId=$($Entry.id)"
    if($null -eq $Observed -or -not $Observed.CommandLine.Contains($Entry.marker)){throw 'Process identity changed'}
}
$Health=@()
foreach($Service in $State.services){
    $Response=Invoke-RestMethod -Uri "http://127.0.0.1:$($Service.healthPort)/actuator/health" -TimeoutSec 10
    if($Response.status -ne 'UP'){throw 'Service unhealthy'}
    $Health+=[pscustomobject]@{Name=$Service.name;Healthy=$true}
}
if($State.processes.Count -ne 9 -or $Health.Count -ne 6){throw 'Unexpected service count'}
foreach($Entry in $Hashes.GetEnumerator()){if((Get-FileHash -LiteralPath (Join-Path $Root $Entry.Key)).Hash -ne $Entry.Value){throw 'Input changed during report'}}
foreach($Entry in $EvidenceHashes.GetEnumerator()){if([Convert]::ToHexString([Security.Cryptography.SHA256]::HashData((Read-Bytes (Join-Path $Evidence $Entry.Key)))) -ne $Entry.Value){throw 'Evidence changed during report'}}
$Result=[pscustomobject]@{Passed=$true;Product="B$($BackendRound.Substring(1))/F$($FrontendRound.Substring(1))";D1All17Complete=$true;VerifiedCriteria=@(1..17|ForEach-Object{"AC-$_"});Rules=20;Phases=$Summaries;DateBoundaryChecks=$Boundary.Checks;CurrentInputFiles=$Hashes.Count;BoundaryBinaryFiles=$Binaries.Count;InputChanges=0;Processes=9;Services=$Health;Global35Prd681Complete=$false}
$Result|Add-Member -NotePropertyName HistoricalLauncherChanges -NotePropertyValue $LauncherAudits
$Result|Add-Member -NotePropertyName HistoricalReportChanges -NotePropertyValue $ReportAudits
$Result|ConvertTo-Json -Depth 6|Set-Content -LiteralPath (Join-Path $Output 'result.json') -Encoding utf8NoBOM
@($Hashes.GetEnumerator()|Sort-Object Key|ForEach-Object{[pscustomobject]@{Path=$_.Key;Hash=$_.Value}})|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $Output 'inputs.json') -Encoding utf8NoBOM
$EvidenceHashes|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $Output 'evidence-hashes.json') -Encoding utf8NoBOM
$RuleProofs|ConvertTo-Json -Depth 4|Set-Content -LiteralPath (Join-Path $Output 'rule-proofs.json') -Encoding utf8NoBOM
"D1_CURRENT_ACCEPTANCE: criteria=17; rules=20; inputs=$($Hashes.Count); binaries=$($Binaries.Count); changed=0; processes=9; services=6; all17_complete=true; global_complete=false; exit=0"
