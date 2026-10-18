export async function verifyE3CreditRules(context, creditCases) {
  const { check, prove, evidence, fixture, marker, ok, api, success, rejected, quote, credit, propose, reviewCredit, sameMoney, identifier, day, user,
    rows, database, sql, contractBody, fixtureEntity, receivable, receive, paceWorkflowStart } = context;
  const { client, periodClients } = creditCases;
  const rule = code => ok('admin', '/auth/system/rules/effective/' + code);
  const versions = async current => (await ok('admin', '/auth/system/rules/versions?ruleId=' + current.id + '&pageNum=1&pageSize=100')).records;
  const draft = async (code, effect) => ok('admin', '/auth/system/rules/draft', 'POST', { ...await rule(code), effect, remark: marker + '_' + effect });
  const publish = async (code, effect) => {
    const pending = await draft(code, effect);
    await ok('admin', '/auth/system/rules/versions/' + pending.id + '/publish', 'POST');
    check('published_rule_' + code + '_' + pending.id + '_immediately_effective', (await rule(code)).effect === effect);
    return pending;
  };
  const hits = (type, id, code) => rows("SELECT JSON_OBJECT('id',CAST(id AS CHAR),'ruleCode',rule_code,'type',business_type,'businessId',CAST(business_id AS CHAR),'actual',actual_value,'threshold',threshold_value,'effect',effect,'result',hit_result) FROM sys_business_rule_hit_record WHERE tenant_id=100000 AND business_type=" + sql(type) + ' AND business_id=' + identifier(id) + (code ? ' AND rule_code=' + sql(code) : '') + ' ORDER BY id;');
  const audit = (name, type, id) => rows("SELECT JSON_OBJECT('id',CAST(audit_id AS CHAR),'name',audit_name,'field',audit_field,'detail',after_val,'actor',create_by,'risk',high_risk) FROM sys_audit_log WHERE tenant_id=100000 AND biz_module='crm' AND audit_name=" + sql(name) + ' AND audit_field=' + sql(type + ':' + id) + ' ORDER BY audit_id;');
  const submit = async sample => {
    await paceWorkflowStart(sample.actor);
    return api(sample.actor, '/crm/quote/submit/' + sample.id, { method: 'POST' });
  };
  const requireWarning = (response, label) => {
    success(response, label);
    check(label + '_has_actual_warning_header_and_amounts', response.ruleWarning === 'true'
      && /信用\/资质提醒/.test(response.body.msg) && /额度=/.test(response.body.msg) && /已占用=/.test(response.body.msg) && /超期=/.test(response.body.msg));
  };
  const block = async (sample, code = 'crm.credit.overdue', expectedActual = '60.08', expectedThreshold = '60.05') => {
    const before = await ok(sample.actor, '/crm/quote/' + sample.id);
    const previous = hits('CRM_QUOTE_SUBMIT', sample.id, code);
    const latest = previous.at(-1);
    const identical = latest?.effect === 'BLOCK' && latest.result === 'BLOCK' && sameMoney(latest.actual, expectedActual) && sameMoney(latest.threshold, expectedThreshold);
    const response = await submit(sample);
    const message = rejected(response, code + '_blocks_quote_' + sample.id, /额度=.+已占用=.+超期=/);
    const after = await ok(sample.actor, '/crm/quote/' + sample.id);
    check('blocked_quote_' + sample.id + '_preserves_state_version_and_contract', before.status === after.status && before.version === after.version && before.contractId === after.contractId);
    const observed = hits('CRM_QUOTE_SUBMIT', sample.id, code);
    check('blocked_quote_' + sample.id + '_persists_hit_despite_business_rollback', observed.length === previous.length + (identical ? 0 : 1)
      && observed.at(-1)?.effect === 'BLOCK' && observed.at(-1).result === 'BLOCK'
      && sameMoney(observed.at(-1).actual, expectedActual) && sameMoney(observed.at(-1).threshold, expectedThreshold));
    if (identical) check('blocked_quote_' + sample.id + '_identical_consecutive_result_keeps_latest_hit_id', observed.at(-1).id === latest.id);
    check('blocked_quote_' + sample.id + '_persists_high_risk_audit', audit(code + ':BLOCK', 'CRM_QUOTE_SUBMIT', sample.id).length > 0);
    return { response, message, hit: observed.at(-1) };
  };
  const originalOverdue = await rule('crm.credit.overdue');
  const originalLimit = await rule('crm.credit.limit');
  const originalVersion = (await versions(originalOverdue)).find(value => value.status === 'PUBLISHED');
  check('formal_credit_rules_start_with_overdue_block_and_limit_warn', originalOverdue.effect === 'BLOCK' && originalLimit.effect === 'WARN' && originalVersion);
  const blockedQuote = await quote('RULE_BLOCKED', client);
  await prove([11, 17, 18], async () => {
    const first = await block(blockedQuote);
    check('overdue_hit_uses_real_outstanding_and_customer_threshold', sameMoney(first.hit.actual, '60.08') && sameMoney(first.hit.threshold, '60.05'));
    await block(blockedQuote);
    const transitionInvoice = await receivable('RULE_REPEAT_EXPOSURE', client, '0.01', day(-1));
    const changed = await block(blockedQuote, 'crm.credit.overdue', '60.09');
    await receive(transitionInvoice, '0.01');
    const restored = await block(blockedQuote);
    const transitionHits = hits('CRM_QUOTE_SUBMIT', blockedQuote.id, 'crm.credit.overdue');
    check('changed_then_restored_exposure_records_three_ordered_business_results', transitionHits.length === 3
      && [first.hit.id, changed.hit.id, restored.hit.id].every((id, index) => id === transitionHits[index].id)
      && ['60.08', '60.09', '60.08'].every((value, index) => sameMoney(transitionHits[index].actual, value)));
    await block(blockedQuote);
    check('identical_consecutive_blocks_coalesce_without_losing_changed_history', hits('CRM_QUOTE_SUBMIT', blockedQuote.id, 'crm.credit.overdue').length === 3);
    const restoredCredit = await credit(client);
    check('real_transition_receipt_restores_original_credit_exposure', sameMoney(restoredCredit.occupied, '961.07') && sameMoney(restoredCredit.overdue, '60.08'));
    fixture.ruleHitTransitions = { quoteId: blockedQuote.id, receivableId: transitionInvoice.id, actualValues: ['60.08', '60.09', '60.08'],
      hitIds: transitionHits.map(value => value.id), consecutiveDuplicatesCoalesced: true, changedThenRestoredValuesRetained: true, actualReceipt: true };
    const beforeContracts = database("SELECT COUNT(*) FROM oa_contract WHERE tenant_id=100000 AND customer_id=" + client.id + ';');
    const converted = await api('sales', '/crm/quote/' + blockedQuote.id + '/contract-draft', { method: 'POST' });
    rejected(converted, 'overdue_blocks_quote_contract_generation', /额度=.+已占用=.+超期=/);
    const workspace = await api('sales', '/crm/customer/' + client.id + '/workspace/contract-draft', { method: 'POST', body: contractBody(client, 'BLOCKED_WORKSPACE') });
    rejected(workspace, 'overdue_blocks_customer_workspace_contract', /额度=.+已占用=.+超期=/);
    check('both_blocked_contract_entries_leave_contract_count_unchanged', database("SELECT COUNT(*) FROM oa_contract WHERE tenant_id=100000 AND customer_id=" + client.id + ';') === beforeContracts);
    for (const [type, id] of [['CRM_QUOTE_CONTRACT', blockedQuote.id], ['CRM_CUSTOMER_CONTRACT', client.id]]) {
      check(type + '_records_real_overdue_block_hit_and_audit', hits(type, id, 'crm.credit.overdue').at(-1)?.result === 'BLOCK' && audit('crm.credit.overdue:BLOCK', type, id).length > 0);
    }
    evidence.entryPoints = true;
  });
  await prove([12, 13, 17], async () => {
    const pending = await draft('crm.credit.overdue', 'WARN');
    check('draft_rule_does_not_change_effective_overdue_block', pending.status === 'DRAFT' && (await rule('crm.credit.overdue')).effect === 'BLOCK');
    await block(blockedQuote);
    await ok('admin', '/auth/system/rules/versions/' + pending.id + '/publish', 'POST');
    check('publishing_warn_takes_effect_without_service_restart', (await rule('crm.credit.overdue')).effect === 'WARN');
    const allowed = await quote('RULE_WARN', client);
    requireWarning(await submit(allowed), 'warn_allows_actual_quote_submission');
    check('warn_quote_actually_leaves_draft', (await ok('sales', '/crm/quote/' + allowed.id)).status !== 'DRAFT');
    const converted = await api('sales', '/crm/quote/' + blockedQuote.id + '/contract-draft', { method: 'POST' });
    requireWarning(converted, 'warn_allows_quote_contract_creation');
    const convertedId = identifier(converted.body.data);
    check('warn_quote_contract_exists_with_correct_source', database("SELECT COUNT(*) FROM oa_contract WHERE tenant_id=100000 AND contract_id=" + convertedId + " AND source_type='CRM_QUOTE' AND source_id=" + blockedQuote.id + " AND status='DRAFT';") === '1');
    const workspace = await api('sales', '/crm/customer/' + client.id + '/workspace/contract-draft', { method: 'POST', body: contractBody(client, 'WARN_WORKSPACE') });
    requireWarning(workspace, 'warn_allows_customer_workspace_contract_creation');
    check('draft_contracts_do_not_add_to_receivable_only_occupancy', sameMoney((await credit(client)).occupied, '961.07'));
    check('warn_records_both_actual_rules', hits('CRM_QUOTE_SUBMIT', allowed.id).length === 2 && hits('CRM_QUOTE_SUBMIT', allowed.id).every(value => value.effect === 'WARN' && value.result === 'WARN'));
  });
  await prove(14, async () => {
    await ok('admin', '/auth/system/rules/' + originalOverdue.id + '/rollback/' + originalVersion.id, 'POST');
    const currentVersions = await versions(originalOverdue);
    check('rollback_restores_old_effect_as_new_published_version', (await rule('crm.credit.overdue')).effect === 'BLOCK'
      && currentVersions.filter(value => value.status === 'PUBLISHED').length === 1 && currentVersions[0].versionNo > originalVersion.versionNo);
    const rollbackQuote = await quote('RULE_ROLLBACK', client);
    await block(rollbackQuote);
    const workspaceBefore = database("SELECT COUNT(*) FROM oa_contract WHERE tenant_id=100000 AND customer_id=" + client.id + ';');
    const workspace = await api('sales', '/crm/customer/' + client.id + '/workspace/contract-draft', { method: 'POST', body: contractBody(client, 'ROLLBACK_WORKSPACE') });
    rejected(workspace, 'rollback_blocks_same_customer_workspace_again', /额度=.+已占用=.+超期=/);
    const workspaceHistory = hits('CRM_CUSTOMER_CONTRACT', client.id, 'crm.credit.overdue');
    check('block_warn_block_transitions_preserve_latest_actual_rule_result', workspaceHistory.length === 3
      && ['BLOCK', 'WARN', 'BLOCK'].every((value, index) => workspaceHistory[index].result === value)
      && database("SELECT COUNT(*) FROM oa_contract WHERE tenant_id=100000 AND customer_id=" + client.id + ';') === workspaceBefore);
    fixture.ruleRollback = { ruleId: originalOverdue.id, sourceVersion: originalVersion.id, actualPublishedVersion: currentVersions[0].id, quoteId: rollbackQuote.id };
    evidence.ruleVersions = true;
  });
  await prove([11, 12, 13, 17], async () => {
    await publish('crm.credit.overdue', 'PASS');
    await publish('crm.credit.limit', 'BLOCK');
    const equal = await quote('RULE_EQUAL', client, '38.96');
    const allowed = await submit(equal); success(allowed, 'credit_exact_equality_is_allowed');
    check('exact_limit_has_no_warning_and_pass_hit', allowed.ruleWarning == null && hits('CRM_QUOTE_SUBMIT', equal.id, 'crm.credit.limit').at(-1)?.result === 'PASS');
    const exceeded = await quote('RULE_ONE_CENT_OVER', client, '38.97');
    const blocked = await block(exceeded, 'crm.credit.limit', '1000.04', '1000.03');
    check('one_cent_above_limit_uses_exact_total_and_boundary', sameMoney(blocked.hit.actual, '1000.04') && sameMoney(blocked.hit.threshold, '1000.03'));
    await publish('crm.credit.limit', 'PASS');
    const passed = await submit(exceeded); success(passed, 'pass_effect_allows_previously_blocked_quote');
    check('pass_effect_has_no_warning_and_keeps_pass_record', passed.ruleWarning == null && hits('CRM_QUOTE_SUBMIT', exceeded.id, 'crm.credit.limit').at(-1)?.result === 'PASS');
    await publish('crm.credit.limit', 'WARN');
    const onlyLimit = await quote('RULE_LIMIT_WARN', client, '150.00');
    requireWarning(await submit(onlyLimit), 'credit_limit_warn_independently_allows_submission');
    check('limit_warn_record_contains_exact_occupancy_plus_new_order', sameMoney(hits('CRM_QUOTE_SUBMIT', onlyLimit.id, 'crm.credit.limit').at(-1).actual, '1111.07'));
    await publish('crm.credit.overdue', 'BLOCK');
    await publish('crm.credit.limit', 'BLOCK');
    for (const inactive of periodClients) {
      const candidate = await quote('RULE_INACTIVE_' + inactive.id, inactive, '9000.00');
      const result = await submit(candidate); success(result, 'inactive_credit_allows_quote_' + inactive.id);
      check('inactive_credit_' + inactive.id + '_skips_credit_rules', result.ruleWarning == null && hits('CRM_QUOTE_SUBMIT', candidate.id).length === 0);
    }
    evidence.creditRules = true;
  });
  await prove([7, 15, 16, 18], async () => {
    let view = await credit(client);
    const initialVersion = view.credit.version;
    const body = { version: initialVersion, bypassFlag: 1, bypassReason: marker + '_批准临时放行', bypassExpireDate: day() };
    rejected(await api('sales', '/crm/credit/customer/' + client.id + '/bypass', { method: 'POST', body }), 'ordinary_sales_cannot_bypass_credit');
    rejected(await api('manager', '/crm/credit/customer/' + client.id + '/bypass', { method: 'POST', body: { ...body, bypassReason: '' } }), 'bypass_requires_written_reason');
    rejected(await api('manager', '/crm/credit/customer/' + client.id + '/bypass', { method: 'POST', body: { ...body, bypassExpireDate: day(-1) } }), 'bypass_rejects_already_expired_date');
    await ok('manager', '/crm/credit/customer/' + client.id + '/bypass', 'POST', body);
    view = await credit(client);
    check('bypass_includes_expiration_day_and_records_real_actor_time_reason', view.bypassActive && view.credit.bypassFlag === 1
      && String(view.credit.bypassBy) === user('manager') && view.credit.bypassTime && view.credit.bypassReason === body.bypassReason && view.credit.bypassExpireDate === day());
    const bypassed = await quote('RULE_BYPASSED', client);
    const result = await submit(bypassed); success(result, 'actual_bypass_quote_submission');
    check('bypass_passes_both_block_rules_and_records_both_hits', result.ruleWarning == null && hits('CRM_QUOTE_SUBMIT', bypassed.id).length === 2
      && hits('CRM_QUOTE_SUBMIT', bypassed.id).every(value => value.effect === 'PASS' && value.result === 'BYPASSED'));
    for (const code of ['crm.credit.overdue', 'crm.credit.limit']) check(code + '_bypass_has_separate_high_risk_audit', audit(code + ':BYPASSED', 'CRM_QUOTE_SUBMIT', bypassed.id).some(value => value.risk === 1));
    const adjustment = await propose(client, { creditLimit: '1000.04', remark: marker + '_approval_preserves_bypass' });
    const during = await credit(client);
    const latestReason = marker + '_审批期间更新放行说明';
    await ok('manager', '/crm/credit/customer/' + client.id + '/bypass', 'POST', { version: during.credit.version, bypassFlag: 1, bypassReason: latestReason, bypassExpireDate: day(1) });
    await reviewCredit(adjustment);
    view = await credit(client);
    check('approval_changes_credit_and_preserves_independent_latest_bypass', sameMoney(view.credit.creditLimit, '1000.04') && view.bypassActive
      && view.credit.bypassReason === latestReason && view.credit.bypassExpireDate === day(1) && String(view.credit.bypassBy) === user('manager'));
    rejected(await api('manager', '/crm/credit/customer/' + client.id + '/bypass', { method: 'POST', body: { version: initialVersion, bypassFlag: 0, bypassReason: marker } }), 'stale_bypass_update_cannot_overwrite_latest_approval');
    const savedBypass = { by: view.credit.bypassBy, time: view.credit.bypassTime, reason: view.credit.bypassReason };
    fixtureEntity('credit', view.credit.creditId, { bypass_expire_date: day(-1) }, 'Explicit prior-day expiry input on owned approved credit; no system clock change and no claim of waiting a calendar day');
    view = await credit(client);
    check('expired_bypass_is_inactive_and_preserves_original_operator_evidence', !view.bypassActive && view.credit.bypassFlag === 1
      && view.credit.bypassBy === savedBypass.by && view.credit.bypassTime === savedBypass.time && view.credit.bypassReason === savedBypass.reason);
    const expired = await quote('RULE_BYPASS_EXPIRED', client);
    await block(expired);
    await ok('manager', '/crm/credit/customer/' + client.id + '/bypass', 'POST', { version: view.credit.version, bypassFlag: 0, bypassReason: marker + '_撤销已到期放行' });
    check('bypass_revocation_keeps_credit_and_records_audit', !(await credit(client)).bypassActive && sameMoney((await credit(client)).credit.creditLimit, '1000.04')
      && audit('CRM_CREDIT_BYPASS', 'CRM_CUSTOMER', client.id).length >= 3);
    check('credit_submission_and_approval_are_auditable', audit('CRM_CREDIT_SUBMITTED', 'CRM_CUSTOMER', client.id).length >= 3
      && audit('CRM_CREDIT_APPROVED', 'CRM_CUSTOMER', client.id).length === 2);
    evidence.bypass = true; evidence.audits = true;
  });
  await publish('crm.credit.overdue', 'WARN');
  await publish('crm.credit.limit', 'WARN');
  const uiQuote = await quote('UI_WARN', client);
  fixture.uiWarningQuote = uiQuote;
  fixture.exposure.expected = { ...fixture.exposure.expected, limit: '1000.04', available: '38.97' };
  return { client, blockedQuote, uiQuote, hits, audit, rule, versions };
}

