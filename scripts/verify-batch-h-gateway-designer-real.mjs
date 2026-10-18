import assert from 'node:assert/strict';
import path from 'node:path';

export async function verifyGatewayDesigner({ admin, api, successful, database, check, directory, caseTag }) {
  const quote = value => `CONVERT(X'${Buffer.from(String(value)).toString('hex')}' USING utf8mb4)`;
  const post = (route, body) => api(admin, route, { method: 'POST', body });
  const rows = statement => database(statement).split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
  const origin = new URL(admin.url()).origin;
  const errors = [];
  admin.on('pageerror', error => errors.push(error.message));
  const form = successful(await post('/workflow/wf/form/save', { formKey: `h1_ui_${caseTag}`, formName: `网关页面_${caseTag}`,
    fieldsJson: JSON.stringify([{ id: 'choice', type: 'TEXT', label: '选择', required: true }]) }), '创建真实设计器表单');
  const formId = form.formId ?? form.id;
  const grants = database('SELECT menu_id FROM sys_role_menu WHERE tenant_id=100000 AND role_id=5 ORDER BY menu_id;');
  for (const [type, label] of [['CONDITION', '排他网关'], ['PARALLEL', '并行网关'], ['INCLUSIVE', '包含网关'], ['ROUTE', '路由网关']]) {
    await admin.setViewportSize({ width: 1440, height: 1040 });
    const definition = successful(await post('/workflow/wf/definition/save', { processKey: `h1_ui_${type}_${caseTag}`, processName: `${label}_${caseTag}`, formId,
      modelJson: JSON.stringify({ nodes: [{ id: 'start', type: 'START', title: '发起' },
        { id: 'pre', type: 'APPROVAL', title: '设计前置审批', approverType: 'INITIATOR', allowEdit: true }, { id: 'end', type: 'END', title: '结束' }],
      edges: [{ id: 'start-pre', source: 'start', target: 'pre' }, { id: 'pre-end', source: 'pre', target: 'end' }] }),
      startPermissionType: 'ALL', startPermissionValue: '[]' }), '真实保存设计器初始流程');
    const definitionId = definition.definitionId ?? definition.id;
    const stored = () => JSON.parse(database(`SELECT model_json FROM wf_process_definition WHERE definition_id=${quote(definitionId)};`));
    await admin.goto(`${origin}/workflow/design?id=${definitionId}`);
    const before = admin.locator('[data-node-id="pre"]');
    await before.waitFor({ state: 'visible', timeout: 60000 });
    await before.getByRole('button', { name: '添加节点', exact: true }).click();
    const quick = admin.locator('.workflow-quick-add-menu');
    check(`${type}快捷添加区分会签与四类网关`, await quick.getByRole('button', { name: '会签节点', exact: true }).count() === 1
      && await quick.getByRole('button', { name: '并行网关', exact: true }).count() === 1);
    await quick.getByRole('button', { name: label, exact: true }).click();
    await admin.locator('[data-node-id^="gateway_"]').waitFor();
    const splitId = await admin.locator('[data-node-id^="gateway_"]').getAttribute('data-node-id');
    const branches = await admin.locator('[data-node-id^="branch_"]').evaluateAll(nodes => nodes.map(node => node.getAttribute('data-node-id')));
    check(`${type}真实画布创建两条审批分支`, branches.length === 2);
    for (const branchId of branches) {
      await admin.locator(`[data-node-id="${branchId}"]`).click();
      const panel = admin.locator('.workflow-studio-panel').filter({ hasText: '节点设置' });
      await panel.getByRole('button', { name: '审批方式', exact: true }).click();
      await admin.getByRole('option', { name: '发起人', exact: true }).click();
      await panel.getByRole('button', { name: '关闭节点设置' }).click();
    }
    await admin.locator(`[data-node-id="${splitId}"]`).click();
    const panel = admin.locator('.workflow-studio-panel').filter({ hasText: '节点设置' });
    await panel.getByText('网关出口设置', { exact: true }).waitFor();
    check(`${type}属性区显示网关出口且不混入会签表单`, await panel.getByText('网关出口设置', { exact: true }).isVisible()
      && await panel.getByText('会签模式', { exact: true }).count() === 0);
    if (['INCLUSIVE', 'ROUTE'].includes(type)) {
      await panel.getByRole('button', { name: '默认出口', exact: true }).click();
      await admin.getByRole('option', { name: '无默认出口', exact: true }).click();
      await panel.getByRole('textbox', { name: '出口1条件', exact: true }).fill("#choice == 'two'");
      await panel.getByRole('textbox', { name: '出口1条件', exact: true }).press('Tab');
      await panel.getByRole('textbox', { name: '出口2条件', exact: true }).fill("#choice != 'none'");
      await panel.getByRole('textbox', { name: '出口2条件', exact: true }).press('Tab');
      await panel.getByRole('button', { name: '下移出口1', exact: true }).click();
      check(`${type}出口排序通过实际控件调整`, await panel.getByRole('textbox', { name: '出口1条件', exact: true }).inputValue() === "#choice != 'none'");
    }
    if (type === 'INCLUSIVE') {
      await admin.setViewportSize({ width: 390, height: 844 });
      const dimensions = await panel.boundingBox();
      const defaultControl = await panel.getByRole('button', { name: '默认出口', exact: true }).boundingBox();
      console.log(`GATEWAY_MOBILE_DIMENSIONS: panel=${JSON.stringify(dimensions)}; defaultControl=${JSON.stringify(defaultControl)}`);
      check('包含网关手机属性面板全宽且触控高度至少44像素', Math.abs(dimensions.width - 390) < 1 && defaultControl.height >= 44);
      await admin.screenshot({ path: path.join(directory, `gateway-designer-mobile-${caseTag}.png`), fullPage: true });
      await admin.setViewportSize({ width: 1440, height: 1040 });
    }
    await panel.getByRole('button', { name: '关闭节点设置' }).click();
    const savedResponse = admin.waitForResponse(response => response.url().includes('/wf/definition/save') && response.request().method() === 'POST', { timeout: 60000 });
    await admin.locator('.workflow-studio-toolbar').getByRole('button', { name: '保存', exact: true }).click();
    const saved = await savedResponse;
    const savedBody = await saved.json();
    assert.equal(saved.status(), 200, savedBody.msg || savedBody.message);
    assert.equal(savedBody.code, 200, savedBody.msg || savedBody.message);
    const persisted = stored();
    const split = persisted.nodes.find(node => node.id === splitId);
    const outlets = persisted.edges.filter(edge => edge.source === splitId);
    check(`${type}页面保存后数据库保留原类型及两条出口`, split.type === type && outlets.length === 2);
    if (['INCLUSIVE', 'ROUTE'].includes(type)) {
      check(`${type}条件、调整后的顺序和无默认选择真实落库`, outlets[0].target === branches[1]
        && outlets.map(edge => edge.condition).join('|') === "#choice != 'none'|#choice == 'two'" && outlets.every(edge => !edge.isDefault));
    }
    if (['INCLUSIVE', 'PARALLEL'].includes(type)) {
      check(`${type}配对关系真实落库且未伪造会签配置`, typeof split.joinNodeKey === 'string'
        && persisted.nodes.some(node => node.id === split.joinNodeKey && node.type === 'GATEWAY') && !split.signType);
    }
    await admin.reload();
    await admin.locator(`[data-node-id="${splitId}"]`).waitFor({ state: 'visible', timeout: 60000 });
    check(`${type}重新加载仍显示同一真实网关`, await admin.locator(`[data-node-id="${splitId}"]`).getByText(label, { exact: true }).count() > 0);
    successful(await post(`/workflow/wf/definition/deploy/${definitionId}`), '真实发布页面生成的网关');
    const simulation = successful(await post('/workflow/simulation/run', { definitionId, variables: { choice: 'two' }, simulateAllBranches: false, maxDepth: 50 }), '真实模拟页面生成的网关');
    const detail = simulation.nodeDetails.find(node => node.nodeId === splitId);
    check(`${type}真实模拟与持久出口顺序一致`, simulation.success && detail.branchOrder.join(',') === outlets.map(edge => edge.id).join(','));
    check(`${type}真实模拟激活数符合语义`, detail.activatedBranches.length === (['INCLUSIVE', 'PARALLEL'].includes(type) ? 2 : 1));
    const context = successful(await api(admin, `/workflow/wf/draft/context/${definitionId}`), '真实读取发起上下文');
    const draft = successful(await post('/workflow/wf/draft', { definitionId, expectedVersion: 0, loadedContextHash: context.contextHash,
      title: `网关页面实跑_${type}_${caseTag}`, formData: { choice: 'two' }, nodeAssignees: {} }), '真实保存网关发起草稿');
    const started = successful(await post('/workflow/wf/start', { draftId: draft.draftId, expectedVersion: draft.lockVersion }), '启动页面生成的流程');
    const instanceId = started.instanceId ?? started.processInstanceId;
    for (let round = 0; round < 5; round++) {
      const pending = rows(`SELECT JSON_OBJECT('id',task_id,'node',node_key) FROM wf_task WHERE instance_id=${quote(instanceId)};`);
      if (!pending.length) break;
      for (const task of pending) successful(await post('/workflow/wf/complete', { taskId: task.id, action: 'APPROVE', comment: `designer-${caseTag}-${round}-${task.node}` }), '真实审批页面生成的流程');
    }
    check(`${type}页面生成模型真实运行结束且无残留待办`, database(`SELECT status FROM wf_process_instance WHERE instance_id=${quote(instanceId)};`) === 'PASSED'
      && database(`SELECT COUNT(*) FROM wf_task WHERE instance_id=${quote(instanceId)};`) === '0');
    await admin.screenshot({ path: path.join(directory, `gateway-designer-${type.toLowerCase()}-${caseTag}.png`), fullPage: true });
  }
  check('网关真实设计器全程无浏览器运行异常', errors.length === 0);
  check('网关页面验收未修改员工授权', grants === database('SELECT menu_id FROM sys_role_menu WHERE tenant_id=100000 AND role_id=5 ORDER BY menu_id;'));
}
