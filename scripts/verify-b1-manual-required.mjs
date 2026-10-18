import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createB2MobileBrowser, tapB2Mobile } from './b2-mobile-browser.mjs';

export async function verifyB1ManualRequired({ admin, employee, api, successful, session, database, check, caseTag, secrets, evidence }) {
  const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
  const directory = path.join(root, '.cloudflow-runtime/full-prd-20260915/approved-runtime', 'b1-manual-required-' + caseTag);
  await fs.mkdir(directory);
  const marker = 'B1MR' + caseTag, base = '/workflow/wf', definitions = [], instances = [], mobiles = [], pageErrors = [];
  const sql = value => 'CONVERT(0x' + Buffer.from(String(value)).toString('hex') + ' USING utf8mb4) COLLATE utf8mb4_unicode_ci';
  const rows = query => database(query).split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
  const post = (page, url, body = {}) => api(page, url, { method: 'POST', body });
  const manager = await session('g_holiday_manager');
  const token = await manager.evaluate(async () => (await import('/src/utils/authStorage.ts')).getAuthToken());
  assert.ok(token); secrets.add(token.replace(/^Bearer /, ''));
  const uid = name => database("SELECT user_id FROM sys_user WHERE tenant_id=100000 AND deleted=0 AND status='0' AND user_name=" + sql(name));
  const starter = uid('g_holiday_employee'), reviewer = uid('g_holiday_manager');
  assert.match(starter, /^[1-9][0-9]*$/); assert.match(reviewer, /^[1-9][0-9]*$/);
  const grants = () => database('SELECT tenant_id,role_id,menu_id FROM sys_role_menu ORDER BY tenant_id,role_id,menu_id;SELECT tenant_id,user_id,role_id FROM sys_user_role ORDER BY tenant_id,user_id,role_id;');
  const originalGrants = grants();
  const stored = id => JSON.parse(database('SELECT model_json FROM wf_process_definition WHERE tenant_id=100000 AND definition_id=' + sql(id)));
  const status = id => database('SELECT status FROM wf_process_instance WHERE tenant_id=100000 AND instance_id=' + sql(id));
  const tasks = id => rows("SELECT JSON_OBJECT('id',task_id,'node',node_key,'user',CAST(assignee AS CHAR),'type',task_type) FROM wf_task WHERE tenant_id=100000 AND instance_id=" + sql(id) + ' ORDER BY task_id');
  const history = id => rows("SELECT JSON_OBJECT('task',task_id,'node',node_key,'user',CAST(operator_id AS CHAR),'type',task_type) FROM wf_task_history WHERE tenant_id=100000 AND instance_id=" + sql(id) + ' ORDER BY history_id');
  const recoveryTag = process.env.CLOUDFLOW_B1_MANUAL_RECOVERY;
  if (recoveryTag) {
    assert.equal(recoveryTag, '7d73318130a0', 'Only the retained R83 fixture is approved for this recovery');
    const recoveryMarker = 'B1MR' + recoveryTag;
    await fs.access(path.join(directory, '..', 'b1-manual-required-' + recoveryTag, 'failure.png'));
    const oldDefinitions = rows("SELECT JSON_OBJECT('id',definition_id,'key',process_key,'modelHash',SHA2(model_json,256)) FROM wf_process_definition WHERE tenant_id=100000 AND process_key IN (" + ['self', 'other', 'approval'].map(name => sql(recoveryMarker + '_' + name)).join(',') + ') ORDER BY definition_id');
    assert.equal(oldDefinitions.length, 3);
    const oldInstances = rows("SELECT JSON_OBJECT('id',instance_id,'definitionId',definition_id,'user',CAST(start_user_id AS CHAR),'status',status,'variables',variables) FROM wf_process_instance WHERE tenant_id=100000 AND definition_id IN (" + oldDefinitions.map(item => sql(item.id)).join(',') + ') ORDER BY instance_id');
    assert.equal(oldInstances.length, 4);
    assert.ok(oldInstances.every(item => item.user === starter && ['PASSED', 'RUNNING'].includes(item.status)));
    await fs.writeFile(path.join(directory, 'r83-recovery-before.json'), JSON.stringify({ definitions: oldDefinitions, instances: oldInstances }, null, 2), { flag: 'wx' });
    for (const item of oldInstances) if (item.status === 'RUNNING') successful(await post(admin, base + '/instance/terminate', { instanceId: item.id, reason: recoveryMarker + '-retained-failure-cleanup' }), '通过原接口收尾R83未完成测试流程');
    for (const item of oldDefinitions) database("UPDATE wf_process_definition SET status='ARCHIVED' WHERE tenant_id=100000 AND definition_id=" + sql(item.id) + ' AND process_key=' + sql(item.key) + ' AND SHA2(model_json,256)=' + sql(item.modelHash));
    check('R83测试样本经原接口收尾且已完成结果与权限保持', oldInstances.every(item => tasks(item.id).length === 0 && status(item.id) === (item.status === 'PASSED' ? 'PASSED' : 'TERMINATED')) && grants() === originalGrants);
    await fs.writeFile(path.join(directory, 'r83-recovery-result.json'), JSON.stringify({ restored: true, instances: oldInstances.length, definitions: oldDefinitions.length, forcedWorkflowOutcomeWrites: 0 }, null, 2), { flag: 'wx' });
  }
  const legacyEvidence = JSON.parse(await fs.readFile(path.join(root, '.cloudflow-runtime/full-prd-20260915/approved-runtime/b1-manual-policy-ea73e86b6df3/observations.json'), 'utf8'));
  const legacy = legacyEvidence.find(item => item.nodeType === 'MANUAL'); assert.ok(legacy?.definitionId);
  const legacyId = legacy.definitionId;
  assert.equal(database('SELECT process_key FROM wf_process_definition WHERE tenant_id=100000 AND definition_id=' + sql(legacyId)), 'B1MPea73e86b6df3_MANUAL');
  const legacyStatus = database('SELECT status FROM wf_process_definition WHERE tenant_id=100000 AND definition_id=' + sql(legacyId));
  assert.equal(legacyStatus, 'ARCHIVED');
  const legacyModel = JSON.stringify(stored(legacyId));
  assert.equal(stored(legacyId).nodes.find(node => node.id === 'subject').approveSelf, 'AUTO_SKIP');
  let failure, activePage, formId, stage = 'setup', completions = 0, pageCompletions = 0, traceViews = 0, rejected = 0, legacyPublished = false;
  const waitFor = async (read, accept, message) => {
    const deadline = Date.now() + 30000;
    do { const value = await read(); if (accept(value)) return value; await new Promise(resolve => setTimeout(resolve, 150)); } while (Date.now() < deadline);
    throw new Error(message);
  };
  const model = subject => {
    const nodes = [{ id: 'start', type: 'START', title: '发起' }, { id: 'subject', type: 'MANUAL', title: '核对交接', approverType: 'INITIATOR', props: { taskDescription: '核对交接清单' }, ...subject },
      { id: 'review', type: 'APPROVAL', title: '后续确认', approverType: 'USER', approverValue: reviewer, approveSelf: 'ALLOW' }, { id: 'end', type: 'END', title: '结束' }];
    return { nodes, edges: nodes.slice(1).map((node, index) => ({ id: 'edge' + index, source: nodes[index].id, target: node.id })) };
  };
  const save = async (name, subject) => {
    const result = successful(await post(admin, base + '/definition/save', { processKey: marker + '_' + name, processName: marker + '_' + name, formId,
      modelJson: JSON.stringify(model(subject)), startPermissionType: 'ALL', startPermissionValue: '[]' }), '保存人工任务获批配置');
    const id = result.definitionId ?? result.id; assert.ok(id); definitions.push(id);
    successful(await post(admin, base + '/definition/deploy/' + id), '发布人工任务定义'); return id;
  };
  const launch = async (definitionId, name) => {
    const context = successful(await api(employee, base + '/draft/context/' + definitionId), '读取人工任务发起上下文');
    const draft = successful(await post(employee, base + '/draft', { definitionId, expectedVersion: 0, loadedContextHash: context.contextHash,
      title: marker + '_' + name, formData: { note: marker }, nodeAssignees: {} }), '保存人工任务草稿');
    const started = successful(await post(employee, base + '/start', { draftId: draft.draftId, expectedVersion: draft.lockVersion }), '真实发起人工任务');
    const id = started.instanceId ?? started.processInstanceId; assert.ok(id); instances.push(id); return id;
  };
  const complete = async (page, task) => { successful(await post(page, base + '/complete', { taskId: task.id, action: 'APPROVE', comment: marker }), '真实本人完成待办'); completions++; };
  const finish = async id => {
    const followups = tasks(id).filter(task => task.node === 'review');
    check('人工办理后唯一创建后续指定人员待办', followups.length === 1 && followups[0].user === reviewer);
    await complete(manager, followups[0]);
    check('后续办理完成且无遗留待办', status(id) === 'PASSED' && tasks(id).length === 0);
  };
  const trace = async (id, page, device) => {
    activePage = page;
    await page.goto(new URL('/workflow/search-instance/' + id, page.url()).href, { waitUntil: 'domcontentloaded' });
    await page.getByRole('heading', { name: '流程详情', exact: true }).waitFor();
    const dialog = page.getByRole('dialog', { name: '申请详情', exact: true });
    const response = page.waitForResponse(item => new URL(item.url()).pathname.endsWith('/workflow/wf/instance/' + id + '/trace')).catch(() => null);
    const tab = dialog.getByRole('button', { name: '审批记录', exact: true });
    if (device === 'mobile') await tapB2Mobile(tab); else await tab.click();
    const returned = await response; assert.ok(returned, 'Actual manual trace response required'); const body = await returned.json();
    check(device + '人工办理轨迹对应真实MANUAL历史且无自动跳过', returned.status() === 200 && body.code === 200
      && body.data.historyDetails.some(item => item.nodeKey === 'subject' && item.taskType === 'MANUAL')
      && !body.data.historyDetails.some(item => item.nodeKey === 'subject' && item.taskType === 'AUTO_SKIP'));
    const badge = dialog.locator('span').filter({ hasText: /^人工处理$/ }).filter({ has: page.locator('svg.lucide-hand') }).first();
    await badge.waitFor(); await badge.scrollIntoViewIfNeeded();
    check(device + '显示人工处理名称和图标', await badge.isVisible()); traceViews++;
    await page.screenshot({ path: path.join(directory, device + '-trace-' + traceViews + '.png') });
  };
  try {
    for (const page of [admin, employee, manager]) page.on('pageerror', error => pageErrors.push(error.name));
    const form = successful(await post(admin, base + '/form/save', { formKey: marker, formName: marker, fieldsJson: '[{"id":"note","type":"TEXT","label":"说明"}]' }), '建立人工任务表单');
    formId = form.formId ?? form.id; assert.ok(formId);
    for (const policy of ['AUTO_SKIP', 'TO_DIRECT_LEADER', 'TO_DEPT_MANAGER']) {
      const key = marker + '_invalid_' + policy;
      const result = await post(admin, base + '/definition/save', { processKey: key, processName: key, formId, modelJson: JSON.stringify(model({ approveSelf: policy })) });
      check('服务端拒绝人工任务新传入' + policy, result.status === 400 && /人工任务必须人工办理/.test(result.body?.msg || result.body?.message || '')
        && database('SELECT COUNT(*) FROM wf_process_definition WHERE tenant_id=100000 AND process_key=' + sql(key)) === '0'); rejected++;
    }
    const self = await save('self', {}), other = await save('other', { approverType: 'USER', approverValue: reviewer, approveSelf: 'ALLOW' });
    const normal = await save('approval', { type: 'APPROVAL', approveSelf: 'AUTO_SKIP' });
    for (const page of [employee, manager]) {
      const mobile = await createB2MobileBrowser({ admin: page, secrets, check, landingPath: '/tasks', landingHeading: '我的任务' });
      mobile.page.on('pageerror', error => pageErrors.push(error.name)); mobiles.push(mobile);
    }
    for (const device of ['desktop', 'mobile']) {
      for (const [name, definitionId, user, ownerPage] of [['self', self, starter, device === 'mobile' ? mobiles[0].page : employee], ['other', other, reviewer, device === 'mobile' ? mobiles[1].page : manager]]) {
        stage = device + '-' + name + '-launch';
        const id = await launch(definitionId, device + '_' + name), pending = tasks(id);
        check(device + name + '人工任务阻塞并仅生成指定人员待办', pending.length === 1 && pending[0].node === 'subject' && pending[0].user === user && pending[0].type === 'MANUAL'
          && status(id) === 'RUNNING' && !history(id).some(item => item.node === 'subject'));
        activePage = ownerPage;
        await ownerPage.goto(new URL('/workflow/task/' + pending[0].id, ownerPage.url()).href, { waitUntil: 'domcontentloaded' });
        const dialog = ownerPage.getByRole('dialog', { name: '任务处理', exact: true }); await dialog.waitFor();
        const response = ownerPage.waitForResponse(item => new URL(item.url()).pathname.endsWith('/workflow/wf/complete') && item.request().method() === 'POST').catch(() => null);
        const tap = async locator => {
          if (device !== 'mobile') return locator.click();
          await waitFor(async () => {
            await locator.scrollIntoViewIfNeeded();
            const box = await locator.boundingBox(), viewport = ownerPage.viewportSize();
            return box && viewport && box.x >= -1 && box.y >= -1 && box.x + box.width <= viewport.width + 1 && box.y + box.height <= viewport.height + 1;
          }, Boolean, 'Mobile manual action did not become fully reachable');
          await tapB2Mobile(locator);
        };
        stage = device + '-' + name + '-agree';
        await tap(dialog.getByRole('button', { name: '同意', exact: true }));
        stage = device + '-' + name + '-confirm';
        await tap(dialog.getByRole('button', { name: '确认', exact: true }));
        const returned = await response;
        assert.ok(returned, 'Actual manual completion response required');
        check(device + name + '页面实际完成人工任务', returned.status() === 200 && (await returned.json()).code === 200); completions++; pageCompletions++;
        await waitFor(() => history(id), values => values.some(item => item.task === pending[0].id && item.user === user && item.type === 'MANUAL'), 'Manual completion history missing');
        await finish(id); await trace(id, device === 'mobile' ? mobiles[0].page : employee, device);
      }
    }
    const approvalId = await launch(normal, 'approval-control');
    check('普通审批自动跳过策略保持有效', !tasks(approvalId).some(item => item.node === 'subject') && history(approvalId).some(item => item.node === 'subject' && item.type === 'AUTO_SKIP'));
    await finish(approvalId);
    // R77 is an existing isolated test definition. Deploy it through the original administrator API.
    successful(await post(admin, base + '/definition/deploy/' + legacyId), '发布已有人工任务诊断定义'); legacyPublished = true;
    const oldId = await launch(legacyId, 'legacy'), oldTask = tasks(oldId);
    check('已有自动跳过配置仍须本人手动办理且原模型保持', oldTask.length === 1 && oldTask[0].user === starter && oldTask[0].type === 'MANUAL' && JSON.stringify(stored(legacyId)) === legacyModel);
    await complete(employee, oldTask[0]); await finish(oldId); await trace(oldId, employee, 'desktop');
    activePage = admin; await admin.setViewportSize({ width: 1440, height: 1040 });
    await admin.goto(new URL('/workflow/design?id=' + legacyId, admin.url()).href, { waitUntil: 'domcontentloaded' });
    const node = admin.locator('[data-node-id="subject"]'); await node.waitFor({ timeout: 60000 }); await node.click();
    const panel = admin.locator('.workflow-studio-panel').filter({ hasText: '节点设置' });
    await panel.getByRole('button', { name: '关闭节点设置', exact: true }).waitFor();
    check('旧人工任务编辑页移除自审选项并说明仍需办理', await panel.getByRole('button', { name: '审批人是发起人本人时', exact: true }).count() === 0
      && await panel.getByText('人工任务必须由指定处理人办理；处理人是发起人本人时仍需完成任务，流程才会继续。', { exact: true }).isVisible()
      && JSON.stringify(stored(legacyId)) === legacyModel);
    await panel.getByPlaceholder('请输入节点名称', { exact: true }).fill('已核对人工办理'); await panel.getByPlaceholder('请输入节点名称', { exact: true }).press('Tab');
    await panel.getByText('允许的操作（默认全部允许）', { exact: true }).click();
    await panel.getByRole('checkbox', { name: '催办：允许发起人发送提醒', exact: true }).click();
    const saving = admin.waitForResponse(item => new URL(item.url()).pathname.endsWith('/workflow/wf/definition/save') && item.request().method() === 'POST').catch(() => null);
    await panel.getByRole('button', { name: '关闭节点设置', exact: true }).click();
    await admin.locator('.workflow-studio-toolbar').getByRole('button', { name: '保存', exact: true }).click();
    const savedResponse = await saving; assert.ok(savedResponse, 'Actual manual model save response required'); const savedBody = await savedResponse.json();
    check('电脑实际保存旧人工任务定义成功', savedResponse.status() === 200 && savedBody.code === 200);
    const savedId = savedBody.data.definitionId ?? savedBody.data.id; assert.ok(savedId); definitions.push(savedId);
    const saved = stored(savedId).nodes.find(item => item.id === 'subject');
    const sent = JSON.parse(savedResponse.request().postDataJSON().modelJson).nodes.find(item => item.id === 'subject');
    check('保存请求和持久新版本清除自审配置并保留操作开关', savedId !== legacyId && !Object.hasOwn(sent, 'approveSelf') && !Object.hasOwn(saved, 'approveSelf')
      && saved.allowUrge === false && saved.title === '已核对人工办理' && JSON.stringify(stored(legacyId)) === legacyModel);
    await admin.goto(new URL('/workflow/design?id=' + savedId, admin.url()).href, { waitUntil: 'domcontentloaded' });
    await admin.locator('[data-node-id="subject"]').click();
    await panel.getByPlaceholder('请输入节点名称', { exact: true }).waitFor();
    check('重新读取保存版本仍无自审选项', await panel.getByPlaceholder('请输入节点名称', { exact: true }).inputValue() === '已核对人工办理'
      && await panel.getByRole('button', { name: '审批人是发起人本人时', exact: true }).count() === 0);
    await admin.screenshot({ path: path.join(directory, 'desktop-manual-config.png') });
    check('人工任务真实页面无浏览器异常', pageErrors.length === 0);
    evidence.b1ManualRequired = true;
    console.log('B1_MANUAL_REQUIRED_ACTUAL: ' + JSON.stringify({ starts: instances.length, completions, pageCompletions, traceViews, rejected, legacyRuntimePreserved: true, legacySaveCleaned: true, ordinaryApprovalPreserved: true, pageErrors: pageErrors.length, forcedWorkflowOutcomeWrites: 0 }));
  } catch (error) {
    failure = error;
    await fs.writeFile(path.join(directory, 'failure-stage.json'), JSON.stringify({ stage, name: error.name, message: String(error.message).split('\n')[0] }, null, 2));
    if (activePage && !activePage.isClosed()) await activePage.screenshot({ path: path.join(directory, 'failure.png') }).catch(() => undefined);
  } finally {
    try {
      for (const mobile of mobiles) await mobile.close();
      for (const id of instances) if (!['PASSED', 'REJECTED', 'TERMINATED'].includes(status(id))) successful(await post(admin, base + '/instance/terminate', { instanceId: id, reason: marker + '-cleanup' }), '结束自有人工任务样本');
      for (const id of definitions) database("UPDATE wf_process_definition SET status='ARCHIVED' WHERE tenant_id=100000 AND definition_id=" + sql(id) + ' AND (process_key LIKE ' + sql(marker + '_%') + ' OR process_key=' + sql('B1MPea73e86b6df3_MANUAL') + ')');
      if (legacyPublished) database("UPDATE wf_process_definition SET status='ARCHIVED' WHERE tenant_id=100000 AND definition_id=" + sql(legacyId) + ' AND process_key=' + sql('B1MPea73e86b6df3_MANUAL'));
      check('人工任务样本收尾且旧模型原权限保持', grants() === originalGrants && instances.every(id => tasks(id).length === 0) && JSON.stringify(stored(legacyId)) === legacyModel
        && database('SELECT status FROM wf_process_definition WHERE tenant_id=100000 AND definition_id=' + sql(legacyId)) === legacyStatus);
      evidence.b1ManualRequiredRestoration = true;
    } catch (error) { failure = new AggregateError([failure, error].filter(Boolean), 'Manual required cleanup failed'); }
    await fs.writeFile(path.join(directory, 'result.json'), JSON.stringify({ passed: !failure, instances, definitions, legacyId, completions, pageCompletions, traceViews, rejected, pageErrors }, null, 2));
  }
  if (failure) throw failure;
}
