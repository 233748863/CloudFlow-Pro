import assert from 'node:assert/strict';
import { ownedGatewayRedis } from './owned-gateway-redis.mjs';
import { verifySignaturePages } from './verify-batch-h-addsign-ui-real.mjs';
import { verifySignatureCombinations } from './verify-batch-h-addsign-combinations-real.mjs';

export async function verifyOrderedSignatures(harness) {
  const { admin, manager, employee, hr, foreign, api, post, successful, database, check, caseTag, state, directory,
    quote, rows, model, definition, enter, complete, finish, tasks, activations, arrivals, status, denied } = harness;
  const endpoint = '/workflow/enhance/task';
  const employeeId = 990000707;
  const hrId = 990000705;
  const redis = await ownedGatewayRedis(state, directory);
  const reminderScores = taskId => [
    ...[60, 30, 10].map(minutes => ['100000:sys:task:reminders', `${taskId}:${minutes}`]),
    ['100000:sys:task:timeouts', taskId],
  ].map(([key, member]) => redis('ZSCORE', key, JSON.stringify(member)));
  const groups = instanceId => rows(`SELECT JSON_OBJECT('id',add_sign_id,'taskId',task_id,'type',sign_type,'status',status,'users',sign_user_ids,'names',sign_user_names,'completed',complete_time) FROM wf_task_add_sign WHERE tenant_id=100000 AND instance_id=${quote(instanceId)} ORDER BY create_time,add_sign_id;`);
  const members = instanceId => tasks(instanceId).filter(task => database(`SELECT candidate_roles FROM wf_task WHERE task_id=${quote(task.id)};`).startsWith('ADDSIGN_MEMBER:'));
  const historyCount = instanceId => database(`SELECT COUNT(*) FROM wf_task_history WHERE instance_id=${quote(instanceId)};`);
  const add = (page, task, type, userIds = [employeeId, hrId], reason = type) => post(page, `${endpoint}/addSign`, {
    taskId: task.id, signType: type, userIds, userNames: userIds.map(() => 'FORGED_NAME'), reason: `${caseTag}-${reason}`,
  });
  const reduce = (page, task, userIds, reason) => post(page, `${endpoint}/removeSign`, { taskId: task.id, userIds, reason: `${caseTag}-${reason}` });
  const graph = model();
  Object.assign(graph.nodes.find(node => node.id === 'first'), { allowAddSign: true, allowReduceSign: true, allowDelegate: true, allowAgent: true, allowRollback: true, slaHours: 4 });
  const definitionId = await definition('ordered-signatures', graph);
  async function scenario(name) {
    const instanceId = await enter(definitionId, `sign-${name}`);
    const original = tasks(instanceId).find(task => task.node === 'first');
    check('加签前原任务具有三条提醒及超时索引', reminderScores(original.id).every(score => score !== ''));
    successful(await complete(tasks(instanceId).find(task => task.node === 'second'), `sign-${name}-other`), '无加签的另一分支独立通过');
    return { instanceId, original };
  }
  const pending = (instanceId, label) => check(label, arrivals(instanceId).length === 1 && activations(instanceId)[0].status === 'WAITING'
    && !tasks(instanceId).some(task => task.node === 'join') && status(instanceId) === 'RUNNING');
  if (harness.addSignUiOnly) {
    await verifySignaturePages({ ...harness, scenario, groups, pending });
    return;
  }
  const combinations = () => verifySignatureCombinations({ ...harness, scenario, groups, members, add, pending, reminderScores, definitionId });
  if (process.argv.includes('--addsign-combinations-only')) {
    await combinations();
    return;
  }

  for (const type of ['BEFORE', 'AFTER', 'PARALLEL']) {
    const { instanceId, original } = await scenario(type);
    successful(await add(manager, original, type), `${type}真实创建加签组`);
    check(`${type}加签姓名来自真实用户且组引用原任务`, groups(instanceId).length === 1 && groups(instanceId)[0].taskId === original.id
      && !groups(instanceId)[0].names.includes('FORGED_NAME') && groups(instanceId)[0].status === 'PENDING');
    const held = tasks(instanceId).find(task => task.id === original.id);
    check(`${type}原负责人和真实节点保持不变`, held.assignee === original.assignee && held.node === original.node && JSON.stringify(held.context) === JSON.stringify(original.context));
    if (type === 'BEFORE') {
      check('前加签暂停原审批且取消其提醒', held.status === 'SUSPENDED' && members(instanceId).length === 2
        && reminderScores(original.id).every(score => score === ''));
      denied(await complete(original, 'before-cannot-approve'), '前加签结束前原审批不能通过', [409]);
    } else if (type === 'AFTER') {
      check('后加签在原审批通过前不分派成员', held.status === 'TODO' && members(instanceId).length === 0);
      successful(await complete(held, 'after-original'), '原审批通过后真实分派后加签');
      check('后加签期间原审批保留为暂停且已有真实通过历史', tasks(instanceId).find(task => task.id === original.id)?.status === 'SUSPENDED'
        && members(instanceId).length === 2 && database(`SELECT COUNT(*) FROM wf_task_history WHERE task_id=${quote(original.id)} AND action='APPROVE';`) === '1');
    }
    const added = members(instanceId);
    check(`${type}加签成员使用同一真实节点和独立任务编号`, added.length === 2 && added.every(task => task.node === original.node
      && task.id !== original.id && JSON.stringify(task.context) === JSON.stringify(original.context)));
    successful(await complete(added[0], `${type}-first`), '第一位加签人员真实审批');
    pending(instanceId, `${type}一位加签人员完成后仍等待`);
    successful(await complete(added[1], `${type}-last`), '最后一位加签人员真实审批');
    if (type === 'BEFORE' || type === 'PARALLEL') {
      pending(instanceId, `${type}成员全通过仍须等待原负责人`);
      const restored = tasks(instanceId).find(task => task.id === original.id);
      check(`${type}原任务恢复或保持可处理并具有完整提醒`, restored.status === 'TODO' && restored.assignee === original.assignee
        && reminderScores(original.id).every(score => score !== ''));
      successful(await complete(restored, `${type}-original`), '原负责人完成其本人审批');
    }
    check(`${type}整个加签组只产生一次网关到达`, groups(instanceId)[0].status === 'COMPLETED' && groups(instanceId)[0].completed
      && arrivals(instanceId).length === 2 && activations(instanceId)[0].version === 1);
    await finish(instanceId, `${type}-signatures`);
    check(`${type}已完成组拒绝旧成员重放`, (await complete(added[0], `${type}-replay`)).body?.code !== 200
      && arrivals(instanceId).length === 2 && historyCount(instanceId) === '6');
  }

  const concurrent = await scenario('parallel-concurrent');
  successful(await add(manager, concurrent.original, 'PARALLEL'), '创建并发加签组');
  successful(await complete(concurrent.original, 'parallel-owner-first'), '并行加签原负责人先完成');
  pending(concurrent.instanceId, '原负责人先完成仍等待全部加签');
  const concurrentMembers = members(concurrent.instanceId);
  const responses = await Promise.all(concurrentMembers.map((task, index) => complete(task, `parallel-concurrent-${index}`)));
  responses.forEach(response => successful(response, '加签成员并发审批成功'));
  check('末两位加签并发只有一次汇聚放行', groups(concurrent.instanceId)[0].status === 'COMPLETED'
    && arrivals(concurrent.instanceId).length === 2 && activations(concurrent.instanceId)[0].version === 1);
  await finish(concurrent.instanceId, 'parallel-concurrent');

  const reduced = await scenario('remove-last');
  successful(await add(manager, reduced.original, 'AFTER'), '创建减签验收组');
  successful(await complete(reduced.original, 'reduce-original'), '减签前原审批先通过');
  denied(await reduce(employee, reduced.original, [hrId], 'not-owner'), '加签人员无权减少原负责人的审批组', [403]);
  successful(await reduce(manager, reduced.original, [employeeId, hrId], 'remove-pending'), '原负责人可移除全部尚未处理的后加签');
  check('减签最后成员后按真实原审批推进一次', groups(reduced.instanceId)[0].status === 'COMPLETED'
    && arrivals(reduced.instanceId).length === 2 && database(`SELECT COUNT(*) FROM wf_task_history WHERE instance_id=${quote(reduced.instanceId)} AND action='REMOVE_SIGN';`) === '2');
  check('减签监控进入取消终态并记录完成时间', database(`SELECT COUNT(*) FROM wf_task_monitor WHERE instance_id=${quote(reduced.instanceId)} AND action='REMOVE_SIGN' AND status='CANCELLED' AND complete_time IS NOT NULL;`) === '2');
  await finish(reduced.instanceId, 'remove-last');

  const beforeRemoval = await scenario('before-remove');
  successful(await add(manager, beforeRemoval.original, 'BEFORE', [hrId]), '创建只有一人的前加签');
  successful(await reduce(manager, beforeRemoval.original, [hrId], 'remove-before'), '前加签最后成员减签');
  pending(beforeRemoval.instanceId, '前加签减签恢复原审批且不替原负责人通过');
  check('前加签减签恢复原任务提醒', tasks(beforeRemoval.instanceId)[0].status === 'TODO'
    && reminderScores(beforeRemoval.original.id).every(score => score !== ''));
  successful(await complete(tasks(beforeRemoval.instanceId)[0], 'before-removed-owner'), '减签后原负责人真实审批');
  await finish(beforeRemoval.instanceId, 'before-remove');

  const planned = await scenario('planned-removal');
  successful(await add(manager, planned.original, 'AFTER'), '创建尚未分派的后加签');
  const plannedContext = successful(await api(manager, `${endpoint}/${planned.original.id}/signatures`), '读取后加签真实人员上下文');
  check('尚未分派的后加签可由原负责人管理', plannedContext.kind === 'ORDERED' && plannedContext.canReduce
    && !plannedContext.canAdd && plannedContext.members.length === 2 && plannedContext.members.every(member => member.status === 'PLANNED'));
  denied(await api(employee, `${endpoint}/${planned.original.id}/signatures`), '其他员工不能读取本人加签管理上下文', [403]);
  denied(await api(foreign, `${endpoint}/${planned.original.id}/signatures`), '跨租户无法探知加签管理上下文', [403, 404]);
  successful(await reduce(manager, planned.original, [employeeId], 'reduce-future-member'), '未分派后加签可减少一位人员');
  check('未分派减签保留原审批并审计被移除用户', groups(planned.instanceId)[0].users === String(hrId)
    && tasks(planned.instanceId).length === 1 && tasks(planned.instanceId)[0].status === 'TODO'
    && database(`SELECT JSON_EXTRACT(variables_changed, '$.removedUserIds[0]') FROM wf_task_history WHERE instance_id=${quote(planned.instanceId)} AND action='REMOVE_SIGN';`) === String(employeeId));
  successful(await reduce(manager, planned.original, [hrId], 'reduce-final-future-member'), '未分派后加签可减少最后一人');
  check('尚未分派的成员全移除后取消组且不替原负责人审批', groups(planned.instanceId)[0].status === 'CANCELLED'
    && tasks(planned.instanceId).length === 1 && tasks(planned.instanceId)[0].status === 'TODO');
  successful(await complete(tasks(planned.instanceId)[0], 'planned-removed-owner'), '取消后加签后原负责人独立审批');
  await finish(planned.instanceId, 'planned-removal');

  const forbidden = await scenario('guards');
  const snapshot = () => JSON.stringify({ tasks: tasks(forbidden.instanceId), groups: groups(forbidden.instanceId), history: historyCount(forbidden.instanceId), arrivals: arrivals(forbidden.instanceId) });
  const beforeForbidden = snapshot();
  denied(await add(foreign, forbidden.original, 'PARALLEL'), '其他租户不能对当前审批加签', [403, 404]);
  denied(await add(employee, forbidden.original, 'PARALLEL'), '非负责人不能创建加签', [403]);
  denied(await add(manager, forbidden.original, 'UNDEFINED'), '未知加签模式明确拒绝', [400]);
  denied(await add(manager, forbidden.original, 'BEFORE', [hrId, hrId]), '重复加签人员明确拒绝', [400]);
  denied(await add(manager, forbidden.original, 'AFTER', [Number(forbidden.original.assignee)]), '加签不能重复原负责人', [400]);
  check('全部权限和参数拒绝保持任务历史与加签组不变', snapshot() === beforeForbidden);
  const competing = await Promise.all(['first', 'second'].map(reason => add(manager, forbidden.original, 'PARALLEL', [hrId], reason)));
  check('同一原任务并发加签只创建一个组', competing.filter(response => response.status === 200 && response.body?.code === 200).length === 1
    && groups(forbidden.instanceId).length === 1 && members(forbidden.instanceId).length === 1);

  for (const type of ['BEFORE', 'AFTER', 'PARALLEL']) {
    const terminal = await scenario(`terminate-${type}`);
    successful(await add(manager, terminal.original, type), '创建终止场景加签');
    if (type === 'AFTER') successful(await complete(terminal.original, 'terminate-after-owner'), '终止前原负责人已通过');
    const pendingTasks = tasks(terminal.instanceId);
    successful(await post(admin, '/workflow/wf/instance/terminate', { instanceId: terminal.instanceId, reason: `${caseTag}-terminate-${type}` }), '真实管理员终止加签中流程');
    check(`${type}终止同时取消组、暂停原任务及成员`, status(terminal.instanceId) === 'TERMINATED' && tasks(terminal.instanceId).length === 0
      && groups(terminal.instanceId)[0].status === 'CANCELLED' && activations(terminal.instanceId)[0].status === 'CANCELLED');
    check(`${type}终止只在提交后清理全部任务提醒`, pendingTasks.every(task => reminderScores(task.id).every(score => score === '')));
  }

  const rollback = await scenario('rollback');
  successful(await add(manager, rollback.original, 'AFTER', [hrId]), '创建故障回滚后加签');
  successful(await complete(rollback.original, 'rollback-original'), '故障前原审批完成');
  const last = members(rollback.instanceId)[0];
  const fullSnapshot = () => JSON.stringify({ tasks: tasks(rollback.instanceId), groups: groups(rollback.instanceId), arrivals: arrivals(rollback.instanceId), activations: activations(rollback.instanceId), history: historyCount(rollback.instanceId) });
  const beforeRollback = fullSnapshot();
  const beforeReminder = reminderScores(last.id);
  const trigger = `h1_sign_fault_${caseTag}`;
  assert.match(trigger, /^h1_sign_fault_[a-f0-9]{12}$/);
  assert.equal(database(`SELECT COUNT(*) FROM information_schema.triggers WHERE trigger_schema='cloud_flow_db' AND trigger_name=${quote(trigger)};`), '0');
  let created = false;
  try {
    database(`DELIMITER $$\nCREATE TRIGGER ${trigger} BEFORE INSERT ON wf_task FOR EACH ROW BEGIN IF NEW.instance_id=${quote(rollback.instanceId)} AND NEW.node_key='join' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='H1_OWNED_ADDSIGN_FAULT'; END IF; END$$\nDELIMITER ;\n`);
    created = true;
    denied(await complete(last, 'last-injected-failure'), '最后加签之后的写库失败真实报错', [400, 500]);
    check('写库失败回滚加签组、原任务、历史、到达和放行', fullSnapshot() === beforeRollback);
    check('写库回滚保留最后加签任务全部提醒索引', beforeReminder.every(score => score !== '')
      && JSON.stringify(reminderScores(last.id)) === JSON.stringify(beforeReminder));
  } finally {
    if (created) database(`DROP TRIGGER ${trigger};`);
  }
  successful(await complete(last, 'last-retry'), '移除注入故障后最后加签重试成功');
  await finish(rollback.instanceId, 'last-retry');
  await combinations();
  await verifySignaturePages({ ...harness, scenario, groups, pending });
}
