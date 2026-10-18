import assert from 'node:assert/strict';

// The opening amounts are explicit owned ADJUSTMENTs. All freezing, encashment
// and reversal entries must be produced by the actual settlement operations.
export async function prepareSettlementLeave({ admin, api, successful, database, check, marker, employeeId }) {
  const sql = value => `CONVERT(UNHEX('${Buffer.from(String(value)).toString('hex')}') USING utf8mb4)`;
  const id = value => { const result = String(value); assert.match(result, /^[1-9]\d*$/); return result; };
  const periods = database(`SELECT JSON_OBJECT('id',CAST(period_id AS CHAR),'status',status) FROM hr_leave_period WHERE tenant_id=100000
    AND deleted=0 AND start_date<=CURRENT_DATE AND end_date>=CURRENT_DATE;`).split(/\r?\n/).filter(Boolean).map(row => JSON.parse(row));
  check('组合假期复用覆盖离职日的唯一有效周期', periods.length === 1 && periods[0].status === 'OPEN');
  const periodId = id(periods[0].id);
  const componentId = id(database("SELECT id FROM hr_comp_component WHERE tenant_id=100000 AND component_code='BASE' AND component_type='FIXED' AND status=1;"));
  const leaves = [];
  for (const [unit, quantity, amount] of [['DAY', '2.00', '1839.08'], ['HOUR', '4.00', '459.77']]) {
    const leaveTypeId = id(successful(await api(admin, '/hr/attendance/leave-types', { method: 'POST', body: {
      leaveCode: `${marker}_${unit}`, leaveName: `${marker}_${unit}`, unit, needQuota: 1, isPaid: 1, status: 1, maxDaysPerYear: '10',
      encashmentFlag: 1, encashmentComponentId: componentId, earnedLeaveFlag: 0, carryForwardFlag: 0,
      allowNegativeFlag: 0, allowOverAllocationFlag: 0, roundingMode: 'NONE' } }), '创建隔离组合折现假种'));
    const sourceId = `${marker}_${unit}`;
    successful(await api(admin, '/hr/attendance/leave/ledger', { method: 'POST', body: { employeeId, leaveTypeId, periodId,
      transactionType: 'ADJUSTMENT', sourceId, quantity, remark: `${marker}隔离组合测试核定期初余额${quantity}${unit}` } }), '通过真实台账入口核定测试假期余额');
    const quotaId = id(database(`SELECT id FROM hr_leave_quota WHERE tenant_id=100000 AND employee_id=${employeeId} AND leave_type_id=${leaveTypeId} AND period_id=${periodId} AND deleted=0;`));
    const opening = database(`SELECT JSON_OBJECT('id',CAST(ledger_id AS CHAR),'unit',quantity_unit,'quantity',CAST(leave_days AS CHAR),'type',transaction_type)
      FROM hr_leave_ledger WHERE tenant_id=100000 AND employee_id=${employeeId} AND leave_type_id=${leaveTypeId} AND leave_period_id=${periodId};`);
    const original = JSON.parse(opening);
    check(`组合${unit}假期只通过实际调整形成${quantity}余额`, original.type === 'ADJUSTMENT' && original.quantity === quantity && original.unit === unit
      && database(`SELECT CONCAT(total_quota,':',used_quota,':',frozen_quota,':',available_quota) FROM hr_leave_quota WHERE tenant_id=100000 AND id=${quotaId};`) === `${quantity}:0.00:0.00:${quantity}`);
    leaves.push({ unit, quantity, amount, leaveTypeId, periodId, quotaId, ledgerId: id(original.id), opening });
  }
  return leaves;
}

