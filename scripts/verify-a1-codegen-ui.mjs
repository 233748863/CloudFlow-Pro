import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { waitForShellLayout } from './portal-checks/wait-shell-layout.mjs';

export async function verifyA1CodegenInterface(ctx) {
  const { admin, browser, origin, check, get, put, evidence, directory, caseTag } = ctx;
  const base = '/auth/system/codegen';
  const contexts = [];
  const observations = [];
  const observe = (label, passed, actual) => {
    observations.push({ label, passed: !!passed, actual });
    check(label, !!passed);
  };
  const shot = async (page, label) => {
    await page.evaluate(() => document.fonts.ready);
    await waitForShellLayout(page);
    await page.locator('.cf-toast-viewport').waitFor({ state: 'hidden', timeout: 15000 });
    await page.screenshot({ path: path.join(directory, `a1-${label}-${caseTag}.png`), fullPage: false });
  };
  const mobile = async source => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true,
      hasTouch: true, deviceScaleFactor: 1, serviceWorkers: 'block', storageState: await source.context().storageState(),
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1' });
    contexts.push(context);
    await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    return context.newPage();
  };
  const navigate = async (page, userId) => {
    await page.goto(origin + '/codegen', { waitUntil: 'domcontentloaded' });
    const identity = await get('/auth/info', page);
    observe('A1 页面跳转保持真实用户和租户', String(identity.user.userId) === String(userId)
      && String(identity.user.tenantId) === '100000');
    const flatten = entries => entries.flatMap(entry => [entry, ...flatten(entry.children || [])]);
    const menus = flatten(await get('/auth/getRouters', page));
    observe('A1 真实菜单包含生成器入口', menus.some(menu => menu.path === '/codegen'));
    await ctx.remember(page);
    const agreement = page.getByRole('button', { name: '同意并继续', exact: true });
    if (await agreement.isVisible()) await agreement.click();
    await page.getByRole('heading', { name: '表结构代码生成', level: 2, exact: true }).waitFor();
  };
  const field = (page, parent, label) => parent.locator('label.admin-dialog-field')
    .filter({ has: page.locator('.input-label').filter({ hasText: new RegExp('^' + label + '$') }) });
  const choose = async (page, parent, label, option) => {
    await field(page, parent, label).locator('button[aria-haspopup="listbox"]').click();
    await page.getByRole('option', { name: option, exact: true }).click();
  };
  const actualResponse = async (page, endpoint, method, action) => {
    const responsePending = page.waitForResponse(response =>
      new URL(response.url()).pathname === '/api' + endpoint && response.request().method() === method);
    await action();
    const response = await responsePending;
    const payload = await response.json();
    observe('A1 页面实际请求成功 ' + method + ' ' + endpoint,
      response.status() === 200 && payload.code === 200, { status: response.status(), code: payload.code });
    return payload.data;
  };
  const searchTable = async (page, tableName) => {
    await page.getByPlaceholder('搜索已导入表', { exact: true }).fill(tableName);
    await page.getByRole('button', { name: '查询', exact: true }).click();
    const row = page.getByRole('row').filter({ has: page.getByText(tableName, { exact: true }) });
    await row.waitFor();
    return row;
  };
  const fit = async (page, dialog, label) => {
    await waitForShellLayout(page);
    const actual = await dialog.evaluate(element => {
      const bounds = element.getBoundingClientRect();
      return { left: bounds.left, right: bounds.right, top: bounds.top, bottom: bounds.bottom,
        viewportWidth: innerWidth, viewportHeight: innerHeight,
        pageScrollWidth: document.documentElement.scrollWidth };
    });
    observe(label, actual.left >= -1 && actual.right <= actual.viewportWidth + 1
      && actual.top >= -1 && actual.bottom <= actual.viewportHeight + 1
      && actual.pageScrollWidth <= actual.viewportWidth + 1, actual);
  };
  const horizontalTable = async (page, dialog, label, screen) => {
    const table = dialog.locator('table');
    const headers = table.locator('thead th');
    const expectedCount = label === 'import-columns' ? 3 : 7;
    const headerCount = await headers.count();
    observe('A1 ' + screen + '表头完整 ' + label, await table.count() === 1
      && headerCount === expectedCount, { expectedCount, headerCount });
    for (let index = 0; index < headerCount; index++) {
      const header = headers.nth(index);
      await header.scrollIntoViewIfNeeded();
      const actual = await header.evaluate(element => {
        const bounds = element.getBoundingClientRect();
        const container = element.closest('table').parentElement;
        return { text: element.textContent, left: bounds.left, right: bounds.right,
          viewportWidth: innerWidth, pageScrollWidth: document.documentElement.scrollWidth,
          containerWidth: container.clientWidth, tableWidth: container.scrollWidth,
          scrollLeft: container.scrollLeft };
      });
      observe('A1 ' + screen + '横向滚动可见列 ' + actual.text,
        actual.left >= -1 && actual.right <= actual.viewportWidth + 1
        && actual.pageScrollWidth <= actual.viewportWidth + 1, actual);
    }
    if (screen !== 'desktop') {
      await shot(page, label + '-end-' + screen);
    }
  };
  let mobileAdmin;
  let mobileReader;
  const original = ctx.disabled ? null : await get(base + '/' + ctx.codegenSupplier.tableId);
  try {
    mobileAdmin = await mobile(admin);
    if (!ctx.disabled) mobileReader = await mobile(ctx.codegenReader);
    for (const [screen, width, ownerPage, readerPage, importTable] of [
      ['desktop', 1440, admin, ctx.codegenReader, 'oa_supplier_qualification'],
      ['mobile', 390, mobileAdmin, mobileReader, 'oa_supplier_scorecard'],
      ['mobileNarrow', 320, mobileAdmin, mobileReader, 'oa_supplier_score_criteria'],
    ]) {
      for (const page of [ownerPage, readerPage].filter(Boolean)) {
        await page.setViewportSize({ width, height: screen === 'desktop' ? 1000 : 844 });
      }
      await navigate(ownerPage, 990000701);
      if (ctx.disabled) {
        await ownerPage.getByRole('alert').filter({ hasText: '代码生成器已关闭' }).waitFor();
        observe('AC-9 ' + screen + '关闭状态实际页面显示原因且禁止导入',
          await ownerPage.getByRole('button', { name: '导入表结构', exact: true }).isDisabled());
        const stateCell = ownerPage.locator('tbody td[colspan="5"]');
        await stateCell.getByText('代码生成器已关闭', { exact: true }).waitFor();
        await stateCell.scrollIntoViewIfNeeded();
        await waitForShellLayout(ownerPage);
        const stateBounds = await stateCell.evaluate(element => {
          const container = element.closest('table').parentElement;
          const paragraphs = [...element.querySelectorAll('p')].map(paragraph => {
            const bounds = paragraph.getBoundingClientRect();
            return { text: paragraph.textContent, left: bounds.left, right: bounds.right,
              top: bounds.top, bottom: bounds.bottom, width: paragraph.clientWidth,
              scrollWidth: paragraph.scrollWidth };
          });
          return { viewportWidth: innerWidth, viewportHeight: innerHeight,
            pageScrollWidth: document.documentElement.scrollWidth,
            containerWidth: container.clientWidth, containerScrollWidth: container.scrollWidth, paragraphs };
        });
        observe('AC-9 ' + screen + '关闭空表原因和说明完整显示且无横向溢出',
          stateBounds.paragraphs.length === 2
          && stateBounds.paragraphs.every(bounds => bounds.left >= -1
            && bounds.right <= stateBounds.viewportWidth + 1 && bounds.top >= -1
            && bounds.bottom <= stateBounds.viewportHeight + 1 && bounds.scrollWidth <= bounds.width + 1)
          && stateBounds.pageScrollWidth <= stateBounds.viewportWidth + 1
          && stateBounds.containerScrollWidth <= stateBounds.containerWidth + 1, stateBounds);
        await shot(ownerPage, 'disabled-' + screen);
        evidence[screen] = true;
        continue;
      }
      await ownerPage.getByRole('button', { name: '导入表结构', exact: true }).click();
      const importing = ownerPage.getByRole('dialog', { name: '导入数据库表结构', exact: true });
      await field(ownerPage, importing, '数据库表名').locator('input').fill(importTable);
      await choose(ownerPage, importing, '归属模块', 'oa');
      await importing.getByRole('button', { name: '查询表', exact: true }).click();
      await importing.getByLabel('导入 ' + importTable, { exact: true }).check();
      await fit(ownerPage, importing, 'AC-1 ' + screen + '真实导入窗口和按钮在屏幕内');
      await shot(ownerPage, 'import-selected-' + screen);
      await horizontalTable(ownerPage, importing, 'import-columns', screen);
      await actualResponse(ownerPage, base + '/import', 'POST', () =>
        importing.getByRole('button', { name: '导入所选（1）', exact: true }).click());
      await importing.waitFor({ state: 'hidden' });
      const imported = (await get(base + '/list?tableName=' + importTable + '&pageNum=1&pageSize=100')).rows;
      observe('AC-1 ' + screen + '页面导入实际保存唯一生成配置',
        imported.filter(table => table.tableName === importTable && table.moduleName === 'oa').length === 1);
      const row = await searchTable(ownerPage, 'oa_supplier');
      await row.getByRole('button', { name: '配置', exact: true }).click();
      const configuration = ownerPage.getByRole('dialog', { name: '生成配置：oa_supplier', exact: true });
      const functionName = 'A1页面_' + screen + '_' + caseTag;
      await field(ownerPage, configuration, '功能名称').locator('input').fill(functionName);
      await fit(ownerPage, configuration, 'AC-1 ' + screen + '配置窗口在屏幕内');
      await shot(ownerPage, 'configuration-' + screen);
      await configuration.getByRole('tab', { name: /^字段配置（/ }).click();
      await configuration.getByLabel('supplier_name代码字段名', { exact: true }).fill('uiSupplierName');
      await configuration.getByLabel('supplier_name查询', { exact: true }).check();
      await configuration.getByLabel('supplier_name查询方式', { exact: true }).click();
      await ownerPage.getByRole('option', { name: 'LIKE', exact: true }).click();
      await configuration.getByLabel('supplier_name代码字段名', { exact: true }).scrollIntoViewIfNeeded();
      await shot(ownerPage, 'configured-field-' + screen);
      if (screen !== 'desktop') {
        await configuration.getByLabel('supplier_name查询方式', { exact: true }).scrollIntoViewIfNeeded();
        await shot(ownerPage, 'configured-query-' + screen);
      }
      await horizontalTable(ownerPage, configuration, 'configured-columns', screen);
      await actualResponse(ownerPage, base, 'PUT', () =>
        configuration.getByRole('button', { name: '保存配置', exact: true }).click());
      await configuration.waitFor({ state: 'hidden' });
      await (await searchTable(ownerPage, 'oa_supplier')).getByRole('button', { name: '同步', exact: true }).click();
      const syncing = ownerPage.getByRole('dialog', { name: '同步数据库表结构', exact: true });
      await actualResponse(ownerPage, base + '/' + ctx.codegenSupplier.tableId + '/sync', 'POST', () =>
        syncing.getByRole('button', { name: '确认', exact: true }).click());
      const current = await get(base + '/' + ctx.codegenSupplier.tableId);
      const supplierName = current.columns.find(column => column.columnName === 'supplier_name');
      observe('AC-1 ' + screen + '页面保存和同步后保留功能名与字段映射',
        current.table.functionName === functionName && supplierName.javaField === 'uiSupplierName'
        && supplierName.queryFlag === 1 && supplierName.queryType === 'LIKE');
      const files = await get(base + '/' + ctx.codegenSupplier.tableId + '/preview');
      await ctx.retainGenerated('ui-supplier-' + screen.toLowerCase(), current, files);
      await (await searchTable(ownerPage, 'oa_supplier')).getByRole('button', { name: '预览与产出', exact: true }).click();
      const preview = ownerPage.getByRole('dialog', { name: '生成代码：oa_supplier', exact: true });
      const entityFile = Object.keys(files).find(name => name.endsWith('/' + current.table.className + '.java'));
      assert.ok(entityFile);
      await choose(ownerPage, preview, '预览文件', entityFile);
      observe('AC-1/2 ' + screen + '实际页面预览逐字等于当前生成结果',
        await preview.getByLabel('生成代码内容', { exact: true }).textContent() === files[entityFile]);
      await fit(ownerPage, preview, 'AC-2 ' + screen + '代码预览窗口在屏幕内');
      await shot(ownerPage, 'preview-' + screen);
      if (screen === 'desktop') {
        const downloaded = ownerPage.waitForEvent('download');
        await preview.getByRole('button', { name: '下载压缩包', exact: true }).click();
        const download = await downloaded;
        const downloadPath = path.join(directory, 'a1-ui-download-' + caseTag + '.zip');
        await download.saveAs(downloadPath);
        const bytes = await fs.readFile(downloadPath);
        observe('AC-2 页面实际下载供应商压缩包', download.suggestedFilename() === current.table.tableName + '-generated.zip'
          && bytes.length > 0 && bytes.subarray(0, 2).toString() === 'PK',
        { path: downloadPath, filename: download.suggestedFilename(), bytes: bytes.length,
          hash: createHash('sha256').update(bytes).digest('hex') });
      }
      const targetRoot = 'a1-ui-' + screen.toLowerCase() + '-' + caseTag;
      await field(ownerPage, preview, '写入目录').locator('input').fill(targetRoot);
      const write = async () => {
        await preview.getByRole('button', { name: '安全写入', exact: true }).click();
        const confirmation = ownerPage.getByRole('dialog', { name: '写入生成代码', exact: true });
        return actualResponse(ownerPage, base + '/' + ctx.codegenSupplier.tableId + '/write', 'POST', () =>
          confirmation.getByRole('button', { name: '确认', exact: true }).click());
      };
      const written = await write();
      const writtenAt = Date.now();
      const expected = Object.keys(files).map(name => targetRoot + '/' + name).sort();
      observe('AC-8 ' + screen + '页面确认首次写入清单完整',
        JSON.stringify([...written.written].sort()) === JSON.stringify(expected)
        && written.skipped.length === 0 && written.overwritten.length === 0);
      const markerFile = path.join(ctx.generatedRoot, expected[0]);
      await fs.writeFile(markerFile, 'A1_UI_EXISTING_' + caseTag);
      const beforeRepeat = JSON.stringify(await ctx.generatedFileSnapshot());
      await ctx.sleep(Math.max(0, 5200 - (Date.now() - writtenAt)));
      const skipped = await write();
      observe('AC-8 ' + screen + '页面默认跳过已有文件且保持原字节',
        JSON.stringify([...skipped.skipped].sort()) === JSON.stringify(expected)
        && skipped.written.length === 0 && skipped.overwritten.length === 0
        && JSON.stringify(await ctx.generatedFileSnapshot()) === beforeRepeat);
      const overwriteList = preview.getByRole('list', { name: '本次将覆盖的文件', exact: true });
      observe('AC-8 ' + screen + '页面完整列出本次覆盖文件',
        JSON.stringify((await overwriteList.getByRole('listitem').allTextContents()).sort()) === JSON.stringify(expected));
      await overwriteList.scrollIntoViewIfNeeded();
      await shot(ownerPage, 'overwrite-list-' + screen);
      const unobstructed = await preview.getByRole('button', { name: '关闭', exact: true }).evaluate(element => {
        const bounds = element.getBoundingClientRect();
        const visible = document.elementFromPoint(bounds.left + bounds.width / 2, bounds.top + bounds.height / 2);
        return { left: bounds.left, right: bounds.right, top: bounds.top, bottom: bounds.bottom,
          viewportWidth: innerWidth, viewportHeight: innerHeight, unobstructed: element.contains(visible) };
      });
      observe('AC-8 ' + screen + '提示消失后底部关闭按钮无遮挡', unobstructed.unobstructed
        && unobstructed.left >= -1 && unobstructed.right <= unobstructed.viewportWidth + 1
        && unobstructed.top >= -1 && unobstructed.bottom <= unobstructed.viewportHeight + 1, unobstructed);
      await preview.getByRole('button', { name: '确认覆盖已存在文件', exact: true }).click();
      let overwrite = ownerPage.getByRole('dialog', { name: '覆盖确认', exact: true });
      observe('AC-8 ' + screen + '覆盖前必须勾选确认',
        await overwrite.getByRole('button', { name: '确认', exact: true }).isDisabled());
      await overwrite.getByRole('button', { name: '取消', exact: true }).click();
      observe('AC-8 ' + screen + '取消覆盖保持全部文件',
        JSON.stringify(await ctx.generatedFileSnapshot()) === beforeRepeat);
      await preview.getByRole('button', { name: '确认覆盖已存在文件', exact: true }).click();
      overwrite = ownerPage.getByRole('dialog', { name: '覆盖确认', exact: true });
      await overwrite.getByLabel('我已核对文件清单，确认覆盖', { exact: true }).check();
      const overwritten = await actualResponse(ownerPage, base + '/' + ctx.codegenSupplier.tableId + '/write', 'POST', () =>
        overwrite.getByRole('button', { name: '确认', exact: true }).click());
      observe('AC-8 ' + screen + '确认覆盖实际文件清单完整',
        overwritten.written.length === 0 && overwritten.skipped.length === 0
        && JSON.stringify([...overwritten.overwritten].sort()) === JSON.stringify(expected));
      for (const [name, content] of Object.entries(files)) {
        observe('AC-8 ' + screen + '页面覆盖后实际文件等于预览 ' + name,
          await fs.readFile(path.join(ctx.generatedRoot, targetRoot, name), 'utf8') === content);
      }
      await preview.getByRole('button', { name: '关闭', exact: true }).click();
      await put(base, original);
      await navigate(readerPage, 990000704);
      const readonlyRow = await searchTable(readerPage, 'oa_supplier');
      observe('AC-3 ' + screen + '只读账号页面只提供已授权操作',
        await readerPage.getByRole('button', { name: '导入表结构', exact: true }).count() === 0
        && await readonlyRow.getByRole('button', { name: '配置', exact: true }).count() === 0
        && await readonlyRow.getByRole('button', { name: '同步', exact: true }).count() === 0
        && await readonlyRow.getByRole('button', { name: '删除', exact: true }).count() === 0);
      await readonlyRow.getByRole('button', { name: '预览与产出', exact: true }).click();
      const readonlyPreview = readerPage.getByRole('dialog', { name: '生成代码：oa_supplier', exact: true });
      await readonlyPreview.waitFor();
      observe('AC-3 ' + screen + '只读预览隐藏下载和写盘入口',
        await readonlyPreview.getByRole('button', { name: '下载压缩包', exact: true }).count() === 0
        && await readonlyPreview.getByRole('button', { name: '安全写入', exact: true }).count() === 0);
      await shot(readerPage, 'readonly-preview-' + screen);
      await readonlyPreview.getByRole('button', { name: '关闭', exact: true }).click();
      const importedRow = await searchTable(ownerPage, importTable);
      const beforeRemoval = JSON.stringify(await ctx.generatedFileSnapshot());
      const originalColumns = JSON.stringify(ctx.codegenMetadata(importTable));
      await importedRow.getByRole('button', { name: '删除', exact: true }).click();
      const removing = ownerPage.getByRole('dialog', { name: '删除代码生成配置', exact: true });
      const importedId = imported.find(table => table.tableName === importTable).tableId;
      await actualResponse(ownerPage, base + '/' + importedId, 'DELETE', () =>
        removing.getByRole('button', { name: '确认', exact: true }).click());
      const afterColumns = ctx.codegenMetadata(importTable);
      const afterFiles = await ctx.generatedFileSnapshot();
      const afterRemoval = await get(base + '/list?tableName=' + importTable + '&pageNum=1&pageSize=100');
      const removalActual = {
        tableName: importTable, tableId: importedId,
        businessColumnsUnchanged: JSON.stringify(afterColumns) === originalColumns,
        generatedFilesUnchanged: JSON.stringify(afterFiles) === beforeRemoval,
        listedTableIds: afterRemoval.rows.filter(table => table.tableName === importTable).map(table => table.tableId),
      };
      observe('AC-1 ' + screen + '删除生成配置保持真实业务表', removalActual.businessColumnsUnchanged, removalActual);
      observe('AC-1 ' + screen + '删除生成配置保持全部已产出文件', removalActual.generatedFilesUnchanged, removalActual);
      observe('AC-1 ' + screen + '删除后生成配置退出实际列表', removalActual.listedTableIds.length === 0, removalActual);
      await ctx.post(base + '/import', { tableNames: [importTable], moduleName: 'system' });
      const restored = (await get(base + '/list?tableName=' + importTable + '&pageNum=1&pageSize=100')).rows;
      observe('AC-1 ' + screen + '删除后真实重新导入复用原配置编号',
        restored.some(table => table.tableName === importTable && String(table.tableId) === String(importedId)), restored);
      evidence[screen] = true;
    }
    if (!ctx.disabled) {
      const menu = ctx.codegenGeneratedMenu;
      await menu.assign([...new Set([...menu.readonlyIds, menu.parent.menuId, ...menu.buttons.map(button => button.menuId)])]);
      const menuReader = await ctx.session('g_import_readonly');
      await menuReader.setViewportSize({ width: 1440, height: 1000 });
      await navigate(menuReader, 990000704);
      const parent = ctx.rows("SELECT JSON_OBJECT('name',menu_name) FROM sys_menu WHERE menu_id=6;")[0];
      const directoryButton = menuReader.getByRole('button', { name: parent.name, exact: true });
      await directoryButton.waitFor();
      if (await directoryButton.getAttribute('aria-expanded') !== 'true') await directoryButton.click();
      const generatedButton = menuReader.getByRole('button', {
        name: parent.name + ' / ' + menu.configured.table.functionName, exact: true });
      await generatedButton.waitFor();
      observe('AC-7 真实登录的导航显示实际生成菜单', await generatedButton.isVisible());
      await shot(menuReader, 'generated-menu-desktop');
      await generatedButton.click();
      await menuReader.getByText('菜单路由未配置', { exact: true }).waitFor();
      observe('AC-7 生成菜单未提供前端组件时准确显示配置状态',
        await menuReader.getByText('菜单路由未配置', { exact: true }).isVisible());
      await shot(menuReader, 'generated-menu-route-desktop');
      await menu.assign(menu.readonlyIds);
      evidence.menuUi = true;
      evidence.configurationUi = true;
      evidence.previewUi = true;
      evidence.diskWriteUi = true;
      evidence.permissionUi = true;
    }
  } catch (failure) {
    await shot(admin, 'admin-failure').catch(() => {});
    if (mobileAdmin) await shot(mobileAdmin, 'mobile-failure').catch(() => {});
    throw failure;
  } finally {
    try {
      if (original) await put(base, original);
    } finally {
      await fs.writeFile(path.join(directory, 'a1-ui-observations-' + caseTag + '.json'),
        JSON.stringify({ actualLogin: true, actualGateway: true, observations }, null, 2), { flag: 'wx' });
      for (const context of contexts) await context.close();
    }
  }
}
