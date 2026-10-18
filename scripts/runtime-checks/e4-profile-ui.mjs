import path from 'node:path';

export function e4Ui(context) {
  const screenshot = async (name, page, region) => {
    await page.waitForTimeout(450);
    await (region || page).screenshot({ path: path.join(context.output, name), animations: 'disabled', ...(region ? {} : { fullPage: true }) });
    context.fixture.images.push({ name, width: page.viewportSize().width, actualBusinessPage: true });
  };
  const action = async (page, endpoint, method, click, label) => {
    const [response] = await Promise.all([page.waitForResponse(value => new URL(value.url()).pathname === '/api' + endpoint && value.request().method() === method), click()]);
    const body = await response.json();
    context.check(label, response.status() === 200 && body.code === 200);
    return body.data;
  };
  const section = (page, title) => page.locator('section.crm-ops-section').filter({ has: page.getByRole('heading', { name: title, exact: true }) });
  const fit = async (page, label) => context.check(label, await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  const close = dialog => dialog.getByRole('button', { name: '关闭弹窗', exact: true }).click();
  return { screenshot, action, section, fit, close };
}
