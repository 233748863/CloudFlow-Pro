param([ValidatePattern('^r[1-9][0-9]*$')][string]$Round='r1',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$CreateRound='r1',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$CorrectionRound='r1',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$AdjacentRound='r121')
$ErrorActionPreference='Stop'
. 'D:\CloudFlowPro\.cloudflow-runtime\use-data-drive.ps1'
$Root='D:\CloudFlowPro'
$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
$Run=Join-Path $Root '.cloudflow-runtime/batch-g-integration/9799534e1a3a47b5958330f14ae16dc7'
$Output=Join-Path $Evidence "d3-period-boundaries-stage-20261006-$Round.json"
if(Test-Path -LiteralPath $Output){throw 'Retain original period boundaries stage evidence'}
function Require([bool]$Condition,[string]$Message){if(-not $Condition){throw $Message}}
function Read-Json([string]$File){Get-Content -LiteralPath (Join-Path $Evidence $File) -Raw|ConvertFrom-Json}
$Creation="d3-create-close-20261006-$CreateRound"
$Correction="d3-period-corrections-20261006-$CorrectionRound"
$Create=Read-Json "$Creation/result.json"
Require ($Create.Passed -and $Create.Checks -eq 32 -and $Create.BackendRound -eq 'r108' -and $Create.ActualDatabase -and $Create.ActualService -and $Create.ActualBatchCreate -and $Create.ActualClose -and $Create.ActualPrecheck -and $Create.DistributedLock -and $Create.ControlledOverlap -and $Create.ScratchCleaned -and $Create.InputChanges -eq 0) 'Actual concurrent creation evidence incomplete'
Require (-not $Create.Http -and -not $Create.NaturalScheduler -and -not $Create.FreshCalculation -and -not $Create.OfficialTaxPolicy) 'Creation evidence boundary changed'
$Actual=Read-Json "$Correction/result.json"
foreach($Property in @('passed','pending','rejected','approvedUnpaid','paid','closed','preservation','restoration','secrets')){Require ($Actual.$Property -eq $true) "Actual correction evidence missing: $Property"}
Require (-not $Actual.all18Complete -and -not $Actual.globalComplete -and -not $Actual.officialTaxPolicyVerified -and $Actual.tasks -eq 1 -and $Actual.corrections -eq 2) 'Actual correction boundary differs'
$Fixture=Read-Json "$Correction/fixture.json"
Require ($Fixture.periods.Count -eq 2 -and $Fixture.corrections.Count -eq 2 -and $Fixture.tasks.Count -eq 1 -and $Fixture.tasks[0].terminal -eq 'SUCCESS' -and $Fixture.tasks[0].affectedRows -eq 1) 'Owned correction fixture accounting missing'
Require ($Fixture.corrections[0].decision -eq 'REJECTED' -and $Fixture.corrections[1].decision -eq 'APPLIED' -and $Fixture.corrections[1].paid) 'Actual decisions or payment missing'
foreach($Property in @('corrections','batch','periods','tax','workflow','preservation')){Require ($Fixture.restorations.$Property -eq $true) 'Fixture restoration incomplete'}
foreach($Label in @('reject_pending_close_rejected','approve_pending_close_rejected','approved_unpaid_close_rejected','rejection_releases_period','correction_paid_same_amounts','closed_period_rejects_new_correction','original_paid_salary_entire_row_preserved')){Require ($Actual.checks.Contains($Label)) "Missing period boundary: $Label"}
$Current=@{}
foreach($Group in @("$Creation/inputs.json","$Correction/inputs.json","h3-portal-finance-adjacent-20261002-$AdjacentRound/inputs.json",'h3-portal-finance-20261002-backend-r108-inputs.json','h3-portal-finance-20261002-frontend-r66-inputs.json')){
    foreach($Item in @(Read-Json $Group)){
        if(-not $Current.ContainsKey($Item.Path)){$Current[$Item.Path]=(Get-FileHash -LiteralPath (Join-Path $Root $Item.Path)).Hash}
        Require ($Current[$Item.Path] -eq $Item.Hash) 'Verified source changed'
    }
}
$Binaries=@(Read-Json "$Creation/binary-inputs.json")
foreach($Item in $Binaries){Require ((Get-FileHash -LiteralPath $Item.Path).Hash -eq $Item.Hash) 'Compiled dependency changed'}
$Originals=0
foreach($Group in @(@{Folder=$Creation;Names=@('run-d3-create-close.ps1','verify-hr-settlement-foundation.ps1','HrPayrollCreateCloseChecks.java')},@{Folder=$Correction;Names=@('run-d3-period-corrections.ps1','verify-d3-period-corrections.mjs','run-d3-period-corrections-allowance.mjs','d1-leave-runtime.mjs','form-browser-auth.mjs')})){
    $Inputs=@(Read-Json "$($Group.Folder)/inputs.json")
    foreach($Name in $Group.Names){
        $Original=@($Inputs|Where-Object {(Split-Path -Leaf $_.Path) -eq $Name})
        Require ($Original.Count -eq 1 -and (Get-FileHash -LiteralPath (Join-Path $Evidence "$($Group.Folder)/original-$Name")).Hash -eq $Original[0].Hash) 'Original executed script differs';$Originals++
    }
}
$PreviousInputs=@(Read-Json 'h3-portal-finance-adjacent-20261002-r120/inputs.json')
$Foundation=@($PreviousInputs|Where-Object {(Split-Path -Leaf $_.Path) -eq 'verify-hr-settlement-foundation.ps1'})
$OriginalFoundation=Join-Path $Evidence 'd3-create-close-original-foundation-20261006.ps1'
Require ($Foundation.Count -eq 1 -and (Get-FileHash -LiteralPath $OriginalFoundation).Hash -eq $Foundation[0].Hash) 'Shared runner previous original differs'
$Before=[IO.File]::ReadAllText($OriginalFoundation).Replace("`r`n","`n").TrimEnd()
$Expected=$Before.Replace('[string]$StatePath, [switch]$PayrollGenerationResume','[string]$StatePath, [switch]$PayrollCreateClose, [switch]$PayrollGenerationResume').Replace('@($PayrollGenerationResume,','@($PayrollCreateClose, $PayrollGenerationResume,').Replace('$CheckClass = if ($PayrollGenerationResume)','$CheckClass = if ($PayrollCreateClose) { ''HrPayrollCreateCloseChecks'' } elseif ($PayrollGenerationResume)').Replace('if ($PayrollGenerationResume -or $PayrollReplay -or $SourceReservation -or $Funds)','if ($PayrollCreateClose -or $PayrollGenerationResume -or $PayrollReplay -or $SourceReservation -or $Funds)')
Require ($Expected -eq [IO.File]::ReadAllText((Join-Path $Root 'scripts/verify-hr-settlement-foundation.ps1')).Replace("`r`n","`n").TrimEnd()) 'Shared runner exceeds five isolated mode additions'
foreach($Name in @('d1-leave-runtime.mjs','form-browser-auth.mjs')){
    $Original=@($PreviousInputs|Where-Object {(Split-Path -Leaf $_.Path) -eq $Name})
    Require ($Original.Count -eq 1 -and (Get-FileHash -LiteralPath (Join-Path $Root $Original[0].Path)).Hash -eq $Original[0].Hash) 'Shared authentication helper changed'
}
$Prior=Read-Json 'd3-generation-resume-stage-20261006-r1.json'
Require ($Prior.passed -and $Prior.checks -eq 123 -and $Prior.backend -eq 'r108') 'Previous generation stage incomplete'
Require ((Get-Content (Join-Path $Evidence "$Creation-launch.log") -Raw).Contains('D3_PAYROLL_CREATE_CLOSE_RUN_EXIT=0')) 'Original create terminal missing'
$Launch=Get-Content (Join-Path $Evidence "$Correction-launch.log") -Raw
Require ($Launch.Contains('D3_PERIOD_CORRECTIONS_RUN_EXIT=0') -and $Launch -match 'OWNED_CAPTCHA_RESTORED: original_limit=100; original_ttl=-1; counter_before=(\d+); counter_after=(\d+); counter_writes=0; database_unchanged=true; production_modified=false') 'Actual terminal or configuration restoration missing'
$CaptchaBefore=[int]$Matches[1];$CaptchaAfter=[int]$Matches[2]
$Adjacent=Get-Content (Join-Path $Evidence "h3-portal-finance-adjacent-20261002-$AdjacentRound/summary.log") -Raw
Require ($Adjacent -match 'H3_FINANCE_ADJACENT: files=(\d+); changed=0; exit=0; production_modified=false') 'Related regression incomplete'
$AdjacentInputs=[int]$Matches[1]
$State=Get-Content (Join-Path $Run 'state.json') -Raw|ConvertFrom-Json
Require ($State.status -eq 'RUNNING' -and [IO.Path]::GetFullPath($State.run) -eq $Run) 'Owned runtime required'
foreach($Entry in $State.processes){$Observed=Get-CimInstance Win32_Process -Filter "ProcessId=$($Entry.id)";Require ($Observed -and $Observed.CommandLine.Contains($Entry.marker)) 'Owned process mismatch'}
$Healthy=0
foreach($Service in $State.services){Require ((Invoke-RestMethod "http://127.0.0.1:$($Service.healthPort)/actuator/health" -TimeoutSec 5).status -eq 'UP') 'Unhealthy service';$Healthy++}
$Summary=[pscustomobject]@{passed=$true;backend='r108';frontend='r66';createRound=$CreateRound;correctionRound=$CorrectionRound;creationChecks=$Create.Checks;actualChecks=$Actual.checks.Count;requests=$Actual.requests;tasks=$Actual.tasks;corrections=$Actual.corrections;currentInputs=$Current.Count;binaryInputs=$Binaries.Count;adjacentInputs=$AdjacentInputs;originalScripts=$Originals;sharedRunnerChanges=5;processes=$State.processes.Count;healthyServices=$Healthy;captchaBefore=$CaptchaBefore;captchaAfter=$CaptchaAfter;officialTaxPolicyVerified=$false;all18Complete=$false;globalComplete=$false;remaining=@('Official tax policy','D3 current full18 acceptance','D2 first ordinary request below500ms','Global35PRD681')}
$Summary|ConvertTo-Json -Depth 5|Set-Content -LiteralPath $Output -Encoding utf8NoBOM
"D3_PERIOD_BOUNDARIES_STAGE: create_checks=$($Create.Checks); actual_checks=$($Actual.checks.Count); inputs=$($Current.Count); binaries=$($Binaries.Count); adjacent=$AdjacentInputs; originals=$Originals; processes=$($State.processes.Count); healthy=$Healthy; global_complete=false"
