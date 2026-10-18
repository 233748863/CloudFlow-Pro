import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createE3CreditRuntime } from './runtime-checks/e3-credit-runtime.mjs';
import { prepareE3CreditChecks } from './runtime-checks/e3-credit-fixtures.mjs';
import { verifyE3Losses } from './runtime-checks/e3-credit-losses.mjs';
import { verifyE3CreditApprovalAndExposure } from './runtime-checks/e3-credit-approval.mjs';
import { verifyE3CreditRules, verifyE3CreditRecordedQueries } from './runtime-checks/e3-credit-rules.mjs';
import { verifyE3CreditPages } from './runtime-checks/e3-credit-pages.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const [stateArgument, outputArgument, backendRound, frontendRound] = process.argv.slice(2);
assert.match(backendRound || '', /^r[1-9][0-9]*$/);
assert.match(frontendRound || '', /^r[1-9][0-9]*$/);
const statePath = await fs.realpath(stateArgument);
const output = await fs.realpath(outputArgument);
assert.equal(await fs.realpath(root), await fs.realpath('D:/CloudFlowPro'));
assert.equal(path.dirname(output), await fs.realpath(path.join(root, '.cloudflow-runtime/full-prd-20260915/approved-runtime')));
assert.match(path.basename(output), /^e3-credit-independent-20261009-r[1-9]\d*$/);
const run = path.dirname(statePath);
assert.equal(path.dirname(run), await fs.realpath(path.join(root, '.cloudflow-runtime/batch-g-integration')));
assert.match(path.basename(run), /^[a-f0-9]{32}$/);
assert.notEqual(path.basename(run), '9799534e1a3a47b5958330f14ae16dc7');
for (const name of ['fixture.json', 'result.json']) {
  await fs.access(path.join(output, name)).then(() => { throw new Error('Retain previous E3 evidence'); }, error => { if (error.code !== 'ENOENT') throw error; });
}
const startedAt = new Date().toISOString();
const requiredEvidence = ['masterData', 'lossValidation', 'lossApproval', 'lossReport', 'competitorStats', 'creditApproval', 'creditExposure', 'creditRules',
  'entryPoints', 'ruleVersions', 'bypass', 'audits', 'recordedQueries', 'permissions', 'desktop', 'mobile', 'preservation', 'secrets'];
