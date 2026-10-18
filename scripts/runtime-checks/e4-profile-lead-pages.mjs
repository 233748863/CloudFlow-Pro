import { e4Ui } from './e4-profile-ui.mjs';

export async function verifyE4LeadPages(context, tree, scoring) {
  const { check, prove, sessions, ok, marker, lead, readLead, sameMoney, waitFor, fixture, own, identifier } = context;
  const { screenshot, action, fit, close } = e4Ui(context);
  const page = sessions.sales.page;
  const sample = await lead('页面资质', { mobile: '13800138018', phone: '021-55550118' });
  const row = () => page.getByRole('row').filter({ hasText: sample.name });
  await prove([1, 8], async () => {
    await page.goto(context.origin + '/office/crm/leads', { waitUntil: 'domcontentloaded' });
    await page.getByPlaceholder('线索名称', { exact: true }).fill(sample.name);
    await row().getByRole('button', { name: '编辑线索', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: '编辑线索', exact: true });
    await dialog.getByRole('combobox', { name: '销售区域', exact: true }).selectOption(tree.leaf.id);
    await dialog.getByRole('combobox', { name: '细分市场', exact: true }).selectOption('ENTERPRISE');
    await dialog.getByRole('combobox', { name: '员工规模', exact: true }).selectOption('1000+');
    await dialog.getByLabel('年营收（元）', { exact: true }).fill('99999999999999.99');
    await dialog.getByLabel('职务', { exact: true }).fill('页面采购负责人');
    await dialog.getByLabel('网站', { exact: true }).fill('https://ui-profile.example.test');
    await screenshot('e4-profile-edit-desktop.png', page, dialog);
    const [profileRequest] = await Promise.all([
      page.waitForRequest(request => new URL(request.url()).pathname.endsWith('/crm/lead') && request.method() === 'PUT'),
      action(page, '/crm/lead', 'PUT', () => dialog.getByRole('button', { name: '保存', exact: true }).click(), 'actual_lead_profile_page_save_succeeds'),
    ]);
    const submittedProfile = profileRequest.postDataJSON();
    check('profile_edit_omits_unchanged_masked_contact_fields', ['mobile', 'phone', 'email'].every(field => !Object.hasOwn(submittedProfile, field)));
    await dialog.waitFor({ state: 'hidden' });
    const saved = await readLead(sample);
    check('page_profile_save_preserves_maximum_amount_to_the_cent', typeof saved.annualRevenue === 'string' && sameMoney(saved.annualRevenue, '99999999999999.99') && String(saved.territoryId) === tree.leaf.id
      && saved.marketSegment === 'ENTERPRISE' && saved.employeeScale === '1000+' && saved.jobTitle === '页面采购负责人' && saved.website === 'https://ui-profile.example.test');
    check('profile_page_edit_preserves_full_source_contact_values', context.leadContactMatches(sample.id, sample.supplied));
    await page.setViewportSize({ width: 390, height: 960 });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.getByPlaceholder('线索名称', { exact: true }).fill(sample.name);
    await row().getByRole('button', { name: '编辑线索', exact: true }).click();
    const reopened = await waitFor(async () => ({ amount: await dialog.getByLabel('年营收（元）', { exact: true }).inputValue(),
      territory: await dialog.getByRole('combobox', { name: '销售区域', exact: true }).inputValue() }),
    value => value.amount === '99999999999999.99' && value.territory === tree.leaf.id, 'Phone profile amount and territory did not finish loading');
    check('phone_reopened_profile_keeps_exact_amount_and_profile_choices', reopened.amount === '99999999999999.99' && reopened.territory === tree.leaf.id);
    await screenshot('e4-profile-reopened-mobile.png', page, dialog);
    await close(dialog);
    for (const [label, supplied] of [
      ['changed', { mobile: '13900139028', phone: '021-55550228', email: 'edited.' + marker.toLowerCase() + '@example.test' }],
      ['cleared', { mobile: '', phone: '', email: '' }],
      ['restored', { mobile: sample.supplied.mobile, phone: sample.supplied.phone, email: sample.supplied.email }],
    ]) {
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.getByPlaceholder('线索名称', { exact: true }).fill(sample.name);
      await row().getByRole('button', { name: '编辑线索', exact: true }).click();
      await dialog.getByPlaceholder('手机号', { exact: true }).fill(supplied.mobile);
      await dialog.getByPlaceholder('座机 / 备用电话', { exact: true }).fill(supplied.phone);
      await dialog.getByPlaceholder('邮箱', { exact: true }).fill(supplied.email);
      await action(page, '/crm/lead', 'PUT', () => dialog.getByRole('button', { name: '保存', exact: true }).click(), 'phone_contact_' + label + '_save_succeeds');
      await dialog.waitFor({ state: 'hidden' });
      check('phone_contact_' + label + '_persists_exact_user_input', context.leadContactMatches(sample.id, supplied));
    }
  });
  await prove([2, 3, 4, 5, 8], async () => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.getByPlaceholder('线索名称', { exact: true }).fill(sample.name);
    await row().getByRole('button', { name: '评估', exact: true }).click();
    let dialog = page.getByRole('dialog', { name: '资质评估 · ' + sample.name, exact: true });
    await dialog.getByRole('combobox', { name: '资质结论', exact: true }).selectOption('disqualify');
    check('qualification_page_disables_disqualify_without_reason', await dialog.getByRole('button', { name: '确认评估', exact: true }).isDisabled());
    await dialog.getByLabel('不合格原因（必填）', { exact: true }).fill(marker + '_页面真实判定');
    await screenshot('e4-qualification-desktop.png', page, dialog);
    await action(page, '/crm/lead/' + sample.id + '/disqualify', 'POST', () => dialog.getByRole('button', { name: '确认评估', exact: true }).click(), 'page_disqualification_is_persisted');
    await dialog.waitFor({ state: 'hidden' });
    await row().getByText(/不合格 ·/).waitFor();
    check('page_disqualification_records_exact_reason_and_actor', (await readLead(sample)).disqualifyReason === marker + '_页面真实判定');
    await page.setViewportSize({ width: 390, height: 960 });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.getByPlaceholder('线索名称', { exact: true }).fill(sample.name);
    await row().getByRole('button', { name: '评估', exact: true }).click();
    dialog = page.getByRole('dialog', { name: '资质评估 · ' + sample.name, exact: true });
    check('phone_disqualified_dialog_starts_with_reassessment', await dialog.getByRole('combobox', { name: '资质结论', exact: true }).inputValue() === 'start-qualifying'
      && await dialog.getByRole('option', { name: '判定合格', exact: true }).count() === 0);
    await screenshot('e4-qualification-mobile.png', page, dialog);
    await action(page, '/crm/lead/' + sample.id + '/start-qualifying', 'POST', () => dialog.getByRole('button', { name: '确认评估', exact: true }).click(), 'phone_reassessment_is_persisted');
    await dialog.waitFor({ state: 'hidden' });
    await row().getByText(/评估中 ·/).waitFor();
    await row().getByRole('button', { name: '评估', exact: true }).click();
    await action(page, '/crm/lead/' + sample.id + '/qualify', 'POST', () => dialog.getByRole('button', { name: '确认评估', exact: true }).click(), 'phone_qualification_is_persisted');
    await dialog.waitFor({ state: 'hidden' });
    await row().getByRole('button', { name: '转为客户', exact: true }).click();
    const conversion = page.getByRole('dialog', { name: '线索转为客户', exact: true });
    await conversion.getByRole('checkbox', { name: '同时创建商机', exact: true }).check();
    await conversion.getByLabel('预计金额（元）', { exact: true }).fill('999999999999.99');
    check('phone_conversion_amount_uses_actual_opportunity_maximum', await conversion.getByLabel('预计金额（元）', { exact: true }).getAttribute('max') === '999999999999.99');
    check('phone_conversion_amount_keeps_all_digits_before_submission', await conversion.getByLabel('预计金额（元）', { exact: true }).inputValue() === '999999999999.99');
    await screenshot('e4-conversion-mobile.png', page, conversion);
    const [conversionRequest, conversionResult] = await Promise.all([
      page.waitForRequest(request => new URL(request.url()).pathname.endsWith('/crm/lead/convert') && request.method() === 'POST'),
      action(page, '/crm/lead/convert', 'POST', () => conversion.getByRole('button', { name: '确认转化', exact: true }).click(), 'phone_conversion_creates_actual_customer'),
    ]);
    const submittedConversion = conversionRequest.postDataJSON();
    check('phone_conversion_submits_exact_decimal_amount', submittedConversion.createOpportunity === true && submittedConversion.expectedAmount === '999999999999.99');
    check('phone_conversion_uses_server_source_for_unedited_contact_fields', !Object.hasOwn(submittedConversion, 'email') && !Object.hasOwn(submittedConversion, 'phone')
      && !Object.hasOwn(submittedConversion, 'website') && !Object.hasOwn(submittedConversion, 'ownerId'));
    const customerId = identifier(conversionResult);
    own('customer', customerId);
    await page.waitForURL('**/office/crm/customer/' + customerId);
    const client = (await ok('sales', '/crm/customer/' + customerId + '/workspace')).customer;
    check('phone_conversion_preserves_exact_revenue_and_segmentation', typeof client.annualRevenue === 'string' && sameMoney(client.annualRevenue, '99999999999999.99') && String(client.territoryId) === tree.leaf.id
      && client.marketSegment === 'ENTERPRISE' && client.employeeScale === '1000+' && String((await readLead(sample)).convertedCustomerId) === customerId);
    check('phone_conversion_customer_keeps_full_source_email', context.encryptedFixtureEquals('customer', customerId, 'email', sample.supplied.email));
    const convertedContacts = context.rows("SELECT JSON_OBJECT('id',CAST(contact_id AS CHAR),'phone',phone,'position',position,'primary',primary_flag) FROM crm_contact WHERE tenant_id=100000 AND customer_id=" + customerId + ' AND deleted=0;');
    check('phone_conversion_creates_source_contact_once', convertedContacts.length === 1 && convertedContacts[0].phone === sample.supplied.phone
      && convertedContacts[0].position === '页面采购负责人' && convertedContacts[0].primary === 1);
    own('contact', convertedContacts[0].id);
    check('phone_conversion_contact_keeps_full_source_mobile_and_email', context.encryptedFixtureEquals('contact', convertedContacts[0].id, 'mobile', sample.supplied.mobile)
      && context.encryptedFixtureEquals('contact', convertedContacts[0].id, 'email', sample.supplied.email));
    const convertedOpportunities = context.rows("SELECT JSON_OBJECT('id',CAST(opportunity_id AS CHAR),'amount',CAST(expected_amount AS CHAR),'name',opportunity_name) FROM crm_opportunity WHERE tenant_id=100000 AND customer_id=" + customerId + ' AND deleted=0;');
    check('phone_conversion_persists_exact_maximum_opportunity_amount', convertedOpportunities.length === 1 && convertedOpportunities[0].name === sample.name
      && sameMoney(convertedOpportunities[0].amount, '999999999999.99'));
    own('opportunity', convertedOpportunities[0].id);
    fixture.conversions.push({ lead: sample.id, customer: customerId, contact: convertedContacts[0].id, opportunity: convertedOpportunities[0].id, actualMobilePage: true, fullContactPreserved: true, exactRevenue: '99999999999999.99', exactOpportunityAmount: '999999999999.99' });
  });
  await prove([10, 11], async () => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(context.origin + '/office/crm/leads', { waitUntil: 'domcontentloaded' });
    await page.getByPlaceholder('线索名称', { exact: true }).fill(marker);
    await page.getByLabel('最低分', { exact: true }).fill('2000');
    await page.getByLabel('最高分', { exact: true }).fill('2050');
    await page.getByRole('combobox', { name: '评分排序', exact: true }).selectOption('DESC');
    const expected = scoring.batchLeads.map(value => value.name);
    await waitFor(() => page.locator('table tbody tr').allTextContents(), values => values.length === 3 && expected.every(name => values.some(text => text.includes(name))), 'Score range did not select exactly three owned leads');
    check('actual_score_filters_and_order_show_expected_rows', await page.locator('table tbody tr').count() === 3
      && await page.getByRole('combobox', { name: '评分排序', exact: true }).inputValue() === 'DESC');
    await screenshot('e4-score-filter-desktop.png', page);
    const rule = (await ok('manager', '/crm/lead-score/rules')).find(value => String(value.ruleId) === scoring.rules[8].id);
    await ok('manager', '/crm/lead-score/rule', 'POST', { ...rule, score: 251 });
    const before = await Promise.all(scoring.batchLeads.map(readLead));
    await page.setViewportSize({ width: 390, height: 960 });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.getByPlaceholder('线索名称', { exact: true }).fill(marker);
    await page.getByLabel('最低分', { exact: true }).fill('2000');
    await page.getByLabel('最高分', { exact: true }).fill('2050');
    await page.getByRole('combobox', { name: '评分排序', exact: true }).selectOption('DESC');
    await waitFor(() => page.locator('table tbody tr').allTextContents(), values => values.length === 3 && expected.every(name => values.some(text => text.includes(name))), 'Mobile refreshed score range did not retain the three owned leads');
    await page.getByRole('checkbox', { name: '全选本页线索', exact: true }).check();
    const eventId = await action(page, '/crm/lead-score/batch', 'POST', () => page.getByRole('button', { name: '重算已选评分（3）', exact: true }).click(), 'phone_batch_button_submits_real_async_request');
    const values = await waitFor(() => Promise.all(scoring.batchLeads.map(readLead)), actual => actual.every(value => value.leadScore === 2037), 'Mobile batch did not finish through the actual consumer', 90000);
    check('phone_async_batch_keeps_manual_status_and_updates_each_record_once', values.every((value, index) => value.version === before[index].version + 1
      && ['qualificationStatus', 'qualifiedBy', 'qualifiedByName', 'qualifiedTime', 'disqualifyReason'].every(field => value[field] === before[index][field])));
    await action(page, '/crm/lead/list', 'GET', () => page.getByRole('button', { name: '刷新', exact: true }).click(), 'phone_refresh_reads_actual_batch_results');
    await waitFor(() => page.locator('table tbody tr').allTextContents(), rows => rows.length === 3 && rows.every(text => text.includes('2037 分')), 'Phone did not display completed scores');
    await fit(page, 'lead_page_mobile_keeps_horizontal_scroll_inside_table');
    const mobileIdentities = [];
    for (const row of await page.locator('table tbody tr').all()) {
      await row.scrollIntoViewIfNeeded();
      mobileIdentities.push(await row.evaluate(element => {
        const first = element.cells[0], last = element.cells[element.cells.length - 1];
        const title = first.querySelector('strong'), titleRange = document.createRange();
        titleRange.selectNodeContents(title);
        const firstBounds = first.getBoundingClientRect(), lastBounds = last.getBoundingClientRect();
        const titleBounds = [...titleRange.getClientRects()];
        const buttons = [...last.querySelectorAll('button')].map(button => button.getBoundingClientRect());
        return { name: title.textContent, first: firstBounds.toJSON(), actions: lastBounds.toJSON(), title: titleBounds.map(bounds => bounds.toJSON()), viewport: document.documentElement.clientWidth,
          readable: titleBounds.length > 0 && titleBounds.every(bounds => bounds.width > 0 && bounds.left >= firstBounds.left && bounds.right <= Math.min(firstBounds.right, lastBounds.left))
          && firstBounds.left >= 0 && lastBounds.right <= document.documentElement.clientWidth + 1,
        controls: buttons.length > 0 && buttons.every(bounds => bounds.width >= 44 && bounds.height >= 44 && bounds.left >= lastBounds.left && bounds.right <= lastBounds.right) };
      }));
    }
    fixture.mobileLeadVisibility = mobileIdentities;
    check('phone_list_keeps_each_full_lead_name_visible_beside_actions', mobileIdentities.length === 3 && expected.every(name => mobileIdentities.some(value => value.name === name && value.readable)));
    check('phone_lead_actions_wrap_without_covering_identity_and_keep_44px_targets', mobileIdentities.every(value => value.controls));
    await screenshot('e4-score-batch-mobile.png', page);
    fixture.batches.push({ eventId, leadIds: scoring.batchLeads.map(value => value.id), actualMobilePage: true, actualConsumer: true });
  });
}
