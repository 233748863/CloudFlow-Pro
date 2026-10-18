import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createH3CommissionRuntime } from './runtime-checks/h3-commission-runtime.mjs';
import { prepareH3CommissionChecks, prepareH3CommissionSources, prepareH3CommissionPayroll, verifyH3CommissionBoundaries,
  verifyH3CommissionConfirmation, verifyH3CommissionPosting, verifyH3CommissionFirstSalary, verifyH3CommissionLateRefund } from './runtime-checks/h3-commission-business.mjs';
import { confirmH3CommissionOnPage, postH3CommissionOnPage, verifyH3CommissionFinalPages } from './runtime-checks/h3-commission-ui.mjs';
import { verifyH3CommissionManagerScope, prepareH3CommissionInterruption, verifyH3CommissionLateMessages } from './runtime-checks/h3-commission-recovery.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const [statePath, output, backend, frontend] = process.argv.slice(2);
assert.match(backend, /^r[1-9]\d*$/); assert.match(frontend, /^r[1-9]\d*$/);
let runtime, context, failure, privacy;
const phases = [];
const phase = async (name, work) => {
  console.log('H3_COMMISSION_PHASE: ' + name + '; starting=true');
  const first = context.checks.length, started = Date.now();
  await work();
  phases.push({ name, checks: context.checks.length - first, elapsedMs: Date.now() - started });
  console.log('H3_COMMISSION_PHASE: ' + name + '; passed=true; checks=' + (context.checks.length - first));
};
const safeError = error => {
  let message = String(error?.stack || error);
  for (const secret of runtime?.sensitive || []) message = message.replaceAll(secret, '[redacted]');
  return message.replace(/([?&]token=)[A-Za-z0-9_-]+/g, '$1[redacted]');
};
try {
  runtime = await createH3CommissionRuntime(root, statePath, output);
  context = prepareH3CommissionChecks(runtime);
  await phase('actual_receipt_and_prior_partial_refund', () => prepareH3CommissionSources(context));
  await phase('real_payroll_configuration', () => prepareH3CommissionPayroll(context));
  await phase('tenant_roles_unconfirmed_and_invalid_sources', () => verifyH3CommissionBoundaries(context));
  await phase('authorized_management_still_obeys_department_scope', () => verifyH3CommissionManagerScope(context));
  await phase('actual_confirmation_page', () => confirmH3CommissionOnPage(context));
  await phase('frozen_confirmation_and_pending_recovery', () => verifyH3CommissionConfirmation(context));
  await phase('controlled_source_failure_before_actual_transmission', () => prepareH3CommissionInterruption(context));
  await phase('actual_posting_pages', () => postH3CommissionOnPage(context));
  await phase('unique_encrypted_payroll_sources', () => verifyH3CommissionPosting(context));
  await phase('actual_salary_payment_with_prior_refund', () => verifyH3CommissionFirstSalary(context));
  await phase('paid_original_later_refund_and_actual_recovery', () => verifyH3CommissionLateRefund(context));
  await phase('natural_retry_and_late_paid_source_replay', () => verifyH3CommissionLateMessages(context));
  await phase('actual_desktop_and_mobile_results', () => verifyH3CommissionFinalPages(context));
  context.check('no_uncaught_browser_errors', runtime.browserErrors.length === 0);
} catch (error) {
  failure = safeError(error);
  fs.writeFileSync(path.join(output, 'failure.txt'), failure, { flag: 'wx' });
  for (const actor of ['admin', 'manager']) {
    const page = runtime?.sessions?.[actor]?.page;
    if (!context || !page || new URL(page.url()).pathname !== '/crm/deal-allocations') continue;
    try {
      const name = 'failure-commission-' + actor + '.png';
      await page.screenshot({ path: path.join(output, name), fullPage: true });
      context.fixture.images.push({ name, label: '实际提成页面失败时状态', actor, width: page.viewportSize().width, actualPage: true, apiDoubles: false });
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
  const required = ['confirmation','refunds','payroll','idempotency','permissions','privacy','desktop','mobile','preservation','secrets',
    'managerScope','interruption','concurrentReplay','paymentRollback','lateMessages'];
  const passed = !failure && required.every(name => context?.evidence?.[name] === true);
  const result = { passed, backend, frontend, checks: context?.checks || [], requests: context?.requests || [], uiRequests: context?.uiRequests || [],
    browserErrors: context?.browserErrors || [], fixture: context?.fixture || {}, evidence: context?.evidence || {},
    fixtureChanges: runtime?.fixtureChanges || [], phases, privacy, images, failure, globalComplete: false,
    priorRuntimeWritten: false, systemClockChanged: false, apiDoubles: false, backendHttp: Boolean(runtime), allCommissionAcceptanceComplete: false };
  fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify(result, null, 2), { flag: 'wx' });
  console.log('H3_COMMISSION_RESULT: passed=' + passed + '; checks=' + result.checks.length + '; requests=' + result.requests.length + '; pages=' + result.uiRequests.length + '; images=' + images.length);
  if (!passed) process.exitCode = 1;
}
