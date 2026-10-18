param([Parameter(Mandatory = $true)][string]$StatePath, [switch]$CheckOnly)

$ErrorActionPreference = 'Stop'
$Root = [IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
if ([IO.Path]::GetPathRoot($Root) -eq ($env:SystemDrive + '\')) { throw 'Portal ticket preparation requires a data drive' }
. (Join-Path $Root '.cloudflow-runtime/use-data-drive.ps1')
$Runtime = [IO.Path]::GetFullPath((Join-Path $Root '.cloudflow-runtime/batch-g-integration'))
$StateFile = (Resolve-Path -LiteralPath $StatePath).Path
$Run = Split-Path -Parent $StateFile
if ((Split-Path -Parent $Run) -ne $Runtime -or (Split-Path -Leaf $Run) -notmatch '^[a-f0-9]{32}$' -or (Split-Path -Leaf $StateFile) -ne 'state.json') { throw 'Owned isolated state required' }
$Data = Join-Path $Run 'mysql-data'
foreach ($Candidate in @($Root, $Runtime, $Run, $StateFile, $Data)) {
    if ((Get-Item -LiteralPath $Candidate).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Redirected isolated path rejected' }
}
$State = Get-Content -LiteralPath $StateFile -Raw | ConvertFrom-Json
if ($State.status -ne 'RUNNING' -or [IO.Path]::GetFullPath($State.run) -ne $Run -or $State.mysqlPort -lt 1024 -or $State.mysqlPort -gt 65535) { throw 'Running owned integration required' }
$Owned = @($State.processes | Where-Object name -EQ 'mysql')
if ($Owned.Count -ne 1 -or $Owned[0].marker -ne $Data) { throw 'Unique owned MySQL marker required' }
$Process = Get-CimInstance Win32_Process -Filter "ProcessId = $($Owned[0].id)"
if (-not $Process -or $Process.Name -ne 'mysqld.exe' -or -not $Process.CommandLine.Contains($Data)) { throw 'Owned MySQL process mismatch' }
$Listeners = @(Get-NetTCPConnection -State Listen -LocalPort $State.mysqlPort)
if ($Listeners.Count -ne 1 -or $Listeners[0].LocalAddress -ne '127.0.0.1') { throw 'Owned loopback MySQL listener required' }
$ListenerProcess = Get-CimInstance Win32_Process -Filter "ProcessId = $($Listeners[0].OwningProcess)"
if (-not $ListenerProcess -or $ListenerProcess.Name -ne 'mysqld.exe' -or -not $ListenerProcess.CommandLine.Contains($Data) -or ($ListenerProcess.ProcessId -ne $Owned[0].id -and $ListenerProcess.ParentProcessId -ne $Owned[0].id)) { throw 'MySQL listener must be owned process or its verified child' }
$Mysql = (Get-Command mysql.exe).Source
function Invoke-OwnedSql([string]$Sql) {
    $Info = [Diagnostics.ProcessStartInfo]::new($Mysql)
    $Info.UseShellExecute = $false
    $Info.CreateNoWindow = $true
    $Info.RedirectStandardInput = $true
    $Info.RedirectStandardOutput = $true
    $Info.RedirectStandardError = $true
    $Info.StandardInputEncoding = [Text.UTF8Encoding]::new($false)
    $Info.StandardOutputEncoding = [Text.UTF8Encoding]::new($false)
    $Info.Environment.Remove('MYSQL_PWD') | Out-Null
    foreach ($Argument in @('--no-defaults', '--protocol=TCP', '--host=127.0.0.1', "--port=$($State.mysqlPort)", '--user=root', '--skip-password', '--batch', '--raw', '--skip-column-names', '--default-character-set=utf8mb4', 'cloud_flow_db')) { $Info.ArgumentList.Add($Argument) }
    $Child = [Diagnostics.Process]::Start($Info)
    $Output = $Child.StandardOutput.ReadToEndAsync()
    $ErrorOutput = $Child.StandardError.ReadToEndAsync()
    $Child.StandardInput.WriteLine($Sql)
    $Child.StandardInput.Close()
    if (-not $Child.WaitForExit(120000)) { $Child.Kill(); throw 'Owned SQL client timed out' }
    if ($Child.ExitCode -ne 0) { throw $ErrorOutput.GetAwaiter().GetResult() }
    return $Output.GetAwaiter().GetResult().Trim()
}
if ([IO.Path]::GetFullPath((Invoke-OwnedSql 'SELECT @@datadir;')).TrimEnd('\', '/') -ne $Data.TrimEnd('\', '/')) { throw 'Database directory is not owned' }
$EmployeeSql = "SET SESSION group_concat_max_len=8388608; SELECT SHA2(GROUP_CONCAT(CONCAT_WS(':',tenant_id,role_id,menu_id) ORDER BY tenant_id,role_id,menu_id SEPARATOR ','),256) FROM sys_role_menu WHERE role_id=5;"
$EmployeeBefore = Invoke-OwnedSql $EmployeeSql
$CountSql = "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='cloud_flow_db' AND table_type='BASE TABLE';"
if ((Invoke-OwnedSql $CountSql) -ne '338') { throw 'Portal ticket preparation expects 338 approved physical tables' }
$TicketColumnSql = "SELECT COUNT(*) FROM information_schema.columns WHERE table_schema='cloud_flow_db' AND table_name='crm_service_ticket' AND column_name IN ('portal_contact_id','portal_solution','portal_solution_time');"
$FileColumnSql = "SELECT COUNT(*) FROM information_schema.columns WHERE table_schema='cloud_flow_db' AND table_name='sys_file' AND column_name='portal_owner_id';"
$TicketColumns = Invoke-OwnedSql $TicketColumnSql
$FileColumns = Invoke-OwnedSql $FileColumnSql
$Menu = Invoke-OwnedSql "SELECT COUNT(*) FROM sys_menu WHERE menu_id=1914 OR perms='crm:portal:solution:publish';"
Write-Output "PORTAL_TICKET_PREPARE_BASELINE: tables=338; ticket_columns=$TicketColumns; file_columns=$FileColumns; menu_1914_rows=$Menu"
if ($TicketColumns -notin @('0','3') -or $FileColumns -notin @('0','1')) { throw 'Partial portal ticket columns require inspection' }
if ($Menu -eq '0') {
    Write-Output 'SQL=SELECT menu_id,perms FROM sys_menu WHERE menu_id=1914 OR perms=''crm:portal:solution:publish'';'
    Write-Output 'PORTAL_TICKET_MENU_CONFLICT_BEFORE_INSERT: id=1914; range=1900-1949; rows=0; isolated=true'
} elseif ($Menu -ne '1' -or (Invoke-OwnedSql "SELECT COUNT(*) FROM sys_menu WHERE menu_id=1914 AND parent_id=805 AND perms='crm:portal:solution:publish' AND menu_type='F' AND status='0' AND visible='1' AND create_by='seed';") -ne '1') {
    throw 'Portal ticket menu conflict requires user review'
}
$MenuSetSql = 'SELECT GROUP_CONCAT(menu_id ORDER BY menu_id) FROM sys_menu WHERE menu_id BETWEEN 1900 AND 1949;'
$PriorMenuSet = if ($Menu -eq '0') { '1900,1901,1902,1903,1904,1905,1906,1909,1910,1911,1912,1913,1915' } else { '1900,1901,1902,1903,1904,1905,1906,1909,1910,1911,1912,1913,1914,1915' }
if ((Invoke-OwnedSql $MenuSetSql) -ne $PriorMenuSet) { throw 'Exact H3 baseline menu set differs from approval' }
if ((Invoke-OwnedSql "SELECT COUNT(*) FROM sys_menu WHERE menu_id=805 AND perms='crm:ticket:list' AND status='0';") -ne '1') { throw 'Approved parent ticket menu missing' }
if ((Invoke-OwnedSql "SELECT COUNT(*) FROM sys_role WHERE tenant_id=100000 AND status='0' AND deleted=0 AND (role_id,role_key) IN ((1,'admin'),(8,'sales_manager'),(9,'sales_rep'),(11,'customer_success'));") -ne '4') { throw 'Approved publisher roles differ' }
$FileIndexSql = "SELECT GROUP_CONCAT(CONCAT(column_name,':',non_unique) ORDER BY seq_in_index) FROM information_schema.statistics WHERE table_schema='cloud_flow_db' AND table_name='sys_file' AND index_name='idx_file_portal_owner';"
$FileIndex = Invoke-OwnedSql $FileIndexSql
if ($FileColumns -eq '0' -and $FileIndex -ne 'NULL') { throw 'Portal owner index conflicts with missing column' }
if ($FileColumns -eq '1' -and $FileIndex -ne 'tenant_id:1,portal_owner_id:1') { throw 'Portal owner index differs from approval' }
if ($CheckOnly) { Write-Output 'PORTAL_TICKET_PRECHECK: database_writes=0; production_modified=false'; exit 0 }
$Ddl = [IO.File]::ReadAllText((Join-Path $Root 'docs/design/H3-客户增强提案DDL.sql'))
foreach ($Change in @(@{Table='sys_file';Count=$FileColumns}, @{Table='crm_service_ticket';Count=$TicketColumns})) {
    if ($Change.Count -eq '0') {
        $Definition = [regex]::Match($Ddl, '(?ms)^ALTER TABLE ' + [regex]::Escape($Change.Table) + '\s+.*?;')
        if (-not $Definition.Success) { throw 'Approved portal ticket ALTER definition missing' }
        Invoke-OwnedSql $Definition.Value | Out-Null
    }
}
if ($Menu -eq '0') {
    $Seed = [IO.File]::ReadAllText((Join-Path $Root 'cloudflow-backend/DB/06.cloudflow-business-seed.sql'))
    $Block = [regex]::Match($Seed, '(?s)CREATE TEMPORARY TABLE h3_ticket_publication_guard .*?DROP TEMPORARY TABLE h3_ticket_publication_guard;')
    if (-not $Block.Success) { throw 'Approved portal ticket seed block missing' }
    Invoke-OwnedSql ("START TRANSACTION;`n" + $Block.Value + "`nCOMMIT;") | Out-Null
}
if ((Invoke-OwnedSql $TicketColumnSql) -ne '3' -or (Invoke-OwnedSql $FileColumnSql) -ne '1') { throw 'Portal ticket columns not applied' }
if ((Invoke-OwnedSql "SELECT COUNT(*) FROM information_schema.columns WHERE table_schema='cloud_flow_db' AND column_default IS NULL AND is_nullable='YES' AND ((table_name='sys_file' AND column_name='portal_owner_id' AND data_type='bigint') OR (table_name='crm_service_ticket' AND ((column_name='portal_contact_id' AND data_type='bigint') OR (column_name='portal_solution' AND data_type='text') OR (column_name='portal_solution_time' AND data_type='datetime'))));") -ne '4') { throw 'Portal ticket column definitions differ from approval' }
if ((Invoke-OwnedSql $FileIndexSql) -ne 'tenant_id:1,portal_owner_id:1') { throw 'Portal owner index not applied' }
if ((Invoke-OwnedSql "SELECT GROUP_CONCAT(CONCAT(tenant_id,':',role_id) ORDER BY tenant_id,role_id) FROM sys_role_menu WHERE menu_id=1914;") -ne '100000:1,100000:8,100000:9,100000:11') { throw 'Portal ticket publisher grants differ from approval' }
if ((Invoke-OwnedSql $MenuSetSql) -ne '1900,1901,1902,1903,1904,1905,1906,1909,1910,1911,1912,1913,1914,1915') { throw 'Exact H3 menu set differs from approval' }
if ((Invoke-OwnedSql $CountSql) -ne '338' -or (Invoke-OwnedSql $EmployeeSql) -ne $EmployeeBefore) { throw 'Physical tables or employee grants changed during preparation' }
Write-Output 'PORTAL_TICKET_SCHEMA_READY: tables=338; approved_columns=4; menu_ids=1914; role_grants=4; employee_grants_changed=0; production_modified=false'
