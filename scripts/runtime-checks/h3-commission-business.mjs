import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { prepareH3PerformanceChecks } from './h3-performance-fixtures.mjs';
import { recoverH3CommissionTransmission, verifyH3CommissionPaymentRollback } from './h3-commission-recovery.mjs';

export function prepareH3CommissionChecks(runtime) {
  const context = prepareH3PerformanceChecks(runtime);
  const { database, rows, sql, identifier } = context;
  const commissionRows = eventId => rows("SELECT JSON_OBJECT('id',CAST(allocation_id AS CHAR),'user',CAST(sales_user_id AS CHAR),'employee',CAST(employee_id AS CHAR),"
    + "'amount',CAST(allocated_amount AS CHAR),'rate',CAST(commission_rate AS CHAR),'commission',CAST(commission_amount AS CHAR),'status',commission_status,"
    + "'original',CAST(reversal_of_id AS CHAR),'changeId',CAST(comp_change_id AS CHAR)) FROM crm_deal_allocation WHERE tenant_id=100000 AND event_id=" + identifier(eventId) + ' ORDER BY allocation_id;');
  const changes = allocationIds => rows("SELECT JSON_OBJECT('id',CAST(id AS CHAR),'source',source_biz_id,'employee',CAST(employee_id AS CHAR),'status',status,"
    + "'period',CAST(payroll_period_id AS CHAR),'component',CAST(salary_component_id AS CHAR),'version',version) FROM hr_comp_change WHERE tenant_id=100000"
    + " AND source_biz_type='CRM_COMMISSION' AND source_biz_id IN (" + allocationIds.map(value => sql(identifier(value))).join(',') + ') ORDER BY id;');
  const list = (actor = 'admin', extra = {}) => context.ok(actor, '/crm/deal-allocation/list?' + new URLSearchParams({ pageNum: '1', pageSize: '100', bizId: context.fixture.plan, ...extra }));
  const confirm = (ids, extra = {}) => ({ allocationIds: ids, commissionRate: '0.1234', approvalBasis: context.marker + '_提成核定依据', ...extra });
  const post = (ids, period = context.fixture.previousPeriod) => ({ allocationIds: ids, payrollPeriodId: period, salaryComponentId: context.fixture.component });
  const salary = id => rows("SELECT JSON_OBJECT('id',CAST(id AS CHAR),'employee',CAST(employee_id AS CHAR),'status',status,'gross',CAST(gross_total AS CHAR),"
    + "'net',CAST(net_total AS CHAR),'components',components,'digest',digest_sha256,'version',version) FROM hr_salary_slip WHERE tenant_id=100000 AND id=" + identifier(id) + ';')[0];
  const progress = allocationId => rows("SELECT JSON_OBJECT('id',CAST(audit.id AS CHAR),'detail',audit.after_data) FROM hr_audit_log audit JOIN hr_comp_change change_item"
    + " ON change_item.tenant_id=audit.tenant_id AND change_item.id=audit.business_id WHERE audit.tenant_id=100000 AND audit.business_domain='CRM_COMMISSION'"
    + " AND audit.operation_type='COMMISSION_PROGRESS' AND change_item.source_biz_type='CRM_COMMISSION' AND change_item.source_biz_id=" + sql(identifier(allocationId)) + ' ORDER BY audit.id;');
  return Object.assign(context, { commissionRows, changes, list, confirm, post, salary, progress });
}