export async function verifyE3CreditRecordedQueries(context, rules) {
  const { check, prove, evidence, ok, rows, fixture } = context;
  await prove(17, async () => {
    const query = '/auth/system/rules/hit-records?ruleCode=crm.credit.overdue&businessType=CRM_QUOTE_SUBMIT&pageNum=1&pageSize=200';
    const raw = await ok('admin', query);
    const distinct = await ok('admin', query + '&deduplicate=true');
    const original = raw.records.filter(value => String(value.businessId) === rules.blockedQuote.id);
    const grouped = distinct.records.filter(value => String(value.businessId) === rules.blockedQuote.id);
    check('raw_hit_query_preserves_actual_changed_and_restored_block_results', original.length === 3
      && context.fixture.ruleHitTransitions.hitIds.every(id => original.some(value => String(value.id) === id)));
    check('deduplicated_hit_query_returns_latest_record_for_same_rule_and_document', grouped.length === 1
      && String(grouped[0].id) === String(original[0].id) && distinct.total < raw.total);
    const again = await ok('admin', query);
    check('deduplicated_query_does_not_delete_raw_hit_history', again.total === raw.total);
    const changedQuote = fixture.quotes.find(value => value.name.endsWith('_RULE_ONE_CENT_OVER'));
    const limitQuery = '/auth/system/rules/hit-records?ruleCode=crm.credit.limit&businessType=CRM_QUOTE_SUBMIT&pageNum=1&pageSize=200';
    const rawBlocks = await ok('admin', limitQuery + '&hitResult=BLOCK');
    const latestBlocks = await ok('admin', limitQuery + '&hitResult=BLOCK&deduplicate=true');
    check('latest_result_filter_excludes_documents_whose_old_block_became_pass', rawBlocks.records.some(value => String(value.businessId) === changedQuote.id)
      && !latestBlocks.records.some(value => String(value.businessId) === changedQuote.id));
    const prefix = 'e3.credit.query.' + context.marker.toLowerCase();
    const businessType = 'E3_QUERY_' + context.marker.slice(4).toUpperCase();
    const inputs = [
      ['admin', prefix, businessType, rules.blockedQuote.id, 'BLOCK', '1.00'],
      ['admin', prefix, businessType, rules.blockedQuote.id, 'PASS', '2.00'],
      ['admin', prefix, businessType, rules.uiQuote.id, 'BLOCK', '3.00'],
      ['admin', prefix, businessType + '_OTHER', rules.blockedQuote.id, 'PASS', '4.00'],
      ['admin', prefix + '.another', businessType, rules.blockedQuote.id, 'PASS', '5.00'],
      ['admin', prefix, businessType, null, 'PASS', '6.00'],
      ['admin', prefix, businessType, null, 'PASS', '7.00'],
      ['foreign', prefix, businessType, rules.blockedQuote.id, 'BLOCK', '8.00'],
    ];
    for (const [actor, ruleCode, type, businessId, effect, actualValue] of inputs) {
      await ok(actor, '/auth/system/rules/hit-records', 'POST', { ruleCode, businessType: type, businessId, effect, hitResult: effect, actualValue, thresholdValue: '0.00' });
    }
    fixture.queryBoundaryInputs = { source: 'Explicit independent rule-hit API inputs for query boundaries; separate from actual credit business evidence', prefix, businessType, records: inputs.length };
    const boundary = '/auth/system/rules/hit-records?ruleCode=' + prefix;
    const rawBoundary = await ok('admin', boundary + '&pageNum=1&pageSize=100');
    const latestBoundary = await ok('admin', boundary + '&pageNum=1&pageSize=100&deduplicate=true');
    check('dedup_partitions_by_tenant_rule_type_and_document', rawBoundary.total === 7 && latestBoundary.total === 6
      && latestBoundary.records.some(value => value.businessType === businessType + '_OTHER') && latestBoundary.records.some(value => value.ruleCode === prefix + '.another'));
    check('hits_without_document_id_remain_independent_records', latestBoundary.records.filter(value => value.businessId == null).length === 2);
    const foreignBoundary = await ok('foreign', boundary + '&pageNum=1&pageSize=100&deduplicate=true');
    check('deduplicated_query_isolates_same_rule_and_document_across_tenants', foreignBoundary.total === 1 && String(foreignBoundary.records[0].tenantId) === '100001'
      && latestBoundary.records.every(value => String(value.tenantId) === '100000'));
    const resultBoundary = await ok('admin', boundary + '&pageNum=1&pageSize=100&deduplicate=true&hitResult=BLOCK');
    check('result_filter_applies_after_latest_selection', resultBoundary.total === 1 && String(resultBoundary.records[0].businessId) === rules.uiQuote.id);
    const paged = [];
    for (let pageNum = 1; pageNum <= 3; pageNum++) {
      const part = await ok('admin', boundary + '&pageNum=' + pageNum + '&pageSize=2&deduplicate=true');
      check('deduplicated_page_' + pageNum + '_uses_grouped_total', part.total === 6 && part.records.length === 2);
      paged.push(...part.records.map(value => String(value.id)));
    }
    check('deduplicated_pagination_is_complete_stable_and_without_overlap', new Set(paged).size === 6
      && JSON.stringify(paged) === JSON.stringify(latestBoundary.records.map(value => String(value.id))));
    context.rejected(await context.api('readonly', boundary + '&deduplicate=true'), 'deduplicated_query_requires_rule_read_permission');
    check('all_controlled_raw_query_records_are_retained', (await ok('admin', boundary + '&pageNum=1&pageSize=100')).total === 7);
    const sample = rows("SELECT JSON_OBJECT('count',SUM(COUNT_STAR),'maximumMs',MAX(MAX_TIMER_WAIT)/1000000000,'averageMs',SUM(SUM_TIMER_WAIT)/SUM(COUNT_STAR)/1000000000) FROM performance_schema.events_statements_summary_by_digest WHERE SCHEMA_NAME='cloud_flow_db' AND UPPER(DIGEST_TEXT) LIKE '%CRM_RECEIVABLE%' AND UPPER(DIGEST_TEXT) LIKE '%GREATEST%' AND UPPER(DIGEST_TEXT) LIKE '%OCCUPIED%';")[0];
    check('actual_credit_exposure_sql_is_observed_and_each_calculation_under_100ms', Number(sample.count) > 0 && Number(sample.maximumMs) < 100);
    fixture.measurements.push({ kind: 'actual_exposure_database_statements', ...sample, limitMs: 100, includesHttp: false, source: 'MySQL performance_schema statement digest' });
    evidence.recordedQueries = true;
  });
}
