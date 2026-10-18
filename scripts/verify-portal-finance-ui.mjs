import assert from 'node:assert/strict';
import path from 'node:path';
import { waitForShellLayout } from './portal-checks/wait-shell-layout.mjs';
import { measurePortalContent, measurePortalControls } from './portal-checks/measure-content-bounds.mjs';
import { scrollPortalContent } from './portal-checks/scroll-portal-content.mjs';

export async function verifyPortalFinanceInterface(context) {
  const { admin, finance, records, prefix, privateMarker, origin, tenantCode, first, password, secrets, check, directory, caseTag,
    preview, confirm, detail, waitFor, evidence } = context;
  const page = await admin.context().newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const layout = async (target, scope, width, label) => {
    await target.setViewportSize({ width, height: 1000 }); await waitForShellLayout(target);
    const internal = label.endsWith('-内部公开');
    const list = label.endsWith('-列表');
    const firstContent = internal ? scope.getByRole('heading', { name: '财务对外公开确认', exact: true })
      : list ? scope.getByRole('heading', { name: '本公司财务记录', exact: true }) : scope.locator('dl').first();
    await scrollPortalContent(firstContent, `${label}-${width}-顶部`);
    const content = await measurePortalContent(scope);
    console.log(`H3_PORTAL_FINANCE_CONTENT: label=${label}; width=${width}; geometry=${JSON.stringify(content)}`);
    check(`${label}${width}px内容卡片和实际文字行均在屏幕内`, content.valid);
    const geometry = await scope.evaluate(element => ({ viewport: innerWidth, scroll: document.documentElement.scrollWidth,
      left: element.getBoundingClientRect().left, right: element.getBoundingClientRect().right,
      buttons: [...element.querySelectorAll('button')].filter(button => button.getClientRects().length).map(button => ({ width: button.getBoundingClientRect().width, height: button.getBoundingClientRect().height })),
    }));
    check(`${label}${width}px无横向溢出且按钮至少44px`, geometry.scroll <= geometry.viewport && geometry.left >= 0 && geometry.right <= geometry.viewport + 1
      && geometry.buttons.length > 0 && geometry.buttons.every(button => button.width >= 44 && button.height >= 44));
    await target.screenshot({ path: path.join(directory, `h3-finance-${label}-顶部-${width}-${caseTag}.png`), fullPage: false });
    const action = internal ? scope.getByRole('button', { name: '撤回公开', exact: true })
      : list ? scope.getByRole('button', { name: /^查看/ }).first() : scope.getByRole('button', { name: '下载', exact: true });
    await scrollPortalContent(action, `${label}-${width}-关键操作`);
    const actions = internal ? scope.getByRole('button', { name: /^(确认公开|撤回公开)$/ }) : action;
    const controls = await measurePortalControls(actions);
    check(`${label}${width}px关键操作完整位于实际视口且无遮挡`, controls.allVisible);
    await target.screenshot({ path: path.join(directory, `h3-finance-${label}-${width}-${caseTag}.png`), fullPage: false });
  };
  let interception;
  try {
    await page.bringToFront(); await page.goto(`${origin}/portal/${tenantCode}/login`, { waitUntil: 'domcontentloaded' });
    await page.getByLabel('登录账号', { exact: true }).fill(first.account); await page.getByLabel('密码', { exact: true }).fill(password);
    await waitFor(() => page.getByRole('button', { name: '登录', exact: true }).isEnabled(), Boolean, '财务门户登录未就绪');
    await page.getByRole('button', { name: '登录', exact: true }).click();
    await page.getByRole('button', { name: '本公司财务记录', exact: true }).click();
    await page.getByRole('heading', { name: '本公司财务记录', exact: true }).waitFor();
    const uiToken = await page.evaluate(code => JSON.parse(sessionStorage.getItem('cloudflow.portal.session:' + code) || 'null')?.token, tenantCode);
    assert.match(uiToken, /^p_[A-Za-z0-9_-]{43}$/); secrets.push(uiToken);
    for (const record of records) {
      await page.getByRole('button', { name: record.kind === 'RECEIVABLE' ? '回款记录' : '开票记录', exact: true }).click();
      const search = page.getByLabel(record.kind === 'RECEIVABLE' ? '回款编号' : '发票号码', { exact: true }); await search.fill(record.number);
      await waitFor(() => page.getByRole('button', { name: '搜索', exact: true }).isEnabled(), Boolean, '财务列表未就绪');
      const searched = page.waitForResponse(response => {
        const url = new URL(response.url());
        return url.pathname === `/api/portal/crm/${record.kind === 'RECEIVABLE' ? 'receivable' : 'invoice'}/list`
          && url.searchParams.get('keyword') === record.number && response.request().method() === 'GET';
      });
      await page.getByRole('button', { name: '搜索', exact: true }).click();
      const searchResponse = await searched;
      assert.equal(searchResponse.status(), 200, '财务页面搜索必须取得真实成功响应');
      const searchResult = await searchResponse.json();
      check('财务页面实际搜索响应仅包含目标记录', searchResult.code === 200 && searchResult.data.total === 1
        && searchResult.data.rows.length === 1 && searchResult.data.rows[0].recordId === record.id);
      const article = page.getByRole('article', { name: `财务记录 ${record.number}`, exact: true });
      await waitFor(async () => await article.isVisible() && await page.getByRole('article').count() === 1, Boolean, '财务搜索响应尚未更新到页面');
      check('门户财务搜索仅展示当前类别公开记录', await page.getByRole('article').count() === 1 && !(await page.getByRole('main').innerText()).includes(privateMarker));
      for (const width of [1440, 375, 320]) await layout(page, page.getByRole('main'), width, `${record.kind}-列表`);
      await article.getByRole('button', { name: '查看详情与票据' }).click();
      const dialog = page.getByRole('dialog', { name: '财务记录详情', exact: true });
      await dialog.getByText(record.file.fileName, { exact: true }).waitFor();
      await dialog.getByRole('button', { name: '预览', exact: true }).click();
      await dialog.getByRole('region', { name: '票据预览', exact: true }).getByRole('img').waitFor();
      check('浏览器通过真实私有票据接口预览图片', await dialog.getByRole('img').evaluate(image => image.complete && image.naturalWidth === 1));
      await dialog.getByRole('button', { name: '关闭预览', exact: true }).click();
      const download = page.waitForEvent('download'); await dialog.getByRole('button', { name: '下载', exact: true }).click();
      check('浏览器真实下载保留票据名称', (await download).suggestedFilename() === record.file.fileName);
      for (const width of [1440, 375, 320]) {
        await dialog.getByText(record.file.fileName, { exact: true }).waitFor();
        await layout(page, dialog, width, `${record.kind}-详情`);
      }
      await dialog.getByText(record.file.fileName, { exact: true }).waitFor();
      await confirm(record, false);
      await dialog.getByRole('button', { name: '核对最新状态', exact: true }).click();
      await dialog.getByRole('alert').waitFor();
      check('撤回后页面核对清除旧字段与票据', await dialog.getByText(record.file.fileName, { exact: true }).count() === 0 && await dialog.locator('dl').count() === 0);
      await dialog.getByRole('button', { name: '关闭', exact: true }).click(); await confirm(record, true, [record.file.fileId]);
    }
    for (const record of records) {
      await finance.bringToFront(); await finance.setViewportSize({ width: 1440, height: 1000 });
      const candidateRequests = [];
      const trackCandidates = request => candidateRequests.push(new URL(request.url()).pathname);
      if (record.kind === 'INVOICE') finance.on('request', trackCandidates);
      await finance.goto(`${origin}${record.kind === 'RECEIVABLE' ? '/office/crm/receivables' : '/office/invoice'}`, { waitUntil: 'domcontentloaded' });
      if (record.kind === 'INVOICE') {
        const searched = finance.waitForResponse(response => {
          const url = new URL(response.url());
          return url.pathname === '/api/oa/invoice/list' && url.searchParams.get('keyword') === record.number;
        });
        await finance.getByPlaceholder('搜索发票代码或号码').fill(record.number);
        const result = await (await searched).json();
        check('真实发票页面按号码查询到代码不同的目标发票', result.code === 200 && Number(result.data.total) === 1
          && String(result.data.rows[0].invoiceId) === record.id);
      }
      const row = finance.getByRole('row').filter({ hasText: record.number }); await row.waitFor();
      if (record.kind === 'INVOICE') {
        for (const width of [1440, 375, 320]) {
          await finance.setViewportSize({ width, height: 1000 }); await waitForShellLayout(finance);
          await row.scrollIntoViewIfNeeded();
          const geometry = await row.evaluate(element => ({
            overflow: document.documentElement.scrollWidth - innerWidth,
            cells: [...element.querySelectorAll('td')].map(cell => cell.getBoundingClientRect().width),
            buttons: [...element.querySelectorAll('button')].map(button => ({
              width: button.getBoundingClientRect().width, height: button.getBoundingClientRect().height,
              label: button.innerText.trim(),
            })),
          }));
          check(`发票列表${width}px保留七类信息且手机字段可读、操作至少44px`, geometry.overflow <= 1
            && geometry.cells.length === 7 && geometry.cells.every(cell => cell > 0)
            && (width >= 640 || geometry.cells.every(cell => cell >= 100)
              && geometry.buttons.every(button => button.width >= 44 && button.height >= 44 && button.label.length > 0)));
          await row.getByRole('button', { name: '详情', exact: true }).scrollIntoViewIfNeeded();
          await finance.screenshot({ path: path.join(directory, `h3-finance-INVOICE-内部列表-${width}-${caseTag}.png`), fullPage: false });
        }
        check('财务发票页保留有权读取的候选，未请求无权查看的合同且无权限提示',
          candidateRequests.includes('/api/crm/receivable/list') && !candidateRequests.includes('/api/oa/contract/list')
          && await finance.getByText(/权限不足.*oa:contract:list/).count() === 0);
        finance.off('request', trackCandidates);
      }
      check('财务回款入口保留原写权限边界', record.kind !== 'RECEIVABLE' || await row.getByRole('button', { name: '编辑回款', exact: true }).count() === 0);
      await row.getByRole('button', { name: record.kind === 'RECEIVABLE' ? '财务公开详情' : '详情', exact: true }).click();
      const dialog = finance.getByRole('dialog'); const panel = dialog.getByRole('region', { name: '财务对外公开确认', exact: true });
      const choice = panel.getByRole('checkbox', { name: record.file.fileName, exact: true }); await choice.waitFor();
      check('真实财务页面显示已公开结果和已选票据', await choice.isChecked() && (await panel.innerText()).includes('已向本公司客户公开'));
      for (const width of [1440, 375, 320]) await layout(finance, panel, width, `${record.kind}-内部公开`);
      await choice.uncheck(); await finance.keyboard.press('Escape');
      check('未保存选择阻止误关详情', await dialog.isVisible());
      const before = await preview(record);
      const requestPath = `/api/${record.kind === 'RECEIVABLE' ? 'crm/receivable' : 'oa/invoice'}/${record.id}/portal-publication`;
      let writes = 0;
      interception = async route => {
        if (route.request().method() !== 'PUT') return route.continue();
        writes++;
        const response = await route.fetch(); assert.equal(response.status(), 200, '丢响应前真实服务器须已成功保存');
        await route.abort('failed');
      };
      await finance.route(`**${requestPath}`, interception);
      await panel.getByRole('button', { name: '确认公开', exact: true }).click();
      await panel.getByRole('alert').waitFor();
      check('响应丢失保留选择并暂停继续提交', !await choice.isChecked() && await panel.getByRole('button', { name: '确认公开', exact: true }).isDisabled());
      await finance.unroute(`**${requestPath}`, interception); interception = undefined;
      await panel.getByRole('button', { name: '核对最新结果', exact: true }).click();
      await panel.getByRole('button', { name: '采用服务器结果', exact: true }).click();
      check('只读核对恢复已落库结果，不重复写入', writes === 1 && (await preview(record)).version === before.version + 1 && (await detail(record)).attachments.length === 0);
      check('采用服务器结果后详情保持打开，财务可继续操作', await dialog.isVisible());
      await choice.check(); await panel.getByRole('button', { name: '确认公开', exact: true }).click();
      await panel.getByText('已确认公开，客户可查看以下内容及选中的票据。', { exact: true }).waitFor();
      await panel.getByRole('button', { name: '撤回公开', exact: true }).click();
      await panel.getByText('已撤回公开，客户无法继续读取该记录及票据。', { exact: true }).waitFor();
      await choice.check(); await panel.getByRole('button', { name: '确认公开', exact: true }).click();
      await panel.getByText('已确认公开，客户可查看以下内容及选中的票据。', { exact: true }).waitFor();
      await finance.keyboard.press('Escape'); await dialog.waitFor({ state: 'hidden' });
    }
    check('财务客户页面无脚本错误', errors.length === 0);
    evidence.desktop = true; evidence.mobile = true; evidence.lostResponse = true;
    evidence.publicationView = true; evidence.receiptView = true;
  } catch (failure) {
    await page.screenshot({ path: path.join(directory, `h3-finance-portal-failure-${caseTag}.png`), fullPage: false, timeout: 5000 }).catch(() => {});
    await finance.screenshot({ path: path.join(directory, `h3-finance-internal-failure-${caseTag}.png`), fullPage: false, timeout: 5000 }).catch(() => {});
    throw failure;
  } finally {
    if (interception) await finance.unrouteAll({ behavior: 'wait' });
    await page.close();
  }
}
