param([ValidatePattern('^r[1-9][0-9]*$')][string]$Round='r1',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$CompensationRound='r2')
$ErrorActionPreference='Stop'
. 'D:\CloudFlowPro\.cloudflow-runtime\use-data-drive.ps1'
$Root='D:\CloudFlowPro'
$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
$Output=Join-Path $Evidence "h2-all-acceptance-20261007-$Round.json"
if(Test-Path -LiteralPath $Output){throw 'Retain previous H2 acceptance evidence'}
function Require([bool]$Condition,[string]$Message){if(-not $Condition){throw $Message}}
function Read-Json([string]$File){Get-Content -LiteralPath $File -Raw|ConvertFrom-Json}
$ReportHash=(Get-FileHash -LiteralPath $PSCommandPath).Hash
$Groups=@'
[{"name":"overtime","file":"D:\\CloudFlowPro\\.cloudflow-runtime\\batch-g-integration\\9799534e1a3a47b5958330f14ae16dc7\\h2-overtime-results-1b86c88c549c.json","hash":"50DD4C99050095E3DC0E82977DB35A81B35D9CBEE1122D39E154BD321DE114A9","checks":2563,"requests":1378,"stage":"h2-current-overtime-shift-rollback-stage-20261007-r1.json","backend":"r115","frontend":"r75"},{"name":"settlement","file":"D:\\CloudFlowPro\\.cloudflow-runtime\\batch-g-integration\\c3bb5a8f05534703b1b60c357fa12756\\h2-settlement-referral-results-80778f97a3e3.json","hash":"4EDF8B139BDB0EF0B0ACE7B29D668F13C659AF2D733E35772063B78D72C42B73","checks":568,"requests":309,"stage":"h2-independent-repayment-stage-20261007-r1.json","backend":"r116","frontend":"r75"},{"name":"repayment","file":"D:\\CloudFlowPro\\.cloudflow-runtime\\batch-g-integration\\c3bb5a8f05534703b1b60c357fa12756\\h2-settlement-referral-repay-results-a30710b42181.json","hash":"C1501E30E26E0CAB4B136CCB73A77A52B6EE713D27F0B92FF64C2D57BB000ECB","checks":104,"requests":31,"stage":"h2-independent-repayment-stage-20261007-r1.json","backend":"r116","frontend":"r75"},{"name":"referral","file":"D:\\CloudFlowPro\\.cloudflow-runtime\\batch-g-integration\\6d36a6c22cfa4979bacaaa202741b1c8\\h2-referrals-core-results-3ee5b10bcc84.json","hash":"227DBAC55E7A6E37535132FD04C49B01F6B7265C450C4B0D0D7710C44FCA8D32","checks":87,"requests":90,"stage":"h2-current-referral-stage-20261007-r1.json","backend":"r116","frontend":"r76"},{"name":"skills","file":"D:\\CloudFlowPro\\.cloudflow-runtime\\batch-g-integration\\a081b89078a44300b6b1165796c761d6\\h2-skills-results-58587c7bca49.json","hash":"9921EB2E39771ABFEEE4C49A8E22915F1E46E52394255ADE0451D3E032F8B897","checks":78,"requests":64,"stage":"h2-current-skills-appraisals-stage-20261007-r1.json","backend":"r116","frontend":"r76"},{"name":"appraisals","file":"D:\\CloudFlowPro\\.cloudflow-runtime\\batch-g-integration\\afd20a4e07334fa188a04ec80dbb084e\\h2-appraisals-results-faf3d8fbc2a4.json","hash":"09AB7B172065496DC3924ED2C07FC6A979526EB92A3A265DC224ADF30F6771F5","checks":194,"requests":384,"stage":"h2-current-skills-appraisals-stage-20261007-r1.json","backend":"r116","frontend":"r76"},{"name":"asset","file":"D:\\CloudFlowPro\\.cloudflow-runtime\\batch-g-integration\\20e7d7c1979a4fdbadc93de34da2d920\\h2-settlement-draft-results-13c81f76b22e.json","hash":"F6944E33F5BE54784C529B95F3E10F74505CCC2948DAC3601CC5EC465FA3FAA2","checks":138,"requests":138,"stage":"h2-current-hr08-pages-stage-20261007-r1.json","backend":"r116","frontend":"r76"},{"name":"exit","file":"D:\\CloudFlowPro\\.cloudflow-runtime\\batch-g-integration\\863a8385132b48639ed1871f0112ed2f\\h2-exit-interviews-results-26dccb5b8f59.json","hash":"1F0DCFFB5BDE5FFC12275BD58084F7576A676030E363C007C61227ED9ACF2AB8","checks":56,"requests":52,"stage":"h2-current-hr08-pages-stage-20261007-r1.json","backend":"r116","frontend":"r76"},{"name":"advance","file":"D:\\CloudFlowPro\\.cloudflow-runtime\\batch-g-integration\\13a73f671d1f4af9838392a25bc53f4a\\h2-advance-approval-results-ecd3a3b8cca6.json","hash":"01FACA6FC0384D6460BBD1A86156D44E04C4D3ED09CC9B724AD1CB332F3F3BA2","checks":84,"requests":117,"stage":"h2-current-advance-approval-stage-20261007-r1.json","backend":"r116","frontend":"r76"}]
'@|ConvertFrom-Json
$Rows=@'
[{"ac":1,"suite":"overtime","flags":["calendar"],"checks":["实际日历与三倍标记决定类型"]},{"ac":2,"suite":"overtime","flags":["calendar"],"checks":["真实日历写入保留显式日期类型与三倍标记"]},{"ac":3,"suite":"overtime","flags":[],"checks":["两级真实同意后唯一60.03元工资来源结清"]},{"ac":4,"suite":"overtime","flags":["cumulative","approvalAndCompensatory"],"checks":["真实调休余额与台账一致","D调休请假两级审批记录完整且唯一","当前调休消费及专属配置恢复完整"]},{"ac":5,"suite":"overtime","flags":[],"checks":["等于设计日上限180分钟真实允许且按实际分钟占用","日上限超出一分钟WARN真实放行并记录单一警告","等于设计月上限600分钟真实允许且跨日跨类型累计","BLOCK真实阻止超过实际工时上限的提交"]},{"ac":6,"suite":"overtime","flags":["shifts","shiftSafety"],"checks":["两类调班故障均完成真实回滚重试并恢复诊断环境"]},{"ac":7,"suite":"overtime","flags":[],"checks":["旧出差批准后真实日考勤识别出差并消除迟到早退及缺勤标记","真实批准调休仍由原考勤计算识别请假"]},{"ac":8,"suite":"settlement","flags":[],"checks":["结算真实来源齐备"]},{"ac":9,"suite":"settlement","flags":[],"checks":["组合DAY假期只通过实际调整形成2.00余额","组合HOUR假期只通过实际调整形成4.00余额"]},{"ac":10,"suite":"asset","flags":["assetReminder","assetReview","assetDisposition"],"checks":["真实领用资产只形成零金额待核定来源","归还依据对应实际完成的OA处置记录"]},{"ac":11,"suite":"settlement","flags":[],"checks":["一万元工资按本单0.5分母及0.5固定补偿月数计算一万元补偿","取样计算保留真实政策文件和工资封存证据"]},{"ac":12,"suite":"settlement","flags":[],"checks":["实际核定形成所选正零负净额且来源齐备","确认保持原审批金额和方向"]},{"ac":13,"suite":"settlement","flags":[],"checks":["所有待办均为独立财务且排除提交人与离职本人","财务通过仍为待确认且无付款和来源入账","真实收付和资产处置完成后关闭且原金额不变"]},{"ac":14,"suite":"exit","flags":["uiComplete","http","restoration"],"checks":["面谈从真实离职申请取得员工并完整保存意见","确认后手机页面只读并保留附件"]},{"ac":15,"suite":"settlement","flags":[],"checks":["已确认结算禁止修改 HTTP=409","冲正草稿关联原单且全部明细为原入账金额相反数","冲正退回工资已扣50元并重建原工资预约"]},{"ac":16,"suite":"advance","flags":["approval","funding"],"checks":["首节点只有部门负责人，财务不能提前审核"]},{"ac":17,"suite":"settlement","flags":[],"checks":["实际本月工资预览只扣已放款借款的50元且未预约","工资预扣组合confirmed将50元工资扣还与50元结算应收分别计入"]},{"ac":18,"suite":"repayment","flags":[],"checks":["续付posted借款50元工资扣还与50元结算扣还共同结清","续付所有来源已入账且新增借款两条实际扣还"]},{"ac":19,"suite":"settlement","flags":[],"checks":["工资预扣组合calculated将50元工资扣还与50元结算应收分别计入","借款组合posted真实结算只入账一次"]},{"ac":20,"suite":"advance","flags":["rules","concurrency"],"checks":["未来加薪未提高当前借款上限"]},{"ac":21,"suite":"skills","flags":["definitions"],"checks":["员工只读技能目录返回真实五级定义","岗位页面真实更新要求等级与版本"]},{"ac":22,"suite":"skills","flags":["fiveSources","permissions"],"checks":["五类证据全部由真实业务接口产生"]},{"ac":23,"suite":"skills","flags":["expiry"],"checks":["真实结业自动提升至课程设定2级","真实考试批改自动提升3级","证书撤销后不恢复旧培训与考试"]},{"ac":24,"suite":"skills","flags":[],"checks":["岗位差距按未认证等级0计算","到期日期隔离输入使本人当前等级0且不恢复旧记录"]},{"ac":25,"suite":"skills","flags":["recommendations"],"checks":["已有报名权限的本人获得同技能足够等级课程推荐","同岗位普通员工无报名权限时仍不获得推荐"]},{"ac":26,"suite":"appraisals","flags":["scope","frozen"],"checks":["范围按部门岗位职级交集预览三人","调岗后冻结参评名单保持三人"]},{"ac":27,"suite":"appraisals","flags":["weights"],"checks":["父节点不能重复计分 HTTP=400 code=INVALID_PARAMETER","目标未下达不能评分 HTTP=400 code=APPRAISAL_INVALID_PARAMETER"]},{"ac":28,"suite":"appraisals","flags":["scores","allMethods"],"checks":["KRA_WEIGHTED从真实表计算精确为70","MIXED从真实表计算精确为66"]},{"ac":29,"suite":"appraisals","flags":["scores"],"checks":["目标50、自评0、两位同事平均80的公式总分精确为45","页面计算读取真实零分来源得到64分"]},{"ac":30,"suite":"appraisals","flags":[],"checks":["真实接口拒绝公式函数执行 HTTP=400 code=APPRAISAL_INVALID_PARAMETER"]},{"ac":31,"suite":"appraisals","flags":["stages","calibration","frozen"],"checks":["周期不能跨阶段 HTTP=400 code=APPRAISAL_INVALID_PARAMETER","强制分布不能用确认警告绕过 HTTP=409 code=APPRAISAL_DISTRIBUTION_FAILED","未结束的校准会议阻止完成 HTTP=400 code=INVALID_PARAMETER"]},{"ac":32,"suite":"appraisals","flags":["legacy","adjacentDeletion"],"checks":["旧绩效聚合仍为75且cycle_id保持为空","旧面谈创建修改确认后仍可读取真实结果"]},{"ac":33,"suite":"referral","flags":[],"checks":["本人推荐提交后只显示自身处理结果","私有简历不保存公共链接","本人私有简历下载内容一致且禁止缓存"]},{"ac":34,"suite":"referral","flags":[],"checks":["100字符姓名经推荐招聘员工账号逐字节完整保留","转换后联系方式仍完整且两个身份占位共用"]},{"ac":35,"suite":"referral","flags":[],"checks":["重复推荐持久保存且不泄露原候选人或推荐人","重复转换只保留同一个候选人"]},{"ac":36,"suite":"referral","flags":[],"checks":["两级实际审批只产生一条加密保存的核定奖金","奖金审计失败使整个发薪事务回滚","重复付款不产生第二笔奖金"]},{"ac":37,"suite":"referral","flags":[],"checks":["320像素本人页面显示实际已付奖金且无核定入口","手机直接打开人事推荐入口并重读原初筛结果"]}]
'@|ConvertFrom-Json
$Artifacts=@{};$Current=@{};$Old=@{}
function Track([string]$Path){
    $Resolved=[IO.Path]::GetFullPath($Path,$Root)
    $Hash=(Get-FileHash -LiteralPath $Resolved).Hash
    Require (-not $Artifacts.ContainsKey($Resolved) -or $Artifacts[$Resolved] -eq $Hash) 'Evidence changed while reading'
    $Artifacts[$Resolved]=$Hash
}
foreach($Build in @('backend-r114','frontend-r72','backend-r116','frontend-r76')){
    $File=Join-Path $Evidence "h3-portal-finance-20261002-$Build-inputs.json"
    Track $File
    foreach($Item in @(Read-Json $File)){
        $Path=[IO.Path]::GetFullPath($Item.Path,$Root)
        $Target=if($Build -in @('backend-r114','frontend-r72')){$Old}else{$Current}
        Require (-not $Target.ContainsKey($Path) -or $Target[$Path] -eq $Item.Hash) 'Conflicting product snapshots'
        $Target[$Path]=$Item.Hash
    }
}
Require ($Current.Count -eq 5319) 'Current product scope differs'
$ImpactDirectory=Join-Path $Evidence 'h2-current-product-impact-20261007-r1'
$Impact=Read-Json (Join-Path $ImpactDirectory 'result.json')
$Changes=@(Read-Json (Join-Path $ImpactDirectory 'product-changes.json'))
Track (Join-Path $ImpactDirectory 'result.json');Track (Join-Path $ImpactDirectory 'product-changes.json')
Require ($Impact.passed -and $Impact.changedFiles -eq 8 -and $Impact.addedFiles -eq 1 -and $Impact.removedFiles -eq 0 -and $Impact.existingMobileRoutesByteIdentical -and $Impact.titleOnlyWrapAndLineEnding -and $Impact.sharedHelpersAffectSkillsAppraisals) 'Product impact review incomplete'
$Changed=@($Current.Keys|Where-Object{-not $Old.ContainsKey($_) -or $Old[$_] -ne $Current[$_]})
Require ($Changed.Count -eq 8 -and $Changes.Count -eq 8 -and @($Old.Keys|Where-Object{-not $Current.ContainsKey($_)}).Count -eq 0 -and @($Changes|Where-Object Added).Count -eq 1) 'Product delta differs'
foreach($Change in $Changes){
    $Path=[IO.Path]::GetFullPath($Change.Path,$Root)
    Require ($Path -in $Changed -and $Current[$Path] -eq $Change.AfterHash) 'Reviewed product delta changed'
    Require ($(if($Change.Added){-not $Old.ContainsKey($Path)}else{$Old[$Path] -eq $Change.BeforeHash})) 'Prior product delta differs'
}
foreach($Item in $Impact.backendOriginals){Require ($Item.Reviewed -and (Get-FileHash -LiteralPath $Item.Original).Hash -eq $Item.Hash) 'Reviewed backend original changed';Track $Item.Original}
$Actual=@{};$SuiteEvidence=@()
foreach($Group in $Groups){
    Track $Group.file
    Require ($Artifacts[[IO.Path]::GetFullPath($Group.file)] -eq $Group.hash) 'Actual business result changed'
    $Result=Read-Json $Group.file
    Require ($Result.passed -and $Result.checks.Count -eq $Group.checks -and $Result.requests.Count -eq $Group.requests) 'Actual business scope differs'
    $StagePath=Join-Path $Evidence $Group.stage
    Track $StagePath
    $Stage=Read-Json $StagePath
    Require ($Stage.passed -and $Stage.backend -eq $Group.backend -and $Stage.frontend -eq $Group.frontend) 'Historical stage version differs'
    Require ((Get-Content -LiteralPath $StagePath -Raw).ToUpperInvariant().Contains($Group.hash)) 'Stage does not bind actual business result'
    $Actual[$Group.name]=$Result
    $SuiteEvidence+=[pscustomobject]@{suite=$Group.name;backend=$Group.backend;frontend=$Group.frontend;checks=$Group.checks;requests=$Group.requests;result=$Group.file;resultHash=$Group.hash;stage=$StagePath;stageHash=$Artifacts[[IO.Path]::GetFullPath($StagePath)]}
}
$CompensationDirectory=Join-Path $Evidence "h2-current-compensation-checks-20261007-$CompensationRound"
$Compensation=Read-Json (Join-Path $CompensationDirectory 'result.json')
Track (Join-Path $CompensationDirectory 'result.json')
Require ($Compensation.Passed -and $Compensation.BackendRound -eq 'r116' -and $Compensation.Modes.Count -eq 3 -and $Compensation.InputChanges -eq 0 -and $Compensation.SourceInputs -eq 3844 -and $Compensation.BinaryInputs -eq 2427 -and $Compensation.ReferenceHealthyServices -eq 6) 'Current compensation verification incomplete'
foreach($Mode in $Compensation.Modes){Require ($Mode.Passed -and $Mode.InputUnchanged -and (-not $Mode.Database -or $Mode.ScratchCleaned)) 'Compensation mode incomplete'}
foreach($Name in @('inputs.json','binary-inputs.json')){
    $File=Join-Path $CompensationDirectory $Name;Track $File
    foreach($Item in @(Read-Json $File)){
        $Path=[IO.Path]::GetFullPath($Item.Path,$Root)
        Require ((Get-FileHash -LiteralPath $Path).Hash -eq $Item.Hash) 'Current compensation source or dependency changed'
        Require (-not $Current.ContainsKey($Path) -or $Current[$Path] -eq $Item.Hash) 'Compensation input conflicts with product'
        $Current[$Path]=$Item.Hash
    }
}
foreach($Artifact in $Compensation.CalculationArtifacts){Require ((Get-FileHash -LiteralPath $Artifact.Path).Hash -eq $Artifact.Hash) 'Calculation artifact changed';Track $Artifact.Path}
$CalendarPath=Join-Path $Evidence 'd2-calendar-target-stage-20261007-r1.json'
$Calendar=Read-Json $CalendarPath;Track $CalendarPath
Require ($Calendar.Passed -and $Calendar.Backend -eq 'r116' -and $Calendar.DatabaseChecks -eq 386 -and -not $Calendar.OrdinaryPerformanceMet) 'Calendar correctness or remaining performance boundary differs'
$DatabasePath=Join-Path $Evidence 'h2-settlement-validation-run-20261006-r2/result.json'
$Database=Read-Json $DatabasePath;Track $DatabasePath
Require ($Database.Passed -and $Database.BackendRound -eq 'r114' -and $Database.Modes.Count -eq 8 -and $Database.InputChanges -eq 0) 'Settlement database supplement incomplete'
foreach($Mode in $Database.Modes){Require ($Mode.Passed -and $Mode.ScratchCleaned -and $Mode.InputUnchanged) 'Settlement database mode incomplete'}
$SkillPath=Join-Path $Evidence 'h2-skills-database-20261006-r4/result.json'
$Skill=Read-Json $SkillPath;Track $SkillPath
Require ($Skill.Passed -and $Skill.BackendRound -eq 'r114' -and $Skill.Checks -eq 135 -and $Skill.InputChanges -eq 0 -and $Skill.ScratchCleaned) 'Skill database supplement incomplete'
$FormulaPath=Join-Path $Evidence 'h2-appraisals-rules-20261006-r1/result.json'
$Formula=Read-Json $FormulaPath;Track $FormulaPath
Require ($Formula.passed -and $Formula.backend -eq 'r114' -and $Formula.checks -eq 66 -and $Formula.inputChanges -eq 0) 'Formula supplement incomplete'
$Prd=Join-Path $Root 'docs/prd/H2-HR-增强项合集-PRD.md'
Track $Prd
$PrdNumbers=@([regex]::Matches((Get-Content -LiteralPath $Prd -Raw),'(?m)^\| AC-(\d+) \|')|ForEach-Object{[int]$_.Groups[1].Value})
Require ($PrdNumbers.Count -eq 37 -and @($PrdNumbers|Sort-Object -Unique).Count -eq 37 -and $Rows.Count -eq 37 -and @($Rows.ac|Sort-Object -Unique).Count -eq 37) 'H2 acceptance numbers incomplete'
foreach($Row in $Rows){
    Require ($Row.ac -in $PrdNumbers -and $Actual.ContainsKey($Row.suite)) 'Unmapped acceptance item'
    foreach($Flag in $Row.flags){Require ($Actual[$Row.suite].evidence.$Flag -eq $true) 'Required actual business flag missing'}
    foreach($Check in $Row.checks){Require ($Actual[$Row.suite].checks -ccontains $Check) 'Required actual business assertion missing'}
    $Row|Add-Member -NotePropertyName passed -NotePropertyValue $true
}
$Adjacent=Join-Path $Evidence 'h3-portal-finance-adjacent-20261002-r161'
foreach($Name in @('summary.log','oa-database.log','menu.log','inputs.json')){Track (Join-Path $Adjacent $Name)}
Require ((Get-Content -LiteralPath (Join-Path $Adjacent 'summary.log') -Raw) -match 'H3_FINANCE_ADJACENT: files=6624; changed=0; exit=0; production_modified=false') 'Associated current regression incomplete'
foreach($Item in @(Read-Json (Join-Path $Adjacent 'inputs.json'))){
    $Path=[IO.Path]::GetFullPath($Item.Path,$Root)
    Require (-not $Current.ContainsKey($Path) -or $Current[$Path] -eq $Item.Hash) 'Associated input conflict'
    $Current[$Path]=$Item.Hash
}
foreach($Path in $Current.Keys){Require ((Get-FileHash -LiteralPath $Path).Hash -eq $Current[$Path]) 'Verified current input changed'}
$Reference=Read-Json (Join-Path $Root '.cloudflow-runtime/batch-g-integration/9799534e1a3a47b5958330f14ae16dc7/state.json')
Require ($Reference.status -eq 'RUNNING' -and $Reference.processes.Count -eq 9 -and $Reference.services.Count -eq 6) 'Reference runtime differs'
foreach($Entry in $Reference.processes){$Observed=Get-CimInstance Win32_Process -Filter "ProcessId=$($Entry.id)";Require ($Observed -and $Observed.CommandLine.Contains($Entry.marker)) 'Reference process ownership changed'}
foreach($Service in $Reference.services){Require ((Invoke-RestMethod "http://127.0.0.1:$($Service.healthPort)/actuator/health" -TimeoutSec 10).status -eq 'UP') 'Reference service unhealthy'}
foreach($Path in $Artifacts.Keys){Require ((Get-FileHash -LiteralPath $Path).Hash -eq $Artifacts[$Path]) 'Evidence changed during reconciliation'}
Require ((Get-FileHash -LiteralPath $PSCommandPath).Hash -eq $ReportHash) 'Acceptance script changed'
[pscustomobject]@{passed=$true;backend='r116';frontend='r76';acceptanceCount=37;items=$Rows;suites=$SuiteEvidence;currentInputs=$Current.Count;artifactHashes=$Artifacts;productImpact=$Impact;compensation=$Compensation;calendarDatabaseChecks=386;priorSettlementModes=8;priorSkillDatabaseChecks=135;priorFormulaChecks=66;adjacent='r161';referenceProcesses=9;referenceHealthyServices=6;reportHash=$ReportHash;actualSuiteCountsAreNotAdditive=$true;historicalResultsRetainOriginalVersions=$true;allH2Complete=$true;globalComplete=$false;remaining=@('D2 ordinary first request: 721.31ms exceeds 500ms','Current full-project 35 PRDs / 681 acceptance items','Approved deferred external integration')}|ConvertTo-Json -Depth 16|Set-Content -LiteralPath $Output -Encoding utf8NoBOM
"H2_ALL_ACCEPTANCE: passed=true; items=37; suites=$($Groups.Count); current_inputs=$($Current.Count); reference_healthy_services=6; all_h2_complete=true; global_complete=false"
