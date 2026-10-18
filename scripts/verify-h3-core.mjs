import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const [statePath, output, backend, frontend, scenario] = process.argv.slice(2);
const definitions = {
  Codegen: { flag: '--a1-codegen-only', category: 'a1-codegen',
    required: ['imports', 'metadata', 'configuration', 'structureComparison', 'actualAuditFields', 'messageTables', 'download', 'diskWrites',
      'pathBoundaries', 'templateVariants', 'internalTemplate', 'permissions', 'permissionRevocation', 'generatedMenu',
      'permissionAssignmentsRestored', 'menuUi', 'configurationUi', 'previewUi', 'diskWriteUi', 'permissionUi', 'desktop', 'mobile', 'mobileNarrow'] },
  CodegenDisabled: { flag: '--a1-codegen-disabled-only', category: 'a1-codegen-disabled',
    required: ['disabled', 'desktop', 'mobile', 'mobileNarrow'] },
  RfqComparison: { flag: '--f5-rfq-only', category: 'f5-rfq',
    required: ['creation', 'invitations', 'admission', 'watch', 'minimum', 'quotations', 'precision', 'comparison', 'scores',
      'confidentiality', 'export', 'exportContents', 'award', 'purchase', 'awardRevalidation', 'restart', 'audit', 'reports',
      'permissions', 'mail', 'deadlines', 'mailPrivacy', 'selection', 'comparisonViews', 'quotationUi', 'awardUi',
      'warningUi', 'reportUi', 'desktop', 'mobile', 'mobileNarrow'] },
  ProjectHours: { flag: '--f3-projects-only', category: 'f3-projects',
    required: ['catalog', 'ratePriority', 'dailyLimits', 'frozenRates', 'approval', 'reversal', 'accounting', 'purchase',
      'invoice', 'recalculation', 'costPrivacy', 'tree', 'progress', 'dependencies', 'dependencyWarnings', 'templates',
      'gantt', 'reports', 'permissions', 'concurrency', 'desktop', 'mobile', 'mobileNarrow', 'lostResponse', 'audit', 'memberPeriods'] },
  SupplierGovernance: { flag: '--f2-suppliers-only', category: 'f2-suppliers',
    required: ['profile', 'categories', 'deletion', 'qualifications', 'files', 'earliestExpiry', 'weights', 'scoring', 'confirmation',
      'delivery', 'periodProtection', 'eliminated', 'warning', 'liveRules', 'expiryAdmission', 'hits', 'governance', 'blacklist',
      'bypass', 'downgrade', 'expiry', 'periodicJobs', 'reports', 'reportCharts', 'audit', 'permissions', 'desktop', 'mobile', 'mobileNarrow'] },
  AssetLifecycle: { flag: '--f1-assets-only', category: 'f1-assets',
    required: ['categories', 'deletion', 'annualAmounts', 'preview', 'posting', 'history', 'expiry', 'maintenance', 'repairEntry',
      'repairStates', 'capitalization', 'extension', 'movements', 'timeline', 'asyncThousand', 'ledger', 'audit', 'permissions', 'desktop', 'mobile'] },
  OpportunityImport: { flag: '--opportunity-import-only', category: 'h3-opportunity',
    required: ['mixed', 'versionConflicts', 'duplicateRows', 'permissions', 'stageRules', 'liveRevalidation', 'products',
      'idempotency', 'recovery', 'legacyCreateOnly', 'templates', 'desktop', 'mobile', 'lostResponse', 'cleanup'] },
  Opportunity: { flag: '--opportunity-only', category: 'h3-opportunity',
    required: ['business', 'workflow', 'reminders', 'desktop', 'mobile', 'teams', 'teamHrHttp', 'wonFacts', 'teamDesktop', 'teamMobile'] },
  Teams: { flag: '--opportunity-teams-only', category: 'h3-deal-team',
    required: ['teams', 'teamHrHttp', 'wonFacts', 'teamDesktop', 'teamMobile'] },
  Reopen: { flag: '--opportunity-reopen-only', category: 'h3-opportunity-reopen',
    required: ['business', 'workflow', 'permissions', 'concurrency', 'originalAllocations', 'wonCountReversed',
      'lostHistory', 'contractSources', 'receipts', 'lateContractRequestRejected', 'desktop', 'mobile'] },
  Targets: { flag: '--sales-target-only', category: 'h3-sales-target',
    required: ['receipts', 'refundCallback', 'basisSwitch', 'permissions', 'concurrency', 'desktop', 'mobile', 'lostResponse'] },
  EmailArchive: { flag: '--email-archive-only', category: 'h3-email-archive',
    required: ['business', 'permissions', 'attachments', 'smtp', 'callbacks', 'publicTracking', 'desktop', 'mobile'] },
  PortalAuth: { flag: '--portal-auth-only', category: 'h3-portal-auth',
    required: ['smtp', 'invitation', 'authentication', 'domainIsolation', 'permissions', 'concurrency', 'rateLimits', 'invitationExpiry', 'contactChanges', 'revokedDelivery', 'desktop', 'mobile'] },
  PortalDisabled: { flag: '--portal-disabled-only', category: 'h3-portal-disabled',
    required: ['disabled', 'desktop', 'mobile'] },
  PortalKnowledge: { flag: '--portal-knowledge-only', category: 'h3-portal-knowledge',
    required: ['workflow', 'frozenVersion', 'sanitization', 'permissions', 'concurrency', 'withdrawal', 'attachmentPublication', 'desktop', 'mobile', 'mobileNarrow', 'internalHeader'] },
  PortalTicket: { flag: '--portal-ticket-only', category: 'h3-portal-ticket',
    required: ['submission', 'assignment', 'publication', 'permissions', 'files', 'concurrency', 'desktop', 'mobile', 'lostResponse', 'assignmentView', 'publicationView', 'publishedProgressView', 'customerListView'] },
  PortalContract: { flag: '--portal-contract-only', category: 'h3-portal-contract',
    required: ['workflow', 'signature', 'selection', 'permissions', 'precision', 'concurrency', 'withdrawal', 'identity', 'desktop', 'mobile', 'lostResponse', 'publicationView', 'detailView', 'internalHeader', 'internalSummary'] },
  PortalFinance: { flag: '--portal-finance-only', category: 'h3-portal-finance',
    required: ['permissions', 'precision', 'concurrency', 'withdrawal', 'identity', 'files', 'audit', 'desktop', 'mobile', 'lostResponse', 'publicationView', 'receiptView'] },
  PortalOAuth: { flag: '--portal-auth-only', additionalFlags: ['--oauth2-portal-check'], category: 'h5-oauth2-portal', pageRequired: false,
    required: ['smtp', 'invitation', 'domainIsolation', 'permissions', 'concurrency', 'oauth2SameNumber', 'oauth2GrantsRestored', 'oauth2Secrets', 'oauth2Cleanup'] },
};
assert.ok(Object.hasOwn(definitions, scenario), 'Explicit independent H3 scenario required');
assert.match(backend, /^r[1-9]\d*$/); assert.match(frontend, /^r[1-9]\d*$/);
assert.equal(fs.realpathSync(root), fs.realpathSync('D:/CloudFlowPro'));
assert.equal(path.dirname(fs.realpathSync(output)), fs.realpathSync(path.join(root, '.cloudflow-runtime/full-prd-20260915/approved-runtime')));
assert.match(path.basename(output), scenario === 'Codegen' ? /^a1-codegen-independent-20261016-r[1-9]\d*$/
  : scenario === 'CodegenDisabled' ? /^a1-codegen-disabled-independent-20261016-r[1-9]\d*$/
  : scenario === 'RfqComparison' ? /^f5-rfq-independent-20261015-r[1-9]\d*$/
  : scenario === 'ProjectHours' ? /^f3-projects-independent-20261015-r[1-9]\d*$/
  : scenario === 'SupplierGovernance' ? /^f2-suppliers-independent-20261012-r[1-9]\d*$/
  : scenario === 'AssetLifecycle' ? /^f1-assets-independent-20261012-r[1-9]\d*$/ : /^h3-core-independent-20261011-r[1-9]\d*$/);
