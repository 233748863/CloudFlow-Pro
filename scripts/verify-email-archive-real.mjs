import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { ownedGatewayRedis } from './owned-gateway-redis.mjs';
import { verifyEmailArchiveInterface } from './verify-email-archive-ui.mjs';

export async function verifyEmailArchive({ admin, api, successful, session, database, check, directory, caseTag, state, evidence }) {
  const smtpDirectory = await fs.realpath(path.join(directory, 'private/smtp'));
  assert.equal(smtpDirectory, await fs.realpath(state.smtpFixture.directory));
  assert.equal(state.smtpFixture.loopback, true);
  const sql = value => value == null ? 'NULL' : `CONVERT(UNHEX('${Buffer.from(String(value)).toString('hex')}') USING utf8mb4)`;
  const json = statement => JSON.parse(database(statement));
  const waitFor = async (read, accepts, label, milliseconds = 60000) => {
    const deadline = Date.now() + milliseconds;
    do {
      const value = await read();
      if (accepts(value)) return value;
      await new Promise(resolve => setTimeout(resolve, 250));
    } while (Date.now() < deadline);
    throw new Error(label);
  };
  const rejected = (response, label, reason) => {
    const code = response.body?.code ?? response.status;
    check(`${label} HTTP=${response.status} code=${code}`, [400, 403, 404, 409, 413, 422, 429].includes(code)
      && (!reason || reason.test(response.body?.msg || response.body?.message || '')));
  };
  const snapshot = async () => JSON.parse(await fs.readFile(path.join(smtpDirectory, 'snapshot.json'), 'utf8'));
  const mode = async value => {
    await fs.writeFile(path.join(smtpDirectory, 'control.json'), JSON.stringify({ mode: value }));
    await waitFor(snapshot, current => current.mode === value, '隔离邮件协议模式未切换');
  };
  const settings = json("SELECT JSON_ARRAYAGG(JSON_OBJECT('id',config_id,'value',config_value)) FROM sys_config WHERE tenant_id=100000 AND config_scope='1' AND config_key LIKE 'crm.email.%';");
  const setting = (key, value) => database(`UPDATE sys_config SET config_value=${sql(value)} WHERE tenant_id=100000 AND config_scope='1' AND config_key=${sql(key)};`);
  const salesId = Number(database("SELECT user_id FROM sys_user WHERE tenant_id=100000 AND user_name='g_opportunity_sales';"));
  const managerId = Number(database("SELECT user_id FROM sys_user WHERE tenant_id=100000 AND user_name='g_opportunity_manager';"));
  const employeeBefore = database('SELECT menu_id FROM sys_role_menu WHERE tenant_id=100000 AND role_id=5 ORDER BY menu_id;');
  const foreignRole = Number(database("SELECT link.role_id FROM sys_user_role link JOIN sys_user account ON account.user_id=link.user_id AND account.tenant_id=link.tenant_id WHERE account.tenant_id=100001 AND account.user_name='g_import_tenant';"));
  assert.ok(Number.isSafeInteger(foreignRole) && foreignRole > 11);
  const temporaryGrants = database(`SELECT menu.menu_id FROM sys_menu menu WHERE menu.perms IN ('crm:email:list','crm:email:send','crm:email:archive','crm:customer:list','crm:opportunity:list','crm:quote:list','crm:ticket:list') AND NOT EXISTS(SELECT 1 FROM sys_role_menu grant_entry WHERE grant_entry.tenant_id=100001 AND grant_entry.role_id=${foreignRole} AND grant_entry.menu_id=menu.menu_id);`).split(/\r?\n/).filter(Boolean).map(Number);
  assert.ok(temporaryGrants.every(identifier => Number.isSafeInteger(identifier) && identifier > 0));
  let channelId;
  let anonymous;
  const secrets = [];
  const created = [];
  try {
    check('隔离库没有任何已启用的外部邮件渠道', database("SELECT COUNT(*) FROM sys_message_channel WHERE channel_type='EMAIL' AND status='ENABLED' AND deleted=0;") === '0');
    for (const menuId of temporaryGrants) database(`INSERT INTO sys_role_menu(role_id,menu_id,tenant_id) VALUES(${foreignRole},${menuId},100001);`);
    const sales = await session('g_opportunity_sales');
    const employee = await session('g_holiday_employee');
    const foreign = await session('g_import_tenant');
    const details = async (identifier, page = sales) => successful(await api(page, `/crm/email/${identifier}`), '读取真实邮件归档');
    const list = async (query, page = sales) => successful(await api(page, `/crm/email/list?${new URLSearchParams({ pageSize: '100', ...query })}`), '读取真实邮件列表');
    const request = (business, suffix, values = {}) => ({ requestKey: randomUUID(), bizType: business.type, bizId: business.id, contactId: business.contactId,
      templateCode: 'CRM_CUSTOMER_EMAIL', subject: `H3_MAIL_${caseTag}_${suffix}`, content: '<p>{{contactName}}：业务往来真实验收。</p>', fileIds: [], ...values });
    const createCustomer = async (suffix, ownerId) => {
      const name = `H3_MAIL_${caseTag}_${suffix}`;
      successful(await api(admin, '/crm/customer', { method: 'POST', body: { customerCode: name, customerName: name, ownerId } }), '真实HTTP创建邮件业务客户');
      return Number(database(`SELECT customer_id FROM crm_customer WHERE tenant_id=100000 AND customer_code=${sql(name)} AND deleted=0;`));
    };
    const createContact = async (customerId, suffix) => {
      const email = `${suffix}-${caseTag}@example.test`;
      successful(await api(admin, '/crm/contact', { method: 'POST', body: { customerId, contactName: `联系人${suffix}<&>`, email, status: 'ACTIVE' } }), '真实HTTP创建客户联系人');
      const identifier = database(`SELECT contact_id FROM crm_contact WHERE tenant_id=100000 AND customer_id=${customerId} AND deleted=0;`);
      assert.match(identifier, /^[1-9][0-9]*$/);
      const id = Number(identifier);
      check('联系人邮箱继续沿用现有数据库加密', database(`SELECT email FROM crm_contact WHERE tenant_id=100000 AND contact_id=${id};`) !== email);
      return { id, email };
    };
    const customerId = await createCustomer('customer', salesId);
    const otherCustomerId = await createCustomer('other', managerId);
    const contact = await createContact(customerId, 'main');
    const otherContact = await createContact(otherCustomerId, 'other');
    const customer = { type: 'CUSTOMER', id: customerId, contactId: contact.id };
    const businesses = [customer];
    for (const entry of [
      { type: 'OPPORTUNITY', resource: 'opportunity', table: 'crm_opportunity', id: 'opportunity_id', name: 'opportunity_name', body: { opportunityName: `H3_MAIL_${caseTag}_opportunity`, expectedAmount: '1000.00' } },
      { type: 'QUOTE', resource: 'quote', table: 'crm_quote', id: 'quote_id', name: 'quote_name', body: { quoteName: `H3_MAIL_${caseTag}_quote`, totalAmount: '1000.00', currency: 'CNY' } },
      { type: 'TICKET', resource: 'ticket', table: 'crm_service_ticket', id: 'ticket_id', name: 'ticket_title', body: { ticketTitle: `H3_MAIL_${caseTag}_ticket`, severity: 'P4' } },
    ]) {
      successful(await api(sales, `/crm/${entry.resource}`, { method: 'POST', body: { ...entry.body, customerId, ownerId: salesId } }), `真实HTTP创建${entry.type}邮件关联业务`);
      const identifier = Number(database(`SELECT ${entry.id} FROM ${entry.table} WHERE tenant_id=100000 AND ${entry.name}=${sql(Object.values(entry.body)[0])} AND deleted=0;`));
      assert.ok(Number.isSafeInteger(identifier) && identifier > 0);
      businesses.push({ type: entry.type, id: identifier, contactId: contact.id });
    }
    for (const menuId of [1909, 1910, 1911]) check(`邮件菜单${menuId}仅获批五角色可用`, database(`SELECT GROUP_CONCAT(role_id ORDER BY role_id) FROM sys_role_menu WHERE tenant_id=100000 AND menu_id=${menuId};`) === '1,8,9,10,11');
    check('邮件菜单严格处于H3批准段位且EMPLOYEE零授权', database('SELECT COUNT(*) FROM sys_role_menu WHERE tenant_id=100000 AND role_id=5 AND menu_id BETWEEN 1900 AND 1949;') === '0');
    const context = successful(await api(sales, `/crm/email/context?bizType=CUSTOMER&bizId=${customerId}`), '读取所属客户联系人');
    check('联系人仅来自当前客户且候选邮箱脱敏', context.contacts.length === 1 && Number(context.contacts[0].contactId) === contact.id && !JSON.stringify(context).includes(contact.email));
    const draftRequest = request(customer, 'unconfigured', { sendStatus: 'SENT', sendTime: '2000-01-01 00:00:00', messageRecordId: 1 });
    const unconfigured = successful(await api(sales, '/crm/email/send', { method: 'POST', body: draftRequest }), '未配置时保存未发送草稿');
    const retained = await details(unconfigured.emailId);
    created.push(unconfigured.emailId);
    check('无渠道时明确停用且没有伪造发送时间或消息编号', unconfigured.code === 'CHANNEL_NOT_CONFIGURED' && retained.sendStatus === 'DRAFT' && !retained.sendTime && !retained.messageRecordId);
    check('原发送人可恢复操作键，其他授权读者看不到操作键', retained.requestKey === draftRequest.requestKey && !(await details(unconfigured.emailId, admin)).requestKey);
    check('未配置发送不生成消息中心投递', database(`SELECT COUNT(*) FROM sys_message_record WHERE tenant_id=100000 AND biz_type='CRM_EMAIL_ARCHIVE' AND biz_id=${sql(unconfigured.emailId)};`) === '0');
    const missing = successful(await api(sales, '/crm/email/send', { method: 'POST', body: request(customer, 'missing-template', { templateCode: `missing_${caseTag}` }) }), '模板缺失保留草稿');
    check('模板缺失不丢失正文且明确未发送', missing.sendStatus === 'DRAFT' && missing.code === 'CHANNEL_NOT_CONFIGURED' && (await details(missing.emailId)).contentSummary.includes('业务往来真实验收'));
    for (const [route, options] of [
      ['/crm/email/list', {}], ['/crm/email/draft', { method: 'POST', body: request(customer, 'employee-draft') }],
      ['/crm/email/send', { method: 'POST', body: request(customer, 'employee-send') }], ['/crm/email/archive-inbound', { method: 'POST', body: request(customer, 'employee-inbound') }],
    ]) {
      const response = await api(employee, route, options);
      check(`EMPLOYEE拒绝${route}`, response.status === 403 && response.body?.code === 403);
    }
    rejected(await api(sales, `/crm/email/context?bizType=CUSTOMER&bizId=${otherCustomerId}`), '同租户无范围客户不可读取');
    rejected(await api(foreign, `/crm/email/${unconfigured.emailId}`), '跨租户即使具备邮件及业务权限也不可读取');
    rejected(await api(foreign, '/crm/email/draft', { method: 'POST', body: request(customer, 'foreign') }), '跨租户即使有发送权限也不可保存');
    check('跨租户列表不包含本租户任何邮件', (await list({ customerId: String(customerId) }, foreign)).total === 0);
    rejected(await api(admin, '/crm/email/draft', { method: 'POST', body: draftRequest }), '其他操作人不可占用已存在的操作唯一键');
    for (const [suffix, values] of [['other-contact', { contactId: otherContact.id }], ['spoof-from', { fromAddress: 'spoof@example.test' }], ['spoof-to', { toAddresses: ['intruder@example.test'] }], ['spoof-cc', { ccAddresses: ['intruder@example.test'] }], ['unknown-variable', { content: '<p>{{password}}</p>' }]]) {
      rejected(await api(sales, '/crm/email/draft', { method: 'POST', body: request(customer, suffix, values) }), `${suffix}由真实业务校验拒绝`);
    }
    evidence.permissions = true;
    const upload = (business, name, bytes, inbound = false, page = sales) => api(page,
      `/crm/email/attachments/${inbound ? 'inbound-upload' : 'upload'}?bizType=${business.type}&bizId=${business.id}`,
      { method: 'POST', file: { name, type: 'application/octet-stream', content: bytes.toString('base64') } });
    const pdfBytes = Buffer.from(`%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n${caseTag}`);
    const pdfHash = createHash('sha256').update(pdfBytes).digest('hex');
    const pdf = successful(await upload(customer, `archive-${caseTag}.pdf`, pdfBytes), '真实上传私有PDF附件');
    check('专用上传只返回内部文件编号且通用文件表没有公开地址', pdf.fileId > 0 && !JSON.stringify(pdf).includes('http') && database(`SELECT CONCAT(file_type,':',access_type,':',biz_type,':',biz_id,':',IFNULL(url,'')) FROM sys_file WHERE file_id=${pdf.fileId};`) === `CRM_EMAIL_ATTACHMENT:PRIVATE:CRM_EMAIL_ATTACHMENT:CUSTOMER:${customerId}:`);
    const adjacent = await Promise.all([`adjacent-a-${caseTag}.pdf`, `adjacent-b-${caseTag}.pdf`].map(name => upload(customer, name, pdfBytes)));
    check('同业务同时上传不同附件均成功且编号不同', adjacent.every(response => response.status === 200 && response.body?.code === 200)
      && new Set(adjacent.map(response => response.body.data.fileId)).size === 2);
    const duplicateUploads = await Promise.all(Array.from({ length: 2 }, () => upload(customer, `repeat-${caseTag}.pdf`, pdfBytes)));
    check('同业务相同附件并发仍只接纳一次', duplicateUploads.filter(response => response.status === 200 && response.body?.code === 200).length === 1
      && duplicateUploads.filter(response => response.status === 409 && response.body?.code === 409).length === 1);
    rejected(await upload(customer, `fake-${caseTag}.pdf`, Buffer.from('executable-not-pdf')), '伪造PDF文件头被拒绝', /邮件附件/);
    rejected(await upload(customer, `script-${caseTag}.svg`, Buffer.from('<svg onload="alert(1)"/>')), '主动内容附件类型被拒绝', /邮件附件/);
    rejected(await api(sales, '/crm/email/draft', { method: 'POST', body: request(businesses[1], 'cross-business-file', { fileIds: [pdf.fileId] }) }), '其他业务的私有附件不可混用');
    rejected(await api(admin, '/crm/email/draft', { method: 'POST', body: request(customer, 'other-uploader', { fileIds: [pdf.fileId] }) }), '其他上传人的附件不可用于新邮件');
    rejected(await api(sales, '/crm/email/draft', { method: 'POST', body: request(customer, 'duplicate-files', { fileIds: [pdf.fileId, pdf.fileId] }) }), '重复附件编号被拒绝');
    rejected(await api(sales, '/crm/email/draft', { method: 'POST', body: request(customer, 'eleven-files', { fileIds: Array.from({ length: 11 }, () => pdf.fileId) }) }), '超过十个附件被拒绝');
    const inboundIds = [];
    for (const business of businesses) {
      const inboundRequest = request(business, `inbound-${business.type}`, { fromAddress: contact.email, toAddresses: ['sender@example.com'], ccAddresses: ['copy@example.test'], remark: '隔离验收手工粘贴的原始客户来信',
        content: '<p>重要业务来信</p><script>alert(1)</script><img src="https://example.test/beacon"><a href="https://example.test/link">链接文字</a>' });
      const inbound = successful(await api(sales, '/crm/email/archive-inbound', { method: 'POST', body: inboundRequest }), `真实归档${business.type}客户来信`);
      const record = await details(inbound.emailId);
      inboundIds.push(inbound.emailId); created.push(inbound.emailId);
      check(`${business.type}来信为MANUAL且不生成发送事实`, record.sendStatus === 'MANUAL' && record.direction === 'INBOUND' && !record.sendTime && !record.messageRecordId && record.ccAddresses[0] === 'copy@example.test');
      check(`${business.type}归档正文移除脚本和外站请求`, !/(?:<script|href=|src=|https:\/\/)/i.test(record.sanitizedContent) && record.contentSummary.includes('重要业务来信'));
      check(`${business.type}可按原业务查询手工归档`, (await list({ bizType: business.type, bizId: String(business.id), direction: 'INBOUND' })).rows.some(value => value.emailId === inbound.emailId));
      rejected(await api(sales, '/crm/email/archive-inbound', { method: 'POST', body: { ...inboundRequest, subject: `${inboundRequest.subject}-changed` } }), '已归档同键不同内容不可覆盖');
    }
    rejected(await api(sales, '/crm/email/archive-inbound', { method: 'POST', body: request(customer, 'no-source', { fromAddress: contact.email, toAddresses: ['sender@example.com'] }) }), '手工来信缺少来源说明不可归档');
    const timeline = successful(await api(sales, `/crm/activity/customer/${customerId}/timeline?type=EMAIL&pageSize=100`), '读取真实客户邮件时间线');
    check('客户时间线聚合四类业务邮件且指向真实归档', inboundIds.every(identifier => timeline.rows.some(value => value.type === 'EMAIL' && value.sourceId === identifier)));
    const attached = successful(await api(sales, '/crm/email/draft', { method: 'POST', body: request(customer, 'attached-draft', { fileIds: [pdf.fileId] }) }), '保存真实私有附件关系');
    check('专用下载内容哈希与原始上传一致', (await api(sales, `/crm/email/${attached.emailId}/attachments/${pdf.fileId}`)).sha256 === pdfHash);
    rejected(await api(admin, `/auth/system/file/${pdf.fileId}/content`), '通用文件入口不能绕过邮件附件权限');
    rejected(await api(foreign, `/crm/email/${attached.emailId}/attachments/${pdf.fileId}`), '跨租户不能下载附件');
    rejected(await api(sales, `/crm/email/${inboundIds[0]}/attachments/${pdf.fileId}`), '未引用附件的邮件不可借用附件下载');
    const filePath = database(`SELECT file_path FROM sys_file WHERE file_id=${pdf.fileId};`);
    const actualPath = await fs.realpath(filePath);
    assert.ok(actualPath.startsWith(await fs.realpath(path.join(directory, 'profile/crm-private')) + path.sep));
    const originalBytes = await fs.readFile(actualPath);
    try {
      await fs.writeFile(actualPath, Buffer.from(originalBytes.map((value, index) => index === originalBytes.length - 1 ? value ^ 1 : value)));
      rejected(await api(sales, `/crm/email/${attached.emailId}/attachments/${pdf.fileId}`), '磁盘附件被篡改后下载拒绝');
      rejected(await api(sales, '/crm/email/draft', { method: 'POST', body: request(customer, 'tampered-file', { fileIds: [pdf.fileId] }) }), '磁盘附件被篡改后发送准备拒绝');
    } finally { await fs.writeFile(actualPath, originalBytes); }
    const largeFirst = successful(await upload(customer, `large-a-${caseTag}.pdf`, Buffer.concat([Buffer.from('%PDF-'), Buffer.alloc(6 * 1024 * 1024 - 5)])), '上传六MB附件');
    const largeSecond = successful(await upload(customer, `large-b-${caseTag}.pdf`, Buffer.concat([Buffer.from('%PDF-'), Buffer.alloc(5 * 1024 * 1024 - 5)])), '上传五MB附件');
    rejected(await api(sales, '/crm/email/draft', { method: 'POST', body: request(customer, 'over-total', { fileIds: [largeFirst.fileId, largeSecond.fileId] }) }), '单件合规但合计十一MB时拒绝');
    const maximum = successful(await upload(customer, `maximum-${caseTag}.pdf`, Buffer.concat([Buffer.from('%PDF-'), Buffer.alloc(10 * 1024 * 1024 - 5)])), '上传批准上限十MB附件');
    check('十MB单附件可以通过真实上传并关联草稿', maximum.fileSize === 10 * 1024 * 1024 && successful(await api(sales, '/crm/email/draft', { method: 'POST', body: request(customer, 'maximum-file', { fileIds: [maximum.fileId] }) }), '保存十MB附件草稿').sendStatus === 'DRAFT');
    const oversized = await upload(customer, `oversized-${caseTag}.pdf`, Buffer.concat([Buffer.from('%PDF-'), Buffer.alloc(10 * 1024 * 1024 - 4)]));
    check('超过十MB一字节由请求入口返回413而非内部异常', oversized.status === 413 && oversized.body?.code === 413 && /超过允许大小/.test(oversized.body?.msg || ''));
    evidence.attachments = true;
    evidence.business = true;
    await mode('ACCEPT');
    const channelCode = `h3_archive_${caseTag}`;
    successful(await api(admin, '/auth/system/message/channel', { method: 'POST', body: { channelType: 'EMAIL', channelCode, channelName: channelCode, provider: 'SMTP', status: 'ENABLED', smtpHost: 'localhost', smtpPort: state.smtpFixture.port, smtpSslFlag: 0, smtpUsername: 'fixture-user', smtpPwd: 'fixture-password', fromAddress: 'sender@example.com', fromName: 'CloudFlow H3', priority: 1, rateLimitMinute: 1000, dailyLimit: 10000, retryCount: 1, retryIntervalSec: 120 } }), '真实创建仅指向本机TLS邮件的渠道');
    channelId = Number(database(`SELECT channel_id FROM sys_message_channel WHERE tenant_id=100000 AND channel_code=${sql(channelCode)} AND deleted=0;`));
    const tested = successful(await api(admin, `/auth/system/message/channel/${channelId}/test`, { method: 'POST', body: {} }), '测试真实TLS邮件连接');
    check('本机邮件协议服务通过TLS认证', tested.success === true);
    const choices = successful(await api(sales, '/crm/email/templates'), '读取真实邮件模板');
    check('客户业务邮件模板可选择', choices.some(value => value.templateCode === 'CRM_CUSTOMER_EMAIL'));
    const gateway = state.services.find(service => service.name === 'gateway');
    const origin = `http://127.0.0.1:${gateway.port}`;
    setting('crm.email.trackingEnabled', 'true'); setting('crm.email.publicOrigin', 'https://mail.example.test'); setting('crm.email.allowedHosts', 'example.test');
    const unavailableRequest = request(customer, 'queue-unavailable');
    const queueDraft = successful(await api(sales, '/crm/email/draft', { method: 'POST', body: unavailableRequest }), '故障前真实保存邮件草稿');
    const queueTrigger = `h3_archive_queue_${caseTag}`;
    assert.match(queueTrigger, /^[A-Za-z0-9_]{1,64}$/);
    assert.ok(Number.isSafeInteger(queueDraft.emailId) && queueDraft.emailId > 0);
    let queueFailureInstalled = false;
    try {
      database(`DELIMITER $$\nCREATE TRIGGER ${queueTrigger} BEFORE INSERT ON outbox_event FOR EACH ROW BEGIN
        IF NEW.tenant_id=100000 AND NEW.aggregate_type='cloudflow-service-crm' AND NEW.event_type='MESSAGE_SEND' AND NEW.aggregate_id=${queueDraft.emailId} THEN
          SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='H3 isolated archive queue rejected';
        END IF;
      END$$\nDELIMITER ;`);
      queueFailureInstalled = true;
      const unavailable = successful(await api(sales, '/crm/email/send', { method: 'POST', body: unavailableRequest }), '实际排队失败仍返回保留草稿结果');
      const preserved = await details(queueDraft.emailId);
      check('排队服务真实写入故障保留同一草稿及正文', unavailable.emailId === queueDraft.emailId && unavailable.code === 'CHANNEL_UNAVAILABLE'
        && preserved.sendStatus === 'DRAFT' && preserved.subject === unavailableRequest.subject && preserved.contentSummary.includes('业务往来真实验收') && !preserved.sendTime && !preserved.messageRecordId);
      check('排队故障事务回滚且没有发送消息', database(`SELECT COUNT(*) FROM outbox_event WHERE tenant_id=100000 AND aggregate_type='cloudflow-service-crm' AND event_type='MESSAGE_SEND' AND aggregate_id=${queueDraft.emailId};`) === '0'
        && database(`SELECT COUNT(*) FROM sys_message_record WHERE tenant_id=100000 AND biz_type='CRM_EMAIL_ARCHIVE' AND biz_id=${sql(queueDraft.emailId)};`) === '0'
        && !(await snapshot()).messages.some(value => value.subject === unavailableRequest.subject));
    } finally { if (queueFailureInstalled) database(`DROP TRIGGER ${queueTrigger};`); }
    await new Promise(resolve => setTimeout(resolve, 5200));
    const recovered = successful(await api(sales, '/crm/email/send', { method: 'POST', body: unavailableRequest }), '排队恢复后原草稿可重新提交');
    const recoveredRecord = await waitFor(() => details(queueDraft.emailId), value => ['SENT', 'FAILED', 'UNKNOWN'].includes(value.sendStatus), '排队恢复后草稿未收到真实结果');
    check('排队恢复后沿用原草稿且仅实际发送一次', recovered.emailId === queueDraft.emailId && recoveredRecord.sendStatus === 'SENT'
      && (await snapshot()).messages.filter(value => value.subject === unavailableRequest.subject).length === 1);
    const outbound = [];
    for (const business of businesses) {
      const outboundRequest = request(business, `sent-${business.type}`, { fileIds: business.type === 'CUSTOMER' ? [pdf.fileId] : [] });
      const queued = successful(await api(sales, '/crm/email/send', { method: 'POST', body: outboundRequest }), `真实提交${business.type}客户邮件`);
      check(`${business.type}提交响应仅声明排队`, queued.sendStatus === 'QUEUED' && queued.code === 'QUEUED');
      const sent = await waitFor(() => details(queued.emailId), value => ['SENT', 'FAILED', 'UNKNOWN'].includes(value.sendStatus), '客户邮件真实投递未回写');
      check(`${business.type}仅真实邮件接纳才回写SENT和发送时间`, sent.sendStatus === 'SENT' && Boolean(sent.sendTime) && sent.messageRecordId > 0);
      const messages = (await snapshot()).messages.filter(value => value.subject === outboundRequest.subject);
      check(`${business.type}真实邮件只发给所选客户联系人`, messages.length === 1 && messages[0].to.length === 1 && messages[0].to[0] === contact.email && !messages[0].cc && !messages[0].bcc);
      if (business.type === 'CUSTOMER') check('SMTP携带原始私有附件且字节哈希一致', messages[0].attachments.length === 1 && messages[0].attachments[0].sha256 === pdfHash);
      outbound.push({ request: outboundRequest, record: sent, message: messages[0] }); created.push(sent.emailId);
    }
    evidence.smtp = true;
    const concurrentRequest = request(customer, 'concurrent');
    const concurrent = await Promise.all(Array.from({ length: 6 }, () => api(sales, '/crm/email/send', { method: 'POST', body: concurrentRequest })));
    check('六个同时发送请求至少有一个真实受理', concurrent.some(response => response.status === 200 && response.body?.code === 200));
    const concurrentId = Number(database(`SELECT email_id FROM crm_email_record WHERE tenant_id=100000 AND operation_key=${sql(concurrentRequest.requestKey)};`));
    await waitFor(() => details(concurrentId), value => value.sendStatus === 'SENT', '并发请求未完成单次投递');
    check('同一操作键并发仅一条归档、一条消息、一次SMTP', database(`SELECT COUNT(*) FROM crm_email_record WHERE tenant_id=100000 AND operation_key=${sql(concurrentRequest.requestKey)};`) === '1'
      && database(`SELECT COUNT(*) FROM sys_message_record WHERE tenant_id=100000 AND biz_type='CRM_EMAIL_ARCHIVE' AND biz_id=${sql(concurrentId)};`) === '1'
      && (await snapshot()).messages.filter(value => value.subject === concurrentRequest.subject).length === 1);
    rejected(await api(sales, '/crm/email/send', { method: 'POST', body: { ...concurrentRequest, subject: `${concurrentRequest.subject}-mutated` } }), '已受理的同键请求不能替换正文或主题');
    const internal = async (serviceName, route, body, source = 'cloudflow-auth', tenantId = 100000) => {
      const service = state.services.find(value => value.name === serviceName);
      const response = await fetch(`http://127.0.0.1:${service.port}${route}`, { method: body === undefined ? 'GET' : 'POST', headers: { 'Content-Type': 'application/json', 'X-Inner-Call': 'true', 'X-From-Service': source, 'X-Tenant-Id': String(tenantId) }, body: body === undefined ? undefined : JSON.stringify(body) });
      return { status: response.status, body: await response.json() };
    };
    const first = outbound[0].record;
    const actual = successful(await internal('auth', `/inner/auth/message/crm-delivery/${first.messageRecordId}`, undefined, 'cloudflow-service-crm'), '读取真实加密消息投递快照');
    successful(await internal('crm', '/inner/crm/email/delivery-event', { ...actual.result, status: 'FAILED', version: 0 }), '乱序失败通知重新核验实际快照');
    successful(await internal('crm', '/inner/crm/email/delivery-event', actual.result), '重复发送结果重新核验实际快照');
    check('乱序与重复回调不回退已接纳状态或改写发送时间', (await details(first.emailId)).sendStatus === 'SENT' && (await details(first.emailId)).sendTime === first.sendTime);
    rejected(await internal('crm', '/inner/crm/email/delivery-event', { ...actual.result, recordId: actual.result.recordId + 9000000 }), '伪造消息关联的内部回调被拒绝');
    rejected(await internal('crm', '/inner/crm/email/delivery-event', actual.result, 'cloudflow-service-oa'), '错误来源服务不能回写客户邮件');
    rejected(await api(admin, '/inner/crm/email/delivery-event', { method: 'POST', body: actual.result, headers: { 'X-Inner-Call': 'true', 'X-From-Service': 'cloudflow-auth' } }), '网关不放行伪造内部调用头');
    await mode('PERMANENT');
    const failedRequest = request(customer, 'permanent-rejection');
    const failed = successful(await api(sales, '/crm/email/send', { method: 'POST', body: failedRequest }), '提交真实SMTP拒收场景');
    const failure = await waitFor(() => details(failed.emailId), value => value.sendStatus === 'FAILED', 'SMTP明确拒收未回写');
    check('SMTP明确拒收为FAILED且不写发送时间', !failure.sendTime && !(await snapshot()).messages.some(value => value.subject === failedRequest.subject));
    const forced = successful(await api(admin, `/auth/system/message/record/${failure.messageRecordId}/resend`, { method: 'POST', body: { forceSend: true } }), '尝试消息中心强制重发');
    check('消息中心重发入口只登记待校验事件', forced.accepted === 1);
    const blockedResend = await waitFor(() => {
      const value = database(`SELECT JSON_OBJECT('status',delivery.status,'attempts',delivery.attempt_count,'reason',delivery.last_error_code)
        FROM sys_message_record message JOIN sys_message_delivery delivery ON delivery.tenant_id=message.tenant_id AND delivery.record_id=message.record_id
        WHERE message.tenant_id=100000 AND message.resend_from_id=${failure.messageRecordId};`);
      return value ? JSON.parse(value) : null;
    }, value => value?.status === 'SKIPPED', '归档邮件重发未在真实投递边界拒绝');
    const unchangedFailure = await details(failure.emailId);
    check('归档邮件来源拒绝重发绕过且真实外发尝试为零', blockedResend.reason === 'SOURCE_INVALID' && blockedResend.attempts === 0
      && unchangedFailure.sendStatus === 'FAILED' && unchangedFailure.messageRecordId === failure.messageRecordId && !unchangedFailure.sendTime
      && !(await snapshot()).messages.some(value => value.subject === failedRequest.subject));
    await mode('UNKNOWN');
    const unknownRequest = request(customer, 'unknown');
    const unknownQueued = successful(await api(sales, '/crm/email/send', { method: 'POST', body: unknownRequest }), '提交DATA后断连邮件');
    const unknown = await waitFor(() => details(unknownQueued.emailId), value => value.sendStatus === 'UNKNOWN', 'SMTP结果未明未保留UNKNOWN');
    check('DATA后断连保留UNKNOWN且没有伪造发送时间', !unknown.sendTime && (await snapshot()).messages.filter(value => value.subject === unknownRequest.subject).length === 1);
    const deniedResend = successful(await api(admin, `/auth/system/message/record/${unknown.messageRecordId}/resend`, { method: 'POST' }), '尝试结果未明重发');
    check('结果未明不能自动或人工直接重发', deniedResend.accepted === 0 && (await snapshot()).messages.filter(value => value.subject === unknownRequest.subject).length === 1);
    await mode('TEMPORARY');
    const retryRequest = request(customer, 'source-revoked');
    const retryQueued = successful(await api(sales, '/crm/email/send', { method: 'POST', body: retryRequest }), '提交暂时拒收场景');
    const retryRecordId = await waitFor(() => database(`SELECT record_id FROM sys_message_record WHERE tenant_id=100000 AND biz_type='CRM_EMAIL_ARCHIVE' AND biz_id=${sql(retryQueued.emailId)};`), value => /^\d+$/.test(value), '未生成真实投递记录');
    await waitFor(() => database(`SELECT status FROM sys_message_delivery WHERE tenant_id=100000 AND record_id=${retryRecordId};`), value => value === 'RETRYABLE', '暂时拒收未进入安全重试');
    const retrySnapshot = successful(await internal('auth', `/inner/auth/message/crm-delivery/${retryRecordId}`, undefined, 'cloudflow-service-crm'), '核验重试前的真实载荷');
    const sourceCheck = { eventId: retrySnapshot.result.outboxEventId, recordId: Number(retryRecordId), request: retrySnapshot.request };
    check('原业务有效时内部来源校验通过', successful(await internal('crm', '/inner/crm/message/verify', sourceCheck), '验证真实归档来源').allowed === true);
    const oldContact = database(`SELECT status FROM crm_contact WHERE tenant_id=100000 AND contact_id=${contact.id};`);
    try {
      database(`UPDATE crm_contact SET status='INACTIVE' WHERE tenant_id=100000 AND contact_id=${contact.id};`);
      check('客户联系人停用后发送前来源校验拒绝', successful(await internal('crm', '/inner/crm/message/verify', sourceCheck), '验证停用联系人').allowed === false);
    } finally { database(`UPDATE crm_contact SET status=${sql(oldContact)} WHERE tenant_id=100000 AND contact_id=${contact.id};`); }
    const roleStatus = database('SELECT status FROM sys_role WHERE tenant_id=100000 AND role_id=9;');
    try {
      database("UPDATE sys_role SET status='1' WHERE tenant_id=100000 AND role_id=9;");
      check('发送人角色停用后不依赖旧登录权限缓存', successful(await internal('crm', '/inner/crm/message/verify', sourceCheck), '验证停用角色').allowed === false);
      await mode('ACCEPT');
      database(`UPDATE sys_message_delivery SET next_attempt_time=NOW() WHERE tenant_id=100000 AND record_id=${retryRecordId} AND status='RETRYABLE';`);
      const recoveryJob = database("SELECT job_id FROM sys_job WHERE tenant_id=100000 AND handler_name='messageDeliveryRecovery' AND deleted=0;");
      successful(await api(admin, `/auth/system/job/${recoveryJob}/trigger`, { method: 'POST', body: {} }), '真实调度重新验证投递来源');
      await waitFor(() => details(retryQueued.emailId, admin), value => value.sendStatus === 'FAILED', '角色停用后真实重试未拒绝');
      check('来源失效后实际恢复任务未投递SMTP', !(await snapshot()).messages.some(value => value.subject === retryRequest.subject));
    } finally { database(`UPDATE sys_role SET status=${sql(roleStatus)} WHERE tenant_id=100000 AND role_id=9;`); }
    evidence.callbacks = true;
    anonymous = await admin.context().browser().newContext({ serviceWorkers: 'block' });
    const tokenOf = message => {
      const token = message.body.match(/\/crm\/track\/open\?token=([A-Za-z0-9_-]{43})&(?:amp;)?kind=ARCHIVE/)?.[1];
      assert.ok(token, '真实业务邮件包含分用途随机打开令牌'); secrets.push(token); return token;
    };
    const publicOpen = (token, kind = 'ARCHIVE') => anonymous.request.get(`${origin}/crm/track/open?token=${encodeURIComponent(token)}${kind == null ? '' : `&kind=${kind}`}`);
    const firstToken = tokenOf(outbound[0].message);
    const secondToken = tokenOf(outbound[1].message);
    const thirdToken = tokenOf(outbound[2].message);
    const fourthToken = tokenOf(outbound[3].message);
    check('每封真实业务邮件使用不同不透明令牌', new Set([firstToken, secondToken, thirdToken, fourthToken]).size === 4);
    const redis = await ownedGatewayRedis(state);
    const tokenKey = token => `crm:email:archive:open:${createHash('sha256').update(token).digest('hex')}`;
    const lifetime = Number(redis('TTL', tokenKey(firstToken)));
    check('Redis仅保存令牌哈希映射且过期时间不超过30天', lifetime > 29 * 86400 && lifetime <= 30 * 86400 && redis('GET', tokenKey(firstToken)) === `100000:${first.emailId}`);
    check('归档打开令牌不可误用于营销打开和点击', (await publicOpen(firstToken, null)).status() === 200 && (await details(first.emailId)).readFlag === 0
      && (await anonymous.request.get(`${origin}/crm/track/click?token=${firstToken}`, { maxRedirects: 0 })).status() === 404);
    check('伪造打开令牌不会修改归档', (await publicOpen(randomBytes(32).toString('base64url'))).status() === 200 && (await details(first.emailId)).readFlag === 0);
    const opened = await publicOpen(firstToken);
    check('真实公开入口返回不可缓存像素', opened.status() === 200 && opened.headers()['content-type'].startsWith('image/gif') && opened.headers()['cache-control'].includes('no-store'));
    const firstObserved = await details(first.emailId);
    await new Promise(resolve => setTimeout(resolve, 1100));
    const repeated = await Promise.all(Array.from({ length: 8 }, () => publicOpen(firstToken)));
    check('并发重复打开仅保留首次观察时间', repeated.every(response => response.status() === 200) && firstObserved.readFlag === 1 && (await details(first.emailId)).readTime === firstObserved.readTime);
    setting('crm.email.trackingEnabled', 'false');
    check('关闭观察后有效令牌也不写打开记录', (await publicOpen(secondToken)).status() === 200 && (await details(outbound[1].record.emailId)).readFlag === 0);
    setting('crm.email.trackingEnabled', 'true');
    redis('DEL', tokenKey(thirdToken));
    check('令牌缓存失效只保持未观测状态，不伪造打开', (await publicOpen(thirdToken)).status() === 200 && (await details(outbound[2].record.emailId)).readFlag === 0);
    const fourthKey = tokenKey(fourthToken);
    const fourthValue = redis('GET', fourthKey);
    const fourthLifetime = redis('TTL', fourthKey);
    try {
      redis('DEL', fourthKey); redis('LPUSH', fourthKey, 'isolated-type-failure'); redis('EXPIRE', fourthKey, '120');
      check('真实Redis读取异常时打开服务返回503且无假成功', (await publicOpen(fourthToken)).status() === 503 && (await details(outbound[3].record.emailId)).readFlag === 0);
    } finally { redis('DEL', fourthKey); redis('SET', fourthKey, fourthValue, 'EX', fourthLifetime); }
    const storedPayload = database(`SELECT payload_encrypted FROM sys_message_delivery WHERE tenant_id=100000 AND record_id=${first.messageRecordId};`);
    const ordinaryRecord = database(`SELECT CONCAT(IFNULL(content,''),IFNULL(receiver_addr_mask,''),IFNULL(receiver_addr_cipher,'')) FROM sys_message_record WHERE tenant_id=100000 AND record_id=${first.messageRecordId};`);
    check('原始打开令牌只在既有加密消息载荷中持久化', storedPayload.length > 100 && secrets.every(token => !storedPayload.includes(token) && !ordinaryRecord.includes(token) && !JSON.stringify(first).includes(token)));
    check('归档正文不保存追踪像素且观察不改变接纳时间', !first.sanitizedContent.includes('/track/') && (await details(first.emailId)).sendTime === first.sendTime);
    evidence.publicTracking = true;
    await mode('ACCEPT');
    await verifyEmailArchiveInterface({ sales, employee, api, successful, check, database, directory, caseTag, customer, contact, businesses, pdfBytes, waitFor, details, evidence });
    const finalSmtp = await snapshot();
    const receivedMessages = finalSmtp.messages.filter(value => value.subject.includes(caseTag));
    const receivedTokens = receivedMessages.map(tokenOf);
    check('本轮全部实际邮件均使用独立打开令牌', receivedTokens.length > 4 && new Set(receivedTokens).size === receivedTokens.length);
    const ordinaryMessages = database(`SELECT CONCAT(IFNULL(message.content,''),IFNULL(message.receiver_addr_mask,''),IFNULL(message.error_msg,''),IFNULL(message.skip_reason,''))
      FROM sys_message_record message JOIN crm_email_record email ON message.biz_id=CAST(email.email_id AS CHAR) AND email.tenant_id=message.tenant_id
      WHERE message.tenant_id=100000 AND message.biz_type='CRM_EMAIL_ARCHIVE' AND email.subject LIKE ${sql(`H3_MAIL_${caseTag}%`)};`);
    check('本轮全部普通投递记录均不含原始令牌', secrets.every(token => !ordinaryMessages.includes(token)));
    for (const service of ['auth', 'crm', 'gateway']) {
      const content = await fs.readFile(path.join(directory, service, 'stdout.log'), 'utf8');
      check(`${service}真实运行日志没有原始打开令牌`, secrets.every(token => !content.includes(token)));
    }
    check('真实SMTP会话使用TLS认证且夹具没有协议异常', finalSmtp.authenticated > 0 && finalSmtp.failures.length === 0);
    check('邮件验收结束EMPLOYEE授权集合逐项不变', database('SELECT menu_id FROM sys_role_menu WHERE tenant_id=100000 AND role_id=5 ORDER BY menu_id;') === employeeBefore);
    check('本轮归档八类证据均来自实际执行', Object.values(evidence).every(value => value === true));
    console.log(`H3_EMAIL_ARCHIVE_SMTP_EVIDENCE: case=${caseTag}; received_mime_messages=${receivedMessages.length}; tracking_tokens=${receivedTokens.length}; authenticated_sessions=${finalSmtp.authenticated}; queue_failure_fixture=true; source_revocation_fixture=true; retry_clock_fixture=true; foreign_grants_fixture=true; interface_doubles=0; official_provider_contacted=false; production_modified=false`);
  } finally {
    for (const entry of settings) database(`UPDATE sys_config SET config_value=${sql(entry.value)} WHERE tenant_id=100000 AND config_id=${entry.id};`);
    for (const menuId of temporaryGrants) database(`DELETE FROM sys_role_menu WHERE tenant_id=100001 AND role_id=${foreignRole} AND menu_id=${menuId};`);
    await mode('ACCEPT');
    if (channelId) successful(await api(admin, `/auth/system/message/channel/${channelId}`, { method: 'DELETE' }), '清理本轮隔离邮件渠道');
    await anonymous?.close();
  }
}
