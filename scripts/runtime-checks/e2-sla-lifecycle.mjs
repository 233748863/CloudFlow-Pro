import assert from 'node:assert/strict';

export async function startE2SlaLifecycle(context) {
  const { check, prove, customer, policy, ticket, ticketFact, updateTicket, ok, user, minuteNow, addMinutes, elapsed, restart, evidence, fixture } = context;
  const client = await customer('LIFECYCLE', { ownerId: user('sales') });
  const terms = await policy('LIFECYCLE_POLICY', { entityType: 'CUSTOMER', entityId: client.id }, [[5, 10], [10, 20], [20, 40], [30, 60]]);
  let responded;
  await prove(5, async () => {
    const fresh = await ticket('FIRST_RESPONSE', client, { openedTime: addMinutes(minuteNow(), -2), ownerId: user('sales') });
    const before = minuteNow();
    await ok('sales', `/crm/ticket/${fresh.ticketId}/respond`, 'POST');
    responded = ticketFact(fresh.ticketId);
    check('first_response_records_actual_minute_and_consumed_minutes', [before, minuteNow()].includes(responded.firstResponseTime) && responded.firstResponseMinutes === elapsed(fresh.openedTime, responded.firstResponseTime));
    await ok('sales', `/crm/ticket/${fresh.ticketId}/respond`, 'POST');
    check('repeat_response_preserves_first_response_and_entire_ticket', JSON.stringify(ticketFact(fresh.ticketId)) === JSON.stringify(responded));
    const statusSample = await ticket('STATUS_RESPONSE', client, { openedTime: addMinutes(minuteNow(), -3), ownerId: user('sales') });
    const updated = await updateTicket(statusSample, { status: 'IN_PROGRESS' }, 'sales');
    check('actual_status_change_records_first_response', updated.firstResponseTime != null && updated.firstResponseMinutes === elapsed(statusSample.openedTime, updated.firstResponseTime));
    evidence.response = true;
  });
  await prove(9, async () => {
    const sample = await ticket('PRIORITY_BEFORE_RESPONSE', client, { severity: 'P3', openedTime: addMinutes(minuteNow(), -4), ownerId: user('sales') });
    const changed = await updateTicket(sample, { severity: 'P1' }, 'sales');
    check('priority_change_keeps_original_start_and_already_consumed_time', changed.openedTime === sample.openedTime && changed.firstResponseTime == null && changed.firstResponseDue === addMinutes(sample.openedTime, 5) && changed.resolutionDue === addMinutes(sample.openedTime, 10));
    const later = await updateTicket(responded, { severity: 'P1' }, 'sales');
    check('priority_after_response_preserves_response_and_recomputes_remaining_resolution', later.firstResponseTime === responded.firstResponseTime && later.firstResponseMinutes === responded.firstResponseMinutes && later.firstResponseDue === responded.firstResponseDue && later.resolutionDue === addMinutes(responded.openedTime, 10));
  });
  let paused;
  await prove([6, 7, 9], async () => {
    const sample = await ticket('PERSISTED_PAUSE', client, { severity: 'P3', openedTime: addMinutes(minuteNow(), -1), ownerId: user('sales') });
    const first = await updateTicket(sample, { status: 'WAITING_CUSTOMER' }, 'sales');
    check('waiting_customer_sets_persisted_pause', first.slaStatus === 'PAUSED' && first.pauseStartTime != null && first.slaPausedMinutes === 0);
    const repeated = await updateTicket(first, { status: 'WAITING_CUSTOMER' }, 'sales');
    check('repeat_pause_keeps_original_pause_start', repeated.pauseStartTime === first.pauseStartTime && repeated.slaPausedMinutes === 0 && repeated.firstResponseTime === first.firstResponseTime);
    paused = await updateTicket(repeated, { severity: 'P4' }, 'sales');
    check('priority_change_during_pause_keeps_pause_and_consumption', paused.pauseStartTime === first.pauseStartTime && paused.slaStatus === 'PAUSED' && paused.resolutionDue === addMinutes(paused.openedTime, 60));
    await restart('pause');
    const reread = await ok('sales', `/crm/ticket/${paused.ticketId}`);
    check('real_process_restart_keeps_database_pause_and_promises', reread.pauseStartTime === paused.pauseStartTime && reread.slaStatus === 'PAUSED' && reread.resolutionDue === paused.resolutionDue && JSON.stringify(ticketFact(paused.ticketId)) === JSON.stringify(paused));
    evidence.restart = true;
    evidence.priority = true;
  });
  fixture.lifecycle = { policyId: terms.id, pausedTicketId: paused.ticketId, pauseStarted: paused.pauseStartTime };
  return { paused, client, terms };
}

