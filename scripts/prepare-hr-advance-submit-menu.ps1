param([Parameter(Mandatory = $true)][string]$StatePath, [Parameter(Mandatory = $true)][string]$EvidencePath, [switch]$Apply)
$ErrorActionPreference = 'Stop'
$Root = [IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
. (Join-Path $Root '.cloudflow-runtime/use-data-drive.ps1')
$StateFile = (Resolve-Path -LiteralPath $StatePath).Path
$Run = Split-Path -Parent $StateFile
$Runtime = Join-Path $Root '.cloudflow-runtime/batch-g-integration'
if ((Split-Path -Parent $Run) -ne $Runtime -or (Split-Path -Leaf $Run) -notmatch '^[a-f0-9]{32}$' -or (Split-Path -Leaf $StateFile) -ne 'state.json') { throw 'Owned integration state required' }
$Data = Join-Path $Run 'mysql-data'
$EvidenceFile = (Resolve-Path -LiteralPath $EvidencePath).Path
if ((Split-Path -Parent $EvidenceFile) -ne $Run -or (Split-Path -Leaf $EvidenceFile) -notmatch '^h2-advance-approval-results-[a-f0-9]{12}\.json$') { throw 'Owned advance approval evidence required' }
foreach ($Candidate in @($Root, $Runtime, $Run, $StateFile, $Data, $EvidenceFile)) {
    if ((Get-Item -LiteralPath $Candidate).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Redirected preparation path rejected' }
}
$Proof = Get-Content -LiteralPath $EvidenceFile -Raw | ConvertFrom-Json
if ($Proof.passed -ne $true -or $null -ne $Proof.failure) { throw 'Successful complete advance verification required' }
foreach ($Required in @('rules','approval','funding','rejections','delayedCallback','settlementGuard','paymentRollback','paymentReplay','concurrency','permissions','tenants','http','desktop','mobile','cleanup')) {
    if ($Proof.evidence.$Required -ne $true) { throw "Missing advance evidence: $Required" }
}
$State = Get-Content -LiteralPath $StateFile -Raw | ConvertFrom-Json
if ($State.status -ne 'RUNNING' -or [IO.Path]::GetFullPath($State.run) -ne $Run -or $State.mysqlPort -lt 1024 -or $State.mysqlPort -gt 65535) { throw 'Running owned environment required' }
$Owned = @($State.processes | Where-Object name -EQ 'mysql')
if ($Owned.Count -ne 1 -or $Owned[0].marker -ne $Data) { throw 'Unique database marker required' }
$Process = Get-CimInstance Win32_Process -Filter "ProcessId = $($Owned[0].id)"
if (-not $Process -or $Process.Name -ne 'mysqld.exe' -or -not $Process.CommandLine.Contains($Data)) { throw 'Owned MySQL process required' }
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
    if ($Child.ExitCode -ne 0) { throw 'Owned submit menu SQL rejected; diagnostics withheld' }
    return $Output.GetAwaiter().GetResult().Trim()
}
if ([IO.Path]::GetFullPath((Invoke-OwnedSql 'SELECT @@datadir;')).TrimEnd('\','/') -ne $Data.TrimEnd('\','/')) { throw 'Database directory mismatch' }
if ((Invoke-OwnedSql "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='cloud_flow_db' AND table_type='BASE TABLE';") -ne '374') { throw 'Approved 374-table schema required' }
if ((Invoke-OwnedSql "SELECT COUNT(*) FROM sys_menu WHERE menu_id=1873 OR perms='hr:advance:submit';") -ne '0' -or (Invoke-OwnedSql 'SELECT COUNT(*) FROM sys_role_menu WHERE menu_id=1873;') -ne '0') { throw 'Submit menu or grants already occupied' }
if ((Invoke-OwnedSql "SELECT COUNT(*) FROM sys_menu WHERE menu_id=1876 AND perms='hr:advance:own';") -ne '1') { throw 'Own advance parent required' }
$SeedFile = Join-Path $Root 'cloudflow-backend/DB/06.cloudflow-business-seed.sql'
$SeedHash = (Get-FileHash -LiteralPath $SeedFile).Hash
$Block = [regex]::Match([IO.File]::ReadAllText($SeedFile), '(?s)-- batch-h2-advance-submit:start.*?-- batch-h2-advance-submit:end').Value
if (-not $Block -or -not $Block.Contains("'hr:advance:submit'") -or -not $Block.Contains('role_id BETWEEN 1 AND 11')) { throw 'Approved submit seed block required' }
$BeforeMenus = Invoke-OwnedSql 'SELECT menu_id FROM sys_menu ORDER BY menu_id;'
$BeforeGrants = Invoke-OwnedSql "SELECT CONCAT(tenant_id,':',role_id,':',menu_id) FROM sys_role_menu ORDER BY tenant_id,role_id,menu_id;"
Write-Output 'H2_ADVANCE_SUBMIT_PREFLIGHT: conflicts=0; tables=374; menu=1873; roles=1-11; scope=OWN_UNPAID_ADVANCE'
if (-not $Apply) { exit 0 }
if ((Get-FileHash -LiteralPath $SeedFile).Hash -ne $SeedHash) { throw 'Seed changed during preparation' }
Invoke-OwnedSql ("START TRANSACTION;" + [Environment]::NewLine + $Block + [Environment]::NewLine + 'COMMIT;') | Out-Null
if ((Invoke-OwnedSql 'SELECT menu_id FROM sys_menu WHERE menu_id<>1873 ORDER BY menu_id;') -ne $BeforeMenus -or
    (Invoke-OwnedSql "SELECT CONCAT(tenant_id,':',role_id,':',menu_id) FROM sys_role_menu WHERE menu_id<>1873 ORDER BY tenant_id,role_id,menu_id;") -ne $BeforeGrants) { throw 'Unrelated menus or grants changed' }
if ((Invoke-OwnedSql "SELECT COUNT(*) FROM sys_menu WHERE menu_id=1873 AND parent_id=1876 AND menu_type='F' AND visible='1' AND status='0' AND perms='hr:advance:submit' AND path='';") -ne '1' -or
    (Invoke-OwnedSql "SELECT GROUP_CONCAT(CONCAT(role_id,':',tenant_id) ORDER BY role_id) FROM sys_role_menu WHERE menu_id=1873;") -ne ((1..11 | ForEach-Object { "${_}:100000" }) -join ',')) { throw 'Submit menu differs from approved own-user grants' }
Write-Output 'H2_ADVANCE_SUBMIT_APPLIED: new_menus=1; new_grants=11; unrelated_menus_and_grants_unchanged=true; production_modified=false'
& node (Join-Path $Root 'scripts/refresh-isolated-referral-menu-cache.mjs') $StateFile '--advance-submit'
if ($LASTEXITCODE -ne 0) { throw 'Submit menu installed; exact cache refresh failed' }
