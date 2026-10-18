import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Share the existing real session across devices without a second login invalidating its token.
// Cookie state stays in memory and is never written as evidence.
export async function createB2MobileBrowser({ admin: source, secrets, check, landingPath = '/workflow/monitor', landingHeading = '工作流监控' }) {
  const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
  const requireBrowser = createRequire(path.join(process.env.CLOUDFLOW_PLAYWRIGHT_HOME
    || path.join(root, '.cloudflow-runtime', 'playwright'), 'package.json'));
  const { devices } = requireBrowser('playwright-core');
  const origin = new URL(source.url()).origin;
  let context;
  try {
    const token = await source.evaluate(async () => (await import('/src/utils/authStorage.ts')).getAuthToken());
    assert.ok(token); secrets.add(token.replace(/^Bearer /, ''));
    const storageState = await source.context().storageState();
    for (const cookie of storageState.cookies) if (cookie.value.length >= 12) secrets.add(cookie.value);
    context = await source.context().browser().newContext({ ...devices['Pixel 5'],
      viewport: { width: 390, height: 844 }, screen: { width: 390, height: 844 },
      storageState, serviceWorkers: 'block' });
    await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    const page = await context.newPage();
    assert.ok(landingPath.startsWith('/') && !landingPath.startsWith('//'));
    await page.goto(origin + landingPath, { waitUntil: 'domcontentloaded' });
    await page.getByRole('heading', { name: landingHeading, exact: true }).waitFor({ timeout: 60000 });
    const actual = await page.evaluate(() => ({ width: innerWidth, touch: navigator.maxTouchPoints,
      mobileAgent: /Android.*Mobile/.test(navigator.userAgent), coarsePointer: matchMedia('(pointer: coarse)').matches }));
    check('独立手机浏览器通过真实登录恢复且启用390宽触屏环境', actual.width === 390
      && actual.touch > 0 && actual.mobileAgent && actual.coarsePointer);
    return { page, async close() {
      const current = await page.evaluate(async () => (await import('/src/utils/authStorage.ts')).getAuthToken());
      if (current) secrets.add(current.replace(/^Bearer /, ''));
      for (const cookie of await context.cookies()) if (cookie.value.length >= 12) secrets.add(cookie.value);
      await context.close();
    } };
  } catch (error) {
    if (context) await context.close();
    throw error;
  }
}

export async function tapB2Mobile(locator) {
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox(), viewport = locator.page().viewportSize();
  assert.ok(box && viewport && box.x >= -1 && box.y >= -1
    && box.x + box.width <= viewport.width + 1 && box.y + box.height <= viewport.height + 1,
  'Mobile control must be fully reachable inside the viewport');
  await locator.tap();
}
