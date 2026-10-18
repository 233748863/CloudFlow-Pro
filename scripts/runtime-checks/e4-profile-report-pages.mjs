import { e4Ui } from './e4-profile-ui.mjs';

export async function verifyE4ReportPages(context) {
  const { check, prove, sessions, ok, waitFor, fixture } = context;
  const { screenshot, section, fit } = e4Ui(context);
  const page = sessions.sales.page;
  const chart = target => target.evaluate(async () => {
    const source = await fetch('/src/components/charts/Chart.tsx').then(value => value.text());
    const match = source.match(/import \* as echarts from ["']([^"']+)["']/);
    if (!match) throw new Error('Actual chart module missing');
    const echarts = await import(match[1]);
    const element = Array.from(document.querySelectorAll('[role="img"]')).find(value => value.getAttribute('aria-label') === '客户分层统计');
    const chart = element && echarts.getInstanceByDom(element);
    if (!chart) return null;
    const option = chart.getOption();
    return { names: option.xAxis?.[0].data, series: option.series.map(value => ({ name: value.name, data: value.data })), width: chart.getWidth() };
  });
  await prove(13, async () => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(context.origin + '/office/crm/profile-report', { waitUntil: 'domcontentloaded' });
    await page.getByRole('heading', { name: '客户分层与资质漏斗', level: 2, exact: true }).waitFor();
    const segmentLabels = Object.fromEntries(context.rows("SELECT JSON_OBJECT('value',dict_value,'label',dict_label) FROM sys_dict_data WHERE tenant_id=100000 AND dict_type='crm_market_segment' AND status='0' ORDER BY dict_sort,dict_code;").map(value => [value.value, value.label]));
    for (const dimension of ['territory', 'segment', 'industry', 'score']) {
      await page.getByRole('combobox', { name: '分布维度', exact: true }).selectOption(dimension);
      const actual = await ok('sales', '/crm/profile-report?dimension=' + dimension);
      const expectedNames = actual.distribution.map(value => dimension === 'segment' ? segmentLabels[value.name] || value.name : value.name);
      const values = await waitFor(() => chart(page), value => value && value.names?.length === actual.distribution.length
        && value.series.length === (dimension === 'score' ? 1 : 2)
        && value.names.every((name, index) => name === expectedNames[index])
        && value.series.every((series, seriesIndex) => series.data.length === actual.distribution.length
          && series.data.every((count, index) => Number(count) === actual.distribution[index][seriesIndex === 0 ? 'leads' : 'customers'])), 'Profile report did not render the current dimension');
      check('actual_' + dimension + '_chart_series_match_visible_business_totals', values.series[0].data.reduce((sum, value) => sum + Number(value), 0)
        === actual.distribution.reduce((sum, value) => sum + value.leads, 0)
        && (dimension === 'score' || values.series[1].data.reduce((sum, value) => sum + Number(value), 0) === actual.distribution.reduce((sum, value) => sum + value.customers, 0)));
    }
    await page.getByRole('combobox', { name: '分布维度', exact: true }).selectOption('territory');
    await waitFor(() => chart(page), value => value?.series.length === 2, 'Territory chart did not return');
    await screenshot('e4-profile-report-desktop.png', page);
    const distribution = section(page, '线索与客户分布');
    await distribution.getByRole('button', { name: '查看数据表', exact: true }).focus();
    await page.keyboard.press('Enter');
    const data = page.getByRole('region', { name: '客户分层统计数据表', exact: true });
    await data.waitFor();
    const actual = await ok('sales', '/crm/profile-report?dimension=territory');
    const cells = await data.locator('tbody tr').evaluateAll(elements => elements.map(element => Array.from(element.querySelectorAll('td')).map(cell => cell.textContent)));
    check('keyboard_report_table_preserves_every_group_and_count', cells.length === actual.distribution.length
      && actual.distribution.every(value => cells.some(row => row[0] === value.name && Number(row[1]) === value.leads && Number(row[2]) === value.customers)));
    await screenshot('e4-profile-report-table.png', page, distribution);
    await distribution.getByRole('button', { name: '查看图表', exact: true }).click();
    await page.setViewportSize({ width: 390, height: 960 });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.getByRole('heading', { name: '客户分层与资质漏斗', level: 2, exact: true }).waitFor();
    const mobile = await waitFor(() => chart(page), value => value?.width > 100 && value.width < 390 && value.series.length === 2, 'Phone chart did not resize');
    check('phone_profile_chart_keeps_both_real_series', mobile.series.every(value => value.data.length === actual.distribution.length));
    await fit(page, 'profile_report_phone_has_no_document_overflow');
    await screenshot('e4-profile-report-mobile.png', page);
    const readonly = sessions.readonly.page;
    await readonly.goto(context.origin + '/office/crm/leads', { waitUntil: 'domcontentloaded' });
    await readonly.getByRole('heading', { name: '线索管理', level: 2, exact: true }).waitFor();
    check('readonly_lead_page_hides_profile_and_qualification_mutations', await readonly.getByRole('button', { name: '新增线索', exact: true }).count() === 0
      && await readonly.getByRole('button', { name: '评估', exact: true }).count() === 0 && await readonly.getByRole('button', { name: '编辑线索', exact: true }).count() === 0);
    await readonly.goto(context.origin + '/office/crm/territory', { waitUntil: 'domcontentloaded' });
    await readonly.getByRole('heading', { name: '销售区域', level: 2, exact: true }).waitFor();
    check('readonly_territory_page_hides_create_edit_and_delete', await readonly.getByRole('button', { name: '新增区域', exact: true }).count() === 0
      && await readonly.getByRole('button', { name: '编辑 / 移动', exact: true }).count() === 0 && await readonly.locator('tr[draggable="true"]').count() === 0);
    await readonly.goto(context.origin + '/office/crm/profile-report', { waitUntil: 'domcontentloaded' });
    await readonly.getByRole('heading', { name: '客户分层与资质漏斗', level: 2, exact: true }).waitFor();
    await waitFor(() => chart(readonly), value => value?.series.length === 2, 'Read-only profile report did not render');
    await screenshot('e4-profile-readonly.png', readonly);
    fixture.pageReportChecks = { mobileRefreshed: true, dimensions: 4, keyboardTable: true, mobileWidth: 390, readonlyActionsHidden: true };
  });
}
