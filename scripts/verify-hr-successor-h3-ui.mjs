import path from 'node:path';

export async function verifyHrSuccessorInterface(context) {
  const { hr, admin, employee, api, successful, database, check, directory, caseTag, evidence, identity, readApplication, salesId, managerId } = context;
  const donor = identity('ui');
  const nameFor = userId => database(`SELECT name FROM hr_employee WHERE tenant_id=100000 AND user_id=${userId} AND deleted=0;`);
  const userLabelFor = userId => database(`SELECT nick_name FROM sys_user WHERE tenant_id=100000 AND user_id=${userId} AND deleted=0;`);
  const salesName = nameFor(salesId);
  const salesLabel = userLabelFor(salesId);
  const managerLabel = userLabelFor(managerId);
  const errors = [];
  const forbiddenOptions = [];
  hr.on('pageerror', error => errors.push(error.message));
  hr.on('response', response => {
    if (response.status() === 403 && new URL(response.url()).pathname === '/api/auth/system/post/list') forbiddenOptions.push(response.status());
  });
  const navigate = (page, route) => page.goto(new URL(route, page.url()).href, { waitUntil: 'domcontentloaded' });
  const pick = async (dialog, label, name) => {
    await dialog.getByRole('combobox', { name: label, exact: true }).click();
    await hr.getByRole('searchbox').last().fill(name);
    const option = hr.getByRole('option').filter({ hasText: name });
    await option.waitFor();
    await option.click();
  };
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
    await hr.route(pattern, handler);
    let timer;
    try {
      await action();
      const result = await Promise.race([observed, new Promise((resolve, reject) => { timer = setTimeout(() => reject(new Error('真实HR响应等待超时')), 25000); })]);
      check(`HR${method}处理中检查采用实际成功响应`, result.status === 200 && result.body?.code === 200);
      await inspect();
    } finally {
      clearTimeout(timer); release(); if (started) await finished; await hr.unroute(pattern, handler);
    }
    if (failure) throw failure;
  };

  await hr.setViewportSize({ width: 320, height: 1000 });
  await navigate(hr, '/hr/lifecycle');
  await hr.getByRole('tab', { name: '离职', exact: true }).click();
  await hr.getByRole('button', { name: '新增离职', exact: true }).click();
  const create = hr.getByRole('dialog', { name: '新增离职申请', exact: true });
  await pick(create, '员工', donor.name);
  await create.getByRole('group', { name: '离职日期', exact: true }).getByRole('button').click();
  await hr.getByRole('button', { name: '今天', exact: true }).click();
  const reason = create.getByRole('textbox', { name: '离职原因', exact: true });
  const draft = `真实离职保留草稿_${caseTag}`;
  await reason.fill(draft);
  await pick(create, '客户业务接任人（可选）', donor.name);
  const mounted = await create.elementHandle();
  try {
    for (const width of [1440, 375, 320]) {
      await hr.setViewportSize({ width, height: 1000 });
      await hr.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const dimensions = await hr.evaluate(() => ({ document: document.documentElement.scrollWidth, viewport: innerWidth }));
      const save = create.getByRole('button', { name: '保存', exact: true });
      await save.click({ trial: true });
      const bounds = await save.boundingBox();
      console.log(`H3_HR_CREATE_LAYOUT: ${JSON.stringify({ width, connected: await mounted.evaluate(element => element.isConnected), draft: await reason.inputValue() === draft,
        selected: (await create.getByRole('combobox', { name: '客户业务接任人（可选）', exact: true }).innerText()).includes(donor.name), dimensions, bounds })}`);
      check(`HR新增离职${width}px切换保留同一表单与选择，按钮至少44px且无横向溢出`, await mounted.evaluate(element => element.isConnected)
        && await reason.inputValue() === draft && (await create.getByRole('combobox', { name: '客户业务接任人（可选）', exact: true }).innerText()).includes(donor.name)
        && dimensions.document <= dimensions.viewport && bounds?.height >= 44 && bounds?.width >= 44);
      await hr.screenshot({ path: path.join(directory, `h3-hr-successor-create-${caseTag}-${width}.png`), fullPage: true });
    }
  } finally { await mounted.dispose(); }
  await create.getByRole('button', { name: '保存', exact: true }).click();
  await create.getByRole('alert').filter({ hasText: '同一人' }).waitFor();
  check('真实自我接任校验失败后表单不关闭且原因与人员选择保留', await reason.inputValue() === draft
    && (await create.getByRole('combobox', { name: '客户业务接任人（可选）', exact: true }).innerText()).includes(donor.name));
  await pick(create, '客户业务接任人（可选）', salesLabel);
  await delayActual('**/api/hr/lifecycle/applications', 'POST', () => create.getByRole('button', { name: '保存', exact: true }).click(), async () => {
    check('真实HR新增保存中禁用原因、人员、取消和重复提交', await reason.isDisabled()
      && await create.getByRole('combobox', { name: '客户业务接任人（可选）', exact: true }).isDisabled()
      && await create.getByRole('button', { name: '取消', exact: true }).isDisabled()
      && await create.getByRole('button', { name: '提交中...', exact: true }).isDisabled());
    await hr.keyboard.press('Escape');
    check('HR新增保存中Escape不丢失表单', await create.isVisible());
  });
  await create.waitFor({ state: 'hidden' });
  const applicationId = Number(database(`SELECT id FROM hr_lifecycle_application WHERE tenant_id=100000 AND employee_id=${donor.employeeId};`));
  let application = await readApplication(applicationId);
  check('手机实际保存生成唯一离职申请及选定接任人', applicationId > 0 && application.successorUserId === salesId
    && database(`SELECT COUNT(*) FROM hr_lifecycle_application WHERE tenant_id=100000 AND employee_id=${donor.employeeId};`) === '1');
  await hr.reload({ waitUntil: 'domcontentloaded' });
  await hr.getByRole('tab', { name: '离职', exact: true }).click();
  const row = hr.getByRole('row').filter({ hasText: donor.name });
  await row.waitFor();
  check('手机刷新后实际接任人从服务器重新展示', (await row.innerText()).includes(salesName));
  await row.getByRole('button', { name: '交接安排', exact: true }).click();
  const arrange = hr.getByRole('dialog', { name: '离职交接安排', exact: true });
  await arrange.getByRole('combobox', { name: '客户业务接任人（可选）', exact: true }).waitFor();
  await pick(arrange, '客户业务接任人（可选）', managerLabel);
  successful(await api(admin, `/hr/lifecycle/applications/${applicationId}`, { method: 'PUT', body: { version: application.version, detailJson: { successorUserId: null } } }), '实际并发修改HR接任人');
  await arrange.getByRole('button', { name: '保存接任人', exact: true }).click();
  await arrange.getByRole('alert').filter({ hasText: '已被修改' }).waitFor();
  check('HR真实版本冲突保留主管选择并阻止静默覆盖', (await arrange.getByRole('combobox', { name: '客户业务接任人（可选）', exact: true }).innerText()).includes(managerLabel)
    && await arrange.getByRole('button', { name: '保存接任人', exact: true }).isDisabled());
  await arrange.getByRole('button', { name: '读取最新申请（保留选择）', exact: true }).click();
  const comparison = arrange.getByRole('complementary', { name: '接任人版本冲突核对', exact: true });
  await comparison.waitFor();
  check('HR冲突核对显示服务器最新未指定状态', (await comparison.innerText()).includes('未指定'));
  await comparison.getByRole('button', { name: '已核对，保留选择并采用最新版本', exact: true }).click();
  for (const width of [1440, 375, 320]) {
    await hr.setViewportSize({ width, height: 1000 });
    const dimensions = await hr.evaluate(() => ({ document: document.documentElement.scrollWidth, viewport: innerWidth }));
    check(`HR交接安排${width}px保留冲突核对后的选择且无横向溢出`, (await arrange.getByRole('combobox', { name: '客户业务接任人（可选）', exact: true }).innerText()).includes(managerLabel)
      && dimensions.document <= dimensions.viewport);
    await hr.screenshot({ path: path.join(directory, `h3-hr-successor-arrange-${caseTag}-${width}.png`), fullPage: true });
  }
  await delayActual(`**/api/hr/lifecycle/applications/${applicationId}`, 'PUT', () => arrange.getByRole('button', { name: '保存接任人', exact: true }).click(), async () => {
    check('HR变更接任人保存中禁用选择、关闭及再次保存', await arrange.getByRole('combobox', { name: '客户业务接任人（可选）', exact: true }).isDisabled()
      && await arrange.getByRole('button', { name: '关闭', exact: true }).isDisabled()
      && await arrange.getByRole('button', { name: '处理中...', exact: true }).isDisabled());
    await hr.keyboard.press('Escape');
    check('HR交接安排保存中Escape保持弹窗', await arrange.isVisible());
  });
  await arrange.getByRole('button', { name: '保存接任人', exact: true }).click({ trial: true });
  application = await readApplication(applicationId);
  check('核对后真实保存选定主管且只更新一次版本', application.successorUserId === managerId && application.version === 2);
  await arrange.getByRole('button', { name: '关闭', exact: true }).click();
  await row.getByRole('button', { name: '提交', exact: true }).click();
  await row.getByRole('button', { name: '通过', exact: true }).waitFor();
  check('HR页面真实提交后显示审批中', (await row.innerText()).includes('审批中'));
  await row.getByRole('button', { name: '通过', exact: true }).click();
  await row.getByRole('button', { name: '完成', exact: true }).waitFor();
  await row.getByRole('button', { name: '交接安排', exact: true }).click();
  const task = arrange.getByRole('button', { name: '确认完成资产交接', exact: true });
  await task.waitFor();
  await delayActual('**/api/hr/lifecycle/tasks/*/complete', 'POST', () => task.click(), async () => {
    check('真实任务确认中禁止重复确认或关闭', await task.isDisabled() && await arrange.getByRole('button', { name: '关闭', exact: true }).isDisabled());
  });
  await task.waitFor({ state: 'hidden' });
  check('真实离职任务确认后显示已完成', (await arrange.getByRole('region', { name: '离职交接任务', exact: true }).innerText()).includes('已完成'));
  await arrange.getByRole('button', { name: '关闭', exact: true }).click();
  await row.getByRole('button', { name: '完成', exact: true }).click();
  await row.getByText('已完成', { exact: true }).waitFor();
  await row.getByRole('button', { name: '交接安排', exact: true }).click();
  await arrange.getByText('此申请已结束，接任人安排只读。', { exact: true }).waitFor();
  check('离职完成后HR页面交接安排只读且没有保存入口', await arrange.getByRole('combobox', { name: '客户业务接任人（可选）', exact: true }).isDisabled()
    && await arrange.getByRole('button', { name: '保存接任人', exact: true }).count() === 0);
  await arrange.getByRole('button', { name: '关闭', exact: true }).click();
  await employee.setViewportSize({ width: 375, height: 1000 });
  await navigate(employee, '/hr/lifecycle');
  check('EMPLOYEE手机直接访问HR异动无新增或交接安排入口', await employee.getByRole('button', { name: '新增离职', exact: true }).count() === 0
    && await employee.getByRole('button', { name: '交接安排', exact: true }).count() === 0);
  check('新增离职、失败保留及交接安排全程无浏览器未处理异常', errors.length === 0);
  check('HR离职页面不依赖无权读取的系统岗位管理列表', forbiddenOptions.length === 0);
  evidence.hrSuccessorDesktop = true; evidence.hrSuccessorMobile = true; evidence.hrSuccessorUiWorkflow = true;
}
