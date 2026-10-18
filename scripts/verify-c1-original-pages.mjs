import assert from 'node:assert/strict';
import { isDeepStrictEqual } from 'node:util';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createB2MobileBrowser, tapB2Mobile } from './b2-mobile-browser.mjs';

export async function verifyC1OriginalPages({ sessions, api, success, check, database, sqlText, fixture, saveFixture, marker, evidence, secrets, requests }) {
  const output = path.join(evidence, `c1-original-pages-${fixture.runId}`); await fs.mkdir(output);
  const contexts = [], cases = [], pageErrors = [], removers = [], referenceRequests = [];
  let activePage, failure;
  const waitFor = async (read, accept, message) => {
    const deadline = Date.now() + 30000;
    do { const value = await read(); if (accept(value)) return value; await new Promise(resolve => setTimeout(resolve, 100)); } while (Date.now() < deadline);
    throw new Error(message);
  };
  const references = {
    EMPLOYEE: database("SELECT CAST(id AS CHAR) FROM hr_employee WHERE tenant_id=100000 AND deleted=0 AND employee_status NOT IN ('RESIGNED','LEFT','TERMINATED','SUSPENDED') ORDER BY id LIMIT 1"),
    DEPT: database("SELECT CAST(dept_id AS CHAR) FROM sys_dept WHERE tenant_id=100000 AND deleted=0 AND status='0' ORDER BY dept_id LIMIT 1"),
    POST: database("SELECT CAST(post_id AS CHAR) FROM sys_post WHERE tenant_id=100000 AND status='0' ORDER BY post_id LIMIT 1"),
    POSITION: database('SELECT CAST(id AS CHAR) FROM hr_position WHERE tenant_id=100000 AND status=1 ORDER BY id LIMIT 1'),
  };
  assert.ok(Object.values(references).every(Boolean));
  const defaults = { text: marker + '-default', number: 1234.5, date: '2026-10-05', select: '乙', textarea: '第一行\n第二行', ...Object.fromEntries(Object.entries(references).map(([type, id]) => [type.toLowerCase(), id])) };
  const fields = ['TEXT', 'NUMBER', 'DATE', 'SELECT', 'TEXTAREA', 'EMPLOYEE', 'DEPT', 'POST', 'POSITION'].map(type => ({
    id: type.toLowerCase(), label: type, type, defaultValue: defaults[type.toLowerCase()], ...(type === 'SELECT' ? { options: ['甲', '乙'] } : {}), ...(references[type] ? { onlyActive: true } : {}),
  }));
  const name = marker + '-original';
  const post = async (endpoint, body, label) => success(await api('admin', '/workflow/wf' + endpoint, { method: 'POST', body }), label);
  try {
    const form = await post('/form/save', { formKey: name, formName: name, fieldsJson: JSON.stringify(fields) }, 'original_nine_default_form_saved');
    const formId = form.formId || form.id; fixture.forms.push(formId); saveFixture();
    const model = { nodes: [{ id: 'start', type: 'START', title: '发起' }, { id: 'approval', type: 'APPROVAL', title: '只读复核', approverType: 'USER', approverValue: sessions.peer.account.userId, allowEdit: true }, { id: 'end', type: 'END', title: '结束' }], edges: [{ source: 'start', target: 'approval' }, { source: 'approval', target: 'end' }] };
    const definition = await post('/definition/save', { processKey: name, processName: name, formId, modelJson: JSON.stringify(model), startPermissionType: 'ALL', startPermissionValue: '[]' }, 'original_nine_process_saved');
    const definitionId = definition.definitionId || definition.id; fixture.definitions.push(definitionId); saveFixture();
    success(await api('admin', `/workflow/wf/definition/${definitionId}/field-permissions`, { method: 'PUT', body: fields.map(field => ({ nodeKey: 'approval', fieldId: field.id, visibleFlag: true, editableFlag: false, requiredFlag: false })) }), 'original_nine_readonly_approval_configured');
    await post('/definition/deploy/' + definitionId, undefined, 'original_nine_process_deployed');
    const labels = {};
    for (const [type, referenceId] of Object.entries(references)) {
      const field = type.toLowerCase();
      const result = success(await api('employee', `/workflow/wf/draft/context/${definitionId}/references/${field}?pageNum=1&pageSize=100`), 'original_default_reference_authorized');
      const selected = result.rows.find(option => option.id === referenceId); assert.ok(selected, 'Selected default must belong to allowed references'); labels[field] = selected.label;
    }
    const nullValues = Object.fromEntries(fields.map(field => [field.id, null]));
    const peerContext = success(await api('peer', `/workflow/wf/draft/context/${definitionId}`), 'original_null_draft_context');
    const nullDraft = success(await api('peer', '/workflow/wf/draft', { method: 'POST', body: { definitionId, expectedVersion: 0, loadedContextHash: peerContext.contextHash, title: name + '-nulls', formData: nullValues, nodeAssignees: {} } }), 'original_nine_nulls_saved_through_api');
    const nullStored = JSON.parse(database(`SELECT form_data FROM wf_form_draft WHERE tenant_id=100000 AND user_id=${sessions.peer.account.userId} AND draft_id=${sqlText(nullDraft.draftId)}`));
    check('original_nine_explicit_nulls_persist_as_present_keys', isDeepStrictEqual(nullStored, nullValues));
    const nullDetail = success(await api('peer', '/workflow/wf/draft/' + nullDraft.draftId), 'original_null_draft_reloaded');
    check('original_nine_nulls_survive_actual_response', isDeepStrictEqual(nullDetail.formData, nullValues));
    const mobilePages = {};
    for (const actor of ['employee', 'peer']) {
      const mobile = await createB2MobileBrowser({ admin: sessions[actor].page, secrets, check, landingPath: '/tasks', landingHeading: '我的任务' });
      contexts.push(mobile); mobilePages[actor] = mobile.page;
    }
    for (const device of ['desktop', 'mobile']) {
      const page = device === 'mobile' ? mobilePages.employee : sessions.employee.page;
      const reviewer = device === 'mobile' ? mobilePages.peer : sessions.peer.page;
      if (device === 'desktop') for (const current of [page, reviewer]) await current.setViewportSize({ width: 1440, height: 1040 });
      for (const [actor, current] of [['employee', page], ['peer', reviewer]]) {
        const onError = error => pageErrors.push({ device, actor, name: error.name });
        const onResponse = item => {
          const endpoint = new URL(item.url()).pathname;
          if (actor === 'peer' && endpoint.includes('/form-references/')) referenceRequests.push({ device, endpoint, status: item.status() });
          if (item.request().method() === 'POST' && /^\/api\/workflow\/wf\/(draft|start|complete)$/.test(endpoint)) requests.push({ actor, path: endpoint.slice(4), method: 'POST', status: item.status(), traceId: item.headers()['x-trace-id'], observedAt: Date.now(), realPage: true, device });
        };
        current.on('pageerror', onError); current.on('response', onResponse);
        removers.push(() => { current.off('pageerror', onError); current.off('response', onResponse); });
      }
      activePage = page;
      const tap = locator => device === 'mobile' ? tapB2Mobile(locator) : locator.click();
      const draftData = () => database(`SELECT form_data FROM wf_form_draft WHERE tenant_id=100000 AND user_id=${sessions.employee.account.userId} AND definition_id=${sqlText(definitionId)}`);
      const open = async () => {
        await page.goto(new URL('/workplace', page.url()).href, { waitUntil: 'domcontentloaded' });
        await page.getByPlaceholder('流程模型名称、Key、描述信息', { exact: true }).fill(name);
        await tap(page.getByRole('button').filter({ hasText: name }));
        const dialog = page.getByRole('dialog', { name: '发起流程 · ' + name, exact: true }); await dialog.waitFor(); return dialog;
      };
      let dialog = await open();
      for (const field of ['text', 'number', 'textarea']) check(`${device}_${field}_actual_default_visible`, await dialog.locator('#input-' + field).inputValue() === String(defaults[field]));
      check(`${device}_select_actual_default_visible`, (await dialog.locator('#input-select').textContent()).includes(defaults.select));
      check(`${device}_date_actual_default_visible`, /2026[/-]10[/-]05/.test(await dialog.locator('#input-date').textContent()));
      for (const [field, label] of Object.entries(labels)) {
        await waitFor(() => dialog.locator('#input-' + field).getAttribute('aria-disabled'), value => value !== 'true', 'Default reference did not finish loading');
        check(`${device}_${field}_actual_default_name`, (await dialog.locator('#input-' + field).textContent()).includes(label));
      }
      const save = async expected => {
        await tap(dialog.getByRole('button', { name: '保存草稿', exact: true }));
        await waitFor(draftData, value => value && isDeepStrictEqual(JSON.parse(value), expected), 'Original field draft values did not persist');
        await waitFor(() => dialog.getByRole('status').allTextContents(), contents => contents.some(text => /^已保存 /.test(text)), 'Original draft save did not settle');
      };
      await save(defaults); check(`${device}_all_nine_defaults_saved`, true);
      await dialog.locator('#input-text').fill('');
      const cleared = { ...defaults, text: '' }; await save(cleared);
      dialog = await open(); await tap(dialog.getByRole('button', { name: '恢复草稿', exact: true }));
      await waitFor(() => dialog.locator('#input-text').inputValue(), value => value === '', 'Cleared original text restored its default');
      check(`${device}_restored_clear_does_not_reapply_default`, true);
      const values = { ...defaults, text: `${device}-${marker}-private-text`, textarea: `${device}-${marker}-private-notes` };
      secrets.add(values.text); secrets.add(values.textarea);
      await dialog.locator('#input-text').fill(values.text); await dialog.locator('#input-textarea').fill(values.textarea); await save(values);
      dialog = await open(); await tap(dialog.getByRole('button', { name: '恢复草稿', exact: true }));
      await waitFor(() => dialog.locator('#input-text').inputValue(), value => value === values.text, 'Edited original values did not restore');
      check(`${device}_edited_values_restore_over_defaults`, await dialog.locator('#input-textarea').inputValue() === values.textarea);
      const starting = page.waitForResponse(item => item.request().method() === 'POST' && new URL(item.url()).pathname === '/api/workflow/wf/start');
      await tap(dialog.getByRole('button', { name: '提交申请', exact: true }));
      const response = await starting, body = await response.json(), instanceId = body.data?.instanceId || body.data?.processInstanceId;
      check(`${device}_original_fields_start_from_page`, response.status() === 200 && body.code === 200 && Boolean(instanceId));
      fixture.instances.push(instanceId); saveFixture();
      const taskId = await waitFor(() => database(`SELECT task_id FROM wf_task WHERE tenant_id=100000 AND instance_id=${sqlText(instanceId)} AND status='TODO'`), Boolean, 'Original readonly task missing');
      activePage = reviewer; await reviewer.goto(new URL('/workflow/task/' + taskId, reviewer.url()).href, { waitUntil: 'domcontentloaded' });
      const task = reviewer.getByRole('dialog', { name: '任务处理', exact: true }); await task.waitFor();
      await task.locator('#field-position').waitFor(); await task.locator('#field-position [role="status"]').waitFor({ state: 'hidden' });
      const displays = { ...values, number: '1,234.5', date: '2026/10/05' };
      for (const [field, expected] of Object.entries(displays)) {
        check(`${device}_${field}_actual_readonly_display`, await task.locator('#field-' + field + ' > div').innerText() === String(expected));
        check(`${device}_${field}_actual_readonly_has_no_input`, await task.locator('#field-' + field).locator('input,textarea,button,[role="combobox"]').count() === 0);
      }
      await reviewer.screenshot({ path: path.join(output, device + '-readonly.png') });
      const completing = reviewer.waitForResponse(item => item.request().method() === 'POST' && new URL(item.url()).pathname === '/api/workflow/wf/complete');
      await tap(task.getByRole('button', { name: '同意', exact: true })); await tap(task.getByRole('button', { name: '确认', exact: true }));
      const approved = await completing;
      check(`${device}_original_readonly_approval_succeeds`, approved.status() === 200 && (await approved.json()).code === 200);
      await waitFor(() => database(`SELECT status FROM wf_process_instance WHERE tenant_id=100000 AND instance_id=${sqlText(instanceId)}`), value => value === 'PASSED', 'Original readonly process did not finish');
      const persisted = JSON.parse(database(`SELECT variables FROM wf_process_instance WHERE tenant_id=100000 AND instance_id=${sqlText(instanceId)}`));
      check(`${device}_original_readonly_approval_keeps_raw_values`, Object.entries(values).every(([field, value]) => persisted[field] === value));
      cases.push({ device, fields: fields.length, defaultsSaved: true, clearedRestored: true, readonlyApproved: true });
    }
    check('original_readonly_pages_do_not_load_editable_references', referenceRequests.length === 0);
    check('original_real_pages_have_no_browser_exceptions', pageErrors.length === 0);
    check('original_nine_fields_complete_on_both_devices', cases.length === 2);
  } catch (error) {
    failure = error;
    if (activePage && !activePage.isClosed()) await activePage.screenshot({ path: path.join(output, 'failure.png') }).catch(() => undefined);
  } finally {
    removers.forEach(remove => remove()); for (const context of contexts) await context.close();
    await fs.writeFile(path.join(output, 'result.json'), JSON.stringify({ passed: !failure, cases, pageErrors, referenceRequests, realPages: true, fabricatedResponses: 0, injectedValues: 0 }, null, 2));
    console.log(`C1_ORIGINAL_PAGES: devices=${cases.length}; readonly_reference_requests=${referenceRequests.length}; browser_errors=${pageErrors.length}; passed=${!failure}`);
  }
  if (failure) throw failure;
}
