param([ValidatePattern('^r[1-9][0-9]*$')][string]$Round='r1',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$LiveRound='r1',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$AdjacentRound='r103')
$ErrorActionPreference='Stop'
. 'D:\CloudFlowPro\.cloudflow-runtime\use-data-drive.ps1'
$Root='D:\CloudFlowPro'
$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
$Run=Join-Path $Root '.cloudflow-runtime/batch-g-integration/9799534e1a3a47b5958330f14ae16dc7'
$Report=Join-Path $Evidence "d3-salary-presentation-stage-20261006-$Round.json"
if(Test-Path -LiteralPath $Report){throw 'Retain salary PDF stage evidence'}
function Require([bool]$Condition,[string]$Message){if(-not $Condition){throw $Message}}
function Read-Json([string]$Relative){Get-Content -LiteralPath (Join-Path $Evidence $Relative) -Raw|ConvertFrom-Json}
$Folder="d3-salary-presentation-20261006-$LiveRound"
$Result=Read-Json "$Folder/result.json"
foreach($Name in @('passed','content','preservation','secrets')){Require ($Result.$Name -eq $true) "PDF evidence missing: $Name"}
Require (-not $Result.all18Complete -and -not $Result.globalComplete -and -not $Result.officialTaxPolicyVerified) 'Scope changed'
foreach($Name in @('owned_saved_payroll_component_name','no_internal_计薪口径快照','no_internal_社保扣除月份快照','no_internal_累计个税计算快照','component_key_not_printed_in_place_of_name')){Require ($Result.checks -contains $Name) 'Business presentation check missing'}
$Content=Read-Json "$Folder/content-check.json"
Require ($Content.items.Count -eq 20 -and @($Content.items|Where-Object present -NE $true).Count -eq 0) 'PDF text missing'
Require ((Get-FileHash (Join-Path $Evidence "$Folder/salary.pdf")).Hash -eq $Content.sha256) 'Actual PDF changed'
$Probe=Get-Content (Join-Path $Evidence "$Folder/probe.log") -Raw
Require ($Probe.Contains('D3_PDF_SHARED_TEMPLATES: certificate=true; training=true; packaged_regular_font=true')) 'Shared template Chinese check missing'
foreach($Name in @('salary.png','certificate.pdf','training.pdf')){Require (Test-Path (Join-Path $Evidence "$Folder/$Name")) 'Rendered artifact missing'}
$Previous=Read-Json 'd3-salary-pdf-stage-20261006-r1.json'
Require ($Previous.passed -and $Previous.backend -eq 'r96') 'Previous Chinese rendering stage missing'
$Before=@(Read-Json 'h3-portal-finance-20261002-backend-r96-inputs.json'|Where-Object {$_.Path.Replace('\','/').EndsWith('/service/HrSalarySlipPrintService.java')})
Require ($Before.Count -eq 1 -and (Get-FileHash (Join-Path $Evidence 'd3-salary-pdf-20261006-r5/before-presentation-HrSalarySlipPrintService.java')).Hash -eq $Before[0].Hash) 'Previous renderer source not retained'
$Current=@{}
foreach($Relative in @("$Folder/inputs.json","h3-portal-finance-adjacent-20261002-$AdjacentRound/inputs.json")){
    foreach($Item in @(Read-Json $Relative)){
        $Path=[IO.Path]::GetFullPath((Join-Path $Root $Item.Path))
        Require ($Path.StartsWith($Root+'\',[StringComparison]::OrdinalIgnoreCase)) 'Input outside workspace'
        Require (-not $Current.ContainsKey($Path) -or $Current[$Path] -eq $Item.Hash) 'Input hashes conflict'
        $Current[$Path]=$Item.Hash
    }
}
foreach($Path in $Current.Keys){Require ((Get-FileHash -LiteralPath $Path).Hash -eq $Current[$Path]) 'Current input changed'}
$OriginalCount=0
$Inputs=@(Read-Json "$Folder/inputs.json")
foreach($Name in @('run-d3-salary-presentation.ps1','verify-d3-salary-presentation.mjs','run-d3-salary-presentation-allowance.mjs','d1-leave-runtime.mjs','D3SalaryPdfProbe.java')){
    $Input=@($Inputs|Where-Object {(Split-Path -Leaf $_.Path) -eq $Name})
    Require ($Input.Count -eq 1 -and (Get-FileHash (Join-Path $Evidence "$Folder/original-$Name")).Hash -eq $Input[0].Hash) 'Original script changed'
    $OriginalCount++
}
$Launch=Get-Content (Join-Path $Evidence "d3-salary-presentation-live-$LiveRound-launch.log") -Raw
Require ($Launch.Contains('D3_SALARY_PRESENTATION_RUN_EXIT=0') -and $Launch -match 'OWNED_CAPTCHA_RESTORED: original_limit=100; original_ttl=-1; counter_before=(\d+); counter_after=(\d+); counter_writes=0; database_unchanged=true; production_modified=false') 'Completion or captcha restoration missing'
$CaptchaBefore=[int]$Matches[1];$CaptchaAfter=[int]$Matches[2]
$Adjacent=Get-Content (Join-Path $Evidence "h3-portal-finance-adjacent-20261002-$AdjacentRound/summary.log") -Raw
Require ($Adjacent -match 'H3_FINANCE_ADJACENT: files=(\d+); changed=0; exit=0; production_modified=false') 'Related regression incomplete'
$AdjacentInputs=[int]$Matches[1]
foreach($Build in @('backend-r97','frontend-r58')){
    foreach($Item in @(Read-Json "h3-portal-finance-20261002-$Build-inputs.json")){
        Require ((Get-FileHash (Join-Path $Root $Item.Path)).Hash -eq $Item.Hash) 'Product differs from B97/F58'
    }
}
$State=Get-Content (Join-Path $Run 'state.json') -Raw|ConvertFrom-Json
Require ($State.status -eq 'RUNNING' -and [IO.Path]::GetFullPath($State.run) -eq $Run) 'Owned runtime required'
foreach($Entry in $State.processes){
    $Observed=Get-CimInstance Win32_Process -Filter "ProcessId=$($Entry.id)"
    Require ($Observed -and $Observed.CommandLine.Contains($Entry.marker)) 'Process ownership failed'
}
$Healthy=0
foreach($Service in $State.services){
    Require ((Invoke-RestMethod "http://127.0.0.1:$($Service.healthPort)/actuator/health" -TimeoutSec 5).status -eq 'UP') 'Service unhealthy'
    $Healthy++
}
$Summary=[pscustomobject]@{passed=$true;backend='r97';frontend='r58';checks=$Result.checks.Count;requests=$Result.requests;contentChecks=20;currentInputs=$Current.Count;adjacentInputs=$AdjacentInputs;originalScripts=$OriginalCount;processes=$State.processes.Count;healthyServices=$Healthy;captchaBefore=$CaptchaBefore;captchaAfter=$CaptchaAfter;originalFailureRetained=$true;salaryRowsPreserved=$true;productChanged=$true;all18Complete=$false;globalComplete=$false;remaining=@('D3 actual permission matrix and employee confirmation','D3 correction large amounts official tax policy and unified acceptance','D2 first ordinary request below500ms and all17','Global35PRD681')}
$Summary|ConvertTo-Json -Depth 5|Set-Content -LiteralPath $Report -Encoding utf8NoBOM
"D3_SALARY_PRESENTATION_STAGE: checks=$($Result.checks.Count); content=20; inputs=$($Current.Count); adjacent=$AdjacentInputs; originals=$OriginalCount; processes=$($State.processes.Count); healthy=$Healthy; global_complete=false"
