import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const frontend = path.join(root, 'cloudflow-frontend');
const output = path.join(root, '.cloudflow-runtime/chart-consumers', randomUUID().replaceAll('-', ''));
const requireFrontend = createRequire(path.join(frontend, 'package.json'));
const requireBrowser = createRequire(path.join(process.env.CLOUDFLOW_PLAYWRIGHT_HOME || path.join(root, '.cloudflow-runtime/playwright'), 'package.json'));
const { createServer } = await import(pathToFileURL(requireFrontend.resolve('vite')).href);
const { chromium } = requireBrowser('playwright-core');
await fs.mkdir(output, { recursive: true });
const server = await createServer({ root: frontend, configFile: path.join(frontend, 'vite.config.ts'), cacheDir: path.join(output, 'vite-cache'), logLevel: 'error',
  server: { host: '127.0.0.1', port: 0, hmr: false, watch: null, fs: { allow: [root] } } });
const summary = { totalCount: 100, completedCount: 80, failedCount: 1, avgDurationMs: 120000, minDurationMs: 1000, maxDurationMs: 600000,
  successRate: 80, failedRate: 1, timeoutInstanceCount: 10, timeoutEventCount: 12, timeoutInstanceRate: 10, anomalyInstanceCount: 5, anomalyEventCount: 8, anomalyInstanceRate: 5, healthLabel: '需关注' };
const errors = []; const checks = []; const requests = [];
const check = (label, condition) => { assert.ok(condition, label); checks.push(label); console.log(`PASS ${label}`); };
let browser;
try {
  await server.listen();
  const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
  browser = await chromium.launch({ headless: true });
  for (const width of [1440, 320]) {
    const context = await browser.newContext({ viewport: { width, height: 1000 }, serviceWorkers: 'block' });
    await context.routeWebSocket('**/*', socket => socket.close());
    await context.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.origin !== origin) { errors.push(`External: ${url.origin}`); return route.abort(); }
      if (['/performance-chart-check', '/hr-chart-check'].includes(url.pathname)) {
        const entry = `/@fs/${path.join(root, 'scripts/chart-checks/ChartConsumersCheck.tsx').replaceAll('\\', '/')}`;
        return route.fulfill({ contentType: 'text/html', body: `<!doctype html><html lang="zh-CN"><head><meta name="viewport" content="width=device-width,initial-scale=1"><script type="module">import RefreshRuntime from '/@react-refresh';RefreshRuntime.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;window.__vite_plugin_react_preamble_installed__=true;</script></head><body><div id="root"></div><script type="module" src="${entry}"></script></body></html>` });
      }
      if (!url.pathname.startsWith('/api/')) return route.continue();
      requests.push(`${route.request().method()} ${url.pathname}${url.search}`);
      const respond = data => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ code: 200, msg: 'success', data }) });
      if (url.pathname === '/api/auth/info') return respond({ user: { userId: 101, userName: 'chart-check', nickName: '图表验收', tenantId: 100000, forcePasswordChange: false }, roles: ['ADMIN'], permissions: ['*:*:*'] });
      if (url.pathname === '/api/workflow/monitor/performance/dashboard') return respond({ summary, compareSummary: summary,
        context: { startDate: '2026-09-01', endDate: '2026-09-30', compareStartDate: '2026-08-01', compareEndDate: '2026-08-30', processDefKey: url.searchParams.get('processDefKey'), processLabel: url.searchParams.has('processDefKey') ? '采购流程' : '全部流程', daySpan: 30 },
        trend: Array.from({ length: 3 }, (_, index) => ({ ...summary, statDate: `2026-09-0${index + 1}` })),
        processes: [{ ...summary, processDefKey: 'purchase', processName: '采购流程', riskScore: 15 }] });
      if (url.pathname === '/api/workflow/monitor/performance/risk-breakdown') return respond({ timeoutLevels: [{ level: 'CRITICAL', label: '严重超时', count: 12, rate: 100 }], anomalyTypes: [{ type: 'EXECUTION_ERROR', label: '执行异常', count: 8, rate: 100 }], totals: { timeoutTotal: 12, anomalyTotal: 8 } });
      if (url.pathname === '/api/hr/performance/distribution/rules') return respond([]);
      errors.push(`Unexpected: ${route.request().method()} ${url.pathname}`); return route.abort();
    });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`${origin}/performance-chart-check`, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.waitForFunction(() => document.querySelectorAll('canvas').length === 4, undefined, { timeout: 120000 });
    check(`${width}px 实际绩效页面四张图表可用`, await page.locator('canvas').count() === 4);
    await page.getByTestId('risk-matrix-card').getByRole('button', { name: '查看数据表' }).click();
    check(`${width}px 风险表保留两个风险率和数量`, await page.getByTestId('risk-matrix-card').getByRole('table').innerText().then(text => text.includes('100') && text.includes('10.0%') && text.includes('5.0%')));
    await page.getByTestId('risk-matrix-card').getByRole('button', { name: '选择流程' }).focus();
    await page.keyboard.press('Enter');
    await page.waitForTimeout(350);
    check(`${width}px 实际页面数据表选择触发同一流程筛选`, requests.some(value => value.includes('performance/dashboard') && value.includes('processDefKey=purchase')));
    await page.getByTestId('risk-matrix-card').getByRole('button', { name: '查看图表' }).click();
    await page.screenshot({ path: path.join(output, `performance-${width}.png`), fullPage: true });
    await page.goto(`${origin}/hr-chart-check`, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.waitForFunction(() => document.querySelectorAll('canvas').length === 1, undefined, { timeout: 120000 });
    check(`${width}px 绩效配额实际弹窗图表可见`, await page.getByRole('img', { name: '绩效等级配额分布图' }).isVisible());
    await page.getByRole('button', { name: '查看数据表' }).click();
    check(`${width}px 配额数据表完整保留四个等级与百分比`, await page.getByRole('table').first().innerText().then(text => ['S', 'A', 'B', 'C', '10%', '30%', '50%'].every(value => text.includes(value))));
    await page.getByRole('button', { name: '查看图表' }).click();
    const quota = page.getByRole('textbox', { name: 'S等级配额百分比' });
    check(`${width}px 配额输入保持可见宽度`, (await quota.boundingBox()).width >= 40);
    await quota.fill('20');
    await page.getByRole('button', { name: '查看数据表' }).click();
    check(`${width}px 本地编辑即时更新同一数据表`, (await page.getByRole('table').first().innerText()).includes('20%'));
    await page.getByRole('button', { name: '查看图表' }).click();
    await page.screenshot({ path: path.join(output, `hr-distribution-${width}.png`), fullPage: true });
    await context.close();
  }
  check('实际组件没有浏览器异常或未约定请求', errors.length === 0);
  check('只读取统计未提交业务修改', requests.every(value => value.startsWith('GET ')));
  console.log(`A5_CHART_CONSUMERS_RESULT: checks=${checks.length}; output=${output}; browser=true; controlled_api=true; business_http=false`);
} finally {
  await browser?.close(); await server.close();
  await fs.writeFile(path.join(output, 'results.json'), JSON.stringify({ checks, errors, requests }, null, 2));
}
