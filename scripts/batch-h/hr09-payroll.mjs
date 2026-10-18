import { randomInt } from 'node:crypto';
import { check, jsonRows, sqlText, until, pause } from './live-lib.mjs';
import { hundredths, decimal, payAmount } from './hr09-evidence.mjs';

const compensation = '/hr/compensation';
const payroll = `${compensation}/payroll`;
const overtime = '/hr/attendance/overtime-requests';

export function payrollWorkDates(month) {
  if (!/^2026-(0[1-9]|1[0-2])$/.test(month)) throw new Error('H_HR_PAYROLL_MONTH_INVALID');
  const dates = [];
  for (let day = 1; day <= 31; day++) {
    const date = new Date(`${month}-${String(day).padStart(2, '0')}T00:00:00Z`);
    if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 7) !== month) break;
    if (![0, 6].includes(date.getUTCDay())) dates.push(date.toISOString().slice(0, 10));
  }
  return dates;
}

export function conditionalPayrollTotals(salary, overtimeAmount) {
  const gross = hundredths(salary) + hundredths(overtimeAmount);
  const tax = (gross + 5n) / 10n;
  return { gross: decimal(gross), tax: decimal(tax), net: decimal(gross - tax) };
}

export function syntheticPayGrade(label, salary) {
  if (label !== 'H-20260914-HR09' || hundredths(salary) <= 0n) throw new Error('H_HR_PAY_GRADE_ISOLATION_REQUIRED');
  return { gradeCode: `${label}-PAY`, gradeName: `${label} 临时CNY薪级`,
    minSalary: salary, midSalary: salary, maxSalary: salary, currency: 'CNY', status: 1 };
}

async function updateVersioned(context, table, idField, id, endpoint, payload) {
  const found = jsonRows(`SELECT JSON_OBJECT('version',version) FROM ${table} WHERE tenant_id=100000 AND ${idField}=${sqlText(id)}`);
  check('隔离配置更新使用真实当前版本', found.length === 1 && Number.isInteger(found[0].version));
  return context.ok('admin', endpoint, 'PUT', { ...payload, version: found[0].version });
}

