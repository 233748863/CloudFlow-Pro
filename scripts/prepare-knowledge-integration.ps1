param([Parameter(Mandatory = $true)][string]$StatePath, [switch]$CheckOnly)

$ErrorActionPreference = 'Stop'
$Root = [IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
if ([IO.Path]::GetPathRoot($Root) -eq ($env:SystemDrive + '\')) { throw 'Knowledge preparation requires a data drive' }
. (Join-Path $Root '.cloudflow-runtime/use-data-drive.ps1')
$Runtime = [IO.Path]::GetFullPath((Join-Path $Root '.cloudflow-runtime/batch-g-integration'))
$StateFile = (Resolve-Path -LiteralPath $StatePath).Path
$Run = Split-Path -Parent $StateFile
if ((Split-Path -Parent $Run) -ne $Runtime -or (Split-Path -Leaf $Run) -notmatch '^[a-f0-9]{32}$' -or (Split-Path -Leaf $StateFile) -ne 'state.json') { throw 'Owned isolated state required' }
$Data = Join-Path $Run 'mysql-data'
foreach ($Candidate in @($Root, $Runtime, $Run, $StateFile, $Data)) {
    if ((Get-Item -LiteralPath $Candidate).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Redirected isolated path rejected' }
}
$State = Get-Content -LiteralPath $StateFile -Raw | ConvertFrom-Json
if ($State.status -ne 'RUNNING' -or [IO.Path]::GetFullPath($State.run) -ne $Run -or $State.mysqlPort -lt 1024 -or $State.mysqlPort -gt 65535) { throw 'Running owned integration required' }
$Owned = @($State.processes | Where-Object name -EQ 'mysql')
if ($Owned.Count -ne 1 -or $Owned[0].marker -ne $Data) { throw 'Unique owned MySQL marker required' }
$Process = Get-CimInstance Win32_Process -Filter "ProcessId = $($Owned[0].id)"
if (-not $Process -or $Process.Name -ne 'mysqld.exe' -or -not $Process.CommandLine.Contains($Data)) { throw 'Owned MySQL process mismatch' }
$Listeners = @(Get-NetTCPConnection -State Listen -LocalPort $State.mysqlPort)
if ($Listeners.Count -ne 1 -or $Listeners[0].LocalAddress -ne '127.0.0.1') { throw 'Owned loopback MySQL listener required' }
$ListenerProcess = Get-CimInstance Win32_Process -Filter "ProcessId = $($Listeners[0].OwningProcess)"
if (-not $ListenerProcess -or $ListenerProcess.Name -ne 'mysqld.exe' -or -not $ListenerProcess.CommandLine.Contains($Data) -or ($ListenerProcess.ProcessId -ne $Owned[0].id -and $ListenerProcess.ParentProcessId -ne $Owned[0].id)) { throw 'MySQL listener must be owned process or its verified child' }
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
if ([IO.Path]::GetFullPath((Invoke-OwnedSql 'SELECT @@datadir;')).TrimEnd('\', '/') -ne $Data.TrimEnd('\', '/')) { throw 'Database directory is not owned' }
$EmployeeSql = "SET SESSION group_concat_max_len=8388608; SELECT SHA2(GROUP_CONCAT(CONCAT_WS(':',tenant_id,role_id,menu_id) ORDER BY tenant_id,role_id,menu_id SEPARATOR ','),256) FROM sys_role_menu WHERE role_id=5;"
$EmployeeBefore = Invoke-OwnedSql $EmployeeSql
$Count = Invoke-OwnedSql "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='cloud_flow_db' AND table_type='BASE TABLE';"
if ($Count -ne '338') { throw 'Knowledge preparation expects 338 approved physical tables' }
$ColumnCountSql = "SELECT COUNT(*) FROM information_schema.columns WHERE table_schema='cloud_flow_db' AND table_name='oa_knowledge_document' AND column_name IN ('external_visible_flag','external_version_id','external_attachment_file_ids');"
$Columns = Invoke-OwnedSql $ColumnCountSql
$Menu = Invoke-OwnedSql "SELECT COUNT(*) FROM sys_menu WHERE menu_id=1915 OR perms='oa:knowledge:external-publish';"
Write-Output "KNOWLEDGE_PREPARE_BASELINE: tables=$Count; new_columns=$Columns; menu_1915_rows=$Menu"
if ($Columns -notin @('0','2','3')) { throw 'Partial knowledge schema requires inspection' }
if ($Columns -eq '2' -and (Invoke-OwnedSql "SELECT COUNT(*) FROM information_schema.columns WHERE table_schema='cloud_flow_db' AND table_name='oa_knowledge_document' AND column_name IN ('external_visible_flag','external_version_id');") -ne '2') { throw 'Unexpected partial knowledge schema' }
if ($Menu -eq '0') {
    Write-Output 'KNOWLEDGE_MENU_CONFLICT_BEFORE_INSERT: query=menu_id=1915 OR perms=oa:knowledge:external-publish; rows=0'
} elseif ($Menu -ne '1' -or (Invoke-OwnedSql "SELECT COUNT(*) FROM sys_menu WHERE menu_id=1915 AND parent_id=210 AND perms='oa:knowledge:external-publish' AND create_by='seed';") -ne '1') {
    throw 'Knowledge menu conflict requires user review'
}
if ($CheckOnly) { Write-Output 'KNOWLEDGE_PRECHECK: database_writes=0; production_modified=false'; exit 0 }
if ($Columns -eq '0') {
    Invoke-OwnedSql "ALTER TABLE oa_knowledge_document ADD COLUMN external_visible_flag TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否明确对客户门户发布', ADD COLUMN external_version_id BIGINT(20) DEFAULT NULL COMMENT '明确发布的知识版本ID，工作草稿不可外显', ADD COLUMN external_attachment_file_ids JSON DEFAULT NULL COMMENT '明确对外公开的版本附件文件ID清单，未选择的不对外提供';" | Out-Null
} elseif ($Columns -eq '2') {
    Invoke-OwnedSql "ALTER TABLE oa_knowledge_document ADD COLUMN external_attachment_file_ids JSON DEFAULT NULL COMMENT '明确对外公开的版本附件文件ID清单，未选择的不对外提供';" | Out-Null
}
if ($Menu -eq '0') {
    $Seed = [IO.File]::ReadAllText((Join-Path $Root 'cloudflow-backend/DB/06.cloudflow-business-seed.sql'))
    $Start = $Seed.IndexOf('CREATE TEMPORARY TABLE h3_knowledge_publication_guard ')
    $EndToken = 'DROP TEMPORARY TABLE h3_knowledge_publication_guard;'
    $End = $Seed.IndexOf($EndToken)
    if ($Start -lt 0 -or $End -lt $Start) { throw 'Approved knowledge seed block missing' }
    Invoke-OwnedSql ($Seed.Substring($Start, $End + $EndToken.Length - $Start)) | Out-Null
}
if ((Invoke-OwnedSql $ColumnCountSql) -ne '3') { throw 'Knowledge columns not applied' }
if ((Invoke-OwnedSql "SELECT GROUP_CONCAT(CONCAT(tenant_id,':',role_id) ORDER BY tenant_id,role_id) FROM sys_role_menu WHERE menu_id=1915;") -ne '100000:1,100000:7') { throw 'Knowledge roles differ from approval' }
if ((Invoke-OwnedSql 'SELECT GROUP_CONCAT(menu_id ORDER BY menu_id) FROM sys_menu WHERE menu_id BETWEEN 1900 AND 1949;') -ne '1900,1901,1902,1903,1904,1905,1906,1909,1910,1911,1912,1913,1914,1915') { throw 'Exact H3 menu set differs from approval' }
if ((Invoke-OwnedSql $EmployeeSql) -ne $EmployeeBefore) { throw 'Employee grants changed during knowledge preparation' }
Write-Output 'KNOWLEDGE_SCHEMA_READY: tables=338; approved_columns=3; menu_ids=1915; role_grants=2; employee_grants_changed=0; production_modified=false'
