import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { createE1ActivityRuntime } from './runtime-checks/e1-activity-runtime.mjs';
import { verifyCalendarPerformance } from './runtime-checks/e1-calendar-performance.mjs';
import { verifyTimelineUi } from './runtime-checks/e1-timeline-ui.mjs';

assert.ok(process.argv.includes('--e1-timeline'));
const output = process.argv[process.argv.indexOf('--output') + 1];
assert.ok(output);
const runtime = await createE1ActivityRuntime('D:/CloudFlowPro', output);
const { check, ok, api, database, sessions } = runtime;
const marker = 'E1TIME_' + randomUUID().replaceAll('-', '').slice(0, 12);
const sql = value => "CONVERT(UNHEX('" + Buffer.from(String(value)).toString('hex') + "') USING utf8mb4)";
const digest = value => createHash('sha256').update(value).digest('hex');
const at = value => { const date = new Date(value); return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 19).replace('T', ' '); };
const originals = [], sources = [], uiRequests = [], screenshots = [], expected = [];
const activities = new Map();
const result = { marker, passed: false, timeline: false, pagination: false, performance: false, ui: false, preservation: false, secrets: false, allAcceptanceComplete: false };
let baselineReady = false;
let failure;
const source = async (actor, table, key, endpoint, nameKey, suffix, body) => {
  const name = marker + '_' + suffix;
  await ok(actor, endpoint, 'POST', body(name));
  const id = Number(database('SELECT ' + key + ' FROM ' + table + ' WHERE tenant_id=' + Number(sessions[actor].identity.tenantId) + ' AND ' + nameKey + '=' + sql(name) + ' AND deleted=0'));
  check('source_created_' + suffix, Number.isSafeInteger(id) && id > 0);
  sources.push({ table, id, query: 'SELECT * FROM ' + table + ' WHERE ' + key + '=' + id });
  return await ok(actor, endpoint + '/' + id);
};
const customer = (actor, suffix) => source(actor, 'crm_customer', 'customer_id', '/crm/customer', 'customer_code', suffix,
  name => ({ customerCode: name, customerName: name, ownerId: Number(sessions[actor].identity.userId) }));
const createActivity = async (actor, customerId, suffix, startTime, changes = {}, participants = []) => {
  const detail = await ok(actor, '/crm/activity', 'POST', { activity: {
    activityType: 'MEETING', subject: marker + '_' + suffix, status: 'PLANNED', priority: 'MEDIUM',
    startTime, endTime: at(new Date(startTime.replace(' ', 'T')).getTime() + 3600000),
    bizType: 'CUSTOMER', bizId: customerId, customerId, ...changes,
  }, participants, reminders: [] });
  const activity = detail.activity;
  check('activity_created_' + suffix, Number.isSafeInteger(activity.activityId) && activity.activityId > 0 && activity.customerId === customerId);
  activities.set(activity.activityId, { actor, activity });
  check('activity_server_timezone_' + suffix, activity.startTime === startTime);
  return activity;
};
const timelineItem = (type, sourceId, title, content, status, eventTime, ownerName) => ({ type, sourceId, title, content: content || null,
  status: status || null, eventTime, ownerName: ownerName || null });
const chronological = (left, right) => right.eventTime.localeCompare(left.eventTime)
  || (left.type < right.type ? -1 : left.type > right.type ? 1 : right.sourceId - left.sourceId);
