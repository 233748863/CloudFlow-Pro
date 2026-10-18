import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { hundredths, weightedMinutes, creditDelta } from './batch-h/hr09-evidence.mjs';
import { verifyHrOvertimeInterface } from './verify-hr-overtime-ui.mjs';
import { verifyHrOvertimeLimits } from './verify-hr-overtime-limits.mjs';
import { verifyHrShiftSafety } from './verify-hr-overtime-shift-safety.mjs';
import { verifyHrShiftRollback } from './verify-hr-shift-rollback.mjs';
import { verifyHrOvertimeCompLeave } from './verify-hr-overtime-comp-leave.mjs';
import { verifyHrOvertimeAdjacent } from './verify-hr-overtime-adjacent.mjs';
import { verifyHrOvertimePayroll } from './verify-hr-overtime-payroll.mjs';
import { verifyHrOvertimePeriods } from './verify-hr-overtime-periods.mjs';
import { verifyHrOvertimePayrollPeriods } from './verify-hr-overtime-payroll-periods.mjs';

// The original HR09 business cases run against the owned integration context only.
export async function runHrOvertimeCore(context) {
const { sessions, database, check, evidence, journal } = context;
const fixture = { ids: {}, employeeIds: {}, checkins: {}, requests: {}, completed: {} };
const fixturePath = path.join(context.directory, 'private', 'h2ot-' + context.caseTag + '.json');
const label = 'H2OT-' + context.caseTag;
const note = label + ' 本机合成验收规则，不代表正式报酬及排班政策';
const overtime = '/hr/attendance/overtime-requests', overtimeTypes = '/hr/attendance/overtime-types';
const shifts = '/hr/attendance/shift-requests', rulesPath = '/auth/system/rules';
const configKeys = ['sys.hr.overtime.approvalUsers', 'sys.hr.shiftRequest.approvalUsers', 'sys.hr.shift.minimumRestMinutes',
  'sys.hr.overtime.processKey', 'sys.hr.shiftRequest.processKey'];
const typeFields = ['typeCode', 'typeName', 'applicableDayType', 'rateMultiplier', 'salaryComponentId', 'compensatoryFlag',
  'compensatoryRatio', 'compensatoryLeaveTypeId', 'maxHoursPerMonth', 'maxHoursPerDay', 'needApprovalFlag', 'remark'];
const blocked = /H_|权限|无权|禁止|本人|不允许|不属于|不存在|冲突|已变化|版本|未配置|尚未|缺少|不能|封账|上限|核定|成对|分钟|字段|审批|周期|同意|已占用|重复/;
const stopAfter = 'complete';
const actors = ['admin', 'hr', 'employee', 'peer', 'manager'];
const approvalActors = { responsible: 'manager', humanResources: 'hr', reviewer: 'hr' };
const pause = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
const sqlText = value => value == null ? 'NULL' : `CONVERT(UNHEX('${Buffer.from(String(value)).toString('hex')}') USING utf8mb4)`;
const jsonRows = statement => { const result = database(statement); return result ? result.split(/\r?\n/).map(JSON.parse) : []; };
const success = (response, text) => { check(text + ' HTTP=' + response.status + ' code=' + response.body?.code, response.status === 200 && response.body?.code === 200); return response.body.data; };
const rejected = (response, expression, text) => check(text, response.status >= 400 && response.status < 500 && response.status !== 429 && expression.test(String(response.body?.code) + ' ' + (response.body?.msg || response.body?.message || '')));
const businessBlocked = rejected;
const until = async (operation, predicate, text) => {
  const deadline = Date.now() + 90000;
  while (Date.now() < deadline) { const value = await operation(); if (predicate(value)) return value; await pause(500); }
  throw new Error(text + ' timed out');
};
const completeWorkflowTask = async (activeSessions, instanceId, actor) => {
  const task = await until(async () => {
    const result = await ok(actor, '/workflow/wf/todo?pageNum=1&pageSize=100');
    return (result?.rows || []).find(item => String(item.instanceId || item.processInstanceId) === String(instanceId));
  }, Boolean, '本人真实待办');
  await ok(actor, '/workflow/wf/complete', 'POST', { taskId: task.taskId || task.id, action: 'APPROVE', comment: note, variables: {} });
};
function identifier(value) {
  const result = String(value ?? '');
  if (!/^[1-9][0-9]{0,18}$/.test(result)) throw new Error('H_HR_IDENTIFIER_INVALID');
  return result;
}

function rows(value) {
  return Array.isArray(value) ? value : value?.rows || value?.records || [];
}

function pick(value, fields) {
  return Object.fromEntries(fields.map(field => [field, value[field] ?? null]));
}

const save = async () => { await fs.writeFile(fixturePath, JSON.stringify(fixture, null, 2)); };
const call = (actor, endpoint, method = 'GET', body, headers) => context.guardedApi(sessions[actor].page, endpoint, { method, body, headers });
const ok = async (actor, endpoint, method = 'GET', body, headers) => {
  let response = await call(actor, endpoint, method, body, headers);
  if (response.status === 409 && response.body?.code === 409 && /重复提交/.test(response.body?.msg || response.body?.message || '')) {
    await pause(5100); response = await call(actor, endpoint, method, body, headers);
  }
  return success(response, method + ' ' + endpoint.split('?')[0]);
};
const count = query => Number(database(query));
const employeeId = actor => identifier(fixture.employeeIds[actor]);
const single = query => {
  const found = jsonRows(query);
  check('只读依据唯一', found.length === 1);
  return found[0];
};

function lookup(table, field, value, idField = 'id') {
  return `SELECT JSON_OBJECT('id',CAST(${idField} AS CHAR)) FROM ${table} WHERE tenant_id=100000 AND ${field}=${sqlText(value)}`;
}

async function resource(key, actor, path, payload, query) {
  let existing = jsonRows(query);
  check(`验收资源无重复：${key}`, existing.length <= 1);
  if (!existing.length) {
    check('已持久化的验收资源不得失踪', !fixture.ids[key]);
    await ok(actor, path, 'POST', payload);
    existing = jsonRows(query);
  }
  check(`真实接口资源已保存：${key}`, existing.length === 1);
  const id = identifier(existing[0].id);
  if (fixture.ids[key]) check('持久验收资源身份不变', fixture.ids[key] === id);
  fixture.ids[key] = id;
  await save();
  return id;
}

async function stage(name, operation) {
  if (fixture.completed[name]) {
    check(`同批次阶段已有持久证据：${name}`, fixture.completed[name] === true);
    return;
  }
  await operation();
  fixture.completed[name] = true;
  await save();
}

async function baseline() {
  if (fixture.baseline) return;
  const types = rows(await ok('hr', overtimeTypes));
  check('三类正式加班类型均停用', types.length === 3 && types.every(value => Number(value.status) === 0)
    && new Set(types.map(value => value.applicableDayType)).size === 3);
  const component = single(`SELECT JSON_OBJECT('id',CAST(id AS CHAR),'componentCode',component_code,'componentName',component_name,
    'componentType',component_type,'category',category,'taxable',taxable,'sortOrder',sort_order,'status',status)
    FROM hr_comp_component WHERE tenant_id=100000 AND component_code='OVERTIME'`);
  check('正式OVERTIME项目停用且为计税VARIABLE', Number(component.status) === 0 && component.componentType === 'VARIABLE' && Number(component.taxable) === 1);
  const config = {};
  for (const key of configKeys) {
    const found = rows(await ok('admin', `/auth/system/config/list?configKey=${encodeURIComponent(key)}&pageSize=100`))
      .filter(value => value.configKey === key && String(value.tenantId) === sessions.accounts.admin.tenantId && String(value.configScope) === '1');
    check('H正式参数存在且唯一', found.length === 1);
    config[key] = found[0];
  }
  check('审批人及休息间隔未被编造', configKeys.slice(0, 3).every(key => !config[key].configValue));
  const rules = rows(await ok('admin', `${rulesPath}/list?ruleCode=hr.overtime.hours.limit&pageSize=100`))
    .filter(value => value.ruleCode === 'hr.overtime.hours.limit' && String(value.tenantId) === '100000');
  check('上限规则停用且阈值只归类型', rules.length === 1 && Number(rules[0].enabled) === 0 && rules[0].thresholdValue == null);
  const definitions = {};
  for (const key of configKeys.slice(3)) {
    const definition = single(`SELECT JSON_OBJECT('id',definition_id,'status',status,'formId',form_id) FROM wf_process_definition
      WHERE tenant_id=100000 AND process_key=${sqlText(config[key].configValue)} AND deleted=0 ORDER BY version DESC LIMIT 1`);
    check('正式H流程保留DRAFT且无表单', definition.status === 'DRAFT' && definition.formId == null);
    definitions[key] = definition.id;
  }
  fixture.baseline = { types, component, config, rule: rules[0], definitions };
  await save();
}

async function preflight() {
  await baseline();
  for (const actor of actors) {
    const account = sessions.accounts[actor];
    check(`共享工具分配真实会话：${actor}`, account.tenantId === '100000' && Boolean(account.userId) && account.sourceUserId !== account.userId,
      { actor, userId: account.userId, roleId: account.roleId });
  }
  rejected(await call('employee', overtimeTypes), blocked, '普通员工没有加班类型管理权限');
  rejected(await call('peer', overtime), blocked, '普通员工不能读取管理加班列表');
  rejected(await call('employee', shifts), blocked, '普通员工不能读取管理调班列表');
  const input = { startTime: '2026-07-06T17:30:00', endTime: '2026-07-06T18:00:00', settleMode: 'COMPENSATORY', reason: note };
  for (const field of ['applicantUserId', '_hExcludedUserIds', 'approvedMinutes', 'settlementAmount']) {
    const response = await call('employee', overtime, 'POST', { ...input, [field]: 'untrusted' }, { 'Idempotency-Key': randomUUID() });
    check(`创建请求拒绝外部保留字段且错误脱敏：${field}`, response.status === 400 && response.body?.code === 400
      && !JSON.stringify(response.body).includes('untrusted'), { status: response.status, traceId: response.traceId });
  }
  check('方案A三张新表真实存在', count("SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name IN ('hr_overtime_type','hr_overtime_request','hr_shift_request')") === 3);
  const indexes = jsonRows("SELECT JSON_OBJECT('name',index_name,'unique',MIN(non_unique)) FROM information_schema.statistics WHERE table_schema=DATABASE() AND index_name IN ('uk_hr_ot_request_idem','uk_hr_shift_request_idem','uk_hr_comp_change_source','uk_hr_leave_ledger_event','uk_hr_schedule_shift_request') GROUP BY index_name");
  check('创建重放与账务来源五个唯一索引存在', indexes.length === 5 && indexes.every(value => Number(value.unique) === 0));
  fixture.completed.preflight = true;
  await save();
}

async function setting(key, value) {
  const original = fixture.baseline.config[key];
  const current = await ok('admin', `/auth/system/config/${original.configId}`);
  check('恢复参数属于原租户原作用域', String(current.tenantId) === sessions.accounts.admin.tenantId
    && String(current.configScope) === '1' && current.configKey === key);
  const remark = value === original.configValue ? original.remark : note;
  if (current.configValue === value && current.remark === remark) return;
  const payload = { configId: original.configId, tenantId: original.tenantId, configScope: original.configScope, configKey: key, configName: original.configName,
    configType: original.configType, configValue: value, remark };
  let response = await call('admin', '/auth/system/config', 'PUT', payload);
  if (response.status === 409 && response.body?.code === 409 && /重复提交/.test(String(response.body?.msg ?? response.body?.message))) {
    await pause(5100);
    response = await call('admin', '/auth/system/config', 'PUT', payload);
  }
  success(response, '真实更新本租户临时参数');
  await until(() => ok('admin', `/auth/system/config/${original.configId}`), result => result.configValue === value, '参数真实读取一致');
}

async function typeStatus(id, status) {
  const current = await ok('hr', `${overtimeTypes}/${id}`);
  if (Number(current.status) !== status) await ok('hr', `${overtimeTypes}/${id}/status`, 'POST', { status, version: current.version, reason: note });
}

async function componentStatus(status) {
  const original = fixture.baseline.component;
  const current = single(`SELECT JSON_OBJECT('version',version) FROM hr_comp_component WHERE tenant_id=100000 AND id=${sqlText(original.id)}`);
  await ok('admin', `/hr/compensation/components/${original.id}`, 'PUT', { ...pick(original,
    ['componentCode', 'componentName', 'componentType', 'category', 'taxable', 'sortOrder']), status, version: current.version });
}

async function configureTypes(overrides = {}) {
  for (const original of fixture.baseline.types) await typeStatus(original.typeId, 0);
  for (const original of fixture.baseline.types) {
    const current = await ok('hr', `${overtimeTypes}/${original.typeId}`);
    await ok('hr', `${overtimeTypes}/${original.typeId}`, 'PUT', { ...pick(original, typeFields), maxHoursPerDay: '8.00', maxHoursPerMonth: '24.00',
      rateMultiplier: original.applicableDayType === 'HOLIDAY' ? '3.00' : original.applicableDayType === 'REST_DAY' ? '2.00' : '1.50',
      salaryComponentId: fixture.baseline.component.id, compensatoryFlag: 1, compensatoryRatio: '0.25',
      compensatoryLeaveTypeId: fixture.ids.leaveType, needApprovalFlag: 1, remark: note, ...overrides, version: current.version });
  }
  for (const original of fixture.baseline.types) await typeStatus(original.typeId, 1);
}

async function setupAttendance() {
  await baseline();
  for (const actor of ['employee', 'peer']) {
    const account = sessions.accounts[actor];
    fixture.employeeIds[actor] = await resource(`employee-${actor}`, 'hr', '/hr/employees', { employeeNo: `${label}-${actor}`,
      name: `${label} ${actor}`, gender: 'MALE', userId: account.userId, deptId: sessions.accounts.employee.deptId, hireDate: actor === 'employee' ? '2025-01-01' : '2026-01-01',
      employeeStatus: 'ACTIVE', employeeType: 'FULL_TIME' }, lookup('hr_employee', 'user_id', account.userId));
  }
  check('验收两人用户及员工身份独立', employeeId('employee') !== employeeId('peer') && sessions.accounts.employee.userId !== sessions.accounts.peer.userId);
  await resource('calendar', 'admin', '/auth/system/holiday/calendar', { calendarCode: label, calendarName: `${label} 验收日历`,
    weeklyRestDays: '6,7', defaultFlag: 0, status: 'ENABLED', remark: note }, lookup('sys_holiday_calendar', 'calendar_code', label, 'calendar_id'));
  await stage('calendar-resource', () => ok('admin', '/auth/system/holiday/date/batch', 'POST', { calendarId: fixture.ids.calendar, yearNo: 2026,
    dates: [['2026-07-07', 'REST', 0], ['2026-07-08', 'HOLIDAY', 0], ['2026-07-09', 'HOLIDAY', 1], ['2026-07-11', 'WORKDAY', 0]]
      .map(([holidayDate, dateType, triplePayFlag]) => ({ holidayDate, dateType, triplePayFlag, holidayName: `${label} 验收分类` })) }));
  for (const [name, startTime, endTime] of [['day', '09:00:00', '17:00:00'], ['early', '08:00:00', '16:00:00']]) {
    await resource(`shift-${name}`, 'hr', '/hr/attendance/shifts', { shiftCode: `${label}-${name}`, shiftName: `${label} ${name}`,
      startTime, endTime, breakMinutes: 0, workMinutes: 480, checkinWindowBeforeMinutes: 90, checkoutWindowAfterMinutes: 360,
      lateGraceMinutes: 0, earlyExitGraceMinutes: 0, halfDayHoursThreshold: '4', absentHoursThreshold: '2',
      workingHoursCalcMode: 'PAIRED', checkinDetermineMode: 'ALTERNATING', holidayCalendarId: fixture.ids.calendar,
      autoAttendanceFlag: 1, processAttendanceAfter: '2026-07-01', markOnHolidayFlag: 0, overtimeThresholdMinutes: 30, status: 1,
    }, lookup('hr_shift', 'shift_code', `${label}-${name}`));
    await resource(`rule-${name}`, 'hr', '/hr/attendance/rules', { ruleCode: `${label}-${name}`, ruleName: `${label} ${name}`,
      ruleType: 'FIXED', shiftId: fixture.ids[`shift-${name}`], checkMethods: ['APP'], configJson: {}, status: 1,
    }, lookup('hr_attendance_rule', 'rule_code', `${label}-${name}`));
  }
  for (const actor of ['employee', 'peer']) {
    const name = actor === 'employee' ? 'day' : 'early';
    await resource(`schedule-${actor}`, 'admin', '/hr/attendance/schedules', { targetType: 'EMPLOYEE', targetId: employeeId(actor),
      shiftId: fixture.ids[`shift-${name}`], ruleId: fixture.ids[`rule-${name}`], effectiveStart: '2026-07-01', effectiveEnd: '2026-10-31', status: 'PUBLISHED',
    }, `SELECT JSON_OBJECT('id',CAST(id AS CHAR)) FROM hr_schedule_assignment WHERE tenant_id=100000 AND target_type='EMPLOYEE'
      AND target_id=${sqlText(employeeId(actor))} AND shift_id=${sqlText(fixture.ids[`shift-${name}`])} AND effective_start='2026-07-01' AND source_shift_request_id IS NULL`);
  }
  await resource('leaveType', 'hr', '/hr/attendance/leave-types', { leaveCode: `${label}-COMP`, leaveName: `${label} 合成调休`,
    unit: 'HOUR', needQuota: 1, isPaid: 1, compensatoryFlag: 1, allowNegativeFlag: 0, allowOverAllocationFlag: 0,
    includeHolidayFlag: 0, earnedLeaveFlag: 0, carryForwardFlag: 0, roundingMode: 'NONE', status: 1, quotaRule: {},
  }, lookup('hr_leave_type', 'leave_code', `${label}-COMP`));
  const periods = jsonRows("SELECT JSON_OBJECT('id',CAST(period_id AS CHAR),'status',status) FROM hr_leave_period WHERE tenant_id=100000 AND deleted=0 AND status='OPEN' AND start_date<='2026-07-01' AND end_date>='2026-07-31'");
  check('假期周期不得重叠', periods.length <= 1);
  if (periods.length) {
    check('沿用唯一开放假期周期', periods[0].status === 'OPEN');
    fixture.ids.leavePeriod = periods[0].id;
  } else await resource('leavePeriod', 'hr', '/hr/attendance/leave/periods', { periodName: `${label} 调休周期`, startDate: '2026-07-01', endDate: '2026-07-31',
    defaultFlag: 0, status: 'OPEN', remark: note }, lookup('hr_leave_period', 'period_name', `${label} 调休周期`, 'period_id'));
  await save();
}

async function enablePolicy() {
  fixture.restorationRequired = true;
  await save();
  await componentStatus(1);
  await configureTypes();
  await ok('admin', `${rulesPath}/${fixture.baseline.rule.id}/enabled?enabled=1`, 'PUT');
  await until(() => ok('admin', `${rulesPath}/effective/hr.overtime.hours.limit`), value => Number(value?.enabled) === 1 && value.effect === 'BLOCK', '临时工时规则生效');
}

async function checkin(actor, date, direction, time) {
  const key = `${actor}-${date}-${direction}-${time}`;
  if (fixture.checkins[key]) return fixture.checkins[key];
  const existing = jsonRows(`SELECT JSON_OBJECT('id',CAST(checkin_id AS CHAR)) FROM hr_attendance_checkin WHERE tenant_id=100000
    AND employee_id=${sqlText(employeeId(actor))} AND check_time=${sqlText(`${date} ${time}`)} AND log_type=${sqlText(direction)} AND check_method='MANUAL'`);
  check('真实验收原始卡无重复', existing.length <= 1);
  fixture.checkins[key] = existing.length ? existing[0].id : identifier(await ok('admin', '/hr/attendance/checkins', 'POST', { employeeId: employeeId(actor),
    logType: direction, checkTime: `${date} ${time}`, shiftId: fixture.ids[actor === 'employee' ? 'shift-day' : 'shift-early'], checkMethod: 'MANUAL', deviceId: label, remark: note }));
  await save();
  return fixture.checkins[key];
}

async function cards(actor, date, from, to) {
  await checkin(actor, date, 'IN', from);
  await checkin(actor, date, 'OUT', to);
}

function draft(date, from, to, settleMode = 'COMPENSATORY', reason = note) {
  return { startTime: `${date}T${from}:00`, endTime: `${date}T${to}:00`, settleMode, reason };
}

function previewEvidence(result, response, date, expectedMinutes) {
  const minutes = value => Number.isSafeInteger(value) ? value : null;
  const code = value => typeof value === 'string' && /^[A-Z][A-Z0-9_]{0,79}$/.test(value) ? value : null;
  const time = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}$/.test(value) ? value : null;
  const codes = values => Array.isArray(values) ? values.slice(0, 20).map(value => code(value?.code || value?.dimension)) : null;
  return {
    date, expectedMinutes, actualMinutes: minutes(result.actualMinutes), actualMinutesType: typeof result.actualMinutes,
    dateType: code(result.dateType), triplePayFlag: minutes(result.triplePayFlag),
    overtimeTypeId: /^[1-9][0-9]{0,18}$/.test(String(result.overtimeTypeId ?? '')) ? String(result.overtimeTypeId) : null,
    requestedMinutes: minutes(result.requestedMinutes), thresholdMinutes: minutes(result.thresholdMinutes),
    blockerCodes: codes(result.blockers), warningDimensions: codes(result.warnings),
    segments: Array.isArray(result.segments) ? result.segments.slice(0, 20).map(segment => ({
      startTime: time(segment?.startTime), endTime: time(segment?.endTime), minutes: minutes(segment?.minutes), kind: code(segment?.kind),
      sourceCheckinIds: Array.isArray(segment?.sourceCheckinIds) ? segment.sourceCheckinIds.slice(0, 20)
        .filter(value => typeof value === 'string' && /^[1-9][0-9]{0,18}$/.test(value)) : null,
    })) : null,
    status: minutes(response.status), traceId: typeof response.traceId === 'string' && /^[A-Za-z0-9._-]{1,128}$/.test(response.traceId) ? response.traceId : null,
  };
}

