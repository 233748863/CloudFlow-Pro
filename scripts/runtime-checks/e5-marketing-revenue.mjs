import assert from 'node:assert/strict';

export async function verifyE5Revenue(context, mail) {
  const { check, prove, fixture, evidence, campaign, lead, convert, readCampaign, recalculate, saveCampaign, ok, api, rejected,
    database, rows, sql, own, day, waitFor, sameMoney, refund, fixtureWrite, user } = context;
  const main = { id: String(mail.main.campaignId), actor: 'admin', name: mail.main.campaignName };
  const win = async conversion => {
    const opportunity = await ok(conversion.actor, '/crm/opportunity/' + conversion.opportunityId);
    await ok(conversion.actor, '/crm/opportunity/' + conversion.opportunityId + '/win', 'POST', { version: opportunity.version });
    const saved = await ok(conversion.actor, '/crm/opportunity/' + conversion.opportunityId);
    check('actual_opportunity_won_' + conversion.opportunityId, saved.stage === 'WON');
    const contract = await waitFor(() => rows("SELECT JSON_OBJECT('id',CAST(contract_id AS CHAR),'source',source_type,'sourceId',CAST(source_id AS CHAR),'customer',CAST(customer_id AS CHAR),'status',status) FROM oa_contract WHERE tenant_id=100000 AND source_type='CRM_OPPORTUNITY' AND source_id=" + conversion.opportunityId + ' AND deleted=0;'),
      values => values.length === 1, 'Won opportunity did not create its actual source contract');
    check('actual_contract_inherits_opportunity_and_customer', contract[0].sourceId === conversion.opportunityId && contract[0].customer === conversion.customerId && contract[0].status === 'DRAFT');
    return own('contract', contract[0].id);
  };
  const receivable = async (conversion, contractId, suffix, amount) => {
    const name = context.marker + '_' + suffix;
    await ok('admin', '/crm/receivable', 'POST', { receivableNo: name, receivableName: name, customerId: conversion.customerId,
      ownerId: user('admin'), plannedAmount: amount, dueDate: day(30), ...(contractId ? { contractId } : {}) });
    return own('receivable', database('SELECT receivable_id FROM crm_receivable WHERE tenant_id=100000 AND receivable_no=' + sql(name) + ' AND deleted=0;'));
  };
  const events = id => rows("SELECT JSON_OBJECT('id',CAST(event_id AS CHAR),'amount',CAST(amount AS CHAR),'reversal',CAST(reversal_of_id AS CHAR),'source',event_key,'snapshot',source_snapshot) FROM crm_deal_event WHERE tenant_id=100000 AND biz_type='RECEIVABLE' AND biz_id=" + id + ' ORDER BY event_id;');
  const collect = async (id, amount) => {
    const current = await ok('admin', '/crm/receivable/' + id);
    await ok('admin', '/crm/receivable/' + id + '/writeoff', 'POST', { version: current.version, amount, writeoffDate: day(), remark: context.marker + '_逐笔到账_' + current.version });
    const last = events(id).at(-1);
    check('actual_receipt_event_' + id + '_' + current.version, last?.reversal == null && sameMoney(last.amount, amount));
    fixture.receipts.push({ receivableId: id, eventId: last.id, amount }); return last;
  };
  const expectRevenue = async (sample, income, roi, label) => {
    const current = await recalculate(sample);
    check(label + '_actual_receipt_sum', typeof current.revenue === 'string' && sameMoney(current.revenue, income));
    check(label + '_exact_roi', roi === null ? current.roi === null : typeof current.roi === 'string' && current.roi === roi);
    fixture.measurements.push({ kind: 'revenue', label, campaignId: sample.id, income: current.revenue, roi: current.roi }); return current;
  };
  let conversion, source, contractId, receivableId;
  await prove([15, 16, 18, 19], async () => {
    source = await lead('源自真实邮件活动', { campaignId: main.id });
    conversion = await convert(source, '200.03');
    const originalLead = await ok('admin', '/crm/lead/' + source.id);
    const opportunity = await ok('admin', '/crm/opportunity/' + conversion.opportunityId);
    check('actual_campaign_lead_conversion_inherits_source', String(originalLead.campaignId) === main.id && String(opportunity.campaignId) === main.id
      && String(originalLead.convertedCustomerId) === conversion.customerId);
    let actual = await expectRevenue(main, '0.00', '-1.0000', 'before_won');
    check('created_source_contributes_one_lead_and_opportunity', actual.leadCreatedCount === 1 && actual.opportunityCreatedCount === 1 && actual.wonOpportunityCount === 0);
    contractId = await win(conversion);
    receivableId = await receivable(conversion, contractId, '营销合同应收', '200.03');
    await expectRevenue(main, '0.00', '-1.0000', 'won_without_receipt');
    const first = await collect(receivableId, '30.01');
    await expectRevenue(main, '30.01', '-0.3998', 'first_actual_receipt');
    const second = await collect(receivableId, '20.02');
    actual = await expectRevenue(main, '50.03', '0.0006', 'two_actual_receipts');
    const unchanged = JSON.stringify(events(receivableId));
    const unrelated = await receivable(conversion, null, '未关联合同应收', '10.00');
    await collect(unrelated, '10.00');
    await expectRevenue(main, '50.03', '0.0006', 'unlinked_receipt_excluded');
    await saveCampaign(main, { actualCost: '0.00' });
    await expectRevenue(main, '50.03', null, 'zero_cost_roi_undefined');
    await saveCampaign(main, { actualCost: '50.00' });
    for (const [event, amount, income, roi] of [[second, '5.01', '45.02', '-0.0996'], [second, '15.01', '30.01', '-0.3998'], [first, '30.01', '0.00', '-1.0000']]) {
      const before = events(receivableId), submitted = await refund(receivableId, event.id, amount);
      const after = events(receivableId), newEvents = after.filter(value => !before.some(old => old.id === value.id));
      check('approved_refund_' + submitted.id + '_only_selected_receipt', newEvents.length === 1 && newEvents[0].reversal === event.id && sameMoney(newEvents[0].amount, '-' + amount));
      check('approved_refund_' + submitted.id + '_receivable_updated', sameMoney((await ok('admin', '/crm/receivable/' + receivableId)).receivedAmount, income));
      await expectRevenue(main, income, roi, 'refund_' + submitted.id);
    }
    check('refunds_keep_original_receipt_facts', JSON.stringify(events(receivableId).filter(value => value.reversal == null)) === unchanged);
    const lastRefund = fixture.refunds.at(-1), beforeReplay = JSON.stringify(events(receivableId));
    rejected(await api('reviewer', '/workflow/wf/complete', { method: 'POST', body: { taskId: lastRefund.stages.at(-1).task, action: 'APPROVE', comment: context.marker + '_重复回执' } }), 'completed_refund_task_cannot_repeat');
    check('duplicate_completed_task_preserves_revenue_facts', JSON.stringify(events(receivableId)) === beforeReplay);
    const counts = Object.fromEntries(rows("SELECT JSON_OBJECT('action',event.action,'amount',COUNT(*)) FROM crm_campaign_log event JOIN crm_mass_email_recipient recipient ON recipient.tenant_id=event.tenant_id AND recipient.mass_email_id=event.mass_email_id AND recipient.campaign_id=event.campaign_id AND event.source_event_key=CONCAT('MAIL:',recipient.recipient_id,':',event.action) WHERE event.tenant_id=100000 AND event.campaign_id=" + main.id + " AND event.test_flag=0 AND recipient.test_flag=0 GROUP BY event.action;").map(value => [value.action, value.amount]));
    actual = await recalculate(main);
    for (const [action, field] of [['SENT', 'sentCount'], ['DELIVERED', 'deliveredCount'], ['OPENED', 'openedCount'], ['CLICKED', 'clickedCount'], ['UNSUBSCRIBED', 'unsubscribedCount']]) {
      check('funnel_actual_' + action + '_count', actual[field] === (counts[action] || 0));
    }
    check('funnel_business_stages_match_actual_source', actual.leadCreatedCount === 1 && actual.opportunityCreatedCount === 1 && actual.wonOpportunityCount === 1);
    const repeated = await recalculate(main);
    check('repeated_recalculation_keeps_all_business_counters', ['sentCount', 'deliveredCount', 'openedCount', 'clickedCount', 'leadCreatedCount', 'opportunityCreatedCount', 'wonOpportunityCount', 'revenue', 'roi'].every(field => actual[field] === repeated[field]));
    evidence.attribution = true; evidence.revenue = true; evidence.reports = true;
  });
  await prove([16, 17, 18, 19], async () => {
    const window = await campaign('归因边界', { startDate: day(-60), endDate: day(-30), actualCost: '1.00' });
    const windowLead = await lead('归因边界线索', { campaignId: window.id });
    const converted = await convert(windowLead, '1.01');
    const sourceContract = await win(converted), planned = await receivable(converted, sourceContract, '归因边界应收', '1.01');
    await collect(planned, '1.01');
    const start = window.actual.startDate, end = window.actual.endDate;
    const boundaries = [
      [database('SELECT DATE_FORMAT(DATE_SUB(' + sql(start + ' 00:00:00') + ",INTERVAL 1 SECOND),'%Y-%m-%d %H:%i:%s');"), '0.00', 0, 'before_start'],
      [start + ' 00:00:00', '1.01', 1, 'at_start'],
      [database('SELECT DATE_FORMAT(DATE_ADD(' + sql(end + ' 23:59:59') + ",INTERVAL 30 DAY),'%Y-%m-%d %H:%i:%s');"), '1.01', 1, 'last_window_second'],
      [database('SELECT DATE_FORMAT(DATE_ADD(' + sql(end + ' 00:00:00') + ",INTERVAL 31 DAY),'%Y-%m-%d %H:%i:%s');"), '0.00', 0, 'next_day_excluded'],
    ];
    check('formal_attribution_window_is_thirty_days', database("SELECT config_value FROM sys_config WHERE tenant_id=100000 AND config_key='crm.campaign.attribution.window.days' AND config_scope='1';") === '30');
    for (const [timestamp, income, count, label] of boundaries) {
      fixtureWrite('crm_lead', windowLead.id, 'UPDATE crm_lead SET create_time=' + sql(timestamp) + ' WHERE tenant_id=100000 AND lead_id=' + windowLead.id + ';', '仅本轮样本归因时间边界：' + label);
      const actual = await recalculate(window);
      check('attribution_' + label + '_exact_revenue_and_funnel', sameMoney(actual.revenue, income) && actual.leadCreatedCount === count && actual.opportunityCreatedCount === count && actual.wonOpportunityCount === count);
      fixture.measurements.push({ kind: 'attribution_boundary', campaignId: window.id, leadId: windowLead.id, timestamp, income, count, systemClockChanged: false });
    }
    fixtureWrite('crm_lead', windowLead.id, 'UPDATE crm_lead SET create_time=' + sql(start + ' 00:00:00') + ' WHERE tenant_id=100000 AND lead_id=' + windowLead.id + ';', '保留可核对的窗口内样本');
    await recalculate(window);
    fixture.revenue = { campaignId: main.id, leadId: source.id, opportunityId: conversion.opportunityId, contractId, receivableId, finalIncome: '0.00', refunds: 3, actualWorkflow: true, windowCampaignId: window.id };
  });
  return { main, conversion, source };
}