export async function preparePayFixture(context) {
  const { fixture, employeeId, label, note, ok, save, resource, lookup } = context;
  const targetEmployee = employeeId('employee');
  if (!fixture.payroll) {
    const existing = jsonRows(`SELECT JSON_OBJECT('kind','compensation','id',CAST(id AS CHAR)) FROM hr_employee_comp
      WHERE tenant_id=100000 AND employee_id=${sqlText(targetEmployee)} AND deleted=0
      UNION ALL SELECT JSON_OBJECT('kind','taxProfile','id',CAST(id AS CHAR)) FROM hr_tax_profile
      WHERE tenant_id=100000 AND employee_id=${sqlText(targetEmployee)}`);
    check('隔离验收员工尚无薪资分配及税务档案', existing.length === 0);
    fixture.payroll = { employeeId: targetEmployee, synthetic: true, salary: `${randomInt(8000, 10000)}.00`, hourlyRate: '20.00',
      originalTaxSlabs: await ok('admin', `${payroll}/config/tax-slabs`) };
    await save();
  }
  const state = fixture.payroll;
  check('临时薪资依据仅属于隔离验收员工', state.synthetic === true && state.employeeId === targetEmployee);
  if (!state.requestId) state.hourlyRate = '20.00';
  fixture.restorationRequired = true;
  state.restorationRequired = true;
  state.baselineRestorationRequired = true;
  await save();
  state.grade = syntheticPayGrade(label, state.salary);
  await resource('payGrade', 'admin', `${compensation}/grades`, state.grade,
    lookup('hr_comp_grade', 'grade_code', state.grade.gradeCode));
  const gradeIsolation = jsonRows(`SELECT JSON_OBJECT('id',CAST(grade.id AS CHAR),'otherEmployees',
    (SELECT COUNT(*) FROM hr_employee_comp assignment WHERE assignment.tenant_id=grade.tenant_id
      AND assignment.grade_id=grade.id AND assignment.employee_id<>${sqlText(targetEmployee)} AND assignment.deleted=0))
    FROM hr_comp_grade grade WHERE grade.tenant_id=100000 AND grade.id=${sqlText(fixture.ids.payGrade)}
      AND grade.grade_code=${sqlText(state.grade.gradeCode)}`);
  check('原专属薪级保持隔离且无其他员工引用', gradeIsolation.length === 1
    && gradeIsolation[0].id === fixture.ids.payGrade && Number(gradeIsolation[0].otherEmployees) === 0);
  state.encryptedGrade = { ...state.grade, gradeCode: `${label}-PAY-SEALED`, gradeName: `${label} 临时密文薪级` };
  await resource('payEncryptedGrade', 'admin', `${compensation}/grades`, state.encryptedGrade,
    lookup('hr_comp_grade', 'grade_code', state.encryptedGrade.gradeCode));
  const sealedGrade = jsonRows(`SELECT JSON_OBJECT('id',CAST(grade.id AS CHAR),'encrypted',
    grade.min_salary NOT REGEXP '^[0-9]+([.][0-9]+)?$' AND grade.mid_salary NOT REGEXP '^[0-9]+([.][0-9]+)?$'
    AND grade.max_salary NOT REGEXP '^[0-9]+([.][0-9]+)?$','otherEmployees',
    (SELECT COUNT(*) FROM hr_employee_comp assignment WHERE assignment.tenant_id=grade.tenant_id
      AND assignment.grade_id=grade.id AND assignment.employee_id<>${sqlText(targetEmployee)} AND assignment.deleted=0))
    FROM hr_comp_grade grade WHERE grade.tenant_id=100000 AND grade.id=${sqlText(fixture.ids.payEncryptedGrade)}
      AND grade.grade_code=${sqlText(state.encryptedGrade.gradeCode)}`);
  check('真实新增专属薪级三金额均为密文且未关联其他员工', sealedGrade.length === 1
    && sealedGrade[0].id === fixture.ids.payEncryptedGrade && Number(sealedGrade[0].encrypted) === 1
    && Number(sealedGrade[0].otherEmployees) === 0 && fixture.ids.payEncryptedGrade !== fixture.ids.payGrade);
  const grades = await ok('admin', `${compensation}/grades?keyword=${encodeURIComponent(state.encryptedGrade.gradeCode)}`);
  const readableGrade = grades.find(row => String(row.id) === fixture.ids.payEncryptedGrade);
  check('本轮密文薪级三金额可由当前测试密钥正确读取', Boolean(readableGrade)
    && ['minSalary', 'midSalary', 'maxSalary'].every(key => readableGrade[key] != null && hundredths(readableGrade[key]) === hundredths(state.salary)));
  state.structure = { structureCode: `${label}-PAY`, structureName: `${label} 临时月薪结构`, description: note, status: 1, componentConfig: {} };
  await resource('payStructure', 'admin', `${compensation}/structures`, state.structure, lookup('hr_comp_structure', 'structure_code', `${label}-PAY`));
  await updateVersioned(context, 'hr_comp_structure', 'id', fixture.ids.payStructure,
    `${compensation}/structures/${fixture.ids.payStructure}`, state.structure);
  await ok('admin', `${payroll}/structures/${fixture.ids.payStructure}`, 'PUT', {
    salaryBasis: 'MONTHLY', prorationBasis: 'WORKDAYS', benefitTiming: 'FIRST_PAYROLL',
  });
  state.baselineAssignment ||= { employeeId: targetEmployee, structureId: fixture.ids.payStructure, gradeId: fixture.ids.payGrade,
    componentValues: {}, totalSalary: state.salary, effectiveDate: '2026-07-01', status: 'INACTIVE' };
  state.assignment = { employeeId: targetEmployee, structureId: fixture.ids.payStructure, gradeId: fixture.ids.payEncryptedGrade,
    componentValues: {}, totalSalary: state.salary, effectiveDate: '2026-07-01', status: 'ACTIVE' };
  await resource('payAssignment', 'admin', `${compensation}/employee-compensations`, state.assignment,
    `SELECT JSON_OBJECT('id',CAST(id AS CHAR)) FROM hr_employee_comp WHERE tenant_id=100000 AND employee_id=${sqlText(targetEmployee)} AND deleted=0`);
  await updateVersioned(context, 'hr_employee_comp', 'id', fixture.ids.payAssignment,
    `${compensation}/employee-compensations/${fixture.ids.payAssignment}`, state.assignment);
  state.slab = { slabName: `${label} 临时七档条件税表`, region: 'H-HR09-TEST', effectiveFrom: '2026-01-01', effectiveTo: '2026-12-31',
    thresholdAmount: '0.00', status: 'DRAFT', remark: note };
  await resource('payTaxSlab', 'admin', `${payroll}/tax-slabs`, state.slab, lookup('hr_tax_slab', 'slab_name', state.slab.slabName, 'slab_id'));
  if (!state.detailsConfigured) {
    await ok('admin', `${payroll}/tax-slabs/${fixture.ids.payTaxSlab}/details`, 'PUT', Array.from({ length: 7 }, (_unused, index) => ({
      levelNo: index + 1, fromAmount: String(index * 30000), toAmount: index === 6 ? null : String((index + 1) * 30000),
      taxRate: '0.10', quickDeduction: '0.00',
    })));
    state.detailsConfigured = true;
    await save();
  }
  await updateVersioned(context, 'hr_tax_slab', 'slab_id', fixture.ids.payTaxSlab,
    `${payroll}/tax-slabs/${fixture.ids.payTaxSlab}`, { ...state.slab, status: 'ACTIVE' });
  state.profile = { employeeId: targetEmployee, taxResidenceCity: 'H-HR09-TEST', taxSlabId: fixture.ids.payTaxSlab,
    threshold: '0.00', taxConfig: {}, status: 'ACTIVE' };
  await resource('payTaxProfile', 'admin', `${compensation}/tax-profiles`, state.profile,
    `SELECT JSON_OBJECT('id',CAST(id AS CHAR)) FROM hr_tax_profile WHERE tenant_id=100000 AND employee_id=${sqlText(targetEmployee)}`);
  await updateVersioned(context, 'hr_tax_profile', 'id', fixture.ids.payTaxProfile,
    `${compensation}/tax-profiles/${fixture.ids.payTaxProfile}`, state.profile);
  const ready = jsonRows(`SELECT JSON_OBJECT('employeeId',CAST(assignment.employee_id AS CHAR),'active',
      assignment.status='ACTIVE' AND assignment.effective_date<='2026-07-01' AND structure_row.status=1 AND grade.currency='CNY' AND grade.status=1
      AND profile.status='ACTIVE' AND slab.status='ACTIVE','slabDetails',
      (SELECT COUNT(*) FROM hr_tax_slab_detail detail WHERE detail.tenant_id=100000 AND detail.slab_id=slab.slab_id AND detail.deleted=0))
    FROM hr_employee_comp assignment JOIN hr_comp_structure structure_row ON structure_row.id=assignment.structure_id AND structure_row.tenant_id=assignment.tenant_id
    JOIN hr_comp_grade grade ON grade.id=assignment.grade_id AND grade.tenant_id=assignment.tenant_id
    JOIN hr_tax_profile profile ON profile.employee_id=assignment.employee_id AND profile.tenant_id=assignment.tenant_id
    JOIN hr_tax_slab slab ON slab.slab_id=profile.tax_slab_id AND slab.tenant_id=profile.tenant_id
    WHERE assignment.tenant_id=100000 AND assignment.id=${sqlText(fixture.ids.payAssignment)} AND assignment.deleted=0`);
  check('真实API补齐唯一有效薪资及完整七档测试税表', ready.length === 1 && ready[0].employeeId === targetEmployee
    && Number(ready[0].active) === 1 && Number(ready[0].slabDetails) === 7);
  fixture.completed['pay-fixture'] = true;
  await save();
}

