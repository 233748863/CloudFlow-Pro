import assert from 'node:assert/strict';
import path from 'node:path';

export async function verifySalesTargetInterface(context) {
  const { admin, employee, partner, uiTarget, check, directory, caseTag, evidence, prefix, read, edit, write, waitFor, database, literal, cents } = context;
  const openList = async (page, name) => {
    await page.goto(new URL('/office/crm/sales-targets', page.url()).href, { waitUntil: 'domcontentloaded' });
    await page.getByLabel('搜索目标', { exact: true }).fill(name);
    const row = page.getByRole('row').filter({ hasText: name });
    await row.waitFor();
    return row;
  };
  const openEdit = async row => {
    await row.getByRole('button', { name: '编辑目标', exact: true }).click();
    const dialog = admin.getByRole('dialog', { name: '编辑销售目标', exact: true });
    await waitFor(() => dialog.getByLabel('目标金额', { exact: true }).isEnabled(), Boolean, '目标详情未加载');
    return dialog;
  };
  const discard = async dialog => {
    await dialog.getByRole('button', { name: '放弃草稿', exact: true }).click();
    const confirmation = admin.getByRole('dialog', { name: '放弃销售目标草稿', exact: true });
    await confirmation.getByRole('button', { name: '确认放弃', exact: true }).click();
    await dialog.waitFor({ state: 'hidden' });
  };
  await admin.setViewportSize({ width: 320, height: 1000 });
  const originalRow = await openList(admin, uiTarget.targetName);
  const dialog = await openEdit(originalRow);
  const amount = dialog.getByLabel('目标金额', { exact: true });
  const save = dialog.getByRole('button', { name: /^(保存销售目标|正在处理…)$/ });
  check('手机首次打开真实目标详情，使用准确原金额及版本', await amount.inputValue() === '100.00' && uiTarget.version === 0);
  for (const attempt of [1, 2, 3]) {
    await amount.fill(`12345.${67 + attempt}`);
    await admin.keyboard.press('Escape');
    check(`快速修改金额后Escape第${attempt}次不丢失草稿`, await dialog.isVisible() && await amount.inputValue() === `12345.${67 + attempt}`);
  }
  await amount.fill('12345.67');
  const mounted = await amount.elementHandle();
  try {
    for (const width of [375, 1440, 320]) {
      await admin.setViewportSize({ width, height: 1000 });
      await admin.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      await save.click({ trial: true });
      const bounds = await save.boundingBox();
      const dimensions = await admin.evaluate(() => ({ content: document.documentElement.scrollWidth, viewport: innerWidth }));
      const connected = await mounted.evaluate(element => element.isConnected);
      const retainedAmount = await amount.inputValue();
      const sizing = await save.evaluate(button => ({ height: getComputedStyle(button).height, minHeight: getComputedStyle(button).minHeight,
        density: getComputedStyle(button).getPropertyValue('--cf-density-control-height') }));
      const undersized = await dialog.evaluate(element => [...element.querySelectorAll('button,input:not([type="checkbox"]),[role="combobox"]')]
        .filter(control => control.getClientRects().length && (control.getBoundingClientRect().height < 44 || control.getBoundingClientRect().width < 44))
        .map(control => ({ tag: control.tagName, label: control.getAttribute('aria-label') || control.id || control.textContent,
          width: control.getBoundingClientRect().width, height: control.getBoundingClientRect().height })));
      console.log(`H3_SALES_TARGET_VIEWPORT: ${JSON.stringify({ width, connected, retainedAmount, ...dimensions, button: bounds, sizing, undersized })}`);
      check(`销售目标${width}px保留同一草稿、不横向溢出、保存按钮至少44px`, connected
        && retainedAmount === '12345.67' && dimensions.content <= dimensions.viewport && bounds?.width >= 44 && bounds?.height >= 44);
      check(`销售目标${width}px编辑表单可见输入及按钮均至少44px`, undersized.length === 0);
      await admin.screenshot({ path: path.join(directory, `h3-sales-target-${caseTag}-${width}.png`), fullPage: true });
    }
  } finally { await mounted.dispose(); }
  await edit({ ...write(await read(uiTarget.salesTargetId)), remark: `${prefix}_another_editor` });
  await save.click();
  await dialog.getByRole('alert').waitFor();
  check('真实版本冲突保留金额，停止未核对的重复保存', await amount.inputValue() === '12345.67' && await save.isDisabled()
    && await amount.isDisabled() && /修改|版本/.test(await dialog.getByRole('alert').innerText()));
  await dialog.getByRole('button', { name: '核对最新结果，保留草稿', exact: true }).click();
  const review = dialog.getByRole('complementary', { name: '销售目标最新结果', exact: true });
  await review.waitFor();
  check('核对真实最新版本时草稿未被服务器金额覆盖', (await review.innerText()).includes('版本1') && await amount.inputValue() === '12345.67');
  await review.getByRole('button', { name: '已核对，保留草稿并采用此版本', exact: true }).click();
  await dialog.getByLabel('考核口径', { exact: true }).click();
  await admin.getByRole('option', { name: '旧负责人口径', exact: true }).click();
  check('界面切换口径后未预览前不能保存', await save.isDisabled());
  await dialog.getByRole('button', { name: '预览考核差异', exact: true }).click();
  const comparison = dialog.getByRole('complementary', { name: '销售目标考核差异', exact: true });
  await comparison.waitFor();
  check('真实差异页面同时显示旧口径、团队与单列期初金额', /旧负责人回款/.test(await comparison.innerText())
    && /团队分成回款/.test(await comparison.innerText()) && /期初快照/.test(await comparison.innerText()) && await save.isDisabled());
  await comparison.getByRole('checkbox').check();
  await holdActualWrite(admin, () => save.click(), async () => {
    check('真实保存响应等待中禁改、禁重提、禁放弃', await amount.isDisabled() && await save.isDisabled()
      && await dialog.getByRole('button', { name: '放弃草稿', exact: true }).isDisabled());
    await admin.keyboard.press('Escape');
    await save.evaluate(button => button.click());
    check('处理中Escape和再次点击仍保留草稿，不提前关闭', await dialog.isVisible() && await amount.inputValue() === '12345.67');
  }, check, waitFor);
  await dialog.waitFor({ state: 'hidden' });
  const saved = await read(uiTarget.salesTargetId);
  check('真实保存采用核对版本和完整精度，口径明确切换', saved.version === 2 && saved.targetAmount === '12345.67' && saved.calculationBasis === 'OWNER_V1');
  await admin.reload({ waitUntil: 'domcontentloaded' });
  await admin.getByLabel('考核口径', { exact: true }).click();
  await admin.getByRole('option', { name: '旧负责人口径', exact: true }).click();
  await admin.getByLabel('搜索目标', { exact: true }).fill(uiTarget.targetName);
  const reloaded = admin.getByRole('row').filter({ hasText: uiTarget.targetName });
  await reloaded.waitFor();
  check('刷新后从真实服务器重新加载已保存金额与口径', /12,345.67|12345.67/.test(await reloaded.innerText()) && (await reloaded.innerText()).includes('旧负责人口径'));

  const openCreate = async name => {
    await admin.getByRole('button', { name: '新增销售目标', exact: true }).click();
    const editor = admin.getByRole('dialog', { name: '新增销售目标', exact: true });
    await editor.getByLabel('目标名称', { exact: true }).fill(name);
    await editor.getByLabel('目标金额', { exact: true }).fill('12.34');
    return editor;
  };
  const lostName = `${prefix}_lost_response`;
  let lost = await openCreate(lostName);
  let committed, creationKey, writes = 0;
  const pattern = '**/api/crm/sales-target';
  const loseResponse = async route => {
    if (route.request().method() !== 'POST') return route.continue();
    writes++;
    creationKey = route.request().postDataJSON().requestKey;
    const response = await route.fetch({ timeout: 20000 });
    committed = { status: response.status(), body: await response.json() };
    await route.abort('failed');
  };
  await admin.route(pattern, loseResponse);
  try {
    await lost.getByRole('button', { name: '保存销售目标', exact: true }).click();
    await lost.getByRole('alert').waitFor();
    check('创建实际成功但响应丢失时只发一次写请求并保留草稿', committed?.status === 200 && committed.body?.code === 200 && writes === 1
      && await lost.getByLabel('目标金额', { exact: true }).inputValue() === '12.34'
      && await lost.getByRole('button', { name: '保存销售目标', exact: true }).isDisabled());
  } finally { await admin.unroute(pattern, loseResponse); }
  await lost.getByRole('button', { name: '核对最新结果，保留草稿', exact: true }).click();
  const original = lost.getByRole('complementary', { name: '销售目标最新结果', exact: true });
  await original.waitFor();
  check('丢失创建响应按原请求标识找到同一份目标', (await original.innerText()).includes(lostName)
    && database(`SELECT COUNT(*) FROM crm_sales_target WHERE tenant_id=100000 AND target_no=${literal(`MB${creationKey}`)};`) === '1');
  await original.getByRole('button', { name: '确认原创建结果并关闭', exact: true }).click();
  await lost.waitFor({ state: 'hidden' });
  const missingName = `${prefix}_not_sent`;
  lost = await openCreate(missingName);
  let unsentKey, rejectedWrites = 0;
  const rejectBeforeServer = async route => {
    if (route.request().method() !== 'POST') return route.continue();
    rejectedWrites++; unsentKey = route.request().postDataJSON().requestKey;
    await route.abort('failed');
  };
  await admin.route(pattern, rejectBeforeServer);
  try {
    await lost.getByRole('button', { name: '保存销售目标', exact: true }).click();
    await lost.getByRole('alert').waitFor();
  } finally { await admin.unroute(pattern, rejectBeforeServer); }
  await lost.getByRole('button', { name: '核对最新结果，保留草稿', exact: true }).click();
  const absent = lost.getByRole('complementary', { name: '销售目标创建核对', exact: true });
  await absent.waitFor();
  check('请求未到服务端时明确尚未创建，仍保留原请求标识与草稿', rejectedWrites === 1
    && database(`SELECT COUNT(*) FROM crm_sales_target WHERE tenant_id=100000 AND target_no=${literal(`MB${unsentKey}`)};`) === '0'
    && await lost.getByLabel('目标名称', { exact: true }).inputValue() === missingName);
  await absent.getByRole('button', { name: '已核对，使用同一标识重试', exact: true }).click();
  await lost.getByRole('button', { name: '保存销售目标', exact: true }).click();
  await lost.waitFor({ state: 'hidden' });
  check('显式重试后使用原标识真实创建且只有一份', database(`SELECT COUNT(*) FROM crm_sales_target WHERE tenant_id=100000 AND target_no=${literal(`MB${unsentKey}`)} AND target_name=${literal(missingName)};`) === '1');
  evidence.lostResponse = true;

  const abandoned = await openCreate(`${prefix}_discarded`);
  await abandoned.getByLabel('目标金额', { exact: true }).fill('1e2');
  await abandoned.getByRole('button', { name: '保存销售目标', exact: true }).click();
  await abandoned.getByRole('alert').waitFor();
  check('非法金额在页面明确说明且保留原输入', /十进制/.test(await abandoned.getByRole('alert').innerText())
    && await abandoned.getByLabel('目标金额', { exact: true }).inputValue() === '1e2');
  await abandoned.getByRole('button', { name: '放弃草稿', exact: true }).click();
  let confirmation = admin.getByRole('dialog', { name: '放弃销售目标草稿', exact: true });
  await confirmation.getByRole('button', { name: '取消', exact: true }).click();
  check('取消放弃后保留同一草稿', await abandoned.getByLabel('目标金额', { exact: true }).inputValue() === '1e2');
  await discard(abandoned);
  check('确认放弃无写入副作用', database(`SELECT COUNT(*) FROM crm_sales_target WHERE tenant_id=100000 AND target_name=${literal(`${prefix}_discarded`)};`) === '0');

  await employee.setViewportSize({ width: 375, height: 1000 });
  const ownRow = await openList(employee, partner.targetName);
  check('员工手机可查本人目标，新增编辑删除入口均不可见', await employee.getByRole('button', { name: '新增销售目标', exact: true }).count() === 0
    && await ownRow.getByRole('button', { name: '编辑目标', exact: true }).count() === 0 && await ownRow.getByRole('button', { name: '删除目标', exact: true }).count() === 0);
  await ownRow.getByRole('button', { name: '查看目标详情', exact: true }).click();
  const detail = employee.getByRole('dialog', { name: '销售目标详情', exact: true });
  await detail.getByText(partner.targetName, { exact: true }).waitFor();
  const own = await read(partner.salesTargetId, employee);
  const detailText = await detail.innerText();
  const displayedAmount = /实际回款：(-?[\d,]+(?:\.\d{1,2})?)/.exec(detailText)?.[1].replaceAll(',', '');
  check('员工详情显示真实本人金额、明确口径和期初说明', detailText.includes('团队分成')
    && detailText.includes('期初快照') && displayedAmount != null && cents(displayedAmount) === cents(own.achievedAmount));
  await employee.screenshot({ path: path.join(directory, `h3-sales-target-employee-${caseTag}-375.png`), fullPage: true });

  await admin.setViewportSize({ width: 1440, height: 1000 });
  const deletionRow = await openList(admin, lostName);
  await deletionRow.getByRole('button', { name: '删除目标', exact: true }).click();
  const removing = admin.getByRole('dialog', { name: '删除销售目标', exact: true });
  const created = committed.body.data;
  await edit({ ...write(await read(created.salesTargetId)), remark: `${prefix}_delete_conflict` });
  await removing.getByRole('button', { name: '确认删除目标', exact: true }).click();
  await removing.getByRole('alert').waitFor();
  check('真实过期版本删除被拒绝，目标仍存在', (await read(created.salesTargetId)).version === 1 && /修改|版本/.test(await removing.getByRole('alert').innerText()));
  await removing.getByRole('button', { name: '重新读取目标后核对', exact: true }).click();
  await waitFor(() => removing.innerText(), text => text.includes('版本1') && text.includes('已读取最新记录'), '删除核对未取得最新版本');
  await removing.getByRole('button', { name: '确认删除目标', exact: true }).click();
  await removing.waitFor({ state: 'hidden' });
  check('用户核对新版本后删除真实生效', database(`SELECT CONCAT(deleted,':',version) FROM crm_sales_target WHERE tenant_id=100000 AND sales_target_id=${created.salesTargetId};`) === '1:2');
  evidence.desktop = true; evidence.mobile = true;
}

async function holdActualWrite(page, action, inspect, check, waitFor) {
  const pattern = '**/api/crm/sales-target';
  let release, response, writes = 0;
  const gate = new Promise(resolve => { release = resolve; });
  let finished;
  const completion = new Promise(resolve => { finished = resolve; });
  const hold = async route => {
    if (route.request().method() !== 'PUT') return route.continue();
    writes++;
    try {
      response = await route.fetch({ timeout: 20000 });
      await gate;
      await route.fulfill({ response });
    } finally { finished(); }
  };
  await page.route(pattern, hold);
  try {
    await action();
    await waitFor(() => response, Boolean, '真实目标写响应尚未到达传输边界');
    assert.equal(response.status(), 200);
    assert.equal((await response.json()).code, 200);
    await inspect();
    check('保存等待期间没有产生第二次写请求', writes === 1);
  } finally {
    release();
    if (response) await completion;
    await page.unroute(pattern, hold);
  }
}
