import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import { createServer as reservePort } from 'node:net';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
assert.notEqual(path.parse(root).root.toLowerCase(), `${process.env.SystemDrive}\\`.toLowerCase(), 'data-drive workspace required');
const frontend = path.join(root, 'cloudflow-frontend');
const output = path.join(root, '.cloudflow-runtime', 'hr-crm-availability-ui', randomUUID().replaceAll('-', ''));
const requireFrontend = createRequire(path.join(frontend, 'package.json'));
const requireBrowser = createRequire(path.join(process.env.CLOUDFLOW_PLAYWRIGHT_HOME || path.join(root, '.cloudflow-runtime', 'playwright'), 'package.json'));
const { createServer } = await import(pathToFileURL(requireFrontend.resolve('vite')).href);
const { chromium } = requireBrowser('playwright-core');
const reservation = reservePort();
await new Promise((resolve, reject) => { reservation.once('error', reject); reservation.listen(0, '127.0.0.1', resolve); });
const port = reservation.address().port;
await new Promise(resolve => reservation.close(resolve));
const server = await createServer({ root: frontend, configFile: path.join(frontend, 'vite.config.ts'),
  cacheDir: path.join(output, 'vite-cache'), logLevel: 'error',
  server: { host: '127.0.0.1', port, strictPort: true, fs: { allow: [root] } } });
const checks = [];
const errors = [];
const unexpected = [];
const requests = [];
const cancelled = [];
let scenario = 'failure';
let marker = 'initial';
let pending = [];
let closing = false;
let browser;
let page;
let failure;
const check = (label, condition) => { assert.ok(condition, label); checks.push(label); console.log(`PASS ${label}`); };
const sample = (dimension, label, basis, currency) => [{ dimension, targetId: dimension === 'OWNER' ? 301 : 101,
  targetName: `${label}-${dimension}`, calculationBasis: basis, currency, wonOpportunityCount: -1, allocatedWonCount: '-0.6000',
  wonAmount: '-6000.00', contractAmount: '-999999999999.99', receivedAmount: '125.00', outstandingAmount: '35.00',
  baselineWonAmount: '0.00', baselineContractAmount: '0.00', baselineReceivedAmount: '0.00', followUpCount: 3, customerCount: 1 }];
