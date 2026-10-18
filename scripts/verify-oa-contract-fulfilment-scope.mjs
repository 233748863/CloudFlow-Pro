import assert from 'node:assert/strict';

// State and date boundaries are explicit inputs; the report, task dispatch and delivery are real.
export async function verifyContractFulfilmentScope({ admin, api, successful, database, check,
  caseTag, owner, fixture, term, trigger, records, riskCount, waitFor, evidence }) {
  const marker = 'F4_SCOPE_' + caseTag;
  const sql = value => 'CONVERT(0x' + Buffer.from(String(value)).toString('hex') + ' USING utf8mb4)';
  const report = async () => successful(await api(admin, '/oa/reports/contracts'), '读取状态范围履约报表');
  const before = await report();
  const allowed = ['APPROVED', 'SEALING', 'SEALED', 'ACTIVE', 'EXPIRED'];
  const excluded = ['DRAFT', 'PENDING', 'REJECTED', 'TERMINATED', 'CANCELLED', 'ARCHIVED'];
  const samples = [];
  for (const status of [...allowed, ...excluded]) {
    const contractId = fixture('scope_' + status);
    const dueId = await term(contractId, 1, -1, owner.id);
    const doneId = await term(contractId, 2, -1, owner.id);
    successful(await api(admin, '/oa/contract/terms/' + doneId + '/confirm', {
      method: 'POST', body: { fulfilledDate: database('SELECT CURRENT_DATE;') },
    }), '建立状态样本的真实已履约条款');
    database('UPDATE oa_contract SET counterparty_name=' + sql(marker) + ',status=' + sql(status)
      + ',signed_flag=0,start_date=' + (status === 'APPROVED' ? 'NULL' : status === 'EXPIRED' ? 'DATE_SUB(CURRENT_DATE,INTERVAL 30 DAY)' : 'DATE_ADD(CURRENT_DATE,INTERVAL 2 DAY)')
      + (status === 'EXPIRED' ? ',end_date=DATE_SUB(CURRENT_DATE,INTERVAL 1 DAY)' : '')
      + ' WHERE tenant_id=100000 AND contract_id=' + contractId + ';');
    samples.push({ status, contractId, dueId, doneId, allowed: allowed.includes(status) });
  }
  for (const kind of ['tracking_off', 'deleted']) {
    const contractId = fixture('scope_' + kind);
    const dueId = await term(contractId, 1, -1, owner.id);
    database('UPDATE oa_contract SET counterparty_name=' + sql(marker) + ",status='APPROVED',"
      + (kind === 'tracking_off' ? 'requires_fulfilment_flag=0' : 'deleted=1')
      + ' WHERE tenant_id=100000 AND contract_id=' + contractId + ';');
    samples.push({ status: kind, contractId, dueId, allowed: false });
  }
  const result = await report();
  for (const sample of samples) {
    check('合同状态' + sample.status + '的看板与超期清单范围一致',
      result.dashboard.some(row => String(row.contractId) === sample.contractId) === sample.allowed
      && result.overdue.some(row => String(row.contractId) === sample.contractId && String(row.termId) === sample.dueId) === sample.allowed);
  }
  const group = result.byCounterparty.filter(row => row.groupKey === marker);
  check('审批后五种状态按真实条款合计50%且排除其他状态', group.length === 1
    && Number(group[0].contractCount) === 5 && Number(group[0].fulfilledContractCount) === 0
    && Number(group[0].fulfilledTermCount) === 5 && Number(group[0].totalTermCount) === 10 && Number(group[0].fulfilmentRate) === 50);
  for (const [key, target] of [['byType', 'OTHER'], ['byOwner', owner.id]]) {
    const old = before[key].find(row => String(row.groupKey) === target) || {};
    const current = result[key].filter(row => String(row.groupKey) === target);
    check(key + '与对方统计采用同一审批后状态范围', current.length === 1
      && Number(current[0].contractCount) === Number(old.contractCount || 0) + 5
      && Number(current[0].fulfilledTermCount) === Number(old.fulfilledTermCount || 0) + 5
      && Number(current[0].totalTermCount) === Number(old.totalTermCount || 0) + 10);
  }
  check('未签署、缺少或未来开始日期不阻止已批准合同进入履约管理',
    samples.filter(sample => sample.allowed).every(sample => result.dashboard.some(row => String(row.contractId) === sample.contractId)));
  const expired = samples.find(sample => sample.status === 'EXPIRED');
  check('已到期未完成义务仍进入看板和超期清单',
    result.dashboard.some(row => String(row.contractId) === expired.contractId)
    && result.overdue.some(row => String(row.termId) === expired.dueId));

  await trigger();
  for (const sample of samples) {
    if (sample.allowed) {
      const delivered = await waitFor(() => records('CONTRACT_TERM', sample.dueId),
        items => items.length === 1 && items[0].status === 'SUCCESS', '审批后状态未实际收到到期提醒');
      check('状态' + sample.status + '由实际任务产生一份站内提醒和逾期风险',
        delivered[0].receiver === owner.id && delivered[0].channel === 'INTERNAL'
        && riskCount(sample.contractId, 'TERM_OVERDUE_' + sample.dueId) === 1);
    } else {
      check('状态' + sample.status + '不产生自动履约提醒或风险',
        records('CONTRACT_TERM', sample.dueId).length === 0 && riskCount(sample.contractId, 'TERM_OVERDUE_' + sample.dueId) === 0);
    }
    if (sample.doneId) check('状态' + sample.status + '的已履约条款不重复提醒', records('CONTRACT_TERM', sample.doneId).length === 0);
  }
  const changed = samples.find(sample => sample.status === 'APPROVED');
  const beforeChanged = records('CONTRACT_TERM', changed.dueId).length;
  database("UPDATE oa_contract SET status='PENDING' WHERE tenant_id=100000 AND contract_id=" + changed.contractId + ';'
    + ' UPDATE oa_contract_fulfilment_term SET deadline_date=DATE_SUB(CURRENT_DATE,INTERVAL 2 DAY),overdue_flag=0'
    + ' WHERE tenant_id=100000 AND term_id=' + changed.dueId + ';');
  await trigger();
  const after = await report();
  check('合同转回审批中后下一次扫描停止提醒且立即退出看板和超期清单',
    records('CONTRACT_TERM', changed.dueId).length === beforeChanged
    && database('SELECT overdue_flag FROM oa_contract_fulfilment_term WHERE tenant_id=100000 AND term_id=' + changed.dueId + ';') === '0'
    && !after.dashboard.some(row => String(row.contractId) === changed.contractId)
    && !after.overdue.some(row => String(row.contractId) === changed.contractId));
  const remaining = after.byCounterparty.filter(row => row.groupKey === marker);
  check('状态退出后履约率同步移除对应分子分母', remaining.length === 1
    && Number(remaining[0].contractCount) === 4 && Number(remaining[0].fulfilledTermCount) === 4
    && Number(remaining[0].totalTermCount) === 8 && Number(remaining[0].fulfilmentRate) === 50);
  for (const sample of samples.filter(item => item.allowed && item !== changed)) {
    assert.equal(records('CONTRACT_TERM', sample.dueId).length, 1, 'Repeated scope scan duplicated delivery');
  }
  const termIds = samples.flatMap(sample => [sample.dueId, sample.doneId].filter(Boolean));
  check('状态矩阵提醒仅使用站内渠道', database("SELECT COUNT(*) FROM sys_message_record WHERE tenant_id=100000 AND channel_type<>'INTERNAL'"
    + " AND biz_type='CONTRACT_TERM' AND biz_id IN (" + termIds.map(sql).join(',') + ');') === '0');
  evidence.stateScope = true;
  console.log('F4_CONTRACT_SCOPE: known_states=10; unknown_states=1; eligibility_guards=2; admitted_states=5; real_reports=true; real_job=true; real_internal_delivery=true');
}

