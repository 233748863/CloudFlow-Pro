import {
  api, check, checks, failureSummary, jsonRows, openSessions, prefix, readFixture, saveResult, sqlText, success, until,
} from './batch-h/live-lib.mjs';

let sessions;
let failure;
let requestId;
let instanceId;
let recovery = 'NOT_STARTED';

function requestState() {
  return jsonRows(`SELECT JSON_OBJECT('status',status,'instanceId',instance_id,'version',version)
    FROM oa_consumable_request WHERE tenant_id=100000 AND request_id=${sqlText(requestId)}`)[0];
}

function facts(materialId) {
  return jsonRows(`SELECT JSON_OBJECT(
    'approvalCount',(SELECT COUNT(*) FROM wf_task_history WHERE tenant_id=100000 AND instance_id=${sqlText(instanceId)}),
    'instanceCount',(SELECT COUNT(*) FROM wf_process_instance WHERE tenant_id=100000 AND instance_id=${sqlText(instanceId)}),
    'quantity',quantity,'amount',CAST(stock_amount AS CHAR),
    'ledgerCount',(SELECT COUNT(*) FROM oa_consumable_ledger WHERE tenant_id=100000 AND consumable_id=${sqlText(materialId)}))
    FROM oa_consumable WHERE tenant_id=100000 AND consumable_id=${sqlText(materialId)}`)[0];
}

try {
  sessions = await openSessions(['admin1']);
  const fixture = await readFixture('oa08-live');
  const approval = fixture.scenarios?.approval;
  check('只恢复本轮已有耗材审批夹具', fixture.milestone === prefix && /^[1-9][0-9]*$/.test(approval?.requestId)
    && /^[1-9][0-9]*$/.test(approval?.materialId));
  requestId = approval.requestId;
  const request = requestState();
  instanceId = request?.instanceId;
  check('申请已绑定原真实流程且保留可恢复状态', /^[0-9a-f-]{36}$/.test(instanceId)
    && ['APPROVING', 'APPROVED'].includes(request.status));
  const instance = jsonRows(`SELECT JSON_OBJECT('status',status,'businessId',JSON_UNQUOTE(JSON_EXTRACT(variables,'$.businessId')),
    'businessType',JSON_UNQUOTE(JSON_EXTRACT(variables,'$.businessType')),
    'tokenPresent',JSON_CONTAINS_PATH(variables,'one','$.oaRequestToken'))
    FROM wf_process_instance WHERE tenant_id=100000 AND instance_id=${sqlText(instanceId)} AND deleted=0`)[0];
  check('原流程已有真实终审且持久化完整业务身份', instance?.status === 'PASSED'
    && instance.businessId === requestId && instance.businessType === 'OA_CONSUMABLE_REQUEST' && instance.tokenPresent === true);
  const before = facts(approval.materialId);
  check('原流程已有一次真实审批记录', before?.approvalCount === 1 && before.instanceCount === 1);
  if (request.status === 'APPROVING') {
    recovery = 'WAITING_FOR_DURABLE_DEAD_LETTER';
    const deadLetter = await until(() => jsonRows(`SELECT JSON_OBJECT('id',CAST(id AS CHAR),'status',status,'retryCount',retry_count,
      'missingOriginalToken',NOT JSON_CONTAINS_PATH(payload_json,'one','$.oaRequestToken')) FROM wf_callback_dead_letter
      WHERE tenant_id=100000 AND process_instance_id=${sqlText(instanceId)} AND business_type='OA_CONSUMABLE_REQUEST'
      AND business_id=${sqlText(requestId)}`)[0], row => row?.status === 'PENDING', '原失败消息经真实重领进入死信', 420000);
    check('原缺失令牌的失败消息由后台重试并持久化', deadLetter.retryCount >= 5
      && (deadLetter.missingOriginalToken === true || deadLetter.missingOriginalToken === 1));
    recovery = 'REPLAYING_BY_AUTHORIZED_API';
    success(await api(sessions.admin1.page, `/workflow/wf/callback/dlq/${deadLetter.id}/replay`, { method: 'POST' }), '真实管理员重放原失败回调');
    await until(() => requestState(), row => row?.status === 'APPROVED', '原申请审批结果正常回写', 90000);
    const persisted = jsonRows(`SELECT JSON_OBJECT('status',status) FROM wf_callback_dead_letter
      WHERE tenant_id=100000 AND id=${sqlText(deadLetter.id)}`)[0];
    check('原死信已记录真实管理重放', persisted?.status === 'REPLAYED');
  }
  const after = facts(approval.materialId);
  check('重放未新增审批实例或审批历史', after.approvalCount === before.approvalCount && after.instanceCount === before.instanceCount);
  check('批准回写不发料且不改变库存台账', after.quantity === before.quantity && after.amount === before.amount && after.ledgerCount === before.ledgerCount);
  const items = jsonRows(`SELECT JSON_OBJECT('applied',apply_quantity,'approved',approved_quantity,'issued',issued_quantity)
    FROM oa_consumable_request_item WHERE tenant_id=100000 AND request_id=${sqlText(requestId)}`);
  check('真实批准量已回写且没有提前发料', items.length > 0 && items.every(item => item.applied === item.approved && item.issued === 0));
  recovery = 'APPROVED_WITH_ORIGINAL_WORKFLOW';
  console.log(`PASS H原耗材回调恢复 ${checks.length} 项检查`);
} catch (error) {
  failure = error;
  console.log(JSON.stringify({ ...failureSummary(error), recovery }));
  process.exitCode = 1;
} finally {
  await saveResult('oa08-callback-recovery', failure, { recovery, requestId, instanceId,
    originalApprovalPreserved: recovery === 'APPROVED_WITH_ORIGINAL_WORKFLOW', directDatabaseWrites: false });
  await sessions?.browser.close();
}
