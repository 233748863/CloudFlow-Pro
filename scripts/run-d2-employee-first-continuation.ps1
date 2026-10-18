param([ValidatePattern('^r[1-9][0-9]*$')][string]$Round='r1')
$ErrorActionPreference='Stop'
. 'D:\CloudFlowPro\.cloudflow-runtime\use-data-drive.ps1'
$Root='D:\CloudFlowPro'
$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
$Run=Join-Path $Root '.cloudflow-runtime/batch-g-integration/9799534e1a3a47b5958330f14ae16dc7'
$First=Join-Path $Evidence 'd2-current-first-20261006-r10'
$Failed=Join-Path $Evidence 'd2-leave-attendance-20261005-r25'
$Business=Join-Path $Evidence 'd2-leave-attendance-20261005-r26'
$Output=Join-Path $Evidence "d2-employee-first-continuation-20261007-$Round"
function Require([bool]$Value,[string]$Message){if(-not $Value){throw $Message}}
function Read-Json([string]$File){Get-Content -LiteralPath $File -Raw|ConvertFrom-Json}
Require (-not (Test-Path $Output) -and -not (Test-Path $Business)) 'Retain prior ordinary continuation'
Require ((Test-Path $Failed) -and @(Get-ChildItem -LiteralPath $Failed -File).Count -eq 0 -and -not (Test-Path (Join-Path $First 'measurement-result.json'))) 'Original failure must precede business setup'
$Log=Get-Content (Join-Path $First 'verification.log') -Raw
Require ($Log.Contains('original-verify-d2-leave-attendance.mjs') -and $Log.Contains('Could not find file') -and $Log.Contains('counter_before=1413; counter_after=1413; counter_writes=0')) 'Original preflight failure differs'
$Reload=Read-Json (Join-Path $First 'result.json')
Require ($Reload.Passed -and $Reload.BackendRound -eq 'r118' -and $Reload.HrReloadedLast -and $Reload.Layered -and $Reload.PackageVerificationRound -eq 'r9' -and $Reload.Services.Count -eq 6 -and @($Reload.Services|Where-Object Exit -ne 0).Count -eq 0) 'All original reloads must have completed'
$State=Read-Json (Join-Path $Run 'state.json')
Require ($State.status -eq 'RUNNING' -and $State.processes.Count -eq 9 -and $State.services.Count -eq 6) 'Original runtime incomplete'
foreach($Entry in $State.processes){
    $Observed=Get-CimInstance Win32_Process -Filter "ProcessId=$($Entry.id)"
    Require ($Observed -and $Observed.CommandLine.Contains($Entry.marker)) 'Owned process identity changed'
}
foreach($Service in $Reload.Services){$Current=@($State.processes|Where-Object name -eq $Service.Name);Require ($Current.Count -eq 1 -and $Current[0].id -eq $Service.Pid) 'Reloaded service identity changed before ordinary first request'}
foreach($Name in @('hr','gateway')){
    $Contents=Get-Content (Join-Path $Run "$Name/stdout.log") -Raw
    Require (-not $Contents.Contains('/attendance/recalculate')) 'A prior attendance request invalidates first request continuity'
}
$Inputs=@(Read-Json (Join-Path $First 'inputs.json'))+@(Read-Json (Join-Path $First 'layered-runtime-inputs.json'))
$Inputs+=[pscustomobject]@{Path=[IO.Path]::GetRelativePath($Root,$PSCommandPath);Hash=(Get-FileHash $PSCommandPath).Hash}
foreach($Name in @('result.json','inputs.json','layered-runtime-inputs.json','verification.log','original.ps1')){$File=Join-Path $First $Name;$Inputs+=[pscustomobject]@{Path=[IO.Path]::GetRelativePath($Root,$File);Hash=(Get-FileHash $File).Hash}}
function Assert-Inputs{foreach($Item in $Inputs){Require ((Get-FileHash (Join-Path $Root $Item.Path)).Hash -eq $Item.Hash) 'Original startup input or runtime changed'}}
Assert-Inputs
[IO.Directory]::CreateDirectory($Output)|Out-Null
$Inputs|ConvertTo-Json|Set-Content (Join-Path $Output 'inputs.json') -Encoding utf8NoBOM
Copy-Item -LiteralPath $PSCommandPath -Destination (Join-Path $Output 'original.ps1')
[pscustomobject]@{OriginalStartup='r10';FailedBusiness='r25';ServicesUnchanged=$true;PriorBusinessRequests=0;NoBusinessWarmup=$true;Profiling=$false;OriginalFailureRetained=$true;FailedRoundFiles=0}|ConvertTo-Json|Set-Content (Join-Path $Output 'precondition.json') -Encoding utf8NoBOM
& node scripts/run-d2-leave-attendance-allowance.mjs r26 r118 r76 r24 *> (Join-Path $Output 'verification.log')
$VerificationExit=$LASTEXITCODE
Assert-Inputs
Get-Content (Join-Path $Output 'verification.log')|Where-Object{$_ -match '^(D2_|OWNED_CAPTCHA_)'}
Require ($VerificationExit -eq 0) 'Continuation failed; retain original result'
$Actual=Read-Json (Join-Path $Business 'result.json')
Require ($Actual.passed -and $Actual.correctness -and $Actual.preservation -and $Actual.restoration -and $Actual.secrets -and -not $Actual.profiling -and $Actual.measurements.Count -eq 4) 'Ordinary continuation evidence incomplete'
$BusinessInputs=@(Read-Json (Join-Path $Business 'inputs.json'))
foreach($Name in @('run-d2-leave-attendance.ps1','verify-d2-leave-attendance.mjs','run-d2-leave-attendance-allowance.mjs')){
    $Source=Join-Path $Root "scripts/$Name"
    $Entry=@($BusinessInputs|Where-Object{[IO.Path]::GetFullPath($_.Path,$Root) -eq $Source})
    Require ($Entry.Count -eq 1 -and (Get-FileHash $Source).Hash -eq $Entry[0].Hash) 'Executed business source differs'
    Copy-Item -LiteralPath $Source -Destination (Join-Path $Business "original-$Name")
}
Copy-Item -LiteralPath (Join-Path $Business 'result.json') -Destination (Join-Path $Output 'verification-result-original.json')
[pscustomobject]@{Passed=$true;BusinessPassed=$true;PerformanceMet=$Actual.performanceMet;BackendRound='r118';FrontendRound='r76';VerificationRound='r26';ResumeSource='r24';
    Inputs=$Inputs.Count;InputChanges=0;Services=$Reload.Services;HrReloadedLast=$true;Profiling=$false;ExecutablePackages=$true;Layered=$true;PackageVerificationRound='r9';
    RuntimeInputs=@(Read-Json (Join-Path $First 'layered-runtime-inputs.json')).Count;RuntimeInputChanges=0;Measurements=$Actual.measurements;RequirementMilliseconds=500;
    OriginalStartupRound='r10';PreflightFailureRound='r25';OriginalHandle=52892;OriginalExit=1;NoPriorBusinessRequest=$true;OriginalServicesUnchanged=$true;All17Complete=$false;GlobalComplete=$false
}|ConvertTo-Json -Depth 6|Set-Content (Join-Path $Output 'measurement-result.json') -Encoding utf8NoBOM
"D2_EMPLOYEE_FIRST_CONTINUATION: checks=$($Actual.checks.Count); measurements=$($Actual.measurements.milliseconds -join ','); performance_met=$($Actual.performanceMet); original_reload_retained=true; input_changes=0"
