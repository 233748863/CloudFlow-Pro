import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { waitForShellLayout } from './portal-checks/wait-shell-layout.mjs';

export async function verifyF3ProjectInterface(ctx) {
  const { admin, manager, employee, browser, origin, api, successful, directory, caseTag, marker, check,
    get, taskList, waitFor, remember, evidence, primary, groupTask, effortTask, hourTypes,
    historicalProject, historicalTask, historicalPeriod, sheet } = ctx;
  const mobileContexts = [];
  const observations = [];
  const observe = (name, passed, actual) => {
    observations.push({ name, passed: !!passed, actual });
    check(name, !!passed);
  };
  const shot = async (page, name) => {
    await page.evaluate(() => document.fonts.ready);
    await waitForShellLayout(page);
    await page.screenshot({ path: path.join(directory, `f3-${name}-${caseTag}.png`), fullPage: false });
  };
  const navigate = async (page, route, userId) => {
    await page.goto(origin + route, { waitUntil: 'domcontentloaded' });
    const identity = successful(await api(page, '/auth/info'), 'F3页面真实会话');
    observe('F3 整页跳转后保留真实身份与租户', String(identity.user.userId) === String(userId)
      && String(identity.user.tenantId) === '100000');
    const token = await page.evaluate(async () => (await import('/src/utils/authStorage.ts')).getAuthToken());
    if (token) await remember(token.replace(/^Bearer /, ''));
    const agreement = page.getByRole('button', { name: '同意并继续', exact: true });
    if (await agreement.isVisible()) await agreement.click();
  };
  const mobilePage = async source => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true,
      hasTouch: true, deviceScaleFactor: 1, serviceWorkers: 'block', storageState: await source.context().storageState(),
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1' });
    mobileContexts.push(context);
    await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    return context.newPage();
  };
  const openProject = async (page, userId) => {
    await navigate(page, '/office/project', userId);
    await page.getByPlaceholder('项目名称 / 客户关键字', { exact: true }).fill(primary.projectName);
    const row = page.getByRole('row').filter({ hasText: primary.projectName });
    await row.getByRole('button', { name: '查看详情', exact: true }).click({ timeout: 60000 });
    const details = page.getByRole('dialog', { name: primary.projectName, exact: true });
    await details.getByRole('tab', { name: '概览', exact: true }).waitFor();
    return details;
  };
  const shiftDate = (value, days) => {
    const date = new Date(value.slice(0, 10) + 'T12:00:00Z');
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
  };
  const assertFits = async (page, locator, label) => {
    const bounds = await locator.evaluate(element => {
      const rectangle = element.getBoundingClientRect();
      return { left: rectangle.left, right: rectangle.right, width: innerWidth,
        scrollWidth: element.scrollWidth, clientWidth: element.clientWidth };
    });
    observe(label, bounds.left >= -1 && bounds.right <= bounds.width + 1
      && bounds.scrollWidth <= bounds.clientWidth + 1, bounds);
  };
  const assertReadable = async (page, locator, label) => {
    await locator.scrollIntoViewIfNeeded();
    await locator.evaluate(element => element.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' }));
    const actual = await locator.evaluate(element => {
      const bounds = element.getBoundingClientRect();
      const vertical = Math.max(bounds.top + 2, Math.min(bounds.bottom - 2, bounds.top + bounds.height / 2));
      const points = [bounds.left + 2, bounds.right - 2].map(horizontal => document.elementFromPoint(horizontal, vertical));
      return { left: bounds.left, right: bounds.right, top: bounds.top, bottom: bounds.bottom,
        width: bounds.width, height: bounds.height, viewportWidth: innerWidth, viewportHeight: innerHeight,
        unobscured: points.every(point => point && element.contains(point)) };
    });
    observe(label, await locator.isVisible() && actual.width > 0 && actual.height > 0
      && actual.left >= 0 && actual.right <= actual.viewportWidth + 1 && actual.top >= 0
      && actual.bottom <= actual.viewportHeight + 1 && actual.unobscured, actual);
  };
  const moveTree = async (page, details, screen, destinationId, lostResponse = false) => {
    const previous = await taskList(primary.projectId);
    const expectedChildren = previous.filter(task => task.parentTaskId === groupTask.taskId).map(task => task.taskId).sort();
    const endpoint = '**/api/oa/project/wbs/tree?*';
    let intercepted = 0;
    let committed = false;
    const interrupt = async route => {
      if (route.request().method() !== 'PUT') return route.fallback();
      intercepted++;
      const response = await route.fetch();
      committed = response.status() === 200 && (await response.json()).code === 200;
      await route.abort('connectionreset');
    };
    if (lostResponse) await page.route(endpoint, interrupt);
    try {
      if (screen === 'desktop') {
        const handle = details.getByRole('button', { name: '拖动任务：' + groupTask.subject, exact: true });
        await handle.scrollIntoViewIfNeeded();
        const source = await handle.boundingBox();
        assert.ok(source);
        await page.mouse.move(source.x + source.width / 2, source.y + source.height / 2);
        await page.mouse.down();
        await page.mouse.move(source.x + source.width / 2, source.y + source.height / 2 + 12, { steps: 3 });
        const drop = details.locator(`[data-drop-position="inside"][data-drop-task="${destinationId}"]`);
        await drop.scrollIntoViewIfNeeded();
        const target = await drop.boundingBox();
        assert.ok(target);
        await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 15 });
        await shot(page, 'tree-drag-' + screen);
        await page.mouse.up();
      } else {
        await details.getByRole('button', { name: '移动任务：' + groupTask.subject, exact: true }).click();
        const move = page.getByRole('dialog', { name: '移动任务', exact: true });
        await move.getByLabel('所属分组', { exact: true }).selectOption(String(destinationId));
        await move.getByLabel('组内位置', { exact: true }).selectOption('END');
        await shot(page, 'tree-move-' + screen);
        await move.getByRole('button', { name: '确认移动', exact: true }).click();
        await move.waitFor({ state: 'hidden' });
      }
      const current = await waitFor(() => taskList(primary.projectId), tasks =>
        Number(tasks.find(task => task.taskId === groupTask.taskId)?.parentTaskId || 0) === destinationId,
      '页面移动未保存到真实任务树');
      await page.getByText('任务层级与顺序已保存', { exact: true }).waitFor({ timeout: 60000 });
      observe('AC-12 ' + screen + '实际移动保留完整子树、任务数和已审批工时', current.length === previous.length
        && JSON.stringify(current.filter(task => task.parentTaskId === groupTask.taskId).map(task => task.taskId).sort()) === JSON.stringify(expectedChildren)
        && Number(current.find(task => task.taskId === effortTask.taskId).actualHours) === 1);
      const row = details.locator(`[data-task-id="${groupTask.taskId}"]`);
      observe('AC-12 ' + screen + '页面显示真实保存后的任务层级', Number(await row.getAttribute('data-task-depth')) === (destinationId ? 2 : 1));
      await row.scrollIntoViewIfNeeded();
      await assertFits(page, row.locator('.project-task-tree__row'), 'AC-12 ' + screen + '任务行完整位于视口内');
      await shot(page, 'tree-saved-' + screen);
      if (lostResponse) {
        observe('AC-12 手机保存响应丢失后重读确认且只提交一次', committed && intercepted === 1);
        evidence.lostResponse = true;
      }
    } finally { if (lostResponse) await page.unroute(endpoint, interrupt); }
  };
  let mobileAdmin;
  let mobileManager;
  let mobileEmployee;
  try {
    mobileAdmin = await mobilePage(admin);
    mobileManager = await mobilePage(manager);
    mobileEmployee = await mobilePage(employee);
    const targetGroup = (await taskList(primary.projectId)).find(task => task.subject === marker + '_目标分组');
    assert.ok(targetGroup);
    for (const [screen, width, adminPage, managerPage, employeePage] of [
      ['desktop', 1440, admin, manager, employee], ['mobile', 390, mobileAdmin, mobileManager, mobileEmployee],
      ['mobileNarrow', 320, mobileAdmin, mobileManager, mobileEmployee],
    ]) {
      for (const page of [adminPage, managerPage, employeePage]) await page.setViewportSize({ width, height: screen === 'desktop' ? 1000 : 844 });
      const details = await openProject(adminPage, 990000701);
      await details.getByRole('tab', { name: 'WBS', exact: true }).click();
      await details.getByRole('list', { name: '项目任务列表', exact: true }).waitFor();
      await moveTree(adminPage, details, screen, screen === 'mobile' ? 0 : targetGroup.taskId, screen === 'mobile');

      const dependencyRow = details.locator(`[data-task-id="${ctx.dependencySuccessor.taskId}"]`);
      await dependencyRow.getByRole('button', { name: '编辑 WBS', exact: true }).click();
      const taskEditor = adminPage.getByRole('dialog', { name: '编辑 WBS', exact: true });
      await taskEditor.getByLabel('进度（0–100%）', { exact: true }).fill(screen === 'desktop' ? '30' : screen === 'mobile' ? '31' : '32');
      const taskSaving = adminPage.waitForResponse(response => new URL(response.url()).pathname === '/api/oa/project/wbs'
        && response.request().method() === 'PUT');
      await taskEditor.getByRole('button', { name: '保存', exact: true }).click();
      const taskResponse = await taskSaving;
      const taskPayload = await taskResponse.json();
      observe('AC-15 ' + screen + '真实页面保存返回前置任务提醒', taskResponse.status() === 200 && taskPayload.code === 200
        && taskResponse.headers()['x-oa-rule-warning'] === 'true' && taskPayload.msg.includes(ctx.dependencyPredecessor.subject));
      await taskEditor.waitFor({ state: 'hidden' });
      const warning = adminPage.locator('.cf-toast--warning').filter({ hasText: ctx.dependencyPredecessor.subject }).last();
      await warning.waitFor();
      await assertFits(adminPage, warning, 'AC-15 ' + screen + '前置任务提醒完整显示在页面内');
      await shot(adminPage, 'dependency-warning-' + screen);

      await details.getByRole('tab', { name: '甘特图', exact: true }).click();
      await details.getByRole('img', { name: '任务依赖连线', exact: true }).waitFor();
      const ganttDetail = await get('/oa/project/' + primary.projectId + '/detail');
      const scheduledDates = [
        ...ganttDetail.wbsTasks.filter(task => !task.isMilestoneFlag && task.plannedStart && task.plannedEnd)
          .flatMap(task => [task.plannedStart, task.plannedEnd, task.baselineStart, task.baselineEnd]),
        ...ganttDetail.milestones.filter(task => task.plannedEnd)
          .flatMap(task => [task.plannedEnd, task.baselineEnd]),
      ].filter(Boolean).map(value => value.slice(0, 10)).sort();
      const headerDates = await details.locator('[data-gantt-date]').evaluateAll(elements => elements.map(element => element.dataset.ganttDate));
      observe('AC-20 ' + screen + '甘特日期表头包含实际首末日期且逐日连续', headerDates[0] === scheduledDates[0]
        && headerDates.at(-1) === scheduledDates.at(-1)
        && headerDates.every((value, index) => value === shiftDate(scheduledDates[0], index)), headerDates);
      const links = await details.locator('svg [data-dependency-id]').evaluateAll(elements => elements.map(element => ({
        id: element.getAttribute('data-dependency-id'), predecessor: element.getAttribute('data-predecessor'),
        successor: element.getAttribute('data-successor'), type: element.getAttribute('data-dependency-type'),
        path: element.getAttribute('d'), marker: element.getAttribute('marker-end'), title: element.textContent,
      })));
      observe('AC-20 ' + screen + '甘特依赖连线与真实前后任务、类型一致', ctx.dependenciesForGantt.every(dependency =>
        links.some(link => link.id === String(dependency.dependencyId) && link.predecessor === String(dependency.predecessorTaskId)
          && link.successor === String(dependency.successorTaskId) && link.type === dependency.dependencyType && link.marker
          && !/NaN|undefined/.test(link.path))), links);
      if (screen === 'desktop') {
        const previousTask = (await taskList(primary.projectId)).find(task => task.taskId === effortTask.taskId);
        const bar = details.locator(`[data-gantt-task="${effortTask.taskId}"]`);
        const dragOneDay = async () => {
          await bar.scrollIntoViewIfNeeded();
          const bounds = await bar.boundingBox();
          assert.ok(bounds);
          await adminPage.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
          await adminPage.mouse.down();
          await adminPage.mouse.move(bounds.x + bounds.width / 2 + 40, bounds.y + bounds.height / 2, { steps: 12 });
          await adminPage.mouse.up();
        };
        const savedResponse = adminPage.waitForResponse(response => new URL(response.url()).pathname === '/api/oa/project/wbs'
          && response.request().method() === 'PUT');
        await dragOneDay();
        const ganttResponse = await savedResponse;
        const ganttCommand = ganttResponse.request().postDataJSON();
        observe('AC-20 实际甘特拖动请求起止各顺延一天且保存成功', ganttResponse.status() === 200
          && (await ganttResponse.json()).code === 200
          && ganttCommand.plannedStart.slice(0, 10) === shiftDate(previousTask.plannedStart, 1)
          && ganttCommand.plannedEnd.slice(0, 10) === shiftDate(previousTask.plannedEnd, 1));
        const updatedTask = await waitFor(() => taskList(primary.projectId), tasks =>
          tasks.find(task => task.taskId === effortTask.taskId)?.plannedStart?.slice(0, 10) === shiftDate(previousTask.plannedStart, 1),
        '真实甘特拖动未保存一天改期');
        observe('AC-20 实际甘特拖动一天同时更新起止且保持工时', updatedTask.find(task => task.taskId === effortTask.taskId).plannedEnd.slice(0, 10)
          === shiftDate(previousTask.plannedEnd, 1) && Number(updatedTask.find(task => task.taskId === effortTask.taskId).actualHours) === 1);
        const savedTask = updatedTask.find(task => task.taskId === effortTask.taskId);
        const taskRow = details.locator('.admin-project-gantt-row').filter({ has: adminPage.locator(`[data-gantt-task="${effortTask.taskId}"]`) });
        await taskRow.getByText(savedTask.plannedStart.slice(0, 10) + ' ~ ' + savedTask.plannedEnd.slice(0, 10), { exact: true }).waitFor();
        let rejectedRequests = 0;
        const target = url => url.pathname === '/api/oa/project/wbs';
        const interrupt = async route => {
          if (route.request().method() !== 'PUT') return route.fallback();
          rejectedRequests++;
          await route.abort('connectionreset');
        };
        await adminPage.route(target, interrupt);
        try {
          await dragOneDay();
          await adminPage.locator('.cf-toast--error').last().waitFor();
          const afterFailure = (await taskList(primary.projectId)).find(task => task.taskId === effortTask.taskId);
          observe('AC-20 甘特保存请求失败后显示错误、恢复原排期且不重复提交', rejectedRequests === 1
            && JSON.stringify(afterFailure) === JSON.stringify(savedTask)
            && (await taskRow.innerText()).includes(savedTask.plannedStart.slice(0, 10) + ' ~ ' + savedTask.plannedEnd.slice(0, 10)));
          await shot(adminPage, 'gantt-save-failure-desktop');
        } finally { await adminPage.unroute(target, interrupt); }
      }
      await shot(adminPage, 'gantt-' + screen);
      if (screen !== 'desktop') {
        const timeline = details.getByLabel('项目排期，可横向滚动', { exact: true });
        await timeline.evaluate(element => { element.scrollLeft = 260; });
        const timelinePosition = await timeline.evaluate(element => ({ left: element.scrollLeft,
          clientWidth: element.clientWidth, scrollWidth: element.scrollWidth }));
        observe('AC-20 ' + screen + '甘特时间轴可横向滚动到日期和彩条', timelinePosition.left >= 259
          && timelinePosition.scrollWidth > timelinePosition.clientWidth, timelinePosition);
        await assertReadable(adminPage, details.locator('[data-gantt-date]').first(), 'AC-20 ' + screen + '首日日期滚动后完整可见');
        await shot(adminPage, 'gantt-timeline-' + screen);
        await timeline.evaluate(element => { element.scrollLeft = 0; });
      }
      const dependencyDescription = details.locator(`[data-dependency-description="${ctx.dependenciesForGantt[0].dependencyId}"]`);
      await dependencyDescription.scrollIntoViewIfNeeded();
      await assertFits(adminPage, dependencyDescription, 'AC-20 ' + screen + '依赖名称与间隔完整换行');
      await shot(adminPage, 'gantt-dependencies-' + screen);

      await details.getByRole('tab', { name: '成本', exact: true }).click();
      for (const [label, expected] of [['总成本', '¥140.06'], ['人力成本', '¥100.01'], ['采购成本', '¥30.03'],
        ['其他成本', '¥10.02'], ['可计费额', '¥150.03'], ['已开票金额', '¥123.45'], ['毛利', '¥9.97']]) {
        const metric = details.locator('.admin-project-detail-metric').filter({ has: adminPage.getByText(label, { exact: true }) });
        observe('AC-7/8/9 ' + screen + '成本卡片与真实金额一致：' + label, (await metric.locator('strong').textContent()).trim() === expected);
      }
      await details.getByText('总成本', { exact: true }).scrollIntoViewIfNeeded();
      await shot(adminPage, 'costs-' + screen);
      await details.getByText('毛利率', { exact: true }).scrollIntoViewIfNeeded();
      await shot(adminPage, 'billing-margin-' + screen);

      await navigate(managerPage, '/admin/reports/projects', 990000702);
      await managerPage.getByRole('heading', { name: '项目预算与成本', exact: true }).waitFor({ timeout: 60000 });
      const reportSection = managerPage.locator('section.oa-ops-section').filter({ has: managerPage.getByRole('heading', { name: '项目预算与成本', exact: true }) });
      const reportRow = screen === 'desktop' ? reportSection.getByRole('row').filter({ hasText: primary.projectName })
        : reportSection.locator('[data-report-record="costs"]').filter({ hasText: primary.projectName });
      await reportRow.waitFor();
      const expectedReport = [['projectName', primary.projectName], ['ownerName', 'g_import_other'],
        ['budgetAmount', '2,000.11'], ['actualCostAmount', '140.06'], ['laborCostAmount', '100.01'],
        ['purchaseCostAmount', '30.03'], ['otherCostAmount', '10.02'], ['billableAmount', '150.03'],
        ['billedAmount', '123.45'], ['grossMargin', '9.97'], ['grossMarginRate', '6.65%'], ['actualHours', '1']];
      for (const [index, [key, expected]] of expectedReport.entries()) {
        const field = screen === 'desktop' ? reportRow.getByRole('cell').nth(index) : reportRow.locator(`[data-report-value="${key}"]`);
        observe('AC-21 ' + screen + '经理报表字段与实际业务一致：' + key, (await field.innerText()).trim() === expected);
        await assertReadable(managerPage, field, 'AC-21 ' + screen + '报表字段完整可见：' + key);
      }
      const reportFields = screen === 'desktop' ? reportRow.getByRole('cell') : reportRow.locator('[data-report-value]');
      await reportFields.first().scrollIntoViewIfNeeded();
      await shot(managerPage, 'cost-report-' + screen);
      await reportFields.last().scrollIntoViewIfNeeded();
      await shot(managerPage, 'cost-report-totals-' + screen);
      const laborSection = managerPage.locator('section.oa-ops-section').filter({ has: managerPage.getByRole('heading', { name: '项目与活动工时', exact: true }) });
      const laborRow = (screen === 'desktop' ? laborSection.getByRole('row') : laborSection.locator('[data-report-record="labor"]'))
        .filter({ hasText: primary.projectName }).filter({ hasText: hourTypes.defaultType.typeName }).first();
      await laborRow.waitFor();
      const laborFields = screen === 'desktop' ? laborRow.getByRole('cell') : laborRow.locator('[data-report-value]');
      observe('AC-21 ' + screen + '人力投入包含项目、员工、活动及两类工时', await laborFields.count() === 5);
      for (const [index, key] of ['projectName', 'employeeName', 'activityName', 'hours', 'billableHours'].entries()) {
        await assertReadable(managerPage, laborFields.nth(index), 'AC-21 ' + screen + '人力投入字段完整可见：' + key);
      }
      await shot(managerPage, 'effort-report-' + screen);

      const privateDetails = await openProject(employeePage, 990000707);
      observe('AC-11 ' + screen + '员工项目详情隐藏成本标签并显示权限说明', await privateDetails.getByRole('tab', { name: '成本', exact: true }).count() === 0
        && (await privateDetails.innerText()).includes('仅管理者可见'));
      await privateDetails.getByText('已发生成本', { exact: true }).scrollIntoViewIfNeeded();
      await shot(employeePage, 'employee-cost-privacy-' + screen);
      await navigate(employeePage, '/office/project/timesheets', 990000707);
      await employeePage.getByRole('button', { name: '填写本人工时', exact: true }).click({ timeout: 60000 });
      const editor = employeePage.getByRole('dialog', { name: '工时周矩阵', exact: true });
      await editor.getByRole('button', { name: '添加项目活动行', exact: true }).click();
      const projectSelect = editor.getByLabel('工时项目', { exact: true });
      await waitFor(() => projectSelect.locator('option').allTextContents(), options => options.some(text => text === primary.projectName), '当前周项目候选未加载');
      observe('AC-2 ' + screen + '当前周不显示已退出的历史项目', !(await projectSelect.locator('option').allTextContents()).includes(historicalProject.projectName));
      await editor.getByLabel('周期开始（周一）', { exact: true }).fill(historicalPeriod.startDate);
      const selectedStart = await editor.getByLabel('周期开始（周一）', { exact: true }).inputValue();
      observe('AC-2 ' + screen + '所选期间自动归整为周一至周日', new Date(selectedStart + 'T12:00:00Z').getUTCDay() === 1
        && (await editor.innerText()).includes(shiftDate(selectedStart, 6)));
      await waitFor(() => projectSelect.locator('option').allTextContents(), options => options.includes(historicalProject.projectName), '原参与周项目候选未加载');
      await projectSelect.selectOption(String(historicalProject.projectId));
      const taskSelect = editor.getByLabel('项目任务', { exact: true });
      await waitFor(() => taskSelect.locator('option').allTextContents(), options => options.includes(historicalTask.subject), '历史参与任务候选未加载');
      await taskSelect.selectOption(String(historicalTask.taskId));
      await editor.getByLabel('工时活动', { exact: true }).selectOption(String(hourTypes.defaultType.typeId));
      await editor.getByLabel('工作内容', { exact: true }).fill(marker + '_页面历史补报_' + screen);
      for (let day = 0; day < 7; day++) {
        const date = shiftDate(selectedStart, day);
        const dayInput = editor.getByLabel(date + ' 工时', { exact: true });
        await assertReadable(employeePage, dayInput, 'AC-2 ' + screen + '七日输入完整可操作：' + date);
      }
      const hours = editor.getByLabel(historicalPeriod.startDate + ' 工时', { exact: true });
      await hours.fill('0.25');
      await hours.scrollIntoViewIfNeeded();
      await assertReadable(employeePage, hours, 'AC-2 ' + screen + '实际补报日期输入完整可操作');
      await shot(employeePage, 'historical-week-entry-' + screen);
      const saving = employeePage.waitForResponse(response => new URL(response.url()).pathname === '/api/oa/timesheets' && response.request().method() === 'POST');
      await editor.getByRole('button', { name: '保存并计算', exact: true }).click();
      const response = await saving;
      const payload = await response.json();
      assert.equal(response.status(), 200); assert.equal(payload.code, 200);
      const saved = await sheet(payload.data);
      observe('AC-2/19 ' + screen + '真实页面补报保存原工作日期、项目、任务和本人身份', saved.details.length === 1
        && saved.details[0].workDate === historicalPeriod.startDate && saved.details[0].projectId === historicalProject.projectId
        && saved.details[0].taskId === historicalTask.taskId && Number(saved.details[0].hours) === 0.25
        && String(saved.timesheet.employeeId) === '990000707' && saved.timesheet.startDate === selectedStart
        && saved.timesheet.endDate === shiftDate(selectedStart, 6));
      observe('AC-11 ' + screen + '员工工时页面不显示内部成本金额', await editor.getByText('成本金额（元）', { exact: true }).count() === 0);
      await editor.getByText('计费金额（元）', { exact: true }).scrollIntoViewIfNeeded();
      await shot(employeePage, 'historical-week-saved-' + screen);
      await editor.getByRole('button', { name: '关闭', exact: true }).click();
      observe('F3 ' + screen + '项目工时页无根容器横向越界', await employeePage.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      evidence[screen] = true;
    }
    evidence.gantt = true;
  } catch (failure) {
    await shot(admin, 'admin-failure').catch(() => {});
    if (mobileAdmin) await shot(mobileAdmin, 'mobile-failure').catch(() => {});
    if (mobileEmployee) await shot(mobileEmployee, 'employee-failure').catch(() => {});
    throw failure;
  } finally {
    await fs.writeFile(path.join(directory, `f3-ui-observations-${caseTag}.json`), JSON.stringify(observations, null, 2), { flag: 'wx' });
    for (const context of mobileContexts) await context.close();
  }
}
