param([ValidatePattern('^r[1-9][0-9]*$')][string]$Round='r1',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$RuntimeRound='r1',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$AdjacentRound='r160')
$ErrorActionPreference='Stop'
. 'D:\CloudFlowPro\.cloudflow-runtime\use-data-drive.ps1'
$Root='D:\CloudFlowPro'
$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
$Output=Join-Path $Evidence "h2-current-advance-approval-stage-20261007-$Round.json"
if(Test-Path -LiteralPath $Output){throw 'Retain previous advance approval stage'}
function Require([bool]$Condition,[string]$Message){if(-not $Condition){throw $Message}}
function Read-Json([string]$File){Get-Content -LiteralPath $File -Raw|ConvertFrom-Json}
$ReportHash=(Get-FileHash -LiteralPath $PSCommandPath).Hash
$Directory=Join-Path $Evidence "h2-independent-advance-approval-20261007-$RuntimeRound"
$Runtime=Read-Json (Join-Path $Directory 'launcher-result.json')
Require ($Runtime.passed -and $Runtime.verifierExit -eq 0 -and $Runtime.advanceApprovalOnly -and $Runtime.backend -eq 'r116' -and $Runtime.frontend -eq 'r76' -and $Runtime.inputsUnchanged -and $Runtime.processesStopped -and $Runtime.referenceKept -and $Runtime.referenceBusinessTables -eq 27 -and -not $Runtime.productModified -and -not $Runtime.globalComplete) 'Advance runtime incomplete'
$Run=[IO.Path]::GetFullPath($Runtime.run)
Require ((Split-Path -Parent $Run) -eq (Join-Path $Root '.cloudflow-runtime/batch-g-integration') -and (Split-Path -Leaf $Run) -match '^[a-f0-9]{32}$' -and (Split-Path -Leaf $Run) -ne '9799534e1a3a47b5958330f14ae16dc7') 'Independent ownership differs'
$State=Read-Json (Join-Path $Run 'state.json')
Require ($State.status -eq 'STOPPED' -and $State.processes.Count -eq 8 -and $State.services.Count -eq 6 -and $State.tables -eq 374) 'Advance runtime not stopped'
foreach($Entry in $State.processes){$Observed=Get-CimInstance Win32_Process -Filter "ProcessId=$($Entry.id)";Require (-not $Observed -or -not $Observed.CommandLine.Contains($Entry.marker)) 'Independent process remains'}
$ActualFiles=@(Get-ChildItem -LiteralPath $Run -File -Filter 'h2-advance-approval-results-*.json')
Require ($ActualFiles.Count -eq 1) 'One advance result required'
$Actual=Read-Json $ActualFiles[0].FullName
Require ($Actual.passed -and -not $Actual.failure -and $Actual.checks.Count -eq 84 -and $Actual.requests.Count -eq 117) 'Advance actual coverage incomplete'
Require ((Get-FileHash -LiteralPath $ActualFiles[0].FullName).Hash -eq (Get-FileHash -LiteralPath (Join-Path $Directory 'business-result.json')).Hash) 'Business result copy differs'
$Flags=@('rules','approval','funding','rejections','delayedCallback','settlementGuard','paymentRollback','paymentReplay','concurrency','permissions','tenants','http','desktop','mobile','cleanup','lostResponse')
foreach($Flag in $Flags){Require ($Actual.evidence.$Flag -eq $true) "Advance flag missing: $Flag"}
foreach($Label in @('未来加薪未提高当前借款上限','真实提交成功但响应丢失后锁定再次提交','核对原单恢复结果且不会再次提交','首节点只有部门负责人，财务不能提前审核','首审后尚无付款单或本金','正式角色授权逐条保持不变','原有账号的角色关联逐条恢复')){Require ($Actual.checks -contains $Label) 'Advance critical assertion missing'}
$Before=Read-Json (Join-Path $Directory 'reference-business-before.json')
$After=Read-Json (Join-Path $Directory 'reference-business-after.json')
Require (@($Before.PSObject.Properties).Count -eq 27 -and @($After.PSObject.Properties).Count -eq 27) 'Reference scope differs'
foreach($Property in $Before.PSObject.Properties){Require ($After.($Property.Name) -eq $Property.Value) 'Original business changed'}
$Privacy=Read-Json (Join-Path $Directory 'runtime-after.json')
Require ($Privacy.passed -and $Privacy.counterBefore -eq 0 -and $Privacy.counter -eq 8 -and $Privacy.persistentLimit -eq '100' -and $Privacy.cachedLimit -eq '"100"' -and $Privacy.cacheTtl -eq -1 -and $Privacy.counterWrites -eq 0 -and $Privacy.configurationWrites -eq 0 -and $Privacy.files -eq 20 -and $Privacy.sensitiveValues -eq 25 -and $Privacy.leaks -eq 0 -and $Privacy.databaseLeaks -eq 0) 'Advance privacy postflight failed'
$Current=@{};$Snapshot=@{}
foreach($Name in @('inputs.json','runtime-inputs.json')){
    foreach($Item in @(Read-Json (Join-Path $Directory $Name))){
        $Path=[IO.Path]::GetFullPath($Item.Path,$Root)
        Require ((Get-FileHash -LiteralPath $Path).Hash -eq $Item.Hash) 'Executed input changed'
        Require (-not $Current.ContainsKey($Path) -or $Current[$Path] -eq $Item.Hash) 'Executed input conflict'
        $Current[$Path]=$Item.Hash
        if($Name -eq 'inputs.json'){$Snapshot[$Path]=$Item.Hash}
    }
}
$OriginalCount=0;$OriginalRoot=Join-Path $Directory 'originals'
foreach($File in @(Get-ChildItem -LiteralPath $OriginalRoot -Recurse -File)){
    $Source=Join-Path $Root ([IO.Path]::GetRelativePath($OriginalRoot,$File.FullName))
    Require ($Snapshot.ContainsKey($Source) -and (Get-FileHash -LiteralPath $File.FullName).Hash -eq $Snapshot[$Source]) 'Execution original changed'
    $OriginalCount++
}
Require ($OriginalCount -eq $Runtime.executionOriginals) 'Original file count differs'
$Prep=Join-Path $Evidence 'h2-advance-approval-current-prep-20261007-r1'
$PriorInputs=@(Read-Json (Join-Path $Evidence 'h3-portal-finance-adjacent-20261002-r159/inputs.json'))
$Changes=@(Read-Json (Join-Path $Prep 'changes.json'))
Require ($Changes.Count -eq 3) 'Three reviewed verifier changes required'
foreach($Change in $Changes){
    Require ($Change.Reviewed -and $Change.Reason -and $Change.Path -cin @('scripts/run-h2-independent-settlement.ps1','scripts/verify-h2-independent-runtime.mjs','scripts/verify-hr-advance-approval-real.mjs')) 'Unreviewed verifier change'
    $Prior=@($PriorInputs|Where-Object{$_.Path.Replace('\','/') -eq $Change.Path})
    Require ($Prior.Count -eq 1 -and $Prior[0].Hash -eq $Change.BeforeHash -and (Get-FileHash -LiteralPath $Change.Original).Hash -eq $Change.BeforeHash -and (Get-FileHash -LiteralPath (Join-Path $Root $Change.Path)).Hash -eq $Change.AfterHash) 'Verifier history differs'
}
$Review=Read-Json (Join-Path $Directory 'image-review.json')
Require ($Review.passed -and $Review.manuallyViewed -and $Review.images.Count -eq 4 -and $Review.observedProcesses.Count -gt 0 -and $Review.validationProcessesRemaining -eq 0) 'Advance page review incomplete'
foreach($Image in $Review.images){Require ((Get-FileHash -LiteralPath $Image.Path).Hash -eq $Image.Hash) 'Reviewed image changed'}
foreach($Entry in $Review.observedProcesses){$Observed=Get-CimInstance Win32_Process -Filter "ProcessId=$($Entry.ProcessId)";Require (-not $Observed -or $Observed.CreationDate -ne [datetime]$Entry.CreationDate) 'Validation process remains'}
$Adjacent=Join-Path $Evidence "h3-portal-finance-adjacent-20261002-$AdjacentRound"
$AdjacentLog=Get-Content -LiteralPath (Join-Path $Adjacent 'summary.log') -Raw
Require ($AdjacentLog -match 'H3_FINANCE_ADJACENT: files=\d+; changed=0; exit=0; production_modified=false' -and $AdjacentLog -match 'regenerated_matches_formal=true; formal_modified=false') 'Adjacent regression incomplete'
$Oa=Get-Content -LiteralPath (Join-Path $Adjacent 'oa-database.log') -Raw
Require ($Oa -match 'Complete approved schema table count; expected=374; actual=374' -and $Oa -match 'PASS: 1012 OA boundary assertions') 'Formal schema regression incomplete'
$Menu=Get-Content -LiteralPath (Join-Path $Adjacent 'menu.log') -Raw
Require ($Menu -match 'EMPLOYEE_UNEXPECTED_GRANTS=0; EMPLOYEE_UNEXPECTED_WRITE_PERMISSIONS=0' -and $Menu -match 'APPROVED_MENU_SCOPE_PASS=true') 'Permission scope regression incomplete'
foreach($Item in @(Read-Json (Join-Path $Adjacent 'inputs.json'))){$Path=[IO.Path]::GetFullPath($Item.Path,$Root);Require (-not $Current.ContainsKey($Path) -or $Current[$Path] -eq $Item.Hash) 'Adjacent input conflict';$Current[$Path]=$Item.Hash}
foreach($Path in $Current.Keys){Require ((Get-FileHash -LiteralPath $Path).Hash -eq $Current[$Path]) 'Current source changed during stage'}
$Reference=Read-Json (Join-Path $Root '.cloudflow-runtime/batch-g-integration/9799534e1a3a47b5958330f14ae16dc7/state.json')
Require ($Reference.status -eq 'RUNNING' -and $Reference.processes.Count -eq 9 -and $Reference.services.Count -eq 6) 'Reference runtime differs'
foreach($Entry in $Reference.processes){$Observed=Get-CimInstance Win32_Process -Filter "ProcessId=$($Entry.id)";Require ($Observed -and $Observed.CommandLine.Contains($Entry.marker)) 'Reference process ownership changed'}
foreach($Service in $Reference.services){Require ((Invoke-RestMethod "http://127.0.0.1:$($Service.healthPort)/actuator/health" -TimeoutSec 10).status -eq 'UP') 'Reference health changed'}
Require ((Get-FileHash -LiteralPath $PSCommandPath).Hash -eq $ReportHash) 'Stage script changed'
[pscustomobject]@{passed=$true;backend='r116';frontend='r76';runtimeRound=$RuntimeRound;run=$Run;caseTag=$Review.caseTag;checks=$Actual.checks.Count;requests=$Actual.requests.Count;flags=$Flags;currentInputs=$Current.Count;executionOriginals=$OriginalCount;reviewedVerifierChanges=$Changes;reviewedImages=$Review.images;validationProcesses=$Review.observedProcesses.Count;referenceBusinessTables=27;referenceProcesses=9;referenceHealthyServices=6;captchaBefore=0;captchaAfter=$Privacy.counter;secretFiles=$Privacy.files;secretSamples=$Privacy.sensitiveValues;leaks=0;adjacentRound=$AdjacentRound;formalTables=374;oaAssertions=1012;resultHash=(Get-FileHash -LiteralPath $ActualFiles[0].FullName).Hash;reportHash=$ReportHash;productModified=$false;allH2Complete=$false;globalComplete=$false}|ConvertTo-Json -Depth 12|Set-Content -LiteralPath $Output -Encoding utf8NoBOM
"H2_CURRENT_ADVANCE_APPROVAL_STAGE: passed=true; checks=$($Actual.checks.Count); requests=$($Actual.requests.Count); current_inputs=$($Current.Count); originals=$OriginalCount; images=4; reference_healthy_services=6; global_complete=false"
