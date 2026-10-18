import assert from 'node:assert/strict';
import path from 'node:path';

export async function verifyE5SendingLimits(context, mail) {
  const { check, prove, fixture, evidence, ok, database, rows, own, waitFor, sleep } = context;
  const setLimit = async limit => {
    const channel = await ok('admin', '/auth/system/message/channel/' + mail.channelId);
    if (limit === 1 || limit === 2) {
      const page = context.sessions.admin.page, width = limit === 1 ? 1440 : 390;
      await page.setViewportSize({ width, height: width === 1440 ? 1000 : 844 });
      await page.goto(context.origin + '/message/channel', { waitUntil: 'domcontentloaded' });
      const row = page.locator('tbody tr').filter({ hasText: channel.channelCode });
      await row.getByRole('button', { name: '编辑渠道', exact: true }).click();
      const sender = page.getByLabel('发件地址', { exact: true });
      await sender.waitFor();
      check('channel_page_restores_valid_sender_' + width, await sender.inputValue() === 'sender@example.com' && await sender.evaluate(input => input.validity.valid));
      await page.getByLabel(/每分钟发送上限/).fill(String(limit));
      await page.getByRole('button', { name: '保存配置', exact: true }).click();
      await waitFor(async () => (await ok('admin', '/auth/system/message/channel/' + mail.channelId)), current => current.rateLimitMinute === limit && current.fromAddress === 'sender@example.com', 'Page channel limit or sender did not persist');
      await row.getByRole('button', { name: '编辑渠道', exact: true }).click();
      await sender.waitFor();
      check('channel_page_reopen_preserves_sender_and_limit_' + width, await sender.inputValue() === 'sender@example.com' && await page.getByLabel(/每分钟发送上限/).inputValue() === String(limit));
      await sender.scrollIntoViewIfNeeded();
      const viewport = await page.evaluate(() => ({ client: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
      check('channel_page_no_overflow_' + width, viewport.client === width && viewport.scroll <= width);
      const name = 'e5-channel-' + width + '.png';
      await page.screenshot({ path: path.join(context.output, name), fullPage: true });
      fixture.images.push({ name, width, actualBusinessPage: true });
      await page.getByRole('dialog').getByRole('button', { name: '取消', exact: true }).click();
    } else {
      const editable = { ...channel, rateLimitMinute: limit };
      delete editable.smtpPwd;
      delete editable.apiSecret;
      await ok('admin', '/auth/system/message/channel', 'PUT', editable);
    }
    check('real_channel_limit_' + limit, (await ok('admin', '/auth/system/message/channel/' + mail.channelId)).rateLimitMinute === limit);
    check('channel_limit_change_keeps_actual_sender_' + limit, database("SELECT from_address='sender@example.com' FROM sys_message_channel WHERE tenant_id=100000 AND channel_id=" + mail.channelId + ';') === '1');
  };
  const observedDeliveries = new Map();
  const deliveries = id => {
    const values = rows("SELECT JSON_OBJECT('id',CAST(delivery.delivery_id AS CHAR),'recipientId',CAST(recipient.recipient_id AS CHAR),"
      + "'recipientStatus',recipient.status,'recordProjected',recipient.message_record_id IS NOT NULL,'status',delivery.status,"
      + "'attempts',delivery.attempt_count,'code',delivery.last_error_code,'next',DATE_FORMAT(delivery.next_attempt_time,'%Y-%m-%d %H:%i:%s'),"
      + "'started',DATE_FORMAT(delivery.send_started_time,'%Y-%m-%d %H:%i:%s'),'accepted',DATE_FORMAT(delivery.accepted_time,'%Y-%m-%d %H:%i:%s')) "
      + "FROM sys_message_delivery delivery JOIN sys_message_record message ON message.tenant_id=delivery.tenant_id AND message.record_id=delivery.record_id "
      + "JOIN crm_mass_email_recipient recipient ON recipient.tenant_id=message.tenant_id AND message.biz_id=CAST(recipient.recipient_id AS CHAR) "
      + "WHERE recipient.tenant_id=100000 AND recipient.mass_email_id=" + id
      + " AND recipient.test_flag=0 AND message.biz_type='CRM_MASS_EMAIL' AND message.channel_type='EMAIL' AND message.resend_from_id IS NULL ORDER BY delivery.delivery_id;");
    const identity = String(id), signature = JSON.stringify(values);
    if (observedDeliveries.get(identity) !== signature) {
      fixture.quotaObservations ||= [];
      assert.ok(fixture.quotaObservations.length < 1000, 'Quota observation history exceeded its bounded capacity');
      fixture.quotaObservations.push({ taskId: identity, observedAt: new Date().toISOString(), deliveries: values });
      observedDeliveries.set(identity, signature);
    }
    return values;
  };
  const taskProjections = new Map();
  const taskProjection = async id => {
    const detail = await mail.details(id);
    const projection = { taskId: String(id), status: detail.task.status, sentCount: detail.task.sentCount,
      recipients: detail.recipients.rows.map(recipient => ({ id: String(recipient.recipientId), status: recipient.status })) };
    const signature = JSON.stringify(projection);
    if (taskProjections.get(String(id)) !== signature) {
      fixture.quotaTaskProjections ||= [];
      assert.ok(fixture.quotaTaskProjections.length < 1000, 'Quota task projection history exceeded its bounded capacity');
      fixture.quotaTaskProjections.push({ observedAt: new Date().toISOString(), ...projection });
      taskProjections.set(String(id), signature);
    }
    return detail;
  };
  const prepare = async suffix => {
    const members = [];
    for (let index = 0; index < 3; index++) members.push(await mail.createLead(suffix + index, suffix.toLowerCase() + index + '-' + context.marker.toLowerCase() + '@example.com'));
    const list = await mail.createList(suffix, members), campaign = await mail.createCampaign(suffix, [{ listId: list.listId, isExcludingFlag: 0 }]);
    const task = await mail.createTask(campaign.campaignId, suffix);
    own('list', list.listId); own('campaign', campaign.campaignId); own('massEmail', task.massEmailId);
    return task;
  };
  await prove(7, async () => {
    const task = await prepare('CancelSending');
    await setLimit(1);
    await sleep(60050 - Date.now() % 60000);
    const preview = await mail.preview(task.massEmailId);
    check('cancel_sending_preview_ready', preview.ready && preview.recipientCount === 3);
    const minute = Math.floor(Date.now() / 60000);
    await ok('admin', '/crm/campaign/mass-email/' + task.massEmailId + '/send', 'POST', mail.command(preview));
    const pending = await waitFor(() => deliveries(task.massEmailId), values => values.length === 3 && values.filter(value => value.status === 'SENT').length === 1
      && values.filter(value => value.status === 'PENDING' && value.code === 'CHANNEL_QUOTA' && value.attempts === 0).length === 2, 'Actual sending task did not pause two recipients at its channel quota', 40000);
    const current = (await waitFor(() => taskProjection(task.massEmailId), value => value.task.status === 'SENDING' && value.task.sentCount === 1,
      'Sending task did not receive the first accepted delivery outcome', 40000)).task;
    check('cancellation_observed_during_actual_sending', current.status === 'SENDING' && current.sentCount === 1 && Math.floor(Date.now() / 60000) === minute);
    await ok('admin', '/crm/campaign/mass-email/' + task.massEmailId + '/cancel', 'POST', { version: current.version });
    const remaining = pending.filter(value => value.status === 'PENDING').map(value => value.id);
    await waitFor(() => deliveries(task.massEmailId), values => values.filter(value => remaining.includes(value.id)).length === remaining.length
      && values.filter(value => remaining.includes(value.id)).every(value => ['SKIPPED', 'CANCELLED'].includes(value.status)), 'Cancelled queued deliveries were not rejected at natural recovery', 120000);
    const final = deliveries(task.massEmailId);
    const detail = await waitFor(() => taskProjection(task.massEmailId), value => value.task.status === 'CANCELLED' && value.task.sentCount === 1
      && value.recipients.rows.filter(recipient => recipient.status === 'CANCELLED').length === 2,
      'Cancelled task did not receive the two final cancellation outcomes');
    check('cancelled_unsent_recipients_never_attempted_smtp', final.filter(value => remaining.includes(value.id)).every(value => value.attempts === 0 && value.started === null && value.accepted === null));
    check('cancellation_retains_one_sent_and_stops_two', detail.task.status === 'CANCELLED' && detail.task.sentCount === 1 && detail.recipients.rows.filter(value => value.status === 'CANCELLED').length === 2);
    const accepted = (await mail.snapshot()).messages.filter(message => message.subject.includes('CancelSending'));
    check('cancelled_campaign_has_exactly_one_actual_email', accepted.length === 1);
    fixture.cancellation = { taskId: String(task.massEmailId), sent: 1, stopped: 2, neverAttempted: remaining.length, naturalRecovery: true };
    evidence.cancellation = true;
  });
  await prove(8, async () => {
    const task = await prepare('MinuteQuota');
    await setLimit(2);
    await sleep(60050 - Date.now() % 60000);
    const preview = await mail.preview(task.massEmailId);
    check('minute_quota_preview_ready', preview.ready && preview.recipientCount === 3);
    const minute = Math.floor(Date.now() / 60000);
    await ok('admin', '/crm/campaign/mass-email/' + task.massEmailId + '/send', 'POST', mail.command(preview));
    const before = await waitFor(() => deliveries(task.massEmailId), values => values.length === 3 && values.filter(value => value.status === 'SENT').length === 2
      && values.some(value => value.status === 'PENDING' && value.attempts === 0 && value.code === 'CHANNEL_QUOTA'), 'The third delivery was not delayed by the actual per-minute channel limit', 40000);
    check('third_recipient_waits_at_minute_boundary', Math.floor(Date.now() / 60000) === minute && before.filter(value => value.status === 'PENDING').every(value => value.next?.endsWith(':00')));
    await waitFor(() => deliveries(task.massEmailId), values => values.length === 3 && values.every(value => value.status === 'SENT'), 'Natural recovery did not send the remaining recipient next minute', 120000);
    const after = deliveries(task.massEmailId), buckets = new Map();
    for (const value of after) {
      assert.ok(value.started && value.accepted && value.attempts === 1);
      const key = value.started.slice(0, 16); buckets.set(key, (buckets.get(key) || 0) + 1);
    }
    check('actual_smtp_attempts_do_not_exceed_two_per_minute', buckets.size === 2 && [...buckets.values()].sort().join(',') === '1,2');
    check('all_three_actual_emails_arrive_once_across_minutes', (await mail.snapshot()).messages.filter(message => message.subject.includes('MinuteQuota')).length === 3);
    fixture.channelRate = { taskId: String(task.massEmailId), limitPerMinute: 2, actualAttemptsByMinute: Object.fromEntries(buckets), totalAccepted: 3, naturalRecovery: true, counterWrites: 0 };
    await setLimit(1000);
    evidence.rateLimits = true;
  });
}
