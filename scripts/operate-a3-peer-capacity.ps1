param(
    [Parameter(Mandatory=$true)][string]$StatePath,
    [Parameter(Mandatory=$true)][ValidateSet('Reserve','Ensure','Restore')][string]$Action,
    [Parameter(Mandatory=$true)][ValidatePattern('^[a-f0-9]{12}$')][string]$Marker,
    [ValidateRange(1536,8192)][int]$RequiredFreeMiB=2048
)
$ErrorActionPreference='Stop'
$Root=[IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
. (Join-Path $Root '.cloudflow-runtime/use-data-drive.ps1')
$StateFile=(Resolve-Path -LiteralPath $StatePath).Path
$Run=Split-Path -Parent $StateFile
if((Split-Path -Parent $Run) -ne (Join-Path $Root '.cloudflow-runtime/batch-g-integration') -or (Split-Path -Leaf $Run) -notmatch '^[a-f0-9]{32}$'){throw 'Owned fixture required'}
$State=Get-Content -LiteralPath $StateFile -Raw|ConvertFrom-Json
if($State.run -ne $Run -or $State.status -ne 'RUNNING'){throw 'Running owned fixture required'}
$ManifestFile=Join-Path $Run "private/a3-peer-capacity-$Marker.json"
foreach($Candidate in @($Run,$StateFile,(Join-Path $Run 'private'))){
    if((Get-Item -LiteralPath $Candidate).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Redirected fixture rejected'}
}
function Save-Manifest {$Manifest|ConvertTo-Json -Depth 6|Set-Content -LiteralPath $ManifestFile -Encoding utf8NoBOM}
function Assert-Inputs {
    foreach($InputFile in $Manifest.inputs){if((Get-FileHash -LiteralPath $InputFile.path).Hash -ne $InputFile.hash){throw 'Service inputs changed during capacity reservation'}}
}
if($Action -in @('Reserve','Ensure')){
    if($Action -eq 'Reserve'){
    if(Test-Path -LiteralPath $ManifestFile){throw 'Existing capacity evidence retained'}
    foreach($Entry in $State.processes){
        $Current=Get-CimInstance Win32_Process -Filter "ProcessId=$($Entry.id)"
        if(-not $Current -or -not $Current.CommandLine.Contains($Entry.marker)){throw 'All original processes must be owned and running'}
    }
    $Manifest=[pscustomobject]@{statePath=$StateFile;status='RESERVING';requiredFreeMiB=$RequiredFreeMiB;stopped=@();inputs=@($State.services|ForEach-Object{
        foreach($Name in @('service.args','integration.properties')){$File=Join-Path $Run "$($_.name)/$Name";[pscustomobject]@{path=$File;hash=(Get-FileHash -LiteralPath $File).Hash}}
    });productionModified=$false}
    Save-Manifest
    } else {
        if((Get-Item -LiteralPath $ManifestFile).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Redirected capacity manifest rejected'}
        $Manifest=Get-Content -LiteralPath $ManifestFile -Raw|ConvertFrom-Json
        if($Manifest.statePath -ne $StateFile -or $Manifest.status -ne 'RESERVED'){throw 'Active owned capacity reservation required'}
        if($Manifest.PSObject.Properties.Name -contains 'requiredFreeMiB'){$RequiredFreeMiB=[int]$Manifest.requiredFreeMiB}
        Assert-Inputs
        foreach($Entry in $State.processes){
            if($Entry.name -in $Manifest.stopped.name){continue}
            $Current=Get-CimInstance Win32_Process -Filter "ProcessId=$($Entry.id)"
            if(-not $Current -or -not $Current.CommandLine.Contains($Entry.marker)){throw 'Unreserved original process ownership mismatch'}
        }
        $Manifest.status='RESERVING';Save-Manifest
    }
    foreach($Name in @('crm','workflow','oa')){
        if((Get-CimInstance Win32_OperatingSystem).FreePhysicalMemory -ge $RequiredFreeMiB*1024){break}
        if($Name -in $Manifest.stopped.name){continue}
        $Service=@($State.services|Where-Object name -EQ $Name);$Owned=@($State.processes|Where-Object name -EQ $Name)
        $Arguments=Join-Path $Run "$Name/service.args"
        if($Service.Count -ne 1 -or $Owned.Count -ne 1 -or $Owned[0].marker -ne $Arguments){throw 'Unique owned support service required'}
        $Current=Get-CimInstance Win32_Process -Filter "ProcessId=$($Owned[0].id)"
        if(-not $Current -or $Current.Name -ne 'java.exe' -or -not $Current.CommandLine.Contains($Arguments)){throw 'Support service identity mismatch'}
        $Listeners=@(Get-NetTCPConnection -State Listen -OwningProcess $Current.ProcessId)
        if(@($Listeners|Where-Object LocalAddress -NE '127.0.0.1').Count -or $Service[0].port -notin $Listeners.LocalPort -or $Service[0].healthPort -notin $Listeners.LocalPort){throw 'Owned support loopback listeners required'}
        $Sql="SELECT COUNT(*) FROM sys_job_log l JOIN sys_job j ON j.job_id=l.job_id WHERE l.execute_status='RUNNING' AND j.service_name IN ('$Name','cloudflow-service-$Name');"
        $Active=$Sql|& mysql.exe --no-defaults --protocol=TCP --host=127.0.0.1 "--port=$($State.mysqlPort)" --user=root --batch --skip-column-names cloud_flow_db
        if($LASTEXITCODE -ne 0 -or "$Active".Trim() -ne '0'){throw 'Do not interrupt active support-service jobs'}
        $Record=[pscustomobject]@{name=$Name;processId=$Current.ProcessId;createdUtc=$Current.CreationDate.ToUniversalTime().ToString('o');status='STOPPING'}
        $Manifest.stopped+=@($Record);Save-Manifest
        $Verified=Get-CimInstance Win32_Process -Filter "ProcessId=$($Current.ProcessId)"
        if(-not $Verified -or $Verified.CreationDate -ne $Current.CreationDate -or $Verified.CommandLine -ne $Current.CommandLine){throw 'Support service changed before stop'}
        [Diagnostics.Process]::GetProcessById($Current.ProcessId).Kill()
        Wait-Process -Id $Current.ProcessId -Timeout 30 -ErrorAction SilentlyContinue
        if(Get-Process -Id $Current.ProcessId -ErrorAction SilentlyContinue){throw 'Owned support process did not exit'}
        $Record.status='STOPPED';Save-Manifest
    }
    Assert-Inputs
    $Free=(Get-CimInstance Win32_OperatingSystem).FreePhysicalMemory
    $Manifest|Add-Member -NotePropertyName observedFreeKiB -NotePropertyValue $Free -Force
    Save-Manifest
    if($Free -lt 1572864){throw 'Owned support reservation did not provide 1536 MiB; restore before continuing'}
    if($RequiredFreeMiB -gt 2048 -and $Free -lt $RequiredFreeMiB*1024){throw "Requested multi-peer capacity unavailable: required_mib=$RequiredFreeMiB; actual_kib=$Free; restore before continuing"}
    $Manifest.status='RESERVED';Save-Manifest
    $Phase=if($Action -eq 'Reserve'){'RESERVED'}else{'ENSURED'}
    "A3_CAPACITY_${Phase}: stopped_owned_services=$($Manifest.stopped.name -join ','); free_kib=$Free; original_inputs=true; other_user_processes_untouched=true"
    exit 0
}
if((Get-Item -LiteralPath $ManifestFile).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Redirected capacity manifest rejected'}
$Manifest=Get-Content -LiteralPath $ManifestFile -Raw|ConvertFrom-Json
if($Manifest.statePath -ne $StateFile -or $Manifest.status -notin @('RESERVING','RESERVED')){throw 'Owned unrestored reservation required'}
Assert-Inputs
foreach($Record in $Manifest.stopped){
    if($Record.status -eq 'RESTORED'){continue}
    if($Record.name -notin @('crm','workflow','oa')){throw 'Unexpected support service in reservation'}
    $Current=Get-CimInstance Win32_Process -Filter "ProcessId=$($Record.processId)"
    if($Current){throw 'Stopped support PID exists; inspect identity before recovery'}
    $Out=$ManifestFile+'.'+$Record.name+'.stdout.log';$Err=$ManifestFile+'.'+$Record.name+'.stderr.log'
    if((Test-Path $Out) -or (Test-Path $Err)){throw 'Prior support restoration diagnostics retained'}
    $Helper=Start-Process -FilePath (Join-Path $PSHOME 'pwsh.exe') -WindowStyle Hidden -PassThru -WorkingDirectory $Root -ArgumentList @('-NoLogo','-NoProfile','-File',(Join-Path $PSScriptRoot 'restart-isolated-integration-service.ps1'),'-StatePath',$StateFile,'-ServiceName',$Record.name,'-RecoverExited') -RedirectStandardOutput $Out -RedirectStandardError $Err
    $Helper.WaitForExit()
    if($Helper.ExitCode -ne 0){throw 'Support service restoration failed; inspect retained diagnostics'}
    $Record.status='RESTORED';Save-Manifest
}
$State=Get-Content -LiteralPath $StateFile -Raw|ConvertFrom-Json
foreach($Entry in $State.processes){
    $Current=Get-CimInstance Win32_Process -Filter "ProcessId=$($Entry.id)"
    if(-not $Current -or -not $Current.CommandLine.Contains($Entry.marker)){throw 'Restored original process identity mismatch'}
}
foreach($Service in $State.services){
    $Health=Invoke-RestMethod "http://127.0.0.1:$($Service.healthPort)/actuator/health" -TimeoutSec 5
    if($Health.status -ne 'UP'){throw 'Support restoration health failed'}
}
Assert-Inputs
$Manifest.status='RESTORED';Save-Manifest
'A3_CAPACITY_RESTORED: all_original_processes_owned=true; six_services_up=true; original_service_inputs=true; production_modified=false'
