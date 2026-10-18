import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';

// Real HTTP approvals wait on an independently owned MySQL transaction. No workflow outcome is written by this fixture.
export async function verifyWorkflowBusinessLocks({ admin, employee, api, successful, database, check, caseTag, state, redis, trigger, job, evidence }) {
  const marker = 'A3BL' + caseTag, base = '/workflow/wf', tenant = '100000';
  const sql = value => 'CONVERT(0x' + Buffer.from(String(value)).toString('hex') + ' USING utf8mb4) COLLATE utf8mb4_unicode_ci';
  const rows = query => database(query).split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const waitFor = async (read, accept, label, timeout = 15000) => {
    const end = Date.now() + timeout;
    do { const value = await read(); if (accept(value)) return value; await sleep(100); } while (Date.now() < end);
    throw new Error(label);
  };
  const post = (page, url, body) => api(page, url, { method: 'POST', body });
  const employeeId = database("SELECT user_id FROM sys_user WHERE tenant_id=100000 AND user_name='g_holiday_employee' AND status='0' AND deleted=0;");
  const adminId = database("SELECT user_id FROM sys_user WHERE tenant_id=100000 AND user_name='g_import_admin' AND status='0' AND deleted=0;");
  assert.match(employeeId, /^[1-9][0-9]*$/); assert.match(adminId, /^[1-9][0-9]*$/);
  assert.equal(await fs.realpath(database('SELECT @@datadir;')), await fs.realpath(path.join(state.run, 'mysql-data')));
  const definitions = [], instances = [], observed = new Set();
  const tasks = instance => rows("SELECT JSON_OBJECT('id',task_id,'assignee',CAST(assignee AS CHAR),'status',status) FROM wf_task WHERE tenant_id=100000 AND instance_id=" + sql(instance) + ' ORDER BY task_id;');
  const status = instance => database('SELECT status FROM wf_process_instance WHERE tenant_id=100000 AND instance_id=' + sql(instance) + ';');
  const history = task => database('SELECT COUNT(*) FROM wf_task_history WHERE tenant_id=100000 AND task_id=' + sql(task) + ';');
  const completion = (task, suffix, action = 'APPROVE') => post(task.assignee === employeeId ? employee : admin, base + '/complete', { taskId: task.id, action, comment: marker + '-' + suffix });
  const graph = node => ({ nodes: [{ id: 'start', type: 'START', title: '发起' }, node, { id: 'end', type: 'END', title: '结束' }], edges: [{ id: 'start-review', source: 'start', target: 'review' }, { id: 'review-end', source: 'review', target: 'end' }] });
  const approval = extra => ({ id: 'review', type: 'APPROVAL', title: '审批', approverType: 'USER', approverValue: employeeId, allowAgent: false, rejectStrategy: 'TERMINATE', ...extra });
  let formId, failure, approvals = 0;
  const definition = async (name, model) => {
    const saved = successful(await post(admin, base + '/definition/save', { processKey: marker + '-' + name, processName: marker + '-' + name, formId, modelJson: JSON.stringify(model), startPermissionType: 'ALL', startPermissionValue: '[]' }), '保存占用保护验证流程');
    const id = saved.definitionId ?? saved.id; assert.ok(id); definitions.push(id);
    successful(await post(admin, base + '/definition/deploy/' + id, {}), '发布占用保护验证流程'); return id;
  };
  const start = async (id, name) => {
    const context = successful(await api(admin, base + '/draft/context/' + id), '读取验证流程上下文');
    const draft = successful(await post(admin, base + '/draft', { definitionId: id, expectedVersion: 0, loadedContextHash: context.contextHash, title: marker + '-' + name, formData: { note: marker }, nodeAssignees: {} }), '保存验证流程草稿');
    const started = successful(await post(admin, base + '/start', { draftId: draft.draftId, expectedVersion: draft.lockVersion }), '启动真实占用保护验证流程');
    const instance = started.instanceId ?? started.processInstanceId; assert.ok(instance); instances.push(instance); return instance;
  };
  const hold = async task => {
    assert.ok(instances.includes(task.instance), 'Only a workflow created by this run may be held');
    assert.equal(database('SELECT COUNT(*) FROM wf_task t JOIN wf_process_instance p ON p.instance_id=t.instance_id AND p.tenant_id=t.tenant_id JOIN wf_process_definition d ON d.definition_id=p.definition_id AND d.tenant_id=p.tenant_id WHERE t.tenant_id=100000 AND t.task_id=' + sql(task.id) + ' AND p.instance_id=' + sql(task.instance) + ' AND d.process_key LIKE ' + sql(marker + '%') + ';'), '1');
    const env = { ...process.env }; delete env.MYSQL_PWD;
    const child = spawn('mysql.exe', ['--no-defaults', '--protocol=TCP', '--host=127.0.0.1', '--port=' + state.mysqlPort, '--user=root', '--batch', '--raw', '--unbuffered', '--skip-column-names', '--default-character-set=utf8mb4', 'cloud_flow_db'], { windowsHide: true, env, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '', errorBytes = 0, finished = false;
    child.stdout.on('data', data => { stdout += data.toString(); });
    child.stderr.on('data', data => { errorBytes += data.length; });
    const exited = new Promise((resolve, reject) => { child.once('error', reject); child.once('close', code => { finished = true; resolve(code); }); });
    // Closing this exact child rolls back its connection; no other process or shared database lock is killed.
    const deadline = setTimeout(() => child.kill(), 90000);
    const release = async () => {
      if (!finished) child.stdin.end('ROLLBACK;\n');
      const code = await exited; clearTimeout(deadline); assert.equal(code, 0, 'Owned row-lock transaction did not exit normally'); assert.equal(errorBytes, 0, 'Owned row-lock transaction reported an error');
    };
    child.stdin.write('SET SESSION innodb_lock_wait_timeout=10; START TRANSACTION; SELECT task_id FROM wf_task WHERE tenant_id=100000 AND task_id=' + sql(task.id) + ' FOR UPDATE; SELECT ' + sql(marker + '-held') + ';\n');
    try { await waitFor(() => stdout, value => value.includes(marker + '-held'), 'Owned task row was not locked'); }
    catch (error) { try { await release(); } catch (cleanup) { error = new AggregateError([error, cleanup]); } throw error; }
    return release;
  };
  const inspect = key => {
    const value = redis('GET', tenant + ':sys:lock:holder:' + key);
    return value ? JSON.parse(value) : null;
  };
  const guarded = async (task, name, { revoke = false, action = 'APPROVE', extraKey, renew = false } = {}) => {
    const release = await hold(task), taskKey = 'lock:task:' + task.id;
    const before = history(task.id); let pending, outcome, released = false;
    try {
      pending = completion(task, name, action).then(value => ({ value }), error => ({ error })); approvals++;
      const info = await waitFor(() => inspect(taskKey), value => value?.generation && value?.owner, 'Real approval did not register its task lock');
      observed.add(taskKey);
      check(name + '实际审批登记持有人和代次', redis('HEXISTS', tenant + ':' + taskKey, info.owner) === '1');
      if (extraKey) {
        const other = await waitFor(() => inspect(extraKey), value => value?.generation, 'Real approval did not register its additional lock'); observed.add(extraKey);
        check(name + '关联占用属于同一请求', other.threadId === info.threadId && other.owner === info.owner);
      }
      if (renew) {
        const lease = Array.isArray(info.leaseTime) ? info.leaseTime[1] : info.leaseTime;
        assert.ok(Number.isInteger(lease) && lease >= 3 && lease <= 40, 'Bounded real approval lease required');
        await sleep(lease * 1000 + 1500);
        check(name + '超过原租期仍保留同一代次', inspect(taskKey)?.generation === info.generation && redis('HEXISTS', tenant + ':' + taskKey, info.owner) === '1');
      }
      if (revoke) {
        const current = inspect(taskKey); assert.equal(current.generation, info.generation);
        const age = Date.now() - 3600000;
        current.acquireTime = Array.isArray(current.acquireTime) ? [current.acquireTime[0], age] : age;
        const changed = redis('EVAL', "local v=redis.call('GET',KEYS[1]); if not v or cjson.decode(v).generation~=ARGV[1] then return 0 end redis.call('SET',KEYS[1],ARGV[2],'KEEPTTL'); return 1", 1, tenant + ':sys:lock:holder:' + taskKey, info.generation, JSON.stringify(current));
        assert.equal(changed, '1');
        const scanned = await trigger(job);
        check(name + '实际巡检解除一把业务占用', scanned.status === 'SUCCESS' && scanned.affected === 1 && redis('EXISTS', tenant + ':' + taskKey) === '0');
      }
      released = true; await release();
      outcome = await pending; if (outcome.error) throw outcome.error;
      if (revoke) {
        check(name + '失效请求拒绝提交', outcome.value.body?.code !== 200 && String(outcome.value.body?.msg ?? outcome.value.body?.message).includes('审批占用已失效'));
        check(name + '真实待办和审批历史共同回滚', tasks(task.instance).some(item => item.id === task.id && item.status === 'TODO') && history(task.id) === before);
        await sleep(5500);
        successful(await completion(task, name + '-retry', action), '占用解除后重新审批成功'); approvals++;
      } else successful(outcome.value, '受保护审批提交成功');
      check(name + '最终只记一次审批', Number(history(task.id)) === Number(before) + 1);
      await waitFor(() => [...observed].every(key => redis('EXISTS', tenant + ':' + key) === '0' && inspect(key) == null), Boolean, 'Business lock or monitor remained after request');
    } finally {
      try { if (!released) await release(); }
      finally { if (pending && !outcome) await pending; }
    }
  };
  try {
    const form = successful(await post(admin, base + '/form/save', { formKey: marker, formName: marker, fieldsJson: JSON.stringify([{ id: 'note', type: 'TEXT', label: '说明' }]) }), '建立占用保护验证表单'); formId = form.formId ?? form.id; assert.ok(formId);
    const normal = await start(await definition('normal', graph(approval())), 'normal');
    const normalTask = tasks(normal)[0]; assert.ok(normalTask); normalTask.instance = normal;
    await guarded(normalTask, '普通审批', { revoke: true }); check('普通审批重试后流程通过', status(normal) === 'PASSED'); evidence.businessRollback = true;

    const countersign = await start(await definition('countersign', graph(approval({ signType: 'ALL', approverValue: employeeId + ',' + adminId }))), 'countersign');
    const votes = tasks(countersign); assert.equal(votes.length, 2);
    const signId = database('SELECT countersign_id FROM wf_countersign_task WHERE tenant_id=100000 AND instance_id=' + sql(countersign) + ';'); assert.ok(signId);
    const firstVote = votes.find(task => task.assignee === employeeId); firstVote.instance = countersign;
    await guarded(firstVote, '会签审批', { extraKey: 'lock:countersign:' + signId, renew: true });
    successful(await completion(votes.find(task => task.assignee === adminId), 'second-vote'), '另一名会签人投票'); approvals++;
    check('会签重入结束后计票准确且流程通过', status(countersign) === 'PASSED' && database('SELECT voted_count FROM wf_countersign_task WHERE tenant_id=100000 AND countersign_id=' + sql(signId) + ';') === '2'); evidence.businessCountersign = true;

    const childDefinition = await definition('child', graph(approval()));
    const childKey = database('SELECT process_key FROM wf_process_definition WHERE definition_id=' + sql(childDefinition) + ' AND tenant_id=100000;');
    const parent = await start(await definition('parent', graph({ id: 'review', type: 'SUBPROCESS', title: '子流程', props: { subprocessId: childKey, waitForCompletion: true } })), 'parent');
    const child = database('SELECT instance_id FROM wf_process_instance WHERE tenant_id=100000 AND parent_instance_id=' + sql(parent) + ';'); assert.ok(child); instances.push(child);
    const childTask = tasks(child)[0]; assert.ok(childTask); childTask.instance = child;
    await guarded(childTask, '子流程驳回', { revoke: true, action: 'REJECT', extraKey: 'lock:instance:' + parent });
    await waitFor(() => status(parent), value => value === 'PAUSED', 'Rejected child did not pause its parent');
    check('子流程驳回重试后父流程按规则挂起', status(child) === 'REJECTED' && status(parent) === 'PAUSED'); evidence.businessParent = true;
    check('实际请求结束后所有观察到的占用和记录清理', [...observed].every(key => redis('EXISTS', tenant + ':' + key) === '0' && inspect(key) == null));
    console.log('A3_WORKFLOW_BUSINESS_LOCK_ACTUAL: ' + JSON.stringify({ approvals, instances, monitoredLocks: observed.size, realApprovalRevocations: 2, realCountersignRenewal: true, realParentProtection: true, monitorAgeControlled: true, forcedWorkflowOutcomeWrites: 0 }));
  } catch (error) { failure = error; }
  finally {
    try {
      for (const instance of instances) if (['RUNNING', 'PAUSED', 'FAILED', 'PENDING', 'WITHDRAWN', 'TASK_BACK', 'RESTARTED'].includes(status(instance))) successful(await post(admin, base + '/instance/terminate', { instanceId: instance, reason: marker + '-cleanup' }), '结束自有占用保护验证流程');
      for (const id of definitions) database('UPDATE wf_process_definition SET deleted=1 WHERE tenant_id=100000 AND definition_id=' + sql(id) + ' AND process_key LIKE ' + sql(marker + '%') + ';');
      check('占用保护样本收尾后没有遗留业务占用', [...observed].every(key => redis('EXISTS', tenant + ':' + key) === '0' && inspect(key) == null)); evidence.businessRestoration = true;
    } catch (error) { failure = new AggregateError([failure, error].filter(Boolean), 'Business lock verification or restoration failed'); }
  }
  if (failure) throw failure;
}
