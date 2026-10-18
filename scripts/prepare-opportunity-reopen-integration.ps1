param([Parameter(Mandatory = $true)][string]$StatePath, [switch]$CheckOnly)

$ErrorActionPreference = 'Stop'
$Root = [IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
if ([IO.Path]::GetPathRoot($Root) -eq ($env:SystemDrive + '\')) { throw 'Reopen preparation requires a data drive' }
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
$Listener = Get-CimInstance Win32_Process -Filter "ProcessId = $($Listeners[0].OwningProcess)"
if (-not $Listener -or $Listener.Name -ne 'mysqld.exe' -or -not $Listener.CommandLine.Contains($Data) -or ($Listener.ProcessId -ne $Owned[0].id -and $Listener.ParentProcessId -ne $Owned[0].id)) { throw 'MySQL listener ownership mismatch' }
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
    if (-not $Child.WaitForExit(30000)) { $Child.Kill(); throw 'Owned SQL client timed out' }
    if ($Child.ExitCode -ne 0) { throw $ErrorOutput.GetAwaiter().GetResult() }
    return $Output.GetAwaiter().GetResult().Trim()
}
if ([IO.Path]::GetFullPath((Invoke-OwnedSql 'SELECT @@datadir;')).TrimEnd('\', '/') -ne $Data.TrimEnd('\', '/')) { throw 'Database directory is not owned' }
$EmployeeSql = "SET SESSION group_concat_max_len=8388608; SELECT SHA2(GROUP_CONCAT(CONCAT_WS(':',tenant_id,role_id,menu_id) ORDER BY tenant_id,role_id,menu_id SEPARATOR ','),256) FROM sys_role_menu WHERE role_id=5;"
$EmployeeBefore = Invoke-OwnedSql $EmployeeSql
if ((Invoke-OwnedSql "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='cloud_flow_db' AND table_type='BASE TABLE';") -ne '338') { throw 'Reopen preparation expects 338 approved physical tables' }
$Menu = Invoke-OwnedSql "SELECT COUNT(*) FROM sys_menu WHERE menu_id=1904 OR perms='crm:opportunity:stage-reopen';"
if ($Menu -eq '0') {
    Write-Output 'H3_REOPEN_PREINSERT_CONFLICTS: query=menu_id=1904 OR perms=crm:opportunity:stage-reopen; rows=0; range=1900-1949'
} elseif ($Menu -ne '1' -or (Invoke-OwnedSql "SELECT COUNT(*) FROM sys_menu WHERE menu_id=1904 AND parent_id=801 AND perms='crm:opportunity:stage-reopen' AND create_by='seed';") -ne '1') {
    throw 'Reopen menu conflict requires user review'
}
if ($CheckOnly) { Write-Output 'H3_REOPEN_PRECHECK: tables=338; database_writes=0; production_modified=false'; exit 0 }
if ($Menu -eq '0') {
    $Seed = [IO.File]::ReadAllText((Join-Path $Root 'cloudflow-backend/DB/06.cloudflow-business-seed.sql'))
    $Block = [regex]::Match($Seed, '(?s)-- batch-h3-opportunity-menus:start(.*?)-- batch-h3-opportunity-menus:end').Groups[1].Value
    $Header = [regex]::Match($Block, '(?s)INSERT INTO cloud_flow_db\.sys_menu\s*\([^;]+?\)\s*VALUES').Value
    $Row = [regex]::Match($Block, "(?m)^ \(1904,[^\r\n]+\)(?:,|;)$").Value.Trim().TrimEnd(',', ';')
    if (-not $Header -or -not $Row) { throw 'Exact approved reopen seed is missing' }
    Invoke-OwnedSql (@"
START TRANSACTION;
$Header
$Row;
INSERT INTO sys_role_menu(role_id,menu_id,tenant_id) VALUES(1,1904,100000),(8,1904,100000);
COMMIT;
"@) | Out-Null
}
if ((Invoke-OwnedSql "SELECT GROUP_CONCAT(CONCAT(tenant_id,':',role_id) ORDER BY tenant_id,role_id) FROM sys_role_menu WHERE menu_id=1904;") -ne '100000:1,100000:8') { throw 'Reopen roles differ from approval' }
if ((Invoke-OwnedSql 'SELECT GROUP_CONCAT(menu_id ORDER BY menu_id) FROM sys_menu WHERE menu_id BETWEEN 1900 AND 1949;') -ne '1900,1901,1902,1903,1904,1905,1906,1909,1910,1911,1912,1913,1915') { throw 'Exact H3 menu set differs from approval' }
if ((Invoke-OwnedSql $EmployeeSql) -ne $EmployeeBefore) { throw 'Employee grants changed during reopen preparation' }
Write-Output 'H3_REOPEN_SCHEMA_READY: tables=338; menu_id=1904; range=1900-1949; roles=1,8; role_grants=2; employee_grants_changed=0; production_modified=false'
