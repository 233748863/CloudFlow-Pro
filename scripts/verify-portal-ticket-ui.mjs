import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { waitForShellLayout } from './portal-checks/wait-shell-layout.mjs';
import { measurePortalControls } from './portal-checks/measure-content-bounds.mjs';

export async function verifyPortalTicketInterface(context) {
  const { admin, api, successful, database, check, directory, caseTag, browser, origin, tenantCode, first, password,
    secrets, evidence, prefix, firstFile, current, support, reserve, token, actors, portalUserId, publish } = context;
  const client = await browser.newContext({ viewport: { width: 1440, height: 1000 }, ignoreHTTPSErrors: true, serviceWorkers: 'block', acceptDownloads: true });
  const failures = [];
  const page = await client.newPage(); page.on('pageerror', error => failures.push(error.message));
  const title = `${prefix}_UI真实提交`;
  const description = `UI原始描述 ${caseTag}`;
  const fileName = `${prefix}_ui.txt`;
  const solution = `UI公开方案 ${caseTag}`;
  const snapshots = [];
  const routeFailures = [];
  let releaseSubmission;
  const assertRoutes = () => { if (routeFailures.length) throw routeFailures[0]; };
  const interceptResponse = async (target, pattern, method, operation) => {
    let completed = false;
    const handler = async route => {
      if (route.request().method() !== method) return route.continue();
      try { await operation(route); }
      catch (error) { routeFailures.push(error); await route.abort('failed').catch(() => {}); }
      finally { completed = true; }
    };
    await target.route(pattern, handler);
    return async () => {
      await context.waitFor(() => { assertRoutes(); return completed; }, Boolean, '真实响应截断尚未完成');
      await target.unroute(pattern, handler);
    };
  };
  const layout = async (target, dialog, width, label) => {
    await waitForShellLayout(target);
    if (label === '分派' || label === '发布') {
      const name = label === '分派' ? '确认分派' : '撤回已发布方案';
      const action = dialog.getByRole('button', { name, exact: true });
      await action.scrollIntoViewIfNeeded();
      const actions = label === '分派' ? action : dialog.getByRole('region', { name: '对客户发布方案', exact: true }).getByRole('button');
      const controls = await measurePortalControls(actions);
      console.log(`H3_PORTAL_TICKET_CONTROLS: label=${label}; width=${width}; geometry=${JSON.stringify(controls)}`);
      check(`${label}${width}px关键操作完整位于实际视口且无遮挡`, controls.allVisible);
    }
    const geometry = await dialog.evaluate(element => ({ left: element.getBoundingClientRect().left, right: element.getBoundingClientRect().right,
      viewport: innerWidth, controls: [...element.querySelectorAll('button,select')].filter(control => control.getClientRects().length).map(control => ({ height: control.getBoundingClientRect().height, width: control.getBoundingClientRect().width })) }));
    check(`${label}${width}px弹窗不溢出且操作区至少44px`, geometry.left >= 0 && geometry.right <= geometry.viewport + 1
      && geometry.controls.every(control => control.height >= 44 && control.width >= 44));
    check(`${label}${width}px整页无横向溢出`, await target.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    const filename = `h3-ticket-${label}-${width}-${caseTag}.png`; snapshots.push(filename);
    await target.screenshot({ path: path.join(directory, filename), fullPage: false });
  };
  const openInternal = async (target, ticketTitle) => {
    await target.bringToFront(); await target.goto(`${origin}/office/crm/tickets`, { waitUntil: 'domcontentloaded' });
    await target.getByRole('textbox', { name: '搜索客户经营记录' }).fill(ticketTitle);
    await target.getByRole('button', { name: `门户处理 ${ticketTitle}`, exact: true }).click();
    const dialog = target.getByRole('dialog', { name: `门户处理 · ${ticketTitle}`, exact: true });
    await dialog.getByText(description, { exact: true }).waitFor(); return dialog;
  };
  const listLayout = async (target, width) => {
    await target.setViewportSize({ width, height: 1000 });
    await waitForShellLayout(target);
    await context.waitFor(async () => (await target.locator('.portal-ticket-table').isVisible()) === (width >= 1024)
      && (await target.locator('.portal-ticket-cards').isVisible()) === (width < 1024), Boolean, '工单列表未切换到唯一的适配视图');
    check(`内部列表${width}px仅显示一份工单操作入口`, await target.getByRole('button', { name: `门户处理 ${title}`, exact: true }).count() === 1);
    const controls = await target.locator('.portal-ticket-actions button').evaluateAll(buttons => buttons.filter(button => button.getClientRects().length).map(button => {
      const bounds = button.getBoundingClientRect();
      return { width: bounds.width, height: bounds.height, left: bounds.left, right: bounds.right, content: button.scrollWidth, available: button.clientWidth };
    }));
    console.log(`H3_PORTAL_TICKET_BUTTON_GEOMETRY: viewport=${width}; controls=${JSON.stringify(controls)}`);
    check(`内部列表${width}px按钮文字不重叠且操作区至少44px`, controls.length > 0 && controls.every(control => control.width >= 44 && control.height >= 44
      && control.content <= control.available + 1 && (width >= 1024 || control.left >= 0 && control.right <= width + 1)));
    const queue = await target.getByRole('checkbox', { name: '只看门户待分派工单', exact: true }).evaluate(input => {
      const label = input.closest('label'); const bounds = input.getBoundingClientRect();
      return { width: bounds.width, height: bounds.height, target: label.getBoundingClientRect().height, content: label.scrollWidth, available: label.clientWidth };
    });
    check(`待分派筛选${width}px勾选框20px且整行触控至少44px`, queue.width === 20 && queue.height === 20 && queue.target >= 44 && queue.content <= queue.available + 1);
    check(`内部列表${width}px无横向溢出`, await target.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    const headerImage = `h3-ticket-内部列表顶部-${width}-${caseTag}.png`; snapshots.push(headerImage);
    await target.getByRole('heading', { name: '服务工单', level: 2, exact: true }).scrollIntoViewIfNeeded();
    await target.screenshot({ path: path.join(directory, headerImage), fullPage: false });
    await target.getByRole('button', { name: `门户处理 ${title}`, exact: true }).scrollIntoViewIfNeeded();
    const filename = `h3-ticket-内部列表-${width}-${caseTag}.png`; snapshots.push(filename);
    await target.screenshot({ path: path.join(directory, filename), fullPage: false });
  };
  const customerListLayout = async (target, width) => {
    await target.setViewportSize({ width, height: 1000 });
    await waitForShellLayout(target);
    const card = target.locator('.portal-ticket-page > .portal-card');
    const ticket = card.locator('article').filter({ has: target.getByRole('heading', { name: title, level: 2, exact: true }) });
    await ticket.waitFor();
    const geometry = await card.evaluate(element => {
      const bounds = element.getBoundingClientRect();
      const controls = [...element.querySelectorAll('button,input,select')].filter(control => control.getClientRects().length).map(control => {
        const box = control.getBoundingClientRect();
        return { left: box.left, right: box.right, width: box.width, height: box.height, content: control.scrollWidth, available: control.clientWidth };
      });
      const text = [];
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
      let node;
      while ((node = walker.nextNode())) {
        if (!node.textContent.trim()) continue;
        const range = document.createRange(); range.selectNodeContents(node);
        for (const line of range.getClientRects()) if (line.width && line.height) text.push({ left: line.left, right: line.right });
      }
      return { left: bounds.left, right: bounds.right, content: element.scrollWidth, available: element.clientWidth, controls, text };
    });
    check(`客户列表${width}px卡片和实际文字行均在屏幕内`, geometry.left >= 0 && geometry.right <= width + 1
      && geometry.content <= geometry.available + 1 && geometry.text.length > 0
      && geometry.text.every(line => line.left >= geometry.left - 1 && line.right <= geometry.right + 1));
    check(`客户列表${width}px筛选和操作文字完整且触控至少44px`, geometry.controls.length > 0
      && geometry.controls.every(control => control.left >= geometry.left && control.right <= geometry.right + 1
        && control.width >= 44 && control.height >= 44 && control.content <= control.available + 1));
    check(`客户列表${width}px整页无横向溢出`, await target.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await target.getByRole('heading', { name: '客户工单', level: 1, exact: true }).scrollIntoViewIfNeeded();
    const headerImage = `h3-ticket-客户列表顶部-${width}-${caseTag}.png`; snapshots.push(headerImage);
    await target.screenshot({ path: path.join(directory, headerImage), fullPage: false });
    const action = ticket.getByRole('button', { name: `查看工单 ${title}`, exact: true });
    await action.scrollIntoViewIfNeeded();
    check(`客户列表${width}px查看进度按钮完整可见且无遮挡`, await action.evaluate(button => {
      const bounds = button.getBoundingClientRect();
      const center = document.elementFromPoint(bounds.left + bounds.width / 2, bounds.top + bounds.height / 2);
      return bounds.left >= 0 && bounds.right <= innerWidth && bounds.top >= 0 && bounds.bottom <= innerHeight
        && (center === button || button.contains(center));
    }));
    const actionImage = `h3-ticket-客户列表操作-${width}-${caseTag}.png`; snapshots.push(actionImage);
    await target.screenshot({ path: path.join(directory, actionImage), fullPage: false });
  };
  try {
    await client.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    await reserve(token);
    await page.goto(`${origin}/portal/${tenantCode}/login`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('textbox', { name: '登录账号', exact: true }).fill(first.account);
    await page.getByLabel('密码', { exact: true }).fill(password);
    await page.getByRole('button', { name: '登录', exact: true }).click();
    await page.getByRole('button', { name: '客户知识库', exact: true }).waitFor();
    const browserToken = await page.evaluate(code => JSON.parse(sessionStorage.getItem(`cloudflow.portal.session:${code}`)).token, tenantCode);
    assert.match(browserToken, /^p_[A-Za-z0-9_-]{43}$/); secrets.push(browserToken); actors.set(browserToken, portalUserId);
    await page.goto(`${origin}/portal/${tenantCode}/tickets`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: '提交新工单', exact: true }).click();
    const composer = page.getByRole('dialog', { name: '提交客户工单', exact: true });
    const titleInput = composer.getByRole('textbox', { name: '工单标题（最多120字符）', exact: true });
    const descriptionInput = composer.getByRole('textbox', { name: '问题描述（最多1000字符）', exact: true });
    await titleInput.fill(title); await descriptionInput.fill(description);
    await composer.getByRole('button', { name: '返回列表（保留本页草稿）', exact: true }).click();
    await page.getByRole('button', { name: '客户知识库', exact: true }).click();
    await page.getByRole('dialog', { name: '离开客户工单页面？', exact: true }).getByRole('button', { name: '保留草稿，继续处理', exact: true }).click();
    await page.getByRole('button', { name: '提交新工单', exact: true }).click();
    check('关闭弹窗返回列表及取消离开页面均保留客户输入', await titleInput.inputValue() === title && await descriptionInput.inputValue() === description);
    let uploads = 0; let uploadedId;
    const finishUpload = await interceptResponse(page, '**/api/portal/file/upload', 'POST', async route => {
      uploads++; const response = await route.fetch(); const result = await response.json();
      assert.equal(response.status(), 200); assert.equal(result.code, 200); uploadedId = result.data.fileId;
      await route.abort('connectionfailed');
    });
    await composer.locator('input[type=file]').setInputFiles({ name: fileName, mimeType: 'text/plain', buffer: firstFile.bytes });
    await finishUpload();
    await composer.getByRole('button', { name: '核对上传结果', exact: true }).waitFor();
    await composer.getByRole('button', { name: '核对上传结果', exact: true }).click();
    await composer.getByText('已核对上传结果', { exact: true }).waitFor();
    check('实际上传响应丢失后只读核对恢复原文件，不再次上传', uploads === 1 && Number.isSafeInteger(uploadedId)
      && database(`SELECT COUNT(*) FROM sys_file WHERE file_id=${uploadedId} AND portal_owner_id=${portalUserId} AND biz_type='PORTAL_TICKET_UPLOAD';`) === '1');
    let submittedId; let submissions = 0;
    const gate = new Promise(resolve => { releaseSubmission = resolve; });
    const finishSubmission = await interceptResponse(page, '**/api/portal/crm/ticket', 'POST', async route => {
      submissions++;
      const response = await route.fetch(); const result = await response.json();
      assert.equal(response.status(), 200); assert.equal(result.code, 200); submittedId = result.data.ticketId;
      await gate; await route.abort('connectionfailed');
    });
    await composer.getByRole('button', { name: '提交工单', exact: true }).click();
    await context.waitFor(() => {
      assertRoutes();
      return submittedId;
    }, Number.isSafeInteger, '真实工单提交未在时限内返回已保存编号');
    check('保存中禁止再次提交、关闭及更改客户原始内容', await titleInput.isDisabled() && await descriptionInput.isDisabled()
      && await composer.getByRole('button', { name: '提交工单', exact: true }).isDisabled()
      && await composer.getByRole('button', { name: '返回列表（保留本页草稿）', exact: true }).isDisabled());
    await composer.getByRole('button', { name: '提交工单', exact: true }).evaluate(button => button.click());
    await page.setViewportSize({ width: 375, height: 900 });
    check('保存中电脑切到手机不卸载草稿或触发第二次提交', await titleInput.inputValue() === title && submissions === 1);
    releaseSubmission();
    await finishSubmission(); await composer.getByRole('alert').waitFor();
    check('实际保存响应丢失后保留并锁定原输入', await titleInput.inputValue() === title && await titleInput.isDisabled() && current(submittedId).description === description);
    await composer.getByRole('button', { name: '核对原提交结果', exact: true }).click();
    let progress = page.getByRole('dialog', { name: title, exact: true });
    await progress.getByText(description, { exact: true }).waitFor();
    check('客户只读核对恢复已保存工单且没有重复新建', submissions === 1 && current(submittedId).title === title && current(submittedId).ownerId == null);
    for (const width of [1440, 375, 320]) {
      await page.setViewportSize({ width, height: 1000 }); await layout(page, progress, width, '客户进度');
    }
    const fileAccess = page.waitForResponse(response => new URL(response.url()).pathname === '/api/portal/file/access');
    const downloadEvent = page.waitForEvent('download');
    await progress.getByRole('button', { name: `下载工单附件 ${fileName}`, exact: true }).click();
    const access = await (await fileAccess).json(); secrets.push(access.data.downloadTicket);
    const downloaded = await downloadEvent; const filename = path.join(directory, `h3-ticket-ui-download-${caseTag}.txt`); await downloaded.saveAs(filename);
    check('手机端真实工单附件下载逐字节一致', createHash('sha256').update(await fs.readFile(filename)).digest('hex') === firstFile.sha256);
    await progress.getByRole('button', { name: '关闭', exact: true }).click();
    await page.getByRole('textbox', { name: '搜索工单标题', exact: true }).fill(prefix);
    await page.getByRole('button', { name: '查询', exact: true }).click();
    await page.getByRole('heading', { name: title, level: 2, exact: true }).waitFor();
    for (const width of [1440, 375, 320]) await customerListLayout(page, width);
    const pagination = page.getByRole('navigation', { name: '工单分页', exact: true });
    const secondPage = page.waitForResponse(response => new URL(response.url()).pathname === '/api/portal/crm/ticket/list' && new URL(response.url()).searchParams.get('pageNum') === '2');
    await pagination.getByRole('button', { name: '下一页', exact: true }).click(); successful({ status: (await secondPage).status(), body: await (await secondPage).json() }, '手机真实翻到第二页');
    await page.getByText(/共 \d+ 张 · 第 2 页/).waitFor(); check('客户手机分页使用真实第二页响应', true);
    await admin.bringToFront(); await admin.goto(`${origin}/office/crm/tickets`, { waitUntil: 'domcontentloaded' });
    await admin.getByRole('textbox', { name: '搜索客户经营记录' }).fill(title);
    await admin.getByRole('button', { name: `门户处理 ${title}`, exact: true }).waitFor();
    for (const width of [1440, 375, 320]) await listLayout(admin, width);
    await admin.setViewportSize({ width: 1440, height: 1000 });
    let management = await openInternal(admin, title);
    await management.getByRole('textbox', { name: '查找接手人', exact: true }).fill(support.name);
    await management.getByRole('button', { name: '查找', exact: true }).click();
    await management.getByRole('radio', { name: new RegExp(support.name) }).check();
    await management.getByRole('button', { name: '返回工单列表', exact: true }).click();
    await admin.getByRole('dialog', { name: '离开门户工单处理？', exact: true }).getByRole('button', { name: '保留输入，继续处理', exact: true }).click();
    check('管理员取消关闭保留已选接手人', await management.getByRole('radio', { name: new RegExp(support.name) }).isChecked());
    for (const width of [1440, 375, 320]) { await admin.setViewportSize({ width, height: 1000 }); await layout(admin, management, width, '分派'); }
    let assignments = 0;
    const assignmentPath = `**/api/crm/ticket/${submittedId}/assign`;
    const finishAssignment = await interceptResponse(admin, assignmentPath, 'POST', async route => {
      assignments++; const response = await route.fetch(); assert.equal(response.status(), 200); await route.abort('connectionfailed');
    });
    await management.getByRole('button', { name: '确认分派', exact: true }).click();
    await finishAssignment(); await management.getByRole('alert').waitFor();
    await management.getByRole('button', { name: '核对最新结果（保留输入）', exact: true }).click();
    await management.getByText('保存结果尚未确认，已暂停再次保存；请先只读核对最新结果。', { exact: true }).waitFor({ state: 'hidden' });
    check('真实分派响应丢失后只读恢复，负责人只写入一次', assignments === 1 && current(submittedId).ownerId === support.id);
    await management.getByRole('button', { name: '返回工单列表', exact: true }).click();
    management = await openInternal(support.page, title);
    const solutionInput = management.getByRole('textbox', { name: '对外解决方案（最多10000字符）', exact: true });
    await solutionInput.fill(solution);
    for (const width of [1440, 375, 320]) {
      await support.page.setViewportSize({ width, height: 1000 });
      check(`接手人切换${width}px仍保留未发布方案`, await solutionInput.inputValue() === solution);
      await layout(support.page, management, width, '发布');
    }
    let publications = 0;
    const publicationPath = `**/api/crm/ticket/${submittedId}/portal-solution`;
    const finishPublication = await interceptResponse(support.page, publicationPath, 'PUT', async route => {
      publications++; const response = await route.fetch(); assert.equal(response.status(), 200); await route.abort('connectionfailed');
    });
    await management.getByRole('button', { name: '发布给客户', exact: true }).click();
    await finishPublication(); await management.getByRole('alert').waitFor();
    check('真实发布响应丢失仍保留原方案且暂停重复发布', await solutionInput.inputValue() === solution && await solutionInput.isDisabled());
    await management.getByRole('button', { name: '核对最新结果（保留输入）', exact: true }).click();
    await solutionInput.waitFor();
    await context.waitFor(() => solutionInput.isEnabled(), Boolean, '只读核对未恢复已保存方案');
    check('真实发布只读核对恢复已保存结果，不重复保存', publications === 1 && current(submittedId).portalSolution === solution);
    const preserved = `未提交草稿 ${caseTag}`;
    await solutionInput.fill(preserved); successful(await publish(submittedId, `并发版本 ${caseTag}`, support.page), '通过真实HTTP制造并发版本');
    await management.getByRole('button', { name: '发布给客户', exact: true }).click();
    await management.getByRole('alert').waitFor();
    check('旧版本发布失败保留本地草稿', await solutionInput.inputValue() === preserved);
    await management.getByRole('button', { name: '核对最新结果（保留输入）', exact: true }).click();
    await management.getByRole('button', { name: '已核对，保留输入并采用最新版本', exact: true }).click();
    check('明确采用最新版本仍保留未提交方案', await solutionInput.inputValue() === preserved && await solutionInput.isEnabled());
    await management.getByRole('button', { name: '发布给客户', exact: true }).click();
    await context.waitFor(() => current(submittedId).portalSolution, value => value === preserved, '最新版本草稿未实际发布');
    await page.bringToFront(); await reserve(browserToken);
    await page.getByRole('textbox', { name: '搜索工单标题', exact: true }).fill(title); await page.getByRole('button', { name: '查询', exact: true }).click();
    await page.getByRole('button', { name: `查看工单 ${title}`, exact: true }).click(); progress = page.getByRole('dialog', { name: title, exact: true });
    await progress.getByText(preserved, { exact: true }).waitFor(); check('客户页面读取真实明确发布方案', true);
    for (const width of [1440, 375, 320]) {
      await page.setViewportSize({ width, height: 1000 });
      await progress.getByText(preserved, { exact: true }).scrollIntoViewIfNeeded();
      await layout(page, progress, width, '已发布客户进度');
    }
    successful(await publish(submittedId, null, support.page), '真实撤回UI工单方案');
    await progress.getByRole('button', { name: '核对最新进度', exact: true }).click();
    await progress.getByText('处理人尚未发布解决方案。', { exact: true }).waitFor();
    check('撤回核对后清空客户已展示方案', await progress.getByText(preserved, { exact: true }).count() === 0);
    const failedListRoute = route => route.abort('connectionfailed');
    await admin.bringToFront(); await admin.route('**/api/crm/ticket/list?**', failedListRoute);
    await admin.getByRole('textbox', { name: '搜索客户经营记录' }).fill(`${prefix}_network_unavailable`);
    await admin.getByRole('alert').filter({ hasText: '当前筛选结果未加载' }).waitFor();
    check('列表断网明确报错，不把旧筛选结果展示为新结果', await admin.getByRole('button', { name: `门户处理 ${title}`, exact: true }).count() === 0);
    await admin.unroute('**/api/crm/ticket/list?**', failedListRoute);
    await admin.getByRole('textbox', { name: '搜索客户经营记录' }).fill(title);
    await admin.getByRole('button', { name: `门户处理 ${title}`, exact: true }).waitFor();
    check('全部客户工单页面没有浏览器脚本异常', failures.length === 0);
    evidence.desktop = true; evidence.mobile = true; evidence.lostResponse = true;
    evidence.assignmentView = true; evidence.publicationView = true; evidence.publishedProgressView = true; evidence.customerListView = true;
    console.log(`H3_PORTAL_TICKET_UI: widths=1440,375,320; uploads=${uploads}; submissions=${submissions}; assignments=${assignments}; publications=${publications}; lost_real_responses=4; browser_errors=${failures.length}; screenshots=${snapshots.length}; api_doubles=0; production_modified=false`);
  } catch (error) {
    for (const [role, target] of [['portal', page], ['admin', admin], ['support', support.page]]) {
      try {
        await target.screenshot({ path: path.join(directory, `h3-ticket-ui-failure-${role}-${caseTag}.png`), fullPage: true, timeout: 5000 });
        console.log(`H3_PORTAL_TICKET_UI_FAILURE: role=${role}; path=${new URL(target.url()).pathname}; alerts=${JSON.stringify(await target.getByRole('alert').allTextContents())}`);
      } catch (diagnosticError) { console.log(`H3_PORTAL_TICKET_UI_FAILURE: role=${role}; diagnostic_error=${diagnosticError.name}`); }
    }
    throw error;
  } finally { releaseSubmission?.(); await client.close(); }
}
