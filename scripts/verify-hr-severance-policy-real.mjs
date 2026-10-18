import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { ownedGatewayRedis } from './owned-gateway-redis.mjs';
import { verifySeverancePolicyInterface } from './verify-hr-severance-policy-ui.mjs';

export async function verifyHrSeverancePolicy(context) {
  const { api, successful, session, database, check, caseTag, evidence, state } = context;
  const root = '/hr/severance-rule'; const marker = `sv_${caseTag}`;
  const literal = value => `CONVERT(UNHEX('${Buffer.from(String(value)).toString('hex')}') USING utf8mb4)`;
  const grantsSql = "SELECT CONCAT(tenant_id,':',role_id,':',menu_id) FROM sys_role_menu ORDER BY tenant_id,role_id,menu_id;";
  const grants = database(grantsSql); const people = []; let roleId; let componentId; let temporaryMenu = false;
  const redis = await ownedGatewayRedis(state);
  const clearRoles = () => redis('DEL', ...[1,4,6].flatMap(role => [`100000:menu_details::${role}`, `100000:menu_details::perms:${role}`]));
  const identifier = value => { const text = String(value); assert.match(text, /^[1-9]\d*$/); return text; };
  const rejected = (result, label, code) => check(`${label} HTTP=${result.status} code=${result.body?.code}`, [400,403,404,409,422].includes(result.status) && result.body?.code !== 200 && (!code || result.body.code === code));
  const createPerson = (suffix, tenant, role) => {
    const username = `${marker}_${suffix}`; const donor = tenant === 100000 ? 'g_holiday_employee' : 'g_import_tenant';
    database(`INSERT INTO sys_user (tenant_id,dept_id,user_name,nick_name,password,status,deleted,pwd_reset_required,create_by)
      SELECT ${tenant},dept_id,${literal(username)},${literal(username)},password,'0',0,'0',${literal(marker)} FROM sys_user WHERE tenant_id=${tenant} AND user_name=${literal(donor)};`);
    const userId = identifier(database(`SELECT user_id FROM sys_user WHERE tenant_id=${tenant} AND user_name=${literal(username)};`));
    people.push({ tenant, userId, username });
    database(`INSERT INTO sys_user_role (tenant_id,user_id,role_id) VALUES (${tenant},${userId},${role});`); return { username, donor };
  };
  try {
    const existingMenuCount = database("SELECT COUNT(*) FROM sys_menu WHERE menu_id=1868 OR perms='hr:severance:manage' OR path='/hr/severance-rules';");
    if (existingMenuCount === '0') {
      check('核定菜单1868没有遗留授权', database('SELECT COUNT(*) FROM sys_role_menu WHERE menu_id=1868;') === '0');
      temporaryMenu = true;
      database(`INSERT INTO sys_menu (menu_id,menu_name,parent_id,order_num,path,component,is_frame,is_cache,menu_type,visible,status,perms,icon,create_by)
      VALUES (1868,'经济补偿规则',7,58,'/hr/severance-rules','pages/hr/rules/HrSeveranceRulePage',0,0,'C','0','0','hr:severance:manage','FileCheck2',${literal(marker)});
      INSERT INTO sys_role_menu (tenant_id,role_id,menu_id) VALUES (100000,1,1868),(100000,4,1868),(100000,6,1868);`);
    } else {
      check('已安装政策菜单字段严格匹配批准范围', existingMenuCount === '1' && database("SELECT COUNT(*) FROM sys_menu WHERE menu_id=1868 AND parent_id=7 AND menu_name='经济补偿规则' AND path='/hr/severance-rules' AND component='pages/hr/rules/HrSeveranceRulePage' AND menu_type='C' AND visible='0' AND status='0' AND perms='hr:severance:manage';") === '1');
      check('已安装政策授权仅为本租户管理员、人事和法务', database("SELECT CONCAT(tenant_id,':',role_id) FROM sys_role_menu WHERE menu_id=1868 ORDER BY tenant_id,role_id;").split(/\r?\n/).join(',') === '100000:1,100000:4,100000:6');
    }
    clearRoles();
    database(`INSERT INTO sys_role (tenant_id,role_name,role_key,role_sort,data_scope,status,deleted) VALUES (100001,${literal(marker)},${literal(marker)},999,0,'0',0);`);
    roleId = identifier(database(`SELECT role_id FROM sys_role WHERE tenant_id=100001 AND role_key=${literal(marker)};`));
    database(`INSERT INTO sys_role_menu (tenant_id,role_id,menu_id) VALUES (100001,${roleId},1868),(100001,${roleId},7),(100001,${roleId},900),(100001,${roleId},902);`);
    const hrPerson = createPerson('hr', 100000, 4); const peerPerson = createPerson('peer', 100000, 5); const foreignPerson = createPerson('foreign', 100001, roleId);
    const hr = await session(hrPerson.username, hrPerson.donor); const peer = await session(peerPerson.username, peerPerson.donor); const foreign = await session(foreignPerson.username, foreignPerson.donor);
    check('外租户验证角色具备页面所需的身份读取权限', successful(await api(foreign, '/auth/info'), '外租户真实读取身份').permissions.includes('hr:severance:manage'));
    const foreignMenus = successful(await api(foreign, '/auth/getRouters'), '外租户真实读取菜单');
    const containsPolicy = items => items.some(item => Number(item.menuId) === 1868 || containsPolicy(item.children || []));
    check('外租户真实菜单包含补偿政策页面', containsPolicy(foreignMenus));
    database(`INSERT INTO hr_comp_component (tenant_id,component_code,component_name,component_type,status,version) VALUES (100000,${literal(marker)},${literal(marker)},'FIXED',1,0);`);
    componentId = identifier(database(`SELECT id FROM hr_comp_component WHERE tenant_id=100000 AND component_code=${literal(marker)};`));
    const input = { ruleCode: `${marker}_main`, ruleName: '核定政策真实验收', effectiveFrom: '2026-01-01', effectiveTo: null, salaryComponentIds: [componentId], averagingMonths: 12,
      serviceRounding: 'ACTUAL_MONTHS', socialMonthlySalary: '10000.00', baseCapMultiplier: '3.0000', maxCompensationMonths: '12.0000', noticeMonths: '0.0000',
      leaveDailyDivisor: '21.7500', leaveHoursPerDay: '8.0000', leaveCashMultiplier: '1.0000', remark: `${marker}_private`,
      slabs: [{ sortNo: 0, minServiceYears: '0.0000', maxServiceYears: null, calculationMode: 'PER_YEAR', compensationMonths: '1.0000' }] };
    const read = async id => {
      const response = await api(hr, `${root}/${id}`); check('政策详情不缓存', response.cacheControl?.split(',').every(value => value.trim() === 'no-store'));
      return successful(response, '读取政策详情');
    };
    check('实际工资项目可按名称选择', successful(await api(hr, `${root}/components`), '查询基数项目').some(option => String(option.value) === componentId && option.label === marker));
    rejected(await api(peer, root, { method: 'POST', body: input }), '员工不能建立补偿政策');
    for (const forged of [{ status: 'CONFIRMED' }, { tenantId: 100001 }, { confirmedBy: 1 }, { policyFileId: 1 }]) rejected(await api(hr, root, { method: 'POST', body: { ...input, ...forged } }), '客户端不能伪造租户、核定结果或文件');
    rejected(await api(hr, root, { method: 'POST', body: { ...input, baseCapMultiplier: '3.00001' } }), '倍率超出四位小数明确拒绝');
    rejected(await api(foreign, root, { method: 'POST', body: input }), '外租户同权限不能引用本租户工资项目', 'INVALID_PARAMETER');
    const id = identifier(successful(await api(hr, root, { method: 'POST', body: input }), 'HR实际创建政策草稿'));
    let row = await read(id);
    check('政策草稿保留核定数值且未自动确认', row.status === 'DRAFT' && row.settings.socialMonthlySalary === '10000.00' && row.settings.baseCapMultiplier === '3.0000' && row.confirmedBy === null && row.missingRequirements.length === 1);
    rejected(await api(hr, `${root}/${id}/confirm`, { method: 'POST', body: { version: row.version } }), '缺政策文件不能核定', 'SEVERANCE_POLICY_INCOMPLETE');
    rejected(await api(peer, `${root}/${id}`), '普通员工不能读取内部政策');
    rejected(await api(foreign, `${root}/${id}`), '外租户同权限不能读取政策', 'SEVERANCE_RULE_NOT_FOUND');
    check('外租户政策列表为空', successful(await api(foreign, `${root}/list`), '外租户列表').total === 0); evidence.permissions = true; evidence.tenants = true;
    const pdf = Buffer.from('%PDF-1.4\nprivate-policy-content\n%%EOF\n'); const file = { name: `${marker}.pdf`, content: pdf.toString('base64'), type: 'application/pdf' };
    row = successful(await api(hr, `${root}/${id}/policy?version=${row.version}`, { method: 'POST', file }), '实际上传政策文件');
    const fileId = identifier(row.policyFile.fileId);
    check('文件仅绑定当前政策且无公共地址', database(`SELECT COUNT(*) FROM sys_file WHERE tenant_id=100000 AND file_id=${fileId} AND biz_type='HR_SEVERANCE_POLICY' AND biz_id=${id} AND file_type='HR_SEVERANCE_POLICY' AND url='';`) === '1');
    const storedPath = database(`SELECT file_path FROM sys_file WHERE file_id=${fileId};`);
    for (const endpoint of [`/auth/system/file/${fileId}/content`, `/auth/system/file/access?path=${encodeURIComponent(storedPath)}`]) {
      const response = await api(context.admin, endpoint); check('AUTH通用文件入口拒绝管理员读取政策文件', response.status === 403 && response.body?.code !== 200);
    }
    const download = await api(hr, `${root}/${id}/policy`);
    check('政策业务下载字节完整且禁止缓存', download.status === 200 && download.sha256 === createHash('sha256').update(pdf).digest('hex') && download.nosniff === 'nosniff' && download.cacheControl?.split(',').every(value => value.trim() === 'no-store'));
    rejected(await api(foreign, `${root}/${id}/policy`), '外租户不能下载政策文件', 'SEVERANCE_RULE_NOT_FOUND'); evidence.privateFile = true;
    const clear = { ...row.settings, version: row.version, socialMonthlySalary: null, baseCapMultiplier: null, maxCompensationMonths: null, remark: null };
    successful(await api(hr, `${root}/${id}`, { method: 'PUT', body: clear }), '可选政策字段真实清空'); row = await read(id);
    check('清空数值和说明确实保存', row.settings.socialMonthlySalary === null && row.settings.baseCapMultiplier === null && row.settings.maxCompensationMonths === null && row.settings.remark === null);
    const race = await Promise.all(['并发政策甲','并发政策乙'].map(ruleName => api(hr, `${root}/${id}`, { method: 'PUT', body: { ...row.settings, version: row.version, ruleName } })));
    check('同版本并发编辑仅一项成功且另一项明确冲突', race.filter(result => result.status === 200 && result.body?.code === 200).length === 1 && race.some(result => result.status === 409 && result.body?.code === 'VERSION_CONFLICT')); evidence.concurrency = true;
    row = await read(id); successful(await api(hr, `${root}/${id}/confirm`, { method: 'POST', body: { version: row.version } }), 'HR实际核定政策'); row = await read(id);
    check('核定后记录只读且保存核定人时间', row.status === 'CONFIRMED' && row.confirmedBy != null && row.confirmedTime != null && row.editable === false);
    rejected(await api(hr, `${root}/${id}`, { method: 'PUT', body: { ...row.settings, version: row.version, noticeMonths: '1.0000' } }), '核定后禁止改金额规则', 'SEVERANCE_RULE_READ_ONLY');
    check('核定审计保留已批准舍入方式', database(`SELECT COUNT(*) FROM hr_audit_log WHERE tenant_id=100000 AND business_domain='HR_SEVERANCE_POLICY' AND business_id=${id} AND operation_type='CONFIRM' AND after_data LIKE '%HALF_UP%';`) === '1');
    evidence.http = true;
    if (process.argv.includes('--hr-severance-policy-complete')) await verifySeverancePolicyInterface({ ...context, hr, peer, foreign, componentId, marker, input });
  } finally {
    database(`UPDATE sys_file SET deleted=1 WHERE tenant_id=100000 AND file_type='HR_SEVERANCE_POLICY' AND biz_type='HR_SEVERANCE_POLICY'
      AND biz_id IN (SELECT rule_id FROM hr_severance_rule WHERE tenant_id=100000 AND LEFT(rule_code,LENGTH(${literal(marker)}))=${literal(marker)});
      DELETE FROM hr_severance_rule_slab WHERE tenant_id=100000 AND rule_id IN (SELECT rule_id FROM hr_severance_rule WHERE tenant_id=100000 AND LEFT(rule_code,LENGTH(${literal(marker)}))=${literal(marker)});
      DELETE FROM hr_severance_rule WHERE tenant_id=100000 AND LEFT(rule_code,LENGTH(${literal(marker)}))=${literal(marker)};`);
    if (componentId) database(`DELETE FROM hr_comp_component WHERE tenant_id=100000 AND id=${componentId} AND component_code=${literal(marker)};`);
    for (const person of people) database(`DELETE FROM sys_user_role WHERE tenant_id=${person.tenant} AND user_id=${person.userId}; UPDATE sys_user SET status='1',deleted=1 WHERE tenant_id=${person.tenant} AND user_id=${person.userId} AND create_by=${literal(marker)};`);
    if (roleId) database(`DELETE FROM sys_role_menu WHERE tenant_id=100001 AND role_id=${roleId}; DELETE FROM sys_role WHERE tenant_id=100001 AND role_id=${roleId} AND role_key=${literal(marker)};`);
    if (temporaryMenu) { database(`DELETE FROM sys_role_menu WHERE menu_id=1868; DELETE FROM sys_menu WHERE menu_id=1868 AND create_by=${literal(marker)};`); clearRoles(); }
    check('政策验证结束后全部原角色授权保持不变', grants === database(grantsSql)); evidence.cleanup = true;
    console.log(`H2_SEVERANCE_POLICY_CLEANUP: grants_restored=true; temporary_menu_removed=${temporaryMenu}; installed_menu_preserved=${!temporaryMenu}; audit_retained=true; test_users_disabled=true; production_modified=false`);
  }
}
