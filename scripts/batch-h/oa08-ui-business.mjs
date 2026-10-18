import { check, until } from './live-lib.mjs';
import { cents, id, noCost, records, requestPath, same, stockPath } from './oa08-live.mjs';

const statusLabels = { DRAFT: '草稿', APPROVING: '审批中', APPROVED: '已批准', REJECTED: '已驳回', ISSUED: '已发足', CANCELLED: '已取消' };
const transactionLabels = { INBOUND: '入库', OUTBOUND: '领用', ADJUST: '盘点调整', SCRAP: '报废', RETURN: '退回' };
const money = value => value == null ? '待估价' : `¥ ${String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;

async function responseData(response, label) {
  check(`${label}真实浏览器请求HTTP成功`, response.status() === 200);
  const body = await response.json();
  check(`${label}真实浏览器请求业务成功`, body.code === 200);
  return body.data;
}

async function getDuring(page, endpoint, action, label, query = {}) {
  const [response] = await Promise.all([
    page.waitForResponse(reply => {
      const url = new URL(reply.url());
      return reply.request().method() === 'GET' && url.pathname.endsWith(endpoint)
        && Object.entries(query).every(([key, value]) => url.searchParams.get(key) === String(value));
    }, { timeout: 45000 }),
    action(),
  ]);
  return responseData(response, label);
}

async function tableReady(scope, label) {
  await until(() => scope.locator('tbody [role="status"]').count(), count => count === 0, label, 45000);
  check(`${label}无页面加载错误`, await scope.getByRole('alert').count() === 0);
}

async function requestView(live, name, actor, owner, expected) {
  await live.step(`browser-business:request:${name}:${actor}`, async () => {
    const requestId = id(live.scenario(name).requestId);
    const dispatch = actor !== owner;
    const endpoint = `${requestPath}/${requestId}${dispatch ? '/dispatch-detail' : ''}`;
    const before = await live.ok(actor, endpoint);
    check('业务页面核验使用已真实办理且状态明确的原申请', (!expected.status || before.status === expected.status)
      && before.items.reduce((total, item) => total + item.issuedQuantity, 0) === expected.issued
      && before.items.reduce((total, item) => total + item.returnedQuantity, 0) === expected.returned);
    const cost = actor === 'admin';
    if (!cost) noCost(before, '业务页面对应本人或仓管API仍不回传成本');
    const page = live.sessions[actor].page;
    const route = `/admin/consumable-request?requestId=${requestId}${dispatch ? '&scope=DISPATCH' : ''}`;
    const loaded = await getDuring(page, endpoint, () => page.goto(route, { waitUntil: 'domcontentloaded' }), '领用业务详情');
    check('领用页面读取原单当前版本而非旧草稿', String(loaded.requestId) === requestId
      && loaded.status === before.status && loaded.version === before.version);
    const dialog = page.getByRole('dialog');
    await dialog.waitFor();
    await dialog.getByText(`${statusLabels[before.status]} · 当前版本 ${before.version}`, { exact: true }).waitFor();
    const tables = dialog.locator('table');
    check('领用详情包含明细与不可变流转记录两表', await tables.count() === 2);
    const rows = tables.nth(0).locator('tbody tr');
    check('领用明细真实行数一致', await rows.count() === before.items.length);
    for (let index = 0; index < before.items.length; index++) {
      const item = before.items[index];
      const cells = (await rows.nth(index).locator('td').allTextContents()).map(value => value.trim());
      check('页面逐耗材展示批准已发已退及剩余额度', cells[0].includes(item.consumableName) && cells[1] === item.unit
        && JSON.stringify(cells.slice(2, 7)) === JSON.stringify([item.applyQuantity, item.approvedQuantity, item.issuedQuantity,
          item.returnedQuantity, item.approvedQuantity - item.issuedQuantity].map(String)));
      check('页面金额列仅供原授权管理身份读取', cells.length === (cost ? 9 : 8)
        && (!cost || cells[7] === money(item.amount)));
    }
    const transactions = before.transactions || [];
    const history = tables.nth(1).locator('tbody tr');
    check('页面保留全部实际发料退回冲正记录', await history.count() === Math.max(1, transactions.length));
    if (!transactions.length) check('未发料申请页面明确说明审批不扣库存', await history.getByText('尚无库存流转；审批不会直接扣库存。', { exact: true }).count() === 1);
    for (const transaction of transactions) {
      const row = history.filter({ has: page.getByText(`台账 #${transaction.ledgerId}`, { exact: true }) });
      check('页面流转记录保留唯一原台账标识', await row.count() === 1);
      const cells = (await row.locator('td').allTextContents()).map(value => value.trim());
      const label = `${transaction.reversalOfLedgerId ? '冲正 · ' : ''}${transactionLabels[transaction.transactionType]}${transaction.reversed ? '（已冲正）' : ''}`;
      check('页面冲正标记及有符号数量来自真实记录', cells[2] === label && cells[3] === `${transaction.quantity} ${transaction.unit}`);
      const returnAllowed = dispatch && transaction.transactionType === 'OUTBOUND' && !transaction.reversed
        && !transaction.reversalOfLedgerId && transaction.returnedQuantity < Math.abs(transaction.quantity);
      check('页面仅为未冲正且尚可退回的发料显示退回入口', await row.getByRole('button', { name: '退回登记', exact: true }).count() === (returnAllowed ? 1 : 0));
    }
    check('已发足页面不再显示分批发料按钮', await dialog.getByRole('button', { name: '分批发料', exact: true }).count()
      === (dispatch && before.status === 'APPROVED' ? 1 : 0));
    check('已办理原单不重新开放提交审批', await dialog.getByRole('button', { name: '提交审批', exact: true }).count() === 0);
    const refreshed = await getDuring(page, endpoint, () => page.reload({ waitUntil: 'domcontentloaded' }), '领用业务刷新');
    await page.getByRole('dialog').getByText(`${statusLabels[before.status]} · 当前版本 ${before.version}`, { exact: true }).waitFor();
    check('刷新页面仍恢复同一真实状态及累计发退数量', refreshed.version === before.version && refreshed.status === before.status
      && JSON.stringify(refreshed.items.map(item => [item.itemId, item.issuedQuantity, item.returnedQuantity]))
        === JSON.stringify(before.items.map(item => [item.itemId, item.issuedQuantity, item.returnedQuantity])));
    same('只读浏览器核验未推进原申请及流水', await live.ok(actor, endpoint), before);
  });
}

