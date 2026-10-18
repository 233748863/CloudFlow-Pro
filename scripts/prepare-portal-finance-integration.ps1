param([ValidatePattern('^r[1-9][0-9]*$')][string]$Round='r1',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$BuildRound='r3')
$ErrorActionPreference='Stop'
. 'D:\CloudFlowPro\.cloudflow-runtime/use-data-drive.ps1'
$Root='D:\CloudFlowPro'
$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
$Output=Join-Path $Evidence "h3-portal-finance-install-20261002-$Round"
if (Test-Path -LiteralPath $Output) { throw 'Retain existing evidence' }
$BuildLog=Join-Path $Evidence "h3-portal-finance-20261002-backend-$BuildRound.log"
if ([IO.File]::ReadAllText($BuildLog) -notmatch '(?m)^FINANCE_BUILD: phase=Backend; files=\d+; changed=0; exit=0\r?$') { throw 'Successful current backend build required' }
$Inputs=Get-Content -LiteralPath (Join-Path $Evidence "h3-portal-finance-20261002-backend-$BuildRound-inputs.json") -Raw | ConvertFrom-Json
if (@($Inputs | Where-Object { (Get-FileHash -LiteralPath (Join-Path $Root $_.Path) -Algorithm SHA256).Hash -ne $_.Hash }).Count) { throw 'Product source differs from verified build' }
[IO.Directory]::CreateDirectory($Output) | Out-Null
$StatePath=Join-Path $Root '.cloudflow-runtime/batch-g-integration/9799534e1a3a47b5958330f14ae16dc7/state.json'
& (Join-Path $Root 'scripts/inspect-portal-finance-proposal.ps1') -StatePath $StatePath -OutputPath (Join-Path $Evidence "h3-finance-install-preflight-20261002-$Round.json") *> (Join-Path $Output 'preflight.log')
$State=Get-Content -LiteralPath $StatePath -Raw | ConvertFrom-Json
function Invoke-FinanceOwnedSql([string]$Sql) {
    $Info=[Diagnostics.ProcessStartInfo]::new((Get-Command mysql.exe).Source)
    $Info.UseShellExecute=$false; $Info.CreateNoWindow=$true
    $Info.RedirectStandardInput=$true; $Info.RedirectStandardOutput=$true; $Info.RedirectStandardError=$true
    $Info.StandardInputEncoding=[Text.UTF8Encoding]::new($false); $Info.StandardOutputEncoding=[Text.UTF8Encoding]::new($false)
    [void]$Info.Environment.Remove('MYSQL_PWD')
    foreach ($Argument in @('--no-defaults','--protocol=TCP','--host=127.0.0.1',"--port=$($State.mysqlPort)",'--user=root','--skip-password','--batch','--raw','--skip-column-names','--default-character-set=utf8mb4','cloud_flow_db')) { $Info.ArgumentList.Add($Argument) }
    $Child=[Diagnostics.Process]::Start($Info)
    $Out=$Child.StandardOutput.ReadToEndAsync(); $Err=$Child.StandardError.ReadToEndAsync()
    $Child.StandardInput.WriteLine($Sql); $Child.StandardInput.Close()
    if (-not $Child.WaitForExit(120000)) { $Child.Kill(); throw 'Owned finance SQL timed out' }
    if ($Child.ExitCode -ne 0) {
        [IO.File]::WriteAllText((Join-Path $Output ('sql-error-'+[Guid]::NewGuid().ToString('N')+'.log')),$Err.GetAwaiter().GetResult())
        throw 'Owned finance SQL failed; retained diagnostic'
    }
    return $Out.GetAwaiter().GetResult().Trim()
}
$ActualDirectory=[IO.Path]::GetFullPath((Invoke-FinanceOwnedSql 'SELECT @@datadir;')).TrimEnd('\','/')
if ($ActualDirectory -ne (Join-Path $State.run 'mysql-data')) { throw 'Database directory ownership changed' }
$OldGrants=Invoke-FinanceOwnedSql 'SELECT tenant_id,role_id,menu_id FROM sys_role_menu ORDER BY tenant_id,role_id,menu_id;'
$OldEmployee=Invoke-FinanceOwnedSql 'SELECT tenant_id,role_id,menu_id FROM sys_role_menu WHERE role_id=5 ORDER BY tenant_id,role_id,menu_id;'
$OldMenus=Invoke-FinanceOwnedSql 'SELECT COUNT(*) FROM sys_menu;'
$PatchSql=[Text.StringBuilder]::new()
foreach ($Item in @(@{Table='crm_receivable';File='05.cloudflow-crm.sql'},@{Table='oa_invoice';File='04.cloudflow-oa.sql'})) {
    $Source=[IO.File]::ReadAllText((Join-Path $Root "cloudflow-backend/DB/$($Item.File)"))
    $Definition=[regex]::Match($Source,('(?ms)^CREATE TABLE '+$Item.Table+'\s*\(.*?^\).*?;')).Value
    $Columns=@($Definition -split '\r?\n' | Where-Object { $_ -match '^\s*portal_(public_version|published_by|published_time|file_ids)\s+' } | ForEach-Object { 'ADD COLUMN '+$_.Trim().TrimEnd(',') })
    $Keys=@($Definition -split '\r?\n' | Where-Object { $_ -match ('^\s*KEY idx_'+$Item.Table+'_portal\s') } | ForEach-Object { 'ADD '+$_.Trim().TrimEnd(',') })
    $Constraints=@($Definition -split '\r?\n' | Where-Object { $_ -match ('^\s*CONSTRAINT chk_'+$Item.Table+'_portal_publication\s') } | ForEach-Object { 'ADD '+$_.Trim().TrimEnd(',') })
    if ($Columns.Count -ne 4 -or $Keys.Count -ne 1 -or $Constraints.Count -ne 1) { throw 'Approved formal finance structure missing' }
    [void]$PatchSql.AppendLine("ALTER TABLE $($Item.Table) "+(($Columns+$Keys+$Constraints) -join ', ')+ ';')
}
$Seed=[IO.File]::ReadAllText((Join-Path $Root 'cloudflow-backend/DB/06.cloudflow-business-seed.sql'))
$Menu=[regex]::Match($Seed,'(?ms)^CREATE TEMPORARY TABLE h3_finance_publication_guard\b.*?^DROP TEMPORARY TABLE h3_finance_publication_guard;').Value
if (-not $Menu -or $Menu -notmatch "VALUES \(1916," -or $Menu -notmatch 'role.role_id IN \(1,3\)') { throw 'Approved finance menu block required' }
[void]$PatchSql.AppendLine('START TRANSACTION;')
[void]$PatchSql.AppendLine($Menu)
[void]$PatchSql.AppendLine('COMMIT;')
[IO.File]::WriteAllText((Join-Path $Output 'owned-only-install.sql'),$PatchSql.ToString(),[Text.UTF8Encoding]::new($false))
Invoke-FinanceOwnedSql $PatchSql.ToString() | Out-Null
$Counts=Invoke-FinanceOwnedSql @'
SELECT CONCAT_WS(',',(SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=DATABASE() AND table_type='BASE TABLE'),
 (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name IN ('crm_receivable','oa_invoice') AND column_name IN ('portal_public_version','portal_published_by','portal_published_time','portal_file_ids')),
 (SELECT COUNT(*) FROM information_schema.table_constraints WHERE constraint_schema=DATABASE() AND constraint_name IN ('chk_crm_receivable_portal_publication','chk_oa_invoice_portal_publication') AND enforced='YES'),
 (SELECT COUNT(DISTINCT index_name) FROM information_schema.statistics WHERE table_schema=DATABASE() AND index_name IN ('idx_crm_receivable_portal','idx_oa_invoice_portal')));
'@
if ($Counts -ne '374,8,2,2') { throw 'Installed finance structure differs from approval' }
if ((Invoke-FinanceOwnedSql 'SELECT tenant_id,role_id,menu_id FROM sys_role_menu WHERE menu_id<>1916 ORDER BY tenant_id,role_id,menu_id;') -ne $OldGrants) { throw 'Unrelated role grants changed' }
if ((Invoke-FinanceOwnedSql 'SELECT tenant_id,role_id,menu_id FROM sys_role_menu WHERE role_id=5 ORDER BY tenant_id,role_id,menu_id;') -ne $OldEmployee) { throw 'Employee grants changed' }
if ((Invoke-FinanceOwnedSql "SELECT GROUP_CONCAT(role_id ORDER BY role_id) FROM sys_role_menu WHERE tenant_id=100000 AND menu_id=1916;") -ne '1,3') { throw 'Finance permission must be admin and finance only' }
if ([int](Invoke-FinanceOwnedSql 'SELECT COUNT(*) FROM sys_menu;') -ne ([int]$OldMenus+1)) { throw 'Unexpected menu count' }
if ((Invoke-FinanceOwnedSql "SELECT (SELECT COUNT(*) FROM crm_receivable WHERE portal_public_version IS NOT NULL)+(SELECT COUNT(*) FROM oa_invoice WHERE portal_public_version IS NOT NULL);") -ne '0') { throw 'Existing records must remain private' }
'PORTAL_FINANCE_OWNED_INSTALL: tables=374; columns=8; constraints=2; indexes=2; new_menu=1916; grants=admin,finance; employee_changes=0; existing_public_records=0; production_modified=false' | Tee-Object -FilePath (Join-Path $Output 'result.log')
