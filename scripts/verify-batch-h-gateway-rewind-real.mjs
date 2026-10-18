import assert from 'node:assert/strict';
import path from 'node:path';
import { ownedGatewayRedis } from './owned-gateway-redis.mjs';

export async function verifyGatewayRewinds(harness) {
  const { admin, manager, employee, foreign, people, api, post, successful, database, check, caseTag,
    quote, rows, model, node, edge, definition, enter, complete, finish, tasks, activations, arrivals, status, denied } = harness;
  const taskAt = (instanceId, nodeKey) => {
    const matches = tasks(instanceId).filter(task => task.node === nodeKey);
    assert.equal(matches.length, 1, `One pending task at ${nodeKey}`);
    return matches[0];
  };
  const variables = instanceId => JSON.parse(database(`SELECT variables FROM wf_process_instance WHERE instance_id=${quote(instanceId)};`));
  const waitState = instanceId => variables(instanceId)._wf_waits || {};
  const histories = instanceId => rows(`SELECT JSON_OBJECT('id',history_id,'task',task_id,'node',node_key,'operator',CAST(operator_id AS CHAR),'action',action,'type',task_type,'metadata',variables_changed) FROM wf_task_history WHERE tenant_id=100000 AND instance_id=${quote(instanceId)} ORDER BY create_time,history_id;`)
    .map(history => ({ ...history, metadata: JSON.parse(history.metadata || '{}') }));
  const approved = (instanceId, nodeKey) => histories(instanceId).filter(history => history.node === nodeKey && history.action === 'APPROVE')
    .sort((first, second) => second.metadata._wf_execution.sequence - first.metadata._wf_execution.sequence)[0];
  const reject = (task, strategy, targetNodeKey) => post(people.get(task.assignee), '/workflow/wf/reject', {
    taskId: task.id, strategy, targetNodeKey, comment: `rewind-${caseTag}-${strategy}-${task.id}`,
  });
  const withdraw = (page, history) => post(page, '/workflow/enhance/task/withdraw', { historyId: history.id });
  const assertSequence = instanceId => {
    const records = histories(instanceId).map(history => history.metadata._wf_execution?.sequence).sort((first, second) => first - second);
    check('审批、驳回及撤回执行序号无重复或倒退', records.every((sequence, index) => sequence === index + 1)
      && variables(instanceId)._wf_history_sequence === records.length);
  };
  const branchModel = () => {
    const graph = model();
    graph.nodes.push(node('firstNext'), node('secondNext', '990000707'));
    graph.edges.find(current => current.id === 'first-join').target = 'firstNext';
    graph.edges.find(current => current.id === 'second-join').target = 'secondNext';
    graph.edges.push(edge('firstNext', 'join'), edge('secondNext', 'join'));
    return graph;
  };
  const branches = await definition('rewind-branches', branchModel());
  if (harness.withdrawalUiOnly) {
    await verifyWithdrawalPages();
    return;
  }
  const same = await enter(branches, 'rewind-same');
  const sameActivation = activations(same)[0];
  successful(await complete(taskAt(same, 'first'), 'same-first'), '真实完成左支首审');
  const firstHistory = approved(same, 'first');
  successful(await complete(taskAt(same, 'second'), 'same-second'), '稍后真实完成右支首审');
  const secondHistory = approved(same, 'second');
  const sibling = taskAt(same, 'secondNext');
  const rejectedTask = taskAt(same, 'firstNext');
  successful(await reject(rejectedTask, 'TO_PREVIOUS_NODE'), '左支真实驳回上一步');
  check('同分支上一步只重建左支首审且原轮次不变', tasks(same).map(task => task.node).join(',') === 'first,secondNext'
    && taskAt(same, 'first').context.activationId === sameActivation.id && activations(same).length === 1);
  check('同分支回退保留右支待办和有效审批记录', JSON.stringify(taskAt(same, 'secondNext')) === JSON.stringify(sibling)
    && variables(same)._wf_invalidated_histories.includes(firstHistory.id) && !variables(same)._wf_invalidated_histories.includes(secondHistory.id));
  check('回退历史记录保留真实动作及语义', histories(same).some(history => history.task === rejectedTask.id
    && history.action === 'REJECT_TO_PREVIOUS' && history.type === 'REJECT_JUMP'));
  const trace = rows(`SELECT JSON_OBJECT('node',node_key,'event',event_type,'status',status) FROM wf_node_record WHERE instance_id=${quote(same)};`);
  check('真实事件链写入驳回完成和返回待办轨迹', trace.some(record => record.node === 'firstNext' && record.event === 'REJECT_JUMP' && record.status === 'COMPLETED')
    && trace.some(record => record.node === 'first' && record.event === 'REJECT_JUMP' && record.status === 'RUNNING'));
  denied(await reject(taskAt(same, 'first'), 'TO_SPECIFIED_NODE', 'second'), '无法指定兄弟分支作为回退目标');
  successful(await complete(taskAt(same, 'first'), 'same-redo-first'), '回退后左支重新审批');
  successful(await complete(taskAt(same, 'firstNext'), 'same-next'), '左支重新到达汇聚');
  check('左支重走不提前释放仍有待办的右支', activations(same)[0].status === 'WAITING' && arrivals(same).length === 1);
  successful(await complete(sibling, 'same-right-next'), '保留的右支待办继续完成');
  await finish(same, 'same');
  assertSequence(same);

  const basic = await definition('rewind-basic', model());
  const before = await enter(basic, 'rewind-before');
  const oldRound = activations(before)[0];
  const oldTask = taskAt(before, 'second');
  successful(await complete(taskAt(before, 'first'), 'before-first'), '回退网关前先产生一条真实到达');
  successful(await reject(oldTask, 'TO_SPECIFIED_NODE', 'pre'), '真实退回网关前首审');
  check('跨网关回退取消旧轮次并清理全部失效分支', tasks(before).length === 1 && taskAt(before, 'pre').context === null
    && activations(before)[0].status === 'CANCELLED' && arrivals(before).length === 1);
  successful(await complete(taskAt(before, 'pre'), 'before-reenter'), '重新审批后进入新一轮网关');
  const newRound = activations(before).find(round => round.status === 'WAITING');
  check('重新分流使用新轮次且不复用旧到达计数', newRound.id !== oldRound.id && newRound.expected === 2
    && tasks(before).every(task => task.context.activationId === newRound.id) && !arrivals(before).some(arrival => arrival.activation === newRound.id));
  denied(await complete(oldTask, 'before-expired'), '旧轮次任务重放被拒绝');
  for (const task of tasks(before)) successful(await complete(task, `before-redo-${task.node}`), '新轮次分支真实完成');
  await finish(before, 'before');
  assertSequence(before);

  const released = await enter(basic, 'rewind-released');
  for (const task of tasks(released)) successful(await complete(task, `released-${task.node}`), '先完成旧轮次所有分支');
  const releasedRound = activations(released)[0];
  successful(await reject(taskAt(released, 'join'), 'TO_PREVIOUS_NODE'), '汇聚后真实退回分支审批');
  check('汇聚后退回分支重新分流全部命中出口', tasks(released).map(task => task.node).join(',') === 'first,second'
    && activations(released).length === 2 && activations(released).find(round => round.id === releasedRound.id).status === 'RELEASED');
  successful(await complete(taskAt(released, 'first'), 'released-redo-first'), '新轮次第一分支完成');
  check('已释放旧轮次无法使新轮次提前通过', tasks(released).map(task => task.node).join(',') === 'second'
    && activations(released).filter(round => round.status === 'WAITING').length === 1);
  successful(await complete(taskAt(released, 'second'), 'released-redo-second'), '新轮次第二分支完成');
  await finish(released, 'released');
  assertSequence(released);

  const nestedGraph = model();
  nestedGraph.nodes.push({ id: 'inner', type: 'INCLUSIVE', title: '内层分流', joinNodeKey: 'innerJoin' },
    node('innerFirst'), node('innerSecond', '990000707'), node('innerJoin'));
  nestedGraph.edges.find(current => current.id === 'first-join').target = 'inner';
  nestedGraph.edges.push(edge('inner', 'innerFirst', { condition: 'true' }), edge('inner', 'innerSecond', { condition: 'true' }),
    edge('innerFirst', 'innerJoin'), edge('innerSecond', 'innerJoin'), edge('innerJoin', 'join'));
  const nestedDefinition = await definition('rewind-nested', nestedGraph);
  const nested = await enter(nestedDefinition, 'rewind-nested');
  const outerSibling = taskAt(nested, 'second');
  successful(await complete(taskAt(nested, 'first'), 'nested-first'), '进入内层网关');
  const previousInner = activations(nested).find(round => round.node === 'inner');
  successful(await reject(taskAt(nested, 'innerFirst'), 'TO_PREVIOUS_NODE'), '内层分支退回外层本支审批');
  check('嵌套回退仅取消失效内层并保留外层轮次和兄弟任务', activations(nested).find(round => round.node === 'split').status === 'WAITING'
    && activations(nested).find(round => round.id === previousInner.id).status === 'CANCELLED'
    && JSON.stringify(taskAt(nested, 'second')) === JSON.stringify(outerSibling)
    && taskAt(nested, 'first').context.activationId === outerSibling.context.activationId);
  successful(await complete(taskAt(nested, 'first'), 'nested-reenter'), '重进内层独立新轮次');
  check('内层重走保存同一父分支与新子轮次', taskAt(nested, 'innerFirst').context.activationId !== previousInner.id
    && taskAt(nested, 'innerFirst').context.parent.activationId === outerSibling.context.activationId);
  for (const nodeKey of ['innerFirst', 'innerSecond', 'innerJoin', 'second']) successful(await complete(taskAt(nested, nodeKey), `nested-redo-${nodeKey}`), '嵌套回退后逐支真实完成');
  await finish(nested, 'nested');
  assertSequence(nested);

  const withdrawal = await enter(branches, 'withdraw-same');
  successful(await complete(taskAt(withdrawal, 'first'), 'withdraw-first'), '本人先完成左支审批');
  const withdrawing = approved(withdrawal, 'first');
  const untouched = taskAt(withdrawal, 'second');
  denied(await withdraw(employee, withdrawing), '其他审批人不能撤回本人记录');
  denied(await withdraw(foreign, withdrawing), '其他租户不能撤回或探知审批记录');
  successful(await withdraw(manager, withdrawing), '本人真实撤回未汇聚分支审批');
  check('撤回只重建本支并保留兄弟任务', tasks(withdrawal).map(task => task.node).join(',') === 'first,second'
    && JSON.stringify(taskAt(withdrawal, 'second')) === JSON.stringify(untouched));
  await new Promise(resolve => setTimeout(resolve, 5100));
  const repeatedWithdrawal = await withdraw(manager, withdrawing);
  denied(repeatedWithdrawal, '已失效的审批记录不能重复撤回');
  check('重复撤回由历史有效性校验拒绝且已越过重复提交窗口', repeatedWithdrawal.body?.code === 'INVALID_STATE');
  check('撤回保留原审批并新增独立撤回记录', histories(withdrawal).some(history => history.id === withdrawing.id)
    && histories(withdrawal).filter(history => history.action === 'WITHDRAW').length === 1);
  assertSequence(withdrawal);

  const arrived = await enter(basic, 'withdraw-arrived');
  successful(await complete(taskAt(arrived, 'first'), 'withdraw-arrived-first'), '撤回前本支已到达汇聚');
  const arrivedOld = activations(arrived)[0];
  successful(await withdraw(manager, approved(arrived, 'first')), '本人撤回已到达但未放行的分支');
  check('已到达分支撤回重建网关轮次且旧到达永久失效', activations(arrived).find(round => round.id === arrivedOld.id).status === 'CANCELLED'
    && activations(arrived).length === 2 && tasks(arrived).length === 2 && tasks(arrived).every(task => task.context.activationId !== arrivedOld.id));
  for (const task of tasks(arrived)) successful(await complete(task, `withdraw-arrived-redo-${task.node}`), '撤回后的新轮次审批');
  await finish(arrived, 'arrived');
  denied(await withdraw(manager, approved(arrived, 'first')), '已结束流程不能撤回审批');
  assertSequence(arrived);

  const reminderGraph = model();
  reminderGraph.nodes.filter(current => current.type === 'APPROVAL').forEach(current => { current.slaHours = 2; });
  const reminderDefinition = await definition('rewind-reminders', reminderGraph);
  const rollback = await enter(reminderDefinition, 'rewind-fault');
  successful(await complete(taskAt(rollback, 'first'), 'fault-first'), '回退故障前真实产生到达记录');
  const rollbackTask = taskAt(rollback, 'second');
  const redis = await ownedGatewayRedis(harness.state);
  const indexes = () => JSON.stringify(['100000:sys:task:reminders', '100000:sys:task:timeouts']
    .map(key => redis('ZRANGE', key, '0', '-1', 'WITHSCORES')));
  const originalIndexes = indexes();
  check('故障回退前真实任务具有三条提醒和超时索引', redis('ZRANGE', '100000:sys:task:reminders', '0', '-1').split(/\r?\n/).filter(member => member.includes(rollbackTask.id)).length === 3
    && redis('ZRANGE', '100000:sys:task:timeouts', '0', '-1').includes(rollbackTask.id));
  const snapshot = () => JSON.stringify({ tasks: tasks(rollback), activations: activations(rollback), arrivals: arrivals(rollback),
    histories: histories(rollback), variables: variables(rollback), status: status(rollback),
    monitors: database(`SELECT task_id,status,action FROM wf_task_monitor WHERE instance_id=${quote(rollback)} ORDER BY task_id;`) });
  const originalSnapshot = snapshot();
  const trigger = `h1_rewind_fault_${caseTag}`;
  assert.match(trigger, /^h1_rewind_fault_[a-f0-9]{12}$/);
  assert.equal(database(`SELECT COUNT(*) FROM information_schema.triggers WHERE trigger_schema='cloud_flow_db' AND trigger_name=${quote(trigger)};`), '0');
  let installed = false;
  try {
    database(`DELIMITER $$\nCREATE TRIGGER ${trigger} BEFORE INSERT ON wf_task FOR EACH ROW BEGIN IF NEW.instance_id=${quote(rollback)} AND NEW.node_key='pre' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='H1_OWNED_REWIND_FAULT'; END IF; END$$\nDELIMITER ;\n`);
    installed = true;
    denied(await reject(rollbackTask, 'TO_SPECIFIED_NODE', 'pre'), '回退目标写入故障通过真实接口返回失败', [400, 500]);
    check('回退故障完整恢复任务、轮次、到达、历史有效性与监控', snapshot() === originalSnapshot);
    check('回退事务失败保留全部原始提醒时间和超时索引', indexes() === originalIndexes);
  } finally {
    if (installed) database(`DROP TRIGGER ${trigger};`);
  }
  check('回退故障触发器已移除', database(`SELECT COUNT(*) FROM information_schema.triggers WHERE trigger_schema='cloud_flow_db' AND trigger_name=${quote(trigger)};`) === '0');
  await new Promise(resolve => setTimeout(resolve, 5100));
  successful(await reject(rollbackTask, 'TO_SPECIFIED_NODE', 'pre'), '故障解除后同一待办可以正常回退');
  check('成功回退提交后才清除旧任务提醒并注册新待办', !indexes().includes(rollbackTask.id)
    && redis('ZRANGE', '100000:sys:task:reminders', '0', '-1').includes(taskAt(rollback, 'pre').id));
  assertSequence(rollback);

  const timerGraph = model();
  Object.assign(timerGraph.nodes.find(current => current.id === 'first'), { type: 'TIMER', props: {
    timerType: 'FIXED_TIME', fixedTime: new Date(Date.now() + 86400000).toISOString().slice(0, 19), timerAction: 'AUTO_PASS',
  } });
  const timerDefinition = await definition('rewind-timer', timerGraph);
  const timed = await enter(timerDefinition, 'rewind-timer');
  const pendingTimer = Object.values(waitState(timed))[0];
  check('回退前网关定时分支有持久等待', pendingTimer?.kind === 'TIMER' && pendingTimer.executionContext != null);
  successful(await reject(taskAt(timed, 'second'), 'TO_INITIATOR'), '另一分支真实退回发起人');
  check('退回发起人清除所有失效等待并使用无分支上下文的修改任务', Object.keys(waitState(timed)).length === 0
    && activations(timed)[0].status === 'CANCELLED' && tasks(timed).length === 1 && taskAt(timed, 'start').context === null && status(timed) === 'TASK_BACK');
  denied(await post(admin, `/workflow/wf/instance/${timed}/timer/first/finish`, { reason: 'old-wait-replay' }), '回退后的旧定时等待无法恢复执行');
  check('旧等待重放不影响发起人修改任务', tasks(timed).length === 1 && taskAt(timed, 'start').context === null);
  assertSequence(timed);

  const childDefinition = await definition('rewind-child', {
    nodes: [{ id: 'start', type: 'START', title: '子流程开始' }, node('childApproval'), { id: 'end', type: 'END', title: '子流程结束' }],
    edges: [edge('start', 'childApproval'), edge('childApproval', 'end')],
  });
  const childKey = database(`SELECT process_key FROM wf_process_definition WHERE definition_id=${quote(childDefinition)};`);
  const parentGraph = model();
  Object.assign(parentGraph.nodes.find(current => current.id === 'first'), { type: 'SUBPROCESS', props: { subprocessId: childKey, waitForCompletion: true } });
  const parentDefinition = await definition('rewind-parent', parentGraph);
  const parent = await enter(parentDefinition, 'rewind-parent');
  const oldChild = Object.values(waitState(parent))[0];
  const parentSibling = taskAt(parent, 'second');
  assert.ok(oldChild && oldChild.kind === 'SUBPROCESS');
  check('子流程未继承父流程历史序号与失效集合', variables(oldChild.waitId)._wf_history_sequence === undefined
    && variables(oldChild.waitId)._wf_invalidated_histories === undefined);
  successful(await reject(taskAt(oldChild.waitId, 'childApproval'), 'TO_PARENT_NODE'), '子流程审批真实退回父调用节点');
  const replacement = Object.values(waitState(parent))[0];
  check('退回父调用取消旧子流程并重新绑定新子流程等待', status(oldChild.waitId) === 'REJECTED'
    && replacement?.kind === 'SUBPROCESS' && replacement.waitId !== oldChild.waitId
    && replacement.executionContext === oldChild.executionContext && tasks(replacement.waitId).length === 1);
  check('子流程退回父节点保持外层轮次与兄弟任务', JSON.stringify(taskAt(parent, 'second')) === JSON.stringify(parentSibling)
    && activations(parent).length === 1 && activations(parent)[0].status === 'WAITING' && arrivals(parent).length === 0);
  successful(await complete(taskAt(replacement.waitId, 'childApproval'), 'replacement-child'), '新子流程审批真实完成');
  const deadline = Date.now() + 30000;
  while (Object.keys(waitState(parent)).length && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 250));
  check('旧子流程结束回调不覆盖新子流程完成结果', Object.keys(waitState(parent)).length === 0 && arrivals(parent).length === 1
    && tasks(parent).length === 1 && taskAt(parent, 'second').id === parentSibling.id);
  successful(await complete(parentSibling, 'parent-sibling'), '父流程保留的兄弟分支完成');
  await finish(parent, 'parent');
  assertSequence(parent);

  const cancelledParent = await enter(parentDefinition, 'rewind-parent-cancel');
  const cancelledChild = Object.values(waitState(cancelledParent))[0];
  successful(await reject(taskAt(cancelledParent, 'second'), 'TO_SPECIFIED_NODE', 'pre'), '父流程回退网关前首审');
  check('父流程跨网关回退递归清除失效子流程及其任务', status(cancelledChild.waitId) === 'CANCELLED' && tasks(cancelledChild.waitId).length === 0
    && Object.keys(waitState(cancelledParent)).length === 0 && tasks(cancelledParent).length === 1 && taskAt(cancelledParent, 'pre').context === null);
  assertSequence(cancelledParent);

  await verifyWithdrawalPages();
  async function verifyWithdrawalPages() {
  for (const mobile of [false, true]) {
    const label = mobile ? '手机' : '电脑';
    const instanceId = await enter(branches, `withdraw-ui-${mobile ? 'mobile' : 'desktop'}`);
    successful(await complete(taskAt(instanceId, 'first'), 'withdraw-ui-first'), '撤回页面先完成真实审批');
    const history = approved(instanceId, 'first');
    const title = database(`SELECT title FROM wf_process_instance WHERE instance_id=${quote(instanceId)};`);
    const donePath = `/workflow/wf/done?${new URLSearchParams({ pageSize: '100', 'params[keyword]': title })}`;
    const ownDone = successful(await api(manager, donePath), '本人读取撤回页面的真实已办记录');
    check(`${label}已办接口返回可撤回标记和真实历史编号`, ownDone.rows.some(record => record.historyId === history.id && record.canWithdraw === true));
    const unrelatedDone = successful(await api(employee, donePath), '其他员工读取自己的已办列表');
    check(`${label}他人已办列表不泄漏本人审批历史`, !unrelatedDone.rows.some(record => record.historyId === history.id));
    const posts = [];
    const trackWithdrawal = request => { if (request.method() === 'POST' && request.url().endsWith('/workflow/enhance/task/withdraw')) posts.push(request.url()); };
    manager.on('request', trackWithdrawal);
    try {
      await manager.setViewportSize(mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 });
      if (mobile) await manager.addInitScript(() => Object.defineProperty(navigator, 'maxTouchPoints', { configurable: true, get: () => 1 }));
      await manager.goto(new URL('/tasks', manager.url()).href);
      if (mobile) await manager.getByRole('heading', { name: '我的任务', exact: true }).waitFor();
      const doneLoaded = manager.waitForResponse(response => response.url().includes('/workflow/wf/done') && response.request().method() === 'GET');
      await manager.getByRole('button', { name: '已办', exact: true }).click();
      assert.equal((await doneLoaded).status(), 200);
      const filterLoaded = manager.waitForResponse(response => response.url().includes('/workflow/wf/done') && response.url().includes('keyword'));
      await manager.getByPlaceholder('流程标题或编号', { exact: true }).fill(title);
      await manager.getByPlaceholder('流程标题或编号', { exact: true }).press('Enter');
      assert.equal((await filterLoaded).status(), 200);
      const row = manager.locator(`[data-history-id="${history.id}"]`);
      const button = row.getByRole('button', { name: '撤回本人审批', exact: true });
      await button.waitFor();
      await button.scrollIntoViewIfNeeded();
      const buttonBounds = await button.boundingBox();
      check(`${label}撤回入口触控区域至少44像素且页面无横向溢出`, buttonBounds.width >= 44 && buttonBounds.height >= 44
        && await manager.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
      const before = JSON.stringify({ tasks: tasks(instanceId), histories: histories(instanceId), variables: variables(instanceId) });
      await button.focus();
      await button.press('Enter');
      const dialog = manager.getByRole('dialog', { name: '撤回本人审批', exact: true });
      await dialog.waitFor();
      check(`${label}键盘操作只打开撤回确认并保留原审批`, await manager.getByRole('dialog').count() === 1 && posts.length === 0
        && JSON.stringify({ tasks: tasks(instanceId), histories: histories(instanceId), variables: variables(instanceId) }) === before);
      await dialog.getByRole('button', { name: '取消', exact: true }).click();
      await dialog.waitFor({ state: 'hidden' });
      check(`${label}取消撤回没有写请求也不改变记录`, posts.length === 0 && JSON.stringify({ tasks: tasks(instanceId), histories: histories(instanceId), variables: variables(instanceId) }) === before);
      await button.click();
      await dialog.waitFor();
      const confirm = dialog.getByRole('button', { name: '确认撤回', exact: true });
      const confirmBounds = await confirm.boundingBox();
      const panelBounds = await dialog.locator('.cf-dialog-panel').boundingBox();
      check(`${label}确认按钮44像素且弹窗处于屏幕内`, confirmBounds.height >= 44 && panelBounds.x >= 0
        && panelBounds.x + panelBounds.width <= (mobile ? 390 : 1440) && panelBounds.height <= (mobile ? 844 : 1000));
      await manager.screenshot({ path: path.join(harness.directory, `h1-withdrawal-${mobile ? 'mobile' : 'desktop'}-${caseTag}.png`), fullPage: true });
      const submitted = manager.waitForResponse(response => response.url().endsWith('/workflow/enhance/task/withdraw'));
      await confirm.evaluate(element => { element.click(); element.click(); });
      check(`${label}二次确认只提交一次且真实返回成功`, (await (await submitted).json()).code === 200 && posts.length === 1);
      await dialog.waitFor({ state: 'hidden' });
      await button.waitFor({ state: 'hidden' });
      check(`${label}撤回后保留旧历史、重建本支并刷新按钮`, tasks(instanceId).map(task => task.node).join(',') === 'first,second'
        && histories(instanceId).some(record => record.id === history.id) && variables(instanceId)._wf_invalidated_histories.includes(history.id));
      const after = successful(await api(manager, donePath), '撤回后读取真实已办记录');
      check(`${label}旧记录不再具有可撤回资格`, after.rows.some(record => record.historyId === history.id && record.canWithdraw !== true));
      successful(await complete(taskAt(instanceId, 'second'), 'trace-right-first'), '轨迹页面先完成兄弟分支首审');
      successful(await complete(taskAt(instanceId, 'secondNext'), 'trace-right-arrive'), '轨迹页面形成一条真实到达');
      const progress = successful(await api(manager, `/workflow/wf/instance/${instanceId}/trace`), '读取真实网关轮次进度');
      const round = activations(instanceId)[0];
      const roundTrace = progress.gatewayRounds.find(item => item.roundId === round.id);
      check(`${label}轨迹接口显示本轮1/2且不泄漏服务器上下文`, roundTrace.status === 'WAITING' && roundTrace.expectedCount === 2 && roundTrace.arrivedCount === 1
        && !JSON.stringify(progress).includes('executionContext') && !JSON.stringify(progress).includes('parentContext'));
      await row.click();
      await manager.getByRole('button', { name: '审批记录', exact: true }).click();
      const progressPanel = manager.getByRole('region', { name: '分支汇聚进度', exact: true });
      await progressPanel.waitFor();
      check(`${label}真实轨迹页面显示等待汇聚和到达数`, (await progressPanel.innerText()).includes('已到达 1/2 个分支')
        && (await progressPanel.innerText()).includes('等待汇聚'));
      await manager.getByRole('button', { name: '流程图', exact: true }).click();
      await manager.locator('[data-workflow-node="split"]').waitFor();
      check(`${label}运行流程图保留包含网关并只绘制一次配对汇聚`, await manager.locator('[data-workflow-node="split"][data-node-type="INCLUSIVE"]').count() === 1
        && await manager.locator('[data-workflow-node="join"]').count() === 1);
      await manager.screenshot({ path: path.join(harness.directory, `h1-gateway-trace-${mobile ? 'mobile' : 'desktop'}-${caseTag}.png`), fullPage: true });
      await manager.getByRole('button', { name: '关闭弹窗', exact: true }).click();
      successful(await complete(taskAt(instanceId, 'first'), 'trace-left-first'), '轨迹剩余本支完成首审');
      successful(await complete(taskAt(instanceId, 'firstNext'), 'trace-left-arrive'), '轨迹最后一支真实汇聚');
      const released = successful(await api(manager, `/workflow/wf/instance/${instanceId}/trace`), '读取汇聚后的真实轮次进度');
      check(`${label}轨迹只将本轮标为已汇聚2/2`, released.gatewayRounds.length === 1 && released.gatewayRounds[0].roundId === round.id
        && released.gatewayRounds[0].status === 'RELEASED' && released.gatewayRounds[0].arrivedCount === 2);
      await finish(instanceId, `trace-${mobile}`);
      assertSequence(instanceId);
    } finally {
      manager.off('request', trackWithdrawal);
    }
  }
  }
}
