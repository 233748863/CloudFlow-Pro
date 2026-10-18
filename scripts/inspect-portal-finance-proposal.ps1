param([Parameter(Mandatory=$true)][string]$StatePath, [Parameter(Mandatory=$true)][string]$OutputPath, [switch]$Installed)
$ErrorActionPreference = 'Stop'
. 'D:\CloudFlowPro\.cloudflow-runtime\use-data-drive.ps1'
$Workspace = 'D:\CloudFlowPro'
$StateFile = (Resolve-Path -LiteralPath $StatePath).Path
$RunDirectory = Split-Path -Parent $StateFile
if ((Split-Path -Parent $RunDirectory) -ne (Join-Path $Workspace '.cloudflow-runtime\batch-g-integration') -or (Split-Path -Leaf $RunDirectory) -notmatch '^[a-f0-9]{32}$') { throw 'Owned state required' }
$OutputFile = [IO.Path]::GetFullPath($OutputPath)
if ((Split-Path -Parent $OutputFile) -ne (Join-Path $Workspace '.cloudflow-runtime\full-prd-20260915\approved-runtime') -or (Test-Path -LiteralPath $OutputFile)) { throw 'A new owned evidence path is required' }
foreach ($Candidate in @($StateFile,$RunDirectory,(Split-Path -Parent $OutputFile))) {
    if ((Get-Item -LiteralPath $Candidate).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Redirected path rejected' }
}
$OwnedState = Get-Content -LiteralPath $StateFile -Raw | ConvertFrom-Json
if ($OwnedState.status -ne 'RUNNING' -or [IO.Path]::GetFullPath($OwnedState.run) -ne $RunDirectory) { throw 'Running owned state required' }
$DatabaseDirectory = Join-Path $RunDirectory 'mysql-data'
$Owners = @($OwnedState.processes | Where-Object name -EQ 'mysql')
if ($Owners.Count -ne 1) { throw 'One owned MySQL process required' }
$DatabaseProcess = Get-CimInstance Win32_Process -Filter "ProcessId=$($Owners[0].id)"
if (-not $DatabaseProcess -or $DatabaseProcess.Name -ne 'mysqld.exe' -or -not $DatabaseProcess.CommandLine.Replace('/','\').Contains($DatabaseDirectory)) { throw 'MySQL data directory ownership mismatch' }
$Listeners = @(Get-NetTCPConnection -State Listen -LocalPort $OwnedState.mysqlPort)
if ($Listeners.Count -ne 1 -or $Listeners[0].LocalAddress -ne '127.0.0.1') { throw 'Owned loopback database required' }
$ListeningProcess = Get-CimInstance Win32_Process -Filter "ProcessId=$($Listeners[0].OwningProcess)"
if (-not $ListeningProcess -or $ListeningProcess.Name -ne 'mysqld.exe' -or
    -not $ListeningProcess.CommandLine.Replace('/','\').Contains($DatabaseDirectory) -or
    ($ListeningProcess.ProcessId -ne $DatabaseProcess.ProcessId -and $ListeningProcess.ParentProcessId -ne $DatabaseProcess.ProcessId) -or
    $ListeningProcess.CreationDate -lt $DatabaseProcess.CreationDate) { throw 'MySQL listener must be the owned process or its verified direct child' }
$PreviousPassword = [Environment]::GetEnvironmentVariable('MYSQL_PWD','Process')
[Environment]::SetEnvironmentVariable('MYSQL_PWD',$null,'Process')
try {
    $Query = @'
START TRANSACTION READ ONLY;
SELECT JSON_OBJECT('kind','directory','value',@@datadir);
SELECT JSON_OBJECT('kind','tables','value',COUNT(*)) FROM information_schema.tables WHERE table_schema=DATABASE() AND table_type='BASE TABLE';
SELECT JSON_OBJECT('kind','menuConflict','value',COUNT(*)) FROM sys_menu WHERE menu_id=1916 OR perms='crm:portal-finance:manage';
SELECT JSON_OBJECT('kind','fieldConflict','value',COUNT(*)) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name IN ('crm_receivable','oa_invoice') AND column_name IN ('portal_public_version','portal_published_by','portal_published_time','portal_file_ids');
SELECT JSON_OBJECT('kind','indexConflict','value',COUNT(*)) FROM information_schema.statistics WHERE table_schema=DATABASE() AND ((table_name='crm_receivable' AND index_name='idx_crm_receivable_portal') OR (table_name='oa_invoice' AND index_name='idx_oa_invoice_portal'));
SELECT JSON_OBJECT('kind','constraintConflict','value',COUNT(*)) FROM information_schema.table_constraints WHERE constraint_schema=DATABASE() AND constraint_name IN ('chk_crm_receivable_portal_publication','chk_oa_invoice_portal_publication');
SELECT JSON_OBJECT('kind','currencyColumns','value',COUNT(*)) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name IN ('crm_receivable','oa_invoice') AND column_name LIKE '%currency%';
SELECT JSON_OBJECT('kind','sourceColumn','table',table_name,'column',column_name,'type',column_type,'nullable',is_nullable) FROM information_schema.columns WHERE table_schema=DATABASE() AND ((table_name='crm_receivable' AND column_name IN ('planned_amount','received_amount','outstanding_amount','version')) OR (table_name='oa_invoice' AND column_name IN ('gross_amount','tax_amount','version'))) ORDER BY table_name,ordinal_position;
SELECT JSON_OBJECT('kind','parent','id',menu_id,'type',menu_type,'path',path) FROM sys_menu WHERE menu_id=8;
SELECT JSON_OBJECT('kind','grant','role',rm.role_id,'menu',m.menu_id,'permission',m.perms) FROM sys_role_menu rm JOIN sys_menu m ON m.menu_id=rm.menu_id WHERE rm.tenant_id=100000 AND rm.role_id IN (1,3,5) AND m.menu_id IN (8,216,803,1916) ORDER BY rm.role_id,m.menu_id;
SELECT JSON_OBJECT('kind','publicationColumn','table',table_name,'column',column_name,'type',column_type,'nullable',is_nullable,'default',column_default) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name IN ('crm_receivable','oa_invoice') AND column_name IN ('portal_public_version','portal_published_by','portal_published_time','portal_file_ids') ORDER BY table_name,ordinal_position;
SELECT JSON_OBJECT('kind','publicationIndex','table',table_name,'index',index_name,'columns',GROUP_CONCAT(column_name ORDER BY seq_in_index)) FROM information_schema.statistics WHERE table_schema=DATABASE() AND index_name IN ('idx_crm_receivable_portal','idx_oa_invoice_portal') GROUP BY table_name,index_name;
SELECT JSON_OBJECT('kind','publicationConstraint','name',constraint_name,'enforced',enforced) FROM information_schema.table_constraints WHERE constraint_schema=DATABASE() AND constraint_name IN ('chk_crm_receivable_portal_publication','chk_oa_invoice_portal_publication');
ROLLBACK;
'@
    $Raw = $Query | & mysql.exe --no-defaults --protocol=TCP --host=127.0.0.1 "--port=$($OwnedState.mysqlPort)" --user=root --batch --raw --skip-column-names --default-character-set=utf8mb4 cloud_flow_db 2>&1
    if ($LASTEXITCODE -ne 0) { throw 'Read-only finance preflight failed; raw database output withheld' }
} finally { [Environment]::SetEnvironmentVariable('MYSQL_PWD',$PreviousPassword,'Process') }
$Rows = @($Raw | ForEach-Object { $_ | ConvertFrom-Json })
$ObservedDirectory = [IO.Path]::GetFullPath(($Rows | Where-Object kind -EQ 'directory').value).TrimEnd('\','/')
if ($ObservedDirectory -ne $DatabaseDirectory) { throw 'Actual database directory differs' }
foreach ($Kind in @('menuConflict','fieldConflict','indexConflict','constraintConflict','currencyColumns')) {
    $ExpectedCount=if ($Installed) { @{menuConflict=1;fieldConflict=8;indexConflict=8;constraintConflict=2;currencyColumns=0}[$Kind] } else { 0 }
    if (@($Rows | Where-Object kind -EQ $Kind).Count -ne 1 -or ($Rows | Where-Object kind -EQ $Kind).value -ne $ExpectedCount) { throw "Preflight mismatch: $Kind" }
}
if ($Installed) {
    $Columns=@($Rows | Where-Object kind -EQ publicationColumn)
    foreach ($Column in $Columns) {
        $ExpectedType=@{portal_public_version='int';portal_published_by='bigint';portal_published_time='datetime';portal_file_ids='json'}[$Column.column]
        if ($Column.type -ne $ExpectedType -or $Column.nullable -ne 'YES' -or $null -ne $Column.default) { throw 'Installed finance column differs from approval' }
    }
    if ($Columns.Count -ne 8 -or @($Rows | Where-Object { $_.kind -eq 'publicationConstraint' -and $_.enforced -eq 'YES' }).Count -ne 2) { throw 'Installed finance constraints missing' }
    foreach ($Index in @($Rows | Where-Object kind -EQ publicationIndex)) {
        $ExpectedColumns=if ($Index.table -eq 'crm_receivable') { 'tenant_id,customer_id,deleted,receivable_id' } else { 'tenant_id,customer_id,deleted,invoice_id' }
        if ($Index.columns -ne $ExpectedColumns) { throw 'Installed finance index differs from approval' }
    }
    $Grants=@($Rows | Where-Object { $_.kind -eq 'grant' -and $_.menu -eq 1916 })
    if (($Grants.role -join ',') -ne '1,3' -or @($Grants | Where-Object permission -NE 'crm:portal-finance:manage').Count) { throw 'Installed finance grants differ from approval' }
}
if (($Rows | Where-Object kind -EQ 'tables').value -ne 374) { throw 'Current approved schema expected' }
if (($Rows | Where-Object kind -EQ 'parent').type -ne 'M') { throw 'CRM directory parent required' }
$SourcePaths = @('cloudflow-backend/DB/04.cloudflow-oa.sql','cloudflow-backend/DB/05.cloudflow-crm.sql','cloudflow-backend/DB/06.cloudflow-business-seed.sql','docs/design/H-G剩余设计菜单清单.json')
$Sources = @($SourcePaths | ForEach-Object { [pscustomobject]@{ Path=$_; Hash=(Get-FileHash -LiteralPath (Join-Path $Workspace $_) -Algorithm SHA256).Hash } })
[pscustomobject]@{ CreatedAt=[DateTime]::UtcNow.ToString('o'); Rows=@($Rows | Where-Object kind -NE 'directory'); Sources=$Sources; ReadOnly=$true; DatabaseWrites=0; ProductionModified=$false } | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $OutputFile -Encoding utf8
if ($Installed) { Write-Output 'PORTAL_FINANCE_INSTALLED_PREFLIGHT: tables=374; menu=1916; columns=8; indexes=2; enforced_constraints=2; admin_finance_grants=2; employee_grants=0; database_writes=0; production_modified=false' }
else { Write-Output 'PORTAL_FINANCE_PREFLIGHT: tables=374; menu_1916_conflicts=0; proposed_field_conflicts=0; proposed_index_conflicts=0; proposed_constraint_conflicts=0; currency_columns=0; database_writes=0; production_modified=false' }
