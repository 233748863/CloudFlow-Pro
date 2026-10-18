param([Parameter(Mandatory = $true)][string]$StatePath, [switch]$CheckOnly)

$ErrorActionPreference = 'Stop'
$Root = [IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
if ([IO.Path]::GetPathRoot($Root) -eq ($env:SystemDrive + '\')) { throw 'Refund preparation requires a data drive' }
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
$Listener = Get-CimInstance Win32_Process -Filter "ProcessId = $($Listeners[0].OwningProcess)"
if (-not $Listener -or $Listener.Name -ne 'mysqld.exe' -or -not $Listener.CommandLine.Contains($Data) -or ($Listener.ProcessId -ne $Owned[0].id -and $Listener.ParentProcessId -ne $Owned[0].id)) { throw 'MySQL listener ownership mismatch' }
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
    if (-not $Child.WaitForExit(30000)) { $Child.Kill(); throw 'Owned SQL client timed out' }
    if ($Child.ExitCode -ne 0) { throw $ErrorOutput.GetAwaiter().GetResult() }
    return $Output.GetAwaiter().GetResult().Trim()
}
if ([IO.Path]::GetFullPath((Invoke-OwnedSql 'SELECT @@datadir;')).TrimEnd('\', '/') -ne $Data.TrimEnd('\', '/')) { throw 'Database directory is not owned' }
if ((Invoke-OwnedSql "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='cloud_flow_db' AND table_type='BASE TABLE';") -ne '338') { throw 'Refund preparation expects 338 approved physical tables' }
$Seed = [IO.File]::ReadAllText((Join-Path $Root 'cloudflow-backend/DB/06.cloudflow-business-seed.sql'))
$Model = [regex]::Match($Seed, "(?s)\('crm_refund_review',100000,'原收款退款双级审批','crm_refund_review',1,'PUBLISHED',1,'ALL','\[\]','(?<model>\{.*?\})','seed',NOW\(\)\);").Groups['model'].Value
if (-not $Model) { throw 'Exact approved refund model seed missing' }
$ModelHex = [Convert]::ToHexString([Text.Encoding]::UTF8.GetBytes($Model))
$ModelSql = "CONVERT(UNHEX('$ModelHex') USING utf8mb4)"
$Existing = Invoke-OwnedSql "SELECT COUNT(*) FROM wf_process_definition WHERE tenant_id=100000 AND process_key='crm_refund_review' AND process_name NOT IN ('H3退款隔离测试流程','原收款退款双级审批');"
if ($Existing -ne '0') { throw 'Unknown refund definition requires review; no data changed' }
$Formal = Invoke-OwnedSql "SELECT COUNT(*) FROM wf_process_definition WHERE definition_id='crm_refund_review';"
if ($Formal -ne '0' -and ($Formal -ne '1' -or (Invoke-OwnedSql "SELECT COUNT(*) FROM wf_process_definition WHERE tenant_id=100000 AND definition_id='crm_refund_review' AND process_key='crm_refund_review' AND process_name='原收款退款双级审批' AND status='PUBLISHED' AND deleted=0 AND COALESCE(is_archived,0)=0 AND model_json=CAST($ModelSql AS JSON);") -ne '1')) { throw 'Existing formal refund definition differs from approved seed' }
if ($CheckOnly) { Write-Output "H3_REFUND_PRECHECK: tables=338; existing_formal=$Formal; loopback_only=true; database_writes=0; production_modified=false"; exit 0 }
$GrantsSql = "SET SESSION group_concat_max_len=8388608; SELECT SHA2(GROUP_CONCAT(CONCAT_WS(':',tenant_id,role_id,menu_id) ORDER BY tenant_id,role_id,menu_id SEPARATOR ','),256) FROM sys_role_menu;"
$GrantsBefore = Invoke-OwnedSql $GrantsSql
$OldModelsSql = "SET SESSION group_concat_max_len=8388608; SELECT COALESCE(SHA2(GROUP_CONCAT(CONCAT_WS(':',definition_id,version,status,model_json) ORDER BY definition_id SEPARATOR ','),256),'none') FROM wf_process_definition WHERE tenant_id=100000 AND process_key='crm_refund_review' AND definition_id<>'crm_refund_review';"
$OldModelsBefore = Invoke-OwnedSql $OldModelsSql
if ($Formal -eq '0') {
    $Version = Invoke-OwnedSql "SELECT COALESCE(MAX(version),0)+1 FROM wf_process_definition WHERE tenant_id=100000 AND process_key='crm_refund_review';"
    if ($Version -notmatch '^[1-9][0-9]*$' -or [long]$Version -gt [int]::MaxValue) { throw 'Invalid next isolated refund version' }
    Invoke-OwnedSql "INSERT INTO wf_process_definition (definition_id,tenant_id,process_name,process_key,version,status,is_latest,start_permission_type,start_permission_value,model_json,create_by,create_time) VALUES ('crm_refund_review',100000,'原收款退款双级审批','crm_refund_review',$Version,'PUBLISHED',1,'ALL','[]',$ModelSql,'seed',NOW());" | Out-Null
}
$Version = Invoke-OwnedSql "SELECT version FROM wf_process_definition WHERE tenant_id=100000 AND definition_id='crm_refund_review';"
if ((Invoke-OwnedSql $OldModelsSql) -ne $OldModelsBefore) { throw 'Historical refund definitions changed' }
if ((Invoke-OwnedSql $GrantsSql) -ne $GrantsBefore) { throw 'Role menu grants changed during refund preparation' }
if ((Invoke-OwnedSql "SELECT definition_id FROM wf_process_definition WHERE tenant_id=100000 AND process_key='crm_refund_review' AND status='PUBLISHED' AND deleted=0 AND COALESCE(is_archived,0)=0 ORDER BY version DESC LIMIT 1;") -ne 'crm_refund_review') { throw 'Formal refund model is not the effective latest published version' }
Write-Output "H3_REFUND_SCHEMA_READY: tables=338; formal_seed_model=true; isolated_definition_version=$Version; old_models_unchanged=true; menu_grants_changed=0; production_modified=false"
