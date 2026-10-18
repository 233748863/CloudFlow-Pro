import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { openSync, closeSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ownedGatewayRedis } from './owned-gateway-redis.mjs';

export async function verifyGatewayWaits(harness) {
  const { admin, api, successful, database, check } = harness;
  const jobId = database("SELECT job_id FROM sys_job WHERE tenant_id=100000 AND service_name='workflow' AND handler_name='timerScan' AND deleted=0;");
  assert.match(jobId, /^[1-9][0-9]*$/);
  const original = successful(await api(admin, `/auth/system/job/${jobId}`), '读取隔离环境定时扫描日志配置');
  assert.equal(original.status, 'PAUSED');
  const configure = async logSuccessFlag => {
    const current = successful(await api(admin, `/auth/system/job/${jobId}`), '读取当前隔离扫描配置');
    assert.equal(current.status, 'PAUSED');
    successful(await api(admin, '/auth/system/job', { method: 'PUT', body: { ...current, logSuccessFlag, confirmCritical: true } }), '通过真实接口配置成功日志');
    assert.equal(database(`SELECT log_success_flag FROM sys_job WHERE job_id=${jobId};`), String(logSuccessFlag));
  };
  try {
    await configure(1);
    check('仅隔离扫描启用成功日志且全部自动调度仍暂停', database("SELECT COUNT(*) FROM sys_job WHERE status='ENABLED' AND deleted=0;") === '0');
    await verifyPersistentWaits(harness);
  } finally {
    await configure(original.logSuccessFlag);
    check('持久等待验收后恢复原日志策略且保持调度暂停', database(`SELECT CONCAT(status,':',log_success_flag) FROM sys_job WHERE job_id=${jobId};`) === `PAUSED:${original.logSuccessFlag}`);
  }
}

