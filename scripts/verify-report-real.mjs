import assert from 'node:assert/strict';
import { ownedGatewayRedis } from './owned-gateway-redis.mjs';

export async function verifyReport(context) {
  const { admin, api, successful, session, database, check, caseTag, state, evidence } = context;
  const root = '/auth/system/report';
  const literal = value => `CONVERT(UNHEX('${Buffer.from(String(value)).toString('hex')}') USING utf8mb4)`;
  const scalarId = statement => { const id = database(statement); assert.match(id, /^[1-9]\d*$/); return id; };
  const readJson = statement => JSON.parse(database(statement));
  const decimal = value => {
    assert.match(value, /^-?\d+(?:\.\d+)?$/);
    const [whole, fraction = ''] = value.split('.');
    const normalizedWhole = BigInt(whole).toString();
    const normalizedFraction = fraction.replace(/0+$/, '');
    const sign = value.startsWith('-') && normalizedWhole === '0' && normalizedFraction ? '-' : '';
    return `${sign}${normalizedWhole}${normalizedFraction ? `.${normalizedFraction}` : ''}`;
  };
  const roleIds = [];
  const users = [];
  const cleanups = [];
  const pages = [];
  const createdCharts = [];
  const createdDashboards = [];
  let failure;
  const grantSql = "SELECT CONCAT(tenant_id,':',role_id,':',menu_id) FROM sys_role_menu ORDER BY tenant_id,role_id,menu_id;";
  const grantsBefore = database(grantSql);
  const employeeSql = 'SELECT tenant_id,menu_id FROM sys_role_menu WHERE role_id=5 ORDER BY tenant_id,menu_id;';
  const employeeBefore = database(employeeSql);
  const basicPermissions = ['system:auth:info', 'system:auth:router', 'system:report:dataset:list', 'system:report:chart:list', 'system:report:chart:save', 'system:report:chart:remove',
    'system:report:dashboard:list', 'system:report:dashboard:save', 'system:report:dashboard:remove', 'system:report:share'];
  const dataPermissions = ['workflow-instance', 'workflow-task', 'crm-funnel', 'crm-aging', 'hr-attendance', 'hr-leave', 'oa-expense', 'oa-budget', 'oa-asset'].map(code => `system:report:data:${code}`);
  const sourcePermissions = ['workflow:process:view', 'workflow:task:todo', 'workflow:task:done', 'crm:opportunity:list', 'crm:receivable:list', 'hr:attendance:list', 'hr:leave:mine', 'oa:expense:list', 'oa:budget:list', 'oa:asset:list'];
  const createPerson = (suffix, { tenantId = 100000, omit = [], department = 100, dsType = 4 } = {}) => {
    const permissions = [...basicPermissions, ...dataPermissions, ...sourcePermissions].filter(permission => !omit.includes(permission));
    const name = `h5r_${suffix}_${caseTag}`;
    const roleId = scalarId(`INSERT INTO sys_role (tenant_id,role_name,role_key,role_sort,data_scope,ds_type,status,deleted)
      VALUES (${tenantId},${literal(name)},${literal(name)},999,'2',${dsType},'0',0); SELECT LAST_INSERT_ID();`);
    roleIds.push(roleId);
    const registered = database(`SELECT CONCAT(perms,'=',MIN(menu_id)) FROM sys_menu WHERE status='0' AND perms IN (${permissions.map(literal).join(',')}) GROUP BY perms ORDER BY perms;`).split(/\r?\n/).map(row => row.split('='));
    assert.deepEqual(registered.map(entry => entry[0]), [...permissions].sort(), 'Report fixtures grant exactly the requested existing permissions');
    const menuIds = registered.map(entry => { assert.match(entry[1], /^[1-9]\d*$/); return entry[1]; });
    menuIds.push('2');
    database(`INSERT INTO sys_role_menu (tenant_id,role_id,menu_id) SELECT ${tenantId},${roleId},menu_id FROM sys_menu WHERE menu_id IN (${menuIds.join(',')});`);
    const source = tenantId === 100000 ? 'g_holiday_employee' : 'g_import_tenant';
    const userId = scalarId(`INSERT INTO sys_user (tenant_id,dept_id,user_name,nick_name,password,status,deleted,pwd_reset_required,create_by,create_time)
      SELECT tenant_id,${department},${literal(name)},${literal(name)},password,'0',0,'0','report-fixture',NOW()
      FROM sys_user WHERE tenant_id=${tenantId} AND user_name=${literal(source)}; SELECT LAST_INSERT_ID();`);
    const person = { username: name, userId, roleId, menuIds, tenantId, department, source }; users.push(person);
    database(`INSERT INTO sys_user_role (tenant_id,user_id,role_id) VALUES (${tenantId},${userId},${roleId});`);
    return person;
  };
  const login = async person => { const actor = await session(person.username, person.source); pages.push(actor); return actor; };
  const group = (field, value) => ({ junction: 'AND', conditions: [{ field, operator: 'EQ', values: [String(value)] }], groups: [] });
  const query = (dimensions, measures, filters = null) => ({ dimensions, measures: measures.map(value => { const [field, aggregate] = value.split(':'); return { field, aggregate }; }), filters, sorts: [], limitRows: 500, startDate: null, endDate: null });
  const queries = {
    WF_INSTANCE: query([], ['INSTANCE_COUNT:COUNT', 'DURATION_SECONDS:AVG']),
    WF_TASK: query([], ['TODO_COUNT:COUNT', 'HANDLED_COUNT:COUNT']),
    CRM_FUNNEL: query([], ['OPPORTUNITY_COUNT:COUNT', 'EXPECTED_AMOUNT:SUM', 'WEIGHTED_AMOUNT:SUM']),
    CRM_AGING: query([], ['PLANNED_AMOUNT:SUM', 'RECEIVED_AMOUNT:SUM', 'OUTSTANDING_AMOUNT:SUM']),
    HR_ATTENDANCE: query([], ['RECORD_COUNT:COUNT', 'LATE_MINUTES:SUM']),
    HR_LEAVE: query(['UNIT'], ['TOTAL_QUOTA:SUM', 'AVAILABLE_QUOTA:SUM']),
    OA_EXPENSE: query([], ['CLAIM_COUNT:COUNT', 'CLAIM_AMOUNT:SUM', 'APPROVED_AMOUNT:SUM', 'PAID_AMOUNT:SUM']),
    OA_BUDGET: query([], ['BUDGET_AMOUNT:SUM', 'RESERVED_AMOUNT:SUM', 'ACTUAL_AMOUNT:SUM', 'AVAILABLE_AMOUNT:SUM']),
    OA_ASSET: query([], ['ASSET_COUNT:COUNT', 'PURCHASE_AMOUNT:SUM', 'DEPRECIATION_AMOUNT:SUM', 'NET_AMOUNT:SUM']),
  };
  const run = (actor, code, input = queries[code]) => api(actor, `${root}/dataset/${code}/query`, { method: 'POST', body: input });
  const denied = (response, label, statuses = [403]) => check(`${label} HTTP=${response.status} code=${response.body?.code}`, statuses.includes(response.status) && response.body?.code !== 200 && response.body?.data == null);
  const seed = (person, amount, undatedAmount) => {
    const marker = `H5R_${caseTag}_${person.userId}`;
    const common = `${person.tenantId},${person.department},${person.userId}`;
    const customerId = scalarId(`INSERT INTO crm_customer (tenant_id,dept_id,owner_id,customer_code,customer_name,remark,status)
      VALUES (${common},${literal(marker)},${literal(marker)},${literal(`private-${caseTag}`)},'ACTIVE'); SELECT LAST_INSERT_ID();`);
    cleanups.push(() => database(`DELETE FROM crm_customer WHERE tenant_id=${person.tenantId} AND customer_id=${customerId};`));
    const opportunityId = scalarId(`INSERT INTO crm_opportunity (tenant_id,dept_id,owner_id,customer_id,opportunity_name,stage,expected_amount,win_rate,weighted_amount)
      VALUES (${common},${customerId},${literal(marker)},'LEAD',${amount},100,${amount}); SELECT LAST_INSERT_ID();`);
    cleanups.push(() => database(`DELETE FROM crm_opportunity WHERE tenant_id=${person.tenantId} AND opportunity_id=${opportunityId};`));
    const receivableId = scalarId(`INSERT INTO crm_receivable (tenant_id,customer_id,receivable_no,receivable_name,due_date,planned_amount,received_amount,outstanding_amount,owner_id)
      VALUES (${person.tenantId},${customerId},${literal(marker)},${literal(marker)},DATE_SUB(CURDATE(),INTERVAL 10 DAY),${amount},30.03,${amount}-30.03,${person.userId}); SELECT LAST_INSERT_ID();`);
    cleanups.push(() => database(`DELETE FROM crm_receivable WHERE tenant_id=${person.tenantId} AND receivable_id=${receivableId};`));
    const employeeId = scalarId(`INSERT INTO hr_employee (tenant_id,dept_id,user_id,employee_no,name,gender) VALUES (${common},${literal(marker)},${literal(marker)},'UNKNOWN'); SELECT LAST_INSERT_ID();`);
    cleanups.push(() => database(`DELETE FROM hr_employee WHERE tenant_id=${person.tenantId} AND id=${employeeId};`));
    const attendanceId = scalarId(`INSERT INTO hr_attendance_record (tenant_id,employee_id,attendance_date,status,late_minutes,early_exit_minutes,overtime_minutes)
      VALUES (${person.tenantId},${employeeId},CURDATE(),'NORMAL',5,3,20); SELECT LAST_INSERT_ID();`);
    cleanups.push(() => database(`DELETE FROM hr_attendance_record WHERE tenant_id=${person.tenantId} AND id=${attendanceId};`));
    const leaveTypeId = scalarId(`INSERT INTO hr_leave_type (tenant_id,leave_code,leave_name,unit) VALUES (${person.tenantId},${literal(marker)},'报表隔离假期','DAY'); SELECT LAST_INSERT_ID();`);
    cleanups.push(() => database(`DELETE FROM hr_leave_type WHERE tenant_id=${person.tenantId} AND id=${leaveTypeId};`));
    const ledgerId = scalarId(`INSERT INTO hr_leave_ledger (tenant_id,employee_id,leave_type_id,quantity_unit,transaction_type,leave_days,create_time)
      VALUES (${person.tenantId},${employeeId},${leaveTypeId},'DAY','ALLOCATION',10,DATE_SUB(NOW(),INTERVAL 180 DAY)); SELECT LAST_INSERT_ID();`);
    cleanups.push(() => database(`DELETE FROM hr_leave_ledger WHERE tenant_id=${person.tenantId} AND ledger_id=${ledgerId};`));
    const budgetId = scalarId(`INSERT INTO oa_budget_plan (tenant_id,dept_id,owner_id,budget_no,budget_name,fiscal_year,target_type,target_id,total_amount)
      VALUES (${common},${literal(marker)},${literal(marker)},2026,'DEPT',${person.department},9999); SELECT LAST_INSERT_ID();`);
    cleanups.push(() => database(`DELETE FROM oa_budget_plan WHERE tenant_id=${person.tenantId} AND budget_id=${budgetId};`));
    const lineId = scalarId(`INSERT INTO oa_budget_line (tenant_id,budget_id,subject_code,subject_name,amount,reserved_amount,actual_amount,available_amount)
      VALUES (${person.tenantId},${budgetId},${literal(marker)},'报表隔离科目',100,20,30,50); SELECT LAST_INSERT_ID();`);
    cleanups.push(() => database(`DELETE FROM oa_budget_line WHERE tenant_id=${person.tenantId} AND line_id=${lineId};`));
    const instance = `h5r_${caseTag}_${person.userId}`;
    database(`INSERT INTO wf_process_instance (tenant_id,instance_id,process_def_key,definition_id,business_key,title,start_user_id,dept_id,status,start_time,end_time)
      VALUES (${person.tenantId},${literal(instance)},'report-fixture',NULL,${literal(instance)},'报表隔离已结束流程',${person.userId},${person.department},'PASSED',DATE_SUB(NOW(),INTERVAL 120 SECOND),NOW());`);
    cleanups.push(() => database(`DELETE FROM wf_process_instance WHERE tenant_id=${person.tenantId} AND instance_id=${literal(instance)};`));
    database(`INSERT INTO wf_task (tenant_id,task_id,instance_id,node_key,node_name,assignee,status,create_time)
      VALUES (${person.tenantId},${literal(instance)},${literal(instance)},'fixture','报表隔离任务',${person.userId},'TODO',NOW());`);
    cleanups.push(() => database(`DELETE FROM wf_task WHERE tenant_id=${person.tenantId} AND task_id=${literal(instance)};`));
    const expenseId = scalarId(`INSERT INTO biz_expense_claim (tenant_id,user_id,dept_id,claim_no,category,total_amount,status)
      VALUES (${person.tenantId},${person.userId},${person.department},${literal(`${marker}_dated`)},'OFFICE',${amount},'PAID'); SELECT LAST_INSERT_ID();`);
    cleanups.push(() => database(`DELETE FROM biz_expense_claim WHERE tenant_id=${person.tenantId} AND id=${expenseId};`));
    database(`INSERT INTO biz_expense_item (tenant_id,claim_id,expense_type,amount,expense_date) VALUES (${person.tenantId},${expenseId},'OFFICE',${amount},CURRENT_DATE);`);
    cleanups.push(() => database(`DELETE FROM biz_expense_item WHERE tenant_id=${person.tenantId} AND claim_id=${expenseId};`));
    const undatedExpenseId = scalarId(`INSERT INTO biz_expense_claim (tenant_id,user_id,dept_id,claim_no,category,total_amount,status,create_time)
      VALUES (${person.tenantId},${person.userId},${person.department},${literal(`${marker}_undated`)},'OFFICE',${undatedAmount},'DRAFT',DATE_SUB(NOW(),INTERVAL 400 DAY)); SELECT LAST_INSERT_ID();`);
    cleanups.push(() => database(`DELETE FROM biz_expense_claim WHERE tenant_id=${person.tenantId} AND id=${undatedExpenseId};`));
    cleanups.push(() => database(`DELETE FROM biz_expense_item WHERE tenant_id=${person.tenantId} AND claim_id=${undatedExpenseId};`));
    return { customerId, opportunityId, employeeId, instance, marker, expenseId, undatedExpenseId, undatedAmount };
  };
  const chartInput = name => ({ name, type: 'BAR', datasetCode: 'CRM_FUNNEL', query: query(['STAGE'], ['EXPECTED_AMOUNT:SUM']), style: { palette: 'PRIMARY', showLegend: true, showValues: false } });
  const getChart = async (actor, id) => successful(await api(actor, `${root}/chart/${id}`), '读取真实图表定义');
  const getDashboard = async (actor, id) => successful(await api(actor, `${root}/dashboard/${id}`), '读取真实仪表盘定义');
  const share = async (actor, kind, id, scope) => {
    const definition = kind === 'CHART' ? await getChart(actor, id) : await getDashboard(actor, id);
    successful(await api(actor, `${root}/share`, { method: 'POST', body: { kind, id: String(id), scope, version: definition.version } }), '调整真实共享范围');
  };
  const createChart = async (actor, input) => { const id = String(successful(await api(actor, `${root}/chart`, { method: 'POST', body: input }), '真实创建图表')); createdCharts.push(id); return id; };
  const createDashboard = async (actor, name, chartId) => {
    const input = { name, remark: '', items: [{ chartId: String(chartId), gridX: 0, gridY: 0, gridW: 6, gridH: 10 }] };
    const id = String(successful(await api(actor, `${root}/dashboard`, { method: 'POST', body: input }), '真实创建仪表盘')); createdDashboards.push(id); return id;
  };
  const verifyEmployeePermissions = async (actor, phase) => {
    const expected = new Set(database("SELECT DISTINCT menu.perms FROM sys_role_menu binding JOIN sys_menu menu ON menu.menu_id=binding.menu_id WHERE binding.tenant_id=100000 AND binding.role_id=5 AND menu.status='0' AND menu.perms IS NOT NULL AND menu.perms<>'' ORDER BY menu.perms;").split(/\r?\n/));
    const info = successful(await api(actor, '/auth/info'), '读取正式员工当前会话权限');
    assert.ok(Array.isArray(info.permissions));
    const actual = new Set(info.permissions);
    const missing = [...expected].filter(permission => !actual.has(permission));
    const unexpected = [...actual].filter(permission => !expected.has(permission));
    console.log(`REPORT_EMPLOYEE_SESSION: phase=${phase}; role_id=5; expected=${expected.size}; actual=${actual.size}; missing=${missing.length}; unexpected=${unexpected.length}; grant_writes=0`);
    assert.deepEqual({ missing, unexpected }, { missing: [], unexpected: [] }, '正式EMPLOYEE会话权限与当前批准数据库授权逐码一致');
    check(`${phase}正式EMPLOYEE会话权限与数据库授权逐码一致`, !actual.has('*:*:*'));
  };
  try {
    assert.equal(database("SELECT GROUP_CONCAT(binding.role_id ORDER BY binding.role_id) FROM sys_user account JOIN sys_user_role binding ON binding.tenant_id=account.tenant_id AND binding.user_id=account.user_id WHERE account.tenant_id=100000 AND account.user_name='g_holiday_employee' AND account.deleted=0;"), '5', '正式员工验收账号只能绑定EMPLOYEE角色');
    const employeeActor = await session('g_holiday_employee'); pages.push(employeeActor);
    await verifyEmployeePermissions(employeeActor, 'before');
    const employeeRouters = successful(await api(employeeActor, '/auth/getRouters'), '读取正式员工缓存路由');
    const flatten = menus => menus.flatMap(menu => [menu, ...flatten(menu.children ?? [])]);
    const employeeMenuIds = flatten(employeeRouters).map(menu => String(menu.menuId));
    check('正式EMPLOYEE缓存菜单同时包含本人图表和仪表盘', ['1978', '1981'].every(id => employeeMenuIds.includes(id)));
    denied(await run(employeeActor, 'CRM_FUNNEL'), '正式EMPLOYEE不能直接查询销售统计');
    denied(await run(employeeActor, 'HR_ATTENDANCE'), '正式EMPLOYEE不能直接查询全员考勤统计');
    const owner = createPerson('owner'); const peer = createPerson('peer'); const outside = createPerson('outside', { department: 101 });
    const foreign = createPerson('foreign', { tenantId: 100001, department: 990000101 });
    const ownRecords = seed(owner, '100.10', '50.50'); seed(peer, '200.20', '60.60'); seed(foreign, '900000.90', '700000.70');
    const fillExpenseDate = async filled => {
      const claim = successful(await api(admin, `/oa/expense/claim/${ownRecords.undatedExpenseId}`), '读取本次缺日期草稿');
      const date = database('SELECT CURRENT_DATE;'); assert.match(date, /^\d{4}-\d{2}-\d{2}$/);
      const items = filled ? [{ expenseType: 'OFFICE', amount: ownRecords.undatedAmount, expenseDate: date }] : [];
      successful(await api(admin, '/oa/expense/claim', { method: 'PUT', body: { ...claim, items } }), filled ? '使用真实报销编辑接口补齐费用日期' : '恢复本次缺日期草稿用于下一组检查');
    };
    const categoryId = scalarId(`INSERT INTO oa_asset_category (tenant_id,category_code,category_name) VALUES (100000,${literal(`H5R_${caseTag}`)},'报表隔离资产分类'); SELECT LAST_INSERT_ID();`);
    cleanups.push(() => database(`DELETE FROM oa_asset_category WHERE tenant_id=100000 AND category_id=${categoryId};`));
    for (const tenantId of [100000, 100001]) {
      const assetId = scalarId(`INSERT INTO oa_asset (tenant_id,asset_code,name,category_id,purchase_amount,opening_accumulated_depreciation,accumulated_depreciation,net_book_value)
        VALUES (${tenantId},${literal(`H5R_${caseTag}_${tenantId}`)},'报表隔离资产',${categoryId},1000,50,200,800); SELECT LAST_INSERT_ID();`);
      cleanups.push(() => database(`DELETE FROM oa_asset WHERE tenant_id=${tenantId} AND asset_id=${assetId};`));
    }
    queries.OA_ASSET.filters = group('CATEGORY', categoryId);
    const actor = await login(owner); const peerActor = await login(peer); const outsider = await login(outside); const foreignActor = await login(foreign);
    const catalogResponse = await api(actor, `${root}/dataset/list`); const catalog = successful(catalogResponse, '真实固定来源目录');
    check('固定九数据集完整注册，费用来源按已批准日期口径开放', catalog.length === 9 && catalog.every(dataset => dataset.availability === 'AVAILABLE'));
    evidence.datasets = true;
    check('定义及数据响应明确禁止缓存', catalogResponse.cacheControl === 'no-store');
    const expected = { WF_INSTANCE: ['1', '120.0000'], WF_TASK: ['1', '0'], CRM_FUNNEL: ['1', '100.10', '100.10'], CRM_AGING: ['100.10', '30.03', '70.07'],
      HR_ATTENDANCE: ['1', '5'], HR_LEAVE: ['10.00', '10.00'], OA_EXPENSE: ['1', '100.10', '100.10', '100.10'], OA_BUDGET: ['100.00', '20.00', '30.00', '50.00'], OA_ASSET: ['1', '1000.00', '200.00', '800.00'] };
    for (const [code, values] of Object.entries(expected)) {
      const response = await run(actor, code); const result = successful(response, `真实查询${code}`);
      assert.equal(result.rows.length, 1, code);
      for (const [index, value] of values.entries()) {
        const actual = result.rows[0][`measure${index + 1}`];
        assert.equal(typeof actual, 'string', `${code} decimal JSON must remain text`);
        assert.equal(decimal(actual), decimal(value), `${code} exact source reconciliation`);
      }
      check(`${code}真实源数据与本人范围对账通过`, response.cacheControl === 'no-store' && !JSON.stringify(result).includes(`private-${caseTag}`)
        && !JSON.stringify(result).includes('sourceRows') && !JSON.stringify(result).includes('integrityError'));
      console.log(`REPORT_HTTP_SOURCE ${code} ${JSON.stringify(result.rows)}`);
    }
    evidence.sourceScopes = true; evidence.noStore = true; evidence.precision = true;
    for (const [reader, missingAmount] of [[actor, '50.50'], [peerActor, '60.60'], [foreignActor, '700000.70']]) {
      const result = successful(await run(reader, 'OA_EXPENSE'), '真实查询缺费用日期分类');
      check(`缺费用日期仅包含当前查看者的${missingAmount}`, result.missingDates.claimCount === '1' && decimal(result.missingDates.claimAmount) === decimal(missingAmount)
        && decimal(result.missingDates.approvedAmount) === '0' && decimal(result.missingDates.paidAmount) === '0');
    }
    await fillExpenseDate(true);
    const filledExpense = successful(await run(actor, 'OA_EXPENSE'), '补齐后真实日期统计');
    check('真实报销补齐日期后只计入一次，缺日期金额归零', filledExpense.missingDates.claimCount === '0'
      && decimal(filledExpense.rows[0].measure1) === '2' && decimal(filledExpense.rows[0].measure2) === '150.6' && decimal(filledExpense.rows[0].measure3) === '100.1');
    await fillExpenseDate(false); evidence.expenseDates = true;
    const peerFunnel = successful(await run(peerActor, 'CRM_FUNNEL'), '其他查看者重新按本人客户查询');
    check('相同统计定义由不同查看者查询，金额分别为100.10和200.20', peerFunnel.rows[0].measure2 === '200.20');
    const foreignFunnel = successful(await run(foreignActor, 'CRM_FUNNEL'), '异租户独立统计');
    check('异租户统计仅有自身900000.90金额', foreignFunnel.rows.length === 1 && foreignFunnel.rows[0].measure2 === '900000.90');
    const spoofed = await api(actor, `${root}/dataset/CRM_FUNNEL/query`, { method: 'POST', headers: { 'X-Tenant-Id': '100001', 'X-User-Id': foreign.userId }, body: queries.CRM_FUNNEL });
    check('伪造租户或人员请求头不能扩大统计范围', [400, 401, 403].includes(spoofed.status) || spoofed.status === 200 && spoofed.body?.data?.rows?.[0]?.measure2 === '100.10'); evidence.tenants = true;
    const noSource = createPerson('no_source', { omit: ['crm:opportunity:list'] }); const noDataset = createPerson('no_dataset', { omit: ['system:report:data:crm-funnel'] });
    const noSourceActor = await login(noSource); const noDatasetActor = await login(noDataset);
    denied(await run(noSourceActor, 'CRM_FUNNEL'), '有报表权限但无源业务权限仍拒绝'); denied(await run(noDatasetActor, 'CRM_FUNNEL'), '有源业务权限但无独立数据集权限仍拒绝');
    for (const reader of [noSourceActor, noDatasetActor]) check('来源目录隐藏缺少双重授权的统计来源', !successful(await api(reader, `${root}/dataset/list`), '按权限展示来源').some(dataset => dataset.definition.code === 'CRM_FUNNEL'));
    evidence.sourcePermissions = true;
    for (const [code, input, label] of [
      ['CRM_FUNNEL', { ...queries.CRM_FUNNEL, mapperMethod: 'Danger.execute' }, '拒绝客户端Mapper调用'],
      ['CRM_FUNNEL', { ...queries.CRM_FUNNEL, dimensions: ['owner.userId'] }, '拒绝字段路径'],
      ['CRM_FUNNEL', { ...queries.CRM_FUNNEL, measures: [{ field: 'EXPECTED_AMOUNT', aggregate: 'COUNT' }] }, '拒绝未批准聚合'],
      ['CRM_FUNNEL', { ...queries.CRM_FUNNEL, sorts: [{ column: 'measure1 DESC; DROP TABLE sys_user', direction: 'ASC' }] }, '拒绝排序注入'],
      ['CRM_FUNNEL', { ...queries.CRM_FUNNEL, limitRows: 2001 }, '拒绝超限行数'],
      ['CRM_FUNNEL', { ...queries.CRM_FUNNEL, limitRows: '20' }, '拒绝字符串伪装整数'],
      ['HR_LEAVE', { ...queries.HR_LEAVE, dimensions: [] }, '拒绝混加天与小时'],
      ['HR_ATTENDANCE', { ...queries.HR_ATTENDANCE, startDate: '2025-01-01', endDate: '2026-01-02' }, '拒绝超366天日期范围'],
    ]) denied(await run(actor, code, input), label, [400]);
    denied(await run(actor, 'UNREGISTERED', queries.CRM_FUNNEL), '拒绝未注册数据集路径', [404]);
    const token = await actor.evaluate(async () => (await import('/src/utils/authStorage.ts')).getAuthToken());
    for (const [module, code] of [['crm', 'CRM_FUNNEL'], ['hr', 'HR_ATTENDANCE'], ['oa', 'OA_BUDGET'], ['workflow', 'WF_INSTANCE']]) {
      const service = state.services.find(candidate => candidate.name === module);
      for (const extra of [{}, { 'X-Inner-Call': 'true', 'X-From-Service': 'cloudflow-service-oa' }]) {
        const response = await fetch(`http://127.0.0.1:${service.port}/inner/${module}/report/${code}/query`, {
          method: 'POST', headers: { Authorization: token.startsWith('Bearer ') ? token : `Bearer ${token}`, 'Content-Type': 'application/json', ...extra }, body: JSON.stringify(queries[code]) });
        denied({ status: response.status, body: await response.json() }, `${module}内部查询拒绝未签名或错误来源调用`, [401, 403]);
      }
    }
    evidence.innerBoundaries = true;
    const chart = await createChart(actor, chartInput(`报表-${caseTag}`)); const dashboard = await createDashboard(actor, `仪表盘-${caseTag}`, chart);
    denied(await api(employeeActor, `${root}/chart/${chart}`), '正式EMPLOYEE不能读取他人私有图表', [404]);
    const employeeBoundary = { ...chartInput(`员工边界-${caseTag}`), datasetCode: 'WF_INSTANCE', query: query(['STATUS'], ['INSTANCE_COUNT:COUNT']) };
    const employeeBoundaryChart = await createChart(actor, employeeBoundary);
    successful(await run(employeeActor, 'WF_INSTANCE'), '正式员工持有测试定义的源查询权限');
    denied(await api(employeeActor, `${root}/chart`, { method: 'PUT', body: { ...employeeBoundary, chartId: employeeBoundaryChart, version: 0 } }), '正式EMPLOYEE本人写权限不能修改他人图表', [404]);
    denied(await api(employeeActor, `${root}/dashboard/${dashboard}?version=0`, { method: 'DELETE' }), '正式EMPLOYEE本人写权限不能删除他人仪表盘', [404]);
    denied(await api(peerActor, `${root}/chart/${chart}`), '其他员工不能读取私有图表', [404]);
    denied(await api(admin, `${root}/chart/${chart}`), '租户管理员不能越过私有定义边界', [404]);
    const record = await getChart(actor, chart);
    denied(await api(actor, `${root}/chart/${chart}?version=${record.version}`, { method: 'DELETE' }), '被仪表盘引用的图表拒绝删除', [409]);
    await share(actor, 'DASHBOARD', dashboard, 'TENANT');
    check('共享仪表盘不自动共享私有图表', (await getDashboard(peerActor, dashboard)).items[0].availability === 'NO_DEFINITION_ACCESS');
    await share(actor, 'CHART', chart, 'DEPT');
    check('同部门共享仅可读定义', !(await getChart(peerActor, chart)).editable);
    denied(await api(outsider, `${root}/chart/${chart}`), '部门共享排除不同部门', [404]);
    denied(await api(foreignActor, `${root}/chart/${chart}`), '定义共享排除其他租户', [404]);
    denied(await api(peerActor, `${root}/chart`, { method: 'PUT', body: { ...chartInput('越权改名'), chartId: chart, version: 1 } }), '共享定义不授予原定义写权限', [404]);
    denied(await api(peerActor, `${root}/share`, { method: 'POST', body: { kind: 'CHART', id: chart, scope: 'TENANT', version: 1 } }), '共享查看者不能再共享他人原定义', [404]);
    await share(actor, 'CHART', chart, 'TENANT');
    const concurrentDefinition = await getChart(actor, chart);
    const edits = await Promise.all(['甲', '乙'].map(suffix => api(actor, `${root}/chart`, { method: 'PUT', body: { ...chartInput(`并发${suffix}-${caseTag}`), chartId: chart, version: concurrentDefinition.version } })));
    check('并发修改同版本仅一笔成功，另一笔409', edits.filter(response => response.status === 200 && response.body?.code === 200).length === 1 && edits.filter(response => response.status === 409).length === 1);
    const currentDashboard = await getDashboard(actor, dashboard);
    const dashboardEdits = await Promise.all(['甲', '乙'].map(suffix => api(actor, `${root}/dashboard`, { method: 'PUT', body: { dashboardId: dashboard, version: currentDashboard.version,
      name: `并发仪表盘${suffix}-${caseTag}`, remark: suffix, items: [{ chartId: chart, gridX: 0, gridY: 0, gridW: 6, gridH: 10 }] } })));
    check('仪表盘并发保存布局也仅一笔成功', dashboardEdits.filter(response => response.status === 200).length === 1 && dashboardEdits.filter(response => response.status === 409).length === 1); evidence.concurrency = true;
    const peerDashboard = await createDashboard(peerActor, `共享嵌入-${caseTag}`, chart);
    await share(actor, 'CHART', chart, 'PRIVATE');
    denied(await api(peerActor, `${root}/chart/${chart}`), '共享撤回后旧图表地址立即拒绝', [404]);
    check('共享撤回后本人仪表盘内嵌图表独立显示无权', (await getDashboard(peerActor, peerDashboard)).items[0].availability === 'NO_DEFINITION_ACCESS');
    await share(actor, 'DASHBOARD', dashboard, 'PRIVATE');
    denied(await api(peerActor, `${root}/dashboard/${dashboard}`), '仪表盘撤回后旧地址立即拒绝', [404]);
    const readonlyPerson = createPerson('readonly', { omit: ['system:report:chart:save', 'system:report:chart:remove', 'system:report:dashboard:save', 'system:report:dashboard:remove', 'system:report:share'] });
    const readonlyActor = await login(readonlyPerson);
    denied(await api(readonlyActor, `${root}/chart`, { method: 'POST', body: chartInput('只读写入') }), '只读角色不能创建图表');
    denied(await api(readonlyActor, `${root}/dashboard`, { method: 'POST', body: { name: '只读写入', remark: '', items: [] } }), '只读角色不能创建仪表盘');
    const metadata = readJson("SELECT JSON_OBJECT('datasetId',dataset_id,'mapper',mapper_method) FROM sys_report_dataset WHERE tenant_id=100000 AND dataset_code='CRM_FUNNEL';");
    try {
      database(`UPDATE sys_report_dataset SET mapper_method='tampered.Mapper.execute' WHERE tenant_id=100000 AND dataset_id=${metadata.datasetId};`);
      denied(await run(actor, 'CRM_FUNNEL'), '数据库登记被篡改也拒绝执行', [409]);
      check('单图坏配置不导致整个仪表盘查询失败', (await getDashboard(actor, dashboard)).items[0].availability === 'INVALID_CONFIGURATION');
    } finally { database(`UPDATE sys_report_dataset SET mapper_method=${literal(metadata.mapper)} WHERE tenant_id=100000 AND dataset_id=${metadata.datasetId};`); }
    evidence.definitions = true;
    const ratePerson = createPerson('rate'); const rateActor = await login(ratePerson);
    const redis = await ownedGatewayRedis(state);
    const rateKey = `cloudflow:rate_limit:report-query:tenant:${ratePerson.tenantId}:user:${ratePerson.userId}`;
    check('独立限流账号没有历史查询计数', redis('EXISTS', rateKey) === '0');
    const rateResponses = await Promise.all(Array.from({ length: 31 }, (unused, index) => run(rateActor, index % 2 ? 'CRM_FUNNEL' : 'WF_INSTANCE')));
    const passed = rateResponses.filter(response => response.status === 200 && response.body?.code === 200).length;
    const limited = rateResponses.filter(response => response.status === 429).length;
    check('跨数据集共享每人每分钟30次额度，第31次被拒绝', passed === 30 && limited === 1);
    const ttl = Number(redis('TTL', rateKey)); check('真实Redis限流窗口不超过60秒', Number.isInteger(ttl) && ttl >= 1 && ttl <= 60);
    console.log(`REPORT_HTTP_RATE: accepted=${passed}; limited=${limited}; shared_across_datasets=true; ttl_seconds=${ttl}; counters_reset=false`); evidence.rateLimits = true;
    const beforeRevoke = await run(peerActor, 'CRM_FUNNEL'); successful(beforeRevoke, '撤回授权前可查询');
    const peerRole = successful(await api(admin, `/auth/system/role/${peer.roleId}`), '读取本次专用角色');
    const sourceMenu = database(`SELECT menu_id FROM sys_menu WHERE perms='crm:opportunity:list';`);
    successful(await api(admin, '/auth/system/role', { method: 'PUT', body: { ...peerRole, menuIds: peer.menuIds.filter(id => id !== sourceMenu) } }), '真实撤回本次角色源权限');
    denied(await run(peerActor, 'CRM_FUNNEL'), '正式撤权立即使旧会话失效', [401, 403]);
    const reloggedPeer = await login(peer); denied(await run(reloggedPeer, 'CRM_FUNNEL'), '重新登录后仍不能绕过撤回的源权限'); evidence.revocation = true;
    if (!context.httpOnly) {
      const remainingWindow = Number(redis('TTL', `cloudflow:rate_limit:report-query:tenant:${owner.tenantId}:user:${owner.userId}`));
      if (remainingWindow > 0) { console.log(`WAIT 保留报表查询额度，等待${remainingWindow + 1}秒后执行双端页面专项`); await new Promise(resolve => setTimeout(resolve, (remainingWindow + 1) * 1000)); }
      const { verifyReportRealUi } = await import('./verify-report-real-ui.mjs');
      await verifyReportRealUi({ ...context, actor, readonlyActor, owner, ownRecords, chart, dashboard, share, fillExpenseDate,
        rememberChart: id => createdCharts.push(id), rememberDashboard: id => createdDashboards.push(id) });
    }
    await verifyEmployeePermissions(employeeActor, 'after'); evidence.employeeCache = true;
    console.log('REPORT_HTTP_BOUNDARIES: tenant_and_source_scopes=true; owner_only=true; sharing_revocation=true; stale_versions=409; internal_calls_guarded=true; decimal_json_strings=true; expense_missing_dates_separate=true');
  } catch (error) {
    failure = error;
    throw error;
  } finally {
    const cleanupErrors = [];
    const attempt = async action => { try { await action(); } catch (error) { cleanupErrors.push(error); } };
    for (const page of pages) await attempt(() => page.context().close());
    if (createdDashboards.length) {
      await attempt(() => database(`DELETE FROM sys_report_dashboard_item WHERE dashboard_id IN (${createdDashboards.join(',')});`));
      await attempt(() => database(`DELETE FROM sys_report_dashboard WHERE dashboard_id IN (${createdDashboards.join(',')});`));
    }
    if (createdCharts.length) await attempt(() => database(`DELETE FROM sys_report_chart WHERE chart_id IN (${createdCharts.join(',')});`));
    for (const cleanup of cleanups.reverse()) await attempt(cleanup);
    if (roleIds.length) {
      for (const table of ['sys_role_menu', 'sys_user_role', 'sys_role']) await attempt(() => database(`DELETE FROM ${table} WHERE role_id IN (${roleIds.join(',')});`));
    }
    for (const user of users) await attempt(() => database(`DELETE FROM sys_user WHERE tenant_id=${user.tenantId} AND user_id=${user.userId} AND user_name=${literal(user.username)};`));
    await attempt(() => check('测试后全部角色授权逐行恢复，EMPLOYEE写权限未扩大', database(grantSql) === grantsBefore && database(employeeSql) === employeeBefore));
    evidence.cleanup = cleanupErrors.length === 0;
    if (cleanupErrors.length) throw new AggregateError(failure ? [failure, ...cleanupErrors] : cleanupErrors, 'Report fixture cleanup failed');
  }
}
