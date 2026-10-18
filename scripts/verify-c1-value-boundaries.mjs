import assert from 'node:assert/strict';
import { isDeepStrictEqual } from 'node:util';
import fs from 'node:fs/promises';
import path from 'node:path';

// Owned-service acceptance: actual API responses and persisted business state, without response doubles.
// This module is opt-in so earlier page-error evidence keeps its original scope and inputs.
export async function verifyC1ValueBoundaries({ sessions, api, success, check, database, sqlText, fixture, saveFixture, marker, evidence, secrets, requests }) {
  const output = path.join(evidence, `c1-value-boundaries-${fixture.runId}`);
  await fs.mkdir(output);
  const cases = [];
  const base = '/workflow/wf';
  const rateConfig = name => {
    const value = database(`SELECT config_value FROM sys_config WHERE config_scope='0' AND config_key=${sqlText('sys.workflow.rateLimit.' + name)}`);
    assert.match(value, /^[1-9][0-9]*$/, 'Owned rate configuration must be explicit'); return Number(value);
  };
  const limits = {
    '/start': { count: rateConfig('startProcess'), seconds: rateConfig('startProcess.windowSeconds') },
    '/complete': { count: rateConfig('completeTask'), seconds: rateConfig('completeTask.windowSeconds') },
  };
  const post = async (actor, endpoint, body) => {
    const limit = limits[endpoint];
    while (limit) {
      const recent = requests.filter(request => request.actor === actor && request.method === 'POST' && request.path === base + endpoint);
      assert.ok(recent.every(request => Number.isFinite(request.observedAt)), 'Rate pacing requires timestamps for preceding requests');
      const active = recent.filter(request => request.observedAt + limit.seconds * 1000 + 250 > Date.now());
      if (active.length < limit.count) break;
      const delay = Math.min(20000, Math.max(1, active[active.length - limit.count].observedAt + limit.seconds * 1000 + 250 - Date.now()));
      console.log(`C1_MATRIX_RATE_WAIT: endpoint=${endpoint}; wait_ms=${delay}; configuration_changed=false; counter_writes=0`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
    return api(actor, base + endpoint, { method: 'POST', body });
  };
  const one = statement => {
    const value = database(statement); assert.ok(value, 'Owned reference fixture required'); return value.split(/\r?\n/)[0];
  };
  const references = {
    EMPLOYEE: one("SELECT CAST(id AS CHAR) FROM hr_employee WHERE tenant_id=100000 AND deleted=0 AND employee_status NOT IN ('RESIGNED','LEFT','TERMINATED','SUSPENDED') ORDER BY id LIMIT 1"),
    DEPT: one("SELECT CAST(dept_id AS CHAR) FROM sys_dept WHERE tenant_id=100000 AND deleted=0 AND status='0' ORDER BY dept_id LIMIT 1"),
    POST: one("SELECT CAST(post_id AS CHAR) FROM sys_post WHERE tenant_id=100000 AND status='0' ORDER BY post_id LIMIT 1"),
    POSITION: one('SELECT CAST(id AS CHAR) FROM hr_position WHERE tenant_id=100000 AND status=1 ORDER BY id LIMIT 1'),
  };
  const dictionary = JSON.parse(one("SELECT JSON_OBJECT('type',t.dict_type,'value',d.dict_value) FROM sys_dict_type t JOIN sys_dict_data d ON d.tenant_id=t.tenant_id AND d.dict_type=t.dict_type WHERE t.tenant_id=100000 AND t.status='0' AND d.status='0' ORDER BY t.dict_id,d.dict_sort,d.dict_code LIMIT 1"));
  const samples = [
    ['TEXT', '17', 17, { required: true }],
    ['TEXTAREA', 'false', false],
    ['RICH_TEXT', '<p>' + marker + '-matrix-private-rich</p><script>window.__c1MatrixExecuted=true</script>', ['invalid']],
    ['NUMBER', 12.34, 'invalid-number', { min: 1, max: 100, precision: 2 }],
    ['AMOUNT', '12.34', 'invalid-amount', { min: 1, max: 100, precision: 2 }],
    ['DATE', '2026-10-05', '2026-02-30'],
    ['DATETIME', '2026-10-05T12:34:00', '2026-10-05T25:00:00'],
    ['TIME', '12:34:00', '25:00:00'],
    ['DATE_RANGE', ['2026-10-05', '2026-10-06'], ['2026-10-06', '2026-10-05']],
    ['SELECT', '1', 1, { options: ['1', '2'] }],
    ['MULTI_SELECT', ['甲', '乙'], ['甲', '丙'], { options: ['甲', '乙'] }],
    ['RADIO_GROUP', 'false', false, { options: ['false', 'true'] }],
    ['CHECKBOX_GROUP', ['甲', '乙'], ['甲', '甲'], { options: ['甲', '乙'] }],
    ['SWITCH', false, 'false'],
    ['DICT_SELECT', dictionary.value, /^-?\d+$/.test(dictionary.value) ? Number(dictionary.value) : marker + '-missing-dictionary-value', { dictType: dictionary.type }],
    ...Object.entries(references).map(([type, value]) => [type, value, '-1', { onlyActive: true }]),
    ['USER_MULTI', [sessions.employee.account.userId, sessions.peer.account.userId], ['-1'], { onlyActive: true }],
    ['DEPT_MULTI', [references.DEPT], ['-1'], { onlyActive: true }],
    ['UPLOAD_FILE', [], ['-1'], { accept: '.pdf', maxSize: 1, maxCount: 1 }],
    ['UPLOAD_IMAGE', [], ['-1'], { accept: '.png,.jpg', maxSize: 1, maxCount: 1 }],
    ['SUB_TABLE', [{ _rowId: 'matrix-first', item: '明细', amount: '12.34' }], 'invalid-table', {
      columns: [{ id: 'item', type: 'TEXT', label: '项目', required: true }, { id: 'amount', type: 'AMOUNT', label: '金额' }],
    }],
  ];
  const fields = samples.map(([type, , , settings]) => ({ id: type.toLowerCase(), type, label: type, ...settings }));
  assert.equal(fields.length, 24);
  const values = Object.fromEntries(samples.map(([type, value]) => [type.toLowerCase(), value]));
  for (const type of ['text', 'textarea', 'rich_text']) if (values[type].includes(marker)) secrets.add(values[type]);
  const key = marker + '-values';
  let failure;
  try {
    const form = success(await post('admin', '/form/save', { formKey: key, formName: key, fieldsJson: JSON.stringify(fields) }), 'matrix_form_created');
    const formId = form.formId || form.id; fixture.forms.push(formId); saveFixture();
    const model = { nodes: [{ id: 'start', type: 'START', title: '发起' }, { id: 'approval', type: 'APPROVAL', title: '审批', approverType: 'USER', approverValue: sessions.peer.account.userId, allowEdit: true }, { id: 'end', type: 'END', title: '结束' }], edges: [{ source: 'start', target: 'approval' }, { source: 'approval', target: 'end' }] };
    const definition = success(await post('admin', '/definition/save', { processKey: key, processName: key, formId, modelJson: JSON.stringify(model), startPermissionType: 'ALL', startPermissionValue: '[]' }), 'matrix_process_created');
    const definitionId = definition.definitionId || definition.id; fixture.definitions.push(definitionId); saveFixture();
    success(await post('admin', '/definition/deploy/' + definitionId), 'matrix_process_deployed');
    const upload = async (field, filename, type, bytes) => {
      const requestPath = `${base}/form-files?definitionId=${encodeURIComponent(definitionId)}&fieldPath=${field}`;
      const result = await sessions.employee.page.evaluate(async ({ requestPath, filename, type, bytes }) => {
        const csrf = document.cookie.split(';').map(part => part.trim()).find(part => part.startsWith('XSRF-TOKEN='));
        const headers = csrf ? { 'X-CSRF-Token': decodeURIComponent(csrf.slice('XSRF-TOKEN='.length)) } : {};
        const body = new FormData(); body.append('file', new File([new Uint8Array(bytes)], filename, { type }));
        const response = await fetch('/api' + requestPath, { method: 'POST', credentials: 'same-origin', headers, body });
        return { status: response.status, body: await response.json(), traceId: response.headers.get('X-Trace-Id') };
      }, { requestPath, filename, type, bytes: [...bytes] });
      requests.push({ actor: 'employee', path: requestPath, method: 'POST', status: result.status, code: result.body?.code, traceId: result.traceId });
      return result;
    };
    const fileCount = () => database(`SELECT COUNT(*) FROM sys_file WHERE tenant_id=100000 AND biz_type='WORKFLOW_FORM' AND biz_id=${sqlText(definitionId)}`);
    const filesBefore = fileCount();
    // A synthetic, non-executable PE-shaped byte fixture; no program is run or downloaded.
    const executable = Buffer.alloc(512); executable.write('MZ', 0, 'ascii'); executable.writeUInt32LE(128, 60); executable.write('PE\0\0', 128, 'ascii');
    const forged = await upload('upload_image', 'disguised.jpg', 'image/jpeg', executable);
    check('matrix_executable_disguised_as_jpg_rejected_without_file_record', forged.status === 400 && forged.body?.code === 'INVALID_REQUEST' && fileCount() === filesBefore);
    const pdf = success(await upload('upload_file', 'matrix.pdf', 'application/pdf', Buffer.from('%PDF-1.4\nMatrix attachment\n%%EOF')), 'matrix_valid_pdf_uploaded');
    const pngBytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64');
    const png = success(await upload('upload_image', 'matrix.png', 'image/png', pngBytes), 'matrix_valid_png_uploaded');
    values.upload_file = [String(pdf.fileId)]; values.upload_image = [String(png.fileId)];
    fixture.files.push(...values.upload_file, ...values.upload_image); saveFixture();
    const context = success(await api('employee', `${base}/draft/context/${definitionId}`), 'matrix_start_context_loaded');
    let draft = success(await post('employee', '/draft', { definitionId, expectedVersion: 0, loadedContextHash: context.contextHash, title: key, formData: values, nodeAssignees: {} }), 'matrix_all_24_types_saved_in_draft');
    const draftState = () => database(`SELECT JSON_OBJECT('version',lock_version,'values',form_data) FROM wf_form_draft WHERE tenant_id=100000 AND draft_id=${sqlText(draft.draftId)}`);
    const negative = samples.map(([type, , invalid]) => ({ name: 'invalid_' + type.toLowerCase(), field: type.toLowerCase(), change: { [type.toLowerCase()]: invalid } }));
    for (const type of ['number', 'amount']) for (const [suffix, value] of [['below_min', 0], ['above_max', 101], ['precision', 1.234]]) negative.push({ name: type + '_' + suffix, field: type, change: { [type]: value } });
    negative.push({ name: 'undeclared_field', field: null, change: { undeclared_matrix_field: 'invalid' } });
    const rejected = (result, sample, phase) => {
      const errors = result.body?.errors;
      const passed = result.status === 400 && result.body?.code === 'FORM_INVALID_DATA' && Array.isArray(errors)
        && (sample.field === null ? errors.length === 0 : errors.some(error => error.field === sample.field));
      cases.push({ phase, scenario: sample.name, field: sample.field, status: result.status, fieldErrorCount: Array.isArray(errors) ? errors.length : 0, passed }); check(`matrix_${phase}_${sample.name}_rejected`, passed);
    };
    for (const sample of negative) {
      const before = draftState();
      rejected(await post('employee', '/draft', { draftId: draft.draftId, definitionId, expectedVersion: draft.lockVersion, loadedContextHash: context.contextHash, title: key, formData: { ...values, ...sample.change }, nodeAssignees: {} }), sample, 'draft');
      check(`matrix_draft_${sample.name}_preserves_values_and_version`, draftState() === before);
      rejected(await post('employee', '/start', { processDefKey: key, businessKey: key + '-' + sample.name, variables: { ...values, ...sample.change }, nodeAssignees: {} }), sample, 'start');
      check(`matrix_start_${sample.name}_creates_no_instance`, database(`SELECT COUNT(*) FROM wf_process_instance WHERE tenant_id=100000 AND definition_id=${sqlText(definitionId)}`) === '0');
    }
    const missing = { name: 'required_missing', field: 'text', change: { text: null } };
    rejected(await post('employee', '/start', { processDefKey: key, businessKey: key + '-required', variables: { ...values, ...missing.change }, nodeAssignees: {} }), missing, 'start');
    draft = success(await post('employee', '/draft', { draftId: draft.draftId, definitionId, expectedVersion: draft.lockVersion, loadedContextHash: context.contextHash, title: key, formData: { ...values, text: null }, nodeAssignees: {} }), 'matrix_incomplete_draft_can_be_saved');
    const incompleteBefore = draftState();
    rejected(await post('employee', '/start', { draftId: draft.draftId, expectedVersion: draft.lockVersion }), missing, 'draft_submit');
    check('matrix_incomplete_draft_submission_preserves_draft', draftState() === incompleteBefore);
    draft = success(await post('employee', '/draft', { draftId: draft.draftId, definitionId, expectedVersion: draft.lockVersion, loadedContextHash: context.contextHash, title: key, formData: values, nodeAssignees: {} }), 'matrix_draft_corrected');
    const started = success(await post('employee', '/start', { draftId: draft.draftId, expectedVersion: draft.lockVersion }), 'matrix_all_24_types_started');
    const instanceId = started.instanceId || started.processInstanceId; assert.ok(instanceId); fixture.instances.push(instanceId); saveFixture();
    const deadline = Date.now() + 30000;
    let task;
    do {
      const value = database(`SELECT JSON_OBJECT('id',task_id,'assignee',CAST(assignee AS CHAR)) FROM wf_task WHERE tenant_id=100000 AND instance_id=${sqlText(instanceId)} AND status='TODO'`);
      if (value) { task = JSON.parse(value); break; }
      await new Promise(resolve => setTimeout(resolve, 100));
    } while (Date.now() < deadline);
    check('matrix_task_assigned_to_real_reviewer', task?.assignee === sessions.peer.account.userId);
    const readValues = () => JSON.parse(database(`SELECT variables FROM wf_process_instance WHERE tenant_id=100000 AND instance_id=${sqlText(instanceId)}`));
    const startedValues = readValues();
    check('matrix_all_24_values_retained_in_actual_instance', Object.entries(values).every(([field, value]) => isDeepStrictEqual(startedValues[field], value)));
    const stateBefore = database(`SELECT variables FROM wf_process_instance WHERE tenant_id=100000 AND instance_id=${sqlText(instanceId)}`);
    for (const sample of [...negative, missing]) {
      rejected(await post('peer', '/complete', { taskId: task.id, action: 'APPROVE', variables: sample.change }), sample, 'approval');
      check(`matrix_approval_${sample.name}_preserves_task_and_values`, database(`SELECT status FROM wf_task WHERE tenant_id=100000 AND task_id=${sqlText(task.id)}`) === 'TODO'
        && database(`SELECT variables FROM wf_process_instance WHERE tenant_id=100000 AND instance_id=${sqlText(instanceId)}`) === stateBefore);
    }
    const finalText = marker + '-matrix-private-approved'; secrets.add(finalText);
    success(await post('peer', '/complete', { taskId: task.id, action: 'APPROVE', variables: { text: finalText } }), 'matrix_corrected_approval_completes');
    let finalStatus;
    const completionDeadline = Date.now() + 30000;
    do {
      finalStatus = database(`SELECT status FROM wf_process_instance WHERE tenant_id=100000 AND instance_id=${sqlText(instanceId)}`);
      if (finalStatus === 'PASSED') break;
      await new Promise(resolve => setTimeout(resolve, 100));
    } while (Date.now() < completionDeadline);
    check('matrix_corrected_instance_reaches_passed', finalStatus === 'PASSED');
    const finalValues = readValues();
    check('matrix_approval_preserves_other_23_values', finalValues.text === finalText && Object.entries(values).filter(([field]) => field !== 'text').every(([field, value]) => isDeepStrictEqual(finalValues[field], value)));
    check('matrix_corrected_approval_has_exactly_one_history', database(`SELECT COUNT(*) FROM wf_task_history WHERE tenant_id=100000 AND task_id=${sqlText(task.id)} AND action='APPROVE'`) === '1');
    check('matrix_rate_configuration_unchanged', rateConfig('startProcess') === limits['/start'].count && rateConfig('startProcess.windowSeconds') === limits['/start'].seconds
      && rateConfig('completeTask') === limits['/complete'].count && rateConfig('completeTask.windowSeconds') === limits['/complete'].seconds);
  } catch (error) { failure = error; }
  finally {
    await fs.writeFile(path.join(output, 'result.json'), JSON.stringify({ passed: !failure, types: fields.map(field => field.type), cases, rateLimits: limits, realServices: true, fabricatedResponses: 0, browserRenderingVerified: false }, null, 2));
    console.log(`C1_VALUE_BOUNDARIES: types=${fields.length}; rejection_cases=${cases.length}; passed=${!failure}; fabricated_responses=0; browser_rendering_verified=false`);
  }
  if (failure) throw failure;
}
