import assert from 'node:assert/strict';
import { isDeepStrictEqual } from 'node:util';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createB2MobileBrowser, tapB2Mobile } from './b2-mobile-browser.mjs';

export async function verifyC2PrecisionPages({ sessions, api, success, check, database, sqlText, fixture, saveFixture, marker, evidence, secrets, requests }) {
  const output = path.join(evidence, `c2-precision-pages-${fixture.runId}`); await fs.mkdir(output);
  const contexts = [], removers = [], cases = [], pageErrors = [], draftResponses = [];
  let activePage, failure, stage = 'setup';
  const waitFor = async (read, accept, message) => {
    const deadline = Date.now() + 30000;
    do { const value = await read(); if (accept(value)) return value; await new Promise(resolve => setTimeout(resolve, 100)); } while (Date.now() < deadline);
    throw new Error(message);
  };
  const control = (scope, index, field) => scope.locator('[id=' + JSON.stringify(`input-items[${index}].${field}`) + ']');
  const normalized = value => value == null || value === '' ? '' : String(value).replaceAll(',', '').replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');
  const whole = '1' + '0'.repeat(89);
  const columns = [
    { id: 'text', type: 'TEXT', label: '明细说明', required: true, width: 200 },
    { id: 'gross', type: 'AMOUNT', label: '完整金额', precision: 2, width: 300 },
    { id: 'net', type: 'AMOUNT', label: '抵消金额', precision: 2, width: 300 },
    { id: 'average', type: 'AMOUNT', label: '平均金额', precision: 2, width: 300 },
    { id: 'counted', type: 'NUMBER', label: '计数样本', precision: 2, width: 160 },
  ];
  const fields = [{ id: 'items', type: 'SUB_TABLE', label: '精确金额明细', minRows: 3, maxRows: 500, columns,
    summaryColumns: [{ columnId: 'gross', aggregation: 'SUM' }, { columnId: 'net', aggregation: 'SUM' }, { columnId: 'average', aggregation: 'AVG' }, { columnId: 'counted', aggregation: 'COUNT' }] }];
  const totals = [['完整金额 · 合计', whole + '.03'], ['抵消金额 · 合计', '0.03'], ['平均金额 · 平均', whole + '.01'], ['计数样本 · 计数', '2']];
  for (const value of [whole, whole + '.01', whole + '.03', '-' + whole]) secrets.add(value);
  const post = async (endpoint, body, label) => success(await api('admin', '/workflow/wf' + endpoint, { method: 'POST', body }), label);
  const startCount = Number(database("SELECT config_value FROM sys_config WHERE config_scope='0' AND config_key='sys.workflow.rateLimit.startProcess'"));
  const startSeconds = Number(database("SELECT config_value FROM sys_config WHERE config_scope='0' AND config_key='sys.workflow.rateLimit.startProcess.windowSeconds'"));
  assert.ok(startCount > 0 && startSeconds > 0);
  const paceStart = async () => {
    while (true) {
      const active = requests.filter(request => request.actor === 'employee' && request.method === 'POST' && request.path === '/workflow/wf/start' && request.observedAt + startSeconds * 1000 + 250 > Date.now());
      if (active.length < startCount) return;
      await new Promise(resolve => setTimeout(resolve, Math.max(1, Math.min(20000, active[active.length - startCount].observedAt + startSeconds * 1000 + 250 - Date.now()))));
    }
  };
  try {
    const mobilePages = {};
    for (const actor of ['employee', 'peer']) {
      const mobile = await createB2MobileBrowser({ admin: sessions[actor].page, secrets, check, landingPath: '/tasks', landingHeading: '我的任务' });
      contexts.push(mobile); mobilePages[actor] = mobile.page;
    }
    for (const device of ['desktop', 'mobile']) {
      stage = device + '-setup';
      const name = marker + '-' + device + '-precision';
      const form = await post('/form/save', { formKey: name, formName: name, fieldsJson: JSON.stringify(fields) }, device + '_c2_precision_form_saved');
      const formId = form.formId || form.id; fixture.forms.push(formId); saveFixture();
      const definition = await post('/definition/save', { processKey: name, processName: name, formId, startPermissionType: 'ALL', startPermissionValue: '[]',
        modelJson: JSON.stringify({ nodes: [{ id: 'start', type: 'START', title: '发起' }, { id: 'approval', type: 'APPROVAL', title: '金额复核', approverType: 'USER', approverValue: sessions.peer.account.userId, allowEdit: true }, { id: 'end', type: 'END', title: '结束' }], edges: [{ source: 'start', target: 'approval' }, { source: 'approval', target: 'end' }] }) }, device + '_c2_precision_process_saved');
      const definitionId = definition.definitionId || definition.id; fixture.definitions.push(definitionId); saveFixture();
      await post('/definition/deploy/' + definitionId, undefined, device + '_c2_precision_process_deployed');
      const page = device === 'mobile' ? mobilePages.employee : sessions.employee.page;
      const reviewer = device === 'mobile' ? mobilePages.peer : sessions.peer.page;
      if (device === 'desktop') for (const current of [page, reviewer]) await current.setViewportSize({ width: 1600, height: 1100 });
      activePage = page;
      const tap = locator => device === 'mobile' ? tapB2Mobile(locator) : locator.click();
      for (const [actor, current] of [['employee', page], ['peer', reviewer]]) {
        const onError = error => pageErrors.push({ device, actor, name: error.name });
        const onResponse = response => {
          const endpoint = new URL(response.url()).pathname;
          if (response.request().method() === 'POST' && /^\/api\/workflow\/wf\/(draft|start|complete)$/.test(endpoint)) requests.push({ actor, path: endpoint.slice(4), method: 'POST', status: response.status(), traceId: response.headers()['x-trace-id'], observedAt: Date.now(), realPage: true, device });
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
      const values = [
        { text: name + '-private-0', gross: whole + '.01', net: whole + '.01', average: whole, counted: '1' },
        { text: name + '-private-1', gross: '0.02', net: '-' + whole, average: whole + '.01', counted: '0' },
        { text: name + '-private-2', gross: '', net: '0.02', average: '', counted: '' },
      ];
      for (const value of values) secrets.add(value.text);
      const matches = rows => rows.length === 3 && rows.every((row, index) => Object.entries(values[index]).every(([field, value]) => normalized(row[field]) === value));
      const summaries = async (scope, phase) => {
        for (const [label, total] of totals) {
          const shown = scope.locator('[data-subtable-footer]').getByText(label + ' ' + total, { exact: true });
          await shown.waitFor(); check(device + '_c2_precision_' + phase + '_' + label, await shown.count() === 1);
          check(device + '_c2_precision_' + phase + '_' + label + '_fits', await shown.evaluate(node => {
            const footer = node.closest('[data-subtable-footer]');
            const rect = node.getBoundingClientRect(), bounds = footer.getBoundingClientRect();
            return node.scrollWidth <= node.clientWidth + 1 && rect.left >= bounds.left - 1 && rect.right <= bounds.right + 1;
          }));
        }
      };
      let dialog = await open(); stage = device + '-fill';
      for (let index = 0; index < 3; index++) for (const [field, value] of Object.entries(values[index])) await control(dialog, index, field).fill(value);
      await summaries(dialog, 'filled');
      stage = device + '-save';
      const saving = page.waitForResponse(response => response.request().method() === 'POST' && new URL(response.url()).pathname === '/api/workflow/wf/draft').catch(() => null);
      await tap(dialog.getByRole('button', { name: '保存草稿', exact: true }));
      const saved = await saving; assert.ok(saved, 'Exact decimal draft response required');
      const savedBody = await saved.json();
      const sentBody = saved.request().postDataJSON();
      const code = /^[A-Z0-9_]+$/.test(String(savedBody.code)) ? String(savedBody.code) : 'REDACTED';
      draftResponses.push({ device, status: saved.status(), code,
        definitionMatches: sentBody.definitionId === definitionId, contextHashValid: /^[a-f0-9]{64}$/.test(sentBody.loadedContextHash || ''),
        titleLength: String(sentBody.title || '').length, expectedVersion: sentBody.expectedVersion, existingDraft: Boolean(sentBody.draftId),
        assigneeNodeCount: Object.keys(sentBody.nodeAssignees || {}).length,
        rowsMatch: Array.isArray(sentBody.formData?.items) && matches(sentBody.formData.items),
        errors: Array.isArray(savedBody.errors) ? savedBody.errors.map(error => ({ field: /^items(?:\[\d+\]\.(?:text|gross|net|average|counted))?$/.test(error.field) ? error.field : 'REDACTED' })) : [] });
      assert.ok(saved.status() === 200 && savedBody.code === 200, 'Exact decimal draft rejected: ' + code);
      const readDraft = () => {
        const raw = database(`SELECT form_data FROM wf_form_draft WHERE tenant_id=100000 AND user_id=${sessions.employee.account.userId} AND definition_id=${sqlText(definitionId)}`);
        return raw ? JSON.parse(raw) : undefined;
      };
      const draft = await waitFor(readDraft, value => value && matches(value.items), 'Exact decimal draft did not persist');
      await waitFor(() => dialog.getByRole('status').allTextContents(), values => values.some(value => /^已保存 /.test(value)), 'Exact decimal draft did not settle');
      check(device + '_c2_precision_draft_keeps_all_digits_and_row_ids', matches(draft.items) && new Set(draft.items.map(row => row._rowId)).size === 3);
      stage = device + '-restore'; dialog = await open();
      await tap(dialog.getByRole('button', { name: '恢复草稿', exact: true }));
      await waitFor(() => control(dialog, 0, 'text').inputValue(), value => value === values[0].text, 'Exact decimal draft not restored');
      const observe = async (scope, phase) => {
        for (let index = 0; index < 3; index++) for (const [field, value] of Object.entries(values[index])) {
          await waitFor(() => control(scope, index, field).inputValue(), shown => normalized(shown) === value, 'Exact decimal field did not load: ' + phase + '/' + index + '/' + field);
          check(device + '_c2_precision_' + phase + '_' + index + '_' + field, normalized(await control(scope, index, field).inputValue()) === value);
        }
        await summaries(scope, phase);
      };
      await observe(dialog, 'restore'); await page.screenshot({ path: path.join(output, device + '-restore.png') });
      stage = device + '-start'; await paceStart();
      const starting = page.waitForResponse(response => response.request().method() === 'POST' && new URL(response.url()).pathname === '/api/workflow/wf/start').catch(() => null);
      await tap(dialog.getByRole('button', { name: '提交申请', exact: true }));
      const started = await starting; assert.ok(started, 'Exact decimal start response required');
      const startedBody = await started.json(); const instanceId = startedBody.data?.instanceId || startedBody.data?.processInstanceId;
      check(device + '_c2_precision_start', started.status() === 200 && startedBody.code === 200 && Boolean(instanceId));
      fixture.instances.push(instanceId); saveFixture();
      const taskId = await waitFor(() => database(`SELECT task_id FROM wf_task WHERE tenant_id=100000 AND instance_id=${sqlText(instanceId)} AND status='TODO'`), Boolean, 'Exact decimal approval missing');
      stage = device + '-approval'; activePage = reviewer;
      await reviewer.goto(new URL('/workflow/task/' + taskId, reviewer.url()).href, { waitUntil: 'domcontentloaded' });
      const task = reviewer.getByRole('dialog', { name: '任务处理', exact: true }); await task.waitFor(); await control(task, 0, 'text').waitFor();
      await observe(task, 'approval'); await reviewer.screenshot({ path: path.join(output, device + '-approval.png') });
      const completing = reviewer.waitForResponse(response => response.request().method() === 'POST' && new URL(response.url()).pathname === '/api/workflow/wf/complete').catch(() => null);
      await tap(task.getByRole('button', { name: '同意', exact: true })); await tap(task.getByRole('button', { name: '确认', exact: true }));
      const completed = await completing; assert.ok(completed, 'Exact decimal approval response required');
      check(device + '_c2_precision_approve', completed.status() === 200 && (await completed.json()).code === 200);
      await waitFor(() => database(`SELECT status FROM wf_process_instance WHERE tenant_id=100000 AND instance_id=${sqlText(instanceId)}`), value => value === 'PASSED', 'Exact decimal approval not final');
      const final = JSON.parse(database(`SELECT variables FROM wf_process_instance WHERE tenant_id=100000 AND instance_id=${sqlText(instanceId)}`));
      check(device + '_c2_precision_approval_preserves_exact_values_and_ids', isDeepStrictEqual(final.items, draft.items) && matches(final.items));
      check(device + '_c2_precision_definition_unchanged', isDeepStrictEqual(JSON.parse(database(`SELECT fields_json FROM wf_form_definition WHERE tenant_id=100000 AND form_id=${sqlText(formId)} AND version=1`)), fields));
      cases.push({ device, passed: true, rows: 3, summaries: 4, largestIntegerDigits: 90 });
    }
    check('c2_precision_no_browser_errors', pageErrors.length === 0);
  } catch (error) {
    failure = error;
    if (activePage && !activePage.isClosed()) await activePage.screenshot({ path: path.join(output, 'failure.png') }).catch(() => undefined);
  } finally {
    removers.forEach(remove => remove()); for (const context of contexts) await context.close();
    await fs.writeFile(path.join(output, 'result.json'), JSON.stringify({ passed: !failure, stage, cases, pageErrors, draftResponses, realPages: true, fabricatedResponses: 0, forcedModelWrites: 0, failure: failure ? { name: failure.name, message: String(failure.message).split('\n')[0] } : undefined }, null, 2));
    console.log(`C2_PRECISION_PAGES: completed_devices=${cases.length}; browser_errors=${pageErrors.length}; passed=${!failure}`);
  }
  if (failure) throw failure;
}
