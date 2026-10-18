param([string]$LiveRound = 'r4', [string]$SourceRound = 'r3', [string]$LogRound = 'r1')

$ErrorActionPreference = 'Stop'
. 'D:\CloudFlowPro\.cloudflow-runtime\use-data-drive.ps1'
$Directory = 'D:\CloudFlowPro\.cloudflow-runtime\full-prd-20260915\approved-runtime'
function Show-Evidence([string]$Name, [string]$Pattern) {
    $Lines = @(Get-Content -LiteralPath (Join-Path $Directory $Name) | Where-Object { $_ -match $Pattern })
    if ($Lines.Count -eq 0) { throw "Missing evidence: $Name" }
    $Lines | Write-Output
}
$Source = "g4-im-message-sources-20260930-$SourceRound.log"
$Database = 'g4-im-message-config-database-20260930-r2.log'
$Menu = 'g4-im-message-menu-20260930-r2.log'
Write-Output 'SCOPE=wecom-text-and-notice-card; durable_delivery=true; default_templates=true; workflow_buttons=false; vendor_service=false; full_prd_complete=false'
Write-Output 'STATE=.cloudflow-runtime/batch-g-integration/9799534e1a3a47b5958330f14ae16dc7/state.json'
Write-Output '1 COMMAND=mvn -DskipTests install'
Show-Evidence 'g4-im-install-20260929-message-20260930-r1.log' '\[static-rules\] no findings|\[INFO\] BUILD SUCCESS|Finished at:|^G4_IM_BUILD_INPUTS|^G4_IM_INSTALL_EXIT='
Show-Evidence 'g4-im-message-final-state-20260930-r1.log' '^G4_IM_MESSAGE_FINAL_SOURCES:'
Write-Output '2 COMMAND=npm --prefix cloudflow-frontend run type-check'
Show-Evidence 'g4-im-message-frontend-20260930-r2.log' '^> tsc|^G4_IM_MESSAGE_TYPE_EXIT='
Write-Output '3 COMMAND=npm --prefix cloudflow-frontend run build'
Show-Evidence 'g4-im-message-frontend-20260930-r2.log' 'modules transformed|built in|^G4_IM_MESSAGE_FRONTEND_BUILD_EXIT='
Write-Output '4 COMMAND=./scripts/verify-im-config-database.ps1 -StatePath <state>'
Show-Evidence $Database '^G4_IM_EMPTY_DB_SCRIPT|^G4_IM_EMPTY_DATABASE|^G4_IM_DATABASE_INPUTS|^G4_IM_DATABASE_CLEANUP'
Write-Output '5 COMMAND=node scripts/verify-approved-menu-scope.mjs <state>; current stage adds no menus'
Show-Evidence $Database '^G4_IM_EMPTY_DB_PREINSERT'
Show-Evidence $Menu '^FORMAL_MENU_ID_PERMISSION_SET|^G4_IM_CONFIG_MENU_IDS='
Write-Output '6 COMMAND=node scripts/verify-approved-menu-scope.mjs <state>'
Show-Evidence $Menu '^EMPLOYEE_ALL_GRANTS:|^EMPLOYEE_UNEXPECTED_GRANTS='
foreach ($Check in @(@(7,'^JAVA_SQL_CONCAT:'), @(8,'^SA_CHECK_LOGIN:'), @(9,'^MP_SQL_LAST_APPLY:'), @(10,'^MYBATIS_ANNOTATION_SQL:'), @(11,'^JAVA_PERMISSION_PREFIXES:'))) {
    Write-Output "$($Check[0]) COMMAND=node .cloudflow-runtime/batch-h-delivery-selfcheck-20260915/check-sources.mjs"
    Show-Evidence $Source $Check[1]
}
Write-Output '12 COMMAND=./scripts/verify-im-config-database.ps1 -StatePath <state>; ./scripts/verify-message-delivery.ps1 -StatePath <state>; ./scripts/verify-im-org-log-samples.ps1 -StatePath <state> -SyncPreview -SyncWrite -SessionFence -SyncEffects -Preservation -Runner -SyncExecute -SyncSchedule -Login -BindingIdentity -BindingFlow -Messages -EvidenceFiles <explicit-successful-logs>'
Show-Evidence $Database '^G4_IM_CONFIG_DATABASE_SECRET_CHECKS:'
Show-Evidence 'g4-im-message-delivery-database-20260930-r2.log' '^PASS IM content is encrypted at rest|^G4_IM_MESSAGE_DATABASE:|^MESSAGE_DELIVERY_DATABASE_CHECKS:'
Show-Evidence "g4-im-message-log-samples-20260930-$LogRound.log" '^G4_IM_ORG_LOG_SELECTION:|^G4_IM_ORG_LOG_SAMPLES:'
Write-Output 'HISTORICAL_LOG_SCAN: management_r1_failed=true; fixed_fixture_matches=1; failed_database_r2_retained=true; all_history_zero_matches=false'
Write-Output '13 COMMAND=node .cloudflow-runtime/batch-h-delivery-selfcheck-20260915/check-sources.mjs'
Show-Evidence $Source '^WHITELIST .*AuthController|^WHITELIST .*CaptchaController|^STATIC_WHITELIST:'
Write-Output '14 COMMAND=./scripts/generate-demo-seed.ps1'
Show-Evidence 'g4-im-message-demo-20260930-r3.log' '^Generated|^G4_IM_MESSAGE_DEMO_REGEN_IDENTICAL='
Write-Output 'EXTRA COMMAND=java scripts/java-style-checks/JavaExplicitTypeChecks.java --self-test; java scripts/java-style-checks/JavaExplicitTypeChecks.java .'
Show-Evidence $Source '^JAVA_EXPLICIT_TYPES'
Show-Evidence 'g4-im-message-security-20260930-r1.log' '^G4_'
Show-Evidence 'g4-im-message-defaults-20260930-r1.log' '^G4_'
Show-Evidence "g4-im-message-live-disabled-20260930-$LiveRound.log" '^G4_IM_MESSAGE_DISABLED_REAL:|^G4_IM_CONFIG_REAL_RESULT:'
Show-Evidence 'g4-im-message-final-state-20260930-r1.log' '^G4_'
Show-Evidence 'g4-im-message-diff-check-20260930-r2.log' '^G4_IM_MESSAGE_DIFF_EXIT='
