param([Parameter(Mandatory = $true)][string]$StatePath)

$ErrorActionPreference = 'Stop'
$Root = [IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
$Runtime = Join-Path $Root '.cloudflow-runtime/batch-g-integration'
$StateFile = (Resolve-Path -LiteralPath $StatePath).Path
$Directory = Split-Path -Parent $StateFile
if ((Split-Path -Parent $Directory) -ne $Runtime -or (Split-Path -Leaf $Directory) -notmatch '^[a-f0-9]{32}$' -or (Split-Path -Leaf $StateFile) -ne 'state.json') { throw 'Owned isolated state required' }
foreach ($Candidate in @($Runtime,$Directory,$StateFile)) {
    if ((Get-Item -LiteralPath $Candidate).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Redirected isolated path rejected' }
}
$State = Get-Content -LiteralPath $StateFile -Raw | ConvertFrom-Json
if ($State.status -ne 'RUNNING' -or [IO.Path]::GetFullPath($State.run) -ne $Directory -or $State.mysqlPort -lt 1024 -or $State.mysqlPort -gt 65535) { throw 'Invalid isolated state' }
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
    foreach ($Argument in @('--no-defaults','--protocol=TCP','--host=127.0.0.1',"--port=$($State.mysqlPort)",'--user=root','--batch','--raw','--skip-column-names','--default-character-set=utf8mb4','cloud_flow_db')) { $Info.ArgumentList.Add($Argument) }
    $Child = [Diagnostics.Process]::Start($Info)
    $Output = $Child.StandardOutput.ReadToEndAsync()
    $ErrorOutput = $Child.StandardError.ReadToEndAsync()
    $Child.StandardInput.WriteLine($Sql)
    $Child.StandardInput.Close()
    if (-not $Child.WaitForExit(120000)) { $Child.Kill(); throw 'Owned SQL client timed out' }
    if ($Child.ExitCode -ne 0) { throw $ErrorOutput.GetAwaiter().GetResult() }
    return $Output.GetAwaiter().GetResult().Trim()
}

$ActualData = Invoke-OwnedSql 'SELECT @@datadir;'
if ([IO.Path]::GetFullPath($ActualData).TrimEnd('\','/') -ne [IO.Path]::GetFullPath((Join-Path $Directory 'mysql-data')).TrimEnd('\','/')) { throw 'Owned database directory required' }
$Count = [int](Invoke-OwnedSql "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='cloud_flow_db' AND table_type='BASE TABLE';")
if ($Count -notin @(327,330)) { throw "Expected isolated H4 or E5 schema; tables=$Count" }
$RoleSnapshotSql = "SET SESSION group_concat_max_len=8388608; SELECT SHA2(GROUP_CONCAT(CONCAT_WS(':',tenant_id,role_id,menu_id) ORDER BY tenant_id,role_id,menu_id SEPARATOR ','),256) FROM sys_role_menu;"
$RolesBefore = Invoke-OwnedSql $RoleSnapshotSql
$CampaignRows = Invoke-OwnedSql 'SELECT COUNT(*) FROM crm_campaign;'
$MailRows = Invoke-OwnedSql 'SELECT COUNT(*) FROM crm_mass_email;'
$MenuPermission = Invoke-OwnedSql 'SELECT perms FROM sys_menu WHERE menu_id=1615;'
if ($MenuPermission -ne 'crm:campaign:send') { throw 'Expected approved existing marketing permission at menu 1615' }
$Conflict = Invoke-OwnedSql "SELECT (SELECT COUNT(*) FROM sys_job WHERE job_id=1555 AND (service_name<>'crm' OR handler_name<>'crmMassEmailDispatch')) + (SELECT COUNT(*) FROM sys_job_handler WHERE handler_id=1555 AND (service_name<>'crm' OR handler_name<>'crmMassEmailDispatch'));"
if ($Conflict -ne '0') { throw 'Marketing job identifier conflict' }
Write-Output "E5_RUNTIME_CONFLICTS: new_job_identifiers=$Conflict; existing_menu_1615=crm:campaign:send; new_menu_ids=0"
$Proposal = [IO.File]::ReadAllText((Join-Path $Root 'docs/design/外部接入与可靠投递提案DDL.sql'))
$NewTables = @('crm_mass_email_recipient','crm_email_tracking_link','crm_email_suppression')
$Existing = [int](Invoke-OwnedSql "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='cloud_flow_db' AND table_name IN ('crm_mass_email_recipient','crm_email_tracking_link','crm_email_suppression');")
if ($Count -eq 327) {
    if ($Existing -ne 0) { throw 'Partially applied CRM email schema requires inspection' }
    foreach ($Table in $NewTables) {
        $Definition = [regex]::Match($Proposal, '(?ms)^CREATE TABLE ' + [regex]::Escape($Table) + '\s*\(.*?^\) ENGINE=.*?;')
        if (-not $Definition.Success) { throw "Approved definition missing: $Table" }
        Invoke-OwnedSql $Definition.Value | Out-Null
    }
    foreach ($Table in @('crm_campaign_log','crm_mass_email')) {
        $Definition = [regex]::Match($Proposal, '(?ms)^ALTER TABLE ' + [regex]::Escape($Table) + '\b.*?;')
        if (-not $Definition.Success) { throw "Approved alteration missing: $Table" }
        Invoke-OwnedSql $Definition.Value | Out-Null
    }
} elseif ($Existing -ne 3) { throw 'E5 schema lacks approved tables' }
$Columns = Invoke-OwnedSql "SELECT COUNT(*) FROM information_schema.columns WHERE table_schema='cloud_flow_db' AND ((table_name='crm_campaign_log' AND column_name='source_event_key') OR (table_name='crm_mass_email' AND column_name IN ('recipient_snapshot_time','delivery_summary')));"
if ($Columns -ne '3') { throw 'Approved CRM email columns missing' }
$Seed = [IO.File]::ReadAllText((Join-Path $Root 'cloudflow-backend/DB/06.cloudflow-business-seed.sql'))
$Jobs = @([regex]::Matches($Seed, '(?ms)^INSERT IGNORE INTO cloud_flow_db\.sys_job(?:_handler)?\s*\(.*?;') | Where-Object { $_.Value.Contains("'crmMassEmailDispatch'") })
if ($Jobs.Count -ne 2) { throw 'Approved CRM job registrations missing' }
foreach ($Registration in $Jobs) { Invoke-OwnedSql $Registration.Value | Out-Null }
Invoke-OwnedSql "UPDATE sys_job SET job_name='营销邮件真实效果日志对账',status='ENABLED',trigger_type='FIXED_DELAY',cron_expression=NULL,interval_ms=300000,misfire_strategy='FIRE_ONCE',version=version+1 WHERE job_id=1554 AND service_name='crm' AND handler_name='crmCampaignCountAggregate';" | Out-Null
Invoke-OwnedSql "UPDATE sys_menu SET menu_name='营销活动-邮件发送' WHERE menu_id=1615 AND perms='crm:campaign:send';" | Out-Null
$Defaults = [regex]::Match($Seed, '(?s)-- crm-marketing-email-defaults:start.*?-- crm-marketing-email-defaults:end')
if (-not $Defaults.Success) { throw 'Approved marketing defaults missing' }
Invoke-OwnedSql $Defaults.Value | Out-Null
if ((Invoke-OwnedSql $RoleSnapshotSql) -ne $RolesBefore) { throw 'Unexpected role permission changes' }
if ((Invoke-OwnedSql 'SELECT COUNT(*) FROM crm_campaign;') -ne $CampaignRows -or (Invoke-OwnedSql 'SELECT COUNT(*) FROM crm_mass_email;') -ne $MailRows) { throw 'Existing campaign or task rows changed during isolated preparation' }
$Count = Invoke-OwnedSql "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='cloud_flow_db' AND table_type='BASE TABLE';"
if ($Count -ne '330') { throw 'Isolated E5 schema table count mismatch' }
Write-Output "E5_RUNTIME_PREPARED: tables=$Count; approved_new_tables=3; approved_new_columns=$Columns; role_grants_changed=0; existing_campaign_rows=$CampaignRows; existing_mail_rows=$MailRows; production_modified=false"
