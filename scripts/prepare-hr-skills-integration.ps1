param([Parameter(Mandatory = $true)][string]$StatePath, [switch]$CheckOnly)

$ErrorActionPreference = 'Stop'
$Root = [IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
if ([IO.Path]::GetPathRoot($Root) -eq ($env:SystemDrive + '\')) { throw 'Skill preparation requires a data drive' }
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
$SkillTables = Invoke-OwnedSql "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='cloud_flow_db' AND table_name IN ('hr_skill','hr_position_skill','hr_employee_skill');"
$CourseColumns = Invoke-OwnedSql "SELECT COUNT(*) FROM information_schema.columns WHERE table_schema='cloud_flow_db' AND table_name='hr_training_course' AND column_name IN ('skill_id','target_level');"
$MenuCount = Invoke-OwnedSql "SELECT COUNT(*) FROM sys_menu WHERE menu_id IN (1877,1878,1879,1880,1881,1893) OR perms LIKE 'hr:skill:%';"
$TableCount = Invoke-OwnedSql "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='cloud_flow_db' AND table_type='BASE TABLE';"
Write-Output "H2_SKILL_OWNERSHIP: loopback=true; mysql_process=$($Listener.ProcessId); production_modified=false"
Write-Output "H2_SKILL_PREPARE_BASELINE: tables=$TableCount; skill_tables=$SkillTables; course_columns=$CourseColumns; candidate_menu_rows=$MenuCount"
if ($SkillTables -eq '3' -and $CourseColumns -eq '2' -and $MenuCount -eq '6' -and $TableCount -eq '341') {
    if ((Invoke-OwnedSql 'SELECT COUNT(*) FROM sys_role_menu WHERE tenant_id=100000 AND menu_id IN (1877,1878,1879,1880,1881,1893);') -ne '41') { throw 'Existing skill grants differ from approved count' }
    Write-Output 'H2_SKILL_PREPARE: already_applied=true; database_writes=0; production_modified=false'
    exit 0
}
if ($SkillTables -ne '0' -or $CourseColumns -ne '0' -or $MenuCount -ne '0' -or $TableCount -ne '338') { throw 'Partial schema or menu collision requires inspection; no writes performed' }
Write-Output 'H2_SKILL_MENU_PREINSERT_CONFLICT_ROWS=0'
if ($CheckOnly) { Write-Output 'H2_SKILL_PREPARE_CHECK: database_writes=0; production_modified=false'; exit 0 }
$BeforeCourses = Invoke-OwnedSql 'SELECT COUNT(*) FROM hr_training_course;'
$GrantDigestSql = "SET SESSION group_concat_max_len=8388608; SELECT SHA2(GROUP_CONCAT(CONCAT(tenant_id,':',role_id,':',menu_id) ORDER BY tenant_id,role_id,menu_id SEPARATOR ','),256) FROM sys_role_menu WHERE menu_id NOT IN (1877,1878,1879,1880,1881,1893);"
$BeforeGrants = Invoke-OwnedSql $GrantDigestSql
$Schema = Get-Content -LiteralPath (Join-Path $Root 'cloudflow-backend/DB/03.cloudflow-hr.sql') -Raw -Encoding utf8
$Statements = @('SET NAMES utf8mb4;')
foreach ($Table in @('hr_skill','hr_position_skill','hr_employee_skill')) {
    $Create = [regex]::Match($Schema, "(?ms)^CREATE TABLE $Table \(.*?^\) ENGINE=[^\r\n]*;").Value
    if (-not $Create) { throw "Approved formal table not found: $Table" }
    $Statements += $Create
}
$Proposal = Get-Content -LiteralPath (Join-Path $Root 'docs/design/H2-人事增强提案DDL.sql') -Raw -Encoding utf8
$Alter = [regex]::Match($Proposal, '(?ms)^ALTER TABLE hr_training_course\s+.*?;').Value
if (-not $Alter) { throw 'Approved course alteration not found' }
$Seed = Get-Content -LiteralPath (Join-Path $Root 'cloudflow-backend/DB/06.cloudflow-business-seed.sql') -Raw -Encoding utf8
$Menus = [regex]::Match($Seed, '(?s)-- batch-h2-skills:start.*?-- batch-h2-skills:end').Value
if (-not $Menus) { throw 'Approved skill menu segment not found' }
$Statements += $Alter
$Statements += $Menus
$Evidence = Join-Path $Run ('hr-skills-prepare-' + [guid]::NewGuid().ToString('N'))
[IO.Directory]::CreateDirectory($Evidence) | Out-Null
[IO.File]::WriteAllText((Join-Path $Evidence 'course-schema-before.sql'), (Invoke-OwnedSql 'SHOW CREATE TABLE hr_training_course;'), [Text.UTF8Encoding]::new($false))
$Projection = $Statements -join "`n"
[IO.File]::WriteAllText((Join-Path $Evidence 'approved-projection.sql'), $Projection, [Text.UTF8Encoding]::new($false))
Invoke-OwnedSql $Projection | Out-Null
if ((Invoke-OwnedSql 'SELECT COUNT(*) FROM hr_training_course;') -ne $BeforeCourses -or (Invoke-OwnedSql $GrantDigestSql) -ne $BeforeGrants) { throw 'Existing course count or unrelated role grants changed' }
if ((Invoke-OwnedSql "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='cloud_flow_db' AND table_type='BASE TABLE';") -ne '341') { throw 'Physical table count mismatch after preparation' }
if ((Invoke-OwnedSql 'SELECT COUNT(*) FROM sys_role_menu WHERE tenant_id=100000 AND menu_id IN (1877,1878,1879,1880,1881,1893);') -ne '41') { throw 'Skill role grants mismatch' }
Write-Output "H2_SKILL_PREPARE: tables=341; menus=6; role_pairs=41; existing_course_rows_preserved=$BeforeCourses; unrelated_role_grants_unchanged=true; production_modified=false"
Write-Output "H2_SKILL_PREPARE_EVIDENCE=$Evidence"
