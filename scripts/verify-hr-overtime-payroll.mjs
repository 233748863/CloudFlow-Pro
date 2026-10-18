import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { prepareHrOvertimePayrollAttendance } from './verify-hr-overtime-payroll-attendance.mjs';

// Real current-runtime PAY source and payroll. Only this run's peer employee is paid.
export async function verifyHrOvertimePayroll(context) {
  const { fixture, employeeId, label, note, ok, call, check, database, jsonRows, sqlText, save,
    cards, createRequest, approveRequest, until, pause, journal, payrollPeriodAllowance } = context;
  const payroll = '/hr/compensation/payroll', overtime = '/hr/attendance/overtime-requests';
  const owner = employeeId('peer'), periodId = payrollPeriodAllowance.periodId;
  const state = fixture.payroll = { employeeId: owner, periodId, batches: [], tasks: [], versionEvents: [], restored: false };
  const id = value => { const result = String(value); assert.match(result, /^[1-9][0-9]*$/); return result; };
  const cents = value => {
    const parts = /^(-?)([0-9]+)(?:\.([0-9]{1,2}))?$/.exec(String(value));
    assert.ok(parts, 'Exact money required');
    return (parts[1] ? -1n : 1n) * (BigInt(parts[2]) * 100n + BigInt((parts[3] || '').padEnd(2, '0')));
  };
  const money = value => `${value / 100n}.${String(value % 100n).padStart(2, '0')}`;
  const digest = statement => createHash('sha256').update(database(statement)).digest('hex');
  const periodVersion = () => Number(database(`SELECT version FROM hr_payroll_period WHERE tenant_id=100000 AND period_id=${periodId}`));
  const recordVersion = async (operation, increment) => {
    const expected = payrollPeriodAllowance.originalVersion + payrollPeriodAllowance.expectedDelta + increment;
    check('指定工资周期版本仅按本轮真实操作推进：' + operation, periodVersion() === expected);
    payrollPeriodAllowance.expectedDelta += increment;
    state.versionEvents.push({ operation, increment, version: expected });
    journal('payroll-period-version', { periodId, ...state.versionEvents.at(-1) });
    await save();
  };
  const observe = async task => {
    if (task.terminal) return;
    for (let attempt = 0; ; attempt++) {
      const result = await ok('admin', `${payroll}/tasks/${encodeURIComponent(task.executeNo)}`);
      if (['SUCCESS', 'FAILED', 'TIMEOUT'].includes(result.executeStatus)) {
        task.terminal = result.executeStatus; task.affectedRows = Number(result.affectedRows); await save(); return;
      }
      if (attempt > 0 && attempt % 30 === 0) console.log('H2_OVERTIME_PAYROLL_PHASE: observing original payroll task');
      await pause(1000);
    }
  };
  const cancel = async batch => {
    await ok('admin', `${payroll}/batches/${batch.id}/cancel`, 'POST', {});
    batch.cancelled = true; await save(); await recordVersion('cancel-' + batch.id, 1);
  };
  const limits = [3600000n, 14400000n, 30000000n, 42000000n, 66000000n, 96000000n, null];
  const rates = [300n, 1000n, 2000n, 2500n, 3000n, 3500n, 4500n];
  const quick = [0n, 252000n, 1692000n, 3192000n, 5292000n, 8592000n, 18192000n];
  const bands = rates.map((rate, index) => ({ levelNo: index + 1, fromAmount: money(index ? limits[index - 1] : 0n),
    toAmount: limits[index] === null ? null : money(limits[index]), taxRate: '0.' + String(rate).padStart(4, '0'), quickDeduction: money(quick[index]) }));
  // Independent marginal-band integration, not the product's quick-deduction formula.
  const gross = 5000000n + 6003n, allowance = 500000n * 8n, taxable = gross - allowance;
  let numerator = 0n, lower = 0n;
  for (let index = 0; index < rates.length; index++) {
    const upper = limits[index] === null || taxable < limits[index] ? taxable : limits[index];
    if (upper > lower) numerator += (upper - lower) * rates[index];
    if (limits[index] === null || taxable <= limits[index]) break;
    lower = limits[index];
  }
  const tax = (numerator + 5000n) / 10000n;
  check('独立整数分预期为应发50060.03、个税301.80及实发49758.23', money(gross) === '50060.03' && money(tax) === '301.80' && money(gross - tax) === '49758.23');
  const verify = (slip, phase) => {
    for (const [field, value] of Object.entries({ grossTotal: gross, currentTax: tax, taxAmount: tax, netTotal: gross - tax,
      deductionTotal: tax, benefitAmount: 0n, cumulativeTaxableIncome: taxable, cumulativeDeduction: allowance,
      cumulativeTaxPayable: tax, cumulativeTaxPaid: 0n })) check(`${phase} ${field}精确到分`, cents(slip[field]) === value);
    const source = slip.components.filter(row => row.sourceBizType === 'HR_OVERTIME');
    check(phase + ' 仅含唯一实际加班来源及60.03元', source.length === 1 && String(source[0].changeId) === state.changeId
      && String(source[0].overtimeRequestId) === state.requestId && cents(source[0].amount) === 6003n);
    const snapshots = slip.components.filter(row => row.type === 'TAX_SNAPSHOT');
    check(phase + ' 唯一正式税档快照和8个月减除费用', snapshots.length === 1 && cents(snapshots[0].thresholdApplied) === allowance
      && cents(snapshots[0].currentTaxableIncome) === taxable && cents(snapshots[0].quickDeduction) === 0n && Number(snapshots[0].taxRate) === 0.03);
    check(phase + ' 完整冻结已批准七档税率', snapshots[0].brackets.length === 7 && snapshots[0].brackets.every((band, index) =>
      cents(band.from) === cents(bands[index].fromAmount) && (limits[index] === null ? band.to === null : cents(band.to) === limits[index])
      && Number(band.rate) === Number(rates[index]) / 10000 && cents(band.quickDeduction) === quick[index]));
    const basis = slip.components.filter(row => row.type === 'PAYROLL_BASIS');
    check(phase + ' 本周期完整固定工资50000元', basis.length === 1 && cents(basis[0].postedFixedGross) === 5000000n && basis[0].fullMonth === true);
  };
  let failure;
  try {
    await save();
    const periods = await ok('admin', payroll + '/config/periods');
    const selected = periods.filter(row => String(row.periodId) === periodId);
    check('仅使用原8月完整开放工资周期且版本未被其他操作推进', selected.length === 1 && selected[0].startDate === '2026-08-01'
      && selected[0].endDate === '2026-08-31' && selected[0].status === 'OPEN' && selected[0].version === payrollPeriodAllowance.originalVersion);
    const personal = jsonRows(`SELECT JSON_OBJECT('hireDate',CAST(hire_date AS CHAR),'comp',(SELECT COUNT(*) FROM hr_employee_comp WHERE employee_id=${owner}),
      'profile',(SELECT COUNT(*) FROM hr_tax_profile WHERE employee_id=${owner}),'slips',(SELECT COUNT(*) FROM hr_salary_slip WHERE employee_id=${owner}),
      'quotas',(SELECT COUNT(*) FROM hr_leave_quota WHERE employee_id=${owner})) FROM hr_employee WHERE tenant_id=100000 AND id=${owner}`);
    check('本轮独立员工1月入职且没有原工资、税档或待结转假期', personal.length === 1 && personal[0].hireDate === '2026-01-01'
      && ['comp', 'profile', 'slips', 'quotas'].every(key => Number(personal[0][key]) === 0));
    state.structureId = id(await ok('admin', '/hr/compensation/structures', 'POST', { structureCode: label + '-PAY', structureName: label + '工资', status: 1, componentConfig: {} }));
    await save();
    await ok('admin', `${payroll}/structures/${state.structureId}`, 'PUT', { salaryBasis: 'MONTHLY', prorationBasis: 'CALENDAR_DAYS', benefitTiming: 'FIRST_PAYROLL' });
    state.gradeId = id(await ok('admin', '/hr/compensation/grades', 'POST', { gradeCode: label + '-PAY', gradeName: label + '薪级', minSalary: '50000.00', midSalary: '50000.00', maxSalary: '50000.00', currency: 'CNY', status: 1 }));
    await save();
    state.fixedId = id(await ok('admin', '/hr/compensation/components', 'POST', { componentCode: label + '-FIXED', componentName: '验收固定工资', componentType: 'FIXED', category: 'EARNING', taxable: 1, status: 1, sortOrder: 998 }));
    await save();
    state.compId = id(await ok('admin', '/hr/compensation/employee-compensations', 'POST', { employeeId: owner, structureId: state.structureId, gradeId: state.gradeId,
      componentValues: { [state.fixedId]: '50000.00' }, totalSalary: '50000.00', effectiveDate: '2026-07-01', status: 'ACTIVE' }));
    state.taxBody = { slabName: label + '已批准普通工资税表', region: label, effectiveFrom: '2026-01-01', effectiveTo: '2026-12-31',
      thresholdAmount: '5000.00', status: 'DRAFT', remark: '按2026-10-06已批准中国大陆居民普通工资政策建立独立验收副本' };
    await save();
    state.slabId = id(await ok('admin', payroll + '/tax-slabs', 'POST', state.taxBody)); await save();
    await ok('admin', `${payroll}/tax-slabs/${state.slabId}/details`, 'PUT', bands);
    await ok('admin', '/hr/compensation/tax-profiles', 'POST', { employeeId: owner, taxSlabId: state.slabId, taxResidenceCity: '隔离政策验收', status: 'ACTIVE' });
    const previewPath = payroll + '/slips/preview?' + new URLSearchParams({ employeeId: owner, periodId, deductUnverified: 'false' });
    const draftTax = await call('admin', previewPath);
    check('税表未启用时拒绝算薪', draftTax.status === 400 && draftTax.body?.code === 'TAX_TABLE_PENDING');
    const denied = await call('peer', `${payroll}/tax-slabs/${state.slabId}`, 'PUT', { ...state.taxBody, status: 'ACTIVE' });
    check('员工不能启用工资税表', denied.status === 403);
    await ok('admin', `${payroll}/tax-slabs/${state.slabId}`, 'PUT', { ...state.taxBody, status: 'ACTIVE' });
    check('管理员真实启用本轮独立税表', database(`SELECT status FROM hr_tax_slab WHERE slab_id=${state.slabId}`) === 'ACTIVE');
    // The preceding limit stage has restored the disabled baseline; establish the PAY prerequisites again.
    await context.enablePolicy();
    await cards('peer', '2026-07-28', '08:00:00', '18:30:00');
    const punchDigest = () => digest(`SELECT * FROM hr_attendance_checkin WHERE employee_id=${owner} ORDER BY checkin_id`);
    state.punchDigest = punchDigest(); await save();
    let request = await createRequest('payroll-source', overtime, { startTime: '2026-07-28T16:30:00', endTime: '2026-07-28T18:30:00', settleMode: 'PAY', reason: note }, 'peer');
    state.requestId = id(request.requestId); await save();
    request = await ok('peer', `${overtime}/${state.requestId}/submit`, 'POST', { version: request.version });
    check('实际成对打卡核实120分钟且尚未人工核定', request.actualMinutes === 120 && request.approvedMinutes === null && request.status === 'SUBMITTED');
    request = await ok('hr', `${overtime}/${state.requestId}/review-hours`, 'POST', { version: request.version, approvedMinutes: 120, note });
    check('人事核时后尚待核价', request.approvedMinutes === 120 && !request.instanceId);
    await ok('admin', `${overtime}/${state.requestId}/review-pay`, 'POST', { version: request.version, hourlyRate: '20.01', payrollPeriodId: periodId, note });
    const priced = await ok('admin', `${overtime}/${state.requestId}/settlement`);
    check('真实核价20.01元按1.50倍率形成60.03元并指定8月工资', cents(priced.hourlyRate) === 2001n && cents(priced.settlementAmount) === 6003n
      && String(priced.payrollPeriodId) === periodId && String(priced.pricedBy) === context.sessions.accounts.admin.userId);
    const batchBody = { payrollPeriodId: periodId, employeeIds: [owner], validateAttendanceFlag: 1, deductUnverifiedFlag: 0 };
    const pending = await ok('admin', payroll + '/batches/preview', 'POST', batchBody);
    check('两级审批前工资预检阻断未结清加班', pending.length === 1 && pending[0].calcStatus === 'SKIPPED' && /加班/.test(pending[0].errorMessage));
    await approveRequest(overtime, state.requestId, 'overtime', 'peer');
    const settled = await until(() => ok('admin', `${overtime}/${state.requestId}/settlement`), value => ['SETTLED', 'FAILED', 'NEEDS_RESOLUTION'].includes(value.settlementStatus), '真实加班费结算');
    check('两级真实同意后唯一60.03元工资来源结清', settled.settlementStatus === 'SETTLED' && settled.settledFlag === 1 && cents(settled.settlementAmount) === 6003n
      && String(settled.payrollPeriodId) === periodId && Boolean(settled.compChangeId) && !settled.leaveLedgerId);
    state.changeId = id(settled.compChangeId); await save();
    const sourceRows = jsonRows(`SELECT JSON_OBJECT('id',CAST(id AS CHAR),'employee',CAST(employee_id AS CHAR),'period',CAST(payroll_period_id AS CHAR),'status',status)
      FROM hr_comp_change WHERE tenant_id=100000 AND source_biz_type='HR_OVERTIME' AND source_biz_id=${sqlText(state.requestId)}`);
    check('加班工资变动唯一且回指本轮员工和指定周期', sourceRows.length === 1 && sourceRows[0].id === state.changeId && sourceRows[0].employee === owner
      && sourceRows[0].period === periodId && sourceRows[0].status === 'APPROVED');
    check('核价时薪和结算金额按既有格式加密保存', database(`SELECT COUNT(*) FROM hr_overtime_request WHERE request_id=${state.requestId} AND hourly_rate_cipher LIKE 'H1:%' AND settlement_amount_cipher LIKE 'H1:%'`) === '1');
    const sourceDigest = () => digest(`SELECT * FROM hr_comp_change WHERE id=${state.changeId}`) + digest(`SELECT * FROM hr_overtime_request WHERE request_id=${state.requestId}`);
    const sourcesBefore = sourceDigest();
    const attendance = await ok('admin', payroll + '/batches/preview', 'POST', { ...batchBody, validateAttendanceFlag: 1 });
    check('打开考勤校验仍拒绝本员工未封账月份', attendance.length === 1 && attendance[0].calcStatus === 'SKIPPED' && /考勤未封账/.test(attendance[0].errorMessage));
    const checkConfirmedAttendance = await prepareHrOvertimePayrollAttendance(context);
    state.punchDigest = punchDigest(); await save();
    verify(await ok('admin', previewPath), '正式工资预览');
    console.log('H2_OVERTIME_PAYROLL_PHASE: actual approval, tax activation and payroll preview passed');
    const calculate = async () => {
      const batch = { id: id(await ok('admin', payroll + '/batches', 'POST', batchBody)) };
      state.batches.push(batch); await save();
      const task = { batchId: batch.id, executeNo: await ok('admin', `${payroll}/batches/${batch.id}/calculate`, 'POST', {}) };
      state.tasks.push(task); await save(); await observe(task); await recordVersion('calculate-' + batch.id, 2);
      check('原后台算薪任务成功且仅处理一名员工', task.terminal === 'SUCCESS' && task.affectedRows === 1);
      const detail = await ok('admin', `${payroll}/batches/${batch.id}`);
      check('实际工资批次仅包含本轮员工', detail.batch.status === 'CALCULATED' && detail.employees.length === 1
        && String(detail.employees[0].employeeId) === owner && detail.employees[0].calcStatus === 'SUCCESS' && detail.batch.validateAttendanceFlag === 1);
      batch.slipId = id(detail.employees[0].salarySlipId); await save(); verify(await ok('admin', `${payroll}/slips/${batch.slipId}`), '真实计算' + batch.id);
      return batch;
    };
    const cancelled = await calculate(); await cancel(cancelled);
    check('取消仅逻辑删除本批工资且保留已批准加班来源', database(`SELECT deleted FROM hr_salary_slip WHERE id=${cancelled.slipId}`) === '1' && sourceDigest() === sourcesBefore);
    const paidBatch = await calculate();
    await ok('admin', `${payroll}/batches/${paidBatch.id}/submit`, 'POST', {});
    verify(await ok('peer', `/hr/ess/salary-slips/${paidBatch.slipId}`), '员工本人读取已提交工资');
    await ok('admin', `${payroll}/batches/${paidBatch.id}/pay`, 'POST', {});
    const paid = await ok('admin', `${payroll}/slips/${paidBatch.slipId}`); verify(paid, '已发工资');
    check('实际发放状态及封存摘要完整', paid.status === 'PAID' && /^[a-f0-9]{64}$/i.test(paid.digestSha256));
    const paidDigest = () => digest(`SELECT * FROM hr_salary_slip WHERE id=${paidBatch.slipId}`) + digest(`SELECT * FROM hr_payroll_batch WHERE batch_id=${paidBatch.id}`);
    const paidBefore = paidDigest();
    await pause(5100);
    for (const action of ['pay', 'calculate']) {
      const duplicate = await call('admin', `${payroll}/batches/${paidBatch.id}/${action}`, 'POST', {});
      check('已发批次拒绝重复' + action, duplicate.status === 400 && duplicate.body?.code === 'INVALID_PAYROLL_STATE');
      check('重复操作拒绝后财务原件不变', paidDigest() === paidBefore);
    }
    check('取消重算及发薪未修改原审批收入来源或打卡', sourceDigest() === sourcesBefore && punchDigest() === state.punchDigest);
    await checkConfirmedAttendance();
    check('两次算薪一次取消后只增加5个周期版本', payrollPeriodAllowance.expectedDelta === 5 && periodVersion() === payrollPeriodAllowance.originalVersion + 5);
    const page = await context.sessions.admin.page.context().newPage();
    const pageResponses = [], pageFailures = [], probeCancellations = [], responsesByRequest = new Map();
    page.on('response', response => {
      const endpoint = new URL(response.url()).pathname;
      if (endpoint.startsWith('/api/')) {
        const entry = { path: endpoint.slice(4), method: response.request().method(), status: response.status() };
        pageResponses.push(entry); responsesByRequest.set(response.request(), entry);
      }
    });
    page.on('requestfailed', request => {
      const endpoint = new URL(request.url()).pathname;
      if (endpoint.startsWith('/api/')) {
        const completed = responsesByRequest.get(request), error = request.failure()?.errorText;
        // Chromium reports ERR_ABORTED after this OPTIONS probe has resolved successfully.
        // Keep the observed response and cancellation; all other request failures still fail.
        if (endpoint === '/api/auth/login' && request.method() === 'OPTIONS' && error === 'net::ERR_ABORTED'
          && completed && [200, 204].includes(completed.status)) probeCancellations.push({ ...completed, error });
        else pageFailures.push({ path: endpoint.slice(4), method: request.method(), failed: true });
      }
    });
    try {
      await page.goto(new URL('/hr/payroll?id=' + paidBatch.slipId, context.sessions.admin.page.url()).href, { waitUntil: 'networkidle' });
      const dialog = page.getByRole('dialog'); await dialog.waitFor(); const content = await dialog.innerText();
      check('真实工资页面展示加班费应发个税及实发金额', ['50060.03', '301.80', '49758.23', '60.03'].every(value => content.includes(value)));
      state.image = path.join(`h2-overtime-ui-${context.caseTag}`, 'paid-salary.png');
      await page.screenshot({ path: path.join(context.directory, state.image) });
      state.pageNetwork = { responses: [...pageResponses], failed: [...pageFailures], completedProbeCancellations: [...probeCancellations] }; await save();
      check('工资详情页面真实请求没有网关或连接失败', pageResponses.length > 0 && pageResponses.every(response => response.status < 500) && pageFailures.length === 0,
        { failures: pageResponses.filter(response => response.status >= 500).concat(pageFailures) });
    } finally { await page.close(); }
    state.passed = true; state.paidSlipId = paidBatch.slipId; await save();
  } catch (error) { failure = error; }
  finally {
    const errors = [];
    const restore = async operation => { try { await operation(); } catch (error) { errors.push(error); } };
    await restore(async () => {
      for (const task of state.tasks) await observe(task);
      for (const batch of state.batches) {
        const result = await ok('admin', `${payroll}/batches/${batch.id}`);
        if (['DRAFT', 'CALCULATED', 'FAILED'].includes(result.batch.status)) await cancel(batch);
        const terminal = await ok('admin', `${payroll}/batches/${batch.id}`);
        check('工资测试批次保留真实终态', ['CANCELLED', 'PAID', 'SUBMITTED'].includes(terminal.batch.status));
      }
    });
    await restore(async () => {
      if (!state.requestId) return;
      const request = await ok('peer', `${overtime}/${state.requestId}`);
      if (['SUBMITTED', 'PENDING', 'APPROVING'].includes(request.status)) {
        await ok('peer', `${overtime}/${state.requestId}/cancel`, 'POST', { version: request.version, reason: note + '收尾' });
        if (request.instanceId) await until(() => database(`SELECT status FROM wf_process_instance WHERE instance_id=${sqlText(request.instanceId)}`),
          value => !['RUNNING', 'PAUSED', 'PENDING', 'FAILED', 'RESTARTED'].includes(value), '加班工资审批收尾');
      }
    });
    await restore(async () => {
      if (state.slabId) {
        await ok('admin', `${payroll}/tax-slabs/${state.slabId}`, 'PUT', { ...state.taxBody, status: 'INACTIVE' });
        check('本轮七档测试税表收尾停用', database(`SELECT status FROM hr_tax_slab WHERE slab_id=${state.slabId}`) === 'INACTIVE');
      }
    });
    state.restored = errors.length === 0; await save();
    if (errors.length) failure = new AggregateError([failure, ...errors].filter(Boolean), 'Overtime payroll restoration failed');
  }
  if (failure) throw failure;
  context.evidence.payroll = { passed: state.passed && state.restored, employeeId: owner, periodId, requestId: state.requestId, changeId: state.changeId,
    overtime: '60.03', fixed: '50000.00', gross: money(gross), tax: money(tax), net: money(gross - tax), officialTaxBands: 7, deductionMonths: 8,
    pendingApprovalBlocked: true, attendanceGuardVerified: true, payrollAttendanceValidation: true, confirmedAttendance: state.attendance, cancellation: true, payment: true, duplicateDenied: true,
    originalTasks: state.tasks, versionEvents: state.versionEvents, paidSlipId: state.paidSlipId, image: state.image, pageNetwork: state.pageNetwork, taxTableDisabled: true };
  fixture.completed['payroll-payment'] = true; await save();
  console.log('H2_OVERTIME_PAYROLL_PHASE: cancellation, original payment and duplicate guards passed');
}
