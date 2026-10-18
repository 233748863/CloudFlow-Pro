import assert from 'node:assert/strict';
import path from 'node:path';

export async function verifyE2SlaPages(context, reports) {
  const { check, evidence, prove, ok, waitFor, sessions, fixture } = context;
  const page = sessions.admin.page;
  const firstPageRead = context.uiRequests.length;
  const label = '平均响应与解决时长趋势，单位分钟';
  const screenshot = async (name, target = page) => {
    await target.screenshot({ path: path.join(context.output, name), ...(target === page ? { fullPage: true } : {}) });
    fixture.images.push({ name, width: page.viewportSize().width, actualBusinessPage: true });
  };
  const change = async (actorPage, action, accepts) => {
    const [response] = await Promise.all([
      actorPage.waitForResponse(value => { const url = new URL(value.url()); return url.pathname.endsWith('/crm/sla/report') && accepts(url.searchParams); }, { timeout: 30000 }),
      action(),
    ]);
    const body = await response.json();
    check('actual_report_page_request_succeeds', response.status() === 200 && body.code === 200);
    return body.data;
  };
  const readChart = () => page.evaluate(async chartLabel => {
    const element = Array.from(document.querySelectorAll('[role="img"]')).find(value => value.getAttribute('aria-label') === chartLabel);
    if (!element) return null;
    const source = await fetch('/src/components/charts/Chart.tsx').then(response => response.text());
    const match = source.match(/import \* as echarts from ["']([^"']+)["']/);
    if (!match) throw new Error('Actual chart module import not found');
    const charts = await import(match[1]);
    const chart = charts.getInstanceByDom(element);
    if (!chart) return null;
    const option = chart.getOption();
    return { width: chart.getWidth(), height: chart.getHeight(), dates: option.xAxis[0].data, unit: option.yAxis[0].name,
      series: option.series.map(value => ({ name: value.name, connectNulls: value.connectNulls, data: value.data })),
      rectangle: { x: element.getBoundingClientRect().x, right: element.getBoundingClientRect().right, width: element.getBoundingClientRect().width } };
  }, label);
  await page.goto(context.origin + '/office/crm/sla', { waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { name: '服务等级与履约', exact: true }).waitFor();
  await prove(1, async () => {
    const editable = fixture.policies.find(value => value.code.endsWith('_EDITABLE'));
    assert.ok(editable);
    const row = page.getByRole('row').filter({ hasText: editable.code });
    await row.getByRole('button', { name: '编辑', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: '服务等级策略', exact: true });
    await dialog.waitFor();
    const updatedName = editable.code + '-页面';
    await dialog.getByLabel('策略名称', { exact: true }).fill(updatedName);
    await dialog.getByLabel('响应分钟', { exact: true }).nth(0).fill('78');
    const [response] = await Promise.all([
      page.waitForResponse(value => new URL(value.url()).pathname.endsWith('/crm/sla/policy') && value.request().method() === 'POST', { timeout: 30000 }),
      dialog.getByRole('button', { name: '保存策略', exact: true }).click(),
    ]);
    const body = await response.json();
    check('policy_page_actual_save_succeeds', response.status() === 200 && body.code === 200);
    await dialog.waitFor({ state: 'hidden' });
    const saved = await ok('admin', `/crm/sla/policy/${editable.id}`);
    check('policy_page_changes_reach_real_database', saved.policy.policyName === updatedName && saved.priorities.find(value => value.priorityCode === 'P1').firstResponseMinutes === 78);
    await row.getByRole('button', { name: '编辑', exact: true }).click();
    await dialog.waitFor();
    check('policy_page_reopen_preserves_all_tiers_and_changed_values', await dialog.getByLabel('策略名称', { exact: true }).inputValue() === updatedName && await dialog.getByLabel('响应分钟', { exact: true }).count() === 4 && await dialog.getByLabel('响应分钟', { exact: true }).nth(0).inputValue() === '78');
    await screenshot('sla-policy-reopened.png', dialog);
    await dialog.getByRole('button', { name: '关闭弹窗', exact: true }).click();
    await dialog.waitFor({ state: 'hidden' });
  });
  await prove(12, async () => {
    await page.getByRole('combobox', { name: '服务等级视图', exact: true }).selectOption('report');
    await page.getByRole('heading', { name: '平均处理时长趋势', exact: true }).waitFor();
    await change(page, () => page.getByRole('combobox', { name: '策略筛选', exact: true }).selectOption(reports.policy.id), values => values.get('policyId') === reports.policy.id);
    await change(page, () => page.getByRole('combobox', { name: '优先级筛选', exact: true }).selectOption('P1'), values => values.get('policyId') === reports.policy.id && values.get('severity') === 'P1');
    const chart = await waitFor(readChart, value => value?.series.length === 2 && value.series.every(series => series.data.length === 2), 'Actual duration chart did not render the selected data');
    check('duration_chart_shows_both_average_series_in_minutes', chart.unit === '分钟' && chart.series.map(value => value.name).join(',') === '平均响应时长,平均解决时长' && chart.height === 280 && chart.width > 200);
    check('duration_chart_retains_zero_and_null_gap', chart.dates.join(',') === `${reports.currentDay},${reports.tomorrow}` && chart.series.every(value => value.connectNulls === false && value.data[0] === 0 && value.data[1] == null));
    check('existing_rate_trend_remains_present', await page.getByRole('img', { name: '响应与解决履约率趋势', exact: true }).isVisible());
    await screenshot('sla-duration-desktop.png');
    const section = page.locator('section.crm-ops-section').filter({ has: page.getByRole('heading', { name: '平均处理时长趋势', exact: true }) });
    const tableButton = section.getByRole('button', { name: '查看数据表', exact: true });
    await tableButton.focus(); await page.keyboard.press('Enter');
    const table = page.getByRole('region', { name: label + '数据表', exact: true });
    await table.waitFor();
    const tableValues = await table.locator('tbody tr').evaluateAll(elements => elements.map(element => Array.from(element.querySelectorAll('td')).map(cell => cell.textContent)));
    check('keyboard_table_switch_exposes_dates_zero_and_missing_values', tableValues.length === 2 && tableValues[0][0] === reports.currentDay && Number(tableValues[0][1]) === 0 && Number(tableValues[0][2]) === 0 && tableValues[1][0] === reports.tomorrow && tableValues[1][1] === '—' && tableValues[1][2] === '—');
    check('data_table_explicitly_labels_minute_units', await table.getByRole('columnheader', { name: '平均响应时长（分钟）', exact: true }).count() === 1 && await table.getByRole('columnheader', { name: '平均解决时长（分钟）', exact: true }).count() === 1);
    await screenshot('sla-duration-table-desktop.png', section);
    await section.getByRole('button', { name: '查看图表', exact: true }).click();
    await waitFor(readChart, value => value?.series.length === 2, 'Duration chart did not return from data table');
    await page.setViewportSize({ width: 390, height: 960 });
    const mobile = await waitFor(readChart, value => value?.width > 150 && value.rectangle.right <= 391, 'Duration chart did not fit phone width');
    check('phone_chart_fits_390_pixels_and_preserves_both_series', mobile.rectangle.x >= 0 && mobile.series.every(value => value.data[0] === 0 && value.data[1] == null) && await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await screenshot('sla-duration-mobile.png');
    await section.getByRole('button', { name: '查看数据表', exact: true }).click();
    await table.waitFor();
    check('phone_data_table_retains_two_dates', await table.locator('tbody tr').count() === 2);
    await screenshot('sla-duration-table-mobile.png');
    await section.getByRole('button', { name: '查看图表', exact: true }).click();
    const grouped = await change(page, () => page.getByRole('combobox', { name: '统计维度', exact: true }).selectOption('OWNER'), values => values.get('groupBy') === 'OWNER');
    check('phone_report_dimension_switch_keeps_selected_policy', grouped.total.total === 2 && grouped.groups.length === 1);
    await change(page, () => page.getByLabel('统计开始', { exact: true }).fill('2099-01-01'), values => values.get('start') === '2099-01-01');
    await section.getByText('暂无图表数据', { exact: true }).waitFor();
    check('empty_filtered_duration_report_has_explicit_empty_state', await section.getByText('暂无图表数据', { exact: true }).isVisible() && await section.getByRole('img').count() === 0);
    await screenshot('sla-duration-empty.png');
    const readonly = sessions.readonly.page;
    await readonly.goto(context.origin + '/office/crm/sla', { waitUntil: 'domcontentloaded' });
    await readonly.getByRole('heading', { name: '服务等级与履约', exact: true }).waitFor();
    check('readonly_policy_page_hides_mutation_actions', await readonly.getByRole('button', { name: '新增策略', exact: true }).count() === 0 && await readonly.getByRole('button', { name: '编辑', exact: true }).count() === 0 && await readonly.getByRole('button', { name: '复制', exact: true }).count() === 0);
    await readonly.getByRole('combobox', { name: '服务等级视图', exact: true }).selectOption('report');
    await readonly.getByRole('heading', { name: '平均处理时长趋势', exact: true }).waitFor();
    check('readonly_report_has_no_permission_error_toasts', await readonly.getByText(/权限不足[:：]/).count() === 0);
    check('report_pages_have_no_unexpected_read_errors', !context.uiRequests.slice(firstPageRead).some(request => request.method === 'GET' && request.status >= 400));
    await readonly.screenshot({ path: path.join(context.output, 'sla-report-readonly.png'), fullPage: true });
    fixture.images.push({ name: 'sla-report-readonly.png', width: 1440, actualBusinessPage: true });
    evidence.desktop = true; evidence.mobile = true;
  });
}
