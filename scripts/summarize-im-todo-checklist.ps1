param()

$ErrorActionPreference = 'Stop'
. 'D:\CloudFlowPro\.cloudflow-runtime\use-data-drive.ps1'
$Directory = 'D:\CloudFlowPro\.cloudflow-runtime\full-prd-20260915\approved-runtime'
function Show-Evidence([string]$Name, [string]$Pattern) {
    $Lines = @(Get-Content -LiteralPath (Join-Path $Directory $Name) | Where-Object { $_ -match $Pattern })
    if ($Lines.Count -eq 0) { throw "Missing evidence: $Name" }
    $Lines | Write-Output
}
$Source = 'g4-im-todo-final-sources-20260930-r1.log'
$Database = 'g4-im-todo-history-workflow-database-20260930-r1.log'
$Menu = 'g4-im-todo-management-menu-scope-20260930-r1.log'
Write-Output 'SCOPE=wecom-todo-registration-delivery-callback-terminal-management; vendor_service=false; full_prd_complete=false'
Write-Output '1 COMMAND=mvn -DskipTests install'
Show-Evidence 'g4-im-install-20260929-todo-history-20260930-r1.log' '\[static-rules\] no findings|\[INFO\] BUILD SUCCESS|Finished at:|^G4_IM_BUILD_INPUTS|^G4_IM_INSTALL_EXIT='
Write-Output '2 COMMAND=npm --prefix cloudflow-frontend run type-check; observed_exit=0'
Show-Evidence 'g4-im-todo-final-types-20260930-r1.log' '^> tsc'
Write-Output '3 COMMAND=npm --prefix cloudflow-frontend run build; observed_exit=0'
Show-Evidence 'g4-im-todo-final-frontend-build-20260930-r1.log' 'modules transformed|built in'
Write-Output '4 COMMAND=./scripts/verify-im-workflow-database.ps1 -StatePath <owned-state>'
Show-Evidence $Database '^G4_IM_WORKFLOW_EMPTY_DB_SCRIPT|^G4_IM_WORKFLOW_EMPTY_DATABASE|^G4_IM_WORKFLOW_DATABASE_INPUTS|^G4_IM_WORKFLOW_DATABASE_CLEANUP'
Write-Output '5 COMMAND=./scripts/prepare-im-callback-integration.ps1 -TodoManagement -Apply; node scripts/verify-approved-menu-scope.mjs <owned-state>'
Show-Evidence $Database '^G4_IM_WORKFLOW_EMPTY_DB_PREINSERT'
Show-Evidence 'g4-im-todo-management-runtime-apply-20260930-r2.log' '^G4_'
Show-Evidence $Menu '^FORMAL_MENU_ID_PERMISSION_SET|^G4_IM_CONFIG_MENU_IDS='
Write-Output '6 COMMAND=node scripts/verify-approved-menu-scope.mjs <owned-state>'
Show-Evidence $Menu '^EMPLOYEE_ALL_GRANTS:|^G4_IM_CONFIG_ALL_TENANTS_GRANTS:|^EMPLOYEE_UNEXPECTED_GRANTS='
foreach ($Check in @(@(7,'^JAVA_SQL_CONCAT:'), @(8,'^SA_CHECK_LOGIN:'), @(9,'^MP_SQL_LAST_APPLY:'), @(10,'^MYBATIS_ANNOTATION_SQL:'), @(11,'^JAVA_PERMISSION_PREFIXES:'))) {
    Write-Output "$($Check[0]) COMMAND=node .cloudflow-runtime/batch-h-delivery-selfcheck-20260915/check-sources.mjs"
    Show-Evidence $Source $Check[1]
}
Write-Output '12 COMMAND=verified real encrypted callback round trip; fixed and randomized log sample scans'
Show-Evidence 'g4-im-todo-management-database-20260930-r2.log' '^G4_IM_CONFIG_DATABASE_SECRET_CHECKS:|^G4_IM_TODO_DELIVERY_DATABASE:'
Show-Evidence 'g4-im-callback-execution-live-todo-roundtrip-20260930-r4.log' '^G4_IM_TODO_ROUND_TRIP:|^G4_IM_TODO_ROUND_TRIP_JOB_RESTORED:|^G4_IM_CALLBACK_EXECUTION_RESTORED:'
Show-Evidence 'g4-im-todo-final-fixed-log-samples-20260930-r3.log' '^G4_IM_ORG_LOG_SELECTION:'
Show-Evidence 'g4-im-todo-final-fixed-log-samples-20260930-r3.log' '^G4_IM_ORG_LOG_SAMPLES:.*matches=0;'
Show-Evidence 'g4-im-todo-roundtrip-live-log-samples-20260930-r2.log' '^G4_IM_CALLBACK_EXECUTION_LOG_SAMPLES:'
Write-Output 'HISTORICAL_LIMIT=earlier unrelated failed fixture log match retained; current selected logs and all owned auth/workflow logs checked; no real vendor credentials supplied'
Write-Output '13 COMMAND=node .cloudflow-runtime/batch-h-delivery-selfcheck-20260915/check-sources.mjs'
Show-Evidence $Source '^WHITELIST .*AuthController|^WHITELIST .*CaptchaController|^STATIC_WHITELIST:'
Write-Output '14 COMMAND=./scripts/generate-demo-seed.ps1'
Show-Evidence 'g4-im-todo-management-demo-20260930-r1.log' '^Generated|^G4_IM_TODO_DEMO_REGEN_IDENTICAL='
Write-Output 'EXTRA=Java explicit types, current real service boundaries and automatic scheduler'
Show-Evidence 'g4-im-todo-final-java-types-20260930-r1.log' '^JAVA_EXPLICIT_TYPES:'
Show-Evidence 'g4-im-todo-final-boundary-20260930-r2.log' '^G4_IM_CALLBACK_LIVE:'
Show-Evidence 'g4-im-todo-recovery-live-20260930-r2.log' '^G4_IM_TODO_RECOVERY_LIVE:'
Show-Evidence 'g4-im-todo-final-diff-20260930-r1.log' '^G4_IM_TODO_DIFF_EXIT='
