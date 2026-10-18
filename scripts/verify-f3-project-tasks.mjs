import assert from 'node:assert/strict';

export async function verifyF3ProjectTasks(ctx) {
  const { admin, manager, employee, readonly, outsider, api, check, evidence, marker, quote, database, rows, get, post, put, remove,
    reject, shifted, project, taskList, createProject, createTask, addEmployee, snapshot } = ctx;
  const primary = await createProject('工时成本项目');
  const secondary = await createProject('第二经理项目', { ownerId: 990000701, ownerName: 'g_import_admin' });
  await addEmployee(primary);
  await addEmployee(secondary);
  const first = await createTask(primary, '原分组', { isGroupFlag: 1 });
  const second = await createTask(primary, '目标分组', { isGroupFlag: 1 });
  const branch = await createTask(primary, '整组移动', { isGroupFlag: 1, parentTaskId: first.taskId });
  const effort = await createTask(primary, '实际投入任务', { parentTaskId: branch.taskId, taskWeight: '3.00' });
  const sibling = await createTask(primary, '进度对照任务', { parentTaskId: branch.taskId, taskWeight: '1.00' });
  const extraTask = await createTask(secondary, '另一经理任务');
  const currentTask = async (target, id) => (await taskList(target.projectId)).find(value => value.taskId === id);
  const treePayload = async target => (await taskList(target.projectId)).map(value => ({
    taskId: value.taskId, parentTaskId: value.parentTaskId ?? null, sortNo: value.sortNo, version: value.version,
  }));
  const treeSnapshot = target => snapshot(`SELECT * FROM oa_project_task WHERE tenant_id=100000 AND project_id=${target.projectId} ORDER BY task_id;`);
  const treePath = target => '/oa/project/wbs/tree?projectId=' + target.projectId;
  const changeTask = async (target, id, patch) => {
    await put('/oa/project/wbs', { ...await currentTask(target, id), ...patch });
    return currentTask(target, id);
  };
  const originalTree = await treePayload(primary);
  await put(treePath(primary), originalTree.map(value => value.taskId === branch.taskId ? { ...value, parentTaskId: second.taskId } : value));
  const movedBranch = await currentTask(primary, branch.taskId);
  const movedEffort = await currentTask(primary, effort.taskId);
  check('AC-12 客户端字段真实移动完整分组并保留子任务', movedBranch.parentTaskId === second.taskId
    && movedEffort.parentTaskId === branch.taskId && movedEffort.levelPath === `/${second.taskId}/${branch.taskId}/${effort.taskId}/`);
  const staleBefore = treeSnapshot(primary);
  const stale = await api(admin, treePath(primary), { method: 'PUT', body: originalTree });
  reject(stale, 'AC-12 旧版本完整树被409拒绝', '任务树已变化，请刷新完整任务树后重试');
  check('AC-12 旧页面覆盖拒绝后全部任务保持', stale.status === 409 && treeSnapshot(primary) === staleBefore);
  const fresh = await treePayload(primary);
  for (const [label, command] of [
    ['重复编号', [...fresh.slice(0, -1), fresh[0]]],
    ['缺少任务', fresh.slice(0, -1)],
    ['循环层级', fresh.map(value => value.taskId === second.taskId ? { ...value, parentTaskId: branch.taskId } : value)],
    ['普通任务作父节点', fresh.map(value => value.taskId === sibling.taskId ? { ...value, parentTaskId: effort.taskId } : value)],
  ]) {
    const before = treeSnapshot(primary);
    reject(await api(admin, treePath(primary), { method: 'PUT', body: command }), 'AC-12 ' + label + '被真实拒绝');
    check('AC-12 ' + label + '拒绝后原树完整保持', treeSnapshot(primary) === before);
  }
  await put(treePath(primary), fresh.map(value => value.taskId === branch.taskId ? { ...value, parentTaskId: null } : value));
  check('AC-12 分组可真实移回根节点', (await currentTask(primary, branch.taskId)).parentTaskId == null);
  const depth2 = await createTask(primary, '第二层', { parentTaskId: first.taskId, isGroupFlag: 1 });
  const depth3 = await createTask(primary, '第三层', { parentTaskId: depth2.taskId, isGroupFlag: 1 });
  const depth4 = await createTask(primary, '第四层', { parentTaskId: depth3.taskId, isGroupFlag: 1 });
  const depth5 = await createTask(primary, '第五层', { parentTaskId: depth4.taskId, isGroupFlag: 1 });
  check('AC-12 五层任务树完整保存', depth5.levelPath.split('/').filter(Boolean).length === 5);
  const boundaryBefore = treeSnapshot(primary);
  reject(await api(admin, '/oa/project/wbs', { method: 'POST', body: { projectId: primary.projectId,
    subject: marker + '_第六层拒绝', parentTaskId: depth5.taskId, isGroupFlag: 0, isMilestoneFlag: 0,
    taskWeight: '1.00', plannedHours: '1.00', progress: 0 } }), 'AC-12 第六层任务被拒绝', '项目任务最多五层');
  check('AC-12 第六层失败回滚全部任务写入', treeSnapshot(primary) === boundaryBefore);
  await changeTask(primary, effort.taskId, { progress: '50.00', status: 'IN_PROGRESS' });
  await changeTask(primary, sibling.taskId, { progress: '100.00', status: 'COMPLETED' });
  check('AC-13 分组按50乘3加100乘1再除4得到62.50', Number((await currentTask(primary, branch.taskId)).progress) === 62.5);
  await changeTask(primary, branch.taskId, { progress: '99.99', status: 'COMPLETED' });
  check('AC-13 分组手填进度和状态不会覆盖子任务汇总', Number((await currentTask(primary, branch.taskId)).progress) === 62.5
    && (await currentTask(primary, branch.taskId)).status === 'IN_PROGRESS');
  const removable = await createTask(primary, '真实删除任务');
  await remove('/oa/project/wbs/' + removable.taskId);
  check('AC-12 删除任务实际写入且列表不可见', database(`SELECT deleted FROM oa_project_task WHERE tenant_id=100000 AND task_id=${removable.taskId};`) === '1'
    && !(await taskList(primary.projectId)).some(value => value.taskId === removable.taskId));
  evidence.tree = true;

  const dependency = async (predecessor, successor, type, lagDays = 0) => {
    await post('/oa/project/dependency', { projectId: primary.projectId, predecessorTaskId: predecessor.taskId,
      successorTaskId: successor.taskId, dependencyType: type, lagDays });
    const matches = (await get('/oa/project/' + primary.projectId + '/dependency/list')).filter(value => value.predecessorTaskId === predecessor.taskId
      && value.successorTaskId === successor.taskId && value.dependencyType === type);
    check('AC-14 ' + type + '依赖真实保存', matches.length === 1 && matches[0].lagDays === lagDays);
    return matches[0];
  };
  const predecessor = await createTask(primary, '尚未开始的前置');
  const successor = await createTask(primary, '依赖提示后置');
  const final = await createTask(primary, '依赖链末尾');
  const dependencies = [];
  for (const type of ['FINISH_TO_START', 'START_TO_START', 'FINISH_TO_FINISH']) dependencies.push(await dependency(predecessor, successor, type, 1));
  dependencies.push(await dependency(successor, final, 'FINISH_TO_START'));
  const edgeBefore = snapshot(`SELECT * FROM oa_project_dependency WHERE tenant_id=100000 AND project_id=${primary.projectId} ORDER BY dependency_id;`);
  for (const [label, source, target] of [['自依赖', predecessor, predecessor], ['长环', final, predecessor], ['跨项目', extraTask, predecessor]]) {
    reject(await api(admin, '/oa/project/dependency', { method: 'POST', body: { projectId: primary.projectId,
      predecessorTaskId: source.taskId, successorTaskId: target.taskId, dependencyType: 'FINISH_TO_START', lagDays: 0 } }), 'AC-14 ' + label + '被拒绝');
    check('AC-14 ' + label + '拒绝后原依赖保持', edgeBefore === snapshot(`SELECT * FROM oa_project_dependency WHERE tenant_id=100000 AND project_id=${primary.projectId} ORDER BY dependency_id;`));
  }
  const started = await api(admin, '/oa/project/wbs', { method: 'PUT', body: {
    ...await currentTask(primary, successor.taskId), status: 'IN_PROGRESS', progress: '20.00',
  } });
  check('AC-15 前置未满足时真实响应包含业务提醒和前置任务名称', started.status === 200 && started.body?.code === 200
    && started.body.msg.includes('业务规则提醒') && started.body.msg.includes(predecessor.subject));
  const warnings = rows(`SELECT JSON_OBJECT('code',rule_code,'effect',effect,'result',hit_result) FROM sys_business_rule_hit_record
    WHERE tenant_id=100000 AND business_type='PROJECT_TASK' AND business_id=${successor.taskId} AND rule_code='oa.project.dependency.unsatisfied';`);
  check('AC-15 前置未满足时允许按提醒规则开始并保存真实命中', warnings.length === 2
    && warnings.every(value => value.effect === 'WARN') && (await currentTask(primary, successor.taskId)).status === 'IN_PROGRESS');
  await remove('/oa/project/dependency/' + dependencies[2].dependencyId);
  check('AC-14 删除依赖实际释放引用', database(`SELECT deleted FROM oa_project_dependency WHERE tenant_id=100000 AND dependency_id=${dependencies[2].dependencyId};`) === '1');
  evidence.dependencies = true;
  evidence.dependencyWarnings = true;

  const modeProject = await createProject('三种进度模式', { percentCompleteMode: 'MANUAL', progress: '12.34' });
  await createTask(modeProject, '已完成任务', { taskWeight: '1.00', progress: '100.00', status: 'COMPLETED' });
  await createTask(modeProject, '半完成任务', { taskWeight: '3.00', progress: '50.00', status: 'IN_PROGRESS' });
  await createTask(modeProject, '未开始任务', { taskWeight: '2.00' });
  const modeBefore = snapshot(`SELECT * FROM oa_project WHERE tenant_id=100000 AND project_id=${modeProject.projectId};`);
  reject(await api(admin, '/oa/project', { method: 'PUT', body: { ...await project(modeProject.projectId),
    percentCompleteMode: 'MANUAL', progress: '12.34' } }), 'AC-16 非项目负责人修改项目被拒绝', '无权操作该项目');
  check('AC-16 非负责人修改拒绝后原项目保持', modeBefore === snapshot(`SELECT * FROM oa_project WHERE tenant_id=100000 AND project_id=${modeProject.projectId};`));
  await put('/oa/project', { ...await project(modeProject.projectId), percentCompleteMode: 'MANUAL', progress: '12.34' }, manager);
  check('AC-16 手工进度保留12.34', Number((await project(modeProject.projectId)).progress) === 12.34);
  await put('/oa/project', { ...await project(modeProject.projectId), percentCompleteMode: 'TASK_COMPLETION' }, manager);
  check('AC-16 一项完成三项任务的完成数进度为33.33', Number((await project(modeProject.projectId)).progress) === 33.33);
  await put('/oa/project', { ...await project(modeProject.projectId), percentCompleteMode: 'TASK_PROGRESS' }, manager);
  check('AC-16 加权进度250除6为41.67', Number((await project(modeProject.projectId)).progress) === 41.67);
  evidence.progress = true;

  const templateId = await post('/oa/project-templates', { template: { templateCode: marker + '_TEMPLATE', templateName: marker + '_完整任务树模板', status: 'ACTIVE' },
    tasks: [
      { templateTaskId: -1, subject: marker + '_模板分组', startOffsetDays: 0, durationDays: 5, sortNo: 1, taskWeight: '1.00', plannedHours: '0.00', isMilestoneFlag: 0 },
      { templateTaskId: -2, parentTemplateTaskId: -1, subject: marker + '_模板工作', startOffsetDays: 2, durationDays: 3, sortNo: 2, taskWeight: '2.00', plannedHours: '4.50', isMilestoneFlag: 0 },
      { templateTaskId: -3, parentTemplateTaskId: -1, subject: marker + '_模板里程碑', startOffsetDays: 4, durationDays: 0, sortNo: 3, taskWeight: '3.00', plannedHours: '0.00', isMilestoneFlag: 1 },
    ] });
  const templateProject = await createProject('套用模板项目', { startDate: shifted(-10) });
  await post(`/oa/project-templates/${templateId}/apply/${templateProject.projectId}`);
  const templated = await taskList(templateProject.projectId);
  const templateGroup = templated.find(value => value.subject === marker + '_模板分组');
  const templateWork = templated.find(value => value.subject === marker + '_模板工作');
  const templateMilestone = templated.find(value => value.subject === marker + '_模板里程碑');
  check('AC-17 模板生成完整层级及里程碑属性', templated.length === 3 && templateGroup.isGroupFlag === 1
    && templateWork.parentTaskId === templateGroup.taskId && templateMilestone.parentTaskId === templateGroup.taskId && templateMilestone.isMilestoneFlag === 1);
  check('AC-17 相对开始日和持续天数换算准确', templateWork.plannedStart === shifted(-8) + ' 00:00:00'
    && templateWork.plannedEnd === shifted(-6) + ' 23:59:59' && templateMilestone.plannedStart === shifted(-6) + ' 00:00:00'
    && templateMilestone.plannedEnd === templateMilestone.plannedStart);
  const appliedBefore = treeSnapshot(templateProject);
  reject(await api(admin, `/oa/project-templates/${templateId}/apply/${templateProject.projectId}`, { method: 'POST', body: {} }), 'AC-17 非空任务树拒绝重复套用');
  check('AC-17 重复套用拒绝后原树保持', treeSnapshot(templateProject) === appliedBefore);
  const reversedTemplateId = await post('/oa/project-templates/from-project/' + templateProject.projectId,
    { templateCode: marker + '_REVERSED', templateName: marker + '_项目另存模板', status: 'ACTIVE' });
  const reversed = await get('/oa/project-templates/' + reversedTemplateId);
  check('AC-18 项目另存模板保留完整任务数及相对日期', reversed.tasks.length === 3
    && reversed.tasks.some(value => value.subject === templateWork.subject && value.startOffsetDays === 2 && value.durationDays === 3));
  check('AC-17/18 新模板任务没有历史工时或成本', templated.every(value => Number(value.openingActualHours) === 0 && Number(value.actualHours) === 0));
  evidence.templates = true;

  for (const page of [employee, readonly, outsider]) {
    reject(await api(page, '/oa/project/wbs', { method: 'POST', body: { projectId: primary.projectId,
      subject: marker + '_越权任务', taskWeight: '1.00' } }), 'AC-12 无权限或跨租户不能改任务');
    reject(await api(page, '/oa/project-templates/' + templateId), 'AC-17 无权限或跨租户不能读取模板');
  }
  const foreign = await get('/oa/project/list?pageNum=1&pageSize=100', outsider);
  check('F3 外租户项目列表不包含本轮项目', foreign.rows.every(value => !value.projectName.includes(marker)));
  const eligible = await get('/oa/timesheets/projects', employee);
  check('AC-2 员工真实可选项目包含本人两个成员项目', [primary, secondary].every(value => eligible.some(candidate => candidate.projectId === value.projectId)));
  evidence.permissions = true;
  ctx.primary = await project(primary.projectId);
  ctx.secondary = await project(secondary.projectId);
  ctx.effortTask = await currentTask(primary, effort.taskId);
  ctx.secondTask = extraTask;
  ctx.groupTask = await currentTask(primary, branch.taskId);
  ctx.currentTask = currentTask;
  ctx.changeTask = changeTask;
  ctx.treePayload = treePayload;
  ctx.templateProject = templateProject;
  ctx.dependenciesForGantt = dependencies.slice(0, 2);
  ctx.dependencySuccessor = successor;
  ctx.dependencyPredecessor = predecessor;
}
