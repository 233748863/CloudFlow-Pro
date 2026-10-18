import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { previewDigest, previewPause, previewPdf } from './file-preview-fixtures.mjs';
import { scanOwnedAuditLogs } from './portal-checks/scan-access-logs.mjs';

export async function verifyPreviewPortal(context) {
  const { api, successful, session, database, check, directory, caseTag, state, first, portalUserId,
    portalCall, token, sql, secrets, evidence, requests } = context;
  const identifier = String(portalUserId);
  assert.match(identifier, /^[1-9]\d*$/);
  assert.equal(database(`SELECT COUNT(*) FROM sys_user WHERE user_id=${identifier};`), '0', 'Portal numeric identity must be unused by internal users');
  const grantsSql = "SELECT CONCAT(tenant_id,':',role_id,':',menu_id) FROM sys_role_menu ORDER BY tenant_id,role_id,menu_id;";
  const grantsBefore = database(grantsSql);
  const marker = `h5p_domain_${caseTag}`;
  const offsets = new Map();
  const collect = async (parent, destination) => {
    for (const entry of await fs.readdir(parent, { withFileTypes: true })) {
      if (entry.isSymbolicLink() || ['mysql-data', 'profile', 'private'].includes(entry.name)) continue;
      const filename = path.join(parent, entry.name);
      if (entry.isDirectory()) await collect(filename, destination);
      else if (entry.name.endsWith('.log')) destination.set(filename, (await fs.stat(filename)).size);
    }
  };
  await collect(directory, offsets);
  const auditBefore = database('SELECT COALESCE(MAX(audit_id),0) FROM sys_audit_log;');
  const logBefore = database('SELECT COALESCE(MAX(log_id),0) FROM sys_log;');
  const errorBefore = database('SELECT COALESCE(MAX(error_id),0) FROM sys_api_error_log;');
  let roleId;
  try {
    roleId = database(`INSERT INTO sys_role (tenant_id,role_name,role_key,role_sort,data_scope,ds_type,status,deleted)
      VALUES (100000,${sql(marker)},${sql(marker)},999,'2',4,'0',0); SELECT LAST_INSERT_ID();`);
    assert.match(roleId, /^[1-9]\d*$/);
    database(`INSERT INTO sys_role_menu (tenant_id,role_id,menu_id) SELECT 100000,${roleId},menu_id FROM sys_menu
      WHERE perms IN ('system:auth:info','system:file:upload','system:file:preview','oa:contract:list');
      INSERT INTO sys_user (user_id,tenant_id,dept_id,user_name,nick_name,password,status,deleted,pwd_reset_required,create_by)
      SELECT ${identifier},100000,100,${sql(marker)},${sql(marker)},password,'0',0,'0',${sql(marker)}
      FROM sys_user WHERE tenant_id=100000 AND user_name='g_holiday_employee';
      INSERT INTO sys_user_role (tenant_id,user_id,role_id) VALUES (100000,${identifier},${roleId});`);
    check('预览同编号内部身份仅使用四项既有权限，未调整正式角色', database(`SELECT COUNT(*) FROM sys_role_menu WHERE tenant_id=100000 AND role_id=${roleId};`) === '4');
    const employee = await session(marker, 'g_holiday_employee');
    const internalToken = await employee.evaluate(async () => (await import('/src/utils/authStorage.ts')).getAuthToken());
    assert.equal(typeof internalToken, 'string');
    secrets.push(internalToken.replace(/^Bearer /, ''));
    const internalInfo = successful(await api(employee, '/auth/info'), '真实同编号内部身份');
    const portalInfo = successful(await portalCall('/portal/session', undefined, token), '真实客户身份');
    check('真实客户与内部账号编号相同且客户仍绑定原联系人和公司', String(internalInfo.user.userId) === identifier
      && portalInfo.loginAccount === first.account && database(`SELECT COUNT(*) FROM sys_portal_user WHERE tenant_id=100000
      AND portal_user_id=${identifier} AND ref_biz_id=${first.contactId} AND customer_id=${first.customerId} AND status='ACTIVE';`) === '1');
    const bytes = previewPdf(marker);
    const file = successful(await api(employee, '/auth/system/file/upload', { method: 'POST', file: {
      name: `${marker}.pdf`, type: 'application/pdf', content: bytes.toString('base64'),
    } }), '同编号内部账号真实上传PDF');
    assert.match(String(file.fileId), /^[1-9]\d*$/);
    const contractId = database(`INSERT INTO oa_contract (tenant_id,dept_id,owner_id,contract_no,contract_name,counterparty_name,contract_type,status,attachment_url,create_by)
      VALUES (100000,100,${identifier},${sql(marker)},${sql(marker)},'同编号预览隔离输入','SALES','DRAFT',${sql(file.reference || file.url)},${sql(marker)}); SELECT LAST_INSERT_ID();`);
    assert.match(contractId, /^[1-9]\d*$/);
    const request = { bizType: 'OA_CONTRACT', bizId: contractId, slot: 'attachment', fileId: String(file.fileId) };
    const endpoint = '/auth/system/file/preview-ticket';
    const ticket = successful(await api(employee, endpoint, { method: 'POST', body: request }), '同编号内部员工预览本人合同');
    check('同编号内部员工确实能够预览，功能未停用', ticket.supported === true && ticket.size === bytes.length);
    const parameters = new URL(ticket.streamUrl, 'https://localhost').searchParams;
    secrets.push(parameters.get('previewToken'), parameters.get('signature'));
    const content = await api(employee, ticket.streamUrl.slice(4));
    check('同编号内部会话读取真实PDF原始字节', content.status === 200 && content.sha256 === previewDigest(bytes));
    evidence.identity = true;
    const denied = (result, label) => check(`${label} HTTP=${result.status} code=${result.body?.code}`,
      [401, 403].includes(result.status) && result.body?.code !== undefined && result.body.code !== 200 && result.body.data == null && result.size == null);
    denied(await portalCall(endpoint, request, token), '真实同编号客户身份不能申请内部预览');
    const forgedHeaders = { Authorization: `Bearer ${token}`, 'X-User-Id': identifier, 'X-Tenant-Id': '100000',
      'X-Inner-Call': 'true', 'X-From-Service': 'cloudflow-auth' };
    denied(await portalCall(endpoint, request, token, forgedHeaders), '同编号客户伪造内部头仍不能申请预览');
    denied(await portalCall(ticket.streamUrl.slice(4), undefined, token, forgedHeaders), '同编号客户持有真实内部签名也不能读文件');
    const direct = async (module, route, body) => {
      const service = state.services.find(value => value.name === module);
      const method = body === undefined ? 'GET' : 'POST';
      const response = await fetch(`http://127.0.0.1:${service.port}${route}`, { method, redirect: 'manual', headers: {
        ...forgedHeaders, 'portal-token': token, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
      const result = { status: response.status, body: await response.json() };
      requests.push({ path: route.split('?')[0], method, status: result.status, code: result.body?.code, source: `direct-${module}` });
      return result;
    };
    denied(await direct('auth', '/system/file/preview-ticket', request), '客户身份直连认证服务也不能申请预览');
    denied(await direct('auth', ticket.streamUrl.slice('/api/auth'.length)), '客户身份直连认证服务也不能读取内部预览');
    for (const [module, business] of [['oa', request], ['hr', { ...request, bizType: 'HR_RESUME' }],
      ['workflow', { ...request, bizType: 'WORKFLOW_FORM', definitionId: 'missing', fieldPath: 'receipt' }]]) {
      denied(await direct(module, `/inner/${module}/file-preview/authorize`, business), `${module}可信内网来源不把客户编号转换为内部预览身份`);
    }
    check('跨登录域拒绝不影响合法客户及内部会话', successful(await portalCall('/portal/session', undefined, token), '客户会话保持有效').loginAccount === first.account
      && (await api(employee, ticket.streamUrl.slice(4))).sha256 === previewDigest(bytes));
    evidence.boundaries = true;
    await previewPause(1500);
    const uniqueSecrets = [...new Set(secrets)].filter(value => typeof value === 'string' && value.length > 5);
    const databaseScan = await scanOwnedAuditLogs(state, uniqueSecrets, { log: logBefore, error: errorBefore, audit: auditBefore });
    check('同编号预览的数据库审计无会话、签名和客户密码', databaseScan.bytes > 0 && databaseScan.leaks === 0);
    console.log(`H5_PREVIEW_PORTAL_DATABASE_LOG_SCAN: bytes=${databaseScan.bytes}; sensitive_values=${databaseScan.sensitiveValues}; leaks=${databaseScan.leaks}; streamed=true; tables=3; historical_logs_recertified=false; production_modified=false`);
    const current = new Map();
    await collect(directory, current);
    const overlap = Math.max(...uniqueSecrets.map(value => Buffer.byteLength(value))) + 8;
    let scanned = 0;
    let scannedBytes = 0;
    for (const [filename, size] of current) {
      let offset = size < (offsets.get(filename) || 0) ? 0 : offsets.get(filename) || 0;
      if (offset >= size) continue;
      scanned++;
      const handle = await fs.open(filename, 'r');
      let retained = Buffer.alloc(0);
      try {
        while (offset < size) {
          const buffer = Buffer.alloc(Math.min(65536, size - offset));
          const chunk = await handle.read(buffer, 0, buffer.length, offset);
          if (!chunk.bytesRead) break;
          offset += chunk.bytesRead; scannedBytes += chunk.bytesRead;
          const content = Buffer.concat([retained, buffer.subarray(0, chunk.bytesRead)]);
          assert.ok(uniqueSecrets.every(value => !content.includes(Buffer.from(value))), `Preview identity secret leaked in ${path.relative(directory, filename)}`);
          retained = content.subarray(Math.max(0, content.length - overlap));
        }
      } finally { await handle.close(); }
    }
    console.log(`H5_PREVIEW_PORTAL_LOG_SCAN: files_with_new_bytes=${scanned}; new_bytes=${scannedBytes}; sensitive_values=${uniqueSecrets.length}; leaks=0; database_audit_checked=true; historical_logs_recertified=false; production_modified=false`);
    evidence.secrets = true;
    console.log(`H5_PREVIEW_PORTAL_IDENTITY: portal_user_id=${identifier}; internal_user_id=${identifier}; invitation=real_tls_smtp; activation=real_https; both_logins=real; denied_requests=8; production_modified=false`);
  } finally {
    if (roleId) database(`DELETE FROM sys_role_menu WHERE tenant_id=100000 AND role_id=${roleId};
      DELETE FROM sys_user_role WHERE tenant_id=100000 AND role_id=${roleId};
      DELETE FROM sys_role WHERE tenant_id=100000 AND role_id=${roleId} AND role_key=${sql(marker)};
      UPDATE sys_user SET status='1' WHERE user_id=${identifier} AND tenant_id=100000 AND create_by=${sql(marker)};`);
    check('预览客户身份专项恢复全部角色授权，EMPLOYEE角色5逐行不变', database(grantsSql) === grantsBefore);
    evidence.grantsRestored = true;
  }
}
