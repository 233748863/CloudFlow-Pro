param([ValidatePattern('^r[1-9][0-9]*$')][string]$Round='r1',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$SkillsRound='r1',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$AppraisalsRound='r1',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$AdjacentRound='r161')
$ErrorActionPreference='Stop'
. 'D:\CloudFlowPro\.cloudflow-runtime\use-data-drive.ps1'
$Root='D:\CloudFlowPro'
$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
$Output=Join-Path $Evidence "h2-current-skills-appraisals-stage-20261007-$Round.json"
if(Test-Path -LiteralPath $Output){throw 'Retain original skill and appraisal stage'}
function Require([bool]$Condition,[string]$Message){if(-not $Condition){throw $Message}}
function Read-Json([string]$File){Get-Content -LiteralPath $File -Raw|ConvertFrom-Json}
$ReportHash=(Get-FileHash -LiteralPath $PSCommandPath).Hash
$Definitions=@(
    @{name='skills';round=$SkillsRound;category='h2-skills';mode='skillsOnly';tables=34;preserved=13;checks=78;requests=64;images=4;captcha=8;secrets=25;flags=@('definitions','fiveSources','permissions','expiry','recommendations','concurrency','desktop','mobile','lostResponse','restoration','secrets')},
    @{name='appraisals';round=$AppraisalsRound;category='h2-appraisals';mode='appraisalsOnly';tables=41;preserved=20;checks=194;requests=384;images=4;captcha=6;secrets=24;flags=@('scope','weights','stages','scores','calibration','frozen','identity','tenants','allMethods','invitations','concurrent','customerDisabled','legacy','desktop','mobile','lostResponse','uiLifecycle','adjacentDeletion','restoration','secrets')}
)
$Current=@{};$Runs=@();$OriginalCount=0;$ImageCount=0
$Changes=@(Read-Json (Join-Path $Evidence 'h2-skills-appraisals-current-prep-20261007-r1/changes.json'))
Require ($Changes.Count -eq 4) 'Four reviewed verifier extensions required'
$Allowed=@('scripts/run-h2-independent-settlement.ps1','scripts/verify-h2-independent-runtime.mjs','scripts/verify-hr-skills-real.mjs','scripts/verify-hr-appraisals-real.mjs')
$PriorInputs=@(Read-Json (Join-Path $Evidence 'h3-portal-finance-adjacent-20261002-r160/inputs.json'))
foreach($Change in $Changes){
    $Prior=@($PriorInputs|Where-Object{$_.Path.Replace('\','/') -ceq $Change.Path})
    Require ($Prior.Count -eq 1 -and $Prior[0].Hash -eq $Change.BeforeHash) 'Verifier does not match previous regression'
    Require ($Change.Path -cin $Allowed -and $Change.Reviewed -and $Change.Reason) 'Unreviewed historical execution change'
    Require ((Get-FileHash -LiteralPath $Change.Original).Hash -eq $Change.BeforeHash -and (Get-FileHash -LiteralPath (Join-Path $Root $Change.Path)).Hash -eq $Change.AfterHash) 'Reviewed verifier changed'
}
foreach($Definition in $Definitions){
    $Directory=Join-Path $Evidence "h2-independent-$($Definition.name)-20261007-$($Definition.round)"
    $Runtime=Read-Json (Join-Path $Directory 'launcher-result.json')
    Require ($Runtime.passed -and $Runtime.($Definition.mode) -and $Runtime.verifierExit -eq 0 -and $Runtime.backend -eq 'r116' -and $Runtime.frontend -eq 'r76' -and $Runtime.inputsUnchanged -and $Runtime.processesStopped -and $Runtime.referenceKept -and -not $Runtime.productModified -and -not $Runtime.globalComplete) 'Runtime incomplete'
    Require ($Runtime.referenceBusinessTables -eq $Definition.tables) 'Reference business scope differs'
    $Run=[IO.Path]::GetFullPath($Runtime.run)
    Require ((Split-Path -Parent $Run) -eq (Join-Path $Root '.cloudflow-runtime/batch-g-integration') -and (Split-Path -Leaf $Run) -match '^[a-f0-9]{32}$' -and (Split-Path -Leaf $Run) -ne '9799534e1a3a47b5958330f14ae16dc7') 'Independent ownership mismatch'
    $State=Read-Json (Join-Path $Run 'state.json')
    Require ($State.status -eq 'STOPPED' -and $State.processes.Count -eq 8 -and $State.services.Count -eq 6 -and $State.tables -eq 374) 'Independent runtime not stopped'
    foreach($Entry in $State.processes){$Observed=Get-CimInstance Win32_Process -Filter "ProcessId=$($Entry.id)";Require (-not $Observed -or -not $Observed.CommandLine.Contains($Entry.marker)) 'Independent process remains'}
    $ActualFiles=@(Get-ChildItem -LiteralPath $Run -File -Filter "$($Definition.category)-results-*.json")
    Require ($ActualFiles.Count -eq 1) 'One actual result required'
    $Actual=Read-Json $ActualFiles[0].FullName
    Require ($Actual.passed -and -not $Actual.failure -and $Actual.checks.Count -gt 0 -and $Actual.requests.Count -gt 0) 'Actual business result incomplete'
    Require ((Get-FileHash -LiteralPath $ActualFiles[0].FullName).Hash -eq (Get-FileHash -LiteralPath (Join-Path $Directory 'business-result.json')).Hash) 'Copied business result changed'
    foreach($Flag in $Definition.flags){Require ($Actual.evidence.$Flag -eq $true) "Missing business evidence: $Flag"}
    Require ($Actual.checks.Count -eq $Definition.checks -and $Actual.requests.Count -eq $Definition.requests) 'Actual business coverage differs'
    Require ($Actual.evidence.preservation.tables -eq $Definition.preserved -and $Actual.evidence.preservation.kept) 'Suite original business not preserved'
    $Coverage=Read-Json (Join-Path $Directory 'coverage-comparison.json')
    Require ($Coverage.passed -and $Coverage.checks -eq $Actual.checks.Count -and $Coverage.requests -eq $Actual.requests.Count -and $Coverage.resultHash -eq (Get-FileHash -LiteralPath $ActualFiles[0].FullName).Hash) 'Prior coverage comparison incomplete'
    $Before=Read-Json (Join-Path $Directory 'reference-business-before.json')
    $After=Read-Json (Join-Path $Directory 'reference-business-after.json')
    Require (@($Before.PSObject.Properties).Count -eq $Definition.tables -and @($After.PSObject.Properties).Count -eq $Definition.tables) 'Reference table count differs'
    foreach($Property in $Before.PSObject.Properties){Require ($After.($Property.Name) -eq $Property.Value) 'Original business changed'}
    $Privacy=Read-Json (Join-Path $Directory 'runtime-after.json')
    Require ($Privacy.passed -and $Privacy.counterBefore -eq 0 -and $Privacy.counter -eq $Definition.captcha -and $Privacy.persistentLimit -eq '100' -and $Privacy.cachedLimit -eq '"100"' -and $Privacy.cacheTtl -eq -1 -and $Privacy.counterWrites -eq 0 -and $Privacy.configurationWrites -eq 0 -and $Privacy.files -eq 20 -and $Privacy.sensitiveValues -eq $Definition.secrets -and $Privacy.leaks -eq 0 -and $Privacy.databaseLeaks -eq 0) 'Runtime privacy or default captcha changed'
    $Snapshot=@{}
    foreach($Name in @('inputs.json','runtime-inputs.json')){
        foreach($Item in @(Read-Json (Join-Path $Directory $Name))){
            $Path=[IO.Path]::GetFullPath($Item.Path,$Root)
            $Hash=(Get-FileHash -LiteralPath $Path).Hash
            if($Name -eq 'inputs.json'){$Snapshot[$Path]=$Item.Hash}
            Require ($Hash -eq $Item.Hash) 'Executed input changed'
            Require (-not $Current.ContainsKey($Path) -or $Current[$Path] -eq $Hash) 'Current input conflict'
            $Current[$Path]=$Hash
        }
    }
    $SuiteOriginalCount=0
    $OriginalRoot=Join-Path $Directory 'originals'
    foreach($File in @(Get-ChildItem -LiteralPath $OriginalRoot -Recurse -File)){
        $Source=Join-Path $Root ([IO.Path]::GetRelativePath($OriginalRoot,$File.FullName))
        Require ($Snapshot.ContainsKey($Source) -and (Get-FileHash -LiteralPath $File.FullName).Hash -eq $Snapshot[$Source]) 'Execution original differs from snapshot'
        $OriginalCount++;$SuiteOriginalCount++
    }
    Require ($SuiteOriginalCount -eq $Runtime.executionOriginals) 'Suite execution original count differs'
    $Review=Read-Json (Join-Path $Directory 'image-review.json')
    Require ($Review.passed -and $Review.manuallyViewed -and $Review.images.Count -eq $Definition.images -and $Review.observedProcesses.Count -gt 0 -and $Review.validationProcessesRemaining -eq 0) 'Actual image review incomplete'
    foreach($Image in $Review.images){Require ((Get-FileHash -LiteralPath $Image.Path).Hash -eq $Image.Hash) 'Reviewed image changed';$ImageCount++}
    foreach($Entry in $Review.observedProcesses){$Observed=Get-CimInstance Win32_Process -Filter "ProcessId=$($Entry.ProcessId)";Require (-not $Observed -or $Observed.CreationDate -ne [datetime]$Entry.CreationDate) 'Observed validation process remains'}
    $Runs+=[pscustomobject]@{name=$Definition.name;round=$Definition.round;run=$Run;caseTag=$Review.caseTag;checks=$Actual.checks.Count;requests=$Actual.requests.Count;flags=$Definition.flags;referenceTables=$Definition.tables;captchaBefore=0;captchaAfter=$Privacy.counter;secretFiles=$Privacy.files;secretSamples=$Privacy.sensitiveValues;reviewedImages=$Review.images;resultHash=(Get-FileHash -LiteralPath $ActualFiles[0].FullName).Hash}
}
$Adjacent=Join-Path $Evidence "h3-portal-finance-adjacent-20261002-$AdjacentRound"
$AdjacentLog=Get-Content -LiteralPath (Join-Path $Adjacent 'summary.log') -Raw
Require ($AdjacentLog -match 'H3_FINANCE_ADJACENT: files=\d+; changed=0; exit=0; production_modified=false' -and $AdjacentLog -match 'regenerated_matches_formal=true; formal_modified=false') 'Adjacent regression incomplete'
$Oa=Get-Content -LiteralPath (Join-Path $Adjacent 'oa-database.log') -Raw
Require ($Oa -match 'Complete approved schema table count; expected=374; actual=374' -and $Oa -match 'PASS: 1012 OA boundary assertions') 'Formal schema regression incomplete'
$Menu=Get-Content -LiteralPath (Join-Path $Adjacent 'menu.log') -Raw
Require ($Menu -match 'EMPLOYEE_UNEXPECTED_GRANTS=0; EMPLOYEE_UNEXPECTED_WRITE_PERMISSIONS=0' -and $Menu -match 'APPROVED_MENU_SCOPE_PASS=true') 'Menu scope regression incomplete'
foreach($Item in @(Read-Json (Join-Path $Adjacent 'inputs.json'))){$Path=[IO.Path]::GetFullPath($Item.Path,$Root);Require (-not $Current.ContainsKey($Path) -or $Current[$Path] -eq $Item.Hash) 'Adjacent input differs';$Current[$Path]=$Item.Hash}
foreach($Path in $Current.Keys){Require ((Get-FileHash -LiteralPath $Path).Hash -eq $Current[$Path]) 'Current source changed during stage'}
$Reference=Read-Json (Join-Path $Root '.cloudflow-runtime/batch-g-integration/9799534e1a3a47b5958330f14ae16dc7/state.json')
Require ($Reference.status -eq 'RUNNING' -and $Reference.processes.Count -eq 9 -and $Reference.services.Count -eq 6) 'Reference runtime changed'
foreach($Entry in $Reference.processes){$Observed=Get-CimInstance Win32_Process -Filter "ProcessId=$($Entry.id)";Require ($Observed -and $Observed.CommandLine.Contains($Entry.marker)) 'Reference ownership changed'}
foreach($Service in $Reference.services){Require ((Invoke-RestMethod "http://127.0.0.1:$($Service.healthPort)/actuator/health" -TimeoutSec 10).status -eq 'UP') 'Reference health changed'}
Require ((Get-FileHash -LiteralPath $PSCommandPath).Hash -eq $ReportHash) 'Stage script changed'
[pscustomobject]@{passed=$true;backend='r116';frontend='r76';runs=$Runs;currentInputs=$Current.Count;executionOriginals=$OriginalCount;reviewedVerifierChanges=$Changes;reviewedImages=$ImageCount;referenceProcesses=9;referenceHealthyServices=6;adjacentRound=$AdjacentRound;formalTables=374;oaAssertions=1012;reportHash=$ReportHash;productModified=$false;allH2Complete=$false;globalComplete=$false}|ConvertTo-Json -Depth 12|Set-Content -LiteralPath $Output -Encoding utf8NoBOM
"H2_CURRENT_SKILLS_APPRAISALS_STAGE: passed=true; current_inputs=$($Current.Count); originals=$OriginalCount; images=$ImageCount; suites=2; reference_healthy_services=6; global_complete=false"
