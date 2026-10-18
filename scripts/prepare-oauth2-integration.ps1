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
$MenuRows = Invoke-OwnedSql "SELECT CONCAT(menu_id,CHAR(9),menu_name,CHAR(9),COALESCE(perms,'')) FROM sys_menu WHERE menu_id BETWEEN 1987 AND 1991 OR perms LIKE 'system:oauth2:%' ORDER BY menu_id;"
$Conflicts = if ($MenuRows) { @($MenuRows -split "\r?\n").Count } else { 0 }
$ExistingTables = Invoke-OwnedSql "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='cloud_flow_db' AND table_name IN ('sys_oauth2_client','sys_oauth2_code','sys_oauth2_access_token','sys_oauth2_refresh_token','sys_oauth2_approve');"
Write-Output "H5_OAUTH2_PREFLIGHT: physical_tables=$Total; candidate_menu_rows=$Conflicts; candidate_tables=$ExistingTables; loopback=true; production_modified=false"
if ($MenuRows) { Write-Output $MenuRows }
if ($Total -ne '348' -or $Conflicts -ne 0 -or $ExistingTables -ne '0') { throw 'Unexpected baseline or candidate conflict; no writes performed' }
$Design = Get-Content -LiteralPath (Join-Path $Root 'docs/design/H-G剩余设计菜单清单.json') -Raw -Encoding utf8 | ConvertFrom-Json
$Approved = @($Design.menus | Where-Object { $_.batch -eq 'H5' -and $_.id -ge 1987 -and $_.id -le 1991 })
if ($Approved.Count -ne 5 -or (Compare-Object @(1) @($Design.roleSets.PLATFORM))) { throw 'OAuth menu approval mismatch' }
$ExpectedPairs = @()
foreach ($Menu in $Approved) {
    foreach ($Role in $Design.roleSets.($Menu.roles)) { $ExpectedPairs += ($Role.ToString() + ':' + $Menu.id + ':100000') }
}
if ($ExpectedPairs.Count -ne 35 -or @($ExpectedPairs | Where-Object { $_ -like '5:*' }).Count -ne 3) { throw 'Exact approved OAuth role pairs required' }
$Formal = [IO.File]::ReadAllText((Join-Path $Root 'cloudflow-backend/DB/01.cloudflow-common.sql'))
$Proposal = [IO.File]::ReadAllText((Join-Path $Root 'docs/design/H5-平台增强提案DDL.sql'))
$Creates = @()
foreach ($Table in @('sys_oauth2_client','sys_oauth2_code','sys_oauth2_access_token','sys_oauth2_refresh_token','sys_oauth2_approve')) {
    $Pattern = '(?ms)^CREATE TABLE ' + [regex]::Escape($Table) + ' \(.*?^\) ENGINE=.*?;'
    $Actual = [regex]::Matches($Formal, $Pattern)
    $Expected = [regex]::Matches($Proposal, $Pattern)
    if ($Actual.Count -ne 1 -or $Expected.Count -ne 1 -or ($Actual[0].Value -replace '\s+',' ') -ne ($Expected[0].Value -replace '\s+',' ')) { throw "Approved OAuth DDL mismatch: $Table" }
    $Creates += $Actual[0].Value
}
Write-Output 'H5_OAUTH2_MENU_IDS=1987,1988,1989,1990,1991; RESERVED=1970-2099; PREINSERT_CONFLICT_ROWS=0; APPROVED_DDL_TABLES=5; EMPLOYEE=1989_OWN_CONSENT,1990_OWN_LIST,1991_OWN_REVOCATION'
if (-not $Apply) { Write-Output 'H5_OAUTH2_PREFLIGHT_PASS=true; database_writes=0; production_modified=false'; exit 0 }
$GrantsSql = "SET SESSION group_concat_max_len=8388608; SELECT SHA2(GROUP_CONCAT(CONCAT(tenant_id,':',role_id,':',menu_id) ORDER BY tenant_id,role_id,menu_id SEPARATOR ','),256) FROM sys_role_menu WHERE menu_id NOT BETWEEN 1987 AND 1991;"
$BeforeGrants = Invoke-OwnedSql $GrantsSql
$Seed = [IO.File]::ReadAllText((Join-Path $Root 'cloudflow-backend/DB/06.cloudflow-business-seed.sql'))
$SeedSql = [regex]::Match($Seed, '(?s)CREATE TEMPORARY TABLE h5_oauth2_guard .*?DROP TEMPORARY TABLE h5_oauth2_guard;').Value
if (-not $SeedSql) { throw 'Formal OAuth seed block missing' }
$Evidence = Join-Path $Run ('oauth2-prepare-' + [Guid]::NewGuid().ToString('N'))
[IO.Directory]::CreateDirectory($Evidence) | Out-Null
$Sql = ($Creates -join [Environment]::NewLine) + [Environment]::NewLine + "START TRANSACTION;" + [Environment]::NewLine + $SeedSql + [Environment]::NewLine + "COMMIT;"
[IO.File]::WriteAllText((Join-Path $Evidence 'executed.sql'), $Sql, [Text.UTF8Encoding]::new($false))
Invoke-OwnedSql $Sql | Out-Null
$AfterTotal = Invoke-OwnedSql "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='cloud_flow_db' AND table_type='BASE TABLE';"
$Menus = Invoke-OwnedSql 'SELECT GROUP_CONCAT(menu_id ORDER BY menu_id) FROM sys_menu WHERE menu_id BETWEEN 1987 AND 1991;'
$ActualPairs = @((Invoke-OwnedSql "SELECT CONCAT(role_id,':',menu_id,':',tenant_id) FROM sys_role_menu WHERE menu_id BETWEEN 1987 AND 1991 ORDER BY role_id,menu_id;") -split "\r?\n")
$Employee = Invoke-OwnedSql "SELECT GROUP_CONCAT(menu_id ORDER BY menu_id) FROM sys_role_menu WHERE role_id=5 AND menu_id BETWEEN 1987 AND 1991;"
if ($AfterTotal -ne '353' -or $Menus -ne '1987,1988,1989,1990,1991' -or (Compare-Object $ExpectedPairs $ActualPairs) -or $Employee -ne '1989,1990,1991' -or (Invoke-OwnedSql $GrantsSql) -ne $BeforeGrants) { throw 'OAuth projection did not preserve approved schema and roles' }
Write-Output 'H5_OAUTH2_APPLY_PASS=true; tables_before=348; tables_after=353; menus=5; role_pairs=35; employee_grants=3; employee_client_management=0; unrelated_grants_unchanged=true; production_modified=false'
Write-Output "H5_OAUTH2_APPLY_EVIDENCE=$Evidence"

