import assert from 'node:assert/strict';
import { verifyContractTeamInterface } from './verify-contract-team-h3-ui.mjs';

export async function verifyContractTeam(context) {
  const { admin, api, successful, session, database, check, caseTag, evidence } = context;
  const sales = await session('g_opportunity_sales');
  const manager = await session('g_opportunity_manager');
  const employee = await session('g_holiday_employee');
  const foreign = await session('g_import_tenant');
  const literal = value => `CONVERT(UNHEX('${Buffer.from(String(value)).toString('hex')}') USING utf8mb4)`;
  const user = name => Number(database(`SELECT user_id FROM sys_user WHERE tenant_id=100000 AND user_name=${literal(name)};`));
  const adminId = user('g_import_admin');
  const salesId = user('g_opportunity_sales');
  const managerId = user('g_opportunity_manager');
  const grantSql = 'SELECT menu_id FROM sys_role_menu WHERE tenant_id=100000 AND role_id=5 ORDER BY menu_id;';
  const grants = database(grantSql);
  const teamPath = id => `/crm/deal-team/CONTRACT/${id}`;
  const read = async (id, page = admin) => successful(await api(page, `/oa/contract/${id}`), '读取实际合同');
  const readTeam = async (id, page = admin, version) => successful(await api(page, `${teamPath(id)}${version === undefined ? '' : `?teamVersion=${version}`}`), '读取实际合同团队');
  const member = (salesUserId, roleType, allocatedPercentage) => ({ salesUserId, roleType, allocatedPercentage });
  const pair = (percentage = '0.6000', other = '0.4000') => [member(adminId, 'OWNER', percentage), member(salesId, 'CO_SELLER', other)];
  const input = (team, members) => ({ businessVersion: team.businessVersion, teamVersion: team.teamVersion, members, remark: `H3_CT_${caseTag}` });
  const saveTeam = async (team, members, page = admin) => successful(await api(page, teamPath(team.bizId), { method: 'PUT', body: input(team, members) }), '保存实际合同团队');
  const reject = (response, label, pattern = /合同|团队|成员|比例|主责|版本|币种|金额|无权|不存在|重复|频繁|记录|ID/) => {
    const message = response.body?.msg || response.body?.message || '';
    check(`${label} HTTP=${response.status} code=${response.body?.code} message=${message}`,
      ([400, 403, 404, 409, 503].includes(response.status) || response.status === 200 && response.body?.code === 500)
      && response.body?.code !== 200 && pattern.test(message));
  };
  const forbidden = (response, label) => check(`${label} HTTP=${response.status} code=${response.body?.code}`, response.status === 403 && response.body?.code === 403);
  const create = async (suffix, amount = '100.01', ownerId = adminId) => {
    const name = `H3_CT_${caseTag}_${suffix}`;
    const id = successful(await api(admin, '/oa/contract', { method: 'POST', body: {
      contractName: name, contractNo: name, counterpartyName: '合同锁币种验收客户', contractType: 'SALES',
      amount, currency: 'CNY', ownerId, ownerName: '导入验收负责人',
    } }), '真实创建合同');
    assert.ok(Number.isSafeInteger(id) && id > 0);
    return read(id);
  };
  const edit = async (record, changes) => {
    successful(await api(admin, '/oa/contract', { method: 'PUT', body: { ...record, ...changes } }), '真实编辑合同');
    return read(record.contractId);
  };
  let contract = await create('primary');
  let team = await readTeam(contract.contractId);
  check('未配置合同团队时按真实HR负责人100%显示，读取不锁币种', team.teamVersion === 0 && team.members.length === 1
    && team.ownerId === adminId && team.members[0].salesUserName === '导入验收负责人' && Number(team.amount) === 100.01 && contract.currencyLocked === false);
  contract = await edit(contract, { currency: 'USD' });
  check('尚无分成历史的合同允许换币种且不换算金额', contract.currency === 'USD' && Number(contract.amount) === 100.01 && contract.currencyLocked === false);
  team = await saveTeam(await readTeam(contract.contractId), pair());
  contract = await read(contract.contractId);
  check('合同与团队一次保存，真实HR快照及币种锁同时生效', team.teamVersion === 1 && team.businessVersion === contract.version && contract.currencyLocked === true
    && team.currency === 'USD' && Number(team.members.find(row => row.salesUserId === adminId).allocatedAmount) === 60.01
    && Number(team.members.find(row => row.salesUserId === salesId).allocatedAmount) === 40);
  const history = JSON.stringify(await readTeam(contract.contractId, admin, 1));
  const currentCount = () => database(`SELECT COUNT(*) FROM crm_deal_team WHERE tenant_id=100000 AND biz_type='CONTRACT' AND biz_id=${contract.contractId};`);
  const beforeCount = currentCount();
  for (const [label, changes] of [
    ['有历史分成不能改币种', { currency: 'CNY' }], ['不能伪造未锁标志绕过币种锁', { currency: 'EUR', currencyLocked: false }],
    ['合同编辑必须携带当前版本', { version: undefined }], ['拒绝超过分的合同金额', { amount: '100.001' }],
    ['拒绝负合同金额', { amount: '-0.01' }], ['拒绝超出十二位整数的合同金额', { amount: '1000000000000' }],
    ['有团队不能伪造新的客户绑定', { customerId: 99999999 }],
    ['多人团队不能通过普通编辑偷换主责', { ownerId: salesId }],
  ]) reject(await api(admin, '/oa/contract', { method: 'PUT', body: { ...contract, ...changes } }), label);
  check('拒绝修改后合同币种、版本和历史分成逐条不变', (await read(contract.contractId)).version === contract.version
    && (await read(contract.contractId)).currency === 'USD' && currentCount() === beforeCount && JSON.stringify(await readTeam(contract.contractId, admin, 1)) === history);
  team = await saveTeam(await readTeam(contract.contractId), pair('0.5000', '0.5000'));
  const firstVersion = await readTeam(contract.contractId, admin, 1);
  check('调整比例生成独立版本并保留旧版金额和币种', team.teamVersion === 2 && firstVersion.historical === true && firstVersion.currency === 'USD'
    && Number(firstVersion.members.find(row => row.salesUserId === adminId).allocatedAmount) === 60.01 && firstVersion.versions.join(',') === '2,1');
  contract = await edit(await read(contract.contractId), { amount: '200.02', currency: undefined, ownerName: '伪造合同主责姓名' });
  team = await readTeam(contract.contractId);
  check('同币种改金额只更新当前预览，旧版分配与可信负责人保持不变', contract.currency === 'USD' && contract.ownerName === '导入验收负责人'
    && team.teamVersion === 2 && team.members.every(row => Number(row.allocatedAmount) === 100.01)
    && Number((await readTeam(contract.contractId, admin, 1)).amount) === 100.01);
  reject(await api(admin, `/oa/contract/${contract.contractId}`, { method: 'DELETE' }), '有历史分成的合同不能删除');
  evidence.currencyLock = true;
  const invalid = await create('invalid');
  const invalidTeam = await readTeam(invalid.contractId);
  for (const [label, body] of [
    ['合同团队拒绝省略业务版本', { ...input(invalidTeam, pair()), businessVersion: undefined }],
    ['合同团队拒绝省略团队版本', { ...input(invalidTeam, pair()), teamVersion: undefined }],
    ['合同团队拒绝重复成员', input(invalidTeam, [member(adminId, 'OWNER', '0.5'), member(adminId, 'CO_SELLER', '0.5')])],
    ['合同团队拒绝没有主责', input(invalidTeam, [member(adminId, 'CO_SELLER', '1')])],
    ['合同团队拒绝两个主责', input(invalidTeam, [member(adminId, 'OWNER', '0.5'), member(salesId, 'OWNER', '0.5')])],
    ['合同团队拒绝比例不满100%', input(invalidTeam, pair('0.2', '0.4'))],
    ['合同团队拒绝比例超过100%', input(invalidTeam, pair('0.7', '0.4'))],
    ['合同团队拒绝超出四位小数', input(invalidTeam, pair('0.60001', '0.39999'))],
    ['合同团队拒绝无真实员工的成员', input(invalidTeam, [member(999999999, 'OWNER', '1')])],
    ['合同团队拒绝空成员', input(invalidTeam, [])],
  ]) reject(await api(admin, teamPath(invalid.contractId), { method: 'PUT', body }), label);
  check('失败团队请求零插入、零版本变更且未锁币种', database(`SELECT COUNT(*) FROM crm_deal_team WHERE biz_type='CONTRACT' AND biz_id=${invalid.contractId};`) === '0'
    && (await read(invalid.contractId)).version === invalid.version && (await read(invalid.contractId)).currencyLocked === false);
  const cents = await create('negative_remainder', '0.01');
  reject(await api(admin, teamPath(cents.contractId), { method: 'PUT', body: input(await readTeam(cents.contractId),
    [member(adminId, 'OWNER', '0'), member(salesId, 'CO_SELLER', '0.5'), member(managerId, 'SUPPORT', '0.5')]) }), '舍入导致主责负金额时整笔回滚');
  check('负尾差不留下团队或币种锁', (await read(cents.contractId)).currencyLocked === false);
  const saveRace = await create('team_race');
  const raceTeam = await readTeam(saveRace.contractId);
  const results = await Promise.all([api(admin, teamPath(saveRace.contractId), { method: 'PUT', body: input(raceTeam, pair()) }),
    api(admin, teamPath(saveRace.contractId), { method: 'PUT', body: input(raceTeam, pair('0.5', '0.5')) })]);
  check('同合同双团队真实竞争只保存一组版本', results.filter(response => response.status === 200 && response.body?.code === 200).length === 1
    && (await readTeam(saveRace.contractId)).teamVersion === 1 && (await read(saveRace.contractId)).version === 1);
  for (let attempt = 0; attempt < 3; attempt++) {
    const race = await create(`currency_race_${attempt}`);
    const before = await readTeam(race.contractId);
    const outcomes = await Promise.all([api(admin, teamPath(race.contractId), { method: 'PUT', body: input(before, pair()) }),
      api(admin, '/oa/contract', { method: 'PUT', body: { ...race, currency: 'EUR' } })]);
    check(`币种修改与首次团队保存竞争${attempt + 1}只成功一个入口`, outcomes.filter(response => response.status === 200 && response.body?.code === 200).length === 1);
    const after = await read(race.contractId);
    const saved = await readTeam(race.contractId);
    check(`币种竞争${attempt + 1}没有旧币种分配挂到新币种合同`, after.currencyLocked ? after.currency === 'CNY' && saved.teamVersion === 1 && saved.currency === 'CNY'
      : after.currency === 'EUR' && saved.teamVersion === 0 && saved.currency === 'EUR');
  }
  const unused = await create('delete_first');
  const unusedTeam = await readTeam(unused.contractId);
  successful(await api(admin, `/oa/contract/${unused.contractId}`, { method: 'DELETE' }), '真实删除无分成记录的草稿合同');
  check('合同删除成功必须实际保存删除标记和新版本', database(`SELECT COUNT(*) FROM oa_contract WHERE tenant_id=100000 AND contract_id=${unused.contractId} AND deleted=1 AND version=1;`) === '1');
  reject(await api(admin, `/oa/contract/${unused.contractId}`), '已删除合同不能通过详情入口读取');
  reject(await api(admin, teamPath(unused.contractId), { method: 'PUT', body: input(unusedTeam, pair()) }), '删除先完成后不能再保存团队');
  check('删除先完成不会留下分成团队', database(`SELECT COUNT(*) FROM crm_deal_team WHERE tenant_id=100000 AND biz_type='CONTRACT' AND biz_id=${unused.contractId};`) === '0');
  const removal = await create('delete_race');
  const beforeRemoval = await readTeam(removal.contractId);
  const deleted = await Promise.all([api(admin, teamPath(removal.contractId), { method: 'PUT', body: input(beforeRemoval, pair()) }),
    api(admin, `/oa/contract/${removal.contractId}`, { method: 'DELETE' })]);
  check('首次团队保存与删除竞争只成功一次', deleted.filter(response => response.status === 200 && response.body?.code === 200).length === 1);
  check('删除竞争的接口结果与实际删除状态一致', database(`SELECT deleted FROM oa_contract WHERE tenant_id=100000 AND contract_id=${removal.contractId};`)
    === (deleted[1].status === 200 && deleted[1].body?.code === 200 ? '1' : '0'));
  check('删除竞争不产生已删除合同的孤立团队', database(`SELECT COUNT(*) FROM crm_deal_team team JOIN oa_contract contract ON contract.contract_id=team.biz_id AND contract.tenant_id=team.tenant_id WHERE team.biz_type='CONTRACT' AND team.biz_id=${removal.contractId} AND contract.deleted<>0;`) === '0');
  evidence.concurrency = true;
  for (const [page, label] of [[employee, '员工'], [sales, '普通销售']]) {
    forbidden(await api(page, teamPath(contract.contractId), { method: 'PUT', body: input(team, pair()) }), `${label}不能维护合同团队`);
  }
  forbidden(await api(employee, teamPath(contract.contractId)), '员工不能读取合同团队');
  reject(await api(foreign, teamPath(contract.contractId)), '跨租户不能读取合同团队');
  reject(await api(foreign, teamPath(contract.contractId), { method: 'PUT', body: input(team, pair()) }), '跨租户不能修改合同团队');
  forbidden(await api(sales, `/oa/contract/${contract.contractId}`), '未获合同读取权限的销售不能通过详情入口读取');
  forbidden(await api(sales, teamPath(contract.contractId)), '销售团队查询权限不能替代合同读取权限');
  const inner = await api(admin, `/oa/inner/oa/contract-teams/${contract.contractId}`, { method: 'PUT', headers: { 'X-Inner-Call': 'true', 'X-From-Service': 'cloudflow-service-crm' }, body: input(team, pair()) });
  check('伪造内部来源头不能绕过合同团队权限', [403, 404].includes(inner.status));
  const changedOwner = await create('owner_change');
  const ownerTeam = await saveTeam(await readTeam(changedOwner.contractId), pair());
  const changed = await saveTeam(ownerTeam, [member(managerId, 'OWNER', '0.7'), member(salesId, 'CO_SELLER', '0.3')]);
  const record = await read(changedOwner.contractId);
  const department = Number(database(`SELECT dept_id FROM hr_employee WHERE tenant_id=100000 AND user_id=${managerId} AND deleted=0;`));
  check('主责与部门以及整组团队在同一事务同步更新', changed.ownerId === managerId && record.ownerId === managerId
    && record.ownerName === '商机验收主管' && record.deptId === department && record.version === changed.businessVersion);
  check('更换主责不改写历史团队', (await readTeam(changedOwner.contractId, admin, 1)).ownerId === adminId);
  forbidden(await api(manager, teamPath(changedOwner.contractId)), '销售主管成为负责人也不能绕过原合同读取权限');
  evidence.permissions = true; evidence.business = true;
  if (!context.httpOnly) {
    const uiContract = await create('interface', '123.45');
    const uiTeam = await saveTeam(await readTeam(uiContract.contractId), pair());
    await verifyContractTeamInterface({ ...context, employee, sales, uiContract, uiTeam, read, readTeam, saveTeam, pair, edit });
  }
  check('合同专项前后EMPLOYEE完整授权逐条一致', database(grantSql) === grants);
}
