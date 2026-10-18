import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createB2MobileBrowser, tapB2Mobile } from './b2-mobile-browser.mjs';

// Maintain owned low-risk dictionaries through the real administrator API and observe real form controls.
export async function verifyC1DictionaryPages({ sessions, api, success, check, database, sqlText, fixture, saveFixture, marker, evidence, secrets, requests }) {
  const output = path.join(evidence, `c1-dictionary-pages-${fixture.runId}`);
  await fs.mkdir(output);
  const contexts = [], prepared = [], cases = [], pageErrors = [], observations = [];
  let activePage, failure;
  const waitFor = async (read, accept, message) => {
    const deadline = Date.now() + 20000;
    do { const value = await read(); if (accept(value)) return value; await new Promise(resolve => setTimeout(resolve, 100)); } while (Date.now() < deadline);
    throw new Error(message);
  };
  const admin = async (endpoint, method, body, label) => success(await api('admin', endpoint, { method, body }), label);
  const applied = result => { assert.equal(result?.applied, true); assert.equal(result?.approvalRequired, false); };
  const writeOption = async (dictType, value, label, code, status = '0') => {
    applied(await admin('/auth/system/dict/data', code ? 'PUT' : 'POST', {
      dictType, dictValue: value, dictLabel: label, ...(code ? { dictCode: code } : {}),
      status, riskLevel: 'LOW', dictSort: value === 'keep' ? 1 : 2, isDefault: 'N',
    }, 'owned_dictionary_change_applied'));
    return database(`SELECT dict_code FROM sys_dict_data WHERE tenant_id=100000 AND dict_type=${sqlText(dictType)} AND dict_value=${sqlText(value)}`);
  };
  try {
    fixture.dictionaries = [];
    for (const device of ['desktop', 'mobile']) {
      const name = `${marker}-${device}-dict`, dictType = `c1_${fixture.runId.slice(0, 12)}_${device}`;
      await admin('/auth/system/dict/type', 'POST', { dictName: name, dictType, status: '0' }, 'owned_dictionary_type_created');
      fixture.dictionaries.push(dictType); saveFixture();
      const keep = await writeOption(dictType, 'keep', '原始选项'), remove = await writeOption(dictType, 'remove', '待停用选项');
      const fields = [{ id: 'note', type: 'TEXT', label: '说明', required: true },
        { id: 'single', type: 'DICT_SELECT', label: '单选字典', dictType },
        { id: 'multi', type: 'DICT_SELECT', label: '多选字典', dictType, multiple: true }];
      const form = await admin('/workflow/wf/form/save', 'POST', { formKey: name, formName: name, fieldsJson: JSON.stringify(fields) }, 'dictionary_form_created');
      const formId = form.formId || form.id; fixture.forms.push(formId); saveFixture();
      const model = { nodes: [{ id: 'start', type: 'START', title: '发起' }, { id: 'approval', type: 'APPROVAL', title: '审批', approverType: 'USER', approverValue: sessions.peer.account.userId, allowEdit: true }, { id: 'end', type: 'END', title: '结束' }], edges: [{ source: 'start', target: 'approval' }, { source: 'approval', target: 'end' }] };
      const definition = await admin('/workflow/wf/definition/save', 'POST', { processKey: name, processName: name, formId, modelJson: JSON.stringify(model), startPermissionType: 'ALL', startPermissionValue: '[]' }, 'dictionary_process_created');
      const definitionId = definition.definitionId || definition.id; fixture.definitions.push(definitionId); saveFixture();
      await admin('/workflow/wf/definition/deploy/' + definitionId, 'POST', undefined, 'dictionary_process_deployed');
      const formSnapshot = database(`SELECT fields_json,version FROM wf_form_definition WHERE tenant_id=100000 AND form_id=${sqlText(formId)}`);
      prepared.push({ device, name, dictType, keep, remove, formId, definitionId, formSnapshot });
    }
    const mobilePages = {};
    for (const actor of ['employee', 'peer']) {
      const mobile = await createB2MobileBrowser({ admin: sessions[actor].page, secrets, check, landingPath: '/tasks', landingHeading: '我的任务' });
      contexts.push(mobile); mobilePages[actor] = mobile.page;
    }
    for (const setup of prepared) {
      const { device, name, dictType, keep, remove, formId, definitionId, formSnapshot } = setup;
      const page = device === 'mobile' ? mobilePages.employee : sessions.employee.page;
      const reviewer = device === 'mobile' ? mobilePages.peer : sessions.peer.page;
      if (device === 'desktop') for (const current of [page, reviewer]) await current.setViewportSize({ width: 1440, height: 1040 });
      const tap = locator => device === 'mobile' ? tapB2Mobile(locator) : locator.click();
      const removers = [];
      for (const [actor, current] of [['employee', page], ['peer', reviewer]]) {
        const onError = error => pageErrors.push({ device, actor, name: error.name });
        const onResponse = item => {
          const endpoint = new URL(item.url()).pathname;
          if (item.request().method() === 'POST' && /^\/api\/workflow\/wf\/(draft|start|complete)$/.test(endpoint)) requests.push({ actor, path: endpoint.slice(4), method: 'POST', status: item.status(), traceId: item.headers()['x-trace-id'], observedAt: Date.now(), realPage: true, device });
        };
        current.on('pageerror', onError); current.on('response', onResponse);
        removers.push(() => { current.off('pageerror', onError); current.off('response', onResponse); });
      }
      try {
        activePage = page;
        const note = name + '-private-note'; secrets.add(note);
        const open = async () => {
          await page.goto(new URL('/workplace', page.url()).href, { waitUntil: 'domcontentloaded' });
          await page.getByPlaceholder('流程模型名称、Key、描述信息', { exact: true }).fill(name);
          await tap(page.getByRole('button').filter({ hasText: name }));
          const dialog = page.getByRole('dialog', { name: '发起流程 · ' + name, exact: true }); await dialog.waitFor(); return dialog;
        };
        const control = (scope, field) => scope.locator(`[id="input-${field}"]`);
        const choose = async (current, scope, field, labels, expected, absent = []) => {
          await waitFor(() => control(scope, field).getAttribute('aria-disabled'), value => value !== 'true', 'Dictionary control remained unavailable');
          await tap(control(scope, field));
          const list = current.getByRole('listbox');
          await list.waitFor();
          const updated = await waitFor(() => list.getByRole('option').allTextContents(), texts => expected.every(label => texts.some(text => text.trim() === label)) && absent.every(label => texts.every(text => text.trim() !== label)), `${device}_${field}_dictionary_options_did_not_refresh`);
          observations.push({ device, field, expected, absent, observed: updated.map(text => text.trim()) });
          for (const label of labels) await tap(list.getByRole('option').filter({ has: current.getByText(label, { exact: true }) }));
          if (field === 'multi') {
            if (device === 'mobile') await tap(current.getByRole('button', { name: '完成选择', exact: true }));
            else await list.press('Escape');
          }
        };
        let dialog = await open(); await control(dialog, 'note').fill(note);
        await choose(page, dialog, 'single', ['原始选项'], ['原始选项', '待停用选项']);
        await choose(page, dialog, 'multi', ['原始选项'], ['原始选项', '待停用选项']);
        await writeOption(dictType, 'keep', '更新后的选项', keep);
        await writeOption(dictType, 'remove', '待停用选项', remove, '1');
        const added = await writeOption(dictType, 'new', '新增选项');
        await choose(page, dialog, 'single', ['新增选项'], ['更新后的选项', '新增选项'], ['原始选项', '待停用选项']);
        await choose(page, dialog, 'multi', ['新增选项'], ['更新后的选项', '新增选项'], ['原始选项', '待停用选项']);
        check(`${device}_mounted_form_dictionary_refresh_preserves_note`, await control(dialog, 'note').inputValue() === note);
        await tap(dialog.getByRole('button', { name: '保存草稿', exact: true }));
        const readDraft = () => { const value = database(`SELECT form_data FROM wf_form_draft WHERE tenant_id=100000 AND user_id=${sessions.employee.account.userId} AND definition_id=${sqlText(definitionId)}`); return value ? JSON.parse(value) : null; };
        await waitFor(readDraft, value => value?.note === note && value.single === 'new' && JSON.stringify(value.multi) === '["keep","new"]', 'Updated dictionary values were not saved');
        await waitFor(() => dialog.getByRole('status').allTextContents(), texts => texts.some(text => /^已保存 /.test(text)), 'Dictionary draft did not settle');
        dialog = await open(); await tap(dialog.getByRole('button', { name: '恢复草稿', exact: true }));
        await waitFor(() => control(dialog, 'single').innerText(), text => text.includes('新增选项'), 'Dictionary draft label not restored');
        check(`${device}_dictionary_draft_restores_values_and_note`, await control(dialog, 'note').inputValue() === note && (await control(dialog, 'multi').innerText()).includes('更新后的选项'));
        const pending = page.waitForResponse(item => item.request().method() === 'POST' && new URL(item.url()).pathname === '/api/workflow/wf/start');
        await tap(dialog.getByRole('button', { name: '提交申请', exact: true }));
        const started = await pending, body = await started.json(), instanceId = body.data?.instanceId || body.data?.processInstanceId;
        check(`${device}_updated_dictionary_values_start`, started.status() === 200 && body.code === 200 && Boolean(instanceId));
        fixture.instances.push(instanceId); saveFixture();
        const taskId = await waitFor(() => database(`SELECT task_id FROM wf_task WHERE tenant_id=100000 AND instance_id=${sqlText(instanceId)} AND status='TODO'`), Boolean, 'Dictionary reviewer task missing');
        activePage = reviewer;
        await reviewer.goto(new URL('/workflow/task/' + taskId, reviewer.url()).href, { waitUntil: 'domcontentloaded' });
        const taskDialog = reviewer.getByRole('dialog', { name: '任务处理', exact: true }); await taskDialog.waitFor();
        await waitFor(() => control(taskDialog, 'single').innerText(), text => text.includes('新增选项'), 'Reviewer dictionary value missing');
        await writeOption(dictType, 'new', '审批时的新名称', added);
        await choose(reviewer, taskDialog, 'single', ['更新后的选项'], ['更新后的选项', '审批时的新名称'], ['新增选项', '待停用选项']);
        await choose(reviewer, taskDialog, 'multi', ['更新后的选项'], ['更新后的选项', '审批时的新名称'], ['新增选项', '待停用选项']);
        const approval = reviewer.waitForResponse(item => item.request().method() === 'POST' && new URL(item.url()).pathname === '/api/workflow/wf/complete');
        await tap(taskDialog.getByRole('button', { name: '同意', exact: true })); await tap(taskDialog.getByRole('button', { name: '确认', exact: true }));
        const returned = await approval;
        check(`${device}_dictionary_page_approval_succeeds`, returned.status() === 200 && (await returned.json()).code === 200);
        await waitFor(() => database(`SELECT status FROM wf_process_instance WHERE tenant_id=100000 AND instance_id=${sqlText(instanceId)}`), value => value === 'PASSED', 'Dictionary process did not finish');
        const final = JSON.parse(database(`SELECT variables FROM wf_process_instance WHERE tenant_id=100000 AND instance_id=${sqlText(instanceId)}`));
        check(`${device}_dictionary_changes_keep_values_and_definition`, final.note === note && final.single === 'keep' && JSON.stringify(final.multi) === '["new"]' && database(`SELECT fields_json,version FROM wf_form_definition WHERE tenant_id=100000 AND form_id=${sqlText(formId)}`) === formSnapshot);
        await reviewer.screenshot({ path: path.join(output, `${device}-completed.png`) });
        cases.push({ device, mountedDraftUpdated: true, restored: true, mountedTaskUpdated: true, approved: true, definitionUnchanged: true });
      } finally { removers.forEach(remove => remove()); }
    }
    check('dictionary_pages_have_no_browser_exceptions', pageErrors.length === 0);
    check('both_devices_complete_dictionary_maintenance_chain', cases.length === 2);
  } catch (error) {
    failure = error;
    if (activePage && !activePage.isClosed()) await activePage.screenshot({ path: path.join(output, 'failure.png') }).catch(() => undefined);
  } finally {
    for (const context of contexts) await context.close();
    await fs.writeFile(path.join(output, 'result.json'), JSON.stringify({ passed: !failure, cases, observations, pageErrors, realPages: true, realAdminMaintenance: true, fabricatedResponses: 0, injectedValues: 0 }, null, 2));
    console.log(`C1_DICTIONARY_PAGES: devices=${cases.length}; browser_errors=${pageErrors.length}; passed=${!failure}`);
  }
  if (failure) throw failure;
}
