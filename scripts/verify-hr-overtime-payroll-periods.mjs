import { createHash } from 'node:crypto';
import { hundredths } from './batch-h/hr09-evidence.mjs';
import { overtimeCorrectionWorkflow } from './verify-hr-overtime-correction-workflow.mjs';
import { resolveHrOvertimePayrollFromPage, reviewHrOvertimePayrollPaidPage } from './verify-hr-overtime-payroll-period-ui.mjs';

export async function verifyHrOvertimePayrollPeriods(context) {
  const { fixture, sessions, database, jsonRows, sqlText, check, ok, call, save, until, pause, label, note,
    employeeId, cards, draft, createRequest, bindWorkflow, approveRequest, configureTypes, enablePolicy, journal } = context;
  const pay = '/hr/compensation/payroll', overtime = '/hr/attendance/overtime-requests';
  const owner = employeeId('peer'), payroll = fixture.payroll;
  const state = fixture.payrollPeriodResolution = { employeeId: owner, corrections: [], periods: {}, restored: false };
  const workflow = overtimeCorrectionWorkflow(context, state);
  const digest = sql => createHash('sha256').update(database(sql)).digest('hex');
  const bound = database('SELECT COALESCE(MAX(period_id),0) FROM hr_payroll_period');
  const originals = () => digest(`SELECT * FROM hr_payroll_period WHERE period_id<=${bound} ORDER BY period_id`);
  const beforePeriods = originals();
  const originalSalary = () => digest(`SELECT * FROM hr_salary_slip WHERE id=${sqlText(payroll.paidSlipId)}`);
  const beforeSalary = originalSalary();
  const periodHash = id => digest(`SELECT * FROM hr_payroll_period WHERE period_id=${sqlText(id)}`);
  const period = id => jsonRows(`SELECT JSON_OBJECT('periodId',CAST(period_id AS CHAR),'name',period_name,'start',CAST(start_date AS CHAR),
    'end',CAST(end_date AS CHAR),'status',status,'version',version) FROM hr_payroll_period WHERE tenant_id=100000 AND period_id=${sqlText(id)} AND deleted=0`)[0];
  const source = () => jsonRows(`SELECT JSON_OBJECT('id',CAST(request_id AS CHAR),'status',status,'settlement',settlement_status,'version',version,
    'actual',actual_minutes,'approved',approved_minutes,'period',CAST(payroll_period_id AS CHAR),'settled',settled_flag,
    'change',CAST(comp_change_id AS CHAR),'correction',CAST(payroll_correction_id AS CHAR),'policy',SHA2(policy_snapshot,256),
    'calculation',SHA2(calculation_snapshot,256),'rate',SHA2(hourly_rate_cipher,256),'amount',SHA2(settlement_amount_cipher,256))
    FROM hr_overtime_request WHERE tenant_id=100000 AND request_id=${sqlText(state.requestId)} AND deleted=0`)[0];
  let failure;
  try {
    await save();
    check('原工资真实已发且属于本轮独立员工', Boolean(payroll.paidSlipId) && payroll.employeeId === owner
      && database(`SELECT COUNT(*) FROM hr_salary_slip WHERE id=${sqlText(payroll.paidSlipId)} AND employee_id=${owner} AND status='PAID'`) === '1');
    const existing = await ok('admin', pay + '/config/periods');
    const candidates = Array.from({ length: 50 }, (_, index) => new Date(Date.UTC(2026, 10 + index, 1)).toISOString().slice(0, 7));
    const prefix = candidates.find(value => !existing.some(row => row.startDate <= value + '-31' && row.endDate >= value + '-01'));
    check('新工资周期仅使用2026至2030年尚未占用月份', Boolean(prefix));
    const year = Number(prefix.slice(0, 4)), month = Number(prefix.slice(5, 7));
    const end = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
    state.testTaxEffectiveTo = `${year}-12-31`;
    state.futureDatesAreSynthetic = year > 2026;
    const closedMonth = Array.from({ length: 12 }, (_, index) => String(12 - index).padStart(2, '0'))
      .find(value => !existing.some(row => row.startDate <= `2025-${value}-31` && row.endDate >= `2025-${value}-01`));
    check('关闭目标负例也使用未占用历史月份', Boolean(closedMonth));
    const bodies = [
      ['source', { startDate: prefix + '-01', endDate: prefix + '-15', frequency: 'SEMI_MONTHLY' }],
      ['target', { startDate: prefix + '-16', endDate: end, frequency: 'SEMI_MONTHLY' }],
      ['closed', { startDate: `2025-${closedMonth}-01`, endDate: new Date(Date.UTC(2025, Number(closedMonth), 0)).toISOString().slice(0, 10), frequency: 'MONTHLY' }],
    ];
    for (const [name, dates] of bodies) {
      const body = { periodName: `${label} pay-${name}`, ...dates, payDate: dates.endDate, currency: 'CNY', remark: note };
      const id = String(await ok('admin', pay + '/periods', 'POST', body));
      state.periods[name] = id; await save();
      check('工资周期通过真实接口新建且不影响原周期', BigInt(id) > BigInt(bound) && period(id).name === body.periodName
        && period(id).status === 'OPEN' && originals() === beforePeriods);
    }
    await ok('admin', `${pay}/periods/${state.periods.closed}/close`, 'POST', {});
    check('独立空周期通过正常关账成为关闭负例', period(state.periods.closed).status === 'CLOSED');
    // Future dates only isolate page fixtures under the already approved rule;
    // they do not certify a future official tax table. Restore the owned table below.
    await ok('admin', `${pay}/tax-slabs/${payroll.slabId}`, 'PUT', { ...payroll.taxBody, effectiveTo: state.testTaxEffectiveTo, status: 'ACTIVE' });
    await workflow.prepare(false);
    // Real paid corrections cover earlier open periods. Pricing must still choose
    // the first uncovered period; no existing period is hidden or force-closed.
    const earlier = existing.filter(row => row.status === 'OPEN' && row.startDate > '2026-08-31' && row.endDate < prefix + '-01').sort((a, b) => a.startDate.localeCompare(b.startDate));
    check('前置工资覆盖仅涉及原工资之后明确开放周期', earlier.length >= 3 && earlier.every(row => row.status === 'OPEN' && row.startDate > '2026-08-31' && row.endDate < prefix + '-01'));
    state.coveragePeriods = earlier.map(row => String(row.periodId)); await save();
    for (const row of earlier) await workflow.seed(row);
    await enablePolicy();
    await configureTypes();
    check('新PAY来源日没有叠加既有原始卡', database(`SELECT COUNT(*) FROM hr_attendance_checkin WHERE tenant_id=100000 AND employee_id=${owner} AND attendance_date='2026-07-29'`) === '0');
    await cards('peer', '2026-07-29', '09:00:00', '18:30:00');
    let request = await createRequest('pay-period-source', overtime, draft('2026-07-29', '17:30', '18:30', 'PAY', note), 'peer');
    state.requestId = String(request.requestId); await save();
    request = await ok('peer', `${overtime}/${state.requestId}/submit`, 'POST', { version: request.version });
    request = await ok('hr', `${overtime}/${state.requestId}/review-hours`, 'POST', { version: request.version, approvedMinutes: 60, note });
    check('加班补正来源真实成对打卡并核定60分钟', request.actualMinutes === 60 && request.approvedMinutes === 60);
    await ok('admin', `${overtime}/${state.requestId}/review-pay`, 'POST', { version: request.version, hourlyRate: '20.01', payrollPeriodId: state.periods.source, note });
    const priced = await ok('admin', `${overtime}/${state.requestId}/settlement`);
    check('首个未覆盖新周期真实核价30.02元', String(priced.payrollPeriodId) === state.periods.source && hundredths(priced.settlementAmount) === 3002n);
    await bindWorkflow(overtime, state.requestId, 'overtime', 'peer');
    const seed = await workflow.seed({ periodId: state.periods.source });
    state.seedSlipId = String(seed.id); await save();
    const beforeClose = periodHash(state.periods.source);
    const close = await call('admin', `${pay}/periods/${state.periods.source}/close`, 'POST', {});
    check('未结清加班阻止正常工资关账且周期全部列不变', close.body?.code === 'OVERTIME_SETTLEMENT_PENDING'
      && close.status >= 400 && close.status < 500 && periodHash(state.periods.source) === beforeClose);
    const current = period(state.periods.source);
    check('历史关闭输入仅命中本轮新建且唯一真实已发覆盖的原周期', BigInt(current.periodId) > BigInt(bound)
      && current.status === 'OPEN' && current.name === label + ' pay-source' && seed.status === 'PAID');
    state.legacyInput = { origin: 'OWNED_PAYROLL_PERIOD_STATUS_FAULT', periodId: current.periodId, beforeHash: beforeClose, beforeVersion: current.version };
    await save(); journal('payroll-period-legacy-before', state.legacyInput);
    const changed = database(`UPDATE hr_payroll_period SET status='CLOSED',version=version+1 WHERE tenant_id=100000 AND period_id=${sqlText(current.periodId)}
      AND period_id>${bound} AND period_name=${sqlText(current.name)} AND start_date=${sqlText(current.start)} AND end_date=${sqlText(current.end)}
      AND status='OPEN' AND version=${current.version} AND deleted=0; SELECT ROW_COUNT()`);
    check('历史工资关闭状态仅改变一条本轮周期', changed === '1' && period(current.periodId).status === 'CLOSED'
      && period(current.periodId).version === current.version + 1 && originals() === beforePeriods);
    state.legacyInput.afterHash = periodHash(current.periodId); await save();
    await approveRequest(overtime, state.requestId, 'overtime', 'peer');
    const pending = await until(() => ok('admin', `${overtime}/${state.requestId}/settlement`), value => value.settlementStatus === 'NEEDS_RESOLUTION', '关闭工资周期真实结算待处置');
    check('真实批准后关闭工资周期阻止普通变动入账', pending.lastErrorCode === 'PERIOD_CLOSED' && pending.settledFlag === 0
      && !pending.compChangeId && !pending.payrollCorrectionId && source().status === 'APPROVED');
    await workflow.prepare(true);
    const before = source();
    const input = { version: before.version, action: 'PAY_CORRECTION', originalSlipId: state.seedSlipId, targetPeriodId: state.periods.target, reason: note };
    const retry = await call('admin', `${overtime}/${state.requestId}/settlement/retry`, 'POST', { version: before.version, reason: note });
    check('关闭工资周期拒绝普通重试且来源不变', retry.body?.code === 'RESOLUTION_REQUIRED' && JSON.stringify(source()) === JSON.stringify(before));
    const self = await call('peer', `${overtime}/${state.requestId}/settlement/resolve`, 'POST', input);
    check('原员工不能自行办理加班工资补正', self.status === 403 && JSON.stringify(source()) === JSON.stringify(before));
    const wrong = await call('admin', `${overtime}/${state.requestId}/settlement/resolve`, 'POST', { ...input, originalSlipId: payroll.paidSlipId });
    check('错误周期真实已发工资不能作为补正原单', wrong.body?.code === 'CORRECTION_REQUIRES_PAID' && JSON.stringify(source()) === JSON.stringify(before));
    const closed = await call('admin', `${overtime}/${state.requestId}/settlement/resolve`, 'POST', { ...input, targetPeriodId: state.periods.closed });
    check('关闭补正目标拒绝且没有部分写入', closed.body?.code === 'PAYROLL_PERIOD_CLOSED' && JSON.stringify(source()) === JSON.stringify(before));
    const optionsPath = `${pay}/slips/paid-options?employeeId=${owner}&periodId=${state.periods.source}`;
    const options = await ok('admin', optionsPath);
    check('真实原单选项只返回本人原周期独立已发工资且不带金额', options.length === 1 && options[0].salarySlipId === state.seedSlipId
      && Object.keys(options[0]).sort().join(',') === 'periodMonth,salarySlipId');
    const deniedOptions = await call('peer', optionsPath);
    check('缺少工资管理权限的员工不能读取补正原单选项', deniedOptions.status === 403);
    const created = await resolveHrOvertimePayrollFromPage(context, input);
    state.linkedId = String(created.payrollCorrectionId);
    if (!state.corrections.some(item => item.id === state.linkedId)) state.corrections.push({ id: state.linkedId, linked: true });
    await save();
    check('明确处置只建立待审批补正而不冒充完成', created.settlementStatus === 'CORRECTION_PENDING' && !created.settledFlag
      && !created.compChangeId && Boolean(created.payrollCorrectionId));
    await pause(5100);
    const afterCreate = source(), replay = await call('admin', `${overtime}/${state.requestId}/settlement/resolve`, 'POST', { ...input, version: afterCreate.version });
    check('重复处置拒绝并保持唯一补正', replay.body?.code === 'RESOLUTION_NOT_ALLOWED' && JSON.stringify(source()) === JSON.stringify(afterCreate));
    const beforeTargetClose = periodHash(state.periods.target);
    const pendingClose = await call('admin', `${pay}/periods/${state.periods.target}/close`, 'POST', {});
    check('待审批补正阻止目标关账且周期不变', ['OVERTIME_SETTLEMENT_PENDING','PAYROLL_SLIP_PENDING'].includes(pendingClose.body?.code)
      && periodHash(state.periods.target) === beforeTargetClose);
    await workflow.decide(state.linkedId, true);
    const applied = await until(() => ok('admin', `${overtime}/${state.requestId}/settlement`), value => value.settlementStatus === 'SETTLED', '补正真实应用后结算完成');
    check('补正应用完成保留冻结原周期原核价且不产生普通工资变动', applied.settledFlag === 1 && String(applied.payrollPeriodId) === state.periods.source
      && String(applied.payrollCorrectionId) === state.linkedId && hundredths(applied.settlementAmount) === 3002n && !applied.compChangeId);
    const paid = await workflow.payCorrection(state.linkedId, '30.02', { periodId: state.periods.target });
    const snapshot = paid.components.find(row => row.type === 'TAX_SNAPSHOT');
    check('补正工资快照准确引用原已发工资和加班来源', String(snapshot.originalSlipId) === state.seedSlipId
      && String(snapshot.overtimeRequestId) === state.requestId && String(snapshot.originalPayrollPeriodId) === state.periods.source);
    const after = source();
    check('已发补正保留真实批准工时及全部冻结核价依据', after.status === 'APPROVED' && after.actual === 60 && after.approved === 60
      && ['period','policy','calculation','rate','amount'].every(key => before[key] === after[key])
      && database(`SELECT COUNT(*) FROM hr_comp_change WHERE tenant_id=100000 AND source_biz_type='HR_OVERTIME' AND source_biz_id=${sqlText(state.requestId)}`) === '0');
    state.original = before; state.final = after; state.paidSlipId = String(paid.id); await save();
    await ok('admin', `${pay}/periods/${state.periods.target}/close`, 'POST', {});
    const closedHash = periodHash(state.periods.target);
    await pause(5100); await ok('admin', `${pay}/periods/${state.periods.target}/close`, 'POST', {});
    check('补正已发后正常关账且重复关闭保持原件', period(state.periods.target).status === 'CLOSED' && periodHash(state.periods.target) === closedHash);
    await reviewHrOvertimePayrollPaidPage(context);
    state.passed = true;
  } catch (error) { failure = error; }
  finally {
    const errors = [];
    const restore = async work => { try { await work(); } catch (error) { errors.push(error); } };
    await restore(async () => {
      if (!state.requestId) return;
      const row = await ok('peer', `${overtime}/${state.requestId}`);
      if (['DRAFT','SUBMITTED','PENDING','APPROVING'].includes(row.status)) {
        await ok('peer', `${overtime}/${state.requestId}/cancel`, 'POST', { version: row.version, reason: note + '收尾' });
        if (row.instanceId) await until(() => database(`SELECT status FROM wf_process_instance WHERE instance_id=${sqlText(row.instanceId)}`), value => !['RUNNING','PAUSED','PENDING','FAILED','RESTARTED'].includes(value), '工资周期源申请收尾');
      } else if (source().settlement === 'NEEDS_RESOLUTION') {
        await ok('admin', `${overtime}/${state.requestId}/settlement/resolve`, 'POST', { version: source().version, action: 'REJECT', reason: note + '失败收尾' });
      }
    });
    await restore(workflow.restore);
    await restore(async () => {
      await ok('admin', `${pay}/tax-slabs/${payroll.slabId}`, 'PUT', { ...payroll.taxBody, status: 'INACTIVE' });
      check('补正测试税表重新停用', database(`SELECT status FROM hr_tax_slab WHERE slab_id=${sqlText(payroll.slabId)}`) === 'INACTIVE');
      check('全部原工资周期和原已发工资各列保持', originals() === beforePeriods && originalSalary() === beforeSalary);
    });
    state.restored = errors.length === 0; await save();
    journal('payroll-period-resolution-restored', { passed: state.restored, periods: state.periods, request: state.requestId });
    if (errors.length) failure = new AggregateError([failure, ...errors].filter(Boolean), 'Payroll period restoration failed');
  }
  if (failure) throw failure;
  context.evidence.payrollPeriodResolution = { passed: state.passed && state.restored, employeeId: owner, periods: state.periods,
    requestId: state.requestId, originalSlipId: payroll.paidSlipId, seedSlipId: state.seedSlipId, paidSlipId: state.paidSlipId,
    linkedId: state.linkedId, paid: state.paid, coveragePeriods: state.coveragePeriods, legacyInput: state.legacyInput,
    original: state.original, final: state.final, realCloseGuard: true, realTargetClose: true, realIndependentApproval: true,
    wrongOriginalBlocked: true, closedTargetBlocked: true, selfBlocked: true, duplicateBlocked: true, gross: '30.02', tax: '0.00',
    originalSalaryKept: true, originalPeriodsKept: true, restored: true, interfaceDoubles: 0, resolutionUiExecuted: true,
    resolutionUi: state.ui, futureDatesAreSynthetic: state.futureDatesAreSynthetic, testTaxEffectiveTo: state.testTaxEffectiveTo, resolutionUiReviewed: false };
  fixture.completed['payroll-period-resolution'] = true; await save();
  console.log('H2_OVERTIME_PAYROLL_PERIOD_PHASE: real closed-period guard, independent correction and payment passed');
}
