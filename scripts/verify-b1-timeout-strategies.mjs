import assert from 'node:assert/strict';
import { readOwnedJobKeys, signJobRequest } from './job-internal-signing.mjs';

export async function verifyB1TimeoutStrategies({ admin, employee, api, successful, session, database, check, caseTag, secrets, evidence, redis, state }) {
  const marker = 'B1TO' + caseTag, base = '/workflow/wf', jobsRoot = '/auth/system/job';
  const sql = value => 'CONVERT(0x' + Buffer.from(String(value)).toString('hex') + ' USING utf8mb4) COLLATE utf8mb4_unicode_ci';
  const rows = statement => database(statement).split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
  const post = (page, url, body = {}) => api(page, url, { method: 'POST', body });
  const manager = await session('g_holiday_manager');
  const token = await manager.evaluate(async () => (await import('/src/utils/authStorage.ts')).getAuthToken());
  assert.ok(token); secrets.add(token.replace(/^Bearer /, ''));
  const people = ['g_import_admin', 'g_holiday_employee', 'g_holiday_manager'].map((name, index) => {
    const id = database("SELECT user_id FROM sys_user WHERE tenant_id=100000 AND deleted=0 AND status='0' AND user_name=" + sql(name) + ';');
    assert.match(id, /^[1-9][0-9]*$/); return { id, page: [admin, employee, manager][index] };
  });
  const [owner, starter, reviewer] = people;
  const keys = await readOwnedJobKeys(state), workflow = state.services.find(item => item.name === 'workflow');
  for (const key of Object.values(keys)) secrets.add(key);
  assert.ok(workflow);
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const waitFor = async (read, accept, label) => {
    const end = Date.now() + 90000;
    do { const value = await read(); if (accept(value)) return value; await sleep(250); } while (Date.now() < end);
    throw new Error(label);
  };
  const tenants = database('SELECT tenant_id FROM sys_tenant ORDER BY tenant_id;').split(/\r?\n/).filter(Boolean);
  for (const tenant of tenants) assert.match(tenant, /^[1-9][0-9]*$/);
  const queue = tenant => tenant + ':sys:task:timeouts';
  const indexes = () => JSON.stringify(tenants.map(tenant => [tenant, redis('ZRANGE', queue(tenant), 0, -1, 'WITHSCORES'), redis('ZRANGE', tenant + ':sys:task:reminders', 0, -1, 'WITHSCORES')]));
  const grants = () => database('SELECT tenant_id,role_id,menu_id FROM sys_role_menu ORDER BY tenant_id,role_id,menu_id;');
  const config = () => database('SELECT tenant_id,job_id,job_name,status,handler_name,interval_ms,cron_expression,deleted FROM sys_job WHERE job_name NOT LIKE ' + sql(marker + '%') + ' ORDER BY job_id;');
  const template = () => database("SELECT template_id,tenant_id,title_template,content_template,params_declare,version FROM sys_message_template WHERE template_code='WF_TASK_TIMEOUT' ORDER BY tenant_id;");
  const identities = () => database('SELECT user_id,dept_id,status,deleted,version FROM sys_user WHERE user_id IN (' + people.map(item => item.id).join(',') + ') ORDER BY user_id;');
  const original = { indexes: indexes(), grants: grants(), config: config(), template: template(), identities: identities() };
  const definitions = [], instances = [], timedTasks = [];
  let formId, job, failure, lastTrigger = 0, starts = 0, approvals = 0, automatic = 0, traceChecks = 0;
  const tasks = id => rows("SELECT JSON_OBJECT('id',task_id,'node',node_key,'user',CAST(assignee AS CHAR),'type',task_type,'status',status) FROM wf_task WHERE tenant_id=100000 AND instance_id=" + sql(id) + ' ORDER BY task_id;');
  const histories = id => rows("SELECT JSON_OBJECT('id',history_id,'task',task_id,'node',node_key,'user',CAST(operator_id AS CHAR),'operatorName',operator_name,'type',task_type,'action',action,'comment',comment,'metadata',variables_changed) FROM wf_task_history WHERE tenant_id=100000 AND instance_id=" + sql(id) + ' ORDER BY history_id;');
  const status = id => database('SELECT status FROM wf_process_instance WHERE tenant_id=100000 AND instance_id=' + sql(id) + ';');
  const snapshot = id => JSON.stringify({ tasks: tasks(id), history: histories(id), instance: database('SELECT status,lock_version,variables,end_time FROM wf_process_instance WHERE tenant_id=100000 AND instance_id=' + sql(id) + ';') });
  const taskAt = (id, node, user) => {
    const pending = tasks(id); assert.equal(pending.length, 1); assert.equal(pending[0].node, node); assert.equal(pending[0].user, user.id); return pending[0];
  };
  const approval = (id, user, props = {}) => ({ id, type: 'APPROVAL', title: id, approverType: 'USER', approverValue: user.id, approveSelf: 'ALLOW', allowAgent: false, ...props });
  const timed = (strategy, props = {}) => approval('review', reviewer, { slaHours: 1, slaAction: 'AUTO_REJECT', rejectStrategy: strategy, ...props });
  const definition = async (name, middle) => {
    const nodes = [{ id: 'start', type: 'START', title: '发起' }, ...middle, { id: 'end', type: 'END', title: '结束' }];
    const model = { nodes, edges: nodes.slice(1).map((node, index) => ({ id: 'edge-' + index, source: nodes[index].id, target: node.id })) };
    const key = marker + '-' + name;
    const saved = successful(await post(admin, base + '/definition/save', { processKey: key, processName: key, formId,
      modelJson: JSON.stringify(model), startPermissionType: 'ALL', startPermissionValue: '[]' }), '保存自有超时策略定义');
    const id = saved.definitionId ?? saved.id; assert.ok(id); definitions.push(id);
    successful(await post(admin, base + '/definition/deploy/' + id), '发布自有超时策略定义'); return { id, key };
  };
  const start = async definition => {
    const context = successful(await api(employee, base + '/draft/context/' + definition.id), '读取真实超时发起上下文');
    const draft = successful(await post(employee, base + '/draft', { definitionId: definition.id, expectedVersion: 0,
      loadedContextHash: context.contextHash, title: definition.key, formData: { note: marker }, nodeAssignees: {} }), '保存超时验收草稿');
    const result = successful(await post(employee, base + '/start', { draftId: draft.draftId, expectedVersion: draft.lockVersion }), '员工真实发起超时流程');
    const id = result.instanceId ?? result.processInstanceId; assert.ok(id); instances.push(id); starts++;
    check('真实超时发起消费草稿', database('SELECT COUNT(*) FROM wf_form_draft WHERE tenant_id=100000 AND draft_id=' + sql(draft.draftId) + ';') === '0'); return id;
  };
  const complete = async (id, node, user, variables) => {
    const task = taskAt(id, node, user);
    successful(await post(user.page, base + '/complete', { taskId: task.id, action: 'APPROVE', comment: marker + '-approve-' + approvals, variables }), '本人完成超时前置审批或重审');
    approvals++; check('本人审批消费待办并保存本人历史', !tasks(id).some(item => item.id === task.id) && histories(id).some(item => item.task === task.id && item.user === user.id && item.action === 'APPROVE'));
  };
  const logs = () => rows("SELECT JSON_OBJECT('executeNo',execute_no,'status',execute_status,'affected',affected_rows,'message',result_msg,'actor',trigger_by,'trigger',trigger_type,'duration',duration_ms,'report',report_time) FROM sys_job_log WHERE job_id=" + job + ' ORDER BY log_id;');
  const trigger = async (handled, stale = 0) => {
    if (lastTrigger && Date.now() - lastTrigger < 5300) await sleep(5300 - (Date.now() - lastTrigger));
    const result = successful(await post(admin, jobsRoot + '/' + job + '/trigger'), '实际触发超时扫描'); assert.equal(result.accepted, true); lastTrigger = Date.now();
    const log = await waitFor(() => logs().find(item => item.executeNo === result.executeNo), item => item && item.status !== 'RUNNING', 'Timeout strategy dispatch did not finish');
    const expected = `超时扫描完成：自动处理${handled}项，转人工0项，移除失效${stale}项，暂缓0项`;
    check('超时调度准确归档真实处理数量和操作者', log.status === 'SUCCESS' && log.affected === handled && log.message === expected
      && log.actor === 'g_import_admin' && log.trigger === 'MANUAL' && Number.isInteger(log.duration) && log.report);
    const target = '/inner/job/status/' + result.executeNo, headers = signJobRequest(keys, 'cloudflow-auth', 'cloudflow-service-workflow', 'GET', target, '');
    secrets.add(headers['X-Job-Signature']);
    const response = await fetch('http://127.0.0.1:' + workflow.port + target, { headers, signal: AbortSignal.timeout(10000) }), body = await response.json();
    check('独立身份状态反查与超时归档一致', response.status === 200 && body.code === 200 && body.data.affectedRows === handled && body.data.resultMsg === expected);
  };
  const automaticAt = async (id, action, metadata = {}) => {
    const task = taskAt(id, 'review', reviewer), score = Number(redis('ZSCORE', queue('100000'), JSON.stringify(task.id)));
    check('引擎为真实待办登记一小时超时索引', score > Date.now() + 3300000 && score <= Date.now() + 3600000);
    timedTasks.push(task.id); redis('ZADD', queue('100000'), Date.now() - 1000, JSON.stringify(task.id));
    await trigger(1); automatic++;
    check('真实扫描消费原待办并移除其超时索引', !tasks(id).some(item => item.id === task.id) && redis('ZSCORE', queue('100000'), JSON.stringify(task.id)) === '');
    const saved = histories(id).filter(item => item.task === task.id); assert.equal(saved.length, 1);
    const history = saved[0], detail = JSON.parse(history.metadata || '{}'), type = action === 'REJECT' ? 'AUTO_REJECT' : 'AUTO_PASS';
    check('超时历史保存自动语义、系统处理人及准确目标', history.type === type && history.user === reviewer.id && history.operatorName === '系统自动处理'
      && (action === 'REJECT' ? ['REJECT','REJECT_TO_PREVIOUS'].includes(history.action) : history.action === 'APPROVE')
      && Object.entries(metadata).every(([key, value]) => detail[key] === value));
    const trace = successful(await api(employee, base + '/instance/' + id + '/trace'), '发起人读取超时实际轨迹');
    check('轨迹返回同一自动处理历史与原因', trace.historyDetails?.some(item => item.historyId === history.id && item.taskId === task.id && item.taskType === type && item.comment === history.comment)); traceChecks++;
    return history;
  };
  const preserved = async (id, history) => {
    check('后续重审保留原自动处理历史', JSON.stringify(histories(id).find(item => item.id === history.id)) === JSON.stringify(history));
    const trace = successful(await api(employee, base + '/instance/' + id + '/trace'), '结束后读取超时轨迹');
    check('结束后仍能读取原自动处理语义', trace.historyDetails?.some(item => item.historyId === history.id && item.taskType === history.type)); traceChecks++;
  };
  const finish = id => check('超时后完整重审通过且无遗留待办', status(id) === 'PASSED' && tasks(id).length === 0);
  const children = id => rows("SELECT JSON_OBJECT('id',instance_id,'status',status) FROM wf_process_instance WHERE tenant_id=100000 AND parent_instance_id=" + sql(id) + ' ORDER BY instance_id;');
  try {
    assert.equal(database("SELECT COUNT(*) FROM sys_job WHERE deleted=0 AND status='ENABLED' AND handler_name IN ('taskReminder','taskTimeout','taskTimeoutCleanup');"), '0');
    for (const tenant of tenants) assert.equal(redis('ZCOUNT', queue(tenant), '-inf', Date.now()), '0', 'No pre-existing due work permitted');
    assert.ok(original.template.includes('${title}\t${content}'));
    const originalJob = successful(await api(admin, jobsRoot + '/113'), '读取已批准超时处理器'); assert.equal(originalJob.handlerName, 'taskTimeout'); assert.equal(originalJob.status, 'PAUSED');
    successful(await post(admin, jobsRoot, { ...originalJob, jobId: undefined, jobName: marker, jobGroup: 'A3_VERIFY', handlerParam: marker, status: 'PAUSED',
      triggerType: 'FIXED_RATE', cronExpression: null, intervalMs: 60000, concurrentFlag: 0, misfireStrategy: 'IGNORE', retryCount: 0, dispatchRetryCount: 0,
      timeoutSeconds: 90, lockTimeSeconds: 90, criticalFlag: 0, alarmOnFailFlag: 1, alarmReceiver: starter.id, logSuccessFlag: 1 }), '建立暂停的自有超时验证任务');
    job = database('SELECT job_id FROM sys_job WHERE tenant_id=100000 AND deleted=0 AND job_name=' + sql(marker) + ';'); assert.match(job, /^[1-9][0-9]*$/);
    const form = successful(await post(admin, base + '/form/save', { formKey: marker, formName: marker, fieldsJson: '[{"id":"note","type":"TEXT","label":"说明"}]' }), '建立自有超时验收表单');
    formId = form.formId ?? form.id; assert.ok(formId);
    for (const strategy of ['TO_INITIATOR','TO_PREVIOUS_NODE','TO_SPECIFIED_NODE']) {
      console.log('B1_TIMEOUT_SCENARIO: ' + strategy);
      const id = await start(await definition(strategy, [approval('pre', starter), approval('middle', owner), timed(strategy, strategy === 'TO_SPECIFIED_NODE' ? { rejectToNodeKey: 'pre' } : {}), approval('after', owner)]));
      await complete(id, 'pre', starter); await complete(id, 'middle', owner);
      const target = strategy === 'TO_INITIATOR' ? 'start' : strategy === 'TO_PREVIOUS_NODE' ? 'middle' : 'pre';
      const history = await automaticAt(id, 'REJECT', strategy === 'TO_INITIATOR' ? { rejectStrategy: strategy } : { targetNodeKey: target });
      const returned = taskAt(id, target, target === 'middle' ? owner : starter);
      check('自动拒绝按节点配置产生准确回退待办', returned.type === (target === 'start' ? 'REJECT' : 'REJECT_JUMP'));
      if (target === 'start') {
        check('自动退回发起人后等待修改', status(id) === 'TASK_BACK');
        await complete(id, 'start', starter, { note: marker + '-resubmitted' });
        check('自动退回后的实际重提保存修改内容', database("SELECT JSON_UNQUOTE(JSON_EXTRACT(variables,'$.note')) FROM wf_process_instance WHERE tenant_id=100000 AND instance_id=" + sql(id) + ';') === marker + '-resubmitted');
      }
      if (target !== 'middle') await complete(id, 'pre', starter);
      await complete(id, 'middle', owner); await complete(id, 'review', reviewer); await complete(id, 'after', owner); finish(id); await preserved(id, history);
    }
    evidence.b1TimeoutLinear = true;
    console.log('B1_TIMEOUT_SCENARIO: TERMINATE');
    const terminated = await start(await definition('terminate', [timed('TERMINATE')]));
    const terminalHistory = await automaticAt(terminated, 'REJECT', { rejectStrategy: 'TERMINATE' });
    check('自动拒绝直接结束策略保存终态且清空待办', status(terminated) === 'REJECTED' && tasks(terminated).length === 0); await preserved(terminated, terminalHistory); evidence.b1TimeoutTerminate = true;
    const childDefinition = await definition('child', [timed('TO_PARENT_NODE')]);
    const subprocess = wait => ({ id: 'call', type: 'SUBPROCESS', title: '调用子流程', props: { subprocessId: childDefinition.key, waitForCompletion: wait } });
    console.log('B1_TIMEOUT_SCENARIO: TO_PARENT_NODE');
    const parent = await start(await definition('parent', [subprocess(true), approval('after', owner)]));
    const originalChildren = children(parent); assert.equal(originalChildren.length, 1); const child = originalChildren[0].id; instances.push(child);
    check('自动回父调用前实际父流程等待子流程', status(parent) === 'PENDING' && tasks(parent).length === 0);
    const parentHistory = await automaticAt(child, 'REJECT', { rejectStrategy: 'TO_PARENT_NODE' });
    const replacement = children(parent).filter(item => item.id !== child); assert.equal(replacement.length, 1); instances.push(replacement[0].id);
    check('自动回父调用结束旧子并重新产生子待办', status(child) === 'REJECTED' && tasks(child).length === 0 && status(parent) === 'PENDING'
      && taskAt(replacement[0].id, 'review', reviewer).type === 'REJECT_JUMP');
    await complete(replacement[0].id, 'review', reviewer);
    await waitFor(() => tasks(parent), pending => pending.length === 1 && pending[0].node === 'after', 'Parent did not resume after automatic rewind');
    await complete(parent, 'after', owner); finish(parent); finish(replacement[0].id); await preserved(child, parentHistory); evidence.b1TimeoutParent = true;
    console.log('B1_TIMEOUT_SCENARIO: PARENT_FINISHED');
    const endedParent = await start(await definition('parent-ended', [subprocess(false), approval('after', owner)]));
    const detached = children(endedParent); assert.equal(detached.length, 1); const detachedChild = detached[0].id; instances.push(detachedChild);
    await complete(endedParent, 'after', owner); finish(endedParent); const parentBefore = snapshot(endedParent);
    const degraded = await automaticAt(detachedChild, 'REJECT', { rejectStrategy: 'PARENT_FINISHED_DEGRADE_TO_TERMINATE' });
    check('父已真实结束时自动拒绝降级且父数据保持', status(detachedChild) === 'REJECTED' && tasks(detachedChild).length === 0 && snapshot(endedParent) === parentBefore);
    await preserved(detachedChild, degraded); evidence.b1TimeoutDegrade = true;
    console.log('B1_TIMEOUT_SCENARIO: DEFAULT_AUTO_PASS');
    const defaultDefinition = await definition('default-pass', [approval('review', reviewer, { slaHours: 1 })]);
    const savedModel = JSON.parse(database('SELECT model_json FROM wf_process_definition WHERE tenant_id=100000 AND definition_id=' + sql(defaultDefinition.id) + ';'));
    const reviewNode = savedModel.nodes.find(item => item.id === 'review');
    check('已发布缺省样本明确未配置slaAction', reviewNode.slaHours === 1 && !Object.hasOwn(reviewNode, 'slaAction'));
    const defaulted = await start(defaultDefinition), defaultHistory = await automaticAt(defaulted, 'APPROVE');
    check('未配置超时动作实际自动通过', status(defaulted) === 'AUTO_PASSED' && tasks(defaulted).length === 0); await preserved(defaulted, defaultHistory); evidence.b1TimeoutDefault = true;
    const defaultBefore = snapshot(defaulted);
    redis('ZADD', queue('100000'), Date.now() - 1000, JSON.stringify(defaultHistory.task)); await trigger(0, 1);
    check('重投已完成超时任务只清索引且不重复历史', snapshot(defaulted) === defaultBefore && redis('ZSCORE', queue('100000'), JSON.stringify(defaultHistory.task)) === ''); evidence.b1TimeoutRepeat = true;
    console.log('B1_TIMEOUT_STRATEGIES_ACTUAL: ' + JSON.stringify({ realStarts: starts, actualInstances: instances.length, humanApprovals: approvals,
      automaticCompleted: automatic, autoRejections: 6, defaultAutoPass: 1, strategies: 5, traceChecks, staleReplay: 1, naturalOneHourWait: false, forcedWorkflowOutcomeWrites: 0 }));
  } catch (error) { failure = error; }
  finally {
    try {
      if (job) await waitFor(logs, items => items.every(item => item.status !== 'RUNNING'), 'Owned timeout job still running');
      const owned = rows("SELECT JSON_OBJECT('id',instance_id) FROM wf_process_instance WHERE tenant_id=100000 AND definition_id IN (SELECT definition_id FROM wf_process_definition WHERE process_key LIKE " + sql(marker + '-%') + ');');
      for (const { id } of owned) if (['RUNNING','PAUSED','FAILED','PENDING','WITHDRAWN','TASK_BACK','RESTARTED'].includes(status(id)))
        successful(await post(admin, base + '/instance/terminate', { instanceId: id, reason: marker + '-cleanup' }), '结束自有未完成超时流程');
      for (const taskId of timedTasks) { redis('ZREM', queue('100000'), JSON.stringify(taskId)); redis('DEL', '100000:sys:task:timeout:retry:' + taskId); }
      for (const id of definitions) {
        database('DELETE FROM wf_form_draft WHERE tenant_id=100000 AND user_id=' + starter.id + ' AND definition_id=' + sql(id) + ';');
        database("UPDATE wf_process_definition SET status='ARCHIVED',deleted=0 WHERE tenant_id=100000 AND definition_id=" + sql(id) + ' AND process_key LIKE ' + sql(marker + '-%') + ';');
      }
      check('超时验证原索引配置模板及身份权限保持', indexes() === original.indexes && config() === original.config && grants() === original.grants
        && identities() === original.identities && template() === original.template && owned.every(item => ['PASSED','AUTO_PASSED','REJECTED','TERMINATED','INVALIDATED','CANCELLED'].includes(status(item.id))));
      evidence.b1TimeoutRestoration = true;
    } catch (error) { failure = new AggregateError([failure, error].filter(Boolean), 'B1 timeout verification or restoration failed'); }
  }
  if (failure) throw failure;
}
