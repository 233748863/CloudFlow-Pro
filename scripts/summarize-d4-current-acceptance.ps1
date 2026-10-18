param([ValidatePattern('^r[1-9][0-9]*$')][string]$Round='r1')
$ErrorActionPreference='Stop'
. 'D:\CloudFlowPro\.cloudflow-runtime\use-data-drive.ps1'
$Root='D:\CloudFlowPro'
$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
$Run=Join-Path $Root '.cloudflow-runtime/batch-g-integration/9799534e1a3a47b5958330f14ae16dc7'
$Output=Join-Path $Evidence "d4-current-acceptance-20261006-$Round.json"
if(Test-Path -LiteralPath $Output){throw 'Retain original D4 acceptance report'}
$Current=@{};$Artifacts=[Collections.Generic.List[object]]::new();$Originals=0;$Images=0
function Require([bool]$Value,[string]$Message){if(-not $Value){throw $Message}}
function Read-Json([string]$File){Get-Content -LiteralPath (Join-Path $Evidence $File) -Raw|ConvertFrom-Json}
function Hash-File([string]$Path){
    $Before=Get-Item -LiteralPath $Path;$Length=$Before.Length;$Written=$Before.LastWriteTimeUtc
    $Stream=[IO.File]::Open($Path,[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::ReadWrite)
    try{$Hasher=[Security.Cryptography.SHA256]::Create();try{$Hash=[Convert]::ToHexString($Hasher.ComputeHash($Stream))}finally{$Hasher.Dispose()}}finally{$Stream.Dispose()}
    $After=Get-Item -LiteralPath $Path
    Require ($Length -eq $After.Length -and $Written -eq $After.LastWriteTimeUtc) 'Evidence changed during read'
    return $Hash
}
function Keep([string]$File){$Artifacts.Add([pscustomobject]@{Path=$File;Hash=(Hash-File (Join-Path $Evidence $File))})}
function Verify-Inputs([string]$File){
    foreach($Item in @(Read-Json $File)){
        $Absolute=if([IO.Path]::IsPathRooted($Item.Path)){[IO.Path]::GetFullPath($Item.Path)}else{[IO.Path]::GetFullPath((Join-Path $Root $Item.Path))}
        Require ($Absolute.StartsWith('D:\',[StringComparison]::OrdinalIgnoreCase)) 'Input left data drive'
        if(-not $Current.ContainsKey($Absolute)){$Current[$Absolute]=Hash-File $Absolute}
        Require ($Current[$Absolute] -eq $Item.Hash) "Current input changed: $($Item.Path)"
    }
    Keep $File
}
function Keep-Originals([string]$Folder){
    $Inputs=@(Read-Json "$Folder/inputs.json")
    foreach($Original in @(Get-ChildItem -LiteralPath (Join-Path $Evidence $Folder) -Filter 'original-*' -File)){
        $Name=$Original.Name.Substring('original-'.Length)
        $Matches=@($Inputs|Where-Object {(Split-Path -Leaf $_.Path) -ceq $Name})
        Require ($Matches.Count -eq 1 -and (Hash-File $Original.FullName) -eq $Matches[0].Hash) 'Execution original mismatch'
        Keep "$Folder/$($Original.Name)";$script:Originals++
    }
}
$Prior=Read-Json 'd4-linked-stage-20261006-r1.json'
Require ($Prior.passed -and $Prior.backend -eq 'r110' -and $Prior.frontend -eq 'r70' -and $Prior.relatedNavigationComplete -and -not $Prior.globalComplete) 'Linked stage not verified'
Require ((Hash-File (Join-Path $Root 'scripts/summarize-d4-linked-stage.ps1')) -eq $Prior.reportHash) 'Linked report source changed'
foreach($Artifact in $Prior.artifacts){Require ((Hash-File (Join-Path $Evidence $Artifact.Path)) -eq $Artifact.Hash) 'Linked historical evidence changed'}
Keep 'd4-linked-stage-20261006-r1.json'
foreach($File in @('h3-portal-finance-20261002-backend-r110-inputs.json','h3-portal-finance-20261002-frontend-r70-inputs.json')){Verify-Inputs $File}
$Definitions=@(
    @{Name='lifecycle';Folder='d4-lifecycle-20261006-r5';Checks=172;Requests=57;Images=6;Flags=@('submission','transitions','records','confirmation','targets','privacy','escalation','notifications','audits','browser')},
    @{Name='mobile';Folder='d4-mobile-statistics-20261006-r3';Checks=205;Requests=57;Images=9;Flags=@('mobileSubmission','mobileWithdrawal','filters','statistics','scope','charts')},
    @{Name='privacy';Folder='d4-privacy-20261006-r8';Checks=1119;Requests=332;Images=6;Flags=@('identities','scope','targets','assignment','internal','files','tenant','anonymous','disputes','audits','browser')},
    @{Name='linked';Folder='d4-linked-20261006-r3';Checks=102;Requests=26;Images=11;Flags=@('salary','performance','browser','scope')}
)
$Verified=@{};$Cases=[Collections.Generic.List[object]]::new()
foreach($Definition in $Definitions){
    $Folder=$Definition.Folder;$Result=Read-Json "$Folder/result.json";$Fixture=Read-Json "$Folder/fixture.json"
    foreach($Flag in (@('passed','preservation','restoration','secrets')+$Definition.Flags)){Require ($Result.$Flag -eq $true) "Missing $($Definition.Name) evidence: $Flag"}
    Require ($Result.checks.Count -eq $Definition.Checks -and $Result.requests -eq $Definition.Requests -and $Fixture.screenshots.Count -eq $Definition.Images) 'Verification scope changed'
    Require (-not $Result.globalComplete) 'Individual report exceeds project scope'
    Verify-Inputs "$Folder/inputs.json"
    foreach($File in @('result.json','fixture.json','requests.json','live.log')){Keep "$Folder/$File"}
    Keep-Originals $Folder
    foreach($Image in $Fixture.screenshots){Require ((Get-Item -LiteralPath (Join-Path $Evidence "$Folder/$Image")).Length -gt 1000) 'Screenshot missing';Keep "$Folder/$Image";$Images++}
    foreach($Case in $Fixture.grievances){
        Require ($Case.status -in @('WITHDRAWN','CLOSED','ESCALATED')) 'Owned case left open'
        $Cases.Add([pscustomobject]@{source=$Definition.Name;id=$Case.id;status=$Case.status})
    }
    if($Definition.Name -eq 'lifecycle'){Require ($Fixture.restorations.employeeBinding) 'Lifecycle binding not restored'}
    elseif($Definition.Name -eq 'linked'){Require (-not $Fixture.bound) 'Linked binding not restored'}
    else{Require (@($Fixture.employees|Where-Object bound -EQ $true).Count -eq 0) 'Owned account remains bound'}
    $Verified[$Definition.Name]=$Result
}
Require ($Verified.mobile.filterCases -eq 18 -and $Verified.privacy.matrixCases -eq 189 -and -not $Verified.privacy.handlerDisputeNavigationPending) 'Current filter/privacy scope incomplete'
Require ($Images -eq 32 -and $Originals -eq 25 -and $Cases.Count -eq 17) 'Current image/source/case counts changed'
$Counter=1053
foreach($Pair in @(@('d4-current-lifecycle-r5-launch.log','owned-captcha-d4-lifecycle-20261006-r5.json'),@('d4-current-mobile-statistics-r3-launch.log','owned-captcha-d4-mobile-statistics-20261006-r3.json'),@('d4-current-privacy-r8-launch.log','owned-captcha-d4-privacy-20261006-r8.json'))){
    $Text=Get-Content -LiteralPath (Join-Path $Evidence $Pair[0]) -Raw
    Require ($Text -match 'OWNED_CAPTCHA_RESTORED: original_limit=100; original_ttl=-1; counter_before=(\d+); counter_after=(\d+); counter_writes=0; database_unchanged=true; production_modified=false') 'Captcha restoration missing'
    Require ([int]$Matches[1] -eq $Counter) 'Captcha chain changed';$Counter=[int]$Matches[2]
    Keep $Pair[0];Keep $Pair[1]
}
Require ($Counter -eq 1065) 'Captcha final counter differs'
$Duration='d4-duration-boundaries-20261006-r1';$DurationResult=Read-Json "$Duration/result.json"
Require ($DurationResult.passed -and $DurationResult.backend -eq 'r110' -and $DurationResult.exit -eq 0 -and $DurationResult.inputChanges -eq 0) 'Duration boundaries failed'
Require ((Get-Content -LiteralPath (Join-Path $Evidence "$Duration/live.log") -Raw) -match 'D4_DURATION: checks=46; failed=0; fixtures_rolled_back=true; real_database=true') 'Duration boundary evidence missing'
Require ((Get-Content -LiteralPath (Join-Path $Evidence 'd4-duration-r1-launch.log') -Raw) -match 'D4_DURATION_SCRATCH_REMOVED=true') 'Disposable duration schema not removed'
Verify-Inputs "$Duration/inputs.json";Keep-Originals $Duration
foreach($File in @('result.json','live.log','compile.log','compile.args','run.args')){Keep "$Duration/$File"};Keep 'd4-duration-r1-launch.log'
$Natural='d4-natural-reminder-20261006-r2';$NaturalResult=Read-Json "$Natural/result.json";$NaturalLaunch=Read-Json "$Natural/launcher-result.json";$Observed=Read-Json "$Natural/observed.json"
Require ($NaturalResult.passed -and $NaturalResult.checks -eq 111 -and $NaturalResult.cases -eq 73 -and $NaturalResult.expectedReminders -eq 31 -and $NaturalResult.requests -eq 4) 'Natural reminder scope changed'
Require ($NaturalResult.naturalScheduler -and $NaturalResult.independentMysql -and $NaturalResult.independentRedis -and $NaturalResult.realHttp -and $NaturalResult.manualTriggers -eq 0 -and $NaturalResult.clockChanges -eq 0 -and -not $NaturalResult.originalNineAmObserved -and $NaturalResult.secrets.leaks -eq 0) 'Natural reminder boundary incorrect'
Require ($Observed.reminders.Count -eq 31 -and $Observed.messages.Count -eq 52 -and $Observed.observations[-1].Count -eq 2) 'Natural persisted results incomplete'
Require ($Observed.observations[-1][0].affected -eq 31 -and $Observed.observations[-1][1].affected -eq 0 -and @($Observed.observations[-1]|Where-Object status -NE 'SUCCESS').Count -eq 0) 'Natural executions or deduplication changed'
foreach($Number in 1..2){
    $Folder="d4-natural-reminder-20261006-r$Number";$Launch=Read-Json "$Folder/launcher-result.json";$Result=Read-Json "$Folder/result.json"
    Require ($Launch.inputsUnchanged -and $Launch.processesStopped -and -not $Launch.priorRuntimeWritten -and $Result.secrets.leaks -eq 0) 'Independent runtime did not stop or preserve inputs'
    if($Number -eq 1){Require (-not $Result.passed -and $Result.failure -eq '自然触发一次并正确回报数量 1') 'Original preparation failure changed'}else{Require ($Launch.passed -and $Launch.backend -eq 'r110' -and $Launch.frontend -eq 'r70') 'Current independent runtime failed';Verify-Inputs "$Folder/inputs.json";Verify-Inputs "$Folder/runtime-inputs.json"}
    $State=Get-Content -LiteralPath (Join-Path $Launch.run 'state.json') -Raw|ConvertFrom-Json
    foreach($Process in $State.processes){$Live=Get-CimInstance Win32_Process -Filter "ProcessId=$($Process.id)";Require (-not $Live -or -not $Live.CommandLine.Contains($Process.marker)) 'Independent process remains live'}
    foreach($File in @('result.json','launcher-result.json','observed.json','fixture.json','inputs.json','runtime-inputs.json','live.log')){Keep "$Folder/$File"}
    Keep-Originals $Folder;Keep "d4-natural-reminder-r$Number-launch.log"
}
Require ($Originals -eq 31) 'Executed original count changed'
$Adjacent='h3-portal-finance-adjacent-20261002-r129'
Verify-Inputs "$Adjacent/inputs.json"
$Text=Get-Content -LiteralPath (Join-Path $Evidence "$Adjacent/summary.log") -Raw
Require ($Text -match 'H3_FINANCE_ADJACENT: files=(\d+); changed=0; exit=0; production_modified=false') 'Current adjacent regression missing'
$AdjacentInputs=[int]$Matches[1];Keep "$Adjacent/summary.log";Keep 'd4-current-adjacent-r129-launch.log'
$MainState=Get-Content -LiteralPath (Join-Path $Run 'state.json') -Raw|ConvertFrom-Json
Require ($MainState.status -eq 'RUNNING' -and [IO.Path]::GetFullPath($MainState.run) -eq $Run) 'Main runtime identity changed'
foreach($Process in $MainState.processes){$Live=Get-CimInstance Win32_Process -Filter "ProcessId=$($Process.id)";Require ($Live -and $Live.CommandLine.Contains($Process.marker)) 'Main process missing'}
$Healthy=0;foreach($Service in $MainState.services){Require ((Invoke-RestMethod "http://127.0.0.1:$($Service.healthPort)/actuator/health" -TimeoutSec 5).status -eq 'UP') 'Main service unhealthy';$Healthy++}
$Acceptance=@(
    @{id='AC-1';sources=@('lifecycle.submission','mobile.mobileSubmission')},@{id='AC-2';sources=@('lifecycle.transitions')},
    @{id='AC-3';sources=@('lifecycle.records')},@{id='AC-4';sources=@('lifecycle.confirmation')},
    @{id='AC-5';sources=@('lifecycle.targets','linked.salary','linked.performance','linked.scope')},
    @{id='AC-6';sources=@('privacy.targets','privacy.scope')},@{id='AC-7';sources=@('privacy.internal','privacy.files')},
    @{id='AC-8';sources=@('lifecycle.escalation','privacy.disputes')},@{id='AC-9';sources=@('privacy.scope','privacy.tenant','privacy.anonymous','linked.scope')},
    @{id='AC-10';sources=@('lifecycle.audits','privacy.audits')},@{id='AC-11';sources=@('natural-reminder-r2')},
    @{id='AC-12';sources=@('lifecycle.notifications')},@{id='AC-13';sources=@('mobile.filters','mobile.statistics','mobile.charts','duration-boundaries-r1')}
)|ForEach-Object{[pscustomobject]@{id=$_.id;status='VERIFIED';sources=$_.sources;backend='r110';frontend='r70'}}
Require ($Acceptance.Count -eq 13 -and $Healthy -eq 6) 'Acceptance scope incomplete'
$Summary=[pscustomobject]@{passed=$true;backend='r110';frontend='r70';accepted=13;acceptance=$Acceptance;currentInputs=$Current.Count;currentScreenshots=$Images;executedOriginals=$Originals;cases=@($Cases.ToArray());captchaBefore=1053;captchaAfter=$Counter;processes=$MainState.processes.Count;healthyServices=$Healthy;adjacentRound='r129';adjacentInputs=$AdjacentInputs;durationChecks=46;reminderChecks=111;reminderCases=73;remindedCases=31;reminderMessages=52;naturalTriggers=2;originalNineAmObserved=$false;artifacts=@($Artifacts.ToArray());reportHash=(Hash-File $PSCommandPath);all13Complete=$true;globalComplete=$false;remaining=@('D2 first ordinary request performance','D3 formal tax/financial policy and current version reconciliation','Remaining PRDs and whole-project current acceptance')}
$Summary|ConvertTo-Json -Depth 7|Set-Content -LiteralPath $Output -Encoding utf8NoBOM
"D4_CURRENT_ACCEPTANCE: accepted=13; inputs=$($Current.Count); screenshots=$Images; originals=$Originals; adjacent=$AdjacentInputs; healthy=$Healthy; all13_complete=true; global_complete=false"
