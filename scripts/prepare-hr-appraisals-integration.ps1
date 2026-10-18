param([Parameter(Mandatory = $true)][string]$StatePath, [switch]$Apply)

$ErrorActionPreference = 'Stop'
$Root = [IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
if ([IO.Path]::GetPathRoot($Root) -eq ($env:SystemDrive + '\')) { throw 'Appraisal preparation requires a data drive' }
. (Join-Path $Root '.cloudflow-runtime/use-data-drive.ps1')
$Runtime = [IO.Path]::GetFullPath((Join-Path $Root '.cloudflow-runtime/batch-g-integration'))
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
$Tables = Invoke-OwnedSql "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='cloud_flow_db' AND table_name IN ('hr_appraisal_cycle','hr_appraisal_kra','hr_appraisal_result');"
$Columns = Invoke-OwnedSql "SELECT COUNT(*) FROM information_schema.columns WHERE table_schema='cloud_flow_db' AND ((table_name IN ('hr_performance_objective','hr_performance_assignment','hr_perf_distribution_rule','hr_talent_calibration_session') AND column_name='cycle_id') OR (table_name='hr_performance_objective' AND column_name='kra_id'));"
$Menus = Invoke-OwnedSql "SELECT COUNT(*) FROM sys_menu WHERE menu_id IN (1882,1883,1884,1885,1886,1894,1895) OR perms LIKE 'hr:appraisal:%';"
$Total = Invoke-OwnedSql "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='cloud_flow_db' AND table_type='BASE TABLE';"
Write-Output "H2_APPRAISAL_PREFLIGHT: physical_tables=$Total; appraisal_tables=$Tables; cycle_columns=$Columns; candidate_menu_rows=$Menus; loopback=true; owned_process=$($Listener.ProcessId)"
$Design = Get-Content -LiteralPath (Join-Path $Root 'docs/design/H-G剩余设计菜单清单.json') -Raw -Encoding utf8 | ConvertFrom-Json
function Assert-AppraisalGrants([bool]$IncludeResponse) {
    $Identifiers = if ($IncludeResponse) { '1882,1883,1884,1885,1886,1894,1895' } else { '1882,1883,1884,1885,1886,1894' }
    $Approved = @($Design.menus | Where-Object { $_.id -in ($Identifiers.Split(',') | ForEach-Object { [int]$_ }) })
    $ExpectedMenus = @($Approved | ForEach-Object { "$($_.id):$($_.permission):$($_.parent):$(if ($_.kind -eq 'READ') { 'C' } else { 'F' }):0" } | Sort-Object)
    $ActualMenus = (Invoke-OwnedSql "SELECT CONCAT(menu_id,':',perms,':',parent_id,':',menu_type,':',status) FROM sys_menu WHERE menu_id IN ($Identifiers);").Split("`n").Trim() | Sort-Object
    if (Compare-Object $ExpectedMenus $ActualMenus) { throw 'Existing appraisal menu fields differ from approved set' }
    $Expected = @($Approved | ForEach-Object { $MenuId = $_.id; $Design.roleSets.($_.roles) | ForEach-Object { "100000:$($_):$MenuId" } } | Sort-Object)
    $Actual = (Invoke-OwnedSql "SELECT CONCAT(tenant_id,':',role_id,':',menu_id) FROM sys_role_menu WHERE menu_id IN ($Identifiers);").Split("`n").Trim() | Sort-Object
    if (Compare-Object $Expected $Actual) { throw 'Existing appraisal grants differ from approved exact set' }
}
$Existing = $Tables -eq '3' -and $Columns -eq '5' -and $Total -eq '344'
if ($Existing -and $Menus -eq '7') {
    Assert-AppraisalGrants $true
    Write-Output 'H2_APPRAISAL_PREPARE: already_applied=true; database_writes=0; production_modified=false'
    exit 0
}
$ResponseOnly = $Existing -and $Menus -eq '6'
if ($ResponseOnly) {
    Assert-AppraisalGrants $false
    if ((Invoke-OwnedSql "SELECT COUNT(*) FROM sys_menu WHERE menu_id=1895 OR perms='hr:appraisal:respond';") -ne '0') { throw 'Response menu conflict; no writes performed' }
    Write-Output 'H2_APPRAISAL_RESPOND_PREINSERT: menu_id=1895; reserved=1860-1899; conflict_rows=0; existing_pairs=23'
} elseif ($Tables -ne '0' -or $Columns -ne '0' -or $Menus -ne '0' -or $Total -ne '341') { throw 'Unexpected baseline or menu conflict; no writes performed' }
Write-Output "H2_APPRAISAL_MENU_IDS=1882,1883,1884,1885,1886,1894,1895; RESERVED=1860-1899; PREINSERT_CONFLICT_ROWS=0; RESPONSE_ONLY=$ResponseOnly; EMPLOYEE_NEW_WRITE=1895"
if (-not $Apply) { Write-Output 'H2_APPRAISAL_PREFLIGHT_PASS=true; database_writes=0; production_modified=false'; exit 0 }
$CountsSql = 'SELECT (SELECT COUNT(*) FROM hr_performance_objective), (SELECT COUNT(*) FROM hr_performance_assignment), (SELECT COUNT(*) FROM hr_performance_result), (SELECT COUNT(*) FROM hr_perf_evaluator), (SELECT COUNT(*) FROM hr_perf_evaluator_response), (SELECT COUNT(*) FROM hr_perf_distribution_rule), (SELECT COUNT(*) FROM hr_talent_calibration_session);'
$BeforeCounts = Invoke-OwnedSql $CountsSql
$ChangingMenus = if ($ResponseOnly) { '1895' } else { '1882,1883,1884,1885,1886,1894,1895' }
$GrantsSql = "SET SESSION group_concat_max_len=8388608; SELECT SHA2(GROUP_CONCAT(CONCAT(tenant_id,':',role_id,':',menu_id) ORDER BY tenant_id,role_id,menu_id SEPARATOR ','),256) FROM sys_role_menu WHERE menu_id NOT IN ($ChangingMenus);"
$BeforeGrants = Invoke-OwnedSql $GrantsSql
$Schema = Get-Content -LiteralPath (Join-Path $Root 'cloudflow-backend/DB/03.cloudflow-hr.sql') -Raw -Encoding utf8
$Proposal = Get-Content -LiteralPath (Join-Path $Root 'docs/design/H2-人事增强提案DDL.sql') -Raw -Encoding utf8
$Statements = @('SET NAMES utf8mb4;')
foreach ($Table in @('hr_appraisal_cycle','hr_appraisal_kra','hr_appraisal_result')) {
    if ($ResponseOnly) { continue }
    $Create = [regex]::Match($Schema, "(?ms)^CREATE TABLE $Table \(.*?^\) ENGINE=[^\r\n]*;").Value
    if (-not $Create) { throw "Approved formal table not found: $Table" }
    $Statements += $Create
}
foreach ($Table in @('hr_performance_objective','hr_performance_assignment','hr_perf_distribution_rule','hr_talent_calibration_session')) {
    if ($ResponseOnly) { continue }
    $Alter = [regex]::Match($Proposal, "(?ms)^ALTER TABLE $Table\s+.*?;").Value
    if (-not $Alter) { throw "Approved alteration not found: $Table" }
    $Statements += $Alter
}
$Seed = Get-Content -LiteralPath (Join-Path $Root 'cloudflow-backend/DB/06.cloudflow-business-seed.sql') -Raw -Encoding utf8
$MenuPattern = if ($ResponseOnly) { '(?s)-- batch-h2-appraisal-response:start.*?-- batch-h2-appraisal-response:end' } else { '(?s)-- batch-h2-appraisals:start.*?-- batch-h2-appraisals:end' }
$MenuSql = [regex]::Match($Seed, $MenuPattern).Value
if (-not $MenuSql) { throw 'Approved appraisal menu segment not found' }
$Statements += $MenuSql
$Evidence = Join-Path $Run ('hr-appraisals-prepare-' + [guid]::NewGuid().ToString('N'))
[IO.Directory]::CreateDirectory($Evidence) | Out-Null
$Projection = $Statements -join "`n"
[IO.File]::WriteAllText((Join-Path $Evidence 'approved-projection.sql'), $Projection, [Text.UTF8Encoding]::new($false))
Invoke-OwnedSql $Projection | Out-Null
if ((Invoke-OwnedSql $CountsSql) -ne $BeforeCounts -or (Invoke-OwnedSql $GrantsSql) -ne $BeforeGrants) { throw 'Existing performance rows or unrelated role grants changed' }
if ((Invoke-OwnedSql "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='cloud_flow_db' AND table_type='BASE TABLE';") -ne '344') { throw 'Physical table count mismatch after preparation' }
Assert-AppraisalGrants $true
Write-Output 'H2_APPRAISAL_PREPARE: tables=344; menus=7; role_pairs=34; employee_new_write=1895; production_modified=false'
Write-Output "H2_APPRAISAL_PRESERVATION: existing_row_counts=$BeforeCounts; unrelated_role_grants_unchanged=true"
Write-Output "H2_APPRAISAL_PREPARE_EVIDENCE=$Evidence"
