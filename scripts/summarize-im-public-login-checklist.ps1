$ErrorActionPreference = 'Stop'
$Root = [IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
. (Join-Path $Root '.cloudflow-runtime/use-data-drive.ps1')
$Evidence = Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
function Show-Evidence([string]$Name, [string]$Pattern) {
    $Lines = @(Get-Content -LiteralPath (Join-Path $Evidence $Name) | Where-Object { $_ -match $Pattern })
    if ($Lines.Count -eq 0) { throw "Missing evidence: $Name" }
    $Lines | Write-Output
}
$Database = 'g4-im-public-login-database-20260930-r6.log'
$Sources = 'g4-im-public-login-sources-20260930-r2.log'
$Menus = 'g4-im-public-login-menu-20260930-r2.log'
$Live = 'g4-im-public-login-live-totp-20260930-r2.log'
foreach ($Pair in @(@($Database, '^G4_IM_DATABASE_INPUTS: files=32; changed=0$'), @($Live, '^G4_LOGIN_SESSION_REAL_RESULT: checks=57; failed=0;'), @($Live, '^G4_IM_LOGIN_TEMPORARY_TOTP:.*temporary_secret_matches=0;'))) {
    if (-not (Select-String -LiteralPath (Join-Path $Evidence $Pair[0]) -Pattern $Pair[1] -Quiet)) { throw "Incomplete evidence: $($Pair[0])" }
}
foreach ($Pair in @(
    @('g4-im-public-login-restored-login-session-only-20260930-r2.log', '^G4_LOGIN_SESSION_REAL_RESULT: checks=42; failed=0;'),
    @('g4-im-public-login-restored-tenant-package-disabled-only-20260930-r2.log', '^H5_TENANT_PACKAGE_REAL_RESULT: checks=18; failed=0;'),
    @('g4-im-public-login-restored-im-config-disabled-only-20260930-r2.log', '^G4_IM_CONFIG_REAL_RESULT: checks=52; failed=0;'),
    @('g4-im-public-login-disabled-real-20260930-r5.log', '^G4_IM_PUBLIC_DISABLED_REAL: assertions=32; requests=10; failed=0;'),
    @('g4-im-public-login-log-samples-20260930-r2.log', '^G4_IM_ORG_LOG_SAMPLES:.*matches=0;'),
    @('g4-im-public-login-final-state-20260930-r1.log', '^G4_IM_PUBLIC_FINAL_SOURCES: files=3471; modified_after_install=0;')
)) {
    if (-not (Select-String -LiteralPath (Join-Path $Evidence $Pair[0]) -Pattern $Pair[1] -Quiet)) { throw "Incomplete final evidence: $($Pair[0])" }
}
Write-Output 'SCOPE=im-public-login-ui-and-gateway; employee_binding_menu_released=false; vendor_login=false; full_prd_delivered=false; workspace=D:\CloudFlowPro'
Write-Output 'STATE=.cloudflow-runtime/batch-g-integration/9799534e1a3a47b5958330f14ae16dc7/state.json'
Write-Output '1 COMMAND=mvn -DskipTests install'
Show-Evidence 'g4-im-public-login-install-20260930-r3.log' '^\[static-rules\] no findings|^\[INFO\] BUILD SUCCESS|Finished at:|^G4_IM_PUBLIC_BUILD_INPUTS'
Show-Evidence 'g4-im-public-login-static-inventory-20260930-r1.log' '^G4_IM_STATIC_RULE_'
Write-Output '2 COMMAND=npm --prefix cloudflow-frontend run type-check'
Show-Evidence 'g4-im-public-login-frontend-20260930-r2.log' 'tsc --noEmit'
Write-Output '3 COMMAND=npm --prefix cloudflow-frontend run build'
Show-Evidence 'g4-im-public-login-frontend-20260930-r2.log' 'modules transformed|built in'
Write-Output '4 COMMAND=./scripts/verify-im-config-database.ps1 -StatePath <state> -LoginAccounts'
Show-Evidence $Database '^G4_IM_EMPTY_DB_SCRIPT|^G4_IM_EMPTY_DATABASE|^G4_IM_DATABASE_CLEANUP'
Write-Output '5 COMMAND=node scripts/verify-approved-menu-scope.mjs <state>; node scripts/prepare-im-execution-integration.mjs <state>'
Show-Evidence $Database '^G4_IM_EMPTY_DB_PREINSERT'
Show-Evidence $Menus '^FORMAL_MENU_ID_PERMISSION_SET|^G4_IM_CONFIG_MENU_IDS=|^G4_IM_EXECUTION_PREFLIGHT:'
Write-Output '6 COMMAND=node scripts/verify-approved-menu-scope.mjs <state>'
Show-Evidence $Menus '^EMPLOYEE_ALL_GRANTS|^EMPLOYEE_UNEXPECTED_GRANTS'
foreach ($Check in @(@('7','JAVA_SQL_CONCAT'), @('8','SA_CHECK_LOGIN'), @('9','MP_SQL_LAST_APPLY'), @('10','MYBATIS_ANNOTATION_SQL'), @('11','JAVA_PERMISSION_PREFIXES'))) {
    Write-Output "$($Check[0]) COMMAND=node .cloudflow-runtime/batch-h-delivery-selfcheck-20260915/check-sources.mjs"
    Show-Evidence $Sources ('^' + $Check[1] + ':')
}
Write-Output '12 COMMAND=./scripts/verify-im-config-database.ps1 -StatePath <state> -LoginAccounts; ./scripts/verify-login-totp-regression.ps1 -StatePath <state>; ./scripts/verify-im-org-log-samples.ps1 -StatePath <state> -SyncPreview -SyncWrite -SessionFence -SyncEffects -Preservation -Runner -SyncExecute -SyncSchedule -Login'
Show-Evidence $Database '^G4_IM_CONFIG_DATABASE_SECRET_CHECKS|^G4_IM_LOGIN_MFA_DATABASE:'
Show-Evidence $Live '^G4_LOGIN_SESSION_SECRET_SCAN:|^G4_IM_LOGIN_TEMPORARY_TOTP:'
Show-Evidence 'g4-im-public-login-log-samples-20260930-r2.log' '^G4_IM_ORG_LOG_SAMPLES:'
Write-Output '13 COMMAND=node .cloudflow-runtime/batch-h-delivery-selfcheck-20260915/check-sources.mjs'
Show-Evidence $Sources '^WHITELIST .*(AuthController|CaptchaController)|^STATIC_WHITELIST:'
Write-Output '14 COMMAND=./scripts/generate-demo-seed.ps1'
Show-Evidence 'g4-im-public-login-demo-20260930-r1.log' '^Generated|^G4_IM_PUBLIC_DEMO_REGEN_IDENTICAL'
Write-Output 'EXTRA COMMAND=java scripts/java-style-checks/JavaExplicitTypeChecks.java --self-test; java scripts/java-style-checks/JavaExplicitTypeChecks.java .'
Show-Evidence $Sources '^JAVA_EXPLICIT_TYPES'
Show-Evidence $Database '^G4_PASSWORD_TOTP_CLAIM_RACE:|^G4_IM_LOGIN_HTTP:|^G4_IM_LOGIN_REQUESTS:|^G4_IM_LOGIN_FLOW_DATABASE:|^G4_IM_LOGIN_FLOW_CLEANUP:'
Show-Evidence 'g4-im-public-login-security-20260930-r2.log' '^G4_IM_LOGIN_GATEWAY_HTTP:'
Show-Evidence 'g4-im-public-login-ui-20260930-r5.log' '^G4_IM_LOGIN_UI:'
Show-Evidence $Live '^G4_LOGIN_SESSION_REAL_RESULT:|^G4_LOGIN_TOTP_CONCURRENT_RESPONSES:'
foreach ($Mode in @('login-session-only','tenant-package-disabled-only','im-config-disabled-only')) {
    Show-Evidence "g4-im-public-login-restored-$Mode-20260930-r2.log" '^G4_LOGIN_SESSION_REAL_RESULT:|^H5_TENANT_PACKAGE_REAL_RESULT:|^G4_IM_CONFIG_REAL_RESULT:'
}
Show-Evidence 'g4-im-public-login-disabled-real-20260930-r5.log' '^G4_IM_PUBLIC_DISABLED_REAL:'
Show-Evidence 'g4-im-public-login-final-state-20260930-r1.log' '^G4_IM_PUBLIC_HEALTH:|^G4_IM_PUBLIC_AUTH_CONFIG:|^G4_IM_PUBLIC_FINAL_SOURCES:'
