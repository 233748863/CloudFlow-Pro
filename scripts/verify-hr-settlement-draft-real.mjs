import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { ownedGatewayRedis } from './owned-gateway-redis.mjs';
import { verifySettlementDraftInterface } from './verify-hr-settlement-draft-ui.mjs';
import { prepareSettlementWagePolicy } from './verify-hr-settlement-wage-policy-real.mjs';
import { verifySettlementAssetReview } from './verify-hr-settlement-asset-review-real.mjs';
import { verifySettlementApproval } from './verify-hr-settlement-approval-real.mjs';
import { resumeSettlementFunds } from './verify-hr-settlement-funds-real.mjs';

export async function verifyHrSettlementDraft(context) {
  const { admin, api, successful, session: openSession, database, check, caseTag, directory, evidence, state } = context;
  const sensitive = new Set();
  const remember = async page => {
    if (process.argv.includes('--hr-settlement-asset-reminder-only')) {
      const token = await page.evaluate(async () => (await import('/src/utils/authStorage.ts')).getAuthToken());
      assert.ok(token); sensitive.add(token.replace(/^Bearer /, ''));
      await fs.writeFile(path.join(directory, 'private', `asset-reminder-secrets-${caseTag}.json`), JSON.stringify([...sensitive]), { mode: 0o600 });
    }
    return page;
  };
  const session = async (...args) => remember(await openSession(...args));
  await remember(admin);
  const root = '/hr/settlement';
  const marker = `settlement_draft_${caseTag}`;
  const literal = value => `CONVERT(UNHEX('${Buffer.from(String(value)).toString('hex')}') USING utf8mb4)`;
  const grants = database("SELECT CONCAT(tenant_id,':',role_id,':',menu_id) FROM sys_role_menu ORDER BY tenant_id,role_id,menu_id;");
  const menus = database('SELECT menu_id FROM sys_menu ORDER BY menu_id;');
  const design = JSON.parse(await fs.readFile(new URL('../docs/design/H-G剩余设计菜单清单.json', import.meta.url), 'utf8'));
  const fundsMode = ['payment', 'netting', 'receipt'].find(direction => process.argv.includes(`--hr-settlement-funds-${direction}`));
  const approvalMode = process.argv.includes('--hr-settlement-approval-complete') || Boolean(fundsMode);
  const reversalMode = process.argv.includes('--hr-settlement-reversal-complete');
  const approved = design.menus.filter(menu => menu.id >= 1860 && menu.id <= (fundsMode ? 1867 : approvalMode ? 1864 : 1863) && (reversalMode || menu.id !== 1866)); assert.equal(approved.length, reversalMode ? 8 : fundsMode ? 7 : approvalMode ? 5 : 4);
  const redis = await ownedGatewayRedis(state); const temporary = [];
  const clearRoles = () => redis('DEL', ...[1,3,4].flatMap(role => [`100000:menu_details::${role}`, `100000:menu_details::perms:${role}`]));
  try {
  for (const menu of approved) {
    const found = database(`SELECT COUNT(*) FROM sys_menu WHERE menu_id=${menu.id} OR perms=${literal(menu.permission)}${menu.path ? ` OR path=${literal(menu.path)}` : ''};`);
    if (found === '0') {
      assert.equal(database(`SELECT COUNT(*) FROM sys_role_menu WHERE menu_id=${menu.id};`), '0'); temporary.push(menu.id);
      database(`INSERT INTO sys_menu(menu_id,menu_name,parent_id,order_num,path,component,is_frame,is_cache,menu_type,visible,status,perms,icon,create_by)
        VALUES(${menu.id},${literal(menu.name)},${menu.parent},60,${menu.path ? literal(menu.path) : "''"},${menu.component ? literal(menu.component) : 'NULL'},0,0,'${menu.component ? 'C' : 'F'}','${menu.component ? '0' : '1'}','0',${literal(menu.permission)},'Calculator',${literal(marker)});
        INSERT INTO sys_role_menu(tenant_id,role_id,menu_id) VALUES ${design.roleSets[menu.roles].map(role => `(100000,${role},${menu.id})`).join(',')};`);
    } else {
      assert.equal(found, '1');
      assert.equal(database(`SELECT COUNT(*) FROM sys_menu WHERE menu_id=${menu.id} AND parent_id=${menu.parent} AND perms=${literal(menu.permission)} AND status='0'${menu.path ? ` AND path=${literal(menu.path)} AND component=${literal(menu.component)}` : ''};`), '1');
      assert.equal(database(`SELECT CONCAT(tenant_id,':',role_id) FROM sys_role_menu WHERE tenant_id=100000 AND menu_id=${menu.id} ORDER BY tenant_id,role_id;`).split(/\r?\n/).join(','), design.roleSets[menu.roles].map(role => `100000:${role}`).join(','));
    }
  }
  if (temporary.length) clearRoles();
  const resume = process.argv.find(argument => argument.startsWith('--hr-settlement-funds-resume='))?.split('=')[1];
  if (resume) {
    await resumeSettlementFunds({ ...context, fundsMode, resume });
    return;
  }
  database(`INSERT INTO sys_user(tenant_id,dept_id,user_name,nick_name,password,status,deleted,pwd_reset_required,create_by)
    SELECT 100000,100,${literal(marker)},${literal(marker)},password,'0',0,'0',${literal(marker)} FROM sys_user WHERE tenant_id=100000 AND user_name='g_holiday_employee';`);
  const userId = database(`SELECT user_id FROM sys_user WHERE tenant_id=100000 AND user_name=${literal(marker)};`);
  assert.match(userId, /^[1-9]\d*$/);
  database(`INSERT INTO sys_user_role(tenant_id,user_id,role_id) VALUES(100000,${userId},5);
    INSERT INTO hr_employee(tenant_id,employee_no,name,gender,dept_id,employee_status,hire_date,user_id,deleted,create_by)
    VALUES(100000,${literal(marker)},${literal(marker)},'UNKNOWN',100,'REGULAR','2026-01-01',${userId},0,${literal(marker)});`);
  const employeeId = database(`SELECT id FROM hr_employee WHERE tenant_id=100000 AND user_id=${userId};`);
  assert.match(employeeId, /^[1-9]\d*$/);
  const employee = await session(marker, 'g_holiday_employee');
  const application = suffix => {
    database(`INSERT INTO hr_lifecycle_application(tenant_id,application_no,type,employee_id,effective_date,status,create_by)
      VALUES(100000,${literal(`${marker}_${suffix}`)},'RESIGNATION',${employeeId},'2026-01-31','APPROVED',${literal(marker)});`);
    const id = database(`SELECT id FROM hr_lifecycle_application WHERE tenant_id=100000 AND application_no=${literal(`${marker}_${suffix}`)};`);
    assert.match(id, /^[1-9]\d*$/); return id;
  };
  const reject = (result, label) => check(`${label} HTTP=${result.status}`, [400, 401, 403, 404, 409, 422].includes(result.status) && result.body?.code !== 200);
  const read = async id => {
    const response = await api(admin, `${root}/${id}`);
    check('结算明细禁止缓存', response.cacheControl === 'no-store');
    return successful(response, '读取实际结算草稿');
  };
  const applicationId = application('first');
  const options = successful(await api(admin, `${root}/applications?keyword=${marker}`), '实际查询可结算离职申请');
  check('离职选项来自授权范围内的已批准申请', options.rows.some(option => String(option.value) === applicationId && String(option.employeeId) === employeeId));
  reject(await api(employee, root, { method: 'POST', body: { lifecycleApplicationId: applicationId } }), '普通员工不能建结算单');
  const id = String(successful(await api(admin, root, { method: 'POST', body: { lifecycleApplicationId: applicationId, remark: marker } }), '实际创建结算草稿'));
  assert.match(id, /^[1-9]\d*$/);
  reject(await api(admin, root, { method: 'POST', body: { lifecycleApplicationId: applicationId, remark: `${marker}_repeat` } }), '同次离职不能重复建立有效结算');
  let current = await read(id);
  check('结算创建只保存真实员工日期和草稿状态', String(current.employeeId) === employeeId && current.joinDate === '2026-01-01' && current.relievingDate === '2026-01-31' && current.status === 'DRAFT' && !current.calculated);
  reject(await api(employee, `${root}/${id}`), '普通员工不能读取结算管理明细');
  reject(await api(admin, `${root}/${id}`, { method: 'PUT', body: { version: current.version, netAmount: '999999', reviewedBy: userId } }), '服务端拒绝伪造净额及核定人');
  const review = { version: current.version, sampling: { months: ['2026-01'], averagingMonths: '0.5', reason: '按适用测试政策核定月份和半月分母' }, remark: `${marker}_review` };
  successful(await api(admin, `${root}/${id}`, { method: 'PUT', body: review }), '真实保存逐单核定的取样');
  current = await read(id);
  const adminId = await admin.evaluate(async () => String((await (await import('/src/services/api/auth.ts')).getInfo()).userId));
  check('本单月份及平均分母完整保存且核定人来自登录身份', current.sampling.months.join(',') === '2026-01' && current.sampling.averagingMonths === '0.5' && current.sampling.reason === review.sampling.reason && current.sampling.reviewedBy === adminId && Boolean(current.sampling.reviewedTime));
  reject(await api(admin, `${root}/${id}`, { method: 'PUT', body: { ...review, remark: `${marker}_stale` } }), '旧版本不能覆盖本单核定');
  const calculated = successful(await api(admin, `${root}/${id}/calculate`, { method: 'POST', body: { version: current.version } }), '真实汇集空来源并保留缺项');
  check('缺补偿政策保持草稿并列出缺项', calculated.status === 'DRAFT' && calculated.calculated && calculated.missingRequirements.length > 0 && calculated.netAmount === '0.00');
  const before = database(`SELECT CONCAT(status,':',approval_status,':',COALESCE(payment_request_id,'NULL')) FROM hr_final_settlement WHERE tenant_id=100000 AND settlement_id=${id};`);
  check('草稿重算不发起审批付款或入账', before === 'DRAFT:DRAFT:NULL'
    && database(`SELECT COUNT(*) FROM hr_final_settlement_item WHERE tenant_id=100000 AND settlement_id=${id} AND source_posted_flag=1;`) === '0');
  reject(await api(admin, `${root}/${id}`, { method: 'PUT', body: { version: calculated.version, sampling: { months: ['2026-02'], averagingMonths: '1', reason: '越界测试' } } }), '核定月份不能晚于离职月份');
  database(`UPDATE hr_final_settlement SET tenant_id=100001 WHERE tenant_id=100000 AND settlement_id=${id};`);
  try { reject(await api(admin, `${root}/${id}`), '同编号结算跨租户不可见'); }
  finally { database(`UPDATE hr_final_settlement SET tenant_id=100000 WHERE tenant_id=100001 AND settlement_id=${id};`); }
  const raceApplication = application('race');
  const races = await Promise.all(['a', 'b'].map(suffix => api(admin, root, { method: 'POST', body: { lifecycleApplicationId: raceApplication, remark: `${marker}_${suffix}` } })));
  check('并发建单仅一张成功', races.filter(response => response.status === 200 && response.body?.code === 200).length === 1
    && database(`SELECT COUNT(*) FROM hr_final_settlement WHERE tenant_id=100000 AND lifecycle_application_id=${raceApplication} AND settlement_kind='NORMAL' AND superseded_flag=0;`) === '1');
  const prepared = await prepareSettlementWagePolicy({ ...context, employeeId, marker, settlementId: id });
  const policyOptions = successful(await api(admin, `${root}/${id}/policies?keyword=${marker}`), '按结算权限读取本单适用政策');
  check('结算政策选项包含实际核定政策', policyOptions.rows.some(option => String(option.value) === prepared.policyId));
  const beforeRefresh = await read(id);
  database(`UPDATE hr_lifecycle_application SET effective_date='2026-01-30' WHERE tenant_id=100000 AND id=${applicationId};`);
  reject(await api(admin, `${root}/${id}/calculate`, { method: 'POST', body: { version: beforeRefresh.version } }), '离职日期变化阻止沿用旧核定');
  const refreshed = successful(await api(admin, `${root}/${id}/refresh-source`, { method: 'POST', body: { version: beforeRefresh.version } }), '明确核对并更新真实离职日期');
  check('日期变化清空旧政策取样和计算结果', refreshed.relievingDate === '2026-01-30' && refreshed.sampling == null && refreshed.ruleId == null && !refreshed.calculated);
  const createActor = async (suffix, role) => {
    const username = `sd_${suffix}_${caseTag}`;
    database(`INSERT INTO sys_user(tenant_id,dept_id,user_name,nick_name,password,status,deleted,pwd_reset_required,create_by)
      SELECT 100000,100,${literal(username)},${literal(username)},password,'0',0,'0',${literal(marker)} FROM sys_user WHERE tenant_id=100000 AND user_name='g_holiday_employee';`);
    const actorId = database(`SELECT user_id FROM sys_user WHERE tenant_id=100000 AND user_name=${literal(username)};`); assert.match(actorId, /^[1-9]\d*$/);
    database(`INSERT INTO sys_user_role(tenant_id,user_id,role_id) VALUES(100000,${actorId},${role});`);
    return session(username, 'g_holiday_employee');
  };
  const hr = await createActor('hr', 4); const finance = await createActor('finance', 3);
  const uiApplicationId = application('ui');
  const hrOptions = successful(await api(hr, `${root}/applications?keyword=${marker}_ui`), '普通HR读取离职申请');
  check('普通HR保留真实人员范围并可选择测试员工', hrOptions.rows.some(option => String(option.value) === uiApplicationId));
  reject(await api(finance, `${root}/${id}`, { method: 'PUT', body: { version: refreshed.version, remark: '财务不得改核定' } }), '财务只读与计算权限不能修改取样');
  const hrPolicyOptions = successful(await api(hr, `${root}/${id}/policies?keyword=${marker}`), '普通HR实际读取政策选项');
  check('普通HR可选择已核定政策', hrPolicyOptions.rows.some(option => String(option.value) === prepared.policyId));
  if (process.argv.includes('--hr-settlement-draft-complete')) await verifySettlementDraftInterface({ ...context, hr, finance, employee, marker, employeeId, applicationId: uiApplicationId, application, policyId: prepared.policyId });
  if (process.argv.includes('--hr-settlement-draft-complete') || process.argv.includes('--hr-settlement-asset-reminder-only')) await verifySettlementAssetReview({ ...context, hr, finance, employee, marker, userId, settlementId: id });
  if (approvalMode) await verifySettlementApproval({ ...context, hr, finance, employee, marker, userId, employeeId, application, ...prepared, fundsMode });
  evidence.http = true; evidence.review = true; evidence.missingSources = true; evidence.permissions = true; evidence.tenants = true; evidence.concurrency = true;
  evidence.fixtureMarker = marker; evidence.retainedDrafts = true;
  } finally {
    if (temporary.length) {
      database(`DELETE FROM sys_role_menu WHERE tenant_id=100000 AND menu_id IN (${temporary.join(',')});
        DELETE FROM sys_menu WHERE menu_id IN (${temporary.join(',')}) AND create_by=${literal(marker)};`);
      clearRoles();
    }
    check('实际结算专项结束后原菜单和角色授权保持原样', menus === database('SELECT menu_id FROM sys_menu ORDER BY menu_id;') && grants === database("SELECT CONCAT(tenant_id,':',role_id,':',menu_id) FROM sys_role_menu ORDER BY tenant_id,role_id,menu_id;"));
    evidence.restoration = true;
  }
}
