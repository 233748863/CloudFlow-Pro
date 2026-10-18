import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build, preview } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const frontend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(path.dirname(frontend), '.cloudflow-runtime', 'a2-message-record-browser-' + Date.now());
const modulePath = process.env.CLOUDFLOW_PLAYWRIGHT_MODULE;
const executablePath = process.env.CLOUDFLOW_CHROMIUM_EXECUTABLE;
assert.ok(modulePath && existsSync(modulePath), 'Installed browser module is required');
assert.ok(!executablePath || existsSync(executablePath), 'Browser executable must exist');
const { chromium } = await import(pathToFileURL(modulePath).href);
const sourceFiles = ['src/pages/system/message/Record.tsx', 'src/pages/system/message/DeliveryDetail.tsx',
  'src/pages/system/message/options.ts', 'src/services/api/message.ts', 'src/context/AuthContext.tsx',
  'src/components/common/PermissionGuard.tsx', 'src/components/common/WarningConfirmDialog.tsx',
  'src/pages/system/_components/InfrastructurePrimitives.tsx', 'src/pages/system/_components/useInfrastructurePage.ts',
  'src/components/common/Pagination.tsx', 'src/components/common/table.tsx',
  'src/components/common/BaseDialog.tsx', 'src/components/common/ModalOverlay.tsx',
  'src/components/mobile/MobileListCard.tsx', 'src/hooks/useBreakpoint.ts',
  'src/index.css', 'src/styles/unity2-refresh.css',
  'src/styles/mobile-foundation.css', 'scripts/message-record-browser/fixture.tsx',
  'scripts/message-record-browser/index.html', 'scripts/check-message-record-browser.mjs'];
const hashFile = file => createHash('sha256').update(readFileSync(path.join(frontend, file))).digest('hex');
const sourceHashes = Object.fromEntries(sourceFiles.map(file => [file, hashFile(file)]));
const fullPermissions = ['system:message:record:list', 'system:message:record:resend'];
const initialRecords = Array.from({ length: 15 }, (_, index) => ({
  recordId: 101 + index, traceId: 'trace-' + String(index).padStart(4, '0'),
  title: index === 0 ? '工资结果提醒' : index === 1 ? '外部接纳待核验' : '历史发送记录' + (index + 1),
  content: index === 0 ? '请核对工资月份、实际发放金额与审批结果。'.repeat(9) + '<script>window.fixtureExecuted=true</script>' : '验收正文' + index,
  templateCode: index === 0 ? 'PAYROLL_NOTICE' : 'BIZ_NOTICE',
  channelType: index < 2 ? 'EMAIL' : 'INTERNAL', receiverId: index === 0 ? 702 : 703,
  receiverName: index === 0 ? '验收接收人' : '其他接收人', messageCategory: index === 0 ? 'BIZ_REMINDER' : 'SYSTEM',
  bizType: index === 0 ? 'PAYROLL' : 'SECURITY', bizId: 'business-' + index,
  sendStatus: index === 0 || index === 3 ? 'FAILED' : index === 1 ? 'UNKNOWN' : 'SUCCESS',
  errorMsg: index === 0 ? 'CHANNEL_UNAVAILABLE_' + 'x'.repeat(120) : undefined,
  readFlag: 0, retryCount: 0, resendFromId: index === 0 ? 81 : undefined,
  createTime: (index < 4 ? '2026-10-17' : '2026-10-16') + ' 09:' + String(59 - index).padStart(2, '0') + ':00',
  ...(index === 1 ? { deliveryId: 901 } : {}),
}));
const checks = [], errors = [], requests = [], rendering = [];
const check = (condition, label) => { assert.ok(condition, label); checks.push(label); console.log('PASS ' + label); };
const config = { configFile: false, root: frontend, logLevel: 'warn', plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': path.join(frontend, 'src') } },
  build: { outDir: path.join(output, 'dist'), emptyOutDir: false,
    rollupOptions: { input: path.join(frontend, 'scripts/message-record-browser/index.html') } } };
