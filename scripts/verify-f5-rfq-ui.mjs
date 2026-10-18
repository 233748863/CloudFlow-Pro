import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { waitForShellLayout } from './portal-checks/wait-shell-layout.mjs';
import { verifyF5RfqWorkbook } from './verify-f5-rfq-workbook.mjs';

export async function verifyF5RfqInterface(ctx) {
  const { admin, recorder, browser, origin, api, successful, directory, caseTag, check, remember, main,
    comparison, first, second, watch, get, post, waitFor, rfq, quotation, cents, evidence } = ctx;
  const contexts = [];
  const observations = [];
  const navigationObservations = [];
  const startupObservations = [];
  const startupTraffic = new WeakMap();
  const observedPages = new Set();
  const optionalStartupPath = target => /^\/api\/auth\/system\/(?:dict\/data\/type\/|config\/client\/|message\/mine(?:\/|$))/.test(target);
  const observe = (name, passed, actual) => {
    observations.push({ name, passed: !!passed, actual });
    check(name, !!passed);
  };
  const shot = async (page, name) => {
    await page.evaluate(() => document.fonts.ready);
    await waitForShellLayout(page);
    await page.screenshot({ path: path.join(directory, `f5-${name}-${caseTag}.png`), fullPage: false });
  };
  const navigate = async (page, route, userId) => {
    if (!observedPages.has(page)) {
      observedPages.add(page);
      page.on('request', request => {
        const target = new URL(request.url());
        if (target.origin === origin && optionalStartupPath(target.pathname)) {
          startupTraffic.get(page)?.requests.push(target.pathname);
        }
      });
      page.on('response', response => {
        const target = new URL(response.url());
        if (target.origin === origin && target.pathname.startsWith('/api/')) {
          startupTraffic.get(page)?.responses.push({ path: target.pathname, status: response.status() });
        }
      });
    }
    startupTraffic.set(page, { requests: [], responses: [] });
    await page.goto(origin + route, { waitUntil: 'domcontentloaded' });
    const identity = successful(await api(page, '/auth/info'), 'F5页面真实会话');
    observe('F5 整页跳转保留实际身份及租户', String(identity.user.userId) === String(userId)
      && String(identity.user.tenantId) === '100000');
    const routers = successful(await api(page, '/auth/getRouters'), 'F5页面真实菜单');
    const paths = [];
    const collectPaths = entries => {
      for (const entry of entries) {
        if (entry.path) paths.push(entry.path);
        collectPaths(entry.children || []);
      }
    };
    collectPaths(routers);
    const hasRoute = paths.includes(route);
    const rfqPermissions = identity.permissions.filter(permission => permission.startsWith('oa:rfq:') || permission === '*:*:*').sort();
    navigationObservations.push({ userId, route, hasRoute, rfqPermissions, visiblePaths: paths });
    observe('F5 真实菜单包含当前业务页面 ' + route, hasRoute);
    if (String(userId) === '990000704') {
      observe('AC-16/17 报价录入人只有询价查看和报价权限',
        rfqPermissions.join(',') === 'oa:rfq:list,oa:rfq:quote');
      observe('AC-16/17 报价录入人未获字典、消息及公告授权',
        ['system:lookup:read', 'system:message:mine:list', 'oa:announcement:list']
          .every(permission => !identity.permissions.includes(permission)));
    }
    await remember(page);
    const agreement = page.getByRole('button', { name: '同意并继续', exact: true });
    if (await agreement.isVisible()) await agreement.click();
  };
  const mobile = async source => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true,
      hasTouch: true, deviceScaleFactor: 1, serviceWorkers: 'block', storageState: await source.context().storageState(),
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1' });
    contexts.push(context);
    await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    return context.newPage();
  };
  const open = async (page, target, userId = 990000701) => {
    await navigate(page, '/office/rfqs', userId);
    await page.getByLabel('搜索询价标题', { exact: true }).fill(target.rfq.title);
    await page.getByRole('row').filter({ hasText: target.rfq.title }).getByRole('button', { name: '查看详情', exact: true }).click({ timeout: 60000 });
    const details = page.getByRole('dialog', { name: target.rfq.title, exact: true });
    await details.getByRole('heading', { name: '供应商邀请', exact: true }).waitFor();
    return details;
  };
  const section = (page, parent, title) => parent.locator('section.oa-ops-section').filter({ has: page.getByRole('heading', { name: title, exact: true }) });
  const fit = async (page, locator, name) => {
    const bounds = await locator.evaluate(element => {
      const rectangle = element.getBoundingClientRect();
      return { left: rectangle.left, right: rectangle.right, viewport: innerWidth,
        scrollWidth: element.scrollWidth, clientWidth: element.clientWidth };
    });
    observe(name, bounds.left >= -1 && bounds.right <= bounds.viewport + 1
      && bounds.scrollWidth <= bounds.clientWidth + 1, bounds);
  };
  const assertReadable = async (page, locator, label) => {
    await locator.scrollIntoViewIfNeeded();
    await locator.evaluate(element => element.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' }));
    const actual = await locator.evaluate(element => {
      const bounds = element.getBoundingClientRect();
      const vertical = Math.max(bounds.top + 2, Math.min(bounds.bottom - 2, bounds.top + bounds.height / 2));
      const points = [bounds.left + 2, bounds.right - 2].map(horizontal => document.elementFromPoint(horizontal, vertical));
      return { left: bounds.left, right: bounds.right, top: bounds.top, bottom: bounds.bottom,
        width: bounds.width, height: bounds.height, viewportWidth: innerWidth, viewportHeight: innerHeight,
        scrollWidth: element.scrollWidth, clientWidth: element.clientWidth,
        unobscured: points.every(point => point && element.contains(point)) };
    });
    observe(label, await locator.isVisible() && actual.width > 0 && actual.height > 0
      && actual.left >= 0 && actual.right <= actual.viewportWidth + 1 && actual.top >= 0
      && actual.bottom <= actual.viewportHeight + 1 && actual.unobscured
      && actual.scrollWidth <= actual.clientWidth + 1, actual);
  };
  const comparisonField = (record, screen, index) => screen === 'desktop'
    ? record.getByRole('cell').nth(index) : record.locator('dd').nth(index);
  const readComparisonFields = async (page, record, screen, fields, label) => {
    for (let index = 0; index < fields.length; index++) {
      const [name, expected] = fields[index];
      const field = comparisonField(record, screen, index);
      observe(label + '字段值：' + name, (await field.innerText()).replace(/\s+/g, ' ').trim() === String(expected));
      await assertReadable(page, field, label + '实际可见：' + name);
    }
  };
  const rowFor = (parent, screen, supplierName, accessibleName) => screen === 'desktop'
    ? parent.getByRole('row').filter({ hasText: supplierName })
    : parent.getByRole('listitem', { name: accessibleName, exact: true });
  const money = value => Number(value).toFixed(2);
  const standings = { EXCELLENT: '优秀', QUALIFIED: '合格', WATCH: '观察', ELIMINATED: '淘汰' };
  const saveResponse = (page, endpoint, method = 'POST') => page.waitForResponse(response =>
    new URL(response.url()).pathname === '/api' + endpoint && response.request().method() === method);
  let mobileAdmin;
  let mobileRecorder;
  try {
    mobileAdmin = await mobile(admin);
    mobileRecorder = await mobile(recorder);
    for (const [screen, width, ownerPage, recorderPage] of [
      ['desktop', 1440, admin, recorder], ['mobile', 390, mobileAdmin, mobileRecorder],
      ['mobileNarrow', 320, mobileAdmin, mobileRecorder],
    ]) {
      for (const page of [ownerPage, recorderPage]) await page.setViewportSize({ width, height: screen === 'desktop' ? 1000 : 844 });
      const details = await open(ownerPage, main);
      const panel = section(ownerPage, details, '报价横向比较');
      const views = panel.getByRole('group', { name: '比价视角', exact: true });
      await views.waitFor();
      await views.scrollIntoViewIfNeeded();
      observe('AC-7/9 ' + screen + '默认物料视角显示人民币与美元独立区间',
        await views.getByRole('button', { name: '按物料', exact: true }).getAttribute('aria-pressed') === 'true'
        && (await panel.innerText()).includes('74.68 ~ 80.04') && (await panel.innerText()).includes('76.47')
        && (await panel.innerText()).includes('5.36') && (await panel.innerText()).includes('USD 报价区间'));
      await fit(ownerPage, views, 'AC-9 ' + screen + '比价切换按钮完整可操作');
      for (const label of ['按物料', '按供应商']) await assertReadable(ownerPage, views.getByRole('button', { name: label, exact: true }),
        'AC-9 ' + screen + '比价切换按钮实际可见：' + label);
      await shot(ownerPage, 'comparison-views-' + screen);
      for (const item of comparison.items) {
        const material = panel.locator('.rfq-comparison__item').filter({ has: ownerPage.locator('h4').filter({ hasText: item.itemName }) });
        const record = rowFor(material, screen, first.supplierName, first.supplierName + ' 的' + item.itemName + '报价');
        const quote = item.quotes.find(value => value.supplierId === first.supplierId);
        const content = await record.innerText();
        observe('AC-7/8/9 ' + screen + '物料视角显示实际单价、含税额和供应商评分',
          [quote.currency, money(quote.unitPrice), money(quote.grossAmount), '85.00', '合格'].every(value => content.includes(value)));
        await readComparisonFields(ownerPage, record, screen, [
          ['供应商', first.supplierName], ['币种', quote.currency],
          ['未税单价', money(quote.unitPrice) + (quote.isLowest ? ' · 最低' : '')],
          ['折扣', (Number(quote.discountRate) * 100).toFixed(2) + '%'],
          ['税率', (Number(quote.taxRate) * 100).toFixed(2) + '%'],
          ['含税行额', money(quote.grossAmount)], ['品牌 / 型号', [quote.brand, quote.model].filter(Boolean).join(' / ') || '—'],
          ['交期', (quote.deliveryDays ?? '—') + ' 天' + (quote.isShortestDelivery ? ' · 最短' : '')],
          ['评分 / 分档', '85.00 / 合格'],
        ], 'AC-7/8/9 ' + screen + '物料' + item.rfqItemId + ' ');
        await record.scrollIntoViewIfNeeded();
        if (screen !== 'desktop') await fit(ownerPage, record, 'AC-9 ' + screen + '物料报价明细完整换行');
        await shot(ownerPage, 'comparison-material-' + item.rfqItemId + '-' + screen);
      }
      await views.getByRole('button', { name: '按供应商', exact: true }).click();
      const supplierView = panel.locator('section[aria-label="按供应商比较"]');
      await supplierView.waitFor();
      observe('AC-9 ' + screen + '切换供应商后隐藏物料视角并保留全部四家报价',
        await views.getByRole('button', { name: '按供应商', exact: true }).getAttribute('aria-pressed') === 'true'
        && await panel.locator('.rfq-comparison__items').count() === 0
        && await supplierView.getByRole(screen === 'desktop' ? 'row' : 'listitem').count() === (screen === 'desktop' ? 5 : 4));
      for (const supplier of comparison.suppliers) {
        const record = rowFor(supplierView, screen, supplier.supplierName, supplier.supplierName + ' 总报价');
        const content = await record.innerText();
        observe('AC-7/8 ' + screen + '供应商视角逐家显示真实总额、币种、最低标记和交期',
          content.includes(money(supplier.totalAmount)) && content.includes(supplier.currency)
          && content.includes('最低') === !!supplier.isLowestTotal
          && content.includes('最短交期') === !!supplier.isShortestDelivery
          && content.includes(supplier.score == null ? '未评分' : money(supplier.score))
          && content.includes(standings[supplier.standing] || '—'));
        await readComparisonFields(ownerPage, record, screen, [
          ['供应商', supplier.supplierName],
          ['含税总额 / 币种', money(supplier.totalAmount) + ' ' + supplier.currency + (supplier.isLowestTotal ? ' · 最低' : '')],
          ['税额', money(supplier.taxAmount)],
          ['交期 / 质保', (supplier.deliveryDays ?? '—') + ' 天 / ' + (supplier.warrantyMonths ?? '—') + ' 月'
            + (supplier.isShortestDelivery ? ' · 最短交期' : '')],
          ['付款条件', supplier.paymentTerms || '—'],
          ['评分 / 分档', (supplier.score == null ? '未评分' : money(supplier.score)) + ' / ' + (standings[supplier.standing] || '—')],
          ['排名', supplier.rank], ['操作', '—'],
        ], 'AC-7/8/9 ' + screen + '供应商' + supplier.supplierId + ' ');
        if (screen !== 'desktop') await fit(ownerPage, record, 'AC-9 ' + screen + '供应商完整长名称和报价位于卡片内');
        if (supplier.supplierId === second.supplierId || supplier.currency === 'USD') {
          await record.scrollIntoViewIfNeeded();
          await shot(ownerPage, 'comparison-supplier-' + supplier.supplierId + '-' + screen);
        }
      }
      await views.getByRole('button', { name: '按物料', exact: true }).focus();
      await ownerPage.keyboard.press('Enter');
      observe('AC-9 ' + screen + '键盘切换恢复物料视角且数据保持',
        await views.getByRole('button', { name: '按物料', exact: true }).getAttribute('aria-pressed') === 'true'
        && await panel.locator('.rfq-comparison__item').count() === 2);
      if (screen === 'desktop') await verifyF5RfqWorkbook(ctx, ownerPage, panel);
      const ownerTraffic = await waitFor(() => startupTraffic.get(ownerPage), traffic =>
        ['/dict/data/type/', '/config/client/', '/message/mine/unread-count'].every(fragment =>
          traffic.responses.some(response => response.path.includes(fragment) && response.status === 200)),
      'F5 有权账号未完成实际字典、配置及未读消息读取');
      observe('AC-16/17 ' + screen + '有权账号仍成功读取字典、配置和消息',
        ownerTraffic.requests.length > 0);
      startupObservations.push({ screen, userId: 990000701, ...structuredClone(ownerTraffic) });
      const privateDetails = await open(recorderPage, main, 990000704);
      observe('AC-16/17 ' + screen + '仅报价账号页面隐藏横向比价和导出入口',
        await privateDetails.getByRole('group', { name: '比价视角', exact: true }).count() === 0
        && await privateDetails.getByRole('button', { name: '导出比价表', exact: true }).count() === 0);
      const ownQuotes = section(recorderPage, privateDetails, '当前有权查看的报价');
      const ownQuoteRow = ownQuotes.getByRole('row').filter({ hasText: first.supplierName });
      observe('AC-16/17 ' + screen + '实际页面仅列出该录入人的报价', await ownQuotes.locator('tbody > tr').count() === 1
        && (await ownQuotes.innerText()).includes(first.supplierName));
      const recorderTraffic = startupTraffic.get(recorderPage);
      observe('AC-16/17 ' + screen + '仅报价账号不请求无权字典、配置和消息', recorderTraffic.requests.length === 0);
      observe('AC-16/17 ' + screen + '仅报价账号实际页面无多余403及权限提示',
        !recorderTraffic.responses.some(response => response.status === 403)
        && await recorderPage.locator('[data-sonner-toast]').filter({ hasText: '权限不足' }).count() === 0);
      startupObservations.push({ screen, userId: 990000704, ...structuredClone(recorderTraffic) });
      await assertReadable(recorderPage, ownQuotes.getByRole('heading', { name: '当前有权查看的报价', exact: true }),
        'AC-16/17 ' + screen + '本人报价标题实际可读且无遮挡');
      await assertReadable(recorderPage, ownQuoteRow.getByRole('cell').nth(0),
        'AC-16/17 ' + screen + '本人报价供应商实际可读且无遮挡');
      const ownQuote = successful(await api(recorderPage, '/oa/rfq/' + main.rfq.rfqId + '/quotations'), 'F5本人报价实际内容');
      observe('AC-16/17 ' + screen + '本人报价五项内容与实际服务一致', ownQuote.length === 1
        && (await ownQuoteRow.getByRole('cell').allInnerTexts()).map(value => value.replace(/\s+/g, ' ').trim()).join('|')
          === [first.supplierName, ownQuote[0].quotationNo, money(ownQuote[0].totalAmount) + ' ' + ownQuote[0].currency, '已提交', '查看报价'].join('|'));
      for (const [index, label] of ['供应商', '报价编号', '含税总额 / 币种', '状态', '操作'].entries()) {
        await assertReadable(recorderPage, ownQuoteRow.getByRole('cell').nth(index),
          'AC-16/17 ' + screen + '本人报价完整字段可读：' + label);
      }
      const viewOwnQuote = ownQuoteRow.getByRole('button', { name: '查看报价', exact: true });
      const viewOwnQuoteBounds = await viewOwnQuote.boundingBox();
      observe('AC-16/17 ' + screen + '本人报价查看按钮可操作', await viewOwnQuote.isEnabled()
        && (screen === 'desktop' || viewOwnQuoteBounds.width >= 44 && viewOwnQuoteBounds.height >= 44));
      await ownQuoteRow.scrollIntoViewIfNeeded();
      await shot(recorderPage, 'quotation-privacy-' + screen);
      await navigate(ownerPage, '/admin/reports/rfqs', 990000701);
      const nonLowest = section(ownerPage, ownerPage, '非最低价定标');
      const report = await get('/oa/reports/rfqs?' + new URLSearchParams({ from: ctx.today, to: ctx.today }));
      const expectedReport = report.nonLowest.find(value => String(value.rfqId) === String(main.rfq.rfqId));
      assert.ok(expectedReport);
      const reportRow = screen === 'desktop'
        ? nonLowest.getByRole('row').filter({ hasText: main.rfq.title })
        : nonLowest.locator('[data-report-record="nonLowest"]').filter({ hasText: main.rfq.title });
      await reportRow.waitFor({ timeout: 60000 });
      const reportColumns = [['rfqNo', '询价号'], ['title', '询价'], ['supplierName', '中标供应商'], ['currency', '币种'],
        ['awardedAmount', '中标金额'], ['lowestAmount', '同币种最低金额'], ['awardReason', '定标理由'], ['awardTime', '定标时间']];
      const reportField = (key, index) => screen === 'desktop'
        ? reportRow.getByRole('cell').nth(index) : reportRow.locator('[data-report-value="' + key + '"]');
      observe('AC-20 ' + screen + '实际合规报表与80.04中标、74.68最低价及完整理由相同',
        cents(expectedReport.awardedAmount) === 8004n && cents(expectedReport.lowestAmount) === 7468n
        && expectedReport.awardReason === ctx.awardReason);
      for (let index = 0; index < reportColumns.length; index++) {
        const [key, label] = reportColumns[index];
        const field = reportField(key, index);
        const expected = ['awardedAmount', 'lowestAmount'].includes(key) ? money(expectedReport[key]) : String(expectedReport[key] ?? '—');
        observe('AC-20 ' + screen + '非最低价定标字段值：' + label, (await field.innerText()).trim() === expected);
        await assertReadable(ownerPage, field, 'AC-20 ' + screen + '非最低价定标实际可见：' + label);
      }
      if (screen !== 'desktop') await fit(ownerPage, reportRow, 'AC-20 ' + screen + '合规报表完整字段卡片无横向裁切');
      await assertReadable(ownerPage, reportField('awardedAmount', 4), 'AC-20 ' + screen + '截图显示实际中标金额');
      await shot(ownerPage, 'non-lowest-report-' + screen);
      await assertReadable(ownerPage, reportField('awardReason', 6), 'AC-20 ' + screen + '截图显示完整定标理由');
      await shot(ownerPage, 'non-lowest-reason-' + screen);

      const target = await ctx.createRfq('真实页面报价_' + screen);
      const workspace = await open(ownerPage, target);
      await workspace.getByRole('button', { name: '邀请供应商', exact: true }).click();
      const invitations = ownerPage.getByRole('dialog', { name: '邀请供应商', exact: true });
      await invitations.getByLabel('供应商名称', { exact: true }).fill(watch.supplierName);
      await invitations.getByRole('button', { name: '搜索供应商', exact: true }).click();
      await invitations.locator('label').filter({ hasText: watch.supplierName }).getByRole('checkbox').check();
      const invitationSaving = saveResponse(ownerPage, '/oa/rfq/' + target.rfq.rfqId + '/invite');
      await invitations.getByRole('button', { name: '登记邀请', exact: true }).click();
      const invitationResponse = await invitationSaving;
      const invitationPayload = await invitationResponse.json();
      observe('AC-4/5 ' + screen + '真实页面邀请观察级单家供应商成功且提示家数和准入',
        invitationResponse.status() === 200 && invitationPayload.code === 200 && invitationPayload.data.registered === 1
        && invitationPayload.msg.includes('观察') && invitationResponse.headers()['x-oa-rule-warning'] === 'true');
      await invitations.waitFor({ state: 'hidden' });
      const warning = ownerPage.locator('.cf-toast--warning').filter({ hasText: '观察' }).last();
      await warning.waitFor();
      await fit(ownerPage, warning, 'AC-4/5 ' + screen + '观察级与最少家数提醒完整显示');
      await shot(ownerPage, 'invitation-warning-' + screen);
      await section(ownerPage, workspace, '供应商邀请').getByRole('row').filter({ hasText: watch.supplierName })
        .getByRole('button', { name: '代录报价', exact: true }).click();
      const editor = ownerPage.getByRole('dialog', { name: '供应商报价', exact: true });
      await editor.getByLabel('报价有效期至', { exact: true }).fill(ctx.shifted(30));
      await editor.getByLabel('交付天数', { exact: true }).fill('7');
      await editor.getByLabel('付款条件', { exact: true }).fill('验收后30日付款');
      for (let index = 0; index < 2; index++) {
        const values = ctx.firstPrices[index];
        for (const [label, value] of [['未税单价', values.unitPrice], ['折扣比例', values.discountRate],
          ['税率', values.taxRate], ['明细交付天数', String(values.deliveryDays)],
          ['品牌', 'F5-' + screen + '-品牌-' + index], ['型号', 'F5-' + screen + '-型号-' + index]]) {
          const input = editor.getByLabel(label, { exact: true }).nth(index);
          await assertReadable(ownerPage, input, 'AC-6 ' + screen + '第' + (index + 1) + '行' + label + '输入完整可操作');
          await input.fill(value);
        }
      }
      const uploading = saveResponse(ownerPage, '/oa/rfq/quotation-files');
      await editor.getByLabel('供应商原始报价附件', { exact: true }).setInputFiles({
        name: 'f5-ui-' + screen + '.pdf', mimeType: 'application/pdf',
        buffer: Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\n%F5-' + caseTag + '-' + screen + '\n%%EOF\n'),
      });
      const uploaded = await uploading;
      observe('AC-6 ' + screen + '真实页面上传正式报价附件成功', uploaded.status() === 200 && (await uploaded.json()).code === 200);
      await editor.getByText('已上传，随本次操作保存关联', { exact: true }).waitFor();
      const priceInput = editor.getByLabel('未税单价', { exact: true }).first();
      await priceInput.scrollIntoViewIfNeeded();
      await assertReadable(ownerPage, priceInput, 'AC-6 ' + screen + '报价明细输入可见且可操作');
      await shot(ownerPage, 'quotation-editor-' + screen);
      const quotationSaving = saveResponse(ownerPage, '/oa/rfq/quotations');
      await editor.getByRole('button', { name: '保存报价', exact: true }).click();
      const quotationResponse = await quotationSaving;
      const quotationPayload = await quotationResponse.json();
      assert.equal(quotationResponse.status(), 200); assert.equal(quotationPayload.code, 200);
      await editor.waitFor({ state: 'hidden' });
      const saved = await quotation(quotationPayload.data);
      observe('AC-6 ' + screen + '页面保存真实两行报价、附件及含税总额74.68', saved.items.length === 2
        && saved.quotation.status === 'DRAFT' && cents(saved.quotation.totalAmount) === 7468n
        && cents(saved.quotation.taxAmount) === 611n && !!saved.quotation.attachmentUrl);
      observe('AC-6 ' + screen + '两行品牌型号与页面原输入逐项相同', saved.items.every((item, index) =>
        item.brand === 'F5-' + screen + '-品牌-' + index && item.model === 'F5-' + screen + '-型号-' + index));
      const quoteSection = section(ownerPage, workspace, '当前有权查看的报价');
      const submitting = saveResponse(ownerPage, '/oa/rfq/quotations/' + saved.quotation.quotationId + '/submit');
      await quoteSection.getByRole('button', { name: '提交报价', exact: true }).click();
      const submitted = await submitting;
      observe('AC-6 ' + screen + '页面提交后真实报价与供应商响应状态一致', submitted.status() === 200
        && (await submitted.json()).code === 200
        && (await quotation(saved.quotation.quotationId)).quotation.status === 'SUBMITTED'
        && (await rfq(target.rfq.rfqId)).rfq.respondedCount === 1);
      await quoteSection.getByText('已提交', { exact: true }).waitFor();
      await ownerPage.bringToFront();
      try {
        await ownerPage.locator('.cf-toast').first().waitFor({ state: 'detached', timeout: 12000 });
      } catch (failure) {
        const diagnosticPath = path.join(directory, `f5-submission-toast-timeout-${screen}-${caseTag}.json`);
        const screenshotPath = path.join(directory, `f5-submission-toast-timeout-${screen}-${caseTag}.png`);
        const captured = await Promise.allSettled([
          ownerPage.evaluate(async () => ({
            visibilityState: document.visibilityState,
            hasFocus: document.hasFocus(),
            toastStore: (await import('/src/lib/toastStore.ts')).getToastSnapshot().map(toast => ({
              id: toast.id, type: toast.type, duration: toast.duration, startTime: toast.startTime,
              ageMs: toast.startTime ? Date.now() - toast.startTime : null, removing: toast.removing,
            })),
            toasts: Array.from(document.querySelectorAll('.cf-toast'), element => {
              const bounds = element.getBoundingClientRect();
              const style = getComputedStyle(element);
              return { text: element.textContent, className: element.className,
                display: style.display, visibility: style.visibility, opacity: style.opacity,
                left: bounds.left, top: bounds.top, width: bounds.width, height: bounds.height };
            }),
          })),
          ownerPage.screenshot({ path: screenshotPath, fullPage: false, timeout: 5000 }),
        ]);
        await fs.writeFile(diagnosticPath, JSON.stringify({ screen, failure: failure.message,
          url: ownerPage.url(), capturedAt: new Date().toISOString(),
          page: captured[0].status === 'fulfilled' ? captured[0].value : { failure: String(captured[0].reason) },
          screenshotPath, screenshotCaptured: captured[1].status === 'fulfilled',
          screenshotFailure: captured[1].status === 'rejected' ? String(captured[1].reason) : null,
        }, null, 2), { flag: 'wx' }).catch(() => {});
        throw failure;
      }
      observe('AC-6 ' + screen + '提交页提示自然消失后取图', await ownerPage.locator('.cf-toast').count() === 0);
      const submittedRow = quoteSection.getByRole('row').filter({ hasText: watch.supplierName });
      for (const [index, label] of ['供应商', '报价编号', '含税总额 / 币种', '状态', '操作'].entries()) {
        await assertReadable(ownerPage, submittedRow.getByRole('cell').nth(index),
          'AC-6 ' + screen + '提交页完整字段可读：' + label);
      }
      await quoteSection.scrollIntoViewIfNeeded();
      await shot(ownerPage, 'quotation-submitted-' + screen);
      if (screen === 'desktop') {
        successful(await ctx.invite(target, [second]), 'F5 页面定标增加第二家真实邀请');
        const competing = await ctx.saveQuotation(ctx.quoteBody(target, second, ctx.secondPrices, ctx.ownerFile, { deliveryDays: 2 }));
        await post('/oa/rfq/quotations/' + competing.quotation.quotationId + '/submit');
        ctx.database(`UPDATE oa_purchase_rfq SET quote_deadline=DATE_SUB(CURRENT_DATE,INTERVAL 1 DAY) WHERE tenant_id=100000 AND rfq_id=${target.rfq.rfqId};`);
        await ctx.trigger('oaRfqDeadlineScan');
        const closed = await open(ownerPage, target);
        const closedComparison = section(ownerPage, closed, '报价横向比较');
        await closedComparison.getByRole('button', { name: '按供应商', exact: true }).click();
        await closedComparison.getByRole('row').filter({ hasText: second.supplierName })
          .getByRole('button', { name: '选择定标', exact: true }).click();
        const award = ownerPage.getByRole('dialog', { name: '询价定标', exact: true });
        await award.getByLabel('定标理由', { exact: true }).fill('交期合适');
        const rejectedSaving = saveResponse(ownerPage, '/oa/rfq/' + target.rfq.rfqId + '/award');
        await award.getByRole('button', { name: '保存', exact: true }).click();
        const rejected = await rejectedSaving;
        const rejectedPayload = await rejected.json();
        observe('AC-11 真实定标页面拒绝不足20字理由并保留原输入',
          [rejected.status(), rejectedPayload.code].includes(400)
          && rejectedPayload.msg === '非最低价定标需填写不少于20字的详细理由'
          && await award.getByLabel('定标理由', { exact: true }).inputValue() === '交期合适');
        await ownerPage.locator('.cf-toast--error').filter({ hasText: '不少于20字' }).last().waitFor();
        await shot(ownerPage, 'non-lowest-reason-validation-desktop');
        const acceptedReason = ctx.marker + '_通过实际页面选择交期较短且评分优秀的供应商以保障交付';
        await award.getByLabel('定标理由', { exact: true }).fill(acceptedReason);
        const awarding = saveResponse(ownerPage, '/oa/rfq/' + target.rfq.rfqId + '/award');
        await award.getByRole('button', { name: '保存', exact: true }).click();
        const accepted = await awarding;
        observe('AC-11/12 真实页面完整理由提交定标审批', accepted.status() === 200 && (await accepted.json()).data === 'APPROVING');
        const pending = await waitFor(() => rfq(target.rfq.rfqId), value => value.rfq.instanceId && !value.rfq.instanceId.startsWith('F:'), 'F5 页面定标未进入实际审批');
        await ctx.completeWorkflow(pending.rfq.instanceId);
        await waitFor(() => rfq(target.rfq.rfqId), value => value.rfq.status === 'AWARDED', 'F5 页面定标审批未回写');
        const completed = await open(ownerPage, target);
        observe('AC-12 审批完成后详情实际显示已定标',
          await completed.getByText('已定标', { exact: true }).count() === 1
          && await completed.getByText('定标审批中', { exact: true }).count() === 0);
        const purchasing = saveResponse(ownerPage, '/oa/rfq/' + target.rfq.rfqId + '/purchase');
        await completed.getByRole('button', { name: '生成采购申请', exact: true }).click();
        const purchaseResponse = await purchasing;
        const purchasePayload = await purchaseResponse.json();
        observe('AC-12 真实页面审批后生成80.04元采购且保留来源', purchaseResponse.status() === 200 && purchasePayload.code === 200
          && purchasePayload.data.rfqId === target.rfq.rfqId && cents(purchasePayload.data.totalAmount) === 8004n);
        await ownerPage.getByText('采购草稿已生成，可在采购申请中继续办理', { exact: true }).waitFor();
        await shot(ownerPage, 'award-purchase-desktop');
      }
      observe('F5 ' + screen + '询价页面根容器无横向越界', await ownerPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      evidence[screen] = true;
    }
    evidence.comparisonViews = true;
    evidence.quotationUi = true;
    evidence.awardUi = true;
    evidence.warningUi = true;
    evidence.reportUi = true;
  } catch (failure) {
    await shot(admin, 'admin-failure').catch(() => {});
    await shot(recorder, 'desktop-recorder-failure').catch(() => {});
    if (mobileAdmin) await shot(mobileAdmin, 'mobile-failure').catch(() => {});
    if (mobileRecorder) await shot(mobileRecorder, 'recorder-failure').catch(() => {});
    throw failure;
  } finally {
    await fs.writeFile(path.join(directory, `f5-ui-observations-${caseTag}.json`), JSON.stringify(observations, null, 2), { flag: 'wx' });
    await fs.writeFile(path.join(directory, `f5-navigation-observations-${caseTag}.json`), JSON.stringify(navigationObservations, null, 2), { flag: 'wx' });
    await fs.writeFile(path.join(directory, `f5-startup-permission-observations-${caseTag}.json`), JSON.stringify(startupObservations, null, 2), { flag: 'wx' });
    for (const context of contexts) await context.close();
  }
}
