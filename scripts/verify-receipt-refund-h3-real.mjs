import assert from 'node:assert/strict';
import { verifySelectedReceiptRefundInterface } from './verify-receipt-refund-h3-ui.mjs';
import { prepareRefundApproval } from './refund-approval-h3-real.mjs';

export async function verifySelectedReceiptRefund(context) {
  const { admin, api, successful, session, database, check, caseTag, evidence, create, read, reject, today, adminId, employee, foreign, state } = context;
  const literal = value => `CONVERT(UNHEX('${Buffer.from(String(value)).toString('hex')}') USING utf8mb4)`;
  const rows = statement => database(statement).split('\n').filter(Boolean).map(value => JSON.parse(value));
  const waitFor = async (readValue, accepts, label) => {
    const deadline = Date.now() + 60000;
    do {
      const value = await readValue();
      if (accepts(value)) return value;
      await new Promise(resolve => setTimeout(resolve, 250));
    } while (Date.now() < deadline);
    throw new Error(label);
  };
  const { finance, reviewer, approved, complete, setWorkflowFixture } = await prepareRefundApproval({ ...context, verifyRefundReviewInterface: true });
  const sources = async (record, page = finance, query = '') => successful(await api(page, `/crm/approval/refund/${record.receivableId}/receipts${query}`), '财务读取真实逐笔原收款');
  const facts = record => rows(`SELECT JSON_OBJECT('id',event_id,'amount',amount,'teamVersion',team_version,'reversalOfId',reversal_of_id,'key',event_key,'snapshot',source_snapshot)
    FROM crm_deal_event WHERE tenant_id=100000 AND biz_type='RECEIVABLE' AND biz_id=${record.receivableId} ORDER BY event_id;`);
  const allocations = eventId => rows(`SELECT JSON_OBJECT('id',allocation_id,'user',sales_user_id,'amount',allocated_amount,'percentage',allocated_percentage,
    'commission',commission_amount,'status',commission_status,'changeId',comp_change_id,'original',reversal_of_id)
    FROM crm_deal_allocation WHERE tenant_id=100000 AND event_id=${eventId} ORDER BY sales_user_id;`);
  const salesId = Number(database("SELECT user_id FROM sys_user WHERE tenant_id=100000 AND user_name='g_opportunity_sales' AND deleted=0;"));
  const setTeam = async (record, version, ownerShare, sellerShare) => {
    assert.ok(Number.isInteger(version) && [ownerShare, sellerShare].every(value => /^0\.\d$/.test(value)));
    const team = successful(await api(admin, `/crm/deal-team/RECEIVABLE/${record.receivableId}`), '读取真实应收团队及版本');
    const saved = successful(await api(admin, `/crm/deal-team/RECEIVABLE/${record.receivableId}`, { method: 'PUT', body: {
      teamVersion: team.teamVersion, businessVersion: team.businessVersion, remark: `退款来源团队_${caseTag}_${version}`,
      members: [{ salesUserId: adminId, roleType: 'OWNER', allocatedPercentage: ownerShare },
        { salesUserId: salesId, roleType: 'CO_SELLER', allocatedPercentage: sellerShare }],
    } }), '通过真实管理接口设置不同历史分成');
    check(`真实团队接口建立第${version}版应收分成并由HR核验身份`, saved.teamVersion === version && saved.members.length === 2
      && Number(saved.members.find(value => value.salesUserId === adminId).allocatedPercentage) === Number(ownerShare));
  };
  const collect = async (record, amount) => {
    const current = await read(record.receivableId);
    successful(await api(admin, `/crm/receivable/${record.receivableId}/writeoff`, { method: 'POST', body: {
      version: current.version, amount, writeoffDate: today, remark: `本次真实收款_${caseTag}_${current.version}`,
    } }), '通过真实CRM接口登记逐笔收款');
    return read(record.receivableId);
  };
  const submit = async (record, receiptId, amount, changes = {}, page = finance) => successful(await api(page, '/crm/approval/refund', { method: 'POST', body: {
    receivableId: record.receivableId, receiptEventId: receiptId, version: (await read(record.receivableId)).version,
    refundAmount: amount, reason: `财务选择原收款_${caseTag}`, ...changes,
  } }), '财务通过真实接口选择原收款并提交退款审批');
  let record = await create('selected_refund', '100');
  await setTeam(record, 1, '0.6', '0.4');
  record = await collect(record, '30');
  const first = facts(record)[0];
  const invoiceNo = `H3_RF_${caseTag}`;
  successful(await api(admin, '/oa/invoice', { method: 'POST', body: { invoiceDirection: 'OUTPUT', invoiceCode: invoiceNo, invoiceNo,
    invoiceDate: today, grossAmount: '100', taxAmount: '0', buyerName: record.customerName } }), '创建真实退款联动销项发票');
  const invoiceId = Number(database(`SELECT invoice_id FROM oa_invoice WHERE tenant_id=100000 AND invoice_no=${literal(invoiceNo)} AND deleted=0;`));
  successful(await api(admin, `/crm/receivable/${record.receivableId}/bind-invoice/${invoiceId}`, { method: 'POST' }), '真实绑定已有30元到账的计划');
  await setTeam(record, 2, '0.2', '0.8');
  const invoice = async () => successful(await api(admin, `/oa/invoice/${invoiceId}`), '读取退款后的真实发票累计');
  successful(await api(admin, `/oa/invoice/${invoiceId}/writeoff`, { method: 'POST', body: { businessType: 'CRM_RECEIVABLE', businessId: record.receivableId,
    invoiceVersion: (await invoice()).version, writeoffAmount: '20', writeoffDate: today, remark: `退款第二笔来源_${caseTag}` } }), '通过真实发票入口登记另一版团队的20元收款');
  record = await read(record.receivableId);
  const second = facts(record)[1];
  const originalFacts = JSON.stringify(facts(record));
  const originalAllocations = JSON.stringify([allocations(first.id), allocations(second.id)]);
  check('真实30与20分开冻结，主责分配分别18和4，发票累计50', facts(record).length === 2 && Number(record.receivedAmount) === 50
    && first.teamVersion === 1 && second.teamVersion === 2 && allocations(first.id).find(value => value.user === adminId)?.amount === 18
    && allocations(second.id).find(value => value.user === adminId)?.amount === 4 && Number((await invoice()).receivedAmount) === 50);
  await setTeam(record, 3, '0.9', '0.1');
  record = await read(record.receivableId);
  const sourcePage = await sources(record, finance, '?pageNum=1&pageSize=1');
  const older = await sources(record, finance, '?pageNum=2&pageSize=1');
  check('财务来源分页可以明确选择每一笔原款且不泄露提成、员工薪酬和内部证据', sourcePage.receipts.total === 2
    && sourcePage.receipts.rows.length === 1 && sourcePage.receipts.rows[0].receiptEventId === second.id
    && older.receipts.rows[0].receiptEventId === first.id && Number(sourcePage.untrackedAmount) === 0
    && !/commission|employeeId|sourceSnapshot/.test(JSON.stringify(sourcePage)));
  const request = { receivableId: record.receivableId, receiptEventId: second.id, version: record.version, refundAmount: '5', reason: `验证_${caseTag}` };
  try {
    setWorkflowFixture(false);
    check('真实退款来源接口明确报告流程未配置可用', (await sources(record)).workflowConfigured === false);
    reject(await api(finance, '/crm/approval/refund', { method: 'POST', body: request }), '退款流程未配置时后台停止提交', /流程尚未配置|停用|模型/);
    check('流程缺失不留下待审批或提前扣款', (await sources(record)).pendingApprovalId == null && Number((await read(record.receivableId)).receivedAmount) === 50);
  } finally { setWorkflowFixture(true); }
  check('恢复已发布测试流程后明确报告可提交', (await sources(record)).workflowConfigured === true);
  for (const [label, changes] of [
    ['财务没有选择原收款不能退款', { receiptEventId: undefined }], ['财务旧版本不能退款', { version: 0 }],
    ['第二笔20不能借用第一笔余额退20.01', { refundAmount: '20.01' }], ['退款不能超过分精度', { refundAmount: '0.001' }],
  ]) reject(await api(finance, '/crm/approval/refund', { method: 'POST', body: { ...request, ...changes } }), label);
  for (const [requestPath, options] of [[`/crm/approval/refund/${record.receivableId}/receipts`, {}], ['/crm/approval/refund', { method: 'POST', body: request }]]) {
    const denied = await api(employee, requestPath, options);
    check('EMPLOYEE读取原款和提交退款都被真实权限拦截', denied.status === 403 && denied.body?.code === 403);
    reject(await api(foreign, requestPath, options), '跨租户无法读取或提交该原款退款');
  }
  const pending = await submit(record, second.id, '5');
  const pendingView = await sources(record);
  check('财务选择第二笔退5只创建待审批，累计仍50且不提前冲减', pendingView.pendingApprovalId === pending
    && Number((await read(record.receivableId)).receivedAmount) === 50 && facts(record).length === 2
    && approved(pending).payload.receiptEventId === second.id);
  reject(await api(finance, '/crm/approval/refund', { method: 'POST', body: { ...request, receiptEventId: first.id } }), '待审批时不能再提交另一笔退款', /待处理|重复|频繁/);
  const finished = await complete(pending);
  const reversal = facts(record).find(value => value.reversalOfId === second.id);
  check('真实工作流批准后只退所选第二笔5元，累计45，分配按旧版退1和4', reversal?.amount === -5
    && allocations(reversal.id).find(value => value.user === adminId)?.amount === -1
    && allocations(reversal.id).find(value => value.user === salesId)?.amount === -4
    && Number((await read(record.receivableId)).receivedAmount) === 45 && Number((await invoice()).receivedAmount) === 45);
  const beforeDuplicate = JSON.stringify(facts(record));
  await api(reviewer, '/workflow/wf/complete', { method: 'POST', body: { taskId: finished.taskId, action: 'APPROVE', comment: `重复_${caseTag}` } });
  check('真实重复审批不新增退款或改写累计', JSON.stringify(facts(record)) === beforeDuplicate && Number((await read(record.receivableId)).receivedAmount) === 45);
  const originalEnvelope = JSON.parse(database(`SELECT payload_json FROM outbox_event WHERE tenant_id=100000 AND aggregate_id=${invoiceId}
    AND event_type='INVOICE_RECEIVABLE_CHANGED' AND JSON_UNQUOTE(JSON_EXTRACT(JSON_UNQUOTE(JSON_EXTRACT(payload_json,'$.payload')),'$.operation'))='RECEIPT' ORDER BY id DESC LIMIT 1;`));
  const crmPort = state.services.find(service => service.name === 'crm').port;
  const replay = async () => {
    const response = await fetch(`http://127.0.0.1:${crmPort}/inner/crm/receivable/${record.receivableId}/invoice-status`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Inner-Call': 'true', 'X-From-Service': 'cloudflow-service-oa', 'X-Tenant-Id': '100000' },
      body: JSON.stringify({ eventId: originalEnvelope.eventId }), signal: AbortSignal.timeout(20000),
    });
    return { status: response.status, body: await response.json() };
  };
  successful(await replay(), '退款后通过真实内部HTTP重放原发票收款通知');
  check('旧收款通知不能把退款后的45覆盖成原50', Number((await read(record.receivableId)).receivedAmount) === 45
    && Number((await invoice()).receivedAmount) === 45 && JSON.stringify(facts(record)) === beforeDuplicate);
  const rest = await submit(record, second.id, '15');
  await complete(rest);
  const restView = await sources(record);
  check('同一来源两次部分退款累计20，第一笔30仍完整且第二笔可退为0', Number((await read(record.receivableId)).receivedAmount) === 30
    && Number((await invoice()).receivedAmount) === 30 && facts(record).filter(value => value.reversalOfId === second.id).length === 2
    && Number(restView.receipts.rows.find(value => value.receiptEventId === second.id).remainingAmount) === 0
    && Number(restView.receipts.rows.find(value => value.receiptEventId === first.id).remainingAmount) === 30);
  reject(await api(finance, '/crm/approval/refund', { method: 'POST', body: { ...request, version: (await read(record.receivableId)).version, refundAmount: '0.01' } }), '所选原款已退完不能借用另一笔余额');
  check('两次退款与后续团队调整均未改写任一原事实或原分配', JSON.stringify(facts(record).filter(value => value.reversalOfId === null)) === originalFacts
    && JSON.stringify([allocations(first.id), allocations(second.id)]) === originalAllocations);
  const rejected = await submit(record, first.id, '7'); await complete(rejected, 'REJECT');
  check('财务实际驳回不扣款，也不占用原款可退余额', facts(record).length === 4 && Number((await sources(record)).receivedAmount) === 30
    && (await sources(record)).pendingApprovalId == null);
  const ownerRejected = await submit(record, first.id, '7'); await complete(ownerRejected, 'REJECT', 'owner');
  check('客户负责人首审驳回同样不扣款，财务没有后续待办', Number((await read(record.receivableId)).receivedAmount) === 30
    && facts(record).length === 4 && (await sources(record)).pendingApprovalId == null);
  const concurrentBody = { ...request, receiptEventId: first.id, version: (await read(record.receivableId)).version, refundAmount: '2' };
  const concurrent = await Promise.all(['甲', '乙'].map(reason => api(finance, '/crm/approval/refund', { method: 'POST', body: { ...concurrentBody, reason: `${reason}_${caseTag}` } })));
  check('不同内容的两笔真实并发退款申请只有一单成功', concurrent.filter(value => value.status === 200 && value.body?.code === 200).length === 1);
  await complete((await sources(record)).pendingApprovalId);
  check('并发申请最终仅实际退2，累计28且未产生工资付款', Number((await read(record.receivableId)).receivedAmount) === 28
    && facts(record).filter(value => value.reversalOfId === first.id).length === 1
    && facts(record).every(value => allocations(value.id).every(allocation => allocation.status === 'UNCONFIRMED' && allocation.changeId === null)));
  evidence.business = true; evidence.permissions = true; evidence.concurrency = true; evidence.receiptLedger = true;
  evidence.teamSetup = 'real_http'; evidence.salaryPosting = false; evidence.invoiceReceiptAfterRefundReplay = true;
  const uiRecord = await create('refund_interface', '100');
  for (let index = 0; index < 11; index++) await collect(uiRecord, '1');
  await verifySelectedReceiptRefundInterface({ ...context, finance, uiRecord, sources, submit, complete, collect, facts, setWorkflowFixture });
}
