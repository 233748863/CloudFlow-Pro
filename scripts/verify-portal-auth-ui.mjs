import assert from 'node:assert/strict';
import path from 'node:path';

async function verifyHeaderAvatar(page, check) {
  await page.waitForFunction(() => {
    const avatar = document.querySelector('.app-avatar');
    const picture = avatar?.querySelector('img');
    return avatar && (picture ? picture.complete && picture.naturalWidth > 0 : avatar.querySelector('[role="img"]'));
  });
  check('内部用户头像加载成功或显示本地默认头像', await page.locator('.app-avatar').isVisible());
}

export async function verifyPortalEmployeeGuard({ employee, origin, check, directory, caseTag }) {
  await employee.goto(`${origin}/system/portal-users`, { waitUntil: 'domcontentloaded' });
  try {
    await employee.getByRole('heading', { name: '权限不足', level: 1, exact: true }).waitFor();
    check('员工直达管理页被路由权限守卫拒绝且没有邀请写入口', await employee.getByText('您没有访问此页面的权限', { exact: true }).isVisible()
      && await employee.getByRole('button', { name: '邀请客户联系人', exact: true }).count() === 0);
    console.log('H3_PORTAL_EMPLOYEE_UI_GUARD: title=权限不足; text=您没有访问此页面的权限; invitation_controls=0; permission_bypass=false');
    await verifyHeaderAvatar(employee, check);
  } finally {
    await employee.screenshot({ path: path.join(directory, `h3-portal-employee-denied-${caseTag}.png`), fullPage: true });
    console.log(`H3_PORTAL_EMPLOYEE_UI_DIAGNOSTIC: path=${new URL(employee.url()).pathname}; headings=${JSON.stringify(await employee.getByRole('heading').allTextContents())}; invitation_controls=${await employee.getByRole('button', { name: '邀请客户联系人', exact: true }).count()}`);
  }
}

