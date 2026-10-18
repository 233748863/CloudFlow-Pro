import assert from 'node:assert/strict';
import { createB2StatusUiVerifier } from './verify-b2-status-ui.mjs';
import { createB2MobileMonitorVerifier } from './verify-b2-mobile-monitor.mjs';

// H1's approved draft lifecycle stores unsubmitted content in wf_form_draft, with no premature process instance.
export async function verifyB2InstanceStates({ admin, mobilePage, employee, api, successful, session, database, check, caseTag, secrets, evidence }) {
  const marker = 'B2ST' + caseTag, base = '/workflow/wf';
  const sql = value => 'CONVERT(0x' + Buffer.from(String(value)).toString('hex') + ' USING utf8mb4) COLLATE utf8mb4_unicode_ci';
  const rows = query => database(query).split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
  const post = (page, url, body = {}) => api(page, url, { method: 'POST', body });
  const waitFor = async (read, accept, label) => {
    const deadline = Date.now() + 10000;
    do { const value = await read(); if (accept(value)) return value; await new Promise(resolve => setTimeout(resolve, 200)); } while (Date.now() < deadline);
    throw new Error(label);
  };
  const manager = await session('g_holiday_manager');
  const managerToken = await manager.evaluate(async () => (await import('/src/utils/authStorage.ts')).getAuthToken());
  assert.ok(managerToken); secrets.add(managerToken.replace(/^Bearer /, ''));
  const users = ['g_import_admin', 'g_holiday_employee', 'g_holiday_manager'].map(name => {
    const id = database("SELECT user_id FROM sys_user WHERE tenant_id=100000 AND deleted=0 AND status='0' AND user_name=" + sql(name) + ';');
    assert.match(id, /^[1-9][0-9]*$/); return id;
  });
  const definitions = [], samples = [], observed = new Set(), monitored = new Set();
  const activeStates = new Set(['RUNNING', 'WITHDRAWN', 'TASK_BACK', 'RESTARTED', 'PENDING']);
  const successfulStates = new Set(['PASSED', 'AUTO_PASSED']);
  const ui = createB2StatusUiVerifier({ page: admin, check, caseTag });
  const mobileUi = createB2MobileMonitorVerifier({ page: mobilePage, database, check, caseTag });
  const instance = id => rows("SELECT JSON_OBJECT('id',instance_id,'status',status,'version',lock_version) FROM wf_process_instance WHERE tenant_id=100000 AND instance_id=" + sql(id) + ';')[0];
  const tasks = id => rows("SELECT JSON_OBJECT('id',task_id,'node',node_key,'assignee',CAST(assignee AS CHAR),'status',status) FROM wf_task WHERE tenant_id=100000 AND instance_id=" + sql(id) + ' ORDER BY task_id;');
  const histories = id => rows("SELECT JSON_OBJECT('id',history_id,'task',task_id,'node',node_key,'action',action) FROM wf_task_history WHERE tenant_id=100000 AND instance_id=" + sql(id) + ' ORDER BY history_id;');
  const digest = id => database("SELECT SHA2(JSON_OBJECT('status',status,'version',lock_version,'variables',variables,'end',end_time),256) FROM wf_process_instance WHERE tenant_id=100000 AND instance_id=" + sql(id) + ';');
  const grants = () => database('SELECT tenant_id,role_id,menu_id FROM sys_role_menu ORDER BY tenant_id,role_id,menu_id;');
  const originalGrants = grants();
  let formId, failure, draftChecked = false;
  const observe = async (sample, expected) => {
    check(sample.name + '实例保存' + expected, instance(sample.id)?.status === expected);
    await waitFor(() => database('SELECT status FROM wf_process_monitor WHERE tenant_id=100000 AND instance_id=' + sql(sample.id) + ';'), value => value === expected, 'Process monitor did not match actual instance state');
    check(sample.name + '监控同步保存' + expected, true); observed.add(expected);
    const detail = successful(await api(admin, '/workflow/monitor/process/' + sample.id), '读取真实流程监控详情');
    const query = new URLSearchParams({ processDefKey: sample.key, status: expected, pageNum: '1', pageSize: '10' });
    const filtered = successful(await api(admin, '/workflow/monitor/process/list?' + query), '按真实状态筛选流程监控');
    check(sample.name + '监控详情和筛选准确返回' + expected, detail.instanceId === sample.id && detail.status === expected
      && filtered.total === 1 && filtered.rows.length === 1 && filtered.rows[0].instanceId === sample.id && filtered.rows[0].status === expected);
    query.set('status', expected === 'RUNNING' ? 'PASSED' : 'RUNNING');
    const other = successful(await api(admin, '/workflow/monitor/process/list?' + query), '核对不匹配状态的监控筛选');
    check(sample.name + '监控筛选排除不匹配状态', other.total === 0 && other.rows.length === 0);
    const trend = successful(await api(admin, '/workflow/monitor/trend?' + new URLSearchParams({ days: '7', processDefKey: sample.key })), '读取自有流程真实趋势');
    check(sample.name + '趋势按成功和活动状态正确分组' + expected, trend.length === 1 && trend[0].started === 1
      && trend[0].completed === Number(successfulStates.has(expected)) && trend[0].running === Number(activeStates.has(expected)));
    monitored.add(expected);
    await ui.observe(sample, expected);
    await mobileUi.observe(sample, expected);
  };
  const approval = (id, assignee, extra = {}) => ({ id, type: 'APPROVAL', title: id, approverType: 'USER', approverValue: assignee,
    approveSelf: 'ALLOW', allowAgent: false, allowRollback: true, rejectStrategy: 'TERMINATE', ...extra });
  const create = async (name, middle = [approval('review', users[1])]) => {
    const nodes = [{ id: 'start', type: 'START', title: '发起' }, ...middle, { id: 'end', type: 'END', title: '结束' }];
    const edges = nodes.slice(1).map((node, index) => ({ id: nodes[index].id + '-' + node.id, source: nodes[index].id, target: node.id }));
    const saved = successful(await post(admin, base + '/definition/save', { processKey: marker + '-' + name, processName: marker + '-' + name,
      formId, modelJson: JSON.stringify({ nodes, edges }), startPermissionType: 'ALL', startPermissionValue: '[]' }), '保存状态验证定义');
    const definition = saved.definitionId ?? saved.id; assert.ok(definition); definitions.push(definition);
    successful(await post(admin, base + '/definition/deploy/' + definition), '发布状态验证定义');
    const context = successful(await api(admin, base + '/draft/context/' + definition), '读取状态验证发起上下文');
    const draft = successful(await post(admin, base + '/draft', { definitionId: definition, expectedVersion: 0, loadedContextHash: context.contextHash,
      title: marker + '-' + name, formData: { note: marker }, nodeAssignees: {} }), '正常保存流程草稿');
    if (!draftChecked) {
      check('草稿按已批准H1设计独立保存且未提前建立实例', database('SELECT COUNT(*) FROM wf_form_draft WHERE tenant_id=100000 AND user_id=' + users[0] + ' AND draft_id=' + sql(draft.draftId) + ';') === '1'
        && database('SELECT COUNT(*) FROM wf_process_instance WHERE tenant_id=100000 AND business_key=' + sql('WF_DRAFT:' + draft.draftId) + ';') === '0');
      draftChecked = true;
    }
    const started = successful(await post(admin, base + '/start', { draftId: draft.draftId, expectedVersion: draft.lockVersion }), '正常提交状态验证草稿');
    const sample = { name, key: marker + '-' + name, id: started.instanceId ?? started.processInstanceId }; assert.ok(sample.id); samples.push(sample);
    check(name + '提交成功后原草稿已消费', database('SELECT COUNT(*) FROM wf_form_draft WHERE tenant_id=100000 AND draft_id=' + sql(draft.draftId) + ';') === '0');
    return sample;
  };
  const complete = async (sample, node, page, action = 'APPROVE') => {
    const pending = tasks(sample.id).filter(item => item.node === node); assert.equal(pending.length, 1);
    successful(await post(page, base + '/complete', { taskId: pending[0].id, action, comment: marker + '-' + sample.name + '-' + action }), '通过本人实际任务入口处置');
    return pending[0];
  };
  const rejectResume = async sample => {
    const before = digest(sample.id), beforeTasks = JSON.stringify(tasks(sample.id)), beforeHistory = JSON.stringify(histories(sample.id));
    const denied = await post(admin, base + '/resume', { instanceId: sample.id });
    check(sample.name + '非法恢复被拒绝且原状态待办历史保持', denied.status === 409 && denied.body?.code === 'INVALID_STATE' && digest(sample.id) === before
      && JSON.stringify(tasks(sample.id)) === beforeTasks && JSON.stringify(histories(sample.id)) === beforeHistory);
  };
  try {
    const form = successful(await post(admin, base + '/form/save', { formKey: marker, formName: marker, fieldsJson: JSON.stringify([{ id: 'note', type: 'TEXT', label: '说明' }]) }), '建立状态验证表单');
    formId = form.formId ?? form.id; assert.ok(formId);
    const lifecycle = await create('pause-pass', [approval('review', users[1]), approval('review2', users[2])]);
    await observe(lifecycle, 'RUNNING');
    successful(await post(admin, base + '/pause', { instanceId: lifecycle.id }), '管理员正常暂停运行流程'); await observe(lifecycle, 'PAUSED');
    const pausedTask = tasks(lifecycle.id)[0], pausedDigest = digest(lifecycle.id);
    const blocked = await post(employee, base + '/complete', { taskId: pausedTask.id, action: 'APPROVE', comment: marker + '-paused' });
    check('暂停中审批拒绝且原待办不消耗', blocked.status === 409 && blocked.body?.code === 'INVALID_STATE'
      && digest(lifecycle.id) === pausedDigest && tasks(lifecycle.id).some(item => item.id === pausedTask.id));
    successful(await post(admin, base + '/resume', { instanceId: lifecycle.id }), '管理员正常恢复暂停流程'); await observe(lifecycle, 'RUNNING');
    await complete(lifecycle, 'review', employee); await complete(lifecycle, 'review2', manager); await observe(lifecycle, 'PASSED'); await rejectResume(lifecycle);

    const cancelled = await create('cancel'); successful(await post(admin, base + '/recall', { instanceId: cancelled.id }), '发起人撤销未审批流程');
    await observe(cancelled, 'CANCELLED'); await rejectResume(cancelled);
    const terminated = await create('terminate'); successful(await post(admin, base + '/instance/terminate', { instanceId: terminated.id, reason: marker + '-terminate' }), '管理员正常终止流程');
    await observe(terminated, 'TERMINATED'); await rejectResume(terminated);
    const rejected = await create('reject'); await complete(rejected, 'review', employee, 'REJECT'); await observe(rejected, 'REJECTED'); await rejectResume(rejected);

    const withdrawn = await create('withdraw', [approval('review', users[1]), approval('review2', users[2])]);
    const completed = await complete(withdrawn, 'review', employee);
    const originalApproval = histories(withdrawn.id).filter(item => item.task === completed.id && item.action === 'APPROVE'); assert.equal(originalApproval.length, 1);
    successful(await post(employee, '/workflow/enhance/task/withdraw', { historyId: originalApproval[0].id }), '审批人通过实际历史入口撤回');
    await observe(withdrawn, 'WITHDRAWN'); await rejectResume(withdrawn);
    check('撤回后恢复本人待办并撤销下游待办', tasks(withdrawn.id).length === 1 && tasks(withdrawn.id)[0].assignee === users[1] && tasks(withdrawn.id)[0].node === 'review');
    await complete(withdrawn, 'review', employee); await observe(withdrawn, 'RUNNING'); await complete(withdrawn, 'review2', manager); await observe(withdrawn, 'PASSED');

    const returned = await create('return-restart', [approval('review', users[1], { rejectStrategy: 'TO_INITIATOR' })]);
    await complete(returned, 'review', employee, 'REJECT'); await observe(returned, 'TASK_BACK');
    check('退回发起人形成可修改的本人待办', tasks(returned.id).length === 1 && tasks(returned.id)[0].node === 'start' && tasks(returned.id)[0].assignee === users[0]);
    await complete(returned, 'start', admin); await observe(returned, 'RESTARTED');
    await complete(returned, 'review', employee); await observe(returned, 'PASSED');

    const waiting = await create('pending-invalidated', [{ id: 'timer', type: 'TIMER', title: '等待', props: { timerType: 'DELAY', delayValue: 1, delayUnit: 'DAY', timerAction: 'AUTO_PASS' } }]);
    await observe(waiting, 'PENDING');
    successful(await post(admin, '/workflow/enhance/instance/invalidate', { instanceId: waiting.id, reason: marker + '-invalidate' }), '管理员通过正常入口作废流程');
    await observe(waiting, 'INVALIDATED'); await rejectResume(waiting);
    const automatic = await create('auto', [{ id: 'message', type: 'SCRIPT', title: '自动通知', props: { triggerType: 'MESSAGE', callAsync: false,
      actionBody: { recipientIds: [users[0]], title: marker + '-auto', content: marker + '-auto' }, failStrategy: 'BLOCK', retryCount: 0, timeoutSeconds: 10 } }]);
    await observe(automatic, 'AUTO_PASSED'); await rejectResume(automatic);
    const failed = await create('failed', [{ id: 'trigger', type: 'SCRIPT', title: '协议拒绝', props: { triggerType: 'HTTP_CALLBACK', callAsync: false,
      actionUrl: 'file:///C:/Windows/win.ini', actionMethod: 'POST', failStrategy: 'BLOCK', retryCount: 0, timeoutSeconds: 1 } }]);
    await observe(failed, 'FAILED');
    successful(await post(admin, base + '/instance/terminate', { instanceId: failed.id, reason: marker + '-failed-cleanup' }), '管理员正常结束受阻流程');
    const required = ['RUNNING', 'PASSED', 'AUTO_PASSED', 'REJECTED', 'TERMINATED', 'INVALIDATED', 'CANCELLED', 'WITHDRAWN', 'TASK_BACK', 'PAUSED', 'RESTARTED', 'PENDING', 'FAILED'];
    check('十三种已发起实例状态均由实际操作产生并同步监控', observed.size === required.length && required.every(value => observed.has(value)));
    const expectedOverview = () => rows("SELECT JSON_OBJECT('todayStarted',SUM(start_time>=CURDATE()),'todayCompleted',SUM(start_time>=CURDATE() AND status IN ('PASSED','AUTO_PASSED')),'runningCount',SUM(status IN ('RUNNING','WITHDRAWN','TASK_BACK','RESTARTED','PENDING'))) FROM wf_process_monitor WHERE tenant_id=100000;")[0];
    const beforeOverview = expectedOverview();
    const overview = successful(await api(admin, '/workflow/monitor/overview'), '读取真实监控概览');
    const afterOverview = expectedOverview();
    check('监控概览按真实落库记录汇总且读取期间样本稳定', JSON.stringify(beforeOverview) === JSON.stringify(afterOverview)
      && Object.entries(afterOverview).every(([key, value]) => overview[key] === value));
    evidence.instanceStateActions = true; evidence.instanceStateDenials = true; evidence.draftStoredSeparately = draftChecked;
    evidence.instanceStateMonitorApi = required.every(value => monitored.has(value));
    evidence.instanceStateBrowser = required.every(value => ui.checked.has(value));
    check('十三种实际实例状态的页面筛选与标签全部核对', evidence.instanceStateBrowser);
    evidence.instanceStateMobileMonitor = required.every(value => mobileUi.checked.has(value));
    check('十三种实际实例状态手机触屏监控统计与标签全部核对', evidence.instanceStateMobileMonitor);
    await mobileUi.verifyRouteBoundary();
    console.log('B2_INSTANCE_STATES_ACTUAL: ' + JSON.stringify({ workflows: samples.length, instanceStates: [...observed].sort(), instanceStateCount: observed.size,
      monitorApiStates: monitored.size, monitorApiEndpoints: ['process/detail', 'process/list', 'trend', 'overview'], browserStateFilters: ui.checked.size,
      browserFilterOptions: 14, desktopBrowserVerified: true, mobileBrowserVerified: false,
      mobileMonitorStates: mobileUi.checked.size, mobileBrowserEmulated: true, physicalPhoneTested: false,
      draftStorage: 'wf_form_draft', draftIsNotPrematureInstance: true, realWorkflowEndpoints: true, forcedWorkflowOutcomeWrites: 0 }));
  } catch (error) { failure = error; }
  finally {
    try {
      for (const sample of samples) if (['RUNNING', 'PENDING', 'PAUSED', 'FAILED', 'WITHDRAWN', 'TASK_BACK', 'RESTARTED'].includes(instance(sample.id).status))
        successful(await post(admin, base + '/instance/terminate', { instanceId: sample.id, reason: marker + '-cleanup' }), '正常收尾自有状态验证流程');
      for (const definition of definitions) database("UPDATE wf_process_definition SET status='ARCHIVED' WHERE tenant_id=100000 AND deleted=0 AND definition_id=" + sql(definition) + ' AND process_key LIKE ' + sql(marker + '%') + ';');
      check('状态验证收尾且原授权集合保持', grants() === originalGrants && samples.every(sample => ['PASSED', 'AUTO_PASSED', 'REJECTED', 'TERMINATED', 'INVALIDATED', 'CANCELLED'].includes(instance(sample.id).status) && tasks(sample.id).length === 0));
      evidence.instanceStatesRestoration = true;
    } catch (error) { failure = new AggregateError([failure, error].filter(Boolean), 'Instance state verification cleanup failed'); }
  }
  if (failure) throw failure;
}
