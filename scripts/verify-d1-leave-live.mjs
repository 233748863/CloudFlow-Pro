import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createD1LeaveRuntime } from './runtime-checks/d1-leave-runtime.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
assert.ok(process.argv.includes('--d1-leave'));
const output = fs.realpathSync(process.argv[process.argv.indexOf('--output') + 1]);
assert.match(path.basename(output), /^d1-leave-live-20261005-r[1-9][0-9]*$/);
assert.ok(!fs.existsSync(path.join(output, 'result.json')));
const marker = 'D1L-' + randomUUID().replaceAll('-', '').slice(0, 12);
const fixture = { marker, types: {}, requests: [], instances: [], restorations: {} };
const evidence = { calculation: false, freeze: false, rejection: false, withdrawal: false, approval: false, concurrency: false,
  rules: false, calendarUnavailable: false, restoration: false, secrets: false };
const save = () => fs.writeFileSync(path.join(output, 'fixture.json'), JSON.stringify(fixture, null, 2));
const id = value => { const result = String(value); assert.match(result, /^[1-9]\d*$/); return result; };
const sql = value => `CONVERT(X'${Buffer.from(String(value)).toString('hex')}' USING utf8mb4)`;
const hash = value => createHash('sha256').update(value).digest('hex');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(read, accept, label, timeout = 90000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) { const result = await read(); if (accept(result)) return result; await delay(1000); }
  throw Error(label + ': observation deadline reached; retain original business IDs');
}
const runtime = await createD1LeaveRuntime(root, output);
const { run, checks, requests, sensitive, sessions, browserErrors, check, database, rows, api, success, ok } = runtime;
const base = '/hr/attendance/leave', ess = '/hr/ess/leave', wf = '/workflow/wf', holiday = '/auth/system/holiday';
let failure, employeeId, originalConfig, calendarId, calendarEnabled = true, employeeBody;
const reject = (response, label, code) => check(label, response.status >= 400 && response.body?.code !== 200 && (!code || JSON.stringify(response.body).includes(code)));
const requestRow = requestId => rows(`SELECT JSON_OBJECT('id',CAST(id AS CHAR),'status',status,'instanceId',process_instance_id,'duration',duration,'unit',unit,'employeeId',CAST(employee_id AS CHAR),'requestNo',request_no) FROM hr_time_request WHERE tenant_id=100000 AND id=${id(requestId)}`)[0];
const ledger = typeId => rows(`SELECT JSON_OBJECT('id',CAST(ledger_id AS CHAR),'type',transaction_type,'days',leave_days,'source',source_biz_type,'sourceId',source_biz_id,'periodId',CAST(leave_period_id AS CHAR),'unit',quantity_unit) FROM hr_leave_ledger WHERE tenant_id=100000 AND employee_id=${id(employeeId)} AND leave_type_id=${id(typeId)} ORDER BY ledger_id`);
const quota = typeId => rows(`SELECT JSON_OBJECT('total',total_quota,'used',used_quota,'frozen',frozen_quota,'available',available_quota) FROM hr_leave_quota WHERE tenant_id=100000 AND employee_id=${id(employeeId)} AND leave_type_id=${id(typeId)} AND period_id=${id(fixture.periodId)} AND deleted=0`)[0];
const quotaIs = (typeId, total, used, frozen, available, label) => { const value = quota(typeId); check(label, !!value && Number(value.total) === total && Number(value.used) === used && Number(value.frozen) === frozen && Number(value.available) === available); };
const payload = (typeId, suffix, start = '2026-10-08 09:00:00', end = '2026-10-08 18:00:00') => ({ leaveTypeId: typeId, startTime: start, endTime: end,
  duration: 1, unit: 'DAY', reason: `${marker}-${suffix}`, attachmentFileIds: [] });
