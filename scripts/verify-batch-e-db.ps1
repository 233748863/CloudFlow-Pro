[CmdletBinding()]
param([string]$MySqlBin = '', [switch]$SkipDemo, [switch]$SkipBehavior, [switch]$SkipBuild, [switch]$HrSkillCheck, [switch]$HrOvertimeCheck, [string]$ArtifactRoot = '')

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
$Target = if ($ArtifactRoot) { [IO.Path]::GetFullPath($ArtifactRoot) } else { [IO.Path]::GetFullPath((Join-Path $Root 'cloudflow-backend/target')) }
$RunDirectory = [IO.Path]::GetFullPath((Join-Path $Target ('batch-e-mysql-' + [guid]::NewGuid().ToString('N'))))
if (-not $RunDirectory.StartsWith($Target + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw 'Unsafe isolated MySQL directory' }
if (Test-Path -LiteralPath $RunDirectory) { throw 'Isolated MySQL directory must be new' }
[IO.Directory]::CreateDirectory($RunDirectory) | Out-Null
$DataDirectory = Join-Path $RunDirectory 'data'
$ErrorLog = Join-Path $RunDirectory 'mysql-error.log'
$BaseDirectory = Split-Path -Parent $MySqlBin
$Initialize = Start-Process -FilePath $Server -WindowStyle Hidden -PassThru -Wait -ArgumentList @(
    '--no-defaults', '--initialize-insecure', "--basedir=`"$BaseDirectory`"", "--datadir=`"$DataDirectory`"",
    "--log-error=`"$ErrorLog`"", '--innodb-buffer-pool-size=64M'
)
if ($Initialize.ExitCode -ne 0) { throw "Isolated MySQL initialization failed: $ErrorLog" }
$Reservation = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, 0)
$Reservation.Start()
$Port = ([Net.IPEndPoint]$Reservation.LocalEndpoint).Port
$Reservation.Stop()
$ClientArguments = @('--no-defaults', '--protocol=TCP', '--host=127.0.0.1', "--port=$Port", '--user=root', '--skip-password',
    '--default-character-set=utf8mb4', '--connect-timeout=2', '--batch', '--skip-column-names')
$DatabaseProcess = $null
try {
    $DatabaseProcess = Start-Process -FilePath $Server -WindowStyle Hidden -PassThru -ArgumentList @(
        '--no-defaults', "--basedir=`"$BaseDirectory`"", "--datadir=`"$DataDirectory`"", "--port=$Port", '--bind-address=127.0.0.1',
        '--mysqlx=OFF', '--skip-log-bin', '--innodb-buffer-pool-size=64M', '--max-connections=20', "--log-error=`"$ErrorLog`"",
        "--pid-file=`"$(Join-Path $RunDirectory 'mysql.pid')`""
    )
    $Ready = $false
    for ($Attempt = 0; $Attempt -lt 60; $Attempt++) {
        $DatabaseProcess.Refresh()
        if ($DatabaseProcess.HasExited) { throw "Isolated MySQL exited: $ErrorLog" }
        & $Client @ClientArguments '--execute=SELECT 1' 2>&1 | Out-Null
        if ($LASTEXITCODE -eq 0) { $Ready = $true; break }
        Start-Sleep -Milliseconds 500
    }
    if (-not $Ready) { throw "Isolated MySQL did not start: $ErrorLog" }
    Write-Output "Isolated MySQL: 127.0.0.1:$Port; artifacts: $RunDirectory"
    function Assert-Scalar([string]$Sql, [int]$Expected, [string]$Label) {
        $Actual = & $Client @ClientArguments "--execute=$Sql"
        if ($LASTEXITCODE -ne 0 -or [int]$Actual -ne $Expected) { throw "$Label expected $Expected, found $Actual" }
        Write-Output "PASS: $Label; expected=$Expected; actual=$Actual"
    }
    Push-Location (Join-Path $Root 'cloudflow-backend/DB')
    try {
        foreach ($SqlFile in @('01.cloudflow-common.sql','02.cloudflow-workflow.sql','03.cloudflow-hr.sql','04.cloudflow-oa.sql','05.cloudflow-crm.sql','06.cloudflow-business-seed.sql')) {
            $ScriptClientArguments = @($ClientArguments)
            if ($SqlFile -ne '01.cloudflow-common.sql') { $ScriptClientArguments += '--database=cloud_flow_db' }
            if ($SqlFile -eq '06.cloudflow-business-seed.sql') {
                $Seed = Get-Content -LiteralPath $SqlFile -Raw -Encoding UTF8
                $Offset = $Seed.IndexOf('-- BATCH_E_CUSTOMER_OPERATIONS')
                if ($Offset -lt 0) { throw 'Batch E seed marker missing' }
                $Seed.Substring(0, $Offset) | & $Client @ScriptClientArguments
                if ($LASTEXITCODE -ne 0) { throw 'Existing business seed failed' }
                Assert-Scalar 'SELECT COUNT(*) FROM cloud_flow_db.sys_menu WHERE menu_id BETWEEN 1550 AND 1649' 0 'E menu range is conflict-free before insertion'
                $BatchSeed = $Seed.Substring($Offset)
                $OpportunityOffset = $BatchSeed.IndexOf('-- batch-h3-opportunity-menus:start')
                if ($OpportunityOffset -lt 0) { throw 'H3 opportunity seed marker missing' }
                $BatchSeed.Substring(0, $OpportunityOffset) | & $Client @ScriptClientArguments
                if ($LASTEXITCODE -ne 0) { throw 'Business seed before H3 failed' }
                Assert-Scalar 'SELECT COUNT(*) FROM cloud_flow_db.sys_menu WHERE menu_id BETWEEN 1900 AND 1949' 0 'H3 menu range is conflict-free before insertion'
                $SkillOffset = $BatchSeed.IndexOf('-- batch-h2-skills:start')
                if ($SkillOffset -le $OpportunityOffset) { throw 'H2 skill seed marker missing' }
                $BatchSeed.Substring($OpportunityOffset, $SkillOffset - $OpportunityOffset) | & $Client @ScriptClientArguments
                if ($LASTEXITCODE -ne 0) { throw 'Business seed before H2 skills failed' }
                Assert-Scalar 'SELECT COUNT(*) FROM cloud_flow_db.sys_menu WHERE menu_id IN (1877,1878,1879,1880,1881,1893)' 0 'H2 skill menu IDs are conflict-free before insertion'
                $AppraisalOffset = $BatchSeed.IndexOf('-- batch-h2-appraisals:start')
                if ($AppraisalOffset -le $SkillOffset) { throw 'H2 appraisal seed marker missing' }
                $BatchSeed.Substring($SkillOffset, $AppraisalOffset - $SkillOffset) | & $Client @ScriptClientArguments
                if ($LASTEXITCODE -ne 0) { throw 'Business seed before H2 appraisals failed' }
                Assert-Scalar "SELECT COUNT(*) FROM cloud_flow_db.sys_menu WHERE menu_id IN (1882,1883,1884,1885,1886,1894,1895) OR perms LIKE 'hr:appraisal:%'" 0 'H2 appraisal menu IDs are conflict-free before insertion'
                $AdvanceOffset = $BatchSeed.IndexOf('-- batch-h2-advance-entry:start')
                if ($AdvanceOffset -le $AppraisalOffset) { throw 'H2 advance entry seed marker missing' }
                $BatchSeed.Substring($AppraisalOffset, $AdvanceOffset - $AppraisalOffset) | & $Client @ScriptClientArguments
                if ($LASTEXITCODE -ne 0) { throw 'Business seed before H2 advance entries failed' }
                Assert-Scalar "SELECT COUNT(*) FROM cloud_flow_db.sys_menu WHERE menu_id BETWEEN 1871 AND 1876 OR perms LIKE 'hr:advance:%'" 0 'H2 advance menu IDs are conflict-free before insertion'
                $PreviewOffset = $BatchSeed.IndexOf('CREATE TEMPORARY TABLE h5_file_preview_guard ')
                if ($PreviewOffset -le $AdvanceOffset) { throw 'H5 preview seed marker missing' }
                $BatchSeed.Substring($AdvanceOffset, $PreviewOffset - $AdvanceOffset) | & $Client @ScriptClientArguments
                if ($LASTEXITCODE -ne 0) { throw 'Business seed before H5 preview failed' }
                Assert-Scalar "SELECT COUNT(*) FROM cloud_flow_db.sys_menu WHERE menu_id=1985 OR perms='system:file:preview'" 0 'H5 preview menu ID and permission are conflict-free before insertion'
                $DataSourceOffset = $BatchSeed.IndexOf('CREATE TEMPORARY TABLE h5_data_source_guard ')
                if ($DataSourceOffset -le $PreviewOffset) { throw 'H5 data source seed marker missing' }
                $BatchSeed.Substring($PreviewOffset, $DataSourceOffset - $PreviewOffset) | & $Client @ScriptClientArguments
                if ($LASTEXITCODE -ne 0) { throw 'Business seed before H5 data sources failed' }
                Assert-Scalar "SELECT COUNT(*) FROM cloud_flow_db.sys_menu WHERE menu_id BETWEEN 1973 AND 1976 OR perms LIKE 'system:data-source:%'" 0 'H5 data source IDs and permissions are conflict-free before insertion'
                Assert-Scalar "SELECT COUNT(*) FROM cloud_flow_db.sys_job WHERE job_id=1973 OR handler_name='dataSourceReconcile'" 0 'H5 data source job is conflict-free before insertion'
                Assert-Scalar "SELECT COUNT(*) FROM cloud_flow_db.sys_job_handler WHERE handler_id=1973 OR handler_name='dataSourceReconcile'" 0 'H5 data source handler is conflict-free before insertion'
                $OauthOffset = $BatchSeed.IndexOf('CREATE TEMPORARY TABLE h5_oauth2_guard ')
                if ($OauthOffset -le $DataSourceOffset) { throw 'H5 OAuth seed marker missing' }
                $BatchSeed.Substring($DataSourceOffset, $OauthOffset - $DataSourceOffset) | & $Client @ScriptClientArguments
                if ($LASTEXITCODE -ne 0) { throw 'Business seed before H5 OAuth failed' }
                Assert-Scalar "SELECT COUNT(*) FROM cloud_flow_db.sys_menu WHERE menu_id BETWEEN 1987 AND 1991 OR perms LIKE 'system:oauth2:%'" 0 'H5 OAuth IDs and permissions are conflict-free before insertion'
                $ReportOffset = $BatchSeed.IndexOf('CREATE TEMPORARY TABLE h5_report_guard ')
                if ($ReportOffset -le $OauthOffset) { throw 'H5 report seed marker missing' }
                $BatchSeed.Substring($OauthOffset, $ReportOffset - $OauthOffset) | & $Client @ScriptClientArguments
                if ($LASTEXITCODE -ne 0) { throw 'Business seed before H5 reports failed' }
                Assert-Scalar "SELECT COUNT(*) FROM cloud_flow_db.sys_menu WHERE menu_id BETWEEN 1977 AND 1984 OR menu_id BETWEEN 1992 AND 2000 OR perms LIKE 'system:report:%'" 0 'H5 report IDs and permissions are conflict-free before insertion'
                $PackageOffset = $BatchSeed.IndexOf('CREATE TEMPORARY TABLE h5_tenant_package_guard ')
                if ($PackageOffset -le $ReportOffset) { throw 'H5 tenant package seed marker missing' }
                $BatchSeed.Substring($ReportOffset, $PackageOffset - $ReportOffset) | & $Client @ScriptClientArguments
                if ($LASTEXITCODE -ne 0) { throw 'Business seed before H5 tenant packages failed' }
                Assert-Scalar "SELECT COUNT(*) FROM cloud_flow_db.sys_menu WHERE menu_id BETWEEN 1970 AND 1972 OR perms LIKE 'system:tenant-package:%'" 0 'H5 tenant package IDs and permissions are conflict-free before insertion'
                $BatchSeed.Substring($PackageOffset) | & $Client @ScriptClientArguments
            } else { Get-Content -LiteralPath $SqlFile -Raw -Encoding UTF8 | & $Client @ScriptClientArguments }
            if ($LASTEXITCODE -ne 0) { throw "Database script failed: $SqlFile" }
            Write-Output "PASS: $SqlFile"
        }
    } finally { Pop-Location }
    $ApprovedTables=0
    foreach($Formal in Get-ChildItem -LiteralPath (Join-Path $Root 'cloudflow-backend/DB') -File|Where-Object Name -Match '^0[1-6]\.'){ $ApprovedTables += [regex]::Matches([IO.File]::ReadAllText($Formal.FullName),'(?m)^CREATE TABLE ').Count }
    if($ApprovedTables -le 0){throw 'Nonempty approved schema required'}
    Assert-Scalar "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='cloud_flow_db' AND table_type='BASE TABLE'" $ApprovedTables 'Current approved physical tables'
    Assert-Scalar "SELECT COUNT(*) FROM cloud_flow_db.sys_menu WHERE menu_id=1985 AND perms='system:file:preview' AND parent_id=2 AND menu_type='F' AND visible='1' AND status='0'" 1 'H5 preview menu is read-only approved entry 1985'
    Assert-Scalar 'SELECT COUNT(*) FROM cloud_flow_db.sys_menu WHERE menu_id BETWEEN 1970 AND 2099 AND menu_id NOT IN (1970,1971,1972,1973,1974,1975,1976,1977,1978,1979,1980,1981,1982,1983,1984,1985,1986,1987,1988,1989,1990,1991,1992,1993,1994,1995,1996,1997,1998,1999,2000)' 0 'H5 menu IDs stay within the implemented approval'
    Assert-Scalar "SELECT COUNT(*) FROM cloud_flow_db.sys_menu WHERE (menu_id=1970 AND perms='system:tenant-package:list') OR (menu_id=1971 AND perms='system:tenant-package:manage') OR (menu_id=1972 AND perms='system:tenant-package:sync')" 3 'Three tenant package IDs match approved permissions'
    Assert-Scalar 'SELECT COUNT(*) FROM cloud_flow_db.sys_role_menu WHERE tenant_id=100000 AND role_id=1 AND menu_id BETWEEN 1970 AND 1972' 3 'Tenant package grants only platform ADMIN'
    Assert-Scalar 'SELECT COUNT(*) FROM cloud_flow_db.sys_role_menu WHERE menu_id BETWEEN 1970 AND 1972 AND (tenant_id<>100000 OR role_id<>1)' 0 'Other roles and tenants receive no tenant package management'
    Assert-Scalar "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='cloud_flow_db' AND table_name IN ('sys_report_dataset','sys_report_chart','sys_report_dashboard','sys_report_dashboard_item')" 4 'Four approved report tables'
    Assert-Scalar 'SELECT COUNT(*) FROM cloud_flow_db.sys_role_menu WHERE tenant_id=100000 AND (menu_id BETWEEN 1977 AND 1984 OR menu_id BETWEEN 1992 AND 2000)' 152 'Report role pairs match all approved role sets'
    Assert-Scalar 'SELECT COUNT(*) FROM cloud_flow_db.sys_role_menu WHERE role_id=5 AND tenant_id=100000 AND menu_id IN (1979,1980,1982,1983,1984)' 5 'EMPLOYEE receives five own-definition write permissions'
    $OauthTables = @('sys_oauth2_client','sys_oauth2_code','sys_oauth2_access_token','sys_oauth2_refresh_token','sys_oauth2_approve')
    Assert-Scalar "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='cloud_flow_db' AND table_name IN ('sys_oauth2_client','sys_oauth2_code','sys_oauth2_access_token','sys_oauth2_refresh_token','sys_oauth2_approve')" 5 'Five approved H5 OAuth tables'
    Assert-Scalar 'SELECT COUNT(*) FROM cloud_flow_db.sys_menu WHERE menu_id BETWEEN 1987 AND 1991' 5 'Five OAuth menus within 1970-2099'
    Assert-Scalar 'SELECT COUNT(*) FROM cloud_flow_db.sys_role_menu WHERE tenant_id=100000 AND role_id=1 AND menu_id IN (1987,1988)' 2 'OAuth client management only platform ADMIN'
    Assert-Scalar 'SELECT COUNT(*) FROM cloud_flow_db.sys_role_menu WHERE menu_id IN (1987,1988) AND (tenant_id<>100000 OR role_id<>1)' 0 'No other tenant or role receives OAuth client management'
    Assert-Scalar 'SELECT COUNT(*) FROM cloud_flow_db.sys_role_menu WHERE tenant_id=100000 AND menu_id IN (1989,1990,1991) AND role_id BETWEEN 1 AND 11' 33 'OAuth self-service grants exactly eleven internal roles'
    Assert-Scalar 'SELECT COUNT(*) FROM cloud_flow_db.sys_role_menu WHERE tenant_id=100000 AND role_id=5 AND menu_id IN (1989,1990,1991)' 3 'EMPLOYEE OAuth grants only own authorization, reading and revocation'
    Assert-Scalar 'SELECT COUNT(*) FROM cloud_flow_db.sys_role_menu WHERE role_id=5 AND menu_id IN (1987,1988)' 0 'EMPLOYEE receives no OAuth client management'
    foreach ($Table in $OauthTables) { Assert-Scalar "SELECT COUNT(*) FROM cloud_flow_db.$Table" 0 "$Table business seed contains no synthetic credentials or authorization" }
    Assert-Scalar "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='cloud_flow_db' AND table_name IN ('sys_data_source_config','sys_data_source_registration')" 2 'Two approved H5 data source tables'
    Assert-Scalar "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='cloud_flow_db' AND table_name IN ('sys_tenant_package','sys_tenant_package_sync','sys_tenant_package_sync_item')" 3 'Three approved tenant package tables'
    Assert-Scalar "SELECT COUNT(*) FROM information_schema.columns WHERE table_schema='cloud_flow_db' AND table_name='sys_tenant' AND column_name IN ('package_id','package_version','package_override','effective_menu_ids')" 4 'Four approved tenant package columns'
    Assert-Scalar 'SELECT COUNT(*) FROM cloud_flow_db.sys_menu WHERE menu_id BETWEEN 1973 AND 1976' 4 'Four data source menus within 1970-2099'
    Assert-Scalar 'SELECT COUNT(*) FROM cloud_flow_db.sys_role_menu WHERE tenant_id=100000 AND role_id=1 AND menu_id BETWEEN 1973 AND 1976' 4 'Data source grants only platform ADMIN'
    Assert-Scalar 'SELECT COUNT(*) FROM cloud_flow_db.sys_role_menu WHERE menu_id BETWEEN 1973 AND 1976 AND (tenant_id<>100000 OR role_id<>1)' 0 'No other tenant or role receives data source permissions'
    Assert-Scalar 'SELECT COUNT(*) FROM cloud_flow_db.sys_role_menu WHERE role_id=5 AND menu_id BETWEEN 1973 AND 1976' 0 'EMPLOYEE receives no data source permissions'
    Assert-Scalar 'SELECT COUNT(*) FROM cloud_flow_db.sys_role_menu WHERE tenant_id=100000 AND menu_id=1985 AND role_id BETWEEN 1 AND 11' 11 'Eleven approved read-only preview role grants'
    Assert-Scalar "SELECT COUNT(*) FROM cloud_flow_db.sys_role_menu roles JOIN cloud_flow_db.sys_menu menu ON menu.menu_id=roles.menu_id WHERE roles.role_id=5 AND menu.menu_id=1985 AND menu.perms<>'system:file:preview'" 0 'EMPLOYEE preview grants contain no new write permission'
    Assert-Scalar "SELECT COUNT(*) FROM cloud_flow_db.sys_config WHERE tenant_id=100000 AND config_key IN ('sys.upload.allowedTypes','sys.auth.fileUpload.allowedExtensions') AND FIND_IN_SET('webp',config_value)>0" 2 'Both formal upload defaults include approved WebP images'
    foreach ($ConfigKey in @('sys.upload.allowedTypes','sys.auth.fileUpload.allowedExtensions')) {
        $MigrationPattern = "(?s)UPDATE cloud_flow_db.sys_config\s+SET config_value = '[a-z0-9,]+'\s+WHERE tenant_id = 100000 AND config_key = '" + [regex]::Escape($ConfigKey) + "'\s+AND config_value = '([a-z0-9,]+)';"
        $Migration = [regex]::Match($Seed, $MigrationPattern)
        if (-not $Migration.Success) { throw 'Guarded WebP default migration missing' }
        $OldDefault = $Migration.Groups[1].Value
        Assert-Scalar ("START TRANSACTION; UPDATE cloud_flow_db.sys_config SET config_value='$OldDefault' WHERE tenant_id=100000 AND config_key='$ConfigKey'; " + $Migration.Value + " SELECT COUNT(*) FROM cloud_flow_db.sys_config WHERE tenant_id=100000 AND config_key='$ConfigKey' AND FIND_IN_SET('webp',config_value)>0; ROLLBACK;") 1 "WebP migration upgrades only unchanged default: $ConfigKey"
        Assert-Scalar ("START TRANSACTION; UPDATE cloud_flow_db.sys_config SET config_value='pdf' WHERE tenant_id=100000 AND config_key='$ConfigKey'; " + $Migration.Value + " SELECT COUNT(*) FROM cloud_flow_db.sys_config WHERE tenant_id=100000 AND config_key='$ConfigKey' AND config_value='pdf'; ROLLBACK;") 1 "WebP migration preserves administrator restriction: $ConfigKey"
    }
    Assert-Scalar "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='cloud_flow_db' AND table_name IN ('hr_employee_advance','hr_advance_repayment')" 2 'Two approved advance tables'
    Assert-Scalar 'SELECT COUNT(*) FROM cloud_flow_db.sys_menu WHERE menu_id BETWEEN 1871 AND 1876' 6 'Six approved advance entry menus'
    Assert-Scalar "SELECT COUNT(*) FROM cloud_flow_db.sys_menu WHERE menu_id=1873 AND perms='hr:advance:submit'" 1 'Approved advance submission uses its own permission'
    Assert-Scalar 'SELECT COUNT(*) FROM cloud_flow_db.sys_role_menu WHERE tenant_id=100000 AND menu_id BETWEEN 1871 AND 1876' 40 'Forty approved advance role grants'
    Assert-Scalar 'SELECT COUNT(*) FROM cloud_flow_db.sys_role_menu WHERE role_id=5 AND tenant_id=100000 AND menu_id IN (1872,1873,1876)' 3 'EMPLOYEE advance permissions only own draft, submission and reading'
    Assert-Scalar 'SELECT COUNT(*) FROM cloud_flow_db.sys_role_menu WHERE role_id=5 AND menu_id IN (1871,1874,1875)' 0 'EMPLOYEE has no advance management or finance permission'
    Assert-Scalar 'SELECT COUNT(*) FROM cloud_flow_db.sys_menu WHERE menu_id BETWEEN 1860 AND 1899' 36 'Thirty-six approved H2 menus including settlement and referral'
    Assert-Scalar 'SELECT COUNT(*) FROM cloud_flow_db.sys_menu WHERE menu_id IN (1877,1878,1879,1880,1881,1893)' 6 'Six H2 skill menus within approved range'
    Assert-Scalar 'SELECT COUNT(*) FROM cloud_flow_db.sys_role_menu WHERE tenant_id=100000 AND menu_id IN (1877,1878,1879,1880,1881,1893)' 41 'Forty-one approved skill role grants'
    Assert-Scalar 'SELECT COUNT(*) FROM cloud_flow_db.sys_role_menu WHERE role_id=5 AND menu_id IN (1877,1880,1893) AND tenant_id=100000' 3 'EMPLOYEE receives skill list, own results and own pending submission'
    Assert-Scalar 'SELECT COUNT(*) FROM cloud_flow_db.sys_role_menu WHERE role_id=5 AND menu_id BETWEEN 1860 AND 1899 AND menu_id NOT IN (1872,1873,1876,1877,1880,1888,1889,1893,1894,1895)' 0 'EMPLOYEE has no unexpected H2 grant'
    Assert-Scalar 'SELECT COUNT(*) FROM cloud_flow_db.sys_menu WHERE menu_id IN (1882,1883,1884,1885,1886,1894,1895)' 7 'Seven H2 appraisal menus within approved range'
    Assert-Scalar 'SELECT COUNT(*) FROM cloud_flow_db.sys_role_menu WHERE tenant_id=100000 AND menu_id IN (1882,1883,1884,1885,1886,1894,1895)' 34 'Thirty-four approved appraisal role grants'
    Assert-Scalar 'SELECT COUNT(*) FROM cloud_flow_db.sys_role_menu WHERE role_id=5 AND menu_id IN (1894,1895) AND tenant_id=100000' 2 'EMPLOYEE appraisal grants only own reading and own invited scoring'
    Assert-Scalar 'SELECT COUNT(*) FROM cloud_flow_db.sys_role_menu WHERE role_id=5 AND menu_id IN (1882,1883,1884,1885,1886)' 0 'EMPLOYEE receives no appraisal management scoring or calibration grant'
    Assert-Scalar "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='cloud_flow_db' AND table_name IN ('hr_appraisal_cycle','hr_appraisal_kra','hr_appraisal_result')" 3 'Three approved appraisal tables'
    Assert-Scalar "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='cloud_flow_db' AND table_name IN ('hr_skill','hr_position_skill','hr_employee_skill')" 3 'Three approved skill evidence tables'
    Assert-Scalar "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='cloud_flow_db' AND table_name LIKE 'crm\_%'" 45 '45 approved CRM tables'
    Assert-Scalar "SELECT COUNT(*) FROM information_schema.columns WHERE table_schema='cloud_flow_db' AND table_name='crm_sales_target' AND ((column_name='calculation_basis' AND column_default='OWNER_V1' AND is_nullable='NO') OR (column_name='currency' AND column_default='CNY' AND is_nullable='NO'))" 2 'Two approved sales-target columns preserve legacy defaults'
    Assert-Scalar 'SELECT COUNT(*) FROM cloud_flow_db.sys_menu WHERE menu_id BETWEEN 1900 AND 1949' 18 'Eighteen approved H3 menu permissions including opportunity import'
    Assert-Scalar 'SELECT COUNT(*) FROM cloud_flow_db.sys_role_menu WHERE role_id=5 AND menu_id BETWEEN 1900 AND 1949' 0 'EMPLOYEE receives no H3 privilege'
    Assert-Scalar 'SELECT COUNT(*) FROM cloud_flow_db.sys_role_menu WHERE tenant_id=100000 AND menu_id BETWEEN 1900 AND 1949' 63 'Sixty-three exact H3 role grants'
    Assert-Scalar 'SELECT COUNT(*) FROM cloud_flow_db.sys_role_menu WHERE menu_id=1916 AND tenant_id=100000 AND role_id IN (1,3)' 2 'Financial publication only ADMIN and FINANCE'
    Assert-Scalar 'SELECT COUNT(*) FROM cloud_flow_db.sys_role_menu WHERE menu_id=1916 AND (tenant_id<>100000 OR role_id NOT IN (1,3))' 0 'No unexpected financial publication grants'
    Assert-Scalar "SELECT COUNT(*) FROM cloud_flow_db.sys_menu WHERE menu_id=1914 AND parent_id=805 AND perms='crm:portal:solution:publish'" 1 'Ticket publication menu uses approved existing parent'
    Assert-Scalar 'SELECT COUNT(*) FROM cloud_flow_db.sys_role_menu WHERE menu_id=1914 AND tenant_id=100000 AND role_id IN (1,8,9,11)' 4 'Ticket publication only ADMIN, SALES_MANAGER, SALES_REP and CUSTOMER_SUCCESS'
    Assert-Scalar 'SELECT COUNT(*) FROM cloud_flow_db.sys_role_menu WHERE menu_id=1914 AND (tenant_id<>100000 OR role_id NOT IN (1,8,9,11))' 0 'No unexpected ticket publication grants'
    Assert-Scalar "SELECT COUNT(*) FROM information_schema.columns WHERE table_schema='cloud_flow_db' AND table_name='crm_service_ticket' AND column_default IS NULL AND is_nullable='YES' AND ((column_name='portal_contact_id' AND data_type='bigint') OR (column_name='portal_solution' AND data_type='text') OR (column_name='portal_solution_time' AND data_type='datetime'))" 3 'Three approved portal-ticket fields default to private'
    Assert-Scalar "SELECT COUNT(*) FROM information_schema.columns WHERE table_schema='cloud_flow_db' AND table_name='sys_file' AND column_name='portal_owner_id' AND data_type='bigint' AND column_default IS NULL AND is_nullable='YES'" 1 'Portal file owner stays separate from internal employee identity'
    Assert-Scalar "SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema='cloud_flow_db' AND table_name='sys_file' AND index_name='idx_file_portal_owner' AND non_unique=1 AND ((seq_in_index=1 AND column_name='tenant_id') OR (seq_in_index=2 AND column_name='portal_owner_id'))" 2 'Portal file ownership index matches approval'
    Assert-Scalar "SELECT COUNT(*) FROM cloud_flow_db.sys_menu WHERE menu_id=1904 AND parent_id=801 AND perms='crm:opportunity:stage-reopen'" 1 'Terminal reopen uses its approved parent and permission'
    Assert-Scalar 'SELECT COUNT(*) FROM cloud_flow_db.sys_role_menu WHERE menu_id=1904 AND tenant_id=100000 AND role_id IN (1,8)' 2 'Terminal reopen only ADMIN and SALES_MANAGER'
    Assert-Scalar 'SELECT COUNT(*) FROM cloud_flow_db.sys_role_menu WHERE menu_id=1904 AND (tenant_id<>100000 OR role_id NOT IN (1,8))' 0 'No unexpected terminal reopen grants'
    Assert-Scalar "SELECT COUNT(*) FROM information_schema.columns WHERE table_schema='cloud_flow_db' AND table_name='oa_knowledge_document' AND ((column_name='external_visible_flag' AND column_default='0' AND is_nullable='NO') OR (column_name='external_version_id' AND column_default IS NULL AND is_nullable='YES') OR (column_name='external_attachment_file_ids' AND data_type='json' AND column_default IS NULL AND is_nullable='YES'))" 3 'Three knowledge publication columns default to private'
    Assert-Scalar "SELECT COUNT(*) FROM cloud_flow_db.sys_menu WHERE menu_id=1915 AND parent_id=210 AND perms='oa:knowledge:external-publish'" 1 'Knowledge publication menu uses approved existing parent'
    Assert-Scalar 'SELECT COUNT(*) FROM cloud_flow_db.sys_role_menu WHERE menu_id=1915 AND tenant_id=100000 AND role_id IN (1,7)' 2 'Knowledge publication only ADMIN and OA_CLERK'
    Assert-Scalar 'SELECT COUNT(*) FROM cloud_flow_db.sys_role_menu WHERE menu_id=1915 AND (tenant_id<>100000 OR role_id NOT IN (1,7))' 0 'No unexpected knowledge publication grants'
    Assert-Scalar 'SELECT COUNT(*) FROM cloud_flow_db.sys_role_menu WHERE menu_id=1917 AND tenant_id=100000 AND role_id=1' 1 'Opportunity import is granted to platform ADMIN'
    Assert-Scalar 'SELECT COUNT(*) FROM cloud_flow_db.sys_role_menu WHERE menu_id=1917 AND (tenant_id<>100000 OR role_id<>1)' 0 'No unexpected opportunity import grants'
    Assert-Scalar 'SELECT COUNT(*) FROM cloud_flow_db.sys_role_menu WHERE menu_id IN (1912,1913) AND tenant_id=100000 AND role_id IN (1,8,10)' 6 'Portal accounts use exactly ADMIN, SALES_MANAGER and CRM_OPS'
    Assert-Scalar 'SELECT COUNT(*) FROM cloud_flow_db.sys_role_menu WHERE menu_id IN (1912,1913) AND (tenant_id<>100000 OR role_id NOT IN (1,8,10))' 0 'Portal account management has no other grants'
    Assert-Scalar 'SELECT COUNT(*) FROM cloud_flow_db.sys_portal_user' 0 'Business seed creates no synthetic portal accounts'
    Assert-Scalar "SELECT COUNT(*) FROM cloud_flow_db.sys_message_template WHERE tenant_id=100000 AND template_code='CRM_CUSTOMER_EMAIL' AND channel_type='EMAIL' AND biz_module='crm' AND force_send_flag=0 AND dedupe_window_sec=0 AND status='ENABLED' AND deleted=0" 1 'Non-force customer archive template seeded exactly once'
    Assert-Scalar 'SELECT COUNT(*) FROM cloud_flow_db.crm_email_record' 0 'Business seed creates no synthetic archived or sent email'
    Assert-Scalar "SELECT COUNT(*) FROM information_schema.columns WHERE table_schema='cloud_flow_db' AND table_name='crm_email_record'" 27 'Customer email archive uses exactly the approved 27 columns'
    Assert-Scalar "SELECT COUNT(*) FROM cloud_flow_db.crm_sales_stage WHERE tenant_id=100000 AND status='ACTIVE' AND deleted=0" 6 'Six canonical opportunity stages'
    Assert-Scalar 'SELECT COUNT(*) FROM cloud_flow_db.crm_opportunity WHERE weighted_amount <> ROUND(IFNULL(expected_amount,0)*IFNULL(win_rate,0)/100,2)' 0 'Existing opportunity forecasts initialized correctly'
    Assert-Scalar 'SELECT COUNT(*) FROM cloud_flow_db.sys_menu WHERE menu_id BETWEEN 1550 AND 1649' 35 '35 E menu and button permissions'
    Assert-Scalar "SELECT COUNT(*) FROM cloud_flow_db.sys_role_menu WHERE role_id=5 AND menu_id BETWEEN 1550 AND 1649" 0 'EMPLOYEE receives no E privilege'
    Assert-Scalar "SELECT COUNT(*) FROM cloud_flow_db.sys_job WHERE job_id BETWEEN 1550 AND 1555 AND service_name='crm'" 6 'Six customer operations jobs registered'
    Assert-Scalar "SELECT COUNT(*) FROM cloud_flow_db.sys_job WHERE job_id=1554 AND status='ENABLED' AND retry_count=0 AND interval_ms=300000" 1 'E5 real fact aggregation registered'
    Assert-Scalar "SELECT COUNT(*) FROM cloud_flow_db.sys_job WHERE job_id=1555 AND status='ENABLED' AND retry_count=0 AND interval_ms=30000" 1 'E5 scheduled frozen-audience dispatch registered'
    Assert-Scalar "SELECT COUNT(*) FROM cloud_flow_db.sys_config WHERE tenant_id=100000 AND config_scope='1' AND ((config_key IN ('crm.email.sendingEnabled','crm.email.trackingEnabled') AND config_value='false') OR (config_key IN ('crm.email.publicOrigin','crm.email.allowedHosts') AND config_value='') OR (config_key='crm.email.confirmationThreshold' AND config_value='5000'))" 5 'Marketing defaults disabled until configured'
    Assert-Scalar "SELECT COUNT(*) FROM cloud_flow_db.sys_message_template WHERE tenant_id=100000 AND template_code='CRM_MARKETING' AND channel_type='EMAIL' AND biz_module='crm' AND force_send_flag=0 AND dedupe_window_sec=0 AND status='ENABLED' AND deleted=0" 1 'Non-force marketing template seeded exactly once'
    Assert-Scalar "SELECT COUNT(*) FROM cloud_flow_db.sys_dict_data WHERE dict_type='crm_activity_status' AND dict_value IN ('PLANNED','IN_PROGRESS','COMPLETED','CANCELLED','NOT_HELD') AND tenant_id=100000" 5 'Five shared activity statuses'
    Assert-Scalar "SELECT COUNT(*) FROM cloud_flow_db.sys_dict_data WHERE dict_type='crm_activity_acceptance_status' AND dict_value IN ('NONE','ACCEPTED','DECLINED','TENTATIVE') AND tenant_id=100000" 4 'Four shared invitation statuses'
    Assert-Scalar "SELECT COUNT(*) FROM cloud_flow_db.crm_service_ticket WHERE severity NOT IN ('P1','P2','P3','P4')" 0 'Existing CRM ticket priorities mapped'
    Assert-Scalar "SELECT COUNT(*) FROM cloud_flow_db.sys_dict_data WHERE dict_type='severity_level' AND dict_value IN ('LOW','MEDIUM','HIGH','CRITICAL') AND tenant_id=100000" 4 'Shared non-CRM severity dictionary unchanged'
    Assert-Scalar "SELECT COUNT(*) FROM cloud_flow_db.crm_territory WHERE territory_id BETWEEN 1550 AND 1583 AND parent_id=0" 34 '34 provincial territories seeded'
    Assert-Scalar "SELECT COUNT(*) FROM cloud_flow_db.crm_sla_priority WHERE policy_id=1550 AND first_response_minutes>0 AND resolution_minutes>0" 4 'Four default SLA priority tiers'
    $NextBatch = [regex]::Match($BatchSeed, '(?ms)^INSERT IGNORE INTO cloud_flow_db\.sys_menu\s*\([^;]*?\bVALUES\s*\(1650,')
    if (-not $NextBatch.Success) { throw 'Following F menu boundary missing; refusing replay of later batches' }
    $BatchSeed.Substring(0, $NextBatch.Index) | & $Client @ClientArguments '--database=cloud_flow_db'
    if ($LASTEXITCODE -ne 0) { throw 'E seed replay failed' }
    Assert-Scalar 'SELECT COUNT(*) FROM cloud_flow_db.sys_menu WHERE menu_id BETWEEN 1550 AND 1649' 35 'E seed replay is idempotent'
    if (-not $SkipDemo) {
        Get-Content -LiteralPath (Join-Path $Root 'cloudflow-backend/DB/07.cloudflow-demo-seed.sql') -Raw -Encoding UTF8 | & $Client @ClientArguments '--database=cloud_flow_db'
        if ($LASTEXITCODE -ne 0) { throw 'Demo import failed' }
        foreach ($Table in $OauthTables) { Assert-Scalar "SELECT COUNT(*) FROM cloud_flow_db.$Table" 0 "$Table demo contains no synthetic credentials or authorization" }
        Assert-Scalar 'SELECT COUNT(*) FROM cloud_flow_db.sys_role_menu WHERE menu_id IN (1987,1988) AND (tenant_id<>100000 OR role_id<>1)' 0 'Demo administrators receive no platform OAuth client management'
        Assert-Scalar 'SELECT COUNT(*) FROM cloud_flow_db.sys_role_menu WHERE tenant_id=100000 AND role_id=1 AND menu_id IN (1987,1988)' 2 'Demo preserves approved platform OAuth management grants'
        Assert-Scalar 'SELECT COUNT(*) FROM cloud_flow_db.sys_data_source_config' 0 'Demo creates no data source password or configuration'
        Assert-Scalar 'SELECT COUNT(*) FROM cloud_flow_db.sys_data_source_registration' 0 'Demo creates no synthetic data source instance results'
        Assert-Scalar 'SELECT COUNT(*) FROM cloud_flow_db.sys_tenant_package' 0 'Demo creates no invented package template'
        Assert-Scalar 'SELECT COUNT(*) FROM cloud_flow_db.sys_tenant_package_sync' 0 'Demo creates no invented package sync batch'
        Assert-Scalar 'SELECT COUNT(*) FROM cloud_flow_db.sys_tenant_package_sync_item' 0 'Demo creates no invented package application result'
        Assert-Scalar 'SELECT COUNT(*) FROM cloud_flow_db.sys_tenant WHERE package_id IS NOT NULL OR package_version IS NOT NULL OR package_override IS NOT NULL OR effective_menu_ids IS NOT NULL' 0 'Demo tenants retain unassigned package behavior'
        Assert-Scalar 'SELECT COUNT(*) FROM cloud_flow_db.sys_role_menu WHERE menu_id BETWEEN 1973 AND 1976 AND (tenant_id<>100000 OR role_id<>1)' 0 'Demo administrators receive no platform data source permissions'
        Assert-Scalar 'SELECT COUNT(*) FROM cloud_flow_db.sys_role_menu WHERE tenant_id=100000 AND role_id=1 AND menu_id BETWEEN 1973 AND 1976' 4 'Demo preserves approved platform data source role grants'
        Assert-Scalar "SELECT COUNT(*) FROM cloud_flow_db.sys_job WHERE job_id=1973 AND handler_name='dataSourceReconcile' AND interval_ms=60000 AND service_name='auth'" 1 'Demo preserves real data source reconciliation job'
        foreach ($Table in @('crm_activity','crm_activity_participant','crm_activity_reminder','crm_sla_policy','crm_sla_priority','crm_sla_status_rule','crm_lost_reason','crm_competitor','crm_opportunity_lost_detail','crm_customer_credit','crm_territory','crm_lead_score_rule','crm_campaign','crm_target_list','crm_target_list_member','crm_campaign_target_list','crm_mass_email','crm_campaign_log')) {
            $IdColumn = & $Client @ClientArguments "--execute=SELECT column_name FROM information_schema.key_column_usage WHERE table_schema='cloud_flow_db' AND table_name='$Table' AND constraint_name='PRIMARY'"
            Assert-Scalar "SELECT COUNT(*) FROM cloud_flow_db.$Table WHERE $IdColumn>=1000000 AND tenant_id BETWEEN 100000 AND 100049" 2500 "$Table demo rows across 50 tenants"
        }
        Assert-Scalar "SELECT COUNT(*) FROM cloud_flow_db.crm_activity WHERE activity_id>=1000000 AND (status<>'CANCELLED' OR end_time<start_time OR overdue_flag<>0)" 0 'Demo activities cannot send reminders'
        Assert-Scalar "SELECT COUNT(*) FROM cloud_flow_db.crm_territory WHERE territory_id>=1000000 AND (parent_id<>0 OR level_path<>CONCAT('/',territory_id,'/'))" 0 'Demo territory paths are valid'
        Assert-Scalar "SELECT COUNT(*) FROM cloud_flow_db.crm_target_list_member member LEFT JOIN cloud_flow_db.crm_customer customer ON customer.customer_id=member.member_ref_id AND customer.tenant_id=member.tenant_id WHERE member.member_id>=1000000 AND (member.member_type<>'CUSTOMER' OR customer.customer_id IS NULL)" 0 'Demo audience references stay in tenant'
        Assert-Scalar "SELECT COUNT(*) FROM cloud_flow_db.crm_mass_email WHERE mass_email_id>=1000000 AND (status<>'DRAFT' OR sent_count<>0)" 0 'Blocked email demo tasks remain unsent'
        Assert-Scalar "SELECT COUNT(*) FROM cloud_flow_db.crm_campaign WHERE campaign_id>=1000000 AND (status<>'CANCELLED' OR revenue<>0 OR sent_count<>0 OR roi IS NOT NULL)" 0 'Demo marketing does not claim delivery or revenue'
        Assert-Scalar 'SELECT COUNT(*) FROM cloud_flow_db.crm_opportunity WHERE weighted_amount <> ROUND(IFNULL(expected_amount,0)*IFNULL(win_rate,0)/100,2)' 0 'Demo opportunity forecasts use percentage units'
        Assert-Scalar 'SELECT COUNT(*) FROM cloud_flow_db.crm_opportunity_stage_history' 0 'Demo generator creates no synthetic stage history'
        Assert-Scalar 'SELECT COUNT(*) FROM cloud_flow_db.crm_opportunity_item' 0 'Demo generator creates no synthetic commercial product facts'
        Assert-Scalar 'SELECT COUNT(*) FROM cloud_flow_db.crm_email_record' 0 'Demo generator creates no synthetic email draft, archive or delivery'
        Assert-Scalar 'SELECT COUNT(*) FROM cloud_flow_db.sys_portal_user' 0 'Demo generator creates no synthetic portal credentials'
        Assert-Scalar 'SELECT COUNT(*) FROM cloud_flow_db.oa_knowledge_document WHERE external_visible_flag<>0 OR external_version_id IS NOT NULL OR external_attachment_file_ids IS NOT NULL' 0 'Demo knowledge never publishes content or attachments to the portal'
        Assert-Scalar "SELECT COUNT(*) FROM cloud_flow_db.crm_sales_target WHERE calculation_basis<>'OWNER_V1' OR currency<>'CNY'" 0 'Generated sales targets retain OWNER_V1 and explicit CNY'
        $DemoSource = Get-Content -LiteralPath (Join-Path $Root 'cloudflow-backend/DB/07.cloudflow-demo-seed.sql') -Raw -Encoding UTF8
        $PortalGuard = [regex]::Match($DemoSource, '(?s)CREATE TEMPORARY TABLE portal_demo_seed_guard \(.*?DROP TEMPORARY TABLE portal_demo_seed_guard;').Value
        if (-not $PortalGuard) { throw 'Generated portal seed guard is missing' }
        $DocumentId = & $Client @ClientArguments '--execute=SELECT MIN(document_id) FROM cloud_flow_db.oa_knowledge_document WHERE tenant_id=100000'
        if ($LASTEXITCODE -ne 0 -or $DocumentId -notmatch '^\d+$') { throw 'Owned demo knowledge document required for seed guard checks' }
        foreach ($ProtectedFact in @('external_visible_flag=1', 'external_version_id=1', 'external_attachment_file_ids=JSON_ARRAY(1)')) {
            try {
                & $Client @ClientArguments "--execute=UPDATE cloud_flow_db.oa_knowledge_document SET $ProtectedFact WHERE tenant_id=100000 AND document_id=$DocumentId"
                if ($LASTEXITCODE -ne 0) { throw 'Could not arrange owned knowledge publication boundary' }
                $GuardResult = $PortalGuard | & $Client @ClientArguments '--database=cloud_flow_db' 2>&1 | Out-String
                $GuardExit = $LASTEXITCODE
                if ($GuardExit -eq 0 -or $GuardResult -notmatch 'ERROR 3819') { throw "Knowledge publication guard did not reject existing facts: $GuardResult" }
                Write-Output $GuardResult.Trim()
                Assert-Scalar "SELECT COUNT(*) FROM cloud_flow_db.oa_knowledge_document WHERE tenant_id=100000 AND document_id=$DocumentId AND ($ProtectedFact)" 1 "Native seed guard preserves $ProtectedFact"
                Write-Output "PASS: native portal seed guard rejects existing publication; mysql_exit=$GuardExit; protected_fact=$ProtectedFact"
            } finally {
                & $Client @ClientArguments "--execute=UPDATE cloud_flow_db.oa_knowledge_document SET external_visible_flag=0,external_version_id=NULL,external_attachment_file_ids=NULL WHERE tenant_id=100000 AND document_id=$DocumentId"
                if ($LASTEXITCODE -ne 0) { throw 'Could not restore owned knowledge boundary input' }
            }
        }
        Write-Output 'PASS: isolated 01-07 CRM database acceptance'
    }
    if ($HrSkillCheck) {
        & (Join-Path $PSScriptRoot 'verify-hr-skills.ps1') -DataDirectory $DataDirectory -JdbcUrl "jdbc:mysql://127.0.0.1:$Port/cloud_flow_db?useSSL=false&allowPublicKeyRetrieval=true&serverTimezone=Asia/Shanghai"
        if ($LASTEXITCODE -ne 0) { throw 'HR skill service/database behavior checks failed' }
    }
    if ($HrOvertimeCheck) {
        & (Join-Path $PSScriptRoot 'verify-h2-overtime-database.ps1') -SourcePort $Port -SourceDataDirectory $DataDirectory -ArtifactRoot $RunDirectory -KeepArtifacts
        if ($LASTEXITCODE -ne 0) { throw 'HR overtime service/database behavior checks failed' }
    }
    if (-not $SkipBehavior) {
        & (Join-Path $PSScriptRoot 'verify-batch-e.ps1') -SkipBuild:$SkipBuild -DataDirectory $DataDirectory -JdbcUrl "jdbc:mysql://127.0.0.1:$Port/cloud_flow_db?useSSL=false&allowPublicKeyRetrieval=true&serverTimezone=Asia/Shanghai"
        if ($LASTEXITCODE -ne 0) { throw 'CRM service/database behavior checks failed' }
    }
} finally {
    if ($DatabaseProcess) {
        $DatabaseProcess.Refresh()
        if (-not $DatabaseProcess.HasExited) {
            & $Admin '--no-defaults' '--protocol=TCP' '--host=127.0.0.1' "--port=$Port" '--user=root' '--skip-password' 'shutdown' *> $null
            if (-not $DatabaseProcess.WaitForExit(10000)) { $DatabaseProcess.Kill(); $DatabaseProcess.WaitForExit() }
        }
        $Helpers = @(Get-CimInstance Win32_Process -Filter "name='mysqld.exe'" | Where-Object { $_.CommandLine -and $_.CommandLine.Contains($RunDirectory) })
        foreach ($Helper in $Helpers) { Stop-Process -Id $Helper.ProcessId -Force -ErrorAction SilentlyContinue; Wait-Process -Id $Helper.ProcessId -Timeout 15 -ErrorAction SilentlyContinue }
        Write-Output 'Isolated MySQL stopped; existing services were not used'
    }
    if (Test-Path -LiteralPath $DataDirectory -PathType Container) {
        $ResolvedData = (Resolve-Path -LiteralPath $DataDirectory).ProviderPath
        if (-not $ResolvedData.StartsWith($RunDirectory + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw 'Unsafe cleanup path' }
        $Remaining = @(Get-CimInstance Win32_Process -Filter "name='mysqld.exe'" | Where-Object { $_.CommandLine -and $_.CommandLine.Contains($RunDirectory) })
        if ($Remaining.Count -ne 0) { throw 'Temporary database still running; data files retained' }
        Remove-Item -LiteralPath $ResolvedData -Recurse
        Write-Output 'Temporary data removed; logs retained'
    }
}