const timelinePage = async (actor, customerId, entries, type = '', pageSize = 7) => {
  const filtered = entries.filter(item => !type || item.type === type);
  const received = [];
  for (let pageNum = 1; pageNum <= Math.max(1, Math.ceil(filtered.length / pageSize)); pageNum++) {
    const response = await ok(actor, '/crm/activity/customer/' + customerId + '/timeline?' + new URLSearchParams({ type, pageNum, pageSize }));
    check('timeline_' + actor + '_' + (type || 'ALL') + '_page_' + pageNum + '_total', response.total === filtered.length);
    const projected = response.rows.map(item => timelineItem(item.type, item.sourceId, item.title, item.content, item.status, item.eventTime, item.ownerName));
    assert.deepEqual(projected, filtered.slice((pageNum - 1) * pageSize, pageNum * pageSize), 'Timeline page differs from its real business sources');
    check('timeline_' + actor + '_' + (type || 'ALL') + '_page_' + pageNum + '_sources', true);
    received.push(...projected);
  }
  check('timeline_' + actor + '_' + (type || 'ALL') + '_no_duplicate_or_missing_source', new Set(received.map(item => item.type + ':' + item.sourceId)).size === filtered.length);
  for (let index = 1; index < received.length; index++) check('timeline_' + actor + '_' + (type || 'ALL') + '_global_order_' + index, chronological(received[index - 1], received[index]) <= 0);
  return received;
};
try {
  for (const [table, key] of [
    ['crm_activity', 'activity_id'], ['crm_activity_participant', 'participant_id'], ['crm_activity_reminder', 'reminder_id'],
    ['crm_customer', 'customer_id'], ['crm_follow_up', 'follow_up_id'], ['crm_opportunity', 'opportunity_id'],
    ['crm_opportunity_item', 'item_id'], ['crm_opportunity_stage_history', 'history_id'], ['crm_sales_stage', 'stage_id'],
    ['crm_quote', 'quote_id'], ['crm_quote_line', 'quote_line_id'], ['crm_receivable', 'receivable_id'],
    ['crm_deal_team', 'team_id'], ['crm_deal_event', 'event_id'], ['crm_deal_allocation', 'allocation_id'],
    ['crm_service_ticket', 'ticket_id'], ['crm_lead', 'lead_id'], ['crm_contact', 'contact_id'], ['oa_contract', 'contract_id'],
  ]) {
    const maximum = database('SELECT COALESCE(MAX(' + key + '),0) FROM ' + table);
    assert.match(maximum, /^\d+$/);
    const query = 'SELECT * FROM ' + table + ' WHERE ' + key + '<=' + maximum + ' ORDER BY ' + key;
    originals.push({ table, query, hash: digest(database(query)) });
  }
  for (const [table, order] of [['sys_role_menu', 'tenant_id,role_id,menu_id'], ['sys_role', 'role_id'], ['sys_user_role', 'tenant_id,user_id,role_id']]) {
    const query = 'SELECT * FROM ' + table + ' ORDER BY ' + order;
    originals.push({ table, query, hash: digest(database(query)) });
  }
  await fs.writeFile(path.join(output, 'preservation-before.json'), JSON.stringify(originals, null, 2), { flag: 'wx' });
  baselineReady = true;
  check('configured_stage_transition_ready', database("SELECT COUNT(*) FROM crm_sales_stage WHERE tenant_id=100000 AND deleted=0 AND status='ACTIVE' AND stage_code IN ('LEAD','QUALIFIED') AND required_activity_flag=0 AND JSON_LENGTH(required_fields)=0") === '2');
  const mainCustomer = await customer('sales', 'main_customer');
  const otherCustomer = await customer('sales', 'other_customer');
  const emptyCustomer = await customer('sales', 'empty_customer');
  const foreignCustomer = await customer('foreign', 'foreign_customer');
  const customerId = mainCustomer.customerId;
  const ownerId = Number(sessions.sales.identity.userId);
  const opportunity = await source('admin', 'crm_opportunity', 'opportunity_id', '/crm/opportunity', 'opportunity_name', 'opportunity',
    name => ({ opportunityName: name, customerId, ownerId, expectedAmount: '10.00' }));
  check('opportunity_starts_at_lead', opportunity.stage === 'LEAD');
  await ok('sales', '/crm/opportunity/stage', 'PUT', { opportunityId: opportunity.opportunityId, stage: 'QUALIFIED', version: opportunity.version });
  const advanced = await ok('admin', '/crm/opportunity/' + opportunity.opportunityId);
  check('opportunity_real_stage_change', advanced.stage === 'QUALIFIED' && advanced.status === 'OPEN' && advanced.version > opportunity.version && Boolean(advanced.stageChangedTime));
  check('opportunity_history_preserved', database('SELECT COUNT(*) FROM crm_opportunity_stage_history WHERE opportunity_id=' + opportunity.opportunityId) === '2');
  sources.push({ table: 'crm_opportunity_stage_history', id: opportunity.opportunityId, query: 'SELECT * FROM crm_opportunity_stage_history WHERE opportunity_id=' + opportunity.opportunityId + ' ORDER BY history_id' });
  expected.push(timelineItem('OPPORTUNITY', advanced.opportunityId, advanced.opportunityName, advanced.stage, advanced.status, advanced.stageChangedTime, advanced.ownerName));
  const quote = await source('admin', 'crm_quote', 'quote_id', '/crm/quote', 'quote_name', 'quote',
    name => ({ quoteName: name, customerId, ownerId, currency: 'CNY', remark: marker + '_报价说明' }));
  check('quote_source_is_draft', quote.status === 'DRAFT');
  expected.push(timelineItem('QUOTE', quote.quoteId, quote.quoteName, quote.remark, quote.status, quote.createTime, quote.ownerName));
  const receivable = await source('admin', 'crm_receivable', 'receivable_id', '/crm/receivable', 'receivable_name', 'receivable',
    name => ({ receivableName: name, receivableNo: name, customerId, ownerId, plannedAmount: '10.00', dueDate: at(Date.now() + 86400000).slice(0, 10), remark: marker + '_回款说明' }));
  await ok('admin', '/crm/receivable/' + receivable.receivableId + '/writeoff', 'POST', { version: receivable.version, amount: '4.00', writeoffDate: at(Date.now()).slice(0, 10), remark: marker + '_本机样本到账' });
  const settled = await ok('admin', '/crm/receivable/' + receivable.receivableId);
  check('receivable_real_partial_receipt', settled.status === 'PARTIAL_RECEIVED' && Number(settled.receivedAmount) === 4 && settled.version > receivable.version);
  check('receivable_receipt_fact', database("SELECT COUNT(*) FROM crm_deal_event WHERE biz_type='RECEIVABLE' AND biz_id=" + receivable.receivableId + " AND event_type='RECEIPT' AND amount=4.00") === '1');
  sources.push({ table: 'crm_deal_event', id: receivable.receivableId, query: "SELECT * FROM crm_deal_event WHERE biz_type='RECEIVABLE' AND biz_id=" + receivable.receivableId + ' ORDER BY event_id' });
  sources.push({ table: 'crm_deal_allocation', id: receivable.receivableId, query: "SELECT * FROM crm_deal_allocation WHERE event_id IN (SELECT event_id FROM crm_deal_event WHERE biz_type='RECEIVABLE' AND biz_id=" + receivable.receivableId + ') ORDER BY allocation_id' });
  expected.push(timelineItem('RECEIVABLE', settled.receivableId, settled.receivableNo, settled.remark, settled.status, settled.receivedDate + ' 00:00:00', settled.ownerName));
  const ticket = await source('admin', 'crm_service_ticket', 'ticket_id', '/crm/ticket', 'ticket_title', 'ticket', name => ({ ticketTitle: name, customerId, ownerId, severity: 'P4' }));
  check('ticket_source_is_open', ticket.status === 'OPEN');
  expected.push(timelineItem('TICKET', ticket.ticketId, ticket.ticketTitle, ticket.solution, ticket.status, ticket.openedTime, ticket.ownerName));
  let year = new Date().getFullYear() + 15;
  let start, end;
  for (let attempt = 0; attempt < 10; attempt++, year++) {
    start = year + '-01-01 00:00:00'; end = year + '-02-01 00:00:00';
    if (database('SELECT COUNT(*) FROM crm_activity WHERE deleted=0 AND end_time>=' + sql(start) + ' AND start_time<' + sql(end)) === '0') break;
    if (attempt === 9) throw new Error('No unused owned calendar month');
  }
  const ownIds = [], teamIds = [];
  for (let day = 1; day <= 31; day++) {
    const activity = await createActivity('sales', customerId, 'month_' + String(day).padStart(2, '0'), year + '-01-' + String(day).padStart(2, '0') + ' 10:00:00', day === 1 ? { status: 'IN_PROGRESS' } : {});
    ownIds.push(activity.activityId); teamIds.push(activity.activityId);
    if (day % 10 === 0) console.log('E1_TIMELINE_PREP: monthly_activities=' + day);
  }
  const invited = await createActivity('admin', customerId, 'invited', year + '-01-15 14:00:00', {}, [{ participantType: 'USER', participantRefId: ownerId, acceptanceStatus: 'NONE' }]);
  ownIds.push(invited.activityId); teamIds.push(invited.activityId);
  const privateActivity = await createActivity('admin', customerId, 'private', year + '-01-16 14:00:00');
  teamIds.push(privateActivity.activityId);
  const otherActivity = await createActivity('sales', otherCustomer.customerId, 'other_customer_activity', year + '-01-17 16:00:00');
  ownIds.push(otherActivity.activityId); teamIds.push(otherActivity.activityId);
  await createActivity('sales', customerId, 'outside_month', year + '-02-01 10:00:00');
  await createActivity('foreign', foreignCustomer.customerId, 'foreign_activity', year + '-01-18 16:00:00');
  for (const [activityType, followUpType] of [['MEETING', 'VISIT'], ['CALL', 'PHONE']]) {
    const activity = await createActivity('sales', customerId, 'completed_' + activityType.toLowerCase(), at(Date.now() - 7200000), { activityType });
    const completed = await ok('sales', '/crm/activity/' + activity.activityId + '/complete', 'POST', { version: activity.version, resultSummary: marker + '_' + activityType + '_结果', generateFollowUp: true });
    activities.get(activity.activityId).activity = completed.activity;
    check('completion_generates_followup_' + activityType, completed.activity.status === 'COMPLETED' && Number.isSafeInteger(completed.activity.followUpId));
    const followUp = await ok('admin', '/crm/follow-up/' + completed.activity.followUpId);
    check('followup_business_source_' + activityType, followUp.followUpType === followUpType && followUp.customerId === customerId && followUp.content.includes(marker));
    sources.push({ table: 'crm_follow_up', id: followUp.followUpId, query: 'SELECT * FROM crm_follow_up WHERE follow_up_id=' + followUp.followUpId });
    expected.push(timelineItem('FOLLOW_UP', followUp.followUpId, followUp.followUpType, followUp.content, null, followUp.followUpTime, followUp.ownerName));
  }
  for (const { activity } of activities.values()) if (activity.customerId === customerId && activity.activityId !== privateActivity.activityId) {
    expected.push(timelineItem('ACTIVITY', activity.activityId, activity.subject, activity.resultSummary, activity.status, activity.completeTime || activity.startTime, activity.ownerName));
  }
  expected.sort(chronological);
  check('six_real_sources_and_three_ui_pages', new Set(expected.map(item => item.type)).size === 6 && expected.length === 41);
  const refreshedCustomers = [customerId, emptyCustomer.customerId];
  for (const id of refreshedCustomers) await ok('sales', '/crm/customer/' + id + '/workspace');
  const customerColumns = database("SELECT column_name FROM information_schema.columns WHERE table_schema='cloud_flow_db' AND table_name='crm_customer' AND column_name NOT IN ('update_by','update_time') ORDER BY ordinal_position").split(/\r?\n/);
  check('workspace_customer_preservation_columns', customerColumns.length > 30 && customerColumns.every(column => /^[a-z_]+$/.test(column)));
  for (const fixture of sources) {
    fixture.fullQuery = fixture.query;
    fixture.fullHash = digest(database(fixture.fullQuery));
    if (fixture.table === 'crm_customer' && refreshedCustomers.includes(fixture.id)) {
      fixture.query = 'SELECT ' + customerColumns.join(',') + ' FROM crm_customer WHERE customer_id=' + fixture.id;
      fixture.workspaceRefreshAuditFields = ['update_by', 'update_time'];
      fixture.auditTimeBefore = database("SELECT DATE_FORMAT(update_time,'%Y-%m-%d %H:%i:%s') FROM crm_customer WHERE customer_id=" + fixture.id);
    }
    fixture.hash = digest(database(fixture.query));
  }
  await fs.writeFile(path.join(output, 'source-fixtures.json'), JSON.stringify(sources, null, 2), { flag: 'wx' });
  await fs.writeFile(path.join(output, 'timeline-expected.json'), JSON.stringify(expected, null, 2), { flag: 'wx' });
  result.measurement = await verifyCalendarPerformance({ runtime, output, start, end, ownIds, teamIds });
  result.performance = result.measurement.passed;
  await timelinePage('sales', customerId, expected);
  for (const type of ['ACTIVITY', 'FOLLOW_UP', 'OPPORTUNITY', 'QUOTE', 'RECEIVABLE', 'TICKET']) await timelinePage('sales', customerId, expected, type);
  const adminExpected = [...expected, timelineItem('ACTIVITY', privateActivity.activityId, privateActivity.subject, privateActivity.resultSummary, privateActivity.status, privateActivity.startTime, privateActivity.ownerName)].sort(chronological);
  await timelinePage('admin', customerId, adminExpected);
  await timelinePage('sales', emptyCustomer.customerId, []);
  const denied = await api('foreign', '/crm/activity/customer/' + customerId + '/timeline');
  check('timeline_foreign_customer_denied', denied.status === 400 && denied.body?.code === 400 && !denied.body?.data);
  const unpermitted = await api('employee', '/crm/activity/customer/' + customerId + '/timeline');
  check('timeline_other_employee_private_customer_denied', unpermitted.status === 400 && unpermitted.body?.code === 400 && !unpermitted.body?.data);
  for (const fixture of sources) check('timeline_calendar_complete_source_preserved_' + fixture.table + '_' + fixture.id, digest(database(fixture.fullQuery)) === fixture.fullHash);
  result.timeline = true; result.pagination = true;
  result.ui = await verifyTimelineUi({ runtime, output, customerId, emptyCustomerId: emptyCustomer.customerId, expected, invitedId: invited.activityId, uiRequests, screenshots });
  check('browser_no_runtime_errors', runtime.browserErrors.length === 0);
  check('ui_no_server_failures', uiRequests.every(entry => entry.status < 500));
  check('calendar_all_31_requests_below_200_ms', result.performance);
} catch (error) {
  failure = error instanceof Error ? error.message : 'Timeline verification failed';
} finally {
  const finalFailures = [];
  const finalize = async task => { try { await task(); } catch (error) { const message = error instanceof Error ? error.message : 'Timeline cleanup failed'; finalFailures.push(message); failure ||= message; } };
  for (const [id, { actor }] of activities) await finalize(() => ok(actor, '/crm/activity/' + id, 'DELETE'));
  await finalize(() => check('owned_activities_removed', database('SELECT COUNT(*) FROM crm_activity WHERE deleted=0 AND subject LIKE ' + sql(marker + '%')) === '0'));
  for (const fixture of sources.filter(entry => entry.hash)) await finalize(() => check('source_preserved_' + fixture.table + '_' + fixture.id, digest(database(fixture.query)) === fixture.hash));
  for (const fixture of sources.filter(entry => entry.workspaceRefreshAuditFields)) await finalize(() => check('workspace_customer_refresh_audit_' + fixture.id,
    database('SELECT COUNT(*) FROM crm_customer WHERE customer_id=' + fixture.id + ' AND update_by=(SELECT user_name FROM sys_user WHERE user_id=' + Number(sessions.sales.identity.userId) + ' AND tenant_id=100000) AND update_time>=' + sql(fixture.auditTimeBefore) + ' AND update_time<=NOW()') === '1'));
  for (const original of originals) await finalize(() => check('original_rows_preserved_' + original.table, digest(database(original.query)) === original.hash));
  result.preservation = baselineReady && finalFailures.length === 0;
  await finalize(async () => { result.secretScan = await runtime.scan(); result.secrets = true; });
  result.finalFailures = finalFailures;
  result.sourceFixtures = sources.map(({ table, id }) => ({ table, id }));
  await runtime.close();
  result.passed = !failure; result.failure = failure; result.checks = runtime.checks; result.requests = runtime.requests;
  result.uiRequests = uiRequests; result.screenshots = screenshots; result.verifiedAt = new Date().toISOString();
  await fs.writeFile(path.join(output, 'result.json'), JSON.stringify(result, null, 2), { flag: 'wx' });
  console.log('E1_TIMELINE: passed=' + result.passed + '; checks=' + runtime.checks.length + '; requests=' + runtime.requests.length + '; ui_requests=' + uiRequests.length + '; timeline=' + result.timeline + '; pagination=' + result.pagination + '; performance=' + result.performance + '; ui=' + result.ui + '; all_acceptance_complete=false');
}
if (failure) throw new Error(failure);
