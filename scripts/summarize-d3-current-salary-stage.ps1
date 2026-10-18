param([ValidatePattern('^r[1-9][0-9]*$')][string]$Round='r1',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$AdjacentRound='r123')
$ErrorActionPreference='Stop'
. 'D:\CloudFlowPro\.cloudflow-runtime\use-data-drive.ps1'
$Root='D:\CloudFlowPro'
$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
$Run=Join-Path $Root '.cloudflow-runtime/batch-g-integration/9799534e1a3a47b5958330f14ae16dc7'
$Output=Join-Path $Evidence "d3-current-salary-stage-20261006-$Round.json"
if(Test-Path -LiteralPath $Output){throw 'Retain original current salary stage evidence'}
$ReportHash=(Get-FileHash -LiteralPath $PSCommandPath).Hash
function Require([bool]$Condition,[string]$Message){if(-not $Condition){throw $Message}}
function Read-Json([string]$File){Get-Content -LiteralPath (Join-Path $Evidence $File) -Raw|ConvertFrom-Json}
$Current=@{}
function Verify-Inputs([string]$File){foreach($Item in @(Read-Json $File)){
    if(-not $Current.ContainsKey($Item.Path)){$Current[$Item.Path]=(Get-FileHash -LiteralPath (Join-Path $Root $Item.Path)).Hash}
    Require ($Current[$Item.Path] -eq $Item.Hash) 'Current executed input changed'
}}
$PrivacyFolder='d3-salary-privacy-20261006-r7'
$CorrectionFolder='d3-payroll-corrections-20261006-r5'
$FailureFolder='d3-salary-privacy-20261006-r6'
$AuditFolder='d3-denied-query-audit-20261006-r3'
$Privacy=Read-Json "$PrivacyFolder/result.json"
$Correction=Read-Json "$CorrectionFolder/result.json"
foreach($Result in @($Privacy,$Correction)){
    foreach($Flag in @('passed','preservation','restoration','secrets','audits')){Require ($Result.$Flag -eq $true) "Current salary evidence missing: $Flag"}
    Require (-not $Result.all18Complete -and -not $Result.globalComplete -and -not $Result.officialTaxPolicyVerified) 'Current salary scope changed'
}
foreach($Flag in @('scope','tenant','unpublished','downloads','confirmation')){Require ($Privacy.$Flag -eq $true) 'Current privacy boundary missing'}
Require ($Privacy.checks.Count -eq 388 -and $Privacy.matrix -eq 103 -and $Privacy.auditedOperations -eq 45 -and $Privacy.tasks -eq 1) 'Privacy matrix differs'
foreach($Flag in @('approval','samePeriod','negative','nextPeriod','boundaries','ui')){Require ($Correction.$Flag -eq $true) 'Current correction boundary missing'}
Require ($Correction.checks.Count -eq 254 -and $Correction.corrections -eq 4) 'Correction scope differs'
$PrivacyFixture=Read-Json "$PrivacyFolder/fixture.json"
$CorrectionFixture=Read-Json "$CorrectionFolder/fixture.json"
Require ($PrivacyFixture.source -eq 'd3-payroll-deductions-20261006-r3' -and $CorrectionFixture.source -eq $PrivacyFixture.source -and $CorrectionFixture.originalSlipId -eq $PrivacyFixture.targets.main.id) 'Current salary source differs'
Require ($PrivacyFixture.reusedPeer -and $PrivacyFixture.confirmButtonCount -eq 1 -and $PrivacyFixture.employeeConfirmPermission) 'Actual receipt or owned peer reuse missing'
foreach($Fixture in @($PrivacyFixture,$CorrectionFixture)){foreach($Property in $Fixture.restorations.PSObject.Properties){Require ($Property.Value -eq $true) 'Salary restoration incomplete'}}
Require (@($CorrectionFixture.corrections|Where-Object decision -eq 'REJECTED').Count -eq 1 -and @($CorrectionFixture.corrections|Where-Object { $_.decision -eq 'APPLIED' -and $_.paid }).Count -eq 3) 'Finance decisions or payments incomplete'
Require ($CorrectionFixture.nextMonth -eq '2026-05' -and $CorrectionFixture.currentPeriodId -eq '166' -and $CorrectionFixture.nextPeriodId -eq '169') 'Current correction period differs'
$Expected=@{'same-period'='8099';'negative'='-1001';'next-period'='18103'}
foreach($Name in $Expected.Keys){$Sample=@($CorrectionFixture.corrections|Where-Object name -eq $Name);Require ($Sample.Count -eq 1 -and $Sample[0].expected.net -eq $Expected[$Name]) 'Exact correction cents differ'}
$Failure=Read-Json "$FailureFolder/result.json"
Require (-not $Failure.passed -and -not $Failure.confirmation -and $Failure.scope -and $Failure.tenant -and $Failure.audits -and $Failure.preservation -and $Failure.restoration -and $Failure.secrets -and $Failure.matrix -eq 107 -and $Failure.failure.StartsWith('locator.click: Timeout')) 'Original failed UI round or restoration missing'
$FailureInputs=@(Read-Json "$FailureFolder/inputs.json")
$FailureChanges=@($FailureInputs|Where-Object {(Get-FileHash -LiteralPath (Join-Path $Root $_.Path)).Hash -ne $_.Hash}|ForEach-Object {$_.Path.Replace('\','/')})
Require ($FailureChanges.Count -eq 2 -and @($FailureChanges|Where-Object {$_ -notin @('scripts/verify-d3-salary-privacy.mjs','scripts/run-d3-salary-privacy.ps1')}).Count -eq 0) 'Failed round changed beyond selected month and snapshot fixes'
$OriginalCount=0
foreach($Folder in @($PrivacyFolder,$CorrectionFolder,$FailureFolder)){
    $Inputs=@(Read-Json "$Folder/inputs.json")
    $Originals=@(Get-ChildItem -LiteralPath (Join-Path $Evidence $Folder) -Filter 'original-*' -File)
    Require ($Originals.Count -eq 5) 'Original salary execution script count differs'
    foreach($Original in $Originals){
        $Name=$Original.Name.Substring('original-'.Length)
        $Input=@($Inputs|Where-Object {(Split-Path -Leaf $_.Path) -eq $Name})
        Require ($Input.Count -eq 1 -and (Get-FileHash -LiteralPath $Original.FullName).Hash -eq $Input[0].Hash) 'Original salary execution script differs';$OriginalCount++
    }
}
$Audit=Read-Json "$AuditFolder/result.json"
Require ($Audit.passed -and $Audit.readOnly -and $Audit.deniedQueryAuditVerified -and -not $Audit.dedicatedHrDeniedAudit -and -not $Audit.all18Complete -and -not $Audit.globalComplete -and $Audit.backend -eq 'r108' -and $Audit.frontend -eq 'r66' -and $Audit.privacyRound -eq 'r7') 'Read-only audit scope differs'
Require ($Audit.checks.Count -eq 603 -and $Audit.requests -eq 117 -and $Audit.denied -eq 77 -and $Audit.parametersChecked -eq 119 -and $Audit.checkedInputs -eq 5352 -and $Audit.failures.Count -eq 0) 'Every current query audit not reconciled'
foreach($Source in $Audit.sources){Require ((Get-FileHash -LiteralPath $Source.path).Hash.ToLowerInvariant() -eq $Source.sha256) 'Original audit source changed'}
foreach($File in @((Join-Path $Root 'scripts/verify-d3-denied-query-audit.mjs'),(Join-Path $Evidence "$AuditFolder/original-verify-d3-denied-query-audit.mjs"))){Require ((Get-FileHash -LiteralPath $File).Hash.ToLowerInvariant() -eq $Audit.verifierSha256) 'Executed audit verifier changed'}
$OriginalCount++
$Captcha=@();$LastCaptcha=942
foreach($Phase in @(@{Name='d3-salary-privacy-live-r6';Terminal='D3_PRIVACY_INPUTS: files=5346; changed=0; exit=1'},@{Name='d3-salary-privacy-live-r7';Terminal='D3_PRIVACY_RUN_EXIT=0'},@{Name='d3-payroll-corrections-live-r5';Terminal='D3_CORRECTIONS_RUN_EXIT=0'})){
    $Launch=Get-Content -LiteralPath (Join-Path $Evidence "$($Phase.Name)-launch.log") -Raw
    Require ($Launch.Contains($Phase.Terminal)) 'Original salary execution terminal missing'
    Require ($Launch -match 'OWNED_CAPTCHA_RESTORED: original_limit=100; original_ttl=-1; counter_before=(\d+); counter_after=(\d+); counter_writes=0; database_unchanged=true; production_modified=false') 'Salary captcha restoration missing'
    $Before=[int]$Matches[1];$After=[int]$Matches[2];Require ($Before -eq $LastCaptcha -and $After -ge $Before) 'Salary captcha sequence differs';$LastCaptcha=$After
    $Captcha+=[pscustomobject]@{Phase=$Phase.Name;Before=$Before;After=$After}
}
foreach($File in @("$PrivacyFolder/inputs.json","$CorrectionFolder/inputs.json","h3-portal-finance-adjacent-20261002-$AdjacentRound/inputs.json",'h3-portal-finance-20261002-backend-r108-inputs.json','h3-portal-finance-20261002-frontend-r66-inputs.json','d3-batch-scale-20261006-r4/inputs.json','d3-batch-lifecycle-20261006-r2/inputs.json','d3-cumulative-tax-20261006-r5/inputs.json','d3-payroll-deductions-20261006-r3/inputs.json')){Verify-Inputs $File}
$Binaries=@(Read-Json 'd3-simulator-config-20261006-r2/binary-inputs.json')
foreach($Item in $Binaries){Require ((Get-FileHash -LiteralPath $Item.Path).Hash -eq $Item.Hash) 'Compiled dependency changed'}
$Prior=Read-Json 'd3-current-batch-stage-20261006-r1.json'
Require ($Prior.passed -and $Prior.backend -eq 'r108' -and $Prior.frontend -eq 'r66' -and $Prior.phases.Count -eq 4) 'Previous current batch stage incomplete'
$PriorInputs=@(Read-Json 'h3-portal-finance-adjacent-20261002-r122/inputs.json')
$Changed=@($PriorInputs|Where-Object {(Get-FileHash -LiteralPath (Join-Path $Root $_.Path)).Hash -ne $_.Hash}|ForEach-Object {$_.Path.Replace('\','/')})
$ExpectedChanged=@('scripts/run-d3-salary-privacy.ps1','scripts/verify-d3-salary-privacy.mjs','scripts/run-d3-salary-privacy-allowance.mjs','scripts/verify-d3-denied-query-audit.mjs','scripts/run-d3-payroll-corrections.ps1','scripts/verify-d3-payroll-corrections.mjs','scripts/run-d3-payroll-corrections-allowance.mjs')
Require ($Changed.Count -eq 7 -and @($Changed|Where-Object {$_ -notin $ExpectedChanged}).Count -eq 0) 'Changes since prior related round exceed seven selected verification scripts'
foreach($Name in $ExpectedChanged){
    $Folder=if($Name.Contains('denied-query')){'d3-denied-query-audit-20261006-r2'}elseif($Name.Contains('payroll-corrections')){'d3-payroll-corrections-20261006-r4'}else{'d3-salary-privacy-20261006-r5'}
    $Original=Join-Path $Evidence "$Folder/original-$(Split-Path -Leaf $Name)"
    $Previous=@($PriorInputs|Where-Object {$_.Path.Replace('\','/') -eq $Name})
    Require ($Previous.Count -eq 1 -and (Get-FileHash -LiteralPath $Original).Hash -eq $Previous[0].Hash) 'Previous salary execution original missing'
}
foreach($File in @("$PrivacyFolder/self-before-confirm.png","$PrivacyFolder/self-confirmed.png","$PrivacyFolder/self-confirmed-ui.pdf","$CorrectionFolder/paid-correction.png")){Require ((Get-Item -LiteralPath (Join-Path $Evidence $File)).Length -gt 0) 'Actual salary page or PDF evidence missing'}
$Adjacent=Get-Content -LiteralPath (Join-Path $Evidence "h3-portal-finance-adjacent-20261002-$AdjacentRound/summary.log") -Raw
Require ($Adjacent -match 'H3_FINANCE_ADJACENT: files=(\d+); changed=0; exit=0; production_modified=false') 'Current salary related regression incomplete';$AdjacentInputs=[int]$Matches[1]
$State=Get-Content -LiteralPath (Join-Path $Run 'state.json') -Raw|ConvertFrom-Json
Require ($State.status -eq 'RUNNING' -and [IO.Path]::GetFullPath($State.run) -eq $Run) 'Owned runtime required'
foreach($Entry in $State.processes){$Observed=Get-CimInstance Win32_Process -Filter "ProcessId=$($Entry.id)";Require ($Observed -and $Observed.CommandLine.Contains($Entry.marker)) 'Owned process mismatch'}
$Healthy=0
foreach($Service in $State.services){Require ((Invoke-RestMethod "http://127.0.0.1:$($Service.healthPort)/actuator/health" -TimeoutSec 5).status -eq 'UP') 'Unhealthy service';$Healthy++}
Require ((Get-FileHash -LiteralPath $PSCommandPath).Hash -eq $ReportHash) 'Report changed during execution'
$Summary=[pscustomobject]@{passed=$true;backend='r108';frontend='r66';privacyChecks=$Privacy.checks.Count;privacyRequests=$Privacy.requests;privacyMatrix=$Privacy.matrix;auditChecks=$Audit.checks.Count;auditRequests=$Audit.requests;deniedQueries=$Audit.denied;correctionChecks=$Correction.checks.Count;correctionRequests=$Correction.requests;corrections=$Correction.corrections;currentInputs=$Current.Count;binaryInputs=$Binaries.Count;originalScripts=$OriginalCount;relatedRound=$AdjacentRound;relatedInputs=$AdjacentInputs;verificationScriptChanges=$Changed;failedRoundRetained=$true;reportHash=$ReportHash;processes=$State.processes.Count;healthyServices=$Healthy;captcha=$Captcha;officialTaxPolicyVerified=$false;all18Complete=$false;globalComplete=$false;remaining=@('Other D3 phases with older product inputs','Official tax policy','D2 first ordinary request below500ms','Global35PRD681')}
$Summary|ConvertTo-Json -Depth 7|Set-Content -LiteralPath $Output -Encoding utf8NoBOM
"D3_CURRENT_SALARY_STAGE: privacy=$($Privacy.checks.Count); audit=$($Audit.checks.Count); corrections=$($Correction.checks.Count); inputs=$($Current.Count); binaries=$($Binaries.Count); originals=$OriginalCount; adjacent=$AdjacentInputs; healthy=$Healthy; global_complete=false"
