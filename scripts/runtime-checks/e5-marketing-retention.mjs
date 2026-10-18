export async function verifyE5Retention(context, mail) {
  const { check, prove, fixture, evidence, database, rows, sql, own, fixtureWrite, waitFor, sleep } = context;
  const archiveRun = async () => {
    const accepted = await mail.trigger('crmCampaignCountAggregate');
    check('archive_job_has_actual_execution_identity', typeof accepted.executeNo === 'string' && accepted.executeNo.length > 0 && accepted.executeNo.length <= 64);
    const completed = await waitFor(() => rows("SELECT JSON_OBJECT('status',execute_status,'ended',CAST(end_time AS CHAR),'affected',affected_rows) FROM sys_job_log WHERE tenant_id=100000 AND handler_name='crmCampaignCountAggregate' AND execute_no="
      + sql(accepted.executeNo) + ';'), values => values.length === 1 && values[0].status === 'SUCCESS' && values[0].ended !== null,
      'Actual archive job did not report successful completion');
    fixture.retentionJobs ||= [];
    fixture.retentionJobs.push({ executeNo: accepted.executeNo, ...completed[0] });
  };
  await prove([9, 10, 19], async () => {
    await sleep(60050 - Date.now() % 60000);
    const bob = mail.formal.find(message => message.to[0].startsWith('bob-'));
    check('retention_uses_actual_delivered_recipient', Boolean(bob));
    const tokens = mail.tokens(bob);
    const response = await mail.publicRequest('click', tokens.click, { headers: { 'User-Agent': 'CloudFlow actual archive observation '.repeat(12) } });
    check('actual_bulky_observation_before_archival', response.status() === 302);
    const recipientId = database('SELECT recipient_id FROM crm_mass_email_recipient WHERE tenant_id=100000 AND mass_email_id=' + mail.task.massEmailId
      + ' AND target_id=' + mail.bob.memberRefId + ' AND test_flag=0;');
    const events = rows("SELECT JSON_OBJECT('id',CAST(log_id AS CHAR),'action',action) FROM crm_campaign_log WHERE tenant_id=100000 AND source_event_key IN("
      + sql('MAIL:' + recipientId + ':SENT') + ',' + sql('MAIL:' + recipientId + ':CLICKED') + ') ORDER BY log_id;');
    check('archival_selects_only_owned_actual_source_events', events.length === 2 && events.some(value => value.action === 'SENT') && events.some(value => value.action === 'CLICKED'));
    const timestamp = database("SELECT DATE_FORMAT(DATE_SUB(NOW(),INTERVAL 13 MONTH),'%Y-%m-%d %H:%i:%s');");
    for (const event of events) {
      own('log', event.id);
      fixtureWrite('crm_campaign_log', event.id, 'UPDATE crm_campaign_log SET action_time=' + sql(timestamp) + ' WHERE tenant_id=100000 AND log_id=' + event.id + ';', '仅本轮真实投递日志的过期样本，不改服务器时钟');
    }
    const eventIds = events.map(value => value.id).join(',');
    const coreSql = "SELECT JSON_OBJECT('id',CAST(log_id AS CHAR),'tenant',tenant_id,'campaign',campaign_id,'massEmail',mass_email_id,'action',action,'time',action_time,'targetType',target_type,'target',target_id,'record',message_record_id,'test',test_flag,'source',source_event_key,'by',create_by,'created',create_time) FROM crm_campaign_log WHERE log_id IN(" + eventIds + ') ORDER BY log_id;';
    const beforeCore = database(coreSql);
    const count = database('SELECT COUNT(*) FROM crm_campaign_log WHERE tenant_id=100000 AND campaign_id=' + mail.main.campaignId + ';');
    const before = (await mail.campaign(mail.main.campaignId)).campaign;
    check('formal_archival_schedule_is_five_minutes', database("SELECT interval_ms FROM sys_job WHERE tenant_id=100000 AND handler_name='crmCampaignCountAggregate' AND deleted=0;") === '300000');
    await archiveRun();
    await waitFor(() => database('SELECT COUNT(*) FROM crm_campaign_log WHERE log_id IN(' + eventIds + ') AND archive_checked_time IS NOT NULL;'), value => value === '2', 'Actual archival job did not process both owned expired events');
    const saved = rows("SELECT JSON_OBJECT('id',CAST(log_id AS CHAR),'action',action,'archived',archive_payload IS NOT NULL,'payload',COALESCE(OCTET_LENGTH(archive_payload),0),'checksum',COALESCE(OCTET_LENGTH(archive_checksum),0),'rawPresent',target_email IS NOT NULL OR click_url IS NOT NULL OR user_agent IS NOT NULL OR ip_address IS NOT NULL) FROM crm_campaign_log WHERE log_id IN(" + eventIds + ') ORDER BY log_id;');
    check('actual_job_compresses_bulky_click_and_keeps_short_sent', saved.some(value => value.action === 'CLICKED' && value.archived === true && value.payload > 0 && value.checksum === 32 && value.rawPresent === false)
      && saved.some(value => value.action === 'SENT' && value.archived === false && value.rawPresent === true));
    check('archival_keeps_all_event_identity_and_historical_count', database(coreSql) === beforeCore
      && database('SELECT COUNT(*) FROM crm_campaign_log WHERE tenant_id=100000 AND campaign_id=' + mail.main.campaignId + ';') === count);
    const after = (await mail.campaign(mail.main.campaignId)).campaign;
    check('actual_aggregate_preserves_email_statistics', ['sentCount', 'deliveredCount', 'openedCount', 'clickedCount', 'bouncedCount', 'unsubscribedCount'].every(field => before[field] === after[field]));
    await mail.publicRequest('open', tokens.open);
    await mail.publicRequest('open', tokens.open);
    await mail.publicRequest('click', tokens.click);
    const late = (await mail.campaign(mail.main.campaignId)).campaign;
    check('archived_sent_permits_one_late_open', late.openedCount === before.openedCount + 1 && late.clickedCount === before.clickedCount);
    check('archived_original_click_keeps_canonical_dedup', database("SELECT COUNT(*) FROM crm_campaign_log WHERE tenant_id=100000 AND source_event_key=" + sql('MAIL:' + recipientId + ':CLICKED') + ';') === '1');
    const original = database(coreSql);
    await archiveRun();
    check('repeat_archive_has_two_completed_executions', fixture.retentionJobs.length === 2
      && new Set(fixture.retentionJobs.map(execution => execution.executeNo)).size === 2);
    check('repeat_archive_keeps_immutable_event_contents', database(coreSql) === original);
    fixture.retention = { months: 12, batchLimit: 200, maximumRestoredBytes: 32768, realJob: true, scheduleIntervalMs: 300000,
      expiredTimestamp: timestamp, events: saved, lateOpenAdded: 1, repeatedClickAdded: 0, systemClockChanged: false };
    evidence.retention = true;
  });
}