export async function prepareH3CommissionSources(context) {
  const { check, fixture, createCustomer, ok, user, own, database, sql, events, saveTeam, refund, commissionRows, fixtureWrite } = context;
  const customerId = await createCustomer('提成实际到账客户', 'admin');
  const planName = context.marker + '_原收款与部分退款';
  await ok('admin', '/crm/receivable', 'POST', { receivableNo: planName, receivableName: planName, customerId,
    plannedAmount: '100.01', ownerId: user('admin'), dueDate: context.day(30) });
  fixture.plan = own('receivable', database('SELECT receivable_id FROM crm_receivable WHERE tenant_id=100000 AND receivable_no=' + sql(planName) + ' AND deleted=0;'));
  fixture.customerId = customerId; fixture.planName = planName;
  await saveTeam('RECEIVABLE', fixture.plan, [['admin', 'OWNER', '0.6000'], ['sales', 'CO_SELLER', '0.4000']]);
  const plan = await ok('admin', '/crm/receivable/' + fixture.plan);
  await ok('admin', '/crm/receivable/' + fixture.plan + '/writeoff', 'POST', { version: plan.version, amount: '100.01',
    writeoffDate: context.period.previous.endDate, remark: context.marker + '_已核对真实收款' });
  const receipt = events('RECEIVABLE', fixture.plan).at(-1);
  check('receipt_is_actual_unreversed_frozen_source', receipt?.type === 'RECEIPT' && receipt.reversal == null && receipt.amount === '100.01');
  own('event', receipt.id);
  fixtureWrite('event', receipt.id, { occurred_time: context.period.previous.endDate + ' 10:00:00' }, '独立测试历史日期输入：原款在上月到账，金额与冻结成员仍来自真实业务操作');
  fixture.receipt = receipt.id;
  fixture.original = commissionRows(receipt.id);
  check('original_split_has_exact_tail_cent', fixture.original.length === 2 && fixture.original[0].amount === '60.01' && fixture.original[1].amount === '40.00');
  check('unconfirmed_receipt_has_no_salary_source', fixture.original.every(row => row.status === 'UNCONFIRMED' && row.commission == null && row.changeId == null));
  await refund(fixture.plan, receipt.id, '33.33');
  const early = events('RECEIVABLE', fixture.plan).at(-1);
  check('early_partial_refund_uses_chosen_receipt', early.reversal === receipt.id && early.amount === '-33.33');
  own('event', early.id);
  fixtureWrite('event', early.id, { occurred_time: context.period.previous.endDate + ' 12:00:00' }, '独立测试历史日期输入：核定前退款发生在上月，审批、退款金额及原款关联均保留真实结果');
  fixture.earlyRefund = early.id;
  fixture.early = commissionRows(early.id);
  check('unconfirmed_refund_retains_original_split_and_waits', fixture.early.length === 2 && fixture.early[0].amount === '-20.00' && fixture.early[1].amount === '-13.33'
    && fixture.early.every(row => row.commission == null && row.changeId == null && row.status === 'UNCONFIRMED'));
  fixture.allocationIds = [...fixture.original, ...fixture.early].map(row => row.id);
  for (const id of fixture.allocationIds) own('allocation', id);
}

