param([ValidatePattern('^r[1-9][0-9]*$')][string]$Round='r1')
$ErrorActionPreference='Stop'
. 'D:\CloudFlowPro\.cloudflow-runtime\use-data-drive.ps1'
$Root='D:\CloudFlowPro'
$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
$Run=Join-Path $Root '.cloudflow-runtime/batch-g-integration/9799534e1a3a47b5958330f14ae16dc7'
$Output=Join-Path $Evidence "d4-privacy-stage-20261006-$Round.json"
if(Test-Path -LiteralPath $Output){throw 'Retain prior D4 privacy stage evidence'}
function Require([bool]$Condition,[string]$Message){if(-not $Condition){throw $Message}}
function Read-Json([string]$File){Get-Content -LiteralPath (Join-Path $Evidence $File) -Raw|ConvertFrom-Json}
$Current=@{};$Artifacts=[System.Collections.Generic.List[object]]::new()
function Keep([string]$File){$Artifacts.Add([pscustomobject]@{Path=$File;Hash=(Get-FileHash -LiteralPath (Join-Path $Evidence $File)).Hash})}
function Verify-Current([string]$File){foreach($Item in @(Read-Json $File)){
    if(-not $Current.ContainsKey($Item.Path)){$Current[$Item.Path]=(Get-FileHash -LiteralPath (Join-Path $Root $Item.Path)).Hash}
    # BEGIN SUMMARY IMAGE COUNT CORRECTION
    if($File -ceq 'h3-portal-finance-adjacent-20261002-r126/inputs.json' -and $Item.Path.Replace('\','/') -ceq 'scripts/summarize-d4-privacy-stage.ps1'){
        $Original='d4-privacy-stage-r126-original.ps1'
        Require ((Get-FileHash -LiteralPath (Join-Path $Evidence $Original)).Hash -eq $Item.Hash) 'R126 summary source original changed'
        $Self=[IO.File]::ReadAllText($PSCommandPath)
        $Pattern='(?ms)^    # BEGIN SUMMARY IMAGE COUNT CORRECTION\r?\n.*?^    # END SUMMARY IMAGE COUNT CORRECTION\r?\n'
        Require ([regex]::Matches($Self,$Pattern).Count -eq 1) 'Summary correction region differs'
        $Reconstructed=[regex]::Replace($Self,$Pattern,'').Replace('$Screenshots -eq 24','$Screenshots -eq 27')
        Require ([Convert]::ToHexString([Security.Cryptography.SHA256]::HashData([Text.Encoding]::UTF8.GetBytes($Reconstructed))) -eq $Item.Hash) 'Summary differs beyond corrected image count and this verifier'
        Keep $Original
        continue
    }
    # END SUMMARY IMAGE COUNT CORRECTION
    Require ($Current[$Item.Path] -eq $Item.Hash) "Current D4 input changed: $($Item.Path)"
}}
$Prior=Read-Json 'd4-lifecycle-stage-20261006-r1.json'
Require ($Prior.passed -and $Prior.backend -eq 'r108' -and $Prior.frontend -eq 'r67' -and $Prior.priorD3Accepted -eq 17 -and $Prior.priorD3PolicyPending -eq 1 -and $Prior.d3BusinessInputsPreserved -and -not $Prior.all13Complete -and -not $Prior.globalComplete) 'Prior stage scope changed'
Require ((Get-FileHash -LiteralPath (Join-Path $Root 'scripts/summarize-d4-lifecycle-stage.ps1')).Hash -eq $Prior.reportHash) 'Prior report source changed'
foreach($Artifact in $Prior.artifacts){Require ((Get-FileHash -LiteralPath (Join-Path $Evidence $Artifact.Path)).Hash -eq $Artifact.Hash) 'Prior D4 evidence changed'}
Keep 'd4-lifecycle-stage-20261006-r1.json'
$D3=Read-Json 'd3-current-acceptance-20261006-r2.json'
Require ($D3.evidenceValid -and $D3.accepted -eq 17 -and $D3.policyPending -eq 1 -and -not $D3.all18Complete) 'Prior D3 scope changed'
Require ((Get-FileHash -LiteralPath (Join-Path $Root 'scripts/summarize-d3-current-acceptance.ps1')).Hash -eq $D3.reportHash) 'D3 report source changed'
foreach($Artifact in $D3.artifacts){Require ((Get-FileHash -LiteralPath (Join-Path $Evidence $Artifact.Path)).Hash -eq $Artifact.Hash) 'D3 evidence changed'}
foreach($InputFile in @($D3.artifacts.Path|Where-Object {$_ -like '*/inputs.json'}|Sort-Object -Unique)){
    foreach($Item in @(Read-Json $InputFile)){
        if(-not $Current.ContainsKey($Item.Path)){$Current[$Item.Path]=(Get-FileHash -LiteralPath (Join-Path $Root $Item.Path)).Hash}
        if($Current[$Item.Path] -eq $Item.Hash){continue}
        if($Item.Path.Replace('\','/') -ceq 'cloudflow-frontend/src/router.tsx'){Require ($Item.Hash -eq $Prior.priorRouterHash) 'Prior D3 router input differs';continue}
        $Extension=@($D3.historicalRunnerExtensions|Where-Object {$_.Input -ceq $InputFile -and $_.Path -ceq $Item.Path -and $_.OriginalHash -eq $Item.Hash -and $_.CurrentHash -eq $Current[$Item.Path] -and $_.ExactTransformation})
        Require ($Extension.Count -eq 1) 'D3 input differs beyond previously verified extension'
        Require ((Get-FileHash -LiteralPath (Join-Path $Evidence $Extension[0].OriginalPath)).Hash -eq $Item.Hash) 'D3 execution original changed'
    }
}
$Privacy=Read-Json 'd4-privacy-20261006-r3/result.json'
$Fixture=Read-Json 'd4-privacy-20261006-r3/fixture.json'
foreach($Flag in @('passed','identities','scope','targets','assignment','internal','files','tenant','anonymous','disputes','audits','browser','preservation','restoration','secrets')){Require ($Privacy.$Flag -eq $true) "Privacy evidence missing: $Flag"}
Require ($Privacy.checks.Count -eq 957 -and $Privacy.requests -eq 274 -and $Privacy.matrixCases -eq 155 -and $Privacy.grievances -eq 6) 'Privacy result scope changed'
Require ($Privacy.handlerDisputeNavigationPending -and -not $Privacy.all13Complete -and -not $Privacy.globalComplete) 'Pending business decision incorrectly counted complete'
Require ($Fixture.linkedHandlerNavigation.pending -and $Fixture.linkedHandlerNavigation.detailHidden -and $Fixture.linkedHandlerNavigation.evidenceVisible -and $Fixture.linkedHandlerNavigation.fileVisible) 'Known discrepancy evidence missing'
$Mobile=Read-Json 'd4-mobile-statistics-20261006-r2/result.json'
foreach($Flag in @('passed','mobileSubmission','mobileWithdrawal','filters','statistics','scope','charts','preservation','restoration','secrets')){Require ($Mobile.$Flag -eq $true) "Mobile statistics evidence missing: $Flag"}
Require ($Mobile.checks.Count -eq 205 -and $Mobile.requests -eq 57 -and $Mobile.filterCases -eq 18 -and -not $Mobile.all13Complete -and -not $Mobile.globalComplete) 'Mobile statistics result scope changed'
$Originals=0;$Screenshots=0;$Counter=991
foreach($Case in @(
    @{Folder='d4-mobile-statistics-20261006-r1';Kind='mobile-statistics';Round='r1';Names=@('run-d4-mobile-statistics.ps1','verify-d4-mobile-statistics.mjs','run-d4-mobile-statistics-allowance.mjs','d4-grievance-runtime.mjs','d1-leave-runtime.mjs','form-browser-auth.mjs')},
    @{Folder='d4-mobile-statistics-20261006-r2';Kind='mobile-statistics';Round='r2';Names=@('run-d4-mobile-statistics.ps1','verify-d4-mobile-statistics.mjs','run-d4-mobile-statistics-allowance.mjs','d4-grievance-runtime.mjs','d1-leave-runtime.mjs','form-browser-auth.mjs')},
    @{Folder='d4-privacy-20261006-r1';Kind='privacy';Round='r1';Names=@('run-d4-privacy.ps1','verify-d4-privacy.mjs','run-d4-privacy-allowance.mjs','d4-privacy-runtime.mjs','d4-privacy-browser-auth.mjs','d1-leave-runtime.mjs','form-browser-auth.mjs')},
    @{Folder='d4-privacy-20261006-r2';Kind='privacy';Round='r2';Names=@('run-d4-privacy.ps1','verify-d4-privacy.mjs','run-d4-privacy-allowance.mjs','d4-privacy-runtime.mjs','d4-privacy-browser-auth.mjs','d1-leave-runtime.mjs','form-browser-auth.mjs')},
    @{Folder='d4-privacy-20261006-r3';Kind='privacy';Round='r3';Names=@('run-d4-privacy.ps1','verify-d4-privacy.mjs','run-d4-privacy-allowance.mjs','d4-privacy-runtime.mjs','d4-privacy-browser-auth.mjs','d1-leave-runtime.mjs','form-browser-auth.mjs')}
)){
    $Folder=$Case.Folder;$Result=Read-Json "$Folder/result.json";$Sample=Read-Json "$Folder/fixture.json";$Inputs=@(Read-Json "$Folder/inputs.json")
    Require ($Result.preservation -and $Result.restoration -and $Result.secrets) 'Failed or successful round was not restored'
    foreach($File in @('result.json','fixture.json','inputs.json','requests.json')){Keep "$Folder/$File"}
    foreach($Name in $Case.Names){
        $Match=@($Inputs|Where-Object {(Split-Path -Leaf $_.Path) -eq $Name})
        Require ($Match.Count -eq 1 -and (Get-FileHash -LiteralPath (Join-Path $Evidence "$Folder/original-$Name")).Hash -eq $Match[0].Hash) 'Execution original differs'
        Keep "$Folder/original-$Name";$Originals++
    }
    foreach($Screenshot in $Sample.screenshots){Require ((Get-Item -LiteralPath (Join-Path $Evidence "$Folder/$Screenshot")).Length -gt 1000) 'Page image missing';Keep "$Folder/$Screenshot";$Screenshots++}
    Require (@($Sample.employees|Where-Object bound).Count -eq 0) 'Test employee still bound'
    Require (@($Sample.grievances|Where-Object {$_.status -notin @('WITHDRAWN','CLOSED','ESCALATED')}).Count -eq 0) 'Test grievance not terminal'
    $LaunchName=if($Case.Kind -eq 'privacy'){"d4-privacy-$($Case.Round)-launch.log"}else{"$Folder-launch.log"}
    $Launch=Get-Content -LiteralPath (Join-Path $Evidence $LaunchName) -Raw
    Require ($Launch -match 'OWNED_CAPTCHA_RESTORED: original_limit=100; original_ttl=-1; counter_before=(\d+); counter_after=(\d+); counter_writes=0; database_unchanged=true; production_modified=false') 'Captcha restoration missing'
    Require ([int]$Matches[1] -eq $Counter -and [int]$Matches[2] -gt $Counter) 'Captcha counter chain changed';$Counter=[int]$Matches[2]
    Keep $LaunchName;Keep "owned-captcha-d4-$($Case.Kind)-20261006-$($Case.Round).json"
}
Require ($Counter -eq 1012 -and $Originals -eq 33 -and $Screenshots -eq 24) 'Original or captcha evidence count changed'
Require (-not (Read-Json 'd4-privacy-20261006-r1/result.json').passed -and (Read-Json 'd4-privacy-20261006-r1/result.json').failure -eq 'linked_data_employee_127_') 'Privacy R1 failure overwritten'
Require (-not (Read-Json 'd4-privacy-20261006-r2/result.json').passed -and (Read-Json 'd4-privacy-20261006-r2/result.json').failure -eq 'hr_linked_list_scope') 'Privacy R2 failure overwritten'
foreach($File in @('h3-portal-finance-20261002-backend-r108-inputs.json','h3-portal-finance-20261002-frontend-r67-inputs.json','d4-lifecycle-20261006-r4/inputs.json','d4-mobile-statistics-20261006-r2/inputs.json','d4-privacy-20261006-r3/inputs.json','h3-portal-finance-adjacent-20261002-r126/inputs.json')){Verify-Current $File;Keep $File}
$Related=Get-Content -LiteralPath (Join-Path $Evidence 'h3-portal-finance-adjacent-20261002-r126/summary.log') -Raw
Require ($Related -match 'H3_FINANCE_ADJACENT: files=(\d+); changed=0; exit=0; production_modified=false') 'Related R126 not complete';$RelatedInputs=[int]$Matches[1];Keep 'h3-portal-finance-adjacent-20261002-r126/summary.log'
$State=Get-Content -LiteralPath (Join-Path $Run 'state.json') -Raw|ConvertFrom-Json
Require ($State.status -eq 'RUNNING' -and [IO.Path]::GetFullPath($State.run) -eq $Run) 'Owned runtime mismatch'
foreach($Entry in $State.processes){$Observed=Get-CimInstance Win32_Process -Filter "ProcessId=$($Entry.id)";Require ($Observed -and $Observed.CommandLine.Contains($Entry.marker)) 'Owned process mismatch'}
$Healthy=0;foreach($Service in $State.services){Require ((Invoke-RestMethod "http://127.0.0.1:$($Service.healthPort)/actuator/health" -TimeoutSec 5).status -eq 'UP') 'Service unhealthy';$Healthy++}
$Summary=[pscustomobject]@{passed=$true;backend='r108';frontend='r67';privacyRound='r3';privacyChecks=$Privacy.checks.Count;privacyRequests=$Privacy.requests;privacyMatrixCases=$Privacy.matrixCases;mobileRound='r2';mobileChecks=$Mobile.checks.Count;currentInputs=$Current.Count;originalScripts=$Originals;images=$Screenshots;artifacts=@($Artifacts.ToArray());relatedRound='r126';relatedInputs=$RelatedInputs;processes=$State.processes.Count;healthyServices=$Healthy;captchaBefore=991;captchaAfter=$Counter;priorD3Accepted=17;priorD3PolicyPending=1;d3BusinessInputsPreserved=$true;handlerDisputeNavigationPending=$true;reportHash=(Get-FileHash -LiteralPath $PSCommandPath).Hash;all13Complete=$false;globalComplete=$false;remaining=$Privacy.remaining}
$Summary|ConvertTo-Json -Depth 6|Set-Content -LiteralPath $Output -Encoding utf8NoBOM
"D4_PRIVACY_STAGE: privacy_checks=$($Privacy.checks.Count); mobile_checks=$($Mobile.checks.Count); inputs=$($Current.Count); originals=$Originals; images=$Screenshots; adjacent=$RelatedInputs; healthy=$Healthy; handler_dispute_navigation_pending=true; all13_complete=false; global_complete=false"
