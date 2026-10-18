param([ValidatePattern('^r[1-9][0-9]*$')][string]$Round='r1',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$AdjacentRound='r164')
$ErrorActionPreference='Stop'
. 'D:\CloudFlowPro\.cloudflow-runtime\use-data-drive.ps1'
$Root='D:\CloudFlowPro'
$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
$Run=Join-Path $Root '.cloudflow-runtime/batch-g-integration/9799534e1a3a47b5958330f14ae16dc7'
$Core=Join-Path $Evidence 'e1-activity-core-20261007-r3'
$Adjacent=Join-Path $Evidence "h3-portal-finance-adjacent-20261002-$AdjacentRound"
$Output=Join-Path $Evidence "e1-activity-core-stage-20261007-$Round.json"
if(Test-Path -LiteralPath $Output){throw 'Retain original E1 stage evidence'}
$Inputs=@{}
function Require([bool]$Value,[string]$Message){if(-not $Value){throw $Message}}
function Read-Json([string]$File){Get-Content -LiteralPath $File -Raw|ConvertFrom-Json}
function Track([string]$File,[string]$Expected=''){
    $Full=[IO.Path]::GetFullPath($File)
    $Hash=(Get-FileHash -LiteralPath $Full).Hash
    if($Expected){Require ($Hash -eq $Expected) 'Recorded input changed'}
    if($Inputs.ContainsKey($Full)){Require ($Inputs[$Full] -eq $Hash) 'Conflicting input'}
    $Inputs[$Full]=$Hash
}
foreach($File in @((Join-Path $Core 'inputs.json'),(Join-Path $Adjacent 'inputs.json'))){
    foreach($Entry in @(Read-Json $File)){Track (Join-Path $Root $Entry.Path) $Entry.Hash}
    Track $File
}
$Execution=Read-Json (Join-Path $Core 'execution.json')
$Result=Read-Json (Join-Path $Core 'result.json')
Require ($Execution.Exit -eq 0 -and $Execution.Backend -eq 'r118' -and $Execution.Frontend -eq 'r78' -and $Execution.InputChanges -eq 0) 'E1 execution incomplete'
Require ($Result.passed -and $Result.core -and $Result.mobileWorkspace -and $Result.mobileDirect -and $Result.desktopDeepLink -and $Result.preservation -and $Result.secrets) 'E1 core or mobile evidence incomplete'
Require ($Result.checks.Count -eq 138 -and $Result.requests.Count -eq 71 -and $Result.uiRequests.Count -eq 185) 'E1 result count differs'
Require ($Result.secretScan.leaks -eq 0 -and $Result.secretScan.files -eq 53) 'E1 secret scan incomplete'
Require (-not $Result.allAcceptanceComplete) 'Do not promote core verification to complete E1 acceptance'
$UiFailures=@($Result.uiRequests|Where-Object status -ge 400)
Require ($UiFailures.Count -eq 4 -and @($UiFailures|Where-Object{$_.path -eq '/api/oa/invoice/list' -and $_.status -eq 403}).Count -eq 2 -and @($UiFailures|Where-Object{$_.path -match '^/api/crm/activity/[0-9]+$' -and $_.status -eq 400}).Count -eq 2) 'Unexpected UI failure boundary'
foreach($Name in @('inputs.json','execution.json','result.json','live.log')){Track (Join-Path $Core $Name)}
$Originals=@(Get-ChildItem -LiteralPath (Join-Path $Core 'originals') -File -Recurse)
Require ($Originals.Count -eq 7) 'E1 originals incomplete'
foreach($File in $Originals){
    $Relative=[IO.Path]::GetRelativePath((Join-Path $Core 'originals'),$File.FullName)
    Track $File.FullName (Get-FileHash -LiteralPath (Join-Path $Root $Relative)).Hash
}
$Images=@('mobile-workspace-completed.png','mobile-direct-entry.png','mobile-320-direct-completed.png','mobile-320-list.png','desktop-direct-entry.png')
foreach($Name in $Images){Track (Join-Path $Core $Name)}
$Build=Get-Content -LiteralPath (Join-Path $Evidence 'h3-portal-finance-20261002-frontend-r78.log') -Raw
Require ($Build.Contains('FINANCE_BUILD: phase=Frontend; files=1481; changed=0; exit=0')) 'Frontend build incomplete'
Track (Join-Path $Evidence 'h3-portal-finance-20261002-frontend-r78.log')
$Old=@(Read-Json (Join-Path $Evidence 'h3-portal-finance-20261002-frontend-r76-inputs.json'))
$Changed=@($Old|Where-Object{(Get-FileHash -LiteralPath (Join-Path $Root $_.Path)).Hash -ne $_.Hash})
Require ($Changed.Count -eq 2 -and @($Changed|Where-Object{$_.Path.Replace('\','/') -notin @('cloudflow-frontend/src/router.tsx','cloudflow-frontend/src/pages/CrmActivityPage.tsx')}).Count -eq 0) 'Unexpected product changes since F76'
$Allowance=Get-Content -LiteralPath (Join-Path $Evidence 'e1-activity-core-20261007-r3-launch.log') -Raw
Require ($Allowance.Contains('counter_before=1432; counter_after=1437; counter_writes=0; database_unchanged=true; production_modified=false')) 'Captcha restoration incomplete'
Track (Join-Path $Evidence 'e1-activity-core-20261007-r3-launch.log')
$Summary=Get-Content (Join-Path $Adjacent 'summary.log') -Raw
Require ($Summary.Contains('changed=0; exit=0; production_modified=false')) 'Adjacent summary incomplete'
$Oa=Get-Content (Join-Path $Adjacent 'oa-database.log') -Raw
Require ($Oa.Contains('Complete approved schema table count; expected=374; actual=374') -and $Oa.Contains('PASS: 1012 OA boundary assertions')) 'Database regression incomplete'
$Menu=Get-Content (Join-Path $Adjacent 'menu.log') -Raw
Require ($Menu.Contains('EMPLOYEE_UNEXPECTED_GRANTS=0; EMPLOYEE_UNEXPECTED_WRITE_PERMISSIONS=0')) 'Menu permission regression incomplete'
foreach($Name in @('summary.log','oa-database.log','menu.log')){Track (Join-Path $Adjacent $Name)}
$State=Read-Json (Join-Path $Run 'state.json')
Require ($State.status -eq 'RUNNING' -and $State.processes.Count -eq 9 -and $State.services.Count -eq 6) 'Owned runtime incomplete'
foreach($Entry in $State.processes){$P=Get-CimInstance Win32_Process -Filter "ProcessId=$($Entry.id)";Require ($null -ne $P -and $P.CommandLine.Contains($Entry.marker)) 'Owned process changed'}
$RuntimeFiles=0
foreach($Service in $State.services){
    $Arguments=@(Get-Content (Join-Path $Run "$($Service.name)/service.args"))
    $Index=[Array]::IndexOf($Arguments,'-cp')
    Require ($Index -ge 0 -and $Arguments[$Index+2] -eq 'org.springframework.boot.loader.launch.JarLauncher') 'Layered launch changed'
    $Layer=[IO.Path]::GetFullPath($Arguments[$Index+1].Trim('"'))
    Require ((Split-Path -Parent $Layer) -eq (Join-Path $Run "$($Service.name)/artifacts")) 'Layer outside owned fixture'
    foreach($File in Get-ChildItem -LiteralPath $Layer -Recurse -File){Require ($Inputs.ContainsKey($File.FullName)) 'Untracked runtime file';$RuntimeFiles++}
    Require ((Invoke-RestMethod "http://127.0.0.1:$($Service.healthPort)/actuator/health" -TimeoutSec 15).status -eq 'UP') 'Service unhealthy'
}
Require ($RuntimeFiles -eq 6381 -and $RuntimeFiles -eq $Execution.RuntimeFiles) 'Runtime file count differs'
foreach($File in $Inputs.Keys){Require ((Get-FileHash -LiteralPath $File).Hash -eq $Inputs[$File]) 'Current stage input changed'}
$Inputs.Keys|Sort-Object|ForEach-Object{[pscustomobject]@{Path=$_;Hash=$Inputs[$_]}}|ConvertTo-Json|Set-Content -LiteralPath $Output.Replace('.json','-inputs.json') -Encoding utf8NoBOM
[pscustomobject]@{Passed=$true;Backend='r118';Frontend='r78';Checks=138;ScriptRequests=71;UiRequests=185;OriginalFiles=7;CurrentInputs=$Inputs.Count;RuntimeFiles=$RuntimeFiles;InputChanges=0;Images=5;HealthyServices=6;Adjacent=$AdjacentRound;KnownWorkspaceInvoiceRejections=2;ExpectedActivityRejections=2;AllE1AcceptanceComplete=$false;GlobalComplete=$false}|ConvertTo-Json|Set-Content -LiteralPath $Output -Encoding utf8NoBOM
"E1_ACTIVITY_CORE_STAGE: inputs=$($Inputs.Count); runtime_files=$RuntimeFiles; checks=138; script_requests=71; ui_requests=185; healthy=6; all_e1_complete=false; global_complete=false"
