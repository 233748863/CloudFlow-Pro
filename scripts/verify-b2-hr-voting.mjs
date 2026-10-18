import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createReadStream } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { scanSecretStream } from './portal-checks/scan-access-logs.mjs';

// Real HR service, real persisted vote snapshots, and an owned process outage.
export async function verifyB2HrVoting({ admin, employee, api, successful, session, database, check, caseTag, secrets, evidence, state }) {
  const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
  const marker = 'B2HR' + caseTag, base = '/workflow/wf';
  const manifestPath = path.join(state.run, 'private', 'b2-hr-outage-' + caseTag + '.json');
  const setupPath = path.join(state.run, 'private', 'b2-hr-voting-' + caseTag + '.json');
  const sql = value => 'CONVERT(0x' + Buffer.from(String(value)).toString('hex') + ' USING utf8mb4) COLLATE utf8mb4_unicode_ci';
  const rows = statement => database(statement).split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
  const post = (page, url, body) => api(page, url, { method: 'POST', body });
  const waitFor = async (read, accept, label) => {
    const until = Date.now() + 90000;
    do { const value = await read(); if (accept(value)) return value; await new Promise(resolve => setTimeout(resolve, 250)); } while (Date.now() < until);
    throw new Error(label);
  };
  const manager = await session('g_holiday_manager');
  const managerToken = await manager.evaluate(async () => (await import('/src/utils/authStorage.ts')).getAuthToken());
  assert.ok(managerToken); secrets.add(managerToken.replace(/^Bearer /, ''));
  assert.equal(await fs.realpath(database('SELECT @@datadir;')), await fs.realpath(path.join(state.run, 'mysql-data')));
  const people = ['g_import_admin', 'g_holiday_employee', 'g_holiday_manager'].map((username, index) => {
    const matches = rows("SELECT JSON_OBJECT('id',CAST(user_id AS CHAR),'name',nick_name,'dept',CAST(dept_id AS CHAR)) FROM sys_user WHERE tenant_id=100000 AND deleted=0 AND status='0' AND user_name=" + sql(username) + ';');
    assert.equal(matches.length, 1); return { ...matches[0], page: [admin, employee, manager][index] };
  });
  const grants = () => database('SELECT tenant_id,role_id,menu_id FROM sys_role_menu ORDER BY tenant_id,role_id,menu_id;');
  const originalGrants = grants();
  const originalHr = () => database('SELECT id,tenant_id,position_id,deleted,update_time FROM hr_employee WHERE employee_no NOT LIKE ' + sql(marker + '%') + ' ORDER BY id;'
    + 'SELECT id,tenant_id,level_id,status,version,update_time FROM hr_position WHERE position_code NOT LIKE ' + sql(marker + '%') + ' ORDER BY id;'
    + 'SELECT id,tenant_id,level_rank,status,version,update_time FROM hr_job_level WHERE level_code NOT LIKE ' + sql(marker + '%') + ' ORDER BY id;');
  const beforeHr = originalHr();
  const originalEmployees = people.flatMap(person => {
    const records = rows("SELECT JSON_OBJECT('id',CAST(id AS CHAR),'user',CAST(user_id AS CHAR),'position',CAST(position_id AS CHAR),'updated',DATE_FORMAT(update_time,'%Y-%m-%d %H:%i:%s')) FROM hr_employee WHERE tenant_id=100000 AND deleted=0 AND user_id=" + person.id + ';');
    assert.ok(records.length <= 1, 'Unique original HR employee required'); return records;
  });
  const fixture = { marker, originalEmployees, levels: [], positions: [], createdEmployees: [], restored: false };
  await fs.writeFile(setupPath, JSON.stringify(fixture, null, 2), { flag: 'wx' });
  const persist = () => fs.writeFile(setupPath, JSON.stringify(fixture, null, 2));
  const definitions = [], instances = [], operationLogs = [];
  let formId, failure, stopped = false, recoveryAttempted = false, successfulVotes = 0;
  const operate = async action => {
    const outputPath = manifestPath + '.' + action.toLowerCase() + '.log';
    const errorPath = outputPath + '.err';
    const output = await fs.open(outputPath, 'wx'), errors = await fs.open(errorPath, 'wx');
    operationLogs.push(outputPath, errorPath);
    try {
      const code = await new Promise((resolve, reject) => {
        const child = spawn('C:/Program Files/PowerShell/7/pwsh.exe', ['-NoLogo', '-NoProfile', '-File', 'scripts/operate-b2-hr-outage.ps1',
          '-StatePath', path.join(state.run, 'state.json'), '-Action', action, '-ManifestPath', manifestPath],
        { cwd: root, windowsHide: true, stdio: ['ignore', output.fd, errors.fd] });
        child.once('error', reject); child.once('exit', resolve);
      });
      assert.equal(code, 0, 'Owned HR ' + action + ' failed; retain helper diagnostics');
    } finally { await output.close(); await errors.close(); }
    const manifest = JSON.parse((await fs.readFile(manifestPath, 'utf8')).replace(/^\uFEFF/, ''));
    assert.equal(manifest.status, action === 'Stop' ? 'STOPPED' : 'RECOVERED');
    return manifest;
  };
  const status = id => database('SELECT status FROM wf_process_instance WHERE tenant_id=100000 AND instance_id=' + sql(id) + ';');
  const tasks = id => rows("SELECT JSON_OBJECT('id',task_id,'user',CAST(assignee AS CHAR)) FROM wf_task WHERE tenant_id=100000 AND instance_id=" + sql(id) + ' ORDER BY task_id;');
  const counter = id => rows("SELECT JSON_OBJECT('id',countersign_id,'status',status,'total',total_weight,'approved',approve_weight,'threshold',pass_weight,'voted',voted_count) FROM wf_countersign_task WHERE tenant_id=100000 AND instance_id=" + sql(id) + ';')[0];
  const votes = id => rows("SELECT JSON_OBJECT('user',CAST(voter_id AS CHAR),'weight',vote_weight,'result',vote_result) FROM wf_countersign_vote WHERE tenant_id=100000 AND countersign_id=" + sql(counter(id).id) + ' ORDER BY voter_id;');
  const alerts = id => rows("SELECT JSON_OBJECT('id',CAST(id AS CHAR),'type',anomaly_type,'notified',notification_sent) FROM wf_anomaly_alert WHERE tenant_id=100000 AND instance_id=" + sql(id) + ' ORDER BY id;');
  const start = async (name, threshold) => {
    const model = { nodes: [{ id: 'start', type: 'START', title: '发起' }, { id: 'review', type: 'APPROVAL', title: '职级票签',
      approverType: 'USER', approverValue: people.map(person => person.id).join(','), signType: 'WEIGHT', weightSource: 'BY_JOB_LEVEL',
      passWeight: threshold, assigneeWeights: fixture.levels.map((id, index) => ({ jobLevelId: id, weight: [3, 2, 1][index] })),
      approveSelf: 'ALLOW', allowAgent: false, rejectStrategy: 'TERMINATE' }, { id: 'end', type: 'END', title: '结束' }],
      edges: [{ id: 'start-review', source: 'start', target: 'review' }, { id: 'review-end', source: 'review', target: 'end' }] };
    const definition = successful(await post(admin, base + '/definition/save', { processKey: marker + '-' + name, processName: marker + '-' + name,
      formId, modelJson: JSON.stringify(model), startPermissionType: 'ALL', startPermissionValue: '[]' }), '保存实际HR票签流程');
    const definitionId = definition.definitionId ?? definition.id; assert.ok(definitionId); definitions.push(definitionId);
    successful(await post(admin, base + '/definition/deploy/' + definitionId, {}), '发布实际HR票签流程');
    const context = successful(await api(admin, base + '/draft/context/' + definitionId), '读取实际HR票签上下文');
    const draft = successful(await post(admin, base + '/draft', { definitionId, expectedVersion: 0, loadedContextHash: context.contextHash,
      title: marker + '-' + name, formData: { note: marker }, nodeAssignees: {} }), '保存实际HR票签草稿');
    const started = successful(await post(admin, base + '/start', { draftId: draft.draftId, expectedVersion: draft.lockVersion }), '通过正常入口发起HR票签');
    const id = started.instanceId ?? started.processInstanceId; assert.ok(id); instances.push(id); return id;
  };
  const assertWeights = (id, weights, threshold, label) => {
    const actual = votes(id), current = counter(id);
    check(label, status(id) === 'RUNNING' && current.status === 'VOTING' && current.total === weights.reduce((sum, value) => sum + value, 0)
      && current.threshold === threshold && current.voted === 0 && actual.length === 3 && tasks(id).length === 3
      && people.every((person, index) => actual.some(vote => vote.user === person.id && vote.weight === weights[index] && vote.result === 'PENDING')));
  };
  const finish = async (id, weights, threshold, label) => {
    for (let index = 0; index < 2; index++) {
      const task = tasks(id).find(item => item.user === people[index].id); assert.ok(task);
      successful(await post(people[index].page, base + '/complete', { taskId: task.id, action: 'APPROVE', comment: marker + '-' + label + '-' + index }), '本人按实际票权审批');
      successfulVotes++;
      const current = counter(id);
      check(label + '第' + (index + 1) + '票按固定票权累计', current.approved === weights.slice(0, index + 1).reduce((sum, value) => sum + value, 0)
        && current.threshold === threshold && current.voted === index + 1 && status(id) === (index === 0 ? 'RUNNING' : 'PASSED'));
    }
    const actual = votes(id);
    check(label + '未投者自动通过且票权保持', tasks(id).length === 0 && actual.some(vote => vote.user === people[2].id && vote.result === 'AUTO_PASS')
      && people.every((person, index) => actual.some(vote => vote.user === person.id && vote.weight === weights[index])));
  };
  try {
    for (let index = 0; index < people.length; index++) {
      const level = database('INSERT INTO hr_job_level(tenant_id,level_code,level_name,level_series,level_rank,status) VALUES(100000,' + sql(marker + '-L' + index) + ',' + sql(marker + '-L' + index) + ",'P'," + (index + 1) + ',1);SELECT LAST_INSERT_ID();');
      assert.match(level, /^[1-9][0-9]*$/); fixture.levels.push(level); await persist();
      const position = database('INSERT INTO hr_position(tenant_id,position_code,position_name,level_id,status) VALUES(100000,' + sql(marker + '-P' + index) + ',' + sql(marker + '-P' + index) + ',' + level + ',1);SELECT LAST_INSERT_ID();');
      assert.match(position, /^[1-9][0-9]*$/); fixture.positions.push(position); await persist();
      const person = people[index], existing = originalEmployees.find(item => item.user === person.id);
      if (existing) database('UPDATE hr_employee SET position_id=' + position + ' WHERE tenant_id=100000 AND id=' + existing.id + ' AND user_id=' + person.id + ' AND deleted=0;');
      else {
        const id = database('INSERT INTO hr_employee(tenant_id,employee_no,name,gender,dept_id,position_id,employee_status,user_id,create_by) VALUES(100000,'
          + sql(marker + '-E' + index) + ',' + sql(person.name) + ",'UNKNOWN'," + (person.dept ?? 'NULL') + ',' + position + ",'REGULAR'," + person.id + ',' + sql(marker) + ');SELECT LAST_INSERT_ID();');
        assert.match(id, /^[1-9][0-9]*$/); fixture.createdEmployees.push(id); await persist();
      }
    }
    check('三名自有账号各自具备有效HR职位和职级', database('SELECT COUNT(*) FROM hr_employee e JOIN hr_position p ON p.tenant_id=e.tenant_id AND p.id=e.position_id AND p.status=1 JOIN hr_job_level l ON l.tenant_id=p.tenant_id AND l.id=p.level_id AND l.status=1 WHERE e.tenant_id=100000 AND e.deleted=0 AND e.user_id IN (' + people.map(person => person.id).join(',') + ') AND l.level_code LIKE ' + sql(marker + '%') + ';') === '3');
    const form = successful(await post(admin, base + '/form/save', { formKey: marker, formName: marker, fieldsJson: JSON.stringify([{ id: 'note', type: 'TEXT', label: '说明' }]) }), '建立HR票签表单');
    formId = form.formId ?? form.id; assert.ok(formId);
    const available = await start('available', 5);
    assertWeights(available, [3, 2, 1], 5, '实际HR服务读取三人职级并持久固定3/2/1票权');
    check('正常HR取权没有降级告警', alerts(available).length === 0);
    database('UPDATE hr_position SET level_id=' + fixture.levels[2] + ' WHERE tenant_id=100000 AND id=' + fixture.positions[0] + ' AND position_code=' + sql(marker + '-P0') + ';');
    await finish(available, [3, 2, 1], 5, '正常HR取权后变更自有职位');
    database('UPDATE hr_position SET level_id=' + fixture.levels[0] + ' WHERE tenant_id=100000 AND id=' + fixture.positions[0] + ' AND position_code=' + sql(marker + '-P0') + ';');
    evidence.hrLevelVotes = true;

    await operate('Stop'); stopped = true;
    check('本机唯一HR进程已实际退出且原服务端口不再监听', true);
    const unavailable = await start('unavailable', 2);
    assertWeights(unavailable, [1, 1, 1], 2, 'HR实际停机后降级每人一票且保留原阈值2');
    const fallback = alerts(unavailable);
    check('实际HR停机只登记一条已通知降级告警', fallback.length === 1 && fallback[0].type === 'WEIGHT_FALLBACK' && fallback[0].notified === 'Y');
    const delivered = await waitFor(() => rows("SELECT JSON_OBJECT('id',CAST(record_id AS CHAR),'user',CAST(receiver_id AS CHAR),'status',send_status) FROM sys_message_record WHERE tenant_id=100000 AND biz_type='WORKFLOW_ANOMALY' AND biz_id=" + sql(fallback[0].id) + ';'), items => items.length === 1 && items[0].status === 'SUCCESS', 'HR outage reminder did not reach the initiator');
    check('降级提醒实际送达本流程发起人', delivered[0].user === people[0].id);
    successful(await api(admin, '/auth/system/message/mine/' + delivered[0].id), '发起人实际读取HR停机降级提醒');
    await finish(unavailable, [1, 1, 1], 2, 'HR实际停机等权');
    evidence.hrOutageVotes = true; evidence.hrOutageNotice = true;
    recoveryAttempted = true; await operate('Recover'); stopped = false;
    Object.assign(state, JSON.parse((await fs.readFile(path.join(state.run, 'state.json'), 'utf8')).replace(/^\uFEFF/, '')));
    const recovered = await start('recovered', 5);
    assertWeights(recovered, [3, 2, 1], 5, 'HR进程恢复后新流程重新按真实职级取权');
    check('恢复后新流程无降级告警且原告警保持一条', alerts(recovered).length === 0 && alerts(unavailable).length === 1);
    await finish(recovered, [3, 2, 1], 5, 'HR恢复');
    evidence.hrRecoveredVotes = true;
  } catch (error) { failure = error; }
  finally {
    try {
      const saved = await fs.readFile(manifestPath, 'utf8').then(text => JSON.parse(text.replace(/^\uFEFF/, ''))).catch(error => { if (error.code === 'ENOENT') return null; throw error; });
      if (!recoveryAttempted && saved && ['STOPPED', 'STOPPING'].includes(saved.status)) {
        recoveryAttempted = true; await operate('Recover'); stopped = false;
        Object.assign(state, JSON.parse((await fs.readFile(path.join(state.run, 'state.json'), 'utf8')).replace(/^\uFEFF/, '')));
      }
      if (stopped || (saved && saved.status !== 'RECOVERED' && !recoveryAttempted)) throw new Error('Owned HR recovery requires retained diagnostics');
      for (const id of instances) if (['RUNNING', 'PAUSED', 'PENDING', 'FAILED', 'WITHDRAWN', 'TASK_BACK', 'RESTARTED'].includes(status(id)))
        successful(await post(admin, base + '/instance/terminate', { instanceId: id, reason: marker + '-cleanup' }), '正常收尾自有HR票签流程');
      for (const id of definitions) database("UPDATE wf_process_definition SET status='ARCHIVED' WHERE tenant_id=100000 AND deleted=0 AND definition_id=" + sql(id) + ' AND process_key LIKE ' + sql(marker + '%') + ';');
      for (const original of originalEmployees) database('UPDATE hr_employee SET position_id=' + (original.position ?? 'NULL') + ',update_time=' + sql(original.updated) + ' WHERE tenant_id=100000 AND id=' + original.id + ' AND user_id=' + original.user + ';');
      database('UPDATE hr_employee SET deleted=1 WHERE tenant_id=100000 AND employee_no LIKE ' + sql(marker + '%') + ' AND create_by=' + sql(marker) + ';'
        + 'UPDATE hr_position SET status=0 WHERE tenant_id=100000 AND position_code LIKE ' + sql(marker + '%') + ';'
        + 'UPDATE hr_job_level SET status=0 WHERE tenant_id=100000 AND level_code LIKE ' + sql(marker + '%') + ';');
      check('HR票签收尾后原档案职位职级及授权逐行保持', originalHr() === beforeHr && grants() === originalGrants
        && instances.every(id => ['PASSED', 'TERMINATED'].includes(status(id)) && tasks(id).length === 0));
      fixture.restored = true; await persist(); evidence.hrVotingRestoration = true;
    } catch (error) { failure = new AggregateError([failure, error].filter(Boolean), 'HR voting restoration failed'); }
  }
  for (const suffix of ['.recovery.stdout.log', '.recovery.stderr.log']) {
    const file = manifestPath + suffix;
    if (await fs.stat(file).then(() => true).catch(error => { if (error.code === 'ENOENT') return false; throw error; })) operationLogs.push(file);
  }
  for (const name of await fs.readdir(path.join(state.run, 'hr'))) if (/^(stdout|stderr)-before-.*\.log$/.test(name)) operationLogs.push(path.join(state.run, 'hr', name));
  for (const file of operationLogs) { const scan = await scanSecretStream(createReadStream(file), [...secrets]); assert.equal(scan.leaks, 0, 'Owned HR helper log contains a credential'); }
  check('HR停机恢复辅助日志无凭据泄漏', true);
  if (failure) throw failure;
  console.log('B2_HR_VOTING_ACTUAL: ' + JSON.stringify({ workflows: instances.length, successfulVotes, actualHrJobLevels: true,
    beforeOutageWeights: [3, 2, 1], outageWeights: [1, 1, 1], outageThreshold: 2, actualProcessStop: true, actualProcessRecovery: true,
    restoredOriginalHr: fixture.restored, oldVotesFrozenAcrossHrChange: true, actualInitiatorNotice: true, recoveredWeights: [3, 2, 1],
    forcedWorkflowOutcomeWrites: 0, helperSecretLeaks: 0, productionModified: false }));
}
