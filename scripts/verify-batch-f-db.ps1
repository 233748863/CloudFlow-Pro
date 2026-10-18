[CmdletBinding()]
param([string]$MySqlBin = '', [switch]$SkipDemo, [switch]$SkipBehavior, [switch]$SkipBuild, [switch]$MeetingChecks, [switch]$PortalFinanceChecks, [switch]$AssetPerformance,
    [switch]$SupplierChecks, [string]$SupplierResultPath = '', [switch]$ProjectPersistenceChecks, [string]$ProjectResultPath = '', [switch]$RfqChecks, [string]$RfqResultPath = '')

$ErrorActionPreference = 'Stop'
if ($AssetPerformance -and ($SkipBehavior -or $MeetingChecks -or $PortalFinanceChecks)) { throw 'Asset performance must run isolated OA behavior checks' }
if ($SupplierChecks -and (-not $SupplierResultPath -or $SkipBehavior -or $MeetingChecks -or $PortalFinanceChecks -or $AssetPerformance -or $ProjectPersistenceChecks -or $RfqChecks)) { throw 'Supplier checks require an isolated behavior run and a result path' }
if ($RfqChecks -and (-not $RfqResultPath -or $SkipBehavior -or $MeetingChecks -or $PortalFinanceChecks -or $AssetPerformance -or $ProjectPersistenceChecks -or $SupplierChecks)) { throw 'RFQ checks require an isolated behavior run and a result path' }
if ($ProjectPersistenceChecks -and (-not $ProjectResultPath -or $SkipBehavior -or $MeetingChecks -or $PortalFinanceChecks -or $AssetPerformance -or $SupplierChecks -or $RfqChecks)) { throw 'Project persistence checks require an isolated behavior run and a result path' }
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
$RunDirectory = [IO.Path]::GetFullPath((Join-Path $Target ('batch-f-mysql-' + [guid]::NewGuid().ToString('N'))))
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
                if ($MeetingChecks) {
                    Write-Output 'QUERY: SELECT COUNT(*) FROM cloud_flow_db.sys_menu WHERE menu_id BETWEEN 1950 AND 1969'
                    Assert-Scalar 'SELECT COUNT(*) FROM cloud_flow_db.sys_menu WHERE menu_id BETWEEN 1950 AND 1969' 0 'H4 pre-insert menu conflicts'
                }
                $Seed = Get-Content -LiteralPath $SqlFile -Raw -Encoding UTF8
                $Offset = $Seed.IndexOf('-- batch-f-operations:start')
                if ($Offset -lt 0) { throw 'Batch F seed marker missing' }
                $Seed.Substring(0, $Offset) | & $Client @ScriptClientArguments
                if ($LASTEXITCODE -ne 0) { throw 'Existing business seed failed' }
                Assert-Scalar 'SELECT COUNT(*) FROM cloud_flow_db.sys_menu WHERE menu_id BETWEEN 1650 AND 1749' 0 'F menu range is conflict-free before insertion'
                $EndOffset = $Seed.IndexOf('-- batch-f-operations:end', $Offset)
                if ($EndOffset -le $Offset) { throw 'Batch F seed end marker missing' }
                $BatchSeed = $Seed.Substring($Offset, $EndOffset - $Offset)
                $Seed.Substring($Offset) | & $Client @ScriptClientArguments
            } else { Get-Content -LiteralPath $SqlFile -Raw -Encoding UTF8 | & $Client @ScriptClientArguments }
            if ($LASTEXITCODE -ne 0) { throw "Database script failed: $SqlFile" }
            Write-Output "PASS: $SqlFile"
        }
    } finally { Pop-Location }
    $ExpectedTableCount = 0
    foreach ($Definition in @(Get-ChildItem -LiteralPath (Join-Path $Root 'cloudflow-backend/DB') -File | Where-Object Name -Match '^0[1-5]\.')) {
        $ExpectedTableCount += [regex]::Matches([IO.File]::ReadAllText($Definition.FullName), '(?m)^CREATE TABLE ').Count
    }
    Assert-Scalar "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='cloud_flow_db'" $ExpectedTableCount 'Complete schema matches current formal definitions'
    Assert-Scalar "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='cloud_flow_db' AND LEFT(table_name,3)='oa_'" 84 'OA-prefixed table count'
    Assert-Scalar "SELECT COUNT(*) FROM information_schema.columns WHERE table_schema='cloud_flow_db' AND table_name='oa_project_task' AND column_name='opening_actual_hours' AND data_type='decimal' AND numeric_precision=10 AND numeric_scale=2 AND is_nullable='NO' AND column_default='0.00'" 1 'Opening hours have approved precision and non-null zero default'
    Assert-Scalar 'SELECT COUNT(*) FROM cloud_flow_db.sys_menu WHERE menu_id BETWEEN 1650 AND 1749' 54 'F menus use allocated range'
    if ($MeetingChecks) {
        Assert-Scalar 'SELECT COUNT(*) FROM cloud_flow_db.sys_menu WHERE menu_id BETWEEN 1950 AND 1969' 10 'H4 menus remain in approved 1950-1969 range'
        Assert-Scalar 'SELECT COUNT(*) FROM cloud_flow_db.sys_role_menu WHERE tenant_id=100000 AND role_id=5 AND menu_id BETWEEN 1950 AND 1969 AND menu_id NOT IN(1950,1952,1953,1954,1955,1958,1959)' 0 'H4 employee unexpected permissions = 0'
        Assert-Scalar 'SELECT COUNT(*) FROM cloud_flow_db.sys_role_menu WHERE tenant_id=100000 AND role_id=5 AND menu_id IN(1952,1953,1954,1955,1958)' 5 'H4 employee writes match five approved self-service actions'
    }
    Assert-Scalar "SELECT COUNT(*) FROM cloud_flow_db.sys_job WHERE job_id BETWEEN 1650 AND 1657 AND status='ENABLED' AND service_name='oa'" 8 'Eight built-in handlers registered'
    Assert-Scalar "SELECT COUNT(*) FROM cloud_flow_db.sys_job_handler WHERE handler_id=1901 AND service_name='oa' AND handler_name='oaContractPerformanceConfirm'" 1 'H3 due contract performance handler registered'
    Assert-Scalar "SELECT COUNT(*) FROM cloud_flow_db.wf_form_definition WHERE tenant_id=100000 AND form_id='form_contract' AND JSON_UNQUOTE(JSON_EXTRACT(fields_json, '$[0].id'))='contractName' AND JSON_UNQUOTE(JSON_EXTRACT(fields_json, '$[1].id'))='counterpartyName' AND JSON_UNQUOTE(JSON_EXTRACT(fields_json, '$[2].id'))='amount' AND JSON_UNQUOTE(JSON_EXTRACT(fields_json, '$[3].id'))='contractType' AND JSON_UNQUOTE(JSON_EXTRACT(fields_json, '$[4].id'))='remark' AND JSON_EXTRACT(fields_json, '$[4].required')=false" 1 'Contract approval form binds actual OA fields without inventing a required summary'
    Assert-Scalar "SELECT COUNT(*) FROM cloud_flow_db.sys_job WHERE job_id=1901 AND tenant_id=100000 AND service_name='oa' AND handler_name='oaContractPerformanceConfirm' AND status='ENABLED' AND trigger_type='FIXED_DELAY' AND interval_ms=60000 AND retry_count=0" 1 'H3 due contract performance scans every 60 seconds without immediate replay'
    Assert-Scalar "SELECT COUNT(*) FROM cloud_flow_db.wf_process_definition WHERE process_key IN ('oa_supplier_governance','oa_asset_movement','oa_asset_repair','oa_timesheet_approval','oa_rfq_award') AND status='PUBLISHED' AND JSON_VALID(model_json)=1" 5 'Five approval definitions published'
    Assert-Scalar "SELECT COUNT(*) FROM cloud_flow_db.sys_role_menu grants JOIN cloud_flow_db.sys_role role ON role.role_id=grants.role_id AND role.tenant_id=grants.tenant_id JOIN cloud_flow_db.sys_menu menu ON menu.menu_id=grants.menu_id WHERE role.role_key='employee' AND menu.menu_id BETWEEN 1650 AND 1749 AND menu.perms NOT LIKE 'oa:timesheet:%'" 0 'Employee grants exclude confidential operations'
    $BatchSeed | & $Client @ClientArguments '--database=cloud_flow_db'
    if ($LASTEXITCODE -ne 0) { throw 'F seed replay failed' }
    Assert-Scalar 'SELECT COUNT(*) FROM cloud_flow_db.sys_menu WHERE menu_id BETWEEN 1650 AND 1749' 54 'F seed replay idempotent'
    function Assert-OfficialResidentTaxSeed {
        Assert-Scalar "SELECT COUNT(*) FROM cloud_flow_db.hr_tax_slab WHERE slab_id=1450 AND tenant_id=100000 AND region='CN' AND effective_from='2026-01-01' AND effective_to='2026-12-31' AND threshold_amount=5000.00 AND status='DRAFT' AND deleted=0" 1 'Approved resident wage tax seed remains a 2026 draft'
        Assert-Scalar 'SELECT COUNT(*) FROM cloud_flow_db.hr_tax_slab_detail WHERE slab_id=1450 AND tenant_id=100000 AND deleted=0' 7 'Approved tax seed has exactly seven brackets'
        $TaxBands=@(
            @(1, '0.00', '36000.00', '0.0300', '0.00'),
            @(2, '36000.00', '144000.00', '0.1000', '2520.00'),
            @(3, '144000.00', '300000.00', '0.2000', '16920.00'),
            @(4, '300000.00', '420000.00', '0.2500', '31920.00'),
            @(5, '420000.00', '660000.00', '0.3000', '52920.00'),
            @(6, '660000.00', '960000.00', '0.3500', '85920.00'),
            @(7, '960000.00', $null, '0.4500', '181920.00')
        )
        foreach($TaxBand in $TaxBands){
            $UpperPredicate=if($null -eq $TaxBand[2]){'to_amount IS NULL'}else{"to_amount=$($TaxBand[2])"}
            Assert-Scalar "SELECT COUNT(*) FROM cloud_flow_db.hr_tax_slab_detail WHERE slab_id=1450 AND tenant_id=100000 AND level_no=$($TaxBand[0]) AND from_amount=$($TaxBand[1]) AND $UpperPredicate AND tax_rate=$($TaxBand[3]) AND quick_deduction=$($TaxBand[4]) AND deleted=0" 1 "Official resident tax bracket $($TaxBand[0])"
        }
    }
    Assert-OfficialResidentTaxSeed
    if (-not $SkipDemo) {
        Get-Content -LiteralPath (Join-Path $Root 'cloudflow-backend/DB/07.cloudflow-demo-seed.sql') -Raw -Encoding UTF8 | & $Client @ClientArguments '--database=cloud_flow_db'
        if ($LASTEXITCODE -ne 0) { throw 'Demo import failed' }
        Assert-OfficialResidentTaxSeed
        foreach ($Table in @('oa_asset_category','oa_asset_depreciation_schedule','oa_asset_maintenance_plan','oa_asset_maintenance_task','oa_asset_repair','oa_asset_movement','oa_supplier_category','oa_supplier_qualification','oa_supplier_scorecard','oa_supplier_score_criteria','oa_supplier_qualification_reminder_log','oa_activity_type','oa_activity_cost','oa_timesheet','oa_timesheet_detail','oa_project_task','oa_project_template','oa_project_template_task','oa_contract_fulfilment_term','oa_contract_template_term','oa_purchase_rfq','oa_purchase_rfq_item','oa_purchase_rfq_supplier','oa_supplier_quotation','oa_supplier_quotation_item')) {
            $IdColumn = & $Client @ClientArguments "--execute=SELECT column_name FROM information_schema.key_column_usage WHERE table_schema='cloud_flow_db' AND table_name='$Table' AND constraint_name='PRIMARY'"
            Assert-Scalar "SELECT COUNT(*) FROM cloud_flow_db.$Table WHERE $IdColumn>=1000000 AND tenant_id BETWEEN 100000 AND 100049" 2500 "$Table demo rows across 50 tenants"
        }
        Assert-Scalar "SELECT COUNT(*) FROM cloud_flow_db.oa_asset WHERE asset_id>=1000000 AND (status NOT IN('IDLE','IN_USE','MAINTENANCE','SCRAPPED','LOST','DISPOSED') OR depreciation_flag NOT IN(0,1) OR purchase_amount<>net_book_value+accumulated_depreciation)" 0 'Demo asset amounts and states coherent'
        Assert-Scalar 'SELECT COUNT(*) FROM cloud_flow_db.oa_project_dependency edge LEFT JOIN cloud_flow_db.oa_project_task predecessor ON predecessor.task_id=edge.predecessor_task_id AND predecessor.tenant_id=edge.tenant_id AND predecessor.project_id=edge.project_id LEFT JOIN cloud_flow_db.oa_project_task successor ON successor.task_id=edge.successor_task_id AND successor.tenant_id=edge.tenant_id AND successor.project_id=edge.project_id WHERE edge.deleted=0 AND (predecessor.task_id IS NULL OR successor.task_id IS NULL OR predecessor.task_id=successor.task_id)' 0 'Project dependency references valid'
        Assert-Scalar 'SELECT COUNT(*) FROM cloud_flow_db.oa_timesheet_detail detail LEFT JOIN cloud_flow_db.oa_project_task task ON task.task_id=detail.task_id AND task.project_id=detail.project_id AND task.tenant_id=detail.tenant_id WHERE detail.detail_id>=1000000 AND (task.task_id IS NULL OR task.is_group_flag=1)' 0 'Timesheet tasks belong to same tenant and project'
        Assert-Scalar 'SELECT COUNT(*) FROM cloud_flow_db.oa_project_task WHERE task_id>=1000000 AND tenant_id BETWEEN 100000 AND 100049 AND (opening_actual_hours<>0 OR actual_hours<>0)' 0 'New demo tasks have no fabricated historical or approved hours'
        Assert-Scalar 'SELECT COUNT(*) FROM cloud_flow_db.oa_supplier_quotation quote JOIN cloud_flow_db.oa_supplier_quotation_item item ON item.quotation_id=quote.quotation_id AND item.tenant_id=quote.tenant_id WHERE quote.quotation_id>=1000000 AND (quote.total_amount<>item.line_amount+ROUND(item.line_amount*item.tax_rate,2) OR quote.tax_amount<>ROUND(item.line_amount*item.tax_rate,2))' 0 'Demo quotation gross and tax amounts agree'
        Assert-Scalar "SELECT COUNT(*) FROM cloud_flow_db.oa_purchase_rfq_supplier WHERE rfq_supplier_id>=1000000 AND invite_channel<>'OFFLINE'" 0 'Demo invitations remain offline'
        Write-Output 'PASS: isolated 01-07 OA database acceptance'
    }
    if ($PortalFinanceChecks) {
        Assert-Scalar "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='cloud_flow_db' AND table_type='BASE TABLE'" 374 'Complete approved schema table count'
        Assert-Scalar "SELECT COUNT(*) FROM information_schema.columns WHERE table_schema='cloud_flow_db' AND table_name IN ('crm_receivable','oa_invoice') AND column_name IN ('portal_public_version','portal_published_by','portal_published_time','portal_file_ids')" 8 'Eight approved finance publication columns'
        Assert-Scalar "SELECT COUNT(*) FROM information_schema.table_constraints WHERE constraint_schema='cloud_flow_db' AND constraint_name IN ('chk_crm_receivable_portal_publication','chk_oa_invoice_portal_publication') AND enforced='YES'" 2 'Both finance publication constraints enforced'
        Assert-Scalar "SELECT COUNT(DISTINCT index_name) FROM information_schema.statistics WHERE table_schema='cloud_flow_db' AND index_name IN ('idx_crm_receivable_portal','idx_oa_invoice_portal')" 2 'Both finance portal indexes installed'
        Assert-Scalar "SELECT COUNT(*) FROM cloud_flow_db.sys_menu WHERE menu_id=1916 AND parent_id=803 AND menu_type='F' AND visible='1' AND status='0' AND perms='crm:portal-finance:manage'" 1 'One hidden enabled finance publication permission'
        Assert-Scalar 'SELECT COUNT(*) FROM cloud_flow_db.sys_role_menu WHERE tenant_id=100000 AND menu_id=1916 AND role_id IN(1,3)' 2 'Only intended administrator and finance grants exist'
        Assert-Scalar "SELECT COUNT(*) FROM cloud_flow_db.sys_role_menu grant_row LEFT JOIN cloud_flow_db.sys_role role ON role.tenant_id=grant_row.tenant_id AND role.role_id=grant_row.role_id WHERE grant_row.menu_id=1916 AND (role.role_key IS NULL OR role.role_key NOT IN ('admin','finance'))" 0 'All tenants restrict finance publication to administrator and finance roles'
        $Rejected=0
        foreach($Spec in @(@{Table='crm_receivable';Id='receivable_id';Amount='planned_amount';Maximum='99999999999999.99'},@{Table='oa_invoice';Id='invoice_id';Amount='gross_amount';Maximum='9999999999999999.99'})) {
            $Table=$Spec.Table; $Id=$Spec.Id
            Assert-Scalar "SELECT COUNT(*) FROM cloud_flow_db.$Table WHERE portal_public_version IS NOT NULL OR portal_published_by IS NOT NULL OR portal_published_time IS NOT NULL OR portal_file_ids IS NOT NULL" 0 "$Table defaults and demo records remain private"
            $Row=(& $Client @ClientArguments "--execute=SELECT MIN($Id) FROM cloud_flow_db.$Table WHERE $Id>=1000000").Trim()
            if($LASTEXITCODE -ne 0 -or $Row -notmatch '^[1-9][0-9]*$'){throw 'Isolated demo source required'}
            $Columns=@('portal_public_version','portal_published_by','portal_published_time','portal_file_ids')
            $Values=@('0','1','NOW()','JSON_ARRAY()')
            $Invalid=@(for($Mask=1;$Mask -lt 15;$Mask++){
                (@(for($Index=0;$Index -lt 4;$Index++){"$($Columns[$Index])=$(if($Mask -band (1 -shl $Index)){$Values[$Index]}else{'NULL'})"}) -join ',')
            })
            $Invalid+=@("portal_public_version=-1,portal_published_by=1,portal_published_time=NOW(),portal_file_ids=JSON_ARRAY()",
                "portal_public_version=1,portal_published_by=1,portal_published_time=NOW(),portal_file_ids=JSON_ARRAY()",
                "portal_public_version=0,portal_published_by=1,portal_published_time=NOW(),portal_file_ids=JSON_OBJECT()")
            foreach($Assignment in $Invalid){
                $Result=& $Client @ClientArguments "--execute=START TRANSACTION; UPDATE cloud_flow_db.$Table SET version=0,$Assignment WHERE $Id=$Row; ROLLBACK;" 2>&1
                if($LASTEXITCODE -eq 0 -or ($Result -join "`n") -notmatch 'ERROR 3819'){throw 'Publication CHECK failed to reject invalid state'}
                $Rejected++
            }
            Assert-Scalar "START TRANSACTION; UPDATE cloud_flow_db.$Table SET version=1,portal_public_version=1,portal_published_by=1,portal_published_time=NOW(),portal_file_ids=JSON_ARRAY() WHERE $Id=$Row; SELECT COUNT(*) FROM cloud_flow_db.$Table WHERE $Id=$Row AND portal_public_version=version; ROLLBACK;" 1 "$Table complete publication accepted"
            Assert-Scalar "START TRANSACTION; UPDATE cloud_flow_db.$Table SET version=1,portal_public_version=1,portal_published_by=1,portal_published_time=NOW(),portal_file_ids=JSON_ARRAY() WHERE $Id=$Row; UPDATE cloud_flow_db.$Table SET version=version+1 WHERE $Id=$Row; SELECT COUNT(*) FROM cloud_flow_db.$Table WHERE $Id=$Row AND portal_public_version=version; ROLLBACK;" 0 "$Table business version change invalidates publication"
            $Amount=& $Client @ClientArguments "--execute=START TRANSACTION; UPDATE cloud_flow_db.$Table SET $($Spec.Amount)=$($Spec.Maximum) WHERE $Id=$Row; SELECT CAST($($Spec.Amount) AS CHAR) FROM cloud_flow_db.$Table WHERE $Id=$Row; ROLLBACK;"
            if($LASTEXITCODE -ne 0 -or $Amount.Trim() -cne $Spec.Maximum){throw 'Original exact decimal precision changed'}
            Write-Output "PASS: $Table original exact decimal maximum preserved"
        }
        Write-Output "H3_PORTAL_FINANCE_SCHEMA: approved_columns=8; enforced_constraints=2; indexes=2; invalid_states_rejected=$Rejected; menu=1916; roles=1,3; employee_new_grants=0; demo_private=true; runtime_database_modified=false"
    }
    if (-not $SkipBehavior) {
        & (Join-Path $PSScriptRoot 'verify-batch-f.ps1') -SkipBuild:$SkipBuild -MeetingChecks:$MeetingChecks -AssetPerformance:$AssetPerformance -SupplierChecks:$SupplierChecks -SupplierResultPath $SupplierResultPath -ProjectPersistenceChecks:$ProjectPersistenceChecks -ProjectResultPath $ProjectResultPath -RfqChecks:$RfqChecks -RfqResultPath $RfqResultPath -JdbcUrl "jdbc:mysql://127.0.0.1:$Port/cloud_flow_db?useSSL=false&allowPublicKeyRetrieval=true&serverTimezone=Asia/Shanghai"
        if ($LASTEXITCODE -ne 0) { throw 'OA service/database checks failed' }
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
