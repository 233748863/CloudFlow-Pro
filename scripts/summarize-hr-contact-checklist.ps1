param()

$ErrorActionPreference = 'Stop'
. 'D:\CloudFlowPro\.cloudflow-runtime\use-data-drive.ps1'
$Evidence = 'D:\CloudFlowPro\.cloudflow-runtime\full-prd-20260915\approved-runtime'
function Show-ContactEvidence([string]$File, [string]$Pattern) {
    $Lines = @(Get-Content -LiteralPath (Join-Path $Evidence $File) | Where-Object { $_ -match $Pattern })
    if ($Lines.Count -eq 0) { throw "Missing contact evidence: $File" }
    $Lines | Write-Output
}
Write-Output 'SCOPE=contact_capacity_internal_preservation_resume; full_referral_complete=false; actual_onboarding_http=false; production_modified=false'
Write-Output '1 COMMAND=mvn -DskipTests install; observed_exit=0'
Show-ContactEvidence 'h2-contact-capacity-install-20260930-r3.log' '\[static-rules\] no findings|\[INFO\] BUILD SUCCESS|\[INFO\] Finished at:'
Show-ContactEvidence 'h2-contact-backend-inputs-final-20260930-r1.log' '^H2_CONTACT_BACKEND_INPUTS_FINAL:'
Write-Output '2 COMMAND=npm --prefix cloudflow-frontend run type-check; observed_exit=0'
Show-ContactEvidence 'h2-contact-capacity-types-20260930-r1.log' '^> tsc'
Write-Output '3 COMMAND=npm --prefix cloudflow-frontend run build; observed_exit=0'
Show-ContactEvidence 'h2-contact-capacity-frontend-build-20260930-r1.log' 'modules transformed|built in'
Write-Output '4 COMMAND=./scripts/verify-hr-contact-capacity.ps1 -StatePath <owned-state>'
Show-ContactEvidence 'h2-contact-capacity-database-20260930-r5.log' '^H2_CONTACT_EMPTY_DB_SCRIPT:|^H2_CONTACT_EMPTY_DATABASE:|^H2_CONTACT_DATABASE_CLEANUP:'
Write-Output '5 COMMAND=./scripts/verify-hr-referrals-preflight.ps1 -StatePath <owned-state>; no_menu_additions=true'
Show-ContactEvidence 'h2-referral-preflight-20260930-r1.log' '^H2_REFERRAL_PREFLIGHT:|^H2_REFERRAL_MENU_IDS='
Show-ContactEvidence 'h2-contact-capacity-menu-20260930-r1.log' '^FORMAL_MENU_ID_PERMISSION_SET:'
Write-Output '6 COMMAND=node scripts/verify-approved-menu-scope.mjs <owned-state>'
Show-ContactEvidence 'h2-contact-capacity-menu-20260930-r1.log' '^EMPLOYEE_ALL_GRANTS:|^EMPLOYEE_UNEXPECTED_GRANTS='
foreach ($Check in @(@(7,'^JAVA_SQL_CONCAT:'), @(8,'^SA_CHECK_LOGIN:'), @(9,'^MP_SQL_LAST_APPLY:'), @(10,'^MYBATIS_ANNOTATION_SQL:'), @(11,'^JAVA_PERMISSION_PREFIXES:'))) {
    Write-Output "$($Check[0]) COMMAND=node .cloudflow-runtime/batch-h-delivery-selfcheck-20260915/check-sources.mjs"
    Show-ContactEvidence 'h2-contact-capacity-sources-20260930-r2.log' $Check[1]
}
Write-Output '12 COMMAND=contact database checks with actual encryption and sensitive module; contact log samples'
Show-ContactEvidence 'h2-contact-capacity-database-20260930-r5.log' '^H2_CONTACT_CAPACITY_DATABASE:'
Show-ContactEvidence 'h2-contact-capacity-log-samples-20260930-r1.log' '^H2_CONTACT_LOG_SAMPLES:.*hits=0;'
Show-ContactEvidence 'h2-contact-capacity-http-20260930-r5.log' '^H2_CONTACT_CAPACITY_REAL_RESULT:'
Write-Output '13 COMMAND=node .cloudflow-runtime/batch-h-delivery-selfcheck-20260915/check-sources.mjs'
Show-ContactEvidence 'h2-contact-capacity-sources-20260930-r2.log' '^WHITELIST .*AuthController|^WHITELIST .*CaptchaController|^STATIC_WHITELIST:'
Write-Output '14 COMMAND=./scripts/generate-demo-seed.ps1'
Show-ContactEvidence 'h2-contact-capacity-demo-20260930-r2.log' '^Generated|^H2_CONTACT_DEMO_REGEN_IDENTICAL=True'
Write-Output 'EXTRA=explicit_types_shared_crud_onboarding_isolated_capacity'
Show-ContactEvidence 'h2-contact-capacity-java-types-20260930-r2.log' '^JAVA_EXPLICIT_TYPES:'
Show-ContactEvidence 'h2-contact-capacity-adjacent-crud-20260930-r1.log' '^HR_TYPED_DELETE_CHECKS:'
Show-ContactEvidence 'h2-contact-capacity-onboarding-20260930-r1.log' '^PASS:|^H3_HR_ACCOUNT_AVAILABILITY_CHECKS:|^H3_HR_SUCCESSOR_RULE_CHECKS:'
Show-ContactEvidence 'h2-contact-capacity-apply-20260930-r1.log' '^H2_CONTACT_CAPACITY_PREPARE:'
Show-ContactEvidence 'h2-contact-capacity-diff-20260930-r2.log' '^H2_CONTACT_DIFF_EXIT=0'
