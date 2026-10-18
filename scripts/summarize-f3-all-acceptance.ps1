param(
    [Parameter(Mandatory=$true)][ValidatePattern('^r[1-9][0-9]*$')][string]$Round,
    [Parameter(Mandatory=$true)][ValidatePattern('^r[1-9][0-9]*$')][string]$BackendRound,
    [Parameter(Mandatory=$true)][ValidatePattern('^r[1-9][0-9]*$')][string]$FrontendRound,
    [Parameter(Mandatory=$true)][ValidatePattern('^r[1-9][0-9]*$')][string]$PackageRound,
    [Parameter(Mandatory=$true)][ValidatePattern('^r[1-9][0-9]*$')][string]$DatabaseRound,
    [Parameter(Mandatory=$true)][ValidatePattern('^r[1-9][0-9]*$')][string]$IndependentRound,
    [ValidatePattern('^r[1-9][0-9]*$')][string]$RulesRound='r1',
    [Parameter(Mandatory=$true)][string]$ImageReviewPath,
    [Parameter(Mandatory=$true)][string]$TerminalReceiptsPath)
$ErrorActionPreference='Stop'
. 'D:\CloudFlowPro\.cloudflow-runtime\use-data-drive.ps1'
$Root='D:\CloudFlowPro'
$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
$Output=Join-Path $Evidence "f3-all-acceptance-20261015-$Round"
if(Test-Path -LiteralPath $Output){throw 'Retain original F3 acceptance evidence; choose a new round'}
[IO.Directory]::CreateDirectory($Output)|Out-Null
[IO.File]::Copy($PSCommandPath,(Join-Path $Output 'original.ps1'),$false)
$Inputs=@{}
function Require([bool]$Condition,[string]$Message){if(-not $Condition){throw $Message}}
function Track([string]$File,[string]$Expected=''){
    $Path=[IO.Path]::GetFullPath($File,$Root)
    Require ($Path.StartsWith($Root+'\',[StringComparison]::OrdinalIgnoreCase) -or $Path.StartsWith('D:\CloudFlowProCache\',[StringComparison]::OrdinalIgnoreCase)) 'F3 evidence outside workspace/cache'
    Require (-not ((Get-Item -LiteralPath $Path).Attributes -band [IO.FileAttributes]::ReparsePoint)) 'Redirected F3 evidence rejected'
    if(-not $Inputs.ContainsKey($Path)){$Inputs[$Path]=(Get-FileHash -LiteralPath $Path).Hash}
    if($Expected){Require ($Inputs[$Path] -eq $Expected) ("F3 recorded input differs: "+$Path)}
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
    Require ($Log.Contains("FINANCE_BUILD: phase=$($Build.Phase); files=$Count; changed=0; exit=0")) 'Original successful F3 build result missing'
}
$PackageDirectory=Join-Path $Evidence "backend-executable-verification-20261006-$PackageRound"
$Packages=Json (Join-Path $PackageDirectory 'result.json')
Require ($Packages.Passed -and $Packages.BackendRound -eq $BackendRound -and $Packages.InputChanges -eq 0 -and $Packages.Services.Count -eq 6) 'Current F3 packages not verified'
$null=Manifest (Join-Path $PackageDirectory 'inputs.json')
foreach($Package in $Packages.Services){
    $Built=Track $Package.Path $Package.Hash
    $null=Track (Join-Path $PackageDirectory "$($Package.Name)/$(Split-Path -Leaf $Built)") $Package.Hash
}
$DatabaseDirectory=Join-Path $Evidence "f3-project-checks-20261015-$DatabaseRound"
$Database=Json (Join-Path $DatabaseDirectory 'result.json')
$DatabaseBusiness=Json (Join-Path $DatabaseDirectory 'business-result.json')
Require ($Database.passed -and $Database.inputsUnchanged -and $Database.backend -eq $BackendRound -and $Database.actualDatabase) 'Current F3 project database execution did not pass'
Require ($DatabaseBusiness.passed -and $DatabaseBusiness.assertions -eq 66 -and $DatabaseBusiness.scenarios.Count -eq 15 -and @($DatabaseBusiness.scenarios|Where-Object passed -NE $true).Count -eq 0) 'F3 fifteen actual database scenarios are incomplete'
$DatabaseLog=Get-Content -LiteralPath (Track (Join-Path $DatabaseDirectory 'live.log')) -Raw
Require ($DatabaseLog.Contains('F3_PROJECT_DATABASE: passed=true; assertions=66; scenarios=15')) 'Original F3 database terminal summary missing'
$DatabaseInputs=Manifest (Join-Path $DatabaseDirectory 'inputs.json')
$DatabaseChanges=@()
$OriginalSources=@{}
foreach($Entry in @(Json (Join-Path $Evidence 'f3-member-message-prep-20261015-r1/original.json'))+@(Json (Join-Path $Evidence 'f3-project-detail-prep-20261015-r1/originals.json'))){
    $OriginalSources[$Entry.Path.Replace('\','/')]=$Entry
}
$RulesDirectory=Join-Path $Evidence "f3-rule-access-checks-20261015-$RulesRound"
$Rules=Json (Join-Path $RulesDirectory 'result.json')
Require ($Rules.passed -and $Rules.backend -eq 'r175' -and $Rules.inputsUnchanged -and $Rules.offline -and -not $Rules.actualDatabase -and -not $Rules.actualApplicationHttp) 'Original F3 rule access execution did not pass'
$RulesLog=Get-Content -LiteralPath (Track (Join-Path $RulesDirectory 'live.log')) -Raw
Require ($RulesLog.Contains('PASS: F3 project rule bridge checks=59; offline validated service, in-memory rule storage')) 'F3 original 59 rule access checks missing'
$RuleChanges=@()
$RuleEntries=@(Json (Join-Path $RulesDirectory 'inputs.json'))
foreach($Entry in $RuleEntries){
    $Path=Track $Entry.Path
    if($Inputs[$Path] -eq $Entry.Hash){continue}
    $Relative=[IO.Path]::GetRelativePath($Root,$Path).Replace('\','/')
    Require ($OriginalSources.ContainsKey($Relative)) ("Unreviewed F3 rule input change: "+$Relative)
    $Prior=$OriginalSources[$Relative]
    Require ($Prior.Hash -eq $Entry.Hash) 'F3 historical rule source differs'
    $Retained=Track $Prior.Original $Entry.Hash
    $RuleChanges += [pscustomobject]@{Path=$Path;OriginalHash=$Entry.Hash;CurrentHash=$Inputs[$Path];RetainedOriginal=$Retained}
}
Require ($RuleChanges.Count -eq 2) 'F3 expected handler messages and project empty-invoice source differences after rule checks'
$RulesInputs=$RuleEntries.Count
$IndependentDirectory=Join-Path $Evidence "f3-projects-independent-20261015-$IndependentRound"
$Launcher=Json (Join-Path $IndependentDirectory 'launcher-result.json')
$Business=Json (Join-Path $IndependentDirectory 'result.json')
$Original=Json (Join-Path $IndependentDirectory 'original-business-result.json')
Require ($Launcher.passed -and $Launcher.verifierExit -eq 0 -and $Launcher.inputsUnchanged -and $Launcher.processesStopped -and $Launcher.referenceKept) 'F3 original execution or preservation failed'
Require ($Launcher.backend -eq $BackendRound -and $Launcher.frontend -eq $FrontendRound -and $Launcher.scenario -eq 'ProjectHours') 'F3 independent version mismatch'
Require ($Business.passed -and $Business.verifierExit -eq 0 -and $Original.passed -and -not $Original.failure) 'F3 original HTTP checks did not complete'
Require ($Business.backend -eq $BackendRound -and $Business.frontend -eq $FrontendRound -and $Business.scenario -eq 'ProjectHours' -and $Business.backendHttp -and -not $Business.apiDoubles) 'F3 original application evidence differs'
$null=Track $Business.sourceResult $Business.sourceResultHash
Require ((Get-FileHash -LiteralPath (Join-Path $IndependentDirectory 'original-business-result.json')).Hash -eq $Business.sourceResultHash) 'F3 retained business result differs from executed original'
$IndependentInputs=Manifest (Join-Path $IndependentDirectory 'inputs.json')
$RuntimeInputs=Manifest (Join-Path $IndependentDirectory 'runtime-inputs.json')
$Protection=Json (Join-Path $IndependentDirectory 'runtime-after.json')
Require ($Protection.passed -and $Protection.leaks -eq 0 -and $Protection.databaseLeaks -eq 0 -and $Protection.counterWrites -eq 0 -and $Protection.configurationWrites -eq 0) 'F3 runtime/log protection failed'
Require (-not $Launcher.priorRuntimeWritten -and -not $Launcher.externalMessagesSent -and -not $Launcher.systemClockChanged -and $Launcher.captchaCounterWrites -eq 0 -and $Launcher.captchaConfigurationWrites -eq 0) 'F3 isolated verification boundary changed'
$RequiredFlags=@{
    1=@('catalog','ratePriority');2=@('dailyLimits','memberPeriods','concurrency','desktop','mobile','mobileNarrow')
    3=@('timesheets','accounting');4=@('approval','audit');5=@('frozenRates');6=@('reversal')
    7=@('accounting','tree');8=@('accounting','reversal');9=@('purchase','invoice')
    10=@('recalculation','audit');11=@('costPrivacy','permissions','desktop','mobile','mobileNarrow')
    12=@('tree','lostResponse','desktop','mobile','mobileNarrow');13=@('tree','progress')
    14=@('dependencies');15=@('dependencyWarnings','desktop','mobile','mobileNarrow')
    16=@('progress');17=@('templates');18=@('templates');19=@('timesheets','tree','memberPeriods')
    20=@('gantt','desktop','mobile','mobileNarrow');21=@('reports','desktop','mobile','mobileNarrow')
}
$Items=@(foreach($Id in 1..21){
    foreach($Flag in $RequiredFlags[$Id]){
        Require ($Original.evidence.$Flag -eq $true -and $Business.sourceEvidence.$Flag -eq $true) ("Actual F3 acceptance flag missing: AC-$Id/$Flag")
    }
    $Checks=@($Original.checks|Where-Object{$_ -match '^AC-([0-9]+(?:/[0-9]+)*)(?:\s|/FR-)' -and $Matches[1].Split('/') -contains [string]$Id})
    Require ($Checks.Count -gt 0) ("Actual F3 assertion missing: AC-$Id")
    [pscustomobject]@{Acceptance="AC-$Id";Passed=$true;Flags=$RequiredFlags[$Id];ActualAssertions=$Checks}
})
$Review=Json $ImageReviewPath
Require ($Review.Round -eq $IndependentRound -and $Review.ActuallyViewed -eq $true -and $Review.VisualAccepted -eq $true) 'F3 direct image review is incomplete'
Require ($Review.Images.Count -eq $Business.images.Count -and $Review.Images.Count -gt 0) 'F3 image review does not cover every original screenshot'
foreach($Image in $Business.images){
    $Reviewed=@($Review.Images|Where-Object Name -EQ $Image.name)
    Require ($Reviewed.Count -eq 1 -and $Reviewed[0].ActuallyViewed -eq $true -and $Reviewed[0].VisualAccepted -eq $true -and $Reviewed[0].SourceHash -eq $Image.hash) 'F3 screenshot is missing a successful direct review'
    $null=Track (Join-Path $IndependentDirectory $Image.name) $Image.hash
}
$UiObservations=@(Json (Join-Path $Launcher.run ('f3-ui-observations-'+$Original.caseTag+'.json')))
Require ($UiObservations.Count -gt 0 -and @($UiObservations|Where-Object passed -NE $true).Count -eq 0) 'F3 actual page observations are incomplete'
foreach($Label in @('NFR 单价修改记录真实130.03至140.04的前后值','NFR 原工时提交记录草稿、已提交及锁定明细金额','NFR 原工时唯一审批记录绑定实际经理、流程及前后状态','NFR 驳回记录实际经理意见和状态','NFR 成本重算记录真实项目、任务及最终金额','NFR 全量重算记录绑定实际任务执行编号与完成项目')){
    Require ($Original.checks -contains $Label) 'F3 actual before/after audit assertion missing'
}
$Conversion=Json $Review.ConversionManifest
Require ($Conversion.ConvertedCount -eq $Review.Images.Count -and $Review.SourceResultHash -eq $Conversion.SourceResultHash) 'F3 JPEG conversion is not bound to this original result'
$null=Track $Review.SourceResult $Review.SourceResultHash
foreach($Image in $Review.Images){
    Require ($Image.ReviewPath.EndsWith('.jpg',[StringComparison]::OrdinalIgnoreCase)) 'F3 screenshot review must use JPEG'
    $null=Track $Image.ReviewPath $Image.ReviewHash
    $null=Track $Image.SourcePath $Image.SourceHash
}
$Receipts=@(Json $TerminalReceiptsPath)
foreach($Name in @(('backend'+$BackendRound.Substring(1)),('frontend'+$FrontendRound.Substring(1)),('packages'+$PackageRound.Substring(1)),('database'+$DatabaseRound.Substring(1)),('independent'+$IndependentRound.Substring(1)),('ruleAccess'+$RulesRound.Substring(1)))){
    $Receipt=@($Receipts|Where-Object Name -EQ $Name)
    Require ($Receipt.Count -eq 1 -and $Receipt[0].TerminalCollected -and $Receipt[0].Exit -eq 0 -and [string]$Receipt[0].Chunk -match '^[a-f0-9]+$') 'F3 successful original process receipt missing'
    $OriginalTerminalPath=Track $Receipt[0].OriginalTerminalPath $Receipt[0].OriginalTerminalHash
    $OriginalTerminal=Json $OriginalTerminalPath
    Require ($OriginalTerminal.TerminalCollected -and $OriginalTerminal.Exit -eq 0 -and $OriginalTerminal.Session -eq $Receipt[0].Session -and $OriginalTerminal.StartChunk -eq $Receipt[0].StartChunk -and $OriginalTerminal.Chunk -eq $Receipt[0].Chunk) 'F3 process receipt differs from retained original'
}
$Reference=Json (Join-Path $Root '.cloudflow-runtime/batch-g-integration/9799534e1a3a47b5958330f14ae16dc7/state.json')
Require ($Reference.status -eq 'RUNNING' -and $Reference.processes.Count -eq 9 -and $Reference.services.Count -eq 6) 'F3 reference runtime changed'
foreach($Entry in $Reference.processes){
    $Observed=Get-CimInstance Win32_Process -Filter "ProcessId=$($Entry.id)"
    Require ($Observed -and $Observed.CommandLine.Contains($Entry.marker)) 'F3 reference process ownership differs'
}
foreach($Service in $Reference.services){Require ((Invoke-RestMethod -Uri "http://127.0.0.1:$($Service.healthPort)/actuator/health" -TimeoutSec 15).status -eq 'UP') 'F3 reference service unhealthy'}
$Failures=@(foreach($Directory in Get-ChildItem -LiteralPath $Evidence -Directory|Where-Object Name -Match '^f3-(?:project-checks|projects-independent)-20261015-r[1-9][0-9]*$'){
    $ResultPath=Join-Path $Directory.FullName 'result.json'
    $ReceiptPath=Join-Path $Directory.FullName 'terminal-receipt.json'
    if(Test-Path -LiteralPath $ResultPath){
        $Prior=Get-Content -LiteralPath $ResultPath -Raw|ConvertFrom-Json -Depth 100
        if($Prior.passed -eq $false){
            $null=Track $ResultPath
            $LauncherPath=Join-Path $Directory.FullName 'launcher-result.json'
            if(Test-Path -LiteralPath $LauncherPath){$null=Track $LauncherPath}
            $OriginalPath=Join-Path $Directory.FullName 'original-business-result.json'
            if(Test-Path -LiteralPath $OriginalPath){$null=Track $OriginalPath}
            $PriorTerminal=Json $ReceiptPath
            Require ($PriorTerminal.TerminalCollected -and $PriorTerminal.Exit -ne 0) 'F3 prior failed process terminal receipt missing'
            [pscustomobject]@{Round=$Directory.Name;OriginalResult=$ResultPath;Hash=$Inputs[$ResultPath];OriginalTerminal=$ReceiptPath;TerminalHash=$Inputs[$ReceiptPath];Passed=$false;Failure=$Prior.failure;Retained=$true}
        }
    }elseif(Test-Path -LiteralPath $ReceiptPath){
        $PriorTerminal=Json $ReceiptPath
        Require ($PriorTerminal.TerminalCollected -and $PriorTerminal.Exit -ne 0 -and $PriorTerminal.Stage -eq 'preflight' -and $PriorTerminal.BusinessExecuted -eq $false -and $PriorTerminal.IndependentEnvironmentCreated -eq $false) 'Unclassified F3 execution without a business result'
        [pscustomobject]@{Round=$Directory.Name;OriginalResult=$null;OriginalTerminal=$ReceiptPath;TerminalHash=$Inputs[$ReceiptPath];Passed=$false;Failure=$PriorTerminal.Reason;BusinessExecuted=$false;Retained=$true}
    }
})
$HistoricalVisualReviews=@(foreach($Directory in Get-ChildItem -LiteralPath $Evidence -Directory|Where-Object Name -Match '^f3-projects-image-review-20261015-r[1-9][0-9]*$'){
    $PriorReviewPath=Join-Path $Directory.FullName 'manifest.json'
    if(Test-Path -LiteralPath $PriorReviewPath){
        $PriorReview=Json $PriorReviewPath
        [pscustomobject]@{Round=$PriorReview.Round;Passed=$PriorReview.VisualAccepted;ActuallyViewed=$PriorReview.ActuallyViewed;Review=$PriorReviewPath;Hash=$Inputs[$PriorReviewPath];Retained=$true}
    }
})
$null=Track $PSCommandPath
$null=Track (Join-Path $Output 'original.ps1') $Inputs[$PSCommandPath]
foreach($Path in $Inputs.Keys){Require ((Get-FileHash -LiteralPath $Path).Hash -eq $Inputs[$Path]) ("F3 reconciliation input changed: "+$Path)}
@($Inputs.Keys|Sort-Object|ForEach-Object{[pscustomobject]@{Path=$_;Hash=$Inputs[$_]}})|ConvertTo-Json -Depth 3|Set-Content -LiteralPath (Join-Path $Output 'inputs.json') -Encoding utf8NoBOM
[pscustomobject]@{
    Passed=$true;All21Complete=$true;AcceptanceCount=21;Items=$Items;Scope='Local functional acceptance';GlobalComplete=$false
    Backend=$BackendRound;Frontend=$FrontendRound;Packages=$PackageRound;Database=$DatabaseRound;Independent=$IndependentRound
    ActualChecks=$Original.checks.Count;RecordedRequests=$Original.requests.Count;DatabaseAssertions=$DatabaseBusiness.assertions
    DatabaseBackend=$Database.backend;DatabaseSinceChanges=$DatabaseChanges;RuleAccessAssertions=59;RulesBackend=$Rules.backend;RulesSinceChanges=$RuleChanges;RulesInputs=$RulesInputs;ReviewedImages=$Review.Images.Count;ImageReview=$ImageReviewPath
    CurrentInputs=$Inputs.Count;DatabaseInputs=$DatabaseInputs;IndependentInputs=$IndependentInputs;RuntimeInputs=$RuntimeInputs;InputChanges=0
    ReferenceBusinessTables=$Launcher.referenceBusinessTables;ReferenceKept=$true;IndependentProcessesStopped=$true;DatabaseRetained=$true
    OriginalTerminalReceipts=$Receipts;HistoricalFailureReports=$Failures;HistoricalVisualReviews=$HistoricalVisualReviews;OriginalFailureResultsChanged=$false
    CaptchaCounterWrites=0;CaptchaConfigurationWrites=0;SecretScan=$Protection;ExternalMessagesSent=$false;SystemClockChanged=$false
    ReferenceRuntimeUpdated=$false;ProductModified=$false;ProductionModified=$false
}|ConvertTo-Json -Depth 50|Set-Content -LiteralPath (Join-Path $Output 'result.json') -Encoding utf8NoBOM
"F3_ALL_ACCEPTANCE: passed=true; items=21; checks=$($Original.checks.Count); inputs=$($Inputs.Count); images=$($Review.Images.Count); all21_complete=true; global_complete=false"
