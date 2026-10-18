import assert from 'node:assert/strict';
import { verifyDealTeamInterface } from './verify-deal-team-h3-ui.mjs';

export async function verifyOpportunityTeams(context) {
  const { admin, sales, manager, employee, foreign, api, successful, database, check, createCustomer, createOpportunity, edit, detail, adminId, salesId, managerId, caseTag, evidence } = context;
  const endpoint = id => `/crm/deal-team/OPPORTUNITY/${id}`;
  const read = async (id, page = admin, version) => successful(await api(page, `${endpoint(id)}${version === undefined ? '' : `?teamVersion=${version}`}`), '读取真实团队版本');
  let sequence = 0;
  const input = (team, members, remark) => ({ businessVersion: team.businessVersion, teamVersion: team.teamVersion, members, remark: remark || `H3_TEAM_${caseTag}_${++sequence}` });
  const member = (salesUserId, roleType, allocatedPercentage) => ({ salesUserId, roleType, allocatedPercentage });
  const pair = (ownerId = adminId, ownerPercentage = '0.6000', otherPercentage = '0.4000') => [member(ownerId, 'OWNER', ownerPercentage), member(salesId, 'CO_SELLER', otherPercentage)];
  const save = async (id, team, members, page = admin) => successful(await api(page, endpoint(id), { method: 'PUT', body: input(team, members) }), '保存真实团队版本');
  const reject = (result, label) => check(`${label} HTTP=${result.status} code=${result.body?.code}`, [400, 403, 404, 409].includes(result.status) && result.body?.code !== 200);
  const forbidden = (result, label) => check(`${label} HTTP=${result.status}`, result.status === 403 && result.body?.code === 403);
  const customerId = await createCustomer('team_customer', admin, adminId);
  let business = await createOpportunity('team_business', customerId, admin, adminId);
  const id = business.opportunityId;
  const initial = await read(id);
  check('真实创建商机同时生成版本1的100%主责团队，业务版本为0', initial.teamVersion === 1 && initial.businessVersion === 0
    && initial.members.length === 1 && initial.members[0].salesUserId === adminId && Number(initial.members[0].allocatedPercentage) === 1);
  business = await edit(business, { expectedAmount: '100.01' }, admin);
  let current = await read(id);
  check('普通金额修改同步当前团队预览但不制造新团队版本', current.teamVersion === 1 && current.businessVersion === business.version && Number(current.amount) === 100.01);
  forbidden(await api(employee, endpoint(id)), '员工无团队读取权限');
  forbidden(await api(employee, endpoint(id), { method: 'PUT', body: input(current, pair()) }), '员工无团队维护权限');
  forbidden(await api(sales, endpoint(id), { method: 'PUT', body: input(current, pair()) }), '销售代表未被授予团队维护权限');
  reject(await api(foreign, endpoint(id)), '跨租户管理员不能读取团队');
  reject(await api(foreign, endpoint(id), { method: 'PUT', body: input(current, pair()) }), '跨租户管理员不能修改团队');
  reject(await api(admin, `/crm/deal-team/UNKNOWN/${id}`), '未实现的业务类型明确拒绝');
  for (const [label, members] of [
    ['非100%团队', pair(adminId, '0.6000', '0.3000')],
    ['重复成员', [member(adminId, 'OWNER', '0.6'), member(adminId, 'CO_SELLER', '0.4')]],
    ['多个主责', [member(adminId, 'OWNER', '0.6'), member(salesId, 'OWNER', '0.4')]],
    ['没有主责', [member(adminId, 'SUPPORT', '1')]],
    ['超过四位精度', pair(adminId, '0.60001', '0.39999')],
    ['没有HR档案的用户', [member(adminId, 'OWNER', '0.6'), member(990000702, 'CO_SELLER', '0.4')]],
    ['空团队', []],
  ]) reject(await api(admin, endpoint(id), { method: 'PUT', body: input(current, members) }), `${label}真实接口拒绝`);
  const originalStatus = database(`SELECT employee_status FROM hr_employee WHERE tenant_id=100000 AND user_id=${salesId};`);
  const originalDepartmentStatus = database('SELECT status FROM sys_dept WHERE tenant_id=100000 AND dept_id=100;');
  const originalUserStatus = database(`SELECT status FROM sys_user WHERE tenant_id=100000 AND user_id=${salesId};`);
  const foreignEmployeeExisted = database('SELECT COUNT(*) FROM hr_employee WHERE id=990000703;') !== '0';
  try {
    if (!foreignEmployeeExisted) database("INSERT INTO hr_employee (id,tenant_id,employee_no,name,gender,dept_id,user_id,employee_status) VALUES (990000703,100001,'G_TEAM_FOREIGN','跨租户团队验收成员','MALE',990000101,990000703,'REGULAR');");
    reject(await api(admin, endpoint(id), { method: 'PUT', body: input(current, [member(adminId, 'OWNER', '0.6'), member(990000703, 'CO_SELLER', '0.4')]) }), '真实HR中有档案的跨租户员工不可加入');
    database(`UPDATE sys_user SET status='1' WHERE tenant_id=100000 AND user_id=${salesId};`);
    reject(await api(admin, endpoint(id), { method: 'PUT', body: input(current, pair()) }), '真实HR核验停用登录账号后拒绝成员');
    database(`UPDATE sys_user SET status='0' WHERE tenant_id=100000 AND user_id=${salesId};`);
    database(`UPDATE hr_employee SET employee_status='RESIGNED' WHERE tenant_id=100000 AND user_id=${salesId};`);
    reject(await api(admin, endpoint(id), { method: 'PUT', body: input(current, pair()) }), '真实HR核验离职状态后拒绝成员');
    database(`UPDATE hr_employee SET employee_status='REGULAR' WHERE tenant_id=100000 AND user_id=${salesId};`);
    database("UPDATE sys_dept SET status='1' WHERE tenant_id=100000 AND dept_id=100;");
    reject(await api(admin, endpoint(id), { method: 'PUT', body: input(current, pair()) }), '真实HR核验停用部门后拒绝团队');
  } finally {
    const literal = value => `CONVERT(UNHEX('${Buffer.from(String(value)).toString('hex')}') USING utf8mb4)`;
    database(`UPDATE sys_user SET status=${literal(originalUserStatus)} WHERE tenant_id=100000 AND user_id=${salesId};`);
    database(`UPDATE hr_employee SET employee_status=${literal(originalStatus)} WHERE tenant_id=100000 AND user_id=${salesId};`);
    database(`UPDATE sys_dept SET status=${literal(originalDepartmentStatus)} WHERE tenant_id=100000 AND dept_id=100;`);
    if (!foreignEmployeeExisted) database('DELETE FROM hr_employee WHERE id=990000703 AND tenant_id=100001 AND employee_no=\'G_TEAM_FOREIGN\';');
  }
  check('全部非法团队请求均未消耗业务或团队版本', JSON.stringify(await read(id)) === JSON.stringify(current));
  const forged = input(current, pair().map(value => ({ ...value, commissionRate: '1', commissionAmount: '999999', salesUserName: '伪造成员名', deptId: 999999 })));
  current = successful(await api(admin, endpoint(id), { method: 'PUT', body: { ...forged, tenantId: 100001 } }), '实际保存有效成员并忽略客户端薪酬/归属伪造');
  check('HR真实批量结果提供姓名、员工和部门，分配精确到分', current.teamVersion === 2 && current.members.find(value => value.salesUserId === salesId)?.salesUserName === '商机验收销售'
    && current.members.every(value => value.deptId === 100) && Number(current.members.find(value => value.salesUserId === adminId)?.allocatedAmount) === 60.01
    && Number(current.members.find(value => value.salesUserId === salesId)?.allocatedAmount) === 40);
  check('普通团队请求不能核定任何提成率或提成额', database(`SELECT COUNT(*) FROM crm_deal_team WHERE tenant_id=100000 AND biz_type='OPPORTUNITY' AND biz_id=${id} AND (commission_rate IS NOT NULL OR commission_amount<>0);`) === '0');
  reject(await api(sales, endpoint(id)), '团队成员身份不扩大原商机数据范围');
  const historical = await read(id, admin, 1);
  check('历史版本保留原主责、金额及只读标记', historical.historical && historical.currentTeamVersion === 2 && historical.members.length === 1 && Number(historical.amount) === 100.01);
  reject(await api(admin, `${endpoint(id)}?teamVersion=0`), '不存在的默认历史版本不可冒充当前团队');
  reject(await api(admin, `${endpoint(id)}?teamVersion=999999`), '未来团队版本拒绝');
  const beforeEdit = current;
  business = await edit(await detail(id, admin), { remark: '真实团队版本竞争前的业务更新' }, admin);
  reject(await api(admin, endpoint(id), { method: 'PUT', body: input(beforeEdit, pair()) }), '业务已更新时旧团队草稿拒绝，即使团队版本未变');
  current = await read(id);
  const competing = await Promise.all([pair(), pair(adminId, '0.4000', '0.6000')].map(members => api(admin, endpoint(id), { method: 'PUT', body: input(current, members) })));
  check('两个真实团队HTTP同版本竞争只成功一个', competing.filter(result => result.status === 200 && result.body?.code === 200).length === 1);
  const afterCompeting = await read(id);
  check('竞争只产生一组新版本且业务版本只加一', afterCompeting.teamVersion === current.teamVersion + 1 && afterCompeting.businessVersion === current.businessVersion + 1
    && database(`SELECT COUNT(*) FROM crm_deal_team WHERE tenant_id=100000 AND biz_type='OPPORTUNITY' AND biz_id=${id} AND current_flag=1;`) === '2');
  current = await save(id, afterCompeting, pair(adminId, '0.7500', '0.2500'));
  successful(await api(admin, `/crm/opportunity/${id}/win`, { method: 'POST', body: { version: current.businessVersion } }), '团队真实业务赢单');
  const factId = database(`SELECT event_id FROM crm_deal_event WHERE tenant_id=100000 AND event_type='WON' AND biz_type='OPPORTUNITY' AND biz_id=${id};`);
  assert.match(factId, /^\d+$/);
  check('实际赢单产生唯一CNY冻结事实并记录发生时团队版本', database(`SELECT COUNT(*) FROM crm_deal_event WHERE event_id=${factId} AND tenant_id=100000 AND amount=100.01 AND currency='CNY' AND team_version=${current.teamVersion} AND baseline_flag=0;`) === '1');
  const allocationSnapshot = () => database(`SELECT JSON_OBJECT('allocation',allocation_id,'user',sales_user_id,'employee',employee_id,'dept',dept_id,'ratio',allocated_percentage,'amount',allocated_amount,'status',commission_status) FROM crm_deal_allocation WHERE tenant_id=100000 AND event_id=${factId} ORDER BY sales_user_id;`);
  const frozen = allocationSnapshot();
  check('真实赢单75%/25%分配为75.01和25.00且不制造到账提成', database(`SELECT COUNT(*) FROM crm_deal_allocation WHERE tenant_id=100000 AND event_id=${factId} AND commission_status='NOT_APPLICABLE' AND commission_amount IS NULL AND ((sales_user_id=${adminId} AND allocated_amount=75.01) OR (sales_user_id=${salesId} AND allocated_amount=25.00));`) === '2');
  business = await detail(id, admin);
  successful(await api(admin, `/crm/opportunity/${id}/win`, { method: 'POST', body: { version: business.version } }), '重复赢单幂等返回实际已赢单业务');
  check('重复真实赢单没有第二笔事实或重复分配', database(`SELECT COUNT(*) FROM crm_deal_event WHERE tenant_id=100000 AND event_type='WON' AND biz_type='OPPORTUNITY' AND biz_id=${id};`) === '1' && allocationSnapshot() === frozen);
  current = await save(id, await read(id), pair(adminId, '0.5000', '0.5000'));
  check('已赢单后同主责调整未来团队，不重算既有冻结业绩', current.teamVersion > business.teamVersion && allocationSnapshot() === frozen);
  reject(await api(admin, endpoint(id), { method: 'PUT', body: input(current, [member(adminId, 'CO_SELLER', '0.5'), member(salesId, 'OWNER', '0.5')]) }), '终态商机不能借团队入口更换主责');
  const ownCustomer = await createCustomer('team_manager_customer', manager, managerId);
  const managed = await createOpportunity('team_manager', ownCustomer, manager, managerId);
  const managedTeam = await save(managed.opportunityId, await read(managed.opportunityId, manager), pair(managerId), manager);
  check('获批销售主管可维护本人商机团队', managedTeam.ownerId === managerId && managedTeam.members.length === 2);
  const salesCustomer = await createCustomer('team_sales_customer', sales, salesId);
  const salesBusiness = await createOpportunity('team_sales', salesCustomer, sales, salesId);
  database(`UPDATE crm_deal_team SET commission_rate=0.1250,commission_amount=52500 WHERE tenant_id=100000 AND biz_type='OPPORTUNITY' AND biz_id=${salesBusiness.opportunityId} AND current_flag=1;`);
  try {
    const redacted = await read(salesBusiness.opportunityId, sales);
    const privileged = await read(salesBusiness.opportunityId, admin);
    check('实际团队接口对无薪资权限者完全移除非空提成字段', redacted.members.every(value => !Object.hasOwn(value, 'commissionRate') && !Object.hasOwn(value, 'commissionAmount'))
      && Number(privileged.members[0].commissionRate) === 0.125);
  } finally { database(`UPDATE crm_deal_team SET commission_rate=NULL,commission_amount=0 WHERE tenant_id=100000 AND biz_type='OPPORTUNITY' AND biz_id=${salesBusiness.opportunityId} AND current_flag=1;`); }
  const uiBusiness = await edit(await createOpportunity('team_ui', customerId, admin, adminId), { expectedAmount: '100.01' }, admin);
  await save(uiBusiness.opportunityId, await read(uiBusiness.opportunityId), pair());
  await verifyDealTeamInterface({ ...context, business: uiBusiness, salesBusiness, read, save, pair });
  evidence.teams = true; evidence.teamHrHttp = true; evidence.wonFacts = true;
}
