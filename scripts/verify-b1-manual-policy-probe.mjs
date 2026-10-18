import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Diagnostic comparison only. A recorded policy mismatch is not business acceptance.
export async function verifyB1ManualPolicyProbe({ admin, employee, api, successful, session, database, check, caseTag, secrets, evidence }) {
  const marker = 'B1MP' + caseTag, base = '/workflow/wf', definitions = [], instances = [], observations = [];
  const sql = value => 'CONVERT(0x' + Buffer.from(String(value)).toString('hex') + ' USING utf8mb4) COLLATE utf8mb4_unicode_ci';
  const rows = query => database(query).split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
  const post = (page, url, body = {}) => api(page, url, { method: 'POST', body });
  const manager = await session('g_holiday_manager');
  const token = await manager.evaluate(async () => (await import('/src/utils/authStorage.ts')).getAuthToken());
  assert.ok(token); secrets.add(token.replace(/^Bearer /, ''));
  const userId = name => database("SELECT user_id FROM sys_user WHERE tenant_id=100000 AND deleted=0 AND status='0' AND user_name=" + sql(name) + ';');
  const starter = userId('g_holiday_employee'), reviewer = userId('g_holiday_manager');
  assert.match(starter, /^[1-9][0-9]*$/); assert.match(reviewer, /^[1-9][0-9]*$/);
  const grants = () => database('SELECT tenant_id,role_id,menu_id FROM sys_role_menu ORDER BY tenant_id,role_id,menu_id;SELECT tenant_id,user_id,role_id FROM sys_user_role ORDER BY tenant_id,user_id,role_id;');
  const originalGrants = grants();
  const tasks = id => rows("SELECT JSON_OBJECT('id',task_id,'node',node_key,'user',CAST(assignee AS CHAR),'type',task_type) FROM wf_task WHERE tenant_id=100000 AND instance_id=" + sql(id) + ' ORDER BY task_id;');
  const status = id => database('SELECT status FROM wf_process_instance WHERE tenant_id=100000 AND instance_id=' + sql(id) + ';');
  const histories = id => rows("SELECT JSON_OBJECT('task',task_id,'node',node_key,'type',task_type,'action',action) FROM wf_task_history WHERE tenant_id=100000 AND instance_id=" + sql(id) + ' ORDER BY history_id;');
  let formId, failure, completions = 0;
  const complete = async (page, task) => { successful(await post(page, base + '/complete', { taskId: task.id, action: 'APPROVE', comment: marker }), '真实完成对照样本任务'); completions++; };
  try {
    const form = successful(await post(admin, base + '/form/save', { formKey: marker, formName: marker, fieldsJson: '[{"id":"note","type":"TEXT","label":"说明"}]' }), '建立对照表单');
    formId = form.formId ?? form.id; assert.ok(formId);
    for (const type of ['APPROVAL', 'MANUAL']) {
      const nodes = [{ id: 'start', type: 'START', title: '发起' },
        { id: 'subject', type, title: '本人任务', approverType: 'INITIATOR', approveSelf: 'AUTO_SKIP', props: { taskDescription: '核对交接清单' } },
        { id: 'review', type: 'APPROVAL', title: '后续确认', approverType: 'USER', approverValue: reviewer, approveSelf: 'ALLOW' },
        { id: 'end', type: 'END', title: '结束' }];
      const model = { nodes, edges: nodes.slice(1).map((node, index) => ({ id: 'edge' + index, source: nodes[index].id, target: node.id })) };
      const result = successful(await post(admin, base + '/definition/save', { processKey: marker + '_' + type, processName: marker + '_' + type, formId,
        modelJson: JSON.stringify(model), startPermissionType: 'ALL', startPermissionValue: '[]' }), '保存对照定义');
      const definitionId = result.definitionId ?? result.id; assert.ok(definitionId); definitions.push(definitionId);
      successful(await post(admin, base + '/definition/deploy/' + definitionId), '发布对照定义');
      const stored = JSON.parse(database('SELECT model_json FROM wf_process_definition WHERE tenant_id=100000 AND definition_id=' + sql(definitionId) + ';'));
      check(type + '已发布定义明确保存本人自动跳过配置', stored.nodes.find(node => node.id === 'subject').approveSelf === 'AUTO_SKIP');
      const context = successful(await api(employee, base + '/draft/context/' + definitionId), '读取本人发起上下文');
      const draft = successful(await post(employee, base + '/draft', { definitionId, expectedVersion: 0, loadedContextHash: context.contextHash, title: marker + '_' + type, formData: { note: marker }, nodeAssignees: {} }), '保存本人对照草稿');
      const started = successful(await post(employee, base + '/start', { draftId: draft.draftId, expectedVersion: draft.lockVersion }), '真实发起对照流程');
      const id = started.instanceId ?? started.processInstanceId; assert.ok(id); instances.push(id);
      const pending = tasks(id), history = histories(id), selfTask = pending.find(task => task.node === 'subject');
      const automatic = history.some(item => item.node === 'subject' && item.type === 'AUTO_SKIP');
      const observation = { nodeType: type, definitionId, instanceId: id, configuredPolicy: 'AUTO_SKIP', selfTaskCreated: Boolean(selfTask),
        autoSkipHistory: automatic, followupCreated: pending.some(task => task.node === 'review'), policyApplied: !selfTask && automatic };
      observations.push(observation);
      if (type === 'APPROVAL') check('审批节点对照组实际跳过本人并建立后续任务', observation.policyApplied && observation.followupCreated);
      else check('人工任务观察对应真实本人待办或自动跳过记录', selfTask ? selfTask.user === starter && selfTask.type === 'MANUAL' && !automatic && !observation.followupCreated : observation.policyApplied && observation.followupCreated);
      const trace = successful(await api(employee, base + '/instance/' + id + '/trace'), '读取本人对照轨迹');
      check(type + '对照轨迹与实际任务或自动历史一致', selfTask
        ? trace.activeDetails.some(item => item.taskId === selfTask.id && item.taskType === 'MANUAL')
        : trace.historyDetails.some(item => item.nodeKey === 'subject' && item.taskType === 'AUTO_SKIP'));
      if (selfTask) await complete(employee, selfTask);
      const followup = tasks(id).filter(task => task.node === 'review' && task.user === reviewer); assert.equal(followup.length, 1);
      await complete(manager, followup[0]);
      check(type + '对照流程通过真实处理完成且无遗留待办', status(id) === 'PASSED' && tasks(id).length === 0);
    }
    const directory = path.join(path.dirname(path.dirname(fileURLToPath(import.meta.url))), '.cloudflow-runtime/full-prd-20260915/approved-runtime', 'b1-manual-policy-' + caseTag);
    await fs.mkdir(directory, { recursive: true });
    await fs.writeFile(path.join(directory, 'observations.json'), JSON.stringify(observations, null, 2) + '\n', { flag: 'wx' });
    console.log('B1_MANUAL_POLICY_PROBE: ' + JSON.stringify({ observations: observations.length, realStarts: instances.length, humanCompletions: completions,
      approvalSelfPolicyApplied: observations[0].policyApplied, manualSelfPolicyApplied: observations[1].policyApplied, businessAcceptanceComplete: false, forcedWorkflowOutcomeWrites: 0 }));
    evidence.b1ManualPolicyProbe = true;
  } catch (error) { failure = error; }
  finally {
    try {
      for (const id of instances) if (!['PASSED', 'REJECTED', 'TERMINATED'].includes(status(id))) successful(await post(admin, base + '/instance/terminate', { instanceId: id, reason: marker + '-cleanup' }), '结束自有对照样本');
      for (const id of definitions) {
        database('DELETE FROM wf_form_draft WHERE tenant_id=100000 AND user_id=' + starter + ' AND definition_id=' + sql(id) + ';');
        database("UPDATE wf_process_definition SET status='ARCHIVED' WHERE tenant_id=100000 AND definition_id=" + sql(id) + ' AND process_key LIKE ' + sql(marker + '_%') + ';');
      }
      check('对照样本全部收尾且原权限保持', grants() === originalGrants && instances.every(id => tasks(id).length === 0));
      evidence.b1ManualPolicyRestoration = true;
    } catch (error) { failure = new AggregateError([failure, error].filter(Boolean), 'Manual policy probe cleanup failed'); }
  }
  if (failure) throw failure;
}
