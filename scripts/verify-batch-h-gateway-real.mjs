import assert from 'node:assert/strict';
import { verifyGatewayWaits } from './verify-batch-h-gateway-waits-real.mjs';
import { verifyGatewayRewinds } from './verify-batch-h-gateway-rewind-real.mjs';
import { verifyOrderedSignatures } from './verify-batch-h-addsign-real.mjs';
import { verifyGatewayArchives } from './verify-batch-h-gateway-archive-real.mjs';

export async function verifyGatewayInterface({ admin, api, successful, session, database, check, caseTag, state, directory, rewindOnly = false, withdrawalUiOnly = false, addSignOnly = false, addSignUiOnly = false }) {
  assert.ok(state.services.some(service => service.name === 'workflow'), 'Real workflow service required');
  const base = '/workflow/wf';
  const managerId = '990000706';
  const employeeId = '990000707';
  const hrId = '990000705';
  const manager = await session('g_holiday_manager');
  const employee = await session('g_holiday_employee');
  const hr = await session('g_holiday_hr');
  const foreign = await session('g_import_tenant');
  const people = new Map([[managerId, manager], [employeeId, employee], [hrId, hr]]);
  const quote = value => `CONVERT(X'${Buffer.from(String(value)).toString('hex')}' USING utf8mb4)`;
  const rows = statement => database(statement).split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
  const post = (page, route, body) => api(page, route, { method: 'POST', body });
  const tasks = instanceId => rows(`SELECT JSON_OBJECT('id',task_id,'node',node_key,'assignee',CAST(assignee AS CHAR),'context',execution_context,'version',lock_version,'status',status) FROM wf_task WHERE tenant_id=100000 AND instance_id=${quote(instanceId)} ORDER BY node_key,task_id;`);
  const activations = instanceId => rows(`SELECT JSON_OBJECT('id',activation_id,'node',gateway_id,'join',join_node_key,'type',join_type,'branches',activated_branches,'expected',expected_count,'parent',parent_context,'status',status,'version',version) FROM wf_gateway_activation WHERE tenant_id=100000 AND instance_id=${quote(instanceId)} ORDER BY create_time,activation_id;`);
  const arrivals = instanceId => rows(`SELECT JSON_OBJECT('activation',activation_id,'branch',branch_key,'expected',expected_count,'type',join_type) FROM wf_parallel_join WHERE tenant_id=100000 AND instance_id=${quote(instanceId)} ORDER BY activation_id,branch_key;`);
  const status = instanceId => database(`SELECT status FROM wf_process_instance WHERE tenant_id=100000 AND instance_id=${quote(instanceId)};`);
  const grants = database('SELECT menu_id FROM sys_role_menu WHERE tenant_id=100000 AND role_id=5 ORDER BY menu_id;');
  check('网关激活表14列、到达表9列、任务表18列与批准稿字段明细一致', ['wf_gateway_activation', 'wf_parallel_join', 'wf_task'].map(table => database(`SELECT COUNT(*) FROM information_schema.columns WHERE table_schema='cloud_flow_db' AND table_name=${quote(table)};`)).join(',') === '14,9,18');
  check('激活表字段逐项匹配批准稿且没有额外列', database("SELECT column_name FROM information_schema.columns WHERE table_schema='cloud_flow_db' AND table_name='wf_gateway_activation' ORDER BY ordinal_position;").split(/\r?\n/).join(',')
    === 'activation_id,tenant_id,instance_id,gateway_id,join_node_key,join_type,activated_branches,expected_count,parent_context,status,released_time,version,create_time,update_time');
  const form = successful(await post(admin, `${base}/form/save`, { formKey: `h1_gw_${caseTag}`, formName: `H1网关_${caseTag}`,
    fieldsJson: JSON.stringify([{ id: 'note', type: 'TEXT', label: '说明', required: true }, { id: 'choice', type: 'TEXT', label: '分支选择', required: true }, { id: 'round', type: 'TEXT', label: '轮次', required: true }]) }), '真实创建网关验收表单');
  const formId = form.formId ?? form.id;
  const node = (id, assignee = managerId) => ({ id, title: `H1GW_${id}_${caseTag}`, type: 'APPROVAL', approverType: 'USER', approverValue: assignee, allowEdit: true, allowAgent: false, allowDelegate: true, rejectStrategy: 'TERMINATE' });
  const edge = (source, target, extra = {}) => ({ id: `${source}-${target}`, source, target, ...extra });
  function model(type = 'INCLUSIVE', fallback = false) {
    return { nodes: [{ id: 'start', type: 'START', title: '发起' }, node('pre'),
      { id: 'split', type, title: `H1GW_${type}_${caseTag}`, ...(type === 'ROUTE' ? {} : { joinNodeKey: 'join' }) },
      node('first'), node('second', employeeId), node('third', hrId), node('join', hrId), { id: 'end', type: 'END', title: '结束' }],
    edges: [edge('start', 'pre'), edge('pre', 'split'), edge('split', 'first', { condition: "#choice != 'none'" }),
      edge('split', 'second', { condition: "#choice == 'two' or #choice == 'all'" }),
      edge('split', 'third', { condition: "#choice == 'all'", isDefault: fallback }),
      ...(type === 'PARALLEL' ? [edge('split', 'join', { isDefault: true })] : []),
      edge('first', 'join'), edge('second', 'join'), edge('third', 'join'), edge('join', 'end')] };
  }
  async function definition(name, graph) {
    const saved = successful(await post(admin, `${base}/definition/save`, { processKey: `h1_gw_${name}_${caseTag}`, processName: `H1GW_${name}_${caseTag}`, formId,
      modelJson: JSON.stringify(graph), startPermissionType: 'ALL', startPermissionValue: '[]' }), '真实保存网关流程定义');
    const definitionId = saved.definitionId ?? saved.id;
    successful(await post(admin, `${base}/definition/deploy/${definitionId}`), '真实发布网关流程定义');
    const stored = JSON.parse(database(`SELECT model_json FROM wf_process_definition WHERE definition_id=${quote(definitionId)};`));
    check('保存和发布保留网关类型、出口顺序及配对节点', graph.nodes.every(expected => stored.nodes.some(current => current.id === expected.id
      && current.type === expected.type && current.joinNodeKey === expected.joinNodeKey))
      && stored.edges.map(current => current.id).join(',') === graph.edges.map(current => current.id).join(','));
    return definitionId;
  }
  async function start(definitionId, name, choice = 'two') {
    const context = successful(await api(admin, `${base}/draft/context/${definitionId}`), '读取真实发起上下文');
    const draft = successful(await post(admin, `${base}/draft`, { definitionId, expectedVersion: 0, loadedContextHash: context.contextHash,
      title: `H1GW_${caseTag}_${name}`, formData: { note: name, choice, round: 'one' }, nodeAssignees: {} }), '保存真实流程草稿');
    const started = successful(await post(admin, `${base}/start`, { draftId: draft.draftId, expectedVersion: draft.lockVersion }), '真实启动网关流程');
    const instanceId = started.instanceId ?? started.processInstanceId;
    check('进入网关前没有提前创建激活记录', tasks(instanceId).length === 1 && tasks(instanceId)[0].node === 'pre' && activations(instanceId).length === 0);
    return instanceId;
  }
  async function complete(task, name, variables, action = 'APPROVE') {
    return post(people.get(task.assignee), `${base}/complete`, { taskId: task.id, action, comment: `H1GW_${caseTag}_${name}`, ...(variables ? { variables } : {}) });
  }
  async function enter(definitionId, name, choice = 'two') {
    const instanceId = await start(definitionId, name, choice);
    successful(await complete(tasks(instanceId)[0], `${name}-pre`), '首审通过后真实进入网关');
    return instanceId;
  }
  async function finish(instanceId, name) {
    const current = tasks(instanceId);
    check('汇聚只创建一项后继审批且退出分支上下文', current.length === 1 && current[0].node === 'join' && current[0].context === null);
    successful(await complete(current[0], `${name}-final`), '真实后继审批完成');
    check('全部通过后流程结束且没有残留任务', status(instanceId) === 'PASSED' && tasks(instanceId).length === 0);
  }
  const denied = (response, label, allowed = [400, 403, 404, 409]) => check(label, allowed.includes(response.status) && response.body?.code !== 200);
  const archiveCheck = () => verifyGatewayArchives({ admin, api, post, successful, database, check, caseTag, quote,
    model, definition, enter, complete, finish, tasks, activations, arrivals });
  if (process.argv.includes('--gateway-archive-only')) {
    await archiveCheck();
    check('网关归档清理验收未修改员工权限集合', grants === database('SELECT menu_id FROM sys_role_menu WHERE tenant_id=100000 AND role_id=5 ORDER BY menu_id;'));
    return;
  }
  if (addSignOnly || addSignUiOnly) {
    await verifyOrderedSignatures({ admin, manager, employee, hr, foreign, people, api, post, successful, database, check, caseTag, state, directory, addSignUiOnly,
      quote, rows, model, node, edge, definition, start, enter, complete, finish, tasks, activations, arrivals, status, denied });
    check('加签真实验收未修改员工权限集合', grants === database('SELECT menu_id FROM sys_role_menu WHERE tenant_id=100000 AND role_id=5 ORDER BY menu_id;'));
    return;
  }
  if (rewindOnly || withdrawalUiOnly) {
    await verifyGatewayRewinds({ admin, manager, employee, hr, foreign, people, api, post, successful, database, check, caseTag, state, directory, withdrawalUiOnly,
      quote, rows, model, node, edge, definition, start, enter, complete, finish, tasks, activations, arrivals, status, denied });
    check('网关回退验收未修改员工权限集合', grants === database('SELECT menu_id FROM sys_role_menu WHERE tenant_id=100000 AND role_id=5 ORDER BY menu_id;'));
    return;
  }
  const inclusive = await definition('inclusive', model());
  const partial = await enter(inclusive, 'partial');
  const partialTasks = tasks(partial);
  const firstActivation = activations(partial)[0];
  check('三分支命中两支仅产生两项待办与应到数2', partialTasks.map(task => task.node).join(',') === 'first,second' && activations(partial).length === 1
    && firstActivation.expected === 2 && firstActivation.branches.join(',') === 'split-first,split-second');
  check('每项待办持久保存独立出口和同一轮次', partialTasks.every(task => task.context.activationId === firstActivation.id) && new Set(partialTasks.map(task => task.context.branchKey)).size === 2);
  const todo = successful(await api(employee, `${base}/todo?pageSize=100`), '读取真实员工分支待办');
  check('服务端执行上下文不泄漏到待办响应', todo.rows.some(task => task.taskId === partialTasks[1].id) && !JSON.stringify(todo).includes(firstActivation.id));
  const foreignResponse = await post(foreign, `${base}/complete`, { taskId: partialTasks[1].id, action: 'APPROVE', comment: 'cross-tenant' });
  denied(foreignResponse, '其他租户无法处理或探知分支任务', [404]);
  check('跨租户请求返回任务不存在且本租户待办及激活状态不变', foreignResponse.body?.code === 'TASK_NOT_FOUND'
    && JSON.stringify(tasks(partial)) === JSON.stringify(partialTasks) && activations(partial)[0].status === 'WAITING' && arrivals(partial).length === 0);
  denied(await complete(partialTasks[0], 'forged-context', { _wf_execution_context: { activationId: firstActivation.id, branchKey: 'split-third' } }), '表单变量不能注入执行上下文');
  successful(await complete(partialTasks[0], 'partial-first', { choice: 'none' }), '首支通过并修改后续条件变量');
  check('本轮激活集合不因变量改变重算且未提前放行', arrivals(partial).length === 1 && activations(partial)[0].expected === 2 && activations(partial)[0].status === 'WAITING'
    && tasks(partial).length === 1 && tasks(partial)[0].node === 'second');
  successful(await complete(partialTasks[1], 'partial-second'), '第二支通过完成真实汇聚');
  check('只等待已激活分支并永久保留放行记录', arrivals(partial).length === 2 && activations(partial)[0].status === 'RELEASED' && activations(partial)[0].version === 1);
  denied(await complete(partialTasks[0], 'duplicate-arrival'), '重复提交旧任务不重复到达或放行', [403, 404, 409]);
  await finish(partial, 'partial');

  const fallbackDefinition = await definition('fallback', model('INCLUSIVE', true));
  const fallbackInstance = await enter(fallbackDefinition, 'fallback', 'none');
  check('无普通分支命中时仅启动默认分支', tasks(fallbackInstance).map(task => task.node).join(',') === 'third' && activations(fallbackInstance)[0].expected === 1);
  successful(await complete(tasks(fallbackInstance)[0], 'fallback'), '默认分支真实完成');
  await finish(fallbackInstance, 'fallback');

  const missing = await start(inclusive, 'no-match', 'none');
  const missingTask = tasks(missing)[0];
  denied(await complete(missingTask, 'no-match'), '零命中且无默认返回明确业务错误');
  check('无命中回滚任务、历史及激活记录', tasks(missing).length === 1 && tasks(missing)[0].id === missingTask.id
    && activations(missing).length === 0 && database(`SELECT COUNT(*) FROM wf_task_history WHERE instance_id=${quote(missing)};`) === '0');
  check('回滚后仍保留真实无命中异常告警', database(`SELECT COUNT(*) FROM wf_anomaly_alert WHERE instance_id=${quote(missing)} AND error_message LIKE 'GATEWAY_NO_MATCH:%';`) === '1');

  const parallel = await definition('parallel', model('PARALLEL'));
  const all = await enter(parallel, 'parallel', 'none');
  check('原并行网关仍启动全部三支且不计汇聚指针', tasks(all).length === 3 && activations(all)[0].expected === 3);
  for (const [index, task] of tasks(all).entries()) {
    successful(await complete(task, `parallel-${index}`), '并行分支真实完成');
    if (index < 2) check('原并行网关等齐全部分支', activations(all)[0].status === 'WAITING' && !tasks(all).some(current => current.node === 'join'));
  }
  await finish(all, 'parallel');

  const concurrent = await enter(inclusive, 'concurrent');
  const concurrentResponses = await Promise.all(tasks(concurrent).map((task, index) => complete(task, `concurrent-${index}`)));
  concurrentResponses.forEach(response => successful(response, '不同分支并发审批均成功'));
  check('末两支并发只放行一次且到达记录不丢失', arrivals(concurrent).length === 2 && activations(concurrent)[0].version === 1 && tasks(concurrent).length === 1);
  await finish(concurrent, 'concurrent');

  const rollback = await enter(inclusive, 'rollback');
  const rollbackTasks = tasks(rollback);
  successful(await complete(rollbackTasks[0], 'rollback-first'), '故障注入前首支真实完成');
  const snapshot = () => JSON.stringify({ tasks: tasks(rollback), activations: activations(rollback), arrivals: arrivals(rollback),
    history: database(`SELECT history_id FROM wf_task_history WHERE instance_id=${quote(rollback)} ORDER BY history_id;`),
    monitors: database(`SELECT task_id,status,action FROM wf_task_monitor WHERE instance_id=${quote(rollback)} ORDER BY task_id;`) });
  const before = snapshot();
  const triggerName = `h1_gateway_fault_${caseTag}`;
  assert.match(triggerName, /^h1_gateway_fault_[a-f0-9]{12}$/);
  assert.equal(database(`SELECT COUNT(*) FROM information_schema.triggers WHERE trigger_schema='cloud_flow_db' AND trigger_name=${quote(triggerName)};`), '0');
  let created = false;
  try {
    database(`DELIMITER $$\nCREATE TRIGGER ${triggerName} BEFORE INSERT ON wf_task FOR EACH ROW BEGIN IF NEW.instance_id=${quote(rollback)} AND NEW.node_key='join' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='H1_OWNED_GATEWAY_FAULT'; END IF; END$$\nDELIMITER ;\n`);
    created = true;
    denied(await complete(rollbackTasks[1], 'rollback-last'), '最后分支后继写入故障真实报错', [400, 500]);
    check('后继失败同时回滚末支任务、历史、监控、到达及放行状态', snapshot() === before);
  } finally {
    if (created) database(`DROP TRIGGER ${triggerName};`);
  }
  check('故障注入触发器已从隔离库移除', database(`SELECT COUNT(*) FROM information_schema.triggers WHERE trigger_schema='cloud_flow_db' AND trigger_name=${quote(triggerName)};`) === '0');
  const duplicates = await Promise.all(['left', 'right'].map(suffix => complete(rollbackTasks[1], `rollback-retry-${suffix}`)));
  check('最后分支并发重试仅一笔成功', duplicates.filter(response => response.status === 200 && response.body?.code === 200).length === 1);
  await finish(rollback, 'rollback');

  const rejected = await enter(inclusive, 'rejected');
  const rejectedTasks = tasks(rejected);
  successful(await complete(rejectedTasks[0], 'before-reject'), '驳回场景首支真实到达');
  successful(await complete(rejectedTasks[1], 'branch-reject', undefined, 'REJECT'), '另一支按节点策略驳回');
  check('分支驳回取消本轮且不提前通过', status(rejected) === 'REJECTED' && activations(rejected)[0].status === 'CANCELLED' && tasks(rejected).length === 0 && arrivals(rejected).length === 1);

  const route = await definition('route', model('ROUTE', true));
  const routed = await enter(route, 'route');
  check('路由网关只走首个命中出口且不创建汇聚等待', tasks(routed).map(task => task.node).join(',') === 'first' && activations(routed).length === 0 && arrivals(routed).length === 0);
  successful(await complete(tasks(routed)[0], 'route-first'), '真实路由后审批');
  await finish(routed, 'route');

  const loopModel = model();
  loopModel.nodes.push({ id: 'route', type: 'ROUTE', title: '再次进入分流' });
  loopModel.edges.find(current => current.id === 'join-end').target = 'route';
  loopModel.edges.push(edge('route', 'split', { condition: "#round == 'one'" }), edge('route', 'end', { isDefault: true }));
  const loopDefinition = await definition('loop', loopModel);
  const loop = await enter(loopDefinition, 'loop');
  for (const task of tasks(loop)) successful(await complete(task, `loop-first-${task.node}`), '循环首轮分支完成');
  successful(await complete(tasks(loop)[0], 'loop-first-join'), '循环首轮汇聚后再次进入网关');
  check('循环第二次进入生成独立轮次且不复用到达计数', activations(loop).length === 2 && new Set(activations(loop).map(current => current.id)).size === 2
    && activations(loop).filter(current => current.status === 'WAITING').length === 1 && arrivals(loop).length === 2 && tasks(loop).length === 2);
  for (const task of tasks(loop)) successful(await complete(task, `loop-second-${task.node}`), '循环第二轮分支完成');
  successful(await complete(tasks(loop)[0], 'loop-second-join', { round: 'two' }), '第二轮汇聚后退出循环');
  check('循环两轮分别只放行一次', status(loop) === 'PASSED' && arrivals(loop).length === 4 && activations(loop).every(current => current.status === 'RELEASED' && current.version === 1));

  const nestedModel = model();
  Object.assign(nestedModel.nodes.find(current => current.id === 'first'), { type: 'INCLUSIVE', joinNodeKey: 'innerJoin' });
  nestedModel.nodes.push(node('innerFirst'), node('innerSecond', employeeId), node('innerJoin', hrId));
  nestedModel.edges = nestedModel.edges.filter(current => current.id !== 'first-join');
  nestedModel.edges.push(edge('first', 'innerFirst', { condition: 'true' }), edge('first', 'innerSecond', { condition: 'true' }),
    edge('innerFirst', 'innerJoin'), edge('innerSecond', 'innerJoin'), edge('innerJoin', 'join'));
  const nestedDefinition = await definition('nested', nestedModel);
  const nested = await enter(nestedDefinition, 'nested');
  const outerTask = tasks(nested).find(task => task.node === 'second');
  successful(await complete(outerTask, 'nested-outer'), '外层另一分支先到达');
  const innerTasks = tasks(nested);
  check('嵌套分支持久保存父层出口上下文', innerTasks.length === 2 && innerTasks.every(task => task.context.parent?.activationId === outerTask.context.activationId));
  for (const task of innerTasks) successful(await complete(task, `nested-${task.node}`), '内层分支真实完成');
  check('内层汇聚恢复父层出口且外层继续等待', tasks(nested).length === 1 && tasks(nested)[0].node === 'innerJoin'
    && tasks(nested)[0].context.activationId === outerTask.context.activationId && activations(nested).find(current => current.node === 'split').status === 'WAITING');
  successful(await complete(tasks(nested)[0], 'nested-inner-join'), '内层后继完成后到达外层汇聚');
  await finish(nested, 'nested');
  check('嵌套两层各自只放行一次', activations(nested).length === 2 && activations(nested).every(current => current.status === 'RELEASED' && current.version === 1) && arrivals(nested).length === 4);
  await verifyGatewayWaits({ admin, employee, api, post, successful, database, check, state, caseTag, quote,
    model, node, edge, definition, enter, complete, finish, tasks, activations, arrivals, status });
  await archiveCheck();
  check('全部网关验收未修改员工权限集合', grants === database('SELECT menu_id FROM sys_role_menu WHERE tenant_id=100000 AND role_id=5 ORDER BY menu_id;'));
}
