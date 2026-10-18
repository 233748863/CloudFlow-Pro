import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createB2MobileBrowser, tapB2Mobile } from './b2-mobile-browser.mjs';

// Selections, draft saves, restores and starts use the real page. SQL prepares only owned identities.
export async function verifyB1LaunchSelection({ admin, employee, api, successful, session, database, check, caseTag, secrets, evidence }) {
  const marker = 'B1SU' + caseTag, base = '/workflow/wf';
  const sql = value => value == null ? 'NULL' : 'CONVERT(0x' + Buffer.from(String(value)).toString('hex') + ' USING utf8mb4) COLLATE utf8mb4_unicode_ci';
  const rows = statement => database(statement).split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
  const post = (page, url, body) => api(page, url, { method: 'POST', body });
  const directory = path.join(path.dirname(path.dirname(fileURLToPath(import.meta.url))), '.cloudflow-runtime/full-prd-20260915/approved-runtime', 'b1-selection-' + caseTag);
  const manager = await session('g_holiday_manager');
  const token = await manager.evaluate(async () => (await import('/src/utils/authStorage.ts')).getAuthToken());
  assert.ok(token); secrets.add(token.replace(/^Bearer /, ''));
  const people = rows("SELECT JSON_OBJECT('id',CAST(user_id AS CHAR),'name',user_name,'dept',CAST(dept_id AS CHAR)) FROM sys_user WHERE tenant_id=100000 AND deleted=0 AND status='0' AND user_name IN ('g_import_admin','g_holiday_employee','g_holiday_manager');");
  assert.equal(people.length, 3);
  const actor = (name, page) => ({ ...people.find(item => item.name === name), page });
  const owner = actor('g_import_admin', admin), starter = actor('g_holiday_employee', employee), reviewer = actor('g_holiday_manager', manager);
  const definitions = [], instances = [], departments = [], roles = [], errors = [];
  const originalIdentity = () => database('SELECT user_id,dept_id,status,deleted,version FROM sys_user WHERE user_id IN (' + people.map(item => item.id).join(',') + ') ORDER BY user_id;');
  const grants = () => database('SELECT tenant_id,role_id,menu_id FROM sys_role_menu ORDER BY tenant_id,role_id,menu_id;');
  const identityBefore = originalIdentity(), grantsBefore = grants();
  const tasks = id => rows("SELECT JSON_OBJECT('id',task_id,'user',CAST(assignee AS CHAR),'status',status,'type',task_type) FROM wf_task WHERE tenant_id=100000 AND instance_id=" + sql(id) + ' ORDER BY task_id;');
  const status = id => database('SELECT status FROM wf_process_instance WHERE tenant_id=100000 AND instance_id=' + sql(id) + ';');
  const draftRow = id => {
    const result = rows("SELECT JSON_OBJECT('id',draft_id,'version',lock_version,'title',title,'selections',CAST(node_assignees AS JSON),'form',CAST(form_data AS JSON)) FROM wf_form_draft WHERE tenant_id=100000 AND user_id=" + starter.id + ' AND definition_id=' + sql(id) + ';')[0];
    if (result) result.selections = Object.fromEntries(Object.entries(result.selections || {}).map(([node, ids]) => [node, ids.map(id => {
      assert.ok(typeof id === 'string' || Number.isSafeInteger(id), 'Fixture IDs must be exact'); return String(id);
    })]));
    return result;
  };
  const waitFor = async (read, accept, message) => { const end = Date.now() + 30000; do { const value = await read(); if (accept(value)) return value; await new Promise(resolve => setTimeout(resolve, 200)); } while (Date.now() < end); throw new Error(message); };
  const onError = error => errors.push(error.name);
  let mobile, failure, formId, screenshots = 0, pageStarts = 0, pageSaveRequests = 0, approvals = 0;
  const onRequest = request => { if (request.method() === 'POST' && new URL(request.url()).pathname.endsWith(base + '/draft')) pageSaveRequests++; };
  const screenshot = async (page, label) => { await page.screenshot({ path: path.join(directory, String(++screenshots).padStart(2, '0') + '-' + label + '.png'), fullPage: true }); };
  const tap = async (page, locator) => page === mobile?.page ? tapB2Mobile(locator) : locator.click();
  const editor = (page, definition) => page.getByRole('dialog', { name: '发起流程 · ' + definition.name, exact: true });
  const group = (page, definition) => editor(page, definition).getByRole('group', { name: /^选定审批/ });
  const closePicker = async page => {
    const picker = page.getByRole('dialog', { name: '请选择审批人', exact: true });
    if (!await picker.isVisible()) return;
    if (page === mobile?.page) {
      const done = picker.getByRole('button', { name: '完成选择', exact: true });
      await tap(page, await done.isVisible() ? done : picker.getByRole('button', { name: '关闭弹窗', exact: true }));
    } else await picker.getByRole('searchbox').press('Escape');
    await picker.waitFor({ state: 'hidden' });
    assert.ok(await page.getByRole('dialog', { name: /^发起流程 · / }).isVisible(), 'Closing candidate picker must retain the launch editor');
  };
  const open = async (page, definition, restore = false) => {
    await page.goto(new URL('/workplace', page.url()).href, { waitUntil: 'domcontentloaded' });
    const search = page.getByPlaceholder('流程模型名称、Key、描述信息', { exact: true });
    await search.fill(definition.name);
    await tap(page, page.getByRole('button').filter({ hasText: definition.name }));
    const dialog = editor(page, definition); await dialog.waitFor();
    if (restore) await tap(page, dialog.getByRole('button', { name: '恢复草稿', exact: true }));
    await waitFor(() => dialog.getByPlaceholder('可选，最多200字').isEnabled(), Boolean, 'Draft editor not ready');
    return dialog;
  };
  const save = async (page, definition, selected) => {
    const dialog = editor(page, definition), button = dialog.getByRole('button', { name: '保存草稿', exact: true });
    if (await button.isEnabled()) await tap(page, button);
    await waitFor(() => dialog.getByRole('status').allTextContents(), contents => contents.some(text => /^已保存 /.test(text)), 'Page did not acknowledge draft save');
    const saved = await waitFor(() => draftRow(definition.id), value => value && value.title === definition.name
      && JSON.stringify(value.selections || {}) === JSON.stringify(selected) && value.form.note === marker, 'Page draft content differs from database');
    check('页面保存选人、顺序及表单内容准确落库', saved.version >= 1);
    return saved;
  };
  const restore = async (page, definition, saved, viaList) => {
    await tap(page, editor(page, definition).getByRole('button', { name: '取消', exact: true }));
    await editor(page, definition).waitFor({ state: 'hidden' });
    if (viaList) {
      await page.goto(new URL('/workflow/drafts', page.url()).href, { waitUntil: 'domcontentloaded' });
      await page.getByRole('heading', { name: '我的草稿', exact: true }).waitFor();
      const search = page.getByPlaceholder('流程名称或申请标题', { exact: true });
      await search.fill(definition.name); await search.press('Enter');
      const row = page.getByRole('row').filter({ hasText: definition.name });
      await row.waitFor(); await tap(page, row.getByRole('button', { name: '继续填写', exact: true }));
      await waitFor(() => editor(page, definition).getByPlaceholder('可选，最多200字').isEnabled(), Boolean, 'Draft list restore not ready');
    } else await open(page, definition, true);
    check('恢复草稿保留原版本、选人顺序及内容', JSON.stringify(draftRow(definition.id)) === JSON.stringify(saved)
      && await editor(page, definition).getByPlaceholder('可选，最多200字').inputValue() === definition.name
      && await editor(page, definition).locator('#field-note').getByRole('textbox').inputValue() === marker);
  };
  const choose = async (page, definition, ids, candidates) => {
    const combobox = group(page, definition).getByRole('combobox', { name: '请选择审批人', exact: true });
    for (const id of ids) {
      const step = ids.indexOf(id) + 1;
      const report = async stage => console.log('B1_SELECTION_PICKER: ' + JSON.stringify({ device: page === mobile?.page ? 'mobile' : 'desktop',
        step, stage, expanded: await combobox.getAttribute('aria-expanded'), visible: await page.getByRole('dialog', { name: '请选择审批人', exact: true }).isVisible() }));
      await report('before-open');
      if (await combobox.getAttribute('aria-expanded') !== 'true') {
        // The centre can be an existing chip's remove button. Touch the trigger's own right padding.
        await combobox.scrollIntoViewIfNeeded();
        const box = await combobox.boundingBox(), viewport = page.viewportSize();
        assert.ok(box && viewport && box.width > 8 && box.x >= -1 && box.y >= -1
          && box.x + box.width <= viewport.width + 1 && box.y + box.height <= viewport.height + 1);
        const position = { x: box.width - 4, y: box.height / 2 };
        assert.ok(await combobox.evaluate((element, point) => {
          const rect = element.getBoundingClientRect();
          return document.elementFromPoint(rect.left + point.x, rect.top + point.y) === element;
        }, position), 'Picker opening must target the combobox itself, never a chip removal control');
        if (page === mobile?.page) await combobox.tap({ position });
        else await combobox.click({ position });
      }
      const picker = page.getByRole('dialog', { name: '请选择审批人', exact: true });
      await report('after-open');
      await picker.waitFor();
      const name = candidates.find(item => item.userId === id)?.userName; assert.ok(name);
      await picker.getByRole('searchbox').fill(name);
      const option = picker.getByRole('option').filter({ hasText: name });
      assert.equal(await option.count(), 1, 'Selected fixture name must identify one actual candidate');
      await tap(page, option);
      await report('after-selection');
    }
    await closePicker(page);
  };
  const definition = async (name, props) => {
    const fullName = marker + '-' + name;
    const model = { nodes: [{ id: 'start', type: 'START', title: '发起' },
      { id: 'review', type: 'APPROVAL', title: '选定审批', approverType: 'INITIATOR_SELECTED', approveSelf: 'ALLOW', allowAgent: false, ...props },
      { id: 'end', type: 'END', title: '结束' }], edges: [{ id: 's-r', source: 'start', target: 'review' }, { id: 'r-e', source: 'review', target: 'end' }] };
    const result = successful(await post(admin, base + '/definition/save', { processKey: fullName, processName: fullName,
      formId, modelJson: JSON.stringify(model), startPermissionType: 'ALL', startPermissionValue: '[]' }), '保存自有选人定义');
    const id = result.definitionId ?? result.id; assert.ok(id); definitions.push(id);
    successful(await post(admin, base + '/definition/deploy/' + id), '发布自有选人定义');
    return { id, name: fullName, props };
  };
  const submit = async (page, definition, selected) => {
    const pending = page.waitForResponse(response => response.request().method() === 'POST' && response.url().endsWith(base + '/start'), { timeout: 30000 }).catch(() => null);
    await tap(page, editor(page, definition).getByRole('button', { name: '提交申请', exact: true }));
    const response = await pending; assert.ok(response); const body = await response.json();
    const id = body.data?.instanceId ?? body.data?.processInstanceId;
    if (id) instances.push(id);
    check('真实页面提交成功且仅发起一个流程', response.status() === 200 && body.code === 200 && id
      && database('SELECT COUNT(*) FROM wf_process_instance WHERE tenant_id=100000 AND definition_id=' + sql(definition.id) + ';') === '1');
    pageStarts++; await editor(page, definition).waitFor({ state: 'hidden' });
    check('提交消费本人草稿并固定所选审批人快照', !draftRow(definition.id)
      && database("SELECT COUNT(*) FROM wf_task_candidate WHERE tenant_id=100000 AND instance_id=" + sql(id) + " AND node_key='review' AND source='INITIATOR_SELECTED' AND task_id IS NULL;") === String(selected.length));
    const expected = selected.length ? selected : [reviewer.id];
    for (const userId of expected) {
      const pendingTasks = tasks(id);
      check('仅按页面所选人员及顺序生成当前待办', pendingTasks.length === 1 && pendingTasks[0].user === userId && status(id) === 'RUNNING');
      const person = [owner, starter, reviewer].find(item => item.id === userId); assert.ok(person);
      successful(await post(person.page, base + '/complete', { taskId: pendingTasks[0].id, action: 'APPROVE', comment: marker }), '实际所选审批人完成本人审批'); approvals++;
    }
    check('所选审批人完成后流程通过且无遗留待办', status(id) === 'PASSED' && tasks(id).length === 0);
  };
  await fs.mkdir(directory, { recursive: true });
  try {
    await employee.setViewportSize({ width: 1440, height: 1000 });
    employee.on('pageerror', onError); employee.on('request', onRequest);
    mobile = await createB2MobileBrowser({ admin: employee, secrets, check, landingPath: '/workplace', landingHeading: '工作台' });
    mobile.page.on('pageerror', onError); mobile.page.on('request', onRequest);
    const department = database("INSERT INTO sys_dept(tenant_id,parent_id,ancestors,dept_name,status,deleted,create_by) VALUES(100000,0,'0'," + sql(marker) + ",'0',0," + sql(marker) + ');SELECT LAST_INSERT_ID();');
    assert.match(department, /^[1-9][0-9]*$/); departments.push(department);
    database('UPDATE sys_user SET dept_id=' + department + ' WHERE tenant_id=100000 AND user_id IN (' + starter.id + ',' + reviewer.id + ');');
    const createRole = suffix => {
      const id = database('INSERT INTO sys_role(tenant_id,role_name,role_key,role_sort,status,deleted,create_by) VALUES(100000,' + sql(marker + suffix) + ',' + sql(marker + suffix) + ",99,'0',0," + sql(marker) + ');SELECT LAST_INSERT_ID();');
      assert.match(id, /^[1-9][0-9]*$/); roles.push(id); return id;
    };
    const role = createRole('-members'), emptyRole = createRole('-empty');
    database('INSERT INTO sys_user_role(user_id,role_id,tenant_id) VALUES(' + owner.id + ',' + role + ',100000),(' + reviewer.id + ',' + role + ',100000);');
    const form = successful(await post(admin, base + '/form/save', { formKey: marker, formName: marker,
      fieldsJson: '[{"id":"note","type":"TEXT","label":"说明"}]' }), '创建选人页面表单');
    formId = form.formId ?? form.id; assert.ok(formId);
    const cases = [
      { name: 'role', props: { selectableScope: { roleIds: [role] } }, candidates: [owner.id, reviewer.id] },
      { name: 'department', props: { selectableScope: { deptIds: [department] } }, candidates: [starter.id, reviewer.id] },
      { name: 'intersection', props: { selectableScope: { roleIds: [role], deptIds: [department] } }, candidates: [reviewer.id] },
      { name: 'all', props: {} },
      { name: 'ordered', props: { signType: 'SEQUENTIAL', selectableScope: { roleIds: [role] } }, candidates: [owner.id, reviewer.id], selected: [reviewer.id, owner.id] },
      { name: 'selection-off', props: { approverType: 'USER', approverValue: reviewer.id, allowSelection: false }, selected: [] },
      { name: 'empty', props: { selectableScope: { roleIds: [emptyRole] } }, candidates: [], empty: true }
    ];
    const orderedCases = [...cases].sort((left, right) => Number(right.name === 'ordered') - Number(left.name === 'ordered'));
    for (const [device, page] of [['mobile', mobile.page], ['desktop', employee]]) for (const scenario of orderedCases) {
      console.log('B1_SELECTION_SCENARIO: device=' + device + '; scenario=' + scenario.name);
      const current = await definition(device + '-' + scenario.name, scenario.props), selected = scenario.selected ?? [reviewer.id];
      const context = successful(await api(employee, base + '/draft/context/' + current.id), '读取本人真实候选范围');
      const node = context.assigneeNodes[0];
      check(device + scenario.name + '候选范围及单多选返回正确', scenario.name === 'selection-off' ? context.assigneeNodes.length === 0
        : context.assigneeNodes.length === 1 && node.multiple === Boolean(scenario.props.signType)
          && (scenario.candidates ? JSON.stringify(node.candidates.map(item => item.userId).sort()) === JSON.stringify([...scenario.candidates].sort())
            : [owner.id, starter.id, reviewer.id].every(id => node.candidates.some(item => item.userId === id))));
      let dialog = await open(page, current);
      await dialog.getByPlaceholder('可选，最多200字').fill(current.name); await dialog.locator('#field-note').getByRole('textbox').fill(marker);
      const partial = await save(page, current, {});
      if (node) {
        let starts = 0; const countStart = request => { if (request.method() === 'POST' && request.url().endsWith(base + '/start')) starts++; };
        page.on('request', countStart);
        try {
          await tap(page, dialog.getByRole('button', { name: '提交申请', exact: true }));
          await dialog.getByRole('alert').filter({ hasText: '请为所有需要指定审批人的节点完成选择。' }).waitFor();
          check(device + scenario.name + '未选审批人前端阻止提交且原草稿保持', starts === 0 && JSON.stringify(draftRow(current.id)) === JSON.stringify(partial));
        } finally { page.off('request', countStart); }
        const combo = group(page, current).getByRole('combobox', { name: '请选择审批人', exact: true });
        await tap(page, combo);
        const picker = page.getByRole('dialog', { name: '请选择审批人', exact: true });
        await picker.waitFor();
        check(device + scenario.name + '界面仅展示服务端允许的候选人', await picker.getByRole('option').count() === node.candidates.length);
        if (scenario.empty) {
          await picker.getByText('允许范围内暂无可选人员，请联系流程管理员', { exact: true }).waitFor();
          await screenshot(page, device + '-empty'); await closePicker(page);
          await tap(page, dialog.getByRole('button', { name: '取消', exact: true }));
          check(device + '空范围保持草稿且没有生成流程', database('SELECT COUNT(*) FROM wf_process_instance WHERE definition_id=' + sql(current.id) + ';') === '0');
          continue;
        }
        await closePicker(page);
        if (node.multiple) {
          await choose(page, current, [owner.id, reviewer.id], node.candidates);
          const name = node.candidates.find(item => item.userId === owner.id).userName;
          await tap(page, group(page, current).getByRole('button', { name: '移除' + name, exact: true }));
          await choose(page, current, [owner.id], node.candidates);
        } else {
          await choose(page, current, selected, node.candidates);
          await tap(page, combo.getByRole('button', { name: '清空', exact: true }));
          check(device + scenario.name + '单选清空恢复提示', (await combo.textContent()).includes('请选择审批人'));
          await choose(page, current, selected, node.candidates);
        }
      } else check(device + '关闭选人不显示审批人选择控件', await dialog.getByRole('combobox', { name: '请选择审批人', exact: true }).count() === 0);
      const selections = selected.length ? { review: selected } : {};
      const saved = await save(page, current, selections);
      await restore(page, current, saved, device === 'mobile'); dialog = editor(page, current);
      if (node) for (const id of selected) check(device + '恢复后按姓名回显原所选人员', (await group(page, current).textContent()).includes(node.candidates.find(item => item.userId === id).userName));
      await screenshot(page, device + '-' + scenario.name + '-restored');
      await submit(page, current, selected);
    }
    check('发起选人双端页面无未捕获异常', errors.length === 0);
    evidence.b1LaunchScopes = true; evidence.b1LaunchDrafts = true; evidence.b1LaunchStarts = true; evidence.b1LaunchEmpty = true;
    console.log('B1_LAUNCH_SELECTION_ACTUAL: ' + JSON.stringify({ realStarts: pageStarts, humanApprovals: approvals, screenshots, pageSaveRequests,
      desktopBrowser: true, mobileBrowser: true, candidateScopes: 4, orderedSelection: true, emptyScope: true, selectionDisabled: true,
      draftRestorationViaCatalog: true, draftRestorationViaList: true, forcedWorkflowOutcomeWrites: 0 }));
  } catch (error) {
    failure = error;
    for (const [name, page] of [['desktop', employee], ['mobile', mobile?.page]]) if (page && !page.isClosed())
      await page.screenshot({ path: path.join(directory, 'failure-' + name + '.png'), fullPage: true }).catch(() => {});
  } finally {
    employee.off('pageerror', onError); employee.off('request', onRequest);
    if (mobile) { mobile.page.off('pageerror', onError); mobile.page.off('request', onRequest); await mobile.close(); }
    try {
      // Unmount a failed editor before cleanup so its autosave cannot recreate a removed fixture draft.
      await employee.goto(new URL('/my-apps', employee.url()).href, { waitUntil: 'domcontentloaded' });
      const actual = rows("SELECT JSON_OBJECT('id',instance_id) FROM wf_process_instance WHERE tenant_id=100000 AND definition_id IN (SELECT definition_id FROM wf_process_definition WHERE process_key LIKE " + sql(marker + '-%') + ');');
      for (const { id } of actual) if (['RUNNING','PAUSED','PENDING','FAILED','WITHDRAWN','TASK_BACK','RESTARTED'].includes(status(id)))
        successful(await post(admin, base + '/instance/terminate', { instanceId: id, reason: marker + '-cleanup' }), '实际管理入口结束自有未完流程');
      for (const person of [starter, reviewer]) database('UPDATE sys_user SET dept_id=' + sql(person.dept) + ' WHERE tenant_id=100000 AND user_id=' + person.id + ';');
      for (const id of definitions) {
        database('DELETE FROM wf_form_draft WHERE tenant_id=100000 AND user_id=' + starter.id + ' AND definition_id=' + sql(id) + ';');
        database("UPDATE wf_process_definition SET status='ARCHIVED',deleted=0 WHERE tenant_id=100000 AND definition_id=" + sql(id) + ' AND process_key LIKE ' + sql(marker + '-%') + ';');
      }
      for (const id of roles) { database('DELETE FROM sys_user_role WHERE tenant_id=100000 AND role_id=' + id + ';'); database('DELETE FROM sys_role WHERE tenant_id=100000 AND role_id=' + id + ' AND create_by=' + sql(marker) + ';'); }
      for (const id of departments) database('DELETE FROM sys_dept WHERE tenant_id=100000 AND dept_id=' + id + ' AND create_by=' + sql(marker) + ';');
      check('选人页面原身份权限恢复且自有草稿角色部门清理', originalIdentity() === identityBefore && grants() === grantsBefore
        && database('SELECT COUNT(*) FROM wf_form_draft WHERE title LIKE ' + sql(marker + '-%') + ';') === '0');
      evidence.b1LaunchRestoration = true;
    } catch (error) { failure = new AggregateError([failure, error].filter(Boolean), 'B1 launch verification or restoration failed'); }
  }
  if (failure) throw failure;
}
