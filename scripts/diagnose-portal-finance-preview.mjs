import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { waitForShellLayout } from './portal-checks/wait-shell-layout.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const requireBrowser = createRequire(path.join(process.env.CLOUDFLOW_PLAYWRIGHT_HOME || path.join(root, '.cloudflow-runtime', 'playwright'), 'package.json'));
const { chromium } = requireBrowser('playwright-core');
const frontend = path.join(root, 'cloudflow-frontend');
const requireFrontend = createRequire(path.join(frontend, 'package.json'));
const { createServer } = await import(pathToFileURL(requireFrontend.resolve('vite')).href);
const server = await createServer({ root: frontend, configFile: path.join(frontend, 'vite.config.ts'), logLevel: 'error',
  server: { host: '127.0.0.1', port: 0, hmr: false, watch: null },
  plugins: [{ name: 'finance-diagnostic-no-backend', configureServer(instance) {
    instance.middlewares.use('/api', (_request, response) => { response.statusCode = 503; response.end('Diagnostic browser route required'); });
  } }],
});
await server.listen();
const address = server.httpServer.address();
assert.ok(address && typeof address === 'object');
const origin = `http://127.0.0.1:${address.port}`;
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6l2sAAAAASUVORK5CYII=', 'base64');
const record = { recordId: '1', kind: 'RECEIVABLE', number: 'PREVIEW_DIAGNOSTIC', plannedAmount: '12345.67', receivedAmount: '0.00', outstandingAmount: '12345.67', status: 'PLANNED', attachments: [{ fileId: '1', fileName: 'diagnostic.png', fileSize: png.length, extension: 'png' }] };
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ ignoreHTTPSErrors: true, serviceWorkers: 'block' });
const page = await context.newPage();
const paths = []; const errors = [];
let delayContent = false; let releaseContent; let contentStarted;
page.on('pageerror', error => errors.push(error.message));
await page.addInitScript(() => {
  sessionStorage.setItem('cloudflow.portal.session:diagnostic', JSON.stringify({ token: 'p_' + 'A'.repeat(43), expiresAt: Date.now() + 28800000 }));
  window.financePreviewEvents = [];
  for (const event of ['focus', 'blur']) window.addEventListener(event, () => window.financePreviewEvents.push({ event, time: performance.now() }));
  document.addEventListener('visibilitychange', () => window.financePreviewEvents.push({ event: document.visibilityState, time: performance.now() }));
});
await page.route(url => url.pathname.startsWith('/api/'), async route => {
  const url = new URL(route.request().url()); paths.push(url.pathname);
  let data;
  if (url.pathname.endsWith('/session')) data = { loginAccount: 'diagnostic', customerName: '诊断客户', contactName: '诊断联系人' };
  else if (url.pathname.endsWith('/receivable/list')) data = { rows: [record], total: 1, pageNum: 1, pageSize: 10 };
  else if (url.pathname.endsWith('/receivable/1')) data = record;
  else if (url.pathname.endsWith('/file/access')) data = { downloadTicket: 'ff_' + 'B'.repeat(43), expiresIn: 60 };
  else if (url.pathname.endsWith('/file/content')) {
    if (delayContent) { contentStarted(); await new Promise(resolve => { releaseContent = resolve; }); }
    return route.fulfill({ status: 200, contentType: 'image/png', body: png }).catch(() => {});
  }
  else return route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ code: 404, msg: '诊断未提供此响应' }) });
  return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ code: 200, data }) });
});
try {
  await page.goto(`${origin}/portal/diagnostic/finance`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: '查看详情与票据' }).click();
  const dialog = page.getByRole('dialog', { name: '财务记录详情' });
  await dialog.getByText('diagnostic.png', { exact: true }).waitFor();
  for (const width of [1440, 375, 320]) { await page.setViewportSize({ width, height: 1000 }); await waitForShellLayout(page); }
  await dialog.getByRole('button', { name: '预览', exact: true }).click();
  let visible = true;
  try { await dialog.getByRole('region', { name: '票据预览' }).getByRole('img').waitFor({ timeout: 5000 }); }
  catch { visible = false; }
  const state = await page.evaluate(() => ({ events: window.financePreviewEvents, images: [...document.images].map(item => ({ complete: item.complete, width: item.naturalWidth })), previewSections: document.querySelectorAll('[aria-label="票据预览"]').length, alerts: [...document.querySelectorAll('[role="alert"]')].map(item => item.textContent) }));
  console.log(JSON.stringify({ diagnosticOnly: true, businessHttp: false, visible, paths, errors, state }));
  assert.ok(visible, 'Controlled preview must be visible');
  await dialog.getByRole('button', { name: '关闭预览', exact: true }).click();
  delayContent = true;
  const pendingContent = new Promise(resolve => { contentStarted = resolve; });
  await dialog.getByRole('button', { name: '预览', exact: true }).click();
  await pendingContent;
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  delayContent = false; releaseContent();
  await dialog.getByText('diagnostic.png', { exact: true }).waitFor();
  assert.equal(await dialog.getByRole('region', { name: '票据预览' }).count(), 0, 'Revalidation must discard the interrupted preview');
  await dialog.getByRole('button', { name: '预览', exact: true }).click();
  await dialog.getByRole('region', { name: '票据预览' }).getByRole('img').waitFor();
  console.log('FINANCE_PREVIEW_DIAGNOSTIC: normal_preview=true; revalidation_cancels_pending=true; explicit_retry=true; business_http=false');
} catch (failure) {
  console.log(JSON.stringify({ diagnosticFailure: true, url: page.url(), paths, errors, body: (await page.locator('body').innerText()).slice(0, 1500) }));
  throw failure;
} finally { await browser.close(); await server.close(); }
