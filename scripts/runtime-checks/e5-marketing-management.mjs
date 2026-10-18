import assert from 'node:assert/strict';
import path from 'node:path';

export async function verifyE5Management(context) {
  const { check, prove, fixture, evidence, campaign, readCampaign, saveCampaign, recalculate, lead, targetList, convert,
    ok, api, rejected, rows, database, sql, own, waitFor, sameMoney, sessions, user } = context;
  let precision, localList, queryList, localLead;
  await prove(1, async () => {
    precision = await campaign('金额精度', { budget: '99999999999999.99', actualCost: '0.01' });
    const current = await readCampaign(precision);
    check('maximum_campaign_budget_is_exact_string', typeof current.campaign.budget === 'string' && sameMoney(current.campaign.budget, '99999999999999.99') && sameMoney(current.campaign.actualCost, '0.01'));
    await saveCampaign(precision, { budget: '99999999999999.98', actualCost: '50.01' });
    rejected(await api('admin', '/crm/campaign', { method: 'POST', body: { ...current, campaign: { ...current.campaign, budget: '12.34' } } }), 'stale_campaign_version_rejected');
    const saved = (await readCampaign(precision)).campaign;
    check('stale_save_cannot_overwrite_exact_budget', sameMoney(saved.budget, '99999999999999.98') && sameMoney(saved.actualCost, '50.01'));
    rejected(await api('admin', '/crm/campaign', { method: 'POST', body: { campaign: { ...saved, budget: '100000000000000.00' }, targetLists: [] } }), 'campaign_budget_above_precision_rejected');
    rejected(await api('admin', '/crm/campaign', { method: 'POST', body: { campaign: { ...saved, actualCost: '0.001' }, targetLists: [] } }), 'campaign_cost_subcent_rejected');
    const loss = await recalculate(precision);
    check('no_receipts_give_negative_one_roi', loss.roi === '-1.0000' && sameMoney(loss.revenue, '0.00'));
    const local = await campaign('销售本人', {}, 'sales');
    const peer = await campaign('销售主管', {}, 'manager');
    const outside = await campaign('其他部门', {}, 'other');
    for (const sample of [local, peer, outside]) {
      rejected(await api('foreign', '/crm/campaign/' + sample.id), 'foreign_campaign_denied_' + sample.id);
    }
    rejected(await api('sales', '/crm/campaign/' + outside.id), 'sales_cannot_read_other_department_campaign');
    rejected(await api('readonly', '/crm/campaign', { method: 'POST', body: { campaign: saved, targetLists: [] } }), 'readonly_cannot_edit_campaign');
    const list = await ok('sales', '/crm/campaign/list?pageNum=1&pageSize=200');
    check('sales_campaign_list_is_own_scope', list.rows.some(value => String(value.campaignId) === local.id) && !list.rows.some(value => [peer.id, outside.id].includes(String(value.campaignId))));
    evidence.campaigns = true; evidence.permissions = true;
  });
  await prove([2, 21], async () => {
    localLead = await lead('本人名单', {}, 'sales');
    const peer = await lead('部门名单', {}, 'manager');
    const outside = await lead('其他部门名单', {}, 'other');
    const foreign = await lead('其他租户名单', {}, 'foreign');
    localList = await targetList('手工本人名单', [{ memberType: 'LEAD', memberRefId: localLead.id }], 'sales');
    queryList = await targetList('条件部门名单', [], 'manager', { memberType: 'LEAD', industry: context.marker });
    const query = await ok('manager', '/crm/target-list/' + queryList.id);
    const ids = query.members.map(value => String(value.memberRefId));
    check('query_list_applies_department_filter_and_industry', ids.includes(localLead.id) && ids.includes(peer.id) && !ids.includes(outside.id) && !ids.includes(foreign.id));
    const visible = await ok('sales', '/crm/target-list/' + localList.id);
    check('manual_list_preserves_selected_member_and_masks_email', visible.members.length === 1 && String(visible.members[0].memberRefId) === localLead.id
      && !JSON.stringify(visible).includes(localLead.supplied.email));
    rejected(await api('sales', '/crm/target-list/' + queryList.id), 'personal_scope_cannot_read_department_owned_list');
    rejected(await api('foreign', '/crm/target-list/' + localList.id), 'cross_tenant_cannot_read_target_list');
    rejected(await api('readonly', '/crm/target-list/' + localList.id + '/export', { textResponse: true }), 'readonly_cannot_export_contacts');
    const before = Number(database("SELECT COUNT(*) FROM sys_audit_log WHERE tenant_id=100000 AND audit_name='导出CRM营销名单';"));
    const exported = await api('admin', '/crm/target-list/' + localList.id + '/export', { textResponse: true });
    check('authorized_export_returns_masked_csv', exported.status === 200 && exported.text?.includes('类型,对象ID,名称,邮箱,电话,退订')
      && exported.text.includes(localLead.name) && !exported.text.includes(localLead.supplied.email));
    const auditCount = await waitFor(() => Number(database("SELECT COUNT(*) FROM sys_audit_log WHERE tenant_id=100000 AND audit_name='导出CRM营销名单' AND high_risk=1;")),
      value => value > before, 'Marketing export audit was not written');
    check('export_has_real_high_risk_audit', auditCount > before);
    const audits = rows("SELECT JSON_OBJECT('actor',create_by,'field',audit_field,'detail',after_val,'at',CAST(create_time AS CHAR),'risk',risk_level) FROM sys_audit_log WHERE tenant_id=100000 AND audit_name='导出CRM营销名单' AND audit_field=" + sql('CRM_TARGET_LIST:' + localList.id) + ';');
    check('export_audit_binds_actual_actor_list_count_time_and_no_contact_details', audits.length === 1 && audits[0].actor === 'g_import_admin'
      && audits[0].detail === '导出条数=1;联系方式已脱敏' && !!audits[0].at && audits[0].risk === 'HIGH'
      && !JSON.stringify(audits).includes(localLead.supplied.email));
    const mixedLead = await lead('多类型名单线索');
    const converted = await convert(mixedLead);
    const contacts = rows("SELECT JSON_OBJECT('id',CAST(contact_id AS CHAR)) FROM crm_contact WHERE tenant_id=100000 AND customer_id=" + converted.customerId + ' AND deleted=0;');
    check('conversion_created_actual_contact_for_list', contacts.length === 1);
    own('contact', contacts[0].id);
    const mixed = await targetList('客户联系人线索', [{ memberType: 'LEAD', memberRefId: localLead.id }, { memberType: 'CUSTOMER', memberRefId: converted.customerId }, { memberType: 'CONTACT', memberRefId: contacts[0].id }]);
    const members = (await ok('admin', '/crm/target-list/' + mixed.id)).members;
    check('manual_lists_support_all_three_real_member_types', members.length === 3 && new Set(members.map(value => value.memberType)).size === 3);
    const later = await lead('条件新增成员', {}, 'sales');
    await ok('manager', '/crm/target-list/' + queryList.id + '/refresh', 'POST');
    check('query_refresh_includes_new_matching_member', (await ok('manager', '/crm/target-list/' + queryList.id)).members.some(value => String(value.memberRefId) === later.id));
    evidence.audiences = true; evidence.audits = true;
  });
  fixture.management = { precisionCampaignId: precision.id, manualListId: localList.id, queryListId: queryList.id };
  return { precision, localList, queryList };
}

