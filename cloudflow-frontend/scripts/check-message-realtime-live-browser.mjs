import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build, preview } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const frontend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const input = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const output = path.resolve(input.output);
assert.equal(path.basename(output), 'realtime-browser');
assert.equal(path.dirname(path.dirname(output)), path.join(path.dirname(frontend), '.cloudflow-runtime', 'batch-g-integration'));
for (const base of [input.authBase, input.oaBase, input.workflowBase]) {
  assert.equal(new URL(base).hostname, '127.0.0.1');
  assert.equal(new URL(base).protocol, 'http:');
}
assert.match(input.prefix, /^A2HTTP-r[1-9][0-9]*-realtime$/);
const modulePath = process.env.CLOUDFLOW_PLAYWRIGHT_MODULE;
assert.ok(modulePath && existsSync(modulePath), 'Installed Playwright module required');
const { chromium } = await import(pathToFileURL(modulePath).href);
function sourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const file = path.join(directory, entry.name);
    assert.ok(!entry.isSymbolicLink(), 'Source inputs must not be links');
    return entry.isDirectory() ? sourceFiles(file) : [path.relative(frontend, file)];
  });
}
const files = [...sourceFiles(path.join(frontend, 'src')), 'index.html', 'package.json',
  'package-lock.json', 'vite.config.ts', 'scripts/check-message-realtime-live-browser.mjs'];
const hash = file => createHash('sha256').update(readFileSync(path.join(frontend, file))).digest('hex');
const sourceHashes = Object.fromEntries(files.map(file => [file, hash(file)]));
const checks = [], errors = [], requests = [], sockets = [], publications = [], screenshots = [];
const completedProbes = new WeakSet();
const completedProbeCancellations = [];
const check = (condition, label) => { assert.ok(condition, label); checks.push(label); console.log('PASS ' + label); };
const minePath = '/api/auth/system/message/mine';
const config = { configFile: false, envFile: false, root: frontend, logLevel: 'warn',
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': path.join(frontend, 'src'), sonner: path.join(frontend, 'src/lib/sonner.tsx') } },
  define: { 'import.meta.env.VITE_API_BASE_URL': JSON.stringify('/api'),
    'import.meta.env.VITE_WS_BASE_URL': JSON.stringify('') },
  build: { outDir: path.join(output, 'dist'), emptyOutDir: false, sourcemap: false } };
