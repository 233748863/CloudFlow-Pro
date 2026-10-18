import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import fs from 'node:fs/promises';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), frontend = path.join(root, 'cloudflow-frontend');
const requireFrontend = createRequire(path.join(frontend, 'package.json')), requireBrowser = createRequire(path.join(root, '.cloudflow-runtime/playwright/package.json'));
const { createServer } = await import(pathToFileURL(requireFrontend.resolve('vite')).href), { chromium } = requireBrowser('playwright-core');
const [round, build, mode = 'observe'] = process.argv.slice(2);
assert.match(round || '', /^r[1-9][0-9]*$/); assert.match(build || '', /^r[1-9][0-9]*$/); assert.ok(['observe', 'verify'].includes(mode));
const evidence = path.join(root, '.cloudflow-runtime/full-prd-20260915/approved-runtime');
const output = path.join(evidence, `c2-native-table-20261005-${round}`); await fs.mkdir(output);
const hash = async filename => createHash('sha256').update(await fs.readFile(path.resolve(root, filename))).digest('hex').toUpperCase();
const inputs = JSON.parse((await fs.readFile(path.join(evidence, `h3-portal-finance-20261002-frontend-${build}-inputs.json`), 'utf8')).replace(/^\uFEFF/, ''));
for (const Path of ['scripts/verify-c2-native-table.mjs', 'scripts/form-checks/FormSubTableDesktopCheck.tsx']) inputs.push({ Path, Hash: await hash(Path) });
const verifyInputs = async () => { for (const input of inputs) assert.equal(await hash(input.Path), input.Hash.toUpperCase(), 'Native table input changed'); };
await verifyInputs(); await fs.writeFile(path.join(output, 'inputs.json'), JSON.stringify(inputs, null, 2));
const server = await createServer({ root: frontend, configFile: path.join(frontend, 'vite.config.ts'), logLevel: 'error', server: { host: '127.0.0.1', port: 0, strictPort: true, fs: { allow: [root] } } });
const checks = [], pageErrors = [], businessRequests = [];
let browser, page, failure, mountMs;
const check = (label, passed) => { checks.push({ label, passed: Boolean(passed) }); if (mode === 'verify') assert.ok(passed, label); };
try {
  await server.listen(); const origin = 'http://127.0.0.1:' + server.httpServer.address().port;
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 }, serviceWorkers: 'block' });
  await context.routeWebSocket('**/*', socket => socket.close());
  await context.route('**/*', route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin !== origin || !['GET', 'HEAD'].includes(request.method()) || url.pathname.startsWith('/api/')) { businessRequests.push({ method: request.method(), path: url.pathname }); return route.abort(); }
    if (url.pathname === '/native-table-check') {
      const entry = '/@fs/' + path.join(root, 'scripts/form-checks/FormSubTableDesktopCheck.tsx').replaceAll('\\', '/');
      return route.fulfill({ contentType: 'text/html', body: `<html lang="zh-CN"><head><meta name="viewport" content="width=device-width,initial-scale=1"><script type="module">import RefreshRuntime from '/@react-refresh';RefreshRuntime.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;window.__vite_plugin_react_preamble_installed__=true;</script></head><body><div id="root"></div><script type="module" src="${entry}"></script></body></html>` });
    }
    return route.continue();
  });
  page = await context.newPage(); page.on('pageerror', error => pageErrors.push(error.name));
  const open = async count => { await page.goto(origin + '/native-table-check?rows=' + count); await page.getByRole('heading', { name: '电脑费用明细', exact: true }).waitFor(); };
  const rows = async () => JSON.parse(await page.getByTestId('values').textContent()).items;
  const input = index => page.locator('[id=' + JSON.stringify(`input-items[${index}].name`) + ']');
  const structure = async prefix => {
    check(prefix + '_native_table', await page.locator('table').count() === 1);
    check(prefix + '_native_scoped_headers', await page.locator('table thead th[scope="col"]').count() === 10);
    check(prefix + '_legal_table_descendants', await page.locator('table').evaluateAll(tables => tables.length === 1 && tables.every(table =>
      [...table.children].every(node => ['CAPTION', 'COLGROUP', 'THEAD', 'TBODY', 'TFOOT'].includes(node.tagName))
      && [...table.querySelectorAll('thead,tbody,tfoot')].every(section => [...section.children].every(row => row.tagName === 'TR'))
      && [...table.querySelectorAll('tr')].every(row => [...row.children].every(cell => ['TH', 'TD'].includes(cell.tagName))))));
  };
  await open(3); await structure('ordinary');
  check('three_complete_native_rows', await page.locator('tbody tr[aria-label] td').count() === 30);
  if (mode === 'verify') {
    const initialRows = await rows();
    await input(0).fill('修改首行费用');
    check('cell_edit_preserves_row_identity', (await rows())[0].name === '修改首行费用' && (await rows())[0]._rowId === initialRows[0]._rowId);
    await page.getByRole('button', { name: '复制第1行', exact: true }).click();
    const copied = await rows();
    check('copy_creates_identity_with_same_values', copied.length === 4 && copied[1].name === copied[0].name && copied[1]._rowId !== copied[0]._rowId);
    await page.getByRole('button', { name: '删除第2行', exact: true }).click();
    check('delete_preserves_other_rows', (await rows()).length === 3 && (await rows())[1]._rowId === initialRows[1]._rowId);
    await page.getByRole('button', { name: '拖动第1行排序', exact: true }).focus();
    await page.keyboard.press('Space'); await page.waitForTimeout(80); await page.keyboard.press('ArrowDown'); await page.waitForTimeout(80); await page.keyboard.press('Space');
    check('keyboard_drag_preserves_values_and_identity', (await rows())[1]._rowId === initialRows[0]._rowId && (await rows())[1].name === '修改首行费用');
    check('table_action_targets_44px', await page.getByRole('button', { name: /拖动第|复制第|删除第/ }).evaluateAll(buttons => buttons.length === 9 && buttons.every(button => { const rect = button.getBoundingClientRect(); return rect.width >= 44 && rect.height >= 44; })));
    await open(0); check('empty_state_in_spanning_cell', await page.locator('tbody td[colspan="10"]').getByText('暂无费用明细', { exact: true }).count() === 1);
    await open(30); check('thirty_rows_render_without_virtualization', await page.getByRole('row', { name: /第\d+条明细/ }).count() === 30);
    await open(31); check('thirty_one_rows_use_virtualization', await page.getByRole('row', { name: /第\d+条明细/ }).count() > 0 && await page.getByRole('row', { name: /第\d+条明细/ }).count() < 20);
  }
  await open(100); await structure('virtual');
  mountMs = await page.evaluate(() => Number(document.documentElement.dataset.tableMountMs));
  check('hundred_by_eight_mount_under_500ms', Number.isFinite(mountMs) && mountMs < 500);
  check('hundred_rows_render_only_visible_window', await page.getByRole('row', { name: /第\d+条明细/ }).count() > 0 && await page.getByRole('row', { name: /第\d+条明细/ }).count() < 20);
  if (mode === 'verify') {
    await page.getByRole('row', { name: '第1条明细', exact: true }).evaluate(row => {
      let parent = row.parentElement;
      while (parent && !(parent.scrollHeight > parent.clientHeight && /auto|scroll/.test(getComputedStyle(parent).overflowY))) parent = parent.parentElement;
      if (!parent) throw new Error('Virtual table scroll container missing'); parent.scrollTop = parent.scrollHeight;
    });
    await input(99).waitFor(); await input(99).scrollIntoViewIfNeeded(); await input(99).fill('末行费用修改');
    check('virtual_last_row_keeps_full_data', (await rows()).length === 100 && (await rows())[99].name === '末行费用修改' && (await rows())[99]._rowId === 'row-99' && (await rows())[0].name === '费用1');
    check('virtual_table_exposes_total_and_row_index', await page.locator('table').getAttribute('aria-rowcount') === '101' && await page.getByRole('row', { name: '第100条明细', exact: true }).getAttribute('aria-rowindex') === '101');
    check('virtual_scoped_header_remains_visible', await page.locator('thead').evaluate(header => { const rect = header.getBoundingClientRect(); const viewport = header.closest('table').parentElement.getBoundingClientRect(); return rect.top >= viewport.top - 1 && rect.bottom <= viewport.bottom + 1; }));
  }
  await page.screenshot({ path: path.join(output, 'desktop-table.png') });
  check('no_browser_errors_or_business_requests', pageErrors.length === 0 && businessRequests.length === 0);
} catch (error) { failure = error; if (page && !page.isClosed()) await page.screenshot({ path: path.join(output, 'failure.png') }).catch(() => undefined); }
finally {
  await browser?.close(); await server.close(); await verifyInputs();
  await fs.writeFile(path.join(output, 'result.json'), JSON.stringify({ completed: !failure, mode, componentOnly: true, checks, mountMs, pageErrors, businessRequests, inputs: inputs.length, failure: failure ? { name: failure.name, message: String(failure.message).split('\n')[0] } : undefined }, null, 2));
  console.log(`C2_NATIVE_TABLE: mode=${mode}; checks=${checks.length}; unmet=${checks.filter(check => !check.passed).length}; completed=${!failure}; inputs=${inputs.length}; business_database_writes=0`);
}
if (failure) throw failure;
