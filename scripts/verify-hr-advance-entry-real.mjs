import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

export async function verifyHrAdvanceEntry(context) {
  const { admin, api, successful, session, database, check, caseTag, directory, evidence } = context;
  const root = '/hr/advance';
  const key = () => randomUUID().replaceAll('-', '');
  const pause = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
  const literal = value => `CONVERT(UNHEX('${Buffer.from(String(value)).toString('hex')}') USING utf8mb4)`;
  const rows = statement => database(statement).split(/\r?\n/).filter(Boolean).map(value => JSON.parse(value));
  const read = async (actor, endpoint) => successful(await api(actor, `${root}${endpoint}`), `读取借款${endpoint}`);
  const post = (actor, endpoint, body) => api(actor, `${root}${endpoint}`, { method: 'POST', body });
  const create = (actor, body, requestKey = key()) => api(actor, root, { method: 'POST', headers: { 'Idempotency-Key': requestKey }, body });
  const rejected = (result, label, statuses, code) => check(`${label} HTTP=${result.status} code=${result.body?.code}`,
    statuses.includes(result.status) && result.body?.code !== undefined && result.body.code !== 200 && (!code || result.body.code === code));
  const grantsSql = "SELECT CONCAT(tenant_id,':',role_id,':',menu_id) FROM sys_role_menu ORDER BY tenant_id,role_id,menu_id;";
  const grantsBefore = database(grantsSql);
  const createPerson = (suffix, roleId) => {
    const username = `h2entry_${suffix}_${caseTag}`;
    database(`INSERT INTO sys_user (tenant_id,dept_id,user_name,nick_name,password,status,deleted,pwd_reset_required,create_by,create_time)
      SELECT 100000,100,${literal(username)},${literal(username)},password,'0',0,'0','advance-entry-fixture',NOW()
      FROM sys_user WHERE tenant_id=100000 AND user_name='g_holiday_employee';`);
    const userId = database(`SELECT user_id FROM sys_user WHERE tenant_id=100000 AND user_name=${literal(username)};`);
    assert.match(userId, /^[1-9]\d*$/);
    database(`INSERT INTO sys_user_role (tenant_id,user_id,role_id) VALUES (100000,${userId},${roleId});
      INSERT INTO hr_employee (tenant_id,employee_no,name,gender,dept_id,employee_status,hire_date,user_id,deleted)
      VALUES (100000,${literal(username)},${literal(username)},'UNKNOWN',100,'REGULAR','2020-01-01',${userId},0);`);
    const employeeId = database(`SELECT id FROM hr_employee WHERE tenant_id=100000 AND user_id=${userId};`);
    return { username, userId, employeeId };
  };
  const person = createPerson('employee', 5);
  const otherPerson = createPerson('peer', 5);
  const financier = createPerson('finance', 3);
  const secondFinancier = createPerson('reviewer', 3);
  const hrPerson = createPerson('hr', 4);
  const employee = await session(person.username, 'g_holiday_employee');
  const peer = await session(otherPerson.username, 'g_holiday_employee');
  const finance = await session(financier.username, 'g_holiday_employee');
  const otherFinance = await session(secondFinancier.username, 'g_holiday_employee');
  const today = database('SELECT DATE_FORMAT(CURDATE(),\'%Y-%m-%d\');');
  const month = today.slice(0, 7);
  const draft = { amount: '100.00', purpose: `真实草稿_${caseTag}`, repayMode: 'LUMP_SUM' };
  const plan = { ...draft, purpose: `真实分期_${caseTag}`, repayMode: 'SALARY_DEDUCT', repayStartMonth: month, repayMonths: 3, monthlyDeductAmount: '40.00' };
  rejected(await api(employee, `${root}/list`), '员工不能使用借款管理列表', [403], 403);
  for (const injected of [{ employeeId: otherPerson.employeeId }, { tenantId: 100001 }, { status: 'PAID' }, { outstandingAmount: '100' }, { ruleSnapshot: {} }, { paidTime: today }]) {
    rejected(await create(employee, { ...draft, ...injected }), `拒绝客户端改写${Object.keys(injected)[0]}`, [400]);
  }
  rejected(await create(employee, { ...draft, amount: '1.001' }), '拒绝三位小数金额', [400]);
  rejected(await create(employee, { ...plan, repayMonths: 2 }), '拒绝无法覆盖本金的分期', [400]);
  rejected(await create(employee, { ...draft, repayMonths: 1 }), '一次性归还拒绝遗留分期字段', [400]);
  const draftKey = key();
  const draftId = String(successful(await create(employee, plan, draftKey), '真实员工创建分期草稿'));
  const initial = (await read(employee, `/mine/${draftId}`)).advance;
  check('本人草稿仅记录计划且没有本金余额和放款', initial.status === 'APPLYING' && initial.approvalStatus === 'DRAFT'
    && initial.amount === '100.00' && initial.outstandingAmount === '0.00' && initial.reservedAmount === '0.00' && !initial.paidTime
    && String(initial.employeeId) === person.employeeId);
  check('本人详情不泄露规则快照或付款来源', !('ruleSnapshot' in initial) && !('paymentRequestId' in initial) && !('createBy' in initial));
  await pause(5100);
  check('跨重复提交窗口重放创建仍返回原借款', String(successful(await create(employee, plan, draftKey), '重放草稿')) === draftId);
  rejected(await create(employee, { ...plan, amount: '99.00' }, draftKey), '同一创建标识不得更换内容', [409], 'ADVANCE_CREATE_CONFLICT');
  rejected(await api(peer, `${root}/mine/${draftId}`), '其他员工不能读取本人草稿', [403], 'FORBIDDEN');
  rejected(await api(peer, `${root}/${draftId}`, { method: 'PUT', body: { ...draft, version: initial.version } }), '其他员工不能修改本人草稿', [403], 'FORBIDDEN');
  successful(await api(employee, `${root}/${draftId}`, { method: 'PUT', body: { ...draft, version: initial.version } }), '分期草稿切换一次性归还');
  const edited = (await read(employee, `/mine/${draftId}`)).advance;
  check('改为一次性归还后数据库三项分期列全部置空', edited.repayMode === 'LUMP_SUM' && edited.repayStartMonth == null && edited.repayMonths == null && edited.monthlyDeductAmount == null
    && database(`SELECT COUNT(*) FROM hr_employee_advance WHERE advance_id=${draftId} AND repay_start_month IS NULL AND repay_months IS NULL AND monthly_deduct_amount IS NULL;`) === '1');
  rejected(await api(employee, `${root}/${draftId}`, { method: 'PUT', body: { ...draft, purpose: '旧版本不得覆盖', version: initial.version } }), '旧版本修改被拒绝', [409], 'VERSION_CONFLICT');
  check('本人列表忽略其他员工筛选并只返回本人', (await read(employee, `/mine?employeeId=${otherPerson.employeeId}`)).rows.every(record => String(record.employeeId) === person.employeeId));
  rejected(await api(employee, `${root}/mine?pageSize=101`), '分页上限在服务器校验', [400]);
  check('提交权限和菜单均未提前开放', database("SELECT COUNT(*) FROM sys_menu WHERE menu_id=1873 OR perms='hr:advance:submit';") === '0');
  const raceKey = key();
  const racePlan = { ...draft, purpose: `并发草稿_${caseTag}` };
  const creationRace = await Promise.all([create(employee, racePlan, raceKey), create(employee, racePlan, raceKey)]);
  check('并发创建至少一次成功且只产生一条草稿和一条创建审计', creationRace.some(result => result.status === 200 && result.body?.code === 200)
    && database(`SELECT COUNT(*) FROM hr_employee_advance WHERE tenant_id=100000 AND employee_id=${person.employeeId} AND purpose=${literal(racePlan.purpose)};`) === '1'
    && database(`SELECT COUNT(*) FROM hr_audit_log audit JOIN hr_employee_advance advance ON advance.advance_id=audit.business_id AND advance.tenant_id=audit.tenant_id
      WHERE advance.purpose=${literal(racePlan.purpose)} AND audit.business_domain='HR_ADVANCE' AND audit.operation_type='CREATE';`) === '1');
  evidence.drafts = true;
  const fund = (identity, suffix, principal) => {
    const advanceNo = `fund_${suffix}_${caseTag}`;
    const source = 2000000000000 + Number(identity.employeeId) * 100 + suffix;
    database(`INSERT INTO hr_employee_advance (tenant_id,advance_no,employee_id,advance_amount,purpose,apply_date,repay_mode,
      repaid_amount,outstanding_amount,reserved_amount,written_off_amount,status,approval_status,payment_request_id,paid_time)
      VALUES (100000,${literal(advanceNo)},${identity.employeeId},${principal},'仅隔离前置放款，未验收OA支付','2026-06-01','LUMP_SUM',
      0,${principal},0,0,'PAID','APPROVED',${source},'2026-06-01 10:00:00');`);
    return database(`SELECT advance_id FROM hr_employee_advance WHERE tenant_id=100000 AND advance_no=${literal(advanceNo)};`);
  };
  const advanceId = fund(person, 1, '100.00');
  const peerAdvance = fund(otherPerson, 2, '100.00');
  const ownFinance = fund(financier, 3, '100.00');
  const hr = await session(hrPerson.username, 'g_holiday_employee');
  const current = async identifier => (await read(finance, `/${identifier}`)).advance;
  check('HR可查询授权借款，但没有财务办理按钮', !(await read(hr, `/${advanceId}`)).canRepay && !(await read(hr, `/${advanceId}`)).canWriteoff);
  check('财务不能办理本人借款', !(await read(finance, `/${ownFinance}`)).canRepay && !(await read(finance, `/${ownFinance}`)).canWriteoff);
  rejected(await api(employee, `${root}/${advanceId}`, { method: 'PUT', body: { ...draft, version: 0 } }), '已经放款的借款不允许改成草稿', [409], 'ADVANCE_DRAFT_REQUIRED');
  const proofBytes = Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n');
  const proofHash = createHash('sha256').update(proofBytes).digest('hex');
  const proofFile = suffix => ({ name: `到账凭据_${suffix}_${caseTag}.pdf`, type: 'application/pdf', content: proofBytes.toString('base64') });
  const uploadTimes = new WeakMap();
  const upload = async (actor, identifier, suffix, file = proofFile(suffix)) => {
    const times = uploadTimes.get(actor) || new Map();
    const remaining = (times.get(String(identifier)) || 0) + 5100 - Date.now();
    if (remaining > 0) await pause(remaining);
    const result = await api(actor, `${root}/${identifier}/proof`, { method: 'POST', file });
    times.set(String(identifier), Date.now());
    uploadTimes.set(actor, times);
    return result;
  };
  const repayment = (fileId, amount = '30.00', version = 0) => ({ amount, version, sourceEventKey: key(), proofFileId: String(fileId), repayDate: today, remark: `内部财务说明_${caseTag}` });
  const writeoff = (amount, version = 0) => ({ amount, version, sourceEventKey: key(), reason: `经核实的核销原因_${caseTag}`, confirmed: true });
  for (const [actor, label] of [[employee, '普通员工'], [hr, 'HR']]) {
    rejected(await upload(actor, advanceId, label), `${label}不能上传财务凭据`, [403], 403);
    rejected(await post(actor, `/${advanceId}/repayment`, repayment(1)), `${label}不能登记财务还款`, [403], 403);
    rejected(await post(actor, `/${advanceId}/writeoff`, writeoff('1.00')), `${label}不能核销本金`, [403], 403);
  }
  rejected(await upload(finance, ownFinance, 'self'), '财务不能上传本人借款的还款凭据', [403], 'FORBIDDEN');
  rejected(await post(finance, `/${ownFinance}/repayment`, repayment(1)), '财务不能为本人登记还款', [403], 'FORBIDDEN');
  rejected(await post(finance, `/${ownFinance}/writeoff`, writeoff('1.00')), '财务不能核销本人借款', [403], 'FORBIDDEN');
  rejected(await upload(finance, draftId, 'unfunded'), '未放款草稿不能上传到账凭据', [409], 'ADVANCE_NOT_FUNDED');
  rejected(await post(finance, `/${draftId}/writeoff`, writeoff('1.00', edited.version)), '未放款草稿不能核销', [409], 'ADVANCE_NOT_FUNDED');
  rejected(await upload(finance, advanceId, 'fake', { ...proofFile('fake'), content: Buffer.from('not a PDF').toString('base64') }), '拒绝伪造PDF内容', [400], 'INVALID_PARAMETER');
  rejected(await upload(finance, advanceId, 'unsafe', { name: `unsafe_${caseTag}.svg`, type: 'image/svg+xml', content: Buffer.from('<svg/>').toString('base64') }), '拒绝可执行图片附件', [400], 'INVALID_PARAMETER');
  const proof = successful(await upload(finance, advanceId, 'first'), '真实上传私有凭据');
  const metadata = rows(`SELECT JSON_OBJECT('path',file_path,'access',access_type,'url',url,'purpose',file_type,'business',biz_type,'owner',biz_id,'hash',file_hash)
    FROM sys_file WHERE tenant_id=100000 AND file_id=${proof.fileId};`)[0];
  check('凭据元数据绑定借款、私有访问及真实摘要', metadata.access === 'PRIVATE' && metadata.url === '' && metadata.purpose === 'HR_ADVANCE_PROOF'
    && metadata.business === 'HR_ADVANCE_PROOF' && String(metadata.owner) === advanceId && metadata.hash === proofHash);
  const privateDownload = await api(finance, `${root}/${advanceId}/proof/${proof.fileId}`);
  console.log(`H2_ADVANCE_PROOF_DOWNLOAD: ${JSON.stringify({ status: privateDownload.status, size: privateDownload.size,
    expectedSize: proofBytes.length, hashMatches: privateDownload.sha256 === proofHash, contentType: privateDownload.contentType,
    disposition: privateDownload.disposition, cacheControl: privateDownload.cacheControl, nosniff: privateDownload.nosniff, csp: privateDownload.csp })}`);
  check('上传财务可读取原始字节且强制附件、禁止缓存和执行', privateDownload.status === 200 && privateDownload.size === proofBytes.length
    && privateDownload.sha256 === proofHash && privateDownload.disposition?.startsWith('attachment;')
    && (privateDownload.contentType || '').split(';', 1)[0].trim().toLowerCase() === 'application/pdf'
    && privateDownload.cacheControl === 'no-store' && privateDownload.nosniff === 'nosniff' && privateDownload.csp === "default-src 'none'; sandbox");
  const clientDownload = await finance.evaluate(async ({ advanceId, fileId }) => {
    const { hrAdvanceApi } = await import('/src/services/api/hr/advances.ts');
    const proof = await hrAdvanceApi.downloadProof(advanceId, fileId);
    const digest = await crypto.subtle.digest('SHA-256', await proof.arrayBuffer());
    return { type: proof.type, size: proof.size, hash: Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, '0')).join('') };
  }, { advanceId, fileId: String(proof.fileId) });
  check('真实前端下载兼容编码参数并保留PDF类型和原始内容', clientDownload.type === 'application/pdf'
    && clientDownload.size === proofBytes.length && clientDownload.hash === proofHash);
  for (const [actor, label] of [[employee, '借款本人'], [otherFinance, '另一财务'], [admin, '管理员']]) {
    rejected(await api(actor, `${root}/${advanceId}/proof/${proof.fileId}`), `未入账凭据不向${label}开放`, [403], 'FORBIDDEN');
  }
  const commonFiles = successful(await api(admin, `/auth/system/file/list?pageNum=1&pageSize=100&fileName=${encodeURIComponent(proof.fileName)}`), '通用文件列表');
  check('通用文件列表排除借款私有凭据', !commonFiles.rows.some(record => String(record.fileId) === String(proof.fileId)));
  rejected(await api(admin, `/auth/system/file/${proof.fileId}/content`), '管理员也不能绕过业务入口下载私有凭据', [400, 403]);
  rejected(await api(admin, `/auth/system/file/${proof.fileId}`, { method: 'DELETE' }), '通用文件删除不能破坏还款凭据', [400, 403]);
  const firstPayment = repayment(proof.fileId);
  rejected(await post(otherFinance, `/${advanceId}/repayment`, firstPayment), '不能使用其他财务的凭据入账', [403], 'FORBIDDEN');
  rejected(await post(finance, `/${peerAdvance}/repayment`, { ...firstPayment, sourceEventKey: key() }), '不能跨借款挪用凭据', [403], 'FORBIDDEN');
  const realFilePath = await fs.realpath(metadata.path);
  const realDirectory = await fs.realpath(directory);
  assert.ok(realFilePath.startsWith(realDirectory + path.sep), 'Only owned isolated HR proof may be modified');
  const originalBytes = await fs.readFile(realFilePath);
  try {
    const changedBytes = Buffer.from(originalBytes); changedBytes[changedBytes.length - 2] ^= 1;
    await fs.writeFile(realFilePath, changedBytes);
    rejected(await post(finance, `/${advanceId}/repayment`, { ...firstPayment, sourceEventKey: key() }), '磁盘凭据字节被改动时拒绝入账', [409], 'ADVANCE_PROOF_CHANGED');
  } finally { await fs.writeFile(realFilePath, originalBytes); }
  const repaymentId = String(successful(await post(finance, `/${advanceId}/repayment`, firstPayment), '真实登记30元还款'));
  check('真实还款更新本金且保留唯一流水', (await current(advanceId)).outstandingAmount === '70.00'
    && (await current(advanceId)).repaidAmount === '30.00'
    && database(`SELECT COUNT(*) FROM hr_advance_repayment WHERE advance_id=${advanceId} AND repayment_id=${repaymentId} AND repay_amount=30 AND status='POSTED';`) === '1');
  await pause(5100);
  check('同笔实际还款在重复提交窗口外仍只入账一次', String(successful(await post(finance, `/${advanceId}/repayment`, firstPayment), '重放真实还款')) === repaymentId);
  rejected(await post(finance, `/${advanceId}/repayment`, { ...firstPayment, sourceEventKey: key(), version: 1 }), '同凭据不能作为第二笔到账', [409], 'ADVANCE_PROOF_ALREADY_USED');
  rejected(await post(finance, `/${advanceId}/repayment`, { ...firstPayment, amount: '31.00' }), '同笔还款不能更换金额', [409], 'ADVANCE_SOURCE_CONFLICT');
  for (const [actor, label] of [[employee, '本人'], [hr, '有权HR']]) {
    const downloaded = await api(actor, `${root}/${advanceId}/proof/${proof.fileId}`);
    check(`已入账凭据允许${label}从业务入口读取`, downloaded.status === 200 && downloaded.sha256 === proofHash);
  }
  rejected(await api(peer, `${root}/${advanceId}/proof/${proof.fileId}`), '其他员工不能读取已入账凭据', [403]);
  const ownEntries = await read(employee, `/mine/${advanceId}/repayments?pageNum=1&pageSize=1`);
  check('本人流水分页且不泄露内部说明或请求来源', ownEntries.total === 1 && ownEntries.rows.length === 1
    && !ownEntries.rows[0].remark && !ownEntries.rows[0].sourceEventKey && ownEntries.rows[0].amount === '30.00');
  evidence.proofs = true; evidence.repayments = true; evidence.permissions = true;
  const auditFault = `h2_entry_audit_${caseTag}`;
  const faultLoan = fund(person, 4, '50.00');
  const faultProof = successful(await upload(finance, faultLoan, 'rollback'), '准备回滚验证凭据');
  const faultInput = repayment(faultProof.fileId, '10.00');
  database(`DELIMITER $$
    CREATE TRIGGER ${auditFault} BEFORE INSERT ON hr_audit_log FOR EACH ROW
    BEGIN IF NEW.tenant_id=100000 AND NEW.business_domain='HR_ADVANCE' AND NEW.business_id=${faultLoan}
      AND NEW.operation_type='MANUAL_POST' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='H2_ENTRY_AUDIT_FAULT'; END IF; END$$
    DELIMITER ;`);
  try {
    rejected(await post(finance, `/${faultLoan}/repayment`, faultInput), '不可变审计写入失败阻止还款', [500]);
    check('审计故障回滚借款余额和全部还款记录', (await current(faultLoan)).outstandingAmount === '50.00'
      && database(`SELECT COUNT(*) FROM hr_advance_repayment WHERE advance_id=${faultLoan};`) === '0');
  } finally { database(`DROP TRIGGER ${auditFault};`); }
  await pause(5100);
  successful(await post(finance, `/${faultLoan}/repayment`, faultInput), '故障恢复后使用原标识重新入账');
  const proofDirectory = path.dirname(realFilePath);
  const proofFilesBefore = (await fs.readdir(proofDirectory)).sort();
  database(`DELIMITER $$
    CREATE TRIGGER ${auditFault} BEFORE INSERT ON hr_audit_log FOR EACH ROW
    BEGIN IF NEW.tenant_id=100000 AND NEW.business_domain='HR_ADVANCE' AND NEW.business_id=${faultLoan}
      AND NEW.operation_type LIKE 'PROOF_UPLOAD:%' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='H2_ENTRY_UPLOAD_AUDIT_FAULT'; END IF; END$$
    DELIMITER ;`);
  try {
    rejected(await upload(finance, faultLoan, 'failed_upload'), '凭据上传审计失败阻止保存', [500]);
    check('失败上传同时回滚文件元数据和物理文件', database(`SELECT COUNT(*) FROM sys_file WHERE tenant_id=100000 AND file_name=${literal(proofFile('failed_upload').name)};`) === '0'
      && JSON.stringify((await fs.readdir(proofDirectory)).sort()) === JSON.stringify(proofFilesBefore));
  } finally { database(`DROP TRIGGER ${auditFault};`); }
  evidence.rollback = true;
  const remaining = await current(advanceId);
  rejected(await post(finance, `/${advanceId}/writeoff`, { ...writeoff('70.00', remaining.version), confirmed: false }), '核销必须再次确认', [400]);
  const writtenOff = writeoff('70.00', remaining.version);
  successful(await post(finance, `/${advanceId}/writeoff`, writtenOff), '财务核销剩余70元');
  const afterWriteoff = await current(advanceId);
  check('核销与还款分开记账且不伪造还款流水', afterWriteoff.status === 'WRITTEN_OFF' && afterWriteoff.outstandingAmount === '0.00'
    && afterWriteoff.writtenOffAmount === '70.00' && afterWriteoff.repaidAmount === '30.00'
    && database(`SELECT COUNT(*) FROM hr_advance_repayment WHERE advance_id=${advanceId};`) === '1');
  await pause(5100);
  successful(await post(finance, `/${advanceId}/writeoff`, writtenOff), '原标识重放核销');
  check('核销重试不重复追加审计', database(`SELECT COUNT(*) FROM hr_audit_log WHERE tenant_id=100000 AND business_domain='HR_ADVANCE' AND business_id=${advanceId}
    AND operation_type=${literal(`WO:${writtenOff.sourceEventKey}`)};`) === '1');
  check('核销后原实际还款仍能按原标识重放', String(successful(await post(finance, `/${advanceId}/repayment`, firstPayment), '终态原还款重放')) === repaymentId);
  evidence.writeoff = true;
  const raceLoan = fund(person, 5, '100.00');
  const raceProof = successful(await upload(finance, raceLoan, 'race'), '并发还款凭据');
  const financeRace = await Promise.all([post(finance, `/${raceLoan}/repayment`, repayment(raceProof.fileId, '60.00')),
    post(otherFinance, `/${raceLoan}/writeoff`, writeoff('100.00'))]);
  check('并发财务操作只允许同一版本的一项成功', financeRace.filter(result => result.status === 200 && result.body?.code === 200).length === 1
    && financeRace.some(result => result.status === 409 && result.body?.code === 'VERSION_CONFLICT'));
  const raceBalance = await current(raceLoan);
  check('并发后本金守恒且不会超收', Number(raceBalance.repaidAmount) + Number(raceBalance.outstandingAmount) + Number(raceBalance.writtenOffAmount) === 100
    && ['40.00', '0.00'].includes(raceBalance.outstandingAmount));
  evidence.concurrency = true;
  const foreignRole = database("SELECT role_id FROM sys_user_role WHERE user_id=990000703 AND tenant_id=100001 ORDER BY role_id LIMIT 1;");
  assert.match(foreignRole, /^[1-9]\d*$/);
  assert.equal(database(`SELECT COUNT(*) FROM sys_role_menu WHERE tenant_id=100001 AND role_id=${foreignRole} AND menu_id IN (1871,1872,1874,1875,1876);`), '0');
  try {
    database(`INSERT INTO sys_role_menu (tenant_id,role_id,menu_id) SELECT 100001,${foreignRole},menu_id FROM sys_menu WHERE menu_id IN (1871,1872,1874,1875,1876);`);
    const foreign = await session('g_import_tenant');
    check('有相同菜单权限的另一租户仍看不到当前借款', (await read(foreign, '/list')).rows.every(record => ![draftId, advanceId, peerAdvance].includes(String(record.advanceId))));
    rejected(await api(foreign, `${root}/${advanceId}`), '另一租户不能直接读取借款详情', [404], 'ADVANCE_NOT_FOUND');
    rejected(await post(foreign, `/${peerAdvance}/repayment`, repayment(proof.fileId, '1.00')), '另一租户不能操作借款本金', [404], 'ADVANCE_NOT_FOUND');
    rejected(await api(foreign, `${root}/${advanceId}/proof/${proof.fileId}`), '另一租户不能读取凭据', [404], 'ADVANCE_NOT_FOUND');
  } finally {
    database(`DELETE FROM sys_role_menu WHERE tenant_id=100001 AND role_id=${foreignRole} AND menu_id IN (1871,1872,1874,1875,1876);`);
  }
  check('双租户权限测试后全部角色授权逐行恢复', database(grantsSql) === grantsBefore);
  evidence.tenants = true;
  if (!process.argv.includes('--hr-advance-entry-http-only')) {
    const { verifyHrAdvanceEntryUi } = await import('./verify-hr-advance-entry-ui.mjs');
    await verifyHrAdvanceEntryUi({ ...context, employee, finance, person, fund, proofBytes, read, current, key });
  }
}
