import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { verifyExitInterviewInterface } from './verify-hr-exit-interviews-ui.mjs';

export async function verifyHrExitInterviews(context) {
  const { admin, api, successful, session: openSession, database, check, caseTag, directory, evidence } = context;
  const root = '/hr/exit-interview';
  const marker = `exit_${caseTag}`;
  const sensitive = new Set([`${marker}_private`, `ui_private_${caseTag}`, `ui_lost_${caseTag}`]);
  const remember = async page => {
    const token = await page.evaluate(async () => (await import('/src/utils/authStorage.ts')).getAuthToken());
    assert.ok(token); sensitive.add(token.replace(/^Bearer /, ''));
    writeFileSync(path.join(directory, 'private', `exit-interview-secrets-${caseTag}.json`), JSON.stringify([...sensitive]), { mode: 0o600 });
    return page;
  };
  const session = async (...args) => remember(await openSession(...args));
  await remember(admin);
  const literal = value => `CONVERT(UNHEX('${Buffer.from(String(value)).toString('hex')}') USING utf8mb4)`;
  const grants = database("SELECT CONCAT(tenant_id,':',role_id,':',menu_id) FROM sys_role_menu ORDER BY tenant_id,role_id,menu_id;");
  const menus = database('SELECT menu_id FROM sys_menu ORDER BY menu_id;');
  const people = []; const interviews = []; const files = [];
  let applicationId;
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
    assert.equal(response.cacheControl, 'no-store', '内部面谈正文禁止缓存');
    return successful(response, '读取真实面谈');
  };
  try {
    const person = createPerson('subject', 1); const peerPerson = createPerson('peer', 5);
    const subject = await session(person.username, 'g_holiday_employee'); const peer = await session(peerPerson.username, 'g_holiday_employee');
    const adminId = await admin.evaluate(async () => String((await (await import('/src/services/api/auth.ts')).getInfo()).userId));
    assert.match(adminId, /^[1-9]\d*$/);
    database(`INSERT INTO hr_lifecycle_application (tenant_id,application_no,type,employee_id,status,effective_date,create_by)
      VALUES (100000,${literal(marker)},'RESIGNATION',${person.employeeId},'APPROVED','2026-09-30',${literal(marker)});`);
    applicationId = database(`SELECT id FROM hr_lifecycle_application WHERE tenant_id=100000 AND application_no=${literal(marker)};`);
    assert.match(applicationId, /^[1-9]\d*$/);
    const sources = successful(await api(admin, `${root}/applications?keyword=${person.username}`), '按员工姓名查询离职申请');
    check('离职申请下拉来自真实员工且可按姓名检索', sources.rows.some(option => String(option.value) === applicationId && option.label.includes(person.username)));
    const interviewers = successful(await api(admin, `${root}/interviewers?lifecycleApplicationId=${applicationId}`), '查询有权限的面谈人');
    check('面谈人列表包含授权管理员并排除离职对象', interviewers.rows.some(option => String(option.value) === adminId) && interviewers.rows.every(option => String(option.value) !== person.userId));
    const input = { lifecycleApplicationId: applicationId, interviewerId: adminId, interviewTime: '2026-09-01T10:00:00', location: `${marker}_room`,
      leavingReason: '隔离核验离职原因', employeeFeedback: '隔离核验员工反馈', managerComment: `${marker}_private`, improvementItems: ['交接安排'], status: 'DRAFT' };
    const identifier = String(successful(await api(admin, root, { method: 'POST', body: input }), '实际保存离职面谈')); interviews.push(identifier);
    let current = await detail(identifier);
    check('面谈从真实离职申请取得员工并完整保存意见', String(current.employeeId) === person.employeeId && current.managerComment === input.managerComment && current.version === 0);
    const list = successful(await api(admin, `${root}/list?employeeId=${person.employeeId}`), '实际查询面谈列表');
    check('授权列表包含本次面谈', list.rows.some(row => String(row.interviewId) === identifier));
    rejected(await api(peer, `${root}/${identifier}`), '普通员工不能读取内部面谈');
    rejected(await api(subject, `${root}/${identifier}`), '离职对象即使有管理员角色也不能读取本人内部意见');
    const ownList = successful(await api(subject, `${root}/list?employeeId=${person.employeeId}`), '本人回避列表');
    check('有管理员角色的离职对象列表不泄露本人面谈', ownList.total === 0 && ownList.rows.length === 0);
    rejected(await api(admin, root, { method: 'POST', body: { ...input, tenantId: 100001 } }), '浏览器不能指定租户');
    rejected(await api(admin, root, { method: 'POST', body: { ...input, location: `${marker}_bad_interviewer`, interviewerId: person.userId } }), '离职对象不能担任自己的面谈人');
    successful(await api(admin, `${root}/${identifier}`, { method: 'PUT', body: { ...input, location: null, managerComment: null, version: 0 } }), '实际清空面谈可选字段');
    current = await detail(identifier);
    check('清空地点与内部意见实际落库', current.location === null && current.managerComment === null && current.version === 1);
    rejected(await api(admin, `${root}/${identifier}`, { method: 'PUT', body: { ...input, location: '过期写入', version: 0 } }), '旧版本不能覆盖面谈');
    const pdf = Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n');
    const file = { name: `${marker}.pdf`, content: pdf.toString('base64'), type: 'application/pdf' };
    const upload = successful(await api(admin, `${root}/${identifier}/attachments?version=1`, { method: 'POST', file }), '实际上传私有面谈附件');
    const fileId = String(upload.fileId); assert.match(fileId, /^[1-9]\d*$/); files.push(fileId);
    check('面谈上传与版本更新同时生效', upload.version === 2 && (await detail(identifier)).attachmentFileIds.map(String).includes(fileId));
    check('私有附件没有公共地址且精确绑定面谈', database(`SELECT COUNT(*) FROM sys_file WHERE tenant_id=100000 AND file_id=${fileId} AND file_type='HR_EXIT_INTERVIEW' AND biz_type='HR_EXIT_INTERVIEW' AND biz_id=${identifier} AND url='';`) === '1');
    const download = await api(admin, `${root}/${identifier}/attachments/${fileId}`);
    console.log(`H2_EXIT_DOWNLOAD_HEADERS: status=${download.status}; bytes_match=${download.sha256 === createHash('sha256').update(pdf).digest('hex')}; cache=${download.cacheControl}; nosniff=${download.nosniff}`);
    check('实际下载内容与上传一致且禁止缓存和内容嗅探', download.status === 200 && download.sha256 === createHash('sha256').update(pdf).digest('hex') && download.cacheControl?.split(',').map(value => value.trim()).every(value => value === 'no-store') && download.nosniff === 'nosniff');
    rejected(await api(subject, `${root}/${identifier}/attachments/${fileId}`), '离职对象不能下载本人内部附件');
    rejected(await api(peer, `${root}/${identifier}/attachments/${fileId}`), '普通员工不能下载内部附件');
    const genericFile = await api(admin, `/auth/system/file/${fileId}/content`);
    check('通用文件编号入口明确禁止读取面谈附件', genericFile.status === 403 && genericFile.body?.code !== 200);
    const storedPath = database(`SELECT file_path FROM sys_file WHERE tenant_id=100000 AND file_id=${fileId};`);
    const pathAccess = await api(admin, `/auth/system/file/access?path=${encodeURIComponent(storedPath)}`);
    check('通用文件路径入口拒绝面谈附件', [400, 403].includes(pathAccess.status) && pathAccess.body?.code !== 200);
    const ordinary = successful(await api(admin, '/auth/system/file/upload', { method: 'POST', file }), '通用附件正常上传');
    const ordinaryId = String(ordinary.fileId); assert.match(ordinaryId, /^[1-9]\d*$/); files.push(ordinaryId);
    try {
      const ordinaryPath = database(`SELECT file_path FROM sys_file WHERE tenant_id=100000 AND file_id=${ordinaryId};`);
      for (const endpoint of [`/auth/system/file/${ordinaryId}/content`, `/auth/system/file/access?path=${encodeURIComponent(ordinaryPath)}`]) {
        const ordinaryDownload = await api(admin, endpoint);
        check('通用附件仍可按编号或路径正常读取', ordinaryDownload.status === 200 && ordinaryDownload.sha256 === download.sha256);
      }
      const missing = await api(admin, `/auth/system/file/access?path=${encodeURIComponent(`${marker}_missing.pdf`)}`);
      check('通用入口不存在的路径明确拒绝且不返回内部错误', missing.status === 403 && missing.body?.code !== 200);
    } finally { database(`UPDATE sys_file SET deleted=1 WHERE tenant_id=100000 AND file_id=${ordinaryId} AND file_name=${literal(file.name)};`); }
    const secondId = String(successful(await api(admin, root, { method: 'POST', body: { ...input, location: `${marker}_second` } }), '实际保存第二份面谈')); interviews.push(secondId);
    rejected(await api(admin, `${root}/${secondId}/attachments/${fileId}`), '不能通过另一份面谈读取附件');
    rejected(await api(admin, `${root}/${secondId}`, { method: 'PUT', body: { ...input, attachmentFileIds: [fileId], version: 0 } }), '不能把其他面谈附件绑定到新面谈');
    database(`UPDATE hr_exit_interview SET tenant_id=200001 WHERE tenant_id=100000 AND interview_id=${secondId};`);
    try { rejected(await api(admin, `${root}/${secondId}`), '实际跨租户面谈读取被拒绝'); }
    finally { database(`UPDATE hr_exit_interview SET tenant_id=100000 WHERE tenant_id=200001 AND interview_id=${secondId};`); }
    const racers = await Promise.all(['甲', '乙'].map(suffix => api(admin, `${root}/${secondId}`, { method: 'PUT', body: { ...input, location: `并发${suffix}`, version: 0 } })));
    check('同版本并发修改只有一次成功', racers.filter(result => result.status === 200 && result.body?.code === 200).length === 1 && (await detail(secondId)).version === 1);
    successful(await api(admin, `${root}/${identifier}`, { method: 'PUT', body: { ...input, status: 'CONFIRMED', version: 2 } }), '实际确认面谈');
    rejected(await api(admin, `${root}/${identifier}`, { method: 'PUT', body: { ...input, location: '确认后改写', version: 3 } }), '已确认意见不可改写');
    rejected(await api(admin, `${root}/${identifier}/attachments?version=3`, { method: 'POST', file }), '已确认附件不可改写');
    check('确认后原意见与附件保持', (await detail(identifier)).status === 'CONFIRMED' && (await api(admin, `${root}/${identifier}/attachments/${fileId}`)).sha256 === download.sha256);
    check('审计没有保存内部意见正文', database(`SELECT COUNT(*) FROM hr_audit_log WHERE business_domain='HR_EXIT_INTERVIEW' AND business_id IN (${interviews.join(',')}) AND after_data LIKE ${literal(`%${marker}_private%`)};`) === '0');
    evidence.http = true;
    if (process.argv.includes('--hr-exit-interviews-complete')) await verifyExitInterviewInterface({ ...context, person, subject, peer, applicationId,
      interviewerName: interviewers.rows.find(option => String(option.value) === adminId).label });
  } finally {
    const owned = database(`SELECT interview_id FROM hr_exit_interview WHERE tenant_id=100000 AND lifecycle_application_id IN (SELECT id FROM hr_lifecycle_application WHERE tenant_id=100000 AND application_no=${literal(marker)});`).split(/\r?\n/).filter(Boolean);
    assert.ok(owned.every(identifier => /^[1-9]\d*$/.test(identifier)));
    if (owned.length) database(`UPDATE sys_file SET deleted=1 WHERE tenant_id=100000 AND file_type='HR_EXIT_INTERVIEW' AND biz_type='HR_EXIT_INTERVIEW' AND biz_id IN (${owned.join(',')});
      DELETE FROM hr_exit_interview WHERE tenant_id=100000 AND interview_id IN (${owned.join(',')});`);
    database(`DELETE FROM hr_lifecycle_application WHERE tenant_id=100000 AND application_no=${literal(marker)} AND create_by=${literal(marker)};`);
    for (const person of people) database(`DELETE FROM hr_employee WHERE tenant_id=100000 AND user_id=${person.userId} AND create_by=${literal(marker)};
      DELETE FROM sys_user_role WHERE tenant_id=100000 AND user_id=${person.userId};
      DELETE FROM sys_user WHERE tenant_id=100000 AND user_id=${person.userId} AND create_by=${literal(marker)};`);
    check('面谈专项结束后菜单与角色授权保持原样', grants === database("SELECT CONCAT(tenant_id,':',role_id,':',menu_id) FROM sys_role_menu ORDER BY tenant_id,role_id,menu_id;") && menus === database('SELECT menu_id FROM sys_menu ORDER BY menu_id;'));
    evidence.restoration = true;
  }
}