async function calendarPrecision() {
  for (const [date, from, to, requestedFrom, requestedTo, dayType, minutes] of [
    ['2026-07-06', '09:00:10', '18:31:59', '17:30', '18:31', 'WORKDAY', 60],
    ['2026-07-07', '09:00:00', '10:31:00', '09:00', '10:31', 'REST_DAY', 61],
    ['2026-07-08', '09:00:00', '10:31:00', '09:00', '10:31', 'REST_DAY', 61],
    ['2026-07-09', '09:00:00', '10:31:00', '09:00', '10:31', 'HOLIDAY', 61],
    ['2026-07-11', '09:00:00', '18:31:00', '17:30', '18:31', 'WORKDAY', 61],
  ]) {
    await cards('employee', date, from, to);
    const response = await call('employee', `${overtime}/preview`, 'POST', draft(date, requestedFrom, requestedTo));
    const result = success(response, '真实打卡加班分钟预览');
    const diagnostic = previewEvidence(result, response, date, minutes);
    const expectedType = fixture.baseline.types.find(value => value.applicableDayType === dayType);
    check('实际日历与三倍标记决定类型', result.overtimeTypeId === String(expectedType.typeId), { ...diagnostic, dayType });
    check('分钟核算向内取整且阈值只扣一次', result.actualMinutes === minutes, diagnostic);
    check('员工读取实际工时规则无阻断', Array.isArray(result.blockers) && result.blockers.length === 0, diagnostic);
  }
  await checkin('employee', '2026-07-10', 'IN', '09:00:00');
  if (!fixture.checkins['employee-2026-07-10-OUT-18:00:00']) {
    const missing = await ok('employee', `${overtime}/preview`, 'POST', draft('2026-07-10', '17:30', '18:00'));
    check('孤立进卡不能生成实际加班', missing.blockers?.some(value => /CHECKIN/.test(value.code)) === true);
  }
  await checkin('employee', '2026-07-10', 'OUT', '18:00:00');
  businessBlocked(await call('employee', `${overtime}/preview`, 'POST', { ...draft('2026-07-06', '17:30', '18:00'), startTime: '2026-07-06T17:30:01' }), blocked, '申请时间不得携带秒');
  businessBlocked(await call('employee', `${overtime}/preview`, 'POST', { ...draft('2026-07-06', '17:30', '18:00'), endTime: '2026-07-07T00:01:00' }), blocked, '跨自然日必须拆分申请');
}

