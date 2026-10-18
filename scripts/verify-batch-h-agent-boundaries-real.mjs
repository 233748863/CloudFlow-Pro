import assert from 'node:assert/strict';

export async function verifyAgentBoundaries({ admin, principal, agent, reviewer, api, post, successful, denied, check,
  database, rows, quote, taskRows, historyRows, start, complete, finishReview, definitionId, outOfScopeDefinitionId, countersignDefinitionId,
  principalId, agentId, reviewerId, settingsPath, settingRequest, caseTag }) {
  const window = rows("SELECT JSON_OBJECT('startTime',DATE_FORMAT(DATE_SUB(NOW(),INTERVAL 1 MINUTE),'%Y-%m-%d %H:%i:%s'),'endTime',DATE_FORMAT(DATE_ADD(NOW(),INTERVAL 1 HOUR),'%Y-%m-%d %H:%i:%s'));")[0];
  const proposal = { agentUserId: agentId, agentMode: 'AGENT', definitionIds: [definitionId], ...window, reason: `H1边界_${caseTag}` };
  const competing = await Promise.all(['left', 'right'].map(suffix => post(principal, settingsPath, { ...proposal, reason: `${proposal.reason}_${suffix}` })));
  const accepted = competing.filter(response => response.status === 200 && response.body?.code === 200);
  check('真实接口并发保存重叠设置只允许一笔成功', accepted.length === 1);
  denied(competing.find(response => response.status !== 200 || response.body?.code !== 200), '重叠设置竞争落败明确返回冲突', [409]);
  let setting = successful(accepted[0], '读取成功的并发设置');
  const settingRow = () => rows(`SELECT JSON_OBJECT('owner',CAST(principal_user_id AS CHAR),'tenant',CAST(tenant_id AS CHAR),'version',version,'status',status,'reason',reason) FROM wf_agent_setting WHERE setting_id=${quote(setting.settingId)};`)[0];
  const beforeStale = JSON.stringify(settingRow());
  denied(await api(principal, `${settingsPath}/${setting.settingId}`, { method: 'PUT', body: settingRequest(setting, { version: setting.version + 1 }) }), '过期版本不能修改设置', [409]);
  denied(await api(principal, `${settingsPath}/${setting.settingId}?version=${setting.version + 1}`, { method: 'DELETE' }), '过期版本不能停用设置', [409]);
  check('版本冲突保持设置原样', JSON.stringify(settingRow()) === beforeStale);
  setting = successful(await api(principal, `${settingsPath}/${setting.settingId}`, { method: 'PUT', body: {
    ...settingRequest(setting), principalUserId: agentId, tenantId: '100001', reason: `${proposal.reason}_server-owner`,
  } }), '设置的本人和租户由服务端取得');
  check('伪造负责人和租户字段不能改写设置归属', settingRow().owner === principalId && settingRow().tenant === '100000');
  const assigned = await start(definitionId, 'scope-in');
  const excluded = await start(outOfScopeDefinitionId, 'scope-out');
  check('明确流程版本范围仅绑定范围内任务', assigned.task.proxyUserId === agentId && excluded.task.proxyUserId === null);
  denied(await complete(agent, excluded.task.taskId, 'scope-forged'), '代理不能办理范围外真实任务', [403]);
  successful(await api(principal, `${settingsPath}/${setting.settingId}?version=${setting.version}`, { method: 'DELETE' }), '本人停用设置并清理绑定');
  check('停用立即清除引用本设置的未完成任务代理', taskRows(assigned.instanceId)[0].proxyUserId === null);
  denied(await complete(agent, assigned.task.taskId, 'disabled-forged'), '已停用代理不能提交之前读取的任务', [403]);
  for (const process of [assigned, excluded]) {
    successful(await complete(principal, process.task.taskId, 'owner-after-disable'), '停用后负责人继续办理');
    await finishReview(process.instanceId);
  }

  async function until(label, condition, timeout = 70000) {
    const deadline = Date.now() + timeout;
    while (!condition()) {
      assert.ok(Date.now() < deadline, label);
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
  async function refresh() {
    const result = successful(await post(admin, '/auth/system/job/1850/trigger', {}), '平台手动派发真实代理刷新任务');
    check('集中任务平台接受代理刷新请求', result.accepted === true && typeof result.executeNo === 'string');
    const status = () => database(`SELECT execute_status FROM sys_job_log WHERE tenant_id=100000 AND execute_no=${quote(result.executeNo)};`);
    await until('代理刷新任务完成', () => status() !== 'RUNNING' && status() !== '');
    check('代理刷新通过真实内部执行协议完成', status() === 'SUCCESS');
  }
  check('隔离环境代理刷新计划保持暂停，仅手动派发自有任务', database('SELECT status FROM sys_job WHERE tenant_id=100000 AND job_id=1850;') === 'PAUSED');
  const scheduledWindow = rows("SELECT JSON_OBJECT('startTime',DATE_FORMAT(DATE_ADD(NOW(),INTERVAL 20 SECOND),'%Y-%m-%d %H:%i:%s'),'endTime',DATE_FORMAT(DATE_ADD(NOW(),INTERVAL 65 SECOND),'%Y-%m-%d %H:%i:%s'));")[0];
  setting = successful(await post(principal, settingsPath, { ...proposal, ...scheduledWindow, reason: `${proposal.reason}_scheduled` }), '本人安排未来生效的代理设置');
  check('真实设置回显尚未生效状态', setting.effectiveStatus === 'SCHEDULED');
  const scheduled = await start(definitionId, 'scheduled-window');
  check('生效前创建的真实任务不带代理', scheduled.task.proxyUserId === null);
  denied(await complete(agent, scheduled.task.taskId, 'before-window'), '生效前不能办理任务', [403]);
  await until('等待真实生效时刻', () => database(`SELECT NOW() >= ${quote(scheduledWindow.startTime)};`) === '1');
  await refresh();
  check('到达生效时刻后刷新自动绑定既有待办', taskRows(scheduled.instanceId)[0].proxyUserId === agentId);
  check('生效期真实待办查询包含代理任务', successful(await api(agent, '/workflow/wf/todo?pageSize=100'), '读取生效代理待办').rows.some(task => task.taskId === scheduled.task.taskId));
  await until('等待真实到期时刻', () => database(`SELECT NOW() >= ${quote(scheduledWindow.endTime)};`) === '1');
  denied(await complete(agent, scheduled.task.taskId, 'after-window'), '到期后即使后台尚未清绑定也不能办理', [403]);
  check('到期后真实待办立即排除失效代理任务', !successful(await api(agent, '/workflow/wf/todo?pageSize=100'), '读取到期代理待办').rows.some(task => task.taskId === scheduled.task.taskId));
  await refresh();
  check('到期刷新清除代理且仍保留原负责人一个待办', taskRows(scheduled.instanceId).length === 1 && taskRows(scheduled.instanceId)[0].proxyUserId === null
    && taskRows(scheduled.instanceId)[0].assignee === principalId);
  successful(await complete(principal, scheduled.task.taskId, 'expired-owner'), '原负责人完成到期代理任务');
  await finishReview(scheduled.instanceId);
  check('生效到期均未修改集中任务计划状态', database('SELECT status FROM sys_job WHERE tenant_id=100000 AND job_id=1850;') === 'PAUSED');
  console.log(`H1_AGENT_REAL_WINDOW: start=${scheduledWindow.startTime}; end=${scheduledWindow.endTime}; scheduled_job_mutations=0`);

  for (const action of ['APPROVE', 'REJECT']) {
    const delegated = await start(definitionId, `delegate-return-${action}`);
    const response = successful(await post(principal, '/workflow/enhance/task/delegate', {
      taskId: delegated.task.taskId, toUserId: agentId, toUserName: 'H1客户端伪造姓名', mode: 'DELEGATE', reason: `H1委派_${caseTag}_${action}`,
    }), '普通委派通过真实接口派发');
    const waiting = taskRows(delegated.instanceId);
    check('普通委派挂起原任务并仅生成一个受委派人待办', waiting.length === 2
      && waiting.some(task => task.taskId === delegated.task.taskId && task.status === 'DELEGATED')
      && waiting.some(task => task.taskId === response.delegatedTaskId && task.status === 'TODO' && task.assignee === agentId));
    check('委派人姓名取真实账号而不信任客户端提交', database(`SELECT assignee_name FROM wf_task WHERE task_id=${quote(response.delegatedTaskId)};`)
      === database(`SELECT IFNULL(NULLIF(nick_name,''),user_name) FROM sys_user WHERE user_id=${agentId};`));
    successful(await post(agent, '/workflow/wf/complete', { taskId: response.delegatedTaskId, action, comment: `H1委派处理_${caseTag}_${action}` }), '受委派人通过标准接口处理');
    const returned = taskRows(delegated.instanceId);
    check(`${action}普通委派处理后交还原负责人且不提前推进`, returned.length === 1 && returned[0].taskId === delegated.task.taskId
      && returned[0].status === 'TODO' && returned[0].assignee === principalId);
    const acted = historyRows(response.delegatedTaskId).filter(history => history.action === action);
    check('普通委派处理归属受委派人且不伪记为代理', acted.length === 1 && acted[0].operator === agentId && acted[0].owner === null);
    check('交还完成关系并只产生一条归还记录', database(`SELECT status FROM wf_task_delegation WHERE delegation_id=${quote(response.delegationId)};`) === 'COMPLETED'
      && historyRows(delegated.task.taskId).filter(history => history.action === 'DELEGATE_RETURN').length === 1);
    denied(await complete(agent, response.delegatedTaskId, 'duplicate-delegate-completion'), '重复完成受委派任务不重复交还', [403, 404, 409]);
    denied(await complete(agent, delegated.task.taskId, 'delegation-return-forged'), '受委派人不能代替原负责人最终确认', [403]);
    successful(await complete(principal, delegated.task.taskId, 'delegation-confirmed'), '原负责人最终确认委派结果');
    await finishReview(delegated.instanceId);
  }
  const rollback = await start(definitionId, 'delegation-rollback');
  const rollbackDelegation = successful(await post(principal, '/workflow/enhance/task/delegate', {
    taskId: rollback.task.taskId, toUserId: agentId, mode: 'DELEGATE', reason: `H1事务回滚_${caseTag}`,
  }), '创建仅本次验收的委派回滚场景');
  const rollbackSnapshot = () => JSON.stringify({ tasks: taskRows(rollback.instanceId),
    parentHistory: historyRows(rollback.task.taskId), childHistory: historyRows(rollbackDelegation.delegatedTaskId),
    relation: database(`SELECT status,version FROM wf_task_delegation WHERE delegation_id=${quote(rollbackDelegation.delegationId)};`),
    instance: database(`SELECT status FROM wf_process_instance WHERE instance_id=${quote(rollback.instanceId)};`),
    monitors: database(`SELECT task_id,status,action,complete_time FROM wf_task_monitor WHERE instance_id=${quote(rollback.instanceId)} ORDER BY task_id;`),
  });
  const snapshotBeforeFailure = rollbackSnapshot();
  const triggerName = `h1_delegation_fault_${caseTag}`;
  assert.match(triggerName, /^h1_delegation_fault_[a-f0-9]{12}$/);
  assert.equal(database(`SELECT COUNT(*) FROM information_schema.triggers WHERE trigger_schema='cloud_flow_db' AND trigger_name=${quote(triggerName)};`), '0');
  let triggerCreated = false;
  try {
    database(`DELIMITER $$\nCREATE TRIGGER ${triggerName} BEFORE INSERT ON wf_task_history FOR EACH ROW BEGIN IF NEW.instance_id=${quote(rollback.instanceId)} AND NEW.action='DELEGATE_RETURN' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='H1_OWNED_DELEGATION_FAULT'; END IF; END$$\nDELIMITER ;\n`);
    triggerCreated = true;
    denied(await complete(agent, rollbackDelegation.delegatedTaskId, 'injected-return-failure'), '交还历史写入故障由真实接口明确报错', [500]);
    check('交还中途故障回滚任务、版本、关系、历史及监控', rollbackSnapshot() === snapshotBeforeFailure);
  } finally {
    if (triggerCreated) database(`DROP TRIGGER ${triggerName};`);
  }
  check('本次故障注入触发器已从隔离库移除', database(`SELECT COUNT(*) FROM information_schema.triggers WHERE trigger_schema='cloud_flow_db' AND trigger_name=${quote(triggerName)};`) === '0');
  successful(await complete(agent, rollbackDelegation.delegatedTaskId, 'return-retry-after-failure'), '故障解除后原请求可安全重试');
  check('回滚后重试只交还一次且保留原负责人待办', taskRows(rollback.instanceId).length === 1
    && taskRows(rollback.instanceId)[0].taskId === rollback.task.taskId && taskRows(rollback.instanceId)[0].status === 'TODO'
    && historyRows(rollback.task.taskId).filter(history => history.action === 'DELEGATE_RETURN').length === 1
    && historyRows(rollbackDelegation.delegatedTaskId).filter(history => history.action === 'APPROVE').length === 1);
  successful(await complete(principal, rollback.task.taskId, 'return-after-rollback-owner'), '原负责人确认重试结果');
  await finishReview(rollback.instanceId);

  const concurrentReturn = await start(definitionId, 'delegation-concurrent-return');
  const concurrentDelegation = successful(await post(principal, '/workflow/enhance/task/delegate', {
    taskId: concurrentReturn.task.taskId, toUserId: agentId, mode: 'DELEGATE', reason: `H1交还并发_${caseTag}`,
  }), '创建交还并发场景');
  const returnResults = await Promise.all(['left', 'right'].map(suffix => complete(agent, concurrentDelegation.delegatedTaskId, `return-race-${suffix}`)));
  check('两个真实交还请求竞争只有一个成功', returnResults.filter(response => response.status === 200 && response.body?.code === 200).length === 1);
  denied(returnResults.find(response => response.status !== 200 || response.body?.code !== 200), '重复交还请求明确拒绝', [403, 404, 409]);
  check('并发交还不重复生成父待办或完成历史', taskRows(concurrentReturn.instanceId).length === 1
    && taskRows(concurrentReturn.instanceId)[0].taskId === concurrentReturn.task.taskId
    && historyRows(concurrentReturn.task.taskId).filter(history => history.action === 'DELEGATE_RETURN').length === 1
    && historyRows(concurrentDelegation.delegatedTaskId).filter(history => history.action === 'APPROVE').length === 1);
  successful(await complete(principal, concurrentReturn.task.taskId, 'return-race-owner'), '原负责人确认并发交还结果');
  await finishReview(concurrentReturn.instanceId);

  const delegatedCountersign = await start(countersignDefinitionId, 'countersign-delegation-return');
  const delegatedSeat = successful(await post(principal, '/workflow/enhance/task/delegate', {
    taskId: delegatedCountersign.task.taskId, toUserId: agentId, mode: 'DELEGATE', reason: `H1会签委派_${caseTag}`,
  }), '会签席位可以按节点许可委派');
  successful(await complete(agent, delegatedSeat.delegatedTaskId, 'delegated-seat-return'), '受委派人完成会签意见');
  const restoredSeats = taskRows(delegatedCountersign.instanceId);
  check('会签委派交还保留原席位标记且未提前投票', restoredSeats.length === 2
    && restoredSeats.every(task => task.status === 'TODO' && task.roles?.startsWith('CS:'))
    && database(`SELECT COUNT(*) FROM wf_countersign_vote WHERE countersign_id=${quote(delegatedCountersign.task.roles.slice(3))};`) === '0');
  successful(await complete(principal, delegatedCountersign.task.taskId, 'restored-seat-owner'), '原会签人确认后才计票');
  successful(await complete(reviewer, taskRows(delegatedCountersign.instanceId)[0].taskId, 'restored-seat-reviewer'), '另一会签人正常投票');
  await finishReview(delegatedCountersign.instanceId);
  const nested = await start(definitionId, 'nested-delegation');
  const first = successful(await post(principal, '/workflow/enhance/task/delegate', { taskId: nested.task.taskId, toUserId: agentId,
    mode: 'DELEGATE', reason: `H1第一层委派_${caseTag}` }), '原负责人发起第一层委派');
  const second = successful(await post(agent, '/workflow/enhance/task/delegate', { taskId: first.delegatedTaskId, toUserId: reviewerId,
    mode: 'DELEGATE', reason: `H1第二层委派_${caseTag}` }), '受委派人按同节点许可再委派');
  successful(await complete(reviewer, second.delegatedTaskId, 'nested-second'), '第二层受委派人处理完成');
  check('嵌套委派只交还直接上级，不越过原负责人', taskRows(nested.instanceId).length === 2
    && taskRows(nested.instanceId).some(task => task.taskId === first.delegatedTaskId && task.status === 'TODO')
    && taskRows(nested.instanceId).some(task => task.taskId === nested.task.taskId && task.status === 'DELEGATED'));
  successful(await complete(agent, first.delegatedTaskId, 'nested-first'), '第一层受委派人确认后交还原负责人');
  check('逐层交还最后只保留原负责人待办', taskRows(nested.instanceId).length === 1 && taskRows(nested.instanceId)[0].taskId === nested.task.taskId
    && taskRows(nested.instanceId)[0].status === 'TODO');
  successful(await complete(principal, nested.task.taskId, 'nested-owner'), '原负责人确认嵌套委派结果');
  await finishReview(nested.instanceId);
  const transferred = await start(definitionId, 'ordinary-transfer');
  successful(await post(principal, '/workflow/enhance/task/delegate', { taskId: transferred.task.taskId, toUserId: agentId,
    toUserName: 'g_holiday_employee', mode: 'TRANSFER', reason: `H1转办_${caseTag}` }), '普通转办通过真实接口移交');
  const transferredTasks = taskRows(transferred.instanceId);
  check('普通转办只移交一个任务，不保留挂起原任务', transferredTasks.length === 1 && transferredTasks[0].assignee === agentId);
  denied(await complete(principal, transferredTasks[0].taskId, 'previous-owner'), '转办后原负责人不能继续审批', [403]);
  successful(await complete(agent, transferredTasks[0].taskId, 'transfer-recipient'), '受转办人标准审批');
  await finishReview(transferred.instanceId);
}
