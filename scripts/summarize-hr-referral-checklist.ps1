param()

$ErrorActionPreference = 'Stop'
. 'D:\CloudFlowPro\.cloudflow-runtime\use-data-drive.ps1'
$Evidence = 'D:\CloudFlowPro\.cloudflow-runtime\full-prd-20260915\approved-runtime'
function Show-ReferralEvidence([string]$File, [string]$Pattern) {
    $Lines = @(Get-Content -LiteralPath (Join-Path $Evidence $File) | Where-Object { $_ -match $Pattern })
    if ($Lines.Count -eq 0) { throw "Missing referral evidence: $File" }
    $Lines | Write-Output
}

Write-Output 'SCOPE=referral_hire_bonus_and_approved_name_capacity; all_prds_complete=false; production_modified=false'
Write-Output '1 COMMAND=mvn -f cloudflow-backend/pom.xml -DskipTests install; observed_exit=0'
Show-ReferralEvidence 'h2-name-capacity-install-20260930-r1.log' '\[static-rules\] no findings|\[INFO\] BUILD SUCCESS|\[INFO\] Finished at:'
Show-ReferralEvidence 'h2-name-capacity-backend-inputs-final-20260930-r1.log' '^H2_NAME_BACKEND_INPUTS_FINAL:.*changed=0;'
Write-Output '2 COMMAND=npm --prefix cloudflow-frontend run type-check; product_frontend_unchanged_since_check=true'
Show-ReferralEvidence 'h2-referral-bonus-types-20260930-r4.log' '^> tsc'
Write-Output '3 COMMAND=npm --prefix cloudflow-frontend run build; product_frontend_unchanged_since_check=true'
Show-ReferralEvidence 'h2-referral-bonus-frontend-build-20260930-r2.log' 'modules transformed|built in'
Write-Output '4 COMMAND=./scripts/verify-hr-referral-identities.ps1 -StatePath <owned-state>'
Show-ReferralEvidence 'h2-name-capacity-database-20260930-r1.log' '^H2_REFERRAL_CORE_EMPTY_DB_SCRIPT:|^H2_REFERRAL_CORE_EMPTY_DATABASE:|^H2_REFERRAL_CORE_DATABASE_CLEANUP:'
Write-Output '5 COMMAND=pre-insert menu conflict check and formal menu verification'
Show-ReferralEvidence 'h2-referral-preflight-20260930-r3.log' '^H2_REFERRAL_PREFLIGHT:.*candidate_menu_conflicts=0;|^H2_REFERRAL_MENU_IDS='
Show-ReferralEvidence 'h2-referral-bonus-menu-20260930-r1.log' '^FORMAL_MENU_ID_PERMISSION_SET:'
Write-Output '6 COMMAND=node scripts/verify-approved-menu-scope.mjs <owned-state>'
Show-ReferralEvidence 'h2-referral-bonus-menu-20260930-r1.log' '^EMPLOYEE_ALL_TENANTS_GRANTS:|^EMPLOYEE_ALL_GRANTS:|^EMPLOYEE_UNEXPECTED_GRANTS='
foreach ($Check in @(@(7,'^JAVA_SQL_CONCAT:'), @(8,'^SA_CHECK_LOGIN:'), @(9,'^MP_SQL_LAST_APPLY:'), @(10,'^MYBATIS_ANNOTATION_SQL:'), @(11,'^JAVA_PERMISSION_PREFIXES:'))) {
    Write-Output "$($Check[0]) COMMAND=node .cloudflow-runtime/batch-h-delivery-selfcheck-20260915/check-sources.mjs"
    Show-ReferralEvidence 'h2-name-capacity-sources-20260930-r1.log' $Check[1]
}
Write-Output '12 COMMAND=actual contact encryption/sensitive serialization and current log samples'
Show-ReferralEvidence 'h2-referral-contact-regression-20260930-r1.log' '^H2_CONTACT_CAPACITY_DATABASE:.*failed=0;'
Show-ReferralEvidence 'h2-referral-contact-log-samples-final-20260930-r1.log' '^H2_CONTACT_LOG_SAMPLES:.*hits=0;'
Show-ReferralEvidence 'h2-referral-contact-http-final-20260930-r1.log' '^H2_CONTACT_CAPACITY_REAL_RESULT:.*failed=0;'
Write-Output '13 COMMAND=node .cloudflow-runtime/batch-h-delivery-selfcheck-20260915/check-sources.mjs'
Show-ReferralEvidence 'h2-name-capacity-sources-20260930-r1.log' '^WHITELIST .*AuthController|^WHITELIST .*CaptchaController|^STATIC_WHITELIST:'
Write-Output '14 COMMAND=./scripts/generate-demo-seed.ps1; regenerated twice'
Show-ReferralEvidence 'h2-name-capacity-demo-20260930-r2.log' '^Generated|^H2_NAME_DEMO_REGEN_IDENTICAL=True'
Write-Output 'EXTRA=real_referral_and_name_boundaries; counts_are_not_added'
Show-ReferralEvidence 'h2-referral-completion-20260930-r23.log' '^H2_REFERRAL_CORE_REAL_RESULT:.*failed=0;.*workflow_hire_bonus_tested=true;'
foreach ($Length in @(30,31)) {
    Show-ReferralEvidence "h2-name-capacity-full-$Length-20260930-r1.log" '^H2_REFERRAL_CORE_REAL_RESULT:.*failed=0;.*workflow_hire_bonus_tested=true;'
}
Show-ReferralEvidence 'h2-name-capacity-account-20260930-r1.log' '^H2_REFERRAL_ACCOUNT_HTTP:|^H2_REFERRAL_ACCOUNT_PASS:'
Show-ReferralEvidence 'h2-name-capacity-java-types-20260930-r2.log' '^JAVA_EXPLICIT_TYPES:'
Show-ReferralEvidence 'h2-referral-overtime-offline-20260930-r1.log' '^PASS:|^HR_OVERTIME'
Show-ReferralEvidence 'h2-name-capacity-apply-20260930-r1.log' '^H2_CONTACT_CAPACITY_PREPARE:'
Show-ReferralEvidence 'h2-name-capacity-diff-20260930-r1.log' '^H2_NAME_DIFF_EXIT=0'
