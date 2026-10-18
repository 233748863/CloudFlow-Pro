param([ValidatePattern('^r[1-9][0-9]*$')][string]$Round='r1',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$AdjacentRound='r131')
$ErrorActionPreference='Stop'
. 'D:\CloudFlowPro\.cloudflow-runtime/use-data-drive.ps1'
$Root='D:\CloudFlowPro'
$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
$Run=Join-Path $Root '.cloudflow-runtime/batch-g-integration/9799534e1a3a47b5958330f14ae16dc7'
$Folder='d3-official-tax-20261006-r3'
$Output=Join-Path $Evidence "d3-official-tax-stage-20261006-$Round.json"
if(Test-Path -LiteralPath $Output){throw 'Retain original official tax stage report'}
$ReportHash=(Get-FileHash -LiteralPath $PSCommandPath).Hash
$Current=@{};$Artifacts=[Collections.Generic.List[object]]::new()
function Require([bool]$Condition,[string]$Message){if(-not $Condition){throw $Message}}
function Read-Json([string]$File){Get-Content -LiteralPath (Join-Path $Evidence $File) -Raw|ConvertFrom-Json}
function Keep([string]$File){
    $Path=Join-Path $Evidence $File
    $Before=Get-Item -LiteralPath $Path
    $Length=$Before.Length;$Written=$Before.LastWriteTimeUtc
    $Stream=[IO.File]::Open($Path,[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::ReadWrite)
    try{$Hasher=[Security.Cryptography.SHA256]::Create();try{$Hash=[Convert]::ToHexString($Hasher.ComputeHash($Stream))}finally{$Hasher.Dispose()}}finally{$Stream.Dispose()}
    $After=Get-Item -LiteralPath $Path
    Require ($Length -gt 0 -and $Length -eq $After.Length -and $Written -eq $After.LastWriteTimeUtc) 'Evidence empty or changed during read'
    $Artifacts.Add([pscustomobject]@{Path=$File;Hash=$Hash})
}
function Verify-Inputs([string]$File){
    foreach($Item in @(Read-Json $File)){
        $Path=if([IO.Path]::IsPathRooted($Item.Path)){$Item.Path}else{Join-Path $Root $Item.Path}
        if(-not $Current.ContainsKey($Path)){$Current[$Path]=(Get-FileHash -LiteralPath $Path).Hash}
        Require ($Current[$Path] -eq $Item.Hash) "Executed input changed: $($Item.Path)"
    }
    Keep $File
}
foreach($File in @('h3-portal-finance-20261002-backend-r113-inputs.json','h3-portal-finance-20261002-frontend-r71-inputs.json',
    "$Folder/inputs.json",'backend-executable-verification-20261006-r4/inputs.json',
    'isolated-executable-deployment-20261006-r3/inputs.json',"h3-portal-finance-adjacent-20261002-$AdjacentRound/inputs.json")){Verify-Inputs $File}
$Result=Read-Json "$Folder/result.json";$Fixture=Read-Json "$Folder/fixture.json"
foreach($Flag in @('passed','boundaries','rounding','threshold','cumulative','zeroIncome','yearReset','activation','snapshots','browser','preservation','restoration','secrets','officialTaxPolicyVerified')){
    Require ($Result.$Flag -eq $true) "Official tax evidence missing: $Flag"
}
Require ($Result.checks.Count -eq 513 -and $Result.findings.Count -eq 1314 -and $Result.requests -eq 193) 'Official tax execution count differs'
Require ($Result.tasks -eq 5 -and $Result.cases -eq 25 -and $Result.slips -eq 29) 'Official tax sample scope differs'
Require ($Result.officialPolicyYear -eq 2026 -and -not $Result.all18Complete -and -not $Result.globalComplete) 'Official policy or completion scope changed'
Require (@($Result.findings|Where-Object passed -ne $true).Count -eq 0) 'Amount observation failed'
foreach($Property in $Fixture.restorations.PSObject.Properties){Require ($Property.Value -eq $true) 'Fixture restoration missing'}
Require ($Fixture.tasks.Count -eq 5 -and @($Fixture.tasks|Where-Object terminal -ne 'SUCCESS').Count -eq 0) 'Original background tasks incomplete'
Require (@($Fixture.originalBusiness.PSObject.Properties).Count -eq 13) 'Original business preservation scope differs'
$Main=@($Fixture.slips|Where-Object name -eq 'main'|Sort-Object month)
Require ($Main.Count -eq 5 -and ($Main.wanted.tax -join ',') -eq '540.00,540.00,1800.00,0.00,540.00') 'Approved monthly tax example differs'
Require ($Main[3].wanted.payable -eq '2380.00' -and $Main[3].wanted.paid -eq '2880.00' -and $Main[4].wanted.paid -eq '0.00') 'Zero income or cross-year reset differs'
$Inputs=@(Read-Json "$Folder/inputs.json")
$Originals=@(Get-ChildItem -LiteralPath (Join-Path $Evidence $Folder) -Filter 'original-*' -File)
Require ($Originals.Count -eq 5) 'Original execution script count differs'
foreach($Original in $Originals){
    $Name=$Original.Name.Substring('original-'.Length)
    $Input=@($Inputs|Where-Object {(Split-Path -Leaf $_.Path) -ceq $Name})
    Require ($Input.Count -eq 1 -and (Get-FileHash -LiteralPath $Original.FullName).Hash -eq $Input[0].Hash) 'Original execution script changed'
}
$LaunchFile='d3-official-tax-r3-launch.log';$Launch=Get-Content -LiteralPath (Join-Path $Evidence $LaunchFile) -Raw
Require ($Launch.Contains('D3_OFFICIAL_TAX_RUN_EXIT=0') -and $Launch.Contains('D3_OFFICIAL_TAX_INPUTS: files=5354; changed=0; exit=0')) 'Original official tax terminal missing'
Require ($Launch.Contains('OWNED_CAPTCHA_RESTORED: original_limit=100; original_ttl=-1; counter_before=1081; counter_after=1085; counter_writes=0; database_unchanged=true; production_modified=false')) 'Original captcha restoration missing'
$Ui=Read-Json 'd3-official-tax-ui-review-20261006-r1.json'
Require ($Ui.reviewed -and $Ui.images.Count -eq 3 -and $Ui.sourceRound -eq 'r3') 'Actual image review missing'
foreach($Picture in $Ui.images){Require ((Get-FileHash -LiteralPath (Join-Path $Evidence "$Folder/$($Picture.file)")).Hash -eq $Picture.hash) 'Reviewed picture changed'}
foreach($File in @(Get-ChildItem -LiteralPath (Join-Path $Evidence $Folder) -File)){Keep "$Folder/$($File.Name)"}
foreach($File in @($LaunchFile,'d3-official-tax-ui-review-20261006-r1.json',
    'd3-profile-backend-build-r113-launch.log','d3-official-frontend-build-r71-launch.log',
    'backend-executable-verification-20261006-r4/result.json',
    'isolated-executable-deployment-20261006-r2/result.json','isolated-executable-deployment-20261006-r3/result.json')){Keep $File}
foreach($Build in @(@{File='d3-profile-backend-build-r113-launch.log';Phase='Backend';Count=3837},@{File='d3-official-frontend-build-r71-launch.log';Phase='Frontend';Count=1480})){
    Require ((Get-Content -LiteralPath (Join-Path $Evidence $Build.File) -Raw).Contains("FINANCE_BUILD: phase=$($Build.Phase); files=$($Build.Count); changed=0; exit=0")) 'Original successful build terminal missing'
}
$Packages=Read-Json 'backend-executable-verification-20261006-r4/result.json'
Require ($Packages.Passed -and $Packages.BackendRound -eq 'r113' -and $Packages.InputChanges -eq 0 -and $Packages.Services.Count -eq 6 -and $Packages.CommonLibraries.Count -eq 21) 'Executable package verification incomplete'
foreach($Package in @($Packages.Services)+@($Packages.CommonLibraries)){Require ((Get-FileHash -LiteralPath (Join-Path $Root $Package.Path)).Hash -eq $Package.Hash) 'Verified compiled artifact changed'}
Require (@($Packages.Services|Where-Object LayerListExit -ne 0).Count -eq 0 -and ($Packages.Services|Where-Object Name -eq 'hr').Extracted) 'Executable layer or extraction evidence missing'
Require (@($Packages.CommonLibraries|Where-Object OrdinaryJar -ne $true).Count -eq 0) 'Common module packaging changed'
$PriorInputs=@(Read-Json 'h3-portal-finance-20261002-backend-r112-inputs.json')
$Changed=@($PriorInputs|Where-Object {(Get-FileHash -LiteralPath (Join-Path $Root $_.Path)).Hash -ne $_.Hash})
Require ($Changed.Count -eq 1 -and $Changed[0].Path.Replace('\','/') -eq 'cloudflow-backend/cloudflow-service-hr/src/main/java/com/cloudflow/hr/service/HrPayrollConfigurationService.java') 'Non-HR source changed since deployed B112'
Keep 'h3-portal-finance-20261002-backend-r112-inputs.json'
$RelatedFolder="h3-portal-finance-adjacent-20261002-$AdjacentRound"
$Related=Get-Content -LiteralPath (Join-Path $Evidence "$RelatedFolder/summary.log") -Raw
$RelatedInputs=@(Read-Json "$RelatedFolder/inputs.json")
Require ($Related -match 'H3_FINANCE_ADJACENT: files=(\d+); changed=0; exit=0; production_modified=false') 'Related regression incomplete'
Require ([int]$Matches[1] -eq $RelatedInputs.Count) 'Related input count differs'
Require (@($RelatedInputs|Where-Object {(Split-Path -Leaf $_.Path) -eq (Split-Path -Leaf $PSCommandPath) -and $_.Hash -eq $ReportHash}).Count -eq 1) 'Stage report not included in regression'
$Database=Get-Content -LiteralPath (Join-Path $Evidence "$RelatedFolder/oa-database.log") -Raw
foreach($Text in @('Approved resident wage tax seed remains a 2026 draft','Approved tax seed has exactly seven brackets')+@(1..7|ForEach-Object {"Official resident tax bracket $_"})){
    Require ([regex]::Matches($Database,[regex]::Escape($Text)).Count -eq 2) 'Official seed was not verified both before and after demo import'
}
Require ($Database.Contains('PASS: isolated 01-07 OA database acceptance')) 'Formal initialization did not complete'
Keep "$RelatedFolder/summary.log";Keep "$RelatedFolder/oa-database.log"
$State=Get-Content -LiteralPath (Join-Path $Run 'state.json') -Raw|ConvertFrom-Json
Require ($State.status -eq 'RUNNING' -and [IO.Path]::GetFullPath($State.run) -eq $Run -and $State.processes.Count -eq 9 -and $State.services.Count -eq 6) 'Owned runtime scope differs'
foreach($Entry in $State.processes){
    $Observed=Get-CimInstance Win32_Process -Filter "ProcessId=$($Entry.id)"
    Require ($Observed -and $Observed.CommandLine.Contains($Entry.marker)) 'Owned process mismatch'
}
$OlderDeployment=Read-Json 'isolated-executable-deployment-20261006-r2/result.json'
$HrDeployment=Read-Json 'isolated-executable-deployment-20261006-r3/result.json'
Require ($OlderDeployment.Passed -and $OlderDeployment.BackendRound -eq 'r112' -and $HrDeployment.Passed -and $HrDeployment.BackendRound -eq 'r113') 'Deployment versions differ'
$Runtime=[Collections.Generic.List[object]]::new()
foreach($Service in $State.services){
    $Name=$Service.name
    $Deployment=if($Name -eq 'hr'){$HrDeployment}else{$OlderDeployment}
    $Expected=@($Deployment.Services|Where-Object Name -eq $Name)
    Require ($Expected.Count -eq 1) 'Unique deployed service required'
    $Owned=@($State.processes|Where-Object name -eq $Name)
    Require ($Owned.Count -eq 1 -and $Owned[0].id -eq $Expected[0].Pid) 'Original deployed process changed'
    $Arguments=@(Get-Content -LiteralPath (Join-Path $Run "$Name/service.args"))
    $Markers=@(0..($Arguments.Count-1)|Where-Object {$Arguments[$_] -eq '-jar'})
    Require ($Markers.Count -eq 1 -and $Markers[0]+1 -lt $Arguments.Count) 'Executable launch marker missing'
    $Artifact=[IO.Path]::GetFullPath($Arguments[$Markers[0]+1].Trim('"'))
    Require ($Artifact -eq $Expected[0].Artifact -and (Get-FileHash -LiteralPath $Artifact).Hash -eq $Expected[0].Hash) 'Runtime artifact differs from deployment'
    Require ((Invoke-RestMethod "http://127.0.0.1:$($Service.healthPort)/actuator/health" -TimeoutSec 5).status -eq 'UP') 'Service unhealthy'
    $Runtime.Add([pscustomobject]@{name=$Name;backend=$Deployment.BackendRound;pid=$Owned[0].id;artifact=$Artifact;hash=$Expected[0].Hash;healthy=$true;sourceMatchesCurrent=$true})
}
Require ((Get-FileHash -LiteralPath $PSCommandPath).Hash -eq $ReportHash) 'Stage source changed during verification'
$Summary=[pscustomobject]@{passed=$true;backend='r113';frontend='r71';runtime=@($Runtime.ToArray());currentInputs=$Current.Count;actualInputs=$Inputs.Count;originalScripts=$Originals.Count;checks=$Result.checks.Count;amountObservations=$Result.findings.Count;requests=$Result.requests;tasks=$Result.tasks;cases=$Result.cases;slips=$Result.slips;reviewedImages=$Ui.images.Count;relatedRound=$AdjacentRound;relatedInputs=$RelatedInputs.Count;formalTaxSeedChecks=18;artifacts=@($Artifacts.ToArray());reportHash=$ReportHash;processes=$State.processes.Count;healthyServices=$Runtime.Count;captchaBefore=1081;captchaAfter=1085;officialTaxPolicyVerified=$true;officialPolicyYear=2026;nextYearPolicyVerified=$false;all18Complete=$false;globalComplete=$false;remaining=@('D3 current unified acceptance','D2 ordinary first request below 500ms','H2 full acceptance','Global35PRD681')}
$Summary|ConvertTo-Json -Depth 7|Set-Content -LiteralPath $Output -Encoding utf8NoBOM
"D3_OFFICIAL_TAX_STAGE: checks=$($Result.checks.Count); inputs=$($Current.Count); adjacent=$($RelatedInputs.Count); seed_checks=18; images=$($Ui.images.Count); healthy=$($Runtime.Count); official_policy_verified=true; all18_complete=false; global_complete=false"
