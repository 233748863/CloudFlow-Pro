param([ValidatePattern('^r[1-9][0-9]*$')][string]$Round='r1',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$ExitRound='r1',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$AssetRound='r2',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$AdjacentRound='r159')
$ErrorActionPreference='Stop'
. 'D:\CloudFlowPro\.cloudflow-runtime\use-data-drive.ps1'
$Root='D:\CloudFlowPro'
$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
$Output=Join-Path $Evidence "h2-current-hr08-pages-stage-20261007-$Round.json"
if(Test-Path -LiteralPath $Output){throw 'Retain original HR08 page stage'}
function Require([bool]$Condition,[string]$Message){if(-not $Condition){throw $Message}}
function Read-Json([string]$File){Get-Content -LiteralPath $File -Raw|ConvertFrom-Json}
$ReportHash=(Get-FileHash -LiteralPath $PSCommandPath).Hash
$Definitions=@(
    @{name='exit-interview';round=$ExitRound;category='h2-exit-interviews';tables=22;checks=56;requests=52;images=5;processes=8;captcha=3;secrets=24;flags=@('http','desktop','mobile','lostResponse','uiComplete','restoration')},
    @{name='asset-reminder';round=$AssetRound;category='h2-settlement-draft';tables=26;checks=138;requests=138;images=14;processes=9;captcha=4;secrets=22;flags=@('http','desktop','mobile','lostResponse','uiComplete','assetReminder','assetReminderRollback','assetReminderLostResponse','assetReview','assetDisposition','restoration')}
)
$Current=@{};$Historical=@();$Runs=@();$OriginalCount=0;$ImageCount=0
$Changes=@(Read-Json (Join-Path $Evidence 'h2-asset-reminder-current-prep-20261007-r1/changes.json'))
Require ($Changes.Count -eq 4) 'Four reviewed verifier extensions required'
$Allowed=@('scripts/run-h2-independent-settlement.ps1','scripts/verify-h2-independent-runtime.mjs','scripts/verify-hr-settlement-draft-real.mjs','scripts/verify-hr-settlement-asset-reminder-real.mjs')
foreach($Change in $Changes){
    Require ($Change.Path -cin $Allowed -and $Change.Reviewed -and $Change.Reason) 'Unreviewed historical execution change'
    Require ((Get-FileHash -LiteralPath $Change.Original).Hash -eq $Change.BeforeHash -and (Get-FileHash -LiteralPath (Join-Path $Root $Change.Path)).Hash -eq $Change.AfterHash) 'Reviewed verifier changed'
}
foreach($Definition in $Definitions){
    $Directory=Join-Path $Evidence "h2-independent-$($Definition.name)-20261007-$($Definition.round)"
    $Runtime=Read-Json (Join-Path $Directory 'launcher-result.json')
    Require ($Runtime.passed -and $Runtime.verifierExit -eq 0 -and $Runtime.backend -eq 'r116' -and $Runtime.frontend -eq 'r76' -and $Runtime.inputsUnchanged -and $Runtime.processesStopped -and $Runtime.referenceKept -and -not $Runtime.productModified -and -not $Runtime.globalComplete) 'Runtime incomplete'
    Require ($Runtime.referenceBusinessTables -eq $Definition.tables) 'Reference business scope differs'
    $Run=[IO.Path]::GetFullPath($Runtime.run)
    Require ((Split-Path -Parent $Run) -eq (Join-Path $Root '.cloudflow-runtime/batch-g-integration') -and (Split-Path -Leaf $Run) -match '^[a-f0-9]{32}$' -and (Split-Path -Leaf $Run) -ne '9799534e1a3a47b5958330f14ae16dc7') 'Independent ownership mismatch'
    $State=Read-Json (Join-Path $Run 'state.json')
    Require ($State.status -eq 'STOPPED' -and $State.processes.Count -eq 8 -and $State.services.Count -eq 6 -and $State.tables -eq 374) 'Independent runtime not stopped'
    foreach($Entry in $State.processes){$Observed=Get-CimInstance Win32_Process -Filter "ProcessId=$($Entry.id)";Require (-not $Observed -or -not $Observed.CommandLine.Contains($Entry.marker)) 'Independent process remains'}
    $ActualFiles=@(Get-ChildItem -LiteralPath $Run -File -Filter "$($Definition.category)-results-*.json")
    Require ($ActualFiles.Count -eq 1) 'One actual result required'
    $Actual=Read-Json $ActualFiles[0].FullName
    Require ($Actual.passed -and -not $Actual.failure -and $Actual.checks.Count -gt 0 -and $Actual.requests.Count -gt 0) 'Actual business result incomplete'
    Require ((Get-FileHash -LiteralPath $ActualFiles[0].FullName).Hash -eq (Get-FileHash -LiteralPath (Join-Path $Directory 'business-result.json')).Hash) 'Copied business result changed'
    foreach($Flag in $Definition.flags){Require ($Actual.evidence.$Flag -eq $true) "Missing business evidence: $Flag"}
    Require ($Actual.checks.Count -eq $Definition.checks -and $Actual.requests.Count -eq $Definition.requests) 'Actual business coverage differs'
    if($Definition.name -eq 'asset-reminder'){
        foreach($Label in @('手机重新进入仍读取原三次提醒和完整姓名','三次人工提醒均经真实消息链路进入收件员工站内消息','三个故障触发器全部清理','提醒全过程未改变结算金额、来源核定、审批状态和资产','真实无损失核定保留旧金额历史且最终扣款为零')){
            Require ($Actual.checks -contains $Label) 'Asset reminder critical assertion missing'
        }
    }
    $Before=Read-Json (Join-Path $Directory 'reference-business-before.json')
    $After=Read-Json (Join-Path $Directory 'reference-business-after.json')
    Require (@($Before.PSObject.Properties).Count -eq $Definition.tables -and @($After.PSObject.Properties).Count -eq $Definition.tables) 'Reference table count differs'
    foreach($Property in $Before.PSObject.Properties){Require ($After.($Property.Name) -eq $Property.Value) 'Original business changed'}
    $Privacy=Read-Json (Join-Path $Directory 'runtime-after.json')
    Require ($Privacy.passed -and $Privacy.counterBefore -eq 0 -and $Privacy.counter -eq $Definition.captcha -and $Privacy.persistentLimit -eq '100' -and $Privacy.cachedLimit -eq '"100"' -and $Privacy.cacheTtl -eq -1 -and $Privacy.counterWrites -eq 0 -and $Privacy.configurationWrites -eq 0 -and $Privacy.files -eq 20 -and $Privacy.sensitiveValues -eq $Definition.secrets -and $Privacy.leaks -eq 0 -and $Privacy.databaseLeaks -eq 0) 'Runtime privacy or default captcha changed'
    $Snapshot=@{}
    foreach($Name in @('inputs.json','runtime-inputs.json')){
        foreach($Item in @(Read-Json (Join-Path $Directory $Name))){
            $Path=[IO.Path]::GetFullPath($Item.Path,$Root)
            $Hash=(Get-FileHash -LiteralPath $Path).Hash
            if($Name -eq 'inputs.json'){$Snapshot[$Path]=$Item.Hash}
            if($Hash -ne $Item.Hash){
                $Relative=[IO.Path]::GetRelativePath($Root,$Path).Replace('\','/')
                $Change=@($Changes|Where-Object Path -CEQ $Relative)
                Require ($Definition.name -eq 'exit-interview' -and $Change.Count -eq 1 -and $Item.Hash -eq $Change[0].BeforeHash -and $Hash -eq $Change[0].AfterHash) 'Unreviewed input changed after execution'
                $Historical+=[pscustomobject]@{Path=$Relative;OriginalHash=$Item.Hash;CurrentHash=$Hash;Original=$Change[0].Original;Reason=$Change[0].Reason}
            }
            Require (-not $Current.ContainsKey($Path) -or $Current[$Path] -eq $Hash) 'Current input conflict'
            $Current[$Path]=$Hash
        }
    }
    $OriginalRoot=Join-Path $Directory 'originals'
    foreach($File in @(Get-ChildItem -LiteralPath $OriginalRoot -Recurse -File)){
        $Source=Join-Path $Root ([IO.Path]::GetRelativePath($OriginalRoot,$File.FullName))
        Require ($Snapshot.ContainsKey($Source) -and (Get-FileHash -LiteralPath $File.FullName).Hash -eq $Snapshot[$Source]) 'Execution original differs from snapshot'
        $OriginalCount++
    }
    $Review=Read-Json (Join-Path $Directory 'image-review.json')
    Require ($Review.passed -and $Review.manuallyViewed -and $Review.images.Count -eq $Definition.images -and $Review.observedProcesses.Count -eq $Definition.processes -and $Review.validationProcessesRemaining -eq 0) 'Actual image review incomplete'
    foreach($Image in $Review.images){Require ((Get-FileHash -LiteralPath $Image.Path).Hash -eq $Image.Hash) 'Reviewed image changed';$ImageCount++}
    foreach($Entry in $Review.observedProcesses){$Observed=Get-CimInstance Win32_Process -Filter "ProcessId=$($Entry.ProcessId)";Require (-not $Observed -or $Observed.CreationDate -ne [datetime]$Entry.CreationDate) 'Observed validation process remains'}
    $Runs+=[pscustomobject]@{name=$Definition.name;round=$Definition.round;run=$Run;caseTag=$Review.caseTag;checks=$Actual.checks.Count;requests=$Actual.requests.Count;flags=$Definition.flags;referenceTables=$Definition.tables;captchaBefore=0;captchaAfter=$Privacy.counter;secretFiles=$Privacy.files;secretSamples=$Privacy.sensitiveValues;reviewedImages=$Review.images;resultHash=(Get-FileHash -LiteralPath $ActualFiles[0].FullName).Hash}
}
Require ($Historical.Count -eq 4) 'Historical changes must remain explicit'
$FailedDirectory=Join-Path $Evidence 'h2-independent-asset-reminder-20261007-r1'
$FailedRuntime=Read-Json (Join-Path $FailedDirectory 'launcher-result.json')
$FailedBusiness=Read-Json (Join-Path $FailedDirectory 'business-result.json')
Require (-not $FailedRuntime.passed -and $FailedRuntime.verifierExit -eq 1 -and $FailedRuntime.inputsUnchanged -and $FailedRuntime.processesStopped -and $FailedRuntime.referenceKept -and $FailedRuntime.referenceBusinessTables -eq 26) 'Failed preflight closure incomplete'
Require (-not $FailedBusiness.passed -and $FailedBusiness.checks.Count -eq 9 -and $FailedBusiness.requests.Count -eq 0 -and $FailedBusiness.evidence.restoration -and $FailedBusiness.failure.message -match '100001:990000701') 'Original tenant-scope failure boundary differs'
$FailedRun=[IO.Path]::GetFullPath($FailedRuntime.run)
Require ((Split-Path -Parent $FailedRun) -eq (Join-Path $Root '.cloudflow-runtime/batch-g-integration') -and (Split-Path -Leaf $FailedRun) -eq '50ac5b9742b94a30823bba4148a85207') 'Failed run ownership differs'
$FailedState=Read-Json (Join-Path $FailedRun 'state.json')
Require ($FailedState.status -eq 'STOPPED' -and $FailedState.processes.Count -eq 8) 'Failed runtime not stopped'
foreach($Entry in $FailedState.processes){$Observed=Get-CimInstance Win32_Process -Filter "ProcessId=$($Entry.id)";Require (-not $Observed -or -not $Observed.CommandLine.Contains($Entry.marker)) 'Failed runtime process remains'}
$FailedBefore=Read-Json (Join-Path $FailedDirectory 'reference-business-before.json')
$FailedAfter=Read-Json (Join-Path $FailedDirectory 'reference-business-after.json')
Require (@($FailedBefore.PSObject.Properties).Count -eq 26) 'Failed round original business scope differs'
foreach($Property in $FailedBefore.PSObject.Properties){Require ($FailedAfter.($Property.Name) -eq $Property.Value) 'Failed round original business changed'}
$RetainedScan=Read-Json (Join-Path $FailedDirectory 'retained-secret-scan.json')
Require ($RetainedScan.passed -and $RetainedScan.files -eq 21 -and $RetainedScan.sensitiveValues -eq 19 -and $RetainedScan.leaks -eq 0 -and -not $RetainedScan.databaseAuditScanned -and -not $RetainedScan.businessPassed -and $RetainedScan.businessRequests -eq 0) 'Failed round retained log scan boundary differs'
$FailedSnapshot=@{};foreach($Item in @(Read-Json (Join-Path $FailedDirectory 'inputs.json'))){$FailedSnapshot[[IO.Path]::GetFullPath($Item.Path,$Root)]=$Item.Hash}
$FailedOriginals=0;$FailedOriginalRoot=Join-Path $FailedDirectory 'originals'
foreach($File in @(Get-ChildItem -LiteralPath $FailedOriginalRoot -Recurse -File)){
    $Source=Join-Path $Root ([IO.Path]::GetRelativePath($FailedOriginalRoot,$File.FullName))
    Require ($FailedSnapshot.ContainsKey($Source) -and (Get-FileHash -LiteralPath $File.FullName).Hash -eq $FailedSnapshot[$Source]) 'Failed execution original changed'
    $FailedOriginals++
}
$Adjacent=Join-Path $Evidence "h3-portal-finance-adjacent-20261002-$AdjacentRound"
$AdjacentLog=Get-Content -LiteralPath (Join-Path $Adjacent 'summary.log') -Raw
Require ($AdjacentLog -match 'H3_FINANCE_ADJACENT: files=\d+; changed=0; exit=0; production_modified=false' -and $AdjacentLog -match 'regenerated_matches_formal=true; formal_modified=false') 'Adjacent regression incomplete'
$Oa=Get-Content -LiteralPath (Join-Path $Adjacent 'oa-database.log') -Raw
Require ($Oa -match 'Complete approved schema table count; expected=374; actual=374' -and $Oa -match 'PASS: 1012 OA boundary assertions') 'Formal schema regression incomplete'
$Menu=Get-Content -LiteralPath (Join-Path $Adjacent 'menu.log') -Raw
Require ($Menu -match 'EMPLOYEE_UNEXPECTED_GRANTS=0; EMPLOYEE_UNEXPECTED_WRITE_PERMISSIONS=0' -and $Menu -match 'APPROVED_MENU_SCOPE_PASS=true') 'Menu scope regression incomplete'
foreach($Item in @(Read-Json (Join-Path $Adjacent 'inputs.json'))){$Path=[IO.Path]::GetFullPath($Item.Path,$Root);Require (-not $Current.ContainsKey($Path) -or $Current[$Path] -eq $Item.Hash) 'Adjacent input differs';$Current[$Path]=$Item.Hash}
foreach($Path in $Current.Keys){Require ((Get-FileHash -LiteralPath $Path).Hash -eq $Current[$Path]) 'Current source changed during stage'}
$Reference=Read-Json (Join-Path $Root '.cloudflow-runtime/batch-g-integration/9799534e1a3a47b5958330f14ae16dc7/state.json')
Require ($Reference.status -eq 'RUNNING' -and $Reference.processes.Count -eq 9 -and $Reference.services.Count -eq 6) 'Reference runtime changed'
foreach($Entry in $Reference.processes){$Observed=Get-CimInstance Win32_Process -Filter "ProcessId=$($Entry.id)";Require ($Observed -and $Observed.CommandLine.Contains($Entry.marker)) 'Reference ownership changed'}
foreach($Service in $Reference.services){Require ((Invoke-RestMethod "http://127.0.0.1:$($Service.healthPort)/actuator/health" -TimeoutSec 10).status -eq 'UP') 'Reference health changed'}
Require ((Get-FileHash -LiteralPath $PSCommandPath).Hash -eq $ReportHash) 'Stage script changed'
[pscustomobject]@{passed=$true;backend='r116';frontend='r76';runs=$Runs;currentInputs=$Current.Count;executionOriginals=$OriginalCount;historicalVerifierExtensions=$Historical;failedPreflight=[pscustomobject]@{checks=9;requests=0;closed=$true;referenceTables=26;executionOriginals=$FailedOriginals;retainedSecretFiles=21;retainedSecretSamples=19;leaks=0;databaseAuditScanned=$false};reviewedImages=$ImageCount;referenceProcesses=9;referenceHealthyServices=6;adjacentRound=$AdjacentRound;formalTables=374;oaAssertions=1012;reportHash=$ReportHash;productModified=$false;allH2Complete=$false;globalComplete=$false}|ConvertTo-Json -Depth 12|Set-Content -LiteralPath $Output -Encoding utf8NoBOM
"H2_CURRENT_HR08_PAGES_STAGE: passed=true; current_inputs=$($Current.Count); originals=$OriginalCount; images=$ImageCount; suites=2; reference_healthy_services=6; global_complete=false"
