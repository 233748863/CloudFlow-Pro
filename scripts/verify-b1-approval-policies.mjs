import assert from 'node:assert/strict';

// Uses the existing authenticated integration harness; only identity fixtures use SQL.
export async function verifyB1ApprovalPolicies({ admin, employee, api, successful, session, database, check, caseTag, secrets, evidence }) {
  const marker = 'B1AP' + caseTag, base = '/workflow/wf';
  const sql = value => value == null ? 'NULL' : 'CONVERT(0x' + Buffer.from(String(value)).toString('hex') + ' USING utf8mb4) COLLATE utf8mb4_unicode_ci';
  const rows = statement => database(statement).split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
  const post = (page, url, body = {}) => api(page, url, { method: 'POST', body });
  const people = rows("SELECT JSON_OBJECT('id',CAST(user_id AS CHAR),'name',user_name,'nick',nick_name,'dept',CAST(dept_id AS CHAR),'status',status) FROM sys_user WHERE tenant_id=100000 AND deleted=0 AND user_name IN ('g_import_admin','g_holiday_employee','g_holiday_manager');");
  const manager = await session('g_holiday_manager');
  const managerToken = await manager.evaluate(async () => (await import('/src/utils/authStorage.ts')).getAuthToken());
  assert.ok(managerToken); secrets.add(managerToken.replace(/^Bearer /, ''));
  const person = (name, page) => { const found = people.find(item => item.name === name); assert.ok(found); assert.equal(found.status, '0'); return { ...found, page }; };
  const starter = person('g_holiday_employee', employee), direct = person('g_holiday_manager', manager), top = person('g_import_admin', admin);
  const foreignId = database("SELECT user_id FROM sys_user WHERE tenant_id=100001 AND user_name='g_import_tenant' AND status='0' AND deleted=0;");
  assert.match(foreignId, /^[1-9][0-9]*$/);
  const definitions = [], instances = [], departments = [], drafts = [];
  const originalUsers = () => database('SELECT user_id,dept_id,status,deleted,version FROM sys_user WHERE user_id IN (' + people.map(item => item.id).join(',') + ') ORDER BY user_id;');
  const grants = () => database('SELECT tenant_id,role_id,menu_id FROM sys_role_menu ORDER BY tenant_id,role_id,menu_id;');
  const originalIdentity = originalUsers(), originalGrants = grants();
  const status = id => database('SELECT status FROM wf_process_instance WHERE tenant_id=100000 AND instance_id=' + sql(id) + ';');
  const tasks = id => rows("SELECT JSON_OBJECT('id',task_id,'user',CAST(assignee AS CHAR),'type',task_type,'node',node_key,'status',status) FROM wf_task WHERE tenant_id=100000 AND instance_id=" + sql(id) + ' ORDER BY task_id;');
  const history = id => rows("SELECT JSON_OBJECT('id',history_id,'task',task_id,'type',task_type,'action',action,'node',node_key,'comment',comment) FROM wf_task_history WHERE tenant_id=100000 AND instance_id=" + sql(id) + " AND node_key='review' ORDER BY history_id;");
  const nodeRecords = id => rows("SELECT JSON_OBJECT('event',event_type,'type',event_type,'status',status,'extra',extra_data) FROM wf_node_record WHERE tenant_id=100000 AND instance_id=" + sql(id) + " AND node_key='review' ORDER BY id;");
  const waitFor = async (read, accept, label) => { const deadline = Date.now() + 30000; do { const value = await read(); if (accept(value)) return value; await new Promise(resolve => setTimeout(resolve, 200)); } while (Date.now() < deadline); throw new Error(label); };
  let formId, roleId, leaf, parent, failure, starts = 0, completions = 0, rejectedStarts = 0;
  const department = (name, parentId, leader) => {
    const id = database('INSERT INTO sys_dept(tenant_id,parent_id,ancestors,dept_name,leader,status,deleted,create_by,create_time) VALUES(100000,' + parentId + ",'0'," + sql(marker + '-' + name) + ',' + sql(leader) + ",'0',0," + sql(marker) + ',NOW());SELECT LAST_INSERT_ID();');
    assert.match(id, /^[1-9][0-9]*$/); departments.push(id); return id;
  };
  const setLeader = value => database('UPDATE sys_dept SET leader=' + sql(value) + ' WHERE tenant_id=100000 AND dept_id=' + leaf + ' AND create_by=' + sql(marker) + ';');
  const setStarterDept = id => database('UPDATE sys_user SET dept_id=' + id + ' WHERE tenant_id=100000 AND user_id=' + starter.id + ';');
  const modelFor = (name, props) => ({ nodes: [{ id: 'start', type: 'START', title: '发起' }, { id: 'review', type: 'APPROVAL', title: name,
      approverType: 'INITIATOR', allowAgent: false, ...props }, { id: 'end', type: 'END', title: '结束' }],
      edges: [{ id: 'start-review', source: 'start', target: 'review' }, { id: 'review-end', source: 'review', target: 'end' }] });
  const definition = async (name, props) => {
    const model = modelFor(name, props);
    const saved = successful(await post(admin, base + '/definition/save', { processKey: marker + '-' + name, processName: marker + '-' + name,
      formId, modelJson: JSON.stringify(model), startPermissionType: 'ALL', startPermissionValue: '[]' }), '保存B1审批定义');
    const id = saved.definitionId ?? saved.id; assert.ok(id); definitions.push(id);
    successful(await post(admin, base + '/definition/deploy/' + id), '发布B1审批定义'); return id;
  };
  const draft = async (id, name, nodeAssignees = {}) => {
    const context = successful(await api(employee, base + '/draft/context/' + id), '读取本人发起上下文');
    const saved = successful(await post(employee, base + '/draft', { definitionId: id, expectedVersion: 0, loadedContextHash: context.contextHash,
      title: marker + '-' + name, formData: { note: marker }, nodeAssignees }), '保存本人审批草稿');
    assert.ok(saved.draftId); drafts.push(saved.draftId); return saved;
  };
  const launch = async (id, name, nodeAssignees = {}) => {
    const saved = await draft(id, name, nodeAssignees);
    const result = successful(await post(employee, base + '/start', { draftId: saved.draftId, expectedVersion: saved.lockVersion }), '通过原草稿入口发起审批');
    const instanceId = result.instanceId ?? result.processInstanceId; assert.ok(instanceId); instances.push(instanceId); starts++; return instanceId;
  };
  const complete = async (id, actor) => {
    const pending = tasks(id); assert.equal(pending.length, 1); assert.equal(pending[0].user, actor.id);
    successful(await post(actor.page, base + '/complete', { taskId: pending[0].id, action: 'APPROVE', comment: marker }), '实际审批人通过原入口完成');
    completions++;
    check('本人完成后唯一审批历史且无遗留待办', status(id) === 'PASSED' && tasks(id).length === 0 && history(id).filter(item => ['APPROVE','COUNTERSIGN_APPROVE'].includes(item.action)).length === 1);
  };
  const checkTask = (id, actor, label) => check(label, status(id) === 'RUNNING' && tasks(id).length === 1 && tasks(id)[0].user === actor.id && tasks(id)[0].type === 'APPROVAL');
  const checkSkip = async (id, label) => {
    const records = await waitFor(() => nodeRecords(id), items => items.some(item => item.type === 'AUTO_SKIP'), 'Auto-skip node record missing');
    const trace = successful(await api(employee, base + '/instance/' + id + '/trace'), '本人读取自动跳过轨迹');
    check(label, status(id) === 'PASSED' && tasks(id).length === 0 && history(id).filter(item => item.type === 'AUTO_SKIP' && item.action === 'AUTO_SKIP').length === 1
      && records.some(item => item.type === 'AUTO_SKIP') && JSON.stringify(trace).includes('AUTO_SKIP'));
  };
  const rejectLaunch = async (id, name, selections) => {
    const saved = await draft(id, name, {});
    const before = database('SELECT CAST(JSON_OBJECT(\'draft\',draft_id,\'version\',lock_version,\'data\',form_data,\'selections\',node_assignees) AS CHAR) FROM wf_form_draft WHERE draft_id=' + sql(saved.draftId) + ';');
    const beforeCount = database('SELECT COUNT(*) FROM wf_process_instance WHERE tenant_id=100000 AND definition_id=' + sql(id) + ';');
    const invalidSave = Object.keys(selections).length > 0;
    const context = invalidSave ? successful(await api(employee, base + '/draft/context/' + id), '读取非法选人提交前的有效上下文') : null;
    const result = invalidSave
      ? await post(employee, base + '/draft', { draftId: saved.draftId, definitionId: id, expectedVersion: saved.lockVersion,
        loadedContextHash: context.contextHash, title: marker + '-' + name, formData: { note: marker }, nodeAssignees: selections })
      : await post(employee, base + '/start', { draftId: saved.draftId, expectedVersion: saved.lockVersion });
    const unchanged = database('SELECT CAST(JSON_OBJECT(\'draft\',draft_id,\'version\',lock_version,\'data\',form_data,\'selections\',node_assignees) AS CHAR) FROM wf_form_draft WHERE draft_id=' + sql(saved.draftId) + ';') === before;
    check(name + '被服务端拒绝且原草稿和流程数量保持', result.status >= 400 && result.status < 500 && result.body?.code !== 200 && unchanged
      && database('SELECT COUNT(*) FROM wf_process_instance WHERE tenant_id=100000 AND definition_id=' + sql(id) + ';') === beforeCount);
    rejectedStarts++;
    console.log('B1_REJECTED_SUBMISSION: scenario=' + name + '; entry=' + (invalidSave ? 'draft' : 'start') + '; status=' + result.status + '; code=' + String(result.body?.code));
    database('DELETE FROM wf_form_draft WHERE tenant_id=100000 AND draft_id=' + sql(saved.draftId) + ' AND title=' + sql(marker + '-' + name) + ';');
  };
  try {
    parent = department('top', 0, top.id); leaf = department('leaf', parent, direct.id);
    database('UPDATE sys_user SET dept_id=' + leaf + ' WHERE tenant_id=100000 AND user_id IN (' + starter.id + ',' + direct.id + ');');
    roleId = database('INSERT INTO sys_role(tenant_id,role_name,role_key,role_sort,status,deleted,create_by) VALUES(100000,' + sql(marker) + ',' + sql(marker) + ",99,'0',0," + sql(marker) + ');SELECT LAST_INSERT_ID();');
    assert.match(roleId, /^[1-9][0-9]*$/);
    database('INSERT INTO sys_user_role(user_id,role_id,tenant_id) VALUES(' + direct.id + ',' + roleId + ',100000),(' + top.id + ',' + roleId + ',100000);');
    const form = successful(await post(admin, base + '/form/save', { formKey: marker, formName: marker,
      fieldsJson: JSON.stringify([{ id: 'note', type: 'TEXT', label: '说明' }]) }), '创建审批验证表单');
    formId = form.formId ?? form.id; assert.ok(formId);
    for (const policy of [undefined, 'ALLOW', 'AUTO_SKIP', 'TO_DIRECT_LEADER', 'TO_DEPT_MANAGER']) {
      const name = 'self-' + (policy ?? 'default'), def = await definition(name, policy ? { approveSelf: policy } : {});
      const id = await launch(def, name);
      if (policy === 'AUTO_SKIP') await checkSkip(id, '自审自动跳过保存任务历史与轨迹语义');
      else { const actor = policy?.startsWith('TO_') ? direct : starter; checkTask(id, actor, name + '唯一待办分派正确'); await complete(id, actor); }
    }
    const groupName = 'self-skip-group', group = await launch(await definition(groupName, { approverType: 'USERS',
      approverValue: starter.id + ',' + direct.id, signType: 'ALL', approveSelf: 'AUTO_SKIP' }), groupName);
    check('会签自审跳过仅移除发起人并保留另一人的实际待办', status(group) === 'RUNNING' && tasks(group).length === 1
      && tasks(group)[0].user === direct.id && history(group).filter(item => item.type === 'AUTO_SKIP').length === 1
      && nodeRecords(group).some(item => item.type === 'AUTO_SKIP'));
    await complete(group, direct);
    evidence.b1SelfPolicies = true;
    setLeader(starter.id);
    for (const policy of ['TO_DIRECT_LEADER', 'TO_DEPT_MANAGER']) {
      const name = 'self-loop-' + policy, id = await launch(await definition(name, { approveSelf: policy }), name);
      const notes = nodeRecords(id);
      checkTask(id, starter, name + '转派仍为本人时保留唯一待办');
      check('自审转派本人降级原因持久留痕', JSON.stringify(notes).includes('APPROVE_SELF_REDIRECT_FAILED_DEGRADE_TO_ALLOW'));
      await complete(id, starter);
      const completedNotes = await waitFor(() => nodeRecords(id), items => items.some(item => {
        const extra = typeof item.extra === 'string' ? JSON.parse(item.extra) : item.extra;
        return extra?.action === 'APPROVE';
      }), 'Task completion listener record missing');
      check('审批完成后自审转派本人降级原因仍保留', JSON.stringify(completedNotes).includes('APPROVE_SELF_REDIRECT_FAILED_DEGRADE_TO_ALLOW'));
    }
    evidence.b1SelfLoop = true; setLeader(direct.id);
    const multi = { approverType: 'MULTI_LEVEL_MANAGER', directorLevel: 2, approveSelf: 'ALLOW' };
    for (const type of ['APPROVAL', 'MANUAL', 'PARALLEL', 'COPY']) {
      await definition('manager-save-' + type, { ...multi, type, ...(type === 'PARALLEL' ? { signType: 'ALL' } : {}) });
      check(type + '按部门推导主管时无需填写具体人员即可保存发布', true);
      for (const [boundary, invalid] of [['zero', { directorLevel: 0 }], ['eleven', { directorLevel: 11 }],
        ['fallback', { directorFallback: 'UNKNOWN' }], ['missing-users', { approverType: 'USERS' }]]) {
        const name = 'manager-invalid-' + type + '-' + boundary, key = marker + '-' + name;
        const response = await post(admin, base + '/definition/save', { processKey: key, processName: key, formId,
          modelJson: JSON.stringify(modelFor(name, { ...multi, type, ...(type === 'PARALLEL' ? { signType: 'ALL' } : {}), ...invalid })),
          startPermissionType: 'ALL', startPermissionValue: '[]' });
        const unexpected = response.body?.data?.definitionId ?? response.body?.data?.id;
        if (unexpected) definitions.push(unexpected);
        check(type + '拒绝非法主管配置或缺失具体人员-' + boundary, response.status >= 400 && response.status < 500
          && database('SELECT COUNT(*) FROM wf_process_definition WHERE tenant_id=100000 AND process_key=' + sql(key) + ';') === '0');
      }
    }
    for (const [name, leader] of [['id', direct.id], ['username', direct.name], ['nickname', direct.nick]]) {
      assert.ok(leader && [...leader].length <= 20, 'Leader fixture must fit existing department capacity'); setLeader(leader);
      const id = await launch(await definition('level-two-' + name, multi), 'level-two-' + name);
      checkTask(id, top, '两级主管兼容负责人' + name + '表示'); await complete(id, top);
    }
    setLeader(direct.id);
    for (const fallback of ['TOP_LEVEL', 'SKIP', 'FAIL']) {
      const name = 'shortage-' + fallback, def = await definition(name, { ...multi, directorLevel: 3, directorFallback: fallback });
      if (fallback === 'FAIL') await rejectLaunch(def, name, {});
      else { const id = await launch(def, name); if (fallback === 'SKIP') await checkSkip(id, '主管层级不足按配置跳过并留痕'); else { checkTask(id, top, '主管层级不足使用最高已找到负责人'); await complete(id, top); } }
    }
    evidence.b1ManagerFallbacks = true;
    database('UPDATE sys_dept SET parent_id=' + leaf + ' WHERE tenant_id=100000 AND dept_id=' + parent + ' AND create_by=' + sql(marker) + ';');
    const cycleName = 'manager-cycle', cycleStart = Date.now();
    const cycle = await launch(await definition(cycleName, { ...multi, directorLevel: 3, directorFallback: 'SKIP' }), cycleName);
    await checkSkip(cycle, '实际部门树成环时有限结束并按不足策略处理');
    check('部门成环实际请求在30秒内返回', Date.now() - cycleStart < 30000);
    database('UPDATE sys_dept SET parent_id=0 WHERE tenant_id=100000 AND dept_id=' + parent + ' AND create_by=' + sql(marker) + ';');
    let deepParent = department('depth-11', 0, direct.id);
    for (let index = 10; index >= 1; index--) deepParent = department('depth-' + index, deepParent, index === 10 ? top.id : null);
    setStarterDept(deepParent);
    const depthName = 'manager-depth', depth = await launch(await definition(depthName, { ...multi, directorFallback: 'TOP_LEVEL' }), depthName);
    checkTask(depth, top, '只在十级内查找负责人且不会读取第十一级'); await complete(depth, top); setStarterDept(leaf);
    evidence.b1ManagerBounds = true;
    const scopes = [
      { name: 'role', scope: { roleIds: [roleId] }, candidates: [direct.id, top.id] },
      { name: 'dept', scope: { deptIds: [leaf] }, candidates: [direct.id, starter.id] },
      { name: 'intersection', scope: { roleIds: [roleId], deptIds: [leaf] }, candidates: [direct.id] }
    ];
    let selectedDefinition;
    for (const item of scopes) {
      const name = 'selected-' + item.name, def = await definition(name, { approverType: 'INITIATOR_SELECTED', selectableScope: item.scope, approveSelf: 'ALLOW' });
      if (item.name === 'intersection') selectedDefinition = def;
      const options = successful(await api(employee, base + '/definition/' + def + '/start-assignee-nodes'), '本人查询限定范围候选人');
      check(name + '候选人准确体现角色部门及交集', options.length === 1 && options[0].nodeKey === 'review' && options[0].multiple === false
        && JSON.stringify(options[0].candidates.map(candidate => candidate.userId).sort()) === JSON.stringify(item.candidates.sort()));
      const id = await launch(def, name, { review: [direct.id] }); checkTask(id, direct, name + '真实分派给选定审批人');
      check('发起人选人快照按实例节点保存且不能作为待办认领', database("SELECT COUNT(*) FROM wf_task_candidate WHERE tenant_id=100000 AND instance_id=" + sql(id) + " AND node_key='review' AND source='INITIATOR_SELECTED' AND task_id IS NULL AND user_id=" + direct.id + ';') === '1');
      await complete(id, direct);
    }
    for (const [name, selected] of [
      ['outside-department', { review: [top.id] }], ['outside-role', { review: [starter.id] }], ['foreign-user', { review: [foreignId] }],
      ['missing-user', { review: ['9223372036854775807'] }], ['duplicate-user', { review: [direct.id, direct.id] }],
      ['multiple-users', { review: [direct.id, starter.id] }], ['missing-selection', {}], ['unknown-node', { review: [direct.id], end: [direct.id] }]
    ]) await rejectLaunch(selectedDefinition, name, selected);
    evidence.b1SelectionScope = true;
    console.log('B1_APPROVAL_POLICIES_ACTUAL: ' + JSON.stringify({ realStarts: starts, humanCompletions: completions, rejectedSubmissions: rejectedStarts, selfPolicies: 4,
      selfRedirectLoops: 2, leaderRepresentations: 3, managerFallbacks: 3, cycleAndTenLevelLimit: true, selectableScopes: 3, forcedWorkflowOutcomeWrites: 0, uiVerified: false }));
  } catch (error) { failure = error; }
  finally {
    try {
      for (const id of instances) if (['RUNNING', 'PAUSED', 'PENDING', 'FAILED', 'WITHDRAWN', 'TASK_BACK', 'RESTARTED'].includes(status(id)))
        successful(await post(admin, base + '/instance/terminate', { instanceId: id, reason: marker + '-cleanup' }), '通过管理入口终止自有未完成流程');
      for (const item of [starter, direct]) database('UPDATE sys_user SET dept_id=' + sql(item.dept) + ' WHERE tenant_id=100000 AND user_id=' + item.id + ';');
      if (roleId) { database('DELETE FROM sys_user_role WHERE tenant_id=100000 AND role_id=' + roleId + ';'); database('DELETE FROM sys_role WHERE tenant_id=100000 AND role_id=' + roleId + ' AND create_by=' + sql(marker) + ';'); }
      for (const id of definitions) database("UPDATE wf_process_definition SET status='ARCHIVED',deleted=0 WHERE tenant_id=100000 AND definition_id=" + sql(id) + ' AND process_key LIKE ' + sql(marker + '%') + ';');
      for (const id of drafts) database('DELETE FROM wf_form_draft WHERE tenant_id=100000 AND draft_id=' + sql(id) + ' AND title LIKE ' + sql(marker + '%') + ';');
      for (const id of departments) database('DELETE FROM sys_dept WHERE tenant_id=100000 AND dept_id=' + id + ' AND create_by=' + sql(marker) + ';');
      check('B1验证原人员部门权限完整恢复且自有身份准备清理', originalUsers() === originalIdentity && grants() === originalGrants
        && database('SELECT COUNT(*) FROM sys_dept WHERE create_by=' + sql(marker) + ';') === '0');
      evidence.b1PoliciesRestoration = true;
    } catch (error) { failure = new AggregateError([failure, error].filter(Boolean), 'B1 approval verification or restoration failed'); }
  }
  if (failure) throw failure;
}
