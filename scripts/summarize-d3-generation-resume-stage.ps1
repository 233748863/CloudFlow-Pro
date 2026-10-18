param([ValidatePattern('^r[1-9][0-9]*$')][string]$Round='r1',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$ResumeRound='r2',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$AdjacentRound='r120')
$ErrorActionPreference='Stop'
. 'D:\CloudFlowPro\.cloudflow-runtime\use-data-drive.ps1'
$Root='D:\CloudFlowPro'
$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
$Run=Join-Path $Root '.cloudflow-runtime/batch-g-integration/9799534e1a3a47b5958330f14ae16dc7'
$Output=Join-Path $Evidence "d3-generation-resume-stage-20261006-$Round.json"
if(Test-Path -LiteralPath $Output){throw 'Retain original generation resume stage evidence'}
function Require([bool]$Condition,[string]$Message){if(-not $Condition){throw $Message}}
function Read-Json([string]$File){Get-Content -LiteralPath (Join-Path $Evidence $File) -Raw|ConvertFrom-Json}
$Resume="d3-generation-resume-20261006-$ResumeRound"
$Result=Read-Json "$Resume/result.json"
Require ($Result.Passed -and $Result.Checks -eq 123 -and $Result.BackendRound -eq 'r108' -and $Result.ActualDatabase -and $Result.ActualService -and $Result.ActualGeneration -and $Result.ActualReservation -and $Result.DistributedLock -and $Result.ControlledPreview -and $Result.ControlledOverlap -and $Result.ScratchCleaned -and $Result.InputChanges -eq 0) 'Actual generation resume evidence incomplete'
Require (-not $Result.Http -and -not $Result.NaturalScheduler -and -not $Result.FreshCalculation -and -not $Result.OfficialTaxPolicy) 'Generation evidence boundary changed'
$Current=@{}
foreach($Group in @("$Resume/inputs.json","h3-portal-finance-adjacent-20261002-$AdjacentRound/inputs.json",'h3-portal-finance-20261002-backend-r108-inputs.json','h3-portal-finance-20261002-frontend-r66-inputs.json')){
    foreach($Item in @(Read-Json $Group)){
        if(-not $Current.ContainsKey($Item.Path)){$Current[$Item.Path]=(Get-FileHash -LiteralPath (Join-Path $Root $Item.Path)).Hash}
        Require ($Current[$Item.Path] -eq $Item.Hash) 'Verified source changed'
    }
}
$Binaries=@(Read-Json "$Resume/binary-inputs.json")
foreach($Item in $Binaries){Require ((Get-FileHash -LiteralPath $Item.Path).Hash -eq $Item.Hash) 'Compiled dependency changed'}
$Inputs=@(Read-Json "$Resume/inputs.json")
$Originals=0
foreach($Name in @('run-d3-generation-resume.ps1','verify-hr-settlement-foundation.ps1','HrPayrollGenerationResumeChecks.java')){
    $Original=@($Inputs|Where-Object {(Split-Path -Leaf $_.Path) -eq $Name})
    Require ($Original.Count -eq 1 -and (Get-FileHash -LiteralPath (Join-Path $Evidence "$Resume/original-$Name")).Hash -eq $Original[0].Hash) 'Original executed script differs';$Originals++
}
$PreviousInputs=@(Read-Json 'h3-portal-finance-adjacent-20261002-r119/inputs.json')
$Foundation=@($PreviousInputs|Where-Object {(Split-Path -Leaf $_.Path) -eq 'verify-hr-settlement-foundation.ps1'})
$OriginalFoundation=Join-Path $Evidence 'd3-generation-resume-original-foundation-20261006.ps1'
Require ($Foundation.Count -eq 1 -and (Get-FileHash -LiteralPath $OriginalFoundation).Hash -eq $Foundation[0].Hash) 'Shared runner previous original differs'
$Before=[IO.File]::ReadAllText($OriginalFoundation).Replace("`r`n","`n").TrimEnd()
$Expected=$Before.Replace('[string]$StatePath, [switch]$PayrollReplay','[string]$StatePath, [switch]$PayrollGenerationResume, [switch]$PayrollReplay').Replace('@($PayrollReplay,','@($PayrollGenerationResume, $PayrollReplay,').Replace('$CheckClass = if ($PayrollReplay)','$CheckClass = if ($PayrollGenerationResume) { ''HrPayrollGenerationResumeChecks'' } elseif ($PayrollReplay)').Replace('if ($PayrollReplay -or $SourceReservation -or $Funds)','if ($PayrollGenerationResume -or $PayrollReplay -or $SourceReservation -or $Funds)')
Require ($Expected -eq [IO.File]::ReadAllText((Join-Path $Root 'scripts/verify-hr-settlement-foundation.ps1')).Replace("`r`n","`n").TrimEnd()) 'Shared runner exceeds five isolated mode additions'
$First=Read-Json 'd3-generation-resume-20261006-r1/result.json'
Require ($First.Passed -and $First.Checks -eq 84 -and $First.ScratchCleaned) 'First resume round evidence missing'
$FirstInputs=@(Read-Json 'd3-generation-resume-20261006-r1/inputs.json')
$FirstChecker=@($FirstInputs|Where-Object {(Split-Path -Leaf $_.Path) -eq 'HrPayrollGenerationResumeChecks.java'})
Require ($FirstChecker.Count -eq 1 -and (Get-FileHash -LiteralPath (Join-Path $Evidence 'd3-generation-resume-20261006-r1/original-HrPayrollGenerationResumeChecks.java')).Hash -eq $FirstChecker[0].Hash) 'First checker original changed'
$Prior=Read-Json 'd3-payroll-generation-stage-20261006-r1.json'
Require ($Prior.passed -and $Prior.checks -eq 108 -and $Prior.liveChecks -eq 101 -and $Prior.backend -eq 'r108') 'Previous B108 stage incomplete'
Require ((Get-Content (Join-Path $Evidence "$Resume-launch.log") -Raw).Contains('D3_PAYROLL_GENERATION_RESUME_RUN_EXIT=0')) 'Original resume terminal missing'
$Adjacent=Get-Content (Join-Path $Evidence "h3-portal-finance-adjacent-20261002-$AdjacentRound/summary.log") -Raw
Require ($Adjacent -match 'H3_FINANCE_ADJACENT: files=(\d+); changed=0; exit=0; production_modified=false') 'Related regression incomplete'
$AdjacentInputs=[int]$Matches[1]
$State=Get-Content (Join-Path $Run 'state.json') -Raw|ConvertFrom-Json
Require ($State.status -eq 'RUNNING' -and [IO.Path]::GetFullPath($State.run) -eq $Run) 'Owned runtime required'
foreach($Entry in $State.processes){$Observed=Get-CimInstance Win32_Process -Filter "ProcessId=$($Entry.id)";Require ($Observed -and $Observed.CommandLine.Contains($Entry.marker)) 'Owned process mismatch'}
$Healthy=0
foreach($Service in $State.services){Require ((Invoke-RestMethod "http://127.0.0.1:$($Service.healthPort)/actuator/health" -TimeoutSec 5).status -eq 'UP') 'Unhealthy service';$Healthy++}
$Summary=[pscustomobject]@{passed=$true;backend='r108';frontend='r66';resumeRound=$ResumeRound;checks=$Result.Checks;sourceInputs=$Result.SourceInputs;binaryInputs=$Binaries.Count;currentInputs=$Current.Count;adjacentInputs=$AdjacentInputs;originalScripts=$Originals;sharedRunnerChanges=5;processes=$State.processes.Count;healthyServices=$Healthy;controlledPreview=$true;controlledOverlap=$true;naturalScheduler=$false;processKill=$false;officialTaxPolicyVerified=$false;all18Complete=$false;globalComplete=$false;remaining=@('Concurrent creation wins against closing','Pending correction and period closing','Official tax policy','D2 first ordinary request below500ms','Global35PRD681')}
$Summary|ConvertTo-Json -Depth 5|Set-Content -LiteralPath $Output -Encoding utf8NoBOM
"D3_GENERATION_RESUME_STAGE: checks=$($Result.Checks); inputs=$($Current.Count); binaries=$($Binaries.Count); adjacent=$AdjacentInputs; originals=$Originals; processes=$($State.processes.Count); healthy=$Healthy; global_complete=false"
