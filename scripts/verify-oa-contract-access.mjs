import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { scanOwnedAuditLogs, scanSecretStream } from './portal-checks/scan-access-logs.mjs';

export async function verifyOaContractAccess({ admin, api, successful, session, database, check, caseTag, state, accounts, evidence }) {
  const marker = `f4_access_${caseTag}`;
  const sql = value => `CONVERT(0x${Buffer.from(String(value)).toString('hex')} USING utf8mb4)`;
  const id = query => { const value = database(query); assert.match(value, /^[1-9][0-9]*$/); return value; };
  const owner = id("SELECT user_id FROM sys_user WHERE tenant_id=100000 AND user_name='g_import_admin' AND deleted=0;");
  const peerId = id("SELECT user_id FROM sys_user WHERE tenant_id=100000 AND user_name='g_import_other' AND deleted=0;");
  const grants = () => database('SELECT tenant_id,role_id,menu_id FROM sys_role_menu ORDER BY tenant_id,role_id,menu_id;');
  const originalGrants = grants();
  const secrets = new Set(accounts.map(account => account.password).filter(Boolean));
  const remember = async page => {
    const token = await page.evaluate(async () => (await import('/src/utils/authStorage.ts')).getAuthToken());
    assert.ok(token); secrets.add(token.replace(/^Bearer /, '')); return page;
  };
  await remember(admin);
  const peer = await remember(await session('g_import_other'));
  const foreign = await remember(await session('g_import_tenant'));
  const employee = await remember(await session('g_holiday_employee'));
  const permissionRows = database(`SELECT CONCAT(perms,':',menu_id) FROM sys_menu
    WHERE perms IN ('system:auth:info','system:auth:router','oa:contract:list') AND status='0' ORDER BY menu_id;`).split(/\r?\n/);
  assert.equal(permissionRows.length, 3);
  const menuIds = permissionRows.map(value => value.slice(value.lastIndexOf(':') + 1));
  assert.ok(menuIds.every(value => /^[1-9][0-9]*$/.test(value)));
  const readMenuId = permissionRows.find(value => value.startsWith('oa:contract:list:')).split(':').at(-1);
  let roleId; let personId; let failure;
  const errorObservations = [];
  const roleUpdate = async selection => {
    const role = successful(await api(admin, `/auth/system/role/${roleId}`), '读取本轮专用角色');
    successful(await api(admin, '/auth/system/role', { method: 'PUT', body: { ...role, menuIds: selection } }), '更新本轮专用角色权限');
  };
  const downloaded = (response, bytes) => response.status === 200 && response.size === bytes.length
    && response.sha256 === createHash('sha256').update(bytes).digest('hex');
  const observeDenied = (label, response, codes) => {
    errorObservations.push({ label, status: response.status, code: response.body?.code ?? null,
      passed: codes.includes(response.status) && response.body?.code === response.status && !response.body?.data && response.size == null
        && (response.status !== 404 || response.body?.msg === '记录不存在或无权访问') });
  };
  try {
    assert.equal(database(`SELECT COUNT(*) FROM sys_role WHERE tenant_id=100000 AND role_key=${sql(marker)};`), '0');
    roleId = id(`INSERT INTO sys_role (tenant_id,role_name,role_key,role_sort,data_scope,ds_type,status,deleted)
      VALUES (100000,${sql(marker)},${sql(marker)},999,'2',4,'0',0); SELECT LAST_INSERT_ID();`);
    database(`INSERT INTO sys_role_menu (tenant_id,role_id,menu_id) SELECT 100000,${roleId},menu_id FROM sys_menu WHERE menu_id IN (${menuIds.join(',')});`);
    personId = id(`INSERT INTO sys_user (tenant_id,dept_id,user_name,nick_name,password,status,deleted,pwd_reset_required,create_by,create_time)
      SELECT tenant_id,dept_id,${sql(marker)},${sql(marker)},password,'0',0,'0',${sql(marker)},NOW()
      FROM sys_user WHERE tenant_id=100000 AND user_name='g_holiday_employee' AND deleted=0; SELECT LAST_INSERT_ID();`);
    database(`INSERT INTO sys_user_role (tenant_id,user_id,role_id) VALUES (100000,${personId},${roleId});`);
    const actor = await remember(await session(marker, 'g_holiday_employee'));
    const today = database("SELECT DATE_FORMAT(CURRENT_DATE,'%Y-%m-%d');");
    const contract = String(successful(await api(admin, '/oa/contract', { method: 'POST', body: {
      contractNo: marker, contractName: marker, counterpartyName: marker, contractType: 'SERVICE',
      amount: '0.00', currency: 'CNY', startDate: today, requiresFulfilmentFlag: 1,
    } }), '真实创建附件权限核对合同'));
    assert.match(contract, /^[1-9][0-9]*$/);
    const assigned = [];
    for (const [index, responsibleId] of [peerId, owner, personId].entries()) {
      const termId = String(successful(await api(admin, '/oa/contract/terms', { method: 'POST', body: {
        contractId: contract, termNo: index + 1, termCategory: 'SERVICE', termContent: `${marker}_${index}`,
        requirement: '提交履约文件', responsibleParty: 'OUR', responsibleId,
      } }), '真实建立不同责任人的条款'));
      assert.match(termId, /^[1-9][0-9]*$/);
      assigned.push(termId);
    }
    check('三条义务分别关联同租户真实责任人', database(`SELECT COUNT(DISTINCT responsible_id) FROM oa_contract_fulfilment_term
      WHERE tenant_id=100000 AND contract_id=${contract} AND deleted=0;`) === '3');
    const bytes = Buffer.from(`%PDF-1.4\n${marker}\n%%EOF\n`);
    const upload = async (page, term) => successful(await api(page, `/oa/contract/terms/${term}/evidence`, { method: 'POST', file: {
      name: `${marker}_${term}.pdf`, type: 'application/pdf', content: bytes.toString('base64'),
    } }), '真实上传履约文件');
    // The responsible person uploads and confirms the first term, the owner handles the other two.
    for (const [index, term] of assigned.entries()) {
      const operator = index === 0 ? peer : admin;
      const file = await upload(operator, term);
      successful(await api(operator, `/oa/contract/terms/${term}/confirm`, { method: 'POST', body: {
        fulfilledDate: today, evidenceFileUrl: file.reference, evidenceRemark: marker,
      } }), '真实履约并绑定本人上传文件');
    }
    check('指定责任人可实际上传和确认其义务', database(`SELECT fulfilled_by FROM oa_contract_fulfilment_term WHERE tenant_id=100000 AND term_id=${assigned[0]};`) === peerId);
    for (const term of assigned) check('合同负责人可读取合同内义务附件', downloaded(await api(admin, `/oa/contract/terms/${term}/evidence`), bytes));
    check('条款责任人可读取自己的附件', downloaded(await api(peer, `/oa/contract/terms/${assigned[0]}/evidence`), bytes));
    observeDenied('同租户有合同权限的其他负责人不能下载非本人条款附件', await api(peer, `/oa/contract/terms/${assigned[1]}/evidence`), [403]);
    observeDenied('普通员工不能下载内部履约附件', await api(employee, `/oa/contract/terms/${assigned[0]}/evidence`), [403]);
    observeDenied('跨租户附件读取明确404且不返回内容', await api(foreign, `/oa/contract/terms/${assigned[0]}/evidence`), [404]);
    const missingId = String(BigInt(database('SELECT COALESCE(MAX(term_id),0) FROM oa_contract_fulfilment_term;')) + 1000000n);
    observeDenied('不存在的条款附件明确404且不返回内容', await api(admin, `/oa/contract/terms/${missingId}/evidence`), [404]);
    const rejectedUpload = { method: 'POST', file: { name: `${marker}_rejected.pdf`, type: 'application/pdf', content: bytes.toString('base64') } };
    const fileCountBefore = database('SELECT COUNT(*) FROM sys_file;');
    observeDenied('跨租户上传明确404且不保存文件', await api(foreign, `/oa/contract/terms/${assigned[0]}/evidence`, rejectedUpload), [404]);
    observeDenied('不存在条款上传明确404且不保存文件', await api(admin, `/oa/contract/terms/${missingId}/evidence`, rejectedUpload), [404]);
    check('两种被拒绝上传均未产生文件记录', database('SELECT COUNT(*) FROM sys_file;') === fileCountBefore);
    check('专用只读责任人撤权前可逐字节读取附件', downloaded(await api(actor, `/oa/contract/terms/${assigned[2]}/evidence`), bytes));
    evidence.ownership = true;
    const before = database(`SELECT JSON_OBJECT('id',term_id,'version',version,'reference',evidence_file_url,'actor',fulfilled_by,'done',fulfilled_flag)
      FROM oa_contract_fulfilment_term WHERE tenant_id=100000 AND contract_id=${contract} ORDER BY term_id;`);
    await roleUpdate(menuIds.filter(value => value !== readMenuId));
    observeDenied('正式撤权后旧会话立即不能读取附件', await api(actor, `/oa/contract/terms/${assigned[2]}/evidence`), [401, 403]);
    const refreshed = await remember(await session(marker, 'g_holiday_employee'));
    observeDenied('撤权后重新登录仍不能读取本人负责的附件', await api(refreshed, `/oa/contract/terms/${assigned[2]}/evidence`), [403]);
    check('他人撤权后合同负责人仍可完整下载旧附件', downloaded(await api(admin, `/oa/contract/terms/${assigned[2]}/evidence`), bytes));
    check('所有拒绝与撤权未改动原履约事实和文件引用', database(`SELECT JSON_OBJECT('id',term_id,'version',version,'reference',evidence_file_url,'actor',fulfilled_by,'done',fulfilled_flag)
      FROM oa_contract_fulfilment_term WHERE tenant_id=100000 AND contract_id=${contract} ORDER BY term_id;`) === before);
    evidence.revocation = true;
  } catch (error) { failure = error; }
  finally {
    if (roleId) {
      // A distinct payload avoids the role endpoint's repeated-submit window.
      await roleUpdate([]);
      assert.equal(database(`SELECT COUNT(*) FROM sys_role_menu WHERE tenant_id=100000 AND role_id=${roleId};`), '0');
    }
    if (personId) database(`UPDATE sys_user SET status='1' WHERE tenant_id=100000 AND user_id=${personId} AND user_name=${sql(marker)} AND create_by=${sql(marker)};`);
    check('本轮专用账号已停用且原角色菜单授权恢复', grants() === originalGrants
      && (!personId || database(`SELECT status FROM sys_user WHERE tenant_id=100000 AND user_id=${personId} AND user_name=${sql(marker)};`) === '1'));
    evidence.restoration = true;
  }
  let files = 0; let bytes = 0; let leaks = 0;
  for (const service of state.services) {
    const root = path.join(state.run, service.name);
    const names = await fs.readdir(path.join(root, 'logs')).catch(error => { if (error.code === 'ENOENT') return []; throw error; });
    for (const filename of ['stdout.log', 'stderr.log', ...names.filter(name => name.endsWith('.log')).map(name => path.join('logs', name))]) {
      const scan = await scanSecretStream(createReadStream(path.join(root, filename)), [...secrets]); files++; bytes += scan.bytes; leaks += scan.leaks;
    }
  }
  const audit = await scanOwnedAuditLogs(state, [...secrets], { log: '0', error: '0', audit: '0' });
  check('附件权限核对六服务和数据库日志无凭据泄漏', leaks === 0 && audit.leaks === 0); evidence.secrets = true;
  console.log(`F4_CONTRACT_ACCESS_SECRET_SCAN: files=${files}; bytes=${bytes}; values=${secrets.size}; leaks=${leaks}; database_bytes=${audit.bytes}; database_leaks=${audit.leaks}`);
  console.log(`F4_CONTRACT_ACCESS_DENIALS: ${JSON.stringify(errorObservations)}`);
  console.log('F4_CONTRACT_ACCESS_SCOPE: real_upload_confirmation_read_and_role_revocation=true; isolated_role_and_user=true; records_files_audits_retained=true; production_modified=false');
  if (failure) throw failure;
  for (const observation of errorObservations) check(observation.label, observation.passed);
  evidence.denials = true;
}
