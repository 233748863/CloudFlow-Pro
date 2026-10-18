import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build, preview } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const frontend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(path.dirname(frontend), '.cloudflow-runtime', `a2-message-center-browser-${Date.now()}`);
const modulePath = process.env.CLOUDFLOW_PLAYWRIGHT_MODULE;
assert.ok(modulePath && existsSync(modulePath), 'Installed browser module is required');
const { chromium } = await import(pathToFileURL(modulePath).href);
const executablePath = process.env.CLOUDFLOW_CHROMIUM_EXECUTABLE;
assert.ok(!executablePath || existsSync(executablePath), 'Browser executable must exist');
const sourceFiles = ['src/components/common/UnifiedMessageBell.tsx', 'src/pages/system/message/Mine.tsx',
  'src/services/api/notice.ts', 'src/services/api/message.ts', 'src/context/AuthContext.tsx',
  'src/components/common/table.tsx', 'src/index.css', 'src/styles/unity2-refresh.css',
  'src/styles/mobile-foundation.css', 'scripts/message-center-browser/fixture.tsx',
  'scripts/message-center-browser/index.html', 'scripts/check-message-center-browser.mjs'];
const hashFile = file => createHash('sha256').update(readFileSync(path.join(frontend, file))).digest('hex');
const sourceHashes = Object.fromEntries(sourceFiles.map(file => [file, hashFile(file)]));
mkdirSync(output);
console.log(`MESSAGE_CENTER_BROWSER_RUN=${output}`);
const config = { configFile: false, root: frontend, logLevel: 'warn', plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': path.join(frontend, 'src') } },
  build: { outDir: path.join(output, 'dist'), emptyOutDir: false,
    rollupOptions: { input: path.join(frontend, 'scripts/message-center-browser/index.html') } } };
const categories = ['TODO', 'CC', 'ANNOUNCEMENT', 'BIZ_REMINDER', 'SYSTEM'];
const labels = ['待办', '抄送', '公告', '业务提醒', '系统'];
const titles = ['待办审批提醒', '流程抄送提醒', '十月生产公告', '合同到期提醒', '账户安全通知'];
const initialRecords = Array.from({ length: 15 }, (_, index) => ({
  recordId: 101 + index, title: index < 5 ? titles[index] : `历史消息${index + 1}`,
  content: index === 0 ? '请检查生产排班调整、审批意见及安全注意事项，完成审批后返回消息中心核对阅读状态。'.repeat(3) : `验收正文-${101 + index}`,
  messageCategory: categories[index % 5], readFlag: index === 14 ? 1 : 0,
  createTime: `${index < 5 ? '2026-10-17' : '2026-10-16'} 09:${String(59 - index).padStart(2, '0')}:00`,
  ...(index === 2 ? { bizType: 'OA_ANNOUNCEMENT', bizId: '203' } : {}),
  linkUrl: index === 0 ? '/approval/detail/301?from=message#history' : index === 4 ? '//outside.example.test/leave' : undefined,
}));
const announcements = [{ announcementId: 203, title: titles[2], content: '十月生产公告正文', isRead: false,
  type: 'NORMAL', isTop: 0, priority: 'N', createTime: '2026-10-17 09:57:00' },
{ announcementId: 299, title: '历史兼容公告', content: '兼容公告正文', isRead: false, type: 'NORMAL',
  isTop: 0, priority: 'N', createTime: '2026-10-15 09:00:00' }];
const fullPermissions = ['system:message:mine:list', 'system:message:mine:read', 'oa:announcement:list', 'system:message:subscribe:list'];
const checks = [];
const failures = [];
const errors = [];
const requests = [];
const check = (value, label) => { assert.ok(value, label); checks.push(label); console.log(`PASS ${label}`); };
const verify = (value, label) => { if (value) { checks.push(label); console.log(`PASS ${label}`); } else { failures.push(label); console.error(`FAIL ${label}`); } };
let browser;
let server;
let failure = null;

