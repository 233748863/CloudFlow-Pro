import { createHash } from 'node:crypto';
import { ownedGatewayRedis } from './owned-gateway-redis.mjs';
import { openContractPerformance } from './verify-contract-performance-h3-ui.mjs';

export async function verifyContractPerformanceRecovery(context) {
  const { state, database, check, caseTag, primary, salesId, sign, performance, sources, facts, allocations, waitFor, evidence } = context;
  const redis = await ownedGatewayRedis(state);
  const json = (...command) => JSON.parse(redis('--json', ...command));
  const stream = 'cloudflow:event:stream', group = 'cloudflow-event-consumer-group:cloudflow-service-crm';
  let cursor = json('XREVRANGE', stream, '+', '-', 'COUNT', '1')[0]?.[0] || '0-0';
  const trigger = `h3_contract_delivery_${caseTag}`;
  const decode = value => {
    let result = value;
    for (let depth = 0; depth < 3 && typeof result === 'string'; depth++) result = JSON.parse(result);
    return result;
  };
  let installed = false, delivered, identityKey;
  try {
    database(`DELIMITER $$\nCREATE TRIGGER ${trigger} BEFORE INSERT ON crm_deal_allocation FOR EACH ROW BEGIN
      IF NEW.tenant_id=100000 AND NEW.sales_user_id=${salesId} AND EXISTS(SELECT 1 FROM crm_deal_event WHERE tenant_id=100000
        AND event_id=NEW.event_id AND biz_type='CONTRACT' AND biz_id=${primary.contractId}) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='H3_OWNED_CONTRACT_DELIVERY_FAILURE'; END IF; END$$\nDELIMITER ;\n`);
    installed = true;
    await sign(primary);
    delivered = await waitFor(() => {
      for (const [identifier, fields] of json('XRANGE', stream, `(${cursor}`, '+', 'COUNT', '200')) {
        cursor = identifier;
        let envelope;
        try { envelope = decode(Object.fromEntries(Array.from({ length: fields.length / 2 }, (_, index) => [fields[index * 2], fields[index * 2 + 1]])).payload); }
        catch { continue; }
        if (envelope?.eventType === 'CONTRACT_PERFORMANCE_CHANGED' && Number(envelope.tenantId) === 100000
          && Number(envelope.sourceId) === primary.contractId) return { identifier, fields, envelope };
      }
      return null;
    }, Boolean, '真实合同业绩来源未进入共享消息队列');
    const digest = createHash('sha256');
    for (const value of [group, '100000', delivered.envelope.eventId]) {
      const bytes = Buffer.from(value, 'utf8'), length = Buffer.alloc(4);
      length.writeInt32BE(bytes.length); digest.update(length).update(bytes);
    }
    identityKey = `cloudflow:event:idem:${digest.digest('hex')}`;
    await waitFor(() => ({ state: redis('HGET', identityKey, 'state'), attempts: Number(redis('HGET', identityKey, 'attempts')) }),
      value => value.state === 'READY' && value.attempts >= 1, '真实CRM合同消费失败未保留可恢复状态');
    check('真实第二成员分配故障回滚整笔合同业绩，原消息仍待处理', facts(primary).length === 0 && allocations(primary).length === 0
      && json('XPENDING', stream, group, delivered.identifier, delivered.identifier, '1').length === 1);
    check('OA保存真实来源后明确等待CRM接收，没有把待同步冒充已计入', sources(primary).length === 1
      && (await performance(primary.contractId)).state === 'PENDING_SYNC' && (await performance(primary.contractId)).confirmedAmount == null);
    if (!context.httpOnly) {
      const { dialog, panel } = await openContractPerformance(context.admin, primary);
      await panel.getByText('待CRM接收', { exact: true }).waitFor();
      check('真实页面在CRM故障时明确显示待接收且无已确认金额', !(await panel.innerText()).includes('已确认金额：'));
      await dialog.getByRole('button', { name: '关闭', exact: true }).last().click();
      evidence.pendingSyncUi = true;
    }
  } finally {
    if (installed) database(`DROP TRIGGER ${trigger};`);
  }
  check('合同分配故障仅作用于本次合同且已移除', database(`SELECT COUNT(*) FROM information_schema.triggers WHERE trigger_schema='cloud_flow_db' AND trigger_name='${trigger}';`) === '0');
  await waitFor(() => redis('HGET', identityKey, 'state'), value => value === 'DONE', '后台重领未恢复原合同消息', 120000);
  check('合同原消息由后台自动重领完成，保留真实重试次数并正常确认', Number(redis('HGET', identityKey, 'attempts')) >= 2
    && json('XPENDING', stream, group, delivered.identifier, delivered.identifier, '1').length === 0 && facts(primary).length === 1 && allocations(primary).length === 2);
  const snapshot = JSON.stringify({ sources: sources(primary), facts: facts(primary), allocations: allocations(primary) });
  const duplicate = redis('XADD', stream, '*', ...delivered.fields);
  const atLeast = (actual, expected) => {
    const left = actual.split('-').map(BigInt), right = expected.split('-').map(BigInt);
    return left[0] > right[0] || left[0] === right[0] && left[1] >= right[1];
  };
  await waitFor(() => json('XINFO', 'GROUPS', stream).find(value => value.name === group),
    value => value && atLeast(value['last-delivered-id'], duplicate), '真实CRM组未收到重复合同消息');
  await waitFor(() => json('XPENDING', stream, group, duplicate, duplicate, '1'), value => value.length === 0, '重复合同消息未正常确认');
  check('重放完全相同的真实消息不重复来源、业绩或逐人分配', JSON.stringify({ sources: sources(primary), facts: facts(primary), allocations: allocations(primary) }) === snapshot);
  evidence.pendingSyncRecovery = true; evidence.queueReplay = true;
  evidence.recoveryInput = 'isolated_second_allocation_insert_failure';
  evidence.recoveryTransport = 'production_consumer_and_automatic_pending_claim';
}
