import path from 'node:path';

export async function openContractPerformance(page, record) {
  await page.goto(new URL('/office/contracts', page.url()).href, { waitUntil: 'domcontentloaded' });
  await page.getByPlaceholder('合同名称', { exact: true }).fill(record.contractName);
  const row = page.getByRole('row').filter({ hasText: record.contractName });
  await row.waitFor();
  await row.getByRole('button', { name: '查看详情', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: record.contractNo, exact: true });
  const panel = dialog.getByRole('region', { name: '合同销售业绩', exact: true });
  await panel.waitFor();
  return { dialog, panel };
}

export async function verifyContractPerformanceInterface(context) {
  const { admin, check, directory, caseTag, evidence, missing, prepareMissing, today, read, edit, performance, sources, facts, confirmed, waitFor } = context;
  await admin.setViewportSize({ width: 320, height: 1000 });
  const { dialog, panel } = await openContractPerformance(admin, missing);
  await panel.getByText('请补齐开始日期', { exact: true }).waitFor();
  const date = panel.getByLabel('补填合同开始日期', { exact: true });
  const save = panel.getByRole('button', { name: /^(确认补填|正在补填…)$/ });
  check('手机首次打开真实合同详情，缺日期明确未计业绩', await date.isVisible() && await save.isDisabled()
    && !(await panel.innerText()).includes('已确认金额：'));
  for (const attempt of [1, 2, 3]) {
    await date.fill('');
    await date.fill(today);
    await admin.keyboard.press('Escape');
    check(`快速填日期后按Escape第${attempt}次仍保留草稿并阻止关闭`, await dialog.isVisible() && await date.inputValue() === today
      && await dialog.getByRole('button', { name: '关闭', exact: true }).last().isDisabled());
  }
  const mounted = await panel.elementHandle();
  try {
    for (const width of [375, 1440, 320]) {
      await admin.setViewportSize({ width, height: 1000 });
      await admin.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      await save.click({ trial: true });
      const bounds = await save.boundingBox();
      const dimensions = await admin.evaluate(() => ({ document: document.documentElement.scrollWidth, viewport: innerWidth }));
      check(`合同业绩${width}px保持同一补填草稿且不横向溢出，按钮至少44px`, await mounted.evaluate(element => element.isConnected)
        && await date.inputValue() === today && dimensions.document <= dimensions.viewport && bounds?.width >= 44 && bounds?.height >= 44);
      await admin.screenshot({ path: path.join(directory, `h3-contract-performance-${caseTag}-${width}.png`), fullPage: true });
    }
  } finally { await mounted.dispose(); }
  await edit(await read(missing.contractId), { remark: `真实版本冲突_${caseTag}` });
  await save.click();
  await panel.getByRole('alert').waitFor();
  check('真实版本冲突保留日期草稿，禁止直接重复提交', await date.inputValue() === today && await save.isDisabled()
    && (await panel.getByRole('alert').innerText()).includes('修改'));
  await panel.getByRole('button', { name: '核对最新结果', exact: true }).click();
  const review = panel.getByRole('complementary', { name: '合同补填结果核对', exact: true });
  await review.waitFor();
  check('冲突核对读取真实未填写日期和最新版本，不自动清空草稿', (await review.innerText()).includes('未填写') && await date.inputValue() === today);
  await review.getByRole('button', { name: '已核对，保留草稿继续补填', exact: true }).click();
  await holdActualResponse(admin, `**/api/oa/contract/${missing.contractId}/start-date`, () => save.click(), async () => {
    check('真实补填处理中禁用日期、提交、放弃和关闭', await date.isDisabled() && await save.isDisabled()
      && await panel.getByRole('button', { name: '放弃补填草稿', exact: true }).isDisabled()
      && await dialog.getByRole('button', { name: '关闭', exact: true }).last().isDisabled());
    await admin.keyboard.press('Escape');
    check('实际服务已保存但响应未返回时，界面保留草稿且不抢先显示成功', await dialog.isVisible() && await date.inputValue() === today
      && !(await panel.innerText()).includes('已计入合同业绩'));
  }, check);
  await confirmed(missing);
  await panel.getByText('已计入合同业绩', { exact: true }).waitFor({ timeout: 90000 });
  check('真实补填结果入账后显示准确金额并关闭再次补填入口', (await panel.innerText()).includes('100.01')
    && await panel.getByLabel('补填合同开始日期', { exact: true }).count() === 0 && sources(missing).length === 1 && facts(missing).length === 1);
  await dialog.getByRole('button', { name: '关闭', exact: true }).last().click();
  await admin.reload({ waitUntil: 'domcontentloaded' });
  const reloaded = await openContractPerformance(admin, missing);
  await reloaded.panel.getByText('已计入合同业绩', { exact: true }).waitFor();
  check('手机刷新重新读取已确认业绩，不重新补填或新增事实', (await reloaded.panel.innerText()).includes(today) && facts(missing).length === 1);
  await reloaded.dialog.getByRole('button', { name: '关闭', exact: true }).last().click();

  const uncertain = await prepareMissing('ui_unknown');
  const opened = await openContractPerformance(admin, uncertain);
  const uncertainDate = opened.panel.getByLabel('补填合同开始日期', { exact: true });
  await uncertainDate.waitFor();
  await uncertainDate.fill(today);
  const routePattern = `**/api/oa/contract/${uncertain.contractId}/start-date`;
  let received, writes = 0;
  const loseResponse = async route => {
    if (route.request().method() !== 'PUT') return route.continue();
    writes++;
    const response = await route.fetch({ timeout: 20000 });
    received = { status: response.status(), body: await response.json() };
    await route.abort('failed');
  };
  await admin.route(routePattern, loseResponse);
  try {
    await opened.panel.getByRole('button', { name: '确认补填', exact: true }).click();
    await waitFor(() => received, Boolean, '真实补填响应未到达测试传输边界');
    check('结果未明用例只丢弃实际成功响应，不伪造服务端结果', received.status === 200 && received.body?.code === 200);
    await opened.panel.getByRole('alert').waitFor();
    check('响应丢失时保留原日期并要求先核对，未自动重提', await uncertainDate.inputValue() === today
      && await opened.panel.getByRole('button', { name: '确认补填', exact: true }).isDisabled() && writes === 1);
  } finally { await admin.unroute(routePattern, loseResponse); }
  await opened.panel.getByRole('button', { name: '核对最新结果', exact: true }).click();
  const adopt = opened.panel.getByRole('button', { name: '采用已补填结果', exact: true });
  await adopt.waitFor();
  check('结果未明先核对到真实已保存日期，仍保留原草稿供确认', await uncertainDate.inputValue() === today
    && (await opened.panel.getByRole('complementary', { name: '合同补填结果核对' }).innerText()).includes(today));
  await adopt.click();
  await confirmed(uncertain);
  await opened.panel.getByText('已计入合同业绩', { exact: true }).waitFor({ timeout: 90000 });
  check('显式采用真实结果后只保留一次日期补填和业绩入账', (await read(uncertain.contractId)).version === uncertain.version + 1
    && sources(uncertain).length === 1 && facts(uncertain).length === 1 && writes === 1
    && (await performance(uncertain.contractId)).startDate === today);
  await opened.dialog.getByRole('button', { name: '关闭', exact: true }).last().click();
  evidence.desktop = true; evidence.mobile = true; evidence.uiConflict = true; evidence.uiUnknownResult = true;
}

async function holdActualResponse(page, pattern, action, inspect, check) {
  let release, observe, finish, timer, failure;
  const held = new Promise(resolve => { release = resolve; });
  const observed = new Promise(resolve => { observe = resolve; });
  const finished = new Promise(resolve => { finish = resolve; });
  let started = false;
  const handler = async route => {
    if (route.request().method() !== 'PUT') return route.continue();
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
    const response = await Promise.race([observed, new Promise((resolve, reject) => { timer = setTimeout(() => reject(new Error('合同补填真实响应等待超时')), 25000); })]);
    check('处理中验收只延迟真实补填成功响应', response.status === 200 && response.body?.code === 200);
    await inspect();
  } finally {
    clearTimeout(timer); release(); if (started) await finished; await page.unroute(pattern, handler);
  }
  if (failure) throw failure;
}
