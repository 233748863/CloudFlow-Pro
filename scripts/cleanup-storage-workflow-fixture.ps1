param([Parameter(Mandatory=$true)][string]$StatePath,
    [Parameter(Mandatory=$true)][ValidatePattern('^[a-f0-9]{12}$')][string]$CaseTag,
    [Parameter(Mandatory=$true)][string]$OutputPath)
$ErrorActionPreference = 'Stop'
. 'D:\CloudFlowPro\.cloudflow-runtime\use-data-drive.ps1'
$Root = 'D:\CloudFlowPro'
$StateFile = (Resolve-Path -LiteralPath $StatePath).Path
$Run = Split-Path -Parent $StateFile
$Evidence = Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
$Report = [IO.Path]::GetFullPath($OutputPath)
if ((Split-Path -Parent $Run) -ne (Join-Path $Root '.cloudflow-runtime/batch-g-integration') -or
    (Split-Path -Leaf $Run) -notmatch '^[a-f0-9]{32}$' -or (Split-Path -Leaf $StateFile) -ne 'state.json' -or
    (Split-Path -Parent $Report) -ne $Evidence -or (Test-Path $Report)) { throw 'Owned state and new evidence path required' }
foreach ($Candidate in @($StateFile,$Run,$Evidence)) {
    if ((Get-Item -LiteralPath $Candidate).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Redirected fixture rejected' }
}
$State = Get-Content -LiteralPath $StateFile -Raw | ConvertFrom-Json
if ($State.status -ne 'RUNNING' -or [IO.Path]::GetFullPath($State.run) -ne $Run) { throw 'Running owned state required' }
$Data = Join-Path $Run 'mysql-data'
$Owners = @($State.processes | Where-Object name -EQ 'mysql')
if ($Owners.Count -ne 1) { throw 'Unique database owner required' }
$Owner = Get-CimInstance Win32_Process -Filter "ProcessId=$($Owners[0].id)"
$Listeners = @(Get-NetTCPConnection -State Listen -LocalPort $State.mysqlPort)
if (-not $Owner -or $Owner.Name -ne 'mysqld.exe' -or -not $Owner.CommandLine.Replace('/','\').Contains($Data) -or
    $Listeners.Count -ne 1 -or $Listeners[0].LocalAddress -ne '127.0.0.1') { throw 'Owned database required' }
$Listener = Get-CimInstance Win32_Process -Filter "ProcessId=$($Listeners[0].OwningProcess)"
if (-not $Listener -or $Listener.Name -ne 'mysqld.exe' -or -not $Listener.CommandLine.Replace('/','\').Contains($Data) -or
    ($Listener.ProcessId -ne $Owner.ProcessId -and $Listener.ParentProcessId -ne $Owner.ProcessId)) { throw 'Owned listener required' }
function Invoke-FixtureSql([string]$Sql) {
    $PreviousPassword = $env:MYSQL_PWD
    try {
        $env:MYSQL_PWD = $null
        $Output = $Sql | & mysql.exe --no-defaults --protocol=TCP --host=127.0.0.1 "--port=$($State.mysqlPort)" --user=root --batch --raw --skip-column-names --default-character-set=utf8mb4 cloud_flow_db 2>&1
        if ($LASTEXITCODE -ne 0) { throw 'Owned fixture SQL failed; raw output withheld' }
        return @($Output | Where-Object { $_ -is [string] -and $_.StartsWith('{') } | ConvertFrom-Json)
    } finally { $env:MYSQL_PWD = $PreviousPassword }
}
$Marker = "h5_capacity_$CaseTag"
$Before = @(Invoke-FixtureSql "START TRANSACTION READ ONLY; SELECT JSON_OBJECT('definitionId',definition_id,'formId',form_id,'status',status,'deleted',deleted) FROM wf_process_definition WHERE tenant_id=100001 AND process_key='$Marker'; ROLLBACK;")
if ($Before.Count -ne 1 -or $Before[0].status -ne 'ARCHIVED' -or $Before[0].deleted -ne 1 -or
    $Before[0].definitionId -notmatch '^[a-f0-9-]{36}$' -or $Before[0].formId -notmatch '^[a-f0-9-]{36}$') { throw 'Exactly one archived and logically deleted owned fixture required' }
$Definition = $Before[0].definitionId
$Form = $Before[0].formId
$Result = @(Invoke-FixtureSql @"
START TRANSACTION;
SELECT definition_id FROM wf_process_definition WHERE tenant_id=100001 AND definition_id='$Definition' AND process_key='$Marker' FOR UPDATE;
SELECT id FROM wf_form_definition WHERE tenant_id=100001 AND form_id='$Form' AND form_key='$Marker' FOR UPDATE;
SET @fixture_ok=(SELECT COUNT(*)=1 FROM wf_process_definition WHERE tenant_id=100001 AND definition_id='$Definition' AND process_key='$Marker' AND form_id='$Form' AND status='ARCHIVED' AND deleted=1)
AND (SELECT COUNT(*)=0 FROM wf_process_instance WHERE definition_id='$Definition')
AND (SELECT COUNT(*)=0 FROM sys_file WHERE tenant_id=100001 AND biz_type='WORKFLOW_FORM' AND biz_id='$Definition')
AND (SELECT COUNT(*)=1 FROM wf_process_definition WHERE form_id='$Form')
AND (SELECT COUNT(*)=1 FROM wf_form_definition WHERE tenant_id=100001 AND form_id='$Form' AND form_key='$Marker');
DELETE FROM wf_form_field_permission WHERE @fixture_ok AND tenant_id=100001 AND definition_id='$Definition';
DELETE FROM wf_process_definition WHERE @fixture_ok AND tenant_id=100001 AND definition_id='$Definition' AND process_key='$Marker' AND deleted=1;
SET @definition_removed=ROW_COUNT();
DELETE FROM wf_form_definition WHERE @fixture_ok AND @definition_removed=1 AND tenant_id=100001 AND form_id='$Form' AND form_key='$Marker';
SELECT JSON_OBJECT('guard',@fixture_ok,'definitionsRemoved',@definition_removed,'formsRemoved',ROW_COUNT(),
'remainingDefinitions',(SELECT COUNT(*) FROM wf_process_definition WHERE definition_id='$Definition'),
'remainingForms',(SELECT COUNT(*) FROM wf_form_definition WHERE form_id='$Form'),
'instances',(SELECT COUNT(*) FROM wf_process_instance WHERE definition_id='$Definition'),
'files',(SELECT COUNT(*) FROM sys_file WHERE tenant_id=100001 AND biz_type='WORKFLOW_FORM' AND biz_id='$Definition'));
COMMIT;
"@)
if ($Result.Count -ne 1 -or $Result[0].guard -ne 1 -or $Result[0].definitionsRemoved -ne 1 -or $Result[0].formsRemoved -ne 1 -or
    $Result[0].remainingDefinitions -ne 0 -or $Result[0].remainingForms -ne 0 -or $Result[0].instances -ne 0 -or $Result[0].files -ne 0) { throw 'Fixture cleanup postcondition failed' }
$RedisCode = @'
import fs from "node:fs";
import { ownedGatewayRedis } from "./scripts/owned-gateway-redis.mjs";
const state = JSON.parse(fs.readFileSync(process.argv[1], "utf8").replace(/^\uFEFF/, ""));
const redis = await ownedGatewayRedis(state);
const key = "workflowFormPermissions::100001:" + process.argv[2];
redis("DEL", key);
if (redis("EXISTS", key) !== "0") throw new Error("Owned permission cache remains");
'@
Push-Location $Root
try { & node --input-type=module -e $RedisCode $StateFile $Definition; if ($LASTEXITCODE -ne 0) { throw 'Owned cache cleanup failed' } }
finally { Pop-Location }
[pscustomobject]@{Before=$Before[0];Result=$Result[0];Marker=$Marker;CacheAbsent=$true;AuditPreserved=$true;ProductionModified=$false} | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $Report -Encoding utf8NoBOM
'WORKFLOW_FIXTURE_CLEANUP: original_status=ARCHIVED; original_deleted=1; definitions=1; forms=1; remaining=0; instances=0; files=0; exact_cache_key_absent=true; production_modified=false'
