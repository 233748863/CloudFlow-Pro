import assert from 'node:assert/strict';

export async function verifyH3CommissionManagerScope(context) {
  const { ok, api, rejected, check, fixture, marker, user, createCustomer, database, sql, own, events, commissionRows, confirm, post, list, changes } = context;
  check('restricted_finance_has_real_commission_permission', context.sessions.reviewer.identity.permissions.includes('crm:commission:manage'));
  const customerId = await createCustomer('其他部门提成来源', 'other');
  const name = marker + '_其他部门实收';
  await ok('other', '/crm/receivable', 'POST', { receivableNo: name, receivableName: name, customerId,
    plannedAmount: '1.00', ownerId: user('other'), dueDate: context.day(30) });
  const planId = own('receivable', database('SELECT receivable_id FROM crm_receivable WHERE tenant_id=100000 AND receivable_no=' + sql(name) + ' AND deleted=0;'));
  const plan = await ok('other', '/crm/receivable/' + planId);
  await ok('other', '/crm/receivable/' + planId + '/writeoff', 'POST', { version: plan.version, amount: '1.00', writeoffDate: context.day(), remark: marker + '_范围验证真实到账' });
  const event = events('RECEIVABLE', planId).at(-1), source = commissionRows(event.id);
  check('outside_department_source_is_real_single_owner_receipt', event.type === 'RECEIPT' && source.length === 1 && source[0].user === user('other'));
  own('allocation', source[0].id);
  await ok('admin', '/crm/commission/confirm', 'POST', confirm([source[0].id]));
  const before = JSON.stringify(commissionRows(event.id));
  const hidden = await list('reviewer', { bizId: planId });
  check('commission_manager_cannot_list_another_department', hidden.rows.length === 0 && Number(hidden.total) === 0);
  rejected(await api('reviewer', '/crm/commission/confirm', { method: 'POST', body: confirm([source[0].id]) }), 'commission_permission_does_not_bypass_confirmation_scope');
  rejected(await api('reviewer', '/crm/commission/post', { method: 'POST', body: post([source[0].id], fixture.currentPeriod) }), 'commission_permission_does_not_bypass_payroll_scope');
  check('denied_management_keeps_foreign_department_source_and_salary_unchanged', before === JSON.stringify(commissionRows(event.id)) && changes([source[0].id]).length === 0);
  await ok('reviewer', '/crm/commission/confirm', 'POST', confirm([fixture.original[1].id]));
  check('same_restricted_manager_can_confirm_own_department', commissionRows(fixture.receipt)[1].commission === '4.94');
  context.evidence.managerScope = true;
}

export async function prepareH3CommissionInterruption(context) {
  const id = context.fixture.original[0].id;
  context.check('interruption_targets_unposted_actual_original', context.changes([id]).length === 0);
  context.releaseCommissionSourceFailure = context.installCommissionFault('sourceInsert', id);
  context.cleanups.push(context.releaseCommissionSourceFailure);
}

export async function recoverH3CommissionTransmission(context) {
  const { fixture, check, changes, commissionDelivery, waitFor, ok, post } = context;
  const id = fixture.original[0].id;
  fixture.failedDelivery = await waitFor(() => commissionDelivery(id), value => value.state === 'READY' && value.attempts >= 1,
    'Actual durable dispatcher did not attempt the controlled failed commission source');
  check('source_failure_keeps_real_request_pending_without_inventing_salary', changes([id]).length === 0);
  context.releaseCommissionSourceFailure();
  await new Promise(resolve => setTimeout(resolve, 5100));
  const responses = await Promise.all(['finance', 'reviewer'].map(actor => ok(actor, '/crm/commission/post', 'POST', post(fixture.allocationIds))));
  check('two_authorized_concurrent_resumptions_keep_all_original_requests', responses.every(value => value.sources === 4));
  await waitFor(() => changes(fixture.allocationIds), records => records.length === 4 && records.every(row => row.status === 'APPROVED' && row.period === fixture.previousPeriod),
    'Actual concurrent commission recovery did not restore the four selected payroll sources');
  context.evidence.interruption = true;
  context.evidence.concurrentReplay = true;
}

export async function verifyH3CommissionPaymentRollback(context, batchId, expected, name) {
  const { rows, salary, progress, api, check, fixture } = context;
  const slips = rows("SELECT JSON_OBJECT('id',CAST(id AS CHAR)) FROM hr_salary_slip WHERE tenant_id=100000 AND batch_id=" + context.identifier(batchId) + ' AND deleted=0 ORDER BY id;');
  assert.equal(slips.length, 2);
  const snapshots = () => JSON.stringify({
    batch: rows("SELECT JSON_OBJECT('status',status,'version',version,'gross',CAST(total_gross AS CHAR),'net',CAST(total_net AS CHAR)) FROM hr_payroll_batch WHERE tenant_id=100000 AND batch_id=" + batchId + ';'),
    salaries: slips.map(row => salary(row.id)), progress: expected.map(row => progress(row.id)),
  });
  const before = snapshots();
  const lastEmployee = salary(slips.at(-1).id).employee;
  const target = expected.find(row => row.employee === lastEmployee);
  assert.ok(target, 'Later salary must contain an actual commission source');
  const release = context.installCommissionFault('paymentAudit', target.id);
  context.cleanups.push(release);
  try {
    const response = await api('admin', '/hr/compensation/payroll/batches/' + batchId + '/pay', { method: 'POST' });
    check(name + '_actual_payment_fails_when_later_commission_audit_fails', response.status === 500 && response.body?.code === 500);
    check(name + '_entire_batch_salary_and_commission_progress_roll_back', before === snapshots());
    check(name + '_no_salary_claims_paid_after_failed_payment', slips.every(row => salary(row.id).status === 'SUBMITTED'));
  } finally { release(); }
  fixture.paymentRollbackCases = (fixture.paymentRollbackCases || 0) + 1;
  context.evidence.paymentRollback = fixture.paymentRollbackCases === 2;
  await new Promise(resolve => setTimeout(resolve, 5100));
}

export async function verifyH3CommissionLateMessages(context) {
  const { fixture, waitFor, commissionDelivery, check, ok, post, commissionRows, progress, salary } = context;
  const snapshot = () => JSON.stringify({
    allocations: [fixture.receipt, fixture.earlyRefund, fixture.lateRefund].map(commissionRows),
    progress: [...fixture.allocationIds, ...commissionRows(fixture.lateRefund).map(row => row.id)].map(progress),
    salaries: [...fixture.previousPayroll.slips, ...fixture.currentPayroll.slips].map(row => salary(row.id)),
  });
  const before = snapshot();
  const delivery = await waitFor(() => commissionDelivery(fixture.original[0].id), value => value.state === 'DONE' && value.attempts >= 2,
    'The original failed durable delivery was not naturally reclaimed and completed');
  check('natural_retry_keeps_original_durable_event_identity', delivery.eventId === fixture.failedDelivery.eventId);
  await ok('finance', '/crm/commission/post', 'POST', post(fixture.allocationIds));
  check('late_original_request_preserves_both_paid_months_and_latest_progress', before === snapshot());
  fixture.recoveredDelivery = delivery;
  context.evidence.lateMessages = true;
}
