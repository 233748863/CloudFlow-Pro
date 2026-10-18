param([Parameter(Mandatory = $true)][string]$StatePath, [switch]$Apply)

$ErrorActionPreference = 'Stop'
$Root = [IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
if ([IO.Path]::GetPathRoot($Root) -eq ($env:SystemDrive + '\')) { throw 'Business search preparation requires a data drive' }
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
    foreach ($Argument in @('--no-defaults','--protocol=TCP','--host=127.0.0.1',"--port=$($State.mysqlPort)",'--user=root','--skip-password','--batch','--raw','--skip-column-names','--default-character-set=utf8mb4','cloud_flow_db')) { $Info.ArgumentList.Add($Argument) }
    $Child = [Diagnostics.Process]::Start($Info)
    $Output = $Child.StandardOutput.ReadToEndAsync(); $Errors = $Child.StandardError.ReadToEndAsync()
    $Child.StandardInput.WriteLine($Sql); $Child.StandardInput.Close()
    if (-not $Child.WaitForExit(30000)) { $Child.Kill(); throw 'Owned SQL client timed out' }
    if ($Child.ExitCode -ne 0) { throw $Errors.GetAwaiter().GetResult() }
    return $Output.GetAwaiter().GetResult().Trim()
}
if ([IO.Path]::GetFullPath((Invoke-OwnedSql 'SELECT @@datadir;')).TrimEnd('\','/') -ne $Data.TrimEnd('\','/')) { throw 'Database directory mismatch' }
$Conflicts = Invoke-OwnedSql "SELECT COUNT(*) FROM sys_menu WHERE menu_id = 1986 OR perms = 'system:search:business';"
$Total = Invoke-OwnedSql "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='cloud_flow_db' AND table_type='BASE TABLE';"
Write-Output "H5_SEARCH_PREFLIGHT: physical_tables=$Total; candidate_menu_rows=$Conflicts; reserved=1970-2099; loopback=true; production_modified=false"
if ($Total -ne '346' -or $Conflicts -ne '0') { throw 'Unexpected table baseline or menu conflict; no writes performed' }
$Design = Get-Content -LiteralPath (Join-Path $Root 'docs/design/H-G剩余设计菜单清单.json') -Raw -Encoding utf8 | ConvertFrom-Json
$Approved = @($Design.menus | Where-Object { $_.batch -eq 'H5' -and $_.id -eq 1986 })
if ($Approved.Count -ne 1 -or $Approved[0].permission -ne 'system:search:business' -or $Approved[0].parent -ne 2 -or $Approved[0].kind -ne 'READ' -or $Approved[0].roles -ne 'SELF' -or (Compare-Object @(1..11) @($Design.roleSets.SELF))) { throw 'Read-only search approval mismatch' }
Write-Output 'H5_SEARCH_MENU_IDS=1986; RESERVED=1970-2099; PREINSERT_CONFLICT_ROWS=0; EMPLOYEE_NEW_WRITE_PERMISSIONS=0'
if (-not $Apply) { Write-Output 'H5_SEARCH_PREFLIGHT_PASS=true; database_writes=0; production_modified=false'; exit 0 }
$GrantsSql = "SET SESSION group_concat_max_len=8388608; SELECT SHA2(GROUP_CONCAT(CONCAT(tenant_id,':',role_id,':',menu_id) ORDER BY tenant_id,role_id,menu_id SEPARATOR ','),256) FROM sys_role_menu WHERE menu_id <> 1986;"
$BeforeGrants = Invoke-OwnedSql $GrantsSql
$Seed = [IO.File]::ReadAllText((Join-Path $Root 'cloudflow-backend/DB/06.cloudflow-business-seed.sql'))
$MenuSql = [regex]::Match($Seed, '(?s)CREATE TEMPORARY TABLE h5_business_search_guard .*?DROP TEMPORARY TABLE h5_business_search_guard;').Value
if (-not $MenuSql) { throw 'Formal search seed segment not found' }
$Evidence = Join-Path $Run ('business-search-prepare-' + [guid]::NewGuid().ToString('N'))
[IO.Directory]::CreateDirectory($Evidence) | Out-Null
$Projection = "SET NAMES utf8mb4;`nSTART TRANSACTION;`n$MenuSql`nCOMMIT;"
[IO.File]::WriteAllText((Join-Path $Evidence 'approved-projection.sql'), $Projection, [Text.UTF8Encoding]::new($false))
Invoke-OwnedSql $Projection | Out-Null
if ((Invoke-OwnedSql $GrantsSql) -ne $BeforeGrants) { throw 'Existing grants changed' }
$ActualMenus = Invoke-OwnedSql "SELECT CONCAT(menu_id,':',perms,':',parent_id,':',menu_type,':',visible,':',status,':',is_frame) FROM sys_menu WHERE menu_id = 1986 OR perms = 'system:search:business';"
if ($ActualMenus -ne '1986:system:search:business:2:F:1:0:0') { throw 'Search menu fields differ from approval' }
$Pairs = @((Invoke-OwnedSql "SELECT CONCAT(tenant_id,':',role_id,':',menu_id) FROM sys_role_menu WHERE menu_id = 1986;").Split("`n").Trim() | Sort-Object)
$Expected = @(1..11 | ForEach-Object { "100000:$($_):1986" } | Sort-Object)
if (Compare-Object $Expected $Pairs) { throw 'Search grants differ from exact approval' }
Write-Output 'H5_SEARCH_PREPARE: entry_menus=1; role_pairs=11; employee_new_write_permissions=0; unrelated_role_grants_unchanged=true; production_modified=false'
Write-Output "H5_SEARCH_PREPARE_EVIDENCE=$Evidence"
