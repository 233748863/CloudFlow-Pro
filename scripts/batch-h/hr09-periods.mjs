import fs from 'node:fs/promises';
import path from 'node:path';
import { check, success, jsonRows, sqlText, until, readFixture, saveFixture, privateDirectory, pause } from './live-lib.mjs';
import { openHr09Actors } from './hr09-actors.mjs';
import { hundredths } from './hr09-evidence.mjs';

const overtime = '/hr/attendance/overtime-requests';
const periodPath = '/hr/attendance/leave/periods';
const actor = 'periodemployee';
const actorName = 'h_20260914_finance3';
const periodFields = ['periodName', 'startDate', 'endDate', 'status', 'defaultFlag', 'remark'];

export function periodActorPayload(snapshot, roleId, departmentId) {
  if (snapshot?.userId !== '28349057' || snapshot.username !== actorName || snapshot.tenantId !== '100000'
    || Number(snapshot.owned) !== 1 || snapshot.status !== '0' || !Number.isInteger(snapshot.version) || snapshot.version < 0
    || snapshot.roleIds?.length !== 1 || !['3', '5'].includes(snapshot.roleIds[0]) || !['3', '5'].includes(roleId)
    || !/^[1-9][0-9]*$/.test(String(departmentId))) throw new Error('H_HR_PERIOD_ACTOR_ISOLATION_REQUIRED');
  return { userId: snapshot.userId, version: snapshot.version, deptId: String(departmentId), status: snapshot.status, roleIds: [roleId] };
}

function actorSnapshot() {
  const rows = jsonRows(`SELECT JSON_OBJECT('userId',CAST(user_id AS CHAR),'deptId',CAST(dept_id AS CHAR),'username',user_name,
    'tenantId',CAST(tenant_id AS CHAR),'status',status,'version',version,'owned',create_by='H-20260914')
    FROM sys_user WHERE tenant_id=100000 AND user_id=28349057 AND deleted=0`);
  check('周期验收只借用本组现有隔离账号', rows.length === 1 && rows[0].username === actorName && Number(rows[0].owned) === 1);
  return { ...rows[0], roleIds: jsonRows(`SELECT JSON_OBJECT('id',CAST(role_id AS CHAR)) FROM sys_user_role
    WHERE tenant_id=100000 AND user_id=28349057 ORDER BY role_id`).map(row => row.id),
  postIds: jsonRows(`SELECT JSON_OBJECT('id',CAST(post_id AS CHAR)) FROM sys_user_post
    WHERE tenant_id=100000 AND user_id=28349057 ORDER BY post_id`).map(row => row.id) };
}

function actorMatches(current, expected) {
  return ['userId', 'deptId', 'username', 'tenantId', 'status'].every(field => current[field] === expected[field])
    && JSON.stringify(current.roleIds) === JSON.stringify(expected.roleIds) && JSON.stringify(current.postIds) === JSON.stringify(expected.postIds);
}

async function prepareActor(context) {
  const { fixture, sessions, ok, save } = context;
  const state = fixture.periodResolution;
  state.originalActor ||= actorSnapshot();
  check('周期申请人与两级审批人互异且原角色仅财务', state.originalActor.roleIds.length === 1
    && state.originalActor.roleIds[0] === '3' && Object.values(context.approvalActors || {}).every(name =>
      sessions.accounts[name]?.userId !== state.originalActor.userId));
  await save();
  const current = actorSnapshot();
  const department = sessions.accounts.employee.deptId;
  if (current.roleIds[0] !== '5' || current.deptId !== department) {
    await ok('admin', '/auth/system/user', 'PUT', periodActorPayload(current, '5', department));
  }
  check('周期验收仅替换为既有员工角色且不叠加权限', actorMatches(actorSnapshot(), {
    ...state.originalActor, deptId: department, roleIds: ['5'],
  }));
  const identities = JSON.parse(await fs.readFile(path.join(privateDirectory, 'accounts.private.json'), 'utf8')).payload.identities;
  const account = identities.finance3;
  check('周期借用沿用真实登录凭据且不重置密码', account.username === actorName && account.userId === state.originalActor.userId
    && account.changed === true && account.roleId === '3');
  const store = await readFixture('hr09-actors');
  store.accounts[actor] = { ...account, roleId: '5', sourceUserId: '5', deptId: department, passwordConfigured: true, borrowedFrom: 'finance3' };
  delete store.accounts[actor].storageState;
  await saveFixture('hr09-actors', store);
  await openHr09Actors(sessions, [actor], department);
}

