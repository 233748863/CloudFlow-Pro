import assert from 'node:assert/strict';

export async function verifyGatewayArchives(harness) {
  const { admin, api, post, successful, database, check, caseTag, quote, model, definition, enter, complete, finish, tasks, activations, arrivals } = harness;
  const handler = 'workflowGatewayArchiveCleanup';
  const jobName = `H1网关归档清理_${caseTag}`;
  successful(await post(admin, '/auth/system/job', { jobName, jobGroup: 'WORKFLOW', serviceName: 'workflow', handlerName: handler,
    triggerType: 'FIXED_DELAY', intervalMs: 86400000, status: 'PAUSED', concurrentFlag: 0, misfireStrategy: 'IGNORE',
    retryCount: 0, timeoutSeconds: 120, lockTimeSeconds: 180, criticalFlag: 0, logSuccessFlag: 1, alarmOnFailFlag: 0,
  }), '通过任务平台创建暂停的隔离归档清理任务');
  const jobId = database(`SELECT job_id FROM sys_job WHERE tenant_id=100000 AND job_name=${quote(jobName)} AND deleted=0;`);
  assert.match(jobId, /^[1-9][0-9]*$/);
  let round = 0;
  const scan = async expectedStatus => {
    const response = successful(await post(admin, `/auth/system/job/${jobId}/trigger`, {
      handlerParam: JSON.stringify({ caseTag, round: ++round }),
    }), '真实任务平台派发已归档实例清理');
    check('归档清理由集中任务平台接受并分配执行编号', response.accepted === true && typeof response.executeNo === 'string');
    const result = () => database(`SELECT execute_status FROM sys_job_log WHERE tenant_id=100000 AND execute_no=${quote(response.executeNo)};`);
    const deadline = Date.now() + 90000;
    while (!['SUCCESS', 'FAILED', 'TIMEOUT'].includes(result())) {
      assert.ok(Date.now() < deadline, '归档清理任务完成并报告结果');
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    check(`归档清理真实执行结果为${expectedStatus}`, result() === expectedStatus);
  };
  const definitionId = await definition('gateway-archive', model());
  const completed = async name => {
    const instanceId = await enter(definitionId, name);
    for (const task of tasks(instanceId)) successful(await complete(task, `${name}-${task.node}`), '归档前真实完成分支');
    await finish(instanceId, name);
    return instanceId;
  };
  const archived = await completed('archive-final');
  const unarchived = await completed('unarchived-final');
  const foreign = await completed('archive-foreign');
  const active = await enter(definitionId, 'archive-active');
  const flaggedActive = await enter(definitionId, 'archive-flagged-active');
  const snapshot = instanceId => JSON.stringify({ activations: activations(instanceId), arrivals: arrivals(instanceId) });
  const original = new Map([archived, unarchived, active, flaggedActive].map(instanceId => [instanceId, snapshot(instanceId)]));
  const foreignSnapshot = () => database(`SELECT CONCAT(tenant_id,':',activation_id,':',status) FROM wf_gateway_activation WHERE instance_id=${quote(foreign)};`);
  const trigger = `h1_archive_fault_${caseTag}`;
  assert.match(trigger, /^h1_archive_fault_[a-f0-9]{12}$/);
  assert.equal(database(`SELECT COUNT(*) FROM information_schema.triggers WHERE trigger_schema='cloud_flow_db' AND trigger_name=${quote(trigger)};`), '0');
  let faultInstalled = false;
  try {
    database(`UPDATE wf_process_instance SET deleted=1 WHERE tenant_id=100000 AND instance_id IN (${quote(archived)},${quote(foreign)},${quote(flaggedActive)});
      UPDATE wf_process_instance SET tenant_id=100001 WHERE tenant_id=100000 AND instance_id=${quote(foreign)};
      UPDATE wf_gateway_activation SET tenant_id=100001 WHERE tenant_id=100000 AND instance_id=${quote(foreign)};
      UPDATE wf_parallel_join SET tenant_id=100001 WHERE tenant_id=100000 AND instance_id=${quote(foreign)};`);
    console.log('H1_ARCHIVE_FIXTURE: archive_flag_and_foreign_tenant_set_in_owned_database=true; instance_archive_ui_not_used=true; production_modified=false');
    const foreignBefore = foreignSnapshot();
    database(`DELIMITER $$\nCREATE TRIGGER ${trigger} BEFORE DELETE ON wf_gateway_activation FOR EACH ROW BEGIN IF OLD.instance_id=${quote(archived)} THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='H1_OWNED_GATEWAY_ARCHIVE_FAULT'; END IF; END$$\nDELIMITER ;\n`);
    faultInstalled = true;
    await scan('FAILED');
    check('归档清理中途失败回滚已删除的到达记录和激活记录', snapshot(archived) === original.get(archived));
    database(`DROP TRIGGER ${trigger};`);
    faultInstalled = false;
    await scan('SUCCESS');
    check('真实归档清理入口同时移除激活与到达记录', activations(archived).length === 0 && arrivals(archived).length === 0);
    check('未归档终态、运行中及误标归档的活跃实例均保留轮次', [unarchived, active, flaggedActive].every(instanceId => snapshot(instanceId) === original.get(instanceId)));
    check('当前租户清理不会删除另一租户的归档轮次', foreignBefore === foreignSnapshot());
    check('归档清理保留实例及全部真实审批历史', database(`SELECT COUNT(*) FROM wf_process_instance WHERE tenant_id=100000 AND instance_id=${quote(archived)} AND deleted=1;`) === '1'
      && database(`SELECT COUNT(*) FROM wf_task_history WHERE tenant_id=100000 AND instance_id=${quote(archived)};`) === '4');
    await scan('SUCCESS');
    check('重复归档清理保持结果一致且没有重新创建记录', activations(archived).length === 0 && arrivals(archived).length === 0);
  } finally {
    if (faultInstalled) database(`DROP TRIGGER ${trigger};`);
    database(`UPDATE wf_process_instance SET deleted=0 WHERE tenant_id=100000 AND instance_id=${quote(flaggedActive)};
      UPDATE wf_process_instance SET tenant_id=100000,deleted=0 WHERE tenant_id=100001 AND instance_id=${quote(foreign)};
      UPDATE wf_gateway_activation SET tenant_id=100000 WHERE tenant_id=100001 AND instance_id=${quote(foreign)};
      UPDATE wf_parallel_join SET tenant_id=100000 WHERE tenant_id=100001 AND instance_id=${quote(foreign)};`);
    successful(await api(admin, `/auth/system/job/${jobId}`, { method: 'DELETE' }), '删除本轮临时清理任务并保留执行日志');
    check('归档验收后全部隔离自动调度仍暂停', database("SELECT COUNT(*) FROM sys_job WHERE status='ENABLED' AND deleted=0;") === '0');
  }
}
