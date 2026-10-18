import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

export const exitInterviewPermissions = ['hr:exit-interview:manage'];

// Draft resignation source and draft interview only; no workflow or employee exit.
export async function verifyExitInterviewCapacity({ tenantAdmin, api, successful, database, check, caseTag,
  state, targetId, applyLimit, usage, physicalSnapshot, evidence }) {
  const marker = `h5_interview_${caseTag}`;
  const prefix = `${caseTag}-interview-capacity-`;
  const sql = value => `CONVERT(0x${Buffer.from(String(value)).toString('hex')} USING utf8mb4)`;
  const files = () => database(`SELECT JSON_OBJECT('id',file_id,'name',file_name,'path',file_path,'size',file_size,
    'business',biz_type,'businessId',biz_id,'type',file_type,'url',url,'deleted',deleted) FROM sys_file
    WHERE tenant_id=${targetId} AND file_name LIKE ${sql(prefix + '%')} ORDER BY file_id;`)
    .split(/\r?\n/).filter(Boolean).map(row => JSON.parse(row));
  const beforeUsage = usage(); const beforeFiles = await physicalSnapshot();
  const ids = {}; let failure;
  const identifier = query => { const value = database(query); assert.match(value, /^[1-9][0-9]*$/); return value; };
  const bytes = phase => Buffer.from(`%PDF-1.4\n${marker}:${phase}\n%%EOF\n`);
  const detail = async () => successful(await api(tenantAdmin, `/hr/exit-interview/${ids.interview}`), '读取未确认的隔离面谈');
  const upload = async phase => {
    const current = await detail();
    return api(tenantAdmin, `/hr/exit-interview/${ids.interview}/attachments?version=${current.version}`, {
      method: 'POST', file: { name: `${prefix}${phase}.pdf`, type: 'application/pdf', content: bytes(phase).toString('base64') },
    });
  };
  const ownedPath = async file => {
    assert.equal(file.type, 'HR_EXIT_INTERVIEW'); assert.equal(file.business, 'HR_EXIT_INTERVIEW');
    assert.equal(file.businessId, ids.interview); assert.equal(file.deleted, 0); assert.ok(!file.url);
    const root = await fs.realpath(path.join(state.run, 'hr/private-files'));
    const target = await fs.realpath(file.path); assert.ok(target.startsWith(root + path.sep)); return target;
  };
  const download = async (phase, fileId) => {
    const response = await api(tenantAdmin, `/hr/exit-interview/${ids.interview}/attachments/${fileId}`);
    check(`${phase}面谈原附件经业务入口完整下载`, response.status === 200 && response.size === bytes('allowed').length
      && response.sha256 === createHash('sha256').update(bytes('allowed')).digest('hex')
      && /no-store/.test(response.cacheControl || '') && response.nosniff === 'nosniff');
  };
  assert.equal(files().length, 0);
  assert.equal(database(`SELECT COUNT(*) FROM hr_employee WHERE tenant_id=${targetId} AND employee_no=${sql(marker)};`), '0');
  try {
    const info = successful(await api(tenantAdmin, '/auth/info'), '读取面谈操作者身份');
    assert.ok(Number.isSafeInteger(info.user.userId) && info.user.userId > 0);
    const deptId = identifier(`SELECT department.dept_id FROM sys_user actor JOIN sys_dept department
      ON department.dept_id=actor.dept_id AND department.tenant_id=actor.tenant_id AND department.deleted=0
      WHERE actor.tenant_id=${targetId} AND actor.user_id=${info.user.userId} AND actor.deleted=0;`);
    database(`INSERT INTO hr_employee (tenant_id,employee_no,name,gender,dept_id,employee_status,hire_date,deleted,create_by)
      VALUES (${targetId},${sql(marker)},${sql(marker)},'UNKNOWN',${deptId},'REGULAR','2020-01-01',0,${sql(marker)});`);
    ids.employee = identifier(`SELECT id FROM hr_employee WHERE tenant_id=${targetId} AND employee_no=${sql(marker)} AND create_by=${sql(marker)};`);
    database(`INSERT INTO hr_lifecycle_application (tenant_id,application_no,type,employee_id,status,effective_date,create_by)
      VALUES (${targetId},${sql(marker)},'RESIGNATION',${ids.employee},'DRAFT','2026-10-01',${sql(marker)});`);
    ids.application = identifier(`SELECT id FROM hr_lifecycle_application WHERE tenant_id=${targetId} AND application_no=${sql(marker)} AND create_by=${sql(marker)};`);
    const interviewers = successful(await api(tenantAdmin, `/hr/exit-interview/interviewers?lifecycleApplicationId=${ids.application}`), '读取真实有资格的面谈人');
    assert.ok(interviewers.rows.some(item => Number(item.value) === info.user.userId), 'Current actor must be a qualified interviewer for the owned department');
    ids.interview = String(successful(await api(tenantAdmin, '/hr/exit-interview', { method: 'POST', body: {
      lifecycleApplicationId: ids.application, interviewerId: info.user.userId, interviewTime: '2026-10-01T10:00:00',
      location: marker, managerComment: marker, improvementItems: [], status: 'DRAFT',
    } }), '真实创建隔离面谈草稿'));
    assert.match(ids.interview, /^[1-9][0-9]*$/);
    await applyLimit(8);
    const uploaded = successful(await upload('allowed'), '离职面谈附件真实上传');
    const original = files().find(file => file.id === Number(uploaded.fileId)); assert.ok(original);
    check('面谈原文件真实绑定且计入租户容量', (await fs.readFile(await ownedPath(original))).equals(bytes('allowed'))
      && usage() === beforeUsage + original.size);
    await download('降额前', original.id);
    await applyLimit(1);
    const retained = JSON.stringify(files()); const retainedDraft = JSON.stringify(await detail());
    const retainedFiles = await physicalSnapshot();
    await new Promise(resolve => setTimeout(resolve, 5100));
    const rejected = await upload('denied');
    console.log(`H5_EXIT_INTERVIEW_CAPACITY: http=${rejected.status}; code=${rejected.body?.code}; capacity_message=${/存储空间不足/.test(rejected.body?.msg || '')}`);
    check('面谈新增附件超额明确拒绝', rejected.status === 409 && rejected.body?.code === 409 && /存储空间不足/.test(rejected.body?.msg || ''));
    check('面谈拒绝新增后原附件与草稿版本不变', retained === JSON.stringify(files()) && retainedDraft === JSON.stringify(await detail())
      && JSON.stringify(retainedFiles) === JSON.stringify(await physicalSnapshot()) && usage() === beforeUsage + original.size);
    await download('降额后', original.id);
    evidence.storageExitInterview = true;
  } catch (error) { failure = error; throw error; }
  finally {
    const failures = [];
    try {
      const owned = files(); const paths = await Promise.all(owned.map(ownedPath));
      if (ids.interview) {
        const draft = await detail(); assert.equal(draft.status, 'DRAFT'); assert.equal(draft.managerComment, marker);
        database(`DELETE FROM hr_exit_interview WHERE tenant_id=${targetId} AND interview_id=${ids.interview}
          AND lifecycle_application_id=${ids.application} AND employee_id=${ids.employee} AND status='DRAFT' AND manager_comment=${sql(marker)} AND settlement_id IS NULL;`);
        assert.equal(database(`SELECT COUNT(*) FROM hr_exit_interview WHERE interview_id=${ids.interview};`), '0');
      }
      for (let index = 0; index < owned.length; index++) {
        const file = owned[index];
        database(`DELETE FROM sys_file WHERE tenant_id=${targetId} AND file_id=${file.id} AND file_name=${sql(file.name)}
          AND biz_type='HR_EXIT_INTERVIEW' AND biz_id=${sql(ids.interview)};`);
        await fs.unlink(paths[index]);
      }
      if (ids.application) {
        assert.equal(database(`SELECT COUNT(*) FROM hr_exit_interview WHERE lifecycle_application_id=${ids.application};`), '0');
        database(`DELETE FROM hr_lifecycle_application WHERE tenant_id=${targetId} AND id=${ids.application}
          AND application_no=${sql(marker)} AND employee_id=${ids.employee} AND status='DRAFT' AND process_instance_id IS NULL AND create_by=${sql(marker)};`);
      }
      if (ids.employee) database(`DELETE FROM hr_employee WHERE tenant_id=${targetId} AND id=${ids.employee} AND employee_no=${sql(marker)} AND user_id IS NULL AND create_by=${sql(marker)};`);
    } catch (error) { failures.push(error); }
    try { await applyLimit(1); } catch (error) { failures.push(error); }
    if (failures.length) throw new AggregateError([...(failure ? [failure] : []), ...failures], '面谈容量测试清理不完整');
    check('隔离面谈及来源已清理且容量恢复', files().length === 0 && usage() === beforeUsage
      && JSON.stringify(beforeFiles) === JSON.stringify(await physicalSnapshot())
      && database(`SELECT COUNT(*) FROM hr_lifecycle_application WHERE tenant_id=${targetId} AND application_no=${sql(marker)};`) === '0'
      && database(`SELECT COUNT(*) FROM hr_employee WHERE tenant_id=${targetId} AND employee_no=${sql(marker)};`) === '0');
    evidence.storageExitInterviewCleanup = true;
  }
}