async function purchaseView(live, name) {
  await live.step(`browser-business:purchase:${name}`, async () => {
    const state = live.scenario(name);
    const purchaseId = id(state.purchaseId);
    const purchase = await live.ok('admin', `/oa/purchase/request/${purchaseId}`);
    const receipts = records(await live.ok('admin', `/oa/purchase/request/${purchaseId}/receipts?pageNum=1&pageSize=100`));
    check('采购页面检查使用真实收货且已批准的原采购', purchase.status === 'RECEIVED' && receipts.length > 0);
    const page = live.sessions.admin.page;
    const ledgerId = id(receipts.at(-1).ledgerId);
    await getDuring(page, `${stockPath}/ledger/${ledgerId}`, () => page.goto(`/admin/consumable-ledger?ledgerId=${ledgerId}`,
      { waitUntil: 'domcontentloaded' }), '采购台账详情');
    const loaded = await getDuring(page, `/oa/purchase/request/${purchaseId}/receipts`, async () => {
      await page.getByRole('dialog').getByRole('button', { name: `查看来源采购单 #${purchaseId}`, exact: true }).click();
    }, '来源采购收货记录');
    const dialog = page.getByRole('dialog').filter({ has: page.getByRole('heading', { name: '真实收货记录', exact: true }) });
    await dialog.waitFor();
    await tableReady(dialog, '来源采购收货记录');
    check('台账深链进入同一采购并展示全部原收货', records(loaded).length === receipts.length);
    const itemRows = dialog.locator('table').nth(0).locator('tbody tr');
    check('采购来源页面保留全部采购明细', await itemRows.count() === purchase.items.length);
    for (let index = 0; index < purchase.items.length; index++) {
      const item = purchase.items[index];
      const cells = (await itemRows.nth(index).locator('td').allTextContents()).map(value => value.trim());
      check('采购页面已收量扣除冲正并保持计量单位', cells[0] === item.consumableName && cells[1] === `${item.quantity} ${item.unit}`
        && cells[2] === `${item.receivedQuantity} ${item.unit}`);
    }
    const history = dialog.locator('table').nth(1).locator('tbody tr');
    check('采购页面不删除已冲正的收货历史', await history.count() === receipts.length);
    for (const receipt of receipts) {
      const row = history.filter({ has: page.getByRole('button', { name: `原流水 #${receipt.ledgerId}`, exact: true }) });
      check('采购页面收货原台账可以唯一追溯', await row.count() === 1);
      check('采购页面派生有效或冲正标记正确', (await row.locator('td').nth(3).innerText()).trim() === (receipt.reversed ? '已冲正' : '有效收货'));
      check('已冲正收货展示独立反向台账入口', await row.getByRole('button', { name: `冲正 #${receipt.reversalLedgerId}`, exact: true }).count()
        === (receipt.reversalLedgerId ? 1 : 0));
    }
    same('采购页面只读核验不推进来源版本及已收量', await live.ok('admin', `/oa/purchase/request/${purchaseId}`), purchase);
  });
}

