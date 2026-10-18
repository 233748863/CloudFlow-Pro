import path from 'node:path';

export async function verifyDealTeamInterface({ admin, sales, employee, api, successful, database, check, directory, caseTag, business, salesBusiness, read, save, pair, adminId, salesId, evidence }) {
  const navigate = (page, route) => page.goto(new URL(route, page.url()).href, { waitUntil: 'domcontentloaded' });
  const field = (scope, name) => scope.getByLabel(name, { exact: true }).and(scope.locator('input, textarea, select'));
  const id = business.opportunityId;
  const dialog = admin.getByRole('dialog', { name: '商机详情', exact: true });
  await admin.setViewportSize({ width: 320, height: 1000 });
  let resumeDashboard;
  const pendingDashboard = new Promise(resolve => { resumeDashboard = resolve; });
  let dashboardStarted = false;
  let finishDashboard;
  const dashboardFinished = new Promise(resolve => { finishDashboard = resolve; });
  const delayDashboard = async route => { dashboardStarted = true; try { await pendingDashboard; await route.continue(); } finally { finishDashboard(); } };
  await admin.route('**/api/crm/dashboard/summary', delayDashboard);
  try {
    await navigate(admin, `/office/crm/opportunities?opportunityId=${id}`);
    await dialog.getByRole('heading', { name: business.opportunityName, exact: true }).waitFor();
    check('商机真实详情正常加载且未发起无关驾驶舱请求，无业务响应替换', !dashboardStarted && await dialog.isVisible());
  } finally { resumeDashboard(); if (dashboardStarted) await dashboardFinished; await admin.unroute('**/api/crm/dashboard/summary', delayDashboard); }
  await dialog.getByRole('tab', { name: '分成团队', exact: true }).click();
  const ownerPercentage = field(dialog, '分成比例 导入验收负责人');
  const salesPercentage = field(dialog, '分成比例 商机验收销售');
  await ownerPercentage.fill('80.00');
  check('团队页面对120%比例立即提示并禁止保存，保留原输入', await dialog.getByRole('button', { name: '保存分成团队', exact: true }).isDisabled()
    && await ownerPercentage.inputValue() === '80.00' && (await dialog.getByRole('alert').allTextContents()).some(value => value.includes('120.00%')));
  await ownerPercentage.fill('50.00'); await salesPercentage.fill('50.00');
  await dialog.getByRole('tab', { name: '基本信息', exact: true }).click();
  check('未保存团队可核对基本信息但其他业务写入禁用', await dialog.getByRole('button', { name: '编辑基本信息', exact: true }).isDisabled()
    && await dialog.getByRole('tab', { name: '产品明细', exact: true }).isDisabled());
  await dialog.getByRole('tab', { name: '阶段历史', exact: true }).click();
  await dialog.getByRole('tab', { name: '分成团队', exact: true }).click();
  check('切换只读标签后团队草稿保持完整', await ownerPercentage.inputValue() === '50.00' && await salesPercentage.inputValue() === '50.00');
  await dialog.getByRole('button', { name: '关闭详情', exact: true }).click();
  const closing = admin.getByRole('dialog', { name: '放弃未保存的分成团队？', exact: true });
  await closing.waitFor();
  await closing.getByRole('button', { name: '继续编辑', exact: true }).click();
  check('取消关闭商机详情保留团队草稿', await ownerPercentage.inputValue() === '50.00');
  await admin.evaluate(async () => { const { router } = await import('/src/router.tsx'); void router.navigate('/crm/stage-analysis'); });
  const leaving = admin.getByRole('dialog', { name: '放弃未保存的团队草稿？', exact: true });
  await leaving.waitFor();
  await leaving.getByRole('button', { name: '继续编辑', exact: true }).click();
  check('应用内跨页面导航必须确认，取消离开仍保留团队草稿', new URL(admin.url()).pathname === '/office/crm/opportunities' && await ownerPercentage.inputValue() === '50.00');
  await save(id, await read(id), pair(adminId, '0.7000', '0.3000'));
  await dialog.getByRole('button', { name: '保存分成团队', exact: true }).click();
  const readLatest = dialog.getByRole('button', { name: '核对最新团队，保留草稿', exact: true });
  await readLatest.waitFor();
  check('真实团队版本冲突保留50%/50%草稿且显示错误', await ownerPercentage.inputValue() === '50.00' && await salesPercentage.inputValue() === '50.00'
    && await dialog.getByRole('alert').count() > 0);
  await readLatest.click();
  await dialog.getByRole('complementary', { name: '团队版本冲突核对', exact: true }).waitFor();
  check('冲突核对明确列出服务器70%团队', (await dialog.getByRole('complementary', { name: '团队版本冲突核对', exact: true }).innerText()).includes('70.00%'));
  await dialog.getByRole('button', { name: '已核对，基于此版本继续编辑草稿', exact: true }).click();
  check('采用服务器版本不静默覆盖用户分成输入', await ownerPercentage.inputValue() === '50.00' && await salesPercentage.inputValue() === '50.00');
  for (const width of [1440, 375, 320]) {
    const mountedDialog = await dialog.elementHandle();
    try {
      await admin.setViewportSize({ width, height: 1000 });
      await admin.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      check(`团队页面切换至${width}px后保留同一详情与编辑草稿`, await mountedDialog.evaluate(element => element.isConnected)
        && await dialog.getByRole('tab', { name: '分成团队', exact: true }).getAttribute('aria-selected') === 'true');
      const button = dialog.getByRole('button', { name: '保存分成团队', exact: true });
      await button.click({ trial: true });
      const bounds = await button.boundingBox();
      const dimensions = await admin.evaluate(() => ({ document: document.documentElement.scrollWidth, viewport: innerWidth }));
      check(`团队页面${width}px无页面横向溢出且操作至少44px；页面=${dimensions.document}/${dimensions.viewport}；按钮=${bounds?.width}x${bounds?.height}`,
        dimensions.document <= dimensions.viewport && bounds?.width >= 44 && bounds?.height >= 44
        && await ownerPercentage.inputValue() === '50.00' && await salesPercentage.inputValue() === '50.00');
      await admin.screenshot({ path: path.join(directory, `h3-deal-team-${caseTag}-${width}.png`), fullPage: true });
    } finally {
      await mountedDialog.dispose();
    }
  }
  let releaseResponse;
  const hold = new Promise(resolve => { releaseResponse = resolve; });
  let observe;
  const observed = new Promise(resolve => { observe = resolve; });
  let finish;
  const finished = new Promise(resolve => { finish = resolve; });
  let started = false;
  let routeFailure;
  const routePattern = `**/api/crm/deal-team/OPPORTUNITY/${id}`;
  const delayActualSave = async route => {
    if (route.request().method() !== 'PUT') return route.continue();
    started = true;
    try {
      const response = await route.fetch({ timeout: 20000 });
      observe({ status: response.status(), body: await response.json() });
      await hold;
      await route.fulfill({ response });
    } catch (failure) { routeFailure = failure; observe({ failure: failure.message }); }
    finally { finish(); }
  };
  await admin.route(routePattern, delayActualSave);
  let timer;
  try {
    await dialog.getByRole('button', { name: '保存分成团队', exact: true }).click();
    const result = await Promise.race([observed, new Promise((resolve, reject) => { timer = setTimeout(() => reject(new Error('真实团队保存响应超时')), 25000); })]);
    check('保存中检查仅延迟真实服务器成功响应，未替换业务结果', result.status === 200 && result.body?.code === 200);
    check('团队保存中金额、历史选择及关闭按钮均禁用', await ownerPercentage.isDisabled() && await field(dialog, '团队版本').isDisabled()
      && await dialog.getByRole('button', { name: '正在处理业务数据…', exact: true }).isDisabled());
    await admin.keyboard.press('Escape');
    check('团队保存中Escape不能关闭详情丢失响应', await dialog.isVisible());
  } finally {
    clearTimeout(timer); releaseResponse(); if (started) await finished; await admin.unroute(routePattern, delayActualSave);
  }
  if (routeFailure) throw routeFailure;
  await dialog.getByRole('button', { name: '关闭详情', exact: true }).waitFor();
  await ownerPercentage.waitFor();
  const saved = await read(id);
  check('实际页面保存50%团队分配50.00/50.01且与数据库一致', Number(saved.members.find(value => value.salesUserId === adminId)?.allocatedAmount) === 50
    && Number(saved.members.find(value => value.salesUserId === salesId)?.allocatedAmount) === 50.01
    && database(`SELECT COUNT(*) FROM crm_deal_team WHERE tenant_id=100000 AND biz_type='OPPORTUNITY' AND biz_id=${id} AND current_flag=1 AND allocated_percentage=0.5000;`) === '2');
  await field(dialog, '团队版本').selectOption('1');
  await dialog.getByText(/正在查看历史团队，仅供核对/).waitFor();
  check('历史团队为明确只读且无保存入口', await ownerPercentage.isDisabled() && await dialog.getByRole('button', { name: '保存分成团队', exact: true }).count() === 0);
  await field(dialog, '团队版本').selectOption(String(saved.teamVersion));
  await dialog.getByRole('button', { name: '保存分成团队', exact: true }).waitFor();
  await field(dialog, '团队调整说明').fill('准备放弃的本地草稿');
  await dialog.getByRole('button', { name: '放弃团队草稿', exact: true }).click();
  await leaving.getByRole('button', { name: '放弃草稿并重新读取', exact: true }).click();
  await dialog.getByRole('button', { name: '重新读取团队', exact: true }).click({ trial: true });
  check('主动放弃经确认后清除草稿且没有额外保存', await field(dialog, '团队调整说明').inputValue() === '' && (await read(id)).teamVersion === saved.teamVersion);
  await dialog.getByRole('button', { name: '关闭详情', exact: true }).click();
  await dialog.waitFor({ state: 'hidden' });
  await navigate(admin, '/crm/deal-teams');
  await admin.getByRole('heading', { name: '销售团队分成', level: 2, exact: true }).waitFor();
  await field(admin, '搜索商机').fill(business.opportunityName);
  const picker = field(admin, '商机');
  await picker.locator(`option[value="${id}"]`).waitFor({ state: 'attached' });
  await picker.selectOption(String(id));
  await admin.getByRole('region', { name: '销售团队分成', exact: true }).waitFor();
  await field(admin, '团队调整说明').fill('独立页面草稿');
  check('手机独立团队入口有草稿时禁止切换业务', await picker.isDisabled());
  await admin.getByRole('button', { name: '放弃团队草稿', exact: true }).click();
  await leaving.getByRole('button', { name: '放弃草稿并重新读取', exact: true }).click();
  await admin.getByRole('button', { name: '重新读取团队', exact: true }).click({ trial: true });
  await admin.reload({ waitUntil: 'domcontentloaded' });
  await admin.getByRole('heading', { name: '销售团队分成', level: 2, exact: true }).waitFor();
  check('手机直接刷新独立团队页面仍可用', await field(admin, '商机').isVisible());
  await navigate(sales, `/office/crm/opportunities?opportunityId=${salesBusiness.opportunityId}`);
  const readonly = sales.getByRole('dialog', { name: '商机详情', exact: true });
  await readonly.getByRole('heading', { name: salesBusiness.opportunityName, exact: true }).waitFor();
  await readonly.getByRole('tab', { name: '分成团队', exact: true }).click();
  await field(readonly, '分成比例 商机验收销售').waitFor();
  check('销售代表团队页面仅查询，无保存、添加或薪酬控件', await readonly.getByRole('button', { name: '保存分成团队', exact: true }).count() === 0
    && await field(readonly, '分成比例 商机验收销售').isDisabled() && await readonly.getByText('添加团队成员', { exact: true }).count() === 0);
  await employee.setViewportSize({ width: 375, height: 1000 });
  await navigate(employee, '/crm/deal-teams');
  check('员工手机直接团队路由无业务选择或维护入口', await field(employee, '商机').count() === 0 && await employee.getByRole('button', { name: '保存分成团队', exact: true }).count() === 0);
  successful(await api(admin, `/crm/deal-team/OPPORTUNITY/${id}`), '页面核验后服务仍能读取实际团队');
  evidence.teamDesktop = true; evidence.teamMobile = true; evidence.teamTransportDelayOnly = true;
}
