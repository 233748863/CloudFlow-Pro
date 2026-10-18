param([Parameter(Mandatory=$true)][ValidatePattern('^r[1-9][0-9]*$')][string]$ProfileRound,
    [Parameter(Mandatory=$true)][ValidatePattern('^r[1-9][0-9]*$')][string]$VerificationRound,
    [ValidatePattern('^r[1-9][0-9]*$')][string]$Round='r1')
$ErrorActionPreference='Stop'
. 'D:\CloudFlowPro\.cloudflow-runtime\use-data-drive.ps1'
$Root='D:\CloudFlowPro'
$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
$ProfilePath=Join-Path $Evidence "d2-cold-first-profile-20261005-$ProfileRound"
$VerificationPath=Join-Path $Evidence "d2-leave-attendance-20261005-$VerificationRound"
$Output=Join-Path $ProfilePath "analysis-$Round"
if(Test-Path -LiteralPath $Output){throw 'Retain original diagnostic analysis'}
$Profile=Get-Content -LiteralPath (Join-Path $ProfilePath 'result.json') -Raw|ConvertFrom-Json
$Verification=Get-Content -LiteralPath (Join-Path $VerificationPath 'result.json') -Raw|ConvertFrom-Json
if(-not $Profile.passed -or -not $Profile.profilesStopped -or -not $Profile.inputsUnchanged -or $Profile.performanceAcceptance -or $Profile.verificationRound -ne $VerificationRound -or -not $Verification.passed -or -not $Verification.profiling -or $Verification.measurements.Count -ne 4){throw 'Completed diagnostic run and four observations required'}
$Scripts=@('scripts/analyze-d2-first-profile.ps1','scripts/hr-checks/D2FirstRequestProfileSummary.java','scripts/hr-checks/D2FirstRequestStackGroups.java','scripts/hr-checks/D2FirstRequestClassLoadSummary.java')
$Paths=@($Scripts)+@([IO.Path]::GetRelativePath($Root,(Join-Path $ProfilePath 'result.json')),[IO.Path]::GetRelativePath($Root,(Join-Path $VerificationPath 'result.json')))
foreach($Name in @('hr','auth','gateway')){$Paths+=[IO.Path]::GetRelativePath($Root,(Join-Path $ProfilePath "$Name.jfr"))}
$Inputs=@($Paths|ForEach-Object{[pscustomobject]@{Path=$_;Hash=(Get-FileHash -LiteralPath (Join-Path $Root $_)).Hash}})
[IO.Directory]::CreateDirectory($Output)|Out-Null
$Inputs|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $Output 'inputs.json') -Encoding utf8NoBOM
foreach($Script in $Scripts){[IO.File]::Copy((Join-Path $Root $Script),(Join-Path $Output ('original-'+(Split-Path -Leaf $Script))),$false)}
$First=$Verification.measurements[0]
$Jobs=@(@{Name='hr-summary';Script=$Scripts[1];Recording='hr'},@{Name='auth-summary';Script=$Scripts[1];Recording='auth'},@{Name='gateway-summary';Script=$Scripts[1];Recording='gateway'},@{Name='hr-stacks';Script=$Scripts[2];Recording='hr'},@{Name='hr-class-load';Script=$Scripts[3];Recording='hr'})
foreach($Job in $Jobs){
    & java $Job.Script (Join-Path $ProfilePath ($Job.Recording+'.jfr')) ([string]$First.startedAt) ([string]$First.endedAt) *> (Join-Path $Output ($Job.Name+'.log'))
    if($LASTEXITCODE -ne 0){throw 'Read-only profile analysis failed; original retained'}
}
foreach($Item in $Inputs){if((Get-FileHash -LiteralPath (Join-Path $Root $Item.Path)).Hash -ne $Item.Hash){throw 'Diagnostic analysis input changed'}}
$Outputs=@($Jobs|ForEach-Object{[pscustomobject]@{Path=($_.Name+'.log');Hash=(Get-FileHash -LiteralPath (Join-Path $Output ($_.Name+'.log'))).Hash}})
[pscustomobject]@{Passed=$true;ProfileRound=$ProfileRound;VerificationRound=$VerificationRound;Backend=$Profile.backendRound;Frontend=$Profile.frontendRound;Inputs=$Inputs.Count;InputChanges=0;OriginalScripts=$Scripts.Count;Outputs=$Outputs;FirstRequestMilliseconds=$First.milliseconds;ProfilesStopped=$true;OrdinaryPerformanceAcceptance=$false;BusinessReexecuted=$false;ProductModified=$false}|ConvertTo-Json -Depth 5|Set-Content -LiteralPath (Join-Path $Output 'result.json') -Encoding utf8NoBOM
"D2_PROFILE_ANALYSIS: inputs=$($Inputs.Count); changed=0; summaries=$($Outputs.Count); scripts=$($Scripts.Count); profiling=true; ordinary_performance_acceptance=false; product_modified=false"
