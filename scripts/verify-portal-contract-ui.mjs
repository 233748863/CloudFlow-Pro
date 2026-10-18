import assert from 'node:assert/strict';
import path from 'node:path';
import { waitForShellLayout } from './portal-checks/wait-shell-layout.mjs';
import { measurePortalContent, measurePortalControls } from './portal-checks/measure-content-bounds.mjs';
import { scrollPortalContent } from './portal-checks/scroll-portal-content.mjs';

export async function verifyPortalContractInterface(context) {
  const { admin, api, successful, database, check, directory, caseTag, origin, tenantCode, first, password, secrets, evidence,
    primary, other, prefix, privateMarker, publicText, sourceText, today, publication, save, detail, waitFor, portalCall } = context;
  const page = await admin.context().newPage();
  await page.addInitScript(() => {
    const schedule = window.setInterval.bind(window);
    const refresh = { intervalMs: 0, naturalTicks: 0, paused: false, fire: undefined };
    window.contractRefreshVerification = refresh;
    window.setInterval = (callback, interval, ...arguments_) => {
      if (interval !== 30000 || typeof callback !== 'function' || !new Error().stack?.includes('PortalContractPage.tsx')) {
        return schedule(callback, interval, ...arguments_);
      }
      refresh.intervalMs = interval;
      refresh.fire = () => callback(...arguments_);
      return schedule(() => {
        if (refresh.paused) return;
        if (document.visibilityState === 'visible') refresh.naturalTicks++;
        callback(...arguments_);
      }, interval);
    };
  });
  const failures = [];
  const sent = [];
  page.on('pageerror', error => failures.push(error.message));
  page.on('request', request => {
    const pathname = new URL(request.url()).pathname;
    if (pathname.startsWith('/api/portal/')) sent.push({ pathname, method: request.method(), headers: request.headers() });
  });
  const internalToken = await admin.evaluate(async () => (await import('/src/utils/authStorage.ts')).getAuthToken());
  const internalSession = async label => {
    const result = successful(await api(admin, '/auth/info'), label);
    assert.ok(result.user?.userId && result.user?.tenantId, '真实内部会话须包含用户及租户身份');
    return { userId: String(result.user.userId), tenantId: String(result.user.tenantId) };
  };
  const internalBefore = await internalSession('读取门户操作前的真实内部身份');
  const listPattern = '**/api/portal/crm/contract/list?*';
  const detailPattern = `**/api/portal/crm/contract/${primary.id}`;
  const maintenancePattern = `**/api/oa/contract/${primary.id}/portal-publication`;
  const internalDetailLayout = async (dialog, width, label) => {
    await admin.setViewportSize({ width, height: 1000 }); await waitForShellLayout(admin);
    const header = dialog.locator('.modal-header');
    const status = header.getByText('已通过', { exact: true }); await status.waitFor();
    const headerContent = await measurePortalContent(header);
    const statusGeometry = await status.evaluate(element => {
      const range = document.createRange(); range.selectNodeContents(element);
      const lines = [...range.getClientRects()].filter(line => line.width > 0 && line.height > 0);
      const bounds = element.getBoundingClientRect();
      return { text: element.textContent, lines: new Set(lines.map(line => Math.round(line.top))).size,
        left: bounds.left, right: bounds.right, width: bounds.width, height: bounds.height };
    });
    check(`${label}${width}px详情完整合同编号与标题状态均在弹窗内且状态单行`, headerContent.valid
      && await header.getByRole('heading', { name: primary.contractNo, exact: true }).innerText() === primary.contractNo
      && statusGeometry.text === '已通过' && statusGeometry.lines === 1);
    const summary = dialog.getByRole('region', { name: '合同概览', exact: true });
    await summary.getByText('已通过', { exact: true }).waitFor();
    await scrollPortalContent(summary, `${label}-${width}-合同概览`);
    const summaryContent = await measurePortalContent(summary);
    const geometry = await summary.evaluate(element => {
      const panel = element.closest('.cf-dialog-panel').getBoundingClientRect();
      const body = element.closest('.cf-dialog-body').getBoundingClientRect();
      const cards = [...element.querySelectorAll('article')].map(card => {
        const bounds = card.getBoundingClientRect();
        return { label: card.querySelector('p')?.textContent, left: bounds.left, right: bounds.right,
          top: bounds.top, bottom: bounds.bottom, width: bounds.width, height: bounds.height };
      });
      return { panel: { left: panel.left, right: panel.right }, body: { top: body.top, bottom: body.bottom }, cards,
        columns: new Set(cards.map(card => Math.round(card.left))).size };
    });
    console.log(`H3_PORTAL_CONTRACT_DETAIL: label=${label}; width=${width}; header=${JSON.stringify(statusGeometry)}; summary=${JSON.stringify(geometry)}`);
    check(`${label}${width}px合同金额风险状态附件四卡完整位于弹窗可见区域`, summaryContent.valid
      && geometry.cards.map(card => card.label).join(',') === '合同金额,风险等级,合同状态,附件数量'
      && geometry.columns === (width === 1440 ? 2 : 1)
      && geometry.cards.every(card => card.width > 0 && card.height > 0 && card.left >= geometry.panel.left
        && card.right <= geometry.panel.right && card.top >= geometry.body.top - 1 && card.bottom <= geometry.body.bottom + 1));
    await admin.screenshot({ path: path.join(directory, `h3-contract-${label}-摘要-${width}-${caseTag}.png`), fullPage: false });
  };
  const layout = async (target, scope, width, label) => {
    await target.setViewportSize({ width, height: 1000 }); await waitForShellLayout(target);
    const internal = label === '保存处理中' || label === '内部逐项公开';
    const firstContent = internal ? scope.getByRole('heading', { name: '客户门户公开范围', exact: true })
      : label === '门户列表' ? scope.getByRole('heading', { name: '本公司合同', exact: true }) : scope.locator('dl').first();
    await scrollPortalContent(firstContent, `${label}-${width}-顶部`);
    const content = await measurePortalContent(scope);
    console.log(`H3_PORTAL_CONTRACT_CONTENT: label=${label}; width=${width}; geometry=${JSON.stringify(content)}`);
    check(`${label}${width}px内容卡片和实际文字行均在屏幕内`, content.valid);
    const geometry = await scope.evaluate(element => ({ viewport: innerWidth, scroll: document.documentElement.scrollWidth,
      left: element.getBoundingClientRect().left, right: element.getBoundingClientRect().right,
      buttons: [...element.querySelectorAll('button')].filter(button => button.getClientRects().length).map(button => ({ width: button.getBoundingClientRect().width, height: button.getBoundingClientRect().height })),
      choices: [...element.querySelectorAll('.contract-portal-choice')].map(choice => choice.getBoundingClientRect().height),
    }));
    check(`${label}${width}px无横向溢出且按钮和勾选区至少44px`, geometry.scroll <= geometry.viewport && geometry.left >= 0 && geometry.right <= geometry.viewport + 1
      && geometry.buttons.length > 0 && geometry.buttons.every(button => button.width >= 44 && button.height >= 44) && geometry.choices.every(height => height >= 44));
    await target.screenshot({ path: path.join(directory, `h3-contract-${label}-顶部-${width}-${caseTag}.png`), fullPage: false });
    if (internal || label === '门户详情') {
      const middle = scope.getByRole('region', { name: internal ? '选择公开关键节点' : '公开关键节点', exact: true });
      await scrollPortalContent(middle.getByRole('heading'), `${label}-${width}-关键节点`);
      await target.screenshot({ path: path.join(directory, `h3-contract-${label}-关键节点-${width}-${caseTag}.png`), fullPage: false });
    }
    const action = internal ? scope.getByRole('button', { name: /^(保存公开选择|正在保存…)$/ })
      : label === '门户列表' ? scope.getByRole('button', { name: `查看合同 ${primary.contractNo}`, exact: true })
      : scope.getByRole('button', { name: '核对最新状态', exact: true });
    if (label === '门户详情') await scrollPortalContent(scope.getByRole('region', { name: '公开付款计划', exact: true }), `${label}-${width}-付款计划`);
    await scrollPortalContent(action, `${label}-${width}-关键操作`);
    const controls = await measurePortalControls(action);
    check(`${label}${width}px关键操作完整位于实际视口且无遮挡`, controls.allVisible);
    await target.screenshot({ path: path.join(directory, `h3-contract-${label}-${width}-${caseTag}.png`), fullPage: false });
  };
  let release;
  let interception;
  const routeFailures = [];
  try {
    await page.bringToFront(); await page.goto(`${origin}/portal/${tenantCode}/login`, { waitUntil: 'domcontentloaded' });
    await page.getByLabel('登录账号', { exact: true }).fill(first.account); await page.getByLabel('密码', { exact: true }).fill(password);
    await waitFor(() => page.getByRole('button', { name: '登录', exact: true }).isEnabled(), Boolean, '合同页面真实门户登录未就绪');
    await page.getByRole('button', { name: '登录', exact: true }).click();
    await page.getByRole('button', { name: '本公司合同', exact: true }).waitFor();
    const uiToken = await page.evaluate(code => JSON.parse(sessionStorage.getItem('cloudflow.portal.session:' + code) || 'null')?.token, tenantCode);
    assert.match(uiToken, /^p_[A-Za-z0-9_-]{43}$/); secrets.push(uiToken);
    await page.getByRole('button', { name: '本公司合同', exact: true }).click();
    await page.getByRole('heading', { name: '本公司合同', exact: true }).waitFor();
    const search = page.getByRole('textbox', { name: '合同名称或编号', exact: true });
    await search.fill(prefix); await page.getByRole('button', { name: '搜索', exact: true }).click();
    await page.getByRole('article', { name: `合同 ${primary.contractNo}`, exact: true }).waitFor();
    check('门户首页入口进入本公司合同列表，搜索保留且未显示草稿合同', await search.inputValue() === prefix
      && await page.getByRole('article', { name: `合同 ${other.contractNo}`, exact: true }).count() === 1
      && !(await page.getByRole('main').innerText()).includes(`${prefix}_legal`));
    check('门户合同分页首页禁用上一页，不足十条禁用下一页', await page.getByRole('button', { name: '上一页', exact: true }).isDisabled()
      && await page.getByRole('button', { name: '下一页', exact: true }).isDisabled());
    for (const width of [1440, 375, 320]) await layout(page, page.getByRole('main'), width, '门户列表');
    await page.getByRole('button', { name: `查看合同 ${primary.contractNo}`, exact: true }).click();
    let clientDialog = page.getByRole('dialog', { name: primary.contractName, exact: true });
    await clientDialog.getByText(sourceText, { exact: true }).waitFor();
    check('条款中的HTML以原文显示，不执行脚本或载入图片', await page.evaluate(() => !window.contractMarkupExecuted)
      && await clientDialog.locator('img,script,iframe,a').count() === 0 && !(await clientDialog.innerText()).includes(privateMarker));
    for (const width of [1440, 375, 320]) await layout(page, clientDialog, width, '门户详情');
    database(`UPDATE oa_contract SET amount=9999999999999999.99 WHERE tenant_id=100000 AND contract_id=${primary.id};`);
    try {
      await clientDialog.getByRole('button', { name: '核对最新状态', exact: true }).click();
      await clientDialog.getByText('CNY 9,999,999,999,999,999.99', { exact: true }).waitFor();
      check('浏览器完整显示18位合同金额且不经浮点数舍入', await clientDialog.getByText('CNY 9,999,999,999,999,999.99', { exact: true }).isVisible());
    } finally { database(`UPDATE oa_contract SET amount=100.01 WHERE tenant_id=100000 AND contract_id=${primary.id};`); }
    await clientDialog.getByRole('button', { name: '关闭', exact: true }).click();
    check('门户登录和合同读取不改变原内部页面的内存令牌', internalToken === await admin.evaluate(async () => (await import('/src/utils/authStorage.ts')).getAuthToken()));
    await admin.bringToFront(); await admin.setViewportSize({ width: 1440, height: 1000 });
    await admin.goto(`${origin}/office/contracts`, { waitUntil: 'domcontentloaded' });
    await admin.getByPlaceholder('合同名称', { exact: true }).fill(primary.contractName);
    const row = admin.getByRole('row').filter({ hasText: primary.contractName }); await row.waitFor();
    await row.getByRole('button', { name: '查看详情', exact: true }).click();
    const dialog = admin.getByRole('dialog', { name: primary.contractNo, exact: true });
    const panel = dialog.getByRole('region', { name: '客户门户公开范围', exact: true });
    const performance = dialog.getByRole('region', { name: '合同销售业绩', exact: true });
    const termOne = panel.getByRole('checkbox', { name: '公开条款 1', exact: true });
    const termTwo = panel.getByRole('checkbox', { name: '公开条款 2', exact: true });
    const milestoneTwo = panel.getByRole('checkbox', { name: `公开节点 2 · 节点_2_${caseTag}`, exact: true });
    const paymentTwo = panel.getByRole('checkbox', { name: `公开付款计划 2 · 付款计划_2_${caseTag}`, exact: true });
    const submit = panel.getByRole('button', { name: /^(保存公开选择|正在保存…)$/ });
    await termOne.waitFor(); await waitFor(() => termOne.isEnabled(), Boolean, '公开维护候选未加载');
    const internalNavigationToken = await admin.evaluate(async () => (await import('/src/utils/authStorage.ts')).getAuthToken());
    const internalAfterNavigation = await internalSession('整页跳转后通过真实内部接口核对身份');
    check('内部整页跳转重建页面后仍可使用同一用户与租户会话', internalAfterNavigation.userId === internalBefore.userId && internalAfterNavigation.tenantId === internalBefore.tenantId);
    console.log(`H3_PORTAL_CONTRACT_INTERNAL_NAVIGATION: memory_recreated=${internalNavigationToken !== internalToken}; same_identity=true; real_http=true; credential_values_logged=false`);
    check('内部公开面板读取已保存选择并展示真实客户可见字段', await termOne.isChecked() && !await termTwo.isChecked()
      && !(await panel.innerText()).includes(privateMarker));
    await termTwo.check(); await admin.keyboard.press('Escape');
    check('公开草稿阻止详情关闭并暂停相邻业绩写入', await dialog.isVisible() && await dialog.getByRole('button', { name: '关闭', exact: true }).last().isDisabled()
      && await performance.getByRole('button', { name: '核对最新结果', exact: true }).isDisabled());
    await termTwo.uncheck();
    const date = performance.getByLabel('补填合同开始日期', { exact: true });
    await date.waitFor(); await date.fill(today);
    check('业绩补填草稿同样暂停公开面板，两个保护来源不会互相覆盖', await termOne.isDisabled() && await panel.getByRole('button', { name: '核对最新结果', exact: true }).isDisabled()
      && await dialog.getByRole('button', { name: '关闭', exact: true }).last().isDisabled());
    await performance.getByRole('button', { name: '放弃补填草稿', exact: true }).click();
    await waitFor(() => termTwo.isEnabled(), Boolean, '放弃补填草稿后公开面板未恢复');
    await termTwo.check(); await milestoneTwo.check(); await paymentTwo.check();
    let writes = 0; let accepted = false; let intercepted = false;
    const gate = new Promise(resolve => { release = resolve; });
    interception = async route => {
      if (route.request().method() !== 'PUT') return route.continue();
      try {
        writes++; const response = await route.fetch(); const result = await response.json();
        assert.equal(response.status(), 200); assert.equal(result.code, 200); accepted = true;
        await gate; await route.abort('connectionreset');
      } catch (failure) { routeFailures.push(failure); await route.abort('failed').catch(() => {}); }
      finally { intercepted = true; }
    };
    await admin.route(maintenancePattern, interception); await submit.dblclick();
    await waitFor(() => { if (routeFailures.length) throw routeFailures[0]; return accepted; }, Boolean, '实际公开保存未返回成功，不能测试丢响应');
    check('服务器保存后响应未返回时禁止勾选、重复提交和关闭', await termTwo.isDisabled() && await submit.isDisabled()
      && await dialog.getByRole('button', { name: '关闭', exact: true }).last().isDisabled());
    for (const width of [1440, 375, 320]) {
      await layout(admin, panel, width, '保存处理中');
      await internalDetailLayout(dialog, width, '保存处理中');
    }
    await admin.keyboard.press('Escape'); check('保存中跨宽度和Escape保留原草稿且只提交一次', await dialog.isVisible() && await termTwo.isChecked() && writes === 1);
    release(); await waitFor(() => { if (routeFailures.length) throw routeFailures[0]; return intercepted; }, Boolean, '真实成功响应截断尚未结束');
    await admin.unroute(maintenancePattern, interception); interception = undefined;
    await panel.getByRole('alert').waitFor();
    check('保存成功响应丢失后保留勾选并禁止自动重试', await termTwo.isChecked() && await milestoneTwo.isChecked() && await paymentTwo.isChecked() && await submit.isDisabled());
    await panel.getByRole('button', { name: '核对最新结果', exact: true }).click();
    const review = panel.getByRole('complementary', { name: '公开范围核对结果', exact: true }); await review.waitFor();
    check('只读核对显示服务器已保存两项，草稿未被覆盖', (await review.innerText()).includes('已选条款 2 项') && await termTwo.isChecked() && writes === 1);
    await review.getByRole('button', { name: '采用服务器结果', exact: true }).click();
    check('明确采用已保存结果后恢复关闭，没有再次写入', await dialog.getByRole('button', { name: '关闭', exact: true }).last().isEnabled() && writes === 1);
    evidence.lostResponse = true;
    await termOne.uncheck(); await save(primary, 0);
    await submit.click(); await panel.getByRole('alert').waitFor();
    check('真实版本冲突保留原公开草稿并等待核对', !await termOne.isChecked() && await termTwo.isChecked() && await submit.isDisabled());
    await panel.getByRole('button', { name: '核对最新结果', exact: true }).click(); await review.waitFor();
    await review.getByRole('button', { name: '保留仍有效的草稿', exact: true }).click();
    check('明确保留草稿只更新基准版本，不自动提交', !await termOne.isChecked() && await termTwo.isChecked() && await submit.isEnabled());
    await submit.click(); await panel.getByText('公开选择已保存；客户仅在合同审批通过且双方签署后可见。', { exact: true }).waitFor();
    check('核对后的下一次真实保存只公开所选条款', (await detail(primary)).terms.map(term => term.termId).join(',') === primary.termIds[1]);
    await termOne.check(); await panel.getByRole('button', { name: '放弃草稿', exact: true }).click();
    const discard = panel.getByRole('complementary', { name: '确认放弃公开草稿', exact: true });
    await discard.getByRole('button', { name: '继续核对', exact: true }).click();
    check('取消放弃草稿保留勾选和关闭保护', await termOne.isChecked() && await dialog.getByRole('button', { name: '关闭', exact: true }).last().isDisabled());
    await panel.getByRole('button', { name: '放弃草稿', exact: true }).click();
    await discard.getByRole('button', { name: '确认放弃本地草稿', exact: true }).click();
    check('确认放弃只丢弃本地勾选，服务端公开结果不变', !await termOne.isChecked() && (await publication(primary.id)).termIds.join(',') === primary.termIds[1]);
    await save(primary, 0); await panel.getByRole('button', { name: '核对最新结果', exact: true }).click();
    await waitFor(() => termOne.isChecked(), Boolean, '恢复原公开结果后面板未刷新');
    for (const width of [1440, 375, 320]) {
      await layout(admin, panel, width, '内部逐项公开');
      await internalDetailLayout(dialog, width, '内部逐项公开');
    }
    await dialog.getByRole('button', { name: '关闭', exact: true }).last().click();
    await page.bringToFront(); await page.getByRole('button', { name: `查看合同 ${primary.contractNo}`, exact: true }).waitFor();
    await page.route(listPattern, route => route.abort('connectionreset'));
    await page.getByRole('button', { name: '重新加载', exact: true }).click(); await page.getByRole('alert').waitFor();
    check('合同列表网络失败清空旧结果并保留搜索输入', await search.inputValue() === prefix && await page.getByRole('article', { name: `合同 ${primary.contractNo}`, exact: true }).count() === 0);
    await page.unroute(listPattern); await page.getByRole('button', { name: '重新加载', exact: true }).click();
    await page.getByRole('button', { name: `查看合同 ${primary.contractNo}`, exact: true }).click();
    clientDialog = page.getByRole('dialog', { name: primary.contractName, exact: true }); await clientDialog.getByText(sourceText, { exact: true }).waitFor();
    await save(primary, -1); await clientDialog.getByRole('button', { name: '核对最新状态', exact: true }).click();
    await clientDialog.getByText('暂无已公开的履约条款。', { exact: true }).waitFor();
    check('门户详情核对后立即移除已撤回条款、节点和付款计划', !(await clientDialog.innerText()).includes(publicText)
      && await clientDialog.getByText('暂无已公开的关键节点。', { exact: true }).isVisible() && await clientDialog.getByText('暂无已公开的付款计划。', { exact: true }).isVisible());
    await save(primary, 0); await clientDialog.getByRole('button', { name: '核对最新状态', exact: true }).click(); await clientDialog.getByText(sourceText, { exact: true }).waitFor();
    await page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' }); document.dispatchEvent(new Event('visibilitychange')); });
    await waitFor(() => page.getByText(sourceText, { exact: true }).count(), count => count === 0, '页面隐藏事件后旧详情未清除');
    check('明确浏览器隐藏事件输入：关闭可见状态立即清除合同详情', await page.getByText(sourceText, { exact: true }).count() === 0);
    await page.evaluate(() => { delete document.visibilityState; document.dispatchEvent(new Event('visibilitychange')); });
    await page.getByText(sourceText, { exact: true }).waitFor();
    await page.waitForFunction(() => window.contractRefreshVerification.naturalTicks > 0, undefined, { timeout: 35000 });
    const refresh = await page.evaluate(() => {
      const verification = window.contractRefreshVerification;
      verification.paused = true;
      return { intervalMs: verification.intervalMs, naturalTicks: verification.naturalTicks, registered: typeof verification.fire === 'function' };
    });
    check('合同页面真实30秒刷新已触发，单次读取专项只控制本页合同周期输入', refresh.intervalMs === 30000 && refresh.naturalTicks > 0 && refresh.registered);
    await page.getByText(sourceText, { exact: true }).waitFor();
    await waitFor(() => clientDialog.getByRole('button', { name: '核对最新状态', exact: true }).isEnabled(), Boolean, '周期刷新结束后详情未就绪');
    database(`UPDATE oa_contract SET signed_flag=0 WHERE tenant_id=100000 AND contract_id=${primary.id};`);
    const beforeReads = sent.filter(request => request.pathname === `/api/portal/crm/contract/${primary.id}`).length;
    try {
      const [manualResponse] = await Promise.all([
        page.waitForResponse(response => new URL(response.url()).pathname === `/api/portal/crm/contract/${primary.id}` && response.request().method() === 'GET'),
        clientDialog.getByRole('button', { name: '核对最新状态', exact: true }).click(),
      ]);
      assert.equal(manualResponse.status(), 404, '手动核对必须获得真实404');
      const unavailable = page.getByRole('dialog', { name: '合同详情', exact: true }); await unavailable.getByRole('alert').waitFor();
      await new Promise(resolve => setTimeout(resolve, 700));
      const manualReads = sent.filter(request => request.pathname === `/api/portal/crm/contract/${primary.id}`).length - beforeReads;
      check('当前合同不再满足开放条件时清空旧详情，404不触发无限重读', await page.getByText(sourceText, { exact: true }).count() === 0
        && manualReads === 1);
      const beforeTimerReads = sent.filter(request => request.pathname === `/api/portal/crm/contract/${primary.id}`).length;
      const [timerResponse] = await Promise.all([
        page.waitForResponse(response => new URL(response.url()).pathname === `/api/portal/crm/contract/${primary.id}` && response.request().method() === 'GET'),
        page.evaluate(() => window.contractRefreshVerification.fire()),
      ]);
      assert.equal(timerResponse.status(), 404, '显式调用实际周期回调必须获得真实404');
      await unavailable.getByRole('alert').waitFor();
      await new Promise(resolve => setTimeout(resolve, 700));
      const timerReads = sent.filter(request => request.pathname === `/api/portal/crm/contract/${primary.id}`).length - beforeTimerReads;
      check('显式周期输入只增加一次真实404读取，旧详情持续隐藏且不循环', timerReads === 1 && await page.getByText(sourceText, { exact: true }).count() === 0);
      console.log(`H3_PORTAL_CONTRACT_REFRESH_CHECK: interval_ms=${refresh.intervalMs}; natural_ticks=${refresh.naturalTicks}; manual_404_reads=${manualReads}; controlled_timer_404_reads=${timerReads}; auto_retry_reads=${manualReads + timerReads - 2}; real_http=true; browser_interval_input=explicit; production_modified=false`);
    } finally {
      database(`UPDATE oa_contract SET signed_flag=1 WHERE tenant_id=100000 AND contract_id=${primary.id};`);
      await page.evaluate(() => { window.contractRefreshVerification.paused = false; });
    }
    await page.getByRole('dialog').getByRole('button', { name: '核对最新状态', exact: true }).click(); await page.getByText(sourceText, { exact: true }).waitFor();
    await page.getByRole('dialog').getByRole('button', { name: '关闭', exact: true }).click();
    successful(await portalCall('/portal/logout', {}, uiToken), '撤销仅本次UI门户会话');
    await page.getByRole('button', { name: '重新加载', exact: true }).click(); await page.getByRole('heading', { name: '登录客户门户', exact: true }).waitFor();
    check('合同页面401清除门户存储并返回门户登录', await page.evaluate(code => !sessionStorage.getItem('cloudflow.portal.session:' + code), tenantCode)
      && new URL(page.url()).pathname === `/portal/${tenantCode}/login`);
    const internalAfterLogout = await internalSession('门户401后实际读取原内部账号信息');
    check('门户401后内部接口仍成功且原账号、租户和当前页面令牌均保持', internalAfterLogout.userId === internalBefore.userId && internalAfterLogout.tenantId === internalBefore.tenantId
      && internalNavigationToken === await admin.evaluate(async () => (await import('/src/utils/authStorage.ts')).getAuthToken()));
    check('合同门户浏览器请求不携带内部Cookie和Authorization', sent.length > 0 && sent.every(request => !request.headers.cookie && !request.headers.authorization));
    check('合同门户浏览器无未捕获脚本异常', failures.length === 0);
    evidence.desktop = true; evidence.mobile = true; evidence.publicationView = true; evidence.detailView = true;
    evidence.internalHeader = true; evidence.internalSummary = true;
    console.log(`H3_PORTAL_CONTRACT_UI_RESULT: widths=1440,375,320; real_business_responses=true; lost_response_writes=${writes}; internal_session_preserved=true; internal_identity_http=true; visibility_event=explicit_browser_input; interval_input=explicit_browser_callback; page_errors=${failures.length}; production_modified=false`);
  } catch (error) {
    for (const [role, target] of [['portal', page], ['admin', admin]]) {
      await target.screenshot({ path: path.join(directory, `h3-contract-ui-failure-${role}-${caseTag}.png`), fullPage: false, timeout: 5000 }).catch(() => {});
    }
    throw error;
  } finally {
    release?.();
    if (interception) await admin.unroute(maintenancePattern, interception);
    await page.close();
  }
}
