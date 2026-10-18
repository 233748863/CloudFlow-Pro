import path from 'node:path';
import { check, checks, failureSummary, frontendUrl, openSessions, privateDirectory, saveResult } from './batch-h/live-lib.mjs';

let sessions;
let failure;
let uncaughtErrors = 0;
let activeStep = '初始化';
let activePage;
try {
  sessions = await openSessions(['admin1', 'employee5']);
  for (const actor of ['admin1', 'employee5']) {
    const mobileContext = await sessions.browser.newContext({
      baseURL: frontendUrl, viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true,
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
      serviceWorkers: 'block', storageState: await sessions[actor].context.storageState(),
    });
    const mobilePage = await mobileContext.newPage();
    mobilePage.setDefaultTimeout(30000);
    sessions[actor].page.on('pageerror', () => { uncaughtErrors++; });
    mobilePage.on('pageerror', () => { uncaughtErrors++; });
    const variants = [
      { page: sessions[actor].page, viewport: { width: 1440, height: 1000 }, label: '桌面1440', mobile: false },
      { page: sessions[actor].page, viewport: { width: 390, height: 844 }, label: '桌面窄屏390', mobile: false },
      { page: mobilePage, viewport: { width: 390, height: 844 }, label: '手机专用390', mobile: true },
    ];
    for (const variant of variants) {
      const page = variant.page;
      activePage = page;
      const label = `${actor} ${variant.label}`;
      activeStep = `${label}菜单主流程`;
      await page.setViewportSize(variant.viewport);
      await page.goto('/', { waitUntil: 'domcontentloaded' });
      const opener = page.getByRole('button', { name: '搜索功能（Ctrl 或 Command 加 K）' });
      await opener.waitFor({ state: 'visible' });
      if (variant.mobile) {
        check(`${label}实际进入手机专用布局`, await page.locator('.cf-mobile-app-shell').count() === 1
          && await page.evaluate(() => /iPhone/.test(navigator.userAgent) && navigator.maxTouchPoints > 0));
      }
      await opener.click();
      const field = page.getByPlaceholder('输入名称、拼音首字母或菜单路径');
      await field.waitFor({ state: 'visible' });
      for (const query of ['我的草稿', 'wodecaogao', '/workflow/drafts']) {
        await field.fill(query);
        const result = page.getByRole('option').filter({ hasText: '我的草稿' }).first();
        await result.waitFor({ state: 'visible' });
        check(`${label}菜单中文拼音路径检索`, await result.isVisible());
      }
      await field.fill('用户管理');
      await page.waitForTimeout(200);
      const management = page.getByRole('option').filter({ hasText: '用户管理' });
      check(`${label}仅显示真实授权菜单`, actor === 'admin1' ? await management.count() > 0 : await management.count() === 0);
      await field.fill('我的草稿');
      await page.keyboard.press('Escape');
      await field.waitFor({ state: 'hidden' });
      check(`${label}关闭搜索恢复按钮焦点`, await opener.evaluate(element => element === document.activeElement));
      await page.keyboard.press('Control+k');
      await field.waitFor({ state: 'visible' });
      await field.fill('/workflow/drafts');
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('Enter');
      await field.waitFor({ state: 'hidden' });
      check(`${label}键盘选择进入授权页面`, new URL(page.url()).pathname === '/workflow/drafts');
      check(`${label}窄屏无横向溢出`, await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
      const history = await page.evaluate(identity => {
        const raw = localStorage.getItem(`t${identity.tenantId}:menu-search:v1:user:${identity.userId}`);
        return raw ? JSON.parse(raw) : null;
      }, sessions[actor].account);
      check(`${label}历史仅保存菜单编号和时间`, Array.isArray(history) && history.length > 0
        && history.every(entry => Object.keys(entry).every(key => ['menuId', 'visitedAt'].includes(key))));
      if (variant.mobile) {
        const unsupportedPage = page.getByText('此功能暂不支持移动端，请在电脑访问。', { exact: true });
        await unsupportedPage.waitFor({ state: 'visible' });
        check(`${label}草稿保留既有手机边界`, await unsupportedPage.isVisible());
        activeStep = `${label}触屏重新打开菜单`;
        await opener.tap();
        activeStep = `${label}搜索已有手机业务`;
        await field.fill('/meeting-room');
        const meetingOption = page.getByRole('option').first();
        await meetingOption.waitFor({ state: 'visible' });
        activeStep = `${label}触屏选择已有手机业务`;
        await meetingOption.tap();
        activeStep = `${label}等待手机业务页面`;
        await page.waitForURL('**/meeting-room');
        await field.waitFor({ state: 'hidden' });
        check(`${label}触屏选择进入已支持手机页面`, await page.locator('.cf-mobile-app-shell').count() === 1
          && await page.getByText('此功能暂不支持移动端，请在电脑访问。', { exact: true }).count() === 0);
      }
    }
    await mobileContext.close();
  }
  check('菜单真实桌面与手机页面无未捕获异常', uncaughtErrors === 0);
  console.log(`PASS H真实菜单交互 ${checks.length} 项`);
} catch (error) {
  failure = error;
  await activePage?.screenshot({ path: path.join(privateDirectory, 'menu-failure.png'), fullPage: true }).catch(() => {});
  console.log(JSON.stringify({ ...failureSummary(error), activeStep,
    errorType: error?.name === 'TimeoutError' ? 'TimeoutError' : 'Error' }));
  process.exitCode = 1;
} finally {
  await saveResult('menu', failure, { authenticatedRoles: ['admin1', 'employee5'], widths: [1440, 390],
    renderModes: ['DESKTOP', 'NARROW_DESKTOP', 'MOBILE_SHELL'], uncaughtErrors, activeStep });
  await sessions?.browser.close();
}