async function attendance() {
  await setupAttendance();
  const dates = [['2026-07-07', 'REST', 0], ['2026-07-08', 'HOLIDAY', 0], ['2026-07-09', 'HOLIDAY', 1], ['2026-07-11', 'WORKDAY', 0]];
  const actualDates = () => jsonRows(`SELECT JSON_OBJECT('date',CAST(holiday_date AS CHAR),'type',date_type,'triple',triple_pay_flag)
    FROM sys_holiday_date WHERE tenant_id=100000 AND calendar_id=${sqlText(fixture.ids.calendar)} AND deleted=0
      AND holiday_date IN (${dates.map(([date]) => sqlText(date)).join(',')})`);
  const matches = actual => dates.every(([date, type, triple]) => actual.filter(row => row.date === date && row.type === type && row.triple === triple).length === 1);
  if (!matches(actualDates())) {
    await ok('admin', '/auth/system/holiday/date/batch', 'POST', { calendarId: fixture.ids.calendar, yearNo: 2026,
      dates: dates.map(([holidayDate, dateType, triplePayFlag]) => ({ holidayDate, dateType, triplePayFlag, holidayName: `${label} 验收分类` })) });
  }
  check('真实日历写入保留显式日期类型与三倍标记', matches(actualDates()));
  const disabled = await ok('employee', `${overtime}/preview`, 'POST', draft('2026-07-06', '17:30', '18:00'));
  check('未核定默认停用确实阻断业务', disabled.blockers?.some(value => value.code === 'OVERTIME_TYPE_DISABLED') === true);
  await enablePolicy();
  await stage('attendance', calendarPrecision);
}

