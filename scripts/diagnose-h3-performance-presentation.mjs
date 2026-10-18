import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const frontend = path.join(root, 'cloudflow-frontend');
const output = path.join(root, '.cloudflow-runtime/full-prd-20260915/approved-runtime/h3-performance-layout-diagnosis-20261010-r1');
const requireFrontend = createRequire(path.join(frontend, 'package.json'));
const requireBrowser = createRequire(path.join(process.env.CLOUDFLOW_PLAYWRIGHT_HOME || path.join(root, '.cloudflow-runtime/playwright'), 'package.json'));
const { chromium } = requireBrowser('playwright-core');
const { createServer } = await import(pathToFileURL(requireFrontend.resolve('vite')).href);
await fs.mkdir(output);
const server = await createServer({ root: frontend, configFile: path.join(frontend, 'vite.config.ts'),
  cacheDir: path.join(output, 'vite-cache'), logLevel: 'error',
  server: { host: '127.0.0.1', port: 0, strictPort: true, fs: { allow: [root] } } });
let browser;
const observations = [];
try {
  await server.listen();
  const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 375, height: 1000 }, serviceWorkers: 'block' });
  await context.routeWebSocket('**/*', socket => socket.close());
  await context.route('**/*', route => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin !== origin || !['GET', 'HEAD'].includes(request.method())) return route.abort();
    if (url.pathname === '/crm-availability-check') {
      const entry = `/@fs/${path.join(root, 'scripts/hr-checks/HrCrmPerformanceAvailabilityCheck.tsx').replaceAll('\\', '/')}`;
      return route.fulfill({ contentType: 'text/html', body: `<!doctype html><html lang="zh-CN"><head><meta name="viewport" content="width=device-width,initial-scale=1"><script type="module">import RefreshRuntime from '/@react-refresh';RefreshRuntime.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;window.__vite_plugin_react_preamble_installed__=true;</script></head><body><div id="root"></div><script type="module" src="${entry}"></script></body></html>` });
    }
    if (!url.pathname.startsWith('/api/')) return route.continue();
    if (!['/api/hr/performance/crm/top-owners', '/api/hr/performance/crm/top-depts'].includes(url.pathname)) return route.abort();
    const dimension = url.pathname.endsWith('top-owners') ? 'OWNER' : 'DEPT';
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ code: 200, data: [{
      dimension, targetId: 301, targetName: '版式诊断-' + dimension, calculationBasis: 'TEAM_V2', currency: 'CNY',
      wonOpportunityCount: -1, allocatedWonCount: '-0.6000', wonAmount: '-6000.00', contractAmount: '160.00',
      receivedAmount: '125.00', outstandingAmount: '35.00', baselineWonAmount: '0.00', baselineContractAmount: '0.00',
      baselineReceivedAmount: '0.00', customerCount: 1, followUpCount: 3,
    }] }) });
  });
  const page = await context.newPage();
  await page.goto(origin + '/crm-availability-check', { waitUntil: 'networkidle' });
  await page.getByText('版式诊断-OWNER', { exact: true }).waitFor();
  for (const width of [1440, 375, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    observations.push(await page.locator('table').first().evaluate(table => {
      const computed = getComputedStyle(table);
      const wrapper = table.closest('.table-wrapper');
      const matching = [];
      const visit = rules => {
        for (const rule of rules) {
          if (rule.selectorText && table.matches(rule.selectorText) && (rule.style.minWidth || rule.style.width || rule.style.tableLayout)) {
            matching.push({ selector: rule.selectorText, width: rule.style.width, minWidth: rule.style.minWidth, tableLayout: rule.style.tableLayout });
          }
          if (rule.cssRules && (!(rule instanceof CSSMediaRule) || matchMedia(rule.conditionText).matches)) visit(rule.cssRules);
        }
      };
      for (const sheet of document.styleSheets) visit(sheet.cssRules);
      return { viewport: innerWidth, document: document.documentElement.scrollWidth, className: table.className,
        table: { width: table.getBoundingClientRect().width, minWidth: computed.minWidth, layout: computed.tableLayout },
        wrapper: { width: wrapper.clientWidth, scrollWidth: wrapper.scrollWidth, overflowX: getComputedStyle(wrapper).overflowX },
        cells: [...table.tBodies[0].rows[0].cells].map(cell => ({ text: cell.textContent, width: cell.clientWidth,
          scrollWidth: cell.scrollWidth, whiteSpace: getComputedStyle(cell).whiteSpace, display: getComputedStyle(cell).display })), matching };
    }));
  }
  assert.equal(observations.length, 3);
  await fs.writeFile(path.join(output, 'geometry.json'), JSON.stringify(observations, null, 2));
  for (const observation of observations) console.log('H3_LAYOUT_DIAGNOSIS ' + JSON.stringify(observation));
} finally {
  if (browser) await browser.close();
  await server.close();
}
