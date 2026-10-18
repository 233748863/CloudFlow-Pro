import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export async function verifyHrReferrals(context) {
  const { admin, api, successful, session: openSession, database, check, caseTag, directory } = context;
  const root = '/hr/referral';
  const marker = `referral_${caseTag}`;
  const nameLength = Number(process.argv.find(value => value.startsWith('--hr-referral-name-length='))?.split('=')[1] || 28);
  assert.ok([28, 30, 31, 100].includes(nameLength));
  const candidateName = `${marker}_person`.padEnd(nameLength, '名');
  const literal = value => `CONVERT(UNHEX('${Buffer.from(String(value)).toString('hex')}') USING utf8mb4)`;
  const people = []; const files = []; const referralIds = []; const candidateIds = [];
  let positionId; let requisitionId;
  const originalGrants = database("SELECT CONCAT(tenant_id,':',role_id,':',menu_id) FROM sys_role_menu ORDER BY tenant_id,role_id,menu_id;");
  const cleanupMarker = process.argv.find(value => value.startsWith('--hr-referrals-cleanup='))?.split('=')[1];
  if (cleanupMarker) {
    assert.match(cleanupMarker, /^referral_[a-f0-9]{12}$/);
    const abandoned = database(`SELECT JSON_OBJECT('id',instance_id) FROM wf_process_instance instance WHERE tenant_id=100000 AND status IN ('RUNNING','PAUSED')
      AND start_user_name=${literal(`${cleanupMarker}_hr`)} AND JSON_UNQUOTE(JSON_EXTRACT(variables,'$.businessType'))='OFFER'
      AND NOT EXISTS (SELECT 1 FROM sys_user actor WHERE actor.tenant_id=instance.tenant_id AND actor.user_id=instance.start_user_id)
      AND NOT EXISTS (SELECT 1 FROM hr_offer offer WHERE offer.tenant_id=instance.tenant_id AND offer.process_instance_id=instance.instance_id);`)
      .split(/\r?\n/).filter(Boolean).map(value => JSON.parse(value));
    for (const instance of abandoned) successful(await api(admin, '/workflow/wf/instance/terminate', { method: 'POST', body: {
      instanceId: instance.id, reason: `${cleanupMarker}已结束的隔离核验，保留流程历史`,
    } }), '结束明确归属旧测试且业务已清理的录用实例');
    check('旧测试未遗留活动录用待办', abandoned.every(instance => database(`SELECT COUNT(*) FROM wf_task WHERE tenant_id=100000 AND instance_id=${literal(instance.id)} AND status='TODO';`) === '0'));
  }
  const pdf = Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n');
  const digest = createHash('sha256').update(pdf).digest('hex');
  const email = `${marker.padEnd(64, 'a')}@${'b'.repeat(63)}.${'c'.repeat(63)}.${'d'.repeat(61)}`;
  const phone = `+1${BigInt('0x' + caseTag.slice(0, 11)).toString().padStart(14, '0').slice(-14)}`;
  const sensitive = new Set([email, phone]);
  const saveSensitive = () => writeFileSync(path.join(directory, 'private', `referral-secrets-${caseTag}.json`), JSON.stringify([...sensitive]), { mode: 0o600 });
  const remember = async page => {
    const token = await page.evaluate(async () => (await import('/src/utils/authStorage.ts')).getAuthToken());
    assert.ok(token); sensitive.add(token.replace(/^Bearer /, '')); saveSensitive(); return page;
  };
  const session = async (...args) => remember(await openSession(...args));
  saveSensitive();
  await remember(admin);
  const createPerson = (suffix, roleId = 5) => {
    const username = `${marker}_${suffix}`;
    database(`INSERT INTO sys_user (tenant_id,dept_id,user_name,nick_name,password,status,deleted,pwd_reset_required,create_by,create_time)
      SELECT 100000,100,${literal(username)},${literal(username)},password,'0',0,'0','referral-fixture',NOW()
      FROM sys_user WHERE tenant_id=100000 AND user_name='g_holiday_employee';`);
    const userId = database(`SELECT user_id FROM sys_user WHERE tenant_id=100000 AND user_name=${literal(username)};`);
    assert.match(userId, /^[1-9]\d*$/); const person = { username, userId }; people.push(person);
    database(`INSERT INTO sys_user_role (tenant_id,user_id,role_id) VALUES (100000,${userId},${roleId});
      INSERT INTO hr_employee (tenant_id,employee_no,name,gender,dept_id,employee_status,hire_date,user_id,deleted)
      VALUES (100000,${literal(username)},${literal(username)},'UNKNOWN',100,'REGULAR','2020-01-01',${userId},0);`);
    person.employeeId = database(`SELECT id FROM hr_employee WHERE tenant_id=100000 AND user_id=${userId};`);
    return person;
  };
  const rejected = (result, label) => check(label, result.status >= 400 && result.body?.code !== 200);
  const upload = async (actor, suffix) => {
    const file = successful(await api(actor, `${root}/resume`, { method: 'POST', file: { name: `${marker}_${suffix}.pdf`, type: 'application/pdf', content: pdf.toString('base64') } }), '真实私有简历上传');
    assert.match(String(file.fileId), /^[1-9]\d*$/); files.push(String(file.fileId)); return file;
  };
  const ownDetail = async (actor, id) => successful(await api(actor, `${root}/mine/${id}`), '本人读取推荐');
  try {
    const person = createPerson('employee'); const peerPerson = createPerson('peer');
    const employee = await session(person.username, 'g_holiday_employee'); const peer = await session(peerPerson.username, 'g_holiday_employee');
    const permissionInfo = await employee.evaluate(async () => {
      const auth = await import('/src/services/api/auth.ts');
      const info = await auth.getInfo();
      return { permissions: info.permissions?.filter(value => value.startsWith('hr:referral:')), roles: info.roles };
    });
    check('员工登录权限包含本人推荐与提交', permissionInfo.permissions?.includes('hr:referral:own') && permissionInfo.permissions?.includes('hr:referral:submit'));
    database(`INSERT INTO hr_position (tenant_id,position_code,position_name,status) VALUES (100000,${literal(marker)},${literal(marker)},1);`);
    positionId = database(`SELECT id FROM hr_position WHERE tenant_id=100000 AND position_code=${literal(marker)};`);
    database(`INSERT INTO hr_recruitment_requisition (tenant_id,requisition_no,title,dept_id,position_id,headcount,hired_count,status,create_by,deleted)
      VALUES (100000,${literal(marker)},${literal(marker)},100,${positionId},2,0,'RECRUITING','referral-fixture',0);`);
    requisitionId = database(`SELECT id FROM hr_recruitment_requisition WHERE tenant_id=100000 AND requisition_no=${literal(marker)};`);
    const positions = successful(await api(employee, `${root}/positions?keyword=${marker}`), '本人查询目标岗位');
    check('本人可按名称选择启用岗位', positions.rows.some(row => String(row.value) === positionId));
    const resume = await upload(employee, 'first');
    check('私有简历不保存公共链接', database(`SELECT COUNT(*) FROM sys_file WHERE tenant_id=100000 AND file_id=${resume.fileId} AND file_type='HR_REFERRAL_RESUME' AND access_type='PRIVATE' AND url='';`) === '1');
    const input = { candidateName, contactPhone: phone, email, targetPositionId: positionId, resumeFileId: resume.fileId, referralReason: '隔离环境实际推荐验证' };
    const identitiesBefore = database('SELECT COUNT(*) FROM hr_recruitment_identity WHERE tenant_id=100000;');
    const oversized = await api(employee, root, { method: 'POST', body: { ...input, candidateName: candidateName.padEnd(101, '名') } });
    check('101字符推荐姓名明确拒绝且不产生推荐或占位', oversized.status === 400 && oversized.body?.code !== 200
      && database(`SELECT COUNT(*) FROM hr_employee_referral WHERE tenant_id=100000 AND referrer_employee_id=${person.employeeId};`) === '0'
      && database('SELECT COUNT(*) FROM hr_recruitment_identity WHERE tenant_id=100000;') === identitiesBefore);
    rejected(await api(employee, root, { method: 'POST', body: { ...input, contactPhone: '', email: '' } }), '没有手机或邮箱拒绝推荐');
    rejected(await api(employee, root, { method: 'POST', body: { ...input, contactPhone: '13812345678' } }), '新增手机号不猜国家区号');
    const submitted = successful(await api(employee, root, { method: 'POST', body: input }), '本人提交推荐'); referralIds.push(String(submitted.referralId));
    check('本人推荐提交后只显示自身处理结果', submitted.status === 'SUBMITTED' && submitted.candidateId == null && submitted.contactPhone.includes('*') && submitted.email.includes('*'));
    check('推荐人身份来自登录员工关系', database(`SELECT COUNT(*) FROM hr_employee_referral WHERE referral_id=${submitted.referralId} AND tenant_id=100000 AND referrer_employee_id=${person.employeeId};`) === '1');
    rejected(await api(peer, `${root}/mine/${submitted.referralId}`), '员工不能查看他人推荐');
    rejected(await api(peer, `${root}/mine/${submitted.referralId}/resume`), '员工不能下载他人简历');
    rejected(await api(employee, `${root}/list`), '员工不能读取人事内推管理列表');
    const ownFile = await api(employee, `${root}/mine/${submitted.referralId}/resume`);
    check('本人私有简历下载内容一致且禁止缓存', ownFile.status === 200 && ownFile.sha256 === digest && ownFile.cacheControl === 'no-store' && ownFile.nosniff === 'nosniff');
    const genericResume = await api(admin, `/auth/system/file/${resume.fileId}/content`);
    check('普通文件编号入口明确禁止读取内推简历', genericResume.status === 403 && genericResume.body?.code !== 200);
    const storedPath = database(`SELECT file_path FROM sys_file WHERE tenant_id=100000 AND file_id=${resume.fileId};`);
    assert.ok(storedPath && !storedPath.includes('\n'));
    const genericResumePath = await api(admin, `/auth/system/file/access?path=${encodeURIComponent(storedPath)}`);
    check('普通文件路径入口明确禁止读取内推简历', genericResumePath.status === 403 && genericResumePath.body?.code !== 200);
    try {
      database(`UPDATE hr_employee_referral SET tenant_id=200001 WHERE tenant_id=100000 AND referral_id=${submitted.referralId};`);
      rejected(await api(employee, `${root}/mine/${submitted.referralId}`), '本人身份不能读取其他租户推荐');
      rejected(await api(admin, `${root}/${submitted.referralId}/resume`), '管理员不能下载其他租户推荐简历');
    } finally {
      database(`UPDATE hr_employee_referral SET tenant_id=100000 WHERE tenant_id=200001 AND referral_id=${submitted.referralId};`);
    }
    try {
      database(`UPDATE sys_file SET tenant_id=200001 WHERE tenant_id=100000 AND file_id=${resume.fileId};`);
      rejected(await api(employee, `${root}/mine/${submitted.referralId}/resume`), '推荐与附件租户不一致时拒绝下载');
    } finally {
      database(`UPDATE sys_file SET tenant_id=100000 WHERE tenant_id=200001 AND file_id=${resume.fileId};`);
    }
    const originalBytes = readFileSync(storedPath);
    assert.equal(createHash('sha256').update(originalBytes).digest('hex'), digest);
    try {
      const alteredBytes = Buffer.from(originalBytes); alteredBytes[alteredBytes.length - 2] ^= 1;
      writeFileSync(storedPath, alteredBytes);
      rejected(await api(employee, `${root}/mine/${submitted.referralId}/resume`), '私有简历同长度内容被修改时拒绝下载');
    } finally { writeFileSync(storedPath, originalBytes); }
    check('恢复本次测试文件后可正常下载', (await api(employee, `${root}/mine/${submitted.referralId}/resume`)).sha256 === digest);
    const peerResume = await upload(peer, 'duplicate');
    const duplicate = successful(await api(peer, root, { method: 'POST', body: { ...input, resumeFileId: peerResume.fileId } }), '另一员工重复推荐'); referralIds.push(String(duplicate.referralId));
    check('重复推荐持久保存且不泄露原候选人或推荐人', duplicate.status === 'DUPLICATE' && duplicate.candidateId == null && duplicate.referrerName == null);
    check('重复推荐不留下联系方式占用', database(`SELECT COUNT(*) FROM hr_recruitment_identity WHERE tenant_id=100000 AND referral_id=${duplicate.referralId};`) === '0');
    rejected(await api(admin, '/hr/recruitment/candidates', { method: 'POST', body: { name: `${marker}_direct`, phone, email } }), '人事直接录入同一联系方式被统一防重拒绝');
    rejected(await api(employee, `${root}/${submitted.referralId}/convert`, { method: 'POST', body: { version: submitted.version, requisitionId } }), '员工不能将推荐转为候选人');
    const screened = successful(await api(admin, `${root}/${submitted.referralId}/screening`, { method: 'PUT', body: { version: submitted.version, accepted: true, reason: '已核对岗位与推荐资料' } }), '人事初筛通过');
    check('初筛通过后推荐状态更新', screened.status === 'SCREENING');
    const converted = successful(await api(admin, `${root}/${submitted.referralId}/convert`, { method: 'POST', body: { version: screened.version, requisitionId } }), '人事转入招聘');
    candidateIds.push(String(converted));
    await new Promise(resolve => setTimeout(resolve, 5100));
    const repeated = successful(await api(admin, `${root}/${submitted.referralId}/convert`, { method: 'POST', body: { version: screened.version, requisitionId } }), '重复转换读取原候选人');
    check('重复转换只保留同一个候选人', String(repeated) === String(converted) && database(`SELECT COUNT(*) FROM hr_candidate WHERE tenant_id=100000 AND source='REFERRAL' AND name=${literal(input.candidateName)};`) === '1');
    check('转换后联系方式仍完整且两个身份占位共用', database(`SELECT COUNT(*) FROM hr_candidate WHERE tenant_id=100000 AND id=${converted} AND phone=${literal(phone)} AND email=${literal(email)};`) === '1'
      && database(`SELECT COUNT(*) FROM hr_recruitment_identity WHERE tenant_id=100000 AND candidate_id=${converted} AND referral_id=${submitted.referralId};`) === '2');
    const hrFile = await api(admin, `${root}/${submitted.referralId}/resume`);
    check('人事在转换后经候选人范围校验下载原简历', hrFile.status === 200 && hrFile.sha256 === digest);
    const mine = await ownDetail(employee, submitted.referralId);
    check('转换后员工仍看不到内部候选人编号', mine.candidateId == null && mine.bonusStatus === 'NOT_APPLICABLE');
    if (process.argv.includes('--hr-referrals-complete')) {
      const { verifyHrReferralCompletion } = await import('./verify-hr-referral-completion-real.mjs');
      await verifyHrReferralCompletion({ ...context, session, createPerson, person, employee, referralId: submitted.referralId, candidateId: converted, positionId, marker, candidateName });
    }
    if (process.argv.includes('--hr-referrals-ui')) {
      const { verifyHrReferralsUi } = await import('./verify-hr-referrals-ui.mjs');
      await verifyHrReferralsUi({ employee, admin, marker, candidateName, directory, check, pdf });
    }
    check('内推核验未改变授权配置', database("SELECT CONCAT(tenant_id,':',role_id,':',menu_id) FROM sys_role_menu ORDER BY tenant_id,role_id,menu_id;") === originalGrants);
  } finally {
    if (people.length) {
      const userIds = people.map(person => person.userId).join(',');
      const owned = database(`SELECT referral_id FROM hr_employee_referral WHERE tenant_id=100000 AND referrer_employee_id IN (SELECT id FROM hr_employee WHERE tenant_id=100000 AND user_id IN (${userIds}));`).split(/\r?\n/).filter(Boolean);
      if (owned.length) {
        assert.ok(owned.every(id => /^[1-9]\d*$/.test(id)));
        const candidateRows = database(`SELECT candidate_id FROM hr_employee_referral WHERE tenant_id=100000 AND referral_id IN (${owned.join(',')}) AND candidate_id IS NOT NULL;`).split(/\r?\n/).filter(Boolean);
        database(`DELETE FROM hr_recruitment_identity WHERE tenant_id=100000 AND referral_id IN (${owned.join(',')}); DELETE FROM hr_employee_referral WHERE tenant_id=100000 AND referral_id IN (${owned.join(',')});`);
        if (candidateRows.length) database(`DELETE FROM hr_candidate WHERE tenant_id=100000 AND id IN (${candidateRows.join(',')}) AND source='REFERRAL';`);
      }
      database(`UPDATE sys_file SET deleted=1 WHERE tenant_id=100000 AND file_type='HR_REFERRAL_RESUME' AND create_by IN (${people.map(person => literal(person.username)).join(',')});
        DELETE FROM hr_employee WHERE tenant_id=100000 AND user_id IN (${userIds}); DELETE FROM sys_user_role WHERE tenant_id=100000 AND user_id IN (${userIds}); DELETE FROM sys_user WHERE tenant_id=100000 AND user_id IN (${userIds});`);
    }
    if (requisitionId) database(`DELETE FROM hr_recruitment_requisition WHERE tenant_id=100000 AND id=${requisitionId} AND requisition_no=${literal(marker)};`);
    if (positionId) database(`DELETE FROM hr_position WHERE tenant_id=100000 AND id=${positionId} AND position_code=${literal(marker)};`);
    console.log(`H2_REFERRAL_HTTP_CLEANUP: people=${people.length}; known_files=${files.length}; audit_retained=true; files_marked_deleted=true; local_evidence_bytes_retained=true; production_modified=false`);
  }
  console.log(`H2_REFERRAL_HTTP: actual_auth=true; actual_hr=true; actual_gateway=true; real_mysql=true; real_redis=true; workflow_hire_bonus_tested=${process.argv.includes('--hr-referrals-complete')}; interface_doubles=0; production_modified=false`);
}
