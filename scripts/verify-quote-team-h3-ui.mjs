import path from 'node:path';

export async function verifyQuoteTeamInterface(context) {
  const { admin, sales, employee, api, successful, check, directory, caseTag, evidence, quote, salesQuote, readTeam, saveTeam, pair, readQuote, editQuote } = context;
  const navigate = (page, route) => page.goto(new URL(route, page.url()).href, { waitUntil: 'domcontentloaded' });
  const field = (scope, name) => scope.getByLabel(name, { exact: true }).and(scope.locator('input, textarea, select'));
  const pick = async (page, business) => {
    await field(page, '团队业务类型').selectOption('QUOTE');
    await field(page, '搜索报价').fill(business.quoteName);
    const picker = field(page, '报价');
    await picker.locator(`option[value="${business.quoteId}"]`).waitFor({ state: 'attached' });
    await picker.selectOption(String(business.quoteId));
    await page.getByRole('region', { name: '销售团队分成', exact: true }).waitFor();
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
    const routeHandler = async route => {
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
    await admin.route(pattern, routeHandler);
    let timer;
    try {
      await action();
      const result = await Promise.race([observed, new Promise((resolve, reject) => { timer = setTimeout(() => reject(new Error('真实报价响应等待超时')), 25000); })]);
      check(`报价${method}处理中检查使用真实服务响应`, result.status === 200 && result.body?.code === 200);
      await inspect();
    } finally {
      clearTimeout(timer); release(); if (started) await finished; await admin.unroute(pattern, routeHandler);
    }
    if (failure) throw failure;
  };
  await admin.setViewportSize({ width: 320, height: 1000 });
  await navigate(admin, '/crm/deal-teams');
  await pick(admin, quote);
  const panel = admin.getByRole('region', { name: '销售团队分成', exact: true });
  const ownerPercentage = field(panel, '分成比例 导入验收负责人');
  const salesPercentage = field(panel, '分成比例 商机验收销售');
  await ownerPercentage.fill('80.00');
  check('报价分成合计120%时保留输入并禁用保存', await panel.getByRole('button', { name: '保存分成团队', exact: true }).isDisabled()
    && (await panel.getByRole('alert').allTextContents()).some(text => text.includes('120.00%')));
  await ownerPercentage.fill('50.00');
  await salesPercentage.fill('50.00');
  check('报价团队草稿存在时禁止切换业务类型及业务', await field(admin, '团队业务类型').isDisabled() && await field(admin, '报价').isDisabled());
  for (const width of [1440, 375, 320]) {
    const mounted = await panel.elementHandle();
    try {
      await admin.setViewportSize({ width, height: 1000 });
      await admin.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const button = panel.getByRole('button', { name: '保存分成团队', exact: true });
      await button.click({ trial: true });
      const bounds = await button.boundingBox();
      const dimensions = await admin.evaluate(() => ({ document: document.documentElement.scrollWidth, viewport: innerWidth }));
      check(`报价团队${width}px保留原页面草稿且无横向溢出，按钮至少44px`, await mounted.evaluate(element => element.isConnected)
        && await ownerPercentage.inputValue() === '50.00' && await salesPercentage.inputValue() === '50.00'
        && dimensions.document <= dimensions.viewport && bounds?.width >= 44 && bounds?.height >= 44);
      await admin.screenshot({ path: path.join(directory, `h3-quote-team-${caseTag}-${width}.png`), fullPage: true });
    } finally { await mounted.dispose(); }
  }
  await saveTeam('QUOTE', quote.quoteId, await readTeam('QUOTE', quote.quoteId), pair(undefined, '0.7', '0.3'));
  await panel.getByRole('button', { name: '保存分成团队', exact: true }).click();
  const refresh = panel.getByRole('button', { name: '核对最新团队，保留草稿', exact: true });
  await refresh.waitFor();
  check('报价团队真实冲突后50%/50%输入保留', await ownerPercentage.inputValue() === '50.00' && await salesPercentage.inputValue() === '50.00');
  await refresh.click();
  const comparison = panel.getByRole('complementary', { name: '团队版本冲突核对', exact: true });
  await comparison.waitFor();
  check('报价冲突核对展示服务器70%版本', (await comparison.innerText()).includes('70.00%'));
  await panel.getByRole('button', { name: '已核对，基于此版本继续编辑草稿', exact: true }).click();
  await delayActual(`**/api/crm/deal-team/QUOTE/${quote.quoteId}`, 'PUT',
    () => panel.getByRole('button', { name: '保存分成团队', exact: true }).click(),
    async () => check('报价团队保存中禁止再次编辑或切换业务', await ownerPercentage.isDisabled() && await field(panel, '团队版本').isDisabled()
      && await field(admin, '团队业务类型').isDisabled() && await field(admin, '报价').isDisabled()));
  await panel.getByRole('button', { name: '重新读取团队', exact: true }).click({ trial: true });
  const saved = await readTeam('QUOTE', quote.quoteId);
  check('手机报价团队真实保存后两成员各50%且只增加一版', saved.teamVersion === 3 && saved.members.every(value => Number(value.allocatedPercentage) === 0.5));
  await field(panel, '团队版本').selectOption('1');
  await panel.getByText(/正在查看历史团队，仅供核对/).waitFor();
  check('报价历史版本禁止修改且没有保存入口', await ownerPercentage.isDisabled() && await panel.getByRole('button', { name: '保存分成团队', exact: true }).count() === 0);
  await admin.reload({ waitUntil: 'domcontentloaded' });
  await pick(admin, quote);
  check('手机直接刷新后报价团队仍能重新选取和读取', await field(admin, '分成比例 商机验收销售').inputValue() === '50.00');
  await admin.setViewportSize({ width: 1440, height: 1000 });
  await navigate(admin, '/office/crm/quotes');
  const row = admin.getByRole('row').filter({ hasText: quote.quoteName });
  await row.waitFor();
  const editor = admin.getByRole('dialog', { name: '编辑报价', exact: true });
  await delayActual(`**/api/crm/quote/${quote.quoteId}`, 'GET',
    () => row.getByRole('button', { name: '编辑报价', exact: true }).click(),
    async () => check('报价详情未读完时禁止保存且不开放编辑字段', await editor.getByRole('button', { name: '保存', exact: true }).isDisabled()
      && await editor.getByPlaceholder('报价名称', { exact: true }).count() === 0));
  await editor.getByPlaceholder('报价名称', { exact: true }).waitFor();
  const lockNotice = editor.getByText('已有历史分成记录，币种已锁定；换币种请另建报价。', { exact: true });
  await lockNotice.waitFor();
  check('真实编辑页面明确提示历史锁币种并禁用选择', await lockNotice.locator('..').getByRole('button').isDisabled());
  const remark = editor.getByPlaceholder('报价说明、商务条款、附件说明', { exact: true });
  const draft = `报价保留草稿_${caseTag}`;
  await remark.fill(draft);
  await editQuote(await readQuote(quote.quoteId), { remark: `服务器更新_${caseTag}` });
  await editor.getByRole('button', { name: '保存', exact: true }).click();
  const readLatest = editor.getByRole('button', { name: '读取最新报价（保留草稿）', exact: true });
  await readLatest.waitFor();
  check('报价编辑真实版本冲突后保留用户草稿', await remark.inputValue() === draft && (await editor.getByRole('alert').innerText()).includes('未保存输入仍保留'));
  await readLatest.click();
  const adopt = editor.getByRole('button', { name: '已核对，保留输入并采用最新版本', exact: true });
  await adopt.waitFor();
  check('报价冲突显示实际最新版本和币种供核对', (await editor.innerText()).includes('最新版本') && (await editor.innerText()).includes('CNY'));
  await adopt.click();
  for (const width of [375, 320, 1440]) {
    await admin.setViewportSize({ width, height: 1000 });
    await admin.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const dimensions = await admin.evaluate(() => ({ document: document.documentElement.scrollWidth, viewport: innerWidth }));
    check(`报价编辑${width}px切换保留草稿且无页面横向溢出`, await remark.inputValue() === draft && dimensions.document <= dimensions.viewport);
    await admin.screenshot({ path: path.join(directory, `h3-quote-editor-${caseTag}-${width}.png`), fullPage: true });
  }
  await delayActual('**/api/crm/quote', 'PUT',
    () => editor.getByRole('button', { name: '保存', exact: true }).click(),
    async () => {
      check('报价保存中禁用输入、取消和重复提交', await remark.isDisabled() && await editor.getByRole('button', { name: '取消', exact: true }).isDisabled()
        && await editor.getByRole('button', { name: '保存中...', exact: true }).isDisabled());
      await admin.keyboard.press('Escape');
      check('报价保存中Escape不会丢失表单和响应', await editor.isVisible());
    });
  await editor.waitFor({ state: 'hidden' });
  check('核对冲突后真实保存成功且保持原币种', (await readQuote(quote.quoteId)).remark === draft && (await readQuote(quote.quoteId)).currency === 'CNY');
  await sales.setViewportSize({ width: 375, height: 1000 });
  await navigate(sales, '/crm/deal-teams');
  await pick(sales, salesQuote);
  check('销售手机报价团队只读且无薪酬或维护入口', await field(sales, '分成比例 商机验收销售').isDisabled()
    && await sales.getByRole('button', { name: '保存分成团队', exact: true }).count() === 0 && !/提成率|提成金额/.test(await sales.getByRole('region', { name: '销售团队分成', exact: true }).innerText()));
  await employee.setViewportSize({ width: 375, height: 1000 });
  await navigate(employee, '/crm/deal-teams');
  check('员工直接访问报价分成路由没有业务或保存入口', await field(employee, '团队业务类型').count() === 0 && await employee.getByRole('button', { name: '保存分成团队', exact: true }).count() === 0);
  successful(await api(admin, `/crm/quote/${quote.quoteId}`), '报价页面验证后真实业务仍可读取');
  evidence.quoteDesktop = true; evidence.quoteMobile = true; evidence.transportDelayOnly = true;
}
