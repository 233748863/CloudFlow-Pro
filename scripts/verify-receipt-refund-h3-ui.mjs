import path from 'node:path';

export async function verifySelectedReceiptRefundInterface(context) {
  const { admin, finance, api, successful, check, directory, caseTag, evidence, uiRecord, read, sources, complete, facts, setWorkflowFixture } = context;
  const page = finance;
  const delayActual = async (pattern, method, action, inspect) => {
    let release, observe, finish, failure, timer;
    const held = new Promise(resolve => { release = resolve; });
    const observed = new Promise(resolve => { observe = resolve; });
    const finished = new Promise(resolve => { finish = resolve; });
    let started = false;
    const handler = async route => {
      if (route.request().method() !== method) return route.continue();
      started = true;
      try {
        const response = await route.fetch({ timeout: 20000 });
        observe({ status: response.status(), body: await response.json() });
        await held; await route.fulfill({ response });
      } catch (error) { failure = error; observe({ failure: error.message }); await route.abort(); }
      finally { finish(); }
    };
    await page.route(pattern, handler);
    try {
      await action();
      const response = await Promise.race([observed, new Promise((resolve, reject) => { timer = setTimeout(() => reject(new Error('退款真实响应等待超时')), 25000); })]);
      check(`退款${method}等待状态使用真实响应，仅延迟传输`, response.status === 200 && response.body?.code === 200);
      await inspect();
    } finally { clearTimeout(timer); release(); if (started) await finished; await page.unroute(pattern, handler); }
    if (failure) throw failure;
  };
  await page.setViewportSize({ width: 320, height: 1000 });
  await page.goto(new URL('/office/crm/receivables', page.url()).href, { waitUntil: 'domcontentloaded' });
  const row = page.getByRole('row').filter({ hasText: uiRecord.receivableName });
  await page.getByRole('heading', { name: '回款管理', exact: true }).waitFor();
  check('财务没有销售仪表盘权限也能直接进入回款页，页面与地址一致', new URL(page.url()).pathname === '/office/crm/receivables');
  await row.waitFor();
  const editor = page.getByRole('dialog', { name: `退款审批 - ${uiRecord.receivableName}`, exact: true });
  const amount = editor.getByLabel('本次退款金额', { exact: true });
  const reason = editor.getByLabel('退款原因', { exact: true });
  const submit = editor.getByRole('button', { name: '提交审批', exact: true });
  await delayActual(`**/api/crm/approval/refund/${uiRecord.receivableId}/receipts*`, 'GET',
    () => row.getByRole('button', { name: '退款审批', exact: true }).click(), async () => {
      check('读取来源期间禁填金额原因及提交，未预选原收款', await amount.isDisabled() && await reason.isDisabled()
        && await submit.isDisabled() && await editor.getByRole('radio', { checked: true }).count() === 0);
    });
  await editor.getByRole('radio').first().waitFor();
  check('财务必须手动选原款和填写退款金额，首屏最多10笔', await editor.getByRole('radio').count() === 10
    && await editor.getByRole('radio', { checked: true }).count() === 0 && await amount.inputValue() === '' && await submit.isDisabled());
  await editor.getByRole('button', { name: '下一页', exact: true }).click();
  const firstReceipt = facts(uiRecord)[0];
  const originalChoice = editor.getByRole('radio', { name: `选择原收款 ${firstReceipt.id}`, exact: true });
  const approvalOrder = editor.getByRole('region', { name: '退款审批顺序' });
  const workflow = await sources(uiRecord);
  check('退款页面展示实际客户首审人、独立财务人数和拒绝不扣款说明', (await approvalOrder.innerText()).includes(workflow.businessOwnerName)
    && (await approvalOrder.innerText()).includes(`现有 ${workflow.financeReviewerCount} 名`)
    && (await approvalOrder.innerText()).includes('申请人、首审人和复核人相互独立'));
  await originalChoice.waitFor(); await originalChoice.check();
  await amount.fill(' 0.50 ');
  check('粘贴金额两侧带空格时窗口保持可用，按精确金额校验', await editor.isVisible() && await submit.isEnabled());
  for (const invalidAmount of ['0.001', '1e1', '-0.01', '0']) {
    await amount.fill(invalidAmount);
    check(`退款金额${invalidAmount}在页面被拒绝且保留原收款`, await submit.isDisabled() && await originalChoice.isChecked());
  }
  await amount.fill('0.50');
  const draft = `指定第11笔来源保留输入_${caseTag}`;
  await reason.fill(draft);
  const mounted = await editor.elementHandle();
  try {
    for (const width of [320, 1440, 375]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      await submit.click({ trial: true });
      const bounds = await submit.boundingBox();
      const dimensions = await page.evaluate(() => ({ width: innerWidth, content: document.documentElement.scrollWidth }));
      check(`退款${width}px保留第二页原款、金额和原因，页面无横向溢出且提交至少44px`, await mounted.evaluate(element => element.isConnected)
        && await originalChoice.isChecked() && await amount.inputValue() === '0.50' && await reason.inputValue() === draft
        && dimensions.content <= dimensions.width && bounds?.height >= 44 && bounds?.width >= 44);
      await page.screenshot({ path: path.join(directory, `h3-selected-refund-${caseTag}-${width}.png`), fullPage: true });
    }
  } finally { await mounted.dispose(); }
  successful(await api(admin, '/crm/receivable', { method: 'PUT', body: { ...await read(uiRecord.receivableId), remark: `实际并发修改_${caseTag}` } }), '真实修改回款版本以验证冲突保护');
  await submit.click();
  const review = editor.getByRole('button', { name: '核对最新原收款', exact: true });
  await review.waitFor();
  check('退款真实版本冲突保留所选原款、金额与原因，禁止盲目重提', await amount.inputValue() === '0.50'
    && await reason.inputValue() === draft && (await editor.getByTestId('refund-selected-source').innerText()).includes(`#${firstReceipt.id}`) && await submit.isDisabled());
  await review.click();
  const adopt = editor.getByRole('button', { name: '已核对，采用最新版本', exact: true });
  await adopt.waitFor();
  check('冲突核对精确读取第二页选中的旧原款，原输入不丢失', (await editor.innerText()).includes('所选原收款可退 CNY 1.00')
    && await amount.inputValue() === '0.50' && await reason.inputValue() === draft);
  await adopt.click();
  await delayActual('**/api/crm/approval/refund', 'POST', () => submit.click(), async () => {
    check('退款提交中禁改来源金额原因、禁取消和重复提交', await amount.isDisabled() && await reason.isDisabled()
      && await editor.getByRole('button', { name: '提交中...', exact: true }).isDisabled()
      && await editor.getByRole('button', { name: '取消', exact: true }).isDisabled()
      && await editor.getByRole('radio').first().isDisabled());
    await page.keyboard.press('Escape');
    check('退款提交中的对话框不能被Escape关闭', await editor.isVisible());
  });
  await editor.waitFor({ state: 'hidden' });
  const pending = (await sources(uiRecord)).pendingApprovalId;
  check('手机实际提交选中第二页原收款且审批前不扣减11元累计', pending > 0 && Number((await read(uiRecord.receivableId)).receivedAmount) === 11);
  await complete(pending);
  check('手机来源选择经真实审批只退所选旧原款0.50元', facts(uiRecord).find(value => value.reversalOfId === firstReceipt.id)?.amount === -0.5
    && Number((await read(uiRecord.receivableId)).receivedAmount) === 10.5);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await row.getByRole('button', { name: '退款审批', exact: true }).click();
  const latestReceipt = facts(uiRecord).filter(value => value.reversalOfId === null).at(-1);
  await editor.getByRole('radio', { name: `选择原收款 ${latestReceipt.id}`, exact: true }).check();
  await amount.fill('0.25'); await reason.fill(`服务已受理但网络中断_${caseTag}`);
  let actualAcceptance;
  const interrupted = async route => {
    if (route.request().method() !== 'POST') return route.continue();
    const response = await route.fetch({ timeout: 20000 });
    actualAcceptance = { status: response.status(), body: await response.json() };
    await route.abort('connectionreset');
  };
  await page.route('**/api/crm/approval/refund', interrupted);
  try { await submit.click(); await review.waitFor(); }
  finally { await page.unroute('**/api/crm/approval/refund', interrupted); }
  check('真实服务已受理但响应中断时保留选择和金额，不声称失败后自动重提', actualAcceptance?.status === 200 && actualAcceptance.body?.code === 200
    && await amount.inputValue() === '0.25' && (await reason.inputValue()).includes('服务已受理但网络中断') && await submit.isDisabled());
  await review.click(); await adopt.waitFor();
  check('网络中断后读取实际待审批状态，确认已受理并继续禁止重复提交', (await editor.innerText()).includes('已有退款审批 #') && await submit.isDisabled());
  await adopt.click();
  check('即使采用最新版本，已有待审批也不能重复提交', await submit.isDisabled());
  await editor.getByRole('button', { name: '取消', exact: true }).click();
  await complete(actualAcceptance.body.data, 'REJECT');
  check('网络中断后的审批实际驳回，到账仍10.50且没有第二笔退款', Number((await read(uiRecord.receivableId)).receivedAmount) === 10.5
    && facts(uiRecord).filter(value => value.reversalOfId !== null).length === 1);
  try {
    setWorkflowFixture(false);
    const unavailable = await sources(uiRecord);
    check('停用接口明确返回不可提交和具体原因', unavailable.workflowConfigured === false && /未配置|停用|模型/.test(unavailable.workflowMessage));
    await row.getByRole('button', { name: '退款审批', exact: true }).click();
    await editor.getByText(unavailable.workflowMessage, { exact: true }).waitFor();
    await editor.getByRole('radio', { name: `选择原收款 ${latestReceipt.id}`, exact: true }).check();
    await amount.fill('0.01');
    check('手机退款流程未配置时有明确说明，选来源填金额后也不能提交', await submit.isDisabled());
    await editor.getByRole('button', { name: '取消', exact: true }).click();
  } finally { setWorkflowFixture(true); }
  evidence.desktop = true; evidence.mobile = true; evidence.exactSourceReview = true; evidence.networkInterruption = true;
  evidence.unconfiguredDisabled = true;
}
