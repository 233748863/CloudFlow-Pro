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
const output = path.join(root, '.cloudflow-runtime', 'report-ui', randomUUID().replaceAll('-', ''));
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
const state = { userId: '101', tenantId: 100000, queryMode: 'success', marker: '初次结果', writeLoss: false, listFailure: false, dashboardRevoked: false };
const deniedCharts = new Set();
const disabled = new Set();
const permissions = ['system:report:dataset:list', 'system:report:chart:list', 'system:report:chart:save', 'system:report:chart:remove',
  'system:report:dashboard:list', 'system:report:dashboard:save', 'system:report:dashboard:remove', 'system:report:share'];
const dimension = (code, name, type = 'TEXT') => ({ code, name, type, dimension: true, aggregates: [], operators: type === 'TEXT' ? ['EQ', 'NE', 'IN', 'LIKE', 'IS_NULL'] : ['EQ', 'NE', 'GT', 'GE', 'LT', 'LE', 'IN', 'BETWEEN', 'IS_NULL'], unit: null });
const measure = (code, name, aggregates = ['SUM']) => ({ code, name, type: 'NUMBER', dimension: false, aggregates, operators: ['EQ', 'NE', 'GT', 'GE', 'LT', 'LE', 'IN', 'BETWEEN', 'IS_NULL'], unit: '源业务金额' });
const datasets = [
  { datasetId: '1', definition: { code: 'CRM_FUNNEL', name: '销售漏斗', description: '当前商机快照，不换算币种。', timeBased: false, unitPartition: null,
    fields: [dimension('STAGE', '阶段'), dimension('OWNER', '负责人', 'ID'), dimension('DEPARTMENT', '部门', 'ID'), measure('EXPECTED_AMOUNT', '预计金额'), measure('WEIGHTED_AMOUNT', '加权金额'), measure('OPPORTUNITY_COUNT', '商机数', ['COUNT'])] } },
  { datasetId: '2', definition: { code: 'HR_ATTENDANCE', name: '考勤统计', description: '部门为当前部门。', timeBased: true, unitPartition: null,
    fields: [dimension('BUSINESS_DATE', '考勤日期', 'DATE'), dimension('EMPLOYEE', '员工', 'ID'), dimension('DEPARTMENT', '当前部门', 'ID'), dimension('STATUS', '判定状态'),
      measure('RECORD_COUNT', '记录数', ['COUNT']), measure('LATE_MINUTES', '迟到分钟', ['SUM', 'AVG', 'MIN', 'MAX']), measure('EARLY_MINUTES', '早退分钟', ['SUM', 'AVG', 'MIN', 'MAX'])] } },
  { datasetId: '3', definition: { code: 'OA_EXPENSE', name: '费用执行', description: '缺费用日期单独列示，补齐后计入日期统计。', timeBased: true, unitPartition: null,
    fields: [dimension('BUSINESS_DATE', '费用日期', 'DATE'), measure('CLAIM_AMOUNT', '申请金额')] } },
];
const baseQuery = { dimensions: ['STAGE'], measures: [{ field: 'EXPECTED_AMOUNT', aggregate: 'SUM' }], filters: null, sorts: [], limitRows: 500, startDate: null, endDate: null };
const baseStyle = { palette: 'PRIMARY', showLegend: true, showValues: false };
const charts = new Map(Array.from({ length: 6 }, (unused, index) => [String(101 + index), { chartId: String(101 + index), version: 0,
  name: `检查图表${index + 1}`, type: index === 0 ? 'TABLE' : 'BAR', datasetCode: 'CRM_FUNNEL', query: structuredClone(baseQuery), style: baseStyle, ownerId: '101', shareScope: 'PRIVATE' }]));
const dashboards = new Map([['201', { dashboardId: '201', version: 0, name: '并发检查仪表盘', remark: '', ownerId: '101', shareScope: 'PRIVATE',
  items: [...charts.keys()].map((chartId, index) => ({ chartId, gridX: index % 2 * 6, gridY: Math.floor(index / 2) * 10, gridW: 6, gridH: 10 })) }]]);