let browser, server, failure = null;
mkdirSync(output);
console.log('MESSAGE_RECORD_BROWSER_RUN=' + output);
const recordPath = '/api/auth/system/message/record/';
const posts = name => requests.filter(row => row.scenario === name && row.method === 'POST');
const listRequests = name => requests.filter(row => row.scenario === name && row.path === recordPath + 'list');
const statisticRequests = name => requests.filter(row => row.scenario === name && row.path === recordPath + 'statistics');
function rowsInRange(state, params) {
  return state.records.filter(row => (!params.get('beginTime') || row.createTime.slice(0, 10) >= params.get('beginTime'))
    && (!params.get('endTime') || row.createTime.slice(0, 10) <= params.get('endTime')));
}
function statistics(rows) {
  const count = status => rows.filter(row => row.sendStatus === status).length;
  const rates = key => Object.fromEntries([...new Set(rows.map(row => row[key]))].map(value => {
    const group = rows.filter(row => row[key] === value);
    return [value, group.filter(row => row.sendStatus === 'SUCCESS').length / group.length];
  }));
  return { total: rows.length, success: count('SUCCESS'), failed: count('FAILED'), unknown: count('UNKNOWN'),
    successRate: rows.length ? count('SUCCESS') / rows.length : 0,
    channelSuccessRates: rates('channelType'), templateSuccessRates: rates('templateCode'),
    topFailureReasons: rows.some(row => row.sendStatus === 'FAILED') ? [{ reason: 'CHANNEL_UNAVAILABLE_' + 'x'.repeat(120), count: count('FAILED') }] : [] };
}
async function openFixture(name, width, height, options = {}) {
  const context = await browser.newContext({ viewport: { width, height } });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  const state = { records: structuredClone(initialRecords), permissions: [...fullPermissions],
    rejectList: false, rejectStatistics: false, nullStatistics: false, rejectResend: false, resendGate: null, ...options };
  page.on('pageerror', error => errors.push(name + ': ' + error.message));
  await page.route('**/api/**', async route => {
    const request = route.request(), url = new URL(request.url()), pathname = url.pathname, method = request.method();
    const entry = { scenario: name, method, path: pathname, query: Object.fromEntries(url.searchParams) };
    requests.push(entry);
    let data;
    const reject = msg => route.fulfill({ json: { code: 500, msg } });
    if (pathname === '/api/auth/info' && method === 'GET') {
      data = { user: { userId: 702, userName: 'record-browser-check', tenantId: 1 }, permissions: state.permissions, roles: ['user'] };
    } else if (pathname === recordPath + 'list' && method === 'GET') {
      if (state.rejectList) return reject('验收模拟记录加载失败');
      const params = url.searchParams;
      const rows = rowsInRange(state, params).filter(row => (!params.get('channelType') || row.channelType === params.get('channelType'))
        && (!params.get('sendStatus') || row.sendStatus === params.get('sendStatus'))
        && (!params.get('templateCode') || row.templateCode.includes(params.get('templateCode')))
        && (!params.get('bizType') || row.bizType === params.get('bizType'))
        && (!params.get('receiverId') || row.receiverId === Number(params.get('receiverId'))));
      const pageNum = Number(params.get('pageNum') || 1), pageSize = Number(params.get('pageSize') || 10);
      data = { rows: rows.slice((pageNum - 1) * pageSize, pageNum * pageSize), total: rows.length, pageNum, pageSize };
    } else if (pathname === recordPath + 'statistics' && method === 'GET') {
      if (state.rejectStatistics) return reject('验收模拟统计加载失败');
      data = state.nullStatistics ? null : statistics(rowsInRange(state, url.searchParams));
    } else if (pathname.startsWith(recordPath) && pathname.endsWith('/resend') && method === 'POST') {
      assert.ok(state.permissions.includes('system:message:record:resend'), name + ': no unauthorized resend');
      const ids = pathname.slice(recordPath.length, -'/resend'.length).split(',').map(Number);
      assert.ok(ids.length && new Set(ids).size === ids.length && ids.every(id => state.records.some(row => row.recordId === id && row.sendStatus === 'FAILED')),
        name + ': only unique failed record ids are submitted');
      if (state.resendGate) await state.resendGate;
      if (state.rejectResend) return reject('验收模拟重发失败');
      for (const id of ids) {
        const original = state.records.find(row => row.recordId === id);
        state.records.unshift({ ...original, recordId: 1000 + state.records.length, sendStatus: 'PENDING', resendFromId: id });
      }
      data = { requested: ids.length, accepted: ids.length };
    } else if (pathname === '/api/auth/system/message/delivery/901' && method === 'GET') {
      data = { deliveryId: 901, recordId: 102, channelType: 'EMAIL', status: 'UNKNOWN', attemptCount: 1, version: 2 };
    } else {
      errors.push(name + ': unexpected ' + method + ' ' + pathname);
      return route.fulfill({ status: 500, json: { code: 500, msg: 'Unexpected fixture request' } });
    }
    await route.fulfill({ json: { code: 200, msg: 'success', data } });
  });
  const address = server.httpServer.address();
  await page.goto('http://127.0.0.1:' + address.port + '/scripts/message-record-browser/index.html');
  await page.getByTestId('record-fixture-ready').waitFor();
  return { page, context, state, name };
}
async function ready(page) { await page.getByRole('cell', { name: '工资结果提醒', exact: false }).first().waitFor(); }
const row = (page, title) => page.locator('tbody tr').filter({ hasText: title });
async function select(page, index, label) {
  await page.locator('form button[aria-haspopup="listbox"]').nth(index).click();
  await page.getByRole('option', { name: label, exact: true }).click();
}
async function listAction(page, action) {
  await Promise.all([page.waitForResponse(res => res.url().includes(recordPath + 'list')), action()]);
  await page.getByText('正在加载记录', { exact: true }).waitFor({ state: 'hidden' });
}
async function refresh(page) {
  await Promise.all([page.waitForResponse(res => res.url().includes(recordPath + 'statistics')),
    listAction(page, () => page.getByRole('button', { name: '刷新', exact: true }).click())]);
}
async function confirmResend(page, action) {
  await action();
  const dialog = page.getByRole('dialog', { name: '确认重发失败消息' });
  await dialog.waitFor();
  const response = page.waitForResponse(res => res.request().method() === 'POST' && res.url().endsWith('/resend'));
  await dialog.getByRole('button', { name: '确认', exact: true }).click();
  await response; await dialog.waitFor({ state: 'hidden' });
  await page.getByRole('button', { name: /^重发所选/ }).waitFor({ state: 'visible' });
}
async function screenshot(page, name, fullPage = false) {
  await page.screenshot({ path: path.join(output, name + '.jpg'), type: 'jpeg', fullPage });
}
async function unobstructed(locator) {
  await locator.scrollIntoViewIfNeeded();
  await locator.page().waitForFunction(element => {
    const box = element.getBoundingClientRect();
    const target = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
    return box.left >= 0 && box.right <= innerWidth + 1 && box.top >= 0 && box.bottom <= innerHeight + 1
      && (target === element || element.contains(target));
  }, await locator.elementHandle());
}

