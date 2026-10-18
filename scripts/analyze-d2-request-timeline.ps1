param([Parameter(Mandatory=$true)][ValidatePattern('^r[1-9][0-9]*$')][string]$ProfileRound,
    [Parameter(Mandatory=$true)][ValidatePattern('^r[1-9][0-9]*$')][string]$VerificationRound,
    [ValidatePattern('^r[1-9][0-9]*$')][string]$Round='r1')
$ErrorActionPreference='Stop'
. 'D:\CloudFlowPro\.cloudflow-runtime\use-data-drive.ps1'
$Root='D:\CloudFlowPro'
$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
$ProfilePath=Join-Path $Evidence "d2-cold-first-profile-20261005-$ProfileRound"
$VerificationPath=Join-Path $Evidence "d2-leave-attendance-20261005-$VerificationRound/result.json"
$Output=Join-Path $ProfilePath "timeline-$Round"
if(Test-Path -LiteralPath $Output){throw 'Retain existing request timeline'}
$Profile=Get-Content -LiteralPath (Join-Path $ProfilePath 'result.json') -Raw|ConvertFrom-Json
$Verification=Get-Content -LiteralPath $VerificationPath -Raw|ConvertFrom-Json
if(-not $Profile.passed -or -not $Profile.profilesStopped -or -not $Profile.inputsUnchanged -or $Profile.performanceAcceptance -or $Profile.verificationRound -ne $VerificationRound -or -not $Verification.passed -or -not $Verification.profiling -or $Verification.measurements.Count -ne 4){throw 'Completed diagnostic evidence required'}
$JavaSource=Join-Path $Root 'scripts/hr-checks/D2FirstRequestTimeline.java'
$Paths=@($PSCommandPath,$JavaSource,(Join-Path $ProfilePath 'result.json'),$VerificationPath,(Join-Path $ProfilePath 'hr.jfr'))
$Inputs=@($Paths|ForEach-Object{[pscustomobject]@{Path=$_;Hash=(Get-FileHash -LiteralPath $_).Hash}})
[IO.Directory]::CreateDirectory($Output)|Out-Null
$Inputs|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $Output 'inputs.json') -Encoding utf8NoBOM
foreach($Source in @($PSCommandPath,$JavaSource)){[IO.File]::Copy($Source,(Join-Path $Output ('original-'+(Split-Path -Leaf $Source))),$false)}
$First=$Verification.measurements[0]
& java $JavaSource (Join-Path $ProfilePath 'hr.jfr') ([string]$First.startedAt) ([string]$First.endedAt) *> (Join-Path $Output 'timeline.log')
if($LASTEXITCODE -ne 0){throw 'Timeline analysis failed; original evidence retained'}
foreach($Input in $Inputs){if((Get-FileHash -LiteralPath $Input.Path).Hash -ne $Input.Hash){throw 'Timeline input changed'}}
$Limit=@(Get-Content -LiteralPath (Join-Path $Output 'timeline.log')|Where-Object {$_ -match '^TIMELINE_LIMITS '})
if($Limit.Count -ne 1){throw 'Timeline boundary marker missing'}
[pscustomobject]@{Passed=$true;ProfileRound=$ProfileRound;VerificationRound=$VerificationRound;Backend=$Profile.backendRound;Frontend=$Profile.frontendRound;Inputs=$Inputs.Count;InputChanges=0;FirstRequestMilliseconds=$First.milliseconds;ProfilesStopped=$true;OrdinaryPerformanceAcceptance=$false;BusinessReexecuted=$false;ProductModified=$false;OutputHash=(Get-FileHash -LiteralPath (Join-Path $Output 'timeline.log')).Hash}|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $Output 'result.json') -Encoding utf8NoBOM
$Limit
'D2_TIMELINE_ANALYSIS: changed=0; ordinary_performance_acceptance=false; product_modified=false'
