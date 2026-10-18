param([Parameter(Mandatory = $true)][string]$StatePath, [switch]$Apply)

$ErrorActionPreference = 'Stop'
$Root = [IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
if ([IO.Path]::GetPathRoot($Root) -eq ($env:SystemDrive + '\')) { throw 'Settlement preparation requires a data drive' }
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
    if ($Child.ExitCode -ne 0) { throw 'Owned settlement SQL failed; raw diagnostics withheld' }
    return $Output.GetAwaiter().GetResult().Trim()
}
if ([IO.Path]::GetFullPath((Invoke-OwnedSql 'SELECT @@datadir;')).TrimEnd('\','/') -ne $Data.TrimEnd('\','/')) { throw 'Database directory mismatch' }


$Tables = @('hr_severance_rule','hr_severance_rule_slab','hr_final_settlement','hr_final_settlement_item','hr_training_recovery','hr_exit_interview')
$TableNames = ($Tables | ForEach-Object { "'$_'" }) -join ','
$Total = Invoke-OwnedSql "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='cloud_flow_db' AND table_type='BASE TABLE';"
$Existing = Invoke-OwnedSql "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='cloud_flow_db' AND table_name IN ($TableNames);"
$SalaryColumns = Invoke-OwnedSql "SELECT COUNT(*) FROM information_schema.columns WHERE table_schema='cloud_flow_db' AND table_name='hr_salary_slip' AND column_name='reserved_settlement_id';"
$PaymentColumns = Invoke-OwnedSql "SELECT COUNT(*) FROM information_schema.columns WHERE table_schema='cloud_flow_db' AND table_name='biz_payment_request' AND column_name IN ('source_biz_type','source_biz_id');"
$Precision = Invoke-OwnedSql "SELECT CONCAT(numeric_precision,':',numeric_scale) FROM information_schema.columns WHERE table_schema='cloud_flow_db' AND table_name='biz_payment_request' AND column_name='amount';"
$Menus = Invoke-OwnedSql "SELECT COUNT(*) FROM sys_menu WHERE menu_id BETWEEN 1860 AND 1870 OR perms LIKE 'hr:settlement:%' OR perms LIKE 'hr:severance:%' OR perms LIKE 'hr:exit-interview:%' OR perms LIKE 'hr:training-recovery:%';"
Write-Output "H2_SETTLEMENT_SCHEMA_PREFLIGHT: tables=$Total; settlement_tables=$Existing; salary_columns=$SalaryColumns; payment_columns=$PaymentColumns; payment_precision=$Precision; menu_conflicts=$Menus; loopback=true"
if ($Total -ne '368' -or $Existing -ne '0' -or $SalaryColumns -ne '0' -or $PaymentColumns -ne '0' -or $Precision -ne '10:2' -or $Menus -ne '0') {
    throw 'Settlement schema baseline differs; no writes performed'
}
$Proposal = [IO.File]::ReadAllText((Join-Path $Root 'docs/design/H2-人事增强提案DDL.sql'))
$FormalHr = [IO.File]::ReadAllText((Join-Path $Root 'cloudflow-backend/DB/03.cloudflow-hr.sql'))
$Statements = @('SET NAMES utf8mb4;')
foreach ($Table in $Tables) {
    $Pattern = "(?ms)^CREATE TABLE $Table \(.*?^\) ENGINE=[^\r\n]*;"
    $Approved = [regex]::Match($Proposal, $Pattern).Value
    $Formal = [regex]::Match($FormalHr, $Pattern).Value
    if (-not $Approved -or $Approved.Replace("`r",'') -ne $Formal.Replace("`r",'')) { throw 'Formal settlement schema differs from approval' }
    $Statements += $Approved
}
foreach ($Table in @('hr_salary_slip','biz_payment_request')) {
    $Approved = [regex]::Match($Proposal, "(?ms)^ALTER TABLE $Table\b.*?;").Value
    if (-not $Approved) { throw 'Approved settlement alteration missing' }
    $Statements += $Approved
}
if (-not $Apply) {
    Write-Output 'H2_SETTLEMENT_SCHEMA_PREFLIGHT_PASS=true; writes=0; menus_written=0; production_modified=false'
    exit 0
}
$OriginalColumns = @{}
$OriginalHashes = @{}
function Get-RowDigest([string]$Table) {
    $Rows = Invoke-OwnedSql "SELECT SHA2(CAST(JSON_ARRAY($($OriginalColumns[$Table])) AS CHAR),256) FROM $Table ORDER BY 1;"
    $Bytes = [Text.Encoding]::UTF8.GetBytes($Rows)
    return [Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($Bytes))
}
foreach ($Table in @('hr_salary_slip','biz_payment_request','sys_menu','sys_role_menu')) {
    $OriginalColumns[$Table] = Invoke-OwnedSql "SET SESSION group_concat_max_len=65535; SELECT GROUP_CONCAT(CONCAT(CHAR(96),column_name,CHAR(96)) ORDER BY ordinal_position SEPARATOR ',') FROM information_schema.columns WHERE table_schema='cloud_flow_db' AND table_name='$Table';"
    if (-not $OriginalColumns[$Table]) { throw 'Existing schema columns missing' }
    $OriginalHashes[$Table] = Get-RowDigest $Table
}
$Evidence = Join-Path $Run ('hr-settlement-schema-' + [guid]::NewGuid().ToString('N'))
[IO.Directory]::CreateDirectory($Evidence) | Out-Null
$Projection = $Statements -join [Environment]::NewLine
[IO.File]::WriteAllText((Join-Path $Evidence 'approved-projection.sql'), $Projection, [Text.UTF8Encoding]::new($false))
if ([IO.Path]::GetFullPath((Invoke-OwnedSql 'SELECT @@datadir;')).TrimEnd('\','/') -ne $Data.TrimEnd('\','/')) { throw 'Database ownership changed before apply' }
Invoke-OwnedSql $Projection | Out-Null
foreach ($Table in $OriginalHashes.Keys) {
    if ((Get-RowDigest $Table) -ne $OriginalHashes[$Table]) { throw "Original $Table rows changed during installation" }
}
$Total = Invoke-OwnedSql "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='cloud_flow_db' AND table_type='BASE TABLE';"
if ($Total -ne '374') { throw 'Settlement table installation incomplete' }
foreach ($Table in $Tables) { if ((Invoke-OwnedSql "SELECT COUNT(*) FROM $Table;") -ne '0') { throw 'New settlement tables must remain empty' } }
$SalaryColumns = Invoke-OwnedSql "SELECT COUNT(*) FROM information_schema.columns WHERE table_schema='cloud_flow_db' AND table_name='hr_salary_slip' AND column_name='reserved_settlement_id';"
$PaymentColumns = Invoke-OwnedSql "SELECT COUNT(*) FROM information_schema.columns WHERE table_schema='cloud_flow_db' AND table_name='biz_payment_request' AND column_name IN ('source_biz_type','source_biz_id');"
$Precision = Invoke-OwnedSql "SELECT CONCAT(numeric_precision,':',numeric_scale) FROM information_schema.columns WHERE table_schema='cloud_flow_db' AND table_name='biz_payment_request' AND column_name='amount';"
$Indexes = Invoke-OwnedSql "SELECT COUNT(DISTINCT index_name) FROM information_schema.statistics WHERE table_schema='cloud_flow_db' AND ((table_name='hr_salary_slip' AND index_name='idx_salary_settlement') OR (table_name='biz_payment_request' AND index_name='uk_payment_request_source'));"
$Constraints = Invoke-OwnedSql "SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema='cloud_flow_db' AND table_name='biz_payment_request' AND constraint_name='chk_payment_request_source' AND constraint_type='CHECK' AND enforced='YES';"
if ($SalaryColumns -ne '1' -or $PaymentColumns -ne '2' -or $Precision -ne '14:2' -or $Indexes -ne '2' -or $Constraints -ne '1') { throw 'Settlement columns or constraints incomplete' }
if ((Invoke-OwnedSql 'SELECT COUNT(*) FROM hr_salary_slip WHERE reserved_settlement_id IS NOT NULL;') -ne '0' -or
    (Invoke-OwnedSql 'SELECT COUNT(*) FROM biz_payment_request WHERE source_biz_type IS NOT NULL OR source_biz_id IS NOT NULL;') -ne '0') { throw 'Existing sources must remain unassigned' }
Write-Output "H2_SETTLEMENT_SCHEMA_APPLIED: tables=$Total; new_tables=6; new_business_rows=0; original_salary_payment_rows_unchanged=true; menus_unchanged=true; grants_unchanged=true; salary_reservation_columns=1; payment_source_columns=2; payment_precision=14:2; source_constraint_enforced=true; production_modified=false"
Write-Output "H2_SETTLEMENT_SCHEMA_EVIDENCE=$Evidence"
