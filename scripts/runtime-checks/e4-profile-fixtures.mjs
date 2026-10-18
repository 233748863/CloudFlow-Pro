import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';

export function prepareE4ProfileChecks(runtime) {
  const { check, checks, database, rows, sql, ok, api, sessions, ownedEntities } = runtime;
  const marker = 'E4P_' + randomUUID().replaceAll('-', '').slice(0, 12);
  const fixture = { marker, customers: [], leads: [], territories: [], rules: [], campaigns: [], lists: [], conversions: [], batches: [], images: [], measurements: [] };
  const evidence = {}, acceptance = Object.fromEntries(Array.from({ length: 14 }, (_, index) => [index + 1, []]));
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
  const rejected = (response, label, message = /无权|权限|不存在|必须|不能|不能为空|已修改|已被修改|版本|审批|丢单|主因|原因|金额|信用|额度|超期|重复|停用|日期|币种|有效|不允许|不支持|范围/) => {
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
  const lead = async (suffix, fields = {}, actor = 'sales') => {
    const name = marker + '_' + suffix;
    const body = { leadNo: name, leadName: name, companyName: name + '_公司', contactName: '资质验收联系人', email: 'lead' + fixture.leads.length + '.' + marker.toLowerCase() + '@example.test',
      ownerId: user(actor), source: 'EXHIBITION', industry: 'SOFTWARE', ...fields };
    await ok(actor, '/crm/lead', 'POST', body);
    const matches = rows("SELECT JSON_OBJECT('id',CAST(lead_id AS CHAR),'owner',CAST(owner_id AS CHAR),'dept',CAST(dept_id AS CHAR)) FROM crm_lead WHERE tenant_id=" + tenant(actor) + ' AND lead_no=' + sql(name) + ' AND deleted=0;');
    check('lead_' + suffix + '_created_once', matches.length === 1);
    const entry = { ...matches[0], name, actor, tenant: tenant(actor), supplied: body };
    entry.id = own('lead', entry.id); fixture.leads.push(entry); return entry;
  };
  const readLead = sample => ok(sample.actor, '/crm/lead/' + sample.id);
  const leadPage = (actor = 'sales', filters = {}) => ok(actor, '/crm/lead/list?' + new URLSearchParams({ leadName: marker, pageNum: '1', pageSize: '200', ...filters }));
  const qualification = async (sample, action, fields = {}) => {
    const current = await readLead(sample);
    return ok(sample.actor, '/crm/lead/' + sample.id + '/' + action, 'POST', { version: current.version, comment: marker + '_评估说明', ...fields });
  };
  const territory = async (suffix, fields = {}, actor = 'manager') => {
    const actual = await ok(actor, '/crm/territory', 'POST', { territoryCode: marker + '_' + suffix, territoryName: suffix, parentId: 0, status: 'ACTIVE', sortNo: fixture.territories.length, ownerId: user(actor), ...fields });
    own('territory', actual.territoryId);
    const entry = { id: identifier(actual.territoryId), actor, actual };
    fixture.territories.push(entry); return entry;
  };
  const territories = (actor = 'manager', parent) => ok(actor, '/crm/territory/tree' + (parent ? '?parentId=' + identifier(parent) : ''));
  const readTerritory = async sample => (await territories(sample.actor)).find(value => String(value.territoryId) === sample.id);
  const scoreRule = async (suffix, fields = {}, actor = 'manager') => {
    const actual = await ok(actor, '/crm/lead-score/rule', 'POST', { ruleName: marker + '_' + suffix, fieldName: 'company_name', operator: 'CONTAINS', fieldValue: marker, score: 10, enabledFlag: 1, sortNo: 100 + fixture.rules.length, ...fields });
    const entry = { id: own('rule', actual.ruleId), actor, actual };
    fixture.rules.push(entry); return entry;
  };
  const campaign = async (suffix, actor = 'sales') => {
    const actual = await ok(actor, '/crm/campaign', 'POST', { campaign: { campaignCode: marker + '_' + suffix, campaignName: marker + '_' + suffix,
      campaignType: 'EVENT', status: 'PLANNING', ownerId: user(actor), startDate: day(), endDate: day(30), budget: '100.00', actualCost: '0.00' }, targetLists: [] });
    const entry = { id: own('campaign', actual.campaignId), actor, actual }; fixture.campaigns.push(entry); return entry;
  };
  const audit = (name, type, id) => rows("SELECT JSON_OBJECT('id',CAST(audit_id AS CHAR),'name',audit_name,'field',audit_field,'detail',after_val,'actor',create_by,'risk',high_risk) FROM sys_audit_log WHERE tenant_id=100000 AND biz_module='crm' AND audit_name=" + sql(name) + ' AND audit_field=' + sql(type + ':' + identifier(id)) + ' ORDER BY audit_id;');
  const initialTables = [['crm_lead', 'lead_id'], ['crm_customer', 'customer_id'], ['crm_contact', 'contact_id'], ['crm_opportunity', 'opportunity_id'],
    ['crm_territory', 'territory_id'], ['crm_lead_score_rule', 'rule_id'], ['crm_campaign', 'campaign_id'], ['crm_target_list', 'list_id'],
    ['crm_target_list_member', 'member_id'], ['crm_campaign_target_list', 'relation_id'], ['sys_role_menu', ''], ['sys_user_role', '']].map(([table, primary]) => {
    const identifiers = primary ? database('SELECT ' + primary + ' FROM ' + table + ' ORDER BY ' + primary + ';').split(/\r?\n/).filter(Boolean).map(identifier) : [];
    const where = primary ? identifiers.length ? primary + ' IN (' + identifiers.join(',') + ')' : '1=0' : '1=1';
    const order = primary || (table === 'sys_role_menu' ? 'role_id,menu_id,tenant_id' : 'user_id,role_id,tenant_id');
    const statement = 'SELECT * FROM ' + table + ' WHERE ' + where + ' ORDER BY ' + order + ';';
    const digest = () => createHash('sha256').update(database(statement)).digest('hex');
    return { table, before: digest(), digest };
  });
  const preserve = () => {
    for (const entry of initialTables) check('prior_independent_' + entry.table + '_kept', entry.before === entry.digest());
    check('only_internal_messages_used', database("SELECT COUNT(*) FROM sys_message_record WHERE channel_type<>'INTERNAL';") === '0');
    evidence.preservation = true;
  };
  return { ...runtime, marker, fixture, evidence, acceptance, identifier, user, tenant, sleep, day, waitFor, cents, sameMoney, prove, rejected, own,
    customer, lead, readLead, leadPage, qualification, territory, territories, readTerritory, scoreRule, campaign, audit, preserve };
}
