import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

export function prepareE2SlaChecks(runtime) {
  const { check, checks, database, rows, sql, ok, sessions } = runtime;
  const marker = `E2S_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
  const fixture = { marker, customers: [], policies: [], calendars: [], tickets: [], jobs: [], restarts: [], measurements: [], images: [] };
  const evidence = {}, acceptance = Object.fromEntries(Array.from({ length: 14 }, (_, index) => [index + 1, []]));
  const identifier = value => { const text = String(value); assert.match(text, /^[1-9][0-9]*$/); return text; };
  const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
  const waitFor = async (read, accepts, label, timeout = 60000) => {
    const until = Date.now() + timeout;
    do { const value = await read(); if (accepts(value)) return value; await sleep(250); } while (Date.now() < until);
    throw new Error(label);
  };
  const timestamp = milliseconds => new Date(milliseconds + 8 * 3600000).toISOString().slice(0, 19).replace('T', ' ');
  const instant = value => new Date(String(value).replace(' ', 'T') + '+08:00').getTime();
  const minuteNow = () => timestamp(Math.floor(Date.now() / 60000) * 60000);
  const addMinutes = (value, minutes) => timestamp(instant(value) + minutes * 60000);
  const elapsed = (start, end) => Math.max(0, Math.round((instant(end) - instant(start)) / 60000));
  const mark = (number, labels) => {
    assert.ok(acceptance[number] && labels.length > 0 && labels.every(label => checks.includes(label)));
    acceptance[number].push(...labels);
  };
  const prove = async (numbers, work) => {
    const first = checks.length;
    const result = await work();
    for (const number of Array.isArray(numbers) ? numbers : [numbers]) mark(number, checks.slice(first));
    return result;
  };
  const user = actor => identifier(sessions[actor].identity.userId);
  const tenant = actor => identifier(sessions[actor].identity.tenantId);
  const customer = async (suffix, fields = {}, actor = 'admin') => {
    const customerCode = `${marker}_${suffix}`;
    await ok(actor, '/crm/customer', 'POST', { customerCode, customerName: customerCode, ownerId: user(actor), status: 'ACTIVE', ...fields });
    const matches = rows(`SELECT JSON_OBJECT('id',CAST(customer_id AS CHAR),'owner',CAST(owner_id AS CHAR),'dept',CAST(dept_id AS CHAR),'level',level_code,'industry',industry) FROM crm_customer WHERE tenant_id=${tenant(actor)} AND customer_code=${sql(customerCode)} AND deleted=0;`);
    check(`customer_${suffix}_actually_saved`, matches.length === 1);
    const result = { ...matches[0], actor, tenant: tenant(actor), code: customerCode };
    result.id = identifier(result.id); fixture.customers.push(result); return result;
  };
  const calendar = async (suffix, fields = {}, dates = []) => {
    const calendarCode = `${marker}_${suffix}`;
    await ok('admin', '/auth/system/holiday/calendar', 'POST', { calendarCode, calendarName: calendarCode, region: '独立验收', defaultFlag: 0, weeklyRestDays: '6,7',
      workStartTime: '09:00:00', workEndTime: '18:00:00', lunchStartTime: '12:00:00', lunchEndTime: '13:00:00', status: 'ENABLED', ...fields });
    const id = identifier(database(`SELECT calendar_id FROM sys_holiday_calendar WHERE tenant_id=100000 AND calendar_code=${sql(calendarCode)} AND deleted=0;`));
    if (dates.length) await ok('admin', '/auth/system/holiday/date/batch', 'POST', { calendarId: id, yearNo: 2027, dates });
    const result = { id, code: calendarCode }; fixture.calendars.push(result); return result;
  };
  const defaults = [[60, 240], [240, 480], [480, 1440], [1440, 4320]];
  const priorities = (minutes = defaults) => minutes.map(([firstResponseMinutes, resolutionMinutes], index) => ({ priorityCode: `P${index + 1}`, priorityName: `独立档位${index + 1}`, firstResponseMinutes, resolutionMinutes, sortNo: index + 1 }));
  const policy = async (suffix, fields = {}, minutePairs = defaults, actor = 'admin', rules) => {
    const policyCode = `${marker}_${suffix}`;
    const body = { policy: { policyCode, policyName: policyCode, entityType: 'GLOBAL', applyForResolution: 1, roundTheClockFlag: 1, defaultFlag: 0, priority: 100, status: 'ENABLED', ...fields },
      priorities: priorities(minutePairs), rules: rules || [{ ruleType: 'PAUSE', ticketStatus: 'WAITING_CUSTOMER' }, { ruleType: 'FULFILL', ticketStatus: 'RESOLVED' }, { ruleType: 'FULFILL', ticketStatus: 'CLOSED' }] };
    const id = identifier(await ok(actor, '/crm/sla/policy', 'POST', body));
    const actual = await ok(actor, `/crm/sla/policy/${id}`);
    check(`policy_${suffix}_four_tiers_saved`, actual.priorities.length === 4 && actual.priorities.every((value, index) => value.priorityCode === `P${index + 1}`));
    const result = { id, code: policyCode, actor, request: body }; fixture.policies.push(result); return result;
  };
  const preview = (client, severity = 'P2', openedTime = '2027-01-08 17:00:00', actor = 'admin') => ok(actor, '/crm/sla/preview', 'POST', { customerId: client.id, severity, openedTime });
  const ticketFact = ticketId => {
    const id = identifier(ticketId);
    const matches = rows(`SELECT JSON_OBJECT('ticketId',CAST(ticket_id AS CHAR),'tenantId',CAST(tenant_id AS CHAR),'customerId',CAST(customer_id AS CHAR),'ownerId',CAST(owner_id AS CHAR),
      'ticketTitle',ticket_title,'severity',severity,'status',status,'slaPolicyId',CAST(sla_policy_id AS CHAR),'slaStatus',sla_status,'openedTime',DATE_FORMAT(opened_time,'%Y-%m-%d %H:%i:%s'),
      'firstResponseDue',DATE_FORMAT(first_response_due,'%Y-%m-%d %H:%i:%s'),'resolutionDue',DATE_FORMAT(resolution_due,'%Y-%m-%d %H:%i:%s'),'dueTime',DATE_FORMAT(due_time,'%Y-%m-%d %H:%i:%s'),
      'firstResponseTime',DATE_FORMAT(first_response_time,'%Y-%m-%d %H:%i:%s'),'firstResponseMinutes',first_response_minutes,'resolutionMinutes',resolution_minutes,
      'slaPausedMinutes',sla_paused_minutes,'pauseStartTime',DATE_FORMAT(pause_start_time,'%Y-%m-%d %H:%i:%s'),'resolvedTime',DATE_FORMAT(resolved_time,'%Y-%m-%d %H:%i:%s'),
      'responseBreachedFlag',response_breached_flag,'resolutionBreachedFlag',resolution_breached_flag,'version',version) FROM crm_service_ticket WHERE ticket_id=${id} AND deleted=0;`);
    assert.equal(matches.length, 1, 'One owned ticket expected'); return matches[0];
  };
  const ticket = async (suffix, client, fields = {}, actor = 'admin') => {
    const ticketTitle = `${marker}_${suffix}`;
    await ok(actor, '/crm/ticket', 'POST', { customerId: client.id, ticketTitle, severity: 'P2', issueType: 'OTHER', ...fields });
    const id = identifier(database(`SELECT ticket_id FROM crm_service_ticket WHERE tenant_id=${tenant(actor)} AND ticket_title=${sql(ticketTitle)} AND deleted=0;`));
    runtime.ownedTickets.add(id);
    fixture.tickets.push({ id, actor, name: ticketTitle, customerId: client.id });
    const actual = await ok(actor, `/crm/ticket/${id}`);
    const saved = ticketFact(id);
    check(`ticket_${suffix}_actual_details_match_database`, String(actual.ticketId) === id && (actual.firstResponseDue ?? null) === saved.firstResponseDue && (actual.resolutionDue ?? null) === saved.resolutionDue && actual.slaStatus === saved.slaStatus);
    return saved;
  };
  const updateTicket = async (sample, fields, actor = 'admin') => {
    const current = await ok(actor, `/crm/ticket/${sample.ticketId}`);
    await ok(actor, '/crm/ticket', 'PUT', { ...current, ...fields });
    return ticketFact(sample.ticketId);
  };
  const restart = async name => {
    assert.ok(['pause', 'repeat'].includes(name));
    await fs.writeFile(path.join(runtime.output, `restart-request-${name}.json`), JSON.stringify({ action: 'restart-crm', name }), { flag: 'wx' });
    const receipt = await waitFor(async () => {
      try { return JSON.parse(await fs.readFile(path.join(runtime.output, `restart-receipt-${name}.json`), 'utf8')); }
      catch (error) { if (error.code === 'ENOENT' || error instanceof SyntaxError) return null; throw error; }
    }, value => value?.Healthy, `Independent ${name} restart did not finish`, 240000);
    check(`real_crm_restart_${name}`, receipt.PreviousPid !== receipt.CurrentPid && receipt.InputsUnchanged && !receipt.OriginalEnvironmentTouched);
    fixture.restarts.push(receipt); return receipt;
  };
  const initialTables = [['crm_customer', 'customer_id'], ['crm_service_ticket', 'ticket_id']].map(([table, key]) => {
    const ids = database(`SELECT ${key} FROM ${table} ORDER BY ${key};`).split(/\r?\n/).filter(Boolean).map(identifier);
    const statement = `SELECT * FROM ${table} WHERE ${ids.length ? `${key} IN (${ids.join(',')})` : '1=0'} ORDER BY ${key};`;
    const digest = () => createHash('sha256').update(database(statement)).digest('hex');
    return { table, ids, before: digest(), digest };
  });
  const preserve = () => {
    for (const initial of initialTables) check(`prior_independent_${initial.table}_kept`, initial.before === initial.digest());
    check('only_internal_message_channels_used', database("SELECT COUNT(*) FROM sys_message_record WHERE channel_type<>'INTERNAL';") === '0');
    evidence.preservation = true;
  };
  return { ...runtime, marker, fixture, evidence, acceptance, identifier, sleep, waitFor, timestamp, instant, minuteNow, addMinutes, elapsed, prove, mark, user, tenant, customer, calendar, priorities, policy, preview, ticket, ticketFact, updateTicket, restart, preserve };
}
