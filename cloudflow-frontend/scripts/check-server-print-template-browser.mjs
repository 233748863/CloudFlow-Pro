// Missing template management checks only. Cookies and upload/output bytes stay in memory.
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
const errors = [];
const exceptions = [];
let page;
const report = (kind, value) => console.log(kind, JSON.stringify(value));
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 850 } });
  await context.addCookies(settings.cookies);
  page = await context.newPage();
  page.on('pageerror', error => exceptions.push(error.message.slice(0, 200)));
  page.on('response', response => {
    const pathname = new URL(response.url()).pathname;
    if (pathname.startsWith('/api/') && response.status() >= 400) errors.push(`${response.status()} ${pathname}`);
  });
  await page.goto(settings.entry + '/system/print/template', { waitUntil: 'networkidle', timeout: 25000 });
  assert(!new URL(page.url()).pathname.startsWith('/login'), 'A normal active session is required');
  assert.equal(await page.getByRole('dialog', { name: '首次登录需修改密码', exact: true }).count(), 0);
  const field = (scope, label) => scope.locator('label.admin-dialog-field')
    .filter({ has: page.getByText(label, { exact: true }) });
  const choose = async (scope, label, option) => {
    await field(scope, label).getByRole('button').click();
    await page.getByRole('option', { name: option, exact: true }).click();
  };
  const templatePath = '/api/auth/system/print/template';
  const successful = async response => {
    assert.equal(response.status(), 200);
    const body = await response.json();
    assert.equal(body.code, 200, body.msg);
    return body.data;
  };
  let templateId = settings.templateId;
  if (!templateId) {
    await page.getByRole('button', { name: '新增模板', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: '新增打印模板', exact: true });
    await field(dialog, '模板名称').locator('input').fill(settings.templateName);
    await field(dialog, '模板编码').locator('input').fill(settings.templateCode);
    await field(dialog, '业务类型').locator('input').fill('PURCHASE_ORDER');
    await choose(dialog, '模板格式', 'Excel');
    await field(dialog, '导入模板文件').locator('input').setInputFiles({
      name: 'purchase-template.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      buffer: Buffer.from(settings.upload, 'base64'),
    });
    const [response] = await Promise.all([
      page.waitForResponse(response => new URL(response.url()).pathname === templatePath
        && response.request().method() === 'POST'),
      dialog.getByRole('button', { name: '保存模板', exact: true }).click(),
    ]);
    const saved = await successful(response);
    templateId = saved.templateId;
    report('TEMPLATE_CREATED', { templateId, templateCode: saved.templateCode,
      format: saved.templateFormat, output: saved.outputFormat, version: saved.version });
    await dialog.waitFor({ state: 'hidden' });
  }
  await field(page, '模板编码').locator('input').fill(settings.templateCode);
  const [listed] = await Promise.all([
    page.waitForResponse(response => {
      const url = new URL(response.url());
      return url.pathname === templatePath + '/list' && url.searchParams.get('templateCode') === settings.templateCode;
    }),
    page.getByRole('button', { name: '查询', exact: true }).click(),
  ]);
  assert.equal((await successful(listed)).total, 1);
  const row = page.getByRole('row').filter({ has: page.getByText(settings.templateCode, { exact: true }) });
  if (!settings.recordsOnly) {
  if (!settings.sourceViewed) {
  await row.getByRole('button', { name: '查看模板', exact: true }).click();
  const viewed = page.getByRole('dialog', { name: '查看打印模板', exact: true });
  assert.equal(await field(viewed, '模板编码').locator('input').inputValue(), settings.templateCode);
  const [source] = await Promise.all([
    page.waitForResponse(response => new URL(response.url()).pathname === `${templatePath}/${templateId}/file`),
    viewed.getByRole('button', { name: '下载已保存模板', exact: true }).click(),
  ]);
  assert.equal(source.status(), 200);
  assert.equal(Buffer.compare(await source.body(), Buffer.from(settings.upload, 'base64')), 0);
  await viewed.getByRole('button', { name: '关闭', exact: true }).click();
  report('TEMPLATE_VIEWED', { templateId, uploadedSourceIdentical: true });
  }
  if (!settings.edited) {
    await row.getByRole('button', { name: '编辑模板', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: '编辑打印模板', exact: true });
    await field(dialog, '备注').locator('textarea').fill(settings.templateCode + ' 页面编辑已核对');
    const [response] = await Promise.all([
      page.waitForResponse(response => new URL(response.url()).pathname === templatePath
        && response.request().method() === 'PUT'),
      dialog.getByRole('button', { name: '保存模板', exact: true }).click(),
    ]);
    const saved = await successful(response);
    report('TEMPLATE_EDITED', { templateId, version: saved.version, remark: saved.remark });
    await dialog.waitFor({ state: 'hidden' });
  }
  if (!settings.previewed) {
    await row.getByRole('button', { name: '示例预览', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: `示例预览 · ${settings.templateName}`, exact: true });
    await dialog.locator('label').filter({ has: page.getByText('示例数据（JSON 对象）', { exact: true }) })
      .locator('textarea').fill(JSON.stringify(settings.sample));
    const [response] = await Promise.all([
      page.waitForResponse(response => new URL(response.url()).pathname === `${templatePath}/${templateId}/preview`),
      dialog.getByRole('button', { name: '生成预览', exact: true }).click(),
    ]);
    assert.equal(response.status(), 200);
    assert.match(response.headers()['cache-control'] || '', /no-store/);
    assert.equal(new URL(response.url()).searchParams.get('outputFormat'), 'EXCEL');
    const bytes = await response.body();
    assert.equal(bytes.subarray(0, 2).toString(), 'PK');
    await dialog.getByText('Excel 已生成，可下载检查；选择 PDF 可在线预览。', { exact: true }).waitFor();
    const downloaded = page.waitForEvent('download');
    await dialog.getByRole('button', { name: '下载示例', exact: true }).click();
    const file = await downloaded;
    assert.match(file.suggestedFilename(), /\.xlsx$/);
    report('TEMPLATE_PREVIEWED', { templateId, bytes: bytes.length, format: 'EXCEL', noStore: true,
      downloadButton: true, workbook: bytes.toString('base64') });
    await dialog.getByRole('button', { name: '关闭', exact: true }).click();
  }
  }
  if (settings.record) {
    await page.getByRole('button', { name: '打印记录', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: '打印记录', exact: true });
    await choose(dialog, '业务类型', '采购单');
    await field(dialog, '业务记录 ID').locator('input').fill(String(settings.record.bizId));
    await field(dialog, '操作人 ID').locator('input').fill(String(settings.record.operatorId));
    const [response] = await Promise.all([
      page.waitForResponse(response => {
        const url = new URL(response.url());
        return url.pathname === '/api/auth/system/print/record/list'
          && url.searchParams.get('bizId') === String(settings.record.bizId)
          && url.searchParams.get('operatorId') === String(settings.record.operatorId);
      }),
      dialog.getByRole('button', { name: '查询', exact: true }).click(),
    ]);
    const records = await successful(response);
    assert(records.total >= 1);
    const actual = records.rows.find(record => record.recordId === settings.record.recordId);
    assert(actual && actual.templateCode === settings.templateCode && actual.outputFormat === 'EXCEL');
    const printed = dialog.getByRole('row').filter({ has: page.getByText(settings.templateCode, { exact: true }) });
    await printed.waitFor();
    const text = await printed.innerText();
    assert(text.includes('Excel') && text.includes(`ID: ${settings.record.operatorId}`)
      && text.includes(Number(settings.record.bytes).toLocaleString('en-US')));
    report('TEMPLATE_RECORDS', { templateId, recordId: actual.recordId, bizType: actual.bizType,
      bizId: actual.bizId, operatorId: actual.operatorId, fileSize: actual.fileSize, filtered: true });
  }
  assert.equal(errors.length, 0, 'No failed HTTP responses in the selected page scope');
  assert.equal(exceptions.length, 0, 'No uncaught page errors');
  report('TEMPLATE_PAGE_PASS', { templateId, width: 1440 });
  await context.close();
} catch (error) {
  console.error('TEMPLATE_PAGE_FAILURE', String(error.message).slice(0, 700));
  if (page) console.error('TEMPLATE_DIALOGS', JSON.stringify(await page.getByRole('dialog').allTextContents().catch(() => [])));
  process.exitCode = 1;
} finally {
  report('TEMPLATE_HTTP_ERRORS', errors);
  report('TEMPLATE_EXCEPTIONS', exceptions);
  await browser.close();
}
