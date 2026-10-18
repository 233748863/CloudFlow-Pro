import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';

export async function verifyBusinessSearch(context) {
  const { admin, api, successful, session, database, check, directory, caseTag, state, evidence } = context;
  const root = '/auth/system/search/business';
  const keyword = `检索${caseTag}`;
  const secret = `private${caseTag}`;
  const literal = value => `CONVERT(UNHEX('${Buffer.from(String(value)).toString('hex')}') USING utf8mb4)`;
  const pause = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
  const scalarId = statement => {
    const identifier = database(statement);
    assert.match(identifier, /^[1-9]\d*$/);
    return identifier;
  };
  const grantsSql = 'SELECT CONCAT(tenant_id,\':\',role_id,\':\',menu_id) FROM sys_role_menu ORDER BY tenant_id,role_id,menu_id;';
  const grantsBefore = database(grantsSql);
  const employeeBefore = database('SELECT menu_id FROM sys_role_menu WHERE tenant_id=100000 AND role_id=5 ORDER BY menu_id;');
  const roleIds = [];
  const permissions = ['system:auth:info', 'system:auth:router', 'system:search:business', 'system:lookup:read', 'system:message:mine:list',
    'workflow:task:count', 'oa:workplace:view', 'oa:schedule:list', 'workflow:process:mine', 'workflow:task:todo',
    'workflow:task:statistics', 'workflow:copy:list', 'oa:announcement:list', 'crm:customer:list', 'oa:contract:list', 'hr:employees:list',
    'hr:employees:view', 'workflow:process:view', 'crm:ticket:list', 'oa:asset:list'];
  const menuIds = database(`SELECT menu_id FROM sys_menu WHERE perms IN (${permissions.map(literal).join(',')}) ORDER BY menu_id;`).split(/\r?\n/);
  assert.equal(menuIds.length, 21);
  check('隔离只读角色补齐既有基础查询及本人消息读取，不授予标记已读权限',
    menuIds.includes('1336') && menuIds.includes('1762') && !menuIds.includes('1337'));
  check('隔离只读角色补齐手机工作台三项既有读取权限，不新增正式员工授权',
    ['100', '101', '1005'].every(menuId => menuIds.includes(menuId))
      && database('SELECT COUNT(*) FROM sys_role_menu WHERE tenant_id=100000 AND role_id=5 AND menu_id IN (100,101,1005);') === '3');
  check('隔离只读角色补齐工作台待办、统计及公告五项既有读取权限，不授予审批或发布权限',
    ['201', '301', '302', '303', '1009'].every(menuId => menuIds.includes(menuId))
      && database('SELECT COUNT(*) FROM sys_role_menu WHERE tenant_id=100000 AND role_id=5 AND menu_id IN (201,301,302,303,1009);') === '5');
  const directoryIds = database(`WITH RECURSIVE navigation AS (
      SELECT menu_id,parent_id,menu_type FROM sys_menu WHERE menu_id IN (${menuIds.join(',')})
      UNION DISTINCT SELECT parent.menu_id,parent.parent_id,parent.menu_type FROM sys_menu parent
      JOIN navigation child ON parent.menu_id=child.parent_id
    ) SELECT menu_id FROM navigation WHERE menu_type='M' ORDER BY menu_id;`).split(/\r?\n/);
  assert.equal(directoryIds.length, 10);
  check('隔离只读角色补齐十个无权限码目录，保留流程发起权限未授予',
    database(`SELECT COUNT(*) FROM sys_menu WHERE menu_id IN (${directoryIds.join(',')}) AND (menu_type<>'M' OR COALESCE(perms,'')<>'');`) === '0'
      && database(`SELECT COUNT(*) FROM sys_menu WHERE menu_id IN (${menuIds.join(',')}) AND perms='workflow:process:start';`) === '0');
  menuIds.push(...directoryIds);
  const createRole = (suffix, tenantId = 100000) => {
    const roleId = scalarId(`INSERT INTO sys_role (tenant_id,role_name,role_key,role_sort,data_scope,ds_type,status,deleted)
      VALUES (${tenantId},${literal(`h5s_${suffix}_${caseTag}`)},${literal(`h5s_${suffix}_${caseTag}`)},999,'2',4,'0',0); SELECT LAST_INSERT_ID();`);
    roleIds.push(roleId);
    database(`INSERT INTO sys_role_menu (tenant_id,role_id,menu_id) SELECT ${tenantId},${roleId},menu_id
      FROM sys_menu WHERE menu_id IN (${menuIds.join(',')});`);
    return roleId;
  };
  const createPerson = (suffix, roleId, tenantId = 100000) => {
    const username = `h5s_${suffix}_${caseTag}`;
    const source = tenantId === 100000 ? 'g_holiday_employee' : 'g_import_tenant';
    const userId = scalarId(`INSERT INTO sys_user (tenant_id,dept_id,user_name,nick_name,password,status,deleted,pwd_reset_required,create_by,create_time)
      SELECT tenant_id,dept_id,${literal(username)},${literal(username)},password,'0',0,'0','business-search-fixture',NOW()
      FROM sys_user WHERE tenant_id=${tenantId} AND user_name=${literal(source)}; SELECT LAST_INSERT_ID();`);
    database(`INSERT INTO sys_user_role (tenant_id,user_id,role_id) VALUES (${tenantId},${userId},${roleId});`);
    return { username, userId, roleId, tenantId, deptId: tenantId === 100000 ? 100 : 990000101, source };
  };
  const routes = {
    CUSTOMER: identifier => `/office/crm/customer/${identifier}`,
    CONTRACT: identifier => `/office/contracts?searchId=${identifier}`,
    EMPLOYEE: identifier => `/hr/employees?searchId=${identifier}`,
    WORKFLOW_INSTANCE: identifier => `/workflow/search-instance/${identifier}`,
    TICKET: identifier => `/office/crm/tickets?searchId=${identifier}`,
    ASSET: identifier => `/admin/asset?searchId=${identifier}`,
  };
  const endpoints = {
    CUSTOMER: identifier => `/crm/customer/${identifier}/workspace`,
    CONTRACT: identifier => `/oa/contract/${identifier}`,
    EMPLOYEE: identifier => `/hr/employees/${identifier}`,
    WORKFLOW_INSTANCE: identifier => `/workflow/wf/instance/${identifier}`,
    TICKET: identifier => `/crm/ticket/${identifier}`,
    ASSET: identifier => `/oa/asset/${identifier}`,
  };
  const bundle = (person, suffix, employeeUserId = person.userId) => {
    const title = `${keyword}_${suffix}`;
    const code = `H5S_${caseTag}_${suffix}`;
    const common = `${person.tenantId},${person.deptId},${person.userId}`;
    const customerId = scalarId(`INSERT INTO crm_customer (tenant_id,dept_id,owner_id,customer_code,customer_name,remark,status)
      VALUES (${common},${literal(code)},${literal(title)},${literal(secret)},'ACTIVE'); SELECT LAST_INSERT_ID();`);
    const contractId = scalarId(`INSERT INTO oa_contract (tenant_id,dept_id,owner_id,contract_no,contract_name,counterparty_name,contract_type,status,remark)
      VALUES (${common},${literal(code)},${literal(title)},'隔离查询前置客户','SALES','DRAFT',${literal(secret)}); SELECT LAST_INSERT_ID();`);
    const assetId = scalarId(`INSERT INTO oa_asset (tenant_id,dept_id,owner_id,asset_code,name,remark,status)
      VALUES (${common},${literal(code)},${literal(title)},${literal(secret)},'IDLE'); SELECT LAST_INSERT_ID();`);
    const employeeId = scalarId(`INSERT INTO hr_employee (tenant_id,dept_id,user_id,employee_no,name,gender,email,employee_status,hire_date)
      VALUES (${person.tenantId},${person.deptId},${employeeUserId ?? 'NULL'},${literal(code)},${literal(title)},'UNKNOWN',
      ${literal(`${secret}@example.invalid`)},'REGULAR','2020-01-01'); SELECT LAST_INSERT_ID();`);
    const ticketId = scalarId(`INSERT INTO crm_service_ticket (tenant_id,customer_id,ticket_no,ticket_title,owner_id,description,status)
      VALUES (${person.tenantId},${customerId},${literal(code)},${literal(title)},${person.userId},${literal(secret)},'OPEN'); SELECT LAST_INSERT_ID();`);
    const instanceId = `h5s_${caseTag}_${suffix}`;
    database(`INSERT INTO wf_process_instance (instance_id,tenant_id,process_def_key,definition_id,business_key,title,start_user_id,start_user_name,
      status,start_time,end_time,variables,process_no,dept_id,create_by)
      VALUES (${literal(instanceId)},${person.tenantId},'biz_contract','wf_contract',${literal(`search_${caseTag}_${suffix}`)},${literal(title)},
      ${person.userId},${literal(person.username)},'COMPLETED',NOW(),NOW(),JSON_OBJECT('internalNote',${literal(secret)}),${literal(code)},${person.deptId},'business-search-fixture');`);
    const identifiers = { CUSTOMER: customerId, CONTRACT: contractId, EMPLOYEE: employeeId, WORKFLOW_INSTANCE: instanceId, TICKET: ticketId, ASSET: assetId };
    return Object.fromEntries(Object.entries(identifiers).map(([type, id]) => [type, { type, id, title, number: code, route: routes[type](id), endpoint: endpoints[type](id) }]));
  };
  const search = (actor, query = keyword, limit) => api(actor, `${root}?keyword=${encodeURIComponent(query)}${limit === undefined ? '' : `&limitPerType=${limit}`}`);
  const read = async (actor, query = keyword, limit) => successful(await search(actor, query, limit), '真实聚合搜索');
  const byType = response => Object.fromEntries(response.groups.map(group => [group.type, group]));
  const rejected = (result, label, statuses) => check(`${label} HTTP=${result.status} code=${result.body?.code}`,
    statuses.includes(result.status) && result.body?.code !== undefined && result.body.code !== 200);
  const statusCounts = results => results.reduce((counts, result) => {
    const status = `${result.status}/${result.body?.code}`;
    counts[status] = (counts[status] || 0) + 1;
    return counts;
  }, {});
  const detailRejected = async (result, label, assetEndpoint) => {
    const record = result.body?.data;
    const emptyObject = record != null && typeof record === 'object' && !Array.isArray(record)
      && Object.values(record).every(value => value == null);
    const noRecord = record == null || emptyObject;
    const legacyFailure = result.status === 200 && result.body?.code === 500
      && /不存在|无权|权限|无可读/.test(result.body?.msg || result.body?.message || '');
    const emptySuccess = result.status === 200 && result.body?.code === 200 && noRecord;
    let legacyAssetDenial = false;
    if (assetEndpoint && result.status === 500 && result.body?.code === 500 && noRecord) {
      assert.match(result.traceId || '', /^[a-f0-9]{32}$/);
      const handle = await fs.open(path.join(directory, 'oa/stdout.log'), 'r');
      try {
        const size = (await handle.stat()).size;
        const content = Buffer.alloc(Math.min(size, 512 * 1024));
        await handle.read(content, 0, content.length, size - content.length);
        legacyAssetDenial = content.toString('utf8').split(/\r?\n/).some(line => line.includes(`[traceId=${result.traceId}]`)
          && line.includes(`请求地址'${assetEndpoint.replace(/^\/oa/, '')}'`)
          && line.includes('java.lang.IllegalArgumentException: 记录不存在或无权访问'));
      } finally { await handle.close(); }
      console.log(`H5_SEARCH_EXISTING_ASSET_STATUS: http=500; permission_denial_trace_verified=${legacyAssetDenial}; response_record_absent=${noRecord}; existing_status_mapping_issue=true`);
    }
    check(`${label} HTTP=${result.status} code=${result.body?.code} no_record=${noRecord} all_null_fields=${emptyObject ? Object.keys(record).length : 0}`,
      (legacyFailure || emptySuccess || legacyAssetDenial || [400, 403, 404].includes(result.status) && result.body?.code !== 200) && noRecord);
  };
  const direct = async (actor, module, headers = {}, query = keyword) => {
    const token = await actor.evaluate(async () => (await import('/src/utils/authStorage.ts')).getAuthToken());
    assert.equal(typeof token, 'string', `真实登录令牌在内部边界检查前丢失，当前页面=${new URL(actor.url()).pathname}`);
    const service = state.services.find(candidate => candidate.name === module);
    const response = await fetch(`http://127.0.0.1:${service.port}/inner/${module}/search?keyword=${encodeURIComponent(query)}`,
      { headers: { Authorization: token.startsWith('Bearer ') ? token : `Bearer ${token}`, ...headers } });
    return { status: response.status, body: await response.json() };
  };
  try {
    const selfRole = createRole('self');
    const foreignRole = createRole('foreign', 100001);
    const revokedRole = createRole('revoke');
    const person = createPerson('own', selfRole);
    const peer = createPerson('peer', selfRole);
    const foreignPerson = createPerson('foreign', foreignRole, 100001);
    const employeePerson = createPerson('employee', 5);
    const revokePerson = createPerson('revoke', revokedRole);
    const outerLimitPerson = createPerson('outer', selfRole);
    const innerLimitPerson = createPerson('inner', selfRole);
    const own = bundle(person, 'own');
    const hidden = bundle(peer, 'peer');
    const foreignRecords = bundle(foreignPerson, 'foreign');
    const employeeRecords = bundle(employeePerson, 'employee');
    for (let index = 0; index < 11; index++) bundle(peer, `hidden${index}`, null);
    const actor = await session(person.username, person.source);
    if (process.argv.includes('--business-search-ui-only')) {
      console.log('H5_SEARCH_UI_ONLY: full_http_acceptance=false; responses=real; purpose=ui_debug');
      const { verifyBusinessSearchUi } = await import('./verify-business-search-ui.mjs');
      await verifyBusinessSearchUi({ ...context, actor, person, own, hidden, foreignRecords, keyword });
      return;
    }
    const foreign = await session(foreignPerson.username, foreignPerson.source);
    const employee = await session(employeePerson.username, employeePerson.source);
    const result = await read(actor, own.CUSTOMER.title);
    console.log(`H5_SEARCH_SIX_GROUPS: ${JSON.stringify(result)}`);
    for (const [type, record] of Object.entries(own)) {
      const group = byType(result)[type];
      check(`${type}真实分组只返回本人匹配记录`, group?.state === 'AVAILABLE' && group.items.length === 1
        && group.items[0].id === record.id && group.items[0].title === record.title && group.items[0].route === record.route);
      const detail = successful(await api(actor, record.endpoint), `${type}原详情重新鉴权`);
      check(`${type}原详情确实返回记录`, detail !== null && typeof detail === 'object');
      check(`${type}搜索只返回编号、名称、状态和固定路径`, Object.keys(group.items[0]).sort().join(',') === 'id,number,route,status,title,type'
        && !JSON.stringify(group.items[0]).includes(secret));
    }
    evidence.sixTypes = true;
    const scope = byType(await read(actor));
    for (const type of Object.keys(own).filter(type => type !== 'ASSET')) {
      check(`${type}先按本人范围过滤再取前五条`, scope[type].state === 'AVAILABLE' && scope[type].items.length === 1
        && scope[type].items[0].id === own[type].id && !scope[type].hasMore);
      await detailRejected(await api(actor, hidden[type].endpoint), `${type}原详情同样不返回他人记录`);
    }
    check('资产延用原租户台账权限，不擅自收紧为本人', scope.ASSET.state === 'AVAILABLE' && scope.ASSET.items.length === 5 && scope.ASSET.hasMore);
    const sameTenantAsset = successful(await api(actor, hidden.ASSET.endpoint), '资产原租户读取');
    check('同租户资产搜索与原详情可见范围一致', String(sameTenantAsset.assetId) === hidden.ASSET.id);
    const employeeScope = byType(await read(employee));
    for (const type of ['CONTRACT', 'EMPLOYEE', 'TICKET', 'ASSET']) {
      check(`EMPLOYEE没有${type}读取权限时搜索不返回记录`, employeeScope[type].state === 'FORBIDDEN' && !employeeScope[type].items.length);
    }
    check('EMPLOYEE保留本人客户与流程的原读取权限', employeeScope.CUSTOMER.items.some(item => item.id === employeeRecords.CUSTOMER.id)
      && employeeScope.WORKFLOW_INSTANCE.items.some(item => item.id === employeeRecords.WORKFLOW_INSTANCE.id));
    for (const [label, visitor] of [['搜索只读账号', actor], ['EMPLOYEE', employee]]) {
      rejected(await api(visitor, '/auth/switchTenant', { method: 'POST', body: { tenantId: 100001 } }), `${label}不能切换公司身份`, [403]);
    }
    evidence.scope = true;
    const { verifyBusinessSearchWorkflow } = await import('./verify-business-search-workflow.mjs');
    await verifyBusinessSearchWorkflow({ ...context, actor, person, peer, read, byType, literal });
    const foreignResult = byType(await read(foreign));
    for (const type of Object.keys(own)) {
      check(`${type}另一租户同权限仅看到本租户`, foreignResult[type].state === 'AVAILABLE' && foreignResult[type].items.length === 1
        && foreignResult[type].items[0].id === foreignRecords[type].id);
      await detailRejected(await api(foreign, own[type].endpoint), `${type}另一租户不能用详情编号越权`, type === 'ASSET' ? own[type].endpoint : undefined);
    }
    evidence.tenants = true;
    const privateSearch = await read(admin, secret);
    check('联系方式、内部备注、工单正文及流程变量均不参与业务搜索', privateSearch.groups.every(group => group.state === 'AVAILABLE' && !group.items.length));
    evidence.privateFields = true;
    const defaultResult = await read(admin);
    const maximumResult = await read(admin, keyword, 10);
    check('六类默认每类五条并准确显示还有更多', defaultResult.limitPerType === 5 && defaultResult.groups.every(group => group.state === 'AVAILABLE' && group.items.length === 5 && group.hasMore));
    check('六类最多每类十条且过滤另一租户后再截取', maximumResult.groups.every(group => group.state === 'AVAILABLE' && group.items.length === 10 && group.hasMore
      && !group.items.some(item => item.id === foreignRecords[group.type].id)));
    for (const [query, limit] of [['x', undefined], [' '.repeat(2), undefined], ['a'.repeat(65), undefined], ['ab\u0001', undefined], [keyword, 0], [keyword, 11]]) {
      rejected(await search(admin, query, limit), `非法关键词或数量在服务端拒绝 length=${[...query].length} limit=${limit ?? 5}`, [400]);
    }
    for (const query of ['😀😀', '😀'.repeat(64)]) {
      const unicode = await read(admin, query);
      check(`Unicode按${[...query].length}个字符校验`, unicode.keyword === query && unicode.groups.every(group => group.state === 'AVAILABLE'));
    }
    const trimmed = await read(admin, `  ${keyword}  `, 1);
    check('两端空白去除且每类一条仍保留真实更多标识', trimmed.keyword === keyword && trimmed.groups.every(group => group.items.length === 1 && group.hasMore));
    const literalTitle = `literal${caseTag}%_!`;
    database(`INSERT INTO crm_customer (tenant_id,dept_id,owner_id,customer_code,customer_name,status) VALUES
      (100000,100,${person.userId},${literal(`literal_${caseTag}`)},${literal(literalTitle)},'ACTIVE'),
      (100000,100,${person.userId},${literal(`decoy_${caseTag}`)},${literal(`literal${caseTag}ABC`)},'ACTIVE');`);
    const literalResult = byType(await read(actor, literalTitle)).CUSTOMER;
    check('LIKE中的百分号、下划线及转义字符按普通字符匹配', literalResult.state === 'AVAILABLE' && literalResult.items.length === 1 && literalResult.items[0].title === literalTitle);
    const injection = await read(actor, "' OR 1=1 --");
    check('SQL片段只作为普通搜索文字，不扩大结果', injection.groups.every(group => group.state === 'AVAILABLE' && !group.items.length));
    for (const module of ['crm', 'oa', 'hr', 'workflow']) {
      rejected(await api(actor, `/${module}/inner/${module}/search?keyword=${encodeURIComponent(keyword)}`, {
        headers: { 'X-Inner-Call': 'true', 'X-From-Service': 'cloudflow-auth', 'X-Tenant-Id': '100001', 'X-User-Id': foreignPerson.userId },
      }), `${module}网关拒绝外部伪造内部调用`, [400, 403, 404]);
      rejected(await direct(actor, module), `${module}直连缺少内部来源被拒绝`, [401, 403]);
      rejected(await direct(actor, module, { 'X-Inner-Call': 'true', 'X-From-Service': 'cloudflow-service-oa' }), `${module}错误来源服务被拒绝`, [401, 403]);
    }
    const revoked = await session(revokePerson.username, revokePerson.source);
    check('撤权前专用账号拥有员工读取权限', byType(await read(revoked)).EMPLOYEE.state === 'AVAILABLE');
    const updateRole = async selection => {
      const role = successful(await api(admin, `/auth/system/role/${revokedRole}`), '读取专用角色');
      successful(await api(admin, '/auth/system/role', { method: 'PUT', body: { ...role, menuIds: selection } }), '通过正式接口撤回专用授权');
    };
    const withoutEmployeeView = menuIds.filter(identifier => identifier !== '925');
    await updateRole(withoutEmployeeView);
    rejected(await search(revoked), '正式撤权立即使旧会话失效', [401, 403]);
    const refreshed = await session(revokePerson.username, revokePerson.source);
    check('重新登录后缺少员工详情权限也不能搜索员工', byType(await read(refreshed)).EMPLOYEE.state === 'FORBIDDEN');
    await pause(5100);
    await updateRole(withoutEmployeeView.filter(identifier => identifier !== '1986'));
    const noSearch = await session(revokePerson.username, revokePerson.source);
    rejected(await search(noSearch), '撤回业务搜索权限后整体入口拒绝访问', [403]);
    evidence.revoked = true;
    const outerLimit = await session(outerLimitPerson.username, outerLimitPerson.source);
    const outerStarted = performance.now();
    const outerStatuses = await Promise.all(Array.from({ length: 30 }, () => search(outerLimit, `limit${caseTag}`)));
    outerStatuses.push(await search(outerLimit, `limit${caseTag}`));
    const outerElapsed = Math.round(performance.now() - outerStarted);
    console.log(`H5_SEARCH_OUTER_LIMIT_OBSERVED: attempts=31; statuses=${JSON.stringify(statusCounts(outerStatuses))}; elapsed_ms=${outerElapsed}`);
    check('聚合入口每用户一分钟第31次查询被限流', outerStatuses.slice(0, 30).every(result => result.status === 200 && result.body?.code === 200)
      && outerStatuses[30].body?.code === 429 && outerStatuses[30].status === 429 && outerElapsed < 60000);
    const innerLimit = await session(innerLimitPerson.username, innerLimitPerson.source);
    const innerStarted = performance.now();
    const innerQuery = () => direct(innerLimit, 'crm', {
      'X-Inner-Call': 'true', 'X-From-Service': 'cloudflow-auth', 'X-Tenant-Id': '100000', 'X-User-Id': innerLimitPerson.userId,
    }, `inner${caseTag}`);
    const innerStatuses = await Promise.all(Array.from({ length: 30 }, innerQuery));
    innerStatuses.push(await innerQuery());
    const innerElapsed = Math.round(performance.now() - innerStarted);
    console.log(`H5_SEARCH_INNER_LIMIT_OBSERVED: attempts=31; statuses=${JSON.stringify(statusCounts(innerStatuses))}; elapsed_ms=${innerElapsed}`);
    check('内部CRM入口独立执行每用户一分钟30次限制', innerStatuses.slice(0, 30).every(result => result.status === 200 && result.body?.code === 200)
      && innerStatuses[30].body?.code === 429 && innerStatuses[30].status === 429 && innerElapsed < 60000);
    check('一个账号被限流不影响另一账号', (await search(actor, own.CUSTOMER.title)).body?.code === 200);
    console.log(`H5_SEARCH_RATE_LIMIT: outer_allowed=30; outer_last=${outerStatuses[30].status}/${outerStatuses[30].body?.code}; outer_elapsed_ms=${outerElapsed}; inner_allowed=30; inner_last=${innerStatuses[30].status}/${innerStatuses[30].body?.code}; inner_elapsed_ms=${innerElapsed}`);
    evidence.limits = true;
    const mysqlEnvironment = { ...process.env };
    delete mysqlEnvironment.MYSQL_PWD;
    const lock = spawn('mysql.exe', ['--no-defaults', '--protocol=TCP', '--host=127.0.0.1', `--port=${state.mysqlPort}`,
      '--user=root', '--batch', '--raw', '--skip-column-names', '--unbuffered', 'cloud_flow_db'], { windowsHide: true, env: mysqlEnvironment, stdio: ['pipe', 'pipe', 'pipe'] });
    let lockOutput = '';
    lock.stdout.on('data', chunk => { lockOutput += chunk.toString(); });
    lock.stderr.on('data', chunk => { lockOutput += chunk.toString(); });
    const lockGuard = setTimeout(() => { if (lock.exitCode === null) lock.kill(); }, 20000);
    lock.stdin.write("LOCK TABLES crm_customer WRITE; SELECT 'H5_SEARCH_LOCKED';\n");
    try {
      const deadline = Date.now() + 5000;
      while (!lockOutput.includes('H5_SEARCH_LOCKED') && Date.now() < deadline && lock.exitCode === null) await pause(50);
      assert.ok(lockOutput.includes('H5_SEARCH_LOCKED'), `Owned fixture lock failed: ${lockOutput}`);
      const started = performance.now();
      const unavailable = await read(actor, own.CUSTOMER.title);
      const elapsed = Math.round(performance.now() - started);
      const groups = byType(unavailable);
      console.log(`H5_SEARCH_REAL_DEADLINE: elapsed_ms=${elapsed}; groups=${unavailable.groups.map(group => `${group.type}:${group.state}`).join(',')}; interface_doubles=0`);
      check('真实CRM数据库等待仅使客户及工单暂不可用，其余四类保留', ['CUSTOMER', 'TICKET'].every(type => groups[type].state === 'UNAVAILABLE' && !groups[type].items.length)
        && ['CONTRACT', 'EMPLOYEE', 'WORKFLOW_INSTANCE', 'ASSET'].every(type => groups[type].state === 'AVAILABLE' && groups[type].items.length === 1));
      check('真实HTTP聚合使用共享两秒截止时间，含网关传输小于3500ms', elapsed >= 1800 && elapsed < 3500);
      evidence.timeout = true;
    } finally {
      try {
        if (lock.exitCode === null) lock.stdin.end("UNLOCK TABLES; SELECT 'H5_SEARCH_UNLOCKED';\n");
        const releaseDeadline = Date.now() + 5000;
        while (lock.exitCode === null && Date.now() < releaseDeadline) await pause(50);
        assert.equal(lock.exitCode, 0, 'Owned MySQL lock client must exit cleanly after explicit release');
        assert.ok(lockOutput.includes('H5_SEARCH_UNLOCKED'), 'Owned MySQL table lock must be explicitly released');
        console.log('H5_SEARCH_FIXTURE_LOCK: explicitly_released=true; mysql_exit=0; production_modified=false');
      } finally {
        clearTimeout(lockGuard);
        if (lock.exitCode === null) lock.kill();
      }
    }
    const recovered = await read(actor, own.CUSTOMER.title);
    check('释放自有数据库锁后六类真实查询恢复', recovered.groups.every(group => group.state === 'AVAILABLE' && group.items.length === 1));
    await fs.writeFile(path.join(directory, `h5-search-fixtures-${caseTag}.json`), JSON.stringify({ keyword, own, hidden, foreignRecords, person }, null, 2));
    if (!process.argv.includes('--business-search-http-only')) {
      console.log('WAIT 保留真实搜索限流，等待61秒后开始双端操作验证');
      await pause(61000);
      const { verifyBusinessSearchUi } = await import('./verify-business-search-ui.mjs');
      await verifyBusinessSearchUi({ ...context, actor, person, own, hidden, foreignRecords, keyword });
    }
  } finally {
    if (roleIds.length) database(`DELETE FROM sys_role_menu WHERE role_id IN (${roleIds.join(',')});
      DELETE FROM sys_user_role WHERE role_id IN (${roleIds.join(',')}); DELETE FROM sys_role WHERE role_id IN (${roleIds.join(',')});`);
    check('测试后角色授权逐行恢复，EMPLOYEE未增加任何写权限', database(grantsSql) === grantsBefore
      && database('SELECT menu_id FROM sys_role_menu WHERE tenant_id=100000 AND role_id=5 ORDER BY menu_id;') === employeeBefore);
  }
}
