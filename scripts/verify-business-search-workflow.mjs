import assert from 'node:assert/strict';

export async function verifyBusinessSearchWorkflow(context) {
  const { actor, person, peer, read, byType, api, successful, check, caseTag, database, literal, evidence } = context;
  const definitionId = `h5s_scope_${caseTag}`;
  const keyword = `关联${caseTag}`;
  const model = {
    nodes: [{ id: 'root', type: 'START', title: '查询前置' },
      { id: 'review', type: 'APPROVAL', title: '本人或有效代理', allowAgent: true, approverType: 'USERS', approverValue: peer.userId },
      { id: 'end', type: 'END', title: '结束' }],
    edges: [{ id: 'start_review', source: 'root', target: 'review' }, { id: 'review_end', source: 'review', target: 'end' }],
  };
  database(`INSERT INTO wf_process_definition (definition_id,tenant_id,process_name,process_key,model_json,status,dept_id,create_by)
    VALUES (${literal(definitionId)},100000,${literal(keyword)},${literal(definitionId)},${literal(JSON.stringify(model))},'PUBLISHED',100,'business-search-fixture');`);
  const instances = {};
  const insertInstance = (kind, status = 'RUNNING') => {
    const identifier = `h5s_${caseTag}_${kind}`;
    instances[kind] = identifier;
    database(`INSERT INTO wf_process_instance (instance_id,tenant_id,definition_id,process_def_key,business_key,title,start_user_id,
      start_user_name,status,start_time,variables,process_no,dept_id,create_by)
      VALUES (${literal(identifier)},100000,${literal(definitionId)},${literal(definitionId)},${literal(identifier)},${literal(`${keyword}_${kind}`)},
      ${peer.userId},${literal(peer.username)},${literal(status)},NOW(),JSON_OBJECT(),${literal(identifier)},100,'business-search-fixture');`);
    return identifier;
  };
  const task = (kind, assignee, settingId = null, proxyUserId = null) => {
    const taskId = `task_${caseTag}_${kind}`;
    database(`INSERT INTO wf_task (task_id,tenant_id,instance_id,node_key,node_name,assignee,status,agent_setting_id,proxy_user_id)
      VALUES (${literal(taskId)},100000,${literal(instances[kind])},'review','本人或有效代理',${assignee},'TODO',
      ${settingId ? literal(settingId) : 'NULL'},${proxyUserId ?? 'NULL'});`);
    return taskId;
  };
  insertInstance('assignee');
  task('assignee', person.userId);
  for (const kind of ['history', 'represented']) {
    insertInstance(kind, 'COMPLETED');
    database(`INSERT INTO wf_task_history (history_id,tenant_id,task_id,instance_id,node_name,node_key,operator_id,on_behalf_of_user_id,action)
      VALUES (${literal(`history_${caseTag}_${kind}`)},100000,${literal(`old_${caseTag}_${kind}`)},${literal(instances[kind])},'历史办理','review',
      ${kind === 'history' ? person.userId : peer.userId},${kind === 'represented' ? person.userId : 'NULL'},'APPROVED');`);
  }
  insertInstance('copy');
  database(`INSERT INTO wf_process_copy (tenant_id,instance_id,process_def_key,title,node_id,node_name,user_id)
    VALUES (100000,${literal(instances.copy)},${literal(definitionId)},${literal(`${keyword}_copy`)},'review','抄送',${person.userId});`);
  const settingId = `agent_${caseTag}`;
  database(`INSERT INTO wf_agent_setting (setting_id,tenant_id,principal_user_id,agent_user_id,agent_mode,definition_ids,start_time,end_time,status)
    VALUES (${literal(settingId)},100000,${peer.userId},${person.userId},'AGENT',JSON_ARRAY(${literal(definitionId)}),
    DATE_SUB(NOW(),INTERVAL 1 DAY),DATE_ADD(NOW(),INTERVAL 1 DAY),'ACTIVE');`);
  for (const kind of ['agent', 'terminated']) {
    insertInstance(kind, kind === 'terminated' ? 'COMPLETED' : 'RUNNING');
    const taskId = task(kind, peer.userId, settingId, person.userId);
    database(`INSERT INTO wf_task_delegation (delegation_id,tenant_id,task_id,instance_id,from_user_id,to_user_id,delegation_type,agent_mode,setting_id,status,start_time,end_time)
      VALUES (${literal(`relation_${caseTag}_${kind}`)},100000,${literal(taskId)},${literal(instances[kind])},${peer.userId},${person.userId},
      'PROXY','AGENT',${literal(settingId)},'ACTIVE',DATE_SUB(NOW(),INTERVAL 1 DAY),DATE_ADD(NOW(),INTERVAL 1 DAY));`);
  }
  insertInstance('forged');
  task('forged', peer.userId, null, person.userId);
  insertInstance('unrelated');
  const expected = ['assignee', 'history', 'represented', 'copy', 'agent'];
  const result = byType(await read(actor, keyword, 10)).WORKFLOW_INSTANCE;
  check('流程搜索包含当前办理、历史办理、被代理办理、抄送和有效代理五种原读取关系', result.state === 'AVAILABLE'
    && JSON.stringify(result.items.map(item => item.id).sort()) === JSON.stringify(expected.map(kind => instances[kind]).sort()) && !result.hasMore);
  for (const kind of expected) {
    const detail = successful(await api(actor, `/workflow/wf/instance/${instances[kind]}`), `${kind}原流程详情权限`);
    check(`${kind}搜索命中仍可通过原流程详情鉴权`, detail.instanceId === instances[kind]);
  }
  for (const kind of ['terminated', 'forged', 'unrelated']) {
    const result = await api(actor, `/workflow/wf/instance/${instances[kind]}`);
    check(`${kind}不能凭过期关系或代理编号获得流程详情`, [400, 403, 404].includes(result.status) && result.body?.code !== 200);
  }
  database(`UPDATE wf_agent_setting SET end_time=DATE_SUB(NOW(),INTERVAL 1 MINUTE) WHERE tenant_id=100000 AND setting_id=${literal(settingId)};`);
  const expired = byType(await read(actor, keyword, 10)).WORKFLOW_INSTANCE;
  check('代理到期后即使任务仍保留旧代理编号，搜索也立即移除该实例', expired.state === 'AVAILABLE'
    && JSON.stringify(expired.items.map(item => item.id).sort()) === JSON.stringify(expected.filter(kind => kind !== 'agent').map(kind => instances[kind]).sort()));
  const expiredDetail = await api(actor, `/workflow/wf/instance/${instances.agent}`);
  check('到期代理原详情同时拒绝访问', [400, 403, 404].includes(expiredDetail.status) && expiredDetail.body?.code !== 200);
  const collation = database("SELECT CONCAT(table_name,':',collation_name) FROM information_schema.columns WHERE table_schema='cloud_flow_db' AND table_name IN ('wf_process_instance','wf_process_copy') AND column_name='instance_id' ORDER BY table_name;");
  assert.equal(collation.split(/\r?\n/).length, 2);
  console.log(`H5_SEARCH_WORKFLOW_COLLATIONS: ${collation.replaceAll(/\r?\n/g, ';')}; copy_read=true; definition_fixture_only=true; approval_not_claimed=true`);
  evidence.workflowScope = true;
}
