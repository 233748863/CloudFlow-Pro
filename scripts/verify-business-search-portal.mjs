import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

export async function verifyBusinessSearchPortal(context) {
  const { api, successful, session, database, check, directory, caseTag, state, first, portalUserId,
    portalCall, token, direct, sql, secrets, waitFor, evidence } = context;
  const identifier = String(portalUserId);
  assert.match(identifier, /^[1-9]\d*$/);
  assert.equal(database(`SELECT COUNT(*) FROM sys_user WHERE user_id=${identifier};`), '0', 'Same-number internal fixture must use an unused user identifier');
  const grantsSql = "SELECT CONCAT(tenant_id,':',role_id,':',menu_id) FROM sys_role_menu ORDER BY tenant_id,role_id,menu_id;";
  const grantsBefore = database(grantsSql);
  const marker = `h5_domain_${caseTag}`;
  const auditBefore = Number(database('SELECT IFNULL(MAX(log_id),0) FROM sys_log;'));
  const errorBefore = Number(database('SELECT IFNULL(MAX(error_id),0) FROM sys_api_error_log;'));
  let roleId;
  try {
    roleId = database(`INSERT INTO sys_role (tenant_id,role_name,role_key,role_sort,data_scope,ds_type,status,deleted)
      VALUES (100000,${sql(marker)},${sql(marker)},999,'2',4,'0',0); SELECT LAST_INSERT_ID();`);
    assert.match(roleId, /^[1-9]\d*$/);
    database(`INSERT INTO sys_role_menu (tenant_id,role_id,menu_id) SELECT 100000,${roleId},menu_id FROM sys_menu
      WHERE perms IN ('system:auth:info','system:search:business','crm:customer:list');
      INSERT INTO sys_user (user_id,tenant_id,dept_id,user_name,nick_name,password,status,deleted,pwd_reset_required,create_by)
      SELECT ${identifier},100000,100,${sql(marker)},${sql(marker)},password,'0',0,'0',${sql(marker)}
      FROM sys_user WHERE tenant_id=100000 AND user_name='g_holiday_employee';
      INSERT INTO sys_user_role (tenant_id,user_id,role_id) VALUES (100000,${identifier},${roleId});`);
    check('同编号专用内部账号仅持有本人身份、搜索与客户读取三项只读权限', database(`SELECT COUNT(*) FROM sys_role_menu WHERE tenant_id=100000 AND role_id=${roleId};`) === '3');
    const keyword = `登录域${caseTag}`;
    const customerId = database(`INSERT INTO crm_customer (tenant_id,dept_id,owner_id,customer_code,customer_name,status,create_by)
      VALUES (100000,100,${identifier},${sql(marker)},${sql(keyword)},'ACTIVE',${sql(marker)}); SELECT LAST_INSERT_ID();`);
    assert.match(customerId, /^[1-9]\d*$/);
    const employee = await session(marker, 'g_holiday_employee');
    const internalInfo = successful(await api(employee, '/auth/info'), '真实内部登录身份');
    const portalInfo = successful(await portalCall('/portal/session', undefined, token), '真实激活后的客户登录身份');
    check('真实客户与内部员工编号相同，客户仍绑定原联系人和公司', String(internalInfo.user.userId) === identifier
      && portalInfo.loginAccount === first.account
      && database(`SELECT COUNT(*) FROM sys_portal_user WHERE tenant_id=100000 AND portal_user_id=${identifier}
        AND ref_biz_id=${first.contactId} AND customer_id=${first.customerId} AND status='ACTIVE';`) === '1');
    const searchPath = `/auth/system/search/business?keyword=${encodeURIComponent(keyword)}`;
    const internalResult = successful(await api(employee, searchPath), '同编号内部员工搜索');
    const customerGroup = internalResult.groups.find(group => group.type === 'CUSTOMER');
    check('同编号内部员工能够真实搜索本人客户，排除功能本身停用', customerGroup?.state === 'AVAILABLE'
      && customerGroup.items.length === 1 && customerGroup.items[0].id === customerId);
    evidence.identity = true;
    const denied = (result, label) => check(`${label} HTTP=${result.status} code=${result.body?.code}`,
      [401, 403].includes(result.status) && result.body?.code !== 200 && result.body?.data == null);
    denied(await portalCall(searchPath, undefined, token), '同编号客户令牌不能用于内部聚合搜索');
    denied(await portalCall(searchPath, undefined, token, { Authorization: `Bearer ${token}`, 'X-User-Id': identifier, 'X-Tenant-Id': '100000' }), '伪造内部认证头和相同编号仍不能搜索');
    denied(await direct('auth', `/system/search/business?keyword=${encodeURIComponent(keyword)}`,
      { Authorization: `Bearer ${token}`, 'portal-token': token }, '127.0.0.1'), '客户直连认证服务也不能搜索');
    for (const module of ['crm', 'oa', 'hr', 'workflow']) {
      denied(await direct(module, `/inner/${module}/search?keyword=${encodeURIComponent(keyword)}`, {
        Authorization: `Bearer ${token}`, 'portal-token': token, 'X-Inner-Call': 'true', 'X-From-Service': 'cloudflow-auth',
        'X-User-Id': identifier, 'X-Tenant-Id': '100000',
      }, '127.0.0.1'), `${module}可信内网来源也不能把客户同编号转换成内部搜索身份`);
    }
    check('失败越权不影响合法客户会话与内部会话', successful(await portalCall('/portal/session', undefined, token), '门户会话仍有效').loginAccount === first.account
      && successful(await api(employee, searchPath), '内部搜索仍有效').groups.find(group => group.type === 'CUSTOMER').items[0].id === customerId);
    evidence.boundaries = true;
    const expectedAuditServices = state.services.filter(service => service.name !== 'gateway').map(service => service.module).sort();
    const auditedServices = await waitFor(() => database(`SELECT DISTINCT service_name FROM sys_api_error_log
      WHERE error_id>${errorBefore} AND exception_class='cn.dev33.satoken.exception.NotLoginException' ORDER BY service_name;`),
    value => value.split(/\r?\n/).join('|') === expectedAuditServices.join('|'), '五个服务的真实登录拒绝错误审计未全部落库');
    const logs = [];
    const collectLogs = async parent => {
      for (const entry of await fs.readdir(parent, { withFileTypes: true })) {
        if (entry.isSymbolicLink()) continue;
        const filename = path.join(parent, entry.name);
        if (entry.isDirectory()) await collectLogs(filename);
        else if (entry.name.endsWith('.log')) logs.push(filename);
      }
    };
    for (const service of state.services) await collectLogs(path.join(directory, service.name));
    const uniqueSecrets = [...new Set(secrets)];
    let leaks = 0;
    let bytes = 0;
    const diagnostics = [];
    for (const filename of logs) {
      const content = await fs.readFile(filename, 'utf8');
      bytes += Buffer.byteLength(content);
      for (const [secretIndex, value] of uniqueSecrets.entries()) {
        const offset = content.indexOf(value);
        if (offset < 0) continue;
        leaks++;
        diagnostics.push({ source: 'runtime_log', file: path.relative(directory, filename),
          line: content.slice(0, offset).split('\n').length, secret_index: secretIndex });
      }
    }
    const operationRows = database(`SELECT JSON_OBJECT('log_id',CAST(log_id AS CHAR),'params',params,'exception',exception,'request_uri',request_uri)
      FROM sys_log WHERE log_id>${auditBefore};`).split(/\r?\n/).filter(Boolean).map(value => JSON.parse(value));
    const errorRows = database(`SELECT JSON_OBJECT('error_id',CAST(error_id AS CHAR),'request_params',request_params,
      'exception_message',exception_message,'exception_stack',exception_stack,'request_url',request_url,
      'exception_class',exception_class,'trace_id',trace_id)
      FROM sys_api_error_log WHERE error_id>${errorBefore};`).split(/\r?\n/).filter(Boolean).map(value => JSON.parse(value));
    check('五个服务的登录拒绝均保留错误类型和追踪编号且不保存凭据消息或堆栈',
      auditedServices.split(/\r?\n/).length === 5 && errorRows.filter(row => row.exception_class === 'cn.dev33.satoken.exception.NotLoginException')
        .every(row => row.request_params == null && row.exception_message == null && row.exception_stack == null && typeof row.trace_id === 'string' && row.trace_id.length > 0));
    let auditLeaks = 0;
    for (const audit of [
      { source: 'operation_audit', rows: operationRows, identifier: 'log_id', fields: ['params', 'exception', 'request_uri'] },
      { source: 'error_audit', rows: errorRows, identifier: 'error_id', fields: ['request_params', 'exception_message', 'exception_stack', 'request_url'] },
    ]) {
      for (const row of audit.rows) {
        for (const field of audit.fields) {
          for (const [secretIndex, value] of uniqueSecrets.entries()) {
            if (!String(row[field] ?? '').includes(value)) continue;
            auditLeaks++;
            diagnostics.push({ source: audit.source, row_id: row[audit.identifier], field, secret_index: secretIndex });
          }
        }
      }
    }
    console.log(`H5_SEARCH_PORTAL_LOG_SCAN: files=${logs.length}; bytes=${bytes}; sensitive_values=${uniqueSecrets.length}; leaks=${leaks}; database_audit_checked=true; audit_rows=${operationRows.length}; error_rows=${errorRows.length}; audit_leaks=${auditLeaks}`);
    for (const diagnostic of diagnostics) console.log(`H5_SEARCH_PORTAL_SECRET_LOCATION: ${JSON.stringify(diagnostic)}`);
    check('同编号登录隔离测试没有在运行日志或操作审计中泄漏客户凭据', leaks === 0 && auditLeaks === 0);
    evidence.secrets = true;
    console.log(`H5_SEARCH_PORTAL_IDENTITY: portal_user_id=${identifier}; internal_user_id=${identifier}; invitation=real_tls_smtp; activation=real_https; both_logins=real; forged_search_denials=7; api_doubles=0; production_modified=false`);
  } finally {
    if (roleId) database(`DELETE FROM sys_role_menu WHERE tenant_id=100000 AND role_id=${roleId};
      DELETE FROM sys_user_role WHERE tenant_id=100000 AND role_id=${roleId};
      DELETE FROM sys_role WHERE tenant_id=100000 AND role_id=${roleId} AND role_key=${sql(marker)};`);
    check('同编号身份测试恢复全部角色授权，员工角色5保持不变', database(grantsSql) === grantsBefore);
    evidence.grantsRestored = true;
  }
}