export async function prepareH3CommissionPayroll(context) {
  const { ok, own, marker, fixture, database, rows, sql, check } = context;
  fixture.component = own('component', await ok('admin', '/hr/compensation/components', 'POST', {
    componentCode: marker + '_COMMISSION', componentName: '销售提成及原款扣回_' + marker, componentType: 'VARIABLE', category: 'BONUS', taxable: 1, status: 1 }));
  const fixed = own('component', await ok('admin', '/hr/compensation/components', 'POST', {
    componentCode: marker + '_BASE', componentName: '提成验证固定工资_' + marker, componentType: 'FIXED', category: 'BASE', taxable: 1, status: 1 }));
  const structure = own('structure', await ok('admin', '/hr/compensation/structures', 'POST', {
    structureCode: marker, structureName: '提成验证薪资结构_' + marker, status: 1,
    componentConfig: { payrollBasis: { salaryBasis: 'MONTHLY', prorationBasis: 'CALENDAR_DAYS', benefitTiming: 'FIRST_PAYROLL' } } }));
  const tax = { slabName: marker, region: marker, effectiveFrom: context.period.previous.startDate.slice(0, 4) + '-01-01',
    effectiveTo: context.period.current.endDate.slice(0, 4) + '-12-31', thresholdAmount: '5000.00', status: 'DRAFT' };
  const slab = own('taxSlab', await ok('admin', '/hr/compensation/payroll/tax-slabs', 'POST', tax));
  const brackets = [[0,36000,'0.03',0],[36000,144000,'0.10',2520],[144000,300000,'0.20',16920],[300000,420000,'0.25',31920],
    [420000,660000,'0.30',52920],[660000,960000,'0.35',85920],[960000,null,'0.45',181920]];
  await ok('admin', '/hr/compensation/payroll/tax-slabs/' + slab + '/details', 'PUT', brackets.map(([fromAmount,toAmount,taxRate,quickDeduction], index) => ({ levelNo: index + 1, fromAmount, toAmount, taxRate, quickDeduction })));
  await ok('admin', '/hr/compensation/payroll/tax-slabs/' + slab, 'PUT', { ...tax, status: 'ACTIVE', version: Number(database('SELECT version FROM hr_tax_slab WHERE tenant_id=100000 AND slab_id=' + slab + ';')) });
  fixture.employees = [];
  for (const actor of ['admin', 'sales']) {
    const employeeId = context.identifier(database('SELECT id FROM hr_employee WHERE tenant_id=100000 AND user_id=' + context.user(actor) + ' AND deleted=0;'));
    await ok('admin', '/hr/compensation/employee-compensations', 'POST', { employeeId, structureId: structure,
      componentValues: { [fixed]: '10000.00' }, totalSalary: '10000.00', effectiveDate: '2020-01-01', status: 'ACTIVE' });
    await ok('admin', '/hr/compensation/tax-profiles', 'POST', { employeeId, taxSlabId: slab, status: 'ACTIVE' });
    fixture.employees.push({ actor, id: employeeId });
  }
  for (const [key, range] of [['previousPeriod', context.period.previous], ['currentPeriod', context.period.current]]) {
    const existing = rows("SELECT JSON_OBJECT('id',CAST(period_id AS CHAR),'status',status) FROM hr_payroll_period WHERE tenant_id=100000 AND deleted=0 AND start_date="
      + sql(range.startDate) + ' AND end_date=' + sql(range.endDate) + " AND frequency='MONTHLY';");
    check(key + '_unambiguous_open_period', existing.length <= 1 && (!existing.length || existing[0].status === 'OPEN'));
    fixture[key] = existing.length ? existing[0].id : own('period', await ok('admin', '/hr/compensation/payroll/periods', 'POST', {
      periodName: marker + '_' + key, frequency: 'MONTHLY', startDate: range.startDate, endDate: range.endDate, payDate: range.endDate }));
  }
}

export async function verifyH3CommissionBoundaries(context) {
  const { check, fixture, api, rejected, list, confirm, post, commissionRows, changes } = context;
  rejected(await api('readonly', '/crm/deal-allocation/list'), 'unapproved_role_cannot_read_allocations');
  for (const actor of ['manager', 'sales', 'readonly']) {
    rejected(await api(actor, '/crm/commission/confirm', { method: 'POST', body: confirm([fixture.original[0].id]) }), actor + '_cannot_confirm_commission');
    rejected(await api(actor, '/crm/commission/post', { method: 'POST', body: post([fixture.original[0].id]) }), actor + '_cannot_post_commission');
  }
  const visible = await list('manager');
  check('manager_reads_all_frozen_members_in_customer_scope', visible.rows.length === 4);
  const privateFields = ['commissionRate','commissionAmount','commissionStatus','compChangeId','payrollPeriodId','payrollPeriodName','payrollState','commissionRequested'];
  check('manager_payload_omits_all_payroll_and_commission_fields', visible.rows.every(row => privateFields.every(field => !(field in row))));
  const foreign = await list('foreign');
  check('other_tenant_cannot_read_known_allocations', foreign.rows.length === 0 && Number(foreign.total) === 0);
  rejected(await api('foreign', '/crm/commission/confirm', { method: 'POST', body: confirm([fixture.original[0].id]) }), 'other_tenant_cannot_confirm_known_allocation');
  rejected(await api('admin', '/inner/hr/comp-change/commission', { method: 'POST', body: { eventId: '00000000-0000-0000-0000-000000000000' } }), 'public_caller_cannot_forge_internal_commission');
  rejected(await api('admin', '/crm/commission/post', { method: 'POST', body: post([fixture.original[0].id]) }), 'unconfirmed_commission_cannot_enter_salary');
  for (const rate of ['-0.0001','1.0001','0.12345']) rejected(await api('admin', '/crm/commission/confirm', { method: 'POST', body: confirm([fixture.original[0].id], { commissionRate: rate }) }), 'invalid_rate_' + rate);
  rejected(await api('admin', '/crm/commission/confirm', { method: 'POST', body: confirm([fixture.early[0].id]) }), 'refund_cannot_override_original_commission_rate');
  rejected(await api('admin', '/crm/commission/confirm', { method: 'POST', body: confirm([fixture.original[0].id, fixture.original[0].id]) }), 'duplicate_allocation_selection_rejected');
  check('rejected_requests_leave_money_and_payroll_unchanged', JSON.stringify(commissionRows(fixture.receipt)) === JSON.stringify(fixture.original) && changes(fixture.allocationIds).length === 0);
  context.evidence.permissions = true;
}

