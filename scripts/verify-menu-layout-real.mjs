import path from 'node:path';

export async function verifyMenuLayout({ admin, session, check, directory, caseTag, requests }) {
  const employee = await session('g_holiday_employee');
  const origin = new URL(admin.url()).origin;
  const errors = [];
  for (const [actor, desktop] of [['admin', admin], ['employee', employee]]) {
    const mobileContext = await desktop.context().browser().newContext({
      viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, serviceWorkers: 'block',
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
      storageState: await desktop.context().storageState(),
    });
    await mobileContext.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    const mobile = await mobileContext.newPage();
    mobile.setDefaultTimeout(30000);
    mobile.on('response', response => {
      const responsePath = new URL(response.url()).pathname;
      if (response.status() >= 400 && responsePath.startsWith('/api/')) requests.push({ path: responsePath.slice(4), method: response.request().method(), status: response.status(), source: 'menu-browser' });
    });
    const recordError = error => errors.push(error.message);
    desktop.on('pageerror', recordError);
    mobile.on('pageerror', recordError);
    let currentPage = desktop;
    try {
      for (const [mode, page, width] of [['desktop', desktop, 1440], ['narrow', desktop, 390], ['mobile', mobile, 390]]) {
        currentPage = page;
        const label = `${actor} ${mode} ${width}px`;
        await page.setViewportSize({ width, height: 844 });
        if (mode === 'narrow') await page.evaluate(async () => { const { router } = await import('/src/router.tsx'); await router.navigate('/'); });
        else await page.goto(`${origin}/`, { waitUntil: 'domcontentloaded' });
        const opener = page.getByRole('button', { name: '搜索功能（Ctrl 或 Command 加 K）', exact: true });
        await opener.waitFor();
        check(`${label}仅一个菜单入口且路由布局符合启动设备`, await opener.count() === 1
          && await page.locator('.cf-mobile-app-shell').count() === (mode === 'mobile' ? 1 : 0));
        if (mode !== 'desktop') {
          const messages = page.getByRole('navigation', { name: '移动端主导航', exact: true }).getByRole('link')
            .filter({ has: page.getByText('消息', { exact: true }) });
          await messages.waitFor();
          if (mode === 'mobile') {
            const refreshed = page.waitForResponse(response => new URL(response.url()).pathname === '/api/auth/system/message/mine/unread-count'
              && response.request().method() === 'GET');
            await page.evaluate(() => window.dispatchEvent(new Event('cloudflow:messages-read')));
            const response = await refreshed;
            const result = await response.json();
            const unread = Number(result.data?.TOTAL);
            check(`${label}消息角标来自真实未读数量`, response.status() === 200 && result.code === 200
              && result.data?.TOTAL != null && Number.isSafeInteger(unread) && unread >= 0);
            if (unread > 0) await messages.getByLabel(`${unread} 条未处理`, { exact: true }).waitFor();
            else await messages.locator('.cf-mobile-tab-badge').waitFor({ state: 'hidden' });
          }
          check(`${label}消息入口保留对应路由`, await messages.count() === 1
            && await messages.getAttribute('href') === (mode === 'mobile' ? '/messages' : '/message/mine'));
          console.log(`MENU_MESSAGE_LINK: actor=${actor}; mode=${mode}; href=${await messages.getAttribute('href')}; unread_badges=${await messages.locator('.cf-mobile-tab-badge').count()}`);
        }
        await opener.click();
        const field = page.getByPlaceholder('输入名称、拼音首字母或菜单路径', { exact: true });
        await field.waitFor();
        for (const query of ['我的草稿', 'wodecaogao', '/workflow/drafts']) {
          await field.fill(query);
          const result = page.getByRole('option').filter({ hasText: '我的草稿' }).first();
          await result.waitFor();
          check(`${label}真实授权菜单支持${query}检索`, await result.isVisible());
        }
        await field.fill('用户管理');
        const management = page.getByRole('option').filter({ hasText: '用户管理' });
        if (actor === 'admin') await management.first().waitFor();
        else await page.getByText(/^未找到匹配(?:菜单|功能)，请更换关键词。$/).waitFor();
        check(`${label}管理员和员工菜单按真实权限隔离`, actor === 'admin' ? await management.count() > 0 : await management.count() === 0);
        await page.keyboard.press('Escape');
        await field.waitFor({ state: 'hidden' });
        check(`${label}关闭菜单恢复入口焦点`, await opener.evaluate(element => document.activeElement === element));
        await page.keyboard.press('Control+k');
        await field.waitFor();
        await field.fill('/workflow/drafts');
        await page.getByRole('option').filter({ hasText: '我的草稿' }).first().waitFor();
        await page.keyboard.press('ArrowDown');
        await page.keyboard.press('Enter');
        await field.waitFor({ state: 'hidden' });
        check(`${label}键盘导航进入真实已授权路由`, new URL(page.url()).pathname === '/workflow/drafts');
        check(`${label}页面无横向溢出`, await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        const history = await page.evaluate(async () => {
          const { getCurrentUserSnapshot } = await import('/src/utils/authStorage.ts');
          const user = getCurrentUserSnapshot();
          return JSON.parse(localStorage.getItem(`t${user.tenantId}:menu-search:v1:user:${user.id}`) || 'null');
        });
        check(`${label}历史仅保存菜单编号和时间`, Array.isArray(history) && history.length > 0
          && history.every(entry => Object.keys(entry).every(key => ['menuId', 'visitedAt'].includes(key))));
        if (mode !== 'mobile') continue;
        await page.getByText('此功能暂不支持移动端，请在电脑访问。', { exact: true }).waitFor();
        check(`${label}未扩大手机业务路由范围`, true);
        await opener.tap();
        await field.fill('/meeting-room');
        await page.getByRole('option').first().tap();
        await page.waitForURL('**/meeting-room');
        await field.waitFor({ state: 'hidden' });
        await page.getByRole('heading', { name: '会议室预订', level: 1, exact: true }).waitFor();
        check(`${label}触屏菜单进入既有手机会议室页面`, await page.locator('.cf-mobile-app-content').count() === 1
          && await page.getByText('此功能暂不支持移动端，请在电脑访问。', { exact: true }).count() === 0);
        const content = await page.locator('main.cf-mobile-app-content').elementHandle();
        try {
          for (const resizeWidth of [1440, 390]) {
            await page.setViewportSize({ width: resizeWidth, height: 844 });
            await page.waitForFunction(mobileShell => Boolean(document.querySelector('.cf-mobile-app-shell')) === mobileShell, resizeWidth < 640);
            check(`${actor}手机布局切换${resizeWidth}px只更换导航，不重建业务内容`, await content.evaluate(element => element.isConnected)
              && await page.locator('main').count() === 1 && await opener.count() === 1);
          }
        } finally { await content.dispose(); }
        await mobileContext.setOffline(true);
        await page.locator('.cf-mobile-offline').waitFor();
        check(`${label}离线状态明确提示并保留当前页面`, (await page.locator('.cf-mobile-offline').innerText()).includes('当前离线，仅显示已缓存内容')
          && new URL(page.url()).pathname === '/meeting-room');
        await mobileContext.setOffline(false);
        await page.locator('.cf-mobile-offline').waitFor({ state: 'hidden' });
        await page.screenshot({ path: path.join(directory, `menu-layout-${caseTag}-${actor}.png`), fullPage: true });
      }
    } catch (failure) {
      await currentPage.screenshot({ path: path.join(directory, `menu-layout-${caseTag}-${actor}-failure.png`), fullPage: true }).catch(() => {});
      throw failure;
    } finally {
      desktop.off('pageerror', recordError);
      await mobileContext.close();
    }
  }
  check('真实桌面、窄屏和手机菜单无未捕获异常', errors.length === 0);
}
