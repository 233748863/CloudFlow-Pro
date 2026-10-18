param([ValidatePattern('^r[1-9][0-9]*$')][string]$Round='r1',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$RuntimeRound='r9')
$ErrorActionPreference='Stop'
. 'D:\CloudFlowPro\.cloudflow-runtime\use-data-drive.ps1'
$Root='D:\CloudFlowPro'
$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
$Source=Join-Path $Evidence "e5-marketing-independent-20261010-$RuntimeRound"
$Output=Join-Path $Evidence "e5-refund-diagnosis-20261010-$Round"
if(Test-Path -LiteralPath $Output){throw 'Preserve existing refund diagnosis'}
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
$Inputs=@(foreach($File in @($PSCommandPath,$LauncherPath,$BusinessPath,$StatePath,(Join-Path $Run 'crm/stdout.log'),(Join-Path $Source 'originals/scripts/runtime-checks/e5-marketing-fixtures.mjs'))){
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
    if($Business.fixture.receipts.Count -lt 2){throw 'Two actual original receipts required'}
    $ReceivableId=[string]$Business.fixture.receipts[0].receivableId
    $ReceiptId=[string]$Business.fixture.receipts[1].eventId
    foreach($Value in @($ReceivableId,$ReceiptId)){if($Value -notmatch '^[1-9][0-9]*$'){throw 'Owned source identifier invalid'}}
    $Permission="EXISTS(SELECT 1 FROM sys_user_role memberships JOIN sys_role roles ON roles.role_id=memberships.role_id AND roles.tenant_id=memberships.tenant_id JOIN sys_role_menu grants ON grants.role_id=roles.role_id AND grants.tenant_id=roles.tenant_id JOIN sys_menu menus ON menus.menu_id=grants.menu_id WHERE memberships.tenant_id=100000 AND memberships.user_id=users.user_id AND roles.status='0' AND roles.deleted=0 AND menus.status='0' AND menus.perms='workflow:task:complete')"
    $People=Sql "SELECT JSON_OBJECT('id',CAST(users.user_id AS CHAR),'active',users.status='0' AND users.deleted=0,'taskPermission',$Permission,'financeRole',EXISTS(SELECT 1 FROM sys_user_role membership JOIN sys_role role ON role.role_id=membership.role_id AND role.tenant_id=membership.tenant_id WHERE membership.tenant_id=100000 AND membership.user_id=users.user_id AND role.role_key='finance' AND role.status='0' AND role.deleted=0)) FROM sys_user users WHERE users.tenant_id=100000 AND users.user_id IN (990000701,990000705,990000707) ORDER BY users.user_id;"
    $PeopleRows=@($People -split '\r?\n'|Where-Object{$_}|ForEach-Object{$_|ConvertFrom-Json})
    $Receivable=Sql "SELECT JSON_OBJECT('status',receivable.status,'version',receivable.version,'expectedReceived',receivable.received_amount=50.03,'validAmounts',receivable.received_amount<=receivable.planned_amount,'customerOwnerExpected',customer.owner_id=990000701,'customerActive',customer.deleted=0,'currencyExpected',contract.currency='CNY','pendingRefunds',(SELECT COUNT(*) FROM crm_approval approval WHERE approval.tenant_id=100000 AND approval.business_type='crm_refund' AND approval.business_ref_type='CRM_RECEIVABLE' AND approval.business_ref_id=$ReceivableId AND approval.status='PENDING' AND approval.deleted=0)) FROM crm_receivable receivable LEFT JOIN crm_customer customer ON customer.tenant_id=receivable.tenant_id AND customer.customer_id=receivable.customer_id LEFT JOIN oa_contract contract ON contract.tenant_id=receivable.tenant_id AND contract.contract_id=receivable.contract_id WHERE receivable.tenant_id=100000 AND receivable.receivable_id=$ReceivableId AND receivable.deleted=0;"|ConvertFrom-Json
    $Receipt=Sql "SELECT JSON_OBJECT('original',event.reversal_of_id IS NULL,'correctKind',event.event_type='RECEIPT' AND event.biz_type='RECEIVABLE','ownedReceivable',event.biz_id=$ReceivableId,'ownedCustomer',event.customer_id=(SELECT customer_id FROM crm_receivable WHERE tenant_id=100000 AND receivable_id=$ReceivableId),'currencyExpected',event.currency='CNY','actual',event.baseline_flag=0,'amountExpected',event.amount=20.02,'remainingSufficient',event.amount+COALESCE((SELECT SUM(reversal.amount) FROM crm_deal_event reversal WHERE reversal.tenant_id=100000 AND reversal.reversal_of_id=event.event_id),0)>=5.01) FROM crm_deal_event event WHERE event.tenant_id=100000 AND event.event_id=$ReceiptId;"|ConvertFrom-Json
    $Definitions=Sql "SELECT JSON_OBJECT('id',definition_id,'version',version,'status',status,'deleted',deleted,'archived',COALESCE(is_archived,0),'model',CAST(model_json AS JSON)) FROM wf_process_definition WHERE tenant_id=100000 AND process_key='crm_refund_review' ORDER BY version DESC,definition_id;"
    $DefinitionRows=@($Definitions -split '\r?\n'|Where-Object{$_}|ForEach-Object{$_|ConvertFrom-Json})
    $Approvals=Sql "SELECT JSON_OBJECT('id',CAST(approval_id AS CHAR),'status',status,'instancePresent',instance_id IS NOT NULL,'applicantExpected',applicant_id=990000705,'refundAmountType',JSON_TYPE(JSON_EXTRACT(payload_json,'$.refundAmount')),'receiptAmountType',JSON_TYPE(JSON_EXTRACT(payload_json,'$.originalReceiptAmount')),'originalVersionType',JSON_TYPE(JSON_EXTRACT(payload_json,'$.originalVersion')),'receiptIdType',JSON_TYPE(JSON_EXTRACT(payload_json,'$.receiptEventId')),'payloadCurrency',JSON_UNQUOTE(JSON_EXTRACT(payload_json,'$.currency')),'created',CAST(create_time AS CHAR),'updated',CAST(update_time AS CHAR)) FROM crm_approval WHERE tenant_id=100000 AND business_type='crm_refund' AND business_ref_type='CRM_RECEIVABLE' AND business_ref_id=$ReceivableId AND deleted=0 ORDER BY approval_id;"
    $ApprovalRows=@($Approvals -split '\r?\n'|Where-Object{$_}|ForEach-Object{$_|ConvertFrom-Json})
    $Result=[ordered]@{Passed=$true;RuntimeRound=$RuntimeRound;Readonly=$true;SuperReadonly=$true;People=$PeopleRows;Receivable=$Receivable;Receipt=$Receipt;Definitions=$DefinitionRows;Approvals=$ApprovalRows;BusinessWrites=0;ProductModified=$false;ProductionModified=$false}
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
"E5_REFUND_DIAGNOSIS: passed=true; readonly=true; stopped=$Stopped; business_writes=0; original_inputs_kept=true"
