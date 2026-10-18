param([ValidatePattern('^r[1-9][0-9]*$')][string]$Round='r1')
$ErrorActionPreference='Stop'
. 'D:\CloudFlowPro\.cloudflow-runtime\use-data-drive.ps1'
$Root='D:\CloudFlowPro'
$CacheRoot='D:\CloudFlowProCache'
$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
$Reference=Join-Path $Root '.cloudflow-runtime/batch-g-integration/9799534e1a3a47b5958330f14ae16dc7'
$Output=Join-Path $Evidence "h3-performance-stage-20261010-$Round"
if(Test-Path -LiteralPath $Output){throw 'Retain previous H3 performance reconciliation'}
[IO.Directory]::CreateDirectory($Output)|Out-Null
[IO.File]::Copy($PSCommandPath,(Join-Path $Output 'original.ps1'),$false)
$Inputs=@{}
$Archives=@{}
$Bindings=[Collections.Generic.List[object]]::new()
function Require([bool]$Condition,[string]$Message){if(-not $Condition){throw $Message}}
function Full([string]$File){[IO.Path]::GetFullPath($File,$Root)}
function Json([string]$File){Get-Content -LiteralPath $File -Raw|ConvertFrom-Json -Depth 100}
function Hash([string]$File){
    $Before=Get-Item -LiteralPath $File
    $Length=$Before.Length;$Written=$Before.LastWriteTimeUtc
    $Stream=[IO.File]::Open($File,[IO.FileMode]::Open,[IO.FileAccess]::Read,([IO.FileShare]::ReadWrite -bor [IO.FileShare]::Delete))
    try{$Digest=(Get-FileHash -InputStream $Stream).Hash}finally{$Stream.Dispose()}
    $After=Get-Item -LiteralPath $File
    Require ($Length -eq $After.Length -and $Written -eq $After.LastWriteTimeUtc) 'Evidence changed during read'
    return $Digest
}
function Track([string]$File,[string]$Expected=''){
    $Path=Full $File
    Require ($Path.StartsWith($Root+'\',[StringComparison]::OrdinalIgnoreCase) -or $Path.StartsWith($CacheRoot+'\',[StringComparison]::OrdinalIgnoreCase)) 'Input outside approved data drive'
    Require (-not ((Get-Item -LiteralPath $Path).Attributes -band [IO.FileAttributes]::ReparsePoint)) 'Redirected input rejected'
    if(-not $Inputs.ContainsKey($Path)){$Inputs[$Path]=Hash $Path}
    if($Expected){Require ($Inputs[$Path] -eq $Expected) ("Input changed: "+$Path)}
    return $Path
}
function Manifest([string]$File){
    $null=Track $File
    $Index=@{}
    foreach($Entry in @(Json $File)){
        $Path=Full $Entry.Path
        Require (-not $Index.ContainsKey($Path) -or $Index[$Path] -eq $Entry.Hash) 'Conflicting execution input'
        $Index[$Path]=$Entry.Hash
    }
    return $Index
}
function Archive([string]$Directory){
    foreach($File in Get-ChildItem -LiteralPath $Directory -Recurse -File){
        $Path=Track $File.FullName
        $Archives[$Inputs[$Path]]=$Path
    }
}
function Bind([hashtable]$Index){
    foreach($Path in $Index.Keys){
        $Expected=$Index[$Path]
        if($Inputs.ContainsKey($Path) -and $Inputs[$Path] -eq $Expected){continue}
        if(-not $Inputs.ContainsKey($Path) -and (Test-Path -LiteralPath $Path -PathType Leaf) -and (Hash $Path) -eq $Expected){$null=Track $Path $Expected;continue}
        Require ($Archives.ContainsKey($Expected)) ("Executed original unavailable: "+$Path)
        $Copy=Track $Archives[$Expected] $Expected
        $Bindings.Add([pscustomobject]@{ExecutedPath=$Path;Hash=$Expected;PreservedAt=$Copy})
    }
}
$Preparations=@('h3-performance-prep-20261010-r1','h3-performance-presentation-prep-20261010-r1',
    'h3-performance-classpath-20261010-r1','h3-performance-validation-prep-20261010-r1',
    'h3-performance-deployment-prep-20261010-r1','h3-performance-deployment-prep-20261010-r2')
foreach($Name in $Preparations){Archive (Join-Path $Evidence $Name)}
foreach($Prior in Get-ChildItem -LiteralPath $Evidence -Directory|Where-Object{$_.Name -match '^h3-performance-stage-20261010-r([1-9][0-9]*)$' -and [int]$Matches[1] -lt [int]$Round.Substring(1)}){Archive $Prior.FullName}
foreach($Version in @('r34','r35')){Archive (Join-Path $Evidence "backend-executable-verification-20261006-$Version")}
foreach($Version in @('r1','r2','r3','r4')){Archive (Join-Path $Evidence "h3-performance-independent-20261010-$Version")}
$DatabaseDirectory=Join-Path $Evidence 'h3-performance-database-20261010-r3'
$AvailabilityDirectory=Join-Path $Evidence 'h3-performance-availability-20261010-r6'
$DeploymentDirectory=Join-Path $Evidence 'e1-reminder-deployment-20261007-r14'
foreach($Directory in @($DatabaseDirectory,$AvailabilityDirectory,$DeploymentDirectory)){Archive $Directory}
foreach($Name in $Preparations){
    $Before=Join-Path $Evidence "$Name/before-inputs.json"
    if(Test-Path -LiteralPath $Before){Bind (Manifest $Before)}
}
$Builds=@{}
foreach($Build in @(@{Kind='backend';Version='r147';Phase='Backend';Count=3854},@{Kind='frontend';Version='r101';Phase='Frontend';Count=1483})){
    $Index=Manifest (Join-Path $Evidence "h3-portal-finance-20261002-$($Build.Kind)-$($Build.Version)-inputs.json")
    Require ($Index.Count -eq $Build.Count) 'Current build input count differs'
    foreach($Path in $Index.Keys){$null=Track $Path $Index[$Path]}
    $Builds[$Build.Kind]=$Index
    $Log=Track (Join-Path $Evidence "h3-portal-finance-20261002-$($Build.Kind)-$($Build.Version).log")
    Require ((Get-Content -LiteralPath $Log -Raw).Contains("FINANCE_BUILD: phase=$($Build.Phase); files=$($Build.Count); changed=0; exit=0")) 'Original build did not complete'
}
$ExpectedProduct=@((Json (Join-Path $Evidence 'h3-performance-prep-20261010-r1/before-inputs.json')).Path)+
    @((Json (Join-Path $Evidence 'h3-performance-prep-20261010-r1/result.json')).NewFiles)
$ProductImpact=@()
foreach($Build in @(@{Kind='backend';Version='r145'},@{Kind='frontend';Version='r97'})){
    $Before=Manifest (Join-Path $Evidence "h3-portal-finance-20261002-$($Build.Kind)-$($Build.Version)-inputs.json")
    $After=$Builds[$Build.Kind]
    foreach($Path in $After.Keys|Where-Object{$Before[$_] -ne $After[$_]}){
        Require ($ExpectedProduct -contains $Path) ("Unexpected performance product change: "+$Path)
        if($Before.ContainsKey($Path)){
            Require ($Archives.ContainsKey($Before[$Path])) 'Original product source missing'
            $null=Track $Archives[$Before[$Path]] $Before[$Path]
        }
        $ProductImpact+=@{Path=$Path;BeforeHash=$Before[$Path];AfterHash=$After[$Path];Added=(-not $Before.ContainsKey($Path))}
    }
    Require (@($Before.Keys|Where-Object{-not $After.ContainsKey($_)}).Count -eq 0) 'Product input was removed'
}
$Database=Json (Join-Path $DatabaseDirectory 'result.json')
Require ($Database.Passed -and $Database.Backend -eq 'r146' -and $Database.Assertions -eq 111 -and $Database.InputChanges -eq 0 -and
    $Database.ActualDependenciesBound -and $Database.OriginalProcessesKept -and $Database.IndependentDatabaseStopped) 'Original B146 database proof incomplete'
foreach($Name in @('inputs.json','runtime-inputs.json','compiled-inputs.json')){Bind (Manifest (Join-Path $DatabaseDirectory $Name))}
$Baseline=Manifest (Join-Path $Evidence 'h3-portal-finance-20261002-backend-r146-inputs.json')
$BackendChanges=@($Builds.backend.Keys|Where-Object{$Baseline[$_] -ne $Builds.backend[$_]})
Require ($BackendChanges.Count -eq 1 -and $BackendChanges[0] -eq (Full 'cloudflow-backend/cloudflow-service-hr/src/main/java/com/cloudflow/hr/controller/HrCrmPerformanceController.java')) 'B147 changes more than HR filter validation'
$Availability=Json (Join-Path $AvailabilityDirectory 'result.json')
Require ($Availability.Passed -and $Availability.Backend -eq 'r147' -and $Availability.Frontend -eq 'r101' -and $Availability.UiChecks -eq 44 -and $Availability.InputChanges -eq 0 -and $Availability.ApiDoubles -and -not $Availability.BackendHttp) 'Controlled availability proof differs'
foreach($Name in @('inputs.json','runtime-inputs.json')){Bind (Manifest (Join-Path $AvailabilityDirectory $Name))}
Require ((Get-Content -LiteralPath (Join-Path $AvailabilityDirectory 'java.log') -Raw).Contains('checks=358; failed=0;')) 'Filter and fallback Java checks missing'
$AvailabilityReview=Json (Track (Join-Path $Evidence 'h3-performance-image-review-20261010-r6/manifest.json'))
Require ($AvailabilityReview.Images.Count -eq 12 -and $AvailabilityReview.ApiDoubles -and -not $AvailabilityReview.RealBusinessAcceptance) 'Controlled image scope differs'
$PriorReview=Json (Track $AvailabilityReview.PriorReview)
foreach($Image in $AvailabilityReview.Images){
    $Prior=@($PriorReview.Images|Where-Object Hash -EQ $Image.Hash)
    Require ($Image.Viewed -and $Image.Accepted -and $Image.Method -eq 'same_bytes_as_previously_viewed' -and $Prior.Count -eq 1 -and $Prior[0].Viewed -and $Prior[0].Accepted) 'Controlled image review absent'
    $null=Track $Image.Path $Image.Hash
    $null=Track $Image.PriorViewedPath $Image.Hash
}
$History=@()
foreach($Version in @('r1','r2','r3','r4')){
    $Directory=Join-Path $Evidence "h3-performance-independent-20261010-$Version"
    $Launcher=Json (Join-Path $Directory 'launcher-result.json')
    $ExpectedBackend=if($Version -eq 'r4'){'r147'}else{'r146'}
    Require ($Launcher.backend -eq $ExpectedBackend -and $Launcher.frontend -eq 'r101' -and $Launcher.inputsUnchanged -and $Launcher.processesStopped -and
        $Launcher.referenceKept -and $Launcher.referenceBusinessTables -eq 46 -and $Launcher.stopErrors.Count -eq 0 -and
        $Launcher.captchaCounterWrites -eq 0 -and $Launcher.captchaConfigurationWrites -eq 0 -and -not $Launcher.priorRuntimeWritten -and
        -not $Launcher.externalMessagesSent -and -not $Launcher.systemClockChanged) 'Independent preservation or version differs'
    $SourceInputs=Manifest (Join-Path $Directory 'inputs.json')
    $RuntimeInputs=Manifest (Join-Path $Directory 'runtime-inputs.json')
    Bind $SourceInputs;Bind $RuntimeInputs
    Require ($SourceInputs.Count -eq $Launcher.inputs -and $RuntimeInputs.Count -eq $Launcher.runtimeInputs -and
        @(Get-ChildItem -LiteralPath (Join-Path $Directory 'originals') -Recurse -File).Count -eq $Launcher.executionOriginals) 'Independent inventory differs'
    $Before=Json (Join-Path $Directory 'reference-business-before.json')
    $After=Json (Join-Path $Directory 'reference-business-after.json')
    Require (@($Before.PSObject.Properties).Count -eq 46) 'Original table coverage differs'
    foreach($Property in $Before.PSObject.Properties){Require ($After.($Property.Name) -eq $Property.Value) 'Original business changed'}
    $Stopped=Json (Track (Join-Path $Launcher.run 'state.json'))
    Require ($Stopped.status -eq 'STOPPED') 'Independent environment is running'
    foreach($Entry in $Stopped.processes){
        $Observed=Get-CimInstance Win32_Process -Filter "ProcessId=$($Entry.id)"
        Require (-not $Observed -or -not $Observed.CommandLine.Contains($Entry.marker)) 'Independent owned process remains'
    }
    Require ($Launcher.passed -eq ($Version -in @('r3','r4'))) 'Historical outcome differs'
    $History+=@{Round=$Version;Backend=$Launcher.backend;Passed=$Launcher.passed;Inputs=$Launcher.inputs;RuntimeInputs=$Launcher.runtimeInputs;Originals=$Launcher.executionOriginals}
}

$CurrentDirectory=Join-Path $Evidence 'h3-performance-independent-20261010-r4'
$Current=Json (Join-Path $CurrentDirectory 'result.json')
$Launcher=Json (Join-Path $CurrentDirectory 'launcher-result.json')
Require ($Current.passed -and $Current.checks.Count -eq 707 -and $Current.requests.Count -eq 203 -and $Current.uiRequests.Count -eq 519 -and
    $Current.browserErrors.Count -eq 0 -and $Current.backendHttp -and -not $Current.apiDoubles -and $Current.privacy.leaks -eq 0) 'Current actual business verification incomplete'
foreach($Property in $Current.evidence.PSObject.Properties){Require ([bool]$Property.Value) ("Actual evidence missing: "+$Property.Name)}
Require ($Launcher.inputs -eq 12394 -and $Launcher.runtimeInputs -eq 6450) 'Current independent input count differs'
foreach($Phase in @(@{Name='cross_month_and_original_allocation_permissions';Checks=345},
    @{Name='actual_contract_receipts_refunds_and_currencies';Checks=274},@{Name='actual_hr_desktop_and_mobile_pages';Checks=64})){
    $Found=@($Current.phases|Where-Object name -EQ $Phase.Name)
    Require ($Found.Count -eq 1 -and $Found[0].checks -eq $Phase.Checks) 'Actual phase coverage differs'
}
foreach($Label in @('actual_reopen_records_current_month_negative_won','reversal_preserves_original_people_departments_roles_and_shares',
    'repeated_reopen_does_not_duplicate_negative_fact','new_won_uses_new_people_and_departments',
    'original_allocations_immutable_after_reopen_and_new_win','two_month_won_total_equals_one_current_won',
    'requested_ranking_limit_applied','legacy_page_explains_estimated_contract_amount','no_uncaught_browser_errors',
    'prior_independent_hr_comp_change_kept','prior_independent_hr_salary_slip_kept','service_and_audit_secrets_kept')){
    Require ($Current.checks -contains $Label) ("Required performance assertion absent: "+$Label)
}
$Invalid=@($Current.requests|Where-Object{$_.actor -eq 'admin' -and $_.path -like '/hr/performance/crm/*' -and $_.code -ne 200})
Require ($Invalid.Count -eq 7 -and @($Invalid|Where-Object{$_.status -ne 200 -or $_.code -ne 400}).Count -eq 0) 'Invalid filters are still reported as service failure'
$Prior=Json (Join-Path $Evidence 'h3-performance-independent-20261010-r3/result.json')
$OldInvalid=@($Prior.requests|Where-Object{$_.actor -eq 'admin' -and $_.path -like '/hr/performance/crm/*' -and $_.code -ne 200})
Require ($Prior.passed -and $OldInvalid.Count -eq 7 -and @($OldInvalid|Where-Object{$_.status -ne 200 -or $_.code -ne 503}).Count -eq 0) 'Original filter-error reproduction changed'
$Reviews=@()
foreach($Definition in @(@{Version='r3';Review='r1'},@{Version='r4';Review='r2'})){
    $ReviewFile=Track (Join-Path $Evidence "h3-performance-runtime-image-review-20261010-$($Definition.Review)/manifest.json")
    $Review=Json $ReviewFile
    $ActualDirectory=Join-Path $Evidence "h3-performance-independent-20261010-$($Definition.Version)"
    $Actual=Json (Join-Path $ActualDirectory 'result.json')
    Require ($Review.Round -eq $Definition.Version -and $Review.ActuallyViewed -and $Review.VisualAccepted -and -not $Review.OriginalResultChanged -and $Review.Images.Count -eq 10) 'Actual image review incomplete'
    foreach($Image in $Review.Images){
        $Metadata=@($Actual.images|Where-Object name -EQ $Image.Name)
        Require ($Image.ActuallyViewed -and $Image.Accepted -and $Image.Method -eq 'direct' -and $Metadata.Count -eq 1 -and
            $Metadata[0].hash -eq $Image.Hash -and -not $Metadata[0].actuallyViewed -and -not $Metadata[0].visualAccepted) 'Original image evidence changed or was not viewed'
        $null=Track (Join-Path $ActualDirectory $Image.Name) $Image.Hash
    }
    $Reviews+=@{Round=$Definition.Version;Images=10;Manifest=$ReviewFile;ActuallyViewed=$true;Accepted=$true}
}
$AdjacentDirectory=Join-Path $Evidence 'h3-portal-finance-adjacent-20261002-r185'
$AdjacentInputs=Manifest (Join-Path $AdjacentDirectory 'inputs.json')
Bind $AdjacentInputs
$AdjacentLog=Get-Content -LiteralPath (Track (Join-Path $AdjacentDirectory 'summary.log')) -Raw
Require ($AdjacentLog.Contains("H3_FINANCE_ADJACENT: files=$($AdjacentInputs.Count); changed=0; exit=0; production_modified=false") -and
    $AdjacentLog.Contains('name=formal-01-07-and-oa-behavior; exit=0')) 'Adjacent checks did not complete'
foreach($File in Get-ChildItem -LiteralPath $AdjacentDirectory -File){$null=Track $File.FullName}
$Packages=Json (Join-Path $Evidence 'backend-executable-verification-20261006-r35/result.json')
Require ($Packages.Passed -and $Packages.BackendRound -eq 'r147' -and $Packages.InputChanges -eq 0 -and $Packages.Services.Count -eq 6) 'Verified six packages incomplete'
Bind (Manifest (Join-Path $Evidence 'backend-executable-verification-20261006-r35/inputs.json'))
Bind (Manifest (Join-Path $DeploymentDirectory 'inputs.json'))
$Deployment=Json (Join-Path $DeploymentDirectory 'result.json')
Require ($Deployment.Passed -and $Deployment.Backend -eq 'r147' -and $Deployment.PackageRound -eq 'r35' -and
    $Deployment.HealthyServices -eq 6 -and $Deployment.InputChanges -eq 0 -and -not $Deployment.ProductionModified) 'Deployment evidence differs'
$State=Json (Track (Join-Path $Reference 'state.json'))
Require ($State.status -eq 'RUNNING' -and $State.processes.Count -eq 9 -and $State.services.Count -eq 6) 'Current runtime incomplete'
foreach($Entry in $State.processes){
    $Observed=Get-CimInstance Win32_Process -Filter "ProcessId=$($Entry.id)"
    Require ($Observed -and $Observed.CommandLine.Contains($Entry.marker)) 'Current owned process differs'
}
$RuntimeFiles=0
foreach($Service in $State.services){
    $Arguments=@(Get-Content -LiteralPath (Track (Join-Path $Reference "$($Service.name)/service.args")))
    $Index=[Array]::IndexOf($Arguments,'-cp')
    Require ($Index -ge 0 -and $Arguments[$Index+2] -eq 'org.springframework.boot.loader.launch.JarLauncher') 'Layered service launch absent'
    $Layer=Full ($Arguments[$Index+1].Trim('"'))
    $Package=@($Packages.Services|Where-Object Name -EQ $Service.name)
    Require ($Package.Count -eq 1 -and $Layer -eq (Join-Path $Reference ("$($Service.name)/artifacts/"+$Package[0].Hash.ToLowerInvariant()+'-layered'))) 'Runtime package differs from B147'
    $null=Track $Package[0].Path $Package[0].Hash
    foreach($File in Get-ChildItem -LiteralPath $Layer -Recurse -File){$null=Track $File.FullName;$RuntimeFiles++}
    Require ((Invoke-RestMethod -Uri "http://127.0.0.1:$($Service.healthPort)/actuator/health" -TimeoutSec 15).status -eq 'UP') 'Current service unhealthy'
}
Require ($RuntimeFiles -eq 6397 -and $RuntimeFiles -eq $Deployment.RuntimeFiles) 'Runtime inventory differs'
$Receipts=@(Json (Track (Join-Path $Evidence 'h3-performance-terminal-receipts-20261010-r1.json')))
foreach($Name in @('backend147','frontend101','database3','availability6','packages35','independent4','deployment14','adjacent185')){
    $Receipt=@($Receipts|Where-Object Name -EQ $Name)
    Require ($Receipt.Count -eq 1 -and $Receipt[0].TerminalCollected -and $Receipt[0].Exit -eq 0 -and [string]$Receipt[0].Chunk -match '^[a-f0-9]+$') 'Successful original terminal receipt missing'
}
foreach($Name in @('independent1','independent2','independent3')){
    $Receipt=@($Receipts|Where-Object Name -EQ $Name)
    $ExpectedExit=if($Name -eq 'independent3'){0}else{1}
    Require ($Receipt.Count -eq 1 -and $Receipt[0].TerminalCollected -and $Receipt[0].Exit -eq $ExpectedExit -and [string]$Receipt[0].Chunk -match '^[a-f0-9]+$') 'Historical original terminal receipt missing'
}
$null=Track $PSCommandPath
$null=Track (Join-Path $Output 'original.ps1') (Hash $PSCommandPath)
foreach($Path in $Inputs.Keys){Require ((Hash $Path) -eq $Inputs[$Path]) ("Stage input changed: "+$Path)}
@($Inputs.Keys|Sort-Object|ForEach-Object{[pscustomobject]@{Path=$_;Hash=$Inputs[$_]}})|ConvertTo-Json -Depth 3|
    Set-Content -LiteralPath (Join-Path $Output 'inputs.json') -Encoding utf8NoBOM
[pscustomobject]@{
    Passed=$true;Backend='r147';Frontend='r101';Acceptance='H3 AC-13';Ac13Complete=$true;AllH3Complete=$false;GlobalComplete=$false
    Checks=707;Requests=203;UiRequests=519;BrowserErrors=0;InvalidFilters=$Invalid;DatabaseVersion='r146';DatabaseChecks=111;AvailabilityJavaChecks=358;AvailabilityUiChecks=44
    Inputs=$Inputs.Count;InputChanges=0;RuntimeFiles=$RuntimeFiles;IndependentInputs=12394;IndependentRuntimeInputs=6450;ReferenceBusinessTables=46;IndependentProcessesStopped=$true
    ReviewedImages=10;ImageReviews=$Reviews;ControlledImages=12;ProductImpact=$ProductImpact;HistoricalRounds=$History;HistoricalInputBindings=@($Bindings.ToArray())
    OriginalTerminalReceipts=$Receipts;Adjacent='r185';AdjacentInputs=$AdjacentInputs.Count;Deployment='r14';Packages='r35';Processes=9;HealthyServices=6
    CaptchaCounterWrites=0;CaptchaConfigurationWrites=0;SystemClockChanged=$false;ExternalMessagesSent=$false;ProductModified=$false;ProductionModified=$false
    BusinessRule='Reversal amount and both win counts belong to reversal month; original month remains unchanged; original employee/department allocations remain immutable'
    HistoricalTimeInputIsFixture=$Current.fixture.crossMonth.historicalTimestampIsFixture
    Remaining=@('H3 AC-14 commission calculation','H3 AC-15 actual payroll and refund recovery','H3 full acceptance and whole-project 35 PRDs / 681 items')
}|ConvertTo-Json -Depth 30|Set-Content -LiteralPath (Join-Path $Output 'result.json') -Encoding utf8NoBOM
"H3_PERFORMANCE_STAGE: passed=true; ac13_complete=true; checks=707; inputs=$($Inputs.Count); runtime_files=$RuntimeFiles; images=10; healthy=6; all_h3_complete=false; global_complete=false"
