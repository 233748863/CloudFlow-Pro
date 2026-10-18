param(
    [Parameter(Mandatory=$true)][string]$StatePath,
    [Parameter(Mandatory=$true)][ValidateSet('auth','hr')][string]$ServiceName,
    [Parameter(Mandatory=$true)][ValidateSet('Prepare','Start','Stop','Connections','Restart')][string]$Action,
    [Parameter(Mandatory=$true)][ValidatePattern('^[a-f0-9]{12}$')][string]$Marker,
    [switch]$DiscoverAuth,
    [switch]$ClusterPair
)
$ErrorActionPreference='Stop'
$Root=[IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
. (Join-Path $Root '.cloudflow-runtime/use-data-drive.ps1')
if($DiscoverAuth -and ($ServiceName -ne 'auth' -or $Action -ne 'Prepare')){throw 'Auth discovery applies only to a freshly prepared auth peer'}
if($ClusterPair -and ($Action -ne 'Prepare' -or $DiscoverAuth)){throw 'Cluster pairing applies only to fresh preparation; configure the pair together'}
$StateFile=(Resolve-Path -LiteralPath $StatePath).Path
$Run=Split-Path -Parent $StateFile
if((Split-Path -Parent $Run) -ne (Join-Path $Root '.cloudflow-runtime/batch-g-integration') -or (Split-Path -Leaf $Run) -notmatch '^[a-f0-9]{32}$'){throw 'Owned runtime required'}
$State=Get-Content -LiteralPath $StateFile -Raw|ConvertFrom-Json
if($State.status -ne 'RUNNING' -or $State.run -ne $Run){throw 'Running fixture required'}
$Private=Join-Path $Run 'private'
$Directory=Join-Path $Private "a3-peer-$ServiceName-$Marker"
$ManifestFile=Join-Path $Directory 'peer.json'
$Arguments=Join-Path $Directory 'service.args'
$ConfigFile=Join-Path $Directory 'integration.properties'
$BaseArgs=Join-Path $Run "$ServiceName/service.args"
$BaseConfig=Join-Path $Run "$ServiceName/integration.properties"
foreach($Candidate in @($Root,$Run,$StateFile,$Private,$BaseArgs,$BaseConfig)){
    if((Get-Item -LiteralPath $Candidate).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Redirected runtime rejected'}
}
function Assert-Base {
    $Entry=@($State.processes|Where-Object name -EQ $ServiceName)
    $Service=@($State.services|Where-Object name -EQ $ServiceName)
    if($Entry.Count -ne 1 -or $Service.Count -ne 1 -or $Entry[0].marker -ne $BaseArgs){throw 'Unique base service required'}
    $Current=Get-CimInstance Win32_Process -Filter "ProcessId=$($Entry[0].id)"
    if(-not $Current -or $Current.Name -ne 'java.exe' -or -not $Current.CommandLine.Contains($BaseArgs)){throw 'Base process identity mismatch'}
    $Listeners=@(Get-NetTCPConnection -State Listen -OwningProcess $Current.ProcessId)
    if(@($Listeners|Where-Object LocalAddress -NE '127.0.0.1').Count -or $Service[0].port -notin $Listeners.LocalPort -or $Service[0].healthPort -notin $Listeners.LocalPort){throw 'Base loopback listeners required'}
    return $Current
}
function Assert-Hash([string]$File,[string]$Hash){if((Get-FileHash -LiteralPath $File).Hash -ne $Hash){throw 'Peer runtime input changed'}}
if($Action -eq 'Prepare'){
    if(Test-Path -LiteralPath $Directory){throw 'Existing peer evidence retained'}
    foreach($Existing in @(Get-ChildItem -LiteralPath $Private -Directory -Filter 'a3-peer-*')){
        $ExistingManifest=Join-Path $Existing.FullName 'peer.json'
        if(Test-Path $ExistingManifest){
            $Prior=Get-Content -LiteralPath $ExistingManifest -Raw|ConvertFrom-Json
            if($Prior.status -eq 'STOPPED'){continue}
            $Other=if($ServiceName -eq 'auth'){'hr'}else{'auth'}
            if(-not $ClusterPair -or -not $Prior.clusterPair -or $Prior.status -ne 'PREPARED' -or $Prior.statePath -ne $StateFile -or $Prior.marker -ne $Marker -or $Prior.service -ne $Other -or $Existing.FullName -ne (Join-Path $Private "a3-peer-$Other-$Marker")){throw 'Stop previous A3 peer before preparing another'}
            foreach($Pair in @(@('service.args',$Prior.argumentHash),@('integration.properties',$Prior.configHash))){Assert-Hash (Join-Path $Existing.FullName $Pair[0]) $Pair[1]}
        }
    }
    $Base=Assert-Base
    $Memory=Get-CimInstance Win32_OperatingSystem
    if($Memory.FreePhysicalMemory -lt 1572864){throw 'At least 1536 MiB free physical memory required before peer start'}
    $ConfigText=[IO.File]::ReadAllText($BaseConfig)
    foreach($Required in @('server.address=127.0.0.1','management.server.address=127.0.0.1','spring.cloud.nacos.discovery.enabled=false',"spring.data.redis.port=$($State.redisPort)")){
        if($Required -notin ($ConfigText -split '\r?\n')){throw 'Owned local service configuration required'}
    }
    $Reservations=@([Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback,0),[Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback,0))
    try{foreach($Listener in $Reservations){$Listener.Start()};$Port=$Reservations[0].LocalEndpoint.Port;$HealthPort=$Reservations[1].LocalEndpoint.Port}
    finally{foreach($Listener in $Reservations){$Listener.Stop()}}
    foreach($Property in @('server.port','management.server.port')){
        if([regex]::Matches($ConfigText,'(?m)^'+[regex]::Escape($Property)+'=\d+\r?$').Count -ne 1){throw 'Unique original service port property required'}
    }
    $ConfigText=[regex]::Replace($ConfigText,'(?m)^server\.port=\d+', "server.port=$Port")
    $ConfigText=[regex]::Replace($ConfigText,'(?m)^management\.server\.port=\d+', "management.server.port=$HealthPort")
    if($DiscoverAuth){
        . (Join-Path $PSScriptRoot 'a3-auth-discovery.ps1')
        $OriginalAuth=@($State.services|Where-Object name -EQ 'auth')
        if($OriginalAuth.Count -ne 1){throw 'Unique original auth service required'}
        $ConfigText=Get-A3AuthDiscoveryText $ConfigText $OriginalAuth[0].port $Port $true
    }
    $ArgumentText=[IO.File]::ReadAllText($BaseArgs)
    $BaseLocation='--spring.config.additional-location=file:'+$BaseConfig.Replace('\','/')
    if([regex]::Matches($ArgumentText,[regex]::Escape($BaseLocation)).Count -ne 1){throw 'Unique original configuration argument required'}
    $ArgumentText=$ArgumentText.Replace($BaseLocation,'--spring.config.additional-location=file:'+$ConfigFile.Replace('\','/'))
    [IO.Directory]::CreateDirectory($Directory)|Out-Null
    [IO.File]::WriteAllText($ConfigFile,$ConfigText,[Text.UTF8Encoding]::new($false))
    [IO.File]::WriteAllText($Arguments,$ArgumentText,[Text.UTF8Encoding]::new($false))
    $Manifest=[pscustomobject]@{statePath=$StateFile;service=$ServiceName;marker=$Marker;directory=$Directory;status='PREPARED';port=$Port;healthPort=$HealthPort;processId=0;createdUtc=$null;
        executable=$Base.ExecutablePath;executableHash=(Get-FileHash -LiteralPath $Base.ExecutablePath).Hash;
        baseArgumentHash=(Get-FileHash -LiteralPath $BaseArgs).Hash;baseConfigHash=(Get-FileHash -LiteralPath $BaseConfig).Hash;
        argumentHash=(Get-FileHash -LiteralPath $Arguments).Hash;configHash=(Get-FileHash -LiteralPath $ConfigFile).Hash;discoverAuth=[bool]$DiscoverAuth;clusterPair=[bool]$ClusterPair;productionModified=$false}
    $Manifest|ConvertTo-Json -Depth 4|Set-Content -LiteralPath $ManifestFile -Encoding utf8NoBOM
    "A3_PEER_PREPARED: service=$ServiceName; base_configuration_unchanged=true; shared_real_database_redis=true; loopback_only=true"
    exit 0
}
foreach($Candidate in @($Directory,$ManifestFile,$Arguments,$ConfigFile)){
    if((Get-Item -LiteralPath $Candidate).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Redirected peer path rejected'}
}
$Manifest=Get-Content -LiteralPath $ManifestFile -Raw|ConvertFrom-Json
if($Manifest.statePath -ne $StateFile -or $Manifest.directory -ne $Directory -or $Manifest.service -ne $ServiceName -or $Manifest.marker -ne $Marker){throw 'Peer ownership mismatch'}
Assert-Hash $Arguments $Manifest.argumentHash
Assert-Hash $ConfigFile $Manifest.configHash
Assert-Hash $BaseArgs $Manifest.baseArgumentHash
Assert-Hash $BaseConfig $Manifest.baseConfigHash
Assert-Hash $Manifest.executable $Manifest.executableHash
if($Action -eq 'Connections'){
    if($ServiceName -ne 'auth' -or $Manifest.status -ne 'RUNNING'){throw 'Running scheduler peer required'}
    $Base=Assert-Base
    $Current=Get-CimInstance Win32_Process -Filter "ProcessId=$($Manifest.processId)"
    if(-not $Current -or $Current.Name -ne 'java.exe' -or -not $Current.CommandLine.Contains($Arguments) -or $Current.CreationDate.ToUniversalTime() -ne ([DateTime]$Manifest.createdUtc).ToUniversalTime()){throw 'Peer connection owner mismatch'}
    $Connections=@(Get-NetTCPConnection -State Established -RemoteAddress '127.0.0.1' -RemotePort $State.redisPort)
    $Result=[pscustomobject]@{baseProcess=$Base.ProcessId;peerProcess=$Current.ProcessId;
        basePorts=@($Connections|Where-Object OwningProcess -EQ $Base.ProcessId|Select-Object -ExpandProperty LocalPort);
        peerPorts=@($Connections|Where-Object OwningProcess -EQ $Current.ProcessId|Select-Object -ExpandProperty LocalPort)}
    if(-not $Result.basePorts.Count -or -not $Result.peerPorts.Count){throw 'Both real schedulers require live Redis connections'}
    'A3_PEER_CONNECTIONS: '+($Result|ConvertTo-Json -Compress)
    exit 0
}
if($Action -eq 'Stop'){
    if($Manifest.status -eq 'STOPPED'){throw 'Peer already stopped; do not repeat'}
    if($Manifest.status -eq 'RUNNING'){
        $Current=Get-CimInstance Win32_Process -Filter "ProcessId=$($Manifest.processId)"
        if($Current){
            if($Current.Name -ne 'java.exe' -or -not $Current.CommandLine.Contains($Arguments) -or $Current.CreationDate.ToUniversalTime() -ne ([DateTime]$Manifest.createdUtc).ToUniversalTime()){throw 'Peer process identity changed'}
            $Listeners=@(Get-NetTCPConnection -State Listen -OwningProcess $Current.ProcessId -ErrorAction SilentlyContinue)
            if(@($Listeners|Where-Object{$_.LocalAddress -ne '127.0.0.1' -or $_.LocalPort -notin @($Manifest.port,$Manifest.healthPort)}).Count){throw 'Unexpected peer listener'}
            $Verified=Get-CimInstance Win32_Process -Filter "ProcessId=$($Current.ProcessId)"
            if(-not $Verified -or $Verified.CreationDate -ne $Current.CreationDate -or $Verified.CommandLine -ne $Current.CommandLine){throw 'Peer changed before stop'}
            [Diagnostics.Process]::GetProcessById($Current.ProcessId).Kill()
            Wait-Process -Id $Current.ProcessId -Timeout 30 -ErrorAction SilentlyContinue
        }
    }
    if(@(Get-CimInstance Win32_Process -Filter "Name='java.exe'"|Where-Object{$_.CommandLine -and $_.CommandLine.Contains($Arguments)}).Count){throw 'Peer process still present'}
    $Deadline=[DateTime]::UtcNow.AddSeconds(15)
    do{
        $Listeners=@(Get-NetTCPConnection -State Listen|Where-Object LocalPort -In @($Manifest.port,$Manifest.healthPort))
        if(@($Listeners|Where-Object{$_.LocalAddress -ne '127.0.0.1' -or $_.OwningProcess -ne $Manifest.processId}).Count){throw 'Peer port claimed by another process'}
        if(-not $Listeners.Count){break};Start-Sleep -Milliseconds 250
    }while([DateTime]::UtcNow -lt $Deadline)
    if($Listeners.Count){throw 'Peer listener release expired'}
    [void](Assert-Base)
    $Manifest.status='STOPPED'
    $Manifest|ConvertTo-Json -Depth 4|Set-Content -LiteralPath $ManifestFile -Encoding utf8NoBOM
    "A3_PEER_STOPPED: service=$ServiceName; identity_verified=true; ports_free=true; base_process_preserved=true"
    exit 0
}
if($Action -eq 'Restart'){
    if($Manifest.status -ne 'STOPPED' -or $Manifest.PSObject.Properties.Name -contains 'previousProcess'){throw 'One stopped owned peer may restart once'}
    if(Get-CimInstance Win32_Process -Filter "ProcessId=$($Manifest.processId)"){throw 'Previous peer PID must remain absent'}
    if(@(Get-CimInstance Win32_Process -Filter "Name='java.exe'"|Where-Object{$_.CommandLine -and $_.CommandLine.Contains($Arguments)}).Count){throw 'Peer arguments already in use'}
    $Manifest|Add-Member -NotePropertyName previousProcess -NotePropertyValue ([pscustomobject]@{id=$Manifest.processId;createdUtc=$Manifest.createdUtc})
} elseif($Manifest.status -ne 'PREPARED'){throw 'Fresh prepared peer required'}
$Base=Assert-Base
if($Base.ExecutablePath -ne $Manifest.executable){throw 'Base Java changed'}
if((Get-CimInstance Win32_OperatingSystem).FreePhysicalMemory -lt 1572864){throw 'At least 1536 MiB free physical memory required'}
if(@(Get-NetTCPConnection -State Listen|Where-Object LocalPort -In @($Manifest.port,$Manifest.healthPort)).Count){throw 'Peer ports occupied'}
$LogSuffix=if($Action -eq 'Restart'){'-restart'}else{''}
$Out=Join-Path $Directory "stdout$LogSuffix.log";$Err=Join-Path $Directory "stderr$LogSuffix.log"
if((Test-Path -LiteralPath $Out) -or (Test-Path -LiteralPath $Err)){throw 'Prior peer launch diagnostics retained'}
$Process=Start-Process -FilePath $Manifest.executable -WindowStyle Hidden -PassThru -WorkingDirectory $Directory -ArgumentList ('"@'+$Arguments+'"') -RedirectStandardOutput $Out -RedirectStandardError $Err
$Current=Get-CimInstance Win32_Process -Filter "ProcessId=$($Process.Id)"
if(-not $Current -or -not $Current.CommandLine.Contains($Arguments)){throw 'Started peer identity unavailable'}
$Manifest.processId=$Current.ProcessId;$Manifest.createdUtc=$Current.CreationDate.ToUniversalTime().ToString('o');$Manifest.status='RUNNING'
$Manifest|ConvertTo-Json -Depth 4|Set-Content -LiteralPath $ManifestFile -Encoding utf8NoBOM
$Deadline=[DateTime]::UtcNow.AddSeconds(360)
while([DateTime]::UtcNow -lt $Deadline){
    if($Process.HasExited){throw 'Real peer exited before readiness'}
    try{
        $Health=Invoke-RestMethod "http://127.0.0.1:$($Manifest.healthPort)/actuator/health" -TimeoutSec 2
        if($Health.status -eq 'UP'){
            $Listeners=@(Get-NetTCPConnection -State Listen -OwningProcess $Process.Id)
            if(@($Listeners|Where-Object LocalAddress -NE '127.0.0.1').Count -or $Manifest.port -notin $Listeners.LocalPort -or $Manifest.healthPort -notin $Listeners.LocalPort){throw 'Peer loopback listener mismatch'}
            "A3_PEER_READY: service=$ServiceName; process=$($Process.Id); actual_application=true; loopback_only=true";exit 0
        }
    }catch{if($_.Exception.Message -eq 'Peer loopback listener mismatch'){throw}}
    Start-Sleep -Seconds 2
}
throw 'Peer readiness timed out; retain process for explicit inspection and cleanup'
