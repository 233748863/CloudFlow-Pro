param([ValidatePattern('^r[1-9][0-9]*$')][string]$Round='r1',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$RuntimeRound='r2',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$IdentityRound='r1',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$AdjacentRound='r158')
$ErrorActionPreference='Stop'
. 'D:\CloudFlowPro\.cloudflow-runtime\use-data-drive.ps1'
$Root='D:\CloudFlowPro'
$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
$Directory=Join-Path $Evidence "h2-independent-referral-20261007-$RuntimeRound"
$Output=Join-Path $Evidence "h2-current-referral-stage-20261007-$Round.json"
if(Test-Path -LiteralPath $Output){throw 'Retain previous referral stage'}
function Require([bool]$Condition,[string]$Message){if(-not $Condition){throw $Message}}
function Read-Json([string]$File){Get-Content -LiteralPath $File -Raw|ConvertFrom-Json}
$ReportHash=(Get-FileHash -LiteralPath $PSCommandPath).Hash
$Runtime=Read-Json (Join-Path $Directory 'launcher-result.json')
Require ($Runtime.passed -and $Runtime.verifierExit -eq 0 -and $Runtime.backend -eq 'r116' -and $Runtime.frontend -eq 'r76' -and $Runtime.referralOnly -and $Runtime.processesStopped -and $Runtime.referenceKept -and $Runtime.inputsUnchanged -and -not $Runtime.productModified -and -not $Runtime.globalComplete) 'Independent referral runtime incomplete'
$Run=[IO.Path]::GetFullPath($Runtime.run)
Require ((Split-Path -Parent $Run) -eq (Join-Path $Root '.cloudflow-runtime/batch-g-integration') -and (Split-Path -Leaf $Run) -match '^[a-f0-9]{32}$' -and (Split-Path -Leaf $Run) -ne '9799534e1a3a47b5958330f14ae16dc7') 'Independent referral ownership mismatch'
$ActualFiles=@(Get-ChildItem -LiteralPath $Run -File -Filter 'h2-referrals-core-results-*.json')
Require ($ActualFiles.Count -eq 1) 'One original referral result required'
$Actual=Read-Json $ActualFiles[0].FullName
Require ($Actual.passed -and $Actual.checks.Count -eq 87 -and $Actual.requests.Count -eq 90 -and -not $Actual.failure -and $Actual.caseTag -match '^[a-f0-9]{12}$') 'Actual referral result incomplete'
Require ((Get-FileHash -LiteralPath $ActualFiles[0].FullName).Hash -eq (Get-FileHash -LiteralPath (Join-Path $Directory 'business-result.json')).Hash) 'Copied result differs from original'
foreach($Label in @('101字符推荐姓名明确拒绝且不产生推荐或占位','普通文件编号入口明确禁止读取内推简历','普通文件路径入口明确禁止读取内推简历','重复推荐不留下联系方式占用','重复转换只保留同一个候选人','100字符姓名经推荐招聘员工账号逐字节完整保留','推荐联系方式经招聘与实际建号后逐字节完整保留','人事在手机页面实际提交奖金审批','两级实际审批只产生一条加密保存的核定奖金','奖金审计失败使整个发薪事务回滚','并发发薪至少一次成功并实际更新奖金已付','重复付款不产生第二笔奖金','320像素本人页面显示实际已付奖金且无核定入口','手机直接打开人事推荐入口并重读原初筛结果','内推核验未改变授权配置')){
    Require ($Actual.checks -contains $Label) 'Critical referral assertion missing'
}
$OriginalCount=0;$Histories=@()
foreach($PriorRound in @('r1',$RuntimeRound)){
    $Prior=Join-Path $Evidence "h2-independent-referral-20261007-$PriorRound"
    $PriorRuntime=Read-Json (Join-Path $Prior 'launcher-result.json')
    $PriorRun=[IO.Path]::GetFullPath($PriorRuntime.run)
    Require ((Split-Path -Parent $PriorRun) -eq (Join-Path $Root '.cloudflow-runtime/batch-g-integration') -and (Split-Path -Leaf $PriorRun) -match '^[a-f0-9]{32}$') 'Prior run ownership mismatch'
    $State=Read-Json (Join-Path $PriorRun 'state.json')
    Require ($State.status -eq 'STOPPED' -and $State.processes.Count -eq 8 -and $State.services.Count -eq 6 -and $State.tables -eq 374) 'Independent runtime not stopped'
    foreach($Entry in $State.processes){$Observed=Get-CimInstance Win32_Process -Filter "ProcessId=$($Entry.id)";Require (-not $Observed -or -not $Observed.CommandLine.Contains($Entry.marker)) 'Independent process remains'}
    Require ($PriorRuntime.inputsUnchanged -and $PriorRuntime.processesStopped -and $PriorRuntime.referenceKept -and $PriorRuntime.referenceBusinessTables -eq 23) 'Prior preservation incomplete'
    $Before=Read-Json (Join-Path $Prior 'reference-business-before.json')
    $After=Read-Json (Join-Path $Prior 'reference-business-after.json')
    Require (@($Before.PSObject.Properties).Count -eq 23 -and @($After.PSObject.Properties).Count -eq 23) 'Reference protection incomplete'
    foreach($Property in $Before.PSObject.Properties){Require ($After.($Property.Name) -eq $Property.Value) 'Reference business changed'}
    $Privacy=Read-Json (Join-Path $Prior 'runtime-after.json')
    Require ($Privacy.passed -and $Privacy.counterBefore -eq 0 -and $Privacy.counter -eq 8 -and $Privacy.persistentLimit -eq '100' -and $Privacy.cachedLimit -eq '"100"' -and $Privacy.cacheTtl -eq -1 -and $Privacy.counterWrites -eq 0 -and $Privacy.configurationWrites -eq 0 -and $Privacy.files -eq 20 -and $Privacy.sensitiveValues -eq 27 -and $Privacy.leaks -eq 0 -and $Privacy.databaseLeaks -eq 0) 'Runtime privacy or captcha preservation failed'
    $PriorResult=Read-Json (Join-Path $Prior 'business-result.json')
    $JournalFile=Join-Path $PriorRun "private/referral-recovery-$($PriorResult.caseTag).jsonl"
    $Journal=@(Get-Content -LiteralPath $JournalFile|ForEach-Object{$_|ConvertFrom-Json})
    foreach($Event in @('config-original','config-restored','credential-original','credential-restored')){
        $Expected=if($Event.StartsWith('config-')){2}else{1}
        Require (@($Journal|Where-Object event -EQ $Event).Count -eq $Expected) 'Private restoration journal incomplete'
    }
    $Log=Get-Content -LiteralPath (Join-Path $Prior 'live.log') -Raw
    Require ($Log -match 'H2_REFERRAL_COMPLETION_CLEANUP: configuration_restored=true;' -and $Log -match 'H2_REFERRAL_HTTP_CLEANUP:') 'Business cleanup missing'
    $Snapshot=@{};foreach($Item in @(Read-Json (Join-Path $Prior 'inputs.json'))){$Snapshot[[IO.Path]::GetFullPath($Item.Path,$Root)]=$Item.Hash}
    $OriginalRoot=Join-Path $Prior 'originals'
    foreach($OriginalFile in @(Get-ChildItem -LiteralPath $OriginalRoot -Recurse -File)){
        $Source=Join-Path $Root ([IO.Path]::GetRelativePath($OriginalRoot,$OriginalFile.FullName))
        Require ($Snapshot.ContainsKey($Source) -and (Get-FileHash -LiteralPath $OriginalFile.FullName).Hash -eq $Snapshot[$Source]) 'Original differs from execution snapshot'
        $OriginalCount++
    }
    if($PriorRound -eq 'r1'){
        Require (-not $PriorResult.passed -and $PriorRuntime.verifierExit -eq 1 -and $PriorRuntime.frontend -eq 'r75' -and $PriorResult.checks.Count -eq 79 -and $PriorResult.requests.Count -eq 90 -and $PriorResult.failure -match '奖金已随工资发放') 'Original mobile failure boundary differs'
    }
    $Histories+=[pscustomobject]@{round=$PriorRound;passed=$PriorResult.passed;checks=$PriorResult.checks.Count;requests=$PriorResult.requests.Count;caseTag=$PriorResult.caseTag;processesStopped=8;referenceTables=23;captchaBefore=0;captchaAfter=8;secretFiles=20;secretSamples=27;leaks=0;restorationHash=(Get-FileHash -LiteralPath $JournalFile).Hash}
}
$IdentityDirectory=Join-Path $Evidence "h2-referral-identity-current-20261007-$IdentityRound"
$Identity=Read-Json (Join-Path $IdentityDirectory 'result.json')
Require ($Identity.passed -and $Identity.verifierExit -eq 0 -and $Identity.backend -eq 'r116' -and $Identity.checks -eq 125 -and $Identity.inputsUnchanged -and $Identity.scratchCleaned -and $Identity.formalTables -eq 374 -and -not $Identity.http -and $Identity.concurrentWriters -eq 2 -and $Identity.offerDecisionScenarios -eq 6) 'Current identity verification incomplete'
$IdentityLog=Get-Content -LiteralPath (Join-Path $IdentityDirectory 'database.log') -Raw
Require ($IdentityLog -match 'H2_OFFER_DECISIONS: scenarios=6; checks=70; failed=0; actual_mapper=true; real_mysql=true; actual_http=false') 'Six offer decision scenarios missing'
$Adjacent=Join-Path $Evidence "h3-portal-finance-adjacent-20261002-$AdjacentRound"
$AdjacentLog=Get-Content -LiteralPath (Join-Path $Adjacent 'summary.log') -Raw
Require ($AdjacentLog -match 'H3_FINANCE_ADJACENT: files=\d+; changed=0; exit=0; production_modified=false' -and $AdjacentLog -match 'regenerated_matches_formal=true; formal_modified=false') 'Adjacent regression incomplete'
$Oa=Get-Content -LiteralPath (Join-Path $Adjacent 'oa-database.log') -Raw
Require ($Oa -match 'Complete approved schema table count; expected=374; actual=374' -and $Oa -match 'PASS: 1012 OA boundary assertions') 'Formal schema regression incomplete'
$Menu=Get-Content -LiteralPath (Join-Path $Adjacent 'menu.log') -Raw
Require ($Menu -match 'EMPLOYEE_UNEXPECTED_GRANTS=0; EMPLOYEE_UNEXPECTED_WRITE_PERMISSIONS=0' -and $Menu -match 'APPROVED_MENU_SCOPE_PASS=true') 'Menu scope regression incomplete'
$Inputs=@{}
foreach($File in @((Join-Path $Directory 'inputs.json'),(Join-Path $Directory 'runtime-inputs.json'),(Join-Path $IdentityDirectory 'inputs.json'),(Join-Path $IdentityDirectory 'binary-inputs.json'),(Join-Path $Adjacent 'inputs.json'))){
    foreach($Item in @(Read-Json $File)){
        $Path=[IO.Path]::GetFullPath($Item.Path,$Root)
        Require ([IO.Path]::GetPathRoot($Path) -eq 'D:\') 'Input outside data drive'
        Require (-not $Inputs.ContainsKey($Path) -or $Inputs[$Path] -eq $Item.Hash) 'Input snapshots conflict'
        $Inputs[$Path]=$Item.Hash
    }
}
foreach($File in $Inputs.Keys){Require ((Get-FileHash -LiteralPath $File).Hash -eq $Inputs[$File]) 'Current input changed'}
$PreviousFrontend=@{};foreach($Item in @(Read-Json (Join-Path $Evidence 'h3-portal-finance-20261002-frontend-r75-inputs.json'))){$PreviousFrontend[$Item.Path]=$Item.Hash}
$CurrentFrontend=@(Read-Json (Join-Path $Evidence 'h3-portal-finance-20261002-frontend-r76-inputs.json'))
Require ($CurrentFrontend.Count -eq $PreviousFrontend.Count) 'Unexpected frontend added or removed input'
$Changed=@($CurrentFrontend|Where-Object{-not $PreviousFrontend.ContainsKey($_.Path) -or $PreviousFrontend[$_.Path] -ne $_.Hash})
Require ($Changed.Count -eq 1 -and $Changed[0].Path.Replace('\','/') -eq 'cloudflow-frontend/src/router.tsx') 'Unexpected frontend product change'
$OldRouter=Join-Path $Evidence 'h2-referral-current-prep-20261007-r2/originals/router-f75.tsx'
Require ((Get-FileHash -LiteralPath $OldRouter).Hash -eq $PreviousFrontend[$Changed[0].Path]) 'Original mobile router mismatch'
$CurrentRouter=Get-Content -LiteralPath (Join-Path $Root $Changed[0].Path) -Raw
$RoutePattern="(?m)^          \{\r?\n            path: '/hr/(?:ess/)?referrals',\r?\n            element: guarded\(<DynamicMenuRoute />, \['hr:referral:(?:list|own)'\]\),\r?\n          \},\r?\n"
Require ([regex]::Matches($CurrentRouter,$RoutePattern).Count -eq 2 -and [regex]::Replace($CurrentRouter,$RoutePattern,'').Replace("\r\n","\n") -ceq (Get-Content -LiteralPath $OldRouter -Raw).Replace("\r\n","\n")) 'Mobile routes exceed approved entry repair'
$Review=Read-Json (Join-Path $Directory 'image-review.json')
Require ($Review.passed -and $Review.manuallyViewed -and $Review.caseTag -eq $Actual.caseTag -and $Review.images.Count -eq 9 -and $Review.validationProcessesRemaining -eq 0) 'Manual desktop and mobile review incomplete'
foreach($Image in $Review.images){Require ((Get-FileHash -LiteralPath $Image.Path).Hash -eq $Image.Hash) 'Reviewed image changed'}
foreach($Entry in $Review.observedProcesses){
    $Observed=Get-CimInstance Win32_Process -Filter "ProcessId=$($Entry.ProcessId)"
    Require (-not $Observed -or $Observed.CreationDate -ne [datetime]$Entry.CreationDate) 'Observed validation process remains'
}
$Reference=Read-Json (Join-Path $Root '.cloudflow-runtime/batch-g-integration/9799534e1a3a47b5958330f14ae16dc7/state.json')
Require ($Reference.status -eq 'RUNNING' -and $Reference.processes.Count -eq 9 -and $Reference.services.Count -eq 6) 'Reference runtime changed'
foreach($Entry in $Reference.processes){$Observed=Get-CimInstance Win32_Process -Filter "ProcessId=$($Entry.id)";Require ($Observed -and $Observed.CommandLine.Contains($Entry.marker)) 'Reference process ownership changed'}
foreach($Service in $Reference.services){Require ((Invoke-RestMethod "http://127.0.0.1:$($Service.healthPort)/actuator/health" -TimeoutSec 10).status -eq 'UP') 'Reference service unhealthy'}
Require ((Get-FileHash -LiteralPath $PSCommandPath).Hash -eq $ReportHash) 'Stage source changed'
$Summary=[pscustomobject]@{passed=$true;backend='r116';frontend='r76';caseTag=$Actual.caseTag;actualChecks=$Actual.checks.Count;actualRequests=$Actual.requests.Count;
    identityChecks=125;identityHttp=$false;offerDecisionScenarios=6;offerDecisionChecks=70;currentInputs=$Inputs.Count;executionOriginals=$OriginalCount;
    independentRun=$Run;independentProcessesStopped=8;referenceProcesses=9;referenceHealthyServices=6;referenceBusinessTables=23;originalBusinessPreserved=$true;
    histories=$Histories;reviewedImages=$Review.images;captchaLimit=100;captchaCounterWrites=0;captchaConfigurationWrites=0;identityScratchCleaned=$true;
    changedProduct=@($Changed.Path);adjacentRound=$AdjacentRound;formalTables=374;oaAssertions=1012;actualResultHash=(Get-FileHash -LiteralPath $ActualFiles[0].FullName).Hash;
    reportHash=$ReportHash;allH2Complete=$false;globalComplete=$false;remaining=@('H2 all 37 acceptance items current unification','D2 ordinary first request below 500ms and all 17 items','Global35PRD681 and external integration')}
$Summary|ConvertTo-Json -Depth 12|Set-Content -LiteralPath $Output -Encoding utf8NoBOM
"H2_CURRENT_REFERRAL_STAGE: passed=true; actual_checks=87; actual_requests=90; identity_checks=125; current_inputs=$($Inputs.Count); originals=$OriginalCount; images=9; reference_healthy_services=6; global_complete=false"
