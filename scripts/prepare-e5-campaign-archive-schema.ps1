param([ValidatePattern('^r[1-9][0-9]*$')][string]$Round='r1',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$BackendRound='r145')
$ErrorActionPreference='Stop'
. 'D:\CloudFlowPro\.cloudflow-runtime\use-data-drive.ps1'
$Root='D:\CloudFlowPro'
$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
$Run=Join-Path $Root '.cloudflow-runtime/batch-g-integration/9799534e1a3a47b5958330f14ae16dc7'
$Output=Join-Path $Evidence "e5-campaign-archive-schema-20261010-$Round"
if(Test-Path -LiteralPath $Output){throw 'Preserve earlier local E5 schema evidence'}
$StatePath=Join-Path $Run 'state.json'
$State=Get-Content -LiteralPath $StatePath -Raw|ConvertFrom-Json
if($State.status -ne 'RUNNING' -or [IO.Path]::GetFullPath($State.run) -ne $Run -or $State.services.Count -ne 6 -or $State.processes.Count -ne 9){throw 'Owned reference runtime required'}
$Data=Join-Path $Run 'mysql-data'
foreach($Path in @($Root,$Run,$StatePath,$Data)){
    if((Get-Item -LiteralPath $Path).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Redirected local schema path rejected'}
}
$Owner=@($State.processes|Where-Object name -EQ 'mysql')
if($Owner.Count -ne 1 -or $Owner[0].marker -ne $Data){throw 'Unique owned database required'}
$Observed=Get-CimInstance Win32_Process -Filter "ProcessId=$($Owner[0].id)"
if(-not $Observed -or $Observed.Name -ne 'mysqld.exe' -or -not $Observed.CommandLine.Contains($Data)){throw 'Owned database process differs'}
$Listeners=@(Get-NetTCPConnection -State Listen -LocalPort $State.mysqlPort)
if($Listeners.Count -ne 1 -or $Listeners[0].LocalAddress -ne '127.0.0.1'){throw 'Loopback database required'}
$Listener=Get-CimInstance Win32_Process -Filter "ProcessId=$($Listeners[0].OwningProcess)"
if(-not $Listener -or -not $Listener.CommandLine.Contains($Data) -or ($Listener.ProcessId -ne $Owner[0].id -and $Listener.ParentProcessId -ne $Owner[0].id)){throw 'Database listener ownership differs'}
$Mysql=(Get-Command mysql.exe).Source
function Sql([string]$Statement){
    $Start=[Diagnostics.ProcessStartInfo]::new($Mysql)
    $Start.UseShellExecute=$false;$Start.CreateNoWindow=$true
    $Start.RedirectStandardInput=$true;$Start.RedirectStandardOutput=$true;$Start.RedirectStandardError=$true
    $Start.StandardInputEncoding=[Text.UTF8Encoding]::new($false);$Start.StandardOutputEncoding=[Text.UTF8Encoding]::new($false)
    $Start.Environment.Remove('MYSQL_PWD')|Out-Null
    foreach($Argument in @('--no-defaults','--protocol=TCP','--host=127.0.0.1',"--port=$($State.mysqlPort)",'--user=root','--skip-password','--batch','--raw','--skip-column-names','--default-character-set=utf8mb4')){$Start.ArgumentList.Add($Argument)}
    $Child=[Diagnostics.Process]::Start($Start)
    $Stdout=$Child.StandardOutput.ReadToEndAsync();$Stderr=$Child.StandardError.ReadToEndAsync()
    $Child.StandardInput.WriteLine($Statement);$Child.StandardInput.Close()
    if(-not $Child.WaitForExit(120000)){$Child.Kill();$Child.WaitForExit();throw 'Owned schema client timed out'}
    if($Child.ExitCode -ne 0){throw 'Owned schema operation failed; raw diagnostics withheld'}
    return $Stdout.GetAwaiter().GetResult().Trim()
}
if([IO.Path]::GetFullPath((Sql 'SELECT @@datadir;')).TrimEnd('\','/') -ne $Data){throw 'Owned database directory differs'}
$SchemaPath=Join-Path $Root 'cloudflow-backend/DB/05.cloudflow-crm.sql'
$BuildPath=Join-Path $Evidence "h3-portal-finance-20261002-backend-$BackendRound-inputs.json"
$Build=Get-Content -LiteralPath $BuildPath -Raw|ConvertFrom-Json
$SchemaEntry=@($Build|Where-Object{[IO.Path]::GetFullPath($_.Path,$Root) -eq $SchemaPath})
if($SchemaEntry.Count -ne 1 -or (Get-FileHash -LiteralPath $SchemaPath).Hash -ne $SchemaEntry[0].Hash){throw 'Formal schema differs from current verified build'}
$Definition=[regex]::Match([IO.File]::ReadAllText($SchemaPath),'(?ms)^CREATE TABLE crm_campaign_log\s*\(.*?^\) ENGINE=.*?;').Value
if(-not $Definition){throw 'Formal marketing log definition unavailable'}
$Names=@('archive_payload','archive_checksum','archived_time','archive_checked_time')
$Clauses=@(foreach($Name in $Names){
    $Line=[regex]::Match($Definition,('(?m)^\s+'+$Name+'\s+[^\r\n]+')).Value.Trim().TrimEnd(',')
    if(-not $Line -or -not $Line.Contains('DEFAULT NULL')){throw 'Formal nullable archive column differs'}
    'ADD COLUMN '+$Line
})
$IndexLine=[regex]::Match($Definition,'(?m)^\s+KEY idx_crm_campaign_log_archive\s+[^\r\n]+').Value.Trim().TrimEnd(',')
if($IndexLine -ne 'KEY idx_crm_campaign_log_archive (tenant_id, archive_checked_time, action_time, log_id)'){throw 'Formal archive index differs'}
$Clauses+='ADD '+$IndexLine
$Existing=[int](Sql "SELECT COUNT(*) FROM information_schema.columns WHERE table_schema='cloud_flow_db' AND table_name='crm_campaign_log' AND column_name IN ('archive_payload','archive_checksum','archived_time','archive_checked_time');")
$ExistingIndex=[int](Sql "SELECT COUNT(DISTINCT index_name) FROM information_schema.statistics WHERE table_schema='cloud_flow_db' AND table_name='crm_campaign_log' AND index_name='idx_crm_campaign_log_archive';")
if(($Existing -ne 0 -or $ExistingIndex -ne 0) -and ($Existing -ne 4 -or $ExistingIndex -ne 1)){throw 'Partial local archive structure requires inspection'}
[IO.Directory]::CreateDirectory($Output)|Out-Null
Set-Acl -LiteralPath $Output -AclObject (Get-Acl -LiteralPath $Run)
$Inputs=@(foreach($Source in @($PSCommandPath,$SchemaPath,$BuildPath,$StatePath)){
    $Copy=Join-Path $Output ('originals/'+[IO.Path]::GetRelativePath($Root,$Source))
    [IO.Directory]::CreateDirectory((Split-Path -Parent $Copy))|Out-Null
    $Hash=(Get-FileHash -LiteralPath $Source).Hash
    [IO.File]::Copy($Source,$Copy,$false)
    if((Get-FileHash -LiteralPath $Copy).Hash -ne $Hash){throw 'Schema preparation original differs'}
    [pscustomobject]@{Path=$Source;Hash=$Hash;PreservedAt=$Copy}
})
$Inputs|ConvertTo-Json -Depth 4|Set-Content -LiteralPath (Join-Path $Output 'before-inputs.json') -Encoding utf8NoBOM
Sql 'SHOW CREATE TABLE cloud_flow_db.crm_campaign_log;'|Set-Content -LiteralPath (Join-Path $Output 'schema-before.txt') -Encoding utf8NoBOM
$Tables=@('crm_lead','crm_contact','crm_territory','crm_lead_score_rule','crm_campaign','crm_target_list','crm_target_list_member','crm_campaign_target_list','crm_customer','crm_customer_credit','crm_opportunity','crm_opportunity_lost_detail','crm_lost_reason','crm_competitor','crm_quote','crm_quote_line','crm_receivable','crm_approval','oa_contract','sys_business_rule','sys_business_rule_version','sys_business_rule_hit_record','sys_user','sys_user_role','sys_role','sys_role_menu','sys_dept','sys_config','sys_message_record','sys_message_delivery','sys_message_subscribe','crm_campaign_log','crm_mass_email','crm_mass_email_recipient','crm_email_tracking_link','crm_email_suppression','crm_deal_team','crm_deal_event','sys_message_channel','sys_message_template')
$Columns=@{};$Primary=@{}
foreach($Table in $Tables){
    $Columns[$Table]=@((Sql "SELECT column_name FROM information_schema.columns WHERE table_schema='cloud_flow_db' AND table_name='$Table' ORDER BY ordinal_position;").Split([char]10)|ForEach-Object{$_.Trim()})
    $Primary[$Table]=@((Sql "SELECT column_name FROM information_schema.key_column_usage WHERE table_schema='cloud_flow_db' AND table_name='$Table' AND constraint_name='PRIMARY' ORDER BY ordinal_position;").Split([char]10)|ForEach-Object{$_.Trim()})
    if(-not $Columns[$Table].Count -or -not $Primary[$Table].Count -or @(@($Columns[$Table])+@($Primary[$Table])|Where-Object{$_ -notmatch '^[a-z_][a-z0-9_]*$'}).Count){throw 'Original business column names invalid'}
}
function Snapshot{
    $Values=@{}
    foreach($Table in $Tables){
        $Expression=($Columns[$Table]|ForEach-Object{'HEX('+[char]96+$_+[char]96+')'}) -join ','
        $Order=($Primary[$Table]|ForEach-Object{[string][char]96+$_+[char]96}) -join ','
        $Rows=Sql "SELECT SHA2(CAST(JSON_ARRAY($Expression) AS CHAR),256) FROM cloud_flow_db.$Table ORDER BY $Order;"
        $Values[$Table]=[Convert]::ToHexString([Security.Cryptography.SHA256]::HashData([Text.Encoding]::UTF8.GetBytes($Rows)))
    }
    return $Values
}
$Before=Snapshot
$Before|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $Output 'business-before.json') -Encoding utf8NoBOM
$TableCount=Sql "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='cloud_flow_db' AND table_type='BASE TABLE';"
$Statement='ALTER TABLE cloud_flow_db.crm_campaign_log '+($Clauses -join ', ')+';'
$Statement|Set-Content -LiteralPath (Join-Path $Output 'owned-statement.txt') -Encoding utf8NoBOM
if($Existing -eq 0){Sql $Statement|Out-Null}
$Actual=Sql "SELECT CONCAT(column_name,':',column_type,':',is_nullable,':',COALESCE(column_default,'NULL')) FROM information_schema.columns WHERE table_schema='cloud_flow_db' AND table_name='crm_campaign_log' AND column_name IN ('archive_payload','archive_checksum','archived_time','archive_checked_time') ORDER BY column_name;"
$Expected=@('archive_checked_time:datetime:YES:NULL','archive_checksum:binary(32):YES:NULL','archive_payload:blob:YES:NULL','archived_time:datetime:YES:NULL') -join [Environment]::NewLine
if(($Actual -replace '\r','') -ne ($Expected -replace '\r','')){throw 'Actual archive columns differ from formal definition'}
$Index=Sql "SELECT GROUP_CONCAT(column_name ORDER BY seq_in_index) FROM information_schema.statistics WHERE table_schema='cloud_flow_db' AND table_name='crm_campaign_log' AND index_name='idx_crm_campaign_log_archive';"
if($Index -ne 'tenant_id,archive_checked_time,action_time,log_id'){throw 'Actual archive index differs'}
if((Sql 'SELECT COUNT(*) FROM cloud_flow_db.crm_campaign_log WHERE archive_payload IS NOT NULL OR archive_checksum IS NOT NULL OR archived_time IS NOT NULL OR archive_checked_time IS NOT NULL;') -ne '0'){throw 'Preparation must not archive existing business rows'}
$After=Snapshot
$After|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $Output 'business-after.json') -Encoding utf8NoBOM
foreach($Table in $Tables){if($Before[$Table] -ne $After[$Table]){throw 'Original business values changed during schema preparation'}}
if((Sql "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='cloud_flow_db' AND table_type='BASE TABLE';") -ne $TableCount){throw 'Local schema preparation changed table inventory'}
foreach($Input in $Inputs){if((Get-FileHash -LiteralPath $Input.Path).Hash -ne $Input.Hash -or (Get-FileHash -LiteralPath $Input.PreservedAt).Hash -ne $Input.Hash){throw 'Local schema preparation input changed'}}
Sql 'SHOW CREATE TABLE cloud_flow_db.crm_campaign_log;'|Set-Content -LiteralPath (Join-Path $Output 'schema-after.txt') -Encoding utf8NoBOM
@{Passed=$true;Backend=$BackendRound;Tables=[int]$TableCount;Columns=4;Indexes=1;Applied=($Existing -eq 0);ReferenceBusinessTables=$Tables.Count;OriginalBusinessValuesKept=$true;OldColumns=$Columns;BusinessBefore=$Before;BusinessAfter=$After;ArchiveRowsWritten=0;ProductMigrationCreated=$false;ProductionModified=$false;ProductModified=$false}|ConvertTo-Json -Depth 7|Set-Content -LiteralPath (Join-Path $Output 'result.json') -Encoding utf8NoBOM
"E5_LOCAL_ARCHIVE_SCHEMA: passed=true; columns=4; indexes=1; tables=$TableCount; original_business_tables=$($Tables.Count); original_values_kept=true; archived_rows=0; production_modified=false"

