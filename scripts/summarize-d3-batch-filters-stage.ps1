param([ValidatePattern('^r[1-9][0-9]*$')][string]$Round='r1',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$LiveRound='r4',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$AdjacentRound='r116')
$ErrorActionPreference='Stop'
. 'D:\CloudFlowPro\.cloudflow-runtime\use-data-drive.ps1'
$Root='D:\CloudFlowPro'
$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
$Run=Join-Path $Root '.cloudflow-runtime/batch-g-integration/9799534e1a3a47b5958330f14ae16dc7'
$Output=Join-Path $Evidence "d3-batch-filters-stage-20261006-$Round.json"
if(Test-Path -LiteralPath $Output){throw 'Retain original batch filters stage evidence'}
function Require([bool]$Condition,[string]$Message){if(-not $Condition){throw $Message}}
function Read-Json([string]$File){Get-Content -LiteralPath (Join-Path $Evidence $File) -Raw|ConvertFrom-Json}
$Folder="d3-batch-filters-20261006-$LiveRound"
$Result=Read-Json "$Folder/result.json"
foreach($Name in @('passed','filters','persisted','failurePage','retry','cancelPermission','closed','preservation','restoration','secrets')){Require ($Result.$Name -eq $true) "Missing batch filters evidence: $Name"}
Require (-not $Result.all18Complete -and -not $Result.globalComplete -and -not $Result.officialTaxPolicyVerified) 'Stage scope changed'
$Fixture=Read-Json "$Folder/fixture.json"
Require ($Fixture.employees.Count -eq 3 -and $Fixture.batches.Count -eq 3 -and $Fixture.tasks.Count -eq 3 -and $Result.tasks -eq 3) 'Actual fixture accounting differs'
Require ($Fixture.levels.Count -eq 2 -and $Fixture.positions.Count -eq 2 -and @($Fixture.bounds.PSObject.Properties).Count -eq 17 -and @($Fixture.original.PSObject.Properties).Count -eq 18) 'Fixture or original business protection differs'
foreach($Task in $Fixture.tasks){Require ($Task.terminal -eq 'SUCCESS' -and $Task.affectedRows -eq 1) 'Original task terminal differs'}
foreach($Batch in $Fixture.batches){Require ($Fixture.restorations.($Batch.id) -eq $true -and $Result.checks.Contains("owned_batch_cancelled_$($Batch.id)")) 'Owned batch restoration missing'}
foreach($Check in @('filter_all','filter_department','filter_position','filter_level','filter_type','filter_intersection','filter_incompatible','filter_outside','only_failed_employee_retried','previous_successful_salary_all_fields_unchanged','real_page_refresh_clears_resolved_error','owned_test_period_closed','owned_tax_disabled','all_original_business_rows_and_grants_preserved')){Require ($Result.checks.Contains($Check)) "Missing actual check: $Check"}
Require ($Fixture.mobileReasonBounds.x -ge 0 -and $Fixture.mobileReasonBounds.x+$Fixture.mobileReasonBounds.width -le 390 -and $Fixture.mobileReasonBounds.height -gt 0) 'Mobile failure reason extends beyond viewport'
foreach($File in @('mixed-failure-desktop.png','mixed-failure-mobile.png','mixed-retry-mobile.png')){Require ((Get-Item -LiteralPath (Join-Path $Evidence "$Folder/$File")).Length -gt 0) 'Real browser evidence missing'}
$Requests=@(Read-Json "$Folder/requests.json")
Require ($Requests.Count -eq $Result.requests) 'Request accounting differs'
$Current=@{}
foreach($Group in @("$Folder/inputs.json","h3-portal-finance-adjacent-20261002-$AdjacentRound/inputs.json",'h3-portal-finance-20261002-backend-r106-inputs.json','h3-portal-finance-20261002-frontend-r66-inputs.json')){
    foreach($Item in @(Read-Json $Group)){
        if(-not $Current.ContainsKey($Item.Path)){$Current[$Item.Path]=(Get-FileHash -LiteralPath (Join-Path $Root $Item.Path)).Hash}
        if($Current[$Item.Path] -ne $Item.Hash -and $Item.Path.Replace('\','/') -eq 'scripts/summarize-d3-batch-filters-stage.ps1'){
            $Review=Read-Json 'd3-batch-filters-stage-report-review.json'
            Require ($Review.beforeHash -eq $Item.Hash -and $Review.afterHash -eq $Current[$Item.Path] -and (Get-FileHash -LiteralPath (Join-Path $Evidence 'd3-batch-filters-stage-original-r116.ps1')).Hash -eq $Item.Hash) 'Report-only reviewed change differs'
        }else{Require ($Current[$Item.Path] -eq $Item.Hash) 'Verified source input changed'}
    }
}
$Inputs=@(Read-Json "$Folder/inputs.json")
$Originals=0
foreach($Name in @('run-d3-batch-filters.ps1','verify-d3-batch-filters.mjs','run-d3-batch-filters-allowance.mjs','d1-leave-runtime.mjs')){
    $Input=@($Inputs|Where-Object {(Split-Path -Leaf $_.Path) -eq $Name})
    Require ($Input.Count -eq 1 -and (Get-FileHash -LiteralPath (Join-Path $Evidence "$Folder/original-$Name")).Hash -eq $Input[0].Hash) 'Original executed script changed';$Originals++
}
foreach($Build in @('backend-r106','frontend-r66')){Require ((Get-Content (Join-Path $Evidence "h3-portal-finance-20261002-$Build.log") -Raw).Contains('changed=0; exit=0')) 'Verified build incomplete'}
$Launch=Get-Content (Join-Path $Evidence "d3-batch-filters-20261006-$LiveRound-launch.log") -Raw
Require ($Launch.Contains('D3_FILTERS_RUN_EXIT=0') -and $Launch -match 'OWNED_CAPTCHA_RESTORED: original_limit=100; original_ttl=-1; counter_before=(\d+); counter_after=(\d+); counter_writes=0; database_unchanged=true; production_modified=false') 'Original terminal or configuration restoration missing'
$CaptchaBefore=[int]$Matches[1];$CaptchaAfter=[int]$Matches[2]
$Prior1=Read-Json 'd3-batch-filters-20261006-r1/result.json'
$Prior2=Read-Json 'd3-batch-filters-20261006-r2/result.json'
$Prior3=Read-Json 'd3-batch-filters-20261006-r3/result.json'
Require (-not $Prior1.passed -and $Prior1.preservation -and $Prior1.restoration -and (Read-Json 'd3-batch-filters-20261006-r1/fixture.json').employees.Count -eq 0) 'Original incomplete level fixture failure changed'
Require ($Prior2.passed -and $Prior2.preservation -and $Prior2.restoration -and $Prior2.checks.Count -eq 97) 'Previous business verification changed'
Require (-not $Prior3.passed -and $Prior3.preservation -and $Prior3.restoration -and $Prior3.failure.Contains('mobile_failure_reason_fits_viewport')) 'Original mobile verification failure changed'
Require ($Result.checks.Contains('prior_empty_period_closed') -and $Result.checks.Contains('prior_failed_page_period_closed')) 'Previous owned periods not closed'
foreach($File in @('mixed-failure-desktop.png','mixed-failure-mobile.png')){Require ((Get-Item -LiteralPath (Join-Path $Evidence "d3-batch-filters-20261006-r2/$File")).Length -gt 0) 'Original page defect evidence missing'}
Require ((Get-Item -LiteralPath (Join-Path $Evidence 'd3-batch-filters-20261006-r3/mixed-failure-desktop.png')).Length -gt 0) 'Original failed run desktop screenshot missing'
$Adjacent=Get-Content (Join-Path $Evidence "h3-portal-finance-adjacent-20261002-$AdjacentRound/summary.log") -Raw
Require ($Adjacent -match 'H3_FINANCE_ADJACENT: files=(\d+); changed=0; exit=0; production_modified=false') 'Related regression incomplete'
$AdjacentInputs=[int]$Matches[1]
$State=Get-Content (Join-Path $Run 'state.json') -Raw|ConvertFrom-Json
Require ($State.status -eq 'RUNNING' -and [IO.Path]::GetFullPath($State.run) -eq $Run) 'Owned runtime required'
foreach($Entry in $State.processes){$Observed=Get-CimInstance Win32_Process -Filter "ProcessId=$($Entry.id)";Require ($Observed -and $Observed.CommandLine.Contains($Entry.marker)) 'Owned process mismatch'}
$Healthy=0
foreach($Service in $State.services){Require ((Invoke-RestMethod "http://127.0.0.1:$($Service.healthPort)/actuator/health" -TimeoutSec 5).status -eq 'UP') 'Unhealthy service';$Healthy++}
$Summary=[pscustomobject]@{passed=$true;backend='r106';frontend='r66';liveRound=$LiveRound;checks=$Result.checks.Count;requests=$Result.requests;tasks=$Result.tasks;employees=$Fixture.employees.Count;batches=$Fixture.batches.Count;periodId=$Fixture.periodId;taxSlabId=$Fixture.slabId;originalBusinessTables=17;originalGrantsPreserved=$true;liveInputs=$Inputs.Count;currentInputs=$Current.Count;adjacentInputs=$AdjacentInputs;originalScripts=$Originals;processes=$State.processes.Count;healthyServices=$Healthy;captchaBefore=$CaptchaBefore;captchaAfter=$CaptchaAfter;officialTaxPolicyVerified=$false;all18Complete=$false;globalComplete=$false;remaining=@('Cancellation role and tenant matrix','Internal execution reentry','Concurrent creation wins against closing','Pending correction and period closing','Official tax policy','D2 first ordinary request below500ms','Global35PRD681')}
$Summary|Add-Member -NotePropertyName reportOnlyReview -NotePropertyValue 'R1 required an unsaved R3 mobile screenshot; R2 retains the actual R3 failure and desktop evidence; current R4 mobile evidence remains mandatory'
$Summary|ConvertTo-Json -Depth 5|Set-Content -LiteralPath $Output -Encoding utf8NoBOM
"D3_FILTERS_STAGE: checks=$($Result.checks.Count); requests=$($Result.requests); tasks=$($Result.tasks); inputs=$($Current.Count); adjacent=$AdjacentInputs; originals=$Originals; processes=$($State.processes.Count); healthy=$Healthy; global_complete=false"
