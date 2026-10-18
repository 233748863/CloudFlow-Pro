import path from 'node:path';

export async function verifyReceivableTeamInterface(context) {
  const { admin, employee, check, directory, caseTag, evidence, uiRecord, readTeam, saveTeam, pair, read, facts } = context;
  const field = (scope, name) => scope.getByLabel(name, { exact: true }).and(scope.locator('input, textarea, select'));
  const panel = admin.getByRole('region', { name: '销售团队分成', exact: true });
  const pick = async () => {
    await field(admin, '团队业务类型').selectOption('RECEIVABLE');
    await field(admin, '搜索回款计划').fill(uiRecord.receivableName);
    const picker = field(admin, '回款计划');
    await picker.locator(`option[value="${uiRecord.receivableId}"]`).waitFor({ state: 'attached' });
    await picker.selectOption(String(uiRecord.receivableId));
    await panel.waitFor();
  };
  const delayActual = async (method, action, inspect) => {
    let release, observe, finish, timer, failure;
    const held = new Promise(resolve => { release = resolve; });
    const observed = new Promise(resolve => { observe = resolve; });
    const finished = new Promise(resolve => { finish = resolve; });
    let started = false;
    const pattern = `**/api/crm/deal-team/RECEIVABLE/${uiRecord.receivableId}*`;
    const handler = async route => {
      if (route.request().method() !== method) return route.continue();
      started = true;
      try {
        const response = await route.fetch({ timeout: 20000 });
        observe({ status: response.status(), body: await response.json() });
        await held; await route.fulfill({ response });
      } catch (error) { failure = error; observe({ failure: error.message }); await route.abort(); }
      finally { finish(); }
    };
    await admin.route(pattern, handler);
    try {
      await action();
      const response = await Promise.race([observed, new Promise((resolve, reject) => { timer = setTimeout(() => reject(new Error('回款团队真实响应等待超时')), 25000); })]);
      check(`回款团队${method}等待状态仅延迟真实响应`, response.status === 200 && response.body?.code === 200);
      await inspect();
    } finally { clearTimeout(timer); release(); if (started) await finished; await admin.unroute(pattern, handler); }
    if (failure) throw failure;
  };
  await admin.setViewportSize({ width: 320, height: 1000 });
  await admin.goto(new URL('/crm/deal-teams', admin.url()).href, { waitUntil: 'domcontentloaded' });
  await delayActual('GET', pick, async () => {
    await panel.getByRole('status').filter({ hasText: '正在核对团队版本' }).waitFor();
    check('回款团队读取完成前不显示旧成员并禁止切换业务', await panel.locator('input').count() === 0
      && await field(admin, '团队业务类型').isDisabled() && await field(admin, '回款计划').isDisabled());
  });
  const owner = field(panel, '分成比例 导入验收负责人');
  const seller = field(panel, '分成比例 商机验收销售');
  await owner.fill('80.00');
  const save = panel.getByRole('button', { name: '保存分成团队', exact: true });
  check('回款比例120%在页面保留输入并禁用保存', await save.isDisabled()
    && (await panel.getByRole('alert').allTextContents()).some(value => value.includes('120.00%')));
  await owner.fill('50.00'); await seller.fill('50.00');
  await field(panel, '团队调整说明').fill(`回款团队手机草稿_${caseTag}`);
  check('回款团队有草稿时禁止切换类型、计划和搜索', await field(admin, '团队业务类型').isDisabled()
    && await field(admin, '回款计划').isDisabled() && await field(admin, '搜索回款计划').isDisabled());
  const mounted = await panel.elementHandle();
  try {
    for (const width of [320, 1440, 375]) {
      await admin.setViewportSize({ width, height: 1000 });
      await admin.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      await save.click({ trial: true });
      const bounds = await save.boundingBox();
      const dimensions = await admin.evaluate(() => ({ viewport: innerWidth, page: document.documentElement.scrollWidth }));
      check(`回款团队${width}px保持同一草稿、无整页溢出且保存至少44px`, await mounted.evaluate(element => element.isConnected)
        && await owner.inputValue() === '50.00' && await seller.inputValue() === '50.00'
        && (await field(panel, '团队调整说明').inputValue()).includes(caseTag)
        && dimensions.page <= dimensions.viewport && bounds?.width >= 44 && bounds?.height >= 44);
      await admin.screenshot({ path: path.join(directory, `h3-receivable-team-${caseTag}-${width}.png`), fullPage: true });
    }
  } finally { await mounted.dispose(); }
  await saveTeam(uiRecord, pair('0.7', '0.3'));
  await save.click();
  const review = panel.getByRole('button', { name: '核对最新团队，保留草稿', exact: true });
  await review.waitFor();
  check('真实回款团队版本冲突保留50%比例和调整说明', await owner.inputValue() === '50.00'
    && await seller.inputValue() === '50.00' && (await field(panel, '团队调整说明').inputValue()).includes(caseTag));
  await review.click();
  const comparison = panel.getByRole('complementary', { name: '团队版本冲突核对', exact: true });
  await comparison.waitFor();
  check('回款团队冲突核对实际展示服务器70%版本', (await comparison.innerText()).includes('70.00%'));
  await panel.getByRole('button', { name: '已核对，基于此版本继续编辑草稿', exact: true }).click();
  await delayActual('PUT', () => save.click(), async () => {
    check('回款团队保存中禁改成员、历史版本、业务及重复保存', await owner.isDisabled() && await seller.isDisabled()
      && await field(panel, '团队版本').isDisabled() && await field(admin, '团队业务类型').isDisabled()
      && await field(admin, '回款计划').isDisabled() && await panel.getByRole('button', { name: '正在保存团队…', exact: true }).isDisabled());
  });
  await panel.getByRole('button', { name: '重新读取团队', exact: true }).click({ trial: true });
  const saved = await readTeam(uiRecord);
  check('手机真实保存只生成第三版两人各50%，不制造到账事实', saved.teamVersion === 3
    && saved.members.every(member => Number(member.allocatedPercentage) === 0.5)
    && Number((await read(uiRecord.receivableId)).receivedAmount) === 0 && facts(uiRecord).length === 0);
  await field(panel, '团队版本').selectOption('1');
  await panel.getByText(/正在查看历史团队，仅供核对/).waitFor();
  check('回款历史团队只读并保持最初60%分配', await owner.isDisabled() && await owner.inputValue() === '60.00' && await save.count() === 0);
  await admin.reload({ waitUntil: 'domcontentloaded' }); await pick();
  await seller.waitFor();
  check('手机刷新后重新选择计划能读取已保存50%分成', await seller.inputValue() === '50.00');
  await employee.goto(new URL('/crm/deal-teams', employee.url()).href, { waitUntil: 'domcontentloaded' });
  check('员工直达团队页面没有保存团队或新增成员操作', await employee.getByRole('button', { name: '保存分成团队', exact: true }).count() === 0
    && await employee.getByText('添加团队成员', { exact: true }).count() === 0);
  evidence.desktop = true; evidence.mobile = true; evidence.teamConflict = true; evidence.transportDelayOnly = true;
}
