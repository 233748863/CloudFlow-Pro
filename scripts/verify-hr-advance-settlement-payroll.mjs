import assert from 'node:assert/strict';

// Payroll configuration is an owned prerequisite; previews, calculation, reservation and
// sealing use the product APIs. The loan has already been funded by the actual OA flow.
export async function prepareSettlementAdvancePayroll({ admin, api, successful, database, check, marker, employeeId, advanceId, beforeCalculation }) {
  const literal = value => `CONVERT(UNHEX('${Buffer.from(String(value)).toString('hex')}') USING utf8mb4)`;
  const root = '/hr/compensation/payroll';
  const post = async (endpoint, body) => successful(await api(admin, `${root}${endpoint}`, { method: 'POST', body }), '实际办理工资预扣组合');
  const read = async endpoint => successful(await api(admin, `${root}${endpoint}`), '读取实际工资预扣组合');
  const [monthStart, relievingDate] = database("SELECT DATE_FORMAT(CURRENT_DATE,'%Y-%m-01'),CURRENT_DATE;").split('\t');
  assert.match(monthStart, /^\d{4}-\d{2}-01$/); assert.match(relievingDate, /^\d{4}-\d{2}-\d{2}$/);
  const selections = process.argv.filter(value => value.startsWith('--hr-settlement-payroll-period='));
  assert.ok(selections.length <= 1, 'One explicit settlement payroll period is allowed');
  const selectedPeriodId = selections[0]?.split('=')[1];
  if (selectedPeriodId !== undefined) assert.match(selectedPeriodId, /^[1-9]\d*$/);
  let startDate = monthStart, endDate = relievingDate;
  const existing = database(`SELECT JSON_OBJECT('id',CAST(period_id AS CHAR),'start',CAST(start_date AS CHAR),'end',CAST(end_date AS CHAR),'status',status)
    FROM hr_payroll_period WHERE tenant_id=100000 AND deleted=0 AND ${selectedPeriodId ? `period_id=${selectedPeriodId}` : `start_date<=${literal(endDate)} AND end_date>=${literal(startDate)}`};`)
    .split(/\r?\n/).filter(Boolean).map(row => JSON.parse(row));
  if (selectedPeriodId) {
    check('显式复用本月已结束且开放的计薪周期，不改写原周期', existing.length === 1 && existing[0].status === 'OPEN'
      && existing[0].start >= monthStart && existing[0].start <= existing[0].end && existing[0].end <= relievingDate);
    ({ start: startDate, end: endDate } = existing[0]);
  } else check('本月到离职日的隔离计薪周期没有冲突', existing.length === 0 || existing.length === 1
    && existing[0].start === startDate && existing[0].end === endDate && existing[0].status === 'OPEN');
  const periodId = existing[0]?.id || String(await post('/periods', { periodName: `${marker}_离职月计薪`, frequency: 'MONTHLY', startDate, endDate, payDate: endDate }));
  assert.match(periodId, /^[1-9]\d*$/);
  if (beforeCalculation) await beforeCalculation({ periodId, startDate, endDate });
  const balance = () => database(`SELECT CONCAT(outstanding_amount,':',repaid_amount,':',reserved_amount) FROM hr_employee_advance WHERE tenant_id=100000 AND advance_id=${advanceId};`);
  const before = balance();
  const preview = await read(`/slips/preview?employeeId=${employeeId}&periodId=${periodId}`);
  const deductions = preview.components.filter(item => item.sourceBizType === 'HR_ADVANCE');
  check('实际本月工资预览只扣已放款借款的50元且未预约', deductions.length === 1 && String(deductions[0].advanceId) === advanceId
    && Number(deductions[0].amount) === 50 && balance() === before && before === '100.00:0.00:0.00');
  const batchId = String(await post('/batches', { payrollPeriodId: periodId, employeeIds: [employeeId], validateAttendanceFlag: 0, deductUnverifiedFlag: 0 }));
  assert.match(batchId, /^[1-9]\d*$/);
  await post(`/batches/${batchId}/calculate`, {});
  let batch; const deadline = Date.now() + 180000;
  do {
    batch = await read(`/batches/${batchId}`);
    if (batch.batch.status !== 'CALCULATING') break;
    await new Promise(resolve => setTimeout(resolve, 500));
  } while (Date.now() < deadline);
  check('真实后台算薪只处理当前借款员工', batch.batch.status === 'CALCULATED' && batch.employees.length === 1
    && batch.employees[0].calcStatus === 'SUCCESS' && String(batch.employees[0].employeeId) === employeeId);
  const salaryId = String(batch.employees[0].salarySlipId); assert.match(salaryId, /^[1-9]\d*$/);
  await post(`/batches/${batchId}/submit`, {});
  const slip = await read(`/slips/${salaryId}`);
  const snapshot = slip.components.find(item => item.type === 'TAX_SNAPSHOT');
  check('封存工资保留明确计薪周期且不晚于离职日，并扣还50元', slip.status === 'SUBMITTED' && snapshot.periodStart === startDate && snapshot.periodEnd === endDate && endDate <= relievingDate
    && slip.components.filter(item => item.sourceBizType === 'HR_ADVANCE').length === 1
    && Number(slip.components.find(item => item.sourceBizType === 'HR_ADVANCE').amount) === 50 && balance() === '100.00:0.00:50.00');
  const digest = database(`SELECT digest_sha256 FROM hr_salary_slip WHERE tenant_id=100000 AND id=${salaryId};`);
  assert.match(digest, /^[a-f0-9]{64}$/i);
  const text = String(slip.netTotal); assert.match(text, /^\d+(?:\.\d{1,2})?$/);
  const [whole, decimal = ''] = text.split('.');
  const netAmount = `${whole}.${decimal.padEnd(2, '0')}`;
  return { salaryId, batchId, periodId, digest, netAmount, startDate, endDate, relievingDate, explicitPeriod: Boolean(selectedPeriodId) };
}

