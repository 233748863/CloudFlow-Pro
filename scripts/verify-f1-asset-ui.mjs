import assert from 'node:assert/strict';
import path from 'node:path';

export async function verifyF1AssetInterface(ctx) {
  const { admin, browser, origin, api, successful, directory, caseTag, marker, category, alternate,
    check, database, quote, waitFor, evidence, asset, post, get, cents } = ctx;
  const desktopAgreement = admin.getByRole('button', { name: '同意并继续', exact: true });
  if (await desktopAgreement.isVisible()) await desktopAgreement.click();
  const mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true,
    deviceScaleFactor: 1, serviceWorkers: 'block', storageState: await admin.context().storageState(),
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1' });
  await mobileContext.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
  const mobile = await mobileContext.newPage();
  const shot = async (page, name) => {
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: path.join(directory, `f1-${name}-${caseTag}.png`), fullPage: true });
  };
  const visibleDialog = (page, name) => page.getByRole('dialog', { name, exact: true });
  const openDetail = async (page, current) => {
    await page.goto(`${origin}/admin/asset?searchId=${current.assetId}`, { waitUntil: 'domcontentloaded' });
    const dialog = visibleDialog(page, current.name);
    await dialog.waitFor({ state: 'visible', timeout: 60000 });
    await dialog.getByRole('navigation', { name: '资产经营' }).waitFor();
    return dialog;
  };
  try {
    for (const [screen, page] of [['desktop', admin], ['mobile', mobile]]) {
      await page.goto(origin + '/admin/asset', { waitUntil: 'domcontentloaded' });
      const identity = successful(await api(page, '/auth/info'), screen + '通过真实身份接口恢复已有会话');
      check('F1 ' + screen + '保留原账号与租户，独立手机浏览器复用会话', identity.user.userName === 'g_import_admin'
        && String(identity.user.tenantId) === '100000');
      await page.getByRole('button', { name: '新增资产', exact: true }).click({ timeout: 60000 });
      const form = visibleDialog(page, '新增资产');
      await form.waitFor();
      await form.getByLabel('资产分类', { exact: true }).selectOption(String(category.categoryId));
      await form.getByLabel('购入金额（元）', { exact: true }).fill('100.05');
      await waitFor(() => form.getByLabel('预计残值（元）', { exact: true }).inputValue(), value => value === '10.01', '分类自动残值未按分钱显示');
      check('AC-1 ' + screen + '分类默认值立即显示且残值按分四舍五入', await form.getByLabel('折旧方法', { exact: true }).inputValue() === 'STRAIGHT_LINE'
        && await form.getByLabel('使用寿命（月）', { exact: true }).inputValue() === '60'
        && await form.getByLabel('需要定期维保', { exact: true }).isChecked());
      await form.getByLabel('预计残值（元）', { exact: true }).scrollIntoViewIfNeeded();
      await shot(page, 'defaults-' + screen);
      await form.getByLabel('预计残值（元）', { exact: true }).fill('5.55');
      await form.getByLabel('折旧方法', { exact: true }).selectOption('DOUBLE_DECLINING');
      await form.getByLabel('使用寿命（月）', { exact: true }).fill('48');
      await form.getByLabel('需要定期维保', { exact: true }).uncheck();
      await form.getByLabel('资产分类', { exact: true }).selectOption(String(alternate.categoryId));
      await form.getByLabel('购入金额（元）', { exact: true }).fill('200.01');
      check('AC-1 ' + screen + '切换分类和金额保留手动覆盖值', await form.getByLabel('预计残值（元）', { exact: true }).inputValue() === '5.55'
        && await form.getByLabel('折旧方法', { exact: true }).inputValue() === 'DOUBLE_DECLINING'
        && await form.getByLabel('使用寿命（月）', { exact: true }).inputValue() === '48'
        && !(await form.getByLabel('需要定期维保', { exact: true }).isChecked()));
      const name = marker + '_页面_' + screen;
      await form.getByLabel('资产名称', { exact: true }).fill(name);
      await form.getByLabel('资产编码', { exact: true }).fill(marker + '_ui_' + screen);
      const savedResponse = page.waitForResponse(response => new URL(response.url()).pathname === '/api/oa/asset' && response.request().method() === 'POST');
      await form.getByRole('button', { name: '确认新增', exact: true }).click();
      const saved = await savedResponse;
      assert.equal(saved.status(), 200); assert.equal((await saved.json()).code, 200);
      await form.waitFor({ state: 'hidden' });
      const id = database(`SELECT asset_id FROM oa_asset WHERE tenant_id=100000 AND name=${quote(name)} AND deleted=0;`);
      assert.match(id, /^[1-9][0-9]*$/);
      const current = await asset(id);
      check('AC-1 ' + screen + '页面填写值实际保存一致', cents(current.purchaseAmount) === 20001n && cents(current.salvageValue) === 555n
        && current.usefulLifeMonths === 48 && current.depreciationMethod === 'DOUBLE_DECLINING' && current.maintenanceRequiredFlag === 0);
      await post('/oa/asset/categories', { ...(await get('/oa/asset/categories')).find(row => String(row.categoryId) === String(alternate.categoryId)), status: 'DISABLED' });
      const details = await openDetail(page, current);
      await details.getByRole('button', { name: '编辑', exact: true }).click();
      const edit = visibleDialog(page, '编辑资产');
      await edit.waitFor();
      const selectedCategory = await waitFor(() => edit.getByLabel('资产分类', { exact: true }).locator('option:checked').textContent(),
        label => label?.includes('已停用'), '编辑资产的当前停用分类尚未加载', 10000);
      check('AC-1 ' + screen + '编辑保留存量值并显示已停用的当前分类', await edit.getByLabel('预计残值（元）', { exact: true }).inputValue() === '5.55'
        && await edit.getByLabel('使用寿命（月）', { exact: true }).inputValue() === '48'
        && await edit.getByLabel('资产分类', { exact: true }).inputValue() === String(alternate.categoryId) && selectedCategory.includes('已停用'));
      await edit.getByRole('button', { name: '取消', exact: true }).click();
      await post('/oa/asset/categories', { ...(await get('/oa/asset/categories')).find(row => String(row.categoryId) === String(alternate.categoryId)), status: 'ACTIVE' });
      const maintenance = await openDetail(page, ctx.maintenanceAsset);
      await maintenance.getByRole('navigation', { name: '资产经营' }).getByRole('button', { name: '维保', exact: true }).click();
      const repairCount = () => database(`SELECT COUNT(*) FROM oa_asset_repair WHERE tenant_id=100000 AND asset_id=${ctx.maintenanceAsset.assetId};`);
      const beforeRepair = repairCount();
      await maintenance.getByRole('button', { name: '登记维修', exact: true }).click();
      const repairForm = visibleDialog(page, '维修单');
      await repairForm.waitFor();
      check('AC-11 ' + screen + '需维修入口带入完成日期和故障说明', await repairForm.getByLabel('故障日期', { exact: true }).inputValue() === ctx.maintenanceTask.actualDate
        && await repairForm.getByLabel('故障描述', { exact: true }).inputValue() === ctx.maintenanceTask.description);
      const extension = repairForm.getByLabel('延长寿命（月）', { exact: true });
      const maintenanceAsset = await asset(ctx.maintenanceAsset.assetId);
      const maximumExtension = maintenanceAsset.usefulLifeMonths == null ? 0 : 1200 - maintenanceAsset.usefulLifeMonths;
      await extension.fill(String(maximumExtension + 1));
      check('AC-14 ' + screen + '延寿表单阻止超过总寿命1200个月', await extension.evaluate(input => !input.validity.valid && input.validity.rangeOverflow));
      await extension.fill('0');
      await shot(page, 'repair-entry-' + screen);
      await repairForm.getByRole('button', { name: '取消', exact: true }).click();
      check('AC-11 ' + screen + '取消维修草稿不产生维修记录', repairCount() === beforeRepair);
      await maintenance.getByRole('button', { name: '登记维修', exact: true }).click();
      const fault = ctx.maintenanceTask.description + '_' + screen;
      await repairForm.getByLabel('故障描述', { exact: true }).fill(fault);
      await repairForm.getByRole('button', { name: '保存', exact: true }).click();
      await repairForm.waitFor({ state: 'hidden' });
      const repairId = database(`SELECT repair_id FROM oa_asset_repair WHERE tenant_id=100000 AND asset_id=${ctx.maintenanceAsset.assetId} AND fault_description=${quote(fault)};`);
      assert.match(repairId, /^[1-9][0-9]*$/);
      check('AC-11 ' + screen + '直接登记保存到当前资产且自动显示维修列表', Number(repairCount()) === Number(beforeRepair) + 1);
      const repairRow = maintenance.getByRole('row').filter({ hasText: fault });
      await repairRow.getByRole('button', { name: '完成维修', exact: true }).click();
      const finish = visibleDialog(page, '完成维修');
      await finish.getByLabel('已修复（取消勾选表示无法修复）', { exact: true }).uncheck();
      await finish.getByLabel('处理记录', { exact: true }).fill(marker + '_' + screen + '_无法修复');
      await finish.getByRole('button', { name: '保存', exact: true }).click();
      await finish.waitFor({ state: 'hidden' });
      const closed = await waitFor(() => ctx.readRepair(ctx.maintenanceAsset.assetId, repairId), row => row.repairStatus === 'CANNOT_REPAIR', '页面无法修复结果未保存');
      const movementCount = () => database(`SELECT COUNT(*) FROM oa_asset_movement WHERE tenant_id=100000 AND asset_id=${ctx.maintenanceAsset.assetId};`);
      const beforeMovement = movementCount();
      await repairRow.getByRole('button', { name: '发起报废', exact: true }).click();
      const scrap = visibleDialog(page, '资产调拨单');
      await scrap.waitFor();
      check('AC-12/15 ' + screen + '无法修复入口带入报废用途和维修处理记录', await scrap.getByLabel('用途', { exact: true }).inputValue() === 'SCRAP'
        && (await scrap.getByLabel('原因', { exact: true }).inputValue()).includes(closed.repairNo)
        && (await scrap.getByLabel('原因', { exact: true }).inputValue()).includes(closed.actionsPerformed));
      await shot(page, 'scrap-entry-' + screen);
      await scrap.getByRole('button', { name: '取消', exact: true }).click();
      check('AC-15 ' + screen + '取消报废草稿不产生调拨或改变资产状态', movementCount() === beforeMovement
        && (await asset(ctx.maintenanceAsset.assetId)).status === 'MAINTENANCE');
      await repairRow.getByRole('button', { name: '发起报废', exact: true }).click();
      await scrap.getByRole('button', { name: '保存', exact: true }).click();
      await scrap.waitFor({ state: 'hidden' });
      const movements = await get(`/oa/asset/${ctx.maintenanceAsset.assetId}/movements`);
      const created = movements.find(row => row.reason.includes(closed.repairNo));
      check('AC-15 ' + screen + '保存报废草稿保留原资产状态并转到调拨列表', created?.status === 'DRAFT'
        && (await asset(ctx.maintenanceAsset.assetId)).status === 'MAINTENANCE' && Number(movementCount()) === Number(beforeMovement) + 1);
      if (screen === 'mobile') {
        await maintenance.getByRole('row').filter({ hasText: created.movementNo }).getByRole('button', { name: '提交执行', exact: true }).click();
        await waitFor(() => ctx.readMovement(ctx.maintenanceAsset.assetId, created.movementId), row => row.status === 'APPROVING', '手机报废未提交审批');
        check('AC-15 手机提交报废后审批前保留维修状态', (await asset(ctx.maintenanceAsset.assetId)).status === 'MAINTENANCE');
        await ctx.decide('oa_asset_movement', 'movement_id', created.movementId);
        await waitFor(() => asset(ctx.maintenanceAsset.assetId), row => row.status === 'SCRAPPED', '手机报废实际审批未落库');
      }
      const ledgerAsset = await asset(ctx.historical.assetId);
      const ledger = await openDetail(page, ledgerAsset);
      const format = value => Number(value).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      for (const [label, value] of [['资产原值', ledgerAsset.purchaseAmount], ['累计折旧', ledgerAsset.accumulatedDepreciation], ['账面净值', ledgerAsset.netBookValue]]) {
        const metric = ledger.locator('.oa-ops-metric').filter({ has: page.getByText(label, { exact: true }) });
        check('AC-18 ' + screen + '台账显示实际' + label, (await metric.locator('strong').textContent()).trim() === format(value));
      }
      await ledger.getByText('资产原值', { exact: true }).scrollIntoViewIfNeeded();
      const bounds = await ledger.locator('.cf-dialog-panel').boundingBox();
      check('AC-18 ' + screen + '详情面板位于可视范围', bounds && bounds.x >= -1 && bounds.x + bounds.width <= page.viewportSize().width + 1);
      await shot(page, 'ledger-' + screen);
      const terminal = await openDetail(page, ctx.terminalAsset);
      await terminal.getByRole('navigation', { name: '资产经营' }).getByRole('button', { name: '维修', exact: true }).click();
      check('AC-12 ' + screen + '终态资产隐藏新增维修入口', await terminal.getByRole('button', { name: '登记报修', exact: true }).count() === 0);
      const oldRepair = terminal.getByRole('row').filter({ hasText: ctx.terminalRepair.faultDescription });
      await oldRepair.waitFor({ state: 'visible' });
      check('AC-12 ' + screen + '终态旧维修记录可读且不能编辑或完成', await oldRepair.getByRole('button').count() === 0);
      await shot(page, 'terminal-repair-' + screen);
      await terminal.getByRole('navigation', { name: '资产经营' }).getByRole('button', { name: '维保', exact: true }).click();
      check('AC-10 ' + screen + '终态资产隐藏安排维保入口', await terminal.getByRole('button', { name: '新增计划', exact: true }).count() === 0);
      await terminal.getByRole('navigation', { name: '资产经营' }).getByRole('button', { name: '调拨', exact: true }).click();
      check('AC-15 ' + screen + '终态资产保留调拨记录并隐藏新增和执行入口', await terminal.getByRole('button', { name: '新增调拨', exact: true }).count() === 0
        && await terminal.getByRole('button', { name: '提交执行', exact: true }).count() === 0);
      evidence[screen] = true;
    }
    evidence.repairEntry = true;
  } catch (error) {
    await shot(mobile, 'mobile-failure').catch(() => {});
    throw error;
  } finally { await mobileContext.close(); }
}
