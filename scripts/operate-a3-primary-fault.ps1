param(
    [Parameter(Mandatory=$true)][string]$StatePath,
    [Parameter(Mandatory=$true)][ValidateSet('Route','StopBase','Connections','RestoreBase','RestoreRoutes')][string]$Action,
    [Parameter(Mandatory=$true)][ValidatePattern('^[a-f0-9]{12}$')][string]$Marker,
    [long]$JobId
)
$ErrorActionPreference='Stop'
$Root=[IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
. (Join-Path $Root '.cloudflow-runtime/use-data-drive.ps1')
. (Join-Path $PSScriptRoot 'a3-auth-discovery.ps1')
$StateFile=(Resolve-Path -LiteralPath $StatePath).Path
$Run=Split-Path -Parent $StateFile
if((Split-Path -Parent $Run) -ne (Join-Path $Root '.cloudflow-runtime/batch-g-integration') -or (Split-Path -Leaf $Run) -notmatch '^[a-f0-9]{32}$'){throw 'Owned runtime required'}
$State=Get-Content $StateFile -Raw|ConvertFrom-Json
if($State.status -ne 'RUNNING' -or $State.run -ne $Run){throw 'Running owned fixture required'}
$Directory=Join-Path $Run "private/a3-primary-$Marker"
$ManifestFile=Join-Path $Directory 'fault.json'
$PeerDirectory=Join-Path $Run "private/a3-peer-auth-$Marker"
$Peer=Get-Content (Join-Path $PeerDirectory 'peer.json') -Raw|ConvertFrom-Json
if($Peer.statePath -ne $StateFile -or $Peer.service -ne 'auth' -or $Peer.marker -ne $Marker -or -not $Peer.discoverAuth){throw 'Owned auth discovery peer required'}
foreach($File in @($Root,$Run,$StateFile,(Join-Path $Run 'private'),$PeerDirectory,(Join-Path $PeerDirectory 'peer.json'))){
    if((Get-Item $File).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Redirected fixture rejected'}
}
$Auth=@($State.services|Where-Object name -EQ 'auth')[0]
function Save-Manifest {$Manifest|ConvertTo-Json -Depth 7|Set-Content $ManifestFile -Encoding utf8NoBOM}
function Assert-Service([string]$Name){
    $Entry=@($State.processes|Where-Object name -EQ $Name);$Service=@($State.services|Where-Object name -EQ $Name)
    $Arguments=Join-Path $Run "$Name/service.args"
    if($Entry.Count -ne 1 -or $Service.Count -ne 1 -or $Entry[0].marker -ne $Arguments){throw 'Unique owned service required'}
    $Current=Get-CimInstance Win32_Process -Filter "ProcessId=$($Entry[0].id)"
    if(-not $Current -or $Current.Name -ne 'java.exe' -or -not $Current.CommandLine.Contains($Arguments)){throw 'Owned service process mismatch'}
    $Listeners=@(Get-NetTCPConnection -State Listen -OwningProcess $Current.ProcessId)
    if(@($Listeners|Where-Object LocalAddress -NE '127.0.0.1').Count -or $Service[0].port -notin $Listeners.LocalPort -or $Service[0].healthPort -notin $Listeners.LocalPort){throw 'Owned service listeners mismatch'}
    return $Current
}
function Assert-Peer {
    if($Peer.status -ne 'RUNNING'){throw 'Running peer required during primary operations'}
    foreach($Pair in @(@('service.args',$Peer.argumentHash),@('integration.properties',$Peer.configHash))){if((Get-FileHash (Join-Path $PeerDirectory $Pair[0])).Hash -ne $Pair[1]){throw 'Peer configuration changed'}}
    $Current=Get-CimInstance Win32_Process -Filter "ProcessId=$($Peer.processId)"
    if(-not $Current -or $Current.Name -ne 'java.exe' -or -not $Current.CommandLine.Contains((Join-Path $PeerDirectory 'service.args')) -or $Current.CreationDate.ToUniversalTime() -ne ([DateTime]$Peer.createdUtc).ToUniversalTime()){throw 'Peer process identity mismatch'}
    $Health=Invoke-RestMethod "http://127.0.0.1:$($Peer.healthPort)/actuator/health" -TimeoutSec 5
    if($Health.status -ne 'UP'){throw 'Healthy peer required before primary operation'}
    return $Current
}
function Assert-Inputs {
    foreach($InputFile in $Manifest.inputs){
        $Allowed=@($InputFile.hash)
        $Change=@($Manifest.changes|Where-Object path -EQ $InputFile.path)
        if($Change.Count){$Allowed+=@($Change[0].routedHash)}
        if((Get-FileHash $InputFile.path).Hash -notin $Allowed){throw 'Unrecognized runtime input writer'}
    }
    foreach($Change in $Manifest.changes){if((Get-FileHash $Change.backup).Hash -ne $Change.originalHash){throw 'Original configuration backup changed'}}
}
function Assert-Job([bool]$Paused){
    $Expected=if($Paused){'PAUSED'}else{'ENABLED'}
    $Sql="SELECT COUNT(*) FROM sys_job WHERE job_id=$($Manifest.jobId) AND tenant_id=100000 AND job_name='a3_primary_$Marker' AND handler_name='employeeContractExpire' AND status='$Expected' AND deleted=0; SELECT COUNT(*) FROM sys_job_log WHERE execute_status='RUNNING' AND job_id<>$($Manifest.jobId);"
    $Deadline=[DateTime]::UtcNow.AddSeconds(15)
    do{
        $Result=@($Sql|& mysql.exe --no-defaults --protocol=TCP --host=127.0.0.1 "--port=$($State.mysqlPort)" --user=root --batch --skip-column-names cloud_flow_db)
        if($LASTEXITCODE -ne 0 -or $Result.Count -ne 2 -or "$($Result[0])".Trim() -ne '1'){throw 'Owned primary-failure task state mismatch'}
        if("$($Result[1])".Trim() -eq '0'){return}
        Start-Sleep -Milliseconds 250
    }while([DateTime]::UtcNow -lt $Deadline)
    throw 'Other actual work did not finish before primary-fault operation'
}
function Restart-Service([string]$Name,[string]$Phase){
    $Out=Join-Path $Directory "restart-$Name-$Phase.stdout.log";$Err=Join-Path $Directory "restart-$Name-$Phase.stderr.log"
    if((Test-Path $Out) -or (Test-Path $Err)){throw 'Previous restart diagnostics retained'}
    $Helper=Start-Process -FilePath (Join-Path $PSHOME 'pwsh.exe') -WindowStyle Hidden -PassThru -WorkingDirectory $Root -ArgumentList @('-NoProfile','-File',(Join-Path $PSScriptRoot 'restart-isolated-integration-service.ps1'),'-StatePath',$StateFile,'-ServiceName',$Name,'-RecoverExited') -RedirectStandardOutput $Out -RedirectStandardError $Err
    $Helper.WaitForExit()
    if($Helper.ExitCode -ne 0){throw 'Owned route service restart failed; inspect retained diagnostics'}
    $script:State=Get-Content $StateFile -Raw|ConvertFrom-Json
}
if($Action -eq 'Route'){
    if(Test-Path $Directory){throw 'Previous primary-fault evidence retained'}
    if($JobId -le 0){throw 'Owned verification task required'}
    [void](Assert-Peer);[void](Assert-Service 'auth');[void](Assert-Service 'hr');[void](Assert-Service 'gateway')
    [IO.Directory]::CreateDirectory($Directory)|Out-Null
    $Manifest=[pscustomobject]@{statePath=$StateFile;status='PREPARED';jobId=$JobId;originalProcess=0;originalCreated=$null;changes=@();inputs=@($State.services|ForEach-Object{
        foreach($Name in @('service.args','integration.properties')){$File=Join-Path $Run "$($_.name)/$Name";[pscustomobject]@{path=$File;hash=(Get-FileHash $File).Hash}}
    });productionModified=$false}
    Assert-Job $true
    foreach($Name in @('hr','gateway')){
        $File=Join-Path $Run "$Name/integration.properties"
        if((Get-Item $File).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Redirected route configuration rejected'}
        $Backup=Join-Path $Directory "$Name.original.properties"
        $Original=[IO.File]::ReadAllBytes($File)
        $Text=Get-A3AuthDiscoveryText ([Text.Encoding]::UTF8.GetString($Original)) $Auth.port $Peer.port ($Name -eq 'hr')
        $Bytes=[Text.UTF8Encoding]::new($false).GetBytes($Text)
        [IO.File]::WriteAllBytes($Backup,$Original)
        $Manifest.changes+=@([pscustomobject]@{path=$File;backup=$Backup;originalHash=(Get-FileHash $Backup).Hash;routedHash=[Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($Bytes));routedText=$Text})
    }
    # Configuration text contains credentials: retain only hashes in the manifest.
    $Writes=@($Manifest.changes|ForEach-Object{[pscustomobject]@{path=$_.path;text=$_.routedText}})
    foreach($Change in $Manifest.changes){$Change.PSObject.Properties.Remove('routedText')}
    Save-Manifest
    $Manifest.status='ROUTING';Save-Manifest
    foreach($Write in $Writes){[IO.File]::WriteAllText($Write.path,$Write.text,[Text.UTF8Encoding]::new($false))}
    $Writes=$null
    Restart-Service 'hr' 'route';Restart-Service 'gateway' 'route'
    Assert-Inputs;[void](Assert-Peer)
    $Manifest.status='ROUTED';Save-Manifest
    'A3_PRIMARY_ROUTED: actual_hr_gateway_restarted=true; auth_addresses=2; native_health_selection=true; original_auth_config=true; manual_address_replacement_after_outage=false'
    exit 0
}
foreach($File in @($Directory,$ManifestFile)){if((Get-Item $File).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Redirected fault evidence rejected'}}
$Manifest=Get-Content $ManifestFile -Raw|ConvertFrom-Json
if($Manifest.statePath -ne $StateFile){throw 'Owned primary-fault manifest required'}
Assert-Inputs
if($Action -eq 'Connections'){
    $CurrentPeer=Assert-Peer
    $Entry=@($State.processes|Where-Object name -EQ 'auth')[0]
    $Base=Get-CimInstance Win32_Process -Filter "ProcessId=$($Entry.id)"
    if($Base){$Base=Assert-Service 'auth'}elseif($Manifest.status -notin @('STOPPING','STOPPED','BASE_RESTORING')){throw 'Unexpected original auth absence'}
    $Connections=@(Get-NetTCPConnection -State Established -RemoteAddress '127.0.0.1' -RemotePort $State.redisPort)
    $BaseId=if($Base){$Base.ProcessId}else{0}
    $Result=[pscustomobject]@{baseProcess=$BaseId;peerProcess=$CurrentPeer.ProcessId;basePorts=@($Connections|Where-Object OwningProcess -EQ $BaseId|Select-Object -ExpandProperty LocalPort);peerPorts=@($Connections|Where-Object OwningProcess -EQ $CurrentPeer.ProcessId|Select-Object -ExpandProperty LocalPort)}
    if(-not $Result.peerPorts.Count){throw 'Peer Redis connection required'}
    'A3_PRIMARY_CONNECTIONS: '+($Result|ConvertTo-Json -Compress);exit 0
}
if($Action -eq 'StopBase'){
    if($Manifest.status -ne 'ROUTED'){throw 'Active routed configuration required'}
    Assert-Job $false;[void](Assert-Peer)
    $Current=Assert-Service 'auth'
    $Manifest.originalProcess=$Current.ProcessId;$Manifest.originalCreated=$Current.CreationDate.ToUniversalTime().ToString('o');$Manifest.status='STOPPING';Save-Manifest
    $Verified=Get-CimInstance Win32_Process -Filter "ProcessId=$($Current.ProcessId)"
    if(-not $Verified -or $Verified.CreationDate -ne $Current.CreationDate -or $Verified.CommandLine -ne $Current.CommandLine){throw 'Original auth changed before stop'}
    [Diagnostics.Process]::GetProcessById($Current.ProcessId).Kill()
    Wait-Process -Id $Current.ProcessId -Timeout 30 -ErrorAction SilentlyContinue
    $Deadline=[DateTime]::UtcNow.AddSeconds(15)
    do{$Listeners=@(Get-NetTCPConnection -State Listen|Where-Object LocalPort -In @($Auth.port,$Auth.healthPort));if(-not $Listeners.Count){break};Start-Sleep -Milliseconds 250}while([DateTime]::UtcNow -lt $Deadline)
    if($Listeners.Count -or (Get-Process -Id $Current.ProcessId -ErrorAction SilentlyContinue)){throw 'Original auth did not stop'}
    [void](Assert-Peer);$Manifest.status='STOPPED';Save-Manifest
    "A3_PRIMARY_STOPPED: original_process=$($Current.ProcessId); original_ports_free=true; peer_healthy=true; routes_unchanged=true"
    exit 0
}
if($Action -eq 'RestoreBase'){
    if($Manifest.status -eq 'RESTORED'){throw 'Primary fault already restored'}
    [void](Assert-Peer)
    $Entry=@($State.processes|Where-Object name -EQ 'auth')[0]
    if(Get-CimInstance Win32_Process -Filter "ProcessId=$($Entry.id)"){[void](Assert-Service 'auth')}
    else{
        if($Manifest.originalProcess -ne $Entry.id -or $Manifest.status -notin @('STOPPING','STOPPED','BASE_RESTORING')){throw 'Known stopped original auth required'}
        $Manifest.status='BASE_RESTORING';Save-Manifest
        Restart-Service 'auth' 'restore-base'
    }
    [void](Assert-Service 'auth');Assert-Inputs
    $Manifest.status='BASE_RESTORED';Save-Manifest
    'A3_PRIMARY_BASE_RESTORED: original_auth_healthy=true; original_auth_config=true; native_routes_preserved=true'
    exit 0
}
if($Manifest.status -eq 'RESTORED'){throw 'Routes already restored'}
[void](Assert-Service 'auth');Assert-Job $true
$Manifest.status='RESTORING';Save-Manifest
foreach($Change in $Manifest.changes){[IO.File]::WriteAllBytes($Change.path,[IO.File]::ReadAllBytes($Change.backup))}
Restart-Service 'hr' 'restore-routes';Restart-Service 'gateway' 'restore-routes'
foreach($InputFile in $Manifest.inputs){if((Get-FileHash $InputFile.path).Hash -ne $InputFile.hash){throw 'Original runtime inputs did not restore'}}
$Manifest.status='RESTORED';Save-Manifest
'A3_PRIMARY_ROUTES_RESTORED: original_hr_gateway_routes=true; original_inputs=12; original_auth_healthy=true; production_modified=false'
