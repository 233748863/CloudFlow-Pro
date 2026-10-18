param(
    [Parameter(Mandatory=$true)][ValidatePattern('^r[1-9][0-9]*$')][string]$Round,
    [Parameter(Mandatory=$true)][ValidatePattern('^r[1-9][0-9]*$')][string]$BackendRound,
    [Parameter(Mandatory=$true)][ValidatePattern('^r[1-9][0-9]*$')][string]$FrontendRound,
    [Parameter(Mandatory=$true)][ValidatePattern('^r[1-9][0-9]*$')][string]$PackageRound,
    [Parameter(Mandatory=$true)][ValidatePattern('^r[1-9][0-9]*$')][string]$DatabaseRound,
    [Parameter(Mandatory=$true)][ValidatePattern('^r[1-9][0-9]*$')][string]$IndependentRound,
    [Parameter(Mandatory=$true)][string]$ImageReviewPath,
    [Parameter(Mandatory=$true)][string]$TerminalReceiptsPath)
$ErrorActionPreference='Stop'
. 'D:\CloudFlowPro\.cloudflow-runtime\use-data-drive.ps1'
$Root='D:\CloudFlowPro'
$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
$Output=Join-Path $Evidence "f1-all-acceptance-20261012-$Round"
if(Test-Path -LiteralPath $Output){throw 'Retain original F1 acceptance evidence; choose a new round'}
[IO.Directory]::CreateDirectory($Output)|Out-Null
[IO.File]::Copy($PSCommandPath,(Join-Path $Output 'original.ps1'),$false)
$Inputs=@{}
function Require([bool]$Condition,[string]$Message){if(-not $Condition){throw $Message}}
function Track([string]$File,[string]$Expected=''){
    $Path=[IO.Path]::GetFullPath($File,$Root)
    Require ($Path.StartsWith($Root+'\',[StringComparison]::OrdinalIgnoreCase) -or $Path.StartsWith('D:\CloudFlowProCache\',[StringComparison]::OrdinalIgnoreCase)) 'F1 evidence outside workspace/cache'
    Require (-not ((Get-Item -LiteralPath $Path).Attributes -band [IO.FileAttributes]::ReparsePoint)) 'Redirected F1 evidence rejected'
    if(-not $Inputs.ContainsKey($Path)){$Inputs[$Path]=(Get-FileHash -LiteralPath $Path).Hash}
    if($Expected){Require ($Inputs[$Path] -eq $Expected) ("F1 recorded input differs: "+$Path)}
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
    Require ($Log.Contains("FINANCE_BUILD: phase=$($Build.Phase); files=$Count; changed=0; exit=0")) 'Original successful F1 build result missing'
}
$PackageDirectory=Join-Path $Evidence "backend-executable-verification-20261006-$PackageRound"
$Packages=Json (Join-Path $PackageDirectory 'result.json')
Require ($Packages.Passed -and $Packages.BackendRound -eq $BackendRound -and $Packages.InputChanges -eq 0 -and $Packages.Services.Count -eq 6) 'Current F1 packages not verified'
$null=Manifest (Join-Path $PackageDirectory 'inputs.json')
foreach($Package in $Packages.Services){
    $Built=Track $Package.Path $Package.Hash
    $null=Track (Join-Path $PackageDirectory "$($Package.Name)/$(Split-Path -Leaf $Built)") $Package.Hash
}
$DatabaseDirectory=Join-Path $Evidence "f1-asset-checks-20261012-$DatabaseRound"
$Database=Json (Join-Path $DatabaseDirectory 'result.json')
Require ($Database.passed -and $Database.inputsUnchanged -and $Database.backend -eq $BackendRound -and $Database.phase -eq 'Performance') 'Latest F1 database/performance execution did not pass'
$DatabaseInputs=Manifest (Join-Path $DatabaseDirectory 'inputs.json')
$DatabaseLog=Get-Content -LiteralPath (Track (Join-Path $DatabaseDirectory 'live.log')) -Raw
$Performance=@(foreach($Kind in @('PERFORMANCE','REGENERATION')){
    $Match=[regex]::Match($DatabaseLog,"(?m)^F1_PLAN_${Kind}: samples=([0-9]+); maximumMs=([0-9.]+); actualDatabase=true; actualTransactions=true; includesPersistence=true; http=false; thresholdMs=100")
    Require ($Match.Success) 'Actual F1 timing and persistence evidence missing'
    $Maximum=[decimal]::Parse($Match.Groups[2].Value,[Globalization.CultureInfo]::InvariantCulture)
    Require ($Maximum -lt 100) 'F1 plan generation exceeds the original performance requirement'
    [pscustomobject]@{Kind=$Kind;Samples=[int]$Match.Groups[1].Value;MaximumMilliseconds=$Maximum;IncludesPersistence=$true;IncludesCommit=$true;IncludesHttp=$false}
})
Require ($Performance[0].Samples -eq 27 -and $Performance[1].Samples -eq 33) 'F1 required timing cases missing'
$IndependentDirectory=Join-Path $Evidence "f1-assets-independent-20261012-$IndependentRound"
$Launcher=Json (Join-Path $IndependentDirectory 'launcher-result.json')
$Business=Json (Join-Path $IndependentDirectory 'result.json')
$Original=Json (Join-Path $IndependentDirectory 'original-business-result.json')
Require ($Launcher.passed -and $Launcher.verifierExit -eq 0 -and $Launcher.inputsUnchanged -and $Launcher.processesStopped -and $Launcher.referenceKept) 'F1 original execution or preservation failed'
Require ($Launcher.backend -eq $BackendRound -and $Launcher.frontend -eq $FrontendRound -and $Launcher.scenario -eq 'AssetLifecycle') 'F1 independent version mismatch'
Require ($Business.passed -and $Business.verifierExit -eq 0 -and $Original.passed -and -not $Original.failure) 'F1 original HTTP checks did not complete'
Require ($Business.backend -eq $BackendRound -and $Business.frontend -eq $FrontendRound -and $Business.scenario -eq 'AssetLifecycle' -and $Business.backendHttp -and -not $Business.apiDoubles) 'F1 original application evidence differs'
$null=Track $Business.sourceResult $Business.sourceResultHash
Require ((Get-FileHash -LiteralPath (Join-Path $IndependentDirectory 'original-business-result.json')).Hash -eq $Business.sourceResultHash) 'F1 retained business result differs from executed original'
$IndependentInputs=Manifest (Join-Path $IndependentDirectory 'inputs.json')
$RuntimeInputs=Manifest (Join-Path $IndependentDirectory 'runtime-inputs.json')
$Protection=Json (Join-Path $IndependentDirectory 'runtime-after.json')
Require ($Protection.passed -and $Protection.leaks -eq 0 -and $Protection.databaseLeaks -eq 0 -and $Protection.counterWrites -eq 0 -and $Protection.configurationWrites -eq 0) 'F1 runtime/log protection failed'
Require (-not $Launcher.priorRuntimeWritten -and -not $Launcher.externalMessagesSent -and -not $Launcher.systemClockChanged -and $Launcher.captchaCounterWrites -eq 0 -and $Launcher.captchaConfigurationWrites -eq 0) 'F1 isolated verification boundary changed'
$RequiredFlags=@{
    1=@('categories','deletion');2=@('annualAmounts');3=@('preview');4=@('posting','asyncThousand')
    5=@('posting','asyncThousand');6=@('posting','asyncThousand');7=@('movements');8=@('history','capitalization')
    9=@('expiry');10=@('maintenance');11=@('repairEntry');12=@('repairStates');13=@('capitalization')
    14=@('extension');15=@('movements');16=@('timeline');17=@('asyncThousand');18=@('ledger','desktop','mobile');19=@('audit','permissions')
}
$Items=@(foreach($Id in 1..19){
    foreach($Flag in $RequiredFlags[$Id]){
        Require ($Original.evidence.$Flag -eq $true -and $Business.sourceEvidence.$Flag -eq $true) ("Actual F1 acceptance flag missing: AC-$Id/$Flag")
    }
    $Checks=@($Original.checks|Where-Object{$_ -match '^AC-([0-9]+(?:/[0-9]+)*)\s' -and $Matches[1].Split('/') -contains [string]$Id})
    Require ($Checks.Count -gt 0) ("Actual F1 assertion missing: AC-$Id")
    [pscustomobject]@{Acceptance="AC-$Id";Passed=$true;Flags=$RequiredFlags[$Id];ActualAssertions=$Checks}
})
$Review=Json $ImageReviewPath
Require ($Review.Round -eq $IndependentRound -and $Review.ActuallyViewed -eq $true -and $Review.VisualAccepted -eq $true) 'F1 direct image review is incomplete'
Require ($Review.Images.Count -eq $Business.images.Count -and $Review.Images.Count -gt 0) 'F1 image review does not cover every original screenshot'
foreach($Image in $Business.images){
    $Reviewed=@($Review.Images|Where-Object Name -EQ $Image.name)
    Require ($Reviewed.Count -eq 1 -and $Reviewed[0].ActuallyViewed -eq $true -and $Reviewed[0].VisualAccepted -eq $true -and $Reviewed[0].Hash -eq $Image.hash) 'F1 screenshot is missing a successful direct review'
    $null=Track (Join-Path $IndependentDirectory $Image.name) $Image.hash
}
$Thousand=Json (Join-Path $Launcher.run ('f1-thousand-'+$Original.caseTag+'.json'))
Require ($Thousand.assets -eq 1000 -and $Thousand.affectedRows -eq 1000 -and $Thousand.repeatedAffectedRows -eq 0 -and $Thousand.actualSqlLock -and $Thousand.acceptedMilliseconds -lt 10000 -and $Thousand.businessResponseDoubles -eq 0) 'F1 actual thousand-asset asynchronous result missing'
Require ($Thousand.auditRows -eq 1000 -and $Thousand.repeatedAuditRows -eq 0) 'F1 actual thousand-asset audits or replay preservation missing'
$Receipts=@(Json $TerminalReceiptsPath)
foreach($Name in @(('backend'+$BackendRound.Substring(1)),('frontend'+$FrontendRound.Substring(1)),('packages'+$PackageRound.Substring(1)),('database'+$DatabaseRound.Substring(1)),('independent'+$IndependentRound.Substring(1)))){
    $Receipt=@($Receipts|Where-Object Name -EQ $Name)
    Require ($Receipt.Count -eq 1 -and $Receipt[0].TerminalCollected -and $Receipt[0].Exit -eq 0 -and [string]$Receipt[0].Chunk -match '^[a-f0-9]+$') 'F1 successful original process receipt missing'
}
$Reference=Json (Join-Path $Root '.cloudflow-runtime/batch-g-integration/9799534e1a3a47b5958330f14ae16dc7/state.json')
Require ($Reference.status -eq 'RUNNING' -and $Reference.processes.Count -eq 9 -and $Reference.services.Count -eq 6) 'F1 reference runtime changed'
foreach($Entry in $Reference.processes){
    $Observed=Get-CimInstance Win32_Process -Filter "ProcessId=$($Entry.id)"
    Require ($Observed -and $Observed.CommandLine.Contains($Entry.marker)) 'F1 reference process ownership differs'
}
foreach($Service in $Reference.services){Require ((Invoke-RestMethod -Uri "http://127.0.0.1:$($Service.healthPort)/actuator/health" -TimeoutSec 15).status -eq 'UP') 'F1 reference service unhealthy'}
$Failures=@(foreach($Directory in Get-ChildItem -LiteralPath $Evidence -Directory|Where-Object Name -Match '^f1-(?:asset-checks|assets-independent)-20261012-r[1-9][0-9]*$'){
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
$null=Track $PSCommandPath
$null=Track (Join-Path $Output 'original.ps1') $Inputs[$PSCommandPath]
foreach($Path in $Inputs.Keys){Require ((Get-FileHash -LiteralPath $Path).Hash -eq $Inputs[$Path]) ("F1 reconciliation input changed: "+$Path)}
@($Inputs.Keys|Sort-Object|ForEach-Object{[pscustomobject]@{Path=$_;Hash=$Inputs[$_]}})|ConvertTo-Json -Depth 3|Set-Content -LiteralPath (Join-Path $Output 'inputs.json') -Encoding utf8NoBOM
[pscustomobject]@{
    Passed=$true;All19Complete=$true;AcceptanceCount=19;Items=$Items;Scope='Local functional acceptance';GlobalComplete=$false
    Backend=$BackendRound;Frontend=$FrontendRound;Packages=$PackageRound;Database=$DatabaseRound;Independent=$IndependentRound
    ActualChecks=$Original.checks.Count;RecordedRequests=$Original.requests.Count;DatabaseAssertions=$Database.boundaryAssertions
    Performance=$Performance;ThousandAssetPosting=$Thousand;ReviewedImages=$Review.Images.Count;ImageReview=$ImageReviewPath
    CurrentInputs=$Inputs.Count;DatabaseInputs=$DatabaseInputs;IndependentInputs=$IndependentInputs;RuntimeInputs=$RuntimeInputs;InputChanges=0
    ReferenceBusinessTables=$Launcher.referenceBusinessTables;ReferenceKept=$true;IndependentProcessesStopped=$true;DatabaseRetained=$true
    OriginalTerminalReceipts=$Receipts;HistoricalFailureReports=$Failures;OriginalFailureResultsChanged=$false
    CaptchaCounterWrites=0;CaptchaConfigurationWrites=0;SecretScan=$Protection;ExternalMessagesSent=$false;SystemClockChanged=$false
    ReferenceRuntimeUpdated=$false;ProductModified=$false;ProductionModified=$false
}|ConvertTo-Json -Depth 50|Set-Content -LiteralPath (Join-Path $Output 'result.json') -Encoding utf8NoBOM
"F1_ALL_ACCEPTANCE: passed=true; items=19; checks=$($Original.checks.Count); inputs=$($Inputs.Count); images=$($Review.Images.Count); all19_complete=true; global_complete=false"