try {
  await build(config);
  server = await preview({ ...config, preview: { host: '127.0.0.1', port: 0, strictPort: false, open: false } });
  browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
  for (const [name, width, height] of [['desktop', 1440, 1000], ['mobile', 390, 844]]) {
    const main = await openFixture(name, width, height);
    const { page, state } = main;
    await ready(page);
    check(await page.locator('tbody tr').count() === 10, name + ': first page contains ten records');
    check(await page.getByRole('checkbox', { name: '选择消息 101', exact: true }).isEnabled()
      && await page.getByRole('checkbox', { name: '选择消息 102', exact: true }).isDisabled(), name + ': failed selectable and unknown disabled');
    check(await row(page, '外部接纳待核验').getByRole('button', { name: '重新发送', exact: true }).count() === 0,
      name + ': unknown delivery has no resend action');
    await page.getByText('各渠道成功率', { exact: true }).click();
    await page.getByText('各模板成功率', { exact: true }).click();
    await page.getByText('主要失败原因', { exact: true }).click();
    check(await page.locator('details').nth(0).getByText('0.0%', { exact: true }).count() === 1
      && await page.locator('details').nth(1).getByText('PAYROLL_NOTICE', { exact: true }).count() === 1,
      name + ': channel and template success rates show returned data');
    check(await page.getByText('统计按所选日期汇总全部渠道与模板，不受其余列表筛选影响。', { exact: true }).count() === 1,
      name + ': statistics scope is explicit');
    const painted = await page.locator('form input').evaluateAll(nodes => nodes.map(node => ({
      type: node.type, height: node.getBoundingClientRect().height, border: getComputedStyle(node).borderTopWidth,
      background: getComputedStyle(node).backgroundColor })));
    rendering.push({ name, painted });
    check(painted.length === 5 && painted.every(input => input.height === 42
      && Number.parseFloat(input.border) > 0 && input.background !== 'rgba(0, 0, 0, 0)'), name + ': all five filter inputs are painted at formal dimensions');
    check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), name + ': viewport has no horizontal overflow');
    await screenshot(page, name + '-records', name === 'desktop');
    if (name === 'mobile') {
      const firstRow = row(page, '工资结果提醒');
      check(await page.locator('table.cf-mobile-table tbody tr').count() === 10, name + ': records use shared mobile cards');
      const labels = await firstRow.locator('td').evaluateAll(cells => cells.map(cell => cell.dataset.cfMobileLabel));
      check(JSON.stringify(labels) === JSON.stringify(['选择', '消息 / 模板', '接收方', '渠道 / 分类', '投递结果', '创建时间', '操作']),
        name + ': each mobile field has the matching header label');
      await unobstructed(firstRow.getByRole('button', { name: '查看详情', exact: true }));
      await unobstructed(firstRow.getByRole('button', { name: '重新发送', exact: true }));
      check(await firstRow.evaluate(element => { const b = element.getBoundingClientRect(); return b.left >= 0 && b.right <= innerWidth + 1 && element.scrollWidth <= element.clientWidth; }),
        name + ': card fields and both actions fit without horizontal scrolling');
      await firstRow.scrollIntoViewIfNeeded();
      await screenshot(page, name + '-list-card');
    }
    await row(page, '工资结果提醒').getByRole('button', { name: '查看详情', exact: true }).click();
    const detail = page.getByRole('dialog', { name: '发送记录详情' });
    await detail.waitFor();
    check((await detail.innerText()).includes('81') && (await detail.innerText()).includes('重试次数'), name + ': detail includes source id and zero retry count');
    check(await detail.locator('script').count() === 0 && await page.evaluate(() => window.fixtureExecuted !== true), name + ': message markup is rendered as text');
    check(await detail.evaluate(element => {
      const box = element.getBoundingClientRect(); return box.left >= 0 && box.right <= innerWidth + 1;
    }), name + ': detail fits viewport');
    await screenshot(page, name + '-detail');
    await detail.getByText('发送时间', { exact: true }).scrollIntoViewIfNeeded();
    check(await detail.getByText('重试次数', { exact: true }).isVisible()
      && await detail.getByText('来源记录', { exact: true }).isVisible(), name + ': lower delivery fields are reachable by scrolling');
    if (name === 'mobile') await screenshot(page, name + '-delivery-fields');
    await detail.getByRole('button', { name: '关闭弹窗', exact: true }).click();
    await listAction(page, () => page.getByRole('button', { name: '下一页', exact: true }).filter({ visible: true }).click());
    check(await page.getByRole('checkbox', { name: '选择消息 111', exact: true }).count() === 1, name + ': pagination requests second page');
    await listAction(page, () => page.getByRole('button', { name: '上一页', exact: true }).filter({ visible: true }).click());
    await page.getByRole('checkbox', { name: '选择消息 101', exact: true }).check();
    const beforeStats = statisticRequests(name).length;
    await listAction(page, () => select(page, 0, '邮件'));
    check(await page.getByRole('button', { name: '重发所选（0）', exact: true }).isDisabled(), name + ': changing query clears selection');
    await listAction(page, () => select(page, 1, '发送失败'));
    await page.getByLabel('模板编码', { exact: true }).fill('PAYROLL');
    await page.getByLabel('业务类型', { exact: true }).fill('PAYROLL');
    await page.getByLabel('接收人编号', { exact: true }).fill('702');
    await page.getByLabel('开始日期', { exact: true }).fill('2026-10-17');
    await page.getByLabel('结束日期', { exact: true }).fill('2026-10-17');
    const statsFiltered = page.waitForResponse(res => res.url().includes(recordPath + 'statistics') && new URL(res.url()).searchParams.get('beginTime') === '2026-10-17');
    await listAction(page, () => page.getByRole('button', { name: '查询记录', exact: true }).click());
    await statsFiltered;
    const query = listRequests(name).at(-1).query;
    check(query.channelType === 'EMAIL' && query.sendStatus === 'FAILED' && query.templateCode === 'PAYROLL'
      && query.bizType === 'PAYROLL' && query.receiverId === '702' && query.beginTime === '2026-10-17' && query.endTime === '2026-10-17'
      && query.pageNum === '1', name + ': all seven filters are sent with first-page reset');
    check(await page.locator('tbody tr').count() === 1 && statisticRequests(name).length === beforeStats + 1
      && Object.keys(statisticRequests(name).at(-1).query).every(key => ['beginTime', 'endTime'].includes(key)), name + ': list filters and date-only statistics remain distinct');
    await page.getByLabel('开始日期', { exact: true }).fill('2026-10-18');
    const beforeInvalid = listRequests(name).length;
    await page.getByRole('button', { name: '查询记录', exact: true }).click();
    await page.getByText('开始日期不能晚于结束日期', { exact: true }).first().waitFor();
    check(listRequests(name).length === beforeInvalid, name + ': reversed dates send no list request');
    await page.getByLabel('开始日期', { exact: true }).fill('2026-10-17');
    await confirmResend(page, () => row(page, '工资结果提醒').getByRole('button', { name: '重新发送', exact: true }).click());
    await page.getByText('已受理 1 条重发请求，共选择 1 条', { exact: true }).first().waitFor();
    check(posts(name).length === 1 && state.records.find(record => record.recordId === 101).sendStatus === 'FAILED'
      && state.records.some(record => record.resendFromId === 101 && record.sendStatus === 'PENDING'), name + ': single resend submits once and preserves original fixture record');
    await listAction(page, () => select(page, 0, '全部渠道'));
    await listAction(page, () => select(page, 1, '全部状态'));
    for (const label of ['模板编码', '业务类型', '接收人编号', '开始日期', '结束日期']) await page.getByLabel(label, { exact: true }).fill('');
    await listAction(page, () => page.getByRole('button', { name: '查询记录', exact: true }).click());
    await page.getByRole('checkbox', { name: '选择本页全部失败记录', exact: true }).check();
    check(await page.getByRole('button', { name: '重发所选（2）', exact: true }).isEnabled(), name + ': select-all includes only two failed records');
    await page.getByRole('button', { name: '重发所选（2）', exact: true }).click();
    const confirmation = page.getByRole('dialog', { name: '确认重发失败消息' });
    await unobstructed(confirmation.getByRole('button', { name: '取消', exact: true }));
    await unobstructed(confirmation.getByRole('button', { name: '确认', exact: true }));
    check(true, name + ': confirmation actions remain reachable after the prior success notification');
    await screenshot(page, name + '-resend');
    await confirmation.getByRole('button', { name: '取消', exact: true }).click();
    check(posts(name).length === 1, name + ': cancelling confirmation sends no request');
    let release;
    state.resendGate = new Promise(resolve => { release = resolve; });
    await page.getByRole('button', { name: '重发所选（2）', exact: true }).click();
    const started = page.waitForRequest(request => request.method() === 'POST' && request.url().endsWith('/resend'));
    await confirmation.getByRole('button', { name: '确认', exact: true }).evaluate(button => { button.click(); button.click(); });
    await started;
    await page.waitForFunction(() => [...document.querySelectorAll('button')].some(button => button.textContent.trim() === '刷新' && button.disabled));
    const pending = {
      resendDisabled: await page.getByRole('button', { name: '重发所选（2）', exact: true }).isDisabled(),
      refreshDisabled: await page.getByRole('button', { name: '刷新', exact: true }).isDisabled(), posts: posts(name).length };
    check(pending.posts === 2 && pending.resendDisabled && pending.refreshDisabled,
      name + ': double confirmation produces one request and pending actions are locked ' + JSON.stringify(pending));
    const complete = page.waitForResponse(res => res.request().method() === 'POST' && res.url().endsWith('/resend'));
    release(); state.resendGate = null; await complete;
    await page.getByText('已受理 2 条重发请求，共选择 2 条', { exact: true }).first().waitFor();
    await page.getByRole('button', { name: '重发所选（0）', exact: true }).waitFor();
    check(posts(name).at(-1).path.endsWith('/101,104/resend') && state.records.filter(record => record.sendStatus === 'PENDING').length === 3,
      name + ': batch submits unique failed ids and creates three total fixture replacements');
    state.rejectResend = true;
    await confirmResend(page, () => row(page, '工资结果提醒').filter({ has: page.getByRole('button', { name: '重新发送', exact: true }) }).getByRole('button', { name: '重新发送', exact: true }).click());
    await page.getByText('验收模拟重发失败', { exact: true }).first().waitFor();
    state.rejectResend = false;
    check(state.records.filter(record => record.sendStatus === 'PENDING').length === 3, name + ': failed resend does not mutate stored fixture records');
    await confirmResend(page, () => row(page, '工资结果提醒').filter({ has: page.getByRole('button', { name: '重新发送', exact: true }) }).getByRole('button', { name: '重新发送', exact: true }).click());
    check(posts(name).length === 4, name + ': failed resend can be retried');
    await main.context.close();

    const readonly = await openFixture(name + '-readonly', width, height, { permissions: ['system:message:record:list'] });
    await ready(readonly.page);
    check(await readonly.page.getByRole('checkbox').count() === 0 && await readonly.page.getByRole('button', { name: /^重发所选|^重新发送$/ }).count() === 0,
      name + ': read-only user has no selection or resend controls');
    await row(readonly.page, '外部接纳待核验').getByRole('button', { name: '查看详情', exact: true }).click();
    await readonly.page.getByText('实际状态', { exact: true }).waitFor();
    check(await readonly.page.getByRole('button', { name: '确认并保存核验结论', exact: true }).count() === 0,
      name + ': read-only external detail excludes resolution writes');
    check(posts(readonly.name).length === 0, name + ': read-only scenario makes no writes');
    await readonly.context.close();

    const revoked = await openFixture(name + '-revoked', width, height);
    await ready(revoked.page);
    await row(revoked.page, '工资结果提醒').getByRole('button', { name: '重新发送', exact: true }).click();
    revoked.state.permissions = ['system:message:record:list'];
    const auth = revoked.page.waitForResponse(res => res.url().endsWith('/api/auth/info'));
    await revoked.page.getByRole('button', { name: '刷新验收权限', exact: true }).evaluate(button => button.click());
    await auth;
    await revoked.page.getByRole('checkbox').first().waitFor({ state: 'detached' });
    await revoked.page.getByRole('dialog', { name: '确认重发失败消息' }).getByRole('button', { name: '确认', exact: true }).click();
    check(posts(revoked.name).length === 0, name + ': revocation while confirmation is open blocks resend at function boundary');
    await revoked.context.close();

    const failed = await openFixture(name + '-load-failure', width, height, { rejectList: true, rejectStatistics: true });
    await failed.page.getByText('验收模拟记录加载失败', { exact: true }).first().waitFor();
    await failed.page.getByRole('alert').filter({ hasText: '验收模拟统计加载失败' }).waitFor();
    check(await failed.page.getByText('统计暂不可用', { exact: true }).count() === 1
      && await failed.page.getByText('正在读取统计', { exact: true }).count() === 0, name + ': failed statistics stop loading and explain retry');
    failed.state.rejectList = false; failed.state.rejectStatistics = false;
    await refresh(failed.page); await ready(failed.page);
    check(await failed.page.getByRole('alert').count() === 0, name + ': list and statistics recover with refresh');
    failed.state.nullStatistics = true;
    await refresh(failed.page);
    await failed.page.getByRole('alert').filter({ hasText: '统计响应为空' }).waitFor();
    check(await failed.page.getByText('统计暂不可用', { exact: true }).count() === 1, name + ': null statistics are actionable and not perpetual loading');
    await failed.context.close();

    const empty = await openFixture(name + '-empty', width, height, { records: [] });
    await empty.page.getByText('暂无匹配记录', { exact: true }).waitFor();
    await empty.page.getByText('各渠道成功率', { exact: true }).click();
    await empty.page.getByText('各模板成功率', { exact: true }).click();
    check(await empty.page.getByText('暂无发送记录', { exact: true }).count() === 2
      && await empty.page.getByRole('checkbox', { name: '选择本页全部失败记录', exact: true }).isDisabled(), name + ': empty results show zero statistics and disable selection');
    await empty.context.close();
  }
  check(errors.length === 0, 'No browser errors or unexpected requests: ' + JSON.stringify(errors));
  check(sourceFiles.every(file => sourceHashes[file] === hashFile(file)), 'All checked source hashes remain unchanged');
} catch (error) {
  failure = error.stack || String(error); console.error(failure); process.exitCode = 1;
} finally {
  await browser?.close();
  await new Promise(resolve => server ? server.httpServer.close(resolve) : resolve());
  writeFileSync(path.join(output, 'result.json'), JSON.stringify({ passed: !failure, assertions: checks.length, checks,
    failure, errors, requests, sourceHashes, rendering, browserVersion: browser?.version(),
    scope: 'Production record page and AuthProvider with controlled HTTP; record creation is fixture behavior, not backend delivery proof' }, null, 2));
}