async function openFixture(name, width, height, view = 'bell', permissions = fullPermissions) {
  const context = await browser.newContext({ viewport: { width, height } });
  const page = await context.newPage();
  const state = { records: structuredClone(initialRecords), permissions, rejectRead: false };
  page.setDefaultTimeout(15000);
  page.on('pageerror', error => errors.push(`${name}: ${error.message}`));
  await page.route('**/api/**', async route => {
    const request = route.request();
    const url = new URL(request.url());
    const body = request.postDataJSON();
    requests.push({ scenario: name, method: request.method(), path: url.pathname, query: Object.fromEntries(url.searchParams), body });
    const pathname = url.pathname.startsWith('/api/') ? url.pathname.slice(4) : url.pathname;
    let data;
    if (pathname === '/auth/info') {
      data = { user: { userId: 702, userName: 'message-browser-check', tenantId: 1 }, permissions: state.permissions, roles: ['user'] };
    } else if (pathname === '/oa/announcement/my-list') {
      data = announcements;
    } else if (pathname === '/auth/system/message/mine/unread-count') {
      data = { TOTAL: state.records.filter(row => row.readFlag !== 1).length };
      for (const category of categories) data[category] = state.records.filter(row => row.messageCategory === category && row.readFlag !== 1).length;
    } else if (pathname === '/auth/system/message/mine/read' && request.method() === 'PUT') {
      if (state.rejectRead) {
        await route.fulfill({ json: { code: 500, msg: '验收模拟已读失败' } });
        return;
      }
      for (const row of state.records) if (body?.all || body?.recordIds?.includes(row.recordId) || body?.category === row.messageCategory) row.readFlag = 1;
      data = null;
    } else if (pathname.startsWith('/auth/system/message/mine/') && Number.isInteger(Number(pathname.split('/').at(-1)))) {
      data = state.records.find(row => row.recordId === Number(pathname.split('/').at(-1)));
    } else if (pathname === '/auth/system/message/mine') {
      const params = url.searchParams;
      const rows = state.records.filter(row => (!params.get('category') || params.get('category') === row.messageCategory)
        && (!params.has('readFlag') || Number(params.get('readFlag')) === row.readFlag)
        && (!params.get('beginTime') || row.createTime.slice(0, 10) >= params.get('beginTime'))
        && (!params.get('endTime') || row.createTime.slice(0, 10) <= params.get('endTime')));
      const pageNum = Number(params.get('pageNum') || 1);
      const pageSize = Number(params.get('pageSize') || 10);
      data = { rows: rows.slice((pageNum - 1) * pageSize, pageNum * pageSize), total: rows.length, pageNum, pageSize };
    } else {
      errors.push(`${name}: unexpected ${request.method()} ${pathname}`);
      await route.fulfill({ status: 500, json: { code: 500, msg: 'Unexpected fixture request' } });
      return;
    }
    await route.fulfill({ json: { code: 200, msg: 'success', data } });
  });
  const address = server.httpServer.address();
  await page.goto(`http://127.0.0.1:${address.port}/scripts/message-center-browser/index.html?view=${view}`);
  await page.getByTestId('message-fixture-ready').waitFor();
  return { page, context, state };
}

async function selectOption(page, index, label) {
  await page.locator('button[aria-haspopup="listbox"]').nth(index).click();
  await page.getByRole('listbox').waitFor({ state: 'visible' });
  await page.getByRole('option', { name: label, exact: true }).click();
}
async function waitRows(page, count, title) {
  await page.waitForFunction(({ count, title }) => {
    const rows = Array.from(document.querySelectorAll('tbody tr'));
    return rows.length === count && (!title || rows.some(row => row.textContent.includes(title)))
      && !document.querySelector('tbody')?.textContent?.includes('正在加载消息');
  }, { count, title });
}
async function saveShot(page, name, fullPage = true) {
  await page.screenshot({ path: path.join(output, `${name}.jpg`), type: 'jpeg', fullPage });
}

