import assert from 'node:assert/strict';
import { createOwnedRecoveryJournal } from './runtime-checks/owned-recovery-journal.mjs';
import { submitSettlementWithLostResponse, approveSettlementInUi } from './verify-hr-settlement-approval-ui.mjs';
import { prepareSettlementFundsAsset, verifySettlementFunds } from './verify-hr-settlement-funds-real.mjs';

export async function verifySettlementApproval(context) {
  const expectedRounds = process.argv.includes('--hr-settlement-reversal-focused') ? 1 : 5;
  const { admin, hr, finance, employee, api, successful, database, check, marker, employeeId, userId, application, policyId, slipId, evidence } = context;
  const root = '/hr/settlement'; const key = `${marker}_approval`;
  const literal = value => `CONVERT(UNHEX('${Buffer.from(String(value)).toString('hex')}') USING utf8mb4)`;
  const rows = sql => database(sql).split(/\r?\n/).filter(Boolean).map(value => JSON.parse(value));
  const post = (actor, endpoint, body) => api(actor, endpoint, { method: 'POST', body });
  const reject = (result, label) => check(`${label} HTTP=${result.status} code=${result.body?.code}`, [400, 401, 403, 404, 409, 422].includes(result.status) && result.body?.code !== 200);
  const waitFor = async (read, accepted, label) => {
    const until = Date.now() + 90000;
    do { const result = await read(); if (accepted(result)) return result; await new Promise(resolve => setTimeout(resolve, 500)); } while (Date.now() < until);
    throw new Error(label);
  };
  const configKey = 'sys.hr.settlement.processKey'; const configRoot = '/auth/system/config';
  const configured = successful(await api(admin, `${configRoot}/list?configKey=${configKey}&pageSize=100`), '读取原结算流程配置').records.find(row => row.configKey === configKey);
  let changed = false; let id; let removedFinanceBindings = []; let fundsAssetId;
  const roleRows = "SELECT CONCAT(tenant_id,':',user_id,':',role_id) FROM sys_user_role ORDER BY tenant_id,user_id,role_id;";
  const rolesBefore = database(roleRows);
  const journal = createOwnedRecoveryJournal(context.directory, `${key}-settlement`, { key, configKey, configured: configured ?? null, rolesBefore, existingSettlementId: context.existingSettlementId ?? null });
  const state = () => rows(`SELECT JSON_OBJECT('instance',instance_id,'approval',approval_status,'status',status,'version',version,
    'revision',JSON_EXTRACT(calculation_snapshot,'$.workflow.revision'),'payment',CAST(payment_request_id AS CHAR)) FROM hr_final_settlement WHERE tenant_id=100000 AND settlement_id=${id};`)[0];
  const read = async () => successful(await api(hr, `${root}/${id}`), '读取真实结算审批状态');
  const calculate = async () => successful(await post(hr, `${root}/${id}/calculate`, { version: (await read()).version }), '重新核对真实结算来源');
  const submit = async () => successful(await post(hr, `${root}/${id}/submit`, { version: (await read()).version }), '人事实际提交独立财务复核');
  const waitState = status => waitFor(state, row => row.approval === status, `结算状态未变为${status}`);
  const taskFor = async () => {
    const current = await waitFor(state, row => Boolean(row.instance), '结算未绑定实际审批实例');
    const tasks = await waitFor(() => rows(`SELECT JSON_OBJECT('id',task_id,'assignee',CAST(assignee AS CHAR),'node',node_key)
      FROM wf_task WHERE tenant_id=100000 AND instance_id=${literal(current.instance)} AND status='TODO';`), value => value.length > 0, '未生成实际财务待办');
    const financeId = await finance.evaluate(async () => String((await (await import('/src/services/api/auth.ts')).getInfo()).userId));
    const task = tasks.find(value => value.assignee === financeId); assert.ok(task, '独立财务取得实际待办');
    const hrId = await hr.evaluate(async () => String((await (await import('/src/services/api/auth.ts')).getInfo()).userId));
    check('所有待办均为独立财务且排除提交人与离职本人', tasks.every(value => value.node === 'finance' && value.assignee !== hrId && value.assignee !== userId));
    return task;
  };
  const observe = async stage => { if (context.observeSources) await context.observeSources(stage, { id, row: await read() }); };
  const unfrozen = async () => {
    check('结束原审批后释放工资占位', database(`SELECT COUNT(*) FROM hr_salary_slip WHERE id=${slipId} AND tenant_id=100000 AND reserved_settlement_id IS NULL;`) === '1');
    await observe('released');
  };
  try {
    const financeId = await finance.evaluate(async () => String((await (await import('/src/services/api/auth.ts')).getInfo()).userId));
    assert.match(financeId, /^[1-9]\d*$/);
    removedFinanceBindings = rows(`SELECT JSON_OBJECT('userId',CAST(binding.user_id AS CHAR),'roleId',CAST(binding.role_id AS CHAR))
      FROM sys_user_role binding JOIN sys_role role_row ON role_row.tenant_id=binding.tenant_id AND role_row.role_id=binding.role_id
      JOIN sys_user user_row ON user_row.tenant_id=binding.tenant_id AND user_row.user_id=binding.user_id
      WHERE binding.tenant_id=100000 AND role_row.role_key='finance' AND user_row.status='0' AND user_row.deleted=0 AND user_row.user_id!=${financeId};`);
    journal('remove-finance-bindings', { removedFinanceBindings });
    for (const binding of removedFinanceBindings) {
      assert.match(binding.userId, /^[1-9]\d*$/); assert.match(binding.roleId, /^[1-9]\d*$/);
      database(`DELETE FROM sys_user_role WHERE tenant_id=100000 AND user_id=${binding.userId} AND role_id=${binding.roleId};`);
    }
    const model = { nodes: [{ id: 'start', type: 'START', title: '人事提交' },
      { id: 'finance', type: 'APPROVAL', title: '独立财务复核', approverType: 'VARIABLE_USER', approverValue: 'financeApproverIds', signType: 'ANY', allowDelegate: false, allowAddSign: false },
      { id: 'end', type: 'END', title: '复核完成' }], edges: [{ id: 'first', source: 'start', target: 'finance' }, { id: 'second', source: 'finance', target: 'end' }] };
    database(`INSERT INTO wf_process_definition(definition_id,tenant_id,process_name,process_key,version,model_json,status,is_latest,deleted)
      VALUES(${literal(key)},100000,${literal(key)},${literal(key)},1,${literal(JSON.stringify(model))},'PUBLISHED',1,0);`);
    successful(await api(admin, configRoot, { method: configured ? 'PUT' : 'POST', body: { ...(configured || {}), configKey, configName: key, configValue: key, configType: 'N', configScope: '1' } }), '配置隔离独立财务流程'); changed = true;
    id = context.existingSettlementId || String(successful(await post(hr, root, { lifecycleApplicationId: application('approval'), remark: key }), '人事建立审批测试结算')); assert.match(id, /^[1-9]\d*$/);
    let current = await read();
    if (!context.existingSettlementId) reject(await post(hr, `${root}/${id}/submit`, { version: current.version }), '缺核定和计算时不能提交');
    successful(await api(hr, `${root}/${id}`, { method: 'PUT', body: { version: current.version, ruleId: policyId,
      sampling: { months: ['2026-01'], averagingMonths: '0.5', reason: '按已批准测试政策逐单核定' }, remark: key } }), '真实核定本单政策与取样');
    current = await calculate(); check('结算真实来源齐备', current.missingRequirements.length === 0);
    await observe('calculated');
    if (context.fundsMode) { fundsAssetId = await prepareSettlementFundsAsset({ ...context, id, current }); current = await read(); }
    reject(await post(finance, `${root}/${id}/submit`, { version: current.version }), '财务不得代人事提交');
    reject(await post(employee, `${root}/${id}/submit`, { version: current.version }), '离职本人不得提交');
    await submitSettlementWithLostResponse({ ...context, id, withdraw: false });
    let task = await taskFor(); const firstTaskId = task.id;
    check('提交只冻结来源且不确认不付款', state().status === 'DRAFT' && state().approval === 'SUBMITTED' && state().payment == null
      && database(`SELECT reserved_settlement_id FROM hr_salary_slip WHERE id=${slipId};`) === id);
    await observe('submitted');
    reject(await post(hr, `${root}/${id}/submit`, { version: (await read()).version }), '禁止重复提交同一审批轮次');
    reject(await post(hr, `${root}/${id}/calculate`, { version: (await read()).version }), '审批中禁止重新计算');
    reject(await api(hr, `${root}/approval-task/${task.id}`), '提交人不能读取他人财务待办详情');
    reject(await api(employee, `${root}/approval-task/${task.id}`), '离职本人不能读取财务待办');
    const taskDetail = await api(finance, `${root}/approval-task/${task.id}`);
    check('财务待办详情定位本轮结算', String(successful(taskDetail, '财务读取本轮实际详情').settlementId) === id);
    check('财务待办详情禁止缓存', taskDetail.cacheControl === 'no-store');
    if (expectedRounds === 5) {
    await submitSettlementWithLostResponse({ ...context, id, withdraw: true }); await waitState('CANCELLED'); await unfrozen();
    const firstInstance = state().instance;
    await calculate(); await submit(); task = await taskFor();
    check('撤回重提使用新实例和第二轮', state().instance !== firstInstance && state().revision === 2);
    reject(await api(finance, `${root}/approval-task/${firstTaskId}`), '旧轮待办不能读取新轮审批详情');
    successful(await post(finance, '/workflow/wf/complete', { taskId: task.id, action: 'REJECT', comment: `${key}请重核` }), '实际财务退审'); await waitState('REJECTED'); await unfrozen();
    await calculate(); await submit(); await taskFor();
    successful(await post(admin, '/workflow/wf/instance/terminate', { instanceId: state().instance, reason: `${key}管理员终止` }), '管理员实际终止审批'); await waitState('CANCELLED'); await unfrozen();
    check('管理员终止由工作流持久关闭事件同步', database(`SELECT COUNT(*) FROM outbox_event WHERE tenant_id=100000 AND event_type='HR_SETTLEMENT_WORKFLOW_CLOSED' AND aggregate_id=${id};`) !== '0');
    await calculate(); await submit(); await taskFor();
    successful(await post(admin, '/workflow/wf/pause', { instanceId: state().instance }), '管理员实际暂停审批');
    successful(await post(hr, `${root}/${id}/withdraw`, { version: (await read()).version, reason: `${key}暂停后撤回` }), '人事实际撤回暂停流程'); await waitState('CANCELLED'); await unfrozen();
    await calculate(); await submit(); task = await taskFor();
    }
    await approveSettlementInUi({ ...context, task, expected: await read() }); await waitState('APPROVED');
    check('财务通过仍为待确认且无付款和来源入账', state().status === 'DRAFT' && state().payment == null
      && database(`SELECT COUNT(*) FROM hr_final_settlement_item WHERE tenant_id=100000 AND settlement_id=${id} AND source_posted_flag=1;`) === '0');
    await observe('approved');
    check(`${expectedRounds}轮原单真实审批保留且没有重复实例`, state().revision === expectedRounds && database(`SELECT COUNT(*) FROM wf_process_instance WHERE tenant_id=100000 AND definition_id=${literal(key)};`) === String(expectedRounds)
      && database(`SELECT COALESCE(JSON_LENGTH(JSON_EXTRACT(calculation_snapshot,'$.workflowHistory')),0) FROM hr_final_settlement WHERE settlement_id=${id};`) === String(expectedRounds - 1));
    evidence.approvalHttp = true; evidence.realWorkflow = true; evidence.approvalPayment = false;
    evidence.approvalSettlementId = id; evidence.approvalWorkflowRounds = expectedRounds;
    if (context.fundsMode) await verifySettlementFunds({ ...context, id, fundsAssetId });
  } finally {
    const unfinished = rows(`SELECT JSON_OBJECT('id',instance_id,'businessId',JSON_UNQUOTE(JSON_EXTRACT(variables,'$.businessId'))) FROM wf_process_instance WHERE tenant_id=100000 AND definition_id=${literal(key)} AND status IN ('RUNNING','PAUSED','FAILED','PENDING','WITHDRAWN','TASK_BACK','RESTARTED');`);
    for (const instance of unfinished) successful(await post(admin, '/workflow/wf/instance/terminate', { instanceId: instance.id, reason: `${key}结束隔离验证` }), '关闭本次未结束流程');
    for (const instance of unfinished) {
      assert.match(String(instance.businessId), /^[1-9]\d*$/);
      await waitFor(() => rows(`SELECT JSON_OBJECT('approval',approval_status) FROM hr_final_settlement WHERE tenant_id=100000 AND settlement_id=${instance.businessId};`)[0], row => row.approval === 'CANCELLED', '未结束结算或冲正的关闭结果未同步');
    }
    if (changed) {
      if (configured) successful(await api(admin, configRoot, { method: 'PUT', body: configured }), '恢复原结算流程配置');
      else { const added = successful(await api(admin, `${configRoot}/list?configKey=${configKey}&pageSize=100`), '读取本次临时配置').records.find(row => row.configKey === configKey);
        if (added) successful(await api(admin, `${configRoot}/${added.configId}`, { method: 'DELETE' }), '移除本次隔离配置'); }
    }
    for (const binding of removedFinanceBindings) database(`INSERT INTO sys_user_role(tenant_id,user_id,role_id) VALUES(100000,${binding.userId},${binding.roleId});`);
    database(`UPDATE wf_process_definition SET status='DRAFT',is_archived=1,is_latest=0 WHERE tenant_id=100000 AND definition_id=${literal(key)};`);
    check('结算审批专项原账号角色关联逐行恢复', rolesBefore === database(roleRows));
    journal('restored', { configuration: true, roles: true, settlementId: id ?? null });
    console.log('H2_SETTLEMENT_APPROVAL_CLEANUP: configuration_restored=true; workflow_history_retained=true; production_modified=false');
  }
}
