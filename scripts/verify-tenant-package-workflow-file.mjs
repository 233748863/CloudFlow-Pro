import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

export const workflowFilePermissions = ['workflow:form:add', 'workflow:definition:add', 'workflow:definition:deploy',
  'workflow:definition:remove', 'workflow:process:start'];

export async function verifyWorkflowFileCapacity({ tenantAdmin, api, successful, database, check, caseTag,
  state, targetId, applyLimit, usage, physicalSnapshot, evidence, redis }) {
  const marker = `h5_capacity_${caseTag}`;
  const prefix = `${caseTag}-workflow-capacity-`;
  const base = '/workflow/wf';
  const sql = value => `CONVERT(0x${Buffer.from(String(value)).toString('hex')} USING utf8mb4)`;
  const files = () => database(`SELECT JSON_OBJECT('id',file_id,'name',file_name,'path',file_path,'size',file_size,
    'business',biz_type,'businessId',biz_id,'deleted',deleted) FROM sys_file WHERE tenant_id=${targetId}
    AND file_name LIKE ${sql(prefix + '%')} ORDER BY file_id;`).split(/\r?\n/).filter(Boolean).map(row => JSON.parse(row));
  const beforeUsage = usage();
  const beforeFiles = await physicalSnapshot();
  let formId;
  let definitionId;
  let failure;
  const bytes = phase => Buffer.from(`%PDF-1.4\n${marker}:${phase}\n`);
  const upload = phase => api(tenantAdmin, `${base}/form-files?definitionId=${definitionId}&fieldPath=receipt`, {
    method: 'POST', file: { name: `${prefix}${phase}.pdf`, type: 'application/pdf', content: bytes(phase).toString('base64') },
  });
  const ownedPath = async file => {
    assert.equal(file.business, 'WORKFLOW_FORM'); assert.equal(file.businessId, definitionId); assert.equal(file.deleted, 0);
    const root = await fs.realpath(path.join(state.run, 'profile'));
    const target = await fs.realpath(path.resolve(root, file.path.replace(/^\//, '')));
    assert.ok(target.startsWith(root + path.sep));
    return target;
  };
  assert.equal(files().length, 0);
  assert.equal(database(`SELECT COUNT(*) FROM wf_form_definition WHERE tenant_id=${targetId} AND form_key=${sql(marker)};`), '0');
  try {
    await applyLimit(8);
    const form = successful(await api(tenantAdmin, `${base}/form/save`, { method: 'POST', body: {
      formKey: marker, formName: marker, fieldsJson: JSON.stringify([{ id: 'receipt', type: 'UPLOAD_FILE', label: '附件', accept: '.pdf', maxSize: 10 }]),
    } }), '真实建立容量验收流程表单');
    formId = form.formId || form.id; assert.match(formId, /^[A-Za-z0-9_-]{1,64}$/);
    const definition = successful(await api(tenantAdmin, `${base}/definition/save`, { method: 'POST', body: {
      processKey: marker, processName: marker, formId, startPermissionType: 'ALL', startPermissionValue: '[]',
      modelJson: JSON.stringify({ nodes: [{ id: 'start', type: 'START', title: '发起' }, { id: 'end', type: 'END', title: '结束' }],
        edges: [{ source: 'start', target: 'end' }] }),
    } }), '真实建立只用于上传前置的流程定义');
    definitionId = definition.definitionId || definition.id; assert.match(definitionId, /^[A-Za-z0-9_-]{1,64}$/);
    successful(await api(tenantAdmin, `${base}/definition/deploy/${definitionId}`, { method: 'POST' }), '真实发布隔离附件流程定义');
    const uploaded = successful(await upload('allowed'), '流程字段经工作流到AUTH真实上传成功');
    const file = files().find(item => item.id === Number(uploaded.fileId)); assert.ok(file);
    check('流程上传字节和租户存储用量一致', (await fs.readFile(await ownedPath(file))).equals(bytes('allowed'))
      && usage() === beforeUsage + bytes('allowed').length);
    await applyLimit(1);
    const retained = JSON.stringify(files());
    const retainedFiles = await physicalSnapshot();
    const rejected = await upload('denied');
    console.log(`H5_WORKFLOW_FILE_CAPACITY: http=${rejected.status}; code=${rejected.body?.code}; capacity_message=${/存储空间不足/.test(rejected.body?.msg || '')}; real_workflow_auth=true`);
    check('流程附件拒绝新增后原记录和物理文件保留', retained === JSON.stringify(files())
      && JSON.stringify(retainedFiles) === JSON.stringify(await physicalSnapshot()) && usage() === beforeUsage + file.size);
    const downloaded = await api(tenantAdmin, `${base}/form-files/${file.id}/content?definitionId=${definitionId}&fieldPath=receipt`);
    check('流程发起阶段旧附件降额后仍可完整下载', downloaded.status === 200 && downloaded.size === file.size
      && downloaded.sha256 === createHash('sha256').update(bytes('allowed')).digest('hex')
      && /no-store/.test(downloaded.cacheControl || '') && downloaded.nosniff === 'nosniff');
    check('流程附件降额后明确返回容量不足409', rejected.status === 409 && rejected.body?.code === 409
      && /存储空间不足/.test(rejected.body?.msg || ''));
    evidence.storageWorkflowFile = true;
  } catch (error) { failure = error; throw error; }
  finally {
    const failures = [];
    let cleanupStage = 'owned-files';
    try {
      if (definitionId) {
        assert.equal(database(`SELECT COUNT(*) FROM wf_process_instance WHERE tenant_id=${targetId} AND definition_id=${sql(definitionId)};`), '0');
        for (const file of files()) {
          const target = await ownedPath(file);
          database(`DELETE FROM sys_file WHERE tenant_id=${targetId} AND file_id=${file.id} AND file_name=${sql(file.name)}
            AND biz_type='WORKFLOW_FORM' AND biz_id=${sql(definitionId)};`);
          await fs.unlink(target);
        }
        // The normal deletion endpoint deliberately rejects published definitions.
        // Retire only this owned, unused fixture before invoking normal deletion.
        assert.equal(database(`SELECT COUNT(*) FROM wf_process_definition WHERE tenant_id=${targetId}
          AND definition_id=${sql(definitionId)} AND process_key=${sql(marker)} AND form_id=${sql(formId)};`), '1');
        database(`UPDATE wf_process_definition SET status='ARCHIVED' WHERE tenant_id=${targetId}
          AND definition_id=${sql(definitionId)} AND process_key=${sql(marker)} AND status='PUBLISHED'
          AND NOT EXISTS (SELECT 1 FROM wf_process_instance WHERE tenant_id=${targetId} AND definition_id=${sql(definitionId)});`);
        successful(await api(tenantAdmin, `${base}/definition/${definitionId}`, { method: 'DELETE' }), '真实删除已退役且没有实例的隔离流程定义');
        cleanupStage = 'deleted-definition';
        // Normal deletion keeps a logical tombstone. Remove only this unused
        // fixture tombstone so its temporary form can be removed without references.
        assert.equal(database(`SELECT COUNT(*) FROM wf_process_definition WHERE tenant_id=${targetId}
          AND definition_id=${sql(definitionId)} AND process_key=${sql(marker)} AND form_id=${sql(formId)}
          AND deleted=1 AND status IN ('DRAFT','ARCHIVED');`), '1');
        assert.equal(database(`SELECT COUNT(*) FROM wf_process_instance WHERE definition_id=${sql(definitionId)};`), '0');
        assert.equal(database(`SELECT COUNT(*) FROM sys_file WHERE tenant_id=${targetId}
          AND biz_type='WORKFLOW_FORM' AND biz_id=${sql(definitionId)};`), '0');
        database(`START TRANSACTION;
          SET @fixture_ok=(SELECT COUNT(*)=1 FROM wf_process_definition WHERE tenant_id=${targetId}
            AND definition_id=${sql(definitionId)} AND process_key=${sql(marker)} AND form_id=${sql(formId)}
            AND deleted=1 AND status IN ('DRAFT','ARCHIVED'))
            AND NOT EXISTS (SELECT 1 FROM wf_process_instance WHERE definition_id=${sql(definitionId)})
            AND NOT EXISTS (SELECT 1 FROM sys_file WHERE tenant_id=${targetId} AND biz_type='WORKFLOW_FORM' AND biz_id=${sql(definitionId)});
          DELETE FROM wf_form_field_permission WHERE @fixture_ok AND tenant_id=${targetId} AND definition_id=${sql(definitionId)};
          DELETE FROM wf_process_definition WHERE @fixture_ok AND tenant_id=${targetId}
            AND definition_id=${sql(definitionId)} AND process_key=${sql(marker)} AND form_id=${sql(formId)} AND deleted=1;
          COMMIT;`);
        assert.equal(database(`SELECT COUNT(*) FROM wf_process_definition WHERE definition_id=${sql(definitionId)};`), '0');
        cleanupStage = 'owned-cache';
        redis('DEL', `workflowFormPermissions::${targetId}:${definitionId}`);
        assert.equal(redis('EXISTS', `workflowFormPermissions::${targetId}:${definitionId}`), '0');
      }
      if (formId) {
        cleanupStage = 'unreferenced-form';
        assert.equal(database(`SELECT COUNT(*) FROM wf_process_definition WHERE form_id=${sql(formId)};`), '0');
        database(`DELETE FROM wf_form_definition WHERE tenant_id=${targetId} AND form_id=${sql(formId)} AND form_key=${sql(marker)};`);
      }
    } catch (error) {
      console.log(`H5_WORKFLOW_FILE_CLEANUP_FAILED: stage=${cleanupStage}; raw_error_withheld=true`);
      failures.push(error);
    }
    try { await applyLimit(1); } catch (error) { failures.push(error); }
    if (failures.length) throw new AggregateError([...(failure ? [failure] : []), ...failures], '流程附件容量验证清理不完整');
    check('流程附件和隔离定义表单已清理且未发起实例', files().length === 0 && usage() === beforeUsage
      && JSON.stringify(beforeFiles) === JSON.stringify(await physicalSnapshot())
      && database(`SELECT COUNT(*) FROM wf_process_definition WHERE tenant_id=${targetId} AND process_key=${sql(marker)};`) === '0'
      && database(`SELECT COUNT(*) FROM wf_form_definition WHERE tenant_id=${targetId} AND form_key=${sql(marker)};`) === '0');
    evidence.storageWorkflowFileCleanup = true;
  }
}
