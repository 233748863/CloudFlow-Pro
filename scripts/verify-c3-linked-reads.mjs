import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import fs from 'node:fs/promises';
import path from 'node:path';

// Use real publication, uploads, and task actions. The database callback is read-only in this module.
export async function verifyC3LinkedReads({ sessions, api, success, check, database, sqlText, fixture, saveFixture, marker, evidence, secrets, requests }) {
  const output = path.join(evidence, `c3-linked-reads-${fixture.runId}`);
  await fs.mkdir(output);
  const cases = [], files = [], tasks = [], ticketTimes = new Map();
  const base = '/workflow/wf', name = marker + '-linked';
  let stage = 'prepare', failure, formId, definitionId, instanceId, values;
  const hash = content => createHash('sha256').update(content).digest('hex');
  const decode = value => typeof value === 'string' ? JSON.parse(value) : value;
  const pause = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
  const waitFor = async (read, accept, message) => {
    const deadline = Date.now() + 30000;
    do { const value = await read(); if (accept(value)) return value; await pause(200); } while (Date.now() < deadline);
    throw new Error(message);
  };
  const deny = (label, response, statuses = [400, 403, 404, 409, 410], code) => {
    check(label, statuses.includes(response.status) && response.body != null && !response.body.data && !response.body.rows
      && !response.body.streamUrl && !response.signature && (!code || response.body.code === code));
    cases.push({ label, status: response.status, code: response.body.code, denied: true });
  };
  const proof = (id, label) => ({ id, type: 'UPLOAD_FILE', label, accept: '.pdf', maxSize: 1 });
  const dept = id => ({ id, type: 'DEPT', label: id, onlyActive: true });
  const context = (file, taskId, fieldPath = file.fieldPath, unbound = false) => ({
    bizType: 'WORKFLOW_FORM', bizId: unbound ? definitionId : instanceId, definitionId,
    ...(unbound ? {} : { instanceId, ...(taskId ? { taskId } : {}) }), fieldPath, fileId: file.fileId,
  });
  const filePath = (file, taskId, fieldPath = file.fieldPath, content = false, unbound = false) => {
    const query = new URLSearchParams(unbound ? { definitionId, fieldPath } : { instanceId, fieldPath, ...(taskId ? { taskId } : {}) });
    return `${base}/form-files/${file.fileId}${content ? '/content' : ''}?${query}`;
  };
  const issue = async (actor, body) => {
    // Stay below the existing 30-per-minute limit without changing its counters or configuration.
    let times = (ticketTimes.get(actor) || []).filter(time => time > Date.now() - 61000);
    if (times.length >= 27) { console.log('C3_LINKED_RATE_WAIT: natural_window=true'); await pause(Math.max(1, times[0] + 61000 - Date.now())); times = []; }
    times.push(Date.now()); ticketTimes.set(actor, times);
    return api(actor, '/auth/system/file/preview-ticket', { method: 'POST', body });
  };
  const ticket = async (actor, body, label) => {
    const preview = success(await issue(actor, body), label + '_ticket');
    check(label + '_supported', preview.supported === true && preview.mediaType === 'application/pdf'
      && typeof preview.streamUrl === 'string' && preview.expiresAt > Date.now() && preview.expiresAt <= Date.now() + 60000);
    const url = new URL(preview.streamUrl, 'http://127.0.0.1');
    check(label + '_local_stream', url.origin === 'http://127.0.0.1' && url.pathname === '/api/auth/system/file/preview-content');
    secrets.add(preview.streamUrl);
    for (const key of ['previewToken', 'signature']) { const value = url.searchParams.get(key); assert.match(value, /^[A-Za-z0-9_-]{43}$/); secrets.add(value); }
    return url.pathname.slice(4) + url.search;
  };
  const bytes = (label, response, file, partial = false) => {
    const content = partial ? file.content.slice(0, 5) : file.content;
    check(label, response.status === (partial ? 206 : 200) && response.length === Buffer.byteLength(content)
      && response.sha256 === hash(content) && response.cacheControl?.includes('private, no-store') && response.nosniff === 'nosniff'
      && (!partial || response.contentRange === `bytes 0-4/${Buffer.byteLength(file.content)}`));
    cases.push({ label, status: response.status, bytes: response.length, verifiedDigest: response.sha256 });
  };
  const references = async (actor, field, taskId, allowed, label, strictCode) => {
    const endpoint = taskId ? `${base}/task/${taskId}/form-references/${field}` : `${base}/draft/context/${definitionId}/references/${field}`;
    const response = await api(actor, endpoint + '?pageNum=1&pageSize=100');
    if (!allowed) { deny(label, response, [400, 403, 404], strictCode); return; }
    const data = success(response, label + '_success');
    const expected = database("SELECT JSON_OBJECT('id',CAST(dept_id AS CHAR),'label',dept_name) FROM sys_dept WHERE tenant_id=100000 AND deleted=0 AND status='0' ORDER BY dept_id LIMIT 100").split(/\r?\n/).filter(Boolean).map(JSON.parse);
    check(label + '_only_current_tenant_options', expected.length > 0 && Array.isArray(data.rows)
      && isDeepStrictEqual(data.rows.map(({ id, label }) => ({ id, label })), expected)
      && data.rows.every(row => Object.keys(row).every(key => ['id', 'label', 'departmentId'].includes(key))));
    cases.push({ label, actor, field, status: response.status, options: data.rows.length });
  };
  const inspectFile = async (actor, file, taskId, phase, allowed) => {
    const label = `c3_linked_${phase}_${actor}_${file.key}`;
    const metadata = await api(actor, filePath(file, taskId));
    const content = await api(actor, filePath(file, taskId, file.fieldPath, true));
    if (!allowed) {
      deny(label + '_metadata_denied', metadata); deny(label + '_content_denied', content);
      deny(label + '_preview_denied', await issue(actor, context(file, taskId))); return;
    }
    const data = success(metadata, label + '_metadata');
    check(label + '_metadata_matches', data.fileId === file.fileId && data.fileName === file.fileName && Number(data.size) === Buffer.byteLength(file.content));
    cases.push({ label: label + '_metadata', status: metadata.status, fieldPath: file.fieldPath });
    bytes(label + '_download', content, file);
    const url = await ticket(actor, context(file, taskId), label);
    bytes(label + '_preview', await api(actor, url), file);
    bytes(label + '_preview_range', await api(actor, url, { range: 'bytes=0-4' }), file, true);
  };
  const projection = async (actor, taskId, phase) => {
    const view = success(await api(actor, `${base}/instance/${instanceId}` + (taskId ? `?taskId=${taskId}` : '')), 'c3_linked_' + phase + '_projection_' + actor);
    const data = decode(view.variables);
    check('c3_linked_' + phase + '_public_files_' + actor, isDeepStrictEqual(data.publicProof, values.publicProof)
      && isDeepStrictEqual(data.layoutProof, values.layoutProof) && data.items.length === 2
      && data.items.every((row, index) => isDeepStrictEqual(row.proof, values.items[index].proof)));
    check('c3_linked_' + phase + '_private_files_' + actor, actor === 'employee'
      ? !Object.hasOwn(data, 'hiddenProof') && !Object.hasOwn(data, 'parentProof') && data.items.every(row => !Object.hasOwn(row, 'hiddenProof'))
      : isDeepStrictEqual(data.hiddenProof, values.hiddenProof) && isDeepStrictEqual(data.parentProof, values.parentProof)
        && data.items.every((row, index) => isDeepStrictEqual(row.hiddenProof, values.items[index].hiddenProof)));
    cases.push({ label: 'projection', actor, phase, status: 200, hiddenFiles: actor === 'employee' });
  };
  try {
    check('c3_linked_employee_has_preview_permission', sessions.employee.identity.permissions.includes('system:file:preview'));
    const department = database("SELECT CAST(MIN(dept_id) AS CHAR) FROM sys_dept WHERE tenant_id=100000 AND deleted=0 AND status='0'");
    assert.match(department, /^[1-9][0-9]*$/);
    const fields = [{ id: 'note', type: 'TEXT', label: '说明' }, proof('publicProof', '公开附件'), proof('hiddenProof', '受限附件'),
      dept('department'), dept('hiddenDepartment'), dept('readonlyDepartment'), dept('startHiddenDepartment'),
      { id: 'visibleGroup', type: 'GROUP', label: '可见分组', children: [proof('layoutProof', '分组附件'), dept('layoutDepartment')] },
      { id: 'privateGroup', type: 'GROUP', label: '受限分组', children: [proof('parentProof', '分组受限附件'), dept('parentDepartment')] },
      { id: 'startPrivateGroup', type: 'GROUP', label: '发起受限分组', children: [dept('startParentDepartment')] },
      { id: 'items', type: 'SUB_TABLE', label: '明细', columns: [proof('proof', '附件'), proof('hiddenProof', '受限附件'), dept('department'), dept('hiddenDepartment'), dept('readonlyDepartment'), dept('startHiddenDepartment')] }];
    const form = success(await api('admin', base + '/form/save', { method: 'POST', body: { formKey: name, formName: name, fieldsJson: JSON.stringify(fields) } }), 'c3_linked_form_saved');
    formId = form.formId || form.id; fixture.forms.push(formId); saveFixture();
    const nodes = [{ id: 'start', type: 'START', title: '发起' },
      ...['approval', 'readonly'].map(id => ({ id, type: 'APPROVAL', title: id, approverType: 'USER', approverValue: sessions.employee.account.userId, allowEdit: id === 'approval' })),
      { id: 'end', type: 'END', title: '完成' }];
    const edges = nodes.slice(1).map((node, index) => ({ source: nodes[index].id, target: node.id }));
    const definition = success(await api('admin', base + '/definition/save', { method: 'POST', body: { processKey: name, processName: name, formId, modelJson: JSON.stringify({ nodes, edges }), startPermissionType: 'ALL', startPermissionValue: '[]' } }), 'c3_linked_definition_saved');
    definitionId = definition.definitionId || definition.id; fixture.definitions.push(definitionId); saveFixture();
    const hidden = ['hiddenProof', 'privateGroup', 'items.hiddenProof', 'hiddenDepartment', 'items.hiddenDepartment'];
    const rules = ['approval', 'readonly'].flatMap(nodeKey => [
      ...hidden.map(fieldId => ({ nodeKey, fieldId, visibleFlag: false, editableFlag: false, requiredFlag: false })),
      ...['readonlyDepartment', 'items.readonlyDepartment'].map(fieldId => ({ nodeKey, fieldId, visibleFlag: true, editableFlag: false, requiredFlag: false })),
    ]).concat(['startHiddenDepartment', 'startPrivateGroup', 'items.startHiddenDepartment'].map(fieldId => ({ nodeKey: '__START__', fieldId, visibleFlag: false, editableFlag: false, requiredFlag: false })));
    success(await api('admin', `${base}/definition/${definitionId}/field-permissions`, { method: 'PUT', body: rules }), 'c3_linked_rules_saved');
    success(await api('admin', `${base}/definition/deploy/${definitionId}`, { method: 'POST' }), 'c3_linked_published');
    stage = 'draft-references';
    for (const field of ['department', 'hiddenDepartment', 'readonlyDepartment', 'layoutDepartment', 'parentDepartment', 'items.department', 'items.hiddenDepartment', 'items.readonlyDepartment'])
      await references('employee', field, null, true, 'c3_linked_draft_' + field);
    for (const field of ['startHiddenDepartment', 'startParentDepartment', 'items.startHiddenDepartment'])
      await references('employee', field, null, false, 'c3_linked_draft_hidden_' + field, 'DRAFT_REFERENCE_UNAVAILABLE');
    await references('foreign', 'department', null, false, 'c3_linked_draft_foreign');
    stage = 'uploads';
    for (const [key, fieldPath, hiddenFile] of [['public', 'publicProof', false], ['private', 'hiddenProof', true], ['layout', 'layoutProof', false], ['parent', 'parentProof', true],
      ['row0', 'items[0].proof', false], ['row0Private', 'items[0].hiddenProof', true], ['row1', 'items[1].proof', false], ['row1Private', 'items[1].hiddenProof', true]]) {
      const content = `%PDF-1.4\n${name}-${key}\n%%EOF`, fileName = name + '-' + key + '.pdf';
      secrets.add(content); if (hiddenFile) secrets.add(fileName);
      const uploaded = success(await api('admin', `${base}/form-files?` + new URLSearchParams({ definitionId, fieldPath }), { method: 'POST', file: { name: fileName, type: 'application/pdf', content } }), 'c3_linked_upload_' + key);
      const file = { key, fieldPath, hidden: hiddenFile, fileId: String(uploaded.fileId), fileName, content };
      files.push(file); fixture.files.push(file.fileId); saveFixture();
    }
    const unbound = await ticket('admin', context(files[0], null, undefined, true), 'c3_linked_unbound');
    bytes('c3_linked_unbound_preview', await api('admin', unbound), files[0]);
    deny('c3_linked_unbound_peer_ticket', await issue('employee', context(files[0], null, undefined, true)));
    values = { note: name, publicProof: [files[0].fileId], hiddenProof: [files[1].fileId], layoutProof: [files[2].fileId], parentProof: [files[3].fileId],
      department, hiddenDepartment: department, readonlyDepartment: department, layoutDepartment: department, parentDepartment: department,
      items: [0, 1].map(index => ({ _rowId: 'row' + index, proof: [files[4 + 2 * index].fileId], hiddenProof: [files[5 + 2 * index].fileId], department, hiddenDepartment: department, readonlyDepartment: department })) };
    stage = 'start';
    const started = success(await api('admin', base + '/start', { method: 'POST', body: { processDefKey: name, businessKey: name, variables: values } }), 'c3_linked_started');
    instanceId = started.instanceId || started.processInstanceId; fixture.instances.push(instanceId); saveFixture();
    const taskFor = node => waitFor(() => database(`SELECT task_id FROM wf_task WHERE tenant_id=100000 AND instance_id=${sqlText(instanceId)} AND node_key=${sqlText(node)} AND status='TODO' AND assignee=${sqlText(sessions.employee.account.userId)}`), Boolean, 'Linked task missing: ' + node);
    const taskId = await taskFor('approval'); tasks.push(taskId);
    deny('c3_linked_bound_invalidates_unbound_ticket', await api('admin', unbound));
    const updated = success(await api('admin', base + '/form/save', { method: 'POST', body: { formId, versionLock: form.versionLock, formName: name, fieldsJson: JSON.stringify([{ id: 'newNote', type: 'TEXT', label: '新版说明' }]) } }), 'c3_linked_form_version_two');
    check('c3_linked_fixed_version_one', updated.version === 2 && database(`SELECT form_version FROM wf_process_instance WHERE tenant_id=100000 AND instance_id=${sqlText(instanceId)}`) === '1');
    stage = 'pending-reads';
    await projection('employee', taskId, 'pending'); await projection('admin', null, 'pending');
    for (const file of files) { await inspectFile('employee', file, taskId, 'pending', !file.hidden); await inspectFile('admin', file, null, 'pending', true); }
    for (const file of files.filter(file => file.hidden)) {
      const label = 'c3_linked_forged_path_' + file.key;
      deny(label + '_metadata', await api('employee', filePath(file, taskId, 'publicProof')));
      deny(label + '_download', await api('employee', filePath(file, taskId, 'publicProof', true)));
      deny(label + '_preview', await issue('employee', context(file, taskId, 'publicProof')));
    }
    for (const actor of ['peer', 'foreign']) await inspectFile(actor, files[0], taskId, 'unrelated', false);
    const privateTicket = await ticket('admin', context(files[1]), 'c3_linked_owner_private');
    deny('c3_linked_private_ticket_other_session', await api('employee', privateTicket), [410]);
    const publicTicket = await ticket('employee', context(files[0], taskId), 'c3_linked_reviewer_public');
    deny('c3_linked_public_ticket_other_session', await api('peer', publicTicket), [410]);
    stage = 'task-references';
    for (const field of ['department', 'layoutDepartment', 'items.department']) await references('employee', field, taskId, true, 'c3_linked_pending_' + field);
    for (const field of ['hiddenDepartment', 'parentDepartment', 'items.hiddenDepartment', 'readonlyDepartment', 'items.readonlyDepartment'])
      await references('employee', field, taskId, false, 'c3_linked_pending_denied_' + field, 'TASK_REFERENCE_UNAVAILABLE');
    // Existing task administration permission also allows administrators; the chosen task's field rules still apply.
    await references('admin', 'department', taskId, true, 'c3_linked_admin_task_reference');
    await references('admin', 'hiddenDepartment', taskId, false, 'c3_linked_admin_task_hidden', 'TASK_REFERENCE_UNAVAILABLE');
    for (const actor of ['peer', 'foreign']) await references(actor, 'department', taskId, false, 'c3_linked_non_assignee_' + actor);
    stage = 'readonly-node';
    success(await api('employee', base + '/complete', { method: 'POST', body: { taskId, action: 'APPROVE', variables: {}, comment: '完成字段核对' } }), 'c3_linked_complete_editable');
    const readonlyTask = await taskFor('readonly'); tasks.push(readonlyTask);
    for (const field of ['department', 'layoutDepartment', 'items.department']) await references('employee', field, readonlyTask, false, 'c3_linked_readonly_node_' + field, 'TASK_REFERENCE_UNAVAILABLE');
    await inspectFile('employee', files[0], readonlyTask, 'readonly', true);
    await inspectFile('employee', files[1], readonlyTask, 'readonly', false);
    stage = 'completed-reads';
    success(await api('employee', base + '/complete', { method: 'POST', body: { taskId: readonlyTask, action: 'APPROVE', variables: {}, comment: '只读复核完成' } }), 'c3_linked_complete_readonly');
    await waitFor(() => database(`SELECT status FROM wf_process_instance WHERE tenant_id=100000 AND instance_id=${sqlText(instanceId)}`), value => value === 'PASSED', 'Linked instance not passed');
    await projection('employee', null, 'done'); await projection('admin', null, 'done');
    for (const file of files) { await inspectFile('employee', file, null, 'done', !file.hidden); await inspectFile('admin', file, null, 'done', true); }
    for (const completedTask of tasks) await references('employee', 'department', completedTask, false, 'c3_linked_completed_task_no_options', 'TASK_REFERENCE_UNAVAILABLE');
    const stored = JSON.parse(database(`SELECT variables FROM wf_process_instance WHERE tenant_id=100000 AND instance_id=${sqlText(instanceId)}`));
    check('c3_linked_all_original_values_retained', Object.entries(values).every(([key, value]) => isDeepStrictEqual(stored[key], value)));
    check('c3_linked_request_evidence_omits_preview_credentials', requests.filter(request => request.path.startsWith('/auth/system/file/preview-content')).every(request => request.path === '/auth/system/file/preview-content'));
    stage = 'complete';
  } catch (error) {
    failure = error; let message = String(error.message).split('\n')[0];
    for (const secret of secrets) message = message.split(secret).join('[REDACTED]');
    await fs.writeFile(path.join(output, 'failure-stage.json'), JSON.stringify({ stage, name: error.name, message }));
  } finally {
    await fs.writeFile(path.join(output, 'result.json'), JSON.stringify({ passed: !failure, stage, formId, definitionId, instanceId, tasks, cases,
      files: files.map(({ key, fieldPath, hidden, fileId }) => ({ key, fieldPath, hidden, fileId })), databaseWrites: 0, redisDeletes: 0, fabricatedResponses: 0 }, null, 2));
    console.log(`C3_LINKED_READS: files=${files.length}; tasks=${tasks.length}; cases=${cases.length}; passed=${!failure}`);
  }
  if (failure) throw new Error('C3 linked reads failed; see safe failure-stage.json');
}
