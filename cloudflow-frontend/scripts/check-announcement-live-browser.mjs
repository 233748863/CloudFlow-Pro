import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build, preview } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const frontend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const input = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const output = path.resolve(input.output);
assert.equal(path.basename(output), 'announcement-browser');
assert.equal(path.dirname(path.dirname(output)), path.join(path.dirname(frontend), '.cloudflow-runtime', 'batch-g-integration'));
for (const base of [input.authBase, input.oaBase]) {
  assert.equal(new URL(base).hostname, '127.0.0.1');
  assert.equal(new URL(base).protocol, 'http:');
}
const modulePath = process.env.CLOUDFLOW_PLAYWRIGHT_MODULE;
assert.ok(modulePath && existsSync(modulePath), 'Installed Playwright module required');
const { chromium } = await import(pathToFileURL(modulePath).href);
const files = ['src/pages/AnnouncementPage.tsx', 'src/components/admin/announcements/AnnouncementManageView.tsx',
  'src/components/common/AnnouncementManageTable.tsx',
  'src/components/admin/announcements/AnnouncementTargetingEditor.tsx',
  'src/pages/system/message/Mine.tsx', 'src/pages/system/message/options.ts', 'src/services/api/message.ts',
  'src/services/api/announcement.ts', 'src/stores/announcementStore.ts', 'src/services/api/auth.ts',
  'src/services/api/request.ts', 'src/context/AuthContext.tsx', 'src/utils/authStorage.ts',
  'src/utils/navigation.ts', 'src/components/common/PermissionGuard.tsx',
  'src/pages/system/_components/InfrastructurePrimitives.tsx', 'src/pages/system/_components/useInfrastructurePage.ts',
  'src/components/common/Pagination.tsx', 'src/components/common/table.tsx',
  'src/components/common/BaseDialog.tsx', 'src/components/common/ModalOverlay.tsx',
  'src/components/common/AnnouncementDetailModal.tsx', 'src/components/common/announcement-overlays.css',
  'src/hooks/useBreakpoint.ts', 'src/index.css', 'src/styles/unity2-refresh.css', 'src/styles/mobile-foundation.css',
  'scripts/announcement-browser/fixture.tsx', 'scripts/announcement-browser/index.html',
  'scripts/check-announcement-live-browser.mjs'];
const hash = file => createHash('sha256').update(readFileSync(path.join(frontend, file))).digest('hex');
const sourceHashes = Object.fromEntries(files.map(file => [file, hash(file)]));
const checks = [], errors = [], requests = [], screenshots = [], publications = [];
const check = (condition, label) => { assert.ok(condition, label); checks.push(label); console.log('PASS ' + label); };
const minePath = '/api/auth/system/message/mine';
const publishPath = '/api/oa/announcement/publish';
const managePath = '/api/oa/announcement/manage-list';
const config = { configFile: false, root: frontend, logLevel: 'warn', plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': path.join(frontend, 'src') } },
  build: { outDir: path.join(output, 'dist'), emptyOutDir: false,
    rollupOptions: { input: path.join(frontend, 'scripts/announcement-browser/index.html') } } };
