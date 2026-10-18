import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { verifyHrSkillInterface } from './verify-hr-skills-ui.mjs';
import { createOwnedRecoveryJournal } from './runtime-checks/owned-recovery-journal.mjs';
import { scanOwnedAuditLogs, scanSecretStream } from './portal-checks/scan-access-logs.mjs';

export async function verifyHrSkills(context) {
  const { admin, database, check, directory, caseTag, state, accounts, evidence } = context;
  assert.match(caseTag, /^[a-f0-9]{12}$/);
  const literal = value => `CONVERT(UNHEX('${Buffer.from(String(value)).toString('hex')}') USING utf8mb4)`;
  const names = ['emp', 'peer', 'admin'].map(suffix => `h2s_${suffix}_${caseTag}`);
  const selectedNames = names.map(literal).join(',');
  assert.equal(database(`SELECT COUNT(*) FROM sys_user WHERE tenant_id=100000 AND user_name IN (${selectedNames});`), '0');
  const roles = () => database('SELECT tenant_id,user_id,role_id FROM sys_user_role ORDER BY tenant_id,user_id,role_id;');
  const menus = () => database('SELECT tenant_id,role_id,menu_id FROM sys_role_menu ORDER BY tenant_id,role_id,menu_id;');
  const rolesBefore = roles(), menusBefore = menus();
  const tables = [['hr_skill', 'skill_id'], ['hr_employee_skill', 'employee_skill_id'], ['hr_position', 'id'],
    ['hr_position_skill', 'position_skill_id'], ['hr_employee', 'id'], ['hr_training_course', 'id'],
    ['hr_training_session', 'id'], ['hr_training_enrollment', 'id'], ['hr_exam_paper', 'id'],
    ['hr_exam_attempt', 'id'], ['hr_training_certificate', 'id'], ['hr_training_certificate_template', 'id'], ['sys_file', 'file_id']];
  const bounds = Object.fromEntries(tables.map(([table, key]) => {
    const bound = database(`SELECT COALESCE(MAX(${key}),0) FROM ${table};`);
    assert.match(bound, /^\d+$/); return [table, bound];
  }));
  const columns = Object.fromEntries(tables.map(([table]) => {
    const values = database(`SELECT column_name FROM information_schema.columns WHERE table_schema='cloud_flow_db' AND table_name=${literal(table)} ORDER BY ordinal_position;`).split(/\r?\n/);
    assert.ok(values.length); values.forEach(value => assert.match(value, /^[a-z_][a-z0-9_]*$/)); return [table, values];
  }));
  const snapshot = () => Object.fromEntries(tables.map(([table, key]) => {
    const digest = createHash('sha256'); let cursor = '0';
    for (;;) {
      const end = database(`SELECT COALESCE(MAX(${key}),0) FROM (SELECT ${key} FROM ${table} WHERE ${key}>${cursor} AND ${key}<=${bounds[table]} ORDER BY ${key} LIMIT 1000) selected;`);
      assert.match(end, /^\d+$/); if (end === '0') break;
      const projection = columns[table].map(column => 'HEX(`' + column + '`)').join(',');
      digest.update(database(`SELECT ${key},SHA2(CAST(JSON_ARRAY(${projection}) AS CHAR),256) FROM ${table} WHERE ${key}>${cursor} AND ${key}<=${end} ORDER BY ${key};`));
      cursor = end;
    }
    return [table, digest.digest('hex')];
  }));
  const before = snapshot();
  const journal = createOwnedRecoveryJournal(directory, `h2s-${caseTag}`, { names, rolesBefore, menusBefore, tables, bounds, columns, before });
  evidence.preservation = { tables: tables.length, bounds, before, kept: false };
  const secrets = new Set(accounts.map(item => item.password).filter(Boolean));
  const remember = async page => {
    const token = await page.evaluate(async () => (await import('/src/utils/authStorage.ts')).getAuthToken());
    assert.ok(token); secrets.add(token.replace(/^Bearer /, ''));
    await fs.writeFile(path.join(directory, 'private', `skills-secrets-${caseTag}.json`), JSON.stringify([...secrets]), { mode: 0o600 });
    return page;
  };
  let failure;
  try {
    await remember(admin);
    await verifyOwnedHrSkills({ ...context, journal, session: async (...args) => remember(await context.session(...args)) });
  } catch (error) { failure = error; }
  finally {
    const cleanupErrors = [];
    const attempt = async operation => { try { await operation(); } catch (error) { cleanupErrors.push(error); } };
    // Exact unique names also cover a failure between account insertion and ID capture.
    for (const name of names) await attempt(async () => {
      const id = database(`SELECT user_id FROM sys_user WHERE tenant_id=100000 AND user_name=${literal(name)} AND create_by='skill-fixture';`);
      if (!id) return;
      assert.match(id, /^[1-9]\d*$/);
      database(`UPDATE sys_user SET status='1' WHERE tenant_id=100000 AND user_id=${id} AND user_name=${literal(name)} AND create_by='skill-fixture';
        DELETE FROM sys_user_role WHERE tenant_id=100000 AND user_id=${id};`);
      check('本轮技能临时账号停用并撤回角色', database(`SELECT COUNT(*) FROM sys_user WHERE tenant_id=100000 AND user_id=${id} AND status='1';`) === '1'
        && database(`SELECT COUNT(*) FROM sys_user_role WHERE tenant_id=100000 AND user_id=${id};`) === '0');
      journal('account-disabled', { userId: id, name });
    });
    await attempt(async () => {
      const after = snapshot();
      evidence.preservation.after = after;
      journal('restoration-observed', { after, rolesKept: roles() === rolesBefore, menusKept: menus() === menusBefore });
      check('技能验证后原账号角色及菜单授权完整保持', roles() === rolesBefore && menus() === menusBefore);
      check('技能验证前已有13张业务表全部列保持', JSON.stringify(after) === JSON.stringify(before));
      evidence.preservation.kept = true; evidence.restoration = true;
      journal('restored', { tables: tables.length, accountsDisabled: true, rolesKept: true, menusKept: true });
    });
    if (cleanupErrors.length) failure = new AggregateError([failure, ...cleanupErrors].filter(Boolean), 'Skill verification or restoration failed');
  }
  let files = 0, leaks = 0;
  for (const service of state.services) {
    const serviceDirectory = path.join(state.run, service.name);
    const names = await fs.readdir(path.join(serviceDirectory, 'logs')).catch(error => { if (error.code === 'ENOENT') return []; throw error; });
    for (const name of ['stdout.log', 'stderr.log', ...names.filter(name => name.endsWith('.log')).map(name => path.join('logs', name))]) {
      const result = await scanSecretStream(createReadStream(path.join(serviceDirectory, name)), [...secrets]); files++; leaks += result.leaks;
    }
  }
  const audit = await scanOwnedAuditLogs(state, [...secrets], { log: '0', error: '0', audit: '0' });
  check('技能登录凭据未出现在服务日志及审计', leaks === 0 && audit.leaks === 0); evidence.secrets = true;
  console.log('H2_SKILL_SECRET_SCAN: ' + JSON.stringify({ files, values: secrets.size, leaks, databaseLeaks: audit.leaks }));
  if (failure) throw failure;
}