export async function verifyE5Pages(context, management, revenue) {
  const { check, prove, fixture, evidence, sessions, origin, ok, waitFor, sameMoney } = context;
  const page = sessions.admin.page;
  const openCampaign = async sample => {
    await page.goto(origin + '/office/crm/campaign', { waitUntil: 'domcontentloaded' });
    await page.getByRole('textbox', { name: '搜索营销活动', exact: true }).fill(sample.name);
    await page.getByRole('button', { name: sample.name, exact: true }).click();
    await page.getByRole('dialog').waitFor();
  };
  const shot = async (name, width) => {
    const size = await page.evaluate(() => ({ client: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
    check(name + '_no_page_overflow', size.client === width && size.scroll <= width);
    await page.screenshot({ path: path.join(context.output, name + '.png'), fullPage: true });
    fixture.images.push({ name: name + '.png', width, actualBusinessPage: true });
  };
  await prove(1, async () => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await openCampaign(management.precision);
    const budget = page.getByLabel('预算（元）', { exact: true });
    check('desktop_restores_exact_maximum_budget', sameMoney((await budget.inputValue()).replaceAll(',', ''), '99999999999999.98'));
    await budget.fill('99999999999999.99');
    await page.getByLabel('实际成本（元）', { exact: true }).fill('50.03');
    await page.getByRole('button', { name: '保存活动', exact: true }).click();
    await waitFor(async () => (await ok('admin', '/crm/campaign/' + management.precision.id)).campaign, value => sameMoney(value.budget, '99999999999999.99') && sameMoney(value.actualCost, '50.03'), 'Desktop campaign amounts did not persist exactly');
    await budget.scrollIntoViewIfNeeded();
    await shot('e5-campaign-desktop', 1440);
    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 844 });
      await openCampaign(management.precision);
      check('mobile_reload_exact_campaign_amount_' + width, sameMoney((await budget.inputValue()).replaceAll(',', ''), '99999999999999.99'));
      await page.getByLabel('实际成本（元）', { exact: true }).fill(width === 390 ? '50.02' : '50.01');
      await page.getByRole('button', { name: '保存活动', exact: true }).click();
      await waitFor(async () => (await ok('admin', '/crm/campaign/' + management.precision.id)).campaign.actualCost, value => sameMoney(value, width === 390 ? '50.02' : '50.01'), 'Mobile campaign cost was not saved');
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.getByRole('textbox', { name: '搜索营销活动', exact: true }).fill(management.precision.name);
      await page.getByRole('button', { name: management.precision.name, exact: true }).click();
      check('mobile_reopen_restores_saved_cost_' + width, sameMoney((await page.getByLabel('实际成本（元）', { exact: true }).inputValue()).replaceAll(',', ''), width === 390 ? '50.02' : '50.01'));
      await budget.scrollIntoViewIfNeeded();
      await shot('e5-campaign-mobile-' + width, width);
    }
  });
  await prove([2, 21], async () => {
    await page.setViewportSize({ width: 320, height: 844 });
    await page.goto(origin + '/office/crm/target-list', { waitUntil: 'domcontentloaded' });
    await page.getByRole('textbox', { name: '搜索名单', exact: true }).fill(management.queryList.name);
    const row = page.locator('tbody tr').filter({ hasText: management.queryList.name });
    await row.getByRole('button', { name: '查看 / 编辑', exact: true }).click();
    await page.getByRole('combobox', { name: '名单来源', exact: true }).waitFor();
    check('mobile_target_list_restores_saved_query_source', await page.getByRole('combobox', { name: '名单来源', exact: true }).inputValue() === 'QUERY');
    await shot('e5-target-list-mobile-320', 320);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.getByRole('textbox', { name: '搜索名单', exact: true }).fill(management.queryList.name);
    await page.locator('tbody tr').filter({ hasText: management.queryList.name }).getByRole('button', { name: '查看 / 编辑', exact: true }).click();
    await page.getByRole('combobox', { name: '名单来源', exact: true }).waitFor();
    await shot('e5-target-list-desktop', 1440);
  });
  await prove([16, 18, 19], async () => {
    for (const width of [1440, 320]) {
      await page.setViewportSize({ width, height: width === 1440 ? 1000 : 844 });
      await openCampaign(revenue.main);
      await page.getByRole('button', { name: '重算已保存活动的真实成效与收入', exact: true }).click();
      await page.getByText('收入归因已重算', { exact: true }).waitFor();
      const funnel = page.getByRole('group', { name: '营销转化漏斗与阶段明细', exact: true });
      await funnel.scrollIntoViewIfNeeded();
      const current = (await ok('admin', '/crm/campaign/' + revenue.main.id)).campaign;
      const expected = [['发送接纳', 'sentCount'], ['可观察送达', 'deliveredCount'], ['打开观察', 'openedCount'], ['点击观察', 'clickedCount'], ['新增线索', 'leadCreatedCount'], ['创建商机', 'opportunityCreatedCount'], ['赢单商机', 'wonOpportunityCount']];
      const labels = await page.getByLabel('营销转化漏斗阶段明细', { exact: true }).evaluate(element => {
        const bounds = element.getBoundingClientRect();
        return Array.from(element.children).map(row => {
          const term = row.querySelector('dt'); const count = row.querySelector('dd');
          const visible = [term, count].every(part => {
            const range = document.createRange(); range.selectNodeContents(part);
            const text = range.getBoundingClientRect(); const box = part.getBoundingClientRect();
            return text.left >= bounds.left - 1 && text.right <= bounds.right + 1
              && text.left >= box.left - 1 && text.right <= box.right + 1
              && text.top >= box.top - 1 && text.bottom <= box.bottom + 1;
          });
          return { name: term.textContent.trim(), value: count.textContent.trim(), visible };
        });
      });
      check('actual_funnel_all_seven_stage_counts_' + width, labels.length === 7 && expected.every(([name, field], index) => labels[index].name === name && labels[index].value === Number(current[field] || 0).toLocaleString('zh-CN')));
      check('actual_funnel_labels_not_clipped_' + width, labels.every(label => label.visible));
      check('actual_funnel_explains_observed_delivery_' + width, await page.getByText(/可观察送达采用邮件服务器接纳/).isVisible());
      await shot('e5-funnel-' + width, width);
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(origin + '/office/crm/campaign', { waitUntil: 'domcontentloaded' });
    await page.getByRole('textbox', { name: '搜索营销活动', exact: true }).fill('');
    for (const sample of [management.precision, revenue.main]) await page.getByRole('checkbox', { name: '对比' + sample.name, exact: true }).check();
    await page.getByText('活动对比（已选 2 / 6）', { exact: true }).scrollIntoViewIfNeeded();
    check('comparison_displays_two_actual_campaigns', await page.getByText('活动对比（已选 2 / 6）', { exact: true }).isVisible());
    await shot('e5-comparison-desktop', 1440);
    evidence.desktop = true; evidence.mobile = true;
  });
}