function eligibleOperator(actor, permission) {
  const account = sessions.accounts[actor];
  const department = single(`SELECT JSON_OBJECT('id',CAST(dept_id AS CHAR)) FROM hr_employee
    WHERE tenant_id=100000 AND id=${sqlText(employeeId('employee'))} AND deleted=0`).id;
  const eligible = count(`SELECT COUNT(DISTINCT user_row.user_id) FROM sys_user user_row
    JOIN sys_user_role binding ON binding.user_id=user_row.user_id AND binding.tenant_id=user_row.tenant_id
    JOIN sys_role role_row ON role_row.role_id=binding.role_id AND role_row.tenant_id=user_row.tenant_id
    JOIN sys_dept department ON department.dept_id=${sqlText(department)} AND department.tenant_id=user_row.tenant_id AND department.deleted=0
    WHERE user_row.tenant_id=100000 AND user_row.user_id=${sqlText(account.userId)} AND user_row.status='0' AND user_row.deleted=0
      AND role_row.status='0' AND role_row.deleted=0
      AND (role_row.role_key='admin' OR EXISTS (SELECT 1 FROM sys_role_menu role_menu JOIN sys_menu menu_row ON menu_row.menu_id=role_menu.menu_id
        WHERE role_menu.role_id=role_row.role_id AND menu_row.perms=${sqlText(permission)} AND menu_row.status='0'))
      AND (role_row.ds_type=0 OR (role_row.ds_type=1 AND FIND_IN_SET(${sqlText(department)},role_row.ds_scope)>0)
        OR (role_row.ds_type=3 AND user_row.dept_id=${sqlText(department)})
        OR (role_row.ds_type=2 AND (user_row.dept_id=${sqlText(department)} OR FIND_IN_SET(CAST(user_row.dept_id AS CHAR),department.ancestors)>0)))`);
  check('真实经办人具备所需权限及员工部门范围', eligible === 1,
    { actor, userId: account.userId, actorDeptId: account.deptId, employeeDeptId: department, permission });
}

function approvalEligibility(kind) {
  const responsible = identifier(sessions.accounts[approvalActors.responsible].userId);
  const humanResources = identifier(sessions.accounts[approvalActors.humanResources].userId);
  const excluded = [sessions.accounts.employee.userId, ...(kind === 'shift' ? [sessions.accounts.peer.userId] : [])];
  check('两级真实审批人互异并排除申请参与人', responsible !== humanResources && !excluded.includes(responsible) && !excluded.includes(humanResources));
  check('不使用管理员代替真实业务核定审批人', Object.values(approvalActors).every(actor => String(sessions.accounts[actor].roleId) !== '1'));
  eligibleOperator(approvalActors.responsible, 'workflow:task:complete');
  eligibleOperator(approvalActors.humanResources, 'workflow:task:complete');
  if (kind === 'overtime') eligibleOperator(approvalActors.reviewer, 'hr:overtime:verify');
  return { responsibleUserId: responsible, hrUserId: humanResources };
}

async function approvalPolicy(kind) {
  const configured = approvalEligibility(kind);
  const prefix = kind === 'overtime' ? 'sys.hr.overtime' : 'sys.hr.shiftRequest';
  const processKey = `h2ot_${context.caseTag}_${kind}`;
  const definitionQuery = `SELECT JSON_OBJECT('id',definition_id,'version',version,'status',status) FROM wf_process_definition
    WHERE tenant_id=100000 AND process_key=${sqlText(processKey)} AND deleted=0`;
  let definitions = jsonRows(definitionQuery);
  check('独立验收审批定义不重复创建版本', definitions.length <= 1);
  if (!definitions.length) {
    const original = await ok('admin', `/workflow/wf/definition/${fixture.baseline.definitions[`${prefix}.processKey`]}`);
    check('只复制正式草稿模型且不发布正式定义', original.status === 'DRAFT' && original.formId == null);
    await ok('admin', '/workflow/wf/definition/save', 'POST', { processKey, processName: `${label} ${kind} 临时验收`,
      modelJson: original.modelJson, formId: null, description: note, startPermissionType: 'ALL' });
    definitions = jsonRows(definitionQuery);
  }
  check('独立审批定义已由真实接口保存', definitions.length === 1);
  const definition = definitions[0];
  if (definition.status === 'DRAFT') await ok('admin', `/workflow/wf/definition/deploy/${definition.id}`, 'POST');
  const published = await ok('admin', `/workflow/wf/definition/${definition.id}`);
  check('独立验收审批定义已真实发布', published.status === 'PUBLISHED' && published.processKey === processKey && published.formId == null);
  fixture.definitions ||= {};
  fixture.definitions[kind] = { id: definition.id, version: published.version, processKey };
  fixture.restorationRequired = true;
  await save();
  await setting(`${prefix}.approvalUsers`, JSON.stringify(configured));
  await setting(`${prefix}.processKey`, processKey);
}

async function createRequest(key, endpoint, input, actor = 'employee') {
  let saved = fixture.requests[key];
  if (!saved) {
    saved = { key: randomUUID(), input, endpoint, actor };
    fixture.requests[key] = saved;
    await save();
  }
  check('持久创建重放保持同一请求体及入口', JSON.stringify(saved.input) === JSON.stringify(input) && saved.endpoint === endpoint
    && (saved.actor || 'employee') === actor);
  const result = await ok(actor, endpoint, 'POST', saved.input, { 'Idempotency-Key': saved.key });
  const id = identifier(result.requestId);
  if (saved.requestId) check('持久幂等键返回原申请', saved.requestId === id);
  saved.requestId = id;
  await save();
  const replay = await ok(actor, endpoint, 'POST', saved.input, { 'Idempotency-Key': saved.key });
  check('真实创建重放不新增申请', replay.requestId === id && replay.requestNo === result.requestNo && replay.version === result.version);
  return replay;
}

async function bindWorkflow(endpoint, requestId, kind, actor = 'employee') {
  const detail = await until(() => ok(actor, `${endpoint}/${requestId}`), value => Boolean(value.instanceId), '真实审批实例绑定');
  const expected = fixture.definitions[kind];
  const snapshotField = kind === 'overtime' ? 'policy_snapshot' : 'schedule_snapshot';
  const table = kind === 'overtime' ? 'hr_overtime_request' : 'hr_shift_request';
  const identity = single(`SELECT JSON_OBJECT('startUserId',CAST(instance_row.start_user_id AS CHAR),'definitionId',instance_row.definition_id,
    'applicant',JSON_UNQUOTE(JSON_EXTRACT(instance_row.variables,'$.applicantUserId')),
    'excluded',JSON_EXTRACT(instance_row.variables,'$._hExcludedUserIds'),
    'frozen',JSON_EXTRACT(instance_row.variables,'$.definitionVersion')=JSON_EXTRACT(request_row.${snapshotField},'$.definitionVersion')
      AND JSON_EXTRACT(instance_row.variables,'$.modelDigest')=JSON_EXTRACT(request_row.${snapshotField},'$.modelDigest')
      AND JSON_EXTRACT(instance_row.variables,'$.responsibleApproverIds')=JSON_EXTRACT(request_row.${snapshotField},'$.responsibleApproverIds')
      AND JSON_EXTRACT(instance_row.variables,'$.hrApproverIds')=JSON_EXTRACT(request_row.${snapshotField},'$.hrApproverIds'))
    FROM wf_process_instance instance_row JOIN ${table} request_row ON request_row.instance_id=instance_row.instance_id
      AND request_row.tenant_id=instance_row.tenant_id WHERE request_row.tenant_id=100000 AND request_row.request_id=${sqlText(requestId)}`);
  const excluded = [sessions.accounts[actor].userId, ...(kind === 'shift' && detail.requestMode === 'SWAP' ? [sessions.accounts.peer.userId] : [])].sort();
  check('原申请人启动身份及冻结流程版本真实透传', identity.startUserId === sessions.accounts[actor].userId
    && identity.applicant === identity.startUserId && identity.definitionId === expected.id && Number(identity.frozen) === 1);
  check('可信参与人排除名单冻结于实例', Array.isArray(identity.excluded) && JSON.stringify([...identity.excluded].sort()) === JSON.stringify(excluded));
  return detail;
}

