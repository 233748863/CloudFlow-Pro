param([Parameter(Mandatory = $true)][string]$StatePath, [switch]$Apply, [switch]$TrainingRecovery)
$ErrorActionPreference = 'Stop'
$MenuId = if ($TrainingRecovery) { 1870 } else { 1869 }
$MenuPath = if ($TrainingRecovery) { '/hr/training-recoveries' } else { '/hr/exit-interviews' }
$Permission = if ($TrainingRecovery) { 'hr:training-recovery:manage' } else { 'hr:exit-interview:manage' }
$Component = if ($TrainingRecovery) { 'pages/hr/HrTrainingRecoveryPage' } else { 'pages/hr/HrExitInterviewPage' }
$BlockName = if ($TrainingRecovery) { 'training-recovery' } else { 'exit-interview' }
$EvidenceName = if ($TrainingRecovery) { 'TRAINING_RECOVERY' } else { 'EXIT_INTERVIEW' }
$Root = [IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
. (Join-Path $Root '.cloudflow-runtime/use-data-drive.ps1')
$StateFile = (Resolve-Path -LiteralPath $StatePath).Path
$Run = Split-Path -Parent $StateFile
$Runtime = Join-Path $Root '.cloudflow-runtime/batch-g-integration'
if ((Split-Path -Parent $Run) -ne $Runtime -or (Split-Path -Leaf $Run) -notmatch '^[a-f0-9]{32}$' -or (Split-Path -Leaf $StateFile) -ne 'state.json') { throw 'Owned isolated state required' }
$Data = Join-Path $Run 'mysql-data'
foreach ($Candidate in @($Root,$Runtime,$Run,$StateFile,$Data)) {
    if ((Get-Item -LiteralPath $Candidate).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Redirected path rejected' }
}
$State = Get-Content -LiteralPath $StateFile -Raw | ConvertFrom-Json
if ($State.status -ne 'RUNNING' -or [IO.Path]::GetFullPath($State.run) -ne $Run -or $State.mysqlPort -lt 1024 -or $State.mysqlPort -gt 65535) { throw 'Running owned environment required' }
$Owned = @($State.processes | Where-Object name -EQ 'mysql')
if ($Owned.Count -ne 1 -or $Owned[0].marker -ne $Data) { throw 'Unique database marker required' }
$Process = Get-CimInstance Win32_Process -Filter "ProcessId = $($Owned[0].id)"
if (-not $Process -or $Process.Name -ne 'mysqld.exe' -or -not $Process.CommandLine.Contains($Data)) { throw 'Owned database process required' }
$Listeners = @(Get-NetTCPConnection -State Listen -LocalPort $State.mysqlPort)
if ($Listeners.Count -ne 1 -or $Listeners[0].LocalAddress -ne '127.0.0.1') { throw 'Loopback database required' }
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
    if (-not $Child.WaitForExit(30000)) { $Child.Kill(); throw 'Owned SQL timed out' }
    if ($Child.ExitCode -ne 0) { throw 'Owned menu SQL rejected; diagnostics withheld' }
    return $Output.GetAwaiter().GetResult().Trim()
}
function Confirm-OwnedData {
    if ([IO.Path]::GetFullPath((Invoke-OwnedSql 'SELECT @@datadir;')).TrimEnd('\','/') -ne $Data.TrimEnd('\','/')) { throw 'Data directory mismatch' }
}
Confirm-OwnedData
$TableCount = Invoke-OwnedSql "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='cloud_flow_db' AND table_type='BASE TABLE';"
if ($TableCount -ne '374') { throw 'Installed approved settlement schema required' }
if ((Invoke-OwnedSql "SELECT COUNT(*) FROM sys_menu WHERE menu_id=$MenuId OR perms='$Permission' OR path='$MenuPath';") -ne '0' -or
    (Invoke-OwnedSql "SELECT COUNT(*) FROM sys_role_menu WHERE menu_id=$MenuId;") -ne '0') { throw 'Reserved settlement source menu or grants already occupied' }
$SeedFile = Join-Path $Root 'cloudflow-backend/DB/06.cloudflow-business-seed.sql'
$SeedHash = (Get-FileHash -LiteralPath $SeedFile).Hash
$Block = [regex]::Match([IO.File]::ReadAllText($SeedFile), "(?s)-- batch-h2-${BlockName}:start.*?-- batch-h2-${BlockName}:end").Value
if (-not $Block -or -not $Block.Contains("'$Component'") -or -not $Block.Contains('role_id IN (1,4)')) { throw 'Approved settlement source block missing' }
$BeforeMenus = Invoke-OwnedSql 'SELECT menu_id FROM sys_menu ORDER BY menu_id;'
$BeforeGrants = Invoke-OwnedSql "SELECT CONCAT(tenant_id,':',role_id,':',menu_id) FROM sys_role_menu ORDER BY tenant_id,role_id,menu_id;"
Write-Output "H2_${EvidenceName}_MENU_PREFLIGHT: conflicts=0; tables=374; menu=$MenuId; grants=ADMIN,HR; employee_grants_added=0"
if (-not $Apply) { exit 0 }
Confirm-OwnedData
if ((Get-FileHash -LiteralPath $SeedFile).Hash -ne $SeedHash) { throw 'Seed changed during preparation' }
Invoke-OwnedSql ("START TRANSACTION;" + [Environment]::NewLine + $Block + [Environment]::NewLine + 'COMMIT;') | Out-Null
if ((Invoke-OwnedSql "SELECT menu_id FROM sys_menu WHERE menu_id<>$MenuId ORDER BY menu_id;") -ne $BeforeMenus -or
    (Invoke-OwnedSql "SELECT CONCAT(tenant_id,':',role_id,':',menu_id) FROM sys_role_menu WHERE menu_id<>$MenuId ORDER BY tenant_id,role_id,menu_id;") -ne $BeforeGrants) { throw 'Existing menu identifiers or grants changed' }
if ((Invoke-OwnedSql "SELECT COUNT(*) FROM sys_menu WHERE menu_id=$MenuId AND parent_id=7 AND path='$MenuPath' AND component='$Component' AND perms='$Permission' AND status='0' AND visible='0';") -ne '1' -or
    (Invoke-OwnedSql "SELECT GROUP_CONCAT(CONCAT(role_id,':',tenant_id) ORDER BY role_id) FROM sys_role_menu WHERE menu_id=$MenuId;") -ne '1:100000,4:100000') { throw 'Settlement source menu verification failed' }
Write-Output "H2_${EvidenceName}_MENU_APPLIED: new_menus=1; new_grants=2; other_menu_ids_unchanged=true; other_grants_unchanged=true; production_modified=false"
& node (Join-Path $Root 'scripts/refresh-isolated-referral-menu-cache.mjs') $StateFile "--$BlockName"
if ($LASTEXITCODE -ne 0) { throw 'Menu installed; exact cache refresh failed' }
