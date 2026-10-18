[CmdletBinding()]
param([string]$MySqlBin = '', [switch]$SkipDemo, [switch]$SkipBehavior)

$ErrorActionPreference = 'Stop'
$OutputEncoding = [Text.UTF8Encoding]::new($false)
if (-not $MySqlBin) { $MySqlBin = Split-Path -Parent (Get-Command mysqld.exe -ErrorAction Stop).Source }
$MySqlBin = (Resolve-Path -LiteralPath $MySqlBin).ProviderPath
$Server = Join-Path $MySqlBin 'mysqld.exe'
$Client = Join-Path $MySqlBin 'mysql.exe'
$Admin = Join-Path $MySqlBin 'mysqladmin.exe'
foreach ($Executable in @($Server, $Client, $Admin)) {
    if (-not (Test-Path -LiteralPath $Executable -PathType Leaf)) { throw "Missing MySQL executable: $Executable" }
}
$Root = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).ProviderPath
$Target = [IO.Path]::GetFullPath((Join-Path $Root 'cloudflow-backend/target'))
$RunDirectory = [IO.Path]::GetFullPath((Join-Path $Target ('batch-d-mysql-' + [guid]::NewGuid().ToString('N'))))
if (-not $RunDirectory.StartsWith($Target + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
    throw 'Isolated MySQL directory must be inside backend target'
}
if (Test-Path -LiteralPath $RunDirectory) { throw 'Isolated MySQL directory must be new' }
[IO.Directory]::CreateDirectory($RunDirectory) | Out-Null
$DataDirectory = Join-Path $RunDirectory 'data'
$ErrorLog = Join-Path $RunDirectory 'mysql-error.log'
$BaseDirectory = Split-Path -Parent $MySqlBin
$Initialize = Start-Process -FilePath $Server -WindowStyle Hidden -PassThru -Wait -ArgumentList @(
    '--no-defaults', '--initialize-insecure', "--basedir=`"$BaseDirectory`"", "--datadir=`"$DataDirectory`"",
    "--log-error=`"$ErrorLog`"", '--innodb-buffer-pool-size=64M'
)
if ($Initialize.ExitCode -ne 0) { throw "Isolated MySQL initialization failed; see $ErrorLog" }

$Reservation = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, 0)
$Reservation.Start()
$Port = ([Net.IPEndPoint]$Reservation.LocalEndpoint).Port
$Reservation.Stop()
$ClientArguments = @('--no-defaults', '--protocol=TCP', '--host=127.0.0.1', "--port=$Port", '--user=root', '--skip-password',
    '--default-character-set=utf8mb4', '--connect-timeout=2', '--batch', '--skip-column-names')
$DatabaseProcess = $null
try {
    $DatabaseProcess = Start-Process -FilePath $Server -WindowStyle Hidden -PassThru -ArgumentList @(
        '--no-defaults', "--basedir=`"$BaseDirectory`"", "--datadir=`"$DataDirectory`"", "--port=$Port",
        '--bind-address=127.0.0.1', '--mysqlx=OFF', '--skip-log-bin',
        '--innodb-buffer-pool-size=64M', '--max-connections=10', "--log-error=`"$ErrorLog`"",
        "--pid-file=`"$(Join-Path $RunDirectory 'mysql.pid')`""
    )
    $Ready = $false
    for ($Attempt = 0; $Attempt -lt 60; $Attempt++) {
        $DatabaseProcess.Refresh()
        if ($DatabaseProcess.HasExited) { throw "Isolated MySQL exited; see $ErrorLog" }
        $LastProbe = & $Client @ClientArguments '--execute=SELECT 1' 2>&1
        if ($LASTEXITCODE -eq 0) { $Ready = $true; break }
        Start-Sleep -Milliseconds 500
    }
    if (-not $Ready) { throw "Isolated MySQL did not become ready: $($LastProbe -join ' '); see $ErrorLog" }
    Write-Output "Isolated MySQL: 127.0.0.1:$Port; artifacts: $RunDirectory"
    Push-Location (Join-Path $Root 'cloudflow-backend/DB')
    try {
        $Scripts = @('01.cloudflow-common.sql', '02.cloudflow-workflow.sql', '03.cloudflow-hr.sql',
            '04.cloudflow-oa.sql', '05.cloudflow-crm.sql', '06.cloudflow-business-seed.sql')
        foreach ($SqlFile in $Scripts) {
            $ScriptClientArguments = @($ClientArguments)
            if ($SqlFile -ne '01.cloudflow-common.sql') { $ScriptClientArguments += '--database=cloud_flow_db' }
            if ($SqlFile -eq '06.cloudflow-business-seed.sql') {
                $Seed = (Get-Content -LiteralPath $SqlFile -Raw -Encoding UTF8).Replace("`r`n","`n")
                $MenuOffset = $Seed.IndexOf("(1450,'假期规则'")
                if ($MenuOffset -lt 0) { throw 'Batch D seed marker missing' }
                $SeedOffset = $Seed.LastIndexOf('INSERT IGNORE INTO cloud_flow_db.sys_menu', $MenuOffset)
                $BatchEOffset = $Seed.IndexOf('-- BATCH_E_CUSTOMER_OPERATIONS', $SeedOffset)
                if ($BatchEOffset -le $SeedOffset) { throw 'Batch E seed boundary missing after Batch D' }
                $Seed.Substring(0,$SeedOffset) | & $Client @ScriptClientArguments
                if ($LASTEXITCODE -ne 0) { throw 'Existing business seed failed' }
                $Existing = & $Client @ClientArguments '--execute=SELECT COUNT(*) FROM cloud_flow_db.sys_menu WHERE menu_id BETWEEN 1450 AND 1549'
                if ($LASTEXITCODE -ne 0 -or [int]$Existing -ne 0) { throw 'Batch D menu range conflicts with existing menus' }
                Write-Output 'PASS: menu_id 1450-1549 has no existing conflicts'
                $BatchDSeed = $Seed.Substring($SeedOffset, $BatchEOffset - $SeedOffset)
                $BatchDSeed | & $Client @ScriptClientArguments
            } else {
                Get-Content -LiteralPath $SqlFile -Raw -Encoding UTF8 | & $Client @ScriptClientArguments
            }
            if ($LASTEXITCODE -ne 0) { throw "Isolated database script failed: $SqlFile" }
            Write-Output "PASS: $SqlFile"
        }
    } finally { Pop-Location }
    $TableCount = & $Client @ClientArguments "--execute=SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='cloud_flow_db' AND table_type='BASE TABLE'"
    if ($LASTEXITCODE -ne 0 -or [int]$TableCount -ne 374) { throw "Expected 374 physical tables, found $TableCount" }
    Write-Output 'PASS: isolated database has 374 physical tables'
    function Assert-Scalar([string]$Sql, [int]$Expected, [string]$Label) {
        $Actual = & $Client @ClientArguments "--execute=$Sql"
        if ($LASTEXITCODE -ne 0 -or [int]$Actual -ne $Expected) { throw "$Label expected $Expected, found $Actual" }
        Write-Output "PASS: $Label"
    }
    Assert-Scalar "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='cloud_flow_db' AND table_name LIKE 'hr\_%'" 119 'HR has 119 tables'
    Assert-Scalar 'SELECT COUNT(*) FROM cloud_flow_db.sys_menu WHERE menu_id BETWEEN 1450 AND 1549' 25 'D menus and permissions'
    Assert-Scalar "SELECT COUNT(*) FROM cloud_flow_db.sys_job WHERE job_id BETWEEN 1450 AND 1457 AND service_name='hr'" 8 'Eight HR jobs registered'
    Assert-Scalar "SELECT COUNT(*) FROM cloud_flow_db.sys_job WHERE job_id IN (1455,1456) AND status='PAUSED' AND retry_count=0" 2 'Business-only tasks have no automatic schedule or retry'
    Assert-Scalar "SELECT COUNT(*) FROM cloud_flow_db.wf_process_definition WHERE process_key IN ('wf_hr_leave','wf_hr_payroll_correction') AND status='PUBLISHED' AND JSON_VALID(model_json)" 2 'Default approval models published'
    Assert-Scalar "SELECT COUNT(*) FROM cloud_flow_db.hr_tax_slab WHERE status='ACTIVE'" 0 'No fabricated production tax table'
    Assert-Scalar "SELECT COUNT(*) FROM cloud_flow_db.sys_role_menu permissions JOIN cloud_flow_db.sys_menu menu ON menu.menu_id=permissions.menu_id WHERE permissions.role_id=5 AND menu.perms IN ('hr:payroll:pay','hr:payroll:configure','hr:leave:adjust','hr:attendance:confirm')" 0 'Employees lack payroll and quota administration'
    $BatchDSeed | & $Client @ClientArguments '--database=cloud_flow_db'
    if ($LASTEXITCODE -ne 0) { throw 'Batch D seed replay failed' }
    Assert-Scalar 'SELECT COUNT(*) FROM cloud_flow_db.sys_menu WHERE menu_id BETWEEN 1450 AND 1549' 25 'Batch D seed replay is idempotent'
    Assert-Scalar "SELECT COUNT(*) FROM cloud_flow_db.sys_dict_data WHERE tenant_id=100000 AND dict_type='hr_grievance_type' AND status='0'" 6 'Grievance types use six shared dictionary options without replay duplicates'
    if (-not $SkipBehavior) {
        & (Join-Path $PSScriptRoot 'verify-batch-d.ps1') -SkipBuild -JdbcUrl "jdbc:mysql://127.0.0.1:$Port/cloud_flow_db?useSSL=false&allowPublicKeyRetrieval=true&serverTimezone=Asia/Shanghai"
        if ($LASTEXITCODE -ne 0) { throw 'Isolated HR business checks failed' }
    }
    if (-not $SkipDemo) {
        Get-Content -LiteralPath (Join-Path $Root 'cloudflow-backend/DB/07.cloudflow-demo-seed.sql') -Raw -Encoding UTF8 | & $Client @ClientArguments '--database=cloud_flow_db'
        if ($LASTEXITCODE -ne 0) { throw 'Demo seed import failed' }
        $DemoTables = @('hr_leave_ledger','hr_leave_period','hr_leave_policy','hr_leave_policy_detail','hr_leave_policy_assignment',
            'hr_earned_leave_schedule','hr_attendance_checkin','hr_payroll_period','hr_payroll_batch','hr_payroll_batch_employee',
            'hr_payroll_correction','hr_tax_slab','hr_tax_slab_detail','hr_grievance','hr_grievance_record')
        foreach ($Table in $DemoTables) {
            $IdColumn = & $Client @ClientArguments "--execute=SELECT column_name FROM information_schema.key_column_usage WHERE table_schema='cloud_flow_db' AND table_name='$Table' AND constraint_name='PRIMARY'"
            Assert-Scalar "SELECT COUNT(*) FROM cloud_flow_db.$Table WHERE $IdColumn>=1000000 AND tenant_id BETWEEN 100000 AND 100049" 2500 "$Table demo rows across 50 tenants"
        }
        Assert-Scalar "SELECT COUNT(*) FROM cloud_flow_db.hr_tax_slab WHERE slab_id>=1000000 AND status<>'DRAFT'" 0 'Demo tax placeholders stay unpublished'
        Assert-Scalar "SELECT COUNT(*) FROM cloud_flow_db.hr_payroll_batch WHERE batch_id>=1000000 AND (status<>'DRAFT' OR total_gross<>0 OR total_net<>0)" 0 'Demo payroll batches have no fictitious calculation results'
        Assert-Scalar "SELECT COUNT(*) FROM cloud_flow_db.hr_payroll_correction correction LEFT JOIN cloud_flow_db.hr_salary_slip original ON original.id=correction.original_slip_id AND original.tenant_id=correction.tenant_id WHERE correction.correction_id>=1000000 AND (original.id IS NULL OR original.status<>'DRAFT' OR correction.status<>'DRAFT' OR correction.correction_slip_id IS NOT NULL OR correction.diff_amount<>0)" 0 'Demo correction drafts cannot reference unrelated employee correction slips'
        Assert-Scalar "SELECT COUNT(*) FROM cloud_flow_db.hr_leave_quota quota LEFT JOIN cloud_flow_db.hr_leave_period period ON period.period_id=quota.period_id AND period.tenant_id=quota.tenant_id WHERE quota.id>=1000000 AND (period.period_id IS NULL OR quota.available_quota<>quota.total_quota-quota.used_quota-quota.frozen_quota)" 0 'Demo leave quota periods and balances agree'
        Assert-Scalar "SELECT COUNT(*) FROM cloud_flow_db.hr_shift WHERE id>=1000000 AND (work_minutes<>480 OR break_minutes<>60 OR auto_attendance_flag<>0)" 0 'Demo shifts have valid hours and no auto-calculation'
        Assert-Scalar "SELECT COUNT(*) FROM cloud_flow_db.hr_grievance_record record LEFT JOIN cloud_flow_db.hr_grievance grievance ON grievance.grievance_id=record.grievance_id AND grievance.tenant_id=record.tenant_id WHERE record.record_id>=1000000 AND grievance.grievance_id IS NULL" 0 'Demo grievance records stay in their tenant'
        Write-Output 'PASS: isolated 01-07 database acceptance'
    }
} finally {
    if ($DatabaseProcess) {
        $DatabaseProcess.Refresh()
        if (-not $DatabaseProcess.HasExited) {
            & $Admin '--no-defaults' '--protocol=TCP' '--host=127.0.0.1' "--port=$Port" '--user=root' '--skip-password' 'shutdown' *> $null
            if (-not $DatabaseProcess.WaitForExit(10000)) { $DatabaseProcess.Kill(); $DatabaseProcess.WaitForExit() }
        }
        $LiveHelpers = @(Get-CimInstance Win32_Process -Filter "name='mysqld.exe'" | Where-Object { $_.CommandLine -and $_.CommandLine.Contains($RunDirectory) })
        foreach ($LiveHelper in $LiveHelpers) {
            Stop-Process -Id $LiveHelper.ProcessId -Force -ErrorAction SilentlyContinue
            Wait-Process -Id $LiveHelper.ProcessId -Timeout 15 -ErrorAction SilentlyContinue
        }
        Write-Output 'Isolated MySQL stopped; existing database services were not used'
    }
    if (Test-Path -LiteralPath $DataDirectory -PathType Container) {
        $ResolvedDataDirectory = (Resolve-Path -LiteralPath $DataDirectory).ProviderPath
        if (-not $ResolvedDataDirectory.StartsWith($RunDirectory + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
            throw 'Temporary data cleanup path is outside the verified run directory'
        }
        $RemainingServers = @(Get-CimInstance Win32_Process -Filter "name='mysqld.exe'" | Where-Object { $_.CommandLine -and $_.CommandLine.Contains($RunDirectory) })
        if ($RemainingServers.Count -ne 0) { throw 'Temporary database is still running; data files retained' }
        Remove-Item -LiteralPath $ResolvedDataDirectory -Recurse
        Write-Output 'Isolated data files removed; validation logs retained'
    }
}
