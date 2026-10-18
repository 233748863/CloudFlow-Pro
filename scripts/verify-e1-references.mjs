import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { createE1ActivityRuntime } from './runtime-checks/e1-activity-runtime.mjs';
import { verifyCustomerCapacity } from './runtime-checks/e1-customer-capacity.mjs';
import { verifyCustomerSearch } from './runtime-checks/e1-customer-search.mjs';

assert.ok(process.argv.includes('--e1-references'));
const output = process.argv[process.argv.indexOf('--output') + 1];
assert.ok(output);
const runtime = await createE1ActivityRuntime('D:/CloudFlowPro', output);
const { check, ok, api, database, sessions } = runtime;
const marker = 'E1REF_' + randomUUID().replaceAll('-', '').slice(0, 12);
const sql = value => "CONVERT(UNHEX('" + Buffer.from(String(value)).toString('hex') + "') USING utf8mb4)";
const digest = value => createHash('sha256').update(value).digest('hex');
const at = value => { const date = new Date(value); return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 19).replace('T', ' '); };
const start = new Date(); start.setFullYear(start.getFullYear() + 11);
const base = { activityType: 'MEETING', status: 'PLANNED', priority: 'MEDIUM', startTime: at(start), endTime: at(start.getTime() + 3600000), bizType: 'NONE' };
const originals = [], sources = [], uiRequests = [];
const activities = new Map(), ownedCustomers = new Map();
const result = { marker, passed: false, boundaries: false, search: false, capacity: false, ui: false, preservation: false, secrets: false, allAcceptanceComplete: false };
for (const [table, key] of [['crm_activity', 'activity_id'], ['crm_activity_participant', 'participant_id'], ['crm_activity_reminder', 'reminder_id'], ['crm_customer', 'customer_id'], ['crm_follow_up', 'follow_up_id'], ['crm_opportunity', 'opportunity_id'], ['crm_lead', 'lead_id'], ['crm_service_ticket', 'ticket_id'], ['oa_contract', 'contract_id'], ['crm_contact', 'contact_id']]) {
  const maximum = database('SELECT COALESCE(MAX(' + key + '),0) FROM ' + table);
  assert.match(maximum, /^\d+$/);
  const query = 'SELECT * FROM ' + table + ' WHERE ' + key + '<=' + maximum + ' ORDER BY ' + key;
  originals.push({ table, query, hash: digest(database(query)) });
}
const grants = digest(database('SELECT * FROM sys_role_menu ORDER BY tenant_id,role_id,menu_id'));
const source = async (actor, kind, endpoint, table, key, nameKey, suffix, body) => {
  const name = marker + '_' + suffix;
  await ok(actor, endpoint, 'POST', body(name));
  const tenant = Number(sessions[actor].identity.tenantId);
  const id = Number(database('SELECT ' + key + ' FROM ' + table + ' WHERE tenant_id=' + tenant + ' AND ' + nameKey + '=' + sql(name) + ' AND deleted=0'));
  check('source_created_' + suffix, Number.isSafeInteger(id) && id > 0);
  const record = await ok(actor, endpoint + '/' + id);
  const fixture = { actor, kind, endpoint, table, key, id, name, customerId: kind === 'CUSTOMER' ? id : record.customerId || record.convertedCustomerId || null, query: 'SELECT * FROM ' + table + ' WHERE ' + key + '=' + id };
  sources.push(fixture);
  return fixture;
};
const foreignSource = async (definition, foreignCustomer) => {
  const original = sources.find(entry => entry.actor === 'admin' && entry.kind === definition.kind);
  assert.ok(original);
  assert.ok(['crm_opportunity', 'crm_lead', 'crm_service_ticket', 'oa_contract'].includes(definition.table));
  const name = marker + '_foreign_' + definition.kind.toLowerCase();
  const columns = database("SELECT COLUMN_NAME FROM information_schema.columns WHERE table_schema='cloud_flow_db' AND table_name=" + sql(definition.table) + ' ORDER BY ORDINAL_POSITION').split(/\r?\n/).filter(column => column !== definition.key);
  assert.ok(columns.every(column => /^[a-z_]+$/.test(column)));
  const values = { tenant_id: '100001', [definition.nameKey]: sql(name), customer_id: String(foreignCustomer.id), customer_name: sql(foreignCustomer.name), owner_id: String(sessions.foreign.identity.userId), owner_name: sql(marker + '_foreign'), create_by: sql(marker), update_by: sql(marker), create_time: 'NOW()', update_time: 'NOW()', version: '0' };
  for (const column of ['lead_no', 'ticket_no', 'contract_no', 'opportunity_no']) values[column] = sql(name);
  const statement = 'INSERT INTO ' + definition.table + ' (' + columns.join(',') + ') SELECT ' + columns.map(column => values[column] ?? column).join(',') + ' FROM ' + definition.table + ' WHERE ' + definition.key + '=' + original.id + ' AND tenant_id=100000; SELECT LAST_INSERT_ID();';
  const env = { ...process.env }; delete env.MYSQL_PWD;
  const inserted = spawnSync('mysql.exe', ['--no-defaults', '--protocol=TCP', '--host=127.0.0.1', '--port=' + runtime.state.mysqlPort, '--user=root', '--skip-password', '--batch', '--raw', '--skip-column-names', '--default-character-set=utf8mb4', 'cloud_flow_db'], { input: statement, encoding: 'utf8', windowsHide: true, env, timeout: 30000 });
  assert.equal(inserted.status, 0, 'Owned foreign reference fixture creation failed');
  assert.match(inserted.stdout.trim(), /^\d+$/);
  const id = Number(inserted.stdout.trim());
  check('foreign_fixture_created_' + definition.kind, Number.isSafeInteger(id) && id > 0);
  const record = await ok('foreign', definition.endpoint + '/' + id);
  const fixture = { actor: 'foreign', kind: definition.kind, endpoint: definition.endpoint, table: definition.table, key: definition.key, id, name, customerId: record.customerId || record.convertedCustomerId || null, query: 'SELECT * FROM ' + definition.table + ' WHERE ' + definition.key + '=' + id };
  sources.push(fixture);
  return fixture;
};
const customer = (actor, suffix) => source(actor, 'CUSTOMER', '/crm/customer', 'crm_customer', 'customer_id', 'customer_code', suffix, name => ({ customerCode: name, customerName: name, ownerId: Number(sessions[actor].identity.userId) }));
const create = async (suffix, changes, actor = 'admin') => {
  const detail = await ok(actor, '/crm/activity', 'POST', { activity: { ...base, subject: marker + '_' + suffix, ...changes }, participants: [], reminders: [] });
  check('created_activity_' + suffix, detail.activity.activityId > 0);
  activities.set(detail.activity.activityId, actor);
  return detail;
};
const activitySnapshot = () => digest(['crm_activity', 'crm_activity_participant', 'crm_activity_reminder'].map(table => database('SELECT * FROM ' + table + ' ORDER BY 1')).join('\n'));
const rejectWrite = async (actor, method, activity, label) => {
  const before = activitySnapshot();
  const response = await api(actor, '/crm/activity', { method, body: { activity, participants: [], reminders: [] } });
  check(label + '_rejected', response.status === 400 && response.body?.code === 400 && !response.body?.data);
  check(label + '_no_activity_write', activitySnapshot() === before);
};
let failure;
try {
  check('foreign_identity_business_permissions', ['crm:activity:add', 'crm:customer:add', 'crm:opportunity:add', 'crm:lead:add', 'crm:ticket:add', 'oa:contract:add'].every(permission => sessions.foreign.identity.permissions.includes(permission) || sessions.foreign.identity.permissions.includes('*:*:*')));
  const localCustomer = await customer('admin', 'local_customer');
  const otherCustomer = await customer('admin', 'other_customer');
  const foreignCustomer = await customer('foreign', 'foreign_customer');
  const collections = { admin: [localCustomer], foreign: [foreignCustomer] };
  for (const actor of ['admin', 'foreign']) {
    const ownerId = Number(sessions[actor].identity.userId);
    const customerId = actor === 'admin' ? localCustomer.id : foreignCustomer.id;
    const definitions = [
      { kind: 'OPPORTUNITY', endpoint: '/crm/opportunity', table: 'crm_opportunity', key: 'opportunity_id', nameKey: 'opportunity_name', body: name => ({ opportunityName: name, customerId, ownerId, expectedAmount: '10.00' }) },
      { kind: 'LEAD', endpoint: '/crm/lead', table: 'crm_lead', key: 'lead_id', nameKey: 'lead_name', body: name => ({ leadNo: name, leadName: name, companyName: name }) },
      { kind: 'TICKET', endpoint: '/crm/ticket', table: 'crm_service_ticket', key: 'ticket_id', nameKey: 'ticket_title', body: name => ({ customerId, ticketTitle: name, severity: 'P4' }) },
      { kind: 'CONTRACT', endpoint: '/oa/contract', table: 'oa_contract', key: 'contract_id', nameKey: 'contract_name', body: name => ({ contractNo: name, contractName: name, counterpartyName: name, customerId, ownerId, contractType: 'SALES', amount: '10.00', currency: 'CNY' }) },
    ];
    for (const definition of definitions) collections[actor].push(actor === 'foreign'
      ? await foreignSource(definition, foreignCustomer)
      : await source(actor, definition.kind, definition.endpoint, definition.table, definition.key, definition.nameKey, actor + '_' + definition.kind.toLowerCase(), definition.body));
  }
  const lead = collections.admin.find(entry => entry.kind === 'LEAD');
  check('unconverted_lead_has_no_customer', lead.customerId === null);
  const unlinked = await create('unconverted_lead', { bizType: 'LEAD', bizId: lead.id });
  check('unconverted_lead_activity_customer_optional', !unlinked.activity.customerId);
  const assigned = await create('unconverted_lead_customer', { bizType: 'LEAD', bizId: lead.id, customerId: localCustomer.id });
  check('unconverted_lead_activity_explicit_customer', assigned.activity.customerId === localCustomer.id);
  const currentLead = await ok('admin', '/crm/lead/' + lead.id);
  await ok('admin', '/crm/lead/' + lead.id + '/qualify', 'POST', { version: currentLead.version, comment: '活动关联验收' });
  const convertedId = await ok('admin', '/crm/lead/convert', 'POST', { leadId: lead.id, customerName: marker + '_converted_customer', createOpportunity: false });
  check('lead_converted_through_business_flow', Number.isSafeInteger(convertedId) && convertedId > 0 && (await ok('admin', '/crm/lead/' + lead.id)).convertedCustomerId === convertedId);
  lead.customerId = convertedId;
  sources.push({ actor: 'admin', kind: 'CUSTOMER', endpoint: '/crm/customer', table: 'crm_customer', key: 'customer_id', id: convertedId, query: 'SELECT * FROM crm_customer WHERE customer_id=' + convertedId });
  for (const fixture of sources) fixture.hash = digest(database(fixture.query));
  let editing;
  for (const fixture of collections.admin) {
    const kind = fixture.kind;
    const foreign = collections.foreign.find(entry => entry.kind === kind);
    const foreignSaved = await create('valid_foreign_' + kind.toLowerCase(), { bizType: kind, bizId: foreign.id }, 'foreign');
    check('foreign_own_source_is_accessible_' + kind, (foreignSaved.activity.customerId || null) === foreign.customerId && foreignSaved.activity.bizId === foreign.id);
    const saved = await create('valid_' + kind.toLowerCase(), { bizType: kind, bizId: fixture.id });
    check('matching_customer_derived_' + kind, saved.activity.customerId === fixture.customerId);
    const reread = await ok('admin', '/crm/activity/' + saved.activity.activityId);
    check('matching_relation_persisted_' + kind, reread.activity.bizType === kind && reread.activity.bizId === fixture.id && reread.activity.customerId === fixture.customerId);
    editing ||= reread;
    const payload = { ...base, subject: marker + '_rejected_' + kind, bizType: kind, bizId: fixture.id };
    await rejectWrite('admin', 'POST', { ...payload, customerId: otherCustomer.id }, 'cross_customer_create_' + kind);
    await rejectWrite('admin', 'POST', { ...payload, bizId: foreign.id }, 'foreign_source_create_' + kind);
    await rejectWrite('foreign', 'POST', payload, 'reverse_tenant_create_' + kind);
    await rejectWrite('admin', 'POST', { ...payload, customerId: foreignCustomer.id }, 'foreign_customer_create_' + kind);
    await rejectWrite('admin', 'PUT', { ...editing.activity, bizType: kind, bizId: fixture.id, customerId: otherCustomer.id }, 'cross_customer_edit_' + kind);
    await rejectWrite('admin', 'PUT', { ...editing.activity, bizType: kind, bizId: foreign.id, customerId: null }, 'foreign_source_edit_' + kind);
    const unchanged = await ok('admin', '/crm/activity/' + editing.activity.activityId);
    check('rejected_edit_keeps_original_relation_' + kind, unchanged.activity.bizType === editing.activity.bizType && unchanged.activity.bizId === editing.activity.bizId && unchanged.activity.version === editing.activity.version);
  }
  await rejectWrite('sales', 'POST', { ...base, subject: marker + '_private_customer', bizType: 'CUSTOMER', bizId: otherCustomer.id }, 'same_tenant_private_customer');
  const contracts = await ok('admin', '/crm/activity/contracts?' + new URLSearchParams({ customerId: localCustomer.id, pageSize: 100 }));
  check('contract_choices_only_current_customer', contracts.total === 1 && contracts.rows.length === 1 && contracts.rows[0].contractId === collections.admin.find(entry => entry.kind === 'CONTRACT').id && contracts.rows.every(entry => entry.customerId === localCustomer.id));
  const foreignChoices = await api('foreign', '/crm/activity/contracts?' + new URLSearchParams({ customerId: localCustomer.id }));
  check('foreign_contract_choices_denied', foreignChoices.status === 400 && foreignChoices.body?.code === 400 && !foreignChoices.body?.data);
  result.boundaries = true;
  result.search = await verifyCustomerSearch({ runtime, marker, output, sources, ownedCustomers, uiRequests });
  result.capacity = await verifyCustomerCapacity({ runtime, marker, output, ownedCustomers, uiRequests, sources });
  result.ui = result.capacity;
  check('browser_no_runtime_errors', runtime.browserErrors.length === 0);
  check('ui_no_server_failures', uiRequests.every(entry => entry.status < 500));
} catch (error) {
  failure = error instanceof Error ? error.message : 'Reference verification failed';
} finally {
  const finalFailures = [];
  const finalize = async task => { try { await task(); } catch (error) { const message = error instanceof Error ? error.message : 'Reference cleanup failed'; finalFailures.push(message); failure ||= message; } };
  for (const [id, actor] of activities) await finalize(() => ok(actor, '/crm/activity/' + id, 'DELETE'));
  for (const [id, actor] of ownedCustomers) await finalize(() => ok(actor, '/crm/customer/' + id, 'DELETE'));
  await finalize(() => check('owned_activities_removed', database('SELECT COUNT(*) FROM crm_activity WHERE deleted=0 AND subject LIKE ' + sql(marker + '%')) === '0'));
  for (const fixture of sources.filter(entry => entry.hash)) await finalize(() => check('source_fixture_preserved_' + fixture.table + '_' + fixture.id, digest(database(fixture.query)) === fixture.hash));
  for (const original of originals) await finalize(() => check('original_rows_preserved_' + original.table, digest(database(original.query)) === original.hash));
  await finalize(() => check('role_grants_preserved', digest(database('SELECT * FROM sys_role_menu ORDER BY tenant_id,role_id,menu_id')) === grants));
  result.preservation = finalFailures.length === 0;
  await finalize(async () => { result.secretScan = await runtime.scan(); result.secrets = true; });
  result.finalFailures = finalFailures;
  result.sourceFixtures = sources.map(({ actor, table, id }) => ({ actor, table, id }));
  await runtime.close();
  result.passed = !failure; result.failure = failure; result.checks = runtime.checks; result.requests = runtime.requests; result.uiRequests = uiRequests; result.verifiedAt = new Date().toISOString();
  await fs.writeFile(path.join(output, 'result.json'), JSON.stringify(result, null, 2), { flag: 'wx' });
  console.log('E1_REFERENCES: passed=' + result.passed + '; checks=' + runtime.checks.length + '; requests=' + runtime.requests.length + '; ui_requests=' + uiRequests.length + '; boundaries=' + result.boundaries + '; search=' + result.search + '; capacity=' + result.capacity + '; ui=' + result.ui + '; all_acceptance_complete=false');
}
if (failure) throw new Error(failure);
