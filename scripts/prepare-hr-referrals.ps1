param([Parameter(Mandatory = $true)][string]$StatePath, [switch]$Apply, [switch]$ResumeEmptyTables, [switch]$BonusSettingsOnly)

$ErrorActionPreference = 'Stop'
$Root = [IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
. (Join-Path $Root '.cloudflow-runtime/use-data-drive.ps1')
$StateFile = (Resolve-Path -LiteralPath $StatePath).Path
$Run = Split-Path -Parent $StateFile
$Runtime = Join-Path $Root '.cloudflow-runtime/batch-g-integration'
if ((Split-Path -Parent $Run) -ne $Runtime -or (Split-Path -Leaf $Run) -notmatch '^[a-f0-9]{32}$' -or (Split-Path -Leaf $StateFile) -ne 'state.json') { throw 'Owned isolated state required' }
$Data = Join-Path $Run 'mysql-data'
foreach ($Candidate in @($Root, $Runtime, $Run, $StateFile, $Data)) {
    if ((Get-Item -LiteralPath $Candidate).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Redirected test path rejected' }
}
$State = Get-Content -LiteralPath $StateFile -Raw | ConvertFrom-Json
if ($State.status -ne 'RUNNING' -or [IO.Path]::GetFullPath($State.run) -ne $Run -or $State.mysqlPort -lt 1024 -or $State.mysqlPort -gt 65535) { throw 'Running isolated environment required' }
$Owned = @($State.processes | Where-Object name -EQ 'mysql')
if ($Owned.Count -ne 1 -or $Owned[0].marker -ne $Data) { throw 'Unique owned database marker required' }
$Process = Get-CimInstance Win32_Process -Filter "ProcessId = $($Owned[0].id)"
if (-not $Process -or $Process.Name -ne 'mysqld.exe' -or -not $Process.CommandLine.Contains($Data)) { throw 'Database ownership mismatch' }
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
    foreach ($Argument in @('--no-defaults','--protocol=TCP','--host=127.0.0.1',"--port=$($State.mysqlPort)",'--user=root','--skip-password','--batch','--raw','--skip-column-names','--default-character-set=utf8mb4')) { $Info.ArgumentList.Add($Argument) }
    $Child = [Diagnostics.Process]::Start($Info)
    $Output = $Child.StandardOutput.ReadToEndAsync(); $Errors = $Child.StandardError.ReadToEndAsync()
    $Child.StandardInput.WriteLine($Sql); $Child.StandardInput.Close()
    if (-not $Child.WaitForExit(120000)) { $Child.Kill(); throw 'Owned SQL client timed out' }
    if ($Child.ExitCode -ne 0) { throw $Errors.GetAwaiter().GetResult() }
    return $Output.GetAwaiter().GetResult().Trim()
}
function Confirm-OwnedData {
    if ([IO.Path]::GetFullPath((Invoke-OwnedSql 'SELECT @@datadir;')).TrimEnd('\','/') -ne $Data.TrimEnd('\','/')) { throw 'Database data directory mismatch' }
}
Confirm-OwnedData
if ($BonusSettingsOnly) {
    if ($ResumeEmptyTables) { throw 'Choose either settings completion or empty-table resume' }
    $Seed = [IO.File]::ReadAllText((Join-Path $Root 'cloudflow-backend/DB/06.cloudflow-business-seed.sql'))
    $Position = $Seed.IndexOf("UNION ALL SELECT 'sys.hr.referral.processKey' AS config_key", [StringComparison]::Ordinal)
    if ($Position -lt 0) { throw 'Approved referral settings seed missing' }
    $Start = $Seed.LastIndexOf('INSERT INTO cloud_flow_db.sys_config', $Position, [StringComparison]::Ordinal)
    $End = $Seed.IndexOf(';', $Position)
    if ($Start -lt 0 -or $End -le $Position) { throw 'Approved settings statement not found' }
    $Keys = "'sys.hr.referral.processKey','sys.hr.referral.approvalUsers','sys.hr.offer.processKey'"
    $Statement = $Seed.Substring($Start, $End - $Start) + " AND seeds.config_key IN ($Keys);"
    if (-not $Statement.Contains('AND NOT EXISTS') -or -not $Statement.Contains("'offer_approval' AS config_value")) { throw 'Only absent approved defaults may be installed' }
    $Before = Invoke-OwnedSql "SELECT COUNT(*) FROM cloud_flow_db.sys_config WHERE config_key IN ($Keys);"
    if (-not $Apply) { Write-Output "H2_REFERRAL_SETTINGS: existing=$Before; approved_keys=3; database_writes=0; production_modified=false"; exit 0 }
    Invoke-OwnedSql $Statement | Out-Null
    $Missing = Invoke-OwnedSql "SELECT COUNT(*) FROM cloud_flow_db.sys_tenant tenant WHERE tenant.tenant_id>0 AND tenant.deleted=0 AND tenant.status='0' AND (SELECT COUNT(*) FROM cloud_flow_db.sys_config settings WHERE settings.tenant_id=tenant.tenant_id AND settings.config_key IN ($Keys))<>3;"
    if ($Missing -ne '0') { throw 'Active tenant defaults incomplete or duplicated' }
    $After = Invoke-OwnedSql "SELECT COUNT(*) FROM cloud_flow_db.sys_config WHERE config_key IN ($Keys);"
    Write-Output "H2_REFERRAL_SETTINGS: before=$Before; after=$After; approved_keys=3; incomplete_tenants=$Missing; existing_values_overwritten=0; production_modified=false"
    exit 0
}
if (-not $ResumeEmptyTables) {
    & (Join-Path $Root 'scripts/verify-hr-referrals-preflight.ps1') -StatePath $StateFile
} else {
    $ResumeShape = Invoke-OwnedSql "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='cloud_flow_db' AND table_name IN ('hr_employee_referral','hr_recruitment_identity');"
    $ResumeMenus = Invoke-OwnedSql "SELECT COUNT(*) FROM cloud_flow_db.sys_menu WHERE menu_id BETWEEN 1887 AND 1892 OR perms LIKE 'hr:referral:%';"
    $ResumeRows = Invoke-OwnedSql "SELECT (SELECT COUNT(*) FROM cloud_flow_db.hr_employee_referral)+(SELECT COUNT(*) FROM cloud_flow_db.hr_recruitment_identity);"
    if ($ResumeShape -ne '2' -or $ResumeMenus -ne '0' -or $ResumeRows -ne '0') { throw 'Only empty referral tables without installed menus can resume' }
}
$Formal = [IO.File]::ReadAllText((Join-Path $Root 'cloudflow-backend/DB/03.cloudflow-hr.sql'))
$Proposal = [IO.File]::ReadAllText((Join-Path $Root 'docs/design/H2-人事增强提案DDL.sql'))
$Statements = @()
foreach ($Table in @('hr_employee_referral','hr_recruitment_identity')) {
    $Pattern = "(?ms)^CREATE TABLE $Table \(.+?^\) ENGINE=[^\r\n]*;"
    $Actual = [regex]::Match($Formal, $Pattern).Value.Replace("\r", '')
    $Approved = [regex]::Match($Proposal, $Pattern).Value.Replace("\r", '')
    if (-not $Actual -or [regex]::Replace($Actual, '\s+', ' ') -ne [regex]::Replace($Approved, '\s+', ' ')) { throw 'Referral schema differs from approved proposal' }
    $Statements += $Actual
}
$Seed = [IO.File]::ReadAllText((Join-Path $Root 'cloudflow-backend/DB/06.cloudflow-business-seed.sql'))
$Menus = [regex]::Match($Seed, '(?s)-- batch-h2-referral-entry:start.*?-- batch-h2-referral-entry:end').Value
if (-not $Menus) { throw 'Approved referral menu block missing' }
$Existing = Invoke-OwnedSql "SELECT COUNT(*) FROM cloud_flow_db.hr_candidate;"
$Duplicates = Invoke-OwnedSql "SELECT COUNT(*) FROM (SELECT tenant_id, LOWER(TRIM(email)) AS normalized_email FROM cloud_flow_db.hr_candidate WHERE email IS NOT NULL AND TRIM(email) <> '' GROUP BY tenant_id, LOWER(TRIM(email)) HAVING COUNT(*) > 1) duplicate_email;"
if ($Duplicates -ne '0') { throw 'Existing candidates have conflicting emails; no writes performed' }
$Unsupported = Invoke-OwnedSql "SELECT COUNT(*) FROM cloud_flow_db.hr_candidate WHERE email IS NOT NULL AND TRIM(email) <> '' AND (email NOT REGEXP '^[A-Za-z0-9._+-]+@[A-Za-z0-9.-]+[.][A-Za-z]{2,}$' OR email LIKE '%..%' OR CHAR_LENGTH(email)>254);"
if ($Unsupported -ne '0') { throw 'Existing candidate emails require explicit normalization review; no writes performed' }
$Before = Invoke-OwnedSql "SET SESSION group_concat_max_len=8388608; SELECT SHA2(COALESCE(GROUP_CONCAT(SHA2(CAST(JSON_ARRAY(id,tenant_id,email,phone) AS CHAR),256) ORDER BY id SEPARATOR ''),''),256) FROM cloud_flow_db.hr_candidate;"
if (-not $Apply) { Write-Output "H2_REFERRAL_PREPARE: preflight=true; pending_tables=2; pending_menus=6; candidate_rows=$Existing; database_writes=0; production_modified=false"; exit 0 }
Confirm-OwnedData
$Projection = "USE cloud_flow_db;" + [Environment]::NewLine + ($Statements -join [Environment]::NewLine)
if (-not $ResumeEmptyTables) { Invoke-OwnedSql $Projection | Out-Null }
$Bootstrap = @'
INSERT INTO cloud_flow_db.hr_recruitment_identity (tenant_id,identity_type,identity_hash,candidate_id,create_by,update_by)
SELECT tenant_id,'EMAIL',SHA2(CONCAT(tenant_id,':EMAIL:',LOWER(TRIM(email))),256),id,'referral-bootstrap','referral-bootstrap'
FROM cloud_flow_db.hr_candidate WHERE email IS NOT NULL AND TRIM(email)<>'';
INSERT INTO cloud_flow_db.hr_recruitment_identity (tenant_id,identity_type,identity_hash,candidate_id,create_by,update_by)
SELECT tenant_id,'PHONE',SHA2(CONCAT(tenant_id,':PHONE:',TRIM(phone)),256),id,'referral-bootstrap','referral-bootstrap'
FROM cloud_flow_db.hr_candidate WHERE phone REGEXP '^\\+[1-9][0-9]{6,14}$';
'@
Invoke-OwnedSql ("USE cloud_flow_db; START TRANSACTION;" + [Environment]::NewLine + $Menus + [Environment]::NewLine + $Bootstrap + [Environment]::NewLine + "COMMIT;") | Out-Null
$After = Invoke-OwnedSql "SET SESSION group_concat_max_len=8388608; SELECT SHA2(COALESCE(GROUP_CONCAT(SHA2(CAST(JSON_ARRAY(id,tenant_id,email,phone) AS CHAR),256) ORDER BY id SEPARATOR ''),''),256) FROM cloud_flow_db.hr_candidate;"
if ($Before -ne $After -or (Invoke-OwnedSql "SELECT COUNT(*) FROM cloud_flow_db.hr_candidate;") -ne $Existing) { throw 'Existing candidate contacts changed' }
$Tables = Invoke-OwnedSql "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='cloud_flow_db' AND table_type='BASE TABLE';"
$MenuCount = Invoke-OwnedSql "SELECT COUNT(*) FROM cloud_flow_db.sys_menu WHERE menu_id BETWEEN 1887 AND 1892;"
$Grants = Invoke-OwnedSql "SELECT COUNT(*) FROM cloud_flow_db.sys_role_menu WHERE tenant_id=100000 AND menu_id BETWEEN 1887 AND 1892;"
$EmployeeMenus = Invoke-OwnedSql "SELECT GROUP_CONCAT(menu_id ORDER BY menu_id) FROM cloud_flow_db.sys_role_menu WHERE tenant_id=100000 AND role_id=5 AND menu_id BETWEEN 1887 AND 1892;"
$Identities = Invoke-OwnedSql "SELECT COUNT(*) FROM cloud_flow_db.hr_recruitment_identity;"
if ($Tables -ne '368' -or $MenuCount -ne '6' -or $Grants -ne '30' -or $EmployeeMenus -ne '1888,1889') { throw 'Referral installation verification failed' }
Write-Output "H2_REFERRAL_PREPARE: applied=true; tables=$Tables; new_menus=$MenuCount; new_grants=$Grants; employee_menus=$EmployeeMenus; initial_identities=$Identities; existing_contacts_unchanged=true; country_codes_inferred=0; production_modified=false"
& node (Join-Path $Root 'scripts/refresh-isolated-referral-menu-cache.mjs') $StateFile
if ($LASTEXITCODE -ne 0) { throw 'Referral installation completed but exact permission cache refresh failed' }
& $PSCommandPath -StatePath $StateFile -BonusSettingsOnly -Apply
if ($LASTEXITCODE -ne 0) { throw 'Referral menus installed but default settings completion failed' }
