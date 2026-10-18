import assert from 'node:assert/strict';

// Exercise old definitions through real draft/start/complete endpoints, without new node defaults.
export async function verifyB1LegacyAssignees({ admin, employee, api, successful, session, database, check, caseTag, secrets, evidence }) {
  const marker = 'B1LG' + caseTag, base = '/workflow/wf';
  const sql = value => value == null ? 'NULL' : 'CONVERT(0x' + Buffer.from(String(value)).toString('hex') + ' USING utf8mb4) COLLATE utf8mb4_unicode_ci';
  const rows = statement => database(statement).split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
  const post = (page, url, body = {}) => api(page, url, { method: 'POST', body });
  const manager = await session('g_holiday_manager');
  const token = await manager.evaluate(async () => (await import('/src/utils/authStorage.ts')).getAuthToken());
  assert.ok(token); secrets.add(token.replace(/^Bearer /, ''));
  const people = rows("SELECT JSON_OBJECT('id',CAST(user_id AS CHAR),'name',user_name,'dept',CAST(dept_id AS CHAR),'status',status) FROM sys_user WHERE tenant_id=100000 AND deleted=0 AND user_name IN ('g_import_admin','g_holiday_employee','g_holiday_manager');");
  const person = (name, page) => { const found = people.find(item => item.name === name); assert.ok(found); assert.equal(found.status, '0'); return { ...found, page }; };
  const starter = person('g_holiday_employee', employee), reviewer = person('g_holiday_manager', manager), top = person('g_import_admin', admin);
  assert.ok(people.every(item => Number.isSafeInteger(Number(item.id))));
  const userIds = people.map(item => item.id).join(',');
  const identities = () => database('SELECT user_id,dept_id,status,deleted,version FROM sys_user WHERE user_id IN (' + userIds + ') ORDER BY user_id;');
  const permissions = () => database('SELECT tenant_id,role_id,menu_id FROM sys_role_menu ORDER BY tenant_id,role_id,menu_id;SELECT tenant_id,user_id,role_id FROM sys_user_role ORDER BY tenant_id,user_id,role_id;');
  const agents = () => database('SELECT * FROM wf_agent_setting ORDER BY setting_id;');
  const original = { identities: identities(), permissions: permissions(), agents: agents() };
  check('旧定义样本账号无生效代理配置且无需新增关闭开关', database("SELECT COUNT(*) FROM wf_agent_setting WHERE tenant_id=100000 AND status='ACTIVE' AND start_time<=NOW() AND end_time>NOW() AND principal_user_id IN (" + userIds + ');') === '0');
  const definitions = [], instances = [], departments = [], roles = [], drafts = [];
  const status = id => database('SELECT status FROM wf_process_instance WHERE tenant_id=100000 AND instance_id=' + sql(id) + ';');
  const tasks = id => rows("SELECT JSON_OBJECT('id',task_id,'user',CAST(assignee AS CHAR),'type',task_type,'status',status) FROM wf_task WHERE tenant_id=100000 AND instance_id=" + sql(id) + ' ORDER BY task_id;');
  const history = id => rows("SELECT JSON_OBJECT('id',history_id,'task',task_id,'user',CAST(operator_id AS CHAR),'type',task_type,'action',action,'comment',comment) FROM wf_task_history WHERE tenant_id=100000 AND instance_id=" + sql(id) + " AND node_key='review' ORDER BY history_id;");
  const counter = id => rows("SELECT JSON_OBJECT('total',total_count,'voted',voted_count,'approved',approve_count,'rejected',reject_count,'status',status) FROM wf_countersign_task WHERE tenant_id=100000 AND instance_id=" + sql(id) + ';');
  let formId, failure, starts = 0, completions = 0, traceChecks = 0, deniedStarts = 0;
  const department = (name, leader) => {
    const id = database("INSERT INTO sys_dept(tenant_id,parent_id,ancestors,dept_name,leader,status,deleted,create_by,create_time) VALUES(100000,0,'0'," + sql(marker + '-' + name) + ',' + sql(leader) + ",'0',0," + sql(marker) + ',NOW());SELECT LAST_INSERT_ID();');
    assert.match(id, /^[1-9][0-9]*$/); departments.push(id); return id;
  };
  const role = (name, members) => {
    const key = (marker + '-' + name).toLowerCase();
    const id = database('INSERT INTO sys_role(tenant_id,role_name,role_key,role_sort,status,deleted,create_by) VALUES(100000,' + sql(key) + ',' + sql(key) + ",99,'0',0," + sql(marker) + ');SELECT LAST_INSERT_ID();');
    assert.match(id, /^[1-9][0-9]*$/); roles.push(id);
    for (const member of members) database('INSERT INTO sys_user_role(user_id,role_id,tenant_id) VALUES(' + member.id + ',' + id + ',100000);');
    return key;
  };
  const definition = async scenario => {
    const model = { nodes: [{ id: 'start', type: 'START', title: '发起' }, { id: 'review', type: 'APPROVAL', title: scenario.name,
      approverType: scenario.source, ...(scenario.value == null ? {} : { approverValue: scenario.value }), ...(scenario.group ? { signType: 'ALL' } : {}) },
      { id: 'end', type: 'END', title: '结束' }], edges: [{ id: 'start-review', source: 'start', target: 'review' }, { id: 'review-end', source: 'review', target: 'end' }] };
    const saved = successful(await post(admin, base + '/definition/save', { processKey: marker + '-' + scenario.name, processName: marker + '-' + scenario.name,
      formId, modelJson: JSON.stringify(model), startPermissionType: 'ALL', startPermissionValue: '[]' }), '保存无新增字段的旧审批定义');
    const id = saved.definitionId ?? saved.id; assert.ok(id); definitions.push(id);
    successful(await post(admin, base + '/definition/deploy/' + id), '发布旧审批定义');
    const published = JSON.parse(database('SELECT model_json FROM wf_process_definition WHERE tenant_id=100000 AND definition_id=' + sql(id) + ';'));
    check(scenario.name + '发布模型保持原字段且未自动补入新策略或开关', JSON.stringify(published) === JSON.stringify(model));
    return id;
  };
  const draft = async (id, scenario, suffix) => {
    const context = successful(await api(employee, base + '/draft/context/' + id), '读取本人旧定义发起上下文');
    const saved = successful(await post(employee, base + '/draft', { definitionId: id, expectedVersion: 0, loadedContextHash: context.contextHash,
      title: marker + '-' + scenario.name + '-' + suffix, formData: { note: marker, ...scenario.data }, nodeAssignees: {} }), '通过原表单保存发起草稿');
    assert.ok(saved.draftId); drafts.push(saved.draftId); return saved;
  };
  const launch = async (id, scenario, suffix) => {
    const saved = await draft(id, scenario, suffix);
    const result = successful(await post(employee, base + '/start', { draftId: saved.draftId, expectedVersion: saved.lockVersion }), '员工真实发起旧流程');
    const instanceId = result.instanceId ?? result.processInstanceId; assert.ok(instanceId); instances.push(instanceId); starts++; return instanceId;
  };
  const run = async scenario => {
    const def = await definition(scenario);
    for (const action of ['APPROVE', 'REJECT']) {
      const id = await launch(def, scenario, action), initial = tasks(id), expectedType = scenario.group ? 'COUNTERSIGN' : 'APPROVAL';
      console.log('B1_LEGACY_SCENARIO: name=' + scenario.name + '; action=' + action);
      check(scenario.name + '-' + action + '准确分派全部审批人且无额外待办', status(id) === 'RUNNING'
        && JSON.stringify(initial.map(item => item.user).sort()) === JSON.stringify(scenario.members.map(item => item.id).sort())
        && initial.every(item => item.status === 'TODO' && item.type === expectedType));
      if (scenario.variable) {
        const variables = JSON.parse(database('SELECT variables FROM wf_process_instance WHERE tenant_id=100000 AND instance_id=' + sql(id) + ';'));
        check(scenario.name + '实例实际保留表单提供的审批变量', JSON.stringify(variables[scenario.value]) === JSON.stringify(scenario.data[scenario.value]));
      }
      const actors = action === 'REJECT' ? scenario.members.slice(0, 1) : scenario.members;
      for (let index = 0; index < actors.length; index++) {
        const actor = actors[index], task = tasks(id).find(item => item.user === actor.id); assert.ok(task);
        const comment = marker + '-' + scenario.name + '-' + action + '-' + index;
        successful(await post(actor.page, base + '/complete', { taskId: task.id, action, comment }), '实际审批人通过原处理入口完成'); completions++;
        const saved = history(id).filter(item => item.task === task.id); assert.equal(saved.length, 1);
        const expectedAction = scenario.group ? 'COUNTERSIGN_' + action : action;
        const semantic = scenario.group ? 'COUNTERSIGN' : action === 'REJECT' ? 'REJECT' : 'APPROVAL';
        check(scenario.name + '本人处理历史保持原动作语义和意见', saved[0].user === actor.id && saved[0].action === expectedAction && saved[0].type === semantic && saved[0].comment === comment);
        if (index < actors.length - 1) check(scenario.name + '会签尚未全部同意时继续等待剩余人员', status(id) === 'RUNNING' && tasks(id).length === actors.length - index - 1);
      }
      const terminal = action === 'APPROVE' ? 'PASSED' : 'REJECTED';
      check(scenario.name + '-' + action + '旧入口结束状态正确且待办全部收尾', status(id) === terminal && tasks(id).length === 0);
      if (scenario.group) {
        const counters = counter(id); assert.equal(counters.length, 1); const item = counters[0];
        check(scenario.name + '会签人数去重且真实票数准确', item.total === scenario.members.length && item.voted === actors.length
          && item.approved === (action === 'APPROVE' ? actors.length : 0) && item.rejected === (action === 'REJECT' ? 1 : 0) && item.status === terminal);
        if (action === 'REJECT') {
          const monitors = rows("SELECT JSON_OBJECT('task',task_id,'status',status,'action',action,'finished',complete_time IS NOT NULL) FROM wf_task_monitor WHERE tenant_id=100000 AND instance_id=" + sql(id) + ';');
          check(scenario.name + '旧会签未投票人员取消待办并保留取消记录', initial.filter(task => task.user !== actors[0].id).every(task =>
            !history(id).some(item => item.task === task.id) && monitors.filter(item => item.task === task.id).length === 1
            && monitors.some(item => item.task === task.id && item.status === 'COMPLETED' && item.action === 'COUNTERSIGN_CANCEL' && item.finished === true)));
        }
      }
      const persisted = history(id), trace = successful(await api(employee, base + '/instance/' + id + '/trace'), '发起人读取旧流程实际完成轨迹');
      check(scenario.name + '-' + action + '轨迹逐条返回持久历史和人员语义', persisted.length === actors.length && persisted.every(item => trace.historyDetails?.some(detail =>
        detail.historyId === item.id && detail.taskId === item.task && detail.taskType === item.type && String(detail.operatorId) === item.user && detail.action === item.action)));
      traceChecks++;
    }
  };
  const deny = async scenario => {
    const def = await definition(scenario), saved = await draft(def, scenario, 'invalid');
    const unchanged = () => database('SELECT draft_id,lock_version,form_data,node_assignees FROM wf_form_draft WHERE tenant_id=100000 AND draft_id=' + sql(saved.draftId) + ';');
    const before = unchanged(), result = await post(employee, base + '/start', { draftId: saved.draftId, expectedVersion: saved.lockVersion });
    check(scenario.name + '非法变量拒绝整次发起且草稿与流程数量保持', result.status >= 400 && result.status < 500 && result.body?.code !== 200
      && unchanged() === before && database('SELECT COUNT(*) FROM wf_process_instance WHERE tenant_id=100000 AND definition_id=' + sql(def) + ';') === '0');
    deniedStarts++;
    console.log('B1_LEGACY_DENIAL: scenario=' + scenario.name + '; entry=start; status=' + result.status + '; code=' + String(result.body?.code));
  };
  try {
    const starterDept = department('starter', reviewer.id), reviewDept = department('review', top.id);
    database('UPDATE sys_user SET dept_id=' + starterDept + ' WHERE tenant_id=100000 AND user_id=' + starter.id + ';');
    database('UPDATE sys_user SET dept_id=' + reviewDept + ' WHERE tenant_id=100000 AND user_id IN (' + reviewer.id + ',' + top.id + ');');
    const groupRole = role('group', [reviewer, top]), singleRole = role('single', [reviewer]);
    const fields = [{ id: 'note', type: 'TEXT', label: '说明' }, { id: 'numeric', type: 'NUMBER', label: '审批人编号' },
      { id: 'reviewers', type: 'USER_MULTI', label: '审批人员' },
      { id: 'selected', type: 'CHECKBOX_GROUP', label: '旧审批编号选项', options: [reviewer.id, top.id, '0' + reviewer.id, '-1'] }];
    const form = successful(await post(admin, base + '/form/save', { formKey: marker, formName: marker, fieldsJson: JSON.stringify(fields) }), '建立原有控件组成的审批表单');
    formId = form.formId ?? form.id; assert.ok(formId);
    const pair = [reviewer, top], value = pair.map(item => item.id).join(',');
    const primary = [
      { name: 'USER', source: 'USER', value: reviewer.id, members: [reviewer] },
      { name: 'USERS', source: 'USERS', value, group: true, members: pair },
      { name: 'USER_LIST', source: 'USER_LIST', value: top.id + ',' + reviewer.id, group: true, members: [top, reviewer] },
      { name: 'ROLE', source: 'ROLE', value: ' ' + groupRole.toUpperCase() + ', ' + singleRole + ' ', group: true, members: pair },
      { name: 'DEPT', source: 'DEPT', value: reviewDept, group: true, members: pair },
      { name: 'DEPT_MANAGER', source: 'DEPT_MANAGER', members: [reviewer] },
      { name: 'DIRECT_LEADER', source: 'DIRECT_LEADER', members: [reviewer] },
      { name: 'INITIATOR', source: 'INITIATOR', members: [starter] },
      { name: 'VARIABLE_USER', source: 'VARIABLE_USER', value: 'note', data: { note: reviewer.id }, variable: true, members: [reviewer] }
    ];
    for (const scenario of primary) await run(scenario);
    evidence.b1LegacyNineSources = true;
    const variants = [
      { name: 'USER-group', source: 'USER', value, group: true, members: pair },
      { name: 'USERS-first', source: 'USERS', value, members: [reviewer] },
      { name: 'USER_LIST-first', source: 'USER_LIST', value: top.id + ',' + reviewer.id, members: [top] },
      { name: 'ROLE-single', source: 'ROLE', value: singleRole, members: [reviewer] },
      { name: 'DEPT-single', source: 'DEPT', value: starterDept, members: [starter] },
      { name: 'VARIABLE-number', source: 'VARIABLE_USER', value: 'numeric', data: { numeric: Number(reviewer.id) }, variable: true, members: [reviewer] },
      { name: 'VARIABLE-array', source: 'VARIABLE_USER', value: 'reviewers', data: { reviewers: pair.map(item => item.id) }, variable: true, group: true, members: pair },
      { name: 'VARIABLE-dedup', source: 'VARIABLE_USER', value: 'selected', data: { selected: [reviewer.id, '0' + reviewer.id, top.id] }, variable: true, group: true, members: pair }
    ];
    for (const scenario of variants) await run(scenario);
    evidence.b1LegacyVariants = true;
    for (const scenario of [
      { name: 'VARIABLE-invalid-text', value: 'note', data: { note: 'invalid' } },
      { name: 'VARIABLE-fraction', value: 'numeric', data: { numeric: Number(reviewer.id) + 0.5 } },
      { name: 'VARIABLE-single-multiple', value: 'reviewers', data: { reviewers: pair.map(item => item.id) } },
      { name: 'VARIABLE-invalid-member', value: 'selected', data: { selected: [reviewer.id, '-1'] }, group: true }
    ]) await deny({ ...scenario, source: 'VARIABLE_USER' });
    evidence.b1LegacyInvalidVariables = true;
    console.log('B1_LEGACY_ASSIGNEES_ACTUAL: ' + JSON.stringify({ originalSources: primary.map(item => item.source), sourceCount: primary.length,
      variants: variants.length, realStarts: starts, humanCompletions: completions, traceChecks, rejectedStarts: deniedStarts,
      oldModelFieldsOnly: true, roleOverlapDeduplicated: true, legacyUnvotedCancelled: true, variableTypes: ['string', 'number', 'array'], variableArrayDeduplicated: true,
      forcedWorkflowOutcomeWrites: 0, uiVerified: false }));
  } catch (error) { failure = error; }
  finally {
    try {
      const owned = rows("SELECT JSON_OBJECT('id',instance_id) FROM wf_process_instance WHERE tenant_id=100000 AND definition_id IN (SELECT definition_id FROM wf_process_definition WHERE tenant_id=100000 AND process_key LIKE " + sql(marker + '-%') + ');');
      for (const { id } of owned) if (['RUNNING','PAUSED','PENDING','FAILED','WITHDRAWN','TASK_BACK','RESTARTED'].includes(status(id)))
        successful(await post(admin, base + '/instance/terminate', { instanceId: id, reason: marker + '-cleanup' }), '结束自有未完成旧定义流程');
      for (const item of people) database('UPDATE sys_user SET dept_id=' + sql(item.dept) + ' WHERE tenant_id=100000 AND user_id=' + item.id + ';');
      for (const id of roles) {
        database('DELETE FROM sys_user_role WHERE tenant_id=100000 AND role_id=' + id + ';');
        database('DELETE FROM sys_role WHERE tenant_id=100000 AND role_id=' + id + ' AND create_by=' + sql(marker) + ';');
      }
      for (const id of departments) database('DELETE FROM sys_dept WHERE tenant_id=100000 AND dept_id=' + id + ' AND create_by=' + sql(marker) + ';');
      for (const id of definitions) {
        database('DELETE FROM wf_form_draft WHERE tenant_id=100000 AND user_id=' + starter.id + ' AND definition_id=' + sql(id) + ';');
        database("UPDATE wf_process_definition SET status='ARCHIVED',deleted=0 WHERE tenant_id=100000 AND definition_id=" + sql(id) + ' AND process_key LIKE ' + sql(marker + '-%') + ';');
      }
      check('旧定义验证原人员部门角色授权及代理配置完整恢复', identities() === original.identities && permissions() === original.permissions && agents() === original.agents
        && database('SELECT COUNT(*) FROM sys_dept WHERE create_by=' + sql(marker) + ';SELECT COUNT(*) FROM sys_role WHERE create_by=' + sql(marker) + ';').split(/\r?\n/).every(value => value === '0'));
      check('旧定义自有样本归档且无活动流程或草稿遗留', owned.every(item => ['PASSED','REJECTED','TERMINATED'].includes(status(item.id)) && tasks(item.id).length === 0)
        && database("SELECT COUNT(*) FROM wf_process_definition WHERE tenant_id=100000 AND process_key LIKE " + sql(marker + '-%') + " AND status<>'ARCHIVED';") === '0'
        && database('SELECT COUNT(*) FROM wf_form_draft WHERE tenant_id=100000 AND title LIKE ' + sql(marker + '-%') + ';') === '0');
      evidence.b1LegacyRestoration = true;
    } catch (error) { failure = new AggregateError([failure, error].filter(Boolean), 'B1 legacy verification or restoration failed'); }
  }
  if (failure) throw failure;
}
