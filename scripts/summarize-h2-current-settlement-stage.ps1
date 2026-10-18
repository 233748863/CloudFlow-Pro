param([ValidatePattern('^r[1-9][0-9]*$')][string]$Round='r1',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$RuntimeRound='r6',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$AdjacentRound='r135',
    [ValidatePattern('^[a-f0-9]{12}$')][string]$CaseTag='c79248343de3')
$ErrorActionPreference='Stop'
. 'D:\CloudFlowPro\.cloudflow-runtime\use-data-drive.ps1'
$Root='D:\CloudFlowPro'
$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
$Run=Join-Path $Root '.cloudflow-runtime/batch-g-integration/9799534e1a3a47b5958330f14ae16dc7'
$Output=Join-Path $Evidence "h2-current-settlement-stage-20261006-$Round.json"
if(Test-Path -LiteralPath $Output){throw 'Retain original current settlement stage'}
function Require([bool]$Value,[string]$Message){if(-not $Value){throw $Message}}
function Read-Json([string]$File){Get-Content -LiteralPath $File -Raw|ConvertFrom-Json}
$ReportHash=(Get-FileHash -LiteralPath $PSCommandPath).Hash
$Runtime=Read-Json (Join-Path $Evidence "h2-settlement-all-sources-20261004-result-$RuntimeRound.json")
Require ($Runtime.Passed -and $Runtime.BackendRound -eq 'r114' -and $Runtime.FrontendRound -eq 'r72' -and $Runtime.AllSources -and $Runtime.PayrollDeduction -and -not $Runtime.Referral -and $Runtime.PayrollPeriodId -eq '103' -and $Runtime.InputChanges -eq 0 -and -not $Runtime.ProductModified -and -not $Runtime.GlobalComplete) 'Current actual settlement scope incomplete'
$ActualFile=Join-Path $Run "h2-settlement-all-sources-results-$CaseTag.json"
$Actual=Read-Json $ActualFile
Require ($Actual.passed -and $Actual.caseTag -eq $CaseTag -and $Actual.checks.Count -gt 0 -and $Actual.requests.Count -gt 0 -and $Actual.evidence.cleanup) 'Actual business result incomplete'
$Combined=$Actual.evidence.combination
foreach($Flag in @('funded','resignationApproved','resignationCompleted','offboardAtomicity','offboardRepeat','payrollCombination','leaveTrainingCombination','http','restoration','secrets')){Require ($Combined.$Flag -eq $true) "Combined business evidence missing: $Flag"}
Require ($Combined.preservation.tables -eq 16 -and $Combined.preservation.kept) 'Original business protection incomplete'
foreach($Property in $Combined.preservation.before.PSObject.Properties){Require ($Combined.preservation.after.($Property.Name) -eq $Property.Value) 'Original business digest differs'}
foreach($Flag in @('approvalLostResponse','approvalDesktop','approvalMobile','approvalHttp','realWorkflow','fundsLostResponse','fundsPaymentReplay','fundsPosted','fundsClosed','fundsDesktop','fundsMobile','reversalPrivateProof','reversalHttp','reversalIndependentApproval','reversalMoney','reversalRestoredSources','reversalLostResponse','reversalDesktop','reversalMobile')){Require ($Combined.settlement.$Flag -eq $true) "Settlement evidence missing: $Flag"}
Require ($Combined.settlement.approvalWorkflowRounds -eq 5 -and @($Combined.stages|Where-Object{$_ -eq 'released'}).Count -eq 4) 'Original approval history incomplete'
foreach($Stage in @('calculated','submitted','released','approved','confirmed','posted','reversalPending','restored','replacementDraft')){Require ($Combined.stages -contains $Stage) 'Combined stage missing'}
Require ($Combined.payroll.periodId -eq '103' -and $Combined.payroll.startDate -eq '2026-10-01' -and $Combined.payroll.endDate -eq '2026-10-04' -and $Combined.payroll.explicitPeriod -and $Combined.payroll.deduction -eq '50.00' -and $Combined.payroll.separateReceivable -eq '50.00') 'Explicit payroll scope differs'
Require ($Combined.training.amount -eq '123.45' -and $Combined.leaves.Count -eq 2) 'Training and leave evidence incomplete'
$Database=Read-Json (Join-Path $Evidence 'h2-settlement-validation-run-20261006-r2/result.json')
Require ($Database.Passed -and $Database.BackendRound -eq 'r114' -and $Database.Modes.Count -eq 8 -and $Database.InputChanges -eq 0) 'Current eight database modes incomplete'
foreach($Mode in $Database.Modes){Require ($Mode.Passed -and $Mode.ScratchCleaned -and $Mode.InputUnchanged) 'Database mode incomplete'}
$Recovery=Read-Json (Join-Path $Evidence 'h2-settlement-r4-recovery-20261006-r2/result.json')
Require ($Recovery.passed -and $Recovery.permissions -and $Recovery.configuration -and $Recovery.preservation -and $Recovery.secrets -and $Recovery.captchaRestored) 'Previous interrupted run recovery incomplete'
$Launch=Get-Content -LiteralPath (Join-Path $Evidence "h2-settlement-all-sources-current-$RuntimeRound-launch.log") -Raw
Require ($Launch -match 'H2_ADVANCE_SETTLEMENT_RUN_EXIT=0' -and $Launch -match 'OWNED_CAPTCHA_RESTORED: original_limit=100; original_ttl=-1; counter_before=(\d+); counter_after=(\d+); counter_writes=0; database_unchanged=true; production_modified=false') 'Original current launch incomplete'
$CaptchaBefore=[int]$Matches[1];$CaptchaAfter=[int]$Matches[2]
$Adjacent=Join-Path $Evidence "h3-portal-finance-adjacent-20261002-$AdjacentRound"
$AdjacentLog=Get-Content -LiteralPath (Join-Path $Adjacent 'summary.log') -Raw
Require ($AdjacentLog -match 'H3_FINANCE_ADJACENT: files=(\d+); changed=0; exit=0; production_modified=false' -and $AdjacentLog -match 'regenerated_matches_formal=true; formal_modified=false') 'Current adjacent regression incomplete'
$Oa=Get-Content -LiteralPath (Join-Path $Adjacent 'oa-database.log') -Raw
Require ($Oa -match 'Complete approved schema table count; expected=374; actual=374' -and $Oa -match 'PASS: 1012 OA boundary assertions') 'Current formal schema regression incomplete'
$Menu=Get-Content -LiteralPath (Join-Path $Adjacent 'menu.log') -Raw
Require ($Menu -match 'EMPLOYEE_UNEXPECTED_GRANTS=0; EMPLOYEE_UNEXPECTED_WRITE_PERMISSIONS=0' -and $Menu -match 'APPROVED_MENU_SCOPE_PASS=true') 'Current menu scope incomplete'
$Sources=Get-Content -LiteralPath (Join-Path $Adjacent 'sources.log') -Raw
foreach($Marker in @('MP_SQL_LAST_APPLY: matches=0','MYBATIS_ANNOTATION_SQL: matches=0','login_only_external_endpoints=0','JAVA_PERMISSION_PREFIXES:.*invalid=0','STATIC_WHITELIST:.*stale_lines=0','EXIT_CODE=0')){Require ($Sources -match $Marker) 'Current source boundary regression incomplete'}
foreach($Build in @('backend-r114','frontend-r72')){
    $BuildLog=Get-Content -LiteralPath (Join-Path $Evidence "h3-portal-finance-20261002-$Build.log") -Raw
    Require ($BuildLog -match 'FINANCE_BUILD: phase=(Backend|Frontend); files=\d+; changed=0; exit=0') 'Current build evidence incomplete'
    if($Build -like 'backend*'){Require ($BuildLog -match 'BUILD SUCCESS' -and $BuildLog -match '\[static-rules\] no findings') 'Backend build incomplete'}
    else{Require ($BuildLog -match '> tsc --noEmit' -and $BuildLog -match 'built in ') 'Frontend build incomplete'}
}
$Inputs=@{}
foreach($File in @((Join-Path $Evidence "h2-settlement-all-sources-20261004-inputs-$RuntimeRound.json"),(Join-Path $Adjacent 'inputs.json'),(Join-Path $Evidence 'h2-settlement-validation-run-20261006-r2/inputs.json'),(Join-Path $Evidence 'h2-settlement-validation-run-20261006-r2/binary-inputs.json'))){
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
$JournalNames=@("h2ap_$CaseTag-advance", "h2as_$CaseTag-combination", "h2as_${CaseTag}_approval-settlement", "h2as_${CaseTag}_training-training")
$Journals=@()
foreach($Name in $JournalNames){
    $File=Join-Path $Run "private/recovery/$Name.jsonl"
    $Events=@(Get-Content -LiteralPath $File|ForEach-Object{$_|ConvertFrom-Json})
    Require ($Events.Count -ge 2 -and $Events[0].event -eq 'original' -and $Events[-1].event -in @('restored','preservation-verified')) 'Private recovery record lacks original or verified restoration'
    $Journals+=[pscustomobject]@{name=$Name;events=$Events.Count;hash=(Get-FileHash -LiteralPath $File).Hash;restored=$true}
}
$Review=Read-Json (Join-Path $Evidence "h2-current-settlement-image-review-20261006-$RuntimeRound.json")
Require ($Review.reviewed -and $Review.caseTag -eq $CaseTag -and $Review.images.Count -eq 2) 'Actual desktop and mobile review missing'
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
$Summary=[pscustomobject]@{passed=$true;backend='r114';frontend='r72';caseTag=$CaseTag;actualChecks=$Actual.checks.Count;actualRequests=$Actual.requests.Count;currentInputs=$Inputs.Count;actualInputs=$Runtime.Inputs;layeredFiles=$LayeredFiles;databaseModes=$Database.Modes.Count;databaseScope='actual-database-with-controlled-workflow-candidates-and-private-file-samples';originalBusinessTables=16;originalBusinessPreserved=$true;previousRecoveryBusinessTables=17;privateJournals=$Journals;reviewedImages=$Review.images;adjacentRound=$AdjacentRound;formalTables=374;oaAssertions=1012;ownedProcesses=9;healthyServices=6;captchaBefore=$CaptchaBefore;captchaAfter=$CaptchaAfter;productModified=$false;payrollPeriod=$Combined.payroll;settlementId=$Combined.settlementId;reversalId=$Combined.reversalId;replacementDraftId=$Combined.replacementDraftId;actualResultHash=(Get-FileHash -LiteralPath $ActualFile).Hash;reportHash=$ReportHash;allH2Complete=$false;globalComplete=$false;remaining=@('H2 referral combination in suitable independent environment','H2 skills appraisals and overtime current acceptance','D2 ordinary first request below 500ms','Global35PRD681')}
$Summary|ConvertTo-Json -Depth 7|Set-Content -LiteralPath $Output -Encoding utf8NoBOM
"H2_CURRENT_SETTLEMENT_STAGE: checks=$($Actual.checks.Count); requests=$($Actual.requests.Count); inputs=$($Inputs.Count); database_modes=8; business_tables=16; private_journals=4; reviewed_images=2; processes=9; healthy=6; all_h2_complete=false; global_complete=false"
