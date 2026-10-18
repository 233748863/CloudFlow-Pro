import path from 'node:path';

export async function verifyE3CreditPages(context, losses, rules) {
  const { check, prove, evidence, fixture, sessions, waitFor, sameMoney, ok, paceWorkflowStart } = context;
  const page = sessions.sales.page;
  const firstPageRead = context.uiRequests.length;
  const countLabel = '丢单原因次数排名，前10项，单位单';
  const amountLabel = '丢单原因金额排名，前10项，单位元';
  const section = (target, title) => target.locator('section.crm-ops-section').filter({ has: target.getByRole('heading', { name: title, exact: true }) });
  const screenshot = async (name, target = page, region) => {
    await target.waitForTimeout(450);
    await (region || target).screenshot({ path: path.join(context.output, name), animations: 'disabled', ...(region ? {} : { fullPage: true }) });
    fixture.images.push({ name, width: target.viewportSize().width, actualBusinessPage: true });
  };
  const charts = target => target.evaluate(async labels => {
    const source = await fetch('/src/components/charts/Chart.tsx').then(value => value.text());
    const match = source.match(/import \* as echarts from ["']([^"']+)["']/);
    if (!match) throw new Error('Actual chart module import not found');
    const echarts = await import(match[1]);
    return labels.map(label => {
      const element = Array.from(document.querySelectorAll('[role="img"]')).find(value => value.getAttribute('aria-label') === label);
      const chart = element && echarts.getInstanceByDom(element);
      if (!chart) return null;
      const option = chart.getOption(), rectangle = element.getBoundingClientRect();
      return { label, unit: option.xAxis[0].name, names: option.yAxis[0].data, data: option.series[0].data,
        inverse: option.yAxis[0].inverse, width: chart.getWidth(), height: chart.getHeight(),
        rectangle: { left: rectangle.left, right: rectangle.right, top: rectangle.top, bottom: rectangle.bottom } };
    });
  }, [countLabel, amountLabel]);
  const readyCharts = async target => {
    await target.getByRole('heading', { name: '丢单原因次数排名（前10项）', exact: true }).scrollIntoViewIfNeeded();
    return waitFor(() => charts(target), values => values.every(value => value?.data.length === 10), 'Both actual top-ten ranking charts did not render');
  };
  const checkRanks = (values, label) => {
    check(label + '_count_leader_is_most_frequent', values[0].unit === '单' && values[0].inverse === true && values[0].data.length === 10
      && values[0].names[0] === '次数排名验收' && values[0].data[0] === 3);
    check(label + '_amount_leader_differs_and_uses_yuan', values[1].unit === '元' && values[1].names[0] === '金额排名验收' && sameMoney(values[1].data[0], '999.99'));
    check(label + '_both_rankings_descend_independently', values.every(value => value.data.every((amount, index) => index === 0 || Number(value.data[index - 1]) >= Number(amount))));
  };
  await prove([3, 4], async () => {
    await page.goto(context.origin + '/office/crm/lost-analysis', { waitUntil: 'domcontentloaded' });
    await page.getByRole('heading', { name: '丢单分析与竞争情报', exact: true }).waitFor();
    let values = await readyCharts(page);
    checkRanks(values, 'loss_desktop');
    check('desktop_rankings_render_in_two_separate_columns', values[1].rectangle.left > values[0].rectangle.right && Math.abs(values[1].rectangle.top - values[0].rectangle.top) < 3);
    check('full_loss_table_keeps_all_eleven_reasons', await page.locator('table').last().locator('tbody tr').count() === 11);
    await screenshot('e3-loss-rankings-desktop.png');
    const amountSection = section(page, '丢单原因金额排名（前10项）');
    await amountSection.getByRole('button', { name: '查看数据表', exact: true }).focus();
    await page.keyboard.press('Enter');
    const table = page.getByRole('region', { name: amountLabel + '数据表', exact: true });
    await table.waitFor();
    const data = await table.locator('tbody tr').evaluateAll(elements => elements.map(element => Array.from(element.querySelectorAll('td')).map(cell => cell.textContent)));
    check('keyboard_amount_table_preserves_exact_top_ten_and_unit', data.length === 10 && data[0][0] === '金额排名验收' && sameMoney(data[0][1].replaceAll(',', ''), '999.99')
      && await table.getByRole('columnheader', { name: '丢单金额（元）', exact: true }).count() === 1);
    await screenshot('e3-loss-amount-table.png', page, amountSection);
    await amountSection.getByRole('button', { name: '查看图表', exact: true }).click();
    await page.setViewportSize({ width: 390, height: 960 });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await readyCharts(page);
    values = await waitFor(() => charts(page), actual => actual.every(value => value?.width > 100 && value.rectangle.right <= 391)
      && actual[1].rectangle.top > actual[0].rectangle.bottom, 'Mobile rankings did not stack within the viewport');
    checkRanks(values, 'loss_mobile');
    check('mobile_rankings_have_no_document_horizontal_overflow', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await screenshot('e3-loss-rankings-mobile.png');
    await page.getByLabel('统计开始日期', { exact: true }).fill('2099-01-01');
    await section(page, '丢单原因次数排名（前10项）').getByText('暂无图表数据', { exact: true }).waitFor();
    check('both_rankings_show_explicit_empty_state', await section(page, '丢单原因金额排名（前10项）').getByText('暂无图表数据', { exact: true }).isVisible());
    await screenshot('e3-loss-empty-mobile.png');
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(context.origin + '/office/crm', { waitUntil: 'domcontentloaded' });
    values = await readyCharts(page);
    checkRanks(values, 'dashboard_desktop');
    await screenshot('e3-dashboard-rankings-desktop.png', page, section(page, '丢单原因次数排名（前10项）').locator('..'));
    await page.setViewportSize({ width: 390, height: 960 });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await readyCharts(page);
    values = await waitFor(() => charts(page), actual => actual.every(value => value?.width > 100 && value.rectangle.right <= 391)
      && actual[1].rectangle.top > actual[0].rectangle.bottom, 'Shared dashboard rankings did not stack on mobile');
    checkRanks(values, 'dashboard_mobile');
    await screenshot('e3-dashboard-rankings-mobile.png', page, section(page, '丢单原因次数排名（前10项）').locator('..'));
    const readonly = sessions.readonly.page;
    await readonly.goto(context.origin + '/office/crm/lost-analysis', { waitUntil: 'domcontentloaded' });
    await readonly.getByRole('heading', { name: '丢单分析与竞争情报', exact: true }).waitFor();
    await readyCharts(readonly);
    check('readonly_loss_page_hides_master_mutation_actions', await readonly.getByRole('button', { name: '新增原因', exact: true }).count() === 0
      && await readonly.getByRole('button', { name: '新增竞对', exact: true }).count() === 0);
    await screenshot('e3-loss-readonly.png', readonly);
  });
  await prove(6, async () => {
    const manager = sessions.manager.page;
    await manager.goto(context.origin + '/office/crm/lost-analysis', { waitUntil: 'domcontentloaded' });
    await manager.getByRole('combobox', { name: '分析视图', exact: true }).selectOption('reasons');
    const editable = losses.reasons[0];
    const row = manager.getByRole('row').filter({ hasText: editable.code });
    await row.getByRole('button', { name: '编辑', exact: true }).click();
    const dialog = manager.getByRole('dialog', { name: '丢单原因', exact: true });
    await dialog.waitFor();
    await dialog.getByRole('textbox', { name: '备注', exact: true }).fill(context.marker + '_页面保存备注');
    const [response] = await Promise.all([
      manager.waitForResponse(value => new URL(value.url()).pathname.endsWith('/crm/lost-analysis/reason') && value.request().method() === 'POST'),
      dialog.getByRole('button', { name: '保存', exact: true }).click(),
    ]);
    check('reason_page_actual_save_succeeds', response.status() === 200 && (await response.json()).code === 200);
    await dialog.waitFor({ state: 'hidden' });
    await row.getByRole('button', { name: '编辑', exact: true }).click();
    await dialog.waitFor();
    check('reason_reopened_from_server_keeps_saved_remark', await dialog.getByRole('textbox', { name: '备注', exact: true }).inputValue() === context.marker + '_页面保存备注');
    await screenshot('e3-reason-reopened.png', manager, dialog);
    await dialog.getByRole('button', { name: '关闭弹窗', exact: true }).click();
    await manager.setViewportSize({ width: 390, height: 960 });
    await manager.reload({ waitUntil: 'domcontentloaded' });
    await manager.getByRole('combobox', { name: '分析视图', exact: true }).selectOption('competitors');
    await manager.getByRole('row').filter({ hasText: losses.competitors[0].request.competitorName }).getByRole('button', { name: '编辑', exact: true }).click();
    const competitor = manager.getByRole('dialog', { name: '竞争对手', exact: true });
    await competitor.waitFor();
    check('mobile_competitor_editor_reads_saved_business_fields', await competitor.getByLabel('名称', { exact: true }).inputValue() === '竞争对手甲'
      && await competitor.getByRole('textbox', { name: '优势', exact: true }).inputValue() === '交付响应' && await competitor.getByRole('textbox', { name: '劣势', exact: true }).inputValue() === '价格较高');
    const editedStrength = '交付响应与服务保障', editedWeakness = '价格较高且交期较长';
    await competitor.getByRole('textbox', { name: '优势', exact: true }).fill(editedStrength);
    await competitor.getByRole('textbox', { name: '劣势', exact: true }).fill(editedWeakness);
    const [savedCompetitor] = await Promise.all([
      manager.waitForResponse(value => new URL(value.url()).pathname.endsWith('/crm/lost-analysis/competitor') && value.request().method() === 'POST'),
      competitor.getByRole('button', { name: '保存', exact: true }).click(),
    ]);
    const submittedCompetitor = savedCompetitor.request().postDataJSON();
    check('competitor_page_actual_save_uses_server_fields', savedCompetitor.status() === 200 && (await savedCompetitor.json()).code === 200
      && submittedCompetitor.strength === editedStrength && submittedCompetitor.weakness === editedWeakness
      && !Object.hasOwn(submittedCompetitor, 'strengths') && !Object.hasOwn(submittedCompetitor, 'weaknesses'));
    await competitor.waitFor({ state: 'hidden' });
    const storedCompetitor = (await ok('manager', '/crm/lost-analysis/competitors?pageNum=1&pageSize=100')).rows.find(value => String(value.competitorId) === losses.competitors[0].id);
    check('competitor_page_save_preserves_exact_business_fields', storedCompetitor.strength === editedStrength && storedCompetitor.weakness === editedWeakness);
    await manager.reload({ waitUntil: 'domcontentloaded' });
    await manager.getByRole('combobox', { name: '分析视图', exact: true }).selectOption('competitors');
    await manager.getByRole('row').filter({ hasText: losses.competitors[0].request.competitorName }).getByRole('button', { name: '编辑', exact: true }).click();
    await competitor.waitFor();
    check('competitor_reopened_from_server_keeps_saved_strength_and_weakness', await competitor.getByRole('textbox', { name: '优势', exact: true }).inputValue() === editedStrength
      && await competitor.getByRole('textbox', { name: '劣势', exact: true }).inputValue() === editedWeakness);
    fixture.competitorPage = { id: losses.competitors[0].id, strength: editedStrength, weakness: editedWeakness, submittedServerFields: true, storedAndReopened: true };
    await screenshot('e3-competitor-mobile.png', manager, competitor);
    await competitor.getByRole('button', { name: '关闭弹窗', exact: true }).click();
  });
  const showCredit = async (target, client) => {
    await target.goto(context.origin + '/office/crm/credit', { waitUntil: 'domcontentloaded' });
    await target.getByLabel('搜索客户', { exact: true }).fill(client.code);
    await target.getByRole('combobox', { name: '客户', exact: true }).locator('option[value="' + client.id + '"]').waitFor({ state: 'attached' });
    await target.getByRole('combobox', { name: '客户', exact: true }).selectOption(client.id);
    const panel = section(target, '信用额度与应收风险');
    await panel.getByText('实时占用', { exact: true }).waitFor();
    return panel;
  };
  const verifyCreditValues = async (target, panel, label) => {
    const metrics = await panel.locator('.crm-ops-metric').evaluateAll(elements => elements.map(element => ({ label: element.querySelector('span')?.textContent, value: element.querySelector('strong')?.textContent })));
    const money = name => metrics.find(value => value.label.includes(name))?.value.replace(/[^\d.-]/g, '');
    check(label + '_shows_exact_credit_occupied_available_and_overdue', metrics.length === 4 && sameMoney(money('信用额度'), fixture.exposure.expected.limit)
      && sameMoney(money('实时占用'), fixture.exposure.expected.occupied) && sameMoney(money('可用额度'), fixture.exposure.expected.available) && sameMoney(money('超期应收'), fixture.exposure.expected.overdue));
    check(label + '_has_no_page_permission_toast', await target.getByText(/权限不足[:：]/).count() === 0);
  };
  await prove([7, 8], async () => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    let panel = await showCredit(page, rules.client);
    await verifyCreditValues(page, panel, 'credit_desktop');
    await screenshot('e3-credit-desktop.png');
    await panel.getByRole('button', { name: '申请调整额度', exact: true }).click();
    const proposal = page.getByRole('dialog', { name: '申请信用额度调整', exact: true });
    await proposal.waitFor();
    check('credit_adjustment_page_disables_submission_without_reason', await proposal.getByRole('button', { name: '提交审批', exact: true }).isDisabled());
    await screenshot('e3-credit-proposal.png', page, proposal);
    await proposal.getByRole('button', { name: '关闭弹窗', exact: true }).click();
    await page.setViewportSize({ width: 390, height: 960 });
    panel = await showCredit(page, rules.client);
    await verifyCreditValues(page, panel, 'credit_mobile');
    check('credit_phone_has_no_document_horizontal_overflow', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await screenshot('e3-credit-mobile.png');
    const readonly = sessions.readonly.page;
    panel = await showCredit(readonly, rules.client);
    await verifyCreditValues(readonly, panel, 'credit_readonly');
    check('readonly_credit_page_hides_adjustment_and_bypass', await panel.getByRole('button', { name: '申请调整额度', exact: true }).count() === 0
      && await panel.getByRole('button', { name: /临时放行/ }).count() === 0);
    await screenshot('e3-credit-readonly.png', readonly);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(context.origin + '/office/crm/customer/' + rules.client.id, { waitUntil: 'domcontentloaded' });
    await page.getByRole('tab', { name: /信用/ }).click();
    panel = section(page, '信用额度与应收风险');
    await panel.getByText('实时占用', { exact: true }).waitFor();
    await verifyCreditValues(page, panel, 'customer_workspace_credit');
    await screenshot('e3-customer-workspace-credit.png', page, panel);
  });
  await prove(12, async () => {
    await page.goto(context.origin + '/office/crm/quotes', { waitUntil: 'domcontentloaded' });
    await page.getByPlaceholder('客户 / 商机 / 报价关键字', { exact: true }).fill(rules.uiQuote.name);
    const row = page.getByRole('row').filter({ hasText: rules.uiQuote.name });
    await row.getByRole('button', { name: '提交提审', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: '确认操作', exact: true });
    await dialog.waitFor();
    await paceWorkflowStart('sales');
    const [response] = await Promise.all([
      page.waitForResponse(value => new URL(value.url()).pathname.endsWith('/crm/quote/submit/' + rules.uiQuote.id) && value.request().method() === 'POST'),
      dialog.getByRole('button', { name: '确认', exact: true }).click(),
    ]);
    const body = await response.json();
    check('quote_page_warning_response_is_actual_success', response.status() === 200 && body.code === 200 && response.headers()['x-crm-rule-warning'] === 'true');
    await page.getByText(/信用\/资质提醒/).first().waitFor({ state: 'visible' });
    check('credit_warning_is_visible_to_sales_on_actual_page', await page.getByText(/信用\/资质提醒/).first().isVisible());
    await screenshot('e3-quote-credit-warning.png');
    check('quote_page_submission_reaches_business_state', (await ok('sales', '/crm/quote/' + rules.uiQuote.id)).status !== 'DRAFT');
  });
  await prove(17, async () => {
    const admin = sessions.admin.page;
    const ruleTable = admin.getByRole('table', { name: '业务规则命中记录', exact: true });
    const hitLabels = { BLOCK: '拦截', WARN: '预警', PASS: '放行', BYPASSED: '例外放行' };
    const fieldLabels = ['规则编码', '业务', '阈值', '实际值', '效果', '结果', '命中时间'];
    const verifyHitRows = async (body, label, mobile = false) => {
      const records = body.data.records;
      check(label + '_contains_actual_server_hit_rows', Array.isArray(records) && records.length > 0);
      const expected = records.map(hit => [hit.ruleCode, hit.businessType + '#' + (hit.businessId || '-'), String(hit.thresholdValue ?? '-'),
        String(hit.actualValue ?? '-'), hitLabels[hit.effect], hitLabels[hit.hitResult], hit.createdTime ? hit.createdTime.replace('T', ' ').slice(0, 19) : '-']);
      const rows = await waitFor(() => ruleTable.locator('tbody > tr').evaluateAll(elements => elements.map(element => Array.from(element.cells).map(cell => {
        const rectangle = cell.getBoundingClientRect();
        const style = getComputedStyle(cell);
        return { text: cell.textContent.trim(), label: cell.dataset.cfMobileLabel, width: rectangle.width, height: rectangle.height,
          left: rectangle.left, right: rectangle.right, display: style.display, visibility: style.visibility };
      }))), values => JSON.stringify(values.map(row => row.map(cell => cell.text))) === JSON.stringify(expected)
        && (!mobile || values.every(row => row.every((cell, index) => cell.label === fieldLabels[index]))), 'Actual rule hit fields did not finish rendering');
      check(label + '_seven_fields_match_actual_server_values', rows.length === records.length && rows.every(row => row.length === 7)
        && JSON.stringify(rows.map(row => row.map(cell => cell.text))) === JSON.stringify(expected));
      check(label + '_all_seven_fields_are_visible', rows.every(row => row.every(cell => cell.width > 0 && cell.height > 0
        && cell.display !== 'none' && cell.visibility === 'visible')));
      if (records.some(hit => hit.hitResult === 'BYPASSED')) check(label + '_bypassed_record_displays_exact_business_label',
        rows.some((row, index) => records[index].hitResult === 'BYPASSED' && row[5].text === '例外放行'));
      if (mobile) {
        check(label + '_every_field_has_visible_mobile_label', rows.every(row => row.every((cell, index) => cell.label === fieldLabels[index])));
        check(label + '_all_fields_fit_phone_width', rows.every(row => row.every(cell => cell.left >= -1 && cell.right <= 391)));
      }
      return records;
    };
    const verifyBypassFilter = async (label, mobile = false) => {
      await admin.getByRole('button', { name: '命中结果', exact: true }).click();
      await admin.getByRole('option', { name: '例外放行', exact: true }).click();
      const [response] = await Promise.all([
        admin.waitForResponse(value => {
          const url = new URL(value.url());
          return url.pathname.endsWith('/auth/system/rules/hit-records') && url.searchParams.get('hitResult') === 'BYPASSED';
        }),
        admin.getByRole('button', { name: '查询', exact: true }).click(),
      ]);
      const body = await response.json();
      check(label + '_bypass_filter_queries_actual_latest_results', response.status() === 200 && body.code === 200 && body.data.total > 0
        && body.data.records.every(hit => hit.hitResult === 'BYPASSED') && new URL(response.url()).searchParams.get('deduplicate') === 'true'
        && new URL(response.url()).searchParams.get('pageNum') === '1');
      await verifyHitRows(body, label + '_filtered_bypass', mobile);
    };
    await admin.goto(context.origin + '/system/rules', { waitUntil: 'domcontentloaded' });
    await admin.getByRole('button', { name: '命中记录', exact: true }).click();
    await admin.getByPlaceholder('规则编码', { exact: true }).fill('crm.credit.overdue');
    await admin.getByPlaceholder('业务类型', { exact: true }).fill('CRM_QUOTE_SUBMIT');
    const [response] = await Promise.all([
      admin.waitForResponse(value => {
        const url = new URL(value.url()); return url.pathname.endsWith('/auth/system/rules/hit-records') && url.searchParams.get('ruleCode') === 'crm.credit.overdue' && url.searchParams.get('businessType') === 'CRM_QUOTE_SUBMIT';
      }),
      admin.getByRole('button', { name: '查询', exact: true }).click(),
    ]);
    const raw = await response.json();
    check('rule_page_raw_hit_query_succeeds', response.status() === 200 && raw.code === 200);
    const [changed] = await Promise.all([
      admin.waitForResponse(value => { const url = new URL(value.url()); return url.pathname.endsWith('/auth/system/rules/hit-records') && url.searchParams.get('deduplicate') === 'true'; }),
      admin.getByRole('switch', { name: '每张单据仅看最新结果', exact: true }).click(),
    ]);
    const reduced = await changed.json();
    check('rule_page_dedup_switch_resets_page_and_reduces_rows', changed.status() === 200 && reduced.code === 200 && reduced.data.total < raw.data.total
      && new URL(changed.url()).searchParams.get('pageNum') === '1');
    const desktopRecords = await verifyHitRows(reduced, 'rule_hit_desktop');
    check('rule_hit_desktop_contains_actual_bypassed_business', desktopRecords.some(hit => hit.hitResult === 'BYPASSED'));
    await screenshot('e3-rule-hits-latest-desktop.png', admin);
    await verifyBypassFilter('rule_hit_desktop');
    await admin.setViewportSize({ width: 390, height: 960 });
    await admin.reload({ waitUntil: 'domcontentloaded' });
    await admin.getByRole('button', { name: '命中记录', exact: true }).click();
    await admin.getByPlaceholder('规则编码', { exact: true }).fill('crm.credit.overdue');
    await admin.getByPlaceholder('业务类型', { exact: true }).fill('CRM_QUOTE_SUBMIT');
    const [phoneResponse] = await Promise.all([
      admin.waitForResponse(value => {
        const url = new URL(value.url()); return url.pathname.endsWith('/auth/system/rules/hit-records') && url.searchParams.get('ruleCode') === 'crm.credit.overdue' && url.searchParams.get('businessType') === 'CRM_QUOTE_SUBMIT';
      }),
      admin.getByRole('button', { name: '查询', exact: true }).click(),
    ]);
    const phoneRaw = await phoneResponse.json();
    check('rule_phone_refresh_retains_actual_hit_query', phoneResponse.status() === 200 && phoneRaw.code === 200 && phoneRaw.data.total === raw.data.total);
    const [phoneChanged] = await Promise.all([
      admin.waitForResponse(value => { const url = new URL(value.url()); return url.pathname.endsWith('/auth/system/rules/hit-records') && url.searchParams.get('deduplicate') === 'true'; }),
      admin.getByRole('switch', { name: '每张单据仅看最新结果', exact: true }).click(),
    ]);
    const phoneReduced = await phoneChanged.json();
    check('rule_phone_latest_results_match_desktop_after_refresh', phoneChanged.status() === 200 && phoneReduced.code === 200 && phoneReduced.data.total === reduced.data.total
      && new URL(phoneChanged.url()).searchParams.get('pageNum') === '1');
    check('rule_hit_query_switch_remains_accessible_on_phone', await admin.getByRole('switch', { name: '每张单据仅看最新结果', exact: true }).isVisible());
    const phoneRecords = await verifyHitRows(phoneReduced, 'rule_hit_phone', true);
    check('rule_hit_phone_preserves_desktop_record_order_and_values', JSON.stringify(phoneRecords) === JSON.stringify(desktopRecords));
    check('rule_hit_phone_heading_and_description_fit_viewport', await admin.locator('.admin-source-header > div').first().evaluate(element => {
      const rectangle = element.getBoundingClientRect();
      return rectangle.left >= -1 && rectangle.right <= innerWidth + 1 && element.scrollWidth <= element.clientWidth + 1;
    }));
    check('rule_hit_phone_has_no_horizontal_document_overflow', await admin.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await screenshot('e3-rule-hits-latest-mobile.png', admin);
    await verifyBypassFilter('rule_hit_phone', true);
    fixture.ruleHitPresentation = { fields: fieldLabels, desktopValuesVerified: true, mobileValuesVerified: true, mobileFieldLabelsVerified: true,
      bypassBusinessLabelVerified: true, desktopBypassFilterVerified: true, mobileBypassFilterVerified: true, phoneWidth: 390 };
  });
  for (const actor of ['sales', 'readonly', 'manager', 'admin']) check('page_' + actor + '_has_no_permission_error_toast', await sessions[actor].page.getByText(/权限不足[:：]/).count() === 0);
  check('actual_pages_have_no_unexpected_read_errors', !context.uiRequests.slice(firstPageRead).some(request => request.method === 'GET' && request.status >= 400));
  fixture.mobileEntries = { width: 390, lostAnalysisRefreshed: true, dashboardRefreshed: true, competitorSavedAndRefreshed: true, creditDirectLoaded: true, ruleCenterRefreshedAndQueried: true };
  evidence.desktop = true; evidence.mobile = true;
}