export async function restorePayFixture(context, attempt) {
  const { fixture, save } = context;
  const state = fixture.payroll;
  if (!state?.restorationRequired) return;
  if (fixture.ids.payAssignment) await attempt('synthetic-pay-assignment-disable', () => updateVersioned(context,
    'hr_employee_comp', 'id', fixture.ids.payAssignment, `${compensation}/employee-compensations/${fixture.ids.payAssignment}`, { ...(state.baselineAssignment || state.assignment), status: 'INACTIVE' }));
  if (fixture.ids.payTaxProfile) await attempt('synthetic-pay-profile-disable', () => updateVersioned(context,
    'hr_tax_profile', 'id', fixture.ids.payTaxProfile, `${compensation}/tax-profiles/${fixture.ids.payTaxProfile}`, { ...state.profile, status: 'INACTIVE' }));
  if (fixture.ids.payTaxSlab) await attempt('synthetic-pay-tax-disable', () => updateVersioned(context,
    'hr_tax_slab', 'slab_id', fixture.ids.payTaxSlab, `${payroll}/tax-slabs/${fixture.ids.payTaxSlab}`, { ...state.slab, status: 'INACTIVE' }));
  if (fixture.ids.payStructure) await attempt('synthetic-pay-structure-disable', () => updateVersioned(context,
    'hr_comp_structure', 'id', fixture.ids.payStructure, `${compensation}/structures/${fixture.ids.payStructure}`, { ...state.structure, status: 0 }));
  await save();
}

