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
const evidenceRoot = path.join(root, '.cloudflow-runtime/full-prd-20260915/approved-runtime');
const output = path.join(evidenceRoot, `c1-layout-designer-20261005-${round}`); await fs.mkdir(output);
const hash = async filename => createHash('sha256').update(await fs.readFile(path.resolve(root, filename))).digest('hex').toUpperCase();
const inputs = JSON.parse((await fs.readFile(path.join(evidenceRoot, `h3-portal-finance-20261002-frontend-${build}-inputs.json`), 'utf8')).replace(/^\uFEFF/, ''));
for (const Path of ['scripts/verify-c1-layout-designer.mjs', 'scripts/form-checks/FormLayoutDesignerCheck.tsx']) inputs.push({ Path, Hash: await hash(Path) });
const checkInputs = async () => { for (const input of inputs) assert.equal(await hash(input.Path), input.Hash.toUpperCase(), 'Layout designer input changed'); };
await checkInputs(); await fs.writeFile(path.join(output, 'inputs.json'), JSON.stringify(inputs, null, 2));
const server = await createServer({ root: frontend, configFile: path.join(frontend, 'vite.config.ts'), logLevel: 'error', server: { host: '127.0.0.1', port: 0, strictPort: true, fs: { allow: [root] } } });
const checks = [], pageErrors = [], requests = [], observations = [];
let browser, activePage, failure;
const check = (label, passed) => { checks.push({ label, passed: Boolean(passed) }); console.log(`${passed ? 'PASS' : 'FAIL'} C1_LAYOUT ${label}`); };
const waitFor = async (read, accept, message) => {
  const deadline = Date.now() + 15000;
  do { const value = await read(); if (accept(value)) return value; await new Promise(resolve => setTimeout(resolve, 100)); } while (Date.now() < deadline);
  throw new Error(message);
};
try {
  await server.listen(); const origin = 'http://127.0.0.1:' + server.httpServer.address().port;
  browser = await chromium.launch({ headless: true });
  for (const device of ['mobile', 'desktop']) {
    const context = await browser.newContext(device === 'mobile' ? { ...devices['Pixel 5'], viewport: { width: 390, height: 844 }, serviceWorkers: 'block' } : { viewport: { width: 1600, height: 1100 }, serviceWorkers: 'block' });
    await context.routeWebSocket('**/*', socket => socket.close());
    await context.route('**/*', async route => {
      const request = route.request(), url = new URL(request.url());
      if (url.origin !== origin || !['GET', 'HEAD'].includes(request.method()) || url.pathname.startsWith('/api/')) { requests.push({ method: request.method(), path: url.pathname }); return route.abort(); }
      if (url.pathname === '/c1-layout') {
        const entry = '/@fs/' + path.join(root, 'scripts/form-checks/FormLayoutDesignerCheck.tsx').replaceAll('\\', '/');
        return route.fulfill({ contentType: 'text/html', body: `<html lang="zh-CN"><head><meta name="viewport" content="width=device-width,initial-scale=1"><script type="module">import RefreshRuntime from '/@react-refresh';RefreshRuntime.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;window.__vite_plugin_react_preamble_installed__=true;</script></head><body><div id="root"></div><script type="module" src="${entry}"></script></body></html>` });
      }
      return route.continue();
    });
    const page = await context.newPage(); activePage = page;
    page.on('pageerror', error => pageErrors.push({ device, name: error.name, message: error.message }));
    const tap = locator => device === 'mobile' ? locator.tap() : locator.click();
    await page.goto(origin + '/c1-layout'); await page.locator('#input-group_text').waitFor();
    for (const [field, title] of [['group', '分组标题'], ['grid2', '2列标题'], ['grid3', '3列标题'], ['grid4', '4列标题'], ['tabs', '标签页标题'], ['collapsed', '折叠标题']]) {
      const observed = await page.locator('#field-' + field).evaluate(element => ({ tag: element.tagName, legend: element.querySelector(':scope > legend')?.textContent }));
      observations.push({ device, field, ...observed });
      check(`${device}_${field}_fieldset_and_configured_legend`, observed.tag === 'FIELDSET' && observed.legend === title);
    }
    for (const columns of [2, 3, 4]) {
      const observed = await page.locator(`#field-grid${columns} > div`).evaluate(element => ({ tracks: getComputedStyle(element).gridTemplateColumns.split(' ').length, width: element.getBoundingClientRect().width }));
      check(`${device}_grid_${columns}_responsive_columns`, observed.tracks === (device === 'mobile' ? 1 : columns));
    }
    const tabs = page.getByRole('tab');
    const tabNames = await tabs.allTextContents();
    check(`${device}_tab_headers_use_configured_titles`, JSON.stringify(tabNames) === '["第一页标题","第二页标题"]');
    await page.locator('#input-first_text').fill(device + '-first');
    await tap(tabs.nth(1)); await page.locator('#input-second_text').fill(device + '-second');
    await tap(tabs.nth(0));
    check(`${device}_tab_switch_keeps_entered_values`, await page.locator('#input-first_text').inputValue() === device + '-first');
    await tabs.nth(0).focus(); await tabs.nth(0).press('ArrowRight');
    check(`${device}_tab_keyboard_moves_focus_and_value`, await tabs.nth(1).evaluate(element => element === document.activeElement) && await page.locator('#input-second_text').inputValue() === device + '-second');
    if (device === 'mobile') check('mobile_tab_targets_at_least_44px', (await tabs.nth(0).boundingBox()).height >= 44);
    const summary = page.locator('#field-collapsed summary');
    check(`${device}_collapse_starts_closed`, !await page.locator('#input-collapsed_text').isVisible());
    await tap(summary); await page.locator('#input-collapsed_text').fill(device + '-collapsed');
    await summary.press('Enter'); await summary.press('Enter');
    check(`${device}_collapse_keyboard_toggle_keeps_value`, await page.locator('#input-collapsed_text').isVisible() && await page.locator('#input-collapsed_text').inputValue() === device + '-collapsed');
    await page.screenshot({ path: path.join(output, `${device}-layouts.png`), fullPage: true });

    if (device === 'desktop') {
      await page.goto(origin + '/c1-layout?scenario=designer'); await page.getByRole('button', { name: '拖动字段甲', exact: true }).waitFor();
      const article = label => page.getByRole('button', { name: '拖动' + label, exact: true }).locator('xpath=ancestor::article[1]');
      const definition = async () => {
        await page.getByRole('button', { name: '查看定义', exact: true }).click();
        const dialog = page.getByRole('dialog', { name: '表单字段定义', exact: true });
        const fields = JSON.parse(await dialog.getByRole('textbox').inputValue());
        await dialog.press('Escape'); await dialog.waitFor({ state: 'hidden' }); return fields;
      };
      const drag = async (source, target) => {
        await source.scrollIntoViewIfNeeded(); await target.scrollIntoViewIfNeeded();
        const start = await source.boundingBox(), end = await target.boundingBox(); assert.ok(start && end);
        await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
        await page.mouse.down(); await page.mouse.move(start.x + start.width / 2 + 9, start.y + start.height / 2, { steps: 3 });
        await page.mouse.move(end.x + end.width / 2, end.y + end.height / 2, { steps: 18 }); await page.mouse.up();
        // The dependency's click guard lasts 50ms after dropping.
        await page.waitForTimeout(60);
      };
      const tail = label => article(label).getByRole('button', { name: '将字段拖到这里，添加到当前容器末尾', exact: true }).last();
      await drag(page.getByRole('button', { name: '拖动待移动字段', exact: true }), tail('来源容器'));
      let fields = await definition();
      check('designer_drag_into_container', !fields.some(field => field.id === 'loose') && fields.find(field => field.id === 'source')?.children.at(-1)?.id === 'loose');
      await drag(page.getByRole('button', { name: '拖动字段乙', exact: true }), page.getByRole('button', { name: '拖动字段甲', exact: true }));
      fields = await definition();
      check('designer_sort_inside_container', JSON.stringify(fields.find(field => field.id === 'source')?.children.map(field => field.id)) === '["beta","alpha","loose"]');
      await drag(page.getByRole('button', { name: '拖动字段甲', exact: true }), tail('目标容器'));
      fields = await definition();
      check('designer_drag_between_containers_keeps_field', fields.find(field => field.id === 'destination')?.children.at(-1)?.id === 'alpha' && fields.find(field => field.id === 'destination')?.children.at(-1)?.defaultValue === 'alpha-default');
      const beforeDepth = JSON.stringify(fields);
      await article('第3层').locator(':scope > div').first().getByRole('button').filter({ hasText: '第3层' }).click();
      await page.getByRole('button', { name: '分组', exact: true }).click();
      check('designer_rejects_fourth_container_layer', JSON.stringify(await definition()) === beforeDepth && await page.getByText('布局容器最多嵌套3层', { exact: true }).count() > 0);
      await page.getByRole('button', { name: '保存表单', exact: true }).click();
      await page.getByRole('button', { name: '确认保存版本', exact: true }).click();
      const saved = await waitFor(() => page.getByTestId('saved-definition').textContent(), value => JSON.stringify(JSON.parse(value).fields) === beforeDepth, 'Component save did not retain designer fields');
      await page.getByRole('button', { name: '重载组件已保存定义', exact: true }).click();
      check('designer_component_save_reload_keeps_three_layers_and_moves', JSON.stringify(await definition()) === JSON.stringify(JSON.parse(saved).fields));
      await page.getByRole('button', { name: '预览', exact: true }).click();
      const preview = page.getByRole('dialog', { name: '表单预览', exact: true });
      await preview.locator('#input-alpha').fill('preview-entered');
      await preview.getByRole('button', { name: '手机布局', exact: true }).click();
      check('designer_mobile_preview_keeps_values_and_single_column', await preview.locator('#input-alpha').inputValue() === 'preview-entered' && await preview.locator('#field-grid4 > div').evaluate(element => getComputedStyle(element).gridTemplateColumns.split(' ').length === 1));
      const width = await preview.locator('#field-grid4').evaluate(element => element.parentElement.parentElement.getBoundingClientRect().width);
      check('designer_mobile_preview_width_at_most_375px', width <= 375);
      await preview.getByRole('button', { name: '桌面布局', exact: true }).click();
      check('designer_desktop_preview_keeps_values_and_four_columns', await preview.locator('#input-alpha').inputValue() === 'preview-entered' && await preview.locator('#field-grid4 > div').evaluate(element => getComputedStyle(element).gridTemplateColumns.split(' ').length === 4));
      await page.screenshot({ path: path.join(output, 'designer-preview.png') });
    }
    await context.close();
  }
  check('layout_designer_has_no_browser_exceptions', pageErrors.length === 0);
  check('component_checks_issue_no_business_requests', requests.length === 0);
  assert.ok(checks.every(item => item.passed), 'Layout designer behavior requirements failed');
} catch (error) {
  failure = error;
  if (activePage && !activePage.isClosed()) await activePage.screenshot({ path: path.join(output, 'failure.png') }).catch(() => undefined);
} finally {
  await browser?.close(); await server.close();
  try { await checkInputs(); } catch (error) { failure = error; }
  await fs.writeFile(path.join(output, 'result.json'), JSON.stringify({ componentOnly: true, frontendBuild: build, checks, observations, pageErrors, businessRequests: requests, inputs: inputs.length, passed: !failure, failure: failure?.message, wholeC1Acceptance: false }, null, 2));
  console.log('C1_LAYOUT_DESIGNER: ' + JSON.stringify({ checks: checks.length, passedChecks: checks.filter(item => item.passed).length, failedChecks: checks.filter(item => !item.passed).length, componentOnly: true, pageErrors: pageErrors.length, businessRequests: requests.length, inputs: inputs.length, passed: !failure }));
}
if (failure) throw failure;
