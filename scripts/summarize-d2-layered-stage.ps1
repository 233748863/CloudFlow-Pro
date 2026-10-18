param([ValidatePattern('^r[1-9][0-9]*$')][string]$Round='r1',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$PayrollRound='r5',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$AdjacentRound='r133')
$ErrorActionPreference='Stop'
. 'D:\CloudFlowPro\.cloudflow-runtime\use-data-drive.ps1'
$Root='D:\CloudFlowPro'
$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
$Report=Join-Path $Evidence "d2-layered-stage-20261006-$Round.json"
if(Test-Path -LiteralPath $Report){throw 'Retain original layered stage report'}
function Require([bool]$Value,[string]$Message){if(-not $Value){throw $Message}}
function Read-Json([string]$Path){Get-Content -LiteralPath (Join-Path $Evidence $Path) -Raw|ConvertFrom-Json}
$Inputs=@{}
foreach($Path in @('d2-current-first-20261006-r6/inputs.json','d2-current-first-20261006-r6/layered-runtime-inputs.json','d2-leave-attendance-20261005-r19/inputs.json',"d3-official-tax-20261006-$PayrollRound/inputs.json","h3-portal-finance-adjacent-20261002-$AdjacentRound/inputs.json")){
    foreach($Item in @(Read-Json $Path)){
        $File=if([IO.Path]::IsPathRooted($Item.Path)){$Item.Path}else{Join-Path $Root $Item.Path}
        $File=[IO.Path]::GetFullPath($File)
        Require (-not $Inputs.ContainsKey($File) -or $Inputs[$File] -eq $Item.Hash) 'Layered current input hashes conflict'
        $Inputs[$File]=$Item.Hash
    }
}
foreach($File in $Inputs.Keys){Require ((Get-FileHash -LiteralPath $File).Hash -eq $Inputs[$File]) 'Current layered stage input changed'}
$Launch=Read-Json 'd2-current-first-20261006-r6/measurement-result.json'
$Direct=Read-Json 'd2-leave-attendance-20261005-r19/result.json'
Require ($Launch.Passed -and $Launch.Layered -and $Launch.ExecutablePackages -and $Launch.BackendRound -eq 'r114' -and $Launch.FrontendRound -eq 'r72' -and $Launch.HrReloadedLast -and $Launch.RuntimeInputs -eq 6381 -and $Launch.RuntimeInputChanges -eq 0 -and -not $Launch.Profiling) 'Layered ordinary launch incomplete'
Require ($Direct.passed -and $Direct.correctness -and $Direct.preservation -and $Direct.restoration -and $Direct.secrets -and -not $Direct.profiling -and $Direct.checks.Count -eq 37 -and $Direct.requests -eq 4 -and $Direct.measurements.Count -eq 4) 'Layered ordinary business verification incomplete'
$Performance=@($Direct.measurements|Where-Object{$_.milliseconds -ge 500 -or -not $_.meets500ms}).Count -eq 0
Require ($Direct.performanceMet -eq $Performance -and $Launch.PerformanceMet -eq $Performance) 'Ordinary performance result differs from observations'
$Artifacts=Read-Json 'd2-layered-artifact-checks-20261006-r1/result.json'
Require ($Artifacts.Passed -and $Artifacts.Checks.Count -eq 9 -and -not $Artifacts.ServiceRestarted -and -not $Artifacts.ProductModified -and $Artifacts.BusinessRequests -eq 0 -and $Artifacts.HelperHash -eq (Get-FileHash -LiteralPath (Join-Path $Root 'scripts/owned-layered-artifact.ps1')).Hash) 'Layered extraction boundary checks differ'
foreach($Name in @('verify-d2-leave-attendance.mjs','run-d2-leave-attendance.ps1','run-d2-leave-attendance-allowance.mjs')){Require ((Get-FileHash -LiteralPath (Join-Path $Root ('scripts/'+$Name))).Hash -eq (Get-FileHash -LiteralPath (Join-Path $Evidence ('d2-leave-attendance-20261005-r19/original-'+$Name))).Hash) 'Ordinary execution original differs'}
$Payroll=Read-Json "d3-official-tax-20261006-$PayrollRound/result.json"
foreach($Property in @('passed','boundaries','rounding','threshold','cumulative','zeroIncome','yearReset','activation','snapshots','browser','preservation','restoration','secrets','officialTaxPolicyVerified')){Require ($Payroll.$Property -eq $true) "Layered payroll evidence incomplete: $Property"}
Require ($Payroll.officialPolicyYear -eq 2026 -and $Payroll.cases -eq 25 -and $Payroll.slips -eq 29 -and $Payroll.tasks -eq 5 -and $Payroll.checks -contains 'new_profile_allowances_encrypted') 'Layered real payroll scope differs'
$Pictures=@(Get-ChildItem -LiteralPath (Join-Path $Evidence "d3-official-tax-20261006-$PayrollRound") -Filter '*-main-page.png' -File)
Require ($Pictures.Count -eq 3) 'Three actual payroll captures required'
$Adjacent=Get-Content -LiteralPath (Join-Path $Evidence "h3-portal-finance-adjacent-20261002-$AdjacentRound/summary.log") -Raw
Require ($Adjacent -match 'H3_FINANCE_ADJACENT: files=(\d+); changed=0; exit=0; production_modified=false') 'Current adjacent regression incomplete'
$AdjacentInputs=[int]$Matches[1]
$Packages=Read-Json 'backend-executable-verification-20261006-r5/result.json'
Require ($Packages.Passed -and $Packages.BackendRound -eq 'r114' -and $Packages.Services.Count -eq 6) 'Original executable packages incomplete'
$State=Get-Content -LiteralPath (Join-Path $Root '.cloudflow-runtime/batch-g-integration/9799534e1a3a47b5958330f14ae16dc7/state.json') -Raw|ConvertFrom-Json
Require ($State.status -eq 'RUNNING' -and $State.processes.Count -eq 9 -and $State.services.Count -eq 6) 'Original owned environment incomplete'
foreach($Owned in $State.processes){$Observed=Get-CimInstance Win32_Process -Filter "ProcessId=$($Owned.id)";Require ($Observed -and $Observed.CommandLine.Contains($Owned.marker)) 'Current process ownership differs'}
$Files=0
foreach($Service in $State.services){
    $Loaded=@($Launch.Services|Where-Object Name -EQ $Service.name);$Owned=@($State.processes|Where-Object name -EQ $Service.name)
    Require ($Loaded.Count -eq 1 -and $Owned.Count -eq 1 -and $Loaded[0].Pid -eq $Owned[0].id) 'Service changed since ordinary layered run'
    Require ((Invoke-RestMethod -Uri "http://127.0.0.1:$($Service.healthPort)/actuator/health" -TimeoutSec 5).status -eq 'UP') 'Current layered service unhealthy'
    $Proof=Read-Json ('d2-current-first-20261006-r6/'+$Service.name+'-layered-original.json')
    $Package=@($Packages.Services|Where-Object Name -EQ $Service.name)
    Require ($Package.Count -eq 1 -and $Proof.PackageHash -eq $Package[0].Hash) 'Layered proof differs from verified original package'
    Require ((Get-FileHash -LiteralPath (Join-Path $Root $Package[0].Path)).Hash -eq $Proof.PackageHash) 'Current build package changed'
    $Arguments=@(Get-Content -LiteralPath (Join-Path $State.run ($Service.name+'/service.args')))
    $Indices=@(0..($Arguments.Count-1)|Where-Object{$Arguments[$_] -eq '-cp'})
    Require ($Indices.Count -eq 1 -and $Indices[0]+2 -lt $Arguments.Count -and $Arguments[$Indices[0]+2] -eq 'org.springframework.boot.loader.launch.JarLauncher' -and [IO.Path]::GetFullPath($Arguments[$Indices[0]+1].Trim('"')) -eq $Proof.Path) 'Actual layered launch differs'
    $Files+=$Proof.Files.Count
}
Require ($Files -eq 6381) 'Layered byte manifest count differs'
$Diagnostic=Read-Json 'd2-cold-first-profile-20261005-r5/analysis-r1/result.json'
Require ($Diagnostic.Passed -and $Diagnostic.ProfilesStopped -and -not $Diagnostic.OrdinaryPerformanceAcceptance -and $Diagnostic.BusinessReexecuted -eq $false) 'Earlier diagnostic boundary differs'
$EvidencePaths=@('d2-current-first-20261006-r6/measurement-result.json','d2-leave-attendance-20261005-r19/result.json','d2-layered-artifact-checks-20261006-r1/result.json',"d3-official-tax-20261006-$PayrollRound/result.json",'d2-cold-first-profile-20261005-r5/analysis-r1/result.json',"h3-portal-finance-adjacent-20261002-$AdjacentRound/summary.log")
$Hashes=@($EvidencePaths|ForEach-Object{[pscustomobject]@{Path=$_;Hash=(Get-FileHash -LiteralPath (Join-Path $Evidence $_)).Hash}})+@($Pictures|ForEach-Object{[pscustomobject]@{Path=[IO.Path]::GetRelativePath($Evidence,$_.FullName);Hash=(Get-FileHash -LiteralPath $_.FullName).Hash}})
[pscustomobject]@{Passed=$true;Backend='r114';Frontend='r72';Inputs=$Inputs.Count;InputChanges=0;LayeredFiles=$Files;OriginalPackageBytesVerified=$true;ArtifactChecks=9;OrdinaryAttendanceChecks=37;OrdinaryMeasurements=@($Direct.measurements);PerformanceMet=$Performance;PayrollRound=$PayrollRound;PayrollChecks=$Payroll.checks.Count;PayrollFindings=$Payroll.findings.Count;PayrollPictures=$Pictures.Count;AdjacentRound=$AdjacentRound;AdjacentInputs=$AdjacentInputs;Processes=9;HealthyServices=6;Evidence=$Hashes;ProductModified=$false;DockerImageExecuted=$false;SingleJarOrdinaryReference='r17';HistoricalD3All18Version='r113/f72';AllD3TestsReexecuted=$false;D2All17Complete=$false;GlobalComplete=$false}|ConvertTo-Json -Depth 7|Set-Content -LiteralPath $Report -Encoding utf8NoBOM
"D2_LAYERED_STAGE: inputs=$($Inputs.Count); layered_files=$Files; artifact_checks=9; attendance=37; performance_met=$Performance; payroll_checks=$($Payroll.checks.Count); payroll_findings=$($Payroll.findings.Count); adjacent=$AdjacentInputs; processes=9; healthy=6; global_complete=false"
