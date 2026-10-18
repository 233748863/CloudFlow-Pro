param(
    [Parameter(Mandatory=$true)][string]$StatePath,
    [Parameter(Mandatory=$true)][ValidateSet('Configure','Route','Connections','Restore')][string]$Action,
    [Parameter(Mandatory=$true)][ValidatePattern('^[a-f0-9]{12}$')][string]$Marker,
    [long]$JobId
)
$ErrorActionPreference='Stop'
$Root=[IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
. (Join-Path $Root '.cloudflow-runtime/use-data-drive.ps1')
. (Join-Path $PSScriptRoot 'a3-cluster-discovery.ps1')
$StateFile=(Resolve-Path -LiteralPath $StatePath).Path
$Run=Split-Path -Parent $StateFile
if((Split-Path -Parent $Run) -ne (Join-Path $Root '.cloudflow-runtime/batch-g-integration') -or (Split-Path -Leaf $Run) -notmatch '^[a-f0-9]{32}$'){throw 'Owned runtime required'}
$State=Get-Content $StateFile -Raw|ConvertFrom-Json
if($State.status -ne 'RUNNING' -or $State.run -ne $Run){throw 'Running owned fixture required'}
$Directory=Join-Path $Run "private/a3-cluster-$Marker"
$ManifestFile=Join-Path $Directory 'cluster.json'
foreach($Path in @($Root,$Run,$StateFile,(Join-Path $Run 'private'))){if((Get-Item $Path).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Redirected fixture rejected'}}
$Peers=@{}
foreach($Name in @('auth','hr')){
    $Folder=Join-Path $Run "private/a3-peer-$Name-$Marker"
    $File=Join-Path $Folder 'peer.json'
    foreach($Path in @($Folder,$File)){if((Get-Item $Path).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Redirected peer rejected'}}
    $Peer=Get-Content $File -Raw|ConvertFrom-Json
    if($Peer.statePath -ne $StateFile -or $Peer.service -ne $Name -or $Peer.marker -ne $Marker -or -not $Peer.clusterPair -or $Peer.directory -ne $Folder){throw 'Owned paired peer required'}
    $Peers[$Name]=$Peer
}
$Auth=@($State.services|Where-Object name -EQ 'auth')[0]
$Hr=@($State.services|Where-Object name -EQ 'hr')[0]
if(@(@($Auth.port,$Hr.port,$Peers.auth.port,$Peers.hr.port)|Sort-Object -Unique).Count -ne 4){throw 'Four distinct application ports required'}
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
function Assert-Peer([string]$Name,[bool]$Running){
    $Peer=$Peers[$Name]
    foreach($Pair in @(@('service.args',$Peer.argumentHash),@('integration.properties',$Peer.configHash))){if((Get-FileHash (Join-Path $Peer.directory $Pair[0])).Hash -ne $Pair[1]){throw 'Peer configuration changed'}}
    if(-not $Running){if($Peer.status -ne 'PREPARED' -or $Peer.processId -ne 0){throw 'Fresh unstarted peer required'};return}
    if($Peer.status -ne 'RUNNING'){throw 'Running peer required'}
    $Current=Get-CimInstance Win32_Process -Filter "ProcessId=$($Peer.processId)"
    if(-not $Current -or $Current.Name -ne 'java.exe' -or -not $Current.CommandLine.Contains((Join-Path $Peer.directory 'service.args')) -or $Current.CreationDate.ToUniversalTime() -ne ([DateTime]$Peer.createdUtc).ToUniversalTime()){throw 'Peer process identity mismatch'}
    $Health=Invoke-RestMethod "http://127.0.0.1:$($Peer.healthPort)/actuator/health" -TimeoutSec 5
    if($Health.status -ne 'UP'){throw 'Healthy actual peer required'}
    return $Current
}
function Assert-Job {
    $Sql="SELECT COUNT(*) FROM sys_job WHERE job_id=$($Manifest.jobId) AND tenant_id=100000 AND job_name='a3_cluster_$Marker' AND handler_name='employeeContractExpire' AND status='PAUSED' AND deleted=0; SELECT COUNT(*) FROM sys_job_log WHERE execute_status='RUNNING';"
    $Deadline=[DateTime]::UtcNow.AddSeconds(15)
    do{
        $Rows=@($Sql|& mysql.exe --no-defaults --protocol=TCP --host=127.0.0.1 "--port=$($State.mysqlPort)" --user=root --batch --skip-column-names cloud_flow_db)
        if($LASTEXITCODE -ne 0 -or $Rows.Count -ne 2 -or "$($Rows[0])".Trim() -ne '1'){throw 'Owned paused cluster task required'}
        if("$($Rows[1])".Trim() -eq '0'){return};Start-Sleep -Milliseconds 250
    }while([DateTime]::UtcNow -lt $Deadline)
    throw 'Actual work did not finish before cluster configuration operation'
}
function Assert-Inputs {
    foreach($File in $Manifest.inputs){
        $Allowed=@($File.hash);$Change=@($Manifest.changes|Where-Object path -EQ $File.path)
        if($Change.Count){$Allowed+=@($Change[0].routedHash)}
        if((Get-FileHash $File.path).Hash -notin $Allowed){throw 'Unrecognized runtime configuration writer'}
    }
    foreach($Change in $Manifest.changes){if((Get-FileHash $Change.backup).Hash -ne $Change.originalHash){throw 'Original backup changed'}}
}
function Restart-Service([string]$Name,[string]$Phase){
    $Out=Join-Path $Directory "restart-$Name-$Phase.stdout.log";$Err=Join-Path $Directory "restart-$Name-$Phase.stderr.log"
    if((Test-Path $Out) -or (Test-Path $Err)){throw 'Previous restart evidence retained'}
    $Helper=Start-Process -FilePath (Join-Path $PSHOME 'pwsh.exe') -WindowStyle Hidden -PassThru -WorkingDirectory $Root -ArgumentList @('-NoProfile','-File',(Join-Path $PSScriptRoot 'restart-isolated-integration-service.ps1'),'-StatePath',$StateFile,'-ServiceName',$Name,'-RecoverExited') -RedirectStandardOutput $Out -RedirectStandardError $Err
    $Helper.WaitForExit()
    if($Helper.ExitCode -ne 0){throw 'Owned cluster service restart failed; inspect retained diagnostics'}
    $script:State=Get-Content $StateFile -Raw|ConvertFrom-Json
}
if($Action -eq 'Configure'){
    if((Test-Path $Directory) -or $JobId -le 0){throw 'Fresh cluster evidence and owned task required'}
    foreach($Name in @('auth','hr')){[void](Assert-Service $Name);Assert-Peer $Name $false}
    [void](Assert-Service 'gateway')
    [IO.Directory]::CreateDirectory($Directory)|Out-Null
    $Manifest=[pscustomobject]@{statePath=$StateFile;marker=$Marker;jobId=$JobId;status='PREPARING';changes=@();peerInputs=@();inputs=@($State.services|ForEach-Object{
        foreach($Name in @('service.args','integration.properties')){$File=Join-Path $Run "$($_.name)/$Name";[pscustomobject]@{path=$File;hash=(Get-FileHash $File).Hash}}
    });productionModified=$false}
    Assert-Job
    foreach($Name in @('auth','hr')){
        $Peer=$Peers[$Name];$File=Join-Path $Peer.directory 'integration.properties';$Backup=Join-Path $Directory "$Name.peer.original.properties"
        $Text=Get-A3ClusterDiscoveryText ([IO.File]::ReadAllText($File)) $Auth.port $Peers.auth.port $Hr.port $Peers.hr.port $true
        [IO.File]::WriteAllBytes($Backup,[IO.File]::ReadAllBytes($File))
        $Bytes=[Text.UTF8Encoding]::new($false).GetBytes($Text)
        $Manifest.peerInputs+=@([pscustomobject]@{path=$File;backup=$Backup;originalHash=(Get-FileHash $Backup).Hash;routedHash=[Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($Bytes))})
        Save-Manifest
        [IO.File]::WriteAllBytes($File,$Bytes)
        $Peer.configHash=(Get-FileHash $File).Hash
        $Peer|Add-Member -NotePropertyName clusterConfigured -NotePropertyValue $true
        $Peer|ConvertTo-Json -Depth 5|Set-Content (Join-Path $Peer.directory 'peer.json') -Encoding utf8NoBOM
    }
    $Manifest.status='CONFIGURED';Save-Manifest
    'A3_CLUSTER_CONFIGURED: auth_peers=2; hr_peers=2; original_configs_unchanged=true; actual_native_discovery=true'
    exit 0
}
foreach($Path in @($Directory,$ManifestFile)){if((Get-Item $Path).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Redirected cluster evidence rejected'}}
$Manifest=Get-Content $ManifestFile -Raw|ConvertFrom-Json
if($Manifest.statePath -ne $StateFile -or $Manifest.marker -ne $Marker){throw 'Owned cluster manifest required'}
Assert-Inputs
foreach($Name in @('auth','hr')){if(-not $Peers[$Name].clusterConfigured){throw 'Configured peer pair required'}}
if($Action -eq 'Connections'){
    if($Manifest.status -ne 'ROUTED'){throw 'Routed cluster required'}
    $Result=@{}
    foreach($Name in @('auth','hr')){
        $Base=Assert-Service $Name;$PeerProcess=Assert-Peer $Name $true
        $Connections=@(Get-NetTCPConnection -State Established -RemoteAddress '127.0.0.1' -RemotePort $State.redisPort)
        foreach($Member in @(@('Base',$Base.ProcessId),@('Peer',$PeerProcess.ProcessId))){
            $Label=$Name+$Member[0];$Ports=@($Connections|Where-Object OwningProcess -EQ $Member[1]|Select-Object -ExpandProperty LocalPort)
            if(-not $Ports.Count){throw 'Each actual process requires a Redis connection'}
            $Result[$Label]=[pscustomobject]@{process=$Member[1];ports=$Ports}
        }
    }
    'A3_CLUSTER_CONNECTIONS: '+($Result|ConvertTo-Json -Depth 4 -Compress);exit 0
}
if($Action -eq 'Route'){
    if($Manifest.status -ne 'CONFIGURED'){throw 'Fresh configured cluster required'}
    Assert-Job
    foreach($Name in @('auth','hr')){[void](Assert-Peer $Name $true);[void](Assert-Service $Name)}
    [void](Assert-Service 'gateway')
    $Writes=@()
    foreach($Name in @('auth','hr','gateway')){
        $File=Join-Path $Run "$Name/integration.properties";$Backup=Join-Path $Directory "$Name.original.properties"
        if((Get-Item $File).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Redirected original configuration rejected'}
        $Original=[IO.File]::ReadAllBytes($File)
        $Text=Get-A3ClusterDiscoveryText ([Text.Encoding]::UTF8.GetString($Original)) $Auth.port $Peers.auth.port $Hr.port $Peers.hr.port ($Name -ne 'gateway')
        $Bytes=[Text.UTF8Encoding]::new($false).GetBytes($Text)
        [IO.File]::WriteAllBytes($Backup,$Original)
        $Manifest.changes+=@([pscustomobject]@{path=$File;backup=$Backup;originalHash=(Get-FileHash $Backup).Hash;routedHash=[Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($Bytes))})
        $Writes+=@([pscustomobject]@{path=$File;bytes=$Bytes})
    }
    $Manifest.status='ROUTING';Save-Manifest
    foreach($Write in $Writes){[IO.File]::WriteAllBytes($Write.path,$Write.bytes)};$Writes=$null
    foreach($Name in @('auth','hr','gateway')){Restart-Service $Name 'route'}
    Assert-Inputs
    foreach($Name in @('auth','hr')){[void](Assert-Peer $Name $true)}
    $Manifest.status='ROUTED';Save-Manifest
    'A3_CLUSTER_ROUTED: actual_auth_hr_gateway_restarted=true; auth_instances=2; hr_instances=2; native_selection=true'
    exit 0
}
if($Manifest.status -eq 'RESTORED'){throw 'Cluster already restored'}
Assert-Job
if($Manifest.changes.Count){
    $Manifest.status='RESTORING';Save-Manifest
    foreach($Change in $Manifest.changes){[IO.File]::WriteAllBytes($Change.path,[IO.File]::ReadAllBytes($Change.backup))}
    foreach($Name in @('auth','hr','gateway')){Restart-Service $Name 'restore'}
}
foreach($File in $Manifest.inputs){if((Get-FileHash $File.path).Hash -ne $File.hash){throw 'Original runtime inputs did not restore'}}
$Manifest.status='RESTORED';Save-Manifest
'A3_CLUSTER_RESTORED: original_runtime_inputs=12; original_auth_hr_gateway=true; production_modified=false'

