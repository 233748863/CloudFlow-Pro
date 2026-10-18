param([ValidatePattern('^r[1-9][0-9]*$')][string]$HttpRound = 'r2')
$ErrorActionPreference = 'Stop'
. 'D:\CloudFlowPro\.cloudflow-runtime\use-data-drive.ps1'
$Root = 'D:\CloudFlowPro'
$Evidence = Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
$Prefix = 'h5-import-capacity-20261002'
$Verified = [Collections.Generic.HashSet[int]]::new()
function Require-Evidence([int[]]$Items, [string]$File, [string[]]$Patterns) {
    $Content = [IO.File]::ReadAllText((Join-Path $Evidence $File))
    foreach ($Pattern in $Patterns) { if ($Content -notmatch $Pattern) { throw "Missing evidence: $File; pattern=$Pattern" } }
    foreach ($Item in $Items) { [void]$Verified.Add($Item) }
    "IMPORT_CAPACITY_CHECKLIST_EVIDENCE: items=$($Items -join ','); file=$File; markers_present=true"
}
Require-Evidence @(1) "$Prefix-install-r1.log" @('BUILD SUCCESS','\[static-rules\] no findings','BACKEND_INPUTS: files=3777; changes=0; exit=0')
$Build = [IO.File]::ReadAllText((Join-Path $Evidence "$Prefix-install-r1.log"))
if ([regex]::Matches($Build, '(?m)^\[INFO\] .+\.{2,}\s+SUCCESS\s+\[').Count -ne 29) { throw 'Complete 29-module build required' }
Require-Evidence @(2,3) 'h2-asset-reminder-frontend-20261001-r2.log' @('> tsc --noEmit','built in ','FRONTEND_INPUTS: files=1469; changes=0; exit=0')
Require-Evidence @(4) 'h2-settlement-reversal-final-netting-db-20261001-r1.log' @('file=01.cloudflow-common.sql; exit=0','file=06.cloudflow-business-seed.sql; exit=0','expected=374; actual=374')
Require-Evidence @(5,6) 'h5-storage-proxy-20261002-menu-r1.log' @('expected=884; actual=884; missing=0; unexpected=0','EMPLOYEE_UNEXPECTED_GRANTS=0; EMPLOYEE_UNEXPECTED_WRITE_PERMISSIONS=0','APPROVED_MENU_SCOPE_PASS=true')
Require-Evidence @(7,9,10) "$Prefix-source-r2.log" @('JAVA_SQL_CONCAT: matches=0','MP_SQL_LAST_APPLY: matches=0','MYBATIS_ANNOTATION_SQL: matches=0')
Require-Evidence @(8,11,13) 'h2-asset-reminder-source-20261001-r2.log' @('login_only_external_endpoints=0','JAVA_PERMISSION_PREFIXES:.*invalid=0','FRONTEND_PERMISSION_LITERALS:.*invalid=0','STATIC_WHITELIST: entries=9; unique_locations=4; stale_lines=0','EXIT_CODE=0')
Require-Evidence @(12) 'h2-asset-reminder-configuration-20261001-r1.log' @('encrypted_fields=3; verified_decryptions=3; plaintext_fields=0; http_secret_leaks=0; external_send_requests=0','CONFIGURATION_LOG_SCAN: files=333;.*leaks=0')
Require-Evidence @(14) 'h2-settlement-reversal-demo-seed-20261001-r2.log' @('DEMO_REGENERATED_MATCHES_FORMAL=True','formal_modified=false')
Require-Evidence @() 'h5-storage-proxy-20261002-form-r1.log' @('WORKFLOW_FILE_UPLOAD_FAILURES: cases=12; checks=36','PASS C current-source form checks')
Require-Evidence @() 'h5-storage-proxy-20261002-meeting-db-r4.log' @('MEETING_H4_PHOTO_DATABASE: assertions=','MEETING_H4_DATABASE: assertions=\d+; failed=0','Isolated MySQL stopped','Temporary data removed')
Require-Evidence @() "$Prefix-java-types-r1.log" @('JAVA_EXPLICIT_TYPES_SELFTEST: passed=14; failed=0','files=3633; inferred_declarations=0')
Require-Evidence @() 'h5-storage-proxy-20261002-contracts-r1.log' @('通过 42，失败 0，待同步 0')
Require-Evidence @() "h5-package-current-storage-import-20261001-$HttpRound.log" @('failed=0; requests=','"storageImportFiles":true','"storageImportFilesCleanup":true','"storageRollback":true','"storageCleanup":true','"secrets":true','"cleanup":true','H5_TENANT_PACKAGE_SECRET_SCAN:.*leaks=0','PACKAGE_OPERATOR_INPUTS: files=13; changed=0')
Require-Evidence @() "$Prefix-checks-r2.log" @('IMPORT_CAPACITY_FAILURES: remote_cases=12; local_cases=4; checks=','IMPORT_CAPACITY_SUITE: groups=4; failed=0')
Require-Evidence @() "$Prefix-runtime-refresh-r1.log" @('IMPORT_CAPACITY_RUNTIME_REFRESH: services=5; configuration_and_arguments_changed=0')
Require-Evidence @() 'h5-storage-proxy-20261002-checklist-r1.log' @('H5_STORAGE_PROXY_CHECKLIST: items=14; missing=0')
Require-Evidence @() 'h5-package-current-storage-bound-20261001-r10.log' @('checks=154; failed=0; requests=219','"storageMeetingPhoto":true','"storageWorkflowFile":true','"storageSeverancePolicy":true')
Require-Evidence @() "h5-package-current-storage-import-restore-20261001-$HttpRound.log" @('PACKAGE_CONFIGURATION_RESTORED: original_bytes=true; service_arguments_unchanged=true; owned_auth_healthy=true','checks=18; failed=0; requests=10')
Push-Location $Root
try {
    $Before = @(Get-Content -LiteralPath (Join-Path $Evidence "$Prefix-backend-inputs-r1.json") -Raw | ConvertFrom-Json)
    $Paths = @(rg --files --hidden --no-ignore cloudflow-backend -g '!**/target/**' -g '!**/.git/**' -g '!**/node_modules/**' -g '!**/.cache/**' -g '!**/*.log' | Sort-Object)
    if (@(Compare-Object @($Before.Path | Sort-Object) $Paths).Count -ne 0 -or @($Before | Where-Object { (Get-FileHash -LiteralPath $_.Path).Hash -ne $_.Hash }).Count -ne 0) { throw 'Current backend differs from build' }
    $Prior = @(Get-Content -LiteralPath (Join-Path $Evidence 'h2-asset-reminder-backend-inputs-20261001-r2.json') -Raw | ConvertFrom-Json)
    $Allowed = @(
        'cloudflow-backend/cloudflow-common/cloudflow-common-data/src/main/java/com/cloudflow/common/tenant/quota/TenantQuotaService.java',
        'cloudflow-backend/cloudflow-service-oa/src/main/java/com/cloudflow/oa/service/impl/OaMeetingRoomPhotoService.java',
        'cloudflow-backend/cloudflow-service-workflow/src/main/java/com/cloudflow/workflow/service/WorkflowFormFileService.java',
        'cloudflow-backend/cloudflow-common/cloudflow-common-excel/src/main/java/com/cloudflow/common/excel/importing/ImportEngine.java',
        'cloudflow-backend/cloudflow-common/cloudflow-common-excel/src/main/java/com/cloudflow/common/excel/importing/RemoteImportFileStore.java')
    $Changed = @($Prior | Where-Object { (Get-FileHash -LiteralPath $_.Path).Hash -ne $_.Hash })
    if ($Changed.Count -ne 5 -or @($Changed | Where-Object { $_.Path.Replace('\','/') -notin $Allowed }).Count -ne 0) { throw 'Unreviewed baseline changes prevent permission and configuration evidence reuse' }
    $Added = @($Before | Where-Object { $_.Path -notin $Prior.Path })
    if ($Added.Count -ne 1 -or $Added[0].Path.Replace('\','/') -ne 'cloudflow-backend/cloudflow-common/cloudflow-common-core/src/main/java/com/cloudflow/common/core/exception/StorageCapacityError.java') { throw 'Unexpected added backend input' }
    $ProxyInputs = @(Get-Content -LiteralPath (Join-Path $Evidence 'h5-storage-proxy-20261002-backend-inputs-r1.json') -Raw | ConvertFrom-Json)
    $ImportOnly = @($Allowed | Where-Object { $_ -match '/importing/' })
    $SinceProxy = @($ProxyInputs | Where-Object { (Get-FileHash -LiteralPath $_.Path).Hash -ne $_.Hash })
    if ($SinceProxy.Count -ne 2 -or @($SinceProxy | Where-Object { $_.Path.Replace('\','/') -notin $ImportOnly }).Count) { throw 'Photo/workflow/policy backend evidence no longer matches' }
    $ProxyScripts = @(Get-Content -LiteralPath (Join-Path $Evidence 'h5-package-current-storage-bound-inputs-20261001-r10.json') -Raw | ConvertFrom-Json | Where-Object { $_.Path -match 'verify-tenant-package-(meeting-photo|workflow-file|severance-policy)\.mjs$' })
    if ($ProxyScripts.Count -ne 3 -or @($ProxyScripts | Where-Object { (Get-FileHash -LiteralPath $_.Path).Hash -ne $_.Hash }).Count) { throw 'Prior three attachment scripts changed' }
    $Frontend = @(Get-Content -LiteralPath (Join-Path $Evidence 'h2-asset-reminder-frontend-inputs-20261001-r2.json') -Raw | ConvertFrom-Json)
    $FrontendPaths = @(rg --files --hidden --no-ignore cloudflow-frontend -g '!**/node_modules/**' -g '!**/dist/**' -g '!**/.git/**' -g '!**/target/**' -g '!**/.cache/**' -g '!**/.vite/**' -g '!**/.tmp/**' -g '!**/.codex-logs/**' -g '!**/*.log' -g '!**/*.tsbuildinfo' | Sort-Object)
    if (@(Compare-Object @($Frontend.Path | Sort-Object) $FrontendPaths).Count -ne 0 -or @($Frontend | Where-Object { (Get-FileHash -LiteralPath $_.Path).Hash -ne $_.Hash }).Count -ne 0) { throw 'Frontend evidence no longer matches' }
    $Sql = @(Get-Content -LiteralPath (Join-Path $Evidence 'h2-settlement-reversal-final-inputs-20261001-r1.json') -Raw | ConvertFrom-Json | Where-Object { $_.Path -match '[\\/]DB[\\/]' })
    if ($Sql.Count -ne 8 -or @($Sql | Where-Object { (Get-FileHash -LiteralPath $_.Path).Hash -ne $_.Hash }).Count -ne 0) { throw 'SQL evidence no longer matches' }
    $HttpInputs = @(Get-Content -LiteralPath (Join-Path $Evidence "h5-package-current-storage-import-inputs-20261001-$HttpRound.json") -Raw | ConvertFrom-Json)
    $CheckInputs = @(Get-Content -LiteralPath (Join-Path $Evidence "$Prefix-verification-inputs-r2.json") -Raw | ConvertFrom-Json)
    if ($CheckInputs.Count -ne 4 -or @($CheckInputs | Where-Object { (Get-FileHash -LiteralPath $_.Path).Hash -ne $_.Hash }).Count) { throw 'Import checks changed since verification' }
    if ($HttpInputs.Count -ne 13 -or @($HttpInputs | Where-Object { (Get-FileHash -LiteralPath $_.Path).Hash -ne $_.Hash }).Count -ne 0) { throw 'HTTP script evidence no longer matches' }
    'IMPORT_CAPACITY_CURRENT_INPUTS: backend=3777; frontend=1469; sql=8; http_scripts=13; changed_since_verification=0; modified_backend_files=5; added_backend_files=1; controllers_poms_sql_frontend_unchanged=true'
} finally { Pop-Location }
if ($Verified.Count -ne 14) { throw 'All 14 checklist items required' }
'H5_IMPORT_CAPACITY_CHECKLIST: items=14; missing=0; backend_modules=29; complete_35_prd=false; production_modified=false'
