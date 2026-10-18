import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createE2SlaRuntime } from './runtime-checks/e2-sla-runtime.mjs';
import { prepareE2SlaChecks } from './runtime-checks/e2-sla-fixtures.mjs';
import { verifyE2SlaPolicies } from './runtime-checks/e2-sla-policies.mjs';
import { startE2SlaLifecycle, finishE2SlaLifecycle } from './runtime-checks/e2-sla-lifecycle.mjs';
import { verifyE2SlaNotifications } from './runtime-checks/e2-sla-notifications.mjs';
import { verifyE2SlaReports } from './runtime-checks/e2-sla-reports.mjs';
import { verifyE2SlaPages } from './runtime-checks/e2-sla-pages.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const [stateArgument, outputArgument, backendRound, frontendRound, verificationSuite = 'full'] = process.argv.slice(2);
assert.ok(['full', 'pages'].includes(verificationSuite));
assert.match(backendRound || '', /^r[1-9][0-9]*$/);
assert.match(frontendRound || '', /^r[1-9][0-9]*$/);
const statePath = await fs.realpath(stateArgument);
const output = await fs.realpath(outputArgument);
assert.equal(await fs.realpath(root), await fs.realpath('D:/CloudFlowPro'));
assert.equal(path.dirname(output), await fs.realpath(path.join(root, '.cloudflow-runtime/full-prd-20260915/approved-runtime')));
assert.match(path.basename(output), /^e2-sla-independent-20261009-r[1-9]\d*$/);
const run = path.dirname(statePath);
assert.equal(path.dirname(run), await fs.realpath(path.join(root, '.cloudflow-runtime/batch-g-integration')));
assert.match(path.basename(run), /^[a-f0-9]{32}$/);
assert.notEqual(path.basename(run), '9799534e1a3a47b5958330f14ae16dc7');
for (const name of ['fixture.json', 'result.json']) {
  await fs.access(path.join(output, name)).then(() => { throw new Error('Retain previous E2 business evidence'); }, error => { if (error.code !== 'ENOENT') throw error; });
}

const startedAt = new Date().toISOString();
const requiredEvidence = verificationSuite === 'full'
  ? ['policies', 'noPolicy', 'calendar', 'response', 'pause', 'restart', 'fulfillment', 'priority', 'reminders', 'legacyEntry', 'reports', 'fallback', 'deduplication', 'permissions', 'desktop', 'mobile', 'preservation', 'secrets']
  : ['reports', 'permissions', 'desktop', 'mobile', 'preservation', 'secrets'];
const requiredAcceptance = verificationSuite === 'full' ? Array.from({ length: 14 }, (_, index) => index + 1) : [1, 12];
let runtime, context, initializationFacts, phase = 'runtime', failure = null, secretScan = null;
const cleanupFailures = [];
const privateSecrets = async () => {
  try { return JSON.parse(await fs.readFile(path.join(run, 'private/e2-sla-secrets.json'), 'utf8')); }
  catch { return []; }
};
const errorFact = async (error, failedPhase) => {
  const values = new Set([...(runtime?.sensitive || []), ...await privateSecrets()]);
  let message = String(error?.message || 'E2 verification failed');
  if (values.size === 0) message = 'Failure before private credential inventory was available; details withheld';
  for (const value of values) if (typeof value === 'string' && value.length > 0) message = message.replaceAll(value, '[REDACTED]');
  return { phase: failedPhase, name: error?.name || 'Error', message: message.slice(0, 1200) };
};
const stage = async (name, work) => {
  phase = name;
  console.log(`E2_SLA_PHASE: name=${name}; status=started`);
  const value = await work();
  console.log(`E2_SLA_PHASE: name=${name}; status=passed; checks=${runtime?.checks.length || value?.checks?.length || 0}`);
  return value;
};

