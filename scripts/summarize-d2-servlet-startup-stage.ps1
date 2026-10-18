param([ValidatePattern('^r[1-9][0-9]*$')][string]$Round='r1',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$AdjacentRound='r162')
$ErrorActionPreference='Stop'
. 'D:\CloudFlowPro\.cloudflow-runtime\use-data-drive.ps1'
$Root='D:\CloudFlowPro'
$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
$Run=Join-Path $Root '.cloudflow-runtime/batch-g-integration/9799534e1a3a47b5958330f14ae16dc7'
$Output=Join-Path $Evidence "d2-servlet-startup-stage-20261007-$Round.json"
if(Test-Path -LiteralPath $Output){throw 'Retain previous startup stage'}
function Require([bool]$Value,[string]$Message){if(-not $Value){throw $Message}}
function Read-Json([string]$File){Get-Content -LiteralPath $File -Raw|ConvertFrom-Json}
$Inputs=@{}
function Track([string]$File,[string]$Hash){
    $Path=[IO.Path]::GetFullPath($File,$Root)
    Require ($Path.StartsWith($Root+'\',[StringComparison]::OrdinalIgnoreCase)) 'Input outside owned workspace'
    if(-not $Hash){$Hash=(Get-FileHash -LiteralPath $Path).Hash}
    Require (-not $Inputs.ContainsKey($Path) -or $Inputs[$Path] -eq $Hash) 'Evidence snapshots conflict'
    $Inputs[$Path]=$Hash
}
function Merge([string]$File){Track $File '';foreach($Item in @(Read-Json $File)){Track $Item.Path $Item.Hash}}
Track $PSCommandPath ''
$First=Join-Path $Evidence 'd2-current-first-20261006-r9'
$Business=Join-Path $Evidence 'd2-leave-attendance-20261005-r24'
$Package=Join-Path $Evidence 'backend-executable-verification-20261006-r8'
$Adjacent=Join-Path $Evidence "h3-portal-finance-adjacent-20261002-$AdjacentRound"
foreach($Directory in @($First,$Business,$Package,$Adjacent)){Merge (Join-Path $Directory 'inputs.json')}
Merge (Join-Path $First 'layered-runtime-inputs.json')
$Measurement=Read-Json (Join-Path $First 'measurement-result.json')
$Actual=Read-Json (Join-Path $Business 'result.json')
Require ($Measurement.Passed -and $Measurement.BusinessPassed -and $Measurement.BackendRound -eq 'r117' -and $Measurement.FrontendRound -eq 'r76' -and $Measurement.HrReloadedLast -and $Measurement.Layered -and -not $Measurement.Profiling -and -not $Measurement.PerformanceMet -and $Measurement.InputChanges -eq 0 -and $Measurement.RuntimeInputChanges -eq 0 -and $Measurement.Services.Count -eq 6 -and @($Measurement.Services|Where-Object Exit -ne 0).Count -eq 0) 'Ordinary first request evidence incomplete'
Require ($Actual.passed -and $Actual.checks.Count -eq 37 -and $Actual.requests -eq 4 -and -not $Actual.profiling -and -not $Actual.performanceMet) 'Business coverage differs'
foreach($Flag in @('correctness','approval','exclusion','fractions','preservation','restoration','secrets')){Require ($Actual.$Flag -eq $true) 'Business protection failed'}
Require (($Actual.measurements.milliseconds -join ',') -eq '585.52,281.24,162.6,359.7') 'Retained measurements differ'
Require (($Actual.measurements|ConvertTo-Json -Depth 4 -Compress) -ceq ($Measurement.Measurements|ConvertTo-Json -Depth 4 -Compress)) 'Measurement copy differs'
foreach($File in @((Join-Path $First 'measurement-result.json'),(Join-Path $Business 'result.json'),(Join-Path $Business 'fixture.json'),(Join-Path $First 'verification-result-original.json'))){Track $File ''}
Require ((Get-FileHash (Join-Path $Business 'result.json')).Hash -eq (Get-FileHash (Join-Path $First 'verification-result-original.json')).Hash) 'Original result copy differs'
$Packages=Read-Json (Join-Path $Package 'result.json')
Require ($Packages.Passed -and $Packages.BackendRound -eq 'r117' -and $Packages.Services.Count -eq 6 -and $Packages.InputChanges -eq 0) 'Six verified packages required'
Track (Join-Path $Package 'result.json') ''
foreach($Item in $Packages.Services){Track $Item.Path $Item.Hash}
$Before=@{}
$BeforeFile=Join-Path $Evidence 'h3-portal-finance-20261002-backend-r116-inputs.json'
Track $BeforeFile ''
foreach($Item in @(Read-Json $BeforeFile)){$Before[$Item.Path]=$Item.Hash}
$AfterFile=Join-Path $Evidence 'h3-portal-finance-20261002-backend-r117-inputs.json'
Track $AfterFile ''
$After=@(Read-Json $AfterFile)
$Changes=@($After|Where-Object{-not $Before.ContainsKey($_.Path) -or $Before[$_.Path] -ne $_.Hash})
$SettingPath='cloudflow-backend\cloudflow-service-hr\src\main\resources\application.yml'
Require ($After.Count -eq $Before.Count -and $Changes.Count -eq 1 -and $Changes[0].Path -eq $SettingPath) 'Only the startup setting may change'
$Prep=Join-Path $Evidence 'd2-servlet-startup-prep-20261007-r1'
$Change=Read-Json (Join-Path $Prep 'changes.json')
Require ($Change.beforeHash -eq $Before[$SettingPath] -and $Change.afterHash -eq $Changes[0].Hash -and $Change.changed -eq 1 -and $Change.added -eq 0 -and $Change.removed -eq 0) 'Startup change audit differs'
Require ((Get-FileHash (Join-Path $Prep 'original-application.yml')).Hash -eq $Before[$SettingPath]) 'Original configuration changed'
foreach($Name in @('original-application.yml','preparation.json','changes.json')){Track (Join-Path $Prep $Name) ''}
# Compare normalized line endings without allowing unrelated configuration changes.
$Current=(Get-Content (Join-Path $Root $SettingPath) -Raw).Replace("`r`n","`n")
$Original=(Get-Content (Join-Path $Prep 'original-application.yml') -Raw).Replace("`r`n","`n")
Require ($Current -ceq $Original.Replace("spring:`n","spring:`n  mvc:`n    servlet:`n      load-on-startup: 1`n")) 'Configuration change exceeds the approved experiment'
$Startup=@()
$LogPath=Join-Path $Run 'hr/stdout.log'
foreach($Line in Get-Content -LiteralPath $LogPath){
    $Kind=if($Line -match 'Initializing Spring DispatcherServlet|Initializing Servlet'){'ServletInitStart'}elseif($Line -match 'Completed initialization in'){'ServletInitComplete'}elseif($Line -match 'Started HrServiceApplication'){'ApplicationStarted'}else{''}
    if($Kind -and $Line -match '^(\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}\.\d{3})'){
        $Startup+=[pscustomobject]@{Kind=$Kind;Time=$Matches[1]}
    }
}
$Started=@($Startup|Where-Object Kind -eq 'ApplicationStarted')
$Initialized=@($Startup|Where-Object Kind -eq 'ServletInitComplete')
Require ($Started.Count -eq 1 -and $Initialized.Count -eq 2 -and [datetime]$Initialized[0].Time -lt [datetime]$Started[0].Time) 'Business servlet must initialize before application readiness'
Require ([datetimeoffset]::new([datetime]$Initialized[-1].Time).ToUnixTimeMilliseconds() -lt $Actual.measurements[0].startedAt) 'Servlet initialization must precede ordinary request'
$Log=Get-Content (Join-Path $Business 'live.log') -Raw
Require ($Log -match 'D2_LEAVE_LOG_SCAN: (\{[^\r\n]+\})') 'Business secret scan missing'
$Scan=$Matches[1]|ConvertFrom-Json
Require ($Scan.files -eq 53 -and $Scan.sensitiveValues -eq 6 -and $Scan.leaks -eq 0) 'Secret scan failed'
Track (Join-Path $Business 'live.log') ''
$Log=Get-Content (Join-Path $First 'verification.log') -Raw
Require ($Log -match 'OWNED_CAPTCHA_RESTORED: original_limit=100; original_ttl=-1; counter_before=(\d+); counter_after=(\d+); counter_writes=0; database_unchanged=true; production_modified=false') 'Captcha restoration missing'
$Captcha=[pscustomobject]@{Before=[int]$Matches[1];After=[int]$Matches[2];Writes=0}
Track (Join-Path $First 'verification.log') ''
Require ((Get-FileHash (Join-Path $First 'original.ps1')).Hash -eq $Inputs[(Join-Path $Root 'scripts/run-d2-current-first.ps1')]) 'Actual launch original changed'
Track (Join-Path $First 'original.ps1') ''
$AdjacentLog=Get-Content (Join-Path $Adjacent 'summary.log') -Raw
Require ($AdjacentLog -match 'H3_FINANCE_ADJACENT: files=(\d+); changed=0; exit=0; production_modified=false' -and $AdjacentLog.Contains('regenerated_matches_formal=true; formal_modified=false')) 'Adjacent checks incomplete'
$Oa=Get-Content (Join-Path $Adjacent 'oa-database.log') -Raw
Require ($Oa.Contains('Complete approved schema table count; expected=374; actual=374') -and $Oa.Contains('PASS: 1012 OA boundary assertions')) 'Database checks incomplete'
$Menu=Get-Content (Join-Path $Adjacent 'menu.log') -Raw
Require ($Menu.Contains('EMPLOYEE_UNEXPECTED_GRANTS=0; EMPLOYEE_UNEXPECTED_WRITE_PERMISSIONS=0') -and $Menu.Contains('APPROVED_MENU_SCOPE_PASS=true')) 'Menu scope check failed'
foreach($Name in @('summary.log','oa-database.log','menu.log')){Track (Join-Path $Adjacent $Name) ''}
foreach($File in $Inputs.Keys){Require ((Get-FileHash -LiteralPath $File).Hash -eq $Inputs[$File]) 'Current input changed'}
$State=Read-Json (Join-Path $Run 'state.json')
Require ($State.status -eq 'RUNNING' -and $State.processes.Count -eq 9 -and $State.services.Count -eq 6) 'Owned runtime incomplete'
foreach($Entry in $State.processes){$Observed=Get-CimInstance Win32_Process -Filter "ProcessId=$($Entry.id)";Require ($Observed -and $Observed.CommandLine.Contains($Entry.marker)) 'Owned process identity differs'}
$LayeredFiles=0
foreach($Service in $State.services){
    $Arguments=@(Get-Content (Join-Path $Run "$($Service.name)/service.args"))
    $Index=[Array]::IndexOf($Arguments,'-cp')
    Require ($Index -ge 0 -and $Arguments[$Index+2] -eq 'org.springframework.boot.loader.launch.JarLauncher') 'Actual layered launch differs'
    $Layer=[IO.Path]::GetFullPath($Arguments[$Index+1].Trim('"'))
    Require ((Split-Path -Parent $Layer) -eq (Join-Path $Run "$($Service.name)/artifacts")) 'Layer outside owned service'
    $Files=@(Get-ChildItem -LiteralPath $Layer -Recurse -Force)
    Require (@($Files|Where-Object{$_.Attributes -band [IO.FileAttributes]::ReparsePoint}).Count -eq 0) 'Layer redirected'
    foreach($File in $Files|Where-Object{-not $_.PSIsContainer}){Require ($Inputs.ContainsKey($File.FullName)) 'Untracked runtime file';$LayeredFiles++}
    Require ((Invoke-RestMethod "http://127.0.0.1:$($Service.healthPort)/actuator/health" -TimeoutSec 15).status -eq 'UP') 'Service unhealthy'
}
Require ($LayeredFiles -eq $Measurement.RuntimeInputs) 'Actual layered file count differs'
$Snapshot=@($Inputs.Keys|Sort-Object|ForEach-Object{[pscustomobject]@{Path=$_;Hash=$Inputs[$_]}})
$Snapshot|ConvertTo-Json|Set-Content -LiteralPath ($Output.Replace('.json','-inputs.json')) -Encoding utf8NoBOM
[pscustomobject]@{Passed=$true;Backend='r117';Frontend='r76';Checks=37;Requests=4;InputChanges=0;CurrentInputs=$Inputs.Count;
    LayeredFiles=$LayeredFiles;ProductChanges=1;StartupSettingRetained=$true;ServletInitializedBeforeReady=$true;Startup=$Startup;
    OrdinaryMilliseconds=@($Actual.measurements.milliseconds);OrdinaryPerformanceMet=$false;StablePerformanceImprovementProven=$false;
    BusinessPreserved=$true;Restored=$true;Captcha=$Captcha;Secrets=$Scan;AdjacentRound=$AdjacentRound;FormalTables=374;OaAssertions=1012;
    OwnedProcesses=9;HealthyServices=6;ActualResultHash=(Get-FileHash (Join-Path $Business 'result.json')).Hash;AllD2Complete=$false;GlobalComplete=$false
}|ConvertTo-Json -Depth 6|Set-Content -LiteralPath $Output -Encoding utf8NoBOM
"D2_SERVLET_STARTUP_STAGE: current_inputs=$($Inputs.Count); layered_files=$LayeredFiles; checks=37; first_ms=585.52; performance_met=false; healthy=6; global_complete=false"
