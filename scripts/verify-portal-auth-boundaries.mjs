import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

export async function verifyPortalBoundaries({ createBusiness, invite, row, action, message, messageIds, activation, portalCall, login,
  successful, denied, api, admin, database, check, sql, waitFor, snapshot, smtpDirectory, tenantCode, password, caseTag, evidence }) {
  const expired = await createBusiness('expiry');
  let before = await messageIds();
  const pending = await invite(expired);
  const expiredToken = activation(await message(expired, before));
  check('真实邮件送达后邀请剩余有效期在840—900秒内', database(`SELECT TIMESTAMPDIFF(SECOND,NOW(),activate_expire_time) BETWEEN 840 AND 900 FROM sys_portal_user WHERE tenant_id=100000 AND portal_user_id=${pending.portalUserId};`) === '1');
  database(`UPDATE sys_portal_user SET activate_expire_time=DATE_SUB(NOW(),INTERVAL 1 SECOND) WHERE tenant_id=100000 AND portal_user_id=${pending.portalUserId} AND status='PENDING';`);
  denied(await portalCall(`/portal/${tenantCode}/activate`, { activationToken: expiredToken, password }), 400, '截止时间边界输入后真实过期邀请不能激活');
  check('过期邀请未写密码或消费时间且管理页说明过期', database(`SELECT CONCAT(status,':',password_hash IS NULL,':',activate_consumed_time IS NULL) FROM sys_portal_user WHERE tenant_id=100000 AND portal_user_id=${pending.portalUserId};`) === 'PENDING:1:1'
    && (await row(expired.account)).pendingReason.includes('已过期'));
  before = await messageIds();
  await action(expired.account, 'resend');
  const renewedToken = activation(await message(expired, before));
  check('过期后明确重发产生不同的真实邮件令牌', renewedToken !== expiredToken);
  denied(await portalCall(`/portal/${tenantCode}/activate`, { activationToken: expiredToken, password }), 400, '过期后的旧邀请仍不能激活');
  successful(await portalCall(`/portal/${tenantCode}/activate`, { activationToken: renewedToken, password }), '过期后新邀请真实激活');
  evidence.invitationExpiry = true;

  const updateContact = async changes => successful(await api(admin, '/crm/contact', { method: 'PUT', body: {
    contactId: expired.contactId, customerId: expired.customerId, contactName: expired.name, email: expired.email, status: 'ACTIVE',
    version: Number(database(`SELECT version FROM crm_contact WHERE tenant_id=100000 AND contact_id=${expired.contactId};`)), ...changes,
  } }), '通过真实CRM接口变更本次联系人');
  let token = await login(expired);
  try {
    await updateContact({ email: `changed-${caseTag}@example.test` });
    denied(await portalCall('/portal/session', undefined, token), 401, '联系人验证邮箱变更立即撤销旧会话');
    denied(await portalCall(`/portal/${tenantCode}/login`, { loginAccount: expired.account, password }), 401, '原邮箱身份不能在资料不一致时重新登录');
  } finally { await updateContact({}); }
  denied(await portalCall('/portal/session', undefined, token), 401, '恢复联系人邮箱不恢复已撤销的旧会话');
  token = await login(expired);
  const destination = await createBusiness('destination');
  try {
    await updateContact({ customerId: destination.customerId });
    denied(await portalCall('/portal/session', undefined, token), 401, '联系人改属另一客户后原客户会话立即失效');
    denied(await portalCall(`/portal/${tenantCode}/login`, { loginAccount: expired.account, password }), 401, '客户关系不一致时正确密码也不能登录');
  } finally { await updateContact({}); }
  denied(await portalCall('/portal/session', undefined, token), 401, '恢复客户关系不恢复已撤销的会话');
  token = await login(expired);
  check('客户及邮箱重新一致后仅新登录会话可用', successful(await portalCall('/portal/session', undefined, token), '重新核验可信客户关系').loginAccount === expired.account);
  evidence.contactChanges = true;

  const mode = async value => {
    assert.ok(['ACCEPT', 'TEMPORARY'].includes(value));
    await fs.writeFile(path.join(smtpDirectory, 'control.json'), JSON.stringify({ mode: value }));
    await waitFor(snapshot, current => current.mode === value, '隔离邮件协议模式未生效');
  };
  const revoked = await createBusiness('revoked');
  try {
    await mode('TEMPORARY');
    const invitation = await invite(revoked);
    const delivery = await waitFor(() => {
      const value = database(`SELECT JSON_OBJECT('id',delivery.delivery_id,'status',delivery.status,'attempts',delivery.attempt_count)
        FROM sys_message_delivery delivery JOIN sys_message_record record ON record.tenant_id=delivery.tenant_id AND record.record_id=delivery.record_id
        WHERE record.tenant_id=100000 AND record.biz_type='PORTAL_ACTIVATION' AND record.biz_id=${sql(invitation.portalUserId)} ORDER BY delivery.delivery_id DESC LIMIT 1;`);
      return value ? JSON.parse(value) : undefined;
    }, value => value?.status === 'RETRYABLE', '真实临时邮件拒收未进入安全重试');
    check('真实SMTP暂时拒收保留一次实际外发尝试且账号仍待激活', delivery.attempts === 1 && (await row(revoked.account)).status === 'PENDING');
    await action(revoked.account, 'disable');
    await mode('ACCEPT');
    database(`UPDATE sys_message_delivery SET next_attempt_time=NOW() WHERE tenant_id=100000 AND delivery_id=${delivery.id} AND status='RETRYABLE';`);
    const recoveryJob = Number(database("SELECT job_id FROM sys_job WHERE tenant_id=100000 AND handler_name='messageDeliveryRecovery' AND deleted=0;"));
    assert.ok(Number.isSafeInteger(recoveryJob) && recoveryJob > 0);
    successful(await api(admin, `/auth/system/job/${recoveryJob}/trigger`, { method: 'POST', body: {} }), '真实调度重新核验已撤销门户邀请');
    const recovered = await waitFor(() => JSON.parse(database(`SELECT JSON_OBJECT('status',status,'attempts',attempt_count,'reason',last_error_code) FROM sys_message_delivery WHERE tenant_id=100000 AND delivery_id=${delivery.id};`)),
      value => value.status === 'SKIPPED', '停用邀请未在真实重试发送前被拒绝');
    check('停用后的排队邀请被明确跳过且未再次连接外发', recovered.reason === 'PORTAL_INVITATION_INVALID' && recovered.attempts === 1
      && !(await snapshot()).messages.some(value => value.to?.includes(revoked.email)));
    evidence.revokedDelivery = true;
  } finally { await mode('ACCEPT'); }
  console.log('H3_PORTAL_SECURITY_BOUNDARIES: invitation_expiry_input=true; contact_changes=real_crm_http; revoked_delivery=real_job_and_tls_smtp; api_doubles=0; production_modified=false');
}
