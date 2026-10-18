import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import fs from 'node:fs/promises';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), frontend = path.join(root, 'cloudflow-frontend');
const requireFrontend = createRequire(path.join(frontend, 'package.json')), requireBrowser = createRequire(path.join(root, '.cloudflow-runtime/playwright/package.json'));
const { createServer } = await import(pathToFileURL(requireFrontend.resolve('vite')).href), { chromium, devices } = requireBrowser('playwright-core');
const [round, build, mode = 'observe'] = process.argv.slice(2);
assert.match(round || '', /^r[1-9][0-9]*$/); assert.match(build || '', /^r[1-9][0-9]*$/); assert.ok(['observe', 'verify'].includes(mode));
const evidence = path.join(root, '.cloudflow-runtime/full-prd-20260915/approved-runtime');
const output = path.join(evidence, `c2-mobile-subtable-20261005-${round}`); await fs.mkdir(output);
const hash = async filename => createHash('sha256').update(await fs.readFile(path.resolve(root, filename))).digest('hex').toUpperCase();
const inputs = JSON.parse((await fs.readFile(path.join(evidence, `h3-portal-finance-20261002-frontend-${build}-inputs.json`), 'utf8')).replace(/^\uFEFF/, ''));
for (const Path of ['scripts/verify-c2-mobile-subtable.mjs', 'scripts/form-checks/FormSubTableMobileCheck.tsx']) inputs.push({ Path, Hash: await hash(Path) });
const verifyInputs = async () => { for (const input of inputs) assert.equal(await hash(input.Path), input.Hash.toUpperCase(), 'Mobile subtable input changed'); };
await verifyInputs(); await fs.writeFile(path.join(output, 'inputs.json'), JSON.stringify(inputs, null, 2));
const server = await createServer({ root: frontend, configFile: path.join(frontend, 'vite.config.ts'), logLevel: 'error', server: { host: '127.0.0.1', port: 0, strictPort: true, fs: { allow: [root] } } });
const checks = [], pageErrors = [], businessRequests = [];
let browser, page, failure;
const check = (label, passed) => { checks.push({ label, passed: Boolean(passed) }); if (mode === 'verify') assert.ok(passed, label); };
try {
  await server.listen(); const origin = 'http://127.0.0.1:' + server.httpServer.address().port;
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ ...devices['Pixel 5'], viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  await context.routeWebSocket('**/*', socket => socket.close());
  await context.route('**/*', route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin !== origin || !['GET', 'HEAD'].includes(request.method()) || url.pathname.startsWith('/api/')) { businessRequests.push({ method: request.method(), path: url.pathname }); return route.abort(); }
    if (url.pathname === '/subtable-check') {
      const entry = '/@fs/' + path.join(root, 'scripts/form-checks/FormSubTableMobileCheck.tsx').replaceAll('\\', '/');
      return route.fulfill({ contentType: 'text/html', body: `<html lang="zh-CN"><head><meta name="viewport" content="width=device-width,initial-scale=1"><script type="module">import RefreshRuntime from '/@react-refresh';RefreshRuntime.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;window.__vite_plugin_react_preamble_installed__=true;</script></head><body><div id="root"></div><script type="module" src="${entry}"></script></body></html>` });
    }
    return route.continue();
  });
  page = await context.newPage(); page.on('pageerror', error => pageErrors.push(error.name));
  const open = async scenario => { await page.goto(origin + '/subtable-check?scenario=' + scenario); await page.getByRole('heading', { name: '手机费用明细', exact: true }).waitFor(); await page.getByTestId('values').waitFor({ state: 'attached' }); };
  const rows = async () => JSON.parse(await page.getByTestId('values').textContent()).items;
  const tap = async locator => { await locator.scrollIntoViewIfNeeded(); await locator.tap(); };
  await open('standard');
  check('mobile_has_cards', await page.getByRole('group', { name: '第1条明细', exact: true }).count() === 1 && await page.getByRole('table').count() === 0);
  check('mobile_uses_move_buttons_without_dragging', await page.getByRole('button', { name: '上移第1行', exact: true }).count() === 1 && await page.getByRole('button', { name: '下移第1行', exact: true }).count() === 1 && await page.getByRole('button', { name: /拖动第/ }).count() === 0);
  check('mobile_row_actions_in_header_menu', await page.getByRole('button', { name: '第1条明细操作', exact: true }).count() === 1);
  check('mobile_add_in_sticky_footer', await page.getByRole('button', { name: '新增明细', exact: true }).evaluate(button => Boolean(button.closest('[data-subtable-footer]')) && getComputedStyle(button.closest('[data-subtable-footer]')).position === 'sticky'));
  if (mode === 'verify') {
    const before = await rows();
    const footer = await page.locator('[data-subtable-footer]').boundingBox();
    check('footer_reachable_at_viewport_bottom', footer && footer.y >= 0 && footer.y + footer.height <= 845);
    check('first_up_and_last_down_disabled', await page.getByRole('button', { name: '上移第1行', exact: true }).isDisabled() && await page.getByRole('button', { name: '下移第3行', exact: true }).isDisabled());
    await tap(page.getByRole('button', { name: '下移第1行', exact: true }));
    check('moving_down_keeps_row_identity_and_values', JSON.stringify(await rows()) === JSON.stringify([before[1], before[0], before[2]]));
    await tap(page.getByRole('button', { name: '上移第2行', exact: true }));
    check('moving_up_restores_order', JSON.stringify(await rows()) === JSON.stringify(before));
    await tap(page.getByRole('button', { name: '第1条明细操作', exact: true }));
    await tap(page.getByRole('button', { name: '复制第1行', exact: true }));
    const copied = await rows();
    check('menu_copy_keeps_values_and_creates_identity', copied.length === 4 && copied[0]._rowId !== copied[1]._rowId && copied[1].name === before[0].name && copied[1].amount === before[0].amount);
    await tap(page.getByRole('button', { name: '第2条明细操作', exact: true }));
    await tap(page.getByRole('button', { name: '删除第2行', exact: true }));
    check('menu_delete_removes_only_selected_copy', JSON.stringify(await rows()) === JSON.stringify(before));
    await tap(page.getByRole('button', { name: '新增明细', exact: true }));
    check('footer_add_preserves_prior_rows_and_defaults', (await rows()).length === 4 && (await rows())[3].name === '新增费用' && JSON.stringify((await rows()).slice(0, 3)) === JSON.stringify(before));
    check('footer_decimal_sum_is_exact', await page.locator('[data-subtable-footer]').getByText('0.50', { exact: true }).count() === 1);
    const sizes = await page.getByRole('button', { name: /上移第|下移第|条明细操作|新增明细/ }).evaluateAll(elements => elements.map(element => { const box = element.getBoundingClientRect(); return { width: box.width, height: box.height }; }));
    check('mobile_actions_have_44px_targets', sizes.length > 0 && sizes.every(box => box.width >= 44 && box.height >= 44));
    await page.screenshot({ path: path.join(output, 'mobile-actions.png') });
    for (const scenario of ['empty', 'limits', 'locked', 'readonly', 'virtual']) {
      await open(scenario);
      if (scenario === 'empty') { await tap(page.getByRole('button', { name: '新增明细', exact: true })); check('empty_table_adds_first_row', (await rows()).length === 1); }
      else if (scenario === 'limits') {
        check('max_rows_blocks_add', await page.getByRole('button', { name: '新增明细', exact: true }).isDisabled());
        await tap(page.getByRole('button', { name: '第1条明细操作', exact: true }));
        check('limits_block_menu_copy_and_delete', await page.getByRole('button', { name: '复制第1行', exact: true }).isDisabled() && await page.getByRole('button', { name: '删除第1行', exact: true }).isDisabled());
      } else if (scenario === 'virtual') {
        const first = (await rows())[0]; await tap(page.getByRole('button', { name: '下移第1行', exact: true }));
        check('virtual_cards_move_without_losing_data', (await rows()).length === 31 && JSON.stringify((await rows())[1]) === JSON.stringify(first) && await page.getByRole('group', { name: /第\d+条明细/ }).count() < 31);
      } else check(scenario + '_blocks_all_row_operations', await page.getByRole('button', { name: /上移第|下移第|条明细操作|新增明细/ }).count() === 0);
    }
  }
  check('no_browser_errors_or_business_requests', pageErrors.length === 0 && businessRequests.length === 0);
} catch (error) {
  failure = error;
  await fs.writeFile(path.join(output, 'failure.json'), JSON.stringify({ name: error.name, message: String(error.message).split('\n')[0] }));
  if (page && !page.isClosed()) await page.screenshot({ path: path.join(output, 'failure.png') }).catch(() => undefined);
} finally {
  if (browser) await browser.close(); await server.close(); await verifyInputs();
  await fs.writeFile(path.join(output, 'result.json'), JSON.stringify({ completed: !failure, mode, componentOnly: true, checks, pageErrors, businessRequests, inputs: inputs.length }, null, 2));
  console.log(`C2_MOBILE_SUBTABLE: mode=${mode}; checks=${checks.length}; unmet=${checks.filter(check => !check.passed).length}; completed=${!failure}; inputs=${inputs.length}; business_database_writes=0`);
}
if (failure) throw failure;
