import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash, randomUUID, X509Certificate } from 'node:crypto';
import { createRequire } from 'node:module';
import { createServer as reservePort } from 'node:net';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import fs from 'node:fs/promises';
import { verifyStorage } from './verify-batch-g-storage.mjs';
import { verifyRecovery } from './verify-batch-g-recovery.mjs';
import { verifyImportInterface } from './verify-batch-g-import-real-ui.mjs';
import { verifyObservabilityInterface } from './verify-batch-g-observability-ui.mjs';
import { verifyStorageInterface } from './verify-batch-g-storage-ui.mjs';
import { verifyHolidayInterface } from './verify-holiday-real-ui.mjs';
import { verifyHolidayConsumers } from './verify-holiday-consumers-real.mjs';
import { verifyConfiguration } from './verify-configuration-real.mjs';
import { verifyAgentInterface } from './verify-batch-h-agent-real.mjs';
import { verifyGatewayInterface } from './verify-batch-h-gateway-real.mjs';
import { verifyGatewayDesigner } from './verify-batch-h-gateway-designer-real.mjs';
import { verifyMessageDelivery } from './verify-message-delivery-real.mjs';
import { verifyRfqEmail } from './verify-rfq-email-real.mjs';
import { verifyCrmEmail } from './verify-crm-email-real.mjs';
import { verifyRfqSelection } from './verify-rfq-email-boundaries.mjs';
import { verifyMeeting } from './verify-meeting-h4-real.mjs';
import { verifyOpportunity } from './verify-opportunity-h3-real.mjs';
import { verifyOpportunityImport } from './verify-opportunity-import-h3-real.mjs';
import { verifyMenuLayout } from './verify-menu-layout-real.mjs';
import { verifyEmailArchive } from './verify-email-archive-real.mjs';
import { verifyQuoteHandover } from './verify-quote-handover-h3-real.mjs';
import { verifyReceivableProtection } from './verify-receivable-protection-h3-real.mjs';
import { verifyContractTeam } from './verify-contract-team-h3-real.mjs';
import { verifyContractPerformance } from './verify-contract-performance-h3-real.mjs';
import { verifyOaSignMethods } from './verify-oa-sign-methods.mjs';
import { verifyOaContractTerms } from './verify-oa-contract-terms.mjs';
import { verifyOaContractReminders } from './verify-oa-contract-reminders.mjs';
import { verifyOaContractReview } from './verify-oa-contract-review.mjs';
import { verifyOaContractAccess } from './verify-oa-contract-access.mjs';
import { verifyA3JobManagement } from './verify-a3-job-management.mjs';
import { verifyA3JobBusiness } from './verify-a3-job-business.mjs';
import { verifyA3JobLongRunning } from './verify-a3-job-long-running.mjs';
import { verifyA3JobFailure } from './verify-a3-job-failure.mjs';
import { verifyA3JobTenantFailure } from './verify-a3-job-tenant-failure.mjs';
import { verifyA3JobCrmFailure } from './verify-a3-job-crm-failure.mjs';
import { verifyA3JobOutage } from './verify-a3-job-outage.mjs';
import { verifyA3JobPeer } from './verify-a3-job-peer.mjs';
import { verifyA3TimerScan } from './verify-a3-timer-scan.mjs';
import { verifyA3DeadlockScan } from './verify-a3-deadlock-scan.mjs';
import { verifyA3AnomalyScan } from './verify-a3-anomaly-scan.mjs';
import { verifyA3TaskTimeout } from './verify-a3-task-timeout.mjs';
import { verifyA3AuditArchive } from './verify-a3-audit-archive.mjs';
import { verifyA3ProcessReconcile } from './verify-a3-process-reconcile.mjs';
import { verifyA3TaskReminder } from './verify-a3-task-reminder.mjs';
import { verifyA3DictScan } from './verify-a3-dict-scan.mjs';
import { verifyA3CrmNotifications } from './verify-a3-crm-notifications.mjs';
import { verifyA3OaScans } from './verify-a3-oa-scans.mjs';
import { verifyA3QuoteExpire } from './verify-a3-quote-expire.mjs';
import { verifyA3TrainingArchive } from './verify-a3-training-archive.mjs';
import { verifyA3BusinessExit } from './verify-a3-business-exit.mjs';
import { verifyHolidayYearlyReminder } from './verify-holiday-yearly-reminder.mjs';
import { verifyA3JobCluster } from './verify-a3-job-cluster.mjs';
import { verifyA3JobPrimaryFault } from './verify-a3-job-primary-fault.mjs';
import { verifyA3JobFailover } from './verify-a3-job-failover.mjs';
import { verifyA3JobSchedulers } from './verify-a3-job-schedulers.mjs';
import { verifyA3JobReportFault } from './verify-a3-job-report-fault.mjs';
import { verifySalesTarget } from './verify-sales-target-h3-real.mjs';
import { verifyPortalAuthentication } from './verify-portal-auth-real.mjs';
import { verifyPortalEmployeeGuard } from './verify-portal-auth-ui.mjs';
import { verifyHrOvertime } from './verify-hr-overtime-real.mjs';
import { verifyHrSkills } from './verify-hr-skills-real.mjs';
import { verifyHrTrainingCertificateCapacity } from './verify-hr-training-certificate-capacity.mjs';
import { verifyHrGrievanceArchiveCapacity } from './verify-hr-grievance-archive-capacity.mjs';
import { verifyHrEmployeeCertificateCapacity } from './verify-hr-employee-certificate-capacity.mjs';
import { verifyHrContactCapacity } from './verify-hr-contact-capacity-real.mjs';
import { verifyHrReferrals } from './verify-hr-referrals-real.mjs';
import { verifyHrExitInterviews } from './verify-hr-exit-interviews-real.mjs';
import { verifyHrTrainingRecovery } from './verify-hr-training-recovery-real.mjs';
import { verifyHrSeverancePolicy } from './verify-hr-severance-policy-real.mjs';
import { verifyHrSettlementDraft } from './verify-hr-settlement-draft-real.mjs';
import { verifyHrAppraisals } from './verify-hr-appraisals-real.mjs';
import { verifyHrAdvancePayroll } from './verify-hr-advance-payroll-real.mjs';
import { verifyHrAdvanceEntry } from './verify-hr-advance-entry-real.mjs';
import { verifyHrAdvanceApproval } from './verify-hr-advance-approval-real.mjs';
import { verifyHrAdvanceSettlement } from './verify-hr-advance-settlement-real.mjs';
import { verifyBusinessSearch } from './verify-business-search-real.mjs';
import { verifyPlatformAccess } from './verify-platform-access-real.mjs';
import { verifyTenantPackage } from './verify-tenant-package-real.mjs';
import { verifyFilePreview } from './verify-file-preview-real.mjs';
import { verifyDataSource } from './verify-data-source-real.mjs';
import { verifyDataSourceLive } from './verify-data-source-live.mjs';
import { verifyOauth2 } from './verify-oauth2-real.mjs';
import { verifyReport } from './verify-report-real.mjs';
import { verifyImConfig } from './verify-im-config-real.mjs';
import { verifyLoginSession } from './verify-login-session-real.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const runtime = await fs.realpath(path.join(root, '.cloudflow-runtime', 'batch-g-integration'));
const statePath = await fs.realpath(process.argv[2] || '');
const directory = path.dirname(statePath);
assert.equal(path.dirname(directory), runtime, 'Integration state must be in the isolated workspace');
assert.match(path.basename(directory), /^[a-f0-9]{32}$/);
assert.equal(path.basename(statePath), 'state.json');
const state = JSON.parse((await fs.readFile(statePath, 'utf8')).replace(/^\uFEFF/, ''));
assert.equal(await fs.realpath(state.run), directory);
assert.equal(state.status, 'RUNNING');
assert.ok(Number.isInteger(state.mysqlPort) && state.mysqlPort > 1024 && state.mysqlPort < 65536);
const checks = [];
const requests = [];
const pending = [];
const tasks = [];
const caseTag = randomUUID().replaceAll('-', '').slice(0, 12);
const f1AssetOnly = process.argv.includes('--f1-assets-only');
assert.ok(!f1AssetOnly || process.argv.slice(3).every(value => ['--f1-assets-only', '--settlement-schema'].includes(value)), 'Choose only the F1 asset scenario');
const f1AssetEvidence = {};
const a1CodegenDisabled = process.argv.includes('--a1-codegen-disabled-only');
const a1CodegenOnly = a1CodegenDisabled || process.argv.includes('--a1-codegen-only');
assert.ok(!a1CodegenOnly || process.argv.slice(3).every(value => [a1CodegenDisabled ? '--a1-codegen-disabled-only' : '--a1-codegen-only', '--settlement-schema'].includes(value)), 'Choose only one A1 codegen scenario');
const a1CodegenEvidence = {};
const f5RfqOnly = process.argv.includes('--f5-rfq-only');
assert.ok(!f5RfqOnly || process.argv.slice(3).every(value => ['--f5-rfq-only', '--settlement-schema'].includes(value)), 'Choose only the F5 RFQ scenario');
const f5RfqEvidence = {};
const f3ProjectOnly = process.argv.includes('--f3-projects-only');
assert.ok(!f3ProjectOnly || process.argv.slice(3).every(value => ['--f3-projects-only', '--settlement-schema'].includes(value)), 'Choose only the F3 project scenario');
const f3ProjectEvidence = {};
const f2SupplierOnly = process.argv.includes('--f2-suppliers-only');
assert.ok(!f2SupplierOnly || process.argv.slice(3).every(value => ['--f2-suppliers-only', '--settlement-schema'].includes(value)), 'Choose only the F2 supplier scenario');
const f2SupplierEvidence = {};
const reportModes = ['--report-only', '--report-http-only'];
const reportOnly = reportModes.some(mode => process.argv.includes(mode));
assert.ok(!reportOnly || process.argv.slice(3).length === 1, 'Choose one report verification mode');
assert.ok(process.argv.filter(argument => argument.startsWith('--report-')).every(argument => reportModes.includes(argument)), 'Unknown report verification mode');
const reportEvidence = { datasets: false, sourceScopes: false, sourcePermissions: false, tenants: false, definitions: false, concurrency: false, noStore: false, precision: false, innerBoundaries: false, rateLimits: false, revocation: false, employeeCache: false, expenseDates: false, desktop: false, mobile: false, lostResponse: false, sharedUi: false, cleanup: false };
const oauth2Only = ['--oauth2-only', '--oauth2-http-only', '--oauth2-ui-only', '--oauth2-disabled-only'].some(mode => process.argv.includes(mode));
const oauth2PortalCheck = process.argv.includes('--oauth2-portal-check');
assert.ok(!oauth2PortalCheck || process.argv.includes('--portal-auth-only'), 'OAuth portal isolation requires real portal authentication');
const oauth2Evidence = { disabled: false, clientPolicy: false, authorization: false, clientCredentials: false, concurrency: false, revocations: false, currentPermissions: false, tenants: false, scope: false, redisRecovery: false, rateLimits: false, desktop: false, mobile: false, secrets: false, cleanup: false };
const dataSourceModes = ['--data-source-disabled-only', '--data-source-foundation-only', '--data-source-foundation-http-only', '--data-source-foundation-ui-only', '--data-source-live-http-only', '--data-source-recovery-http-only', '--data-source-recovery-ui-only'];
const dataSourceLiveOnly = process.argv.includes('--data-source-live-http-only') || process.argv.includes('--data-source-recovery-http-only') || process.argv.includes('--data-source-recovery-ui-only');
const dataSourceOnly = dataSourceModes.some(mode => process.argv.includes(mode));
assert.ok(process.argv.filter(argument => dataSourceModes.includes(argument)).length <= 1, 'Choose one data source verification mode');
assert.ok(process.argv.filter(argument => argument.startsWith('--data-source-')).every(argument => dataSourceModes.includes(argument)), 'Unknown data source verification mode');
const dataSourceEvidence = { mode: 'not_run', encryption: false, permissions: false, versions: false, disabled: false, signedDisable: false, desktop: false, mobile: false, lostResponse: false, expiredIdentity: false, totpChallenge: false, secrets: false, cleanup: false, accountPermissionVerification: false, connectionEnabled: false, multiInstancePoolAcceptance: false, discoveryStale: false, rediscoveryRecovery: false, disabledRestart: false };
const filePreviewOnly = ['--file-preview-only', '--file-preview-http-only', '--file-preview-ui-only', '--file-preview-workflow-only'].some(mode => process.argv.includes(mode));
const filePreviewEvidence = { contexts: false, permissions: false, tenants: false, sessions: false, signatures: false, revoked: false, expiry: false, content: false, ranges: false, workflow: false, rateLimits: false, proxy: false, desktop: false, mobile: false, cleanup: false, secrets: false };
const businessSearchOnly = process.argv.includes('--business-search-only') || process.argv.includes('--business-search-http-only') || process.argv.includes('--business-search-ui-only');
const businessSearchEvidence = { sixTypes: false, scope: false, tenants: false, revoked: false, limits: false, privateFields: false, desktop: false, mobile: false };
const platformAccessOnly = process.argv.includes('--platform-access-only') || process.argv.includes('--platform-access-totp-only');
const platformAccessEvidence = { mode: 'not_run', roleBoundaries: false, secrets: false };
const tenantPackageModes = ['--tenant-package-disabled-only', '--tenant-package-http-only', '--tenant-package-only', '--tenant-package-recovery-only', '--tenant-package-cleanup-only', '--tenant-package-storage-only', '--tenant-package-audit-only', '--tenant-package-operators-only', '--tenant-package-storage-bound-only', '--tenant-package-storage-import-only', '--tenant-package-storage-hr-only', '--tenant-package-storage-contract-only', '--tenant-package-storage-generated-only'];
const schemaOptions = ['--settlement-schema', '--referral-schema', '--im-schema'];
const tenantPackageOnly = tenantPackageModes.some(mode => process.argv.includes(mode));
const imConfigOnly = process.argv.includes('--im-config-only') || process.argv.includes('--im-config-disabled-only');
const loginSessionOnly = process.argv.includes('--login-session-only') || process.argv.includes('--login-session-totp-only');
assert.ok(!loginSessionOnly || process.argv.slice(3).filter(argument => !schemaOptions.includes(argument)).length === 1, 'Choose one login session verification mode');
const imConfigEvidence = { disabled: false, permissions: false, management: false, encryption: false, desktop: false, mobile: false, lostResponse: false, cleanup: false };
assert.ok(!imConfigOnly || process.argv.slice(3).filter(argument => !schemaOptions.includes(argument)).length === 1, 'Choose one IM configuration verification mode');
assert.ok(process.argv.filter(argument => argument.startsWith('--tenant-package-')).every(argument => tenantPackageModes.includes(argument)), 'Unknown tenant package verification mode');
assert.ok(!tenantPackageOnly || process.argv.slice(3).filter(argument => !schemaOptions.includes(argument)).length === 1, 'Choose one tenant package verification mode');
const tenantPackageEvidence = { disabled: false, platformIdentity: false, management: false, assignment: false, currentPermissions: false, employeeIntersection: false, synchronization: false, operatorOwnership: false, liveAllowlistRevocation: false, quotas: false, storageCrossServices: false, storageRollback: false, storageCleanup: false, storageBoundDownloads: false, storageBoundCleanup: false, desktop: false, mobile: false, lostResponse: false, syncRecovery: false, naturalExpiry: false, secrets: false, configurationSecrets: false, cleanup: false };
Object.assign(tenantPackageEvidence, { storageAdditionalEntries: false, storageAdditionalCleanup: false,
  storageMeetingPhoto: false, storageMeetingPhotoCleanup: false, storageWorkflowFile: false, storageWorkflowFileCleanup: false,
  storageSeverancePolicy: false, storageSeverancePolicyCleanup: false, storageImportFiles: false, storageImportFilesCleanup: false,
  storageTrainingAgreement: false, storageTrainingAgreementCleanup: false, storageExitInterview: false, storageExitInterviewCleanup: false,
  storageAdvanceProof: false, storageAdvanceProofCleanup: false, storageContractFiles: false, storageContractFilesCleanup: false,
  storageImportGenerated: false, storageImportGeneratedCleanup: false });
const hrOvertimeOnly = process.argv.includes('--hr-overtime-only');
const hrOvertimeEvidence = { calendar: false, approvalAndCompensatory: false, cumulative: false, shifts: false, security: false, desktop: false, mobile: false, lostResponse: false, compLeave: false, limits: false, shiftSafety: false, adjacentAttendance: false, payroll: false, restoration: false, secrets: false };
const hrSkillsOnly = process.argv.includes('--hr-skills-only');
const hrTrainingCertificateCapacity = process.argv.includes('--hr-training-certificate-capacity');
assert.ok(!hrTrainingCertificateCapacity || hrSkillsOnly, 'Training capacity requires the isolated HR skills harness');
const hrTrainingCapacityEvidence = { storageTrainingCertificate: false, storageTrainingCertificateCleanup: false, storageTrainingCertificateSecrets: false };
const hrGrievanceArchiveCapacity = process.argv.includes('--hr-grievance-archive-capacity');
assert.ok(!hrGrievanceArchiveCapacity || hrSkillsOnly && !hrTrainingCertificateCapacity, 'Choose one HR generated file capacity mode');
const hrGrievanceCapacityEvidence = { storageGrievanceArchive: false, storageGrievanceArchiveCleanup: false, storageGrievanceArchiveSecrets: false };
const hrEmployeeCertificateCapacity = process.argv.includes('--hr-employee-certificate-capacity');
assert.ok(!hrEmployeeCertificateCapacity || hrSkillsOnly && !hrTrainingCertificateCapacity && !hrGrievanceArchiveCapacity, 'Choose one HR generated file capacity mode');
const hrEmployeeCertificateEvidence = { identity: false, capacity: false, retry: false, cleanup: false, secrets: false };
const hrContactCapacityOnly = process.argv.includes('--hr-contact-capacity-only');
const hrReferralsOnly = process.argv.includes('--hr-referrals-core-only');
const hrExitInterviewsOnly = process.argv.includes('--hr-exit-interviews-only');
const hrTrainingRecoveryOnly = process.argv.includes('--hr-training-recovery-only');
const hrSeverancePolicyOnly = process.argv.includes('--hr-severance-policy-only');
const hrSettlementDraftOnly = process.argv.includes('--hr-settlement-draft-only');
const hrSettlementDraftEvidence = { http: false, review: false, missingSources: false, permissions: false, tenants: false, concurrency: false };
const settlementSessionSecrets = new Set();
if (hrSettlementDraftOnly) {
  const fundsModes = ['--hr-settlement-funds-payment', '--hr-settlement-funds-netting', '--hr-settlement-funds-receipt'];
  assert.ok(process.argv.slice(3).every(argument => ['--hr-settlement-draft-only', '--hr-settlement-draft-complete', '--hr-settlement-asset-reminder-only', '--hr-settlement-approval-complete', '--hr-settlement-reversal-complete', '--hr-settlement-reversal-focused', '--hr-settlement-proof-capacity', '--settlement-schema', ...fundsModes].includes(argument)
    || /^--hr-settlement-funds-resume=[a-f0-9]{12}$/.test(argument)), 'Choose only settlement draft verification');
  assert.ok(fundsModes.filter(mode => process.argv.includes(mode)).length <= 1, 'Choose one settlement funds direction');
  const resumed = process.argv.filter(argument => argument.startsWith('--hr-settlement-funds-resume='));
  assert.ok(!process.argv.includes('--hr-settlement-proof-capacity') || process.argv.includes('--hr-settlement-funds-receipt') && !resumed.length && !process.argv.includes('--hr-settlement-reversal-complete'), 'Receipt capacity requires a fresh independently approved negative settlement');
  assert.ok(!process.argv.includes('--hr-settlement-reversal-complete') || !resumed.length && fundsModes.some(mode => process.argv.includes(mode)), 'Reversal requires a fresh approved funds lifecycle');
  assert.ok(!process.argv.includes('--hr-settlement-reversal-focused') || process.argv.includes('--hr-settlement-reversal-complete'), 'Focused original approval requires complete reversal verification');
  assert.ok(resumed.length <= 1 && (!resumed.length || fundsModes.some(mode => process.argv.includes(mode))), 'Resume requires exactly one owned fixture and funds direction');
}
const hrSeverancePolicyEvidence = { http: false, desktop: false, mobile: false, lostResponse: false, privateFile: false, permissions: false, tenants: false, concurrency: false, cleanup: false };
if (hrSeverancePolicyOnly) assert.ok(process.argv.slice(3).every(argument => ['--hr-severance-policy-only', '--hr-severance-policy-complete', '--settlement-schema'].includes(argument)), 'Choose only severance policy verification');
const hrTrainingRecoveryEvidence = { http: false, desktop: false, mobile: false, lostResponse: false, uiComplete: false };
const hrExitInterviewEvidence = { http: false, desktop: false, mobile: false, lostResponse: false, uiComplete: false };
const hrAdvancePayrollOnly = process.argv.includes('--hr-advance-payroll-only');
const hrAdvanceApprovalOnly = process.argv.includes('--hr-advance-approval-http-only') || process.argv.includes('--hr-advance-approval-only');
const hrAdvanceSettlementOnly = process.argv.includes('--hr-advance-settlement');
const hrAdvanceSettlementPayroll = process.argv.includes('--hr-advance-settlement-payroll');
const hrAdvanceSettlementAllSources = process.argv.includes('--hr-advance-settlement-all-sources');
const hrSettlementReferral = process.argv.includes('--hr-settlement-referral');
const hrSettlementReferralRepay = process.argv.some(value => /^--hr-referral-repay=[a-f0-9]{12}$/.test(value));
assert.ok(!hrSettlementReferralRepay || hrSettlementReferral && !process.argv.some(value => value.startsWith('--hr-referral-recover=')), 'Repayment requires one retained referral settlement');
if (hrSettlementReferral) assert.ok(hrAdvanceSettlementAllSources, 'Referral combination requires all settlement sources');
if (hrAdvanceSettlementAllSources) assert.ok(hrAdvanceSettlementPayroll && hrAdvanceSettlementOnly, 'All sources require the payroll settlement combination');
if (hrAdvanceSettlementPayroll) assert.ok(hrAdvanceSettlementOnly, 'Payroll combination requires actual settlement mode');
if (hrAdvanceSettlementOnly) assert.ok(hrAdvanceApprovalOnly && process.argv.includes('--hr-settlement-reversal-complete')
  && process.argv.slice(3).every(argument => ['--settlement-schema', '--hr-advance-approval-http-only', '--hr-advance-settlement', '--hr-advance-settlement-payroll', '--hr-advance-settlement-all-sources', '--hr-settlement-referral', '--hr-settlement-reversal-complete'].includes(argument)
    || hrSettlementReferral && /^--hr-referral-(?:recover|repay)=[a-f0-9]{12}$/.test(argument)
    || hrAdvanceSettlementPayroll && !hrSettlementReferralRepay && /^--hr-settlement-payroll-period=[1-9][0-9]*$/.test(argument)), 'Choose only the funded advance and settlement combination');