function approvalHistory(instanceId) {
  return jsonRows(`SELECT JSON_OBJECT('operatorId',CAST(operator_id AS CHAR),'nodeKey',node_key) FROM wf_task_history
    WHERE tenant_id=100000 AND instance_id=${sqlText(instanceId)} AND action='APPROVE' ORDER BY create_time,CASE node_key WHEN 'responsible' THEN 0 WHEN 'hr' THEN 1 ELSE 2 END,history_id`);
}

async function approveRequest(endpoint, requestId, kind, applicant = 'employee') {
  const detail = await bindWorkflow(endpoint, requestId, kind, applicant);
  const instanceId = detail.instanceId;
  for (const [index, actor] of [approvalActors.responsible, approvalActors.humanResources].entries()) {
    const history = approvalHistory(instanceId);
    if (history.length > index) {
      check('已完成审批来自冻结的真实审批人', history[index].operatorId === sessions.accounts[actor].userId);
      continue;
    }
    const pending = await until(async () => jsonRows(`SELECT JSON_OBJECT('id',task_id,'assignee',CAST(assignee AS CHAR)) FROM wf_task
      WHERE tenant_id=100000 AND instance_id=${sqlText(instanceId)} AND status='TODO'`), value => value.length === 1, '真实顺序待办');
    check('真实待办只分配给当前级冻结审批人', pending[0].assignee === sessions.accounts[actor].userId);
    const selfApproval = await call(applicant, '/workflow/wf/complete', 'POST', { taskId: pending[0].id, action: 'APPROVE', comment: note, variables: {} });
    check('申请人真实办理本人申请被拒绝', selfApproval.status === 403 || [403, 'FORBIDDEN'].includes(selfApproval.body?.code),
      { status: selfApproval.status, code: selfApproval.body?.code, traceId: selfApproval.traceId });
    await completeWorkflowTask(sessions, instanceId, actor);
    await until(async () => approvalHistory(instanceId), value => value.length === index + 1, '真实审批历史入库');
    if (index === 0) check('首级同意不提前终审', (await ok(applicant, `${endpoint}/${requestId}`)).status !== 'APPROVED');
  }
  const history = approvalHistory(instanceId);
  check('两级真实同意记录完整且唯一', history.length === 2 && history[0].operatorId === sessions.accounts[approvalActors.responsible].userId
    && history[1].operatorId === sessions.accounts[approvalActors.humanResources].userId);
  await until(() => ok(applicant, `${endpoint}/${requestId}`), value => value.status === 'APPROVED', '真实终审回调');
}

async function completedSettlement(requestId) {
  const result = await until(() => ok('employee', `${overtime}/${requestId}/settlement`),
    value => ['SETTLED', 'FAILED', 'NEEDS_RESOLUTION', 'REJECTED'].includes(value.settlementStatus), '真实调休结算终态');
  check('真实调休结算成功且无需失败重试', result.settlementStatus === 'SETTLED', { status: result.settlementStatus, errorCode: result.lastErrorCode });
  return result;
}

async function overtimeSettlement(requestId) {
  const settled = await completedSettlement(requestId);
  check('核定60分钟按临时0.25比例转入0.25小时', settled.settledFlag === 1 && settled.quantityUnit === 'HOUR'
    && settled.compensatoryQuantity === '0.25' && Boolean(settled.leaveLedgerId));
  const ledger = single(`SELECT JSON_OBJECT('id',CAST(ledger_id AS CHAR),'employeeId',CAST(employee_id AS CHAR),
    'quantity',CAST(leave_days AS CHAR),'unit',quantity_unit,'periodId',CAST(leave_period_id AS CHAR),'typeId',CAST(leave_type_id AS CHAR),
    'eventKey',source_event_key,'transactionType',transaction_type) FROM hr_leave_ledger
    WHERE tenant_id=100000 AND source_biz_type='HR_OVERTIME' AND source_biz_id=${sqlText(requestId)}`);
  check('真实调休台账来源唯一且回指申请', ledger.id === settled.leaveLedgerId && ledger.employeeId === employeeId('employee')
    && ledger.periodId === settled.leavePeriodId && ledger.typeId === fixture.ids.leaveType && Number(ledger.quantity) === 0.25
    && ledger.unit === 'HOUR' && ledger.transactionType === 'COMPENSATORY' && ledger.eventKey === `HR_OVERTIME:${requestId}:COMPENSATORY`);
  const balances = single(`SELECT JSON_OBJECT('ledger',CAST(COALESCE((SELECT SUM(leave_days) FROM hr_leave_ledger
    WHERE tenant_id=100000 AND employee_id=${sqlText(employeeId('employee'))} AND leave_type_id=${sqlText(settled.leaveTypeId)}
      AND leave_period_id=${sqlText(settled.leavePeriodId)}),0) AS CHAR),'quota',CAST(total_quota AS CHAR),'available',CAST(available_quota AS CHAR))
    FROM hr_leave_quota WHERE tenant_id=100000 AND employee_id=${sqlText(employeeId('employee'))}
      AND leave_type_id=${sqlText(settled.leaveTypeId)} AND period_id=${sqlText(settled.leavePeriodId)} AND deleted=0`);
  check('真实调休余额与台账一致', Number(balances.quota) === Number(balances.ledger) && Number(balances.available) === Number(balances.ledger));
  const repeated = await ok('employee', `${overtime}/${requestId}/settlement`);
  check('重复读取不重复入账', repeated.leaveLedgerId === settled.leaveLedgerId && repeated.compensatoryQuantity === settled.compensatoryQuantity);
  fixture.completed['overtime-minimal'] = true;
  await save();
}

async function overtimePhase() {
  await setupAttendance();
  fixture.overtimeAttempt ||= 1;
  let key = `overtime-minimal-${fixture.overtimeAttempt}`;
  let detail = fixture.requests[key]?.requestId ? await ok('employee', `${overtime}/${fixture.requests[key].requestId}`) : null;
  if (detail?.status === 'SUBMITTED') {
    detail = await ok('employee', `${overtime}/${detail.requestId}/cancel`, 'POST', { version: detail.version, reason: `${note} 恢复政策后撤回旧冻结申请再登记` });
    check('旧核定依据变化须真实撤回', detail.status === 'CANCELLED');
  }
  if (detail?.status === 'CANCELLED') {
    fixture.overtimeAttempt += 1;
    key = `overtime-minimal-${fixture.overtimeAttempt}`;
    detail = null;
    await save();
  }
  if (!detail || detail.status === 'DRAFT') {
    if (stopAfter !== 'register') approvalEligibility('overtime');
    await enablePolicy();
    const input = draft('2026-07-13', '17:30', '18:30');
    detail = await createRequest(key, overtime, input);
    check('员工真实登记未伪造核定或审批', detail.status === 'DRAFT' && detail.approvedMinutes == null && !detail.instanceId);
    await cards('employee', '2026-07-13', '09:00:00', '18:30:00');
    fixture.completed['overtime-registered'] = true;
    await save();
    if (stopAfter === 'register') return;
    await approvalPolicy('overtime');
    const response = await call('employee', `${overtime}/preview`, 'POST', input);
    const preview = success(response, '真实加班核算');
    check('完整成对卡核定前实际60分钟且规则无阻断', preview.actualMinutes === 60 && Array.isArray(preview.blockers)
      && preview.blockers.length === 0, previewEvidence(preview, response, '2026-07-13', 60));
    detail = await ok('employee', `${overtime}/${detail.requestId}/submit`, 'POST', { version: detail.version });
    check('提交后尚未由HR核定', detail.status === 'SUBMITTED' && detail.approvedMinutes == null);
    const denied = await call('employee', `${overtime}/${detail.requestId}/review-hours`, 'POST', { version: detail.version, approvedMinutes: 60, note });
    check('申请人不能代HR核定自己的工时', denied.status === 403 || [403, 'FORBIDDEN'].includes(denied.body?.code), { status: denied.status, code: denied.body?.code });
    detail = await ok(approvalActors.reviewer, `${overtime}/${detail.requestId}/review-hours`, 'POST', { version: detail.version, approvedMinutes: 60, note });
    check('HR依据真实打卡核定60分钟', detail.approvedMinutes === 60 && ['PENDING', 'APPROVING'].includes(detail.status));
  }
  check('恢复执行只接受审批中或已通过申请', ['PENDING', 'APPROVING', 'APPROVED'].includes(detail.status));
  await bindWorkflow(overtime, detail.requestId, 'overtime');
  fixture.completed['overtime-started'] = true;
  await save();
  if (stopAfter === 'start') return;
  await approveRequest(overtime, detail.requestId, 'overtime');
  await overtimeSettlement(detail.requestId);
}

