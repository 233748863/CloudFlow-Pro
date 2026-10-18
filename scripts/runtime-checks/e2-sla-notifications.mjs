import assert from 'node:assert/strict';

export async function verifyE2SlaNotifications(context) {
  const { check, evidence, prove, customer, policy, ticket, ticketFact, fixtureTicket, ok, api, user, database, rows, sql, timestamp, waitFor, restart, fixture } = context;
  const base = '/auth/system/job';
  const jobs = [];
  const logs = job => rows(`SELECT JSON_OBJECT('id',CAST(log_id AS CHAR),'executeNo',execute_no,'status',execute_status,'affected',affected_rows,'trigger',trigger_type,'duration',duration_ms,'report',report_time) FROM sys_job_log WHERE job_id=${job.id} ORDER BY log_id;`);
  const makeJob = async (sourceId, handler, suffix, settings = {}) => {
    const original = await ok('admin', `${base}/${sourceId}`);
    check(`original_${handler}_belongs_to_paused_fixture`, original.handlerName === handler && original.status === 'PAUSED');
    const name = `${context.marker}_${suffix}`;
    await ok('admin', base, 'POST', { ...original, jobId: undefined, jobName: name, jobGroup: 'E2_VERIFY', handlerParam: context.marker, status: 'PAUSED', triggerType: 'FIXED_RATE',
      cronExpression: null, intervalMs: 600000, concurrentFlag: 0, misfireStrategy: 'IGNORE', retryCount: 0, dispatchRetryCount: 0, timeoutSeconds: 90, lockTimeSeconds: 90,
      criticalFlag: 0, alarmOnFailFlag: 1, alarmReceiver: user('admin'), logSuccessFlag: 1, ...settings });
    const job = { id: context.identifier(database(`SELECT job_id FROM sys_job WHERE job_name=${sql(name)} AND deleted=0;`)), handler, name };
    jobs.push(job); fixture.jobs.push(job); return job;
  };
  const runJob = async job => {
    const accepted = await ok('admin', `${base}/${job.id}/trigger`, 'POST', {});
    check(`${job.handler}_manual_request_accepted`, accepted.accepted === true && Boolean(accepted.executeNo));
    const completed = await waitFor(() => logs(job).find(value => value.executeNo === accepted.executeNo), value => value && value.status !== 'RUNNING', `Real ${job.handler} execution did not finish`, 90000);
    check(`${job.handler}_actual_task_success`, completed.status === 'SUCCESS' && completed.trigger === 'MANUAL' && Number.isInteger(completed.affected) && completed.affected >= 0 && completed.report != null);
    fixture.measurements.push({ kind: 'job', handler: job.handler, ...completed }); return completed;
  };
  const messages = sample => rows(`SELECT JSON_OBJECT('id',CAST(record_id AS CHAR),'receiver',CAST(receiver_id AS CHAR),'bizId',biz_id,'status',send_status,'channel',channel_type) FROM sys_message_record WHERE tenant_id=100000 AND biz_type='CRM_TICKET_SLA' AND biz_id LIKE ${sql(sample.ticketId + ':%')} ORDER BY record_id;`);
  const waitMessages = async (sample, types) => waitFor(() => messages(sample), values => types.every(type => values.some(value => value.bizId === `${sample.ticketId}:${type}` && value.status === 'SUCCESS')), 'Real internal SLA messages did not complete', 60000);
  const ownerOnly = (values, sample, type) => {
    const selected = values.filter(value => value.bizId === `${sample.ticketId}:${type}`);
    return selected.length === 1 && selected[0].receiver === user('sales') && selected[0].status === 'SUCCESS' && selected[0].channel === 'INTERNAL';
  };
  const client = await customer('DUE_CLIENT', { ownerId: user('sales') });
  await policy('DUE_POLICY', { entityType: 'CUSTOMER', entityId: client.id }, [[5, 5], [5, 5], [5, 5], [5, 5]]);
  const responseClient = await customer('RESPONSE_ONLY_CLIENT', { ownerId: user('sales') });
  await policy('RESPONSE_ONLY_POLICY', { entityType: 'CUSTOMER', entityId: responseClient.id, applyForResolution: 0 }, [[5, null], [5, null], [5, null], [5, null]]);
  const boundary = (Math.floor(Date.now() / 60000) + 3) * 60000;
  const openedTime = timestamp(boundary - 4 * 60000);
  const dueInstant = boundary + 60000;
  const target = await ticket('REAL_NOTICE', client, { ownerId: user('sales'), openedTime });
  const exact = await ticket('EXACT_DUE', client, { ownerId: user('sales'), openedTime });
  const responseOnly = await ticket('RESPONSE_ONLY', responseClient, { ownerId: user('sales'), openedTime });
  check('reminder_clock_matches_actual_persisted_five_minute_budget', target.firstResponseDue === timestamp(dueInstant) && target.resolutionDue === timestamp(dueInstant));
  const localBoundary = new Date(boundary + 8 * 3600000);
  const cronExpression = `5 ${localBoundary.getUTCMinutes()} ${localBoundary.getUTCHours()} * * ?`;
  const dueJob = await makeJob(105, 'ticketSlaDispatch', 'DUE_JOB', { triggerType: 'CRON', cronExpression, intervalMs: null });
  const breachJob = await makeJob(1552, 'crmSlaBreachScan', 'BREACH_JOB');
  try {
    await prove(10, async () => {
      assert.ok(Date.now() < boundary - 10000, 'Reminder setup must finish before the actual 80 percent minute');
      await ok('admin', '/crm/notification/dispatch/ticket-sla', 'POST');
      check('before_eighty_percent_no_target_reminder', messages(target).length === 0);
      await ok('admin', `${base}/${dueJob.id}/toggle`, 'PUT', { status: 'ENABLED' });
      console.log(`E2_SLA_WAIT: phase=natural_eighty_percent; due_in_seconds=${Math.ceil((boundary + 5000 - Date.now()) / 1000)}; clock_changes=0`);
      const natural = await waitFor(() => logs(dueJob).find(value => value.trigger === 'CRON' && value.status !== 'RUNNING'), Boolean, 'Natural SLA reminder job did not execute', Math.max(90000, boundary + 65000 - Date.now()));
      check('eighty_percent_reminder_naturally_dispatched_by_job_platform', natural.status === 'SUCCESS' && natural.affected >= 2 && natural.report != null && Date.now() < dueInstant);
      fixture.measurements.push({ kind: 'natural', handler: dueJob.handler, configuredCron: cronExpression, ...natural });
      await ok('admin', `${base}/${dueJob.id}/toggle`, 'PUT', { status: 'PAUSED' });
      const values = await waitMessages(target, ['RESPONSE_APPROACHING', 'RESOLUTION_APPROACHING']);
      check('eighty_percent_each_dimension_delivered_once_to_owner', values.length === 2 && ownerOnly(values, target, 'RESPONSE_APPROACHING') && ownerOnly(values, target, 'RESOLUTION_APPROACHING'));
      const before = JSON.stringify(values);
      await runJob(dueJob);
      check('repeat_eighty_percent_scan_has_no_duplicate_records', JSON.stringify(messages(target)) === before);
    });
    await prove(11, async () => {
      const legacy = await ticket('LEGACY_ENTRY', client, { ownerId: user('sales'), openedTime });
      fixtureTicket(legacy.ticketId, { due_time: '2035-01-01 00:00:00' }, 'Legacy display deadline deliberately differs from the two real SLA deadlines');
      await ok('admin', '/crm/notification/dispatch/ticket-sla', 'POST');
      const values = await waitMessages(legacy, ['RESPONSE_APPROACHING', 'RESOLUTION_APPROACHING']);
      check('legacy_dispatch_uses_response_and_resolution_due_despite_future_due_time', values.length === 2 && ownerOnly(values, legacy, 'RESPONSE_APPROACHING') && ownerOnly(values, legacy, 'RESOLUTION_APPROACHING') && ticketFact(legacy.ticketId).dueTime === '2035-01-01 00:00:00');
      evidence.legacyEntry = true;
    });
    await prove([8, 10], async () => {
      console.log(`E2_SLA_WAIT: phase=exact_deadline; due_in_seconds=${Math.max(0, Math.ceil((dueInstant + 2000 - Date.now()) / 1000))}; clock_changes=0`);
      await waitFor(() => Date.now(), value => value >= dueInstant + 2000, 'Actual deadline was not reached', 90000);
      await runJob(breachJob);
      const atDue = ticketFact(target.ticketId);
      check('deadline_minute_itself_is_not_a_breach', atDue.responseBreachedFlag === 0 && atDue.resolutionBreachedFlag === 0 && atDue.slaStatus === 'ONGOING');
      await ok('sales', `/crm/ticket/${exact.ticketId}/resolve`, 'POST', { solution: '在截止分钟完成' });
      const exactResult = ticketFact(exact.ticketId);
      check('resolution_exactly_at_deadline_is_fulfilled', exactResult.resolvedTime === timestamp(dueInstant) && exactResult.slaStatus === 'FULFILLED' && exactResult.firstResponseMinutes === 5 && exactResult.resolutionMinutes === 5);
      await ok('sales', `/crm/ticket/${responseOnly.ticketId}/resolve`, 'POST', { solution: '只考核首次响应的工单完成' });
      const responseResult = ticketFact(responseOnly.ticketId);
      check('response_only_policy_does_not_assess_resolution', responseResult.slaStatus === 'FULFILLED' && responseResult.resolutionDue == null && responseResult.dueTime === responseResult.firstResponseDue && responseResult.resolutionBreachedFlag === 0);
      await runJob(dueJob);
      const values = await waitMessages(target, ['RESPONSE_DUE', 'RESOLUTION_DUE']);
      check('deadline_each_dimension_delivered_once_to_owner', values.length === 4 && ownerOnly(values, target, 'RESPONSE_DUE') && ownerOnly(values, target, 'RESOLUTION_DUE'));
      fixture.measurements.push({ kind: 'exact_deadline', ticketId: exact.ticketId, resolutionMinutes: exactResult.resolutionMinutes, resolvedTime: exactResult.resolvedTime, responseOnlyTicketId: responseOnly.ticketId });
    });
    await prove([8, 10, 14], async () => {
      console.log(`E2_SLA_WAIT: phase=one_minute_overdue; due_in_seconds=${Math.max(0, Math.ceil((dueInstant + 62000 - Date.now()) / 1000))}; clock_changes=0`);
      await waitFor(() => Date.now(), value => value >= dueInstant + 62000, 'Actual one minute breach was not reached', 90000);
      await runJob(breachJob);
      const breached = ticketFact(target.ticketId);
      check('one_minute_overdue_marks_both_breaches', breached.responseBreachedFlag === 1 && breached.resolutionBreachedFlag === 1 && breached.slaStatus === 'RESOLUTION_BREACHED');
      const values = await waitFor(() => messages(target), items => items.length === 8 && items.every(item => item.status === 'SUCCESS'), 'Owner and leader breach alerts did not complete');
      for (const type of ['RESPONSE_BREACHED', 'RESOLUTION_BREACHED']) {
        const selected = values.filter(value => value.bizId === `${target.ticketId}:${type}`);
        check(`${type}_delivered_once_to_owner_and_leader`, selected.length === 2 && selected.every(value => value.channel === 'INTERNAL') && selected.map(value => value.receiver).sort().join(',') === [user('sales'), user('manager')].sort().join(','));
      }
      const simultaneous = await Promise.all([0, 1].map(() => api('sales', `/crm/ticket/${target.ticketId}/resolve`, { method: 'POST', body: { solution: '重复履约并发验证' }, concurrent: true })));
      check('concurrent_fulfillment_has_success_and_only_duplicate_refusal', simultaneous.some(value => value.status === 200 && value.body?.code === 200) && simultaneous.every(value => value.body?.code === 200 || /重复/.test(String(value.body?.msg || value.body?.message))));
      const fulfilled = ticketFact(target.ticketId);
      check('late_fulfillment_preserves_breach_result', fulfilled.status === 'RESOLVED' && fulfilled.slaStatus === 'RESOLUTION_BREACHED' && fulfilled.responseBreachedFlag === 1 && fulfilled.resolutionBreachedFlag === 1 && fulfilled.resolutionMinutes >= 6);
      check('repeated_fulfillment_does_not_duplicate_delivered_alerts', JSON.stringify(messages(target)) === JSON.stringify(values));
      await restart('repeat');
      check('restart_keeps_completed_breach_state', JSON.stringify(ticketFact(target.ticketId)) === JSON.stringify(fulfilled));
      await runJob(breachJob);
      await runJob(dueJob);
      check('after_restart_breach_and_due_scans_do_not_duplicate_any_target_record', JSON.stringify(messages(target)) === JSON.stringify(values));
      fixture.notifications = { targetTicketId: target.ticketId, approachingAt: timestamp(boundary), dueAt: timestamp(dueInstant), records: values, naturalExecutionObserved: true, originalHourlyCronObserved: false, systemClockChanged: false };
      evidence.reminders = true;
      evidence.deduplication = true;
    });
  } finally {
    for (const job of jobs) {
      await waitFor(() => logs(job), values => values.every(value => value.status !== 'RUNNING'), 'E2 task still running at cleanup', 90000);
      await ok('admin', `${base}/${job.id}/toggle`, 'PUT', { status: 'PAUSED' });
    }
  }
  check('all_e2_validation_tasks_left_paused', jobs.every(job => database(`SELECT status FROM sys_job WHERE job_id=${job.id};`) === 'PAUSED'));
}
