import assert from 'node:assert/strict';
import path from 'node:path';

export async function verifyOpportunityInterface({ admin, sales, employee, api, successful, database, check, directory, caseTag, main, adminOpportunity, edit, detail, rule, saveRule, evidence }) {
  const navigate = (page, route) => page.goto(new URL(route, page.url()).href, { waitUntil: 'domcontentloaded' });
  const field = (scope, name) => scope.getByLabel(name, { exact: true }).and(scope.locator('input, textarea, select'));
  const settleLayout = async page => {
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await page.waitForFunction(() => document.getAnimations().every(animation => animation.playState !== 'running'
      || animation.effect?.getTiming().iterations === Infinity), null, { timeout: 10000 });
    await page.waitForFunction(() => document.querySelectorAll('[data-sonner-toast]').length === 0, null, { timeout: 15000 });
  };
  const layout = async (page, scope, width, label, buttonName) => {
    await page.setViewportSize({ width, height: 1000 });
    await settleLayout(page);
    const button = scope.getByRole('button', { name: buttonName, exact: true });
    await button.click({ trial: true });
    const bounds = await button.boundingBox();
    const dimensions = await page.evaluate(() => ({ document: document.documentElement.scrollWidth, viewport: window.innerWidth }));
    check(`${label} ${width}px无页面横向溢出且按钮至少44px；页面=${dimensions.document}/${dimensions.viewport}；按钮=${bounds?.width}x${bounds?.height}`,
      dimensions.document <= dimensions.viewport && bounds?.height >= 44 && bounds?.width >= 44);
    await page.screenshot({ path: path.join(directory, `h3-${label}-${caseTag}-${width}.png`), fullPage: true });
  };
  const cellContent = async cell => {
    await cell.scrollIntoViewIfNeeded();
    return cell.evaluate(element => {
      const region = element.closest('[role="region"]');
      const bounds = element.getBoundingClientRect();
      const regionBounds = region.getBoundingClientRect();
      const viewportLeft = regionBounds.left + region.clientLeft;
      const viewportRight = viewportLeft + region.clientWidth;
      const content = [];
      const measure = (rectangle, kind) => {
        const { left, right, top, bottom, width, height } = rectangle;
        if (width === 0 || height === 0) return;
        const inside = left >= viewportLeft - 1 && right <= viewportRight + 1
          && left >= 0 && right <= innerWidth && top >= 0 && bottom <= innerHeight;
        const sampleXs = [left + Math.min(1, width / 2), (left + right) / 2, right - Math.min(1, width / 2)];
        const unobscured = inside && sampleXs.every(horizontal => {
          const hit = document.elementFromPoint(horizontal, (top + bottom) / 2);
          return hit !== null && element.contains(hit);
        });
        content.push({ kind, left, right, top, bottom, width, height, inside, unobscured });
      };
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
      let node;
      while ((node = walker.nextNode())) {
        if (!node.textContent.trim()) continue;
        const range = document.createRange();
        range.selectNodeContents(node);
        for (const rectangle of range.getClientRects()) measure(rectangle, 'text');
      }
      for (const button of element.querySelectorAll('button')) measure(button.getBoundingClientRect(), 'button');
      return { text: element.innerText, left: bounds.left, right: bounds.right, viewportLeft, viewportRight,
        clipped: element.scrollWidth > element.clientWidth + 1, sticky: getComputedStyle(element).position === 'sticky',
        scrollLeft: region.scrollLeft, content, visible: content.length > 0 && content.every(item => item.inside && item.unobscured) };
    });
  };
  const closeDetails = async (page, dialog, label) => {
    await dialog.getByRole('button', { name: '关闭详情', exact: true }).click();
    await dialog.waitFor({ state: 'hidden' });
    await page.getByRole('table', { name: '商机列表', exact: true }).waitFor();
    await settleLayout(page);
    check(`${label}关闭后列表刷新完成且详情保持关闭`, await dialog.count() === 0);
    check(`${label}关闭时移除已处理的商机详情链接参数`, !new URL(page.url()).searchParams.has('opportunityId'));
  };
  const verifyStageRuleColumns = async (page, width, stageName) => {
    await page.setViewportSize({ width, height: 1000 });
    await settleLayout(page);
    const region = page.getByRole('region', { name: '销售阶段规则横向滚动区域', exact: true });
    const table = region.getByRole('table', { name: '销售阶段规则', exact: true });
    const row = table.locator('tbody tr').filter({ hasText: stageName });
    const headers = table.getByRole('columnheader');
    const expected = ['阶段 / 编码', '顺序', '默认赢率', '进入要求', '超期提醒', '状态', '操作'];
    await row.waitFor();
    assert.deepEqual(await headers.allTextContents(), expected);
    check(`阶段规则${width}px说明七列查看方法`, await page.getByText('左右滑动查看全部 7 列；键盘聚焦表格后可用左右方向键。', { exact: true }).isVisible());
    const observed = [];
    evidence.stageRuleColumns ??= [];
    evidence.stageRuleColumns.push({ width, observed, apiDoubles: false });
    for (let index = 0; index < expected.length; index += 1) {
      await headers.nth(index).scrollIntoViewIfNeeded();
      const visibility = await cellContent(row.getByRole('cell').nth(index));
      observed.push({ column: index + 1, header: expected[index], ...visibility });
      check(`阶段规则${width}px第${index + 1}列文字及操作完整可读`, visibility.visible && !visibility.clipped && !visibility.sticky);
      if (index === 0) check(`阶段规则${width}px名称及编码分行显示`, visibility.text.startsWith(`${stageName}\nQUALIFIED`));
      if (index === 0 || (width < 640 && index === 6)) {
        await page.screenshot({ path: path.join(directory, `h3-stage-rule-column-${index + 1}-${caseTag}-${width}.png`), fullPage: true });
      }
    }
    const dimensions = await page.evaluate(() => ({ document: document.documentElement.scrollWidth, viewport: innerWidth }));
    check(`阶段规则${width}px无页面横向溢出`, dimensions.document <= dimensions.viewport);
  };
  const verifyOpportunityList = async (page, width) => {
    await page.setViewportSize({ width, height: 1000 });
    await settleLayout(page);
    const pageHeader = page.locator('.admin-crm-management-page .admin-source-header');
    await pageHeader.scrollIntoViewIfNeeded();
    await settleLayout(page);
    const headingVisibility = await pageHeader.evaluate(header => {
      let leftBoundary = 0;
      let rightBoundary = innerWidth;
      for (let ancestor = header; ancestor; ancestor = ancestor.parentElement) {
        if (!['hidden', 'clip', 'auto', 'scroll'].includes(getComputedStyle(ancestor).overflowX)) continue;
        const bounds = ancestor.getBoundingClientRect();
        leftBoundary = Math.max(leftBoundary, bounds.left + ancestor.clientLeft);
        rightBoundary = Math.min(rightBoundary, bounds.left + ancestor.clientLeft + ancestor.clientWidth);
      }
      const fragments = [];
      for (const element of header.querySelectorAll('h2, span')) {
        const range = document.createRange();
        range.selectNodeContents(element);
        for (const bounds of range.getClientRects()) {
          const { left, right, top, bottom, width: textWidth, height } = bounds;
          if (!textWidth || !height) continue;
          const hit = document.elementFromPoint((left + right) / 2, (top + bottom) / 2);
          fragments.push({ text: element.textContent, left, right, top, bottom,
            inside: left >= leftBoundary && right <= rightBoundary && top >= 0 && bottom <= innerHeight,
            unobscured: hit !== null && element.contains(hit) });
        }
      }
      return { width: innerWidth, leftBoundary, rightBoundary, fragments };
    });
    evidence.opportunityPageHeaders ??= [];
    evidence.opportunityPageHeaders.push(headingVisibility);
    check(`商机列表${width}px标题与完整说明位于可见区域且未被遮挡`, headingVisibility.fragments.length >= 2
      && headingVisibility.fragments.every(fragment => fragment.inside && fragment.unobscured));
    await page.screenshot({ path: path.join(directory, `h3-opportunity-header-${caseTag}-${width}.png`), fullPage: false });
    const region = page.getByRole('region', { name: '商机列表横向滚动区域', exact: true });
    const table = region.getByRole('table', { name: '商机列表', exact: true });
    const row = table.locator('tbody tr').filter({ hasText: main.opportunityName });
    const headers = table.getByRole('columnheader');
    assert.equal(await row.count(), 1);
    assert.equal(await headers.count(), 7);
    const observed = [];
    evidence.opportunityListColumns ??= [];
    evidence.opportunityListColumns.push({ width, observed, apiDoubles: false });
    for (let index = 0; index < 7; index += 1) {
      await headers.nth(index).scrollIntoViewIfNeeded();
      const cell = row.getByRole('cell').nth(index);
      const visible = await cellContent(cell);
      observed.push({ column: index + 1, ...visible });
      check(`商机列表${width}px第${index + 1}列文字及按钮可完整查看且操作列不遮挡`, visible.visible && !visible.clipped && !visible.sticky);
      if ([0, 6].includes(index)) await page.screenshot({ path: path.join(directory, `h3-opportunity-list-column-${index + 1}-${caseTag}-${width}.png`), fullPage: true });
    }
    for (const button of await row.getByRole('button').all()) {
      const size = await button.boundingBox();
      check(`商机列表${width}px“${await button.getAttribute('aria-label')}”操作至少44px`, size?.width >= 44 && size?.height >= 44);
    }
    const dimensions = await page.evaluate(() => ({ document: document.documentElement.scrollWidth, viewport: innerWidth }));
    check(`商机列表${width}px无页面横向溢出`, dimensions.document <= dimensions.viewport);
    await row.getByRole('button', { name: '查看详情', exact: true }).click();
    const details = page.getByRole('dialog', { name: '商机详情', exact: true });
    await details.getByRole('heading', { name: main.opportunityName, exact: true }).waitFor();
    check(`商机列表${width}px从操作列打开正确商机`, await details.getByRole('heading', { name: main.opportunityName, exact: true }).isVisible());
    await closeDetails(page, details, `商机列表${width}px`);
  };
  const verifyAnalysisColumns = async (page, width, stageName) => {
    const region = page.getByRole('region', { name: '阶段明细（人民币，单位元）横向滚动区域', exact: true });
    const table = region.getByRole('table', { name: '阶段明细（人民币，单位元）', exact: true });
    const headers = table.getByRole('columnheader');
    const expected = ['阶段', '当前商机', '当前预计金额', '加权金额', '完整区间 / 平均停留', '未退出区间 / 已停留合计', '期初无历史', '转化数 / 队列数 / 转化率', '队列赢单 / 丢单'];
    await table.locator('tbody tr').first().waitFor();
    assert.deepEqual(await headers.allTextContents(), expected);
    check(`阶段分析${width}px说明全部九列的查看方法`, await page.getByText('左右滑动查看全部 9 列；键盘聚焦表格后可用左右方向键。', { exact: true }).isVisible());
    const sample = table.locator('tbody tr').filter({ hasText: stageName });
    assert.equal(await sample.count(), 1, 'Actual renamed stage must appear once in the analysis table');
    await region.scrollIntoViewIfNeeded();
    await region.evaluate(element => { element.scrollLeft = 0; });
    if (width < 640) {
      const handle = await region.elementHandle();
      try {
        await region.focus();
        await page.keyboard.press('ArrowRight');
        await page.waitForFunction(element => element.scrollLeft > 0, handle, { timeout: 3000 });
        check(`阶段分析${width}px可通过键盘向右查看数据`, await region.evaluate(element => element === document.activeElement && element.scrollLeft > 0));
        await region.hover();
        const initialScroll = await region.evaluate(element => element.scrollLeft);
        await page.mouse.wheel(180, 0);
        await page.waitForFunction(({ element, initial }) => element.scrollLeft > initial, { element: handle, initial: initialScroll }, { timeout: 3000 });
        check(`阶段分析${width}px真实横向滚动输入可移动表格`, await region.evaluate(element => element.scrollLeft) > initialScroll);
      } finally { await handle.dispose(); }
    }
    const observed = [];
    evidence.analysisColumns ??= [];
    evidence.analysisColumns.push({ width, observed, apiDoubles: false });
    for (let index = 0; index < expected.length; index += 1) {
      await headers.nth(index).scrollIntoViewIfNeeded();
      const cell = sample.getByRole('cell').nth(index);
      const visibility = await cellContent(cell);
      observed.push({ column: index + 1, header: expected[index], ...visibility });
      check(`阶段分析${width}px第${index + 1}列“${expected[index]}”可完整滑动查看且未被末列遮挡`,
        visibility.visible && !visibility.clipped && !visibility.sticky && visibility.text.trim().length > 0);
      if (index === 2 || index === 3) check(`阶段分析${width}px第${index + 1}列金额保留两位小数`, /^-?[\d,]+\.\d{2}(?:\n|$)/.test(visibility.text));
      if (index === 4 || index === 5) check(`阶段分析${width}px第${index + 1}列停留时长与次数均可读`, /次/.test(visibility.text) && /(?:\d+\.\d{2} 天|无完整区间)/.test(visibility.text));
      if (width < 640 && [2, 4, 8].includes(index)) {
        await page.screenshot({ path: path.join(directory, `h3-analysis-column-${index + 1}-${caseTag}-${width}.png`), fullPage: true });
      }
    }
    await region.evaluate(element => { element.scrollLeft = 0; });
  };
  const pendingSave = async (page, dialog, catalogueAllowed, opportunityId = main.opportunityId) => {
    let releaseResponse;
    const delay = new Promise(resolve => { releaseResponse = resolve; });
    let responseArrived;
    const observed = new Promise(resolve => { responseArrived = resolve; });
    let responseFinished;
    const finished = new Promise(resolve => { responseFinished = resolve; });
    let started = false;
    let routeFailure;
    const routePattern = `**/api/crm/opportunity/${opportunityId}/items`;
    const holdActualResponse = async route => {
      if (route.request().method() !== 'PUT') return route.continue();
      started = true;
      try {
        const response = await route.fetch({ timeout: 20000 });
        responseArrived({ status: response.status(), body: await response.json() });
        await delay;
        await route.fulfill({ response });
      } catch (failure) {
        routeFailure = failure;
        responseArrived({ failure: failure.message });
      } finally { responseFinished(); }
    };
    await page.route(routePattern, holdActualResponse);
    let timeout;
    try {
      await dialog.getByRole('button', { name: '保存产品明细', exact: true }).click();
      const actual = await Promise.race([observed, new Promise((resolve, reject) => { timeout = setTimeout(() => reject(new Error('真实保存响应未到达')), 20000); })]);
      check('延迟的是实际服务器成功响应，没有替换业务结果', actual.status === 200 && actual.body.code === 200);
      const catalogue = field(dialog, '第1行产品目录');
      check(catalogueAllowed ? '有目录权限的管理员保存中产品目录不可操作' : '销售没有产品目录权限时不显示目录选项',
        catalogueAllowed ? await catalogue.count() === 1 && await catalogue.isDisabled() : await catalogue.count() === 0);
      check('保存中金额及关闭按钮均不可操作', await field(dialog, '第1行单价').isDisabled() && await dialog.getByRole('button', { name: '正在处理业务数据…', exact: true }).isDisabled());
      await page.keyboard.press('Escape');
      check('保存中Escape不能关闭并丢弃响应', await dialog.isVisible());
    } finally {
      clearTimeout(timeout);
      releaseResponse();
      if (started) await finished;
      await page.unroute(routePattern, holdActualResponse);
    }
    if (routeFailure) throw routeFailure;
    await dialog.getByRole('button', { name: '关闭详情', exact: true }).waitFor();
  };
  await navigate(admin, '/crm/sales-stages');
  await admin.getByRole('heading', { name: '销售阶段规则', level: 2, exact: true }).waitFor();
  const qualified = await rule('QUALIFIED');
  await admin.getByRole('button', { name: `维护${qualified.stageName}`, exact: true }).click();
  const editor = admin.getByRole('dialog', { name: '维护销售阶段', exact: true });
  await field(editor, '默认赢率（%）').fill('101');
  await editor.getByRole('button', { name: '保存阶段规则', exact: true }).click();
  await editor.getByRole('alert').waitFor();
  check('阶段规则输入错误保留原输入并明确显示0—100校验', await field(editor, '默认赢率（%）').inputValue() === '101' && (await editor.getByRole('alert').textContent()).includes('0至100'));
  await field(editor, '默认赢率（%）').fill('30');
  const displayName = `需求确认_${caseTag}`;
  await field(editor, '显示名称').fill(displayName);
  await saveRule('QUALIFIED', { overdueDays: 7 });
  await editor.getByRole('button', { name: '保存阶段规则', exact: true }).click();
  await editor.getByRole('button', { name: '读取最新规则（保留草稿）', exact: true }).waitFor();
  check('并发规则变更后页面保留用户名称和旧版本输入', await field(editor, '显示名称').inputValue() === displayName);
  await editor.getByRole('button', { name: '读取最新规则（保留草稿）', exact: true }).click();
  await editor.getByRole('button', { name: '已核对，采用新版本并保留输入', exact: true }).click();
  for (const width of [1440, 375, 320]) await layout(admin, editor, width, 'stage-rule', '保存阶段规则');
  const ruleResponse = admin.waitForResponse(response => response.url().endsWith('/crm/sales-stage') && response.request().method() === 'PUT');
  await editor.getByRole('button', { name: '保存阶段规则', exact: true }).click();
  const savedRule = await ruleResponse;
  check('页面核对新版本后真实保存规则', savedRule.status() === 200 && (await savedRule.json()).code === 200);
  await editor.waitFor({ state: 'hidden' });
  check('页面填写的规则显示名称确实落库', (await rule('QUALIFIED')).stageName === displayName);
  for (const width of [1440, 375, 320]) await verifyStageRuleColumns(admin, width, displayName);
  await navigate(sales, '/crm/sales-stages');
  await sales.getByRole('heading', { name: '销售阶段规则', level: 2, exact: true }).waitFor();
  check('销售代表的规则页面不显示维护和新增按钮', await sales.getByRole('button', { name: /^(新增阶段|维护)/ }).count() === 0);
  await employee.setViewportSize({ width: 375, height: 1000 });
  await navigate(employee, '/crm/sales-stages');
  check('员工手机入口不展示阶段维护按钮', await employee.getByRole('button', { name: '新增阶段', exact: true }).count() === 0);
  const reminderSource = `h3-reminder-${caseTag}`;
  await navigate(sales, `/office/crm/opportunities?opportunityId=${main.opportunityId}&source=${reminderSource}`);
  const dialog = sales.getByRole('dialog', { name: '商机详情', exact: true });
  await dialog.waitFor();
  await dialog.getByRole('heading', { name: main.opportunityName, exact: true }).waitFor();
  check('带商机ID的提醒链接自动打开真实详情', await dialog.getByRole('heading', { name: main.opportunityName, exact: true }).isVisible());
  await dialog.getByRole('tab', { name: '产品明细', exact: true }).click();
  const price = field(dialog, '第1行单价');
  await price.fill('21.5000');
  await dialog.getByRole('tab', { name: '基本信息', exact: true }).click();
  check('产品草稿未保存时禁用其他商机写操作', await dialog.getByRole('button', { name: '编辑基本信息', exact: true }).isDisabled());
  await dialog.getByRole('tab', { name: '产品明细', exact: true }).click();
  check('来回切换面板保留未保存产品草稿', await price.inputValue() === '21.5000');
  await dialog.getByRole('button', { name: '关闭详情', exact: true }).click();
  const discard = sales.getByRole('dialog', { name: '放弃未保存的产品明细？', exact: true });
  await discard.waitFor();
  check('有草稿关闭详情必须明确确认', await discard.getByRole('button', { name: '放弃草稿并关闭', exact: true }).isVisible());
  await discard.getByRole('button', { name: '继续编辑', exact: true }).click();
  check('取消关闭后草稿仍然保留', await price.inputValue() === '21.5000');
  await edit(await detail(main.opportunityId), { remark: '页面编辑期间发生真实并发更新' });
  await dialog.getByRole('button', { name: '保存产品明细', exact: true }).click();
  const readLatest = dialog.getByRole('button', { name: '读取最新明细（保留草稿）', exact: true });
  await readLatest.waitFor();
  check('产品实际版本冲突保留金额输入', await price.inputValue() === '21.5000' && await dialog.getByRole('alert').count() > 0);
  await readLatest.click();
  await dialog.getByRole('button', { name: '已核对，保留草稿并采用最新版本', exact: true }).click();
  for (const width of [1440, 375, 320]) await layout(sales, dialog, width, 'products', '保存产品明细');
  await pendingSave(sales, dialog, false);
  const savedItems = successful(await api(sales, `/crm/opportunity/${main.opportunityId}/items`), '核对页面真实保存产品');
  check('手机页面新版本产品保存实际为未税58.05元及含税65.60元', Number(savedItems.items[0].unitPrice) === 21.5 && Number(savedItems.subtotal) === 58.05 && Number(savedItems.totalAmount) === 65.6);
  await dialog.getByRole('tab', { name: '阶段历史', exact: true }).click();
  check('页面显示真实阶段回退历史原因', await dialog.getByRole('cell', { name: `H3_${caseTag}客户要求重新确认需求`, exact: true }).count() === 1);
  await closeDetails(sales, dialog, '提醒链接详情');
  check('关闭提醒详情保留其他链接参数', new URL(sales.url()).searchParams.get('source') === reminderSource);
  await sales.reload({ waitUntil: 'domcontentloaded' });
  await sales.getByRole('table', { name: '商机列表', exact: true }).waitFor();
  await settleLayout(sales);
  check('关闭提醒详情后重新加载页面仍保持关闭', await dialog.count() === 0);
  evidence.closedDetailsRemainClosed = true;
  for (const width of [375, 320]) await verifyOpportunityList(sales, width);
  await navigate(admin, `/office/crm/opportunities?opportunityId=${adminOpportunity.opportunityId}`);
  const adminDialog = admin.getByRole('dialog', { name: '商机详情', exact: true });
  await adminDialog.getByRole('heading', { name: adminOpportunity.opportunityName, exact: true }).waitFor();
  await adminDialog.getByRole('tab', { name: '产品明细', exact: true }).click();
  await field(adminDialog, '第1行单价').fill('21.5000');
  await pendingSave(admin, adminDialog, true, adminOpportunity.opportunityId);
  await adminDialog.getByRole('button', { name: '关闭详情', exact: true }).click();
  await adminDialog.waitFor({ state: 'hidden' });
  await navigate(sales, '/crm/stage-analysis');
  await sales.getByRole('heading', { name: '销售阶段分析', level: 2, exact: true }).waitFor();
  await sales.getByRole('table', { name: '阶段明细（人民币，单位元）', exact: true }).locator('tbody tr').first().waitFor();
  for (const width of [1440, 375, 320]) {
    await layout(sales, sales, width, 'analysis', '查询分析');
    await verifyAnalysisColumns(sales, width, displayName);
  }
  check('分析页面明确列出期内去重队列及完整停留口径', await sales.getByText(/队列 = 进入期内曾进入该阶段的去重商机/).isVisible());
  await sales.reload({ waitUntil: 'domcontentloaded' });
  await sales.getByRole('heading', { name: '销售阶段分析', level: 2, exact: true }).waitFor();
  check('手机直接刷新分析路由仍正常受权限保护', await sales.getByRole('button', { name: '查询分析', exact: true }).isVisible());
  assert.equal(database(`SELECT COUNT(*) FROM crm_opportunity_item WHERE tenant_id=100000 AND opportunity_id=${main.opportunityId} AND deleted=0;`), '1');
  evidence.desktop = true;
  evidence.mobile = true;
  evidence.transportDelayOnly = true;
}
