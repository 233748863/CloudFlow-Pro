param([ValidatePattern('^r[1-9][0-9]*$')][string]$Round='r1',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$RuntimeRound='r3',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$AdjacentRound='r155')
$ErrorActionPreference='Stop'
. 'D:\CloudFlowPro\.cloudflow-runtime\use-data-drive.ps1'
$Root='D:\CloudFlowPro'
$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
$Directory=Join-Path $Evidence "h2-independent-settlement-20261007-$RuntimeRound"
$Output=Join-Path $Evidence "h2-independent-settlement-stage-20261007-$Round.json"
if(Test-Path -LiteralPath $Output){throw 'Retain previous independent settlement stage'}
function Require([bool]$Condition,[string]$Message){if(-not $Condition){throw $Message}}
function Read-Json([string]$File){Get-Content -LiteralPath $File -Raw|ConvertFrom-Json}
$ReportHash=(Get-FileHash -LiteralPath $PSCommandPath).Hash
$Runtime=Read-Json (Join-Path $Directory 'launcher-result.json')
Require ($Runtime.passed -and $Runtime.verifierExit -eq 0 -and $Runtime.backend -eq 'r116' -and $Runtime.frontend -eq 'r75' -and $Runtime.processesStopped -and $Runtime.referenceKept -and $Runtime.inputsUnchanged -and -not $Runtime.productModified -and -not $Runtime.globalComplete) 'Independent runtime result incomplete'
$Run=[IO.Path]::GetFullPath($Runtime.run)
Require ((Split-Path -Parent $Run) -eq (Join-Path $Root '.cloudflow-runtime/batch-g-integration') -and (Split-Path -Leaf $Run) -match '^[a-f0-9]{32}$' -and (Split-Path -Leaf $Run) -ne '9799534e1a3a47b5958330f14ae16dc7') 'Independent state ownership mismatch'
$State=Read-Json (Join-Path $Run 'state.json')
Require ($State.status -eq 'STOPPED' -and $State.processes.Count -eq 8 -and $State.services.Count -eq 6 -and $State.tables -eq 374) 'Independent environment has not stopped'
foreach($Entry in $State.processes){
    $Observed=Get-CimInstance Win32_Process -Filter "ProcessId=$($Entry.id)"
    Require (-not $Observed -or -not $Observed.CommandLine.Contains($Entry.marker)) 'Independent process remains running'
}
$ActualFiles=@(Get-ChildItem -LiteralPath $Run -File -Filter 'h2-settlement-referral-results-*.json')
Require ($ActualFiles.Count -eq 1) 'One original combination result required'
$Actual=Read-Json $ActualFiles[0].FullName
$Business=Read-Json (Join-Path $Directory 'business-result.json')
Require ($Actual.passed -and $Actual.checks.Count -eq $Business.checks -and $Actual.requests.Count -eq $Business.requests -and $Business.failed -eq 0 -and $Actual.evidence.cleanup) 'Original business result incomplete'
$CaseTag=$Actual.caseTag
Require ($CaseTag -match '^[a-f0-9]{12}$') 'Invalid case identifier'
$Combined=$Actual.evidence.combination
foreach($Flag in @('funded','resignationApproved','resignationCompleted','offboardAtomicity','offboardRepeat','payrollCombination','leaveTrainingCombination','referralCombination','http','restoration','secrets')){Require ($Combined.$Flag -eq $true) "Combination evidence missing: $Flag"}
Require ($Combined.preservation.tables -eq 16 -and $Combined.preservation.kept) 'Independent original business protection missing'
foreach($Property in $Combined.preservation.before.PSObject.Properties){Require ($Combined.preservation.after.($Property.Name) -eq $Property.Value) 'Independent original business digest changed'}
foreach($Flag in @('approvalLostResponse','approvalDesktop','approvalMobile','approvalHttp','realWorkflow','fundsLostResponse','fundsPaymentReplay','fundsPosted','fundsClosed','fundsDesktop','fundsMobile','reversalPrivateProof','reversalHttp','reversalIndependentApproval','reversalMoney','reversalRestoredSources','reversalLostResponse','reversalDesktop','reversalMobile')){Require ($Combined.settlement.$Flag -eq $true) "Settlement evidence missing: $Flag"}
Require ($Combined.settlement.approvalWorkflowRounds -eq 5 -and @($Combined.stages|Where-Object{$_ -eq 'released'}).Count -eq 4) 'Original approval history incomplete'
foreach($Stage in @('calculated','submitted','released','approved','confirmed','posted','reversalPending','restored','replacementDraft')){Require ($Combined.stages -contains $Stage) 'Combination stage missing'}
Require (-not $Combined.payroll.explicitPeriod -and $Combined.payroll.endDate -eq $Combined.payroll.relievingDate -and $Combined.payroll.startDate.EndsWith('-01') -and $Combined.payroll.deduction -eq '50.00' -and $Combined.payroll.separateReceivable -eq '50.00') 'Independent payroll period or deduction differs'
Require ($Combined.referral.periodId -eq $Combined.payroll.periodId -and $Combined.referral.amount -eq '1234.56' -and $Combined.referral.employment.Count -eq 1 -and $Combined.training.amount -eq '123.45' -and $Combined.leaves.Count -eq 2) 'Real referral, training or leave source missing'
$Before=Read-Json (Join-Path $Directory 'reference-business-before.json')
$After=Read-Json (Join-Path $Directory 'reference-business-after.json')
Require (@($Before.PSObject.Properties).Count -eq 17 -and @($After.PSObject.Properties).Count -eq 17) 'Reference business protection incomplete'
foreach($Property in $Before.PSObject.Properties){Require ($After.($Property.Name) -eq $Property.Value) 'Reference business digest differs'}
$Privacy=Read-Json (Join-Path $Directory 'runtime-after.json')
Require ($Privacy.passed -and $Privacy.counterBefore -eq 0 -and $Privacy.counter -gt 0 -and $Privacy.counter -le 100 -and $Privacy.persistentLimit -eq '100' -and $Privacy.cachedLimit -eq '"100"' -and $Privacy.cacheTtl -eq -1 -and $Privacy.counterWrites -eq 0 -and $Privacy.configurationWrites -eq 0 -and $Privacy.leaks -eq 0 -and $Privacy.databaseLeaks -eq 0) 'Default captcha or runtime secret check incomplete'
$Adjacent=Join-Path $Evidence "h3-portal-finance-adjacent-20261002-$AdjacentRound"
$AdjacentLog=Get-Content -LiteralPath (Join-Path $Adjacent 'summary.log') -Raw
Require ($AdjacentLog -match 'H3_FINANCE_ADJACENT: files=\d+; changed=0; exit=0; production_modified=false' -and $AdjacentLog -match 'regenerated_matches_formal=true; formal_modified=false') 'Current adjacent regression incomplete'
$Oa=Get-Content -LiteralPath (Join-Path $Adjacent 'oa-database.log') -Raw
Require ($Oa -match 'Complete approved schema table count; expected=374; actual=374' -and $Oa -match 'PASS: 1012 OA boundary assertions') 'Formal schema regression incomplete'
$Menu=Get-Content -LiteralPath (Join-Path $Adjacent 'menu.log') -Raw
Require ($Menu -match 'EMPLOYEE_UNEXPECTED_GRANTS=0; EMPLOYEE_UNEXPECTED_WRITE_PERMISSIONS=0' -and $Menu -match 'APPROVED_MENU_SCOPE_PASS=true') 'Menu scope regression incomplete'
$Inputs=@{}
foreach($File in @((Join-Path $Directory 'inputs.json'),(Join-Path $Directory 'runtime-inputs.json'),(Join-Path $Adjacent 'inputs.json'))){
    foreach($Item in @(Read-Json $File)){
        $Path=[IO.Path]::GetFullPath($Item.Path,$Root)
        Require ($Path.StartsWith($Root+'\',[StringComparison]::OrdinalIgnoreCase)) 'Input outside workspace'
        Require (-not $Inputs.ContainsKey($Path) -or $Inputs[$Path] -eq $Item.Hash) 'Input snapshots conflict'
        $Inputs[$Path]=$Item.Hash
    }
}
foreach($File in $Inputs.Keys){Require ((Get-FileHash -LiteralPath $File).Hash -eq $Inputs[$File]) 'Current input changed'}
$OriginalCount=0
foreach($PriorRound in @('r1','r2',$RuntimeRound)){
    $Prior=Join-Path $Evidence "h2-independent-settlement-20261007-$PriorRound"
    $Snapshot=@{};foreach($Item in @(Read-Json (Join-Path $Prior 'inputs.json'))){$Snapshot[[IO.Path]::GetFullPath($Item.Path,$Root)]=$Item.Hash}
    $OriginalRoot=Join-Path $Prior 'originals'
    foreach($OriginalFile in @(Get-ChildItem -LiteralPath $OriginalRoot -Recurse -File)){
        $Source=Join-Path $Root ([IO.Path]::GetRelativePath($OriginalRoot,$OriginalFile.FullName))
        Require ($Snapshot.ContainsKey($Source) -and (Get-FileHash -LiteralPath $OriginalFile.FullName).Hash -eq $Snapshot[$Source]) 'Prior execution original differs from its frozen input'
        $OriginalCount++
    }
}
$Journals=@()
foreach($Name in @("h2ap_$CaseTag-advance", "h2as_$CaseTag-combination", "h2as_${CaseTag}_approval-settlement", "h2as_${CaseTag}_training-training")){
    $File=Join-Path $Run "private/recovery/$Name.jsonl"
    $Events=@(Get-Content -LiteralPath $File|ForEach-Object{$_|ConvertFrom-Json})
    Require ($Events.Count -ge 2 -and $Events[0].event -eq 'original' -and $Events[-1].event -in @('restored','preservation-verified')) 'Private recovery record incomplete'
    $Journals+=[pscustomobject]@{name=$Name;events=$Events.Count;hash=(Get-FileHash -LiteralPath $File).Hash;restored=$true}
}
$Review=Read-Json (Join-Path $Directory 'image-review.json')
Require ($Review.passed -and $Review.manuallyViewed -and $Review.caseTag -eq $CaseTag -and $Review.images.Count -eq 6 -and $Review.validationProcessesRemaining -eq 0) 'Actual desktop and mobile image review missing'
foreach($Image in $Review.images){Require ((Get-FileHash -LiteralPath $Image.Path).Hash -eq $Image.Hash) 'Reviewed image changed'}
$Reference=Read-Json (Join-Path $Root '.cloudflow-runtime/batch-g-integration/9799534e1a3a47b5958330f14ae16dc7/state.json')
Require ($Reference.status -eq 'RUNNING' -and $Reference.processes.Count -eq 9 -and $Reference.services.Count -eq 6) 'Reference runtime set changed'
foreach($Entry in $Reference.processes){$Observed=Get-CimInstance Win32_Process -Filter "ProcessId=$($Entry.id)";Require ($Observed -and $Observed.CommandLine.Contains($Entry.marker)) 'Reference process ownership changed'}
foreach($Service in $Reference.services){Require ((Invoke-RestMethod "http://127.0.0.1:$($Service.healthPort)/actuator/health" -TimeoutSec 10).status -eq 'UP') 'Reference service unhealthy'}
Require ((Get-FileHash -LiteralPath $PSCommandPath).Hash -eq $ReportHash) 'Stage report source changed'
$Summary=[pscustomobject]@{passed=$true;backend='r116';frontend='r75';caseTag=$CaseTag;actualChecks=$Actual.checks.Count;actualRequests=$Actual.requests.Count;
    currentInputs=$Inputs.Count;executionOriginals=$OriginalCount;independentRun=$Run;independentProcessesStopped=8;referenceProcesses=9;referenceHealthyServices=6;
    independentBusinessTables=16;referenceBusinessTables=17;originalBusinessPreserved=$true;privateJournals=$Journals;reviewedImages=$Review.images;
    captchaBefore=$Privacy.counterBefore;captchaAfter=$Privacy.counter;captchaLimit=100;captchaCounterWrites=0;captchaConfigurationWrites=0;runtimeSecretLogFiles=$Privacy.files;
    payrollPeriod=$Combined.payroll;referral=$Combined.referral;settlementId=$Combined.settlementId;reversalId=$Combined.reversalId;replacementDraftId=$Combined.replacementDraftId;
    adjacentRound=$AdjacentRound;formalTables=374;oaAssertions=1012;actualResultHash=(Get-FileHash -LiteralPath $ActualFiles[0].FullName).Hash;reportHash=$ReportHash;
    productModified=$false;allH2Complete=$false;globalComplete=$false;remaining=@('Current referral repayment after restored draft','H2 all 37 acceptance items','D2 ordinary first request below 500ms and current natural daily','Global35PRD681')}
$Summary|ConvertTo-Json -Depth 12|Set-Content -LiteralPath $Output -Encoding utf8NoBOM
"H2_INDEPENDENT_STAGE: passed=true; checks=$($Actual.checks.Count); requests=$($Actual.requests.Count); current_inputs=$($Inputs.Count); originals=$OriginalCount; images=6; reference_healthy_services=6; global_complete=false"
