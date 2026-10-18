import fs from 'node:fs/promises';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { verifyC4VersionPages } from './verify-c4-version-pages.mjs';

export async function verifyC4VersionRecords({ sessions, api, success, check, database, sqlText, fixture, saveFixture, marker, evidence, secrets, requests }) {
  const output = path.join(evidence, 'c4-version-records-' + fixture.runId);
  await fs.mkdir(output);
  const base = '/workflow/wf', observations = [], versions = [];
  let stage = 'create', failure, formId, definitionId, instanceId, taskId;
  const decode = value => typeof value === 'string' ? JSON.parse(value) : value;
  const savedAttributes = fields => fields.map(({ readonly, required, ...field }) => ({ ...field,
    ...(Array.isArray(field.children) ? { children: savedAttributes(field.children) } : {}),
    ...(Array.isArray(field.columns) ? { columns: savedAttributes(field.columns) } : {}) }));
  const sameKeys = (changes, expected) => isDeepStrictEqual(changes.map(change => change.fieldId).sort(), [...expected].sort());
  const readRows = () => database('SELECT JSON_OBJECT(\'version\',version,\'latest\',is_latest,\'checksum\',checksum,\'lock\',version_lock,\'rollback\',is_rollback,\'source\',rollback_from_version) FROM wf_form_definition WHERE tenant_id=100000 AND form_id=' + sqlText(formId) + ' ORDER BY version')
    .split(/\r?\n/).filter(Boolean).map(JSON.parse);
  const waitFor = async (read, accept, label) => {
    const end = Date.now() + 30000;
    do { const result = read(); if (accept(result)) return result; await new Promise(resolve => setTimeout(resolve, 200)); } while (Date.now() < end);
    throw new Error(label);
  };
  const get = async (endpoint, label, actor = 'admin') => success(await api(actor, base + endpoint), label);
  const post = async (endpoint, body, label, actor = 'admin') => success(await api(actor, base + endpoint, { method: 'POST', body }), label);
  const name = marker + '-versions';
  const original = [
    { id: 'note', type: 'TEXT', label: '原文本', defaultValue: '原默认值' },
    { id: 'obsolete', type: 'TEXT', label: '历史保留字段' },
    { id: 'items', type: 'SUB_TABLE', label: '明细', columns: [
      { id: 'note', type: 'TEXT', label: '原明细说明' }, { id: 'amount', type: 'AMOUNT', label: '金额', precision: 2 },
      { id: 'obsolete', type: 'TEXT', label: '历史明细字段' }] },
    { id: 'layout', type: 'GRID', label: '分栏', columns: 2, children: [{ id: 'inside', type: 'TEXT', label: '布局内说明' }] },
  ];
  const values = { note: name + '-old-text', obsolete: name + '-old-value', inside: '原布局值',
    items: [{ _rowId: 'one', note: '第一行', amount: '12.34', obsolete: name + '-old-row-one' },
      { _rowId: 'two', note: '第二行', amount: '56.78', obsolete: name + '-old-row-two' }] };
  for (const value of [values.note, values.obsolete, ...values.items.map(row => row.obsolete)]) secrets.add(value);
  const oldRead = async (phase, actor) => {
    const data = await get('/instance/' + instanceId, 'c4_versions_' + phase + '_' + actor + '_read', actor);
    const stored = decode(data.variables), schema = savedAttributes(decode(data.formDefinition.fields));
    check('c4_versions_' + phase + '_' + actor + '_original_values', Object.entries(values).every(([key, value]) => isDeepStrictEqual(stored[key], value)));
    check('c4_versions_' + phase + '_' + actor + '_original_definition', data.formDefinition.version === 1 && isDeepStrictEqual(schema, original));
    observations.push({ label: 'historical-instance', phase, actor, formVersion: data.formDefinition.version });
  };
  try {
    let current = await post('/form/save', { formKey: name, formName: name, fieldsJson: JSON.stringify(original) }, 'c4_versions_create');
    formId = current.formId; fixture.forms.push(formId); saveFixture();
    check('c4_versions_initial_identity', typeof formId === 'string' && current.version === 1 && current.isLatest === 1 && /^[a-f0-9]{64}$/i.test(current.checksum));
    const first = current;
    const reverseKeys = value => Array.isArray(value) ? value.map(reverseKeys) : value && typeof value === 'object'
      ? Object.fromEntries(Object.entries(value).reverse().map(([key, child]) => [key, reverseKeys(child)])) : value;
    const equivalent = JSON.stringify(reverseKeys(original), null, 2);
    current = await post('/form/save', { formId, formName: name, versionLock: current.versionLock, fieldsJson: equivalent }, 'c4_versions_equivalent_save');
    check('c4_versions_equivalent_does_not_create_version', current.version === 1 && current.id === first.id && current.checksum === first.checksum
      && current.versionLock === first.versionLock + 1 && readRows().length === 1);
    versions.push({ version: 1, checksum: current.checksum, changeType: current.changeType });
    observations.push({ label: 'equivalent-save', version: current.version, newRows: 0, lockAdvanced: true });

    stage = 'start';
    const model = { nodes: [{ id: 'start', type: 'START', title: '发起' },
      { id: 'approval', type: 'APPROVAL', title: '原表单审批', approverType: 'USER', approverValue: sessions.employee.account.userId, allowEdit: true },
      { id: 'end', type: 'END', title: '完成' }], edges: [{ source: 'start', target: 'approval' }, { source: 'approval', target: 'end' }] };
    const definition = await post('/definition/save', { processKey: name, processName: name, formId, modelJson: JSON.stringify(model), startPermissionType: 'ALL', startPermissionValue: '[]' }, 'c4_versions_definition');
    definitionId = definition.definitionId || definition.id; fixture.definitions.push(definitionId); saveFixture();
    await post('/definition/deploy/' + definitionId, undefined, 'c4_versions_publish');
    const started = await post('/start', { processDefKey: name, businessKey: name, variables: values }, 'c4_versions_start');
    instanceId = started.instanceId || started.processInstanceId; fixture.instances.push(instanceId); saveFixture();
    taskId = await waitFor(() => database('SELECT task_id FROM wf_task WHERE tenant_id=100000 AND instance_id=' + sqlText(instanceId) + " AND node_key='approval' AND status='TODO'"), value => Boolean(value), 'Version task missing');
    check('c4_versions_instance_pins_version_one', database('SELECT form_version FROM wf_process_instance WHERE tenant_id=100000 AND instance_id=' + sqlText(instanceId)) === '1');
    await oldRead('initial', 'employee');

    const save = async (fields, expectedType, changeLog) => {
      const previous = current;
      current = await post('/form/save', { formId, formName: name, versionLock: previous.versionLock, fieldsJson: JSON.stringify(fields), changeLog }, 'c4_versions_save_' + expectedType);
      const rows = readRows();
      check('c4_versions_increment_' + current.version, current.version === previous.version + 1 && current.versionLock === previous.versionLock + 1
        && rows.length === current.version && rows.filter(row => row.latest === 1).length === 1 && rows.at(-1).latest === 1 && rows.slice(0, -1).every(row => row.latest === 0));
      check('c4_versions_change_type_' + current.version, current.changeType === expectedType && Boolean(current.changeLog));
      check('c4_versions_saved_definition_' + current.version, isDeepStrictEqual(decode(current.fieldsJson), fields));
      if (changeLog) check('c4_versions_explicit_change_log', current.changeLog === changeLog);
      versions.push({ version: current.version, checksum: current.checksum, changeType: current.changeType });
      observations.push({ label: 'new-version', version: current.version, changeType: current.changeType });
    };
    stage = 'revisions';
    let fields = [...structuredClone(original), { id: 'extra', type: 'TEXT', label: '新增说明' }];
    await save(fields, 'ADD_FIELD', '新增字段记录');
    fields = fields.filter(field => field.id !== 'obsolete'); await save(fields, 'REMOVE_FIELD');
    fields = fields.map(field => field.id === 'note' ? { id: 'note', type: 'SELECT', label: '新选项', options: ['当前选项'], defaultValue: '当前选项' } : field);
    await save(fields, 'MODIFY_FIELD');
    fields = fields.map(field => field.id === 'items' ? { ...field, columns: [
      { id: 'note', type: 'TEXT', label: '新明细说明' }, field.columns.find(column => column.id === 'amount'), { id: 'tax', type: 'NUMBER', label: '新增税额', precision: 2 }] } : field);
    await save(fields, 'MIXED');
    fields = fields.map(field => field.id === 'layout' ? { ...field, columns: 3 } : field);
    await save(fields, 'LAYOUT_CHANGE');

    stage = 'history';
    const beforeRollback = await get('/form/' + formId, 'c4_versions_default_latest_id');
    check('c4_versions_latest_identity_id', beforeRollback.formId === formId && beforeRollback.version === 6 && isDeepStrictEqual(decode(beforeRollback.fieldsJson), fields));
    const pages = [];
    for (const pageNum of [1, 2]) {
      const page = await get('/form/' + formId + '/versions?pageNum=' + pageNum + '&pageSize=3', 'c4_versions_history_page_' + pageNum);
      check('c4_versions_history_page_total_' + pageNum, Number(page.total) === 6 && page.rows.length === 3);
      pages.push(...page.rows);
    }
    check('c4_versions_history_descending_contiguous', isDeepStrictEqual(pages.map(row => row.version), [6, 5, 4, 3, 2, 1]));
    check('c4_versions_history_creator_and_latest', pages.every(row => String(row.createBy) === sessions.admin.account.userId) && pages[0].isLatest === 1 && pages.slice(1).every(row => row.isLatest === 0));
    for (const version of [1, 4, 6]) {
      const row = await get('/form/' + formId + '/versions/' + version, 'c4_versions_detail_' + version);
      check('c4_versions_detail_identity_' + version, row.version === version && row.formId === formId && row.checksum === versions.find(saved => saved.version === version).checksum);
    }
    const difference = await get('/form/' + formId + '/versions/compare?from=1&to=6', 'c4_versions_compare_mixed');
    check('c4_versions_diff_added_removed_nested', sameKeys(difference.added, ['extra', 'items.tax']) && sameKeys(difference.removed, ['obsolete', 'items.obsolete']));
    check('c4_versions_diff_modified_nested', sameKeys(difference.modified, ['note', 'items.note']) && difference.modified.find(field => field.fieldId === 'note').properties.type.before === 'TEXT'
      && difference.modified.find(field => field.fieldId === 'note').properties.type.after === 'SELECT');
    check('c4_versions_diff_layout_separate', difference.changeType === 'MIXED' && sameKeys(difference.layoutChanges, ['layout']));
    const same = await get('/form/' + formId + '/versions/compare?from=1&to=1', 'c4_versions_compare_same');
    check('c4_versions_diff_same_empty', same.changeType === 'UNCHANGED' && ['added', 'removed', 'modified', 'layoutChanges'].every(key => same[key].length === 0));
    observations.push({ label: 'mixed-difference', added: difference.added.map(row => row.fieldId), removed: difference.removed.map(row => row.fieldId), modified: difference.modified.map(row => row.fieldId), layout: difference.layoutChanges.map(row => row.fieldId) });
    await oldRead('after_revisions', 'admin'); await oldRead('after_revisions', 'employee');
    for (const actor of ['employee', 'foreign']) {
      const denied = await api(actor, base + '/form/' + formId + '/versions/1');
      const expected = actor === 'employee' ? { status: 403, code: 403 } : { status: 400, code: 'INVALID_REQUEST' };
      check('c4_versions_history_denied_' + actor, denied.status === expected.status && denied.body?.code === expected.code && !denied.body?.data);
    }

    stage = 'rollback';
    const rollback = await verifyC4VersionPages({ sessions, api, success, check, database, sqlText, fixture, saveFixture,
      secrets, requests, output, formId, name, taskId, values, readRows });
    check('c4_versions_rollback_creates_seventh', rollback.version === 7 && rollback.isRollback === 1 && rollback.rollbackFromVersion === 1
      && rollback.checksum === first.checksum && isDeepStrictEqual(decode(rollback.fieldsJson), original));
    const retained = readRows();
    check('c4_versions_rollback_keeps_intermediate_versions', isDeepStrictEqual(retained.map(row => row.version), [1, 2, 3, 4, 5, 6, 7])
      && retained.filter(row => row.latest === 1).length === 1 && retained.at(-1).latest === 1
      && versions.every(version => retained.find(row => row.version === version.version).checksum === version.checksum));
    versions.push({ version: 7, checksum: rollback.checksum, changeType: rollback.changeType, rollbackFrom: 1 });
    await oldRead('after_rollback', 'employee');
    const latest = await get('/form/' + formId, 'c4_versions_latest_after_rollback');
    check('c4_versions_default_returns_rollback', latest.version === 7 && latest.isLatest === 1);
    await post('/complete', { taskId, action: 'APPROVE', variables: {}, comment: '按原版本办理' }, 'c4_versions_complete_original', 'employee');
    await waitFor(() => database('SELECT status FROM wf_process_instance WHERE tenant_id=100000 AND instance_id=' + sqlText(instanceId)), value => value === 'PASSED', 'Version instance did not complete');
    await oldRead('done', 'employee'); await oldRead('done', 'admin');
    stage = 'complete';
  } catch (error) {
    failure = error; let message = String(error.message).split('\n')[0]; for (const secret of secrets) message = message.split(secret).join('[REDACTED]');
    await fs.writeFile(path.join(output, 'failure-stage.json'), JSON.stringify({ stage, name: error.name, message }));
  } finally {
    await fs.writeFile(path.join(output, 'result.json'), JSON.stringify({ passed: !failure, stage, formId, definitionId, instanceId, taskId, versions, observations,
      realHttp: true, databaseWrites: 0, redisDeletes: 0, fabricatedResponses: 0, historyPagesExecuted: !failure, retentionExecuted: false }, null, 2));
    console.log('C4_VERSION_RECORDS: versions=' + versions.length + '; observations=' + observations.length + '; passed=' + !failure);
  }
  if (failure) throw new Error('C4 version records failed; see safe failure-stage.json');
}
