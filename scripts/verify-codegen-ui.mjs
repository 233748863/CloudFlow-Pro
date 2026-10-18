import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const workspace = await fs.realpath(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'));
const evidence = await fs.realpath(process.argv[2]);
const evidenceParent = await fs.realpath(path.join(workspace, '.cloudflow-runtime/codegen-db-checks'));
assert.equal(path.dirname(evidence), evidenceParent, 'verification directory stays inside the owned parent');
assert.match(path.basename(evidence), /^[a-f0-9]{32}$/);
const frontend = path.join(workspace, 'cloudflow-frontend');
const requireFrontend = createRequire(path.join(frontend, 'package.json'));
const requireBrowser = createRequire(path.join(process.env.CLOUDFLOW_PLAYWRIGHT_HOME || path.join(workspace, '.cloudflow-runtime/playwright'), 'package.json'));
const { createServer } = await import(pathToFileURL(requireFrontend.resolve('vite')).href);
const { chromium } = requireBrowser('playwright-core');
const verificationKey = randomBytes(32).toString('hex');
const assertions = [];
const failures = [];
const apiCalls = [];
const browserErrors = [];
const blockedRequests = [];
let backendOutput = '';
let browser;
let server;
let activePage;
let coverage;
const check = (name, condition) => {
  assertions.push({ name, passed: Boolean(condition) });
  if (!condition) failures.push(name);
};
const bounded = async (promise, milliseconds, message) => {
  let timer;
  try {
    return await Promise.race([promise, new Promise((unusedResolve, reject) => {
      timer = setTimeout(() => reject(new Error(message)), milliseconds);
    })]);
  } finally { clearTimeout(timer); }
};
const child = spawn('java', [`@${path.join(evidence, 'run.args')}`, 'browser'], {
  cwd: workspace,
  env: { ...process.env, A1_CODEGEN_BROWSER_KEY: verificationKey },
  windowsHide: true,
  stdio: ['pipe', 'pipe', 'pipe'],
});
const exited = new Promise((resolve) => {
  child.once('error', (error) => resolve({ code: -1, error: error.message }));
  child.once('close', (code, signal) => resolve({ code, signal }));
});
child.stdin.on('error', (error) => { if (error.code !== 'EPIPE') failures.push(`backend stdin: ${error.message}`); });
child.stdout.setEncoding('utf8');
child.stderr.setEncoding('utf8');
child.stdout.on('data', (text) => { backendOutput += text; });
child.stderr.on('data', (text) => { backendOutput += text; });
const ready = new Promise((resolve) => child.stdout.on('data', () => {
  const match = backendOutput.match(/CODEGEN_BROWSER_BASE=(http:\/\/127\.0\.0\.1:\d+\/system\/codegen)/);
  if (match) resolve(match[1]);
}));
const fixturePermissions = ['list', 'preview', 'import', 'edit', 'generate', 'remove'].map((action) => `system:codegen:${action}`);
const fixturePlugin = {
  name: 'owned-codegen-browser-identity',
  enforce: 'pre',
  transform(source, identifier) {
    if (!identifier.replaceAll('\\', '/').endsWith('/src/context/AuthContext.tsx')) return;
    return `export const AuthProvider = ({ children }) => children;
      export const useAuth = () => {
        const readOnly = new URLSearchParams(location.search).get('role') === 'readonly';
        const permissions = readOnly ? ['system:codegen:list', 'system:codegen:preview'] : ${JSON.stringify(fixturePermissions)};
        return { user: { id: 1, tenantId: 100000, role: 'EMPLOYEE', permissions }, loading: false,
          hasPermission: (required, all = false) => all ? required.every(permission => permissions.includes(permission)) : required.some(permission => permissions.includes(permission)) };
      };`;
  },
  configureServer(vite) {
    vite.middlewares.use((request, response, next) => {
      if (!request.url?.startsWith('/api/')) return next();
      response.statusCode = 403;
      response.end('Unrouted API request blocked by the verification server');
    });
  },
};
const apiPath = '/api/auth/system/codegen';
const invoke = async (page, suffix, method, action) => {
  const responsePromise = page.waitForResponse((response) => {
    const request = response.request();
    return new URL(response.url()).pathname === apiPath + suffix && request.method() === method;
  });
  await action();
  const response = await responsePromise;
  const payload = await response.json();
  assert.equal(response.status(), 200, `${method} ${suffix} transport`);
  assert.equal(payload.code, 200, `${method} ${suffix}: ${payload.msg}`);
  return payload.data;
};
const projectFile = (relative) => {
  const project = path.join(evidence, 'browser-project');
  const resolved = path.resolve(project, relative);
  assert.ok(!path.isAbsolute(relative) && resolved.startsWith(project + path.sep), 'only owned project files are touched');
  return resolved;
};

try {
  const backendBase = await bounded(Promise.race([ready, exited.then((result) => {
    throw new Error(`isolated backend exited before readiness: ${JSON.stringify(result)}`);
  })]), 60000, 'isolated backend startup timed out');
  const denied = await fetch(`${backendBase}/options`);
  check('临时接口拒绝缺少本轮随机验证密钥的请求', denied.status === 403);
  server = await createServer({
    root: frontend,
    configFile: path.join(frontend, 'vite.config.ts'),
    logLevel: 'error',
    define: { 'import.meta.env.VITE_API_BASE_URL': JSON.stringify('/api') },
    plugins: [fixturePlugin],
    resolve: { dedupe: ['react', 'react-dom', 'react-router-dom', '@tanstack/react-query'] },
    server: { host: '127.0.0.1', port: 0, strictPort: false, hmr: false, fs: { allow: [workspace] } },
  });
  await server.listen();
  const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' });
  context.setDefaultTimeout(20000);
  await context.routeWebSocket('**/*', (socket) => socket.close());
  await context.route('**/*', async (route) => {
    const request = route.request();
    const address = new URL(request.url());
    if (address.origin !== origin) {
      blockedRequests.push(`${request.method()} ${address.origin}${address.pathname}`);
      return route.abort();
    }
    if (address.pathname === apiPath || address.pathname.startsWith(apiPath + '/')) {
      try {
        const response = await route.fetch({
          url: backendBase + address.pathname.slice(apiPath.length) + address.search,
          headers: { ...request.headers(), 'X-A1-Verification-Key': verificationKey },
          timeout: 20000,
          maxRedirects: 0,
        });
        const body = await response.body();
        const json = response.headers()['content-type']?.includes('json') ? JSON.parse(body.toString('utf8')) : null;
        apiCalls.push({ method: request.method(), path: address.pathname, query: address.search, status: response.status(), request: request.postDataJSON(), response: json });
        return route.fulfill({ response, body });
      } catch (error) {
        browserErrors.push(`isolated API forwarding: ${error.message}`);
        return route.fulfill({ status: 502, json: { code: 502, msg: '隔离验证接口转发失败' } });
      }
    }
    if (request.method() === 'GET' && ['/api/auth/system/dict/type/optionselect', '/api/auth/system/menu/list'].includes(address.pathname)) {
      return route.fulfill({ json: { code: 200, msg: 'test query options only', data: [] } });
    }
    if (address.pathname.startsWith('/api/') || !['GET', 'HEAD'].includes(request.method())) {
      browserErrors.push(`unexpected request blocked: ${request.method()} ${address.pathname}`);
      return route.abort();
    }
    if (address.pathname === '/codegen-check') {
      const entry = `/@fs/${path.join(workspace, 'scripts/platform-checks/CodegenBrowserCheck.tsx').replaceAll('\\', '/')}`;
      return route.fulfill({ contentType: 'text/html', body: `<html lang="zh-CN"><head><meta name="viewport" content="width=device-width,initial-scale=1"><script type="module">import RefreshRuntime from '/@react-refresh';RefreshRuntime.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;window.__vite_plugin_react_preamble_installed__=true;</script></head><body style="color:var(--cf-text)"><div id="root"></div><script type="module" src="${entry}"></script></body></html>` });
    }
    return route.continue();
  });
  activePage = await context.newPage();
  activePage.on('pageerror', (error) => browserErrors.push(error.message));
  const page = activePage;
  await page.goto(`${origin}/codegen-check`, { waitUntil: 'networkidle' });
  const importButton = page.getByRole('button', { name: '导入表结构', exact: true });
  await importButton.waitFor();
  await importButton.click();
  let dialog = page.getByRole('dialog', { name: '导入数据库表结构', exact: true });
  await dialog.getByLabel('导入 oa_supplier', { exact: true }).waitFor();
  await dialog.getByLabel('数据库表名', { exact: true }).fill('oa_supplier');
  const databaseTables = await invoke(page, '/db/list', 'GET', () => dialog.getByRole('button', { name: '查询表', exact: true }).click());
  check('真实数据库表查询只返回供应商表', databaseTables.total === 1 && databaseTables.rows[0].tableName === 'oa_supplier');
  await dialog.locator('form button[aria-haspopup="listbox"]').click();
  await page.getByRole('option', { name: 'oa', exact: true }).click();
  await dialog.getByLabel('导入 oa_supplier', { exact: true }).check();
  await invoke(page, '/import', 'POST', () => dialog.getByRole('button', { name: '导入所选（1）', exact: true }).click());
  await dialog.waitFor({ state: 'detached' });
  const tableRow = page.getByRole('row').filter({ hasText: 'oa_supplier' });
  await tableRow.waitFor();
  check('真实导入后的供应商配置出现在列表', await tableRow.getByRole('cell', { name: 'oa', exact: true }).count() === 1);
  await tableRow.getByRole('button', { name: '配置', exact: true }).click();
  dialog = page.getByRole('dialog', { name: '生成配置：oa_supplier', exact: true });
  await dialog.getByRole('tab', { name: '字段配置（49）', exact: true }).click();
  await dialog.getByLabel('supplier_name代码字段名', { exact: true }).fill('browserSupplierName');
  await dialog.getByLabel('supplier_name显示名称', { exact: true }).fill('页面验证供应商名称');
  await invoke(page, '', 'PUT', () => dialog.getByRole('button', { name: '保存配置', exact: true }).click());
  await dialog.waitFor({ state: 'detached' });
  await tableRow.getByRole('button', { name: '同步', exact: true }).click();
  dialog = page.getByRole('dialog', { name: '同步数据库表结构', exact: true });
  const importedId = apiCalls.find((entry) => entry.method === 'PUT' && entry.path === apiPath).request.table.tableId;
  await invoke(page, `/${importedId}/sync`, 'POST', () => dialog.getByRole('button', { name: '确认', exact: true }).click());
  await tableRow.getByRole('button', { name: '配置', exact: true }).click();
  dialog = page.getByRole('dialog', { name: '生成配置：oa_supplier', exact: true });
  await dialog.getByRole('tab', { name: '字段配置（49）', exact: true }).click();
  check('页面保存后真实同步保留自定义代码字段名', await dialog.getByLabel('supplier_name代码字段名', { exact: true }).inputValue() === 'browserSupplierName');
  check('页面保存后真实同步保留自定义显示名称', await dialog.getByLabel('supplier_name显示名称', { exact: true }).inputValue() === '页面验证供应商名称');
  await dialog.getByRole('button', { name: '取消', exact: true }).click();
  const preview = await invoke(page, `/${importedId}/preview`, 'GET', () => tableRow.getByRole('button', { name: '预览与产出', exact: true }).click());
  const files = Object.keys(preview);
  assert.equal(files.length, 7, 'real preview contains seven files');
  const previewDialog = page.getByRole('dialog', { name: '生成代码：oa_supplier', exact: true });
  await previewDialog.waitFor();
  check('页面真实预览包含自定义字段映射', Object.values(preview).some((source) => source.includes('browserSupplierName') && source.includes('@TableField("supplier_name")')));
  const existingFile = `generated/${files[0]}`;
  const oldContents = `A1_BROWSER_OWNED_OLD_CONTENT:${path.basename(evidence)}`;
  await fs.mkdir(path.dirname(projectFile(existingFile)), { recursive: true });
  await fs.writeFile(projectFile(existingFile), oldContents);
  const writeCalls = () => apiCalls.filter((entry) => entry.path.endsWith('/write'));
  await previewDialog.getByRole('button', { name: '安全写入', exact: true }).click();
  dialog = page.getByRole('dialog', { name: '写入生成代码', exact: true });
  await dialog.getByRole('button', { name: '取消', exact: true }).click();
  check('取消首次写入不发送写请求且旧文件不变', writeCalls().length === 0 && await fs.readFile(projectFile(existingFile), 'utf8') === oldContents);
  await previewDialog.getByRole('button', { name: '安全写入', exact: true }).click();
  dialog = page.getByRole('dialog', { name: '写入生成代码', exact: true });
  const safeResult = await invoke(page, `/${importedId}/write`, 'POST', () => dialog.getByRole('button', { name: '确认', exact: true }).click());
  check('真实安全写入新增六个跳过一个且没有覆盖', safeResult.written.length === 6 && safeResult.skipped.length === 1 && safeResult.overwritten.length === 0);
  check('首次跳过文件保留原始内容', await fs.readFile(projectFile(existingFile), 'utf8') === oldContents);
  await previewDialog.getByRole('button', { name: '确认覆盖已存在文件', exact: true }).waitFor();
  const listed = await previewDialog.getByRole('status').locator('li').allTextContents();
  await previewDialog.getByRole('button', { name: '确认覆盖已存在文件', exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(evidence, 'safe-write-result.png'), fullPage: true });
  for (const [theme, width] of [['light', 375], ['dark', 375], ['light', 1440]]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.evaluate((value) => document.documentElement.classList.toggle('dark', value === 'dark'), theme);
    await previewDialog.getByRole('button', { name: '确认覆盖已存在文件', exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(evidence, `overwrite-list-${theme}-${width}.png`), fullPage: true });
    check(`覆盖清单在${theme}/${width}没有页面级横向溢出`, await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  }
  await previewDialog.getByRole('button', { name: '确认覆盖已存在文件', exact: true }).click();
  dialog = page.getByRole('dialog', { name: '覆盖确认', exact: true });
  const approvalText = await dialog.innerText();
  const approvedCount = Number(approvalText.match(/将覆盖刚才列出的 (\d+) 个现有文件/)?.[1]);
  check('二次确认未勾选前禁用确认按钮', await dialog.getByRole('button', { name: '确认', exact: true }).isDisabled());
  await page.screenshot({ path: path.join(evidence, 'overwrite-confirmation.png'), fullPage: true });
  await dialog.getByRole('checkbox', { name: '我已核对文件清单，确认覆盖', exact: true }).check();
  await dialog.getByRole('button', { name: '取消', exact: true }).click();
  check('取消覆盖不会发出第二个写请求', writeCalls().length === 1);
  await previewDialog.getByRole('button', { name: '确认覆盖已存在文件', exact: true }).click();
  dialog = page.getByRole('dialog', { name: '覆盖确认', exact: true });
  check('重新打开覆盖弹窗仍需主动勾选', await dialog.getByRole('button', { name: '确认', exact: true }).isDisabled());
  await dialog.getByRole('checkbox', { name: '我已核对文件清单，确认覆盖', exact: true }).check();
  const overwritten = await invoke(page, `/${importedId}/write`, 'POST', () => dialog.getByRole('button', { name: '确认', exact: true }).click());
  coverage = { preview: files.length, listed: listed.length, approved: approvedCount, actualOverwritten: overwritten.overwritten.length,
    listedFiles: listed, actualOverwrittenFiles: overwritten.overwritten, approvalText };
  check('覆盖批准数量等于真实后端覆盖数量', approvedCount === overwritten.overwritten.length);
  check('覆盖批准清单与真实后端覆盖文件集合相同', JSON.stringify([...listed].sort()) === JSON.stringify([...overwritten.overwritten].sort()));
  check('覆盖请求只传递现有接口的目录与二次确认字段', writeCalls().every((entry) => Object.keys(entry.request).sort().join(',') === 'confirmOverwrite,targetRoot') && writeCalls()[1].request.confirmOverwrite === true);
  for (const file of files) check(`真实写入内容与预览一致：${file}`, await fs.readFile(projectFile(`generated/${file}`), 'utf8') === preview[file]);
  console.log(`CODEGEN_UI_OVERWRITE_SCOPE: preview=${coverage.preview}; listed=${coverage.listed}; approved=${coverage.approved}; actual_overwritten=${coverage.actualOverwritten}; MATCH=${coverage.listed === coverage.actualOverwritten && coverage.approved === coverage.actualOverwritten}`);
  const directoryInput = previewDialog.getByLabel('写入目录', { exact: false });
  for (const invalidDirectory of ['', '../outside', 'C:\\Windows', '/tmp']) {
    await directoryInput.fill(invalidDirectory);
    await previewDialog.getByRole('button', { name: '安全写入', exact: true }).click();
    await page.getByText('请填写项目内的相对目录，禁止绝对路径或上级目录', { exact: true }).first().waitFor();
    check(`非法目录在页面拒绝且不发送请求：${invalidDirectory || '<empty>'}`, writeCalls().length === 2 && await page.getByRole('dialog', { name: '写入生成代码', exact: true }).count() === 0);
  }
  await directoryInput.fill('generated-again');
  check('修改写入目录清除上次结果及覆盖入口', await previewDialog.getByRole('status').count() === 0 && await previewDialog.getByRole('button', { name: '确认覆盖已存在文件', exact: true }).count() === 0);
  await previewDialog.getByRole('button', { name: '安全写入', exact: true }).click();
  dialog = page.getByRole('dialog', { name: '写入生成代码', exact: true });
  await dialog.getByRole('button', { name: '取消', exact: true }).click();
  check('切换目录后取消确认仍不写盘', writeCalls().length === 2 && !(await fs.stat(projectFile('generated-again')).catch(() => null)));
  const downloadPromise = page.waitForEvent('download');
  await previewDialog.getByRole('button', { name: '下载压缩包', exact: true }).click();
  const download = await downloadPromise;
  await download.saveAs(path.join(evidence, 'supplier-generated.zip'));
  const zip = await fs.readFile(path.join(evidence, 'supplier-generated.zip'));
  console.log(`CODEGEN_UI_DOWNLOAD: filename=${download.suggestedFilename()}; bytes=${zip.length}; magic=${zip.subarray(0, 4).toString('hex')}`);
  check('真实下载沿用后端文件名并返回ZIP内容', download.suggestedFilename() === 'oa_supplier-generated.zip' && zip.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04])));
  await page.goto(`${origin}/codegen-check?role=readonly`, { waitUntil: 'networkidle' });
  await tableRow.getByRole('button', { name: '预览与产出', exact: true }).waitFor();
  for (const label of ['导入表结构', '配置', '同步', '删除']) check(`只读权限替身不显示${label}入口`, await page.getByRole('button', { name: label, exact: true }).count() === 0);
  await invoke(page, `/${importedId}/preview`, 'GET', () => tableRow.getByRole('button', { name: '预览与产出', exact: true }).click());
  await previewDialog.waitFor();
  check('只读权限替身仍可读取真实生成预览', await previewDialog.getByLabel('生成代码内容', { exact: true }).isVisible());
  for (const label of ['下载压缩包', '安全写入', '确认覆盖已存在文件']) check(`只读权限替身不显示${label}`, await previewDialog.getByRole('button', { name: label, exact: true }).count() === 0);
  check('只读权限替身不显示写入目录', await previewDialog.getByLabel('写入目录', { exact: false }).count() === 0);
  check('页面没有未处理异常或未知API调用', browserErrors.length === 0);
  await page.screenshot({ path: path.join(evidence, 'readonly-preview.png'), fullPage: true });
} catch (error) {
  failures.push(error.stack || error.message);
  await activePage?.screenshot({ path: path.join(evidence, 'failure.png'), fullPage: true }).catch(() => {});
} finally {
  await browser?.close().catch((error) => failures.push(`browser close: ${error.message}`));
  await server?.close().catch((error) => failures.push(`Vite close: ${error.message}`));
  child.stdin.end();
  const result = await bounded(exited, 60000, 'isolated backend cleanup timed out').catch((error) => {
    failures.push(error.message);
    return { code: -1 };
  });
  check('本轮隔离HTTP服务正常结束', result.code === 0 && backendOutput.includes('CODEGEN_BROWSER_HTTP_CLOSED:'));
  check('独立数据库核验所有权后全部清理', backendOutput.includes('CODEGEN_DB_REMOVED: ownership_verified=true; remaining=0; runtime_writes=0'));
  await fs.writeFile(path.join(evidence, 'browser-backend.log'), backendOutput);
  await fs.writeFile(path.join(evidence, 'browser-api.json'), JSON.stringify(apiCalls, null, 2));
  await fs.writeFile(path.join(evidence, 'browser-results.json'), JSON.stringify({ assertions, failures, browserErrors, blockedRequests, coverage,
    limits: { identityFixture: true, dictionaryAndMenuOptionFixtures: true, productionAuthorizationTested: false, runtimeWrites: 0, runningServiceRestarts: 0 } }, null, 2));
}
console.log(`CODEGEN_BROWSER_ASSERTIONS: total=${assertions.length}; passed=${assertions.filter((entry) => entry.passed).length}; failed=${assertions.filter((entry) => !entry.passed).length}`);
console.log(`CODEGEN_BROWSER_API: real_codegen_requests=${apiCalls.length}; business_responses_mocked=0; auth_identity_fixture=true; query_option_fixtures=2; production_authorization_tested=false`);
console.log(`CODEGEN_BROWSER_EVIDENCE=${evidence}`);
for (const entry of assertions) console.log(`${entry.passed ? 'PASS' : 'FAIL'} ${entry.name}`);
for (const failure of failures) console.error(`CODEGEN_BROWSER_FAILURE: ${failure}`);
process.exitCode = failures.length ? 1 : 0;
