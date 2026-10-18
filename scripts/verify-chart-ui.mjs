import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const frontend = path.join(root, 'cloudflow-frontend');
const output = path.join(root, '.cloudflow-runtime/chart-ui', randomUUID().replaceAll('-', ''));
const requireFrontend = createRequire(path.join(frontend, 'package.json'));
const requireBrowser = createRequire(path.join(process.env.CLOUDFLOW_PLAYWRIGHT_HOME || path.join(root, '.cloudflow-runtime/playwright'), 'package.json'));
const { createServer } = await import(pathToFileURL(requireFrontend.resolve('vite')).href);
const { chromium } = requireBrowser('playwright-core');
await fs.mkdir(output, { recursive: true });
const server = await createServer({ root: frontend, configFile: path.join(frontend, 'vite.config.ts'), cacheDir: path.join(output, 'vite-cache'), logLevel: 'error',
  server: { host: '127.0.0.1', port: 0, hmr: false, watch: null, fs: { allow: [root] } } });
const errors = [];
const checks = [];
const warnings = [];
const metrics = {};
const check = (label, condition) => { assert.ok(condition, label); checks.push(label); console.log(`PASS ${label}`); };
let browser;
try {
  await server.listen();
  const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ serviceWorkers: 'block' });
  await context.addInitScript(() => {
    window.chartObserverCounts = { ResizeObserver: 0, MutationObserver: 0 };
    for (const name of ['ResizeObserver', 'MutationObserver']) {
      const Original = window[name];
      window[name] = class extends Original {
        active = false;
        observe(...args) { if (!this.active) { window.chartObserverCounts[name]++; this.active = true; } return super.observe(...args); }
        disconnect() { if (this.active) { window.chartObserverCounts[name]--; this.active = false; } return super.disconnect(); }
      };
    }
  });
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) { errors.push(`Unexpected external request: ${url.origin}`); return route.abort(); }
    if (!['/chart-check', '/preset-check'].includes(url.pathname)) return route.continue();
    const entry = `/@fs/${path.join(root, 'scripts/chart-checks', url.pathname === '/chart-check' ? 'DashboardChartCheck.tsx' : 'ChartPresetCheck.tsx').replaceAll('\\', '/')}`;
    return route.fulfill({ contentType: 'text/html', body: `<!doctype html><html lang="zh-CN"><head><meta name="viewport" content="width=device-width,initial-scale=1"><script type="module">import RefreshRuntime from '/@react-refresh';RefreshRuntime.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;window.__vite_plugin_react_preamble_installed__=true;</script></head><body><div id="root"></div><script type="module" src="${entry}"></script></body></html>` });
  });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'warning') warnings.push(message.text()); });
  for (const width of [1440, 320]) {
    await page.setViewportSize({ width, height: 1100 });
    await page.goto(`${origin}/chart-check`, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.waitForFunction(() => document.querySelectorAll('canvas').length === 2, undefined, { timeout: 120000 });
    await page.waitForTimeout(600);
    check(`${width}px 工作台实际图表已绘制`, await page.locator('canvas').count() === 2);
    await page.screenshot({ path: path.join(output, `dashboard-${width}.png`), fullPage: true });
    if (!process.argv.includes('--baseline')) {
      const toggle = page.getByRole('button', { name: '查看数据表' }).first();
      check(`${width}px 工作台切换操作高度至少44px`, (await toggle.boundingBox()).height >= 44);
      await toggle.click();
      check(`${width}px 工作负载表保留数量与说明`, await page.getByRole('table').innerText().then(text => text.includes('35') && text.includes('等待处理')));
      check(`${width}px 工作台没有页面横向溢出`, await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    }
  }
  if (!process.argv.includes('--baseline')) {
    await page.setViewportSize({ width: 1440, height: 1100 });
    await page.goto(`${origin}/preset-check`, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.waitForFunction(() => document.querySelectorAll('canvas').length === 8, undefined, { timeout: 120000 });
    const option = name => page.evaluate(name => window.charts.getInstanceByDom(document.querySelector(`[data-testid="${name}"] [role="img"]`)).getOption(), name);
    const light = await option('line');
    const tokens = await page.evaluate(() => { const s = getComputedStyle(document.documentElement); return ['--cf-chart-1', '--cf-chart-2', '--cf-chart-warning', '--cf-chart-critical', '--cf-fg-body', '--cf-fg-subtle'].map(key => s.getPropertyValue(key).trim()); });
    check('状态不占分类槽且分类按顺序分配', JSON.stringify(light.series.map(item => item.itemStyle.color)) === JSON.stringify([tokens[0], tokens[2], tokens[3], tokens[1]]));
    check('折线不平滑且状态文字进入可见图例', light.series.every(item => item.smooth === false) && light.series[1].name.includes('预警') && light.legend[0].show !== false);
    check('坐标轴图例提示文字使用墨色', light.xAxis[0].axisLabel.color === tokens[5] && light.legend[0].textStyle.color === tokens[5] && light.tooltip[0].textStyle.color === tokens[4]);
    const bar = await option('bar');
    check('横向堆叠柱保留同组原始值', bar.yAxis[0].type === 'category' && bar.series.every(item => item.stack === 'total') && bar.series[1].data[1] === 4);
    const donut = await option('donut');
    check('使用第四第五槽的环图有可见图例和总数', donut.legend[0].show !== false && donut.title[0].text === '15' && donut.series[0].data.length === 5);
    const funnel = await option('funnel');
    check('漏斗保留业务阶段顺序及数量', funnel.series[0].sort === 'none' && JSON.stringify(funnel.series[0].data.map(item => item.value)) === '[10,5,2]');
    await page.getByTestId('funnel').getByRole('button', { name: '查看数据表' }).click();
    check('漏斗数据表有逐阶段转化率', (await page.getByTestId('funnel').innerText()).includes('40.00%'));
    check('九类阻止绘制并给出开发期告警', await page.getByTestId('overflow').locator('canvas').count() === 0 && warnings.some(value => value.includes('9 个系列')));
    await page.getByTestId('overflow').getByRole('button', { name: '查看数据表' }).click();
    check('超八类仍完整保留数据表', await page.getByTestId('overflow').locator('th').count() === 10);
    await page.getByRole('button', { name: '更新回调' }).click();
    await page.evaluate(() => window.charts.getInstanceByDom(document.querySelector('[data-testid="scatter"] [role="img"]')).trigger('click', { dataIndex: 0 }));
    check('更新后图表事件使用最新回调', (await page.locator('output').innerText()) === '2:risk');
    await page.evaluate(() => window.charts.getInstanceByDom(document.querySelector('[data-testid="scatter"] [role="img"]')).dispatchAction({ type: 'showTip', seriesIndex: 0, dataIndex: 0 }));
    await page.waitForTimeout(250);
    check('风险提示完整且名称不能注入HTML', await page.evaluate(() => !window.chartInjection && !document.querySelector('img[src="x"]') && document.body.innerText.includes('异常率：10%')));
    check('风险状态具有可见文字', await page.getByRole('list', { name: '风险状态图例' }).innerText().then(value => value.includes('正常') && value.includes('严重')));
    await page.getByTestId('scatter').getByRole('button', { name: '查看数据表' }).click();
    await page.getByTestId('scatter').getByRole('button', { name: '选择流程' }).nth(1).focus();
    await page.keyboard.press('Enter');
    check('数据表键盘可选择同一流程', (await page.locator('output').innerText()) === '2:normal');
    await page.getByTestId('scatter').getByRole('button', { name: '查看图表' }).click();
    const themeTime = await page.evaluate(async () => { const start = performance.now(); document.documentElement.classList.add('dark'); await new Promise(resolve => requestAnimationFrame(resolve)); return performance.now() - start; });
    const dark = await option('line');
    check('暗色更新分类色且状态色保持', dark.series[0].itemStyle.color !== light.series[0].itemStyle.color && dark.series[1].itemStyle.color === light.series[1].itemStyle.color);
    metrics.themeMs = themeTime;
    check('主题更新在300ms以内', themeTime <= 300);
    await page.getByRole('button', { name: '切换加载' }).click();
    check('加载使用占位且销毁旧图', await page.getByRole('status', { name: '分类与状态趋势加载中' }).count() === 1 && await page.getByTestId('line').locator('canvas').count() === 0);
    await page.getByRole('button', { name: '切换加载' }).click();
    await page.getByRole('button', { name: '切换空数据' }).click();
    check('空态替换图表并保留说明', (await page.getByTestId('line').innerText()).includes('暂无图表数据'));
    await page.getByRole('button', { name: '切换空数据' }).click();
    await page.setViewportSize({ width: 320, height: 1100 });
    await page.waitForTimeout(200);
    check('预设320px无页面横向溢出', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    const boxes = await page.locator('[role="img"]').evaluateAll(elements => elements.map(element => { const box = element.getBoundingClientRect(); return { label: element.getAttribute('aria-label'), left: box.left, right: box.right, width: box.width }; }));
    metrics.mobileBoxes = boxes;
    check('320px各画布完整处于可见宽度内', boxes.every(box => box.left >= 0 && box.right <= 320 && box.width > 0));
    check('尺寸变化后画布匹配容器', await page.evaluate(() => [...document.querySelectorAll('[role="img"]')].every(element => { const chart = window.charts.getInstanceByDom(element); return !chart || Math.abs(chart.getWidth() - element.clientWidth) <= 1; })));
    await page.screenshot({ path: path.join(output, 'presets-dark-320.png'), fullPage: true });
    await page.goto(`${origin}/preset-check?lifecycle=1`, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.waitForFunction(() => document.querySelectorAll('canvas').length === 1);
    const perf = await option('performance');
    check('千点折线完整数据及自动缩放', perf.series[0].data.length === 1000 && perf.dataZoom.length === 2);
    metrics.fullThousandMs = await page.evaluate(async () => { const chart = window.charts.getInstanceByDom(document.querySelector('[role="img"]')); const start = performance.now(); chart.dispatchAction({ type: 'dataZoom', start: 0, end: 100 }); await new Promise(resolve => requestAnimationFrame(resolve)); return performance.now() - start; });
    check('完整展开1000点绘制小于300ms', metrics.fullThousandMs < 300);
    await page.getByTestId('performance').getByRole('button', { name: '查看数据表' }).click();
    check('千点数据表提供全部十页', (await page.getByTestId('performance').innerText()).includes('共 1000 行'));
    await page.getByRole('button', { name: '下一页' }).click();
    check('分页未截断后续数据', (await page.getByRole('table').innerText()).includes('第101天'));
    await page.getByRole('button', { name: '查看图表' }).click();
    await page.evaluate(() => window.mount(false));
    const observersBefore = await page.evaluate(() => ({ ...window.chartObserverCounts }));
    await page.evaluate(() => window.mount(true));
    const observersMounted = await page.evaluate(() => ({ ...window.chartObserverCounts }));
    check('单张图表建立尺寸与主题两个观察器', observersMounted.ResizeObserver === observersBefore.ResizeObserver + 1 && observersMounted.MutationObserver === observersBefore.MutationObserver + 1);
    await page.evaluate(() => window.mount(false));
    const cdp = await context.newCDPSession(page);
    await cdp.send('HeapProfiler.collectGarbage');
    const before = await cdp.send('Runtime.getHeapUsage');
    const cycles = await page.evaluate(async () => { const durations = []; let disposed = 0; for (let index = 0; index < 20; index++) { durations.push(await window.mount(true)); const instance = window.charts.getInstanceByDom(document.querySelector('[role="img"]')); await window.mount(false); if (instance.isDisposed()) disposed++; } return { durations, disposed }; });
    await cdp.send('HeapProfiler.collectGarbage');
    const after = await cdp.send('Runtime.getHeapUsage');
    metrics.mountMs = cycles.durations;
    metrics.disposedInstances = cycles.disposed;
    metrics.heapDeltaBytes = after.usedSize - before.usedSize;
    check('20次真实前端路由切换全部释放实例及画布', cycles.disposed === 20 && await page.locator('canvas').count() === 0 && new URL(page.url()).pathname === '/chart-empty');
    metrics.observersBefore = observersBefore;
    metrics.observersAfter = await page.evaluate(() => ({ ...window.chartObserverCounts }));
    check('20次卸载后观察器恢复无图基线', JSON.stringify(metrics.observersAfter) === JSON.stringify(observersBefore));
    check('1000点实际挂载绘制小于300ms', Math.max(...cycles.durations) < 300);
    check('20次卸载后堆内存增长小于512KiB测量容差', metrics.heapDeltaBytes < 512 * 1024);
  }
  check('浏览器及外部访问异常为零', errors.length === 0);
  console.log(`A5_CHART_UI_RESULT: checks=${checks.length}; output=${output}; baseline=${process.argv.includes('--baseline')}; business_http=false; metrics=${JSON.stringify(metrics)}`);
} finally {
  await browser?.close();
  await server.close();
  await fs.writeFile(path.join(output, 'results.json'), JSON.stringify({ checks, errors, warnings, metrics }, null, 2));
}
