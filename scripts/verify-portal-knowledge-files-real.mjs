import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { ownedGatewayRedis } from './owned-gateway-redis.mjs';

export async function verifyPortalKnowledgeFiles(context) {
  const { admin, api, successful, database, check, caseTag, state, token, portalUserId, portalCall, first, secrets, sql,
    waitFor, minute, denied, evidence, current, preview, publish, withdraw, readPortal, record, versionId, uploaded, operationBefore } = context;
  const redis = await ownedGatewayRedis(state);
  const publicFile = uploaded[0];
  const privateFile = uploaded[1];
  const fileKey = `cloudflow:portal:rate:file:100000:${portalUserId}`;
  const userKey = `cloudflow:portal:rate:user:100000:${portalUserId}`;
  const call = (route, body, supplied = token, headers) => portalCall(`/portal/file/${route}`, body, supplied, headers);
  const body = (fileId = publicFile.id) => ({ documentId: record.id, versionId, fileId });
  const reserve = async () => { if (Number(redis('GET', fileKey)) >= 15 || Number(redis('GET', userKey)) >= 54) await minute(); };
  const issue = async (fileId = publicFile.id) => {
    await reserve();
    let response = await call('access', body(fileId));
    if (response.status === 429) { await minute(); response = await call('access', body(fileId)); }
    const access = successful(response, '实际申请一次性知识附件下载凭据');
    check('下载凭据为60秒随机格式且没有地址或内部字段', /^kf_[A-Za-z0-9_-]{43}$/.test(access.downloadTicket)
      && access.expiresIn === 60 && Object.keys(access).sort().join(',') === 'downloadTicket,expiresIn');
    secrets.push(access.downloadTicket);
    return access.downloadTicket;
  };
  const download = (downloadTicket, supplied = token) => call('download', { downloadTicket }, supplied);
  await publish(record, versionId, admin, [publicFile.id]);
  check('公开清单持久保存，未勾选文件不在清单中', JSON.stringify(current(record.id).selectedFiles) === JSON.stringify([publicFile.id]));
  const externalState = await preview(record.id, versionId);
  check('重新读取发布状态得到已保存的明确选择', JSON.stringify(externalState.externalAttachmentFileIds) === JSON.stringify([publicFile.id]));
  const detail = successful(await readPortal(`/${record.id}`), '读取已公开附件白名单');
  check('门户附件仅返回所选文件编号、名称、大小', detail.attachments.length === 1 && detail.attachments[0].fileId === publicFile.id
    && Object.keys(detail.attachments[0]).sort().join(',') === 'fileId,fileName,fileSize'
    && !JSON.stringify(detail).includes(privateFile.name) && !JSON.stringify(detail).includes('/system/file/'));
  for (const fileIds of [[privateFile.id, publicFile.id, publicFile.id], [1, 2, 3, 4, 5, 6], [null], [-1]]) {
    denied(await api(admin, `/oa/knowledge/${record.id}/external-publish`, { method: 'POST', body: { version: current(record.id).version, versionId, attachmentFileIds: fileIds } }), 400, '公开清单拒绝重复、超限和非法编号');
  }
  const before = JSON.stringify(current(record.id));
  denied(await api(admin, `/oa/knowledge/${record.id}/external-publish`, { method: 'POST', body: { version: current(record.id).version, versionId, attachmentFileIds: [publicFile.id, uploaded[2].id] } }), 409, '混入其他文档附件时整次发布拒绝');
  check('非法选择没有部分保存或提升版本', JSON.stringify(current(record.id)) === before);
  const ticket = await issue();
  const ticketKey = 'cloudflow:portal:file-ticket:' + createHash('sha256').update(ticket).digest('hex');
  const persisted = redis('GET', ticketKey);
  check('真实Redis只以下载凭据摘要索引，值不含原始凭据或门户令牌', persisted.includes('PORTAL_KNOWLEDGE_DOWNLOAD') && !persisted.includes(ticket) && !persisted.includes(token)
    && Number(redis('TTL', ticketKey)) > 0 && Number(redis('TTL', ticketKey)) <= 60);
  const result = await download(ticket);
  check('HTTPS下载得到真实原文件字节且不重定向', result.status === 200 && result.size === publicFile.size && result.sha256 === publicFile.sha256 && !result.headers.location);
  check('下载强制附件及禁缓存，避免把HTML作为页面执行', result.headers['content-type'].startsWith('application/octet-stream')
    && result.headers['content-disposition'].startsWith('attachment;') && result.headers['cache-control'].includes('no-store')
    && result.headers['x-content-type-options'] === 'nosniff' && result.headers['content-security-policy'].includes('sandbox'));
  denied(await download(ticket), 404, '下载凭据使用一次后不能重放');
  denied(await call('access', body(privateFile.id)), 404, '未勾选的内部附件不能换ID申请下载');
  denied(await call('access', body(uploaded[2].id)), 404, '其他文档附件不能申请下载');
  denied(await call('access', { ...body(), versionId: versionId + 999999 }), 404, '未公开版本不能申请下载');
  for (const extra of [{ tenantId: 100001 }, { customerId: first.customerId }, { url: publicFile.url }, { path: publicFile.url }]) {
    await reserve();
    denied(await call('access', { ...body(), ...extra }), 400, '文件请求拒绝身份注入或路径参数');
  }
  await reserve();
  denied(await call('access?fileId=1', body()), 400, '文件入口拒绝查询参数');
  denied(await portalCall('/portal/file/access', undefined, token), 404, '文件入口不支持GET暴露凭据');
  denied(await portalCall('/portal/file/upload', undefined, token), 404, '门户上传仅开放POST，GET不能读取上传文件');
  const internal = await admin.evaluate(async () => (await import('/src/utils/authStorage.ts')).getAuthToken());
  denied(await call('access', body(), internal.replace(/^Bearer /, '')), 401, '内部令牌不能用于门户附件下载');
  denied(await call('access', body(), ''), 401, '匿名不能获取门户附件下载凭据');
  denied(await portalCall(`/auth/system/file/${publicFile.id}/content`, undefined, token), 401, '门户令牌不能绕过下载校验直接读取内部文件地址');
  const anotherSession = await context.login(first);
  const sessionTicket = await issue();
  denied(await download(sessionTicket, anotherSession), 404, '同一账号的另一会话不能使用原会话下载凭据');
  check('会话错配不会消费正确用户的下载凭据', (await download(sessionTicket)).sha256 === publicFile.sha256);
  const otherCustomer = await context.createBusiness('knowledge-other');
  await context.invite(otherCustomer);
  const activationToken = context.activation(await context.message(otherCustomer));
  successful(await portalCall(`/portal/${context.tenantCode}/activate`, { activationToken, password: context.password }), '通过真实邀请激活另一客户账号');
  const otherCustomerToken = await context.login(otherCustomer);
  const customerTicket = await issue();
  denied(await download(customerTicket, otherCustomerToken), 404, '另一客户不能复用当前客户的下载凭据');
  check('客户错配不会消费原客户下载凭据', (await download(customerTicket)).sha256 === publicFile.sha256);
  const ownAccess = successful(await call('access', body(), otherCustomerToken), '另一客户以独立会话申请公开附件');
  secrets.push(ownAccess.downloadTicket);
  check('同租户另一客户可凭自己的授权下载公开附件', (await download(ownAccess.downloadTicket, otherCustomerToken)).sha256 === publicFile.sha256);
  const revokedAccess = successful(await call('access', body(), otherCustomerToken), '停用前申请独立下载凭据');
  secrets.push(revokedAccess.downloadTicket);
  await context.action(otherCustomer.account, 'disable');
  denied(await download(revokedAccess.downloadTicket, otherCustomerToken), 401, '停用客户门户账号后已颁发下载凭据不能使用');
  const raceTicket = await issue();
  const race = await Promise.all(Array.from({ length: 3 }, () => download(raceTicket)));
  check('真实Redis三请求竞争一次性凭据只下载一次', race.filter(response => response.status === 200 && response.sha256 === publicFile.sha256).length === 1
    && race.filter(response => response.status === 404).length === 2);
  const expiredTicket = await issue();
  await minute();
  denied(await download(expiredTicket), 404, '真实等待超过60秒后下载凭据失效');
  const withdrawnTicket = await issue();
  await withdraw(record);
  denied(await download(withdrawnTicket), 404, '撤回发布后先前生成的下载凭据立即失效');
  check('撤回同步清除公开附件选择', current(record.id).selectedFiles == null);
  await publish(record, versionId, admin, [publicFile.id]);
  const oldPublication = await issue();
  await publish(record, versionId, admin, [publicFile.id]);
  denied(await download(oldPublication), 404, '相同版本重新发布仍令旧发布批次凭据失效');
  const changedTicket = await issue();
  await publish(record, versionId, admin, [privateFile.id]);
  denied(await download(changedTicket), 404, '更改勾选清单后旧文件下载凭据立即失效');
  const changed = successful(await readPortal(`/${record.id}`), '读取更新后的选择');
  check('更改公开清单不会自动公开其他版本附件', changed.attachments.length === 1 && changed.attachments[0].fileId === privateFile.id);
  await publish(record, versionId, admin, [publicFile.id]);
  const deletedTicket = await issue();
  database(`UPDATE sys_file SET deleted=1 WHERE tenant_id=100000 AND file_id=${publicFile.id} AND create_by='g_import_admin';`);
  try {
    denied(await download(deletedTicket), 404, '文件被删除后旧下载凭据不能读取');
    check('已删除附件从门户可读清单移除', successful(await readPortal(`/${record.id}`), '文件删除后的正文').attachments.length === 0);
  } finally { database(`UPDATE sys_file SET deleted=0 WHERE tenant_id=100000 AND file_id=${publicFile.id} AND create_by='g_import_admin';`); }
  const movedTicket = await issue();
  database(`UPDATE sys_file SET tenant_id=100001 WHERE tenant_id=100000 AND file_id=${publicFile.id} AND create_by='g_import_admin';`);
  try { denied(await download(movedTicket), 404, '文件归属其他租户后不能继续使用旧凭据'); }
  finally { database(`UPDATE sys_file SET tenant_id=100000 WHERE tenant_id=100001 AND file_id=${publicFile.id} AND create_by='g_import_admin';`); }
  await minute();
  for (let count = 0; count < 20; count++) {
    const access = successful(await call('access', body()), '文件每分钟20次边界内');
    secrets.push(access.downloadTicket);
  }
  denied(await call('access', body(), token, { 'X-Forwarded-For': '198.51.100.99' }), 429, '第二十一次文件请求被真实限流且伪造IP无效');
  check('文件限流独立于普通知识读取', (await readPortal(`/${record.id}`)).status === 200);
  const downloads = await waitFor(() => Number(database(`SELECT COUNT(*) FROM sys_log WHERE log_id>${operationBefore} AND tenant_id=100000
    AND create_by=${sql('portal:' + portalUserId)} AND request_uri='/portal/file/download' AND result_code=200;`)), count => count >= 3, '文件下载独立访问审计未落库');
  check('下载操作使用门户身份独立审计', downloads >= 3);
  evidence.attachmentPublication = true;
  evidence.fileRateLimit = true;
  evidence.fileTicketRace = true;
  console.log(`H3_KNOWLEDGE_FILE_RESULT: downloads=${downloads}; selected=1; internal_only=1; lifetime_seconds=60; request_limit=20; race_requests=3; byte_comparison=true; raw_file_urls=false; boundary_sql=current_case_only; tag=${caseTag}`);
  await minute();
  assert.equal(current(record.id).externalVersionId, versionId);
}