export async function finishE2SlaLifecycle(context, pending, calendars) {
  const { check, prove, ticket, ticketFact, updateTicket, ok, user, minuteNow, addMinutes, elapsed, evidence, fixtureTicket, instant, timestamp, fixture } = context;
  await prove(6, async () => {
    const before = ticketFact(pending.paused.ticketId);
    check('pause_remains_unchanged_during_real_reminder_scans', before.pauseStartTime === pending.paused.pauseStartTime && before.slaPausedMinutes === 0 && before.slaStatus === 'PAUSED');
    const firstMinute = minuteNow();
    const resumed = await updateTicket(before, { status: 'IN_PROGRESS' }, 'sales');
    const pausedMinutes = resumed.slaPausedMinutes;
    check('resume_after_real_restarts_adds_each_elapsed_minute_once', pausedMinutes >= 1 && [elapsed(before.pauseStartTime, firstMinute), elapsed(before.pauseStartTime, minuteNow())].includes(pausedMinutes) && resumed.pauseStartTime == null);
    check('resume_extends_resolution_and_keeps_recorded_first_response', resumed.resolutionDue === addMinutes(before.resolutionDue, pausedMinutes) && resumed.firstResponseDue === before.firstResponseDue && resumed.firstResponseTime === before.firstResponseTime && resumed.firstResponseMinutes === before.firstResponseMinutes);
    const repeated = await updateTicket(resumed, { status: 'IN_PROGRESS' }, 'sales');
    check('repeat_resume_does_not_add_pause_twice', repeated.slaPausedMinutes === pausedMinutes && repeated.resolutionDue === resumed.resolutionDue);
    const secondPause = await updateTicket(repeated, { status: 'WAITING_CUSTOMER' }, 'sales');
    const secondMinute = minuteNow();
    const secondResume = await updateTicket(secondPause, { status: 'IN_PROGRESS' }, 'sales');
    const extra = secondResume.slaPausedMinutes - pausedMinutes;
    check('second_pause_accumulates_only_its_own_minutes', [elapsed(secondPause.pauseStartTime, secondMinute), elapsed(secondPause.pauseStartTime, minuteNow())].includes(extra) && secondResume.resolutionDue === addMinutes(resumed.resolutionDue, extra));
    fixture.lifecycle.pausedMinutes = secondResume.slaPausedMinutes;
    fixture.lifecycle.resumedDeadline = secondResume.resolutionDue;
  });
  await prove([5, 6, 8, 14], async () => {
    const previous = ticketFact(pending.paused.ticketId);
    await ok('sales', `/crm/ticket/${previous.ticketId}/resolve`, 'POST', { solution: '独立验收完成处理' });
    const resolved = ticketFact(previous.ticketId);
    check('on_time_resolution_fulfills_and_excludes_all_pauses', resolved.slaStatus === 'FULFILLED' && resolved.resolutionMinutes === elapsed(resolved.openedTime, resolved.resolvedTime) - resolved.slaPausedMinutes && resolved.responseBreachedFlag === 0 && resolved.resolutionBreachedFlag === 0);
    check('fulfillment_keeps_original_first_response', resolved.firstResponseTime === previous.firstResponseTime && resolved.firstResponseMinutes === previous.firstResponseMinutes);
    await ok('sales', `/crm/ticket/${previous.ticketId}/resolve`, 'POST', { solution: '独立验收重复处理' });
    check('repeat_fulfillment_preserves_entire_result', JSON.stringify(ticketFact(previous.ticketId)) === JSON.stringify(resolved));
    await ok('sales', `/crm/ticket/${previous.ticketId}/close`, 'POST');
    const closed = ticketFact(previous.ticketId);
    check('close_after_fulfillment_keeps_timing_result', closed.status === 'CLOSED' && closed.slaStatus === 'FULFILLED' && closed.resolvedTime === resolved.resolvedTime && closed.resolutionMinutes === resolved.resolutionMinutes);
    evidence.fulfillment = true;
  });
  await prove(6, async () => {
    const today = new Date(instant(minuteNow()) + 8 * 3600000);
    const daysSinceMonday = (today.getUTCDay() + 6) % 7;
    today.setUTCDate(today.getUTCDate() - daysSinceMonday - 7);
    const date = today.toISOString().slice(0, 10);
    const opening = date + ' 09:00:00';
    const pause = date + ' 11:30:00';
    const sample = await ticket('WORK_PAUSE', calendars.workingClient, { openedTime: opening, ownerId: user('sales') });
    fixtureTicket(sample.ticketId, { status: 'WAITING_CUSTOMER', sla_status: 'PAUSED', pause_start_time: pause, first_response_time: date + ' 10:00:00', first_response_minutes: 60 }, 'Historical pause fixture across lunch, nights and weekend; actual service resumes it');
    const isWorkMinute = point => {
      const value = new Date(point + 8 * 3600000), day = value.getUTCDay(), minute = value.getUTCHours() * 60 + value.getUTCMinutes();
      return day >= 1 && day <= 5 && (minute >= 540 && minute < 720 || minute >= 780 && minute < 1080);
    };
    const workMinutes = (from, to) => {
      let total = 0;
      for (let cursor = instant(from); cursor < instant(to); cursor += 60000) if (isWorkMinute(cursor)) total++;
      return total;
    };
    const workDue = (from, minutes) => {
      let cursor = instant(from), remaining = minutes;
      while (remaining > 0) { if (isWorkMinute(cursor)) remaining--; cursor += 60000; }
      return timestamp(cursor);
    };
    const started = minuteNow();
    const resumed = await updateTicket(sample, { status: 'IN_PROGRESS' }, 'sales');
    const candidates = [workMinutes(pause, started), workMinutes(pause, minuteNow())];
    check('historical_pause_consumes_only_actual_calendar_work_minutes', candidates.includes(resumed.slaPausedMinutes) && resumed.slaPausedMinutes < elapsed(pause, minuteNow()));
    check('historical_pause_deadline_uses_work_calendar_when_resumed', resumed.resolutionDue === workDue(sample.resolutionDue, resumed.slaPausedMinutes) && resumed.firstResponseTime === date + ' 10:00:00' && resumed.firstResponseMinutes === 60);
    fixture.lifecycle.historicalPause = { ticketId: sample.ticketId, pausedWorkMinutes: resumed.slaPausedMinutes, resumedDeadline: resumed.resolutionDue, fixtureFieldsAssigned: true, systemClockChanged: false };
    evidence.pause = true;
  });
  assert.ok(evidence.response && evidence.pause && evidence.restart && evidence.priority && evidence.fulfillment);
}
