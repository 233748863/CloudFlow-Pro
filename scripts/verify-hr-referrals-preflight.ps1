param([Parameter(Mandatory = $true)][string]$StatePath)

$ErrorActionPreference = 'Stop'
$Root = [IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
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
function Read-OwnedSql([string]$Sql) {
    $Info = [Diagnostics.ProcessStartInfo]::new($Mysql)
    $Info.UseShellExecute = $false; $Info.CreateNoWindow = $true
    $Info.RedirectStandardInput = $true; $Info.RedirectStandardOutput = $true; $Info.RedirectStandardError = $true
    $Info.StandardInputEncoding = [Text.UTF8Encoding]::new($false); $Info.StandardOutputEncoding = [Text.UTF8Encoding]::new($false)
    $Info.Environment.Remove('MYSQL_PWD') | Out-Null
    foreach ($Argument in @('--no-defaults','--protocol=TCP','--host=127.0.0.1',"--port=$($State.mysqlPort)",'--user=root','--skip-password','--batch','--raw','--skip-column-names','--default-character-set=utf8mb4','cloud_flow_db')) { $Info.ArgumentList.Add($Argument) }
    $Child = [Diagnostics.Process]::Start($Info)
    $Output = $Child.StandardOutput.ReadToEndAsync(); $Errors = $Child.StandardError.ReadToEndAsync()
    $Child.StandardInput.WriteLine("START TRANSACTION READ ONLY;`n$Sql`nCOMMIT;"); $Child.StandardInput.Close()
    if (-not $Child.WaitForExit(30000)) { $Child.Kill(); throw 'Owned SQL client timed out' }
    if ($Child.ExitCode -ne 0) { throw $Errors.GetAwaiter().GetResult() }
    return $Output.GetAwaiter().GetResult().Trim()
}
if ([IO.Path]::GetFullPath((Read-OwnedSql 'SELECT @@datadir;')).TrimEnd('\','/') -ne $Data.TrimEnd('\','/')) { throw 'Database directory mismatch' }
$Baseline = Read-OwnedSql "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='cloud_flow_db' AND table_type='BASE TABLE';"
$ReferralTables = Read-OwnedSql "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='cloud_flow_db' AND table_name IN ('hr_employee_referral','hr_recruitment_identity');"
$Menus = Read-OwnedSql "SELECT COUNT(*) FROM sys_menu WHERE menu_id BETWEEN 1887 AND 1892 OR perms LIKE 'hr:referral:%';"
$Candidates = Read-OwnedSql "SELECT COUNT(*) FROM hr_candidate;"
$PhonesWithoutCountry = Read-OwnedSql "SELECT COUNT(*) FROM hr_candidate WHERE phone IS NOT NULL AND TRIM(phone) <> '' AND TRIM(phone) NOT REGEXP '^\\+[1-9][0-9]{6,14}$';"
$DuplicateEmails = Read-OwnedSql "SELECT COUNT(*) FROM (SELECT tenant_id, LOWER(TRIM(email)) AS email_key FROM hr_candidate WHERE email IS NOT NULL AND TRIM(email) <> '' GROUP BY tenant_id, LOWER(TRIM(email)) HAVING COUNT(*) > 1) duplicate_contacts;"
Write-Output "H2_REFERRAL_PREFLIGHT: physical_tables=$Baseline; referral_tables=$ReferralTables; candidate_menu_conflicts=$Menus; candidate_rows=$Candidates; phones_without_explicit_country=$PhonesWithoutCountry; duplicate_email_groups=$DuplicateEmails"
$Widths = Read-OwnedSql "SELECT CONCAT(table_name,'.',column_name,'=',character_maximum_length) FROM information_schema.columns WHERE table_schema='cloud_flow_db' AND (table_name,column_name) IN (('hr_candidate','email'),('hr_resume_parsed_fields','parsed_email'),('hr_employee','email'),('hr_employee','phone'),('sys_user','email'),('sys_user','phonenumber')) ORDER BY table_name,column_name;"
foreach ($Width in ($Widths -split '\r?\n')) { Write-Output "H2_REFERRAL_ACTUAL_COLUMN_WIDTH: $Width" }
$FormalTables = 0
foreach ($Script in @(Get-ChildItem -LiteralPath (Join-Path $Root 'cloudflow-backend/DB') -File | Where-Object Name -Match '^0[1-5]\.')) {
    $FormalTables += [regex]::Matches([IO.File]::ReadAllText($Script.FullName), '(?m)^CREATE TABLE ').Count
}
$PendingReferralDefinitions = [regex]::Matches([IO.File]::ReadAllText((Join-Path $Root 'cloudflow-backend/DB/03.cloudflow-hr.sql')), '(?m)^CREATE TABLE hr_(employee_referral|recruitment_identity) ').Count
if ([int]$Baseline -ne ($FormalTables - $PendingReferralDefinitions) -or $ReferralTables -ne '0' -or $Menus -ne '0') { throw 'Unexpected baseline or reserved menu conflict; no writes performed' }
Write-Output 'H2_REFERRAL_MENU_IDS=1887,1888,1889,1890,1891,1892; RESERVED=1860-1899; OUT_OF_RANGE=0; PREINSERT_CONFLICT_ROWS=0; EXPECTED_EMPLOYEE_NEW_WRITE=1889'
Write-Output 'H2_REFERRAL_PREFLIGHT_PASS=true; database_writes=0; production_modified=false'
