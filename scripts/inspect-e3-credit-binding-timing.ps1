param([Parameter(Mandatory=$true)][ValidatePattern('^r[1-9][0-9]*$')][string]$RuntimeRound,
    [Parameter(Mandatory=$true)][ValidateRange(1,2147483647)][int]$ApprovalId)
$ErrorActionPreference='Stop'
. 'D:\CloudFlowPro\.cloudflow-runtime\use-data-drive.ps1'
$Root='D:\CloudFlowPro'
$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
$Source=Join-Path $Evidence "e3-credit-independent-20261009-$RuntimeRound"
$Output=Join-Path $Evidence "e3-credit-binding-timing-20261010-$RuntimeRound"
if(Test-Path -LiteralPath $Output){throw 'Preserve previous workflow inspection'}
$Launcher=Get-Content -LiteralPath (Join-Path $Source 'launcher-result.json') -Raw|ConvertFrom-Json
$Fixture=Get-Content -LiteralPath (Join-Path $Source 'fixture.json') -Raw|ConvertFrom-Json
$CreditApproval=@($Fixture.approvals|Where-Object { [string]$_.id -eq [string]$ApprovalId -and $_.kind -eq 'credit' })
if($CreditApproval.Count -ne 1 -or [string]$CreditApproval[0].customerId -notmatch '^[1-9][0-9]*$' -or $Fixture.marker -notmatch '^E3C_[a-f0-9]{12}$'){throw 'Owned credit approval required'}
$CustomerId=[string]$CreditApproval[0].customerId
$SubmittedVersion=$CreditApproval[0].request.version
$Run=[IO.Path]::GetFullPath($Launcher.run)
if((Split-Path -Parent $Run) -ne (Join-Path $Root '.cloudflow-runtime/batch-g-integration') -or (Split-Path -Leaf $Run) -notmatch '^[a-f0-9]{32}$' -or $Run.EndsWith('9799534e1a3a47b5958330f14ae16dc7')){throw 'Independent run required'}
$State=Get-Content -LiteralPath (Join-Path $Run 'state.json') -Raw|ConvertFrom-Json
if($State.status -ne 'STOPPED' -or -not $Launcher.processesStopped){throw 'Completed independent runtime required'}
foreach($Entry in $State.processes){$Observed=Get-CimInstance Win32_Process -Filter "ProcessId=$($Entry.id)";if($Observed -and $Observed.CommandLine.Contains($Entry.marker)){throw 'Independent runtime remains active'}}
$Data=Join-Path $Run 'mysql-data'
if((Get-Item -LiteralPath $Data).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Redirected database rejected'}
[IO.Directory]::CreateDirectory($Output)|Out-Null
[IO.File]::Copy($PSCommandPath,(Join-Path $Output 'original.ps1'),$false)
$Mysql=(Get-Command mysql.exe).Source
$Mysqld=Join-Path (Split-Path -Parent $Mysql) 'mysqld.exe'
$Listener=[Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback,0)
$Listener.Start()
try{$Port=$Listener.LocalEndpoint.Port}finally{$Listener.Stop()}
function Read-Sql([string]$Statement){
    if($Statement -notmatch '^SELECT ' -or $Statement -match ';\s*\S'){throw 'One read-only statement required'}
    $Info=[Diagnostics.ProcessStartInfo]::new($Mysql)
    $Info.UseShellExecute=$false;$Info.CreateNoWindow=$true
    $Info.RedirectStandardInput=$true;$Info.RedirectStandardOutput=$true;$Info.RedirectStandardError=$true
    $Info.StandardInputEncoding=[Text.UTF8Encoding]::new($false);$Info.StandardOutputEncoding=[Text.UTF8Encoding]::new($false)
    $Info.Environment.Remove('MYSQL_PWD')|Out-Null
    foreach($Argument in @('--no-defaults','--protocol=TCP','--host=127.0.0.1',"--port=$Port",'--user=root','--skip-password','--batch','--raw','--skip-column-names','--default-character-set=utf8mb4','cloud_flow_db')){$Info.ArgumentList.Add($Argument)}
    $Child=[Diagnostics.Process]::Start($Info)
    $Stdout=$Child.StandardOutput.ReadToEndAsync();$Stderr=$Child.StandardError.ReadToEndAsync()
    $Child.StandardInput.WriteLine($Statement);$Child.StandardInput.Close()
    if(-not $Child.WaitForExit(20000)){$Child.Kill();$Child.WaitForExit();throw 'Inspection read timed out'}
    if($Child.ExitCode -ne 0){throw 'Inspection read failed; raw output withheld'}
    return $Stdout.GetAwaiter().GetResult().Trim()
}
$Owned=$null;$Stopped=$false
try{
    $Owned=Start-Process -FilePath $Mysqld -WindowStyle Hidden -PassThru -WorkingDirectory $Run -RedirectStandardOutput (Join-Path $Output 'mysql.stdout.log') -RedirectStandardError (Join-Path $Output 'mysql.stderr.log') -ArgumentList @('--no-defaults',"--datadir=`"$Data`"",'--bind-address=127.0.0.1',"--port=$Port",'--mysqlx=OFF','--skip-log-bin','--super-read-only=ON','--innodb-buffer-pool-size=64M',"--log-error=`"$(Join-Path $Output 'mysql.log')`"")
    $Ready=$false
    foreach($Attempt in 1..60){try{if((Read-Sql 'SELECT 1;') -eq '1'){$Ready=$true;break}}catch{};if($Owned.HasExited){throw 'Read-only database exited'};Start-Sleep -Milliseconds 500}
    if(-not $Ready -or [IO.Path]::GetFullPath((Read-Sql 'SELECT @@datadir;')).TrimEnd('\','/') -ne $Data -or (Read-Sql 'SELECT @@super_read_only;') -ne '1'){throw 'Read-only database ownership failed'}
    if((Read-Sql "SELECT COUNT(*) FROM crm_customer WHERE tenant_id=100000 AND customer_id=$CustomerId AND customer_code LIKE '$($Fixture.marker)_%';") -ne '1'){throw 'Owned credit customer required'}
    $Timeline=Read-Sql "SELECT JSON_OBJECT('approvalId',approval.approval_id,'approvalCreated',approval.create_time,'approvalUpdated',approval.update_time,'approvalStatus',approval.status,'bound',approval.instance_id IS NOT NULL,'creditUpdated',credit.update_time,'creditVersion',credit.version,'bypassTime',credit.bypass_time,'instanceCreated',instance.create_time,'instanceStarted',instance.start_time,'instanceUpdated',instance.update_time,'instanceStatus',instance.status,'creationToBindingSeconds',TIMESTAMPDIFF(SECOND,approval.create_time,approval.update_time),'creationToInstanceSeconds',TIMESTAMPDIFF(SECOND,approval.create_time,instance.create_time)) FROM crm_approval approval JOIN crm_customer_credit credit ON credit.tenant_id=approval.tenant_id AND credit.customer_id=approval.business_ref_id LEFT JOIN wf_process_instance instance ON instance.tenant_id=approval.tenant_id AND instance.instance_id=approval.instance_id WHERE approval.tenant_id=100000 AND approval.approval_id=$ApprovalId;"|ConvertFrom-Json
    $Tasks=@((Read-Sql "SELECT JSON_OBJECT('node',node_key,'status',status,'created',create_time) FROM wf_task WHERE tenant_id=100000 AND instance_id=(SELECT instance_id FROM crm_approval WHERE tenant_id=100000 AND approval_id=$ApprovalId) ORDER BY task_id;").Split("`n")|Where-Object {$_}|ForEach-Object{$_|ConvertFrom-Json})
    $Outbox=@((Read-Sql "SELECT JSON_OBJECT('id',id,'status',status,'created',created_at,'published',published_at,'nextRetry',next_retry_at,'retryCount',retry_count,'hasError',last_error IS NOT NULL,'errorKind',CASE WHEN last_error LIKE '%timeout%' THEN 'TIMEOUT' WHEN last_error LIKE '%deadlock%' THEN 'DEADLOCK' WHEN last_error LIKE '%refused%' THEN 'CONNECTION_REFUSED' WHEN last_error IS NOT NULL THEN 'OTHER_WITHHELD' ELSE NULL END) FROM outbox_event WHERE tenant_id=100000 AND event_type='CRM_APPROVAL_SUBMITTED' AND aggregate_id=$ApprovalId ORDER BY id;").Split("`n")|Where-Object {$_}|ForEach-Object{$_|ConvertFrom-Json})
    $LogFacts=[Collections.Generic.List[object]]::new()
    foreach($LogFile in @(Get-ChildItem -LiteralPath $Run -File -Filter '*.log' -Recurse)){
        foreach($LogLine in [IO.File]::ReadLines($LogFile.FullName)){
            if($LogLine -notmatch "approvalId[=:]\s*$ApprovalId\b" -and $LogLine -notmatch "crm_customer_credit:$ApprovalId\b"){continue}
            $Category=if($LogLine.Contains('提交后即时启动')){'IMMEDIATE_START_FAILED'}elseif($LogLine.Contains('启动 CRM 审批流程失败')){'WORKFLOW_START_FAILED'}elseif($LogLine.Contains('审批流程已存在')){'ALREADY_BOUND'}elseif($LogLine.Contains('instance already exists')){'CONSUMER_ALREADY_BOUND'}elseif($LogLine.Contains('Duplicate')){'DUPLICATE_KEY'}else{'OWNED_APPROVAL_REFERENCE'}
            $TimeMatch=[regex]::Match($LogLine,'\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:\.\d+)?')
            $LogFacts.Add([pscustomobject]@{File=[IO.Path]::GetRelativePath($Run,$LogFile.FullName);Time=$TimeMatch.Value;Category=$Category})
        }
    }
    $BusinessResult=Get-Content -LiteralPath (Join-Path $Source 'result.json') -Raw|ConvertFrom-Json
    $Result=[pscustomobject]@{RuntimeRound=$RuntimeRound;ApprovalId=$ApprovalId;Timeline=$Timeline;Tasks=$Tasks;Outbox=$Outbox;LogFacts=@($LogFacts);BusinessStartedUtc=$BusinessResult.startedAt;BusinessEndedUtc=$BusinessResult.endedAt;BusinessResultSha256=(Get-FileHash -LiteralPath (Join-Path $Source 'result.json') -Algorithm SHA256).Hash;FixtureSha256=(Get-FileHash -LiteralPath (Join-Path $Source 'fixture.json') -Algorithm SHA256).Hash;DatabaseTimeZone=(Read-Sql 'SELECT @@global.time_zone,@@system_time_zone;');SuperReadOnly=$true;ReferenceRuntimeAccessed=$false;BusinessWrites=0}
}finally{
    if($Owned){$Current=Get-CimInstance Win32_Process -Filter "ProcessId=$($Owned.Id)";if($Current){if(-not $Current.CommandLine.Contains($Data)){throw 'Inspection process ownership changed'};$Owned.Kill($true)};if(-not $Owned.WaitForExit(30000)){throw 'Inspection database did not stop'};$Stopped=$true}
}
$Result|Add-Member -NotePropertyName InspectionProcessStopped -NotePropertyValue $Stopped
$Result|ConvertTo-Json -Depth 8|Set-Content -LiteralPath (Join-Path $Output 'result.json') -Encoding utf8NoBOM
$Result|ConvertTo-Json -Depth 8
