import assert from 'node:assert/strict';
import { createB1RejectionUi } from './b1-rejection-ui.mjs';

// All transitions use the authenticated application; SQL only reads outcomes and archives owned fixtures.
export async function verifyB1RejectionStrategies({ admin, employee, api, successful, session, database, check, caseTag, secrets, evidence, uiDevice }) {
  const marker = 'B1RJ' + caseTag, base = '/workflow/wf';
  const sql = value => 'CONVERT(0x' + Buffer.from(String(value)).toString('hex') + ' USING utf8mb4) COLLATE utf8mb4_unicode_ci';
  const rows = statement => database(statement).split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
  const post = (page, url, body) => api(page, url, { method: 'POST', body });
  const manager = await session('g_holiday_manager');
  const token = await manager.evaluate(async () => (await import('/src/utils/authStorage.ts')).getAuthToken());
  assert.ok(token); secrets.add(token.replace(/^Bearer /, ''));
  const people = ['g_import_admin', 'g_holiday_employee', 'g_holiday_manager'].map((name, index) => {
    const id = database("SELECT user_id FROM sys_user WHERE tenant_id=100000 AND deleted=0 AND status='0' AND user_name=" + sql(name) + ';');
    assert.match(id, /^[1-9][0-9]*$/); return { id, page: [admin, employee, manager][index] };
  });
  const [owner, starter, reviewer] = people;
  const definitions = [], instances = [];
  const grants = () => database('SELECT tenant_id,role_id,menu_id FROM sys_role_menu ORDER BY tenant_id,role_id,menu_id;');
  const identities = () => database('SELECT user_id,dept_id,status,deleted,version FROM sys_user WHERE user_id IN (' + people.map(item => item.id).join(',') + ') ORDER BY user_id;');
  const originalGrants = grants(), originalIdentities = identities();
  const status = id => database('SELECT status FROM wf_process_instance WHERE tenant_id=100000 AND instance_id=' + sql(id) + ';');
  const tasks = id => rows("SELECT JSON_OBJECT('id',task_id,'node',node_key,'user',CAST(assignee AS CHAR),'type',task_type,'status',status) FROM wf_task WHERE tenant_id=100000 AND instance_id=" + sql(id) + ' ORDER BY task_id;');
  const histories = id => rows("SELECT JSON_OBJECT('id',history_id,'task',task_id,'node',node_key,'user',CAST(operator_id AS CHAR),'type',task_type,'action',action,'comment',comment,'metadata',variables_changed) FROM wf_task_history WHERE tenant_id=100000 AND instance_id=" + sql(id) + ' ORDER BY history_id;');
  const snapshot = id => JSON.stringify({ tasks: tasks(id), history: histories(id),
    instance: database('SELECT status,lock_version,variables,end_time FROM wf_process_instance WHERE tenant_id=100000 AND instance_id=' + sql(id) + ';') });
  const waitFor = async (read, accept, label) => {
    const end = Date.now() + 30000;
    do { const value = await read(); if (accept(value)) return value; await new Promise(resolve => setTimeout(resolve, 200)); } while (Date.now() < end);
    throw new Error(label);
  };
  const taskAt = (id, node, user) => {
    const pending = tasks(id); assert.equal(pending.length, 1); assert.equal(pending[0].node, node);
    if (user) assert.equal(pending[0].user, user.id); return pending[0];
  };
  let formId, failure, ui, starts = 0, approvals = 0, rejections = 0, denials = 0, traceChecks = 0;
  const approval = (id, user, props = {}) => ({ id, type: 'APPROVAL', title: id, approverType: 'USER', approverValue: user.id,
    approveSelf: 'ALLOW', allowAgent: false, ...props });
  const definition = async (name, middle) => {
    const nodes = [{ id: 'start', type: 'START', title: '发起' }, ...middle, { id: 'end', type: 'END', title: '结束' }];
    const model = { nodes, edges: nodes.slice(1).map((node, index) => ({ id: 'edge-' + index, source: nodes[index].id, target: node.id })) };
    const key = marker + '-' + name;
    const saved = successful(await post(admin, base + '/definition/save', { processKey: key, processName: key, formId,
      modelJson: JSON.stringify(model), startPermissionType: 'ALL', startPermissionValue: '[]' }), '保存自有驳回定义');
    const id = saved.definitionId ?? saved.id; assert.ok(id); definitions.push(id);
    successful(await post(admin, base + '/definition/deploy/' + id), '发布自有驳回定义'); return { id, key };
  };
  const start = async definition => {
    const context = successful(await api(employee, base + '/draft/context/' + definition.id), '读取驳回验收发起上下文');
    const draft = successful(await post(employee, base + '/draft', { definitionId: definition.id, expectedVersion: 0,
      loadedContextHash: context.contextHash, title: definition.key, formData: { note: marker }, nodeAssignees: {} }), '保存驳回验收草稿');
    const result = successful(await post(employee, base + '/start', { draftId: draft.draftId, expectedVersion: draft.lockVersion }), '员工实际发起驳回验收流程');
    const id = result.instanceId ?? result.processInstanceId; assert.ok(id); instances.push(id); starts++;
    check('真实发起消费草稿且绑定原定义', database('SELECT COUNT(*) FROM wf_form_draft WHERE tenant_id=100000 AND draft_id=' + sql(draft.draftId) + ';') === '0'
      && database('SELECT definition_id FROM wf_process_instance WHERE tenant_id=100000 AND instance_id=' + sql(id) + ';') === definition.id);
    return id;
  };
  const complete = async (id, node, user, variables) => {
    const task = taskAt(id, node, user);
    const body = { taskId: task.id, action: 'APPROVE', comment: marker + '-approve-' + approvals, variables };
    const result = ui && user.id === starter.id && (node === 'start' || task.type === 'REJECT_JUMP')
      ? await ui.complete({ id, task, body }) : await post(user.page, base + '/complete', body);
    successful(result, '实际负责人审批或重新提交'); approvals++;
    check('实际审批消费本人待办并保存历史', !tasks(id).some(item => item.id === task.id) && histories(id).some(item => item.task === task.id && item.action === 'APPROVE' && item.user === user.id));
  };
  const trace = async (id, task, type, expectedMetadata) => {
    const saved = histories(id).filter(item => item.task === task.id && ['REJECT','REJECT_TO_PREVIOUS'].includes(item.action));
    assert.equal(saved.length, 1); const history = saved[0], metadata = JSON.parse(history.metadata || '{}');
    check('驳回历史保存语义、本人和准确去向', history.type === type && history.user === task.user && history.node === task.node
      && Object.entries(expectedMetadata || {}).every(([key, value]) => metadata[key] === value));
    const detail = successful(await api(employee, base + '/instance/' + id + '/trace'), '发起人读取真实驳回轨迹');
    const item = detail.historyDetails?.find(item => item.historyId === history.id);
    check('本人轨迹返回与真实历史一致的驳回语义', item?.taskId === task.id && item.taskType === type && String(item.operatorId) === task.user && item.nodeKey === task.node && item.comment === history.comment);
    traceChecks++; return history;
  };
  const reject = async (id, node, strategy, type, metadata, override) => {
    const task = taskAt(id, node, reviewer);
    const body = { taskId: task.id, comment: marker + '-reject-' + rejections, ...override };
    successful(ui ? await ui.reject({ id, task, body, strategy }) : await post(manager, base + '/reject', body), '实际审批人按' + strategy + '驳回'); rejections++;
    check('驳回原待办已消费', !tasks(id).some(item => item.id === task.id));
    return trace(id, task, type, metadata);
  };
  const preserved = async (id, history) => {
    check('重审完成后原驳回历史保持', JSON.stringify(histories(id).find(item => item.id === history.id)) === JSON.stringify(history));
    const detail = successful(await api(employee, base + '/instance/' + id + '/trace'), '结束后再次读取驳回轨迹');
    check('结束后轨迹仍保留原驳回语义', detail.historyDetails?.some(item => item.historyId === history.id && item.taskType === history.type)); traceChecks++;
  };
  const finish = id => check('完整业务链结束通过且没有待办', status(id) === 'PASSED' && tasks(id).length === 0);
  const children = id => rows("SELECT JSON_OBJECT('id',instance_id,'status',status) FROM wf_process_instance WHERE tenant_id=100000 AND parent_instance_id=" + sql(id) + ' ORDER BY instance_id;');
  try {
    if (uiDevice) ui = await createB1RejectionUi({ manager, employee, device: uiDevice, caseTag, secrets, check, snapshot });
    const form = successful(await post(admin, base + '/form/save', { formKey: marker, formName: marker,
      fieldsJson: '[{"id":"note","type":"TEXT","label":"说明"}]' }), '建立驳回验收表单');
    formId = form.formId ?? form.id; assert.ok(formId);
    for (const strategy of ['TO_INITIATOR','TO_PREVIOUS_NODE','TO_SPECIFIED_NODE']) {
      console.log('B1_REJECTION_SCENARIO: ' + strategy);
      const id = await start(await definition(strategy, [approval('pre', starter), approval('middle', owner),
        approval('review', reviewer, { rejectStrategy: strategy, ...(strategy === 'TO_SPECIFIED_NODE' ? { rejectToNodeKey: 'pre' } : {}) }), approval('after', owner)]));
      if (ui && strategy === 'TO_INITIATOR') {
        const unread = taskAt(id, 'pre', starter), before = snapshot(id);
        const readRows = () => database('SELECT id,tenant_id,task_id,user_id,read_time FROM wf_task_read WHERE tenant_id=100000 AND task_id=' + sql(unread.id) + ' AND user_id=' + starter.id + ';');
        assert.equal(readRows(), '');
        const firstReads = await Promise.all(Array.from({ length: 6 }, () => post(employee, base + '/task/read/' + unread.id, {})));
        check(uiDevice + '六个同时已读请求全部成功且业务待办保持', firstReads.every(result => result.status === 200 && result.body?.code === 200) && snapshot(id) === before);
        const firstRead = readRows();
        check(uiDevice + '并发已读仅保存一条本人记录', firstRead.split(/\r?\n/).filter(Boolean).length === 1);
        const repeatReads = await Promise.all(Array.from({ length: 4 }, () => post(employee, base + '/task/read/' + unread.id, {})));
        check(uiDevice + '重复读取保留首次已读时间和原业务数据', repeatReads.every(result => result.status === 200 && result.body?.code === 200) && readRows() === firstRead && snapshot(id) === before);
      }
      await complete(id, 'pre', starter); await complete(id, 'middle', owner);
      if (strategy === 'TO_SPECIFIED_NODE') for (const target of ['review','after','missing']) {
        const before = snapshot(id), pending = taskAt(id, 'review', reviewer);
        const result = await post(manager, base + '/reject', { taskId: pending.id, strategy, targetNodeKey: target, comment: marker + '-invalid-' + target });
        check('拒绝当前下游或不存在目标并完整保持原数据-' + target, result.status === 400 && result.body?.code === 'INVALID_REQUEST' && snapshot(id) === before); denials++;
      }
      const target = strategy === 'TO_INITIATOR' ? 'start' : strategy === 'TO_PREVIOUS_NODE' ? 'middle' : 'pre';
      const history = await reject(id, 'review', strategy, strategy === 'TO_INITIATOR' ? 'REJECT' : 'REJECT_JUMP',
        strategy === 'TO_INITIATOR' ? { rejectStrategy: strategy } : { targetNodeKey: target });
      const pending = taskAt(id, target, target === 'middle' ? owner : starter);
      check('驳回产生正确语义的唯一目标待办', pending.type === history.type);
      if (target === 'start') {
        check('回发起人产生本人修改待办', status(id) === 'TASK_BACK' && pending.user === starter.id);
        await complete(id, 'start', starter, { note: marker + '-resubmitted' });
        check('重新提交完整保留修改内容', database("SELECT JSON_UNQUOTE(JSON_EXTRACT(variables,'$.note')) FROM wf_process_instance WHERE tenant_id=100000 AND instance_id=" + sql(id) + ';') === marker + '-resubmitted');
      }
      if (target !== 'middle') await complete(id, 'pre', starter);
      await complete(id, 'middle', owner); await complete(id, 'review', reviewer); await complete(id, 'after', owner);
      finish(id); await preserved(id, history);
    }
    evidence.b1RejectionLinear = true; evidence.b1RejectionTargets = true;
    console.log('B1_REJECTION_SCENARIO: TERMINATE');
    const terminated = await start(await definition('terminate', [approval('review', reviewer, { rejectStrategy: 'TERMINATE' })]));
    const terminalHistory = await reject(terminated, 'review', 'TERMINATE', 'REJECT', { rejectStrategy: 'TERMINATE' });
    check('直接结束策略保存REJECTED且清空待办', status(terminated) === 'REJECTED' && tasks(terminated).length === 0);
    await preserved(terminated, terminalHistory); evidence.b1RejectionTerminate = true;

    const childDefinition = await definition('child', [approval('review', reviewer, { rejectStrategy: 'TO_PARENT_NODE' })]);
    const subprocess = wait => ({ id: 'call', type: 'SUBPROCESS', title: '调用子流程', props: { subprocessId: childDefinition.key, waitForCompletion: wait } });
    console.log('B1_REJECTION_SCENARIO: TO_PARENT_NODE');
    const parent = await start(await definition('parent', [subprocess(true), approval('after', owner)]));
    const originalChildren = children(parent); assert.equal(originalChildren.length, 1); const child = originalChildren[0].id; instances.push(child);
    check('等待型父流程实际停在子流程', status(parent) === 'PENDING' && tasks(parent).length === 0 && status(child) === 'RUNNING');
    const parentHistory = await reject(child, 'review', 'TO_PARENT_NODE', 'REJECT_JUMP', { rejectStrategy: 'TO_PARENT_NODE' });
    const replacement = children(parent).filter(item => item.id !== child); assert.equal(replacement.length, 1); instances.push(replacement[0].id);
    check('退回父调用结束旧子流程并建立新子流程', status(child) === 'REJECTED' && tasks(child).length === 0 && status(replacement[0].id) === 'RUNNING'
      && taskAt(replacement[0].id, 'review', reviewer).type === 'REJECT_JUMP' && status(parent) === 'PENDING');
    await complete(replacement[0].id, 'review', reviewer);
    await waitFor(() => tasks(parent), pending => pending.length === 1 && pending[0].node === 'after', 'Parent did not resume after replacement child approval');
    await complete(parent, 'after', owner); finish(parent); finish(replacement[0].id); await preserved(child, parentHistory);
    evidence.b1RejectionParent = true;

    console.log('B1_REJECTION_SCENARIO: PARENT_FINISHED');
    const endedParent = await start(await definition('parent-ended', [subprocess(false), approval('after', owner)]));
    const detached = children(endedParent); assert.equal(detached.length, 1); const detachedChild = detached[0].id; instances.push(detachedChild);
    await complete(endedParent, 'after', owner); finish(endedParent);
    const parentBefore = snapshot(endedParent);
    check('父流程真实完成后子审批仍存在', status(detachedChild) === 'RUNNING' && taskAt(detachedChild, 'review', reviewer).status === 'TODO');
    const degraded = await reject(detachedChild, 'review', 'TO_PARENT_NODE', 'REJECT', { rejectStrategy: 'PARENT_FINISHED_DEGRADE_TO_TERMINATE' });
    check('父终态下子回退降级结束且父数据保持', status(detachedChild) === 'REJECTED' && tasks(detachedChild).length === 0 && snapshot(endedParent) === parentBefore);
    await preserved(detachedChild, degraded); evidence.b1RejectionDegrade = true;

    console.log('B1_REJECTION_SCENARIO: DEFAULT_INITIATOR');
    const defaulted = await start(await definition('default', [approval('review', reviewer)]));
    const defaultHistory = await reject(defaulted, 'review', 'DEFAULT_INITIATOR', 'REJECT', { rejectStrategy: 'TO_INITIATOR' });
    check(ui ? '未配置策略时页面选择退回发起人生效' : '未配置策略的驳回入口默认退回发起人', taskAt(defaulted, 'start', starter).type === 'REJECT');
    await complete(defaulted, 'start', starter); await complete(defaulted, 'review', reviewer); finish(defaulted); await preserved(defaulted, defaultHistory);
    evidence.b1RejectionDefault = true;
    console.log('B1_REJECTION_SCENARIO: LEGACY_EXPLICIT_TARGET');
    const legacy = await start(await definition('legacy-target', [approval('pre', starter), approval('review', reviewer)]));
    await complete(legacy, 'pre', starter);
    const legacyHistory = await reject(legacy, 'review', 'LEGACY_EXPLICIT_TARGET', 'REJECT_JUMP', { targetNodeKey: 'pre' }, { targetNodeKey: 'pre' });
    check('未配置策略时仍按显式上游目标回退', taskAt(legacy, 'pre', starter).type === 'REJECT_JUMP');
    await complete(legacy, 'pre', starter); await complete(legacy, 'review', reviewer); finish(legacy); await preserved(legacy, legacyHistory);

    console.log('B1_REJECTION_SCENARIO: LEGACY_COMPLETE_REJECT');
    const legacyComplete = await start(await definition('legacy-complete', [approval('review', reviewer)]));
    const legacyTask = taskAt(legacyComplete, 'review', reviewer);
    const legacyBody = { taskId: legacyTask.id, action: 'REJECT', comment: marker + '-legacy-complete' };
    successful(ui ? await ui.completeReject({ id: legacyComplete, task: legacyTask, body: legacyBody }) : await post(manager, base + '/complete', legacyBody), '原审批入口继续执行拒绝结束'); rejections++;
    check('原未配置策略的审批拒绝仍结束流程', status(legacyComplete) === 'REJECTED' && tasks(legacyComplete).length === 0);
    await trace(legacyComplete, legacyTask, 'REJECT', {}); evidence.b1RejectionLegacy = true;
    if (ui) { await ui.finish(); evidence[uiDevice === 'mobile' ? 'b1RejectionMobile' : 'b1RejectionDesktop'] = true; }
    console.log('B1_REJECTION_STRATEGIES_ACTUAL: ' + JSON.stringify({ realStarts: starts, humanApprovals: approvals, rejections, denials, traceChecks,
      actualInstances: instances.length, strategies: 5, uiVerified: Boolean(ui), device: uiDevice || null, parentEndedNaturally: true, legacyExplicitTarget: true, legacyCompleteReject: true, forcedWorkflowOutcomeWrites: 0 }));
  } catch (error) { failure = error; }
  finally {
    if (ui) try { await ui.close(failure); } catch (error) { failure = new AggregateError([failure, error].filter(Boolean), 'B1 rejection browser cleanup failed'); }
    try {
      const owned = rows("SELECT JSON_OBJECT('id',instance_id) FROM wf_process_instance WHERE tenant_id=100000 AND definition_id IN (SELECT definition_id FROM wf_process_definition WHERE process_key LIKE " + sql(marker + '-%') + ');');
      for (const { id } of owned) if (['RUNNING','PAUSED','FAILED','PENDING','WITHDRAWN','TASK_BACK','RESTARTED'].includes(status(id)))
        successful(await post(admin, base + '/instance/terminate', { instanceId: id, reason: marker + '-cleanup' }), '结束自有未完成驳回流程');
      for (const id of definitions) {
        database('DELETE FROM wf_form_draft WHERE tenant_id=100000 AND user_id=' + starter.id + ' AND definition_id=' + sql(id) + ';');
        database("UPDATE wf_process_definition SET status='ARCHIVED',deleted=0 WHERE tenant_id=100000 AND definition_id=" + sql(id) + ' AND process_key LIKE ' + sql(marker + '-%') + ';');
      }
      check('驳回验收原身份权限保持且无遗留活动流程', grants() === originalGrants && identities() === originalIdentities
        && owned.every(item => ['PASSED','AUTO_PASSED','REJECTED','TERMINATED','INVALIDATED','CANCELLED'].includes(status(item.id))));
      evidence.b1RejectionRestoration = true;
    } catch (error) { failure = new AggregateError([failure, error].filter(Boolean), 'B1 rejection verification or restoration failed'); }
  }
  if (failure) throw failure;
}
