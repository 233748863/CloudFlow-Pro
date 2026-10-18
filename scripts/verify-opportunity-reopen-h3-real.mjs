import assert from 'node:assert/strict';
import { verifyOpportunityReopenInterface } from './verify-opportunity-reopen-h3-ui.mjs';

export async function verifyOpportunityReopen(context) {
  const { admin, sales, manager, employee, foreign, api, successful, database, check, caseTag, evidence,
    createCustomer, createOpportunity, edit, detail, adminId, salesId, managerId, rule, saveRule, waitFor, quote } = context;
  const endpoint = id => `/crm/opportunity/${id}/stage-reopen`;
  const inspect = async (id, page = admin) => successful(await api(page, endpoint(id)), '真实只读核对商机恢复条件');
  const request = (business, reason = `H3_REOPEN_${caseTag}_重新确认预算`, changes = {}) => ({ version: business.version, targetStage: 'QUALIFIED', reason, ...changes });
  const reopen = async (business, page = admin, reason) => successful(await api(page, endpoint(business.opportunityId), { method: 'POST', body: request(business, reason) }), '真实恢复进行中并冲减原赢单');
  const rejected = (result, label, pattern) => {
    const message = result.body?.msg || result.body?.message || '';
    check(`${label} HTTP=${result.status} code=${result.body?.code} message=${message}`,
      ([400, 403, 404, 409].includes(result.status) || result.status === 200 && result.body?.code === 500)
      && result.body?.code !== 200 && (!pattern || pattern.test(message)));
  };
  const forbidden = (result, label) => check(`${label} HTTP=${result.status} code=${result.body?.code}`, result.status === 403 && result.body?.code === 403);
  const rows = statement => database(statement).split('\n').filter(Boolean).map(value => JSON.parse(value));
  const originalAllocations = eventId => database(`SELECT JSON_OBJECT('id',allocation_id,'user',sales_user_id,'employee',employee_id,'dept',dept_id,
    'role',role_type,'percentage',allocated_percentage,'amount',allocated_amount,'commission',commission_amount,'status',commission_status)
    FROM crm_deal_allocation WHERE tenant_id=100000 AND event_id=${eventId} ORDER BY allocation_id;`);
  const historyCount = id => Number(database(`SELECT COUNT(*) FROM crm_opportunity_stage_history WHERE tenant_id=100000 AND opportunity_id=${id};`));
  const balance = id => database(`SELECT COALESCE(SUM(amount),0) FROM crm_deal_event WHERE tenant_id=100000 AND biz_type='OPPORTUNITY' AND biz_id=${id};`);
  const team = async id => successful(await api(admin, `/crm/deal-team/OPPORTUNITY/${id}`), '读取真实商机团队');
  const saveTeam = async (id, ownerShare = '0.6000', otherShare = '0.4000') => {
    const current = await team(id);
    return successful(await api(admin, `/crm/deal-team/OPPORTUNITY/${id}`, { method: 'PUT', body: {
      businessVersion: current.businessVersion, teamVersion: current.teamVersion, remark: `H3_REOPEN_TEAM_${caseTag}_${ownerShare}`,
      members: [{ salesUserId: salesId, roleType: 'OWNER', allocatedPercentage: ownerShare }, { salesUserId: adminId, roleType: 'CO_SELLER', allocatedPercentage: otherShare }],
    } }), '真实调整商机未来分成团队');
  };
  const customerId = await createCustomer('reopen_customer');
  const won = async suffix => {
    let business = await createOpportunity(`reopen_${suffix}`, customerId);
    business = await edit(business, { expectedAmount: '100.01' });
    await saveTeam(business.opportunityId);
    business = await detail(business.opportunityId);
    successful(await api(sales, `/crm/opportunity/${business.opportunityId}/win`, { method: 'POST', body: { version: business.version } }), '真实赢单形成冻结业绩');
    return detail(business.opportunityId);
  };
  await saveRule('QUALIFIED', { requiredFields: [], requiredActivityFlag: 0, defaultWinRate: '0.3000', status: 'ACTIVE' });
  let main = await won('primary');
  const initial = await inspect(main.opportunityId);
  check('恢复核对返回真实100.01元原赢单及60/40成员，不采用客户端证明', initial.allowed && initial.stage === 'WON' && initial.shares.length === 2
    && Number(initial.amount) === 100.01 && Number(initial.shares.find(share => share.userId === salesId).percentage) === 0.6);
  const frozen = originalAllocations(initial.winningEventId);
  const firstHistoryCount = historyCount(main.opportunityId);
  await inspect(main.opportunityId);
  check('只读核对不写商机版本、历史或业绩', (await detail(main.opportunityId)).version === main.version
    && historyCount(main.opportunityId) === firstHistoryCount && originalAllocations(initial.winningEventId) === frozen);
  for (const [page, label] of [[employee, '员工'], [sales, '销售代表']]) {
    forbidden(await api(page, endpoint(main.opportunityId)), `${label}不能读取专用恢复核对入口`);
    forbidden(await api(page, endpoint(main.opportunityId), { method: 'POST', body: request(main) }), `${label}不能借商机编辑权限执行恢复`);
  }
  rejected(await api(foreign, endpoint(main.opportunityId)), '跨租户账号不能读取原赢单凭据');
  rejected(await api(foreign, endpoint(main.opportunityId), { method: 'POST', body: request(main) }), '跨租户账号不能恢复商机');
  check('获批销售主管能够核对范围内商机', (await inspect(main.opportunityId, manager)).allowed);
  for (const [label, changes, pattern] of [
    ['空原因拒绝', { reason: '   ' }, /原因|不能为空/],
    ['超过1000字符原因拒绝', { reason: '实'.repeat(1001) }, /原因|1000/],
    ['缺少版本拒绝', { version: null }, /版本/],
    ['旧版本拒绝', { version: main.version - 1 }, /版本|刷新/],
    ['赢单不能作为恢复目标', { targetStage: 'WON' }, /进行中|阶段/],
    ['丢单不能作为恢复目标', { targetStage: 'LOST' }, /进行中|阶段/],
    ['不存在的阶段拒绝', { targetStage: 'REOPEN_UNKNOWN' }, /阶段|不存在/],
    ['客户端不能指定租户', { tenantId: 100001 }, /字段|参数|解析|格式/],
    ['客户端不能上传冲正证明', { financialProof: { reversed: true } }, /字段|参数|解析|格式/],
  ]) rejected(await api(admin, endpoint(main.opportunityId), { method: 'POST', body: request(main, `边界_${caseTag}_${label}`, changes) }), label, pattern);
  await saveRule('QUALIFIED', { status: 'DISABLED' });
  rejected(await api(admin, endpoint(main.opportunityId), { method: 'POST', body: request(main, `停用阶段_${caseTag}`) }), '停用目标阶段不能恢复', /阶段|停用/);
  await saveRule('QUALIFIED', { status: 'ACTIVE', requiredFields: ['remark'] });
  rejected(await api(admin, endpoint(main.opportunityId), { method: 'POST', body: request(main, `缺少目标必填_${caseTag}`) }), '恢复遵守目标阶段真实必填条件', /备注|remark|必填/);
  await saveRule('QUALIFIED', { requiredFields: [] });
  check('所有非法恢复均保持原终态、版本和冻结记录', (await detail(main.opportunityId)).version === main.version
    && historyCount(main.opportunityId) === firstHistoryCount && originalAllocations(initial.winningEventId) === frozen && Number(balance(main.opportunityId)) === 100.01);
  await saveTeam(main.opportunityId, '0.3000', '0.7000');
  main = await detail(main.opportunityId);
  const withFutureTeam = await inspect(main.opportunityId);
  check('赢单后团队改为30/70，恢复仍使用原60/40冻结版本', withFutureTeam.teamVersion === initial.teamVersion
    && Number(withFutureTeam.shares.find(share => share.userId === salesId).percentage) === 0.6 && originalAllocations(initial.winningEventId) === frozen);
  const analysis = async () => successful(await api(admin, `/crm/opportunity/stage-analysis?currency=CNY&ownerId=${salesId}`), '真实读取赢单统计');
  const wonCount = value => value.stages.find(stage => stage.stage === 'WON').wonCount;
  const beforeAnalysis = await analysis();
  const receipt = await reopen(main, manager);
  const restored = await detail(main.opportunityId);
  check('销售主管恢复产生真实历史回执，版本只增加一次', receipt.originalVersion === main.version && receipt.version === main.version + 1
    && receipt.operatorId === managerId && receipt.fromStage === 'WON' && receipt.targetStage === 'QUALIFIED' && receipt.originalEventId === initial.winningEventId);
  check('恢复同步打开业务并采用目标阶段30%赢率', restored.stage === 'QUALIFIED' && restored.status === 'OPEN'
    && restored.lastStage === 'WON' && Number(restored.winRate) === 30 && Number(restored.weightedAmount) === 30);
  check('原赢单每名成员按原员工、部门、角色及比例精确反向冲减', database(`SELECT COUNT(*) FROM crm_deal_allocation reversal
    JOIN crm_deal_allocation original ON original.allocation_id=reversal.reversal_of_id AND original.tenant_id=reversal.tenant_id
    WHERE reversal.tenant_id=100000 AND reversal.event_id=${receipt.reversalEventId} AND original.event_id=${initial.winningEventId}
    AND reversal.sales_user_id=original.sales_user_id AND reversal.employee_id=original.employee_id AND reversal.dept_id=original.dept_id
    AND reversal.role_type=original.role_type AND reversal.allocated_percentage=original.allocated_percentage
    AND reversal.allocated_amount=-original.allocated_amount AND reversal.commission_amount IS NULL;`) === '2'
    && Number(balance(main.opportunityId)) === 0 && originalAllocations(initial.winningEventId) === frozen);
  check('真实阶段分析赢单数量同步扣回一次', wonCount(await analysis()) === wonCount(beforeAnalysis) - 1);
  rejected(await api(admin, endpoint(main.opportunityId), { method: 'POST', body: request(main) }), '重复原版本恢复不重复冲减', /版本|刷新|重复|频繁/);
  rejected(await api(admin, endpoint(main.opportunityId), { method: 'POST', body: request(restored, `进行中拒绝_${caseTag}`) }), '进行中商机不能重复恢复', /赢单|丢单|结案|进行中/);
  const inspectedAgain = await inspect(main.opportunityId);
  check('只读核对保留成功回执且重复请求没有第二条恢复历史', inspectedAgain.lastReopen.historyId === receipt.historyId
    && historyCount(main.opportunityId) === firstHistoryCount + 1 && originalAllocations(initial.winningEventId) === frozen);
  const competing = await won('competing');
  const competingBefore = historyCount(competing.opportunityId);
  const outcomes = await Promise.all(['甲', '乙'].map(suffix => api(admin, endpoint(competing.opportunityId), {
    method: 'POST', body: request(competing, `同版本并发_${caseTag}_${suffix}`),
  })));
  check('两个真实HTTP同版本竞争只成功一次', outcomes.filter(result => result.status === 200 && result.body?.code === 200).length === 1);
  check('竞争只产生一条历史和一笔冲减', historyCount(competing.opportunityId) === competingBefore + 1
    && Number(balance(competing.opportunityId)) === 0 && (await detail(competing.opportunityId)).version === competing.version + 1);
  evidence.permissions = true; evidence.concurrency = true; evidence.originalAllocations = true; evidence.wonCountReversed = true;
  await lostWorkflow();
  const financial = await financialConditions();
  const uiBusiness = await won('ui');
  await saveTeam(uiBusiness.opportunityId, '0.5000', '0.5000');
  await verifyOpportunityReopenInterface({ ...context, business: await detail(uiBusiness.opportunityId), blockedBusiness: financial,
    inspect, endpoint, request, won, saveTeam, historyCount, originalAllocations });
  evidence.business = true;

  async function completeWorkflow(instanceId, page, label) {
    for (let step = 0; step < 20; step++) {
      const state = await waitFor(() => {
        const status = database(`SELECT status FROM wf_process_instance WHERE tenant_id=100000 AND instance_id=${quote(instanceId)};`);
        if (['PASSED', 'AUTO_PASSED'].includes(status)) return { complete: true };
        const task = rows(`SELECT JSON_OBJECT('id',task_id,'assignee',assignee) FROM wf_task WHERE tenant_id=100000 AND instance_id=${quote(instanceId)} AND status='TODO' ORDER BY task_id LIMIT 1;`)[0];
        return task && { complete: false, task };
      }, Boolean, `${label}没有真实审批任务或通过状态`);
      if (state.complete) return;
      check(`${label}真实任务有指定审批人`, state.task.assignee != null);
      successful(await api(page, '/workflow/wf/complete', { method: 'POST', body: { taskId: state.task.id, action: 'APPROVE', comment: `H3恢复专项_${caseTag}_${label}` } }), `实际办理${label}`);
    }
    throw new Error(`${label}超过既有验证的20个节点`);
  }

  async function lostWorkflow() {
    const business = await createOpportunity('reopen_lost', customerId);
    const reasonId = Number(database("SELECT MIN(reason_id) FROM crm_lost_reason WHERE tenant_id=100000 AND deleted=0 AND status='ACTIVE';"));
    assert.ok(Number.isSafeInteger(reasonId) && reasonId > 0);
    const reason = `客户延期原丢单说明_${caseTag}`;
    const approvalId = successful(await api(sales, '/crm/approval/opportunity-downgrade', { method: 'POST', body: {
      opportunityId: business.opportunityId, version: business.version, action: 'CLOSE', lostReason: reason,
      reasons: [{ reasonId, isPrimary: true, amountLost: '420000.00', remark: `保留原细项_${caseTag}` }],
    } }), '真实提交丢单审批');
    const instanceId = await waitFor(() => database(`SELECT COALESCE(instance_id,'') FROM crm_approval WHERE tenant_id=100000 AND approval_id=${approvalId};`), Boolean, '丢单审批未绑定真实实例');
    await completeWorkflow(instanceId, manager, '丢单审批');
    const lost = await waitFor(() => detail(business.opportunityId), value => value.stage === 'LOST' && value.status === 'CLOSED', '真实审批回调未完成丢单');
    check('丢单审批回写保留真实结构化主因', database(`SELECT COUNT(*) FROM crm_opportunity_lost_detail WHERE tenant_id=100000 AND opportunity_id=${lost.opportunityId} AND lost_reason_id=${reasonId} AND is_primary_flag=1 AND deleted=0;`) === '1');
    const reopened = await reopen(lost, manager, `客户重新启动_${caseTag}`);
    const snapshot = JSON.parse(database(`SELECT snapshot FROM crm_opportunity_stage_history WHERE tenant_id=100000 AND history_id=${reopened.historyId};`));
    check('丢单恢复清除当前原因并在真实历史完整保留原说明和主因', (await detail(lost.opportunityId)).lostReason == null
      && snapshot.reopen.originalLostReason === reason && snapshot.reopen.originalLostDetails.some(value => value.lostReasonId === reasonId && value.isPrimaryFlag === 1));
    check('丢单恢复不凭空制造赢单或冲减事实', database(`SELECT COUNT(*) FROM crm_deal_event WHERE tenant_id=100000 AND biz_type='OPPORTUNITY' AND biz_id=${lost.opportunityId};`) === '0');
    evidence.workflow = true; evidence.lostHistory = true;
  }

  async function financialConditions() {
    const today = database('SELECT CURRENT_DATE;');
    const yesterday = database('SELECT DATE_SUB(CURRENT_DATE,INTERVAL 1 DAY);');
    const endDate = database('SELECT DATE_ADD(CURRENT_DATE,INTERVAL 1 MONTH);');
    const createContract = async (business, suffix) => {
      const name = `H3_REOPEN_${caseTag}_${suffix}`;
      const body = { contractNo: name, contractName: name, counterpartyName: business.customerName, customerId: business.customerId,
        customerName: business.customerName, contractType: 'SALES', amount: '100.01', currency: 'CNY', ownerId: adminId, startDate: today, endDate,
        sourceType: 'CRM_OPPORTUNITY', sourceId: business.opportunityId, sourceVersion: business.version };
      const id = successful(await api(admin, '/oa/contract', { method: 'POST', body }), '从真实赢单商机创建关联合同草稿');
      assert.ok(Number.isSafeInteger(id) && id > 0);
      return { id, body };
    };
    const draftBusiness = await won('draft');
    const automaticDraft = await inspect(draftBusiness.opportunityId);
    check('真实赢单入口自动生成一份未确认合同草稿', automaticDraft.allowed && automaticDraft.retainedContracts === 1);
    const draft = await createContract(draftBusiness, 'draft_contract');
    const withDraft = await inspect(draftBusiness.opportunityId);
    check(`真实自动草稿及另建草稿均不阻断，保留两份合同；allowed=${withDraft.allowed}；contracts=${withDraft.retainedContracts}；blockers=${withDraft.blockers.join('；')}`,
      withDraft.allowed && withDraft.retainedContracts === 2);
    await reopen(draftBusiness);
    check('恢复保留合同草稿和来源，不自动取消或删除', database(`SELECT COUNT(*) FROM oa_contract WHERE tenant_id=100000 AND contract_id=${draft.id} AND status='DRAFT' AND deleted=0 AND source_id=${draftBusiness.opportunityId};`) === '1');
    rejected(await api(admin, '/oa/contract', { method: 'POST', body: { ...draft.body, contractNo: `${draft.body.contractNo}_late`, contractName: `${draft.body.contractName}_late` } }), '恢复后迟到的旧赢单建合同请求被真实OA拒绝', /商机|恢复|改变|来源/);
    check('迟到建合同请求不增加已有两份合同', database(`SELECT COUNT(*) FROM oa_contract WHERE tenant_id=100000 AND source_type='CRM_OPPORTUNITY' AND source_id=${draftBusiness.opportunityId};`) === '2');
    const cashBusiness = await won('cash');
    const cashContract = await createContract(cashBusiness, 'cash_contract');
    const planName = `H3_REOPEN_${caseTag}_cash_plan`;
    successful(await api(admin, '/crm/receivable', { method: 'POST', body: { receivableNo: planName, receivableName: planName,
      customerId, contractId: cashContract.id, plannedAmount: '100.01', ownerId: adminId } }), '为真实关联合同建立回款计划');
    const planId = Number(database(`SELECT receivable_id FROM crm_receivable WHERE tenant_id=100000 AND receivable_no=${quote(planName)};`));
    assert.ok(Number.isSafeInteger(planId) && planId > 0);
    const plan = successful(await api(admin, `/crm/receivable/${planId}`), '读取实际收款前版本');
    successful(await api(admin, `/crm/receivable/${planId}/writeoff`, { method: 'POST', body: { version: plan.version, amount: '30.00', writeoffDate: today, remark: `真实到账_${caseTag}` } }), '通过真实CRM入口登记30元到账');
    const cashView = await inspect(cashBusiness.opportunityId);
    check('真实30元到账使恢复核对明确阻断', !cashView.allowed && cashView.blockers.some(message => /到账|原收款/.test(message)));
    rejected(await api(admin, endpoint(cashBusiness.opportunityId), { method: 'POST', body: request(cashBusiness) }), '真实到账未退款时不能恢复', /到账|原收款/);
    check('阻断保留30元到账及100.01元赢单原账', database(`SELECT received_amount FROM crm_receivable WHERE tenant_id=100000 AND receivable_id=${planId};`) === '30.00'
      && Number(balance(cashBusiness.opportunityId)) === 100.01 && (await detail(cashBusiness.opportunityId)).stage === 'WON');
    const signedBusiness = await won('signed');
    const signedContract = await createContract(signedBusiness, 'signed_contract');
    successful(await api(admin, `/oa/contract/submit/${signedContract.id}`, { method: 'POST' }), '真实提交关联合同审批');
    const instanceId = await waitFor(() => database(`SELECT COALESCE(instance_id,'') FROM oa_contract WHERE tenant_id=100000 AND contract_id=${signedContract.id};`), Boolean, '合同审批未绑定真实实例');
    await completeWorkflow(instanceId, admin, '关联合同审批');
    await waitFor(() => database(`SELECT status FROM oa_contract WHERE tenant_id=100000 AND contract_id=${signedContract.id};`), value => value === 'APPROVED', '合同真实审批回调未通过');
    const content = Buffer.from(`%PDF-1.4\nH3 isolated reopen contract ${signedContract.id}\n%%EOF\n`);
    const uploaded = successful(await api(admin, `/oa/contract/${signedContract.id}/signed-file`, { method: 'POST',
      file: { name: `reopen-${caseTag}.pdf`, type: 'application/pdf', content: content.toString('base64') } }), '真实上传内部签署依据');
    successful(await api(admin, `/oa/contract/${signedContract.id}/sign`, { method: 'POST', body: { signMethod: 'SCAN', counterpartySignee: '隔离恢复核验签署人',
      counterpartySignTime: `${yesterday} 12:00:00`, signedFileUrl: uploaded.reference, signRemark: `H3_REOPEN_${caseTag}` } }), '真实确认双方签署并到达合同开始日期');
    const confirmed = await waitFor(() => inspect(signedBusiness.opportunityId), value => !value.allowed, '签署后未阻断恢复');
    check('已审批且双方签署的到日合同阻断恢复，含待同步来源', confirmed.blockers.some(message => /合同|签署|业绩/.test(message)));
    rejected(await api(admin, endpoint(signedBusiness.opportunityId), { method: 'POST', body: request(signedBusiness) }), '已确认合同未冲正不能通过恢复撤销原赢单', /合同|业绩|冲正/);
    await waitFor(() => database(`SELECT COUNT(*) FROM crm_deal_event WHERE tenant_id=100000 AND biz_type='CONTRACT' AND biz_id=${signedContract.id} AND amount=100.01;`), value => value === '1', '合同持久来源未被CRM消费');
    check('真实合同业绩同步后继续阻断且原赢单保持不变', !(await inspect(signedBusiness.opportunityId)).allowed && Number(balance(signedBusiness.opportunityId)) === 100.01);
    evidence.contractSources = true; evidence.receipts = true; evidence.lateContractRequestRejected = true;
    return cashBusiness;
  }
}
