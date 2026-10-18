import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { verifyTrainingRecoveryInterface } from './verify-hr-training-recovery-ui.mjs';

export async function verifyHrTrainingRecovery(context) {
  const { admin, api, successful, session, database, check, caseTag, evidence } = context;
  const root = '/hr/training-recovery';
  const marker = `training_${caseTag}`;
  const literal = value => `CONVERT(UNHEX('${Buffer.from(String(value)).toString('hex')}') USING utf8mb4)`;
  const grants = database("SELECT CONCAT(tenant_id,':',role_id,':',menu_id) FROM sys_role_menu ORDER BY tenant_id,role_id,menu_id;");
  const people = [];
  let courseId; let sessionId; let enrollmentId;
  const createPerson = (suffix, roleId) => {
    const username = `${marker}_${suffix}`;
    database(`INSERT INTO sys_user (tenant_id,dept_id,user_name,nick_name,password,status,deleted,pwd_reset_required,create_by)
      SELECT 100000,100,${literal(username)},${literal(username)},password,'0',0,'0',${literal(marker)} FROM sys_user WHERE tenant_id=100000 AND user_name='g_holiday_employee';`);
    const userId = database(`SELECT user_id FROM sys_user WHERE tenant_id=100000 AND user_name=${literal(username)};`);
    assert.match(userId, /^[1-9]\d*$/); const person = { username, userId }; people.push(person);
    database(`INSERT INTO sys_user_role (tenant_id,user_id,role_id) VALUES (100000,${userId},${roleId});
      INSERT INTO hr_employee (tenant_id,employee_no,name,gender,dept_id,employee_status,hire_date,user_id,deleted,create_by)
      VALUES (100000,${literal(username)},${literal(username)},'UNKNOWN',100,'REGULAR','2020-01-01',${userId},0,${literal(marker)});`);
    person.employeeId = database(`SELECT id FROM hr_employee WHERE tenant_id=100000 AND user_id=${userId};`);
    assert.match(person.employeeId, /^[1-9]\d*$/); return person;
  };
  const rejected = (result, label) => check(`${label} HTTP=${result.status}`, [400, 401, 403, 404, 409, 422].includes(result.status) && result.body?.code !== 200);
  const detail = async identifier => {
    const response = await api(admin, `${root}/${identifier}`);
    assert.equal(response.cacheControl, 'no-store', '培训追偿正文禁止缓存');
    return successful(response, '读取培训追偿');
  };
  try {
    const person = createPerson('subject', 1); const peerPerson = createPerson('peer', 5);
    const subject = await session(person.username, 'g_holiday_employee'); const peer = await session(peerPerson.username, 'g_holiday_employee');
    database(`INSERT INTO hr_training_course (tenant_id,course_code,course_name,status,create_by) VALUES (100000,${literal(marker)},${literal(marker)},'PUBLISHED',${literal(marker)});`);
    courseId = database(`SELECT id FROM hr_training_course WHERE tenant_id=100000 AND course_code=${literal(marker)};`); assert.match(courseId, /^[1-9]\d*$/);
    database(`INSERT INTO hr_training_session (tenant_id,course_id,session_no,start_time,end_time,status,create_by)
      VALUES (100000,${courseId},${literal(marker)},'2026-01-01 09:00:00','2026-01-02 18:00:00','COMPLETED',${literal(marker)});`);
    sessionId = database(`SELECT id FROM hr_training_session WHERE tenant_id=100000 AND session_no=${literal(marker)};`); assert.match(sessionId, /^[1-9]\d*$/);
    database(`INSERT INTO hr_training_enrollment (tenant_id,session_id,employee_id,status,completion_status,create_by)
      VALUES (100000,${sessionId},${person.employeeId},'APPROVED','PASSED',${literal(marker)});`);
    enrollmentId = database(`SELECT id FROM hr_training_enrollment WHERE tenant_id=100000 AND session_id=${sessionId} AND employee_id=${person.employeeId};`); assert.match(enrollmentId, /^[1-9]\d*$/);
    const options = successful(await api(admin, `${root}/enrollments?keyword=${person.username}`), '按姓名查询真实培训报名');
    check('核定来源显示真实员工和培训课程名称', options.rows.some(option => String(option.value) === enrollmentId && option.label.includes(person.username) && option.label.includes(marker)));
    const pdf = Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n');
    const file = { name: `${marker}.pdf`, content: pdf.toString('base64'), type: 'application/pdf' };
    rejected(await api(subject, `${root}/agreements?enrollmentId=${enrollmentId}`, { method: 'POST', file }), '具有管理员角色的培训对象不能为本人建立追偿');
    rejected(await api(peer, `${root}/agreements?enrollmentId=${enrollmentId}`, { method: 'POST', file }), '普通员工不能上传追偿协议');
    const upload = successful(await api(admin, `${root}/agreements?enrollmentId=${enrollmentId}`, { method: 'POST', file }), '上传实际私有培训协议');
    const fileId = String(upload.fileId); assert.match(fileId, /^[1-9]\d*$/);
    check('协议与实际报名绑定且没有公共地址', database(`SELECT COUNT(*) FROM sys_file WHERE tenant_id=100000 AND file_id=${fileId} AND file_type='HR_TRAINING_AGREEMENT' AND biz_type='HR_TRAINING_AGREEMENT' AND biz_id=${enrollmentId} AND url='';`) === '1');
    const storedPath = database(`SELECT file_path FROM sys_file WHERE tenant_id=100000 AND file_id=${fileId};`);
    for (const endpoint of [`/auth/system/file/${fileId}/content`, `/auth/system/file/access?path=${encodeURIComponent(storedPath)}`]) {
      const response = await api(admin, endpoint);
      check('实际AUTH通用入口拒绝培训协议', response.status === 403 && response.body?.code !== 200);
    }
    await new Promise(resolve => setTimeout(resolve, 5500));
    const replayUpload = successful(await api(admin, `${root}/agreements?enrollmentId=${enrollmentId}`, { method: 'POST', file }), '重复上传结果核对');
    check('上传响应丢失后相同协议重试复用原文件', String(replayUpload.fileId) === fileId);
    const input = { enrollmentId, agreementFileId: fileId, assessedAmount: '123.45', assessmentReason: `${marker}_reason` };
    for (const additional of [{ tenantId: 100001 }, { employeeId: peerPerson.employeeId }, { status: 'CONFIRMED' }, { collectedAmount: '123.45' }]) {
      rejected(await api(admin, root, { method: 'POST', body: { ...input, ...additional } }), '浏览器不能指定租户、对象、已核定或已收款结果');
    }
    rejected(await api(admin, root, { method: 'POST', body: { ...input, assessedAmount: '0.001' } }), '不足一分的核定金额明确拒绝');
    const identifier = String(successful(await api(admin, root, { method: 'POST', body: input }), '保存真实追偿核定草稿'));
    let current = await detail(identifier);
    check('草稿金额完整保留且没有自动确认或收款', String(current.employeeId) === person.employeeId && current.assessedAmount === '123.45' && current.collectedAmount === '0.00' && current.status === 'DRAFT' && current.confirmedBy === null && current.settlementId === null);
    rejected(await api(subject, `${root}/${identifier}`), '培训对象即使是管理员也不能查看本人内部追偿核定');
    rejected(await api(peer, `${root}/${identifier}`), '普通员工不能查看内部追偿核定');
    const ownList = successful(await api(subject, `${root}/list?employeeId=${person.employeeId}`), '本人回避列表');
    check('管理员角色的培训对象列表不泄露本人核定', ownList.total === 0 && ownList.rows.length === 0);
    const download = await api(admin, `${root}/${identifier}/agreement`);
    check('从核定单下载协议字节完整且禁止缓存', download.status === 200 && download.sha256 === createHash('sha256').update(pdf).digest('hex') && download.cacheControl?.split(',').every(value => value.trim() === 'no-store') && download.nosniff === 'nosniff');
    await new Promise(resolve => setTimeout(resolve, 5500));
    const replay = String(successful(await api(admin, root, { method: 'POST', body: input }), '创建响应丢失后核对原结果'));
    check('创建重试返回原核定编号且不会重复追偿', replay === identifier && database(`SELECT COUNT(*) FROM hr_training_recovery WHERE tenant_id=100000 AND agreement_file_id=${fileId};`) === '1');
    rejected(await api(admin, `${root}/agreements?enrollmentId=${enrollmentId}`, { method: 'POST', file: { ...file, name: `${marker}_renamed.pdf` } }), '同一协议改文件名不能重复追偿');
    database(`UPDATE hr_training_recovery SET tenant_id=200001 WHERE tenant_id=100000 AND recovery_id=${identifier};`);
    try { rejected(await api(admin, `${root}/${identifier}`), '跨租户核定读取被拒绝'); }
    finally { database(`UPDATE hr_training_recovery SET tenant_id=100000 WHERE tenant_id=200001 AND recovery_id=${identifier};`); }
    const updates = await Promise.all(['120.00', '110.00'].map(amount => api(admin, `${root}/${identifier}`, { method: 'PUT', body: { assessedAmount: amount, assessmentReason: `${marker}_updated`, version: 0 } })));
    check('同版本并发修改只有一次提交', updates.filter(result => result.status === 200 && result.body?.code === 200).length === 1 && (await detail(identifier)).version === 1);
    database(`UPDATE hr_training_enrollment SET status='WITHDRAWN' WHERE tenant_id=100000 AND id=${enrollmentId};`);
    try { rejected(await api(admin, `${root}/${identifier}/confirm`, { method: 'POST', body: { version: 1 } }), '已撤回报名阻止核定'); }
    finally { database(`UPDATE hr_training_enrollment SET status='APPROVED' WHERE tenant_id=100000 AND id=${enrollmentId};`); }
    await new Promise(resolve => setTimeout(resolve, 5500));
    successful(await api(admin, `${root}/${identifier}/confirm`, { method: 'POST', body: { version: 1 } }), '真实核定培训追偿');
    current = await detail(identifier);
    check('核定保留实际核定人且未收款、未占用结算', current.status === 'CONFIRMED' && current.confirmedBy !== null && current.confirmedTime !== null && current.collectedAmount === '0.00' && current.settlementId === null);
    rejected(await api(admin, `${root}/${identifier}`, { method: 'PUT', body: { assessedAmount: '1.00', assessmentReason: '确认后改金额', version: 2 } }), '已核定金额禁止改写');
    check('核定审计不记录协议核定原因正文', database(`SELECT COUNT(*) FROM hr_audit_log WHERE business_domain='HR_TRAINING_RECOVERY' AND business_id=${identifier} AND after_data LIKE ${literal(`%${marker}_reason%`)};`) === '0');
    evidence.http = true;
    if (process.argv.includes('--hr-training-recovery-complete')) {
      const hr = await session('g_holiday_hr');
      await verifyTrainingRecoveryInterface({ ...context, hr, peer, subject, person, enrollmentId });
    }
  } finally {
    if (enrollmentId) {
      database(`UPDATE sys_file SET deleted=1 WHERE tenant_id=100000 AND file_type='HR_TRAINING_AGREEMENT' AND
        (biz_type='HR_TRAINING_AGREEMENT' AND biz_id=${enrollmentId} OR biz_type='HR_TRAINING_RECOVERY' AND biz_id IN
        (SELECT recovery_id FROM hr_training_recovery WHERE tenant_id=100000 AND enrollment_id=${enrollmentId}));
        DELETE FROM hr_training_recovery WHERE tenant_id=100000 AND enrollment_id=${enrollmentId};
        DELETE FROM hr_training_enrollment WHERE tenant_id=100000 AND id=${enrollmentId} AND create_by=${literal(marker)};`);
    }
    if (sessionId) database(`DELETE FROM hr_training_session WHERE tenant_id=100000 AND id=${sessionId} AND create_by=${literal(marker)};`);
    if (courseId) database(`DELETE FROM hr_training_course WHERE tenant_id=100000 AND id=${courseId} AND create_by=${literal(marker)};`);
    for (const person of people) database(`DELETE FROM hr_employee WHERE tenant_id=100000 AND user_id=${person.userId} AND create_by=${literal(marker)};
      DELETE FROM sys_user_role WHERE tenant_id=100000 AND user_id=${person.userId}; DELETE FROM sys_user WHERE tenant_id=100000 AND user_id=${person.userId} AND create_by=${literal(marker)};`);
    check('追偿核验结束后既有角色菜单授权不变', grants === database("SELECT CONCAT(tenant_id,':',role_id,':',menu_id) FROM sys_role_menu ORDER BY tenant_id,role_id,menu_id;"));
  }
}