export function verifySettlementPayrollStage({ database, check, payroll, stage, ledger, settlementId, reversalId, row }) {
  const originals = ledger.filter(item => item.salary === payroll.salaryId && item.reversalOf === null);
  const initial = originals[0];
  const restored = ['restored', 'replacementDraft'].includes(stage);
  const posted = ['posted', 'reversalPending'].includes(stage);
  check(`工资预扣组合${stage}保留原工资摘要和唯一扣还来源`, Boolean(initial) && initial.type === 'SALARY' && initial.amount === '50.00'
    && initial.settlement === null && originals.length === (restored ? 2 : 1)
    && database(`SELECT digest_sha256 FROM hr_salary_slip WHERE tenant_id=100000 AND id=${payroll.salaryId};`) === payroll.digest);
  if (restored) {
    const refund = ledger.find(item => item.reversalOf === initial.id);
    const reservation = originals.find(item => item.id !== initial.id);
    check('冲正退回工资已扣50元并重建原工资预约', initial.status === 'REVERSED' && refund?.amount === '-50.00'
      && refund.type === 'SALARY' && refund.status === 'POSTED' && refund.salary === null && refund.settlement === reversalId
      && reservation?.status === 'RESERVED' && reservation.amount === '50.00'
      && reservation.key.endsWith(`:AFTER:${initial.id}`)
      && database(`SELECT CONCAT(status,':',COALESCE(reserved_settlement_id,'NULL')) FROM hr_salary_slip WHERE tenant_id=100000 AND id=${payroll.salaryId};`) === 'SUBMITTED:NULL');
  } else {
    const held = ['submitted', 'approved', 'confirmed'].includes(stage);
    check(`工资预扣组合${stage}不重复收取工资扣款`, initial.status === (posted ? 'POSTED' : 'RESERVED')
      && database(`SELECT CONCAT(status,':',COALESCE(reserved_settlement_id,'NULL')) FROM hr_salary_slip WHERE tenant_id=100000 AND id=${payroll.salaryId};`)
        === `${posted ? 'PAID' : 'SUBMITTED'}:${posted || held ? settlementId : 'NULL'}`);
  }
  if (row && ['calculated', 'submitted', 'approved', 'confirmed', 'replacementDraft'].includes(stage)) {
    const wage = row.items.find(item => item.sourceBizType === 'HR_SALARY_SLIP' && String(item.sourceBizId) === payroll.salaryId);
    const advance = row.items.find(item => item.sourceBizType === 'HR_ADVANCE');
    check(`工资预扣组合${stage}将50元工资扣还与50元结算应收分别计入`, wage?.amount === payroll.netAmount && advance?.amount === '50.00'
      && advance.evidence.payrollReserved === '50.00' && advance.evidence.settlementReceivable === '50.00'
      && Number(wage.evidence.components.find(item => item.sourceBizType === 'HR_ADVANCE').amount) === 50);
  }
}
