import path from 'node:path';

export async function verifyQuoteContractCopyInterface(context) {
  const { admin, employee, api, successful, database, check, directory, caseTag, evidence, customerId, createQuote, readQuote,
    readContract, readTeam, saveTeam, pair, signature, count, events, contractPath } = context;
  const navigate = (page, route) => page.goto(new URL(route, page.url()).href, { waitUntil: 'domcontentloaded' });
  const dialog = admin.getByRole('dialog', { name: '报价转合同', exact: true });
  const row = quote => admin.getByRole('row').filter({ hasText: quote.quoteName });
  const open = async quote => {
    await navigate(admin, '/office/crm/quotes');
    await row(quote).getByRole('button', { name: '转合同', exact: true }).click();
    await dialog.getByText(quote.quoteName, { exact: true }).waitFor();
    await dialog.getByRole('button', { name: '生成合同草稿', exact: true }).click({ trial: true });
  };
  const delayActual = async (pattern, method, action, inspect) => {
    let release;
    const held = new Promise(resolve => { release = resolve; });
    let observe;
    const observed = new Promise(resolve => { observe = resolve; });
    let finish;
    const finished = new Promise(resolve => { finish = resolve; });
    let started = false;
    let transportFailure;
    const handler = async route => {
      if (route.request().method() !== method) return route.continue();
      started = true;
      try {
        const response = await route.fetch({ timeout: 30000 });
        observe({ status: response.status(), body: await response.json() });
        await held;
        await route.fulfill({ response });
      } catch (failure) { transportFailure = failure; observe({ error: failure.message }); }
      finally { finish(); }
    };
    let timer;
    await admin.route(pattern, handler);
    try {
      await action();
      const response = await Promise.race([observed, new Promise((resolve, reject) => { timer = setTimeout(() => reject(new Error('真实合同复制响应等待超时')), 35000); })]);
      check(`报价转合同${method}等待检查采用实际服务器成功响应`, response.status === 200 && response.body?.code === 200);
      await inspect(response.body.data);
      return response.body.data;
    } finally {
      clearTimeout(timer); release(); if (started) await finished; await admin.unroute(pattern, handler);
      if (transportFailure) throw transportFailure;
    }
  };
  let mutations = 0;
  const countMutation = request => { if (request.method() === 'POST' && /\/api\/crm\/quote\/\d+\/contract-draft$/.test(new URL(request.url()).pathname)) mutations += 1; };
  admin.on('request', countMutation);
  try {
    const quote = await createQuote('contract_ui', customerId);
    await saveTeam('QUOTE', quote.quoteId, await readTeam('QUOTE', quote.quoteId), pair());
    await admin.setViewportSize({ width: 320, height: 1000 });
    await navigate(admin, '/office/crm/quotes');
    await delayActual(`**/api/crm/quote/${quote.quoteId}`, 'GET', () => row(quote).getByRole('button', { name: '转合同', exact: true }).click(),
      async () => check('报价未读取完成时禁止生成合同且明确显示读取状态', await dialog.getByRole('button', { name: '生成合同草稿', exact: true }).isDisabled()
        && await dialog.getByText('正在读取报价，请稍候。', { exact: true }).isVisible()));
    await dialog.getByText(quote.quoteName, { exact: true }).waitFor();
    for (const width of [1440, 375, 320]) {
      const mounted = await dialog.elementHandle();
      try {
        await admin.setViewportSize({ width, height: 1000 });
        await admin.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        const button = dialog.getByRole('button', { name: '生成合同草稿', exact: true });
        await button.click({ trial: true });
        const bounds = await button.boundingBox();
        const dimensions = await admin.evaluate(() => ({ document: document.documentElement.scrollWidth, viewport: innerWidth }));
        check(`报价转合同${width}px保留同一确认框，无页面溢出且按钮至少44px ${JSON.stringify({ bounds, dimensions })}`, await mounted.evaluate(element => element.isConnected)
          && await dialog.getByText(quote.quoteName, { exact: true }).isVisible() && bounds?.width >= 44 && bounds?.height >= 44 && dimensions.document <= dimensions.viewport);
        await admin.screenshot({ path: path.join(directory, `h3-quote-contract-copy-${caseTag}-${width}.png`) });
      } finally { await mounted.dispose(); }
    }
    const beforeCreate = mutations;
    const contractId = Number(await delayActual(`**/api${contractPath(quote.quoteId)}`, 'POST', () => dialog.getByRole('button', { name: '生成合同草稿', exact: true }).click(),
      async () => {
        check('合同生成中禁用取消和重复提交', await dialog.getByRole('button', { name: '取消', exact: true }).isDisabled()
          && await dialog.getByRole('button', { name: '处理中...', exact: true }).isDisabled());
        await admin.keyboard.press('Escape');
        check('合同生成中Escape不能关闭确认框或丢失响应', await dialog.isVisible());
        await dialog.getByRole('button', { name: '处理中...', exact: true }).evaluate(button => { button.click(); button.click(); });
        check('生成中重复点击没有额外发起创建请求', mutations === beforeCreate + 1);
      }));
    const contract = await readContract(contractId);
    await admin.getByRole('dialog', { name: contract.contractNo, exact: true }).waitFor();
    check('手机确认后打开真实合同详情，团队继承完整且没有重复合同', new URL(admin.url()).pathname === '/office/contracts'
      && count(quote.quoteId) === 1 && signature(await readTeam('CONTRACT', contractId)) === signature(await readTeam('QUOTE', quote.quoteId)));
    await navigate(admin, '/office/crm/quotes');
    await admin.reload({ waitUntil: 'domcontentloaded' });
    const beforeOpen = mutations;
    await row(quote).getByRole('button', { name: '打开合同', exact: true }).click();
    await admin.getByRole('dialog', { name: contract.contractNo, exact: true }).waitFor();
    check('刷新后的已关联报价直接打开合同，不发送重复创建请求', mutations === beforeOpen && count(quote.quoteId) === 1);

    const uncertain = await createQuote('contract_ui_unknown', customerId);
    await open(uncertain);
    const pattern = `**/api${contractPath(uncertain.quoteId)}`;
    let serverResult;
    const interruptResponse = async route => {
      const response = await route.fetch({ timeout: 30000 });
      serverResult = { status: response.status(), body: await response.json() };
      await route.abort('failed');
    };
    await admin.route(pattern, interruptResponse);
    try {
      await dialog.getByRole('button', { name: '生成合同草稿', exact: true }).click();
      await dialog.getByRole('button', { name: '核对处理结果', exact: true }).waitFor();
    } finally { await admin.unroute(pattern, interruptResponse); }
    successful(serverResult, '被中断的是已实际成功的服务器响应');
    check('真实成功响应中断后保留报价并要求先核对，禁止直接重发', count(uncertain.quoteId) === 1
      && await dialog.getByText(uncertain.quoteName, { exact: true }).isVisible() && await dialog.getByRole('button', { name: '生成合同草稿', exact: true }).isDisabled()
      && (await dialog.getByRole('alert').innerText()).includes('处理结果尚未确认'));
    const beforeReconcile = mutations;
    await delayActual(`**/api/crm/quote/${uncertain.quoteId}`, 'GET', () => dialog.getByRole('button', { name: '核对处理结果', exact: true }).click(),
      async () => check('核对结果期间禁止取消和重复核对', await dialog.getByRole('button', { name: '核对处理结果', exact: true }).isDisabled()
        && await dialog.getByRole('button', { name: '取消', exact: true }).isDisabled()));
    await dialog.getByRole('button', { name: '打开已关联合同', exact: true }).click();
    const reconciledContract = await readContract((await readQuote(uncertain.quoteId)).contractId);
    await admin.getByRole('dialog', { name: reconciledContract.contractNo, exact: true }).waitFor();
    check('结果未明后只读核对并打开原合同，未重发创建', mutations === beforeReconcile && count(uncertain.quoteId) === 1 && events(reconciledContract.contractId) === 1);

    const recovery = await createQuote('contract_ui_recovery', customerId);
    await open(recovery);
    const trigger = `h3_qcc_ui_${caseTag}`;
    let installed = false;
    try {
      database(`DELIMITER $$\nCREATE TRIGGER ${trigger} BEFORE UPDATE ON crm_quote FOR EACH ROW BEGIN IF NEW.tenant_id=100000 AND NEW.quote_id=${recovery.quoteId} AND NEW.contract_id IS NOT NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='H3_OWNED_QUOTE_UI_FAILURE'; END IF; END$$\nDELIMITER ;\n`);
      installed = true;
      await dialog.getByRole('button', { name: '生成合同草稿', exact: true }).click();
      await dialog.getByRole('button', { name: '核对处理结果', exact: true }).waitFor();
      check('手机遇到真实关联失败时保留确认框，OA先行合同只有一份', count(recovery.quoteId) === 1
        && (await readQuote(recovery.quoteId)).contractId == null && await dialog.getByText(recovery.quoteName, { exact: true }).isVisible());
    } finally { if (installed) database(`DROP TRIGGER ${trigger};`); }
    const orphanId = Number(database(`SELECT contract_id FROM oa_contract WHERE tenant_id=100000 AND source_type='CRM_QUOTE' AND source_id=${recovery.quoteId};`));
    const orphanTeam = signature(await readTeam('CONTRACT', orphanId));
    await dialog.getByRole('button', { name: '核对处理结果', exact: true }).click();
    await dialog.getByText('尚未发现合同关联；再次提交会先核对已建立的来源合同，避免重复创建。', { exact: true }).waitFor();
    await new Promise(resolve => setTimeout(resolve, 5100));
    await dialog.getByRole('button', { name: '重试生成或恢复关联', exact: true }).click();
    const recovered = await readContract(orphanId);
    await admin.getByRole('dialog', { name: recovered.contractNo, exact: true }).waitFor();
    check('手机显式重试恢复原合同关联，保持原团队及一次创建事件', (await readQuote(recovery.quoteId)).contractId === orphanId
      && count(recovery.quoteId) === 1 && events(orphanId) === 1 && signature(await readTeam('CONTRACT', orphanId)) === orphanTeam);
    await employee.setViewportSize({ width: 375, height: 1000 });
    await navigate(employee, '/office/crm/quotes');
    check('员工手机报价列表不显示范围外报价及其转合同入口', await employee.getByRole('row').filter({ hasText: quote.quoteName }).count() === 0
      && await employee.getByRole('button', { name: '生成合同草稿', exact: true }).count() === 0);
    evidence.quoteDesktop = true; evidence.quoteMobile = true; evidence.uiUnknownReconciliation = true;
    evidence.uiLinkRecovery = true; evidence.responseTransportInjection = 'delay_and_success_response_abort';
  } finally { admin.off('request', countMutation); }
}
