param([ValidatePattern('^r[1-9][0-9]*$')][string]$Round='r1')
$ErrorActionPreference='Stop'
. 'D:\CloudFlowPro\.cloudflow-runtime\use-data-drive.ps1'
$Root='D:\CloudFlowPro'
$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
$Run=Join-Path $Root '.cloudflow-runtime/batch-g-integration/9799534e1a3a47b5958330f14ae16dc7'
$First=Join-Path $Evidence 'd2-current-first-20261006-r20'
$Failed=Join-Path $Evidence 'd2-leave-attendance-20261005-r41'
$Business=Join-Path $Evidence 'd2-leave-attendance-20261005-r42'
$Output=Join-Path $Evidence "d2-record-page-first-continuation-20261009-$Round"
function Require([bool]$Value,[string]$Message){if(-not $Value){throw $Message}}
function Read-Json([string]$File){Get-Content -LiteralPath $File -Raw|ConvertFrom-Json -Depth 100}
function Read-ActiveText([string]$File){
    $Stream=[IO.File]::Open($File,[IO.FileMode]::Open,[IO.FileAccess]::Read,([IO.FileShare]::ReadWrite -bor [IO.FileShare]::Delete))
    $Reader=[IO.StreamReader]::new($Stream)
    try{return $Reader.ReadToEnd()}finally{$Reader.Dispose();$Stream.Dispose()}
}
Require (-not (Test-Path -LiteralPath $Output) -and -not (Test-Path -LiteralPath $Business)) 'Retain prior ordinary continuation'
Require (-not (Test-Path Env:CLOUDFLOW_D2_PROFILE_FIRST)) 'Ordinary continuation must not enable profiling'
Require ((Test-Path -LiteralPath $Failed) -and -not (Test-Path -LiteralPath (Join-Path $Failed 'fixture.json')) -and -not (Test-Path -LiteralPath (Join-Path $Failed 'result.json'))) 'Failure must precede runtime and business setup'
Require (-not (Test-Path -LiteralPath (Join-Path $First 'measurement-result.json'))) 'Original startup already has a measurement'
$FailureLog=Get-Content -LiteralPath (Join-Path $Failed 'live.log') -Raw
Require ($FailureLog.Contains('Resume only the retained read failure or incomplete performance case')) 'Original eligibility failure differs'
$FailedSource=Get-Content -LiteralPath (Join-Path $Failed 'original-verify-d2-leave-attendance.mjs') -Raw
$EligibilityOffset=$FailedSource.IndexOf('Resume only the retained read failure or incomplete performance case')
$RuntimeOffset=$FailedSource.IndexOf('const runtime = await createD1LeaveRuntime')
Require ($EligibilityOffset -ge 0 -and $RuntimeOffset -gt $EligibilityOffset) 'Original failure did not precede runtime creation'
$FirstLog=Get-Content -LiteralPath (Join-Path $First 'verification.log') -Raw
Require ($FirstLog.Contains('counter_before=1729; counter_after=1729; counter_writes=0')) 'Original failed run consumed authentication state'
$Reload=Read-Json (Join-Path $First 'result.json')
Require ($Reload.Passed -and $Reload.BackendRound -eq 'r138' -and $Reload.HrReloadedLast -and $Reload.Layered -and $Reload.PackageVerificationRound -eq 'r26' -and $Reload.Services.Count -eq 6 -and @($Reload.Services|Where-Object Exit -ne 0).Count -eq 0) 'Original six-service reload incomplete'
$SourceResult=Read-Json (Join-Path $Evidence 'd2-leave-attendance-20261005-r39/result.json')
Require ($SourceResult.passed -and $SourceResult.correctness -and $SourceResult.approval -and $SourceResult.preservation -and $SourceResult.restoration -and $SourceResult.performanceMet -eq $false) 'Retained eligible business sample required'
$State=Read-Json (Join-Path $Run 'state.json')
Require ($State.status -eq 'RUNNING' -and [IO.Path]::GetFullPath($State.run) -eq $Run -and $State.processes.Count -eq 9 -and $State.services.Count -eq 6) 'Owned runtime incomplete'
foreach($Entry in $State.processes){
    $Observed=Get-CimInstance Win32_Process -Filter "ProcessId=$($Entry.id)"
    Require ($Observed -and $Observed.CommandLine.Contains($Entry.marker)) 'Owned process identity changed'
}
foreach($Service in $Reload.Services){
    $Current=@($State.processes|Where-Object name -eq $Service.Name)
    Require ($Current.Count -eq 1 -and $Current[0].id -eq $Service.Pid) 'Service was restarted after the original reload'
}
foreach($Name in @('hr','gateway')){
    $Contents=Read-ActiveText (Join-Path $Run "$Name/stdout.log")
    Require (-not $Contents.Contains('/attendance/recalculate')) 'A prior recalculation invalidates first request continuity'
}
$Inputs=@(Read-Json (Join-Path $First 'inputs.json'))+@(Read-Json (Join-Path $First 'layered-runtime-inputs.json'))
$ExtraFiles=@($PSCommandPath)
foreach($Name in @('result.json','inputs.json','layered-runtime-inputs.json','verification.log','original.ps1')){$ExtraFiles+=Join-Path $First $Name}
$ExtraFiles+=@(Get-ChildItem -LiteralPath $Failed -File|ForEach-Object FullName)
foreach($Name in @('result.json','fixture.json','inputs.json','original-verify-d2-leave-attendance.mjs','original-run-d2-leave-attendance.ps1','original-run-d2-leave-attendance-allowance.mjs')){
    $ExtraFiles+=Join-Path $Evidence "d2-leave-attendance-20261005-r39/$Name"
}
foreach($Service in $State.services){
    $ExtraFiles+=Join-Path $Run "$($Service.name)/service.args"
    $ExtraFiles+=Join-Path $Run "$($Service.name)/integration.properties"
}
foreach($File in $ExtraFiles){$Inputs+=[pscustomobject]@{Path=[IO.Path]::GetRelativePath($Root,$File);Hash=(Get-FileHash -LiteralPath $File).Hash}}
function Assert-Inputs{
    foreach($Item in $Inputs){Require ((Get-FileHash -LiteralPath (Join-Path $Root $Item.Path)).Hash -eq $Item.Hash) 'Original startup input or running program changed'}
}
Assert-Inputs
[IO.Directory]::CreateDirectory($Output)|Out-Null
$Inputs|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $Output 'inputs.json') -Encoding utf8NoBOM
[IO.File]::Copy($PSCommandPath,(Join-Path $Output 'original.ps1'),$false)
[pscustomobject]@{OriginalStartup='r20';FailedBusiness='r41';OriginalHandle=64291;OriginalExit=1;PriorRecalculations=0;FailureBeforeAuthentication=$true;NoBusinessWarmup=$true;Profiling=$false;OriginalFailureRetained=$true;ServicesUnchanged=$true}|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $Output 'precondition.json') -Encoding utf8NoBOM
& node scripts/run-d2-leave-attendance-allowance.mjs r42 r138 r85 r39 *> (Join-Path $Output 'verification.log')
$VerificationExit=$LASTEXITCODE
Assert-Inputs
Get-Content -LiteralPath (Join-Path $Output 'verification.log')|Where-Object{$_ -match '^(D2_|OWNED_CAPTCHA_)'}
Require ($VerificationExit -eq 0) 'Continuation failed; retain original result'
$Actual=Read-Json (Join-Path $Business 'result.json')
Require ($Actual.passed -and $Actual.correctness -and $Actual.approval -and $Actual.preservation -and $Actual.restoration -and $Actual.secrets -and -not $Actual.profiling -and $Actual.measurements.Count -eq 4) 'Ordinary continuation evidence incomplete'
[IO.File]::Copy((Join-Path $Business 'result.json'),(Join-Path $Output 'verification-result-original.json'),$false)
[pscustomobject]@{Passed=$true;BusinessPassed=$true;PerformanceMet=$Actual.performanceMet;BackendRound='r138';FrontendRound='r85';VerificationRound='r42';ResumeSource='r39';
    Inputs=$Inputs.Count;InputChanges=0;Services=$Reload.Services;HrReloadedLast=$true;Profiling=$false;ExecutablePackages=$true;Layered=$true;PackageVerificationRound='r26';
    RuntimeInputs=@(Read-Json (Join-Path $First 'layered-runtime-inputs.json')).Count;RuntimeInputChanges=0;Measurements=$Actual.measurements;RequirementMilliseconds=500;
    OriginalStartupRound='r20';PreflightFailureRound='r41';OriginalHandle=64291;OriginalExit=1;NoPriorBusinessRequest=$true;OriginalServicesUnchanged=$true;All17Complete=$false;GlobalComplete=$false
}|ConvertTo-Json -Depth 6|Set-Content -LiteralPath (Join-Path $Output 'measurement-result.json') -Encoding utf8NoBOM
"D2_RECORD_PAGE_FIRST_CONTINUATION: checks=$($Actual.checks.Count); measurements=$($Actual.measurements.milliseconds -join ','); performance_met=$($Actual.performanceMet); original_reload_retained=true; input_changes=0"
