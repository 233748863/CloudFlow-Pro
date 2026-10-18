import { expectedMenus, expectedRolePairs } from './check-batch-h-contracts.mjs';
import { assertRuntime, check, checks, database, failureSummary, jsonRows, saveResult } from './batch-h/live-lib.mjs';

const scalar = statement => Number(database(statement));
const noRows = (label, statement) => check(label, jsonRows(statement).length === 0);
let failure;
try {
  assertRuntime();
  for (const [service, port] of [['gateway', 9100], ['auth', 9101], ['workflow', 9102], ['oa', 9103], ['crm', 9104], ['hr', 9105]]) {
    const response = await fetch(`http://127.0.0.1:${port}/actuator/health`, { signal: AbortSignal.timeout(15000) });
    check(`${service}服务实时健康`, response.ok && (await response.json()).status === 'UP');
  }
  check('运行库正式结构保持323张表', scalar(`SELECT COUNT(*) FROM information_schema.tables
    WHERE table_schema=DATABASE() AND table_type='BASE TABLE'`) === 323);
  const menus = jsonRows(`SELECT JSON_OBJECT('menuId',menu_id,'parentId',parent_id,'menuType',menu_type,
    'permission',perms,'route',path,'component',component) FROM sys_menu WHERE menu_id BETWEEN 1800 AND 1899 ORDER BY menu_id`);
  check('运行库H菜单与43项正式定义逐字段一致', menus.length === expectedMenus.length
    && expectedMenus.every(expected => menus.some(actual => Object.keys(expected).every(key => actual[key] === expected[key]))));
  const expectedPairs = expectedRolePairs();
  const pairs = jsonRows(`SELECT JSON_OBJECT('pair',CONCAT(role_id,':',menu_id,':',tenant_id)) FROM sys_role_menu
    WHERE tenant_id=100000 AND role_id BETWEEN 1 AND 11 AND menu_id BETWEEN 1800 AND 1899`);
  check('运行库11角色H授权精确252对', pairs.length === expectedPairs.size && pairs.every(row => expectedPairs.has(row.pair)));
  check('未核定加班政策恢复停用', scalar('SELECT COUNT(*) FROM hr_overtime_type WHERE deleted=0 AND status<>0') === 0);
  check('未核定审批人及最短休息间隔恢复空值', scalar(`SELECT COUNT(*) FROM sys_config WHERE config_key IN
    ('sys.hr.overtime.approvalUsers','sys.hr.shiftRequest.approvalUsers','sys.hr.shift.minimumRestMinutes',
     'sys.oa.consumable.approverUserId','sys.oa.consumable.stockManagerUserId') AND COALESCE(config_value,'')<>''`) === 0);
  check('耗材任务未擅自启用', scalar(`SELECT COUNT(*) FROM sys_job WHERE handler_name IN
    ('oaConsumableStockWarning','oaConsumableStockRecalculate') AND status<>'PAUSED'`) === 0);
  noRows('物化库存数量和成本与台账一致', `SELECT JSON_OBJECT('id',inventory.consumable_id)
    FROM oa_consumable inventory LEFT JOIN
    (SELECT tenant_id,consumable_id,SUM(quantity) AS quantity_sum,SUM(amount) AS amount_sum
     FROM oa_consumable_ledger GROUP BY tenant_id,consumable_id) totals
    ON totals.tenant_id=inventory.tenant_id AND totals.consumable_id=inventory.consumable_id
    WHERE inventory.quantity<>COALESCE(totals.quantity_sum,0) OR inventory.stock_amount<>COALESCE(totals.amount_sum,0)`);
  noRows('每笔耗材结存快照与历史累计一致', `SELECT JSON_OBJECT('id',history.ledger_id) FROM
    (SELECT ledger_id,balance_after,balance_amount_after,
     SUM(quantity) OVER (PARTITION BY tenant_id,consumable_id ORDER BY ledger_id ROWS UNBOUNDED PRECEDING) AS expected_quantity,
     SUM(amount) OVER (PARTITION BY tenant_id,consumable_id ORDER BY ledger_id ROWS UNBOUNDED PRECEDING) AS expected_amount
     FROM oa_consumable_ledger) history
    WHERE history.balance_after<>history.expected_quantity OR history.balance_amount_after<>history.expected_amount`);
  noRows('每笔耗材台账保留一致的通用变更历史', `SELECT JSON_OBJECT('id',ledger.ledger_id)
    FROM oa_consumable_ledger ledger LEFT JOIN oa_asset_log history
    ON history.tenant_id=ledger.tenant_id AND history.log_id=ledger.asset_log_id
    WHERE history.log_id IS NULL OR history.ref_type<>'2' OR history.ref_id<>ledger.consumable_id OR history.quantity_change<>ledger.quantity`);
  noRows('调休累计数量按精确分钟统一向下取两位', `SELECT JSON_OBJECT('id',employee_id)
    FROM hr_overtime_request WHERE settle_mode='COMPENSATORY' AND settlement_status='SETTLED'
    GROUP BY tenant_id,employee_id,leave_type_id,leave_period_id
    HAVING SUM(compensatory_quantity)<>FLOOR(SUM(approved_minutes*compensatory_ratio*100)/60)/100`);
  noRows('调休来源为本租户本人唯一加班事件', `SELECT JSON_OBJECT('id',request_row.request_id)
    FROM hr_overtime_request request_row LEFT JOIN hr_leave_ledger ledger
    ON ledger.tenant_id=request_row.tenant_id AND ledger.ledger_id=request_row.leave_ledger_id
    WHERE request_row.settle_mode='COMPENSATORY' AND request_row.settlement_status='SETTLED'
    AND (request_row.compensatory_quantity IS NULL
      OR (request_row.compensatory_quantity=0 AND request_row.leave_ledger_id IS NOT NULL)
      OR (request_row.compensatory_quantity>0 AND (ledger.ledger_id IS NULL
        OR NOT (ledger.employee_id<=>request_row.employee_id) OR NOT (ledger.leave_type_id<=>request_row.leave_type_id)
        OR NOT (ledger.transaction_type<=>'COMPENSATORY') OR NOT (ledger.quantity_unit<=>'HOUR')
        OR NOT (ledger.source_biz_type<=>'HR_OVERTIME') OR NOT (ledger.source_biz_id<=>CAST(request_row.request_id AS CHAR))
        OR NOT (ledger.source_event_key<=>CONCAT('HR_OVERTIME:',request_row.request_id,':COMPENSATORY'))
        OR NOT (ledger.leave_days<=>request_row.compensatory_quantity))))`);
  noRows('已结算计薪申请恰有一种工资来源', `SELECT JSON_OBJECT('id',request_id)
    FROM hr_overtime_request WHERE settle_mode='PAY' AND settlement_status='SETTLED'
    AND (deleted<>0 OR status<>'APPROVED' OR leave_ledger_id IS NOT NULL
      OR (comp_change_id IS NULL AND payroll_correction_id IS NULL)
      OR (comp_change_id IS NOT NULL AND payroll_correction_id IS NOT NULL))`);
  noRows('正常加班薪资变动匹配本人项目及冻结周期', `SELECT JSON_OBJECT('id',request_row.request_id)
    FROM hr_overtime_request request_row LEFT JOIN hr_comp_change change_row
    ON change_row.tenant_id=request_row.tenant_id AND change_row.id=request_row.comp_change_id
    WHERE request_row.settle_mode='PAY' AND request_row.settlement_status='SETTLED'
      AND request_row.comp_change_id IS NOT NULL
      AND (change_row.id IS NULL OR change_row.deleted<>0 OR change_row.status<>'APPROVED'
        OR NOT (change_row.change_type<=>'OVERTIME') OR NOT (change_row.employee_id<=>request_row.employee_id)
        OR NOT (change_row.salary_component_id<=>request_row.salary_component_id)
        OR NOT (change_row.payroll_period_id<=>request_row.payroll_period_id)
        OR NOT (change_row.source_biz_type<=>'HR_OVERTIME')
        OR NOT (change_row.source_biz_id<=>CAST(request_row.request_id AS CHAR)))`);
  noRows('每笔加班薪资变动都有唯一已结算申请', `SELECT JSON_OBJECT('id',change_row.id)
    FROM hr_comp_change change_row LEFT JOIN hr_overtime_request request_row
    ON request_row.tenant_id=change_row.tenant_id AND CAST(request_row.request_id AS CHAR)=change_row.source_biz_id
    WHERE change_row.source_biz_type='HR_OVERTIME'
      AND (request_row.request_id IS NULL OR request_row.deleted<>0
        OR NOT (request_row.settle_mode<=>'PAY') OR NOT (request_row.settlement_status<=>'SETTLED')
        OR NOT (request_row.comp_change_id<=>change_row.id) OR request_row.payroll_correction_id IS NOT NULL)`);
  noRows('加班补正关联原已发工资且仅在真实应用后结清', `SELECT JSON_OBJECT('id',request_row.request_id)
    FROM hr_overtime_request request_row LEFT JOIN hr_payroll_correction correction
    ON correction.tenant_id=request_row.tenant_id AND correction.correction_id=request_row.payroll_correction_id
    LEFT JOIN hr_salary_slip original_slip
    ON original_slip.tenant_id=request_row.tenant_id AND original_slip.id=correction.original_slip_id
    LEFT JOIN hr_salary_slip correction_slip
    ON correction_slip.tenant_id=request_row.tenant_id AND correction_slip.id=correction.correction_slip_id
    WHERE request_row.payroll_correction_id IS NOT NULL
      AND (request_row.settle_mode<>'PAY' OR request_row.comp_change_id IS NOT NULL OR request_row.leave_ledger_id IS NOT NULL
        OR correction.correction_id IS NULL OR correction.deleted<>0 OR original_slip.id IS NULL OR original_slip.deleted<>0
        OR NOT (original_slip.status<=>'PAID') OR NOT (original_slip.employee_id<=>request_row.employee_id)
        OR correction_slip.id IS NULL OR correction_slip.deleted<>0 OR NOT (correction_slip.employee_id<=>request_row.employee_id)
        OR NOT (JSON_UNQUOTE(JSON_EXTRACT(request_row.settlement_resolution,'$.originalSlipId'))<=>CAST(original_slip.id AS CHAR))
        OR NOT (JSON_UNQUOTE(JSON_EXTRACT(request_row.settlement_resolution,'$.correctionSlipId'))<=>CAST(correction_slip.id AS CHAR))
        OR (request_row.settlement_status='SETTLED' AND (correction.status<>'APPLIED'
          OR correction_slip.status NOT IN ('SUBMITTED','PAID'))))`);
  noRows('成功调班具有完整唯一来源排班', `SELECT JSON_OBJECT('id',request_row.request_id)
    FROM hr_shift_request request_row LEFT JOIN hr_schedule_assignment assignment_row
    ON assignment_row.tenant_id=request_row.tenant_id AND assignment_row.source_shift_request_id=request_row.request_id
    AND assignment_row.target_type='EMPLOYEE' AND assignment_row.schedule_date=request_row.from_date
    AND (assignment_row.target_id=request_row.employee_id OR assignment_row.target_id=request_row.swap_employee_id)
    WHERE request_row.application_status='APPLIED'
    GROUP BY request_row.tenant_id,request_row.request_id,request_row.request_mode
    HAVING COUNT(assignment_row.id)<>CASE request_row.request_mode WHEN 'SINGLE' THEN 1 ELSE 2 END`);
  const coverage = jsonRows(`SELECT JSON_OBJECT(
    'consumableLedgerRows',(SELECT COUNT(*) FROM oa_consumable_ledger),
    'settledCompensatory',(SELECT COUNT(*) FROM hr_overtime_request WHERE settle_mode='COMPENSATORY' AND settlement_status='SETTLED'),
    'settledPay',(SELECT COUNT(*) FROM hr_overtime_request WHERE settle_mode='PAY' AND settlement_status='SETTLED'),
    'settledPayCorrections',(SELECT COUNT(*) FROM hr_overtime_request WHERE settle_mode='PAY' AND settlement_status='SETTLED' AND payroll_correction_id IS NOT NULL),
    'appliedShift',(SELECT COUNT(*) FROM hr_shift_request WHERE application_status='APPLIED'))`)[0];
  await saveResult('invariants', null, { coverage, boundary: '只读一致性核验；零业务样本不等于该业务闭环验收通过' });
  console.log(`PASS H运行库一致性 ${checks.length} 项；业务样本数 ${JSON.stringify(coverage)}`);
} catch (error) {
  failure = error;
  console.log(JSON.stringify(failureSummary(error)));
  await saveResult('invariants', failure);
  process.exitCode = 1;
}
