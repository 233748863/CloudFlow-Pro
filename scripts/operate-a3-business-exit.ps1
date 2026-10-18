param(
    [Parameter(Mandatory=$true)][string]$StatePath,
    [Parameter(Mandatory=$true)][ValidateSet('Stop','Restore')][string]$Action,
    [Parameter(Mandatory=$true)][ValidatePattern('^[a-f0-9]{12}$')][string]$Marker,
    [long]$JobId,[long]$ContractId,[long]$LockConnection,
    [ValidatePattern('^[a-f0-9-]{36}$')][string]$ExecuteNo
)
$ErrorActionPreference='Stop'
$Root=[IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
. (Join-Path $Root '.cloudflow-runtime/use-data-drive.ps1')
$StateFile=(Resolve-Path -LiteralPath $StatePath).Path
$Run=Split-Path -Parent $StateFile
if((Split-Path -Parent $Run) -ne (Join-Path $Root '.cloudflow-runtime/batch-g-integration') -or (Split-Path -Leaf $Run) -notmatch '^[a-f0-9]{32}$'){throw 'Owned fixture required'}
$ManifestFile=Join-Path $Run "private/a3-business-exit-$Marker.json"
$State=Get-Content -LiteralPath $StateFile -Raw|ConvertFrom-Json
if($State.status -ne 'RUNNING' -or $State.run -ne $Run){throw 'Running owned fixture required'}
$Hr=@($State.services|Where-Object name -EQ 'hr')
$Owned=@($State.processes|Where-Object name -EQ 'hr')
$Arguments=Join-Path $Run 'hr/service.args'
if($Hr.Count -ne 1 -or $Owned.Count -ne 1 -or $Owned[0].marker -ne $Arguments){throw 'Unique original HR required'}
foreach($File in @($Root,$Run,$StateFile,$Arguments,(Split-Path -Parent $ManifestFile))){if((Get-Item -LiteralPath $File).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Redirected fixture rejected'}}
function Query([string]$Sql){
    $Result=@($Sql|& mysql.exe --no-defaults --protocol=TCP --host=127.0.0.1 "--port=$($State.mysqlPort)" --user=root --batch --skip-column-names cloud_flow_db)
    if($LASTEXITCODE -ne 0){throw 'Owned scope query failed'}
    return $Result
}
function Save-Manifest {$Manifest|ConvertTo-Json -Depth 6|Set-Content -LiteralPath $ManifestFile -Encoding utf8NoBOM}
function Assert-Inputs {foreach($InputFile in $Manifest.inputs){if((Get-FileHash -LiteralPath $InputFile.path).Hash -ne $InputFile.hash){throw 'Runtime input changed'}}}
function Assert-NoOtherTask {
    $Count=Query "SELECT COUNT(*) FROM sys_job_log l JOIN sys_job j ON j.job_id=l.job_id WHERE l.execute_status='RUNNING' AND j.service_name IN ('hr','cloudflow-service-hr') AND j.job_id<>$($Manifest.jobId);"
    if("$Count".Trim() -ne '0'){throw 'Another HR task is running'}
}
if($Action -eq 'Stop'){
    if(Test-Path -LiteralPath $ManifestFile){throw 'Previous exit evidence retained'}
    if($JobId -le 0 -or $ContractId -le 0 -or $LockConnection -le 0 -or -not $ExecuteNo){throw 'Owned task, contract, lock and execution required'}
    foreach($Entry in $State.processes){$Observed=Get-CimInstance Win32_Process -Filter "ProcessId=$($Entry.id)";if(-not $Observed -or -not $Observed.CommandLine.Contains($Entry.marker)){throw 'Original process identity mismatch'}}
    $Current=Get-CimInstance Win32_Process -Filter "ProcessId=$($Owned[0].id)"
    if(-not $Current -or $Current.Name -ne 'java.exe' -or -not $Current.CommandLine.Contains($Arguments)){throw 'Owned HR identity mismatch'}
    $Listeners=@(Get-NetTCPConnection -State Listen -OwningProcess $Current.ProcessId)
    if(@($Listeners|Where-Object LocalAddress -NE '127.0.0.1').Count -or $Hr[0].port -notin $Listeners.LocalPort -or $Hr[0].healthPort -notin $Listeners.LocalPort){throw 'Owned HR loopback listeners required'}
    $AuthConfig=Get-Content -LiteralPath (Join-Path $Run 'auth/integration.properties')
    $Discovery=@($AuthConfig|Where-Object{$_ -match '^spring\.cloud\.discovery\.client\.simple\.instances\.cloudflow-service-hr\['})
    if($Discovery.Count -ne 1 -or $Discovery[0] -ne "spring.cloud.discovery.client.simple.instances.cloudflow-service-hr[0].uri=http://127.0.0.1:$($Hr[0].port)"){throw 'Exactly one original HR status target required'}
    $Manifest=[pscustomobject]@{statePath=$StateFile;status='PREPARED';jobId=$JobId;contractId=$ContractId;executeNo=$ExecuteNo;lockConnection=$LockConnection;
        stoppedProcess=$Current.ProcessId;stoppedCreated=$Current.CreationDate.ToUniversalTime().ToString('o');
        inputs=@($State.services|ForEach-Object{foreach($Name in @('service.args','integration.properties')){$File=Join-Path $Run "$($_.name)/$Name";[pscustomobject]@{path=$File;hash=(Get-FileHash -LiteralPath $File).Hash}}});productionModified=$false}
    Assert-NoOtherTask
    $Scope=Query "SELECT COUNT(*) FROM sys_job WHERE job_id=$JobId AND tenant_id=100000 AND job_name='A3X$Marker' AND handler_name='employeeContractExpire' AND status='PAUSED' AND deleted=0; SELECT COUNT(*) FROM sys_job_log WHERE job_id=$JobId AND execute_no='$ExecuteNo' AND execute_status='RUNNING' AND report_time IS NULL; SELECT COUNT(*) FROM hr_employee_contract WHERE id=$ContractId AND tenant_id=100000 AND create_by='A3X$Marker' AND deleted=0 AND status='ACTIVE'; SELECT COUNT(*) FROM performance_schema.data_lock_waits w JOIN performance_schema.threads t ON t.THREAD_ID=w.BLOCKING_THREAD_ID JOIN performance_schema.data_locks d ON d.ENGINE_LOCK_ID=w.REQUESTING_ENGINE_LOCK_ID AND d.ENGINE=w.ENGINE WHERE t.PROCESSLIST_ID=$LockConnection AND d.OBJECT_SCHEMA='cloud_flow_db' AND d.OBJECT_NAME='hr_employee_contract'; SELECT COUNT(*) FROM sys_message_record WHERE biz_type='HR_CONTRACT_EXPIRING' AND biz_id='$ContractId';"
    if($Scope.Count -ne 5 -or "$($Scope[0])" -ne '1' -or "$($Scope[1])" -ne '1' -or "$($Scope[2])" -ne '1' -or [int]$Scope[3] -lt 1 -or "$($Scope[4])" -ne '0'){throw 'Actual owned business must still be blocked before exit'}
    Save-Manifest
    $Verified=Get-CimInstance Win32_Process -Filter "ProcessId=$($Current.ProcessId)"
    if(-not $Verified -or $Verified.CreationDate -ne $Current.CreationDate -or $Verified.CommandLine -ne $Current.CommandLine){throw 'HR changed before stop'}
    $Manifest.status='STOPPING';Save-Manifest
    [Diagnostics.Process]::GetProcessById($Current.ProcessId).Kill()
    Wait-Process -Id $Current.ProcessId -Timeout 30 -ErrorAction SilentlyContinue
    if(Get-Process -Id $Current.ProcessId -ErrorAction SilentlyContinue){throw 'Owned HR did not exit'}
    $Deadline=[DateTime]::UtcNow.AddSeconds(15)
    do {
        $Listeners=@(Get-NetTCPConnection -State Listen|Where-Object LocalPort -In @($Hr[0].port,$Hr[0].healthPort))
        if(@($Listeners|Where-Object{$_.LocalAddress -ne '127.0.0.1' -or $_.OwningProcess -ne $Current.ProcessId}).Count){throw 'HR port acquired by another process'}
        if(-not $Listeners.Count){break}
        Start-Sleep -Milliseconds 250
    }while([DateTime]::UtcNow -lt $Deadline)
    if($Listeners.Count){throw 'HR ports are not free after exit'}
    $Manifest.status='STOPPED';Save-Manifest
    'A3_BUSINESS_EXIT_STOPPED: actual_mysql_wait=true; original_hr_exited=true; ports_free=true; unrelated_hr_tasks=0; runtime_inputs_changed=0'
    exit 0
}
if((Get-Item -LiteralPath $ManifestFile).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Redirected exit manifest rejected'}
$Manifest=Get-Content -LiteralPath $ManifestFile -Raw|ConvertFrom-Json
if($Manifest.statePath -ne $StateFile -or $Manifest.status -eq 'RESTORED'){throw 'Unrestored owned exit required'}
Assert-Inputs
Assert-NoOtherTask
$Out=$ManifestFile+'.restart-restore.stdout.log';$Err=$ManifestFile+'.restart-restore.stderr.log'
if((Test-Path -LiteralPath $Out) -or (Test-Path -LiteralPath $Err)){throw 'Prior restore diagnostics retained'}
$Manifest.status='RESTORING';Save-Manifest
$Helper=Start-Process -FilePath (Join-Path $PSHOME 'pwsh.exe') -WindowStyle Hidden -PassThru -WorkingDirectory $Root -ArgumentList @('-NoLogo','-NoProfile','-File',(Join-Path $PSScriptRoot 'restart-isolated-integration-service.ps1'),'-StatePath',$StateFile,'-ServiceName','hr','-RecoverExited') -RedirectStandardOutput $Out -RedirectStandardError $Err
$Helper.WaitForExit()
if($Helper.ExitCode -ne 0){throw 'Owned HR restore failed; original evidence retained'}
$State=Get-Content -LiteralPath $StateFile -Raw|ConvertFrom-Json
foreach($Entry in $State.processes){$Current=Get-CimInstance Win32_Process -Filter "ProcessId=$($Entry.id)";if(-not $Current -or -not $Current.CommandLine.Contains($Entry.marker)){throw 'Restored process identity mismatch'}}
foreach($Service in $State.services){$Health=Invoke-RestMethod "http://127.0.0.1:$($Service.healthPort)/actuator/health" -TimeoutSec 5;if($Health.status -ne 'UP'){throw 'Restored service health failed'}}
Assert-Inputs
$Manifest.status='RESTORED';Save-Manifest
'A3_BUSINESS_EXIT_RESTORED: original_inputs=12; processes_owned=9; six_services_up=true; production_modified=false'
