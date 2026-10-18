param([ValidatePattern('^r[1-9][0-9]*$')][string]$Round='r1')
$ErrorActionPreference='Stop'
. 'D:\CloudFlowPro\.cloudflow-runtime\use-data-drive.ps1'
$Root='D:\CloudFlowPro'
$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
$Output=Join-Path $Evidence "d3-current-acceptance-20261006-$Round.json"
if(Test-Path -LiteralPath $Output){throw 'Retain original D3 acceptance evidence'}
$ReportHash=(Get-FileHash -LiteralPath $PSCommandPath).Hash
function Require([bool]$Condition,[string]$Message){if(-not $Condition){throw $Message}}
function Read-Json([string]$File){Get-Content -LiteralPath (Join-Path $Evidence $File) -Raw|ConvertFrom-Json}
$Current=@{};$Artifacts=@();$Sources=@{}
$RunnerExtensions=[System.Collections.Generic.List[object]]::new()
function Verify-RunnerExtension([string]$File,[object]$Item){
    Require ($Item.Path.Replace('\','/') -ceq 'scripts/verify-hr-settlement-foundation.ps1') "Current D3 acceptance input changed: $File / $($Item.Path)"
    Require ($File -cin @('d3-payroll-replay-20261006-r4/inputs.json','d3-generation-resume-20261006-r2/inputs.json')) "Unrecognized historical runner source: $File"
    $OriginalPath=$File.Replace('/inputs.json','/original-verify-hr-settlement-foundation.ps1')
    $Original=Join-Path $Evidence $OriginalPath
    $OriginalHash=(Get-FileHash -LiteralPath $Original).Hash
    Require ($OriginalHash -eq $Item.Hash) 'Historical runner original differs from recorded input'
    $Expected=[IO.File]::ReadAllText($Original).Replace("`r`n","`n").TrimEnd()
    $Modes=@('PayrollCreateClose')
    if($File -ceq 'd3-payroll-replay-20261006-r4/inputs.json'){
        $Expected=$Expected.Replace('[string]$StatePath, [switch]$PayrollReplay','[string]$StatePath, [switch]$PayrollGenerationResume, [switch]$PayrollReplay').Replace('@($PayrollReplay,','@($PayrollGenerationResume, $PayrollReplay,').Replace('$CheckClass = if ($PayrollReplay)','$CheckClass = if ($PayrollGenerationResume) { ''HrPayrollGenerationResumeChecks'' } elseif ($PayrollReplay)').Replace('if ($PayrollReplay -or $SourceReservation -or $Funds)','if ($PayrollGenerationResume -or $PayrollReplay -or $SourceReservation -or $Funds)')
        $Modes=@('PayrollGenerationResume','PayrollCreateClose')
    }
    $Expected=$Expected.Replace('[string]$StatePath, [switch]$PayrollGenerationResume','[string]$StatePath, [switch]$PayrollCreateClose, [switch]$PayrollGenerationResume').Replace('@($PayrollGenerationResume,','@($PayrollCreateClose, $PayrollGenerationResume,').Replace('$CheckClass = if ($PayrollGenerationResume)','$CheckClass = if ($PayrollCreateClose) { ''HrPayrollCreateCloseChecks'' } elseif ($PayrollGenerationResume)').Replace('if ($PayrollGenerationResume -or $PayrollReplay -or $SourceReservation -or $Funds)','if ($PayrollCreateClose -or $PayrollGenerationResume -or $PayrollReplay -or $SourceReservation -or $Funds)')
    Require ($Expected -ceq [IO.File]::ReadAllText((Join-Path $Root $Item.Path)).Replace("`r`n","`n").TrimEnd()) 'Historical runner differs beyond exact isolated mode extensions'
    $RunnerExtensions.Add([pscustomobject]@{Input=$File;Path=$Item.Path;OriginalPath=$OriginalPath;OriginalHash=$OriginalHash;CurrentHash=$Current[$Item.Path];AddedModes=$Modes;ExactTransformation=$true})
}
function Verify-Inputs([string]$File){foreach($Item in @(Read-Json $File)){
    if(-not $Current.ContainsKey($Item.Path)){$Current[$Item.Path]=(Get-FileHash -LiteralPath (Join-Path $Root $Item.Path)).Hash}
    if($Current[$Item.Path] -ne $Item.Hash){Verify-RunnerExtension $File $Item}
}}
$Definitions=@(
    @{Key='scale';Folder='d3-batch-scale-20261006-r4';Flags=@('selection','selectionPage','scale','progressPage','performanceMet','cancellation')},
    @{Key='lifecycle';Folder='d3-batch-lifecycle-20261006-r2';Flags=@('duplicate','competing','attendance','immutable','closed')},
    @{Key='cumulative';Folder='d3-cumulative-tax-20261006-r5';Flags=@('cumulative','retry','yearReset','midHire','snapshot','taxTableReplacement','unverifiedDeduction','cancellation')},
    @{Key='deductions';Folder='d3-payroll-deductions-20261006-r3';Flags=@('approval','attendance','deductions','mixedBatch','snapshot')},
    @{Key='cancellation';Folder='d3-batch-cancellation-20261006-r3';Flags=@('roles','scope','tenant','anonymous','atomicDenial','exactCancellation','audits')},
    @{Key='privacy';Folder='d3-salary-privacy-20261006-r7';Flags=@('scope','tenant','unpublished','downloads','confirmation','audits')},
    @{Key='audit';Folder='d3-denied-query-audit-20261006-r3';InputFolder='d3-salary-privacy-20261006-r7';Flags=@('readOnly','deniedQueryAuditVerified')},
    @{Key='corrections';Folder='d3-payroll-corrections-20261006-r5';Flags=@('approval','samePeriod','negative','nextPeriod','boundaries','ui','audits')},
    @{Key='filters';Folder='d3-batch-filters-20261006-r6';Flags=@('filters','persisted','failurePage','retry','cancelPermission','closed')},
    @{Key='replay';Folder='d3-payroll-replay-20261006-r4';Flags=@('ActualDatabase','ActualService','ActualTaskHandler','TaskAdmissionFixture','CheckpointFixture','DistributedLock','ScratchCleaned')},
    @{Key='resume';Folder='d3-generation-resume-20261006-r2';Flags=@('ActualDatabase','ActualService','ActualGeneration','ActualReservation','ControlledPreview','ControlledOverlap','DistributedLock','ScratchCleaned')},
    @{Key='createClose';Folder='d3-create-close-20261006-r1';Flags=@('ActualDatabase','ActualService','ActualBatchCreate','ActualClose','ActualPrecheck','ControlledOverlap','DistributedLock','ScratchCleaned')},
    @{Key='correctionClose';Folder='d3-period-corrections-20261006-r1';Flags=@('pending','rejected','approvedUnpaid','paid','closed')},
    @{Key='large';Folder='d3-large-publication-20261006-r3';Flags=@('storage','calculation','transport','browser','input','publication','pdf','ess','nextPeriod','presentation','compensationUi')},
    @{Key='tax';Folder='d3-tax-boundaries-20261006-r2';Flags=@('boundaries','rounding','threshold','snapshots','browser')},
    @{Key='special';Folder='d3-deduction-statuses-20261006-r8';Flags=@('proofs','employeeForm','sharedUploads','statuses','switches','exclusions','reapproval','snapshots','browser')},
    @{Key='income';Folder='d3-income-benefits-20261006-r4';Flags=@('mixedSources','sourceFilters','benefitGeneration','snapshots','browser')},
    @{Key='funded';Folder='d3-funded-encashment-20261006-r8';Flags=@('funding','encashment','mixedPayroll','cancellation','payment','duplicates','browser')},
    @{Key='approved';Folder='d3-approved-income-20261006-r5';Flags=@('overtime','referral','mixedPayroll','cancellation','payment','duplicates','browser')},
    @{Key='labels';Folder='d3-source-labels-20261006-r3';Flags=@('content','browser','pdf','readOnly')}
)
foreach($Definition in $Definitions){
    $Folder=$Definition.Folder;$Result=Read-Json "$Folder/result.json"
    foreach($Flag in @('passed')+$Definition.Flags){Require ($Result.$Flag -eq $true) "D3 acceptance source missing: $($Definition.Key).$Flag"}
    Require (-not $Result.officialTaxPolicyVerified -and -not $Result.OfficialTaxPolicy -and -not $Result.all18Complete -and -not $Result.globalComplete) 'Original source boundary changed'
    if($Definition.Key -notin @('audit','replay','resume','createClose','labels')){
        foreach($Flag in @('preservation','restoration','secrets')){Require ($Result.$Flag -eq $true) 'Original business restoration missing'}
    }
    $InputFolder=if($Definition.InputFolder){$Definition.InputFolder}else{$Folder}
    Verify-Inputs "$InputFolder/inputs.json"
    foreach($File in @("$Folder/result.json","$InputFolder/inputs.json")){$Artifacts+=[pscustomobject]@{Path=$File;Hash=(Get-FileHash -LiteralPath (Join-Path $Evidence $File)).Hash}}
    $Sources[$Definition.Key]=[pscustomobject]@{Folder=$Folder;RequiredFlags=$Definition.Flags;Result=$Result}
}
$Audit=$Sources['audit'].Result
Require ($Audit.privacyRound -eq 'r7' -and $Audit.backend -eq 'r108' -and $Audit.frontend -eq 'r66' -and $Audit.requests -eq 117 -and $Audit.denied -eq 77 -and $Audit.failures.Count -eq 0) 'Current query audit scope differs'
foreach($Source in $Audit.sources){Require ((Get-FileHash -LiteralPath $Source.path).Hash.ToLowerInvariant() -eq $Source.sha256) 'Original query audit evidence changed'}
Require ((Get-FileHash -LiteralPath (Join-Path $Root 'scripts/verify-d3-denied-query-audit.mjs')).Hash.ToLowerInvariant() -eq $Audit.verifierSha256) 'Executed query audit verifier changed'
$BinaryHashes=@{}
foreach($Folder in @('d3-payroll-replay-20261006-r4','d3-generation-resume-20261006-r2','d3-create-close-20261006-r1')){
    foreach($Item in @(Read-Json "$Folder/binary-inputs.json")){
        if(-not $BinaryHashes.ContainsKey($Item.Path)){$BinaryHashes[$Item.Path]=(Get-FileHash -LiteralPath $Item.Path).Hash}
        Require ($BinaryHashes[$Item.Path] -eq $Item.Hash) 'Actual service binary dependency changed'
    }
}
$Money=Read-Json 'd3-current-money-stage-20261006-r1.json'
Require ($Money.passed -and $Money.backend -eq 'r108' -and $Money.frontend -eq 'r66' -and $Money.phases.Count -eq 7 -and $Money.relatedRound -eq 'r124' -and $Money.healthyServices -eq 6) 'Current money summary incomplete'
foreach($Artifact in $Money.artifacts){Require ((Get-FileHash -LiteralPath (Join-Path $Root $Artifact.Path)).Hash -eq $Artifact.Hash) 'Original money stage evidence changed'}
Require ((Get-FileHash -LiteralPath (Join-Path $Root 'scripts/summarize-d3-current-money-stage.ps1')).Hash -eq $Money.reportHash) 'Money stage report changed'
Verify-Inputs 'h3-portal-finance-adjacent-20261002-r124/inputs.json'
Verify-Inputs 'h3-portal-finance-20261002-backend-r108-inputs.json'
Verify-Inputs 'h3-portal-finance-20261002-frontend-r66-inputs.json'
$Rows=@(
    @{Id=1;Sources=@('scale','filters');Rule='部门筛选和人工增删员工'},
    @{Id=2;Sources=@('scale');Rule='500人异步计算、接口返回和页面进度'},
    @{Id=3;Sources=@('cumulative','filters');Rule='部分失败明细与仅重跑失败员工'},
    @{Id=4;Sources=@('lifecycle','replay','resume','funded','approved');Rule='重复计算、延迟任务及员工事务接续'},
    @{Id=5;Sources=@('cancellation','scale','funded','approved');Rule='授权取消只清理本批工资及预扣'},
    @{Id=6;Sources=@('lifecycle','deductions');Rule='考勤不齐跳过并给出原因'},
    @{Id=7;Sources=@('deductions');Rule='真实无薪及部分带薪假扣款'},
    @{Id=8;Sources=@('deductions');Rule='真实打卡、缺勤及迟到扣款'},
    @{Id=9;Sources=@('cumulative','tax');Rule='累计预扣、跨档及正式政策案例'},
    @{Id=10;Sources=@('cumulative');Rule='跨年重置与月中入职起算'},
    @{Id=11;Sources=@('cumulative');Rule='税表替换及旧工资快照保持'},
    @{Id=12;Sources=@('special');Rule='本人申报审核和未举证扣除开关'},
    @{Id=13;Sources=@('corrections');Rule='独立审批补正和同期或下期差额发放'},
    @{Id=14;Sources=@('lifecycle','resume');Rule='跨批同员工唯一工资'},
    @{Id=15;Sources=@('privacy','audit');Rule='本人权限、部门租户边界及全部查询审计'},
    @{Id=16;Sources=@('lifecycle','privacy','corrections');Rule='已确定工资不可改及本人确认'},
    @{Id=17;Sources=@('large','tax','income','funded','approved','labels');Rule='大额、小数、来源组合和PDF精度'},
    @{Id=18;Sources=@('lifecycle','createClose','correctionClose','corrections');Rule='关闭周期及批次和补正竞争保护'}
)
$Acceptance=@()
foreach($Row in $Rows){
    foreach($Key in $Row.Sources){Require ($Sources.ContainsKey($Key)) 'Missing selected acceptance source'}
    $Acceptance+=[pscustomobject]@{Id="AC-$($Row.Id)";Rule=$Row.Rule;Status=$(if($Row.Id -eq 9){'POLICY_PENDING'}else{'VERIFIED'});FunctionalEvidence=$true;Sources=@($Row.Sources|ForEach-Object {$Sources[$_].Folder});Remaining=$(if($Row.Id -eq 9){'Finance-approved applicable tax table and official policy examples'}else{$null})}
}
Require ($Acceptance.Count -eq 18 -and @($Acceptance.Id|Sort-Object -Unique).Count -eq 18) 'D3 acceptance mapping incomplete'
Require ($RunnerExtensions.Count -eq 2) 'Historical runner extension accounting differs'
$RelatedInputs=@(Read-Json 'h3-portal-finance-adjacent-20261002-r124/inputs.json')
Require (@($RelatedInputs|Where-Object {(Split-Path -Leaf $_.Path) -eq (Split-Path -Leaf $PSCommandPath)}).Count -eq 0) 'Report timing differs from its declared scope'
Require ((Get-FileHash -LiteralPath $PSCommandPath).Hash -eq $ReportHash) 'Acceptance report changed while reading evidence'
$Accepted=@($Acceptance|Where-Object Status -eq 'VERIFIED').Count
$Summary=[pscustomobject]@{evidenceValid=$true;readOnly=$true;backend='r108';frontend='r66';accepted=$Accepted;policyPending=18-$Accepted;functionalCoverage=18;acceptance=$Acceptance;sourceCount=$Sources.Count;currentInputs=$Current.Count;binaryInputs=$BinaryHashes.Count;artifacts=$Artifacts;moneyStageHash=(Get-FileHash -LiteralPath (Join-Path $Evidence 'd3-current-money-stage-20261006-r1.json')).Hash;reportHash=$ReportHash;relatedRound='r124';reportAddedAfterRelatedRound=$true;officialTaxPolicyVerified=$false;all18Complete=$false;globalComplete=$false;concurrencyScope='Actual services, MySQL and Redis; selected interruption and overlap timings controlled; not natural process crashes';performanceScope='500-person payroll met 180000ms; D2 ordinary first-query 500ms remains separate'}
$Summary|Add-Member -NotePropertyName historicalRunnerExtensions -NotePropertyValue @($RunnerExtensions.ToArray())
$Summary|ConvertTo-Json -Depth 7|Set-Content -LiteralPath $Output -Encoding utf8NoBOM
"D3_CURRENT_ACCEPTANCE: verified=$Accepted; policy_pending=$($Summary.policyPending); functional_coverage=18; sources=$($Sources.Count); inputs=$($Current.Count); binaries=$($BinaryHashes.Count); all18_complete=false; global_complete=false"
