import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

export const trainingAgreementPermissions = ['hr:training-recovery:manage'];

// Owned training source fixtures and an unconfirmed zero-amount draft only.
export async function verifyTrainingAgreementCapacity({ tenantAdmin, api, successful, database, check, caseTag,
  state, targetId, applyLimit, usage, physicalSnapshot, evidence }) {
  const marker = `h5_training_${caseTag}`;
  const prefix = `${caseTag}-training-capacity-`;
  const sql = value => `CONVERT(0x${Buffer.from(String(value)).toString('hex')} USING utf8mb4)`;
  const rows = query => database(query).split(/\r?\n/).filter(Boolean).map(row => JSON.parse(row));
  const files = () => rows(`SELECT JSON_OBJECT('id',file_id,'name',file_name,'path',file_path,'size',file_size,
    'business',biz_type,'businessId',biz_id,'type',file_type,'url',url,'deleted',deleted) FROM sys_file
    WHERE tenant_id=${targetId} AND file_name LIKE ${sql(prefix + '%')} ORDER BY file_id;`);
  const beforeUsage = usage();
  const beforeFiles = await physicalSnapshot();
  const identifiers = {};
  let failure;
  const bytes = phase => Buffer.from(`%PDF-1.4\n${marker}:${phase}\n%%EOF\n`);
  const identifier = query => {
    const value = database(query); assert.match(value, /^[1-9][0-9]*$/); return value;
  };
  const upload = phase => api(tenantAdmin, `/hr/training-recovery/agreements?enrollmentId=${identifiers.enrollment}`, {
    method: 'POST', file: { name: `${prefix}${phase}.pdf`, type: 'application/pdf', content: bytes(phase).toString('base64') },
  });
  const ownedPath = async file => {
    assert.equal(file.type, 'HR_TRAINING_AGREEMENT'); assert.equal(file.deleted, 0); assert.ok(!file.url);
    assert.ok((file.business === 'HR_TRAINING_AGREEMENT' && file.businessId === identifiers.enrollment)
      || (file.business === 'HR_TRAINING_RECOVERY' && file.businessId === identifiers.recovery));
    const root = await fs.realpath(path.join(state.run, 'hr/private-files'));
    const target = await fs.realpath(file.path); assert.ok(target.startsWith(root + path.sep)); return target;
  };
  const detail = async () => successful(await api(tenantAdmin, `/hr/training-recovery/${identifiers.recovery}`), '读取本轮未核定培训草稿');
  const download = async phase => {
    const response = await api(tenantAdmin, `/hr/training-recovery/${identifiers.recovery}/agreement`);
    check(`${phase}培训协议经业务入口完整下载`, response.status === 200 && response.size === bytes('allowed').length
      && response.sha256 === createHash('sha256').update(bytes('allowed')).digest('hex')
      && /no-store/.test(response.cacheControl || '') && response.nosniff === 'nosniff');
  };
  assert.equal(files().length, 0);
  assert.equal(database(`SELECT COUNT(*) FROM hr_employee WHERE tenant_id=${targetId} AND employee_no=${sql(marker)};`), '0');
  try {
    database(`INSERT INTO hr_employee (tenant_id,employee_no,name,gender,employee_status,hire_date,deleted,create_by)
      VALUES (${targetId},${sql(marker)},${sql(marker)},'UNKNOWN','REGULAR','2020-01-01',0,${sql(marker)});`);
    identifiers.employee = identifier(`SELECT id FROM hr_employee WHERE tenant_id=${targetId} AND employee_no=${sql(marker)} AND create_by=${sql(marker)};`);
    database(`INSERT INTO hr_training_course (tenant_id,course_code,course_name,status,create_by)
      VALUES (${targetId},${sql(marker)},${sql(marker)},'PUBLISHED',${sql(marker)});`);
    identifiers.course = identifier(`SELECT id FROM hr_training_course WHERE tenant_id=${targetId} AND course_code=${sql(marker)} AND create_by=${sql(marker)};`);
    database(`INSERT INTO hr_training_session (tenant_id,course_id,session_no,start_time,end_time,status,create_by)
      VALUES (${targetId},${identifiers.course},${sql(marker)},'2026-01-01 09:00:00','2026-01-02 18:00:00','COMPLETED',${sql(marker)});`);
    identifiers.session = identifier(`SELECT id FROM hr_training_session WHERE tenant_id=${targetId} AND session_no=${sql(marker)} AND create_by=${sql(marker)};`);
    database(`INSERT INTO hr_training_enrollment (tenant_id,session_id,employee_id,status,completion_status,create_by)
      VALUES (${targetId},${identifiers.session},${identifiers.employee},'APPROVED','PASSED',${sql(marker)});`);
    identifiers.enrollment = identifier(`SELECT id FROM hr_training_enrollment WHERE tenant_id=${targetId}
      AND session_id=${identifiers.session} AND employee_id=${identifiers.employee} AND create_by=${sql(marker)};`);
    await applyLimit(8);
    const uploaded = successful(await upload('allowed'), '培训协议真实上传');
    identifiers.recovery = String(successful(await api(tenantAdmin, '/hr/training-recovery', { method: 'POST', body: {
      enrollmentId: identifiers.enrollment, agreementFileId: uploaded.fileId, assessedAmount: '0.00', assessmentReason: marker,
    } }), '真实建立未核定的零额培训草稿'));
    assert.match(identifiers.recovery, /^[1-9][0-9]*$/);
    const original = files().find(file => file.id === Number(uploaded.fileId)); assert.ok(original);
    check('培训协议绑定草稿并完整计入租户容量', (await fs.readFile(await ownedPath(original))).equals(bytes('allowed'))
      && usage() === beforeUsage + original.size && original.business === 'HR_TRAINING_RECOVERY');
    await download('降额前');
    await applyLimit(1);
    const retained = JSON.stringify(files()); const retainedDraft = JSON.stringify(await detail());
    const retainedFiles = await physicalSnapshot();
    await new Promise(resolve => setTimeout(resolve, 5100));
    const rejected = await upload('denied');
    console.log(`H5_TRAINING_AGREEMENT_CAPACITY: http=${rejected.status}; code=${rejected.body?.code}; capacity_message=${/存储空间不足/.test(rejected.body?.msg || '')}`);
    check('培训协议降额明确拒绝新增', rejected.status === 409 && rejected.body?.code === 409 && /存储空间不足/.test(rejected.body?.msg || ''));
    check('培训新增拒绝后保留原文件和未核定草稿', retained === JSON.stringify(files()) && retainedDraft === JSON.stringify(await detail())
      && JSON.stringify(retainedFiles) === JSON.stringify(await physicalSnapshot()) && usage() === beforeUsage + original.size);
    await download('降额后');
    evidence.storageTrainingAgreement = true;
  } catch (error) { failure = error; throw error; }
  finally {
    const failures = [];
    try {
      const ownedFiles = files(); const paths = await Promise.all(ownedFiles.map(ownedPath));
      if (identifiers.recovery) {
        const draft = await detail();
        assert.equal(draft.status, 'DRAFT'); assert.equal(draft.confirmedBy, null);
        assert.equal(draft.assessmentReason, marker); assert.equal(Number(draft.collectedAmount), 0);
        database(`DELETE FROM hr_training_recovery WHERE tenant_id=${targetId} AND recovery_id=${identifiers.recovery}
          AND enrollment_id=${identifiers.enrollment} AND assessment_reason=${sql(marker)} AND status='DRAFT'
          AND confirmed_by IS NULL AND settlement_id IS NULL AND collected_amount=0;`);
        assert.equal(database(`SELECT COUNT(*) FROM hr_training_recovery WHERE recovery_id=${identifiers.recovery};`), '0');
      }
      for (let index = 0; index < ownedFiles.length; index++) {
        const file = ownedFiles[index];
        database(`DELETE FROM sys_file WHERE tenant_id=${targetId} AND file_id=${file.id} AND file_name=${sql(file.name)}
          AND biz_type=${sql(file.business)} AND biz_id=${sql(file.businessId)};`);
        await fs.unlink(paths[index]);
      }
      if (identifiers.enrollment) {
        assert.equal(database(`SELECT COUNT(*) FROM hr_training_recovery WHERE enrollment_id=${identifiers.enrollment};`), '0');
        database(`DELETE FROM hr_training_enrollment WHERE tenant_id=${targetId} AND id=${identifiers.enrollment}
          AND session_id=${identifiers.session} AND employee_id=${identifiers.employee} AND create_by=${sql(marker)};`);
      }
      if (identifiers.session) database(`DELETE FROM hr_training_session WHERE tenant_id=${targetId} AND id=${identifiers.session} AND course_id=${identifiers.course} AND create_by=${sql(marker)};`);
      if (identifiers.course) database(`DELETE FROM hr_training_course WHERE tenant_id=${targetId} AND id=${identifiers.course} AND course_code=${sql(marker)} AND create_by=${sql(marker)};`);
      if (identifiers.employee) database(`DELETE FROM hr_employee WHERE tenant_id=${targetId} AND id=${identifiers.employee} AND employee_no=${sql(marker)} AND user_id IS NULL AND create_by=${sql(marker)};`);
    } catch (error) { failures.push(error); }
    try { await applyLimit(1); } catch (error) { failures.push(error); }
    if (failures.length) throw new AggregateError([...(failure ? [failure] : []), ...failures], '培训协议容量测试清理不完整');
    check('培训隔离来源和附件已清理且原容量恢复', files().length === 0 && usage() === beforeUsage
      && JSON.stringify(beforeFiles) === JSON.stringify(await physicalSnapshot())
      && database(`SELECT COUNT(*) FROM hr_employee WHERE tenant_id=${targetId} AND employee_no=${sql(marker)};`) === '0'
      && database(`SELECT COUNT(*) FROM hr_training_course WHERE tenant_id=${targetId} AND course_code=${sql(marker)};`) === '0');
    evidence.storageTrainingAgreementCleanup = true;
  }
}
