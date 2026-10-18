export async function verifyE4Scoring(context) {
  const { check, prove, evidence, fixture, marker, ok, api, rejected, lead, readLead, qualification, scoreRule, rows, sql, waitFor } = context;
  const supplied = { annualRevenue: '120.01', employeeScale: '11-50', industry: 'FINANCE', jobTitle: '采购负责人', website: '', companyName: marker + '_ScoreAlpha' };
  const stateFields = ['qualificationStatus', 'qualifiedBy', 'qualifiedByName', 'qualifiedTime', 'disqualifyReason'];
  let sample, rules, batchLeads;
  await prove(9, async () => {
    const originalRules = JSON.stringify(await ok('manager', '/crm/lead-score/rules'));
    const base = { ruleName: marker + '_非法评分规则', fieldName: 'annual_revenue', operator: '>=', fieldValue: '0', score: 1 };
    for (const [name, fields] of [['missing_field', { fieldName: null }], ['missing_operator', { operator: null }],
      ['unknown_field', { fieldName: 'password' }], ['unknown_operator', { operator: 'EXECUTE' }],
      ['missing_score', { score: null }], ['missing_value', { fieldValue: '' }],
      ['text_comparison', { fieldName: 'company_name', operator: '>' }], ['numeric_contains', { operator: 'CONTAINS' }],
      ['invalid_number', { fieldValue: '12xx' }], ['invalid_set', { operator: 'IN', fieldValue: '1,,2' }]]) {
      rejected(await api('manager', '/crm/lead-score/rule', { method: 'POST', body: { ...base, ...fields } }), 'invalid_score_rule_' + name, /评分|数值|比较值|大小比较/);
      check('invalid_score_rule_' + name + '_keeps_rule_catalog', JSON.stringify(await ok('manager', '/crm/lead-score/rules')) === originalRules);
    }
    const definitions = [
      ['eq', 'annual_revenue', '=', '120.01', 1], ['ne', 'annual_revenue', '!=', '120.00', 2],
      ['gt', 'annual_revenue', '>', '120.00', 4], ['ge', 'annual_revenue', '>=', '120.01', 8],
      ['lt', 'annual_revenue', '<', '120.02', 16], ['le', 'annual_revenue', '<=', '120.01', 32],
      ['in', 'annual_revenue', 'IN', '119, 120.01', 64], ['not_in', 'annual_revenue', 'NOT_IN', '0, 1', 128],
      ['contains', 'company_name', 'CONTAINS', 'scorealpha', 256], ['empty', 'website', 'IS_EMPTY', '', 512],
      ['not_empty', 'job_title', 'IS_NOT_EMPTY', '', 1024], ['deduction', 'employee_scale', '=', '11-50', -5]
    ];
    rules = [];
    for (const [name, fieldName, operator, fieldValue, score] of definitions) rules.push(await scoreRule(name, { fieldName, operator, fieldValue, score }));
    await scoreRule('disabled', { fieldName: 'company_name', operator: 'CONTAINS', fieldValue: marker, score: 999, enabledFlag: 0 });
    sample = await lead('评分主体', supplied);
    check('all_eleven_score_operators_accumulate_and_disabled_rule_is_ignored', (await readLead(sample)).leadScore === 2042);
    const original = await ok('manager', '/crm/lead-score/rules'), editable = original.find(value => String(value.ruleId) === rules[8].id);
    await ok('manager', '/crm/lead-score/rule', 'POST', { ...editable, score: 257 });
    const after = await ok('manager', '/crm/lead-score/rules');
    check('score_rule_edit_preserves_other_rules_and_increments_version', after.find(value => String(value.ruleId) === rules[8].id).version === editable.version + 1
      && original.filter(value => String(value.ruleId) !== rules[8].id).every(value => JSON.stringify(value) === JSON.stringify(after.find(row => row.ruleId === value.ruleId))));
    rejected(await api('manager', '/crm/lead-score/rule', { method: 'POST', body: { ...editable, score: 999 } }), 'stale_score_rule_edit_is_rejected', /^记录已被修改，请刷新后重试$/);
    check('stale_score_edit_preserves_entire_catalog', JSON.stringify(await ok('manager', '/crm/lead-score/rules')) === JSON.stringify(after));
    for (const actor of ['sales', 'readonly']) rejected(await api(actor, '/crm/lead-score/rule', { method: 'POST', body: base }),
      actor + '_cannot_maintain_score_rules', /权限|无权/);
    check('rule_configuration_does_not_silently_rewrite_existing_lead_scores', (await readLead(sample)).leadScore === 2042);
    evidence.scoring = true;
  });
  await prove([9, 11], async () => {
    await qualification(sample, 'qualify');
    const qualified = await readLead(sample);
    check('single_recalculate_returns_updated_score', await ok('sales', '/crm/lead-score/' + sample.id + '/recalculate', 'POST') === 2043);
    const recalculated = await readLead(sample);
    check('single_score_recalculation_preserves_all_qualification_metadata', recalculated.leadScore === 2043
      && recalculated.version === qualified.version + 1 && stateFields.every(field => recalculated[field] === qualified[field]));
    await ok('sales', '/crm/lead', 'PUT', { ...recalculated, annualRevenue: '119.00', companyName: marker + '_ScoreBeta', website: 'https://score.example.test', jobTitle: '',
      qualificationStatus: 'DISQUALIFIED', qualifiedBy: context.user('manager'), qualifiedByName: '伪造判定人', qualifiedTime: '2020-01-01 00:00:00',
      disqualifyReason: '伪造不合格原因', leadScore: 999999, scoreUpdatedTime: '2020-01-01 00:00:00' });
    const updated = await readLead(sample);
    check('normal_profile_edit_recalculates_exact_nonmatching_rules', updated.leadScore === 237);
    check('normal_profile_edit_preserves_qualification_and_cannot_forge_it', stateFields.every(field => updated[field] === qualified[field]));
    evidence.scoring = true;
  });
  await prove([10, 11], async () => {
    batchLeads = [await lead('批量甲', supplied), await lead('批量乙', supplied), await lead('批量丙', supplied)];
    await qualification(batchLeads[0], 'qualify');
    await qualification(batchLeads[1], 'disqualify', { disqualifyReason: marker + '_人工判定' });
    await qualification(batchLeads[2], 'start-qualifying');
    const before = await Promise.all(batchLeads.map(readLead));
    const rule = (await ok('manager', '/crm/lead-score/rules')).find(value => String(value.ruleId) === rules[8].id);
    await ok('manager', '/crm/lead-score/rule', 'POST', { ...rule, score: 254 });
    const identifiers = batchLeads.map(value => value.id);
    const eventId = await ok('sales', '/crm/lead-score/batch', 'POST', [...identifiers, identifiers[0]]);
    check('batch_returns_durable_event_identifier', typeof eventId === 'string' && /^[a-zA-Z0-9-]+$/.test(eventId));
    const event = await waitFor(() => rows("SELECT JSON_OBJECT('event',event_id,'status',status,'tenant',CAST(tenant_id AS CHAR),'type',event_type,'payload',payload_json) FROM outbox_event WHERE event_id=" + sql(eventId) + ';')[0],
      value => value?.status === 'PUBLISHED', 'Actual batch outbox event was not published', 90000);
    const payload = JSON.parse(event.payload), submitted = typeof payload.payload === 'string' ? JSON.parse(payload.payload) : payload.payload;
    check('batch_event_preserves_tenant_and_deduplicates_lead_ids', event.tenant === '100000' && event.type === 'CRM_LEAD_SCORE_RECALC'
      && submitted.length === 3 && new Set(submitted.map(String)).size === 3 && identifiers.every(id => submitted.map(String).includes(id)));
    const completed = await waitFor(() => Promise.all(batchLeads.map(readLead)), values => values.every(value => value.leadScore === 2040), 'Asynchronous consumer did not recalculate all requested leads', 90000);
    check('asynchronous_batch_updates_each_lead_once_and_keeps_manual_qualification', completed.every((value, index) => value.version === before[index].version + 1
      && stateFields.every(field => value[field] === before[index][field])));
    fixture.batches.push({ eventId, leadIds: identifiers, actualConsumer: true, noDirectDatabaseScoreWrites: true });
    for (const [label, ids] of [['empty', []], ['over_limit', Array.from({ length: 501 }, () => identifiers[0])]]) {
      rejected(await api('sales', '/crm/lead-score/batch', { method: 'POST', body: ids }), label + '_batch_size_is_rejected', /1至500/);
    }
    const outside = await lead('其他部门评分', supplied, 'other'), foreign = await lead('其他租户评分', { annualRevenue: '120.01' }, 'foreign');
    const eventCount = context.database("SELECT COUNT(*) FROM outbox_event WHERE event_type='CRM_LEAD_SCORE_RECALC';");
    rejected(await api('sales', '/crm/lead-score/batch', { method: 'POST', body: [identifiers[0], outside.id] }), 'batch_rejects_mixed_owner_before_enqueue', /无权|权限|不存在|负责人/);
    rejected(await api('sales', '/crm/lead-score/batch', { method: 'POST', body: [foreign.id] }), 'batch_rejects_foreign_tenant_before_enqueue', /不存在|无权/);
    check('denied_batches_create_no_outbox_event', context.database("SELECT COUNT(*) FROM outbox_event WHERE event_type='CRM_LEAD_SCORE_RECALC';") === eventCount);
    const filtered = await context.leadPage('sales', { scoreMin: '2000', scoreMax: '2050', scoreOrder: 'DESC' });
    check('score_range_filter_includes_only_expected_owned_rows', filtered.total === 3 && filtered.rows.length === 3 && filtered.rows.every(row => identifiers.includes(String(row.leadId))));
    for (const direction of ['ASC', 'DESC']) {
      const page = await context.leadPage('sales', { scoreOrder: direction });
      check('score_order_' + direction + '_matches_actual_values', page.rows.every((value, index) => index === 0 || (direction === 'ASC'
        ? page.rows[index - 1].leadScore <= value.leadScore : page.rows[index - 1].leadScore >= value.leadScore)));
    }
    check('score_recalculation_keeps_foreign_tenant_rules_independent', (await readLead(foreign)).leadScore === 0);
    fixture.scoreCases = { sample: sample.id, matchingIds: identifiers, currentMatchingScore: 2040, foreign: foreign.id, outside: outside.id };
    evidence.batch = true; evidence.filters = true; evidence.permissions = true;
  });
  return { sample, rules, batchLeads };
}