async function recoverableOvertime(name, input) {
  fixture.caseAttempts ||= {};
  let attempt = fixture.caseAttempts[name] || 1;
  let key = `${name}-${attempt}`;
  const existing = fixture.requests[key];
  let detail = existing?.requestId ? await ok('employee', `${overtime}/${existing.requestId}`) : null;
  if (detail?.status === 'SUBMITTED') {
    detail = await ok('employee', `${overtime}/${detail.requestId}/cancel`, 'POST', { version: detail.version, reason: `${note} 恢复后撤回旧核定依据` });
    check('恢复后的旧核定单经真实撤回后才重新登记', detail.status === 'CANCELLED');
  }
  if (detail && ['CANCELLED', 'REJECTED'].includes(detail.status)) {
    attempt++;
    key = `${name}-${attempt}`;
    detail = null;
  }
  fixture.caseAttempts[name] = attempt;
  await save();
  return detail || createRequest(key, overtime, input);
}

function compGroup() {
  return jsonRows(`SELECT JSON_OBJECT('id',CAST(request_id AS CHAR),'minutes',approved_minutes,'ratio',CAST(compensatory_ratio AS CHAR),
    'quantity',CAST(compensatory_quantity AS CHAR),'ledgerId',CAST(leave_ledger_id AS CHAR)) FROM hr_overtime_request
    WHERE tenant_id=100000 AND employee_id=${sqlText(employeeId('employee'))} AND leave_type_id=${sqlText(fixture.ids.leaveType)}
      AND leave_period_id=${sqlText(fixture.ids.leavePeriod)} AND settle_mode='COMPENSATORY' AND settlement_status='SETTLED' ORDER BY request_id`);
}

function verifyCompGroup() {
  const group = compGroup();
  check('原员工假种周期累计精确量与实际记账量相等',
    group.reduce((total, entry) => total + hundredths(entry.quantity), 0n) === weightedMinutes(group) / 60n);
  return group;
}

async function compensatoryPhase() {
  await setupAttendance();
  approvalEligibility('overtime');
  await enablePolicy();
  await approvalPolicy('overtime');
  fixture.compExpectations ||= {};
  for (const [groupName, date, ratio] of [['cumulative', '2026-07-14', '1.00'], ['zero', '2026-07-15', '0.25']]) {
    await configureTypes({ compensatoryRatio: ratio });
    await cards('employee', date, '09:00:00', '17:33:00');
    const quantities = [];
    for (let index = 0; index < 3; index++) {
      const input = draft(date, `17:${30 + index}`, `17:${31 + index}`);
      let detail = await recoverableOvertime(`comp-${groupName}-${index}`, input);
      const requestId = identifier(detail.requestId);
      if (!Object.hasOwn(fixture.compExpectations, requestId)) {
        check('累计验收预期在结算前持久保存', detail.settlementStatus !== 'SETTLED');
        fixture.compExpectations[requestId] = creditDelta(weightedMinutes(verifyCompGroup()), 1, ratio).toString();
        await save();
      }
      if (detail.status === 'DRAFT') {
        const response = await call('employee', `${overtime}/preview`, 'POST', input);
        const preview = success(response, '一分钟拆单真实预览');
        check('拆单实际一分钟且不重复扣阈值', preview.actualMinutes === 1 && preview.blockers?.length === 0,
          previewEvidence(preview, response, date, 1));
        detail = await ok('employee', `${overtime}/${requestId}/submit`, 'POST', { version: detail.version });
        detail = await ok(approvalActors.reviewer, `${overtime}/${requestId}/review-hours`, 'POST', { version: detail.version, approvedMinutes: 1, note });
      }
      await approveRequest(overtime, requestId, 'overtime');
      const settled = await completedSettlement(requestId);
      const expected = BigInt(fixture.compExpectations[requestId]);
      check('逐单授予量等于累计向下取整的差额', hundredths(settled.compensatoryQuantity) === expected && settled.quantityUnit === 'HOUR');
      const ledgers = jsonRows(`SELECT JSON_OBJECT('id',CAST(ledger_id AS CHAR),'quantity',CAST(leave_days AS CHAR),
        'employeeId',CAST(employee_id AS CHAR),'periodId',CAST(leave_period_id AS CHAR),'typeId',CAST(leave_type_id AS CHAR),
        'unit',quantity_unit,'transactionType',transaction_type,'eventKey',source_event_key) FROM hr_leave_ledger
        WHERE tenant_id=100000 AND source_biz_type='HR_OVERTIME' AND source_biz_id=${sqlText(requestId)}`);
      if (expected === 0n) check('零差额结算不生成零数量台账', ledgers.length === 0 && settled.leaveLedgerId == null);
      else check('正差额台账金额单位周期及来源唯一', ledgers.length === 1 && ledgers[0].id === settled.leaveLedgerId
        && hundredths(ledgers[0].quantity) === expected && ledgers[0].employeeId === employeeId('employee')
        && ledgers[0].periodId === fixture.ids.leavePeriod && ledgers[0].typeId === fixture.ids.leaveType
        && ledgers[0].unit === 'HOUR' && ledgers[0].transactionType === 'COMPENSATORY'
        && ledgers[0].eventKey === `HR_OVERTIME:${requestId}:COMPENSATORY`);
      verifyCompGroup();
      quantities.push(expected);
    }
    if (groupName === 'zero') check('小比例拆单同时覆盖零差额及后续补足', quantities.some(value => value === 0n) && quantities.some(value => value > 0n));
    fixture.completed[`overtime-comp-${groupName}`] = true;
    await save();
  }
  await cards('employee', '2026-07-16', '09:00:00', '17:31:00');
  const occupied = () => count(`SELECT COALESCE(SUM(actual_minutes),0) FROM hr_overtime_request WHERE tenant_id=100000
    AND employee_id=${sqlText(employeeId('employee'))} AND work_date='2026-07-16' AND deleted=0
    AND status IN ('SUBMITTED','PENDING','APPROVING','APPROVED')`);
  const before = occupied();
  let cancelled = await recoverableOvertime('comp-cancel', draft('2026-07-16', '17:30', '17:31'));
  check('撤回验收从真实草稿开始', cancelled.status === 'DRAFT');
  cancelled = await ok('employee', `${overtime}/${cancelled.requestId}/submit`, 'POST', { version: cancelled.version });
  check('提交后实际工时纳入上限占用', occupied() === before + 1);
  cancelled = await ok('employee', `${overtime}/${cancelled.requestId}/cancel`, 'POST', { version: cancelled.version, reason: note });
  check('审批前撤回释放实际工时占用', cancelled.status === 'CANCELLED' && occupied() === before);
  await pause(5100);
  const replay = await ok('employee', `${overtime}/${cancelled.requestId}/cancel`, 'POST', { version: cancelled.version, reason: note });
  check('撤回重放保留终态和版本', replay.status === 'CANCELLED' && replay.version === cancelled.version);
  check('撤回申请不产生调休或工资来源', count(`SELECT
    (SELECT COUNT(*) FROM hr_leave_ledger WHERE tenant_id=100000 AND source_biz_type='HR_OVERTIME' AND source_biz_id=${sqlText(cancelled.requestId)}) +
    (SELECT COUNT(*) FROM hr_comp_change WHERE tenant_id=100000 AND source_biz_type='HR_OVERTIME' AND source_biz_id=${sqlText(cancelled.requestId)})`) === 0);
  fixture.completed['overtime-comp-cancel'] = true;
  await save();
}

