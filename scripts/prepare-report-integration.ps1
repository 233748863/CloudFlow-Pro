param([Parameter(Mandatory = $true)][string]$StatePath, [switch]$Apply)

$ErrorActionPreference = 'Stop'
$Root = [IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
$StateFile = (Resolve-Path -LiteralPath $StatePath).Path
$Run = Split-Path -Parent $StateFile
if ((Split-Path -Parent $Run) -ne (Join-Path $Root '.cloudflow-runtime\batch-g-integration') -or (Split-Path -Leaf $Run) -notmatch '^[a-f0-9]{32}$' -or (Split-Path -Leaf $StateFile) -ne 'state.json') { throw 'Owned integration state required' }
$State = Get-Content -Raw -LiteralPath $StateFile | ConvertFrom-Json
if ($State.status -ne 'RUNNING' -or [IO.Path]::GetFullPath($State.run) -ne $Run -or $State.mysqlPort -lt 1025 -or $State.mysqlPort -gt 65535) { throw 'Running owned integration database required' }
$Arguments = @('--no-defaults', '--protocol=TCP', '--host=127.0.0.1', "--port=$($State.mysqlPort)", '--user=root', '--skip-password', '--batch', '--raw', '--skip-column-names', '--default-character-set=utf8mb4', 'cloud_flow_db')
Remove-Item Env:MYSQL_PWD -ErrorAction SilentlyContinue
function Read-Database([string]$Statement) {
    $Output = "START TRANSACTION READ ONLY;`n$Statement;`nCOMMIT;" | & mysql.exe @Arguments
    if ($LASTEXITCODE -ne 0) { throw 'Read-only report preflight failed' }
    return ($Output -join "`n").Trim()
}
if ([IO.Path]::GetFullPath((Read-Database 'SELECT @@datadir')).TrimEnd('\') -ne [IO.Path]::GetFullPath((Join-Path $Run 'mysql-data')).TrimEnd('\')) { throw 'Isolated database identity mismatch' }
$Tables = @('sys_report_dataset','sys_report_chart','sys_report_dashboard','sys_report_dashboard_item')
$Existing = Read-Database "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='cloud_flow_db' AND table_name IN ('sys_report_dataset','sys_report_chart','sys_report_dashboard','sys_report_dashboard_item')"
$ConflictSql = "SELECT menu_id,menu_name,perms FROM sys_menu WHERE menu_id BETWEEN 1977 AND 1984 OR menu_id BETWEEN 1992 AND 2000 OR perms LIKE 'system:report:%'"
$Conflicts = Read-Database $ConflictSql
$Before = Read-Database "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='cloud_flow_db' AND table_type='BASE TABLE'"
Write-Output "REPORT_PREFLIGHT_COMMAND=$ConflictSql;"
Write-Output "REPORT_PREFLIGHT: existing_tables=$Existing; menu_conflict_rows=$(if ($Conflicts) { @($Conflicts -split "`n").Count } else { 0 }); permanent_tables=$Before; loopback=true; production_modified=false"
if ($Existing -ne '0' -or $Conflicts -or $Before -ne '353') { throw 'Report preflight found a conflict; no schema or menu change applied' }
if (-not $Apply) { return }
$Formal = Get-Content -Raw -LiteralPath (Join-Path $Root 'cloudflow-backend\DB\01.cloudflow-common.sql')
foreach ($Table in $Tables) {
    $Pattern = '(?ms)^DROP TABLE IF EXISTS ' + [regex]::Escape($Table) + ';\s*CREATE TABLE ' + [regex]::Escape($Table) + '\s*\(.*?^\).*?;'
    $Matches = [regex]::Matches($Formal, $Pattern)
    if ($Matches.Count -ne 1) { throw 'Exactly one approved report table definition required' }
    $Matches[0].Value | & mysql.exe @Arguments
    if ($LASTEXITCODE -ne 0) { throw 'Report schema installation failed; retain diagnostics' }
    Write-Output "REPORT_TABLE_INSTALLED=$Table"
}
$Seed = Get-Content -Raw -LiteralPath (Join-Path $Root 'cloudflow-backend\DB\06.cloudflow-business-seed.sql')
$Marker = 'CREATE TEMPORARY TABLE h5_report_guard '
$Offset = $Seed.IndexOf($Marker)
if ($Offset -lt 0 -or $Seed.IndexOf($Marker, $Offset + 1) -ge 0) { throw 'Unique report seed guard required' }
$Seed.Substring($Offset) | & mysql.exe @Arguments
if ($LASTEXITCODE -ne 0) { throw 'Report menu seed failed; retain diagnostics' }
$After = Read-Database "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='cloud_flow_db' AND table_type='BASE TABLE'"
$Menus = Read-Database "SELECT COUNT(*) FROM sys_menu WHERE menu_id BETWEEN 1977 AND 1984 OR menu_id BETWEEN 1992 AND 2000"
$Pairs = Read-Database 'SELECT COUNT(*) FROM sys_role_menu WHERE tenant_id=100000 AND (menu_id BETWEEN 1977 AND 1984 OR menu_id BETWEEN 1992 AND 2000)'
Write-Output "REPORT_STRUCTURE_INSTALLED: permanent_tables=$After; report_menus=$Menus; role_pairs=$Pairs; production_modified=false"
if ($After -ne '357' -or $Menus -ne '17' -or $Pairs -ne '152') { throw 'Report structure counts differ from approved design' }