let nextId = 901;
let pending = [];
let concurrent = 0;
let maximumConcurrent = 0;
let closing = false;
let browser;
let page;
let failure;
const check = (label, condition) => { assert.ok(condition, label); checks.push(label); console.log(`PASS ${label}`); };
const pause = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
const flush = () => { const previous = pending; pending = []; previous.forEach(resolve => resolve()); };
const waitFor = async (condition, label) => { const deadline = Date.now() + 20000; while (!condition() && Date.now() < deadline) await pause(10); assert.ok(condition(), label); };
const visible = record => record && (record.ownerId === state.userId || record.shareScope === 'TENANT');
const chartView = record => ({ ...record, editable: record.ownerId === state.userId, availability: disabled.has(record.datasetCode) ? 'DISABLED' : 'AVAILABLE' });
const dashboardView = record => ({ ...record, editable: record.ownerId === state.userId, items: record.items.map(item => {
  const chart = charts.get(item.chartId); const allowed = !deniedCharts.has(item.chartId) && visible(chart);
  return { ...item, chart: allowed ? chartView(chart) : null, availability: allowed ? disabled.has(chart.datasetCode) ? 'DISABLED' : 'AVAILABLE' : 'NO_DEFINITION_ACCESS' };
}) });
const sample = (code, query, marker) => {
  const dataset = datasets.find(candidate => candidate.definition.code === code).definition;
  const field = name => dataset.fields.find(candidate => candidate.code === name);
  const columns = [...query.dimensions.map((name, index) => ({ key: `dimension${index + 1}`, field: name, title: field(name).name, aggregate: null, unit: null })),
    ...query.measures.map((entry, index) => ({ key: `measure${index + 1}`, field: entry.field, title: field(entry.field).name, aggregate: entry.aggregate, unit: field(entry.field).unit }))];
  const row = { dimension1: query.dimensions.length ? 'LEAD' : null, dimension2: query.dimensions.length > 1 ? '101' : null,
    label1: query.dimensions.length ? marker : null, label2: query.dimensions.length > 1 ? '本人' : null,
    measure1: null, measure2: null, measure3: null, measure4: null, measure5: null };
  query.measures.forEach((entry, index) => { row[`measure${index + 1}`] = entry.aggregate === 'COUNT' ? '2' : '9007199254740993.1201'; });
  if (code === 'OA_EXPENSE') row.measure1 = state.queryMode === 'expense-filled' ? '150.60' : '100.10';
  return { datasetCode: code, columns, rows: state.queryMode === 'empty' ? [] : [row], truncated: state.queryMode === 'truncated', limitRows: query.limitRows,
    startDate: dataset.timeBased ? '2026-07-01' : null, endDate: dataset.timeBased ? '2026-09-28' : null, snapshotDate: '2026-09-28', description: dataset.description,
    missingDates: code === 'OA_EXPENSE' ? { claimCount: state.queryMode === 'expense-filled' ? '0' : '1', claimAmount: state.queryMode === 'expense-filled' ? '0.00' : '50.50', approvedAmount: '0.00', paidAmount: '0.00' } : null };
};

