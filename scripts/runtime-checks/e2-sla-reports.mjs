import assert from 'node:assert/strict';

export async function verifyE2SlaReports(context) {
  const { check, evidence, prove, customer, policy, ticket, ticketFact, ok, api, user, minuteNow, addMinutes, instant, timestamp, sleep, fixture } = context;
  const client = await customer('REPORT_CLIENT', { ownerId: user('sales') });
  const terms = await policy('REPORT_POLICY', { entityType: 'CUSTOMER', entityId: client.id }, [[10, 20], [10, 20], [10, 20], [10, 20]]);
  const currentDay = minuteNow().slice(0, 10);
  const midnight = instant(currentDay + ' 00:00:00');
  const yesterday = timestamp(midnight - 86400000 + 15 * 3600000);
  const tomorrow = timestamp(midnight + 86400000 + 9 * 3600000);
  if (Date.now() % 60000 > 45000) await sleep(61000 - Date.now() % 60000);
  const zero = await ticket('REPORT_ZERO', client, { severity: 'P1', ownerId: user('sales'), openedTime: minuteNow() });
  await ok('sales', `/crm/ticket/${zero.ticketId}/resolve`, 'POST', { solution: '当分钟完成，保留零分钟' });
  const partial = await ticket('REPORT_RESPONSE', client, { severity: 'P2', ownerId: user('admin'), openedTime: addMinutes(minuteNow(), -3) });
  await ok('admin', `/crm/ticket/${partial.ticketId}/respond`, 'POST');
  const late = await ticket('REPORT_LATE', client, { severity: 'P2', ownerId: user('sales'), openedTime: addMinutes(minuteNow(), -60) });
  await ok('sales', `/crm/ticket/${late.ticketId}/resolve`, 'POST', { solution: '独立超时统计样本' });
  const previousDay = await ticket('REPORT_YESTERDAY', client, { severity: 'P3', ownerId: user('sales'), openedTime: yesterday });
  await ok('sales', `/crm/ticket/${previousDay.ticketId}/resolve`, 'POST', { solution: '跨日统计样本' });
  const future = await ticket('REPORT_PENDING', client, { severity: 'P1', ownerId: user('sales'), openedTime: tomorrow });
  const samples = [zero, partial, late, previousDay, future].map(value => ticketFact(value.ticketId));
  const report = (actor, fields = {}) => ok(actor, '/crm/sla/report?' + new URLSearchParams({ groupBy: 'POLICY', policyId: terms.id, ...fields }));
  const expected = values => {
    const responded = values.filter(value => value.firstResponseMinutes != null);
    const resolved = values.filter(value => value.resolutionDue != null && value.resolutionMinutes != null);
    const responseMet = responded.filter(value => value.responseBreachedFlag === 0).length;
    const resolutionMet = resolved.filter(value => value.resolutionBreachedFlag === 0).length;
    const divide = (amount, count) => count === 0 ? null : Math.round(amount / count * 10000) / 10000;
    return { total: values.length, responded: responded.length, resolved: resolved.length, responseMet, resolutionMet,
      responseRate: divide(responseMet, responded.length), resolutionRate: divide(resolutionMet, resolved.length),
      averageResponseMinutes: divide(responded.reduce((total, value) => total + value.firstResponseMinutes, 0), responded.length),
      averageResolutionMinutes: divide(resolved.reduce((total, value) => total + value.resolutionMinutes, 0), resolved.length) };
  };
  const matches = (actual, values) => Object.entries(expected(values)).every(([field, value]) => value == null ? actual[field] == null : Number(actual[field]) === value);
  await prove(12, async () => {
    check('zero_and_unresponded_statistics_fixtures_are_distinct', samples[0].firstResponseMinutes === 0 && samples[0].resolutionMinutes === 0 && samples[4].firstResponseMinutes == null && samples[4].resolutionMinutes == null);
    for (const dimension of ['POLICY', 'PRIORITY', 'OWNER']) {
      const actual = await report('admin', { groupBy: dimension });
      const key = value => dimension === 'POLICY' ? value.slaPolicyId : dimension === 'PRIORITY' ? value.severity : value.ownerId;
      const keys = [...new Set(samples.map(key))];
      check(`${dimension}_report_totals_and_averages_match_actual_tickets`, matches(actual.total, samples) && actual.total.responded === 4 && actual.total.resolved === 3);
      check(`${dimension}_report_group_keys_and_numbers_match`, actual.groups.length === keys.length && actual.groups.every(group => matches(group, samples.filter(value => key(value) === (dimension === 'OWNER' ? group.key.split(' / ')[0] : group.key)))));
      check(`${dimension}_trend_retains_each_day_and_ignores_missing_durations_in_averages`, actual.trend.length === 3 && actual.trend.every(group => matches(group, samples.filter(value => value.openedTime.slice(0, 10) === group.key))));
      check(`${dimension}_breached_list_contains_only_breached_samples`, actual.breachedTickets.map(value => String(value.ticketId)).sort().join(',') === samples.filter(value => value.responseBreachedFlag || value.resolutionBreachedFlag).map(value => value.ticketId).sort().join(','));
    }
    const current = await report('admin', { start: currentDay, end: currentDay });
    check('inclusive_date_filters_keep_only_today', matches(current.total, samples.filter(value => value.openedTime.startsWith(currentDay))));
    const severity = await report('admin', { severity: 'P1' });
    check('priority_filter_preserves_zero_and_null_day', severity.total.total === 2 && severity.trend.length === 2 && Number(severity.trend[0].averageResponseMinutes) === 0 && severity.trend[1].averageResponseMinutes == null && severity.trend[1].averageResolutionMinutes == null);
    const owner = await report('admin', { ownerId: user('admin') });
    check('owner_filter_keeps_only_assigned_tickets', matches(owner.total, samples.filter(value => value.ownerId === user('admin'))) && owner.total.total === 1);
    const combined = await report('admin', { start: currentDay, end: currentDay, severity: 'P1', ownerId: user('sales') });
    check('combined_filters_apply_together', matches(combined.total, [samples[0]]) && combined.total.total === 1);
    const inverted = await api('admin', `/crm/sla/report?groupBy=POLICY&start=2027-02-02&end=2027-02-01`);
    const invalidGroup = await api('admin', '/crm/sla/report?groupBy=INVALID');
    check('invalid_report_date_and_dimension_are_refused', inverted.body?.code !== 200 && invalidGroup.body?.code !== 200 && !inverted.body?.data && !invalidGroup.body?.data);
    evidence.reports = true;
  });
  await prove(12, async () => {
    const outside = await customer('OUTSIDE_REPORT', { ownerId: user('other') });
    const outsidePolicy = await policy('OUTSIDE_POLICY', { entityType: 'CUSTOMER', entityId: outside.id });
    const outsideTicket = await ticket('OUTSIDE_REPORT', outside, { ownerId: user('sales'), openedTime: '2027-01-08 17:00:00' });
    const foreign = await customer('FOREIGN_REPORT', {}, 'foreign');
    const foreignPolicy = await policy('FOREIGN_POLICY', { defaultFlag: 1 }, undefined, 'foreign');
    const foreignTicket = await ticket('FOREIGN_REPORT', foreign, { openedTime: '2027-01-08 17:00:00' }, 'foreign');
    for (const actor of ['sales', 'manager', 'readonly']) check(`${actor}_can_read_authorized_statistics`, (await report(actor)).total.total === samples.length);
    for (const actor of ['sales', 'manager', 'foreign']) check(`${actor}_cannot_expand_report_to_outside_customer_department`, (await report(actor, { policyId: outsidePolicy.id })).total.total === 0);
    check('readonly_report_permission_can_view_all_own_tenant_scopes', (await report('readonly', { policyId: outsidePolicy.id })).total.total === 1);
    check('foreign_report_stays_inside_its_tenant', (await report('foreign', { policyId: foreignPolicy.id })).total.total === 1 && (await report('admin', { policyId: foreignPolicy.id })).total.total === 0 && (await report('foreign')).total.total === 0);
    const denied = await api('employee', '/crm/sla/report?groupBy=POLICY');
    const noEdit = await api('readonly', '/crm/sla/policy', { method: 'POST', body: terms.request });
    const foreignRead = await api('foreign', `/crm/sla/policy/${terms.id}`);
    check('missing_report_and_edit_permissions_are_refused', (denied.status === 403 || denied.body?.code === 403) && (noEdit.status === 403 || noEdit.body?.code === 403));
    check('foreign_policy_detail_does_not_leak', foreignRead.body?.code !== 200 && !foreignRead.body?.data);
    const anonymous = await fetch(context.origin + '/api/crm/sla/report?groupBy=POLICY', { signal: AbortSignal.timeout(15000) });
    const anonymousBody = await anonymous.json();
    context.requests.push({ actor: 'anonymous', path: '/crm/sla/report', method: 'GET', status: anonymous.status, code: anonymousBody.code });
    check('anonymous_report_is_refused', anonymous.status === 401 || anonymousBody.code === 401);
    check('report_permission_checks_keep_all_statistics_samples', samples.every(sample => JSON.stringify(ticketFact(sample.ticketId)) === JSON.stringify(sample)));
    fixture.reportScope = { outsideTicket: outsideTicket.ticketId, foreignTicket: foreignTicket.ticketId, outsidePolicy: outsidePolicy.id, foreignPolicy: foreignPolicy.id };
    evidence.permissions = true;
  });
  fixture.report = { policyId: terms.id, samples, expected: expected(samples), currentDay, tomorrow: tomorrow.slice(0, 10) };
  assert.ok(evidence.reports && evidence.permissions);
  return { policy: terms, samples, currentDay, tomorrow: tomorrow.slice(0, 10) };
}
