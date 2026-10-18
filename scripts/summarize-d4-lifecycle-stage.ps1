param([ValidatePattern('^r[1-9][0-9]*$')][string]$Round='r1')
$ErrorActionPreference='Stop'
. 'D:\CloudFlowPro\.cloudflow-runtime\use-data-drive.ps1'
$Root='D:\CloudFlowPro'
$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
$Run=Join-Path $Root '.cloudflow-runtime/batch-g-integration/9799534e1a3a47b5958330f14ae16dc7'
$Output=Join-Path $Evidence "d4-lifecycle-stage-20261006-$Round.json"
if(Test-Path -LiteralPath $Output){throw 'Retain previous lifecycle stage evidence'}
function Require([bool]$Condition,[string]$Message){if(-not $Condition){throw $Message}}
function Read-Json([string]$File){Get-Content -LiteralPath (Join-Path $Evidence $File) -Raw|ConvertFrom-Json}
$Current=@{};$Artifacts=[System.Collections.Generic.List[object]]::new()
function Keep-Artifact([string]$File){$Artifacts.Add([pscustomobject]@{Path=$File;Hash=(Get-FileHash -LiteralPath (Join-Path $Evidence $File)).Hash})}
function Verify-Current([string]$File){foreach($Item in @(Read-Json $File)){
    if(-not $Current.ContainsKey($Item.Path)){$Current[$Item.Path]=(Get-FileHash -LiteralPath (Join-Path $Root $Item.Path)).Hash}
    Require ($Current[$Item.Path] -eq $Item.Hash) "Current lifecycle input changed: $($Item.Path)"
}}
$Folder='d4-lifecycle-20261006-r4';$Result=Read-Json "$Folder/result.json";$Fixture=Read-Json "$Folder/fixture.json"
foreach($Flag in @('passed','submission','transitions','records','confirmation','targets','privacy','escalation','notifications','audits','browser','preservation','restoration','secrets')){Require ($Result.$Flag -eq $true) "Missing lifecycle evidence: $Flag"}
Require ($Result.checks.Count -eq 180 -and $Result.requests -eq 60 -and $Result.grievances -eq 6 -and -not $Result.all13Complete -and -not $Result.globalComplete) 'Lifecycle scope differs'
Require ($Fixture.recovery.source -eq 'd4-lifecycle-20261006-r2' -and $Fixture.recovery.grievanceId -eq '112' -and $Fixture.recovery.withdrawn) 'Prior failed-run recovery missing'
Require (@($Fixture.grievances|Where-Object status -eq 'CLOSED').Count -eq 2 -and @($Fixture.grievances|Where-Object status -eq 'WITHDRAWN').Count -eq 2 -and @($Fixture.grievances|Where-Object status -eq 'ESCALATED').Count -eq 2) 'Owned grievances not terminal'
foreach($File in @("$Folder/result.json","$Folder/fixture.json","$Folder/inputs.json","$Folder/requests.json")){Keep-Artifact $File}
Require ($Fixture.screenshots.Count -eq 6) 'Current page evidence incomplete'
foreach($Screenshot in $Fixture.screenshots){Require ((Get-Item -LiteralPath (Join-Path $Evidence "$Folder/$Screenshot")).Length -gt 1000) 'Missing page image';Keep-Artifact "$Folder/$Screenshot"}
$Originals=0
foreach($Source in @('d4-lifecycle-20261006-r1','d4-lifecycle-20261006-r2','d4-lifecycle-20261006-r3',$Folder)){
    $Inputs=@(Read-Json "$Source/inputs.json")
    foreach($Name in @('run-d4-lifecycle.ps1','verify-d4-lifecycle.mjs','run-d4-lifecycle-allowance.mjs','d1-leave-runtime.mjs','form-browser-auth.mjs')){
        $Original=@($Inputs|Where-Object {(Split-Path -Leaf $_.Path) -eq $Name})
        Require ($Original.Count -eq 1 -and (Get-FileHash -LiteralPath (Join-Path $Evidence "$Source/original-$Name")).Hash -eq $Original[0].Hash) 'Executed original differs'
        Keep-Artifact "$Source/original-$Name";$Originals++
    }
    $SourceResult=Read-Json "$Source/result.json";Require ($SourceResult.preservation -and $SourceResult.secrets) 'Prior business or secret-scan evidence missing'
    if($Source -ne $Folder){Require (-not $SourceResult.passed) 'Failed-round boundary changed';Keep-Artifact "$Source/result.json";Keep-Artifact "$Source/fixture.json"}
}
foreach($File in @("$Folder/inputs.json",'h3-portal-finance-20261002-backend-r108-inputs.json','h3-portal-finance-20261002-frontend-r67-inputs.json','h3-portal-finance-adjacent-20261002-r125/inputs.json')){Verify-Current $File}
$Router='cloudflow-frontend/src/router.tsx'
$BeforeInputs=@(Read-Json 'h3-portal-finance-20261002-frontend-r66-inputs.json')
$BeforeRouter=@($BeforeInputs|Where-Object {$_.Path.Replace('\','/') -ceq $Router});Require ($BeforeRouter.Count -eq 1) 'Prior router input missing'
$Text=[IO.File]::ReadAllText((Join-Path $Root $Router))
$Pattern="          \{\r?\n            path: '/hr/ess/grievances',\r?\n            element: guarded\(<DynamicMenuRoute />, \['hr:grievance:mine:list'\]\),\r?\n          \},\r?\n          \{\r?\n            path: '/hr/grievances',\r?\n            element: guarded\(<DynamicMenuRoute />, \['hr:grievance:manage:list'\]\),\r?\n          \},\r?\n"
Require ([regex]::Matches($Text,$Pattern).Count -eq 1) 'Expected exactly two mobile route additions'
$Reconstructed=[Text.Encoding]::UTF8.GetBytes([regex]::Replace($Text,$Pattern,''))
$PriorRouterHash=[Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($Reconstructed))
Require ($PriorRouterHash -eq $BeforeRouter[0].Hash) 'Router differs beyond the two guarded mobile routes'
foreach($Item in $BeforeInputs){if($Item.Path.Replace('\','/') -ceq $Router){continue};Require ((Get-FileHash -LiteralPath (Join-Path $Root $Item.Path)).Hash -eq $Item.Hash) 'Other frontend input changed'}
$D3=Read-Json 'd3-current-acceptance-20261006-r2.json'
Require ($D3.evidenceValid -and $D3.accepted -eq 17 -and $D3.policyPending -eq 1 -and $D3.functionalCoverage -eq 18 -and -not $D3.all18Complete) 'Prior D3 acceptance evidence differs'
Require ((Get-FileHash -LiteralPath (Join-Path $Root 'scripts/summarize-d3-current-acceptance.ps1')).Hash -eq $D3.reportHash) 'Prior D3 report changed'
foreach($Artifact in $D3.artifacts){Require ((Get-FileHash -LiteralPath (Join-Path $Evidence $Artifact.Path)).Hash -eq $Artifact.Hash) 'D3 original evidence changed'}
foreach($InputFile in @($D3.artifacts.Path|Where-Object {$_ -like '*/inputs.json'}|Sort-Object -Unique)){
    foreach($Item in @(Read-Json $InputFile)){
        if(-not $Current.ContainsKey($Item.Path)){$Current[$Item.Path]=(Get-FileHash -LiteralPath (Join-Path $Root $Item.Path)).Hash}
        if($Current[$Item.Path] -eq $Item.Hash){continue}
        if($Item.Path.Replace('\','/') -ceq $Router){Require ($Item.Hash -eq $PriorRouterHash) 'D3 router source differs';continue}
        $Extension=@($D3.historicalRunnerExtensions|Where-Object {$_.Input -ceq $InputFile -and $_.Path -ceq $Item.Path -and $_.OriginalHash -eq $Item.Hash -and $_.CurrentHash -eq $Current[$Item.Path] -and $_.ExactTransformation})
        Require ($Extension.Count -eq 1) 'D3 execution input changed beyond previously verified extensions'
        Require ((Get-FileHash -LiteralPath (Join-Path $Evidence $Extension[0].OriginalPath)).Hash -eq $Item.Hash) 'D3 runner original changed'
    }
}
Keep-Artifact 'd3-current-acceptance-20261006-r2.json'
$Launch=Get-Content -LiteralPath (Join-Path $Evidence "$Folder-launch.log") -Raw
Require ($Launch.Contains('D4_LIFECYCLE_RUN_EXIT=0') -and $Launch -match 'OWNED_CAPTCHA_RESTORED: original_limit=100; original_ttl=-1; counter_before=(\d+); counter_after=(\d+); counter_writes=0; database_unchanged=true; production_modified=false') 'Original terminal or captcha restoration missing'
$CaptchaBefore=[int]$Matches[1];$CaptchaAfter=[int]$Matches[2]
$Related=Get-Content -LiteralPath (Join-Path $Evidence 'h3-portal-finance-adjacent-20261002-r125/summary.log') -Raw
Require ($Related -match 'H3_FINANCE_ADJACENT: files=(\d+); changed=0; exit=0; production_modified=false') 'Related regression missing'
$RelatedCount=[int]$Matches[1]
$State=Get-Content -LiteralPath (Join-Path $Run 'state.json') -Raw|ConvertFrom-Json
Require ($State.status -eq 'RUNNING' -and [IO.Path]::GetFullPath($State.run) -eq $Run) 'Owned runtime required'
foreach($Entry in $State.processes){$Observed=Get-CimInstance Win32_Process -Filter "ProcessId=$($Entry.id)";Require ($Observed -and $Observed.CommandLine.Contains($Entry.marker)) 'Owned process mismatch'}
$Healthy=0;foreach($Service in $State.services){Require ((Invoke-RestMethod "http://127.0.0.1:$($Service.healthPort)/actuator/health" -TimeoutSec 5).status -eq 'UP') 'Service unhealthy';$Healthy++}
$Summary=[pscustomobject]@{passed=$true;backend='r108';frontend='r67';lifecycleRound='r4';checks=$Result.checks.Count;requests=$Result.requests;currentInputs=$Current.Count;originalScripts=$Originals;artifacts=@($Artifacts.ToArray());relatedRound='r125';relatedInputs=$RelatedCount;processes=$State.processes.Count;healthyServices=$Healthy;captchaBefore=$CaptchaBefore;captchaAfter=$CaptchaAfter;mobileRouteAdditions=2;priorRouterHash=$PriorRouterHash;priorD3Accepted=17;priorD3PolicyPending=1;d3BusinessInputsPreserved=$true;reportHash=(Get-FileHash -LiteralPath $PSCommandPath).Hash;all13Complete=$false;globalComplete=$false;remaining=$Result.remaining}
$Summary|ConvertTo-Json -Depth 6|Set-Content -LiteralPath $Output -Encoding utf8NoBOM
"D4_LIFECYCLE_STAGE: checks=$($Result.checks.Count); inputs=$($Current.Count); originals=$Originals; adjacent=$RelatedCount; healthy=$Healthy; d3_business_inputs_preserved=true; all13_complete=false; global_complete=false"
