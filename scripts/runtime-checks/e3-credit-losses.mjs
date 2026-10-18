export async function verifyE3Losses(context) {
  const { check, prove, evidence, fixture, marker, identifier, ok, api, rejected, customer, opportunity, lose, user, sameMoney, day, fixtureEntity } = context;
  const master = async (kind, suffix, fields = {}, actor = 'manager') => {
    const isReason = kind === 'reason';
    const code = marker + '_' + suffix;
    const request = isReason ? { reasonCode: code, reasonName: suffix, reasonCategory: 'OTHER', status: 'ACTIVE', sortNo: fixture.reasons.length, ...fields }
      : { competitorCode: code, competitorName: suffix, threatLevel: 'MEDIUM', status: 'ACTIVE', ...fields };
    const id = identifier(await ok(actor, '/crm/lost-analysis/' + kind, 'POST', request));
    const record = { id, code, actor, request };
    (isReason ? fixture.reasons : fixture.competitors).push(record); return record;
  };
  const readMaster = async (kind, id, actor = 'manager') => (await ok(actor, '/crm/lost-analysis/' + (kind === 'reason' ? 'reasons' : 'competitors') + '?pageNum=1&pageSize=100')).rows
    .find(value => String(value[kind === 'reason' ? 'reasonId' : 'competitorId']) === id);
  let reasons, competitors, disabledReason, disabledCompetitor, foreignReason;
  await prove(6, async () => {
    reasons = [];
    for (let index = 0; index < 11; index++) reasons.push(await master('reason', index === 0 ? '次数排名验收' : index === 1 ? '金额排名验收' : '原因' + String(index + 1).padStart(2, '0')));
    competitors = [await master('competitor', '竞争对手甲', { industry: '软件', strength: '交付响应', weakness: '价格较高' }), await master('competitor', '竞争对手乙'), await master('competitor', '未发生输赢竞对')];
    const storedCompetitor = await readMaster('competitor', competitors[0].id);
    check('competitor_saved_strength_and_weakness_match_real_server_contract', storedCompetitor.strength === '交付响应' && storedCompetitor.weakness === '价格较高');
    disabledReason = await master('reason', '停用原因');
    disabledCompetitor = await master('competitor', '停用竞对');
    for (const [kind, sample] of [['reason', disabledReason], ['competitor', disabledCompetitor]]) {
      const original = await readMaster(kind, sample.id);
      await ok('manager', '/crm/lost-analysis/' + kind, 'POST', { ...original, status: 'INACTIVE', remark: '保留历史、禁止新选用' });
      const saved = await readMaster(kind, sample.id);
      check(kind + '_disabled_and_version_incremented', saved.status === 'INACTIVE' && saved.version === original.version + 1 && saved.remark === '保留历史、禁止新选用');
      rejected(await api('manager', '/crm/lost-analysis/' + kind, { method: 'POST', body: { ...original, status: 'ACTIVE' } }), kind + '_stale_version_cannot_restore_disabled_master', /^记录已被修改，请刷新后重试$/);
      check(kind + '_rejected_stale_save_preserves_entire_master', JSON.stringify(await readMaster(kind, sample.id)) === JSON.stringify(saved));
      rejected(await api('readonly', '/crm/lost-analysis/' + kind, { method: 'POST', body: saved }), kind + '_readonly_cannot_edit_master');
    }
    foreignReason = await master('reason', '外租户原因', {}, 'foreign');
    const localRows = (await ok('manager', '/crm/lost-analysis/reasons?pageNum=1&pageSize=100')).rows;
    check('foreign_master_is_absent_in_local_tenant', !localRows.some(value => String(value.reasonId) === foreignReason.id));
    evidence.masterData = true;
  });
  const client = await customer('LOSS_SALES');
  const sample = await opportunity('LOSS_A', client, '1500.15');
  const primary = { reasonId: reasons[0].id, competitorId: competitors[0].id, amountLost: '0.10', isPrimary: true };
  await prove(1, async () => {
    const current = await ok('sales', '/crm/opportunity/' + sample.id);
    const invalid = [
      ['empty', []], ['without_primary', [{ ...primary, isPrimary: false }]],
      ['two_primary', [primary, { reasonId: reasons[1].id, isPrimary: true }]],
      ['duplicate', [primary, { ...primary, isPrimary: false }]],
      ['inactive_reason', [{ ...primary, reasonId: disabledReason.id }]],
      ['inactive_competitor', [{ ...primary, competitorId: disabledCompetitor.id }]],
      ['foreign_reason', [{ ...primary, reasonId: foreignReason.id }]],
      ['negative_amount', [{ ...primary, amountLost: '-0.01' }]],
      ['fractional_cent', [{ ...primary, amountLost: '0.001' }]],
    ];
    for (const [label, input] of invalid) {
      rejected(await api('sales', '/crm/opportunity/' + sample.id + '/lose', { method: 'POST', body: { version: current.version, reasons: input, comment: marker } }), 'loss_rejects_' + label);
      const saved = await ok('sales', '/crm/opportunity/' + sample.id);
      check('loss_' + label + '_keeps_stage_version_and_has_no_details', saved.stage === current.stage && saved.version === current.version
        && (await ok('sales', '/crm/lost-analysis/opportunity/' + sample.id)).length === 0);
    }
    evidence.lossValidation = true;
  });
  const lost = [];
  await prove([1, 2, 5], async () => {
    lost.push({ sample, result: await lose(sample, [primary, { reasonId: reasons[1].id, competitorId: competitors[0].id, amountLost: '999.99', isPrimary: false },
      { reasonId: reasons[2].id, competitorId: competitors[1].id, amountLost: '15.03', isPrimary: false }], marker + '_价格与交付补充说明') });
    const second = await opportunity('LOSS_B', client, '250.25');
    lost.push({ sample: second, result: await lose(second, [{ ...primary, amountLost: '0.20' }, ...reasons.slice(3).map((reason, index) => ({
      reasonId: reason.id, competitorId: competitors[0].id, amountLost: index < 2 ? '20.02' : String(30 + index) + '.03', isPrimary: false,
    }))]) });
    const third = await opportunity('LOSS_C', client, '75.50');
    lost.push({ sample: third, result: await lose(third, [{ ...primary, amountLost: '0.30', competitorId: competitors[1].id }]) });
    evidence.lossApproval = true;
  });
  let managerClient, outsideClient, foreignClient;
  await prove([3, 4], async () => {
    const won = await opportunity('WON_SALES', client, '500.01');
    let record = await ok('sales', '/crm/opportunity/' + won.id);
    await ok('sales', '/crm/opportunity/' + won.id + '/win', 'POST', { version: record.version, competitorId: competitors[0].id });
    check('actual_won_opportunity_keeps_linked_competitor', String((await ok('sales', '/crm/opportunity/' + won.id)).competitorId) === competitors[0].id);
    managerClient = await customer('LOSS_MANAGER', {}, 'manager');
    const departmentLoss = await opportunity('LOSS_DEPARTMENT_COLLEAGUE', managerClient, '42.42', 'admin');
    const colleagueRecord = await ok('admin', '/crm/opportunity/' + departmentLoss.id);
    check('department_loss_requester_is_actual_opportunity_owner', String(colleagueRecord.ownerId) === user('admin'));
    rejected(await api('manager', '/crm/opportunity/' + departmentLoss.id + '/lose', { method: 'POST', body: {
      version: colleagueRecord.version, reasons: [{ reasonId: reasons[1].id, competitorId: competitors[0].id, amountLost: '42.42', isPrimary: true }], comment: marker,
    } }), 'department_manager_cannot_submit_another_owner_loss', /权限|无权|本人|负责人|办理|操作/);
    check('rejected_other_owner_loss_preserves_entire_opportunity', JSON.stringify(await ok('admin', '/crm/opportunity/' + departmentLoss.id)) === JSON.stringify(colleagueRecord));
    await lose(departmentLoss, [{ reasonId: reasons[1].id, competitorId: competitors[0].id, amountLost: '42.42', isPrimary: true }]);
    outsideClient = await customer('LOSS_OUTSIDE', {}, 'other');
    const outsideWon = await opportunity('WON_OUTSIDE', outsideClient, '888.88');
    record = await ok('other', '/crm/opportunity/' + outsideWon.id);
    await ok('other', '/crm/opportunity/' + outsideWon.id + '/win', 'POST', { version: record.version, competitorId: competitors[0].id });
    foreignClient = await customer('LOSS_FOREIGN', {}, 'foreign');
    const foreignCompetitor = await master('competitor', '外租户竞对', {}, 'foreign');
    const foreignWon = await opportunity('WON_FOREIGN', foreignClient, '999.99');
    record = await ok('foreign', '/crm/opportunity/' + foreignWon.id);
    await ok('foreign', '/crm/opportunity/' + foreignWon.id + '/win', 'POST', { version: record.version, competitorId: foreignCompetitor.id });
    const previousMonth = new Date(day() + 'T12:00:00+08:00'); previousMonth.setUTCMonth(previousMonth.getUTCMonth() - 1, 1);
    const priorDate = previousMonth.toISOString().slice(0, 10);
    fixtureEntity('opportunity', sample.id, { stage_changed_time: priorDate + ' 10:00:00' }, 'Explicit prior-month reporting input on an actually approved owned loss; system clock unchanged');
    fixtureEntity('opportunity', lost[1].sample.id, { stage_changed_time: day() + ' 00:00:00' }, 'Inclusive report start-day boundary on an actually approved owned loss');
    fixtureEntity('opportunity', lost[2].sample.id, { stage_changed_time: day() + ' 23:59:59' }, 'Inclusive report end-day boundary on an actually approved owned loss');
    const report = await ok('sales', '/crm/lost-analysis/report');
    check('sales_report_contains_all_eleven_distinct_reasons', report.reasons.length === 11);
    check('count_and_amount_rankings_have_different_leaders', String(report.reasons[0].reasonId) === reasons[0].id && report.reasons[0].count === 3
      && sameMoney(report.reasons[0].amount, '0.60') && sameMoney(report.reasons.find(value => String(value.reasonId) === reasons[1].id).amount, '999.99'));
    const competitorA = report.competitors.find(value => String(value.competitorId) === competitors[0].id);
    const competitorB = report.competitors.find(value => String(value.competitorId) === competitors[1].id);
    const empty = report.competitors.find(value => String(value.competitorId) === competitors[2].id);
    check('multiple_reasons_count_each_competitor_loss_once_per_opportunity', competitorA.wonCount === 1 && competitorA.lostCount === 2 && competitorB.wonCount === 0 && competitorB.lostCount === 2);
    check('unused_competitor_retains_zero_wins_and_losses', empty.wonCount === 0 && empty.lostCount === 0);
    check('monthly_amount_counts_each_actual_lost_opportunity_once', report.trend.length === 2 && report.trend[0].count === 1 && sameMoney(report.trend[0].amount, '1500.15')
      && report.trend[1].count === 2 && sameMoney(report.trend[1].amount, '325.75'));
    const todayReport = await ok('sales', '/crm/lost-analysis/report?start=' + day() + '&end=' + day());
    check('inclusive_day_filter_contains_midnight_and_last_second', todayReport.trend.length === 1 && todayReport.trend[0].count === 2 && sameMoney(todayReport.trend[0].amount, '325.75'));
    const managerReport = await ok('manager', '/crm/lost-analysis/report');
    const allReport = await ok('admin', '/crm/lost-analysis/report');
    check('department_report_adds_manager_loss_but_excludes_other_department_win', managerReport.competitors.find(value => String(value.competitorId) === competitors[0].id).lostCount === 3
      && managerReport.competitors.find(value => String(value.competitorId) === competitors[0].id).wonCount === 1);
    check('full_scope_adds_outside_win_but_excludes_other_tenant', allReport.competitors.find(value => String(value.competitorId) === competitors[0].id).wonCount === 2
      && !allReport.competitors.some(value => String(value.competitorId) === foreignCompetitor.id));
    const emptyReport = await ok('sales', '/crm/lost-analysis/report?start=2099-01-01&end=2099-12-31');
    check('empty_report_has_empty_all_three_dimensions', emptyReport.reasons.length === 0 && emptyReport.competitors.length === 0 && emptyReport.trend.length === 0);
    rejected(await api('sales', '/crm/lost-analysis/report?start=2099-12-31&end=2099-01-01'), 'inverted_report_dates_are_rejected');
    rejected(await api('employee', '/crm/lost-analysis/report'), 'report_requires_explicit_permission');
    rejected(await api('sales', '/crm/lost-analysis/opportunity/' + departmentLoss.id), 'sales_cannot_read_other_owner_loss_details');
    rejected(await api('foreign', '/crm/lost-analysis/opportunity/' + sample.id), 'foreign_tenant_cannot_read_loss_details');
    const dashboard = await ok('sales', '/crm/dashboard/summary');
    check('actual_dashboard_summary_includes_both_report_dimensions', dashboard.lostAnalysis && dashboard.lostAnalysis.reasons.length === 11
      && sameMoney(dashboard.lostAnalysis.reasons.find(value => String(value.reasonId) === reasons[1].id).amount, '999.99'));
    fixture.losses = { customerId: client.id, report, todayReport, previousDate: priorDate, reasons: reasons.map(value => value.id), competitors: competitors.map(value => value.id) };
    evidence.lossReport = true; evidence.competitorStats = true; evidence.permissions = true;
  });
  return { client, managerClient, outsideClient, foreignClient, reasons, competitors, disabledReason, disabledCompetitor };
}
