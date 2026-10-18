param([ValidatePattern('^r[1-9][0-9]*$')][string]$Round='r1')
$ErrorActionPreference='Stop'
. 'D:\CloudFlowPro\.cloudflow-runtime\use-data-drive.ps1'
$Root='D:\CloudFlowPro'
$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
$Run=Join-Path $Root '.cloudflow-runtime/batch-g-integration/9799534e1a3a47b5958330f14ae16dc7'
$Output=Join-Path $Evidence "d4-linked-stage-20261006-$Round.json"
if(Test-Path -LiteralPath $Output){throw 'Retain original linked stage report'}
$Current=@{};$Artifacts=[Collections.Generic.List[object]]::new()
function Require([bool]$Value,[string]$Message){if(-not $Value){throw $Message}}
function Read-Json([string]$File){Get-Content -LiteralPath (Join-Path $Evidence $File) -Raw|ConvertFrom-Json}
function Evidence-Hash([string]$File){
    $Path=Join-Path $Evidence $File;$Before=Get-Item -LiteralPath $Path
    $Length=$Before.Length;$Written=$Before.LastWriteTimeUtc
    $Stream=[IO.File]::Open($Path,[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::ReadWrite)
    try{$Hasher=[Security.Cryptography.SHA256]::Create();try{$Hash=[Convert]::ToHexString($Hasher.ComputeHash($Stream))}finally{$Hasher.Dispose()}}finally{$Stream.Dispose()}
    $After=Get-Item -LiteralPath $Path
    Require ($After.Length -eq $Length -and $After.LastWriteTimeUtc -eq $Written) 'Evidence changed during shared read'
    return $Hash
}
function Keep([string]$File){$Artifacts.Add([pscustomobject]@{Path=$File;Hash=(Evidence-Hash $File)})}
function Verify-Inputs([string]$File){
    foreach($Item in @(Read-Json $File)){
        $Key=$Item.Path.Replace('\','/')
        if(-not $Current.ContainsKey($Key)){$Current[$Key]=(Get-FileHash -LiteralPath (Join-Path $Root $Item.Path)).Hash}
        Require ($Current[$Key] -eq $Item.Hash) "Current execution input changed: $($Item.Path)"
    }
    Keep $File
}
$Prior=Read-Json 'd4-dispute-read-stage-20261006-r2.json'
Require ($Prior.passed -and $Prior.backend -eq 'r109' -and $Prior.frontend -eq 'r68' -and -not $Prior.handlerDisputeNavigationPending -and -not $Prior.globalComplete) 'Prior dispute scope changed'
Require ((Get-FileHash -LiteralPath (Join-Path $Root 'scripts/summarize-d4-dispute-read-stage.ps1')).Hash -eq $Prior.reportHash) 'Prior report source changed'
foreach($Artifact in $Prior.artifacts){Require ((Evidence-Hash $Artifact.Path) -eq $Artifact.Hash) 'Prior evidence changed'}
Keep 'd4-dispute-read-stage-20261006-r2.json'
$Previous=@{};$Changes=[Collections.Generic.List[string]]::new()
foreach($File in @('h3-portal-finance-20261002-backend-r109-inputs.json','h3-portal-finance-20261002-frontend-r68-inputs.json')){
    foreach($Item in @(Read-Json $File)){
        $Key=$Item.Path.Replace('\','/');$Previous[$Key]=$Item.Hash
        if((Get-FileHash -LiteralPath (Join-Path $Root $Item.Path)).Hash -ne $Item.Hash){$Changes.Add($Key)}
    }
    Keep $File
}
foreach($File in @('h3-portal-finance-20261002-backend-r110-inputs.json','h3-portal-finance-20261002-frontend-r70-inputs.json')){
    foreach($Item in @(Read-Json $File)){if(-not $Previous.ContainsKey($Item.Path.Replace('\','/'))){$Changes.Add($Item.Path.Replace('\','/'))}}
}
$Expected=@('cloudflow-backend/cloudflow-service-hr/src/main/java/com/cloudflow/hr/controller/HrPerformanceResourceControllers.java',
    'cloudflow-frontend/src/router.tsx','cloudflow-frontend/src/pages/hr/HrPerformancePage.tsx',
    'cloudflow-frontend/src/pages/hr/HrPerformanceResultPage.tsx','cloudflow-frontend/src/pages/hr/rules/HrGrievancePage.tsx')
Require (@(Compare-Object @($Expected|Sort-Object) @($Changes|Sort-Object)).Count -eq 0) 'Product changes exceeded linked scope'
foreach($File in @('h3-portal-finance-20261002-backend-r110-inputs.json','h3-portal-finance-20261002-frontend-r70-inputs.json',
    'd2-month-read-reuse-reload-20261005-r110/inputs.json','d4-linked-20261006-r3/inputs.json','h3-portal-finance-adjacent-20261002-r128/inputs.json')){Verify-Inputs $File}
$Live=Read-Json 'd4-linked-20261006-r3/result.json';$Fixture=Read-Json 'd4-linked-20261006-r3/fixture.json'
foreach($Flag in @('passed','salary','performance','browser','scope','preservation','restoration','secrets')){Require ($Live.$Flag -eq $true) "Linked evidence missing: $Flag"}
Require ($Live.checks.Count -eq 102 -and $Live.requests -eq 26 -and $Fixture.screenshots.Count -eq 11) 'Linked verification scope changed'
Require (-not $Live.all13Complete -and -not $Live.globalComplete) 'Whole-project scope incorrectly completed'
$Counter=1035;$Images=0;$Originals=0;$EmployeeDigest=$null
foreach($Number in 1..3){
    $Folder="d4-linked-20261006-r$Number";$Result=Read-Json "$Folder/result.json";$Sample=Read-Json "$Folder/fixture.json";$Inputs=@(Read-Json "$Folder/inputs.json")
    Require ($Result.preservation -and $Result.restoration -and $Result.secrets -and -not $Sample.bound) 'Linked round not restored'
    Require ($Sample.employeeId -eq '98209282917' -and $Sample.slipId -eq '98209281550' -and $Sample.resultId -eq '9204') 'Fixture source changed'
    Require ($Sample.grievances.Count -eq 2 -and @($Sample.grievances|Where-Object status -NE 'WITHDRAWN').Count -eq 0) 'Grievance not terminal'
    if($EmployeeDigest){Require ($Sample.employeeBusinessDigest -eq $EmployeeDigest) 'Owned employee business fields changed between rounds'}else{$EmployeeDigest=$Sample.employeeBusinessDigest}
    if($Number -eq 1){Require (-not $Result.passed -and $Result.failure -eq 'desktop_hr_salary_amounts') 'Original R1 failure changed'}else{Require ($Result.passed) 'Successful historical linked round missing'}
    foreach($Name in @('result.json','fixture.json','inputs.json','requests.json','live.log')){Keep "$Folder/$Name"}
    foreach($Original in @(Get-ChildItem -LiteralPath (Join-Path $Evidence $Folder) -Filter 'original-*' -File)){
        $Name=$Original.Name.Substring('original-'.Length);$Match=@($Inputs|Where-Object {(Split-Path -Leaf $_.Path) -ceq $Name})
        Require ($Match.Count -eq 1 -and (Get-FileHash -LiteralPath $Original.FullName).Hash -eq $Match[0].Hash) 'Linked execution original changed'
        Keep "$Folder/$($Original.Name)";$Originals++
    }
    $Screenshots=@($Sample.screenshots);if(Test-Path -LiteralPath (Join-Path $Evidence "$Folder/failure.png")){$Screenshots+='failure.png'}
    foreach($Image in $Screenshots){Require ((Get-Item -LiteralPath (Join-Path $Evidence "$Folder/$Image")).Length -gt 1000) 'Linked screenshot missing';Keep "$Folder/$Image";$Images++}
    $Launch="d4-linked-r$Number-launch.log";$Text=Get-Content -LiteralPath (Join-Path $Evidence $Launch) -Raw
    Require ($Text -match 'OWNED_CAPTCHA_RESTORED: original_limit=100; original_ttl=-1; counter_before=(\d+); counter_after=(\d+); counter_writes=0; database_unchanged=true; production_modified=false') 'Captcha restoration missing'
    Require ([int]$Matches[1] -eq $Counter) 'Captcha chain changed';$Counter=[int]$Matches[2]
    Keep $Launch;Keep "owned-captcha-d4-linked-20261006-r$Number.json"
}
Require ($Counter -eq 1053 -and $Images -eq 21 -and $Originals -eq 21) 'Linked evidence counts changed'
foreach($File in @('d4-linked-backend-r110-launch.log','d4-linked-frontend-r69-launch.log','d4-linked-frontend-r70-launch.log',
    'd4-linked-reload-b110-launch.log','d2-month-read-reuse-reload-20261005-r110/result.json','d4-linked-smtp-renewal-launch.log')){Keep $File}
$RelatedFile='h3-portal-finance-adjacent-20261002-r128/summary.log';$Related=Get-Content -LiteralPath (Join-Path $Evidence $RelatedFile) -Raw
Require ($Related -match 'H3_FINANCE_ADJACENT: files=(\d+); changed=0; exit=0; production_modified=false') 'Related R128 not complete';$RelatedInputs=[int]$Matches[1];Keep $RelatedFile
$State=Get-Content -LiteralPath (Join-Path $Run 'state.json') -Raw|ConvertFrom-Json
Require ($State.status -eq 'RUNNING' -and [IO.Path]::GetFullPath($State.run) -eq $Run) 'Owned runtime mismatch'
foreach($Entry in $State.processes){$Observed=Get-CimInstance Win32_Process -Filter "ProcessId=$($Entry.id)";Require ($Observed -and $Observed.CommandLine.Contains($Entry.marker)) 'Owned process mismatch'}
$Healthy=0;foreach($Service in $State.services){Require ((Invoke-RestMethod "http://127.0.0.1:$($Service.healthPort)/actuator/health" -TimeoutSec 5).status -eq 'UP') 'Service unhealthy';$Healthy++}
$Summary=[pscustomobject]@{passed=$true;backend='r110';frontend='r70';linkedRound='r3';checks=$Live.checks.Count;requests=$Live.requests;currentInputs=$Current.Count;reviewedProductChanges=@($Changes.ToArray());originalScripts=$Originals;newImages=$Images;currentImages=11;artifacts=@($Artifacts.ToArray());relatedRound='r128';relatedInputs=$RelatedInputs;processes=$State.processes.Count;healthyServices=$Healthy;captchaBefore=1035;captchaAfter=$Counter;priorDisputeEvidenceHistorical=$true;allD4CurrentVersionReexecuted=$false;relatedNavigationComplete=$true;reportHash=(Get-FileHash -LiteralPath $PSCommandPath).Hash;all13Complete=$false;globalComplete=$false;remaining=$Live.remaining}
$Summary|ConvertTo-Json -Depth 6|Set-Content -LiteralPath $Output -Encoding utf8NoBOM
"D4_LINKED_STAGE: checks=$($Live.checks.Count); inputs=$($Current.Count); product_changes=$($Changes.Count); originals=$Originals; new_images=$Images; adjacent=$RelatedInputs; healthy=$Healthy; all13_complete=false; global_complete=false"
