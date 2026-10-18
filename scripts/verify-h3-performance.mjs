import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createH3PerformanceRuntime } from './runtime-checks/h3-performance-runtime.mjs';
import { prepareH3PerformanceChecks } from './runtime-checks/h3-performance-fixtures.mjs';
import { verifyH3CrossMonth, verifyH3FinancialSources } from './runtime-checks/h3-performance-business.mjs';
import { verifyH3PerformancePages } from './runtime-checks/h3-performance-ui.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const [statePath, output, backend, frontend] = process.argv.slice(2);
assert.match(backend, /^r[1-9]\d*$/); assert.match(frontend, /^r[1-9]\d*$/);
let runtime, context, failure, privacy;
const phases = [];
const phase = async (name, work) => {
  console.log('H3_PERFORMANCE_PHASE: ' + name + '; starting=true');
  const first = context.checks.length, started = Date.now();
  await work();
  phases.push({ name, checks: context.checks.length - first, elapsedMs: Date.now() - started });
  console.log('H3_PERFORMANCE_PHASE: ' + name + '; passed=true; checks=' + (context.checks.length - first));
};
const safeError = error => {
  let message = String(error?.stack || error);
  for (const secret of runtime?.sensitive || []) message = message.replaceAll(secret, '[redacted]');
  return message.replace(/([?&]token=)[A-Za-z0-9_-]+/g, '$1[redacted]');
};
try {
  runtime = await createH3PerformanceRuntime(root, statePath, output);
  context = prepareH3PerformanceChecks(runtime);
  await phase('cross_month_and_original_allocation_permissions', () => verifyH3CrossMonth(context));
  await phase('actual_contract_receipts_refunds_and_currencies', () => verifyH3FinancialSources(context));
  await phase('actual_hr_desktop_and_mobile_pages', () => verifyH3PerformancePages(context));
  context.check('no_uncaught_browser_errors', runtime.browserErrors.length === 0);
} catch (error) {
  failure = safeError(error);
  fs.writeFileSync(path.join(output, 'failure.txt'), failure, { flag: 'wx' });
  for (const actor of ['admin', 'foreign']) {
    const page = runtime?.sessions?.[actor]?.page;
    if (!context || !page || new URL(page.url()).pathname !== '/hr/performance') continue;
    try {
      const name = 'failure-performance-' + actor + '.png';
      await page.screenshot({ path: path.join(output, name), fullPage: true });
      context.fixture.images.push({ name, label: '实际绩效页面失败时状态', actor, width: page.viewportSize().width, actualPage: true, apiDoubles: false });
    } catch {}
  }
  if (error.h3RuntimeFacts && !context) context = { ...error.h3RuntimeFacts, fixture: {}, evidence: {}, cleanups: [] };
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
  if (runtime) { try { await runtime.close(); } catch (error) { failure ||= safeError(error); } }
  const images = (context?.fixture?.images || []).map(value => ({ ...value,
    hash: createHash('sha256').update(fs.readFileSync(path.join(output, value.name))).digest('hex'), actuallyViewed: false, visualAccepted: false }));
  const required = ['queries', 'crossMonth', 'originalAllocations', 'currencies', 'permissions', 'actualReceipts', 'desktop', 'mobile', 'preservation', 'secrets'];
  const passed = !failure && required.every(name => context?.evidence?.[name] === true);
  const result = { passed, backend, frontend, checks: context?.checks || [], requests: context?.requests || [], uiRequests: context?.uiRequests || [],
    browserErrors: context?.browserErrors || [], fixture: context?.fixture || {}, evidence: context?.evidence || {},
    fixtureChanges: runtime?.fixtureChanges || [], phases, privacy, images, failure, globalComplete: false,
    priorRuntimeWritten: false, systemClockChanged: false, apiDoubles: false, backendHttp: Boolean(runtime) };
  fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify(result, null, 2), { flag: 'wx' });
  console.log('H3_PERFORMANCE_RESULT: passed=' + passed + '; checks=' + result.checks.length + '; requests=' + result.requests.length + '; pages=' + result.uiRequests.length + '; images=' + images.length);
  if (!passed) process.exitCode = 1;
}