try {
  await fs.mkdir(output, { recursive: true });
  await server.listen();
  const origin = `http://127.0.0.1:${port}`;
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block', reducedMotion: 'reduce' });
  await context.routeWebSocket('**/*', socket => socket.close());
  await context.route('**/*', async route => {
    const request = route.request(); const url = new URL(request.url());
    if (url.origin !== origin) { unexpected.push(url.origin); return route.abort(); }
    if (url.pathname === '/report-ui-check') {
      const entry = `/@fs/${path.join(root, 'scripts/report-checks/ReportUiCheck.tsx').replaceAll('\\', '/')}`;
      return route.fulfill({ contentType: 'text/html', body: `<!doctype html><html lang="zh-CN"><head><meta name="viewport" content="width=device-width,initial-scale=1"><script type="module">import RefreshRuntime from '/@react-refresh';RefreshRuntime.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;window.__vite_plugin_react_preamble_installed__=true;</script></head><body><div id="root"></div><script type="module" src="${entry}"></script></body></html>` });
    }
    if (!url.pathname.startsWith('/api/')) return ['GET', 'HEAD'].includes(request.method()) ? route.continue() : route.abort();
    const respond = async (data, code = 200, msg = '') => {
      try { await route.fulfill({ status: code, contentType: 'application/json', body: JSON.stringify({ code, data, msg }), headers: { 'Cache-Control': 'no-store' } }); }
      catch (error) { if (!closing && !request.failure()) errors.push(String(error)); }
    };
    if (url.pathname === '/api/auth/info') return respond({ user: { userId: state.userId, userName: 'report-check', nickName: '报表检查', deptId: 100, tenantId: state.tenantId }, permissions, roles: ['EMPLOYEE'] });
    const relative = url.pathname.replace('/api/auth/system/report', '');
    const method = request.method();
    const body = method === 'POST' || method === 'PUT' ? request.postDataJSON() : null;
    requests.push({ method, relative, body, identity: state.userId });
    if (method === 'GET' && relative === '/dataset/list') return state.listFailure ? respond(null, 503, '注册来源暂不可用') : respond(datasets.map(dataset => ({ ...dataset, availability: disabled.has(dataset.definition.code) ? 'DISABLED' : 'AVAILABLE', message: dataset.definition.description })));
    if (method === 'GET' && ['/chart/list', '/dashboard/list'].includes(relative)) {
      const definitions = relative === '/chart/list' ? [...charts.values()].filter(visible).map(chartView) : [...dashboards.values()].filter(visible).map(dashboardView);
      return state.listFailure ? respond(null, 503, '定义列表暂不可用') : respond({ rows: definitions, total: definitions.length, pageNum: 1, pageSize: 20 });
    }
    const chartId = relative.match(/^\/chart\/(\d+)$/)?.[1];
    if (method === 'GET' && chartId) return !deniedCharts.has(chartId) && visible(charts.get(chartId)) ? respond(chartView(charts.get(chartId))) : respond(null, 404, '图表不存在或共享已撤回');
    const dashboardId = relative.match(/^\/dashboard\/(\d+)$/)?.[1];
    if (method === 'GET' && dashboardId) return !state.dashboardRevoked && visible(dashboards.get(dashboardId)) ? respond(dashboardView(dashboards.get(dashboardId))) : respond(null, 404, '仪表盘不存在或共享已撤回');
    const code = relative.match(/^\/dataset\/([A-Z_]+)\/query$/)?.[1];
    if (method === 'POST' && code) {
      const selectedMode = state.queryMode; const marker = state.marker;
      const data = sample(code, body, marker);
      concurrent++; maximumConcurrent = Math.max(maximumConcurrent, concurrent);
      try {
        if (selectedMode === 'held') await new Promise(resolve => pending.push(resolve)); else await pause(35);
        if (selectedMode === 'failure') return await respond(null, 503, '统计来源暂不可用');
        if (selectedMode === 'null') return await respond(null);
        if (selectedMode === 'wrong-source') data.datasetCode = 'ANOTHER_SOURCE';
        if (selectedMode === 'missing-columns') data.columns = [];
        if (selectedMode === 'numeric-amount') data.rows[0].measure1 = 9007199254740992;
        if (selectedMode === 'invalid-amount') data.rows[0].measure1 = 'NaN';
        if (selectedMode === 'invalid-row') data.rows[0] = null;
        if (selectedMode === 'missing-summary') data.missingDates = null;
        if (selectedMode === 'numeric-summary') data.missingDates.claimAmount = 50.5;
        if (selectedMode === 'fractional-count') data.missingDates.claimCount = '1.5';
        return await respond(data);
      } finally { concurrent--; }
    }
    if (['POST', 'PUT'].includes(method) && ['/chart', '/dashboard'].includes(relative)) {
      const chart = relative === '/chart'; const identifier = chart ? 'chartId' : 'dashboardId'; const store = chart ? charts : dashboards;
      const id = body[identifier] ?? String(nextId++); const previous = store.get(id);
      store.set(id, { ...body, [identifier]: id, version: previous ? previous.version + 1 : 0, ownerId: state.userId, shareScope: previous?.shareScope ?? 'PRIVATE' });
      return state.writeLoss ? route.abort('connectionfailed') : respond(id);
    }
    if (method === 'POST' && relative === '/share') {
      const record = (body.kind === 'CHART' ? charts : dashboards).get(body.id);
      record.shareScope = body.scope; record.version++;
      return state.writeLoss ? route.abort('connectionfailed') : respond(null);
    }
    if (method === 'DELETE' && (chartId || dashboardId)) { (chartId ? charts : dashboards).delete(chartId ?? dashboardId); return respond(null); }
    unexpected.push(`${method} ${url.pathname}`); return route.abort();
  });
  page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  page.on('requestfailed', request => { if (new URL(request.url()).pathname.startsWith('/api/')) cancelled.push(request.failure()?.errorText); });
  page.setDefaultTimeout(20000);
  page.setDefaultNavigationTimeout(120000);
  const panel = page.getByRole('region', { name: '报表检查页面', exact: true });
  const select = async (label, option) => { await page.locator(`button[aria-label="${label}"][aria-haspopup="listbox"]`).click(); await page.getByRole('option', { name: option, exact: true }).click(); };
  const refresh = () => panel.getByRole('button', { name: '刷新', exact: true }).click();
  const openChart = async name => { await panel.getByRole('button', { name: new RegExp(`^${name}`) }).click(); await panel.getByLabel('图表名称', { exact: true }).waitFor(); };
  const run = async () => { await panel.getByRole('button', { name: '运行查询', exact: true }).click(); await panel.getByRole('button', { name: '查询中…', exact: true }).waitFor({ state: 'hidden' }); };
  const resultPanel = () => panel.getByRole('region', { name: '图表查询结果', exact: true });
  const layout = async (width, label) => {
    await page.setViewportSize({ width, height: 1000 }); await pause(100);
    const geometry = await panel.evaluate(element => ({ viewport: innerWidth, document: document.documentElement.scrollWidth,
      left: element.getBoundingClientRect().left, right: element.getBoundingClientRect().right,
      controls: [...element.querySelectorAll('.report-workspace button,.report-workspace [role="combobox"]')].filter(control => control.getClientRects().length)
        .map(control => ({ label: control.getAttribute('aria-label') ?? control.textContent, width: control.getBoundingClientRect().width, height: control.getBoundingClientRect().height })) }));
    console.log(`REPORT_LAYOUT ${JSON.stringify({ label, width, ...geometry })}`);
    check(`${label}-${width}px页面不横向溢出，操作区至少44×44px`, geometry.document <= geometry.viewport && geometry.left >= 0 && geometry.right <= geometry.viewport + 1 && geometry.controls.every(control => control.height >= 44 && control.width >= 44));
    await panel.screenshot({ path: path.join(output, `${label}-${width}.png`) });
  };

  await page.goto(`${origin}/report-ui-check`, { waitUntil: 'domcontentloaded' });
  await openChart('检查图表1');
  check('列表选中后读取独立定义，初次不自动查询业务数据', requests.some(request => request.relative === '/chart/101') && !requests.some(request => request.relative.endsWith('/query')));
  for (const [type, name] of [['BAR', '柱状图'], ['LINE', '折线图'], ['PIE', '饼图'], ['FUNNEL', '漏斗图'], ['TABLE', '数据表'], ['METRIC', '指标卡']]) {
    await select('图表类型', name);
    if (type !== 'METRIC' && !await panel.getByRole('checkbox', { name: '阶段', exact: true }).isChecked()) await panel.getByRole('checkbox', { name: '阶段', exact: true }).check();
    state.marker = `安全文字-${type}-<img src=x onerror=alert(1)>`; await run();
    check(`${type}实际渲染并保留完整十进制数值`, await resultPanel().locator('.report-data-table').textContent().then(text => text.includes('9007199254740993.1201'))
      && (['TABLE', 'METRIC'].includes(type) || await resultPanel().locator('canvas').count() > 0));
    check(`${type}标签不作为HTML执行`, await resultPanel().locator('img,script,iframe').count() === 0);
  }
  await select('图表类型', '数据表'); await panel.getByRole('checkbox', { name: '阶段', exact: true }).check(); await run();
  for (const width of [1440, 375, 320]) await layout(width, 'chart');
  await page.getByRole('button', { name: '切换检查主题', exact: true }).click(); await layout(375, 'chart-dark');
  check('深色主题与减少动画设置生效', await page.locator('html').evaluate(element => element.classList.contains('dark'))
    && await panel.getByRole('button', { name: '刷新', exact: true }).evaluate(element => getComputedStyle(element).transitionDuration === '0s'));
  await page.getByRole('button', { name: '切换检查主题', exact: true }).click(); await page.setViewportSize({ width: 1440, height: 1000 });

  disabled.add('CRM_FUNNEL'); await refresh(); await panel.getByText('统计来源已停用或您没有源业务读取权限；本页不展示业务数据。', { exact: true }).waitFor();
  check('来源停用清除旧结果并禁用查询', await panel.getByRole('button', { name: '运行查询', exact: true }).isDisabled() && await resultPanel().locator('table').count() === 0);
  await select('统计来源', '考勤统计'); await run();
  check('停用来源仍可切换到获准来源继续查询', requests.at(-1).relative === '/dataset/HR_ATTENDANCE/query');
  disabled.delete('CRM_FUNNEL'); await refresh(); await panel.getByLabel('图表名称', { exact: true }).waitFor();
  state.queryMode = 'failure'; await run(); await resultPanel().getByRole('alert').waitFor();
  check('查询失败清除旧图表且明确显示错误', await resultPanel().locator('table,canvas').count() === 0 && (await resultPanel().innerText()).includes('统计来源暂不可用'));
  for (const mode of ['null', 'wrong-source', 'missing-columns', 'numeric-amount', 'invalid-amount', 'invalid-row']) {
    state.queryMode = mode; await run(); await resultPanel().getByRole('alert').waitFor();
    check(`${mode}成功状态但结果结构异常时明确报错，不伪装为空数据`, await resultPanel().locator('table,canvas').count() === 0
      && (await resultPanel().getByRole('alert').innerText()).includes('统计结果格式异常'));
  }
  state.queryMode = 'empty'; await run(); await resultPanel().getByText('当前权限与筛选范围内暂无数据。', { exact: true }).waitFor();
  check('成功空结果与查询失败明确区分', await resultPanel().getByRole('alert').count() === 0);
  state.queryMode = 'truncated'; await run(); await resultPanel().getByText('结果已截断，图表不代表全部数据。', { exact: true }).waitFor();
  check('结果截断可见提示', (await resultPanel().innerText()).includes('已截断至500行'));
  state.queryMode = 'held'; state.marker = '迟到旧查询'; await panel.getByRole('button', { name: '运行查询', exact: true }).click(); await waitFor(() => pending.length === 1, 'held query arrives');
  check('查询加载时不继续展示旧值', await resultPanel().locator('table,canvas').count() === 0);
  await panel.getByLabel('图表名称', { exact: true }).fill('取消旧查询后的图表');
  state.queryMode = 'success'; state.marker = '当前查询结果'; await run(); flush(); await pause(100);
  check('修改配置取消旧请求，迟到响应不能覆盖新结果', (await resultPanel().innerText()).includes('当前查询结果') && !(await resultPanel().innerText()).includes('迟到旧查询'));
  state.queryMode = 'held'; state.marker = '旧身份数据'; await panel.getByRole('button', { name: '运行查询', exact: true }).click(); await waitFor(() => pending.length === 1, 'identity query held');
  state.userId = '202'; await page.getByRole('button', { name: '刷新检查身份', exact: true }).click(); await page.getByLabel('检查身份', { exact: true }).getByText('202', { exact: true }).waitFor();
  flush(); await panel.getByRole('alert').waitFor();
  check('切换身份销毁旧定义和结果', !(await panel.innerText()).includes('旧身份数据') && await panel.getByRole('region', { name: '图表配置', exact: true }).count() === 0);
  state.userId = '101'; state.queryMode = 'success'; await page.getByRole('button', { name: '刷新检查身份', exact: true }).click(); await panel.getByLabel('图表名称', { exact: true }).waitFor();
  state.queryMode = 'held'; await panel.getByRole('button', { name: '运行查询', exact: true }).click(); await waitFor(() => pending.length === 1, 'unmount query held');
  await page.getByRole('button', { name: '卸载报表', exact: true }).click(); flush(); await pause(100);
  check('页面卸载取消业务请求且不残留图表', (await panel.innerText()).includes('报表已卸载') && await panel.locator('canvas,table').count() === 0);
  state.queryMode = 'success'; await page.getByRole('button', { name: '载入报表', exact: true }).click(); await panel.getByLabel('图表名称', { exact: true }).waitFor();

  await select('统计来源', '费用执行'); await select('图表类型', '数据表'); await run();
  const missingDates = () => resultPanel().getByRole('region', { name: '缺费用日期', exact: true });
  check('费用日期统计与缺日期金额分别显示，互不混入', (await resultPanel().locator('.report-data-table').innerText()).includes('100.10')
    && !(await resultPanel().locator('.report-data-table').innerText()).includes('50.50') && (await missingDates().innerText()).includes('50.50'));
  for (const width of [375, 320]) await layout(width, 'expense-missing-dates');
  state.queryMode = 'empty'; await run(); await resultPanel().getByText('所选日期范围内暂无已补齐费用日期的数据。', { exact: true }).waitFor();
  check('日期结果为空时仍显示缺日期单据，避免误认没有费用', await missingDates().isVisible() && (await missingDates().innerText()).includes('50.50'));
  state.queryMode = 'expense-filled'; await run();
  check('补齐日期后展示新日期金额，缺日期金额归零', (await resultPanel().locator('.report-data-table').innerText()).includes('150.60')
    && !(await missingDates().innerText()).includes('50.50') && (await missingDates().locator('dd').first().innerText()) === '0');
  for (const mode of ['missing-summary', 'numeric-summary', 'fractional-count']) {
    state.queryMode = mode; await run(); await resultPanel().getByRole('alert').waitFor();
    check(`${mode}费用汇总结构无效时拒绝展示任何金额`, await resultPanel().locator('table').count() === 0 && await missingDates().count() === 0);
  }
  state.queryMode = 'success'; await page.setViewportSize({ width: 1440, height: 1000 });

  await panel.getByRole('button', { name: '新建图表', exact: true }).click(); await panel.getByLabel('图表名称', { exact: true }).fill('丢响应检查图表');
  const writesBefore = requests.filter(request => request.relative === '/chart' && request.method === 'POST').length;
  state.writeLoss = true; await panel.getByRole('button', { name: '保存定义', exact: true }).click(); await panel.getByText(/请刷新核对实际状态后再操作/).waitFor();
  check('保存响应丢失后阻止重复保存', await panel.getByRole('button', { name: '保存定义', exact: true }).isDisabled()
    && requests.filter(request => request.relative === '/chart' && request.method === 'POST').length === writesBefore + 1);
  state.writeLoss = false; await refresh(); await panel.getByRole('button', { name: /^丢响应检查图表/ }).waitFor();
  check('刷新放弃状态不明新草稿并展示实际已保存定义', await panel.getByLabel('图表名称', { exact: true }).count() === 0);
  await openChart('检查图表1'); await panel.getByRole('button', { name: '共享范围', exact: true }).click();
  await select('共享范围', '本企业'); await page.getByRole('button', { name: '确认范围', exact: true }).click();
  await waitFor(() => charts.get('101').shareScope === 'TENANT', 'sharing saved'); await panel.getByLabel('图表名称', { exact: true }).waitFor();
  check('共享仅提交定义编号、版本和范围', requests.some(request => request.relative === '/share' && request.body.scope === 'TENANT' && Object.keys(request.body).sort().join(',') === 'id,kind,scope,version'));
  state.userId = '202'; await page.getByRole('button', { name: '刷新检查身份', exact: true }).click(); await panel.getByText('查看共享图表', { exact: true }).waitFor();
  check('共享查看者无原定义保存删除共享按钮', await panel.getByRole('button', { name: '保存定义', exact: true }).count() === 0
    && await panel.getByRole('button', { name: '删除定义', exact: true }).count() === 0 && await panel.getByLabel('图表名称', { exact: true }).isDisabled());
  deniedCharts.add('101'); await refresh(); await panel.getByRole('alert').waitFor();
  check('共享撤回重新打开时清除配置', await panel.getByRole('region', { name: '图表配置', exact: true }).count() === 0);
  deniedCharts.clear(); state.userId = '101'; await page.getByRole('button', { name: '刷新检查身份', exact: true }).click();
  await panel.getByLabel('图表名称', { exact: true }).waitFor();
  await select('统计来源', '考勤统计');
  await panel.getByRole('checkbox', { name: '员工', exact: true }).check();
  check('达到两维后其余未选维度禁用', await panel.getByRole('checkbox', { name: '当前部门', exact: true }).isDisabled());
  for (let index = 0; index < 4; index++) await panel.getByRole('button', { name: '添加度量', exact: true }).click();
  check('达到五度量后禁止继续添加', await panel.locator('button[aria-label^="度量"]').count() === 5 && await panel.getByRole('button', { name: '添加度量', exact: true }).isDisabled());
  await panel.getByRole('button', { name: '添加条件', exact: true }).click();
  await select('筛选字段', '迟到分钟'); await select('筛选操作', '介于范围');
  await panel.getByLabel('下界', { exact: true }).fill('0.0001'); await panel.getByLabel('上界', { exact: true }).fill('9007199254740993.1201');
  state.queryMode = 'success'; await run();
  check('数字范围保留原十进制文本，不经浮点转换', requests.at(-1).body.filters.conditions[0].values.join(',') === '0.0001,9007199254740993.1201');
  await select('筛选操作', '未填写'); await run();
  check('未填写条件移除输入并提交空值数组', await panel.getByLabel('下界', { exact: true }).count() === 0 && requests.at(-1).body.filters.conditions[0].values.length === 0);
  await select('筛选操作', '属于列表'); await panel.getByLabel('列表值，每行一个，最多100个', { exact: true }).fill('1\n2\n3'); await run();
  check('列表筛选逐行提交，保留三个独立文本值', JSON.stringify(requests.at(-1).body.filters.conditions[0].values) === '["1","2","3"]');
  await panel.getByRole('button', { name: '添加条件子组', exact: true }).click();
  const rootFilters = panel.locator('.report-filter-group').first(); const childFilters = rootFilters.locator('.report-filter-group');
  check('子组不能创建第三层筛选', await childFilters.getByRole('button', { name: '添加条件子组', exact: true }).count() === 0);
  for (let index = 2; index < 20; index++) await rootFilters.getByRole('button', { name: '添加条件', exact: true }).first().click();
  check('达到20条件后根组和子组全部停止添加', await panel.getByRole('button', { name: '移除此条件', exact: true }).count() === 20
    && await panel.getByRole('button', { name: '添加条件', exact: true }).evaluateAll(buttons => buttons.every(button => button.disabled))
    && await panel.getByRole('button', { name: '添加条件子组', exact: true }).isDisabled());

  await page.getByRole('link', { name: '检查仪表盘', exact: true }).click();
  await panel.getByRole('button', { name: '新建仪表盘', exact: true }).click(); await panel.getByLabel('仪表盘名称', { exact: true }).fill('新建布局检查');
  for (const name of ['检查图表1', '检查图表2']) {
    await panel.getByRole('button', { name: /^添加图表（/ }).click(); await page.getByRole('button', { name: '待添加图表', exact: true }).waitFor();
    await select('待添加图表', name); await page.getByRole('button', { name: '加入仪表盘', exact: true }).click();
  }
  const firstCard = () => panel.getByRole('article', { name: '检查图表1', exact: true });
  await firstCard().getByLabel('检查图表1列坐标', { exact: true }).fill('6');
  check('重叠布局在页面阻止并说明原因', await firstCard().getByLabel('检查图表1列坐标', { exact: true }).inputValue() === '0' && (await panel.innerText()).includes('图表不能重叠'));
  const handle = firstCard().getByRole('button', { name: '移动图表 检查图表1', exact: true });
  const pickUpAndMove = async () => {
    await handle.focus(); await page.keyboard.press('Space');
    await page.waitForFunction(() => document.querySelector('button[aria-label="移动图表 检查图表1"]')?.getAttribute('aria-pressed') === 'true');
    await page.keyboard.press('ArrowDown');
    await page.waitForFunction(() => {
      const card = document.querySelector('article[aria-label="检查图表1"]');
      return card && new DOMMatrixReadOnly(getComputedStyle(card).transform).m42 === 60;
    });
    console.log('REPORT_KEYBOARD_PROGRESS: picked_up=true; rendered_delta_y=60; save_not_sent=true');
  };
  await pickUpAndMove(); await page.keyboard.press('Space');
  await page.waitForFunction(() => document.querySelector('input[aria-label="检查图表1行坐标"]')?.value === '1');
  check('键盘空格拾起方向键移动并保存整数坐标', await firstCard().getByLabel('检查图表1行坐标', { exact: true }).inputValue() === '1');
  await pickUpAndMove(); await page.keyboard.press('Escape');
  check('键盘取消不修改已保存坐标', await firstCard().getByLabel('检查图表1行坐标', { exact: true }).inputValue() === '1');
  await handle.scrollIntoViewIfNeeded(); const handleBox = await handle.boundingBox();
  await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2); await page.mouse.down();
  await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2 + 60, { steps: 8 }); await page.mouse.up();
  await page.waitForFunction(() => document.querySelector('input[aria-label="检查图表1行坐标"]')?.value === '2');
  check('真实鼠标拖动按60像素网格移动一行', await firstCard().getByLabel('检查图表1行坐标', { exact: true }).inputValue() === '2');
  await firstCard().getByLabel('检查图表1行坐标', { exact: true }).fill('1');
  await firstCard().getByLabel('检查图表1宽度', { exact: true }).fill('13');
  check('超出十二列的宽度在页面拒绝', await firstCard().getByLabel('检查图表1宽度', { exact: true }).inputValue() === '6');
  for (const width of [1440, 375, 320]) await layout(width, 'dashboard');
  check('手机单列禁用拖动但保留电脑版数字坐标', await handle.isDisabled() && await firstCard().getByLabel('检查图表1行坐标', { exact: true }).inputValue() === '1');
  await panel.getByRole('button', { name: '保存布局', exact: true }).click(); await panel.getByText('编辑本人仪表盘', { exact: true }).waitFor();
  check('布局保存后重读定义且保留坐标', requests.some(request => request.relative === '/dashboard' && request.method === 'POST' && request.body.items[0].gridY === 1));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await panel.getByRole('button', { name: /^并发检查仪表盘/ }).click(); await panel.getByLabel('仪表盘名称', { exact: true }).waitFor();
  maximumConcurrent = 0; state.queryMode = 'held'; await panel.getByRole('button', { name: '查询全部', exact: true }).click(); await waitFor(() => pending.length === 3, 'three dashboard workers started');
  check('仪表盘并发业务查询最多三项', maximumConcurrent === 3);
  state.queryMode = 'success'; flush(); await panel.getByRole('button', { name: '查询中…', exact: true }).waitFor({ state: 'hidden' });
  check('六张图表逐一读取定义和本人数据', await panel.locator('.report-grid-card table').count() === 6 && maximumConcurrent === 3);
  state.queryMode = 'null'; await panel.getByRole('button', { name: '查询全部', exact: true }).click(); await panel.getByRole('button', { name: '查询中…', exact: true }).waitFor({ state: 'hidden' });
  check('仪表盘各图异常响应独立显示错误并清除旧值', await panel.locator('.report-grid-card table').count() === 0 && await panel.getByText('统计结果格式异常，请重新查询或联系管理员核对。', { exact: true }).count() === 6);
  state.queryMode = 'held'; state.marker = '仪表盘旧身份数据'; await panel.getByRole('button', { name: '查询全部', exact: true }).click(); await waitFor(() => pending.length === 3, 'dashboard identity requests held');
  state.userId = '202'; await page.getByRole('button', { name: '刷新检查身份', exact: true }).click(); await page.getByLabel('检查身份', { exact: true }).getByText('202', { exact: true }).waitFor();
  flush(); await panel.getByRole('alert').waitFor();
  check('仪表盘切换身份时销毁全部旧卡片并取消在途查询', await panel.locator('.report-grid-card').count() === 0 && !(await panel.innerText()).includes('仪表盘旧身份数据'));
  state.userId = '101'; state.queryMode = 'success'; await page.getByRole('button', { name: '刷新检查身份', exact: true }).click(); await panel.getByLabel('仪表盘名称', { exact: true }).waitFor();
  await panel.getByLabel('仪表盘名称', { exact: true }).fill('丢响应后的仪表盘');
  const dashboardWritesBefore = requests.filter(request => request.relative === '/dashboard' && request.method === 'PUT').length;
  state.writeLoss = true; await panel.getByRole('button', { name: '保存布局', exact: true }).click(); await panel.getByText(/请刷新核对实际状态后再操作/).waitFor();
  check('仪表盘保存丢响应后禁止重复保存', await panel.getByRole('button', { name: '保存布局', exact: true }).isDisabled()
    && requests.filter(request => request.relative === '/dashboard' && request.method === 'PUT').length === dashboardWritesBefore + 1);
  state.writeLoss = false; await refresh(); await panel.getByText('编辑本人仪表盘', { exact: true }).waitFor();
  check('仪表盘刷新读取真实已保存版本后恢复操作', await panel.getByLabel('仪表盘名称', { exact: true }).inputValue() === '丢响应后的仪表盘' && await panel.getByRole('button', { name: '保存布局', exact: true }).isEnabled());
  deniedCharts.add('102'); await panel.getByRole('button', { name: '查询全部', exact: true }).click(); await panel.getByRole('button', { name: '查询中…', exact: true }).waitFor({ state: 'hidden' });
  check('单图共享撤回只阻止该图，其余五图继续显示', await panel.locator('.report-grid-card table').count() === 5 && (await panel.innerText()).includes('图表不存在或共享已撤回'));
  state.dashboardRevoked = true; await panel.getByRole('button', { name: '查询全部', exact: true }).click(); await panel.getByRole('alert').waitFor();
  check('仪表盘整体撤回先核验并清除全部旧图', await panel.locator('.report-grid-card').count() === 0);
  check('客户端取消请求已有实际浏览器记录', cancelled.some(value => value?.includes('ERR_ABORTED')));
  check('页面脚本无未处理异常及外部请求', errors.length === 0 && unexpected.length === 0);
} catch (error) {
  failure = error; process.exitCode = 1; console.error(error.stack || String(error));
  if (page && !page.isClosed()) { await fs.writeFile(path.join(output, 'failure.txt'), await page.locator('body').innerText(), 'utf8'); await page.screenshot({ path: path.join(output, 'failure.png'), fullPage: true }); }
} finally {
  closing = true; flush(); await browser?.close(); await server.close();
  await fs.writeFile(path.join(output, 'results.json'), JSON.stringify({ checks, errors, unexpected, cancelled, requests, failure: failure?.message,
    scope: '真实React页面与浏览器，接口及身份为明确测试替身；不替代真实后端金额、权限、共享或数据库验收。' }, null, 2));
  console.log(`REPORT_UI_CHECKS: assertions=${checks.length}; failed=${failure ? 1 : 0}; real_browser=true; interface_double=true; mysql=false; production_modified=false; output=${output}`);
}