function periodSnapshot(periodId) {
  const values = jsonRows(`SELECT JSON_OBJECT('periodId',CAST(period_id AS CHAR),'periodName',period_name,
    'startDate',CAST(start_date AS CHAR),'endDate',CAST(end_date AS CHAR),'status',status,'defaultFlag',default_flag,
    'remark',remark,'version',version) FROM hr_leave_period WHERE tenant_id=100000 AND period_id=${sqlText(periodId)} AND deleted=0`);
  check('周期配置只读依据唯一', values.length === 1);
  return values[0];
}

function periodMatches(actual, expected) {
  return periodFields.every(field => String(actual[field] ?? '') === String(expected[field] ?? ''));
}

async function setPeriod(context, original, status, allowBlocked = false) {
  const current = periodSnapshot(original.periodId);
  check('只更新本组独立历史周期且日期不变', current.periodName.startsWith(`${context.label || 'H-20260914-HR09'} period-`)
    && current.startDate === original.startDate && current.endDate === original.endDate);
  const payload = { ...Object.fromEntries(periodFields.map(field => [field, original[field]])), status, version: current.version };
  if (allowBlocked) return context.call('hr', `${periodPath}/${original.periodId}`, 'PUT', payload);
  if (periodMatches(current, payload)) return;
  await context.ok('hr', `${periodPath}/${original.periodId}`, 'PUT', payload);
  check('独立假期周期状态由真实API保存', periodMatches(periodSnapshot(original.periodId), payload));
}

async function prepareResources(context) {
  const { fixture, sessions, label, note, resource, lookup, save } = context;
  const state = fixture.periodResolution;
  const existing = jsonRows(`SELECT JSON_OBJECT('id',CAST(id AS CHAR),'own',employee_no=${sqlText(`${label}-period`)})
    FROM hr_employee WHERE tenant_id=100000 AND user_id=28349057 AND deleted=0`);
  check('周期历史员工只新增隔离记录且不改原员工', existing.length === 0 || existing.length === 1 && Number(existing[0].own) === 1);
  state.employeeId = await resource('period-employee', 'hr', '/hr/employees', { employeeNo: `${label}-period`, name: `${label} period employee`,
    gender: 'MALE', userId: state.originalActor.userId, deptId: sessions.accounts.employee.deptId, hireDate: '2025-01-01',
    employeeStatus: 'ACTIVE', employeeType: 'FULL_TIME' }, lookup('hr_employee', 'employee_no', `${label}-period`));
  for (const [name, startDate, endDate] of [['source', '2025-01-01', '2025-01-31'], ['closed-target', '2025-02-01', '2025-02-28']]) {
    const periodId = await resource(`period-${name}`, 'hr', periodPath, { periodName: `${label} period-${name}`, startDate, endDate,
      status: 'CLOSED', defaultFlag: 0, remark: note }, lookup('hr_leave_period', 'period_name', `${label} period-${name}`, 'period_id'));
    state[name] ||= periodSnapshot(periodId);
    check('独立周期初始停用且不覆盖既有周期', state[name].status === 'CLOSED' && state[name].startDate === startDate
      && state[name].endDate === endDate && Number(state[name].defaultFlag) === 0);
    await save();
  }
  state.target ||= periodSnapshot(fixture.ids.leavePeriod);
  check('补入目标沿用明确OPEN周期且不修改其配置', state.target.status === 'OPEN' && state.target.startDate > state.source.endDate);
  await resource('period-shift', 'hr', '/hr/attendance/shifts', { shiftCode: `${label}-period`, shiftName: `${label} period`,
    startTime: '09:00:00', endTime: '17:00:00', breakMinutes: 0, workMinutes: 480, checkinWindowBeforeMinutes: 90,
    checkoutWindowAfterMinutes: 120, lateGraceMinutes: 0, earlyExitGraceMinutes: 0, halfDayHoursThreshold: '4', absentHoursThreshold: '2',
    workingHoursCalcMode: 'PAIRED', checkinDetermineMode: 'ALTERNATING', holidayCalendarId: fixture.ids.calendar,
    autoAttendanceFlag: 1, processAttendanceAfter: '2025-01-01', markOnHolidayFlag: 0, overtimeThresholdMinutes: 30, status: 1,
  }, lookup('hr_shift', 'shift_code', `${label}-period`));
  await resource('period-rule', 'hr', '/hr/attendance/rules', { ruleCode: `${label}-period`, ruleName: `${label} period`,
    ruleType: 'FIXED', shiftId: fixture.ids['period-shift'], checkMethods: ['APP'], configJson: {}, status: 1,
  }, lookup('hr_attendance_rule', 'rule_code', `${label}-period`));
  await resource('period-schedule', 'admin', '/hr/attendance/schedules', { targetType: 'EMPLOYEE', targetId: state.employeeId,
    shiftId: fixture.ids['period-shift'], ruleId: fixture.ids['period-rule'], effectiveStart: '2025-01-01', effectiveEnd: '2025-01-31', status: 'PUBLISHED',
  }, `SELECT JSON_OBJECT('id',CAST(id AS CHAR)) FROM hr_schedule_assignment WHERE tenant_id=100000 AND target_type='EMPLOYEE'
    AND target_id=${sqlText(state.employeeId)} AND effective_start='2025-01-01' AND source_shift_request_id IS NULL`);
  await save();
}

