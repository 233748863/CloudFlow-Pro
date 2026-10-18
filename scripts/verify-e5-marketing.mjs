import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createE5MarketingRuntime } from './runtime-checks/e5-marketing-runtime.mjs';
import { prepareE5MarketingChecks } from './runtime-checks/e5-marketing-fixtures.mjs';
import { verifyE5Management, verifyE5Pages } from './runtime-checks/e5-marketing-management.mjs';
import { verifyE5MailFlow } from './runtime-checks/e5-marketing-delivery.mjs';
import { verifyE5SendingLimits } from './runtime-checks/e5-marketing-limits.mjs';
import { verifyE5Retention } from './runtime-checks/e5-marketing-retention.mjs';
import { verifyE5Revenue } from './runtime-checks/e5-marketing-revenue.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const [statePath, output, backend, frontend] = process.argv.slice(2);
assert.match(backend, /^r[1-9]\d*$/); assert.match(frontend, /^r[1-9]\d*$/);
let runtime, context, failure, privacy;
const phases = [];
const phase = async (name, work) => {
  console.log('E5_PHASE: ' + name + '; starting=true');
  const first = context.checks.length, started = Date.now();
  const value = await work();
  phases.push({ name, checks: context.checks.length - first, elapsedMs: Date.now() - started });
  console.log('E5_PHASE: ' + name + '; passed=true; checks=' + (context.checks.length - first));
  return value;
};
const safeError = error => {
  let message = String(error?.stack || error);
  for (const secret of runtime?.sensitive || []) message = message.replaceAll(secret, '[redacted]');
  return message.replace(/([?&]token=)[A-Za-z0-9_-]+/g, '$1[redacted]');
};
try {
  runtime = await createE5MarketingRuntime(root, statePath, output);
  context = prepareE5MarketingChecks(runtime);
  const management = await phase('campaigns_and_target_lists', () => verifyE5Management(context));
  const pageActors = new Map(Object.entries(runtime.sessions).map(([actor, session]) => [session.page, actor]));
  const usernames = { g_import_admin: 'admin', g_import_other: 'other', g_opportunity_sales: 'sales', g_opportunity_manager: 'manager',
    g_import_readonly: 'readonly', g_import_tenant: 'foreign', g_holiday_employee: 'reviewer', g_holiday_hr: 'finance' };
  const mail = await phase('smtp_tracking_and_scheduling', () => context.prove([3, 4, 5, 6, 9, 10, 11, 12, 13, 14, 20], () => verifyE5MailFlow({
    admin: runtime.sessions.admin.page,
    api: (page, requestPath, options) => { const actor = pageActors.get(page); assert.ok(actor); return runtime.api(actor, requestPath, options); },
    successful: runtime.success,
    session: async username => { assert.ok(usernames[username]); return runtime.sessions[usernames[username]].page; },
    database: runtime.database, check: runtime.check, directory: runtime.run, output, caseTag: context.marker, state: runtime.state,
    evidence: context.evidence, own: context.own, observeSecret: runtime.observeSecret, fixtureWrite: runtime.fixtureWrite,
    cleanups: context.cleanups, fixture: context.fixture,
  })));
  await phase('actual_cancellation_and_minute_quota', () => verifyE5SendingLimits(context, mail));
  await phase('expired_metadata_and_late_tracking', () => verifyE5Retention(context, mail));
  const revenue = await phase('actual_receipts_refunds_and_attribution', () => verifyE5Revenue(context, mail));
  await phase('desktop_and_mobile_reopen', () => verifyE5Pages(context, management, revenue));
  for (const [number, labels] of Object.entries(context.acceptance)) context.check('acceptance_' + number + '_has_executed_evidence', labels.length > 0);
  context.check('no_uncaught_browser_errors', runtime.browserErrors.length === 0);
} catch (error) {
  failure = safeError(error);
  fs.writeFileSync(path.join(output, 'failure.txt'), failure, { flag: 'wx' });
  if (error.e5RuntimeFacts && !context) context = { ...error.e5RuntimeFacts, fixture: {}, evidence: {}, acceptance: {}, cleanups: [] };
} finally {
  if (context) {
    for (const cleanup of [...context.cleanups].reverse()) {
      try { await cleanup(); } catch (error) { failure ||= safeError(error); }
    }
    if (runtime) {
      try { context.preserve(); privacy = await runtime.scan(); context.evidence.secrets = privacy.leaks === 0; }
      catch (error) { failure ||= safeError(error); }
    }
  }
  if (runtime) {
    try { await runtime.close(); } catch (error) { failure ||= safeError(error); }
  }
  const images = (context?.fixture?.images || []).map(value => ({ ...value, hash: createHash('sha256').update(fs.readFileSync(path.join(output, value.name))).digest('hex'), actuallyViewed: false, visualAccepted: false }));
  const required = ['campaigns', 'audiences', 'smtp', 'publicTracking', 'scheduling', 'cancellation', 'rateLimits', 'attribution', 'revenue', 'retention', 'reports', 'audits', 'permissions', 'desktop', 'mobile', 'preservation', 'secrets'];
  const passed = !failure && required.every(name => context?.evidence?.[name] === true);
  const result = { passed, backend, frontend, checks: context?.checks || [], requests: context?.requests || [], uiRequests: context?.uiRequests || [],
    browserErrors: context?.browserErrors || [], fixture: context?.fixture || {}, acceptance: context?.acceptance || {}, evidence: context?.evidence || {},
    fixtureChanges: runtime?.fixtureChanges || [], phases, privacy, images, failure, globalComplete: false, officialProviderContacted: false, priorRuntimeWritten: false };
  fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify(result, null, 2), { flag: 'wx' });
  console.log('E5_MARKETING_RESULT: passed=' + passed + '; checks=' + result.checks.length + '; requests=' + result.requests.length + '; pages=' + result.uiRequests.length + '; images=' + images.length);
  if (!passed) process.exitCode = 1;
}
