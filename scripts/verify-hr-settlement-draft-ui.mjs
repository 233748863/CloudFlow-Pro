import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

export async function verifySettlementDraftInterface({ hr, finance, employee, database, check, directory, caseTag, marker, employeeId, applicationId, application, policyId, evidence }) {
  const output = path.join(directory, `h2-settlement-draft-ui-${caseTag}`); await fs.mkdir(output, { recursive: true });
  const origin = new URL(hr.url()).origin; const errors = []; hr.on('pageerror', error => errors.push(error.message));
  const literal = value => `CONVERT(UNHEX('${Buffer.from(String(value)).toString('hex')}') USING utf8mb4)`;
  const visit = async (actor, width) => { await actor.setViewportSize({ width, height: 1100 }); await actor.goto(`${origin}/hr/final-settlements`, { waitUntil: 'domcontentloaded' }); };
  const workspace = hr.locator('.final-settlements').first();
  const screenshot = async (scope, name, width) => {
    const layout = await scope.evaluate(element => ({ viewport: innerWidth, document: document.documentElement.scrollWidth, available: element.clientWidth, content: element.scrollWidth,
      controls: [...element.querySelectorAll('button,input:not([type="checkbox"]),[role="combobox"],summary')].filter(control => control.getClientRects().length).map(control => ({ width: control.getBoundingClientRect().width, height: control.getBoundingClientRect().height })) }));
    check(`${name} ${width}px无横向溢出且可见操作区至少44px`, layout.document <= layout.viewport && layout.content <= layout.available && layout.controls.length > 0 && layout.controls.every(control => control.width >= 44 && control.height >= 44));
    await scope.screenshot({ path: path.join(output, `${name}-${width}.png`) });
  };
  const create = async suffix => {
    await workspace.getByRole('button', { name: '建立草稿', exact: true }).click();
    const dialog = hr.getByRole('dialog', { name: '建立离职结算草稿', exact: true });
    await dialog.getByLabel('搜索离职申请单号').fill(`${marker}_${suffix}`);
    await dialog.getByRole('button', { name: '离职申请', exact: true }).click();
    await hr.getByRole('option', { name: `${marker}_${suffix} · ${marker}`, exact: true }).click();
    await dialog.getByLabel('备注', { exact: true }).fill(`${marker}_${suffix}_备注`); return dialog;
  };
  const edit = async () => {
    await hr.getByRole('dialog', { name: '离职结算详情', exact: true }).getByRole('button', { name: '核定取样', exact: true }).click();
    return hr.getByRole('dialog', { name: '核定结算取样', exact: true });
  };
  const fillSampling = async (dialog, reason) => {
    await dialog.getByLabel('搜索补偿政策名称或编号').fill(`${marker}_policy`);
    await dialog.getByRole('button', { name: '补偿政策', exact: true }).click();
    await hr.getByRole('option', { name: `${marker}_核定政策 · ${marker}_policy`, exact: true }).click();
    await dialog.getByLabel('添加取样月份').fill('2026-01'); await dialog.getByRole('button', { name: '添加月份', exact: true }).click();
    await dialog.getByLabel('平均月份数', { exact: true }).fill('0.5'); await dialog.getByLabel('核定原因', { exact: true }).fill(reason);
  };
  await visit(hr, 1440); await workspace.getByRole('heading', { name: '离职结算', exact: true }).waitFor();
  let editor = await create('ui'); await screenshot(editor, 'desktop-create', 1440);
  await editor.getByRole('button', { name: '建立草稿', exact: true }).click(); await editor.waitFor({ state: 'hidden' });
  const detail = hr.getByRole('dialog', { name: '离职结算详情', exact: true }); await detail.getByText(marker, { exact: true }).waitFor();
  const settlementId = database(`SELECT settlement_id FROM hr_final_settlement WHERE tenant_id=100000 AND lifecycle_application_id=${applicationId} AND settlement_kind='NORMAL' AND superseded_flag=0;`); assert.match(settlementId, /^[1-9]\d*$/);
  check('普通HR电脑从实际申请建立唯一草稿', database(`SELECT COUNT(*) FROM hr_final_settlement WHERE tenant_id=100000 AND settlement_id=${settlementId} AND employee_id=${employeeId} AND status='DRAFT';`) === '1');
  editor = await edit(); await fillSampling(editor, `${marker}_电脑核定依据`); await screenshot(editor, 'desktop-sampling', 1440);
  await editor.getByRole('button', { name: '保存核定', exact: true }).click(); await editor.waitFor({ state: 'hidden' }); await detail.getByText(`${marker}_电脑核定依据`, { exact: true }).waitFor();
  await detail.getByRole('button', { name: '重新计算', exact: true }).click(); await detail.getByRole('heading', { name: '经济补偿', exact: true }).waitFor();
  check('电脑核定后实际汇集真实工资及经济补偿', database(`SELECT COUNT(*) FROM hr_final_settlement WHERE tenant_id=100000 AND settlement_id=${settlementId} AND rule_id=${policyId} AND severance_amount=10000 AND JSON_LENGTH(calculation_snapshot,'$.missingRequirements')=0;`) === '1');
  await detail.getByText('查看来源依据', { exact: true }).first().click(); await screenshot(detail, 'desktop-calculated', 1440); evidence.desktop = true;
  await hr.setViewportSize({ width: 320, height: 1100 }); editor = await edit(); await editor.getByRole('button', { name: '清空本单取样', exact: true }).click();
  await editor.getByLabel('备注', { exact: true }).fill(''); await editor.getByRole('button', { name: '保存核定', exact: true }).click(); await editor.waitFor({ state: 'hidden' });
  await detail.getByText('尚未核定取样月份及平均月份数。', { exact: true }).waitFor();
  check('手机清空取样及备注真实落库并使计算失效', database(`SELECT COUNT(*) FROM hr_final_settlement WHERE tenant_id=100000 AND settlement_id=${settlementId} AND remark IS NULL AND JSON_EXTRACT(calculation_snapshot,'$.sampling') IS NULL AND JSON_EXTRACT(calculation_snapshot,'$.calculated')=FALSE;`) === '1');
  await detail.getByRole('button', { name: '重新计算', exact: true }).click(); await detail.getByRole('heading', { name: '待补齐事项', exact: true }).waitFor();
  await screenshot(detail, 'mobile-missing', 320);
  editor = await edit(); await fillSampling(editor, `${marker}_手机保存响应丢失`); await screenshot(editor, 'mobile-sampling', 320);
  let intercepted = false; const routePattern = `**/api/hr/settlement/${settlementId}`;
  await hr.route(routePattern, async route => {
    if (!intercepted && route.request().method() === 'PUT') { intercepted = true; const response = await route.fetch(); assert.equal(response.status(), 200); await route.abort('failed'); }
    else await route.continue();
  });
  try {
    await editor.getByRole('button', { name: '保存核定', exact: true }).click(); await editor.getByRole('button', { name: '读取已保存结果', exact: true }).waitFor();
    check('保存响应丢失仍保留月份分母与原因且停止重复提交', intercepted && await editor.getByLabel('平均月份数', { exact: true }).inputValue() === '0.5'
      && await editor.getByLabel('核定原因', { exact: true }).inputValue() === `${marker}_手机保存响应丢失` && await editor.getByRole('button', { name: '保存核定', exact: true }).isDisabled());
  } finally { await hr.unroute(routePattern); }
  let failedRead = false;
  await hr.route(routePattern, async route => { if (!failedRead && route.request().method() === 'GET') { failedRead = true; await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ code: 503, msg: '隔离读取故障' }) }); } else await route.continue(); });
  try {
    await editor.getByRole('button', { name: '读取已保存结果', exact: true }).click(); await editor.getByText('隔离读取故障', { exact: false }).waitFor();
    check('恢复读取失败不会清空本地输入或解除提交保护', failedRead && await editor.getByRole('button', { name: '保存核定', exact: true }).isDisabled()
      && await editor.getByLabel('核定原因', { exact: true }).inputValue() === `${marker}_手机保存响应丢失`);
  } finally { await hr.unroute(routePattern); }
  await editor.getByRole('button', { name: '读取已保存结果', exact: true }).click(); await editor.getByRole('button', { name: '载入已保存结果', exact: true }).waitFor(); await screenshot(editor, 'mobile-recovered', 320);
  await editor.getByRole('button', { name: '载入已保存结果', exact: true }).click();
  check('明确载入服务器核定后可继续操作', await editor.getByRole('button', { name: '保存核定', exact: true }).isEnabled());
  await editor.getByRole('button', { name: '取消', exact: true }).click(); await detail.getByRole('button', { name: '重新读取', exact: true }).click();
  await detail.getByText(`${marker}_手机保存响应丢失`, { exact: true }).waitFor();
  const savedVersion = database(`SELECT version FROM hr_final_settlement WHERE settlement_id=${settlementId};`);
  check('丢失响应仅保存一次并完整保留核定原因', database(`SELECT COUNT(*) FROM hr_final_settlement WHERE settlement_id=${settlementId} AND JSON_UNQUOTE(JSON_EXTRACT(calculation_snapshot,'$.sampling.reason'))=${literal(`${marker}_手机保存响应丢失`)};`) === '1' && Number(savedVersion) === 5);
  await detail.getByRole('button', { name: '重新计算', exact: true }).click(); await detail.getByRole('heading', { name: '经济补偿', exact: true }).waitFor(); await screenshot(detail, 'mobile-calculated', 320);
  database(`UPDATE hr_lifecycle_application SET effective_date='2026-01-30' WHERE tenant_id=100000 AND id=${applicationId};`);
  await detail.getByRole('button', { name: '核对离职来源', exact: true }).click();
  const refresh = hr.getByRole('dialog', { name: '核对离职来源', exact: true });
  check('日期来源更新要求明确确认', await refresh.getByRole('button', { name: '核对并更新来源', exact: true }).isDisabled());
  await refresh.getByRole('checkbox').check(); await refresh.getByRole('button', { name: '核对并更新来源', exact: true }).click(); await refresh.waitFor({ state: 'hidden' });
  await detail.getByText('2026-01-30', { exact: true }).waitFor(); await detail.getByText('尚未核定取样月份及平均月份数。', { exact: true }).waitFor();
  check('手机实际更新日期后清空旧政策取样和金额', database(`SELECT COUNT(*) FROM hr_final_settlement WHERE tenant_id=100000 AND settlement_id=${settlementId} AND relieving_date='2026-01-30' AND rule_id IS NULL AND net_amount=0 AND JSON_EXTRACT(calculation_snapshot,'$.sampling') IS NULL;`) === '1');
  await screenshot(detail, 'mobile-source-refreshed', 320);
  evidence.mobile = true; evidence.lostResponse = true;
  await detail.getByRole('button', { name: '关闭', exact: true }).click();
  const lostApplicationId = application('lost'); editor = await create('lost'); let lostCreate = false;
  await hr.route('**/api/hr/settlement', async route => { if (!lostCreate && route.request().method() === 'POST') { lostCreate = true; const response = await route.fetch(); assert.equal(response.status(), 200); await route.abort('failed'); } else await route.continue(); });
  try {
    await editor.getByRole('button', { name: '建立草稿', exact: true }).click(); await editor.getByRole('button', { name: '读取已保存结果', exact: true }).waitFor();
    check('建立响应丢失后不盲目重复建单', lostCreate && await editor.getByRole('button', { name: '建立草稿', exact: true }).isDisabled());
    await editor.getByRole('button', { name: '读取已保存结果', exact: true }).click(); await editor.getByRole('button', { name: '查看已保存结算', exact: true }).click(); await detail.getByText(marker, { exact: true }).waitFor();
    check('按原离职申请恢复唯一草稿', database(`SELECT COUNT(*) FROM hr_final_settlement WHERE tenant_id=100000 AND lifecycle_application_id=${lostApplicationId};`) === '1');
  } finally { await hr.unroute('**/api/hr/settlement'); }
  await visit(finance, 320); await finance.getByRole('heading', { name: '离职结算', exact: true }).waitFor();
  const financeList = await finance.evaluate(async () => {
    try { const page = await (await import('/src/services/api/hr/finalSettlements.ts')).finalSettlementApi.list({ pageNum: 1, pageSize: 20 }); return { rows: page.rows.length, error: null }; }
    catch (error) { return { rows: 0, error: error.message }; }
  });
  assert.ok(financeList.rows > 0, `Finance list unavailable: ${financeList.error || 'empty result'}`);
  await finance.getByRole('button', { name: '查看结算', exact: true }).first().waitFor();
  check('财务列表没有建立草稿入口', await finance.getByRole('button', { name: '建立草稿', exact: true }).count() === 0);
  await finance.getByRole('button', { name: '查看结算', exact: true }).first().click(); const financeDetail = finance.getByRole('dialog', { name: '离职结算详情', exact: true }); await financeDetail.getByRole('button', { name: '重新计算', exact: true }).waitFor();
  check('财务详情保留计算入口且无取样修改入口', await financeDetail.getByRole('button', { name: '核定取样', exact: true }).count() === 0);
  await visit(employee, 320); await employee.getByText(/没有权限|无权访问|权限不足/).first().waitFor();
  check('普通员工手机不能进入结算管理', await employee.getByRole('button', { name: '建立草稿', exact: true }).count() === 0);
  check('结算双端页面没有运行错误', errors.length === 0); evidence.uiComplete = true; evidence.readFaultInjections = 1;
}
