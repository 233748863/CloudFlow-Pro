import assert from 'node:assert/strict';

export async function verifyE2SlaPolicies(context) {
  const { check, evidence, prove, customer, calendar, policy, preview, ticket, ticketFact, ok, api, database, rows, sql, priorities, user, waitFor, fixture } = context;
  const primary = await customer('MATCH', { ownerId: user('sales'), levelCode: 'A', industry: 'IT' });
  const generic = await customer('GENERIC', { ownerId: user('sales'), levelCode: 'C', industry: 'OTHER' });
  await prove(2, async () => {
    check('fixture_has_no_enabled_seed_policy', database("SELECT COUNT(*) FROM crm_sla_policy WHERE status='ENABLED' AND deleted=0;") === '0');
    const sample = await ticket('NO_POLICY', primary, { ownerId: user('sales') });
    check('unmatched_ticket_not_applicable_and_all_due_fields_empty', sample.slaStatus === 'NOT_APPLICABLE' && sample.slaPolicyId == null && sample.firstResponseDue == null && sample.resolutionDue == null && sample.dueTime == null);
    evidence.noPolicy = true;
  });
  await prove(1, async () => {
    const catalog = await ok('admin', '/crm/sla/priorities');
    const foreignCatalog = await ok('foreign', '/crm/sla/priorities');
    check('dictionary_and_builtin_four_priorities_are_p1_to_p4', catalog.length === 4 && foreignCatalog.length === 4 && catalog.every((entry, index) => entry.priorityCode === `P${index + 1}` && foreignCatalog[index].priorityCode === entry.priorityCode));
    const global = await policy('GLOBAL', { defaultFlag: 1 });
    check('global_default_matches', String((await preview(primary)).slaPolicyId) === global.id);
    const industry = await policy('INDUSTRY', { entityType: 'INDUSTRY', entityId: 'IT' });
    check('industry_beats_global', String((await preview(primary)).slaPolicyId) === industry.id);
    const level = await policy('LEVEL', { entityType: 'CUSTOMER_LEVEL', entityId: 'A' });
    check('customer_level_beats_industry', String((await preview(primary)).slaPolicyId) === level.id);
    const specific = await policy('CUSTOMER', { entityType: 'CUSTOMER', entityId: primary.id, priority: 10 });
    check('specific_customer_beats_level', String((await preview(primary)).slaPolicyId) === specific.id);
    const pinned = await ticket('PINNED_POLICY', primary, { openedTime: '2027-01-08 17:00:00', ownerId: user('sales') });
    const equal = await policy('EQUAL_RANK', { entityType: 'CUSTOMER', entityId: primary.id, priority: 10 });
    check('same_rank_and_sort_choose_lower_policy_id', Number(specific.id) < Number(equal.id) && String((await preview(primary)).slaPolicyId) === specific.id);
    const preferred = await policy('LOWER_SORT', { entityType: 'CUSTOMER', entityId: primary.id, priority: 5 });
    check('same_rank_lower_sort_wins', String((await preview(primary)).slaPolicyId) === preferred.id);
    await ok('admin', `/crm/sla/policy/${preferred.id}/disable`, 'POST');
    check('disabled_policy_not_matched', String((await preview(primary)).slaPolicyId) === specific.id);
    await policy('FUTURE', { entityType: 'CUSTOMER', entityId: primary.id, priority: 1, effectiveStart: '2028-01-01' });
    await policy('EXPIRED', { entityType: 'CUSTOMER', entityId: primary.id, priority: 1, effectiveEnd: '2026-12-31' });
    check('future_and_expired_policies_do_not_match', String((await preview(primary)).slaPolicyId) === specific.id);
    const editable = await policy('EDITABLE');
    const editableDetail = await ok('admin', `/crm/sla/policy/${editable.id}`);
    editableDetail.policy.policyName += '-修改'; editableDetail.priorities[0].firstResponseMinutes = 77;
    await ok('admin', '/crm/sla/policy', 'POST', editableDetail);
    const edited = await ok('admin', `/crm/sla/policy/${editable.id}`);
    check('unreferenced_policy_edit_reopens_all_tiers_without_duplicates', edited.policy.policyName === editableDetail.policy.policyName && edited.priorities.length === 4 && edited.priorities.find(entry => entry.priorityCode === 'P1').firstResponseMinutes === 77);
    const originalPinnedPolicy = await ok('admin', `/crm/sla/policy/${specific.id}`);
    const forbidden = await api('admin', '/crm/sla/policy', { method: 'POST', body: { ...originalPinnedPolicy, policy: { ...originalPinnedPolicy.policy, policyName: '已引用策略不应修改' } } });
    check('referenced_policy_edit_refused_and_original_kept', forbidden.body?.code !== 200 && JSON.stringify(await ok('admin', `/crm/sla/policy/${specific.id}`)) === JSON.stringify(originalPinnedPolicy));
    for (const [suffix, changes, expectedText] of [
      ['NEGATIVE', { priorities: [{ ...priorities()[0], firstResponseMinutes: 0 }] }, '正整数'],
      ['NO_FULFILL', { rules: [{ ruleType: 'PAUSE', ticketStatus: 'WAITING_CUSTOMER' }] }, '履约状态'],
      ['DUPLICATE', { priorities: [priorities()[0], priorities()[0]] }, '重复'],
    ]) {
      const before = database('SELECT COUNT(*) FROM crm_sla_policy;');
      const body = { ...editable.request, policy: { ...editable.request.policy, policyCode: `${context.marker}_${suffix}` }, ...changes };
      const response = await api('admin', '/crm/sla/policy', { method: 'POST', body });
      check(`invalid_${suffix}_rejected_and_transaction_rolled_back`, response.body?.code !== 200 && String(response.body?.msg || response.body?.message).includes(expectedText) && database('SELECT COUNT(*) FROM crm_sla_policy;') === before);
    }
    await ok('admin', `/crm/sla/policy/${specific.id}/disable`, 'POST');
    check('disabling_referenced_policy_keeps_existing_ticket_promises', String((await preview(primary)).slaPolicyId) === equal.id && JSON.stringify(ticketFact(pinned.ticketId)) === JSON.stringify(pinned));
    check('unrelated_customer_uses_global_default', String((await preview(generic)).slaPolicyId) === global.id);
    fixture.matching = { global: global.id, industry: industry.id, level: level.id, customer: specific.id, equalRank: equal.id, preferred: preferred.id, pinnedTicket: pinned.ticketId };
    evidence.policies = true;
  });
  const working = await calendar('WORK');
  const workingClient = await customer('WORK_CLIENT', { ownerId: user('sales') });
  const workingPolicy = await policy('WORK_POLICY', { entityType: 'CUSTOMER', entityId: workingClient.id, roundTheClockFlag: 0, holidayCalendarId: working.id });
  const deadlines = (label, observed, first, resolution) => check(label, observed.firstResponseDue === first && observed.resolutionDue === resolution && observed.dueTime === resolution);
  await prove(3, async () => {
    deadlines('friday_1700_four_hours_ends_monday_noon', await preview(workingClient), '2027-01-11 12:00:00', '2027-01-11 17:00:00');
    deadlines('lunch_is_excluded_from_four_and_eight_hour_budgets', await preview(workingClient, 'P2', '2027-01-12 11:30:00'), '2027-01-12 16:30:00', '2027-01-13 11:30:00');
    deadlines('night_creation_skips_nonwork_and_weekend', await preview(workingClient, 'P2', '2027-01-08 23:30:00'), '2027-01-11 14:00:00', '2027-01-11 18:00:00');
    const saved = await ticket('WORK_DEADLINE', workingClient, { openedTime: '2027-01-08 17:00:00', ownerId: user('sales') });
    deadlines('work_deadlines_are_persisted_by_actual_ticket_create', saved, '2027-01-11 12:00:00', '2027-01-11 17:00:00');
    deadlines('round_the_clock_policy_counts_night_and_weekend', await preview(generic, 'P2', '2027-01-08 23:00:00'), '2027-01-09 03:00:00', '2027-01-09 07:00:00');
    const makeup = await calendar('MAKEUP', {}, [{ holidayDate: '2027-01-09', dateType: 'WORKDAY', holidayName: '独立调休工作日', triplePayFlag: 0 }]);
    const makeupClient = await customer('MAKEUP_CLIENT');
    await policy('MAKEUP_POLICY', { entityType: 'CUSTOMER', entityId: makeupClient.id, roundTheClockFlag: 0, holidayCalendarId: makeup.id });
    deadlines('makeup_saturday_is_counted', await preview(makeupClient), '2027-01-09 12:00:00', '2027-01-09 17:00:00');
  });
  await prove(4, async () => {
    const holiday = await calendar('HOLIDAY', {}, [{ holidayDate: '2027-01-11', dateType: 'HOLIDAY', holidayName: '独立法定假日样本', triplePayFlag: 1 }]);
    const holidayClient = await customer('HOLIDAY_CLIENT', { ownerId: user('sales') });
    await policy('HOLIDAY_POLICY', { entityType: 'CUSTOMER', entityId: holidayClient.id, roundTheClockFlag: 0, holidayCalendarId: holiday.id });
    deadlines('holiday_monday_is_skipped_after_weekend', await preview(holidayClient), '2027-01-12 12:00:00', '2027-01-12 17:00:00');
    const saved = await ticket('HOLIDAY_DEADLINE', holidayClient, { openedTime: '2027-01-08 17:00:00', ownerId: user('sales') });
    deadlines('holiday_deadlines_are_actually_persisted', saved, '2027-01-12 12:00:00', '2027-01-12 17:00:00');
    evidence.calendar = true;
  });
  await prove(13, async () => {
    const failedCalendar = await calendar('UNAVAILABLE');
    const failedClient = await customer('FALLBACK_CLIENT', { ownerId: user('sales') });
    await policy('FALLBACK_POLICY', { entityType: 'CUSTOMER', entityId: failedClient.id, roundTheClockFlag: 0, holidayCalendarId: failedCalendar.id });
    const original = await ok('admin', `/auth/system/holiday/calendar/${failedCalendar.id}`);
    await ok('admin', '/auth/system/holiday/calendar', 'PUT', { ...original, status: 'DISABLED' });
    const saved = await ticket('CALENDAR_FALLBACK', failedClient, { openedTime: '2027-01-08 17:00:00', ownerId: user('sales') });
    deadlines('unavailable_calendar_allows_create_with_natural_time_deadlines', saved, '2027-01-08 21:00:00', '2027-01-09 01:00:00');
    const notices = await waitFor(() => rows(`SELECT JSON_OBJECT('receiver',CAST(receiver_id AS CHAR),'channel',channel_type,'status',send_status) FROM sys_message_record WHERE biz_type='CRM_TICKET_SLA' AND biz_id LIKE '%:CALENDAR_FALLBACK' AND title LIKE ${sql('%' + saved.ticketTitle)} ORDER BY receiver_id;`), values => values.length === 2 && values.every(value => value.status === 'SUCCESS'), 'Calendar fallback notices did not reach owner and leader');
    check('calendar_fallback_alert_delivered_once_to_owner_and_leader', notices.every(value => value.channel === 'INTERNAL') && notices.map(value => value.receiver).sort().join(',') === [user('sales'), user('manager')].sort().join(','));
    check('calendar_fallback_audit_recorded', Number(database("SELECT COUNT(*) FROM sys_audit_log WHERE audit_name='SLA_CALENDAR_FALLBACK';")) > 0);
    const disabled = await ok('admin', `/auth/system/holiday/calendar/${failedCalendar.id}`);
    await ok('admin', '/auth/system/holiday/calendar', 'PUT', { ...disabled, status: 'ENABLED' });
    evidence.fallback = true;
  });
  assert.ok(evidence.policies && evidence.calendar && evidence.fallback);
  return { primary, generic, working, workingClient, workingPolicy };
}