const reportColumns = {
  stock: ['openingQuantity', 'inboundQuantity', 'outboundQuantity', 'closingQuantity', 'openingAmount', 'inboundAmount', 'outboundAmount', 'closingAmount'],
  usage: ['issuedQuantity', 'returnedQuantity', 'netQuantity', 'issuedAmount', 'returnedAmount', 'netAmount'],
  cost: ['openingAmount', 'inboundCost', 'issuedAmount', 'returnedAmount', 'netAmount', 'scrapAmount', 'adjustAmount', 'closingAmount'],
};

async function reportView(live, name) {
  await live.step(`browser-business:reports:${name}`, async () => {
    const materialId = id(live.scenario(name).materialId);
    const material = await live.readMaterial(materialId);
    const before = live.proof(materialId);
    const page = live.sessions.admin.page;
    await getDuring(page, `${stockPath}/reports/stock`, () => page.goto('/admin/consumable-reports',
      { waitUntil: 'domcontentloaded' }), '业务报表初始读取');
    const workspace = page.locator('.consumable-reports-page');
    await workspace.getByRole('textbox', { name: '搜索耗材目录', exact: true }).fill(material.name);
    await getDuring(page, `${stockPath}/list`, () => workspace.getByRole('button', { name: '查找', exact: true }).click(), '报表耗材目录', { name: material.name });
    const picker = workspace.getByRole('button', { name: '选择耗材', exact: true });
    check('报表使用页面真实耗材选择按钮', await picker.count() === 1);
    await until(() => picker.isEnabled(), Boolean, '业务报表耗材选择加载完成', 45000);
    await picker.click();
    await page.getByRole('listbox').waitFor();
    const choice = page.getByRole('option', { name: `${material.name} · ${material.model || '无型号'} · ${material.unit}（可用 ${material.quantity}）`, exact: true });
    await choice.waitFor();
    check('报表选择完整耗材名称型号单位且不误选同名前缀', await choice.count() === 1);
    await choice.click();
    let data = await getDuring(page, `${stockPath}/reports/stock`, () => workspace.getByRole('button', { name: '查询报表', exact: true }).click(),
      '业务报表按真实耗材过滤', { consumableId: materialId });
    for (const [kind, title] of [['stock', '进出存'], ['usage', '领用统计'], ['cost', '成本']]) {
      if (kind !== 'stock') data = await getDuring(page, `${stockPath}/reports/${kind}`,
        () => workspace.getByRole('navigation', { name: '耗材报表类型' }).getByRole('button', { name: title, exact: true }).click(),
        `业务${title}报表`, { consumableId: materialId });
      await tableReady(workspace, `业务${title}报表`);
      const values = records(data);
      check('业务报表过滤仅返回当前耗材及原计量单位', values.length <= 1
        && values.every(value => String(value.consumableId) === materialId && value.unit === material.unit));
      const rows = workspace.locator('table tbody tr');
      if (!values.length) {
        check('没有领用事实时页面明确显示空报表', kind === 'usage' && name === 'purchase-links'
          && await rows.getByText('暂无符合条件的记录', { exact: true }).count() === 1);
        continue;
      }
      check('业务报表页面仅显示当前耗材一行', await rows.count() === 1);
      const cells = (await rows.locator('td').allTextContents()).map(value => value.trim());
      const value = values[0];
      check('业务报表页面耗材名称与单位保持一致', cells[0] === material.name && cells[1] === material.unit);
      for (const [index, column] of reportColumns[kind].entries()) {
        const expected = value[column] == null ? '—' : /Amount|Cost/.test(column) ? money(value[column]) : String(value[column]);
        check(`业务${title}页面${column}与真实API一致`, cells[index + 2] === expected);
      }
      if (kind === 'usage' && name === 'partial') check('页面覆盖非零发料成本和净领用事实', Number(value.issuedQuantity) === 6
        && Number(value.returnedQuantity) === 0 && Number(value.netQuantity) === 6 && cents(value.issuedAmount) === 2200n);
      if (kind === 'usage' && name === 'partial-multi-first') check('页面覆盖分次退回且净领用归零', Number(value.issuedQuantity) === 2
        && Number(value.returnedQuantity) === 2 && Number(value.netQuantity) === 0 && cents(value.netAmount) === 0n);
    }
    same('报表浏览器核验不改变库存及不可变流水', live.proof(materialId), before);
  });
}