export async function verifyPayFixtureRestoration(context) {
  const { fixture, ok, save } = context;
  const state = fixture.payroll;
  if (!state) return;
  state.restorationRequired = true;
  await save();
  const resources = [
    ['payAssignment', 'hr_employee_comp', 'id', 'INACTIVE'], ['payTaxProfile', 'hr_tax_profile', 'id', 'INACTIVE'],
    ['payTaxSlab', 'hr_tax_slab', 'slab_id', 'INACTIVE'], ['payStructure', 'hr_comp_structure', 'id', '0'],
  ];
  const restoredResources = [];
  for (const [key, table, idField, status] of resources) {
    if (!fixture.ids[key]) continue;
    const found = jsonRows(`SELECT JSON_OBJECT('id',CAST(${idField} AS CHAR),'status',CAST(status AS CHAR),'version',version) FROM ${table}
      WHERE tenant_id=100000 AND ${idField}=${sqlText(fixture.ids[key])}`);
    check('新增隔离薪资配置已恢复停用', found.length === 1 && found[0].status === status, { resource: key });
    restoredResources.push({ resource: key, ...found[0] });
  }
  const taxSlabs = await ok('admin', `${payroll}/config/tax-slabs`);
  const originals = taxSlabs.filter(row => String(row.slabId) !== fixture.ids.payTaxSlab);
  check('既有正式及历史税表完整保持原值', JSON.stringify(originals) === JSON.stringify(state.originalTaxSlabs));
  const active = jsonRows(`SELECT JSON_OBJECT('count',COUNT(*)) FROM hr_employee_comp WHERE tenant_id=100000
    AND grade_id IN (${[fixture.ids.payGrade, fixture.ids.payEncryptedGrade].filter(Boolean).map(sqlText).join(',') || '0'}) AND status='ACTIVE' AND deleted=0`);
  check('隔离测试薪级未留下有效薪资分配', Number(active[0]?.count) === 0);
  state.restorationRequired = false;
  state.restorationEvidence = { checkedAt: new Date().toISOString(), disabledCount: restoredResources.length, resources: restoredResources,
    originalTaxSlabsUnchanged: true,
    baselineRestorationRequired: state.baselineRestorationRequired === true,
    baselineRestorationEvidence: state.baselineRestorationEvidence ?? null,
    activeGradeHasNoActiveAssignment: true, syntheticPolicyOnly: true };
  await save();
}

