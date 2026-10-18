import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import fs from 'node:fs/promises';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const frontend = path.join(root, 'cloudflow-frontend');
const requireFrontend = createRequire(path.join(frontend, 'package.json'));
const requireBrowser = createRequire(path.join(root, '.cloudflow-runtime/playwright/package.json'));
const { createServer } = await import(pathToFileURL(requireFrontend.resolve('vite')).href);
const { chromium, devices } = requireBrowser('playwright-core');
const [round, build] = process.argv.slice(2);
assert.match(round || '', /^r[1-9][0-9]*$/); assert.match(build || '', /^r[1-9][0-9]*$/);
const evidence = path.join(root, '.cloudflow-runtime/full-prd-20260915/approved-runtime');
const output = path.join(evidence, `c1-palette-mobile-20261005-${round}`); await fs.mkdir(output);
const hash = async filename => createHash('sha256').update(await fs.readFile(path.resolve(root, filename))).digest('hex').toUpperCase();
const inputs = JSON.parse((await fs.readFile(path.join(evidence, `h3-portal-finance-20261002-frontend-${build}-inputs.json`), 'utf8')).replace(/^\uFEFF/, ''));
for (const Path of ['scripts/verify-c1-palette-mobile.mjs', 'scripts/form-checks/FormPaletteMobileCheck.tsx']) inputs.push({ Path, Hash: await hash(Path) });
const verifyInputs = async () => { for (const input of inputs) assert.equal(await hash(input.Path), input.Hash.toUpperCase(), 'Palette mobile input changed'); };
await verifyInputs(); await fs.writeFile(path.join(output, 'inputs.json'), JSON.stringify(inputs, null, 2));
const server = await createServer({ root: frontend, configFile: path.join(frontend, 'vite.config.ts'), logLevel: 'error', server: { host: '127.0.0.1', port: 0, strictPort: true, fs: { allow: [root] } } });
const checks = [], pageErrors = [], blockedRequests = [], groups = ['文本', '数值', '日期', '选择', '组织', '文件', '静态', '布局与明细'];
let browser, page, failure;
const check = (label, passed) => { checks.push({ label, passed: Boolean(passed) }); assert.ok(passed, label); };
try {
  await server.listen(); const origin = 'http://127.0.0.1:' + server.httpServer.address().port;
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ ...devices['Pixel 5'], viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  await context.routeWebSocket('**/*', socket => socket.close());
  await context.route('**/*', route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin !== origin || !['GET', 'HEAD'].includes(request.method()) || url.pathname.startsWith('/api/')) {
      blockedRequests.push({ method: request.method(), path: url.pathname }); return route.abort();
    }
    if (url.pathname === '/palette-check') {
      const entry = '/@fs/' + path.join(root, 'scripts/form-checks/FormPaletteMobileCheck.tsx').replaceAll('\\', '/');
      return route.fulfill({ contentType: 'text/html', body: `<html lang="zh-CN"><head><meta name="viewport" content="width=device-width,initial-scale=1"><script type="module">import RefreshRuntime from '/@react-refresh';RefreshRuntime.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;window.__vite_plugin_react_preamble_installed__=true;</script></head><body><div id="root"></div><script type="module" src="${entry}"></script></body></html>` });
    }
    return route.continue();
  });
  page = await context.newPage(); page.on('pageerror', error => pageErrors.push(error.name));
  await page.goto(origin + '/palette-check'); await page.getByRole('heading', { name: '字段组件', exact: true }).waitFor();
  check('mobile_component_390_touch_environment', await page.evaluate(() => innerWidth === 390 && navigator.maxTouchPoints > 0 && matchMedia('(pointer: coarse)').matches));
  const tap = async locator => {
    await locator.scrollIntoViewIfNeeded(); const box = await locator.boundingBox();
    assert.ok(box && box.x >= -1 && box.y >= -1 && box.x + box.width <= 391 && box.y + box.height <= 845, 'Mobile palette control outside viewport');
    await locator.tap();
  };
  for (const group of groups) {
    const closing = page.getByRole('button', { name: '收起' + group + '分组', exact: true });
    await closing.scrollIntoViewIfNeeded(); const box = await closing.boundingBox();
    check('mobile_' + group + '_group_touch_target', box && box.height >= 44 && box.width >= 44);
    const controlledId = await closing.getAttribute('aria-controls'); assert.ok(controlledId);
    await tap(closing); const opening = page.getByRole('button', { name: '展开' + group + '分组', exact: true });
    check('mobile_' + group + '_group_collapses', await opening.getAttribute('aria-expanded') === 'false' && await page.locator('[id=' + JSON.stringify(controlledId) + ']').isHidden());
    await tap(opening);
    check('mobile_' + group + '_group_expands', await closing.getAttribute('aria-expanded') === 'true' && await page.locator('[id=' + JSON.stringify(controlledId) + ']').isVisible());
  }
  await tap(page.getByRole('button', { name: '收起文本分组', exact: true }));
  await page.getByPlaceholder('搜索字段', { exact: true }).fill('  TEXT  ');
  check('mobile_search_reveals_collapsed_matches', await page.getByRole('button', { name: '单行文本', exact: true }).isVisible() && await page.getByRole('button', { name: '收起文本分组', exact: true }).isDisabled());
  await page.getByPlaceholder('搜索字段', { exact: true }).fill('');
  check('mobile_clear_search_restores_collapsed_preference', await page.getByRole('button', { name: '展开文本分组', exact: true }).isVisible() && await page.getByRole('button', { name: '单行文本', exact: true }).isHidden());
  check('mobile_group_actions_do_not_add_fields', await page.evaluate(() => window.paletteAdded.length === 0));
  await page.screenshot({ path: path.join(output, 'mobile-groups.png') });
  check('mobile_palette_no_browser_errors_or_business_requests', pageErrors.length === 0 && blockedRequests.length === 0);
} catch (error) {
  failure = error;
  await fs.writeFile(path.join(output, 'failure.json'), JSON.stringify({ name: error.name, message: String(error.message).split('\n')[0] }));
  if (page && !page.isClosed()) await page.screenshot({ path: path.join(output, 'failure.png') }).catch(() => undefined);
} finally {
  if (browser) await browser.close(); await server.close(); await verifyInputs();
  await fs.writeFile(path.join(output, 'result.json'), JSON.stringify({ passed: !failure, scope: 'COMPONENT_ONLY', groups: groups.length, checks, pageErrors, blockedRequests, businessDatabaseWrites: 0, mobileDesignerRoute: false, inputs: inputs.length }, null, 2));
  console.log(`C1_PALETTE_MOBILE: scope=COMPONENT_ONLY; groups=${groups.length}; checks=${checks.length}; passed=${!failure}; inputs=${inputs.length}; business_database_writes=0; mobile_designer_route=false`);
}
if (failure) throw failure;
