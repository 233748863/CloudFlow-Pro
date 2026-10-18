import { check, jsonRows, sqlText } from './live-lib.mjs';
import { cents, records, stockPath } from './oa08-live.mjs';

const sum = (rows, field) => rows.reduce((total, row) => total + BigInt(row[field] || 0), 0n);
const money = (rows, field) => rows.reduce((total, row) => total + cents(row[field] ?? '0.00'), 0n);

function scopedUsage(live, actor, materialId, rows) {
  const account = live.sessions.accounts[actor];
  const policies = jsonRows(`SELECT JSON_OBJECT('type', role.ds_type, 'departments', role.ds_scope, 'department', CAST(usr.dept_id AS CHAR))
    FROM sys_user usr JOIN sys_user_role binding ON binding.tenant_id = usr.tenant_id AND binding.user_id = usr.user_id
    JOIN sys_role role ON role.tenant_id = binding.tenant_id AND role.role_id = binding.role_id
    WHERE usr.tenant_id = ${sqlText(live.tenantId)} AND usr.user_id = ${sqlText(account.userId)}
      AND usr.status = '0' AND usr.deleted = 0 AND role.status = '0' AND role.deleted = 0`);
  check('领用报表期望范围来自真实账号既有角色及部门', policies.length > 0
    && policies.every(policy => policy.department === account.deptId && (policy.type == null || [0, 1, 2, 3, 4].includes(policy.type))));
  const type = Math.min(...policies.map(policy => policy.type ?? 4));
  if (type === 0) return rows;
  let departments = [];
  if (type === 1) departments = [...new Set(policies.flatMap(policy => (policy.departments || '').split(',').map(value => value.trim()).filter(Boolean)))];
  if (type === 2 && account.deptId) departments = [account.deptId, ...jsonRows(`SELECT JSON_OBJECT('id', CAST(dept_id AS CHAR))
    FROM sys_dept WHERE tenant_id = ${sqlText(live.tenantId)} AND FIND_IN_SET(${sqlText(account.deptId)}, ancestors) > 0`).map(row => row.id)];
  if (type === 3 && account.deptId) departments = [account.deptId];
  const identities = jsonRows(`SELECT JSON_OBJECT('id', CAST(ledger_id AS CHAR), 'department', CAST(dept_id AS CHAR),
    'beneficiary', CAST(beneficiary_id AS CHAR)) FROM oa_consumable_ledger
    WHERE tenant_id = ${sqlText(live.tenantId)} AND consumable_id = ${sqlText(materialId)}`);
  const permitted = new Set(identities.filter(row => departments.length ? departments.includes(row.department)
    : row.beneficiary === account.userId).map(row => row.id));
  return rows.filter(row => permitted.has(row.id));
}

export async function reports(live) {
  const materialIds = [...new Set(Object.values(live.fixture.scenarios).map(state => state.materialId).filter(Boolean))];
  check('四类报表使用已真实创建的耗材业务来源', materialIds.length >= 3);
  const through = new Date(Date.now() + 32 * 3600000).toISOString().slice(0, 10);
  const units = new Set();
  for (const materialId of materialIds) {
    const material = await live.readMaterial(materialId);
    units.add(material.unit);
    const query = new URLSearchParams({ consumableId: materialId, from: '2026-09-14T00:00:00', to: `${through}T00:00:00`, pageSize: '100' });
    const proof = live.proof(materialId);
    const stock = records(await live.ok('finance', `${stockPath}/reports/stock?${query}`));
    check('进出存报表逐耗材保留准确单位', stock.length === 1 && stock[0].unit === material.unit && String(stock[0].consumableId) === materialId);
    check('真实进出存报表期初加净变化等于期末', sum(stock, 'openingQuantity') + sum(stock, 'inboundQuantity') - sum(stock, 'outboundQuantity') === sum(stock, 'closingQuantity')
      && sum(stock, 'closingQuantity') === BigInt(material.quantity));
    check('进出存报表金额与逐行流水及库存缓存一致', money(stock, 'openingAmount') + money(stock, 'inboundAmount') - money(stock, 'outboundAmount') === money(stock, 'closingAmount')
      && money(stock, 'closingAmount') === cents(material.stockAmount) && money(proof.ledger, 'amount') === cents(material.stockAmount));
    const usageLedger = proof.ledger.filter(row => row.sourceType === 'CONSUMABLE_REQUEST' && ['OUTBOUND', 'RETURN'].includes(row.type));
    for (const actor of ['admin', 'finance']) {
      const expected = scopedUsage(live, actor, materialId, usageLedger);
      for (const groupBy of ['CONSUMABLE', 'DEPARTMENT', 'PERSON']) {
        query.set('groupBy', groupBy);
        const usage = records(await live.ok(actor, `${stockPath}/reports/usage?${query}`));
        check(`真实${actor}/${groupBy}领用报表按授权范围计入退回冲正且保留单位`, usage.every(row => row.unit === material.unit)
          && sum(usage, 'netQuantity') === -sum(expected, 'quantity') && money(usage, 'netAmount') === -money(expected, 'amount'));
        check(`真实${actor}/${groupBy}已发减已退等于净领用`, sum(usage, 'issuedQuantity') - sum(usage, 'returnedQuantity') === sum(usage, 'netQuantity')
          && money(usage, 'issuedAmount') - money(usage, 'returnedAmount') === money(usage, 'netAmount'));
      }
    }
    const cost = records(await live.ok('finance', `${stockPath}/reports/cost?${query}`));
    check('成本报表逐耗材结存与真实库存金额一致', cost.length === 1 && cost[0].unit === material.unit && money(cost, 'closingAmount') === cents(material.stockAmount));
    check('成本报表采购入库成本按来源及冲正净额统计', money(cost, 'inboundCost') === money(proof.ledger.filter(row => row.type === 'INBOUND'), 'amount'));
    const scoped = scopedUsage(live, 'finance', materialId, usageLedger);
    check('财务成本报表净领用金额同样遵守既有部门范围', money(cost, 'netAmount') === -money(scoped, 'amount'));
  }
  check('不同计量单位的数量没有合并为单一行', units.size >= 2);
  const warningId = live.fixture.scenarios.warning?.materialId;
  check('预警报表包含真实预警测试来源', !!warningId);
  const lowStock = records(await live.ok('admin', `${stockPath}/low-stock`));
  check('第四类预警报表按实际数量与阈值筛选', lowStock.some(row => String(row.consumableId) === warningId)
    && lowStock.every(row => row.quantity <= row.lowStockThreshold));
}
