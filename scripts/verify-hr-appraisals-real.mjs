import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createOwnedRecoveryJournal } from './runtime-checks/owned-recovery-journal.mjs';
import { scanOwnedAuditLogs, scanSecretStream } from './portal-checks/scan-access-logs.mjs';

export async function verifyHrAppraisals(context) {
  const { admin, database, check, directory, caseTag, state, accounts, evidence } = context;
  assert.match(caseTag, /^[a-f0-9]{12}$/);
  const literal = value => `CONVERT(UNHEX('${Buffer.from(String(value)).toString('hex')}') USING utf8mb4)`;
  const names = ['employee', 'peer', 'hr', 'admin', 'odept', 'olevel'].map(suffix => `h2ap_${suffix}_${caseTag}`);
  const selectedNames = names.map(literal).join(',');
  assert.equal(database(`SELECT COUNT(*) FROM sys_user WHERE tenant_id=100000 AND user_name IN (${selectedNames});`), '0');
  const roles = () => database('SELECT tenant_id,user_id,role_id FROM sys_user_role ORDER BY tenant_id,user_id,role_id;');
  const menus = () => database('SELECT tenant_id,role_id,menu_id FROM sys_role_menu ORDER BY tenant_id,role_id,menu_id;');
  const rolesBefore = roles(), menusBefore = menus();
  const tables = [["sys_dept","dept_id"],["hr_job_level","id"],["hr_position","id"],["hr_employee","id"],["hr_appraisal_cycle","cycle_id"],["hr_appraisal_kra","kra_id"],["hr_appraisal_result","appraisal_result_id"],["hr_performance_objective","id"],["hr_performance_assignment","id"],["hr_performance_result","id"],["hr_perf_evaluator","id"],["hr_perf_evaluator_response","id"],["hr_perf_distribution_rule","id"],["hr_talent_review","id"],["hr_talent_calibration_session","id"],["hr_performance_interview","id"],["hr_family_member","id"],["hr_training_category","id"],["hr_training_course","id"],["hr_schedule_assignment","id"]];
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
  const journal = createOwnedRecoveryJournal(directory, `h2ap-${caseTag}`, { names, rolesBefore, menusBefore, tables, bounds, columns, before });
  evidence.preservation = { tables: tables.length, bounds, before, kept: false };
  const secrets = new Set(accounts.map(item => item.password).filter(Boolean));
  const remember = async page => {
    const token = await page.evaluate(async () => (await import('/src/utils/authStorage.ts')).getAuthToken());
    assert.ok(token); secrets.add(token.replace(/^Bearer /, ''));
    await fs.writeFile(path.join(directory, 'private', `appraisals-secrets-${caseTag}.json`), JSON.stringify([...secrets]), { mode: 0o600 });
    return page;
  };
  const calculationTimes = new WeakMap();
  const pacedApi = async (actor, endpoint, options = {}) => {
    // Calculating missing inputs does not change the cycle version. Wait before
    // recalculating that cycle; preserve the actual concurrent invitation tests.
    if (options.method === 'POST' && /^\/hr\/appraisal-cycle\/[1-9]\d*\/calculate$/.test(endpoint)) {
      const times = calculationTimes.get(actor) || new Map();
      const remaining = 5100 - (Date.now() - (times.get(endpoint) || 0));
      if (remaining > 0) await actor.waitForTimeout(remaining);
      times.set(endpoint, Date.now()); calculationTimes.set(actor, times);
    }
    return context.api(actor, endpoint, options);
  };
  let failure;
  try {
    await remember(admin);
    await verifyOwnedHrAppraisals({ ...context, journal, api: pacedApi, session: async (...args) => remember(await context.session(...args)) });
  } catch (error) { failure = error; }
  finally {
    const cleanupErrors = [];
    const attempt = async operation => { try { await operation(); } catch (error) { cleanupErrors.push(error); } };
    // Exact unique names also cover a failure between account insertion and ID capture.
    for (const name of names) await attempt(async () => {
      const id = database(`SELECT user_id FROM sys_user WHERE tenant_id=100000 AND user_name=${literal(name)} AND create_by='appraisal-fixture';`);
      if (!id) return;
      assert.match(id, /^[1-9]\d*$/);
      database(`UPDATE sys_user SET status='1' WHERE tenant_id=100000 AND user_id=${id} AND user_name=${literal(name)} AND create_by='appraisal-fixture';
        DELETE FROM sys_user_role WHERE tenant_id=100000 AND user_id=${id};`);
      check('本轮绩效临时账号停用并撤回角色', database(`SELECT COUNT(*) FROM sys_user WHERE tenant_id=100000 AND user_id=${id} AND status='1';`) === '1'
        && database(`SELECT COUNT(*) FROM sys_user_role WHERE tenant_id=100000 AND user_id=${id};`) === '0');
      journal('account-disabled', { userId: id, name });
    });
    await attempt(async () => {
      const after = snapshot();
      evidence.preservation.after = after;
      journal('restoration-observed', { after, rolesKept: roles() === rolesBefore, menusKept: menus() === menusBefore });
      check('绩效验证后原账号角色及菜单授权完整保持', roles() === rolesBefore && menus() === menusBefore);
      check('绩效验证前已有20张业务表全部列保持', JSON.stringify(after) === JSON.stringify(before));
      evidence.preservation.kept = true; evidence.restoration = true;
      journal('restored', { tables: tables.length, accountsDisabled: true, rolesKept: true, menusKept: true });
    });
    if (cleanupErrors.length) failure = new AggregateError([failure, ...cleanupErrors].filter(Boolean), 'Appraisal verification or restoration failed');
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
  check('绩效登录凭据未出现在服务日志及审计', leaks === 0 && audit.leaks === 0); evidence.secrets = true;
  console.log('H2_APPRAISAL_SECRET_SCAN: ' + JSON.stringify({ files, values: secrets.size, leaks, databaseLeaks: audit.leaks }));
  if (failure) throw failure;
}

async function verifyOwnedHrAppraisals(context) {
  const { admin, api, successful, session, database, check, caseTag, evidence } = context;
  const literal = value => `CONVERT(UNHEX('${Buffer.from(String(value)).toString('hex')}') USING utf8mb4)`;
  const root = '/hr/appraisal-cycle';
  const request = (actor, endpoint, body, method = 'POST') => api(actor, `${root}${endpoint}`, { method, body });
  const read = async (actor, endpoint) => successful(await api(actor, `${root}${endpoint}`), endpoint);
  const rejected = (response, label, statuses = [400, 403, 404, 409, 422]) => check(`${label} HTTP=${response.status} code=${response.body?.code}`, statuses.includes(response.status) && response.body?.code !== 200);
  const employeeGrants = database('SELECT CONCAT(tenant_id,\':\',menu_id) FROM sys_role_menu WHERE role_id=5 ORDER BY tenant_id,menu_id;');
  const name = `H2绩效_${caseTag}`;
  database(`INSERT INTO sys_dept (tenant_id,parent_id,ancestors,dept_name,order_num,status,deleted,create_by) VALUES (100000,0,'0',${literal(name)},1,'0',0,'appraisal-fixture');`);
  const deptId = database(`SELECT dept_id FROM sys_dept WHERE tenant_id=100000 AND dept_name=${literal(name)};`);
  const levels = [];
  const positions = [];
  for (const suffix of ['a', 'b']) {
    const code = `ap_${suffix}_${caseTag}`;
    database(`INSERT INTO hr_job_level (tenant_id,level_code,level_name,level_series,level_rank,status,version) VALUES (100000,${literal(code)},${literal(code)},'P',1,1,0);`);
    const levelId = database(`SELECT id FROM hr_job_level WHERE tenant_id=100000 AND level_code=${literal(code)};`);
    database(`INSERT INTO hr_position (tenant_id,position_code,position_name,level_id,status,version) VALUES (100000,${literal(code)},${literal(code)},${levelId},1,0);`);
    positions.push(database(`SELECT id FROM hr_position WHERE tenant_id=100000 AND position_code=${literal(code)};`));
    levels.push(levelId);
  }
  const createEmployee = (suffix, roleId, department = deptId, position = positions[0]) => {
    const username = `h2ap_${suffix}_${caseTag}`;
    database(`INSERT INTO sys_user (tenant_id,dept_id,user_name,nick_name,password,status,deleted,pwd_reset_required,create_by,create_time)
      SELECT 100000,${department},${literal(username)},${literal(username)},password,'0',0,'0','appraisal-fixture',NOW() FROM sys_user WHERE tenant_id=100000 AND user_name='g_holiday_employee';`);
    const userId = database(`SELECT user_id FROM sys_user WHERE tenant_id=100000 AND user_name=${literal(username)};`);
    assert.match(userId, /^[1-9]\d*$/);
    context.journal('account-created', { username, userId, roleId });
    database(`INSERT INTO sys_user_role (tenant_id,user_id,role_id) VALUES (100000,${userId},${roleId});
      INSERT INTO hr_employee (tenant_id,employee_no,name,gender,dept_id,position_id,employee_status,hire_date,user_id,deleted)
      VALUES (100000,${literal(username)},${literal(username)},'UNKNOWN',${department},${position},'REGULAR','2020-01-01',${userId},0);`);
    const employeeId = database(`SELECT id FROM hr_employee WHERE tenant_id=100000 AND user_id=${userId};`);
    assert.match(employeeId, /^[1-9]\d*$/);
    return { username, userId, employeeId };
  };
  const first = createEmployee('employee', 5);
  const second = createEmployee('peer', 5);
  const reviewer = createEmployee('hr', 4);
  const administrator = createEmployee('admin', 1, '100');
  createEmployee('odept', 5, '100');
  createEmployee('olevel', 5, deptId, positions[1]);
  const employee = await session(first.username, 'g_holiday_employee');
  const peer = await session(second.username, 'g_holiday_employee');
  const hr = await session(reviewer.username, 'g_holiday_employee');
  const activeAdmin = await session(administrator.username, 'g_holiday_employee');
  const { verifyHrTypedDeleteHttp } = await import('./verify-hr-typed-delete-http.mjs');
  await verifyHrTypedDeleteHttp({ ...context, activeAdmin, administrator, employee, first });
  const participants = [first, second, reviewer];
  const draft = {
    cycleName: name, cycleType: 'QUARTERLY', startDate: '2026-07-01', endDate: '2026-09-30',
    scopeDeptIds: [deptId], scopePositionIds: positions, scopeJobLevelIds: [levels[0]],
    evaluationMethod: 'GOAL_BASED', finalScoreMode: 'WEIGHTED_AVG', finalScoreFormula: '',
    scoreConfig: { minScore: '0', maxScore: '100', kraWeight: null, goalWeight: null }, remark: '隔离测试专用',
  };
  rejected(await request(employee, '', draft), '普通员工不能创建周期', [403]);
  rejected(await request(hr, '', { ...draft, tenantId: 100001 }), '不能从客户端指定租户', [400]);
  rejected(await request(hr, '', { ...draft, status: 'COMPLETED' }), '不能从客户端指定周期完成状态', [400]);
  rejected(await request(hr, '', { ...draft, finalScoreMode: 'FORMULA', finalScoreFormula: "Math.max(1,2)" }), '真实接口拒绝公式函数执行', [400]);
  const cycleId = String(successful(await request(hr, '', draft), 'HR创建真实绩效周期'));
  const detail = () => read(admin, `/${cycleId}`);
  const currentVersion = async () => (await detail()).cycle.version;
  const transition = async (status, extra = {}) => successful(await request(admin, `/${cycleId}/transition`, { version: await currentVersion(), targetStatus: status, ...extra }), `推进${status}`);
  const preview = await read(hr, `/${cycleId}/preview`);
  check('范围按部门岗位职级交集预览三人', preview.employees.length === 3 && participants.every(person => preview.employees.some(row => String(row.employeeId) === person.employeeId)));
  rejected(await request(admin, `/${cycleId}/transition`, { version: 0, targetStatus: 'SCORING' }), '周期不能跨阶段');
  rejected(await request(admin, `/${cycleId}/transition`, { version: 0, targetStatus: 'ONGOING', previewDigest: 'stale' }), '过期预览不能启动');
  await transition('ONGOING', { previewDigest: preview.digest });
  database(`UPDATE hr_employee SET position_id=${positions[1]} WHERE tenant_id=100000 AND id=${second.employeeId};`);
  check('调岗后冻结参评名单保持三人', (await detail()).results.length === 3);
  check('两名普通员工只能读取各自参与周期', (await read(employee, '/mine')).rows.some(row => String(row.cycleId) === cycleId)
    && (await read(peer, `/mine/${cycleId}`)).results.every(row => String(row.employeeId) === second.employeeId));
  rejected(await api(employee, `${root}/${cycleId}`), '普通员工不能使用管理详情');
  evidence.scope = true;
  rejected(await request(admin, `/${cycleId}/transition`, { version: await currentVersion(), targetStatus: 'SCORING' }), '目标未下达不能评分');
  const goalInput = person => ({ version: 0, objectiveName: `${name}_${person.employeeId}`, kraId: null,
    nodes: [{ key: 'root', parentKey: null, assigneeType: 'DEPT', assigneeId: deptId, weight: '0', targetValue: '100' },
      { key: 'leaf', parentKey: 'root', assigneeType: 'EMPLOYEE', assigneeId: person.employeeId, weight: '1', targetValue: '100' }] });
  rejected(await request(admin, `/${cycleId}/goals`, { ...goalInput(first), version: await currentVersion(), nodes: [
    { key: 'a', parentKey: 'b', assigneeType: 'EMPLOYEE', assigneeId: first.employeeId, weight: '1', targetValue: '100' },
    { key: 'b', parentKey: 'a', assigneeType: 'EMPLOYEE', assigneeId: first.employeeId, weight: '1', targetValue: '100' },
  ] }, 'PUT'), '真实接口拒绝循环目标树');
  for (const person of participants) successful(await request(hr, `/${cycleId}/goals`, { ...goalInput(person), version: await currentVersion() }, 'PUT'), 'HR下达真实叶子目标');
  const quotas = [{ grade: 'A', percent: '50', minCount: null, maxCount: null }, { grade: 'B', percent: '50', minCount: null, maxCount: null }];
  successful(await request(hr, `/${cycleId}/distribution`, { version: await currentVersion(), ruleName: name, enforceMode: 'BLOCK', distribution: quotas }, 'PUT'), '保存周期强制分布');
  await transition('SCORING');
  const frozenDetail = await detail();
  const leafFor = person => frozenDetail.goals.find(row => row.assigneeType === 'EMPLOYEE' && String(row.assigneeId) === person.employeeId);
  const leaf = leafFor(first);
  const parent = frozenDetail.goals.find(row => row.assigneeType === 'DEPT');
  rejected(await request(hr, `/${cycleId}/goals`, { ...goalInput(first), objectiveId: leaf.objectiveId, version: await currentVersion() }, 'PUT'), '评分后目标冻结');
  rejected(await request(hr, `/${cycleId}/goal-score`, { version: await currentVersion(), assignmentId: parent.assignmentId, score: '80', summary: '父节点' }), '父节点不能重复计分');
  rejected(await request(hr, `/${cycleId}/goal-score`, { version: await currentVersion(), assignmentId: leafFor(reviewer).assignmentId, score: '100', summary: '自打分' }), 'HR不能为自己登记目标评分');
  const missing = successful(await request(admin, `/${cycleId}/calculate`, { version: await currentVersion() }), '读取逐员工缺失评分');
  check('缺项返回三人明细且不补零', missing.results.length === 3 && missing.results.every(row => row.calculatedScore == null && row.error));
  const targetScore = person => ({ version: 0, assignmentId: leafFor(person).assignmentId, score: '80.25', summary: '核实目标达成证据' });
  rejected(await request(employee, `/${cycleId}/goal-score`, { ...targetScore(first), version: await currentVersion() }), '普通员工不能登记目标分数');
  for (const person of participants) successful(await request(admin, `/${cycleId}/goal-score`, { ...targetScore(person), version: await currentVersion() }), '授权人员登记真实目标评分');
  const calculation = successful(await request(admin, `/${cycleId}/calculate`, { version: await currentVersion() }), '真实数据库输入计算总分');
  check('三人目标总分精确为80.2500', calculation.results.length === 3 && calculation.results.every(row => Number(row.calculatedScore) === 80.25 && row.error == null));
  const beforeVisible = await read(employee, `/mine/${cycleId}`);
  check('本人评分过程不泄露内部结果与评价人', beforeVisible.results.length === 1 && beforeVisible.results[0].finalScore == null && Object.keys(beforeVisible.results[0].sourceScores).length === 0 && beforeVisible.results[0].goalScores.length === 0 && beforeVisible.sessions.length === 0);
  evidence.weights = true;
  evidence.scores = true;
  await transition('CALIBRATING');
  rejected(await request(admin, `/${cycleId}/goal-score`, { ...targetScore(first), version: await currentVersion() }), '进入校准后目标评分冻结');
  const calibrate = async (person, grade, score = '80.25', actor = admin) => {
    const current = await detail();
    const result = current.results.find(row => String(row.employeeId) === person.employeeId);
    return request(actor, `/${cycleId}/calibration`, { version: current.cycle.version, appraisalResultId: result.appraisalResultId, resultVersion: result.version, finalScore: score, grade, reason: '核实等级与达成依据' });
  };
  rejected(await calibrate(reviewer, 'A', '100', hr), 'HR不能校准自己的周期结果');
  for (const person of participants) successful(await calibrate(person, 'A'), '逐员工确认校准');
  rejected(await request(admin, `/${cycleId}/transition`, { version: await currentVersion(), targetStatus: 'COMPLETED', acknowledgeWarnings: true }), '强制分布不能用确认警告绕过');
  successful(await calibrate(second, 'B', '81.50'), '保留原分并单独校准最终分');
  const calibrated = await detail();
  const changed = calibrated.results.find(row => String(row.employeeId) === second.employeeId);
  check('校准原分保留且最终分独立保存', Number(changed.calculatedScore) === 80.25 && Number(changed.finalScore) === 81.5);
  check('三人各半配额最大余数按配置顺序分为2和1', calibrated.distribution.valid && calibrated.distribution.grades[0].quota === 2 && calibrated.distribution.grades[1].quota === 1);
  const meetingBody = { version: await currentVersion(), sessionName: `${name}_会议`, scheduledAt: '2026-09-25 11:00:00', location: '隔离验收会议室', facilitatorUserId: reviewer.userId,
    participantUserIds: [reviewer.userId, first.userId], agenda: '核对目标与等级', minutes: '', status: 'PLANNED' };
  const meetingId = String(successful(await request(admin, `/${cycleId}/calibration-session`, meetingBody), '创建真实周期校准会议'));
  check('会议按周期关联且不伪造人才盘点ID', database(`SELECT CONCAT(COALESCE(review_id,'NULL'),':',cycle_id) FROM hr_talent_calibration_session WHERE tenant_id=100000 AND id=${meetingId};`) === `NULL:${cycleId}`);
  rejected(await request(admin, `/${cycleId}/transition`, { version: await currentVersion(), targetStatus: 'COMPLETED' }), '未结束的校准会议阻止完成');
  successful(await request(admin, `/${cycleId}/calibration-session`, { ...meetingBody, version: await currentVersion(), sessionId: meetingId, status: 'COMPLETED', minutes: '完成逐人核对并确认最终等级' }), '保存真实会议完成纪要');
  await transition('COMPLETED');
  const published = await read(employee, `/mine/${cycleId}`);
  check('完成后本人仅获得自己的最终结果', published.results.length === 1 && Number(published.results[0].finalScore) === 80.25 && published.results[0].calibrationReason == null && published.results[0].goalScores.length === 0 && published.goals.every(row => String(row.assigneeId) === first.employeeId));
  evidence.calibration = true;
  evidence.stages = true;
  const freezeDigest = database(`SELECT SHA2(CONCAT(COALESCE(CAST(frozen_config AS CHAR),''),status,version),256) FROM hr_appraisal_cycle WHERE cycle_id=${cycleId};`);
  for (const [endpoint, body, method] of [
    [`/${cycleId}/goals`, { ...goalInput(first), version: await currentVersion() }, 'PUT'],
    [`/${cycleId}/kras`, { version: await currentVersion(), kras: [] }, 'PUT'],
    [`/${cycleId}/distribution`, { version: await currentVersion(), ruleName: name, enforceMode: 'WARN', distribution: quotas }, 'PUT'],
    [`/${cycleId}/goal-score`, { ...targetScore(first), version: await currentVersion() }, 'POST'],
    [`/${cycleId}/calculate`, { version: await currentVersion() }, 'POST'],
    [`/${cycleId}/calibration-session`, { ...meetingBody, version: await currentVersion() }, 'POST'],
    [`/${cycleId}/transition`, { version: await currentVersion(), targetStatus: 'ONGOING' }, 'POST'],
  ]) rejected(await request(admin, endpoint, body, method), '完成周期专用写入口只读');
  for (const [endpoint, body, method = 'POST'] of [
    [`/hr/performance/objectives/${leaf.objectiveId}/approve`, {}],
    ['/hr/performance/assignments', { objectiveId: leaf.objectiveId, assigneeType: 'EMPLOYEE', assigneeId: first.employeeId, weight: '100' }],
    [`/hr/performance/assignment/${leaf.assignmentId}/children`, { children: [] }],
    ['/hr/performance/result', { assignmentId: leaf.assignmentId, actualAmount: '99' }],
    [`/hr/performance/objective/${leaf.objectiveId}/submit-plan`, {}],
    [`/hr/performance/objective/${leaf.objectiveId}/submit-result`, {}],
    ['/hr/performance/results', { objectiveId: leaf.objectiveId, assignmentId: leaf.assignmentId, employeeId: first.employeeId, score: '99' }],
    [`/hr/performance/360/aggregate?objectiveId=${leaf.objectiveId}&evaluateeId=${first.employeeId}`, {}],
    ['/hr/performance/360/invite', { objectiveId: leaf.objectiveId, evaluateeId: first.employeeId, evaluators: [{ evaluatorId: first.employeeId, evaluatorSource: 'SELF' }] }],
    ['/hr/performance/distribution/rules', { id: frozenDetail.distributionRule.ruleId, ruleName: '绕过冻结', distribution: quotas, enforceMode: 'WARN' }],
    [`/hr/performance/distribution/rules/${frozenDetail.distributionRule.ruleId}`, undefined, 'DELETE'],
  ]) rejected(await api(admin, endpoint, { method, body }), `既有入口不能回改周期依据 ${endpoint.split('?')[0]}`);
  check('所有拒绝后完成周期版本及快照未变化', freezeDigest === database(`SELECT SHA2(CONCAT(COALESCE(CAST(frozen_config AS CHAR),''),status,version),256) FROM hr_appraisal_cycle WHERE cycle_id=${cycleId};`));
  evidence.frozen = true;

  const privatePosition = `ap_self_${caseTag}`;
  database(`INSERT INTO hr_position (tenant_id,position_code,position_name,level_id,status,version) VALUES (100000,${literal(privatePosition)},${literal(privatePosition)},${levels[0]},1,0);`);
  const selfPositionId = database(`SELECT id FROM hr_position WHERE tenant_id=100000 AND position_code=${literal(privatePosition)};`);
  database(`UPDATE hr_employee SET position_id=${selfPositionId} WHERE tenant_id=100000 AND id=${reviewer.employeeId};`);
  const formulaDraft = { ...draft, cycleName: `${name}_受邀身份`, scopePositionIds: [selfPositionId], finalScoreMode: 'FORMULA', finalScoreFormula: '${goalScore}*0.8+${selfScore}*0.2' };
  const formulaId = String(successful(await request(hr, '', formulaDraft), '创建受限公式周期'));
  const formulaDetail = () => read(admin, `/${formulaId}`);
  const formulaVersion = async () => (await formulaDetail()).cycle.version;
  const formulaPreview = await read(hr, `/${formulaId}/preview`);
  successful(await request(hr, `/${formulaId}/transition`, { version: 0, targetStatus: 'ONGOING', previewDigest: formulaPreview.digest }), '启动唯一HR参评公式周期');
  successful(await request(hr, `/${formulaId}/goals`, { ...goalInput(reviewer), version: await formulaVersion() }, 'PUT'), '保存公式周期目标');
  successful(await request(hr, `/${formulaId}/transition`, { version: await formulaVersion(), targetStatus: 'SCORING' }), '公式周期进入评分');
  const formulaLeaf = (await formulaDetail()).goals.find(row => row.assigneeType === 'EMPLOYEE');
  successful(await request(admin, `/${formulaId}/goal-score`, { version: await formulaVersion(), assignmentId: formulaLeaf.assignmentId, score: '80', summary: '目标80分' }), '登记公式真实目标输入');
  const noSelf = successful(await request(hr, `/${formulaId}/calculate`, { version: await formulaVersion() }), '公式缺自评返回缺项');
  check('缺公式引用输入不会悄悄补0', noSelf.results[0].calculatedScore == null && /selfScore/.test(noSelf.results[0].error));
  const inviteBody = { objectiveId: formulaLeaf.objectiveId, assignmentId: formulaLeaf.assignmentId, evaluateeId: reviewer.employeeId, evaluators: [{ evaluatorId: reviewer.employeeId, evaluatorSource: 'SELF', weight: '100' }] };
  const invitation = successful(await api(hr, '/hr/performance/360/invite', { method: 'POST', body: inviteBody }), '邀请真实HR本人自评');
  rejected(await api(activeAdmin, '/hr/performance/360/response', { method: 'POST', body: { evaluatorId: invitation[0], score: '90' } }), '在岗管理员不能冒名提交他人自评', [403]);
  rejected(await api(employee, '/hr/performance/360/response', { method: 'POST', body: { evaluatorId: invitation[0], score: '90' } }), '普通员工本人受邀权限不能操作旧评分接口');
  rejected(await api(hr, '/hr/performance/360/invite', { method: 'POST', body: { ...inviteBody, evaluators: [{ evaluatorId: first.employeeId, evaluatorSource: 'SELF', weight: '100' }] } }), '不能把他人邀请伪装成本人自评');
  rejected(await api(hr, '/hr/performance/360/invite', { method: 'POST', body: { ...inviteBody, evaluators: [{ evaluatorId: first.employeeId, evaluatorSource: 'CUSTOMER', weight: '100' }] } }), '没有客户身份入口时拒绝伪造客户评分');
  successful(await api(hr, '/hr/performance/360/response', { method: 'POST', body: { evaluatorId: invitation[0], score: '90', commentText: '真实HR本人评分' } }), '受邀HR本人提交自评');
  const formulaScore = successful(await request(hr, `/${formulaId}/calculate`, { version: await formulaVersion() }), '真实自评来源进入受限公式');
  check('80乘0.8加90乘0.2精确计算为82', Number(formulaScore.results[0].calculatedScore) === 82);
  successful(await request(hr, `/${formulaId}/transition`, { version: await formulaVersion(), targetStatus: 'CALIBRATING' }), '源记录复核后进入校准');
  rejected(await api(hr, `/hr/performance/360/evaluator/${invitation[0]}/cancel`, { method: 'POST', body: {} }), '校准后不能取消被引用的360来源');
  evidence.identity = true;

  const { verifyHrAppraisalBoundaries } = await import('./verify-hr-appraisals-boundaries.mjs');
  await verifyHrAppraisalBoundaries({ ...context, hr, employee, peer, first, second, reviewer, activeAdmin, administrator, draft, positions });

  const foreignRole = database('SELECT role_id FROM sys_user_role WHERE user_id=990000703 AND tenant_id=100001 ORDER BY role_id LIMIT 1;');
  assert.match(foreignRole, /^[1-9]\d*$/);
  const newMenus = '(1882,1883,1884,1885,1886,1894,1895)';
  const originalForeign = database(`SELECT menu_id FROM sys_role_menu WHERE tenant_id=100001 AND role_id=${foreignRole} AND menu_id IN ${newMenus} ORDER BY menu_id;`);
  assert.deepEqual(originalForeign.split(/\r?\n/), ['1882','1883','1884','1885','1886','1894','1895'], 'Current foreign fixture must already have approved appraisal permissions');
  context.journal('foreign-grants-original', { tenantId: '100001', roleId: foreignRole, original: originalForeign, temporary: [] });
  try {
    const foreign = await session('g_import_tenant');
    rejected(await api(foreign, `${root}/${cycleId}`), '另一租户具备同名权限仍不能读取周期');
    rejected(await request(foreign, `/${formulaId}/calculate`, { version: await formulaVersion() }), '另一租户不能计算周期');
    rejected(await api(foreign, `${root}/invitations/mine/${invitation[0]}`), '另一租户不能读取本租户员工邀请');
    rejected(await request(foreign, `/invitations/mine/${invitation[0]}/response`, { version: 0, score: '90', commentText: '跨租户伪造评分' }), '另一租户不能提交本租户员工邀请');
    const foreignId = String(successful(await request(foreign, '', { ...draft, cycleName: `${name}_另一租户`, scopeDeptIds: [], scopePositionIds: [], scopeJobLevelIds: [] }), '另一租户可创建自己周期'));
    check('第二租户周期归属真实上下文而非100000', database(`SELECT tenant_id FROM hr_appraisal_cycle WHERE cycle_id=${foreignId};`) === '100001');
    rejected(await api(admin, `${root}/${foreignId}`), '管理员不能越租户读取周期');
    successful(await request(foreign, `/${foreignId}?version=0`, undefined, 'DELETE'), '第二租户删除自己的草稿');
  } finally {
    assert.equal(database(`SELECT menu_id FROM sys_role_menu WHERE tenant_id=100001 AND role_id=${foreignRole} AND menu_id IN ${newMenus} ORDER BY menu_id;`), originalForeign, 'Original appraisal permissions retained');
    context.journal('foreign-grants-restored', { tenantId: '100001', roleId: foreignRole, unchanged: true });
  }
  check('全流程未增加EMPLOYEE任何授权', employeeGrants === database('SELECT CONCAT(tenant_id,\':\',menu_id) FROM sys_role_menu WHERE role_id=5 ORDER BY tenant_id,menu_id;'));
  evidence.tenants = true;
  if (!process.argv.includes('--hr-appraisals-http-only')) {
    const { verifyHrAppraisalInterface } = await import('./verify-hr-appraisals-ui.mjs');
    await verifyHrAppraisalInterface({ ...context, hr, employee, peer, cycleId, cycleName: name, deptId, positions, levels, participants });
  }
}