export async function businessUi(live) {
  check('业务页面使用真实领用部分并发及采购联动完成证据', ['approval', 'partial', 'concurrency'].every(name => live.fixture.phases[name]?.passed)
    && live.fixture.purchaseCoverage?.ordinary?.passed && live.fixture.purchaseCoverage?.concurrency?.passed && live.fixture.purchaseCoverage?.links?.passed);
  const cases = [
    ['approval', 'employee', { status: 'ISSUED', issued: 3, returned: 0 }],
    ['partial-request', 'employee', { status: 'ISSUED', issued: 6, returned: 0 }],
    ['partial-multi', 'employee', { status: 'ISSUED', issued: 4, returned: 2 }],
  ];
  for (const actor of ['employee', 'peer']) {
    const name = `concurrency-${actor}`;
    const current = await live.ok(actor, `${requestPath}/${id(live.scenario(name).requestId)}`);
    check('并发结果页面保留已发足或原批准待发状态', ['APPROVED', 'ISSUED'].includes(current.status)
      && current.items.length === 1 && current.items[0].issuedQuantity === (current.status === 'ISSUED' ? 4 : 0));
    cases.push([name, actor, { status: current.status, issued: current.items[0].issuedQuantity, returned: 0 }]);
  }
  for (const [name, owner, expected] of cases) for (const actor of [owner, 'oa', 'admin']) await requestView(live, name, actor, owner, expected);
  for (const name of ['purchase-normal', 'purchase-concurrent', 'purchase-links']) await purchaseView(live, name);
  for (const name of ['partial', 'partial-multi-first', 'purchase-links']) await reportView(live, name);
  const pending = [];
  if (live.fixture.purchaseCoverage?.taxed?.passed) await purchaseView(live, 'purchase-taxed');
  else pending.push('purchase-taxed');
  live.fixture.businessUiCoverage = { requestViews: cases.length * 3, purchaseViews: pending.length ? 3 : 4,
    reportMaterials: 3, pending, checkedAt: new Date().toISOString() };
  await live.persist();
  if (pending.length) throw new Error('H_OA_BROWSER_TAXED_PURCHASE_PENDING');
}