let runtime, context, initializationFacts, phase = 'runtime', failure = null, secretScan = null;
const cleanupFailures = [];
const privateSecrets = async () => {
  try { return JSON.parse(await fs.readFile(path.join(run, 'private/e3-credit-secrets.json'), 'utf8')); }
  catch { return []; }
};
const errorFact = async (error, failedPhase) => {
  const values = new Set([...(runtime?.sensitive || []), ...await privateSecrets()]);
  let message = String(error?.message || 'E3 verification failed');
  if (values.size === 0) message = 'Failure before private credential inventory was available; details withheld';
  for (const value of values) if (typeof value === 'string' && value.length > 0) message = message.replaceAll(value, '[REDACTED]');
  return { phase: failedPhase, name: error?.name || 'Error', message: message.slice(0, 1200) };
};
const stage = async (name, work) => {
  phase = name;
  console.log('E3_CREDIT_PHASE: name=' + name + '; status=started');
  const result = await work();
  console.log('E3_CREDIT_PHASE: name=' + name + '; status=passed; checks=' + (runtime?.checks.length || 0));
  return result;
};
try {
  runtime = await stage('runtime', () => createE3CreditRuntime(root, statePath, output));
  context = prepareE3CreditChecks(runtime);
  const losses = await stage('actual_losses_master_data_and_reports', () => verifyE3Losses(context));
  const credit = await stage('credit_approvals_and_real_receivables', () => verifyE3CreditApprovalAndExposure(context, losses));
  const rules = await stage('credit_rules_versions_and_bypass', () => verifyE3CreditRules(context, credit));
  await stage('desktop_mobile_and_warning_pages', () => verifyE3CreditPages(context, losses, rules));
  await stage('raw_and_deduplicated_hit_queries', () => verifyE3CreditRecordedQueries(context, rules));
} catch (error) {
  initializationFacts = error?.e3RuntimeFacts;
  failure = await errorFact(error, phase);
  console.log('E3_CREDIT_FAILURE: phase=' + phase + '; checks=' + (runtime?.checks.length || initializationFacts?.checks.length || 0) + '; details=retained');
  if (context && phase.includes('pages')) {
    for (const actor of ['sales', 'manager', 'readonly', 'admin']) {
      try {
        const name = 'e3-failure-' + actor + '.png';
        await context.sessions[actor].page.screenshot({ path: path.join(output, name), fullPage: true });
        context.fixture.images.push({ name, width: context.sessions[actor].page.viewportSize().width, actualBusinessPage: true, failure: true });
      } catch {}
    }
  }
} finally {
  if (context) {
    try { context.preserve(); } catch (error) { cleanupFailures.push(await errorFact(error, 'preservation')); }
  }
  if (runtime) {
    try { secretScan = await runtime.scan(); if (context) context.evidence.secrets = secretScan.leaks === 0; }
    catch (error) { cleanupFailures.push(await errorFact(error, 'secrets')); }
    try { await runtime.close(); } catch (error) { cleanupFailures.push(await errorFact(error, 'close')); }
  }
}
if (!failure && cleanupFailures.length === 0) {
  try {
    assert.ok(context, 'Completed E3 context required');
    for (const flag of requiredEvidence) context.check('required_evidence_' + flag, context.evidence[flag] === true);
    for (let number = 1; number <= 18; number++) {
      const labels = context.acceptance[number];
      context.check('acceptance_' + number + '_bound_to_executed_checks', labels.length > 0 && labels.every(label => runtime.checks.includes(label)));
    }
    context.check('actual_browser_has_no_uncaught_errors', runtime.browserErrors.length === 0);
    context.check('all_seventeen_actual_page_images_recorded', context.fixture.images.length === 17 && new Set(context.fixture.images.map(value => value.name)).size === 17);
  } catch (error) { failure = await errorFact(error, 'coverage'); }
}
const acceptance = Object.fromEntries(Array.from({ length: 18 }, (_, index) => {
  const number = index + 1, labels = [...new Set(context?.acceptance[number] || [])];
  return ['AC-' + number, { executed: labels.length > 0, checks: labels }];
}));
const passed = failure == null && cleanupFailures.length === 0;
const result = { passed, startedAt, endedAt: new Date().toISOString(), backendRound, frontendRound,
  checks: runtime?.checks || initializationFacts?.checks || [], requests: runtime?.requests || initializationFacts?.requests || [], uiRequests: runtime?.uiRequests || initializationFacts?.uiRequests || [],
  evidence: context?.evidence || {}, acceptance, browserErrors: runtime?.browserErrors || initializationFacts?.browserErrors || [], fixtureChanges: runtime?.fixtureChanges || [],
  secretScan, failure, cleanupFailures, screenshotsViewed: false, finalAcceptancePending: true, globalComplete: false,
  independentDatabaseOnly: true, originalEnvironmentWritten: false, systemClockChanged: false, externalMessagesSent: false };
await fs.writeFile(path.join(output, 'fixture.json'), JSON.stringify(context?.fixture || { creationIncomplete: true }, null, 2), { flag: 'wx' });
await fs.writeFile(path.join(output, 'result.json'), JSON.stringify(result, null, 2), { flag: 'wx' });
console.log('E3_CREDIT_RESULT: passed=' + passed + '; checks=' + result.checks.length + '; requests=' + result.requests.length + '; ui_requests=' + result.uiRequests.length + '; acceptance_executed=' + Object.values(acceptance).filter(value => value.executed).length + '; global_complete=false');
if (!passed) process.exitCode = 1;
