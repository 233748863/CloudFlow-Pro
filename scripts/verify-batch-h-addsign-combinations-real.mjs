export async function verifySignatureCombinations(harness) {
  const { admin, manager, employee, hr, people, api, post, successful, database, check, caseTag, quote, rows,
    model, definition, enter, complete, finish, tasks, activations, arrivals, status, denied,
    scenario, groups, members, add, pending, reminderScores, definitionId } = harness;
  const employeeId = 990000707;
  const hrId = 990000705;
  const endpoint = '/workflow/enhance/task';
  const delegate = (page, task, targetUserId, mode) => post(page, `${endpoint}/delegate`, {
    taskId: task.id, toUserId: targetUserId, toUserName: 'FORGED_NAME', mode, reason: `${caseTag}-${mode}-${task.id}`,
  });
  const lookup = (instanceId, taskId) => tasks(instanceId).find(task => task.id === taskId);
  const scoresPresent = taskId => reminderScores(taskId).every(score => score !== '');
  const scoresAbsent = taskId => reminderScores(taskId).every(score => score === '');

  const countersignGraph = model();
  Object.assign(countersignGraph.nodes.find(node => node.id === 'first'), {
    approverValue: '990000706,990000705', signType: 'ALL', allowAddSign: true, allowReduceSign: true, slaHours: 4,
  });
  const countersignDefinition = await definition('sign-combination-countersign', countersignGraph);
  const countersigned = await enter(countersignDefinition, 'sign-combination-countersign');
  successful(await complete(tasks(countersigned).find(task => task.node === 'second'), 'combination-other'), '会签之外的分支通过');
  const sourceSeat = tasks(countersigned).find(task => task.assignee === '990000706');
  successful(await post(manager, '/workflow/wf/task/add-signature', {
    taskId: sourceSeat.id, userIds: [employeeId], comment: `${caseTag}-add-seat`,
  }), '现有会签入口增加真实席位');
  const extraSeat = tasks(countersigned).find(task => task.assignee === String(employeeId));
  check('会签新增席位保留真实节点及网关上下文', extraSeat.node === sourceSeat.node
    && JSON.stringify(extraSeat.context) === JSON.stringify(sourceSeat.context));
  successful(await post(manager, '/workflow/wf/task/reduction-signature', {
    taskId: sourceSeat.id, userIds: [employeeId], comment: `${caseTag}-remove-seat`,
  }), '现有会签入口减少尚未处理的真实席位');
  for (const task of tasks(countersigned)) successful(await complete(task, `combination-seat-${task.assignee}`), '剩余会签席位完成');
  await finish(countersigned, 'combination-countersign');
  check('会签加减席位不遗留普通顺序加签组', groups(countersigned).length === 0
    && database(`SELECT COUNT(*) FROM wf_task_history WHERE instance_id=${quote(countersigned)} AND action='ADD_SIGN' AND task_type='ADD_SIGN';`) === '1');
  check('会签减签移除真实提醒及超时索引', scoresAbsent(extraSeat.id));

  for (const standard of [false, true]) {
    const transferred = await scenario(`transfer-${standard ? 'standard' : 'enhance'}`);
    successful(await add(manager, transferred.original, 'AFTER', [hrId]), '转办前创建后加签');
    const response = standard
      ? await post(manager, '/workflow/wf/complete', { taskId: transferred.original.id, action: 'DELEGATE', delegateUserId: String(employeeId), comment: `${caseTag}-standard-transfer` })
      : await delegate(manager, transferred.original, employeeId, 'TRANSFER');
    successful(response, '后加签原审批通过真实入口转办');
    const replacement = tasks(transferred.instanceId)[0];
    check('转办保留加签组、真实节点和网关轮次', replacement.assignee === String(employeeId)
      && replacement.node === transferred.original.node && JSON.stringify(replacement.context) === JSON.stringify(transferred.original.context)
      && groups(transferred.instanceId)[0].taskId === replacement.id && scoresPresent(replacement.id));
    denied(await complete({ ...replacement, assignee: transferred.original.assignee }, 'transfer-old-owner'), '原负责人不能继续办理已转办的加签原任务', [403]);
    const oldList = successful(await api(manager, `${endpoint}/signatures/pending?pageSize=100`), '原负责人读取本人加签列表');
    const newList = successful(await api(employee, `${endpoint}/signatures/pending?pageSize=100`), '新负责人读取本人加签列表');
    check('转办后加签管理归属当前负责人', !oldList.rows.some(group => group.taskId === replacement.id)
      && newList.rows.some(group => group.taskId === replacement.id));
    successful(await complete(replacement, 'transfer-owner'), '受转办人通过后才分派后加签');
    successful(await complete(members(transferred.instanceId)[0], 'transfer-sign'), '后加签完成转办后审批');
    await finish(transferred.instanceId, 'transferred-sign');
  }

  const delegatedOwner = await scenario('delegate-original');
  successful(await add(manager, delegatedOwner.original, 'AFTER', [hrId]), '委派前创建后加签');
  const delegated = successful(await delegate(manager, delegatedOwner.original, employeeId, 'DELEGATE'), '后加签原审批可以委派');
  check('委派暂停原审批提醒并给受委派人注册提醒', lookup(delegatedOwner.instanceId, delegatedOwner.original.id).status === 'DELEGATED'
    && scoresAbsent(delegatedOwner.original.id) && scoresPresent(delegated.delegatedTaskId));
  successful(await complete(lookup(delegatedOwner.instanceId, delegated.delegatedTaskId), 'delegated-owner-return'), '受委派人完成后交还原审批');
  pending(delegatedOwner.instanceId, '委派交还不越过原审批和后加签');
  check('交还恢复原审批提醒且尚未分派后加签', members(delegatedOwner.instanceId).length === 0
    && lookup(delegatedOwner.instanceId, delegatedOwner.original.id).status === 'TODO' && scoresPresent(delegatedOwner.original.id));
  successful(await complete(lookup(delegatedOwner.instanceId, delegatedOwner.original.id), 'delegated-restored-owner'), '原负责人确认受委派结果');
  successful(await complete(members(delegatedOwner.instanceId)[0], 'delegated-after-sign'), '委派交还后的后加签通过');
  await finish(delegatedOwner.instanceId, 'delegated-owner');

  for (const transfer of [false, true]) {
    const process = await scenario(`member-${transfer ? 'transfer' : 'delegate'}`);
    successful(await add(manager, process.original, 'BEFORE', [hrId]), '前加签成员参与转办委派组合');
    const originalMember = members(process.instanceId)[0];
    const response = successful(await delegate(hr, originalMember, employeeId, transfer ? 'TRANSFER' : 'DELEGATE'), '加签成员按节点许可移交任务');
    const assigned = transfer ? lookup(process.instanceId, originalMember.id) : lookup(process.instanceId, response.delegatedTaskId);
    denied(await add(employee, assigned, 'PARALLEL', [hrId]), '受委派或加签子任务拒绝再次配置普通加签顺序', [400]);
    successful(await complete(assigned, 'member-recipient'), '加签成员的接收人完成真实任务');
    if (!transfer) {
      pending(process.instanceId, '加签成员委派交还仍等待原成员确认');
      check('加签成员委派只交还本席位且原审批仍暂停', lookup(process.instanceId, process.original.id).status === 'SUSPENDED'
        && lookup(process.instanceId, originalMember.id).status === 'TODO' && scoresPresent(originalMember.id));
      successful(await complete(lookup(process.instanceId, originalMember.id), 'member-return-confirmation'), '加签成员确认委派结果');
    }
    pending(process.instanceId, '加签成员移交完成仍须原负责人审批');
    successful(await complete(lookup(process.instanceId, process.original.id), 'member-restored-owner'), '原负责人在加签移交完成后审批');
    await finish(process.instanceId, 'member-transfer-delegate');
  }

  const window = rows("SELECT JSON_OBJECT('startTime',DATE_FORMAT(DATE_SUB(NOW(),INTERVAL 1 MINUTE),'%Y-%m-%d %H:%i:%s'),'endTime',DATE_FORMAT(DATE_ADD(NOW(),INTERVAL 1 HOUR),'%Y-%m-%d %H:%i:%s'));")[0];
  let setting;
  try {
    setting = successful(await post(manager, '/workflow/agent-setting', { agentUserId: employeeId, agentMode: 'AGENT',
      definitionIds: [definitionId], ...window, reason: `${caseTag}-sign-agent` }), '创建仅适用本轮定义的真实代理设置');
    const delegated = await scenario('agent-sign');
    successful(await add(employee, delegated.original, 'AFTER', [hrId]), '有效代理可按原节点许可增加后加签');
    successful(await complete({ ...delegated.original, assignee: String(employeeId) }, 'agent-original'), '有效代理完成原负责人审批');
    check('加签原审批历史保留真实代理人与被代理人', database(`SELECT CONCAT(operator_id,':',on_behalf_of_user_id) FROM wf_task_history WHERE task_id=${quote(delegated.original.id)} AND action='APPROVE';`) === '990000707:990000706');
    successful(await complete(members(delegated.instanceId)[0], 'agent-after-sign'), '代理审批后的后加签完成');
    await finish(delegated.instanceId, 'agent-sign');
    setting = successful(await api(manager, `/workflow/agent-setting/${setting.settingId}`, { method: 'PUT', body: {
      agentUserId: employeeId, agentMode: 'AGENT_ASSIST', definitionIds: [definitionId], ...window, reason: `${caseTag}-sign-assist`, version: setting.version,
    } }), '代理调整为仅协办');
    const assisted = await scenario('assist-sign');
    successful(await add(manager, assisted.original, 'PARALLEL', [hrId]), '原负责人为协办中的任务增加并行加签');
    const snapshot = JSON.stringify({ tasks: tasks(assisted.instanceId), groups: groups(assisted.instanceId) });
    denied(await add(employee, assisted.original, 'BEFORE', [hrId]), '协办不能增加普通顺序加签', [403]);
    denied(await post(employee, `${endpoint}/removeSign`, { taskId: assisted.original.id, userIds: [hrId], reason: `${caseTag}-forged-assist-reduce` }), '协办不能减少原负责人加签', [403]);
    check('协办加减签拒绝不改变任务或加签组', snapshot === JSON.stringify({ tasks: tasks(assisted.instanceId), groups: groups(assisted.instanceId) }));
    successful(await complete(lookup(assisted.instanceId, assisted.original.id), 'assist-owner'), '协办场景原负责人真实审批');
    successful(await complete(members(assisted.instanceId)[0], 'assist-member'), '协办场景加签人真实审批');
    await finish(assisted.instanceId, 'assist-sign');
  } finally {
    if (setting) {
      const latest = successful(await api(manager, '/workflow/agent-setting/mine?pageSize=100'), '读取待清理的本人代理设置').rows.find(row => row.settingId === setting.settingId);
      successful(await api(manager, `/workflow/agent-setting/${setting.settingId}?version=${latest.version}`, { method: 'DELETE' }), '停用本轮隔离代理设置');
    }
  }

  const rejected = await scenario('sign-rejected');
  successful(await add(manager, rejected.original, 'PARALLEL', [hrId]), '创建加签驳回组合');
  successful(await complete(rejected.original, 'rejected-owner'), '加签驳回前原负责人通过');
  const rejectedTasks = tasks(rejected.instanceId);
  successful(await complete(members(rejected.instanceId)[0], 'member-rejected', undefined, 'REJECT'), '加签人驳回真实终止流程');
  check('加签人驳回取消原审批、所有成员、网关及提醒', status(rejected.instanceId) === 'REJECTED'
    && tasks(rejected.instanceId).length === 0 && groups(rejected.instanceId)[0].status === 'CANCELLED'
    && activations(rejected.instanceId)[0].status === 'CANCELLED' && rejectedTasks.every(task => scoresAbsent(task.id)));

  const rewound = await scenario('sign-rewind');
  successful(await add(manager, rewound.original, 'BEFORE', [hrId]), '创建加签回退组合');
  const rewindTasks = tasks(rewound.instanceId);
  successful(await post(hr, '/workflow/wf/reject', { taskId: members(rewound.instanceId)[0].id,
    strategy: 'TO_SPECIFIED_NODE', targetNodeKey: 'pre', comment: `${caseTag}-sign-rewind` }), '加签人真实驳回网关上游');
  check('加签回退取消旧组与网关并重建上游待办', groups(rewound.instanceId)[0].status === 'CANCELLED'
    && activations(rewound.instanceId)[0].status === 'CANCELLED' && tasks(rewound.instanceId).length === 1
    && tasks(rewound.instanceId)[0].node === 'pre' && rewindTasks.every(task => scoresAbsent(task.id)));
  successful(await complete(tasks(rewound.instanceId)[0], 'sign-rewind-pre'), '回退后重新进入网关');
  for (const task of tasks(rewound.instanceId)) successful(await complete(task, `sign-rewind-${task.node}`), '回退后的新轮次分支正常完成');
  await finish(rewound.instanceId, 'sign-rewind');

  const withdrawn = await scenario('sign-withdraw');
  successful(await add(manager, withdrawn.original, 'AFTER', [hrId]), '创建后加签撤回组合');
  successful(await complete(withdrawn.original, 'sign-withdraw-owner'), '后加签撤回前原负责人完成审批');
  const historyId = database(`SELECT history_id FROM wf_task_history WHERE task_id=${quote(withdrawn.original.id)} AND action='APPROVE';`);
  successful(await post(manager, `${endpoint}/withdraw`, { historyId }), '原负责人可撤回后加签中的本人审批');
  check('撤回后加签取消旧组且只恢复原负责人待办', groups(withdrawn.instanceId)[0].status === 'CANCELLED'
    && tasks(withdrawn.instanceId).length === 1 && tasks(withdrawn.instanceId)[0].assignee === withdrawn.original.assignee
    && tasks(withdrawn.instanceId)[0].status === 'TODO' && arrivals(withdrawn.instanceId).length === 1);
  successful(await complete(tasks(withdrawn.instanceId)[0], 'withdraw-redo-owner'), '撤回后重新审批只到达一次');
  await finish(withdrawn.instanceId, 'sign-withdraw');

  const terminated = await scenario('sign-terminate-race');
  successful(await add(manager, terminated.original, 'AFTER', [hrId]), '创建加签与终止并发组合');
  successful(await complete(terminated.original, 'termination-race-owner'), '并发终止前原负责人先通过');
  const last = members(terminated.instanceId)[0];
  const competing = await Promise.all([complete(last, 'termination-race-member'), post(admin, '/workflow/wf/instance/terminate', {
    instanceId: terminated.instanceId, reason: `${caseTag}-termination-race`,
  })]);
  successful(competing[1], '并发管理员终止成功');
  check('末加签与终止竞争没有重复放行或残留待办', [200, 403, 404, 409].includes(competing[0].status)
    && status(terminated.instanceId) === 'TERMINATED' && tasks(terminated.instanceId).length === 0
    && groups(terminated.instanceId).every(group => group.status !== 'PENDING') && scoresAbsent(last.id)
    && activations(terminated.instanceId).every(round => round.status !== 'WAITING') && arrivals(terminated.instanceId).length <= 2);
}
