import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';

export function prepareH3PerformanceChecks(runtime) {
  const { check, database, rows, sql, ok, api, sessions, ownedEntities, paceWorkflowStart } = runtime;
  const marker = 'H3P_' + randomUUID().replaceAll('-', '').slice(0, 10);
  const fixture = { marker, opportunities: [], contracts: [], receipts: [], refunds: [], measurements: [], images: [] };
  const evidence = {}, cleanups = [];
  const identifier = value => { const result = String(value); assert.match(result, /^[1-9][0-9]*$/); return result; };
  const user = actor => identifier(sessions[actor].identity.userId);
  const tenant = actor => identifier(sessions[actor].identity.tenantId);
  const own = (kind, value) => {
    const id = identifier(value);
    if (!ownedEntities.has(kind)) ownedEntities.set(kind, new Set());
    ownedEntities.get(kind).add(id); return id;
  };
  const day = (offset = 0) => new Date(Date.now() + 8 * 3600000 + offset * 86400000).toISOString().slice(0, 10);
  const period = {
    previous: { startDate: database("SELECT DATE_FORMAT(DATE_SUB(CURRENT_DATE,INTERVAL 1 MONTH),'%Y-%m-01');"), endDate: database('SELECT LAST_DAY(DATE_SUB(CURRENT_DATE,INTERVAL 1 MONTH));') },
    current: { startDate: database("SELECT DATE_FORMAT(CURRENT_DATE,'%Y-%m-01');"), endDate: database('SELECT LAST_DAY(CURRENT_DATE);') },
  };
  period.combined = { startDate: period.previous.startDate, endDate: period.current.endDate };
  const waitFor = async (read, accepts, label, timeout = 90000) => {
    const deadline = Date.now() + timeout;
    do { const value = await read(); if (accepts(value)) return value; await new Promise(resolve => setTimeout(resolve, 300)); } while (Date.now() < deadline);
    throw new Error(label);
  };
  const units = (value, scale = 2) => {
    const match = String(value).match(/^(-?)([0-9]+)(?:\.([0-9]+))?$/);
    assert.ok(match && (!match[3] || match[3].length <= scale || /^0*$/.test(match[3].slice(scale))), 'Exact fixed-decimal value required');
    return (match[1] ? -1n : 1n) * (BigInt(match[2]) * 10n ** BigInt(scale) + BigInt((match[3] || '').padEnd(scale, '0').slice(0, scale) || '0'));
  };
  const sameMoney = (actual, expected) => actual != null && units(actual) === units(expected);
  const rejected = (response, label) => check(label, (response.status === 200 && response.body?.code !== 200
    || [400, 401, 403, 404, 409, 429, 503].includes(response.status)) && response.body?.code !== 200);
  const owners = ['admin', 'sales', 'other'].map(user), departments = ['100', '990000840'];
  const query = async (actor, endpoint, range = {}, basis = 'TEAM_V2', currency = 'CNY', extra = {}) => {
    const parameters = new URLSearchParams({ ...range, currency, ...extra });
    if (basis !== null) parameters.set('calculationBasis', basis);
    const result = await ok(actor, '/hr/performance/crm/' + endpoint + '?' + parameters);
    const dimension = endpoint.includes('owners') ? 'OWNER' : 'DEPT';
    check('actual_' + actor + '_' + endpoint + '_typed_result', Array.isArray(result) && result.every(row => row.dimension === dimension
      && row.calculationBasis === (basis || 'OWNER_V1') && row.currency === currency
      && /^[1-9][0-9]*$/.test(String(row.targetId))
      && [row.wonOpportunityCount, row.customerCount, row.followUpCount].every(Number.isSafeInteger)
      && [row.wonAmount, row.contractAmount, row.receivedAmount, row.outstandingAmount, row.baselineWonAmount, row.baselineContractAmount, row.baselineReceivedAmount]
        .every(value => typeof value === 'string' && /^-?[0-9]+\.[0-9]{2}$/.test(value))
      && typeof row.allocatedWonCount === 'string' && /^-?[0-9]+\.[0-9]{4}$/.test(row.allocatedWonCount)));
    return result;
  };
  const querySet = async (actor = 'admin', range = period.current, basis = 'TEAM_V2', currency = 'CNY') => {
    const result = {
      owners: await query(actor, 'owners', range, basis, currency, { ownerIds: owners.join(',') }),
      depts: await query(actor, 'depts', range, basis, currency, { deptIds: departments.join(',') }),
      topOwners: await query(actor, 'top-owners', range, basis, currency, { limit: '200' }),
      topDepts: await query(actor, 'top-depts', range, basis, currency, { limit: '200' }),
    };
    for (const [group, ranking, selected] of [['owners', 'topOwners', owners], ['depts', 'topDepts', departments]]) {
      check(actor + '_' + group + '_only_selected_ids', result[group].every(row => selected.includes(String(row.targetId))));
      check(actor + '_' + group + '_same_as_ranking', result[group].every(row => isDeepStrictEqual(row, result[ranking].find(value => String(value.targetId) === String(row.targetId)))));
      check(actor + '_' + ranking + '_sorted_by_receipt_then_id', result[ranking].every((row, index, values) => index === 0
        || units(values[index - 1].receivedAmount) > units(row.receivedAmount)
        || units(values[index - 1].receivedAmount) === units(row.receivedAmount) && BigInt(values[index - 1].targetId) < BigInt(row.targetId)));
    }
    evidence.queries = true; return result;
  };
  const metric = (set, group, id, field) => set[group].find(row => String(row.targetId) === String(id))?.[field] ?? '0';
  const expectDelta = (before, after, expected, label) => {
    for (const [group, targets] of Object.entries(expected)) {
      for (const [id, fields] of Object.entries(targets)) {
        for (const [field, value] of Object.entries(fields)) {
          const scale = field === 'allocatedWonCount' ? 4 : field.endsWith('Count') ? 0 : 2;
          check(label + '_' + group + '_' + id + '_' + field,
            units(metric(after, group, id, field), scale) - units(metric(before, group, id, field), scale) === units(value, scale));
        }
      }
    }
    fixture.measurements.push({ label, expected });
  };
  const createCustomer = async (suffix, actor = 'sales') => {
    const name = marker + '_' + suffix;
    await ok(actor, '/crm/customer', 'POST', { customerCode: name, customerName: name, ownerId: user(actor) });
    return own('customer', database('SELECT customer_id FROM crm_customer WHERE tenant_id=' + tenant(actor) + ' AND customer_code=' + sql(name) + ' AND deleted=0;'));
  };
  const createOpportunity = async (suffix, customerId, amount = '100.01', actor = 'sales') => {
    const name = marker + '_' + suffix;
    await ok(actor, '/crm/opportunity', 'POST', { opportunityName: name, customerId, expectedAmount: amount, ownerId: user(actor) });
    const id = own('opportunity', database('SELECT opportunity_id FROM crm_opportunity WHERE tenant_id=' + tenant(actor) + ' AND opportunity_name=' + sql(name) + ' AND deleted=0;'));
    fixture.opportunities.push({ id, actor, customerId, amount }); return id;
  };
  const detail = (id, actor = 'admin') => ok(actor, '/crm/opportunity/' + identifier(id));
  const saveTeam = async (kind, id, members, actor = 'admin') => {
    const endpoint = '/crm/deal-team/' + kind + '/' + identifier(id);
    const current = await ok(actor, endpoint);
    return ok(actor, endpoint, 'PUT', { businessVersion: current.businessVersion, teamVersion: current.teamVersion,
      remark: marker + '_实际团队', members: members.map(([member, roleType, percentage]) => ({ salesUserId: user(member), roleType, allocatedPercentage: percentage })) });
  };
  const events = (kind, id, actor = 'admin') => rows("SELECT JSON_OBJECT('id',CAST(event_id AS CHAR),'type',event_type,'amount',CAST(amount AS CHAR),'currency',currency,'reversal',CAST(reversal_of_id AS CHAR),'baseline',baseline_flag,'occurred',DATE_FORMAT(occurred_time,'%Y-%m-%d %H:%i:%s')) FROM crm_deal_event WHERE tenant_id="
    + tenant(actor) + ' AND biz_type=' + sql(kind) + ' AND biz_id=' + identifier(id) + ' ORDER BY event_id;');
  const allocations = eventId => rows("SELECT JSON_OBJECT('id',CAST(allocation_id AS CHAR),'user',CAST(sales_user_id AS CHAR),'employee',CAST(employee_id AS CHAR),'dept',CAST(dept_id AS CHAR),'role',role_type,'percentage',CAST(allocated_percentage AS CHAR),'amount',CAST(allocated_amount AS CHAR),'reversal',CAST(reversal_of_id AS CHAR)) FROM crm_deal_allocation WHERE tenant_id=100000 AND event_id=" + identifier(eventId) + ' ORDER BY allocation_id;');
  const win = async (id, actor = 'sales') => {
    const current = await detail(id, actor);
    await ok(actor, '/crm/opportunity/' + id + '/win', 'POST', { version: current.version });
    const actual = events('OPPORTUNITY', id, actor).filter(value => value.reversal == null).at(-1);
    check('actual_won_fact_' + id, actual?.type === 'WON'); own('event', actual.id);
    await waitFor(() => database("SELECT COUNT(*) FROM oa_contract WHERE tenant_id=" + tenant(actor) + " AND source_type='CRM_OPPORTUNITY' AND source_id=" + identifier(id) + ' AND deleted=0;'), value => Number(value) > 0, 'Actual won contract was not created');
    return actual;
  };
  const reopen = async (id, actor = 'manager') => {
    const current = await detail(id, actor);
    return ok(actor, '/crm/opportunity/' + id + '/stage-reopen', 'POST', { version: current.version, targetStage: 'QUALIFIED', reason: marker + '_客户重新确认' });
  };
  const tasks = instance => rows("SELECT JSON_OBJECT('id',task_id,'node',node_key,'assignee',CAST(assignee AS CHAR)) FROM wf_task WHERE tenant_id=100000 AND instance_id=" + sql(instance) + " AND status='TODO' ORDER BY task_id;");
  const approval = id => rows("SELECT JSON_OBJECT('id',CAST(approval_id AS CHAR),'status',status,'instance',instance_id) FROM crm_approval WHERE tenant_id=100000 AND approval_id=" + identifier(id) + ';')[0];
  const refund = async (receivableId, receiptEventId, amount, owner = 'admin') => {
    const current = await ok('finance', '/crm/receivable/' + receivableId);
    await paceWorkflowStart('finance');
    const id = own('approval', await ok('finance', '/crm/approval/refund', 'POST', { receivableId, receiptEventId, version: current.version,
      refundAmount: amount, reason: marker + '_所选原款退款' }));
    const bound = await waitFor(() => approval(id), value => Boolean(value?.instance), 'Refund workflow not bound');
    const stages = [];
    for (const [node, actor] of [['customer_owner', owner], ['finance_review', 'reviewer']]) {
      const pending = await waitFor(() => tasks(bound.instance), values => values.some(value => value.node === node && value.assignee === user(actor)), 'Expected real refund approver missing');
      const chosen = pending.find(value => value.node === node && value.assignee === user(actor));
      await ok(actor, '/workflow/wf/complete', 'POST', { taskId: chosen.id, action: 'APPROVE', comment: marker + '_' + node });
      stages.push({ node, actor: user(actor), task: chosen.id });
    }
    await waitFor(() => approval(id), value => value.status === 'APPROVED', 'Refund callback did not complete');
    const history = rows("SELECT JSON_OBJECT('task',task_id,'node',node_key,'actor',CAST(operator_id AS CHAR),'represented',on_behalf_of_user_id,'type',task_type) FROM wf_task_history WHERE tenant_id=100000 AND instance_id=" + sql(bound.instance) + " AND action IN ('APPROVE','COUNTERSIGN_APPROVE') ORDER BY create_time,history_id;");
    check('actual_refund_two_independent_approvals_' + id, history.length === 2 && stages.every(stage => history.some(value => value.task === stage.task && value.actor === stage.actor && value.node === stage.node))
      && history.every(value => value.represented == null && !String(value.type).startsWith('AUTO_')));
    const result = { id, receivableId, receiptEventId, amount, stages }; fixture.refunds.push(result); return result;
  };
  const initialTables = [['crm_customer', 'customer_id'], ['crm_opportunity', 'opportunity_id'], ['crm_receivable', 'receivable_id'], ['oa_contract', 'contract_id'],
    ['crm_deal_event', 'event_id'], ['crm_deal_allocation', 'allocation_id'], ['hr_comp_change', 'id'], ['hr_salary_slip', 'id']].map(([table, primary]) => {
    const identifiers = database('SELECT ' + primary + ' FROM ' + table + ' ORDER BY ' + primary + ';').split(/\r?\n/).filter(Boolean).map(identifier);
    const statement = 'SELECT * FROM ' + table + ' WHERE ' + (identifiers.length ? primary + ' IN (' + identifiers.join(',') + ')' : '1=0') + ' ORDER BY ' + primary + ';';
    const digest = () => createHash('sha256').update(database(statement)).digest('hex'); return { table, before: digest(), digest };
  });
  const preserve = () => { for (const value of initialTables) check('prior_independent_' + value.table + '_kept', value.before === value.digest()); evidence.preservation = true; };
  return { ...runtime, marker, fixture, evidence, cleanups, identifier, user, tenant, own, day, period, waitFor, units, sameMoney, rejected,
    owners, departments, query, querySet, metric, expectDelta, createCustomer, createOpportunity, detail, saveTeam, events, allocations, win, reopen, tasks, refund, preserve };
}
