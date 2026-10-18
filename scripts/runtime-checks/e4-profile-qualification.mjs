export async function verifyE4Qualification(context, tree) {
  const { check, prove, evidence, fixture, marker, ok, api, rows, sql, rejected, lead, readLead, qualification, campaign, user, identifier, sameMoney, own, audit, waitFor } = context;
  const qualificationFields = ['qualificationStatus', 'qualifiedBy', 'qualifiedByName', 'qualifiedTime', 'disqualifyReason'];
  const snapshot = sample => context.database('SELECT * FROM crm_lead WHERE lead_id=' + sample.id + ';');
  const conversionCounts = () => context.database('SELECT (SELECT COUNT(*) FROM crm_customer),(SELECT COUNT(*) FROM crm_contact),(SELECT COUNT(*) FROM crm_opportunity);');
  let sourceCampaign, sample, converted, customers, contact, opportunity;
  await prove(1, async () => {
    sourceCampaign = await campaign('画像来源');
    sample = await lead('完整画像', { territoryId: tree.leaf.id, marketSegment: 'ENTERPRISE', employeeScale: '1000+', annualRevenue: '99999999999999.99',
      jobTitle: '采购负责人', website: 'https://profile.example.test', campaignId: sourceCampaign.id, unsubscribeFlag: 1,
      mobile: '13800138017', phone: '021-55550117', qualificationStatus: 'QUALIFIED', qualifiedBy: user('manager'), qualifiedByName: '伪造判定人',
      qualifiedTime: '2020-01-01 00:00:00', leadScore: 999, scoreUpdatedTime: '2020-01-01 00:00:00', disqualifyReason: '伪造原因', remark: marker + '_原始备注' });
    const actual = await readLead(sample);
    check('profile_fields_survive_actual_create_and_query', String(actual.territoryId) === tree.leaf.id && actual.marketSegment === 'ENTERPRISE'
      && actual.employeeScale === '1000+' && typeof actual.annualRevenue === 'string' && sameMoney(actual.annualRevenue, '99999999999999.99') && actual.jobTitle === '采购负责人'
      && actual.website === 'https://profile.example.test' && String(actual.campaignId) === sourceCampaign.id);
    check('create_cannot_forge_qualification_or_score_metadata', actual.qualificationStatus === 'UNQUALIFIED' && actual.qualifiedBy == null
      && actual.qualifiedByName == null && actual.qualifiedTime == null && actual.disqualifyReason == null && actual.leadScore === 35
      && actual.scoreUpdatedTime != null && !String(actual.scoreUpdatedTime).startsWith('2020-01-01'));
    check('create_unsubscribe_has_server_timestamp', actual.unsubscribeFlag === 1 && actual.unsubscribeTime != null);
    const rowsBefore = context.database("SELECT COUNT(*) FROM crm_lead WHERE lead_no LIKE " + sql(marker + '%') + ';');
    for (const [label, fields] of [['invalid_segment', { marketSegment: 'NOT_A_SEGMENT' }], ['invalid_scale', { employeeScale: 'NOT_A_SCALE' }],
      ['negative_revenue', { annualRevenue: '-0.01' }], ['fractional_cent', { annualRevenue: '0.001' }],
      ['too_large_revenue', { annualRevenue: '100000000000000.00' }], ['foreign_territory', { territoryId: tree.foreign.id }],
      ['inactive_territory', { territoryId: fixture.territoryCases.inactive }]]) {
      rejected(await api('sales', '/crm/lead', { method: 'POST', body: { leadNo: marker + '_' + label, leadName: marker + '_' + label, ownerId: user('sales'), ...fields } }),
        'profile_' + label + '_is_rejected', /字典|金额|区域/);
    }
    check('invalid_profile_creates_leave_no_partial_leads', rowsBefore === context.database("SELECT COUNT(*) FROM crm_lead WHERE lead_no LIKE " + sql(marker + '%') + ';'));
    const previous = snapshot(sample);
    rejected(await api('manager', '/crm/territory/' + tree.leaf.id, { method: 'DELETE' }), 'territory_in_use_cannot_be_deleted', /已被线索或客户使用/);
    check('referenced_territory_delete_keeps_profile', snapshot(sample) === previous);
    evidence.profileFields = true;
  });
  await prove([2, 3, 4, 5, 14], async () => {
    const tryConversion = async (item, state) => {
      const before = snapshot(item), counts = conversionCounts();
      rejected(await api(item.actor, '/crm/lead/convert', { method: 'POST', body: { leadId: item.id, customerName: marker + '_非法转化_' + state } }),
        state + '_cannot_convert', /尚未通过资质评估/);
      check(state + '_conversion_preserves_lead_and_creates_no_customer_contact_or_opportunity', before === snapshot(item) && counts === conversionCounts());
    };
    await tryConversion(sample, 'UNQUALIFIED');
    let current = await readLead(sample);
    for (const [label, reason] of [['empty', ''], ['blank', '   '], ['too_long', '资'.repeat(501)]]) {
      const before = snapshot(sample);
      rejected(await api('sales', '/crm/lead/' + sample.id + '/disqualify', { method: 'POST', body: { version: current.version, disqualifyReason: reason } }),
        'disqualification_' + label + '_reason_is_rejected', /不合格原因/);
      check('disqualification_' + label + '_keeps_entire_lead', snapshot(sample) === before);
    }
    const assessing = await qualification(sample, 'start-qualifying');
    check('start_qualifying_sets_only_assessment_state', assessing.qualificationStatus === 'QUALIFYING' && assessing.version === current.version + 1
      && assessing.qualifiedBy == null && assessing.qualifiedTime == null);
    await tryConversion(sample, 'QUALIFYING');
    const beforeStale = snapshot(sample);
    rejected(await api('sales', '/crm/lead/' + sample.id + '/qualify', { method: 'POST', body: { version: current.version, comment: '过期判定' } }),
      'stale_qualification_version_is_rejected', /^线索已修改，请刷新后重试$/);
    check('stale_qualification_keeps_entire_lead', snapshot(sample) === beforeStale);
    const qualified = await qualification(sample, 'qualify');
    check('qualify_records_actual_actor_name_and_time', qualified.qualificationStatus === 'QUALIFIED' && String(qualified.qualifiedBy) === user('sales')
      && typeof qualified.qualifiedByName === 'string' && qualified.qualifiedByName.length > 0 && qualified.qualifiedTime != null && qualified.disqualifyReason == null);
    const disqualified = await qualification(sample, 'disqualify', { disqualifyReason: marker + '_预算条件未满足' });
    check('disqualify_persists_reason_actor_and_time', disqualified.qualificationStatus === 'DISQUALIFIED' && disqualified.disqualifyReason === marker + '_预算条件未满足'
      && String(disqualified.qualifiedBy) === user('sales') && disqualified.qualifiedTime != null);
    await tryConversion(sample, 'DISQUALIFIED');
    rejected(await api('sales', '/crm/lead/' + sample.id + '/qualify', { method: 'POST', body: { version: disqualified.version, comment: '跳过重评' } }),
      'disqualified_must_start_reassessment_before_qualification', /须先重新开始评估/);
    const reassessing = await qualification(sample, 'start-qualifying');
    check('reassessment_clears_previous_decision_metadata', reassessing.qualificationStatus === 'QUALIFYING'
      && ['qualifiedBy', 'qualifiedByName', 'qualifiedTime', 'disqualifyReason'].every(field => reassessing[field] == null));
    await qualification(sample, 'qualify');
    current = await readLead(sample);
    const currentSnapshot = snapshot(sample);
    for (const actor of ['manager', 'readonly', 'employee', 'foreign']) {
      rejected(await api(actor, '/crm/lead/' + sample.id + '/disqualify', { method: 'POST', body: { version: current.version, disqualifyReason: marker + '_越权' } }),
        actor + '_cannot_qualify_another_owners_lead', /无权|权限|不存在|负责人/);
      check(actor + '_rejected_qualification_preserves_entire_lead', snapshot(sample) === currentSnapshot);
    }
    const events = await waitFor(() => audit('CRM_LEAD_QUALIFICATION', 'CRM_LEAD', sample.id), values => values.length === 5, 'Five real qualification audits were not persisted');
    check('all_qualification_actions_have_durable_audits', events.length === 5 && events.every(value => Number(value.risk) === 1 && value.actor)
      && events.some(value => value.detail.includes(marker + '_预算条件未满足')));
    evidence.qualification = true; evidence.conversionGuard = true; evidence.audits = true; evidence.permissions = true;
  });
  await prove([1, 8, 14], async () => {
    const previous = await readLead(sample);
    const conversion = { leadId: sample.id, customerName: marker + '_转化客户', createOpportunity: true, opportunityName: marker + '_转化商机',
      expectedAmount: '12345.67', expectedSignDate: context.day(30), remark: marker + '_转化备注' };
    const beforeOversized = snapshot(sample), beforeOversizedCounts = conversionCounts();
    rejected(await api('sales', '/crm/lead/convert', { method: 'POST', body: { ...conversion, expectedAmount: '1000000000000.00' } }),
      'conversion_rejects_opportunity_amount_beyond_twelve_integer_digits', /商机预计金额.*12位整数和2位小数/);
    check('oversized_conversion_rolls_back_customer_contact_opportunity_and_source', snapshot(sample) === beforeOversized && conversionCounts() === beforeOversizedCounts);
    const customerId = identifier(await ok('sales', '/crm/lead/convert', 'POST', conversion));
    own('customer', customerId);
    converted = await readLead(sample);
    check('conversion_keeps_source_lead_and_customer_link', converted.status === 'CONVERTED' && String(converted.convertedCustomerId) === customerId
      && converted.convertedTime != null && qualificationFields.every(field => converted[field] === previous[field]));
    const detail = await ok('sales', '/crm/customer/' + customerId + '/workspace');
    const client = detail.customer;
    check('conversion_maps_all_eight_profile_and_attribution_fields', ['territoryId', 'marketSegment', 'industry', 'employeeScale', 'source', 'campaignId', 'unsubscribeFlag']
      .every(field => String(client[field]) === String(previous[field])) && typeof client.annualRevenue === 'string' && sameMoney(client.annualRevenue, previous.annualRevenue));
    check('conversion_keeps_website_contact_channels_and_combines_remarks', client.website === previous.website && client.phone === previous.mobile
      && context.encryptedFixtureEquals('customer', customerId, 'email', sample.supplied.email) && client.remark === marker + '_原始备注；' + marker + '_转化备注');
    const contactRows = rows("SELECT JSON_OBJECT('id',CAST(contact_id AS CHAR),'name',contact_name,'mobile',mobile,'phone',phone,'email',email,'position',position,'primary',primary_flag) FROM crm_contact WHERE customer_id=" + customerId + ' AND deleted=0;');
    check('conversion_creates_exact_contact_from_source_fields', contactRows.length === 1 && contactRows[0].name === previous.contactName
      && contactRows[0].phone === sample.supplied.phone && contactRows[0].position === previous.jobTitle && contactRows[0].primary === 1);
    contact = contactRows[0]; own('contact', contact.id);
    check('converted_contact_preserves_full_encrypted_mobile_and_email', context.encryptedFixtureEquals('contact', contact.id, 'mobile', sample.supplied.mobile)
      && context.encryptedFixtureEquals('contact', contact.id, 'email', sample.supplied.email));
    const opportunities = rows("SELECT JSON_OBJECT('id',CAST(opportunity_id AS CHAR),'customer',CAST(customer_id AS CHAR),'contact',CAST(contact_id AS CHAR),'campaign',CAST(campaign_id AS CHAR),'source',source,'amount',CAST(expected_amount AS CHAR),'owner',CAST(owner_id AS CHAR)) FROM crm_opportunity WHERE customer_id=" + customerId + ' AND deleted=0;');
    check('optional_opportunity_keeps_source_and_exact_amount', opportunities.length === 1 && opportunities[0].customer === customerId && opportunities[0].contact === contact.id
      && opportunities[0].campaign === sourceCampaign.id && opportunities[0].source === previous.source && opportunities[0].owner === user('sales') && sameMoney(opportunities[0].amount, '12345.67'));
    opportunity = opportunities[0]; own('opportunity', opportunity.id);
    const count = conversionCounts(), sourceSnapshot = snapshot(sample);
    check('repeated_conversion_returns_same_customer', identifier(await ok('sales', '/crm/lead/convert', 'POST', conversion)) === customerId);
    check('repeated_conversion_keeps_all_records', conversionCounts() === count && snapshot(sample) === sourceSnapshot);
    rejected(await api('sales', '/crm/lead/' + sample.id + '/start-qualifying', { method: 'POST', body: { version: converted.version } }),
      'converted_lead_cannot_be_reassessed', /已转化线索不能重新评估/);
    check('rejected_converted_reassessment_preserves_source', snapshot(sample) === sourceSnapshot);
    fixture.conversions.push({ lead: sample.id, customer: customerId, contact: contact.id, opportunity: opportunity.id, exactRevenue: '99999999999999.99' });
    customers = { id: customerId, actor: 'sales', tenant: '100000', code: client.customerCode, actual: client };
    fixture.customers.push(customers);
    evidence.conversionMapping = true;
  });
  return { sample, converted, customer: customers, contact, opportunity, campaign: sourceCampaign };
}
