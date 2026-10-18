import { verifyQuoteContractCopyInterface } from './verify-quote-contract-copy-h3-ui.mjs';

export async function verifyQuoteContractCopy(context) {
  const { admin, sales, employee, foreign, adminId, salesId, managerId, api, successful, database, check, caseTag, evidence,
    literal, forbidden, reject, pair, readTeam, saveTeam, readQuote, editQuote, createCustomer, createQuote } = context;
  const contractPath = quoteId => `/crm/quote/${quoteId}/contract-draft`;
  const create = async quoteId => Number(successful(await api(admin, contractPath(quoteId), { method: 'POST' }), '真实报价转合同'));
  const readContract = async contractId => successful(await api(admin, `/oa/contract/${contractId}`), '读取真实来源合同');
  const count = quoteId => Number(database(`SELECT COUNT(*) FROM oa_contract WHERE tenant_id=100000 AND source_type='CRM_QUOTE' AND source_id=${quoteId};`));
  const events = contractId => Number(database(`SELECT COUNT(*) FROM outbox_event WHERE tenant_id=100000 AND event_type='CONTRACT_CREATED' AND aggregate_id=${contractId};`));
  const signature = team => JSON.stringify(team.members.map(member => [member.salesUserId, member.roleType, Number(member.allocatedPercentage), Number(member.allocatedAmount)]).sort((first, second) => first[0] - second[0]));
  const waitForRepeatWindow = () => new Promise(resolve => setTimeout(resolve, 5100));
  const draft = (quote, suffix) => ({ contractNo: `QCC_${caseTag}_${suffix}`, contractName: quote.quoteName, contractType: 'SALES',
    counterpartyName: quote.customerName, customerId: quote.customerId, customerName: '客户端伪造客户', amount: quote.totalAmount, currency: quote.currency,
    ownerId: managerId, ownerName: '客户端伪造主责', sourceType: 'CRM_QUOTE', sourceId: quote.quoteId, sourceVersion: quote.version });

  const customerId = await createCustomer('contract_customer');
  const uiContext = { ...context, customerId, create, readContract, count, events, signature, draft, contractPath };
  if (context.quoteContractCopyUiOnly) {
    evidence.uiOnly = true;
    await verifyQuoteContractCopyInterface(uiContext);
    return;
  }
  let quote = await createQuote('contract_source', customerId);
  let sourceTeam = await saveTeam('QUOTE', quote.quoteId, await readTeam('QUOTE', quote.quoteId), pair(adminId, '0.7', '0.3'));
  sourceTeam = await saveTeam('QUOTE', quote.quoteId, sourceTeam, pair());
  quote = await readQuote(quote.quoteId);
  const contractId = await create(quote.quoteId);
  const contract = await readContract(contractId);
  const copiedTeam = await readTeam('CONTRACT', contractId);
  check('真实报价转合同保存同客户同币种及来源ID，主责取可信HR姓名', contract.sourceType === 'CRM_QUOTE' && contract.sourceId === quote.quoteId
    && contract.customerId === customerId && contract.currency === 'CNY' && contract.ownerId === adminId && contract.ownerName === '导入验收负责人');
  check('来源报价第二版团队复制成合同独立第一版，金额逐分一致', sourceTeam.teamVersion === 2 && copiedTeam.teamVersion === 1
    && copiedTeam.businessVersion === 0 && Number(contract.amount) === 100.01 && signature(copiedTeam) === signature(sourceTeam));
  check('真实合同建立后报价只增加一次关联版本并返回真实编号', (await readQuote(quote.quoteId)).version === quote.version + 1
    && (await readQuote(quote.quoteId)).contractId === contractId && (await readQuote(quote.quoteId)).contractNo === contract.contractNo);
  check('合同草稿只创建一份及一次创建事件，不制造有效合同业绩', contract.status === 'DRAFT' && count(quote.quoteId) === 1 && events(contractId) === 1
    && database(`SELECT COUNT(*) FROM crm_deal_event WHERE tenant_id=100000 AND biz_type='CONTRACT' AND biz_id=${contractId};`) === '0');
  await saveTeam('QUOTE', quote.quoteId, await readTeam('QUOTE', quote.quoteId), pair(adminId, '0.8', '0.2'));
  check('来源报价后续调整比例不覆盖合同复制快照', signature(await readTeam('CONTRACT', contractId)) === signature(copiedTeam));
  await waitForRepeatWindow();
  const beforeReplay = await readQuote(quote.quoteId);
  check('跨服务重复请求返回原合同，不新增业务版本、团队或创建事件', await create(quote.quoteId) === contractId
    && count(quote.quoteId) === 1 && events(contractId) === 1 && (await readQuote(quote.quoteId)).version === beforeReplay.version
    && JSON.stringify(await readTeam('CONTRACT', contractId)) === JSON.stringify(copiedTeam));
  reject(await api(admin, '/crm/quote', { method: 'PUT', body: { ...beforeReplay, contractId: contractId + 1 } }), '普通报价编辑不能伪造关联合同', /合同关联|合同.*专用/);
  reject(await api(admin, '/crm/quote', { method: 'PUT', body: { ...beforeReplay, contractNo: '客户端伪造合同号' } }), '普通报价编辑不能伪造合同编号', /合同关联|合同.*专用/);
  reject(await api(admin, '/oa/contract', { method: 'PUT', body: { ...contract, currency: 'USD' } }), '复制团队后合同币种锁定', /币种.*锁定|另建合同/);
  reject(await api(admin, '/oa/contract', { method: 'PUT', body: { ...contract, sourceType: 'MANUAL', sourceId: null } }), '复制团队后合同禁止更换业务来源', /历史分成.*来源/);
  reject(await api(admin, '/crm/quote', { method: 'POST', body: { quoteName: `QCC_${caseTag}_forged_link`, customerId, contractId, currency: 'CNY' } }), '新增报价不能直接指定关联合同', /新报价不能直接关联合同/);
  const manualId = Number(successful(await api(admin, '/oa/contract', { method: 'POST', body: { contractName: `QCC_${caseTag}_manual`, contractNo: `QCC_${caseTag}_manual`,
    contractType: 'SALES', customerId, counterpartyName: '验收客户', amount: '100.01', currency: 'CNY' } }), '真实新增普通合同'));
  reject(await api(admin, '/oa/contract', { method: 'PUT', body: { ...await readContract(manualId), sourceType: 'CRM_QUOTE', sourceId: quote.quoteId } }), '普通合同编辑不能伪造报价来源', /报价来源须通过报价生成合同入口建立/);

  const defaultQuote = await createQuote('contract_default', customerId);
  const defaultContractId = await create(defaultQuote.quoteId);
  const defaultTeam = await readTeam('CONTRACT', defaultContractId);
  check('未配置报价团队按原负责人100%复制，合同显式保存独立第一版', defaultTeam.teamVersion === 1 && defaultTeam.members.length === 1
    && defaultTeam.ownerId === adminId && Number(defaultTeam.members[0].allocatedPercentage) === 1 && Number(defaultTeam.members[0].allocatedAmount) === 100.01);
  check('默认复制不虚构报价团队历史，但报价及合同币种同时锁定', (await readTeam('QUOTE', defaultQuote.quoteId)).teamVersion === 0
    && (await readQuote(defaultQuote.quoteId)).currencyLocked === true && (await readContract(defaultContractId)).currencyLocked === true);
  reject(await api(admin, '/crm/quote', { method: 'PUT', body: { ...await readQuote(defaultQuote.quoteId), currency: 'USD' } }), '来源报价无显式团队也不能绕过复制后的币种锁', /币种.*锁定|另建报价/);
  const otherCustomer = await createCustomer('contract_other_customer');
  reject(await api(admin, '/crm/quote', { method: 'PUT', body: { ...await readQuote(defaultQuote.quoteId), customerId: otherCustomer } }), '复制后来源报价不能更换客户', /合同.*客户|客户.*合同/);

  const invalidSource = await createQuote('contract_invalid_source', customerId);
  for (const [label, changes, reason] of [
    ['遗漏报价版本', { sourceVersion: null }, /来源报价.*修改|版本/],
    ['过时报价版本', { sourceVersion: invalidSource.version - 1 }, /来源报价.*修改|版本/],
    ['跨币种复制', { currency: 'USD' }, /币种.*一致/],
    ['跨客户复制', { customerId: otherCustomer }, /同一客户/],
  ]) reject(await api(admin, '/oa/contract', { method: 'POST', body: { ...draft(invalidSource, label), ...changes } }), `真实OA入口拒绝${label}`, reason);
  check('四类非法来源请求均未留下合同或分成', count(invalidSource.quoteId) === 0);
  reject(await api(employee, contractPath(invalidSource.quoteId), { method: 'POST' }), 'EMPLOYEE沿用既有合同草稿权限但不能转换范围外报价', /无权|不存在/);
  forbidden(await api(employee, '/oa/contract', { method: 'POST', body: draft(invalidSource, 'employee') }), 'EMPLOYEE不能借OA新增入口复制报价');
  forbidden(await api(employee, `/crm/deal-team/CONTRACT/${contractId}`), 'EMPLOYEE没有获得新增合同团队读取权限');
  reject(await api(sales, contractPath(invalidSource.quoteId), { method: 'POST' }), '销售不能转换数据范围外报价', /无权|不存在/);
  reject(await api(foreign, contractPath(invalidSource.quoteId), { method: 'POST' }), '外租户不能转换报价', /无权|不存在/);
  reject(await api(foreign, '/oa/contract', { method: 'POST', body: draft(invalidSource, 'foreign') }), 'OA来源入口也核验报价租户', /无权|不存在/);
  reject(await api(foreign, `/oa/contract/${contractId}`), '外租户不能读取复制结果', /无权|不存在/);
  check('拒绝越权不会生成额外合同', count(invalidSource.quoteId) === 0);

  const competingSource = await createQuote('contract_competing', customerId);
  await saveTeam('QUOTE', competingSource.quoteId, await readTeam('QUOTE', competingSource.quoteId), pair());
  const competingQuote = await readQuote(competingSource.quoteId);
  const competing = await Promise.all(['first', 'second'].map(suffix => api(admin, '/oa/contract', { method: 'POST', body: draft(competingQuote, suffix) })));
  const competingIds = competing.map((result, index) => Number(successful(result, `真实OA并发复制${index + 1}`)));
  const concurrentContract = await readContract(competingIds[0]);
  check('两次不同内容OA并发请求均成功返回同一合同ID', competingIds[0] === competingIds[1] && count(competingQuote.quoteId) === 1);
  check('并发复制只生成一组完整团队及一次创建事件，伪造主责被替换', signature(await readTeam('CONTRACT', concurrentContract.contractId)) === signature(await readTeam('QUOTE', competingQuote.quoteId))
    && concurrentContract.ownerId === adminId && concurrentContract.ownerName === '导入验收负责人' && events(concurrentContract.contractId) === 1);
  check('OA先创建后CRM重试只补回关联，不重复创建合同', await create(competingQuote.quoteId) === concurrentContract.contractId
    && (await readQuote(competingQuote.quoteId)).contractId === concurrentContract.contractId && count(competingQuote.quoteId) === 1);

  const recoverable = await createQuote('contract_recovery', customerId);
  await saveTeam('QUOTE', recoverable.quoteId, await readTeam('QUOTE', recoverable.quoteId), pair());
  const beforeFailure = await readQuote(recoverable.quoteId);
  const trigger = `h3_qcc_${caseTag}`;
  let installed = false;
  try {
    database(`DELIMITER $$\nCREATE TRIGGER ${trigger} BEFORE UPDATE ON crm_quote FOR EACH ROW BEGIN IF NEW.tenant_id=100000 AND NEW.quote_id=${recoverable.quoteId} AND NEW.contract_id IS NOT NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='H3_OWNED_QUOTE_LINK_FAILURE'; END IF; END$$\nDELIMITER ;\n`);
    installed = true;
    const failed = await api(admin, contractPath(recoverable.quoteId), { method: 'POST' });
    check('隔离关联写入故障返回失败且不泄露SQL，仅此报价受影响', failed.status === 500 && failed.body?.code === 500
      && /服务异常/.test(failed.body?.msg || failed.body?.message || '') && !/UPDATE|TRIGGER|SQLSTATE/.test(JSON.stringify(failed.body)));
  } finally { if (installed) database(`DROP TRIGGER ${trigger};`); }
  const afterFailure = await readQuote(recoverable.quoteId);
  const recoveredContractId = Number(database(`SELECT contract_id FROM oa_contract WHERE tenant_id=100000 AND source_type='CRM_QUOTE' AND source_id=${recoverable.quoteId};`));
  check('OA先行成功保留合同，CRM失败不消耗版本且来源已锁币种', count(recoverable.quoteId) === 1 && afterFailure.contractId == null
    && afterFailure.version === beforeFailure.version && afterFailure.currencyLocked === true && events(recoveredContractId) === 1);
  const frozen = signature(await readTeam('CONTRACT', recoveredContractId));
  const remark = `H3同期编辑_${caseTag}`;
  await editQuote(afterFailure, { remark });
  await saveTeam('QUOTE', recoverable.quoteId, await readTeam('QUOTE', recoverable.quoteId), pair(adminId, '0.9', '0.1'));
  const beforeRecovery = await readQuote(recoverable.quoteId);
  await waitForRepeatWindow();
  check('恢复后从原入口重试返回OA先行合同，不覆盖同期报价编辑', await create(recoverable.quoteId) === recoveredContractId
    && (await readQuote(recoverable.quoteId)).remark === remark && (await readQuote(recoverable.quoteId)).version === beforeRecovery.version + 1);
  check('关联恢复不重算旧合同团队、不重复事件，临时故障已移除', signature(await readTeam('CONTRACT', recoveredContractId)) === frozen
    && count(recoverable.quoteId) === 1 && events(recoveredContractId) === 1
    && database(`SELECT COUNT(*) FROM information_schema.triggers WHERE trigger_schema='cloud_flow_db' AND trigger_name=${literal(trigger)};`) === '0');

  const accepted = await createQuote('contract_accept', customerId);
  await saveTeam('QUOTE', accepted.quoteId, await readTeam('QUOTE', accepted.quoteId), pair());
  successful(await api(admin, `/crm/quote/${accepted.quoteId}/send`, { method: 'POST' }), '真实发送待接受报价');
  check('接受前确由业务入口进入已发送状态', (await readQuote(accepted.quoteId)).status === 'SENT');
  successful(await api(admin, `/crm/quote/${accepted.quoteId}/accept`, { method: 'POST' }), '首次真实接受报价并创建合同');
  const acceptedResult = await readQuote(accepted.quoteId);
  check('接受报价在创建合同关联后使用最新版本写入ACCEPTED', acceptedResult.status === 'ACCEPTED' && Number(acceptedResult.contractId) > 0
    && count(accepted.quoteId) === 1 && (await readTeam('CONTRACT', acceptedResult.contractId)).teamVersion === 1);
  await waitForRepeatWindow();
  successful(await api(admin, `/crm/quote/${accepted.quoteId}/accept`, { method: 'POST' }), '真实重复接受已接受报价');
  check('重复接受业务成功且版本、合同数量与事件均不增加', (await readQuote(accepted.quoteId)).version === acceptedResult.version
    && count(accepted.quoteId) === 1 && events(acceptedResult.contractId) === 1);
  evidence.quoteHttp = true; evidence.sourceCopy = true; evidence.currencyLock = true;
  evidence.quoteContractCopy = true; evidence.sourceTeamSetup = 'real_http'; evidence.concurrencyGroups = 1;
  evidence.linkRecovery = true; evidence.failureInjection = 'isolated_quote_update_trigger'; evidence.acceptReplay = true;
  evidence.salaryPosting = false; evidence.contractEffectiveFacts = false;
  await verifyQuoteContractCopyInterface(uiContext);
}