async function preparePayrollAttendance(context, period) {
  const { fixture, employeeId, ok, cards, save } = context;
  const month = period.start.slice(0, 7);
  check('条件算薪使用完整月度周期', period.start === `${month}-01` && period.end === `${month}-31` && month === '2026-08');
  const dates = payrollWorkDates(month);
  for (const date of dates) await cards('employee', date, '09:00:00', '17:00:00');
  const records = () => jsonRows(`SELECT JSON_OBJECT('date',CAST(attendance_date AS CHAR),'status',status,'manual',manual_adjusted_flag)
    FROM hr_attendance_record WHERE tenant_id=100000 AND employee_id=${sqlText(employeeId('employee'))}
    AND attendance_date BETWEEN ${sqlText(period.start)} AND ${sqlText(period.end)} AND deleted=0 ORDER BY attendance_date`);
  const months = jsonRows(`SELECT JSON_OBJECT('status',status) FROM hr_attendance_monthly WHERE tenant_id=100000
    AND employee_id=${sqlText(employeeId('employee'))} AND year=2026 AND month=8`);
  check('隔离员工月度考勤不重复', months.length <= 1);
  if (!months.some(row => row.status === 'CONFIRMED')) {
    const calculated = await ok('admin', '/hr/attendance/recalculate', 'POST', { employeeIds: [employeeId('employee')],
      startDate: period.start, endDate: period.end, confirmed: true, forceOverwrite: false });
    check('日考勤由真实原始卡自动计算', calculated.asynchronous === false && calculated.affected > 0);
    await ok('admin', `/hr/attendance/monthly/summarize?employeeId=${employeeId('employee')}&month=${month}`, 'POST');
    await ok('admin', `/hr/attendance/monthly/confirm?employeeId=${employeeId('employee')}&month=${month}`, 'POST');
  }
  const daily = records();
  check('工作日日考勤齐备且未人工伪造结果', dates.every(date => daily.some(row => row.date === date && row.status === 'NORMAL' && Number(row.manual) === 0)));
  fixture.completed['payroll-real-attendance'] = true;
  await save();
}

