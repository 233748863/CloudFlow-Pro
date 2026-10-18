import path from 'node:path';

export async function verifyContractTeamInterface(context) {
  const { admin, sales, employee, api, successful, check, directory, caseTag, evidence, uiContract, read, readTeam, saveTeam, pair, edit } = context;
  const navigate = (page, route) => page.goto(new URL(route, page.url()).href, { waitUntil: 'domcontentloaded' });
  const field = (scope, name) => scope.getByLabel(name, { exact: true }).and(scope.locator('input, textarea, select'));
  const pick = async () => {
    await field(admin, '团队业务类型').selectOption('CONTRACT');
    await field(admin, '搜索合同').fill(uiContract.contractName);
    const picker = field(admin, '合同');
    await picker.locator(`option[value="${uiContract.contractId}"]`).waitFor({ state: 'attached' });
    await picker.selectOption(String(uiContract.contractId));
    await admin.getByRole('region', { name: '销售团队分成', exact: true }).waitFor();
  };
  const delayActual = async (pattern, method, action, inspect) => {
    let release;
    const held = new Promise(resolve => { release = resolve; });
    let observe;
    const observed = new Promise(resolve => { observe = resolve; });
    let finish;
    const finished = new Promise(resolve => { finish = resolve; });
    let started = false;
    let failure;
    const handler = async route => {
      if (route.request().method() !== method) return route.continue();
      started = true;
      try {
        const response = await route.fetch({ timeout: 20000 });
        observe({ status: response.status(), body: await response.json() });
        await held;
        await route.fulfill({ response });
      } catch (error) { failure = error; observe({ failure: error.message }); }
      finally { finish(); }
    };
    await admin.route(pattern, handler);
    let timer;
    try {
      await action();
      const response = await Promise.race([observed, new Promise((resolve, reject) => { timer = setTimeout(() => reject(new Error('真实合同响应等待超时')), 25000); })]);
      check(`合同${method}处理中检查使用真实服务响应`, response.status === 200 && response.body?.code === 200);
      await inspect();
    } finally {
      clearTimeout(timer); release(); if (started) await finished; await admin.unroute(pattern, handler);
    }
    if (failure) throw failure;
  };
  await admin.setViewportSize({ width: 320, height: 1000 });
  await navigate(admin, '/crm/deal-teams');
  await pick();
  const panel = admin.getByRole('region', { name: '销售团队分成', exact: true });
  const ownerPercentage = field(panel, '分成比例 导入验收负责人');
  const salesPercentage = field(panel, '分成比例 商机验收销售');
  await ownerPercentage.fill('80.00');
  check('合同分成合计120%时保留输入并禁用保存', await panel.getByRole('button', { name: '保存分成团队', exact: true }).isDisabled()
    && (await panel.getByRole('alert').allTextContents()).some(value => value.includes('120.00%')));
  await ownerPercentage.fill('50.00');
  await salesPercentage.fill('50.00');
  check('合同团队草稿存在时禁止切换业务类型或合同', await field(admin, '团队业务类型').isDisabled() && await field(admin, '合同').isDisabled()
    && await field(admin, '搜索合同').isDisabled());
  for (const width of [320, 1440, 375]) {
    const mounted = await panel.elementHandle();
    try {
      await admin.setViewportSize({ width, height: 1000 });
      await admin.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const save = panel.getByRole('button', { name: '保存分成团队', exact: true });
      await save.click({ trial: true });
      const bounds = await save.boundingBox();
      const dimensions = await admin.evaluate(() => ({ document: document.documentElement.scrollWidth, viewport: innerWidth }));
      check(`合同团队${width}px保留原页面草稿且无横向溢出，按钮至少44px`, await mounted.evaluate(element => element.isConnected)
        && await ownerPercentage.inputValue() === '50.00' && await salesPercentage.inputValue() === '50.00'
        && dimensions.document <= dimensions.viewport && bounds?.width >= 44 && bounds?.height >= 44);
      await admin.screenshot({ path: path.join(directory, `h3-contract-team-${caseTag}-${width}.png`), fullPage: true });
    } finally { await mounted.dispose(); }
  }
  await saveTeam(await readTeam(uiContract.contractId), pair('0.7', '0.3'));
  await panel.getByRole('button', { name: '保存分成团队', exact: true }).click();
  const refresh = panel.getByRole('button', { name: '核对最新团队，保留草稿', exact: true });
  await refresh.waitFor();
  check('合同团队真实冲突保留50%草稿', await ownerPercentage.inputValue() === '50.00' && await salesPercentage.inputValue() === '50.00');
  await refresh.click();
  const comparison = panel.getByRole('complementary', { name: '团队版本冲突核对', exact: true });
  await comparison.waitFor();
  check('合同冲突核对展示服务器70%版本', (await comparison.innerText()).includes('70.00%'));
  await panel.getByRole('button', { name: '已核对，基于此版本继续编辑草稿', exact: true }).click();
  await delayActual(`**/api/crm/deal-team/CONTRACT/${uiContract.contractId}`, 'PUT',
    () => panel.getByRole('button', { name: '保存分成团队', exact: true }).click(),
    async () => check('合同团队保存中禁止再次编辑及切换业务', await ownerPercentage.isDisabled() && await field(panel, '团队版本').isDisabled()
      && await field(admin, '团队业务类型').isDisabled() && await field(admin, '合同').isDisabled()));
  await panel.getByRole('button', { name: '重新读取团队', exact: true }).click({ trial: true });
  const saved = await readTeam(uiContract.contractId);
  check('合同团队真实保存两人各50%且只增加一版', saved.teamVersion === 3 && saved.members.every(value => Number(value.allocatedPercentage) === 0.5));
  await field(panel, '团队版本').selectOption('1');
  await panel.getByText(/正在查看历史团队，仅供核对/).waitFor();
  check('合同历史团队只读且不出现保存入口', await ownerPercentage.isDisabled() && await panel.getByRole('button', { name: '保存分成团队', exact: true }).count() === 0);
  await admin.reload({ waitUntil: 'domcontentloaded' });
  await pick();
  check('手机刷新后合同团队可重新选择和读取', await salesPercentage.inputValue() === '50.00');
  await navigate(admin, '/office/contracts');
  await admin.getByPlaceholder('合同名称', { exact: true }).fill(uiContract.contractName);
  const row = admin.getByRole('row').filter({ hasText: uiContract.contractName });
  await row.waitFor();
  const editor = admin.getByRole('dialog', { name: '编辑合同', exact: true });
  const amount = editor.getByLabel('合同金额', { exact: true });
  const currency = editor.getByLabel('币种', { exact: true });
  const remark = editor.locator('textarea');
  await delayActual(`**/api/oa/contract/${uiContract.contractId}`, 'GET',
    () => row.getByRole('button', { name: '编辑合同', exact: true }).click(),
    async () => check('合同详情加载中禁用金额和保存，不能提交旧版本', await amount.isDisabled()
      && await editor.getByRole('button', { name: '保存', exact: true }).isDisabled()));
  await editor.getByText('已有历史分成，币种已锁定；换币种请另建合同。', { exact: true }).waitFor();
  check('合同编辑明确提示历史分成锁币种并禁用币种输入', await currency.isDisabled() && await currency.inputValue() === 'CNY');
  const draft = `合同保留草稿_${caseTag}`;
  await amount.fill('234.56');
  await remark.fill(draft);
  await edit(await read(uiContract.contractId), { remark: `合同服务器更新_${caseTag}` });
  await editor.getByRole('button', { name: '保存', exact: true }).click();
  const readLatest = editor.getByRole('button', { name: '核对最新合同，保留草稿', exact: true });
  await readLatest.waitFor();
  check('合同真实版本冲突后保留金额和说明草稿', await amount.inputValue() === '234.56' && await remark.inputValue() === draft
    && (await editor.getByRole('alert').innerText()).includes('未保存内容仍保留'));
  await readLatest.click();
  const adopt = editor.getByRole('button', { name: '采用最新版本及已锁定信息，保留其他草稿', exact: true });
  await adopt.waitFor();
  check('合同版本核对展示实际币种和历史锁信息', (await editor.getByLabel('合同版本冲突核对', { exact: true }).innerText()).includes('CNY 123.45'));
  await adopt.click();
  const mounted = await editor.elementHandle();
  try {
    for (const width of [375, 320, 1440]) {
      await admin.setViewportSize({ width, height: 1000 });
      await admin.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const save = editor.getByRole('button', { name: '保存', exact: true });
      await save.click({ trial: true });
      const bounds = await save.boundingBox();
      const dimensions = await admin.evaluate(() => ({ document: document.documentElement.scrollWidth, viewport: innerWidth }));
      check(`合同编辑${width}px保留同一草稿且无横向溢出，保存按钮至少44px`, await mounted.evaluate(element => element.isConnected)
        && await amount.inputValue() === '234.56' && await remark.inputValue() === draft && dimensions.document <= dimensions.viewport
        && bounds?.width >= 44 && bounds?.height >= 44);
      await admin.screenshot({ path: path.join(directory, `h3-contract-editor-${caseTag}-${width}.png`), fullPage: true });
    }
  } finally { await mounted.dispose(); }
  await delayActual('**/api/oa/contract', 'PUT', () => editor.getByRole('button', { name: '保存', exact: true }).click(), async () => {
    check('合同保存中禁用输入、取消及重复保存', await amount.isDisabled() && await remark.isDisabled()
      && await editor.getByRole('button', { name: '取消', exact: true }).isDisabled() && await editor.getByRole('button', { name: '保存', exact: true }).isDisabled());
    await admin.keyboard.press('Escape');
    check('合同保存中Escape不会丢失表单及响应', await editor.isVisible());
  });
  await editor.waitFor({ state: 'hidden' });
  const record = await read(uiContract.contractId);
  check('合同冲突核对后真实保存金额234.56及说明，保持原币种', record.remark === draft && Number(record.amount) === 234.56 && record.currency === 'CNY');
  await admin.setViewportSize({ width: 320, height: 1000 });
  await admin.reload({ waitUntil: 'domcontentloaded' });
  await admin.getByPlaceholder('合同名称', { exact: true }).fill(uiContract.contractName);
  await row.waitFor();
  check('手机合同页面直接刷新仍能读取已保存合同', (await row.innerText()).includes('234.56'));
  await sales.setViewportSize({ width: 375, height: 1000 });
  await navigate(sales, '/crm/deal-teams');
  await field(sales, '团队业务类型').waitFor();
  check('未获OA合同读取权限的销售不出现合同团队选项', await field(sales, '团队业务类型').locator('option[value="CONTRACT"]').count() === 0);
  await employee.setViewportSize({ width: 375, height: 1000 });
  await navigate(employee, '/office/contracts');
  check('员工直达手机合同页无新建编辑合同操作', await employee.getByRole('button', { name: '新建合同', exact: true }).count() === 0
    && await employee.getByRole('button', { name: '编辑合同', exact: true }).count() === 0);
  successful(await api(admin, `/oa/contract/${uiContract.contractId}`), '合同双端检查后真实记录可读取');
  evidence.desktop = true; evidence.mobile = true; evidence.transportDelayOnly = true;
}
