import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export async function verifyOpportunityImportInterface({ admin, api, successful, database, check, directory, caseTag,
  evidence, definition, existing, salesRecord, won, createRow, updateRow, detail, sql, waitFor, csv, tasks }) {
  const origin = new URL(admin.url()).origin;
  const scripts = path.dirname(fileURLToPath(import.meta.url));
  const screenshot = name => admin.screenshot({ path: path.join(directory, 'h3-import-' + name + '-' + caseTag + '.png'), fullPage: false, animations: 'disabled' });
  const templateRows = contents => {
    const data = contents['导入数据'];
    assert.ok(Array.isArray(data) && data.length > 0);
    const letter = reference => reference.replace(/\d/g, '');
    const columns = new Map(data[0].cells.map(cell => [letter(cell.cell),
      definition.columns.find(column => column.name === cell.value.replace(/^\*|\*$/g, '').trim())?.field]));
    assert.equal(columns.size, 13);
    assert.ok([...columns.values()].every(Boolean));
    return data.slice(1).map(row => Object.fromEntries(row.cells.map(cell => [columns.get(letter(cell.cell)), cell.value])));
  };
  const download = async (dialog, button, suffix) => {
    const waiting = admin.waitForEvent('download');
    await dialog.getByRole('button', { name: button, exact: true }).click();
    const result = await waiting;
    assert.equal(await result.failure(), null);
    const target = path.join(directory, 'h3-import-template-' + suffix + '-' + caseTag + '.xlsx');
    await result.saveAs(target);
    const bytes = await fs.readFile(target);
    check(button + '真实下载为完整Excel文件', bytes.length > 1000 && bytes.subarray(0, 2).toString() === 'PK');
    const parsed = spawnSync('pwsh.exe', ['-NoProfile', '-File', path.join(scripts, 'read-import-template.ps1'),
      '-TemplatePath', target, '-RunDirectory', directory], { encoding: 'utf8', timeout: 30000, windowsHide: true, maxBuffer: 12 * 1024 * 1024 });
    assert.equal(parsed.status, 0, 'Actual generated workbook could not be read: ' + (parsed.stderr || '').slice(0, 300));
    return { target, bytes, contents: JSON.parse(parsed.stdout.replace(/^\uFEFF/, '')) };
  };
  await admin.setViewportSize({ width: 1440, height: 1000 });
  await admin.goto(origin + '/office/crm/opportunities', { waitUntil: 'domcontentloaded' });
  await admin.getByRole('button', { name: '批量导入', exact: true }).waitFor({ state: 'visible' });
  await admin.getByRole('button', { name: '批量导入', exact: true }).click();
  let dialog = admin.getByRole('dialog', { name: '商机导入', exact: true });
  await dialog.waitFor({ state: 'visible' });
  await dialog.getByRole('button', { name: '下载新增模板', exact: true }).waitFor({ state: 'visible' });
  check('真实商机管理页打开新增更新导入入口', await dialog.getByText('同一文件可新增和更新商机；请先校验，确认后再导入。', { exact: true }).isVisible());
  const fresh = await download(dialog, '下载新增模板', 'create');
  check('新增模板有完整13列且没有混入示例数据', templateRows(fresh.contents).length === 0
    && JSON.stringify(fresh.contents['填写说明']).includes('商机编号及数据版本留空'));
  const all = await download(dialog, '下载更新模板', 'all');
  const allRows = templateRows(all.contents);
  const expectedIds = database('SELECT opportunity.opportunity_id FROM crm_opportunity opportunity JOIN crm_customer customer'
    + ' ON customer.tenant_id=opportunity.tenant_id AND customer.customer_id=opportunity.customer_id AND customer.deleted=0'
    + ' WHERE opportunity.tenant_id=100000 AND opportunity.deleted=0 AND opportunity.owner_id=' + existing.ownerId
    + " AND opportunity.status='OPEN' AND opportunity.stage NOT IN ('WON','LOST') ORDER BY opportunity.opportunity_id;").split(/\r?\n/).map(value => value.trim()).filter(Boolean);
  check('更新模板跨200行分页准确导出全部本人进行中商机', allRows.length > 200
    && JSON.stringify(allRows.map(row => row.opportunityId)) === JSON.stringify(expectedIds)
    && new Set(allRows.map(row => row.opportunityId)).size === allRows.length);
  check('更新模板排除其他负责人及已赢单商机', !allRows.some(row => [String(salesRecord.opportunityId), String(won.opportunityId)].includes(row.opportunityId))
    && allRows.every(row => row.operation === '更新' && /^\d+$/.test(row.version)));
  const filter = dialog.getByLabel('按商机名称筛选更新模板', { exact: true });
  await filter.fill(existing.opportunityName);
  const filtered = await download(dialog, '下载更新模板', 'filtered');
  const selected = templateRows(filtered.contents);
  check('名称筛选模板直接带出真实编号、版本和当前值', selected.length === 1
    && selected[0].opportunityId === String(existing.opportunityId) && selected[0].version === String(existing.version)
    && selected[0].opportunityName === existing.opportunityName && selected[0].remark === existing.remark);
  const measurements = [];
  for (const [name, control] of [['更新模板名称筛选', filter], ['下载新增模板', dialog.getByRole('button', { name: '下载新增模板', exact: true })],
    ['下载更新模板', dialog.getByRole('button', { name: '下载更新模板', exact: true })]]) {
    measurements.push({ name, rectangle: await control.boundingBox(), style: await control.evaluate(element => {
      const computed = getComputedStyle(element);
      return { height: computed.height, minHeight: computed.minHeight };
    }) });
  }
  await fs.writeFile(path.join(directory, 'h3-import-template-layout-' + caseTag + '.json'),
    JSON.stringify({ viewport: admin.viewportSize(), measurements }, null, 2), { flag: 'wx' });
  await admin.waitForFunction(() => {
    const avatar = document.querySelector('.app-avatar');
    const picture = avatar?.querySelector('img');
    return avatar && (picture ? picture.complete && picture.naturalWidth > 0 : avatar.querySelector('[role="img"]'));
  });
  await screenshot('templates-1440');
  for (const { name, rectangle } of measurements) {
    check(name + '实际高度至少44像素且位于窗口内', !!rectangle && rectangle.height >= 44
      && rectangle.x >= 0 && rectangle.x + rectangle.width <= 1440);
  }
  evidence.templates = true;
  const changedName = 'H3_IMPORT_' + caseTag + '_ui_updated';
  const newName = 'H3_IMPORT_' + caseTag + '_ui_created';
  const rows = [createRow(newName, { expectedAmount: '150.00' }), {
    ...updateRow(existing), opportunityId: selected[0].opportunityId, version: selected[0].version,
    opportunityName: changedName, expectedAmount: '91.25',
  }];
  const file = csv(definition, rows);
  await dialog.locator('input[type="file"]').setInputFiles({ name: 'h3-ui-mixed-' + caseTag + '.csv', mimeType: 'text/csv', buffer: file });
  const uploadResponse = admin.waitForResponse(response => new URL(response.url()).pathname === '/api/crm/system/import/OPPORTUNITY/upload'
    && response.request().method() === 'POST');
  await dialog.getByRole('button', { name: '上传文件', exact: true }).click();
  const uploaded = successful({ status: (await uploadResponse).status(), body: await (await uploadResponse).json() }, '真实页面上传混合商机文件');
  tasks.push({ service: 'crm', taskId: uploaded.taskId, bizType: 'OPPORTUNITY' });
  await dialog.getByRole('button', { name: '校验文件', exact: true }).click();
  await waitFor(async () => dialog.getByRole('button', { name: '确认导入', exact: true }).isEnabled(), value => value,
    'Real import preview did not finish');
  await dialog.getByRole('heading', { name: '数据预览（前20行）', exact: true }).waitFor();
  check('真实预览显示两行且业务尚未写入', (await api(admin, '/crm/system/import/' + uploaded.taskId)).body?.data?.validRows === 2
    && database('SELECT COUNT(*) FROM crm_opportunity WHERE tenant_id=100000 AND opportunity_name=' + sql(newName) + ';') === '0'
    && (await detail(existing.opportunityId)).version === existing.version);
  await screenshot('preview-1440');
  await dialog.getByRole('button', { name: '确认导入', exact: true }).click();
  const confirmation = admin.getByRole('dialog', { name: '确认写入数据？', exact: true });
  await confirmation.waitFor({ state: 'visible' });
  check('确认文字准确说明按操作列新增或更新', (await confirmation.textContent()).includes('按文件中的操作列新增或更新数据'));
  let submissions = 0, committed, refreshRequests = 0;
  const observeRefresh = request => {
    if (new URL(request.url()).pathname === '/api/crm/opportunity/list') refreshRequests += 1;
  };
  admin.on('request', observeRefresh);
  const routePattern = '**/api/crm/system/import/' + uploaded.taskId + '/execute';
  await admin.route(routePattern, async route => {
    submissions += 1;
    const response = await route.fetch();
    committed = await response.json();
    await route.abort('failed');
  });
  try {
    await confirmation.getByRole('button', { name: '开始导入', exact: true }).evaluate(button => { button.click(); button.click(); });
    await dialog.getByText('2 行数据已成功写入。', { exact: true }).waitFor({ timeout: 120000 });
    check('页面双击只提交一次，真实响应丢失后查回成功结果', submissions === 1 && committed?.code === 200
      && committed.data.status === 'SUCCESS' && committed.data.successRows === 2);
    check('真实状态确认已写入后清除连接错误，结果窗口仍保留', await dialog.getByRole('alert').count() === 0
      && await dialog.isVisible() && refreshRequests === 0);
  } catch (error) {
    await screenshot('result-failure-1440').catch(() => {});
    throw error;
  } finally {
    await admin.unroute(routePattern);
    admin.off('request', observeRefresh);
    const taskState = JSON.parse(database("SELECT JSON_OBJECT('taskId',task_id,'status',status,'successRows',success_rows,'failRows',fail_rows) FROM sys_import_task WHERE tenant_id=100000 AND task_id=" + uploaded.taskId + ';'));
    await fs.writeFile(path.join(directory, 'h3-import-ui-response-' + caseTag + '.json'), JSON.stringify({ submissions, refreshRequests,
      committed: committed ? { code: committed.code, status: committed.data?.status, successRows: committed.data?.successRows } : null,
      taskState, dialogVisible: await dialog.isVisible() }, null, 2), { flag: 'wx' });
  }
  const saved = await detail(existing.opportunityId);
  check('页面混合导入实际新增一次并准确更新导出记录', saved.version === existing.version + 1 && saved.opportunityName === changedName
    && saved.remark === existing.remark && Number(saved.expectedAmount) === 91.25
    && database('SELECT COUNT(*) FROM crm_opportunity WHERE tenant_id=100000 AND opportunity_name=' + sql(newName) + ';') === '1');
  await screenshot('complete-1440');
  evidence.lostResponse = true;
  const fileRoute = '**/api/crm/system/import/' + uploaded.taskId + '/file';
  await admin.route(fileRoute, async route => { await route.fetch(); await route.abort('failed'); });
  try {
    await dialog.getByRole('button', { name: '原始文件', exact: true }).click();
    await dialog.getByRole('alert').getByText('网络连接失败', { exact: true }).waitFor();
    check('成功任务的文件下载失败仍提示错误，不把任务成功当作下载成功',
      await dialog.getByText('2 行数据已成功写入。', { exact: true }).isVisible()
      && (await detail(existing.opportunityId)).version === saved.version);
  } finally { await admin.unroute(fileRoute); }
  const refreshed = admin.waitForResponse(response => {
    const address = new URL(response.url());
    return address.pathname === '/api/crm/opportunity/list' && address.searchParams.get('pageSize') === '100'
      && response.request().method() === 'GET';
  });
  await dialog.getByRole('button', { name: '关闭', exact: true }).click();
  const refreshResult = await refreshed;
  const refreshBody = await refreshResult.json();
  check('关闭结果窗口后才刷新商机列表，真实列表包含新增和更新结果', refreshResult.status() === 200
    && refreshBody.code === 200 && Array.isArray(refreshBody.data?.rows)
    && refreshBody.data.rows.some(row => row.opportunityName === newName)
    && refreshBody.data.rows.some(row => row.opportunityName === changedName));
  await admin.goto(origin + '/system/import?bizType=OPPORTUNITY&taskId=' + uploaded.taskId, { waitUntil: 'domcontentloaded' });
  dialog = admin.getByRole('dialog', { name: '商机导入', exact: true });
  await dialog.getByText('2 行数据已成功写入。', { exact: true }).waitFor({ timeout: 120000 });
  check('刷新并重新打开任务后新增更新结果保持', await dialog.getByText('2 行数据已成功写入。', { exact: true }).isVisible());
  await screenshot('reopened-1440');
  await dialog.getByRole('button', { name: '关闭', exact: true }).click();
  evidence.desktop = true;
  for (const width of [375, 320]) {
    await admin.setViewportSize({ width, height: 900 });
    await admin.goto(origin + '/system/import?bizType=OPPORTUNITY', { waitUntil: 'domcontentloaded' });
    await admin.getByText('此功能暂不支持移动端，请在电脑访问。', { exact: true }).waitFor();
    check(width + '像素导入管理路由按既定设计引导电脑操作',
      await admin.locator('input[type="file"]').count() === 0
      && await admin.getByRole('button', { name: '导入商机', exact: true }).count() === 0);
    await screenshot('mobile-management-' + width);
    await admin.goto(origin + '/office/crm/opportunities', { waitUntil: 'domcontentloaded' });
    await admin.getByRole('button', { name: '批量导入', exact: true }).click();
    const guidance = admin.getByRole('dialog', { name: '批量导入', exact: true });
    await guidance.getByText('请到桌面端导入', { exact: true }).waitFor();
    check(width + '像素保留电脑操作提示且不提供文件写入口', await guidance.locator('input[type="file"]').count() === 0
      && await guidance.getByRole('button', { name: /上传文件|下载更新模板|确认导入/ }).count() === 0);
    await screenshot('mobile-' + width);
    await admin.keyboard.press('Escape');
    await guidance.waitFor({ state: 'hidden' });
  }
  evidence.mobile = true;
}
