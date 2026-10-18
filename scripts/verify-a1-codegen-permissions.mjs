import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

export async function verifyA1CodegenPermissions(ctx) {
  const { admin, api, get, put, session, check, rows, sql, evidence, codegenSupplier } = ctx;
  const base = '/auth/system/codegen';
  const roleId = 990000702;
  const originalRole = await get('/auth/system/role/' + roleId);
  assert.equal(originalRole.roleKey, 'g_import_readonly');
  const menuRows = rows("SELECT JSON_OBJECT('menuId',menu_id,'parentId',parent_id,'perms',perms) FROM sys_menu "
    + "WHERE status='0' AND perms IN ('system:codegen:list','system:codegen:preview') ORDER BY menu_id;");
  assert.deepEqual([...new Set(menuRows.map(menu => menu.perms))].sort(),
    ['system:codegen:list', 'system:codegen:preview']);
  const readonlyIds = [...new Set([...originalRole.menuIds, 6, ...menuRows.map(menu => menu.menuId)])];
  const observations = [];
  const assign = async menuIds => {
    const current = await get('/auth/system/role/' + roleId);
    await put('/auth/system/role', { ...current, menuIds });
    const persisted = await get('/auth/system/role/' + roleId);
    assert.deepEqual([...persisted.menuIds].sort((first, second) => first - second),
      [...menuIds].sort((first, second) => first - second));
  };
  ctx.codegenPermissionCleanup = async () => {
    await assign(originalRole.menuIds);
    evidence.permissionAssignmentsRestored = true;
  };
  const denied = (result, label) => check(label,
    result.status === 403 || result.status === 200 && result.body?.code === 403);
  const invalidated = async page => {
    const result = await ctx.waitFor(() => api(page, '/auth/info'),
      response => response.status === 401 || response.status === 200 && response.body?.code === 401,
      'A1 role change did not revoke the previous actual session');
    check('AC-3/7 真实角色变更撤销原登录会话', result.status === 401 || result.body?.code === 401);
  };
  await assign(readonlyIds);
  let reader = await session('g_import_readonly');
  const identity = await get('/auth/info', reader);
  check('AC-3 真实只读账号仅获得生成器列表和预览权限', String(identity.user.userId) === '990000704'
    && ['list', 'preview'].every(action => identity.permissions.includes('system:codegen:' + action))
    && ['import', 'edit', 'generate', 'remove'].every(action => !identity.permissions.includes('system:codegen:' + action)));
  const tableId = codegenSupplier.tableId;
  for (const target of ['/db/list', '/list', '/options', '/' + tableId, '/' + tableId + '/preview']) {
    await get(base + target, reader);
    observations.push({ target: base + target, method: 'GET', account: 'readonly', allowed: true });
    check('AC-3 真实只读账号可读取已授权接口 ' + target, true);
  }
  const detail = await get(base + '/' + tableId);
  const metadataBefore = ctx.codegenMetadataSnapshot();
  const filesBefore = JSON.stringify(await ctx.generatedFileSnapshot());
  for (const [target, method, body] of [
    ['/import', 'POST', { moduleName: 'oa', tableNames: ['oa_supplier_category'] }],
    ['', 'PUT', detail], ['/' + tableId + '/sync', 'POST', {}],
    ['/' + tableId + '/download', 'GET', undefined],
    ['/' + tableId + '/write', 'POST', { targetRoot: 'a1-denied-' + ctx.caseTag, confirmOverwrite: false }],
    ['/' + tableId, 'DELETE', undefined],
  ]) {
    const result = await api(reader, base + target, { method, ...(body == null ? {} : { body }) });
    denied(result, 'AC-3 真实只读账号被拒绝未授权操作 ' + method + ' ' + target);
    observations.push({ target: base + target, method, account: 'readonly', allowed: false, status: result.status });
  }
  check('AC-3 被拒绝的生成器操作保持全部配置和写盘文件', metadataBefore === ctx.codegenMetadataSnapshot()
    && filesBefore === JSON.stringify(await ctx.generatedFileSnapshot()));
  const outsider = await session('g_import_tenant');
  for (const target of ['/' + tableId, '/' + tableId + '/preview', '/' + tableId + '/download']) {
    ctx.reject(await api(outsider, base + target), 'AC-3 外租户不能读取或下载本租户生成配置 ' + target);
  }
  const withoutPreview = readonlyIds.filter(identifier => !menuRows.some(menu => menu.menuId === identifier
    && menu.perms === 'system:codegen:preview'));
  await assign(withoutPreview);
  await invalidated(reader);
  reader = await session('g_import_readonly');
  await get(base + '/list', reader);
  denied(await api(reader, base + '/' + tableId + '/preview'), 'AC-3 撤回预览权限后重新登录仍被实际拒绝');
  const revokedIdentity = await get('/auth/info', reader);
  check('AC-3 重新登录获得撤权后的真实权限集合',
    !revokedIdentity.permissions.includes('system:codegen:preview'));
  await assign(readonlyIds);
  await invalidated(reader);
  reader = await session('g_import_readonly');
  await get(base + '/' + tableId + '/preview', reader);

  const original = await get(base + '/' + tableId);
  const configured = structuredClone(original);
  Object.assign(configured.table, { className: 'A1MenuSupplier', packageName: 'com.cloudflow.a1acceptance.menu',
    businessName: 'a1_menu_' + ctx.caseTag, functionName: '生成菜单_' + ctx.caseTag, parentMenuId: 6 });
  try {
    await put(base, configured);
    const current = await get(base + '/' + tableId);
    const files = await get(base + '/' + tableId + '/preview');
    await ctx.retainGenerated('actual-menu-supplier', current, files);
    const menuSql = files['sql/' + configured.table.businessName + '-menu.sql'];
    assert.equal(typeof menuSql, 'string');
    ctx.database(menuSql);
    const menuQuery = "SELECT JSON_OBJECT('menuId',menu_id,'parentId',parent_id,'name',menu_name,'type',menu_type,'perms',perms,'component',component) "
      + 'FROM sys_menu WHERE menu_name LIKE ' + sql('%' + configured.table.functionName) + ' ORDER BY menu_id;';
    const generatedMenus = rows(menuQuery);
    const parent = generatedMenus.find(menu => menu.type === 'C');
    const buttons = generatedMenus.filter(menu => menu.type === 'F');
    check('AC-7 实际菜单语句生成一个菜单与五个可授权按钮', generatedMenus.length === 6 && !!parent
      && parent.component == null && buttons.length === 5 && buttons.every(button => button.parentId === parent.menuId)
      && new Set(buttons.map(button => button.perms)).size === 4);
    const once = JSON.stringify(generatedMenus);
    ctx.database(menuSql);
    check('AC-7 再次执行实际菜单语句保持同一菜单和五个按钮', JSON.stringify(rows(menuQuery)) === once);
    const grantedIds = [...new Set([...readonlyIds, parent.menuId, ...buttons.map(button => button.menuId)])];
    await assign(grantedIds);
    await invalidated(reader);
    reader = await session('g_import_readonly');
    const grantedIdentity = await get('/auth/info', reader);
    check('AC-7 五个按钮实际授权后获得对应四种权限', buttons.every(button => grantedIdentity.permissions.includes(button.perms)));
    const flatten = routers => routers.flatMap(router => [router, ...flatten(router.children || [])]);
    const routes = flatten(await get('/auth/getRouters', reader));
    check('AC-7 真实登录的菜单接口返回生成菜单', routes.some(route => route.menuName === configured.table.functionName
      && String(route.menuId) === String(parent.menuId)));
    await assign(readonlyIds);
    await invalidated(reader);
    reader = await session('g_import_readonly');
    const afterRevocation = await get('/auth/info', reader);
    const afterRoutes = flatten(await get('/auth/getRouters', reader));
    check('AC-7 撤回生成菜单授权后权限与菜单同时消失',
      buttons.every(button => !afterRevocation.permissions.includes(button.perms))
      && !afterRoutes.some(route => String(route.menuId) === String(parent.menuId)));
    ctx.codegenGeneratedMenu = { configured, parent, buttons, generatedMenus, readonlyIds, assign };
  } finally {
    await put(base, original);
  }
  ctx.codegenReader = reader;
  await fs.writeFile(path.join(ctx.directory, 'a1-permission-observations-' + ctx.caseTag + '.json'),
    JSON.stringify({ actualGateway: true, actualLogin: true, actualRoleUpdates: true,
      oldSessionsRevoked: true, reauthenticationUsed: true, observations }, null, 2), { flag: 'wx' });
  evidence.permissions = true;
  evidence.permissionRevocation = true;
  evidence.generatedMenu = true;
}
