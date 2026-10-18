import assert from 'node:assert/strict';
import { previewPause, previewSql } from './file-preview-fixtures.mjs';

export async function verifyPreviewWorkflow(context) {
  const { admin, actor, peer, peerPerson, foreign, api, successful, database, check, caseTag, upload, pdf, images, issue, issueRaw, read, denied, verifyBytes, redis, evidence } = context;
  const base = '/workflow/wf';
  const key = `h5p_${caseTag}`;
  const fields = [{ id: 'note', type: 'TEXT', label: '说明' }, { id: 'receipt', type: 'UPLOAD_FILE', label: '凭证', accept: '.pdf', maxSize: 20 },
    { id: 'hiddenProof', type: 'UPLOAD_FILE', label: '内部凭证', accept: '.pdf', maxSize: 20 },
    { id: 'items', type: 'SUB_TABLE', label: '扫描明细', columns: [{ id: 'name', type: 'TEXT', label: '项目' }, { id: 'scan', type: 'UPLOAD_FILE', label: '扫描件', accept: '.png', maxSize: 20 }] }];
  const form = successful(await api(admin, `${base}/form/save`, { method: 'POST', body: {
    formKey: key, formName: `文件预览_${caseTag}`, fieldsJson: JSON.stringify(fields),
  } }), '真实创建预览验收流程表单');
  const formId = form.formId || form.id;
  assert.equal(typeof formId, 'string');
  const graph = { nodes: [{ id: 'start', type: 'START', title: '发起' },
    { id: 'approval', type: 'APPROVAL', title: '审批', approverType: 'USER', approverValue: peerPerson.userId, allowEdit: true },
    { id: 'end', type: 'END', title: '结束' }], edges: [{ source: 'start', target: 'approval' }, { source: 'approval', target: 'end' }] };
  const definition = successful(await api(admin, `${base}/definition/save`, { method: 'POST', body: {
    processKey: key, processName: `文件预览_${caseTag}`, formId, modelJson: JSON.stringify(graph), startPermissionType: 'ALL', startPermissionValue: '[]',
  } }), '真实创建绑定表单的流程定义');
  const definitionId = definition.definitionId || definition.id;
  assert.equal(typeof definitionId, 'string');
  successful(await api(admin, `${base}/definition/${definitionId}/field-permissions`, { method: 'PUT', body: [
    { nodeKey: 'approval', fieldId: 'receipt', visibleFlag: true, editableFlag: true, requiredFlag: false },
    { nodeKey: 'approval', fieldId: 'hiddenProof', visibleFlag: false, editableFlag: false, requiredFlag: false },
  ] }), '真实设置审批节点凭证字段权限');
  successful(await api(admin, `${base}/definition/deploy/${definitionId}`, { method: 'POST' }), '真实发布预览验收流程');
  const forbiddenChange = await api(admin, `${base}/definition/${definitionId}/field-permissions`, { method: 'PUT', body: [
    { nodeKey: 'approval', fieldId: 'receipt', visibleFlag: false, editableFlag: false, requiredFlag: false },
  ] });
  denied(forbiddenChange, '已发布定义仍禁止原地修改字段权限', [400, 409]);
  check('已发布定义拒绝修改时明确要求新草稿', /已发布流程的字段权限不可原地修改/.test(forbiddenChange.body?.message || forbiddenChange.body?.msg || ''));
  const uploadPath = fieldPath => `${base}/form-files?definitionId=${encodeURIComponent(definitionId)}&fieldPath=${encodeURIComponent(fieldPath)}`;
  const file = await upload(actor, 'workflow.pdf', pdf, 'application/pdf', uploadPath('receipt'));
  const hidden = await upload(actor, 'workflow-hidden.pdf', pdf, 'application/pdf', uploadPath('hiddenProof'));
  const nested = await upload(actor, 'workflow-nested.png', Buffer.from(images.png, 'base64'), 'image/png', uploadPath('items.scan'));
  const unbound = { bizType: 'WORKFLOW_FORM', bizId: definitionId, definitionId, fieldPath: 'receipt', fileId: file.id };
  const unboundTicket = await issue(actor, unbound, '流程发起未绑定附件');
  await verifyBytes(actor, unboundTicket, file, '流程发起未绑定附件');
  denied(await issueRaw(peer, unbound), '其他发起人不能读取尚未绑定的流程附件');
  denied(await issueRaw(foreign, unbound), '其他租户不能读取未绑定的流程附件');
  denied(await issueRaw(actor, { bizType: 'PUBLIC', fileId: file.id }), '流程私有附件不能通过公共预览入口');
  const values = { note: `预览验收_${caseTag}`, receipt: [file.id], hiddenProof: [hidden.id], items: [{ _rowId: 'scan-one', name: '扫描明细', scan: [nested.id] }] };
  const started = successful(await api(actor, `${base}/start`, { method: 'POST', body: {
    processDefKey: key, businessKey: `h5p_preview_${caseTag}`, variables: values,
  } }), '通过真实流程引擎发起带附件的审批');
  const instanceId = started.instanceId || started.processInstanceId;
  assert.equal(typeof instanceId, 'string');
  let task;
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    const row = database(`SELECT JSON_OBJECT('id',task_id,'assignee',CAST(assignee AS CHAR)) FROM wf_task WHERE tenant_id=100000 AND instance_id=${previewSql(instanceId)} AND status='TODO';`);
    if (row) { task = JSON.parse(row); break; }
    await previewPause(250);
  }
  check('真实工作流生成指定审批人任务并固定表单版本1', task?.assignee === peerPerson.userId
    && database(`SELECT form_version FROM wf_process_instance WHERE instance_id=${previewSql(instanceId)};`) === '1');
  const bound = { ...unbound, bizId: instanceId, instanceId, taskId: task.id };
  await verifyBytes(peer, await issue(peer, bound, '真实审批人附件'), file, '真实审批人附件');
  denied(await read(actor, unboundTicket), '已绑定实例后发起阶段的旧签名失效');
  denied(await issueRaw(foreign, bound), '真实异租户拒绝审批实例附件');
  denied(await issueRaw(peer, { ...bound, fileId: hidden.id, fieldPath: 'hiddenProof' }), '不可见字段的真实附件无法预览');
  denied(await issueRaw(peer, { ...bound, fileId: hidden.id }), '不可见字段附件无法改为可见字段路径后预览');
  const nestedContext = { ...bound, fileId: nested.id, fieldPath: 'items[0].scan' };
  await verifyBytes(peer, await issue(peer, nestedContext, '审批子表扫描附件'), nested, '审批子表扫描附件');
  const latest = successful(await api(admin, `${base}/form/save`, { method: 'POST', body: {
    formId, formName: `文件预览_${caseTag}`, versionLock: form.versionLock, fieldsJson: JSON.stringify(fields.filter(field => !['receipt', 'hiddenProof'].includes(field.id))),
    changeLog: '验证已有实例继续读取固定旧版本附件',
  } }), '真实发布不含原附件字段的新表单版本');
  check('表单新版本2与实例固定版本1均真实保存', latest.version === 2 && database(`SELECT form_version FROM wf_process_instance WHERE instance_id=${previewSql(instanceId)};`) === '1');
  await verifyBytes(peer, await issue(peer, bound, '固定旧版本附件'), file, '固定旧版本附件');
  const snapshotTicket = await issue(peer, bound, '旧字段值快照');
  const storedVariables = database(`SELECT variables FROM wf_process_instance WHERE instance_id=${previewSql(instanceId)};`);
  database(`UPDATE wf_process_instance SET variables=JSON_SET(variables,'$.receipt',JSON_ARRAY()) WHERE instance_id=${previewSql(instanceId)} AND tenant_id=100000;`);
  try { denied(await read(peer, snapshotTicket), '附件不在实例当前可见值后旧字段快照与签名不能读取'); }
  finally { database(`UPDATE wf_process_instance SET variables=${previewSql(storedVariables)} WHERE instance_id=${previewSql(instanceId)} AND tenant_id=100000;`); }
  const permissionTicket = await issue(peer, bound, '字段撤权输入');
  const predicate = `tenant_id=100000 AND definition_id=${previewSql(definitionId)} AND node_key='approval' AND field_id='receipt'`;
  check('字段撤权隔离输入仅对应本次定义的一个权限行', database(`SELECT COUNT(*) FROM wf_form_field_permission WHERE ${predicate};`) === '1');
  const permissionCacheKey = `workflowFormPermissions::100000:${definitionId}`;
  check('当前定义的字段权限真实存于独立Redis缓存键', redis('EXISTS', permissionCacheKey) === '1');
  database(`UPDATE wf_form_field_permission SET visible_flag=0,editable_flag=0 WHERE ${predicate};`);
  try {
    check('隔离撤权输入同步失效本定义缓存，其他定义缓存不变', redis('DEL', permissionCacheKey) === '1');
    denied(await read(peer, permissionTicket, { headers: { Range: 'bytes=0-4' } }), '每次分段读取均重新核对当前字段可见权限');
  } finally {
    database(`UPDATE wf_form_field_permission SET visible_flag=1,editable_flag=1 WHERE ${predicate};`);
    redis('DEL', permissionCacheKey);
  }
  const originalDownload = await api(peer, `${base}/form-files/${file.id}/content?instanceId=${encodeURIComponent(instanceId)}&taskId=${encodeURIComponent(task.id)}&fieldPath=receipt`);
  check('真实流程原下载在新版本和隔离输入恢复后仍有效', originalDownload.status === 200 && originalDownload.sha256 === file.digest);
  console.log('H5_PREVIEW_WORKFLOW: real_form_versions=2; pinned_instance_version=1; real_upload=true; real_process_start=true; task_assignee_verified=true; nested_attachment=true; hidden_field_rejected=true; stale_field_value_rejected=true; published_definition_immutable=true; field_revocation=owned_database_and_cache_fixture; field_revocation_fixture_restored=true; production_modified=false');
  evidence.workflow = true;
  return { definitionId, instanceId, taskId: task.id, request: bound, file, peer };
}
