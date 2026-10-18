import assert from 'node:assert/strict';
import { isDeepStrictEqual } from 'node:util';
import fs from 'node:fs/promises';
import path from 'node:path';

export async function verifyC3ActionReturns({ sessions, api, success, check, database, sqlText, fixture, saveFixture, marker, evidence, secrets }) {
  const output = path.join(evidence, `c3-action-returns-${fixture.runId}`);
  await fs.mkdir(output);
  const base = '/workflow/wf', settingsPath = '/workflow/agent-setting', actionPath = '/workflow/enhance/task/agent-return';
  const cases = [], flows = [], settings = [];
  let stage = 'prepare', failure;
  const decode = value => typeof value === 'string' ? JSON.parse(value) : value;
  const waitFor = async (read, accept, message) => {
    const deadline = Date.now() + 30000;
    do { const value = await read(); if (accept(value)) return value; await new Promise(resolve => setTimeout(resolve, 200)); } while (Date.now() < deadline);
    throw new Error(message);
  };
  const readTask = flow => {
    const line = database(`SELECT JSON_OBJECT('taskId',task_id,'assignee',CAST(assignee AS CHAR),'proxy',CAST(proxy_user_id AS CHAR),'setting',agent_setting_id,'version',lock_version,'status',status) FROM wf_task WHERE tenant_id=100000 AND instance_id=${sqlText(flow.instanceId)} AND node_key='approval'`);
    return line ? JSON.parse(line) : null;
  };
  const deny = (label, response, statuses = [403]) => {
    check(label, statuses.includes(response.status) && response.body?.code !== 200 && !response.body?.data);
    cases.push({ label, status: response.status, code: response.body?.code });
  };
  const sensitiveFields = new Set(['variables', 'formData', 'formDefinition', 'formSchema', 'fieldsJson', 'formDataSnapshot', 'variablesChanged']);
  const hasProtectedData = value => value != null && typeof value === 'object' && Object.entries(value).some(([key, child]) =>
    sensitiveFields.has(key) && child != null || hasProtectedData(child));
  const read = async (flow, actor, phase, task = false) => {
    const label = `c3_action_${flow.mode}_${actor}_${phase}`;
    const response = await api(actor, task ? `${base}/todo/${flow.taskId}` : `${base}/instance/${flow.instanceId}`);
    const data = success(response, label + '_read'), values = decode(data.variables);
    check(label + '_nonempty_visible_data', values.note === flow.values.note && values.items.length === 2 && values.items.every((row, index) => row.note === flow.values.items[index].note));
    const restricted = actor !== 'admin';
    check(label + '_private_fields', restricted ? !Object.hasOwn(values, 'privateNote') && values.items.every(row => !Object.hasOwn(row, 'amount'))
      : values.privateNote === flow.values.privateNote && values.items.every((row, index) => row.amount === flow.values.items[index].amount));
    check(label + '_private_definition', data.formDefinition?.version === flow.formVersion && (!restricted || !JSON.stringify(data.formDefinition).includes('privateNote') && !JSON.stringify(data.formDefinition).includes('受限金额')));
    cases.push({ label, status: response.status, role: actor, phase, formVersion: data.formDefinition.version, restricted });
  };
  try {
    for (const actor of ['employee', 'peer']) check('c3_action_agent_permissions_' + actor, ['mine', 'save', 'remove', 'return', 'assist'].every(action => sessions[actor].identity.permissions.includes('workflow:agent:' + action)));
    const name = marker + '-action';
    const fields = [{ id: 'note', type: 'TEXT', label: '公开说明' }, { id: 'privateNote', type: 'TEXT', label: '内部编号' },
      { id: 'items', type: 'SUB_TABLE', label: '明细', columns: [{ id: 'note', type: 'TEXT', label: '明细说明' }, { id: 'amount', type: 'AMOUNT', label: '受限金额', precision: 2 }] }];
    const form = success(await api('admin', base + '/form/save', { method: 'POST', body: { formKey: name, formName: name, fieldsJson: JSON.stringify(fields) } }), 'c3_action_form_saved');
    const formId = form.formId || form.id; fixture.forms.push(formId); saveFixture();
    for (const mode of ['AGENT', 'AGENT_ASSIST']) {
      const processKey = name + '-' + mode.toLowerCase();
      const graph = { nodes: [{ id: 'start', type: 'START', title: '发起' }, { id: 'approval', type: 'APPROVAL', title: mode, approverType: 'USER', approverValue: sessions.peer.account.userId, allowEdit: true, allowAgent: true }, { id: 'end', type: 'END', title: '完成' }], edges: [{ source: 'start', target: 'approval' }, { source: 'approval', target: 'end' }] };
      const definition = success(await api('admin', base + '/definition/save', { method: 'POST', body: { processKey, processName: processKey, formId, modelJson: JSON.stringify(graph), startPermissionType: 'ALL', startPermissionValue: '[]' } }), 'c3_action_definition_' + mode);
      const definitionId = definition.definitionId || definition.id; fixture.definitions.push(definitionId); saveFixture();
      success(await api('admin', `${base}/definition/${definitionId}/field-permissions`, { method: 'PUT', body: ['privateNote', 'items.amount'].map(fieldId => ({ nodeKey: 'approval', fieldId, visibleFlag: false, editableFlag: false, requiredFlag: false })) }), 'c3_action_permissions_' + mode);
      success(await api('admin', `${base}/definition/deploy/${definitionId}`, { method: 'POST' }), 'c3_action_publish_' + mode);
      flows.push({ mode, definitionId, processKey, values: { note: processKey, privateNote: processKey + '-private', items: [{ _rowId: 'r1', note: '第一行', amount: '12.34' }, { _rowId: 'r2', note: '第二行', amount: '56.78' }] } });
    }
    let currentForm = form;
    for (const flow of flows) {
      stage = 'setting-' + flow.mode; secrets.add(flow.values.privateNote);
      const window = JSON.parse(database("SELECT JSON_OBJECT('startTime',DATE_FORMAT(DATE_SUB(NOW(),INTERVAL 1 MINUTE),'%Y-%m-%d %H:%i:%s'),'endTime',DATE_FORMAT(DATE_ADD(NOW(),INTERVAL 1 HOUR),'%Y-%m-%d %H:%i:%s'))"));
      const setting = success(await api('peer', settingsPath, { method: 'POST', body: { agentUserId: sessions.employee.account.userId, agentMode: flow.mode, definitionIds: [flow.definitionId], ...window, reason: flow.processKey } }), 'c3_action_setting_' + flow.mode);
      settings.push(setting); flow.settingId = setting.settingId; fixture.agentSettings ??= []; fixture.agentSettings.push(setting.settingId); saveFixture();
      check('c3_action_setting_active_' + flow.mode, setting.status === 'ACTIVE' && setting.agentMode === flow.mode);
      const started = success(await api('admin', base + '/start', { method: 'POST', body: { processDefKey: flow.processKey, businessKey: flow.processKey, variables: flow.values } }), 'c3_action_start_' + flow.mode);
      flow.instanceId = started.instanceId || started.processInstanceId; fixture.instances.push(flow.instanceId); saveFixture();
      const task = await waitFor(() => readTask(flow), value => value?.proxy === sessions.employee.account.userId, 'Real proxy assignment missing');
      flow.taskId = task.taskId;
      flow.formVersion = currentForm.version;
      check('c3_action_real_binding_' + flow.mode, task.assignee === sessions.peer.account.userId && task.setting === setting.settingId && task.status === 'TODO');
      check('c3_action_pinned_form_' + flow.mode, database(`SELECT form_version FROM wf_process_instance WHERE tenant_id=100000 AND instance_id=${sqlText(flow.instanceId)}`) === String(flow.formVersion));
      // Instances freeze the form available when started. Revise only after that freeze has occurred.
      currentForm = success(await api('admin', base + '/form/save', { method: 'POST', body: { formId, versionLock: currentForm.versionLock, formName: name,
        fieldsJson: JSON.stringify([...fields, { id: 'newField', type: 'TEXT', label: '新版字段' + flow.formVersion }]) } }), 'c3_action_form_revised_' + flow.mode);
      check('c3_action_newer_form_preserves_pinned_' + flow.mode, currentForm.version === flow.formVersion + 1
        && database(`SELECT form_version FROM wf_process_instance WHERE tenant_id=100000 AND instance_id=${sqlText(flow.instanceId)}`) === String(flow.formVersion));
      await read(flow, 'employee', 'before', true); await read(flow, 'employee', 'instance_before'); await read(flow, 'peer', 'before', true); await read(flow, 'admin', 'before');
      stage = 'return-' + flow.mode;
      const body = { taskId: task.taskId, version: task.version, reason: '本人归还原负责人' };
      for (const actor of ['peer', 'foreign']) deny('c3_action_invalid_return_' + flow.mode + '_' + actor, await api(actor, actionPath, { method: 'POST', body }));
      check('c3_action_denials_preserve_binding_' + flow.mode, isDeepStrictEqual(readTask(flow), task));
      const response = await api('employee', actionPath, { method: 'POST', body });
      const returned = success(response, 'c3_action_return_' + flow.mode);
      // The fixture stores IDs as text; WfTask.assignee is a numeric Long on the wire.
      const binding = { task: returned.taskId === task.taskId, instance: returned.instanceId === flow.instanceId,
        assignee: (typeof returned.assignee === 'string' || Number.isSafeInteger(returned.assignee)) && String(returned.assignee) === sessions.peer.account.userId,
        proxyCleared: returned.proxyUserId == null, settingCleared: returned.agentSettingId == null,
        modeCleared: returned.agentMode == null, todo: returned.status === 'TODO', versionAdvanced: returned.version === task.version + 1 };
      await fs.writeFile(path.join(output, 'response-binding-' + flow.mode + '.json'), JSON.stringify({ binding, assigneeType: typeof returned.assignee }, null, 2));
      check('c3_action_response_binding_' + flow.mode, Object.values(binding).every(Boolean));
      check('c3_action_response_has_no_form_payload_' + flow.mode, !hasProtectedData(returned) && !JSON.stringify(returned).includes(flow.values.privateNote));
      cases.push({ label: 'return_response', mode: flow.mode, status: response.status, properties: Object.keys(returned), protectedPayload: false, version: returned.version });
      const remaining = readTask(flow);
      check('c3_action_return_persisted_' + flow.mode, remaining.assignee === task.assignee && remaining.proxy === null && remaining.setting === null && remaining.version === returned.version && remaining.status === 'TODO');
      const histories = () => database(`SELECT COUNT(*) FROM wf_task_history WHERE tenant_id=100000 AND task_id=${sqlText(task.taskId)} AND action='AGENT_RETURN' AND operator_id=${sqlText(sessions.employee.account.userId)} AND on_behalf_of_user_id=${sqlText(task.assignee)}`);
      check('c3_action_return_history_' + flow.mode, histories() === '1');
      deny('c3_action_repeat_return_' + flow.mode, await api('employee', actionPath, { method: 'POST', body: { ...body, version: returned.version } }));
      check('c3_action_no_duplicate_history_' + flow.mode, histories() === '1' && isDeepStrictEqual(readTask(flow), remaining));
      deny('c3_action_returned_agent_cannot_complete_' + flow.mode, await api('employee', base + '/complete', { method: 'POST', body: { taskId: task.taskId, action: 'APPROVE', variables: {} } }));
      deny('c3_action_returned_agent_cannot_read_todo_' + flow.mode, await api('employee', `${base}/todo/${task.taskId}`));
      // A recorded former proxy remains a historical participant; this read must still apply the original node's restrictions.
      await read(flow, 'employee', 'after_return'); await read(flow, 'peer', 'after_return', true);
      stage = 'complete-' + flow.mode;
      success(await api('peer', base + '/complete', { method: 'POST', body: { taskId: task.taskId, action: 'APPROVE', variables: {}, comment: '原负责人完成' } }), 'c3_action_principal_completes_' + flow.mode);
      await waitFor(() => database(`SELECT status FROM wf_process_instance WHERE tenant_id=100000 AND instance_id=${sqlText(flow.instanceId)}`), value => value === 'PASSED', 'Action fixture did not finish');
      await read(flow, 'employee', 'done'); await read(flow, 'peer', 'done'); await read(flow, 'admin', 'done');
      const stored = JSON.parse(database(`SELECT variables FROM wf_process_instance WHERE tenant_id=100000 AND instance_id=${sqlText(flow.instanceId)}`));
      check('c3_action_all_original_values_retained_' + flow.mode, Object.entries(flow.values).every(([key, value]) => isDeepStrictEqual(stored[key], value)));
    }
    stage = 'complete';
  } catch (error) {
    failure = error; let message = String(error.message).split('\n')[0]; for (const secret of secrets) message = message.split(secret).join('[REDACTED]');
    await fs.writeFile(path.join(output, 'failure-stage.json'), JSON.stringify({ stage, name: error.name, message }));
  } finally {
    for (const setting of settings) {
      try {
        const current = success(await api('peer', `${settingsPath}/mine/${setting.settingId}`), 'c3_action_current_owned_setting');
        success(await api('peer', `${settingsPath}/${setting.settingId}?version=${current.version}`, { method: 'DELETE' }), 'c3_action_owned_setting_disabled', false);
        const retired = success(await api('peer', `${settingsPath}/mine/${setting.settingId}`), 'c3_action_retired_setting_read');
        check('c3_action_retirement_confirmed', retired.status === 'DISABLED'); setting.retired = true;
      } catch { failure ??= new Error('Owned proxy setting retirement failed'); }
    }
    await fs.writeFile(path.join(output, 'result.json'), JSON.stringify({ passed: !failure, stage, cases, flows: flows.map(({ values, ...flow }) => flow),
      settings: settings.map(({ settingId, agentMode, retired }) => ({ settingId, agentMode, retired: retired === true })), databaseWrites: 0, redisDeletes: 0, fabricatedResponses: 0 }, null, 2));
    console.log(`C3_ACTION_RETURNS: flows=${flows.length}; cases=${cases.length}; settings_retired=${settings.filter(setting => setting.retired).length}; passed=${!failure}`);
  }
  if (failure) throw new Error('C3 action returns failed; see safe failure-stage.json');
}
