import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createD1LeaveRuntime } from './runtime-checks/d1-leave-runtime.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
assert.ok(process.argv.includes('--d1-cycle') && process.argv.includes('--d1-leave'));
const output = fs.realpathSync(process.argv[process.argv.indexOf('--output') + 1]);
assert.match(path.basename(output), /^d1-cycle-live-20261005-r[1-9][0-9]*$/);
assert.ok(!fs.existsSync(path.join(output, 'result.json')));
const runtime = await createD1LeaveRuntime(root, output);
const { database, rows, api, ok, check, checks, requests, browserErrors, sensitive } = runtime;
const marker = 'D1C-' + randomUUID().replaceAll('-', '').slice(0, 12);
const fixture = { marker, employees: [], types: {}, executions: [] };
const evidence = { periods: false, accrual: false, carry: false, expiry: false, ledger: false, permissions: false, preservation: false, secrets: false };
const save = () => fs.writeFileSync(path.join(output, 'fixture.json'), JSON.stringify(fixture, null, 2));
const hash = value => createHash('sha256').update(value).digest('hex');
const id = value => { const result = String(value); assert.match(result, /^[1-9]\d*$/); return result; };
const sql = value => `CONVERT(X'${Buffer.from(String(value)).toString('hex')}' USING utf8mb4)`;
const base = '/hr/attendance/leave', jobs = '/auth/system/job';
const cents = value => { const scaled = Number(value) * 100; assert.ok(Math.abs(scaled - Math.round(scaled)) < 0.000001); return Math.round(scaled); };
const specs = [
  { name: 'monthly', grant: 10, frequency: 'MONTHLY', rounding: 'NONE', earned: true, carry: true,
    schedule: [['2010-04-01',83],['2010-05-01',84],['2010-06-01',83],['2010-07-01',83],['2010-08-01',84],['2010-09-01',83],['2010-10-01',83],['2010-11-01',84],['2010-12-01',83],['2011-01-01',83],['2011-02-01',84],['2011-03-01',83]] },
  { name: 'half', grant: 5, frequency: 'MONTHLY', rounding: 'HALF_DAY', earned: true, carry: true,
    schedule: ['2010-04-01','2010-05-01','2010-06-01','2010-07-01','2010-08-01','2010-10-01','2010-11-01','2010-12-01','2011-01-01','2011-02-01'].map(date => [date,50]) },
  { name: 'full', grant: 5, frequency: 'MONTHLY', rounding: 'FULL_DAY', earned: true, carry: true,
    schedule: ['2010-04-01','2010-06-01','2010-08-01','2010-11-01','2011-01-01'].map(date => [date,100]) },
  { name: 'quarterly', grant: 10, frequency: 'QUARTERLY', rounding: 'NONE', earned: true, carry: true,
    schedule: ['2010-04-01','2010-07-01','2010-10-01','2011-01-01'].map(date => [date,250]) },
  { name: 'halfYearly', grant: 10, frequency: 'HALF_YEARLY', rounding: 'NONE', earned: true, carry: true,
    schedule: [['2010-04-01',500],['2010-10-01',500]] },
  { name: 'yearly', grant: 10, frequency: 'YEARLY', rounding: 'NONE', earned: true, carry: true, schedule: [['2010-04-01',1000]] },
  { name: 'noCarry', grant: 4, frequency: 'MONTHLY', rounding: 'NONE', earned: false, carry: false, schedule: [] },
];
let failure, originalLedgerHash, originalLedgerCursor, originalJobsHash;
const allLedger = cursor => rows(`SELECT JSON_OBJECT('id',CAST(ledger_id AS CHAR),'tenant',CAST(tenant_id AS CHAR),'employee',CAST(employee_id AS CHAR),'type',CAST(leave_type_id AS CHAR),'period',CAST(leave_period_id AS CHAR),'kind',transaction_type,'source',source_biz_type,'sourceId',source_biz_id,'days',leave_days,'from',from_date,'to',to_date,'remark',remark,'reversal',CAST(reversal_of_id AS CHAR),'created',create_time) FROM hr_leave_ledger WHERE ledger_id<=${id(cursor)} ORDER BY ledger_id`);
const originalJobs = () => database("SELECT tenant_id,job_id,job_name,handler_name,COALESCE(handler_param,''),status,trigger_type,COALESCE(cron_expression,''),COALESCE(interval_ms,0),deleted FROM sys_job ORDER BY tenant_id,job_id");
const ownedLedger = (employeeId, typeId, periodId) => rows(`SELECT JSON_OBJECT('id',CAST(ledger_id AS CHAR),'kind',transaction_type,'days',leave_days,'source',source_biz_type,'sourceId',source_biz_id,'from',from_date,'to',to_date,'period',CAST(leave_period_id AS CHAR)) FROM hr_leave_ledger WHERE tenant_id=100000 AND employee_id=${id(employeeId)} AND leave_type_id=${id(typeId)}${periodId ? ` AND leave_period_id=${id(periodId)}` : ''} ORDER BY ledger_id`);
const schedule = (employeeId, typeId) => rows(`SELECT JSON_OBJECT('id',CAST(schedule_id AS CHAR),'date',schedule_date,'days',earned_days,'executed',executed_flag,'ledgerId',CAST(ledger_id AS CHAR)) FROM hr_earned_leave_schedule WHERE tenant_id=100000 AND employee_id=${id(employeeId)} AND leave_type_id=${id(typeId)} AND leave_period_id=${id(fixture.firstPeriod)} ORDER BY schedule_date`);
const quota = (employeeId, typeId, periodId) => rows(`SELECT JSON_OBJECT('total',total_quota,'used',used_quota,'frozen',frozen_quota,'available',available_quota) FROM hr_leave_quota WHERE tenant_id=100000 AND employee_id=${id(employeeId)} AND leave_type_id=${id(typeId)} AND period_id=${id(periodId)} AND deleted=0`)[0];
async function checkLedger(employeeId, typeId, periodId) {
  const values = await ok('admin', `${base}/ledger?employeeId=${employeeId}&leaveTypeId=${typeId}&periodId=${periodId}`);
  let sum = 0;
  for (const row of values) { sum += cents(row.leaveDays); check('running_balance_' + row.ledgerId, cents(row.runningBalance) === sum); }
  const current = quota(employeeId, typeId, periodId);
  check('ledger_sum_matches_quota_' + employeeId + '_' + typeId + '_' + periodId, (values.length === 0 && !current) || !!current && cents(current.available) === sum && cents(current.frozen) === 0);
  return sum;
}
const lastTriggers = new Map();
async function trigger(jobId, expected, label) {
  const remaining = 5500 - (Date.now() - (lastTriggers.get(jobId) || 0));
  if (remaining > 0) await new Promise(resolve => setTimeout(resolve, remaining));
  const accepted = await ok('admin', `${jobs}/${jobId}/trigger`, 'POST', {});
  check(label + '_accepted', accepted.accepted === true && typeof accepted.executeNo === 'string');
  fixture.executions.push({ jobId, executeNo: accepted.executeNo, label }); save(); lastTriggers.set(jobId, Date.now());
  const deadline = Date.now() + 180000;
  let result;
  do {
    result = rows(`SELECT JSON_OBJECT('status',execute_status,'trigger',trigger_type,'actor',trigger_by,'affected',affected_rows,'start',start_time,'end',end_time,'report',report_time) FROM sys_job_log WHERE tenant_id=100000 AND job_id=${jobId} AND execute_no=${sql(accepted.executeNo)}`)[0];
    if (result && ['SUCCESS','FAILED','TIMEOUT','DISPATCH_FAILED'].includes(result.status)) break;
    await new Promise(resolve => setTimeout(resolve, 1000));
  } while (Date.now() < deadline);
  check(label + '_real_execution_and_report', result?.status === 'SUCCESS' && result.trigger === 'MANUAL' && result.actor === 'g_import_admin'
    && result.start && result.end && result.report && Number(result.affected) === expected);
  console.log(`D1_CYCLE_JOB: label=${label}; affected=${result.affected}; status=${result.status}`);
}

