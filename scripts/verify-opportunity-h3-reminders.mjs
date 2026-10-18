import assert from 'node:assert/strict';

export async function verifyOpportunityReminders({ admin, sales, api, successful, database, check, waitFor, createOpportunity, customerId, saveRule, detail, advance, salesId, evidence }) {
  await saveRule('LEAD', { overdueDays: 1 });
  const notice = await createOpportunity('notice', customerId);
  const makeDue = id => database(`UPDATE crm_opportunity SET stage_changed_time=DATE_SUB(NOW(),INTERVAL 2 DAY) WHERE tenant_id=100000 AND opportunity_id=${id};
    UPDATE crm_opportunity_stage_history SET changed_time=(SELECT stage_changed_time FROM crm_opportunity WHERE tenant_id=100000 AND opportunity_id=${id}), entered_time=(SELECT stage_changed_time FROM crm_opportunity WHERE tenant_id=100000 AND opportunity_id=${id}) WHERE tenant_id=100000 AND opportunity_id=${id} AND from_stage IS NULL;`);
  const records = id => JSON.parse(database(`SELECT COALESCE(JSON_ARRAYAGG(JSON_OBJECT('id',record_id,'receiver',receiver_id,'status',send_status,'link',link_url,'event',outbox_event_id)),JSON_ARRAY()) FROM sys_message_record WHERE tenant_id=100000 AND biz_type='CRM_OPPORTUNITY_STAGE_NOTICE' AND biz_id='${id}';`));
  let lastTrigger = 0;
  const trigger = async () => {
    const pause = 5200 - (Date.now() - lastTrigger);
    if (pause > 0) await new Promise(resolve => setTimeout(resolve, pause));
    const result = successful(await api(admin, '/auth/system/job/1900/trigger', { method: 'POST', body: {} }), '触发真实商机超期任务');
    assert.match(result.executeNo, /^[A-Za-z0-9_-]+$/);
    check('真实集中任务接受商机超期扫描', result.accepted === true);
    await waitFor(() => database(`SELECT execute_status FROM sys_job_log WHERE tenant_id=100000 AND execute_no='${result.executeNo}';`), value => value === 'SUCCESS', '商机提醒任务未实际完成');
    lastTrigger = Date.now();
  };
  makeDue(notice.opportunityId);
  await trigger();
  const delivered = await waitFor(() => records(notice.opportunityId), values => values.length === 1 && values[0].status === 'SUCCESS', '真实商机站内提醒未送达');
  check('真实事件经认证服务和CRM来源核验后送达唯一负责人', Number(delivered[0].receiver) === salesId && Boolean(delivered[0].event)
    && database(`SELECT COUNT(*) FROM sys_message_delivery WHERE tenant_id=100000 AND record_id=${delivered[0].id} AND channel_type='INTERNAL' AND status='SENT';`) === '1');
  check('超期提醒只含授权商机的详情入口', delivered[0].link === `/office/crm/opportunities?opportunityId=${notice.opportunityId}`);
  await trigger();
  check('重复任务保持同商机、同阶段进入记录、同阈值仅一条消息', records(notice.opportunityId).length === 1);
  check('当前停留天数由实际进入时间校正为2天', (await detail(notice.opportunityId)).stageDurationDays === 2);
  const blocked = await createOpportunity('disabled_recipient', customerId);
  makeDue(blocked.opportunityId);
  try {
    database(`UPDATE sys_user SET status='1' WHERE tenant_id=100000 AND user_id=${salesId};`);
    await trigger();
    check('负责人停用时不排入商机通知', records(blocked.opportunityId).length === 0);
  } finally {
    database(`UPDATE sys_user SET status='0' WHERE tenant_id=100000 AND user_id=${salesId};`);
  }
  await trigger();
  await waitFor(() => records(blocked.opportunityId), values => values.length === 1 && values[0].status === 'SUCCESS', '恢复有效负责人后未能真实投递');
  check('有效负责人恢复后尚未发送的超期消息可投递', records(blocked.opportunityId).length === 1);
  await saveRule('NEGOTIATION', { allowSkipFlag: 1 });
  const changed = await advance(await detail(notice.opportunityId), 'NEGOTIATION');
  await trigger();
  check('改阶段后旧进入时间不再重复提醒，新阶段重新计时', records(notice.opportunityId).length === 1 && changed.stageDurationDays === 0 && changed.lastStage === 'LEAD');
  const linked = successful(await api(sales, `/crm/opportunity/${notice.opportunityId}`), '提醒接收者读取当前商机');
  check('旧提醒入口重新读取当前阶段而不返回旧状态', linked.stage === 'NEGOTIATION');
  evidence.reminders = true;
}
