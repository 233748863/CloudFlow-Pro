import assert from 'node:assert/strict';
import { verifyHrSuccessorInterface } from './verify-hr-successor-h3-ui.mjs';

export async function verifyHrSuccessor(context) {
  const { admin, employee, foreign, session, api, successful, database, check, caseTag, evidence, literal, adminId, salesId, managerId,
    member, readTeam, saveTeam, createCustomer, createQuote, createOpportunity, forbidden, reject } = context;
  const hr = await session('g_holiday_hr');
  const identity = (suffix, userStatus = '0', employeeStatus = 'REGULAR') => {
    const username = `h3_${caseTag}_${suffix}`;
    const name = `交接验收_${caseTag}_${suffix}`;
    const userId = Number(database(`INSERT INTO sys_user(tenant_id,dept_id,user_name,nick_name,password,status,deleted,pwd_reset_required,create_by,remark) VALUES (100000,100,${literal(username)},${literal(name)},'',${literal(userStatus)},0,'0','isolated-h3','仅隔离身份主数据，无登录密码'); SELECT LAST_INSERT_ID();`));
    const employeeId = Number(database(`INSERT INTO hr_employee(tenant_id,employee_no,name,gender,dept_id,user_id,employee_status) VALUES (100000,${literal(username)},${literal(name)},'MALE',100,${userId},${literal(employeeStatus)}); SELECT LAST_INSERT_ID();`));
    assert.ok(Number.isSafeInteger(userId) && userId > 0 && Number.isSafeInteger(employeeId) && employeeId > 0);
    return { userId, employeeId, name, username };
  };
  const waitFor = async (reader, accepts, label) => {
    const deadline = Date.now() + 90000;
    do {
      const result = await reader();
      if (accepts(result)) return result;
      await new Promise(resolve => setTimeout(resolve, 400));
    } while (Date.now() < deadline);
    throw new Error(label);
  };
  const today = database('SELECT CURRENT_DATE;');
  const donor = identity('main');
  const readApplication = async (id, page = hr) => successful(await api(page, `/hr/lifecycle/applications/${id}`), '读取真实离职申请');
  const body = (suffix, successorUserId, changes = {}) => ({ applicationNo: `H3_HR_${caseTag}_${suffix}`, employeeId: donor.employeeId,
    type: 'RESIGNATION', status: 'DRAFT', effectiveDate: today, successorUserId, ...changes });
  const rejectHr = (result, label, message = /接任|离职|申请|版本|员工|交接|无权|不存在/) => reject(result, label, message);
  if (context.hrSuccessorUiOnly) {
    evidence.mode = 'hr-successor-ui-only';
    await verifyHrSuccessorInterface({ ...context, hr, identity, readApplication, today, rejectHr });
    return;
  }
  forbidden(await api(employee, '/hr/lifecycle/applications', { method: 'POST', body: body('employee_denied', salesId) }), 'EMPLOYEE不能创建离职交接申请');
  const foreignUser = Number(database("SELECT user_id FROM sys_user WHERE tenant_id=100001 AND user_name='g_import_tenant';"));
  const disabled = identity('disabled', '1');
  const departed = identity('departed', '0', 'LEFT');
  for (const [suffix, successorId] of [['self', donor.userId], ['foreign', foreignUser], ['disabled', disabled.userId], ['left', departed.userId], ['missing', 990009771]]) {
    rejectHr(await api(hr, '/hr/lifecycle/applications', { method: 'POST', body: body(suffix, successorId) }), `真实HR拒绝${suffix}接任人`);
  }
  const invalidDepartment = identity('department');
  const newDepartment = Number(database(`INSERT INTO sys_dept(tenant_id,parent_id,ancestors,dept_name,order_num,status,deleted) VALUES (100000,100,'0,100',${literal(`H3停用部门_${caseTag}`)},99,'1','0'); SELECT LAST_INSERT_ID();`));
  database(`UPDATE hr_employee SET dept_id=${newDepartment} WHERE tenant_id=100000 AND id=${invalidDepartment.employeeId}; UPDATE sys_user SET dept_id=${newDepartment} WHERE tenant_id=100000 AND user_id=${invalidDepartment.userId};`);
  rejectHr(await api(hr, '/hr/lifecycle/applications', { method: 'POST', body: body('bad_department', invalidDepartment.userId) }), '真实HR拒绝停用部门内的接任人');
  rejectHr(await api(hr, '/hr/lifecycle/applications', { method: 'POST', body: body('malformed', null, { detailJson: { successorUserId: 'not-a-user' } }) }), '嵌套非法接任人不会静默变为未指定');
  rejectHr(await api(hr, '/hr/lifecycle/applications', { method: 'POST', body: body('conflicting', salesId, { detailJson: { successorUserId: managerId } }) }), '根字段与嵌套字段冲突时明确拒绝');
  rejectHr(await api(hr, '/hr/lifecycle/applications', { method: 'POST', body: body('skip', salesId, { status: 'COMPLETED' }) }), '创建离职不能直接伪造已完成状态');
  check('全部无效接任人申请均无残留申请或明细', database(`SELECT COUNT(*) FROM hr_lifecycle_application WHERE tenant_id=100000 AND employee_id=${donor.employeeId};`) === '0');

  const customerId = await createCustomer('auto_customer', donor.userId);
  const opportunity = await createOpportunity('auto_opportunity', customerId, donor.userId);
  const quote = await createQuote('auto_quote', customerId, donor.userId);
  const defaultQuote = await createQuote('auto_default_quote', customerId, donor.userId);
  const terminalQuote = await createQuote('auto_terminal_quote', customerId, donor.userId);
  successful(await api(admin, `/crm/quote/${terminalQuote.quoteId}/expire`, { method: 'POST' }), '自动交接前关闭终态报价');
  const group = [member(donor.userId, 'OWNER', '0.5'), member(salesId, 'CO_SELLER', '0.3'), member(adminId, 'SUPPORT', '0.2')];
  const originalQuote = await saveTeam('QUOTE', quote.quoteId, await readTeam('QUOTE', quote.quoteId), group);
  const originalOpportunity = await saveTeam('OPPORTUNITY', opportunity.opportunityId, await readTeam('OPPORTUNITY', opportunity.opportunityId), group);
  const historical = await createOpportunity('auto_history', customerId, adminId);
  const historicalTeam = await saveTeam('OPPORTUNITY', historical.opportunityId, await readTeam('OPPORTUNITY', historical.opportunityId),
    [member(adminId, 'OWNER', '0.5'), member(donor.userId, 'CO_SELLER', '0.3'), member(salesId, 'SUPPORT', '0.2')]);
  successful(await api(admin, `/crm/opportunity/${historical.opportunityId}/win`, { method: 'POST', body: { version: historicalTeam.businessVersion } }), '自动交接前实际赢单');
  const frozen = () => database(`SELECT JSON_OBJECT('event',event_id,'user',sales_user_id,'dept',dept_id,'ratio',allocated_percentage,'amount',allocated_amount) FROM crm_deal_allocation WHERE tenant_id=100000 AND event_id IN (SELECT event_id FROM crm_deal_event WHERE tenant_id=100000 AND biz_type='OPPORTUNITY' AND biz_id=${historical.opportunityId}) ORDER BY allocation_id;`);
  const originalFrozen = frozen();
  assert.ok(originalFrozen.length > 0);
  const receivableName = `H3_HR_${caseTag}_receivable`;
  successful(await api(admin, '/crm/receivable', { method: 'POST', body: { customerId, receivableName, ownerId: donor.userId, plannedAmount: '100.01', dueDate: today } }), '创建真实自动交接应收');
  const receivableId = Number(database(`SELECT receivable_id FROM crm_receivable WHERE tenant_id=100000 AND receivable_name=${literal(receivableName)};`));
  const applicationId = Number(successful(await api(hr, '/hr/lifecycle/applications', { method: 'POST', body: body('main', salesId,
    { deptId: 999999, name: '伪造离职姓名', detailJson: { reason: '真实HR指定接任人', successorName: '伪造姓名', status: 'COMPLETED' } }) }), 'HR角色真实创建预指定接任人离职申请'));
  let application = await readApplication(applicationId);
  check('离职详情返回真实用户编号和可信姓名，明细伪造状态无效', application.successorUserId === salesId && application.successorName === '商机验收销售'
    && application.employeeId === donor.employeeId && application.status === 'DRAFT' && application.version === 0);
  check('离职部门及姓名来自员工，HR创建后可按本部门范围读取', application.deptId === 100 && application.name === donor.name);
  forbidden(await api(employee, `/hr/lifecycle/applications/${applicationId}`), 'EMPLOYEE不能读取他人的离职交接');
  forbidden(await api(employee, `/hr/lifecycle/applications/${applicationId}`, { method: 'PUT', body: { version: application.version, successorUserId: managerId } }), 'EMPLOYEE不能变更接任人');
  for (const suffix of ['', '/details', '/tasks']) rejectHr(await api(foreign, `/hr/lifecycle/applications/${applicationId}${suffix}`), `外租户不能读取离职申请${suffix || '本身'}`);
  rejectHr(await api(foreign, `/hr/lifecycle/applications/${applicationId}`, { method: 'PUT', body: { version: application.version, successorUserId: managerId } }), '外租户不能按ID改变接任人');
  successful(await api(hr, `/hr/lifecycle/applications/${applicationId}`, { method: 'PUT', body: { version: application.version, successorUserId: managerId } }), '真实修改接任人');
  rejectHr(await api(hr, `/hr/lifecycle/applications/${applicationId}`, { method: 'PUT', body: { version: application.version, successorUserId: salesId } }), '过期申请版本不能覆盖接任人');
  application = await readApplication(applicationId);
  successful(await api(hr, `/hr/lifecycle/applications/${applicationId}`, { method: 'PUT', body: { version: application.version, detailJson: { successorUserId: null } } }), '明确清空可选接任人');
  application = await readApplication(applicationId);
  check('清空后旧接任姓名一并移除', application.successorUserId == null && application.successorName == null);
  successful(await api(hr, `/hr/lifecycle/applications/${applicationId}`, { method: 'PUT', body: { version: application.version, detailJson: { successorUserId: salesId } } }), '嵌套明细重新指定可信接任人');
  rejectHr(await api(hr, `/hr/lifecycle/applications/${applicationId}/complete`, { method: 'POST', body: { remark: '未审批不能直接交接' } }), '未审批离职不能触发自动交接');
  for (const action of ['submit', 'approve']) {
    successful(await api(hr, `/hr/lifecycle/applications/${applicationId}/${action}`, { method: 'POST' }), `真实HR离职${action}`);
    check(`真实${action}状态不会被旧明细覆盖`, (await readApplication(applicationId)).status === (action === 'submit' ? 'APPROVING' : 'APPROVED'));
  }
  const awaitingTasks = await readApplication(applicationId);
  rejectHr(await api(hr, `/hr/lifecycle/applications/${applicationId}/complete`, { method: 'POST', body: { version: awaitingTasks.version, remark: '未核实资产任务' } }), '交接任务未完成不能完成离职', /请先完成全部离职交接任务/);
  const tasks = successful(await api(hr, `/hr/lifecycle/applications/${applicationId}/tasks`), '真实读取离职任务');
  for (const task of tasks) successful(await api(hr, `/hr/lifecycle/tasks/${task.id}/complete`, { method: 'POST' }), '真实确认离职任务');
  const approved = await readApplication(applicationId);
  rejectHr(await api(hr, `/hr/lifecycle/applications/${applicationId}/complete`, { method: 'POST' }), '完成离职必须明确核对申请版本', /提供当前申请版本/);
  rejectHr(await api(hr, `/hr/lifecycle/applications/${applicationId}/complete`, { method: 'POST', body: { version: approved.version - 1 } }), '旧版本不能完成已变更接任人的申请', /申请已被修改/);
  database(`UPDATE sys_user SET status='1' WHERE tenant_id=100000 AND user_id=${salesId};`);
  try {
    rejectHr(await api(hr, `/hr/lifecycle/applications/${applicationId}/complete`, { method: 'POST', body: { version: approved.version, remark: '最后边界失效输入' } }), '完成离职时重新核实接任人启用状态');
    check('接任人最后边界失效时申请和原负责人账号均未改变', (await readApplication(applicationId)).version === approved.version
      && database(`SELECT status FROM sys_user WHERE tenant_id=100000 AND user_id=${donor.userId};`) === '0');
  } finally { database(`UPDATE sys_user SET status='0' WHERE tenant_id=100000 AND user_id=${salesId};`); }

  const trigger = `h3_hr_queue_${caseTag}`;
  let installed = false;
  try {
    database(`DELIMITER $$\nCREATE TRIGGER ${trigger} BEFORE INSERT ON outbox_event FOR EACH ROW BEGIN IF NEW.tenant_id=100000 AND NEW.event_type='EMPLOYEE_OFFBOARDED' AND NEW.aggregate_id=${donor.employeeId} THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='H3_OWNED_HR_OUTBOX_FAILURE'; END IF; END$$\nDELIMITER ;\n`);
    installed = true;
    const failedCompletion = await api(hr, `/hr/lifecycle/applications/${applicationId}/complete`, { method: 'POST', body: { version: approved.version, remark: '队列写入故障验收' } });
    check('离职事件写入故障返回真实500及追踪编号，不泄露内部SQL', failedCompletion.status === 500 && failedCompletion.body?.code === 500
      && typeof failedCompletion.traceId === 'string' && failedCompletion.traceId.length > 0
      && /服务异常/.test(failedCompletion.body?.msg || failedCompletion.body?.message || '')
      && !/H3_OWNED_HR_OUTBOX_FAILURE|INSERT|SIGNAL/.test(JSON.stringify(failedCompletion.body)));
    const afterFailure = await readApplication(applicationId);
    check('事件故障后申请仍已审批且版本不消耗，没有伪造离职事件', afterFailure.status === 'APPROVED' && afterFailure.version === approved.version
      && database(`SELECT COUNT(*) FROM outbox_event WHERE tenant_id=100000 AND event_type='EMPLOYEE_OFFBOARDED' AND aggregate_id=${donor.employeeId};`) === '0');
  } finally { if (installed) database(`DROP TRIGGER ${trigger};`); }
  check('认证禁用已实际执行，其先行事件必须保留供后续核对', database(`SELECT status FROM sys_user WHERE tenant_id=100000 AND user_id=${donor.userId};`) === '1');
  const expected = [['CRM_CUSTOMER', customerId], ['CRM_OPPORTUNITY', opportunity.opportunityId], ['CRM_QUOTE', quote.quoteId], ['CRM_QUOTE', defaultQuote.quoteId], ['CRM_RECEIVABLE', receivableId]];
  const pending = async () => successful(await api(admin, `/crm/handover-task/pending?fromOwnerId=${donor.userId}`), '读取认证先行交接待办');
  const priorTasks = await waitFor(pending, values => expected.every(([type, id]) => values.some(task => task.businessType === type && task.businessId === id)), '认证禁用的先行待办未生成');
  check('真实认证禁用先生成五项待办，HR失败没有被冒充为自动交接成功', priorTasks.length === expected.length
    && database(`SELECT owner_id FROM crm_quote WHERE tenant_id=100000 AND quote_id=${quote.quoteId};`) === String(donor.userId));
  successful(await api(hr, `/hr/lifecycle/applications/${applicationId}/complete`, { method: 'POST', body: { version: approved.version, remark: '队列恢复后继续原申请' } }), '恢复后重试同一离职申请');
  await waitFor(() => database(`SELECT COUNT(*) FROM crm_handover_task WHERE tenant_id=100000 AND from_owner_id=${donor.userId} AND business_type='AUTO_REASSIGN' AND status='REASSIGNED' AND to_owner_id=${salesId};`), value => value === '1', 'HR预指定接任人未实际完成自动交接');
  const transferredQuote = await readTeam('QUOTE', quote.quoteId);
  const transferredOpportunity = await readTeam('OPPORTUNITY', opportunity.opportunityId);
  for (const [name, actual, original] of [['报价', transferredQuote, originalQuote], ['商机', transferredOpportunity, originalOpportunity]]) {
    check(`HR自动交接${name}把50%与30%合并为80%，第三人20%且只增一版`, actual.ownerId === salesId && actual.teamVersion === original.teamVersion + 1
      && actual.members.length === 2 && actual.members.filter(value => value.roleType === 'OWNER').length === 1
      && Number(actual.members.find(value => value.salesUserId === salesId)?.allocatedPercentage) === 0.8
      && Number(actual.members.find(value => value.salesUserId === adminId)?.allocatedPercentage) === 0.2);
  }
  check('自动交接同步实际客户、默认报价及应收负责人，不伪造到账', database(`SELECT owner_id FROM crm_customer WHERE tenant_id=100000 AND customer_id=${customerId};`) === String(salesId)
    && (await readTeam('QUOTE', defaultQuote.quoteId)).members.every(value => value.salesUserId === salesId && Number(value.allocatedPercentage) === 1)
    && database(`SELECT COUNT(*) FROM crm_receivable WHERE tenant_id=100000 AND receivable_id=${receivableId} AND owner_id=${salesId} AND received_amount=0;`) === '1');
  check('终态报价及真实赢单分配完全不变', database(`SELECT owner_id FROM crm_quote WHERE tenant_id=100000 AND quote_id=${terminalQuote.quoteId};`) === String(donor.userId) && frozen() === originalFrozen);
  check('早于HR事件的五项待办逐项结清且记录真实接任人', (await pending()).length === 0
    && database(`SELECT COUNT(*) FROM crm_handover_task WHERE tenant_id=100000 AND from_owner_id=${donor.userId} AND business_type<>'AUTO_REASSIGN' AND status='REASSIGNED' AND to_owner_id=${salesId} AND to_owner_name='商机验收销售';`) === '5');
  const completed = await readApplication(applicationId);
  successful(await api(hr, `/hr/lifecycle/applications/${applicationId}/complete`, { method: 'POST', body: { remark: '重复确认边界' } }), '重复完成保持已完成状态');
  check('重复完成不消耗申请版本、不增加离职事件或团队版本', (await readApplication(applicationId)).version === completed.version
    && database(`SELECT COUNT(*) FROM outbox_event WHERE tenant_id=100000 AND event_type='EMPLOYEE_OFFBOARDED' AND aggregate_id=${donor.employeeId};`) === '1'
    && (await readTeam('QUOTE', quote.quoteId)).teamVersion === transferredQuote.teamVersion);
  rejectHr(await api(hr, `/hr/lifecycle/applications/${applicationId}`, { method: 'PUT', body: { version: completed.version, successorUserId: managerId } }), '离职完成后禁止替换接任人');
  evidence.hrAutomaticSuccessor = true; evidence.hrOutboxRollback = true; evidence.accountDisabledPendingSettled = true;
  evidence.automaticMerge = true; evidence.automaticHistoricalWonUnchanged = true;
  const competingDonor = identity('race');
  const competingId = successful(await api(admin, '/hr/lifecycle/applications', { method: 'POST', body: body('race', salesId, { employeeId: competingDonor.employeeId }) }), '管理员为同部门员工建立协作离职单');
  const shared = await readApplication(competingId);
  check('HR能协作读取管理员创建的同部门离职单及接任人', shared.successorUserId === salesId && shared.deptId === 100);
  for (const action of ['submit', 'approve']) successful(await api(hr, `/hr/lifecycle/applications/${competingId}/${action}`, { method: 'POST' }), `HR协作申请${action}`);
  const sharedTasks = successful(await api(hr, `/hr/lifecycle/applications/${competingId}/tasks`), 'HR读取协作申请任务');
  check('HR读到管理员创建申请的实际交接任务', sharedTasks.length === 1);
  for (const task of sharedTasks) successful(await api(hr, `/hr/lifecycle/tasks/${task.id}/complete`, { method: 'POST' }), 'HR确认协作申请任务');
  const competing = await readApplication(competingId);
  const outcomes = await Promise.all([
    api(admin, `/hr/lifecycle/applications/${competingId}`, { method: 'PUT', body: { version: competing.version, successorUserId: managerId } }),
    api(hr, `/hr/lifecycle/applications/${competingId}/complete`, { method: 'POST', body: { version: competing.version } }),
  ]);
  const won = outcomes.map(result => result.status === 200 && result.body?.code === 200);
  check('真实同时修改接任人与完成离职只允许一个操作提交', won.filter(Boolean).length === 1);
  rejectHr(outcomes[won[0] ? 1 : 0], '竞争失败明确告知刷新核对或已经完成');
  let competingResult = await readApplication(competingId);
  if (won[0]) {
    check('接任人变更先提交时旧版完成不能禁用员工账号', competingResult.status === 'APPROVED' && competingResult.successorUserId === managerId
      && database(`SELECT status FROM sys_user WHERE tenant_id=100000 AND user_id=${competingDonor.userId};`) === '0');
    successful(await api(hr, `/hr/lifecycle/applications/${competingId}/complete`, { method: 'POST', body: { version: competingResult.version } }), '核对新接任人后完成原申请');
    competingResult = await readApplication(competingId);
  }
  const expectedSuccessor = won[0] ? managerId : salesId;
  const envelope = JSON.parse(database(`SELECT payload_json FROM outbox_event WHERE tenant_id=100000 AND event_type='EMPLOYEE_OFFBOARDED' AND aggregate_id=${competingDonor.employeeId};`));
  check('竞争后最终离职事件只保留实际提交接任人且恰好一份', competingResult.status === 'COMPLETED' && competingResult.successorUserId === expectedSuccessor
    && JSON.parse(envelope.payload).successorUserId === expectedSuccessor
    && database(`SELECT COUNT(*) FROM outbox_event WHERE tenant_id=100000 AND event_type='EMPLOYEE_OFFBOARDED' AND aggregate_id=${competingDonor.employeeId};`) === '1');
  evidence.hrSuccessorCompletionCompetition = true; evidence.hrSameDepartmentCollaboration = true;
  await verifyHrSuccessorInterface({ ...context, hr, identity, readApplication, today, rejectHr });
}
