import assert from 'node:assert/strict';
import { verifyOpportunityInterface } from './verify-opportunity-h3-ui.mjs';
import { verifyOpportunityReminders } from './verify-opportunity-h3-reminders.mjs';
import { verifyOpportunityTeams } from './verify-deal-team-h3-real.mjs';
import { verifyOpportunityReopen } from './verify-opportunity-reopen-h3-real.mjs';

export async function verifyOpportunity({ admin, api, successful, session, database, check, directory, caseTag, state, evidence, teamsOnly = false, reopenOnly = false }) {
  check('H3使用真实HR、OA、CRM、工作流、认证及网关服务', ['auth', 'hr', 'oa', 'crm', 'workflow', 'gateway'].every(name => state.services.some(service => service.name === name)));
  const quote = value => value == null ? 'NULL' : `CONVERT(UNHEX('${Buffer.from(String(value)).toString('hex')}') USING utf8mb4)`;
  const rejected = (result, label) => check(`${label} HTTP=${result.status} code=${result.body?.code}`, [400, 403, 404, 409].includes(result.status) || [400, 403, 404, 409].includes(result.body?.code));
  const forbidden = (result, label) => check(`${label} HTTP=${result.status}`, result.status === 403 && result.body?.code === 403);
  const waitFor = async (read, accepts, label) => {
    const deadline = Date.now() + 60000;
    do {
      const value = await read();
      if (accepts(value)) return value;
      await new Promise(resolve => setTimeout(resolve, 300));
    } while (Date.now() < deadline);
    throw new Error(label);
  };
  const sales = await session('g_opportunity_sales');
  const manager = await session('g_opportunity_manager');
  const employee = await session('g_holiday_employee');
  const foreign = await session('g_import_tenant');
  const salesId = Number(database("SELECT user_id FROM sys_user WHERE tenant_id=100000 AND user_name='g_opportunity_sales';"));
  const managerId = Number(database("SELECT user_id FROM sys_user WHERE tenant_id=100000 AND user_name='g_opportunity_manager';"));
  const adminId = Number(database("SELECT user_id FROM sys_user WHERE tenant_id=100000 AND user_name='g_import_admin';"));
  const originalLeader = JSON.parse(database('SELECT JSON_OBJECT(\'leader\',leader) FROM sys_dept WHERE tenant_id=100000 AND dept_id=100;')).leader;
  const employeeGrants = database('SELECT tenant_id,menu_id FROM sys_role_menu WHERE role_id=5 ORDER BY tenant_id,menu_id;');
  const listRules = async () => successful(await api(admin, '/crm/sales-stage/list'), '读取阶段规则');
  const originalRules = await listRules();
  const rule = async code => (await listRules()).find(value => value.stageCode === code);
  const saveRule = async (code, values) => successful(await api(admin, '/crm/sales-stage', { method: 'PUT', body: { ...await rule(code), ...values } }), '真实保存阶段规则');
  const detail = async (id, page = sales) => successful(await api(page, `/crm/opportunity/${id}`), '读取真实商机');
  const edit = async (value, changes, page = sales) => {
    successful(await api(page, '/crm/opportunity', { method: 'PUT', body: { ...value, ...changes } }), '真实修改商机');
    return detail(value.opportunityId, page);
  };
  const advance = async (value, stage, page = sales) => {
    successful(await api(page, '/crm/opportunity/stage', { method: 'PUT', body: { opportunityId: value.opportunityId, version: value.version, stage } }), '真实推进商机');
    return detail(value.opportunityId, page);
  };
  const createCustomer = async (suffix, page = sales, ownerId = salesId) => {
    const name = `H3_${caseTag}_${suffix}`;
    successful(await api(page, '/crm/customer', { method: 'POST', body: { customerCode: name, customerName: name, ownerId } }), '真实创建客户');
    const id = database(`SELECT customer_id FROM crm_customer WHERE tenant_id=100000 AND customer_code=${quote(name)} AND deleted=0;`);
    assert.match(id, /^\d+$/);
    return Number(id);
  };
  const createOpportunity = async (suffix, customerId, page = sales, ownerId = salesId) => {
    const name = `H3_${caseTag}_${suffix}`;
    successful(await api(page, '/crm/opportunity', { method: 'POST', body: { opportunityName: name, customerId, ownerId, expectedAmount: '420000.00', ownerName: '伪造负责人', deptId: 999999, deptName: '伪造部门', weightedAmount: '1', tenantId: 100001 } }), '真实创建商机');
    const id = database(`SELECT opportunity_id FROM crm_opportunity WHERE tenant_id=100000 AND opportunity_name=${quote(name)} AND deleted=0;`);
    assert.match(id, /^\d+$/);
    return detail(Number(id), page);
  };
  const verifyTeams = () => verifyOpportunityTeams({ admin, sales, manager, employee, foreign, api, successful, database, check, directory, caseTag,
    createCustomer, createOpportunity, edit, detail, adminId, salesId, managerId, evidence });
  check('H3已批准十八项菜单精确包含商机团队、提成、邮件、门户与商机导入范围', database('SELECT GROUP_CONCAT(menu_id ORDER BY menu_id) FROM sys_menu WHERE menu_id BETWEEN 1900 AND 1949;') === '1900,1901,1902,1903,1904,1905,1906,1907,1908,1909,1910,1911,1912,1913,1914,1915,1916,1917');
  check('1904终态恢复精确授权管理员与销售主管', database('SELECT GROUP_CONCAT(role_id ORDER BY role_id) FROM sys_role_menu WHERE menu_id=1904 AND tenant_id=100000;') === '1,8');
  for (const [menuId, roles] of [[1900, '1,8,9,10,11'], [1901, '1,8,10'], [1902, '1,8,9'], [1903, '1,8,9,10,11'], [1905, '1,8,9,10,11'], [1906, '1,8,10'], [1907, '1,3,4,8'], [1908, '1,3,4'], [1912, '1,8,10'], [1913, '1,8,10'], [1914, '1,8,9,11'], [1915, '1,7'], [1916, '1,3'], [1917, '1']]) {
    check(`H3菜单${menuId}真实角色精确为${roles}`, database(`SELECT GROUP_CONCAT(role_id ORDER BY role_id) FROM sys_role_menu WHERE tenant_id=100000 AND menu_id=${menuId};`) === roles);
  }
  check('EMPLOYEE本批新增权限为0', database('SELECT COUNT(*) FROM sys_role_menu WHERE tenant_id=100000 AND role_id=5 AND menu_id BETWEEN 1900 AND 1949;') === '0');
  check('六个规范阶段及百分数转换的初始值可用', ['LEAD', 'QUALIFIED', 'PROPOSAL', 'NEGOTIATION', 'WON', 'LOST'].every(code => originalRules.some(value => value.stageCode === code && value.status === 'ACTIVE')));
  const qualified = await rule('QUALIFIED');
  forbidden(await api(employee, '/crm/sales-stage/list'), '员工无销售阶段配置读取权限');
  forbidden(await api(employee, '/crm/sales-stage', { method: 'PUT', body: qualified }), '员工无销售阶段写权限');
  forbidden(await api(sales, '/crm/sales-stage', { method: 'PUT', body: qualified }), '销售代表可读规则但不可维护');
  rejected(await api(admin, '/crm/sales-stage', { method: 'PUT', body: { ...qualified, requiredFields: ['customer.password'] } }), '任意嵌套必填字段拒绝');
  rejected(await api(admin, '/crm/sales-stage', { method: 'PUT', body: { ...qualified, defaultWinRate: '1.0001' } }), '默认比例超出1拒绝');
  try {
    database(`UPDATE sys_dept SET leader=${quote(managerId)} WHERE tenant_id=100000 AND dept_id=100;`);
    if (teamsOnly) { await verifyTeams(); return; }
    if (reopenOnly) {
      await verifyOpportunityReopen({ admin, sales, manager, employee, foreign, api, successful, database, check, directory, caseTag, state, evidence,
        createCustomer, createOpportunity, edit, detail, adminId, salesId, managerId, rule, saveRule, waitFor, quote });
      return;
    }
    const customerId = await createCustomer('customer');
    let main = await createOpportunity('main', customerId);
    check('商机负责人和部门从真实HR读取，客户端伪造字段不生效', main.ownerId === salesId && main.ownerName === '商机验收销售' && main.deptId === 100 && main.deptName !== '伪造部门' && main.tenantId === 100000);
    check('新商机从首阶段开始并生成可信加权金额', main.stage === 'LEAD' && main.status === 'OPEN' && Number(main.winRate) === 10 && Number(main.weightedAmount) === 42000);
    main = await edit(main, { winRate: 65, weightedAmount: 1 });
    check('420000元乘65%为273000元，忽略客户端加权金额', Number(main.weightedAmount) === 273000);
    rejected(await api(sales, '/crm/opportunity', { method: 'PUT', body: { ...main, winRate: 101 } }), '商机赢率超出100拒绝');
    rejected(await api(sales, '/crm/opportunity/stage', { method: 'PUT', body: { opportunityId: main.opportunityId, version: main.version, stage: 'PROPOSAL' } }), '独立入口禁止跨过阶段');
    rejected(await api(sales, '/crm/opportunity', { method: 'PUT', body: { ...main, stage: 'PROPOSAL' } }), '通用编辑不能绕过跳阶段规则');
    rejected(await api(sales, '/crm/opportunity', { method: 'PUT', body: { ...main, status: 'CLOSED' } }), '通用编辑不能直接结案');
    await saveRule('QUALIFIED', { requiredFields: ['contactId', 'expectedSignDate'], requiredActivityFlag: 1 });
    rejected(await api(sales, '/crm/opportunity/stage', { method: 'PUT', body: { opportunityId: main.opportunityId, version: main.version, stage: 'QUALIFIED' } }), '缺少联系人及签约日期不能推进');
    const contactName = `H3_${caseTag}_contact`;
    successful(await api(sales, '/crm/contact', { method: 'POST', body: { customerId, contactName, status: 'ACTIVE' } }), '真实建立客户联系人');
    const contactId = Number(database(`SELECT contact_id FROM crm_contact WHERE tenant_id=100000 AND customer_id=${customerId} AND contact_name=${quote(contactName)};`));
    main = await edit(main, { contactId, expectedSignDate: database('SELECT CURRENT_DATE;') });
    rejected(await api(sales, '/crm/opportunity/stage', { method: 'PUT', body: { opportunityId: main.opportunityId, version: main.version, stage: 'QUALIFIED' } }), '无有效跟进不能推进');
    successful(await api(sales, '/crm/follow-up', { method: 'POST', body: { customerId, opportunityId: main.opportunityId, followUpType: 'CALL', followUpTime: database("SELECT DATE_FORMAT(NOW(),'%Y-%m-%d %H:%i:%s');"), content: `H3_${caseTag}真实沟通记录` } }), '真实创建商机跟进');
    main = await detail(main.opportunityId);
    main = await advance(main, 'QUALIFIED');
    check('满足规则后真实推进并记录上一阶段和新默认赢率', main.lastStage === 'LEAD' && main.stage === 'QUALIFIED' && Number(main.winRate) === 30 && Number(main.weightedAmount) === 126000);
    const stale = main;
    main = await edit(main, { remark: '新的实际说明' });
    rejected(await api(sales, '/crm/opportunity', { method: 'PUT', body: { ...stale, remark: '旧版本覆盖' } }), '旧版本不能覆盖当前商机');
    check('版本冲突后当前内容保持不变', (await detail(main.opportunityId)).remark === '新的实际说明');
    const hiddenCustomer = await createCustomer('private_customer', admin, adminId);
    const hidden = await createOpportunity('private', hiddenCustomer, admin, adminId);
    rejected(await api(sales, `/crm/opportunity/${hidden.opportunityId}`), '同租户其他负责人商机不能读取');
    rejected(await api(sales, `/crm/opportunity/${hidden.opportunityId}/items`), '产品读取遵循商机数据范围');
    rejected(await api(foreign, `/crm/opportunity/${main.opportunityId}/stage-history`), '跨租户历史读取拒绝');
    forbidden(await api(employee, `/crm/opportunity/${main.opportunityId}/items`, { method: 'PUT', body: { version: main.version, items: [] } }), '员工不能写商机产品');
    const input = { productName: `H3_${caseTag}_line`, quantity: '3', unitPrice: '19.9950', discountRate: '90', taxRate: '13', lineAmount: '999999.00', taxAmount: '999999.00' };
    successful(await api(admin, `/crm/opportunity/${hidden.opportunityId}/items`, { method: 'PUT', body: { version: hidden.version, items: [input] } }), '为管理员本人的商机真实保存产品');
    let items = successful(await api(sales, `/crm/opportunity/${main.opportunityId}/items`, { method: 'PUT', body: { version: main.version, items: [input] } }), '真实保存产品金额');
    check('产品逐行计算为未税53.99元、税额7.02元、含税61.01元，预计采用未税小计', Number(items.subtotal) === 53.99 && Number(items.taxAmount) === 7.02 && Number(items.totalAmount) === 61.01 && Number(items.expectedAmount) === 53.99 && Number(items.weightedAmount) === 16.20);
    main = await detail(main.opportunityId);
    rejected(await api(sales, `/crm/opportunity/${main.opportunityId}/items`, { method: 'PUT', body: { version: main.version, items: [{ ...input, quantity: '-1' }] } }), '负产品数量拒绝');
    rejected(await api(sales, `/crm/opportunity/${main.opportunityId}/items`, { method: 'PUT', body: { version: main.version, items: Array.from({ length: 201 }, () => input) } }), '超过200行拒绝');
    rejected(await api(sales, `/crm/opportunity/${main.opportunityId}/items`, { method: 'PUT', body: { version: stale.version, items: [] } }), '旧版本不能清空新产品');
    main = await edit(main, { expectedAmount: '123456.00' });
    check('有产品时通用编辑不能改写预计总额', Number(main.expectedAmount) === 53.99);
    const simultaneous = await Promise.all(['竞争甲', '竞争乙'].map(remark => api(sales, '/crm/opportunity', { method: 'PUT', body: { ...main, remark } })));
    check('两个真实HTTP相同版本竞争只有一个成功', simultaneous.filter(result => result.status === 200 && result.body?.code === 200).length === 1);
    main = await detail(main.opportunityId);
    await saveRule('PROPOSAL', { status: 'DISABLED' });
    rejected(await api(sales, '/crm/opportunity/stage', { method: 'PUT', body: { opportunityId: main.opportunityId, version: main.version, stage: 'PROPOSAL' } }), '停用目标阶段拒绝');
    await saveRule('PROPOSAL', { status: 'ACTIVE' });
    main = await advance(main, 'PROPOSAL');
    rejected(await api(sales, '/crm/opportunity/stage', { method: 'PUT', body: { opportunityId: main.opportunityId, version: main.version, stage: 'QUALIFIED' } }), '阶段回退必须审批');
    const used = await rule('PROPOSAL');
    rejected(await api(admin, '/crm/sales-stage', { method: 'PUT', body: { ...used, stageCode: `H3_${caseTag}` } }), '已引用阶段编码不可更名');
    const downgradeId = successful(await api(sales, '/crm/approval/opportunity-downgrade', { method: 'POST', body: { opportunityId: main.opportunityId, version: main.version, action: 'DOWNGRADE', targetStage: 'QUALIFIED', lostReason: `H3_${caseTag}客户要求重新确认需求` } }), '提交真实回退审批');
    const instanceId = await waitFor(() => database(`SELECT IFNULL(instance_id,'') FROM crm_approval WHERE tenant_id=100000 AND approval_id=${downgradeId};`), value => Boolean(value), '回退流程未绑定');
    const taskJson = await waitFor(() => database(`SELECT JSON_OBJECT('id',task_id,'assignee',assignee) FROM wf_task WHERE tenant_id=100000 AND instance_id=${quote(instanceId)} AND status='TODO';`), value => Boolean(value), '未生成回退审批任务');
    const task = JSON.parse(taskJson);
    check('回退实际审批人由部门组织关系解析', Number(task.assignee) === managerId);
    successful(await api(manager, '/workflow/wf/complete', { method: 'POST', body: { taskId: task.id, action: 'APPROVE', comment: '同意按客户反馈调整' } }), '实际办理回退审批');
    main = await waitFor(() => detail(main.opportunityId), value => value.stage === 'QUALIFIED', '实际审批回调未推进回退');
    const history = successful(await api(sales, `/crm/opportunity/${main.opportunityId}/stage-history`), '读取真实阶段历史');
    check('循环回退记录独立历史且保留实际原因', history.rows.some(value => value.fromStage === 'PROPOSAL' && value.toStage === 'QUALIFIED' && value.reason?.includes('客户要求重新确认需求')));
    evidence.workflow = true;
    await createOpportunity('visible_admin_owner', customerId, admin, adminId);
    const ownAnalysis = successful(await api(sales, `/crm/opportunity/stage-analysis?currency=CNY&ownerId=${salesId}`), '真实阶段分析');
    const isolatedAnalysis = successful(await api(sales, `/crm/opportunity/stage-analysis?currency=CNY&ownerId=${adminId}`), '按当前客户范围筛选另一负责人');
    const scopedCurrent = database(`SELECT JSON_OBJECT('stage',opportunity.stage,'count',COUNT(*),'amount',SUM(opportunity.expected_amount)) FROM crm_opportunity opportunity JOIN crm_customer customer ON customer.tenant_id=opportunity.tenant_id AND customer.customer_id=opportunity.customer_id AND customer.deleted=0 WHERE opportunity.tenant_id=100000 AND opportunity.deleted=0 AND opportunity.owner_id=${adminId} AND customer.owner_id=${salesId} GROUP BY opportunity.stage;`).split('\n').filter(Boolean).map(value => JSON.parse(value));
    const scopedCohorts = database(`SELECT JSON_OBJECT('stage',history.to_stage,'count',COUNT(DISTINCT history.opportunity_id)) FROM crm_opportunity_stage_history history JOIN crm_opportunity opportunity ON opportunity.tenant_id=history.tenant_id AND opportunity.opportunity_id=history.opportunity_id AND opportunity.deleted=0 JOIN crm_customer customer ON customer.tenant_id=opportunity.tenant_id AND customer.customer_id=opportunity.customer_id AND customer.deleted=0 WHERE history.tenant_id=100000 AND opportunity.owner_id=${adminId} AND customer.owner_id=${salesId} AND history.changed_time>=${quote(isolatedAnalysis.startDate)} AND history.changed_time<DATE_ADD(${quote(isolatedAnalysis.endDate)},INTERVAL 1 DAY) AND history.changed_time<=${quote(isolatedAnalysis.asOf.replace('T', ' '))} GROUP BY history.to_stage;`).split('\n').filter(Boolean).map(value => JSON.parse(value));
    check('负责人筛选保留已获客户范围并逐阶段排除范围外商机及历史', scopedCurrent.length > 0 && isolatedAnalysis.stages.every(value => {
      const current = scopedCurrent.find(record => record.stage === value.stage);
      const cohort = scopedCohorts.find(record => record.stage === value.stage);
      return value.currentCount === (current?.count ?? 0) && value.cohortCount === (cohort?.count ?? 0) && Number(value.currentAmount) === Number(current?.amount ?? 0);
    }));
    const ownQualified = ownAnalysis.stages.find(value => value.stage === 'QUALIFIED');
    check('回退后的阶段当前金额和加权预测来自真实保存结果', Number(ownQualified.currentAmount) >= 53.99 && Number(ownQualified.weightedForecast) >= 16.2);
    rejected(await api(sales, '/crm/opportunity/stage-analysis?currency=USD'), '跨币种分析不得静默合并');
    rejected(await api(sales, '/crm/opportunity/stage-analysis?startDate=2020-01-01'), '超过366天分析拒绝');
    await verifyOpportunityReminders({ admin, sales, api, successful, database, check, waitFor, createOpportunity, customerId, saveRule, detail, advance, salesId, evidence });
    await verifyOpportunityInterface({ admin, sales, employee, api, successful, database, check, directory, caseTag, main, adminOpportunity: hidden, edit, detail, saveRule, rule, evidence });
    main = await detail(main.opportunityId);
    successful(await api(sales, `/crm/opportunity/${main.opportunityId}/win`, { method: 'POST', body: { version: main.version } }), '真实赢单操作');
    main = await detail(main.opportunityId);
    check('赢单真实关闭并以100%加权', main.stage === 'WON' && main.status === 'CLOSED' && Number(main.winRate) === 100 && Number(main.weightedAmount) === Number(main.expectedAmount));
    rejected(await api(sales, `/crm/opportunity/${main.opportunityId}/items`, { method: 'PUT', body: { version: main.version, items: [] } }), '赢单后不能改写产品金额');
    rejected(await api(sales, '/crm/opportunity', { method: 'PUT', body: { ...main, stage: 'LEAD', status: 'OPEN' } }), '终态不能通过通用更新恢复');
    await verifyTeams();
    evidence.business = true;
  } finally {
    for (const original of originalRules) {
      const current = await rule(original.stageCode);
      if (current) successful(await api(admin, '/crm/sales-stage', { method: 'PUT', body: { ...original, version: current.version } }), '恢复隔离阶段规则');
    }
    database(`UPDATE sys_dept SET leader=${quote(originalLeader)} WHERE tenant_id=100000 AND dept_id=100;`);
    check('真实联调前后全部租户EMPLOYEE完整授权集合不变', database('SELECT tenant_id,menu_id FROM sys_role_menu WHERE role_id=5 ORDER BY tenant_id,menu_id;') === employeeGrants);
  }
}