async function sourceRequest(context, name, date) {
  const { fixture, ok, save, label, note, draft, createRequest } = context;
  const state = fixture.periodResolution;
  state.requests ||= {};
  state.attempts ||= {};
  if (state.requests[name]) {
    const existing = await ok(actor, `${overtime}/${state.requests[name]}`);
    if (!['CANCELLED', 'REJECTED'].includes(existing.status)) return existing;
    state.retiredRequestIds ||= [];
    state.retiredRequestIds.push(String(existing.requestId));
    delete state.requests[name];
    state.attempts[name] = (state.attempts[name] || 1) + 1;
    await save();
  }
  for (const [logType, time] of [['IN', '09:00:00'], ['OUT', '18:00:00']]) {
    const existing = jsonRows(`SELECT JSON_OBJECT('id',CAST(checkin_id AS CHAR)) FROM hr_attendance_checkin
      WHERE tenant_id=100000 AND employee_id=${sqlText(state.employeeId)} AND check_time=${sqlText(`${date} ${time}`)} AND log_type=${sqlText(logType)}`);
    check('周期申请仅使用本员工真实隔离成对卡', existing.length <= 1);
    if (!existing.length) await ok('admin', '/hr/attendance/checkins', 'POST', { employeeId: state.employeeId, logType,
      checkTime: `${date} ${time}`, shiftId: fixture.ids['period-shift'], checkMethod: 'MANUAL', deviceId: label, remark: note });
  }
  const current = await createRequest(`period-${name}-${state.attempts[name] || 1}`, overtime,
    draft(date, '17:30', '17:31', 'COMPENSATORY', `${note} PERIOD-${name}`), actor);
  state.requests[name] = String(current.requestId);
  await save();
  return current;
}

function sourceState(requestId) {
  const rows = jsonRows(`SELECT JSON_OBJECT('requestId',CAST(request_id AS CHAR),'employeeId',CAST(employee_id AS CHAR),'status',status,
    'settlementStatus',settlement_status,'actualMinutes',actual_minutes,'approvedMinutes',approved_minutes,
    'leavePeriodId',CAST(leave_period_id AS CHAR),'settledFlag',settled_flag,'version',version,
    'ledgerId',CAST(leave_ledger_id AS CHAR),'quantity',CAST(compensatory_quantity AS CHAR),
    'policyDigest',SHA2(policy_snapshot,256),'calculationDigest',SHA2(JSON_REMOVE(calculation_snapshot,'$.rounding'),256))
    FROM hr_overtime_request WHERE tenant_id=100000 AND request_id=${sqlText(requestId)} AND deleted=0`);
  check('周期处置来源单真实存在且唯一', rows.length === 1);
  return rows[0];
}

