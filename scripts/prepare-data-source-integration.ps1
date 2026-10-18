param([Parameter(Mandatory = $true)][string]$StatePath, [switch]$Apply)

$ErrorActionPreference = 'Stop'
$Root = [IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
. (Join-Path $Root '.cloudflow-runtime/use-data-drive.ps1')
$Runtime = Join-Path $Root '.cloudflow-runtime/batch-g-integration'
$StateFile = (Resolve-Path -LiteralPath $StatePath).Path
$Run = Split-Path -Parent $StateFile
if ((Split-Path -Parent $Run) -ne $Runtime -or (Split-Path -Leaf $Run) -notmatch '^[a-f0-9]{32}$' -or (Split-Path -Leaf $StateFile) -ne 'state.json') { throw 'Owned isolated state required' }
$Data = Join-Path $Run 'mysql-data'
foreach ($Candidate in @($Root, $Runtime, $Run, $StateFile, $Data)) {
    if ((Get-Item -LiteralPath $Candidate).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Redirected path rejected' }
}
$State = Get-Content -LiteralPath $StateFile -Raw | ConvertFrom-Json
if ($State.status -ne 'RUNNING' -or [IO.Path]::GetFullPath($State.run) -ne $Run -or $State.mysqlPort -lt 1024 -or $State.mysqlPort -gt 65535) { throw 'Running isolated environment required' }
$Owned = @($State.processes | Where-Object name -EQ 'mysql')
if ($Owned.Count -ne 1 -or $Owned[0].marker -ne $Data) { throw 'Unique owned MySQL marker required' }
$Process = Get-CimInstance Win32_Process -Filter "ProcessId = $($Owned[0].id)"
if (-not $Process -or $Process.Name -ne 'mysqld.exe' -or -not $Process.CommandLine.Contains($Data)) { throw 'Owned MySQL process mismatch' }
$Listeners = @(Get-NetTCPConnection -State Listen -LocalPort $State.mysqlPort)
if ($Listeners.Count -ne 1 -or $Listeners[0].LocalAddress -ne '127.0.0.1') { throw 'Loopback-only database required' }
$Listener = Get-CimInstance Win32_Process -Filter "ProcessId = $($Listeners[0].OwningProcess)"
if (-not $Listener -or $Listener.Name -ne 'mysqld.exe' -or -not $Listener.CommandLine.Contains($Data) -or ($Listener.ProcessId -ne $Owned[0].id -and $Listener.ParentProcessId -ne $Owned[0].id)) { throw 'Database listener ownership mismatch' }
$Mysql = (Get-Command mysql.exe).Source
function Invoke-OwnedSql([string]$Sql) {
    $Info = [Diagnostics.ProcessStartInfo]::new($Mysql)
    $Info.UseShellExecute = $false; $Info.CreateNoWindow = $true
    $Info.RedirectStandardInput = $true; $Info.RedirectStandardOutput = $true; $Info.RedirectStandardError = $true
    $Info.StandardInputEncoding = [Text.UTF8Encoding]::new($false); $Info.StandardOutputEncoding = [Text.UTF8Encoding]::new($false)
    $Info.Environment.Remove('MYSQL_PWD') | Out-Null
    foreach ($Argument in @('--no-defaults','--protocol=TCP','--host=127.0.0.1',"--port=$($State.mysqlPort)",'--user=root','--batch','--raw','--skip-column-names','--default-character-set=utf8mb4','cloud_flow_db')) { $Info.ArgumentList.Add($Argument) }
    $Child = [Diagnostics.Process]::Start($Info)
    $Output = $Child.StandardOutput.ReadToEndAsync(); $Errors = $Child.StandardError.ReadToEndAsync()
    $Child.StandardInput.WriteLine($Sql); $Child.StandardInput.Close()
    if (-not $Child.WaitForExit(30000)) { $Child.Kill(); throw 'Owned SQL client timed out' }
    if ($Child.ExitCode -ne 0) { throw $Errors.GetAwaiter().GetResult() }
    return $Output.GetAwaiter().GetResult().Trim()
}
if ([IO.Path]::GetFullPath((Invoke-OwnedSql 'SELECT @@datadir;')).TrimEnd('\','/') -ne $Data.TrimEnd('\','/')) { throw 'Database directory mismatch' }
$Total = Invoke-OwnedSql "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='cloud_flow_db' AND table_type='BASE TABLE';"
$Conflicts = Invoke-OwnedSql "SELECT COUNT(*) FROM sys_menu WHERE menu_id BETWEEN 1973 AND 1976 OR perms LIKE 'system:data-source:%';"
$ExistingTables = Invoke-OwnedSql "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='cloud_flow_db' AND table_name IN ('sys_data_source_config','sys_data_source_registration');"
$ExistingJobs = Invoke-OwnedSql "SELECT COUNT(*) FROM sys_job WHERE job_id=1973 OR handler_name='dataSourceReconcile';"
$ExistingHandlers = Invoke-OwnedSql "SELECT COUNT(*) FROM sys_job_handler WHERE handler_id=1973 OR handler_name='dataSourceReconcile';"
Write-Output "H5_DATASOURCE_PREFLIGHT: physical_tables=$Total; candidate_menu_rows=$Conflicts; candidate_tables=$ExistingTables; candidate_jobs=$ExistingJobs; candidate_handlers=$ExistingHandlers; loopback=true; production_modified=false"
if ($Total -ne '346' -or $Conflicts -ne '0' -or $ExistingTables -ne '0' -or $ExistingJobs -ne '0' -or $ExistingHandlers -ne '0') { throw 'Unexpected baseline or candidate conflict; no writes performed' }
$Design = Get-Content -LiteralPath (Join-Path $Root 'docs/design/H-G剩余设计菜单清单.json') -Raw -Encoding utf8 | ConvertFrom-Json
$Approved = @($Design.menus | Where-Object { $_.batch -eq 'H5' -and $_.id -ge 1973 -and $_.id -le 1976 })
if ($Approved.Count -ne 4 -or @($Approved | Where-Object roles -NE 'PLATFORM').Count -ne 0 -or (Compare-Object @(1) @($Design.roleSets.PLATFORM))) { throw 'Platform-only data source menu approval mismatch' }
$FormalDdl = [IO.File]::ReadAllText((Join-Path $Root 'cloudflow-backend/DB/01.cloudflow-common.sql'))
$ApprovedDdl = [IO.File]::ReadAllText((Join-Path $Root 'docs/design/H5-平台增强提案DDL.sql'))
$Creates = @()
foreach ($Table in @('sys_data_source_config', 'sys_data_source_registration')) {
    $Pattern = '(?ms)^CREATE TABLE ' + [regex]::Escape($Table) + ' \(.*?^\) ENGINE=.*?;'
    $Actual = [regex]::Matches($FormalDdl, $Pattern)
    $Expected = [regex]::Matches($ApprovedDdl, $Pattern)
    if ($Actual.Count -ne 1 -or $Expected.Count -ne 1 -or ($Actual[0].Value -replace '\s+',' ') -ne ($Expected[0].Value -replace '\s+',' ')) { throw "Approved data source DDL mismatch: $Table" }
    $Creates += $Actual[0].Value
}
Write-Output 'H5_DATASOURCE_MENU_IDS=1973,1974,1975,1976; RESERVED=1970-2099; PREINSERT_CONFLICT_ROWS=0; EMPLOYEE_NEW_PERMISSIONS=0; APPROVED_DDL_TABLES=2'
if (-not $Apply) { Write-Output 'H5_DATASOURCE_PREFLIGHT_PASS=true; database_writes=0; production_modified=false'; exit 0 }
$GrantsSql = "SET SESSION group_concat_max_len=8388608; SELECT SHA2(GROUP_CONCAT(CONCAT(tenant_id,':',role_id,':',menu_id) ORDER BY tenant_id,role_id,menu_id SEPARATOR ','),256) FROM sys_role_menu WHERE menu_id NOT BETWEEN 1973 AND 1976;"
$BeforeGrants = Invoke-OwnedSql $GrantsSql
$Seed = [IO.File]::ReadAllText((Join-Path $Root 'cloudflow-backend/DB/06.cloudflow-business-seed.sql'))
$SeedSql = [regex]::Match($Seed, '(?s)CREATE TEMPORARY TABLE h5_data_source_guard .*?DROP TEMPORARY TABLE h5_data_source_guard;').Value
if (-not $SeedSql) { throw 'Formal data source seed block missing' }
$Evidence = Join-Path $Run ('data-source-prepare-' + [Guid]::NewGuid().ToString('N'))
[IO.Directory]::CreateDirectory($Evidence) | Out-Null
$Sql = ($Creates -join "`n`n") + "`nSTART TRANSACTION;`n" + $SeedSql + "`nCOMMIT;"
[IO.File]::WriteAllText((Join-Path $Evidence 'executed.sql'), $Sql, [Text.UTF8Encoding]::new($false))
Invoke-OwnedSql $Sql | Out-Null
$AfterTotal = Invoke-OwnedSql "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='cloud_flow_db' AND table_type='BASE TABLE';"
$Menus = Invoke-OwnedSql 'SELECT GROUP_CONCAT(menu_id ORDER BY menu_id) FROM sys_menu WHERE menu_id BETWEEN 1973 AND 1976;'
$Grants = Invoke-OwnedSql "SELECT GROUP_CONCAT(CONCAT(role_id,':',menu_id,':',tenant_id) ORDER BY menu_id) FROM sys_role_menu WHERE menu_id BETWEEN 1973 AND 1976;"
$Employee = Invoke-OwnedSql 'SELECT COUNT(*) FROM sys_role_menu WHERE role_id=5 AND menu_id BETWEEN 1973 AND 1976;'
if ($AfterTotal -ne '348' -or $Menus -ne '1973,1974,1975,1976' -or $Grants -ne '1:1973:100000,1:1974:100000,1:1975:100000,1:1976:100000' -or $Employee -ne '0' -or (Invoke-OwnedSql $GrantsSql) -ne $BeforeGrants) { throw 'Data source projection did not preserve approved schema and roles' }
Write-Output 'H5_DATASOURCE_APPLY_PASS=true; tables_before=346; tables_after=348; menus=4; platform_role_pairs=4; employee_grants=0; unrelated_grants_unchanged=true; production_modified=false'
Write-Output "H5_DATASOURCE_APPLY_EVIDENCE=$Evidence"