async function paySettlement(context) {
  const { fixture, employeeId, ok, call, save, cards, draft, recoverableOvertime, approveRequest, approvalActors, sessions, note } = context;
  const state = fixture.payroll;
  const approvedMinutes = 120;
  await cards('employee', '2026-07-20', '09:00:00', '19:30:00');
  let request = await recoverableOvertime('pay-normal', draft('2026-07-20', '17:30', '19:30', 'PAY'));
  state.requestId = request.requestId;
  await save();
  if (request.status === 'DRAFT') {
    request = await ok('employee', `${overtime}/${request.requestId}/submit`, 'POST', { version: request.version });
    check('PAY真实提交保留未核定状态及两小时原始证据', request.status === 'SUBMITTED'
      && request.actualMinutes === approvedMinutes && request.approvedMinutes == null);
  }
  if (request.status === 'SUBMITTED' && request.approvedMinutes == null) {
    request = await ok(approvalActors.reviewer, `${overtime}/${request.requestId}/review-hours`, 'POST', { version: request.version, approvedMinutes, note });
    check('PAY先由HR核定真实工时且尚未启动审批', request.status === 'SUBMITTED' && request.approvedMinutes === approvedMinutes && !request.instanceId);
  }
  if (request.status === 'SUBMITTED') {
    const periods = jsonRows(`SELECT JSON_OBJECT('id',CAST(period_id AS CHAR),'start',CAST(start_date AS CHAR),'end',CAST(end_date AS CHAR),'status',status)
      FROM hr_payroll_period WHERE tenant_id=100000 AND deleted=0 AND status='OPEN' AND start_date>'2026-07-20' ORDER BY start_date,period_id`);
    check('首个可核价开放周期存在且未生成该员工工资', periods.length >= 2 && periods[0].start === '2026-08-01');
    state.period = periods[0];
    state.expectedAmount = payAmount(approvedMinutes, state.hourlyRate, request.rateMultiplier);
    await save();
    const input = { version: request.version, hourlyRate: state.hourlyRate, payrollPeriodId: state.period.id, note };
    const self = await call('employee', `${overtime}/${request.requestId}/review-pay`, 'POST', input);
    check('员工无法给本人PAY核价', self.status === 403 || [403, 'FORBIDDEN'].includes(self.body?.code));
    const wrong = await call('finance', `${overtime}/${request.requestId}/review-pay`, 'POST', { ...input, payrollPeriodId: periods[1].id });
    check('真实核价拒绝跳过首个可用工资周期', wrong.body?.code === 'PAYROLL_TARGET_INVALID');
    request = await ok('finance', `${overtime}/${request.requestId}/review-pay`, 'POST', input);
    const priced = await ok('finance', `${overtime}/${request.requestId}/settlement`);
    check('真实核价冻结财务身份金额及目标周期', priced.pricedBy === sessions.accounts.finance.userId
      && priced.payrollPeriodId === state.period.id && priced.hourlyRate === state.hourlyRate && priced.settlementAmount === state.expectedAmount
      && priced.currency === 'CNY' && priced.settlementStatus === 'NOT_READY');
    const preview = await ok('finance', `${payroll}/batches/preview`, 'POST', { payrollPeriodId: state.period.id,
      employeeIds: [employeeId('employee')], validateAttendanceFlag: 1, deductUnverifiedFlag: 0 });
    check('尚未结清PAY真实阻止算薪员工进入批次', preview.length === 1 && preview[0].calcStatus === 'SKIPPED'
      && /加班/.test(String(preview[0].errorMessage)));
  }
  if (['PENDING', 'APPROVING'].includes(request.status)) await pendingPayrollBoundary(context);
  await approveRequest(overtime, request.requestId, 'overtime');
  const settled = await until(() => ok('finance', `${overtime}/${request.requestId}/settlement`),
    value => ['SETTLED', 'FAILED', 'NEEDS_RESOLUTION'].includes(value.settlementStatus), 'PAY真实结算完成');
  check('PAY终审后真实生成唯一加班薪资变动', settled.settlementStatus === 'SETTLED' && settled.settledFlag === 1 && Boolean(settled.compChangeId)
    && !settled.payrollCorrectionId && !settled.leaveLedgerId && settled.settlementAmount === state.expectedAmount && settled.payrollPeriodId === state.period.id,
  { settlementStatus: settled.settlementStatus, errorCode: settled.lastErrorCode });
  const sources = () => jsonRows(`SELECT JSON_OBJECT('id',CAST(id AS CHAR),'status',status,'periodId',CAST(payroll_period_id AS CHAR),
    'employeeId',CAST(employee_id AS CHAR),'componentId',CAST(salary_component_id AS CHAR),'encrypted',change_amount NOT REGEXP '^[0-9]+([.][0-9]+)?$')
    FROM hr_comp_change WHERE tenant_id=100000 AND source_biz_type='HR_OVERTIME' AND source_biz_id=${sqlText(request.requestId)}`);
  const changes = sources();
  check('工资变动来源金额密文与冻结周期一致', changes.length === 1 && changes[0].id === settled.compChangeId && changes[0].status === 'APPROVED'
    && changes[0].periodId === state.period.id && changes[0].employeeId === employeeId('employee')
    && changes[0].componentId === settled.salaryComponentId && Number(changes[0].encrypted) === 1);
  const protectedChange = await call('admin', `${compensation}/changes/${settled.compChangeId}/cancel`, 'POST');
  check('普通工资变动接口不能篡改HR加班来源', protectedChange.body?.code === 'OVERTIME_SOURCE_IMMUTABLE');
  const cancelled = await call('employee', `${overtime}/${request.requestId}/cancel`, 'POST', { version: settled.version, reason: note });
  check('已结算PAY不得普通撤回抹账', cancelled.body?.code === 'CANCEL_NOT_ALLOWED');
  check('拒绝篡改及撤回后PAY来源保持唯一', JSON.stringify(sources()) === JSON.stringify(changes));
  state.changeId = settled.compChangeId;
  fixture.completed['pay-settlement'] = true;
  await save();
}

