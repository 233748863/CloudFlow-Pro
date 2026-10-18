import assert from 'node:assert/strict';
import { completeWithHandoverRecovery } from './verify-handover-recovery-h3-real.mjs';

export async function verifyHandoverFromHr(context) {
  const { admin, employee, foreign, api, successful, database, check, caseTag, evidence, literal, adminId, salesId, managerId,
    member, readTeam, saveTeam, createCustomer, createQuote, createOpportunity, readQuote, forbidden, reject } = context;
  const donorName = `g_h3_left_${caseTag}`;
  const donorId = Number(database(`INSERT INTO sys_user(tenant_id,dept_id,user_name,nick_name,password,status,deleted,pwd_reset_required,create_by,remark) VALUES (100000,100,${literal(donorName)},'交接验收原负责人','','0',0,'0','isolated-h3','仅隔离身份主数据，无登录密码'); SELECT LAST_INSERT_ID();`));
  const employeeId = Number(database(`INSERT INTO hr_employee(tenant_id,employee_no,name,gender,dept_id,user_id,employee_status) VALUES (100000,${literal(donorName)},'交接验收原负责人','MALE',100,${donorId},'REGULAR'); SELECT LAST_INSERT_ID();`));
  assert.ok(Number.isSafeInteger(donorId) && donorId > 0 && Number.isSafeInteger(employeeId) && employeeId > 0);
  const customerId = await createCustomer('handover_customer', donorId);
  const opportunity = await createOpportunity('handover_opportunity', customerId, donorId);
  const quote = await createQuote('handover_quote', customerId, donorId);
  const defaultQuote = await createQuote('handover_default', customerId, donorId);
  const raceQuote = await createQuote('handover_race', customerId, donorId);
  const changedQuote = await createQuote('handover_changed', customerId, donorId);
  const terminalQuote = await createQuote('handover_terminal', customerId, donorId);
  successful(await api(admin, `/crm/quote/${terminalQuote.quoteId}/expire`, { method: 'POST' }), '真实关闭不参与交接的报价');
  const group = [member(donorId, 'OWNER', '0.5'), member(salesId, 'CO_SELLER', '0.3'), member(adminId, 'SUPPORT', '0.2')];
  const originalQuoteTeam = await saveTeam('QUOTE', quote.quoteId, await readTeam('QUOTE', quote.quoteId), group);
  const originalOpportunityTeam = await saveTeam('OPPORTUNITY', opportunity.opportunityId, await readTeam('OPPORTUNITY', opportunity.opportunityId), group);
  await saveTeam('QUOTE', raceQuote.quoteId, await readTeam('QUOTE', raceQuote.quoteId), group);
  await saveTeam('QUOTE', changedQuote.quoteId, await readTeam('QUOTE', changedQuote.quoteId), group);
  const historical = await createOpportunity('handover_won_history', customerId, adminId);
  const historicalTeam = await saveTeam('OPPORTUNITY', historical.opportunityId, await readTeam('OPPORTUNITY', historical.opportunityId),
    [member(adminId, 'OWNER', '0.5'), member(donorId, 'CO_SELLER', '0.3'), member(salesId, 'SUPPORT', '0.2')]);
  successful(await api(admin, `/crm/opportunity/${historical.opportunityId}/win`, { method: 'POST', body: { version: historicalTeam.businessVersion } }), '交接前真实赢单冻结历史业绩');
  const frozen = () => database(`SELECT JSON_OBJECT('event',event_id,'user',sales_user_id,'dept',dept_id,'ratio',allocated_percentage,'amount',allocated_amount) FROM crm_deal_allocation WHERE tenant_id=100000 AND event_id IN (SELECT event_id FROM crm_deal_event WHERE tenant_id=100000 AND biz_type='OPPORTUNITY' AND biz_id=${historical.opportunityId}) ORDER BY allocation_id;`);
  const frozenBefore = frozen();
  assert.ok(frozenBefore.length > 0);
  const receivableName = `H3_QH_${caseTag}_handover_receivable`;
  successful(await api(admin, '/crm/receivable', { method: 'POST', body: { customerId, receivableName, ownerId: donorId, plannedAmount: '100.01', dueDate: database('SELECT CURRENT_DATE;') } }), '真实创建待交接应收');
  const receivableId = Number(database(`SELECT receivable_id FROM crm_receivable WHERE tenant_id=100000 AND receivable_name=${literal(receivableName)} AND deleted=0;`));
  assert.ok(Number.isSafeInteger(receivableId) && receivableId > 0);
  const applicationId = successful(await api(admin, '/hr/lifecycle/applications', { method: 'POST', body: {
    applicationNo: `H3_QH_${caseTag}_leave`, type: 'RESIGNATION', employeeId, effectiveDate: database('SELECT CURRENT_DATE;'), status: 'DRAFT', remark: '隔离真实离职，无指定接任人，须生成待交接任务',
  } }), '真实HR离职申请');
  assert.ok(Number(applicationId) > 0);
  for (const action of ['submit', 'approve']) successful(await api(admin, `/hr/lifecycle/applications/${applicationId}/${action}`, { method: 'POST' }), `真实HR离职${action}`);
  const lifecycleTasks = successful(await api(admin, `/hr/lifecycle/applications/${applicationId}/tasks`), '读取真实离职任务');
  for (const task of lifecycleTasks) successful(await api(admin, `/hr/lifecycle/tasks/${task.id}/complete`, { method: 'POST', body: { remark: '隔离测试完成实际任务入口' } }), '真实离职任务完成');
  const approvedApplication = successful(await api(admin, `/hr/lifecycle/applications/${applicationId}`), '完成前核对真实离职申请');
  const verifyRecovery = await completeWithHandoverRecovery({ ...context, donorId }, async () => {
    successful(await api(admin, `/hr/lifecycle/applications/${applicationId}/complete`, { method: 'POST', body: { version: approvedApplication.version } }), '真实HR离职完成并发布事件');
  });
  check('HR完成离职后真实禁用原负责人账号', database(`SELECT status FROM sys_user WHERE tenant_id=100000 AND user_id=${donorId};`) === '1');
  const pending = async (page = admin) => successful(await api(page, `/crm/handover-task/pending?fromOwnerId=${donorId}`), '读取真实交接待办');
  const expected = [['CRM_CUSTOMER', customerId], ['CRM_OPPORTUNITY', opportunity.opportunityId], ['CRM_QUOTE', quote.quoteId], ['CRM_QUOTE', defaultQuote.quoteId], ['CRM_QUOTE', raceQuote.quoteId], ['CRM_QUOTE', changedQuote.quoteId], ['CRM_RECEIVABLE', receivableId]];
  let tasks = [];
  const deadline = Date.now() + 90000;
  do {
    tasks = await pending();
    if (expected.every(([type, id]) => tasks.some(task => task.businessType === type && task.businessId === id))) break;
    await new Promise(resolve => setTimeout(resolve, 500));
  } while (Date.now() < deadline);
  check('真实HR事件经认证及CRM消费产生全部七条交接待办', expected.every(([type, id]) => tasks.filter(task => task.businessType === type && task.businessId === id).length === 1));
  check('重复离职来源没有生成重复待办，终态业务不入待办', tasks.length === expected.length && tasks.every(task => !(task.businessType === 'CRM_OPPORTUNITY' && task.businessId === historical.opportunityId)
    && !(task.businessType === 'CRM_QUOTE' && task.businessId === terminalQuote.quoteId)));
  await verifyRecovery();
  const taskFor = (type, id) => tasks.find(task => task.businessType === type && task.businessId === id);
  const reassign = (task, toOwnerId, suffix, page = admin) => api(page, `/crm/handover-task/${task.handoverId}/reassign`, { method: 'POST', body: { toOwnerId, toOwnerName: '伪造交接姓名', remark: `${caseTag}_${suffix}` } });
  const quoteTask = taskFor('CRM_QUOTE', quote.quoteId);
  forbidden(await api(employee, `/crm/handover-task/pending?fromOwnerId=${donorId}`), '员工无交接任务读取权限');
  forbidden(await reassign(quoteTask, salesId, 'employee', employee), '员工不能指派交接');
  forbidden(await api(employee, `/crm/handover-task/${quoteTask.handoverId}/close`, { method: 'POST', body: { remark: `${caseTag}_employee_close` } }), '员工不能关闭交接');
  check('外租户看不到任何原负责人的交接待办', (await pending(foreign)).length === 0);
  reject(await reassign(quoteTask, salesId, 'foreign', foreign), '外租户不能按ID指派交接');
  reject(await api(foreign, `/crm/handover-task/${quoteTask.handoverId}/close`, { method: 'POST', body: { remark: `${caseTag}_foreign_close` } }), '外租户关闭交接返回明确拒绝且不暴露任务', /handover task not found/);
  reject(await reassign(quoteTask, donorId, 'same'), '接任人不能仍为原负责人', /接任人不能与原负责人相同/);
  reject(await reassign(quoteTask, 990007003, 'missing'), '没有真实有效HR身份不能接任', /成员|员工|人员|不存在|有效/);
  successful(await reassign(quoteTask, salesId, 'quote'), '真实手工交接报价');
  const transferredQuote = await readTeam('QUOTE', quote.quoteId);
  const merged = transferredQuote.members.find(value => value.salesUserId === salesId);
  const third = transferredQuote.members.find(value => value.salesUserId === adminId);
  check('接任人已在团队时原50%与原30%合并为唯一主责80%，第三人20%不变', transferredQuote.teamVersion === originalQuoteTeam.teamVersion + 1
    && transferredQuote.businessVersion === originalQuoteTeam.businessVersion + 1 && transferredQuote.ownerId === salesId && transferredQuote.members.length === 2
    && transferredQuote.members.filter(value => value.roleType === 'OWNER').length === 1 && merged.roleType === 'OWNER' && Number(merged.allocatedPercentage) === 0.8
    && third.roleType === 'SUPPORT' && Number(third.allocatedPercentage) === 0.2 && !transferredQuote.members.some(value => value.salesUserId === donorId));
  check('报价交接的真实业务主责姓名与任务姓名均来自HR', (await readQuote(quote.quoteId)).ownerName === '商机验收销售'
    && database(`SELECT COUNT(*) FROM crm_handover_task WHERE tenant_id=100000 AND handover_id=${quoteTask.handoverId} AND status='REASSIGNED' AND to_owner_id=${salesId} AND to_owner_name='商机验收销售';`) === '1');
  const oldQuote = await readTeam('QUOTE', quote.quoteId, admin, originalQuoteTeam.teamVersion);
  check('交接后的报价历史版本保留原50%/30%/20%三人比例及金额', oldQuote.historical && oldQuote.members.length === 3
    && oldQuote.members.every(value => { const original = originalQuoteTeam.members.find(previous => previous.salesUserId === value.salesUserId); return original && Number(original.allocatedPercentage) === Number(value.allocatedPercentage) && Number(original.allocatedAmount) === Number(value.allocatedAmount); }));
  reject(await reassign(quoteTask, managerId, 'again'), '已指派任务不能再次交接', /only pending handover task/);
  reject(await api(admin, `/crm/handover-task/${quoteTask.handoverId}/close`, { method: 'POST', body: { remark: `${caseTag}_close_reassigned` } }), '已指派任务关闭时返回可处理的业务拒绝', /只能关闭待处理交接任务/);
  check('关闭已指派任务失败后保留交接状态及业务主责', database(`SELECT status FROM crm_handover_task WHERE tenant_id=100000 AND handover_id=${quoteTask.handoverId};`) === 'REASSIGNED'
    && (await readQuote(quote.quoteId)).ownerId === salesId && (await readTeam('QUOTE', quote.quoteId)).teamVersion === transferredQuote.teamVersion);
  successful(await reassign(taskFor('CRM_OPPORTUNITY', opportunity.opportunityId), salesId, 'opportunity'), '真实手工交接商机');
  const transferredOpportunity = await readTeam('OPPORTUNITY', opportunity.opportunityId);
  check('真实商机交接同样合并80%并只创建一组版本', transferredOpportunity.ownerId === salesId && transferredOpportunity.teamVersion === originalOpportunityTeam.teamVersion + 1
    && Number(transferredOpportunity.members.find(value => value.salesUserId === salesId).allocatedPercentage) === 0.8);
  successful(await reassign(taskFor('CRM_QUOTE', defaultQuote.quoteId), managerId, 'new_receiver'), '不在团队的接任人接管默认报价');
  const defaultTeam = await readTeam('QUOTE', defaultQuote.quoteId);
  check('未配置团队的报价由新接任人100%承担并生成首个历史版本', defaultTeam.ownerId === managerId && defaultTeam.teamVersion === 1 && defaultTeam.members.length === 1 && Number(defaultTeam.members[0].allocatedPercentage) === 1);
  successful(await reassign(taskFor('CRM_RECEIVABLE', receivableId), salesId, 'receivable'), '真实手工交接应收');
  check('应收交接只改变负责人和默认团队，不伪造到账事实', database(`SELECT COUNT(*) FROM crm_receivable WHERE tenant_id=100000 AND receivable_id=${receivableId} AND owner_id=${salesId} AND received_amount=0;`) === '1'
    && database(`SELECT COUNT(*) FROM crm_deal_team WHERE tenant_id=100000 AND biz_type='RECEIVABLE' AND biz_id=${receivableId} AND current_flag=1 AND sales_user_id=${salesId} AND allocated_percentage=1;`) === '1'
    && database(`SELECT COUNT(*) FROM crm_deal_event WHERE tenant_id=100000 AND biz_type='RECEIVABLE' AND biz_id=${receivableId};`) === '0');
  const raceTask = taskFor('CRM_QUOTE', raceQuote.quoteId);
  const raced = await Promise.all([reassign(raceTask, salesId, 'race'), api(admin, `/crm/handover-task/${raceTask.handoverId}/close`, { method: 'POST', body: { remark: `${caseTag}_close_race` } })]);
  check('真实关闭与指派竞争只成功一次', raced.filter(result => result.status === 200 && result.body?.code === 200).length === 1);
  reject(raced.find(result => result.body?.code !== 200), '交接竞争败方明确拒绝', /pending|只能关闭待处理/);
  const raceStatus = database(`SELECT status FROM crm_handover_task WHERE tenant_id=100000 AND handover_id=${raceTask.handoverId};`);
  const raceOwner = Number(database(`SELECT owner_id FROM crm_quote WHERE tenant_id=100000 AND quote_id=${raceQuote.quoteId};`));
  check('任务竞争结果与业务负责人一致', raceStatus === 'CLOSED' && raceOwner === donorId || raceStatus === 'REASSIGNED' && raceOwner === salesId);
  const changed = await saveTeam('QUOTE', changedQuote.quoteId, await readTeam('QUOTE', changedQuote.quoteId), [member(managerId, 'OWNER', '1')]);
  const changedTask = taskFor('CRM_QUOTE', changedQuote.quoteId);
  reject(await reassign(changedTask, salesId, 'old_owner'), '旧任务不能覆盖已变化的真实负责人', /business object not found or already closed/);
  check('旧交接任务失败后新负责人及团队保持完整', (await readQuote(changedQuote.quoteId)).ownerId === managerId && (await readTeam('QUOTE', changedQuote.quoteId)).teamVersion === changed.teamVersion);
  successful(await api(admin, `/crm/handover-task/${changedTask.handoverId}/close`, { method: 'POST', body: { remark: `${caseTag}_owner_already_changed` } }), '关闭已失效的待交接任务');
  reject(await api(admin, `/crm/handover-task/${changedTask.handoverId}/close`, { method: 'POST', body: { remark: `${caseTag}_close_again` } }), '重复关闭交接任务返回明确业务拒绝', /只能关闭待处理交接任务/);
  reject(await reassign(changedTask, salesId, 'closed_task'), '先关闭后指派同样返回明确业务拒绝', /only pending handover task/);
  successful(await reassign(taskFor('CRM_CUSTOMER', customerId), salesId, 'customer'), '真实手工交接客户');
  check('交接不改写既有真实赢单事实和成员历史业绩', frozen() === frozenBefore);
  check('完成本次待办后没有遗留待处理任务', (await pending()).length === 0);
  evidence.hrOffboardWithoutSuccessor = true; evidence.manualHandover = true; evidence.handoverMerge = true;
  evidence.historicalWonUnchanged = true; evidence.hrAutomaticSuccessor = false;
}
