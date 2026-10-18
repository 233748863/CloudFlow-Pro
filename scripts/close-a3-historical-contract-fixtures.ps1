param([ValidatePattern('^r[1-9][0-9]*$')][string]$Round='r1')
$ErrorActionPreference='Stop'
. 'D:\CloudFlowPro\.cloudflow-runtime/use-data-drive.ps1'
$Root='D:\CloudFlowPro'
$Run=Join-Path $Root '.cloudflow-runtime/batch-g-integration/9799534e1a3a47b5958330f14ae16dc7'
$StateFile=Join-Path $Run 'state.json'
foreach($Path in @($Root,$Run,$StateFile)){if((Get-Item -LiteralPath $Path).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Redirected fixture rejected'}}
$State=Get-Content -LiteralPath $StateFile -Raw|ConvertFrom-Json
if($State.run -ne $Run -or $State.status -ne 'RUNNING'){throw 'Owned running fixture required'}
foreach($Entry in $State.processes){$Current=Get-CimInstance Win32_Process -Filter "ProcessId=$($Entry.id)";if(-not $Current -or -not $Current.CommandLine.Contains($Entry.marker)){throw 'Owned process identity mismatch'}}
$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
$Output=Join-Path $Evidence "a3-historical-contract-cleanup-20261003-$Round.json"
if(Test-Path -LiteralPath $Output){throw 'Existing fixture evidence retained'}
function Query([string]$Sql){
    $Lines=@($Sql|& mysql.exe --no-defaults --protocol=TCP --host=127.0.0.1 "--port=$($State.mysqlPort)" --user=root --batch --raw --skip-column-names --default-character-set=utf8mb4 cloud_flow_db)
    if($LASTEXITCODE -ne 0){throw 'Owned database operation failed'}
    return $Lines
}
$Markers=@('A3Bfe79f79ae667','A3B4f8b9c2aa9b7','A3Bcc447cd2b4fd')
$Suffixes=@('today','day30','day31','past','terminated','expired','deleted')
$Where="tenant_id=100000 AND create_by IN ('A3Bfe79f79ae667','A3B4f8b9c2aa9b7','A3Bcc447cd2b4fd')"
$Read="SELECT JSON_OBJECT('id',CAST(id AS CHAR),'employee',CAST(employee_id AS CHAR),'number',contract_no,'status',status,'deleted',deleted,'start',start_date,'end',end_date,'creator',create_by) FROM hr_employee_contract WHERE $Where ORDER BY id;"
$Before=@(Query $Read|ForEach-Object{$_|ConvertFrom-Json})
if($Before.Count -ne 21 -or @($Before|Where-Object deleted -EQ 0).Count -ne 18){throw 'Exactly the three reviewed historical fixture sets required'}
foreach($Marker in $Markers){$Group=@($Before|Where-Object creator -EQ $Marker);if($Group.Count -ne 7){throw 'Historical marker count mismatch'};foreach($Suffix in $Suffixes){if(@($Group|Where-Object number -EQ "$Marker$Suffix").Count -ne 1){throw 'Historical contract identity mismatch'}}}
$Ready=@(Query "SELECT COUNT(*) FROM sys_job WHERE job_id=106 AND handler_name='employeeContractExpire' AND status='PAUSED'; SELECT COUNT(*) FROM sys_job WHERE handler_name='employeeContractExpire' AND status='ENABLED' AND deleted=0; SELECT COUNT(*) FROM sys_job_log WHERE handler_name='employeeContractExpire' AND execute_status='RUNNING';")
if(($Ready -join ',') -ne '1,0,0'){throw 'Contract work must be paused and settled'}
$Record=[pscustomobject]@{statePath=$StateFile;status='PREPARED';before=$Before;after=@();messagesPreserved=$false;productionModified=$false}
$Record|ConvertTo-Json -Depth 6|Set-Content -LiteralPath $Output -Encoding utf8NoBOM
$Ids=$Before.id -join ','
$Messages="SELECT record_id,send_status,biz_type,biz_id FROM sys_message_record WHERE tenant_id=100000 AND biz_type IN ('HR_CONTRACT_EXPIRING','HR_CONTRACT_EXPIRED') AND biz_id IN ($Ids) ORDER BY record_id;"
$BeforeMessages=(Query $Messages)-join "`n"
$Changed=@(Query "START TRANSACTION; UPDATE hr_employee_contract SET deleted=1 WHERE $Where AND id IN ($Ids) AND deleted=0; SELECT ROW_COUNT(); COMMIT;")
if(($Changed -join ',') -ne '18'){throw 'Unexpected historical fixture update count; retain snapshot'}
$After=@(Query $Read|ForEach-Object{$_|ConvertFrom-Json})
if($After.Count -ne 21){throw 'Historical fixture row lost'}
foreach($Row in $After){$Prior=@($Before|Where-Object id -EQ $Row.id);if($Prior.Count -ne 1 -or $Row.deleted -ne 1){throw 'Historical fixture not closed'};foreach($Name in @('id','employee','number','status','start','end','creator')){if($Row.$Name -ne $Prior[0].$Name){throw 'Historical business result changed'}}}
if(((Query $Messages)-join "`n") -ne $BeforeMessages){throw 'Historical messages changed'}
$Record.after=$After;$Record.status='COMPLETE';$Record.messagesPreserved=$true
$Record|ConvertTo-Json -Depth 6|Set-Content -LiteralPath $Output -Encoding utf8NoBOM
'A3_HISTORICAL_CONTRACT_CLEANUP: reviewed_rows=21; changed_active_rows=18; business_results_preserved=true; messages_preserved=true; forced_execution_states=0; production_modified=false'
