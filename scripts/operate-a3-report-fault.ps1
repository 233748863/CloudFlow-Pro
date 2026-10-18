param(
    [Parameter(Mandatory=$true)][string]$StatePath,
    [Parameter(Mandatory=$true)][ValidateSet('Route','Stop','Restore')][string]$Action,
    [Parameter(Mandatory=$true)][ValidatePattern('^[a-f0-9]{12}$')][string]$Marker,
    [int]$ProxyPort,
    [int]$ProxyProcess,
    [long]$JobId
)
$ErrorActionPreference='Stop'
$Root=[IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
. (Join-Path $Root '.cloudflow-runtime/use-data-drive.ps1')
$StateFile=(Resolve-Path -LiteralPath $StatePath).Path
$Run=Split-Path -Parent $StateFile
if((Split-Path -Parent $Run) -ne (Join-Path $Root '.cloudflow-runtime/batch-g-integration') -or (Split-Path -Leaf $Run) -notmatch '^[a-f0-9]{32}$'){throw 'Owned fixture required'}
$Private=Join-Path $Run 'private'
$ManifestFile=Join-Path $Private "a3-report-fault-$Marker.json"
$Backup=Join-Path $Private "a3-report-fault-$Marker.original.properties"
$State=Get-Content -LiteralPath $StateFile -Raw|ConvertFrom-Json
if($State.status -ne 'RUNNING' -or $State.run -ne $Run){throw 'Running owned fixture required'}
$Hr=@($State.services|Where-Object name -EQ 'hr')
$Auth=@($State.services|Where-Object name -EQ 'auth')
$Owned=@($State.processes|Where-Object name -EQ 'hr')
$Arguments=Join-Path $Run 'hr/service.args'
$ConfigFile=Join-Path $Run 'hr/integration.properties'
if($Hr.Count -ne 1 -or $Auth.Count -ne 1 -or $Owned.Count -ne 1 -or $Owned[0].marker -ne $Arguments){throw 'Unique original HR required'}
foreach($File in @($Root,$Run,$Private,$StateFile,$Arguments,$ConfigFile)){
    if((Get-Item -LiteralPath $File).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Redirected fixture rejected'}
}
function Save-Manifest {$Manifest|ConvertTo-Json -Depth 6|Set-Content -LiteralPath $ManifestFile -Encoding utf8NoBOM}
function Assert-OriginalProcess {
    $Current=Get-CimInstance Win32_Process -Filter "ProcessId=$($Owned[0].id)"
    if(-not $Current -or $Current.Name -ne 'java.exe' -or -not $Current.CommandLine.Contains($Arguments)){throw 'Owned HR identity mismatch'}
    $Listeners=@(Get-NetTCPConnection -State Listen -OwningProcess $Current.ProcessId)
    if(@($Listeners|Where-Object LocalAddress -NE '127.0.0.1').Count -or $Hr[0].port -notin $Listeners.LocalPort -or $Hr[0].healthPort -notin $Listeners.LocalPort){throw 'Owned HR loopback listeners required'}
    return $Current
}
function Assert-OtherInputs {
    foreach($InputFile in $Manifest.inputs){
        if($InputFile.path -eq $ConfigFile){continue}
        if((Get-FileHash -LiteralPath $InputFile.path).Hash -ne $InputFile.hash){throw 'Unrelated runtime input changed'}
    }
}
function Assert-JobScope {
    $Sql="SELECT COUNT(*) FROM sys_job WHERE job_id=$($Manifest.jobId) AND tenant_id=100000 AND job_name='A3R$Marker' AND handler_name='employeeContractExpire' AND status='PAUSED' AND deleted=0; SELECT COUNT(*) FROM sys_job_log l JOIN sys_job j ON j.job_id=l.job_id WHERE l.execute_status='RUNNING' AND j.service_name IN ('hr','cloudflow-service-hr') AND j.job_id<>$($Manifest.jobId);"
    $Result=@($Sql|& mysql.exe --no-defaults --protocol=TCP --host=127.0.0.1 "--port=$($State.mysqlPort)" --user=root --batch --skip-column-names cloud_flow_db)
    if($LASTEXITCODE -ne 0 -or $Result.Count -ne 2 -or "$($Result[0])".Trim() -ne '1' -or "$($Result[1])".Trim() -ne '0'){throw 'Only the owned report-fault task may be running'}
}
function Restart-Hr([string]$Phase){
    $Out=$ManifestFile+".restart-$Phase.stdout.log";$Err=$ManifestFile+".restart-$Phase.stderr.log"
    if((Test-Path -LiteralPath $Out) -or (Test-Path -LiteralPath $Err)){throw 'Prior restart diagnostics retained'}
    $Helper=Start-Process -FilePath (Join-Path $PSHOME 'pwsh.exe') -WindowStyle Hidden -PassThru -WorkingDirectory $Root -ArgumentList @('-NoLogo','-NoProfile','-File',(Join-Path $PSScriptRoot 'restart-isolated-integration-service.ps1'),'-StatePath',$StateFile,'-ServiceName','hr','-RecoverExited') -RedirectStandardOutput $Out -RedirectStandardError $Err
    $Helper.WaitForExit()
    if($Helper.ExitCode -ne 0){throw 'Owned HR restart failed; inspect retained diagnostics'}
}
if($Action -eq 'Route'){
    if((Test-Path -LiteralPath $ManifestFile) -or (Test-Path -LiteralPath $Backup)){throw 'Existing fault evidence retained'}
    if($ProxyPort -lt 1024 -or $ProxyPort -gt 65535 -or $ProxyProcess -le 0 -or $JobId -le 0){throw 'Valid owned proxy and task required'}
    foreach($Entry in $State.processes){$Observed=Get-CimInstance Win32_Process -Filter "ProcessId=$($Entry.id)";if(-not $Observed -or -not $Observed.CommandLine.Contains($Entry.marker)){throw 'Original runtime process mismatch'}}
    $Proxy=Get-CimInstance Win32_Process -Filter "ProcessId=$ProxyProcess"
    if(-not $Proxy -or $Proxy.Name -ne 'node.exe' -or -not $Proxy.CommandLine.Contains('scripts/verify-batch-g-integration.mjs') -or -not $Proxy.CommandLine.Contains($StateFile) -or -not $Proxy.CommandLine.Contains('--a3-job-report-fault')){throw 'Proxy must belong to this owned verifier'}
    $ProxyListeners=@(Get-NetTCPConnection -State Listen -LocalPort $ProxyPort)
    if($ProxyListeners.Count -ne 1 -or $ProxyListeners[0].LocalAddress -ne '127.0.0.1' -or $ProxyListeners[0].OwningProcess -ne $ProxyProcess){throw 'Proxy listener ownership mismatch'}
    [void](Assert-OriginalProcess)
    $Original=[IO.File]::ReadAllBytes($ConfigFile)
    $Text=[Text.Encoding]::UTF8.GetString($Original)
    $OriginalUrl="cloudflow.job.auth-url=http://127.0.0.1:$($Auth[0].port)"
    if([regex]::Matches($Text,'(?m)^cloudflow\.job\.auth-url=[^\r\n]+\r?$').Count -ne 1 -or $OriginalUrl -notin ($Text -split '\r?\n')){throw 'Exactly one original auth report address required'}
    $RoutedText=$Text.Replace($OriginalUrl,"cloudflow.job.auth-url=http://127.0.0.1:$ProxyPort")
    [IO.File]::WriteAllBytes($Backup,$Original)
    $Manifest=[pscustomobject]@{statePath=$StateFile;status='PREPARED';jobId=$JobId;proxyPort=$ProxyPort;proxyProcess=$ProxyProcess;proxyCreated=$Proxy.CreationDate.ToUniversalTime().ToString('o');
        originalHash=(Get-FileHash -LiteralPath $Backup).Hash;routedHash=$null;stoppedProcess=0;stoppedCreated=$null;
        inputs=@($State.services|ForEach-Object{
            foreach($Name in @('service.args','integration.properties')){
                $File=Join-Path $Run "$($_.name)/$Name"
                [pscustomobject]@{path=$File;hash=(Get-FileHash -LiteralPath $File).Hash}
            }
        });productionModified=$false}
    Assert-JobScope
    Save-Manifest
    [IO.File]::WriteAllText($ConfigFile,$RoutedText,[Text.UTF8Encoding]::new($false))
    $Manifest.routedHash=(Get-FileHash -LiteralPath $ConfigFile).Hash;$Manifest.status='ROUTED';Save-Manifest
    Restart-Hr 'route'
    Assert-OtherInputs
    if((Get-FileHash -LiteralPath $ConfigFile).Hash -ne $Manifest.routedHash){throw 'Routed HR config changed'}
    $Manifest.status='ACTIVE';Save-Manifest
    'A3_REPORT_ROUTE_ACTIVE: actual_hr_restart=true; original_business_ports=true; only_report_address_changed=true; proxy_process_verified=true'
    exit 0
}
foreach($File in @($ManifestFile,$Backup)){if((Get-Item -LiteralPath $File).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Redirected fault evidence rejected'}}
$Manifest=Get-Content -LiteralPath $ManifestFile -Raw|ConvertFrom-Json
if($Manifest.statePath -ne $StateFile -or $Manifest.status -eq 'RESTORED'){throw 'Unrestored owned report fault required'}
if((Get-FileHash -LiteralPath $Backup).Hash -ne $Manifest.originalHash){throw 'Original backup changed'}
Assert-OtherInputs
$CurrentHash=(Get-FileHash -LiteralPath $ConfigFile).Hash
if($CurrentHash -notin @($Manifest.originalHash,$Manifest.routedHash)){throw 'Unexpected HR configuration writer'}
if($Action -eq 'Stop'){
    if($Manifest.status -ne 'ACTIVE' -or $CurrentHash -ne $Manifest.routedHash){throw 'Active routed HR required for outage'}
    Assert-JobScope
    $AuthConfig=Get-Content -LiteralPath (Join-Path $Run 'auth/integration.properties')
    $Discovery=@($AuthConfig|Where-Object{$_ -match '^spring\.cloud\.discovery\.client\.simple\.instances\.cloudflow-service-hr\['})
    if($Discovery.Count -ne 1 -or $Discovery[0] -ne "spring.cloud.discovery.client.simple.instances.cloudflow-service-hr[0].uri=http://127.0.0.1:$($Hr[0].port)"){throw 'Exactly one original HR status target required'}
    $Current=Assert-OriginalProcess
    $Manifest.stoppedProcess=$Current.ProcessId;$Manifest.stoppedCreated=$Current.CreationDate.ToUniversalTime().ToString('o');$Manifest.status='STOPPING';Save-Manifest
    $Verified=Get-CimInstance Win32_Process -Filter "ProcessId=$($Current.ProcessId)"
    if(-not $Verified -or $Verified.CreationDate -ne $Current.CreationDate -or $Verified.CommandLine -ne $Current.CommandLine){throw 'HR changed before stop'}
    [Diagnostics.Process]::GetProcessById($Current.ProcessId).Kill()
    Wait-Process -Id $Current.ProcessId -Timeout 30 -ErrorAction SilentlyContinue
    $Deadline=[DateTime]::UtcNow.AddSeconds(15)
    do {
        $Listeners=@(Get-NetTCPConnection -State Listen|Where-Object LocalPort -In @($Hr[0].port,$Hr[0].healthPort))
        if(@($Listeners|Where-Object{$_.LocalAddress -ne '127.0.0.1' -or $_.OwningProcess -ne $Current.ProcessId}).Count){throw 'HR port acquired by another process'}
        if(-not $Listeners.Count){break};Start-Sleep -Milliseconds 250
    }while([DateTime]::UtcNow -lt $Deadline)
    if($Listeners.Count -or (Get-Process -Id $Current.ProcessId -ErrorAction SilentlyContinue)){throw 'HR outage did not complete'}
    $Manifest.status='STOPPED';Save-Manifest
    'A3_REPORT_HR_STOPPED: original_discovery_target_unreachable=true; process_identity_verified=true; ports_free=true'
    exit 0
}
Assert-JobScope
[IO.File]::WriteAllBytes($ConfigFile,[IO.File]::ReadAllBytes($Backup))
$Manifest.status='RESTORING';Save-Manifest
Restart-Hr 'restore'
$State=Get-Content -LiteralPath $StateFile -Raw|ConvertFrom-Json
foreach($Entry in $State.processes){$Current=Get-CimInstance Win32_Process -Filter "ProcessId=$($Entry.id)";if(-not $Current -or -not $Current.CommandLine.Contains($Entry.marker)){throw 'Restored runtime ownership mismatch'}}
foreach($Service in $State.services){$Health=Invoke-RestMethod "http://127.0.0.1:$($Service.healthPort)/actuator/health" -TimeoutSec 5;if($Health.status -ne 'UP'){throw 'Restored runtime health failed'}}
foreach($InputFile in $Manifest.inputs){if((Get-FileHash -LiteralPath $InputFile.path).Hash -ne $InputFile.hash){throw 'Original runtime input restoration mismatch'}}
$Manifest.status='RESTORED';Save-Manifest
'A3_REPORT_ROUTE_RESTORED: original_report_address=true; original_inputs=12; processes_owned=9; six_services_up=true; production_modified=false'
