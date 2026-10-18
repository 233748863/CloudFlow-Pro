param([ValidatePattern('^r[1-9][0-9]*$')][string]$Round='r1',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$PackageRound='r10',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$BackendRound='r119')
$ErrorActionPreference='Stop'
. 'D:\CloudFlowPro\.cloudflow-runtime\use-data-drive.ps1'
$Root='D:\CloudFlowPro'
$Run=Join-Path $Root '.cloudflow-runtime/batch-g-integration/9799534e1a3a47b5958330f14ae16dc7'
$StatePath=Join-Path $Run 'state.json'
$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
$Output=Join-Path $Evidence "e1-reminder-deployment-20261007-$Round"
if(Test-Path -LiteralPath $Output){throw 'Retain original reminder deployment evidence'}
$PackageFile=Join-Path $Evidence "backend-executable-verification-20261006-$PackageRound/result.json"
$Packages=Get-Content -LiteralPath $PackageFile -Raw|ConvertFrom-Json
if(-not $Packages.Passed -or $Packages.BackendRound -ne $BackendRound -or $Packages.Services.Count -ne 6){throw 'Current six verified packages required'}
[IO.Directory]::CreateDirectory($Output)|Out-Null
$Inputs=@(Get-Content -LiteralPath (Join-Path $Evidence "h3-portal-finance-20261002-backend-$BackendRound-inputs.json") -Raw|ConvertFrom-Json)
foreach($File in @($PSCommandPath,(Join-Path $Root 'scripts/restart-isolated-integration-service.ps1'),(Join-Path $Root 'scripts/owned-layered-artifact.ps1'),$PackageFile)){
    $Inputs+=[pscustomobject]@{Path=$File;Hash=(Get-FileHash -LiteralPath $File).Hash}
    $Original=Join-Path $Output ('originals/'+[IO.Path]::GetRelativePath($Root,$File))
    [IO.Directory]::CreateDirectory((Split-Path -Parent $Original))|Out-Null
    [IO.File]::Copy($File,$Original,$false)
}
function Assert-Inputs{foreach($Item in $Inputs){$File=if([IO.Path]::IsPathRooted($Item.Path)){$Item.Path}else{Join-Path $Root $Item.Path};if((Get-FileHash -LiteralPath $File).Hash -ne $Item.Hash){throw 'Deployment input changed'}}}
Assert-Inputs
$Inputs|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $Output 'inputs.json') -Encoding utf8NoBOM
$Deployments=@()
foreach($Package in $Packages.Services){
    $Jar=Join-Path $Root $Package.Path
    if((Get-FileHash -LiteralPath $Jar).Hash -ne $Package.Hash){throw 'Package changed before restart'}
    $Name=$Package.Name
    $Log=Join-Path $Output ($Name+'.log')
    $Process=Start-Process -FilePath (Get-Process -Id $PID).Path -ArgumentList @('-NoLogo','-NoProfile','-File','scripts/restart-isolated-integration-service.ps1','-StatePath',$StatePath,'-ServiceName',$Name,'-ExecutableJar',$Jar,'-Layered') -WorkingDirectory $Root -WindowStyle Hidden -RedirectStandardOutput $Log -RedirectStandardError ($Log+'.err') -PassThru
    $Process.WaitForExit();$Process.Refresh()
    if($Process.ExitCode -ne 0){throw 'Owned reminder service restart failed; retain diagnostics'}
    $Arguments=@(Get-Content -LiteralPath (Join-Path $Run "$Name/service.args"))
    $Index=[Array]::IndexOf($Arguments,'-cp')
    $Expected=Join-Path $Run ("$Name/artifacts/"+$Package.Hash.ToLowerInvariant()+'-layered')
    if($Index -lt 0 -or [IO.Path]::GetFullPath($Arguments[$Index+1].Trim('"')) -ne $Expected -or $Arguments[$Index+2] -ne 'org.springframework.boot.loader.launch.JarLauncher'){throw 'Deployed package differs'}
    $Deployments+=[pscustomobject]@{Service=$Name;PackageHash=$Package.Hash;Files=@(Get-ChildItem -LiteralPath $Expected -File -Recurse).Count;Exit=0}
    "E1_REMINDER_DEPLOYED: service=$Name; exit=0; business_warmup=false"
}
$State=Get-Content -LiteralPath $StatePath -Raw|ConvertFrom-Json
if($State.status -ne 'RUNNING' -or $State.processes.Count -ne 9 -or $State.services.Count -ne 6){throw 'Runtime state incomplete'}
foreach($Entry in $State.processes){$Observed=Get-CimInstance Win32_Process -Filter "ProcessId=$($Entry.id)";if($null -eq $Observed -or -not $Observed.CommandLine.Contains($Entry.marker)){throw 'Owned process differs'}}
foreach($Service in $State.services){if((Invoke-RestMethod "http://127.0.0.1:$($Service.healthPort)/actuator/health" -TimeoutSec 15).status -ne 'UP'){throw 'Service unhealthy'}}
Assert-Inputs
[pscustomobject]@{Passed=$true;Backend=$BackendRound;PackageRound=$PackageRound;Inputs=$Inputs.Count;InputChanges=0;Services=$Deployments;RuntimeFiles=($Deployments|Measure-Object -Property Files -Sum).Sum;HealthyServices=6;BusinessWarmup=$false;ProductionModified=$false}|ConvertTo-Json -Depth 5|Set-Content -LiteralPath (Join-Path $Output 'result.json') -Encoding utf8NoBOM
'E1_REMINDER_DEPLOYMENT: services=6; healthy=6; changed=0; production_modified=false'