function sourceAssignments(requestId) {
  return jsonRows(`SELECT JSON_OBJECT('id',CAST(id AS CHAR),'employeeId',CAST(target_id AS CHAR),'shiftId',CAST(shift_id AS CHAR),
    'ruleId',CAST(rule_id AS CHAR),'date',CAST(schedule_date AS CHAR),'start',CAST(effective_start AS CHAR),'end',CAST(effective_end AS CHAR),'status',status)
    FROM hr_schedule_assignment WHERE tenant_id=100000 AND source_shift_request_id=${sqlText(requestId)} ORDER BY target_id`);
}

function originalSchedules() {
  return jsonRows(`SELECT JSON_OBJECT('id',CAST(id AS CHAR),'version',version,'shiftId',CAST(shift_id AS CHAR),'ruleId',CAST(rule_id AS CHAR),
    'start',CAST(effective_start AS CHAR),'end',CAST(effective_end AS CHAR),'status',status) FROM hr_schedule_assignment
    WHERE tenant_id=100000 AND id IN (${sqlText(fixture.ids['schedule-employee'])},${sqlText(fixture.ids['schedule-peer'])}) ORDER BY id`);
}

async function shiftApplied(detail, date, mode) {
  const expectedCount = mode === 'SWAP' ? 2 : 1;
  const applied = await until(async () => {
    const assignments = sourceAssignments(detail.requestId);
    check('排班应用不存在只写入一方的可见中间状态', assignments.length === 0 || assignments.length === expectedCount, { mode, count: assignments.length });
    return ok('employee', `${shifts}/${detail.requestId}`);
  }, value => ['APPLIED', 'FAILED'].includes(value.applicationStatus), '真实调班排班应用');
  check('终审调班真实应用成功', applied.applicationStatus === 'APPLIED', { applicationStatus: applied.applicationStatus, errorCode: applied.lastErrorCode });
  const assignments = sourceAssignments(detail.requestId);
  check('新排班仅覆盖所申请的单日', assignments.length === expectedCount
    && assignments.every(value => value.date === date && value.start === date && value.end === date && value.status === 'PUBLISHED'));
  check('申请人单日转入目标班次及规则', assignments.some(value => value.employeeId === employeeId('employee')
    && value.shiftId === fixture.ids['shift-early'] && value.ruleId === fixture.ids['rule-early']));
  if (mode === 'SWAP') check('互换对方原子转入申请人班次及规则', assignments.some(value => value.employeeId === employeeId('peer')
    && value.shiftId === fixture.ids['shift-day'] && value.ruleId === fixture.ids['rule-day']));
  check('原长期排班及配置版本保持不变', JSON.stringify(originalSchedules()) === JSON.stringify(fixture.shiftOriginalSchedules));
  const current = await ok('employee', `${shifts}/${detail.requestId}`);
  const refused = await call('employee', `${shifts}/${detail.requestId}/cancel`, 'POST', { version: current.version, reason: note });
  businessBlocked(refused, blocked, '终审后不得通过撤回反转排班');
  const retry = await call('admin', `${shifts}/${detail.requestId}/application/retry`, 'POST', { version: current.version, reason: note });
  check('成功应用不可被失败重试重复执行', retry.body?.code === 'RETRY_NOT_ALLOWED');
  check('撤回及重试拒绝后来源排班保持唯一', JSON.stringify(sourceAssignments(detail.requestId)) === JSON.stringify(assignments));
  fixture.completed[`shift-${mode.toLowerCase()}-minimal`] = true;
  await save();
}

async function shiftPhase() {
  await setupAttendance();
  fixture.employeeIds.admin = await resource('employee-admin', 'hr', '/hr/employees', { employeeNo: `${label}-admin`,
    name: `${label} admin`, gender: 'MALE', userId: sessions.accounts.admin.userId, deptId: sessions.accounts.admin.deptId,
    hireDate: '2026-01-01', employeeStatus: 'ACTIVE', employeeType: 'FULL_TIME' }, lookup('hr_employee', 'user_id', sessions.accounts.admin.userId));
  fixture.shiftOriginalSchedules ||= originalSchedules();
  check('原始排班证据恰有两人', fixture.shiftOriginalSchedules.length === 2);
  const dates = { SINGLE: '2026-10-12', SWAP: '2026-10-14', CANCEL: '2026-10-16' };
  const today = single("SELECT JSON_OBJECT('date',CAST(CURRENT_DATE AS CHAR))").date;
  check('临时调班日期必须是未来且在专用排班有效期内', today < dates.SINGLE);
  if (stopAfter !== 'register') approvalEligibility('shift');
  fixture.restorationRequired = true;
  await save();
  await setting('sys.hr.shift.minimumRestMinutes', '600');
  if (stopAfter !== 'register') await approvalPolicy('shift');
  for (const mode of ['SINGLE', 'SWAP']) {
    const date = dates[mode];
    const input = { requestMode: mode, attendanceDate: date, reason: note,
      ...(mode === 'SINGLE' ? { targetShiftId: fixture.ids['shift-early'], targetRuleId: fixture.ids['rule-early'] } : { swapEmployeeId: employeeId('peer') }) };
    let detail = await createRequest(`shift-${mode.toLowerCase()}-minimal`, shifts, input);
    if (detail.status === 'DRAFT') {
      check('调班登记不直接修改排班', detail.applicationStatus === 'NOT_READY' && sourceAssignments(detail.requestId).length === 0);
      fixture.completed[`shift-${mode.toLowerCase()}-registered`] = true;
      await save();
      if (stopAfter === 'register') continue;
      detail = await ok('employee', `${shifts}/${detail.requestId}/submit`, 'POST', { version: detail.version });
    }
    if (mode === 'SWAP' && detail.status === 'WAITING_ACCEPTANCE') {
      check('互换须等待对方本人同意且不提前启动', detail.peerAcceptanceStatus === 'PENDING' && !detail.instanceId && sourceAssignments(detail.requestId).length === 0);
      const invitation = await ok('peer', `${shifts}/invitations/${detail.requestId}`);
      for (const actor of ['admin', 'employee']) {
        const refused = await call(actor, `${shifts}/${detail.requestId}/respond`, 'POST', { version: invitation.version, decision: 'ACCEPTED', note });
        check('管理员和申请人不得代对方同意互换', refused.status === 403 || [403, 'FORBIDDEN'].includes(refused.body?.code), { actor, status: refused.status, code: refused.body?.code });
      }
      await ok('peer', `${shifts}/${detail.requestId}/respond`, 'POST', { version: invitation.version, decision: 'ACCEPTED', note });
      detail = await ok('employee', `${shifts}/${detail.requestId}`);
      check('真实本人同意身份已保存', detail.peerAcceptanceStatus === 'ACCEPTED' && detail.peerRespondedBy === sessions.accounts.peer.userId);
    }
    check('调班仅从真实待审或已通过状态续验', ['PENDING', 'APPROVING', 'APPROVED'].includes(detail.status));
    await bindWorkflow(shifts, detail.requestId, 'shift');
    fixture.completed[`shift-${mode.toLowerCase()}-started`] = true;
    await save();
    if (stopAfter === 'start') continue;
    await approveRequest(shifts, detail.requestId, 'shift');
    await shiftApplied(detail, date, mode);
  }
  const input = { requestMode: 'SINGLE', attendanceDate: dates.CANCEL, targetShiftId: fixture.ids['shift-early'], targetRuleId: fixture.ids['rule-early'], reason: note };
  let cancelled = await createRequest('shift-cancel-minimal', shifts, input);
  if (cancelled.status !== 'CANCELLED') cancelled = await ok('employee', `${shifts}/${cancelled.requestId}/cancel`, 'POST', { version: cancelled.version, reason: note });
  await pause(5100);
  const repeated = await ok('employee', `${shifts}/${cancelled.requestId}/cancel`, 'POST', { version: cancelled.version, reason: note });
  check('真实撤回重放保持取消且不生成来源排班', repeated.status === 'CANCELLED' && repeated.version === cancelled.version && sourceAssignments(cancelled.requestId).length === 0);
  fixture.completed['shift-cancel-draft'] = true;
  await save();
}

