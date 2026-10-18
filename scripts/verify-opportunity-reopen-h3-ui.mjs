import path from 'node:path';

export async function verifyOpportunityReopenInterface(context) {
  const { admin, sales, manager, api, successful, database, check, directory, caseTag, evidence, business, blockedBusiness,
    inspect, endpoint, won, saveTeam, historyCount, originalAllocations } = context;
  const navigate = (page, route) => page.goto(new URL(route, page.url()).href, { waitUntil: 'domcontentloaded' });
  const open = async (page, record) => {
    await navigate(page, `/office/crm/opportunities?opportunityId=${record.opportunityId}`);
    const details = page.getByRole('dialog', { name: '商机详情', exact: true });
    await details.getByRole('heading', { name: record.opportunityName, exact: true }).waitFor();
    await details.getByRole('button', { name: '恢复进行中', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: `恢复进行中 · ${record.opportunityName}`, exact: true });
    await dialog.getByRole('button', { name: '重新核对恢复条件（保留输入）', exact: true }).click({ trial: true });
    return dialog;
  };
  const fields = dialog => ({ target: dialog.getByLabel('恢复目标阶段', { exact: true }), reason: dialog.getByLabel('恢复原因', { exact: true }),
    submit: dialog.getByRole('button', { name: '确认恢复进行中', exact: true }) });
  const readOnly = dialog => dialog.getByRole('button', { name: '只读核对最新结果', exact: true });
  await sales.setViewportSize({ width: 375, height: 1000 });
  await navigate(sales, `/office/crm/opportunities?opportunityId=${business.opportunityId}`);
  const salesDetails = sales.getByRole('dialog', { name: '商机详情', exact: true });
  await salesDetails.getByRole('heading', { name: business.opportunityName, exact: true }).waitFor();
  check('销售代表手机可看本人终态详情但没有恢复按钮', await salesDetails.getByRole('button', { name: '恢复进行中', exact: true }).count() === 0);
  await admin.setViewportSize({ width: 375, height: 1000 });
  const dialog = await open(admin, business);
  const input = fields(dialog);
  const before = await inspect(business.opportunityId);
  const frozen = originalAllocations(before.winningEventId);
  const priorHistory = historyCount(business.opportunityId);
  const shares = dialog.getByRole('region', { name: '原赢单冻结分配', exact: true });
  check('手机首次进入显示原60/40冻结分配及赢单数量扣回说明', (await shares.innerText()).includes('60.00%')
    && (await shares.innerText()).includes('40.00%') && (await shares.innerText()).includes('赢单数量同步扣回'));
  check('未填写目标及原因时恢复提交禁用，原因最多1000字符', await input.submit.isDisabled() && await input.reason.getAttribute('maxlength') === '1000');
  await input.target.selectOption('QUALIFIED');
  const reason = `客户补齐预算，重新推进_${caseTag}`;
  await input.reason.fill(reason);
  await dialog.getByRole('button', { name: '返回详情', exact: true }).click();
  const discard = admin.getByRole('dialog', { name: '放弃未提交的恢复草稿？', exact: true });
  await discard.getByRole('button', { name: '继续编辑', exact: true }).click();
  check('取消关闭保留恢复目标和原因', await input.target.inputValue() === 'QUALIFIED' && await input.reason.inputValue() === reason);
  await admin.evaluate(async () => { const { router } = await import('/src/router.tsx'); void router.navigate('/crm/stage-analysis'); });
  await discard.getByRole('button', { name: '继续编辑', exact: true }).click();
  check('应用内导航经确认取消后仍保留草稿', new URL(admin.url()).pathname === '/office/crm/opportunities' && await input.reason.inputValue() === reason);
  await saveTeam(business.opportunityId, '0.7000', '0.3000');
  const conflicting = admin.waitForResponse(response => response.url().endsWith(endpoint(business.opportunityId)) && response.request().method() === 'POST');
  await input.submit.click();
  const rejected = await conflicting;
  check('页面实际提交旧业务版本被服务器拒绝，未替换响应', [400, 409].includes(rejected.status()) && (await rejected.json()).code !== 200);
  await readOnly(dialog).waitFor();
  check('冲突后完整保留输入、显示错误并暂停重复提交', await input.target.inputValue() === 'QUALIFIED' && await input.reason.inputValue() === reason
    && await input.target.isDisabled() && await input.reason.isDisabled() && await input.submit.isDisabled() && await dialog.getByRole('alert').count() > 0);
  check('被拒绝的真实页面操作不增加恢复历史', historyCount(business.opportunityId) === priorHistory);
  await dialog.getByRole('button', { name: '返回详情', exact: true }).click();
  const uncertain = admin.getByRole('dialog', { name: '尚未核对恢复结果，确认离开？', exact: true });
  await uncertain.getByRole('button', { name: '继续核对', exact: true }).click();
  check('结果未核对时关闭提醒不能把请求误报为未保存', await input.reason.inputValue() === reason && await readOnly(dialog).isVisible());
  await readOnly(dialog).click();
  const adopt = dialog.getByRole('button', { name: '已核对，采用最新版本继续编辑', exact: true });
  await adopt.click();
  check('只读核对后由用户明确采用新版本，输入保持不变', await input.reason.inputValue() === reason && await input.target.inputValue() === 'QUALIFIED'
    && await input.reason.isEnabled() && await input.submit.isEnabled());
  for (const width of [1440, 375, 320]) {
    const mounted = await dialog.elementHandle();
    try {
      await admin.setViewportSize({ width, height: 1000 });
      await admin.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      await input.submit.click({ trial: true });
      const bounds = await input.submit.boundingBox();
      const panel = await dialog.boundingBox();
      const dimensions = await admin.evaluate(() => ({ document: document.documentElement.scrollWidth, viewport: innerWidth }));
      check(`商机恢复${width}px无横向溢出且按钮至少44px；页面=${dimensions.document}/${dimensions.viewport}；按钮=${bounds?.width}x${bounds?.height}`,
        dimensions.document <= dimensions.viewport && bounds?.height >= 44 && bounds?.width >= 44 && panel?.x >= 0 && panel.x + panel.width <= width + 1);
      check(`切换${width}px保留同一恢复组件及完整草稿`, await mounted.evaluate(element => element.isConnected)
        && await input.reason.inputValue() === reason && await input.target.inputValue() === 'QUALIFIED');
      await admin.screenshot({ path: path.join(directory, `h3-opportunity-reopen-${caseTag}-${width}.png`), fullPage: false });
    } finally { await mounted.dispose(); }
  }
  let release;
  const held = new Promise(resolve => { release = resolve; });
  let observe;
  const observed = new Promise(resolve => { observe = resolve; });
  let finished;
  const completed = new Promise(resolve => { finished = resolve; });
  let requests = 0;
  let routeFailure;
  const address = `**/api${endpoint(business.opportunityId)}`;
  const loseActualResponse = async route => {
    if (route.request().method() !== 'POST') return route.continue();
    requests++;
    try {
      const response = await route.fetch({ timeout: 25000 });
      observe({ status: response.status(), body: await response.json() });
      await held;
      await route.abort('connectionreset');
    } catch (failure) { routeFailure = failure; observe({ error: failure.message }); }
    finally { finished(); }
  };
  await admin.route(address, loseActualResponse);
  let timer;
  try {
    await input.submit.click();
    const response = await Promise.race([observed, new Promise((resolve, reject) => { timer = setTimeout(() => reject(new Error('真实恢复响应未到达')), 30000); })]);
    check('断网场景先收到真实成功响应，仅延迟并丢弃传输', response.status === 200 && response.body?.code === 200);
    check('保存中目标、原因和返回按钮均不可操作', await input.target.isDisabled() && await input.reason.isDisabled()
      && await dialog.getByRole('button', { name: '返回详情', exact: true }).isDisabled());
    await admin.keyboard.press('Escape');
    check('保存中Escape无法关闭并丢弃操作状态', await dialog.isVisible());
    await admin.evaluate(async () => { const { router } = await import('/src/router.tsx'); void router.navigate('/crm/stage-analysis'); });
    await admin.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    check('保存中应用内导航保持在当前商机', new URL(admin.url()).pathname === '/office/crm/opportunities' && await dialog.isVisible());
    check('真实服务器已写回历史及回执，等待状态没有代替业务执行', (await inspect(business.opportunityId, manager)).lastReopen.historyId === response.body.data.historyId);
  } finally {
    clearTimeout(timer); release(); if (requests > 0) await completed; await admin.unroute(address, loseActualResponse);
  }
  if (routeFailure) throw routeFailure;
  await readOnly(dialog).waitFor();
  check('成功响应丢失后不自动重发且仍保留目标和原因', requests === 1 && await input.submit.isDisabled()
    && await input.reason.inputValue() === reason && await input.target.inputValue() === 'QUALIFIED');
  await readOnly(dialog).click();
  const receipt = dialog.getByRole('status', { name: '商机恢复回执', exact: true });
  await receipt.getByRole('heading', { name: '已确认恢复成功', exact: true }).waitFor();
  check('只读核对成功回执后不再显示提交入口和未保存提示', (await receipt.innerText()).includes(reason)
    && await input.submit.count() === 0 && await readOnly(dialog).count() === 0 && requests === 1);
  check('断网核对全过程仅增加一次恢复历史，原分成保持不变', historyCount(business.opportunityId) === priorHistory + 1
    && originalAllocations(before.winningEventId) === frozen && database(`SELECT COUNT(*) FROM crm_deal_event WHERE tenant_id=100000 AND reversal_of_id=${before.winningEventId};`) === '1');
  await admin.screenshot({ path: path.join(directory, `h3-opportunity-reopen-reconciled-${caseTag}-320.png`), fullPage: false });
  await dialog.getByRole('button', { name: '返回详情', exact: true }).click();
  const details = admin.getByRole('dialog', { name: '商机详情', exact: true });
  await details.getByRole('heading', { name: business.opportunityName, exact: true }).waitFor();
  await details.getByRole('tab', { name: '阶段历史', exact: true }).click();
  await details.getByRole('cell', { name: reason, exact: true }).waitFor();
  check('返回详情可直接复核真实恢复原因和历史', await details.getByRole('cell', { name: reason, exact: true }).count() === 1);
  await details.getByRole('button', { name: '关闭详情', exact: true }).click();
  await details.waitFor({ state: 'hidden' });
  const blocked = await open(admin, blockedBusiness);
  await blocked.getByRole('complementary', { name: '恢复阻断原因', exact: true }).waitFor();
  check('手机页面明确显示真实到账阻断且禁止恢复', (await blocked.getByRole('complementary', { name: '恢复阻断原因', exact: true }).innerText()).includes('到账')
    && await fields(blocked).submit.isDisabled());
  await admin.screenshot({ path: path.join(directory, `h3-opportunity-reopen-blocked-${caseTag}-320.png`), fullPage: false });
  await blocked.getByRole('button', { name: '返回详情', exact: true }).click();
  const normalBusiness = await won('ui_normal');
  await manager.setViewportSize({ width: 375, height: 1000 });
  const normal = await open(manager, normalBusiness);
  const normalInput = fields(normal);
  await normalInput.target.selectOption('QUALIFIED');
  await normalInput.reason.fill(`手机正常提交_${caseTag}`);
  const normalResponse = manager.waitForResponse(response => response.url().endsWith(endpoint(normalBusiness.opportunityId)) && response.request().method() === 'POST');
  await normalInput.submit.click();
  const actual = await normalResponse;
  successful({ status: actual.status(), body: await actual.json() }, '手机销售主管真实恢复响应');
  await normal.getByRole('status', { name: '商机恢复回执', exact: true }).waitFor();
  check('获批销售主管手机正常提交后显示真实成功回执', (await inspect(normalBusiness.opportunityId)).lastReopen.reason === `手机正常提交_${caseTag}`);
  await manager.screenshot({ path: path.join(directory, `h3-opportunity-reopen-manager-${caseTag}-375.png`), fullPage: false });
  evidence.desktop = true; evidence.mobile = true; evidence.draftPreserved = true; evidence.lostResponse = true; evidence.transportDelayOnly = true;
}
