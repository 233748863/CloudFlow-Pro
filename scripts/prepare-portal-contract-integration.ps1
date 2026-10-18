param([Parameter(Mandatory = $true)][string]$StatePath, [switch]$CheckOnly)

$ErrorActionPreference = 'Stop'
$Root = [IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
if ([IO.Path]::GetPathRoot($Root) -eq ($env:SystemDrive + '\')) { throw 'Portal contract preparation requires a data drive' }
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
    $Info.UseShellExecute = $false; $Info.CreateNoWindow = $true
    $Info.RedirectStandardInput = $true; $Info.RedirectStandardOutput = $true; $Info.RedirectStandardError = $true
    $Info.StandardInputEncoding = [Text.UTF8Encoding]::new($false); $Info.StandardOutputEncoding = [Text.UTF8Encoding]::new($false)
    $Info.Environment.Remove('MYSQL_PWD') | Out-Null
    foreach ($Argument in @('--no-defaults', '--protocol=TCP', '--host=127.0.0.1', "--port=$($State.mysqlPort)", '--user=root', '--skip-password', '--batch', '--raw', '--skip-column-names', '--default-character-set=utf8mb4', 'cloud_flow_db')) { $Info.ArgumentList.Add($Argument) }
    $Child = [Diagnostics.Process]::Start($Info)
    $Output = $Child.StandardOutput.ReadToEndAsync(); $ErrorOutput = $Child.StandardError.ReadToEndAsync()
    $Child.StandardInput.WriteLine($Sql); $Child.StandardInput.Close()
    if (-not $Child.WaitForExit(120000)) { $Child.Kill(); throw 'Owned SQL client timed out' }
    if ($Child.ExitCode -ne 0) { throw $ErrorOutput.GetAwaiter().GetResult() }
    return $Output.GetAwaiter().GetResult().Trim()
}
if ([IO.Path]::GetFullPath((Invoke-OwnedSql 'SELECT @@datadir;')).TrimEnd('\', '/') -ne $Data.TrimEnd('\', '/')) { throw 'Database directory is not owned' }
$CountSql = "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='cloud_flow_db' AND table_type='BASE TABLE';"
if ((Invoke-OwnedSql $CountSql) -ne '338') { throw 'Portal contract preparation expects 338 approved physical tables' }
$GrantsSql = "SET SESSION group_concat_max_len=8388608; SELECT SHA2(GROUP_CONCAT(CONCAT_WS(':',tenant_id,role_id,menu_id) ORDER BY tenant_id,role_id,menu_id SEPARATOR ','),256) FROM sys_role_menu;"
$GrantsBefore = Invoke-OwnedSql $GrantsSql
$ColumnSql = "SELECT COUNT(*) FROM information_schema.columns WHERE table_schema='cloud_flow_db' AND table_name='oa_contract' AND column_name IN ('portal_term_ids','portal_milestone_ids','portal_payment_schedule_ids');"
$Columns = Invoke-OwnedSql $ColumnSql
if ($Columns -notin @('0','3')) { throw 'Partial portal contract columns require inspection' }
$IndexSql = "SELECT GROUP_CONCAT(CONCAT(column_name,':',non_unique) ORDER BY seq_in_index) FROM information_schema.statistics WHERE table_schema='cloud_flow_db' AND table_name='oa_contract' AND index_name='idx_contract_portal_customer';"
$Index = Invoke-OwnedSql $IndexSql
if ($Columns -eq '0' -and $Index -ne 'NULL' -or $Columns -eq '3' -and $Index -ne 'tenant_id:1,customer_id:1,deleted:1,signed_flag:1,contract_id:1') { throw 'Portal contract index differs from approval' }
Write-Output "PORTAL_CONTRACT_PREPARE_BASELINE: tables=338; portal_columns=$Columns; new_menu_ids=0; new_role_grants=0; production_modified=false"
if ($CheckOnly) { Write-Output 'PORTAL_CONTRACT_PRECHECK: database_writes=0; production_modified=false'; exit 0 }
if ($Columns -eq '0') {
    $Ddl = [IO.File]::ReadAllText((Join-Path $Root 'docs/design/H3-客户增强提案DDL.sql'))
    $Definitions = [regex]::Matches($Ddl, '(?ms)^ALTER TABLE oa_contract\s+.*?;')
    if ($Definitions.Count -ne 1) { throw 'Unique approved portal contract definition required' }
    Invoke-OwnedSql $Definitions[0].Value | Out-Null
}
if ((Invoke-OwnedSql "SELECT COUNT(*) FROM information_schema.columns WHERE table_schema='cloud_flow_db' AND table_name='oa_contract' AND column_name IN ('portal_term_ids','portal_milestone_ids','portal_payment_schedule_ids') AND data_type='json' AND column_default IS NULL AND is_nullable='YES';") -ne '3') { throw 'Portal contract column definitions differ from approval' }
if ((Invoke-OwnedSql $IndexSql) -ne 'tenant_id:1,customer_id:1,deleted:1,signed_flag:1,contract_id:1') { throw 'Portal contract index missing' }
if ((Invoke-OwnedSql $CountSql) -ne '338' -or (Invoke-OwnedSql $GrantsSql) -ne $GrantsBefore) { throw 'Physical tables or role grants changed during preparation' }
Write-Output 'PORTAL_CONTRACT_SCHEMA_READY: tables=338; approved_columns=3; new_menu_ids=0; new_role_grants=0; all_role_grants_unchanged=true; production_modified=false'
