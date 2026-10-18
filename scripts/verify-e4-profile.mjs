import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createE4ProfileRuntime } from './runtime-checks/e4-profile-runtime.mjs';
import { prepareE4ProfileChecks } from './runtime-checks/e4-profile-fixtures.mjs';
import { verifyE4Territories } from './runtime-checks/e4-profile-territories.mjs';
import { verifyE4Qualification } from './runtime-checks/e4-profile-qualification.mjs';
import { verifyE4Scoring } from './runtime-checks/e4-profile-scoring.mjs';
import { verifyE4Consent } from './runtime-checks/e4-profile-consent.mjs';
import { verifyE4Reports } from './runtime-checks/e4-profile-reports.mjs';
import { verifyE4ProfilePages } from './runtime-checks/e4-profile-pages.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const [stateArgument, outputArgument, backendRound, frontendRound] = process.argv.slice(2);
assert.match(backendRound || '', /^r[1-9][0-9]*$/);
assert.match(frontendRound || '', /^r[1-9][0-9]*$/);
const statePath = await fs.realpath(stateArgument);
const output = await fs.realpath(outputArgument);
assert.equal(await fs.realpath(root), await fs.realpath('D:/CloudFlowPro'));
assert.equal(path.dirname(output), await fs.realpath(path.join(root, '.cloudflow-runtime/full-prd-20260915/approved-runtime')));
assert.match(path.basename(output), /^e4-profile-independent-20261010-r[1-9]\d*$/);
const run = path.dirname(statePath);
assert.equal(path.dirname(run), await fs.realpath(path.join(root, '.cloudflow-runtime/batch-g-integration')));
assert.match(path.basename(run), /^[a-f0-9]{32}$/);
assert.notEqual(path.basename(run), '9799534e1a3a47b5958330f14ae16dc7');
for (const name of ['fixture.json', 'result.json']) {
  await fs.access(path.join(output, name)).then(() => { throw new Error('Retain previous E4 evidence'); }, error => { if (error.code !== 'ENOENT') throw error; });
}
const startedAt = new Date().toISOString();
const requiredEvidence = ['profileFields', 'qualification', 'conversionGuard', 'conversionMapping', 'territories', 'scoring', 'batch', 'filters', 'consent',
  'reports', 'audits', 'permissions', 'desktop', 'mobile', 'preservation', 'secrets'];
let runtime, context, initializationFacts, phase = 'runtime', failure = null, secretScan = null;
const cleanupFailures = [];
const privateSecrets = async () => {
  try { return JSON.parse(await fs.readFile(path.join(run, 'private/e4-profile-secrets.json'), 'utf8')); }
  catch { return []; }
};
const errorFact = async (error, failedPhase) => {
  const values = new Set([...(runtime?.sensitive || []), ...await privateSecrets()]);
  let message = String(error?.message || 'E4 verification failed');
  if (values.size === 0) message = 'Failure before private credential inventory was available; details withheld';
  for (const value of values) if (typeof value === 'string' && value.length > 0) message = message.replaceAll(value, '[REDACTED]');
  return { phase: failedPhase, name: error?.name || 'Error', message: message.slice(0, 1200) };
};
const stage = async (name, work) => {
  phase = name;
  console.log('E4_PROFILE_PHASE: name=' + name + '; status=started');
  const result = await work();
  console.log('E4_PROFILE_PHASE: name=' + name + '; status=passed; checks=' + (runtime?.checks.length || 0));
  return result;
};
try {
  runtime = await stage('runtime', () => createE4ProfileRuntime(root, statePath, output));
  context = prepareE4ProfileChecks(runtime);
  const tree = await stage('territories_and_subtree_integrity', () => verifyE4Territories(context));
  await stage('qualification_and_complete_conversion', () => verifyE4Qualification(context, tree));
  const scoring = await stage('score_rules_and_asynchronous_recalculation', () => verifyE4Scoring(context));
  await stage('unsubscribe_and_actual_campaign_audience', () => verifyE4Consent(context));
  await stage('desktop_mobile_profile_pages', () => verifyE4ProfilePages(context, tree, scoring));
  await stage('four_dimension_reports_and_permissions', () => verifyE4Reports(context));
} catch (error) {
  initializationFacts = error?.e4RuntimeFacts;
  failure = await errorFact(error, phase);
  console.log('E4_PROFILE_FAILURE: phase=' + phase + '; checks=' + (runtime?.checks.length || initializationFacts?.checks.length || 0) + '; details=retained');
  if (context && phase.includes('pages')) {
    for (const actor of ['sales', 'manager', 'readonly', 'admin']) {
      try {
        const name = 'e4-failure-' + actor + '.png';
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
    assert.ok(context, 'Completed E4 context required');
    for (const flag of requiredEvidence) context.check('required_evidence_' + flag, context.evidence[flag] === true);
    for (let number = 1; number <= 14; number++) {
      const labels = context.acceptance[number];
      context.check('acceptance_' + number + '_bound_to_executed_checks', labels.length > 0 && labels.every(label => runtime.checks.includes(label)));
    }
    context.check('actual_browser_has_no_uncaught_errors', runtime.browserErrors.length === 0);
    context.check('all_eighteen_actual_page_images_recorded', context.fixture.images.length === 18 && new Set(context.fixture.images.map(value => value.name)).size === 18);
  } catch (error) { failure = await errorFact(error, 'coverage'); }
}
const acceptance = Object.fromEntries(Array.from({ length: 14 }, (_, index) => {
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
console.log('E4_PROFILE_RESULT: passed=' + passed + '; checks=' + result.checks.length + '; requests=' + result.requests.length + '; ui_requests=' + result.uiRequests.length + '; acceptance_executed=' + Object.values(acceptance).filter(value => value.executed).length + '; global_complete=false');
if (!passed) process.exitCode = 1;
