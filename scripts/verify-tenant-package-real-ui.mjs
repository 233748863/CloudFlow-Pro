import path from 'node:path';

export async function verifyTenantPackageInterface({ admin, tenantAdmin, employee, api, successful, check, caseTag, state, account, evidence,
  packageId, optional, fixed, snapshot, targetId, revokeProof }) {
  const origin = new URL(admin.url()).origin;
  const packagePath = '/system/tenant-packages';
  const packageApi = '/api/auth/system/tenant-package';
  const events = [];
  const errors = [];
  const capture = request => {
    const address = new URL(request.url());
    if (address.pathname.startsWith('/api/')) events.push({ path: address.pathname, method: request.method() });
  };
  const captureError = error => errors.push(error.message);
  admin.on('request', capture);
  admin.on('pageerror', captureError);
  admin.setDefaultTimeout(30000);
  const navigate = route => admin.goto(`${origin}${route}`, { waitUntil: 'domcontentloaded' });
  const visibleButton = label => admin.getByRole('button', { name: label, exact: true }).filter({ visible: true });
  const row = () => admin.locator('tr, article').filter({ hasText: `真实套餐${caseTag}` }).filter({ visible: true });
  const observeWrite = async (route, method, action) => {
    const received = admin.waitForResponse(response => new URL(response.url()).pathname === route && response.request().method() === method);
    await action();
    const response = await received;
    const body = await response.json();
    return successful({ status: response.status(), body }, `真实页面${method} ${route}`);
  };
  const verifyIdentity = async () => {
    await admin.getByLabel('当前账号密码', { exact: true }).fill(account.password);
    await observeWrite('/api/auth/system/platform/access/reauthenticate', 'POST', () => visibleButton('验证身份').click());
    await visibleButton('新增套餐').waitFor();
  };
  let droppedHandler;
  let droppedPattern;
  try {
    revokeProof();
    await navigate(packagePath);
    await visibleButton('验证身份').waitFor();
    check('电脑真实页面在再次验证前不读取套餐目录或列表', !events.some(event => event.path.startsWith(`${packageApi}/`)));
    await verifyIdentity();
    check('无902仍有平台套餐直接入口', await admin.locator('a[href="/system/tenant-packages"]').filter({ visible: true }).count() > 0);
    await visibleButton('新增套餐').click();
    for (const menuId of fixed) {
      const checkbox = admin.locator(`[data-menu-id="${menuId}"] input`);
      check(`真实目录固定操作${menuId}不可取消`, await checkbox.isChecked() && await checkbox.isDisabled());
    }
    const independent = admin.locator('details').filter({ has: admin.locator('summary', { hasText: '独立可选功能' }) });
    check('真实页面独立功能精确19项且默认不选', await independent.locator('[data-menu-id]').count() === 19
      && await independent.locator('input:checked').count() === 0);
    await visibleButton('关闭').click();
    await row().getByRole('button', { name: '编辑套餐', exact: true }).click();
    for (const menuId of optional) await admin.locator(`[data-menu-id="${menuId}"] input`).check();
    let template = await observeWrite(packageApi, 'PUT', () => visibleButton('保存套餐').click());
    check('电脑勾选19项后真实数据库保存完整集合', optional.every(menuId => template.menuIds.includes(menuId))
      && template.packageId === packageId && snapshot(targetId).package_version < template.version);
    await admin.getByRole('dialog').waitFor({ state: 'hidden' });
    await row().getByRole('button', { name: '编辑套餐', exact: true }).waitFor();
    await admin.screenshot({ path: path.join(state.run, `h5-package-desktop-${caseTag}.png`), fullPage: true });

    await navigate('/system/tenant');
    const tenantRow = admin.getByRole('row').filter({ hasText: `ID ${targetId}` });
    await tenantRow.getByRole('button', { name: '编辑租户', exact: true }).waitFor();
    check('电脑真实额度展示超额后禁止新增', await tenantRow.getByText('已超额，禁止新增用户', { exact: true }).isVisible()
      && await tenantRow.getByText('已超额，禁止新增文件', { exact: true }).isVisible());
    const beforeAssignment = snapshot(targetId);
    await tenantRow.getByRole('button', { name: '编辑租户', exact: true }).click();
    await admin.getByLabel('明确改选套餐或调整个别覆盖').check();
    check('真实页面未重新选择版本禁止保存', await visibleButton('保存修改').isDisabled());
    await admin.getByRole('radio', { name: new RegExp(`真实套餐${caseTag}`) }).check();
    check('重新选择保留原有个别额度', await admin.getByLabel('个别用户上限（留空沿用套餐）', { exact: true }).inputValue() === '1'
      && await admin.getByLabel('个别存储上限（MB，留空沿用套餐）', { exact: true }).inputValue() === '1'
      && snapshot(targetId).version === beforeAssignment.version);
    await observeWrite('/api/auth/system/tenant', 'PUT', () => visibleButton('保存修改').click());
    const assigned = snapshot(targetId);
    check('电脑明确分配后仅目标租户应用新版本并保留额度', assigned.package_version === template.version
      && assigned.version === beforeAssignment.version + 1 && assigned.user_limit === 1 && assigned.storage_limit === 1);
    const selectedInfo = successful(await api(tenantAdmin, '/auth/info'), '页面分配后旧会话读取权限');
    check('页面分配后原会话获得已选路由、切换与搜索入口', ['system:auth:router', 'system:tenant:switch', 'system:search:business'].every(permission => selectedInfo.permissions.includes(permission)));
    evidence.desktop = true;

    await admin.setViewportSize({ width: 390, height: 844 });
    await navigate(packagePath);
    await row().getByRole('button', { name: '编辑套餐', exact: true }).click();
    for (const menuId of optional) await admin.locator(`[data-menu-id="${menuId}"] input`).uncheck();
    check('手机真实表单无横向溢出且保存按钮至少44像素', await admin.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
      && (await visibleButton('保存套餐').boundingBox()).height >= 44);
    await admin.screenshot({ path: path.join(state.run, `h5-package-mobile-selection-${caseTag}.png`), fullPage: true });
    template = await observeWrite(packageApi, 'PUT', () => visibleButton('保存套餐').click());
    check('手机取消独立功能真实保存但不自动改变已分配租户', optional.every(menuId => !template.menuIds.includes(menuId))
      && snapshot(targetId).package_version === assigned.package_version);
    await admin.getByRole('dialog').waitFor({ state: 'hidden' });
    await row().getByRole('button', { name: '同步租户', exact: true }).click();
    await admin.getByRole('checkbox', { name: new RegExp(` · ${targetId}（`) }).check();
    const preview = await observeWrite(`${packageApi}/${packageId}/sync-preview`, 'POST', () => visibleButton('生成逐户预览').click());
    await admin.getByText(`批次${preview.syncId} · 待确认 · 共1户 · 已应用0户`, { exact: true }).waitFor();
    check('手机真实预览仅一户，未确认不改变原套餐', preview.preview.items.length === 1 && preview.preview.items[0].targetTenantId === targetId
      && snapshot(targetId).version === assigned.version && await visibleButton('确认应用本批变更').isDisabled());
    await admin.getByLabel(/已逐户核对功能增减/).check();
    let confirmedBody;
    let lostRequests = 0;
    const confirmPath = `${packageApi}/sync/${preview.syncId}/confirm`;
    const pattern = `${origin}${confirmPath}`;
    droppedPattern = pattern;
    droppedHandler = async route => {
      lostRequests++;
      const response = await route.fetch({ timeout: 60000 });
      confirmedBody = { status: response.status(), body: await response.json() };
      await route.abort('connectionfailed');
    };
    await admin.route(pattern, droppedHandler);
    await visibleButton('确认应用本批变更').click();
    await admin.getByText('提交结果未确认，请先刷新实际结果；当前禁止重复提交。', { exact: true }).waitFor();
    const confirmed = successful(confirmedBody, '丢弃响应前已由真实服务器处理同步');
    check('确认响应丢失时服务器已完成，页面禁止重复提交与取消', confirmed.status === 'COMPLETED'
      && await visibleButton('确认应用本批变更').isDisabled() && await visibleButton('取消未应用项').isDisabled());
    const synced = snapshot(targetId);
    await admin.unroute(pattern, droppedHandler);
    droppedHandler = null;
    await visibleButton('刷新实际结果').click();
    await admin.getByText(`批次${preview.syncId} · 全部完成 · 共1户 · 已应用1户`, { exact: true }).waitFor();
    check('手机按真实批次恢复结果且只提交一次', lostRequests === 1 && snapshot(targetId).version === synced.version
      && synced.version === assigned.version + 1 && synced.package_version === template.version);
    await admin.screenshot({ path: path.join(state.run, `h5-package-mobile-recovery-${caseTag}.png`), fullPage: true });
    const removedInfo = successful(await api(tenantAdmin, '/auth/info'), '手机同步后旧会话重新求交');
    check('手机同步收回独立功能后原会话立即失去三个入口', ['system:auth:router', 'system:tenant:switch', 'system:search:business'].every(permission => !removedInfo.permissions.includes(permission)));
    for (const route of ['/auth/getRouters', '/auth/tenant/switch-options', '/auth/system/search/business?keyword=PACKAGE']) {
      const response = await api(tenantAdmin, route);
      check(`手机同步后服务器拒绝未选独立入口：${route}`, response.status === 403 && response.body?.code === 403);
    }
    evidence.mobile = true;
    evidence.lostResponse = true;
    check('真实电脑手机平台页面始终未请求未选902菜单', !events.some(event => event.path === '/api/auth/getRouters'));
    check('真实电脑手机页面无未捕获异常', errors.length === 0);
    await employee.goto(`${origin}${packagePath}`, { waitUntil: 'domcontentloaded' });
    await employee.getByText('您没有访问此页面的权限', { exact: true }).waitFor();
    check('真实员工页面不能进入平台套餐管理', await employee.getByRole('button', { name: '新增套餐', exact: true }).count() === 0);
  } catch (error) {
    await admin.screenshot({ path: path.join(state.run, `h5-package-ui-failure-${caseTag}.png`), fullPage: true, timeout: 5000 }).catch(() => {});
    throw error;
  } finally {
    if (droppedHandler) await admin.unroute(droppedPattern, droppedHandler).catch(() => {});
    admin.off('request', capture);
    admin.off('pageerror', captureError);
  }
}