const hrAdvanceApprovalEvidence = { rules: false, approval: false, funding: false, rejections: false, delayedCallback: false, settlementGuard: false, paymentRollback: false, paymentReplay: false, concurrency: false, permissions: false, tenants: false, http: false, desktop: false, mobile: false, cleanup: false };
const hrAdvanceEntryOnly = hrAdvanceApprovalOnly || process.argv.includes('--hr-advance-entry-only') || process.argv.includes('--hr-advance-entry-http-only');
const hrAdvanceEntryEvidence = { drafts: false, proofs: false, repayments: false, writeoff: false, permissions: false, tenants: false, rollback: false, concurrency: false, desktop: false, mobile: false, lostResponse: false };
const hrAdvancePayrollEvidence = { calculation: false, cancellation: false, payment: false, correction: false, singleGeneration: false, permissions: false, concurrency: false };
const hrAppraisalsOnly = process.argv.includes('--hr-appraisals-only') || process.argv.includes('--hr-appraisals-http-only');
const hrAppraisalEvidence = { scope: false, weights: false, stages: false, scores: false, calibration: false, frozen: false, identity: false, tenants: false, allMethods: false, invitations: false, concurrent: false, customerDisabled: false, legacy: false, desktop: false, mobile: false, lostResponse: false, uiLifecycle: false };
const hrSkillEvidence = { definitions: false, fiveSources: false, permissions: false, expiry: false, recommendations: false, concurrency: false, desktop: false, mobile: false, lostResponse: false };
const portalDisabledOnly = process.argv.includes('--portal-disabled-only');
const portalUiOnly = process.argv.includes('--portal-auth-ui-only');
const portalGuardOnly = process.argv.includes('--portal-employee-guard-only');
const portalKnowledgeOnly = process.argv.includes('--portal-knowledge-only');
const portalTicketOnly = process.argv.includes('--portal-ticket-only');
assert.ok(!process.argv.includes('--portal-ticket-capacity') || portalTicketOnly, 'Portal capacity requires the real portal ticket lifecycle');
const portalFinanceOnly = process.argv.includes('--portal-finance-only');
const portalContractOnly = process.argv.includes('--portal-contract-only');
const businessSearchPortalOnly = process.argv.includes('--business-search-portal-only');
const businessSearchPortalEvidence = { identity: false, boundaries: false, secrets: false, grantsRestored: false };
const filePreviewPortalOnly = process.argv.includes('--file-preview-portal-only');
const filePreviewPortalEvidence = { identity: false, boundaries: false, secrets: false, grantsRestored: false };
const portalOnly = process.argv.includes('--portal-auth-only') || portalDisabledOnly || portalUiOnly || portalGuardOnly || portalKnowledgeOnly || portalTicketOnly || portalContractOnly || portalFinanceOnly || businessSearchPortalOnly || filePreviewPortalOnly;
const portalFinanceEvidence = { permissions: false, precision: false, concurrency: false, withdrawal: false, identity: false, files: false, audit: false, desktop: false, mobile: false, lostResponse: false };
const portalContractEvidence = { workflow: false, signature: false, selection: false, permissions: false, precision: false, concurrency: false, withdrawal: false, identity: false, desktop: false, mobile: false, lostResponse: false };
const ticketEvidence = { submission: false, assignment: false, publication: false, permissions: false, files: false, concurrency: false, desktop: false, mobile: false, lostResponse: false };
const knowledgeEvidence = { workflow: false, frozenVersion: false, sanitization: false, permissions: false, concurrency: false, withdrawal: false, desktop: false, mobile: false, attachmentPublication: false };
const portalEvidence = { disabled: false, smtp: false, invitation: false, authentication: false, domainIsolation: false, permissions: false, concurrency: false, rateLimits: false, invitationExpiry: false, contactChanges: false, revokedDelivery: false, desktop: false, mobile: false };
const storageOnly = process.argv.slice(3).includes('--storage-only');
const recoveryOnly = process.argv.slice(3).includes('--recovery-only');
const syncRecoveryOnly = process.argv.slice(3).includes('--sync-recovery-only');
const importUiOnly = process.argv.slice(3).includes('--import-ui-only');
const observabilityUiOnly = process.argv.slice(3).includes('--observability-ui-only');
const storageUiOnly = process.argv.slice(3).includes('--storage-ui-only');
const holidayUiOnly = process.argv.slice(3).includes('--holiday-ui-only');
const holidayConsumersOnly = process.argv.slice(3).includes('--holiday-consumers-only');
const configurationOnly = process.argv.slice(3).includes('--configuration-only');
const messageDeliveryOnly = process.argv.slice(3).includes('--message-delivery-only');
const rfqEmailOnly = process.argv.slice(3).includes('--rfq-email-only');
const crmEmailOnly = process.argv.slice(3).includes('--crm-email-only');
const crmEmailEvidence = { smtp: false, publicTracking: false, desktop: false, mobile: false };
const emailArchiveOnly = process.argv.includes('--email-archive-only');
const emailArchiveEvidence = { business: false, permissions: false, attachments: false, smtp: false, callbacks: false, publicTracking: false, desktop: false, mobile: false };
const rfqSelectionOnly = process.argv.slice(3).includes('--rfq-selection-only');
const agentOnly = process.argv.slice(3).includes('--agent-only');
const gatewayOnly = process.argv.slice(3).some(argument => ['--gateway-only', '--gateway-archive-only'].includes(argument));
const gatewayDesignerOnly = process.argv.slice(3).includes('--gateway-designer-only');
const gatewayRewindOnly = process.argv.slice(3).includes('--gateway-rewind-only');
const withdrawalUiOnly = process.argv.slice(3).includes('--withdrawal-ui-only');
const addSignOnly = process.argv.slice(3).some(argument => ['--addsign-only', '--addsign-combinations-only'].includes(argument));
const addSignUiOnly = process.argv.slice(3).includes('--addsign-ui-only');
const meetingOnly = process.argv.slice(3).some(argument => ['--meeting-only', '--meeting-boundaries-only', '--meeting-recovery-only'].includes(argument));
const meetingMode = process.argv.includes('--meeting-recovery-only') ? 'recovery' : process.argv.includes('--meeting-boundaries-only') ? 'boundaries' : 'full';
const meetingEvidence = { uiWorkflows: false, smtpProvider: 'not_used' };
const opportunityTeamsOnly = process.argv.includes('--opportunity-teams-only');
const opportunityReopenOnly = process.argv.includes('--opportunity-reopen-only');
const menuLayoutOnly = process.argv.includes('--menu-layout-only');
const opportunityImportOnly = process.argv.includes('--opportunity-import-only');
const opportunityOnly = process.argv.includes('--opportunity-only') || opportunityTeamsOnly || opportunityReopenOnly || opportunityImportOnly;
const opportunityEvidence = opportunityImportOnly
  ? { mixed: false, versionConflicts: false, duplicateRows: false, permissions: false, stageRules: false, liveRevalidation: false,
    products: false, idempotency: false, recovery: false, legacyCreateOnly: false, templates: false, desktop: false, mobile: false, lostResponse: false, cleanup: false }
  : { business: false, workflow: false, reminders: false, desktop: false, mobile: false };
const hrSuccessorUiOnly = process.argv.includes('--hr-successor-ui-only');
const hrSuccessorOnly = process.argv.includes('--hr-successor-only') || hrSuccessorUiOnly;
const quoteContractCopyUiOnly = process.argv.includes('--quote-contract-copy-ui-only');
const quoteContractCopyOnly = process.argv.includes('--quote-contract-copy-only') || quoteContractCopyUiOnly;
const quoteHandoverOnly = process.argv.includes('--quote-handover-only') || hrSuccessorOnly || quoteContractCopyOnly;
const receiptRefundOnly = process.argv.includes('--receipt-refund-only');
const receivableTeamsOnly = process.argv.includes('--receivable-team-only');
const receivableProtectionOnly = process.argv.includes('--receivable-protection-only') || receiptRefundOnly || receivableTeamsOnly;
const contractTeamOnly = process.argv.includes('--contract-team-only') || process.argv.includes('--contract-team-http-only');
const contractPerformanceOnly = process.argv.includes('--contract-performance-only') || process.argv.includes('--contract-performance-http-only');
const oaSignMethodsOnly = process.argv.includes('--oa-sign-methods');
assert.ok(!oaSignMethodsOnly || process.argv.includes('--contract-performance-only') && !process.argv.includes('--contract-performance-http-only'), 'Signing methods require the dedicated UI mode');
const oaSignMethodsEvidence = { OFFLINE: false, ESIGN: false, SCAN: false, ui: false, secrets: false };
const oaContractTermsOnly = process.argv.includes('--oa-contract-terms');
assert.ok(!oaContractTermsOnly || process.argv.includes('--contract-performance-only') && !oaSignMethodsOnly, 'Choose one contract verification mode');
const oaContractTermsEvidence = { terms: false, states: false, templates: false, audit: false, timeline: false, reports: false, secrets: false };
const oaContractRemindersOnly = process.argv.includes('--oa-contract-reminders');
assert.ok(!oaContractRemindersOnly || process.argv.includes('--contract-performance-only') && !oaSignMethodsOnly && !oaContractTermsOnly, 'Choose one contract verification mode');
const oaContractRemindersEvidence = { job: false, due: false, overdue: false, escalation: false, deduplication: false, secrets: false };
const oaContractReviewOnly = process.argv.includes('--oa-contract-review');
assert.ok(!oaContractReviewOnly || process.argv.includes('--contract-performance-only') && !oaSignMethodsOnly && !oaContractTermsOnly && !oaContractRemindersOnly, 'Choose one contract verification mode');
const oaContractReviewEvidence = { termsUi: false, timelineUi: false, locks: false, reports: false, reportUi: false, secrets: false };
const oaContractAccessOnly = process.argv.includes('--oa-contract-access');
assert.ok(!oaContractAccessOnly || process.argv.includes('--contract-performance-only') && !oaSignMethodsOnly && !oaContractTermsOnly && !oaContractRemindersOnly && !oaContractReviewOnly, 'Choose one contract verification mode');
const oaContractAccessEvidence = { ownership: false, revocation: false, restoration: false, denials: false, secrets: false };
const a3JobBusinessOnly = process.argv.includes('--a3-job-business');
const a3JobLongOnly = process.argv.includes('--a3-job-long');
const a3JobFailureOnly = process.argv.includes('--a3-job-failure');
const a3JobTenantFailureOnly = process.argv.includes('--a3-job-tenant-failure');
const a3JobCrmFailureOnly = process.argv.includes('--a3-job-crm-failure');
const a3JobOutageOnly = process.argv.includes('--a3-job-outage');
const a3JobPeerOnly = process.argv.includes('--a3-job-peer');
const a3AuditArchiveOnly = process.argv.includes('--a3-audit-archive');
const a3TimerScanOnly = process.argv.includes('--a3-timer-scan');
const a3NaturalCadenceOnly = process.argv.includes('--a3-natural-cadence');
assert.ok(!a3NaturalCadenceOnly || a3TimerScanOnly, 'Natural cadence uses the timer verification setup');
const a3AnomalyScanOnly = process.argv.includes('--a3-anomaly-scan');
const a3DeadlockScanOnly = process.argv.includes('--a3-deadlock-scan');
const a3TaskTimeoutOnly = process.argv.includes('--a3-task-timeout');
const a3ProcessReconcileOnly = process.argv.includes('--a3-process-reconcile');
const a3TaskReminderOnly = process.argv.includes('--a3-task-reminder');
const a3DictScanOnly = process.argv.includes('--a3-dict-scan');
const a3CrmNotificationsOnly = process.argv.includes('--a3-crm-notifications');
const a3OaScansOnly = process.argv.includes('--a3-oa-scans');
const a3QuoteExpireOnly = process.argv.includes('--a3-quote-expire');
const a3TrainingArchiveOnly = process.argv.includes('--a3-training-archive');
const a3BusinessExitOnly = process.argv.includes('--a3-business-exit');
const a4YearlyOnly = process.argv.includes('--a4-yearly-reminder');
const a3JobClusterOnly = process.argv.includes('--a3-job-cluster');
const a3JobPrimaryFaultOnly = process.argv.includes('--a3-job-primary-fault');
const a3JobFailoverOnly = process.argv.includes('--a3-job-failover');
const a3JobSchedulersOnly = process.argv.includes('--a3-job-schedulers');
const a3JobReportFaultOnly = process.argv.includes('--a3-job-report-fault');
assert.ok([a3AnomalyScanOnly, a3DeadlockScanOnly, a3TimerScanOnly, a3AuditArchiveOnly, a3TaskTimeoutOnly, a3ProcessReconcileOnly, a3TaskReminderOnly, a3DictScanOnly, a3CrmNotificationsOnly, a3OaScansOnly, a3QuoteExpireOnly, a3TrainingArchiveOnly, a3BusinessExitOnly, a4YearlyOnly, a3JobClusterOnly, a3JobPrimaryFaultOnly, a3JobFailoverOnly, a3JobReportFaultOnly, a3JobSchedulersOnly, a3JobPeerOnly, a3JobOutageOnly, a3JobBusinessOnly, a3JobLongOnly, a3JobFailureOnly, a3JobTenantFailureOnly, a3JobCrmFailureOnly, process.argv.includes('--a3-job-management')].filter(Boolean).length <= 1, 'Choose one A3 verification mode');
const a3JobManagementOnly = a3AnomalyScanOnly || a3DeadlockScanOnly || a3TimerScanOnly || a3AuditArchiveOnly || a3TaskTimeoutOnly || a3ProcessReconcileOnly || a3TaskReminderOnly || a3DictScanOnly || a3CrmNotificationsOnly || a3OaScansOnly || a3QuoteExpireOnly || a3TrainingArchiveOnly || a3BusinessExitOnly || a4YearlyOnly || a3JobClusterOnly || a3JobPrimaryFaultOnly || a3JobFailoverOnly || process.argv.includes('--a3-job-management') || a3JobBusinessOnly || a3JobLongOnly || a3JobFailureOnly || a3JobTenantFailureOnly || a3JobCrmFailureOnly || a3JobOutageOnly || a3JobPeerOnly || a3JobSchedulersOnly || a3JobReportFaultOnly;
assert.ok(!a3JobManagementOnly || process.argv.includes('--contract-performance-only') && !oaSignMethodsOnly && !oaContractTermsOnly && !oaContractRemindersOnly && !oaContractReviewOnly && !oaContractAccessOnly, 'Choose one dedicated verification mode');
const a3JobManagementEvidence = a3NaturalCadenceOnly ? { configuration:false, cadence:false, reports:false, timerPrecision:false, pause:false, permissions:false, restoration:false, secrets:false } : (a3AnomalyScanOnly || a3DeadlockScanOnly) ? { counts:false, failure:false, retention:false, alarm:false, recovery:false, repeat:false, permissions:false, restoration:false, secrets:false } : a3TimerScanOnly ? { failure:false, rollback:false, continuation:false, alarm:false, backoff:false, recovery:false, notification:false, repeat:false, cleanup:false, permissions:false, restoration:false, secrets:false } : a3AuditArchiveOnly ? { preview:false, collision:false, rollback:false, continuation:false, alarm:false, recovery:false, duplicate:false, repeat:false, permissions:false, restoration:false, runtimeRestoration:false, secrets:false } : a3TaskTimeoutOnly ? { messageFailure:false, rollback:false, continuation:false, alarm:false, backoff:false, recovery:false, manualFailure:false, manualLimit:false, delivery:false, repeat:false, cleanup:false, permissions:false, restoration:false, secrets:false } : a3ProcessReconcileOnly ? { injection: false, rollback: false, continuation: false, failure: false, alarm: false, boundaries: false, recovery: false, counts: false, repeat: false, delivery: false, permissions: false, restoration: false, secrets: false } : a3TaskReminderOnly ? { injection: false, retention: false, continuation: false, failure: false, alarm: false, boundaries: false, recovery: false, counts: false, repeat: false, delivery: false, permissions: false, restoration: false, secrets: false } : a3DictScanOnly ? { injection: false, rollback: false, continuation: false, failure: false, alarm: false, recovery: false, counts: false, repeat: false, permissions: false, restoration: false, secrets: false } : a3CrmNotificationsOnly ? { daily: false, slaFailure: false, sla: false, breachFailure: false, breach: false, boundaries: false, delivery: false, permissions: false, deduplication: false, restoration: false, secrets: false } : a3OaScansOnly ? { borrowFailure: false, borrow: false, expiry: false, riskRollback: false, risk: false, delivery: false, permissions: false, deduplication: false, restoration: false, secrets: false } : a3QuoteExpireOnly ? { injection: false, rollback: false, continuation: false, failure: false, alarm: false, boundaries: false, recovery: false, counts: false, repeat: false, permissions: false, restoration: false, secrets: false } : a3TrainingArchiveOnly ? { injection: false, continuation: false, failure: false, alarm: false, recovery: false, counts: false, repeat: false, permissions: false, restoration: false, secrets: false } : a3BusinessExitOnly ? { running: false, stopped: false, rollback: false, timeout: false, alarm: false, recovery: false, deduplication: false, permissions: false, runtimeRestoration: false, restoration: false, secrets: false } : a4YearlyOnly ? { execution: false, recipients: false, isolation: false, delivery: false, permissions: false, deduplication: false, restoration: false, secrets: false } : a3JobClusterOnly ? { instances: false, route: false, routingMatrix: false, business: false, deduplication: false, scheduling: false, pause: false, logs: false, permissions: false, restoration: false, runtimeRestoration: false, peerRestoration: false, capacityRestoration: false, secrets: false } : a3JobPrimaryFaultOnly ? { instances: false, route: false, dispatchOwnership: false, stopped: false, continuation: false, management: false, restarted: false, rejoin: false, pause: false, logs: false, permissions: false, restoration: false, runtimeRestoration: false, peerRestoration: false, capacityRestoration: false, secrets: false } : a3JobFailoverOnly ? { instances: false, dispatchOwnership: false, stopped: false, continuation: false, management: false, restarted: false, rejoin: false, pause: false, logs: false, permissions: false, restoration: false, peerRestoration: false, capacityRestoration: false, secrets: false } : a3JobReportFaultOnly ? { route: false, dropped: false, business: false, recovered: false, successReplay: false, unreachable: false, timeout: false, alarm: false, lateReplay: false, permissions: false, runtimeRestoration: false, restoration: false, proxyRestoration: false, secrets: false }
  : a3JobSchedulersOnly ? { instances: false, cron: false, fixedRate: false, fixedDelay: false, pause: false, resume: false, liveChange: false, logs: false, permissions: false, restoration: false, peerRestoration: false, capacityRestoration: false, secrets: false }
  : a3JobPeerOnly ? { async: false, skipped: false, report: false, delivery: false, deduplication: false, permissions: false, restoration: false, secrets: false, instances: false, peerDeduplication: false, peerLock: false, peerBusiness: false, peerRestoration: false, capacityRestoration: false }
  : a3JobOutageOnly ? { stopped: false, retries: false, alarm: false, offline: false, page: false, permissions: false, recovery: false, restoration: false, secrets: false }
  : a3JobCrmFailureOnly ? { injected: false, continuation: false, failed: false, alarm: false, recovery: false, permissions: false, restoration: false, secrets: false }
  : a3JobTenantFailureOnly ? { injected: false, continuation: false, failed: false, alarm: false, restoration: false, secrets: false }
  : a3JobFailureOnly ? { failed: false, delivery: false, escalation: false, replay: false, recovery: false, permissions: false, restoration: false, secrets: false }
  : a3JobLongOnly ? { async: false, skipped: false, report: false, delivery: false, deduplication: false, permissions: false, restoration: false, secrets: false }
  : a3JobBusinessOnly ? { contract: false, pool: false, delivery: false, scheduling: false, metrics: false, ui: false, permissions: false, restoration: false, secrets: false }
  : { validation: false, manual: false, scheduling: false, lateDetail: false, liveChange: false, editorUi: false, logUi: false, internalBoundary: false, permissions: false, restoration: false, secrets: false };
