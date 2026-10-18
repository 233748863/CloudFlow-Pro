import path from 'node:path';

export async function verifyReceivableProtectionInterface({ admin, employee, api, successful, check, directory, caseTag, evidence, uiRecord, read, edit }) {
  const navigate = (page, route) => page.goto(new URL(route, page.url()).href, { waitUntil: 'domcontentloaded' });
  const delayActual = async (pattern, method, action, inspect) => {
    let release;
    const held = new Promise(resolve => { release = resolve; });
    let observe;
    const observed = new Promise(resolve => { observe = resolve; });
    let finish;
    const finished = new Promise(resolve => { finish = resolve; });
    let started = false;
    let failure;
    const handler = async route => {
      if (route.request().method() !== method) return route.continue();
      started = true;
      try {
        const response = await route.fetch({ timeout: 20000 });
        observe({ status: response.status(), body: await response.json() });
        await held;
        await route.fulfill({ response });
      } catch (error) { failure = error; observe({ failure: error.message }); }
      finally { finish(); }
    };
    await admin.route(pattern, handler);
    let timer;
    try {
      await action();
      const response = await Promise.race([observed, new Promise((resolve, reject) => { timer = setTimeout(() => reject(new Error('真实应收响应等待超时')), 25000); })]);
      check(`应收${method}处理中检查使用真实服务响应`, response.status === 200 && response.body?.code === 200);
      await inspect();
    } finally {
      clearTimeout(timer); release(); if (started) await finished; await admin.unroute(pattern, handler);
    }
    if (failure) throw failure;
  };
  await admin.setViewportSize({ width: 320, height: 1000 });
  await navigate(admin, '/office/crm/receivables');
  const row = admin.getByRole('row').filter({ hasText: uiRecord.receivableName });
  await row.waitFor();
  const editor = admin.getByRole('dialog', { name: '编辑回款', exact: true });
  await delayActual(`**/api/crm/receivable/${uiRecord.receivableId}`, 'GET',
    () => row.getByRole('button', { name: '编辑回款', exact: true }).click(),
    async () => check('读取应收期间不能保存或提前修改旧数据', await editor.getByRole('button', { name: '保存', exact: true }).isDisabled()
      && await editor.getByLabel('计划回款金额', { exact: true }).count() === 0));
  const amount = editor.getByLabel('计划回款金额', { exact: true });
  const remark = editor.getByLabel('回款说明', { exact: true });
  await amount.waitFor();
  await amount.fill('234.56');
  const draft = `应收保留草稿_${caseTag}`;
  await remark.fill(draft);
  const mounted = await editor.elementHandle();
  try {
    for (const width of [320, 1440, 375]) {
      await admin.setViewportSize({ width, height: 1000 });
      await admin.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const dimensions = await admin.evaluate(() => ({ page: document.documentElement.scrollWidth, viewport: innerWidth }));
      const save = editor.getByRole('button', { name: '保存', exact: true });
      await save.click({ trial: true });
      const bounds = await save.boundingBox();
      check(`应收编辑${width}px保留同一草稿、无整页横向溢出且保存按钮至少44px`, await mounted.evaluate(element => element.isConnected)
        && await amount.inputValue() === '234.56' && await remark.inputValue() === draft && dimensions.page <= dimensions.viewport
        && bounds?.width >= 44 && bounds?.height >= 44);
      await admin.screenshot({ path: path.join(directory, `h3-receivable-editor-${caseTag}-${width}.png`), fullPage: true });
    }
  } finally { await mounted.dispose(); }
  let serverRecord = await edit(await read(uiRecord.receivableId), { plannedAmount: '200', remark: '服务器已有修改' });
  await editor.getByRole('button', { name: '保存', exact: true }).click();
  const refresh = editor.getByRole('button', { name: '读取最新回款（保留草稿）', exact: true });
  await refresh.waitFor();
  check('真实版本冲突保留计划金额和说明', await amount.inputValue() === '234.56' && await remark.inputValue() === draft
    && (await editor.getByRole('alert').innerText()).includes('未保存输入仍保留'));
  await refresh.click();
  const adopt = editor.getByRole('button', { name: '已核对，保留计划输入并采用最新记录', exact: true });
  await adopt.waitFor();
  check('冲突核对展示实际已保存200及客户合同', (await editor.innerText()).includes('200.00') && (await editor.innerText()).includes(uiRecord.customerName));
  await adopt.click();
  check('明确采用最新记录后草稿仍完整', await amount.inputValue() === '234.56' && await remark.inputValue() === draft);
  await delayActual('**/api/crm/receivable', 'PUT', () => editor.getByRole('button', { name: '保存', exact: true }).click(), async () => {
    check('保存中禁止重复提交、改金额和取消', await amount.isDisabled() && await remark.isDisabled()
      && await editor.getByRole('button', { name: '保存中...', exact: true }).isDisabled() && await editor.getByRole('button', { name: '取消', exact: true }).isDisabled());
    await admin.keyboard.press('Escape');
    check('保存中的应收表单不会被Escape关闭', await editor.isVisible());
  });
  await editor.waitFor({ state: 'hidden' });
  serverRecord = await read(uiRecord.receivableId);
  check('核对后保存实际金额234.56且只增加一次版本', Number(serverRecord.plannedAmount) === 234.56
    && Number(serverRecord.outstandingAmount) === 234.56 && serverRecord.version === 2 && serverRecord.remark === draft);
  await row.getByRole('button', { name: '确认回款', exact: true }).click();
  const confirmation = admin.getByRole('dialog', { name: '确认操作', exact: true });
  await confirmation.waitFor();
  check('确认对话框明确展示剩余234.56全部到账语义', (await confirmation.innerText()).includes('234.56') && (await confirmation.innerText()).includes('已全部到账'));
  await confirmation.getByRole('button', { name: '确认', exact: true }).click();
  await confirmation.waitFor({ state: 'hidden' });
  serverRecord = await read(uiRecord.receivableId);
  check('手机页面真实确认回款携带当前版本且只收剩余款', Number(serverRecord.receivedAmount) === 234.56 && Number(serverRecord.outstandingAmount) === 0 && serverRecord.version === 3);
  await row.getByRole('button', { name: '编辑回款', exact: true }).click();
  await editor.getByText('已有业务记录，客户与合同已锁定；到账、核销和退款请使用专用操作。', { exact: true }).waitFor();
  check('有收款历史时界面禁用客户合同并只读显示合同号', await editor.getByLabel('回款客户', { exact: true }).isDisabled()
    && await editor.getByLabel('回款合同', { exact: true }).isDisabled() && await editor.getByLabel('回款合同编号', { exact: true }).getAttribute('readonly') !== null);
  await editor.getByRole('button', { name: '取消', exact: true }).click();
  await admin.reload({ waitUntil: 'domcontentloaded' });
  await row.waitFor();
  check('手机刷新后已收款记录不再显示确认按钮', await row.getByRole('button', { name: '确认回款', exact: true }).count() === 0);
  await employee.setViewportSize({ width: 375, height: 1000 });
  await navigate(employee, '/office/crm/receivables');
  check('员工直达手机应收页面没有新增编辑确认按钮', await employee.getByRole('button', { name: '新增回款', exact: true }).count() === 0
    && await employee.getByRole('button', { name: '编辑回款', exact: true }).count() === 0 && await employee.getByRole('button', { name: '确认回款', exact: true }).count() === 0);
  successful(await api(admin, `/crm/receivable/${uiRecord.receivableId}`), '双端验收后真实回款仍可查询');
  evidence.desktop = true; evidence.mobile = true; evidence.transportDelayOnly = true;
}
