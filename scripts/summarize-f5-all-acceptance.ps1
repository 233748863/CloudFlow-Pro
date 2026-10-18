param(
    [Parameter(Mandatory=$true)][ValidatePattern('^r[1-9][0-9]*$')][string]$Round,
    [Parameter(Mandatory=$true)][ValidatePattern('^r[1-9][0-9]*$')][string]$BackendRound,
    [Parameter(Mandatory=$true)][ValidatePattern('^r[1-9][0-9]*$')][string]$FrontendRound,
    [Parameter(Mandatory=$true)][ValidatePattern('^r[1-9][0-9]*$')][string]$PackageRound,
    [Parameter(Mandatory=$true)][ValidatePattern('^r[1-9][0-9]*$')][string]$DatabaseRound,
    [Parameter(Mandatory=$true)][ValidatePattern('^r[1-9][0-9]*$')][string]$SupplierDatabaseRound,
    [Parameter(Mandatory=$true)][ValidatePattern('^r[1-9][0-9]*$')][string]$IndependentRound,
    [Parameter(Mandatory=$true)][string]$ImageReviewPath,
    [Parameter(Mandatory=$true)][string]$TerminalReceiptsPath)
$ErrorActionPreference='Stop'
. 'D:\CloudFlowPro\.cloudflow-runtime\use-data-drive.ps1'
$Root='D:\CloudFlowPro'
$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
$Output=Join-Path $Evidence "f5-all-acceptance-20261015-$Round"
if(Test-Path -LiteralPath $Output){throw 'Retain original F5 acceptance evidence; choose a new round'}
[IO.Directory]::CreateDirectory($Output)|Out-Null
[IO.File]::Copy($PSCommandPath,(Join-Path $Output 'original.ps1'),$false)
$Inputs=@{}
function Require([bool]$Condition,[string]$Message){if(-not $Condition){throw $Message}}
function Track([string]$File,[string]$Expected=''){
    $Path=[IO.Path]::GetFullPath($File,$Root)
    Require ($Path.StartsWith($Root+'\',[StringComparison]::OrdinalIgnoreCase) -or $Path.StartsWith('D:\CloudFlowProCache\',[StringComparison]::OrdinalIgnoreCase)) 'F5 evidence outside workspace/cache'
    Require (-not ((Get-Item -LiteralPath $Path).Attributes -band [IO.FileAttributes]::ReparsePoint)) 'Redirected F5 evidence rejected'
    if(-not $Inputs.ContainsKey($Path)){$Inputs[$Path]=(Get-FileHash -LiteralPath $Path).Hash}
    if($Expected){Require ($Inputs[$Path] -eq $Expected) ("F5 recorded input differs: "+$Path)}
    return $Path
}
function Json([string]$File){Get-Content -LiteralPath (Track $File) -Raw|ConvertFrom-Json -Depth 100}
function Manifest([string]$File){
    $Entries=@(Json $File)
    foreach($Entry in $Entries){$null=Track $Entry.Path $Entry.Hash}
    return $Entries.Count
}
foreach($Build in @(@{Kind='backend';Phase='Backend';Round=$BackendRound},@{Kind='frontend';Phase='Frontend';Round=$FrontendRound})){
    $Prefix=Join-Path $Evidence "h3-portal-finance-20261002-$($Build.Kind)-$($Build.Round)"
    $Count=Manifest ($Prefix+'-inputs.json')
    $Log=Get-Content -LiteralPath (Track ($Prefix+'.log')) -Raw
    Require ($Log.Contains("FINANCE_BUILD: phase=$($Build.Phase); files=$Count; changed=0; exit=0")) 'Original successful F5 build result missing'
}
$PackageDirectory=Join-Path $Evidence "backend-executable-verification-20261006-$PackageRound"
$Packages=Json (Join-Path $PackageDirectory 'result.json')
Require ($Packages.Passed -and $Packages.BackendRound -eq $BackendRound -and $Packages.InputChanges -eq 0 -and $Packages.Services.Count -eq 6) 'Current F5 packages not verified'
$null=Manifest (Join-Path $PackageDirectory 'inputs.json')
foreach($Package in $Packages.Services){
    $Built=Track $Package.Path $Package.Hash
    $null=Track (Join-Path $PackageDirectory "$($Package.Name)/$(Split-Path -Leaf $Built)") $Package.Hash
}
$DatabaseDirectory=Join-Path $Evidence "f5-rfq-checks-20261015-$DatabaseRound"
$Database=Json (Join-Path $DatabaseDirectory 'result.json')
$DatabaseBusiness=Json (Join-Path $DatabaseDirectory 'business-result.json')
Require ($Database.passed -and $Database.inputsUnchanged -and $Database.backend -eq $BackendRound -and $Database.actualDatabase) 'Current F5 database execution did not pass'
Require ($DatabaseBusiness.passed -and $DatabaseBusiness.actualDatabase -and $DatabaseBusiness.productionTenantPlugins -and $DatabaseBusiness.startupAuditVerifier -and $DatabaseBusiness.sourcePurchaseConversionVerified -and $DatabaseBusiness.assertions -gt 0 -and $DatabaseBusiness.scenarios.Count -eq 9 -and @($DatabaseBusiness.scenarios|Where-Object passed -NE $true).Count -eq 0) 'F5 nine actual database scenarios, source purchase conversion or startup audit verification are incomplete'
$DatabaseLog=Get-Content -LiteralPath (Track (Join-Path $DatabaseDirectory 'live.log')) -Raw
Require ($DatabaseLog.Contains("F5_RFQ_DATABASE: passed=true; assertions=$($DatabaseBusiness.assertions); scenarios=9")) 'Original F5 database terminal summary missing'
$DatabaseInputs=Manifest (Join-Path $DatabaseDirectory 'inputs.json')
$SupplierDirectory=Join-Path $Evidence "f2-supplier-checks-20261012-$SupplierDatabaseRound"
$SupplierDatabase=Json (Join-Path $SupplierDirectory 'result.json')
$SupplierBusiness=Json (Join-Path $SupplierDirectory 'business-result.json')
Require ($SupplierDatabase.passed -and $SupplierDatabase.inputsUnchanged -and $SupplierDatabase.backend -eq $BackendRound -and $SupplierDatabase.actualDatabase) 'Supplier admission regression on the current backend failed'
Require ($SupplierBusiness.passed -and $SupplierBusiness.actualDatabase -and $SupplierBusiness.scenarios.Count -eq 8 -and @($SupplierBusiness.scenarios|Where-Object passed -NE $true).Count -eq 0) 'Supplier actual database regression scenarios incomplete'
$SupplierInputs=Manifest (Join-Path $SupplierDirectory 'inputs.json')
$null=Track (Join-Path $SupplierDirectory 'live.log')
$IndependentDirectory=Join-Path $Evidence "f5-rfq-independent-20261015-$IndependentRound"
$Launcher=Json (Join-Path $IndependentDirectory 'launcher-result.json')
$Business=Json (Join-Path $IndependentDirectory 'result.json')
$Original=Json (Join-Path $IndependentDirectory 'original-business-result.json')
Require ($Launcher.passed -and $Launcher.verifierExit -eq 0 -and $Launcher.inputsUnchanged -and $Launcher.processesStopped -and $Launcher.referenceKept) 'F5 original execution or preservation failed'
Require ($Launcher.backend -eq $BackendRound -and $Launcher.frontend -eq $FrontendRound -and $Launcher.scenario -eq 'RfqComparison') 'F5 independent version mismatch'
Require ($Business.passed -and $Business.verifierExit -eq 0 -and $Original.passed -and -not $Original.failure) 'F5 original HTTP checks did not complete'
Require ($Business.backend -eq $BackendRound -and $Business.frontend -eq $FrontendRound -and $Business.scenario -eq 'RfqComparison' -and $Business.backendHttp -and -not $Business.apiDoubles) 'F5 original application evidence differs'
$null=Track $Business.sourceResult $Business.sourceResultHash
$null=Track (Join-Path $IndependentDirectory 'original-business-result.json') $Business.sourceResultHash
$IndependentInputs=Manifest (Join-Path $IndependentDirectory 'inputs.json')
$RuntimeInputs=Manifest (Join-Path $IndependentDirectory 'runtime-inputs.json')
$Protection=Json (Join-Path $IndependentDirectory 'runtime-after.json')
Require ($Protection.passed -and $Protection.leaks -eq 0 -and $Protection.databaseLeaks -eq 0 -and $Protection.counterWrites -eq 0 -and $Protection.configurationWrites -eq 0) 'F5 runtime/log protection failed'
Require (-not $Launcher.priorRuntimeWritten -and -not $Launcher.externalMessagesSent -and -not $Launcher.systemClockChanged -and $Launcher.captchaCounterWrites -eq 0 -and $Launcher.captchaConfigurationWrites -eq 0) 'F5 isolated verification boundary changed'
$RequiredFlags=@{
    1=@('creation','selection');2=@('invitations','mail','selection');3=@('admission','awardRevalidation')
    4=@('watch','warningUi');5=@('minimum','warningUi');6=@('quotations','precision','quotationUi')
    7=@('comparison','precision');8=@('scores','comparison')
    9=@('comparisonViews','desktop','mobile','mobileNarrow');10=@('export','exportContents')
    11=@('award','awardUi');12=@('award','purchase','awardRevalidation','awardUi');13=@('restart')
    14=@('mail');15=@('deadlines');16=@('confidentiality','permissions');17=@('permissions','comparison')
    18=@('mailPrivacy');19=@('audit');20=@('reports','reportUi','desktop','mobile','mobileNarrow')
}
$Items=@(foreach($Id in 1..20){
    foreach($Flag in $RequiredFlags[$Id]){
        Require ($Original.evidence.$Flag -eq $true -and $Business.sourceEvidence.$Flag -eq $true) ("Actual F5 acceptance flag missing: AC-$Id/$Flag")
    }
    $Checks=@($Original.checks|Where-Object{$_ -match '^AC-([0-9]+(?:/[0-9]+)*)(?:\s|/FR-)' -and $Matches[1].Split('/') -contains [string]$Id})
    Require ($Checks.Count -gt 0) ("Actual F5 assertion missing: AC-$Id")
    [pscustomobject]@{Acceptance="AC-$Id";Passed=$true;Flags=$RequiredFlags[$Id];ActualAssertions=$Checks}
})
$UiObservations=@(Json (Join-Path $Launcher.run ('f5-ui-observations-'+$Original.caseTag+'.json')))
Require ($UiObservations.Count -gt 0 -and @($UiObservations|Where-Object passed -NE $true).Count -eq 0) 'F5 actual page observations are incomplete'
foreach($Screen in @('desktop','mobile','mobileNarrow')){
    foreach($Row in 1..2){
        foreach($Label in @('未税单价','折扣比例','税率','明细交付天数','品牌','型号')){
            Require (@($UiObservations|Where-Object name -EQ "AC-6 $($Screen)第$($Row)行$($Label)输入完整可操作").Count -eq 1) 'F5 quotation input was not directly verified on every viewport'
        }
    }
    Require (@($UiObservations|Where-Object name -EQ "AC-6 $($Screen)两行品牌型号与页面原输入逐项相同").Count -eq 1) 'F5 quotation brand/model persistence was not verified on every viewport'
    foreach($Label in @('提交页提示自然消失后取图','提交页完整字段可读：供应商','提交页完整字段可读：报价编号','提交页完整字段可读：含税总额 / 币种','提交页完整字段可读：状态','提交页完整字段可读：操作')){
        Require (@($UiObservations|Where-Object name -EQ "AC-6 $($Screen)$Label").Count -eq 1) 'F5 submitted quotation was not verified after transient notifications expired'
    }
}
$Navigation=@(Json (Join-Path $Launcher.run ('f5-navigation-observations-'+$Original.caseTag+'.json')))
$RecorderNavigation=@($Navigation|Where-Object userId -EQ 990000704)
Require ($Navigation.Count -gt 0 -and @($Navigation|Where-Object hasRoute -NE $true).Count -eq 0 -and $RecorderNavigation.Count -eq 3 -and @($RecorderNavigation|Where-Object {($_.rfqPermissions -join ',') -ne 'oa:rfq:list,oa:rfq:quote'}).Count -eq 0) 'F5 recorder navigation or scoped permissions were not verified on all three viewport sizes'
$Workbook=Json (Join-Path $Launcher.run ('f5-workbook-observations-'+$Original.caseTag+'.json'))
$StartupPermissions=@(Json (Join-Path $Launcher.run ('f5-startup-permission-observations-'+$Original.caseTag+'.json')))
Require ($Original.checks -contains 'AC-12 审批完成后详情实际显示已定标') 'F5 awarded detail status was not checked'
Require ($StartupPermissions.Count -eq 6) 'F5 startup permissions were not checked on every viewport'
foreach($Screen in @('desktop','mobile','mobileNarrow')){
    $OwnerTraffic=@($StartupPermissions|Where-Object {$_.screen -eq $Screen -and $_.userId -eq 990000701})
    $RecorderTraffic=@($StartupPermissions|Where-Object {$_.screen -eq $Screen -and $_.userId -eq 990000704})
    Require ($OwnerTraffic.Count -eq 1 -and $RecorderTraffic.Count -eq 1 -and $RecorderTraffic[0].requests.Count -eq 0 -and @($RecorderTraffic[0].responses|Where-Object status -EQ 403).Count -eq 0) 'F5 recorder made unauthorized startup requests'
    foreach($Fragment in @('/dict/data/type/','/config/client/','/message/mine/unread-count')){
        Require (@($OwnerTraffic[0].responses|Where-Object {$_.path.Contains($Fragment) -and $_.status -eq 200}).Count -gt 0) 'F5 authorized startup read was not retained'
    }
    foreach($Suffix in @('仅报价账号不请求无权字典、配置和消息','仅报价账号实际页面无多余403及权限提示','本人报价标题实际可读且无遮挡','本人报价供应商实际可读且无遮挡')){
        Require ($Original.checks -contains ('AC-16/17 '+$Screen+$Suffix)) 'F5 readable quotation permission assertion missing'
    }
}
Require ($Workbook.actuallyDownloaded -and $Workbook.allCellsMatchCurrentComparison -and $Workbook.headers.Count -eq 19 -and $Workbook.rows.Count -eq 8) 'F5 actual workbook content verification missing'
$null=Track $Workbook.file $Workbook.hash
$ExportResponse=Json (Join-Path $Launcher.run ('f5-export-response-'+$Original.caseTag+'.json'))
Require ($ExportResponse.actualGateway -and $ExportResponse.actualLogin -and $ExportResponse.response.status -eq 200 -and $ExportResponse.response.size -gt 1000 -and $ExportResponse.response.contentType.Contains('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') -and $ExportResponse.response.disposition.Contains('.xlsx') -and $ExportResponse.response.cacheControl.Contains('no-store')) 'F5 actual Excel response lost its file type or cache protection'
$Audit=Json (Join-Path $Launcher.run ('f5-audit-observations-'+$Original.caseTag+'.json'))
Require ($Audit.actualBeforeAfter -and $Audit.fields.Count -eq 10 -and $Audit.mainAwardAudit -and $Audit.purchaseAudit -and $Audit.auditIds.Count -gt 0) 'F5 actual audit observations missing'
foreach($Label in @('AC-19 定标审计唯一绑定真实审批人、实例和前后状态','AC-19 重复采购转换只记录一次且保留实际原单前后值','AC-19 报价提交审计绑定实际录入人和74.68元原明细','AC-19 审批中准入变化记录未生效原因及实际审批人')){
    Require ($Original.checks -contains $Label) 'F5 actual before/after audit assertion missing'
}
$Controlled=Json (Join-Path $Launcher.run ('f5-controlled-inputs-'+$Original.caseTag+'.json'))
Require (-not $Controlled.priorRuntimeWritten -and -not $Controlled.systemClockChanged) 'F5 controlled dates changed original runtime'
$Review=Json $ImageReviewPath
Require ($Review.Round -eq $IndependentRound -and $Review.ActuallyViewed -eq $true -and $Review.VisualAccepted -eq $true) 'F5 direct image review is incomplete'
Require ($Review.Images.Count -eq $Business.images.Count -and $Review.Images.Count -gt 0) 'F5 image review does not cover every original screenshot'
foreach($Image in $Business.images){
    $Reviewed=@($Review.Images|Where-Object Name -EQ $Image.name)
    Require ($Reviewed.Count -eq 1 -and $Reviewed[0].ActuallyViewed -eq $true -and $Reviewed[0].VisualAccepted -eq $true -and $Reviewed[0].SourceHash -eq $Image.hash) 'F5 screenshot is missing a successful direct review'
    $null=Track (Join-Path $IndependentDirectory $Image.name) $Image.hash
}
$Conversion=Json $Review.ConversionManifest
Require ($Conversion.ConvertedCount -eq $Review.Images.Count -and $Review.SourceResultHash -eq $Conversion.SourceResultHash) 'F5 JPEG conversion is not bound to this original result'
$null=Track $Review.SourceResult $Review.SourceResultHash
foreach($Image in $Review.Images){
    Require ($Image.ReviewPath.EndsWith('.jpg',[StringComparison]::OrdinalIgnoreCase)) 'F5 screenshot review must use JPEG'
    $null=Track $Image.ReviewPath $Image.ReviewHash
    $null=Track $Image.SourcePath $Image.SourceHash
}
$Receipts=@(Json $TerminalReceiptsPath)
foreach($Name in @(('backend'+$BackendRound.Substring(1)),('frontend'+$FrontendRound.Substring(1)),('packages'+$PackageRound.Substring(1)),('database'+$DatabaseRound.Substring(1)),('supplierDatabase'+$SupplierDatabaseRound.Substring(1)),('independent'+$IndependentRound.Substring(1)))){
    $Receipt=@($Receipts|Where-Object Name -EQ $Name)
    Require ($Receipt.Count -eq 1 -and $Receipt[0].TerminalCollected -and $Receipt[0].Exit -eq 0 -and [string]$Receipt[0].Chunk -match '^[a-f0-9]+$') 'F5 successful original process receipt missing'
    $OriginalTerminalPath=Track $Receipt[0].OriginalTerminalPath $Receipt[0].OriginalTerminalHash
    $OriginalTerminal=Json $OriginalTerminalPath
    Require ($OriginalTerminal.TerminalCollected -and $OriginalTerminal.Exit -eq 0 -and $OriginalTerminal.Session -eq $Receipt[0].Session -and $OriginalTerminal.StartChunk -eq $Receipt[0].StartChunk -and $OriginalTerminal.Chunk -eq $Receipt[0].Chunk) 'F5 process receipt differs from retained original'
}
$Reference=Json (Join-Path $Root '.cloudflow-runtime/batch-g-integration/9799534e1a3a47b5958330f14ae16dc7/state.json')
Require ($Reference.status -eq 'RUNNING' -and $Reference.processes.Count -eq 9 -and $Reference.services.Count -eq 6) 'F5 reference runtime changed'
foreach($Entry in $Reference.processes){
    $Observed=Get-CimInstance Win32_Process -Filter "ProcessId=$($Entry.id)"
    Require ($Observed -and $Observed.CommandLine.Contains($Entry.marker)) 'F5 reference process ownership differs'
}
foreach($Service in $Reference.services){Require ((Invoke-RestMethod -Uri "http://127.0.0.1:$($Service.healthPort)/actuator/health" -TimeoutSec 15).status -eq 'UP') 'F5 reference service unhealthy'}
$Installation=@(Json (Join-Path $Evidence 'f5-product-install-20261015-r1/originals.json'))
foreach($Entry in $Installation){
    if($Entry.Existed){$null=Track $Entry.Original $Entry.Hash}
    $null=Track $Entry.RetainedCandidate $Entry.CandidateHash
}
$BeforeBuild=Json (Join-Path $Evidence 'f5-first-build-fix-prep-20261015-r1/original.json')
$null=Track $BeforeBuild.Original $BeforeBuild.Hash
$FrontendFix=Json (Join-Path $Evidence 'f5-frontend-type-fix-prep-20261016-r1/original.json')
$null=Track $FrontendFix.Original $FrontendFix.Hash
$null=Json (Join-Path $Evidence 'f5-frontend-type-fix-prep-20261016-r1/installed.json')
$AdmissionOriginals=@(Json (Join-Path $Evidence 'f5-admission-transaction-fix-prep-20261016-r1/originals.json'))
foreach($Entry in $AdmissionOriginals){$null=Track $Entry.Original $Entry.Hash}
$null=Json (Join-Path $Evidence 'f5-admission-transaction-fix-prep-20261016-r1/installed.json')
$StartupOriginals=@(Json (Join-Path $Evidence 'f5-startup-audit-fix-prep-20261016-r1/originals.json'))
foreach($Entry in $StartupOriginals){$null=Track $Entry.Original $Entry.Hash}
$StartupProbe=Json (Join-Path $Evidence 'f5-startup-audit-fix-prep-20261016-r1/before-b180-result.json')
Require ($StartupProbe.passed -and $StartupProbe.expectedFailure -and $StartupProbe.actualFailure -and $StartupProbe.actualStartupVerifier -and -not $StartupProbe.businessExecuted) 'F5 original startup audit failure was not reproduced'
foreach($Name in @('F5StartupAuditProbe.java','before-b180.log','original-class.json','installed.json')){
    $null=Track (Join-Path $Evidence ('f5-startup-audit-fix-prep-20261016-r1/'+$Name))
}
$StartupClass=Json (Join-Path $Evidence 'f5-startup-audit-fix-prep-20261016-r1/original-class.json')
$null=Track $StartupClass.Original $StartupClass.Hash
$RuntimeGuardFix=Json (Join-Path $Evidence 'f5-runtime-scenario-fix-prep-20261016-r1/original.json')
$null=Track $RuntimeGuardFix.Original $RuntimeGuardFix.Hash
$null=Track $RuntimeGuardFix.Candidate $RuntimeGuardFix.CandidateHash
$null=Json (Join-Path $Evidence 'f5-runtime-scenario-fix-prep-20261016-r1/installed.json')
$MailRepeatFix=Json (Join-Path $Evidence 'f5-mail-repeat-fix-prep-20261016-r1/original.json')
$null=Track $MailRepeatFix.Original $MailRepeatFix.Hash
$null=Json (Join-Path $Evidence 'f5-mail-repeat-fix-prep-20261016-r1/installed.json')
$JobOverlapFix=Json (Join-Path $Evidence 'f5-job-trigger-overlap-fix-prep-20261016-r1/original.json')
$null=Track $JobOverlapFix.Original $JobOverlapFix.Hash
$null=Json (Join-Path $Evidence 'f5-job-trigger-overlap-fix-prep-20261016-r1/installed.json')
$OverlapDocumentPath=Track (Join-Path $Root 'docs/design/F5-比价视角与手机明细设计-20261015.md')
$OverlapText=Get-Content -LiteralPath $OverlapDocumentPath -Raw
$OverlapMatch=[regex]::Match($OverlapText,'(?s)<!-- f5-archived-overlap-diagnosis:start -->\s*```json\s*(?<record>.*?)\s*```\s*<!-- f5-archived-overlap-diagnosis:end -->')
Require $OverlapMatch.Success 'F5 documented task overlap diagnosis is missing'
$OverlapHistory=$OverlapMatch.Groups['record'].Value|ConvertFrom-Json -Depth 10
Require ($OverlapHistory.SchemaVersion -eq 1 -and $OverlapHistory.IndependentRound -eq 'r4' -and $OverlapHistory.RuntimeRetained -eq $false -and $OverlapHistory.Revalidated -eq $false -and $OverlapHistory.UsedAsSuccessfulTerminal -eq $false) 'F5 historical overlap record must not replace current acceptance evidence'
Require ($OverlapHistory.DiagnosisPassed -eq $true -and $OverlapHistory.BusinessPassed -eq $false -and $OverlapHistory.Readonly -eq $true -and $OverlapHistory.SuperReadonly -eq $true -and $OverlapHistory.Stopped -eq $true -and $OverlapHistory.BusinessWrites -eq 0 -and $OverlapHistory.Rows -eq 4 -and $OverlapHistory.ManualStatus -eq 'SKIPPED' -and $OverlapHistory.ManualResult -eq 'LOCK_HELD' -and $OverlapHistory.CronStatus -eq 'SUCCESS' -and $OverlapHistory.OriginalTerminal.Chunk -eq '7b7eab' -and $OverlapHistory.OriginalTerminal.Exit -eq 0) 'F5 documented original overlap diagnosis differs'
$JobOverlapHistoricalRecord=[pscustomobject]@{HistoricalRecord=$OverlapHistory;Document=$OverlapDocumentPath;DocumentHash=$Inputs[$OverlapDocumentPath];EvidenceKind='HistoricalDocumentRecord';Retained=$false;Revalidated=$false;UsedAsSuccessfulTerminal=$false}
$ExportFixOriginals=@(Json (Join-Path $Evidence 'f5-export-cache-fix-prep-20261016-r1/originals.json'))
foreach($Entry in $ExportFixOriginals){$null=Track $Entry.Original $Entry.Hash}
$null=Json (Join-Path $Evidence 'f5-export-cache-fix-prep-20261016-r1/installed.json')
$SourcePurchaseOriginals=@(Json (Join-Path $Evidence 'f5-source-purchase-fix-prep-20261016-r1/originals.json'))
foreach($Entry in $SourcePurchaseOriginals){$null=Track $Entry.Original $Entry.Hash}
$null=Json (Join-Path $Evidence 'f5-source-purchase-fix-prep-20261016-r1/installed.json')
$SourcePurchaseReproduction=Json (Join-Path $Evidence 'f5-rfq-checks-20261015-r5/business-result.json')
$SourcePurchaseFailure=@($SourcePurchaseReproduction.scenarios|Where-Object name -EQ 'source-purchase-conversion-identity-idempotency-and-audit-rollback')
Require (-not $SourcePurchaseReproduction.passed -and -not $SourcePurchaseReproduction.sourcePurchaseConversionVerified -and $SourcePurchaseFailure.Count -eq 1 -and -not $SourcePurchaseFailure[0].passed -and $SourcePurchaseFailure[0].failure -eq '采购来源已改变，请刷新重试') 'F5 source purchase failure was not reproduced on the original backend'
$NavigationOriginals=@(Json (Join-Path $Evidence 'f5-recorder-navigation-fix-prep-20261016-r1/originals.json'))
foreach($Entry in $NavigationOriginals){$null=Track $Entry.Original $Entry.Hash}
$null=Json (Join-Path $Evidence 'f5-recorder-navigation-fix-prep-20261016-r1/installed.json')
$null=Json (Join-Path $Evidence 'f5-recorder-navigation-fix-prep-20261016-r1/diagnosis.json')
$MobileQuotationOriginals=@(Json (Join-Path $Evidence 'f5-mobile-quotation-fix-prep-20261016-r1/originals.json'))
foreach($Entry in $MobileQuotationOriginals){$null=Track $Entry.PreservedAt $Entry.Hash}
$null=Json (Join-Path $Evidence 'f5-mobile-quotation-fix-prep-20261016-r1/installed.json')
$SubmissionCaptureOriginals=@(Json (Join-Path $Evidence 'f5-submission-capture-fix-prep-20261016-r1/originals.json'))
foreach($Entry in $SubmissionCaptureOriginals){$null=Track $Entry.Original $Entry.Hash}
$null=Json (Join-Path $Evidence 'f5-submission-capture-fix-prep-20261016-r1/installed.json')
$SubmissionCaptureDiagnosis=Json (Join-Path $Evidence 'f5-submission-capture-fix-prep-20261016-r1/diagnosis.json')
Require ($SubmissionCaptureDiagnosis.ActuallyViewed -and -not $SubmissionCaptureDiagnosis.VisualAccepted -and $SubmissionCaptureDiagnosis.FailedImage -eq 'f5-quotation-submitted-mobileNarrow-19fb2ff7d6df.png' -and $SubmissionCaptureDiagnosis.ProductModified -eq $false) 'F5 original submission capture obstruction was not retained'
$SubmissionWaitOriginals=@(Json (Join-Path $Evidence 'f5-submission-capture-fix-prep-20261016-r2/originals.json'))
foreach($Entry in $SubmissionWaitOriginals){$null=Track $Entry.Original $Entry.Hash}
$null=Json (Join-Path $Evidence 'f5-submission-capture-fix-prep-20261016-r2/installed.json')
$SubmissionWaitDiagnosis=Json (Join-Path $Evidence 'f5-submission-capture-fix-prep-20261016-r2/diagnosis.json')
$null=Track $SubmissionWaitDiagnosis.SourceResult $SubmissionWaitDiagnosis.SourceResultHash
$SubmissionWaitTerminal=Json (Join-Path $Evidence 'f5-rfq-independent-20261015-r13/terminal-receipt.json')
Require ($SubmissionWaitDiagnosis.OriginalProcessExit -eq 1 -and -not $SubmissionWaitDiagnosis.CauseConfirmed -and -not $SubmissionWaitDiagnosis.AcceptanceClaimed -and -not $SubmissionWaitDiagnosis.ProductModified -and $SubmissionWaitTerminal.TerminalCollected -and $SubmissionWaitTerminal.Exit -eq 1 -and -not $SubmissionWaitTerminal.UsedAsSuccessfulTerminal) 'F5 original submission wait failure was not retained'
$ToastDurationDirectory=Join-Path $Evidence 'f5-toast-duration-fix-prep-20261016-r1'
$ToastDurationOriginals=@(Json (Join-Path $ToastDurationDirectory 'originals.json'))
foreach($Entry in $ToastDurationOriginals){$null=Track $Entry.Original $Entry.OriginalHash}
$ToastDurationDiagnosis=Json (Join-Path $ToastDurationDirectory 'diagnosis.json')
Require ($ToastDurationDiagnosis.RootCauseEstablished -and $ToastDurationDiagnosis.WarningDurationMs -eq 10000 -and $ToastDurationDiagnosis.ExitAnimationMs -eq 200 -and $ToastDurationDiagnosis.PreviousDeadlineMs -eq 10000 -and $ToastDurationDiagnosis.NewDeadlineMs -eq 12000 -and $ToastDurationDiagnosis.SyntaxPassed -and -not $ToastDurationDiagnosis.ProductModified -and -not $ToastDurationDiagnosis.NotificationsForcedClosed -and -not $ToastDurationDiagnosis.NotificationsHidden -and -not $ToastDurationDiagnosis.AcceptanceClaimed) 'F5 notification duration diagnosis is incomplete'
$ToastProbeTerminalPath=Track $ToastDurationDiagnosis.ProbeTerminal $ToastDurationDiagnosis.ProbeTerminalHash
$ToastProbeTerminal=Json $ToastProbeTerminalPath
Require ($ToastProbeTerminal.TerminalCollected -and $ToastProbeTerminal.Exit -eq 0 -and $ToastProbeTerminal.ActualReactToast -and -not $ToastProbeTerminal.BusinessAuthenticationExecuted -and $ToastProbeTerminal.Expected10000MsTimeoutObserved -and $ToastProbeTerminal.NaturalDetachedWithin12000Ms) 'F5 notification duration reproduction was not collected'
$ToastProbeObservationsPath=Track $ToastProbeTerminal.ObservationsPath $ToastProbeTerminal.ObservationsHash
$ToastProbeObservations=@(Json $ToastProbeObservationsPath)
Require ($ToastProbeObservations.Count -eq 1 -and $ToastProbeObservations[0].duration -eq 10000 -and $ToastProbeObservations[0].outcomes[0].status -eq 'rejected' -and $ToastProbeObservations[0].outcomes[1].status -eq 'fulfilled' -and $ToastProbeObservations[0].remaining -eq 0) 'F5 notification boundary evidence differs'
$HistoryDocumentPath=Track (Join-Path $Root 'docs/design/F5-比价视角与手机明细设计-20261015.md')
$HistoryText=Get-Content -LiteralPath $HistoryDocumentPath -Raw
$HistoryMatch=[regex]::Match($HistoryText,'(?s)<!-- f5-archived-build-history:start -->\s*```json\s*(?<record>.*?)\s*```\s*<!-- f5-archived-build-history:end -->')
Require $HistoryMatch.Success 'F5 documented historical build record is missing'
$History=$HistoryMatch.Groups['record'].Value|ConvertFrom-Json -Depth 10
Require ($History.SchemaVersion -eq 1 -and $History.RawArtifactsRetained -eq $false -and $History.Revalidated -eq $false -and $History.UsedAsSuccessfulTerminal -eq $false) 'F5 documented history must not replace current acceptance evidence'
$PackageHistory=$History.PackageInvocation
Require ($PackageHistory.Round -eq 'r60' -and $PackageHistory.Passed -eq $false -and $PackageHistory.OriginalTerminal.Session -eq 70055 -and $PackageHistory.OriginalTerminal.StartChunk -eq '478fa3' -and $PackageHistory.OriginalTerminal.TerminalChunk -eq '056119' -and $PackageHistory.OriginalTerminal.Exit -eq 1 -and $PackageHistory.InternalVerificationPassed -eq $true -and $PackageHistory.InputCount -eq 3882 -and $PackageHistory.InputChanges -eq 0) 'F5 documented R60 failure boundary differs'
$PackageInvocationHistory=[pscustomobject]@{HistoricalRecord=$PackageHistory;Document=$HistoryDocumentPath;DocumentHash=$Inputs[$HistoryDocumentPath];EvidenceKind='HistoricalDocumentRecord';Retained=$false;Revalidated=$false;UsedAsSuccessfulTerminal=$false}
$WorkbookMove=Json (Join-Path $Evidence 'f5-first-build-fix-prep-20261015-r1/workbook-path.json')
$null=Track $WorkbookMove.Target $WorkbookMove.Hash
Require (-not (Test-Path -LiteralPath $WorkbookMove.Source)) 'F5 workbook parser still exists at the historical incorrect path'
$FailedBuilds=@(foreach($Build in @(@{Kind='backend';Round='r178';Session=68978;StartChunk='998e21';TerminalChunk='7d24cd';InputCount=3881},@{Kind='frontend';Round='r128';Session=69783;StartChunk='dbe37b';TerminalChunk='198cff';InputCount=1493})){
    $FailedBuild=@($History.BuildFailures|Where-Object { $_.Phase -eq $Build.Kind -and $_.Round -eq $Build.Round })
    Require ($FailedBuild.Count -eq 1) 'F5 documented original build failure is missing or duplicated'
    $FailedBuild=$FailedBuild[0]
    Require ($FailedBuild.Passed -eq $false -and $FailedBuild.OriginalTerminal.Exit -eq 1 -and $FailedBuild.OriginalTerminal.Session -eq $Build.Session -and $FailedBuild.OriginalTerminal.StartChunk -eq $Build.StartChunk -and $FailedBuild.OriginalTerminal.TerminalChunk -eq $Build.TerminalChunk -and $FailedBuild.InputCount -eq $Build.InputCount -and $FailedBuild.InputChanges -eq 0) 'F5 documented original build failure differs'
    [pscustomobject]@{Phase=$Build.Kind;Round=$Build.Round;Passed=$false;HistoricalRecord=$FailedBuild;Document=$HistoryDocumentPath;DocumentHash=$Inputs[$HistoryDocumentPath];EvidenceKind='HistoricalDocumentRecord';Retained=$false;Revalidated=$false;UsedAsSuccessfulTerminal=$false}
})
$Interruptions=[Collections.Generic.List[object]]::new()
$Failures=@(foreach($Directory in Get-ChildItem -LiteralPath $Evidence -Directory|Where-Object Name -Match '^f5-(?:rfq-checks|rfq-independent)-20261015-r[1-9][0-9]*$'){
    $ResultPath=Join-Path $Directory.FullName 'result.json'
    $ReceiptPath=Join-Path $Directory.FullName 'terminal-receipt.json'
    if(Test-Path -LiteralPath $ResultPath){
        $Prior=Get-Content -LiteralPath $ResultPath -Raw|ConvertFrom-Json -Depth 100
        if($Prior.passed -eq $false){
            $null=Track $ResultPath
            foreach($Name in @('launcher-result.json','original-business-result.json','business-result.json')){
                $Path=Join-Path $Directory.FullName $Name
                if(Test-Path -LiteralPath $Path){$null=Track $Path}
            }
            $PriorTerminal=Json $ReceiptPath
            if($PriorTerminal.TerminalCollected){
                Require ($null -ne $PriorTerminal.Exit -and $PriorTerminal.Exit -ne 0) 'F5 prior failed process exit differs'
            }else{
                Require ($PriorTerminal.TerminalCollected -eq $false -and $null -eq $PriorTerminal.Exit -and $null -eq $PriorTerminal.Chunk -and $PriorTerminal.Session -gt 0 -and $PriorTerminal.StartChunk -match '^[a-f0-9]+$' -and $PriorTerminal.MissingReason -and $PriorTerminal.OriginalTerminalRecovery -eq 'unavailable' -and $PriorTerminal.UsedAsSuccessfulTerminal -eq $false) 'F5 missing historical terminal was not explicitly recorded'
                $null=Track $PriorTerminal.OriginalResultPath $PriorTerminal.OriginalResultHash
                Require ($PriorTerminal.OriginalResultPath -eq $ResultPath) 'F5 missing terminal is bound to another result'
                $PriorLauncher=Json (Track $PriorTerminal.LauncherResultPath $PriorTerminal.LauncherResultHash)
                $PriorBusiness=Json (Track $PriorTerminal.OriginalBusinessResultPath $PriorTerminal.OriginalBusinessResultHash)
                Require ($PriorTerminal.LauncherResultPath -eq (Join-Path $Directory.FullName 'launcher-result.json') -and $PriorTerminal.OriginalBusinessResultPath -eq (Join-Path $Directory.FullName 'original-business-result.json')) 'F5 missing terminal uses another execution'
                Require ($PriorLauncher.passed -eq $false -and $PriorLauncher.businessHttpExecuted -eq $true -and $PriorLauncher.verifierExit -eq 1 -and $PriorTerminal.BusinessVerifierExit -eq 1 -and $PriorBusiness.passed -eq $false -and $PriorBusiness.failure.message -eq $PriorTerminal.BusinessFailure -and $PriorBusiness.failure.message) 'F5 historical business failure is not independently proven'
                Require ($PriorLauncher.inputsUnchanged -and $PriorLauncher.processesStopped -and $PriorLauncher.referenceKept) 'F5 historical failed execution preservation differs'
            }
            [pscustomobject]@{Round=$Directory.Name;OriginalResult=$ResultPath;Hash=$Inputs[$ResultPath];OriginalTerminal=$ReceiptPath;TerminalHash=$Inputs[$ReceiptPath];TerminalCollected=$PriorTerminal.TerminalCollected;TerminalGap=$PriorTerminal.MissingReason;UsedAsSuccessfulTerminal=$false;Passed=$false;Failure=$Prior.failure;Retained=$true}
        }
    }elseif(Test-Path -LiteralPath $ReceiptPath){
        $PriorTerminal=Json $ReceiptPath
        if($PriorTerminal.Interrupted -eq $true){
            Require ($PriorTerminal.TerminalCollected -eq $false -and $null -eq $PriorTerminal.Exit -and $null -eq $PriorTerminal.Chunk -and $PriorTerminal.Session -gt 0 -and $PriorTerminal.StartChunk -match '^[a-f0-9]+$' -and $PriorTerminal.Stage -eq 'execution-interrupted' -and $PriorTerminal.BusinessExecuted -eq $true -and $PriorTerminal.OriginalTerminalRecovery -eq 'unavailable' -and $PriorTerminal.MissingReason -and $PriorTerminal.UsedAsSuccessfulTerminal -eq $false -and $PriorTerminal.OriginalResultsFabricated -eq $false) 'F5 interrupted execution terminal boundary differs'
            Require (-not (Test-Path -LiteralPath (Join-Path $Directory.FullName 'launcher-result.json'))) 'F5 interrupted execution unexpectedly has a launcher result'
            $Observation=Json (Track $PriorTerminal.OriginalObservationPath $PriorTerminal.OriginalObservationHash)
            Require ($Observation.Interrupted -eq $true -and $Observation.AcceptanceClaimed -eq $false -and $Observation.BusinessResultPresent -eq $false -and $Observation.LauncherResultPresent -eq $false -and $Observation.ObservedOwnedProcessCount -eq 0 -and $Observation.FrozenInputChanges -eq 0 -and $Observation.ReferenceServicesHealthy -eq 6 -and @($Observation.Processes|Where-Object Exists).Count -eq 0) 'F5 interrupted execution observations differ'
            Require ($PriorTerminal.EvidenceFiles.Count -gt 0) 'F5 interrupted execution evidence inventory is missing'
            foreach($Entry in $PriorTerminal.EvidenceFiles){$null=Track $Entry.Path $Entry.Hash}
            $Interruptions.Add([pscustomobject]@{Round=$Directory.Name;OriginalTerminal=$ReceiptPath;TerminalHash=$Inputs[$ReceiptPath];TerminalCollected=$false;Exit=$null;Passed=$null;Interrupted=$true;MissingReason=$PriorTerminal.MissingReason;Observation=$PriorTerminal.OriginalObservationPath;ObservationHash=$PriorTerminal.OriginalObservationHash;UsedAsSuccessfulTerminal=$false;Retained=$true})
            continue
        }
        Require ($PriorTerminal.TerminalCollected -and $PriorTerminal.Exit -ne 0 -and $PriorTerminal.Stage -eq 'preflight' -and $PriorTerminal.BusinessExecuted -eq $false) 'Unclassified F5 execution without a business result'
        $PriorLauncherPath=Join-Path $Directory.FullName 'launcher-result.json'
        $PriorLauncher=Json $PriorLauncherPath
        Require (-not $PriorLauncher.passed -and -not $PriorLauncher.businessHttpExecuted -and $PriorLauncher.inputsUnchanged -and $PriorLauncher.processesStopped -and $PriorLauncher.referenceKept) 'F5 startup failure preservation is incomplete'
        foreach($Name in @('inputs.json','runtime-inputs.json','reference-business-before.json','reference-business-after.json','runtime-before.log','oa-startup-threads.txt','oa-startup-stop.json')){
            $Path=Join-Path $Directory.FullName $Name
            if(Test-Path -LiteralPath $Path){$null=Track $Path}
        }
        [pscustomobject]@{Round=$Directory.Name;OriginalResult=$PriorLauncherPath;Hash=$Inputs[$PriorLauncherPath];OriginalTerminal=$ReceiptPath;TerminalHash=$Inputs[$ReceiptPath];Passed=$false;Failure=$PriorTerminal.Reason;BusinessExecuted=$false;Retained=$true}
    }
})
$HistoricalReviews=@(foreach($Directory in Get-ChildItem -LiteralPath $Evidence -Directory|Where-Object Name -Match '^f5-rfq-image-review-20261015-r[1-9][0-9]*$'){
    $Path=Join-Path $Directory.FullName 'manifest.json'
    if(Test-Path -LiteralPath $Path){
        $Prior=Json $Path
        [pscustomobject]@{Round=$Prior.Round;Passed=$Prior.VisualAccepted;ActuallyViewed=$Prior.ActuallyViewed;Review=$Path;Hash=$Inputs[$Path];Retained=$true}
    }
})
$null=Track $PSCommandPath
$null=Track (Join-Path $Output 'original.ps1') $Inputs[$PSCommandPath]
foreach($Path in $Inputs.Keys){Require ((Get-FileHash -LiteralPath $Path).Hash -eq $Inputs[$Path]) ("F5 reconciliation input changed: "+$Path)}
@($Inputs.Keys|Sort-Object|ForEach-Object{[pscustomobject]@{Path=$_;Hash=$Inputs[$_]}})|ConvertTo-Json -Depth 3|Set-Content -LiteralPath (Join-Path $Output 'inputs.json') -Encoding utf8NoBOM
[pscustomobject]@{
    Passed=$true;All20Complete=$true;AcceptanceCount=20;Items=$Items;Scope='Local functional acceptance';GlobalComplete=$false
    Backend=$BackendRound;Frontend=$FrontendRound;Packages=$PackageRound;Database=$DatabaseRound;Independent=$IndependentRound
    ActualChecks=$Original.checks.Count;RecordedRequests=$Original.requests.Count;DatabaseAssertions=$DatabaseBusiness.assertions;DatabaseScenarios=9
    ReviewedImages=$Review.Images.Count;ImageReview=$ImageReviewPath;WorkbookHeaders=19;WorkbookRows=8;WorkbookHash=$Workbook.hash
    CurrentInputs=$Inputs.Count;DatabaseInputs=$DatabaseInputs;IndependentInputs=$IndependentInputs;RuntimeInputs=$RuntimeInputs;InputChanges=0
    SupplierRegression=@{Round=$SupplierDatabaseRound;Backend=$BackendRound;Inputs=$SupplierInputs;Assertions=$SupplierBusiness.assertions;Scenarios=$SupplierBusiness.scenarios.Count;Passed=$true}
    ReferenceBusinessTables=$Launcher.referenceBusinessTables;ReferenceKept=$true;IndependentProcessesStopped=$true;DatabaseRetained=$true
    OriginalTerminalReceipts=$Receipts;HistoricalBuildFailures=$FailedBuilds;HistoricalFailureReports=$Failures;HistoricalInterruptedExecutions=$Interruptions.ToArray();HistoricalVisualReviews=$HistoricalReviews;OriginalFailureResultsChanged=$false
    InstallationCorrections=@($BeforeBuild,$FrontendFix,$WorkbookMove)+$AdmissionOriginals+$StartupOriginals+$ExportFixOriginals
    VerificationCorrections=@($RuntimeGuardFix,$MailRepeatFix,$JobOverlapFix,$JobOverlapHistoricalRecord,$SubmissionCaptureDiagnosis)
    ActualExportResponse=$ExportResponse
    RetainedPackageInvocation=$PackageInvocationHistory
    CaptchaCounterWrites=0;CaptchaConfigurationWrites=0;SecretScan=$Protection;ExternalMessagesSent=$false;OfficialMailProviderContacted=$false;SystemClockChanged=$false
    DeadlineEvidence=$Controlled.deadlineEvidence;ReferenceRuntimeUpdated=$false;ProductModified=$false;ProductionModified=$false
}|ConvertTo-Json -Depth 50|Set-Content -LiteralPath (Join-Path $Output 'result.json') -Encoding utf8NoBOM
"F5_ALL_ACCEPTANCE: passed=true; items=20; checks=$($Original.checks.Count); inputs=$($Inputs.Count); images=$($Review.Images.Count); all20_complete=true; global_complete=false"
