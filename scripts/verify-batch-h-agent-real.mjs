import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { verifyAgentBoundaries } from './verify-batch-h-agent-boundaries-real.mjs';

export async function verifyAgentInterface({ admin, api, successful, session, database, check, directory, caseTag, state }) {
  assert.ok(state.services.some(service => service.name === 'workflow'), 'Real workflow service is required');
  const base = '/workflow/wf';
  const settingsPath = '/workflow/agent-setting';
  const principalId = '990000706';
  const agentId = '990000707';
  const reviewerId = '990000705';
  const quote = value => `CONVERT(X'${Buffer.from(String(value)).toString('hex')}' USING utf8mb4)`;
  const rows = statement => database(statement).split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
  const post = (page, route, body) => api(page, route, { method: 'POST', body });
  const settingRequest = (setting, changes = {}) => ({ agentUserId: setting.agentUserId, agentMode: setting.agentMode,
    definitionIds: setting.definitionIds, startTime: setting.startTime, endTime: setting.endTime, reason: setting.reason,
    version: setting.version, ...changes });
  const denied = (response, label, status = [400, 403, 404, 409]) => {
    check(label, status.includes(response.status) && response.body?.code !== 200);
  };
  const taskRows = instanceId => rows(`SELECT JSON_OBJECT('taskId',task_id,'assignee',CAST(assignee AS CHAR),'proxyUserId',CAST(proxy_user_id AS CHAR),'settingId',agent_setting_id,'version',lock_version,'nodeKey',node_key,'status',status,'roles',candidate_roles) FROM wf_task WHERE tenant_id=100000 AND instance_id=${quote(instanceId)} ORDER BY node_key,task_id;`);
  const historyRows = taskId => rows(`SELECT JSON_OBJECT('operator',CAST(operator_id AS CHAR),'owner',CAST(on_behalf_of_user_id AS CHAR),'action',action,'type',task_type) FROM wf_task_history WHERE tenant_id=100000 AND task_id=${quote(taskId)} ORDER BY create_time,history_id;`);
  const countersignRows = instanceId => rows(`SELECT JSON_OBJECT('id',countersign_id,'total',total_count,'voted',voted_count,'approved',approve_count,'status',status) FROM wf_countersign_task WHERE tenant_id=100000 AND instance_id=${quote(instanceId)};`);
  const instanceStatus = instanceId => database(`SELECT status FROM wf_process_instance WHERE tenant_id=100000 AND instance_id=${quote(instanceId)};`);
  const currentSetting = settingId => successfulResult(settingsPath + '/mine/' + settingId);
  const employeeGrants = database('SELECT menu_id FROM sys_role_menu WHERE tenant_id=100000 AND role_id=5 ORDER BY menu_id;');
  check('H1新增菜单仅1850—1854且员工精确获得5项本人权限', database("SELECT GROUP_CONCAT(CONCAT(menu_id,':',perms) ORDER BY menu_id) FROM sys_menu WHERE menu_id BETWEEN 1850 AND 1859;") === '1850:workflow:agent:mine,1851:workflow:agent:save,1852:workflow:agent:remove,1853:workflow:agent:return,1854:workflow:agent:assist'
    && database('SELECT COUNT(*) FROM sys_role_menu WHERE tenant_id=100000 AND role_id=5 AND menu_id BETWEEN 1850 AND 1859;') === '5');
  check('H1实际代理设置15列及3个启用约束均存在', database("SELECT COUNT(*) FROM information_schema.columns WHERE table_schema='cloud_flow_db' AND table_name='wf_agent_setting';") === '15'
    && database("SELECT COUNT(*) FROM information_schema.table_constraints WHERE constraint_schema='cloud_flow_db' AND table_name='wf_agent_setting' AND constraint_type='CHECK' AND enforced='YES';") === '3');
  const principal = await session('g_holiday_manager');
  const agent = await session('g_holiday_employee');
  const reviewer = await session('g_holiday_hr');
  const foreign = await session('g_import_tenant');
  const successfulResult = async route => successful(await api(principal, route), '本人读取真实设置');
  const priorSettings = successful(await api(principal, `${settingsPath}/mine?pageSize=100`), '读取隔离验收已有设置');
  for (const prior of priorSettings.rows.filter(value => value.status === 'ACTIVE' && /^(H1页面创建_|H1边界_)/.test(value.reason ?? ''))) {
    successful(await api(principal, `${settingsPath}/${prior.settingId}?version=${prior.version}`, { method: 'DELETE' }), '通过本人接口停用前次隔离验收设置');
  }
  const employeeInfo = successful(await api(agent, '/auth/info'), '读取员工真实身份权限');
  check('员工实际权限包含本人代理且不含流程定义及用户管理写入', ['mine', 'save', 'remove', 'return', 'assist'].every(action => employeeInfo.permissions.includes(`workflow:agent:${action}`))
    && !employeeInfo.permissions.some(permission => /^(?:workflow:(?:definition|form):(?:add|save|edit|remove|deploy)|system:user:(?:add|edit|remove))$/.test(permission)));
  denied(await api(agent, `${base}/definitions`), '员工不能借代理选择器进入流程定义管理', [403]);
  const selectors = successful(await api(agent, '/auth/system/user/options?pageSize=100'), '员工使用现有用户选项接口');
  check('真实用户选择接口可用且不增加用户管理授权', Array.isArray(selectors.rows) && selectors.rows.some(user => String(user.userId) === principalId));

  const fields = [{ id: 'note', type: 'TEXT', label: '说明', required: true },
    { id: 'secret', type: 'TEXT', label: '隐藏信息' },
    { id: 'receipt', type: 'UPLOAD_FILE', label: '凭证', accept: '.pdf', maxSize: 1 },
    { id: 'secretFile', type: 'UPLOAD_FILE', label: '隐藏附件', accept: '.pdf', maxSize: 1 }];
  const form = successful(await post(admin, `${base}/form/save`, { formKey: `h1_${caseTag}`, formName: `H1代理验收_${caseTag}`, fieldsJson: JSON.stringify(fields) }), '真实创建H1表单');
  const formId = form.formId ?? form.id;
  assert.equal(typeof formId, 'string');
  async function createDefinition(suffix, allowAgent = true, countersign = false) {
    const model = {
      nodes: [{ id: 'start', type: 'START', title: '发起' },
        { id: 'approval', type: 'APPROVAL', title: `H1首审_${suffix}_${caseTag}`, approverType: 'USER', approverValue: countersign ? `${principalId},${reviewerId}` : principalId,
          allowAgent, allowEdit: true, allowDelegate: true, allowAddSign: true, allowReduceSign: true, ...(countersign ? { signType: 'ALL' } : {}) },
        { id: 'review', type: 'APPROVAL', title: `H1复核_${suffix}_${caseTag}`, approverType: 'USER', approverValue: reviewerId, allowAgent: false },
        { id: 'end', type: 'END', title: '结束' }],
      edges: [{ source: 'start', target: 'approval' }, { source: 'approval', target: 'review' }, { source: 'review', target: 'end' }],
    };
    const definition = successful(await post(admin, `${base}/definition/save`, { processKey: `h1_${suffix}_${caseTag}`, processName: `H1_${suffix}_${caseTag}`, formId,
      modelJson: JSON.stringify(model), startPermissionType: 'ALL', startPermissionValue: '[]' }), '真实创建流程定义');
    const definitionId = definition.definitionId ?? definition.id;
    assert.equal(typeof definitionId, 'string');
    successful(await api(admin, `${base}/definition/${definitionId}/field-permissions`, { method: 'PUT', body: ['secret', 'secretFile'].map(fieldId => ({ nodeKey: 'approval', fieldId, visibleFlag: false, editableFlag: false, requiredFlag: false })) }), '真实保存隐藏字段权限');
    successful(await post(admin, `${base}/definition/deploy/${definitionId}`), '真实发布代理流程');
    return definitionId;
  }
  const definitionId = await createDefinition('normal');
  const forbiddenDefinitionId = await createDefinition('forbidden', false);
  const countersignDefinitionId = await createDefinition('countersign', true, true);
  const available = successful(await api(agent, `${settingsPath}/definitions?pageSize=100`), '员工读取最小已发布流程版本选项');
  check('员工选项包含已发布流程且无模型或表单内容', available.rows.some(option => option.definitionId === definitionId)
    && available.rows.every(option => Object.keys(option).sort().join(',') === 'definitionId,processName,version'));
  const pdf = Buffer.from('%PDF-1.4\nH1 isolated real attachment\n%%EOF');
  async function start(definition, suffix, attachments = false) {
    const context = successful(await api(admin, `${base}/draft/context/${definition}`), '真实读取发起上下文');
    const formData = { note: `H1_${caseTag}_${suffix}`, secret: `H1_PRIVATE_${caseTag}_${suffix}` };
    const files = {};
    if (attachments) for (const fieldPath of ['receipt', 'secretFile']) {
      const uploaded = successful(await api(admin, `${base}/form-files?definitionId=${definition}&fieldPath=${fieldPath}`, { method: 'POST', file: { name: `${fieldPath}.pdf`, content: pdf.toString('base64'), type: 'application/pdf' } }), '通过真实存储上传私有附件');
      files[fieldPath] = String(uploaded.fileId);
      formData[fieldPath] = [files[fieldPath]];
    }
    const draft = successful(await post(admin, `${base}/draft`, { definitionId: definition, expectedVersion: 0, loadedContextHash: context.contextHash, title: `H1_${caseTag}_${suffix}`, formData, nodeAssignees: {} }), '真实保存待发起草稿');
    const started = successful(await post(admin, `${base}/start`, { draftId: draft.draftId, expectedVersion: draft.lockVersion }), '真实提交草稿并运行流程');
    const instanceId = started.instanceId ?? started.processInstanceId;
    assert.equal(typeof instanceId, 'string');
    const tasks = taskRows(instanceId);
    check(`${suffix}真实引擎产生首审任务`, tasks.some(task => task.nodeKey === 'approval' && task.assignee === principalId && task.status === 'TODO'));
    return { instanceId, tasks, task: tasks.find(task => task.assignee === principalId), files, formData };
  }
  async function complete(page, taskId, suffix, variables) {
    return post(page, `${base}/complete`, { taskId, action: 'APPROVE', comment: `H1_${suffix}_${caseTag}`, ...(variables ? { variables } : {}) });
  }
  async function finishReview(instanceId) {
    const tasks = taskRows(instanceId);
    check('首审仅推进到一个真实复核任务', tasks.length === 1 && tasks[0].nodeKey === 'review' && tasks[0].assignee === reviewerId && instanceStatus(instanceId) === 'RUNNING');
    successful(await complete(reviewer, tasks[0].taskId, 'review'), '真实复核通过');
    check('复核后流程实际结束且任务清空', instanceStatus(instanceId) === 'PASSED' && taskRows(instanceId).length === 0);
  }
  if (process.argv.includes('--agent-boundaries-only')) {
    const outOfScopeDefinitionId = await createDefinition('out-of-scope');
    await verifyAgentBoundaries({ admin, principal, agent, reviewer, api, post, successful, denied, check, database, rows, quote,
      taskRows, historyRows, start, complete, finishReview, definitionId, outOfScopeDefinitionId, countersignDefinitionId, principalId, agentId,
      reviewerId, settingsPath, settingRequest, caseTag });
    check('边界验收未修改员工权限集合', employeeGrants === database('SELECT menu_id FROM sys_role_menu WHERE tenant_id=100000 AND role_id=5 ORDER BY menu_id;'));
    return;
  }
  const ordinary = await start(definitionId, 'before-setting', true);
  const forbidden = await start(forbiddenDefinitionId, 'node-forbidden');
  check('保存设置前任务无代理', ordinary.task.proxyUserId === null && forbidden.task.proxyUserId === null);
  await principal.goto(new URL('/workflow/my-agents', principal.url()).href);
  await principal.getByRole('button', { name: '新增设置', exact: true }).click();
  const editor = principal.getByRole('dialog', { name: '新增本人代理设置', exact: true });
  await editor.getByRole('combobox', { name: '选择其他启用用户', exact: true }).click();
  await principal.getByRole('option', { name: /g_holiday_employee/ }).click();
  await editor.getByLabel('指定已发布的流程版本', { exact: true }).check();
  await editor.getByRole('combobox', { name: '选择流程及版本', exact: true }).click();
  await principal.getByRole('option', { name: new RegExp(`H1_normal_${caseTag}`) }).click();
  await principal.getByRole('option', { name: new RegExp(`H1_forbidden_${caseTag}`) }).click();
  await principal.getByRole('option', { name: new RegExp(`H1_countersign_${caseTag}`) }).click();
  await principal.getByRole('dialog', { name: '选择流程及版本', exact: true }).press('Escape');
  await editor.getByLabel('安排原因（选填）', { exact: true }).fill(`H1页面创建_${caseTag}`);
  await editor.getByText(/本页可代理 1 项/).waitFor();
  check('页面影响预览包含允许与禁代理两个真实待办且不写设置', await editor.getByText(ordinary.task.taskId, { exact: true }).isVisible()
    && await editor.getByText(forbidden.task.taskId, { exact: true }).isVisible()
    && database(`SELECT COUNT(*) FROM wf_agent_setting WHERE tenant_id=100000 AND principal_user_id=${principalId} AND status='ACTIVE';`) === '0'
    && taskRows(ordinary.instanceId)[0].proxyUserId === null);
  const savedResponse = principal.waitForResponse(response => response.url().endsWith(settingsPath) && response.request().method() === 'POST');
  await editor.getByRole('button', { name: '保存设置', exact: true }).click();
  const saveResult = await savedResponse;
  check('真实页面保存本人代理设置成功', saveResult.status() === 200 && (await saveResult.json()).code === 200);
  await editor.waitFor({ state: 'detached' });
  let setting = successful(await api(principal, `${settingsPath}/mine`), '本人列表读取页面保存值').rows.find(value => value.reason === `H1页面创建_${caseTag}`);
  assert.ok(setting?.settingId);
  check('保存立即绑定已有允许任务且保留原负责人', taskRows(ordinary.instanceId)[0].proxyUserId === agentId
    && taskRows(ordinary.instanceId)[0].assignee === principalId && taskRows(forbidden.instanceId)[0].proxyUserId === null);
  for (const outsider of [agent, admin, foreign]) {
    denied(await api(outsider, `${settingsPath}/mine/${setting.settingId}`), '其他人包括管理员不能读取本人代理设置', [403]);
    const forged = settingRequest(setting, { agentUserId: reviewerId, definitionIds: [], reason: 'forged-owner' });
    denied(await api(outsider, `${settingsPath}/${setting.settingId}`, { method: 'PUT', body: forged }), '其他人不能修改本人代理设置', [403]);
    denied(await post(outsider, `${settingsPath}/preview?settingId=${setting.settingId}`, forged), '其他人不能预览本人设置的影响范围', [403]);
    denied(await api(outsider, `${settingsPath}/${setting.settingId}?version=${setting.version}`, { method: 'DELETE' }), '其他人不能停用本人代理设置', [403]);
  }
  denied(await api(agent, `${settingsPath}/${setting.settingId}`, { method: 'PUT', body: settingRequest(setting) }), '先拒绝非本人修改再校验代理人内容', [403]);
  check('越权修改预览停用均不改变设置和已有任务绑定', JSON.stringify(await currentSetting(setting.settingId)) === JSON.stringify(setting)
    && taskRows(ordinary.instanceId)[0].proxyUserId === agentId);
  const todo = successful(await api(agent, `${base}/todo?pageSize=100`), '员工读取真实代理待办');
  const received = todo.rows.find(task => task.taskId === ordinary.task.taskId);
  console.log(`H1_RECEIVED_TASK: found=${Boolean(received)}; mode=${received?.agentMode}; proxyType=${typeof received?.proxyUserId}; version=${received?.version}; hiddenValuePresent=${JSON.stringify(received ?? {}).includes(ordinary.formData.secret)}`);
  check('员工待办携带真实代理模式和版本且隐藏字段不泄漏', received?.agentMode === 'AGENT' && String(received.proxyUserId) === agentId
    && Number.isInteger(received.version) && !JSON.stringify(received).includes(ordinary.formData.secret));
  await agent.goto(new URL('/tasks', agent.url()).href);
  const desktopTask = agent.getByText(`节点 H1首审_normal_${caseTag}`, { exact: true });
  await desktopTask.waitFor();
  check('桌面待办页面保留后端授权的代理任务', await desktopTask.isVisible()
    && await agent.getByText(`H1_${caseTag}_before-setting`, { exact: true }).isVisible());
  const formPath = `${base}/form/${formId}?instanceId=${ordinary.instanceId}&taskId=${ordinary.task.taskId}`;
  const visibleForm = successful(await api(agent, formPath), '代理读取受保护表单');
  check('代理表单投影移除隐藏文本和隐藏附件字段', !JSON.stringify(visibleForm).includes('secretFile') && !JSON.stringify(visibleForm).includes('隐藏信息'));
  const filePath = field => `${base}/form-files/${ordinary.files[field]}?instanceId=${ordinary.instanceId}&taskId=${ordinary.task.taskId}&fieldPath=${field}`;
  const download = await api(agent, filePath('receipt').replace(`/${ordinary.files.receipt}?`, `/${ordinary.files.receipt}/content?`));
  check('代理通过真实中央存储下载可见附件且字节一致', download.status === 200 && download.sha256 === createHash('sha256').update(pdf).digest('hex'));
  denied(await api(agent, filePath('secretFile')), '代理不能借文件编号读取隐藏附件', [403]);
  const beforeTamper = JSON.stringify(taskRows(ordinary.instanceId));
  denied(await complete(agent, ordinary.task.taskId, 'hidden-write', { secret: 'tampered' }), '代理伪造隐藏字段写入被拒绝', [400, 403]);
  check('隐藏字段拒绝不消耗任务和历史', JSON.stringify(taskRows(ordinary.instanceId)) === beforeTamper && historyRows(ordinary.task.taskId).length === 0);
  successful(await complete(agent, ordinary.task.taskId, 'normal', { note: `H1_ALLOWED_${caseTag}` }), '员工代理执行标准审批');
  const completed = historyRows(ordinary.task.taskId).filter(history => history.action === 'APPROVE');
  check('真实审批历史分别记录员工操作者和原负责人', completed.length === 1 && completed[0].operator === agentId && completed[0].owner === principalId);
  await finishReview(ordinary.instanceId);
  const trace = successful(await api(principal, `${base}/instance/${ordinary.instanceId}/trace`), '真实审批轨迹');
  check('真实轨迹同时保留实际操作人和被代理人', JSON.stringify(trace).includes('g_holiday_employee') && JSON.stringify(trace).includes('g_holiday_manager'));
  const future = await start(definitionId, 'future-assignment');
  check('设置保存后的未来任务由统一创建入口自动绑定', future.task.proxyUserId === agentId && future.task.settingId === setting.settingId);
  const competing = await Promise.all([complete(principal, future.task.taskId, 'principal-race'), complete(agent, future.task.taskId, 'agent-race')]);
  check('本人和代理并发标准审批仅一笔成功', competing.filter(response => response.status === 200 && response.body?.code === 200).length === 1);
  denied(competing.find(response => response.status !== 200 || response.body?.code !== 200), '并发落败请求明确拒绝', [403, 404, 409]);
  check('并发审批只生成一笔完成历史', historyRows(future.task.taskId).filter(history => history.action === 'APPROVE').length === 1);
  await finishReview(future.instanceId);

  const countersigned = await start(countersignDefinitionId, 'countersign-agent');
  check('真实会签仅有原负责人和复核人两个席位且代理不增加席位', countersigned.tasks.length === 2
    && countersignRows(countersigned.instanceId)[0].total === 2 && countersigned.task.proxyUserId === agentId);
  const added = successful(await post(agent, `${base}/task/add-signature`, { taskId: countersigned.task.taskId, userIds: ['990000702'], comment: `H1加签_${caseTag}` }), '有效代理通过标准接口增加会签席位');
  check('标准加签新增一张真实任务并原子增加应到人数', added.addedCount === 1 && countersignRows(countersigned.instanceId)[0].total === 3
    && taskRows(countersigned.instanceId).some(task => task.assignee === '990000702'));
  denied(await post(agent, `${base}/task/reduction-signature`, { taskId: countersigned.task.taskId, userIds: [principalId], comment: `H1禁止移除被代理人_${caseTag}` }), '代理不能通过减签移除自己代表的席位', [400]);
  successful(await post(agent, `${base}/task/reduction-signature`, { taskId: countersigned.task.taskId, userIds: ['990000702'], comment: `H1减签_${caseTag}` }), '有效代理通过标准接口移除未处理的新增席位');
  check('减签恢复两个席位且被代理人任务保留', countersignRows(countersigned.instanceId)[0].total === 2 && taskRows(countersigned.instanceId).length === 2
    && taskRows(countersigned.instanceId).some(task => task.taskId === countersigned.task.taskId));
  const votes = await Promise.all([complete(agent, countersigned.task.taskId, 'agent-vote'), complete(principal, countersigned.task.taskId, 'principal-vote')]);
  check('本人和代理并发会签只允许一个席位投票成功', votes.filter(response => response.status === 200 && response.body?.code === 200).length === 1);
  denied(votes.find(response => response.status !== 200 || response.body?.code !== 200), '会签竞争落败明确拒绝', [403, 404, 409]);
  const ballot = rows(`SELECT JSON_OBJECT('voter',CAST(voter_id AS CHAR),'result',vote_result) FROM wf_countersign_vote WHERE tenant_id=100000 AND task_id=${quote(countersigned.task.taskId)};`);
  check('会签投票归属原负责人且仍等待另一席位', ballot.length === 1 && ballot[0].voter === principalId && ballot[0].result === 'APPROVE'
    && countersignRows(countersigned.instanceId)[0].voted === 1 && countersignRows(countersigned.instanceId)[0].status === 'VOTING'
    && taskRows(countersigned.instanceId).every(task => task.nodeKey === 'approval'));
  successful(await complete(reviewer, taskRows(countersigned.instanceId)[0].taskId, 'second-vote'), '另一真实会签人完成剩余席位');
  await finishReview(countersigned.instanceId);

  setting = await currentSetting(setting.settingId);
  setting = successful(await api(principal, `${settingsPath}/${setting.settingId}`, { method: 'PUT', body: settingRequest(setting, { agentMode: 'AGENT_ASSIST' }) }), '本人改为仅协办');
  const assisted = await start(definitionId, 'assist');
  const assistedCountersign = await start(countersignDefinitionId, 'assist-countersign');
  const beforeAssist = JSON.stringify(taskRows(assisted.instanceId));
  const beforeAssistedCountersign = JSON.stringify([taskRows(assistedCountersign.instanceId), countersignRows(assistedCountersign.instanceId)]);
  for (const action of ['APPROVE', 'REJECT', 'DELEGATE']) {
    denied(await post(agent, `${base}/complete`, { taskId: assisted.task.taskId, action, comment: `assist-forged-${action}`, delegateUserId: reviewerId }), `协办伪造${action}标准请求被拒绝`, [403]);
  }
  for (const route of ['/task/add-signature', '/task/reduction-signature']) {
    denied(await post(agent, `${base}${route}`, { taskId: assistedCountersign.task.taskId, userIds: ['990000702'], comment: 'forged-assist' }), '协办不能加减真实会签席位', [403]);
  }
  const filesBefore = database('SELECT COUNT(*) FROM sys_file;');
  denied(await api(agent, `${base}/form-files?instanceId=${assisted.instanceId}&taskId=${assisted.task.taskId}&fieldPath=receipt`, { method: 'POST', file: { name: 'assist.pdf', content: pdf.toString('base64'), type: 'application/pdf' } }), '协办不能上传可编辑表单附件', [403]);
  check('协办越权请求不改变任务、票签和文件记录', JSON.stringify(taskRows(assisted.instanceId)) === beforeAssist && historyRows(assisted.task.taskId).length === 0
    && JSON.stringify([taskRows(assistedCountersign.instanceId), countersignRows(assistedCountersign.instanceId)]) === beforeAssistedCountersign
    && database('SELECT COUNT(*) FROM sys_file;') === filesBefore);
  successful(await complete(principal, assistedCountersign.task.taskId, 'owner-assist-vote'), '仅协办会签由原负责人投票');
  successful(await complete(reviewer, taskRows(assistedCountersign.instanceId)[0].taskId, 'reviewer-assist-vote'), '复核人完成仅协办会签的另一席位');
  await finishReview(assistedCountersign.instanceId);
  await agent.setViewportSize({ width: 375, height: 812 });
  await agent.goto(new URL('/tasks', agent.url()).href);
  await agent.getByText(`H1首审_normal_${caseTag}`, { exact: true }).click();
  const assistPanel = agent.getByRole('region', { name: '仅协办意见', exact: true });
  await assistPanel.waitFor();
  check('手机真实待办打开协办面板且无最终审批按钮', await assistPanel.isVisible() && await agent.getByRole('button', { name: /^(同意|通过|驳回|拒绝)$/ }).count() === 0);
  await assistPanel.getByRole('textbox', { name: '协办意见', exact: true }).fill(`H1手机协办意见_${caseTag}`);
  const assistResponse = agent.waitForResponse(response => response.url().endsWith('/workflow/enhance/task/agent-assist'));
  await assistPanel.getByRole('button', { name: '提交协办意见', exact: true }).click();
  check('手机页面真实提交协办意见', (await (await assistResponse).json()).code === 200);
  check('协办后原任务仍待办且仅增加意见历史', taskRows(assisted.instanceId)[0].status === 'TODO' && instanceStatus(assisted.instanceId) === 'RUNNING'
    && historyRows(assisted.task.taskId).length === 1 && historyRows(assisted.task.taskId)[0].action === 'AGENT_ASSIST');
  await agent.getByText(`H1首审_normal_${caseTag}`, { exact: true }).click();
  await agent.getByRole('button', { name: '归还原负责人', exact: true }).click();
  const confirmation = agent.getByRole('dialog', { name: '归还代理任务', exact: true });
  await confirmation.waitFor();
  check('手机归还先二次确认且未提前清除代理', taskRows(assisted.instanceId)[0].proxyUserId === agentId);
  await confirmation.getByRole('textbox', { name: '归还原因', exact: true }).fill(`H1手机归还_${caseTag}`);
  const returnResponse = agent.waitForResponse(response => response.url().endsWith('/workflow/enhance/task/agent-return'));
  await confirmation.getByRole('button', { name: '确认归还', exact: true }).click();
  check('手机页面真实归还成功', (await (await returnResponse).json()).code === 200);
  const returned = taskRows(assisted.instanceId);
  check('归还只清除代理关系而保留一个原负责人待办', returned.length === 1 && returned[0].assignee === principalId && returned[0].proxyUserId === null && returned[0].status === 'TODO');
  denied(await complete(agent, assisted.task.taskId, 'returned-forged'), '已归还代理不能继续办理', [403]);
  successful(await complete(principal, assisted.task.taskId, 'principal-after-return'), '原负责人在归还后正常审批');
  await finishReview(assisted.instanceId);
  await agent.goto(new URL('/workflow/my-agents', agent.url()).href);
  await agent.getByRole('button', { name: '新增设置', exact: true }).waitFor();
  check('手机可以进入本人代理设置且无横向页面溢出', await agent.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  await agent.screenshot({ path: path.join(directory, `h1-agent-mobile-${caseTag}.png`), fullPage: true });
  await principal.goto(new URL('/workflow/my-agents', principal.url()).href);
  await principal.getByText('仅协办意见', { exact: true }).first().waitFor();
  await principal.screenshot({ path: path.join(directory, `h1-agent-desktop-${caseTag}.png`), fullPage: true });
  setting = await currentSetting(setting.settingId);
  successful(await api(principal, `${settingsPath}/${setting.settingId}?version=${setting.version}`, { method: 'DELETE' }), '本人停用代理设置');
  successful(await complete(principal, forbidden.task.taskId, 'forbidden-owner'), '禁止代理节点由本人正常完成');
  await finishReview(forbidden.instanceId);
  check('整套真实代理验收未修改员工既有或新增权限集合', employeeGrants === database('SELECT menu_id FROM sys_role_menu WHERE tenant_id=100000 AND role_id=5 ORDER BY menu_id;'));
}