export async function verifyH3CommissionConfirmation(context) {
  const { ok, api, rejected, fixture, confirm, post, commissionRows, changes, check, waitFor } = context;
  const ids = fixture.original.map(row => row.id);
  await ok('finance', '/crm/commission/confirm', 'POST', confirm(ids, { commissionAmount: '999999.99', compChangeId: '1' }));
  const original = commissionRows(fixture.receipt), early = commissionRows(fixture.earlyRefund);
  check('approved_original_commission_uses_exact_original_amounts', original[0].commission === '7.41' && original[1].commission === '4.94' && original.every(row => row.rate === '0.1234'));
  check('prior_partial_refund_recomputed_from_original_commission', early[0].commission === '-2.47' && early[1].commission === '-1.65' && early.every(row => row.rate === '0.1234'));
  await waitFor(() => changes(fixture.early.map(row => row.id)), rows => rows.length === 2 && rows.every(row => row.status === 'DRAFT' && row.period == null), 'Automatic pending recovery was not persisted');
  check('pending_refunds_are_not_approved_payroll', changes(fixture.early.map(row => row.id)).every(row => row.status === 'DRAFT' && row.component == null));
  await new Promise(resolve => setTimeout(resolve, 5100));
  await ok('finance', '/crm/commission/confirm', 'POST', confirm(ids));
  rejected(await api('finance', '/crm/commission/confirm', { method: 'POST', body: confirm(ids, { commissionRate: '0.1250' }) }), 'approved_rate_cannot_be_rewritten');
  rejected(await api('finance', '/crm/commission/confirm', { method: 'POST', body: confirm(ids, { approvalBasis: '替换原核定依据' }) }), 'approved_basis_cannot_be_rewritten');
  rejected(await api('finance', '/crm/commission/post', { method: 'POST', body: post(fixture.early.map(row => row.id)) }), 'unpaid_original_required_before_refund_selection');
  rejected(await api('finance', '/crm/commission/post', { method: 'POST', body: post(ids) }), 'known_pending_refunds_required_with_unpaid_original');
  const first = changes(fixture.early.map(row => row.id))[0];
  for (const action of ['approve','cancel','submit']) rejected(await api('admin', '/hr/compensation/changes/' + first.id + '/' + action, { method: 'POST' }), 'generic_compensation_action_cannot_change_origin_' + action);
  rejected(await api('admin', '/hr/compensation/changes', { method: 'POST', body: { employeeId: fixture.employees[0].id, changeType: 'BONUS', afterTotal: '8888.88',
    changeAmount: '8888.88', effectiveDate: context.day(), sourceBizType: 'CRM_COMMISSION', sourceBizId: fixture.original[0].id } }), 'generic_compensation_cannot_forge_commission');
  check('forged_generic_changes_do_not_create_an_original_salary_source', changes(ids).length === 0);
  context.evidence.confirmation = true;
}

