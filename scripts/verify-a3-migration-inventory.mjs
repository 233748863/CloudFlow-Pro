import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Decimal, parseInsert, scanSql, statements } from './check-batch-h-contracts-sql.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const [round] = process.argv.slice(2);
assert.match(round || '', /^r[1-9][0-9]*$/);
const output = path.join(root, `.cloudflow-runtime/full-prd-20260915/approved-runtime/a3-migration-inventory-20261002-${round}.json`);
await assert.rejects(fs.access(output), { code: 'ENOENT' });
const inputs = [];
const read = async filename => {
  const bytes = await fs.readFile(path.join(root, filename));
  inputs.push({ path: filename.replaceAll('\\', '/'), sha256: createHash('sha256').update(bytes).digest('hex') });
  return bytes.toString('utf8').replace(/^\uFEFF/, '');
};
const expected = [
  ['auth', 'auditLogArchive', 'CRON', '0 0 3 1 * ?'],
  ['auth', 'dictOrphanScan', 'CRON', '0 0 2 * * ?'],
  ['crm', 'customerPoolRelease', 'CRON', '0 0 2 * * ?'],
  ['crm', 'quoteExpire', 'CRON', '0 0 3 * * ?'],
  ['crm', 'crmDailyDispatch', 'CRON', '0 0 9 * * ?'],
  ['crm', 'ticketSlaDispatch', 'CRON', '0 0 * * * ?'],
  ['hr', 'employeeContractExpire', 'CRON', '0 0 4 * * ?'],
  ['hr', 'trainingArchiveRebuild', 'CRON', '0 30 2 * * ?'],
  ['oa', 'borrowOverdueScan', 'CRON', '0 0 9 * * ?'],
  ['oa', 'licenseExpiryScan', 'CRON', '0 30 9 * * ?'],
  ['oa', 'contractRiskScan', 'CRON', '0 0 9 * * ?'],
  ['workflow', 'processBusinessReconcile', 'CRON', '0 */30 * * * ?'],
  ['workflow', 'taskReminder', 'FIXED_RATE', 300000],
  ['workflow', 'taskTimeout', 'FIXED_RATE', 300000],
  ['workflow', 'timerScan', 'FIXED_RATE', 180000],
  ['workflow', 'deadlockDetection', 'FIXED_DELAY', 600000],
  ['workflow', 'taskTimeoutCleanup', 'CRON', '0 0 2 * * ?'],
  ['workflow', 'timerScanCleanup', 'CRON', '0 0 3 * * ?'],
  ['workflow', 'anomalyDetect', 'CRON', '0 */10 * * * ?'],
  ['workflow', 'anomalyDetectDaily', 'CRON', '0 0 */6 * * ?'],
  ['workflow', 'timeoutDetect', 'CRON', '0 */5 * * * ?'],
  ['workflow', 'timeoutDetectSecondary', 'CRON', '0 */5 * * * ?'],
  ['workflow', 'txnConsistencyScan', 'FIXED_DELAY', 60000],
  ['workflow', 'txnConsistencyDaily', 'CRON', '0 0 2 * * ?'],
  ['auth', 'jobLogClean', 'CRON', '0 0 4 * * ?'],
  ['auth', 'jobTimeoutInspect', 'FIXED_RATE', 300000],
  ['auth', 'messageRecordArchive', 'CRON', '0 30 3 * * ?'],
  ['auth', 'holidayYearlyRemind', 'CRON', '0 0 10 1 11 ?'],
];
await read('docs/design/A-批次A技术设计-04-种子数据与模板.md');
await read('scripts/verify-a3-migration-inventory.mjs');
await read('scripts/check-batch-h-contracts-sql.mjs');
const seedFile = 'cloudflow-backend/DB/06.cloudflow-business-seed.sql';
const inserts = statements(scanSql(await read(seedFile), seedFile)).filter(tokens => {
  if (tokens[0]?.value.toUpperCase() !== 'INSERT') return false;
  const target = tokens.findIndex(token => token.value.toUpperCase() === 'INTO');
  return tokens.slice(target + 1, target + 4).some(token => token.value.toLowerCase() === 'sys_job');
}).map(tokens => parseInsert(tokens));
const seedJobs = inserts.flatMap(insert => (insert.rows || []).map(entries => Object.fromEntries(insert.columns.map((column, index) => {
  const entry = entries[index];
  return [column, entry.type === 'literal' ? entry.value instanceof Decimal ? Number(entry.value.toString()) : entry.value : null];
}))));
const handlers = []; const localSchedules = [];
const walk = async directory => {
  for (const entry of await fs.readdir(path.join(root, directory), { withFileTypes: true })) {
    if (['target', 'node_modules', '.git'].includes(entry.name)) continue;
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) await walk(filename);
    else if (entry.name.endsWith('.java') && filename.replaceAll('\\', '/').includes('/src/main/java/')) {
      const source = await read(filename);
      for (const match of source.matchAll(/^\s*@(JobHandler|Scheduled)\s*\(([^)]*)\)/gm)) {
        const record = { path: filename.replaceAll('\\', '/'), line: source.slice(0, match.index).split('\n').length,
          annotation: match[2].trim() };
        if (match[1] === 'JobHandler') {
          const name = /(?:value\s*=\s*)?"([^"]+)"/.exec(match[2])?.[1];
          assert.ok(name, 'Named registered handler required'); handlers.push({ ...record, name });
        } else localSchedules.push(record);
      }
    }
  }
};
await walk('cloudflow-backend');
const migration = expected.map(([service, handler, trigger, schedule], index) => {
  const matches = seedJobs.filter(job => job.handler_name === handler && job.tenant_id === 100000);
  assert.equal(matches.length, 1, `${handler}: exactly one seed task`);
  const seed = matches[0];
  assert.equal(seed.service_name, service, `${handler}: service`);
  assert.equal(seed.trigger_type, trigger, `${handler}: trigger type`);
  assert.equal(trigger === 'CRON' ? seed.cron_expression : seed.interval_ms, schedule, `${handler}: approved schedule`);
  const declarations = handlers.filter(item => item.name === handler);
  assert.equal(declarations.length, 1, `${handler}: unique source handler`);
  return { handler, service, trigger, schedule, jobId: seed.job_id, existingMigration: index < 24, declaration: declarations[0] };
});
const highFrequency = migration.filter(item => ['taskReminder', 'taskTimeout', 'timerScan', 'deadlockDetection'].includes(item.handler));
const nominalDaily = highFrequency.reduce((total, item) => total + 86400000 / item.schedule, 0);
assert.equal(nominalDaily, 1200);
const designer = await read('cloudflow-frontend/src/components/workflow-builder/TimerPropertyFields.tsx');
assert.ok(designer.includes('正常扫描间隔为 3 分钟，到期触发误差不超过 3 分钟'));
for (const input of inputs) {
  const bytes = await fs.readFile(path.join(root, input.path));
  assert.equal(createHash('sha256').update(bytes).digest('hex'), input.sha256, 'Inventory inputs changed');
}
await fs.writeFile(output, JSON.stringify({ createdAt: new Date().toISOString(), migration, highFrequency, nominalDaily,
  localSchedules, registeredHandlerCount: handlers.length, inputs, originalMigrated: 24, builtInAdded: 4,
  designerPrecisionHint: true, sourceAndSeedOnly: true, runtimeIntervalsVerified: false,
  fullDayInvocationStatisticsVerified: false, allBusinessBehaviorVerified: false,
  notes: ['Later HR referral local scheduler requires follow-up against the approved centralized scheduling scope.',
    'TimerSchedulerService has evolved in later workflow work; source presence does not prove the original unchanged-behavior acceptance.'] }, null, 2) + '\n', { flag: 'wx' });
console.log(`A3_MIGRATION_INVENTORY: migrated=24; built_in_added=4; source_and_seed_matches=28; high_frequency_jobs=4; nominal_daily_calls=${nominalDaily}; actual_full_day_statistics=false; local_schedules=${localSchedules.length}; registered_handlers=${handlers.length}; inputs=${inputs.length}; changed=0; product_modified=false`);