function noSourceLedger(requestId) {
  return Number(jsonRows(`SELECT JSON_OBJECT('count',COUNT(*)) FROM hr_leave_ledger WHERE tenant_id=100000
    AND source_biz_type='HR_OVERTIME' AND source_biz_id=${sqlText(requestId)}`)[0].count) === 0;
}

async function cancelSource(context, requestId) {
  await until(async () => {
    const current = await context.ok(actor, `${overtime}/${requestId}`);
    if (current.status === 'CANCELLED') return current;
    check('周期恢复仅撤回本组未批准申请', ['DRAFT', 'SUBMITTED', 'PENDING', 'APPROVING'].includes(current.status)
      && Object.values(context.fixture.periodResolution.requests).includes(String(requestId)));
    const response = await context.call(actor, `${overtime}/${requestId}/cancel`, 'POST', { version: current.version, reason: context.note });
    if (response.status === 409 && response.body?.code === 'VERSION_CONFLICT') return null;
    return success(response, '周期申请按最新真实版本撤回');
  }, current => current?.status === 'CANCELLED', '周期申请异步启动后真实撤回', 30000);
  check('周期恢复通过真实撤回结束未批准单且未造账', sourceState(requestId).status === 'CANCELLED' && noSourceLedger(requestId));
}

async function resolveSource(context, name, expectedCredit) {
  const { fixture, sessions, ok, call, note, save } = context;
  const settlementActor = context.approvalActors.reviewer;
  const state = fixture.periodResolution;
  const requestId = state.requests[name];
  if (state.completed?.[name]) {
    const current = sourceState(requestId);
    check('周期处置复跑复用既有真实终局不重新批准或入账', current.status === 'APPROVED'
      && current.settlementStatus === (name === 'reject' ? 'REJECTED' : 'SETTLED'));
    return;
  }
  let settlement = await ok(actor, `${overtime}/${requestId}/settlement`);
  const before = sourceState(requestId);
  const input = { version: settlement.version, reason: note, action: name === 'reject' ? 'REJECT' : 'COMPENSATORY_ADJUSTMENT',
    ...(name === 'reject' ? {} : { targetPeriodId: state.target.periodId }) };
  const resumingCommitted = ['SETTLED', 'REJECTED'].includes(settlement.settlementStatus);
  if (resumingCommitted) {
    check('验收中断后的已提交处置仅复核既有结果', settlement.settlementStatus === (name === 'reject' ? 'REJECTED' : 'SETTLED')
      && before.status === 'APPROVED' && before.actualMinutes === 1 && before.approvedMinutes === 1, { requestId });
  } else {
    check('原周期真实关闭后保留批准工时且转待明确处置', settlement.settlementStatus === 'NEEDS_RESOLUTION'
      && settlement.lastErrorCode === 'PERIOD_CLOSED' && settlement.settledFlag === 0 && noSourceLedger(requestId));
    const retry = await call(settlementActor, `${overtime}/${requestId}/settlement/retry`, 'POST', { version: settlement.version, reason: note });
    check('永久关闭周期拒绝普通重试且不增加来源台账', retry.body?.code === 'RESOLUTION_REQUIRED' && noSourceLedger(requestId));
    const self = await call(actor, `${overtime}/${requestId}/settlement/resolve`, 'POST', input);
    check('原申请人不能处置本人调休结算', self.status === 403 || [403, 'FORBIDDEN'].includes(self.body?.code));
    if (name !== 'reject') {
      const closed = await call(settlementActor, `${overtime}/${requestId}/settlement/resolve`, 'POST', { ...input, targetPeriodId: state['closed-target'].periodId });
      check('明确补入已关闭新目标保持待处置且无部分流水', closed.status === 409 && closed.body?.code === 'TARGET_PERIOD_CLOSED'
        && (await ok(actor, `${overtime}/${requestId}/settlement`)).settlementStatus === 'NEEDS_RESOLUTION' && noSourceLedger(requestId)
        && JSON.stringify(sourceState(requestId)) === JSON.stringify(before), { status: closed.status, code: closed.body?.code, traceId: closed.traceId });
    }
    settlement = await ok(settlementActor, `${overtime}/${requestId}/settlement/resolve`, 'POST', input);
  }
  const after = sourceState(requestId);
  check('明确处置保留原核定分钟原周期及冻结证据', after.status === 'APPROVED' && after.actualMinutes === before.actualMinutes
    && after.approvedMinutes === before.approvedMinutes && after.leavePeriodId === before.leavePeriodId
    && after.policyDigest === before.policyDigest && after.calculationDigest === before.calculationDigest);
  check('处置说明记录真实经办人与原目标且不改写原快照', settlement.resolution?.action === input.action
    && String(settlement.resolution?.originalPeriodId) === state.source.periodId
    && String(settlement.resolution?.operatorId) === sessions.accounts[settlementActor].userId && Boolean(settlement.resolution?.handledTime));
  if (name === 'reject') {
    check('终止仅结束自动结算并保留批准工时且不造账', after.settlementStatus === 'REJECTED' && after.settledFlag === 0
      && after.actualMinutes === 1 && after.approvedMinutes === 1 && noSourceLedger(requestId));
  } else {
    const ledgers = jsonRows(`SELECT JSON_OBJECT('id',CAST(ledger_id AS CHAR),'periodId',CAST(leave_period_id AS CHAR),
      'employeeId',CAST(employee_id AS CHAR),'type',transaction_type,'unit',quantity_unit,'quantity',CAST(leave_days AS CHAR),
      'sourceKey',source_event_key) FROM hr_leave_ledger WHERE tenant_id=100000 AND source_biz_type='HR_OVERTIME' AND source_biz_id=${sqlText(requestId)}`);
    check('明确补入仅一笔真实COMPENSATORY流水且沿用正常来源键', after.settlementStatus === 'SETTLED' && after.settledFlag === 1
      && ledgers.length === 1 && ledgers[0].id === after.ledgerId && ledgers[0].periodId === state.target.periodId
      && ledgers[0].employeeId === state.employeeId && ledgers[0].type === 'COMPENSATORY' && ledgers[0].unit === 'HOUR'
      && ledgers[0].sourceKey === `HR_OVERTIME:${requestId}:COMPENSATORY` && hundredths(ledgers[0].quantity) === hundredths(expectedCredit)
      && hundredths(after.quantity) === hundredths(expectedCredit));
    check('新目标补入仍归原周期累计组不重新舍入', String(settlement.rounding?.sourcePeriodId) === state.source.periodId
      && settlement.rounding?.rawMinutes === 1 && hundredths(settlement.rounding.currentCreditHours) === hundredths(expectedCredit));
  }
  await pause(5100);
  const replay = await call(settlementActor, `${overtime}/${requestId}/settlement/resolve`, 'POST', { ...input, version: after.version });
  check('处置重放业务拒绝且不重复改变批准结果或账务', replay.body?.code === 'RESOLUTION_NOT_ALLOWED'
    && JSON.stringify(sourceState(requestId)) === JSON.stringify(after));
  state.completed ||= {};
  state.completed[name] = true;
  await save();
}

