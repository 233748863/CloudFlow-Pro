import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import fs from 'node:fs/promises';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const frontend = path.join(root, 'cloudflow-frontend');
const output = path.join(root, '.cloudflow-runtime', 'batch-g-import-ui');
const requireFrontend = createRequire(path.join(frontend, 'package.json'));
const requireBrowser = createRequire(path.join(process.env.CLOUDFLOW_PLAYWRIGHT_HOME || path.join(root, '.cloudflow-runtime', 'playwright'), 'package.json'));
const { createServer } = await import(pathToFileURL(requireFrontend.resolve('vite')).href);
const { chromium } = requireBrowser('playwright-core');
const server = await createServer({ root: frontend, configFile: path.join(frontend, 'vite.config.ts'), logLevel: 'error', server: { host: '127.0.0.1', port: 4198, strictPort: true, fs: { allow: [root] } } });
const checks = [];
const errors = [];
const requests = [];
const check = (label, condition) => { assert.ok(condition, label); checks.push(label); };
const columns = [{ field: 'employeeNo', name: '员工编号', required: true }, { field: 'name', name: '姓名', required: true }];
const business = (bizType, bizName) => ({ bizType, bizName, maxRows: 10000, maxFileSize: 10485760, columns });
const definitions = { auth: [business('HOLIDAY', '节假日')], hr: [business('EMPLOYEE', '员工')], oa: [business('ASSET', '资产'), business('SUPPLIER', '供应商')], crm: [business('CUSTOMER', '客户')] };
const initialTask = () => ({ taskId: 701, taskNo: 'IMP_UI_CHECK', bizType: 'EMPLOYEE', bizName: '员工', fileName: '员工.csv', fileSize: 100, fileUrl: '/system/import/701/file', errorFileUrl: null, totalRows: 3, validRows: 0, invalidRows: 0, successRows: 0, failRows: 0, status: 'UPLOADED', operatorName: '界面校验', createTime: '2026-09-11 10:00:00' });
let task = initialTask();
let polls = 0;
let denied = false;
let unavailable = false;
let browser;
let page;

