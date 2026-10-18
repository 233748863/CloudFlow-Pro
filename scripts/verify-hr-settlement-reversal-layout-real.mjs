import assert from 'node:assert/strict';
import path from 'node:path';

export async function verifyReversalLayouts(context) {
  const { admin, api, successful, database, check, directory, caseTag, evidence, id, original } = context;
  const retained = JSON.parse(database(`SELECT COALESCE(JSON_ARRAYAGG(JSON_OBJECT('id',CAST(candidate.settlement_id AS CHAR))),JSON_ARRAY()) FROM (
    SELECT s.settlement_id FROM hr_final_settlement s JOIN hr_employee e ON e.tenant_id=s.tenant_id AND e.id=s.employee_id
    WHERE s.tenant_id=100000 AND s.settlement_kind='REVERSAL' AND s.status='CLOSED' AND s.settlement_id!=${id}
      AND e.create_by REGEXP '^settlement_draft_[a-f0-9]{12}$' ORDER BY s.settlement_id DESC LIMIT 2) candidate;`));
  const rows = [{ id, originalNo: original.settlementNo }];
  for (const retainedRow of retained) {
    assert.match(retainedRow.id, /^[1-9]\d*$/);
    const row = successful(await api(admin, `/hr/settlement/${retainedRow.id}`), '读取此前隔离冲正以复查显示');
    assert.equal(row.settlementKind, 'REVERSAL'); assert.equal(row.status, 'CLOSED');
    rows.push({ id: retainedRow.id, originalNo: row.reversal.originalSettlementNo });
  }
  for (const row of rows) for (const width of [1440, 320]) {
    await admin.setViewportSize({ width, height: 1050 });
    await admin.goto(new URL(`/hr/final-settlements?settlementId=${row.id}`, admin.url()).href, { waitUntil: 'domcontentloaded' });
    const detail = admin.getByRole('dialog', { name: '离职结算详情', exact: true });
    await detail.getByRole('heading', { name: '冲正单', exact: true }).waitFor();
    const relation = detail.getByRole('region', { name: '冲正关系', exact: true });
    check(`${row.id}/${width}px冲正详情及原单编号完整显示且操作区至少44px`, await relation.evaluate(element => {
      const bounds = element.getBoundingClientRect();
      return document.documentElement.scrollWidth <= innerWidth && element.scrollWidth <= element.clientWidth
        && Array.from(element.querySelectorAll('button')).every(button => {
          const control = button.getBoundingClientRect();
          return control.left >= bounds.left && control.right <= bounds.right && control.width >= 44 && control.height >= 44 && button.scrollWidth <= button.clientWidth;
        });
    }) && (await relation.innerText()).includes(row.originalNo) && await detail.getByRole('button', { name: '重新计算', exact: true }).count() === 0);
    await relation.scrollIntoViewIfNeeded();
    await detail.screenshot({ path: path.join(directory, `h2-reversal-layout-${caseTag}-${row.id}-${width}.png`) });
    await relation.getByRole('button', { name: '查看原结算', exact: true }).click();
    await detail.getByRole('heading', { name: '原结算已有冲正单', exact: true }).waitFor();
    await detail.getByRole('button', { name: '查看关联冲正单', exact: true }).click();
    await detail.getByRole('heading', { name: '冲正单', exact: true }).waitFor();
    check(`${row.id}/${width}px原单与冲正单可双向查看`, true);
  }
  evidence.reversalLayoutRecords = rows.map(row => row.id);
}
