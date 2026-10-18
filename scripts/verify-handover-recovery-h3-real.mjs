import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { ownedGatewayRedis } from './owned-gateway-redis.mjs';

export async function completeWithHandoverRecovery(context, complete) {
  const { state, database, check, caseTag, donorId, evidence } = context;
  assert.match(caseTag, /^[a-f0-9]{12}$/);
  const redis = await ownedGatewayRedis(state);
  const stream = 'cloudflow:event:stream';
  const group = 'cloudflow-event-consumer-group:cloudflow-service-crm';
  const json = (...command) => JSON.parse(redis('--json', ...command));
  const latest = json('XREVRANGE', stream, '+', '-', 'COUNT', '1');
  let cursor = latest[0]?.[0] || '0-0';
  const trigger = `h3_handover_recovery_${caseTag}`;
  const decode = value => {
    let result = value;
    for (let depth = 0; depth < 3 && typeof result === 'string'; depth++) result = JSON.parse(result);
    return result;
  };
  const waitFor = async (read, accepts, label, milliseconds = 30000) => {
    const deadline = Date.now() + milliseconds;
    do {
      const value = await read();
      if (accepts(value)) return value;
      await new Promise(resolve => setTimeout(resolve, 500));
    } while (Date.now() < deadline);
    throw new Error(label);
  };
  let source;
  let identityKey;
  let installed = false;
  try {
    database(`DELIMITER $$\nCREATE TRIGGER ${trigger} BEFORE INSERT ON crm_handover_task FOR EACH ROW BEGIN IF NEW.tenant_id=100000 AND NEW.from_owner_id=${donorId} THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='H3_OWNED_HANDOVER_DELIVERY_FAILURE'; END IF; END$$\nDELIMITER ;\n`);
    installed = true;
    await complete();
    source = await waitFor(() => {
      const records = json('XRANGE', stream, `(${cursor}`, '+', 'COUNT', '200');
      for (const [identifier, fields] of records) {
        cursor = identifier;
        const body = Object.fromEntries(Array.from({ length: fields.length / 2 }, (_, index) => [fields[index * 2], fields[index * 2 + 1]]));
        let envelope;
        try { envelope = decode(body.payload); } catch { continue; }
        if (envelope?.eventType !== 'EMPLOYEE_OFFBOARDED' || Number(envelope.tenantId) !== 100000) continue;
        const payload = decode(envelope.payload);
        if (Number(payload.userId) === donorId) return { identifier, fields, envelope };
      }
      return null;
    }, Boolean, '真实HR离职事件未进入共享队列');
    const hasher = createHash('sha256');
    for (const value of [group, '100000', source.envelope.eventId]) {
      const bytes = Buffer.from(value, 'utf8');
      const size = Buffer.alloc(4);
      size.writeInt32BE(bytes.length);
      hasher.update(size).update(bytes);
    }
    identityKey = `cloudflow:event:idem:${hasher.digest('hex')}`;
    await waitFor(() => ({ status: redis('HGET', identityKey, 'state'), attempts: Number(redis('HGET', identityKey, 'attempts')) }),
      value => value.status === 'READY' && value.attempts >= 1, '真实CRM消费失败未保留可重试状态');
    check('真实离职通知消费遇到指定数据库故障后仍保留待处理消息', json('XPENDING', stream, group, source.identifier, source.identifier, '1').length === 1);
    check('真实交接事务失败没有留下半组待办', database(`SELECT COUNT(*) FROM crm_handover_task WHERE tenant_id=100000 AND from_owner_id=${donorId};`) === '0');
  } finally {
    if (installed) database(`DROP TRIGGER ${trigger};`);
  }
  check('交接故障仅作用于本次原负责人且已移除', database(`SELECT COUNT(*) FROM information_schema.triggers WHERE trigger_schema='cloud_flow_db' AND trigger_name='${trigger}';`) === '0');
  return async () => {
    await waitFor(() => redis('HGET', identityKey, 'state'), value => value === 'DONE', '后台重领未完成原离职事件', 90000);
    check('原离职事件由后台重领成功完成，未由测试重发或改状态', json('XPENDING', stream, group, source.identifier, source.identifier, '1').length === 0
      && Number(redis('HGET', identityKey, 'attempts')) >= 2);
    const signature = () => database(`SELECT JSON_OBJECT('id',handover_id,'type',business_type,'business',business_id,'status',status,'owner',from_owner_id,'target',to_owner_id,'version',version) FROM crm_handover_task WHERE tenant_id=100000 AND from_owner_id=${donorId} ORDER BY handover_id;`);
    const before = signature();
    const duplicate = redis('XADD', stream, '*', ...source.fields);
    const atLeast = (actual, expected) => {
      const actualParts = actual.split('-').map(BigInt);
      const expectedParts = expected.split('-').map(BigInt);
      return actualParts[0] > expectedParts[0] || actualParts[0] === expectedParts[0] && actualParts[1] >= expectedParts[1];
    };
    await waitFor(() => json('XINFO', 'GROUPS', stream).find(value => value.name === group),
      value => value && atLeast(value['last-delivered-id'], duplicate), '真实CRM消费组未接收重复离职消息');
    await waitFor(() => json('XPENDING', stream, group, duplicate, duplicate, '1'), value => value.length === 0, '重复离职消息未正常确认');
    check('恢复后重放原离职消息不重复生成待办或修改历史版本', signature() === before && redis('HGET', identityKey, 'state') === 'DONE');
    evidence.eventPendingRecovery = true;
    evidence.eventFailureInjection = 'isolated_handover_insert_trigger';
    evidence.eventRecoveryTransport = 'production_consumer_and_scheduled_redis_claim';
    evidence.recoveredEventReplay = true;
  };
}