let browser, server, failure = null, browserVersion;
mkdirSync(output);
const entry = () => 'http://127.0.0.1:' + server.httpServer.address().port + '/scripts/announcement-browser/index.html';
async function open(name, width, height, user) {
  const context = await browser.newContext({ viewport: { width, height } });
  await context.addCookies(input.sessions[user]);
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  page.on('pageerror', error => errors.push(name + ': ' + error.message));
  page.on('requestfailed', request => {
    if (new URL(request.url()).pathname.startsWith('/api/')) errors.push(name + ': failed '
      + new URL(request.url()).pathname + ': ' + request.failure()?.errorText);
  });
  page.on('request', request => {
    const url = new URL(request.url());
    if (url.pathname.startsWith('/api/')) requests.push({ name, method: request.method(),
      path: url.pathname, query: Object.fromEntries(url.searchParams), body: request.postData() });
  });
  await page.goto(entry());
  await page.getByTestId('announcement-fixture-ready').waitFor();
  await page.waitForLoadState('networkidle');
  return { context, page };
}
async function select(dialog, page, index, label) {
  await dialog.locator('button[aria-haspopup="listbox"]').nth(index).click();
  await page.getByRole('option', { name: label, exact: true }).click();
}
async function shot(page, name) {
  await page.screenshot({ path: path.join(output, name + '.jpg'), type: 'jpeg' });
  screenshots.push(name + '.jpg');
}
async function mine(page) {
  const pending = page.waitForResponse(response => new URL(response.url()).pathname === minePath);
  await page.getByRole('link', { name: '个人消息页面', exact: true }).click();
  const document = await (await pending).json();
  assert.equal(document.code, 200);
  await page.waitForLoadState('networkidle');
  return document.data;
}
try {
  await build(config);
  server = await preview({ ...config, preview: { host: '127.0.0.1', port: 0, open: false, proxy: {
    '/api/auth': { target: input.authBase, changeOrigin: true, rewrite: value => value.replace(/^\/api\/auth/, '') },
    '/api/oa': { target: input.oaBase, changeOrigin: true, rewrite: value => value.replace(/^\/api\/oa/, '') },
  } } });
  browser = await chromium.launch({ headless: true,
    ...(process.env.CLOUDFLOW_CHROMIUM_EXECUTABLE ? { executablePath: process.env.CLOUDFLOW_CHROMIUM_EXECUTABLE } : {}) });
  browserVersion = browser.version();
  for (const [name, width, height, user, scopes] of [
    ['desktop', 1440, 1000, 'admin', ['ALL', 'DEPT']], ['mobile', 390, 844, 'other', ['ROLE']],
  ]) {
    const { context, page } = await open(name, width, height, user);
    const management = page.waitForResponse(response => new URL(response.url()).pathname === managePath);
    await page.getByRole('button', { name: '公告管理', exact: true }).click();
    check((await (await management).json()).code === 200, name + ': actual administrator opens formal management list');
    await page.waitForLoadState('networkidle');
    for (const scope of scopes) {
      await page.getByRole('button', { name: '发布公告', exact: true }).click();
      const dialog = page.getByRole('dialog', { name: '发布新公告', exact: true });
      await dialog.waitFor();
      check(await dialog.evaluate(element => { const box = element.getBoundingClientRect();
        return box.left >= 0 && box.right <= innerWidth + 1 && box.top >= 0 && box.bottom <= innerHeight + 1;
      }), name + '-' + scope + ': formal publish dialog fits viewport');
      const before = requests.filter(request => request.path === publishPath).length;
      await dialog.getByRole('button', { name: '发布公告', exact: true }).click();
      await page.getByText('标题和内容不能为空', { exact: true }).first().waitFor();
      check(await dialog.isVisible() && requests.filter(request => request.path === publishPath).length === before,
        name + '-' + scope + ': empty required fields stay in dialog without publication');
      const title = input.prefix + '-' + scope;
      const content = '<p>实际页面公告内容 ' + scope + '</p>';
      await dialog.getByPlaceholder('请输入公告标题', { exact: true }).fill(title);
      await dialog.getByRole('button', { name: '发布公告', exact: true }).click();
      check(await dialog.isVisible() && requests.filter(request => request.path === publishPath).length === before,
        name + '-' + scope + ': title alone creates no publication');
      await dialog.getByPlaceholder('请输入公告内容，支持 HTML 格式', { exact: true }).fill(content);
      await select(dialog, page, 0, '公告');
      await select(dialog, page, 1, '高');
      await dialog.getByRole('checkbox', { name: '设为置顶', exact: true }).check();
      if (scope === 'DEPT') {
        await dialog.getByRole('button', { name: /按部门定向/ }).click();
        await dialog.getByPlaceholder('搜索部门', { exact: true }).fill(input.department);
        const node = dialog.locator('div.group').filter({ has: page.getByText(input.department, { exact: true }) }).first();
        await node.locator(':scope > button').nth(1).click();
        await dialog.getByText('已选部门', { exact: true }).waitFor();
      } else if (scope === 'ROLE') {
        await dialog.getByRole('button', { name: /按角色定向/ }).click();
        await dialog.getByPlaceholder('搜索角色', { exact: true }).fill(input.role);
        await dialog.locator('div.group').filter({ has: page.getByText(input.role, { exact: true }) }).first().click();
        await dialog.getByText('已选角色', { exact: true }).waitFor();
      }
      check(await dialog.getByRole('checkbox', { name: '设为置顶', exact: true }).isChecked(),
        name + '-' + scope + ': configured publication fields remain editable');
      if (scope !== 'DEPT') await shot(page, name + '-publish-' + scope);
      const published = page.waitForResponse(response => new URL(response.url()).pathname === publishPath
        && response.request().method() === 'POST');
      const listed = page.waitForResponse(response => new URL(response.url()).pathname === managePath);
      await dialog.getByRole('button', { name: '发布公告', exact: true }).click();
      const response = await published;
      const document = await response.json();
      const submitted = response.request().postDataJSON();
      check(document.code === 200 && document.data === true
        && Boolean((await response.request().allHeaders())['x-csrf-token']),
        name + '-' + scope + ': actual authenticated publish succeeds with CSRF token');
      check(submitted.title === title && submitted.content === content && submitted.scopeType === scope
        && submitted.type === '2' && submitted.priority === 'H' && submitted.isTop === 1
        && (scope === 'ALL' || submitted.scopeValue === (scope === 'DEPT' ? '100' : 'admin')),
        name + '-' + scope + ': browser sends exact configured business fields');
      const listing = await (await listed).json();
      const rows = listing.data.list.filter(row => row.title === title);
      check(listing.code === 200 && rows.length === 1 && rows[0].status === '1',
        name + '-' + scope + ': real refreshed list contains one published announcement');
      await dialog.waitFor({ state: 'hidden' });
      await page.locator('tbody tr').filter({ has: page.getByText(title, { exact: true }) }).waitFor();
      publications.push({ title, content, id: String(rows[0].announcementId), scope });
      check(requests.filter(request => request.path === publishPath).length === before + 1,
        name + '-' + scope + ': one publication action sends one real POST');
      await page.waitForLoadState('networkidle');
    }
    await page.getByRole('button', { name: '发布公告', exact: true }).click();
    const cancel = page.getByRole('dialog', { name: '发布新公告', exact: true });
    check(await cancel.getByPlaceholder('请输入公告标题', { exact: true }).inputValue() === '',
      name + ': successful publication resets next form');
    await cancel.getByPlaceholder('请输入公告标题', { exact: true }).fill(input.prefix + '-cancel');
    const beforeCancel = requests.filter(request => request.path === publishPath).length;
    await cancel.getByRole('button', { name: '取消', exact: true }).click();
    await cancel.waitFor({ state: 'hidden' });
    check(requests.filter(request => request.path === publishPath).length === beforeCancel, name + ': cancellation sends no publication');
    await page.waitForLoadState('networkidle');
    await context.close();
  }
  for (const user of ['other', 'tenant', 'readonly']) {
    const { context, page } = await open('reader-' + user, 390, 844, user);
    if (user === 'readonly') {
      check(await page.getByRole('button', { name: '公告管理', exact: true }).count() === 0
        && await page.getByRole('button', { name: '发布公告', exact: true }).count() === 0,
        'real readonly announcement page hides management and publishing actions');
    } else {
      const data = await mine(page);
      const owned = data.rows.filter(row => publications.some(item => item.id === String(row.bizId)));
      check(owned.length === (user === 'other' ? 3 : 0), user + ': actual personal page contains exact tenant-owned publication count');
      if (user === 'other') {
        for (const publication of publications) {
          const message = owned.find(row => String(row.bizId) === publication.id);
          check(message?.messageCategory === 'ANNOUNCEMENT' && message.title === publication.title
            && message.bizType === 'OA_ANNOUNCEMENT' && message.linkUrl === '/announcement',
            publication.scope + ': real recipient personal row retains category title and business identity');
          const row = page.locator('tbody tr').filter({ has: page.getByRole('checkbox', { name: '选择消息 ' + message.recordId, exact: true }) });
          const read = page.waitForResponse(response => new URL(response.url()).pathname === minePath + '/read'
            && response.request().method() === 'PUT');
          await row.getByRole('button').click();
          check((await (await read).json()).code === 200, publication.scope + ': actual recipient reads browser-published message');
          const detail = page.getByRole('dialog');
          await detail.getByText('已读', { exact: true }).waitFor();
          check((await detail.innerText()).includes('实际页面公告内容 ' + publication.scope),
            publication.scope + ': recipient detail displays actual published content');
          if (publication.scope === 'ROLE') await shot(page, 'mobile-received-announcement');
          const visibleList = page.waitForResponse(response => new URL(response.url()).pathname === '/api/oa/announcement/my-list');
          await detail.getByRole('button', { name: '查看业务详情', exact: true }).click();
          const visibleDocument = await (await visibleList).json();
          check(visibleDocument.code === 200 && visibleDocument.data.some(item => String(item.announcementId) === publication.id),
            publication.scope + ': formal business page reload contains actual published identity');
          await page.getByRole('heading', { name: '公告', exact: true }).waitFor();
          const visibleTitle = page.getByText(publication.title, { exact: true });
          await visibleTitle.waitFor();
          check(await visibleTitle.count() === 1 && await visibleTitle.isVisible(),
            publication.scope + ': business navigation reaches formal visible announcement');
          await mine(page);
        }
      }
    }
    await page.waitForLoadState('networkidle');
    await context.close();
  }
  check(requests.filter(request => request.path === publishPath).length === 3, 'exactly three actual page publications across all scopes');
  check(requests.every(request => request.path === '/api/auth/info' || request.path.startsWith(minePath)
    || request.path === '/api/auth/system/dept/tree' || request.path === '/api/auth/system/role/optionselect'
    || request.path === '/api/auth/system/dict/data/type/announcement_type'
    || request.path === '/api/auth/system/dict/data/type/announcement_priority'
    || request.path === '/api/auth/system/dict/data/type/announcement_status'
    || request.path.startsWith('/api/oa/announcement/')), 'all browser data uses declared real backend endpoints');
  check(errors.length === 0, 'no browser runtime or API transport errors');
  check(files.every(file => hash(file) === sourceHashes[file]), 'all declared frontend input hashes unchanged');
} catch (error) {
  failure = { name: error.name, message: error.message, stack: error.stack };
  console.error(error.stack);
} finally {
  if (browser) await browser.close();
  if (server) await server.close();
  writeFileSync(path.join(output, 'result.json'), JSON.stringify({ passed: !failure, assertions: checks.length,
    checks, failure, errors, requests, screenshots, browserVersion, sourceHashes, publications,
    backend: 'owned real authenticated HTTP; no route mocks', liveWebSocketBrowserCovered: false, globalComplete: false }, null, 2));
}
if (failure) process.exitCode = 1;