const flush = () => { const previous = pending; pending = []; previous.forEach(resolve => resolve()); };
const waitHeld = async () => {
  const deadline = Date.now() + 20000;
  while (pending.length < 2 && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(pending.length, 2, 'both held ranking queries must arrive');
};

try {
  await fs.mkdir(output, { recursive: true });
  await server.listen();
  const origin = `http://127.0.0.1:${port}`;
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' });
  await context.routeWebSocket('**/*', socket => socket.close());
  await context.route('**/*', async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin !== origin) { unexpected.push(url.origin); return route.abort(); }
    if (url.pathname === '/crm-availability-check') {
      const entry = `/@fs/${path.join(root, 'scripts/hr-checks/HrCrmPerformanceAvailabilityCheck.tsx').replaceAll('\\', '/')}`;
      return route.fulfill({ contentType: 'text/html', body: `<!doctype html><html lang="zh-CN"><head><meta name="viewport" content="width=device-width,initial-scale=1"><script type="module">import RefreshRuntime from '/@react-refresh';RefreshRuntime.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;window.__vite_plugin_react_preamble_installed__=true;</script></head><body><div id="root"></div><script type="module" src="${entry}"></script></body></html>` });
    }
    if (!url.pathname.startsWith('/api/')) return ['GET', 'HEAD'].includes(request.method()) ? route.continue() : route.abort();
    const owner = url.pathname === '/api/hr/performance/crm/top-owners';
    if (request.method() !== 'GET' || !owner && url.pathname !== '/api/hr/performance/crm/top-depts') {
      unexpected.push(`${request.method()} ${url.pathname}`); return route.abort();
    }
    const selected = scenario;
    const responseMarker = marker;
    requests.push({ path: url.pathname, query: url.search, scenario: selected, marker: responseMarker });
    const unavailable = selected === 'failure' || selected === 'owner-failure' && owner || selected === 'department-failure' && !owner;
    const body = unavailable ? { code: 503, msg: '销售业绩暂不可用，请稍后重试', data: null }
      : { code: 200, data: selected === 'empty' ? [] : selected === 'null-owner' && owner || selected === 'null-department' && !owner ? null
        : selected === 'invalid-list' && owner ? {} : selected === 'invalid-row' && owner ? [null] : sample(owner ? 'OWNER' : 'DEPT', responseMarker, url.searchParams.get('calculationBasis'), url.searchParams.get('currency')) };
    if (selected === 'network-failure' && owner) return route.abort('connectionfailed');
    if (selected === 'held') await new Promise(resolve => pending.push(resolve));
    try { await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) }); }
    catch (error) { if (!closing && !request.failure()) errors.push(String(error)); }
  });
  page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  page.on('requestfailed', request => {
    if (new URL(request.url()).pathname.startsWith('/api/hr/performance/crm/')) cancelled.push({ url: request.url(), error: request.failure()?.errorText });
  });
  page.setDefaultTimeout(20000);
  const panel = page.getByRole('region', { name: '销售业绩检查', exact: true });
  const refresh = () => panel.getByRole('button', { name: '刷新', exact: true }).click();
  const noData = async label => check(label, await panel.locator('.admin-source-stat').count() === 0
    && await panel.locator('table').count() === 0 && !(await panel.innerText()).includes('暂无数据'));
  const ready = async label => {
    await panel.getByText(`${label}-OWNER`, { exact: true }).waitFor();
    await panel.getByText(`${label}-DEPT`, { exact: true }).waitFor();
  };
  const failureVisible = async () => panel.getByRole('alert').waitFor();
  const selectDay = async (label, day) => {
    await panel.getByRole('group', { name: label, exact: true }).getByRole('button').click();
    await page.locator('.cf-date-cell:not(.cf-date-cell-outside)').filter({ hasText: new RegExp(`^${day}$`) }).click();
  };
  const layout = async (width, state) => {
    await page.setViewportSize({ width, height: 1000 });
    const geometry = await panel.evaluate(element => ({ viewport: innerWidth, document: document.documentElement.scrollWidth,
      left: element.getBoundingClientRect().left, right: element.getBoundingClientRect().right,
      controls: [...element.querySelectorAll('.cf-date-trigger, button, input:not([type="hidden"])')].filter(button => button.getClientRects().length)
        .map(button => ({ width: button.getBoundingClientRect().width, height: button.getBoundingClientRect().height,
          className: button.className, minimumHeight: getComputedStyle(button).minHeight })) }));
    console.log(`AVAILABILITY_LAYOUT ${JSON.stringify({ width, state, ...geometry })}`);
    check(`${state}-${width}px无页面横向溢出，查询触控区至少44px`, geometry.document <= geometry.viewport
      && geometry.left >= 0 && geometry.right <= geometry.viewport + 1 && geometry.controls.length >= 3
      && geometry.controls.every(control => control.width >= 44 && control.height >= 44));
    if (state === 'success') {
      const tables = await panel.locator('[data-crm-sales-scroll]').evaluateAll(wrappers => wrappers.map(wrapper => {
        const table = wrapper.querySelector('table');
        const row = table.tBodies[0].rows[0];
        const cells = [...row.cells].map(cell => {
          const range = document.createRange(); range.selectNodeContents(cell);
          const content = range.getBoundingClientRect();
          const bounds = cell.getBoundingClientRect();
          const oneLine = range.getClientRects().length === 1;
          const withinCell = content.left >= bounds.left - 1 && content.right <= bounds.right + 1;
          wrapper.scrollLeft = cell.offsetLeft - wrapper.offsetLeft - (wrapper.clientWidth - cell.clientWidth) / 2;
          const visible = range.getBoundingClientRect();
          const viewport = wrapper.getBoundingClientRect();
          return { oneLine, withinCell, fullyReachable: visible.left >= viewport.left - 1 && visible.right <= viewport.right + 1,
            visible: getComputedStyle(cell).display === 'table-cell' };
        });
        wrapper.scrollLeft = 0;
        return { width: table.getBoundingClientRect().width, wrapper: wrapper.clientWidth, scroll: wrapper.scrollWidth,
          headers: table.tHead.rows[0].cells.length, cells, focusable: wrapper.tabIndex === 0 };
      }));
      check(`success-${width}px两份榜单十列完整、金额不换行重叠且均可滚动查看`, tables.length === 2
        && tables.every(table => table.headers === 10 && table.cells.length === 10 && table.width >= 1180
          && table.focusable && table.cells.every(cell => cell.oneLine && cell.withinCell && cell.fullyReachable && cell.visible)
          && (width >= 1180 || table.scroll > table.wrapper)));
      check(`success-${width}px保留负数及大额分位`, await panel.locator('table').getByText('-999,999,999,999.99', { exact: true }).count() === 2
        && await panel.getByText('-6,000.00', { exact: true }).count() === 2
        && await panel.getByText('-0.6000', { exact: true }).count() === 2);
      const cardAmounts = await panel.locator('[data-crm-sales-card-amount]').evaluateAll(elements => elements.map(element => {
        const range = document.createRange(); range.selectNodeContents(element);
        const bounds = range.getBoundingClientRect(), card = element.closest('.admin-source-stat').getBoundingClientRect();
        return range.getClientRects().length === 1 && bounds.left >= card.left && bounds.right <= card.right
          && Number.parseFloat(getComputedStyle(element).fontSize) >= 16
          && getComputedStyle(element).color === getComputedStyle(element.closest('strong')).color;
      }));
      check(`success-${width}px金额卡片完整保留小数且不拆行`, cardAmounts.length === 2 && cardAmounts.every(Boolean));
    }
    await panel.screenshot({ path: path.join(output, `${state}-${width}.png`) });
    if (state === 'success' && width < 1180) {
      for (const [position, column] of [['amounts', 5], ['end', 9]]) {
        await panel.locator('[data-crm-sales-scroll]').evaluateAll((wrappers, selected) => wrappers.forEach(wrapper => {
          const cell = wrapper.querySelector('tbody tr').cells[selected];
          wrapper.scrollLeft = cell.offsetLeft - wrapper.offsetLeft;
        }), column);
        await panel.screenshot({ path: path.join(output, `${state}-${position}-${width}.png`) });
      }
      await panel.locator('[data-crm-sales-scroll]').evaluateAll(wrappers => wrappers.forEach(wrapper => { wrapper.scrollLeft = 0; }));
    }
  };

  await page.goto(`${origin}/crm-availability-check`, { waitUntil: 'domcontentloaded' });
  await panel.getByText('销售业绩暂不可用，请稍后重试', { exact: false }).waitFor();
  await noData('首次失败不显示零值卡片、空榜单或暂无数据');
  await failureVisible();
  check('默认明确查询团队分成及人民币', requests.length === 2 && requests.every(request => {
    const query = new URLSearchParams(request.query); return query.get('calculationBasis') === 'TEAM_V2' && query.get('currency') === 'CNY';
  }));
  check('失败状态提供手动刷新', await panel.getByRole('button', { name: '刷新', exact: true }).isEnabled());
  for (const width of [1440, 375, 320]) await layout(width, 'failure');

  scenario = 'held'; marker = 'first-success';
  await refresh();
  await page.waitForFunction(() => document.querySelector('[aria-label="销售业绩检查"]')?.textContent.includes('正在加载销售业绩'));
  await noData('正在加载时不展示旧值或伪造零值');
  check('加载时刷新禁用且旧错误清除', await panel.getByRole('button', { name: '刷新', exact: true }).isDisabled()
    && await panel.getByRole('alert').count() === 0);
  await waitHeld();
  flush(); await ready(marker);
  check('两份查询都成功才同时显示统计和榜单', await panel.locator('.admin-source-stat').count() === 4 && await panel.locator('table').count() === 2);
  for (const width of [1440, 375, 320]) await layout(width, 'success');

  for (const failedScenario of ['owner-failure', 'department-failure', 'null-owner', 'null-department', 'invalid-list', 'invalid-row', 'network-failure']) {
    scenario = failedScenario; await refresh(); await failureVisible();
    await noData(`${failedScenario}清除两份旧榜单并显示失败`);
    scenario = 'success'; marker = `recovered-${failedScenario}`; await refresh(); await ready(marker);
    check(`${failedScenario}可显式刷新恢复`, await panel.getByRole('alert').count() === 0);
  }

  scenario = 'empty'; await refresh();
  await panel.getByText('暂无数据', { exact: true }).first().waitFor();
  check('真实成功空列表保留合法空态', await panel.getByText('暂无数据', { exact: true }).count() === 2
    && await panel.locator('.admin-source-stat').count() === 4 && await panel.getByRole('alert').count() === 0);

  scenario = 'success'; marker = 'range-before'; await selectDay('起始日期', 10); await selectDay('结束日期', 20);
  await ready(marker);
  scenario = 'held'; marker = 'obsolete-range'; await refresh();
  await waitHeld();
  scenario = 'success'; marker = 'current-range'; await selectDay('结束日期', 21); await ready(marker);
  flush();
  await page.waitForTimeout(100);
  check('迟到的旧日期响应不能覆盖当前结果', (await panel.innerText()).includes('current-range-OWNER')
    && !(await panel.innerText()).includes('obsolete-range'));
  check('切换日期取消旧查询', cancelled.filter(request => request.error?.includes('ABORTED')).length >= 2);
  const latest = requests.filter(request => request.marker === 'current-range');
  check('员工及部门使用同一新日期查询', latest.length === 2 && latest.every(request => new URLSearchParams(request.query).get('endDate')?.endsWith('-21')));

  scenario = 'failure'; await refresh(); await failureVisible();
  check('失败后保留已选日期', await panel.getByRole('group', { name: '起始日期', exact: true }).locator('input[type="hidden"]').inputValue().then(value => value.endsWith('-10'))
    && await panel.getByRole('group', { name: '结束日期', exact: true }).locator('input[type="hidden"]').inputValue().then(value => value.endsWith('-21')));
  for (const width of [375, 320]) await layout(width, 'range-failure');
  scenario = 'held'; marker = 'unmounted'; await refresh();
  await waitHeld();
  await page.getByRole('button', { name: '卸载销售业绩检查', exact: true }).click(); flush();
  await panel.getByText('销售业绩检查已卸载', { exact: true }).waitFor();
  scenario = 'success'; marker = 'remounted'; await page.getByRole('button', { name: '载入销售业绩检查', exact: true }).click(); await ready(marker);
  check('离开后旧请求不能污染重新进入的结果', !(await panel.innerText()).includes('unmounted'));
  check('没有页面异常或未声明外部请求', errors.length === 0 && unexpected.length === 0);
} catch (error) {
  failure = error;
  if (page) await page.screenshot({ path: path.join(output, 'failure.png'), fullPage: true }).catch(() => {});
} finally {
  closing = true; flush();
  if (browser) await browser.close();
  await server.close();
  await fs.writeFile(path.join(output, 'result.json'), JSON.stringify({ checks, errors, unexpected, requests,
    failure: failure ? String(failure) : null, apiDoubles: true, backendHttp: false, database: false, productionModified: false }, null, 2));
  console.log(`H3_CRM_PERFORMANCE_AVAILABILITY_UI: checks=${checks.length}; failed=${failure ? 1 : 0}; api_doubles=true; backend_http=false; database=false; production_modified=false`);
  console.log(`AVAILABILITY_UI_EVIDENCE=${output}`);
}
if (failure) throw failure;
