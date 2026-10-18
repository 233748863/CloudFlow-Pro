import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createB2MobileBrowser, tapB2Mobile } from './b2-mobile-browser.mjs';

// Real product pages and real services. One submitted value is changed per failure case;
// no response is fabricated. This independently exercises server validation after client validation.
export async function verifyC1ErrorPages({ sessions, api, success, check, database, sqlText, fixture, saveFixture, marker, evidence, secrets, requests }) {
  const output = path.join(evidence, `c1-form-error-pages-${fixture.runId}`);
  await fs.mkdir(output);
  const results = [], pageErrors = [], contexts = [];
  let activePage, failure, mutations = 0;
  const read = statement => database(statement).split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
  const waitFor = async (readValue, accept, message) => {
    const deadline = Date.now() + 30000;
    do { const value = await readValue(); if (accept(value)) return value; await new Promise(resolve => setTimeout(resolve, 100)); } while (Date.now() < deadline);
    throw new Error(message);
  };
  const post = async (url, body, label) => success(await api('admin', '/workflow/wf' + url, { method: 'POST', body }), label);
  const settle = page => page.evaluate(async () => {
    let previous = '', stable = 0;
    for (let index = 0; index < 180; index++) {
      await new Promise(resolve => requestAnimationFrame(resolve));
      const current = JSON.stringify([scrollY, ...[...document.querySelectorAll('*')].filter(element => element.scrollHeight > element.clientHeight).map(element => element.scrollTop)]);
      stable = current === previous ? stable + 1 : 0; previous = current; if (stable >= 12) return;
    }
  });
  const errorLocated = async (page, kind, device, entered) => {
    await page.locator('#error-budget').waitFor(); await settle(page);
    const observation = await page.locator('#input-budget').evaluate(element => {
      const rect = element.getBoundingClientRect();
      let visible = rect.height > 0 && rect.bottom > 0 && rect.top < innerHeight;
      for (let parent = element.parentElement; parent; parent = parent.parentElement) {
        if (!/(auto|scroll|hidden)/.test(getComputedStyle(parent).overflowY)) continue;
        const bounds = parent.getBoundingClientRect(); visible &&= rect.bottom > bounds.top && rect.top < bounds.bottom;
      }
      return { visible, focused: document.activeElement === element, value: element.value, describedBy: element.getAttribute('aria-describedby') };
    });
    check(`${device}_${kind}_server_error_located_and_input_retained`, observation.visible && observation.focused && Number(observation.value.replaceAll(',', '')) === Number(entered) && observation.describedBy === 'error-budget');
    await page.screenshot({ path: path.join(output, `${device}-${kind}-error.png`) });
    const result = { device, kind, ...observation }; results.push(result); return result;
  };
  const response = (page, endpoint) => page.waitForResponse(item => item.request().method() === 'POST' && new URL(item.url()).pathname === '/api/workflow/wf/' + endpoint);
  const inject = async (page, endpoint, perform) => {
    let changed = false;
    const pattern = '**/api/workflow/wf/' + endpoint;
    const handler = async route => {
      if (changed || route.request().method() !== 'POST') return route.continue();
      const body = route.request().postDataJSON();
      const values = endpoint === 'draft' ? body.formData : body.variables;
      assert.ok(values && typeof values === 'object');
      values.budget = 'INVALID_SERVER_ONLY_' + marker;
      changed = true; mutations++;
      return route.continue({ postData: JSON.stringify(body) });
    };
    await page.route(pattern, handler);
    try {
      const pending = response(page, endpoint); await perform(); const returned = await pending;
      const body = await returned.json();
      check(`${endpoint}_real_server_rejects_injected_value`, changed && returned.status() === 400 && body.code === 'FORM_INVALID_DATA' && body.errors?.some(error => error.field === 'budget'));
    } finally { await page.unroute(pattern, handler); }
  };
  try {
    // Capture the original authenticated sessions before desktop navigation clears memory-only tokens.
    // The copied cookies are then restored by the real mobile application without another login.
    const mobilePages = {};
    for (const actor of ['employee', 'legacy', 'peer']) {
      const mobile = await createB2MobileBrowser({ admin: sessions[actor].page, secrets, check, landingPath: '/tasks', landingHeading: '我的任务' });
      contexts.push(mobile); mobilePages[actor] = mobile.page;
    }
    for (const device of ['desktop', 'mobile']) {
      const pages = {};
      for (const actor of ['employee', 'legacy', 'peer']) {
        if (device === 'mobile') pages[actor] = mobilePages[actor];
        else { pages[actor] = sessions[actor].page; await pages[actor].setViewportSize({ width: 1440, height: 1040 }); }
      }
      const handlers = [];
      for (const [actor, page] of Object.entries(pages)) {
        const onError = error => pageErrors.push({ device, actor, name: error.name });
        const onResponse = item => {
          const endpoint = new URL(item.url()).pathname;
          if (item.request().method() === 'POST' && /^\/api\/workflow\/wf\/(draft|start|complete)$/.test(endpoint)) requests.push({ actor, path: endpoint.slice(4), method: 'POST', status: item.status(), traceId: item.headers()['x-trace-id'], realPage: true, device });
        };
        page.on('pageerror', onError); page.on('response', onResponse); handlers.push(() => { page.off('pageerror', onError); page.off('response', onResponse); });
      }
      const tap = (page, locator) => device === 'mobile' ? tapB2Mobile(locator) : locator.click();
      try {
        for (const kind of ['draft', 'direct']) {
          const name = `${marker}-${device}-${kind}`, starter = kind === 'draft' ? 'employee' : 'legacy';
          const fields = [{ id: 'note', type: 'TEXT', label: '申请说明', required: true },
            ...Array.from({ length: 20 }, (_, index) => ({ id: `filler_${index}`, type: 'TEXTAREA', label: `补充说明${index + 1}`, rows: 3 })),
            { id: 'budget', type: 'AMOUNT', label: '申请金额', required: true, min: 0, precision: 2 }];
          const form = await post('/form/save', { formKey: name, formName: name, fieldsJson: JSON.stringify(fields) }, 'page_error_form_created');
          const formId = form.formId || form.id; fixture.forms.push(formId); saveFixture();
          const model = { nodes: [{ id: 'start', type: 'START', title: '发起' }, { id: 'approval', type: 'APPROVAL', title: '审批', approverType: 'USER', approverValue: sessions.peer.account.userId, allowEdit: true }, { id: 'end', type: 'END', title: '结束' }], edges: [{ source: 'start', target: 'approval' }, { source: 'approval', target: 'end' }] };
          const definition = await post('/definition/save', { processKey: name, processName: name, formId, modelJson: JSON.stringify(model), startPermissionType: 'ALL', startPermissionValue: '[]' }, 'page_error_process_created');
          const definitionId = definition.definitionId || definition.id; fixture.definitions.push(definitionId); saveFixture();
          await post('/definition/deploy/' + definitionId, undefined, 'page_error_process_deployed');
          const page = pages[starter]; activePage = page;
          await page.goto(new URL('/workplace', page.url()).href, { waitUntil: 'domcontentloaded' });
          await page.getByPlaceholder('流程模型名称、Key、描述信息', { exact: true }).fill(name);
          await tap(page, page.getByRole('button').filter({ hasText: name }));
          const dialog = page.getByRole('dialog', { name: (kind === 'draft' ? '发起流程 · ' : '填写：') + name, exact: true });
          await dialog.waitFor(); await dialog.locator('#input-note').fill(marker);
          const budget = dialog.locator('#input-budget'); await budget.fill('1');
          if (kind === 'draft') {
            await tap(page, dialog.getByRole('button', { name: '保存草稿', exact: true }));
            await waitFor(() => dialog.getByRole('status').allTextContents(), contents => contents.some(text => /^已保存 /.test(text)), 'Initial draft was not saved');
          }
          await inject(page, kind === 'draft' ? 'draft' : 'start', async () => {
            await budget.fill('2');
            await tap(page, dialog.getByRole('button', { name: kind === 'draft' ? '保存草稿' : '提交申请', exact: true }));
          });
          const launchResult = await errorLocated(page, kind, device, '2');
          check(`${device}_${kind}_note_retained`, await dialog.locator('#input-note').inputValue() === marker);
          check(`${device}_${kind}_failed_start_has_no_instance`, database(`SELECT COUNT(*) FROM wf_process_instance WHERE tenant_id=100000 AND definition_id=${sqlText(definitionId)}`) === '0');
          if (kind === 'draft') check(`${device}_draft_failed_save_preserves_previous_value`, database(`SELECT JSON_UNQUOTE(JSON_EXTRACT(form_data,'$.budget')) FROM wf_form_draft WHERE tenant_id=100000 AND definition_id=${sqlText(definitionId)} AND user_id=${sessions.employee.account.userId}`) === '1');
          await budget.fill('3');
          check(`${device}_${kind}_editing_clears_server_error`, await page.locator('#error-budget').count() === 0);
          const started = response(page, 'start'); await tap(page, dialog.getByRole('button', { name: '提交申请', exact: true }));
          const startResponse = await started, startBody = await startResponse.json();
          const instanceId = startBody.data?.instanceId || startBody.data?.processInstanceId;
          check(`${device}_${kind}_corrected_page_starts`, startResponse.status() === 200 && startBody.code === 200 && Boolean(instanceId));
          fixture.instances.push(instanceId); saveFixture(); launchResult.corrected = true;
          await dialog.waitFor({ state: 'hidden' });
          const task = await waitFor(() => read(`SELECT JSON_OBJECT('id',task_id,'assignee',CAST(assignee AS CHAR)) FROM wf_task WHERE tenant_id=100000 AND instance_id=${sqlText(instanceId)} AND status='TODO'`)[0], Boolean, 'Approval task missing');
          check(`${device}_${kind}_real_reviewer_assigned`, task.assignee === sessions.peer.account.userId);
          const reviewer = pages.peer; activePage = reviewer;
          await reviewer.goto(new URL('/workflow/task/' + task.id, reviewer.url()).href, { waitUntil: 'domcontentloaded' });
          const taskDialog = reviewer.getByRole('dialog', { name: '任务处理', exact: true }); await taskDialog.waitFor();
          const taskBudget = taskDialog.locator('#input-budget'); await taskBudget.waitFor();
          const approve = async () => { await tap(reviewer, taskDialog.getByRole('button', { name: '同意', exact: true })); await tap(reviewer, taskDialog.getByRole('button', { name: '确认', exact: true })); };
          await taskBudget.fill('4'); await inject(reviewer, 'complete', approve);
          const taskResult = await errorLocated(reviewer, `${kind}-approval`, device, '4');
          check(`${device}_${kind}_failed_approval_preserves_task_and_values`, database(`SELECT status FROM wf_task WHERE tenant_id=100000 AND task_id=${sqlText(task.id)}`) === 'TODO'
            && database(`SELECT JSON_UNQUOTE(JSON_EXTRACT(variables,'$.budget')) FROM wf_process_instance WHERE tenant_id=100000 AND instance_id=${sqlText(instanceId)}`) === '3');
          await taskBudget.fill('5'); check(`${device}_${kind}_approval_edit_clears_server_error`, await reviewer.locator('#error-budget').count() === 0);
          const completed = response(reviewer, 'complete'); await approve(); const completeResponse = await completed;
          check(`${device}_${kind}_corrected_page_approves`, completeResponse.status() === 200 && (await completeResponse.json()).code === 200);
          await waitFor(() => database(`SELECT status FROM wf_process_instance WHERE tenant_id=100000 AND instance_id=${sqlText(instanceId)}`), status => status === 'PASSED', 'Corrected approval did not finish');
          check(`${device}_${kind}_exactly_one_approval_and_correct_value`, database(`SELECT COUNT(*) FROM wf_task_history WHERE tenant_id=100000 AND task_id=${sqlText(task.id)} AND action='APPROVE'`) === '1'
            && database(`SELECT JSON_UNQUOTE(JSON_EXTRACT(variables,'$.budget')) FROM wf_process_instance WHERE tenant_id=100000 AND instance_id=${sqlText(instanceId)}`) === '5');
          taskResult.corrected = true;
        }
      } finally { handlers.forEach(remove => remove()); }
    }
    check('real_error_pages_have_no_browser_exceptions', pageErrors.length === 0);
    check('all_real_error_pages_and_corrections_completed', results.length === 8 && mutations === 8 && results.every(result => result.corrected));
  } catch (error) {
    failure = error;
    if (activePage && !activePage.isClosed()) await activePage.screenshot({ path: path.join(output, 'failure.png') }).catch(() => undefined);
  } finally {
    for (const context of contexts) await context.close();
    await fs.writeFile(path.join(output, 'result.json'), JSON.stringify({ results, mutations, pageErrors, passed: !failure, realPages: true, fabricatedResponses: 0 }, null, 2));
    console.log(`C1_REAL_ERROR_PAGES: cases=${results.length}; corrected=${results.filter(result => result.corrected).length}; injected_request_values=${mutations}; fabricated_responses=0; browser_errors=${pageErrors.length}; passed=${!failure}`);
  }
  if (failure) throw failure;
}