export function verifySettlementLeaveStage({ database, check, leaves, employeeId, settlementId, reversalId, stage, row }) {
  const sql = value => `CONVERT(UNHEX('${Buffer.from(String(value)).toString('hex')}') USING utf8mb4)`;
  const held = ['submitted', 'approved', 'confirmed'].includes(stage), posted = ['posted', 'reversalPending'].includes(stage);
  const restored = ['restored', 'replacementDraft'].includes(stage);
  for (const leave of leaves) {
    const { quantity, unit, quotaId, leaveTypeId, periodId } = leave;
    const ledger = database(`SELECT JSON_OBJECT('id',CAST(ledger_id AS CHAR),'unit',quantity_unit,'quantity',CAST(leave_days AS CHAR),
      'type',transaction_type,'source',source_biz_type,'businessId',source_biz_id,'key',source_event_key,'reversalOf',CAST(reversal_of_id AS CHAR))
      FROM hr_leave_ledger WHERE tenant_id=100000 AND employee_id=${employeeId} AND leave_type_id=${leaveTypeId} AND leave_period_id=${periodId} ORDER BY ledger_id;`)
      .split(/\r?\n/).filter(Boolean).map(value => JSON.parse(value));
    const expected = `${quantity}:${posted ? quantity : '0.00'}:${held ? quantity : '0.00'}:${held || posted ? '0.00' : quantity}`;
    check(`组合${unit}假期${stage}按原数量记录总额已用冻结和可用`, database(`SELECT CONCAT(total_quota,':',used_quota,':',frozen_quota,':',available_quota)
      FROM hr_leave_quota WHERE tenant_id=100000 AND id=${quotaId};`) === expected);
    check(`组合${unit}假期${stage}原调整台账保留且单位不变`, ledger.every(value => value.unit === unit)
      && ledger[0].id === leave.ledgerId && ledger[0].type === 'ADJUSTMENT' && ledger[0].quantity === quantity && ledger[0].reversalOf === null);
    const original = ledger.filter(value => value.type === 'ENCASHMENT'), refunds = ledger.filter(value => value.reversalOf !== null);
    const freezes = ledger.filter(value => value.type === 'FREEZE'), releases = ledger.filter(value => value.type === 'UNFREEZE');
    check(`组合${unit}假期${stage}冻结释放来源对应且数量相等`, freezes.length - releases.length === (held ? 1 : 0)
      && freezes.every(value => value.quantity === `-${quantity}` && value.source === 'HR_SETTLEMENT' && value.businessId === settlementId)
      && releases.every(value => value.quantity === quantity && value.source === 'HR_SETTLEMENT' && value.businessId === settlementId
        && freezes.some(freeze => freeze.key === value.key.replace(/:UNFREEZE$/, ':FREEZE'))));
    check(`组合${unit}假期${stage}未提前折现或重复返还`, original.length === (posted || restored ? 1 : 0) && refunds.length === (restored ? 1 : 0));
    if (posted || restored) check(`组合${unit}假期实际折现保留五轮冻结历史`, freezes.length === 5 && releases.length === 5
      && original[0].quantity === `-${quantity}` && original[0].source === 'HR_SETTLEMENT' && original[0].businessId === settlementId);
    if (restored) check(`组合${unit}假期冲正明确关联原折现并只返还一次`, refunds[0].reversalOf === original[0].id
      && refunds[0].type === 'ADJUSTMENT' && refunds[0].source === 'HR_SETTLEMENT_REVERSAL' && refunds[0].businessId === reversalId
      && refunds[0].quantity === quantity && refunds[0].key === `HR_SETTLEMENT_REVERSAL:${reversalId}:LEAVE:${original[0].id}`);
    if (row && ['calculated', 'submitted', 'approved', 'confirmed', 'replacementDraft'].includes(stage)) {
      const item = row.items.find(value => value.sourceBizType === 'HR_LEAVE_QUOTA' && String(value.sourceBizId) === quotaId);
      check(`组合${unit}假期${stage}按核定政策逐项四舍五入到分`, item?.amount === leave.amount && !item.posted && item.evidence.unit === unit
        && item.evidence.available === quantity && String(item.evidence.periodId) === periodId
        && item.evidence.ledger.some(value => String(value.ledgerId) === leave.ledgerId));
    }
    if (stage === 'released') check(`组合${unit}假期释放后保留原折现计算历史`, database(`SELECT COUNT(*) FROM hr_final_settlement_item WHERE tenant_id=100000
      AND settlement_id=${settlementId} AND source_biz_type='HR_LEAVE_QUOTA' AND source_biz_id=${sql(quotaId)} AND amount=${leave.amount} AND source_posted_flag=0;`) === '1');
  }
}