async function submit(body) {
  const requestId = id(await ok('employee', ess, 'POST', body)); fixture.requests.push(requestId); save(); return requestId;
}
async function bound(requestId) {
  const row = await until(() => requestRow(requestId), value => !!value?.instanceId, 'Leave workflow binding');
  if (!fixture.instances.includes(row.instanceId)) { fixture.instances.push(row.instanceId); save(); }
  const process = rows(`SELECT JSON_OBJECT('definitionId',definition_id,'startUserId',CAST(start_user_id AS CHAR)) FROM wf_process_instance WHERE tenant_id=100000 AND instance_id=${sql(row.instanceId)}`)[0];
  check('workflow_uses_owned_two_stage_definition_and_real_applicant', process?.definitionId === fixture.definitionId && process.startUserId === sessions.employee.identity.userId);
  return row.instanceId;
}
async function taskFor(instanceId, actor, node) {
  const task = await until(() => rows(`SELECT JSON_OBJECT('id',task_id,'assignee',CAST(assignee AS CHAR),'node',node_key) FROM wf_task WHERE tenant_id=100000 AND instance_id=${sql(instanceId)} AND status='TODO'`),
    values => values.length === 1 && values[0].node === node, 'Sequential leave task ' + node);
  check('task_belongs_to_' + actor, task[0].assignee === sessions[actor].identity.userId);
  const todo = await ok(actor, wf + '/todo?pageNum=1&pageSize=100');
  check('actual_todo_contains_expected_task', (todo.rows || []).some(value => String(value.taskId || value.id) === task[0].id));
  return task[0];
}
async function complete(actor, task, action = 'APPROVE') {
  return ok(actor, wf + '/complete', 'POST', { taskId: task.id, action, comment: marker + '-' + action, variables: {} });
}
async function approve(requestId, typeId, beforeUsed, total, quantity) {
  const instanceId = await bound(requestId);
  const managerTask = await taskFor(instanceId, 'admin', 'manager');
  const forbidden = await api('employee', wf + '/complete', { method: 'POST', body: { taskId: managerTask.id, action: 'APPROVE', comment: marker, variables: {} } });
  check('applicant_cannot_handle_manager_task', forbidden.status === 403);
  await complete('admin', managerTask);
  const hrTask = await taskFor(instanceId, 'hr', 'hr');
  check('first_stage_does_not_mark_leave_approved', requestRow(requestId).status !== 'APPROVED');
  quotaIs(typeId, total, beforeUsed, quantity, total - beforeUsed - quantity, 'first_stage_keeps_frozen_quota');
  await complete('hr', hrTask);
  await until(() => requestRow(requestId), value => value.status === 'APPROVED', 'Final leave approval callback');
  quotaIs(typeId, total, beforeUsed + quantity, 0, total - beforeUsed - quantity, 'final_approval_deducts_once_and_unfreezes');
  const entries = ledger(typeId).filter(value => value.source === 'HR_TIME_REQUEST' && value.sourceId === requestId);
  check('approved_request_has_exact_freeze_application_unfreeze', entries.length === 3
    && entries.filter(value => value.type === 'FREEZE' && Number(value.days) === -quantity).length === 1
    && entries.filter(value => value.type === 'APPLICATION' && Number(value.days) === -quantity).length === 1
    && entries.filter(value => value.type === 'UNFREEZE' && Number(value.days) === quantity).length === 1);
  const beforeReplay = hash(JSON.stringify(ledger(typeId)));
  reject(await api('hr', wf + '/complete', { method: 'POST', body: { taskId: hrTask.id, action: 'APPROVE', comment: marker + '-repeat', variables: {} } }), 'completed_task_replay_rejected');
  check('completed_task_replay_does_not_change_ledger', beforeReplay === hash(JSON.stringify(ledger(typeId))));
}
async function cancel(requestId) {
  await ok('employee', `${ess}/${requestId}/cancel`, 'POST');
  check('employee_cancel_marks_original_request', requestRow(requestId).status === 'CANCELLED');
}