const salesTargetUiOnly = process.argv.includes('--sales-target-ui-only');
const salesTargetOnly = process.argv.includes('--sales-target-only') || process.argv.includes('--sales-target-http-only') || salesTargetUiOnly;
const salesTargetEvidence = { receipts: false, refundCallback: false, basisSwitch: false, permissions: false, concurrency: false, desktop: false, mobile: false, lostResponse: false };
const contractPerformanceEvidence = { conditions: false, workflow: false, signature: false, dateSupplement: false, dueJob: false, pendingSyncRecovery: false, pendingSyncUi: false, permissions: false, internalReplay: false, desktop: false, mobile: false };
const contractTeamEvidence = { business: false, permissions: false, concurrency: false, currencyLock: false, desktop: false, mobile: false, sourceCopy: false, contractFacts: false, receivableTeam: false };
const receivableEvidence = { business: false, permissions: false, concurrency: false, desktop: false, mobile: false, receiptLedger: false, refundWorkflowCallback: false };
const quoteHandoverEvidence = { quoteHttp: false, sourceCopy: false, currencyLock: false, quoteDesktop: false, quoteMobile: false, hrOffboardWithoutSuccessor: false, manualHandover: false, hrAutomaticSuccessor: false };
assert.ok([hrOvertimeOnly, hrExitInterviewsOnly, hrReferralsOnly, hrContactCapacityOnly, oauth2Only, dataSourceOnly, filePreviewOnly, platformAccessOnly, businessSearchOnly, hrAdvanceEntryOnly, hrAdvancePayrollOnly, hrAppraisalsOnly, hrSkillsOnly, storageOnly, recoveryOnly, syncRecoveryOnly, importUiOnly, observabilityUiOnly, storageUiOnly, holidayUiOnly, holidayConsumersOnly, configurationOnly, messageDeliveryOnly, rfqEmailOnly, crmEmailOnly, emailArchiveOnly, rfqSelectionOnly, agentOnly, gatewayOnly, gatewayDesignerOnly, gatewayRewindOnly, withdrawalUiOnly, addSignOnly, addSignUiOnly, meetingOnly, opportunityOnly, quoteHandoverOnly, receivableProtectionOnly, menuLayoutOnly, contractTeamOnly, contractPerformanceOnly, salesTargetOnly, portalOnly].filter(Boolean).length <= 1, 'Choose one verification mode');
const check = (label, condition) => { assert.ok(condition, label); checks.push(label); console.log(`PASS ${label}`); };
const mysqlEnvironment = { ...process.env };
delete mysqlEnvironment.MYSQL_PWD;
const database = (statement) => {
  const result = spawnSync('mysql.exe', ['--no-defaults', '--protocol=TCP', '--host=127.0.0.1', `--port=${state.mysqlPort}`, '--user=root', '--batch', '--raw', '--skip-column-names', '--default-character-set=utf8mb4', 'cloud_flow_db'], {
    input: statement, encoding: 'utf8', timeout: 30000, windowsHide: true, env: mysqlEnvironment,
  });
  assert.equal(result.status, 0, result.error?.message || result.stderr);
  return result.stdout.trim();
};
assert.equal(await fs.realpath(database('SELECT @@datadir;')), await fs.realpath(path.join(directory, 'mysql-data')));
assert.ok(schemaOptions.filter(option => process.argv.includes(option)).length <= 1, 'Choose one approved schema baseline');
const expectedTables = process.argv.includes('--settlement-schema') ? 374 : process.argv.includes('--referral-schema') ? 368 : process.argv.includes('--im-schema') ? 366 : tenantPackageOnly ? 360 : 357;
check(`正式脚本批准结构共${expectedTables}张表，数据库目录严格隔离`, database("SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='cloud_flow_db' AND table_type='BASE TABLE';") === String(expectedTables));
const accounts = JSON.parse(await fs.readFile(path.join(directory, 'private', 'accounts.json'), 'utf8'));
const frontend = path.join(root, 'cloudflow-frontend');
const requireFrontend = createRequire(path.join(frontend, 'package.json'));
const requireBrowser = createRequire(path.join(process.env.CLOUDFLOW_PLAYWRIGHT_HOME || path.join(root, '.cloudflow-runtime', 'playwright'), 'package.json'));
const { createServer } = await import(pathToFileURL(requireFrontend.resolve('vite')).href);
const { chromium } = requireBrowser('playwright-core');
const gateway = state.services.find(service => service.name === 'gateway');
assert.ok(gateway && Number.isInteger(gateway.port));
const reservation = reservePort();
await new Promise((resolve, reject) => { reservation.once('error', reject); reservation.listen(0, '127.0.0.1', resolve); });
const frontendPort = portalOnly ? state.portalFixture?.port : oauth2Only && state.oauth2Fixture ? state.oauth2Fixture.port : reservation.address().port;
await new Promise(resolve => reservation.close(resolve));
let portalHttps;
if (portalOnly) {
  const tlsDirectory = await fs.realpath(path.join(directory, 'private/portal'));
  assert.equal(tlsDirectory, await fs.realpath(state.portalFixture.directory));
  assert.equal(state.portalFixture.loopback, true);
  assert.ok(Number.isInteger(frontendPort) && frontendPort > 1024 && frontendPort < 65536);
  assert.equal(state.portalFixture.publicUrl, `https://127.0.0.1:${frontendPort}`);
  portalHttps = { pfx: await fs.readFile(path.join(tlsDirectory, 'tls.p12')), passphrase: await fs.readFile(path.join(tlsDirectory, 'store-password.txt'), 'utf8') };
  const exportedCertificate = spawnSync(path.join(process.env.JAVA_HOME, 'bin/keytool.exe'), [
    '-exportcert', '-rfc', '-alias', 'portal-test', '-keystore', path.join(tlsDirectory, 'tls.p12'),
    '-storepass:env', 'CLOUDFLOW_PORTAL_CERTIFICATE_PASSWORD',
  ], { encoding: 'utf8', windowsHide: true, timeout: 30000, env: { ...process.env, CLOUDFLOW_PORTAL_CERTIFICATE_PASSWORD: portalHttps.passphrase } });
  assert.equal(exportedCertificate.status, 0, 'Owned portal certificate export failed');
  const certificate = new X509Certificate(exportedCertificate.stdout);
  check('门户自签名测试证书有效且绑定本机地址', Date.parse(certificate.validFrom) <= Date.now()
    && Date.parse(certificate.validTo) > Date.now() && certificate.checkIP('127.0.0.1') === '127.0.0.1');
  console.log(`PORTAL_TLS_CERTIFICATE: valid_now=true; loopback_ip_verified=true; self_signed_fixture=true; expires_utc=${new Date(certificate.validTo).toISOString()}; production_modified=false`);
}
const server = await createServer({
  root: frontend, configFile: path.join(frontend, 'vite.config.ts'), logLevel: 'error',
  server: {
    host: '127.0.0.1', port: frontendPort, strictPort: true,
    ...(f1AssetOnly || f2SupplierOnly || f3ProjectOnly || f5RfqOnly || a1CodegenOnly || reportOnly || tenantPackageOnly || imConfigOnly || loginSessionOnly ? { hmr: false, watch: null } : {}),
    ...(portalHttps ? { https: portalHttps, cors: false } : {}),
    proxy: {
      '/api': { target: `http://127.0.0.1:${gateway.port}`, changeOrigin: false, rewrite: requestPath => requestPath.replace(/^\/api/, ''),
        ...(portalOnly ? { configure(proxy) {
          proxy.on('proxyReq', (proxied, incoming) => {
            proxied.setHeader('X-Forwarded-For', incoming.socket.remoteAddress);
            proxied.setHeader('X-Forwarded-Proto', 'https');
            proxied.removeHeader('Forwarded');
          });
        } } : {}),
      },
      '/ws': { target: `http://127.0.0.1:${gateway.port}`, changeOrigin: false, ws: true },
    },
  },
});
let browser;
let failure;
let origin;

async function authenticate(page, credentials, options = {}) {
  return page.evaluate(async supplied => {
    const auth = await import('/src/services/api/auth.ts');
    const storage = await import('/src/utils/authStorage.ts');
    const challenge = await auth.getCaptcha();
    const pixels = async source => {
      const image = new Image();
      image.src = source;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = image.width;
      canvas.height = image.height;
      const drawing = canvas.getContext('2d');
      drawing.drawImage(image, 0, 0);
      return { width: image.width, height: image.height, data: drawing.getImageData(0, 0, image.width, image.height).data };
    };
    const background = await pixels(challenge.bgImage);
    const slider = await pixels(challenge.sliderImage);
    const alpha = (horizontal, vertical) => slider.data[(vertical * slider.width + horizontal) * 4 + 3];
    const edges = [];
    for (let vertical = 4; vertical < slider.height - 4; vertical += 2) {
      for (let horizontal = 4; horizontal < slider.width - 4; horizontal += 2) {
        if (alpha(horizontal, vertical) < 240) continue;
        for (const [shiftX, shiftY] of [[4, 0], [-4, 0], [0, 4], [0, -4]]) {
          if (alpha(horizontal + shiftX, vertical + shiftY) < 30) edges.push([horizontal, vertical, horizontal + shiftX, vertical + shiftY]);
        }
      }
    }
    if (edges.length < 5) throw new Error('Insufficient captcha edges');
    const luminance = (horizontal, vertical) => {
      const offset = (vertical * background.width + horizontal) * 4;
      return background.data[offset] * 0.2126 + background.data[offset + 1] * 0.7152 + background.data[offset + 2] * 0.0722;
    };
    let best = { position: 0, score: -Infinity };
    for (let position = slider.width; position < background.width - slider.width; position++) {
      const score = edges.reduce((total, edge) => total + luminance(position + edge[0], challenge.y + edge[1]) - luminance(position + edge[2], challenge.y + edge[3]), 0);
      if (score > best.score) best = { position, score };
    }
    const passed = await auth.checkCaptcha({ uuid: challenge.uuid, x: best.position });
    const release = await auth.getActiveLegalRelease(supplied.tenantCode);
    const response = await auth.login(supplied.tenantCode, supplied.username, supplied.password, passed.passToken, release.releaseCode);
    if (response.requiresTotp) {
      if (supplied.acceptTotpChallenge) return { authenticated: false, challenge: response };
      throw new Error('Real second factor is required');
    }
    if (!response.token || response.forcePasswordChange) throw new Error('Login did not issue a usable session');
    storage.setAuthToken(response.token);
    return { authenticated: true, ...(supplied.captureToken ? { token: response.token } : {}) };
  }, { ...credentials, acceptTotpChallenge: options.acceptTotpChallenge === true,
    captureToken: process.argv.includes('--hr-settlement-proof-capacity') });
}

async function session(username, credentialSource = username) {
  const sourceAccount = accounts.find(account => account.username === credentialSource);
  assert.ok(sourceAccount, 'Isolated account is present');
  const credentials = { ...sourceAccount, username };
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block', ignoreHTTPSErrors: portalOnly });
  await context.route('**/*', route => {
    const address = new URL(route.request().url());
    return address.origin === origin ? route.continue() : route.abort();
  });
  const page = await context.newPage();
  page.on('response', response => {
    const responsePath = new URL(response.url()).pathname;
    if (response.status() >= 400 && responsePath.startsWith('/api/')) requests.push({ path: responsePath.slice(4), method: response.request().method(), status: response.status(), source: 'browser' });
  });
  await page.goto(`${origin}/login`, { waitUntil: 'domcontentloaded' });
  let authenticated;
  try {
    authenticated = await authenticate(page, credentials);
  } catch (error) {
    if (!/请求过于频繁|登录尝试过于频繁/.test(error.message)) throw error;
    console.log('WAIT 保留登录限流，等待61秒后重新完成真实验证码与登录');
    await new Promise(resolve => setTimeout(resolve, 61000));
    authenticated = await authenticate(page, credentials);
  }
  check(`${username}通过真实验证码和登录服务`, authenticated.authenticated);
  if (process.argv.includes('--hr-settlement-proof-capacity')) {
    assert.ok(typeof authenticated.token === 'string' && authenticated.token.length > 0);
    settlementSessionSecrets.add(authenticated.token.replace(/^Bearer /, ''));
  }
  return page;
}

async function api(page, requestPath, options = {}) {
  const result = await page.evaluate(async supplied => {
    const storage = await import('/src/utils/authStorage.ts');
    const token = storage.getAuthToken();
    const headers = { ...(supplied.headers || {}) };
    if (token) headers.Authorization = token.startsWith('Bearer ') ? token : `Bearer ${token}`;
    const csrf = document.cookie.split(';').map(value => value.trim()).find(value => value.startsWith('XSRF-TOKEN='));
    if (csrf) headers['X-CSRF-Token'] = decodeURIComponent(csrf.slice('XSRF-TOKEN='.length));
    let body;
    if (supplied.file) {
      body = new FormData();
      const content = Uint8Array.from(atob(supplied.file.content), character => character.charCodeAt(0));
      body.append('file', new File([content], supplied.file.name, { type: supplied.file.type || 'text/csv' }));
    } else if (supplied.body !== undefined) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(supplied.body);
    }
    const response = await fetch(`/api${supplied.requestPath}`, { method: supplied.method || 'GET', credentials: 'same-origin', headers, body });
    const common = { status: response.status, traceId: response.headers.get('X-Trace-Id'), disposition: response.headers.get('Content-Disposition'),
      contentType: response.headers.get('Content-Type'), cacheControl: response.headers.get('Cache-Control'), nosniff: response.headers.get('X-Content-Type-Options'), csp: response.headers.get('Content-Security-Policy'),
      contentRange: response.headers.get('Content-Range'), acceptRanges: response.headers.get('Accept-Ranges'), referrerPolicy: response.headers.get('Referrer-Policy') };
    if ((response.headers.get('Content-Type') || '').includes('json')) return { ...common, body: await response.json() };
    const bytes = await response.arrayBuffer();
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return { ...common, size: bytes.byteLength, sha256: Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, '0')).join('') };
  }, { requestPath, ...options });
  requests.push({ path: new URL(requestPath, 'http://127.0.0.1').pathname, method: options.method || 'GET', status: result.status, code: result.body?.code, traceId: result.traceId });
  return result;
}

function successful(result, label) {
  assert.equal(result.status, 200, `${label}: HTTP ${result.status} ${result.body?.msg || result.body?.message || ''}`);
  assert.equal(result.body?.code, 200, `${label}: ${result.body?.msg || result.body?.message || 'missing response'}`);
  return result.body.data;
}

function csv(definition, rows) {
  const quote = value => `"${String(value ?? '').replaceAll('"', '""')}"`;
  return Buffer.from('\uFEFF' + [definition.columns.map(column => quote(column.name)).join(','), ...rows.map(row => definition.columns.map(column => quote(row[column.field])).join(','))].join('\r\n') + '\r\n', 'utf8');
}

async function upload(page, definition, rows, suffix) {
  const content = csv(definition, rows);
  const result = await api(page, `/${definition.service}/system/import/${definition.bizType}/upload`, {
    method: 'POST', file: { name: `g-integration-${suffix}.csv`, content: content.toString('base64') },
  });
  const task = successful(result, `${definition.bizType}上传`);
  assert.match(String(task.taskId), /^\d+$/);
  tasks.push({ service: definition.service, taskId: task.taskId, bizType: definition.bizType });
  check(`${suffix}原文件保存后状态为待校验`, task.status === 'UPLOADED' && task.totalRows === rows.length);
  return { task, content, service: definition.service };
}

