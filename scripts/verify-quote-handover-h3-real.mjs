import assert from 'node:assert/strict';
import { verifyQuoteTeamInterface } from './verify-quote-team-h3-ui.mjs';
import { verifyHandoverFromHr } from './verify-handover-h3-real.mjs';
import { verifyHrSuccessor } from './verify-hr-successor-h3-real.mjs';
import { verifyQuoteContractCopy } from './verify-quote-contract-copy-h3-real.mjs';

export async function verifyQuoteHandover(context) {
  const { admin, api, successful, session, database, check, caseTag, evidence } = context;
  const sales = context.hrSuccessorUiOnly ? null : await session('g_opportunity_sales');
  const manager = context.hrSuccessorUiOnly ? null : await session('g_opportunity_manager');
  const employee = await session('g_holiday_employee');
  const foreign = context.hrSuccessorUiOnly ? null : await session('g_import_tenant');
  const literal = value => `CONVERT(UNHEX('${Buffer.from(String(value)).toString('hex')}') USING utf8mb4)`;
  const user = name => Number(database(`SELECT user_id FROM sys_user WHERE tenant_id=100000 AND user_name=${literal(name)};`));
  const adminId = user('g_import_admin');
  const salesId = user('g_opportunity_sales');
  const managerId = user('g_opportunity_manager');
  const grants = database('SELECT menu_id FROM sys_role_menu WHERE tenant_id=100000 AND role_id=5 ORDER BY menu_id;');
  const forbidden = (result, label) => check(`${label} HTTP=${result.status} code=${result.body?.code}`, result.status === 403 && result.body?.code === 403);
  const reject = (result, label, message = /无权|不存在|团队|成员|比例|主责|报价|负责人|版本|pending|closed|found/) => {
    const text = result.body?.msg || result.body?.message || '';
    check(`${label} HTTP=${result.status} code=${result.body?.code} message=${text}`,
      ([400, 403, 404, 409].includes(result.status) || result.status === 200 && result.body?.code === 500)
      && result.body?.code !== 200 && message.test(text));
  };
  const member = (salesUserId, roleType, allocatedPercentage) => ({ salesUserId, roleType, allocatedPercentage });
  const pair = (ownerId = adminId, percentage = '0.6000', other = '0.4000') => [member(ownerId, 'OWNER', percentage), member(salesId, 'CO_SELLER', other)];
  const teamPath = (type, id) => `/crm/deal-team/${type}/${id}`;
  const readTeam = async (type, id, page = admin, version) => successful(await api(page, `${teamPath(type, id)}${version === undefined ? '' : `?teamVersion=${version}`}`), '读取真实团队');
  const input = (team, members) => ({ businessVersion: team.businessVersion, teamVersion: team.teamVersion, members, remark: `H3_${caseTag}_team` });
  const saveTeam = async (type, id, team, members, page = admin) => successful(await api(page, teamPath(type, id), { method: 'PUT', body: input(team, members) }), '保存真实团队');
  const readQuote = async (id, page = admin) => successful(await api(page, `/crm/quote/${id}`), '读取真实报价');
  const editQuote = async (quote, changes, page = admin) => {
    successful(await api(page, '/crm/quote', { method: 'PUT', body: { ...quote, ...changes } }), '真实报价编辑');
    return readQuote(quote.quoteId, page);
  };
  const createCustomer = async (suffix, ownerId = adminId, page = admin) => {
    const name = `H3_QH_${caseTag}_${suffix}`;
    successful(await api(page, '/crm/customer', { method: 'POST', body: { customerCode: name, customerName: name, ownerId } }), '真实创建客户');
    const id = database(`SELECT customer_id FROM crm_customer WHERE tenant_id=100000 AND customer_code=${literal(name)} AND deleted=0;`);
    assert.match(id, /^\d+$/);
    return Number(id);
  };
  const createQuote = async (suffix, customerId, ownerId = adminId, page = admin, opportunityId) => {
    const name = `H3_QH_${caseTag}_${suffix}`;
    successful(await api(page, '/crm/quote', { method: 'POST', body: {
      quoteName: name, quoteNo: name, customerId, ownerId, opportunityId, ownerName: '不可信的客户端姓名', opportunityName: '不可信的来源名称',
      currency: 'CNY', totalAmount: '100.01', status: 'DRAFT', quoteLines: [{ productName: '真实协议服务', quantity: 1, unitPrice: '100.01', discountRate: 100, taxRate: 0 }],
    } }), '真实创建报价');
    const id = database(`SELECT quote_id FROM crm_quote WHERE tenant_id=100000 AND quote_no=${literal(name)} AND deleted=0;`);
    assert.match(id, /^\d+$/);
    return readQuote(Number(id), page);
  };
  const createOpportunity = async (suffix, customerId, ownerId = adminId) => {
    const name = `H3_QH_${caseTag}_${suffix}`;
    successful(await api(admin, '/crm/opportunity', { method: 'POST', body: { opportunityName: name, customerId, ownerId, expectedAmount: '200.00' } }), '真实创建报价来源商机');
    const id = database(`SELECT opportunity_id FROM crm_opportunity WHERE tenant_id=100000 AND opportunity_name=${literal(name)} AND deleted=0;`);
    assert.match(id, /^\d+$/);
    return successful(await api(admin, `/crm/opportunity/${id}`), '读取实际来源商机');
  };
  const shared = { ...context, sales, manager, employee, foreign, adminId, salesId, managerId, literal, forbidden, reject, member, pair, teamPath, readTeam, saveTeam, input, readQuote, editQuote, createCustomer, createQuote, createOpportunity };
  if (context.quoteContractCopyOnly) {
    await verifyQuoteContractCopy(shared);
    check('报价转合同验收后EMPLOYEE完整授权逐条未变', database('SELECT menu_id FROM sys_role_menu WHERE tenant_id=100000 AND role_id=5 ORDER BY menu_id;') === grants);
    return;
  }
  if (context.hrSuccessorOnly) {
    await verifyHrSuccessor(shared);
    check('HR指定接任人验收后EMPLOYEE完整授权逐条未变', database('SELECT menu_id FROM sys_role_menu WHERE tenant_id=100000 AND role_id=5 ORDER BY menu_id;') === grants);
    return;
  }
  const customerId = await createCustomer('customer');
  let recalculated = await createQuote('untrusted_amounts', customerId);
  recalculated = await editQuote(recalculated, { totalAmount: '999999.99', taxAmount: '999999.99', quoteLines: [{ productName: '可信服务端计算', quantity: '2.50', unitPrice: '10.01', discountRate: '95', taxRate: '13', lineAmount: '888888.88', taxAmount: '777777.77' }] });
  check('真实报价拒绝客户端伪造行金额及税额，按数量单价百分数重新计算', Number(recalculated.totalAmount) === 23.77 && Number(recalculated.taxAmount) === 3.09
    && Number(recalculated.quoteLines[0].lineAmount) === 23.77 && Number(recalculated.quoteLines[0].taxAmount) === 3.09);
  recalculated = await editQuote(recalculated, { quoteLines: [{ ...recalculated.quoteLines[0], quantity: '3.00' }] });
  check('真实报价编辑数量自动重算旧行合计，团队预览同步实际新金额', Number(recalculated.totalAmount) === 28.53 && Number(recalculated.taxAmount) === 3.71
    && Number((await readTeam('QUOTE', recalculated.quoteId)).members[0].allocatedAmount) === 28.53);
  evidence.quoteServerAmounts = true;
  let quote = await createQuote('main', customerId);
  let current = await readTeam('QUOTE', quote.quoteId);
  check('未配置报价团队显示主责100%且没有虚构历史', current.teamVersion === 0 && current.businessVersion === 0 && current.members.length === 1
    && current.ownerId === adminId && Number(current.members[0].allocatedPercentage) === 1 && quote.currencyLocked === false);
  check('报价创建从真实HR取得主责姓名', quote.ownerName === '导入验收负责人');
  quote = await editQuote(quote, { currency: 'USD' });
  check('尚未产生分成记录的报价可更换币种', quote.currency === 'USD' && quote.currencyLocked === false);
  quote = await editQuote(quote, { currency: 'CNY' });
  current = await readTeam('QUOTE', quote.quoteId);
  forbidden(await api(employee, teamPath('QUOTE', quote.quoteId)), '员工不能读报价团队');
  forbidden(await api(employee, teamPath('QUOTE', quote.quoteId), { method: 'PUT', body: input(current, pair()) }), '员工不能写报价团队');
  forbidden(await api(sales, teamPath('QUOTE', quote.quoteId), { method: 'PUT', body: input(current, pair()) }), '销售代表未获团队维护权');
  reject(await api(foreign, teamPath('QUOTE', quote.quoteId)), '外租户不能读取报价团队');
  reject(await api(foreign, teamPath('QUOTE', quote.quoteId), { method: 'PUT', body: input(current, pair()) }), '外租户不能修改报价团队');
  for (const [label, members] of [
    ['合计90%', pair(adminId, '0.6', '0.3')],
    ['两个主责', [member(adminId, 'OWNER', '0.6'), member(salesId, 'OWNER', '0.4')]],
    ['重复成员', [member(adminId, 'OWNER', '0.6'), member(adminId, 'CO_SELLER', '0.4')]],
    ['不存在的人员', [member(adminId, 'OWNER', '0.6'), member(990007001, 'CO_SELLER', '0.4')]],
    ['空团队', []],
  ]) reject(await api(admin, teamPath('QUOTE', quote.quoteId), { method: 'PUT', body: input(current, members) }), `${label}在真实接口拒绝`);
  check('非法输入不会写团队、消耗版本或锁币种', JSON.stringify(await readTeam('QUOTE', quote.quoteId)) === JSON.stringify(current) && !(await readQuote(quote.quoteId)).currencyLocked);
  current = await saveTeam('QUOTE', quote.quoteId, current, pair());
  check('报价保存团队后两人分配60.01与40.00并锁币种', current.teamVersion === 1 && current.members.length === 2
    && Number(current.members.find(value => value.salesUserId === adminId).allocatedAmount) === 60.01 && Number(current.members.find(value => value.salesUserId === salesId).allocatedAmount) === 40
    && (await readQuote(quote.quoteId)).currencyLocked === true);
  quote = await readQuote(quote.quoteId);
  reject(await api(admin, '/crm/quote', { method: 'PUT', body: { ...quote, currency: 'USD' } }), '有历史分成的报价不能换币种', /币种已锁定.*另建报价/);
  reject(await api(admin, '/crm/quote', { method: 'PUT', body: { ...quote, ownerId: managerId } }), '多人报价不能在普通表单直接替换负责人', /多人团队.*团队维护/);
  reject(await api(admin, '/crm/quote', { method: 'PUT', body: { ...quote, status: 'ACCEPTED' } }), '普通编辑不能伪造报价业务状态', /报价状态须通过/);
  current = await saveTeam('QUOTE', quote.quoteId, current, pair(adminId, '0.75', '0.25'));
  const historical = await readTeam('QUOTE', quote.quoteId, admin, 1);
  quote = await editQuote(await readQuote(quote.quoteId), { quoteLines: [{ productName: '实际新金额', quantity: 1, unitPrice: '200.03', discountRate: 100, taxRate: 0 }] });
  check('普通金额更新仅刷新当前团队，旧版本比例及金额保持', Number((await readTeam('QUOTE', quote.quoteId)).amount) === 200.03
    && JSON.stringify(await readTeam('QUOTE', quote.quoteId, admin, 1)) === JSON.stringify({ ...historical, businessVersion: quote.version }));
  reject(await api(sales, teamPath('QUOTE', quote.quoteId)), '团队成员身份不扩大报价的数据范围');
  current = await readTeam('QUOTE', quote.quoteId);
  const competing = await Promise.all(['0.55', '0.45'].map(percentage => api(admin, teamPath('QUOTE', quote.quoteId), { method: 'PUT', body: input(current, pair(adminId, percentage, percentage === '0.55' ? '0.45' : '0.55')) })));
  check('两次真实报价团队竞争只提交一版', competing.filter(result => result.status === 200 && result.body?.code === 200).length === 1
    && (await readTeam('QUOTE', quote.quoteId)).teamVersion === current.teamVersion + 1);
  reject(competing.find(result => result.body?.code !== 200), '报价团队竞争失败有明确版本冲突', /报价已被修改|团队已被修改/);
  const currencyRace = await createQuote('currency_race', customerId);
  const emptyTeam = await readTeam('QUOTE', currencyRace.quoteId);
  const raced = await Promise.all([
    api(admin, '/crm/quote', { method: 'PUT', body: { ...currencyRace, currency: 'USD' } }),
    api(admin, teamPath('QUOTE', currencyRace.quoteId), { method: 'PUT', body: input(emptyTeam, pair()) }),
  ]);
  check('首次团队保存与改币种竞争仅一项成功', raced.filter(result => result.status === 200 && result.body?.code === 200).length === 1);
  reject(raced.find(result => result.body?.code !== 200), '币种竞争失败不能静默覆盖', /报价已被修改|记录已被修改|币种已锁定/);
  const finalRace = await readQuote(currencyRace.quoteId);
  check('竞争后的币种锁与真实物理团队一致', finalRace.currencyLocked === ((await readTeam('QUOTE', currencyRace.quoteId)).teamVersion > 0));
  const source = await createOpportunity('source', customerId);
  const sourceTeam = await saveTeam('OPPORTUNITY', source.opportunityId, await readTeam('OPPORTUNITY', source.opportunityId), pair());
  const copied = await createQuote('copied', customerId, salesId, admin, source.opportunityId);
  const copiedTeam = await readTeam('QUOTE', copied.quoteId);
  check('真实商机转报价复制完整团队和主责，采用报价金额并保留独立版本', copied.ownerId === adminId && copied.opportunityName === source.opportunityName
    && copiedTeam.teamVersion === 1 && copiedTeam.businessVersion === 0 && copiedTeam.members.length === 2 && Number(copiedTeam.amount) === 100.01
    && Number(copiedTeam.members.find(value => value.salesUserId === adminId).allocatedPercentage) === 0.6 && copied.currencyLocked === true);
  await saveTeam('OPPORTUNITY', source.opportunityId, sourceTeam, pair(adminId, '0.7', '0.3'));
  check('真实来源商机调整后，已生成报价的分成不变', JSON.stringify(await readTeam('QUOTE', copied.quoteId)) === JSON.stringify(copiedTeam));
  const wrongCustomer = await createCustomer('wrong_customer');
  reject(await api(admin, '/crm/quote', { method: 'POST', body: { quoteName: `H3_QH_${caseTag}_wrong_source`, customerId: wrongCustomer, opportunityId: source.opportunityId, currency: 'CNY' } }), '跨客户来源复制被拒绝', /同一客户/);
  check('被拒绝的复制没有留下报价', database(`SELECT COUNT(*) FROM crm_quote WHERE tenant_id=100000 AND quote_name=${literal(`H3_QH_${caseTag}_wrong_source`)};`) === '0');
  const salesCustomer = await createCustomer('sales_customer', salesId, sales);
  const salesQuote = await createQuote('sales_quote', salesCustomer, salesId, sales);
  const privateTeam = await saveTeam('QUOTE', salesQuote.quoteId, await readTeam('QUOTE', salesQuote.quoteId), [member(salesId, 'OWNER', '1')]);
  database(`UPDATE crm_deal_team SET commission_rate=0.1250,commission_amount=12.50 WHERE tenant_id=100000 AND biz_type='QUOTE' AND biz_id=${salesQuote.quoteId} AND current_flag=1;`);
  try {
    const visible = await readTeam('QUOTE', salesQuote.quoteId);
    const redacted = await readTeam('QUOTE', salesQuote.quoteId, sales);
    check('真实报价薪资字段非空时也不向无薪资权限销售下发', Number(visible.members[0].commissionRate) === 0.125
      && redacted.members.every(value => !Object.hasOwn(value, 'commissionRate') && !Object.hasOwn(value, 'commissionAmount')));
  } finally { database(`UPDATE crm_deal_team SET commission_rate=NULL,commission_amount=0 WHERE tenant_id=100000 AND biz_type='QUOTE' AND biz_id=${salesQuote.quoteId} AND team_version=${privateTeam.teamVersion};`); }
  const terminal = await createQuote('expired', customerId);
  successful(await api(admin, `/crm/quote/${terminal.quoteId}/expire`, { method: 'POST' }), '真实报价过期操作');
  reject(await api(admin, teamPath('QUOTE', terminal.quoteId), { method: 'PUT', body: input(await readTeam('QUOTE', terminal.quoteId), [member(managerId, 'OWNER', '1')]) }), '终态报价不能通过团队接口换主责', /已接受或已过期报价/);
  reject(await api(admin, '/crm/quote', { method: 'PUT', body: { ...await readQuote(terminal.quoteId), ownerId: managerId } }), '未配置团队的终态报价同样禁止换主责', /已接受或已过期报价/);
  evidence.quoteHttp = true; evidence.sourceCopy = true; evidence.currencyLock = true;
  const uiQuote = await createQuote('ui', customerId);
  await saveTeam('QUOTE', uiQuote.quoteId, await readTeam('QUOTE', uiQuote.quoteId), pair());
  await verifyQuoteTeamInterface({ ...shared, quote: uiQuote, salesQuote });
  await verifyHandoverFromHr(shared);
  check('报价及交接验收后EMPLOYEE授权逐条未变', database('SELECT menu_id FROM sys_role_menu WHERE tenant_id=100000 AND role_id=5 ORDER BY menu_id;') === grants);
}
