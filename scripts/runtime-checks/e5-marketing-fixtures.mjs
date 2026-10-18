import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';

export function prepareE5MarketingChecks(runtime) {
  const { check, checks, database, rows, sql, ok, api, sessions, ownedEntities, paceWorkflowStart } = runtime;
  const marker = 'E5M_' + randomUUID().replaceAll('-', '').slice(0, 12);
  const fixture = { marker, campaigns: [], lists: [], leads: [], conversions: [], receipts: [], refunds: [], images: [], measurements: [] };
  const evidence = {}, acceptance = Object.fromEntries(Array.from({ length: 21 }, (_, index) => [index + 1, []])), cleanups = [];
  const identifier = value => { const result = String(value); assert.match(result, /^[1-9][0-9]*$/); return result; };
  const user = actor => identifier(sessions[actor].identity.userId);
  const tenant = actor => identifier(sessions[actor].identity.tenantId);
  const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
  const day = (offset = 0) => new Date(Date.now() + 8 * 3600000 + offset * 86400000).toISOString().slice(0, 10);
  const waitFor = async (read, accepts, label, timeout = 60000) => {
    const deadline = Date.now() + timeout;
    do { const value = await read(); if (accepts(value)) return value; await sleep(250); } while (Date.now() < deadline);
    throw new Error(label);
  };
  const cents = value => {
    const parts = String(value).match(/^(-?)(\d+)(?:\.(\d+))?$/);
    assert.ok(parts && (!parts[3] || parts[3].length <= 2 || /^0*$/.test(parts[3].slice(2))), 'Exact two-decimal amount required');
    return (parts[1] ? -1n : 1n) * (BigInt(parts[2]) * 100n + BigInt((parts[3] || '').padEnd(2, '0').slice(0, 2)));
  };
  const sameMoney = (actual, expected) => actual != null && cents(actual) === cents(expected);
  const prove = async (numbers, work) => {
    const first = checks.length, result = await work(), labels = checks.slice(first);
    assert.ok(labels.length > 0);
    for (const number of Array.isArray(numbers) ? numbers : [numbers]) { assert.ok(acceptance[number]); acceptance[number].push(...labels); }
    return result;
  };
  const rejected = (response, label) => check(label, (response.status === 200 && response.body?.code !== 200 || [400, 403, 404, 409, 429].includes(response.status)) && response.body?.code !== 200);
  const own = (kind, value) => {
    const id = identifier(value);
    if (!ownedEntities.has(kind)) ownedEntities.set(kind, new Set());
    ownedEntities.get(kind).add(id); return id;
  };
  const campaign = async (suffix, fields = {}, actor = 'admin', targetLists = []) => {
    const name = marker + '_' + suffix;
    const actual = await ok(actor, '/crm/campaign', 'POST', { campaign: { campaignCode: name, campaignName: name,
      campaignType: 'EVENT', status: 'ACTIVE', startDate: day(), endDate: day(), budget: '100.00', actualCost: '50.00', ownerId: user(actor), ...fields }, targetLists });
    const sample = { id: own('campaign', actual.campaignId), actor, actual, name }; fixture.campaigns.push(sample); return sample;
  };
  const readCampaign = sample => ok(sample.actor, '/crm/campaign/' + sample.id);
  const recalculate = sample => ok(sample.actor, '/crm/campaign/' + sample.id + '/recalculate', 'POST');
  const saveCampaign = async (sample, fields) => {
    const current = await readCampaign(sample);
    return ok(sample.actor, '/crm/campaign', 'POST', { ...current, campaign: { ...current.campaign, ...fields } });
  };
  const lead = async (suffix, fields = {}, actor = 'admin') => {
    const name = marker + '_' + suffix;
    const body = { leadNo: name, leadName: name, companyName: name, contactName: '营销验收联系人', email: 'lead' + fixture.leads.length + '.' + marker.toLowerCase() + '@example.com',
      ownerId: user(actor), source: 'EXHIBITION', industry: marker, ...fields };
    await ok(actor, '/crm/lead', 'POST', body);
    const id = own('lead', database('SELECT lead_id FROM crm_lead WHERE tenant_id=' + tenant(actor) + ' AND lead_no=' + sql(name) + ' AND deleted=0;'));
    const sample = { id, name, actor, supplied: body }; fixture.leads.push(sample); return sample;
  };
  const targetList = async (suffix, members, actor = 'admin', condition) => {
    const actual = await ok(actor, '/crm/target-list', 'POST', { list: { listCode: marker + '_' + suffix, listName: marker + '_' + suffix,
      sourceType: condition ? 'QUERY' : 'MANUAL', status: 'ACTIVE', ownerId: user(actor) }, members, condition });
    const sample = { id: own('list', actual.listId), name: actual.listName, actor, actual }; fixture.lists.push(sample); return sample;
  };
  const convert = async (sample, expectedAmount = '100.00') => {
    let current = await ok(sample.actor, '/crm/lead/' + sample.id);
    await ok(sample.actor, '/crm/lead/' + sample.id + '/start-qualifying', 'POST', { version: current.version, comment: marker + '_开始评估' });
    current = await ok(sample.actor, '/crm/lead/' + sample.id);
    await ok(sample.actor, '/crm/lead/' + sample.id + '/qualify', 'POST', { version: current.version, comment: marker + '_通过资质' });
    const customerId = own('customer', await ok(sample.actor, '/crm/lead/convert', 'POST', { leadId: sample.id, customerName: sample.name + '_客户',
      createOpportunity: true, opportunityName: sample.name + '_商机', expectedAmount }));
    const opportunityId = own('opportunity', database('SELECT opportunity_id FROM crm_opportunity WHERE tenant_id=100000 AND customer_id=' + customerId + ' AND deleted=0;'));
    const result = { leadId: sample.id, customerId, opportunityId, actor: sample.actor };
    fixture.conversions.push(result); return result;
  };
  const approval = id => rows("SELECT JSON_OBJECT('id',CAST(approval_id AS CHAR),'status',status,'instance',instance_id,'payload',payload_json) FROM crm_approval WHERE tenant_id=100000 AND approval_id=" + identifier(id) + ';')[0];
  const tasks = instance => rows("SELECT JSON_OBJECT('id',task_id,'node',node_key,'assignee',CAST(assignee AS CHAR)) FROM wf_task WHERE tenant_id=100000 AND instance_id=" + sql(instance) + " AND status='TODO' ORDER BY task_id;");
  const refund = async (receivableId, receiptEventId, amount, owner = 'admin') => {
    const current = await ok('finance', '/crm/receivable/' + receivableId);
    await paceWorkflowStart('finance');
    const id = own('approval', await ok('finance', '/crm/approval/refund', 'POST', { receivableId, receiptEventId, version: current.version,
      refundAmount: amount, reason: marker + '_所选原款退款' }));
    const bound = await waitFor(() => approval(id), value => Boolean(value?.instance), 'Refund process did not start');
    const stages = [];
    for (const [node, actor] of [['customer_owner', owner], ['finance_review', 'reviewer']]) {
      const pending = await waitFor(() => tasks(bound.instance), values => values.some(value => value.node === node && value.assignee === user(actor)), 'Expected refund approver did not receive the task');
      check('refund_' + node + '_only_expected_stage', pending.length > 0 && pending.every(value => value.node === node));
      const chosen = pending.find(value => value.assignee === user(actor));
      await ok(actor, '/workflow/wf/complete', 'POST', { taskId: chosen.id, action: 'APPROVE', comment: marker + '_' + node });
      stages.push({ node, actor: user(actor), task: chosen.id });
    }
    await waitFor(() => approval(id), value => value.status === 'APPROVED', 'Refund callback did not finish');
    const history = rows("SELECT JSON_OBJECT('task',task_id,'node',node_key,'actor',CAST(operator_id AS CHAR),'action',action,'represented',on_behalf_of_user_id,'type',task_type) FROM wf_task_history WHERE tenant_id=100000 AND instance_id=" + sql(bound.instance) + " AND action IN ('APPROVE','COUNTERSIGN_APPROVE') ORDER BY create_time,history_id;");
    check('refund_actual_owner_then_other_finance', stages.every(stage => history.some(value => value.task === stage.task && value.actor === stage.actor && value.node === stage.node))
      && history.length === 2 && history.every(value => value.represented == null && !String(value.type).startsWith('AUTO_')));
    const result = { id, receivableId: identifier(receivableId), receiptEventId: identifier(receiptEventId), amount, stages };
    fixture.refunds.push(result); return result;
  };
  const initialTables = [['crm_lead', 'lead_id'], ['crm_customer', 'customer_id'], ['crm_contact', 'contact_id'], ['crm_opportunity', 'opportunity_id'],
    ['crm_campaign', 'campaign_id'], ['crm_target_list', 'list_id'], ['crm_receivable', 'receivable_id'], ['oa_contract', 'contract_id'],
    ['sys_user_role', ''], ['sys_role_menu', '']].map(([table, primary]) => {
    const identifiers = primary ? database('SELECT ' + primary + ' FROM ' + table + ' ORDER BY ' + primary + ';').split(/\r?\n/).filter(Boolean).map(identifier) : [];
    const where = primary ? identifiers.length ? primary + ' IN (' + identifiers.join(',') + ')' : '1=0' : '1=1';
    const order = primary || (table === 'sys_role_menu' ? 'role_id,menu_id,tenant_id' : 'user_id,role_id,tenant_id');
    const statement = 'SELECT * FROM ' + table + ' WHERE ' + where + ' ORDER BY ' + order + ';';
    const digest = () => createHash('sha256').update(database(statement)).digest('hex');
    return { table, before: digest(), digest };
  });
  const preserve = () => {
    for (const value of initialTables) check('prior_independent_' + value.table + '_kept', value.before === value.digest());
    evidence.preservation = true;
  };
  return { ...runtime, marker, fixture, evidence, acceptance, cleanups, identifier, user, tenant, sleep, day, waitFor, cents, sameMoney, prove, rejected, own,
    campaign, readCampaign, recalculate, saveCampaign, lead, targetList, convert, refund, preserve };
}
