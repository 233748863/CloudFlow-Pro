import assert from 'node:assert/strict';
import { verifyReceivableTeamInterface } from './verify-receivable-team-h3-ui.mjs';

export async function verifyReceivableTeam(context) {
  const { admin, sales, employee, foreign, api, successful, database, check, caseTag, evidence, create, read, today, adminId, customerId } = context;
  const literal = value => `CONVERT(UNHEX('${Buffer.from(String(value)).toString('hex')}') USING utf8mb4)`;
  const rows = statement => database(statement).split('\n').filter(Boolean).map(value => JSON.parse(value));
  const salesId = Number(database("SELECT user_id FROM sys_user WHERE tenant_id=100000 AND user_name='g_opportunity_sales';"));
  const managerId = Number(database("SELECT user_id FROM sys_user WHERE tenant_id=100000 AND user_name='g_opportunity_manager';"));
  const teamPath = record => `/crm/deal-team/RECEIVABLE/${record.receivableId}`;
  const readTeam = async (record, page = admin, version) => successful(await api(page, `${teamPath(record)}${version === undefined ? '' : `?teamVersion=${version}`}`), '读取真实回款团队');
  const member = (salesUserId, roleType, allocatedPercentage) => ({ salesUserId, roleType, allocatedPercentage });
  const pair = (owner = '0.6', seller = '0.4') => [member(adminId, 'OWNER', owner), member(salesId, 'CO_SELLER', seller)];
  const sourcePair = (owner = '0.6', seller = '0.4') => [member(salesId, 'OWNER', owner), member(adminId, 'CO_SELLER', seller)];
  const input = (team, members) => ({ businessVersion: team.businessVersion, teamVersion: team.teamVersion, members, remark: `回款团队验收_${caseTag}` });
  const saveTeam = async (record, members) => successful(await api(admin, teamPath(record), { method: 'PUT', body: input(await readTeam(record), members) }), '通过真实入口保存整组回款团队');
  const allocated = (team, userId) => team.members.find(value => value.salesUserId === userId);
  const facts = record => rows(`SELECT JSON_OBJECT('id',event_id,'amount',amount,'teamVersion',team_version,'currency',currency,'snapshot',source_snapshot)
    FROM crm_deal_event WHERE tenant_id=100000 AND biz_type='RECEIVABLE' AND biz_id=${record.receivableId} ORDER BY event_id;`);
  const allocations = eventId => rows(`SELECT JSON_OBJECT('id',allocation_id,'user',sales_user_id,'amount',allocated_amount,'percentage',allocated_percentage,'status',commission_status,'changeId',comp_change_id)
    FROM crm_deal_allocation WHERE tenant_id=100000 AND event_id=${eventId} ORDER BY sales_user_id;`);
  const ledger = record => JSON.stringify(facts(record).map(value => ({ ...value, allocations: allocations(value.id) })));
  const collect = async (record, amount) => {
    const current = await read(record.receivableId);
    successful(await api(admin, `/crm/receivable/${record.receivableId}/writeoff`, { method: 'POST', body: {
      version: current.version, amount, writeoffDate: today, remark: `逐笔团队验收_${caseTag}_${current.version}`,
    } }), '真实登记本笔到账');
    return read(record.receivableId);
  };
  const reject = (response, label, pattern = /回款|团队|成员|比例|主责|版本|币种|金额|无权|不存在|重复|频繁|记录|合同|客户|说明|ID|舍入|尾差|员工/) => {
    const message = response.body?.msg || response.body?.message || '';
    check(`${label} HTTP=${response.status} code=${response.body?.code} message=${message}`,
      ([400, 403, 404, 409, 503].includes(response.status) || response.status === 200 && response.body?.code === 500)
      && response.body?.code !== 200 && pattern.test(message));
  };
  const isSuccess = response => response.status === 200 && response.body?.code === 200;
  const forbidden = (response, label) => check(`${label} HTTP=${response.status} code=${response.body?.code}`, response.status === 403 && response.body?.code === 403);
  const readContract = async id => successful(await api(admin, `/oa/contract/${id}`), '读取真实来源合同');
  const readSourceTeam = async contract => successful(await api(admin, `/crm/deal-team/CONTRACT/${contract.contractId}`), '读取真实来源合同团队');
  const saveSourceTeam = async (contract, members) => successful(await api(admin, `/crm/deal-team/CONTRACT/${contract.contractId}`, {
    method: 'PUT', body: input(await readSourceTeam(contract), members),
  }), '真实调整来源合同团队');
  const createContract = async (suffix, currency = 'USD', ownerId = salesId) => {
    const name = `H3_RT_${caseTag}_${suffix}`;
    const id = successful(await api(admin, '/oa/contract', { method: 'POST', body: {
      contractName: name, contractNo: name, counterpartyName: '回款团队继承验收客户', contractType: 'SALES',
      customerId, amount: '800', currency, ownerId, ownerName: '客户端伪造合同主责',
    } }), '真实创建可关联来源合同');
    assert.ok(Number.isSafeInteger(id) && id > 0);
    return readContract(id);
  };

  let record = await create('team_primary');
  const initial = await readTeam(record);
  check('无合同未配置团队按可信负责人100%显示，读取不生成团队或到账', initial.teamVersion === 0 && initial.businessVersion === 0
    && initial.currency === 'CNY' && initial.members.length === 1 && initial.ownerId === adminId
    && initial.members[0].salesUserName === '导入验收负责人' && Number(initial.members[0].allocatedPercentage) === 1
    && Number(initial.amount) === 100.01 && facts(record).length === 0
    && database(`SELECT COUNT(*) FROM crm_deal_team WHERE tenant_id=100000 AND biz_type='RECEIVABLE' AND biz_id=${record.receivableId};`) === '0');
  const firstTeam = await saveTeam(record, pair().map(value => ({ ...value, commissionRate: '0.9', salesUserName: '伪造员工姓名', deptId: 999999 })));
  check('真实HR核验两名成员，60/40按计划金额预览，客户端薪酬字段无效', firstTeam.teamVersion === 1 && firstTeam.businessVersion === 1
    && Number(allocated(firstTeam, adminId).allocatedAmount) === 60.01 && Number(allocated(firstTeam, salesId).allocatedAmount) === 40
    && allocated(firstTeam, salesId).salesUserName === '商机验收销售' && firstTeam.members.every(value => value.commissionRate == null)
    && facts(record).length === 0 && Number((await read(record.receivableId)).receivedAmount) === 0);
  record = await collect(record, '30');
  const firstReceipt = facts(record)[0];
  const frozenFirst = ledger(record);
  reject(await api(admin, teamPath(record), { method: 'PUT', body: input(firstTeam, pair('0.5', '0.5')) }), '到账后旧业务版本不能覆盖团队');
  const secondTeam = await saveTeam(record, pair('0.2', '0.8'));
  const historyMembers = JSON.stringify((await readTeam(record, admin, 1)).members);
  check('团队调整建立独立第二版，原30元及18/12分配逐条不变', secondTeam.teamVersion === 2 && ledger(record) === frozenFirst
    && allocations(firstReceipt.id).find(value => value.user === adminId)?.amount === 18
    && allocations(firstReceipt.id).find(value => value.user === salesId)?.amount === 12);
  record = await collect(record, '20');
  const secondReceipt = facts(record)[1];
  check('后收20使用第二版4/16分配，累计50并保留第一版事实', Number(record.receivedAmount) === 50 && facts(record).length === 2
    && firstReceipt.teamVersion === 1 && secondReceipt.teamVersion === 2
    && allocations(secondReceipt.id).find(value => value.user === adminId)?.amount === 4
    && allocations(secondReceipt.id).find(value => value.user === salesId)?.amount === 16);
  const bothReceipts = ledger(record);
  successful(await api(admin, '/crm/receivable', { method: 'PUT', body: { ...record, plannedAmount: '200.03' } }), '真实修改计划金额');
  check('计划金额修改只刷新当前预览，历史团队和两笔分配不变', Number(allocated(await readTeam(record), adminId).allocatedAmount) === 40.01
    && historyMembers === JSON.stringify((await readTeam(record, admin, 1)).members) && ledger(record) === bothReceipts);
  const ownerChanged = await saveTeam(record, sourcePair('0.5', '0.5'));
  record = await read(record.receivableId);
  check('更换唯一主责同事务保存真实姓名且不改写历史到账', ownerChanged.ownerId === salesId && record.ownerId === salesId
    && record.ownerName === '商机验收销售' && record.version === ownerChanged.businessVersion && ledger(record) === bothReceipts);
  for (const version of [-1, 0, 4]) reject(await api(admin, `${teamPath(record)}?teamVersion=${version}`), `不存在的历史版本${version}不能读取`);

  const contract = await createContract('source');
  await saveSourceTeam(contract, sourcePair());
  const copied = await create('copied', '100.01', { contractId: contract.contractId, contractNo: '客户端伪造合同号' });
  const copiedTeam = await readTeam(copied);
  const copiedMembers = JSON.stringify(copiedTeam.members);
  check('关联合同时复制独立第一版、可信合同主责和合同号，按回款金额重新分配', copiedTeam.teamVersion === 1 && copiedTeam.businessVersion === 0
    && copiedTeam.currency === 'USD' && copied.ownerId === salesId && copied.ownerName === '商机验收销售' && copied.contractNo === contract.contractNo
    && Number(allocated(copiedTeam, salesId).allocatedAmount) === 60.01 && Number(allocated(copiedTeam, adminId).allocatedAmount) === 40
    && copied.bindingLocked === true && facts(copied).length === 0 && Number(copied.receivedAmount) === 0);
  await saveSourceTeam(contract, sourcePair('0.2', '0.8'));
  const later = await create('copied_later', '50', { contractId: contract.contractId });
  check('来源调整只影响之后创建的计划，先前团队及金额保持原样', JSON.stringify((await readTeam(copied)).members) === copiedMembers
    && (await readTeam(later)).teamVersion === 1 && Number(allocated(await readTeam(later), salesId).allocatedAmount) === 10);
  const attached = await create('attached', '543.21');
  successful(await api(admin, '/crm/receivable', { method: 'PUT', body: { ...attached, contractId: contract.contractId } }), '真实首次关联已有无历史计划');
  const attachedTeam = await readTeam(attached);
  check('首次关联在一次计划更新中复制当前来源并保存真实主责', attachedTeam.businessVersion === 1 && attachedTeam.teamVersion === 1
    && (await read(attached.receivableId)).ownerId === salesId && Number(allocated(attachedTeam, salesId).allocatedAmount) === 108.64
    && Number(allocated(attachedTeam, adminId).allocatedAmount) === 434.57 && facts(attached).length === 0);
  reject(await api(admin, '/crm/receivable', { method: 'PUT', body: { ...copied, contractId: null } }), '非主责不能通过普通编辑解除来源合同', /无权/);
  reject(await api(admin, `/crm/receivable/${copied.receivableId}`, { method: 'DELETE' }), '复制产生历史后不能删除计划');
  const otherCustomer = await context.createCustomer('source_other_customer');
  const beforeInvalidCopy = database(`SELECT COUNT(*) FROM crm_receivable WHERE tenant_id=100000 AND contract_id=${contract.contractId};`);
  reject(await api(admin, '/crm/receivable', { method: 'POST', body: { customerId: otherCustomer, contractId: contract.contractId, plannedAmount: '10', receivableName: `客户不符_${caseTag}` } }), '来源合同与回款客户不一致时拒绝复制');
  check('非法关联不产生计划或分成团队', database(`SELECT COUNT(*) FROM crm_receivable WHERE tenant_id=100000 AND contract_id=${contract.contractId};`) === beforeInvalidCopy);
  const defaultContract = await createContract('default_source', 'EUR', adminId);
  const defaultCopy = await create('default_copy', '25', { contractId: defaultContract.contractId });
  const defaultTeam = await readTeam(defaultCopy);
  const lockedContract = await readContract(defaultContract.contractId);
  check('未配置来源团队时复制合同负责人100%，来源仍零版但币种立即锁定', defaultTeam.teamVersion === 1 && defaultTeam.members.length === 1
    && defaultTeam.ownerId === adminId && Number(defaultTeam.members[0].allocatedPercentage) === 1 && defaultTeam.currency === 'EUR'
    && (await readSourceTeam(defaultContract)).teamVersion === 0 && lockedContract.currencyLocked === true && facts(defaultCopy).length === 0);
  reject(await api(admin, '/crm/receivable', { method: 'PUT', body: { ...defaultCopy, contractId: null } }), '复制产生历史后主责也不能解除来源合同', /业务记录/);
  reject(await api(admin, '/oa/contract', { method: 'PUT', body: { ...lockedContract, currency: 'CNY', currencyLocked: false } }), '仅回款复制历史也阻止伪造标志修改合同币种', /币种/);
  reject(await api(admin, `/oa/contract/${defaultContract.contractId}`, { method: 'DELETE' }), '仅回款复制历史也阻止删除来源合同', /分成|收款/);
  successful(await api(admin, '/oa/contract', { method: 'PUT', body: { ...lockedContract, amount: '900' } }), '来源同币种仍可修改金额');
  check('后改合同金额不会更新已有回款团队预览', Number((await readTeam(defaultCopy)).amount) === 25 && Number(defaultTeam.members[0].allocatedAmount) === 25);
  evidence.contractCopy = true; evidence.currencyLock = true;

  const invalid = await create('invalid_team');
  const invalidTeam = await readTeam(invalid);
  for (const [label, body] of [
    ['团队缺少业务版本', { ...input(invalidTeam, pair()), businessVersion: undefined }],
    ['团队缺少团队版本', { ...input(invalidTeam, pair()), teamVersion: undefined }],
    ['团队重复成员', input(invalidTeam, [member(adminId, 'OWNER', '0.5'), member(adminId, 'CO_SELLER', '0.5')])],
    ['团队没有主责', input(invalidTeam, [member(adminId, 'CO_SELLER', '1')])],
    ['团队有两个主责', input(invalidTeam, [member(adminId, 'OWNER', '0.5'), member(salesId, 'OWNER', '0.5')])],
    ['团队比例不足100%', input(invalidTeam, pair('0.2', '0.4'))],
    ['团队比例超过100%', input(invalidTeam, pair('0.7', '0.4'))],
    ['团队比例超出四位小数', input(invalidTeam, pair('0.60001', '0.39999'))],
    ['团队含负比例', input(invalidTeam, pair('-0.1', '1.1'))],
    ['团队成员不是有效员工', input(invalidTeam, [member(999999999, 'OWNER', '1')])],
    ['团队成员为空', input(invalidTeam, [])],
    ['团队调整说明超过500字符', { ...input(invalidTeam, pair()), remark: 'x'.repeat(501) }],
    ['团队成员超过200人', input(invalidTeam, Array.from({ length: 201 }, () => member(adminId, 'OWNER', '1')))],
  ]) reject(await api(admin, teamPath(invalid), { method: 'PUT', body }), label);
  check('非法团队整组拒绝，业务版本和团队表均未修改', (await read(invalid.receivableId)).version === 0
    && database(`SELECT COUNT(*) FROM crm_deal_team WHERE tenant_id=100000 AND biz_type='RECEIVABLE' AND biz_id=${invalid.receivableId};`) === '0');
  const cents = await create('negative_remainder', '0.01');
  reject(await api(admin, teamPath(cents), { method: 'PUT', body: input(await readTeam(cents),
    [member(adminId, 'OWNER', '0'), member(salesId, 'CO_SELLER', '0.5'), member(managerId, 'SUPPORT', '0.5')]) }), '分钱尾差导致主责负数时整组回滚');
  check('负尾差不留下团队或业务版本变化', (await readTeam(cents)).teamVersion === 0 && (await read(cents.receivableId)).version === 0);

  for (const [page, label] of [[employee, 'EMPLOYEE'], [sales, '普通销售']]) forbidden(await api(page, teamPath(copied), { method: 'PUT', body: input(copiedTeam, pair()) }), `${label}没有维护回款团队权限`);
  forbidden(await api(employee, teamPath(copied)), 'EMPLOYEE不能读取回款团队');
  reject(await api(sales, teamPath(copied)), '同租户其他客户范围的销售不能读取团队');
  reject(await api(foreign, teamPath(copied)), '跨租户不能读取回款团队');
  reject(await api(foreign, teamPath(copied), { method: 'PUT', body: input(copiedTeam, pair()) }), '跨租户不能维护回款团队');
  const salesCustomerName = `H3_RT_${caseTag}_sales_customer`;
  successful(await api(sales, '/crm/customer', { method: 'POST', body: { customerCode: salesCustomerName, customerName: salesCustomerName, ownerId: salesId } }), '销售通过真实入口创建本人客户');
  const salesCustomerId = Number(database(`SELECT customer_id FROM crm_customer WHERE tenant_id=100000 AND customer_code=${literal(salesCustomerName)} AND deleted=0;`));
  const salesRecord = await create('sales_scope', '80', { customerId: salesCustomerId, ownerId: salesId });
  await saveTeam(salesRecord, sourcePair());
  const salesTeam = await readTeam(salesRecord, sales);
  check('销售仅能查询本人客户的分配且薪酬字段均隐藏', salesTeam.ownerId === salesId && salesTeam.teamVersion === 1
    && salesTeam.members.every(value => value.commissionRate == null && value.commissionAmount == null));
  evidence.permissions = true;

  const concurrent = await create('team_race');
  const concurrentTeam = await readTeam(concurrent);
  const teamResults = await Promise.all([pair(), pair('0.5', '0.5')].map(members => api(admin, teamPath(concurrent), { method: 'PUT', body: input(concurrentTeam, members) })));
  check('两个真实团队保存竞争仅一组成功且只升一个版本', teamResults.filter(isSuccess).length === 1
    && (await readTeam(concurrent)).teamVersion === 1 && (await read(concurrent.receivableId)).version === 1);
  const receiving = await create('receipt_race');
  const receivingTeam = await readTeam(receiving);
  const receiptResults = await Promise.all([
    api(admin, teamPath(receiving), { method: 'PUT', body: input(receivingTeam, pair()) }),
    api(admin, `/crm/receivable/${receiving.receivableId}/writeoff`, { method: 'POST', body: { version: receiving.version, amount: '30', writeoffDate: today } }),
  ]);
  check('团队调整与到账竞争只接受一个原版本请求', receiptResults.filter(isSuccess).length === 1
    && (await read(receiving.receivableId)).version === 1 && Number((await read(receiving.receivableId)).receivedAmount) === (isSuccess(receiptResults[1]) ? 30 : 0)
    && facts(receiving).length === (isSuccess(receiptResults[1]) ? 1 : 0));
  for (let attempt = 0; attempt < 3; attempt++) {
    const source = await createContract(`source_race_${attempt}`);
    await saveSourceTeam(source, sourcePair());
    const [snapshot, changed] = await Promise.all([
      create(`copy_race_${attempt}`, '100.01', { contractId: source.contractId }),
      saveSourceTeam(source, sourcePair('0.2', '0.8')),
    ]);
    const snapshotTeam = await readTeam(snapshot);
    const ownerShare = Number(allocated(snapshotTeam, salesId).allocatedPercentage);
    check(`合同团队调整与复制竞争${attempt + 1}只读取一组完整已提交版本`, changed.teamVersion === 2 && snapshotTeam.teamVersion === 1
      && [0.6, 0.2].includes(ownerShare) && Number(allocated(snapshotTeam, adminId).allocatedPercentage) === 1 - ownerShare
      && Number(snapshotTeam.amount) === 100.01 && snapshotTeam.ownerId === salesId && facts(snapshot).length === 0);
    const currencySource = await createContract(`currency_race_${attempt}`, 'CNY', adminId);
    const [currencyCopy, changedCurrency] = await Promise.all([
      create(`currency_copy_${attempt}`, '50', { contractId: currencySource.contractId }),
      api(admin, '/oa/contract', { method: 'PUT', body: { ...currencySource, currency: 'EUR' } }),
    ]);
    if (!isSuccess(changedCurrency)) reject(changedCurrency, `复制先完成时拒绝第${attempt + 1}次改币种`, /币种/);
    const finalContract = await readContract(currencySource.contractId);
    const finalTeam = await readTeam(currencyCopy);
    check(`首次复制与币种修改竞争${attempt + 1}保持合同与回款币种一致且锁定`, finalContract.currencyLocked === true
      && finalContract.currency === (isSuccess(changedCurrency) ? 'EUR' : 'CNY') && finalTeam.currency === finalContract.currency
      && finalTeam.teamVersion === 1 && Number(finalTeam.amount) === 50 && facts(currencyCopy).length === 0);
  }
  evidence.concurrency = true; evidence.concurrencyGroups = 4; evidence.receiptLedger = true;
  check('本专项所有真实到账分配保持未核定且没有工资关联', facts(record).every(value => allocations(value.id).every(allocation => allocation.status === 'UNCONFIRMED' && allocation.changeId === null)));
  evidence.business = true; evidence.teamSetup = 'real_http'; evidence.salaryPosting = false;
  const uiRecord = await create('team_interface', '123.45');
  await saveTeam(uiRecord, pair());
  await verifyReceivableTeamInterface({ ...context, uiRecord, readTeam, saveTeam, pair, facts });
}
