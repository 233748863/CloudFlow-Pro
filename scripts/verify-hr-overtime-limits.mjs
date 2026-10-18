// Original HR09 acceptance cases, injected with the current owned runtime only.
export async function verifyHrOvertimeLimits(context) {
const { check, jsonRows, sqlText, until, pause } = context;

const overtime = '/hr/attendance/overtime-requests';
const rulesPath = '/auth/system/rules';
const ruleFields = ['ruleCode', 'ruleName', 'module', 'enabled', 'effect', 'thresholdValue', 'priority', 'remark'];

function limitDimensions(warnings) {
  if (!Array.isArray(warnings)) throw new Error('H_HR_LIMIT_WARNINGS_MISSING');
  return warnings.map(warning => {
    if (!['DAY', 'MONTH'].includes(warning.dimension) || !['BLOCK', 'WARN'].includes(warning.effect)) {
      throw new Error('H_HR_LIMIT_WARNING_INVALID');
    }
    return `${warning.dimension}:${warning.effect}`;
  }).sort();
}

function limitHitMatches(record, dimension, effect, thresholdMinutes, actualMinutes) {
  if (!record || !['DAY', 'MONTH'].includes(dimension) || !['BLOCK', 'WARN'].includes(effect)
    || !Number.isSafeInteger(thresholdMinutes) || thresholdMinutes <= 0
    || !Number.isSafeInteger(actualMinutes) || actualMinutes <= thresholdMinutes) return false;
  const hours = minutes => Number((BigInt(minutes) * 100n + 30n) / 60n) / 100;
  return record.dimension === `HR_OVERTIME_${dimension}` && record.effect === effect && record.result === effect
    && Number(record.threshold) === hours(thresholdMinutes) && Number(record.actual) === hours(actualMinutes);
}

function monthlyMinutes(context) {
  return Number(jsonRows(`SELECT JSON_OBJECT('minutes',COALESCE(SUM(actual_minutes),0)) FROM hr_overtime_request
    WHERE tenant_id=100000 AND employee_id=${sqlText(context.employeeId('employee'))} AND deleted=0
      AND work_date BETWEEN '2026-09-01' AND '2026-09-30'
      AND status IN ('SUBMITTED','PENDING','APPROVING','APPROVED')`)[0].minutes);
}

function hits(requestId) {
  return jsonRows(`SELECT JSON_OBJECT('id',CAST(id AS CHAR),'dimension',business_type,'effect',effect,'result',hit_result,
    'actual',CAST(actual_value AS CHAR),'threshold',CAST(threshold_value AS CHAR)) FROM sys_business_rule_hit_record
    WHERE tenant_id=100000 AND rule_code='hr.overtime.hours.limit' AND business_id=${sqlText(requestId)}
      AND business_type IN ('HR_OVERTIME_DAY','HR_OVERTIME_MONTH') ORDER BY id`);
}

async function publishRule(context, wanted) {
  const { fixture, ok, save } = context;
  const state = fixture.limits;
  const current = await ok('admin', `${rulesPath}/${state.originalRule.id}`);
  check('限额规则配置限定本租户唯一HR规则', String(current.id) === String(state.originalRule.id)
    && String(current.tenantId) === '100000' && current.ruleCode === 'hr.overtime.hours.limit' && current.module === 'hr');
  if (ruleFields.every(field => String(current[field] ?? '') === String(wanted[field] ?? ''))) return;
  await pause(Math.max(0, 5100 - (Date.now() - (state.lastRuleDraftAt || 0))));
  state.lastRuleDraftAt = Date.now();
  await save();
  const draft = await ok('admin', `${rulesPath}/draft`, 'POST', { ...wanted, id: current.id });
  check('临时规则版本经真实接口创建且未串用规则', /^[1-9][0-9]*$/.test(String(draft.id))
    && String(draft.ruleId) === String(current.id) && draft.status === 'DRAFT');
  state.ruleVersionIds ||= [];
  state.ruleVersionIds.push(String(draft.id));
  await save();
  await ok('admin', `${rulesPath}/versions/${draft.id}/publish`, 'POST');
  await until(() => ok('admin', `${rulesPath}/${current.id}`), result => ruleFields.every(field =>
    String(result[field] ?? '') === String(wanted[field] ?? '')), '限额规则真实发布生效');
}

async function register(context, name, date, from, to) {
  const { fixture, note, draft, createRequest, save } = context;
  const state = fixture.limits;
  const detail = await createRequest(`limits-${state.attempt}-${name}`, overtime,
    draft(date, from, to, 'COMPENSATORY', `${note} LIMIT-${state.attempt}-${name}`));
  check('限额用例从真实草稿开始且无结算', detail.status === 'DRAFT' && !detail.instanceId && !detail.settledFlag);
  state.requestIds.push(String(detail.requestId));
  await save();
  return detail;
}

async function cancel(context, requestId) {
  const { ok, note } = context;
  let current = await ok('employee', `${overtime}/${requestId}`);
  if (current.status !== 'CANCELLED') {
    check('限额恢复只撤回本组尚未批准测试申请', ['DRAFT', 'SUBMITTED', 'PENDING', 'APPROVING'].includes(current.status)
      && context.fixture.limits.requestIds.includes(String(requestId)) && !current.settledFlag);
    current = await ok('employee', `${overtime}/${requestId}/cancel`, 'POST', { version: current.version, reason: note });
  }
  check('限额测试申请经真实接口撤回且未入账', current.status === 'CANCELLED' && !current.settledFlag
    && !current.leaveLedgerId && !current.compChangeId && !current.payrollCorrectionId);
}

async function submit(context, detail, expectedWarnings, expectedMinutes) {
  const current = await context.ok('employee', `${overtime}/${detail.requestId}/submit`, 'POST', { version: detail.version });
  check('真实提交保留实际分钟且尚未审批入账', current.status === 'SUBMITTED' && current.actualMinutes === expectedMinutes
    && current.approvedMinutes == null && !current.instanceId && !current.settledFlag);
  check('限额告警维度与执行方式准确', JSON.stringify(limitDimensions(current.ruleWarnings)) === JSON.stringify(expectedWarnings.sort()));
  return current;
}

async function block(context, detail, dimension, threshold, actual) {
  const before = await context.ok('employee', `${overtime}/${detail.requestId}`);
  const result = await context.call('employee', `${overtime}/${detail.requestId}/submit`, 'POST', { version: before.version });
  check('BLOCK真实阻止超过实际工时上限的提交', result.body?.code === 'OVERTIME_LIMIT_EXCEEDED');
  const after = await context.ok('employee', `${overtime}/${detail.requestId}`);
  check('限额阻断不提交草稿不改变版本不启动流程', after.status === 'DRAFT' && after.version === before.version
    && !after.instanceId && !after.settledFlag);
  const records = hits(detail.requestId);
  check('BLOCK命中记录来自真实受限桥且维度数值正确', records.length === 1
    && limitHitMatches(records[0], dimension, 'BLOCK', threshold, actual));
  await pause(5100);
  const repeated = await context.call('employee', `${overtime}/${detail.requestId}/submit`, 'POST', { version: after.version });
  check('超过重复提交窗口后再次提交仍受同一上限阻断', repeated.body?.code === 'OVERTIME_LIMIT_EXCEEDED');
  check('真实规则命中重放不重复新增流水', JSON.stringify(hits(detail.requestId)) === JSON.stringify(records));
}

function verifyNoSettlement(requestIds) {
  if (!requestIds.length) return;
  const identifiers = requestIds.map(sqlText).join(',');
  const ledger = jsonRows(`SELECT JSON_OBJECT('count',COUNT(*)) FROM hr_leave_ledger WHERE tenant_id=100000
    AND source_biz_type='HR_OVERTIME' AND source_biz_id IN (${identifiers})`);
  const changes = jsonRows(`SELECT JSON_OBJECT('count',COUNT(*)) FROM hr_comp_change WHERE tenant_id=100000
    AND source_biz_type='HR_OVERTIME' AND source_biz_id IN (${identifiers})`);
  check('限额验收未伪造批准或产生调休工资结果', Number(ledger[0].count) === 0 && Number(changes[0].count) === 0);
}

async function restoreLimits(context) {
  const { fixture, ok, save } = context;
  const state = fixture?.limits;
  if (!state) return;
  if (state.restorationRequired) {
    for (const requestId of state.requestIds) await cancel(context, requestId);
    await publishRule(context, state.originalRule);
  }
  const current = await ok('admin', `${rulesPath}/${state.originalRule.id}`);
  check('限额临时规则的原值逐字段精确恢复', ruleFields.every(field =>
    String(current[field] ?? '') === String(state.originalRule[field] ?? '')));
  check('限额用例撤回后不遗留实际分钟占用', monthlyMinutes(context) === state.originalMonthMinutes);
  verifyNoSettlement(state.requestIds);
  state.restorationRequired = false;
  state.restorationEvidence = { checkedAt: new Date().toISOString(), exact: true, cancelledRequestCount: state.requestIds.length,
    remainingTestMinutes: 0, retainedRuleVersionIds: state.ruleVersionIds || [], syntheticPolicyOnly: true };
  await save();
}

async function runLimitAcceptance(context) {
  const { fixture, cards, configureTypes, ok, call, save, approvalActors, note } = context;
  const originalMonthMinutes = monthlyMinutes(context);
  check('限额测试月份无其他有效申请占用', originalMonthMinutes === 0);
  const state = fixture.limits = { attempt: (fixture.limits?.attempt || 0) + 1, requestIds: [], originalMonthMinutes,
    originalRule: structuredClone(fixture.baseline.rule), restorationRequired: true };
  await save();
  let accepted = false;
  try {
    for (const date of ['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-05', '2026-09-07', '2026-09-10', '2026-09-11']) {
      await cards('employee', date, '09:00:00', '21:00:00');
    }
    await configureTypes({ maxHoursPerDay: '3.00', maxHoursPerMonth: '10.00' });
    await publishRule(context, { ...state.originalRule, effect: 'BLOCK', enabled: 1 });
    const first = await register(context, 'day-boundary', '2026-09-01', '17:30', '20:30');
    const firstSubmitted = await submit(context, first, [], 180);
    check('等于设计日上限180分钟真实允许且按实际分钟占用', monthlyMinutes(context) === 180);
    const reviewed = await ok(approvalActors.reviewer, `${overtime}/${first.requestId}/review-hours`, 'POST', {
      version: firstSubmitted.version, approvedMinutes: 60, note,
    });
    check('核定报酬分钟减少不减少实际工时上限占用', reviewed.status === 'PENDING'
      && reviewed.actualMinutes === 180 && reviewed.approvedMinutes === 60 && !reviewed.instanceId && monthlyMinutes(context) === 180);
    const dayBlocked = await register(context, 'day-block', '2026-09-01', '20:30', '20:31');
    await block(context, dayBlocked, 'DAY', 180, 181);
    await publishRule(context, { ...state.originalRule, effect: 'WARN', enabled: 1 });
    const dayWarned = await register(context, 'day-warn', '2026-09-01', '20:30', '20:31');
    await submit(context, dayWarned, ['DAY:WARN'], 1);
    check('日上限超出一分钟WARN真实放行并记录单一警告', hits(dayWarned.requestId).length === 1
      && limitHitMatches(hits(dayWarned.requestId)[0], 'DAY', 'WARN', 180, 181) && monthlyMinutes(context) === 181);
    await cancel(context, dayWarned.requestId);
    check('撤回WARN申请真实释放一分钟占用', monthlyMinutes(context) === 180);
    await publishRule(context, { ...state.originalRule, effect: 'BLOCK', enabled: 1 });
    for (const [name, date, end, minutes] of [['month-workday-one', '2026-09-02', '20:30', 180],
      ['month-workday-two', '2026-09-03', '20:30', 180], ['month-restday', '2026-09-05', '18:30', 60]]) {
      const detail = await register(context, name, date, '17:30', end);
      const current = await submit(context, detail, [], minutes);
      if (name === 'month-restday') check('休息日与工作日不同类型共享自然月实际分钟总量',
        current.overtimeTypeId !== firstSubmitted.overtimeTypeId && monthlyMinutes(context) === 600);
    }
    check('等于设计月上限600分钟真实允许且跨日跨类型累计', monthlyMinutes(context) === 600);
    const monthBlocked = await register(context, 'month-block', '2026-09-07', '17:30', '17:31');
    await block(context, monthBlocked, 'MONTH', 600, 601);
    await publishRule(context, { ...state.originalRule, effect: 'WARN', enabled: 1 });
    const monthWarned = await register(context, 'month-warn', '2026-09-07', '17:30', '17:31');
    await submit(context, monthWarned, ['MONTH:WARN'], 1);
    check('月上限超出一分钟WARN真实放行且累计601分钟', hits(monthWarned.requestId).length === 1
      && limitHitMatches(hits(monthWarned.requestId)[0], 'MONTH', 'WARN', 600, 601) && monthlyMinutes(context) === 601);
    for (const requestId of state.requestIds) await cancel(context, requestId);
    check('并发验收前测试占用已全部真实释放', monthlyMinutes(context) === 0);
    await publishRule(context, { ...state.originalRule, effect: 'BLOCK', enabled: 1 });
    for (const date of ['2026-09-01', '2026-09-02', '2026-09-03']) {
      const detail = await register(context, `race-base-${date}`, date, '17:30', '20:30');
      await submit(context, detail, [], 180);
    }
    check('在线竞争从设计月上限剩余60分钟开始', monthlyMinutes(context) === 540);
    const left = await register(context, 'race-left', '2026-09-10', '17:30', '18:30');
    const right = await register(context, 'race-right', '2026-09-11', '17:30', '18:30');
    const raced = await Promise.all([left, right].map(detail => call('employee', `${overtime}/${detail.requestId}/submit`,
      'POST', { version: detail.version })));
    check('真实并发提交仅一张占用最后60分钟', raced.filter(result => result.status === 200 && result.body?.code === 200).length === 1
      && raced.filter(result => result.body?.code === 'OVERTIME_LIMIT_EXCEEDED').length === 1);
    const persisted = await Promise.all([left, right].map(detail => ok('employee', `${overtime}/${detail.requestId}`)));
    check('并发落库一张待核定一张草稿且总量不超月上限', persisted.filter(row => row.status === 'SUBMITTED').length === 1
      && persisted.filter(row => row.status === 'DRAFT').length === 1 && monthlyMinutes(context) === 600);
    verifyNoSettlement(state.requestIds);
    state.evidence = { checkedAt: new Date().toISOString(), dayLimitMinutes: 180, monthLimitMinutes: 600,
      overBoundaryMinutes: 1, crossTypes: true, reducedPayMinutesKeepActualUsage: true,
      onlineConcurrentSubmissions: 2, concurrentSuccessfulSubmissions: 1, concurrentBlockedSubmissions: 1 };
    await save();
    accepted = true;
  } finally {
    await restoreLimits(context);
  }
  if (accepted) {
    fixture.completed.limits = true;
    await save();
  }
}


await runLimitAcceptance(context);
context.evidence.limits = fixtureEvidence(context.fixture.limits);
function fixtureEvidence(state) {
  check('当前上限验收完整恢复且有真实并发依据', state.restorationEvidence.exact && state.restorationEvidence.remainingTestMinutes === 0
    && state.evidence.concurrentSuccessfulSubmissions === 1 && state.evidence.concurrentBlockedSubmissions === 1);
  return { passed: true, ...state.evidence, restoration: state.restorationEvidence };
}
}
