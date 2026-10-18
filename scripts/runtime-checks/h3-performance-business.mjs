import assert from 'node:assert/strict';

export async function verifyH3CrossMonth(context) {
  const { check, fixture, evidence, user, querySet, query, metric, expectDelta, period, createCustomer, createOpportunity,
    saveTeam, win, reopen, events, allocations, own, database, rows, sql, fixtureWrite, detail, api, rejected } = context;
  const salesId = user('sales'), adminId = user('admin'), otherId = user('other');
  const beforePrevious = await querySet('admin', period.previous);
  const beforeCurrent = await querySet();
  const beforeSales = await querySet('sales');
  const beforeManager = await querySet('manager');
  const customerId = await createCustomer('跨月客户');
  const opportunityId = await createOpportunity('跨月赢单', customerId);
  await saveTeam('OPPORTUNITY', opportunityId, [['sales', 'OWNER', '0.6000'], ['admin', 'CO_SELLER', '0.4000']]);
  const original = await win(opportunityId);
  const historyId = own('history', database("SELECT history_id FROM crm_opportunity_stage_history WHERE tenant_id=100000 AND opportunity_id=" + opportunityId + " AND to_stage='WON' ORDER BY history_id DESC LIMIT 1;"));
  const timestamp = period.previous.endDate + ' 23:59:59';
  fixtureWrite('opportunity', opportunityId, { stage_changed_time: timestamp }, '仅本轮真实赢单样本的上月末时间输入');
  fixtureWrite('event', original.id, { occurred_time: timestamp }, '原赢单归入上月最后一秒；金额、团队和事件类型保持');
  fixtureWrite('history', historyId, { changed_time: timestamp }, '同一真实赢单的阶段历史与发生时间一致');
  const originalAllocations = allocations(original.id);
  check('original_real_won_allocation_is_60_01_and_40_00', originalAllocations.length === 2
    && originalAllocations.find(row => row.user === salesId)?.amount === '60.01'
    && originalAllocations.find(row => row.user === adminId)?.amount === '40.00'
    && originalAllocations.every(row => row.dept === '100'));
  const wonPrevious = await querySet('admin', period.previous);
  expectDelta(beforePrevious, wonPrevious, {
    owners: { [salesId]: { wonAmount: '60.01', wonOpportunityCount: 1, allocatedWonCount: '0.6000' }, [adminId]: { wonAmount: '40.00', wonOpportunityCount: 1, allocatedWonCount: '0.4000' } },
    depts: { 100: { wonAmount: '100.01', wonOpportunityCount: 1, allocatedWonCount: '1.0000' } },
  }, 'previous_month_real_won');
  const placement = rows("SELECT JSON_OBJECT('user',CAST(user_id AS CHAR),'dept',CAST(dept_id AS CHAR)) FROM sys_user WHERE tenant_id=100000 AND user_id=" + adminId + ';')[0];
  const employee = rows("SELECT JSON_OBJECT('id',CAST(id AS CHAR),'dept',CAST(dept_id AS CHAR)) FROM hr_employee WHERE tenant_id=100000 AND user_id=" + adminId + ' AND deleted=0;')[0];
  assert.ok(placement && employee);
  own('user', adminId); own('employee', employee.id);
  let placementRestored = false;
  const restorePlacement = () => {
    if (placementRestored) return;
    fixtureWrite('user', adminId, { dept_id: placement.dept }, '恢复独立测试人员原部门');
    fixtureWrite('employee', employee.id, { dept_id: employee.dept }, '恢复独立测试员工原部门');
    placementRestored = true;
  };
  context.cleanups.push(restorePlacement);
  fixtureWrite('user', adminId, { dept_id: '990000840' }, '明确测试输入：原参与人当前已调到其他部门');
  fixtureWrite('employee', employee.id, { dept_id: '990000840' }, '明确测试输入：同步该独立员工当前部门');
  await saveTeam('OPPORTUNITY', opportunityId, [['sales', 'OWNER', '0.3000'], ['other', 'CO_SELLER', '0.7000']]);
  const beforeReopen = await detail(opportunityId);
  const receipt = await reopen(opportunityId);
  const reversal = events('OPPORTUNITY', opportunityId).find(event => event.id === String(receipt.reversalEventId));
  check('actual_reopen_records_current_month_negative_won', reversal?.reversal === original.id && reversal.amount === '-100.01'
    && reversal.currency === 'CNY' && reversal.occurred.slice(0, 7) === period.current.startDate.slice(0, 7));
  const reverseAllocations = allocations(reversal.id);
  check('reversal_preserves_original_people_departments_roles_and_shares', reverseAllocations.length === 2
    && reverseAllocations.every(row => {
      const previous = originalAllocations.find(value => value.id === row.reversal);
      return previous && ['user', 'employee', 'dept', 'role', 'percentage'].every(field => previous[field] === row[field])
        && context.units(row.amount) === -context.units(previous.amount);
    }));
  const afterPrevious = await querySet('admin', period.previous);
  const currentReversed = await querySet();
  const zeroPrevious = {
    owners: { [salesId]: { wonAmount: '0', wonOpportunityCount: 0, allocatedWonCount: '0' }, [adminId]: { wonAmount: '0', wonOpportunityCount: 0, allocatedWonCount: '0' } },
    depts: { 100: { wonAmount: '0', wonOpportunityCount: 0, allocatedWonCount: '0' } },
  };
  expectDelta(wonPrevious, afterPrevious, zeroPrevious, 'reopen_keeps_previous_month');
  expectDelta(beforeCurrent, currentReversed, {
    owners: { [salesId]: { wonAmount: '-60.01', wonOpportunityCount: -1, allocatedWonCount: '-0.6000' }, [adminId]: { wonAmount: '-40.00', wonOpportunityCount: -1, allocatedWonCount: '-0.4000' } },
    depts: { 100: { wonAmount: '-100.01', wonOpportunityCount: -1, allocatedWonCount: '-1.0000' } },
  }, 'reopen_charged_current_month');
  fixture.crossMonth = { opportunityId, originalEventId: original.id, reversalEventId: reversal.id, originalTimestamp: timestamp,
    reversalTimestamp: reversal.occurred, currentReversed, previous: afterPrevious, historicalTimestampIsFixture: true };
  const stable = JSON.stringify(events('OPPORTUNITY', opportunityId));
  rejected(await api('manager', '/crm/opportunity/' + opportunityId + '/stage-reopen', { method: 'POST', body: {
    version: beforeReopen.version, targetStage: 'QUALIFIED', reason: context.marker + '_重复原撤回请求',
  } }), 'repeated_original_reopen_rejected');
  check('repeated_reopen_does_not_duplicate_negative_fact', JSON.stringify(events('OPPORTUNITY', opportunityId)) === stable);
  const renewed = await win(opportunityId);
  check('new_won_uses_new_people_and_departments', renewed.id !== original.id && allocations(renewed.id).length === 2
    && allocations(renewed.id).find(row => row.user === salesId)?.amount === '30.00'
    && allocations(renewed.id).find(row => row.user === otherId)?.amount === '70.01'
    && allocations(renewed.id).find(row => row.user === otherId)?.dept === '990000840');
  const currentRenewed = await querySet();
  expectDelta(beforeCurrent, currentRenewed, {
    owners: { [salesId]: { wonAmount: '-30.01', wonOpportunityCount: 0, allocatedWonCount: '-0.3000' }, [adminId]: { wonAmount: '-40.00', wonOpportunityCount: -1, allocatedWonCount: '-0.4000' }, [otherId]: { wonAmount: '70.01', wonOpportunityCount: 1, allocatedWonCount: '0.7000' } },
    depts: { 100: { wonAmount: '-70.01', wonOpportunityCount: 0, allocatedWonCount: '-0.7000' }, 990000840: { wonAmount: '70.01', wonOpportunityCount: 1, allocatedWonCount: '0.7000' } },
  }, 'new_won_counts_own_current_month_team');
  expectDelta(afterPrevious, await querySet('admin', period.previous), zeroPrevious, 'new_won_keeps_previous_month');
  check('original_allocations_immutable_after_reopen_and_new_win', JSON.stringify(allocations(original.id)) === JSON.stringify(originalAllocations));
  const combined = await querySet('admin', period.combined);
  check('two_month_won_total_equals_one_current_won', context.units(metric(combined, 'owners', salesId, 'wonAmount')) === 3000n
    && context.units(metric(combined, 'owners', adminId, 'wonAmount')) === 0n
    && context.units(metric(combined, 'owners', otherId, 'wonAmount')) === 7001n);
  const self = await querySet('sales'), department = await querySet('manager');
  check('self_scope_contains_only_current_operator', self.owners.every(row => String(row.targetId) === salesId) && self.topOwners.every(row => String(row.targetId) === salesId));
  expectDelta(beforeSales, self, { owners: { [salesId]: { wonAmount: '-30.01' } }, depts: { 100: { wonAmount: '-30.01' } } }, 'self_scope_only_own_shares');
  check('department_scope_excludes_new_other_department_member', department.owners.every(row => String(row.targetId) !== otherId)
    && department.topOwners.every(row => String(row.targetId) !== otherId) && department.depts.every(row => String(row.targetId) === '100'));
  expectDelta(beforeManager, department, { owners: { [adminId]: { wonAmount: '-40.00' }, [salesId]: { wonAmount: '-30.01' } }, depts: { 100: { wonAmount: '-70.01' } } }, 'department_scope_preserves_frozen_previous_member');
  restorePlacement();
  const sameMonth = await createOpportunity('同月撤回', customerId, '20.01');
  await win(sameMonth); await reopen(sameMonth);
  expectDelta(currentRenewed, await querySet(), {
    owners: { [salesId]: { wonAmount: '0', wonOpportunityCount: 0, allocatedWonCount: '0' } },
    depts: { 100: { wonAmount: '0', wonOpportunityCount: 0, allocatedWonCount: '0' } },
  }, 'same_month_win_and_reopen_cancel_exactly');
  const legacy = await querySet('admin', period.current, null);
  const explicitLegacy = await querySet('admin', period.current, 'OWNER_V1');
  check('default_preserves_explicit_owner_v1', JSON.stringify(legacy) === JSON.stringify(explicitLegacy));
  check('owner_v1_counts_current_owner_full_won_amount', context.sameMoney(metric(legacy, 'owners', salesId, 'wonAmount'), '100.01')
    && context.sameMoney(metric(legacy, 'owners', adminId, 'wonAmount'), '0') && context.sameMoney(metric(legacy, 'owners', otherId, 'wonAmount'), '0'));
  const foreignCustomer = await createCustomer('其他租户客户', 'foreign');
  const foreignOpportunity = await createOpportunity('其他租户赢单', foreignCustomer, '77.01', 'foreign');
  await win(foreignOpportunity, 'foreign');
  const foreignOwn = await query('foreign', 'owners', period.current, 'TEAM_V2', 'CNY', { ownerIds: user('foreign') });
  check('foreign_tenant_has_actual_own_won', foreignOwn.length === 1 && context.sameMoney(foreignOwn[0].wonAmount, '77.01'));
  check('admin_cannot_request_other_tenant_owner', (await query('admin', 'owners', period.current, 'TEAM_V2', 'CNY', { ownerIds: user('foreign') })).length === 0);
  const foreignView = await querySet('foreign');
  check('foreign_tenant_cannot_read_local_targets', foreignView.owners.length === 0 && foreignView.depts.length === 0
    && foreignView.topOwners.every(row => !context.owners.includes(String(row.targetId))));
  for (const endpoint of ['owners', 'depts', 'top-owners', 'top-depts']) {
    const denied = await api('readonly', '/hr/performance/crm/' + endpoint + '?calculationBasis=TEAM_V2&currency=CNY');
    check('no_hr_permission_' + endpoint + '_forbidden', denied.status === 403 && denied.body?.code === 403);
  }
  for (const [suffix, label] of [['owners?ownerIds=0', 'invalid_target'], ['owners?startDate=2026-02-29', 'invalid_date'],
    ['owners?startDate=2026-10-02&endDate=2026-10-01', 'reversed_date_range'], ['owners?currency=cny', 'lowercase_currency'],
    ['owners?calculationBasis=UNKNOWN', 'unknown_basis'], ['top-owners?limit=0', 'zero_limit'], ['top-depts?limit=201', 'over_limit']]) {
    const invalidQuery = await api('admin', '/hr/performance/crm/' + suffix);
    check('actual_hr_rejects_' + label, invalidQuery.status === 200 && invalidQuery.body?.code === 400
      && typeof invalidQuery.body.msg === 'string' && !invalidQuery.body.msg.includes('暂不可用'));
  }
  const first = await query('admin', 'top-owners', period.current, 'TEAM_V2', 'CNY', { limit: '1' });
  check('requested_ranking_limit_applied', first.length === 1);
  evidence.crossMonth = true; evidence.originalAllocations = true; evidence.permissions = true;
  fixture.crossMonth.renewedEventId = renewed.id;
  return { customerId, opportunityId, currentRenewed, beforeCurrent };
}