try {
  await fs.mkdir(output, { recursive: true });
  await server.listen();
  const origin = 'http://127.0.0.1:4198';
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' });
  await context.routeWebSocket('**/*', (socket) => socket.close());
  await context.route('**/*', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin !== origin) return route.abort();
    if (url.pathname === '/import-interface-check') {
      const entry = `/@fs/${path.join(root, 'scripts/platform-checks/ImportInterfaceCheck.tsx').replaceAll('\\', '/')}`;
      return route.fulfill({ contentType: 'text/html', body: `<html lang="zh-CN"><head><meta name="viewport" content="width=device-width,initial-scale=1"><script type="module">import RefreshRuntime from '/@react-refresh';RefreshRuntime.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;window.__vite_plugin_react_preamble_installed__=true;</script></head><body style="color:var(--cf-text)"><div id="root"></div><script type="module" src="${entry}"></script></body></html>` });
    }
    if (!url.pathname.startsWith('/api/')) return ['GET', 'HEAD'].includes(request.method()) ? route.continue() : route.abort();
    const respond = (data) => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ code: 200, data }) });
    requests.push({ path: url.pathname, query: url.search, method: request.method(), body: request.postData() });
    if (url.pathname === '/api/auth/info') return respond({ user: { userId: 1, tenantId: 100000, userName: 'ui-check', nickName: '界面检查' }, roles: ['USER'], permissions: denied ? ['system:import:list'] : ['system:import:list', 'system:import:execute', 'hr:employees:import'] });
    const matched = url.pathname.match(/^\/api\/(auth|hr|oa|crm)\/system\/import\/(.+)$/);
    if (!matched) return route.abort();
    const [, service, suffix] = matched;
    if (suffix === 'types') {
      if (service === 'hr' && unavailable) return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ code: 503, msg: '服务未就绪' }) });
      return respond(definitions[service]);
    }
    if (suffix === 'list') return respond({ rows: service === 'hr' ? [task] : [], total: service === 'hr' ? 1 : 0, pageNum: 1, pageSize: 20 });
    if (suffix.endsWith('/template')) return route.fulfill({ contentType: 'application/octet-stream', headers: { 'content-disposition': "attachment; filename*=UTF-8''%E5%91%98%E5%B7%A5%E6%A8%A1%E6%9D%BF.xlsx" }, body: await fs.readFile(path.join(root, '.cloudflow-runtime/batch-g-import-tests/template.xlsx')) });
    if (suffix.endsWith('/upload')) { task = initialTask(); return respond(task); }
    if (suffix === '701/validate') { task.status = 'VALIDATING'; polls = 0; return respond(task); }
    if (suffix === '701/execute') { assert.deepEqual(JSON.parse(request.postData()), { skipInvalidRows: true }); task.status = 'IMPORTING'; polls = 0; return respond(task); }
    if (suffix === '701/cancel') { task.status = 'CANCELLED'; return respond(task); }
    if (suffix === '701') {
      polls++;
      if (task.status === 'VALIDATING' && polls >= 2) Object.assign(task, { status: 'VALIDATED', validRows: 2, invalidRows: 1, errorFileUrl: '/system/import/701/errors/file' });
      if (task.status === 'IMPORTING' && polls >= 2) Object.assign(task, { status: 'PARTIAL', successRows: 2, failRows: 1 });
      return respond(task);
    }
    if (suffix === '701/preview') {
      const pageNum = Number(url.searchParams.get('pageNum') || 1);
      const hasErrors = task.invalidRows > 0;
      return respond({ task, rows: [{ rowNo: 2, values: { employeeNo: 'UI001', name: '界面示例' } }], errorCounts: hasErrors ? { REQUIRED: 21 } : {}, errors: { rows: hasErrors ? [{ errorId: pageNum, rowNo: pageNum === 1 ? 3 : 23, columnName: '姓名', cellValue: '', errorType: 'REQUIRED', errorMessage: pageNum === 1 ? '姓名不能为空' : '第二页错误' }] : [], total: hasErrors ? 21 : 0, pageNum, pageSize: 20 } });
    }
    if (suffix.endsWith('/file')) return route.fulfill({ contentType: 'text/plain; charset=utf-8', headers: { 'content-disposition': "attachment; filename*=UTF-8''%E9%94%99%E8%AF%AF.txt" }, body: '行号\t错误说明\n3\t姓名不能为空' });
    return route.abort();
  });
  page = await context.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`${origin}/import-interface-check`);
  await page.getByRole('button', { name: '批量导入', exact: true }).click();
  let panel = page.getByRole('dialog', { name: '员工导入', exact: true });
  await panel.getByText('选择或拖入导入文件').waitFor();
  check('按业务发现真实组件所需的服务前缀', requests.filter((request) => request.path.endsWith('/types')).length === 4);
  const templateDownload = page.waitForEvent('download');
  await panel.getByRole('button', { name: '下载模板', exact: true }).click();
  check('模板下载保留服务端中文文件名', (await templateDownload).suggestedFilename() === '员工模板.xlsx');
  check('员工模板只请求HR服务', requests.some((request) => request.path === '/api/hr/system/import/EMPLOYEE/template'));
  await panel.locator('input[type=file]').setInputFiles({ name: '过大.csv', mimeType: 'text/csv', buffer: Buffer.alloc(10485761) });
  await panel.getByRole('alert').filter({ hasText: '不能超过 10 MiB' }).waitFor();
  check('超限文件在上传前拦截', !requests.some((request) => request.path.endsWith('/upload')));
  await panel.locator('input[type=file]').setInputFiles({ name: '员工.csv', mimeType: 'text/csv', buffer: Buffer.from('员工编号,姓名\nUI001,界面示例\nUI002,\nUI003,另一示例') });
  await panel.getByRole('button', { name: '上传文件', exact: true }).click();
  await panel.getByRole('button', { name: '校验文件', exact: true }).waitFor();
  check('上传不自动执行业务写入', !requests.some((request) => request.path.endsWith('/execute')));
  await panel.getByRole('button', { name: '校验文件', exact: true }).click();
  await panel.getByText('关闭窗口后仍会继续', { exact: false }).waitFor();
  check('异步校验显示后台进度', true);
  await panel.getByText('姓名不能为空', { exact: true }).waitFor({ timeout: 15000 });
  check('错误预览显示中文字段与原行号', await panel.getByText('员工编号*', { exact: true }).count() === 1 && await panel.getByText('错误明细（21 条）', { exact: true }).count() === 1);
  check('默认禁止带错误直接导入', await panel.getByRole('button', { name: '确认导入', exact: true }).isDisabled());
  await panel.getByRole('button', { name: '下一页', exact: true }).click();
  await panel.getByText('第二页错误', { exact: true }).waitFor();
  check('错误明细分页读取对应页', requests.some((request) => request.path.endsWith('/preview') && request.query.includes('pageNum=2')));
  const errorDownload = page.waitForEvent('download');
  await panel.getByRole('button', { name: '下载错误文件', exact: true }).click();
  check('错误文件通过受保护任务接口下载', (await errorDownload).suggestedFilename() === '错误.txt');
  await panel.getByRole('checkbox').check();
  await panel.getByRole('button', { name: '确认导入', exact: true }).click();
  await page.getByRole('dialog', { name: '确认写入数据？', exact: true }).getByRole('button', { name: '取消', exact: true }).click();
  check('取消确认不提交导入', !requests.some((request) => request.path.endsWith('/execute')));
  await panel.getByRole('button', { name: '确认导入', exact: true }).click();
  await page.getByRole('dialog', { name: '确认写入数据？', exact: true }).getByRole('button', { name: '开始导入', exact: true }).click();
  await panel.getByText('部分成功', { exact: true }).waitFor({ timeout: 15000 });
  await page.waitForFunction(() => document.querySelector('#completed')?.textContent === '1');
  check('执行只传跳过选项且完成仅刷新一次业务页', requests.filter((request) => request.path.endsWith('/execute')).length === 1);
  check('结果说明失败行需修正重传', await panel.getByText('已处理的失败行不会重复执行', { exact: false }).count() === 1);
  for (const theme of ['light', 'dark']) {
    await page.evaluate((value) => document.documentElement.classList.toggle('dark', value === 'dark'), theme);
    await page.screenshot({ path: path.join(output, `${theme}-1440.png`), fullPage: true, animations: 'disabled' });
  }
  await panel.getByRole('button', { name: '关闭', exact: true }).last().click();
  await page.setViewportSize({ width: 375, height: 812 });
  const beforeMobile = requests.length;
  await page.getByRole('button', { name: '批量导入', exact: true }).click();
  await page.getByText('请到桌面端导入', { exact: true }).waitFor();
  check('手机只引导桌面且不加载导入接口', requests.length === beforeMobile && await page.locator('input[type=file]').count() === 0);
  check('手机弹窗无横向溢出', await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  await page.screenshot({ path: path.join(output, 'mobile-375.png'), fullPage: true });
  await page.getByRole('button', { name: '关闭弹窗', exact: true }).click();
  await page.setViewportSize({ width: 1440, height: 1000 });
  unavailable = true;
  await page.getByRole('button', { name: '批量导入', exact: true }).click();
  await page.getByRole('alert').filter({ hasText: '导入服务未就绪' }).waitFor();
  check('业务服务不可用时明确提示且禁止上传', await page.getByRole('button', { name: '上传文件', exact: true }).count() === 0);
  await page.getByRole('button', { name: '关闭', exact: true }).last().click();
  unavailable = false;
  denied = true;
  await page.reload();
  await page.waitForSelector('#completed');
  check('没有执行与业务权限时隐藏导入按钮', await page.getByRole('button', { name: '批量导入', exact: true }).count() === 0);
  denied = false;
  await page.goto(`${origin}/import-interface-check?tasks`);
  await page.getByRole('button', { name: '业务模块', exact: true }).click();
  await page.getByRole('option', { name: '人力资源', exact: true }).click();
  await page.getByRole('table', { name: '导入任务列表', exact: true }).getByText('IMP_UI_CHECK', { exact: true }).waitFor();
  check('任务管理按所选模块读取本人任务', requests.some((request) => request.path === '/api/hr/system/import/list'));
  await page.setViewportSize({ width: 375, height: 812 });
  await page.waitForSelector('tbody tr.cf-mobile-list-card');
  check('手机任务列表复用公共卡片能力', await page.locator('tbody tr.cf-mobile-list-card').count() === 1);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`${origin}/import-interface-check?tasks&bizType=EMPLOYEE&taskId=701`);
  await page.getByRole('dialog', { name: '员工导入', exact: true }).getByText('任务编号：IMP_UI_CHECK', { exact: true }).waitFor();
  check('完成通知链接直接定位所属模块与任务', true);
  check('页面无运行时异常', errors.length === 0);
  await fs.writeFile(path.join(output, 'results.json'), JSON.stringify({ scope: 'isolated component UI with controlled HTTP responses; not business acceptance', checks, errors }, null, 2));
  console.log(`批次G导入界面：${checks.length}项浏览器检查通过。`);
} catch (error) {
  await page?.screenshot({ path: path.join(output, 'failed.png'), fullPage: true });
  await fs.writeFile(path.join(output, 'failed.json'), JSON.stringify({ checks, errors, failure: error.message }, null, 2));
  throw error;
} finally {
  await browser?.close();
  await server.close();
}
