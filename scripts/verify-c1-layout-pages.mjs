import assert from 'node:assert/strict';
import { isDeepStrictEqual } from 'node:util';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createB2MobileBrowser, tapB2Mobile } from './b2-mobile-browser.mjs';

export async function verifyC1LayoutPages({ sessions, api, success, check, database, sqlText, fixture, saveFixture, marker, evidence, secrets, requests }) {
  const output = path.join(evidence, `c1-layout-pages-${fixture.runId}`); await fs.mkdir(output);
  const contexts = [], cases = [], pageErrors = [], observations = [], removers = [];
  let activePage, failure, stage = 'setup', designerSaved = false, depthRejected = false;
  const waitFor = async (read, accept, message) => {
    const deadline = Date.now() + 30000;
    do { const value = await read(); if (accept(value)) return value; await new Promise(resolve => setTimeout(resolve, 100)); } while (Date.now() < deadline);
    throw new Error(message);
  };
  const text = (id, label = id) => ({ id, label, type: 'TEXT', defaultValue: `${id}-default` });
  const grid = columns => ({ id: `grid${columns}`, type: 'GRID', label: `${columns}列标签`, title: `${columns}列标题`, columns, children: Array.from({ length: columns }, (_, index) => text(`grid${columns}_${index}`)) });
  const fields = [text('loose', '待移动字段'),
    { id: 'source', type: 'GROUP', label: '来源容器', title: '来源标题', children: [text('alpha', '字段甲'), text('beta', '字段乙')] },
    { id: 'destination', type: 'GROUP', label: '目标容器', title: '目标标题', children: [text('gamma', '字段丙')] },
    grid(2), grid(3), grid(4),
    { id: 'tabs', type: 'TABS', label: '标签页名称', title: '标签页标题', children: [
      { id: 'first_tab', type: 'GROUP', label: '第一页名称', title: '第一页标题', children: [text('first_text')] },
      { id: 'second_tab', type: 'GROUP', label: '第二页名称', title: '第二页标题', children: [text('second_text')] },
    ] },
    { id: 'collapsed', type: 'COLLAPSE', label: '折叠名称', title: '折叠标题', defaultExpanded: false, children: [
      { id: 'deep2', type: 'GROUP', label: '第2层', children: [
        { id: 'deep3', type: 'GRID', label: '第3层', columns: 2, children: [text('deep_text', '三层内字段')] },
      ] },
    ] },
  ];
  const leaves = tree => tree.flatMap(field => Array.isArray(field.children) ? leaves(field.children) : [field]);
  const name = marker + '-layout';
  const post = async (endpoint, body, label) => success(await api('admin', '/workflow/wf' + endpoint, { method: 'POST', body }), label);
  const track = (current, actor, device) => {
    const onError = error => pageErrors.push({ device, actor, name: error.name });
    const onResponse = item => {
      const endpoint = new URL(item.url()).pathname;
      if (item.request().method() === 'POST' && /^\/api\/workflow\/wf\/(form\/save|draft|start|complete)$/.test(endpoint)) requests.push({ actor, path: endpoint.slice(4), method: 'POST', status: item.status(), traceId: item.headers()['x-trace-id'], observedAt: Date.now(), realPage: true, device });
    };
    current.on('pageerror', onError); current.on('response', onResponse);
    removers.push(() => { current.off('pageerror', onError); current.off('response', onResponse); });
  };
  try {
    const form = await post('/form/save', { formKey: name, formName: name, fieldsJson: JSON.stringify(fields) }, 'three_layer_layout_form_saved');
    let formId = form.formId || form.id; fixture.forms.push(formId); saveFixture();
    const four = [{ id: 'level1', type: 'GROUP', label: '1', children: [{ id: 'level2', type: 'GROUP', label: '2', children: [{ id: 'level3', type: 'GROUP', label: '3', children: [{ id: 'level4', type: 'GROUP', label: '4', children: [text('leaf')] }] }] }] }];
    const bad = await api('admin', '/workflow/wf/form/save', { method: 'POST', body: { formKey: name + '-invalid', formName: name + '-invalid', fieldsJson: JSON.stringify(four) } });
    depthRejected = bad.status === 400 && !bad.body?.data && database(`SELECT COUNT(*) FROM wf_form_definition WHERE tenant_id=100000 AND form_key=${sqlText(name + '-invalid')}`) === '0';
    check('four_layer_direct_save_rejected_without_form', depthRejected);
    const mobilePages = {};
    for (const actor of ['employee', 'peer']) {
      const mobile = await createB2MobileBrowser({ admin: sessions[actor].page, secrets, check, landingPath: '/tasks', landingHeading: '我的任务' });
      contexts.push(mobile); mobilePages[actor] = mobile.page;
    }
    const admin = sessions.admin.page; activePage = admin; track(admin, 'admin', 'desktop');
    await admin.setViewportSize({ width: 1600, height: 1100 });
    await admin.goto(new URL('/forms', admin.url()).href, { waitUntil: 'domcontentloaded' });
    const picker = admin.locator('label').filter({ hasText: '当前表单' }).getByRole('button');
    await picker.click(); await admin.getByRole('option').filter({ has: admin.getByText(name, { exact: true }) }).click();
    await waitFor(() => admin.getByRole('textbox', { name: '表单名称', exact: true }).inputValue(), value => value === name, 'Owned form did not open in actual designer');
    const article = label => admin.getByRole('button', { name: '拖动' + label, exact: true }).locator('xpath=ancestor::article[1]');
    const tail = label => article(label).getByRole('button', { name: '将字段拖到这里，添加到当前容器末尾', exact: true }).last();
    const drag = async (source, target) => {
      await target.scrollIntoViewIfNeeded();
      await source.scrollIntoViewIfNeeded();
      const start = await source.boundingBox(); assert.ok(start);
      const sourceHit = await source.evaluate(element => { const box = element.getBoundingClientRect(); return element.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)); });
      assert.ok(sourceHit, 'Drag handle must be reachable by a real pointer');
      await admin.mouse.move(start.x + start.width / 2, start.y + start.height / 2); await admin.mouse.down();
      await admin.mouse.move(start.x + start.width / 2 + 9, start.y + start.height / 2, { steps: 3 });
      const visible = await target.evaluate(element => { const box = element.getBoundingClientRect(); return box.top >= 0 && box.bottom <= innerHeight; });
      if (!visible) await target.scrollIntoViewIfNeeded();
      const end = await target.boundingBox(); assert.ok(end);
      await admin.mouse.move(end.x + end.width / 2, end.y + end.height / 2, { steps: 18 });
      if (await target.textContent() === '将字段拖到这里，添加到当前容器末尾') {
        // Sortable siblings move during a drag; follow the visible drop area until it is highlighted.
        let highlighted = false;
        for (let attempt = 0; attempt < 8; attempt += 1) {
          await admin.waitForTimeout(100);
          highlighted = await target.evaluate(element => element.classList.contains('border-cyan-500'));
          if (highlighted) break;
          await target.scrollIntoViewIfNeeded();
          const current = await target.boundingBox(); assert.ok(current);
          await admin.mouse.move(current.x + current.width / 2, current.y + current.height / 2, { steps: 6 });
        }
        observations.push({ stage, sourceHit, targetHighlighted: highlighted });
        if (!highlighted) await admin.screenshot({ path: path.join(output, stage + '-drop.png') });
        await admin.mouse.up();
        assert.ok(highlighted, 'Container drop area did not become highlighted');
      } else await admin.mouse.up();
      await admin.waitForTimeout(60);
    };
    const displayedFields = async () => {
      await admin.getByRole('button', { name: '查看定义', exact: true }).click();
      const dialog = admin.getByRole('dialog', { name: '表单字段定义', exact: true });
      const value = JSON.parse(await dialog.getByRole('textbox').inputValue()); await dialog.press('Escape'); await dialog.waitFor({ state: 'hidden' }); return value;
    };
    const observeTree = async () => {
      const current = await displayedFields();
      const shape = tree => tree.map(field => ({ id: field.id, type: field.type, ...(Array.isArray(field.children) ? { children: shape(field.children) } : {}) }));
      observations.push({ stage, tree: shape(current) }); return current;
    };
    stage = 'drag_into_container';
    await drag(admin.getByRole('button', { name: '拖动待移动字段', exact: true }), tail('来源容器'));
    let observed = await observeTree();
    check('real_designer_drag_into_container', !observed.some(field => field.id === 'loose') && observed.find(field => field.id === 'source')?.children.at(-1)?.id === 'loose');
    stage = 'sort_inside_container';
    await drag(admin.getByRole('button', { name: '拖动字段乙', exact: true }), admin.getByRole('button', { name: '拖动字段甲', exact: true }));
    observed = await observeTree();
    check('real_designer_sort_inside_container', isDeepStrictEqual(observed.find(field => field.id === 'source')?.children.map(field => field.id), ['beta', 'alpha', 'loose']));
    stage = 'drag_between_containers';
    await drag(admin.getByRole('button', { name: '拖动字段甲', exact: true }), tail('目标容器'));
    observed = await observeTree();
    check('real_designer_drag_between_containers', isDeepStrictEqual(observed.find(field => field.id === 'destination')?.children.map(field => field.id), ['gamma', 'alpha']));
    stage = 'drag_palette_field';
    await drag(admin.getByRole('button', { name: '拖拽添加单行文本', exact: true }), tail('来源容器'));
    await observeTree();
    const designed = await displayedFields();
    check('real_designer_drag_order_and_cross_container', isDeepStrictEqual(designed.find(field => field.id === 'source')?.children.map(field => field.id), ['beta', 'loose', 'textField']) && isDeepStrictEqual(designed.find(field => field.id === 'destination')?.children.map(field => field.id), ['gamma', 'alpha']) && !designed.some(field => field.id === 'loose'));
    await article('第3层').locator(':scope > div').first().getByRole('button').filter({ hasText: '第3层' }).click();
    await admin.getByRole('button', { name: '分组', exact: true }).click();
    check('real_designer_rejects_fourth_layer_without_change', isDeepStrictEqual(await displayedFields(), designed));
    const saving = admin.waitForResponse(item => item.request().method() === 'POST' && new URL(item.url()).pathname === '/api/workflow/wf/form/save');
    await admin.getByRole('button', { name: '保存表单', exact: true }).click(); await admin.getByRole('button', { name: '确认保存版本', exact: true }).click();
    const saveResponse = await saving, saveBody = await saveResponse.json();
    check('real_designer_save_succeeds', saveResponse.status() === 200 && saveBody.code === 200 && Boolean(saveBody.data?.formId || saveBody.data?.id));
    formId = saveBody.data.formId || saveBody.data.id; if (!fixture.forms.includes(formId)) { fixture.forms.push(formId); saveFixture(); }
    const savedVersion = saveBody.data.version;
    check('real_designer_save_creates_next_version', Number.isSafeInteger(savedVersion) && savedVersion === form.version + 1);
    const savedFields = () => JSON.parse(database(`SELECT fields_json FROM wf_form_definition WHERE tenant_id=100000 AND form_id=${sqlText(formId)} AND version=${sqlText(savedVersion)}`));
    const persisted = savedFields();
    check('real_designer_dragged_definition_persisted', isDeepStrictEqual(persisted, designed)); designerSaved = true;
    check('real_designer_original_version_retained', isDeepStrictEqual(JSON.parse(database(`SELECT fields_json FROM wf_form_definition WHERE tenant_id=100000 AND form_id=${sqlText(formId)} AND version=${sqlText(form.version)}`)), fields));
    await admin.reload({ waitUntil: 'domcontentloaded' });
    await picker.click(); await admin.getByRole('option').filter({ has: admin.getByText(name, { exact: true }) }).click();
    await waitFor(() => admin.getByRole('textbox', { name: '表单名称', exact: true }).inputValue(), value => value === name, 'Saved designer did not reopen');
    check('real_designer_reload_keeps_saved_tree', isDeepStrictEqual(await displayedFields(), persisted));
    await admin.getByRole('button', { name: '预览', exact: true }).click();
    const preview = admin.getByRole('dialog', { name: '表单预览', exact: true });
    check('real_preview_retains_moved_field_default', await preview.locator('#input-alpha').inputValue() === 'alpha-default');
    const previewValue = marker + '-preview-only'; secrets.add(previewValue);
    await preview.locator('#input-alpha').fill(previewValue);
    await preview.getByRole('button', { name: '手机布局', exact: true }).click();
    check('real_designer_mobile_preview_preserves_value', await preview.locator('#input-alpha').inputValue() === previewValue && await preview.locator('#field-grid4 > div').evaluate(element => getComputedStyle(element).gridTemplateColumns.split(' ').length === 1));
    await preview.getByRole('button', { name: '桌面布局', exact: true }).click();
    check('real_designer_desktop_preview_preserves_value', await preview.locator('#input-alpha').inputValue() === previewValue && await preview.locator('#field-grid4 > div').evaluate(element => getComputedStyle(element).gridTemplateColumns.split(' ').length === 4));
    await admin.screenshot({ path: path.join(output, 'designer-preview.png') });
    await preview.getByRole('button', { name: '返回设计', exact: true }).click();
    check('real_preview_does_not_modify_saved_definition', isDeepStrictEqual(savedFields(), persisted));
    const definition = await post('/definition/save', { processKey: name, processName: name, formId,
      modelJson: JSON.stringify({ nodes: [{ id: 'start', type: 'START', title: '发起' }, { id: 'approval', type: 'APPROVAL', title: '审批', approverType: 'USER', approverValue: sessions.peer.account.userId, allowEdit: true }, { id: 'end', type: 'END', title: '结束' }], edges: [{ source: 'start', target: 'approval' }, { source: 'approval', target: 'end' }] }),
      startPermissionType: 'ALL', startPermissionValue: '[]' }, 'saved_layout_process_created');
    const definitionId = definition.definitionId || definition.id; fixture.definitions.push(definitionId); saveFixture();
    await post('/definition/deploy/' + definitionId, undefined, 'saved_layout_process_deployed');
    for (const device of ['desktop', 'mobile']) {
      const page = device === 'mobile' ? mobilePages.employee : sessions.employee.page;
      const reviewer = device === 'mobile' ? mobilePages.peer : sessions.peer.page;
      if (device === 'desktop') for (const current of [page, reviewer]) await current.setViewportSize({ width: 1440, height: 1040 });
      track(page, 'employee', device); track(reviewer, 'peer', device); activePage = page;
      const tap = locator => device === 'mobile' ? tapB2Mobile(locator) : locator.click();
      const values = Object.fromEntries(leaves(persisted).map(field => [field.id, `${device}-${marker}-${field.id}`]));
      for (const value of Object.values(values)) secrets.add(value);
      const open = async () => {
        await page.goto(new URL('/workplace', page.url()).href, { waitUntil: 'domcontentloaded' });
        await page.getByPlaceholder('流程模型名称、Key、描述信息', { exact: true }).fill(name);
        await tap(page.getByRole('button').filter({ hasText: name }));
        const dialog = page.getByRole('dialog', { name: '发起流程 · ' + name, exact: true }); await dialog.waitFor(); return dialog;
      };
      const inspectLayout = async (scope, phase) => {
        for (const [id, title] of [['source', '来源标题'], ['grid2', '2列标题'], ['grid3', '3列标题'], ['grid4', '4列标题'], ['tabs', '标签页标题'], ['collapsed', '折叠标题']]) {
          const observed = await scope.locator('#field-' + id).evaluate(element => ({ tag: element.tagName, legend: element.querySelector(':scope > legend')?.textContent }));
          check(`${device}_${phase}_${id}_semantic_title`, observed.tag === 'FIELDSET' && observed.legend === title);
        }
        for (const columns of [2, 3, 4]) {
          const observed = await scope.locator(`#field-grid${columns} > div`).evaluate(element => ({ tracks: getComputedStyle(element).gridTemplateColumns.split(' ').length, width: innerWidth }));
          check(`${device}_${phase}_grid${columns}_responsive`, observed.tracks === (device === 'mobile' ? 1 : columns));
        }
      };
      const inspectValues = async (scope, phase) => {
        await tap(scope.getByRole('tab', { name: '第一页标题', exact: true }));
        if (!await scope.locator('#input-deep_text').isVisible()) await tap(scope.locator('#field-collapsed summary'));
        for (const id of Object.keys(values).filter(id => id !== 'second_text')) check(`${device}_${phase}_${id}_value`, await scope.locator('#input-' + id).inputValue() === values[id]);
        await tap(scope.getByRole('tab', { name: '第二页标题', exact: true }));
        check(`${device}_${phase}_second_tab_value`, await scope.locator('#input-second_text').inputValue() === values.second_text);
      };
      let dialog = await open(); await inspectLayout(dialog, 'input');
      check(`${device}_actual_collapsed_layout_starts_closed`, !await dialog.locator('#input-deep_text').isVisible());
      await tap(dialog.locator('#field-collapsed summary'));
      for (const [id, value] of Object.entries(values).filter(([id]) => id !== 'second_text')) await dialog.locator('#input-' + id).fill(value);
      await tap(dialog.getByRole('tab', { name: '第二页标题', exact: true })); await dialog.locator('#input-second_text').fill(values.second_text);
      await tap(dialog.getByRole('button', { name: '保存草稿', exact: true }));
      await waitFor(() => database(`SELECT form_data FROM wf_form_draft WHERE tenant_id=100000 AND user_id=${sessions.employee.account.userId} AND definition_id=${sqlText(definitionId)}`), value => value && isDeepStrictEqual(JSON.parse(value), values), 'Nested layout values were not saved');
      await waitFor(() => dialog.getByRole('status').allTextContents(), contents => contents.some(text => /^已保存 /.test(text)), 'Nested layout draft did not settle');
      dialog = await open(); await tap(dialog.getByRole('button', { name: '恢复草稿', exact: true }));
      await waitFor(() => dialog.locator('#input-alpha').inputValue(), value => value === values.alpha, 'Nested draft did not restore');
      await inspectValues(dialog, 'restored');
      const starting = page.waitForResponse(item => item.request().method() === 'POST' && new URL(item.url()).pathname === '/api/workflow/wf/start');
      await tap(dialog.getByRole('button', { name: '提交申请', exact: true }));
      const started = await starting, startBody = await started.json(), instanceId = startBody.data?.instanceId || startBody.data?.processInstanceId;
      check(`${device}_nested_layout_started_from_page`, started.status() === 200 && startBody.code === 200 && Boolean(instanceId));
      fixture.instances.push(instanceId); saveFixture();
      const taskId = await waitFor(() => database(`SELECT task_id FROM wf_task WHERE tenant_id=100000 AND instance_id=${sqlText(instanceId)} AND status='TODO'`), Boolean, 'Nested layout reviewer task missing');
      activePage = reviewer; await reviewer.goto(new URL('/workflow/task/' + taskId, reviewer.url()).href, { waitUntil: 'domcontentloaded' });
      const task = reviewer.getByRole('dialog', { name: '任务处理', exact: true }); await task.waitFor();
      await inspectLayout(task, 'approval'); await inspectValues(task, 'approval');
      await reviewer.screenshot({ path: path.join(output, `${device}-approval.png`) });
      const completing = reviewer.waitForResponse(item => item.request().method() === 'POST' && new URL(item.url()).pathname === '/api/workflow/wf/complete');
      await tap(task.getByRole('button', { name: '同意', exact: true })); await tap(task.getByRole('button', { name: '确认', exact: true }));
      const approved = await completing;
      check(`${device}_nested_layout_page_approval_succeeds`, approved.status() === 200 && (await approved.json()).code === 200);
      await waitFor(() => database(`SELECT status FROM wf_process_instance WHERE tenant_id=100000 AND instance_id=${sqlText(instanceId)}`), value => value === 'PASSED', 'Nested layout approval did not finish');
      const final = JSON.parse(database(`SELECT variables FROM wf_process_instance WHERE tenant_id=100000 AND instance_id=${sqlText(instanceId)}`));
      check(`${device}_nested_layout_values_retained_after_approval`, Object.entries(values).every(([id, value]) => final[id] === value));
      cases.push({ device, fields: Object.keys(values).length, restored: true, started: true, approved: true, semantics: true });
      observations.push({ device, instanceId, taskId });
    }
    check('layout_real_pages_have_no_browser_exceptions', pageErrors.length === 0);
    check('layout_real_designer_and_both_devices_complete', designerSaved && depthRejected && cases.length === 2);
  } catch (error) {
    failure = error;
    if (activePage && !activePage.isClosed()) await activePage.screenshot({ path: path.join(output, 'failure.png') }).catch(() => undefined);
  } finally {
    removers.forEach(remove => remove()); for (const context of contexts) await context.close();
    await fs.writeFile(path.join(output, 'result.json'), JSON.stringify({ passed: !failure, stage, designerSaved, depthRejected, cases, observations, pageErrors, realPages: true, fabricatedResponses: 0, injectedValues: 0 }, null, 2));
    console.log(`C1_LAYOUT_PAGES: devices=${cases.length}; designer_saved=${designerSaved}; four_layers_rejected=${depthRejected}; browser_errors=${pageErrors.length}; passed=${!failure}`);
  }
  if (failure) throw failure;
}
