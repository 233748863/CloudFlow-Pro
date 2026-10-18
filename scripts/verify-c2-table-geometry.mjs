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
const output = path.join(evidence, `c2-table-geometry-20261005-${round}`); await fs.mkdir(output);
const hash = async filename => createHash('sha256').update(await fs.readFile(path.resolve(root, filename))).digest('hex').toUpperCase();
const inputs = JSON.parse((await fs.readFile(path.join(evidence, `h3-portal-finance-20261002-frontend-${build}-inputs.json`), 'utf8')).replace(/^\uFEFF/, ''));
for (const Path of ['scripts/verify-c2-table-geometry.mjs', 'scripts/form-checks/FormSubTableGeometryCheck.tsx']) inputs.push({ Path, Hash: await hash(Path) });
const verifyInputs = async () => { for (const input of inputs) assert.equal(await hash(input.Path), input.Hash.toUpperCase(), 'Table geometry input changed'); };
await verifyInputs(); await fs.writeFile(path.join(output, 'inputs.json'), JSON.stringify(inputs, null, 2));
const server = await createServer({ root: frontend, configFile: path.join(frontend, 'vite.config.ts'), logLevel: 'error', server: { host: '127.0.0.1', port: 0, strictPort: true, fs: { allow: [root] } } });
const checks = [], observations = [], pageErrors = [], businessRequests = [];
let browser, page, failure;
const check = (label, passed) => { checks.push({ label, passed: Boolean(passed) }); };
const settle = async () => page.evaluate(async () => { for (let frame = 0; frame < 45; frame++) await new Promise(resolve => requestAnimationFrame(resolve)); });
const observe = async (device, count, phase, target = 0) => {
  await settle();
  const result = await page.evaluate(({ target }) => {
    const section = document.querySelector('section[aria-label="列内容明细"]');
    const table = section.querySelector('table'), header = table?.querySelector('thead');
    const list = [...section.querySelectorAll('div')].find(node => /auto|scroll/.test(getComputedStyle(node).overflowY) && node.scrollHeight > node.clientHeight);
    const nodes = [...section.querySelectorAll('tr[aria-rowindex],div[role="group"][aria-label]')];
    const rects = nodes.map(row => { const box = row.getBoundingClientRect(); return { index: row.getAttribute('aria-label'), top: box.top, bottom: box.bottom, height: box.height }; });
    const input = document.getElementById(`input-items[${target}].name`), error = document.getElementById(`error-items[${target}].name`);
    const box = input?.getBoundingClientRect(), viewport = list?.getBoundingClientRect();
    const visibleTop = viewport ? Math.max(viewport.top, header && getComputedStyle(header).position === 'sticky' ? header.getBoundingClientRect().bottom : viewport.top) : 48;
    const within = Boolean(box && box.height && box.top >= Math.max(48, visibleTop) && box.bottom <= innerHeight && (!viewport || box.bottom <= viewport.bottom));
    const content = [...section.querySelectorAll('th,[id^="error-"],[id^="field-items["]')];
    return { header: header?.getBoundingClientRect().height, tableHeight: table?.getBoundingClientRect().height, listHeight: list?.scrollHeight,
      scrollTop: list?.scrollTop, rendered: rects, nonoverlap: rects.every((rect, index) => index === 0 || rect.top >= rects[index - 1].bottom - 1),
      overflow: content.filter(node => node.scrollWidth > node.clientWidth + 1).map(node => ({ tag: node.tagName, id: node.id, width: node.clientWidth, scrollWidth: node.scrollWidth })),
      widths: table ? [...table.querySelectorAll('col')].map(col => col.getBoundingClientRect().width) : [],
      focused: input === document.activeElement, inView: within, errorComplete: Boolean(error && error.textContent.endsWith('ValidationDetail'.repeat(6))),
      explicitAddLabel: section.querySelector('[data-subtable-footer] button')?.getAttribute('aria-label') === '新增明细' };
  }, { target });
  observations.push({ device, count, phase, ...result });
  check(`${device}_${count}_${phase}_rows_do_not_overlap`, result.nonoverlap);
  check(`${device}_${count}_${phase}_content_wraps_in_its_cell`, result.overflow.length === 0);
  if (count > 30) check(`${device}_${count}_${phase}_only_visible_and_focused_rows_render`, result.rendered.length > 0 && result.rendered.length < 20);
  if (device === 'desktop') {
    check(`${device}_${count}_${phase}_configured_widths_retained`, result.widths.length === 6 && result.widths.every((width, index) => Math.abs(width - [68,120,800,120,120,120][index]) <= 1));
    if (count > 30) check(`${device}_${count}_${phase}_table_matches_scroll_extent`, Math.abs(result.tableHeight - result.listHeight) <= 1);
  }
  if (phase !== 'initial') { check(`${device}_${count}_${phase}_error_focused_and_visible`, result.focused && result.inView); check(`${device}_${count}_${phase}_complete_error_text`, result.errorComplete); }
  return result;
};
try {
  await server.listen(); const origin = 'http://127.0.0.1:' + server.httpServer.address().port;
  browser = await chromium.launch({ headless: true });
  for (const device of ['desktop', 'mobile']) {
    const context = await browser.newContext(device === 'mobile' ? { ...devices['Pixel 5'], viewport: { width: 390, height: 844 }, serviceWorkers: 'block' } : { viewport: { width: 1600, height: 1000 }, serviceWorkers: 'block' });
    await context.routeWebSocket('**/*', socket => socket.close());
    await context.route('**/*', route => {
      const request = route.request(), url = new URL(request.url());
      if (url.origin !== origin || !['GET','HEAD'].includes(request.method()) || url.pathname.startsWith('/api/')) { businessRequests.push({ method: request.method(), path: url.pathname }); return route.abort(); }
      if (url.pathname === '/geometry-check') {
        const entry = '/@fs/' + path.join(root, 'scripts/form-checks/FormSubTableGeometryCheck.tsx').replaceAll('\\','/');
        return route.fulfill({ contentType: 'text/html', body: `<html lang="zh-CN"><head><meta name="viewport" content="width=device-width,initial-scale=1"><script type="module">import RefreshRuntime from '/@react-refresh';RefreshRuntime.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;window.__vite_plugin_react_preamble_installed__=true;</script></head><body><div id="root"></div><script type="module" src="${entry}"></script></body></html>` });
      }
      return route.continue();
    });
    page = await context.newPage(); page.on('pageerror', error => pageErrors.push(error.name));
    const open = async (count, content = 'long') => { await page.goto(`${origin}/geometry-check?rows=${count}&content=${content}`); await page.getByRole('heading', { name: '列内容检查', exact: true }).waitFor(); await page.locator('[id="input-items[0].name"]').waitFor(); };
    for (const count of [3, 31, 100]) {
      await open(count); const initial = await observe(device, count, 'initial');
      check(`${device}_${count}_add_has_explicit_label`, initial.explicitAddLabel);
      for (const [phase, label, index] of [['last','定位末行错误',count - 1],['first','定位首行错误',0]]) {
        const action = page.getByRole('button', { name: label, exact: true }); if (device === 'mobile') await action.tap(); else await action.click();
        await observe(device, count, phase, index);
        await page.screenshot({ path: path.join(output, `${device}-${count}-${phase}.png`) });
      }
      if (device === 'desktop' && count === 100) {
        await page.getByRole('button', { name: '定位末行错误', exact: true }).click(); await settle();
        const focused = await page.locator('[id="input-items[99].name"]').elementHandle();
        await page.locator('table').evaluate(table => { table.parentElement.scrollTop = 0; }); await settle();
        check('scroll_keeps_only_one_extra_focused_row', Boolean(focused && await focused.evaluate(node => node.isConnected && document.activeElement === node)) && await page.locator('tbody tr[aria-rowindex]').count() < 20);
        await page.getByRole('button', { name: '清除错误', exact: true }).click(); await settle();
        check('leaving_table_releases_offscreen_focused_row', await page.locator('[id="input-items[99].name"]').count() === 0);
        await focused?.dispose();
      }
    }
    if (device === 'desktop') {
      await open(3, 'short'); await settle();
      const handle = page.getByRole('button', { name: '拖动第1行排序', exact: true }), destination = page.getByRole('button', { name: '拖动第3行排序', exact: true });
      const source = await handle.boundingBox(), target = await destination.boundingBox();
      await page.mouse.move(source.x + source.width / 2, source.y + source.height / 2); await page.mouse.down();
      await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 25 }); await page.mouse.up(); await settle();
      const values = JSON.parse(await page.getByTestId('values').textContent()).items;
      check('actual_pointer_drag_preserves_all_values_and_ids', JSON.stringify(values.map(row => [row._rowId,row.name])) === JSON.stringify([['geometry-1','费用2'],['geometry-2','费用3'],['geometry-0','费用1']]));
    }
    await context.close();
  }
  check('no_browser_errors_or_business_requests', pageErrors.length === 0 && businessRequests.length === 0);
  if (mode === 'verify') assert.ok(checks.every(check => check.passed), 'Table geometry checks failed');
} catch (error) { failure = error; if (page && !page.isClosed()) await page.screenshot({ path: path.join(output, 'failure.png') }).catch(() => undefined); }
finally {
  await browser?.close(); await server.close(); await verifyInputs();
  await fs.writeFile(path.join(output, 'result.json'), JSON.stringify({ completed: !failure, mode, componentOnly: true, checks, observations, pageErrors, businessRequests, inputs: inputs.length, failure: failure ? { name: failure.name, message: String(failure.message).split('\n')[0] } : undefined }, null, 2));
  console.log(`C2_TABLE_GEOMETRY: mode=${mode}; checks=${checks.length}; unmet=${checks.filter(check => !check.passed).length}; completed=${!failure}; inputs=${inputs.length}; business_database_writes=0`);
}
if (failure) throw failure;
