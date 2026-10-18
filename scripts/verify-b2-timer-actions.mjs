import assert from 'node:assert/strict';

// These are management actions on separate owned one-day timers, never the one-hour natural sample.
export async function verifyB2TimerActions({ admin, employee, api, successful, database, check, caseTag, redis, evidence }) {
  const marker = 'B2TA' + caseTag, base = '/workflow/wf', jobsRoot = '/auth/system/job';
  const sql = value => 'CONVERT(0x' + Buffer.from(String(value)).toString('hex') + ' USING utf8mb4) COLLATE utf8mb4_unicode_ci';
  const rows = query => database(query).split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
  const post = (page, url, body = {}) => api(page, url, { method: 'POST', body });
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const waitFor = async (read, accept, label) => {
    const deadline = Date.now() + 30000;
    do { const value = await read(); if (accept(value)) return value; await sleep(250); } while (Date.now() < deadline);
    throw new Error(label);
  };
  const definitions = [], samples = [];
  const instance = id => rows("SELECT JSON_OBJECT('status',status,'variables',CAST(variables AS JSON)) FROM wf_process_instance WHERE tenant_id=100000 AND instance_id=" + sql(id) + ';')[0];
  const history = id => rows("SELECT JSON_OBJECT('action',action,'type',task_type,'comment',comment) FROM wf_task_history WHERE tenant_id=100000 AND instance_id=" + sql(id) + " AND node_key='timer' ORDER BY history_id;");
  const config = () => database('SELECT tenant_id,job_id,job_name,status,handler_name,interval_ms,cron_expression,deleted FROM sys_job WHERE job_name NOT LIKE ' + sql(marker + '%') + ' ORDER BY job_id;');
  const beforeConfig = config(), queues = [100000, 100001].map(tenant => tenant + ':sys:wf:timers');
  const indices = () => JSON.stringify(queues.map(key => [key, redis('ZRANGE', key, 0, -1, 'WITHSCORES')]));
  const beforeIndices = indices();
  let formId, jobId, failure;
  const create = async name => {
    const model = { nodes: [{ id: 'start', type: 'START', title: '发起' }, { id: 'timer', type: 'TIMER', title: '一天定时', props: { timerType: 'DELAY', delayValue: 1, delayUnit: 'DAY', timerAction: 'AUTO_PASS' } }, { id: 'end', type: 'END', title: '结束' }],
      edges: [{ id: 'start-timer', source: 'start', target: 'timer' }, { id: 'timer-end', source: 'timer', target: 'end' }] };
    const saved = successful(await post(admin, base + '/definition/save', { processKey: marker + '-' + name, processName: marker + '-' + name, formId,
      modelJson: JSON.stringify(model), startPermissionType: 'ALL', startPermissionValue: '[]' }), '保存定时管理验证定义');
    const definition = saved.definitionId ?? saved.id; assert.ok(definition); definitions.push(definition);
    successful(await post(admin, base + '/definition/deploy/' + definition), '发布定时管理验证定义');
    const context = successful(await api(employee, base + '/draft/context/' + definition), '读取定时管理验证发起上下文');
    const draft = successful(await post(employee, base + '/draft', { definitionId: definition, expectedVersion: 0, loadedContextHash: context.contextHash,
      title: marker + '-' + name, formData: { note: marker }, nodeAssignees: {} }), '保存定时管理验证草稿');
    const before = Date.now();
    const started = successful(await post(employee, base + '/start', { draftId: draft.draftId, expectedVersion: draft.lockVersion }), '发起独立一天定时流程');
    const id = started.instanceId ?? started.processInstanceId; assert.ok(id);
    const sample = { id, name }; samples.push(sample);
    const actual = instance(id), waits = Object.values(actual.variables._wf_waits ?? {}).filter(item => item.kind === 'TIMER');
    assert.equal(waits.length, 1); sample.expireAt = waits[0].payload.expireAt;
    sample.key = 'sys:wf:timer:' + id + ':timer:root:' + waits[0].waitId;
    check(name + '实际等待一天且生成定时索引', actual.status === 'PENDING' && sample.expireAt >= before + 86399000
      && Number(redis('ZSCORE', queues[0], JSON.stringify(sample.key))) === sample.expireAt);
    return sample;
  };
  const removed = sample => redis('ZSCORE', queues[0], JSON.stringify(sample.key)) === '' && redis('EXISTS', '100000:' + sample.key) === '0';
  const finish = (page, sample, reason) => post(page, base + '/instance/' + sample.id + '/timer/timer/finish', { reason });
  try {
    for (const key of queues) assert.equal(redis('ZCOUNT', key, 0, Date.now() + 180000), '0', 'No unrelated timer work may become due');
    const form = successful(await post(admin, base + '/form/save', { formKey: marker, formName: marker, fieldsJson: JSON.stringify([{ id: 'note', type: 'TEXT', label: '说明' }]) }), '建立定时管理验证表单');
    formId = form.formId ?? form.id; assert.ok(formId);
    const invalidated = await create('invalidate');
    successful(await post(admin, '/workflow/enhance/instance/invalidate', { instanceId: invalidated.id, reason: marker + '-invalidate' }), '管理员正常作废等待流程');
    check('作废流程真实保存INVALIDATED并清除等待与索引', instance(invalidated.id).status === 'INVALIDATED'
      && !Object.values(instance(invalidated.id).variables._wf_waits ?? {}).some(item => item.kind === 'TIMER') && removed(invalidated));
    const rejectedFinish = await finish(admin, invalidated, marker + '-after-invalidation');
    check('作废后不能人工恢复定时流转', rejectedFinish.status === 409 && rejectedFinish.body?.code === 'INVALID_STATE'
      && instance(invalidated.id).status === 'INVALIDATED' && history(invalidated.id).length === 0);
    evidence.timerInvalidation = true;
    const manual = await create('manual');
    const denied = await finish(employee, manual, marker + '-employee');
    check('普通员工不能提前结束定时', denied.status === 403 && instance(manual.id).status === 'PENDING' && !removed(manual));
    const absentReason = await finish(admin, manual, '');
    check('管理员未填写原因不能提前结束', absentReason.status === 400 && absentReason.body?.code === 'INVALID_REQUEST'
      && instance(manual.id).status === 'PENDING' && history(manual.id).length === 0);
    const reason = marker + '-manual-finish'; successful(await finish(admin, manual, reason), '管理员填写原因提前结束定时');
    check('人工提前结束后通过且保存人工历史', Date.now() < manual.expireAt && instance(manual.id).status === 'PASSED' && removed(manual)
      && history(manual.id).length === 1 && history(manual.id)[0].type === 'MANUAL' && history(manual.id)[0].comment.includes(reason));
    const administrator = database("SELECT user_id FROM sys_user WHERE tenant_id=100000 AND deleted=0 AND user_name='g_import_admin';");
    await waitFor(() => redis('ZRANGE', '100000:sys:wf:audit:recent', 0, -1), value => value.includes('TIMER_FINISH|' + administrator + '|' + manual.id + '|') && value.includes(reason), 'Actual timer completion audit not observed');
    check('人工提前结束审计保存实际管理员实例和原因', true); evidence.timerManual = true;
    const beforeHistory = JSON.stringify(history(manual.id)); await sleep(5500);
    const repeated = await finish(admin, manual, reason);
    check('已结束定时再次操作拒绝且历史保持唯一', repeated.status === 409 && repeated.body?.code === 'INVALID_STATE'
      && JSON.stringify(history(manual.id)) === beforeHistory && instance(manual.id).status === 'PASSED');
    const original = successful(await api(admin, jobsRoot + '/114'), '读取原定时扫描处理器');
    assert.equal(original.handlerName, 'timerScan'); assert.equal(original.status, 'PAUSED');
    successful(await post(admin, jobsRoot, { ...original, jobId: undefined, jobName: marker + '-scan', jobGroup: 'B2_VERIFY', handlerParam: marker,
      status: 'PAUSED', criticalFlag: 0, alarmOnFailFlag: 0, logSuccessFlag: 1, retryCount: 0, dispatchRetryCount: 0 }), '创建独占暂停定时扫描验证任务');
    jobId = database('SELECT job_id FROM sys_job WHERE deleted=0 AND job_name=' + sql(marker + '-scan') + ';'); assert.match(jobId, /^[1-9][0-9]*$/);
    const execution = successful(await post(admin, jobsRoot + '/' + jobId + '/trigger'), '实际扫描已作废及提前结束后的队列'); assert.equal(execution.accepted, true);
    const result = await waitFor(() => rows("SELECT JSON_OBJECT('status',execute_status,'affected',affected_rows) FROM sys_job_log WHERE job_id=" + jobId + ' AND execute_no=' + sql(execution.executeNo) + ';')[0], value => value && value.status !== 'RUNNING', 'Actual timer scan did not finish');
    check('后续真实扫描不再触发已结束定时', result.status === 'SUCCESS' && result.affected === 0 && history(invalidated.id).length === 0
      && JSON.stringify(history(manual.id)) === beforeHistory && removed(invalidated) && removed(manual)); evidence.timerPostActionScan = true;
    console.log('B2_TIMER_ACTIONS_ACTUAL: ' + JSON.stringify({ workflows: 2, invalidated: true, manualCompletion: true, actualAdministratorAudit: true,
      subsequentRealScan: true, forcedWorkflowOutcomeWrites: 0, naturalTimerSampleModified: false }));
  } catch (error) { failure = error; }
  finally {
    try {
      if (jobId) await waitFor(() => database("SELECT COUNT(*) FROM sys_job_log WHERE job_id=" + jobId + " AND execute_status='RUNNING';"), value => value === '0', 'Owned timer action scan still running');
      for (const sample of samples) if (['RUNNING', 'PENDING', 'PAUSED', 'FAILED', 'WITHDRAWN', 'TASK_BACK', 'RESTARTED'].includes(instance(sample.id).status))
        successful(await post(admin, base + '/instance/terminate', { instanceId: sample.id, reason: marker + '-cleanup' }), '正常结束自有定时管理验证流程');
      for (const definition of definitions) database("UPDATE wf_process_definition SET status='ARCHIVED' WHERE tenant_id=100000 AND deleted=0 AND definition_id=" + sql(definition) + ' AND process_key LIKE ' + sql(marker + '%') + ';');
      check('定时管理验证后原任务配置和队列保持', config() === beforeConfig && indices() === beforeIndices && samples.every(removed));
      evidence.timerActionsRestoration = true;
    } catch (error) { failure = new AggregateError([failure, error].filter(Boolean), 'Timer action verification cleanup failed'); }
  }
  if (failure) throw failure;
}
