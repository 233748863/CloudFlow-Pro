param([Parameter(Mandatory=$true)][ValidatePattern('^r[1-9][0-9]*$')][string]$RuntimeRound,
    [Parameter(Mandatory=$true)][ValidateRange(1,2147483647)][int]$ApprovalId)
$ErrorActionPreference='Stop'
. 'D:\CloudFlowPro\.cloudflow-runtime\use-data-drive.ps1'
$Root='D:\CloudFlowPro'
$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
$Source=Join-Path $Evidence "e3-credit-independent-20261009-$RuntimeRound"
$Output=Join-Path $Evidence "e3-credit-workflow-inspection-20261010-$RuntimeRound"
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
    $Tasks=@((Read-Sql "SELECT JSON_OBJECT('node',node_key,'assignee',CAST(assignee AS CHAR),'status',status,'type',task_type) FROM wf_task WHERE tenant_id=100000 AND instance_id=(SELECT instance_id FROM crm_approval WHERE tenant_id=100000 AND approval_id=$ApprovalId) ORDER BY task_id;").Split("`n")|Where-Object {$_}|ForEach-Object{$_|ConvertFrom-Json})
    $History=@((Read-Sql "SELECT JSON_OBJECT('node',node_key,'actor',CAST(operator_id AS CHAR),'action',action,'represented',on_behalf_of_user_id,'type',task_type,'time',create_time) FROM wf_task_history WHERE tenant_id=100000 AND instance_id=(SELECT instance_id FROM crm_approval WHERE tenant_id=100000 AND approval_id=$ApprovalId) AND operator_id IS NOT NULL AND action IN ('APPROVE','REJECT','COUNTERSIGN_APPROVE','COUNTERSIGN_REJECT') ORDER BY create_time,history_id;").Split("`n")|Where-Object {$_}|ForEach-Object{$_|ConvertFrom-Json})
    $Finance=@((Read-Sql "SELECT JSON_OBJECT('user',CAST(binding.user_id AS CHAR),'role',role.role_key,'status',account.status,'deleted',account.deleted) FROM sys_user_role binding JOIN sys_role role ON role.role_id=binding.role_id AND role.tenant_id=binding.tenant_id JOIN sys_user account ON account.user_id=binding.user_id AND account.tenant_id=binding.tenant_id WHERE binding.tenant_id=100000 AND role.role_key='finance' ORDER BY binding.user_id;").Split("`n")|ForEach-Object{$_|ConvertFrom-Json})
    $Credit=Read-Sql "SELECT JSON_OBJECT('version',credit.version,'approvedLimitRetained',credit.credit_limit=1000.03,'approvedThresholdRetained',credit.overdue_threshold=60.05,'currentInstanceMatchesInspectedApproval',credit.instance_id=approval.instance_id,'approvalStatus',approval.status,'pendingCount',(SELECT COUNT(*) FROM crm_approval pending WHERE pending.tenant_id=100000 AND pending.business_type='crm_customer_credit' AND pending.business_ref_id=$CustomerId AND pending.status='PENDING' AND pending.deleted=0)) FROM crm_customer_credit credit JOIN crm_approval approval ON approval.tenant_id=credit.tenant_id AND approval.business_ref_id=credit.customer_id AND approval.approval_id=$ApprovalId WHERE credit.tenant_id=100000 AND credit.customer_id=$CustomerId AND credit.deleted=0;"|ConvertFrom-Json
    $Result=[pscustomobject]@{RuntimeRound=$RuntimeRound;ApprovalId=$ApprovalId;Tasks=$Tasks;History=$History;FinanceRoleMembers=$Finance;SubmittedCreditVersion=$SubmittedVersion;Credit=$Credit;SuperReadOnly=$true;ReferenceRuntimeAccessed=$false;BusinessWrites=0}
}finally{
    if($Owned){$Current=Get-CimInstance Win32_Process -Filter "ProcessId=$($Owned.Id)";if($Current){if(-not $Current.CommandLine.Contains($Data)){throw 'Inspection process ownership changed'};$Owned.Kill($true)};if(-not $Owned.WaitForExit(30000)){throw 'Inspection database did not stop'};$Stopped=$true}
}
$Result|Add-Member -NotePropertyName InspectionProcessStopped -NotePropertyValue $Stopped
$Result|ConvertTo-Json -Depth 8|Set-Content -LiteralPath (Join-Path $Output 'result.json') -Encoding utf8NoBOM
$Result|ConvertTo-Json -Depth 8