export async function verifyPortalInterface({ admin, employee, browser, origin, tenantCode, createBusiness, messageIds, message, activation, password, check, database, sql, waitFor, directory, caseTag, evidence, action, rememberToken }) {
  const portalNotice = '查看本公司的工单、合同和已公开财务记录，或查阅客户知识库。';
  const rememberSession = async page => rememberToken(await page.evaluate(code =>
    JSON.parse(sessionStorage.getItem('cloudflow.portal.session:' + code) || 'null')?.token, tenantCode));
  const business = await createBusiness('ui');
  const alternative = await createBusiness('choice');
  const dialog = admin.getByRole('dialog', { name: '邀请客户联系人', exact: true });
  const select = dialog.getByRole('combobox', { name: '客户联系人', exact: true });
  const selectContact = async customer => {
    await dialog.getByRole('textbox', { name: '搜索客户或联系人', exact: true }).fill(customer.name);
    const searched = admin.waitForResponse(response => new URL(response.url()).pathname === '/api/auth/system/portal-user/contacts');
    await dialog.getByRole('button', { name: '搜索', exact: true }).click();
    assert.equal((await searched).status(), 200);
    await waitFor(() => select.locator(`option[value="${customer.contactId}"]`).count(), count => count === 1, '真实联系人搜索未返回目标');
    await select.selectOption(String(customer.contactId));
  };
  const dimensions = async (page, label) => {
    const result = await page.evaluate(() => {
      const controls = [...document.querySelectorAll('.portal-controls button,.portal-controls input,.portal-controls select')]
        .filter(element => element.getClientRects().length).map(element => ({ height: element.getBoundingClientRect().height, width: element.getBoundingClientRect().width }));
      const dialogs = [...document.querySelectorAll('[role="dialog"]')].filter(element => element.getClientRects().length)
        .map(element => ({ left: element.getBoundingClientRect().left, right: element.getBoundingClientRect().right, scroll: element.scrollWidth, width: element.clientWidth }));
      return { width: innerWidth, scroll: document.documentElement.scrollWidth, controls, dialogs };
    });
    check(`${label}页面及弹窗无横向溢出`, result.scroll <= result.width && result.dialogs.every(value => value.left >= 0 && value.right <= result.width + 1 && value.scroll <= value.width + 1));
    check(`${label}可见门户控件至少44px高`, result.controls.length > 0 && result.controls.every(value => value.height >= 44));
  };
  await admin.setViewportSize({ width: 1440, height: 1000 });
  await admin.goto(`${origin}/system/portal-users`, { waitUntil: 'domcontentloaded' });
  await admin.getByRole('heading', { name: '客户门户账号', level: 2, exact: true }).waitFor();
  await admin.getByRole('button', { name: '邀请客户联系人', exact: true }).click();
  await selectContact(business);
  await dialog.getByRole('textbox', { name: '登录账号', exact: true }).fill(business.account);
  await dialog.getByRole('textbox', { name: '搜索客户或联系人', exact: true }).fill(alternative.name);
  const alternativeResponse = admin.waitForResponse(response => new URL(response.url()).pathname === '/api/auth/system/portal-user/contacts');
  await dialog.getByRole('button', { name: '搜索', exact: true }).click();
  await alternativeResponse;
  check('修改联系人搜索后清除旧选择并保留登录账号', await select.inputValue() === '' && await dialog.getByRole('textbox', { name: '登录账号', exact: true }).inputValue() === business.account);
  await selectContact(business);
  await dialog.getByRole('button', { name: '取消', exact: true }).click();
  const discard = admin.getByRole('dialog', { name: '放弃本次邀请输入？', exact: true });
  await discard.getByRole('button', { name: '继续填写', exact: true }).click();
  check('取消放弃邀请后联系人及账号输入保持', await select.inputValue() === String(business.contactId) && await dialog.getByRole('textbox', { name: '登录账号', exact: true }).inputValue() === business.account);
  const beforeMail = await messageIds();
  let release;
  let accepted = false;
  let submitted = 0;
  const gate = new Promise(resolve => { release = resolve; });
  const invitationRoute = '**/api/auth/system/portal-user/invite';
  await admin.route(invitationRoute, async route => {
    submitted++;
    const response = await route.fetch();
    accepted = response.status() === 200 && (await response.json()).code === 200;
    await gate;
    await route.abort('connectionreset');
  });
  try {
    await dialog.getByRole('button', { name: '保存并邀请', exact: true }).dblclick();
    await waitFor(() => accepted, Boolean, '真实邀请未受理，不能开展丢响应测试');
    for (const width of [1440, 320, 375]) {
      await admin.setViewportSize({ width, height: 1000 });
      await dimensions(admin, `邀请处理中${width}px`);
      check(`${width}px处理中禁止编辑、取消与重复提交`, await dialog.getByRole('textbox', { name: '登录账号', exact: true }).isDisabled()
        && await dialog.getByRole('button', { name: '取消', exact: true }).isDisabled() && await dialog.getByRole('button', { name: '正在保存…', exact: true }).isDisabled());
    }
    await admin.keyboard.press('Escape');
    check('保存中Escape不能关闭邀请窗口且双击只发一次请求', await dialog.isVisible() && submitted === 1);
    release();
    await dialog.getByRole('button', { name: '核对邀请结果', exact: true }).waitFor();
    check('邀请成功响应丢失后保留原输入并要求只读核对', await dialog.getByRole('textbox', { name: '登录账号', exact: true }).inputValue() === business.account
      && await select.inputValue() === String(business.contactId));
    await dialog.getByRole('button', { name: '核对邀请结果', exact: true }).click();
    await dialog.waitFor({ state: 'hidden' });
    check('丢响应后查回实际邀请且没有重新提交', submitted === 1 && database(`SELECT COUNT(*) FROM sys_portal_user WHERE tenant_id=100000 AND login_account=${sql(business.account)};`) === '1');
  } finally { release(); await admin.unroute(invitationRoute); }
  const invitation = activation(await message(business, beforeMail));
  await admin.setViewportSize({ width: 1440, height: 1000 });
  await admin.getByRole('button', { name: '刷新', exact: true }).click();
  const acceptedCard = admin.getByRole('article', { name: `门户账号 ${business.account}`, exact: true });
  await acceptedCard.getByText('邀请邮件：邮件服务已接纳', { exact: true }).waitFor();
  check('管理页根据真实发送成功记录显示等待激活，不误报排队', await acceptedCard.getByText('邮件服务已接纳，等待收件人设置密码激活', { exact: true }).isVisible()
    && !(await acceptedCard.innerText()).includes('排队中'));
  await verifyHeaderAvatar(admin, check);
  await admin.screenshot({ path: path.join(directory, `h3-portal-admin-desktop-${caseTag}.png`), fullPage: true });
  const portalPage = await admin.context().newPage();
  const internalBefore = await admin.evaluate(async () => (await import('/src/utils/authStorage.ts')).getAuthToken());
  const sentHeaders = [];
  const watchRequest = request => {
    if (new URL(request.url()).pathname.startsWith('/api/portal/')) {
      const headers = request.headers();
      sentHeaders.push({ cookie: Boolean(headers.cookie), internalToken: Boolean(headers.authorization), path: new URL(request.url()).pathname });
    }
  };
  portalPage.on('request', watchRequest);
  try {
    await portalPage.goto(`${origin}/portal/${tenantCode}/activate#token=${invitation}`, { waitUntil: 'domcontentloaded' });
    await portalPage.getByRole('button', { name: '设置密码并激活', exact: true }).waitFor();
    await waitFor(() => portalPage.getByRole('button', { name: '设置密码并激活', exact: true }).isEnabled(), Boolean, '门户激活页未就绪');
    check('激活页面立即移除片段且不把激活令牌写入浏览器存储', !new URL(portalPage.url()).hash && await portalPage.evaluate(token =>
      ![...Object.values(localStorage), ...Object.values(sessionStorage)].some(value => value.includes(token)), invitation));
    await portalPage.getByLabel('设置密码', { exact: true }).fill(password);
    await portalPage.getByLabel('确认密码', { exact: true }).fill(password + 'different');
    await portalPage.getByRole('button', { name: '设置密码并激活', exact: true }).click();
    await portalPage.getByRole('alert').filter({ hasText: '两次输入的密码不一致' }).waitFor();
    check('密码确认失败保留原密码且未发送激活请求', await portalPage.getByLabel('设置密码', { exact: true }).inputValue() === password && !sentHeaders.some(value => value.path.endsWith('/activate')));
    await portalPage.getByLabel('确认密码', { exact: true }).fill(password);
    const activated = portalPage.waitForResponse(response => new URL(response.url()).pathname.endsWith('/activate') && response.request().method() === 'POST');
    await portalPage.getByRole('button', { name: '设置密码并激活', exact: true }).dblclick();
    assert.equal((await activated).status(), 200);
    await portalPage.getByText('账号已激活，请使用邀请中的登录账号和刚设置的密码登录。', { exact: true }).waitFor();
    check('电脑页面完成一次真实激活并清空密码输入', await portalPage.getByLabel('设置密码', { exact: true }).count() === 0 && sentHeaders.filter(value => value.path.endsWith('/activate')).length === 1);
    await portalPage.getByRole('button', { name: '前往登录', exact: true }).click();
    await portalPage.getByLabel('登录账号', { exact: true }).fill(business.account);
    await portalPage.getByLabel('密码', { exact: true }).fill(password);
    await waitFor(() => portalPage.getByRole('button', { name: '登录', exact: true }).isEnabled(), Boolean, '门户登录页未就绪');
    let loginAccepted = false;
    const loginRoute = `**/api/portal/${tenantCode}/login`;
    await portalPage.route(loginRoute, async route => {
      const response = await route.fetch();
      const result = await response.json();
      loginAccepted = response.status() === 200 && result.code === 200;
      if (loginAccepted) rememberToken(result.data.portalToken);
      await route.abort('connectionreset');
    });
    try {
      await portalPage.getByRole('button', { name: '登录', exact: true }).click();
      await portalPage.getByRole('alert').filter({ hasText: '连接中断' }).waitFor();
      check('登录成功响应丢失后保留账号与密码、不伪造登录', loginAccepted && await portalPage.getByLabel('密码', { exact: true }).inputValue() === password
        && new URL(portalPage.url()).pathname.endsWith('/login') && await portalPage.evaluate(code => !sessionStorage.getItem('cloudflow.portal.session:' + code), tenantCode));
    } finally { await portalPage.unroute(loginRoute); }
    await portalPage.getByRole('button', { name: '登录', exact: true }).click();
    await portalPage.getByText(portalNotice, { exact: true }).waitFor();
    await rememberSession(portalPage);
    check('电脑重试真实登录后进入独立门户并开放工单、知识库及合同入口', await portalPage.getByRole('heading', { name: '客户门户', exact: true }).isVisible()
      && await portalPage.getByRole('button', { name: '客户知识库', exact: true }).isEnabled()
      && await portalPage.getByRole('button', { name: '客户工单', exact: true }).isEnabled()
      && await portalPage.getByRole('button', { name: '本公司合同', exact: true }).isEnabled());
    check('门户认证请求不携带现有内部Cookie或Authorization', sentHeaders.length > 0 && sentHeaders.every(value => !value.cookie && !value.internalToken));
    check('同浏览器门户登录不改变内部员工令牌', internalBefore === await admin.evaluate(async () => (await import('/src/utils/authStorage.ts')).getAuthToken()));
    await dimensions(portalPage, '电脑门户');
    await portalPage.screenshot({ path: path.join(directory, `h3-portal-client-desktop-${caseTag}.png`), fullPage: true });
    await portalPage.getByRole('button', { name: '退出客户门户', exact: true }).click();
    await portalPage.getByRole('heading', { name: '登录客户门户', exact: true }).waitFor();
    check('页面退出只清除当前门户存储且内部账号保留', await portalPage.evaluate(code => !sessionStorage.getItem('cloudflow.portal.session:' + code), tenantCode)
      && internalBefore === await admin.evaluate(async () => (await import('/src/utils/authStorage.ts')).getAuthToken()));
    evidence.desktop = true;
  } finally { portalPage.off('request', watchRequest); await portalPage.close(); }
  for (const width of [320, 375]) {
    const mobileContext = await browser.newContext({ viewport: { width, height: 900 }, isMobile: true, hasTouch: true, ignoreHTTPSErrors: true, serviceWorkers: 'block',
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1', storageState: await admin.context().storageState() });
    const mobile = await mobileContext.newPage();
    try {
      await mobile.goto(`${origin}/system/portal-users`, { waitUntil: 'domcontentloaded' });
      await mobile.getByRole('heading', { name: '客户门户账号', level: 2, exact: true }).waitFor();
      check(`${width}px真实手机入口加载门户管理页`, await mobile.locator('.cf-mobile-app-shell').count() === 1 && await mobile.getByText('此功能暂不支持移动端，请在电脑访问。', { exact: true }).count() === 0);
      await mobile.getByRole('button', { name: '邀请客户联系人', exact: true }).click();
      const mobileDialog = mobile.getByRole('dialog', { name: '邀请客户联系人', exact: true });
      await mobileDialog.getByRole('textbox', { name: '登录账号', exact: true }).fill(`mobile.${caseTag}.${width}`);
      await dimensions(mobile, `${width}px手机邀请`);
      await mobileDialog.getByRole('button', { name: '取消', exact: true }).click();
      await mobile.getByRole('dialog', { name: '放弃本次邀请输入？', exact: true }).getByRole('button', { name: '继续填写', exact: true }).click();
      check(`${width}px手机取消放弃保留输入`, await mobileDialog.getByRole('textbox', { name: '登录账号', exact: true }).inputValue() === `mobile.${caseTag}.${width}`);
      await mobileDialog.getByRole('button', { name: '取消', exact: true }).click();
      await mobile.getByRole('dialog', { name: '放弃本次邀请输入？', exact: true }).getByRole('button', { name: '放弃输入', exact: true }).click();
      await mobile.goto(`${origin}/portal/${tenantCode}/login`, { waitUntil: 'domcontentloaded' });
      await mobile.getByLabel('登录账号', { exact: true }).fill(business.account);
      await mobile.getByLabel('密码', { exact: true }).fill(password);
      await waitFor(() => mobile.getByRole('button', { name: '登录', exact: true }).isEnabled(), Boolean, '手机门户未就绪');
      await mobile.getByRole('button', { name: '登录', exact: true }).click();
      await mobile.getByText(portalNotice, { exact: true }).waitFor();
      check(`${width}px手机开放工单、知识库和合同入口`, await mobile.getByRole('button', { name: '客户知识库', exact: true }).isEnabled()
        && await mobile.getByRole('button', { name: '客户工单', exact: true }).isEnabled()
        && await mobile.getByRole('button', { name: '本公司合同', exact: true }).isEnabled());
      await rememberSession(mobile);
      await dimensions(mobile, `${width}px手机门户`);
      await mobile.screenshot({ path: path.join(directory, `h3-portal-client-mobile-${width}-${caseTag}.png`), fullPage: true });
      await mobile.getByRole('button', { name: '本公司合同', exact: true }).click();
      await mobile.getByRole('heading', { name: '本公司合同', exact: true }).waitFor();
      await mobile.getByText('暂无符合条件的已开放合同。', { exact: true }).waitFor();
      check(`${width}px手机从门户首页进入合同，真实空列表没有其他公司数据`, await mobile.getByRole('article').count() === 0);
      await mobile.screenshot({ path: path.join(directory, `h3-portal-contract-entry-mobile-${width}-${caseTag}.png`), fullPage: true });
      await mobile.getByRole('button', { name: '返回门户', exact: true }).click();
      await mobile.getByText(portalNotice, { exact: true }).waitFor();
      if (width === 375) {
        await action(business.account, 'disable');
        await mobile.reload({ waitUntil: 'domcontentloaded' });
        await mobile.getByRole('heading', { name: '登录客户门户', exact: true }).waitFor();
        check('手机遇到真实门户401只清门户会话并回到登录', await mobile.evaluate(code => !sessionStorage.getItem('cloudflow.portal.session:' + code), tenantCode)
          && internalBefore === await mobile.evaluate(async () => (await import('/src/utils/authStorage.ts')).getAuthToken()));
      } else {
        await mobile.getByRole('button', { name: '退出客户门户', exact: true }).click();
        await mobile.getByRole('heading', { name: '登录客户门户', exact: true }).waitFor();
      }
    } finally { await mobileContext.close(); }
  }
  await verifyPortalEmployeeGuard({ employee, origin, check, directory, caseTag });
  evidence.mobile = true;
}
