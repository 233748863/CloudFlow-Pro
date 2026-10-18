param([Parameter(Mandatory = $true)][string]$StatePath)

$ErrorActionPreference = 'Stop'
$Root = [IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
$Runtime = [IO.Path]::GetFullPath((Join-Path $Root '.cloudflow-runtime/batch-g-integration'))
$StateFile = (Resolve-Path -LiteralPath $StatePath).Path
$Directory = Split-Path -Parent $StateFile
if ([IO.Path]::GetPathRoot($Root) -eq ($env:SystemDrive + '\')) { throw 'Isolated preparation must use a data drive' }
if ((Split-Path -Parent $Directory) -ne $Runtime -or (Split-Path -Leaf $Directory) -notmatch '^[a-f0-9]{32}$' -or (Split-Path -Leaf $StateFile) -ne 'state.json') { throw 'Owned isolated state required' }
foreach ($Candidate in @($Root, $Runtime, $Directory, $StateFile, (Join-Path $Directory 'mysql-data'))) {
    if ((Get-Item -LiteralPath $Candidate).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Redirected isolated path rejected' }
}
$State = Get-Content -LiteralPath $StateFile -Raw | ConvertFrom-Json
if ($State.status -ne 'RUNNING' -or [IO.Path]::GetFullPath($State.run) -ne $Directory -or $State.mysqlPort -lt 1024 -or $State.mysqlPort -gt 65535) { throw 'Invalid isolated state' }
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

$ActualData = Invoke-OwnedSql 'SELECT @@datadir;'
if ([IO.Path]::GetFullPath($ActualData).TrimEnd('\', '/') -ne [IO.Path]::GetFullPath((Join-Path $Directory 'mysql-data')).TrimEnd('\', '/')) { throw 'Owned database directory required' }
$Count = [int](Invoke-OwnedSql "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='cloud_flow_db' AND table_type='BASE TABLE';")
if ($Count -notin @(336, 337)) { throw "Expected isolated opportunity or email archive schema; tables=$Count" }
$EmployeeSql = "SET SESSION group_concat_max_len=8388608; SELECT SHA2(GROUP_CONCAT(CONCAT_WS(':',tenant_id,role_id,menu_id) ORDER BY tenant_id,role_id,menu_id SEPARATOR ','),256) FROM sys_role_menu WHERE role_id=5;"
$EmployeeBefore = Invoke-OwnedSql $EmployeeSql
$Existing = [int](Invoke-OwnedSql "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='cloud_flow_db' AND table_name='crm_email_record';")
if ($Count -eq 336) {
    if ($Existing -ne 0) { throw 'Partial email archive schema requires inspection' }
    $Conflict = Invoke-OwnedSql 'SELECT COUNT(*) FROM sys_menu WHERE menu_id IN (1909,1910,1911);'
    if ($Conflict -ne '0') { throw 'Approved email archive menu identifiers are occupied; refusing changes' }
    if ((Invoke-OwnedSql "SELECT COUNT(*) FROM sys_message_template WHERE tenant_id=100000 AND template_code='CRM_CUSTOMER_EMAIL';") -ne '0') { throw 'Customer email template identifier is occupied' }
    Write-Output 'H3_EMAIL_PREINSERT_MENU_CONFLICTS: ids=1909,1910,1911; range=1900-1949; rows=0; isolated=true'
    $Formal = [IO.File]::ReadAllText((Join-Path $Root 'cloudflow-backend/DB/05.cloudflow-crm.sql'))
    $Definition = [regex]::Match($Formal, '(?ms)^CREATE TABLE crm_email_record\s*\(.*?^\) ENGINE=.*?;')
    if (-not $Definition.Success) { throw 'Formal approved email archive definition missing' }
    $Seed = [IO.File]::ReadAllText((Join-Path $Root 'cloudflow-backend/DB/06.cloudflow-business-seed.sql'))
    $Block = [regex]::Match($Seed, '(?s)-- batch-h3-email-archive:start.*?-- batch-h3-email-archive:end')
    if (-not $Block.Success) { throw 'Formal email archive seed block missing' }
    Invoke-OwnedSql $Definition.Value | Out-Null
    Invoke-OwnedSql ("START TRANSACTION;`n" + $Block.Value + "`nCOMMIT;") | Out-Null
} elseif ($Existing -ne 1) { throw 'Archive table count is inconsistent' }
if ((Invoke-OwnedSql $EmployeeSql) -ne $EmployeeBefore) { throw 'Employee grants changed during isolated preparation' }
$Count = Invoke-OwnedSql "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='cloud_flow_db' AND table_type='BASE TABLE';"
$MenuIds = Invoke-OwnedSql 'SELECT GROUP_CONCAT(menu_id ORDER BY menu_id) FROM sys_menu WHERE menu_id BETWEEN 1900 AND 1949;'
if ($Count -ne '337' -or $MenuIds -ne '1900,1901,1902,1903,1905,1906,1909,1910,1911') { throw 'Prepared archive schema or exact H3 menus differ from approval' }
foreach ($MenuId in @(1909, 1910, 1911)) {
    if ((Invoke-OwnedSql "SELECT GROUP_CONCAT(role_id ORDER BY role_id) FROM sys_role_menu WHERE tenant_id=100000 AND menu_id=$MenuId;") -ne '1,8,9,10,11') { throw 'Email archive role grants differ from approval' }
}
Write-Output "H3_EMAIL_RUNTIME_PREPARED: tables=$Count; approved_new_tables=1; email_menu_ids=1909,1910,1911; exact_role_grants=15; employee_grants_changed=0; production_modified=false"
