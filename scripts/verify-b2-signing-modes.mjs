import assert from 'node:assert/strict';

// Actual workflow saves, starts and votes. This helper never writes workflow outcomes.
export async function verifyB2SigningModes({ admin, employee, api, successful, session, database, check, caseTag, secrets, evidence }) {
  const marker = 'B2SG' + caseTag, base = '/workflow/wf';
  const sql = value => 'CONVERT(0x' + Buffer.from(String(value)).toString('hex') + ' USING utf8mb4) COLLATE utf8mb4_unicode_ci';
  const rows = query => database(query).split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
  const post = (page, url, body = {}) => api(page, url, { method: 'POST', body });
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const manager = await session('g_holiday_manager');
  const managerToken = await manager.evaluate(async () => (await import('/src/utils/authStorage.ts')).getAuthToken());
  assert.ok(managerToken); secrets.add(managerToken.replace(/^Bearer /, ''));
  const people = ['g_import_admin', 'g_holiday_employee', 'g_holiday_manager'].map((name, index) => {
    const id = database("SELECT user_id FROM sys_user WHERE tenant_id=100000 AND status='0' AND deleted=0 AND user_name=" + sql(name) + ';');
    assert.match(id, /^[1-9][0-9]*$/); return { id, page: [admin, employee, manager][index], weight: [3, 2, 1][index] };
  });
  assert.equal(new Set(people.map(item => item.id)).size, 3);
  const definitions = [], instances = [];
  const grants = () => database('SELECT tenant_id,role_id,menu_id FROM sys_role_menu ORDER BY tenant_id,role_id,menu_id;');
  const originalGrants = grants();
  const tasks = id => rows("SELECT JSON_OBJECT('id',task_id,'assignee',CAST(assignee AS CHAR),'status',status,'type',task_type) FROM wf_task WHERE tenant_id=100000 AND instance_id=" + sql(id) + ' ORDER BY task_id;');
  const status = id => database('SELECT status FROM wf_process_instance WHERE tenant_id=100000 AND instance_id=' + sql(id) + ';');
  const counter = id => rows("SELECT JSON_OBJECT('id',countersign_id,'status',status,'total',total_count,'voted',voted_count,'approved',approve_count,'rejected',reject_count,'totalWeight',total_weight,'approveWeight',approve_weight,'rejectWeight',reject_weight,'passWeight',pass_weight) FROM wf_countersign_task WHERE tenant_id=100000 AND instance_id=" + sql(id) + ';');
  const snapshots = id => rows("SELECT JSON_OBJECT('task',task_id,'voter',CAST(voter_id AS CHAR),'result',vote_result,'weight',vote_weight) FROM wf_countersign_vote WHERE tenant_id=100000 AND countersign_id=" + sql(id) + ' ORDER BY voter_id;');
  const history = task => rows("SELECT JSON_OBJECT('action',action,'type',task_type) FROM wf_task_history WHERE tenant_id=100000 AND task_id=" + sql(task) + ' ORDER BY history_id;');
  let formId, failure, successfulVotes = 0;
  const create = async scenario => {
    const node = { id: 'review', type: 'APPROVAL', title: '签署验证', approverType: 'USER', approverValue: people.map(item => item.id).join(','),
      signType: scenario.mode, approveSelf: 'ALLOW', allowAgent: false, rejectStrategy: 'TERMINATE',
      ...(scenario.mode === 'WEIGHT' ? { weightSource: 'BY_CONFIG', passWeight: 5, assigneeWeights: people.map(item => ({ userId: item.id, weight: item.weight })) } : {}),
      ...(scenario.mode === 'PERCENT' ? { passPercent: 60 } : {}) };
    const model = { nodes: [{ id: 'start', type: 'START', title: '发起' }, node, { id: 'end', type: 'END', title: '结束' }],
      edges: [{ id: 'start-review', source: 'start', target: 'review' }, { id: 'review-end', source: 'review', target: 'end' }] };
    const saved = successful(await post(admin, base + '/definition/save', { processKey: marker + '-' + scenario.name, processName: marker + '-' + scenario.name,
      formId, modelJson: JSON.stringify(model), startPermissionType: 'ALL', startPermissionValue: '[]' }), '保存签署验证定义');
    const definition = saved.definitionId ?? saved.id; assert.ok(definition); definitions.push(definition);
    successful(await post(admin, base + '/definition/deploy/' + definition), '发布签署验证定义');
    const context = successful(await api(admin, base + '/draft/context/' + definition), '读取签署发起上下文');
    const draft = successful(await post(admin, base + '/draft', { definitionId: definition, expectedVersion: 0, loadedContextHash: context.contextHash,
      title: marker + '-' + scenario.name, formData: { note: marker }, nodeAssignees: {} }), '保存签署验证草稿');
    const started = successful(await post(admin, base + '/start', { draftId: draft.draftId, expectedVersion: draft.lockVersion }), '正常发起签署验证流程');
    const id = started.instanceId ?? started.processInstanceId; assert.ok(id); instances.push(id); return id;
  };
  const scenarios = [
    { mode: 'WEIGHT', name: 'weight-pass', actions: ['APPROVE', 'APPROVE'], terminal: 'PASSED' },
    { mode: 'WEIGHT', name: 'weight-reject', actions: ['REJECT'], terminal: 'REJECTED' },
    { mode: 'ALL', name: 'all-pass', actions: ['APPROVE', 'APPROVE', 'APPROVE'], terminal: 'PASSED' },
    { mode: 'ALL', name: 'all-reject', actions: ['REJECT'], terminal: 'REJECTED' },
    { mode: 'ANY', name: 'any-pass', actions: ['APPROVE'], terminal: 'PASSED' },
    { mode: 'ANY', name: 'any-reject', actions: ['REJECT', 'REJECT', 'REJECT'], terminal: 'REJECTED' },
    { mode: 'PERCENT', name: 'percent-pass', actions: ['APPROVE', 'APPROVE'], terminal: 'PASSED' },
    { mode: 'PERCENT', name: 'percent-reject', actions: ['REJECT', 'REJECT'], terminal: 'REJECTED' },
    { mode: 'SEQUENTIAL', name: 'sequential-pass', actions: ['APPROVE', 'APPROVE', 'APPROVE'], terminal: 'PASSED' },
    { mode: 'SEQUENTIAL', name: 'sequential-reject', actions: ['APPROVE', 'REJECT'], terminal: 'REJECTED' }
  ];
  try {
    const form = successful(await post(admin, base + '/form/save', { formKey: marker, formName: marker,
      fieldsJson: JSON.stringify([{ id: 'note', type: 'TEXT', label: '说明' }]) }), '建立签署验证表单');
    formId = form.formId ?? form.id; assert.ok(formId);
    for (const scenario of scenarios) {
      const id = await create(scenario), initialTasks = tasks(id), initialCounters = counter(id);
      assert.equal(initialCounters.length, 1); const initial = initialCounters[0];
      const type = { WEIGHT: 'WEIGHT_SIGN', ALL: 'COUNTERSIGN', ANY: 'OR_SIGN', PERCENT: 'PERCENT_SIGN', SEQUENTIAL: 'SEQUENTIAL_SIGN' }[scenario.mode];
      check(scenario.name + '真实发起建立正确签署待办', status(id) === 'RUNNING' && initial.status === 'VOTING' && initial.total === 3 && initial.voted === 0
        && initialTasks.length === (scenario.mode === 'SEQUENTIAL' ? 1 : 3) && initialTasks.every(item => item.status === 'TODO' && item.type === type));
      if (scenario.mode === 'WEIGHT') {
        const votes = snapshots(initial.id);
        check(scenario.name + '发起时持久固定三人票权和通过阈值', initial.totalWeight === 6 && initial.passWeight === 5 && votes.length === 3
          && people.every(person => votes.some(vote => vote.voter === person.id && vote.weight === person.weight && vote.result === 'PENDING')));
      }
      let lastTask, lastActor;
      for (let index = 0; index < scenario.actions.length; index++) {
        const actor = people[index], action = scenario.actions[index], pending = tasks(id), task = pending.find(item => item.assignee === actor.id);
        assert.ok(task, 'Expected signer has an actual pending task');
        if (scenario.mode === 'SEQUENTIAL') check(scenario.name + '当前仅轮到指定顺序人员' + (index + 1), pending.length === 1 && pending[0].assignee === actor.id);
        successful(await post(actor.page, base + '/complete', { taskId: task.id, action, comment: marker + '-' + scenario.name + '-' + index }), '本人通过标准审批入口签署');
        successfulVotes++; lastTask = task; lastActor = actor;
        const current = counter(id)[0], isLast = index === scenario.actions.length - 1;
        check(scenario.name + '第' + (index + 1) + '票准确累计且按条件流转', current.voted === index + 1
          && current.approved === scenario.actions.slice(0, index + 1).filter(value => value === 'APPROVE').length
          && current.rejected === scenario.actions.slice(0, index + 1).filter(value => value === 'REJECT').length
          && current.status === (isLast ? scenario.terminal : 'VOTING') && status(id) === (isLast ? scenario.terminal : 'RUNNING'));
        if (scenario.name === 'weight-pass' && index === 0) {
          check('三票权同意后尚未达到五票通过阈值', current.approveWeight === 3 && tasks(id).length === 2);
          const before = JSON.stringify(counter(id)), beforeHistory = JSON.stringify(history(task.id));
          await sleep(5500);
          const repeated = await post(actor.page, base + '/complete', { taskId: task.id, action, comment: marker + '-repeat-first' });
          check('重复投票明确拒绝且计票历史保持', repeated.status === 404 && repeated.body?.code === 'TASK_NOT_FOUND'
            && JSON.stringify(counter(id)) === before && JSON.stringify(history(task.id)) === beforeHistory);
        }
      }
      check(scenario.name + '结束后已无可继续投票待办', tasks(id).length === 0);
      if (scenario.mode === 'WEIGHT') {
        const final = counter(id)[0], votes = snapshots(initial.id), remaining = initialTasks.filter(task => !scenario.actions.some((_, index) => people[index].id === task.assignee));
        const semantic = scenario.terminal === 'PASSED' ? 'AUTO_PASS' : 'AUTO_REJECT';
        check(scenario.name + '未投票席位自动收尾且保留对应历史', remaining.length === 3 - scenario.actions.length
          && remaining.every(task => votes.some(vote => vote.task === task.id && vote.result === semantic) && history(task.id).some(item => item.type === semantic)));
        check(scenario.name + '实际权重结果准确', scenario.terminal === 'PASSED' ? final.approveWeight === 5 && final.rejectWeight === 0 : final.approveWeight === 0 && final.rejectWeight === 3);
      }
      if (scenario.name === 'weight-pass') {
        const before = JSON.stringify(counter(id)); await sleep(5500);
        const repeated = await post(lastActor.page, base + '/complete', { taskId: lastTask.id, action: 'APPROVE', comment: marker + '-repeat-finished' });
        check('已通过流程不能重复计票或生成新待办', repeated.status === 404 && repeated.body?.code === 'TASK_NOT_FOUND'
          && JSON.stringify(counter(id)) === before && tasks(id).length === 0 && status(id) === 'PASSED');
      }
    }
    evidence.signingWeightPass = true; evidence.signingWeightReject = true; evidence.signingFourModes = true; evidence.signingRepeat = true;
    console.log('B2_SIGNING_MODES_ACTUAL: ' + JSON.stringify({ workflows: instances.length, successfulVotes, signModes: 5, originalModes: ['ALL', 'ANY', 'PERCENT', 'SEQUENTIAL'],
      realWorkflowEndpoints: true, weightedThreshold: 5, weightedApprovals: [3, 2], weightedUnvoted: 1, earlyWeightedReject: true, actualHrJobLevels: false,
      actualHrOutage: false, forcedWorkflowOutcomeWrites: 0 }));
  } catch (error) { failure = error; }
  finally {
    try {
      for (const id of instances) if (['RUNNING', 'PENDING', 'PAUSED', 'FAILED', 'WITHDRAWN', 'TASK_BACK', 'RESTARTED'].includes(status(id)))
        successful(await post(admin, base + '/instance/terminate', { instanceId: id, reason: marker + '-cleanup' }), '收尾自有签署验证流程');
      for (const definition of definitions) database("UPDATE wf_process_definition SET status='ARCHIVED' WHERE tenant_id=100000 AND deleted=0 AND definition_id=" + sql(definition) + ' AND process_key LIKE ' + sql(marker + '%') + ';');
      check('签署验证收尾且原角色授权集合保持', grants() === originalGrants && instances.every(id => ['PASSED', 'REJECTED', 'TERMINATED'].includes(status(id)) && tasks(id).length === 0));
      evidence.signingRestoration = true;
    } catch (error) { failure = new AggregateError([failure, error].filter(Boolean), 'Signing verification cleanup failed'); }
  }
  if (failure) throw failure;
}
