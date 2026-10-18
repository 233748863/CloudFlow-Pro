param(
    [Parameter(Mandatory=$true)][string]$StatePath,
    [Parameter(Mandatory=$true)][ValidateSet('Stop','Recover')][string]$Action,
    [Parameter(Mandatory=$true)][string]$ManifestPath
)
$ErrorActionPreference='Stop'
$Root=[IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
. (Join-Path $Root '.cloudflow-runtime/use-data-drive.ps1')
$StateFile=(Resolve-Path -LiteralPath $StatePath).Path
$Run=Split-Path -Parent $StateFile
if((Split-Path -Parent $Run) -ne (Join-Path $Root '.cloudflow-runtime/batch-g-integration') -or (Split-Path -Leaf $Run) -notmatch '^[a-f0-9]{32}$'){throw 'Owned run required'}
$ManifestFile=[IO.Path]::GetFullPath($ManifestPath)
if((Split-Path -Parent $ManifestFile) -ne (Join-Path $Run 'private') -or (Split-Path -Leaf $ManifestFile) -notmatch '^a3-crm-outage-[a-f0-9]{12}\.json$'){throw 'Owned outage manifest required'}
$State=Get-Content -LiteralPath $StateFile -Raw|ConvertFrom-Json
if($State.run -ne $Run -or $State.status -ne 'RUNNING'){throw 'Running owned fixture required'}
$Service=@($State.services|Where-Object name -EQ 'crm')
$Owned=@($State.processes|Where-Object name -EQ 'crm')
$Arguments=Join-Path $Run 'crm/service.args'
if($Service.Count -ne 1 -or $Owned.Count -ne 1 -or $Owned[0].marker -ne $Arguments){throw 'Unique CRM ownership required'}
foreach($Candidate in @($Run,$StateFile,(Join-Path $Run 'private'),$Arguments,(Join-Path $Run 'crm/integration.properties'))){
    if((Get-Item -LiteralPath $Candidate).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Redirected fixture rejected'}
}
function Assert-Inputs($Inputs){
    foreach($InputFile in $Inputs){if((Get-FileHash -LiteralPath $InputFile.path).Hash -ne $InputFile.hash){throw 'Service inputs changed during outage'}}
}
if($Action -eq 'Stop'){
    if(Test-Path -LiteralPath $ManifestFile){throw 'Existing outage manifest retained'}
    foreach($Entry in $State.processes){
        $Observed=Get-CimInstance Win32_Process -Filter "ProcessId=$($Entry.id)"
        if(-not $Observed -or -not $Observed.CommandLine.Contains($Entry.marker)){throw 'Owned process identity mismatch'}
    }
    $AuthText=Get-Content -LiteralPath (Join-Path $Run 'auth/integration.properties') -Raw
    $Discovery=@($AuthText -split '\r?\n'|Where-Object{$_ -match '^spring\.cloud\.discovery\.client\.simple\.instances\.cloudflow-service-crm\['})
    if($Discovery.Count -ne 1 -or $Discovery[0] -ne "spring.cloud.discovery.client.simple.instances.cloudflow-service-crm[0].uri=http://127.0.0.1:$($Service[0].port)" -or $AuthText -notmatch '(?m)^spring.cloud.nacos.discovery.enabled=false\r?$'){throw 'Exactly one local CRM discovery target required'}
    $Current=Get-CimInstance Win32_Process -Filter "ProcessId=$($Owned[0].id)"
    if($Current.Name -ne 'java.exe' -or -not $Current.CommandLine.Contains($Arguments)){throw 'CRM process identity mismatch'}
    $Duplicates=@(Get-CimInstance Win32_Process -Filter "Name='java.exe'"|Where-Object{$_.CommandLine -and $_.CommandLine.Contains($Arguments)})
    if($Duplicates.Count -ne 1){throw 'Unique CRM process required'}
    $Listeners=@(Get-NetTCPConnection -State Listen -OwningProcess $Current.ProcessId)
    if(@($Listeners|Where-Object LocalAddress -NE '127.0.0.1').Count -or $Service[0].port -notin $Listeners.LocalPort -or $Service[0].healthPort -notin $Listeners.LocalPort){throw 'Owned loopback CRM listeners required'}
    $Inputs=@($State.services|ForEach-Object{
        foreach($Name in @('service.args','integration.properties')){$File=Join-Path $Run "$($_.name)/$Name";[pscustomobject]@{path=$File;hash=(Get-FileHash -LiteralPath $File).Hash}}
    })
    $Manifest=[pscustomobject]@{statePath=$StateFile;status='STOPPING';oldProcessId=$Current.ProcessId;oldCreated=$Current.CreationDate.ToUniversalTime().ToString('o');inputs=$Inputs;stoppedUtc=$null;recoveredUtc=$null;productionModified=$false}
    $Manifest|ConvertTo-Json -Depth 5|Set-Content -LiteralPath $ManifestFile -Encoding utf8NoBOM
    $Verified=Get-CimInstance Win32_Process -Filter "ProcessId=$($Current.ProcessId)"
    if(-not $Verified -or $Verified.CreationDate -ne $Current.CreationDate -or $Verified.CommandLine -ne $Current.CommandLine){throw 'CRM identity changed before stop'}
    [Diagnostics.Process]::GetProcessById($Current.ProcessId).Kill()
    Wait-Process -Id $Current.ProcessId -Timeout 30 -ErrorAction SilentlyContinue
    if(Get-Process -Id $Current.ProcessId -ErrorAction SilentlyContinue){throw 'Owned CRM did not stop'}
    $PortDeadline=[DateTime]::UtcNow.AddSeconds(15)
    do {
        $Remaining=@(Get-NetTCPConnection -State Listen|Where-Object LocalPort -In @($Service[0].port,$Service[0].healthPort))
        if(@($Remaining|Where-Object{$_.LocalAddress -ne '127.0.0.1' -or $_.OwningProcess -ne $Current.ProcessId}).Count){throw 'CRM port claimed by another process'}
        if($Remaining.Count -eq 0){break}
        Start-Sleep -Milliseconds 250
    } while([DateTime]::UtcNow -lt $PortDeadline)
    if($Remaining.Count){throw 'CRM ports did not become unoccupied within the bounded wait'}
    $Manifest.status='STOPPED';$Manifest.stoppedUtc=[DateTime]::UtcNow.ToString('o')
    $Manifest|ConvertTo-Json -Depth 5|Set-Content -LiteralPath $ManifestFile -Encoding utf8NoBOM
    'A3_OUTAGE_STOPPED: crm_instances=0; discovery_targets=1; ports_unoccupied=true; process_identity_verified=true; product_modified=false'
    exit 0
}
if((Get-Item -LiteralPath $ManifestFile).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Redirected manifest rejected'}
$Manifest=Get-Content -LiteralPath $ManifestFile -Raw|ConvertFrom-Json
if($Manifest.statePath -ne $StateFile -or $Manifest.status -notin @('STOPPING','STOPPED')){throw 'Unrecovered owned outage required'}
Assert-Inputs $Manifest.inputs
if(Get-Process -Id $Manifest.oldProcessId -ErrorAction SilentlyContinue){throw 'Previous CRM process still exists; inspect before recovery'}
$RecoveryOut=$ManifestFile+'.recovery.stdout.log'
$RecoveryErr=$ManifestFile+'.recovery.stderr.log'
if((Test-Path $RecoveryOut) -or (Test-Path $RecoveryErr)){throw 'Previous recovery evidence retained; inspect before retry'}
$Recovery=Start-Process -FilePath (Join-Path $PSHOME 'pwsh.exe') -WindowStyle Hidden -PassThru -WorkingDirectory $Root -ArgumentList @('-NoLogo','-NoProfile','-File',(Join-Path $PSScriptRoot 'restart-isolated-integration-service.ps1'),'-StatePath',$StateFile,'-ServiceName','crm','-RecoverExited') -RedirectStandardOutput $RecoveryOut -RedirectStandardError $RecoveryErr
$Recovery.WaitForExit()
if($Recovery.ExitCode -ne 0){throw 'Owned CRM recovery failed; retained diagnostic files require inspection'}
$CurrentState=Get-Content -LiteralPath $StateFile -Raw|ConvertFrom-Json
foreach($Entry in $CurrentState.processes){
    $Observed=Get-CimInstance Win32_Process -Filter "ProcessId=$($Entry.id)"
    if(-not $Observed -or -not $Observed.CommandLine.Contains($Entry.marker)){throw 'Recovered process identity mismatch'}
}
foreach($Item in $CurrentState.services){
    $Health=Invoke-RestMethod "http://127.0.0.1:$($Item.healthPort)/actuator/health" -TimeoutSec 5
    if($Health.status -ne 'UP'){throw 'Recovered fixture health failed'}
}
Assert-Inputs $Manifest.inputs
$Manifest.status='RECOVERED';$Manifest.recoveredUtc=[DateTime]::UtcNow.ToString('o')
$Manifest|ConvertTo-Json -Depth 5|Set-Content -LiteralPath $ManifestFile -Encoding utf8NoBOM
'A3_OUTAGE_RECOVERED: six_services_up=true; all_processes_owned=true; original_service_inputs=true; product_modified=false'
