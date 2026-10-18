param([ValidatePattern('^r[1-9][0-9]*$')][string]$Round='r1')
$ErrorActionPreference='Stop'
. 'D:\CloudFlowPro\.cloudflow-runtime\use-data-drive.ps1'
$Root='D:\CloudFlowPro'
$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
$Run=Join-Path $Root '.cloudflow-runtime/batch-g-integration/9799534e1a3a47b5958330f14ae16dc7'
$Output=Join-Path $Evidence "d4-dispute-read-stage-20261006-$Round.json"
if(Test-Path -LiteralPath $Output){throw 'Retain original stage report'}
$Current=@{};$Artifacts=[Collections.Generic.List[object]]::new();$ReportCorrection=$null
function Require([bool]$Value,[string]$Message){if(-not $Value){throw $Message}}
function Read-Json([string]$File){Get-Content -LiteralPath (Join-Path $Evidence $File) -Raw|ConvertFrom-Json}
function Keep([string]$File){
    $Path=Join-Path $Evidence $File
    $Before=Get-Item -LiteralPath $Path
    $Length=$Before.Length;$Written=$Before.LastWriteTimeUtc
    $Stream=[IO.File]::Open($Path,[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::ReadWrite)
    try{$Hasher=[Security.Cryptography.SHA256]::Create();try{$Hash=[Convert]::ToHexString($Hasher.ComputeHash($Stream))}finally{$Hasher.Dispose()}}finally{$Stream.Dispose()}
    $After=Get-Item -LiteralPath $Path
    Require ($After.Length -eq $Length -and $After.LastWriteTimeUtc -eq $Written) 'Evidence changed during shared read'
    $Artifacts.Add([pscustomobject]@{Path=$File;Hash=$Hash})
}
function Verify-Current([string]$File){
    foreach($Item in @(Read-Json $File)){
        if(-not $Current.ContainsKey($Item.Path)){$Current[$Item.Path]=(Get-FileHash -LiteralPath (Join-Path $Root $Item.Path)).Hash}
        if($Current[$Item.Path] -ne $Item.Hash){
            Require ($File -eq 'h3-portal-finance-adjacent-20261002-r127/inputs.json' -and $Item.Path.Replace('\','/') -eq 'scripts/summarize-d4-dispute-read-stage.ps1') "Current execution input changed: $($Item.Path)"
            $Original='d4-dispute-read-stage-before-r2.ps1'
            Require ((Get-FileHash -LiteralPath (Join-Path $Evidence $Original)).Hash -eq $Item.Hash) 'Original stage report does not match R127'
            $script:ReportCorrection=[pscustomobject]@{path=$Item.Path;original=$Original;beforeHash=$Item.Hash;afterHash=$Current[$Item.Path];reason='Shared read of completed launch log retained by service processes; report source is the only changed R127 input'}
            Keep $Original
        }
    }
    Keep $File
}
$Prior=Read-Json 'd4-privacy-stage-20261006-r1.json'
Require ($Prior.passed -and $Prior.backend -eq 'r108' -and $Prior.frontend -eq 'r67' -and $Prior.handlerDisputeNavigationPending -and -not $Prior.globalComplete) 'Prior scope changed'
Require ((Get-FileHash -LiteralPath (Join-Path $Root 'scripts/summarize-d4-privacy-stage.ps1')).Hash -eq $Prior.reportHash) 'Prior report source changed'
foreach($Artifact in $Prior.artifacts){Require ((Get-FileHash -LiteralPath (Join-Path $Evidence $Artifact.Path)).Hash -eq $Artifact.Hash) 'Historical evidence changed'}
Keep 'd4-privacy-stage-20261006-r1.json'
$ExpectedChanges=@(
    'cloudflow-backend/cloudflow-service-hr/src/main/java/com/cloudflow/hr/mapper/HrGrievanceMapper.java',
    'cloudflow-backend/cloudflow-service-hr/src/main/java/com/cloudflow/hr/service/HrGrievanceAccessService.java',
    'cloudflow-backend/cloudflow-service-hr/src/main/java/com/cloudflow/hr/service/HrTypedCrudService.java',
    'cloudflow-backend/cloudflow-service-hr/src/main/java/com/cloudflow/hr/service/impl/HrLaborDisputeServiceImpl.java',
    'cloudflow-backend/cloudflow-service-hr/src/main/resources/mapper/HrGrievanceMapper.xml',
    'cloudflow-frontend/src/router.tsx',
    'cloudflow-frontend/src/pages/hr/laborRelation/HrLaborDisputePage.tsx',
    'cloudflow-frontend/src/pages/hr/rules/HrGrievancePage.tsx')
$Changed=[Collections.Generic.List[string]]::new()
foreach($File in @('h3-portal-finance-20261002-backend-r108-inputs.json','h3-portal-finance-20261002-frontend-r67-inputs.json')){
    foreach($Item in @(Read-Json $File)){
        if((Get-FileHash -LiteralPath (Join-Path $Root $Item.Path)).Hash -ne $Item.Hash){$Changed.Add($Item.Path.Replace('\','/'))}
    }
    Keep $File
}
Require (@(Compare-Object @($ExpectedChanges|Sort-Object) @($Changed|Sort-Object)).Count -eq 0) 'Product changes exceeded reviewed scope'
foreach($File in @('h3-portal-finance-20261002-backend-r109-inputs.json','h3-portal-finance-20261002-frontend-r68-inputs.json',
    'd2-month-read-reuse-reload-20261005-r109/inputs.json','d4-dispute-scope-20261006-r3/inputs.json',
    'd4-hr-checks-20261006-r4/inputs.json','d4-privacy-20261006-r7/inputs.json','h3-portal-finance-adjacent-20261002-r127/inputs.json')){Verify-Current $File}
$Privacy=Read-Json 'd4-privacy-20261006-r7/result.json';$Fixture=Read-Json 'd4-privacy-20261006-r7/fixture.json'
foreach($Flag in @('passed','identities','scope','targets','assignment','internal','files','tenant','anonymous','disputes','audits','browser','preservation','restoration','secrets')){Require ($Privacy.$Flag -eq $true) "Current privacy check missing: $Flag"}
Require ($Privacy.checks.Count -eq 1119 -and $Privacy.requests -eq 332 -and $Privacy.matrixCases -eq 189 -and -not $Privacy.handlerDisputeNavigationPending) 'Current privacy scope changed'
Require (-not $Privacy.all13Complete -and -not $Privacy.globalComplete) 'Whole-project scope incorrectly completed'
Require (-not $Fixture.linkedHandlerNavigation.pending -and -not $Fixture.linkedHandlerNavigation.detailHidden -and $Fixture.linkedHandlerNavigation.evidenceVisible -and $Fixture.linkedHandlerNavigation.fileVisible) 'Unified handler reads missing'
Require (@($Fixture.linkedUiDeniedRequests).Count -eq 0 -and $Fixture.screenshots.Count -eq 6) 'Current UI verification missing'
$Scope=Read-Json 'd4-dispute-scope-20261006-r3/result.json';$Hr=Read-Json 'd4-hr-checks-20261006-r4/result.json'
Require ($Scope.passed -and $Scope.inputChanges -eq 0 -and $Hr.passed -and $Hr.compiledSources.Count -eq 11 -and -not $Hr.allHrChecks) 'Focused test scope changed'
Require ((Get-Content -LiteralPath (Join-Path $Evidence 'd4-dispute-scope-20261006-r3/live.log') -Raw) -match 'D4_DISPUTE_SCOPE: checks=125; failed=0; fixtures_rolled_back=true') 'Database boundary proof missing'
Require ((Get-Content -LiteralPath (Join-Path $Evidence 'd4-dispute-scope-r3-launch.log') -Raw) -match 'D4_DISPUTE_SCOPE_SCRATCH_REMOVED=true') 'Scratch cleanup missing'
Require ((Get-Content -LiteralPath (Join-Path $Evidence 'd4-hr-checks-20261006-r4/live.log') -Raw) -match 'PASS: 113 HR rule boundary checks') 'HR rule proof missing'
$Counter=1012;$Images=0;$Originals=0
foreach($Number in 4..7){
    $Folder="d4-privacy-20261006-r$Number";$Result=Read-Json "$Folder/result.json";$Sample=Read-Json "$Folder/fixture.json";$Inputs=@(Read-Json "$Folder/inputs.json")
    foreach($Name in @('result.json','fixture.json','inputs.json','requests.json')){Keep "$Folder/$Name"}
    if($Number -eq 4){Require (-not $Result.passed -and $Result.requests -eq 0 -and $Sample.employees.Count -eq 0 -and $Sample.grievances.Count -eq 0) 'R4 failed before business work'}
    else{Require ($Result.preservation -and $Result.restoration -and $Result.secrets) 'Privacy round was not restored'}
    Require (@($Sample.employees|Where-Object bound).Count -eq 0) 'Employee binding remains'
    Require (@($Sample.grievances|Where-Object {$_.status -notin @('ESCALATED','CLOSED','WITHDRAWN')}).Count -eq 0) 'Grievance not terminal'
    foreach($Original in @(Get-ChildItem -LiteralPath (Join-Path $Evidence $Folder) -Filter 'original-*' -File)){
        $Name=$Original.Name.Substring('original-'.Length);$Match=@($Inputs|Where-Object {(Split-Path -Leaf $_.Path) -ceq $Name})
        Require ($Match.Count -eq 1 -and (Get-FileHash -LiteralPath $Original.FullName).Hash -eq $Match[0].Hash) 'Privacy execution original changed'
        Keep "$Folder/$($Original.Name)";$Originals++
    }
    $Screenshots=@($Sample.screenshots);if(Test-Path -LiteralPath (Join-Path $Evidence "$Folder/failure.png")){$Screenshots+='failure.png'}
    foreach($Image in $Screenshots){Require ((Get-Item -LiteralPath (Join-Path $Evidence "$Folder/$Image")).Length -gt 1000) 'Screenshot missing';Keep "$Folder/$Image";$Images++}
    $Launch="d4-privacy-r$Number-launch.log";$Text=Get-Content -LiteralPath (Join-Path $Evidence $Launch) -Raw
    Require ($Text -match 'OWNED_CAPTCHA_RESTORED: original_limit=100; original_ttl=-1; counter_before=(\d+); counter_after=(\d+); counter_writes=0; database_unchanged=true; production_modified=false') 'Captcha restoration missing'
    Require ([int]$Matches[1] -eq $Counter) 'Captcha chain changed';$Counter=[int]$Matches[2]
    Keep $Launch;Keep "owned-captcha-d4-privacy-20261006-r$Number.json"
}
Require ($Counter -eq 1035 -and $Images -eq 17 -and $Originals -eq 28) 'Privacy evidence counts changed'
foreach($Kind in @(@{Name='dispute-scope';Rounds=1..3},@{Name='hr-checks';Rounds=1..4})){
    foreach($Number in $Kind.Rounds){
        $Folder="d4-$($Kind.Name)-20261006-r$Number";$Inputs=@(Read-Json "$Folder/inputs.json");Keep "$Folder/inputs.json"
        foreach($Original in @(Get-ChildItem -LiteralPath (Join-Path $Evidence $Folder) -Filter 'original-*' -File)){
            $Name=$Original.Name.Substring('original-'.Length);$Match=@($Inputs|Where-Object {(Split-Path -Leaf $_.Path) -ceq $Name})
            Require ($Match.Count -eq 1 -and (Get-FileHash -LiteralPath $Original.FullName).Hash -eq $Match[0].Hash) 'Focused execution original changed'
            Keep "$Folder/$($Original.Name)";$Originals++
        }
    }
}
foreach($File in @('d4-dispute-scope-20261006-r3/result.json','d4-dispute-scope-20261006-r3/live.log','d4-dispute-scope-r3-launch.log',
    'd4-hr-checks-20261006-r4/result.json','d4-hr-checks-20261006-r4/live.log','d4-dispute-hr-checks-r4-launch.log',
    'd4-dispute-backend-r109-launch.log','d4-dispute-frontend-r68-launch.log','d4-dispute-reload-b109-launch.log',
    'd4-dispute-hr-compile-b109-launch.err','d4-hr-checks-20261006-r2/compile.log','d2-month-read-reuse-reload-20261005-r109/result.json')){Keep $File}
$RelatedFile='h3-portal-finance-adjacent-20261002-r127/summary.log';$Related=Get-Content -LiteralPath (Join-Path $Evidence $RelatedFile) -Raw
Require ($Related -match 'H3_FINANCE_ADJACENT: files=(\d+); changed=0; exit=0; production_modified=false') 'Related R127 not complete';$RelatedInputs=[int]$Matches[1];Keep $RelatedFile
$State=Get-Content -LiteralPath (Join-Path $Run 'state.json') -Raw|ConvertFrom-Json
Require ($State.status -eq 'RUNNING' -and [IO.Path]::GetFullPath($State.run) -eq $Run) 'Owned runtime mismatch'
foreach($Entry in $State.processes){$Observed=Get-CimInstance Win32_Process -Filter "ProcessId=$($Entry.id)";Require ($Observed -and $Observed.CommandLine.Contains($Entry.marker)) 'Owned process mismatch'}
$Healthy=0;foreach($Service in $State.services){Require ((Invoke-RestMethod "http://127.0.0.1:$($Service.healthPort)/actuator/health" -TimeoutSec 5).status -eq 'UP') 'Service unhealthy';$Healthy++}
$Summary=[pscustomobject]@{passed=$true;backend='r109';frontend='r68';privacyRound='r7';privacyChecks=$Privacy.checks.Count;privacyRequests=$Privacy.requests;privacyMatrixCases=$Privacy.matrixCases;databaseChecks=125;hrRuleChecks=113;currentInputs=$Current.Count;reviewedProductChanges=$Changed;originalScripts=$Originals;newImages=$Images;currentImages=6;artifacts=@($Artifacts.ToArray());relatedRound='r127';relatedInputs=$RelatedInputs;processes=$State.processes.Count;healthyServices=$Healthy;captchaBefore=1012;captchaAfter=$Counter;priorD3Accepted=17;priorD3PolicyPending=1;priorD3EvidenceHistorical=$true;allD3Reexecuted=$false;handlerDisputeNavigationPending=$false;reportHash=(Get-FileHash -LiteralPath $PSCommandPath).Hash;all13Complete=$false;globalComplete=$false;remaining=$Privacy.remaining}
$Summary|Add-Member -NotePropertyName reportCorrection -NotePropertyValue $ReportCorrection
$Summary|ConvertTo-Json -Depth 6|Set-Content -LiteralPath $Output -Encoding utf8NoBOM
"D4_DISPUTE_READ_STAGE: checks=$($Privacy.checks.Count); inputs=$($Current.Count); product_changes=$($Changed.Count); originals=$Originals; new_images=$Images; adjacent=$RelatedInputs; healthy=$Healthy; handler_dispute_navigation_pending=false; all13_complete=false; global_complete=false"