export async function verifyH3FinancialSources(context) {
  const { check, fixture, evidence, createCustomer, ok, api, user, own, day, database, sql, rows, waitFor, tasks,
    paceWorkflowStart, saveTeam, querySet, expectDelta, events, allocations, sameMoney, refund, rejected } = context;
  const customerId = await createCustomer('实际财务客户', 'admin');
  const beforeCny = await querySet(), beforeUsd = await querySet('admin', context.period.current, 'TEAM_V2', 'USD');
  const contract = async (currency, amount) => {
    const name = context.marker + '_' + currency;
    const id = own('contract', await ok('admin', '/oa/contract', 'POST', { contractNo: name, contractName: name,
      counterpartyName: '业绩验证客户', contractType: 'SALES', customerId, customerName: '业绩验证客户',
      amount, currency, ownerId: user('admin'), startDate: day(), endDate: day(30) }));
    await saveTeam('CONTRACT', id, [['admin', 'OWNER', '0.6000'], ['sales', 'CO_SELLER', '0.4000']]);
    await paceWorkflowStart('admin');
    await ok('admin', '/oa/contract/submit/' + id, 'POST');
    const instance = await waitFor(() => database("SELECT COALESCE(instance_id,'') FROM oa_contract WHERE tenant_id=100000 AND contract_id=" + id + ';'), Boolean, 'Actual contract approval was not started');
    for (let step = 0; step < 20; step++) {
      const next = await waitFor(() => {
        const status = database('SELECT status FROM wf_process_instance WHERE tenant_id=100000 AND instance_id=' + sql(instance) + ';');
        return ['PASSED', 'AUTO_PASSED'].includes(status) ? { complete: true } : tasks(instance)[0];
      }, Boolean, 'Actual contract approval task missing');
      if (next.complete) break;
      await ok('admin', '/workflow/wf/complete', 'POST', { taskId: next.id, action: 'APPROVE', comment: context.marker + '_合同实际审批' });
      const history = rows("SELECT JSON_OBJECT('operator',CAST(operator_id AS CHAR),'metadata',variables_changed) FROM wf_task_history WHERE tenant_id=100000 AND instance_id=" + sql(instance)
        + ' AND task_id=' + sql(next.id) + " AND action IN ('APPROVE','COUNTERSIGN_APPROVE');");
      check('contract_approval_records_actual_operator_' + next.id, history.length === 1 && history[0].operator === user('admin'));
      if (next.assignee !== user('admin')) {
        const metadata = JSON.parse(history[0].metadata);
        check('contract_approval_preserves_existing_admin_override_audit', metadata.adminOverride === true && String(metadata.originalAssigneeId) === next.assignee);
      }
    }
    await waitFor(() => database('SELECT status FROM oa_contract WHERE tenant_id=100000 AND contract_id=' + id + ';'), status => status === 'APPROVED', 'Contract was not actually approved');
    const uploaded = context.success(await api('admin', '/oa/contract/' + id + '/signed-file', { method: 'POST',
      file: { name: context.marker + '_' + currency + '.pdf', type: 'application/pdf', content: Buffer.from('%PDF-1.4\nIndependent H3 signature evidence\n%%EOF\n').toString('base64') } }), 'actual_contract_signature_file_uploaded');
    await ok('admin', '/oa/contract/' + id + '/sign', 'POST', { signMethod: 'SCAN', counterpartySignee: '业绩隔离验证签署人',
      counterpartySignTime: day(-1) + ' 12:00:00', signedFileUrl: uploaded.reference, signRemark: context.marker });
    await waitFor(() => events('CONTRACT', id), values => values.length === 1, 'Signed effective contract fact was not delivered');
    const fact = events('CONTRACT', id)[0];
    check('actual_effective_contract_fact_' + currency, fact.type === 'CONTRACT' && fact.currency === currency && sameMoney(fact.amount, amount));
    fixture.contracts.push({ id, currency, amount, eventId: fact.id, approvalInstance: instance }); return id;
  };
  const cnyContract = await contract('CNY', '200.03');
  const afterContract = await querySet();
  expectDelta(beforeCny, afterContract, {
    owners: { [user('admin')]: { contractAmount: '120.02', wonAmount: '0' }, [user('sales')]: { contractAmount: '80.01', wonAmount: '0' } },
    depts: { 100: { contractAmount: '200.03', wonAmount: '0' } },
  }, 'actual_signed_contract_not_won_estimate');
  const receivable = async (contractId, currency, amount) => {
    const name = context.marker + '_款_' + currency;
    await ok('admin', '/crm/receivable', 'POST', { receivableNo: name, receivableName: name, customerId, contractId,
      plannedAmount: amount, ownerId: user('admin'), dueDate: day(30) });
    const id = own('receivable', database('SELECT receivable_id FROM crm_receivable WHERE tenant_id=100000 AND receivable_no=' + sql(name) + ' AND deleted=0;'));
    await saveTeam('RECEIVABLE', id, [['admin', 'OWNER', '0.6000'], ['sales', 'CO_SELLER', '0.4000']]); return id;
  };
  const collect = async (id, amount) => {
    const current = await ok('admin', '/crm/receivable/' + id);
    await ok('admin', '/crm/receivable/' + id + '/writeoff', 'POST', { version: current.version, amount, writeoffDate: day(), remark: context.marker + '_逐笔实际到账' });
    const fact = events('RECEIVABLE', id).at(-1);
    check('actual_receipt_event_' + id, fact?.type === 'RECEIPT' && fact.reversal == null && sameMoney(fact.amount, amount));
    fixture.receipts.push({ receivableId: id, eventId: fact.id, amount }); return fact;
  };
  const plan = await receivable(cnyContract, 'CNY', '200.03');
  const first = await collect(plan, '30.01');
  expectDelta(afterContract, await querySet(), {
    owners: { [user('admin')]: { receivedAmount: '18.01', outstandingAmount: '102.01' }, [user('sales')]: { receivedAmount: '12.00', outstandingAmount: '68.01' } },
    depts: { 100: { receivedAmount: '30.01', outstandingAmount: '170.02' } },
  }, 'first_receipt_and_current_unpaid_exact');
  const second = await collect(plan, '20.02');
  const beforeRefund = await querySet();
  expectDelta(afterContract, beforeRefund, {
    owners: { [user('admin')]: { receivedAmount: '30.02', outstandingAmount: '90.00' }, [user('sales')]: { receivedAmount: '20.01', outstandingAmount: '60.00' } },
    depts: { 100: { receivedAmount: '50.03', outstandingAmount: '150.00' } },
  }, 'two_receipts_use_each_frozen_allocation');
  const originalFirst = JSON.stringify(allocations(first.id)), originalSecond = JSON.stringify(allocations(second.id));
  const refunded = await refund(plan, second.id, '5.01');
  const refundFact = events('RECEIVABLE', plan).at(-1);
  check('actual_partial_refund_targets_only_second_receipt', refundFact.reversal === second.id && sameMoney(refundFact.amount, '-5.01'));
  expectDelta(beforeRefund, await querySet(), {
    owners: { [user('admin')]: { receivedAmount: '-3.01', outstandingAmount: '3.01' }, [user('sales')]: { receivedAmount: '-2.00', outstandingAmount: '2.00' } },
    depts: { 100: { receivedAmount: '-5.01', outstandingAmount: '5.01' } },
  }, 'actual_partial_refund_net_receipts');
  const replayBefore = JSON.stringify(events('RECEIVABLE', plan));
  rejected(await api('reviewer', '/workflow/wf/complete', { method: 'POST', body: { taskId: refunded.stages.at(-1).task, action: 'APPROVE', comment: context.marker + '_重复退款回执' } }), 'completed_refund_cannot_repeat');
  check('refund_replay_and_original_allocations_preserved', replayBefore === JSON.stringify(events('RECEIVABLE', plan))
    && originalFirst === JSON.stringify(allocations(first.id)) && originalSecond === JSON.stringify(allocations(second.id)));
  const beforeFutureTeam = await querySet();
  await saveTeam('RECEIVABLE', plan, [['admin', 'OWNER', '0.3000'], ['other', 'CO_SELLER', '0.7000']]);
  expectDelta(beforeFutureTeam, await querySet(), {
    owners: { [user('admin')]: { receivedAmount: '0', outstandingAmount: '-46.51' }, [user('sales')]: { receivedAmount: '0', outstandingAmount: '-62.00' }, [user('other')]: { receivedAmount: '0', outstandingAmount: '108.51' } },
    depts: { 100: { receivedAmount: '0', outstandingAmount: '-108.51' }, 990000840: { receivedAmount: '0', outstandingAmount: '108.51' } },
  }, 'current_unpaid_uses_new_team_without_rewriting_receipts');
  const cnyStable = await querySet();
  const usdContract = await contract('USD', '99.99');
  const usdPlan = await receivable(usdContract, 'USD', '99.99');
  await collect(usdPlan, '10.01');
  const usd = await querySet('admin', context.period.current, 'TEAM_V2', 'USD');
  expectDelta(beforeUsd, usd, {
    owners: { [user('admin')]: { wonAmount: '0', contractAmount: '59.99', receivedAmount: '6.01', outstandingAmount: '53.99' }, [user('sales')]: { wonAmount: '0', contractAmount: '40.00', receivedAmount: '4.00', outstandingAmount: '35.99' } },
    depts: { 100: { wonAmount: '0', contractAmount: '99.99', receivedAmount: '10.01', outstandingAmount: '89.98' } },
  }, 'usd_kept_separate_from_cny');
  check('usd_operations_keep_all_cny_metrics', JSON.stringify(cnyStable) === JSON.stringify(await querySet()));
  const salesOnly = await querySet('sales', context.period.current, 'TEAM_V2', 'USD');
  check('unpaid_rounding_uses_full_team_before_self_scope', context.sameMoney(context.metric(salesOnly, 'owners', user('sales'), 'outstandingAmount'), '35.99')
    && context.sameMoney(context.metric(salesOnly, 'depts', '100', 'outstandingAmount'), '35.99'));
  evidence.currencies = true; evidence.actualReceipts = true;
  fixture.financial = { cnyContract, plan, usdContract, usdPlan, partialRefundId: refunded.id, finalNetCnyReceipts: '45.02' };
}
