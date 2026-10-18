param([ValidatePattern('^r[1-9][0-9]*$')][string]$Round='r1',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$AdjacentRound='r124')
$ErrorActionPreference='Stop'
. 'D:\CloudFlowPro\.cloudflow-runtime\use-data-drive.ps1'
$Root='D:\CloudFlowPro'
$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
$Run=Join-Path $Root '.cloudflow-runtime/batch-g-integration/9799534e1a3a47b5958330f14ae16dc7'
$Output=Join-Path $Evidence "d3-current-money-stage-20261006-$Round.json"
if(Test-Path -LiteralPath $Output){throw 'Retain original current money stage evidence'}
$ReportHash=(Get-FileHash -LiteralPath $PSCommandPath).Hash
function Require([bool]$Condition,[string]$Message){if(-not $Condition){throw $Message}}
function Read-Json([string]$File){Get-Content -LiteralPath (Join-Path $Evidence $File) -Raw|ConvertFrom-Json}
$Current=@{}
function Verify-Inputs([string]$File){foreach($Item in @(Read-Json $File)){
    if(-not $Current.ContainsKey($Item.Path)){$Current[$Item.Path]=(Get-FileHash -LiteralPath (Join-Path $Root $Item.Path)).Hash}
    Require ($Current[$Item.Path] -eq $Item.Hash) 'Current executed input changed'
}}
$Definitions=@(
    @{Name='d3-large-publication';Round='r3';Flags=@('storage','calculation','transport','browser','input','publication','pdf','ess','nextPeriod','presentation','compensationUi');Checks=225;Tasks=4;Originals=5;Terminal='D3_LARGE_PUBLICATION_RUN_EXIT=0';Screenshots=7},
    @{Name='d3-tax-boundaries';Round='r2';Flags=@('boundaries','rounding','threshold','snapshots','browser');Checks=262;Tasks=1;Originals=5;Terminal='D3_TAX_BOUNDARIES_RUN_EXIT=0';Screenshots=3},
    @{Name='d3-deduction-statuses';Round='r8';Flags=@('proofs','employeeForm','sharedUploads','statuses','switches','exclusions','reapproval','snapshots','browser');Checks=260;Tasks=2;Originals=5;Terminal='D3_DEDUCTION_STATUSES_RUN_EXIT=0';Screenshots=7},
    @{Name='d3-income-benefits';Round='r4';Flags=@('mixedSources','sourceFilters','benefitGeneration','snapshots','browser');Checks=234;Tasks=1;Originals=5;Terminal='D3_INCOME_BENEFITS_RUN_EXIT=0';Screenshots=3},
    @{Name='d3-funded-encashment';Round='r8';Flags=@('funding','encashment','mixedPayroll','cancellation','payment','duplicates','browser');Checks=213;Tasks=2;Originals=5;Terminal='D3_FUNDED_ENCASHMENT_RUN_EXIT=0';Screenshots=1},
    @{Name='d3-approved-income';Round='r5';Flags=@('overtime','referral','mixedPayroll','cancellation','payment','duplicates','browser');Checks=288;Tasks=2;Originals=6;Terminal='D3_APPROVED_INCOME_RUN_EXIT=0';Screenshots=1},
    @{Name='d3-source-labels';Round='r3';Flags=@('content','browser','pdf','readOnly');Checks=40;Tasks=0;Originals=5;Terminal='D3_SOURCE_LABELS_RUN_EXIT=0';Screenshots=4}
)
$Phases=@();$OriginalCount=0;$Artifacts=@();$LastCaptcha=956;$Captcha=@();$Results=@{};$Fixtures=@{}
foreach($Definition in $Definitions){
    $Folder="$($Definition.Name)-20261006-$($Definition.Round)"
    $Result=Read-Json "$Folder/result.json";$Results[$Definition.Name]=$Result
    foreach($Flag in @('passed','preservation','secrets')+$Definition.Flags){Require ($Result.$Flag -eq $true) "Current money evidence missing: $Flag"}
    Require (-not $Result.all18Complete -and -not $Result.globalComplete -and -not $Result.officialTaxPolicyVerified) 'Current money scope changed'
    Require ($Result.checks.Count -eq $Definition.Checks -and [int]$Result.tasks -eq $Definition.Tasks) 'Current money execution scope differs'
    Verify-Inputs "$Folder/inputs.json"
    $Inputs=@(Read-Json "$Folder/inputs.json")
    if($Definition.Name -ne 'd3-source-labels'){
        $Fixture=Read-Json "$Folder/fixture.json";$Fixtures[$Definition.Name]=$Fixture
        Require ($Result.restoration -and @($Fixture.restorations.PSObject.Properties).Count -gt 0) 'Current money restoration missing'
        foreach($Property in $Fixture.restorations.PSObject.Properties){Require ($Property.Value -eq $true) 'Current money restoration incomplete'}
        foreach($Task in $Fixture.tasks){Require ($Task.terminal -eq 'SUCCESS') 'Original money task did not succeed'}
    }
    $Originals=@(Get-ChildItem -LiteralPath (Join-Path $Evidence $Folder) -Filter 'original-*' -File)
    Require ($Originals.Count -eq $Definition.Originals) 'Original money execution script count differs'
    foreach($Original in $Originals){
        $Name=$Original.Name.Substring('original-'.Length);$Input=@($Inputs|Where-Object {(Split-Path -Leaf $_.Path) -eq $Name})
        Require ($Input.Count -eq 1 -and (Get-FileHash -LiteralPath $Original.FullName).Hash -eq $Input[0].Hash) 'Original money execution script differs';$OriginalCount++
    }
    $LaunchName="$($Definition.Name)-live-$($Definition.Round)-launch.log"
    $Launch=Get-Content -LiteralPath (Join-Path $Evidence $LaunchName) -Raw
    Require ($Launch.Contains($Definition.Terminal)) 'Original money execution terminal missing'
    Require ($Launch -match 'OWNED_CAPTCHA_RESTORED: original_limit=100; original_ttl=-1; counter_before=(\d+); counter_after=(\d+); counter_writes=0; database_unchanged=true; production_modified=false') 'Money captcha restoration missing'
    $Before=[int]$Matches[1];$After=[int]$Matches[2];Require ($Before -eq $LastCaptcha -and $After -ge $Before) 'Money captcha sequence differs';$LastCaptcha=$After
    $Captcha+=[pscustomobject]@{Phase=$Definition.Name;Before=$Before;After=$After}
    $Pictures=@(Get-ChildItem -LiteralPath (Join-Path $Evidence $Folder) -Filter '*.png' -File -Recurse)
    Require ($Pictures.Count -eq $Definition.Screenshots) 'Actual money page or PDF rendering missing'
    $Files=@(Get-ChildItem -LiteralPath (Join-Path $Evidence $Folder) -File -Recurse|Where-Object {$_.Extension -eq '.png' -or $_.Name -match '^(?:salary|[0-9]+)\.pdf$' -or $_.Name -in @('result.json','fixture.json','inputs.json','requests.json','paid-salary.json') -or $_.Name.StartsWith('original-')})
    $Files+=Get-Item -LiteralPath (Join-Path $Evidence $LaunchName)
    foreach($File in $Files){Require ($File.Length -gt 0) 'Empty money evidence file';$Artifacts+=[pscustomobject]@{Path=[IO.Path]::GetRelativePath($Root,$File.FullName);Hash=(Get-FileHash -LiteralPath $File.FullName).Hash}}
    $Phases+=[pscustomobject]@{Name=$Definition.Name;Round=$Definition.Round;Checks=$Result.checks.Count;Requests=$Result.requests;Tasks=[int]$Result.tasks;Inputs=$Inputs.Count;Originals=$Originals.Count;Screenshots=$Pictures.Count}
}
$Large=$Fixtures['d3-large-publication'];$Tax=$Fixtures['d3-tax-boundaries'];$Deduction=$Fixtures['d3-deduction-statuses'];$Income=$Fixtures['d3-income-benefits'];$Funded=$Fixtures['d3-funded-encashment'];$Approved=$Fixtures['d3-approved-income'];$Labels=$Results['d3-source-labels']
Require ($Large.published.Count -eq 4 -and $Large.pdfs.Count -eq 4 -and $Large.bindingRestored -and $Results['d3-large-publication'].findings.Count -eq 88) 'Large publication scope incomplete'
foreach($Pdf in $Large.pdfs){Require ((Get-FileHash -LiteralPath (Join-Path $Evidence "d3-large-publication-20261006-r3/$($Pdf.name)-pdf/salary.pdf")).Hash.ToLowerInvariant() -eq $Pdf.sha256) 'Downloaded large salary PDF changed'}
Require ($Large.nextPayroll.tax -eq '9007199254741.00' -and $Large.nextPayroll.net -eq '81064793292668.93') 'Large next period cents differ'
Require ($Tax.cases.Count -eq 24 -and $Results['d3-tax-boundaries'].findings.Count -eq 1093 -and @($Results['d3-tax-boundaries'].findings|Where-Object passed -ne $true).Count -eq 0) 'Tax boundaries or rounding incomplete'
Require ($Deduction.deductions.Count -eq 8 -and $Deduction.snapshots.Count -eq 5 -and $Deduction.sharedUploads.Count -eq 2 -and $Deduction.uiReview) 'Actual deduction declarations or uploads incomplete'
Require (($Deduction.snapshots|Where-Object label -eq 'flag0_actual').special -eq '350.11' -and ($Deduction.snapshots|Where-Object label -eq 'flag1_actual').special -eq '650.14') 'Actual deduction switches differ'
Require ($Income.cases.Count -eq 3 -and ($Income.cases|Where-Object name -eq 'large').expected.net -eq '72958313963397.66') 'Fixed income or benefit rounding incomplete'
Require ($Funded.loanId -eq '203' -and $Funded.paymentId -eq '9047' -and $Funded.originalPeriodVersion -eq 17 -and $Approved.originalPeriodVersion -eq 22) 'Actual source sample or period revision differs'
Require ($Approved.referral.referralId -eq '153' -and $Approved.overtimeId -eq '104') 'Actual approval source differs'
Require ($Labels.sourceRounds.funded -eq 'r8' -and $Labels.sourceRounds.approved -eq 'r5' -and $Labels.samples.Count -eq 2 -and $Labels.observations.Count -eq 11 -and @($Labels.observations|Where-Object present -ne $true).Count -eq 0) 'Current salary business labels incomplete'
Require ($Labels.samples[0].id -eq $Approved.batches[1].slipId -and $Labels.samples[1].id -eq $Funded.batches[1].slipId) 'Labels used a different paid source'
foreach($File in @("h3-portal-finance-adjacent-20261002-$AdjacentRound/inputs.json",'h3-portal-finance-20261002-backend-r108-inputs.json','h3-portal-finance-20261002-frontend-r66-inputs.json','d3-batch-cancellation-20261006-r3/inputs.json','d3-simulator-20261006-r7/inputs.json','d3-simulator-config-20261006-r2/inputs.json','d3-batch-scale-20261006-r4/inputs.json','d3-batch-lifecycle-20261006-r2/inputs.json','d3-cumulative-tax-20261006-r5/inputs.json','d3-payroll-deductions-20261006-r3/inputs.json','d3-salary-privacy-20261006-r7/inputs.json','d3-payroll-corrections-20261006-r5/inputs.json')){Verify-Inputs $File}
$Binaries=@(Read-Json 'd3-simulator-config-20261006-r2/binary-inputs.json')
foreach($Item in $Binaries){Require ((Get-FileHash -LiteralPath $Item.Path).Hash -eq $Item.Hash) 'Compiled dependency changed'}
$Previous=Read-Json 'd3-current-salary-stage-20261006-r1.json'
Require ($Previous.passed -and $Previous.backend -eq 'r108' -and $Previous.frontend -eq 'r66') 'Previous current salary stage incomplete'
$PriorInputs=@(Read-Json 'h3-portal-finance-adjacent-20261002-r123/inputs.json')
$Changed=@($PriorInputs|Where-Object {(Get-FileHash -LiteralPath (Join-Path $Root $_.Path)).Hash -ne $_.Hash}|ForEach-Object {$_.Path.Replace('\','/')})
$ExpectedChanged=@('scripts/run-d3-source-labels.ps1','scripts/verify-d3-source-labels.mjs','scripts/run-d3-source-labels-allowance.mjs')
Require ($Changed.Count -eq 3 -and @($Changed|Where-Object {$_ -notin $ExpectedChanged}).Count -eq 0) 'Changes since prior related round exceed three source label scripts'
foreach($Name in $ExpectedChanged){
    $Original=Join-Path $Evidence "d3-source-labels-20261006-r2/original-$(Split-Path -Leaf $Name)"
    $PreviousInput=@($PriorInputs|Where-Object {$_.Path.Replace('\','/') -eq $Name})
    Require ($PreviousInput.Count -eq 1 -and (Get-FileHash -LiteralPath $Original).Hash -eq $PreviousInput[0].Hash) 'Previous label execution original missing'
}
$AdjacentInputs=@(Read-Json "h3-portal-finance-adjacent-20261002-$AdjacentRound/inputs.json")
Require (@($AdjacentInputs|Where-Object {(Split-Path -Leaf $_.Path) -eq (Split-Path -Leaf $PSCommandPath) -and $_.Hash -eq $ReportHash}).Count -eq 1) 'Current report was not included in related regression'
$Adjacent=Get-Content -LiteralPath (Join-Path $Evidence "h3-portal-finance-adjacent-20261002-$AdjacentRound/summary.log") -Raw
Require ($Adjacent -match 'H3_FINANCE_ADJACENT: files=(\d+); changed=0; exit=0; production_modified=false') 'Current money related regression incomplete'
Require ([int]$Matches[1] -eq $AdjacentInputs.Count) 'Related regression input count differs'
$State=Get-Content -LiteralPath (Join-Path $Run 'state.json') -Raw|ConvertFrom-Json
Require ($State.status -eq 'RUNNING' -and [IO.Path]::GetFullPath($State.run) -eq $Run) 'Owned runtime required'
foreach($Entry in $State.processes){$Observed=Get-CimInstance Win32_Process -Filter "ProcessId=$($Entry.id)";Require ($Observed -and $Observed.CommandLine.Contains($Entry.marker)) 'Owned process mismatch'}
$Healthy=0
foreach($Service in $State.services){Require ((Invoke-RestMethod "http://127.0.0.1:$($Service.healthPort)/actuator/health" -TimeoutSec 5).status -eq 'UP') 'Unhealthy service';$Healthy++}
Require ((Get-FileHash -LiteralPath $PSCommandPath).Hash -eq $ReportHash) 'Report changed during execution'
$Summary=[pscustomobject]@{passed=$true;backend='r108';frontend='r66';phases=$Phases;currentInputs=$Current.Count;binaryInputs=$Binaries.Count;originalScripts=$OriginalCount;artifacts=$Artifacts;relatedRound=$AdjacentRound;relatedInputs=$AdjacentInputs.Count;verificationScriptChanges=$Changed;reportHash=$ReportHash;reportAddedAfterRelatedRound=$false;processes=$State.processes.Count;healthyServices=$Healthy;captcha=$Captcha;officialTaxPolicyVerified=$false;all18Complete=$false;globalComplete=$false;remaining=@('D3 current unified acceptance','Official tax policy','D2 first ordinary request below500ms','D4 current full acceptance','Global35PRD681')}
$Summary|ConvertTo-Json -Depth 7|Set-Content -LiteralPath $Output -Encoding utf8NoBOM
"D3_CURRENT_MONEY_STAGE: phases=$($Phases.Count); inputs=$($Current.Count); binaries=$($Binaries.Count); originals=$OriginalCount; artifacts=$($Artifacts.Count); adjacent=$($AdjacentInputs.Count); healthy=$Healthy; global_complete=false"