export async function runPeriodResolution(context) {
  const { fixture, sessions, ok, call, save, note, approvalActors, bindWorkflow, approveRequest } = context;
  const state = fixture.periodResolution ||= { requests: {}, completed: {} };
  const replayingCompletedBusiness = ['adjust-first', 'adjust-second', 'reject'].every(name => state.completed[name]);
  state.restorationRequired = true;
  await save();
  await prepareActor(context);
  check('周期处置经办人排除原申请人且使用既有业务角色', sessions.accounts[approvalActors.reviewer].userId !== state.originalActor.userId
    && sessions.accounts[approvalActors.reviewer].roleId === '4');
  await prepareResources(context);
  await setPeriod(context, state.source, 'CLOSED');
  let blocked = await sourceRequest(context, 'closed-before-review', '2025-01-09');
  if (blocked.status === 'DRAFT') blocked = await ok(actor, `${overtime}/${blocked.requestId}/submit`, 'POST', { version: blocked.version });
  if (blocked.status !== 'CANCELLED') {
    const result = await call(approvalActors.reviewer, `${overtime}/${blocked.requestId}/review-hours`, 'POST', { version: blocked.version, approvedMinutes: 1, note });
    check('核定前关闭唯一目标真实阻止核定且未启动审批', result.status === 409 && result.body?.code === 'LEAVE_PERIOD_MISSING'
      && (await ok(actor, `${overtime}/${blocked.requestId}`)).approvedMinutes == null && noSourceLedger(blocked.requestId));
    state.completed['closed-before-review'] = true;
    await save();
    await cancelSource(context, String(blocked.requestId));
  }
  const unfinished = ['adjust-first', 'adjust-second', 'reject'].filter(name => !state.completed[name]);
  const prepareNames = unfinished.filter(name => !state.requests[name] || !['APPROVED'].includes(sourceState(state.requests[name]).status));
  if (prepareNames.length) {
    await setPeriod(context, state.source, 'OPEN');
    for (const [name, date] of [['adjust-first', '2025-01-06'], ['adjust-second', '2025-01-07'], ['reject', '2025-01-08']]) {
      if (!prepareNames.includes(name)) continue;
      let current = await sourceRequest(context, name, date);
      if (current.status === 'DRAFT') current = await ok(actor, `${overtime}/${current.requestId}/submit`, 'POST', { version: current.version });
      if (current.approvedMinutes == null) current = await ok(approvalActors.reviewer, `${overtime}/${current.requestId}/review-hours`, 'POST', {
        version: current.version, approvedMinutes: 1, note,
      });
      check('调休处置先按真实卡点核定并冻结原开放周期', current.actualMinutes === 1 && current.approvedMinutes === 1
        && sourceState(current.requestId).leavePeriodId === state.source.periodId);
      await bindWorkflow(overtime, current.requestId, 'overtime', actor);
    }
    const closure = await setPeriod(context, state.source, 'CLOSED', true);
    state.closureGuardEvidence = { checkedAt: new Date().toISOString(), status: closure.status, code: closure.body?.code,
      guarded: closure.body?.code === 'OVERTIME_SETTLEMENT_PENDING', traceId: closure.traceId };
    await save();
    if (state.closureGuardEvidence.guarded) {
      check('未结算加班真实阻止管理接口关闭原周期', periodSnapshot(state.source.periodId).status === 'OPEN');
      throw new Error('H_HR_PERIOD_LEGACY_RESOLUTION_FIXTURE_REQUIRED');
    }
    check('管理关账缺口只在本组空台账隔离周期复现', closure.status === 200 && closure.body?.code === 200
      && periodSnapshot(state.source.periodId).status === 'CLOSED');
    for (const name of prepareNames) {
      await approveRequest(overtime, state.requests[name], 'overtime', actor);
      await until(() => ok(actor, `${overtime}/${state.requests[name]}/settlement`), value => value.settlementStatus === 'NEEDS_RESOLUTION', '真实关闭周期永久失败状态');
    }
    state.legacyFixtureOrigin = 'REAL_API_CLOSURE_GUARD_DEFECT';
    await save();
  }
  await resolveSource(context, 'adjust-first', '0.01');
  await resolveSource(context, 'adjust-second', '0.02');
  await resolveSource(context, 'reject', null);
  const records = ['adjust-first', 'adjust-second', 'reject'].map(name => sourceState(state.requests[name]));
  check('结案不释放已经批准的实际工时且原周期仍保留', records.length === 3 && records.every(row => row.status === 'APPROVED'
    && row.actualMinutes === 1 && row.leavePeriodId === state.source.periodId));
  state.businessEvidence = { checkedAt: new Date().toISOString(), closedBeforeReviewBlocked: true, realDualApprovals: 3,
    adjustedRequestCount: 2, rejectedRequestCount: 1, originalActualMinutesRetained: 3,
    originalPeriodId: state.source.periodId, targetPeriodId: state.target.periodId, cumulativeCreditHours: '0.03',
    ordinaryRetryBlocked: true, closedTargetBlocked: true, selfResolutionBlocked: true, duplicateResolutionBlocked: true };
  fixture.completed['comp-period-resolution'] = true;
  await save();
  if (replayingCompletedBusiness || state.closureGuardEvidence?.guarded !== true) {
    await setPeriod(context, state.source, 'OPEN');
    let current = await sourceRequest(context, 'closing-guard', '2025-01-10');
    if (current.status === 'DRAFT') current = await ok(actor, `${overtime}/${current.requestId}/submit`, 'POST', { version: current.version });
    if (current.approvedMinutes == null) current = await ok(approvalActors.reviewer, `${overtime}/${current.requestId}/review-hours`, 'POST', {
      version: current.version, approvedMinutes: 1, note,
    });
    await bindWorkflow(overtime, current.requestId, 'overtime', actor);
    const before = periodSnapshot(state.source.periodId);
    const closure = await setPeriod(context, state.source, 'CLOSED', true);
    state.closureGuardEvidence = { checkedAt: new Date().toISOString(), status: closure.status, code: closure.body?.code,
      guarded: closure.body?.code === 'OVERTIME_SETTLEMENT_PENDING', traceId: closure.traceId };
    await save();
    check('关闭保护保持开放周期版本及既有账务不变', state.closureGuardEvidence.guarded
      && periodSnapshot(state.source.periodId).status === 'OPEN' && periodSnapshot(state.source.periodId).version === before.version
      && noSourceLedger(current.requestId));
  }
  check('管理关闭接口不得绕过未结算加班保护', state.closureGuardEvidence?.guarded === true);
  fixture.completed['period-resolution'] = true;
  await save();
}

