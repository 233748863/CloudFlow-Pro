import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { verifyPortalFinanceInterface } from './verify-portal-finance-ui.mjs';
import { scanOwnedAccessLogs, scanOwnedAuditLogs, scanSecretStream } from './portal-checks/scan-access-logs.mjs';

export async function verifyPortalFinance(context) {
  const { admin, employee, sales, api, successful, session, database, check, first, caseTag, portalCall,
    token, sql, denied, evidence, secrets, waitFor, minute, createBusiness, invite, messageIds, message, activation, login, password, directory, state } = context;
  const prefix = `H3_PF_${caseTag}`;
  const privateMarker = `PRIVATE_FINANCE_${caseTag}`;
  const grants = database('SELECT tenant_id,role_id,menu_id FROM sys_role_menu ORDER BY tenant_id,role_id,menu_id;');
  const auditStart = database('SELECT COALESCE(MAX(audit_id),0) FROM sys_audit_log;');
  const username = `g_finance_${caseTag}`;
  assert.equal(database(`SELECT COUNT(*) FROM sys_user WHERE user_name=${sql(username)};`), '0');
  database(`INSERT INTO sys_user (tenant_id,dept_id,user_name,nick_name,password,status,deleted,pwd_reset_required,create_by)
    SELECT 100000,101,${sql(username)},${sql(username)},password,'0',0,'0','isolated-finance-fixture' FROM sys_user WHERE tenant_id=100000 AND user_name='g_import_admin';`);
  const financeId = database(`SELECT user_id FROM sys_user WHERE tenant_id=100000 AND user_name=${sql(username)};`);
  assert.match(financeId, /^[1-9][0-9]*$/);
  database(`INSERT INTO sys_user_role (tenant_id,user_id,role_id) VALUES (100000,${financeId},3);`);
  const finance = await session(username, 'g_import_admin');
  for (const page of [admin, finance, employee, sales]) {
    const internalToken = await page.evaluate(async () => (await import('/src/utils/authStorage.ts')).getAuthToken());
    assert.ok(internalToken); secrets.push(internalToken.replace(/^Bearer /, ''));
  }
  const route = record => `/${record.kind === 'RECEIVABLE' ? 'crm/receivable' : 'oa/invoice'}/${record.id}`;
  const preview = async (record, actor = finance) => successful(await api(actor, `${route(record)}/portal-publication`), '读取财务公开预览');
  const confirm = async (record, publish = true, fileIds = [], actor = finance, version) => successful(await api(actor, `${route(record)}/portal-publication`, {
    method: 'PUT', body: { version: version ?? (await preview(record, actor)).version, publish, fileIds },
  }), '真实确认或撤回财务公开');
  const call = async (record, suffix, suppliedToken = token) => {
    const url = `/portal/crm/${record.kind === 'RECEIVABLE' ? 'receivable' : 'invoice'}${suffix}`;
    let result = await portalCall(url, undefined, suppliedToken);
    if (result.status === 429) { await minute(); result = await portalCall(url, undefined, suppliedToken); }
    return result;
  };
  const list = async (record, keyword = record.number, suppliedToken = token, pageNum = 1, pageSize = 10) => successful(await call(record,
    `/list?${new URLSearchParams({ keyword, pageNum: String(pageNum), pageSize: String(pageSize) })}`, suppliedToken), '客户财务分页');
  const detail = async (record, suppliedToken = token) => successful(await call(record, `/${record.id}`, suppliedToken), '客户财务详情');
  const create = async (kind, suffix) => {
    const number = `${prefix}_${suffix}`;
    const body = kind === 'RECEIVABLE' ? { receivableNo: number, receivableName: number, customerId: first.customerId,
      plannedAmount: '12345.67', dueDate: '2026-12-31', remark: privateMarker } : { invoiceNo: number, invoiceCode: `C_${caseTag}`,
      invoiceDirection: 'OUTPUT', invoiceType: 'NORMAL', customerId: first.customerId, customerName: first.name,
      grossAmount: '12345.67', taxAmount: '0.01', invoiceDate: '2026-10-02', remark: privateMarker,
      sellerBankAccount: privateMarker, externalLinkUrl: `https://example.test/${privateMarker}` };
    const base = kind === 'RECEIVABLE' ? '/crm/receivable' : '/oa/invoice';
    successful(await api(admin, base, { method: 'POST', body }), '通过现有业务入口新增单据');
    const id = database(kind === 'RECEIVABLE' ? `SELECT receivable_id FROM crm_receivable WHERE tenant_id=100000 AND receivable_no=${sql(number)};`
      : `SELECT invoice_id FROM oa_invoice WHERE tenant_id=100000 AND invoice_no=${sql(number)};`);
    assert.match(id, /^[1-9][0-9]*$/);
    return { kind, id, number, body, base, table: kind === 'RECEIVABLE' ? 'crm_receivable' : 'oa_invoice', idColumn: kind === 'RECEIVABLE' ? 'receivable_id' : 'invoice_id' };
  };
  const fileBytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6l2sAAAAASUVORK5CYII=', 'base64');
  const upload = async (record, suffix, actor = finance) => successful(await api(actor, `${route(record)}/portal-publication/files`, {
    method: 'POST', file: { name: `${prefix}_${suffix}.png`, type: 'image/png', content: fileBytes.toString('base64') },
  }), '真实上传私有财务票据');
  const access = async (record, file, suppliedToken = token) => {
    const value = successful(await portalCall('/portal/crm/finance/file/access', { kind: record.kind, recordId: record.id, fileId: file.fileId }, suppliedToken), '签发真实票据访问凭据');
    assert.match(value.downloadTicket, /^ff_[A-Za-z0-9_-]{43}$/); secrets.push(value.downloadTicket);
    check('票据访问凭据有效期为60秒', value.expiresIn === 60);
    return value.downloadTicket;
  };
  const content = (ticket, preview = false, suppliedToken = token) => portalCall('/portal/crm/finance/file/content', { downloadTicket: ticket, preview }, suppliedToken);
  const allowed = ['recordId', 'kind', 'number', 'invoiceCode', 'invoiceType', 'plannedAmount', 'receivedAmount', 'outstandingAmount', 'grossAmount', 'taxAmount', 'dueDate', 'receivedDate', 'invoiceDate', 'status', 'attachments'];
  const publicFields = value => check('客户财务响应只含白名单字段且无内部说明、银行信息或文件地址', Object.keys(value).every(key => allowed.includes(key))
    && !JSON.stringify(value).includes(privateMarker) && value.attachments.every(file => Object.keys(file).every(key => ['fileId', 'fileName', 'fileSize', 'extension'].includes(key))));
  const records = [];
  const auditCount = () => Number(database(`SELECT COUNT(*) FROM sys_audit_log WHERE audit_id>${auditStart} AND audit_name IN ('回款财务公开确认与撤回','发票财务公开确认与撤回');`));
  try {
    check('财务公开仅授权管理员和财务，普通员工授权不变', database('SELECT GROUP_CONCAT(role_id ORDER BY role_id) FROM sys_role_menu WHERE tenant_id=100000 AND menu_id=1916;') === '1,3');
    const customer = successful(await api(admin, `/crm/customer/${first.customerId}`), '读取本轮测试客户');
    check('测试客户创建时明确负责人及财务所属部门', customer.deptId === 101 && customer.ownerId != null);
    for (const kind of ['RECEIVABLE', 'INVOICE']) {
      const record = await create(kind, kind.toLowerCase()); records.push(record);
      if (kind === 'INVOICE') {
        const search = async (keyword, filters = {}) => successful(await api(finance,
          `/oa/invoice/list?${new URLSearchParams({ keyword, pageNum: '1', pageSize: '10', ...filters })}`), '真实财务账号查询发票代码或号码');
        for (const keyword of [record.body.invoiceCode, record.number]) {
          const result = await search(keyword);
          check('发票代码与号码不同，按任一值均可找到该发票', Number(result.total) === 1
            && result.rows.length === 1 && String(result.rows[0].invoiceId) === record.id);
        }
        for (const [label, filters] of [
          ['方向', { invoiceDirection: 'INPUT' }], ['客户', { customerId: '999999991' }],
          ['状态', { status: 'VOIDED' }], ['独立号码条件', { invoiceNo: 'no_match_' + caseTag }],
        ]) {
          const result = await search(record.body.invoiceCode, filters);
          check(`发票代码或号码搜索仍与${label}条件同时生效`, Number(result.total) === 0 && result.rows.length === 0);
        }
      }
      const initial = await preview(record);
      if (kind === 'RECEIVABLE') {
        database(`UPDATE crm_customer SET dept_id=100 WHERE tenant_id=100000 AND customer_id=${first.customerId};`);
        try { denied(await api(finance, `${route(record)}/portal-publication`), 400, '财务公开仍拒绝部门范围外的回款'); }
        finally { database(`UPDATE crm_customer SET dept_id=101 WHERE tenant_id=100000 AND customer_id=${first.customerId};`); }
      }
      check(`${kind}默认仅内部可见`, initial.publicationStatus === 'PRIVATE' && initial.fileIds.length === 0 && (await list(record)).total === 0);
      denied(await call(record, `/${record.id}`), 404, '猜测单据编号也不能读取私有记录');
      for (const actor of [employee, sales]) {
        denied(await api(actor, `${route(record)}/portal-publication`), 403, '员工及销售不能预览公开管理');
        denied(await api(actor, `${route(record)}/portal-publication`, { method: 'PUT', body: { version: initial.version, publish: true, fileIds: [] } }), 403, '员工及销售不能确认公开');
      }
      for (const field of ['portalPublicVersion', 'portalPublishedBy', 'portalPublishedTime', 'portalFileIds', 'portal_public_version', 'portal_published_by', 'portal_published_time', 'portal_file_ids']) {
        denied(await api(admin, record.base, { method: 'PUT', body: { ...record.body, [kind === 'RECEIVABLE' ? 'receivableId' : 'invoiceId']: record.id, version: initial.version, [field]: null } }), 400, '普通编辑拒绝直接写公开字段，包括空值');
      }
      const file = await upload(record, kind); record.file = file;
      check('票据编号经服务间往返仍为精确字符串，上传本身不公开', typeof file.fileId === 'string' && /^[1-9][0-9]*$/.test(file.fileId) && (await list(record)).total === 0);
      const foreignFile = await upload(record, `${kind}_admin`, admin);
      denied(await api(finance, `${route(record)}/portal-publication`, { method: 'PUT', body: { version: initial.version, publish: true, fileIds: [foreignFile.fileId] } }), 400, '财务不能公开他人上传的票据');
      const published = await confirm(record, true, [file.fileId]);
      check('公开由实际财务会话确认并保存新版本', published.publicationStatus === 'PUBLISHED' && published.version === initial.version + 1
        && database(`SELECT portal_published_by FROM ${record.table} WHERE ${record.idColumn}=${record.id};`) === financeId);
      publicFields(await detail(record)); publicFields((await list(record)).rows[0]);
      check('金额以完整十进制字符串返回且只显示已选票据', (await detail(record))[kind === 'RECEIVABLE' ? 'plannedAmount' : 'grossAmount'] === '12345.67'
        && (await detail(record)).attachments.length === 1 && (await detail(record)).attachments[0].fileId === file.fileId);
      await waitFor(auditCount, count => count > 0, '财务公开未产生真实审计');
      const count = auditCount();
      await confirm(record, true, [file.fileId], finance, initial.version);
      check('相同旧版本重试恢复成功结果，不重复写入或增加审计', (await preview(record)).version === published.version && auditCount() === count);
      for (const inline of [false, true]) {
        const ticket = await access(record, file); const response = await content(ticket, inline);
        check('下载或预览读取真实私有字节并禁止缓存', response.status === 200 && response.sha256 === createHash('sha256').update(fileBytes).digest('hex')
          && response.headers['cache-control']?.includes('no-store') && response.headers['x-content-type-options'] === 'nosniff'
          && response.headers['content-type']?.includes(inline ? 'image/png' : 'application/octet-stream'));
        denied(await content(ticket, inline), 404, '访问凭据只能消费一次');
      }
      const oldTicket = await access(record, file); await confirm(record, false);
      check('撤回同时移除客户列表及总数', (await list(record)).total === 0);
      denied(await call(record, `/${record.id}`), 404, '撤回立即禁止详情'); denied(await content(oldTicket), 404, '撤回立即禁止未消费的旧凭据');
      await confirm(record, true, [file.fileId]);
      const current = await preview(record);
      const competing = await Promise.all([[file.fileId], []].map(fileIds => api(finance, `${route(record)}/portal-publication`, { method: 'PUT', body: { version: current.version, publish: fileIds.length === 0, fileIds: [] } })));
      check('同版本公开变更与撤回并发只有一个落库', competing.filter(value => value.status === 200 && value.body?.code === 200).length === 1 && competing.filter(value => value.status === 409).length === 1);
      await confirm(record, true, [file.fileId]);
      const beforeEdit = await preview(record); const staleTicket = await access(record, file);
      successful(await api(admin, record.base, { method: 'PUT', body: { ...record.body, [kind === 'RECEIVABLE' ? 'receivableId' : 'invoiceId']: record.id,
        version: beforeEdit.version, remark: privateMarker + '_edited' } }), '真实普通业务编辑');
      check('单据内容变更后公开状态失效，等待重新确认', (await preview(record)).publicationStatus === 'STALE' && (await list(record)).total === 0);
      denied(await content(staleTicket), 404, '业务变化后旧票据凭据失效'); await confirm(record, true, [file.fileId]);
    }
    evidence.permissions = true; evidence.concurrency = true; evidence.withdrawal = true; evidence.files = true;
    for (const record of records) {
      const second = await create(record.kind, `page2_${record.kind}`); await confirm(second);
      const firstPage = await list(record, prefix, token, 1, 1); const secondPage = await list(record, prefix, token, 2, 1);
      check('真实分页总数和页间记录一致且无重复', firstPage.total === 2 && secondPage.total === 2 && firstPage.rows.length === 1 && secondPage.rows.length === 1
        && firstPage.rows[0].recordId !== secondPage.rows[0].recordId);
    }
    const [receivable, invoice] = records;
    const beforeForgedUpload = database(`SELECT COUNT(*) FROM sys_file WHERE tenant_id=100000 AND biz_type='PORTAL_FINANCE_RECEIVABLE' AND biz_id=${sql(receivable.id)};`);
    const multipart = new FormData(); multipart.append('file', new Blob([fileBytes], { type: 'image/png' }), 'forged-finance.png');
    const forgedUpload = await fetch(`http://127.0.0.1:${state.services.find(service => service.name === 'auth').port}/inner/auth/finance-files/RECEIVABLE/${receivable.id}`, {
      method: 'POST', headers: { 'X-Inner-Call': 'true', 'X-From-Service': 'cloudflow-service-crm', 'X-Tenant-Id': '100000', 'X-User-Id': '1', 'X-User-Name': 'admin' },
      body: multipart, signal: AbortSignal.timeout(30000),
    });
    check('直连并伪造内部服务和管理员标记无法上传票据', [401, 403].includes(forgedUpload.status)
      && database(`SELECT COUNT(*) FROM sys_file WHERE tenant_id=100000 AND biz_type='PORTAL_FINANCE_RECEIVABLE' AND biz_id=${sql(receivable.id)};`) === beforeForgedUpload);
    await confirm(receivable, false);
    check('回款与发票独立公开，撤回回款不影响发票', (await list(invoice)).total === 1 && (await list(receivable)).total === 0);
    await confirm(receivable, true, [receivable.file.fileId]);
    for (const record of records) {
      const column = record.kind === 'RECEIVABLE' ? 'planned_amount' : 'gross_amount';
      const maximum = record.kind === 'RECEIVABLE' ? '99999999999999.99' : '9999999999999999.99';
      database(`UPDATE ${record.table} SET ${column}=${maximum} WHERE ${record.idColumn}=${record.id};`);
      try { check('数据库金额上界完整返回，未经过浮点转换', (await detail(record))[record.kind === 'RECEIVABLE' ? 'plannedAmount' : 'grossAmount'] === maximum); }
      finally { database(`UPDATE ${record.table} SET ${column}=12345.67 WHERE ${record.idColumn}=${record.id};`); }
      for (const [label, mutation, restore] of [['跨公司', 'customer_id=0', `customer_id=${first.customerId}`], ['跨租户', 'tenant_id=100001', 'tenant_id=100000'], ['删除', 'deleted=1', 'deleted=0']]) {
        database(`UPDATE ${record.table} SET ${mutation} WHERE ${record.idColumn}=${record.id};`);
        try { denied(await call(record, `/${record.id}`), 404, `${label}单据隐藏详情`); check(`${label}单据隐藏总数`, (await list(record)).total === 0); }
        finally { database(`UPDATE ${record.table} SET ${restore} WHERE ${record.idColumn}=${record.id};`); }
      }
    }
    evidence.precision = true;
    const activate = async business => {
      const before = await messageIds(); await invite(business);
      successful(await portalCall(`/portal/${context.tenantCode}/activate`, { activationToken: activation(await message(business, before)), password }), '真实激活财务边界账号');
      return login(business);
    };
    const sibling = { ...first, email: `finance-sibling-${caseTag}@example.test`, account: `pf.sibling.${caseTag}` };
    successful(await api(admin, '/crm/contact', { method: 'POST', body: { customerId: first.customerId, contactName: prefix, email: sibling.email, status: 'ACTIVE' } }), '创建同公司第二联系人');
    sibling.contactId = database(`SELECT contact_id FROM crm_contact WHERE customer_id=${first.customerId} AND contact_name=${sql(prefix)};`);
    const siblingToken = await activate(sibling);
    const outsider = await createBusiness('finance-other'); const outsideToken = await activate(outsider);
    for (const record of records) {
      check('同公司另一联系人可查看相同公开记录', (await detail(record, siblingToken)).recordId === record.id);
      denied(await call(record, `/${record.id}`, outsideToken), 404, '另一公司门户账号不能看详情'); check('另一公司门户账号不泄漏总数', (await list(record, record.number, outsideToken)).total === 0);
    }
    const sessionTicket = await access(receivable, receivable.file);
    denied(await content(sessionTicket, false, siblingToken), 404, '同公司其他会话也不能消费当前会话凭据');
    check('错误会话未抢占合法访问凭据', (await content(sessionTicket)).status === 200);
    const expired = await access(receivable, receivable.file); await minute();
    denied(await content(expired), 404, '真实等待60秒后访问凭据过期');
    evidence.identity = true;
    const auditRows = JSON.parse(database(`SELECT JSON_ARRAYAGG(JSON_OBJECT('actor',create_by,'risk',high_risk,'before',before_json,'after',after_json,'diff',diff_json)) FROM sys_audit_log WHERE audit_id>${auditStart} AND audit_name IN ('回款财务公开确认与撤回','发票财务公开确认与撤回');`));
    check('真实公开与撤回审计保留操作者、前后状态和差异', auditRows.length >= 8 && auditRows.every(row => row.actor === username && row.risk === 1 && row.before && row.after && row.diff)); evidence.audit = true;
    await verifyPortalFinanceInterface({ ...context, finance, records, prefix, privateMarker, preview, confirm, detail, list, upload });
    const contactName = database(`SELECT contact_name FROM crm_contact WHERE contact_id=${first.contactId} AND tenant_id=100000;`);
    const contactState = async status => successful(await api(admin, '/crm/contact', { method: 'PUT', body: {
      contactId: first.contactId, customerId: first.customerId, contactName, email: first.email, status,
      version: Number(database(`SELECT version FROM crm_contact WHERE contact_id=${first.contactId} AND tenant_id=100000;`)),
    } }), '真实变更财务门户联系人状态');
    const disabledTicket = await access(receivable, receivable.file);
    await contactState('INACTIVE');
    try { for (const record of records) denied(await call(record, `/${record.id}`), 401, '真实停用联系人立即撤销财务会话'); denied(await content(disabledTicket), 401, '联系人停用使旧文件凭据失效'); }
    finally { await contactState('ACTIVE'); }
    denied(await call(receivable, `/${receivable.id}`), 401, '重新启用联系人不恢复旧会话');
    const newToken = await login(first); check('重新登录核对联系人新版本后恢复财务读取', (await detail(receivable, newToken)).recordId === receivable.id);
    const files = [];
    const collect = async folder => {
      for (const entry of await fs.readdir(folder, { withFileTypes: true })) {
        if (entry.isSymbolicLink()) continue;
        const filename = path.join(folder, entry.name);
        if (entry.isDirectory()) await collect(filename); else if (entry.name.endsWith('.log')) files.push(filename);
      }
    };
    for (const service of state.services) await collect(path.join(directory, service.name));
    const sensitive = [...new Set(secrets)]; let bytes = 0; let leaks = 0;
    for (const filename of files) { const result = await scanSecretStream(createReadStream(filename), sensitive); bytes += result.bytes; leaks += result.leaks; }
    const databaseScan = await scanOwnedAccessLogs(state, sensitive);
    const allServicesScan = await scanOwnedAuditLogs(state, sensitive, context.auditBoundaries);
    const auditText = database(`SELECT CONCAT_WS('|',before_val,after_val,before_json,after_json,diff_json) FROM sys_audit_log WHERE audit_id>${auditStart};`);
    check('运行日志、全部服务访问和错误日志及业务审计不泄漏密码与会话和文件凭据', files.length > 0 && leaks === 0 && databaseScan.leaks === 0
      && allServicesScan.leaks === 0 && sensitive.every(value => !auditText.includes(value)));
    console.log(`H3_PORTAL_FINANCE_LOG_SCAN: files=${files.length}; bytes=${bytes}; sensitive_values=${sensitive.length}; leaks=${leaks}; database_bytes=${databaseScan.bytes + allServicesScan.bytes}; database_leaks=${databaseScan.leaks + allServicesScan.leaks}; all_service_audit_tables=3; production_modified=false`);
  } finally {
    check('财务验证未改变任何角色授权', database('SELECT tenant_id,role_id,menu_id FROM sys_role_menu ORDER BY tenant_id,role_id,menu_id;') === grants);
    await finance.context().close();
  }
}