try {
  await build(config);
  server = await preview({ ...config, preview: { host: '127.0.0.1', port: 0, strictPort: false, open: false } });
  browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
  for (const [name, width, height] of [['desktop', 1440, 1000], ['mobile', 390, 844]]) {
    const { page, context, state } = await openFixture(name, width, height);
    const trigger = page.getByRole('button', { name: '消息中心', exact: true });
    await trigger.getByText('14', { exact: true }).waitFor();
    check(await trigger.innerText() === '14', `${name}: unread total comes from unified records without announcement double count`);
    await trigger.click();
    const dialog = page.getByRole('dialog');
    await dialog.getByText(titles[0], { exact: true }).waitFor();
    for (let i = 0; i < 5; i++) {
      const item = dialog.getByRole('button').filter({ has: page.getByText(titles[i], { exact: true }) });
      check(await item.count() === 1 && await item.getByText(labels[i], { exact: true }).count() === 1, `${name}: bell displays ${categories[i]} title and category`);
    }
    check(await dialog.getByText(titles[2], { exact: true }).count() === 1, `${name}: linked OA announcement appears once`);
    check(await dialog.getByText('历史兼容公告', { exact: true }).count() === 1, `${name}: unlinked announcement remains visible`);
    await dialog.getByRole('button', { name: /^公告[0-9]+$/ }).click();
    check(await dialog.getByText(titles[2], { exact: true }).count() === 1 && await dialog.getByText(titles[0], { exact: true }).count() === 0, `${name}: announcement tab contains the unified announcement only once`);
    await dialog.getByRole('button', { name: /^通知[0-9]+$/ }).click();
    check(await dialog.getByText(titles[2], { exact: true }).count() === 0 && await dialog.getByText(titles[0], { exact: true }).count() === 1, `${name}: notice tab excludes announcements`);
    await dialog.getByRole('button', { name: /^全部[0-9]+$/ }).click();
    await saveShot(page, `${name}-bell`);
    await dialog.getByRole('button').filter({ has: page.getByText(titles[0], { exact: true }) }).click();
    await dialog.getByRole('heading', { name: '通知详情', exact: true }).waitFor();
    check(state.records[0].readFlag === 1, `${name}: bell detail marks only its record read`);
    await page.keyboard.press('Escape');
    await dialog.getByRole('heading', { name: '消息中心', exact: true }).waitFor();
    await trigger.getByText('13', { exact: true }).waitFor();
    verify((await dialog.innerText()).includes('未读消息 13 条') && await trigger.innerText() === '13', `${name}: bell unread total decrements immediately after reading`);
    const readCount = requests.filter(row => row.scenario === name && row.method === 'PUT').length;
    await dialog.getByRole('button').filter({ has: page.getByText(titles[0], { exact: true }) }).click();
    await dialog.getByRole('heading', { name: '通知详情', exact: true }).waitFor();
    check(requests.filter(row => row.scenario === name && row.method === 'PUT').length === readCount, `${name}: rereading a message makes no duplicate read write`);
    await dialog.getByRole('button', { name: '查看详情', exact: true }).click();
    await page.getByTestId('business-target').waitFor();
    check(await page.getByTestId('business-target').innerText() === '/approval/detail/301?from=message#history', `${name}: bell follows same-origin business path with query and hash`);
    await context.close();

    const mine = await openFixture(`${name}-mine`, width, height, 'mine');
    const minePage = mine.page;
    await waitRows(minePage, 10, titles[0]);
    for (let i = 0; i < 5; i++) check(await minePage.locator('tbody tr').filter({ hasText: titles[i] }).getByText(labels[i], { exact: true }).count() === 1, `${name}: my messages displays ${categories[i]} category`);
    check(await minePage.getByRole('button', { name: '所选标为已读', exact: true }).isDisabled(), `${name}: empty selection disables batch-read action`);
    await saveShot(minePage, `${name}-mine`, name !== 'mobile');
    if (name === 'mobile') {
      verify(await minePage.locator('table.cf-mobile-table').count() === 1, `${name}: message list uses readable mobile cards`);
      verify(await minePage.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${name}: message page has no horizontal overflow`);
      const firstRow = minePage.locator('tbody tr').first();
      await firstRow.locator('td[data-cf-mobile-label="消息内容"]').waitFor();
      check(await firstRow.locator('td[data-cf-mobile-label]').count() === 5, `${name}: every message card field has a label including selection`);
      check(await firstRow.evaluate(row => Array.from(row.querySelectorAll('td')).every((cell, index, cells) => {
        const bounds = cell.getBoundingClientRect();
        const previous = cells[index - 1]?.getBoundingClientRect();
        return bounds.left >= 0 && bounds.right <= innerWidth + 1 && (!previous || bounds.top >= previous.bottom - 1);
      })), `${name}: all message card fields fit width without overlap`);
      await firstRow.screenshot({ path: path.join(output, `${name}-card.jpg`), type: 'jpeg' });
    }
    await minePage.locator('tbody').getByRole('button').filter({ has: minePage.getByText(titles[0], { exact: true }) }).click();
    const detail = minePage.getByRole('dialog');
    await detail.getByRole('heading', { name: titles[0], exact: true }).waitFor();
    await minePage.waitForFunction(() => document.querySelector('tbody tr')?.textContent?.includes('已读'));
    verify(await detail.getByText('已读', { exact: true }).count() === 1 && await detail.getByText('未读', { exact: true }).count() === 0, `${name}: open detail reflects successful read immediately`);
    await saveShot(minePage, `${name}-detail`, false);
    await minePage.keyboard.press('Escape');
    await detail.waitFor({ state: 'hidden' });
    await minePage.getByRole('button', { name: '消息中心', exact: true }).getByText('13', { exact: true }).waitFor();
    check(await minePage.getByRole('button', { name: '消息中心', exact: true }).innerText() === '13', `${name}: list read event refreshes the bell unread count`);
    await minePage.getByRole('checkbox', { name: '选择消息 102', exact: true }).check();
    await minePage.getByRole('checkbox', { name: '选择消息 104', exact: true }).check();
    await minePage.getByRole('button', { name: '所选标为已读', exact: true }).click();
    await minePage.getByRole('button', { name: '所选标为已读', exact: true }).waitFor({ state: 'visible' });
    await minePage.waitForFunction(() => document.querySelectorAll('tbody input:checked').length === 0 && document.querySelector('tbody')?.textContent?.includes('合同到期提醒'));
    check(mine.state.records[1].readFlag === 1 && mine.state.records[3].readFlag === 1 && mine.state.records[2].readFlag === 0, `${name}: batch read updates selected records and leaves unselected records unread`);
    await selectOption(minePage, 0, '公告');
    await waitRows(minePage, 3, titles[2]);
    check(await minePage.locator('tbody tr').count() === 3, `${name}: category filter returns only announcement records`);
    await minePage.getByRole('button', { name: '本分类全部已读', exact: true }).click();
    await minePage.waitForFunction(() => !document.querySelector('tbody')?.textContent?.includes('未读') && document.querySelectorAll('tbody tr').length === 3);
    check(mine.state.records.filter(row => row.messageCategory === 'ANNOUNCEMENT').every(row => row.readFlag === 1) && mine.state.records[4].readFlag === 0, `${name}: category-read keeps other categories unread`);
    await selectOption(minePage, 0, '全部分类');
    await waitRows(minePage, 10, titles[0]);
    await selectOption(minePage, 1, '未读');
    await waitRows(minePage, 8, titles[4]);
    check(await minePage.locator('tbody').getByText('已读', { exact: true }).count() === 0, `${name}: unread filter excludes read records`);
    await selectOption(minePage, 1, '全部状态');
    await waitRows(minePage, 10, titles[0]);
    await minePage.getByLabel('开始日期', { exact: true }).fill('2026-10-17');
    await minePage.getByLabel('结束日期', { exact: true }).fill('2026-10-17');
    await waitRows(minePage, 5, titles[0]);
    check(await minePage.locator('tbody tr').count() === 5 && await minePage.locator('tbody').innerText().then(text => !text.includes('2026-10-16')), `${name}: inclusive date range filters messages`);
    await minePage.getByLabel('开始日期', { exact: true }).fill('');
    await minePage.getByLabel('结束日期', { exact: true }).fill('');
    await waitRows(minePage, 10, titles[0]);
    await minePage.getByRole('button', { name: '下一页', exact: true }).click();
    await waitRows(minePage, 5, '历史消息11');
    check(await minePage.locator('tbody tr').count() === 5 && await minePage.locator('tbody').getByText(titles[0], { exact: true }).count() === 0, `${name}: pagination loads the remaining five records`);
    await minePage.getByRole('button', { name: '全部已读', exact: true }).click();
    await minePage.waitForFunction(() => !document.querySelector('tbody')?.textContent?.includes('未读') && document.querySelectorAll('tbody tr').length === 5);
    check(mine.state.records.every(row => row.readFlag === 1), `${name}: all-read includes records on other pages`);
    await mine.context.close();

    const limited = await openFixture(`${name}-read-only`, width, height, 'mine', ['system:message:mine:list']);
    await waitRows(limited.page, 10, titles[0]);
    check(await limited.page.getByRole('button', { name: '全部已读', exact: true }).count() === 0
      && await limited.page.getByRole('button', { name: '所选标为已读', exact: true }).count() === 0, `${name}: read-only identity cannot use read actions`);
    await limited.page.locator('tbody').getByRole('button').filter({ has: limited.page.getByText(titles[0], { exact: true }) }).click();
    await limited.page.getByRole('dialog').getByText('未读', { exact: true }).waitFor();
    await limited.page.keyboard.press('Escape');
    await limited.page.getByRole('button', { name: '消息中心', exact: true }).click();
    const limitedDialog = limited.page.getByRole('dialog');
    await limitedDialog.getByText(titles[0], { exact: true }).waitFor();
    await limitedDialog.getByRole('button').filter({ has: limited.page.getByText(titles[0], { exact: true }) }).click();
    await limitedDialog.getByRole('heading', { name: '通知详情', exact: true }).waitFor();
    check(!requests.some(row => row.scenario === `${name}-read-only` && row.method !== 'GET')
      && limited.state.records[0].readFlag === 0, `${name}: read-only bell and list details do not write read state`);
    await limited.context.close();

    const retry = await openFixture(`${name}-read-failure`, width, height, 'mine');
    retry.state.rejectRead = true;
    await waitRows(retry.page, 10, titles[0]);
    await retry.page.locator('tbody').getByRole('button').filter({ has: retry.page.getByText(titles[0], { exact: true }) }).click();
    await retry.page.getByText('验收模拟已读失败', { exact: true }).first().waitFor();
    check(await retry.page.getByRole('dialog').getByText('未读', { exact: true }).count() === 1
      && retry.state.records[0].readFlag === 0, `${name}: failed list read keeps detail and record unread`);
    await retry.page.keyboard.press('Escape');
    retry.state.rejectRead = false;
    await retry.page.locator('tbody').getByRole('button').filter({ has: retry.page.getByText(titles[0], { exact: true }) }).click();
    await retry.page.getByRole('dialog').getByText('已读', { exact: true }).waitFor();
    check(retry.state.records[0].readFlag === 1, `${name}: failed read can be retried successfully`);
    await retry.page.getByRole('button', { name: '查看业务详情', exact: true }).click();
    await retry.page.getByTestId('business-target').waitFor();
    check(await retry.page.getByTestId('business-target').innerText() === '/approval/detail/301?from=message#history', `${name}: list detail follows full business path`);
    await retry.context.close();

    const external = await openFixture(`${name}-external-link`, width, height, 'mine');
    await waitRows(external.page, 10, titles[4]);
    await external.page.locator('tbody').getByRole('button').filter({ has: external.page.getByText(titles[4], { exact: true }) }).click();
    await external.page.getByRole('dialog').getByText('已读', { exact: true }).waitFor();
    check(await external.page.getByRole('dialog').getByRole('button', { name: '查看业务详情', exact: true }).count() === 0, `${name}: list rejects protocol-relative external business link`);
    await external.page.keyboard.press('Escape');
    await external.page.getByRole('button', { name: '消息中心', exact: true }).click();
    const externalDialog = external.page.getByRole('dialog');
    await externalDialog.getByText(titles[4], { exact: true }).waitFor();
    await externalDialog.getByRole('button').filter({ has: external.page.getByText(titles[4], { exact: true }) }).click();
    await externalDialog.getByRole('heading', { name: '通知详情', exact: true }).waitFor();
    check(await externalDialog.getByRole('button', { name: '查看详情', exact: true }).count() === 0, `${name}: bell rejects protocol-relative external business link`);
    await external.context.close();

    const sync = await openFixture(`${name}-bell-sync`, width, height, 'mine');
    await waitRows(sync.page, 10, titles[1]);
    const syncTrigger = sync.page.getByRole('button', { name: '消息中心', exact: true });
    await syncTrigger.getByText('14', { exact: true }).waitFor();
    await syncTrigger.click();
    const syncDialog = sync.page.getByRole('dialog');
    await syncDialog.getByText(titles[1], { exact: true }).waitFor();
    sync.state.rejectRead = true;
    await syncDialog.getByRole('button').filter({ has: sync.page.getByText(titles[1], { exact: true }) }).click();
    await sync.page.getByText('验收模拟已读失败', { exact: true }).first().waitFor();
    await syncDialog.getByRole('heading', { name: '通知详情', exact: true }).waitFor();
    check(sync.state.records[1].readFlag === 0 && await syncTrigger.innerText() === '14', `${name}: failed bell read preserves unread record and total`);
    await sync.page.keyboard.press('Escape');
    sync.state.rejectRead = false;
    await syncDialog.getByRole('button').filter({ has: sync.page.getByText(titles[1], { exact: true }) }).click();
    await syncDialog.getByRole('heading', { name: '通知详情', exact: true }).waitFor();
    await syncTrigger.getByText('13', { exact: true }).waitFor();
    check(sync.state.records[1].readFlag === 1, `${name}: failed bell read can be retried successfully`);
    await sync.page.keyboard.press('Escape');
    await sync.page.keyboard.press('Escape');
    await syncDialog.waitFor({ state: 'hidden' });
    await sync.page.locator('tbody tr').filter({ hasText: titles[1] }).getByText('已读', { exact: true }).waitFor();
    verify(await sync.page.locator('tbody tr').filter({ hasText: titles[1] }).getByText('已读', { exact: true }).count() === 1, `${name}: reading through bell refreshes the visible message list`);
    sync.state.records.push({ ...initialRecords[0], recordId: 199, title: '实时新增待办', readFlag: 0 });
    await sync.page.evaluate(() => window.dispatchEvent(new Event('sys-notice-received')));
    await syncTrigger.getByText('14', { exact: true }).waitFor();
    check(await syncTrigger.innerText() === '14', `${name}: incoming-message event refreshes the closed bell count`);
    await syncTrigger.click();
    await syncDialog.getByText('实时新增待办', { exact: true }).waitFor();
    check(await syncDialog.getByText('实时新增待办', { exact: true }).count() === 1, `${name}: reopening bell fetches the newly received message`);
    await syncDialog.getByRole('button', { name: '查看全部消息', exact: true }).click();
    await syncDialog.waitFor({ state: 'hidden' });
    check(await sync.page.getByRole('heading', { name: '我的消息', exact: true }).count() === 1, `${name}: view-all action closes bell and opens my messages`);
    await sync.context.close();

    const hidden = await openFixture(`${name}-no-permissions`, width, height, 'bell', []);
    check(await hidden.page.getByRole('button', { name: '消息中心', exact: true }).count() === 0, `${name}: bell is hidden without message or announcement permissions`);
    check(!requests.some(row => row.scenario === `${name}-no-permissions` && row.path !== '/api/auth/info'), `${name}: hidden bell makes no message or announcement requests`);
    await hidden.context.close();
  }
  check(errors.length === 0, `No browser errors or unexpected requests: ${JSON.stringify(errors)}`);
  check(sourceFiles.every(file => sourceHashes[file] === hashFile(file)), 'All checked source hashes remain unchanged');
  assert.equal(failures.length, 0, `Failed checks: ${failures.join('; ')}`);
} catch (error) {
  failure = error.stack || String(error);
  console.error(failure);
  process.exitCode = 1;
} finally {
  await browser?.close();
  await new Promise(resolve => server ? server.httpServer.close(resolve) : resolve());
  writeFileSync(path.join(output, 'result.json'), JSON.stringify({ passed: !failure, assertions: checks.length,
    checks, failures, failure, errors, requests, sourceHashes, browserVersion: browser?.version(),
    scope: 'Production bell and my-messages components, production AuthProvider, controlled HTTP; not backend end-to-end' }, null, 2));
}
