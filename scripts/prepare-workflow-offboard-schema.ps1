param([Parameter(Mandatory=$true)][string]$StatePath,
    [ValidatePattern('^r[1-9][0-9]*$')][string]$Round='r1', [switch]$Apply)
$ErrorActionPreference='Stop'
$Root='D:\CloudFlowPro'
. (Join-Path $Root '.cloudflow-runtime/use-data-drive.ps1')
$Runtime=Join-Path $Root '.cloudflow-runtime/batch-g-integration'
$StateFile=(Resolve-Path -LiteralPath $StatePath).Path
$Run=Split-Path -Parent $StateFile
$Data=Join-Path $Run 'mysql-data'
if((Split-Path -Parent $Run) -ne $Runtime -or (Split-Path -Leaf $Run) -notmatch '^[a-f0-9]{32}$' -or (Split-Path -Leaf $StateFile) -ne 'state.json'){throw 'Owned isolated state required'}
foreach($Path in @($Root,$Runtime,$Run,$StateFile,$Data)){if((Get-Item -LiteralPath $Path).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Redirected owned path rejected'}}
$State=Get-Content -LiteralPath $StateFile -Raw|ConvertFrom-Json
if($State.status -ne 'RUNNING' -or [IO.Path]::GetFullPath($State.run) -ne $Run){throw 'Running owned environment required'}
$Owned=@($State.processes|Where-Object name -EQ 'mysql')
if($Owned.Count -ne 1 -or $Owned[0].marker -ne $Data){throw 'Unique owned database required'}
$Process=Get-CimInstance Win32_Process -Filter "ProcessId=$($Owned[0].id)"
if(-not $Process -or $Process.Name -ne 'mysqld.exe' -or -not $Process.CommandLine.Contains($Data)){throw 'Owned database identity mismatch'}
$Listeners=@(Get-NetTCPConnection -State Listen -LocalPort $State.mysqlPort)
if($Listeners.Count -ne 1 -or $Listeners[0].LocalAddress -ne '127.0.0.1'){throw 'Loopback database required'}
$Listener=Get-CimInstance Win32_Process -Filter "ProcessId=$($Listeners[0].OwningProcess)"
if(-not $Listener -or $Listener.Name -ne 'mysqld.exe' -or -not $Listener.CommandLine.Contains($Data) -or ($Listener.ProcessId -ne $Owned[0].id -and $Listener.ParentProcessId -ne $Owned[0].id)){throw 'Database listener ownership mismatch'}
$Evidence=Join-Path $Root ".cloudflow-runtime/full-prd-20260915/approved-runtime/a3-offboard-schema-20261003-$Round"
if(Test-Path -LiteralPath $Evidence){throw 'Previous evidence retained'}
[IO.Directory]::CreateDirectory($Evidence)|Out-Null
$Mysql=(Get-Command mysql.exe).Source
function Invoke-OwnedSql([string]$Sql){
    $Info=[Diagnostics.ProcessStartInfo]::new($Mysql)
    $Info.UseShellExecute=$false; $Info.CreateNoWindow=$true
    $Info.RedirectStandardInput=$true; $Info.RedirectStandardOutput=$true; $Info.RedirectStandardError=$true
    $Info.StandardInputEncoding=[Text.UTF8Encoding]::new($false); $Info.StandardOutputEncoding=[Text.UTF8Encoding]::new($false)
    $Info.Environment.Remove('MYSQL_PWD')|Out-Null
    foreach($Argument in @('--no-defaults','--protocol=TCP','--host=127.0.0.1',"--port=$($State.mysqlPort)",'--user=root','--skip-password','--batch','--raw','--skip-column-names','--default-character-set=utf8mb4','--connect-timeout=10')){$Info.ArgumentList.Add($Argument)}
    $Child=[Diagnostics.Process]::Start($Info)
    $Output=$Child.StandardOutput.ReadToEndAsync(); $Errors=$Child.StandardError.ReadToEndAsync()
    $Child.StandardInput.WriteLine('SET SESSION lock_wait_timeout=20; SET SESSION innodb_lock_wait_timeout=20; '+$Sql); $Child.StandardInput.Close()
    $Child.WaitForExit()
    if($Child.ExitCode -ne 0){[IO.File]::AppendAllText((Join-Path $Evidence 'sql-errors.log'),$Errors.GetAwaiter().GetResult());throw 'Owned schema SQL failed; private evidence retained'}
    return $Output.GetAwaiter().GetResult().Trim()
}
function Confirm-OwnedData {
    if([IO.Path]::GetFullPath((Invoke-OwnedSql 'SELECT @@datadir;')).TrimEnd('\','/') -ne $Data.TrimEnd('\','/')){throw 'Owned database data directory mismatch'}
}
Confirm-OwnedData
$Formal=Join-Path $Root 'cloudflow-backend/DB/02.cloudflow-workflow.sql'
$Approval=Join-Path $Root 'docs/design/A3-离职待办接续与姓名容量补充提案-20261003.md'
if([IO.File]::ReadAllText($Approval) -notmatch '用户明确批准'){throw 'Recorded approved offboard proposal required'}
$Inputs=@($Formal,$Approval,$PSCommandPath)|ForEach-Object{[pscustomobject]@{Path=$_;Hash=(Get-FileHash -LiteralPath $_).Hash}}
$Inputs|ConvertTo-Json|Set-Content (Join-Path $Evidence 'inputs.json') -Encoding utf8NoBOM
$Schema=[IO.File]::ReadAllText($Formal)
$Names=@(
    @{Table='wf_process_instance';Column='start_user_name'},@{Table='wf_task';Column='assignee_name'},
    @{Table='wf_task_history';Column='operator_name'},@{Table='wf_task_attachment';Column='uploader_name'},
    @{Table='wf_task_delegation';Column='from_user_name'},@{Table='wf_task_delegation';Column='to_user_name'},
    @{Table='wf_task_add_sign';Column='initiator_name'},@{Table='wf_countersign_vote';Column='voter_name'},
    @{Table='wf_node_record';Column='executor_name'},@{Table='wf_deploy_record';Column='deployer_name'},
    @{Table='wf_process_copy';Column='start_user_name'},@{Table='wf_deploy_rollback_history';Column='rollback_by_name'}
)
$Added=@(
    @{Column='disabled_from_user_id';Type='bigint';Width=''},@{Column='disabled_from_user_name';Type='varchar';Width='100'},
    @{Column='disabled_release_version';Type='int';Width=''},@{Column='disabled_release_event_id';Type='varchar';Width='64'}
)
function Formal-Definition([string]$Table,[string]$Column){
    $Body=[regex]::Match($Schema,'(?ms)^CREATE TABLE(?: IF NOT EXISTS)?\s+`?'+[regex]::Escape($Table)+'`?\s*\((.*?)^\) ENGINE=[^\r\n]*;').Groups[1].Value
    $Line=[regex]::Match($Body,'(?m)^\s*`?'+[regex]::Escape($Column)+'`?\s+[^\r\n]+').Value.Trim().TrimEnd(',')
    if(-not $Line){throw 'Approved formal column not found'}
    return $Line
}
$TableCount=Invoke-OwnedSql "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='cloud_flow_db' AND table_type='BASE TABLE';"
if($TableCount -ne '374'){throw 'Owned schema table baseline differs'}
$Changes=[ordered]@{}
foreach($Item in $Names){
    $Line=Formal-Definition $Item.Table $Item.Column
    if($Line -notmatch '(?i)\sVARCHAR\(100\)\s+DEFAULT NULL COMMENT '){throw 'Formal name definition differs from approved expansion'}
    $Actual=Invoke-OwnedSql "SELECT CONCAT_WS('|',data_type,character_maximum_length,is_nullable,IFNULL(column_default,'NULL')) FROM information_schema.columns WHERE table_schema='cloud_flow_db' AND table_name='$($Item.Table)' AND column_name='$($Item.Column)';"
    if($Actual -notin @('varchar|64|YES|NULL','varchar|100|YES|NULL')){throw 'Name baseline differs from approved old/new definition'}
    if(-not $Changes.Contains($Item.Table)){$Changes[$Item.Table]=[Collections.Generic.List[string]]::new()}
    if($Actual -eq 'varchar|64|YES|NULL'){$Changes[$Item.Table].Add('MODIFY COLUMN '+$Line)}
}
foreach($Item in $Added){
    $Line=Formal-Definition 'wf_task' $Item.Column
    $Expected='(?i)\s'+$Item.Type+ $(if($Item.Width){'\('+$Item.Width+'\)'}else{'(?:\([0-9]+\))?'})+'\s+DEFAULT NULL COMMENT '
    if($Line -notmatch $Expected){throw 'Formal release column differs from approval'}
    $Actual=Invoke-OwnedSql "SELECT CONCAT_WS('|',data_type,IFNULL(character_maximum_length,''),is_nullable,IFNULL(column_default,'NULL')) FROM information_schema.columns WHERE table_schema='cloud_flow_db' AND table_name='wf_task' AND column_name='$($Item.Column)';"
    if(-not $Actual){$Changes['wf_task'].Add('ADD COLUMN '+$Line)}
    elseif($Actual -ne "$($Item.Type)|$($Item.Width)|YES|NULL"){throw 'Existing release column differs from approval'}
}
if($Schema -notmatch 'KEY idx_disabled_handover \(tenant_id, disabled_from_user_id, status\)'){throw 'Approved handover index missing from formal schema'}
$Index=Invoke-OwnedSql "SELECT column_name FROM information_schema.statistics WHERE table_schema='cloud_flow_db' AND table_name='wf_task' AND index_name='idx_disabled_handover' ORDER BY seq_in_index;"
if(-not $Index){$Changes['wf_task'].Add('ADD KEY idx_disabled_handover (tenant_id, disabled_from_user_id, status)')}
elseif(($Index -split '\r?\n' -join ',') -ne 'tenant_id,disabled_from_user_id,status'){throw 'Existing handover index differs from approval'}
$Statements=@(foreach($Name in $Changes.Keys){if($Changes[$Name].Count){'ALTER TABLE cloud_flow_db.'+$Name+' '+($Changes[$Name] -join ', ')+';'}})
[IO.File]::WriteAllLines((Join-Path $Evidence 'approved-projection.sql'),$Statements,[Text.UTF8Encoding]::new($false))
if(-not $Apply){"OFFBOARD_SCHEMA_PREFLIGHT: tables=$TableCount; name_columns=12; release_columns=4; index=1; pending_tables=$($Statements.Count); database_writes=0";exit 0}
function Identifier([string]$Value){if($Value -notmatch '^[a-zA-Z_][a-zA-Z0-9_]*$'){throw 'Unexpected database identifier'};return [char]96+$Value+[char]96}
$Projections=@{}
foreach($Table in $Changes.Keys){
    $Columns=(Invoke-OwnedSql "SELECT column_name FROM information_schema.columns WHERE table_schema='cloud_flow_db' AND table_name='$Table' ORDER BY ordinal_position;") -split '\r?\n'
    $Primary=(Invoke-OwnedSql "SELECT column_name FROM information_schema.key_column_usage WHERE table_schema='cloud_flow_db' AND table_name='$Table' AND constraint_name='PRIMARY' ORDER BY ordinal_position;") -split '\r?\n'
    $Projection=@($Columns|ForEach-Object{$Quoted=Identifier $_;'IF('+$Quoted+' IS NULL,NULL,HEX(CAST('+$Quoted+' AS BINARY)))'}) -join ','
    $Order=@($Primary|ForEach-Object{Identifier $_}) -join ','
    $Projections[$Table]="SELECT SHA2(CAST(JSON_ARRAY($Projection) AS CHAR),256) FROM cloud_flow_db.$Table ORDER BY $Order;"
}
function Read-RowDigests {
    foreach($Table in $Changes.Keys){
        $Rows=Invoke-OwnedSql $Projections[$Table]
        [pscustomobject]@{Table=$Table;Rows=$(if($Rows){@($Rows -split '\r?\n').Count}else{0});Digest=[Convert]::ToHexString([Security.Cryptography.SHA256]::HashData([Text.Encoding]::UTF8.GetBytes($Rows)))}
    }
}
$Before=@(Read-RowDigests)
$Before|ConvertTo-Json|Set-Content (Join-Path $Evidence 'before-row-digests.json') -Encoding utf8NoBOM
Confirm-OwnedData
foreach($Statement in $Statements){Invoke-OwnedSql $Statement|Out-Null}
$After=@(Read-RowDigests)
$After|ConvertTo-Json|Set-Content (Join-Path $Evidence 'after-row-digests.json') -Encoding utf8NoBOM
if(Compare-Object $Before $After -Property Table,Rows,Digest){throw 'Original rows changed during approved schema preparation'}
foreach($Item in $Names){if((Invoke-OwnedSql "SELECT character_maximum_length FROM information_schema.columns WHERE table_schema='cloud_flow_db' AND table_name='$($Item.Table)' AND column_name='$($Item.Column)';") -ne '100'){throw 'Name capacity verification failed'}}
foreach($Item in $Added){
    $Actual=Invoke-OwnedSql "SELECT CONCAT_WS('|',data_type,IFNULL(character_maximum_length,''),is_nullable,IFNULL(column_default,'NULL')) FROM information_schema.columns WHERE table_schema='cloud_flow_db' AND table_name='wf_task' AND column_name='$($Item.Column)';"
    if($Actual -ne "$($Item.Type)|$($Item.Width)|YES|NULL"){throw 'Release column verification failed'}
}
if((Invoke-OwnedSql "SELECT COUNT(*) FROM cloud_flow_db.wf_task WHERE disabled_from_user_id IS NOT NULL OR disabled_from_user_name IS NOT NULL OR disabled_release_version IS NOT NULL OR disabled_release_event_id IS NOT NULL;") -ne '0'){throw 'Schema preparation must not invent historical release sources'}
$Index=Invoke-OwnedSql "SELECT column_name FROM information_schema.statistics WHERE table_schema='cloud_flow_db' AND table_name='wf_task' AND index_name='idx_disabled_handover' ORDER BY seq_in_index;"
if(($Index -split '\r?\n' -join ',') -ne 'tenant_id,disabled_from_user_id,status'){throw 'Handover index verification failed'}
if((Invoke-OwnedSql "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='cloud_flow_db' AND table_type='BASE TABLE';") -ne $TableCount){throw 'Table count changed unexpectedly'}
foreach($Item in $Inputs){if((Get-FileHash -LiteralPath $Item.Path).Hash -ne $Item.Hash){throw 'Schema preparation input changed'}}
"OFFBOARD_SCHEMA_APPLIED: tables=$TableCount; changed_tables=$($Statements.Count); name_columns=12; release_columns=4; index=1; original_rows_unchanged=true; original_names_unchanged=true; release_sources_invented=0; production_modified=false"
