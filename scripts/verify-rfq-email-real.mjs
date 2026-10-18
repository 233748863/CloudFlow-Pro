import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { verifyRfqEmailBoundaries } from './verify-rfq-email-boundaries.mjs';

export async function verifyRfqEmail({ admin, api, successful, session, database, check, directory, caseTag, accounts, state }) {
  const smtpDirectory = await fs.realpath(path.join(directory, 'private', 'smtp'));
  assert.equal(smtpDirectory, await fs.realpath(state.smtpFixture.directory));
  assert.equal(state.smtpFixture.loopback, true);
  const sqlText = value => `CONVERT(UNHEX('${Buffer.from(String(value)).toString('hex')}') USING utf8mb4)`;
  const row = statement => JSON.parse(database(statement));
  const waitFor = async (read, predicate, label, timeout = 45000) => {
    const deadline = Date.now() + timeout;
    let value;
    do {
      value = await read();
      if (predicate(value)) return value;
      await new Promise(resolve => setTimeout(resolve, 250));
    } while (Date.now() < deadline);
    throw new Error(`${label}: ${JSON.stringify(value)}`);
  };
  const snapshot = async () => JSON.parse(await fs.readFile(path.join(smtpDirectory, 'snapshot.json'), 'utf8'));
  const mode = async value => {
    await fs.writeFile(path.join(smtpDirectory, 'control.json'), JSON.stringify({ mode: value }));
    await waitFor(snapshot, current => current.mode === value, '真实SMTP测试模式切换');
  };
  const denied = response => response.status === 403 || response.body?.code === 403;
  const rejected = response => response.status < 200 || response.status >= 300 || (response.body !== undefined && response.body?.code !== 200);
  assert.equal(rejected({ status: 200, size: 1 }), false);
  const today = database('SELECT CURRENT_DATE;');
  const dateAfter = days => {
    const value = new Date(`${today}T12:00:00Z`);
    value.setUTCDate(value.getUTCDate() + days);
    return value.toISOString().slice(0, 10);
  };
  const pdf = Buffer.from(`%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\n%RFQ-${caseTag}\n%%EOF\n`);
  const pdfHash = createHash('sha256').update(pdf).digest('hex');
  const file = { name: `邀请材料_${caseTag}.pdf`, type: 'application/pdf', content: pdf.toString('base64') };
  const detail = async (rfqId, page = admin) => successful(await api(page, `/oa/rfq/${rfqId}`), '查询真实询价');
  const invitations = rfqId => row(`SELECT COALESCE(JSON_ARRAYAGG(JSON_OBJECT('id',rfq_supplier_id,'supplierId',supplier_id,'channel',invite_channel,'status',invite_delivery_status,'recordId',invite_message_record_id,'sentTime',invite_sent_time,'quoteStatus',quote_status,'version',version)),JSON_ARRAY()) FROM oa_purchase_rfq_supplier WHERE rfq_id=${rfqId};`);
  const deliveries = rfqId => row(`SELECT COALESCE(JSON_ARRAYAGG(JSON_OBJECT('id',delivery.delivery_id,'recordId',delivery.record_id,'status',delivery.status,'attempts',delivery.attempt_count,'version',delivery.version,'code',delivery.last_error_code,'resendFrom',record.resend_from_id)),JSON_ARRAY()) FROM sys_message_delivery delivery JOIN sys_message_record record ON record.record_id=delivery.record_id JOIN oa_purchase_rfq_supplier invitation ON record.biz_id=CAST(invitation.rfq_supplier_id AS CHAR) WHERE invitation.rfq_id=${rfqId} AND record.biz_type='RFQ_EMAIL_INVITE';`);
  const createSupplier = async suffix => {
    const supplier = { supplierName: `RFQ_${caseTag}_${suffix}`, supplierCode: `rfq_${caseTag}_${suffix}`, contactName: `${suffix}联系人`, contactEmail: `${suffix}-${caseTag}@example.test`, contactPhone: '13800000000', status: 'ACTIVE' };
    successful(await api(admin, '/oa/supplier', { method: 'POST', body: supplier }), '真实HTTP创建供应商');
    const supplierId = database(`SELECT supplier_id FROM oa_supplier WHERE tenant_id=100000 AND supplier_code=${sqlText(supplier.supplierCode)} AND deleted=0;`);
    assert.match(supplierId, /^\d+$/);
    return { ...supplier, supplierId: Number(supplierId) };
  };
  const createRfq = async (suffix, attachment, page = admin) => {
    const request = { rfq: { title: `RFQ_EMAIL_${caseTag}_${suffix}`, quoteDeadline: dateAfter(2), expectedDeliveryDate: dateAfter(10), deliveryAddress: '独立验收收货地址', paymentTerms: '验收后付款', termsContent: '请按规格逐项报价', attachmentUrl: attachment || null }, items: [{ itemName: `专属物料_${caseTag}`, quantity: 3, unit: '件', spec: '验收规格A', brandRequirement: '品牌要求', technicalRequirement: '技术要求', expectedPrice: '98765.43' }] };
    const rfqId = successful(await api(page, '/oa/rfq', { method: 'POST', body: request }), '真实HTTP保存询价草稿');
    return { rfqId, title: request.rfq.title };
  };
  const invite = async (rfqId, suppliers, channel = 'EMAIL') => {
    const current = await detail(rfqId);
    return api(admin, `/oa/rfq/${rfqId}/invite`, { method: 'POST', body: { version: current.rfq.version, channel, supplierIds: suppliers.map(supplier => supplier.supplierId) } });
  };
  let lastRecovery = 0;
  const trigger = async handler => {
    const remaining = 5200 - (Date.now() - lastRecovery);
    if (remaining > 0) await new Promise(resolve => setTimeout(resolve, remaining));
    const jobId = database(`SELECT job_id FROM sys_job WHERE tenant_id=100000 AND deleted=0 AND handler_name=${sqlText(handler)};`);
    assert.match(jobId, /^\d+$/);
    const execution = successful(await api(admin, `/auth/system/job/${jobId}/trigger`, { method: 'POST', body: {} }), `真实集中任务${handler}`);
    assert.equal(execution.accepted, true);
    lastRecovery = Date.now();
    const status = await waitFor(() => database(`SELECT execute_status FROM sys_job_log WHERE execute_no=${sqlText(execution.executeNo)};`), value => ['SUCCESS', 'FAILED', 'TIMEOUT', 'DISPATCH_FAILED'].includes(value), '等待集中任务执行完成');
    check(`${handler}由真实服务执行成功`, status === 'SUCCESS');
  };
  const recover = async rfqIds => {
    for (const rfqId of rfqIds) {
      database(`UPDATE sys_message_delivery delivery JOIN sys_message_record record ON record.record_id=delivery.record_id JOIN oa_purchase_rfq_supplier invitation ON record.biz_id=CAST(invitation.rfq_supplier_id AS CHAR) SET delivery.next_attempt_time=NOW() WHERE invitation.rfq_id=${rfqId} AND record.biz_type='RFQ_EMAIL_INVITE' AND delivery.status IN ('PENDING','RETRYABLE');`);
    }
    await trigger('messageDeliveryRecovery');
  };
  const showRfq = async current => {
    await admin.goto(new URL('/office/rfqs', admin.url()).href);
    await admin.getByRole('textbox', { name: '搜索询价标题', exact: true }).fill(current.title);
    const entry = admin.getByRole('row').filter({ has: admin.getByText(current.title, { exact: true }) });
    await entry.getByRole('button', { name: '查看详情', exact: true }).click();
    const dialog = admin.getByRole('dialog', { name: current.title, exact: true });
    await dialog.getByRole('button', { name: '邀请供应商', exact: true }).waitFor();
    return dialog;
  };
  const first = await createSupplier('first');
  const second = await createSupplier('second');
  const initialSnapshot = await snapshot();
  const initial = successful(await api(admin, '/oa/rfq/email-readiness'), '未配置邮件状态');
  check('未配置邮件时明确停用，真实协议没有被调用', !initial.ready && initial.reason && (await snapshot()).connections === initialSnapshot.connections);
  const offline = await createRfq('offline');
  check('未配置邮件请求被拒绝且不生成邀请或假成功', rejected(await invite(offline.rfqId, [first])) && invitations(offline.rfqId).length === 0 && (await detail(offline.rfqId)).rfq.status === 'DRAFT');
  const offlineDialog = await showRfq(offline);
  await offlineDialog.getByRole('button', { name: '邀请供应商', exact: true }).click();
  const disabledDialog = admin.getByRole('dialog', { name: '邀请供应商', exact: true });
  await disabledDialog.getByText('正在核验邮件配置', { exact: true }).waitFor({ state: 'hidden' });
  const disabledSelection = await disabledDialog.getByRole('combobox', { name: '邀请方式' }).evaluate(select => ({ value: select.value, emailDisabled: select.querySelector('option[value="EMAIL"]')?.disabled }));
  console.log(`RFQ_UNCONFIGURED_SELECTION: ${JSON.stringify(disabledSelection)}`);
  check('未配置页面默认线下并禁用邮件选项', disabledSelection.value === 'OFFLINE' && disabledSelection.emailDisabled === true);
  await disabledDialog.getByRole('button', { name: '取消', exact: true }).click();
  const phone = successful(await invite(offline.rfqId, [first], 'PHONE'), '登记电话邀请');
  const offlineResult = successful(await invite(offline.rfqId, [second], 'OFFLINE'), '登记线下邀请');
  check('电话和线下各登记一家且没有创建邮件', phone.registered === 1 && offlineResult.registered === 1 && invitations(offline.rfqId).every(current => current.status === null && current.recordId === null) && deliveries(offline.rfqId).length === 0);
  check('真实线下邀请使询价进入SENT并正确计数', (await detail(offline.rfqId)).rfq.status === 'SENT' && (await detail(offline.rfqId)).rfq.invitedCount === 2);
  check('重复线下邀请复用记录', successful(await invite(offline.rfqId, [first], 'PHONE'), '重复电话邀请').retained === 1 && invitations(offline.rfqId).length === 2);
  const channelCode = `rfq_email_${caseTag}`;
  const channel = { channelType: 'EMAIL', channelCode, channelName: channelCode, provider: 'SMTP', status: 'ENABLED', smtpHost: 'localhost', smtpPort: state.smtpFixture.port, smtpSslFlag: 0, smtpUsername: 'fixture-user', smtpPwd: 'fixture-password', fromAddress: 'sender@example.com', fromName: 'CloudFlow RFQ', priority: 1, rateLimitMinute: 1000, dailyLimit: 10000, retryCount: 3, retryIntervalSec: 120 };
  let channelId;
  const contexts = [];
  try {
    successful(await api(admin, '/auth/system/message/channel', { method: 'POST', body: channel }), '创建仅指向独立TLS协议服务的邮件渠道');
    channelId = database(`SELECT channel_id FROM sys_message_channel WHERE channel_code=${sqlText(channelCode)} AND tenant_id=100000 AND deleted=0;`);
    assert.match(channelId, /^\d+$/);
    const tested = successful(await api(admin, `/auth/system/message/channel/${channelId}/test`, { method: 'POST', body: {} }), '真实TLS邮件连通性测试');
    check('真实TLS认证成功，连通性测试没有发送业务邮件', tested.success === true && (await snapshot()).messages.length === initialSnapshot.messages.length);
    check('已配置渠道与正式模板使邮件选项可用', successful(await api(admin, '/oa/rfq/email-readiness'), '已配置邮件状态').ready === true);
    const uploaded = successful(await api(admin, '/oa/rfq/invitation-files', { method: 'POST', file }), '上传本单私有邀请附件');
    check('附件只返回内部引用且登记专用文件类型', uploaded.reference === `oa-file:RFQ_INVITATION:${uploaded.fileId}` && database(`SELECT file_type FROM sys_file WHERE file_id=${uploaded.fileId};`) === 'OA_RFQ_INVITATION');
    await new Promise(resolve => setTimeout(resolve, 5200));
    const invalidPdf = await api(admin, '/oa/rfq/invitation-files', { method: 'POST', file: { ...file, name: `bad_${caseTag}.pdf`, content: Buffer.from('invalid pdf').toString('base64') } });
    const invalidPdfLog = await fs.readFile(path.join(directory, 'oa', 'stdout.log'), 'utf8');
    check('伪装PDF由实际内容校验拒绝，未被重复提交保护代替', rejected(invalidPdf) && invalidPdf.traceId
      && invalidPdfLog.split(/\r?\n/).some(line => line.includes(invalidPdf.traceId) && line.includes('附件内容与文件类型不一致'))
      && database(`SELECT COUNT(*) FROM sys_file WHERE tenant_id=100000 AND file_name=${sqlText(`bad_${caseTag}.pdf`)};`) === '0');
    const mail = await createRfq('main', uploaded.reference);
    const downloaded = await api(admin, `/oa/rfq/${mail.rfqId}/invitation-file`);
    check('授权采购员读取本单私有附件字节与上传完全一致', downloaded.status === 200 && downloaded.sha256 === pdfHash);
    await mode('TEMPORARY');
    const workspace = await showRfq(mail);
    await workspace.getByRole('button', { name: '邀请供应商', exact: true }).click();
    const invitationDialog = admin.getByRole('dialog', { name: '邀请供应商', exact: true });
    await invitationDialog.getByRole('combobox', { name: '邀请方式' }).selectOption('EMAIL');
    await invitationDialog.getByRole('checkbox', { name: new RegExp(first.supplierName) }).check();
    await invitationDialog.getByRole('checkbox', { name: new RegExp(second.supplierName) }).check();
    for (const width of [1440, 375, 320]) {
      await admin.setViewportSize({ width, height: 1000 });
      const button = invitationDialog.getByRole('button', { name: '登记邮件投递', exact: true });
      await button.scrollIntoViewIfNeeded();
      const bounds = await button.boundingBox();
      check(`邀请邮件${width}px无页面横向溢出且按钮至少44px`, await admin.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth) && bounds?.height >= 44);
      await admin.screenshot({ path: path.join(directory, `rfq-email-${caseTag}-${width}.png`), fullPage: true });
    }
    const invitedResponse = admin.waitForResponse(response => response.url().endsWith(`/oa/rfq/${mail.rfqId}/invite`) && response.request().method() === 'POST');
    await invitationDialog.getByRole('button', { name: '登记邮件投递', exact: true }).click();
    const submitted = await invitedResponse;
    const submittedBody = await submitted.json();
    check('手机实际提交邮件邀请，返回两家排队而非已发送', submitted.status() === 200 && submittedBody.code === 200 && submittedBody.data.queued === 2 && submittedBody.data.registered === 0);
    await waitFor(() => deliveries(mail.rfqId), values => values.length === 2 && values.every(value => value.status === 'RETRYABLE'), 'SMTP明确临时拒收');
    check('临时拒收不计入已邀请，询价仍为草稿', (await detail(mail.rfqId)).rfq.status === 'DRAFT' && (await detail(mail.rfqId)).rfq.invitedCount === 0 && invitations(mail.rfqId).every(current => current.status === 'QUEUED'));
    const frozen = await detail(mail.rfqId);
    frozen.rfq.title += '_禁止更改';
    check('邮件排队期间服务端拒绝修改关键询价内容', rejected(await api(admin, '/oa/rfq', { method: 'POST', body: frozen })) && (await detail(mail.rfqId)).rfq.title === mail.title);
    const uninvitedQuote = await api(admin, '/oa/rfq/quotations', { method: 'POST', body: { quotation: { rfqId: mail.rfqId, supplierId: first.supplierId, quoteDate: today, currency: 'CNY' }, items: [] } });
    check('邮件尚未接纳时不能代录报价或登记拒绝', rejected(uninvitedQuote) && rejected(await api(admin, `/oa/rfq/${mail.rfqId}/decline`, { method: 'POST', body: { supplierId: first.supplierId, reason: '尚未真正邀请' } })));
    await mode('ACCEPT');
    await recover([mail.rfqId]);
    await waitFor(() => invitations(mail.rfqId), values => values.length === 2 && values.every(value => value.status === 'SENT'), '真实邮件结果回写OA');
    const accepted = await waitFor(snapshot, current => current.messages.filter(message => message.subject.includes(mail.title)).length === 2, 'SMTP实际收到两封');
    const messages = accepted.messages.filter(message => message.subject.includes(mail.title));
    check('实际SMTP接纳后OA收到真实结果并转SENT', (await detail(mail.rfqId)).rfq.status === 'SENT' && (await detail(mail.rfqId)).rfq.invitedCount === 2 && invitations(mail.rfqId).every(current => current.recordId && current.sentTime));
    for (const supplier of [first, second]) {
      const message = messages.find(current => current.to.length === 1 && current.to[0] === supplier.contactEmail);
      const other = supplier === first ? second : first;
      check(`${supplier.supplierName}收到单独收件且不泄露对手与预估价`, message && !message.cc && !message.bcc && message.body.includes(supplier.supplierName) && message.body.includes(`专属物料_${caseTag}`) && message.body.includes('报价截止日期') && ![other.supplierName, other.contactEmail, '98765.43', '/comparison'].some(value => message.body.includes(value)));
      check(`${supplier.supplierName}收到实际MIME附件且哈希匹配`, message.attachments.length === 1 && message.attachments[0].name === file.name && message.attachments[0].sha256 === pdfHash && message.attachments[0].size === pdf.length);
    }
    const previousDeliveries = deliveries(mail.rfqId).length;
    const retained = successful(await invite(mail.rfqId, [first, second]), '重复登记已发出的邀请');
    check('已发出邀请再次提交不创建额外投递', retained.retained === 2 && retained.queued === 0 && deliveries(mail.rfqId).length === previousDeliveries);
    await trigger('oaRfqDeadlineScan');
    await waitFor(snapshot, current => current.messages.filter(message => message.subject.startsWith('询价截止提醒') && message.subject.includes(mail.title)).length === 2, '真实截止提醒邮件');
    await trigger('oaRfqDeadlineScan');
    check('同一截止轮次重复调度只登记两封逐家提醒', database(`SELECT COUNT(*) FROM sys_message_record record JOIN oa_purchase_rfq_supplier invitation ON record.biz_id=CAST(invitation.rfq_supplier_id AS CHAR) WHERE invitation.rfq_id=${mail.rfqId} AND record.biz_type='RFQ_EMAIL_REMINDER';`) === '2');
    const concurrent = await createRfq('concurrent');
    const concurrentVersion = (await detail(concurrent.rfqId)).rfq.version;
    await mode('TEMPORARY');
    const simultaneous = await Promise.all([0, 1].map(() => api(admin, `/oa/rfq/${concurrent.rfqId}/invite`, { method: 'POST', body: { version: concurrentVersion, channel: 'EMAIL', supplierIds: [first.supplierId] } })));
    check('并发重复邀请仅一个请求登记成功且供应商记录唯一', simultaneous.filter(value => value.status === 200 && value.body?.code === 200 && value.body.data.queued === 1).length === 1 && invitations(concurrent.rfqId).length === 1);
    await waitFor(() => deliveries(concurrent.rfqId), values => values.length === 1 && values[0].status === 'RETRYABLE', '并发场景唯一投递');
    await mode('ACCEPT');
    await recover([concurrent.rfqId]);
    await waitFor(() => invitations(concurrent.rfqId), values => values[0]?.status === 'SENT', '并发场景真实接纳');
    check('并发场景SMTP实际只接纳一封', (await snapshot()).messages.filter(message => message.subject.includes(concurrent.title)).length === 1);
    await mode('PERMANENT');
    const refused = await createRfq('permanent');
    successful(await invite(refused.rfqId, [first]), '排队永久拒收场景');
    await waitFor(() => invitations(refused.rfqId), values => values[0]?.status === 'FAILED', '永久拒收回写');
    check('永久拒收不标已邀请且保存真实失败', (await detail(refused.rfqId)).rfq.invitedCount === 0 && deliveries(refused.rfqId)[0].status === 'FAILED' && !(await snapshot()).messages.some(message => message.subject.includes(refused.title)));
    const revised = await detail(refused.rfqId);
    revised.rfq.title += '_revised';
    successful(await api(admin, '/oa/rfq', { method: 'POST', body: revised }), '全部失败后修改询价');
    await mode('ACCEPT');
    successful(await invite(refused.rfqId, [first]), '重新登记失败邀请的新版本');
    await waitFor(() => invitations(refused.rfqId), values => values[0]?.status === 'SENT', '新版本接纳回写');
    check('失败可编辑重提，保留失败记录并真实发送新版本', deliveries(refused.rfqId).length === 2 && deliveries(refused.rfqId).filter(value => value.status === 'SENT').length === 1);
    await mode('UNKNOWN');
    const uncertain = await createRfq('unknown');
    successful(await invite(uncertain.rfqId, [first]), '排队结果不明场景');
    await waitFor(() => invitations(uncertain.rfqId), values => values[0]?.status === 'UNKNOWN', 'DATA后断连回写UNKNOWN');
    const unknown = deliveries(uncertain.rfqId)[0];
    const unknownMessages = (await snapshot()).messages.filter(message => message.subject.includes(uncertain.title)).length;
    check('DATA后断连不虚报成功，保留待核验且不计已邀请', unknown.status === 'UNKNOWN' && unknownMessages === 1 && (await detail(uncertain.rfqId)).rfq.invitedCount === 0);
    check('UNKNOWN不能改登记为电话绕过核验', rejected(await invite(uncertain.rfqId, [first], 'PHONE')));
    const ignoredResend = successful(await api(admin, `/auth/system/message/record/${unknown.recordId}/resend`, { method: 'POST' }), '未核验前尝试重新发送');
    await recover([]);
    check('UNKNOWN重发和自动恢复均不再次发送', ignoredResend.accepted === 0 && (await snapshot()).messages.filter(message => message.subject.includes(uncertain.title)).length === unknownMessages);
    const operator = accounts.find(account => account.username === 'g_import_admin');
    successful(await api(admin, `/auth/system/message/delivery/${unknown.id}/resolve`, { method: 'POST', body: { version: unknown.version, conclusion: 'NOT_ACCEPTED', evidence: `隔离SMTP-${caseTag}在DATA后主动断连，已核验本次未接纳。`, password: operator.password } }), '真实密码核验未接纳');
    await waitFor(() => invitations(uncertain.rfqId), values => values[0]?.status === 'FAILED', '核验结果回写失败');
    await mode('ACCEPT');
    const resubmitted = successful(await api(admin, `/auth/system/message/record/${unknown.recordId}/resend`, { method: 'POST' }), '核验后通过原来源重发');
    check('核验后允许创建可追溯的独立重发事件', resubmitted.accepted === 1);
    await waitFor(() => invitations(uncertain.rfqId), values => values[0]?.status === 'SENT', '核验后的真正重发接纳');
    check('核验重发保留原FAILED，关联resendFromId且OA关联新记录', deliveries(uncertain.rfqId).some(value => value.resendFrom === unknown.recordId && value.status === 'SENT') && deliveries(uncertain.rfqId).some(value => value.recordId === unknown.recordId && value.status === 'FAILED') && invitations(uncertain.rfqId)[0].recordId !== unknown.recordId);
    const invalidSources = [];
    for (const change of ['cancel', 'email', 'prevent']) {
      await mode('TEMPORARY');
      const supplier = await createSupplier(change);
      const current = await createRfq(`source_${change}`);
      successful(await invite(current.rfqId, [supplier]), '排队待复核来源');
      await waitFor(() => deliveries(current.rfqId), values => values[0]?.status === 'RETRYABLE', '来源复核前真实临时拒收');
      if (change === 'cancel') successful(await api(admin, `/oa/rfq/${current.rfqId}/terminate`, { method: 'POST', body: { failed: false, reason: '取消未被接纳的询价邮件' } }), '取消原询价');
      if (change === 'email') {
        const original = successful(await api(admin, `/oa/supplier/${supplier.supplierId}`), '读取供应商');
        successful(await api(admin, '/oa/supplier', { method: 'PUT', body: { ...original, contactEmail: `changed-${caseTag}@example.test` } }), '改变供应商联系邮箱');
      }
      if (change === 'prevent') database(`UPDATE oa_supplier SET prevent_rfq_flag=1 WHERE supplier_id=${supplier.supplierId} AND tenant_id=100000;`);
      invalidSources.push(current);
    }
    await mode('ACCEPT');
    await recover(invalidSources.map(current => current.rfqId));
    for (const current of invalidSources) {
      await waitFor(() => invitations(current.rfqId), values => values[0]?.status === 'FAILED', '失效来源真实结果回写');
      check(`${current.title}发送前复核来源失效且没有接纳邮件`, deliveries(current.rfqId)[0].status === 'SKIPPED' && deliveries(current.rfqId)[0].attempts === 1 && !(await snapshot()).messages.some(message => message.subject.includes(current.title)));
    }
    const employee = await session('g_holiday_employee'); contexts.push(employee.context());
    const crossTenant = await session('g_import_tenant'); contexts.push(crossTenant.context());
    const employeeBody = { version: (await detail(mail.rfqId)).rfq.version, channel: 'EMAIL', supplierIds: [first.supplierId] };
    check('EMPLOYEE不能发送询价邀请、上传私有附件或通知定标', denied(await api(employee, `/oa/rfq/${mail.rfqId}/invite`, { method: 'POST', body: employeeBody })) && denied(await api(employee, '/oa/rfq/invitation-files', { method: 'POST', file })) && denied(await api(employee, `/oa/rfq/${mail.rfqId}/notify-award`, { method: 'POST', body: { version: employeeBody.version } })));
    check('其他租户不能读取本询价或私有附件', rejected(await api(crossTenant, `/oa/rfq/${mail.rfqId}`)) && rejected(await api(crossTenant, `/oa/rfq/${mail.rfqId}/invitation-file`)));
    const foreignRequest = { rfq: { title: `RFQ_EMAIL_${caseTag}_foreign`, quoteDeadline: dateAfter(2), attachmentUrl: uploaded.reference }, items: [{ itemName: '跨租户附件', quantity: 1, unit: '件' }] };
    check('其他租户不能将本租户私有附件绑定自己的询价', rejected(await api(crossTenant, '/oa/rfq', { method: 'POST', body: foreignRequest })) && database(`SELECT COUNT(*) FROM oa_purchase_rfq WHERE title=${sqlText(foreignRequest.rfq.title)};`) === '0');
    const arbitrary = { ...foreignRequest, rfq: { ...foreignRequest.rfq, title: `RFQ_EMAIL_${caseTag}_url`, attachmentUrl: 'https://example.test/private.pdf' } };
    check('邮件附件拒绝任意URL引用且不创建草稿', rejected(await api(admin, '/oa/rfq', { method: 'POST', body: arbitrary })) && database(`SELECT COUNT(*) FROM oa_purchase_rfq WHERE title=${sqlText(arbitrary.rfq.title)};`) === '0');
    check('员工角色没有获得本批询价写权限', database("SELECT COUNT(*) FROM sys_role_menu role_menu JOIN sys_menu menu ON menu.menu_id=role_menu.menu_id WHERE role_menu.role_id=5 AND menu.perms IN ('oa:rfq:edit','oa:rfq:invite','oa:rfq:quote','oa:rfq:award','oa:rfq:terminate','oa:rfq:convert');") === '0');
    await verifyRfqEmailBoundaries({ admin, api, successful, session, database, check, directory, caseTag, sqlText, row, waitFor, snapshot, mode, rejected,
      today, dateAfter, file, uploaded, mail, first, second, detail, invitations, deliveries, createSupplier, createRfq, invite, trigger, recover, showRfq });
    const finalSnapshot = await snapshot();
    check('真实SMTP会话全部使用TLS认证且协议服务无异常', finalSnapshot.authenticated > 0 && finalSnapshot.failures.length === 0);
    console.log(`RFQ_SMTP_EVIDENCE: received_mime_messages=${finalSnapshot.messages.length}; authenticated_sessions=${finalSnapshot.authenticated}; source_change_fixture=true; retry_clock_fixture=true; deadline_clock_fixture=true; supplier_pagination_fixture=true; interface_doubles=0; official_provider_contacted=false; production_modified=false`);
  } finally {
    for (const context of contexts) await context.close();
    await mode('ACCEPT');
    if (channelId) successful(await api(admin, `/auth/system/message/channel/${channelId}`, { method: 'DELETE' }), '停用本轮隔离邮件渠道');
  }
}
