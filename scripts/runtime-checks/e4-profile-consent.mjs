export async function verifyE4Consent(context) {
  const { check, prove, evidence, fixture, marker, ok, api, rejected, lead, readLead, customer, campaign, identifier, own, user, audit, waitFor } = context;
  let optedLead, ordinaryLead, optedCustomer, ordinaryCustomer, activity;
  await prove([12, 14], async () => {
    optedLead = await lead('已退订线索', { unsubscribeFlag: 1 });
    ordinaryLead = await lead('正常营销线索');
    optedCustomer = await customer('已退订客户', { unsubscribeFlag: 1, email: marker.toLowerCase() + '.opted@example.test' });
    ordinaryCustomer = await customer('正常营销客户', { unsubscribeFlag: 0, email: marker.toLowerCase() + '.ordinary@example.test' });
    const members = [{ memberType: 'LEAD', memberRefId: optedLead.id }, { memberType: 'LEAD', memberRefId: ordinaryLead.id },
      { memberType: 'CUSTOMER', memberRefId: optedCustomer.id }, { memberType: 'CUSTOMER', memberRefId: ordinaryCustomer.id }];
    const list = await ok('sales', '/crm/target-list', 'POST', { list: { listCode: marker + '_CONSENT', listName: marker + '_营销退订核验', ownerId: user('sales'), sourceType: 'MANUAL', status: 'ACTIVE' }, members });
    const listId = own('list', list.listId); fixture.lists.push({ id: listId, members });
    activity = await campaign('营销退订');
    await ok('sales', '/crm/campaign', 'POST', { campaign: activity.actual, targetLists: [{ listId, isExcludingFlag: 0 }] });
    const audience = () => ok('sales', '/crm/campaign/' + activity.id + '/audience');
    let actual = await audience();
    const expectedRecipients = ['LEAD:' + ordinaryLead.id, 'CUSTOMER:' + ordinaryCustomer.id];
    check('actual_marketing_audience_excludes_opted_out_lead_and_customer', actual.includedCount === 4 && actual.optedOutCount === 2 && actual.recipientCount === 2
      && actual.members.length === 2 && actual.members.every(value => expectedRecipients.includes(value.memberType + ':' + value.memberRefId)));
    let current = await readLead(optedLead);
    check('opted_out_lead_records_actual_unsubscribe_time', current.unsubscribeFlag === 1 && current.unsubscribeTime != null);
    await ok('sales', '/crm/lead/' + optedLead.id + '/unsubscribe', 'POST', { version: current.version, unsubscribeFlag: 0 });
    current = await readLead(optedLead); actual = await audience();
    check('resubscription_clears_time_and_immediately_returns_to_audience', current.unsubscribeFlag === 0 && current.unsubscribeTime == null
      && actual.recipientCount === 3 && actual.optedOutCount === 1 && actual.members.some(value => value.memberType === 'LEAD' && String(value.memberRefId) === optedLead.id));
    const stable = JSON.stringify(current);
    rejected(await api('sales', '/crm/lead/' + optedLead.id + '/unsubscribe', { method: 'POST', body: { version: current.version, unsubscribeFlag: 2 } }),
      'invalid_consent_flag_is_rejected', /开关只能为0或1/);
    check('invalid_consent_flag_keeps_entire_lead', JSON.stringify(await readLead(optedLead)) === stable);
    await ok('sales', '/crm/lead/' + optedLead.id + '/unsubscribe', 'POST', { version: current.version, unsubscribeFlag: 1 });
    const restored = await readLead(optedLead);
    rejected(await api('sales', '/crm/lead/' + optedLead.id + '/unsubscribe', { method: 'POST', body: { version: current.version, unsubscribeFlag: 0 } }),
      'stale_consent_update_is_rejected', /^线索已修改，请刷新后重试$/);
    check('stale_consent_update_preserves_latest_time_and_entire_lead', JSON.stringify(await readLead(optedLead)) === JSON.stringify(restored));
    const customerView = await ok('sales', '/crm/customer/' + ordinaryCustomer.id + '/workspace');
    await ok('sales', '/crm/customer/' + ordinaryCustomer.id + '/unsubscribe', 'POST', { version: customerView.customer.version, unsubscribeFlag: 1 });
    actual = await audience();
    check('customer_unsubscribe_immediately_removes_existing_list_member', actual.recipientCount === 1 && actual.optedOutCount === 3
      && actual.members[0].memberType === 'LEAD' && String(actual.members[0].memberRefId) === ordinaryLead.id);
    for (const actor of ['manager', 'readonly', 'foreign']) rejected(await api(actor, '/crm/lead/' + optedLead.id + '/unsubscribe', { method: 'POST', body: { version: restored.version, unsubscribeFlag: 0 } }),
      actor + '_cannot_change_another_owners_consent', /权限|无权|不存在|负责人/);
    check('denied_consent_updates_do_not_change_marketing_audience', (await audience()).recipientCount === 1);
    const leadAudits = await waitFor(() => audit('CRM_MARKETING_CONSENT', 'CRM_LEAD', optedLead.id), values => values.length === 3, 'Create, resubscribe and unsubscribe audits missing');
    const customerAudits = await waitFor(() => audit('CRM_MARKETING_CONSENT', 'CRM_CUSTOMER', ordinaryCustomer.id), values => values.length === 1, 'Customer unsubscribe audit missing');
    check('all_consent_changes_are_auditable_with_operator_and_risk', [...leadAudits, ...customerAudits].every(value => value.actor && Number(value.risk) === 1)
      && leadAudits.some(value => value.detail === '退订=0') && leadAudits.filter(value => value.detail === '退订=1').length === 2);
    check('unsubscribed_lead_can_still_be_qualified_for_normal_business', (await context.qualification(optedLead, 'qualify')).qualificationStatus === 'QUALIFIED');
    const leadId = identifier(await ok('sales', '/crm/lead/convert', 'POST', { leadId: optedLead.id, customerName: marker + '_退订仍可转化', createOpportunity: false }));
    own('customer', leadId);
    check('unsubscribed_lead_converts_and_customer_keeps_optout', (await ok('sales', '/crm/customer/' + leadId + '/workspace')).customer.unsubscribeFlag === 1);
    fixture.consentCases = { optedLead: optedLead.id, ordinaryLead: ordinaryLead.id, optedCustomer: optedCustomer.id, ordinaryCustomer: ordinaryCustomer.id,
      convertedCustomer: leadId, campaign: activity.id, list: listId, finalRecipients: 1, externalDeliveryAttempted: false };
    evidence.consent = true; evidence.audits = true; evidence.permissions = true;
  });
  return { optedLead, ordinaryLead, optedCustomer, ordinaryCustomer, campaign: activity };
}
