import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';

export function prepareE3CreditChecks(runtime) {
  const { check, checks, database, rows, sql, ok, api, sessions, ownedEntities, paceWorkflowStart, workflowPacing } = runtime;
  const marker = 'E3C_' + randomUUID().replaceAll('-', '').slice(0, 12);
  const fixture = { marker, customers: [], opportunities: [], quotes: [], receivables: [], reasons: [], competitors: [], approvals: [], images: [], measurements: [], workflowPacing };
  const evidence = {}, acceptance = Object.fromEntries(Array.from({ length: 18 }, (_, index) => [index + 1, []]));
  const identifier = value => { const result = String(value); assert.match(result, /^[1-9][0-9]*$/); return result; };
  const user = actor => identifier(sessions[actor].identity.userId);
  const tenant = actor => identifier(sessions[actor].identity.tenantId);
  const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
  const day = (offset = 0) => new Date(Date.now() + 8 * 3600000 + offset * 86400000).toISOString().slice(0, 10);
  const waitFor = async (read, accepts, label, timeout = 60000) => {
    const deadline = Date.now() + timeout;
    do { const result = await read(); if (accepts(result)) return result; await sleep(250); } while (Date.now() < deadline);
    throw new Error(label);
  };
  const cents = value => {
    const parts = String(value).match(/^(-?)(\d+)(?:\.(\d+))?$/);
    assert.ok(parts && (!parts[3] || parts[3].length <= 2 || /^0*$/.test(parts[3].slice(2))), 'Exact two-decimal amount required');
    return (parts[1] ? -1n : 1n) * (BigInt(parts[2]) * 100n + BigInt((parts[3] || '').padEnd(2, '0').slice(0, 2)));
  };
  const sameMoney = (actual, expected) => actual != null && cents(actual) === cents(expected);
  const prove = async (numbers, work) => {
    const first = checks.length;
    const result = await work();
    const labels = checks.slice(first);
    assert.ok(labels.length > 0);
    for (const number of Array.isArray(numbers) ? numbers : [numbers]) {
      assert.ok(acceptance[number]); acceptance[number].push(...labels);
    }
    return result;
  };
  const rejected = (response, label, message = /无权|权限|不存在|必须|不能|不能为空|已修改|版本|审批|丢单|主因|原因|金额|信用|额度|超期|重复|停用|日期|币种|有效|不允许|不支持|范围/) => {
    const text = response.body?.msg || response.body?.message || '';
    check(label, (response.status === 200 && response.body?.code !== 200 || [400, 403, 404, 409].includes(response.status)) && response.body?.code !== 200 && message.test(text));
    return text;
  };
  const own = (kind, id) => {
    const value = identifier(id);
    if (!ownedEntities.has(kind)) ownedEntities.set(kind, new Set());
    ownedEntities.get(kind).add(value); return value;
  };
  const customer = async (suffix, fields = {}, actor = 'sales') => {
    const code = marker + '_' + suffix;
    await ok(actor, '/crm/customer', 'POST', { customerCode: code, customerName: code, ownerId: user(actor), status: 'ACTIVE', ...fields });
    const matches = rows('SELECT JSON_OBJECT(\'id\',CAST(customer_id AS CHAR),\'owner\',CAST(owner_id AS CHAR),\'dept\',CAST(dept_id AS CHAR)) FROM crm_customer WHERE tenant_id=' + tenant(actor) + ' AND customer_code=' + sql(code) + ' AND deleted=0;');
    check('customer_' + suffix + '_saved_once', matches.length === 1);
    const value = { ...matches[0], actor, tenant: tenant(actor), code };
    value.id = own('customer', value.id); fixture.customers.push(value); return value;
  };
  const opportunity = async (suffix, client, amount = '100.01', actor = client.actor, fields = {}) => {
    const name = marker + '_' + suffix;
    await ok(actor, '/crm/opportunity', 'POST', { opportunityName: name, customerId: client.id, ownerId: user(actor), expectedAmount: amount, ...fields });
    const id = own('opportunity', database('SELECT opportunity_id FROM crm_opportunity WHERE tenant_id=' + tenant(actor) + ' AND opportunity_name=' + sql(name) + ' AND deleted=0;'));
    const actual = await ok(actor, '/crm/opportunity/' + id);
    check('opportunity_' + suffix + '_saved_as_open_with_exact_amount', !['WON', 'LOST'].includes(actual.stage) && sameMoney(actual.expectedAmount, amount));
    const value = { id, name, actor, tenant: tenant(actor), customerId: client.id, amount };
    fixture.opportunities.push(value); return value;
  };
  const quote = async (suffix, client, amount = '150.00', actor = client.actor, fields = {}) => {
    const name = marker + '_' + suffix;
    await ok(actor, '/crm/quote', 'POST', { quoteName: name, quoteNo: name, customerId: client.id, ownerId: user(actor), currency: 'CNY',
      status: 'DRAFT', quoteLines: [{ productName: '独立信用验收服务', quantity: 1, unitPrice: amount, discountRate: 100, taxRate: 0 }], ...fields });
    const id = own('quote', database('SELECT quote_id FROM crm_quote WHERE tenant_id=' + tenant(actor) + ' AND quote_no=' + sql(name) + ' AND deleted=0;'));
    const actual = await ok(actor, '/crm/quote/' + id);
    check('quote_' + suffix + '_saved_draft_with_exact_amount', actual.status === 'DRAFT' && sameMoney(actual.totalAmount, amount));
    const value = { id, name, actor, tenant: tenant(actor), customerId: client.id, amount };
    fixture.quotes.push(value); return value;
  };
  const receivable = async (suffix, client, amount, dueDate, actor = client.actor) => {
    const name = marker + '_' + suffix;
    await ok(actor, '/crm/receivable', 'POST', { receivableName: name, receivableNo: name, customerId: client.id, ownerId: user(actor), plannedAmount: amount, dueDate });
    const id = own('receivable', database('SELECT receivable_id FROM crm_receivable WHERE tenant_id=' + tenant(actor) + ' AND receivable_name=' + sql(name) + ' AND deleted=0;'));
    const actual = await ok(actor, '/crm/receivable/' + id);
    check('receivable_' + suffix + '_starts_unpaid', sameMoney(actual.plannedAmount, amount) && sameMoney(actual.receivedAmount, '0.00') && sameMoney(actual.outstandingAmount, amount));
    const value = { id, name, actor, tenant: tenant(actor), customerId: client.id, amount, dueDate };
    fixture.receivables.push(value); return value;
  };
  const receive = async (sample, amount) => {
    const current = await ok(sample.actor, '/crm/receivable/' + sample.id);
    await ok(sample.actor, '/crm/receivable/' + sample.id + '/writeoff', 'POST', { version: current.version, amount, writeoffDate: day(), remark: marker + '_actual_collection' });
    return ok(sample.actor, '/crm/receivable/' + sample.id);
  };
  const credit = async (client, actor = client.actor) => {
    const actual = await ok(actor, '/crm/credit/customer/' + client.id);
    if (actual.credit) own('credit', actual.credit.creditId);
    return actual;
  };
  const propose = async (client, fields = {}) => {
    const current = await credit(client);
    const body = { creditLimit: '1000.03', overdueThreshold: '60.05', currency: 'CNY', status: 'ENABLED', effectiveStart: day(), effectiveEnd: day(30),
      remark: marker + '_credit_adjustment', ...(current.credit ? { version: current.credit.version } : {}), ...fields };
    await paceWorkflowStart(client.actor);
    const id = identifier(await ok(client.actor, '/crm/credit/customer/' + client.id + '/submit', 'POST', body));
    fixture.approvals.push({ id, kind: 'credit', customerId: client.id, actor: client.actor, request: body }); return id;
  };
  const approval = id => rows('SELECT JSON_OBJECT(\'id\',CAST(approval_id AS CHAR),\'status\',status,\'instanceId\',instance_id,\'type\',business_type,\'refId\',CAST(business_ref_id AS CHAR),\'payload\',payload_json) FROM crm_approval WHERE tenant_id=100000 AND approval_id=' + identifier(id) + ';')[0];
  const tasks = instance => rows('SELECT JSON_OBJECT(\'id\',task_id,\'assignee\',CAST(assignee AS CHAR),\'node\',node_key) FROM wf_task WHERE tenant_id=100000 AND instance_id=' + sql(instance) + ' AND status=\'TODO\' ORDER BY task_id;');
  const task = async (id, node, actor) => {
    const actual = await waitFor(() => approval(id), value => Boolean(value?.instanceId), 'Actual workflow instance was not bound');
    const active = await waitFor(() => tasks(actual.instanceId), values => values.some(value => value.node === node && value.assignee === user(actor)), 'Expected actual workflow assignee did not receive a task');
    check('approval_' + id + '_' + node + '_only_expected_stage_active', active.length > 0 && active.every(value => value.node === node));
    return active.find(value => value.assignee === user(actor));
  };
  const decide = (actor, active, action = 'APPROVE') => ok(actor, '/workflow/wf/complete', 'POST', { taskId: active.id, action, comment: marker + '_' + active.node + '_' + action });
  const reviewCredit = async (id, action = 'APPROVE', afterManager) => {
    const manager = await task(id, 'manager', 'manager');
    await decide('manager', manager);
    const finance = await task(id, 'finance', 'finance');
    check('credit_' + id + '_pending_after_first_approval', approval(id).status === 'PENDING');
    if (afterManager) await afterManager();
    await decide('finance', finance, action);
    const expected = action === 'APPROVE' ? 'APPROVED' : 'REJECTED';
    const actual = await waitFor(() => approval(id), value => value?.status === expected, 'Actual two-stage credit callback did not complete');
    check('credit_' + id + '_all_tasks_finished', tasks(actual.instanceId).length === 0);
    const history = rows('SELECT JSON_OBJECT(\'task\',task_id,\'node\',node_key,\'actor\',CAST(operator_id AS CHAR),\'action\',action,\'represented\',on_behalf_of_user_id,\'type\',task_type,\'time\',create_time) FROM wf_task_history WHERE tenant_id=100000 AND instance_id=' + sql(actual.instanceId) + ' AND operator_id IS NOT NULL AND action IN (\'APPROVE\',\'REJECT\',\'COUNTERSIGN_APPROVE\',\'COUNTERSIGN_REJECT\') ORDER BY create_time,history_id;');
    const managerHistory = history.find(value => value.task === manager.id);
    const financeHistory = history.find(value => value.task === finance.id);
    check('credit_' + id + '_real_manager_then_finance_history', history.length === 2 && managerHistory?.node === 'manager' && managerHistory.actor === user('manager')
      && managerHistory.action === 'APPROVE' && financeHistory?.node === 'finance' && financeHistory.actor === user('finance') && financeHistory.action === action
      && managerHistory.time != null && financeHistory.time != null && managerHistory.time <= financeHistory.time
      && history.every(value => value.represented == null && !String(value.type).startsWith('AUTO_')));
    fixture.creditApprovalHistories ||= [];
    fixture.creditApprovalHistories.push({ approvalId: id, managerTask: manager.id, financeTask: finance.id, managerTime: managerHistory.time,
      financeTime: financeHistory.time, sameRecordedSecond: managerHistory.time === financeHistory.time, sequentialStagesObserved: true, finalAction: action });
    return actual;
  };
  const lose = async (sample, reasons, comment = marker + '_补充说明') => {
    const current = await ok(sample.actor, '/crm/opportunity/' + sample.id);
    await paceWorkflowStart(sample.actor);
    const id = identifier(await ok(sample.actor, '/crm/opportunity/' + sample.id + '/lose', 'POST', { version: current.version, reasons, comment }));
    fixture.approvals.push({ id, kind: 'loss', opportunityId: sample.id, actor: sample.actor, reasons, comment });
    check('loss_' + sample.id + '_pending_preserves_original_stage', (await ok(sample.actor, '/crm/opportunity/' + sample.id)).stage === current.stage
      && (await ok(sample.actor, '/crm/lost-analysis/opportunity/' + sample.id)).length === 0);
    const active = await task(id, 'manager', 'manager');
    await decide('manager', active);
    await waitFor(() => approval(id), value => value?.status === 'APPROVED', 'Real loss approval callback did not finish');
    const saved = await ok(sample.actor, '/crm/opportunity/' + sample.id);
    const details = await ok(sample.actor, '/crm/lost-analysis/opportunity/' + sample.id);
    check('loss_' + sample.id + '_actual_approval_writes_stage_comment_and_all_details', saved.stage === 'LOST' && saved.lostReason === comment
      && details.length === reasons.length && details.filter(value => value.isPrimaryFlag === 1).length === 1);
    for (const supplied of reasons) {
      const value = details.find(detail => String(detail.lostReasonId) === String(supplied.reasonId));
      check('loss_' + sample.id + '_reason_' + supplied.reasonId + '_saved_exactly', value && sameMoney(value.amountLost, supplied.amountLost ?? sample.amount)
        && String(value.competitorId ?? '') === String(supplied.competitorId ?? '') && value.isPrimaryFlag === (supplied.isPrimary ? 1 : 0));
    }
    return { approvalId: id, saved, details };
  };
  const contractBody = (client, suffix, amount = '150.00') => ({ contractName: marker + '_' + suffix, contractType: 'SALES', counterpartyName: client.code, amount,
    currency: 'CNY', ownerId: user(client.actor), customerId: client.id });
  const initialTables = [['crm_customer', 'customer_id'], ['crm_opportunity', 'opportunity_id'], ['crm_customer_credit', 'credit_id'], ['crm_receivable', 'receivable_id'],
    ['crm_lost_reason', 'reason_id'], ['crm_competitor', 'competitor_id'], ['sys_role_menu', 'role_id,menu_id,tenant_id'], ['sys_user_role', 'user_id,role_id,tenant_id']].map(([table, key]) => {
      const ownedColumn = { crm_customer: 'customer_code', crm_opportunity: 'opportunity_name', crm_receivable: 'receivable_name', crm_lost_reason: 'reason_code', crm_competitor: 'competitor_code' }[table];
      const where = table === 'crm_customer_credit' ? "customer_id NOT IN (SELECT customer_id FROM crm_customer WHERE customer_code LIKE 'E3C_%')"
        : ownedColumn ? ownedColumn + " NOT LIKE 'E3C_%'" : '1=1';
      const statement = 'SELECT * FROM ' + table + ' WHERE ' + where + ' ORDER BY ' + key + ';';
      const digest = () => createHash('sha256').update(database(statement)).digest('hex');
      return { table, before: digest(), digest };
    });
  const preserve = () => {
    for (const entry of initialTables) check('prior_independent_' + entry.table + '_kept', entry.before === entry.digest());
    check('only_internal_messages_used', database("SELECT COUNT(*) FROM sys_message_record WHERE channel_type<>'INTERNAL';") === '0');
    evidence.preservation = true;
  };
  return { ...runtime, marker, fixture, evidence, acceptance, identifier, user, tenant, sleep, day, waitFor, cents, sameMoney, prove, rejected, own,
    customer, opportunity, quote, receivable, receive, credit, propose, approval, tasks, task, decide, reviewCredit, lose, contractBody, preserve };
}