export async function verifyH3CommissionPosting(context) {
  const { fixture, check, changes, waitFor, ok, post, api, rejected, database, sql } = context;
  await recoverH3CommissionTransmission(context);
  await waitFor(() => changes(fixture.allocationIds), records => records.length === 4 && records.every(row => row.status === 'APPROVED' && row.period === fixture.previousPeriod), 'Selected original and refunds did not reach the same real payroll period');
  const before = JSON.stringify(changes(fixture.allocationIds));
  await new Promise(resolve => setTimeout(resolve, 5100));
  await ok('admin', '/crm/commission/post', 'POST', post(fixture.allocationIds));
  check('repeated_post_uses_same_four_salary_sources', before === JSON.stringify(changes(fixture.allocationIds)));
  rejected(await api('finance', '/crm/commission/post', { method: 'POST', body: post(fixture.allocationIds, fixture.currentPeriod) }), 'posted_sources_cannot_move_to_another_period');
  const exact = fixture.allocationIds.map(value => sql(value)).join(',');
  check('one_persisted_post_request_per_allocation', database("SELECT COUNT(*) FROM outbox_event WHERE tenant_id=100000 AND aggregate_type='cloudflow-service-crm' AND event_type='CRM_COMMISSION_REQUEST'"
    + ' AND aggregate_id IN (' + fixture.allocationIds.join(',') + ") AND JSON_UNQUOTE(JSON_EXTRACT(JSON_UNQUOTE(JSON_EXTRACT(payload_json,'$.payload')),'$.operation'))='POST';") === '4');
  check('salary_amounts_are_encrypted_in_database', database("SELECT COUNT(*) FROM hr_comp_change WHERE tenant_id=100000 AND source_biz_type='CRM_COMMISSION' AND source_biz_id IN (" + exact
    + ") AND (after_total REGEXP '^-?[0-9]+(\\.[0-9]+)?$' OR change_amount REGEXP '^-?[0-9]+(\\.[0-9]+)?$' OR before_total REGEXP '^-?[0-9]+(\\.[0-9]+)?$');") === '0');
  context.evidence.privacy = true; context.evidence.idempotency = true;
}

async function calculateAndPay(context, periodId, expected, name) {
  const { ok, own, waitFor, check, fixture, salary, commissionRows, progress } = context;
  const batchId = own('payrollBatch', await ok('admin', '/hr/compensation/payroll/batches', 'POST', { payrollPeriodId: periodId,
    employeeIds: fixture.employees.map(employee => employee.id), validateAttendanceFlag: 0, deductUnverifiedFlag: 0 }));
  await ok('admin', '/hr/compensation/payroll/batches/' + batchId + '/calculate', 'POST');
  const batch = await waitFor(() => ok('admin', '/hr/compensation/payroll/batches/' + batchId), value => !['PENDING','CALCULATING'].includes(value.batch.status), 'Actual commission payroll calculation did not finish');
  check(name + '_actual_payroll_calculated', batch.batch.status === 'CALCULATED' && batch.employees.length === 2 && batch.employees.every(row => row.calcStatus === 'SUCCESS'));
  const slips = batch.employees.map(row => salary(row.salarySlipId));
  for (const slip of slips) {
    const entries = slip.components.filter(item => item.sourceBizType === 'CRM_COMMISSION');
    const expectedEntries = expected.filter(entry => entry.employee === slip.employee);
    check(name + '_salary_contains_exact_signed_sources_' + slip.employee, entries.length === expectedEntries.length && expectedEntries.every(entry => entries.some(item => String(item.allocationId) === entry.id && context.sameMoney(item.amount, entry.commission))));
    check(name + '_salary_gross_matches_independent_signed_sum_' + slip.employee, context.units(slip.gross) === 1000000n + expectedEntries.reduce((sum, entry) => sum + context.units(entry.commission), 0n));
    for (const entry of expectedEntries) check(name + '_calculation_does_not_claim_paid_' + entry.id, progress(entry.id).at(-1).detail.state === 'POSTED');
  }
  await ok('admin', '/hr/compensation/payroll/batches/' + batchId + '/submit', 'POST');
  await verifyH3CommissionPaymentRollback(context, batchId, expected, name);
  await ok('admin', '/hr/compensation/payroll/batches/' + batchId + '/pay', 'POST');
  await waitFor(() => expected.map(entry => progress(entry.id).at(-1)?.detail), values => values.every(value => value?.state === 'PAID'), 'Actual salary payment did not record commission payment facts');
  await waitFor(() => expected.map(entry => commissionRows(entry.eventId).find(row => row.id === entry.id)), values => values.every(value => value?.status === 'PAID'), 'CRM did not receive actual HR salary payment status');
  for (const slip of slips) check(name + '_real_salary_is_paid_' + slip.id, salary(slip.id).status === 'PAID');
  await new Promise(resolve => setTimeout(resolve, 5100));
  const again = await context.api('admin', '/hr/compensation/payroll/batches/' + batchId + '/pay', { method: 'POST' });
  context.rejected(again, name + '_paid_batch_cannot_pay_twice');
  for (const entry of expected) check(name + '_one_actual_payment_fact_' + entry.id, progress(entry.id).filter(row => row.detail.state === 'PAID').length === 1);
  return { batchId, slips: slips.map(row => salary(row.id)) };
}

