param(
    [Parameter(Mandatory=$true)][ValidatePattern('^r[1-9][0-9]*$')][string]$Round,
    [Parameter(Mandatory=$true)][ValidatePattern('^r[1-9][0-9]*$')][string]$BackendRound,
    [Parameter(Mandatory=$true)][ValidatePattern('^r[1-9][0-9]*$')][string]$FrontendRound,
    [Parameter(Mandatory=$true)][ValidatePattern('^r[1-9][0-9]*$')][string]$PackageRound,
    [Parameter(Mandatory=$true)][ValidatePattern('^r[1-9][0-9]*$')][string]$DatabaseRound,
    [Parameter(Mandatory=$true)][ValidatePattern('^r[1-9][0-9]*$')][string]$IndependentRound,
    [ValidatePattern('^r[1-9][0-9]*$')][string]$RulesRound='r2',
    [Parameter(Mandatory=$true)][string]$ImageReviewPath,
    [Parameter(Mandatory=$true)][string]$TerminalReceiptsPath)
$ErrorActionPreference='Stop'
. 'D:\CloudFlowPro\.cloudflow-runtime\use-data-drive.ps1'
$Root='D:\CloudFlowPro'
$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
$Output=Join-Path $Evidence "f2-all-acceptance-20261015-$Round"
if(Test-Path -LiteralPath $Output){throw 'Retain original F2 acceptance evidence; choose a new round'}
[IO.Directory]::CreateDirectory($Output)|Out-Null
[IO.File]::Copy($PSCommandPath,(Join-Path $Output 'original.ps1'),$false)
$Inputs=@{}
function Require([bool]$Condition,[string]$Message){if(-not $Condition){throw $Message}}
function Track([string]$File,[string]$Expected=''){
    $Path=[IO.Path]::GetFullPath($File,$Root)
    Require ($Path.StartsWith($Root+'\',[StringComparison]::OrdinalIgnoreCase) -or $Path.StartsWith('D:\CloudFlowProCache\',[StringComparison]::OrdinalIgnoreCase)) 'F2 evidence outside workspace/cache'
    Require (-not ((Get-Item -LiteralPath $Path).Attributes -band [IO.FileAttributes]::ReparsePoint)) 'Redirected F2 evidence rejected'
    if(-not $Inputs.ContainsKey($Path)){$Inputs[$Path]=(Get-FileHash -LiteralPath $Path).Hash}
    if($Expected){Require ($Inputs[$Path] -eq $Expected) ("F2 recorded input differs: "+$Path)}
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
    Require ($Log.Contains("FINANCE_BUILD: phase=$($Build.Phase); files=$Count; changed=0; exit=0")) 'Original successful F2 build result missing'
}
$PackageDirectory=Join-Path $Evidence "backend-executable-verification-20261006-$PackageRound"
$Packages=Json (Join-Path $PackageDirectory 'result.json')
Require ($Packages.Passed -and $Packages.BackendRound -eq $BackendRound -and $Packages.InputChanges -eq 0 -and $Packages.Services.Count -eq 6) 'Current F2 packages not verified'
$null=Manifest (Join-Path $PackageDirectory 'inputs.json')
foreach($Package in $Packages.Services){
    $Built=Track $Package.Path $Package.Hash
    $null=Track (Join-Path $PackageDirectory "$($Package.Name)/$(Split-Path -Leaf $Built)") $Package.Hash
}
$DatabaseDirectory=Join-Path $Evidence "f2-supplier-checks-20261012-$DatabaseRound"
$Database=Json (Join-Path $DatabaseDirectory 'result.json')
$DatabaseBusiness=Json (Join-Path $DatabaseDirectory 'business-result.json')
Require ($Database.passed -and $Database.inputsUnchanged -and $Database.backend -eq 'r169' -and $Database.actualDatabase) 'Original F2 supplier database execution did not pass'
Require ($DatabaseBusiness.passed -and $DatabaseBusiness.assertions -eq 53 -and $DatabaseBusiness.scenarios.Count -eq 8 -and @($DatabaseBusiness.scenarios|Where-Object passed -NE $true).Count -eq 0) 'F2 eight actual database scenarios are incomplete'
$DatabaseLog=Get-Content -LiteralPath (Track (Join-Path $DatabaseDirectory 'live.log')) -Raw
Require ($DatabaseLog.Contains('F2_SUPPLIER_DATABASE: passed=true; assertions=53; scenarios=8')) 'Original F2 database terminal summary missing'
$OriginalSources=@{}
foreach($Preparation in @('f2-purchase-form-prep-20261015-r1','f2-approval-key-prep-20261015-r1')){
    foreach($Entry in @(Json (Join-Path $Evidence "$Preparation/originals.json"))){$OriginalSources[$Entry.Path.Replace('\','/') ]=$Entry}
}
$PriorPackageDirectory=Join-Path $Evidence 'backend-executable-verification-20261006-r49'
$PriorPackages=Json (Join-Path $PriorPackageDirectory 'result.json')
Require ($PriorPackages.Passed -and $PriorPackages.BackendRound -eq 'r169') 'Historical database executable package is not B169'
$PriorOa=@($PriorPackages.Services|Where-Object Name -EQ 'oa')
Require ($PriorOa.Count -eq 1) 'Historical OA executable package missing'
$PriorJar=Track (Join-Path $PriorPackageDirectory ('oa/'+(Split-Path -Leaf $PriorOa[0].Path))) $PriorOa[0].Hash
$DatabaseEntries=@(Json (Join-Path $DatabaseDirectory 'inputs.json'))
$DatabaseChanges=@()
$Archive=[IO.Compression.ZipFile]::OpenRead($PriorJar)
try{
    foreach($Entry in $DatabaseEntries){
        $Path=Track $Entry.Path
        if($Inputs[$Path] -eq $Entry.Hash){continue}
        $Relative=[IO.Path]::GetRelativePath($Root,$Path).Replace('\','/')
        $Retained=$null;$ArchiveEntry=$null
        if($OriginalSources.ContainsKey($Relative)){
            $Prior=$OriginalSources[$Relative]
            Require ($Prior.Hash -eq $Entry.Hash) 'F2 historical source does not match database input'
            $Retained=Track $Prior.Original $Entry.Hash
        }elseif($Relative.StartsWith('cloudflow-backend/cloudflow-service-oa/target/classes/')){
            $SourceRelative=$Relative.Replace('/target/classes/','/src/main/java/').Replace('.class','.java')
            Require ($OriginalSources.ContainsKey($SourceRelative)) ("Unreviewed F2 compiled change: "+$Relative)
            $ArchiveEntry='BOOT-INF/classes/'+$Relative.Substring('cloudflow-backend/cloudflow-service-oa/target/classes/'.Length)
            $Compiled=$Archive.GetEntry($ArchiveEntry)
            Require ($null -ne $Compiled) 'Original B169 compiled entry missing'
            $Stream=$Compiled.Open()
            try{$OriginalHash=[Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($Stream))}finally{$Stream.Dispose()}
            Require ($OriginalHash -eq $Entry.Hash) 'Historical compiled bytes differ from database execution'
            $Retained=$PriorJar
        }else{throw ("Unreviewed F2 database input change: "+$Relative)}
        $DatabaseChanges += [pscustomobject]@{Path=$Path;OriginalHash=$Entry.Hash;CurrentHash=$Inputs[$Path];RetainedOriginal=$Retained;ArchiveEntry=$ArchiveEntry}
    }
}finally{$Archive.Dispose()}
Require ($DatabaseChanges.Count -eq 9) 'F2 expected four procurement/approval sources, four compiled classes and one verifier difference missing'
$DatabaseInputs=$DatabaseEntries.Count
$RulesDirectory=Join-Path $Evidence "oa-approval-key-checks-20261015-$RulesRound"
$Rules=Json (Join-Path $RulesDirectory 'result.json')
Require ($Rules.passed -and $Rules.backend -eq $BackendRound -and $Rules.inputsUnchanged -and $Rules.assertions -eq 216700 -and $Rules.actualConsumerExecuted -and $Rules.workflowTransportDoubled -and -not $Rules.actualDatabase) 'Actual approval identity checks are incomplete'
$RulesInputs=Manifest (Join-Path $RulesDirectory 'inputs.json')
$IndependentDirectory=Join-Path $Evidence "f2-suppliers-independent-20261012-$IndependentRound"
$Launcher=Json (Join-Path $IndependentDirectory 'launcher-result.json')
$Business=Json (Join-Path $IndependentDirectory 'result.json')
$Original=Json (Join-Path $IndependentDirectory 'original-business-result.json')
Require ($Launcher.passed -and $Launcher.verifierExit -eq 0 -and $Launcher.inputsUnchanged -and $Launcher.processesStopped -and $Launcher.referenceKept) 'F2 original execution or preservation failed'
Require ($Launcher.backend -eq $BackendRound -and $Launcher.frontend -eq $FrontendRound -and $Launcher.scenario -eq 'SupplierGovernance') 'F2 independent version mismatch'
Require ($Business.passed -and $Business.verifierExit -eq 0 -and $Original.passed -and -not $Original.failure) 'F2 original HTTP checks did not complete'
Require ($Business.backend -eq $BackendRound -and $Business.frontend -eq $FrontendRound -and $Business.scenario -eq 'SupplierGovernance' -and $Business.backendHttp -and -not $Business.apiDoubles) 'F2 original application evidence differs'
$null=Track $Business.sourceResult $Business.sourceResultHash
Require ((Get-FileHash -LiteralPath (Join-Path $IndependentDirectory 'original-business-result.json')).Hash -eq $Business.sourceResultHash) 'F2 retained business result differs from executed original'
$IndependentInputs=Manifest (Join-Path $IndependentDirectory 'inputs.json')
$RuntimeInputs=Manifest (Join-Path $IndependentDirectory 'runtime-inputs.json')
$Protection=Json (Join-Path $IndependentDirectory 'runtime-after.json')
Require ($Protection.passed -and $Protection.leaks -eq 0 -and $Protection.databaseLeaks -eq 0 -and $Protection.counterWrites -eq 0 -and $Protection.configurationWrites -eq 0) 'F2 runtime/log protection failed'
Require (-not $Launcher.priorRuntimeWritten -and -not $Launcher.externalMessagesSent -and -not $Launcher.systemClockChanged -and $Launcher.captchaCounterWrites -eq 0 -and $Launcher.captchaConfigurationWrites -eq 0) 'F2 isolated verification boundary changed'
$RequiredFlags=@{
    1=@('profile','deletion','permissions','desktop','mobile');2=@('categories','deletion');3=@('qualifications','files','permissions')
    4=@('expiry','periodicJobs');5=@('earliestExpiry');6=@('weights','scoring','periodicJobs')
    7=@('scoring');8=@('delivery');9=@('confirmation','periodProtection');10=@('eliminated','hits')
    11=@('blacklist','bypass','desktop','mobile','mobileNarrow');12=@('expiryAdmission');13=@('warning','hits')
    14=@('liveRules');15=@('governance','audit');16=@('downgrade');17=@('reports','reportCharts','desktop','mobile','mobileNarrow');18=@('hits','audit','permissions')
}
$Items=@(foreach($Id in 1..18){
    foreach($Flag in $RequiredFlags[$Id]){
        Require ($Original.evidence.$Flag -eq $true -and $Business.sourceEvidence.$Flag -eq $true) ("Actual F2 acceptance flag missing: AC-$Id/$Flag")
    }
    $Checks=@($Original.checks|Where-Object{$_ -match '^AC-([0-9]+(?:/[0-9]+)*)(?:\s|/FR-)' -and $Matches[1].Split('/') -contains [string]$Id})
    Require ($Checks.Count -gt 0) ("Actual F2 assertion missing: AC-$Id")
    [pscustomobject]@{Acceptance="AC-$Id";Passed=$true;Flags=$RequiredFlags[$Id];ActualAssertions=$Checks}
})
$Review=Json $ImageReviewPath
Require ($Review.Round -eq $IndependentRound -and $Review.ActuallyViewed -eq $true -and $Review.VisualAccepted -eq $true) 'F2 direct image review is incomplete'
Require ($Review.Images.Count -eq $Business.images.Count -and $Review.Images.Count -gt 0) 'F2 image review does not cover every original screenshot'
foreach($Image in $Business.images){
    $Reviewed=@($Review.Images|Where-Object Name -EQ $Image.name)
    Require ($Reviewed.Count -eq 1 -and $Reviewed[0].ActuallyViewed -eq $true -and $Reviewed[0].VisualAccepted -eq $true -and $Reviewed[0].Hash -eq $Image.hash) 'F2 screenshot is missing a successful direct review'
    $null=Track (Join-Path $IndependentDirectory $Image.name) $Image.hash
}
$AuditObservations=Json (Join-Path $Launcher.run ('f2-audit-observations-'+$Original.caseTag+'.json'))
Require ($AuditObservations.observations.Count -eq 8 -and @($AuditObservations.observations|Where-Object passed -NE $true).Count -eq 0) 'F2 actual before/after audits are incomplete'
$Conversion=Json $Review.ConversionManifest
Require ($Conversion.ConvertedCount -eq $Review.Images.Count -and $Review.SourceResultHash -eq $Conversion.SourceResultHash) 'F2 JPEG conversion is not bound to this original result'
$null=Track $Review.SourceResult $Review.SourceResultHash
foreach($Image in $Review.Images){
    Require ($Image.ReviewPath.EndsWith('.jpg',[StringComparison]::OrdinalIgnoreCase)) 'F2 screenshot review must use JPEG'
    $null=Track $Image.ReviewPath $Image.ReviewHash
    $null=Track $Image.SourcePath $Image.SourceHash
}
$Receipts=@(Json $TerminalReceiptsPath)
foreach($Name in @(('backend'+$BackendRound.Substring(1)),('frontend'+$FrontendRound.Substring(1)),('packages'+$PackageRound.Substring(1)),('database'+$DatabaseRound.Substring(1)),('independent'+$IndependentRound.Substring(1)),('approvalRules'+$RulesRound.Substring(1)))){
    $Receipt=@($Receipts|Where-Object Name -EQ $Name)
    Require ($Receipt.Count -eq 1 -and $Receipt[0].TerminalCollected -and $Receipt[0].Exit -eq 0 -and [string]$Receipt[0].Chunk -match '^[a-f0-9]+$') 'F2 successful original process receipt missing'
}
$Reference=Json (Join-Path $Root '.cloudflow-runtime/batch-g-integration/9799534e1a3a47b5958330f14ae16dc7/state.json')
Require ($Reference.status -eq 'RUNNING' -and $Reference.processes.Count -eq 9 -and $Reference.services.Count -eq 6) 'F2 reference runtime changed'
foreach($Entry in $Reference.processes){
    $Observed=Get-CimInstance Win32_Process -Filter "ProcessId=$($Entry.id)"
    Require ($Observed -and $Observed.CommandLine.Contains($Entry.marker)) 'F2 reference process ownership differs'
}
foreach($Service in $Reference.services){Require ((Invoke-RestMethod -Uri "http://127.0.0.1:$($Service.healthPort)/actuator/health" -TimeoutSec 15).status -eq 'UP') 'F2 reference service unhealthy'}
$Failures=@(foreach($Directory in Get-ChildItem -LiteralPath $Evidence -Directory|Where-Object Name -Match '^f2-(?:supplier-checks|suppliers-independent)-20261012-r[1-9][0-9]*$'){
    $ResultPath=Join-Path $Directory.FullName 'result.json'
    if(Test-Path -LiteralPath $ResultPath){
        $Prior=Get-Content -LiteralPath $ResultPath -Raw|ConvertFrom-Json -Depth 100
        if($Prior.passed -eq $false){
            $null=Track $ResultPath
            $LauncherPath=Join-Path $Directory.FullName 'launcher-result.json'
            if(Test-Path -LiteralPath $LauncherPath){$null=Track $LauncherPath}
            $OriginalPath=Join-Path $Directory.FullName 'original-business-result.json'
            if(Test-Path -LiteralPath $OriginalPath){$null=Track $OriginalPath}
            [pscustomobject]@{Round=$Directory.Name;OriginalResult=$ResultPath;Hash=$Inputs[$ResultPath];Passed=$false;Failure=$Prior.failure;Retained=$true}
        }
    }
})
$HistoricalVisualReviews=@(foreach($Directory in Get-ChildItem -LiteralPath $Evidence -Directory|Where-Object Name -Match '^f2-suppliers-image-review-20261015-r[1-9][0-9]*$'){
    $PriorReviewPath=Join-Path $Directory.FullName 'manifest.json'
    if(Test-Path -LiteralPath $PriorReviewPath){
        $PriorReview=Json $PriorReviewPath
        [pscustomobject]@{Round=$PriorReview.Round;Passed=$PriorReview.VisualAccepted;ActuallyViewed=$PriorReview.ActuallyViewed;Review=$PriorReviewPath;Hash=$Inputs[$PriorReviewPath];Retained=$true}
    }
})
$null=Track $PSCommandPath
$null=Track (Join-Path $Output 'original.ps1') $Inputs[$PSCommandPath]
foreach($Path in $Inputs.Keys){Require ((Get-FileHash -LiteralPath $Path).Hash -eq $Inputs[$Path]) ("F2 reconciliation input changed: "+$Path)}
@($Inputs.Keys|Sort-Object|ForEach-Object{[pscustomobject]@{Path=$_;Hash=$Inputs[$_]}})|ConvertTo-Json -Depth 3|Set-Content -LiteralPath (Join-Path $Output 'inputs.json') -Encoding utf8NoBOM
[pscustomobject]@{
    Passed=$true;All18Complete=$true;AcceptanceCount=18;Items=$Items;Scope='Local functional acceptance';GlobalComplete=$false
    Backend=$BackendRound;Frontend=$FrontendRound;Packages=$PackageRound;Database=$DatabaseRound;Independent=$IndependentRound
    ActualChecks=$Original.checks.Count;RecordedRequests=$Original.requests.Count;DatabaseAssertions=$DatabaseBusiness.assertions
    DatabaseBackend=$Database.backend;DatabaseSinceChanges=$DatabaseChanges;ApprovalRulesAssertions=$Rules.assertions;RulesInputs=$RulesInputs;ReviewedImages=$Review.Images.Count;ImageReview=$ImageReviewPath
    CurrentInputs=$Inputs.Count;DatabaseInputs=$DatabaseInputs;IndependentInputs=$IndependentInputs;RuntimeInputs=$RuntimeInputs;InputChanges=0
    ReferenceBusinessTables=$Launcher.referenceBusinessTables;ReferenceKept=$true;IndependentProcessesStopped=$true;DatabaseRetained=$true
    OriginalTerminalReceipts=$Receipts;HistoricalFailureReports=$Failures;HistoricalVisualReviews=$HistoricalVisualReviews;OriginalFailureResultsChanged=$false
    CaptchaCounterWrites=0;CaptchaConfigurationWrites=0;SecretScan=$Protection;ExternalMessagesSent=$false;SystemClockChanged=$false
    ReferenceRuntimeUpdated=$false;ProductModified=$false;ProductionModified=$false
}|ConvertTo-Json -Depth 50|Set-Content -LiteralPath (Join-Path $Output 'result.json') -Encoding utf8NoBOM
"F2_ALL_ACCEPTANCE: passed=true; items=18; checks=$($Original.checks.Count); inputs=$($Inputs.Count); images=$($Review.Images.Count); all18_complete=true; global_complete=false"
