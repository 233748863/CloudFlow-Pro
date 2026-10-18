import { createHash } from 'node:crypto';
import { hundredths } from './batch-h/hr09-evidence.mjs';
import { resolveHrOvertimePeriodFromPage } from './verify-hr-overtime-period-ui.mjs';

// Only a newly created period is made CLOSED below as a legacy-state fixture.
// Normal close protection, approvals, settlement and explicit resolution use real APIs.
export async function verifyHrOvertimePeriods(context) {
  const { fixture, database, jsonRows, sqlText, check, ok, call, resource, lookup, save, label, note,
    employeeId, configureTypes, enablePolicy, createRequest, draft, bindWorkflow, approveRequest, until, pause, journal, sessions } = context;
  const path = '/hr/attendance/leave/periods', overtime = '/hr/attendance/overtime-requests';
  const owner = employeeId('employee'), actor = 'employee', reviewer = 'hr';
  const state = fixture.periodResolution = { requests: {}, completed: {}, restorationRequired: true };
  const originalBound = database('SELECT COALESCE(MAX(period_id),0) FROM hr_leave_period');
  const digest = statement => createHash('sha256').update(database(statement)).digest('hex');
  const originalPeriods = () => digest(`SELECT * FROM hr_leave_period WHERE period_id<=${originalBound} ORDER BY period_id`);
  const periodsBefore = originalPeriods();
  const snapshot = id => jsonRows(`SELECT JSON_OBJECT('id',CAST(period_id AS CHAR),'name',period_name,'start',CAST(start_date AS CHAR),
    'end',CAST(end_date AS CHAR),'status',status,'defaultFlag',default_flag,'version',version) FROM hr_leave_period
    WHERE tenant_id=100000 AND period_id=${sqlText(id)} AND deleted=0`)[0];
  const periodDigest = id => digest(`SELECT * FROM hr_leave_period WHERE tenant_id=100000 AND period_id=${sqlText(id)}`);
  const canonical = value => {
    if (typeof value === 'number' && (!Number.isFinite(value) || Number.isInteger(value) && !Number.isSafeInteger(value))) throw new Error('Unsafe snapshot number');
    if (Array.isArray(value)) return value.map(canonical);
    if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
    return value;
  };
  const source = id => {
    const row = jsonRows(`SELECT JSON_OBJECT('id',CAST(request_id AS CHAR),'employee',CAST(employee_id AS CHAR),'status',status,
    'settlement',settlement_status,'actual',actual_minutes,'approved',approved_minutes,'period',CAST(leave_period_id AS CHAR),
    'settled',settled_flag,'version',version,'ledger',CAST(leave_ledger_id AS CHAR),'quantity',CAST(compensatory_quantity AS CHAR),
    'policy',SHA2(policy_snapshot,256),'calculationRaw',SHA2(JSON_REMOVE(calculation_snapshot,'$.rounding'),256),
    'calculationValue',JSON_REMOVE(calculation_snapshot,'$.rounding'))
    FROM hr_overtime_request WHERE tenant_id=100000 AND request_id=${sqlText(id)} AND deleted=0`)[0];
    // Adding the result's rounding node reserializes JSON numbers (2.0 -> 2).
    // Compare every original field/value, retaining a separate byte-format digest.
    row.calculation = createHash('sha256').update(JSON.stringify(canonical(row.calculationValue))).digest('hex');
    delete row.calculationValue;
    return row;
  };
  const ledgers = id => jsonRows(`SELECT JSON_OBJECT('id',CAST(ledger_id AS CHAR),'period',CAST(leave_period_id AS CHAR),
    'employee',CAST(employee_id AS CHAR),'type',transaction_type,'unit',quantity_unit,'quantity',CAST(leave_days AS CHAR),
    'key',source_event_key) FROM hr_leave_ledger WHERE tenant_id=100000 AND source_biz_type='HR_OVERTIME'
      AND source_biz_id=${sqlText(id)} ORDER BY ledger_id`);
  const setPeriod = async (key, status, allowDenied = false) => {
    const id = state.periods[key], current = snapshot(id), body = state.periodBodies[key];
    check('只更新本轮新建且日期未变的独立周期', BigInt(id) > BigInt(originalBound) && current.name === body.periodName
      && current.start === body.startDate && current.end === body.endDate && current.defaultFlag === 0);
    const payload = { ...body, status, version: current.version };
    if (allowDenied) return call(reviewer, `${path}/${id}`, 'PUT', payload);
    if (current.status !== status) await ok(reviewer, `${path}/${id}`, 'PUT', payload);
    check('独立周期配置已通过真实接口保存', snapshot(id).status === status);
  };
  const cancel = async id => {
    const row = await ok(actor, `${overtime}/${id}`);
    if (['DRAFT', 'SUBMITTED', 'PENDING', 'APPROVING'].includes(row.status)) {
      await ok(actor, `${overtime}/${id}/cancel`, 'POST', { version: row.version, reason: note + '周期验收收尾' });
      await until(() => ok(actor, `${overtime}/${id}`), value => value.status === 'CANCELLED', '本轮周期申请撤回');
      if (row.instanceId) await until(() => database(`SELECT status FROM wf_process_instance WHERE tenant_id=100000 AND instance_id=${sqlText(row.instanceId)}`),
        value => !['RUNNING', 'PAUSED', 'PENDING', 'FAILED', 'RESTARTED'].includes(value), '原周期审批收尾');
    }
  };
  let failure;
  try {
    await save();
    await enablePolicy();
    await configureTypes({ compensatoryRatio: '1.00', compensatoryLeaveTypeId: fixture.ids.leaveType });
    const ranges = jsonRows("SELECT JSON_OBJECT('start',CAST(start_date AS CHAR),'end',CAST(end_date AS CHAR)) FROM hr_leave_period WHERE tenant_id=100000 AND deleted=0");
    const month = Array.from({ length: 12 }, (_, index) => String(index + 1).padStart(2, '0')).find(value => {
      const start = `2025-${value}-01`, end = new Date(Date.UTC(2025, Number(value), 0)).toISOString().slice(0, 10);
      return !ranges.some(row => row.start <= end && row.end >= start);
    });
    check('只选择没有任何既有周期的2025年完整月份', Boolean(month));
    const prefix = '2025-' + month, end = new Date(Date.UTC(2025, Number(month), 0)).toISOString().slice(0, 10);
    const dates = Array.from({ length: 10 }, (_, index) => prefix + '-' + String(index + 1).padStart(2, '0'))
      .filter(date => ![0, 6].includes(new Date(date + 'T00:00:00Z').getUTCDay())).slice(0, 4);
    check('本轮历史员工在岗且四个来源日均为工作日', dates.length === 4
      && database(`SELECT COUNT(*) FROM hr_employee WHERE tenant_id=100000 AND id=${owner} AND hire_date<='${dates[0]}' AND employee_status='ACTIVE' AND deleted=0`) === '1');
    state.month = prefix; state.periods = {}; state.periodBodies = {};
    for (const [key, startDate, endDate, status] of [['source', prefix + '-01', prefix + '-10', 'CLOSED'],
      ['closedTarget', prefix + '-11', prefix + '-20', 'CLOSED'], ['target', prefix + '-21', end, 'OPEN']]) {
      const body = { periodName: `${label} period-${key}`, startDate, endDate, status, defaultFlag: 0, remark: note };
      state.periodBodies[key] = body;
      state.periods[key] = await resource('period-' + key, reviewer, path, body, lookup('hr_leave_period', 'period_name', body.periodName, 'period_id'));
      await save();
      check('三段独立周期按初始状态创建且不覆盖原周期', BigInt(state.periods[key]) > BigInt(originalBound)
        && snapshot(state.periods[key]).status === status && originalPeriods() === periodsBefore);
    }
    await resource('period-shift', reviewer, '/hr/attendance/shifts', { shiftCode: label + '-period', shiftName: label + ' historical',
      startTime: '09:00:00', endTime: '17:00:00', breakMinutes: 0, workMinutes: 480, checkinWindowBeforeMinutes: 90,
      checkoutWindowAfterMinutes: 120, lateGraceMinutes: 0, earlyExitGraceMinutes: 0, halfDayHoursThreshold: '4', absentHoursThreshold: '2',
      workingHoursCalcMode: 'PAIRED', checkinDetermineMode: 'ALTERNATING', holidayCalendarId: fixture.ids.calendar,
      autoAttendanceFlag: 1, processAttendanceAfter: '2025-01-01', markOnHolidayFlag: 0, overtimeThresholdMinutes: 30, status: 1 },
    lookup('hr_shift', 'shift_code', label + '-period'));
    await resource('period-rule', reviewer, '/hr/attendance/rules', { ruleCode: label + '-period', ruleName: label + ' historical',
      ruleType: 'FIXED', shiftId: fixture.ids['period-shift'], checkMethods: ['APP'], configJson: {}, status: 1 },
    lookup('hr_attendance_rule', 'rule_code', label + '-period'));
    await resource('period-schedule', 'admin', '/hr/attendance/schedules', { targetType: 'EMPLOYEE', targetId: owner,
      shiftId: fixture.ids['period-shift'], ruleId: fixture.ids['period-rule'], effectiveStart: prefix + '-01', effectiveEnd: prefix + '-10', status: 'PUBLISHED' },
    `SELECT JSON_OBJECT('id',CAST(id AS CHAR)) FROM hr_schedule_assignment WHERE tenant_id=100000 AND target_type='EMPLOYEE'
      AND target_id=${owner} AND effective_start='${prefix}-01' AND source_shift_request_id IS NULL`);
    const request = async (name, date) => {
      for (const [logType, time] of [['IN', '09:00:00'], ['OUT', '18:00:00']]) await ok('admin', '/hr/attendance/checkins', 'POST', {
        employeeId: owner, logType, checkTime: `${date} ${time}`, shiftId: fixture.ids['period-shift'], checkMethod: 'MANUAL', deviceId: label, remark: note });
      const row = await createRequest('period-' + name, overtime, draft(date, '17:30', '17:31', 'COMPENSATORY', note + ' ' + name), actor);
      const id = String(row.requestId); state.requests[name] = id; await save();
      return ok(actor, `${overtime}/${id}/submit`, 'POST', { version: row.version });
    };
    const blocked = await request('closedBeforeReview', dates[0]);
    const beforeReview = source(String(blocked.requestId));
    const denied = await call(reviewer, `${overtime}/${blocked.requestId}/review-hours`, 'POST', { version: blocked.version, approvedMinutes: 1, note });
    check('唯一目标已关闭时真实核时拒绝且没有审批或入账', denied.status === 409 && denied.body?.code === 'LEAVE_PERIOD_MISSING'
      && JSON.stringify(source(String(blocked.requestId))) === JSON.stringify(beforeReview) && ledgers(String(blocked.requestId)).length === 0);
    await cancel(String(blocked.requestId));
    await setPeriod('source', 'OPEN');
    for (const [index, name] of ['adjustFirst', 'adjustSecond', 'reject'].entries()) {
      const current = await request(name, dates[index + 1]);
      const reviewed = await ok(reviewer, `${overtime}/${current.requestId}/review-hours`, 'POST', { version: current.version, approvedMinutes: 1, note });
      check('真实卡点核定一分钟并冻结原开放周期', reviewed.actualMinutes === 1 && reviewed.approvedMinutes === 1
        && source(String(current.requestId)).period === state.periods.source);
      await bindWorkflow(overtime, String(current.requestId), 'overtime', actor);
    }
    const beforeClose = periodDigest(state.periods.source);
    const closure = await setPeriod('source', 'CLOSED', true);
    check('正常配置入口拒绝关闭待结算周期且全部列不改', closure.status === 400 && closure.body?.code === 'OVERTIME_SETTLEMENT_PENDING'
      && periodDigest(state.periods.source) === beforeClose);
    // Explicit fault input: bypassed/legacy closure, never a claim that normal close succeeded.
    const current = snapshot(state.periods.source), body = state.periodBodies.source;
    check('历史异常注入仅命中本轮新建的唯一开放空台账周期', current.status === 'OPEN' && current.name === body.periodName
      && BigInt(current.id) > BigInt(originalBound) && database(`SELECT COUNT(*) FROM hr_leave_ledger WHERE tenant_id=100000 AND leave_period_id=${sqlText(current.id)}`) === '0');
    state.legacyInput = { origin: 'OWNED_PERIOD_STATUS_FAULT', periodId: current.id, beforeHash: beforeClose, beforeVersion: current.version };
    await save(); journal('period-legacy-input-before', state.legacyInput);
    const changed = database(`UPDATE hr_leave_period SET status='CLOSED',version=version+1 WHERE tenant_id=100000 AND period_id=${sqlText(current.id)}
      AND period_id>${originalBound} AND period_name=${sqlText(body.periodName)} AND start_date='${body.startDate}' AND end_date='${body.endDate}'
      AND status='OPEN' AND version=${current.version} AND default_flag=0 AND deleted=0; SELECT ROW_COUNT()`);
    check('本轮历史状态输入恰修改一条新建周期且保留原周期', changed === '1' && snapshot(current.id).status === 'CLOSED'
      && snapshot(current.id).version === current.version + 1 && originalPeriods() === periodsBefore);
    state.legacyInput.afterHash = periodDigest(current.id); await save(); journal('period-legacy-input-after', state.legacyInput);
    for (const name of ['adjustFirst', 'adjustSecond', 'reject']) {
      const id = state.requests[name]; await approveRequest(overtime, id, 'overtime', actor);
      const result = await until(() => ok(actor, `${overtime}/${id}/settlement`), value => ['NEEDS_RESOLUTION', 'FAILED', 'SETTLED'].includes(value.settlementStatus), '关闭周期真实结算事件');
      check('真实两级审批后已关闭原周期进入待人工处置且未造账', result.settlementStatus === 'NEEDS_RESOLUTION'
        && result.lastErrorCode === 'PERIOD_CLOSED' && result.settledFlag === 0 && source(id).status === 'APPROVED' && ledgers(id).length === 0);
    }
    for (const [name, credit] of [['adjustFirst', '0.01'], ['adjustSecond', '0.02'], ['reject', null]]) {
      const id = state.requests[name], before = source(id);
      const input = { version: before.version, reason: note, action: credit === null ? 'REJECT' : 'COMPENSATORY_ADJUSTMENT',
        ...(credit === null ? {} : { targetPeriodId: state.periods.target }) };
      const retry = await call(reviewer, `${overtime}/${id}/settlement/retry`, 'POST', { version: before.version, reason: note });
      check('关闭周期拒绝普通重试且批准原件不变', retry.status === 409 && retry.body?.code === 'RESOLUTION_REQUIRED'
        && JSON.stringify(source(id)) === JSON.stringify(before) && ledgers(id).length === 0);
      const self = await call(actor, `${overtime}/${id}/settlement/resolve`, 'POST', input);
      check('申请人不能自行处置已批准调休结算', self.status === 403 && JSON.stringify(source(id)) === JSON.stringify(before));
      if (credit !== null) {
        const closed = await call(reviewer, `${overtime}/${id}/settlement/resolve`, 'POST', { ...input, targetPeriodId: state.periods.closedTarget });
        check('补入关闭目标真实拒绝并整笔保持原件', closed.status === 409 && closed.body?.code === 'TARGET_PERIOD_CLOSED'
          && JSON.stringify(source(id)) === JSON.stringify(before) && ledgers(id).length === 0);
      }
      const settled = await resolveHrOvertimePeriodFromPage(context, name, input), after = source(id);
      state.resolutions ||= {};
      state.resolutions[name] = { before, after, numericFormatChanged: before.calculationRaw !== after.calculationRaw };
      await save();
      check('人工处置保留原批准工时原周期及冻结依据', after.status === 'APPROVED' && after.actual === 1 && after.approved === 1
        && after.period === before.period && after.policy === before.policy && after.calculation === before.calculation);
      check('处置记录包含真实经办人原周期及明确动作', settled.resolution?.action === input.action
        && String(settled.resolution.originalPeriodId) === state.periods.source
        && String(settled.resolution.operatorId) === sessions.accounts[reviewer].userId && Boolean(settled.resolution.handledTime));
      const rows = ledgers(id);
      if (credit === null) check('明确终止仅结束结算且保留批准工时无台账', after.settlement === 'REJECTED' && after.settled === 0 && rows.length === 0);
      else {
        check('补入新开放目标仅一笔独立来源台账且金额准确', after.settlement === 'SETTLED' && after.settled === 1 && rows.length === 1
          && rows[0].id === after.ledger && rows[0].period === state.periods.target && rows[0].employee === owner && rows[0].type === 'COMPENSATORY'
          && rows[0].unit === 'HOUR' && rows[0].key === `HR_OVERTIME:${id}:COMPENSATORY` && hundredths(rows[0].quantity) === hundredths(credit)
          && hundredths(after.quantity) === hundredths(credit));
        check('跨期补入仍归原周期累计舍入组', String(settled.rounding?.sourcePeriodId) === state.periods.source
          && settled.rounding.rawMinutes === 1 && hundredths(settled.rounding.currentCreditHours) === hundredths(credit));
      }
      await pause(5100);
      const replay = await call(reviewer, `${overtime}/${id}/settlement/resolve`, 'POST', { ...input, version: after.version });
      check('重复处置真实拒绝且原单及账务不再变化', replay.status === 409 && replay.body?.code === 'RESOLUTION_NOT_ALLOWED'
        && JSON.stringify(source(id)) === JSON.stringify(after) && JSON.stringify(ledgers(id)) === JSON.stringify(rows));
      state.completed[name] = true; await save();
    }
    const total = database(`SELECT CAST(SUM(leave_days) AS CHAR) FROM hr_leave_ledger WHERE tenant_id=100000 AND employee_id=${owner}
      AND leave_type_id=${sqlText(fixture.ids.leaveType)} AND leave_period_id=${sqlText(state.periods.target)} AND source_biz_type='HR_OVERTIME'`);
    check('两次一分钟补入累计0.03小时且原关闭周期未新增流水', hundredths(total) === 3n
      && database(`SELECT COUNT(*) FROM hr_leave_ledger WHERE tenant_id=100000 AND leave_period_id=${sqlText(state.periods.source)}`) === '0');
    state.passed = true;
  } catch (error) { failure = error; }
  finally {
    const errors = [];
    for (const id of Object.values(state.requests)) {
      try {
        await cancel(id);
        const row = source(id);
        if (failure && row.status === 'APPROVED' && row.settlement === 'NEEDS_RESOLUTION') {
          await ok(reviewer, `${overtime}/${id}/settlement/resolve`, 'POST', { version: row.version, reason: note + '失败验收收尾', action: 'REJECT' });
        }
      } catch (error) { errors.push(error); }
    }
    try {
      if (state.periods?.source) await setPeriod('source', 'CLOSED');
      check('周期处置全程保持所有既有周期全部列', originalPeriods() === periodsBefore);
    } catch (error) { errors.push(error); }
    state.restorationRequired = errors.length > 0; state.restored = errors.length === 0; await save();
    journal('period-resolution-restored', { passed: state.restored, periods: state.periods, requests: state.requests });
    if (errors.length) failure = new AggregateError([failure, ...errors].filter(Boolean), 'Period resolution cleanup failed');
  }
  if (failure) throw failure;
  context.evidence.periodResolution = { passed: state.passed && state.restored, employeeId: owner, month: state.month, periods: state.periods,
    requests: state.requests, legacyInput: state.legacyInput, resolutions: state.resolutions, realCloseGuard: true, closedBeforeReviewBlocked: true, realDualApprovals: 3,
    adjustedRequests: 2, rejectedRequests: 1, originalActualMinutes: 3, cumulativeHours: '0.03', ordinaryRetryBlocked: true,
    closedTargetBlocked: true, selfResolutionBlocked: true, duplicateResolutionBlocked: true, originalPeriodsKept: true, restored: true,
    interfaceDoubles: 0, legacyPeriodStatusInputs: 1, resolutionUiReviewed: false, resolutionUi: state.ui,
    resolutionUiExecuted: Object.values(state.ui).length === 3 && Object.values(state.ui).every(item => item.passed) };
  fixture.completed['period-resolution'] = true; await save();
  console.log('H2_OVERTIME_PERIOD_PHASE: normal close denied; owned legacy input; real approvals and explicit resolutions passed');
}