export async function verifyH3CommissionFirstSalary(context) {
  const { fixture, commissionRows } = context;
  const expected = [...commissionRows(fixture.receipt).map(row => ({ ...row, eventId: fixture.receipt })),
    ...commissionRows(fixture.earlyRefund).map(row => ({ ...row, eventId: fixture.earlyRefund }))];
  fixture.previousPayroll = await calculateAndPay(context, fixture.previousPeriod, expected, 'original_with_prior_refund');
  fixture.previousSalaryDigest = createHash('sha256').update(JSON.stringify(fixture.previousPayroll.slips)).digest('hex');
}

export async function verifyH3CommissionLateRefund(context) {
  const { fixture, refund, events, check, commissionRows, changes, waitFor, ok, post, salary } = context;
  await refund(fixture.plan, fixture.receipt, '66.68');
  const late = events('RECEIVABLE', fixture.plan).at(-1);
  check('late_refund_keeps_original_receipt_and_current_month', late.reversal === fixture.receipt && late.amount === '-66.68' && late.occurred.slice(0,7) === context.period.current.startDate.slice(0,7));
  fixture.lateRefund = late.id;
  const entries = commissionRows(late.id);
  for (const entry of entries) context.own('allocation', entry.id);
  check('final_refund_uses_exact_remaining_cents', entries.length === 2 && entries[0].amount === '-40.01' && entries[1].amount === '-26.67' && entries[0].commission === '-4.94' && entries[1].commission === '-3.29');
  const pending = await waitFor(() => changes(entries.map(row => row.id)), values => values.length === 2 && values.every(value => value.status === 'DRAFT' && value.period == null), 'Paid-source refund did not remain visibly pending');
  check('paid_wage_is_immutable_when_refund_arrives', fixture.previousSalaryDigest === createHash('sha256').update(JSON.stringify(fixture.previousPayroll.slips.map(row => salary(row.id)))).digest('hex'));
  await ok('finance', '/crm/commission/post', 'POST', post(entries.map(row => row.id), fixture.currentPeriod));
  fixture.currentPayroll = await calculateAndPay(context, fixture.currentPeriod, entries.map(row => ({ ...row, eventId: late.id })), 'later_refund_recovery');
  check('prior_month_salary_remains_unchanged_after_actual_recovery', fixture.previousSalaryDigest === createHash('sha256').update(JSON.stringify(fixture.previousPayroll.slips.map(row => salary(row.id)))).digest('hex'));
  const original = commissionRows(fixture.receipt), early = commissionRows(fixture.earlyRefund), final = commissionRows(late.id);
  for (const source of original) check('complete_refund_cancels_each_original_commission_' + source.id, context.units(source.commission) + [...early,...final].filter(row => row.original === source.id).reduce((sum,row) => sum + context.units(row.commission), 0n) === 0n);
  check('recovery_keeps_the_same_pending_change_identifiers', JSON.stringify(changes(entries.map(row => row.id)).map(row => row.id)) === JSON.stringify(pending.map(row => row.id)));
  context.evidence.refunds = true; context.evidence.payroll = true;
}