const state = JSON.parse(fs.readFileSync(statePath, 'utf8').replace(/^\uFEFF/, ''));
const run = fs.realpathSync(state.run);
assert.equal(state.status, 'RUNNING');
assert.equal(fs.realpathSync(path.dirname(statePath)), run);
assert.equal(path.dirname(run), fs.realpathSync(path.join(root, '.cloudflow-runtime/batch-g-integration')));
assert.match(path.basename(run), /^[a-f0-9]{32}$/);
assert.notEqual(path.basename(run), '9799534e1a3a47b5958330f14ae16dc7');
const definition = definitions[scenario];
const plan = JSON.parse(fs.readFileSync(path.join(output, 'execution-plan.json'), 'utf8'));
assert.equal(plan.mode, scenario === 'Codegen' ? 'A1_CODEGEN_INDEPENDENT' : scenario === 'CodegenDisabled' ? 'A1_CODEGEN_DISABLED_INDEPENDENT' : scenario === 'RfqComparison' ? 'F5_RFQ_INDEPENDENT' : scenario === 'ProjectHours' ? 'F3_PROJECTS_INDEPENDENT' : scenario === 'SupplierGovernance' ? 'F2_SUPPLIERS_INDEPENDENT' : scenario === 'AssetLifecycle' ? 'F1_ASSETS_INDEPENDENT' : 'H3_CORE_INDEPENDENT');
assert.equal(plan.scenario, scenario);
assert.equal(plan.backend, backend); assert.equal(plan.frontend, frontend);
assert.equal(plan.pageRequired, definition.pageRequired !== false);
assert.equal(state.verification?.scenario, scenario);
assert.equal(state.verification?.inputsFrozen, true);
const accounts = JSON.parse(fs.readFileSync(path.join(run, 'private/accounts.json'), 'utf8'));
const sensitive = new Set(accounts.map(account => account.password).filter(Boolean));
for (const service of state.services) {
  const properties = fs.readFileSync(path.join(run, service.name, 'integration.properties'), 'utf8');
  for (const line of properties.split(/\r?\n/)) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match && /secret-key|aes-key|internal-auth\.keys\.|^spring\.data\.redis\.password$/.test(match[1]) && match[2]) sensitive.add(match[2]);
  }
}
sensitive.add(fs.readFileSync(path.join(run, 'private/smtp/store-password.txt'), 'utf8'));
sensitive.add('fixture-password');
if (plan.portalRequired) sensitive.add(fs.readFileSync(path.join(run, 'private/portal/store-password.txt'), 'utf8'));
fs.writeFileSync(path.join(run, 'private/h3-core-secrets.json'), JSON.stringify([...sensitive]), { flag: 'wx' });
const redact = error => {
  let message = String(error?.stack || error);
  for (const secret of sensitive) message = message.replaceAll(secret, '[redacted]');
  return message.replace(/([?&]token=)[A-Za-z0-9_-]+/g, '$1[redacted]');
};
const sourcePath = path.join(run, definition.category + '-results.json');
assert.ok(!fs.existsSync(sourcePath), 'Independent scenario must not overwrite previous business results');
let source, failure, childExit;
const images = [];
try {
  console.log('H3_CORE_PHASE: scenario=' + scenario + '; starting=true');
  childExit = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(root, 'scripts/verify-batch-g-integration.mjs'), statePath, definition.flag, ...(definition.additionalFlags || []), '--settlement-schema'],
      { cwd: root, env: process.env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout.on('data', bytes => process.stdout.write(bytes));
    child.stderr.on('data', bytes => process.stderr.write(bytes));
    child.once('error', reject);
    child.once('close', (code, signal) => resolve(code ?? (signal ? 1 : 0)));
  });
  for (const value of JSON.parse(fs.readFileSync(path.join(run, 'private/h3-core-secrets.json'), 'utf8'))) sensitive.add(value);
  assert.ok(fs.existsSync(sourcePath), 'Original H3 business result must be present');
  const bytes = fs.readFileSync(sourcePath);
  fs.writeFileSync(path.join(output, 'original-business-result.json'), bytes, { flag: 'wx' });
  source = JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/, ''));
  assert.match(source.caseTag, /^[a-f0-9]{12}$/);
  for (const name of fs.readdirSync(run).filter(name => name.endsWith('.png') && name.includes(source.caseTag))) {
    const sourceImage = path.join(run, name);
    assert.equal(fs.lstatSync(sourceImage).isSymbolicLink(), false);
    const imageBytes = fs.readFileSync(sourceImage);
    assert.equal(imageBytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
    fs.writeFileSync(path.join(output, name), imageBytes, { flag: 'wx' });
    images.push({ name, width: imageBytes.readUInt32BE(16), height: imageBytes.readUInt32BE(20),
      hash: createHash('sha256').update(imageBytes).digest('hex'), actualPage: true, apiDoubles: false,
      actuallyViewed: false, visualAccepted: false });
  }
  assert.equal(childExit, 0, 'Original scenario process failed');
  assert.equal(source.passed, true, 'Original scenario assertions did not complete');
  assert.ok(!source.failure, 'Original scenario reported a failure');
  for (const flag of definition.required) assert.equal(source.evidence?.[flag], true, 'Required original evidence absent: ' + flag);
  if (definition.pageRequired !== false) assert.ok(images.length > 0, 'Actual scenario page images required');
} catch (error) {
  failure = redact(error);
  fs.writeFileSync(path.join(output, 'failure.txt'), failure, { flag: 'wx' });
}
const passed = !failure && childExit === 0 && source?.passed === true;
const sourceEvidence = source?.evidence || {};
const result = {
  passed, backend, frontend, scenario, sourceResult: sourcePath,
  sourceResultHash: fs.existsSync(sourcePath) ? createHash('sha256').update(fs.readFileSync(sourcePath)).digest('hex') : null,
  sourceScope: source?.scope, sourceEvidence, requiredSourceEvidence: definition.required,
  checks: source?.checks || [], requests: source?.requests || [], images, failure, verifierExit: childExit,
  evidence: { scenario: passed, sourceResult: !!source, desktop: sourceEvidence.desktop === true || sourceEvidence.teamDesktop === true,
    mobile: sourceEvidence.mobile === true || sourceEvidence.teamMobile === true },
  uiRequestAccounting: 'Original verifier counts scripted calls and failed page requests; successful page requests are not counted separately',
  pageRequired: definition.pageRequired !== false,
  backendHttp: true, apiDoubles: false, globalComplete: false, allH3AcceptanceComplete: false,
  priorRuntimeWritten: false, externalMessagesSent: false, systemClockChanged: false,
};
fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify(result, null, 2), { flag: 'wx' });
console.log('H3_CORE_RESULT: scenario=' + scenario + '; passed=' + passed + '; checks=' + result.checks.length
  + '; requests=' + result.requests.length + '; images=' + images.length + '; all_h3_complete=false');
process.exitCode = passed ? 0 : 1;
