import assert from 'node:assert/strict';
import { isDeepStrictEqual } from 'node:util';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createB2MobileBrowser, tapB2Mobile } from './b2-mobile-browser.mjs';

export async function verifyC2SubtablePages({ sessions, api, success, check: recordCheck, database, sqlText, fixture, saveFixture, marker, evidence, secrets, requests, desktop = false }) {
  const device = desktop ? 'desktop' : 'mobile';
  const checkLabel = label => desktop ? label.replace('_mobile_', '_native_') : label;
  const check = (label, condition) => recordCheck(checkLabel(label), condition);
  const output = path.join(evidence, (desktop ? 'c2-native-table-pages-' : 'c2-mobile-subtable-pages-') + fixture.runId); await fs.mkdir(output);
  const contexts = [], removers = [], pageErrors = [];
  let failure, activePage, stage = 'setup', instanceId, finalRows;
  const name = marker + (desktop ? '-native-table' : '-mobile-subtable'), defaultName = marker + '-new';
  const names = ['first', 'second', 'third', 'fourth'].map(suffix => marker + '-' + suffix);
  [...names, defaultName].forEach(value => secrets.add(value));
  const fields = [{ id: 'items', type: 'SUB_TABLE', label: '费用明细', minRows: 0, maxRows: 5,
    columns: [{ id: 'name', type: 'TEXT', label: '费用说明', required: true, defaultValue: defaultName }, { id: 'amount', type: 'AMOUNT', label: '费用金额', precision: 2, min: 0, defaultValue: '0.10' }],
    summaryColumns: [{ columnId: 'amount', aggregation: 'SUM' }] }];
  const post = async (endpoint, body, label) => success(await api('admin', '/workflow/wf' + endpoint, { method: 'POST', body }), checkLabel(label));
  const waitFor = async (read, accept, message) => {
    const deadline = Date.now() + 30000;
    do { const value = await read(); if (accept(value)) return value; await new Promise(resolve => setTimeout(resolve, 100)); } while (Date.now() < deadline);
    throw new Error(message);
  };
  const tap = async locator => {
    await waitFor(async () => { await locator.scrollIntoViewIfNeeded(); const box = await locator.boundingBox(), viewport = locator.page().viewportSize();
      return box && viewport && box.x >= -1 && box.y >= -1 && box.x + box.width <= viewport.width + 1 && box.y + box.height <= viewport.height + 1;
    }, Boolean, 'Subtable touch target not fully reachable');
    if (desktop) await locator.click(); else await tapB2Mobile(locator);
  };
  const track = (page, actor) => {
    const onError = error => pageErrors.push(error.name);
    const onResponse = response => { const endpoint = new URL(response.url()).pathname;
      if (response.request().method() === 'POST' && /^\/api\/workflow\/wf\/(draft|start|complete)$/.test(endpoint)) requests.push({ actor, path: endpoint.slice(4), method: 'POST', status: response.status(), traceId: response.headers()['x-trace-id'], observedAt: Date.now(), realPage: true, device });
    };
    page.on('pageerror', onError); page.on('response', onResponse);
    removers.push(() => { page.off('pageerror', onError); page.off('response', onResponse); });
  };
  try {
    const form = await post('/form/save', { formKey: name, formName: name, fieldsJson: JSON.stringify(fields) }, 'c2_mobile_form_saved');
    const formId = form.formId || form.id; fixture.forms.push(formId); saveFixture();
    const definition = await post('/definition/save', { processKey: name, processName: name, formId,
      modelJson: JSON.stringify({ nodes: [{ id: 'start', type: 'START', title: '发起' }, { id: 'approval', type: 'APPROVAL', title: '复核费用', approverType: 'USER', approverValue: sessions.peer.account.userId, allowEdit: true }, { id: 'end', type: 'END', title: '结束' }], edges: [{ source: 'start', target: 'approval' }, { source: 'approval', target: 'end' }] }),
      startPermissionType: 'ALL', startPermissionValue: '[]' }, 'c2_mobile_process_saved');
    const definitionId = definition.definitionId || definition.id; fixture.definitions.push(definitionId); saveFixture();
    await post('/definition/deploy/' + definitionId, undefined, 'c2_mobile_process_deployed');
    const pages = {};
    for (const actor of ['employee', 'peer']) {
      if (desktop) pages[actor] = sessions[actor].page;
      else {
        const mobile = await createB2MobileBrowser({ admin: sessions[actor].page, secrets, check, landingPath: '/tasks', landingHeading: '我的任务' });
        contexts.push(mobile); pages[actor] = mobile.page;
      }
      track(pages[actor], actor);
    }
    const page = pages.employee, reviewer = pages.peer; activePage = page;
    const open = async () => {
      await page.goto(new URL('/workplace', page.url()).href, { waitUntil: 'domcontentloaded' });
      await page.getByPlaceholder('流程模型名称、Key、描述信息', { exact: true }).fill(name);
      await tap(page.getByRole('button').filter({ hasText: name }));
      const dialog = page.getByRole('dialog', { name: '发起流程 · ' + name, exact: true }); await dialog.waitFor(); return dialog;
    };
    const storedRows = () => {
      const value = database(`SELECT form_data FROM wf_form_draft WHERE tenant_id=100000 AND user_id=${sessions.employee.account.userId} AND definition_id=${sqlText(definitionId)}`);
      return value ? JSON.parse(value).items : undefined;
    };
    const save = async (dialog, expectedNames) => {
      await tap(dialog.getByRole('button', { name: '保存草稿', exact: true }));
      const persisted = await waitFor(storedRows, rows => rows && isDeepStrictEqual(rows.map(row => row.name), expectedNames), 'Mobile subtable draft values not saved');
      await waitFor(() => dialog.getByRole('status').allTextContents(), values => values.some(value => /^已保存 /.test(value)), 'Mobile subtable draft save did not settle');
      return persisted;
    };
    const operation = async (scope, owner, index, action) => {
      if (desktop) await tap(scope.getByRole('button', { name: `${action}第${index}行`, exact: true }));
      else {
        await tap(scope.getByRole('button', { name: `第${index}条明细操作`, exact: true }));
        await tap(owner.getByRole('dialog', { name: `第${index}条明细操作`, exact: true }).getByRole('button', { name: `${action}第${index}行`, exact: true }));
      }
    };
    const input = (scope, index, column) => scope.locator('[id=' + JSON.stringify(`input-items[${index}].${column}`) + ']');
    const move = async (scope, index, offset) => {
      if (!desktop) return tap(scope.getByRole('button', { name: `${offset > 0 ? '下' : '上'}移第${index}行`, exact: true }));
      const original = await input(scope, index - 1, 'name').inputValue();
      const handle = scope.getByRole('button', { name: `拖动第${index}行排序`, exact: true });
      await handle.focus(); await handle.press('Space');
      await waitFor(() => handle.getAttribute('aria-pressed'), value => value === 'true', 'Desktop keyboard drag did not activate');
      await handle.press(offset > 0 ? 'ArrowDown' : 'ArrowUp');
      await handle.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
      await handle.press('Space');
      await waitFor(() => input(scope, index - 1 + offset, 'name').inputValue(), value => value === original, 'Desktop keyboard drag did not settle');
    };
    stage = 'fill-and-copy';
    let dialog = await open();
    await dialog.getByRole('button', { name: '新增明细', exact: true }).waitFor();
    if (desktop) check('c2_real_native_form_has_native_scoped_table', await dialog.locator('table').count() === 1 && await dialog.locator('table th[scope="col"]').count() === 4);
    else check('c2_real_mobile_has_no_drag_controls', await dialog.getByRole('button', { name: /拖动第/ }).count() === 0);
    for (let index = 0; index < 3; index++) {
      await tap(dialog.getByRole('button', { name: '新增明细', exact: true }));
      await input(dialog, index, 'name').fill(names[index]); await input(dialog, index, 'amount').fill(['0.10', '0.20', '0.30'][index]);
    }
    const initial = await save(dialog, names.slice(0, 3));
    check('c2_real_mobile_initial_rows_have_unique_ids', initial.every(row => typeof row._rowId === 'string') && new Set(initial.map(row => row._rowId)).size === 3);
    await move(dialog, 1, 1);
    check('c2_real_mobile_down_preserves_values', await input(dialog, 1, 'name').inputValue() === names[0]);
    await move(dialog, 2, -1);
    await operation(dialog, page, 1, '复制');
    const copied = await save(dialog, [names[0], names[0], names[1], names[2]]);
    check('c2_real_mobile_copy_persists_new_identity', copied[1]._rowId !== copied[0]._rowId && copied[1].amount === copied[0].amount && new Set(copied.map(row => row._rowId)).size === 4);
    await operation(dialog, page, 2, '删除');
    await move(dialog, 3, -1);
    await tap(dialog.getByRole('button', { name: '新增明细', exact: true }));
    check('c2_real_mobile_add_uses_defaults', await input(dialog, 3, 'name').inputValue() === defaultName);
    await input(dialog, 3, 'name').fill(names[3]);
    const expectedNames = [names[0], names[2], names[1], names[3]];
    finalRows = await save(dialog, expectedNames);
    check('c2_real_mobile_reorder_delete_add_preserve_row_ids', isDeepStrictEqual(finalRows.slice(0, 3).map(row => row._rowId), [initial[0]._rowId, initial[2]._rowId, initial[1]._rowId]) && !copied.some(row => row._rowId === finalRows[3]._rowId));
    check('c2_real_mobile_exact_sum_after_operations', await dialog.locator('[data-subtable-footer]').getByText('0.70', { exact: true }).count() === 1);
    stage = 'restore-and-start';
    dialog = await open(); await tap(dialog.getByRole('button', { name: '恢复草稿', exact: true }));
    await waitFor(() => input(dialog, 0, 'name').inputValue(), value => value === expectedNames[0], 'Mobile subtable restore incomplete');
    for (let index = 0; index < 4; index++) check('c2_real_mobile_restores_row_' + index, await input(dialog, index, 'name').inputValue() === expectedNames[index]);
    const starting = page.waitForResponse(response => response.request().method() === 'POST' && new URL(response.url()).pathname === '/api/workflow/wf/start').catch(() => null);
    await tap(dialog.getByRole('button', { name: '提交申请', exact: true }));
    const started = await starting; assert.ok(started); const body = await started.json(); instanceId = body.data?.instanceId || body.data?.processInstanceId;
    check('c2_real_mobile_starts_from_saved_rows', started.status() === 200 && body.code === 200 && Boolean(instanceId));
    fixture.instances.push(instanceId); saveFixture();
    const taskId = await waitFor(() => database(`SELECT task_id FROM wf_task WHERE tenant_id=100000 AND instance_id=${sqlText(instanceId)} AND status='TODO'`), Boolean, 'Mobile subtable task missing');
    stage = 'approval'; activePage = reviewer;
    await reviewer.goto(new URL('/workflow/task/' + taskId, reviewer.url()).href, { waitUntil: 'domcontentloaded' });
    const task = reviewer.getByRole('dialog', { name: '任务处理', exact: true }); await task.waitFor();
    await input(task, 0, 'name').waitFor();
    if (desktop) check('c2_real_native_approval_has_native_scoped_table', await task.locator('table').count() === 1 && await task.locator('table th[scope="col"]').count() === 4);
    for (let index = 0; index < 4; index++) check('c2_real_mobile_approval_row_' + index, await input(task, index, 'name').inputValue() === expectedNames[index]);
    await move(task, 1, 1);
    await move(task, 2, -1);
    await reviewer.screenshot({ path: path.join(output, device + '-approval.png') });
    const completing = reviewer.waitForResponse(response => response.request().method() === 'POST' && new URL(response.url()).pathname === '/api/workflow/wf/complete').catch(() => null);
    await tap(task.getByRole('button', { name: '同意', exact: true })); await tap(task.getByRole('button', { name: '确认', exact: true }));
    const completed = await completing; assert.ok(completed);
    check('c2_real_mobile_approval_succeeds', completed.status() === 200 && (await completed.json()).code === 200);
    await waitFor(() => database(`SELECT status FROM wf_process_instance WHERE tenant_id=100000 AND instance_id=${sqlText(instanceId)}`), value => value === 'PASSED', 'Mobile subtable instance did not finish');
    const final = JSON.parse(database(`SELECT variables FROM wf_process_instance WHERE tenant_id=100000 AND instance_id=${sqlText(instanceId)}`));
    check('c2_real_mobile_final_rows_and_ids_retained', isDeepStrictEqual(final.items, finalRows));
    check('c2_real_mobile_definition_unchanged', isDeepStrictEqual(JSON.parse(database(`SELECT fields_json FROM wf_form_definition WHERE tenant_id=100000 AND form_id=${sqlText(formId)} AND version=1`)), fields));
    check('c2_real_mobile_no_browser_errors', pageErrors.length === 0);
  } catch (error) {
    failure = error;
    await fs.writeFile(path.join(output, 'failure-stage.json'), JSON.stringify({ stage, name: error.name, message: String(error.message).split('\n')[0] }));
    if (activePage && !activePage.isClosed()) await activePage.screenshot({ path: path.join(output, 'failure.png') }).catch(() => undefined);
  } finally {
    removers.forEach(remove => remove()); for (const context of contexts) await context.close();
    await fs.writeFile(path.join(output, 'result.json'), JSON.stringify({ passed: !failure, device, stage, instanceId, rows: finalRows?.length, pageErrors, realPages: true, fabricatedResponses: 0, forcedModelWrites: 0 }, null, 2));
    console.log(`${desktop ? 'C2_NATIVE_TABLE_PAGES' : 'C2_MOBILE_SUBTABLE_PAGES'}: rows=${finalRows?.length || 0}; browser_errors=${pageErrors.length}; passed=${!failure}`);
  }
  if (failure) throw failure;
}