async function verifyPersistentWaits(harness) {
  const { admin, employee, post, successful, database, check, state, caseTag, quote,
    model, node, edge, definition, enter, complete, finish, tasks, activations, arrivals, status } = harness;
  const scripts = path.dirname(fileURLToPath(import.meta.url));
  const root = path.dirname(scripts);
  const waitState = instanceId => JSON.parse(database(`SELECT COALESCE(JSON_EXTRACT(variables,'$._wf_waits'),JSON_OBJECT()) FROM wf_process_instance WHERE tenant_id=100000 AND instance_id=${quote(instanceId)};`));
  const pause = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
  const eventually = async (read, accepted, label) => {
    const deadline = Date.now() + 120000;
    while (Date.now() < deadline) {
      const value = read();
      if (accepted(value)) return value;
      await pause(250);
    }
    throw new Error(label);
  };
  const redis = await ownedGatewayRedis(state);
  const timerKeys = instanceId => redis('KEYS', `100000:sys:wf:timer:${instanceId}:*`).split(/\r?\n/).filter(Boolean);
  const clearTimerIndex = instanceId => {
    const keys = timerKeys(instanceId);
    for (const key of keys) {
      assert.ok(key.startsWith(`100000:sys:wf:timer:${instanceId}:`));
      redis('DEL', key);
    }
    for (const member of redis('ZRANGE', '100000:sys:wf:timers', '0', '-1').split(/\r?\n/).filter(Boolean)) {
      let key = member;
      try { key = JSON.parse(member); } catch {}
      if (typeof key === 'string' && key.startsWith(`sys:wf:timer:${instanceId}:`)) redis('ZREM', '100000:sys:wf:timers', member);
    }
    return keys.length;
  };
  const control = async action => {
    const output = openSync(path.join(state.run, `gateway-waits-${caseTag}-${action}-${Date.now()}.log`), 'wx');
    try {
      const result = spawnSync('pwsh.exe', ['-NoProfile', '-File', path.join(scripts, 'control-batch-g-service.ps1'), '-StatePath', path.join(state.run, 'state.json'), '-ServiceName', 'workflow', '-Action', action],
        { windowsHide: true, timeout: 300000, stdio: ['ignore', output, output] });
      assert.equal(result.status, 0, `Owned workflow ${action} failed`);
    } finally {
      closeSync(output);
    }
  };
  let jobRound = 0;
  const scan = async () => {
    const jobId = database("SELECT job_id FROM sys_job WHERE tenant_id=100000 AND service_name='workflow' AND handler_name='timerScan' AND deleted=0;");
    assert.match(jobId, /^[1-9][0-9]*$/);
    const result = successful(await post(admin, `/auth/system/job/${jobId}/trigger`, { handlerParam: JSON.stringify({ caseTag, round: ++jobRound }) }), '通过真实任务平台触发持久等待扫描');
    assert.equal(result.accepted, true, result.reason);
    assert.match(result.executeNo, /^[a-f0-9-]+$/i);
    const outcome = await eventually(() => database(`SELECT execute_status FROM sys_job_log WHERE execute_no=${quote(result.executeNo)};`),
      value => !['', 'PENDING', 'RUNNING'].includes(value), 'Real wait recovery job did not finish');
    assert.equal(outcome, 'SUCCESS', 'Real wait recovery job succeeds');
    check(`第${jobRound}次扫描成功结果已由真实回报持久落库`, database(`SELECT COUNT(*) FROM sys_job_log WHERE execute_no=${quote(result.executeNo)} AND execute_status='SUCCESS' AND end_time IS NOT NULL AND report_time IS NOT NULL;`) === '1');
  };
  const timerModel = (notify = true) => {
    const graph = model();
    for (const identifier of ['first', 'second']) Object.assign(graph.nodes.find(current => current.id === identifier), {
      type: 'TIMER', props: { timerType: 'FIXED_TIME', fixedTime: new Date(Date.now() - 86400000).toISOString().slice(0, 19), timerAction: notify && identifier === 'second' ? 'NOTIFY_ONLY' : 'AUTO_PASS' },
    });
    return graph;
  };
  const timerDefinition = await definition('timer-recovery', timerModel());
  const timed = await enter(timerDefinition, 'timer-recovery');
  const waitsBefore = waitState(timed);
  check('两条定时分支均已持久保存且互不覆盖', Object.keys(waitsBefore).length === 2 && tasks(timed).length === 0
    && Object.values(waitsBefore).every(wait => wait.kind === 'TIMER' && JSON.parse(wait.executionContext).activationId === activations(timed)[0].id));
  check('定时索引包含独立轮次及代次', timerKeys(timed).length === 2
    && Object.values(waitsBefore).every(wait => timerKeys(timed).some(key => key.endsWith(`:${activations(timed)[0].id}:${wait.waitId}`))));
  const forbidden = await post(employee, `/workflow/wf/instance/${timed}/timer/second/finish`, { reason: 'employee-forbidden' });
  check('员工不能提前结束定时等待且数据库等待不变', forbidden.status === 403 && JSON.stringify(waitState(timed)) === JSON.stringify(waitsBefore));
  let stopped = false;
  try {
    await control('Stop'); stopped = true;
    check('仅清理本次流程的两项Redis等待索引', clearTimerIndex(timed) === 2 && timerKeys(timed).length === 0);
    await control('Start'); stopped = false;
    check('真实进程重启后两项数据库等待原样保留', JSON.stringify(waitState(timed)) === JSON.stringify(waitsBefore));
    await scan();
    const notified = Object.values(waitState(timed));
    check('清空Redis后自动分支恢复到达，通知分支仍保留等待', arrivals(timed).length === 1 && activations(timed)[0].status === 'WAITING'
      && notified.length === 1 && notified[0].nodeKey === 'second' && notified[0].payload.notified === true && tasks(timed).length === 0);
    const historyBefore = database(`SELECT COUNT(*) FROM wf_task_history WHERE instance_id=${quote(timed)};`);
    await scan();
    check('重复扫描不重复到达或自动完成通知分支', arrivals(timed).length === 1 && database(`SELECT COUNT(*) FROM wf_task_history WHERE instance_id=${quote(timed)};`) === historyBefore);
    successful(await post(admin, `/workflow/wf/instance/${timed}/timer/second/finish`, { reason: `H1GW_${caseTag}_finish-notified` }), '管理员从数据库等待完成通知分支');
    check('管理员结束通知等待后只汇聚一次并清除持久等待', activations(timed)[0].status === 'RELEASED' && arrivals(timed).length === 2 && Object.keys(waitState(timed)).length === 0);
    await finish(timed, 'timer-recovery');
  } finally {
    if (stopped) await control('Start');
  }

  const loopGraph = timerModel(false);
  loopGraph.nodes.push({ id: 'route', type: 'ROUTE', title: '定时分支再次进入' });
  loopGraph.edges.find(current => current.id === 'join-end').target = 'route';
  loopGraph.edges.push(edge('route', 'split', { condition: "#round == 'one'" }), edge('route', 'end', { isDefault: true }));
  const loopDefinition = await definition('timer-loop', loopGraph);
  const loop = await enter(loopDefinition, 'timer-loop');
  const firstWaitIds = Object.keys(waitState(loop));
  await scan();
  successful(await complete(tasks(loop)[0], 'timer-loop-first-join'), '定时首轮汇聚后再次进入同一网关');
  check('循环重走定时节点生成不同的轮次和代次', Object.keys(waitState(loop)).length === 2
    && Object.keys(waitState(loop)).every(identifier => !firstWaitIds.includes(identifier)) && activations(loop).length === 2);
  await scan();
  successful(await complete(tasks(loop)[0], 'timer-loop-second-join', { round: 'two' }), '定时第二轮汇聚后退出循环');
  check('定时循环两轮各到达两支且仅放行一次', status(loop) === 'PASSED' && arrivals(loop).length === 4
    && activations(loop).every(activation => activation.status === 'RELEASED' && activation.version === 1));

  const childDefinition = await definition('child', { nodes: [{ id: 'start', type: 'START', title: '子流程开始' }, node('childApproval'), { id: 'end', type: 'END', title: '子流程结束' }],
    edges: [edge('start', 'childApproval'), edge('childApproval', 'end')] });
  const childKey = database(`SELECT process_key FROM wf_process_definition WHERE definition_id=${quote(childDefinition)};`);
  const childGraph = model();
  Object.assign(childGraph.nodes.find(current => current.id === 'first'), { type: 'SUBPROCESS', props: { subprocessId: childKey, waitForCompletion: true } });
  const parentDefinition = await definition('child-parent', childGraph);
  const parent = await enter(parentDefinition, 'child-parent');
  const parentWait = Object.values(waitState(parent))[0];
  assert.ok(parentWait && parentWait.kind === 'SUBPROCESS');
  check('子流程持久保存父分支，子任务使用自身执行上下文', JSON.parse(parentWait.executionContext).branchKey === 'split-first'
    && tasks(parentWait.waitId).length === 1 && tasks(parentWait.waitId)[0].context === null && tasks(parent).length === 1);
  successful(await complete(tasks(parent)[0], 'parent-second'), '父流程另一分支先到达');
  const triggerName = `h1_child_fault_${caseTag}`;
  assert.match(triggerName, /^h1_child_fault_[a-f0-9]{12}$/);
  assert.equal(database(`SELECT COUNT(*) FROM information_schema.triggers WHERE trigger_schema='cloud_flow_db' AND trigger_name=${quote(triggerName)};`), '0');
  let injected = false;
  try {
    database(`DELIMITER $$\nCREATE TRIGGER ${triggerName} BEFORE INSERT ON wf_task FOR EACH ROW BEGIN IF NEW.instance_id=${quote(parent)} AND NEW.node_key='join' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='H1_OWNED_CHILD_FAULT'; END IF; END$$\nDELIMITER ;\n`);
    injected = true;
    successful(await complete(tasks(parentWait.waitId)[0], 'child-finish'), '子流程真实审批完成');
    await eventually(() => status(parentWait.waitId), value => value === 'PASSED', 'Child workflow did not finish');
    await control('Stop'); stopped = true;
    check('子流程已提交但父回调故障时等待记录仍可恢复', status(parentWait.waitId) === 'PASSED' && Object.keys(waitState(parent)).length === 1
      && activations(parent)[0].status === 'WAITING' && arrivals(parent).length === 1);
    database(`DROP TRIGGER ${triggerName};`); injected = false;
    await control('Start'); stopped = false;
    await scan();
    check('重启扫描恢复已完成子流程并正确返回父分支', Object.keys(waitState(parent)).length === 0 && activations(parent)[0].status === 'RELEASED' && arrivals(parent).length === 2);
    await scan();
    check('子流程重复恢复不新增到达或后继任务', arrivals(parent).length === 2 && tasks(parent).length === 1 && activations(parent)[0].version === 1);
    await finish(parent, 'child-parent');
  } finally {
    if (injected) database(`DROP TRIGGER ${triggerName};`);
    if (stopped) await control('Start');
  }

  const triggerGraph = model();
  for (const identifier of ['first', 'second']) Object.assign(triggerGraph.nodes.find(current => current.id === identifier), {
    type: 'SCRIPT', props: { triggerType: 'MESSAGE', callAsync: true, retryCount: 1, failStrategy: 'BLOCK', timeoutSeconds: 10,
      actionBody: { recipientIds: ['990000707'], title: `H1GW_${caseTag}_${identifier}`, content: '真实分支触发消息' } },
  });
  const triggerDefinition = await definition('trigger-context', triggerGraph);
  const triggered = await enter(triggerDefinition, 'trigger-context');
  await eventually(() => activations(triggered)[0]?.status, value => value === 'RELEASED', 'Real asynchronous trigger branches did not join');
  const messages = database(`SELECT JSON_OBJECT('status',status,'context',JSON_EXTRACT(content,'$.executionContext')) FROM wf_transaction_message WHERE tenant_id=100000 AND business_id=${quote(triggered)} AND business_type='WORKFLOW_TRIGGER';`)
    .split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
  check('真实异步触发消息持久携带各自分支且只汇聚一次', messages.length === 2 && messages.every(message => message.status === 'SUCCESS')
    && new Set(messages.map(message => JSON.parse(message.context).branchKey)).size === 2 && arrivals(triggered).length === 2 && activations(triggered)[0].version === 1);
  await finish(triggered, 'trigger-context');
}