async function security() {
  const saved = Object.values(fixture.requests).find(value => value.endpoint === overtime && value.requestId);
  check('安全验收使用已经真实登记的申请', Boolean(saved));
  const requestId = identifier(saved.requestId);
  const before = await ok('employee', `${overtime}/${requestId}`);
  const fingerprint = () => JSON.stringify(single(`SELECT JSON_OBJECT('version',version,'status',status,
    'settlementStatus',settlement_status,'employeeId',CAST(employee_id AS CHAR),'instanceId',instance_id,
    'ledgerCount',(SELECT COUNT(*) FROM hr_leave_ledger WHERE tenant_id=100000 AND source_biz_type='HR_OVERTIME' AND source_biz_id=${sqlText(requestId)}),
    'changeCount',(SELECT COUNT(*) FROM hr_comp_change WHERE tenant_id=100000 AND source_biz_type='HR_OVERTIME' AND source_biz_id=${sqlText(requestId)}))
    FROM hr_overtime_request WHERE tenant_id=100000 AND request_id=${sqlText(requestId)}`));
  const original = fingerprint();
  const deny = async (actor, endpoint, method, body, label, missing = false) => {
    const response = await call(actor, endpoint, method, body);
    const forbidden = response.status === 403 && [403, 'FORBIDDEN'].includes(response.body?.code);
    const hidden = missing && response.status === 404 && response.body?.code === 'OVERTIME_NOT_FOUND';
    check(label, forbidden || hidden,
      { status: response.status, code: response.body?.code, traceId: response.traceId });
    check('权限拒绝后业务状态及来源数量不变', fingerprint() === original);
  };
  await deny('employee', overtime, 'GET', undefined, '员工不能读取HR管理加班列表');
  await deny('employee', shifts, 'GET', undefined, '员工不能读取HR管理调班列表');
  await deny('peer', `${overtime}/${requestId}`, 'GET', undefined, '同租户他人不能读取加班详情');
  await deny('tenantPeer', `${overtime}/${requestId}`, 'GET', undefined, '跨租户不能读取加班详情', true);
  await deny('peer', `${overtime}/${requestId}/settlement`, 'GET', undefined, '同租户他人不能读取加班结算');
  await deny('tenantPeer', `${overtime}/${requestId}/settlement`, 'GET', undefined, '跨租户不能读取加班结算', true);
  await deny('peer', `${overtime}/${requestId}`, 'PUT', { ...saved.input, version: before.version }, '他人不能修改本人加班申请');
  await deny('peer', `${overtime}/${requestId}?version=${before.version}`, 'DELETE', undefined, '他人不能删除本人加班申请');
  for (const action of ['submit', 'cancel']) {
    await deny('peer', `${overtime}/${requestId}/${action}`, 'POST', { version: before.version, ...(action === 'cancel' ? { reason: note } : {}) }, `他人不能执行申请动作：${action}`);
  }
  await deny('employee', `${overtime}/${requestId}/review-hours`, 'POST', { version: before.version, approvedMinutes: 1, note }, '员工不能核定自己的工时');
  await deny('employee', `${overtime}/${requestId}/review-pay`, 'POST', { version: before.version, hourlyRate: '20.00', payrollPeriodId: '1', note }, '员工不能核价自己的报酬');
  await deny('employee', `${overtime}/${requestId}/settlement/retry`, 'POST', { version: before.version, reason: note }, '员工不能触发内部结算重试');
  const replays = await Promise.all([1, 2].map(() => ok('employee', overtime, 'POST', saved.input, { 'Idempotency-Key': saved.key })));
  check('同键并发真实重放返回原申请及当前版本', replays.every(value => String(value.requestId) === requestId && value.version === before.version));
  const conflicting = await call('employee', overtime, 'POST', { ...saved.input, reason: `${saved.input.reason} 请求体冲突检查` }, { 'Idempotency-Key': saved.key });
  check('同键不同请求体返回409', conflicting.status === 409 && conflicting.body?.code === 'IDEMPOTENCY_CONFLICT',
    { status: conflicting.status, code: conflicting.body?.code, traceId: conflicting.traceId });
  check('并发及冲突重放不改变申请或账务', fingerprint() === original);
  const mine = rows(await ok('employee', `${overtime}/mine?employeeId=${employeeId('peer')}&pageSize=100`));
  check('本人列表忽略伪造员工筛选且不返回他人数据', mine.length > 0 && mine.every(value => String(value.employeeId) === employeeId('employee')));
  const salaryFields = ['hourlyRate', 'settlementAmount', 'hourlyRateCipher', 'settlementAmountCipher'];
  check('普通申请详情不含薪资敏感字段', salaryFields.every(field => !Object.hasOwn(before, field)));
  const oldEntry = await call('admin', '/hr/attendance/time-requests', 'POST', { employeeId: employeeId('employee'), requestType: 'OVERTIME',
    startTime: saved.input.startTime.replace('T', ' '), endTime: saved.input.endTime.replace('T', ' '), duration: '1.00', unit: 'HOUR', reason: note });
  check('方案A旧加班写入口明确拒绝', [400, 409].includes(oldEntry.status) && oldEntry.body?.code === 'OVERTIME_LEGACY_DISABLED',
    { status: oldEntry.status, code: oldEntry.body?.code, traceId: oldEntry.traceId });
  check('旧入口拒绝不新增旧加班记录', count(`SELECT COUNT(*) FROM hr_time_request WHERE tenant_id=100000
    AND employee_id=${sqlText(employeeId('employee'))} AND request_type='OVERTIME'`) === 0);
  fixture.completed.security = true;
  await save();
}


let failure;
try {
  await preflight();
  await attendance(); evidence.calendar = true;
  await overtimePhase(); evidence.approvalAndCompensatory = true;
  await compensatoryPhase(); evidence.cumulative = true;
  await shiftPhase(); evidence.shifts = true;
  await security(); evidence.security = true;
  await cards('employee', '2026-07-20', '09:00:00', '18:30:00');
  await verifyHrOvertimeInterface({ ...context, fixture, ok, call, note });
  const acceptance = { ...context, fixture, check, jsonRows, sqlText, until, pause, employeeId, note, ok, call, save,
    cards, configureTypes, approvalActors, draft, createRequest, setting, bindWorkflow, sourceAssignments,
    label, resource, lookup, recoverableOvertime, approveRequest, completedSettlement, completeWorkflowTask, enablePolicy };
  await verifyHrOvertimeCompLeave(acceptance);
  await verifyHrOvertimeLimits(acceptance);
  await verifyHrShiftSafety(acceptance);
  await verifyHrShiftRollback(acceptance);
  await verifyHrOvertimeAdjacent(acceptance);
  await verifyHrOvertimePayroll(acceptance);
  await verifyHrOvertimePeriods(acceptance);
  await verifyHrOvertimePayrollPeriods(acceptance);
} catch (error) { journal('core-failed', { name: error.name, message: String(error.message).split('\n')[0] }); failure = error; }
finally {
  const errors = [];
  const attempt = async operation => { try { await operation(); } catch (error) { errors.push(error); } };
  if (fixture.baseline && fixture.restorationRequired) {
    for (const original of fixture.baseline.types) await attempt(() => typeStatus(original.typeId, 0));
    await attempt(() => ok('admin', rulesPath + '/' + fixture.baseline.rule.id + '/enabled?enabled=0', 'PUT'));
    for (const key of configKeys) await attempt(() => setting(key, fixture.baseline.config[key].configValue));
    for (const original of fixture.baseline.types) await attempt(async () => {
      const current = await ok('hr', overtimeTypes + '/' + original.typeId);
      await ok('hr', overtimeTypes + '/' + original.typeId, 'PUT', { ...pick(original, typeFields), version: current.version });
    });
    await attempt(() => componentStatus(fixture.baseline.component.status));
  }
  fixture.restorationRequired = errors.length > 0;
  await save();
  journal('business-policy-restored', { passed: errors.length === 0, stages: fixture.completed });
  evidence.stages = fixture.completed;
  if (errors.length) failure = new AggregateError([failure, ...errors].filter(Boolean), 'Overtime policy restoration failed');
}
if (failure) throw failure;
}