async function verifyOwnedHrSkills(context) {
  const { admin, api, successful, session, database, check, caseTag, evidence } = context;
  const literal = value => `CONVERT(UNHEX('${Buffer.from(String(value)).toString('hex')}') USING utf8mb4)`;
  const root = '/hr/skill';
  const request = async (actor, endpoint, body, method = 'POST') => api(actor, `${root}${endpoint}`, { method, body });
  const read = async (actor, endpoint) => successful(await api(actor, `${root}${endpoint}`), endpoint);
  const reject = (result, label, statuses = [400, 403, 404, 409, 422]) => check(`${label} HTTP=${result.status} code=${result.body?.code}`, statuses.includes(result.status) && result.body?.code !== 200);
  const employeeGrants = database('SELECT CONCAT(tenant_id,\':\',menu_id) FROM sys_role_menu WHERE role_id=5 ORDER BY tenant_id,menu_id;');
  const createEmployee = (suffix, roleId = 5) => {
    const username = `h2s_${suffix}_${caseTag}`;
    database(`INSERT INTO sys_user (tenant_id,dept_id,user_name,nick_name,password,status,deleted,pwd_reset_required,create_by,create_time)
      SELECT 100000,100,${literal(username)},${literal(username)},password,'0',0,'0','skill-fixture',NOW() FROM sys_user WHERE tenant_id=100000 AND user_name='g_holiday_employee';`);
    const userId = database(`SELECT user_id FROM sys_user WHERE tenant_id=100000 AND user_name=${literal(username)};`);
    assert.match(userId, /^[1-9]\d*$/);
    context.journal('account-created', { username, userId, roleId });
    database(`INSERT INTO sys_user_role (tenant_id,user_id,role_id) VALUES (100000,${userId},${roleId});
      INSERT INTO hr_employee (tenant_id,employee_no,name,gender,dept_id,employee_status,hire_date,user_id,deleted)
      VALUES (100000,${literal(username)},${literal(username)},'UNKNOWN',100,'REGULAR','2020-01-01',${userId},0);`);
    const employeeId = database(`SELECT id FROM hr_employee WHERE tenant_id=100000 AND user_id=${userId};`);
    assert.match(employeeId, /^[1-9]\d*$/);
    return { username, userId, employeeId };
  };
  const employeeIdentity = createEmployee('emp');
  const peerIdentity = createEmployee('peer');
  const reviewerIdentity = createEmployee('admin', 1);
  const employee = await session(employeeIdentity.username, 'g_holiday_employee');
  const peer = await session(peerIdentity.username, 'g_holiday_employee');
  const selfReviewer = await session(reviewerIdentity.username, 'g_holiday_employee');
  const hr = await session('g_holiday_hr');
  const manager = await session('g_holiday_manager');
  const skillName = `H2技能_${caseTag}`;
  const levels = { 1: '能在指导下完成', 2: '能够独立完成', 3: '能够处理复杂问题', 4: '能够指导他人', 5: '能够制定专业标准' };
  const definition = { skillCode: `H2_SKILL_${caseTag}`, skillName, skillCategory: '技能验收', description: '仅限本机测试数据', levelDefinition: levels, status: 'ACTIVE' };
  reject(await request(employee, '', definition), '普通员工不能维护技能');
  reject(await request(manager, '', definition), '主管不能维护技能目录');
  reject(await request(hr, '', { ...definition, levelDefinition: { 1: '只有一级' } }), 'HR缺五级定义不能启用');
  const skillId = String(successful(await request(hr, '', definition), 'HR创建五级技能'));
  const skills = await read(employee, `/list?skillId=${skillId}`);
  check('员工只读技能目录返回真实五级定义', skills.total === 1 && skills.rows[0].levelDefinition['5'] === levels[5]);
  evidence.definitions = true;
  const positionCode = `H2_POS_${caseTag}`;
  database(`INSERT INTO hr_position (tenant_id,position_code,position_name,status,version) VALUES (100000,${literal(positionCode)},${literal(positionCode)},1,0);`);
  const positionId = database(`SELECT id FROM hr_position WHERE tenant_id=100000 AND position_code=${literal(positionCode)};`);
  database(`UPDATE hr_employee SET position_id=${positionId} WHERE tenant_id=100000 AND id IN (${employeeIdentity.employeeId},${peerIdentity.employeeId},${reviewerIdentity.employeeId});`);
  reject(await request(hr, `/position/${positionId}`, { version: 0, requirements: [{ skillId, requiredLevel: 4, weight: '0.5', mandatory: true }] }, 'PUT'), '岗位分组权重不满1被拒绝');
  successful(await request(hr, `/position/${positionId}`, { version: 0, requirements: [{ skillId, requiredLevel: 4, weight: '1', mandatory: true }] }, 'PUT'), 'HR保存岗位要求');
  reject(await request(hr, `/position/${positionId}`, { version: 0, requirements: [] }, 'PUT'), '旧岗位版本不能清空要求');
  const selfInput = { skillId, level: 1, remark: '本人自报真实技能', requestKey: randomUUID(), expireDate: null, employeeId: peerIdentity.employeeId };
  const submissions = await Promise.all([request(employee, '/self-assessment', selfInput), request(employee, '/self-assessment', selfInput)]);
  check('同一真实登录并发自报至少一笔成功', submissions.some(result => result.status === 200 && result.body?.code === 200));
  const own = await read(employee, `/mine?requestKey=${selfInput.requestKey}`);
  const selfRecord = own.assessments.rows[0];
  check('自报并发去重且忽略伪造他人员工编号', own.assessments.total === 1 && String(selfRecord.employeeId) === employeeIdentity.employeeId && selfRecord.status === 'PENDING' && selfRecord.effectiveLevel === 0);
  check('第二名普通员工查不到他人证据', (await read(peer, `/mine?employeeId=${employeeIdentity.employeeId}&skillId=${skillId}`)).assessments.total === 0);
  reject(await request(employee, `/assessment/${selfRecord.assessmentId}/review`, { version: 0, approved: true, level: 5, remark: '越权审核' }), '普通员工不能审核');
  reject(await api(employee, `${root}/assessments`), '普通员工不能读取管理范围评估');
  successful(await request(hr, `/assessment/${selfRecord.assessmentId}/review`, { version: 0, approved: true, level: 1, remark: 'HR核实一级' }), 'HR审核本人自报');
  const adminSelf = String(successful(await request(selfReviewer, '/self-assessment', { ...selfInput, employeeId: undefined, requestKey: randomUUID() }), '独立在岗管理员提交本人自报'));
  reject(await request(selfReviewer, `/assessment/${adminSelf}/review`, { version: 0, approved: true, level: 5, remark: '管理员自审' }), '管理员仍不能自审本人技能');
  const managerInput = { skillId, employeeId: peerIdentity.employeeId, evidenceType: 'MANAGER_REVIEW', level: 2, remark: '主管范围内真实评估', requestKey: randomUUID(), expireDate: null };
  successful(await request(hr, '/assessment', managerInput), 'HR人工核实第二名员工技能');
  evidence.concurrency = true;
  const courseCode = `H2_COURSE_${caseTag}`;
  database(`INSERT INTO hr_training_course (tenant_id,course_code,course_name,status) VALUES (100000,${literal(courseCode)},${literal(courseCode)},'PUBLISHED');`);
  const courseId = database(`SELECT id FROM hr_training_course WHERE tenant_id=100000 AND course_code=${literal(courseCode)};`);
  successful(await request(hr, `/course/${courseId}`, { version: 0, skillId, targetLevel: 2 }, 'PUT'), 'HR配置真实课程技能等级');
  for (const field of ['skillId', 'targetLevel', 'skill_id', 'target_level']) {
    reject(await api(admin, `/hr/training/courses/${courseId}`, { method: 'PUT', body: { [field]: 5, skillTargetSupplied: false } }), `课程通用入口拒绝${field}且客户端不能关闭检查`, [403]);
  }
  reject(await api(admin, `/hr/training/courses/${courseId}`, { method: 'PUT', body: { skillId: null, targetLevel: null } }), '课程通用入口不能清空技能目标', [403]);
  reject(await api(admin, '/hr/training/courses', { method: 'POST', body: { courseCode: `${courseCode}_BYPASS`, courseName: '禁止越权技能配置', skillId, targetLevel: 5 } }), '新建课程不能绕过技能目标授权', [403]);
  check('通用入口拒绝后课程目标与版本不变', database(`SELECT CONCAT(skill_id,':',target_level,':',version) FROM hr_training_course WHERE id=${courseId};`) === `${skillId}:2:1`);
  database(`INSERT INTO hr_training_session (tenant_id,course_id,session_no,start_time,end_time,capacity,enrolled_count,status)
    VALUES (100000,${courseId},${literal(courseCode)},NOW(),DATE_ADD(NOW(),INTERVAL 2 DAY),20,0,'REGISTERING');`);
  const sessionId = database(`SELECT id FROM hr_training_session WHERE tenant_id=100000 AND session_no=${literal(courseCode)};`);
  database(`INSERT INTO hr_training_enrollment (tenant_id,session_id,employee_id,status,completion_status) VALUES (100000,${sessionId},${employeeIdentity.employeeId},'APPROVED','PENDING');`);
  const enrollmentId = database(`SELECT id FROM hr_training_enrollment WHERE tenant_id=100000 AND session_id=${sessionId} AND employee_id=${employeeIdentity.employeeId};`);
  successful(await api(admin, `/hr/training/enrollments/${enrollmentId}/complete`, { method: 'POST', body: { completionStatus: 'PASSED', score: '90', comment: '真实结业接口' } }), '真实培训结业');
  const currentLevel = () => database(`SELECT current_level FROM hr_employee_skill WHERE tenant_id=100000 AND employee_id=${employeeIdentity.employeeId} AND skill_id=${skillId} AND current_flag=1;`);
  check('真实结业自动提升至课程设定2级', currentLevel() === '2');
  successful(await request(hr, `/course/${courseId}`, { version: 1, skillId, targetLevel: 3 }, 'PUT'), '调整课程目标至3级');
  database(`INSERT INTO hr_exam_paper (tenant_id,course_id,paper_name,total_score,pass_score,status) VALUES (100000,${courseId},${literal(courseCode)},100,60,'PUBLISHED');`);
  const paperId = database(`SELECT id FROM hr_exam_paper WHERE tenant_id=100000 AND paper_name=${literal(courseCode)};`);
  const createAttempt = () => {
    database(`INSERT INTO hr_exam_attempt (tenant_id,paper_id,employee_id,session_id,status,start_time) VALUES (100000,${paperId},${employeeIdentity.employeeId},${sessionId},'SUBMITTED',NOW());`);
    return database(`SELECT MAX(id) FROM hr_exam_attempt WHERE tenant_id=100000 AND paper_id=${paperId};`);
  };
  const attemptId = createAttempt();
  const grade = async attempt => successful(await api(admin, `/hr/training/attempts/${attempt}/grade`, { method: 'POST', body: { score: '95', passFlag: true, comment: '真实批改接口' } }), '真实考试批改');
  await grade(attemptId);
  check('真实考试批改自动提升3级', currentLevel() === '3');
  reject(await request(hr, '/assessment', { ...managerInput, evidenceType: 'EXAM', evidenceBizId: attemptId, level: 5, requestKey: randomUUID() }), '不能使用他人考试记录认证');
  successful(await request(hr, `/course/${courseId}`, { version: 2, skillId, targetLevel: 4 }, 'PUT'), '配置证书目标4级');
  const templateId = database('SELECT MIN(id) FROM hr_training_certificate_template WHERE tenant_id=100000 AND deleted=0;');
  assert.match(templateId, /^[1-9]\d*$/);
  const certificateId = String(successful(await api(admin, '/hr/training/certificates/issue', { method: 'POST', body: { employeeId: employeeIdentity.employeeId, courseId, sessionId, templateId } }), '真实颁发培训证书并生成文件'));
  check('真实证书颁发自动提升4级', currentLevel() === '4');
  successful(await request(hr, `/course/${courseId}`, { version: 3, skillId, targetLevel: 3 }, 'PUT'), '核验较低等级证据');
  const lowerAttempt = createAttempt();
  await grade(lowerAttempt);
  check('较低考试仅留存，当前证书等级和有效期不变', currentLevel() === '4' && database(`SELECT assessment_status FROM hr_employee_skill WHERE tenant_id=100000 AND evidence_type='EXAM' AND evidence_biz_id=${literal(lowerAttempt)};`) === 'RECORDED');
  const sources = database(`SELECT DISTINCT evidence_type FROM hr_employee_skill WHERE tenant_id=100000 AND skill_id=${skillId} ORDER BY evidence_type;`).split(/\r?\n/);
  check('五类证据全部由真实业务接口产生', ['CERTIFICATE', 'EXAM', 'MANAGER_REVIEW', 'SELF', 'TRAINING'].every(source => sources.includes(source)));
  evidence.fiveSources = true;
  successful(await api(admin, `/hr/training/certificates/${certificateId}/revoke`, { method: 'POST', body: { reason: '真实撤销并要求复评' } }), '真实撤销证书');
  check('证书撤销后不恢复旧培训与考试', currentLevel() === '');
  check('岗位差距按未认证等级0计算', (await read(employee, '/mine/recommendations')).skills.find(row => String(row.skillId) === skillId).gap === 4);
  database(`UPDATE hr_employee_skill SET expire_date=DATE_SUB(CURDATE(),INTERVAL 1 DAY) WHERE tenant_id=100000 AND employee_id=${peerIdentity.employeeId} AND skill_id=${skillId} AND current_flag=1;`);
  check('到期日期隔离输入使本人当前等级0且不恢复旧记录', (await read(peer, '/mine/recommendations')).skills.find(row => String(row.skillId) === skillId).currentLevel === 0);
  evidence.expiry = true;
  const recommendedCourses = async actor => (await read(actor, '/mine/recommendations')).skills.find(row => String(row.skillId) === skillId).recommendations;
  check('已有报名权限仍不推荐目标等级不足的课程', !(await recommendedCourses(selfReviewer)).some(row => String(row.courseId) === courseId));
  successful(await request(hr, `/course/${courseId}`, { version: 4, skillId, targetLevel: 4 }, 'PUT'), '配置足以补足岗位差距的课程目标');
  check('已有报名权限的本人获得同技能足够等级课程推荐', (await recommendedCourses(selfReviewer)).some(row => String(row.courseId) === courseId && row.targetLevel === 4));
  check('同岗位普通员工无报名权限时仍不获得推荐', (await recommendedCourses(peer)).length === 0);
  database(`UPDATE hr_training_course SET status='DRAFT' WHERE tenant_id=100000 AND id=${courseId};`);
  try {
    check('课程停用隔离输入不会出现在真实推荐接口', !(await recommendedCourses(selfReviewer)).some(row => String(row.courseId) === courseId));
  } finally {
    database(`UPDATE hr_training_course SET status='PUBLISHED' WHERE tenant_id=100000 AND id=${courseId};`);
  }
  evidence.recommendations = true;
  const foreignRole = database("SELECT role_id FROM sys_user_role WHERE user_id=990000703 AND tenant_id=100001 ORDER BY role_id LIMIT 1;");
  assert.match(foreignRole, /^[1-9]\d*$/);
  const foreignMenus = ['1877', '1878', '1879', '1880', '1881', '1893'];
  const existingForeign = database(`SELECT menu_id FROM sys_role_menu WHERE tenant_id=100001 AND role_id=${foreignRole} AND menu_id IN (${foreignMenus.join(',')}) ORDER BY menu_id;`);
  const originalForeign = existingForeign.split(/\r?\n/).filter(Boolean);
  originalForeign.forEach(value => assert.ok(foreignMenus.includes(value)));
  const missingForeign = foreignMenus.filter(value => !originalForeign.includes(value));
  context.journal('foreign-grants-original', { tenantId: '100001', roleId: foreignRole, menuIds: foreignMenus, original: existingForeign, temporary: missingForeign });
  try {
    if (missingForeign.length) database(`INSERT INTO sys_role_menu (tenant_id,role_id,menu_id) SELECT 100001,${foreignRole},menu_id FROM sys_menu WHERE menu_id IN (${missingForeign.join(',')});`);
    const foreign = await session('g_import_tenant');
    check('另一租户具备技能读取权限仍无法读取本租户定义', (await read(foreign, `/list?skillId=${skillId}`)).total === 0);
    reject(await request(foreign, '', { ...definition, skillId, version: 0 }, 'PUT'), '另一租户不能修改技能');
    reject(await request(foreign, `/assessment/${selfRecord.assessmentId}/review`, { version: 1, approved: false, remark: '跨租户' }), '另一租户不能审核证据');
  } finally {
    if (missingForeign.length) database(`DELETE FROM sys_role_menu WHERE tenant_id=100001 AND role_id=${foreignRole} AND menu_id IN (${missingForeign.join(',')});`);
    assert.equal(database(`SELECT menu_id FROM sys_role_menu WHERE tenant_id=100001 AND role_id=${foreignRole} AND menu_id IN (${foreignMenus.join(',')}) ORDER BY menu_id;`), existingForeign, 'Original foreign skill grants retained');
    context.journal('foreign-grants-restored', { tenantId: '100001', roleId: foreignRole });
  }
  check('两普通员工和跨租户核验未增加EMPLOYEE任何授权', employeeGrants === database('SELECT CONCAT(tenant_id,\':\',menu_id) FROM sys_role_menu WHERE role_id=5 ORDER BY tenant_id,menu_id;'));
  evidence.permissions = true;
  await verifyHrSkillInterface({ ...context, employee, hr, employeeIdentity, skillId, skillName, levels, positionId, positionCode, courseId, courseCode });
}