try {
  check('no_preexisting_unexecuted_schedules', database('SELECT COUNT(*) FROM hr_earned_leave_schedule WHERE executed_flag=0') === '0');
  check('no_preexisting_unallocated_assignments', database("SELECT COUNT(*) FROM hr_leave_policy_assignment WHERE allocated_flag=0 AND status='ACTIVE' AND deleted=0") === '0');
  check('no_original_due_unexpired_carry_credit', database("SELECT COUNT(*) FROM hr_leave_ledger c WHERE c.tenant_id=100000 AND c.transaction_type='CARRY_FORWARD' AND c.leave_days>0 AND c.to_date<CURRENT_DATE AND NOT EXISTS (SELECT 1 FROM hr_leave_ledger d WHERE d.tenant_id=c.tenant_id AND d.transaction_type='EXPIRY' AND d.source_biz_type='LEAVE_LEDGER' AND d.source_biz_id=CAST(c.ledger_id AS CHAR))") === '0');
  check('historical_period_range_unused', database("SELECT COUNT(*) FROM hr_leave_period WHERE tenant_id=100000 AND deleted=0 AND start_date<='2012-03-31' AND end_date>='2010-04-01'") === '0');
  check('historical_period_neighbors_absent', database("SELECT COUNT(*) FROM hr_leave_period WHERE tenant_id=100000 AND deleted=0 AND status='OPEN' AND (end_date='2010-03-31' OR start_date='2012-04-01')") === '0');
  check('no_original_eligible_carry_groups', database("SELECT COUNT(*) FROM hr_leave_quota q JOIN hr_leave_period p ON p.period_id=q.period_id AND p.tenant_id=q.tenant_id JOIN hr_leave_period n ON n.tenant_id=p.tenant_id AND n.start_date=DATE_ADD(p.end_date,INTERVAL 1 DAY) AND n.status='OPEN' AND n.deleted=0 WHERE p.tenant_id=100000 AND p.status='OPEN' AND p.deleted=0 AND p.end_date<CURRENT_DATE AND q.deleted=0 AND q.available_quota>0") === '0');
  originalLedgerCursor = id(database('SELECT COALESCE(MAX(ledger_id),1) FROM hr_leave_ledger'));
  originalLedgerHash = hash(JSON.stringify(allLedger(originalLedgerCursor))); originalJobsHash = hash(originalJobs());
  fixture.originalLedgerCursor = originalLedgerCursor; fixture.originalLedgerHash = originalLedgerHash; fixture.originalJobsHash = originalJobsHash; save();
  for (const [jobId, handler] of [[1450,'hrEarnedLeaveAccrual'],[1451,'hrLeaveCarryForward'],[1452,'hrLeaveExpiry'],[1453,'hrLeaveQuotaReconcile']]) {
    const job = await ok('admin', jobs + '/' + jobId);
    check('original_job_' + jobId + '_paused_and_matches', job.handlerName === handler && job.status === 'PAUSED');
  }
  const denied = await api('employee', jobs + '/1450/trigger', { method: 'POST', body: {} });
  check('employee_cannot_trigger_accrual', denied.status === 403); evidence.permissions = true;
  fixture.firstPeriod = id(await ok('admin', base + '/periods', 'POST', { periodName: marker + '-2010', startDate: '2010-04-01', endDate: '2011-03-31', defaultFlag: 0, status: 'OPEN' })); save();
  fixture.nextPeriod = id(await ok('admin', base + '/periods', 'POST', { periodName: marker + '-2011', startDate: '2011-04-01', endDate: '2012-03-31', defaultFlag: 0, status: 'OPEN' })); save();
  for (const suffix of ['carry', 'no-assignment-carry']) {
    fixture.employees.push(id(await ok('admin', '/hr/employees', 'POST', { employeeNo: marker + '-' + suffix, name: '周期验收' + suffix,
      gender: 'MALE', deptId: '100', employeeType: 'FULL_TIME', employeeStatus: 'REGULAR', hireDate: '2010-04-01' }))); save();
  }
  const details = [];
  for (const spec of specs) {
    const typeId = id(await ok('admin', '/hr/attendance/leave-types', 'POST', { leaveCode: marker + '-' + spec.name, leaveName: '周期验收-' + spec.name,
      unit: 'DAY', needQuota: 1, isPaid: 1, status: 1, maxDaysPerYear: 20, earnedLeaveFlag: spec.earned ? 1 : 0,
      earnedLeaveFrequency: spec.frequency, roundingMode: spec.rounding, carryForwardFlag: spec.carry ? 1 : 0,
      maxCarryForwardDays: 2, carryForwardExpireDays: 30 }));
    fixture.types[spec.name] = typeId; details.push({ leaveTypeId: typeId, annualDays: spec.grant }); save();
  }
  fixture.policyId = id(await ok('admin', base + '/policies', 'POST', { policyCode: marker, policyName: marker, status: 'ACTIVE' })); save();
  await ok('admin', `${base}/policies/${fixture.policyId}/details`, 'PUT', details);
  for (let index = 0; index < fixture.employees.length; index++) {
    const body = { employeeIds: [fixture.employees[index]], policyId: fixture.policyId, periodId: fixture.firstPeriod, assignmentBasis: 'PERIOD', carryForwardFlag: index === 0 ? 1 : 0 };
    check('one_actual_assignment_' + index, await ok('admin', base + '/assignments', 'POST', body) === 1);
  }
  for (const employeeId of fixture.employees) for (const spec of specs) {
    const typeId = fixture.types[spec.name], planned = schedule(employeeId, typeId), entries = ownedLedger(employeeId, typeId, fixture.firstPeriod);
    check('exact_schedule_dates_and_rounding_' + employeeId + '_' + spec.name, JSON.stringify(planned.map(row => [row.date, cents(row.days)])) === JSON.stringify(spec.schedule));
    check('schedule_not_executed_early_' + employeeId + '_' + spec.name, planned.every(row => Number(row.executed) === 0 && row.ledgerId === null));
    check('earned_policy_defers_ledger_' + employeeId + '_' + spec.name, spec.earned ? entries.length === 0 : entries.length === 1 && entries[0].kind === 'ALLOCATION' && cents(entries[0].days) === spec.grant * 100);
  }
  evidence.periods = true; console.log('D1_CYCLE_PERIODS: annual_start=2010-04-01; annual_end=2011-03-31; adjacent_start=2011-04-01; employees=2; types=7');
  const expectedSchedules = 2 * specs.reduce((sum, spec) => sum + spec.schedule.length, 0);
  await trigger(1450, expectedSchedules, 'accrual');
  for (const employeeId of fixture.employees) for (const spec of specs) {
    const typeId = fixture.types[spec.name], executed = schedule(employeeId, typeId), entries = ownedLedger(employeeId, typeId, fixture.firstPeriod);
    check('schedule_has_unique_actual_ledger_' + employeeId + '_' + spec.name, executed.every(row => Number(row.executed) === 1 && entries.some(entry => entry.id === row.ledgerId
      && entry.kind === 'ALLOCATION' && entry.source === 'HR_EARNED_LEAVE' && entry.sourceId === row.id && cents(entry.days) === cents(row.days) && entry.from === row.date && entry.to === '2011-03-31')));
    check('accrual_total_' + employeeId + '_' + spec.name, entries.reduce((sum, row) => sum + cents(row.days), 0) === spec.grant * 100);
    check('actual_period_balance_' + employeeId + '_' + spec.name, await checkLedger(employeeId, typeId, fixture.firstPeriod) === spec.grant * 100);
  }
  const accruedHash = hash(JSON.stringify(fixture.employees.flatMap(employee => specs.flatMap(spec => ownedLedger(employee, fixture.types[spec.name])))));
  await trigger(1450, 0, 'accrual-repeat');
  check('repeat_accrual_preserves_all_entries', accruedHash === hash(JSON.stringify(fixture.employees.flatMap(employee => specs.flatMap(spec => ownedLedger(employee, fixture.types[spec.name]))))));
  evidence.accrual = true;
  await trigger(1451, 14, 'carry');
  for (let index = 0; index < fixture.employees.length; index++) for (const spec of specs) {
    const employeeId = fixture.employees[index], typeId = fixture.types[spec.name], carried = index === 0 && spec.carry ? 200 : 0;
    const old = ownedLedger(employeeId, typeId, fixture.firstPeriod), next = ownedLedger(employeeId, typeId, fixture.nextPeriod);
    check('old_period_zero_' + index + '_' + spec.name, await checkLedger(employeeId, typeId, fixture.firstPeriod) === 0);
    check('carry_cap_and_assignment_switch_' + index + '_' + spec.name, await checkLedger(employeeId, typeId, fixture.nextPeriod) === carried);
    check('untransferred_balance_expires_' + index + '_' + spec.name, old.some(row => row.kind === 'EXPIRY' && cents(row.days) === -(spec.grant * 100 - carried)));
    check('paired_carry_source_and_expiry_' + index + '_' + spec.name, carried === 0 ? next.length === 0 : next.length === 1 && next[0].kind === 'CARRY_FORWARD'
      && cents(next[0].days) === 200 && next[0].from === '2011-04-01' && next[0].to === '2011-04-30'
      && old.some(row => row.kind === 'CARRY_FORWARD' && cents(row.days) === -200 && row.sourceId === next[0].sourceId));
  }
  check('finished_historical_period_closed', database(`SELECT status FROM hr_leave_period WHERE tenant_id=100000 AND period_id=${fixture.firstPeriod}`) === 'CLOSED');
  const carriedHash = hash(JSON.stringify(fixture.employees.flatMap(employee => specs.flatMap(spec => ownedLedger(employee, fixture.types[spec.name])))));
  await trigger(1451, 0, 'carry-repeat');
  check('repeat_carry_preserves_all_entries', carriedHash === hash(JSON.stringify(fixture.employees.flatMap(employee => specs.flatMap(spec => ownedLedger(employee, fixture.types[spec.name]))))));
  evidence.carry = true;
  await trigger(1452, 6, 'expiry');
  for (const spec of specs.filter(value => value.carry)) {
    const typeId = fixture.types[spec.name], entries = ownedLedger(fixture.employees[0], typeId, fixture.nextPeriod);
    const credit = entries.find(row => row.kind === 'CARRY_FORWARD'), debit = entries.find(row => row.kind === 'EXPIRY');
    check('expiry_links_original_credit_' + spec.name, entries.length === 2 && cents(debit?.days) === -200 && debit.source === 'LEAVE_LEDGER' && debit.sourceId === credit.id);
    check('expired_available_zero_' + spec.name, await checkLedger(fixture.employees[0], typeId, fixture.nextPeriod) === 0);
  }
  const expiredHash = hash(JSON.stringify(fixture.employees.flatMap(employee => specs.flatMap(spec => ownedLedger(employee, fixture.types[spec.name])))));
  await trigger(1452, 0, 'expiry-repeat');
  check('repeat_expiry_preserves_all_entries', expiredHash === hash(JSON.stringify(fixture.employees.flatMap(employee => specs.flatMap(spec => ownedLedger(employee, fixture.types[spec.name]))))));
  evidence.expiry = true; evidence.ledger = true;
  await trigger(1453, 0, 'reconcile');
  check('all_new_schedules_executed', database('SELECT COUNT(*) FROM hr_earned_leave_schedule WHERE executed_flag=0') === '0');
  check('browser_has_no_unhandled_errors', browserErrors.length === 0);
} catch (error) { failure = error; }
finally {
  try {
    if (originalLedgerHash) check('original_ledger_rows_preserved', originalLedgerHash === hash(JSON.stringify(allLedger(originalLedgerCursor))));
    if (originalJobsHash) check('original_jobs_configuration_preserved', originalJobsHash === hash(originalJobs()));
    evidence.preservation = true;
  } catch (error) { failure ||= error; }
  try { const scan = await runtime.scan(); evidence.secrets = true; console.log('D1_CYCLE_LOG_SCAN: ' + JSON.stringify(scan)); } catch (error) { failure ||= error; }
  await runtime.close();
  const message = failure ? String(failure.message).split('\n')[0].slice(0, 220) : undefined;
  const safeMessage = message && [...sensitive].every(value => !message.includes(value)) ? message : failure ? 'D1 cycle failed; inspect bounded evidence' : undefined;
  save(); fs.writeFileSync(path.join(output, 'requests.json'), JSON.stringify(requests, null, 2));
  fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify({ marker, passed: !failure && Object.values(evidence).every(Boolean), ...evidence, checks, requests: requests.length, browserErrors: browserErrors.length, failure: safeMessage }, null, 2));
  console.log(`D1_CYCLE_SUMMARY: passed=${checks.length}; failed=${failure ? 1 : 0}; requests=${requests.length}; preservation=${evidence.preservation}; browser_errors=${browserErrors.length}`);
  if (failure) { console.log('D1_CYCLE_FAILURE: ' + safeMessage); process.exitCode = 1; }
}