let browser, server, failure = null, browserVersion;
mkdirSync(output);
const entry = route => 'http://127.0.0.1:' + server.httpServer.address().port + route;
async function until(predicate, label, timeout = 25000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (await predicate()) return;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error('Timed out: ' + label);
}
async function document(context, pathname, options) {
  const response = await context.request.fetch(entry(pathname), options);
  assert.equal(response.status(), 200, pathname + ' HTTP');
  const result = await response.json();
  assert.equal(result.code, 200, pathname + ': ' + result.msg);
  return result.data;
}
async function open(name, user, route, mobile = false) {
  const context = await browser.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 },
    ...(mobile ? { isMobile: true, hasTouch: true,
      userAgent: 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Mobile Safari/537.36' } : {}) });
  await context.addCookies(input.sessions[user]);
  const cookies = await context.cookies(entry('/'));
  check(cookies.some(cookie => cookie.name === 'Authorization' && cookie.httpOnly), name + ': real HttpOnly login cookie');
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  page.on('pageerror', error => errors.push(name + ': ' + error.message));
  page.on('requestfailed', request => {
    const pathname = new URL(request.url()).pathname;
    if (request.method() === 'OPTIONS' && pathname === '/api/auth/login'
      && request.failure()?.errorText === 'net::ERR_ABORTED' && completedProbes.has(request)) {
      completedProbeCancellations.push({ name, path: pathname, method: 'OPTIONS', status: 204, error: 'net::ERR_ABORTED' });
      return;
    }
    if (pathname.startsWith('/api/')) errors.push(name + ': failed ' + pathname + ': ' + request.failure()?.errorText);
  });
  page.on('response', response => {
    const pathname = new URL(response.url()).pathname;
    if (pathname.startsWith('/api/')) {
      if (pathname === '/api/auth/login' && response.request().method() === 'OPTIONS' && response.status() === 204) {
        completedProbes.add(response.request());
      }
      requests.push({ name, path: pathname, method: response.request().method(), status: response.status() });
      if (response.status() >= 400 && response.request().method() !== 'OPTIONS') errors.push(name + ': HTTP ' + response.status() + ' ' + pathname);
    }
  });
  page.on('websocket', socket => {
    const url = new URL(socket.url());
    const proof = { name, path: url.pathname, queryKeys: [...url.searchParams.keys()], authenticated: false, frames: [] };
    sockets.push(proof);
    socket.on('framereceived', event => {
      try {
        const frame = JSON.parse(String(event.payload));
        if (frame.type === 'AUTH_OK') proof.authenticated = true;
        if (frame.type === 'AUTH_FAIL') errors.push(name + ': WebSocket authentication failed');
        const title = frame.data?.noticeTitle || frame.data?.title;
        proof.frames.push({ type: frame.type, title, authenticated: proof.authenticated, receivedAt: new Date().toISOString() });
      } catch (error) { errors.push(name + ': unreadable WebSocket frame: ' + error.message); }
    });
  });
  await page.goto(entry(route));
  await page.getByRole('heading', { name: mobile ? '消息通知' : '我的消息', exact: true }).waitFor();
  await page.waitForLoadState('networkidle');
  await until(() => sockets.some(socket => socket.name === name && socket.authenticated), name + ' real AUTH_OK');
  check(sockets.some(socket => socket.name === name && socket.authenticated), name + ': formal application receives real AUTH_OK');
  check(sockets.filter(socket => socket.name === name).every(socket => socket.path === '/ws/notifications'
    && socket.queryKeys.length === 0), name + ': formal WebSocket URL contains no credentials');
  return { context, page, name };
}
const frameCount = (name, title) => sockets.filter(socket => socket.name === name)
  .flatMap(socket => socket.frames).filter(frame => frame.title === title && frame.authenticated).length;
async function shoot(page, name) {
  await page.screenshot({ path: path.join(output, name + '.jpg'), type: 'jpeg' });
  screenshots.push(name + '.jpg');
}
async function publish(context, label) {
  const title = input.prefix + '-' + label;
  const content = '真实应用实时消息正文 ' + label;
  const cookies = await context.cookies(entry('/'));
  const csrf = cookies.find(cookie => cookie.name === 'XSRF-TOKEN');
  check(Boolean(csrf?.value), label + ': actual administrator CSRF cookie present');
  const data = await document(context, '/api/oa/announcement/publish', { method: 'POST',
    headers: { 'X-CSRF-Token': decodeURIComponent(csrf.value) },
    data: { title, content, type: '2', priority: 'H', isTop: 0, scopeType: 'ALL' } });
  check(data === true, label + ': authenticated real announcement publication succeeds');
  const listing = await document(context, '/api/oa/announcement/manage-list?pageNum=1&pageSize=100&title=' + encodeURIComponent(title));
  const rows = listing.list.filter(row => row.title === title);
  check(rows.length === 1 && rows[0].status === '1', label + ': one actual published business record');
  const publication = { title, content, id: String(rows[0].announcementId), scope: 'ALL' };
  publications.push(publication);
  return publication;
}
async function desktopRead(page, publication, baseline) {
  const center = page.getByRole('dialog', { name: '消息中心', exact: true });
  const read = page.waitForResponse(response => new URL(response.url()).pathname === minePath + '/read'
    && response.request().method() === 'PUT');
  await center.getByRole('heading', { name: publication.title, exact: true }).click();
  const response = await read;
  check(response.status() === 200 && (await response.json()).code === 200,
    publication.title + ': formal desktop detail read persists through authenticated PUT');
  const detail = page.getByRole('dialog', { name: '通知详情', exact: true });
  await detail.waitFor();
  const content = await detail.innerText();
  check(content.includes(publication.title) && content.includes(publication.content),
    publication.title + ': formal desktop detail title and content visible');
  await detail.getByRole('button', { name: '返回消息列表', exact: true }).click();
  await center.waitFor();
  await center.getByText('未读消息 ' + baseline + ' 条', { exact: true }).waitFor();
  check(true, publication.title + ': formal desktop center unread count returns to baseline');
  await page.waitForLoadState('networkidle');
}
try {
  await build(config);
  server = await preview({ ...config, preview: { host: '127.0.0.1', port: 0, open: false, proxy: {
    '/api/auth': { target: input.authBase, changeOrigin: true, rewrite: value => value.replace(/^\/api\/auth/, '') },
    '/api/oa': { target: input.oaBase, changeOrigin: true, rewrite: value => value.replace(/^\/api\/oa/, '') },
    '/api/workflow': { target: input.workflowBase, changeOrigin: true, rewrite: value => value.replace(/^\/api\/workflow/, '') },
    '/ws': { target: input.workflowBase, changeOrigin: true, ws: true },
  } } });
  browser = await chromium.launch({ headless: true,
    ...(process.env.CLOUDFLOW_CHROMIUM_EXECUTABLE ? { executablePath: process.env.CLOUDFLOW_CHROMIUM_EXECUTABLE } : {}) });
  browserVersion = browser.version();
  const admin = await browser.newContext();
  await admin.addCookies(input.sessions.admin);
  const desktop = await open('desktop', 'other', '/message/mine');
  const mobile = await open('mobile', 'other', '/messages', true);
  const tenant = await open('tenant', 'tenant', '/message/mine');
  check(await mobile.page.evaluate(() => navigator.maxTouchPoints > 0 && /Android/.test(navigator.userAgent)),
    'mobile: real mobile browser context uses touch and Android user agent');
  const baseline = Number((await document(desktop.context, minePath + '/unread-count')).TOTAL);
  const tenantBaseline = Number((await document(tenant.context, minePath + '/unread-count')).TOTAL);
  const bell = desktop.page.getByRole('button', { name: '消息中心', exact: true });
  for (const [index, label] of ['closed', 'open', 'reload'].entries()) {
    if (label === 'reload') {
      const previous = sockets.filter(socket => socket.name === 'desktop' && socket.authenticated).length;
      await desktop.page.waitForLoadState('networkidle');
      await desktop.page.reload();
      await desktop.page.getByRole('heading', { name: '我的消息', exact: true }).waitFor();
      await desktop.page.waitForLoadState('networkidle');
      await until(() => sockets.filter(socket => socket.name === 'desktop' && socket.authenticated).length > previous,
        'reload Cookie authentication');
      check(true, 'reload: full document reload receives new real Cookie-authenticated AUTH_OK');
    }
    check(await desktop.page.getByRole('dialog', { name: '消息中心', exact: true }).isVisible() === (label === 'open'),
      label + ': actual message center visibility matches tested state');
    const publication = await publish(admin, label);
    for (const receiver of [desktop, mobile]) {
      await until(() => frameCount(receiver.name, publication.title) >= 1, receiver.name + ' authenticated business frame');
      check(frameCount(receiver.name, publication.title) === 1, label + ': ' + receiver.name + ' receives one real authenticated message');
      const toast = receiver.page.locator('.cf-toast').filter({ hasText: publication.title });
      await toast.waitFor();
      check(await toast.isVisible(), label + ': ' + receiver.name + ' formal push toast visible');
    }
    await desktop.page.locator('tbody tr').filter({ hasText: publication.title }).waitFor();
    await mobile.page.getByRole('heading', { name: publication.title, exact: true }).waitFor();
    check(await desktop.page.locator('tbody tr').filter({ hasText: publication.title }).count() === 1,
      label + ': desktop personal list refreshes automatically with unique message');
    check(await mobile.page.getByRole('heading', { name: publication.title, exact: true }).count() === 1,
      label + ': mobile personal list refreshes automatically with unique message');
    await until(async () => Number((await document(desktop.context, minePath + '/unread-count')).TOTAL) === baseline + 1,
      'desktop exact backend unread count');
    await bell.locator('.notification-dot').waitFor({ state: 'visible' });
    check(true, label + ': formal header unread dot visible while center is ' + (label === 'open' ? 'open' : 'closed'));
    if (label !== 'open') await bell.click();
    const center = desktop.page.getByRole('dialog', { name: '消息中心', exact: true });
    await center.getByText('未读消息 ' + (baseline + 1) + ' 条', { exact: true }).waitFor();
    check(true, label + ': formal center exact unread count matches real backend');
    await center.getByRole('heading', { name: publication.title, exact: true }).waitFor();
    check(await center.getByRole('heading', { name: publication.title, exact: true }).count() === 1,
      label + ': unified announcement and message center deduplicates publication');
    if (index === 1) await shoot(desktop.page, 'desktop-live-center');
    if (label === 'reload') {
      await shoot(mobile.page, 'mobile-live-list');
      const read = mobile.page.waitForResponse(response => new URL(response.url()).pathname === minePath + '/read'
        && response.request().method() === 'PUT');
      await mobile.page.getByRole('heading', { name: publication.title, exact: true }).click();
      check((await (await read).json()).code === 200, 'mobile: actual detail read persists through authenticated PUT');
      await mobile.page.getByRole('heading', { name: '消息详情', exact: true }).waitFor();
      check((await mobile.page.locator('body').innerText()).includes(publication.content), 'mobile: actual message detail content visible');
      await mobile.page.getByText('公告', { exact: true }).waitFor();
      check(await mobile.page.getByText('ANNOUNCEMENT', { exact: true }).count() === 0,
        'mobile: real announcement detail uses shared Chinese category label');
      await shoot(mobile.page, 'mobile-live-detail');
      await mobile.page.getByRole('button', { name: '返回', exact: true }).click();
      await mobile.page.getByRole('heading', { name: '消息通知', exact: true }).waitFor();
    } else {
      await desktopRead(desktop.page, publication, baseline);
    }
    await until(async () => Number((await document(desktop.context, minePath + '/unread-count')).TOTAL) === baseline,
      'read returns actual unread count to baseline');
    check(true, label + ': actual backend unread count returns to baseline');
    await tenant.page.waitForLoadState('networkidle');
    check(frameCount('tenant', publication.title) === 0, label + ': different tenant receives no live message frame');
    check(await tenant.page.getByText(publication.title, { exact: true }).count() === 0,
      label + ': different tenant page exposes no publication');
    check(Number((await document(tenant.context, minePath + '/unread-count')).TOTAL) === tenantBaseline,
      label + ': different tenant unread count unchanged');
  }
  const final = await document(desktop.context, minePath + '?pageNum=1&pageSize=100');
  for (const publication of publications) {
    const rows = final.rows.filter(row => String(row.bizId) === publication.id && row.bizType === 'OA_ANNOUNCEMENT');
    check(rows.length === 1 && rows[0].readFlag === 1 && rows[0].title === publication.title,
      publication.title + ': final HTTP reread confirms unique read business message');
    check(frameCount('desktop', publication.title) === 1 && frameCount('mobile', publication.title) === 1,
      publication.title + ': final live frame counts remain exactly once on both devices');
  }
  check(requests.some(request => request.path === '/api/auth/info') && requests.some(request => request.path === minePath),
    'formal application bootstraps real identity and personal message HTTP');
  check(files.every(file => hash(file) === sourceHashes[file]), 'all formal application source input hashes unchanged');
  check(errors.length === 0, 'no browser runtime or API transport errors');
  for (const receiver of [desktop, mobile, tenant]) await receiver.page.waitForLoadState('networkidle');
  await admin.close();
} catch (error) {
  failure = { name: error.name, message: error.message, stack: error.stack };
  console.error(error.stack);
} finally {
  if (browser) await browser.close();
  if (server) await server.close();
  writeFileSync(path.join(output, 'result.json'), JSON.stringify({ passed: !failure, assertions: checks.length,
    checks, failure, errors, requests, completedProbeCancellations, sockets, publications, screenshots, browserVersion, sourceHashes,
    backend: 'formal index.html application; real authenticated HTTP and WebSocket; no route or transport mocks',
    liveWebSocketBrowserCovered: !failure && publications.length === 3, globalComplete: false }, null, 2));
}
if (failure) process.exitCode = 1;