async function pendingPayrollBoundary(context) {
  const { fixture, employeeId, ok, call, save } = context;
  const state = fixture.payroll;
  if (fixture.completed['pay-pending-payroll-guard']) return;
  const periodState = () => jsonRows(`SELECT JSON_OBJECT('status',status,'version',version) FROM hr_payroll_period
    WHERE tenant_id=100000 AND period_id=${sqlText(state.period.id)} AND deleted=0`);
  const beforePeriod = periodState();
  check('审批中关账边界使用真实开放原周期', beforePeriod.length === 1 && beforePeriod[0].status === 'OPEN');
  const closed = await call('admin', `${payroll}/periods/${state.period.id}/close`, 'POST');
  check('未结清PAY真实阻止工资周期关闭', closed.body?.code === 'OVERTIME_SETTLEMENT_PENDING');
  check('关账拒绝不改变原周期状态及版本', JSON.stringify(periodState()) === JSON.stringify(beforePeriod));
  if (!state.guardedBatchId) {
    const previous = jsonRows(`SELECT JSON_OBJECT('id',CAST(batch.batch_id AS CHAR)) FROM hr_payroll_batch batch
      JOIN hr_payroll_batch_employee selected ON selected.batch_id=batch.batch_id AND selected.tenant_id=batch.tenant_id
      WHERE batch.tenant_id=100000 AND batch.deleted=0 AND batch.status<>'CANCELLED' AND batch.employee_count=1
      AND batch.posting_date='2026-08-30' AND batch.payroll_period_id=${sqlText(state.period.id)}
      AND selected.employee_id=${sqlText(employeeId('employee'))} AND selected.calc_status='SKIPPED'`);
    check('审批中算薪边界批次恢复不重复创建', previous.length <= 1);
    state.guardedBatchId = previous[0]?.id || String(await ok('finance', `${payroll}/batches`, 'POST', {
      payrollPeriodId: state.period.id, employeeIds: [employeeId('employee')], postingDate: '2026-08-30',
      validateAttendanceFlag: 1, deductUnverifiedFlag: 0,
    }));
    await save();
  }
  let result = await ok('finance', `${payroll}/batches/${state.guardedBatchId}`);
  if (result.batch.status === 'DRAFT') await ok('finance', `${payroll}/batches/${state.guardedBatchId}/calculate`, 'POST');
  result = await until(() => ok('finance', `${payroll}/batches/${state.guardedBatchId}`),
    value => !['DRAFT', 'CALCULATING'].includes(value.batch.status), '审批期间真实算薪隔离检查');
  if (result.batch.status !== 'CANCELLED') {
    check('审批中真实算薪不制造该员工工资单', result.batch.status === 'CALCULATED' && result.employees.length === 1
      && result.employees[0].calcStatus === 'SKIPPED' && !result.employees[0].salarySlipId);
    const submit = await call('finance', `${payroll}/batches/${state.guardedBatchId}/submit`, 'POST');
    check('无工资结果的审批中批次禁止提交', submit.body?.code === 'PAYROLL_ERRORS_REMAIN');
    await ok('finance', `${payroll}/batches/${state.guardedBatchId}/cancel`, 'POST');
  }
  const slips = jsonRows(`SELECT JSON_OBJECT('count',COUNT(*)) FROM hr_salary_slip
    WHERE tenant_id=100000 AND batch_id=${sqlText(state.guardedBatchId)}`);
  check('审批期间算薪边界已真实取消且没有伪造PAID原单', Number(slips[0]?.count) === 0
    && (await ok('finance', `${payroll}/batches/${state.guardedBatchId}`)).batch.status === 'CANCELLED');
  fixture.completed['pay-pending-payroll-guard'] = true;
  fixture.completed['pay-pending-close-guard'] = true;
  await save();
}

