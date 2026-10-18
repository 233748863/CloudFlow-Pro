import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ownedGatewayRedis } from './owned-gateway-redis.mjs';

// A bounded configuration override for this owned fixture only. Counters are never changed.
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const launchArguments = process.argv.slice(2);
const takeOption = (name, pattern) => {
  const matches = launchArguments.flatMap((value, index) => value === name ? [index] : []);
  assert.ok(matches.length <= 1, `Duplicate ${name}`);
  if (!matches.length) return undefined;
  const index = matches[0], value = launchArguments[index + 1];
  assert.ok(index >= 3, `Place ${name} after the mode and build arguments`);
  assert.match(value || '', pattern, `Invalid ${name}`);
  launchArguments.splice(index, 2);
  return value;
};
const settlementFrontendRound = takeOption('--frontend-round', /^r[1-9][0-9]*$/);
const settlementPayrollPeriod = takeOption('--payroll-period', /^[1-9][0-9]*$/);
const [requestedMode, round, backendRound = 'r6', recoveryMarker] = launchArguments;
const referralRepayment = requestedMode === 'hr-settlement-referral-repay';
const referralSettlement = referralRepayment || requestedMode === 'hr-settlement-referral';
const allSettlementSources = referralSettlement || requestedMode === 'hr-settlement-all-sources';
const payrollSettlement = allSettlementSources || requestedMode === 'hr-advance-settlement-payroll';
const mode = ['d1-policy', 'd1-leave', 'd1-cycle', 'd1-pages', 'd1-chain', 'd1-ledger-rules', 'd1-payroll-effects'].includes(requestedMode) ? 'c1-form-live' : payrollSettlement ? 'hr-advance-settlement' : requestedMode;
assert.ok(!settlementFrontendRound || ['hr-advance-settlement', 'hr-skills', 'hr-appraisals', 'hr-overtime'].includes(mode), 'Named frontend version belongs to settlement, skill or appraisal verification');
assert.ok(!settlementPayrollPeriod || payrollSettlement && !referralRepayment, 'An explicit payroll period belongs to the initial payroll settlement combination');
const triggerOnly = process.argv.includes('--trigger-only');
const transactionOnly = process.argv.includes('--transaction-only');
const offboardOnly = process.argv.includes('--offboard-only');
assert.ok(!offboardOnly || (mode === 'a3-anomaly-scan' && !triggerOnly && !transactionOnly), 'Offboard focus belongs to anomaly verification');
assert.ok(!transactionOnly || (mode === 'a3-anomaly-scan' && !triggerOnly), 'Choose one anomaly verification focus');
assert.ok(!triggerOnly || mode === 'a3-anomaly-scan', 'Trigger focus belongs to anomaly verification');
assert.ok(['c1-form-live', 'hr-advance-settlement', 'hr-skills', 'hr-appraisals', 'hr-overtime', 'a3-anomaly-scan', 'a3-deadlock-scan', 'a3-timer-scan', 'a3-natural-cadence', 'a3-audit-archive', 'a3-task-timeout', 'a3-process-reconcile', 'a3-task-reminder', 'a3-dict-scan', 'a3-crm-notifications', 'a3-oa-scans', 'a3-quote-expire', 'a3-training-archive', 'a3-business-exit', 'a4-yearly-reminder', 'employee-certificate', 'oa-sign-methods', 'oa-contract-terms', 'oa-contract-reminders', 'oa-contract-review', 'oa-contract-access', 'a3-job-management', 'a3-job-business', 'a3-job-long', 'a3-job-failure', 'a3-job-tenant-failure', 'a3-job-crm-failure', 'a3-job-outage', 'a3-job-peer', 'a3-job-failover', 'a3-job-primary-fault', 'a3-job-cluster', 'a3-primary-recovery', 'a3-job-schedulers', 'a3-job-report-fault', 'portal-finance', 'portal-finance-http', 'portal-contract-http', 'finance-receivable-http'].includes(mode));
assert.match(round || '', /^r[1-9][0-9]*$/);
assert.match(backendRound, /^r[1-9][0-9]*$/);
const run = path.join(root, '.cloudflow-runtime/batch-g-integration/9799534e1a3a47b5958330f14ae16dc7');
const state = JSON.parse((await fs.readFile(path.join(run, 'state.json'), 'utf8')).replace(/^\uFEFF/, ''));
assert.equal(state.status, 'RUNNING');
assert.equal(await fs.realpath(state.run), await fs.realpath(run));
const env = { ...process.env }; delete env.MYSQL_PWD;
const database = statement => {
  const result = spawnSync('mysql.exe', ['--no-defaults', '--protocol=TCP', '--host=127.0.0.1', `--port=${state.mysqlPort}`,
    '--user=root', '--batch', '--raw', '--skip-column-names', '--default-character-set=utf8mb4', 'cloud_flow_db'],
  { input: statement, encoding: 'utf8', windowsHide: true, env, timeout: 30000 });
  assert.equal(result.status, 0, 'Owned captcha fixture query failed');
  return result.stdout.trim();
};
assert.equal(await fs.realpath(database('SELECT @@datadir;')), await fs.realpath(path.join(run, 'mysql-data')));
const databaseValue = () => database("SELECT config_value FROM sys_config WHERE config_key='sys.captcha.dailyLimit' AND config_scope='0';");
const originalDatabase = databaseValue();
assert.equal(originalDatabase, '100');
// Auth startup reloads the persistent captcha configuration; load the verified audit build before the bounded allowance.
if (mode === 'a3-audit-archive') {
  const prefix = path.join(root, '.cloudflow-runtime/full-prd-20260915/approved-runtime', `a3-audit-archive-20261003-initial-restart-${round}`);
  const output = await fs.open(prefix + '.log', 'wx'), errors = await fs.open(prefix + '.err.log', 'wx');
  try {
    const code = await new Promise((resolve, reject) => {
      const child = spawn('C:/Program Files/PowerShell/7/pwsh.exe', ['-NoLogo', '-NoProfile', '-File', 'scripts/restart-isolated-integration-service.ps1',
        '-StatePath', path.join(run, 'state.json'), '-ServiceName', 'auth'], { cwd: root, windowsHide: true, stdio: ['ignore', output.fd, errors.fd] });
      child.once('error', reject); child.once('exit', resolve);
    });
    assert.equal(code, 0, 'Owned audit auth restart failed before captcha override');
  } finally { await output.close(); await errors.close(); }
  Object.assign(state, JSON.parse((await fs.readFile(path.join(run, 'state.json'), 'utf8')).replace(/^\uFEFF/, '')));
}
const redis = await ownedGatewayRedis(state);
const key = 'sys:config:global:sys.captcha.dailyLimit';
const counterKey = 'CAPTCHA:LIMIT:127.0.0.1';
const original = redis('GET', key);
assert.equal(original, JSON.stringify(originalDatabase));
assert.equal(redis('PTTL', key), '-1', 'Expected persistent configuration cache');
const before = Number(redis('GET', counterKey) || '0');
assert.ok(Number.isSafeInteger(before) && before >= 0);
const allowance = Math.max(100, before) + 50;
const temporary = JSON.stringify(String(allowance));
const evidence = path.join(root, '.cloudflow-runtime/full-prd-20260915/approved-runtime');
const snapshot = path.join(evidence, `owned-captcha-${requestedMode}-20261002-${round}.json`);
await fs.writeFile(snapshot, JSON.stringify({ key, original, originalTtl: -1, temporary, counterBefore: before,
  counterTtlBefore: Number(redis('PTTL', counterKey)), databaseValue: originalDatabase, expiresInSeconds: 1800 }, null, 2), { flag: 'wx' });
