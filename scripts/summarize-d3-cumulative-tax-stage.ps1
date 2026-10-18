param([ValidatePattern('^r[1-9][0-9]*$')][string]$Round='r1',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$TaxRound='r4',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$AdjacentRound='r98')
$ErrorActionPreference='Stop'
. 'D:\CloudFlowPro\.cloudflow-runtime\use-data-drive.ps1'
$Root='D:\CloudFlowPro'
$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
$Run=Join-Path $Root '.cloudflow-runtime/batch-g-integration/9799534e1a3a47b5958330f14ae16dc7'
$Report=Join-Path $Evidence "d3-cumulative-tax-stage-20261006-$Round.json"
if(Test-Path -LiteralPath $Report){throw 'Retain previous D3 stage report'}
function Require([bool]$Condition,[string]$Message){if(-not $Condition){throw $Message}}
function Read-Json([string]$Relative){Get-Content -LiteralPath (Join-Path $Evidence $Relative) -Raw|ConvertFrom-Json}
$TaxFolder="d3-cumulative-tax-20261006-$TaxRound"
$Result=Read-Json "$TaxFolder/result.json"
foreach($Property in @('passed','cumulative','retry','yearReset','midHire','snapshot','taxTableReplacement','unverifiedDeduction','cancellation','preservation','restoration','secrets','syntheticPolicy')){
    Require ($Result.$Property -eq $true) "D3 scope incomplete: $Property"
}
Require (-not $Result.officialTaxPolicyVerified -and -not $Result.all18Complete -and -not $Result.globalComplete) 'D3 evidence boundary changed'
$Fixture=Read-Json "$TaxFolder/fixture.json"
Require ($Fixture.batches.Count -eq 7 -and $Fixture.tasks.Count -eq 8 -and $Fixture.slips.Count -eq 11) 'D3 real execution scope differs'
Require (@($Fixture.restorations.PSObject.Properties|Where-Object Value -NE $true).Count -eq 0) 'D3 original batch remains unsettled'
$Current=@{}
foreach($Relative in @("$TaxFolder/inputs.json","h3-portal-finance-adjacent-20261002-$AdjacentRound/inputs.json")){
    foreach($Item in @(Read-Json $Relative)){
        $Path=if([IO.Path]::IsPathRooted($Item.Path)){[IO.Path]::GetFullPath($Item.Path)}else{[IO.Path]::GetFullPath((Join-Path $Root $Item.Path))}
        Require (-not $Current.ContainsKey($Path) -or $Current[$Path] -eq $Item.Hash) 'D3 current inputs conflict'
        $Current[$Path]=$Item.Hash
    }
}
foreach($Path in $Current.Keys){Require ((Get-FileHash -LiteralPath $Path).Hash -eq $Current[$Path]) 'D3 stage input changed'}
$OriginalCount=0
foreach($Attempt in @('r1','r2','r3',$TaxRound)|Select-Object -Unique){
    $Folder="d3-cumulative-tax-20261006-$Attempt"
    $Inputs=@(Read-Json "$Folder/inputs.json")
    foreach($Name in @('verify-d3-cumulative-tax.mjs','run-d3-cumulative-tax.ps1','run-d3-cumulative-tax-allowance.mjs')){
        $Original=@($Inputs|Where-Object {$_.Path.Replace('\','/') -eq "scripts/$Name"})
        Require ($Original.Count -eq 1) 'Original D3 execution input missing'
        Require ((Get-FileHash -LiteralPath (Join-Path $Evidence "$Folder/original-$Name")).Hash -eq $Original[0].Hash) 'Original D3 script changed'
        $OriginalCount++
    }
    $Launch=Get-Content -LiteralPath (Join-Path $Evidence "d3-cumulative-tax-live-$Attempt-launch.log") -Raw
    Require ($Launch -match 'OWNED_CAPTCHA_RESTORED: original_limit=100; original_ttl=-1; counter_before=\d+; counter_after=\d+; counter_writes=0; database_unchanged=true; production_modified=false') 'D3 captcha restoration evidence missing'
}
$R1=Get-Content -LiteralPath (Join-Path $Evidence 'd3-cumulative-tax-20261006-r1/live.log') -Raw
Require ($R1.Contains('Owned form or explicitly selected fixture account required') -and -not (Test-Path (Join-Path $Evidence 'd3-cumulative-tax-20261006-r1/fixture.json'))) 'R1 initial failure boundary differs'
$R2=Read-Json 'd3-cumulative-tax-20261006-r2/result.json'
Require (-not $R2.passed -and $R2.preservation -and $R2.restoration -and $R2.secrets -and $R2.tasks -eq 4 -and $R2.failure.Contains('status_409_code_409')) 'R2 failure or recovery evidence differs'
$R3=Read-Json 'd3-cumulative-tax-20261006-r3/result.json'
Require (-not $R3.passed -and $R3.preservation -and $R3.restoration -and $R3.secrets -and $R3.tasks -eq 6 -and $R3.failure.Contains('status_409_code_409')) 'R3 product failure or recovery evidence differs'
$Originals=@(Read-Json 'd3-tax-detail-replacement-20261006-r1/original-inputs.json')
foreach($Item in $Originals){Require ((Get-FileHash -LiteralPath (Join-Path $Evidence ('d3-tax-detail-replacement-20261006-r1/original-source/'+$Item.Path))).Hash -eq $Item.Hash) 'Original D3 product source changed'}
$Changed=@()
foreach($Item in @(Read-Json 'h3-portal-finance-20261002-backend-r93-inputs.json')){
    if((Get-FileHash -LiteralPath (Join-Path $Root $Item.Path)).Hash -eq $Item.Hash){continue}
    Require (@($Originals|Where-Object {$_.Path.Replace('\','/') -eq $Item.Path.Replace('\','/') -and $_.Hash -eq $Item.Hash}).Count -eq 1) 'Unrecorded B93 product change'
    $Changed+=$Item.Path
}
Require ($Changed.Count -eq 2) 'Unexpected D3 product changes'
$OldPaths=@((Read-Json 'h3-portal-finance-20261002-backend-r93-inputs.json')|ForEach-Object {$_.Path.Replace('\','/')})
$Added=@((Read-Json 'h3-portal-finance-20261002-backend-r94-inputs.json')|Where-Object {$_.Path.Replace('\','/') -notin $OldPaths})
Require ($Added.Count -eq 1 -and $Added[0].Path.Replace('\','/') -eq 'cloudflow-backend/cloudflow-service-hr/src/main/resources/mapper/HrTaxSlabDetailMapper.xml') 'Unexpected new D3 product file'
$BuildLog=Get-Content -LiteralPath (Join-Path $Evidence 'h3-portal-finance-20261002-backend-r94.log') -Raw
Require ($BuildLog.Contains('BUILD SUCCESS') -and $BuildLog.Contains('FINANCE_BUILD: phase=Backend; files=3832; changed=0; exit=0')) 'D3 backend build incomplete'
$Adjacent=Get-Content -LiteralPath (Join-Path $Evidence "h3-portal-finance-adjacent-20261002-$AdjacentRound/summary.log") -Raw
Require ($Adjacent -match 'H3_FINANCE_ADJACENT: files=(\d+); changed=0; exit=0; production_modified=false') 'D3 adjacent checks incomplete'
$AdjacentCount=[int]$Matches[1]
$State=Get-Content -LiteralPath (Join-Path $Run 'state.json') -Raw|ConvertFrom-Json
Require ($State.status -eq 'RUNNING' -and [IO.Path]::GetFullPath($State.run) -eq $Run) 'Owned D3 runtime stopped'
$Reload=Get-Content -LiteralPath (Join-Path $Evidence 'd3-tax-detail-hr-reload-r94-launch.log') -Raw
Require ($Reload -match 'ISOLATED_RESTART_READY: service=hr; port=\d+; process=(\d+);') 'D3 HR reload incomplete'
$HrPid=[int]$Matches[1]
Require (@($State.processes|Where-Object {$_.name -eq 'hr' -and $_.id -eq $HrPid}).Count -eq 1) 'D3 loaded HR process changed'
foreach($Entry in $State.processes){
    $Observed=Get-CimInstance Win32_Process -Filter "ProcessId=$($Entry.id)"
    Require ($Observed -and $Observed.CommandLine.Contains($Entry.marker)) 'D3 process ownership differs'
}
$Healthy=0
foreach($Service in $State.services){
    Require ((Invoke-RestMethod -Uri "http://127.0.0.1:$($Service.healthPort)/actuator/health" -TimeoutSec 5).status -eq 'UP') 'D3 service unhealthy'
    $Healthy++
}
$Summary=[pscustomobject]@{passed=$true;backend='r94';frontend='r58';productChanged=$true;changedProduct=$Changed;newProduct='cloudflow-backend/cloudflow-service-hr/src/main/resources/mapper/HrTaxSlabDetailMapper.xml';taxRound=$TaxRound;checks=$Result.checks.Count;requests=$Result.requests;tasks=$Result.tasks;currentInputs=$Current.Count;adjacentInputs=$AdjacentCount;originalScripts=$OriginalCount;failedAttemptsPreserved=$true;originalCaptchaRestored=$true;processes=$State.processes.Count;healthyServices=$Healthy;syntheticPolicy=$true;officialTaxPolicyVerified=$false;d3All18Complete=$false;globalComplete=$false;remaining=@('D3 remaining current acceptance and500employee scale','D2 first-request below500ms and all17','Official applicable tax policy','Global35PRD681 unified regression')}
$Summary|ConvertTo-Json -Depth 5|Set-Content -LiteralPath $Report -Encoding utf8NoBOM
"D3_TAX_STAGE: checks=$($Result.checks.Count); requests=$($Result.requests); tasks=$($Result.tasks); inputs=$($Current.Count); adjacent=$AdjacentCount; originals=$OriginalCount; processes=$($State.processes.Count); healthy=$Healthy; global_complete=false"