export async function restorePeriodResolution(context) {
  const { fixture, sessions, ok, save, note } = context;
  const state = fixture?.periodResolution;
  if (!state?.originalActor) return;
  if (state.restorationRequired) {
    try {
      const unfinished = Object.values(state.requests || {}).filter(requestId => ['DRAFT', 'SUBMITTED', 'PENDING', 'APPROVING'].includes(sourceState(requestId).status));
      if (unfinished.length && !sessions[actor]) await prepareActor(context);
      for (const requestId of unfinished) await cancelSource(context, requestId);
      for (const name of ['source', 'closed-target']) if (state[name]) await setPeriod(context, state[name], state[name].status);
    } finally {
      const current = actorSnapshot();
      if (!actorMatches(current, state.originalActor)) await ok('admin', '/auth/system/user', 'PUT',
        periodActorPayload(current, state.originalActor.roleIds[0], state.originalActor.deptId));
    }
  }
  const restored = actorSnapshot();
  check('周期借用身份角色部门岗位及启用状态精确恢复', actorMatches(restored, state.originalActor));
  for (const name of ['source', 'closed-target', 'target']) if (state[name]) check('调休原目标候选目标及实际目标政策逐字段精确恢复',
    periodMatches(periodSnapshot(state[name].periodId), state[name]));
  state.restorationRequired = false;
  state.restorationEvidence = { checkedAt: new Date().toISOString(), exact: true, actorRestored: true, addedUserCount: 0,
    sourcePeriodStatus: state.source?.status ?? null, candidatePeriodStatus: state['closed-target']?.status ?? null,
    targetPeriodUnchanged: Boolean(state.target), retainedEmployeeId: state.employeeId || null,
    retainedRequestIds: [...Object.values(state.requests || {}), ...(state.retiredRequestIds || [])], originalEmployeesUntouched: true, noSalaryWrites: true };
  await save();
}