assert.equal(redis('EVAL', "if redis.call('GET',KEYS[1])~=ARGV[1] then return 0 end redis.call('SET',KEYS[1],ARGV[2],'EX',1800) return 1", 1, key, original, temporary), '1');
console.log(`OWNED_CAPTCHA_ALLOWANCE: before=${before}; original_limit=100; temporary_limit=${allowance}; expiry_seconds=1800; counter_writes=0; database_writes=0`);
let status;
try {
  const script = mode === 'hr-overtime' ? 'scripts/run-h2-overtime-current.ps1' : mode === 'hr-appraisals' ? 'scripts/run-h2-appraisals-current.ps1' : mode === 'hr-skills' ? 'scripts/run-h2-skills-current.ps1' : requestedMode === 'd1-payroll-effects' ? 'scripts/run-d1-payroll-effects-live.ps1' : requestedMode === 'd1-ledger-rules' ? 'scripts/run-d1-ledger-rules-live.ps1' : requestedMode === 'd1-chain' ? 'scripts/run-d1-chain-live.ps1' : requestedMode === 'd1-pages' ? 'scripts/run-d1-pages-live.ps1' : requestedMode === 'd1-cycle' ? 'scripts/run-d1-cycle-live.ps1' : requestedMode === 'd1-leave' ? 'scripts/run-d1-leave-live.ps1' : requestedMode === 'd1-policy' ? 'scripts/run-d1-policy-live.ps1' : mode === 'c1-form-live' ? 'scripts/run-c1-form-live.ps1' : mode === 'hr-advance-settlement' ? 'scripts/run-hr-advance-settlement.ps1' : mode === 'a3-anomaly-scan' ? 'scripts/run-a3-anomaly-scan.ps1' : mode === 'a3-deadlock-scan' ? 'scripts/run-a3-deadlock-scan.ps1' : mode === 'a3-natural-cadence' ? 'scripts/run-a3-natural-cadence.ps1' : mode === 'a3-timer-scan' ? 'scripts/run-a3-timer-scan.ps1' : mode === 'a3-audit-archive' ? 'scripts/run-a3-audit-archive.ps1' : mode === 'a3-task-timeout' ? 'scripts/run-a3-task-timeout.ps1' : mode === 'a3-process-reconcile' ? 'scripts/run-a3-process-reconcile.ps1' : mode === 'a3-task-reminder' ? 'scripts/run-a3-task-reminder.ps1' : mode === 'a3-dict-scan' ? 'scripts/run-a3-dict-scan.ps1' : mode === 'a3-crm-notifications' ? 'scripts/run-a3-crm-notifications.ps1' : mode === 'a3-oa-scans' ? 'scripts/run-a3-oa-scans.ps1' : mode === 'a3-quote-expire' ? 'scripts/run-a3-quote-expire.ps1' : mode === 'a3-training-archive' ? 'scripts/run-a3-training-archive.ps1' : mode === 'a3-business-exit' ? 'scripts/run-a3-business-exit.ps1' : mode === 'a4-yearly-reminder' ? 'scripts/run-holiday-yearly-reminder.ps1' : mode === 'portal-finance' ? 'scripts/run-portal-finance-http.ps1' : mode === 'employee-certificate' ? 'scripts/run-hr-employee-certificate-capacity.ps1'
    : mode === 'oa-contract-terms' ? 'scripts/run-oa-contract-terms.ps1'
      : mode === 'oa-contract-reminders' ? 'scripts/run-oa-contract-reminders.ps1'
        : mode === 'oa-contract-review' ? 'scripts/run-oa-contract-review.ps1'
          : mode === 'oa-contract-access' ? 'scripts/run-oa-contract-access.ps1'
            : mode === 'a3-job-cluster' ? 'scripts/run-a3-job-cluster.ps1' : mode === 'a3-primary-recovery' ? 'scripts/run-a3-primary-recovery.ps1' : mode === 'a3-job-primary-fault' ? 'scripts/run-a3-job-primary-fault.ps1' : mode === 'a3-job-failover' ? 'scripts/run-a3-job-failover.ps1' : mode === 'a3-job-report-fault' ? 'scripts/run-a3-job-report-fault.ps1' : mode === 'a3-job-schedulers' ? 'scripts/run-a3-job-schedulers.ps1' : mode === 'a3-job-peer' ? 'scripts/run-a3-job-peer.ps1' : mode === 'a3-job-outage' ? 'scripts/run-a3-job-outage.ps1' : mode === 'a3-job-crm-failure' ? 'scripts/run-a3-job-crm-failure.ps1' : mode === 'a3-job-tenant-failure' ? 'scripts/run-a3-job-tenant-failure.ps1' : mode === 'a3-job-failure' ? 'scripts/run-a3-job-failure.ps1' : mode === 'a3-job-long' ? 'scripts/run-a3-job-long.ps1' : mode === 'a3-job-business' ? 'scripts/run-a3-job-business.ps1'
              : mode === 'a3-job-management' ? 'scripts/run-a3-job-management.ps1' : 'scripts/run-oa-sign-methods.ps1';
  const args = ['-NoLogo', '-NoProfile', '-File', script, '-Round', round];
  if (requestedMode === 'd1-chain' && process.argv.includes('--resume-source')) {
    const sourceRound = process.argv[process.argv.indexOf('--resume-source') + 1];
    assert.match(sourceRound || '', /^r[1-9][0-9]*$/); args.push('-ResumeSource', sourceRound);
  }
  if (mode === 'c1-form-live') {
    assert.match(recoveryMarker || '', /^r[1-9][0-9]*$/);
    args.push('-BackendRound', backendRound, '-FrontendRound', recoveryMarker);
    if (process.argv.includes('--error-pages')) args.push('-ErrorPages');
    if (process.argv.includes('--value-boundaries')) args.push('-ValueBoundaries');
    if (process.argv.includes('--value-pages')) args.push('-ValuePages');
    if (process.argv.includes('--dictionary-pages')) args.push('-DictionaryPages');
    if (process.argv.includes('--layout-pages')) args.push('-LayoutPages');
    if (process.argv.includes('--original-pages')) args.push('-OriginalPages');
    if (process.argv.includes('--historical-references')) args.push('-HistoricalReferences');
    if (process.argv.includes('--designer-operations')) args.push('-DesignerOperations');
    if (process.argv.includes('--subtable-mobile')) args.push('-SubtableMobile');
    if (process.argv.includes('--subtable-native')) args.push('-SubtableNative');
    if (process.argv.includes('--subtable-types')) args.push('-SubtableTypes');
    if (process.argv.includes('--subtable-designer')) args.push('-SubtableDesigner');
    if (process.argv.includes('--subtable-precision')) args.push('-SubtablePrecision');
    if (process.argv.includes('--permission-pages')) args.push('-PermissionPages');
    if (process.argv.includes('--expression-pages')) args.push('-ExpressionPages');
    if (process.argv.includes('--permission-cache')) args.push('-PermissionCache');
    if (process.argv.includes('--matrix-templates')) args.push('-MatrixTemplates');
    if (process.argv.includes('--read-entries')) args.push('-ReadEntries');
    if (process.argv.includes('--permission-races')) args.push('-PermissionRaces');
    if (process.argv.includes('--oauth-resources')) args.push('-OauthResources');
    if (process.argv.includes('--linked-reads')) args.push('-LinkedReads');
    if (process.argv.includes('--action-returns')) args.push('-ActionReturns');
    if (process.argv.includes('--version-records')) args.push('-VersionRecords');
  }
  if (payrollSettlement) args.push('-PayrollDeduction');
  if (settlementFrontendRound) args.push('-FrontendRound', settlementFrontendRound);
  if (settlementPayrollPeriod) args.push('-PayrollPeriodId', settlementPayrollPeriod);
  if (mode === 'a3-anomaly-scan' && recoveryMarker) {
    assert.match(recoveryMarker, /^r[1-9][0-9]*$/);
    args.push('-FrontendRound', recoveryMarker);
  }
  if (allSettlementSources) args.push('-AllSources');
  if (referralSettlement) args.push('-Referral');
  if (referralRepayment) { assert.match(recoveryMarker || '', /^[a-f0-9]{12}$/); args.push('-ReferralRepaymentMarker', recoveryMarker); }
  else if (referralSettlement && recoveryMarker) { assert.match(recoveryMarker, /^[a-f0-9]{12}$/); args.push('-ReferralRecoveryMarker', recoveryMarker); }
  if (triggerOnly) args.push('-TriggerOnly');
  if (transactionOnly) args.push('-TransactionOnly');
  if (offboardOnly) args.push('-OffboardOnly');
  if (mode === 'a3-primary-recovery') { assert.match(recoveryMarker || '', /^[a-f0-9]{12}$/); args.push('-Marker', recoveryMarker); }
  if (['hr-advance-settlement', 'hr-skills', 'hr-appraisals', 'hr-overtime', 'a3-anomaly-scan', 'a3-deadlock-scan', 'a3-timer-scan', 'a3-natural-cadence', 'a3-audit-archive', 'a3-task-timeout', 'a3-process-reconcile', 'a3-task-reminder', 'a3-dict-scan', 'a3-crm-notifications', 'a3-oa-scans', 'a3-quote-expire', 'a3-training-archive', 'a3-business-exit', 'a4-yearly-reminder', 'a3-job-business', 'a3-job-long', 'a3-job-failure', 'a3-job-tenant-failure', 'a3-job-crm-failure', 'a3-job-outage', 'a3-job-peer', 'a3-job-failover', 'a3-job-primary-fault', 'a3-job-cluster', 'a3-primary-recovery', 'a3-job-schedulers', 'a3-job-report-fault'].includes(mode)) args.push('-BackendRound', backendRound);
  if (mode === 'employee-certificate') args.push('-BackendInputs', 'h5-employee-certificate-20261002-backend-inputs-r3.json');
  status = await new Promise((resolve, reject) => {
    const directMode = { 'portal-finance-http': '--portal-finance-only', 'portal-contract-http': '--portal-contract-only', 'finance-receivable-http': '--receivable-protection-only' }[mode];
    const child = directMode
      ? spawn(process.execPath, ['scripts/verify-batch-g-integration.mjs', path.join(run, 'state.json'), '--settlement-schema', directMode], { cwd: root, env: process.env, windowsHide: true, stdio: 'inherit' })
      : spawn('C:/Program Files/PowerShell/7/pwsh.exe', args, { cwd: root, env: process.env, windowsHide: true, stdio: 'inherit' });
    child.once('error', reject); child.once('exit', code => resolve(code));
  });
} finally {
  // Refuse to replace another writer's configuration. Expiry safely falls back to the product default.
  assert.equal(redis('EVAL', "local v=redis.call('GET',KEYS[1]); if v and v~=ARGV[1] and v~=ARGV[2] then return 0 end redis.call('SET',KEYS[1],ARGV[2]) return 1", 1, key, temporary, original), '1');
  assert.equal(redis('GET', key), original); assert.equal(redis('PTTL', key), '-1');
  assert.equal(databaseValue(), originalDatabase);
  const after = Number(redis('GET', counterKey) || '0');
  assert.ok(Number.isSafeInteger(after) && after >= before && after <= allowance);
  console.log(`OWNED_CAPTCHA_RESTORED: original_limit=100; original_ttl=-1; counter_before=${before}; counter_after=${after}; counter_writes=0; database_unchanged=true; production_modified=false`);
}
assert.equal(status, 0, 'Verification failed; captcha configuration restored');
