param([ValidatePattern('^r[1-9][0-9]*$')][string]$Round='r1')
$ErrorActionPreference='Stop'
. 'D:\CloudFlowPro\.cloudflow-runtime\use-data-drive.ps1'
$Root='D:\CloudFlowPro'
$CacheRoot='D:\CloudFlowProCache'
$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
$Reference=Join-Path $Root '.cloudflow-runtime/batch-g-integration/9799534e1a3a47b5958330f14ae16dc7'
$Output=Join-Path $Evidence "h3-commission-stage-20261011-$Round"
if(Test-Path -LiteralPath $Output){throw 'Retain previous commission reconciliation'}
[IO.Directory]::CreateDirectory($Output)|Out-Null
[IO.File]::Copy($PSCommandPath,(Join-Path $Output 'original.ps1'),$false)
$Inputs=@{}
$Archives=@{}
$Bindings=[Collections.Generic.List[object]]::new()
function Require([bool]$Condition,[string]$Message){if(-not $Condition){throw $Message}}
function Full([string]$Path){[IO.Path]::GetFullPath($Path,$Root)}
function Json([string]$Path){Get-Content -LiteralPath $Path -Raw|ConvertFrom-Json -Depth 100}
function Hash([string]$Path){
    $Before=Get-Item -LiteralPath $Path
    $Length=$Before.Length;$Written=$Before.LastWriteTimeUtc
    $Stream=[IO.File]::Open($Path,[IO.FileMode]::Open,[IO.FileAccess]::Read,([IO.FileShare]::ReadWrite -bor [IO.FileShare]::Delete))
    try{$Digest=(Get-FileHash -InputStream $Stream).Hash}finally{$Stream.Dispose()}
    $After=Get-Item -LiteralPath $Path
    Require ($Length -eq $After.Length -and $Written -eq $After.LastWriteTimeUtc) 'Evidence changed during read'
    return $Digest
}
function Track([string]$File,[string]$Expected=''){
    $Path=Full $File
    Require ($Path.StartsWith($Root+'\',[StringComparison]::OrdinalIgnoreCase) -or $Path.StartsWith($CacheRoot+'\',[StringComparison]::OrdinalIgnoreCase)) 'Input outside approved data drive'
    Require (-not ((Get-Item -LiteralPath $Path).Attributes -band [IO.FileAttributes]::ReparsePoint)) 'Redirected evidence rejected'
    if(-not $Inputs.ContainsKey($Path)){$Inputs[$Path]=Hash $Path}
    if($Expected){Require ($Inputs[$Path] -eq $Expected) ("Input changed: "+$Path)}
    return $Path
}
function Manifest([string]$Path){
    $null=Track $Path
    $Index=@{}
    foreach($Entry in @(Json $Path)){
        $File=Full $Entry.Path
        Require (-not $Index.ContainsKey($File) -or $Index[$File] -eq $Entry.Hash) 'Conflicting executed input'
        $Index[$File]=$Entry.Hash
    }
    return $Index
}
function Archive([string]$Directory){
    foreach($File in Get-ChildItem -LiteralPath $Directory -Recurse -File){$Path=Track $File.FullName;$Archives[$Inputs[$Path]]=$Path}
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
$Preparations=@(Get-ChildItem -LiteralPath $Evidence -Directory|Where-Object Name -Match '^h3-commission-(prep|validation-prep|mobile-route-prep|deployment-prep)-')
foreach($Directory in $Preparations){Archive $Directory.FullName}
foreach($Name in @('h3-commission-document-recovery-20261011-r1','e5-smtp-maintenance-20261010-r4','backend-executable-verification-20261006-r36','backend-executable-verification-20261006-r37')){Archive (Join-Path $Evidence $Name)}
foreach($Prior in Get-ChildItem -LiteralPath $Evidence -Directory|Where-Object{$_.Name -match '^h3-commission-stage-20261011-r([1-9][0-9]*)$' -and [int]$Matches[1] -lt [int]$Round.Substring(1)}){Archive $Prior.FullName}
foreach($Version in @('r1','r2','r3','r4','r5')){
    $Directory=Join-Path $Evidence "h3-commission-independent-20261010-$Version"
    Archive $Directory
    $RuntimeIndex=Manifest (Join-Path $Directory 'runtime-inputs.json')
    foreach($Path in $RuntimeIndex.Keys){$null=Track $Path $RuntimeIndex[$Path];$Archives[$RuntimeIndex[$Path]]=$Path}
}
foreach($Directory in $Preparations){
    $Before=Join-Path $Directory.FullName 'before-inputs.json'
    if(Test-Path -LiteralPath $Before){Bind (Manifest $Before)}
}
$Builds=@{}
foreach($Definition in @(@{Kind='backend';Version='r150';Phase='Backend';Count=3868},@{Kind='frontend';Version='r103';Phase='Frontend';Count=1485})){
    $Index=Manifest (Join-Path $Evidence "h3-portal-finance-20261002-$($Definition.Kind)-$($Definition.Version)-inputs.json")
    Require ($Index.Count -eq $Definition.Count) 'Current build inventory differs'
    foreach($Path in $Index.Keys){$null=Track $Path $Index[$Path]}
    $Builds[$Definition.Kind]=$Index
    $Log=Track (Join-Path $Evidence "h3-portal-finance-20261002-$($Definition.Kind)-$($Definition.Version).log")
    Require ((Get-Content -LiteralPath $Log -Raw).Contains("FINANCE_BUILD: phase=$($Definition.Phase); files=$($Definition.Count); changed=0; exit=0")) 'Current build did not complete'
}
$ExpectedChanges=@(
    'cloudflow-backend/cloudflow-common/cloudflow-common-event/src/main/java/com/cloudflow/common/event/commission/CommissionEvents.java',
    'cloudflow-backend/cloudflow-service-crm/src/main/java/com/cloudflow/crm/controller/CrmCommissionController.java',
    'cloudflow-backend/cloudflow-service-crm/src/main/java/com/cloudflow/crm/controller/CrmDealAllocationController.java',
    'cloudflow-backend/cloudflow-service-crm/src/main/java/com/cloudflow/crm/event/consumer/CommissionProgressConsumer.java',
    'cloudflow-backend/cloudflow-service-crm/src/main/java/com/cloudflow/crm/mapper/CrmCommissionMapper.java',
    'cloudflow-backend/cloudflow-service-crm/src/main/java/com/cloudflow/crm/service/deal/CrmCommissionOutbox.java',
    'cloudflow-backend/cloudflow-service-crm/src/main/java/com/cloudflow/crm/service/deal/CrmCommissionService.java',
    'cloudflow-backend/cloudflow-service-crm/src/main/java/com/cloudflow/crm/service/deal/CrmDealLedgerService.java',
    'cloudflow-backend/cloudflow-service-crm/src/main/java/com/cloudflow/crm/service/remote/CrmCommissionPayrollClient.java',
    'cloudflow-backend/cloudflow-service-crm/src/main/resources/mapper/CrmCommissionMapper.xml',
    'cloudflow-backend/cloudflow-service-hr/src/main/java/com/cloudflow/hr/controller/InnerHrCommissionController.java',
    'cloudflow-backend/cloudflow-service-hr/src/main/java/com/cloudflow/hr/event/consumer/HrCommissionRequestConsumer.java',
    'cloudflow-backend/cloudflow-service-hr/src/main/java/com/cloudflow/hr/mapper/HrCommissionMapper.java',
    'cloudflow-backend/cloudflow-service-hr/src/main/java/com/cloudflow/hr/service/HrAdvancePayrollService.java',
    'cloudflow-backend/cloudflow-service-hr/src/main/java/com/cloudflow/hr/service/HrCommissionService.java',
    'cloudflow-backend/cloudflow-service-hr/src/main/java/com/cloudflow/hr/service/HrPayrollCalculationService.java',
    'cloudflow-backend/cloudflow-service-hr/src/main/java/com/cloudflow/hr/service/HrSettlementSalarySource.java',
    'cloudflow-backend/cloudflow-service-hr/src/main/java/com/cloudflow/hr/service/HrTypedCrudService.java',
    'cloudflow-backend/cloudflow-service-hr/src/main/resources/mapper/HrCommissionMapper.xml',
    'cloudflow-backend/DB/06.cloudflow-business-seed.sql',
    'cloudflow-frontend/src/pages/crm/CrmDealAllocationPage.tsx','cloudflow-frontend/src/router.tsx','cloudflow-frontend/src/services/api/crm/commission.ts')|ForEach-Object{Full $_}
$ProductImpact=@()
foreach($Definition in @(@{Kind='backend';Version='r147'},@{Kind='frontend';Version='r101'})){
    $Before=Manifest (Join-Path $Evidence "h3-portal-finance-20261002-$($Definition.Kind)-$($Definition.Version)-inputs.json")
    $After=$Builds[$Definition.Kind]
    foreach($Path in $After.Keys|Where-Object{$Before[$_] -ne $After[$_]}){
        Require ($ExpectedChanges -contains $Path) ("Unexpected commission product change: "+$Path)
        if($Before.ContainsKey($Path)){Require ($Archives.ContainsKey($Before[$Path])) ("Original product source missing: "+$Path);$null=Track $Archives[$Before[$Path]] $Before[$Path]}
        $ProductImpact+=@{Path=$Path;BeforeHash=$Before[$Path];AfterHash=$After[$Path];Added=(-not $Before.ContainsKey($Path))}
    }
    Require (@($Before.Keys|Where-Object{-not $After.ContainsKey($_)}).Count -eq 0) 'Product input removed'
}
Require ($ProductImpact.Count -eq 23) 'Commission source impact inventory differs'
$History=@()
foreach($Version in @('r1','r2','r3','r4','r5')){
    $Directory=Join-Path $Evidence "h3-commission-independent-20261010-$Version"
    $Launcher=Json (Join-Path $Directory 'launcher-result.json')
    $Backend=if($Version -eq 'r1'){'r149'}else{'r150'}
    $Frontend=if($Version -eq 'r5'){'r103'}else{'r102'}
    Require ($Launcher.backend -eq $Backend -and $Launcher.frontend -eq $Frontend -and
        $Launcher.passed -eq ($Version -eq 'r5') -and $Launcher.inputsUnchanged -and $Launcher.referenceKept -and $Launcher.processesStopped -and
        $Launcher.referenceBusinessTables -eq 46 -and $Launcher.stopErrors.Count -eq 0 -and $Launcher.captchaCounterWrites -eq 0 -and
        $Launcher.captchaConfigurationWrites -eq 0 -and -not $Launcher.priorRuntimeWritten -and -not $Launcher.externalMessagesSent -and -not $Launcher.systemClockChanged) 'Independent version, outcome or preservation differs'
    $SourceIndex=Manifest (Join-Path $Directory 'inputs.json')
    $RuntimeIndex=Manifest (Join-Path $Directory 'runtime-inputs.json')
    Bind $SourceIndex;Bind $RuntimeIndex
    Require ($SourceIndex.Count -eq $Launcher.inputs -and $RuntimeIndex.Count -eq $Launcher.runtimeInputs -and
        @(Get-ChildItem -LiteralPath (Join-Path $Directory 'originals') -Recurse -File).Count -eq $Launcher.executionOriginals) 'Independent executed inventory differs'
    $Before=Json (Join-Path $Directory 'reference-business-before.json')
    $After=Json (Join-Path $Directory 'reference-business-after.json')
    Require (@($Before.PSObject.Properties).Count -eq 46) 'Reference table coverage differs'
    foreach($Property in $Before.PSObject.Properties){Require ($After.($Property.Name) -eq $Property.Value) 'Original business table changed'}
    $Stopped=Json (Track (Join-Path $Launcher.run 'state.json'))
    Require ($Stopped.status -eq 'STOPPED') 'Independent environment still running'
    foreach($Entry in $Stopped.processes){
        $Observed=Get-CimInstance Win32_Process -Filter "ProcessId=$($Entry.id)"
        Require (-not $Observed -or -not $Observed.CommandLine.Contains($Entry.marker)) 'Independent owned process remains'
    }
    $History+=@{Round=$Version;Backend=$Backend;Frontend=$Frontend;Passed=$Launcher.passed;Inputs=$Launcher.inputs;RuntimeInputs=$Launcher.runtimeInputs;Originals=$Launcher.executionOriginals}
}
$CurrentDirectory=Join-Path $Evidence 'h3-commission-independent-20261010-r5'
$Current=Json (Join-Path $CurrentDirectory 'result.json')
Require ($Current.passed -and $Current.backend -eq 'r150' -and $Current.frontend -eq 'r103' -and $Current.checks.Count -eq 198 -and
    $Current.requests.Count -eq 87 -and $Current.uiRequests.Count -eq 318 -and $Current.browserErrors.Count -eq 0 -and
    $Current.backendHttp -and -not $Current.apiDoubles -and $Current.privacy.leaks -eq 0) 'Actual commission business proof incomplete'
foreach($Property in $Current.evidence.PSObject.Properties){Require ([bool]$Property.Value) ("Actual evidence missing: "+$Property.Name)}
foreach($Label in @('original_split_has_exact_tail_cent','approved_original_commission_uses_exact_original_amounts',
    'prior_partial_refund_recomputed_from_original_commission','manager_payload_omits_all_payroll_and_commission_fields',
    'commission_permission_does_not_bypass_confirmation_scope','commission_permission_does_not_bypass_payroll_scope',
    'public_caller_cannot_forge_internal_commission','source_failure_keeps_real_request_pending_without_inventing_salary',
    'two_authorized_concurrent_resumptions_keep_all_original_requests','salary_amounts_are_encrypted_in_database',
    'original_with_prior_refund_entire_batch_salary_and_commission_progress_roll_back',
    'later_refund_recovery_entire_batch_salary_and_commission_progress_roll_back',
    'prior_month_salary_remains_unchanged_after_actual_recovery','natural_retry_keeps_original_durable_event_identity',
    'late_original_request_preserves_both_paid_months_and_latest_progress','manager_real_page_has_no_commission_actions_or_values',
    'actual_page_distinguishes_paid_and_recovered_320','no_uncaught_browser_errors','service_and_audit_secrets_kept')){
    Require ($Current.checks -contains $Label) ("Required business assertion missing: "+$Label)
}
$ReviewFile=Track (Join-Path $Evidence 'h3-commission-image-review-20261011-r1/manifest.json')
$Review=Json $ReviewFile
Require ($Review.Round -eq 'r5' -and $Review.Backend -eq 'r150' -and $Review.Frontend -eq 'r103' -and $Review.ActuallyViewed -and
    $Review.VisualAccepted -and -not $Review.OriginalResultChanged -and $Review.Images.Count -eq 8 -and
    $Review.OriginalResultHash -eq (Hash (Join-Path $CurrentDirectory 'result.json'))) 'Actual image review incomplete'
foreach($Image in $Review.Images){
    $Metadata=@($Current.images|Where-Object name -EQ $Image.Name)
    Require ($Image.ActuallyViewed -and $Image.Accepted -and $Image.Method -eq 'direct' -and $Metadata.Count -eq 1 -and
        $Metadata[0].hash -eq $Image.Hash -and -not $Metadata[0].actuallyViewed -and -not $Metadata[0].visualAccepted) 'Original image result changed or review missing'
    $null=Track (Join-Path $CurrentDirectory $Image.Name) $Image.Hash
}
$Associated=@()
foreach($Definition in @(
    @{Name='h2-settlement-validation-run-20261006-r3';Version='BackendRound';Sources=3872;Binaries=2439;Modes=8},
    @{Name='h2-current-compensation-checks-20261007-r3';Version='BackendRound';Sources=3874;Binaries=2439;Modes=3},
    @{Name='d3-payroll-replay-20261006-r5';Version='BackendRound';Sources=3871;Binaries=2439;Checks=108},
    @{Name='d3-generation-resume-20261006-r3';Version='BackendRound';Sources=3871;Binaries=2439;Checks=123},
    @{Name='h3-commission-advance-20261011-r1';Version='Backend';Sources=3871;Binaries=1521;Modes=4},
    @{Name='h3-commission-wire-20261011-r3';Version='BackendRound';Sources=3870;Binaries=1521;Checks=50})){
    $Directory=Join-Path $Evidence $Definition.Name
    Archive $Directory
    $Proof=Json (Join-Path $Directory 'result.json')
    Require ($Proof.Passed -and $Proof.($Definition.Version) -eq 'r150' -and $Proof.InputChanges -eq 0 -and
        $Proof.SourceInputs -eq $Definition.Sources -and $Proof.BinaryInputs -eq $Definition.Binaries) 'Associated result or version differs'
    if($Definition.ContainsKey('Checks')){Require ($Proof.Checks -eq $Definition.Checks) 'Associated assertion count differs'}
    if($Definition.ContainsKey('Modes')){Require ($Proof.Modes.Count -eq $Definition.Modes -and @($Proof.Modes|Where-Object {$_.PSObject.Properties.Name -contains 'Passed' -and -not $_.Passed}).Count -eq 0) 'Associated mode incomplete'}
    foreach($Name in @('inputs.json','binary-inputs.json')){Bind (Manifest (Join-Path $Directory $Name))}
    if($Proof.Artifacts){foreach($Artifact in $Proof.Artifacts){$null=Track $Artifact.Path $Artifact.Hash}}
    if($Proof.CalculationArtifacts){foreach($Artifact in $Proof.CalculationArtifacts){$null=Track $Artifact.Path $Artifact.Hash}}
    $Associated+=@{Directory=$Definition.Name;SourceInputs=$Proof.SourceInputs;BinaryInputs=$Proof.BinaryInputs;Http=$false;Passed=$true}
}
$Settlement=Json (Join-Path $Evidence 'h2-settlement-validation-run-20261006-r3/result.json')
foreach($Direction in @('netting','payment','receipt')){
    $Mode=@($Settlement.Modes|Where-Object Name -EQ ('reversal-'+$Direction))
    Require ($Mode.Count -eq 1 -and $Mode[0].CommissionLifecycleExpected -and $Mode[0].CommissionSummary.Count -eq 1 -and
        $Mode[0].CommissionSummary[0] -match '^H3_COMMISSION_SETTLEMENT_DATABASE:.*failed=0;') 'Actual settlement commission lifecycle absent'
}
$StaticDirectory=Join-Path $Evidence 'h3-commission-static-20261010-r5'
Archive $StaticDirectory
$Static=Json (Join-Path $StaticDirectory 'result.json')
Require ($Static.Passed -and $Static.InputFiles -eq 6714 -and $Static.Changed -eq 0 -and $Static.Exit -eq 0) 'Commission static checks incomplete'
Bind (Manifest (Join-Path $StaticDirectory 'inputs.json'))
$DocumentRecovery=Json (Join-Path $Evidence 'h3-commission-document-recovery-20261011-r1/result.json')
Require ($DocumentRecovery.Passed -and -not $DocumentRecovery.CurrentDocumentChanged -and -not $DocumentRecovery.OriginalResultsChanged) 'Historical document recovery incomplete'
foreach($Recovered in $DocumentRecovery.RecoveredOriginals){$null=Track $Recovered.PreservedAt $Recovered.Hash}
$AdjacentDirectory=Join-Path $Evidence 'h3-portal-finance-adjacent-20261002-r186'
Archive $AdjacentDirectory
$AdjacentInputs=Manifest (Join-Path $AdjacentDirectory 'inputs.json')
Bind $AdjacentInputs
$AdjacentLog=Get-Content -LiteralPath (Join-Path $AdjacentDirectory 'summary.log') -Raw
Require ($AdjacentLog.Contains("H3_FINANCE_ADJACENT: files=$($AdjacentInputs.Count); changed=0; exit=0; production_modified=false") -and
    $AdjacentLog.Contains('name=formal-01-07-and-oa-behavior; exit=0') -and $AdjacentLog.Contains('name=approved-menu-scope; exit=0')) 'Current adjacent verification incomplete'
$PackageDirectory=Join-Path $Evidence 'backend-executable-verification-20261006-r37'
$Packages=Json (Join-Path $PackageDirectory 'result.json')
Require ($Packages.Passed -and $Packages.BackendRound -eq 'r150' -and $Packages.InputChanges -eq 0 -and $Packages.Services.Count -eq 6) 'Verified executable packages incomplete'
Bind (Manifest (Join-Path $PackageDirectory 'inputs.json'))
$DeploymentDirectory=Join-Path $Evidence 'e1-reminder-deployment-20261007-r15'
Archive $DeploymentDirectory
Bind (Manifest (Join-Path $DeploymentDirectory 'inputs.json'))
$Deployment=Json (Join-Path $DeploymentDirectory 'result.json')
Require ($Deployment.Passed -and $Deployment.Backend -eq 'r150' -and $Deployment.PackageRound -eq 'r37' -and
    $Deployment.HealthyServices -eq 6 -and $Deployment.InputChanges -eq 0 -and -not $Deployment.ProductionModified) 'Deployment result differs'
$Preparation=Json (Join-Path $Evidence 'h3-commission-deployment-prep-20261011-r1/result.json')
Require ($Preparation.Passed -and $Preparation.MenusApplied -and $Preparation.NewGrants -eq 7 -and $Preparation.Preserved -eq 13 -and
    $Preparation.UnrelatedMenusAndGrantsKept -and -not $Preparation.RedisWritten -and
    $Preparation.SourceSeedHash -eq (Hash (Join-Path $Root 'cloudflow-backend/DB/06.cloudflow-business-seed.sql'))) 'Approved commission menu installation incomplete'
$State=Json (Track (Join-Path $Reference 'state.json'))
Require ($State.status -eq 'RUNNING' -and $State.processes.Count -eq 9 -and $State.services.Count -eq 6) 'Runtime incomplete'
foreach($Entry in $State.processes){
    $Observed=Get-CimInstance Win32_Process -Filter "ProcessId=$($Entry.id)"
    Require ($Observed -and $Observed.CommandLine.Contains($Entry.marker)) 'Owned runtime process differs'
}
$RuntimeFiles=0
foreach($Service in $State.services){
    $Arguments=@(Get-Content -LiteralPath (Track (Join-Path $Reference "$($Service.name)/service.args")))
    $Index=[Array]::IndexOf($Arguments,'-cp')
    Require ($Index -ge 0 -and $Arguments[$Index+2] -eq 'org.springframework.boot.loader.launch.JarLauncher') 'Layered runtime launch missing'
    $Layer=Full ($Arguments[$Index+1].Trim('"'))
    $Package=@($Packages.Services|Where-Object Name -EQ $Service.name)
    Require ($Package.Count -eq 1 -and $Layer -eq (Join-Path $Reference ("$($Service.name)/artifacts/"+$Package[0].Hash.ToLowerInvariant()+'-layered'))) 'Runtime package differs from B150'
    $null=Track $Package[0].Path $Package[0].Hash
    foreach($File in Get-ChildItem -LiteralPath $Layer -Recurse -File){$null=Track $File.FullName;$RuntimeFiles++}
    Require ((Invoke-RestMethod "http://127.0.0.1:$($Service.healthPort)/actuator/health" -TimeoutSec 15).status -eq 'UP') 'Service unhealthy'
}
Require ($RuntimeFiles -eq $Deployment.RuntimeFiles) 'Deployed runtime file count differs'
$Receipts=@(Json (Track (Join-Path $Evidence 'h3-commission-terminal-receipts-20261011-r1.json')))
foreach($Name in @('backend150','frontend103','wire3','static5','packages37','independent5','settlement3','compensation3','payrollReplay5','generationResume3','advance1','deploymentPreparation1','deployment15','adjacent186')){
    $Receipt=@($Receipts|Where-Object Name -EQ $Name)
    Require ($Receipt.Count -eq 1 -and $Receipt[0].TerminalCollected -and $Receipt[0].Exit -eq 0 -and [string]$Receipt[0].Chunk -match '^[a-f0-9]+$') 'Successful original terminal receipt missing'
}
foreach($Name in @('independent1','independent2','independent3','independent4')){
    $Receipt=@($Receipts|Where-Object Name -EQ $Name)
    Require ($Receipt.Count -eq 1 -and $Receipt[0].TerminalCollected -and $Receipt[0].Exit -eq 1 -and [string]$Receipt[0].Chunk -match '^[a-f0-9]+$') 'Failed original terminal receipt missing'
}
$null=Track $PSCommandPath
$null=Track (Join-Path $Output 'original.ps1') (Hash $PSCommandPath)
foreach($Path in $Inputs.Keys){Require ((Hash $Path) -eq $Inputs[$Path]) ("Stage input changed: "+$Path)}
@($Inputs.Keys|Sort-Object|ForEach-Object{[pscustomobject]@{Path=$_;Hash=$Inputs[$_]}})|ConvertTo-Json -Depth 3|
    Set-Content -LiteralPath (Join-Path $Output 'inputs.json') -Encoding utf8NoBOM
[pscustomobject]@{Passed=$true;Backend='r150';Frontend='r103';Acceptance=@('H3 AC-14','H3 AC-15');Ac14Complete=$true;Ac15Complete=$true;AllH3Complete=$false;GlobalComplete=$false;
    Checks=198;Requests=87;UiRequests=318;ReviewedImages=8;ImageReview=$ReviewFile;BrowserErrors=0;Inputs=$Inputs.Count;InputChanges=0;RuntimeFiles=$RuntimeFiles;
    IndependentInputs=12420;IndependentRuntimeInputs=6472;ReferenceBusinessTables=46;IndependentProcessesStopped=$true;ActualBusinessHttp=$true;
    Associated=$Associated;AssociatedHttp=$false;SettlementExternalApprovalAndCrmSourceFixtures=$true;ProductImpact=$ProductImpact;HistoricalRounds=$History;HistoricalInputBindings=@($Bindings.ToArray());
    OriginalTerminalReceipts=$Receipts;DocumentRecovery=$DocumentRecovery;Adjacent='r186';AdjacentInputs=$AdjacentInputs.Count;Deployment='r15';Packages='r37';MenuIds=@(1907,1908);MenuGrants=7;Processes=9;HealthyServices=6;
    CaptchaCounterWrites=0;CaptchaConfigurationWrites=0;RedisFlush=$false;SystemClockChanged=$false;ExternalMessagesSent=$false;ProductModified=$false;ProductionModified=$false;
    BusinessRule='Confirmed actual receipts create exact commission amounts; refunds recover original cents; paid prior-month salary remains immutable; salary payment and settlement reversal persist commission progress in the same local transaction';
    Remaining=@('H3 remaining acceptance items and current-version reconciliation','Whole-project 35 PRDs / 681 items')}|
    ConvertTo-Json -Depth 30|Set-Content -LiteralPath (Join-Path $Output 'result.json') -Encoding utf8NoBOM
"H3_COMMISSION_STAGE: passed=true; ac14_complete=true; ac15_complete=true; checks=198; inputs=$($Inputs.Count); runtime_files=$RuntimeFiles; images=8; healthy=6; all_h3_complete=false; global_complete=false"
