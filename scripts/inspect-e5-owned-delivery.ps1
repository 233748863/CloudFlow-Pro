param([ValidatePattern('^r[1-9][0-9]*$')][string]$Round='r1',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$RuntimeRound='r7')
$ErrorActionPreference='Stop'
. 'D:\CloudFlowPro\.cloudflow-runtime\use-data-drive.ps1'
$Root='D:\CloudFlowPro'
$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
$Source=Join-Path $Evidence "e5-marketing-independent-20261010-$RuntimeRound"
$Output=Join-Path $Evidence "e5-delivery-diagnosis-20261010-$Round"
if(Test-Path -LiteralPath $Output){throw 'Preserve existing delivery diagnosis'}
$LauncherPath=Join-Path $Source 'launcher-result.json'
$BusinessPath=Join-Path $Source 'result.json'
$Launcher=Get-Content -LiteralPath $LauncherPath -Raw|ConvertFrom-Json
$Business=Get-Content -LiteralPath $BusinessPath -Raw|ConvertFrom-Json -Depth 80
if($Launcher.passed -or -not $Launcher.inputsUnchanged -or -not $Launcher.processesStopped -or -not $Launcher.referenceKept){throw 'Stopped and preserved failed E5 round required'}
$Run=[IO.Path]::GetFullPath($Launcher.run)
if((Split-Path -Parent $Run) -ne (Join-Path $Root '.cloudflow-runtime/batch-g-integration') -or (Split-Path -Leaf $Run) -notmatch '^[a-f0-9]{32}$' -or (Split-Path -Leaf $Run) -eq '9799534e1a3a47b5958330f14ae16dc7'){throw 'Independent E5 database required'}
$StatePath=Join-Path $Run 'state.json'
$State=Get-Content -LiteralPath $StatePath -Raw|ConvertFrom-Json
if($State.status -ne 'STOPPED' -or [IO.Path]::GetFullPath($State.run) -ne $Run){throw 'Independent stopped state required'}
$Data=Join-Path $Run 'mysql-data'
foreach($Path in @($Root,$Run,$Data,$StatePath)){
    if((Get-Item -LiteralPath $Path).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Redirected diagnosis path'}
}
foreach($Owner in $State.processes){
    $Observed=Get-CimInstance Win32_Process -Filter "ProcessId=$($Owner.id)"
    if($Observed -and $Observed.CommandLine.Contains($Owner.marker)){throw 'Original independent process still running'}
}
if(@(Get-NetTCPConnection -State Listen -LocalPort $State.mysqlPort -ErrorAction SilentlyContinue).Count){throw 'Retained database port is occupied'}
[IO.Directory]::CreateDirectory($Output)|Out-Null
Set-Acl -LiteralPath $Output -AclObject (Get-Acl -LiteralPath $Run)
$Inputs=@(foreach($File in @($PSCommandPath,$LauncherPath,$BusinessPath,$StatePath,(Join-Path $Run 'crm/stdout.log'),(Join-Path $Source 'originals/scripts/runtime-checks/e5-marketing-limits.mjs'))){
    $Hash=(Get-FileHash -LiteralPath $File).Hash
    $Copy=Join-Path $Output ('originals/'+[IO.Path]::GetRelativePath($Root,$File))
    [IO.Directory]::CreateDirectory((Split-Path -Parent $Copy))|Out-Null
    [IO.File]::Copy($File,$Copy,$false)
    if((Get-FileHash -LiteralPath $Copy).Hash -ne $Hash){throw 'Diagnosis original differs'}
    [pscustomobject]@{Path=$File;Hash=$Hash;PreservedAt=$Copy}
})
$Inputs|ConvertTo-Json -Depth 4|Set-Content -LiteralPath (Join-Path $Output 'inputs.json') -Encoding utf8NoBOM
$Mysql=(Get-Command mysql.exe).Source
function Sql([string]$Statement){
    if($Statement -notmatch '^SELECT ' -or $Statement -match ';\s*\S|\bINTO\s+(OUTFILE|DUMPFILE)\b'){throw 'Single read required'}
    $Start=[Diagnostics.ProcessStartInfo]::new($Mysql)
    $Start.UseShellExecute=$false;$Start.CreateNoWindow=$true
    $Start.RedirectStandardInput=$true;$Start.RedirectStandardOutput=$true;$Start.RedirectStandardError=$true
    $Start.StandardInputEncoding=[Text.UTF8Encoding]::new($false);$Start.StandardOutputEncoding=[Text.UTF8Encoding]::new($false)
    $Start.Environment.Remove('MYSQL_PWD')|Out-Null
    foreach($Argument in @('--no-defaults','--protocol=TCP','--host=127.0.0.1',"--port=$($State.mysqlPort)",'--user=root','--skip-password','--batch','--raw','--skip-column-names','--default-character-set=utf8mb4','cloud_flow_db')){$Start.ArgumentList.Add($Argument)}
    $Child=[Diagnostics.Process]::Start($Start)
    $Stdout=$Child.StandardOutput.ReadToEndAsync();$Stderr=$Child.StandardError.ReadToEndAsync()
    $Child.StandardInput.WriteLine($Statement);$Child.StandardInput.Close()
    if(-not $Child.WaitForExit(30000)){$Child.Kill();$Child.WaitForExit();throw 'Diagnosis read timed out'}
    if($Child.ExitCode -ne 0){throw 'Diagnosis read failed; raw output withheld'}
    return $Stdout.GetAwaiter().GetResult().Trim()
}
$DatabaseProcess=$null;$Stopped=$false;$Failure=$null
try{
    $Start=[Diagnostics.ProcessStartInfo]::new((Get-Command mysqld.exe).Source)
    $Start.UseShellExecute=$false;$Start.CreateNoWindow=$true
    foreach($Argument in @('--no-defaults',"--datadir=$Data",'--bind-address=127.0.0.1',"--port=$($State.mysqlPort)",'--mysqlx=OFF','--skip-log-bin','--innodb-buffer-pool-size=128M','--max-connections=10','--read-only=ON','--super-read-only=ON','--event-scheduler=OFF',('--log-error='+(Join-Path $Output 'mysql-diagnosis.log')))){$Start.ArgumentList.Add($Argument)}
    $DatabaseProcess=[Diagnostics.Process]::Start($Start)
    $Ready=$false
    for($Attempt=0;$Attempt -lt 90;$Attempt++){
        try{if((Sql 'SELECT 1;') -eq '1'){$Ready=$true;break}}catch{}
        if($DatabaseProcess.HasExited){throw 'Readonly diagnosis database exited'}
        Start-Sleep -Milliseconds 500
    }
    if(-not $Ready -or [IO.Path]::GetFullPath((Sql 'SELECT @@datadir;')).TrimEnd('\','/') -ne $Data){throw 'Readonly database ownership differs'}
    if((Sql "SELECT CONCAT(@@read_only,':',@@super_read_only);") -ne '1:1'){throw 'Readonly database enforcement missing'}
    $TaskPath=@($Business.requests|Where-Object {$_.method -eq 'POST' -and $_.path -match '/mass-email/[0-9]+/send$' -and $_.status -eq 200})[-1]
    $TaskId=[regex]::Match($TaskPath.path,'/([0-9]+)/send$').Groups[1].Value
    if($TaskId -notmatch '^[1-9][0-9]*$'){throw 'Failed task identifier missing'}
    $ChannelId=@($Business.requests|Where-Object {$_.method -eq 'GET' -and $_.path -match '/message/channel/[0-9]+$'})[-1].path.Split('/')[-1]
    if($ChannelId -notmatch '^[1-9][0-9]*$'){throw 'Edited channel identifier missing'}
    $Channel=Sql "SELECT JSON_OBJECT('id',CAST(channel_id AS CHAR),'typeEmail',channel_type='EMAIL','hostLocal',smtp_host='localhost','portExpected',smtp_port=$($State.smtpFixture.port),'startTls',smtp_ssl_flag=0,'usernameExpected',smtp_username='fixture-user','secretPresent',smtp_pwd_cipher IS NOT NULL AND LENGTH(smtp_pwd_cipher)>0,'fromExpected',from_address='sender@example.com','nameExpected',from_name='CloudFlow E5','priority',priority,'rate',rate_limit_minute,'daily',daily_limit,'implemented',implemented_flag,'status',status,'deleted',deleted,'version',version) FROM sys_message_channel WHERE tenant_id=100000 AND channel_id=$ChannelId;"|ConvertFrom-Json
    $Candidates=Sql "SELECT JSON_OBJECT('id',CAST(channel_id AS CHAR),'matchesOwnedChannel',channel_id=$ChannelId,'hostLocal',smtp_host='localhost','portExpected',smtp_port=$($State.smtpFixture.port),'secretPresent',smtp_pwd_cipher IS NOT NULL AND LENGTH(smtp_pwd_cipher)>0,'priority',priority,'status',status,'deleted',deleted,'implemented',implemented_flag) FROM sys_message_channel WHERE tenant_id=100000 AND channel_type='EMAIL' ORDER BY priority,channel_id;"
    $CandidateRows=@($Candidates -split '\r?\n'|Where-Object{$_}|ForEach-Object{$_|ConvertFrom-Json})
    $AuditFields=Sql "SELECT DISTINCT audit_field FROM sys_audit_log WHERE tenant_id=100000 AND audit_name='修改消息渠道' ORDER BY audit_field;"
    $Task=Sql "SELECT JSON_OBJECT('draft',status='DRAFT','frozen',recipient_snapshot_time IS NOT NULL,'recipients',(SELECT COUNT(*) FROM crm_mass_email_recipient WHERE tenant_id=100000 AND mass_email_id=$TaskId)) FROM crm_mass_email WHERE tenant_id=100000 AND mass_email_id=$TaskId;"|ConvertFrom-Json
    $Deliveries=Sql "SELECT JSON_OBJECT('recipientId',CAST(recipient.recipient_id AS CHAR),'recipientStatus',recipient.status,'recordPresent',recipient.message_record_id IS NOT NULL,'deliveryId',CAST(delivery.delivery_id AS CHAR),'deliveryStatus',delivery.status,'attempts',delivery.attempt_count,'code',delivery.last_error_code,'created',CAST(delivery.create_time AS CHAR),'next',CAST(delivery.next_attempt_time AS CHAR),'started',CAST(delivery.send_started_time AS CHAR),'accepted',CAST(delivery.accepted_time AS CHAR)) FROM crm_mass_email_recipient recipient LEFT JOIN sys_message_delivery delivery ON delivery.tenant_id=recipient.tenant_id AND delivery.record_id=recipient.message_record_id WHERE recipient.tenant_id=100000 AND recipient.mass_email_id=$TaskId ORDER BY recipient.recipient_id;"
    $DeliveryRows=@($Deliveries -split '\r?\n'|Where-Object{$_}|ForEach-Object{$_|ConvertFrom-Json})
    $Counters=Sql "SELECT JSON_OBJECT('status',status,'total',total_count,'sent',sent_count,'failed',failed_count,'scheduled',CAST(scheduled_time AS CHAR),'started',CAST(start_time AS CHAR),'ended',CAST(end_time AS CHAR)) FROM crm_mass_email WHERE tenant_id=100000 AND mass_email_id=$TaskId;"|ConvertFrom-Json
    $Result=[ordered]@{Passed=$true;RuntimeRound=$RuntimeRound;Readonly=$true;SuperReadonly=$true;Channel=$Channel;Candidates=$CandidateRows;AuditFields=@($AuditFields -split '\r?\n');Task=$Task;TaskCounters=$Counters;Deliveries=$DeliveryRows;BusinessWrites=0;ProductModified=$false;ProductionModified=$false}
}catch{$Failure=$_.Exception.Message}
finally{
    if($DatabaseProcess){
        $Observed=Get-CimInstance Win32_Process -Filter "ProcessId=$($DatabaseProcess.Id)"
        if($Observed){
            if(-not $Observed.CommandLine.Contains($Data)){throw 'Diagnosis process ownership changed'}
            $DatabaseProcess.Kill($true)
        }
        $Stopped=$DatabaseProcess.WaitForExit(30000)
    }
    foreach($Input in $Inputs){
        if((Get-FileHash -LiteralPath $Input.Path).Hash -ne $Input.Hash -or (Get-FileHash -LiteralPath $Input.PreservedAt).Hash -ne $Input.Hash){$Failure='Original diagnosis input changed'}
    }
    if(-not $Stopped){$Failure='Readonly diagnosis database not stopped'}
}
if($Failure){@{Passed=$false;Failure=$Failure;Stopped=$Stopped}|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $Output 'result.json') -Encoding utf8NoBOM;throw $Failure}
$Result.Stopped=$Stopped
$Result|ConvertTo-Json -Depth 8|Set-Content -LiteralPath (Join-Path $Output 'result.json') -Encoding utf8NoBOM
"E5_DELIVERY_DIAGNOSIS: passed=true; readonly=true; stopped=$Stopped; business_writes=0; original_inputs_kept=true"
