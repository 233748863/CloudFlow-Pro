import assert from 'node:assert/strict';
import path from 'node:path';

export async function verifyBusinessSearchUi(context) {
  const { actor, admin, own, hidden, keyword, check, directory, caseTag, evidence } = context;
  const origin = new URL(actor.url()).origin;
  const pause = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
  const searchPath = '/api/auth/system/search/business';
  const groupLabels = { CUSTOMER: '客户', CONTRACT: '合同', EMPLOYEE: '员工', WORKFLOW_INSTANCE: '流程', TICKET: '工单', ASSET: '资产' };
  const errors = [];
  const waitFor = async (probe, label) => {
    const deadline = Date.now() + 30000;
    while (Date.now() < deadline) {
      if (await probe()) return;
      await pause(100);
    }
    throw new Error(label);
  };
  const navigate = (page, route) => page.evaluate(async destination => {
    const { router } = await import('/src/router.tsx');
    await router.navigate(destination);
  }, route);
  const searchDialog = page => page.getByRole('dialog', { name: '搜索功能', exact: true });
  const openSearch = async page => {
    const opener = page.getByRole('button', { name: '搜索功能（Ctrl 或 Command 加 K）', exact: true });
    await opener.waitFor();
    await opener.click();
    const dialog = searchDialog(page);
    await dialog.waitFor();
    return { dialog, field: dialog.getByRole('combobox'), opener };
  };
  const query = async (page, title = own.CUSTOMER.title) => {
    const controls = await openSearch(page);
    const response = page.waitForResponse(result => new URL(result.url()).pathname === searchPath
      && new URL(result.url()).searchParams.get('keyword') === title);
    await controls.field.fill(title);
    const actual = await response;
    assert.equal(actual.status(), 200);
    const actualBody = await actual.json();
    assert.equal(actualBody.code, 200);
    await controls.dialog.getByRole('group', { name: '客户', exact: true }).getByRole('option').waitFor();
    return { ...controls, data: actualBody.data };
  };
  const noOverflow = async (page, label) => check(label, await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  const mobileContext = await actor.context().browser().newContext({
    viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, serviceWorkers: 'block',
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
    storageState: await actor.context().storageState(),
  });
  await mobileContext.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
  const mobile = await mobileContext.newPage();
  let currentPage = actor;
  for (const page of [actor, mobile, admin]) {
    page.setDefaultTimeout(30000);
    page.on('pageerror', error => errors.push(error.message));
  }
  try {
    if (process.argv.includes('--ui-boundaries-only')) {
      assert.ok(process.argv.includes('--business-search-ui-only'), 'Boundary debug must not replace full acceptance');
      console.log('H5_SEARCH_UI_BOUNDARIES_ONLY: complete_ui_acceptance=false; responses=real; purpose=boundary_debug');
      currentPage = admin;
      await admin.goto(`${origin}/`, { waitUntil: 'domcontentloaded' });
      const { verifyBusinessSearchUiBoundaries } = await import('./verify-business-search-ui-boundaries.mjs');
      await verifyBusinessSearchUiBoundaries({ ...context, navigate, openSearch, query, waitFor, pause });
      check(`页面边界专项无未处理异常 ${JSON.stringify(errors)}`, errors.length === 0);
      return;
    }
    for (const [mode, page] of [['desktop', actor], ['mobile', mobile]]) {
      currentPage = page;
      await page.goto(`${origin}/`, { waitUntil: 'domcontentloaded' });
      for (const [type, record] of Object.entries(own)) {
        await navigate(page, '/');
        const { dialog } = await query(page);
        const option = dialog.getByRole('group', { name: groupLabels[type], exact: true }).getByRole('option').filter({ hasText: record.title });
        check(`${mode} ${type}只展示真实标题、编号及状态`, await option.count() === 1 && (await option.innerText()).includes(record.number));
        await noOverflow(page, `${mode}搜索弹层不横向溢出`);
        if (type === 'CUSTOMER') {
          const targets = await dialog.locator('button:visible, [role="option"]:visible, [role="combobox"]').evaluateAll(elements => elements.map(element => {
            const bounds = element.getBoundingClientRect();
            return { height: bounds.height, width: bounds.width };
          }));
          check(`${mode}搜索触控区均至少44px`, targets.every(bounds => bounds.height >= 43.9 && bounds.width >= 43.9));
          check(`${mode}已命中业务时菜单空态明确限定菜单`,
            await dialog.getByText('未找到匹配菜单，请更换关键词。', { exact: true }).count() === 1
              && await dialog.getByText('未找到匹配功能，请更换关键词。', { exact: true }).count() === 0);
          check(`${mode}基础页面没有权限提示遮挡搜索`, await page.getByText(/^权限不足[:：]/).count() === 0);
          await page.screenshot({ path: path.join(directory, `h5-search-${mode}-${caseTag}.png`), fullPage: true });
        }
        const detailResponse = page.waitForResponse(response => new URL(response.url()).pathname === `/api${record.endpoint}`
          && response.request().method() === 'GET');
        if (mode === 'mobile') await option.tap();
        else await option.click();
        const detail = await detailResponse;
        check(`${mode} ${type}跳转后重新调用真实详情鉴权`, detail.status() === 200 && (await detail.json()).code === 200);
        await dialog.waitFor({ state: 'hidden' });
        const location = new URL(page.url());
        check(`${mode} ${type}进入固定站内详情地址`, `${location.pathname}${location.search}` === record.route);
        if (type === 'CUSTOMER') await page.getByRole('heading', { name: record.title, exact: true }).waitFor();
        else {
          const detailDialog = page.getByRole('dialog').filter({ hasText: record.title });
          await detailDialog.waitFor();
          check(`${mode} ${type}详情展示搜索目标且没有错误记录`, (await detailDialog.innerText()).includes(record.title)
            && !(await detailDialog.innerText()).includes(hidden[type].title));
          if (type === 'WORKFLOW_INSTANCE') check(`${mode}流程搜索详情没有审批写操作`, await detailDialog.getByRole('button', { name: /^(同意|驳回|转办|加签|减签|退回)$/ }).count() === 0);
          await noOverflow(page, `${mode} ${type}详情不横向溢出`);
          await detailDialog.getByRole('button', { name: /^(关闭|关闭弹窗)$/ }).last().click();
          await detailDialog.waitFor({ state: 'hidden' });
          await pause(350);
          check(`${mode} ${type}关闭后旧响应不会重新打开详情`, await detailDialog.count() === 0);
        }
      }
      if (mode === 'mobile') {
        const expired = await query(page);
        await page.evaluate(() => window.dispatchEvent(new Event('cloudflow:auth-expired')));
        await expired.dialog.waitFor({ state: 'hidden' });
        check('手机身份失效立即清除搜索与旧业务结果', await page.getByRole('group', { name: '客户', exact: true }).count() === 0);
      }
      evidence[mode] = true;
    }
    currentPage = actor;
    await navigate(actor, '/');
    const requests = [];
    const cancelled = [];
    const capture = request => {
      const address = new URL(request.url());
      if (address.pathname === searchPath) requests.push({ keyword: address.searchParams.get('keyword'), time: performance.now() });
    };
    const captureCancelled = request => {
      if (new URL(request.url()).pathname === searchPath) cancelled.push(new URL(request.url()).searchParams.get('keyword'));
    };
    actor.on('request', capture);
    actor.on('requestfailed', captureCancelled);
    let controls = await openSearch(actor);
    try {
      for (const invalid of ['x', '😀'.repeat(65)]) {
        const before = requests.length;
        await controls.field.fill(invalid);
        await pause(420);
        check(`输入${[...invalid].length}字符不发送不合规业务请求`, requests.length === before);
      }
      const beforeDebounce = requests.length;
      await controls.field.fill(keyword.slice(0, 4));
      await pause(35);
      await controls.field.fill(keyword.slice(0, 8));
      await pause(35);
      await controls.field.fill(own.CUSTOMER.title);
      const finalInputTime = performance.now();
      await controls.dialog.getByRole('group', { name: '客户', exact: true }).getByRole('option').waitFor();
      const debounceRequests = requests.slice(beforeDebounce);
      const delay = Math.round(debounceRequests[0]?.time - finalInputTime);
      check(`连续输入只发送最后一次真实请求，300ms防抖实测=${delay}ms`, debounceRequests.length === 1
        && debounceRequests[0].keyword === own.CUSTOMER.title && delay >= 260);
      const beforeComposition = requests.length;
      await controls.field.dispatchEvent('compositionstart', { data: '' });
      await controls.field.fill('zhongwen');
      await pause(420);
      check('中文输入法组合期间不请求业务接口且清除旧结果', requests.length === beforeComposition
        && await controls.dialog.getByRole('group', { name: '客户', exact: true }).count() === 0);
      await controls.field.fill(own.CUSTOMER.title);
      await controls.field.dispatchEvent('compositionend', { data: own.CUSTOMER.title });
      await controls.dialog.getByRole('group', { name: '客户', exact: true }).getByRole('option').waitFor();
      check('中文输入完成后只提交一次最终文字', requests.length === beforeComposition + 1 && requests.at(-1).keyword === own.CUSTOMER.title);
      await controls.dialog.getByRole('button', { name: '关闭搜索', exact: true }).click();
      const runDelayed = async action => {
        let releaseResponse;
        let capturedResponse;
        let completed;
        const release = new Promise(resolve => { releaseResponse = resolve; });
        const captured = new Promise(resolve => { capturedResponse = resolve; });
        const finished = new Promise(resolve => { completed = resolve; });
        const delayedKeyword = action === 'replace' ? `literal${caseTag}%_!` : own.CUSTOMER.title;
        const routePattern = '**/api/auth/system/search/business?**';
        const delayResponse = async route => {
          if (new URL(route.request().url()).searchParams.get('keyword') !== delayedKeyword) return route.continue();
          try {
            const response = await route.fetch();
            assert.equal(response.status(), 200);
            assert.equal((await response.json()).code, 200);
            capturedResponse();
            await release;
            await route.fulfill({ response });
          } finally { completed(); }
        };
        await actor.route(routePattern, delayResponse);
        try {
          controls = await openSearch(actor);
          await controls.field.fill(delayedKeyword);
          await Promise.race([captured, pause(30000).then(() => { throw new Error('真实延迟响应未取得'); })]);
          if (action === 'replace') {
            await controls.field.fill(own.CUSTOMER.title);
            await controls.dialog.getByRole('group', { name: '客户', exact: true }).getByRole('option').filter({ hasText: own.CUSTOMER.title }).waitFor();
          } else {
            await controls.dialog.getByRole('button', { name: '关闭搜索', exact: true }).click();
            await controls.dialog.waitFor({ state: 'hidden' });
            controls = await openSearch(actor);
          }
          releaseResponse();
          await finished;
          await pause(400);
          if (action === 'replace') check('旧查询响应迟到不能覆盖新关键词及结果', await controls.field.inputValue() === own.CUSTOMER.title
            && !(await controls.dialog.innerText()).includes(delayedKeyword));
          else check('关闭再打开时关键词与旧业务结果均清空', await controls.field.inputValue() === ''
            && await controls.dialog.getByRole('group', { name: '客户', exact: true }).count() === 0);
          check(`${action}确实取消了旧浏览器请求`, cancelled.includes(delayedKeyword));
          await controls.dialog.getByRole('button', { name: '关闭搜索', exact: true }).click();
        } finally {
          releaseResponse();
          await actor.unroute(routePattern, delayResponse);
        }
      };
      await runDelayed('replace');
      await runDelayed('close');
      await actor.keyboard.press('Control+k');
      controls = { dialog: searchDialog(actor), field: searchDialog(actor).getByRole('combobox') };
      await controls.field.fill(own.CUSTOMER.title);
      await controls.dialog.getByRole('group', { name: '客户', exact: true }).getByRole('option').waitFor();
      await controls.field.press('ArrowDown');
      const selectedId = await controls.field.getAttribute('aria-activedescendant');
      check('键盘上下键选中真实业务结果', Boolean(selectedId) && await actor.locator(`[id="${selectedId}"]`).getAttribute('aria-selected') === 'true');
      await controls.field.press('Enter');
      await controls.dialog.waitFor({ state: 'hidden' });
      await waitFor(() => new URL(actor.url()).pathname !== '/', '回车没有进入业务详情');
      check('回车打开选中业务详情', new URL(actor.url()).pathname === '/office/contracts');
      evidence.lifecycle = true;
    } finally {
      actor.off('request', capture);
      actor.off('requestfailed', captureCancelled);
    }
    currentPage = admin;
    await admin.goto(`${origin}/`, { waitUntil: 'domcontentloaded' });
    const menu = await openSearch(admin);
    for (const term of ['我的草稿', 'wodecaogao', '/workflow/drafts']) {
      await menu.field.fill(term);
      await menu.dialog.getByRole('option').filter({ hasText: '我的草稿' }).first().waitFor();
      check(`原菜单搜索保留${term}匹配`, true);
    }
    await menu.field.press('Escape');
    await menu.dialog.waitFor({ state: 'hidden' });
    check('Escape关闭后键盘焦点回到搜索按钮', await menu.opener.evaluate(element => element === document.activeElement));
    currentPage = admin;
    const { verifyBusinessSearchUiBoundaries } = await import('./verify-business-search-ui-boundaries.mjs');
    await verifyBusinessSearchUiBoundaries({ ...context, navigate, openSearch, query, waitFor, pause });
    await navigate(admin, '/');
    const expired = await query(admin);
    await admin.evaluate(() => window.dispatchEvent(new Event('cloudflow:auth-expired')));
    await expired.dialog.waitFor({ state: 'hidden' });
    check('登录状态失效立即移除搜索及旧业务结果', await admin.getByRole('group', { name: '客户', exact: true }).count() === 0);
    evidence.menuRegression = true;
    check(`业务搜索真实双端页面无未处理异常 ${JSON.stringify(errors)}`, errors.length === 0);
  } catch (error) {
    await currentPage.screenshot({ path: path.join(directory, `h5-search-ui-failure-${caseTag}.png`), fullPage: true }).catch(() => undefined);
    throw error;
  } finally {
    await mobileContext.close();
  }
}
