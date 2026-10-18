import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { ownedGatewayRedis } from './owned-gateway-redis.mjs';
import { verifyTenantPackageInterface } from './verify-tenant-package-real-ui.mjs';
import { verifyTenantPackageRecovery } from './verify-tenant-package-recovery.mjs';
import { verifyTenantPackageSecrets } from './verify-tenant-package-secrets.mjs';
import { verifyTenantPackageStorage } from './verify-tenant-package-storage.mjs';
import { verifyTenantPackageAudit } from './verify-tenant-package-audit-real.mjs';
import { verifyTenantPackageOperators } from './verify-tenant-package-operators-real.mjs';
import { loadRepository, replayFormal } from './check-batch-h-contracts.mjs';
import { numeric, text } from './check-batch-h-contracts-sql.mjs';

export async function verifyTenantPackage({ admin, api, successful, session, database, check, caseTag, state, accounts, evidence }) {
  const base = '/auth/system/tenant-package';
  const targetId = 100001;
  const fixed = [900, 901, 906];
  const optional = [876, 877, 878, 879, 880, 881, 882, 883, 884, 902, 903, 904, 905, 1206, 1207, 1208, 1762, 1985, 1986];
  const account = accounts.find(item => item.username === 'g_import_admin');
  assert.equal(account.userId, 990000701);
  const redis = await ownedGatewayRedis(state);
  const token = await admin.evaluate(async () => (await import('/src/utils/authStorage.ts')).getAuthToken());
  const proofKey = `auth:platform:recent:internal:${createHash('sha256').update(token.replace(/^Bearer /, '')).digest('hex')}`;
  const rejected = (response, code, label) => {
    check(label, response.status === code && response.body?.code === code && response.body?.data == null);
  };
  const sorted = values => [...values].sort((left, right) => left - right);
  const sameIds = (left, right) => JSON.stringify(sorted(left)) === JSON.stringify(sorted(right));
  const grants = () => database("SET SESSION group_concat_max_len=8388608; SELECT SHA2(GROUP_CONCAT(CONCAT(tenant_id,':',role_id,':',menu_id) ORDER BY tenant_id,role_id,menu_id SEPARATOR ','),256) FROM sys_role_menu;");
  const originalGrants = grants();
  const originalUserCount = Number(database(`SELECT COUNT(*) FROM sys_user WHERE tenant_id=${targetId} AND deleted=0;`));
  const employee = await session('g_holiday_employee');
  const otherAdmin = await session('g_import_other');
  const tenantAdmin = await session('g_import_tenant');
  const secretValues = new Set(accounts.map(item => item.password));
  for (const page of [admin, employee, otherAdmin, tenantAdmin]) {
    const value = await page.evaluate(async () => (await import('/src/utils/authStorage.ts')).getAuthToken());
    if (value) secretValues.add(value.replace(/^Bearer /, ''));
  }
  if (process.argv.includes('--tenant-package-cleanup-only')) {
    const previous = JSON.parse(await fs.readFile(path.join(state.run, 'h5-tenant-package-results.json'), 'utf8'));
    assert.ok(previous.failure && previous.evidence.cleanup === false && /^[a-f0-9]{12}$/.test(previous.caseTag));
    const failedIds = [...new Set(previous.requests.filter(item => item.method === 'DELETE' && item.status >= 400)
      .map(item => item.path.match(/^\/auth\/system\/file\/([1-9][0-9]*)$/)?.[1]).filter(Boolean))];
    assert.ok(failedIds.length > 0 && failedIds.length <= 4);
    const switched = successful(await api(otherAdmin, '/auth/switchTenant', { method: 'POST', body: { tenantId: targetId } }), '恢复清理：原上传者真实切入租户');
    await otherAdmin.evaluate(async value => (await import('/src/utils/authStorage.ts')).setAuthToken(value), switched.token);
    for (const identifier of failedIds) {
      const file = JSON.parse(database(`SELECT JSON_OBJECT('name',file_name,'path',file_path,'owner',create_by,'business',biz_type,'deleted',deleted)
        FROM sys_file WHERE tenant_id=${targetId} AND file_id=${identifier};`));
      assert.equal(file.name, `${previous.caseTag}-quota-b.txt`);
      assert.equal(file.owner, 'g_import_other');
      assert.equal(file.business, null);
      assert.equal(file.deleted, 0);
      const physical = await fs.realpath(path.resolve(state.run, 'profile', file.path.replace(/^\//, '')));
      assert.ok(physical.startsWith(await fs.realpath(path.join(state.run, 'profile')) + path.sep));
      successful(await api(otherAdmin, `/auth/system/file/${identifier}`, { method: 'DELETE' }), '原上传者删除本次失败遗留文件');
      const remaining = await fs.stat(physical).catch(error => { if (error.code === 'ENOENT') return null; throw error; });
      check(`恢复清理仅删除已核对测试文件${identifier}`, remaining === null
        && database(`SELECT COUNT(*) FROM sys_file WHERE tenant_id=${targetId} AND file_id=${identifier} AND deleted=0;`) === '0');
    }
    check('恢复清理未改变角色授权', grants() === originalGrants);
    evidence.cleanup = true;
    return;
  }
  const crossServices = [
    ['/hr/employees?pageNum=1&pageSize=1', 'hr:employees:list'],
    ['/oa/asset/list?pageNum=1&pageSize=1', 'oa:asset:list'],
    ['/crm/customer/list?pageNum=1&pageSize=1', 'crm:customer:list'],
    ['/workflow/wf/tasks/count', 'workflow:task:count'],
  ];
  if (!process.argv.includes('--tenant-package-disabled-only')) {
    for (const [route] of crossServices) successful(await api(tenantAdmin, route), `原租户角色可读取真实业务服务：${route}`);
  }
  const directory = successful(await api(admin, '/auth/tenant/switch-options?current=1&size=1'), '读取真实租户切换目录');
  check('真实切换候选分页且只公开三个字段', directory.current === 1 && directory.size === 1 && directory.total >= 2 && directory.records.length === 1
    && Object.keys(directory.records[0]).sort().join(',') === 'tenantCode,tenantId,tenantName');
  rejected(await api(employee, '/auth/tenant/switch-options'), 403, '员工不能获取租户切换候选');
  rejected(await api(employee, `${base}/list`), 403, '员工无套餐管理入口权限');
  const identity = successful(await api(admin, '/auth/system/platform/access'), '读取真实平台配置状态');
  if (process.argv.includes('--tenant-package-disabled-only')) {
    check('未配置平台名单时明确停用', !identity.configured && !identity.verified);
    rejected(await api(admin, `${base}/list`), 503, '平台身份未配置不能读取套餐');
    rejected(await api(admin, base, { method: 'POST', body: { packageCode: 'DISABLED', packageName: '不得写入', menuIds: [], enabledModules: [], maxUsers: 1, maxStorageMb: 1, price: 0, billingCycle: 'NONE', sortNo: 0, status: 'ACTIVE' } }), 503, '平台身份未配置不能写入套餐');
    check('停用检查未改变角色授权', grants() === originalGrants);
    evidence.disabled = true; evidence.cleanup = true;
    return;
  }
  check('平台名单已配置但新会话尚未再次验证', identity.configured && !identity.verified);
  rejected(await api(admin, `${base}/list`), 403, '平台操作必须先再次验证');
  if (!process.argv.includes('--tenant-package-operators-only')) {
    rejected(await api(otherAdmin, '/auth/system/platform/access/reauthenticate', { method: 'POST', body: { password: accounts.find(item => item.username === 'g_import_other').password } }), 403, '同租户普通ADMIN不能代替平台指定账号');
  } else {
    rejected(await api(otherAdmin, `${base}/list`), 403, '第二名已列入名单的管理员仍须独立再次验证');
  }
  rejected(await api(tenantAdmin, `${base}/list`), 403, '其他租户管理员没有平台套餐权限');
  const switched = successful(await api(otherAdmin, '/auth/switchTenant', { method: 'POST', body: { tenantId: targetId } }), '第二名管理员真实切入额度测试租户');
  secretValues.add(switched.token.replace(/^Bearer /, ''));
  await otherAdmin.evaluate(async value => (await import('/src/utils/authStorage.ts')).setAuthToken(value), switched.token);
  const switchedInfo = successful(await api(otherAdmin, '/auth/info'), '切租户后读取真实身份');
  check('并发上传使用同租户的两名不同管理员', switchedInfo.user.tenantId === targetId && switchedInfo.user.userId !== accounts.find(item => item.username === 'g_import_tenant').userId);
  if (process.argv.includes('--tenant-package-operators-only')) {
    rejected(await api(otherAdmin, `${base}/list`), 403, '已列入平台名单的管理员切入其他租户仍无平台身份');
  }
  const verified = successful(await api(admin, '/auth/system/platform/access/reauthenticate', { method: 'POST', body: { password: account.password } }), '真实密码再次验证');
  check('真实再次验证凭据有效', verified.verified && redis('EXISTS', proofKey) === '1');
  evidence.platformIdentity = true;
  const catalogResponse = await api(admin, `${base}/catalog`);
  const catalog = successful(catalogResponse, '读取真实套餐功能目录');
  const expectedCatalog = replayFormal(loadRepository()).memory.rows('sys_menu').map(menu => ({
    menuId: numeric(menu.menu_id), parentId: numeric(menu.parent_id), menuName: text(menu.menu_name),
    menuType: text(menu.menu_type), permissions: text(menu.perms), enabled: text(menu.status) === '0',
  })).sort((left, right) => left.menuId - right.menuId);
  const actualCatalog = catalog.features.map(feature => ({ menuId: feature.menuId, parentId: feature.parentId,
    menuName: feature.menuName, menuType: feature.menuType, permissions: feature.permissions ?? null, enabled: feature.enabled,
  })).sort((left, right) => left.menuId - right.menuId);
  check(`套餐目录禁止缓存且完整匹配正式${expectedCatalog.length}项菜单`, catalogResponse.cacheControl === 'no-store'
    && catalogResponse.nosniff === 'nosniff' && JSON.stringify(actualCatalog) === JSON.stringify(expectedCatalog));
  check('三项固定操作和19项独立功能精确匹配', sameIds(catalog.features.filter(item => item.fixedAccountOperation).map(item => item.menuId), fixed)
    && sameIds(catalog.features.filter(item => item.independentOperation).map(item => item.menuId), optional));
  check('路由902、切换903、个人资料904对应正确权限', [[902, 'system:auth:router'], [903, 'system:tenant:switch'], [904, 'system:user:profile:view']]
    .every(([menuId, permission]) => catalog.features.some(feature => feature.menuId === menuId && feature.permissions === permission)));
  const tenantColumns = ['tenant_id', 'tenant_code', 'tenant_name', 'version', 'package_id', 'package_version', 'package_override', 'effective_menu_ids', 'user_limit', 'storage_limit', 'storage_used', 'update_time', 'update_by'];
  const snapshot = tenantId => JSON.parse(database(`SELECT JSON_OBJECT(${tenantColumns.map(column => `'${column}',${column}`).join(',')}) FROM sys_tenant WHERE tenant_id=${tenantId};`));
  const originalTenants = [snapshot(100000), snapshot(targetId)];
  check('只使用套餐尚未分配的隔离租户', originalTenants.every(item => item.package_id == null));
  const sql = value => value == null ? 'NULL' : value === '' ? "''" : typeof value === 'number' ? String(value) : `CONVERT(0x${Buffer.from(String(value), 'utf8').toString('hex')} USING utf8mb4)`;
  const adjustments = { addMenuIds: [], removeMenuIds: [], maxUsers: null, maxStorageMb: null };
  const packageCode = `PKG_${caseTag}`;
  const request = { packageCode, packageName: `真实套餐${caseTag}`, menuIds: [1986], enabledModules: [], maxUsers: 2, maxStorageMb: 1, price: 0, billingCycle: 'NONE', sortNo: 0, status: 'DRAFT', remark: '' };
  const fixedPermissions = catalog.features.filter(item => fixed.includes(item.menuId)).map(item => item.permissions);
  let packageId;
  let createdTenantId;
  const createdFiles = [];
  const fileOwners = new Map();
  const quotaUserPrefix = `quota_${caseTag}`;
  const initialPasswordKey = `${targetId}:sys:config:tenant:sys.user.initPassword`;
  const initialPasswordValue = JSON.stringify(`Q9a${caseTag}Zz`);
  secretValues.add(JSON.parse(initialPasswordValue));
  let preparedInitialPassword = false;
  const createTenantCode = `pkg_${caseTag}`;
  let verificationFailure;
  const saveTenant = async (tenantId, template, overrides = adjustments) => {
    const current = snapshot(tenantId);
    return api(admin, '/auth/system/tenant', { method: 'PUT', body: { tenantId, version: current.version, tenantCode: current.tenant_code, tenantName: current.tenant_name,
      status: '0', packageSelection: { packageId: template.packageId, packageVersion: template.version, adjustments: overrides } } });
  };
  try {
    let template = successful(await api(admin, base, { method: 'POST', body: request }), '真实新增套餐草稿');
    packageId = template.packageId;
    assert.ok(Number.isSafeInteger(packageId) && packageId > 0);
    check('套餐自动包含固定操作而不隐含其他独立功能', fixed.every(menuId => template.menuIds.includes(menuId)) && optional.filter(menuId => template.menuIds.includes(menuId)).join(',') === '1986');
    rejected(await saveTenant(targetId, template), 409, '草稿套餐禁止分配');
    request.status = 'ACTIVE';
    template = successful(await api(admin, base, { method: 'PUT', body: { ...request, packageId, version: template.version } }), '真实启用套餐');
    rejected(await api(admin, base, { method: 'PUT', body: { ...request, packageId, version: template.version - 1, remark: '旧版本必须失败' } }), 409, '旧套餐版本不能覆盖新版本');
    const badWrite = { ...request, packageCode: `${packageCode}_BAD`, tenantId: 100001 };
    rejected(await api(admin, base, { method: 'POST', body: badWrite }), 400, '不能通过额外租户字段伪造套餐所属');
    evidence.management = true;
    successful(await saveTenant(targetId, template), '真实给旧租户分配套餐');
    const assigned = snapshot(targetId);
    check('分配一次保存模板版本和实际额度', assigned.package_id === packageId && assigned.package_version === template.version && assigned.user_limit === 2 && assigned.storage_limit === 1);
    const currentInfo = successful(await api(tenantAdmin, '/auth/info'), '原会话读取已收紧权限');
    check('原会话立即收紧为三项固定操作和已选业务搜索', fixedPermissions.every(permission => currentInfo.permissions.includes(permission))
      && currentInfo.permissions.includes('system:search:business') && currentInfo.permissions.length === fixedPermissions.length + 1);
    for (const route of ['/auth/getRouters', '/auth/tenant/switch-options', '/auth/system/user/list']) {
      rejected(await api(tenantAdmin, route), 403, `旧ADMIN会话未选功能立即拒绝：${route}`);
    }
    for (const [route] of crossServices) rejected(await api(tenantAdmin, route), 403, `套餐收紧后真实业务服务拒绝旧会话：${route}`);
    const search = successful(await api(tenantAdmin, '/auth/system/search/business?keyword=PKG_CHECK&limitPerType=1'), '独立搜索入口无需902');
    check('搜索入口可选不等于授予源业务数据权限', search.groups.length === 6 && search.groups.every(group => group.state === 'FORBIDDEN' && group.items.length === 0));
    evidence.currentPermissions = true;
    rejected(await api(admin, '/auth/system/tenant', { method: 'POST', body: { tenantCode: createTenantCode, tenantName: `新增租户${caseTag}`, status: '0' } }), 400, '新增租户必须明确选择套餐');
    successful(await api(admin, '/auth/system/tenant', { method: 'POST', body: { tenantCode: createTenantCode, tenantName: `新增租户${caseTag}`, status: '0', packageSelection: { packageId, packageVersion: template.version, adjustments } } }), '真实创建套餐租户');
    createdTenantId = Number(database(`SELECT tenant_id FROM sys_tenant WHERE tenant_code=${sql(createTenantCode)};`));
    assert.ok(Number.isSafeInteger(createdTenantId) && createdTenantId > targetId);
    check('新租户初始化实际权限和额度', snapshot(createdTenantId).package_id === packageId && snapshot(createdTenantId).user_limit === 2);
    evidence.assignment = true;
    const userAdd = catalog.features.find(item => item.permissions === 'system:user:add');
    const userPage = catalog.features.find(item => item.menuId === userAdd.parentId);
    assert.equal(userPage.menuType, 'C');
    const employeeTemplate = successful(await api(admin, base, { method: 'PUT', body: { ...request, packageId, version: template.version, menuIds: [userPage.menuId, userAdd.menuId], remark: '仅套餐不能为员工扩权' } }), '更新套餐加入用户新增功能');
    successful(await saveTenant(100000, employeeTemplate), '给平台租户临时分配有限套餐');
    const employeeInfo = successful(await api(employee, '/auth/info'), '原员工会话应用套餐交集');
    check('员工仍无用户新增权限，三项账号操作保留', !employeeInfo.permissions.includes('system:user:add') && fixedPermissions.every(permission => employeeInfo.permissions.includes(permission)));
    rejected(await api(employee, '/auth/system/user', { method: 'POST', body: { userName: `forbidden_${caseTag}`, nickName: '不得创建', password: 'Rejected9!Account', status: '0' } }), 403, '套餐已选写权限仍不能替代员工角色授权');
    successful(await api(admin, `${base}/list`), '平台14项操作仍可在受限套餐中管理');
    rejected(await api(admin, '/auth/getRouters'), 403, '平台身份不能绕过未选902');
    evidence.employeeIntersection = true;
    const preview = successful(await api(admin, `${base}/${packageId}/sync-preview`, { method: 'POST', body: { tenantIds: [targetId] } }), '真实生成同步预览');
    check('预览仅记录待变更，旧租户仍保持原套餐版本', preview.status === 'PREVIEWED' && snapshot(targetId).package_version === assigned.package_version);
    rejected(await api(admin, `${base}/sync/${preview.syncId}/confirm`, { method: 'POST', body: { previewHash: '0'.repeat(64) } }), 409, '错误摘要不能确认同步');
    const confirmed = successful(await api(admin, `${base}/sync/${preview.syncId}/confirm`, { method: 'POST', body: { previewHash: preview.preview.hash } }), '真实确认同步');
    check('同步后单项成功且版本与菜单生效', confirmed.status === 'COMPLETED' && confirmed.items[0].status === 'APPLIED' && snapshot(targetId).package_version === employeeTemplate.version);
    const afterSyncVersion = snapshot(targetId).version;
    successful(await api(admin, `${base}/sync/${preview.syncId}/confirm`, { method: 'POST', body: { previewHash: preview.preview.hash } }), '重复确认读取原成功结果');
    check('重复确认不重复写入租户版本', snapshot(targetId).version === afterSyncVersion);
    rejected(await api(tenantAdmin, '/auth/system/search/business?keyword=PKG_CHECK'), 403, '同步收回搜索后旧会话立即受限');
    successful(await api(tenantAdmin, '/auth/system/user/list'), '同步新增页面权限对已有角色立即生效');
    evidence.synchronization = true;
    if (process.argv.includes('--tenant-package-operators-only')) {
      await verifyTenantPackageOperators({ admin, api, successful, rejected, session, database, check, state, accounts,
        packageId, targetId, snapshot, request, template: employeeTemplate, redis, proofKey, secretValues, evidence });
      check('双操作者及动态撤销未改变任何角色菜单授权', grants() === originalGrants);
      await verifyTenantPackageSecrets({ state, database, secretValues, check, evidence, expectedUsers: originalUserCount });
      return;
    }
    if (process.argv.includes('--tenant-package-audit-only')) {
      await verifyTenantPackageAudit({ admin, api, successful, database, check, caseTag, packageId, targetId, snapshot, evidence });
      redis('DEL', proofKey);
      rejected(await api(admin, `${base}/list`), 403, '审计故障专项结束撤销平台再次验证凭据');
      check('审计故障及恢复未改变任何角色菜单授权', grants() === originalGrants);
      await verifyTenantPackageSecrets({ state, database, secretValues, check, evidence, expectedUsers: originalUserCount });
      return;
    }
    const quotaPermissions = ['system:user:list', 'system:user:add', 'system:file:list', 'system:file:upload', 'system:file:remove', ...crossServices.map(entry => entry[1])];
    const selectedMenus = new Set();
    for (const permission of quotaPermissions) {
      const feature = catalog.features.find(item => item.permissions === permission);
      assert.ok(feature, `Quota feature ${permission} exists`);
      selectedMenus.add(feature.menuId);
      if (feature.menuType === 'F' && !feature.independentOperation) {
        let ancestor = catalog.features.find(item => item.menuId === feature.parentId);
        while (ancestor && ancestor.menuType !== 'C') ancestor = catalog.features.find(item => item.menuId === ancestor.parentId);
        assert.ok(ancestor, `Quota feature ${permission} has a page`);
        selectedMenus.add(ancestor.menuId);
      }
    }
    const quotaTemplate = successful(await api(admin, base, { method: 'PUT', body: { ...request, packageId, version: employeeTemplate.version,
      menuIds: [...selectedMenus], enabledModules: ['HR', 'OA', 'CRM', 'WORKFLOW'], remark: '真实并发额度及跨服务准入' } }), '创建本次额度验证的模板版本');
    successful(await saveTenant(targetId, quotaTemplate), '应用真实额度验证套餐');
    for (const [route] of crossServices) successful(await api(tenantAdmin, route), `明确选回后原会话恢复真实业务读取：${route}`);
    const countUsers = () => Number(database(`SELECT COUNT(*) FROM sys_user WHERE tenant_id=${targetId} AND deleted=0;`));
    check('真实并发前租户仅一个已有账号', countUsers() === 1);
    check('隔离开户前置参数不存在，允许本次临时准备', redis('EXISTS', initialPasswordKey) === '0'
      && database(`SELECT COUNT(*) FROM sys_config WHERE tenant_id=${targetId} AND config_key='sys.user.initPassword';`) === '0');
    assert.equal(redis('SET', initialPasswordKey, initialPasswordValue, 'NX', 'EX', '900'), 'OK');
    preparedInitialPassword = true;
    const newUser = suffix => ({ userName: `${quotaUserPrefix}_${suffix}`, nickName: `额度验收${suffix}`, status: '0', roleIds: [] });
    const concurrentUsers = await Promise.all(['first', 'second'].map(suffix => api(tenantAdmin, '/auth/system/user', { method: 'POST', body: newUser(suffix) })));
    console.log(`H5_QUOTA_USER_RESPONSES: ${JSON.stringify(concurrentUsers.map(response => ({ status: response.status, code: response.body?.code, message: response.body?.msg })))}`);
    check('真实并发新增用户只有最后一个名额获准', concurrentUsers.filter(response => response.status === 200 && response.body?.code === 200).length === 1
      && concurrentUsers.filter(response => response.status === 409 && response.body?.code === 409).length === 1 && countUsers() === 2);
    const filePermissions = successful(await api(tenantAdmin, '/auth/info'), '读取真实文件功能授权');
    check('文件上传权限来自套餐与原角色共同授权', filePermissions.permissions.includes('system:file:upload'));
    const content = suffix => Buffer.from(`quota-${caseTag}-${suffix}\n` + suffix.repeat(600000));
    const uploadedBytes = new Map();
    const upload = async suffix => {
      const bytes = content(suffix);
      const actor = suffix === 'b' ? otherAdmin : tenantAdmin;
      const userId = accounts.find(item => item.username === (suffix === 'b' ? 'g_import_other' : 'g_import_tenant')).userId;
      const repeatKey = `cloudflow:repeat_submit::tenant:${targetId}:user:${userId}:uri:/system/file/upload:method:com.cloudflow.auth.controller.system.SysFileController#upload:args:none`;
      const remaining = Number(redis('PTTL', repeatKey));
      if (remaining > 0) await new Promise(resolve => setTimeout(resolve, remaining + 50));
      const response = await api(actor, '/auth/system/file/upload', { method: 'POST', file: { name: `${caseTag}-quota-${suffix}.txt`, type: 'text/plain', content: bytes.toString('base64') } });
      if (response.status === 200 && response.body?.code === 200) {
        const file = response.body.data;
        createdFiles.push(file);
        fileOwners.set(file.fileId, actor);
        uploadedBytes.set(file.fileId, bytes);
      }
      return response;
    };
    const concurrentFiles = await Promise.all(['a', 'b'].map(upload));
    console.log(`H5_QUOTA_FILE_RESPONSES: ${JSON.stringify(concurrentFiles.map(response => ({ status: response.status, code: response.body?.code, message: response.body?.msg })))}`);
    check('真实并发文件共享1MB总额，仅一份入库', concurrentFiles.filter(response => response.body?.code === 200).length === 1 && createdFiles.length === 1
      && concurrentFiles.some(response => response.status === 409 && response.body?.code === 409 && /存储空间不足/.test(response.body?.msg || '')));
    successful(await saveTenant(targetId, quotaTemplate, { ...adjustments, maxUsers: 1, maxStorageMb: 2 }), '显式降用户额度并增加存储额度');
    rejected(await api(tenantAdmin, '/auth/system/user', { method: 'POST', body: newUser('third') }), 409, '已有用户超额后不能新增用户');
    check('降低用户额度保留已有两个账号及读取', countUsers() === 2 && successful(await api(tenantAdmin, '/auth/system/user/list'), '超额仍可读取已有用户').length === 2);
    successful(await upload('c'), '明确扩容后第二份文件获准');
    successful(await saveTenant(targetId, quotaTemplate, { ...adjustments, maxUsers: 1, maxStorageMb: 1 }), '将存储额度降到已有用量以下');
    const rejectedFile = await upload('d');
    check('已有文件超额时新增明确失败且不增加引用', rejectedFile.status === 409 && rejectedFile.body?.code === 409 && /存储空间不足/.test(rejectedFile.body?.msg || '') && createdFiles.length === 2);
    for (const file of createdFiles) {
      const owner = fileOwners.get(file.fileId);
      const downloaded = await api(owner, `/auth/system/file/${file.fileId}/content`);
      const expected = uploadedBytes.get(file.fileId);
      check(`存储降额保留文件${file.fileId}及真实下载字节`, downloaded.status === 200 && downloaded.size === expected.length && downloaded.sha256 === createHash('sha256').update(expected).digest('hex'));
      const profile = await fs.realpath(path.join(state.run, 'profile'));
      const physical = await fs.realpath(path.resolve(profile, file.filePath.replace(/^\//, '')));
      assert.ok(physical.startsWith(profile + path.sep));
      check(`文件${file.fileId}物理存储保持在D盘隔离目录`, Buffer.compare(await fs.readFile(physical), expected) === 0);
      rejected(await api(owner === tenantAdmin ? otherAdmin : tenantAdmin, `/auth/system/file/${file.fileId}/content`), 403, `套餐已选文件权限仍不允许其他管理员读取私有文件${file.fileId}`);
    }
    evidence.quotas = true;
    if (['--tenant-package-storage-only', '--tenant-package-storage-bound-only', '--tenant-package-storage-import-only', '--tenant-package-storage-hr-only', '--tenant-package-storage-contract-only', '--tenant-package-storage-generated-only'].some(mode => process.argv.includes(mode))) {
      await verifyTenantPackageStorage({ admin, tenantAdmin, api, successful, database, check, caseTag, state, targetId,
        catalog, request, quotaTemplate, saveTenant, adjustments, snapshot, evidence, redis });
    }
    if (process.argv.includes('--tenant-package-recovery-only')) {
      await verifyTenantPackageRecovery({ admin, api, successful, check, packageId, targetId, createdTenantId, snapshot,
        saveTenant, quotaTemplate, account, evidence });
    }
    if (process.argv.includes('--tenant-package-only')) {
      await verifyTenantPackageInterface({ admin, tenantAdmin, employee, api, successful, check, caseTag, state, account, evidence,
        packageId, optional, fixed, snapshot, targetId, revokeProof: () => redis('DEL', proofKey) });
    }
    redis('DEL', proofKey);
    rejected(await api(admin, `${base}/list`), 403, '再次验证凭据撤销后即使套餐例外也拒绝平台操作');
    check('业务操作未增加任何角色菜单授权', grants() === originalGrants);
    await verifyTenantPackageSecrets({ state, database, secretValues, check, evidence });
  } catch (error) {
    verificationFailure = error;
    throw error;
  } finally {
    const cleanupFailures = [];
    if (preparedInitialPassword) {
      redis('EVAL', "if redis.call('GET',KEYS[1])==ARGV[1] then return redis.call('DEL',KEYS[1]) else return 0 end", '1', initialPasswordKey, initialPasswordValue);
    }
    for (const file of createdFiles) {
      try {
        successful(await api(fileOwners.get(file.fileId), `/auth/system/file/${file.fileId}`, { method: 'DELETE' }), '清理本次真实额度文件');
        const physical = path.resolve(state.run, 'profile', file.filePath.replace(/^\//, ''));
        assert.ok(physical.startsWith(path.resolve(state.run, 'profile') + path.sep));
        const remainingFile = await fs.stat(physical).catch(error => { if (error.code === 'ENOENT') return null; throw error; });
        check(`真实删除清理文件${file.fileId}物理内容与有效引用`, remainingFile === null
          && database(`SELECT COUNT(*) FROM sys_file WHERE tenant_id=${targetId} AND file_id=${file.fileId} AND deleted=0;`) === '0');
      } catch (error) {
        cleanupFailures.push(error);
      }
    }
    const userPredicate = `tenant_id=${targetId} AND user_name IN (${['first', 'second', 'third'].map(suffix => sql(`${quotaUserPrefix}_${suffix}`)).join(',')})`;
    try {
      database(`START TRANSACTION;
      DELETE FROM sys_user_role WHERE tenant_id=${targetId} AND user_id IN (SELECT user_id FROM sys_user WHERE ${userPredicate});
      DELETE FROM sys_user_post WHERE tenant_id=${targetId} AND user_id IN (SELECT user_id FROM sys_user WHERE ${userPredicate});
      DELETE FROM sys_user WHERE ${userPredicate}; COMMIT;`);
    } catch (error) {
      cleanupFailures.push(error);
    }
    const restore = originalTenants.map(tenant => `UPDATE sys_tenant SET ${tenantColumns.filter(column => column !== 'tenant_id').map(column => `${column}=${sql(tenant[column])}`).join(',')} WHERE tenant_id=${tenant.tenant_id};`).join('\n');
    const packageCleanup = packageId ? `DELETE item FROM sys_tenant_package_sync_item item JOIN sys_tenant_package_sync batch ON batch.sync_id=item.sync_id WHERE batch.package_id=${packageId} AND batch.tenant_id=100000;
      DELETE FROM sys_tenant_package_sync WHERE package_id=${packageId} AND tenant_id=100000;
      DELETE FROM sys_tenant_package WHERE package_id=${packageId} AND tenant_id=100000 AND package_code=${sql(packageCode)};` : '';
    database(`START TRANSACTION; ${restore}
      DELETE FROM sys_tenant WHERE tenant_code=${sql(createTenantCode)} AND package_id=${packageId || 0}; ${packageCleanup} COMMIT;`);
    check('隔离租户套餐快照及全角色授权完整恢复', originalTenants.every(tenant => JSON.stringify(snapshot(tenant.tenant_id)) === JSON.stringify(tenant)) && grants() === originalGrants);
    redis('DEL', proofKey);
    if (['--tenant-package-storage-only', '--tenant-package-storage-bound-only', '--tenant-package-storage-import-only', '--tenant-package-storage-hr-only', '--tenant-package-storage-contract-only', '--tenant-package-storage-generated-only'].some(mode => process.argv.includes(mode)) && !evidence.storageCleanup) {
      cleanupFailures.push(new Error('跨服务附件清理证据尚未通过'));
    }
    if (process.argv.includes('--tenant-package-storage-bound-only') && (!evidence.storageBoundCleanup || !evidence.storageAdditionalCleanup || !evidence.storageMeetingPhotoCleanup || !evidence.storageWorkflowFileCleanup || !evidence.storageSeverancePolicyCleanup)) {
      cleanupFailures.push(new Error('已绑定业务附件清理证据尚未通过'));
    }
    if (process.argv.includes('--tenant-package-storage-import-only') && !evidence.storageImportFilesCleanup) {
      cleanupFailures.push(new Error('通用导入原文件清理证据尚未通过'));
    }
    if (process.argv.includes('--tenant-package-storage-hr-only') && (!evidence.storageTrainingAgreementCleanup || !evidence.storageExitInterviewCleanup || !evidence.storageAdvanceProofCleanup)) {
      cleanupFailures.push(new Error('人事附件清理证据尚未通过'));
    }
    if (process.argv.includes('--tenant-package-storage-contract-only') && !evidence.storageContractFilesCleanup) {
      cleanupFailures.push(new Error('合同附件清理证据尚未通过'));
    }
    if (process.argv.includes('--tenant-package-storage-generated-only') && !evidence.storageImportGeneratedCleanup) {
      cleanupFailures.push(new Error('导入生成文件清理证据尚未通过'));
    }
    if (cleanupFailures.length) throw new AggregateError([...(verificationFailure ? [verificationFailure] : []), ...cleanupFailures], '套餐真实验收清理不完整');
    evidence.cleanup = true;
  }
}
