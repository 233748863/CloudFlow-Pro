import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export async function verifyB1DesignerUi({ admin, api, successful, database, check, caseTag, evidence }) {
  const marker = 'B1DU' + caseTag, base = '/workflow/wf';
  const sql = value => 'CONVERT(0x' + Buffer.from(String(value)).toString('hex') + ' USING utf8mb4) COLLATE utf8mb4_unicode_ci';
  const rows = statement => database(statement).split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
  const post = (url, body) => api(admin, url, { method: 'POST', body });
  const directory = path.join(path.dirname(path.dirname(fileURLToPath(import.meta.url))), '.cloudflow-runtime/full-prd-20260915/approved-runtime', 'b1-designer-' + caseTag);
  const role = rows("SELECT JSON_OBJECT('id',CAST(role_id AS CHAR),'key',role_key,'name',role_name) FROM sys_role WHERE tenant_id=100000 AND role_id=2 AND deleted=0 AND status='0';")[0];
  const department = rows("SELECT JSON_OBJECT('id',CAST(d.dept_id AS CHAR),'name',d.dept_name) FROM sys_dept d JOIN sys_user u ON u.dept_id=d.dept_id AND u.tenant_id=d.tenant_id WHERE u.tenant_id=100000 AND u.user_name='g_holiday_manager' AND u.deleted=0 AND d.deleted=0;")[0];
  assert.ok(role?.id && role.key && role.name && department?.id && department.name);
  const grants = () => database('SELECT tenant_id,role_id,menu_id FROM sys_role_menu ORDER BY tenant_id,role_id,menu_id;');
  const originalGrants = grants(), definitions = [], errors = [];
  const onError = error => errors.push(error.name);
  const panel = () => admin.locator('.workflow-studio-panel').filter({ hasText: '节点设置' });
  const open = async () => {
    await admin.locator('[data-node-id="subject"]').waitFor({ timeout: 60000 });
    await admin.locator('[data-node-id="subject"]').click();
    await panel().getByRole('button', { name: '关闭节点设置', exact: true }).waitFor();
  };
  const choose = async (label, value) => {
    await panel().getByRole('button', { name: label, exact: true }).click();
    await admin.getByRole('option', { name: value, exact: true }).click();
  };
  const fill = async (label, value) => { const control = panel().getByLabel(label, { exact: true }); await control.fill(String(value)); await control.press('Tab'); };
  const scope = () => panel().locator('section').filter({ has: admin.getByRole('heading', { name: '发起人选人范围', exact: true }) });
  const stored = id => JSON.parse(database('SELECT model_json FROM wf_process_definition WHERE tenant_id=100000 AND definition_id=' + sql(id) + ';')).nodes.find(node => node.id === 'subject');
  const selected = async name => (await scope().getByText(name, { exact: true }).first().locator('..').innerText()).includes('✓');
  let formId, saves = 0, failure;
  const begin = async name => {
    const node = (id, title) => ({ id, title, type: 'APPROVAL', approverType: 'INITIATOR' });
    const model = { nodes: [{ id: 'start', type: 'START', title: '发起' }, node('upstream', '上游审批'), node('subject', name),
      node('downstream', '下游审批'), { id: 'end', type: 'END', title: '结束' }],
      edges: ['start', 'upstream', 'subject', 'downstream'].map((source, index) => ({ id: 'edge-' + index, source, target: ['upstream', 'subject', 'downstream', 'end'][index] })) };
    const saved = successful(await post(base + '/definition/save', { processKey: marker + '-' + name, processName: marker + '-' + name,
      formId, modelJson: JSON.stringify(model), startPermissionType: 'ALL', startPermissionValue: '[]' }), '建立B1设计器初始定义');
    const id = saved.definitionId ?? saved.id; assert.ok(id); definitions.push(id);
    await admin.goto(new URL('/workflow/design?id=' + id, admin.url()).href, { waitUntil: 'domcontentloaded' }); await open(); return id;
  };
  const save = async (id, label, accepts) => {
    await panel().getByRole('button', { name: '关闭节点设置', exact: true }).click();
    const pending = admin.waitForResponse(response => response.url().includes('/wf/definition/save') && response.request().method() === 'POST', { timeout: 15000 }).catch(() => null);
    await admin.locator('.workflow-studio-toolbar').getByRole('button', { name: '保存', exact: true }).click();
    const response = await pending;
    if (!response) {
      const alerts = await admin.getByRole('alert').allTextContents();
      console.log('B1_DESIGNER_SAVE_REJECTED: ' + JSON.stringify({ scenario: label, requestSent: false, alerts }));
      throw new Error('Designer save did not reach server: ' + label);
    }
    const body = await response.json();
    if (response.status() !== 200 || body.code !== 200) console.log('B1_DESIGNER_SAVE_REJECTED: ' + JSON.stringify({ scenario: label, status: response.status(), code: body.code, message: body.msg ?? body.message }));
    assert.equal(response.status(), 200); assert.equal(body.code, 200); saves++;
    check(label + '通过真实设计器保存落库', accepts(stored(id)));
    await admin.reload({ waitUntil: 'domcontentloaded' }); await open();
    check(label + '重新加载配置保持', accepts(stored(id)));
    await admin.screenshot({ path: path.join(directory, String(saves).padStart(2, '0') + '-' + label + '.png'), fullPage: true });
  };
  admin.on('pageerror', onError);
  try {
    await fs.mkdir(directory, { recursive: true });
    await admin.setViewportSize({ width: 1440, height: 1040 });
    const form = successful(await post(base + '/form/save', { formKey: marker, formName: marker, fieldsJson: '[{"id":"note","type":"TEXT","label":"说明"}]' }), '建立B1设计器表单');
    formId = form.formId ?? form.id; assert.ok(formId);
    const id = await begin('approval');
    await panel().getByRole('button', { name: '审批方式', exact: true }).click();
    await admin.getByRole('option').first().waitFor();
    const sources = (await admin.getByRole('option').allTextContents()).map(label => label.trim());
    console.log('B1_DESIGNER_SOURCE_OPTIONS: ' + JSON.stringify(sources));
    check('审批方式完整提供十一种来源', sources.length === 11 && ['按角色','指定人员','指定多人','指定多人（原有列表）','发起人自选审批人','多级部门主管','发起人','部门负责人','直属上级','流程变量用户','按部门'].every(label => sources.includes(label)));
    await admin.getByRole('option', { name: '发起人自选审批人', exact: true }).click();
    await scope().getByText(role.name, { exact: true }).first().click();
    await save(id, 'selection-role', node => node.approverType === 'INITIATOR_SELECTED' && JSON.stringify(node.selectableScope.roleIds.map(String)) === JSON.stringify([role.id]));
    check('选人范围按角色名称重新回显选中状态', await selected(role.name));
    await scope().getByText(department.name, { exact: true }).first().click();
    await save(id, 'selection-intersection', node => node.selectableScope.roleIds.map(String).includes(role.id) && node.selectableScope.deptIds.map(String).includes(department.id));
    check('角色部门交集保存后两项均回显', await selected(role.name) && await selected(department.name));
    await scope().getByText(role.name, { exact: true }).first().click();
    await save(id, 'selection-department', node => node.selectableScope.roleIds.length === 0 && node.selectableScope.deptIds.map(String).includes(department.id));
    check('取消角色限定仍回显已选部门', !(await selected(role.name)) && await selected(department.name));
    await scope().getByText(department.name, { exact: true }).first().click();
    await save(id, 'selection-unrestricted', node => node.selectableScope.roleIds.length === 0 && node.selectableScope.deptIds.length === 0);
    evidence.b1DesignerScope = true;

    await choose('审批方式', '多级部门主管');
    for (const [level, fallback, label] of [[2,'TOP_LEVEL','使用已找到的最高层主管'],[10,'SKIP','跳过节点并保留记录'],[1,'FAIL','停止并提示配置错误']]) {
      await fill('主管层级', level); await choose('层级不足时', label);
      await save(id, 'manager-' + fallback, node => node.approverType === 'MULTI_LEVEL_MANAGER' && Number(node.directorLevel) === level && node.directorFallback === fallback && !node.approverValue);
      check('主管层级和不足策略页面回显-' + fallback, await panel().getByLabel('主管层级', { exact: true }).inputValue() === String(level)
        && (await panel().getByRole('button', { name: '层级不足时', exact: true }).innerText()).includes(label));
    }
    await choose('审批方式', '发起人');
    for (const [policy, label] of [['ALLOW','允许本人审批'],['AUTO_SKIP','自动跳过本人的审批'],['TO_DIRECT_LEADER','转给直属上级'],['TO_DEPT_MANAGER','转给部门负责人']]) {
      await choose('审批人是发起人本人时', label);
      await save(id, 'self-' + policy, node => node.approveSelf === policy);
      check('自审策略真实回显-' + policy, (await panel().getByRole('button', { name: '审批人是发起人本人时', exact: true }).innerText()).includes(label));
    }
    evidence.b1DesignerPolicies = true;
    for (const [policy, label] of [['TO_INITIATOR','退回发起人修改'],['TO_PREVIOUS_NODE','退回上一个审批节点'],
      ['TO_SPECIFIED_NODE','退回指定上游节点'],['TERMINATE','直接结束流程'],['TO_PARENT_NODE','退回父流程节点']]) {
      await choose('驳回策略', label);
      if (policy === 'TO_SPECIFIED_NODE') {
        await panel().getByRole('button', { name: '目标节点', exact: true }).click();
        await admin.getByRole('option').first().waitFor();
        const options = (await admin.getByRole('option').allTextContents()).map(value => value.trim());
        check('回退目标只列发起与上游审批且排除当前下游结束', JSON.stringify(options.sort()) === JSON.stringify(['请选择上游节点','发起','上游审批'].sort()));
        await admin.getByRole('option', { name: '上游审批', exact: true }).click();
      }
      await save(id, 'reject-' + policy, node => node.rejectStrategy === policy && (policy !== 'TO_SPECIFIED_NODE' || node.rejectToNodeKey === 'upstream'));
      check('驳回策略真实回显-' + policy, (await panel().getByRole('button', { name: '驳回策略', exact: true }).innerText()).includes(label));
    }
    evidence.b1DesignerReject = true;
    const switches = { allowAddSign: '加签：允许增加审批人', allowReduceSign: '减签：允许移除未处理的审批人', allowDelegate: '委派或转办：允许交给其他人处理',
      allowUrge: '催办：允许发起人发送提醒', allowRollback: '回退：允许退回上游或发起人', allowCc: '抄送：允许添加知会人', allowSelection: '选人：允许发起时指定审批人' };
    await panel().getByText('允许的操作（默认全部允许）', { exact: true }).click();
    for (const [key, label] of Object.entries(switches)) check('旧定义缺省开关保持允许-' + key, stored(id)[key] === undefined && await panel().getByRole('checkbox', { name: label, exact: true }).isChecked());
    for (const enabled of [false, true]) {
      for (const label of Object.values(switches)) await panel().getByRole('checkbox', { name: label, exact: true }).setChecked(enabled);
      await save(id, 'switches-' + enabled, node => Object.keys(switches).every(key => node[key] === enabled));
      await panel().getByText('允许的操作（默认全部允许）', { exact: true }).click();
      for (const [key, label] of Object.entries(switches)) check('操作开关保存回显-' + key + '-' + enabled, await panel().getByRole('checkbox', { name: label, exact: true }).isChecked() === enabled);
    }
    evidence.b1DesignerSwitches = true;
    const hours = panel().getByPlaceholder('例如: 24', { exact: true }); await hours.fill('2'); await hours.press('Tab');
    for (const [action, label, current] of [['AUTO_REJECT','自动拒绝','自动通过'],['AUTO_PASS','自动通过','自动拒绝']]) {
      await panel().getByRole('button', { name: current, exact: true }).click(); await admin.getByRole('option', { name: label, exact: true }).click();
      await save(id, 'timeout-' + action, node => Number(node.slaHours) === 2 && node.slaAction === action);
      check('超时动作与小时数量回显-' + action, await panel().getByPlaceholder('例如: 24', { exact: true }).inputValue() === '2'
        && await panel().getByRole('button', { name: label, exact: true }).isVisible());
    }
    evidence.b1DesignerTimeout = true;
    await choose('审批方式', '按角色'); await panel().getByText(role.name, { exact: true }).first().click();
    await save(id, 'original-role-source', node => node.approverType === 'ROLE' && node.approverValue === role.key);
    check('原按角色审批仍保存角色代码并回显名称', (await panel().getByText(role.name, { exact: true }).first().locator('..').innerText()).includes('✓'));
    check('B1设计器操作无浏览器运行异常', errors.length === 0);
    evidence.b1DesignerSettings = true;
    console.log('B1_DESIGNER_UI_ACTUAL: ' + JSON.stringify({ realEditorSaves: saves, scopes: 4, managerFallbacks: 3, selfPolicies: 4, rejectPolicies: 5,
      switches: 7, timeoutActions: 2, sourceOptions: 11, originalRoleKeyPreserved: true, desktopBrowser: true, mobileBrowser: false, businessLaunches: 0 }));
  } catch (error) {
    failure = error; await admin.screenshot({ path: path.join(directory, 'failure.png'), fullPage: true }).catch(() => {});
  } finally {
    admin.off('pageerror', onError);
    try {
      for (const id of definitions) database("UPDATE wf_process_definition SET status='ARCHIVED' WHERE tenant_id=100000 AND definition_id=" + sql(id) + ' AND process_key LIKE ' + sql(marker + '%') + ';');
      check('B1设计器自有定义归档且原权限保持', grants() === originalGrants); evidence.b1DesignerRestoration = true;
    } catch (error) { failure = new AggregateError([failure, error].filter(Boolean), 'B1 designer cleanup failed'); }
  }
  if (failure) throw failure;
}
