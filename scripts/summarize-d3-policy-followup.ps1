param([ValidatePattern('^r[1-9][0-9]*$')][string]$Round='r1')
$ErrorActionPreference='Stop'
. 'D:\CloudFlowPro\.cloudflow-runtime/use-data-drive.ps1'
$Root='D:\CloudFlowPro'
$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
$Output=Join-Path $Evidence "d3-policy-followup-20261006-$Round.json"
if(Test-Path -LiteralPath $Output){throw 'Retain original follow-up report'}
$Current=@{};$Artifacts=@();$OriginalCount=0
function Require([bool]$Value,[string]$Message){if(-not $Value){throw $Message}}
function Read-Json([string]$File){Get-Content -LiteralPath (Join-Path $Evidence $File) -Raw|ConvertFrom-Json}
function Keep([string]$File){$script:Artifacts+=[pscustomobject]@{Path=$File;Hash=(Get-FileHash -LiteralPath (Join-Path $Evidence $File)).Hash}}
$Page='cloudflow-frontend/src/pages/hr/rules/HrPayrollPage.tsx'
$Original='d3-official-banner-original-20261006-r1.tsx'
$OldText='2026 年正式税率表须由财务提供；未核定并启用完整 7 档税率前，算薪会明确拦截。本期累计税额为负时按 0 处理。'
$NewText='2026 年居民普通工资税表已配置完整 7 档税率，每月减除费用为 5000 元，须由管理员或财务启用后参与算薪。本期累计税额为负时按 0 处理。'
$OriginalPage=[IO.File]::ReadAllText((Join-Path $Evidence $Original))
Require ($OriginalPage.Contains($OldText) -and $OriginalPage.Replace($OldText,$NewText) -ceq [IO.File]::ReadAllText((Join-Path $Root $Page))) 'Change exceeds the reviewed banner text'
$OriginalHash=(Get-FileHash -LiteralPath (Join-Path $Evidence $Original)).Hash
function Verify-Inputs([string]$File){
    foreach($Input in @(Read-Json $File)){
        $Path=if([IO.Path]::IsPathRooted($Input.Path)){$Input.Path}else{Join-Path $Root $Input.Path}
        if(-not $Current.ContainsKey($Path)){$Current[$Path]=(Get-FileHash -LiteralPath $Path).Hash}
        if($Current[$Path] -ne $Input.Hash){Require ($Input.Path.Replace('\','/') -eq $Page -and $Input.Hash -eq $OriginalHash) 'Execution input changed beyond reviewed banner'}
    }
    Keep $File
}
$Prior=Read-Json 'd3-official-tax-stage-20261006-r1.json'
Require ($Prior.passed -and $Prior.officialTaxPolicyVerified -and $Prior.backend -eq 'r113' -and $Prior.frontend -eq 'r71') 'Approved tax stage incomplete'
foreach($Artifact in $Prior.artifacts){Require ((Get-FileHash -LiteralPath (Join-Path $Evidence $Artifact.Path)).Hash -eq $Artifact.Hash) 'Original tax evidence changed'}
Require ((Get-FileHash -LiteralPath (Join-Path $Root 'scripts/summarize-d3-official-tax-stage.ps1')).Hash -eq $Prior.reportHash) 'Original stage source changed'
foreach($File in @('h3-portal-finance-20261002-backend-r113-inputs.json','h3-portal-finance-20261002-frontend-r72-inputs.json','h3-portal-finance-adjacent-20261002-r131/inputs.json','d3-official-tax-20261006-r3/inputs.json')){Verify-Inputs $File}
$Phases=@()
foreach($Definition in @(@{Folder='d3-cumulative-tax-20261006-r6';Launch='d3-cumulative-current-r6-launch.log';Terminal='D3_TAX_RUN_EXIT=0';Checks=887;Requests=136;Tasks=8;Before=1085;After=1088;Flags=@('cumulative','retry','yearReset','midHire','snapshot','taxTableReplacement','unverifiedDeduction','cancellation')},
    @{Folder='d3-batch-scale-20261006-r5';Launch='d3-scale-current-r5-launch.log';Terminal='D3_SCALE_RUN_EXIT=0';Checks=2720;Requests=2123;Tasks=1;Before=1088;After=1091;Flags=@('selection','selectionPage','scale','progressPage','cancellation','performanceMet')})){
    $Folder=$Definition.Folder;$Result=Read-Json "$Folder/result.json";$Fixture=Read-Json "$Folder/fixture.json"
    foreach($Flag in @('passed','preservation','restoration','secrets')+$Definition.Flags){Require ($Result.$Flag -eq $true) "Follow-up evidence missing: $Flag"}
    Require ($Result.checks.Count -eq $Definition.Checks -and $Result.requests -eq $Definition.Requests -and $Result.tasks -eq $Definition.Tasks) 'Follow-up execution counts differ'
    Require (-not $Result.officialTaxPolicyVerified -and -not $Result.all18Complete -and -not $Result.globalComplete -and $Result.syntheticPolicy) 'Original synthetic scope changed'
    foreach($Property in $Fixture.restorations.PSObject.Properties){Require ($Property.Value -eq $true) 'Original fixture not restored'}
    Verify-Inputs "$Folder/inputs.json";$Inputs=@(Read-Json "$Folder/inputs.json")
    $Originals=@(Get-ChildItem -LiteralPath (Join-Path $Evidence $Folder) -Filter 'original-*' -File)
    Require ($Originals.Count -eq 3) 'Execution original count differs'
    foreach($Source in $Originals){$Matched=@($Inputs|Where-Object {(Split-Path -Leaf $_.Path) -ceq $Source.Name.Substring(9)});Require ($Matched.Count -eq 1 -and $Matched[0].Hash -eq (Get-FileHash -LiteralPath $Source.FullName).Hash) 'Execution original hash differs';$OriginalCount++}
    $Launch=Get-Content -LiteralPath (Join-Path $Evidence $Definition.Launch) -Raw
    Require ($Launch.Contains($Definition.Terminal) -and $Launch.Contains("OWNED_CAPTCHA_RESTORED: original_limit=100; original_ttl=-1; counter_before=$($Definition.Before); counter_after=$($Definition.After); counter_writes=0; database_unchanged=true; production_modified=false")) 'Original terminal or restoration missing'
    foreach($File in @(Get-ChildItem -LiteralPath (Join-Path $Evidence $Folder) -File)){Keep "$Folder/$($File.Name)"};Keep $Definition.Launch
    $Phases+=[pscustomobject]@{folder=$Folder;checks=$Result.checks.Count;requests=$Result.requests;tasks=$Result.tasks;inputs=$Inputs.Count;originals=$Originals.Count;backend='r113';executedFrontend='r71'}
}
$Scale=Read-Json 'd3-batch-scale-20261006-r5/fixture.json'
Require ($Scale.tasks.Count -eq 1 -and $Scale.tasks[0].terminal -eq 'SUCCESS' -and $Scale.tasks[0].affectedRows -eq 500 -and $Scale.tasks[0].elapsedMilliseconds -lt 180000 -and $Scale.slipIds.Count -eq 500) '500-person performance or amount coverage failed'
$Ui=Read-Json 'd3-policy-followup-ui-review-20261006-r1.json'
Require ($Ui.reviewed -and $Ui.images.Count -eq 3 -and $Ui.staleBannerObserved) 'Image review or discovered banner issue missing'
foreach($Image in $Ui.images){Require ((Get-FileHash -LiteralPath (Join-Path $Evidence "d3-batch-scale-20261006-r5/$($Image.file)")).Hash -eq $Image.hash) 'Reviewed scale image changed'}
$Build=Get-Content -LiteralPath (Join-Path $Evidence 'd3-official-banner-frontend-r72-launch.log') -Raw
Require ($Build.Contains('FINANCE_BUILD: phase=Frontend; files=1480; changed=0; exit=0')) 'Banner build incomplete'
$Run=Join-Path $Root '.cloudflow-runtime/batch-g-integration/9799534e1a3a47b5958330f14ae16dc7'
$State=Get-Content -LiteralPath (Join-Path $Run 'state.json') -Raw|ConvertFrom-Json
Require ($State.status -eq 'RUNNING' -and [IO.Path]::GetFullPath($State.run) -eq $Run -and $State.processes.Count -eq 9 -and $State.services.Count -eq 6) 'Owned runtime scope differs'
foreach($Entry in $State.processes){$Observed=Get-CimInstance Win32_Process -Filter "ProcessId=$($Entry.id)";Require ($Observed -and $Observed.CommandLine.Contains($Entry.marker)) 'Owned process mismatch'}
foreach($Runtime in $Prior.runtime){
    Require (($State.processes|Where-Object name -eq $Runtime.name).id -eq $Runtime.pid -and (Get-FileHash -LiteralPath $Runtime.artifact).Hash -eq $Runtime.hash) 'Running artifact changed'
    $Service=$State.services|Where-Object name -eq $Runtime.name
    Require ((Invoke-RestMethod "http://127.0.0.1:$($Service.healthPort)/actuator/health" -TimeoutSec 5).status -eq 'UP') 'Service unhealthy'
}
foreach($File in @($Original,'d3-official-tax-stage-20261006-r1.json','d3-policy-followup-ui-review-20261006-r1.json','d3-official-banner-frontend-r72-launch.log')){Keep $File}
[pscustomobject]@{passed=$true;backend='r113';frontend='r72';phases=$Phases;currentInputs=$Current.Count;originalScripts=$OriginalCount;artifacts=$Artifacts;runtime=$Prior.runtime;relatedRound='r131';relatedInputCount=$Prior.relatedInputs;reportAddedAfterRelatedRound=$true;reportHash=(Get-FileHash -LiteralPath $PSCommandPath).Hash;bannerOnlyChange=[pscustomobject]@{path=$Page;original=$Original;originalHash=$OriginalHash;currentHash=(Get-FileHash -LiteralPath (Join-Path $Root $Page)).Hash;exactReplacement=$true};scaleMilliseconds=$Scale.tasks[0].elapsedMilliseconds;reviewedImages=3;captchaBefore=1085;captchaAfter=1091;healthyServices=6;officialTaxPolicyVerified=$true;all18Complete=$false;globalComplete=$false}|ConvertTo-Json -Depth 7|Set-Content -LiteralPath $Output -Encoding utf8NoBOM
"D3_POLICY_FOLLOWUP: checks=887/2720; scale_ms=$($Scale.tasks[0].elapsedMilliseconds); inputs=$($Current.Count); originals=$OriginalCount; healthy=6; frontend=r72; all18_complete=false; global_complete=false"
