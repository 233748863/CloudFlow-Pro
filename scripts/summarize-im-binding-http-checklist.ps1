$ErrorActionPreference = 'Stop'
$Root = [IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
. (Join-Path $Root '.cloudflow-runtime/use-data-drive.ps1')
$Evidence = Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
function Show-Evidence([string]$Name, [string]$Pattern) {
    $Lines = @(Get-Content -LiteralPath (Join-Path $Evidence $Name) | Where-Object { $_ -match $Pattern })
    if ($Lines.Count -eq 0) { throw "Missing evidence: $Name" }
    $Lines | Write-Output
}
$Prefix = 'g4-im-binding-http-'
$Database = $Prefix + 'database-20260930-r4.log'
$Sources = $Prefix + 'sources-20260930-r2.log'
$Menus = $Prefix + 'menu-20260930-r2.log'
foreach ($Pair in @(
    @($Database, '^G4_IM_BINDING_HTTP: assertions=145; requests=46; failed=0;'),
    @($Database, '^G4_IM_DATABASE_INPUTS: files=36; changed=0$'),
    @(($Prefix + 'install-20260930-r2.log'), '^\[INFO\] BUILD SUCCESS$'),
    @(($Prefix + 'ui-20260930-r6.log'), '^G4_IM_BINDING_UI: assertions=20; failed=0;'),
    @(($Prefix + 'security-20260930-r2.log'), '^G4_IM_BINDING_LOG: assertions=67; failed=0;'),
    @(($Prefix + 'real-login-session-only-20260930-r2.log'), '^G4_LOGIN_SESSION_REAL_RESULT: checks=42; failed=0;'),
    @(($Prefix + 'real-im-config-disabled-only-20260930-r2.log'), '^G4_IM_CONFIG_REAL_RESULT: checks=59; failed=0;'),
    @(($Prefix + 'real-tenant-package-disabled-only-20260930-r2.log'), '^H5_TENANT_PACKAGE_REAL_RESULT: checks=18; failed=0;'),
    @(($Prefix + 'log-samples-20260930-r1.log'), '^G4_IM_ORG_LOG_SAMPLES:.*matches=0;'),
    @(($Prefix + 'final-state-20260930-r1.log'), '^G4_IM_BINDING_HTTP_BUILD_INPUTS:.*modified_after_install=0;'),
    @(($Prefix + 'final-state-20260930-r1.log'), '^G4_IM_BINDING_HTTP_HEALTH: services=6; up=6;')
)) {
    if (-not (Select-String -LiteralPath (Join-Path $Evidence $Pair[0]) -Pattern $Pair[1] -Quiet)) { throw "Incomplete evidence: $($Pair[0])" }
}
Write-Output 'SCOPE=self-binding-http-and-page; formal_self_menus=false; vendor_identity=fixture; full_prd_complete=false; workspace=D:\CloudFlowPro'
Write-Output 'STATE=.cloudflow-runtime/batch-g-integration/9799534e1a3a47b5958330f14ae16dc7/state.json'
Write-Output '1 COMMAND=mvn -DskipTests install'
Show-Evidence ($Prefix + 'install-20260930-r2.log') '^\[static-rules\] no findings|^\[INFO\] BUILD SUCCESS|Finished at:'
Show-Evidence ($Prefix + 'final-state-20260930-r1.log') '^G4_IM_BINDING_HTTP_BUILD_INPUTS:|^G4_IM_BINDING_HTTP_STATIC_RULES:'
Write-Output '2 COMMAND=npm --prefix cloudflow-frontend run type-check'
Show-Evidence ($Prefix + 'frontend-20260930-r1.log') 'tsc --noEmit'
Write-Output '3 COMMAND=npm --prefix cloudflow-frontend run build'
Show-Evidence ($Prefix + 'frontend-20260930-r1.log') 'modules transformed|built in'
Write-Output '4 COMMAND=./scripts/verify-im-config-database.ps1 -StatePath <state> -BindingFlow'
Show-Evidence $Database '^G4_IM_EMPTY_DB_SCRIPT|^G4_IM_EMPTY_DATABASE|^G4_IM_DATABASE_INPUTS|^G4_IM_DATABASE_CLEANUP'
Write-Output '5 COMMAND=node scripts/verify-approved-menu-scope.mjs <state>; node scripts/prepare-im-execution-integration.mjs <state>'
Show-Evidence $Database '^G4_IM_EMPTY_DB_PREINSERT'
Show-Evidence $Menus '^FORMAL_MENU_ID_PERMISSION_SET|^G4_IM_CONFIG_MENU_IDS=|^G4_IM_EXECUTION_PREFLIGHT:'
Write-Output '6 COMMAND=node scripts/verify-approved-menu-scope.mjs <state>'
Show-Evidence $Menus '^EMPLOYEE_ALL_GRANTS|^EMPLOYEE_UNEXPECTED_GRANTS'
foreach ($Check in @(@('7','JAVA_SQL_CONCAT'), @('8','SA_CHECK_LOGIN'), @('9','MP_SQL_LAST_APPLY'), @('10','MYBATIS_ANNOTATION_SQL'), @('11','JAVA_PERMISSION_PREFIXES'))) {
    Write-Output "$($Check[0]) COMMAND=node .cloudflow-runtime/batch-h-delivery-selfcheck-20260915/check-sources.mjs"
    Show-Evidence $Sources ('^' + $Check[1] + ':')
}
Write-Output '12 COMMAND=./scripts/verify-im-config-database.ps1 -StatePath <state> -BindingFlow; ./scripts/verify-im-security.ps1 -SkipBuild; ./scripts/verify-im-org-log-samples.ps1 -StatePath <state> -SyncPreview -SyncWrite -SessionFence -SyncEffects -Preservation -Runner -SyncExecute -SyncSchedule -Login -BindingIdentity -BindingFlow'
Show-Evidence $Database '^G4_IM_CONFIG_DATABASE_SECRET_CHECKS:|^G4_IM_BINDING_HTTP:'
Show-Evidence ($Prefix + 'security-20260930-r2.log') '^G4_IM_BINDING_LOG:'
Show-Evidence ($Prefix + 'real-login-session-only-20260930-r2.log') '^G4_LOGIN_SESSION_SECRET_SCAN:'
Show-Evidence ($Prefix + 'log-samples-20260930-r1.log') '^G4_IM_ORG_LOG_SAMPLES:'
Write-Output '13 COMMAND=node .cloudflow-runtime/batch-h-delivery-selfcheck-20260915/check-sources.mjs'
Show-Evidence $Sources '^WHITELIST .*(AuthController|CaptchaController)|^STATIC_WHITELIST:'
Write-Output '14 COMMAND=./scripts/generate-demo-seed.ps1'
Show-Evidence ($Prefix + 'demo-20260930-r1.log') '^Generated|^G4_IM_BINDING_HTTP_DEMO_REGEN_IDENTICAL'
Write-Output 'EXTRA COMMAND=java scripts/java-style-checks/JavaExplicitTypeChecks.java --self-test; java scripts/java-style-checks/JavaExplicitTypeChecks.java .'
Show-Evidence $Sources '^JAVA_EXPLICIT_TYPES'
Show-Evidence $Database '^G4_IM_BINDING_ACCOUNT_RACE:|^G4_IM_BINDING_WRITE_RACE:|^G4_IM_BINDING_FLOW_DATABASE:|^G4_IM_BINDING_FLOW_CLEANUP:'
Show-Evidence ($Prefix + 'ui-20260930-r6.log') '^G4_IM_BINDING_UI:'
Show-Evidence ($Prefix + 'gateway-20260930-r2.log') '^G4_IM_LOGIN_GATEWAY_HTTP:'
Show-Evidence ($Prefix + 'login-regression-20260930-r2.log') '^G4_IM_LOGIN_FLOW_DATABASE:|^G4_IM_LOGIN_HTTP:'
foreach ($Mode in @('login-session-only','im-config-disabled-only','tenant-package-disabled-only')) {
    Show-Evidence ($Prefix + "real-$Mode-20260930-r2.log") '^G4_LOGIN_SESSION_REAL_RESULT:|^G4_IM_CONFIG_REAL_RESULT:|^H5_TENANT_PACKAGE_REAL_RESULT:'
}
Show-Evidence ($Prefix + 'final-state-20260930-r1.log') '^G4_IM_BINDING_HTTP_HEALTH:|^G4_IM_BINDING_HTTP_AUTH_CONFIG:'
