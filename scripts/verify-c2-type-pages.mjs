import assert from 'node:assert/strict';
import { isDeepStrictEqual } from 'node:util';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createB2MobileBrowser, tapB2Mobile } from './b2-mobile-browser.mjs';

export async function verifyC2TypePages({ sessions, api, success, check, database, sqlText, fixture, saveFixture, marker, evidence, secrets, requests }) {
  const output = path.join(evidence, `c2-type-pages-${fixture.runId}`); await fs.mkdir(output);
  const contexts = [], removers = [], cases = [], pageErrors = [], uploads = [];
  let activePage, failure, stage = 'setup';
  const waitFor = async (read, accept, message) => {
    const deadline = Date.now() + 30000;
    do { const value = await read(); if (accept(value)) return value; await new Promise(resolve => setTimeout(resolve, 100)); } while (Date.now() < deadline);
    throw new Error(message);
  };
  const id = (scope, value) => scope.locator(`[id=${JSON.stringify(value)}]`);
  const cell = (scope, index, field) => id(scope, `field-items[${index}].${field}`);
  const control = (scope, index, field) => id(scope, `input-items[${index}].${field}`);
  const dictionary = database("SELECT t.dict_type FROM sys_dict_type t JOIN sys_dict_data d ON d.tenant_id=t.tenant_id AND d.dict_type=t.dict_type WHERE t.tenant_id=100000 AND t.status='0' AND d.status='0' ORDER BY t.dict_id,d.dict_sort,d.dict_code LIMIT 1");
  assert.ok(dictionary, 'Owned active dictionary required');
  const columns = [
    { id: 'text', type: 'TEXT', label: '费用说明', required: true, width: 200 },
    { id: 'amount', type: 'AMOUNT', label: '费用金额', required: true, precision: 2, min: 0, max: 100, width: 160 },
    { id: 'count_number', type: 'NUMBER', label: '计数样本', min: 0, max: 100, width: 140 },
    { id: 'avg_number', type: 'NUMBER', label: '平均样本', precision: 2, min: 0, max: 100, width: 140 },
    { id: 'date', type: 'DATE', label: '发生日期', required: true, width: 180 },
    { id: 'select', type: 'SELECT', label: '费用类别', options: ['甲', '乙'], required: true, width: 160 },
    { id: 'dict', type: 'DICT_SELECT', label: '字典类别', dictType: dictionary, required: true, width: 180 },
    { id: 'switch', type: 'SWITCH', label: '已核对', width: 120 },
    { id: 'employee', type: 'EMPLOYEE', label: '员工', onlyActive: true, required: true, width: 220 },
    { id: 'dept', type: 'DEPT', label: '部门', onlyActive: true, required: true, width: 220 },
    { id: 'file', type: 'UPLOAD_FILE', label: '报销凭据', maxCount: 1, required: true, width: 500 },
  ];
  const fields = [{ id: 'items', type: 'SUB_TABLE', label: '完整费用明细', minRows: 2, maxRows: 5, columns,
    summaryColumns: [{ columnId: 'amount', aggregation: 'SUM' }, { columnId: 'count_number', aggregation: 'COUNT' }, { columnId: 'avg_number', aggregation: 'AVG' }] }];
  const adminPost = async (endpoint, body, label) => success(await api('admin', '/workflow/wf' + endpoint, { method: 'POST', body }), label);
  const startCount = Number(database("SELECT config_value FROM sys_config WHERE config_scope='0' AND config_key='sys.workflow.rateLimit.startProcess'"));
  const startSeconds = Number(database("SELECT config_value FROM sys_config WHERE config_scope='0' AND config_key='sys.workflow.rateLimit.startProcess.windowSeconds'"));
  assert.ok(startCount > 0 && startSeconds > 0, 'Start request pacing configuration required');
  const paceStart = async () => {
    while (true) {
      const active = requests.filter(request => request.actor === 'employee' && request.method === 'POST' && request.path === '/workflow/wf/start' && request.observedAt + startSeconds * 1000 + 250 > Date.now());
      if (active.length < startCount) return;
      const delay = Math.min(20000, active[active.length - startCount].observedAt + startSeconds * 1000 + 250 - Date.now());
      console.log(`C2_TYPES_RATE_WAIT: wait_ms=${delay}; configuration_changed=false; counter_writes=0`);
      await new Promise(resolve => setTimeout(resolve, Math.max(1, delay)));
    }
  };
  try {
    const mobilePages = {};
    for (const actor of ['employee', 'peer']) {
      const mobile = await createB2MobileBrowser({ admin: sessions[actor].page, secrets, check, landingPath: '/tasks', landingHeading: '我的任务' });
      contexts.push(mobile); mobilePages[actor] = mobile.page;
    }
    for (const device of ['desktop', 'mobile']) {
      const name = `${marker}-${device}-types`;
      stage = device + '-setup';
      const form = await adminPost('/form/save', { formKey: name, formName: name, fieldsJson: JSON.stringify(fields) }, `${device}_c2_type_form_saved`);
      const formId = form.formId || form.id; fixture.forms.push(formId); saveFixture();
      const definition = await adminPost('/definition/save', { processKey: name, processName: name, formId, startPermissionType: 'ALL', startPermissionValue: '[]',
        modelJson: JSON.stringify({ nodes: [{ id: 'start', type: 'START', title: '发起' }, { id: 'approval', type: 'APPROVAL', title: '费用复核', approverType: 'USER', approverValue: sessions.peer.account.userId, allowEdit: true }, { id: 'end', type: 'END', title: '结束' }], edges: [{ source: 'start', target: 'approval' }, { source: 'approval', target: 'end' }] }) }, `${device}_c2_type_process_saved`);
      const definitionId = definition.definitionId || definition.id; fixture.definitions.push(definitionId); saveFixture();
      await adminPost('/definition/deploy/' + definitionId, undefined, `${device}_c2_type_process_deployed`);
      const references = {};
      for (const field of ['employee', 'dept', 'dict']) {
        const options = success(await api('employee', `/workflow/wf/draft/context/${definitionId}/references/items.${field}?pageNum=1&pageSize=100`), `${device}_c2_${field}_authorized_options`);
        const chosen = options.rows.find(option => options.rows.filter(candidate => candidate.label === option.label).length === 1);
        assert.ok(chosen, 'Distinct authorized reference label required'); references[field] = chosen;
      }
      const page = device === 'mobile' ? mobilePages.employee : sessions.employee.page;
      const reviewer = device === 'mobile' ? mobilePages.peer : sessions.peer.page;
      if (device === 'desktop') for (const current of [page, reviewer]) await current.setViewportSize({ width: 1600, height: 1100 });
      activePage = page;
      const tap = locator => device === 'mobile' ? tapB2Mobile(locator) : locator.click();
      for (const [actor, current] of [['employee', page], ['peer', reviewer]]) {
        const onError = error => pageErrors.push({ device, actor, name: error.name });
        const onResponse = response => {
          const endpoint = new URL(response.url()).pathname;
          if (!stage.endsWith('-server-boundaries') && response.request().method() === 'POST' && /^\/api\/workflow\/wf\/(draft|start|complete|form-files)$/.test(endpoint)) requests.push({ actor, path: endpoint.slice(4), method: 'POST', status: response.status(), traceId: response.headers()['x-trace-id'], observedAt: Date.now(), realPage: true, device });
        };
        current.on('pageerror', onError); current.on('response', onResponse);
        removers.push(() => { current.off('pageerror', onError); current.off('response', onResponse); });
      }
      const open = async () => {
        await page.goto(new URL('/workplace', page.url()).href, { waitUntil: 'domcontentloaded' });
        await page.getByPlaceholder('流程模型名称、Key、描述信息', { exact: true }).fill(name);
        await tap(page.getByRole('button').filter({ hasText: name }));
        const dialog = page.getByRole('dialog', { name: '发起流程 · ' + name, exact: true }); await dialog.waitFor();
        await control(dialog, 0, 'text').waitFor(); return dialog;
      };
      const readDraft = () => {
        const raw = database(`SELECT JSON_OBJECT('draftId',draft_id,'version',lock_version,'data',form_data) FROM wf_form_draft WHERE tenant_id=100000 AND user_id=${sessions.employee.account.userId} AND definition_id=${sqlText(definitionId)}`);
        if (!raw) return undefined;
        const draft = JSON.parse(raw); if (typeof draft.data === 'string') draft.data = JSON.parse(draft.data); return draft;
      };
      const save = async (scope, accept) => {
        await tap(scope.getByRole('button', { name: '保存草稿', exact: true }));
        const draft = await waitFor(readDraft, value => value && accept(value.data.items), 'Typed subtable draft did not persist');
        await waitFor(() => scope.getByRole('status').allTextContents(), values => values.some(value => /^已保存 /.test(value)), 'Typed subtable save did not settle'); return draft;
      };
      let dialog = await open();
      await tap(dialog.getByRole('button', { name: '新增明细', exact: true }));
      const day = await page.evaluate(() => { const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`; });
      const values = Array.from({ length: 3 }, (_, index) => ({ text: `${name}-private-${index}`, amount: ['0.1','0.2','0.3'][index],
        count_number: [1,'',0][index], avg_number: [0.1,0.2,''][index], date: day, select: index === 1 ? '甲' : '乙', switch: index !== 1,
        ...Object.fromEntries(Object.entries(references).map(([field, option]) => [field, option.id])), file: [] }));
      values.forEach(row => secrets.add(row.text));
      const select = async (index, field, label) => {
        await waitFor(() => control(dialog, index, field).getAttribute('aria-disabled'), value => value !== 'true', 'Subtable selector unavailable');
        await tap(control(dialog, index, field));
        await tap(page.getByRole('listbox').getByRole('option').filter({ has: page.getByText(label, { exact: true }) }));
      };
      stage = device + '-fill';
      for (let index = 0; index < 3; index++) {
        for (const field of ['text','amount','count_number','avg_number']) await control(dialog, index, field).fill(field === 'amount' ? Number(values[index][field]).toFixed(2) : String(values[index][field]));
        await tap(control(dialog, index, 'date')); await tap(page.getByRole('button', { name: '今天', exact: true }));
        await select(index, 'select', values[index].select);
        for (const [field, option] of Object.entries(references)) await select(index, field, option.label);
        if (values[index].switch) await tap(control(dialog, index, 'switch'));
      }
      const filenames = values.map((_, index) => {
        const prefix = `${name}-${index}-`;
        return prefix + '完整报销凭据'.repeat(17).slice(0, 96 - prefix.length) + '.pdf';
      });
      assert.ok(filenames.every(filename => filename.length === 100), 'Long filename must respect the existing 100-character limit');
      filenames.forEach(filename => secrets.add(filename));
      const fileBody = Buffer.from('%PDF-1.4\nTyped subtable attachment\n%%EOF');
      const receiveUpload = async (promise, index) => {
        const response = await promise; assert.ok(response, 'Native upload response required');
        const body = await response.json();
        const passed = response.status() === 200 && body.code === 200 && Boolean(body.data?.fileId) && /^multipart\/form-data;.*boundary=/i.test(response.request().headers()['content-type'] || '');
        const safeMessages = new Set(['文件名过长', '附件大小、扩展名或实际内容不符合字段要求', '操作成功']);
        uploads.push({ device, row: index, passed, status: response.status(),
          code: /^[A-Z0-9_]+$/.test(String(body.code)) ? body.code : 'REDACTED',
          message: safeMessages.has(body.msg || body.message) ? body.msg || body.message : 'REDACTED' });
        if (body.data?.fileId) { const fileId = String(body.data.fileId); values[index].file = [fileId]; if (!fixture.files.includes(fileId)) fixture.files.push(fileId); saveFixture(); }
        check(`${device}_c2_row_${index}_real_upload`, passed); return body.data;
      };
      const uploadResponse = () => page.waitForResponse(response => response.request().method() === 'POST' && new URL(response.url()).pathname === '/api/workflow/wf/form-files', { timeout: 60000 }).catch(() => null);
      stage = device + '-concurrent-upload';
      const gates = [], pending = [];
      let concurrentFailure;
      const routePattern = '**/api/workflow/wf/form-files?**';
      await page.route(routePattern, async route => {
        if (route.request().method() !== 'POST') return route.continue();
        await new Promise(resolve => gates.push(resolve)); return route.continue();
      });
      try {
        await control(dialog, 0, 'file').setInputFiles({ name: filenames[0], mimeType: 'application/pdf', buffer: fileBody });
        await waitFor(() => gates.length, count => count === 1, 'First upload request not held');
        await control(dialog, 1, 'file').setInputFiles({ name: filenames[1], mimeType: 'application/pdf', buffer: fileBody });
        await waitFor(() => gates.length, count => count === 2, 'Second upload request not held');
        check(`${device}_c2_submit_waits_for_both_uploads`, await dialog.getByRole('button', { name: '提交申请', exact: true }).isDisabled());
        const first = uploadResponse(); gates[0](); await receiveUpload(first, 0);
        await cell(dialog, 0, 'file').getByText(filenames[0], { exact: true }).waitFor();
        await waitFor(() => cell(dialog, 0, 'file').getByRole('button', { name: '正在上传…', exact: true }).count(), count => count === 0, 'First upload remains busy');
        check(`${device}_c2_first_upload_does_not_release_second`, await dialog.getByRole('button', { name: '提交申请', exact: true }).isDisabled());
      } catch (error) {
        concurrentFailure = error;
      } finally {
        if (gates.length >= 2) { const second = uploadResponse().catch(() => null); pending.push(receiveUpload(second, 1)); gates[1](); }
        gates.forEach(release => release());
        const settled = await Promise.allSettled(pending);
        await page.unroute(routePattern);
        concurrentFailure ||= settled.find(result => result.status === 'rejected')?.reason;
      }
      if (concurrentFailure) throw concurrentFailure;
      const third = uploadResponse(); await control(dialog, 2, 'file').setInputFiles({ name: filenames[2], mimeType: 'application/pdf', buffer: fileBody }); await receiveUpload(third, 2);
      await waitFor(() => dialog.getByRole('button', { name: '提交申请', exact: true }).isEnabled(), Boolean, 'Submit stayed unavailable after all uploads');
      for (let index = 0; index < 3; index++) {
        const filename = cell(dialog, index, 'file').getByText(filenames[index], { exact: true }); await filename.waitFor();
        check(`${device}_c2_row_${index}_full_filename_fits`, await filename.evaluate(node => node.scrollWidth <= node.clientWidth + 1 && getComputedStyle(node).textOverflow !== 'ellipsis'));
        check(`${device}_c2_row_${index}_one_file_limit`, await control(dialog, index, 'file').isDisabled());
      }
      const expectedRow = (row, expected) => Object.entries(expected).every(([field, value]) => field.endsWith('_number') && value === ''
        ? !Object.hasOwn(row, field) || row[field] === '' : isDeepStrictEqual(row[field], value));
      stage = device + '-save';
      let draft = await save(dialog, rows => rows.length === 3 && rows.every((row, index) => expectedRow(row, values[index])));
      const initial = draft.data.items;
      check(`${device}_c2_ten_types_persist_values`, initial.every((row, index) => expectedRow(row, values[index])) && new Set(initial.map(row => row._rowId)).size === 3);
      const footer = scope => scope.locator('[data-subtable-footer]');
      const summaries = async (scope, phase) => {
        for (const [label, total] of [['费用金额 · 合计','0.60'],['计数样本 · 计数','2'],['平均样本 · 平均','0.15']]) check(`${device}_c2_${phase}_${label}`, await footer(scope).getByText(label + ' ' + total, { exact: true }).count() === 1);
      };
      await summaries(dialog, 'filled');
      stage = device + '-reorder';
      if (device === 'desktop') {
        const source = dialog.getByRole('button', { name: '拖动第1行排序', exact: true }), destination = dialog.getByRole('button', { name: '拖动第2行排序', exact: true });
        await source.scrollIntoViewIfNeeded(); await destination.scrollIntoViewIfNeeded();
        const start = await source.boundingBox(), end = await destination.boundingBox(); assert.ok(start && end);
        await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2); await page.mouse.down();
        await page.mouse.move(end.x + end.width / 2, end.y + end.height / 2, { steps: 25 }); await page.mouse.up();
      } else await tap(dialog.getByRole('button', { name: '下移第1行', exact: true }));
      const expected = [initial[1], initial[0], initial[2]];
      await waitFor(() => control(dialog, 0, 'text').inputValue(), value => value === expected[0].text, 'Typed row movement did not finish');
      draft = await save(dialog, rows => isDeepStrictEqual(rows, expected));
      check(`${device}_c2_real_sort_preserves_every_column_and_id`, isDeepStrictEqual(draft.data.items, expected));
      if (device === 'desktop') {
        stage = device + '-server-boundaries';
        const context = success(await api('employee', `/workflow/wf/draft/context/${definitionId}`), 'c2_boundary_context');
        const samples = [
          { name: 'above_maximum', field: 'items', change: () => Array.from({ length: 6 }, (_, index) => ({ ...expected[index % 3], _rowId: 'limit-' + index })) },
          { name: 'numeric_range', field: 'items[0].amount', change: rows => { rows[0].amount = '100.01'; return rows; } },
          { name: 'outside_options', field: 'items[0].select', change: rows => { rows[0].select = '未声明选项'; return rows; } },
          { name: 'unknown_column', field: null, change: rows => { rows[0].undeclared = 'unexpected'; return rows; } },
          { name: 'missing_required', field: 'items[0].text', startOnly: true, change: rows => { rows[0].text = ''; return rows; } },
          { name: 'below_minimum', field: 'items', startOnly: true, change: rows => rows.slice(0, 1) },
        ];
        for (const sample of samples) for (const endpoint of sample.startOnly ? ['start'] : ['draft','start']) {
          if (endpoint === 'start') await paceStart();
          const changed = sample.change(structuredClone(expected));
          const body = endpoint === 'draft' ? { draftId: draft.draftId, definitionId, expectedVersion: draft.version, loadedContextHash: context.contextHash, title: name, formData: { items: changed }, nodeAssignees: {} }
            : { processDefKey: name, businessKey: name + '-' + sample.name, variables: { items: changed }, nodeAssignees: {} };
          const result = await api('employee', '/workflow/wf/' + endpoint, { method: 'POST', body });
          const errors = result.body?.errors;
          const passed = result.status === 400 && result.body?.code === 'FORM_INVALID_DATA' && Array.isArray(errors)
            && (sample.field === null ? errors.length === 0 : errors.some(error => error.field === sample.field));
          cases.push({ device, endpoint, sample: sample.name, field: sample.field, status: result.status, fieldErrorCount: Array.isArray(errors) ? errors.length : 0, passed });
          check(`c2_${endpoint}_${sample.name}_rejected_with_safe_field_errors`, passed);
          check(`c2_${endpoint}_${sample.name}_preserves_draft_and_no_instance`, isDeepStrictEqual(readDraft(), draft) && database(`SELECT COUNT(*) FROM wf_process_instance WHERE tenant_id=100000 AND definition_id=${sqlText(definitionId)}`) === '0');
        }
      }
      stage = device + '-restore';
      dialog = await open(); await tap(dialog.getByRole('button', { name: '恢复草稿', exact: true }));
      await waitFor(() => control(dialog, 0, 'text').inputValue(), value => value === expected[0].text, 'Typed subtable did not restore');
      const observeRows = async (scope, phase) => {
        for (let index = 0; index < 3; index++) {
          const row = expected[index];
          for (const field of ['text','amount','count_number','avg_number']) {
            const shown = await control(scope, index, field).inputValue();
            check(`${device}_c2_${phase}_${index}_${field}`, field.endsWith('_number') && row[field] != null && row[field] !== '' ? Number(shown) === row[field] : shown === String(row[field] ?? ''));
          }
          check(`${device}_c2_${phase}_${index}_date`, new RegExp(row.date.replaceAll('-', '[/-]')).test(await control(scope, index, 'date').textContent()));
          check(`${device}_c2_${phase}_${index}_switch`, await control(scope, index, 'switch').getAttribute('aria-checked') === String(row.switch));
          for (const field of ['select','employee','dept','dict']) {
            const label = field === 'select' ? row.select : references[field].label;
            await waitFor(() => control(scope, index, field).textContent(), text => text.includes(label), `${device}_${phase}_${index}_${field}_label_did_not_load`);
            check(`${device}_c2_${phase}_${index}_${field}`, (await control(scope, index, field).textContent()).includes(label));
          }
          const fileIndex = values.findIndex(value => value.text === row.text);
          await cell(scope, index, 'file').getByText(filenames[fileIndex], { exact: true }).waitFor();
          check(`${device}_c2_${phase}_${index}_file`, await control(scope, index, 'file').isDisabled());
        }
        await summaries(scope, phase);
      };
      await observeRows(dialog, 'restore'); await page.screenshot({ path: path.join(output, device + '-restore.png') });
      stage = device + '-start'; await paceStart();
      const starting = page.waitForResponse(response => response.request().method() === 'POST' && new URL(response.url()).pathname === '/api/workflow/wf/start').catch(() => null);
      await tap(dialog.getByRole('button', { name: '提交申请', exact: true }));
      const started = await starting; assert.ok(started, 'Actual subtable start response required');
      const startedBody = await started.json();
      const instanceId = startedBody.data?.instanceId || startedBody.data?.processInstanceId;
      check(`${device}_c2_ten_types_start`, started.status() === 200 && startedBody.code === 200 && Boolean(instanceId));
      fixture.instances.push(instanceId); saveFixture();
      const taskId = await waitFor(() => database(`SELECT task_id FROM wf_task WHERE tenant_id=100000 AND instance_id=${sqlText(instanceId)} AND status='TODO'`), Boolean, 'Typed subtable approval missing');
      stage = device + '-approval'; activePage = reviewer;
      await reviewer.goto(new URL('/workflow/task/' + taskId, reviewer.url()).href, { waitUntil: 'domcontentloaded' });
      const task = reviewer.getByRole('dialog', { name: '任务处理', exact: true }); await task.waitFor(); await control(task, 0, 'text').waitFor();
      await observeRows(task, 'approval'); await reviewer.screenshot({ path: path.join(output, device + '-approval.png') });
      const completing = reviewer.waitForResponse(response => response.request().method() === 'POST' && new URL(response.url()).pathname === '/api/workflow/wf/complete').catch(() => null);
      await tap(task.getByRole('button', { name: '同意', exact: true })); await tap(task.getByRole('button', { name: '确认', exact: true }));
      const completed = await completing; assert.ok(completed, 'Actual subtable approval response required');
      check(`${device}_c2_ten_types_approve`, completed.status() === 200 && (await completed.json()).code === 200);
      await waitFor(() => database(`SELECT status FROM wf_process_instance WHERE tenant_id=100000 AND instance_id=${sqlText(instanceId)}`), value => value === 'PASSED', 'Typed subtable approval not final');
      const final = JSON.parse(database(`SELECT variables FROM wf_process_instance WHERE tenant_id=100000 AND instance_id=${sqlText(instanceId)}`));
      check(`${device}_c2_all_values_and_ids_survive_approval`, isDeepStrictEqual(final.items, expected));
      for (const row of expected) {
        const downloaded = await api('peer', `/workflow/wf/form-files/${row.file[0]}/content?instanceId=${encodeURIComponent(instanceId)}&fieldPath=items.file`);
        check(`${device}_c2_approved_file_${expected.indexOf(row)}_content`, downloaded.status === 200 && downloaded.signature.startsWith('%PDF-1.4') && downloaded.length === fileBody.length);
      }
      check(`${device}_c2_definition_unchanged`, isDeepStrictEqual(JSON.parse(database(`SELECT fields_json FROM wf_form_definition WHERE tenant_id=100000 AND form_id=${sqlText(formId)} AND version=1`)), fields));
      cases.push({ device, phase: 'complete', rows: expected.length, types: new Set(columns.map(column => column.type)).size, passed: true });
    }
    check('c2_types_no_browser_errors', pageErrors.length === 0);
  } catch (error) {
    failure = error;
    if (activePage && !activePage.isClosed()) await activePage.screenshot({ path: path.join(output, 'failure.png') }).catch(() => undefined);
  } finally {
    removers.forEach(remove => remove()); for (const context of contexts) await context.close();
    await fs.writeFile(path.join(output, 'result.json'), JSON.stringify({ passed: !failure, stage, cases, uploads, pageErrors, realPages: true, fabricatedResponses: 0, forcedModelWrites: 0, failure: failure ? { name: failure.name, message: String(failure.message).split('\n')[0] } : undefined }, null, 2));
    console.log(`C2_TYPE_PAGES: completed_devices=${cases.filter(item => item.phase === 'complete').length}; cases=${cases.length}; uploads=${uploads.length}; browser_errors=${pageErrors.length}; passed=${!failure}`);
  }
  if (failure) throw failure;
}
