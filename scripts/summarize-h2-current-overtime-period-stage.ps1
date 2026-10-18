param([ValidatePattern('^r[1-9][0-9]*$')][string]$Round='r1',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$RuntimeRound='r14',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$AdjacentRound='r144',
    [Parameter(Mandatory=$true)][ValidatePattern('^[a-f0-9]{12}$')][string]$CaseTag)
$ErrorActionPreference='Stop'
. 'D:\CloudFlowPro\.cloudflow-runtime\use-data-drive.ps1'
$Root='D:\CloudFlowPro'
$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
$Run=Join-Path $Root '.cloudflow-runtime/batch-g-integration/9799534e1a3a47b5958330f14ae16dc7'
$Output=Join-Path $Evidence "h2-current-overtime-period-stage-20261007-$Round.json"
if(Test-Path -LiteralPath $Output){throw 'Retain original overtime stage evidence'}
function Require([bool]$Value,[string]$Message){if(-not $Value){throw $Message}}
function Read-Json([string]$File){Get-Content -LiteralPath $File -Raw|ConvertFrom-Json}
$ReportHash=(Get-FileHash -LiteralPath $PSCommandPath).Hash
$Failures=@(foreach($Prior in @(@{Round='r8';Tag='e53c69640e79';Code='OVERTIME_RULE_MISSING'},@{Round='r9';Tag='2151abc21b99';Code='COMPENSATION_MISSING'},@{Round='r12';Tag='69db24dcb1af';Code='人工处置保留原批准工时原周期及冻结依据'},@{Round='r13';Tag='6c48a5ed78a8';Code='工资详情页面真实请求没有网关或连接失败'})){
    $PriorActual=Read-Json (Join-Path $Run "h2-overtime-results-$($Prior.Tag).json")
    Require (-not $PriorActual.passed -and $PriorActual.evidence.restoration -and $PriorActual.evidence.preservation.kept -and $PriorActual.evidence.secrets) 'Retained failed run or restoration missing'
    if($Prior.Round -eq 'r12'){Require ($PriorActual.evidence.payroll.passed -and $PriorActual.failure.message -eq $Prior.Code) 'Retained period failure missing'}
    elseif($Prior.Round -eq 'r13'){Require (-not $PriorActual.evidence.payroll -and $PriorActual.failure.message -eq $Prior.Code) 'Retained browser cancellation failure missing'}
    else{Require (-not $PriorActual.evidence.payroll) 'Retained payroll prerequisite failure differs'}
    $PriorLog=Get-Content -LiteralPath (Join-Path $Evidence "h2-overtime-current-20261006-http-$($Prior.Round).log") -Raw
    Require ($PriorLog -match $Prior.Code -and $PriorLog -match 'changed=0; product_changed=0; exit=1') 'Retained original failure changed'
    $PriorInputs=@{}
    foreach($Item in @(Read-Json (Join-Path $Evidence "h2-overtime-current-20261006-inputs-$($Prior.Round).json"))){$PriorInputs[[IO.Path]::GetFullPath($Item.Path)]=$Item.Hash}
    $OriginalRoot=Join-Path $Evidence "h2-overtime-current-20261006-originals-$($Prior.Round)"
    $Originals=@(Get-ChildItem -LiteralPath $OriginalRoot -Recurse -File)
    $ExpectedOriginals=if($Prior.Round -in @('r12','r13')){513}else{511}
    Require ($Originals.Count -eq $ExpectedOriginals) 'Retained failed-run execution originals missing'
    foreach($Original in $Originals){
        $OriginalSource=Join-Path $Root ([IO.Path]::GetRelativePath($OriginalRoot,$Original.FullName))
        Require ($PriorInputs.ContainsKey($OriginalSource) -and (Get-FileHash -LiteralPath $Original.FullName).Hash -eq $PriorInputs[$OriginalSource]) 'Retained execution original differs from its original input'
    }
    [pscustomobject]@{round=$Prior.Round;caseTag=$Prior.Tag;code=$Prior.Code;checks=$PriorActual.checks.Count;requests=$PriorActual.requests.Count;restored=$true;originals=$Originals.Count;salaryPageGatewayToast=($Prior.Round -eq 'r12')}
})
$Runtime=Read-Json (Join-Path $Evidence "h2-overtime-current-20261006-result-$RuntimeRound.json")
Require ($Runtime.Passed -and $Runtime.BackendRound -eq 'r114' -and $Runtime.FrontendRound -eq 'r73' -and $Runtime.InputChanges -eq 0 -and -not $Runtime.ProductModified -and -not $Runtime.GlobalComplete -and $Runtime.Marker -eq $CaseTag) 'Current overtime run incomplete'
$ActualFile=Join-Path $Run "h2-overtime-results-$CaseTag.json"
$Actual=Read-Json $ActualFile
Require ($Actual.passed -and $Actual.caseTag -eq $CaseTag -and $Actual.checks.Count -eq $Runtime.Checks -and $Actual.requests.Count -eq $Runtime.Requests) 'Actual overtime result incomplete'
foreach($Flag in @('calendar','approvalAndCompensatory','cumulative','shifts','security','desktop','mobile','lostResponse','restoration','secrets')){Require ($Actual.evidence.$Flag -eq $true) "Overtime evidence missing: $Flag"}
Require ($Actual.evidence.shiftSafety -eq $true -and $Actual.evidence.limits.passed -eq $true) 'Current limit and shift safety results missing'
$Limits=$Actual.evidence.limits
Require ($Limits.dayLimitMinutes -eq 180 -and $Limits.monthLimitMinutes -eq 600 -and $Limits.overBoundaryMinutes -eq 1 -and $Limits.crossTypes -and $Limits.reducedPayMinutesKeepActualUsage) 'Current exact overtime boundaries incomplete'
Require ($Limits.onlineConcurrentSubmissions -eq 2 -and $Limits.concurrentSuccessfulSubmissions -eq 1 -and $Limits.concurrentBlockedSubmissions -eq 1) 'Current online overtime race incomplete'
Require ($Limits.restoration.exact -and $Limits.restoration.remainingTestMinutes -eq 0 -and $Limits.restoration.cancelledRequestCount -ge 1 -and $Limits.restoration.syntheticPolicyOnly) 'Current limit cleanup incomplete'
$CompLeave=$Actual.evidence.compLeave
Require ($CompLeave.passed -and $CompLeave.creditHours -eq '2.00' -and $CompLeave.usedHours -eq '2.00' -and $CompLeave.frozenHours -eq '0.00') 'Actual overtime leave consumption missing'
Require ($CompLeave.restoration.exact -and $CompLeave.restoration.allocationQuantity -eq '0.00' -and $CompLeave.restoration.retainedAssignmentCount -eq 1 -and $CompLeave.restoration.syntheticPolicyOnly) 'Actual overtime leave configuration restoration incomplete'
Require ($CompLeave.restoration.resources.Count -eq 2 -and $Runtime.BusinessTables -eq 44 -and $Actual.evidence.stages.'comp-leave-consumption') 'Actual overtime leave scope incomplete'
$Attendance=$Actual.evidence.adjacentAttendance
Require ($Attendance.passed -and $Attendance.tripStatus -eq 'BUSINESS_TRIP' -and $Attendance.leaveStatus -eq 'LEAVE' -and $Attendance.ordinaryStatus -eq 'NORMAL' -and $Attendance.ordinaryMinutes -eq 480 -and -not $Attendance.databaseWritesForCalculatedRecords) 'Current adjacent attendance behavior incomplete'
$Period=$Actual.evidence.periodResolution
Require ($Period.passed -and $Period.legacyPeriodStatusInputs -eq 1 -and $Period.interfaceDoubles -eq 0 -and -not $Period.resolutionUiReviewed) 'Exact period resolution fixture scope missing'
Require ($Period.realDualApprovals -eq 3 -and $Period.adjustedRequests -eq 2 -and $Period.rejectedRequests -eq 1 -and $Period.originalActualMinutes -eq 3 -and $Period.cumulativeHours -eq '0.03') 'Period resolution real outcomes missing'
Require ($Period.legacyInput.origin -eq 'OWNED_PERIOD_STATUS_FAULT' -and $Period.legacyInput.periodId -eq $Period.periods.source -and $Period.legacyInput.beforeHash -ne $Period.legacyInput.afterHash) 'Explicit owned legacy input missing'
Require (@($Period.resolutions.PSObject.Properties).Count -eq 3) 'Original resolution comparisons missing'
foreach($Entry in $Period.resolutions.PSObject.Properties){Require ($Entry.Value.before.policy -eq $Entry.Value.after.policy -and $Entry.Value.before.calculation -eq $Entry.Value.after.calculation) 'Frozen resolution values changed'}
foreach($Flag in @('realCloseGuard','closedBeforeReviewBlocked','ordinaryRetryBlocked','closedTargetBlocked','selfResolutionBlocked','duplicateResolutionBlocked','originalPeriodsKept','restored')){Require ($Period.$Flag -eq $true) "Period resolution protection missing: $Flag"}
$Payroll=$Actual.evidence.payroll
Require ($Payroll.pageNetwork.responses.Count -gt 0 -and $Payroll.pageNetwork.failed.Count -eq 0 -and @($Payroll.pageNetwork.responses|Where-Object {$_.status -ge 500}).Count -eq 0) 'Salary page network failure detected'
foreach($Probe in $Payroll.pageNetwork.completedProbeCancellations){Require ($Probe.path -eq '/auth/login' -and $Probe.method -eq 'OPTIONS' -and $Probe.status -in @(200,204) -and $Probe.error -eq 'net::ERR_ABORTED') 'Only a completed connectivity probe may be cancelled'}
$Confirmed=$Payroll.confirmedAttendance
Require ($Confirmed.employeeId -eq $Payroll.employeeId) 'Confirmed month belongs to another payroll employee'
Require ($Confirmed.passed -and $Confirmed.source -eq 'real-admin-checkin-api' -and $Confirmed.month -eq '2026-08' -and $Confirmed.status -eq 'CONFIRMED') 'Confirmed payroll attendance source missing'
Require ($Confirmed.workdays -eq 21 -and $Confirmed.restDays -eq 10 -and $Confirmed.punches -eq 42 -and $Confirmed.dailyRecords -eq 31 -and $Confirmed.workMinutes -eq 10080 -and $Confirmed.confirmAudits -eq 1) 'Confirmed payroll attendance exact counts missing'
foreach($Flag in @('automaticDailyResults','incompleteConfirmationDenied','employeeConfirmationDenied','draftPayrollBlocked','repeatedConfirmationKept','closedRecalculationSkipped','closedCheckinDenied','keptAfterPayroll')){Require ($Confirmed.$Flag -eq $true) "Confirmed attendance protection missing: $Flag"}
Require ($Confirmed.before.punches -match '^[a-f0-9]{64}$' -and $Confirmed.before.days -match '^[a-f0-9]{64}$' -and $Confirmed.before.month -match '^[a-f0-9]{64}$') 'Confirmed attendance preservation digests missing'
Require ($Payroll.passed -and $Payroll.overtime -eq '60.03' -and $Payroll.gross -eq '50060.03' -and $Payroll.tax -eq '301.80' -and $Payroll.net -eq '49758.23') 'Current actual overtime salary amounts incomplete'
Require ($Payroll.officialTaxBands -eq 7 -and $Payroll.deductionMonths -eq 8 -and $Payroll.periodId -eq '102' -and $Payroll.pendingApprovalBlocked -and $Payroll.attendanceGuardVerified -and $Payroll.payrollAttendanceValidation) 'Current payroll scope missing'
Require ($Payroll.cancellation -and $Payroll.payment -and $Payroll.duplicateDenied -and $Payroll.taxTableDisabled -and $Payroll.originalTasks.Count -eq 2 -and $Payroll.versionEvents.Count -eq 3) 'Current payroll lifecycle incomplete'
foreach($Task in $Payroll.originalTasks){Require ($Task.terminal -eq 'SUCCESS' -and $Task.affectedRows -eq 1) 'Original payroll task incomplete'}
Require (@($Payroll.versionEvents|Where-Object{$_.increment -eq 2}).Count -eq 2 -and @($Payroll.versionEvents|Where-Object{$_.increment -eq 1}).Count -eq 1) 'Exact payroll version events missing'
$Preserved=$Actual.evidence.preservation
$Allowance=$Preserved.payrollPeriodAllowance
Require ($Allowance.periodId -eq '102' -and $Allowance.expectedDelta -eq 5 -and $Allowance.observedVersion -eq $Allowance.originalVersion+5) 'Only original selected payroll version may advance'
Require ($Preserved.tables -eq 44 -and $Preserved.kept) 'Original overtime business preservation incomplete'
foreach($Property in $Preserved.before.PSObject.Properties){Require ($Preserved.after.($Property.Name) -eq $Property.Value) 'Original overtime business digest differs'}
$Database=Read-Json (Join-Path $Evidence 'h2-overtime-database-20261006-r1/result.json')
Require ($Database.Passed -and $Database.BackendRound -eq 'r114' -and $Database.Checks -eq 893 -and $Database.InputChanges -eq 0 -and $Database.ScratchCleaned -and $Database.RemainingData -eq 0 -and $Database.RemainingProcesses -eq 0 -and $Database.IdentityDoubles -and -not $Database.Http) 'Current overtime database scope incomplete'
$DatabaseLog=Get-Content -LiteralPath (Join-Path $Evidence 'h2-overtime-database-20261006-r1/database.log') -Raw
Require ($DatabaseLog -match 'PASS HR09 groups=16 assertions=893 real-db-races=18 database-dropped=true') 'Overtime database race boundary missing'
$Rules=Read-Json (Join-Path $Evidence 'h2-overtime-offline-20261006-r2/result.json')
Require ($Rules.passed -and $Rules.backend -eq 'r114' -and $Rules.checks -eq 354 -and $Rules.inputChanges -eq 0 -and -not $Rules.database -and -not $Rules.http) 'Current overtime offline rules missing'
$Launch=Get-Content -LiteralPath (Join-Path $Evidence "h2-overtime-current-20261006-$RuntimeRound-launch.log") -Raw
Require ($Launch -match 'H2_OVERTIME_CURRENT_RUN_EXIT=0' -and $Launch -match 'OWNED_CAPTCHA_RESTORED: original_limit=100; original_ttl=-1; counter_before=(\d+); counter_after=(\d+); counter_writes=0; database_unchanged=true; production_modified=false') 'Captcha restoration incomplete'
$CaptchaBefore=[int]$Matches[1];$CaptchaAfter=[int]$Matches[2]
$HttpLog=Get-Content -LiteralPath (Join-Path $Evidence "h2-overtime-current-20261006-http-$RuntimeRound.log") -Raw
Require ($HttpLog -match 'H2_OVERTIME_SECRET_SCAN: (.+)') 'Current secret scan missing'
$SecretScan=$Matches[1]|ConvertFrom-Json
Require ($SecretScan.files -ge 1 -and $SecretScan.values -ge 1 -and $SecretScan.leaks -eq 0 -and $SecretScan.databaseLeaks -eq 0) 'Current secrets scan failed'
$Adjacent=Join-Path $Evidence "h3-portal-finance-adjacent-20261002-$AdjacentRound"
$AdjacentLog=Get-Content -LiteralPath (Join-Path $Adjacent 'summary.log') -Raw
Require ($AdjacentLog -match 'H3_FINANCE_ADJACENT: files=(\d+); changed=0; exit=0; production_modified=false' -and $AdjacentLog -match 'regenerated_matches_formal=true; formal_modified=false') 'Current adjacent regression incomplete'
$Oa=Get-Content -LiteralPath (Join-Path $Adjacent 'oa-database.log') -Raw
Require ($Oa -match 'Complete approved schema table count; expected=374; actual=374' -and $Oa -match 'PASS: 1012 OA boundary assertions') 'Current formal schema regression incomplete'
$Menu=Get-Content -LiteralPath (Join-Path $Adjacent 'menu.log') -Raw
Require ($Menu -match 'EMPLOYEE_UNEXPECTED_GRANTS=0; EMPLOYEE_UNEXPECTED_WRITE_PERMISSIONS=0' -and $Menu -match 'APPROVED_MENU_SCOPE_PASS=true') 'Current menu scope incomplete'
$Sources=Get-Content -LiteralPath (Join-Path $Adjacent 'sources.log') -Raw
foreach($Marker in @('MP_SQL_LAST_APPLY: matches=0','MYBATIS_ANNOTATION_SQL: matches=0','login_only_external_endpoints=0','JAVA_PERMISSION_PREFIXES:.*invalid=0','STATIC_WHITELIST:.*stale_lines=0','EXIT_CODE=0')){Require ($Sources -match $Marker) 'Current source boundary regression incomplete'}
foreach($Build in @('backend-r114','frontend-r73')){
    $BuildLog=Get-Content -LiteralPath (Join-Path $Evidence "h3-portal-finance-20261002-$Build.log") -Raw
    Require ($BuildLog -match 'FINANCE_BUILD: phase=(Backend|Frontend); files=\d+; changed=0; exit=0') 'Current build evidence incomplete'
    if($Build -like 'backend*'){Require ($BuildLog -match 'BUILD SUCCESS' -and $BuildLog -match '\[static-rules\] no findings') 'Backend build incomplete'}
    else{Require ($BuildLog -match '> tsc --noEmit' -and $BuildLog -match 'built in ') 'Frontend build incomplete'}
}
$Inputs=@{}
foreach($File in @((Join-Path $Evidence "h2-overtime-current-20261006-inputs-$RuntimeRound.json"),(Join-Path $Adjacent 'inputs.json'),(Join-Path $Evidence 'h2-overtime-database-20261006-r1/inputs.json'),(Join-Path $Evidence 'h2-overtime-database-20261006-r1/binary-inputs.json'),(Join-Path $Evidence 'h2-overtime-offline-20261006-r2/inputs.json'),(Join-Path $Evidence 'h2-overtime-offline-20261006-r2/binary-inputs.json'))){
    foreach($Item in @(Read-Json $File)){
        $Path=if([IO.Path]::IsPathRooted($Item.Path)){$Item.Path}else{Join-Path $Root $Item.Path}
        $Path=[IO.Path]::GetFullPath($Path)
        $OwnedSource=$Path.StartsWith($Root+'\',[StringComparison]::OrdinalIgnoreCase)
        $RetainedDependency=(Split-Path -Leaf $File) -eq 'binary-inputs.json' -and $Path.StartsWith('D:\CloudFlowProCache\m2\repository\',[StringComparison]::OrdinalIgnoreCase)
        Require ($OwnedSource -or $RetainedDependency) 'Current stage input outside retained source and dependency roots'
        Require (-not $Inputs.ContainsKey($Path) -or $Inputs[$Path] -eq $Item.Hash) 'Current input snapshots conflict'
        $Inputs[$Path]=$Item.Hash
    }
}
foreach($File in $Inputs.Keys){Require ((Get-FileHash -LiteralPath $File).Hash -eq $Inputs[$File]) 'Current stage input changed'}
$ActualOriginalRoot=Join-Path $Evidence "h2-overtime-current-20261006-originals-$RuntimeRound"
$ActualOriginals=@(Get-ChildItem -LiteralPath $ActualOriginalRoot -Recurse -File)
Require ($Runtime.ExecutionOriginals -eq 513 -and $ActualOriginals.Count -eq $Runtime.ExecutionOriginals) 'Current execution originals missing'
foreach($Original in $ActualOriginals){
    $OriginalSource=Join-Path $Root ([IO.Path]::GetRelativePath($ActualOriginalRoot,$Original.FullName))
    Require ($Inputs.ContainsKey($OriginalSource) -and (Get-FileHash -LiteralPath $Original.FullName).Hash -eq $Inputs[$OriginalSource]) 'Current execution original differs from its input'
}
$JournalFile=Join-Path $Run "private/recovery/h2ot-$CaseTag.jsonl"
$Events=@(Get-Content -LiteralPath $JournalFile|ForEach-Object{$_|ConvertFrom-Json})
Require ($Events[0].event -eq 'original' -and $Events[-1].event -eq 'restored' -and @($Events|Where-Object{$_.event -eq 'account-disabled'}).Count -eq 5 -and @($Events|Where-Object{$_.event -eq 'policy-exactly-restored'}).Count -eq 1) 'Overtime recovery journal incomplete'
$Journal=[pscustomobject]@{events=$Events.Count;hash=(Get-FileHash -LiteralPath $JournalFile).Hash;restored=$true}
$Review=Read-Json (Join-Path $Evidence "h2-current-overtime-image-review-20261006-$RuntimeRound.json")
Require ($Review.reviewed -and $Review.caseTag -eq $CaseTag -and $Review.images.Count -eq 5) 'Actual overtime desktop and mobile review missing'
foreach($Image in $Review.images){Require ((Get-FileHash -LiteralPath (Join-Path $Run $Image.name)).Hash -eq $Image.hash) 'Reviewed image changed'}
$State=Read-Json (Join-Path $Run 'state.json')
Require ($State.status -eq 'RUNNING' -and $State.processes.Count -eq 9 -and $State.services.Count -eq 6) 'Owned service set incomplete'
foreach($Entry in $State.processes){$Observed=Get-CimInstance Win32_Process -Filter "ProcessId=$($Entry.id)";Require ($Observed -and $Observed.CommandLine.Contains($Entry.marker)) 'Owned process identity changed'}
$LayeredFiles=0
foreach($Service in $State.services){
    $Arguments=@(Get-Content -LiteralPath (Join-Path $Run "$($Service.name)/service.args"))
    $Index=[Array]::IndexOf($Arguments,'-cp')
    Require ($Index -ge 0 -and $Arguments[$Index+2] -eq 'org.springframework.boot.loader.launch.JarLauncher') 'Current layered launch differs'
    $Directory=[IO.Path]::GetFullPath($Arguments[$Index+1].Trim('"'))
    Require ($Directory.StartsWith((Join-Path $Run "$($Service.name)/artifacts")+'\',[StringComparison]::OrdinalIgnoreCase)) 'Layered directory outside owned service'
    $Files=@(Get-ChildItem -LiteralPath $Directory -Recurse -Force)
    Require (@($Files|Where-Object{$_.Attributes -band [IO.FileAttributes]::ReparsePoint}).Count -eq 0) 'Layered directory redirected'
    foreach($File in $Files|Where-Object{-not $_.PSIsContainer}){Require ($Inputs.ContainsKey($File.FullName)) 'Untracked layered file';$LayeredFiles++}
    Require ((Invoke-RestMethod "http://127.0.0.1:$($Service.healthPort)/actuator/health" -TimeoutSec 15).status -eq 'UP') 'Owned service unhealthy'
}
Require ($LayeredFiles -eq $Runtime.LayeredFiles) 'Layered runtime file count differs'
Require ((Get-FileHash -LiteralPath $PSCommandPath).Hash -eq $ReportHash) 'Stage source changed'
$Summary=[pscustomobject]@{passed=$true;backend='r114';frontend='r73';caseTag=$CaseTag;actualChecks=$Actual.checks.Count;actualRequests=$Actual.requests.Count;
    currentInputs=$Inputs.Count;actualInputs=$Runtime.Inputs;executionOriginals=$ActualOriginals.Count;layeredFiles=$LayeredFiles;ruleChecks=$Rules.checks;databaseChecks=$Database.Checks;databaseIdentityDoubles=$true;databaseHttp=$false;
    originalBusinessTables=44;originalBusinessPreserved=$true;privateJournal=$Journal;reviewedImages=$Review.images;adjacentRound=$AdjacentRound;
    formalTables=374;oaAssertions=1012;ownedProcesses=9;healthyServices=6;captchaBefore=$CaptchaBefore;captchaAfter=$CaptchaAfter;secrets=$SecretScan;
    frontendRoutesAndCardsModified=$true;limits=$Limits;shiftSafety=$true;compLeave=$CompLeave;adjacentAttendance=$Attendance;payroll=$Payroll;periodResolution=$Period;periodVersion=$Allowance;retainedFailures=$Failures;actualResultHash=(Get-FileHash -LiteralPath $ActualFile).Hash;reportHash=$ReportHash;allH2Complete=$false;globalComplete=$false;
    remaining=@('H2 closed payroll-period resolution and linked correction, leave-period resolution UI, shift rollback HTTP and remaining D attendance regression','H2 referral combination in suitable independent environment','D2 ordinary first request below 500ms','Global35PRD681')}
$Summary|ConvertTo-Json -Depth 7|Set-Content -LiteralPath $Output -Encoding utf8NoBOM
"H2_CURRENT_OVERTIME_PERIOD_STAGE: actual_checks=$($Actual.checks.Count); requests=$($Actual.requests.Count); inputs=$($Inputs.Count); database_checks=893; business_tables=44; reviewed_images=5; processes=9; healthy=6; all_h2_complete=false; global_complete=false"
