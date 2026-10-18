param([Parameter(Mandatory = $true)][string]$StatePath, [switch]$Apply, [switch]$TodoManagement)

$ErrorActionPreference = 'Stop'
$Root = [IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
. (Join-Path $Root '.cloudflow-runtime/use-data-drive.ps1')
$StateFile = (Resolve-Path -LiteralPath $StatePath).Path
$Run = Split-Path -Parent $StateFile
if ((Split-Path -Parent $Run) -ne (Join-Path $Root '.cloudflow-runtime/batch-g-integration') -or (Split-Path -Leaf $Run) -notmatch '^[a-f0-9]{32}$' -or (Split-Path -Leaf $StateFile) -ne 'state.json') { throw 'Owned isolated state required' }
$Data = Join-Path $Run 'mysql-data'
foreach ($Candidate in @($Root, $Run, $StateFile, $Data)) {
    if ((Get-Item -LiteralPath $Candidate).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Redirected integration path rejected' }
}
$State = Get-Content -LiteralPath $StateFile -Raw | ConvertFrom-Json
if ($State.status -ne 'RUNNING' -or [IO.Path]::GetFullPath($State.run) -ne $Run) { throw 'Running isolated environment required' }
$Owner = @($State.processes | Where-Object name -EQ 'mysql')
if ($Owner.Count -ne 1 -or $Owner[0].marker -ne $Data) { throw 'Unique owned database required' }
$Process = Get-CimInstance Win32_Process -Filter "ProcessId = $($Owner[0].id)"
if (-not $Process -or $Process.Name -ne 'mysqld.exe' -or -not $Process.CommandLine.Contains($Data)) { throw 'Database ownership mismatch' }
$Listeners = @(Get-NetTCPConnection -State Listen -LocalPort $State.mysqlPort)
if ($Listeners.Count -ne 1 -or $Listeners[0].LocalAddress -ne '127.0.0.1') { throw 'Loopback-only database required' }
$Listener = Get-CimInstance Win32_Process -Filter "ProcessId = $($Listeners[0].OwningProcess)"
if (-not $Listener -or $Listener.Name -ne 'mysqld.exe' -or -not $Listener.CommandLine.Contains($Data) -or ($Listener.ProcessId -ne $Owner[0].id -and $Listener.ParentProcessId -ne $Owner[0].id)) { throw 'Listener ownership mismatch' }
$Mysql = (Get-Command mysql.exe).Source
function Invoke-OwnedSql([string]$Sql) {
    $Info = [Diagnostics.ProcessStartInfo]::new($Mysql)
    $Info.UseShellExecute = $false; $Info.CreateNoWindow = $true
    $Info.RedirectStandardInput = $true; $Info.RedirectStandardOutput = $true; $Info.RedirectStandardError = $true
    $Info.StandardInputEncoding = [Text.UTF8Encoding]::new($false); $Info.StandardOutputEncoding = [Text.UTF8Encoding]::new($false)
    $Info.Environment.Remove('MYSQL_PWD') | Out-Null
    foreach ($Argument in @('--no-defaults','--protocol=TCP','--host=127.0.0.1',"--port=$($State.mysqlPort)",'--user=root','--batch','--raw','--skip-column-names','--default-character-set=utf8mb4','cloud_flow_db')) { $Info.ArgumentList.Add($Argument) }
    $Child = [Diagnostics.Process]::Start($Info)
    $Output = $Child.StandardOutput.ReadToEndAsync(); $Errors = $Child.StandardError.ReadToEndAsync()
    $Child.StandardInput.WriteLine($Sql); $Child.StandardInput.Close()
    if (-not $Child.WaitForExit(30000)) { $Child.Kill(); throw 'Owned SQL client timed out' }
    if ($Child.ExitCode -ne 0) { throw 'Owned callback job preparation failed; transaction was not committed' }
    return $Output.GetAwaiter().GetResult().Trim()
}
if ([IO.Path]::GetFullPath((Invoke-OwnedSql 'SELECT @@datadir;')).TrimEnd('\','/') -ne $Data.TrimEnd('\','/')) { throw 'Database data directory mismatch' }
$Count = Invoke-OwnedSql "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='cloud_flow_db' AND table_type='BASE TABLE';"
if ($Count -ne '366') { throw 'Expected isolated schema required' }
$JobId = if ($TodoManagement) { 1786 } else { 1785 }
$Handler = if ($TodoManagement) { 'imTodoRecovery' } else { 'imCallbackRecovery' }
$Guard = if ($TodoManagement) { 'g4_im_todo_recovery_guard' } else { 'g4_im_callback_recovery_guard' }
if ((Invoke-OwnedSql "SELECT COUNT(*) FROM sys_job WHERE job_id=$JobId OR handler_name='$Handler';") -ne '0') { throw 'Recovery job conflict; no writes performed' }
$HandlerId = [string]$JobId
$ReuseHandler = $false
$HandlerConflicts = Invoke-OwnedSql "SELECT COUNT(*) FROM sys_job_handler WHERE handler_id=$JobId OR handler_name='$Handler';"
if ($HandlerConflicts -ne '0') {
    if (-not $TodoManagement -or $HandlerConflicts -ne '1') { throw 'Recovery handler conflict; no writes performed' }
    $HandlerId = Invoke-OwnedSql "SELECT handler_id FROM sys_job_handler WHERE service_name='auth' AND handler_name='$Handler' AND create_by='system' AND status='ONLINE';"
    if ($HandlerId -notmatch '^[1-9][0-9]{0,18}$') { throw 'Only the matching automatically registered handler may be reused' }
    $ReuseHandler = $true
}
if ($TodoManagement) {
    if ((Invoke-OwnedSql "SELECT COUNT(*) FROM sys_menu WHERE menu_id=1791 OR perms='system:im:todo:reconcile';") -ne '0' -or
        (Invoke-OwnedSql "SELECT COUNT(*) FROM sys_role_menu WHERE menu_id=1791;") -ne '0') { throw 'Approved todo menu conflict; no writes performed' }
    if ((Invoke-OwnedSql "SELECT COUNT(*) FROM sys_role WHERE role_id=1 AND tenant_id=100000 AND role_key='admin' AND status='0' AND deleted=0;") -ne '1' -or
        (Invoke-OwnedSql "SELECT COUNT(*) FROM sys_menu WHERE menu_id=1780 AND perms='system:im:config:list';") -ne '1' -or
        (Invoke-OwnedSql 'SELECT COUNT(*) FROM sys_im_config;') -ne '0') { throw 'Expected administrator, parent menu and disabled vendor baseline required' }
}
$Seed = [IO.File]::ReadAllText((Join-Path $Root 'cloudflow-backend/DB/06.cloudflow-business-seed.sql'))
$Block = [regex]::Matches($Seed, ('(?s)CREATE TEMPORARY TABLE ' + $Guard + ' .*?DROP TEMPORARY TABLE ' + $Guard + ';'))
if ($Block.Count -ne 1) { throw 'Unique formal callback job seed required' }
$JobSql = $Block[0].Value
if ($ReuseHandler) {
    $HandlerInsert = [regex]::Matches($JobSql, '(?s)INSERT INTO cloud_flow_db\.sys_job_handler\s+\(handler_id,.*?;')
    if ($HandlerInsert.Count -ne 1) { throw 'Exact formal handler insertion required' }
    $JobSql = $JobSql.Replace($HandlerInsert[0].Value, '')
    $Before = "SELECT COUNT(*) = 0 FROM cloud_flow_db.sys_job_handler WHERE handler_id = $JobId OR handler_name = '$Handler';"
    if (-not $JobSql.Contains($Before)) { throw 'Exact formal handler guard required' }
    $After = "SELECT COUNT(*) = 1 FROM cloud_flow_db.sys_job_handler WHERE handler_id = $HandlerId AND service_name = 'auth' AND handler_name = '$Handler' AND create_by = 'system' AND status = 'ONLINE';"
    $JobSql = $JobSql.Replace($Before, $After)
}
$MenuSql = ''
if ($TodoManagement) {
    $MenuBlock = [regex]::Matches($Seed, '(?s)CREATE TEMPORARY TABLE g4_im_todo_menu_guard .*?DROP TEMPORARY TABLE g4_im_todo_menu_guard;')
    if ($MenuBlock.Count -ne 1) { throw 'Unique approved todo menu seed required' }
    $MenuSql = $MenuBlock[0].Value
}
Write-Output "G4_IM_CALLBACK_JOB_PREFLIGHT: job_id=$JobId; job_conflicts=0; handler_id=$HandlerId; matching_handler_reused=$ReuseHandler; todo_menu=$TodoManagement; permanent_tables=366; formal_job_and_menu_seed=true; production_modified=false"
if (-not $Apply) { return }
$Sql = "START TRANSACTION;`n" + $JobSql + "`n" + $MenuSql + "`nCOMMIT;"
$Evidence = Join-Path $Run ('im-callback-prepare-' + [Guid]::NewGuid().ToString('N'))
[IO.Directory]::CreateDirectory($Evidence) | Out-Null
[IO.File]::WriteAllText((Join-Path $Evidence 'executed.sql'), $Sql, [Text.UTF8Encoding]::new($false))
Invoke-OwnedSql $Sql | Out-Null
if ((Invoke-OwnedSql "SELECT COUNT(*) FROM sys_job WHERE job_id=$JobId AND tenant_id=100000 AND handler_name='$Handler' AND status='ENABLED' AND interval_ms=10000 AND concurrent_flag=0 AND timeout_seconds=240 AND lock_time_seconds=300;") -ne '1') { throw 'Formal recovery job result mismatch' }
if ($TodoManagement) {
    if ((Invoke-OwnedSql "SELECT CONCAT(role_id,':',menu_id,':',tenant_id) FROM sys_role_menu WHERE menu_id=1791;") -ne '1:1791:100000') { throw 'Approved administrator grant mismatch' }
    Write-Output "G4_IM_TODO_MANAGEMENT_APPLY: job_id=1786; handler_id=$HandlerId; matching_handler_reused=$ReuseHandler; interval_ms=10000; concurrent=false; menu_id=1791; grant=1:1791:100000; production_modified=false"
} else { Write-Output 'G4_IM_CALLBACK_JOB_APPLY: job_id=1785; handler_id=1785; interval_ms=10000; concurrent=false; menu_writes=0; permission_writes=0; production_modified=false' }
