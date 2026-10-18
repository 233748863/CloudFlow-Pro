import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createB2MobileBrowser, tapB2Mobile } from './b2-mobile-browser.mjs';

// Business outcomes are produced through the authenticated application only.
export async function verifyB1TaskControls({ admin, employee, api, successful, database, check, caseTag, secrets, evidence }) {
  const marker = 'B1TC' + caseTag, base = '/workflow/wf', enhance = '/workflow/enhance/task';
  const sql = value => 'CONVERT(0x' + Buffer.from(String(value)).toString('hex') + ' USING utf8mb4) COLLATE utf8mb4_unicode_ci';
  const rows = statement => database(statement).split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
  const post = (page, url, body) => api(page, url, { method: 'POST', body });
  const people = rows("SELECT JSON_OBJECT('id',CAST(user_id AS CHAR),'name',user_name) FROM sys_user WHERE tenant_id=100000 AND deleted=0 AND status='0' AND user_name IN ('g_import_admin','g_holiday_employee');");
  const owner = people.find(person => person.name === 'g_import_admin'), starter = people.find(person => person.name === 'g_holiday_employee');
  assert.ok(owner && starter);
  const switches = ['allowAddSign', 'allowReduceSign', 'allowDelegate', 'allowUrge', 'allowRollback', 'allowCc', 'allowSelection'];
  const disabled = Object.fromEntries(switches.map(key => [key, false]));
  const directory = path.join(path.dirname(path.dirname(fileURLToPath(import.meta.url))), '.cloudflow-runtime/full-prd-20260915/approved-runtime', 'b1-controls-' + caseTag);
  const definitions = [], instances = [], drafts = [], errors = [];
  const grants = () => database('SELECT tenant_id,role_id,menu_id FROM sys_role_menu ORDER BY tenant_id,role_id,menu_id;');
  const identities = () => database('SELECT user_id,dept_id,status,deleted,version FROM sys_user WHERE user_id IN (' + people.map(person => person.id).join(',') + ') ORDER BY user_id;');
  const originalGrants = grants(), originalIdentities = identities();
  const status = id => database('SELECT status FROM wf_process_instance WHERE tenant_id=100000 AND instance_id=' + sql(id) + ';');
  const tasks = id => rows("SELECT JSON_OBJECT('id',task_id,'user',CAST(assignee AS CHAR),'node',node_key,'status',status,'type',task_type) FROM wf_task WHERE tenant_id=100000 AND instance_id=" + sql(id) + ' ORDER BY task_id;');
  const groups = id => database('SELECT add_sign_id,task_id,sign_type,status,sign_user_ids,sign_user_names FROM wf_task_add_sign WHERE tenant_id=100000 AND instance_id=' + sql(id) + ' ORDER BY add_sign_id;');
  const snapshot = id => JSON.stringify({ tasks: tasks(id), groups: groups(id),
    instance: database('SELECT status,variables FROM wf_process_instance WHERE tenant_id=100000 AND instance_id=' + sql(id) + ';'),
    history: database('SELECT history_id,task_id,action,node_key FROM wf_task_history WHERE tenant_id=100000 AND instance_id=' + sql(id) + ' ORDER BY history_id;'),
    delegation: database('SELECT COUNT(*) FROM wf_task_delegation WHERE tenant_id=100000 AND instance_id=' + sql(id) + ';'),
    copies: database('SELECT COUNT(*) FROM wf_process_copy WHERE tenant_id=100000 AND instance_id=' + sql(id) + ';'),
    urges: database('SELECT COUNT(*) FROM wf_task_urge WHERE tenant_id=100000 AND task_id IN (SELECT task_id FROM wf_task WHERE tenant_id=100000 AND instance_id=' + sql(id) + ');') });
  const onError = error => errors.push(error.name);
  let formId, mobile, employeeMobile, failure, starts = 0, denials = 0, approvals = 0, screenshots = 0, pageReductions = 0;
  const modelFor = (props, copy = false) => {
    const nodes = [{ id: 'start', type: 'START', title: '发起' },
      ...(copy ? [{ id: 'copy', type: 'COPY', title: '抄送', approverType: 'USERS', approverValue: owner.id, allowCc: props.allowCc }] : []),
      { id: 'upstream', type: 'APPROVAL', title: '上游审批', approverType: 'INITIATOR' },
      { id: 'review', type: 'APPROVAL', title: '开关验收审批', approverType: 'USERS', approverValue: owner.id, rejectStrategy: 'TO_PREVIOUS_NODE', ...props },
      { id: 'end', type: 'END', title: '结束' }];
    return { nodes, edges: nodes.slice(0, -1).map((node, index) => ({ id: 'edge-' + index, source: node.id, target: nodes[index + 1].id })) };
  };
  const saveDefinition = async (name, props, copy = false) => {
    const response = await post(admin, base + '/definition/save', { processKey: marker + '-' + name, processName: marker + '-' + name,
      formId, modelJson: JSON.stringify(modelFor(props, copy)), startPermissionType: 'ALL', startPermissionValue: '[]' });
    const id = response.body?.data?.definitionId ?? response.body?.data?.id;
    if (id) definitions.push(id);
    return { response, id };
  };
  const definition = async (name, props, copy = false) => {
    const saved = await saveDefinition(name, props, copy);
    successful(saved.response, '保存开关验收定义'); assert.ok(saved.id);
    successful(await post(admin, base + '/definition/deploy/' + saved.id), '发布开关验收定义'); return saved.id;
  };
  const draft = async (id, name) => {
    const context = successful(await api(employee, base + '/draft/context/' + id), '读取发起上下文');
    const saved = successful(await post(employee, base + '/draft', { definitionId: id, expectedVersion: 0, loadedContextHash: context.contextHash,
      title: marker + '-' + name, formData: { note: marker }, nodeAssignees: {} }), '建立开关验收草稿');
    assert.ok(saved.draftId); drafts.push(saved.draftId); return saved;
  };
  const approve = async (page, task) => {
    successful(await post(page, base + '/complete', { taskId: task.id, action: 'APPROVE', comment: marker + '-approve-' + approvals }), '实际人员完成审批'); approvals++;
  };
  const launch = async (name, props, copy = false) => {
    const saved = await draft(await definition(name, props, copy), name);
    const result = successful(await post(employee, base + '/start', { draftId: saved.draftId, expectedVersion: saved.lockVersion }), '由实际员工发起');
    const id = result.instanceId ?? result.processInstanceId; assert.ok(id); instances.push(id); starts++;
    assert.equal(tasks(id).length, 1); assert.equal(tasks(id)[0].node, 'upstream');
    await approve(employee, tasks(id)[0]);
    const current = tasks(id), expectedCount = props.signType === 'ALL' ? 2 : 1;
    check(name + '通过上游后审批待办人数及负责人正确', current.length === expectedCount && current.every(task => task.node === 'review') && current.some(task => task.user === owner.id));
    return { id, task: current.find(task => task.user === owner.id) };
  };
  const denied = async (scenario, page, url, body, label) => {
    const before = snapshot(scenario.id), result = await post(page, url, body);
    console.log('B1_CONTROL_DENIAL: ' + JSON.stringify({ label, status: result.status, code: result.body?.code }));
    check(label + '明确返回节点禁止且待办流程历史保持', result.status >= 400 && result.status < 500 && result.body?.code === 'NODE_ACTION_FORBIDDEN' && snapshot(scenario.id) === before);
    denials++;
  };
  const add = (scenario, reason) => post(admin, enhance + '/addSign', { taskId: scenario.task.id, userIds: [starter.id], signType: 'BEFORE', reason: marker + '-' + reason });
  const reduce = scenario => post(admin, enhance + '/removeSign', { taskId: scenario.task.id, userIds: [starter.id], reason: marker + '-reduce' });
  const checkButtons = async (scenario, enabled, terminate = false) => {
    const detail = successful(await api(admin, base + '/todo/' + scenario.task.id), '读取实际待办节点权限');
    check('待办返回七项开关及独立代理缺省', switches.every(key => detail.nodePermissions?.[key] === enabled) && detail.nodePermissions.allowAgent === false);
    for (const [device, page] of [['desktop', admin], ['mobile', mobile.page]]) {
      await page.goto(new URL('/tasks', page.url()).href, { waitUntil: 'domcontentloaded' });
      const row = page.locator('[data-task-id="' + scenario.task.id + '"]'); await row.waitFor({ timeout: 30000 });
      if (device === 'mobile') await tapB2Mobile(row); else await row.click();
      const dialog = page.getByRole('dialog', { name: '任务处理', exact: true });
      await dialog.getByRole('button', { name: '同意', exact: true }).waitFor();
      for (const label of ['加签', '减签', '转办', '驳回', '拒绝']) {
        const button = dialog.getByRole('button', { name: label, exact: true });
        check(device + (enabled ? '缺省允许' : '关闭') + label + (terminate ? '-终止策略' : ''), await button.isVisible() === (enabled || (terminate && label === '拒绝')));
      }
      check(device + '普通同意仍可用', await dialog.getByRole('button', { name: '同意', exact: true }).isEnabled());
      await page.screenshot({ path: path.join(directory, String(++screenshots).padStart(2, '0') + '-' + device + '.png'), fullPage: true });
    }
  };
  const checkUrgeButtons = async (scenario, enabled) => {
    const definitionId = database('SELECT definition_id FROM wf_process_instance WHERE tenant_id=100000 AND instance_id=' + sql(scenario.id) + ';');
    const definitionRead = await api(employee, base + '/definition/' + definitionId);
    check('员工仍无流程定义管理读取权限', definitionRead.status === 403 && !definitionRead.body?.data);
    for (const [device, page] of [['desktop', employee], ['mobile', employeeMobile.page]]) {
      await page.goto(new URL('/my-apps', page.url()).href, { waitUntil: 'domcontentloaded' });
      const search = page.getByPlaceholder('流程标题、编号或摘要', { exact: true });
      await search.fill(marker);
      const filteredPending = page.waitForResponse(response => {
        const url = new URL(response.url());
        return url.pathname.endsWith('/workflow/wf/my-instances') && url.searchParams.get('params[keyword]') === marker;
      }, { timeout: 30000 }).catch(() => null);
      await search.press('Enter');
      const filteredResponse = await filteredPending;
      assert.ok(filteredResponse && filteredResponse.status() === 200 && (await filteredResponse.json()).code === 200, 'Application filter must finish before touching its new rows');
      await search.waitFor();
      const row = page.locator('[data-task-id="' + scenario.id + '"], [data-task-id="' + scenario.task.id + '"]').first();
      await row.waitFor({ timeout: 30000 });
      if (device === 'mobile') await tapB2Mobile(row); else await row.click();
      const dialog = page.getByRole('dialog', { name: '申请详情', exact: true });
      const traceTab = dialog.getByRole('button', { name: '审批记录', exact: true });
      const diagramPending = page.waitForResponse(response => response.url().includes('/workflow/enhance/flowchart/' + scenario.id), { timeout: 30000 }).catch(() => null);
      if (device === 'mobile') await tapB2Mobile(traceTab); else await traceTab.click();
      const diagramResponse = await diagramPending;
      check(device + '无定义管理权限仍能读取本人实例流程图', diagramResponse?.status() === 200 && (await diagramResponse.json()).code === 200);
      await dialog.getByText('处理中', { exact: true }).waitFor();
      check(device + '发起人催办按钮按开关显示', await dialog.getByRole('button', { name: '催办', exact: true }).isVisible() === enabled);
      await page.screenshot({ path: path.join(directory, String(++screenshots).padStart(2, '0') + '-urge-' + device + '.png'), fullPage: true });
    }
  };
  const pendingReduction = async (scenario, page, device, enabled) => {
    const before = snapshot(scenario.id);
    await page.goto(new URL('/tasks', page.url()).href, { waitUntil: 'domcontentloaded' });
    const tap = async locator => device === 'mobile' ? tapB2Mobile(locator) : locator.click();
    await tap(page.getByRole('button', { name: '管理进行中的加签', exact: true }));
    const pendingDialog = page.getByRole('dialog', { name: '进行中的加签', exact: true });
    const row = pendingDialog.locator('[data-task-id="' + scenario.task.id + '"]');
    await row.waitFor({ timeout: 30000 });
    const contextPending = page.waitForResponse(response => response.url().endsWith(enhance + '/' + scenario.task.id + '/signatures'), { timeout: 30000 }).catch(() => null);
    await tap(row.getByRole('button', { name: '管理加签：开关验收审批', exact: true }));
    const contextResponse = await contextPending;
    assert.ok(contextResponse && contextResponse.status() === 200);
    const payload = await contextResponse.json();
    check(device + '加签管理读取实际权限和本组唯一未处理成员', payload.code === 200 && payload.data.canReduce === enabled
      && payload.data.members.length === 1 && String(payload.data.members[0].userId) === starter.id);
    const dialog = page.getByRole('dialog', { name: '减签', exact: true });
    const member = dialog.locator('button[aria-pressed]');
    await member.waitFor();
    const confirm = dialog.getByRole('button', { name: '确认减签', exact: true });
    const screenshot = path.join(directory, String(++screenshots).padStart(2, '0') + '-pending-' + device + '-' + (enabled ? 'allowed' : 'denied') + '.png');
    if (!enabled) {
      await page.screenshot({ path: screenshot, fullPage: true });
      check(device + '禁止减签时管理弹窗隐藏确认且成员不可选择', !await confirm.isVisible() && await member.isDisabled());
      check(device + '管理弹窗明确说明当前禁止减签', await dialog.getByText('当前任务不允许减签。', { exact: true }).isVisible());
      check(device + '查看禁止减签组不修改待办和历史', snapshot(scenario.id) === before);
      await tap(dialog.getByRole('button', { name: '取消', exact: true }));
      await pendingDialog.waitFor();
      await tap(pendingDialog.getByRole('button', { name: '关闭弹窗', exact: true }));
      return;
    }
    check(device + '缺省允许减签仍须选择成员和填写原因', await member.count() === 1 && await member.isEnabled() && await confirm.isDisabled());
    await tap(member);
    await dialog.getByRole('textbox', { name: '减签原因', exact: true }).fill(marker + '-pending-' + device);
    check(device + '填写减签内容后允许提交', await confirm.isEnabled());
    await confirm.scrollIntoViewIfNeeded();
    const box = await confirm.boundingBox(), panel = await dialog.locator('.cf-dialog-panel').boundingBox(), viewport = page.viewportSize();
    check(device + '减签确认可触达且弹窗适配屏幕', box && panel && viewport && box.height >= 44 && box.width >= 44
      && panel.x >= 0 && panel.x + panel.width <= viewport.width && panel.height <= viewport.height);
    await page.screenshot({ path: screenshot, fullPage: true });
    const reducedPending = page.waitForResponse(response => response.request().method() === 'POST' && response.url().endsWith(enhance + '/removeSign'), { timeout: 30000 }).catch(() => null);
    await tap(confirm);
    const reduced = await reducedPending;
    check(device + '管理弹窗真实提交减签成功', reduced?.status() === 200 && (await reduced.json()).code === 200);
    pageReductions++;
    await dialog.waitFor({ state: 'hidden' });
    await pendingDialog.waitFor();
    await pendingDialog.locator('[aria-busy="false"]').waitFor();
    await row.waitFor({ state: 'hidden' });
    check(device + '移除最后成员仅恢复原审批且管理列表刷新', tasks(scenario.id).length === 1 && tasks(scenario.id)[0].id === scenario.task.id
      && tasks(scenario.id)[0].status === 'TODO' && status(scenario.id) === 'RUNNING' && await pendingDialog.getByRole('alert').count() === 0);
    await tap(pendingDialog.getByRole('button', { name: '关闭弹窗', exact: true }));
  };
  admin.on('pageerror', onError);
  try {
    await fs.mkdir(directory, { recursive: true });
    await admin.setViewportSize({ width: 1440, height: 1000 });
    mobile = await createB2MobileBrowser({ admin, secrets, check }); mobile.page.on('pageerror', onError);
    employeeMobile = await createB2MobileBrowser({ admin: employee, secrets, check, landingPath: '/my-apps', landingHeading: '我的申请' });
    employeeMobile.page.on('pageerror', onError); employee.on('pageerror', onError);
    const form = successful(await post(admin, base + '/form/save', { formKey: marker, formName: marker,
      fieldsJson: '[{"id":"note","type":"TEXT","label":"说明"}]' }), '建立开关验收表单');
    formId = form.formId ?? form.id; assert.ok(formId);
    const noReduce = await launch('no-reduce', { allowAddSign: true, allowReduceSign: false });
    successful(await add(noReduce, 'no-reduce'), '真实建立禁止减签场景的加签组');
    const closedContext = successful(await api(admin, enhance + '/' + noReduce.task.id + '/signatures'), '读取禁止减签组');
    check('真实加签组明确返回禁止减签', closedContext.canReduce === false && closedContext.members.length === 1);
    await pendingReduction(noReduce, admin, 'desktop', false);
    await pendingReduction(noReduce, mobile.page, 'mobile', false);
    await denied(noReduce, admin, enhance + '/removeSign', { taskId: noReduce.task.id, userIds: [starter.id], reason: marker }, '有实际加签组时减签关闭');
    await approve(employee, tasks(noReduce.id).find(task => task.user === starter.id));
    await approve(admin, tasks(noReduce.id)[0]); check('禁止减签保留成员正常审批完成路径', status(noReduce.id) === 'PASSED');
    evidence.b1ControlsReduction = true;
    for (const [device, page] of [['desktop', admin], ['mobile', mobile.page]]) {
      const managed = await launch('pending-' + device, {});
      successful(await add(managed, 'pending-' + device), '建立实际页面减签组');
      await pendingReduction(managed, page, device, true);
      await approve(admin, tasks(managed.id)[0]);
      check(device + '页面减签后由原审批人真实完成流程', status(managed.id) === 'PASSED');
    }
    evidence.b1ControlsPendingManagement = true;
    const copyOffDefinition = await definition('copy-off', { allowCc: false }, true), copyDraft = await draft(copyOffDefinition, 'copy-off');
    const draftSnapshot = () => database('SELECT draft_id,lock_version,form_data,node_assignees FROM wf_form_draft WHERE tenant_id=100000 AND draft_id=' + sql(copyDraft.draftId) + ';');
    const beforeDraft = draftSnapshot();
    const copyResult = await post(employee, base + '/start', { draftId: copyDraft.draftId, expectedVersion: copyDraft.lockVersion });
    const unexpectedCopyInstance = copyResult.body?.data?.instanceId ?? copyResult.body?.data?.processInstanceId;
    if (unexpectedCopyInstance) instances.push(unexpectedCopyInstance);
    console.log('B1_CONTROL_COPY_DENIAL: ' + JSON.stringify({ status: copyResult.status, code: copyResult.body?.code }));
    check('关闭抄送在实际发起拒绝且草稿和流程创建回滚', copyResult.status >= 400 && copyResult.status < 500 && copyResult.body?.code === 'NODE_ACTION_FORBIDDEN' && draftSnapshot() === beforeDraft
      && database('SELECT COUNT(*) FROM wf_process_instance WHERE tenant_id=100000 AND definition_id=' + sql(copyOffDefinition) + ';') === '0');
    const copyOn = await launch('copy-on', { allowCc: true }, true);
    check('允许抄送实际产生收件记录', database('SELECT COUNT(*) FROM wf_process_copy WHERE tenant_id=100000 AND instance_id=' + sql(copyOn.id) + ';') === '1');
    await approve(admin, copyOn.task);
    evidence.b1ControlsCopy = true;
    const off = await launch('disabled', disabled);
    await checkButtons(off, false);
    await checkUrgeButtons(off, false);
    await denied(off, admin, enhance + '/addSign', { taskId: off.task.id, userIds: [starter.id], signType: 'BEFORE', reason: marker }, '增强加签关闭');
    for (const mode of ['DELEGATE', 'TRANSFER']) await denied(off, admin, enhance + '/delegate', { taskId: off.task.id, toUserId: starter.id, toUserName: starter.name, mode, reason: marker }, mode + '关闭');
    await denied(off, admin, base + '/complete', { taskId: off.task.id, action: 'DELEGATE', delegateUserId: starter.id, comment: marker }, '完成入口转办关闭');
    await denied(off, employee, base + '/task/urge', { taskId: off.task.id, reason: marker }, '实际发起人催办关闭');
    await denied(off, admin, base + '/reject', { taskId: off.task.id, targetNodeKey: 'upstream', strategy: 'TO_PREVIOUS_NODE', comment: marker }, '回退到已执行上游关闭');
    await denied(off, admin, base + '/complete', { taskId: off.task.id, action: 'REJECT', comment: marker }, '普通拒绝按回退策略关闭');
    await approve(admin, off.task); check('全部开关关闭仍可同意完成', status(off.id) === 'PASSED' && tasks(off.id).length === 0);
    const countersign = await launch('countersign-disabled', { ...disabled, approverValue: owner.id + ',' + starter.id, signType: 'ALL' });
    await denied(countersign, admin, base + '/task/add-signature', { taskId: countersign.task.id, userIds: [starter.id], comment: marker }, '真实会签原加签入口关闭');
    await denied(countersign, admin, base + '/task/reduction-signature', { taskId: countersign.task.id, userIds: [starter.id], comment: marker }, '真实会签原减签入口关闭');
    await approve(admin, countersign.task); await approve(employee, tasks(countersign.id)[0]);
    check('原加减签禁止后两名会签人仍正常完成', status(countersign.id) === 'PASSED');
    evidence.b1ControlsDenials = true;

    const allowed = await launch('default', {});
    await checkButtons(allowed, true);
    await checkUrgeButtons(allowed, true);
    evidence.b1ControlsUrgeButtons = true;
    successful(await post(employee, base + '/task/urge', { taskId: allowed.task.id, reason: marker + '-allowed' }), '缺省允许发起人真实催办');
    check('允许催办保存实际催办记录', database('SELECT COUNT(*) FROM wf_task_urge WHERE tenant_id=100000 AND task_id=' + sql(allowed.task.id) + ';') === '1');
    successful(await add(allowed, 'allowed'), '缺省允许真实前加签');
    check('加签暂停原审批并分派成员', tasks(allowed.id).length === 2 && tasks(allowed.id).some(task => task.id === allowed.task.id && task.status === 'SUSPENDED') && tasks(allowed.id).some(task => task.user === starter.id && task.status === 'TODO'));
    const context = successful(await api(admin, enhance + '/' + allowed.task.id + '/signatures'), '读取允许减签的真实组');
    check('缺省组允许减签', context.canReduce === true);
    successful(await reduce(allowed), '缺省允许实际移除最后成员');
    check('减签恢复原待办且没有代替负责人审批', tasks(allowed.id).length === 1 && tasks(allowed.id)[0].id === allowed.task.id && tasks(allowed.id)[0].status === 'TODO' && status(allowed.id) === 'RUNNING');
    successful(await post(admin, enhance + '/delegate', { taskId: allowed.task.id, toUserId: starter.id, mode: 'TRANSFER', reason: marker + '-allowed' }), '缺省允许实际转办');
    check('允许转办实际交给指定员工', tasks(allowed.id).length === 1 && tasks(allowed.id)[0].user === starter.id);
    await approve(employee, tasks(allowed.id)[0]); check('转办人员完成后流程通过', status(allowed.id) === 'PASSED');
    evidence.b1ControlsDefaults = true;

    const back = await launch('rollback-default', {});
    successful(await post(admin, base + '/reject', { taskId: back.task.id, strategy: 'TO_PREVIOUS_NODE', comment: marker }), '缺省允许真实回退');
    check('回退生成上游人员真实待办', tasks(back.id).length === 1 && tasks(back.id)[0].node === 'upstream' && tasks(back.id)[0].user === starter.id);
    await approve(employee, tasks(back.id)[0]); await approve(admin, tasks(back.id)[0]);
    check('回退后重审完整通过', status(back.id) === 'PASSED');
    const terminate = await launch('terminate', { ...disabled, rejectStrategy: 'TERMINATE' });
    await checkButtons(terminate, false, true);
    successful(await post(admin, base + '/complete', { taskId: terminate.task.id, action: 'REJECT', comment: marker }), '禁回退时按终止策略实际拒绝');
    check('禁回退仍允许拒绝终止且无待办', status(terminate.id) === 'REJECTED' && tasks(terminate.id).length === 0);
    evidence.b1ControlsRollback = true;

    const invalid = await saveDefinition('selection-forbidden', { approverType: 'INITIATOR_SELECTED', approverValue: undefined, allowSelection: false });
    console.log('B1_CONTROL_SELECTION_DENIAL: ' + JSON.stringify({ entry: 'definition', status: invalid.response.status, code: invalid.response.body?.code }));
    check('选人关闭时禁止保存发起人自选定义', invalid.response.status >= 400 && invalid.response.status < 500 && invalid.response.body?.code === 'INVALID_REQUEST' && !invalid.id
      && database('SELECT COUNT(*) FROM wf_process_definition WHERE tenant_id=100000 AND process_key=' + sql(marker + '-selection-forbidden') + ';') === '0');
    const selectionOffDefinition = await definition('selection-off', { allowSelection: false });
    const candidates = successful(await api(employee, base + '/definition/' + selectionOffDefinition + '/start-assignee-nodes'), '查询关闭选人的发起入口');
    check('关闭选人的直接人员节点不提供候选选人入口', Array.isArray(candidates) && candidates.length === 0);
    const selectionDraft = await draft(selectionOffDefinition, 'selection-off');
    const selectedBefore = database('SELECT lock_version,node_assignees FROM wf_form_draft WHERE draft_id=' + sql(selectionDraft.draftId) + ';');
    const selectionContext = successful(await api(employee, base + '/draft/context/' + selectionOffDefinition), '读取伪造选择前上下文');
    const selectedResult = await post(employee, base + '/draft', { definitionId: selectionOffDefinition, draftId: selectionDraft.draftId, expectedVersion: selectionDraft.lockVersion,
      loadedContextHash: selectionContext.contextHash, title: marker + '-selection-off', formData: { note: marker }, nodeAssignees: { review: [starter.id] } });
    console.log('B1_CONTROL_SELECTION_DENIAL: ' + JSON.stringify({ entry: 'draft', status: selectedResult.status, code: selectedResult.body?.code }));
    check('不能为直接人员节点伪造发起选择且原草稿保持', selectedResult.status >= 400 && selectedResult.status < 500 && selectedResult.body?.code === 'INVALID_REQUEST'
      && database('SELECT lock_version,node_assignees FROM wf_form_draft WHERE draft_id=' + sql(selectionDraft.draftId) + ';') === selectedBefore);
    evidence.b1ControlsSelection = true;
    check('电脑与手机任务页无未捕获脚本异常', errors.length === 0); evidence.b1ControlsButtons = true;
    console.log('B1_TASK_CONTROLS_ACTUAL: ' + JSON.stringify({ realStarts: starts, humanApprovals: approvals, exactPolicyDenials: denials, screenshots,
      desktopBrowser: true, mobileBrowser: true, copyViaStart: true, selectionViaDefinitionAndDraft: true, forcedWorkflowOutcomeWrites: 0,
      urgeButtonsVerified: true, pendingReductionButtonsVerified: true, realPageReductions: pageReductions }));
  } catch (error) {
    failure = error;
    for (const [name, page] of [['admin', admin], ['employee', employee], ['mobile', mobile?.page], ['employee-mobile', employeeMobile?.page]]) {
      if (page && !page.isClosed()) await page.screenshot({ path: path.join(directory, 'failure-' + name + '.png'), fullPage: true }).catch(() => {});
    }
  }
  finally {
    try {
      for (const id of instances) if (['RUNNING', 'PAUSED', 'PENDING', 'FAILED', 'WITHDRAWN', 'TASK_BACK', 'RESTARTED'].includes(status(id)))
        successful(await post(admin, base + '/instance/terminate', { instanceId: id, reason: marker + '-cleanup' }), '管理入口终止自有未完成流程');
      for (const id of definitions) database("UPDATE wf_process_definition SET status='ARCHIVED',deleted=0 WHERE tenant_id=100000 AND definition_id=" + sql(id) + ' AND process_key LIKE ' + sql(marker + '%') + ';');
      for (const id of drafts) database('DELETE FROM wf_form_draft WHERE tenant_id=100000 AND draft_id=' + sql(id) + ' AND title LIKE ' + sql(marker + '%') + ';');
      check('开关验收原身份权限保持且自有草稿清理', identities() === originalIdentities && grants() === originalGrants
        && database('SELECT COUNT(*) FROM wf_form_draft WHERE tenant_id=100000 AND title LIKE ' + sql(marker + '%') + ';') === '0');
      evidence.b1ControlsRestoration = true;
    } catch (error) { failure = new AggregateError([failure, error].filter(Boolean), 'B1 controls verification or restoration failed'); }
    admin.off('pageerror', onError);
    employee.off('pageerror', onError);
    if (mobile) { mobile.page.off('pageerror', onError); await mobile.close(); }
    if (employeeMobile) { employeeMobile.page.off('pageerror', onError); await employeeMobile.close(); }
  }
  if (failure) throw failure;
}