try {
  runtime = await stage('runtime', () => createE2SlaRuntime(root, statePath, output));
  context = prepareE2SlaChecks(runtime);
  if (verificationSuite === 'full') {
    const calendars = await stage('policies_and_calendars', () => verifyE2SlaPolicies(context));
    const pending = await stage('response_and_persisted_pause', () => startE2SlaLifecycle(context));
    await stage('real_scheduled_notifications', () => verifyE2SlaNotifications(context));
    await stage('resume_and_fulfillment', () => finishE2SlaLifecycle(context, pending, calendars));
  } else {
    await stage('page_policy_fixture', () => context.policy('EDITABLE'));
  }
  const reports = await stage('statistics_and_permissions', () => verifyE2SlaReports(context));
  await stage('desktop_and_mobile_pages', () => verifyE2SlaPages(context, reports));
} catch (error) {
  initializationFacts = error?.e2RuntimeFacts;
  failure = await errorFact(error, phase);
  console.log(`E2_SLA_FAILURE: phase=${phase}; checks=${runtime?.checks.length || initializationFacts?.checks.length || 0}; details=retained`);
} finally {
  if (context) {
    try { context.preserve(); }
    catch (error) { cleanupFailures.push(await errorFact(error, 'preservation')); }
  }
  if (runtime) {
    try {
      secretScan = await runtime.scan();
      if (context) context.evidence.secrets = secretScan.leaks === 0;
    } catch (error) { cleanupFailures.push(await errorFact(error, 'secrets')); }
    try { await runtime.close(); }
    catch (error) { cleanupFailures.push(await errorFact(error, 'close')); }
  }
}

if (!failure && cleanupFailures.length === 0) {
  try {
    assert.ok(context, 'Completed E2 context required');
    for (const flag of requiredEvidence) context.check(`required_evidence_${flag}`, context.evidence[flag] === true);
    for (const number of requiredAcceptance) {
      const labels = context.acceptance[number];
      context.check(`acceptance_${number}_bound_to_executed_checks`, labels.length > 0 && labels.every(label => runtime.checks.includes(label)));
    }
    context.check('actual_browser_has_no_uncaught_errors', runtime.browserErrors.length === 0);
    context.check('all_seven_actual_page_images_recorded', context.fixture.images.length === 7 && new Set(context.fixture.images.map(value => value.name)).size === 7);
    if (verificationSuite === 'full') context.check('both_actual_crm_restarts_completed', context.fixture.restarts.length === 2);
    else context.check('page_followup_does_not_repeat_lifecycle_or_restarts', context.fixture.restarts.length === 0);
  } catch (error) { failure = await errorFact(error, 'coverage'); }
}

const acceptance = Object.fromEntries(Array.from({ length: 14 }, (_, index) => {
  const number = index + 1;
  const labels = [...new Set(context?.acceptance[number] || [])];
  return [`AC-${number}`, { executed: labels.length > 0, checks: labels }];
}));
const passed = failure == null && cleanupFailures.length === 0;
const result = {
  passed, startedAt, endedAt: new Date().toISOString(), backendRound, frontendRound, verificationSuite,
  checks: runtime?.checks || initializationFacts?.checks || [], requests: runtime?.requests || initializationFacts?.requests || [], uiRequests: runtime?.uiRequests || initializationFacts?.uiRequests || [],
  evidence: context?.evidence || {}, acceptance, browserErrors: runtime?.browserErrors || initializationFacts?.browserErrors || [],
  fixtureChanges: runtime?.fixtureChanges || [], secretScan, failure, cleanupFailures,
  screenshotsViewed: false, finalAcceptancePending: true, globalComplete: false,
  independentDatabaseOnly: true, originalEnvironmentWritten: false, systemClockChanged: false,
  originalHourlyCronObserved: false, externalMessagesSent: false,
};
await fs.writeFile(path.join(output, 'fixture.json'), JSON.stringify(context?.fixture || { creationIncomplete: true }, null, 2), { flag: 'wx' });
await fs.writeFile(path.join(output, 'result.json'), JSON.stringify(result, null, 2), { flag: 'wx' });
console.log(`E2_SLA_RESULT: passed=${passed}; checks=${result.checks.length}; requests=${result.requests.length}; ui_requests=${result.uiRequests.length}; acceptance_executed=${Object.values(acceptance).filter(value => value.executed).length}; global_complete=false`);
if (!passed) process.exitCode = 1;
