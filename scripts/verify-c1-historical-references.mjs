import assert from 'node:assert/strict';
import { isDeepStrictEqual } from 'node:util';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createB2MobileBrowser, tapB2Mobile } from './b2-mobile-browser.mjs';

// Own only the marked reference fixtures. Workflow values and outcomes are written through real APIs.
export async function verifyC1HistoricalReferences({ sessions, api, success, check, database, sqlText, fixture, saveFixture, marker, evidence, secrets, requests }) {
  const output = path.join(evidence, 'c1-historical-references-' + fixture.runId); await fs.mkdir(output);
  const contexts = [], prepared = [], records = [], cases = [], removers = [], pageErrors = [];
  const base = '/workflow/wf', types = ['EMPLOYEE', 'DEPT', 'POST', 'POSITION'];
  let failure, activePage, stage = 'setup', retired = false;
  const waitFor = async (read, accept, message) => {
    const deadline = Date.now() + 30000;
    do { const value = await read(); if (accept(value)) return value; await new Promise(resolve => setTimeout(resolve, 120)); } while (Date.now() < deadline);
    throw new Error(message);
  };
  const post = async (actor, endpoint, body, label) => success(await api(actor, base + endpoint, { method: 'POST', body }), label);
  const row = statement => { const value = database(statement); return value ? JSON.parse(value) : null; };
  const instance = id => row(`SELECT JSON_OBJECT('status',status,'variables',variables) FROM wf_process_instance WHERE tenant_id=100000 AND instance_id=${sqlText(id)}`);
  const draft = id => row(`SELECT JSON_OBJECT('id',draft_id,'version',lock_version,'values',form_data) FROM wf_form_draft WHERE tenant_id=100000 AND user_id=${sessions.employee.account.userId} AND definition_id=${sqlText(id)}`);
  const decode = value => typeof value === 'string' ? JSON.parse(value) : value;
  const originalGrants = database('SELECT tenant_id,role_id,menu_id FROM sys_role_menu ORDER BY tenant_id,role_id,menu_id');
  const addRecord = (type, group) => {
    const name = marker + '-' + group + '-' + type.toLowerCase(), code = 'C1HR' + fixture.runId.slice(0, 12) + group + type;
    const spec = type === 'EMPLOYEE' ? { table: 'hr_employee', key: 'id', identity: 'employee_no', identityValue: code, status: 'employee_status', active: 'PROBATION', inactive: 'SUSPENDED',
      insert: `INSERT INTO hr_employee(tenant_id,employee_no,name,gender,employee_status,create_by) VALUES(100000,${sqlText(code)},${sqlText(name)},'UNKNOWN','PROBATION',${sqlText(marker)})` }
      : type === 'DEPT' ? { table: 'sys_dept', key: 'dept_id', identity: 'dept_name', identityValue: name, status: 'status', active: '0', inactive: '1',
        insert: `INSERT INTO sys_dept(tenant_id,dept_name,parent_id,ancestors,status,create_by) VALUES(100000,${sqlText(name)},0,'0','0',${sqlText(marker)})` }
        : type === 'POST' ? { table: 'sys_post', key: 'post_id', identity: 'post_code', identityValue: code, status: 'status', active: '0', inactive: '1',
          insert: `INSERT INTO sys_post(tenant_id,post_code,post_name,post_sort,status,create_by) VALUES(100000,${sqlText(code)},${sqlText(name)},0,'0',${sqlText(marker)})` }
          : { table: 'hr_position', key: 'id', identity: 'position_code', identityValue: code, status: 'status', active: '1', inactive: '0',
            insert: `INSERT INTO hr_position(tenant_id,position_code,position_name,status) VALUES(100000,${sqlText(code)},${sqlText(name)},1)` };
    const id = database(spec.insert + '; SELECT LAST_INSERT_ID();'); assert.match(id, /^[1-9][0-9]*$/);
    delete spec.insert;
    const record = { ...spec, id, name, type, group }; records.push(record); fixture.historicalReferences = records; saveFixture(); return record;
  };
  const retire = record => {
    database(`UPDATE ${record.table} SET ${record.status}=${sqlText(record.inactive)} WHERE tenant_id=100000 AND ${record.key}=${record.id} AND ${record.identity}=${sqlText(record.identityValue)} AND ${record.status} IN (${sqlText(record.active)},${sqlText(record.inactive)})`);
    assert.equal(database(`SELECT CAST(${record.status} AS CHAR) FROM ${record.table} WHERE tenant_id=100000 AND ${record.key}=${record.id} AND ${record.identity}=${sqlText(record.identityValue)}`), record.inactive);
  };
  try {
    const historical = Object.fromEntries(types.map(type => [type, addRecord(type, 'old')]));
    const available = Object.fromEntries(types.map(type => [type, addRecord(type, 'new')]));
    const fields = [{ id: 'note', type: 'TEXT', label: '说明' }, ...types.flatMap(type => {
      const key = type.toLowerCase();
      return [{ id: key, type, label: type + '历史名称', onlyActive: true, displayFieldId: key + '_name', placeholder: '选择' + key },
        { id: key + '_raw', type, label: type + '原编号', onlyActive: true, placeholder: '选择' + key + '_raw' },
        { id: key + '_name', type: 'TEXT', label: type + '已保存名称', readonly: true }];
    })];
    const valuesFor = (references, note) => ({ note, ...Object.fromEntries(types.flatMap(type => {
      const key = type.toLowerCase(), record = references[type]; return [[key, record.id], [key + '_raw', record.id], [key + '_name', record.name]];
    })) });
    for (const device of ['desktop', 'mobile']) {
      const name = marker + '-history-' + device, note = name + '-private'; secrets.add(note);
      const form = await post('admin', '/form/save', { formKey: name, formName: name, fieldsJson: JSON.stringify(fields) }, 'historical_reference_form_saved');
      const formId = form.formId || form.id; fixture.forms.push(formId); saveFixture();
      const nodes = [{ id: 'start', type: 'START', title: '发起' },
        { id: 'read', type: 'APPROVAL', title: '历史只读复核', approverType: 'USER', approverValue: sessions.peer.account.userId, approveSelf: 'ALLOW' },
        { id: 'edit', type: 'APPROVAL', title: '保留历史引用办理', approverType: 'USER', approverValue: sessions.peer.account.userId, approveSelf: 'ALLOW', allowEdit: true }, { id: 'end', type: 'END', title: '结束' }];
      const definition = await post('admin', '/definition/save', { processKey: name, processName: name, formId,
        modelJson: JSON.stringify({ nodes, edges: nodes.slice(1).map((node, index) => ({ source: nodes[index].id, target: node.id })) }), startPermissionType: 'ALL', startPermissionValue: '[]' }, 'historical_reference_definition_saved');
      const definitionId = definition.definitionId || definition.id; fixture.definitions.push(definitionId); saveFixture();
      success(await api('admin', `${base}/definition/${definitionId}/field-permissions`, { method: 'PUT', body: ['read', 'edit'].flatMap(nodeKey => fields.map(field => ({ nodeKey, fieldId: field.id, visibleFlag: true, editableFlag: nodeKey === 'edit' && !field.readonly, requiredFlag: false }))) }), 'historical_reference_permissions_saved');
      await post('admin', '/definition/deploy/' + definitionId, undefined, 'historical_reference_definition_deployed');
      const context = success(await api('employee', '/workflow/wf/draft/context/' + definitionId), 'historical_reference_start_context');
      const values = valuesFor(historical, note);
      const first = await post('employee', '/draft', { definitionId, expectedVersion: 0, loadedContextHash: context.contextHash, title: name, formData: values, nodeAssignees: {} }, 'historical_active_references_saved');
      const started = await post('employee', '/start', { draftId: first.draftId, expectedVersion: first.lockVersion }, 'historical_reference_real_instance_started');
      const instanceId = started.instanceId || started.processInstanceId; assert.ok(instanceId); fixture.instances.push(instanceId); saveFixture();
      const pendingDraft = await post('employee', '/draft', { definitionId, expectedVersion: 0, loadedContextHash: context.contextHash, title: name + '-draft', formData: values, nodeAssignees: {} }, 'historical_reference_second_draft_saved');
      check(device + '_historical_values_persist_before_retirement', isDeepStrictEqual(decode(draft(definitionId).values), values));
      prepared.push({ device, name, definitionId, formId, instanceId, draftId: pendingDraft.draftId, values,
        schema: database(`SELECT fields_json,version FROM wf_form_definition WHERE tenant_id=100000 AND form_id=${sqlText(formId)}`) });
    }
    Object.values(historical).forEach(retire);
    check('four_owned_reference_types_retired_after_real_save', true);
    const mobilePages = {};
    for (const actor of ['employee', 'peer']) {
      const mobile = await createB2MobileBrowser({ admin: sessions[actor].page, secrets, check, landingPath: '/tasks', landingHeading: '我的任务' });
      contexts.push(mobile); mobilePages[actor] = mobile.page;
    }
    for (const setup of prepared) {
      const { device, name, definitionId, instanceId, values } = setup;
      const page = device === 'mobile' ? mobilePages.employee : sessions.employee.page;
      const reviewer = device === 'mobile' ? mobilePages.peer : sessions.peer.page;
      if (device === 'desktop') for (const current of [page, reviewer]) await current.setViewportSize({ width: 1440, height: 1040 });
      for (const [actor, current] of [['employee', page], ['peer', reviewer]]) {
        const onError = error => pageErrors.push({ device, actor, name: error.name });
        const onResponse = response => { const endpoint = new URL(response.url()).pathname;
          if (response.request().method() === 'POST' && /^\/api\/workflow\/wf\/(draft|complete)$/.test(endpoint)) requests.push({ actor, path: endpoint.slice(4), method: 'POST', status: response.status(), traceId: response.headers()['x-trace-id'], observedAt: Date.now(), realPage: true, device }); };
        current.on('pageerror', onError); current.on('response', onResponse);
        removers.push(() => { current.off('pageerror', onError); current.off('response', onResponse); });
      }
      const tap = async locator => {
        if (device === 'desktop') return locator.click();
        await waitFor(async () => { await locator.scrollIntoViewIfNeeded(); const box = await locator.boundingBox(), viewport = locator.page().viewportSize();
          return box && viewport && box.x >= -1 && box.y >= -1 && box.x + box.width <= viewport.width + 1 && box.y + box.height <= viewport.height + 1;
        }, Boolean, 'Historical reference mobile action not fully visible');
        await tapB2Mobile(locator);
      };
      activePage = page; stage = device + '-restore';
      await page.goto(new URL('/workplace', page.url()).href, { waitUntil: 'domcontentloaded' });
      await page.getByPlaceholder('流程模型名称、Key、描述信息', { exact: true }).fill(name);
      await tap(page.getByRole('button').filter({ hasText: name }));
      const dialog = page.getByRole('dialog', { name: '发起流程 · ' + name, exact: true }); await dialog.waitFor();
      await tap(dialog.getByRole('button', { name: '恢复草稿', exact: true }));
      await waitFor(() => dialog.locator('#input-note').inputValue(), value => value === values.note, 'Historical draft did not restore');
      for (const type of types) for (const raw of [false, true]) {
        const field = type.toLowerCase() + (raw ? '_raw' : ''), control = dialog.locator('#input-' + field);
        await waitFor(() => control.getAttribute('aria-disabled'), value => value === 'false', 'Historical reference control unavailable');
        check(`${device}_${field}_restored_history_visible`, (await control.textContent()).includes(raw ? historical[type].id : historical[type].name));
        await tap(control);
        const popup = page.getByRole('dialog', { name: '选择' + field, exact: true }); await popup.waitFor();
        const oldOption = popup.getByRole('option').filter({ has: page.getByText(raw ? historical[type].id : historical[type].name, { exact: true }) });
        check(`${device}_${field}_historical_option_cannot_be_reselected`, await oldOption.count() === 1 && await oldOption.isDisabled());
        await tap(popup.getByRole('option').filter({ has: page.getByText(available[type].name, { exact: true }) }));
      }
      stage = device + '-save-replacement';
      await tap(dialog.getByRole('button', { name: '保存草稿', exact: true }));
      const updatedValues = valuesFor(available, values.note);
      await waitFor(() => decode(draft(definitionId)?.values), value => isDeepStrictEqual(value, updatedValues), 'Replacement references did not persist');
      check(device + '_draft_replacement_preserves_names_and_ids', true);
      await page.screenshot({ path: path.join(output, device + '-draft.png') });
      activePage = reviewer;
      for (const node of ['read', 'edit']) {
        stage = device + '-' + node;
        const taskId = await waitFor(() => database(`SELECT task_id FROM wf_task WHERE tenant_id=100000 AND instance_id=${sqlText(instanceId)} AND node_key=${sqlText(node)} AND status='TODO'`), Boolean, 'Historical reference task missing');
        await reviewer.goto(new URL('/workflow/task/' + taskId, reviewer.url()).href, { waitUntil: 'domcontentloaded' });
        const task = reviewer.getByRole('dialog', { name: '任务处理', exact: true }); await task.waitFor();
        for (const type of types) for (const raw of [false, true]) {
          const field = type.toLowerCase() + (raw ? '_raw' : ''), expected = raw ? historical[type].id : historical[type].name;
          if (node === 'read') {
            await waitFor(() => task.locator('#field-' + field + ' > div').innerText(), value => value === expected, 'Historical readonly label missing');
            check(`${device}_${field}_readonly_history_preserved`, await task.locator('#field-' + field).locator('input,textarea,button,[role="combobox"]').count() === 0);
          } else {
            const control = task.locator('#input-' + field);
            await waitFor(() => control.getAttribute('aria-disabled'), value => value === 'false', 'Historical task control unavailable');
            check(`${device}_${field}_editable_history_preserved`, (await control.textContent()).includes(expected));
          }
        }
        if (node === 'edit') await task.locator('#input-note').fill(values.note + '-reviewed');
        await reviewer.screenshot({ path: path.join(output, device + '-' + node + '.png') });
        const pending = reviewer.waitForResponse(response => response.request().method() === 'POST' && new URL(response.url()).pathname === '/api/workflow/wf/complete').catch(() => null);
        await tap(task.getByRole('button', { name: '同意', exact: true })); await tap(task.getByRole('button', { name: '确认', exact: true }));
        const completed = await pending; assert.ok(completed, 'Historical approval response missing');
        check(`${device}_${node}_historical_approval_from_page`, completed.status() === 200 && (await completed.json()).code === 200);
      }
      await waitFor(() => instance(instanceId)?.status, value => value === 'PASSED', 'Historical reference workflow did not finish');
      const finalValues = decode(instance(instanceId).variables);
      check(device + '_historical_ids_names_and_definition_unchanged', Object.entries({ ...values, note: values.note + '-reviewed' }).every(([key, value]) => finalValues[key] === value)
        && database(`SELECT fields_json,version FROM wf_form_definition WHERE tenant_id=100000 AND form_id=${sqlText(setup.formId)}`) === setup.schema);
      cases.push({ device, referenceTypes: 4, namedAndRawFields: 8, restored: true, replaced: true, readonlyApproved: true, editableApproved: true, historyPreserved: true });
    }
    check('historical_reference_pages_have_no_browser_errors', pageErrors.length === 0);
  } catch (error) {
    failure = error;
    await fs.writeFile(path.join(output, 'failure-stage.json'), JSON.stringify({ stage, name: error.name, message: String(error.message).split('\n')[0] }, null, 2));
    if (activePage && !activePage.isClosed()) await activePage.screenshot({ path: path.join(output, 'failure.png') }).catch(() => undefined);
  } finally {
    try {
      for (const setup of prepared) {
        if (instance(setup.instanceId)?.status === 'RUNNING') await post('admin', '/instance/terminate', { instanceId: setup.instanceId, reason: marker + '-cleanup' }, 'historical_reference_owned_instance_closed');
        const remaining = draft(setup.definitionId);
        if (remaining) success(await api('employee', `${base}/draft/${remaining.id}?expectedVersion=${remaining.version}`, { method: 'DELETE' }), 'historical_reference_owned_draft_retired');
        database(`UPDATE wf_process_definition SET status='ARCHIVED' WHERE tenant_id=100000 AND definition_id=${sqlText(setup.definitionId)} AND process_key=${sqlText(setup.name)}`);
      }
      records.forEach(retire); retired = true;
      check('historical_reference_fixtures_retired_and_grants_unchanged', database('SELECT tenant_id,role_id,menu_id FROM sys_role_menu ORDER BY tenant_id,role_id,menu_id') === originalGrants
        && prepared.every(setup => !draft(setup.definitionId) && database(`SELECT COUNT(*) FROM wf_task WHERE tenant_id=100000 AND instance_id=${sqlText(setup.instanceId)}`) === '0'));
    } catch (error) { failure = new AggregateError([failure, error].filter(Boolean), 'Historical reference cleanup incomplete'); }
    removers.forEach(remove => remove());
    for (const context of contexts) await context.close();
    await fs.writeFile(path.join(output, 'result.json'), JSON.stringify({ passed: !failure, cases, pageErrors, retired, fixtureRecords: records.length, realPages: true, referenceStateFixtures: true, fabricatedResponses: 0, forcedWorkflowOutcomeWrites: 0 }, null, 2));
    console.log(`C1_HISTORICAL_REFERENCES: devices=${cases.length}; fixtures=${records.length}; retired=${retired}; browser_errors=${pageErrors.length}; passed=${!failure}`);
  }
  if (failure) throw failure;
}
