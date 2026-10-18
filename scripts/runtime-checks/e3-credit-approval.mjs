export async function verifyE3CreditApprovalAndExposure(context, losses) {
  const { check, prove, evidence, fixture, marker, ok, api, success, rejected, customer, credit, propose, reviewCredit, approval, task, user,
    identifier, sameMoney, receivable, receive, day, fixtureEntity, database, sql, paceWorkflowStart } = context;
  const client = await customer('CREDIT_MAIN');
  await prove(7, async () => {
    const base = { creditLimit: '1000.03', overdueThreshold: '60.05', currency: 'CNY', status: 'ENABLED', effectiveStart: day(), effectiveEnd: day(30), remark: marker + '_first' };
    for (const [label, fields] of [['negative', { creditLimit: '-0.01' }], ['fractional_cent', { creditLimit: '1.001' }], ['other_currency', { currency: 'USD' }],
      ['invalid_period', { effectiveStart: day(2), effectiveEnd: day(1) }], ['empty_reason', { remark: '' }]]) {
      rejected(await api('sales', '/crm/credit/customer/' + client.id + '/submit', { method: 'POST', body: { ...base, ...fields } }), 'credit_rejects_' + label);
      check('invalid_credit_' + label + '_leaves_no_effective_row_or_pending_approval', (await credit(client)).credit == null && (await credit(client)).pendingApproval == null);
    }
    await paceWorkflowStart('sales');
    const responses = await Promise.all([
      api('sales', '/crm/credit/customer/' + client.id + '/submit', { method: 'POST', concurrent: true, body: { ...base, remark: marker + '_concurrent_a' } }),
      api('sales', '/crm/credit/customer/' + client.id + '/submit', { method: 'POST', concurrent: true, body: { ...base, remark: marker + '_concurrent_b' } }),
    ]);
    const accepted = responses.filter(value => value.status === 200 && value.body?.code === 200);
    check('concurrent_credit_submission_creates_one_actual_approval', accepted.length === 1);
    const denied = responses.find(value => value !== accepted[0]);
    rejected(denied, 'second_concurrent_credit_request_reports_pending_approval', /已有待处理的额度调整审批/);
    const approvalId = identifier(success(accepted[0], 'first_concurrent_credit_submission'));
    fixture.approvals.push({ id: approvalId, kind: 'credit', customerId: client.id, actor: 'sales', request: base, concurrentSubmission: true });
    let view = await credit(client);
    check('first_pending_credit_is_disabled_zero_and_not_effective', sameMoney(view.credit.creditLimit, '0.00') && view.credit.status === 'DISABLED' && !view.effective
      && String(view.pendingApproval.approvalId) === approvalId);
    const managerTask = await task(approvalId, 'manager', 'manager');
    rejected(await api('sales', '/workflow/wf/complete', { method: 'POST', body: { taskId: managerTask.id, action: 'APPROVE', comment: marker } }),
      'sales_cannot_approve_manager_credit_task', /权限|无权|办理|归属|审批|操作|任务/);
    await reviewCredit(approvalId, 'APPROVE', async () => {
      view = await credit(client);
      check('manager_approval_alone_does_not_activate_initial_credit', !view.effective && sameMoney(view.credit.creditLimit, '0.00') && view.pendingApproval != null);
    });
    view = await credit(client);
    check('finance_approval_activates_exact_credit_and_ends_pending', view.effective && sameMoney(view.credit.creditLimit, '1000.03')
      && sameMoney(view.credit.overdueThreshold, '60.05') && view.pendingApproval == null && view.credit.instanceId === approval(approvalId).instanceId);
    const old = view.credit;
    const adjustment = await propose(client, { creditLimit: '2000.07', remark: marker + '_reject_adjustment' });
    check('adjustment_pending_keeps_previously_approved_credit', sameMoney((await credit(client)).credit.creditLimit, '1000.03'));
    let pendingCredit;
    await reviewCredit(adjustment, 'REJECT', async () => {
      const pending = await credit(client);
      pendingCredit = pending.credit;
      check('first_approval_of_adjustment_keeps_old_credit', sameMoney(pendingCredit.creditLimit, '1000.03')
        && sameMoney(pendingCredit.overdueThreshold, '60.05') && pending.pendingApproval != null);
      check('new_approval_binding_advances_only_credit_record_version_once', pendingCredit.version === old.version + 1
        && pendingCredit.instanceId === approval(adjustment).instanceId
        && ['currency', 'status', 'effectiveStart', 'effectiveEnd', 'bypassFlag', 'bypassReason', 'bypassBy', 'bypassTime', 'bypassExpireDate'].every(field => pendingCredit[field] === old[field]));
    });
    view = await credit(client);
    check('finance_rejection_keeps_approved_credit_and_bound_version', sameMoney(view.credit.creditLimit, '1000.03')
      && sameMoney(view.credit.overdueThreshold, '60.05') && view.credit.version === pendingCredit.version && view.pendingApproval == null
      && ['currency', 'status', 'effectiveStart', 'effectiveEnd', 'bypassFlag', 'bypassReason', 'bypassBy', 'bypassTime', 'bypassExpireDate', 'instanceId'].every(field => view.credit[field] === pendingCredit[field]));
    fixture.creditRejection = { approvalId: adjustment, submittedVersion: old.version, boundVersion: pendingCredit.version, rejectedVersion: view.credit.version,
      approvedLimitUnchanged: true, approvedThresholdUnchanged: true, effectivePeriodAndBypassUnchanged: true, pendingApprovalCleared: true };
    rejected(await api('readonly', '/crm/credit/customer/' + client.id + '/submit', { method: 'POST', body: { ...base, version: view.credit.version } }), 'readonly_cannot_submit_credit');
    rejected(await api('employee', '/crm/credit/customer/' + client.id), 'credit_view_requires_permission');
    rejected(await api('foreign', '/crm/credit/customer/' + client.id), 'credit_view_rejects_other_tenant');
    rejected(await api('sales', '/crm/credit/customer/' + losses.outsideClient.id), 'credit_view_respects_owner_scope');
    check('department_manager_can_read_sales_credit', sameMoney((await credit(client, 'manager')).credit.creditLimit, '1000.03'));
    evidence.creditApproval = true; evidence.permissions = true;
  });
  let overdueSample;
  await prove([8, 9, 10], async () => {
    const today = day();
    const past = await receivable('CREDIT_PAST', client, '100.11', day(-1));
    const due = await receivable('CREDIT_TODAY', client, '200.22', today);
    const future = await receivable('CREDIT_FUTURE', client, '300.33', day(1));
    const undated = await receivable('CREDIT_NO_DATE', client, '400.44', null);
    const closed = await receivable('CREDIT_CLOSED', client, '50.55', day(-1));
    const cancelled = await receivable('CREDIT_CANCELLED', client, '60.66', day(-1));
    const deleted = await receivable('CREDIT_DELETED', client, '70.77', day(-1));
    fixtureEntity('receivable', closed.id, { status: 'CLOSED' }, 'Explicit historical closed-state input for owned unpaid receivable; no original business changed');
    fixtureEntity('receivable', cancelled.id, { status: 'CANCELLED' }, 'Explicit historical cancelled-state input for owned unpaid receivable');
    await ok('sales', '/crm/receivable/' + deleted.id, 'DELETE');
    await receivable('CREDIT_OTHER_CUSTOMER', losses.managerClient, '888.88', day(-1));
    await receivable('CREDIT_OTHER_TENANT', losses.foreignClient, '999.99', day(-1));
    let view = await credit(client);
    check('unpaid_sum_excludes_closed_cancelled_deleted_other_customer_and_tenant', sameMoney(view.occupied, '1001.10') && sameMoney(view.available, '-1.07'));
    check('overdue_sum_excludes_today_future_and_null_due_dates', sameMoney(view.overdue, '100.11'));
    const partial = await receive(past, '40.03');
    view = await credit(client);
    check('real_partial_collection_preserves_exact_cents', sameMoney(partial.receivedAmount, '40.03') && sameMoney(partial.outstandingAmount, '60.08'));
    check('next_credit_read_immediately_releases_partial_receipt', sameMoney(view.occupied, '961.07') && sameMoney(view.available, '38.96') && sameMoney(view.overdue, '60.08'));
    const full = await receive(past, '60.08');
    view = await credit(client);
    check('real_full_collection_zeroes_original_exposure', sameMoney(full.receivedAmount, '100.11') && sameMoney(full.outstandingAmount, '0.00')
      && sameMoney(view.occupied, '900.99') && sameMoney(view.available, '99.04') && sameMoney(view.overdue, '0.00'));
    overdueSample = await receivable('CREDIT_NEW_PAST', client, '60.08', day(-1));
    view = await credit(client);
    check('new_unpaid_invoice_immediately_reoccupies_credit', sameMoney(view.occupied, '961.07') && sameMoney(view.available, '38.96') && sameMoney(view.overdue, '60.08'));
    check('exposure_case_stays_within_one_real_calendar_day', day() === today);
    fixture.exposure = { customerId: client.id, observedDate: today, expected: { limit: '1000.03', occupied: '961.07', available: '38.96', overdue: '60.08' },
      currentReceivables: [due.id, future.id, undated.id, overdueSample.id], paidReceivable: past.id, historicalStateInputs: [closed.id, cancelled.id], deletedReceivable: deleted.id };
    evidence.creditExposure = true;
  });
  const periodClients = [];
  await prove(7, async () => {
    for (const [suffix, fields] of [['FUTURE_CREDIT', { effectiveStart: day(1), effectiveEnd: day(30) }], ['EXPIRED_CREDIT', { effectiveStart: day(-30), effectiveEnd: day(-1) }],
      ['DISABLED_CREDIT', { status: 'DISABLED' }]]) {
      const sample = await customer(suffix);
      const approvalId = await propose(sample, { creditLimit: '0.01', overdueThreshold: '0.00', ...fields });
      await reviewCredit(approvalId);
      const view = await credit(sample);
      check(suffix.toLowerCase() + '_approval_saved_but_not_currently_effective', !view.effective && sameMoney(view.credit.creditLimit, '0.01'));
      periodClients.push(sample);
    }
  });
  fixture.creditCustomer = client;
  return { client, overdueSample, periodClients };
}