export async function runPayAcceptance(context) {
  const { fixture, employeeId, ok, call, save } = context;
  await preparePayFixture(context);
  await paySettlement(context);
  const state = fixture.payroll;
  await preparePayrollAttendance(context, state.period);
  if (!state.batchId) {
    const candidates = jsonRows(`SELECT JSON_OBJECT('id',CAST(batch.batch_id AS CHAR)) FROM hr_payroll_batch batch
      JOIN hr_payroll_batch_employee selected ON selected.batch_id=batch.batch_id AND selected.tenant_id=batch.tenant_id
      WHERE batch.tenant_id=100000 AND batch.deleted=0 AND batch.status<>'CANCELLED' AND batch.employee_count=1
      AND batch.payroll_period_id=${sqlText(state.period.id)} AND selected.employee_id=${sqlText(employeeId('employee'))}`);
    check('恢复真实算薪批次不重复创建', candidates.length <= 1);
    state.batchId = candidates[0]?.id || String(await ok('finance', `${payroll}/batches`, 'POST', {
      payrollPeriodId: state.period.id, employeeIds: [employeeId('employee')], postingDate: state.period.end,
      validateAttendanceFlag: 1, deductUnverifiedFlag: 0,
    }));
    await save();
  }
  let batch = await ok('finance', `${payroll}/batches/${state.batchId}`);
  check('真实工资批次仅包含隔离员工且未关闭考勤验证', batch.employees.length === 1
    && String(batch.employees[0].employeeId) === employeeId('employee') && Number(batch.batch.validateAttendanceFlag) === 1);
  if (batch.batch.status === 'DRAFT') await ok('finance', `${payroll}/batches/${state.batchId}/calculate`, 'POST');
  batch = await until(() => ok('finance', `${payroll}/batches/${state.batchId}`), value => value.batch.status !== 'CALCULATING' && value.batch.status !== 'DRAFT', '真实工资异步计算');
  check('真实工资计算仅有一个成功结果', ['CALCULATED', 'SUBMITTED', 'PAID'].includes(batch.batch.status)
    && batch.employees.length === 1 && batch.employees[0].calcStatus === 'SUCCESS' && Boolean(batch.employees[0].salarySlipId),
  { status: batch.batch.status, employeeStatuses: batch.employees.map(row => row.calcStatus) });
  state.slipId = String(batch.employees[0].salarySlipId);
  await save();
  const slip = await ok('finance', `${payroll}/slips/${state.slipId}`);
  const expected = conditionalPayrollTotals(state.salary, state.expectedAmount);
  const sources = slip.components.filter(value => String(value.changeId) === state.changeId);
  check('真实工资明细仅包含一次H加班来源及正确金额', sources.length === 1 && String(sources[0].overtimeRequestId) === state.requestId
    && hundredths(sources[0].amount) === hundredths(state.expectedAmount));
  check('临时条件税表下应发税额实发符合独立计算', hundredths(slip.grossTotal) === hundredths(expected.gross)
    && hundredths(slip.taxAmount) === hundredths(expected.tax) && hundredths(slip.netTotal) === hundredths(expected.net));
  if (batch.batch.status === 'CALCULATED') await ok('finance', `${payroll}/batches/${state.batchId}/submit`, 'POST');
  if (batch.batch.status !== 'PAID') await ok('finance', `${payroll}/batches/${state.batchId}/pay`, 'POST');
  const paid = await ok('finance', `${payroll}/slips/${state.slipId}`);
  check('隔离工资经真实提交发放形成PAID原单', paid.status === 'PAID' && String(paid.employeeId) === employeeId('employee')
    && paid.components.filter(value => String(value.changeId) === state.changeId).length === 1);
  const ciphertext = jsonRows(`SELECT JSON_OBJECT('encrypted',hourly_rate_cipher LIKE 'H1:%' AND settlement_amount_cipher LIKE 'H1:%')
    FROM hr_overtime_request WHERE tenant_id=100000 AND request_id=${sqlText(state.requestId)} AND deleted=0`);
  check('H新增时薪及结算金额持久化为密文', ciphertext.length === 1 && Number(ciphertext[0].encrypted) === 1);
  check('沿用D工资单完整性封存校验', typeof paid.digestSha256 === 'string' && /^[a-f0-9]{64}$/i.test(paid.digestSha256));
  const paidState = () => jsonRows(`SELECT JSON_OBJECT('status',batch.status,'version',batch.version,
    'slipCount',(SELECT COUNT(*) FROM hr_salary_slip slip WHERE slip.tenant_id=batch.tenant_id AND slip.batch_id=batch.batch_id AND slip.deleted=0))
    FROM hr_payroll_batch batch WHERE batch.tenant_id=100000 AND batch.batch_id=${sqlText(state.batchId)} AND batch.deleted=0`);
  const beforeReplay = paidState();
  check('重复计算前真实PAID批次仅含唯一工资单', beforeReplay.length === 1 && beforeReplay[0].status === 'PAID' && Number(beforeReplay[0].slipCount) === 1);
  await pause(5100);
  const duplicate = await call('finance', `${payroll}/batches/${state.batchId}/calculate`, 'POST');
  check('PAID批次不可重新计算重复计薪', duplicate.body?.code === 'INVALID_PAYROLL_STATE');
  const afterReplay = await ok('finance', `${payroll}/slips/${state.slipId}`);
  check('已发批次拒绝重算后状态版本单据数量及工资封存摘要不变', JSON.stringify(paidState()) === JSON.stringify(beforeReplay)
    && afterReplay.status === 'PAID' && afterReplay.digestSha256 === paid.digestSha256);
  fixture.completed['payroll-calculation'] = true;
  await save();
}
