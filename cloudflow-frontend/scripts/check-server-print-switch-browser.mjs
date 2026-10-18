// Only the missing default-selection and two-template switching check.
// Session and PDFs remain in memory; no screenshots, traces or API stubs.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

let input = '';
for await (const chunk of process.stdin) input += chunk;
const settings = JSON.parse(input);
input = '';
const moduleFile = process.env.CLOUDFLOW_PLAYWRIGHT_MODULE
  || path.resolve('../.cloudflow-runtime/playwright/node_modules/playwright-core/index.mjs');
const { chromium } = await import(pathToFileURL(moduleFile).href);
const executablePath = process.env.CLOUDFLOW_CHROMIUM_EXECUTABLE || [1194, 1181]
  .map(version => path.join(process.env.LOCALAPPDATA, `ms-playwright/chromium-${version}/chrome-win/chrome.exe`))
  .find(file => fs.existsSync(file));
assert(executablePath, 'An existing Chromium is required');
const browser = await chromium.launch({ headless: true, executablePath });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 850 } });
  await context.addCookies(settings.cookies);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message.slice(0, 160)));
  page.on('response', response => {
    if (new URL(response.url()).pathname.startsWith('/api/') && response.status() >= 400)
      errors.push(String(response.status()) + ' ' + new URL(response.url()).pathname);
  });
  await page.goto(settings.entry + '/hr/ess/slips', { waitUntil: 'networkidle', timeout: 25000 });
  assert(!new URL(page.url()).pathname.startsWith('/login'));
  const row = page.getByRole('row').filter({ has: page.getByText('2026-10', { exact: true }) });
  await row.getByRole('button', { name: '查看工资单', exact: true }).click();
  const detail = page.getByRole('dialog', { name: '工资单 2026-10', exact: true });
  const prints = [];
  for (const switched of [false, true]) {
    await detail.getByRole('button', { name: '打印', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: '打印业务单据', exact: true });
    const select = dialog.getByRole('button', { name: '打印模板', exact: true });
    await select.getByText(settings.defaultName + '（默认）', { exact: true }).waitFor();
    if (switched) {
      await select.click();
      await page.getByRole('option', { name: settings.alternateName, exact: true }).click();
      await select.getByText(settings.alternateName, { exact: true }).waitFor();
    }
    const [response] = await Promise.all([
      page.waitForResponse(response => new URL(response.url()).pathname
        === '/api/auth/system/print/SALARY_SLIP/14749051' && response.request().method() === 'POST'),
      dialog.getByRole('button', { name: '生成并下载', exact: true }).click(),
    ]);
    const expectedCode = switched ? settings.alternateCode : settings.defaultCode;
    assert.equal(response.status(), 200);
    assert.equal(new URL(response.url()).searchParams.get('templateCode'), expectedCode);
    assert.match(response.headers()['cache-control'] || '', /no-store/);
    const bytes = await response.body();
    assert.equal(bytes.subarray(0, 5).toString(), '%PDF-');
    prints.push({ code: expectedCode, http: 200, bytes: bytes.length, defaultSelected: !switched,
      switched, pdf: bytes.toString('base64') });
    await dialog.waitFor({ state: 'hidden' });
  }
  assert.equal(errors.length, 0, JSON.stringify(errors));
  console.log(JSON.stringify({ prints, width: 1440, httpErrors: 0, pageErrors: 0 }));
  await context.close();
} catch (error) {
  console.error(String(error.message).slice(0, 700));
  process.exitCode = 1;
} finally {
  await browser.close();
}
