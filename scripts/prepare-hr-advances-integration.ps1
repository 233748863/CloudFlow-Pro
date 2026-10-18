param([Parameter(Mandatory = $true)][string]$StatePath, [switch]$Apply)

$ErrorActionPreference = 'Stop'
$Root = [IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
if ([IO.Path]::GetPathRoot($Root) -eq ($env:SystemDrive + '\')) { throw 'Advance preparation requires a data drive' }
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
    if (-not $Child.WaitForExit(120000)) { $Child.Kill(); throw 'Owned SQL client timed out' }
    if ($Child.ExitCode -ne 0) { throw $Errors.GetAwaiter().GetResult() }
    return $Output.GetAwaiter().GetResult().Trim()
}
if ([IO.Path]::GetFullPath((Invoke-OwnedSql 'SELECT @@datadir;')).TrimEnd('\','/') -ne $Data.TrimEnd('\','/')) { throw 'Database directory mismatch' }
$Total = Invoke-OwnedSql "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='cloud_flow_db' AND table_type='BASE TABLE';"
$Tables = Invoke-OwnedSql "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='cloud_flow_db' AND table_name IN ('hr_employee_advance','hr_advance_repayment');"
$Menus = Invoke-OwnedSql "SELECT COUNT(*) FROM sys_menu WHERE menu_id BETWEEN 1871 AND 1876 OR perms LIKE 'hr:advance:%';"
Write-Output "H2_ADVANCE_PREFLIGHT: physical_tables=$Total; advance_tables=$Tables; candidate_menu_rows=$Menus; reserved=1860-1899; loopback=true; production_modified=false"
if (-not (($Tables -eq '0' -and $Total -eq '344') -or ($Tables -eq '2' -and $Total -eq '346'))) { throw 'Unexpected table baseline; no writes performed' }
$Design = Get-Content -LiteralPath (Join-Path $Root 'docs/design/H-G剩余设计菜单清单.json') -Raw -Encoding utf8 | ConvertFrom-Json
$Identifiers = '1871,1872,1874,1875,1876'
$ApprovedMenus = @($Design.menus | Where-Object { $_.batch -eq 'H2' -and $_.id -in @($Identifiers.Split(',') | ForEach-Object { [int]$_ }) })
if ($ApprovedMenus.Count -ne 5) { throw 'Five approved advance entry menus required' }
function Assert-AdvanceGrants {
    $ExpectedMenus = @($ApprovedMenus | ForEach-Object { "$($_.id):$($_.permission):$($_.parent):$(if ($_.kind -eq 'READ') { 'C:0' } else { 'F:1' }):0:0:$($_.path):$($_.component)" } | Sort-Object)
    $ActualMenus = @((Invoke-OwnedSql "SELECT CONCAT(menu_id,':',perms,':',parent_id,':',menu_type,':',visible,':',status,':',is_frame,':',path,':',IFNULL(component,'')) FROM sys_menu WHERE menu_id BETWEEN 1871 AND 1876 OR perms LIKE 'hr:advance:%';").Split("`n").Trim() | Sort-Object)
    if (Compare-Object $ExpectedMenus $ActualMenus) { throw 'Advance menu fields differ from approval' }
    $ExpectedPairs = @($ApprovedMenus | ForEach-Object { $MenuId = $_.id; $Design.roleSets.($_.roles) | ForEach-Object { "100000:$($_):$MenuId" } } | Sort-Object)
    $ActualPairs = @((Invoke-OwnedSql "SELECT CONCAT(tenant_id,':',role_id,':',menu_id) FROM sys_role_menu WHERE menu_id BETWEEN 1871 AND 1876;").Split("`n").Trim() | Sort-Object)
    if ($ExpectedPairs.Count -ne 29 -or (Compare-Object $ExpectedPairs $ActualPairs)) { throw 'Advance grants differ from exact approved set' }
}
if ($Tables -eq '2' -and $Menus -eq '5') {
    Assert-AdvanceGrants
    Write-Output 'H2_ADVANCE_PREPARE: already_applied=true; database_writes=0; menus_written=0; submit_1873_reserved=true; production_modified=false'
    exit 0
}
if ($Menus -ne '0') { throw 'Advance menu conflict; no writes performed' }
Write-Output 'H2_ADVANCE_MENU_IDS=1871,1872,1874,1875,1876; RESERVED=1860-1899; PREINSERT_CONFLICT_ROWS=0; EMPLOYEE_NEW_WRITE=1872_OWN_DRAFT_ONLY; SUBMIT_1873_RESERVED=true'
if (-not $Apply) { Write-Output 'H2_ADVANCE_PREFLIGHT_PASS=true; database_writes=0; menus_written=0; production_modified=false'; exit 0 }
$GrantsSql = "SET SESSION group_concat_max_len=8388608; SELECT SHA2(GROUP_CONCAT(CONCAT(tenant_id,':',role_id,':',menu_id) ORDER BY tenant_id,role_id,menu_id SEPARATOR ','),256) FROM sys_role_menu WHERE menu_id NOT IN ($Identifiers);"
$BeforeGrants = Invoke-OwnedSql $GrantsSql
$CountsSql = 'SELECT (SELECT COUNT(*) FROM hr_employee_advance), (SELECT COUNT(*) FROM hr_advance_repayment);'
$BeforeCounts = if ($Tables -eq '2') { Invoke-OwnedSql $CountsSql } else { "0`t0" }
$Schema = [IO.File]::ReadAllText((Join-Path $Root 'cloudflow-backend/DB/03.cloudflow-hr.sql'))
$Proposal = [IO.File]::ReadAllText((Join-Path $Root 'docs/design/H2-人事增强提案DDL.sql'))
$Statements = @('SET NAMES utf8mb4;')
foreach ($Table in @('hr_employee_advance','hr_advance_repayment')) {
    $Pattern = "(?ms)^CREATE TABLE $Table \(.*?^\) ENGINE=[^\r\n]*;"
    $Create = [regex]::Match($Schema, $Pattern).Value
    $Approved = [regex]::Match($Proposal, $Pattern).Value
    if (-not $Create -or $Create.Replace("`r",'') -ne $Approved.Replace("`r",'')) { throw 'Formal advance schema differs from approval' }
    if ($Tables -eq '0') { $Statements += $Create }
}
$Seed = [IO.File]::ReadAllText((Join-Path $Root 'cloudflow-backend/DB/06.cloudflow-business-seed.sql'))
$MenuSql = [regex]::Match($Seed, '(?s)-- batch-h2-advance-entry:start.*?-- batch-h2-advance-entry:end').Value
if (-not $MenuSql) { throw 'Formal advance entry seed segment not found' }
$Statements += $MenuSql
$Evidence = Join-Path $Run ('hr-advance-entry-prepare-' + [guid]::NewGuid().ToString('N'))
[IO.Directory]::CreateDirectory($Evidence) | Out-Null
$Projection = $Statements -join "`n"
[IO.File]::WriteAllText((Join-Path $Evidence 'approved-projection.sql'), $Projection, [Text.UTF8Encoding]::new($false))
Invoke-OwnedSql $Projection | Out-Null
if ((Invoke-OwnedSql $GrantsSql) -ne $BeforeGrants) { throw 'Existing role grants changed' }
if ((Invoke-OwnedSql $CountsSql) -ne $BeforeCounts) { throw 'Existing advance or repayment records changed' }
$Total = Invoke-OwnedSql "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='cloud_flow_db' AND table_type='BASE TABLE';"
if ($Total -ne '346') { throw 'Incorrect table count after approved addition' }
Assert-AdvanceGrants
Write-Output 'H2_ADVANCE_PREPARE: physical_tables=346; entry_menus=5; role_pairs=29; submit_1873_reserved=true; unrelated_role_grants_unchanged=true; existing_records_unchanged=true; production_modified=false'
Write-Output "H2_ADVANCE_PREPARE_EVIDENCE=$Evidence"
