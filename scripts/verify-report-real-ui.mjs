import assert from 'node:assert/strict';
import path from 'node:path';

export async function verifyReportRealUi(context) {
  const { actor, readonlyActor, database, check, directory, caseTag, evidence, owner, share, rememberChart, rememberDashboard, fillExpenseDate } = context;
  const origin = new URL(actor.url()).origin;
  const root = '/auth/system/report';
  const workspace = actor.locator('.report-workspace').first();
  const frames = [{ name: 'desktop', width: 1440, height: 1000 }, { name: 'mobile', width: 375, height: 1000 }];
  const errors = [];
  const onError = error => errors.push(error.message);
  actor.on('pageerror', onError);
  readonlyActor.on('pageerror', onError);
  actor.setDefaultNavigationTimeout(120000);
  readonlyActor.setDefaultNavigationTimeout(120000);
  const literal = value => `CONVERT(UNHEX('${Buffer.from(String(value)).toString('hex')}') USING utf8mb4)`;
  const select = async (label, option) => {
    await actor.locator(`button[aria-label="${label}"][aria-haspopup="listbox"]`).click();
    await actor.getByRole('option', { name: option, exact: true }).click();
  };
  const bounded = async promise => {
    let timer;
    try { return await Promise.race([promise, new Promise((resolve, reject) => { timer = setTimeout(() => reject(new Error('Real report response did not arrive')), 30000); })]); }
    finally { clearTimeout(timer); }
  };
  const layout = async label => {
    const dimensions = await workspace.evaluate(element => ({ viewport: innerWidth, document: document.documentElement.scrollWidth,
      left: element.getBoundingClientRect().left, right: element.getBoundingClientRect().right,
      controls: [...element.querySelectorAll('button')].filter(button => button.getClientRects().length > 0)
        .map(button => ({ label: button.getAttribute('aria-label') ?? button.textContent, width: button.getBoundingClientRect().width, height: button.getBoundingClientRect().height })) }));
    console.log(`REPORT_REAL_LAYOUT ${JSON.stringify({ label, ...dimensions })}`);
    check(`${label}真实应用外框无横向溢出且报表按钮至少44像素`, dimensions.document <= dimensions.viewport + 1 && dimensions.left >= 0
      && dimensions.right <= dimensions.viewport + 1 && dimensions.controls.length > 0 && dimensions.controls.every(button => button.width >= 44 && button.height >= 44));
  };
  const arrive = async (kind, id) => {
    const entry = kind === 'chart' ? 'report-charts' : 'report-dashboards';
    await actor.goto(`${origin}/workspace/${entry}${id ? `?id=${id}` : ''}`, { waitUntil: 'domcontentloaded' });
    await workspace.getByRole('button', { name: kind === 'chart' ? '新建图表' : '新建仪表盘', exact: true }).waitFor({ state: 'visible', timeout: 30000 });
    await workspace.getByRole('button', { name: '刷新', exact: true }).waitFor({ state: 'visible' });
  };
  const save = async (kind, name, lose) => {
    const action = kind === 'chart' ? '保存定义' : '保存布局';
    const identifier = kind === 'chart' ? 'chart_id' : 'dashboard_id';
    const remember = kind === 'chart' ? rememberChart : rememberDashboard;
    const pattern = `**/api${root}/${kind}`;
    let writes = 0;
    let id;
    let release;
    let received;
    let rejected;
    const ready = new Promise((resolve, reject) => { received = resolve; rejected = reject; });
    const held = new Promise(resolve => { release = resolve; });
    const intercept = async intercepted => {
      if (intercepted.request().method() !== 'POST') return intercepted.continue();
      try {
        writes++;
        const response = await intercepted.fetch();
        const body = await response.json();
        assert.equal(response.status(), 200, `Real ${kind} UI save must succeed`);
        assert.equal(body.code, 200);
        id = String(body.data); assert.match(id, /^[1-9]\d*$/); remember(id);
        received();
        await held;
        if (lose) await intercepted.abort('connectionfailed'); else await intercepted.fulfill({ response });
      } catch (error) { rejected(error); await intercepted.abort().catch(() => {}); }
    };
    await actor.route(pattern, intercept);
    try {
      await workspace.getByRole('button', { name: action, exact: true }).click();
      await bounded(ready);
      check(`${name}真实保存响应等待期间禁止重复提交`, await workspace.getByRole('button', { name: action, exact: true }).isDisabled());
      await workspace.getByRole('button', { name: action, exact: true }).evaluate(button => { button.click(); button.click(); });
      check(`${name}多次点击只写入一条本人定义`, writes === 1
        && database(`SELECT COUNT(*) FROM sys_report_${kind} WHERE tenant_id=${owner.tenantId} AND owner_id=${owner.userId} AND ${kind}_name=${literal(name)};`) === '1');
      release();
      if (lose) {
        await workspace.getByText(/请刷新核对实际状态后再操作/).waitFor();
        check(`${name}丢失已成功响应后阻止再次保存`, await workspace.getByRole('button', { name: action, exact: true }).isDisabled()
          && database(`SELECT version FROM sys_report_${kind} WHERE tenant_id=${owner.tenantId} AND ${identifier}=${id};`) === '0');
      } else {
        await workspace.getByText(kind === 'chart' ? '编辑本人图表' : '编辑本人仪表盘', { exact: true }).waitFor();
        check(`${name}保存后重读真实定义`, new URL(actor.url()).searchParams.get('id') === id);
      }
    } finally { release(); await actor.unroute(pattern, intercept); }
    if (lose) {
      await workspace.getByRole('button', { name: '刷新', exact: true }).click();
      await workspace.getByRole('button', { name: new RegExp(`^${name}`) }).waitFor();
      check(`${name}刷新核实已入库记录并放弃状态不明草稿`, await workspace.getByLabel(kind === 'chart' ? '图表名称' : '仪表盘名称', { exact: true }).count() === 0);
    }
    return id;
  };
  const query = async (page, dashboard = false, empty = false) => {
    const panel = page.locator('.report-workspace').first();
    const result = page.waitForResponse(response => new URL(response.url()).pathname === `/api${root}/dataset/CRM_FUNNEL/query` && response.request().method() === 'POST');
    await panel.getByRole('button', { name: dashboard ? '查询全部' : '运行查询', exact: true }).click();
    const response = await result;
    assert.equal(response.status(), 200);
    assert.equal(response.headers()['cache-control'], 'no-store');
    const body = await response.json(); assert.equal(body.code, 200);
    await panel.getByRole('button', { name: '查询中…', exact: true }).waitFor({ state: 'hidden' });
    if (empty) {
      check('共享页面实际查询仅返回查看者的空业务范围', body.data.rows.length === 0 && await panel.getByText('当前权限与筛选范围内暂无数据。', { exact: true }).isVisible());
    } else {
      check('真实页面金额保留100.10且只含本人记录', body.data.rows.length === 1 && body.data.rows[0].measure1 === '100.10'
        && await panel.locator('.report-data-table tbody tr').count() === 1 && (await panel.locator('.report-data-table').innerText()).includes('100.10'));
    }
  };
  const queryExpense = async filled => {
    const responsePromise = actor.waitForResponse(response => new URL(response.url()).pathname === `/api${root}/dataset/OA_EXPENSE/query` && response.request().method() === 'POST');
    await workspace.getByRole('button', { name: '运行查询', exact: true }).click();
    const response = await responsePromise; assert.equal(response.status(), 200);
    const body = await response.json(); assert.equal(body.code, 200);
    await workspace.getByRole('button', { name: '查询中…', exact: true }).waitFor({ state: 'hidden' });
    const missing = workspace.getByRole('region', { name: '缺费用日期', exact: true }); await missing.waitFor();
    check(filled ? '真实页面补齐后日期金额150.60、缺日期单数归零' : '真实页面日期金额100.10与缺日期50.50独立展示',
      body.data.missingDates.claimCount === (filled ? '0' : '1') && (await missing.locator('dd').first().innerText()) === (filled ? '0' : '1')
      && (await workspace.locator('.report-data-table').innerText()).includes(filled ? '150.60' : '100.10')
      && !(await workspace.locator('.report-data-table').innerText()).includes('50.50')
      && (filled || (await missing.innerText()).includes('50.50')));
  };
  try {
    for (const frame of frames) {
      await actor.setViewportSize({ width: frame.width, height: frame.height });
      const chartName = `真实图表-${frame.name}-${caseTag}`;
      await arrive('chart');
      await workspace.getByRole('button', { name: '新建图表', exact: true }).click();
      await workspace.getByLabel('图表名称', { exact: true }).fill(chartName);
      await select('统计来源', '销售漏斗'); await select('图表类型', '数据表'); await select('度量1', '预计金额');
      const chartId = await save('chart', chartName, false);
      await query(actor); await layout(`${frame.name}-chart`);
      await actor.screenshot({ path: path.join(directory, `h5-report-chart-${frame.name}-${caseTag}.png`), fullPage: true });
      await actor.reload({ waitUntil: 'domcontentloaded' });
      await workspace.getByLabel('图表名称', { exact: true }).waitFor();
      check(`${frame.name}图表刷新后保留数据库定义且不自动读取金额`, await workspace.getByLabel('图表名称', { exact: true }).inputValue() === chartName
        && await workspace.locator('.report-data-table').count() === 0);
      const dashboardName = `真实仪表盘-${frame.name}-${caseTag}`;
      await arrive('dashboard'); await workspace.getByRole('button', { name: '新建仪表盘', exact: true }).click();
      await workspace.getByLabel('仪表盘名称', { exact: true }).fill(dashboardName);
      await workspace.getByRole('button', { name: /^添加图表（/ }).click();
      await select('待添加图表', chartName); await actor.getByRole('button', { name: '加入仪表盘', exact: true }).click();
      await workspace.getByLabel(`${chartName}列坐标`, { exact: true }).fill('1');
      const dashboardId = await save('dashboard', dashboardName, false);
      check(`${frame.name}布局整数坐标实际持久化`, database(`SELECT grid_x FROM sys_report_dashboard_item WHERE tenant_id=${owner.tenantId} AND dashboard_id=${dashboardId} AND chart_id=${chartId};`) === '1');
      await query(actor, true); await layout(`${frame.name}-dashboard`);
      await actor.screenshot({ path: path.join(directory, `h5-report-dashboard-${frame.name}-${caseTag}.png`), fullPage: true });
      await actor.reload({ waitUntil: 'domcontentloaded' }); await workspace.getByLabel(`${chartName}列坐标`, { exact: true }).waitFor();
      check(`${frame.name}重载布局保留列坐标1`, await workspace.getByLabel(`${chartName}列坐标`, { exact: true }).inputValue() === '1');
      if (frame.name === 'mobile') check('真实手机页面禁止手柄拖动且允许数字布局', await workspace.getByRole('button', { name: `移动图表 ${chartName}`, exact: true }).isDisabled()
        && await workspace.getByLabel(`${chartName}列坐标`, { exact: true }).isEnabled());
      await share(actor, 'CHART', chartId, 'TENANT'); await share(actor, 'DASHBOARD', dashboardId, 'TENANT');
      await readonlyActor.setViewportSize({ width: frame.width, height: frame.height });
      const readonlyWorkspace = readonlyActor.locator('.report-workspace').first();
      await readonlyActor.goto(`${origin}/workspace/report-charts?id=${chartId}`, { waitUntil: 'domcontentloaded' });
      await readonlyWorkspace.getByText('查看共享图表', { exact: true }).waitFor();
      check(`${frame.name}真实只读共享页面不授予原定义写操作`, await readonlyWorkspace.getByRole('button', { name: '保存定义', exact: true }).count() === 0
        && await readonlyWorkspace.getByRole('button', { name: '删除定义', exact: true }).count() === 0 && await readonlyWorkspace.getByLabel('图表名称', { exact: true }).isDisabled());
      await query(readonlyActor, false, true);
      await readonlyActor.goto(`${origin}/workspace/report-dashboards?id=${dashboardId}`, { waitUntil: 'domcontentloaded' });
      await readonlyWorkspace.getByText('查看共享仪表盘', { exact: true }).waitFor();
      await query(readonlyActor, true, true);
      check(`${frame.name}共享仪表盘无布局编辑入口`, await readonlyWorkspace.getByRole('button', { name: '保存布局', exact: true }).count() === 0
        && await readonlyWorkspace.getByLabel(`${chartName}列坐标`, { exact: true }).count() === 0);
      await share(actor, 'DASHBOARD', dashboardId, 'PRIVATE');
      await readonlyWorkspace.getByRole('button', { name: '刷新', exact: true }).click(); await readonlyWorkspace.getByRole('alert').waitFor();
      check(`${frame.name}共享撤回后旧仪表盘地址清除全部卡片`, await readonlyWorkspace.locator('.report-grid-card').count() === 0);
      await share(actor, 'CHART', chartId, 'PRIVATE');
      await readonlyActor.goto(`${origin}/workspace/report-charts?id=${chartId}`, { waitUntil: 'domcontentloaded' }); await readonlyWorkspace.getByRole('alert').waitFor();
      check(`${frame.name}共享撤回后旧图表地址不显示定义和数据`, await readonlyWorkspace.getByLabel('图表名称', { exact: true }).count() === 0 && await readonlyWorkspace.locator('table,canvas').count() === 0);
      await arrive('chart'); await workspace.getByRole('button', { name: '新建图表', exact: true }).click();
      const expenseName = `真实费用-${frame.name}-${caseTag}`;
      await workspace.getByLabel('图表名称', { exact: true }).fill(expenseName);
      await select('统计来源', '费用执行'); await select('图表类型', '数据表'); await select('度量1', '申请金额');
      await save('chart', expenseName, false); await queryExpense(false); await layout(`${frame.name}-expense`);
      await actor.screenshot({ path: path.join(directory, `h5-report-expense-${frame.name}-${caseTag}.png`), fullPage: true });
      await fillExpenseDate(true); await queryExpense(true); await fillExpenseDate(false);
      for (const kind of ['chart', 'dashboard']) {
        await arrive(kind); await workspace.getByRole('button', { name: kind === 'chart' ? '新建图表' : '新建仪表盘', exact: true }).click();
        const name = `丢响应-${kind}-${frame.name}-${caseTag}`;
        await workspace.getByLabel(kind === 'chart' ? '图表名称' : '仪表盘名称', { exact: true }).fill(name);
        await save(kind, name, true);
      }
      const stores = await actor.evaluate(() => JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage } }));
      check(`${frame.name}浏览器本地存储未保存报表定义和金额`, !stores.includes(chartName) && !stores.includes(dashboardName) && !stores.includes('100.10'));
      evidence[frame.name] = true;
    }
    check('真实报表页面无未处理脚本异常', errors.length === 0);
    evidence.lostResponse = true; evidence.sharedUi = true;
    console.log('REPORT_REAL_BROWSER: desktop=true; mobile=true; saves_are_real=true; integer_layout_persisted=true; readonly_sharing=true; revoked_old_urls=true; delayed_real_response=true; lost_real_response=true; interface_doubles=0');
  } catch (error) {
    for (const [label, page] of [['owner', actor], ['readonly', readonlyActor]]) {
      try {
        await page.screenshot({ path: path.join(directory, `h5-report-failure-${label}-${caseTag}.png`), fullPage: true, timeout: 5000 });
        console.log(`REPORT_REAL_PAGE_FAILURE: ${JSON.stringify({ actor: label, path: new URL(page.url()).pathname,
          alerts: await page.getByRole('alert').allTextContents(), scriptErrors: errors })}`);
      } catch (diagnosticFailure) { console.log(`REPORT_REAL_PAGE_DIAGNOSTIC: actor=${label}; error=${diagnosticFailure.name}`); }
    }
    throw error;
  } finally {
    actor.off('pageerror', onError); readonlyActor.off('pageerror', onError);
  }
}
