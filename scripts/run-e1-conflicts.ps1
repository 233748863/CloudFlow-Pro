param([Parameter(Mandatory=$true)][ValidatePattern('^r[1-9][0-9]*$')][string]$Round,
    [Parameter(Mandatory=$true)][ValidatePattern('^r[1-9][0-9]*$')][string]$BackendRound,
    [Parameter(Mandatory=$true)][ValidatePattern('^r[1-9][0-9]*$')][string]$FrontendRound)
$ErrorActionPreference='Stop'
. 'D:\CloudFlowPro\.cloudflow-runtime\use-data-drive.ps1'
$Root='D:\CloudFlowPro'
$Run=Join-Path $Root '.cloudflow-runtime/batch-g-integration/9799534e1a3a47b5958330f14ae16dc7'
$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
$Output=Join-Path $Evidence "e1-conflicts-20261007-$Round"
if(Test-Path -LiteralPath $Output){throw 'Retain original E1 evidence'}
[IO.Directory]::CreateDirectory($Output)|Out-Null
$State=Get-Content -LiteralPath (Join-Path $Run 'state.json') -Raw|ConvertFrom-Json
function Assert-Runtime {
    if($State.status -ne 'RUNNING' -or [IO.Path]::GetFullPath($State.run) -ne $Run -or $State.processes.Count -ne 9 -or $State.services.Count -ne 6){throw 'Owned runtime required'}
    foreach($Entry in $State.processes){
        $Observed=Get-CimInstance Win32_Process -Filter "ProcessId=$($Entry.id)"
        if($null -eq $Observed -or -not $Observed.CommandLine.Contains($Entry.marker)){throw 'Owned process identity differs'}
    }
    foreach($Service in $State.services){if((Invoke-RestMethod "http://127.0.0.1:$($Service.healthPort)/actuator/health" -TimeoutSec 15).status -ne 'UP'){throw 'Service unhealthy'}}
}
Assert-Runtime
$Inputs=@()
foreach($Build in @("backend-$BackendRound","frontend-$FrontendRound")){
    $Inputs+=@(Get-Content -LiteralPath (Join-Path $Evidence "h3-portal-finance-20261002-$Build-inputs.json") -Raw|ConvertFrom-Json)
}
$Scripts=@('scripts/run-e1-conflicts.ps1','scripts/verify-e1-conflicts.mjs','scripts/runtime-checks/e1-activity-runtime.mjs',
    'scripts/runtime-checks/e1-activity-browser-auth.mjs','scripts/run-e1-conflicts-allowance.mjs','scripts/owned-gateway-redis.mjs','scripts/portal-checks/scan-access-logs.mjs')
$Paths=@($Scripts)
$RuntimeFiles=0
foreach($Service in $State.services){
    $Paths+=[IO.Path]::GetRelativePath($Root,(Join-Path $Run "$($Service.name)/service.args"))
    $Paths+=[IO.Path]::GetRelativePath($Root,(Join-Path $Run "$($Service.name)/integration.properties"))
    $Arguments=@(Get-Content (Join-Path $Run "$($Service.name)/service.args"))
    $Index=[Array]::IndexOf($Arguments,'-cp')
    if($Index -lt 0 -or $Arguments[$Index+2] -ne 'org.springframework.boot.loader.launch.JarLauncher'){throw 'Owned layered launch required'}
    $Layer=[IO.Path]::GetFullPath($Arguments[$Index+1].Trim('"'))
    if((Split-Path -Parent $Layer) -ne (Join-Path $Run "$($Service.name)/artifacts")){throw 'Layer outside owned fixture'}
    $Files=@(Get-ChildItem -LiteralPath $Layer -Recurse -Force)
    if(@($Files|Where-Object{$_.Attributes -band [IO.FileAttributes]::ReparsePoint}).Count){throw 'Layer redirected'}
    foreach($File in $Files|Where-Object{-not $_.PSIsContainer}){$Paths+=[IO.Path]::GetRelativePath($Root,$File.FullName);$RuntimeFiles++}
    foreach($Setting in @(Get-Content (Join-Path $Run "$($Service.name)/integration.properties")|Where-Object{$_ -like 'spring.redis.redisson.file=file:*'})){
        $Config=[IO.Path]::GetFullPath($Setting.Substring('spring.redis.redisson.file=file:'.Length))
        if(-not $Config.StartsWith($Run+'\private\',[StringComparison]::OrdinalIgnoreCase)){throw 'Owned Redis configuration required'}
        $Paths+=[IO.Path]::GetRelativePath($Root,$Config)
    }
}
foreach($File in ($Paths|Sort-Object -Unique)){$Inputs+=[pscustomobject]@{Path=$File;Hash=(Get-FileHash -LiteralPath (Join-Path $Root $File)).Hash}}
function Assert-Inputs {foreach($Item in $Inputs){if((Get-FileHash -LiteralPath (Join-Path $Root $Item.Path)).Hash -ne $Item.Hash){throw 'E1 execution input changed'}}}
Assert-Inputs
$Inputs|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $Output 'inputs.json') -Encoding utf8NoBOM
foreach($Script in $Scripts){
    $Target=Join-Path $Output ('originals/'+$Script)
    [IO.Directory]::CreateDirectory((Split-Path -Parent $Target))|Out-Null
    [IO.File]::Copy((Join-Path $Root $Script),$Target,$false)
}
Push-Location $Root
try {
    $Flags=@('--e1-activity','--e1-conflicts','--output',$Output)
    & node scripts/verify-e1-conflicts.mjs @Flags *> (Join-Path $Output 'live.log')
    $RunExit=$LASTEXITCODE
    Assert-Inputs
    Assert-Runtime
    Get-Content -LiteralPath (Join-Path $Output 'live.log')|Where-Object{$_ -match '^E1_'}
    [pscustomobject]@{Exit=$RunExit;SourceAndRuntimeInputs=$Inputs.Count;RuntimeFiles=$RuntimeFiles;InputChanges=0;HealthyServices=6;Backend=$BackendRound;Frontend=$FrontendRound}|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $Output 'execution.json') -Encoding utf8NoBOM
    if($RunExit -ne 0){throw 'E1 conflict verification failed; original evidence retained'}
    $Result=Get-Content -LiteralPath (Join-Path $Output 'result.json') -Raw|ConvertFrom-Json
    if(-not $Result.passed -or -not $Result.conflicts -or -not $Result.privacy -or -not $Result.states -or -not $Result.ui -or -not $Result.preservation -or -not $Result.secrets){throw 'E1 conflict evidence incomplete'}
    "E1_ACTIVITY_INPUTS: files=$($Inputs.Count); runtime_files=$RuntimeFiles; changed=0; healthy=6; exit=0"
} finally {Pop-Location}
