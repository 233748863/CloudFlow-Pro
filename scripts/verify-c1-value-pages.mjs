import assert from 'node:assert/strict';
import { isDeepStrictEqual } from 'node:util';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createB2MobileBrowser, tapB2Mobile } from './b2-mobile-browser.mjs';

// Exercise production pages, native input events and real services. Never replace responses or app state.
export async function verifyC1ValuePages({ sessions, api, success, check, database, sqlText, fixture, saveFixture, marker, evidence, secrets, requests }) {
  const output = path.join(evidence, `c1-value-pages-${fixture.runId}`);
  await fs.mkdir(output);
  const cases = [], contexts = [], pageErrors = [], prepared = [], uploads = [];
  let activePage, failure;
  const waitFor = async (read, accept, message) => {
    const deadline = Date.now() + 60000;
    do { const value = await read(); if (accept(value)) return value; await new Promise(resolve => setTimeout(resolve, 150)); } while (Date.now() < deadline);
    throw new Error(message);
  };
  const id = (scope, value) => scope.locator(`[id=${JSON.stringify(value)}]`);
  const post = async (endpoint, body, label) => success(await api('admin', '/workflow/wf' + endpoint, { method: 'POST', body }), label);
  const dictionary = database("SELECT t.dict_type FROM sys_dict_type t JOIN sys_dict_data d ON d.tenant_id=t.tenant_id AND d.dict_type=t.dict_type WHERE t.tenant_id=100000 AND t.status='0' AND d.status='0' ORDER BY t.dict_id,d.dict_sort,d.dict_code LIMIT 1");
  assert.ok(dictionary, 'Owned active dictionary required');
  const referenceTypes = ['EMPLOYEE', 'DEPT', 'POST', 'POSITION', 'USER_MULTI', 'DEPT_MULTI', 'DICT_SELECT'];
  const specifications = [
    ['TEXT', { required: true }], ['TEXTAREA'], ['RICH_TEXT'], ['NUMBER', { min: 1, max: 100, precision: 2 }],
    ['AMOUNT', { min: 1, max: 100, precision: 2 }], ['DATE'], ['DATETIME'], ['TIME'], ['DATE_RANGE'],
    ['SELECT', { options: ['甲', '乙'] }], ['MULTI_SELECT', { options: ['甲', '乙'] }],
    ['RADIO_GROUP', { options: ['甲', '乙'] }], ['CHECKBOX_GROUP', { options: ['甲', '乙'] }], ['SWITCH'],
    ...referenceTypes.map(type => [type, type === 'DICT_SELECT' ? { dictType: dictionary } : { onlyActive: true }]),
    ['UPLOAD_FILE', { accept: '.pdf', maxSize: 1, maxCount: 1 }], ['UPLOAD_IMAGE', { accept: '.png', maxSize: 1, maxCount: 1 }],
    ['SUB_TABLE', { columns: [{ id: 'item', type: 'TEXT', label: '项目', required: true }, { id: 'amount', type: 'AMOUNT', label: '金额' }] }],
  ];
  const fields = specifications.map(([type, settings]) => ({ id: type.toLowerCase(), type, label: type, ...settings }));
  assert.equal(fields.length, 24);
  const response = (page, endpoint) => page.waitForResponse(item => item.request().method() === 'POST' && new URL(item.url()).pathname === '/api/workflow/wf/' + endpoint);
  try {
    // Prepare both fixtures before desktop navigation replaces its in-memory authentication module.
    for (const device of ['desktop', 'mobile']) {
      const name = `${marker}-${device}-values`;
      const form = await post('/form/save', { formKey: name, formName: name, fieldsJson: JSON.stringify(fields) }, 'value_page_form_created');
      const formId = form.formId || form.id; fixture.forms.push(formId); saveFixture();
      const model = { nodes: [{ id: 'start', type: 'START', title: '发起' }, { id: 'approval', type: 'APPROVAL', title: '审批', approverType: 'USER', approverValue: sessions.peer.account.userId, allowEdit: true }, { id: 'end', type: 'END', title: '结束' }], edges: [{ source: 'start', target: 'approval' }, { source: 'approval', target: 'end' }] };
      const definition = await post('/definition/save', { processKey: name, processName: name, formId, modelJson: JSON.stringify(model), startPermissionType: 'ALL', startPermissionValue: '[]' }, 'value_page_process_created');
      const definitionId = definition.definitionId || definition.id; fixture.definitions.push(definitionId); saveFixture();
      await post('/definition/deploy/' + definitionId, undefined, 'value_page_process_deployed');
      const references = {};
      for (const type of referenceTypes) {
        const field = type.toLowerCase();
        const options = success(await api('employee', `/workflow/wf/draft/context/${definitionId}/references/${field}?pageNum=1&pageSize=100`), 'value_page_authorized_reference_options');
        const unique = options.rows.filter(option => options.rows.filter(candidate => candidate.label === option.label).length === 1);
        const count = type.endsWith('_MULTI') ? 2 : 1;
        assert.ok(unique.length >= count, 'Distinct authorized reference labels required');
        references[field] = unique.slice(0, count);
      }
      prepared.push({ device, name, definitionId, references });
    }
    const mobilePages = {};
    for (const actor of ['employee', 'peer']) {
      const mobile = await createB2MobileBrowser({ admin: sessions[actor].page, secrets, check, landingPath: '/tasks', landingHeading: '我的任务' });
      contexts.push(mobile); mobilePages[actor] = mobile.page;
    }
    for (const setup of prepared) {
      const { device, name, definitionId, references } = setup;
      const page = device === 'mobile' ? mobilePages.employee : sessions.employee.page;
      const reviewer = device === 'mobile' ? mobilePages.peer : sessions.peer.page;
      if (device === 'desktop') for (const current of [page, reviewer]) await current.setViewportSize({ width: 1440, height: 1040 });
      const tap = locator => device === 'mobile' ? tapB2Mobile(locator) : locator.click();
      const handlers = [];
      for (const [actor, current] of [['employee', page], ['peer', reviewer]]) {
        const onError = error => pageErrors.push({ device, actor, name: error.name });
        const onResponse = item => {
          const endpoint = new URL(item.url()).pathname;
          if (item.request().method() === 'POST' && /^\/api\/workflow\/wf\/(draft|start|complete)$/.test(endpoint)) requests.push({ actor, path: endpoint.slice(4), method: 'POST', status: item.status(), traceId: item.headers()['x-trace-id'], observedAt: Date.now(), realPage: true, device });
        };
        current.on('pageerror', onError); current.on('response', onResponse);
        handlers.push(() => { current.off('pageerror', onError); current.off('response', onResponse); });
      }
      try {
        activePage = page;
        const values = { text: `${name}-private-text`, textarea: `${name}-private-notes`, rich_text: `<p>${name}-private-rich</p><script>window.__c1ValuePageExecuted=true</script><img src=x onerror="window.__c1ValuePageExecuted=true">`,
          number: 12.34, amount: '12.34', date: '2026-10-05', datetime: '2026-10-05T12:34', time: '12:34', date_range: ['2026-10-05', '2026-10-06'],
          select: '乙', multi_select: ['甲', '乙'], radio_group: '乙', checkbox_group: ['甲', '乙'], switch: true };
        for (const field of ['text', 'textarea', 'rich_text']) secrets.add(values[field]);
        for (const [field, options] of Object.entries(references)) values[field] = field.endsWith('_multi') ? options.map(option => option.id) : options[0].id;
        const open = async () => {
          await page.goto(new URL('/workplace', page.url()).href, { waitUntil: 'domcontentloaded' });
          await page.getByPlaceholder('流程模型名称、Key、描述信息', { exact: true }).fill(name);
          await tap(page.getByRole('button').filter({ hasText: name }));
          const dialog = page.getByRole('dialog', { name: '发起流程 · ' + name, exact: true }); await dialog.waitFor();
          return dialog;
        };
        let dialog = await open();
        for (const field of ['text', 'textarea', 'rich_text', 'number', 'amount']) await id(dialog, 'input-' + field).fill(String(values[field]));
        values.date = await page.evaluate(() => { const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`; });
        values.datetime = values.date + 'T12:34';
        for (const field of ['date', 'datetime', 'time']) {
          await tap(id(dialog, 'input-' + field));
          if (field !== 'time') await tap(page.getByRole('button', { name: '今天', exact: true }));
          if (field !== 'date') {
            const time = page.locator('.cf-date-dropdown .cf-time-section');
            await tap(time.nth(0).getByRole('button', { name: '12', exact: true }));
            await tap(time.nth(1).getByRole('button', { name: '34', exact: true }));
            await tap(field === 'datetime' ? page.getByRole('button', { name: '确定', exact: true }) : id(dialog, 'label-text'));
          }
        }
        await tap(id(dialog, 'input-switch'));
        await tap(id(dialog, 'input-date_range'));
        await page.getByLabel('开始日期', { exact: true }).fill(values.date_range[0]);
        if (device === 'mobile') await tap(page.getByRole('button', { name: '下一步', exact: true }));
        await page.getByLabel('结束日期', { exact: true }).fill(values.date_range[1]);
        await tap(page.getByRole('button', { name: '应用', exact: true }));
        const select = async (field, labels, multiple) => {
          await waitFor(() => id(dialog, 'input-' + field).getAttribute('aria-disabled'), value => value !== 'true', 'Reference field remained unavailable');
          await tap(id(dialog, 'input-' + field));
          for (const label of labels) await tap(page.getByRole('listbox').getByRole('option').filter({ has: page.getByText(label, { exact: true }) }));
          if (multiple) {
            if (device === 'mobile') await tap(page.getByRole('button', { name: '完成选择', exact: true }));
            else await page.getByRole('listbox').press('Escape');
          }
        };
        await select('select', ['乙'], false); await select('multi_select', ['甲', '乙'], true);
        await tap(id(dialog, 'input-radio_group').getByLabel('乙', { exact: true }));
        for (const label of ['甲', '乙']) await tap(id(dialog, 'input-checkbox_group').getByLabel(label, { exact: true }));
        for (const [field, options] of Object.entries(references)) await select(field, options.map(option => option.label), field.endsWith('_multi'));
        const files = [
          ['upload_file', 'values.pdf', 'application/pdf', Buffer.from('%PDF-1.4\nPage attachment\n%%EOF')],
          ['upload_image', 'values.png', 'image/png', Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64')],
        ];
        for (const [field, filename, mimeType, buffer] of files) {
          const pending = response(page, 'form-files');
          await id(dialog, 'input-' + field).setInputFiles({ name: filename, mimeType, buffer });
          const returned = await pending, body = await returned.json();
          const contentType = returned.request().headers()['content-type'] || '';
          uploads.push({ device, field, status: returned.status(), code: body.code, multipartWithBoundary: /^multipart\/form-data;.*boundary=/i.test(contentType), hasFileId: Boolean(body.data?.fileId) });
          check(`${device}_${field}_native_upload_succeeds`, returned.status() === 200 && body.code === 200 && Boolean(body.data?.fileId) && uploads.at(-1).multipartWithBoundary);
          values[field] = [String(body.data.fileId)]; fixture.files.push(String(body.data.fileId)); saveFixture();
          await id(dialog, 'field-' + field).getByText(filename, { exact: true }).waitFor();
        }
        await tap(id(dialog, 'field-sub_table').getByRole('button', { name: '新增明细', exact: true }));
        await id(dialog, 'input-sub_table[0].item').fill('页面明细'); await id(dialog, 'input-sub_table[0].amount').fill('23.45');
        const safePreview = async (current, scope, phase) => {
          const field = id(scope, 'field-rich_text'); await tap(field.getByRole('button', { name: '预览', exact: true }));
          const observation = await field.evaluate(element => ({ executable: Boolean(window.__c1ValuePageExecuted), unsafe: element.querySelectorAll('script,img,iframe,[onerror],[onclick]').length, readable: element.textContent.includes('-private-rich') }));
          check(`${device}_${phase}_saved_rich_text_is_sanitized`, !observation.executable && observation.unsafe === 0 && observation.readable);
          await current.screenshot({ path: path.join(output, `${device}-${phase}-rich.png`) });
          await tap(field.getByRole('button', { name: '编辑', exact: true }));
        };
        await safePreview(page, dialog, 'input');
        const readDraft = () => {
          const stored = database(`SELECT form_data FROM wf_form_draft WHERE tenant_id=100000 AND user_id=${sessions.employee.account.userId} AND definition_id=${sqlText(definitionId)}`);
          return stored ? JSON.parse(stored) : null;
        };
        await tap(dialog.getByRole('button', { name: '保存草稿', exact: true }));
        const stored = await waitFor(readDraft, value => value && Object.entries(values).every(([field, expected]) => isDeepStrictEqual(value[field], expected)) && value.sub_table?.[0]?.item === '页面明细' && value.sub_table[0].amount === '23.45', 'Actual page values did not reach the saved draft');
        await waitFor(() => dialog.getByRole('status').allTextContents(), contents => contents.some(text => /^已保存 /.test(text)), 'Saved draft status did not settle');
        values.sub_table = stored.sub_table;
        check(`${device}_all_24_page_values_saved`, fields.every(field => isDeepStrictEqual(stored[field.id], values[field.id])) && typeof stored.sub_table[0]._rowId === 'string');
        dialog = await open();
        await tap(dialog.getByRole('button', { name: '恢复草稿', exact: true }));
        await waitFor(() => id(dialog, 'input-text').inputValue(), value => value === values.text, 'Saved draft did not restore');
        const inspectInputs = async (scope, phase) => {
          for (const field of ['text', 'textarea', 'rich_text', 'number', 'amount']) check(`${device}_${phase}_${field}_restored`, await id(scope, 'input-' + field).inputValue() === String(values[field]));
          for (const field of ['date', 'datetime', 'time']) check(`${device}_${phase}_${field}_restored`, (await id(scope, 'input-' + field).innerText()).trim() === values[field].replaceAll('-', '/').replace('T', ' '));
          check(`${device}_${phase}_switch_restored`, await id(scope, 'input-switch').getAttribute('aria-checked') === 'true');
          check(`${device}_${phase}_date_range_restored`, (await id(scope, 'input-date_range').innerText()).includes(values.date_range.join(' - ')));
          for (const field of ['select', 'multi_select', ...Object.keys(references)]) {
            const labels = references[field]?.map(option => option.label) || (Array.isArray(values[field]) ? values[field] : [values[field]]);
            await waitFor(() => id(scope, 'input-' + field).innerText(), text => labels.every(label => text.includes(label)), `${device}_${phase}_${field}: selected labels did not render after loading`);
            check(`${device}_${phase}_${field}_restored`, true);
          }
          check(`${device}_${phase}_radio_restored`, await id(scope, 'input-radio_group').getByLabel('乙', { exact: true }).isChecked());
          check(`${device}_${phase}_checkboxes_restored`, await id(scope, 'input-checkbox_group').getByLabel('甲', { exact: true }).isChecked() && await id(scope, 'input-checkbox_group').getByLabel('乙', { exact: true }).isChecked());
          for (const [field, filename] of files) { await id(scope, 'field-' + field).getByText(filename, { exact: true }).waitFor(); check(`${device}_${phase}_${field}_restored`, true); }
          check(`${device}_${phase}_sub_table_restored`, await id(scope, 'input-sub_table[0].item').inputValue() === '页面明细' && await id(scope, 'input-sub_table[0].amount').inputValue() === '23.45');
        };
        await inspectInputs(dialog, 'draft'); await safePreview(page, dialog, 'restored');
        const pendingStart = response(page, 'start'); await tap(dialog.getByRole('button', { name: '提交申请', exact: true }));
        const startResponse = await pendingStart, startBody = await startResponse.json(), instanceId = startBody.data?.instanceId || startBody.data?.processInstanceId;
        check(`${device}_all_24_values_started_from_page`, startResponse.status() === 200 && startBody.code === 200 && Boolean(instanceId));
        fixture.instances.push(instanceId); saveFixture(); await dialog.waitFor({ state: 'hidden' });
        const task = await waitFor(() => database(`SELECT JSON_OBJECT('id',task_id,'assignee',CAST(assignee AS CHAR)) FROM wf_task WHERE tenant_id=100000 AND instance_id=${sqlText(instanceId)} AND status='TODO'`), Boolean, 'Actual reviewer task missing');
        const taskInfo = JSON.parse(task); check(`${device}_actual_reviewer_assigned`, taskInfo.assignee === sessions.peer.account.userId);
        const referencePath = field => `/workflow/wf/task/${taskInfo.id}/form-references/${field}?pageNum=1&pageSize=100`;
        for (const [field, options] of Object.entries(references)) {
          const actual = await api('peer', referencePath(field));
          check(`${device}_${field}_task_scoped_reference_allowed`, actual.status === 200 && actual.body?.code === 200
            && actual.cacheControl === 'private, no-store' && options.every(option => actual.body.data?.rows?.some(row => row.id === option.id && row.label === option.label)));
        }
        const other = await api('employee', referencePath('employee'));
        check(`${device}_starter_cannot_read_reviewers_reference_options`, other.status === 403 && !other.body?.data);
        const foreign = await api('foreign', referencePath('employee'));
        check(`${device}_other_tenant_cannot_read_task_reference_options`, [400, 403, 404].includes(foreign.status) && !foreign.body?.data);
        const undeclared = await api('peer', referencePath('missing'));
        check(`${device}_undeclared_task_reference_rejected`, undeclared.status === 400 && undeclared.body?.code === 'TASK_REFERENCE_UNAVAILABLE' && !undeclared.body?.data);
        activePage = reviewer;
        await reviewer.goto(new URL('/workflow/task/' + taskInfo.id, reviewer.url()).href, { waitUntil: 'domcontentloaded' });
        const taskDialog = reviewer.getByRole('dialog', { name: '任务处理', exact: true }); await taskDialog.waitFor();
        await inspectInputs(taskDialog, 'approval'); await safePreview(reviewer, taskDialog, 'approval');
        const pendingApproval = response(reviewer, 'complete');
        await tap(taskDialog.getByRole('button', { name: '同意', exact: true })); await tap(taskDialog.getByRole('button', { name: '确认', exact: true }));
        const returned = await pendingApproval;
        check(`${device}_actual_page_approval_succeeds`, returned.status() === 200 && (await returned.json()).code === 200);
        await waitFor(() => database(`SELECT status FROM wf_process_instance WHERE tenant_id=100000 AND instance_id=${sqlText(instanceId)}`), value => value === 'PASSED', 'Page approval did not finish');
        const finalValues = JSON.parse(database(`SELECT variables FROM wf_process_instance WHERE tenant_id=100000 AND instance_id=${sqlText(instanceId)}`));
        check(`${device}_all_24_values_retained_after_page_approval`, fields.every(field => isDeepStrictEqual(finalValues[field.id], values[field.id])));
        check(`${device}_page_approval_has_unique_history`, database(`SELECT COUNT(*) FROM wf_task_history WHERE tenant_id=100000 AND task_id=${sqlText(taskInfo.id)} AND action='APPROVE'`) === '1');
        cases.push({ device, types: fields.map(field => field.type), saved: true, restored: true, started: true, approved: true, richTextSafe: true });
      } finally { handlers.forEach(remove => remove()); }
    }
    check('all_value_pages_have_no_browser_exceptions', pageErrors.length === 0);
    check('both_devices_complete_all_24_actual_value_pages', cases.length === 2 && cases.every(entry => entry.types.length === 24 && entry.approved));
  } catch (error) {
    failure = error;
    if (activePage && !activePage.isClosed()) await activePage.screenshot({ path: path.join(output, 'failure.png') }).catch(() => undefined);
  } finally {
    for (const context of contexts) await context.close();
    await fs.writeFile(path.join(output, 'result.json'), JSON.stringify({ passed: !failure, cases, pageErrors, uploads, realPages: true, fabricatedResponses: 0, injectedValues: 0 }, null, 2));
    console.log(`C1_VALUE_PAGES: devices=${cases.length}; types_per_device=24; browser_errors=${pageErrors.length}; fabricated_responses=0; injected_values=0; passed=${!failure}`);
  }
  if (failure) throw failure;
}