async function settled(page, service, taskId) {
  const deadline = Date.now() + 180000;
  while (Date.now() < deadline) {
    const task = successful(await api(page, `/${service}/system/import/${taskId}`), '查询真实任务');
    if (!['VALIDATING', 'IMPORTING'].includes(task.status)) return task;
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  throw new Error('Real import task timed out');
}

async function validate(page, uploaded) {
  successful(await api(page, `/${uploaded.service}/system/import/${uploaded.task.taskId}/validate`, { method: 'POST' }), '启动校验');
  return settled(page, uploaded.service, uploaded.task.taskId);
}

async function execute(page, uploaded, skipInvalidRows) {
  successful(await api(page, `/${uploaded.service}/system/import/${uploaded.task.taskId}/execute`, { method: 'POST', body: { skipInvalidRows } }), '启动导入');
  return settled(page, uploaded.service, uploaded.task.taskId);
}

async function eventuallyDatabase(statement, expected) {
  const deadline = Date.now() + 10000;
  do {
    if (expected(database(statement))) return true;
    await new Promise(resolve => setTimeout(resolve, 250));
  } while (Date.now() < deadline);
  return false;
}

try {
  for (const service of state.services) {
    const health = await fetch(`http://127.0.0.1:${service.healthPort}/actuator/health`).then(response => response.json());
    check(`${service.name}真实服务健康检查通过`, health.status === 'UP');
  }
  await server.listen();
  const address = server.httpServer.address();
  assert.ok(address && typeof address === 'object');
  origin = `${portalOnly ? 'https' : 'http'}://127.0.0.1:${address.port}`;
  browser = await chromium.launch({ headless: true });
  const admin = await session('g_import_admin');
  if (f1AssetOnly) {
    const { verifyF1Assets } = await import('./verify-f1-assets.mjs');
    await verifyF1Assets({ admin, api, successful, session, database, check, directory, caseTag, state, requests,
      browser, origin, authenticate, accounts, evidence: f1AssetEvidence });
  } else if (a1CodegenOnly) {
    const { verifyA1Codegen } = await import('./verify-a1-codegen.mjs');
    await verifyA1Codegen({ admin, api, successful, session, database, check, directory, caseTag, state, requests,
      browser, origin, authenticate, accounts, evidence: a1CodegenEvidence });
  } else if (f5RfqOnly) {
    const { verifyF5Rfq } = await import('./verify-f5-rfq.mjs');
    await verifyF5Rfq({ admin, api, successful, session, database, check, directory, caseTag, state, requests,
      browser, origin, authenticate, accounts, evidence: f5RfqEvidence });
  } else if (f3ProjectOnly) {
    const { verifyF3Projects } = await import('./verify-f3-projects.mjs');
    await verifyF3Projects({ admin, api, successful, session, database, check, directory, caseTag, state, requests,
      browser, origin, authenticate, accounts, evidence: f3ProjectEvidence });
  } else if (f2SupplierOnly) {
    const { verifyF2Suppliers } = await import('./verify-f2-suppliers.mjs');
    await verifyF2Suppliers({ admin, api, successful, session, database, check, directory, caseTag, state, requests,
      browser, origin, authenticate, accounts, evidence: f2SupplierEvidence });
  } else if (loginSessionOnly) {
    await verifyLoginSession({ admin, api, successful, session, authenticate, database, check, state, accounts, caseTag, requests });
  } else if (imConfigOnly) {
    await verifyImConfig({ admin, api, successful, session, database, check, directory, caseTag, state, accounts, evidence: imConfigEvidence });
  } else if (tenantPackageOnly) {
    if (process.argv.includes('--tenant-package-only')) {
      await verifyConfiguration({ admin, api, successful, session, database, check, directory, caseTag });
      tenantPackageEvidence.configurationSecrets = true;
    }
    await verifyTenantPackage({ admin, api, successful, session, database, check, directory, caseTag, state, accounts, evidence: tenantPackageEvidence });
  } else if (reportOnly) {
    await verifyReport({ admin, api, successful, session, database, check, directory, caseTag, state, accounts, requests, evidence: reportEvidence, httpOnly: process.argv.includes('--report-http-only') });
  } else if (oauth2Only) {
    await verifyOauth2({ admin, api, successful, session, database, check, directory, caseTag, state, accounts, requests, evidence: oauth2Evidence });
  } else if (dataSourceOnly) {
    await (dataSourceLiveOnly ? verifyDataSourceLive : verifyDataSource)({ admin, api, successful, session, database, check, directory, caseTag, state, accounts, requests, evidence: dataSourceEvidence });
  } else if (filePreviewOnly) {
    await verifyFilePreview({ admin, api, successful, session, database, check, directory, caseTag, state, accounts, requests, evidence: filePreviewEvidence });
  } else if (platformAccessOnly) {
    await verifyPlatformAccess({ admin, api, successful, session, database, check, directory, caseTag, state, accounts, evidence: platformAccessEvidence });
  } else if (businessSearchOnly) {
    await verifyBusinessSearch({ admin, api, successful, session, database, check, directory, caseTag, state, evidence: businessSearchEvidence });
  } else if (hrSettlementDraftOnly) {
    await verifyHrSettlementDraft({ admin, api, successful, session, database, check, directory, caseTag, state, requests,
      sessionSecrets: settlementSessionSecrets, evidence: hrSettlementDraftEvidence });
  } else if (hrSeverancePolicyOnly) {
    await verifyHrSeverancePolicy({ admin, api, successful, session, database, check, directory, caseTag, state, evidence: hrSeverancePolicyEvidence });
  } else if (hrTrainingRecoveryOnly) {
    await verifyHrTrainingRecovery({ admin, api, successful, session, database, check, directory, caseTag, state, evidence: hrTrainingRecoveryEvidence });
  } else if (hrExitInterviewsOnly) {
    await verifyHrExitInterviews({ admin, api, successful, session, database, check, directory, caseTag, state, evidence: hrExitInterviewEvidence });
  } else if (hrReferralsOnly) {
    await verifyHrReferrals({ admin, api, successful, session, database, check, directory, caseTag, state });
  } else if (hrContactCapacityOnly) {
    await verifyHrContactCapacity({ admin, api, successful, session, database, check, directory, caseTag, state });
  } else if (hrAdvanceEntryOnly) {
    if (hrAdvanceSettlementOnly) await verifyHrAdvanceSettlement({ admin, api, successful, session, database, check, directory, caseTag, state, requests, accounts, evidence: hrAdvanceApprovalEvidence });
    else if (hrAdvanceApprovalOnly) await verifyHrAdvanceApproval({ admin, api, successful, session, database, check, directory, caseTag, state, requests, evidence: hrAdvanceApprovalEvidence });
    else await verifyHrAdvanceEntry({ admin, api, successful, session, database, check, directory, caseTag, state, evidence: hrAdvanceEntryEvidence });
  } else if (hrAdvancePayrollOnly) {
    await verifyHrAdvancePayroll({ admin, api, successful, session, database, check, directory, caseTag, state, evidence: hrAdvancePayrollEvidence });
  } else if (hrOvertimeOnly) {
    await verifyHrOvertime({ admin, api, successful, session, database, check, directory, caseTag, state, accounts, evidence: hrOvertimeEvidence });
  } else if (hrAppraisalsOnly) {
    await verifyHrAppraisals({ admin, api, successful, session, database, check, directory, caseTag, state, accounts, evidence: hrAppraisalEvidence });
  } else if (hrSkillsOnly) {
    if (hrEmployeeCertificateCapacity) await verifyHrEmployeeCertificateCapacity({ admin, api, successful, session, database, check, caseTag, state, accounts, evidence: hrEmployeeCertificateEvidence });
    else if (hrTrainingCertificateCapacity) await verifyHrTrainingCertificateCapacity({ admin, api, successful, session, database, check, caseTag, state, accounts, evidence: hrTrainingCapacityEvidence });
    else if (hrGrievanceArchiveCapacity) await verifyHrGrievanceArchiveCapacity({ admin, api, successful, session, database, check, caseTag, state, accounts, evidence: hrGrievanceCapacityEvidence });
    else await verifyHrSkills({ admin, api, successful, session, database, check, directory, caseTag, state, accounts, evidence: hrSkillEvidence });
  } else if (portalGuardOnly) {
    const employee = await session('g_holiday_employee');
    await verifyPortalEmployeeGuard({ employee, origin, check, directory, caseTag });
    const response = await api(employee, '/auth/system/portal-user/list');
    check('员工真实后端门户管理查询返回403且不返回数据', response.status === 403 && response.body?.code === 403 && !response.body?.data);
  } else if (portalOnly) {
    await verifyPortalAuthentication({ admin, api, successful, session, database, check, directory, caseTag, state, browser, origin, requests, accounts, evidence: portalEvidence, disabledOnly: portalDisabledOnly, uiOnly: portalUiOnly, knowledgeOnly: portalKnowledgeOnly, knowledgeEvidence, ticketOnly: portalTicketOnly, ticketEvidence, contractOnly: portalContractOnly, contractEvidence: portalContractEvidence, financeOnly: portalFinanceOnly, financeEvidence: portalFinanceEvidence, searchOnly: businessSearchPortalOnly, searchEvidence: businessSearchPortalEvidence, previewOnly: filePreviewPortalOnly, previewEvidence: filePreviewPortalEvidence });
  } else if (salesTargetOnly) {
    await verifySalesTarget({ admin, api, successful, session, database, check, directory, caseTag, state, evidence: salesTargetEvidence, httpOnly: process.argv.includes('--sales-target-http-only'), uiOnly: salesTargetUiOnly });
  } else if (contractPerformanceOnly) {
    if (a3JobManagementOnly) await (a3AnomalyScanOnly ? verifyA3AnomalyScan : a3DeadlockScanOnly ? verifyA3DeadlockScan : a3TimerScanOnly ? verifyA3TimerScan : a3AuditArchiveOnly ? verifyA3AuditArchive : a3TaskTimeoutOnly ? verifyA3TaskTimeout : a3ProcessReconcileOnly ? verifyA3ProcessReconcile : a3TaskReminderOnly ? verifyA3TaskReminder : a3DictScanOnly ? verifyA3DictScan : a3CrmNotificationsOnly ? verifyA3CrmNotifications : a3OaScansOnly ? verifyA3OaScans : a3QuoteExpireOnly ? verifyA3QuoteExpire : a3TrainingArchiveOnly ? verifyA3TrainingArchive : a3BusinessExitOnly ? verifyA3BusinessExit : a4YearlyOnly ? verifyHolidayYearlyReminder : a3JobClusterOnly ? verifyA3JobCluster : a3JobPrimaryFaultOnly ? verifyA3JobPrimaryFault : a3JobFailoverOnly ? verifyA3JobFailover : a3JobReportFaultOnly ? verifyA3JobReportFault : a3JobSchedulersOnly ? verifyA3JobSchedulers : a3JobPeerOnly ? verifyA3JobPeer : a3JobOutageOnly ? verifyA3JobOutage : a3JobCrmFailureOnly ? verifyA3JobCrmFailure : a3JobTenantFailureOnly ? verifyA3JobTenantFailure : a3JobFailureOnly ? verifyA3JobFailure : a3JobLongOnly ? verifyA3JobLongRunning : a3JobBusinessOnly ? verifyA3JobBusiness : verifyA3JobManagement)({ admin, api, successful, session, database, check, caseTag, state, accounts, evidence: a3JobManagementEvidence });
    else if (oaContractAccessOnly) await verifyOaContractAccess({ admin, api, successful, session, database, check, caseTag, state, accounts, evidence: oaContractAccessEvidence });
    else if (oaContractReviewOnly) await verifyOaContractReview({ admin, api, successful, session, database, check, caseTag, state, accounts, evidence: oaContractReviewEvidence });
    else if (oaContractRemindersOnly) await verifyOaContractReminders({ admin, api, successful, session, database, check, caseTag, state, accounts, evidence: oaContractRemindersEvidence });
    else if (oaContractTermsOnly) await verifyOaContractTerms({ admin, api, successful, session, database, check, caseTag, state, accounts, evidence: oaContractTermsEvidence });
    else if (oaSignMethodsOnly) await verifyOaSignMethods({ admin, api, successful, session, database, check, caseTag, state, accounts, evidence: oaSignMethodsEvidence });
    else await verifyContractPerformance({ admin, api, successful, session, database, check, directory, caseTag, state, evidence: contractPerformanceEvidence, httpOnly: process.argv.includes('--contract-performance-http-only') });
  } else if (contractTeamOnly) {
    await verifyContractTeam({ admin, api, successful, session, database, check, directory, caseTag, state, evidence: contractTeamEvidence, httpOnly: process.argv.includes('--contract-team-http-only') });
  } else if (receivableProtectionOnly) {
    await verifyReceivableProtection({ admin, api, successful, session, database, check, directory, caseTag, state, evidence: receivableEvidence, refundOnly: receiptRefundOnly, teamsOnly: receivableTeamsOnly });
  } else if (quoteHandoverOnly) {
    await verifyQuoteHandover({ admin, api, successful, session, database, check, directory, caseTag, state, evidence: quoteHandoverEvidence, hrSuccessorOnly, hrSuccessorUiOnly, quoteContractCopyOnly, quoteContractCopyUiOnly });
  } else if (emailArchiveOnly) {
    await verifyEmailArchive({ admin, api, successful, session, database, check, directory, caseTag, state, evidence: emailArchiveEvidence });
  } else if (opportunityOnly) {
    if (opportunityImportOnly) await verifyOpportunityImport({ admin, api, successful, session, database, check, directory, caseTag, state,
      evidence: opportunityEvidence, upload, validate, execute, settled, csv, tasks, requests });
    else await verifyOpportunity({ admin, api, successful, session, database, check, directory, caseTag, state, evidence: opportunityEvidence, teamsOnly: opportunityTeamsOnly, reopenOnly: opportunityReopenOnly });
  } else if (menuLayoutOnly) {
    await verifyMenuLayout({ admin, session, check, directory, caseTag, requests });
  } else if (meetingOnly) {
    await verifyMeeting({ admin, api, successful, session, database, check, directory, caseTag, state, evidence: meetingEvidence });
  } else if (storageOnly) {
    await verifyStorage({ admin, api, successful, session, database, check, state, directory, caseTag, requests, pending });
  } else if (recoveryOnly || syncRecoveryOnly) {
    await verifyRecovery({ admin, api, successful, session, database, check, state, directory, caseTag, pending, upload, validate, execute, settled, syncOnly: syncRecoveryOnly });
  } else if (importUiOnly) {
    await verifyImportInterface({ admin, api, successful, session, database, check, directory, caseTag, requests, tasks, pending, csv });
  } else if (observabilityUiOnly) {
    await verifyObservabilityInterface({ admin, api, successful, session, database, check, directory, caseTag, requests, pending });
  } else if (storageUiOnly) {
    await verifyStorageInterface({ admin, api, successful, session, database, check, directory, caseTag, requests });
  } else if (holidayUiOnly) {
    await verifyHolidayInterface({ admin, api, successful, session, database, check, directory, caseTag, requests, tasks, pending, csv, upload, validate, execute });
  } else if (holidayConsumersOnly) {
    await verifyHolidayConsumers({ admin, api, successful, session, database, check, caseTag, pending });
  } else if (configurationOnly) {
    await verifyConfiguration({ admin, api, successful, session, database, check, directory, caseTag });
  } else if (messageDeliveryOnly) {
    await verifyMessageDelivery({ admin, api, successful, session, database, check, directory, caseTag, accounts });
  } else if (crmEmailOnly) {
    await verifyCrmEmail({ admin, api, successful, session, database, check, directory, caseTag, accounts, state, evidence: crmEmailEvidence });
  } else if (rfqEmailOnly) {
    await verifyRfqEmail({ admin, api, successful, session, database, check, directory, caseTag, accounts, state });
  } else if (rfqSelectionOnly) {
    await verifyRfqSelection({ admin, api, successful, session, database, check, directory, caseTag });
  } else if (agentOnly) {
    await verifyAgentInterface({ admin, api, successful, session, database, check, directory, caseTag, state });
  } else if (gatewayOnly || gatewayRewindOnly || withdrawalUiOnly || addSignOnly || addSignUiOnly) {
    await verifyGatewayInterface({ admin, api, successful, session, database, check, directory, caseTag, state, rewindOnly: gatewayRewindOnly, withdrawalUiOnly, addSignOnly, addSignUiOnly });
  } else if (gatewayDesignerOnly) {
    await verifyGatewayDesigner({ admin, api, successful, session, database, check, directory, caseTag, state });
  } else {
  const definitions = [];
  for (const service of ['auth', 'hr', 'oa', 'crm']) {
    if (!state.services.some(candidate => candidate.name === service)) {
      pending.push(`${service}:真实服务未启动`);
      continue;
    }
    const available = successful(await api(admin, `/${service}/system/import/types`), `${service}业务定义`);
    definitions.push(...available.map(definition => ({ ...definition, service })));
    check(`${service}业务定义来自真实服务`, available.length > 0);
  }
  const definition = businessType => {
    const found = definitions.find(candidate => candidate.bizType === businessType);
    assert.ok(found, `真实业务定义存在: ${businessType}`);
    return found;
  };
  for (const businessType of ['HOLIDAY', 'ASSET', 'SUPPLIER']) {
    const current = definition(businessType);
    const result = await api(admin, `/${current.service}/system/import/${businessType}/template`);
    check(`${businessType}真实模板下载`, result.status === 200 && result.size > 1000 && result.disposition?.includes('.xlsx'));
  }
  const calendarCode = `G_CALENDAR_${caseTag}`;
  const calendarId = database(`INSERT INTO sys_holiday_calendar (tenant_id,calendar_code,calendar_name,status) VALUES (100000,'${calendarCode}','隔离验收日历','ENABLED'); SELECT LAST_INSERT_ID();`);
  assert.match(calendarId, /^\d+$/);
  const holidayRow = { calendarId: calendarCode, holidayDate: '2040-10-01', dateType: 'HOLIDAY', holidayName: '隔离验收节假日', triplePayFlag: '1', yearNo: '2040', remark: 'G批真实服务验收' };
  const supplierRow = { supplierCode: `G_SUPPLIER_${caseTag}`, supplierName: 'G真实验收供应商', categoryId: 'G_IMPORT_SUPPLIER', supplierType: 'SERVICE', creditCode: 'G' + caseTag.toUpperCase().padEnd(17, '0'), contactName: '验收联系人', contactPhone: '010-12345678', contactEmail: 'g-import@example.test', registerCapital: '1000.00', registerDate: '2020-01-01', taxRate: '0.13', currency: 'CNY', status: 'ACTIVE' };
  const assetRow = { assetCode: `G_ASSET_${caseTag}`, name: 'G真实验收资产', categoryId: 'G_IMPORT_ASSET', purchaseAmount: '6000.00', purchaseDate: '2026-09-01', salvageValue: '300.00', openingAccumulatedDepreciation: '0.00', depreciationFlag: '1', usefulLifeMonths: '36', availableFromDate: '2026-09-01', depreciationMethod: 'STRAIGHT_LINE', depreciationFrequency: 'MONTHLY' };
  const cases = [
    { businessType: 'HOLIDAY', row: holidayRow, count: `SELECT COUNT(*) FROM sys_holiday_date WHERE calendar_id=${calendarId} AND holiday_date='2040-10-01' AND tenant_id=100000;` },
    { businessType: 'SUPPLIER', row: supplierRow, count: `SELECT COUNT(*) FROM oa_supplier WHERE supplier_code='${supplierRow.supplierCode}' AND tenant_id=100000;` },
    { businessType: 'ASSET', row: assetRow, count: `SELECT COUNT(*) FROM oa_asset WHERE asset_code='${assetRow.assetCode}' AND tenant_id=100000;` },
  ];
  for (const current of cases) {
    check(`${current.businessType}业务记录初始为空`, database(current.count) === '0');
    const uploaded = await upload(admin, definition(current.businessType), [current.row], current.businessType.toLowerCase());
    const validated = await validate(admin, uploaded);
    check(`${current.businessType}真实校验成功且未写入业务`, validated.status === 'VALIDATED' && validated.validRows === 1 && validated.invalidRows === 0 && database(current.count) === '0');
    const completed = await execute(admin, uploaded, false);
    check(`${current.businessType}调用真实业务服务保存并落库`, completed.status === 'SUCCESS' && completed.successRows === 1 && completed.failRows === 0 && database(current.count) === '1');
    const original = await api(admin, `/${uploaded.service}/system/import/${uploaded.task.taskId}/file`);
    check(`${current.businessType}原文件下载与上传字节相同`, original.sha256 === createHash('sha256').update(uploaded.content).digest('hex'));
    const duplicate = await api(admin, `/${uploaded.service}/system/import/${uploaded.task.taskId}/execute`, { method: 'POST', body: { skipInvalidRows: true } });
    check(`${current.businessType}完成后重复执行被拒绝`, duplicate.body?.code !== 200 && database(current.count) === '1');
  }
  check('资产导入生成36期真实折旧计划', database(`SELECT COUNT(*) FROM oa_asset_depreciation_schedule WHERE asset_id=(SELECT asset_id FROM oa_asset WHERE asset_code='${assetRow.assetCode}' AND tenant_id=100000);`) === '36');
  const supplierDuplicates = await upload(admin, definition('SUPPLIER'), [
    { ...supplierRow, creditCode: 'H' + caseTag.toUpperCase().padEnd(17, '0') },
    { ...supplierRow, supplierCode: supplierRow.supplierCode + '_DUPLICATE' },
  ], 'supplier-duplicates');
  const duplicateValidation = await validate(admin, supplierDuplicates);
  check('供应商编号与信用代码分别检查真实数据库重复', duplicateValidation.status === 'VALIDATED' && duplicateValidation.invalidRows === 2 && duplicateValidation.validRows === 0);
  const invalidRows = [
    { ...holidayRow, holidayDate: '2041-10-01', yearNo: '2041' },
    { ...holidayRow, holidayDate: '2041-10-02', dateType: 'UNKNOWN', yearNo: '2041' },
  ];
  const mixed = await upload(admin, definition('HOLIDAY'), invalidRows, 'mixed');
  const mixedValidated = await validate(admin, mixed);
  check('错误行校验准确计数', mixedValidated.status === 'VALIDATED' && mixedValidated.validRows === 1 && mixedValidated.invalidRows === 1);
  const preview = successful(await api(admin, `/auth/system/import/${mixed.task.taskId}/preview`), '真实错误预览');
  check('错误预览指向实际Excel行号', preview.errors.total === 1 && preview.errors.rows[0].rowNo === 3);
  const rejected = await api(admin, `/auth/system/import/${mixed.task.taskId}/execute`, { method: 'POST', body: { skipInvalidRows: false } });
  check('不跳过错误时执行前拒绝且零写入', rejected.body?.code !== 200 && database(`SELECT COUNT(*) FROM sys_holiday_date WHERE calendar_id=${calendarId} AND year_no=2041;`) === '0');
  const mixedCompleted = await execute(admin, mixed, true);
  check('跳过错误只保存合法行', mixedCompleted.status === 'PARTIAL' && mixedCompleted.successRows === 1 && mixedCompleted.failRows === 1 && database(`SELECT COUNT(*) FROM sys_holiday_date WHERE calendar_id=${calendarId} AND year_no=2041;`) === '1');
  const errorFile = await api(admin, `/auth/system/import/${mixed.task.taskId}/errors/file`);
  check('实际生成错误文件且可下载', errorFile.status === 200 && errorFile.size > 0 && !!errorFile.disposition);
  for (const username of ['g_import_other', 'g_import_tenant', 'g_import_readonly']) {
    const other = await session(username);
    for (const suffix of ['', '/file', '/preview', '/errors/file']) {
      const result = await api(other, `/auth/system/import/${mixed.task.taskId}${suffix}`);
      check(`${username}不能读取他人任务${suffix || '/status'}`, result.status === 403 || result.body?.code === 403);
    }
    const ownedList = successful(await api(other, '/auth/system/import/list'), '当前操作人任务列表');
    check(`${username}列表不暴露他人任务`, ownedList.rows.length === 0);
    if (username === 'g_import_readonly') {
      const before = database('SELECT COUNT(*) FROM sys_import_task;');
      const denied = await api(other, '/auth/system/import/HOLIDAY/upload', {
        method: 'POST', file: { name: 'readonly.csv', content: csv(definition('HOLIDAY'), [holidayRow]).toString('base64') },
      });
      check('只读账号不能上传且不创建任务', (denied.status === 403 || denied.body?.code === 403) && database('SELECT COUNT(*) FROM sys_import_task;') === before);
    }
    await other.context().close();
  }
  const batchRows = Array.from({ length: 501 }, (unusedRow, index) => {
    const date = new Date(Date.UTC(2050, 0, 1 + index));
    return { ...holidayRow, holidayDate: date.toISOString().slice(0, 10), yearNo: String(date.getUTCFullYear()) };
  });
  const supplierPrefix = `G_BG_SUPPLIER_${caseTag}_`;
  const assetPrefix = `G_BG_ASSET_${caseTag}_`;
  const backgroundCases = [
    { businessType: 'HOLIDAY', rows: batchRows, count: `SELECT COUNT(*) FROM sys_holiday_date WHERE calendar_id=${calendarId} AND year_no IN (2050,2051);` },
    {
      businessType: 'SUPPLIER',
      rows: Array.from({ length: 501 }, (unusedRow, index) => ({ ...supplierRow, supplierCode: `${supplierPrefix}${index}`, supplierName: `后台验收供应商-${caseTag}-${index}`, creditCode: `B${caseTag.toUpperCase()}${String(index).padStart(5, '0')}` })),
      count: `SELECT COUNT(*) FROM oa_supplier WHERE tenant_id=100000 AND LEFT(supplier_code,${supplierPrefix.length})='${supplierPrefix}';`,
    },
    {
      businessType: 'ASSET',
      rows: Array.from({ length: 501 }, (unusedRow, index) => ({ ...assetRow, assetCode: `${assetPrefix}${index}`, name: `后台验收资产-${caseTag}-${index}` })),
      count: `SELECT COUNT(*) FROM oa_asset WHERE tenant_id=100000 AND LEFT(asset_code,${assetPrefix.length})='${assetPrefix}';`,
    },
  ];
  for (const current of backgroundCases) {
    const background = await upload(admin, definition(current.businessType), current.rows, `background-${current.businessType.toLowerCase()}`);
    const batchValidated = await validate(admin, background);
    check(`${current.businessType}501行校验使用真实集中任务且不写业务`, batchValidated.status === 'VALIDATED' && batchValidated.validRows === 501 && !!batchValidated.jobLogId && database(current.count) === '0');
    const validationJob = batchValidated.jobLogId;
    const batchCompleted = await execute(admin, background, false);
    check(`${current.businessType}501行后台导入保存全部记录`, batchCompleted.status === 'SUCCESS' && batchCompleted.successRows === 501 && !!batchCompleted.jobLogId && batchCompleted.jobLogId !== validationJob && database(current.count) === '501');
    check(`${current.businessType}后台任务实际完成且计数一致`, await eventuallyDatabase(`SELECT execute_status FROM sys_job_log WHERE log_id=${batchCompleted.jobLogId};`, value => value === 'SUCCESS'));
    check(`${current.businessType}导入完成实际生成业务通知`, await eventuallyDatabase(`SELECT COUNT(*) FROM sys_message_record WHERE biz_type='IMPORT_TASK' AND biz_id='${background.task.taskId}';`, value => Number(value) > 0));
  }
  check('追踪号实际返回且不被网关重复追加', requests.filter(request => request.status === 200).every(request => /^[a-f0-9]{32}$/.test(request.traceId)));
  pending.push('EMPLOYEE和CUSTOMER业务保存尚未纳入本脚本；人力服务未启动时受依赖阻塞', '中断恢复及到期清理由独立恢复模式验收，本模式不重复停机', '本脚本未启动工作流服务，不验收审批链路');
  }
} catch (error) {
  const safeFailure = value => portalFinanceOnly ? String(value || '').replace(/(\b(?:authorization|portal-token|cookie|set-cookie|x-[a-z0-9-]*token)\s*:\s*)[^\r\n]+/gi, '$1[REDACTED]') : value;
  failure = { name: error.name, message: safeFailure(error.message), stack: safeFailure(error.stack) };
  console.error(portalFinanceOnly ? failure.stack : error);
  if ((hrOvertimeOnly || hrAdvanceEntryOnly || hrAppraisalsOnly || hrSkillsOnly || salesTargetOnly || contractPerformanceOnly || contractTeamOnly || receivableProtectionOnly || quoteHandoverOnly || emailArchiveOnly || opportunityOnly || crmEmailOnly || meetingOnly || rfqEmailOnly || rfqSelectionOnly || messageDeliveryOnly || agentOnly || gatewayOnly || gatewayDesignerOnly || gatewayRewindOnly || withdrawalUiOnly || addSignOnly || addSignUiOnly) && browser) {
    let pageIndex = 0;
    for (const context of browser.contexts()) for (const page of context.pages()) {
      try {
        await page.screenshot({ path: path.join(directory, `${hrSkillsOnly ? 'h2-skill' : salesTargetOnly ? 'h3-sales-target' : contractPerformanceOnly ? 'h3-contract-performance' : contractTeamOnly ? 'h3-contract-team' : receivableProtectionOnly ? 'h3-receivable-protection' : quoteHandoverOnly ? 'h3-quote-handover' : emailArchiveOnly ? 'h3-email-archive' : opportunityOnly ? 'h3-opportunity' : crmEmailOnly ? 'crm-email' : meetingOnly ? 'h4-meeting' : rfqEmailOnly || rfqSelectionOnly ? 'rfq-email' : 'agent'}-failure-${caseTag}-${pageIndex}.png`), fullPage: true, timeout: 5000 });
        console.log(`${hrSkillsOnly ? 'H2_SKILL' : salesTargetOnly ? 'H3_SALES_TARGET' : contractPerformanceOnly ? 'H3_CONTRACT_PERFORMANCE' : contractTeamOnly ? 'H3_CONTRACT_TEAM' : receivableProtectionOnly ? 'H3_RECEIVABLE_PROTECTION' : quoteHandoverOnly ? 'H3_QUOTE_HANDOVER' : emailArchiveOnly ? 'H3_EMAIL_ARCHIVE' : opportunityOnly ? 'H3_OPPORTUNITY' : crmEmailOnly ? 'E5_EMAIL' : meetingOnly ? 'H4_MEETING' : rfqEmailOnly || rfqSelectionOnly ? 'RFQ_EMAIL' : 'H1'}_PAGE_FAILURE: page=${pageIndex}; path=${new URL(page.url()).pathname}; alerts=${JSON.stringify(await page.getByRole('alert').allTextContents())}`);
        if (opportunityOnly) console.log(`H3_DIALOG_FAILURE: ${JSON.stringify(await page.evaluate(() => ({
          dialogs: [...document.querySelectorAll('[role="dialog"]')].map(element => ({ label: element.getAttribute('aria-label'), labelledBy: element.getAttribute('aria-labelledby'), title: document.getElementById(element.getAttribute('aria-labelledby'))?.textContent, hidden: element.closest('[aria-hidden="true"], [inert]')?.tagName, visible: element.getClientRects().length > 0 })),
          headings: [...document.querySelectorAll('[role="dialog"] :is(h3,h4)')].map(element => ({ text: element.textContent, visible: element.getClientRects().length > 0 })),
        })))}`);
      } catch { }
      pageIndex++;
    }
  }
  process.exitCode = 1;
} finally {
  if (a1CodegenOnly) {
    const category = a1CodegenDisabled ? 'a1-codegen-disabled' : 'a1-codegen';
    const codegenResult = JSON.stringify({ caseTag, passed: !failure, checks, requests, failure, evidence: a1CodegenEvidence,
      scope: 'A1 actual login, independent MySQL/Redis, metadata, generation, permissions, desktop/mobile; no API doubles',
      verifiedAt: new Date().toISOString() }, null, 2);
    await fs.writeFile(path.join(directory, `${category}-results-${caseTag}.json`), codegenResult, { flag: 'wx' });
    await fs.writeFile(path.join(directory, `${category}-results.json`), codegenResult, { flag: 'wx' });
    console.log(`A1_CODEGEN_REAL_RESULT: disabled=${a1CodegenDisabled}; checks=${checks.length}; failed=${failure ? 1 : 0}; requests=${requests.length}; evidence=${JSON.stringify(a1CodegenEvidence)}; interface_doubles=0`);
  }
  if (f5RfqOnly) {
    const rfqResult = JSON.stringify({ caseTag, passed: !failure, checks, requests, failure, evidence: f5RfqEvidence,
      scope: 'F5真实询价、供应商准入、逐家本机邮件、报价与保密、双视角比价、实际Excel、定标审批、采购转换、审计报表及电脑手机页面；独立六服务、MySQL和Redis，截止与重试日期为明确隔离输入，业务接口无替身。',
      verifiedAt: new Date().toISOString() }, null, 2);
    await fs.writeFile(path.join(directory, `f5-rfq-results-${caseTag}.json`), rfqResult, { flag: 'wx' });
    await fs.writeFile(path.join(directory, 'f5-rfq-results.json'), rfqResult, { flag: 'wx' });
    console.log(`F5_RFQ_REAL_RESULT: checks=${checks.length}; failed=${failure ? 1 : 0}; requests=${requests.length}; real_mysql=true; real_redis=true; real_http=true; evidence=${JSON.stringify(f5RfqEvidence)}; interface_doubles=0; production_modified=false`);
  }
  if (f3ProjectOnly) {
    const projectResult = JSON.stringify({ caseTag, passed: !failure, checks, requests, failure, evidence: f3ProjectEvidence,
      scope: 'F3真实项目任务、工时填报、经理审批、成本与计费、冲正、采购收货、实际发票、报表及电脑手机页面；独立六服务、MySQL和Redis，身份及历史期初为明确隔离输入，业务接口无替身。',
      verifiedAt: new Date().toISOString() }, null, 2);
    await fs.writeFile(path.join(directory, `f3-projects-results-${caseTag}.json`), projectResult, { flag: 'wx' });
    await fs.writeFile(path.join(directory, 'f3-projects-results.json'), projectResult, { flag: 'wx' });
    console.log(`F3_PROJECTS_REAL_RESULT: checks=${checks.length}; failed=${failure ? 1 : 0}; requests=${requests.length}; real_mysql=true; real_redis=true; real_http=true; evidence=${JSON.stringify(f3ProjectEvidence)}; interface_doubles=0; production_modified=false`);
  }
  if (f2SupplierOnly) {
    const supplierResult = JSON.stringify({ caseTag, passed: !failure, checks, requests, failure, evidence: f2SupplierEvidence,
      scope: 'F2供应商资料、分类、资质文件、评分及采购收货、真实审批、规则准入、集中提醒任务、经营报表、核心审计及电脑手机页面；独立六服务、MySQL和Redis，业务响应无替身。',
      verifiedAt: new Date().toISOString() }, null, 2);
    await fs.writeFile(path.join(directory, `f2-suppliers-results-${caseTag}.json`), supplierResult, { flag: 'wx' });
    await fs.writeFile(path.join(directory, 'f2-suppliers-results.json'), supplierResult, { flag: 'wx' });
    console.log(`F2_SUPPLIERS_REAL_RESULT: checks=${checks.length}; failed=${failure ? 1 : 0}; requests=${requests.length}; real_mysql=true; real_redis=true; real_http=true; evidence=${JSON.stringify(f2SupplierEvidence)}; interface_doubles=0; production_modified=false`);
  }
  if (f1AssetOnly) {
    const assetResult = JSON.stringify({ caseTag, passed: !failure, checks, requests, failure, evidence: f1AssetEvidence,
      scope: 'F1资产分类、年度折旧、实际过账和审批、维保及保险提醒、六类调拨、千资产异步任务与电脑手机页面；自有独立六服务、MySQL及Redis，业务接口无替身。',
      verifiedAt: new Date().toISOString() }, null, 2);
    await fs.writeFile(path.join(directory, `f1-assets-results-${caseTag}.json`), assetResult, { flag: 'wx' });
    await fs.writeFile(path.join(directory, 'f1-assets-results.json'), assetResult, { flag: 'wx' });
  }
  const category = menuLayoutOnly ? 'menu-layout' : addSignUiOnly ? 'addsign-ui' : addSignOnly ? 'addsign' : withdrawalUiOnly ? 'withdrawal-ui' : gatewayRewindOnly ? 'gateway-rewind' : gatewayDesignerOnly ? 'gateway-designer' : gatewayOnly ? 'gateway' : storageOnly ? 'storage' : syncRecoveryOnly ? 'sync-recovery' : recoveryOnly ? 'recovery' : importUiOnly ? 'import-ui' : observabilityUiOnly ? 'observability-ui' : storageUiOnly ? 'storage-ui' : holidayUiOnly ? 'holiday-ui' : configurationOnly ? 'configuration' : agentOnly ? 'agent' : 'import';
  const scope = menuLayoutOnly ? '真实管理员和员工授权菜单、桌面窄屏手机导航与离线提示；独立MySQL及Redis，无业务响应替身，不操作正式服务器' : storageOnly ? '真实网关、认证、本地存储及隔离MinIO存储' : syncRecoveryOnly ? '500行同步校验与逐行导入的真实停机恢复' : recoveryOnly ? '真实服务中断恢复、当前登录身份重试和30天到期清理' : importUiOnly ? '真实应用页面、登录、三类导入和文件下载，不替换业务响应' : observabilityUiOnly ? '真实前端错误上报、跨服务追踪与日志管理界面' : storageUiOnly ? '真实存储管理页面、本地与MinIO连接、密钥保护及权限隔离' : holidayUiOnly ? '真实登录、管理员/HR维护、经理/员工查询、日历页面及部门继承，使用隔离数据库和Redis' : configurationOnly ? '真实HTTP保存非空密钥、隔离数据库密文、响应脱敏、角色隔离与运行日志检查' : agentOnly ? '真实网关、认证、工作流、私有附件和双端代理页面，独立数据库及Redis，不替换接口响应' : '真实网关、认证、HOLIDAY/ASSET/SUPPLIER导入与集中任务';
  const result = JSON.stringify({ scope: addSignUiOnly ? '真实电脑和手机加签、暂停原审批人员管理、失败保留和重复点击；隔离MySQL及Redis，无业务接口替身' : addSignOnly ? '真实前后及并行加签、减签、网关一次汇聚、终止清理及故障回滚；隔离MySQL及Redis，无业务接口替身' : withdrawalUiOnly ? '真实电脑和手机已办页面、二次确认、本人审批撤回及越权校验；隔离MySQL及Redis，无业务接口替身' : gatewayRewindOnly ? '真实网关驳回、审批撤回、分支隔离、历史失效和故障事务回滚；隔离MySQL及Redis，无业务接口替身' : gatewayDesignerOnly ? '真实网关设计器、四类网关创建与配置、保存重载、发布模拟与审批执行；隔离MySQL及Redis，无业务接口替身' : gatewayOnly ? '真实认证、工作流、并行/包含/路由网关、轮次隔离与事务回滚；隔离MySQL及Redis，无业务接口替身' : scope, caseTag, passed: !failure, checks, requests, tasks, pending, failure, verifiedAt: new Date().toISOString() }, null, 2);
  const resultCategory = hrOvertimeOnly ? 'h2-overtime' : hrAppraisalsOnly ? 'h2-appraisals' : hrSkillsOnly ? 'h2-skills' : salesTargetOnly ? 'h3-sales-target' : contractPerformanceOnly ? 'h3-contract-performance' : contractTeamOnly ? 'h3-contract-team' : receivableProtectionOnly ? 'h3-receivable-protection' : quoteHandoverOnly ? 'h3-quote-handover' : emailArchiveOnly ? 'h3-email-archive' : opportunityOnly ? 'h3-opportunity' : crmEmailOnly ? 'crm-email' : meetingOnly ? 'h4-meeting' : holidayConsumersOnly ? 'holiday-consumers' : rfqSelectionOnly ? 'rfq-selection' : rfqEmailOnly ? 'rfq-email' : messageDeliveryOnly ? 'message-delivery' : category;
  const resultText = meetingOnly ? JSON.stringify({ ...JSON.parse(result), scope: '真实网关、认证、OA、CRM、工作流、中央照片存储、消息事件及电脑手机页面；隔离MySQL、Redis与TLS邮件协议服务，身份为隔离测试主数据，无业务接口替身，不操作正式服务器' }, null, 2) : holidayConsumersOnly ? JSON.stringify({ ...JSON.parse(result), scope: '真实认证、日历、部门、HR班次排班与请假考勤计算、CRM客户策略及工单；隔离MySQL及Redis，无业务接口替身，不伪造计算或落库结果' }, null, 2) : rfqSelectionOnly ? JSON.stringify({ ...JSON.parse(result), scope: '真实手机首次访问及刷新、供应商和耗材分页、真实保存与权限拒绝；仅分页主数据使用隔离夹具，不替换业务响应' }, null, 2) : rfqEmailOnly ? JSON.stringify({ ...JSON.parse(result), scope: '真实认证、询价、私有附件、逐家TLS邮件、结果事件与双端页面；仅重试时间、准入变更及分页输入使用隔离夹具，不替换业务接口或伪造发送成功' }, null, 2) : messageDeliveryOnly ? JSON.stringify({ ...JSON.parse(result), scope: '真实认证、网关、双端投递详情和人工核验；UNKNOWN初始状态由隔离数据库夹具建立，本脚本不调用SMTP' }, null, 2) : result;
  const scopedCategory = opportunityReopenOnly ? 'h3-opportunity-reopen' : salesTargetUiOnly ? 'h3-sales-target-ui' : quoteContractCopyOnly ? quoteContractCopyUiOnly ? 'h3-quote-contract-copy-ui' : 'h3-quote-contract-copy' : receivableTeamsOnly ? 'h3-receivable-team' : receiptRefundOnly ? 'h3-receipt-refund' : hrSuccessorOnly ? hrSuccessorUiOnly ? 'h3-hr-successor-ui' : 'h3-hr-successor' : opportunityTeamsOnly ? 'h3-deal-team' : meetingOnly && meetingMode !== 'full' ? `${resultCategory}-${meetingMode}` : resultCategory;
  const scopedResult = emailArchiveOnly ? JSON.stringify({ ...JSON.parse(resultText), evidence: emailArchiveEvidence, scope: '真实网关、认证、CRM四类业务邮件、私有附件、消息回写、打开观察和电脑手机页面；自有隔离MySQL、Redis及TLS邮件协议服务，外租户权限、准入变更、重试时间与缓存故障为可恢复测试输入，无业务接口替身，不操作正式服务器' }, null, 2) : opportunityOnly ? JSON.stringify({ ...JSON.parse(resultText), mode: opportunityImportOnly ? 'import' : opportunityTeamsOnly ? 'teams' : 'full', evidence: opportunityEvidence, scope: opportunityImportOnly ? '真实文件、导入引擎、商机新增更新、阶段和团队、五类既有导入及电脑手机页面；外租户记录及仅有导入权限角色为隔离边界输入；实际中断受控数据库连接验证逐行恢复；页面丢响应先完成真实请求，不替换业务结果；角色授权恢复，正式环境未修改' : '真实网关、认证、HR、CRM、工作流、商机规则与团队及电脑手机页面；自有隔离MySQL和Redis，部门关系及阶段时间为明确测试输入，保存中检查只延迟真实服务器响应，无业务接口替身，不操作正式服务器；teams模式不覆盖阶段审批和提醒' }, null, 2) : crmEmailOnly ? JSON.stringify({ ...JSON.parse(resultText), evidence: crmEmailEvidence, scope: '真实网关、认证、CRM、auth消息事件、公开追踪退订及电脑手机页面；自有隔离MySQL、Redis与TLS邮件协议服务，配置为可恢复测试夹具，无业务接口替身，不操作正式服务器' }, null, 2) : meetingOnly ? JSON.stringify({ ...JSON.parse(resultText), mode: meetingMode, evidence: meetingEvidence,
    scope: meetingMode === 'recovery' ? '真实隔离MySQL、Redis非队列缓存清理、五服务重启、重新认证与数据库提醒恢复；保留事件队列，不调用SMTP、不含业务页面验收、不操作正式服务器'
      : meetingMode === 'boundaries' ? '真实认证、OA日历、CRM参与者冲突、审批拒绝撤回、周期与使用率；不调用SMTP、不含业务页面验收、不操作正式服务器' : JSON.parse(resultText).scope }, null, 2) : resultText;
  const finalResult = opportunityReopenOnly ? JSON.stringify({ ...JSON.parse(scopedResult), mode: 'reopen', scope: '商机恢复专项：真实认证、HR、CRM、OA、工作流、MySQL、Redis、原赢单冲减、丢单审批、到账和合同来源阻断、电脑手机页面。部门负责人及阶段规则为可恢复隔离输入，签署PDF为测试文件，页面只延迟或丢弃真实响应；不含正式合同变更审批、两级退款审批、提醒或完整CRM-07，不操作正式服务器。' }, null, 2) : salesTargetOnly ? JSON.stringify({ ...JSON.parse(scopedResult), uiOnly: salesTargetUiOnly, evidence: salesTargetEvidence,
    scope: salesTargetUiOnly ? '仅真实认证、HR身份及CRM目标电脑手机页面专项；自有隔离MySQL和Redis，响应丢失及延迟仅改变真实传输。未执行逐笔收款及退款链、完整权限和业务竞争，不替代完整销售目标验收，不操作正式服务器'
      : '真实认证、CRM目标、逐笔收款团队与财务原款退款审批回调、HR目录及权限；完整模式包含电脑手机页面，http-only模式不含页面。自有隔离MySQL及Redis，单级退款流程与人员为明确测试输入，响应丢失及延迟仅改变真实传输，不替换业务响应；不代表正式退款审批顺序已确认，不含完整CRM-07四聚合、薪资或正式发布' }, null, 2) : contractPerformanceOnly ? JSON.stringify({ ...JSON.parse(scopedResult), evidence: contractPerformanceEvidence,
    scope: '真实认证、网关、已有合同审批及管理员代办审计、OA双方签署与日期补填、HR身份、CRM业绩及60秒集中任务；自有隔离MySQL和Redis。到日日期与指定分配写入故障为明确测试输入，界面只延迟或丢弃真实响应，无业务接口替身；不含正式合同变更审批、提成发薪或正式发布' }, null, 2) : contractTeamOnly ? JSON.stringify({ ...JSON.parse(scopedResult), evidence: contractTeamEvidence,
    scope: '真实认证、网关、OA合同与CRM团队入口、HR员工核验、同事务币种锁和团队保存及电脑手机页面；隔离MySQL和Redis，无业务响应替身，保存中仅延迟真实响应；不含来源团队复制、合同事实、应收团队或提成发薪，不操作正式服务器' }, null, 2) : receivableProtectionOnly ? JSON.stringify({ ...JSON.parse(scopedResult), evidence: receivableEvidence,
    scope: receivableTeamsOnly ? '真实认证、网关、OA合同和CRM回款团队、合同到回款复制、HR员工核验、逐笔到账及电脑手机页面；自有隔离MySQL和Redis，团队均通过业务接口保存，无业务响应替身，等待状态仅延迟真实响应；不含合同事实、薪资发放或正式发布'
      : receiptRefundOnly ? '真实认证、财务账号、网关、CRM真实团队管理及原收款选择、OA发票、退款工作流完成与回调及电脑手机页面；自有隔离MySQL和Redis，人员与单级测试流程为明确输入夹具；不伪造业务响应或直接批准数据库记录，不代表正式审批顺序已确认，不含提成发薪或可靠消息故障恢复，不操作正式服务器'
      : '真实认证、网关、CRM应收、OA发票、HR员工核验、历史30加新增20、逐笔分配、持久来源内部HTTP重放及电脑手机页面；隔离MySQL和Redis，无业务响应替身，等待状态仅延迟真实响应；退款审批、提成发薪及可靠消息故障恢复另验，不操作正式服务器' }, null, 2) : quoteHandoverOnly ? JSON.stringify({ ...JSON.parse(scopedResult), evidence: quoteHandoverEvidence, scope: quoteContractCopyOnly
    ? (quoteContractCopyUiOnly ? '仅报价转合同电脑手机确认、重复点击、刷新及结果未明与恢复关联界面专项，不替代完整API边界验收。' : '') + '真实认证、网关、HR人员核验、CRM报价到OA合同团队复制；自有隔离MySQL和Redis，团队通过真实接口保存，关联写入触发器为可恢复故障输入，等待状态延迟实际响应、结果未明中断实际成功响应，无业务响应替身；不含有效合同业绩或提成发薪，不操作正式服务器'
    : hrSuccessorOnly
    ? '真实认证、网关、HR指定接任人及离职任务、CRM自动交接和电脑手机页面；自有隔离MySQL及Redis，人员与停用部门为明确身份主数据夹具，接任人状态及指定员工的事件写入故障为可恢复边界输入，保存中仅延迟真实响应；不含实际到账及提成发薪，无业务响应替身，不操作正式服务器'
    : '真实认证、网关、HR离职无接任人事件、CRM报价团队复制与手工交接、电脑手机页面；自有隔离MySQL及Redis，离职人身份为明确主数据夹具，非空提成率为可恢复脱敏输入，保存中仅延迟真实响应；不含HR预指定接任人自动交接、实际到账及提成发薪，无业务响应替身，不操作正式服务器' }, null, 2) : scopedResult;
  if (portalOnly) {
    const portalCategory = oauth2PortalCheck ? 'h5-oauth2-portal' : filePreviewPortalOnly ? 'h5-preview-portal' : businessSearchPortalOnly ? 'h5-search-portal' : portalFinanceOnly ? 'h3-portal-finance' : portalContractOnly ? 'h3-portal-contract' : portalTicketOnly ? 'h3-portal-ticket' : portalKnowledgeOnly ? 'h3-portal-knowledge' : portalGuardOnly ? 'h3-portal-employee-guard' : portalDisabledOnly ? 'h3-portal-disabled' : portalUiOnly ? 'h3-portal-auth-ui' : 'h3-portal-auth';
    const selectedPortalEvidence = filePreviewPortalOnly ? filePreviewPortalEvidence : businessSearchPortalOnly ? businessSearchPortalEvidence : portalFinanceOnly ? portalFinanceEvidence : portalContractOnly ? portalContractEvidence : portalTicketOnly ? ticketEvidence : portalKnowledgeOnly ? knowledgeEvidence : portalGuardOnly ? { employeeGuard: !failure } : portalEvidence;
    const portalResult = JSON.stringify({ ...JSON.parse(finalResult), evidence: selectedPortalEvidence,
      scope: oauth2PortalCheck ? 'OAuth同编号身份隔离：真实CRM联系人、TLS邀请邮件、HTTPS激活与客户登录，另建同数字编号的内部员工，真实授权码及令牌兑换，验证双方凭据不能互换；包含本轮激活及登录日志保密核验。临时角色授权恢复，不含完整门户或正式发布。'
        : filePreviewPortalOnly ? '文件预览登录域隔离：真实CRM联系人、TLS邮件邀请、HTTPS激活与客户登录，另建数值编号相同的内部员工，验证真实内部合同PDF可读且客户身份在网关和服务直连均被拒绝；临时角色授权恢复，不含客户预览功能或正式发布。'
        : businessSearchPortalOnly ? '业务搜索登录域隔离：真实CRM联系人、TLS邮件邀请、HTTPS激活与客户登录，另建数值编号相同的内部员工，验证聚合入口及四个内部搜索拒绝客户身份；临时角色授权恢复，不含完整门户验收或正式发布。'
        : portalGuardOnly ? '仅真实员工登录、客户门户管理页路由拒绝与后端读取403；自有HTTPS、MySQL和Redis，不含邀请、门户登录、SMTP或完整门户验收，不修改正式服务。'
        : portalFinanceOnly ? '财务专项：真实内部及门户认证、回款和发票独立公开撤回、私有票据、版本竞争、审计及页面；边界金额和归属为可恢复的隔离输入，丢响应只截断真实响应。完整PRD及正式公网验收另验。'
        : portalContractOnly ? '合同专项：真实邀请与门户登录、已有合同审批及双方签署、三类逐项公开、权限、网关、MySQL、Redis及电脑手机页面；边界身份、金额和审批失效使用可恢复的隔离输入，丢响应只截断真实响应，不替代业务结果。不代表财务门户或全量PRD完成，不操作正式服务器。'
        : portalTicketOnly ? '工单专项：真实邀请登录、客户提交、私有文件字节、分派发布、网关、MySQL、Redis及电脑手机页面；边界归属和删除使用可恢复的本次隔离输入，丢响应只截断真实响应，不替代业务结果。合同、财务门户及完整账号回归另验，不操作正式服务器。'
        : portalKnowledgeOnly ? '知识库专项：真实邀请与门户认证、知识审批、逐个附件公开与下载、发布撤回、网关、MySQL、Redis及电脑手机页面。异租户、跨文档版本与文件删除为明确隔离输入；不含完整门户业务、完整账号边界或正式发布。'
        : '真实内部认证、CRM联系人、门户独立认证、网关、MySQL、Redis与自有HTTPS和TLS邮件协议；锁定与邀请截止时间、部门测试账号及外租户授权为明确隔离输入，HTTP业务响应无替身。账号阶段不含门户工单、合同、财务、知识库、文件业务或正式公网验收。' }, null, 2);
    await fs.writeFile(path.join(directory, `${portalCategory}-results-${caseTag}.json`), portalResult, 'utf8');
    await fs.writeFile(path.join(directory, `${portalCategory}-results.json`), portalResult, 'utf8');
    console.log(`${oauth2PortalCheck ? 'H5_OAUTH2_PORTAL' : filePreviewPortalOnly ? 'H5_PREVIEW_PORTAL' : businessSearchPortalOnly ? 'H5_SEARCH_PORTAL' : portalFinanceOnly ? 'H3_PORTAL_FINANCE' : portalContractOnly ? 'H3_PORTAL_CONTRACT' : portalTicketOnly ? 'H3_PORTAL_TICKET' : portalKnowledgeOnly ? 'H3_PORTAL_KNOWLEDGE' : portalGuardOnly ? 'H3_PORTAL_EMPLOYEE_GUARD' : 'H3_PORTAL_AUTH'}_REAL_RESULT: checks=${checks.length}; failed=${failure ? 1 : 0}; requests=${requests.length}; mysql=true; redis=true; https=true; evidence=${JSON.stringify(selectedPortalEvidence)}; interface_doubles=0; production_modified=false`);
  } else if (!imConfigOnly) {
    const storedResult = hrOvertimeOnly ? JSON.stringify({ ...JSON.parse(finalResult), evidence: hrOvertimeEvidence, scope: '当前加班调班链：真实认证、日历、打卡、HR两级流程、调休累计及单方调班和双方互换，含双端页面、丢弃真实保存响应、两小时调休请假消费、日/月上限、调班安全以及出差/请假/普通打卡相邻检查；含真实加班核价和两级审批、已批准七档计税、取消重算和实际发薪，管理员接口登记8月42条原始卡、真实计算31天并经人事封账；工资批次开启考勤完整性校验，未封账阻断、重复封账和封账写入保护及发薪后考勤全部列保持。调休周期正常关闭保护及本轮新建周期的单次历史关闭状态输入，三笔真实两级审批后明确补入0.01/0.02小时或终止；原工时与累计舍入保持，重复处置拒绝，处置界面另验。44表原业务保持，指定8月周期版本按两次算薪及一次取消自然+5并逐次核对。本机人员和临时政策可恢复；工资周期异常及补正、调班故障及其他D考勤范围仍单独验收，不代表H2整体完成。' }, null, 2) : hrAppraisalsOnly ? JSON.stringify({ ...JSON.parse(finalResult), evidence: hrAppraisalEvidence, scope: '真实认证、网关、MySQL、Redis和HR绩效；人员、岗位及双租户授权为隔离输入，授权核验后恢复。仅本人受邀评分已获批，客户评分明确停用；HTTP-only不包含界面验收，界面丢失响应仅丢弃已提交的真实响应；不操作正式服务器。' }, null, 2) : hrSkillsOnly ? JSON.stringify({ ...JSON.parse(finalResult), evidence: hrSkillEvidence, scope: '真实认证、网关、MySQL、Redis、HR五类证据与三个技能页面；岗位、在岗人员、报名已审批和待批改作答为隔离输入，跨租户权限临时核验后恢复；业务响应无替身，丢失响应只丢弃已提交的真实响应；不操作正式服务器。' }, null, 2) : finalResult;
    const outputCategory = hrSettlementReferralRepay ? 'h2-settlement-referral-repay' : hrSettlementReferral ? 'h2-settlement-referral' : hrAdvanceSettlementAllSources ? 'h2-settlement-all-sources' : hrAdvanceSettlementPayroll ? 'h2-advance-settlement-payroll' : hrAdvanceSettlementOnly ? 'h2-advance-settlement' : hrSettlementDraftOnly ? 'h2-settlement-draft' : hrAdvanceApprovalOnly ? 'h2-advance-approval' : hrExitInterviewsOnly ? 'h2-exit-interviews' : hrReferralsOnly ? 'h2-referrals-core' : hrContactCapacityOnly ? 'h2-contact-capacity' : tenantPackageOnly ? 'h5-tenant-package' : reportOnly ? 'h5-report' : oauth2Only ? 'h5-oauth2' : dataSourceOnly ? `h5-data-source-${dataSourceEvidence.mode}` : filePreviewOnly ? 'h5-file-preview' : platformAccessOnly ? 'h5-platform-access' : businessSearchOnly ? 'h5-business-search' : hrAdvanceEntryOnly ? 'h2-advance-entry' : hrAdvancePayrollOnly ? 'h2-advance-payroll' : scopedCategory;
    const outputResult = hrSettlementReferralRepay ? JSON.stringify({ ...JSON.parse(storedResult), evidence: { repayment: hrAdvanceApprovalEvidence.repayment },
      scope: '沿用具名已完成实际付款与冲正的结算草稿，经独立财务复核及OA实际第二次付款；核对奖金付款退回历史、新付款身份和重复投递，以及工资、借款、假期、培训重新入账。仅人员和审批定义为隔离前置，原财务历史保留；本轮只验实际接口，不含页面、正式部署或35份PRD全量验收。' }, null, 2) : hrSettlementReferral ? JSON.stringify({ ...JSON.parse(storedResult), evidence: hrAdvanceApprovalEvidence,
      scope: '同员工工资、借款100元、两种单位假期、培训123.45元和内推奖金1234.56元的实际结算组合；内推经本人提交、真实录用建号、负责人和人事审批，在算薪前形成唯一奖金来源。五轮结算审批、四次释放、实际付款、冲正收款恢复待发、新草稿及离职。隔离定义、人员、税率和核定金额为前置；结算含双端与响应丢失恢复，内推准备为实际接口，不含二次发薪、正式部署或35份PRD全量验收。' }, null, 2) : hrSettlementDraftOnly ? JSON.stringify({ ...JSON.parse(storedResult), evidence: hrSettlementDraftEvidence,
      scope: '结算草稿实际接口：真实登录、网关、HR、OA及数据库；人员与已批准离职申请为隔离前置，真实创建、核定保存、缺项重算、越权及并发保护。测试草稿按专属标记保留；没有完整有款结算、来源冻结、审批、实际收付、页面或正式部署。' }, null, 2) : hrAdvanceApprovalOnly ? JSON.stringify({ ...JSON.parse(storedResult), evidence: hrAdvanceApprovalEvidence,
      scope: hrAdvanceSettlementAllSources ? '同一员工借款100元实际放款，真实工资预约50元、结算另收50元；两种单位假期通过实际调整形成2天与4小时余额，培训通过实际报名、两级审批、签到、结业、私有协议及123.45元核定。共同汇集工资、补偿、假期、培训、借款及资产，五轮审批、四次释放、付款、冲正、新草稿和实际离职。人员、定义、税率和规则金额为隔离测试前置；结算双端和响应丢失恢复均实际执行，不代表35份PRD全量验收。' : hrAdvanceSettlementPayroll ? '同一员工实际两级借款审批及OA放款100元，真实后台计算并封存截至离职当天的工资，工资预扣50元、离职结算另收50元；保留一月份实际工资作为核定补偿取样。五轮独立财务审批、实际付款共同抵扣100元，反向实际收款恢复本金100元并重建工资预约50元，新草稿再次汇集；最终真实离职。结算和冲正含双端及响应丢失恢复，借款和工资段仅HTTP。人员、税率、结构和额度规则为隔离前置，不含假期、培训或全量验收。' : hrAdvanceSettlementOnly ? '同一员工实际借款两级审批及OA放款后，由真实已批准离职申请汇集工资、补偿、借款及资产；五轮独立财务审批、实际付款抵扣本金、反向实际收款恢复本金及新草稿再次汇集。结算和冲正含桌面手机及真实丢响应恢复，借款段仅HTTP。人员、定义、税率及规则数值为隔离前置，保留财务历史并完成HR离职；不含假期或培训组合、正式部署或全量验收。' : '借款审批与放款专项：真实登录、规则发布、加密月薪、本人提交、两级实际审批、OA确认付款及HR本金入账。人员、流程定义和规则数值为隔离输入；无放款夹具、无业务响应替身。HTTP-only不含页面；完整模式含双端待办与提交丢失真实响应。不含完整离职结算、正式权限安装或正式服务器。' }, null, 2) : tenantPackageOnly ? JSON.stringify({ ...JSON.parse(storedResult), evidence: tenantPackageEvidence,
      scope: '套餐专项：真实内部登录、网关、认证服务、MySQL及Redis；自有租户套餐临时分配结束恢复，测试模板和同步记录精确清理。不使用业务响应替身，不把HTTP-only计为页面或全部服务额度验收，不操作正式服务器。' }, null, 2) : reportOnly ? JSON.stringify({ ...JSON.parse(storedResult), evidence: reportEvidence,
      scope: '受限报表专项：真实内部登录、网关、四个业务服务、MySQL及Redis；业务记录和专用角色为隔离输入，临时授权结束还原。HTTP-only不含界面，界面专项不替代数据库组合、截断和真实SQL超时验证；缺费用日期单列，补齐实际日期后计入对应日期统计，不操作正式服务器，不代表H5或全量PRD完成。' }, null, 2) : oauth2Only ? JSON.stringify({ ...JSON.parse(storedResult), evidence: oauth2Evidence,
      scope: '第三方授权专项：真实内部登录、网关、MySQL、Redis和CRM/流程受限资源。HTTP-only不含页面，disabled-only仅验证明确停用；边界账号、权限与到期为可恢复隔离输入，令牌不伪造，正式服务器未修改。' }, null, 2) : dataSourceOnly ? JSON.stringify({ ...JSON.parse(storedResult), evidence: dataSourceEvidence,
      scope: dataSourceLiveOnly
        ? '动态数据源真实启用专项：自有只读角色及可写账号、五个实际服务、真实MySQL连接、空闲池替换、失败保留、目标移除及停用清理。recovery模式另测人事双实例、重启、发现列表移除STALE及重新发现补应用、保留停用记录重启和调度中心重试，recovery-ui再测电脑手机真实测试/启用/停用；本专项不含持有连接60秒退役，不代表全量完成，不操作正式服务器。'
        : '动态数据源基础专项：真实认证、网关、隔离MySQL与Redis，验证默认停用或配置加密、权限、版本、签名停用及电脑手机页面。随机密码仅用于保存加密，不创建数据库账号，不读取账号权限清单，不代表真实只读账号核验、连接启用、多实例连接池验收、H5或全量PRD完成；不操作正式服务器。' }, null, 2) : filePreviewOnly ? JSON.stringify({ ...JSON.parse(storedResult), evidence: filePreviewEvidence,
      scope: '文件预览专项：真实认证、网关、OA、HR、工作流、MySQL、Redis及文件字节；业务归属与损坏文件为自有隔离输入，临时角色授权结束恢复。HTTP-only不含页面，UI-only与workflow-only不替代完整验收；不操作正式服务器，不代表H5或全量PRD完成。' }, null, 2) : platformAccessOnly ? JSON.stringify({ ...JSON.parse(storedResult), evidence: platformAccessEvidence,
      scope: platformAccessEvidence.mode === 'totp'
        ? 'H5平台身份动态验证码专项：真实内部登录、本人登记启用、密码和动态验证码、并发与重放、MySQL与Redis；损坏密文仅限自有账号，结束恢复登记状态。不含平台页面、套餐业务或正式部署。'
        : 'H5平台身份底座专项：真实内部登录、网关、MySQL与Redis；错租户凭据与提前到期为显式隔离输入。尚未接入套餐、数据源或OAuth2业务，不含平台页面、真实TOTP接线或正式部署。' }, null, 2) : businessSearchOnly ? JSON.stringify({ ...JSON.parse(storedResult), evidence: businessSearchEvidence,
      scope: '业务搜索专项：真实认证、网关、四个内部业务服务、六类搜索、MySQL及Redis；边界人员和业务记录为隔离输入，临时授权完成后还原；HTTP-only不含界面验收，无业务响应替身，不操作正式服务器。' }, null, 2) : hrAdvanceEntryOnly ? JSON.stringify({ ...JSON.parse(storedResult), evidence: hrAdvanceEntryEvidence,
      scope: '借款入口专项：真实认证、网关、HR、MySQL、Redis及私有文件；人员和已放款借款为隔离前置，双租户授权及故障注入结束还原。HTTP-only不含页面，完整模式验证电脑手机及丢失真实响应。未覆盖借款额度、申请审批、OA实际放款、离职结算或正式部署，无业务响应替身。' }, null, 2) : hrAdvancePayrollOnly ? JSON.stringify({ ...JSON.parse(storedResult), evidence: hrAdvancePayrollEvidence,
      scope: '工资扣还连接专项：真实认证、网关、HR、工作流、MySQL及Redis；借款放款、薪资结构和税率为隔离前置输入，工资计算、取消、发薪和补正使用真实业务接口；不含借款申请、OA实际放款、借款页面或正式部署，无业务响应替身。' }, null, 2) : storedResult;
    const finalCategory = a3NaturalCadenceOnly ? 'a3-natural-cadence' : a3AnomalyScanOnly && process.argv.includes('--transaction-only') ? 'a3-transaction-scan' : a3AnomalyScanOnly ? 'a3-anomaly-scan' : a3DeadlockScanOnly ? 'a3-deadlock-scan' : a3TimerScanOnly ? 'a3-timer-scan' : a3AuditArchiveOnly ? 'a3-audit-archive' : a3TaskTimeoutOnly ? 'a3-task-timeout' : a3ProcessReconcileOnly ? 'a3-process-reconcile' : a3TaskReminderOnly ? 'a3-task-reminder' : a3DictScanOnly ? 'a3-dict-scan' : a3CrmNotificationsOnly ? 'a3-crm-notifications' : a3OaScansOnly ? 'a3-oa-scans' : a3QuoteExpireOnly ? 'a3-quote-expire' : a3TrainingArchiveOnly ? 'a3-training-archive' : a3BusinessExitOnly ? 'a3-business-exit' : a4YearlyOnly ? 'a4-yearly-reminder' : a3JobClusterOnly ? 'a3-job-cluster' : a3JobPrimaryFaultOnly && process.argv.some(value => value.startsWith('--a3-primary-recover=')) ? 'a3-primary-recovery' : a3JobPrimaryFaultOnly ? 'a3-job-primary-fault' : a3JobFailoverOnly ? 'a3-job-failover' : a3JobReportFaultOnly ? 'a3-job-report-fault' : a3JobSchedulersOnly ? 'a3-job-schedulers' : a3JobPeerOnly ? 'a3-job-peer' : a3JobOutageOnly ? 'a3-job-outage' : a3JobCrmFailureOnly ? 'a3-job-crm-failure' : a3JobTenantFailureOnly ? 'a3-job-tenant-failure' : a3JobFailureOnly ? 'a3-job-failure' : a3JobLongOnly ? 'a3-job-long' : a3JobBusinessOnly ? 'a3-job-business' : a3JobManagementOnly ? 'a3-job-management' : oaContractAccessOnly ? 'f4-contract-access' : oaContractReviewOnly ? 'f4-contract-review' : oaContractRemindersOnly ? 'f4-contract-reminders' : oaContractTermsOnly ? 'f4-contract-terms' : oaSignMethodsOnly ? 'f4-sign-methods' : hrEmployeeCertificateCapacity ? 'h5-employee-certificate-capacity' : hrGrievanceArchiveCapacity ? 'h5-grievance-archive-capacity' : hrTrainingCertificateCapacity ? 'h5-training-certificate-capacity' : outputCategory;
    const finalOutput = a3JobManagementOnly ? JSON.stringify({ ...JSON.parse(outputResult), evidence: a3JobManagementEvidence,
      scope: a3NaturalCadenceOnly ? '原112—115相同处理器及5/5/3/10分钟间隔的自然调度，正常发起一分钟定时流程并观察真实到期延迟；不改时间、不手动触发，不将名义1200次/日当成完整24小时统计。结束暂停本轮任务，原配置、队列及授权保持。' : a3AnomalyScanOnly && process.argv.includes('--transaction-only') ? '原122/123实际重试及清理：真实异步流程发起、提交故障回滚、平台FAILED告警、恢复送达和过期成功消息清理；仅调整自有消息的重试/历史时间，原演示消息临时延后后恢复，不含自然周期。' : a3AnomalyScanOnly && process.argv.includes('--trigger-only') ? '仅触发节点BLOCK异常提醒：真实员工草稿和发起、无效消息接收人故障、提醒登记回滚与恢复、200字符标题和消息租户隔离；未执行原118/119定时巡检、停用事件或外部HTTP请求，不含自然周期。' : a3AnomalyScanOnly ? '原118和119实际平台空巡检与准确结果；原118负数阈值故障、FAILED告警及恢复；真实业务登记与事务另由独立MySQL实例验证，不含自然周期。' : a3DeadlockScanOnly ? '原115死锁巡检真实空扫描、等待缓存类型故障、FAILED与指定员工告警、恢复重复和权限；实际未释放业务锁，正向解除与管理员通知事务另有独立Redis/MySQL证据，不含自然十分钟周期或原118流程异常任务。' : a3TimerScanOnly ? '原114/117定时扫描与清理；真实发布和发起两租户流程，自有通知插入触发器故障验证处理回滚、其他流程继续、失败告警、重试和恢复。仅提前自有等待截止时间，不含自然三分钟周期或真实Redis故障。' : a3AuditArchiveOnly ? '原100审计归档处理器的真实预演、实际归档、冲突回滚、同租户策略及跨租户继续、失败告警、恢复与重复；自有auth配置分阶段切换并恢复，原策略及审计保留，不含每月自然计划。' : a3TaskTimeoutOnly ? '原超时扫描与异常索引清理真实执行；两租户通过表单、草稿及发布定义真实发起流程，自有消息身份冲突触发真实事务回滚，验证5分钟退避、三次失败上限、转人工补发及去重。仅提前到期自有索引，不声称等待自然扫描周期。' : a3ProcessReconcileOnly ? '原111流程业务对账真实执行；自有流程和证明申请为隔离前置，精确中断自有差异唯一键插入等待，验证真实失败、其他差异处理、告警及消息租户归属、恢复和重复零条。通知登记故障的共同回滚仅规则验证，不含完整证明办理或每30分钟计划。' : a3TaskReminderOnly ? '原112催办处理器真实执行；两租户自有任务和提醒索引为隔离前置，精确中断自有任务查询，失败条目保留、其他条目和租户继续、失败告警、恢复和真实同成员重投。Redis删除失败仅规则验证，不含完整流程办理或每5分钟自然计划。' : a3DictScanOnly ? '原101字典引用扫描真实执行；精确中断自有旧告警行的删除等待，验证事务回滚保留原告警、其他租户继续、失败告警、恢复与刷新计数。自有字典及过时告警为隔离前置，恢复原字典与扫描结果，不含每日02:00计划时刻。' : a3CrmNotificationsOnly ? '原104/105/1552客户提醒和工单时限处理器真实执行；两租户样本为隔离前置，精确中断自有工单查询、跨工单租户继续、失败告警、恢复、请求与状态变更计数和SLA去重。每日提醒登记失败仅规则验证，不含每日提醒去重、完整工单办理或计划时刻。' : a3OaScansOnly ? '原108/109/110办公处理器真实执行；原隔离数据先扫描并保留结果，两租户借用台账合同为隔离前置，精确自有借用行查询故障及风险参数故障、继续处理、事务回滚、实际提醒与去重。恢复规则和参数，不含完整借用或合同办理、每日计划时刻。' : a3QuoteExpireOnly ? '原103报价过期处理器真实执行；两租户客户与报价为隔离前置，客户刷新真实查询故障、报价事务回滚、其他租户继续、FAILED告警、修复及零条重跑。五种到期状态及六个排除边界，不含完整报价审批或凌晨计划时刻。' : a3TrainingArchiveOnly ? '原107培训档案处理器真实执行；自有三名员工及课程报名为隔离前置，真实行锁中断单员工查询并验证同租户和跨租户继续、FAILED告警、恢复人数及重复重建。无业务响应替身，不含完整培训办理或凌晨计划时刻。' : a3BusinessExitOnly ? '原人事服务在真实合同数据库等待期间退出；原125实际巡检保存TIMEOUT及未知结果告警，恢复后新编号处理一份合同并唯一提醒。原运行配置保持，不含2×2业务集群或正式Nacos心跳。' : a4YearlyOnly ? '原127年度日历维护提醒真实执行；管理员和人事站内收件、角色与租户隔离、重复扫描去重及自有样本收尾。通过手动触发验证处理器，不代表已等待到11月计划时刻。' : a3JobClusterOnly ? '两套真实调度和两套真实人事服务使用原生固定双地址选路；四条认证管理派发路径、实际合同与唯一提醒、共同计划时刻唯一执行及两实例去重。只保留本轮Redis状态写入元数据与进程归属；不含正式Nacos心跳或本轮停机。' : a3JobPrimaryFaultOnly && process.argv.some(value => value.startsWith('--a3-primary-recover=')) ? '仅对具名原auth停机验证执行实际结果巡检和原运行配置还原；没有新增停机，不将历史失败轮次改记为通过。' : a3JobPrimaryFaultOnly ? '原auth真实停止后固定双地址原生健康选择，网关管理、HR默认服务发现回报、副本连续四个计划窗口和原实例自动重新竞争；保留真实状态反查及恢复原12配置。不代表正式Nacos心跳或2×2业务集群验收。' : a3JobFailoverOnly ? '真实参与派发的调度副本强制停机，原实例连续四个计划时刻接续；副本重启后重新派发且无重复，原管理与回报地址保持。原auth停机和负载均衡路由尚未验证。' : a3JobReportFaultOnly ? '自有人事服务真实回报连接丢失、原125实际巡检反查与真实人事停机、TIMEOUT未知结果及原实际迟到回报；完整恢复原回报配置和服务，不伪造最终状态。'
        : a3JobSchedulersOnly ? '两个真实auth进程共同参与定时派发，按操作系统连接归属核对只读Redis观察、唯一执行日志及真实反查；三种定时方式与配置传播，不包含故障切换或完整日统计。'
        : a3JobPeerOnly ? '两个独立真实人事进程共享原数据库和Redis；原106实际派发，副本内部签名重投去重及共享锁，副本实际处理新合同；不作为双调度、负载均衡选路及副本直投的管理员日志验收。'
        : a3JobOutageOnly ? '真实停止自有CRM进程，三次网络派发重试、专门告警、180秒离线与三宽度红色提示、恢复自动注册及实际补回收；配置保持，结果和心跳不伪造，不计双实例及丢回报反查。'
        : a3JobCrmFailureOnly ? '真实CRM客户公海跨租户部分失败及恢复：只取消等待新客户主键的SQL，核对其他租户回收、FAILED及原异常、真实告警与后续补回收去重。业务与锁为自有具名输入，实际结果不篡改，不计集群或完整故障协议。'
        : a3JobTenantFailureOnly ? '跨租户原合同处理器实际异常：仅取消等待新测试合同行锁的SQL，核对失败租户保持、其他租户继续处理与真实消息，以及平台FAILED和告警。真实结果不写入替身，不代表集群验收。'
        : a3JobFailureOnly ? '实际人事考勤处理器因未确认参数抛异常，三次FAILED持久化及真实告警、连续失败升级、实际失败回报重投去重；修正参数为空员工范围后真实零条成功并清零计数。不计租户部分失败、双实例、调度网络故障或全量完成。'
        : a3JobLongOnly ? '原106合同任务的真实异步受理、超过十秒的数据库等待、禁止并发跳过、完成回报、执行编号去重及站内送达。仅新测试合同行锁为故障输入；不改变原任务配置、不伪造执行结果，不计双实例和全故障协议验收。'
        : a3JobBusinessOnly ? '指定原任务102客户公海释放及106员工合同到期，真实调度、处理、回报、站内送达和页面改周期；业务和日期为隔离输入，保留任务与业务轨迹并恢复原任务配置。无双实例或故障协议验收。'
        : '集中任务真实管理、单实例动态调度、执行回报及权限，实际页面编辑、启停确认、手动触发、日志及三种宽度。独立测试任务复用返回零条的现有日历处理器，仅核对协议，不计日历业务、指定合同/公海业务、双实例或故障恢复。接口请求计数与页面主动核对请求数分别记录。结束暂停测试任务并保留日志，不改变原业务任务配置。' }, null, 2) : oaContractAccessOnly ? JSON.stringify({ ...JSON.parse(outputResult), evidence: oaContractAccessEvidence,
      scope: '合同履约证据实际上传、确认、负责人及责任人读取、同租户越权、跨租户和实际撤权。专用账号角色为隔离输入，结束撤权停用并保留业务文件审计，不操作正式服务器。' }, null, 2) : oaContractReviewOnly ? JSON.stringify({ ...JSON.parse(outputResult), evidence: oaContractReviewEvidence,
      scope: '合同履约实际页面、时间线、十项签署锁定与空值防覆盖、三维度报表；ACTIVE为隔离前置，不计真实审批。保留业务、文件和审计，不操作正式服务器。' }, null, 2) : oaContractRemindersOnly ? JSON.stringify({ ...JSON.parse(outputResult), evidence: oaContractRemindersEvidence,
      scope: '合同履约实际集中任务、到期和违约站内投递、上级与无上级、重复扫描；日期状态和测试账号部门为隔离输入，结束恢复账号部门，保留业务和消息。不操作正式服务器。' }, null, 2) : oaContractTermsOnly ? JSON.stringify({ ...JSON.parse(outputResult), evidence: oaContractTermsEvidence,
      scope: '合同条款、五种履约状态、模板、时间线、报表及真实审计故障回滚；合同准入状态和日期为隔离输入，保留业务与审计，不验证提醒或正式来源IP，不操作正式服务器。' }, null, 2) : oaSignMethodsOnly ? JSON.stringify({ ...JSON.parse(outputResult), evidence: oaSignMethodsEvidence,
      scope: '三种人工签署登记：真实认证、签署、私有文件、权限和电脑手机页面；APPROVED为具名隔离前置，不计审批链验收。保留签署、文件和审计，不调用第三方，不操作正式服务器。' }, null, 2) : hrEmployeeCertificateCapacity ? JSON.stringify({ ...JSON.parse(outputResult), evidence: hrEmployeeCertificateEvidence,
      scope: '员工证明容量：真实本人申请、人事审批、原回调重试，原消息重复投递；容量为隔离输入，保留业务历史并恢复配置与上限。不含界面，不操作正式服务器。' }, null, 2) : hrGrievanceArchiveCapacity ? JSON.stringify({ ...JSON.parse(outputResult), evidence: hrGrievanceCapacityEvidence,
      scope: '申诉归档容量专项：真实员工提交、人事受理和升级、受限归档下载。额度为可恢复隔离输入，临时占额文件精确清理；成功申诉、争议、归档和审计保留，用量按保留文件核对。不包含页面及技能完整验收，不操作正式服务器。' }, null, 2) : hrTrainingCertificateCapacity ? JSON.stringify({ ...JSON.parse(outputResult), evidence: hrTrainingCapacityEvidence,
      scope: '培训证书容量专项：真实认证、网关、HR颁发、重生成及本人下载；人员和课程为具名隔离输入，容量边界结束恢复。精确清理本轮证书、档案和文件，保留身份、课程及审计。未验证报名审批、技能五类证据或页面，不操作正式服务器。' }, null, 2) : outputResult;
    await fs.writeFile(path.join(directory, `${finalCategory}-results-${caseTag}.json`), finalOutput, 'utf8');
    await fs.writeFile(path.join(directory, `${finalCategory}-results.json`), finalOutput, 'utf8');
  }
  if (hrReferralsOnly) console.log(`H2_REFERRAL_CORE_REAL_RESULT: checks=${checks.length}; failed=${failure ? 1 : 0}; requests=${requests.length}; real_http=true; workflow_hire_bonus_tested=${!failure && process.argv.includes('--hr-referrals-complete')}; production_modified=false`);
  if (hrExitInterviewsOnly) {
    await fs.writeFile(path.join(directory, `h2-exit-interviews-results-${caseTag}.json`), JSON.stringify({ passed: !failure, checks, requests, failure, evidence: hrExitInterviewEvidence,
      scope: '真实认证、网关、HR、AUTH、MySQL、Redis及私有面谈附件；员工和已通过离职申请为隔离前置，临时员工账号沿用既有角色。complete模式含双端页面及丢失真实响应；其余模式只验接口。不含离职审批、结算收付或正式部署。', verifiedAt: new Date().toISOString() }, null, 2));
    console.log(`H2_EXIT_INTERVIEW_REAL_RESULT: checks=${checks.length}; failed=${failure ? 1 : 0}; requests=${requests.length}; real_http=true; source_fixture=true; interface_doubles=0; evidence=${JSON.stringify(hrExitInterviewEvidence)}; production_modified=false`);
  }
  if (hrSeverancePolicyOnly) {
    await fs.writeFile(path.join(directory, `h2-severance-policy-results-${caseTag}.json`), JSON.stringify({ passed: !failure, checks, requests, failure, evidence: hrSeverancePolicyEvidence,
      scope: '核定政策实际HTTP与可选双端验证；测试人员、工资项目及菜单授权是隔离前置，成功业务响应无替身。测试结束恢复全部角色授权，尚不代表完整离职结算。' }, null, 2));
    console.log(`H2_SEVERANCE_POLICY_REAL_RESULT: checks=${checks.length}; failed=${failure ? 1 : 0}; requests=${requests.length}; real_http=true; successful_business_response_doubles=0; evidence=${JSON.stringify(hrSeverancePolicyEvidence)}; production_modified=false`);
  }
  if (hrTrainingRecoveryOnly) {
    await fs.writeFile(path.join(directory, `h2-training-recovery-results-${caseTag}.json`), JSON.stringify({ passed: !failure, checks, requests, failure, evidence: hrTrainingRecoveryEvidence,
      scope: '真实认证、网关、HR、AUTH、MySQL、Redis及培训协议字节；员工和培训报名为隔离前置。complete模式包括实际HR双端页面及丢失真实响应，其余模式仅管理员接口检查；不含结算收付或正式部署。', verifiedAt: new Date().toISOString() }, null, 2));
    console.log(`H2_TRAINING_RECOVERY_REAL_RESULT: checks=${checks.length}; failed=${failure ? 1 : 0}; requests=${requests.length}; real_http=true; source_fixture=true; interface_doubles=0; evidence=${JSON.stringify(hrTrainingRecoveryEvidence)}; production_modified=false`);
  }
  if (hrContactCapacityOnly) console.log(`H2_CONTACT_CAPACITY_REAL_RESULT: checks=${checks.length}; failed=${failure ? 1 : 0}; requests=${requests.length}; real_http=true; interface_doubles=0; actual_onboarding_http=false; production_modified=false`);
  if (hrTrainingCertificateCapacity) console.log(`H5_TRAINING_CAPACITY_REAL_RESULT: checks=${checks.length}; failed=${failure ? 1 : 0}; requests=${requests.length}; mysql=true; redis=true; real_http=true; evidence=${JSON.stringify(hrTrainingCapacityEvidence)}; interface_doubles=0; production_modified=false`);
  else if (hrGrievanceArchiveCapacity) console.log(`H5_GRIEVANCE_CAPACITY_REAL_RESULT: checks=${checks.length}; failed=${failure ? 1 : 0}; requests=${requests.length}; mysql=true; redis=true; real_http=true; evidence=${JSON.stringify(hrGrievanceCapacityEvidence)}; interface_doubles=0; production_modified=false`);
  else if (hrEmployeeCertificateCapacity) console.log(`H5_EMPLOYEE_CERTIFICATE_REAL_RESULT: checks=${checks.length}; failed=${failure ? 1 : 0}; requests=${requests.length}; evidence=${JSON.stringify(hrEmployeeCertificateEvidence)}; interface_doubles=0; production_modified=false`);
  else if (hrSkillsOnly) console.log(`H2_SKILL_REAL_RESULT: checks=${checks.length}; failed=${failure ? 1 : 0}; requests=${requests.length}; mysql=true; redis=true; real_http=true; evidence=${JSON.stringify(hrSkillEvidence)}; interface_doubles=0; production_modified=false`);
  if (loginSessionOnly) {
    await fs.writeFile(path.join(directory, `g4-login-session-${caseTag}.json`), JSON.stringify({ passed: !failure, checks, requests, failure, verifiedAt: new Date().toISOString() }, null, 2));
    console.log(`G4_LOGIN_SESSION_REAL_RESULT: checks=${checks.length}; failed=${failure ? 1 : 0}; requests=${requests.length}; real_mysql=true; real_redis=true; real_browser_login=true; service_policy_injection=${!failure}; interface_doubles=0; source_changes_fixture=true; complete_sync=false; production_modified=false`);
  }
  if (imConfigOnly) {
    const scope = '企业微信配置专项：真实登录、网关、MySQL、Redis及电脑手机页面；仅延迟或中断真实保存响应；部署始终关闭外部连接，独立密钥为可恢复隔离配置，未做厂商联调，不修改正式服务器。';
    await fs.writeFile(path.join(directory, `g4-im-config-${caseTag}.json`), JSON.stringify({ scope, passed: !failure, checks, requests, evidence: imConfigEvidence, failure, verifiedAt: new Date().toISOString() }, null, 2));
    console.log(`G4_IM_CONFIG_REAL_RESULT: checks=${checks.length}; failed=${failure ? 1 : 0}; requests=${requests.length}; mysql=true; redis=true; real_http=true; evidence=${JSON.stringify(imConfigEvidence)}; interface_doubles=0; vendor_service=false; production_modified=false`);
  }
  if (hrSettlementDraftOnly) console.log(`H2_SETTLEMENT_DRAFT_REAL_RESULT: checks=${checks.length}; failed=${failure ? 1 : 0}; requests=${requests.length}; mysql=true; redis=true; real_http=true; evidence=${JSON.stringify(hrSettlementDraftEvidence)}; lifecycle_fixture=true; source_posting=${hrSettlementDraftEvidence.fundsPosted === true}; successful_interface_doubles=0; production_modified=false`);
  if (tenantPackageOnly) console.log(`H5_TENANT_PACKAGE_REAL_RESULT: checks=${checks.length}; failed=${failure ? 1 : 0}; requests=${requests.length}; mysql=true; redis=true; real_http=true; evidence=${JSON.stringify(tenantPackageEvidence)}; interface_doubles=0; production_modified=false`);
  if (reportOnly) console.log(`H5_REPORT_REAL_RESULT: checks=${checks.length}; failed=${failure ? 1 : 0}; requests=${requests.length}; mysql=true; redis=true; real_http=true; evidence=${JSON.stringify(reportEvidence)}; interface_doubles=0; production_modified=false`);
  if (oauth2Only) console.log(`H5_OAUTH2_REAL_RESULT: checks=${checks.length}; failed=${failure ? 1 : 0}; requests=${requests.length}; mysql=true; redis=true; real_http=true; evidence=${JSON.stringify(oauth2Evidence)}; production_modified=false`);
  if (dataSourceOnly) console.log(`H5_DATA_SOURCE_${dataSourceLiveOnly ? 'LIVE_HTTP' : 'FOUNDATION'}_RESULT: checks=${checks.length}; failed=${failure ? 1 : 0}; requests=${requests.length}; mysql=true; redis=true; real_http=true; evidence=${JSON.stringify(dataSourceEvidence)}; interface_doubles=0; account_permission_queries=${dataSourceLiveOnly ? 'not_instrumented' : '0'}; production_modified=false`);
  if (filePreviewOnly) console.log(`H5_FILE_PREVIEW_REAL_RESULT: checks=${checks.length}; failed=${failure ? 1 : 0}; requests=${requests.length}; mysql=true; redis=true; real_http=true; evidence=${JSON.stringify(filePreviewEvidence)}; interface_doubles=0; production_modified=false`);
  if (businessSearchOnly) console.log(`H5_BUSINESS_SEARCH_REAL_RESULT: checks=${checks.length}; failed=${failure ? 1 : 0}; requests=${requests.length}; mysql=true; redis=true; real_http=true; evidence=${JSON.stringify(businessSearchEvidence)}; interface_doubles=0; production_modified=false`);
  if (platformAccessOnly) console.log(`H5_PLATFORM_ACCESS_REAL_RESULT: checks=${checks.length}; failed=${failure ? 1 : 0}; requests=${requests.length}; mysql=true; redis=true; real_http=true; evidence=${JSON.stringify(platformAccessEvidence)}; interface_doubles=0; package_business=false; production_modified=false`);
  if (hrAdvancePayrollOnly) console.log(`H2_ADVANCE_PAYROLL_REAL_RESULT: checks=${checks.length}; failed=${failure ? 1 : 0}; requests=${requests.length}; mysql=true; redis=true; real_http=true; funding_fixture=true; evidence=${JSON.stringify(hrAdvancePayrollEvidence)}; interface_doubles=0; production_modified=false`);
  if (hrAdvanceApprovalOnly) console.log(`H2_ADVANCE_APPROVAL_REAL_RESULT: checks=${checks.length}; failed=${failure ? 1 : 0}; requests=${requests.length}; mysql=true; redis=true; real_http=true; funding_fixture=false; evidence=${JSON.stringify(hrAdvanceApprovalEvidence)}; successful_business_response_doubles=0; injected_approval_read_failures=${process.argv.includes('--hr-advance-approval-only') ? 2 : 0}; production_modified=false`);
  else if (hrAdvanceEntryOnly) console.log(`H2_ADVANCE_ENTRY_REAL_RESULT: checks=${checks.length}; failed=${failure ? 1 : 0}; requests=${requests.length}; mysql=true; redis=true; real_http=true; funding_fixture=true; evidence=${JSON.stringify(hrAdvanceEntryEvidence)}; interface_doubles=0; production_modified=false`);
  if (hrOvertimeOnly) console.log(`H2_OVERTIME_REAL_RESULT: checks=${checks.length}; failed=${failure ? 1 : 0}; requests=${requests.length}; mysql=true; redis=true; real_http=true; evidence=${JSON.stringify(hrOvertimeEvidence)}; interface_doubles=0; production_modified=false`);
  if (hrAppraisalsOnly) console.log(`H2_APPRAISAL_REAL_RESULT: checks=${checks.length}; failed=${failure ? 1 : 0}; requests=${requests.length}; mysql=true; redis=true; real_http=true; evidence=${JSON.stringify(hrAppraisalEvidence)}; interface_doubles=0; production_modified=false`);
  if (salesTargetOnly) console.log(`H3_SALES_TARGET_REAL_RESULT: checks=${checks.length}; failed=${failure ? 1 : 0}; requests=${requests.length}; mysql=true; redis=true; real_http=true; evidence=${JSON.stringify(salesTargetEvidence)}; interface_doubles=0; production_modified=false`);
  if (receivableProtectionOnly) console.log(`${receivableTeamsOnly ? 'H3_RECEIVABLE_TEAM' : receiptRefundOnly ? 'H3_SELECTED_RECEIPT_REFUND' : 'H3_RECEIVABLE_PROTECTION'}_REAL_RESULT: checks=${checks.length}; failed=${failure ? 1 : 0}; requests=${requests.length}; mysql=true; redis=true; real_http=true; evidence=${JSON.stringify(receivableEvidence)}; interface_doubles=0; production_modified=false`);
  if (contractTeamOnly) console.log(`H3_CONTRACT_TEAM_REAL_RESULT: checks=${checks.length}; failed=${failure ? 1 : 0}; requests=${requests.length}; mysql=true; redis=true; real_http=true; evidence=${JSON.stringify(contractTeamEvidence)}; interface_doubles=0; production_modified=false`);
  if (a3JobManagementOnly) console.log(`${a3NaturalCadenceOnly ? 'A3_NATURAL_CADENCE' : a3AnomalyScanOnly ? 'A3_ANOMALY_SCAN' : a3DeadlockScanOnly ? 'A3_DEADLOCK_SCAN' : a3TimerScanOnly ? 'A3_TIMER_SCAN' : a3AuditArchiveOnly ? 'A3_AUDIT_ARCHIVE' : a3TaskTimeoutOnly ? 'A3_TASK_TIMEOUT' : a3ProcessReconcileOnly ? 'A3_PROCESS_RECONCILE' : a3TaskReminderOnly ? 'A3_TASK_REMINDER' : a3DictScanOnly ? 'A3_DICT_SCAN' : a3CrmNotificationsOnly ? 'A3_CRM_NOTIFICATIONS' : a3OaScansOnly ? 'A3_OA_SCANS' : a3QuoteExpireOnly ? 'A3_QUOTE_EXPIRE' : a3TrainingArchiveOnly ? 'A3_TRAINING_ARCHIVE' : a3BusinessExitOnly ? 'A3_BUSINESS_EXIT' : a4YearlyOnly ? 'A4_YEARLY_REMINDER' : a3JobClusterOnly ? 'A3_JOB_CLUSTER' : a3JobPrimaryFaultOnly && process.argv.some(value => value.startsWith('--a3-primary-recover=')) ? 'A3_PRIMARY_RECOVERY' : a3JobPrimaryFaultOnly ? 'A3_JOB_PRIMARY_FAULT' : a3JobFailoverOnly ? 'A3_JOB_FAILOVER' : a3JobReportFaultOnly ? 'A3_JOB_REPORT_FAULT' : a3JobSchedulersOnly ? 'A3_JOB_SCHEDULERS' : a3JobPeerOnly ? 'A3_JOB_PEER' : a3JobOutageOnly ? 'A3_JOB_OUTAGE' : a3JobCrmFailureOnly ? 'A3_JOB_CRM_FAILURE' : a3JobTenantFailureOnly ? 'A3_JOB_TENANT_FAILURE' : a3JobFailureOnly ? 'A3_JOB_FAILURE' : a3JobLongOnly ? 'A3_JOB_LONG' : a3JobBusinessOnly ? 'A3_JOB_BUSINESS' : 'A3_JOB_MANAGEMENT'}_REAL_RESULT: checks=${checks.length}; failed=${failure ? 1 : 0}; requests=${requests.length}; evidence=${JSON.stringify(a3JobManagementEvidence)}; interface_doubles=0; production_modified=false`);
  else if (oaContractAccessOnly) console.log(`F4_CONTRACT_ACCESS_REAL_RESULT: checks=${checks.length}; failed=${failure ? 1 : 0}; requests=${requests.length}; evidence=${JSON.stringify(oaContractAccessEvidence)}; interface_doubles=0; production_modified=false`);
  else if (oaContractReviewOnly) console.log(`F4_CONTRACT_REVIEW_REAL_RESULT: checks=${checks.length}; failed=${failure ? 1 : 0}; requests=${requests.length}; evidence=${JSON.stringify(oaContractReviewEvidence)}; interface_doubles=0; production_modified=false`);
  else if (oaContractRemindersOnly) console.log(`F4_CONTRACT_REMINDERS_REAL_RESULT: checks=${checks.length}; failed=${failure ? 1 : 0}; requests=${requests.length}; evidence=${JSON.stringify(oaContractRemindersEvidence)}; interface_doubles=0; production_modified=false`);
  else if (oaContractTermsOnly) console.log(`F4_CONTRACT_TERMS_REAL_RESULT: checks=${checks.length}; failed=${failure ? 1 : 0}; requests=${requests.length}; evidence=${JSON.stringify(oaContractTermsEvidence)}; interface_doubles=0; production_modified=false`);
  else if (oaSignMethodsOnly) console.log(`F4_SIGN_METHODS_REAL_RESULT: checks=${checks.length}; failed=${failure ? 1 : 0}; requests=${requests.length}; evidence=${JSON.stringify(oaSignMethodsEvidence)}; interface_doubles=0; production_modified=false`);
  else if (contractPerformanceOnly) console.log(`H3_CONTRACT_PERFORMANCE_REAL_RESULT: checks=${checks.length}; failed=${failure ? 1 : 0}; requests=${requests.length}; mysql=true; redis=true; real_http=true; evidence=${JSON.stringify(contractPerformanceEvidence)}; interface_doubles=0; production_modified=false`);
  if (quoteHandoverOnly) console.log(`${quoteContractCopyOnly ? quoteContractCopyUiOnly ? 'H3_QUOTE_CONTRACT_COPY_UI' : 'H3_QUOTE_CONTRACT_COPY' : hrSuccessorOnly ? 'H3_HR_SUCCESSOR' : 'H3_QUOTE_HANDOVER'}_REAL_RESULT: checks=${checks.length}; failed=${failure ? 1 : 0}; requests=${requests.length}; mysql=true; redis=true; real_http=true; evidence=${JSON.stringify(quoteHandoverEvidence)}; interface_doubles=0; production_modified=false`);
  if (emailArchiveOnly) console.log(`H3_EMAIL_ARCHIVE_REAL_RESULT: checks=${checks.length}; failed=${failure ? 1 : 0}; requests=${requests.length}; mysql=true; redis=true; real_http=true; evidence=${JSON.stringify(emailArchiveEvidence)}; interface_doubles=0; production_modified=false`);
  if (opportunityOnly) console.log(`${opportunityImportOnly ? 'H3_OPPORTUNITY_IMPORT' : opportunityReopenOnly ? 'H3_OPPORTUNITY_REOPEN' : 'H3_OPPORTUNITY'}_REAL_RESULT: checks=${checks.length}; failed=${failure ? 1 : 0}; requests=${requests.length}; mysql=true; redis=true; real_http=true; evidence=${JSON.stringify(opportunityEvidence)}; interface_doubles=0; production_modified=false`);
  if (menuLayoutOnly) console.log(`MENU_LAYOUT_REAL_RESULT: checks=${checks.length}; failed=${failure ? 1 : 0}; requests=${requests.length}; mysql=true; redis=true; real_browser=true; interface_doubles=0; production_modified=false`);
  if (crmEmailOnly) console.log(`E5_EMAIL_REAL_RESULT: checks=${checks.length}; failed=${failure ? 1 : 0}; requests=${requests.length}; mysql=true; redis=true; real_http=true; evidence=${JSON.stringify(crmEmailEvidence)}; interface_doubles=0; production_modified=false`);
  if (meetingOnly) console.log(`H4_MEETING_REAL_RESULT: mode=${meetingMode}; checks=${checks.length}; failed=${failure ? 1 : 0}; requests=${requests.length}; mysql=true; redis=true; real_browser=true; real_http=true; interface_doubles=0; ui_workflows=${meetingEvidence.uiWorkflows}; smtp_provider=${meetingEvidence.smtpProvider}; production_modified=false`);
  if (holidayConsumersOnly) console.log(`HOLIDAY_CONSUMERS_REAL_RESULT: checks=${checks.length}; failed=${failure ? 1 : 0}; requests=${requests.length}; mysql=true; redis=true; real_http=true; interface_doubles=0; production_modified=false`);
  if (messageDeliveryOnly) console.log(`MESSAGE_DELIVERY_REAL_RESULT: checks=${checks.length}; failed=${failure ? 1 : 0}; requests=${requests.length}; mysql=true; redis=true; real_browser=true; interface_doubles=0; unknown_state_fixture=true; smtp_protocol_separate=true; production_modified=false`);
  if (rfqEmailOnly) console.log(`RFQ_EMAIL_REAL_RESULT: checks=${checks.length}; failed=${failure ? 1 : 0}; requests=${requests.length}; mysql=true; redis=true; real_browser=true; real_smtp_protocol=true; interface_doubles=0; production_modified=false`);
  if (rfqSelectionOnly) console.log(`RFQ_SELECTION_REAL_RESULT: checks=${checks.length}; failed=${failure ? 1 : 0}; requests=${requests.length}; mysql=true; redis=true; real_browser=true; interface_doubles=0; production_modified=false`);
  if (agentOnly) console.log(`H1_AGENT_REAL_RESULT: checks=${checks.length}; failed=${failure ? 1 : 0}; requests=${requests.length}; mysql=true; redis=true; real_http=true; interface_doubles=0; production_modified=false`);
  if (gatewayOnly) console.log(`H1_GATEWAY_REAL_RESULT: checks=${checks.length}; failed=${failure ? 1 : 0}; requests=${requests.length}; mysql=true; redis=true; real_http=true; interface_doubles=0; production_modified=false`);
  if (gatewayDesignerOnly) console.log(`H1_GATEWAY_DESIGNER_REAL_RESULT: checks=${checks.length}; failed=${failure ? 1 : 0}; requests=${requests.length}; mysql=true; redis=true; real_browser=true; interface_doubles=0; production_modified=false`);
  if (gatewayRewindOnly) console.log(`H1_GATEWAY_REWIND_REAL_RESULT: checks=${checks.length}; failed=${failure ? 1 : 0}; requests=${requests.length}; mysql=true; redis=true; real_http=true; interface_doubles=0; production_modified=false`);
  if (withdrawalUiOnly) console.log(`H1_WITHDRAWAL_UI_REAL_RESULT: checks=${checks.length}; failed=${failure ? 1 : 0}; requests=${requests.length}; mysql=true; redis=true; real_browser=true; interface_doubles=0; production_modified=false`);
  if (addSignOnly) console.log(`H1_ADDSIGN_REAL_RESULT: checks=${checks.length}; failed=${failure ? 1 : 0}; requests=${requests.length}; mysql=true; redis=true; real_http=true; interface_doubles=0; production_modified=false`);
  if (addSignUiOnly) console.log(`H1_ADDSIGN_UI_REAL_RESULT: checks=${checks.length}; failed=${failure ? 1 : 0}; requests=${requests.length}; mysql=true; redis=true; real_browser=true; interface_doubles=0; production_modified=false`);
  await browser?.close();
  await server.close();
}