try {
  check('owned_schema_374_tables', database("SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='cloud_flow_db' AND table_type='BASE TABLE'") === '374');
  const authService = runtime.state.services.find(service => service.name === 'auth');
  const hitsBeforeBoundary = database('SELECT COUNT(*) FROM sys_business_rule_hit_record');
  for (const [method, route, body] of [['GET', '/effective/hr.leave.quota.limit', undefined], ['POST', '/hit-records', {}]]) {
    const response = await fetch(`http://127.0.0.1:${authService.port}/inner/auth/hr-leave-rules${route}`, {
      method, headers: { 'Content-Type': 'application/json', 'from-source': 'inner', 'X-Service-Name': 'cloudflow-service-hr' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    await response.arrayBuffer();
    requests.push({ actor: 'unsigned-direct', path: '/inner/auth/hr-leave-rules' + route, method, status: response.status });
    check('unsigned_direct_rule_' + method + '_rejected', [401, 403].includes(response.status));
  }
  const forgedHit = await api('employee', '/auth/system/rules/hit-records', { method: 'POST', body: {
    ruleCode: 'hr.leave.quota.limit', businessType: 'HR_LEAVE', businessId: 1, thresholdValue: 0, actualValue: 1, effect: 'BLOCK', hitResult: 'BLOCK' } });
  check('employee_cannot_write_rule_audit', forgedHit.status === 403);
  check('rejected_rule_access_has_no_audit_write', database('SELECT COUNT(*) FROM sys_business_rule_hit_record') === hitsBeforeBoundary);
  const quotaRuleBefore = await ok('admin', '/auth/system/rules/effective/hr.leave.quota.limit');
  check('original_quota_rule_remains_warn', quotaRuleBefore?.effect === 'WARN' && Number(quotaRuleBefore.enabled) === 1);
  fixture.quotaRuleDigest = hash(JSON.stringify(quotaRuleBefore)); save();
  const periods = await ok('admin', base + '/periods');
  const period = periods.find(value => value.startDate === '2026-01-01' && value.endDate === '2026-12-31' && value.status === 'OPEN');
  check('2026_open_period_available', !!period); fixture.periodId = id(period.periodId);
  check('employee_account_has_no_existing_hr_binding', database(`SELECT COUNT(*) FROM hr_employee WHERE tenant_id=100000 AND user_id=${id(sessions.employee.identity.userId)} AND deleted=0`) === '0');
  fixture.defaultCalendarBefore = database('SELECT calendar_id FROM sys_holiday_calendar WHERE tenant_id=100000 AND default_flag=1 AND deleted=0 ORDER BY calendar_id');
  await ok('admin', holiday + '/calendar', 'POST', { calendarCode: marker, calendarName: marker + '请假日历', region: '隔离验收', defaultFlag: 0,
    weeklyRestDays: '6,7', workStartTime: '09:00:00', workEndTime: '18:00:00', lunchStartTime: '12:00:00', lunchEndTime: '13:00:00', status: 'ENABLED' });
  calendarId = id(database(`SELECT calendar_id FROM sys_holiday_calendar WHERE tenant_id=100000 AND calendar_code=${sql(marker)} AND deleted=0`)); fixture.calendarId = calendarId; save();
  await ok('admin', holiday + '/date/batch', 'POST', { calendarId, yearNo: 2026, dates: Array.from({ length: 7 }, (_, index) => ({ holidayDate: `2026-10-0${index + 1}`, dateType: 'HOLIDAY', triplePayFlag: index < 3 ? 1 : 0, holidayName: '国庆验收样本' })) });
  await ok('admin', '/auth/system/dept', 'POST', { deptName: marker, parentId: 0, orderNum: 0, status: '0', holidayCalendarId: calendarId });
  const deptId = id(database(`SELECT dept_id FROM sys_dept WHERE tenant_id=100000 AND dept_name=${sql(marker)} AND deleted=0`));
  employeeBody = { employeeNo: marker, name: marker + '请假员工', gender: 'MALE', deptId, employeeType: 'FULL_TIME', employeeStatus: 'REGULAR', hireDate: '2026-01-01', userId: sessions.employee.identity.userId };
  employeeId = id(await ok('admin', '/hr/employees', 'POST', employeeBody)); fixture.employeeId = employeeId; fixture.employeeBody = employeeBody; save();
  check('ess_resolves_only_the_new_owned_employee', Array.isArray(await ok('employee', ess + '/mine')));
  const details = [];
  const types = [ ['base', {}, 3], ['race', {}, 1], ['annual', { maxDaysPerYear: 1, allowOverAllocationFlag: 1 }, 3],
    ['waiting', { applicableAfterDays: 1000 }, 3], ['continuous', { maxContinuousDays: 1 }, 3], ['attachment', { needAttachmentFlag: 1 }, 3],
    ['missingPolicy', {}, null], ['included', { includeHolidayFlag: 1 }, 10], ['hours', { unit: 'HOUR' }, 8],
    ['optional', { optionalLeaveFlag: 1, includeHolidayFlag: 1 }, 1], ['fullRounding', { roundingMode: 'FULL_DAY' }, 1] ];
  for (const [name, changes, grant] of types) {
    const typeId = id(await ok('admin', '/hr/attendance/leave-types', 'POST', { leaveCode: marker + '-' + name, leaveName: '请假验收-' + name,
      unit: 'DAY', needQuota: 1, isPaid: 1, status: 1, maxDaysPerYear: 20, includeHolidayFlag: 0, allowNegativeFlag: 0, roundingMode: 'NONE', ...changes }));
    fixture.types[name] = typeId; if (grant !== null) details.push({ leaveTypeId: typeId, annualDays: grant }); save();
  }
  const t = fixture.types;
  fixture.policyId = id(await ok('admin', base + '/policies', 'POST', { policyCode: marker, policyName: marker, status: 'ACTIVE' })); save();
  await ok('admin', `${base}/policies/${fixture.policyId}/details`, 'PUT', details);
  check('one_employee_policy_assignment', Number(await ok('admin', base + '/assignments', 'POST', { employeeIds: [employeeId], policyId: fixture.policyId, periodId: fixture.periodId, assignmentBasis: 'PERIOD', carryForwardFlag: 0 })) === 1);
  const configId = id(database("SELECT config_id FROM sys_config WHERE tenant_id=100000 AND config_key='sys.hr.leave.processKey' AND config_scope='1'"));
  const config = await ok('admin', '/auth/system/config/' + configId);
  const fields = ['configId','tenantId','configScope','configKey','configName','configType','configValue','remark'];
  originalConfig = Object.fromEntries(fields.map(field => [field, config[field] ?? null])); fixture.originalConfig = originalConfig; save();
  const definitions = rows(`SELECT JSON_OBJECT('id',definition_id,'digest',SHA2(model_json,256)) FROM wf_process_definition WHERE tenant_id=100000 AND process_key=${sql(originalConfig.configValue)} AND status='PUBLISHED' AND deleted=0 ORDER BY version DESC`);
  check('original_leave_definition_available', definitions.length >= 1); fixture.originalDefinition = definitions[0];
  const original = await ok('admin', wf + '/definition/' + definitions[0].id);
  const model = typeof original.modelJson === 'string' ? JSON.parse(original.modelJson) : structuredClone(original.modelJson);
  const approvalNodes = model.nodes.filter(value => value.type === 'APPROVAL');
  check('existing_leave_model_has_two_ordered_stages', approvalNodes.length === 2 && approvalNodes[0].id === 'manager' && approvalNodes[1].id === 'hr');
  for (const [index, actor] of ['admin', 'hr'].entries()) { approvalNodes[index].approverType = 'USER'; approvalNodes[index].approverValue = sessions[actor].identity.userId; }
  const definition = await ok('admin', wf + '/definition/save', 'POST', { processKey: marker, processName: marker, modelJson: JSON.stringify(model), formId: null, startPermissionType: 'ALL', startPermissionValue: '[]' });
  fixture.definitionId = definition.definitionId || definition.id; check('owned_definition_id_returned', typeof fixture.definitionId === 'string'); save();
  await ok('admin', wf + '/definition/deploy/' + fixture.definitionId, 'POST');
  fixture.configurationChanged = true; save();
  await ok('admin', '/auth/system/config', 'PUT', { ...originalConfig, configValue: marker });
  check('owned_workflow_configuration_visible', (await ok('admin', '/auth/system/config/' + configId)).configValue === marker);
  const calculate = async (typeId, startTime, endTime) => Number(await ok('employee', ess + '/calculate?' + new URLSearchParams({ leaveTypeId: typeId, startTime, endTime })));
  check('national_holiday_span_excludes_seven_days_and_counts_three', await calculate(t.base, '2026-09-28T09:00:00', '2026-10-07T18:00:00') === 3);
  check('include_holiday_rule_counts_all_ten_days', await calculate(t.included, '2026-09-28T09:00:00', '2026-10-07T18:00:00') === 10);
  check('morning_request_returns_half_day', await calculate(t.base, '2026-09-28T09:00:00', '2026-09-28T11:00:00') === 0.5);
  check('hour_leave_excludes_lunch', await calculate(t.hours, '2026-09-28T09:00:00', '2026-09-28T18:00:00') === 8);
  check('full_day_rounding_rounds_half_day_to_one', await calculate(t.fullRounding, '2026-09-28T09:00:00', '2026-09-28T11:00:00') === 1);
  check('optional_leave_accepts_calendar_holiday', await calculate(t.optional, '2026-10-01T09:00:00', '2026-10-01T18:00:00') === 1);
  reject(await api('employee', ess + '/calculate?' + new URLSearchParams({ leaveTypeId: t.optional, startTime: '2026-09-28T09:00:00', endTime: '2026-09-28T18:00:00' })), 'optional_leave_rejects_workday', 'OPTIONAL_HOLIDAY_REQUIRED');
  evidence.calculation = true; console.log('D1_LEAVE_CALCULATION: national_holiday_excluded=7; workdays=3; include_holiday_days=10; half_day=0.5; hours=8; full_rounding=1');

  const approved = await submit({ ...payload(t.base, 'forged', '2026-09-28 09:00:00', '2026-09-28 11:00:00'), employeeId: '990000701', duration: 999, unit: 'HOUR', status: 'APPROVED', requestNo: 'FORGED', processInstanceId: 'FORGED' });
  const submitted = requestRow(approved);
  check('server_overrides_employee_duration_unit_status_and_workflow_identity', submitted.employeeId === employeeId && Number(submitted.duration) === 0.5 && submitted.unit === 'DAY'
    && submitted.status !== 'APPROVED' && submitted.requestNo !== 'FORGED' && submitted.instanceId !== 'FORGED');
  quotaIs(t.base, 3, 0, 0.5, 2.5, 'submission_freezes_half_day_without_deducting'); evidence.freeze = true;
  const serviceLog = fs.readFileSync(path.join(run, 'hr/logs/hr-service.log'), 'utf8');
  check('forged_duration_override_is_logged', serviceLog.includes(`employeeId=${employeeId}, client=999, calculated=0.50`) || serviceLog.includes(`employeeId=${employeeId}, client=999, calculated=0.5`));
  await approve(approved, t.base, 0, 3, 0.5); evidence.approval = true;
  const rejected = await submit(payload(t.base, 'reject'));
  quotaIs(t.base, 3, 0.5, 1, 1.5, 'second_submission_freezes_one_day');
  const rejectedInstance = await bound(rejected); await complete('admin', await taskFor(rejectedInstance, 'admin', 'manager'), 'REJECT');
  await until(() => requestRow(rejected), value => value.status === 'REJECTED', 'Rejected leave callback');
  quotaIs(t.base, 3, 0.5, 0, 2.5, 'rejection_restores_available_balance');
  const rejectedEntries = ledger(t.base).filter(value => value.sourceId === rejected && value.source === 'HR_TIME_REQUEST');
  check('rejection_only_freezes_and_releases', rejectedEntries.length === 2 && rejectedEntries.some(value => value.type === 'FREEZE' && Number(value.days) === -1)
    && rejectedEntries.some(value => value.type === 'UNFREEZE' && Number(value.days) === 1)); evidence.rejection = true;
  const revoked = await submit(payload(t.base, 'cancel', '2026-10-09 09:00:00', '2026-10-09 18:00:00')); await bound(revoked); await cancel(revoked);
  quotaIs(t.base, 3, 0.5, 0, 2.5, 'withdrawal_releases_without_deducting');
  const revokeBefore = hash(JSON.stringify(ledger(t.base)));
  reject(await api('employee', `${ess}/${revoked}/cancel`, { method: 'POST', body: {} }), 'repeat_withdrawal_rejected');
  check('repeat_withdrawal_adds_no_ledger_entry', revokeBefore === hash(JSON.stringify(ledger(t.base)))); evidence.withdrawal = true;
  console.log('D1_LEAVE_WORKFLOW: stages=2; approved_days=0.5; rejected_days_released=1; withdrawn_days_released=1; replay_extra_entries=0');

  const beforeRace = database(`SELECT COUNT(*) FROM hr_time_request WHERE tenant_id=100000 AND employee_id=${employeeId}`);
  const concurrent = await Promise.all([api('employee', ess, { method: 'POST', body: payload(t.race, 'race-one') }),
    api('employee', ess, { method: 'POST', body: payload(t.race, 'race-two', '2026-10-09 09:00:00', '2026-10-09 18:00:00') })]);
  const winners = concurrent.filter(value => value.status === 200 && value.body?.code === 200);
  check('one_day_balance_allows_exactly_one_concurrent_request', winners.length === 1 && concurrent.filter(value => value.status >= 400 && JSON.stringify(value.body).includes('INSUFFICIENT_QUOTA')).length === 1);
  const winner = id(winners[0].body.data); fixture.requests.push(winner); save();
  check('concurrent_loser_does_not_persist_a_request', Number(database(`SELECT COUNT(*) FROM hr_time_request WHERE tenant_id=100000 AND employee_id=${employeeId}`)) === Number(beforeRace) + 1);
  quotaIs(t.race, 1, 0, 1, 0, 'concurrent_requests_never_overfreeze');
  await approve(winner, t.race, 0, 1, 1); evidence.concurrency = true;
  console.log('D1_LEAVE_CONCURRENCY: submissions=2; persisted=1; rejected=1; total=1; used=1; frozen=0; available=0');

  const hitCodes = [];
  async function blocked(body, ruleCode, threshold, actual, effect = 'BLOCK', errorCode = 'LEAVE_RULE_BLOCKED') {
    const before = database(`SELECT COUNT(*) FROM hr_time_request WHERE tenant_id=100000 AND employee_id=${employeeId}`);
    const ledgerBefore = database(`SELECT COUNT(*) FROM hr_leave_ledger WHERE tenant_id=100000 AND employee_id=${employeeId}`);
    const cursor = id(database('SELECT COALESCE(MAX(id),1) FROM sys_business_rule_hit_record'));
    reject(await api('employee', ess, { method: 'POST', body }), 'blocked_rule_' + ruleCode, errorCode);
    check('rule_failure_has_no_request_or_ledger_side_effect_' + ruleCode, before === database(`SELECT COUNT(*) FROM hr_time_request WHERE tenant_id=100000 AND employee_id=${employeeId}`)
      && ledgerBefore === database(`SELECT COUNT(*) FROM hr_leave_ledger WHERE tenant_id=100000 AND employee_id=${employeeId}`));
    const hits = rows(`SELECT JSON_OBJECT('code',rule_code,'effect',effect,'result',hit_result,'threshold',threshold_value,'actual',actual_value) FROM sys_business_rule_hit_record WHERE tenant_id=100000 AND business_type='HR_LEAVE' AND business_id=${employeeId} AND id>${cursor} ORDER BY id`);
    check('failed_rule_is_persisted_' + ruleCode, hits.length === 1 && hits[0].code === ruleCode && hits[0].effect === effect && hits[0].result === effect
      && Number(hits[0].threshold) === threshold && Number(hits[0].actual) === actual); hitCodes.push(ruleCode);
    const visible = await ok('admin', '/auth/system/rules/hit-records?businessType=HR_LEAVE&ruleCode=' + encodeURIComponent(ruleCode) + '&pageNum=1&pageSize=100');
    check('admin_reads_recorded_rule_' + ruleCode, (visible.records || []).some(value => String(value.businessId) === employeeId
      && value.ruleCode === ruleCode && value.effect === effect && Number(value.thresholdValue) === threshold && Number(value.actualValue) === actual));
  }
  await blocked(payload(t.waiting, 'waiting'), 'hr.leave.probation.limit', 1000, 280);
  await blocked(payload(t.continuous, 'continuous', '2026-10-08 09:00:00', '2026-10-09 18:00:00'), 'hr.leave.continuous.limit', 1, 2);
  await blocked(payload(t.race, 'balance'), 'hr.leave.quota.limit', 0, 1, 'WARN', 'INSUFFICIENT_QUOTA');
  await blocked(payload(t.attachment, 'attachment'), 'hr.leave.attachment.required', 1, 0);
  await blocked(payload(t.missingPolicy, 'policy'), 'hr.leave.policy.required', 1, 0);
  const annual = await submit(payload(t.annual, 'annual-first')); await bound(annual);
  await blocked(payload(t.annual, 'annual-second', '2026-10-09 09:00:00', '2026-10-09 18:00:00'), 'hr.leave.annual.limit', 1, 2); await cancel(annual);
  check('six_distinct_rules_exercised', new Set(hitCodes).size === 6); fixture.ruleCodes = hitCodes; evidence.rules = true; save();
  console.log('D1_LEAVE_RULES: rule_types=6; persisted_hits=6; failed_request_writes=0; failed_ledger_writes=0');

  const calendar = await ok('admin', holiday + '/calendar/' + calendarId);
  calendarEnabled = false; save();
  await ok('admin', holiday + '/calendar', 'PUT', { ...calendar, status: 'DISABLED' });
  const beforeMissing = database(`SELECT COUNT(*) FROM hr_time_request WHERE tenant_id=100000 AND employee_id=${employeeId}`);
  const ledgerBeforeMissing = database(`SELECT COUNT(*) FROM hr_leave_ledger WHERE tenant_id=100000 AND employee_id=${employeeId}`);
  reject(await api('employee', ess, { method: 'POST', body: payload(t.base, 'disabled-calendar') }), 'disabled_calendar_rejects_submission');
  check('disabled_calendar_rejection_has_no_business_side_effects', beforeMissing === database(`SELECT COUNT(*) FROM hr_time_request WHERE tenant_id=100000 AND employee_id=${employeeId}`)
    && ledgerBeforeMissing === database(`SELECT COUNT(*) FROM hr_leave_ledger WHERE tenant_id=100000 AND employee_id=${employeeId}`));
  evidence.calendarUnavailable = true;
  const mine = await ok('employee', ess + '/mine');
  check('employee_reads_actual_final_approval_and_rejection', mine.some(value => String(value.id) === approved && value.status === 'APPROVED' && Number(value.duration) === 0.5)
    && mine.some(value => String(value.id) === rejected && value.status === 'REJECTED'));
  check('browser_has_no_unhandled_errors', browserErrors.length === 0);
} catch (error) { failure = error; }
finally {
  const restorationErrors = [];
  const restore = async (label, action) => { try { await action(); fixture.restorations[label] = true; } catch { restorationErrors.push(label); fixture.restorations[label] = false; } save(); };
  await restore('calendar', async () => {
    if (calendarId && !calendarEnabled) { const current = await ok('admin', holiday + '/calendar/' + calendarId); await ok('admin', holiday + '/calendar', 'PUT', { ...current, status: 'ENABLED' }); calendarEnabled = true; }
  });
  await restore('pendingRequests', async () => {
    for (const requestId of fixture.requests) {
      let row = requestRow(requestId);
      if (['PENDING','SUBMITTED','APPROVING','APPLYING'].includes(row.status)) { await ok('admin', `/hr/attendance/time-requests/${requestId}/cancel`, 'POST'); row = requestRow(requestId); }
      if (row.status === 'CANCELLED' && row.instanceId) {
        await until(() => database(`SELECT COUNT(*) FROM wf_task WHERE tenant_id=100000 AND instance_id=${sql(row.instanceId)} AND status='TODO'`), value => value === '0', 'Original cancelled workflow tasks');
      }
    }
  });
  await restore('workflowConfiguration', async () => {
    if (originalConfig && fixture.configurationChanged) {
      const current = await ok('admin', '/auth/system/config/' + originalConfig.configId);
      check('temporary_workflow_configuration_has_not_been_replaced', current.configValue === marker || current.configValue === originalConfig.configValue);
      await ok('admin', '/auth/system/config', 'PUT', originalConfig);
      const restored = await ok('admin', '/auth/system/config/' + originalConfig.configId);
      check('workflow_configuration_restored_field_by_field', Object.keys(originalConfig).every(key => String(restored[key] ?? '') === String(originalConfig[key] ?? '')));
      check('original_workflow_model_unchanged', database(`SELECT SHA2(model_json,256) FROM wf_process_definition WHERE tenant_id=100000 AND definition_id=${sql(fixture.originalDefinition.id)}`) === fixture.originalDefinition.digest);
    }
  });
  await restore('accountBinding', async () => {
    if (employeeId) {
      check('owned_employee_binding_still_matches_before_detach', database(`SELECT CAST(user_id AS CHAR) FROM hr_employee WHERE tenant_id=100000 AND id=${employeeId} AND employee_no=${sql(marker)}`) === sessions.employee.identity.userId);
      await ok('admin', '/hr/employees/' + employeeId, 'PUT', { ...employeeBody, userId: null });
      check('original_unbound_account_state_restored', database(`SELECT COUNT(*) FROM hr_employee WHERE tenant_id=100000 AND user_id=${id(sessions.employee.identity.userId)} AND deleted=0`) === '0');
    }
  });
  if (fixture.defaultCalendarBefore) await restore('tenantDefault', async () => check('tenant_default_calendar_never_changed', fixture.defaultCalendarBefore === database('SELECT calendar_id FROM sys_holiday_calendar WHERE tenant_id=100000 AND default_flag=1 AND deleted=0 ORDER BY calendar_id')));
  if (fixture.quotaRuleDigest) await restore('quotaRule', async () => check('original_quota_rule_unchanged', fixture.quotaRuleDigest === hash(JSON.stringify(await ok('admin', '/auth/system/rules/effective/hr.leave.quota.limit')))));
  evidence.restoration = restorationErrors.length === 0; if (restorationErrors.length) failure ||= Error('Restoration incomplete: ' + restorationErrors.join(','));
  try { const scan = await runtime.scan(); evidence.secrets = true; console.log('D1_LEAVE_LOG_SCAN: ' + JSON.stringify(scan)); } catch (error) { failure ||= error; }
  await runtime.close();
  const message = failure ? String(failure.message).split('\n')[0].slice(0, 220) : undefined;
  const safeMessage = message && [...sensitive].every(value => !message.includes(value)) ? message : failure ? 'D1 leave failed; inspect bounded evidence' : undefined;
  fs.writeFileSync(path.join(output, 'requests.json'), JSON.stringify(requests, null, 2)); save();
  fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify({ marker, passed: !failure && Object.values(evidence).every(Boolean), ...evidence, checks, requests: requests.length, browserErrors: browserErrors.length, failure: safeMessage }, null, 2));
  console.log(`D1_LEAVE_SUMMARY: passed=${checks.length}; failed=${failure ? 1 : 0}; requests=${requests.length}; restoration=${evidence.restoration}; browser_errors=${browserErrors.length}`);
  if (failure) { console.log('D1_LEAVE_FAILURE: ' + safeMessage); process.exitCode = 1; }
}
