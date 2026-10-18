import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

export async function verifyImportInterface(harness) {
  const { admin, api, successful, session, database, check, directory, caseTag, requests, tasks, pending, csv } = harness;
  const origin = new URL(admin.url()).origin;
  const screenshots = path.join(directory, 'import-ui');
  await fs.mkdir(screenshots, { recursive: true });
  const definitions = [];
  for (const service of ['auth', 'oa']) {
    definitions.push(...successful(await api(admin, `/${service}/system/import/types`), '读取真实界面业务定义').map(definition => ({ ...definition, service })));
  }
  const errors = [];
  const responseWork = [];
  const onPageError = error => errors.push(error.message);
  const onResponse = response => {
    const address = new URL(response.url());
    if (!/^\/api\/(auth|hr|oa|crm)\/system\/import(?:\/|$)/.test(address.pathname)) return;
    responseWork.push((async () => {
      let code;
      if ((response.headers()['content-type'] || '').includes('json')) {
        try { code = (await response.json()).code; } catch { }
      }
      requests.push({ path: address.pathname.slice(4), method: response.request().method(), status: response.status(), code, traceId: response.headers()['x-trace-id'] });
    })());
  };
  admin.on('pageerror', onPageError);
  admin.on('response', onResponse);
  const responseFor = async (pathname, action) => {
    const response = admin.waitForResponse(candidate => new URL(candidate.url()).pathname === `/api${pathname}` && candidate.request().method() === 'POST', { timeout: 180000 });
    await action();
    const completed = await response;
    return successful({ status: completed.status(), body: await completed.json() }, pathname);
  };
  const downloadFrom = async (dialog, label) => {
    const downloaded = admin.waitForEvent('download', { timeout: 120000 });
    await dialog.getByRole('button', { name: label, exact: true }).click();
    const file = await downloaded;
    assert.equal(await file.failure(), null);
    return { name: file.suggestedFilename(), content: await fs.readFile(await file.path()) };
  };
  const openUpload = async (definition, rows, suffix) => {
    await admin.goto(`${origin}/system/import?bizType=${definition.bizType}`, { waitUntil: 'domcontentloaded' });
    const start = admin.getByRole('button', { name: `导入${definition.bizName}`, exact: true });
    await start.waitFor({ state: 'visible', timeout: 120000 });
    await start.click();
    const dialog = admin.getByRole('dialog', { name: `${definition.bizName}导入`, exact: true });
    await dialog.waitFor({ state: 'visible', timeout: 120000 });
    const template = await downloadFrom(dialog, '下载模板');
    check(`${definition.bizType}在真实页面下载有效Excel模板`, template.name.endsWith('.xlsx') && template.content.length > 1000 && template.content.subarray(0, 2).toString() === 'PK');
    const content = csv(definition, rows);
    const filename = `g-ui-${suffix}-${caseTag}.csv`;
    await dialog.locator('input[type="file"]').setInputFiles({ name: filename, mimeType: 'text/csv', buffer: content });
    const task = await responseFor(`/${definition.service}/system/import/${definition.bizType}/upload`, () => dialog.getByRole('button', { name: '上传文件', exact: true }).click());
    tasks.push({ service: definition.service, taskId: task.taskId, bizType: definition.bizType });
    check(`${definition.bizType}真实页面上传创建独立任务`, task.status === 'UPLOADED' && task.totalRows === rows.length && task.fileName === filename);
    await dialog.getByRole('button', { name: '校验文件', exact: true }).waitFor({ state: 'visible', timeout: 120000 });
    const validated = await responseFor(`/${definition.service}/system/import/${task.taskId}/validate`, () => dialog.getByRole('button', { name: '校验文件', exact: true }).click());
    return { dialog, task, content, filename, validated, definition };
  };
  const confirm = async current => {
    await current.dialog.getByRole('button', { name: '确认导入', exact: true }).click();
    const confirmation = admin.getByRole('dialog', { name: '确认写入数据？', exact: true });
    await confirmation.waitFor({ state: 'visible' });
    return responseFor(`/${current.definition.service}/system/import/${current.task.taskId}/execute`, () => confirmation.getByRole('button', { name: '开始导入', exact: true }).click());
  };
  let readOnly;
  try {
    const calendarCode = `GU_CAL_${caseTag}`;
    const calendarId = database(`INSERT INTO sys_holiday_calendar (tenant_id,calendar_code,calendar_name,status) VALUES (100000,'${calendarCode}','真实界面验收日历','ENABLED'); SELECT LAST_INSERT_ID();`);
    assert.match(calendarId, /^[1-9][0-9]*$/);
    const holiday = { calendarId: calendarCode, holidayDate: '2066-01-02', dateType: 'HOLIDAY', triplePayFlag: '1', yearNo: '2066', holidayName: `界面验收${caseTag}` };
    const supplier = { supplierCode: `GU_S_${caseTag}`, supplierName: '界面真实供应商', categoryId: 'G_IMPORT_SUPPLIER', supplierType: 'SERVICE', creditCode: `U${caseTag.toUpperCase().padEnd(17, '0')}`, contactName: '界面验收', contactPhone: '010-12345678', contactEmail: 'g-ui@example.test', registerCapital: '1000.00', registerDate: '2020-01-01', taxRate: '0.13', currency: 'CNY', status: 'ACTIVE' };
    const asset = { assetCode: `GU_A_${caseTag}`, name: '界面真实资产', categoryId: 'G_IMPORT_ASSET', purchaseAmount: '6000.00', purchaseDate: '2026-09-01', salvageValue: '300.00', openingAccumulatedDepreciation: '0.00', depreciationFlag: '1', usefulLifeMonths: '36', availableFromDate: '2026-09-01', depreciationMethod: 'STRAIGHT_LINE', depreciationFrequency: 'MONTHLY' };
    const cases = [
      { bizType: 'HOLIDAY', row: holiday, count: `SELECT COUNT(*) FROM sys_holiday_date WHERE tenant_id=100000 AND calendar_id=${calendarId} AND holiday_date='2066-01-02';` },
      { bizType: 'SUPPLIER', row: supplier, count: `SELECT COUNT(*) FROM oa_supplier WHERE tenant_id=100000 AND supplier_code='${supplier.supplierCode}';` },
      { bizType: 'ASSET', row: asset, count: `SELECT COUNT(*) FROM oa_asset WHERE tenant_id=100000 AND asset_code='${asset.assetCode}';` },
    ];
    for (const current of cases) {
      const definition = definitions.find(candidate => candidate.bizType === current.bizType);
      assert.ok(definition);
      check(`${current.bizType}界面操作前业务记录不存在`, database(current.count) === '0');
      const imported = await openUpload(definition, [current.row], current.bizType.toLowerCase());
      check(`${current.bizType}真实页面同步校验返回完整结果且业务未落库`, imported.validated.status === 'VALIDATED' && imported.validated.validRows === 1 && imported.validated.invalidRows === 0 && database(current.count) === '0');
      await imported.dialog.getByRole('heading', { name: '数据预览（前20行）', exact: true }).waitFor({ state: 'visible', timeout: 120000 });
      const completed = await confirm(imported);
      check(`${current.bizType}真实页面确认后写入一行业务`, completed.status === 'SUCCESS' && completed.successRows === 1 && database(current.count) === '1');
      await imported.dialog.getByText('1 行数据已成功新增。', { exact: true }).waitFor({ state: 'visible', timeout: 120000 });
      const original = await downloadFrom(imported.dialog, '原始文件');
      check(`${current.bizType}页面下载原始文件内容一致`, createHash('sha256').update(original.content).digest('hex') === createHash('sha256').update(imported.content).digest('hex'));
      await admin.screenshot({ path: path.join(screenshots, `${current.bizType.toLowerCase()}-${caseTag}.png`), fullPage: true });
      await imported.dialog.getByRole('button', { name: '关闭', exact: true }).click();
      const row = admin.getByRole('row').filter({ hasText: imported.filename });
      await row.getByRole('button', { name: '查看任务', exact: true }).waitFor({ state: 'visible', timeout: 120000 });
      await row.getByRole('button', { name: '查看任务', exact: true }).click();
      await admin.getByText('1 行数据已成功新增。', { exact: true }).waitFor({ state: 'visible', timeout: 120000 });
      check(`${current.bizType}任务列表能够重新打开真实完成结果`, true);
      await imported.dialog.getByRole('button', { name: '关闭', exact: true }).click();
    }
    const definition = definitions.find(candidate => candidate.bizType === 'SUPPLIER');
    const valid = { ...supplier, supplierCode: `GU_V_${caseTag}`, creditCode: `V${caseTag.toUpperCase().padEnd(17, '0')}` };
    const invalid = { ...supplier, supplierCode: `GU_X_${caseTag}`, creditCode: `X${caseTag.toUpperCase().padEnd(17, '0')}`, contactEmail: 'invalid-email' };
    const marked = await openUpload(definition, [valid, invalid], 'errors');
    check('真实页面校验显示一行通过和一行格式错误', marked.validated.status === 'VALIDATED' && marked.validated.validRows === 1 && marked.validated.invalidRows === 1);
    await marked.dialog.getByRole('heading', { name: /错误明细/ }).waitFor({ state: 'visible', timeout: 120000 });
    check('未勾选跳过错误行时页面禁止确认写入', await marked.dialog.getByRole('button', { name: '确认导入', exact: true }).isDisabled());
    const errorFile = await downloadFrom(marked.dialog, '下载错误文件');
    check('真实页面能够下载非空错误标注文件', errorFile.content.length > 0 && errorFile.content.toString('utf8').includes('邮箱'));
    await marked.dialog.getByRole('checkbox').check();
    const partial = await confirm(marked);
    check('页面选择跳过错误后仅写入有效行', partial.status === 'PARTIAL' && partial.successRows === 1 && partial.failRows === 1 && database(`SELECT COUNT(*) FROM oa_supplier WHERE tenant_id=100000 AND supplier_code='${valid.supplierCode}';`) === '1' && database(`SELECT COUNT(*) FROM oa_supplier WHERE tenant_id=100000 AND supplier_code='${invalid.supplierCode}';`) === '0');
    await marked.dialog.getByRole('heading', { name: /错误明细/ }).waitFor({ state: 'visible', timeout: 120000 });
    await admin.screenshot({ path: path.join(screenshots, `errors-${caseTag}.png`), fullPage: true });
    await marked.dialog.getByRole('button', { name: '关闭', exact: true }).click();
    await admin.setViewportSize({ width: 390, height: 844 });
    await admin.goto(`${origin}/system/import?bizType=SUPPLIER`, { waitUntil: 'domcontentloaded' });
    await admin.getByText(/请.*(?:桌面端|电脑)/).first().waitFor({ state: 'visible', timeout: 120000 });
    check('真实移动页面给出桌面端导入引导', true);
    check('真实移动页面不提供文件上传或导入写入入口', await admin.locator('input[type="file"]').count() === 0 && await admin.getByRole('button', { name: /^(上传文件|确认导入|开始导入)$/ }).count() === 0);
    check('真实移动页面没有整页横向溢出', await admin.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
    await admin.screenshot({ path: path.join(screenshots, `mobile-${caseTag}.png`), fullPage: true });
    readOnly = await session('g_import_readonly');
    readOnly.on('pageerror', onPageError);
    readOnly.on('response', onResponse);
    const identity = successful(await api(readOnly, '/auth/info'), '只读账号加载真实用户信息');
    const expectedPermissions = ['system:auth:info', 'system:auth:router', 'system:import:list'];
    check('真实只读账号仅具备初始化和导入查询权限', Array.isArray(identity.permissions) && identity.permissions.length === expectedPermissions.length && expectedPermissions.every(permission => identity.permissions.includes(permission)) && !identity.roles?.some(role => role.toLowerCase() === 'admin'));
    const routes = successful(await api(readOnly, '/auth/getRouters'), '只读账号加载真实菜单');
    const containsImport = menus => Array.isArray(menus) && menus.some(menu => menu.path === '/system/import' || containsImport(menu.children));
    check('真实只读账号菜单包含批量导入入口', containsImport(routes));
    await readOnly.goto(`${origin}/system/import`, { waitUntil: 'domcontentloaded' });
    await readOnly.getByRole('heading', { name: '批量导入', level: 2, exact: true }).waitFor({ state: 'visible', timeout: 120000 });
    await readOnly.getByText('暂无有权限的导入业务', { exact: true }).waitFor({ state: 'visible', timeout: 120000 });
    check('真实只读账号页面不提供写入或上传按钮', await readOnly.getByRole('button', { name: /^(导入员工|导入客户|导入资产|导入供应商|导入节假日|上传文件)$/ }).count() === 0);
    await readOnly.screenshot({ path: path.join(screenshots, `readonly-${caseTag}.png`), fullPage: true });
    check('真实导入界面无未处理的浏览器脚本异常', errors.length === 0);
    pending.push('员工与客户真实导入界面仍受HR依赖影响，本脚本不伪造业务响应', '后台导入、文件配置与追踪管理界面继续单独验收');
  } catch (error) {
    await admin.screenshot({ path: path.join(screenshots, `failure-${caseTag}.png`), fullPage: true }).catch(() => { });
    await readOnly?.screenshot({ path: path.join(screenshots, `readonly-failure-${caseTag}.png`), fullPage: true }).catch(() => { });
    throw error;
  } finally {
    admin.off('pageerror', onPageError);
    admin.off('response', onResponse);
    readOnly?.off('pageerror', onPageError);
    readOnly?.off('response', onResponse);
    await Promise.all(responseWork);
    await readOnly?.context().close();
  }
}
