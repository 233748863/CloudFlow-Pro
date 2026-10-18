import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

export async function verifyTenantPackageOperators({ admin, api, successful, rejected, session, database, check,
  state, accounts, packageId, targetId, snapshot, request, template, redis, proofKey, secretValues, evidence }) {
  const base = '/auth/system/tenant-package';
  const access = '/auth/system/platform/access';
  const secondAccount = accounts.find(item => item.username === 'g_import_other');
  assert.equal(secondAccount.userId, 990000702);
  const configurationPath = path.join(state.run, 'auth/integration.properties');
  const configuration = await fs.readFile(configurationPath, 'utf8');
  const property = name => configuration.split(/\r?\n/).filter(line => line.startsWith(`${name}=`)).at(-1)?.slice(name.length + 1);
  assert.equal(property('management.server.address'), '127.0.0.1');
  assert.equal(property('cloudflow.platform.access.management-tenant-id'), '100000');
  assert.equal(property('cloudflow.platform.access.administrator-user-ids'), '990000701,990000702');
  assert.equal(property('management.endpoint.env.post.enabled'), 'true');
  assert.equal(property('management.endpoint.env.show-values'), 'never');
  const managementPort = Number(property('management.server.port'));
  assert.ok(Number.isSafeInteger(managementPort) && managementPort > 1024 && managementPort < 65536);
  const configurationHash = createHash('sha256').update(configuration).digest('hex');
  const authOwner = state.processes.find(item => item.name === 'auth');
  assert.ok(authOwner && Number.isSafeInteger(authOwner.id) && authOwner.id > 0);
  const second = await session(secondAccount.username);
  let secondProofKey;
  let verificationFailure;
  const batchSnapshot = () => database(`SELECT JSON_OBJECT('sync',sync_id,'owner',requested_by,'hash',preview_hash,
    'status',status,'confirmed',confirmed_time,'updated',update_time,'updatedBy',update_by)
    FROM sys_tenant_package_sync WHERE tenant_id=100000 AND package_id=${packageId} ORDER BY sync_id;`);
  const itemSnapshot = () => database(`SELECT JSON_OBJECT('item',i.item_id,'status',i.status,'error',i.error_code,
    'before',i.before_snapshot,'proposed',i.proposed_snapshot,'applied',i.applied_time,'updated',i.update_time,'updatedBy',i.update_by)
    FROM sys_tenant_package_sync_item i JOIN sys_tenant_package_sync b ON b.sync_id=i.sync_id AND b.tenant_id=i.tenant_id
    WHERE b.tenant_id=100000 AND b.package_id=${packageId} ORDER BY i.item_id;`);
  const auditSnapshot = () => database(`SELECT JSON_OBJECT('id',a.audit_id,'name',a.audit_name,'actor',a.create_by,
    'before',a.before_val,'after',a.after_val) FROM sys_audit_log a
    JOIN sys_tenant_package_sync b ON a.audit_field=CONCAT('tenant_package_sync:',b.sync_id) AND a.tenant_id=b.tenant_id
    WHERE b.tenant_id=100000 AND b.package_id=${packageId} ORDER BY a.audit_id;`);
  const businessSnapshot = () => JSON.stringify({ tenant: snapshot(targetId), batches: batchSnapshot(), items: itemSnapshot(), audits: auditSnapshot() });
  const previewTimes = new Map([[admin, Date.now()]]);
  const preview = async (actor, label) => {
    const wait = (previewTimes.get(actor) || 0) + 5100 - Date.now();
    if (wait > 0) await new Promise(resolve => setTimeout(resolve, wait));
    const result = successful(await api(actor, `${base}/${packageId}/sync-preview`, { method: 'POST', body: { tenantIds: [targetId] } }), label);
    previewTimes.set(actor, Date.now());
    check(`${label}保持待确认且记录真实发起人`, result.status === 'PREVIEWED'
      && Number(database(`SELECT requested_by FROM sys_tenant_package_sync WHERE sync_id=${result.syncId} AND tenant_id=100000 AND package_id=${packageId};`))
        === (actor === admin ? 990000701 : secondAccount.userId));
    return result;
  };
  const action = (actor, batch, operation) => api(actor, `${base}/sync/${batch.syncId}${operation ? `/${operation}` : ''}`,
    operation ? { method: 'POST', body: { previewHash: batch.preview.hash } } : {});
  const denyForeign = async (actor, batch, phase) => {
    const before = businessSnapshot();
    for (const operation of ['', 'confirm', 'cancel']) {
      const response = await action(actor, batch, operation);
      rejected(response, 404, `${phase}不能${operation || '读取'}他人同步批次`);
      check(`${phase}${operation || '读取'}不泄漏预览内容`, response.cacheControl === 'no-store'
        && response.body.msg === '同步预览不存在或不属于当前平台账号');
    }
    check(`${phase}拒绝后租户、批次、明细和业务审计不变`, businessSnapshot() === before);
  };
  const updateAllowlist = async value => {
    assert.ok(['990000702', ''].includes(value));
    const response = await fetch(`http://127.0.0.1:${managementPort}/actuator/env`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'cloudflow.platform.access.administrator-user-ids', value }),
      signal: AbortSignal.timeout(30000),
    });
    // 配置接口仅触发Spring Cloud实时重绑定，不替换业务响应或直接调用身份服务。
    await response.arrayBuffer();
    assert.equal(response.status, 200, 'Owned management endpoint must apply the allowlist update');
    const currentState = JSON.parse((await fs.readFile(path.join(state.run, 'state.json'), 'utf8')).replace(/^\uFEFF/, ''));
    check('名单更新未重启认证服务且未改部署配置文件', currentState.processes.find(item => item.name === 'auth')?.id === authOwner.id
      && createHash('sha256').update(await fs.readFile(configurationPath)).digest('hex') === configurationHash);
  };
  try {
    const rawToken = await second.evaluate(async () => (await import('/src/utils/authStorage.ts')).getAuthToken());
    const token = rawToken.replace(/^Bearer /, '');
    secretValues.add(token);
    secondProofKey = `auth:platform:recent:internal:${createHash('sha256').update(token).digest('hex')}`;
    assert.notEqual(secondProofKey, proofKey);
    const beforeIdentity = successful(await api(second, access), '第二名平台管理员读取身份状态');
    check('第二名管理员重新登录仍须本人再次验证', beforeIdentity.configured && !beforeIdentity.verified
      && redis('EXISTS', proofKey) === '1' && redis('EXISTS', secondProofKey) === '0');
    rejected(await api(second, `${base}/list`), 403, '第二名管理员不能借用第一人的有效凭据');
    const identity = successful(await api(second, `${access}/reauthenticate`, { method: 'POST', body: { password: secondAccount.password } }), '第二名管理员真实密码再次验证');
    const info = successful(await api(second, '/auth/info'), '读取第二名管理员真实身份及权限');
    check('两名不同平台管理员均有独立有效凭据及同步权限', identity.verified && info.user.userId === secondAccount.userId
      && info.user.tenantId === 100000 && info.permissions.includes('system:tenant-package:sync')
      && redis('EXISTS', proofKey) === '1' && redis('EXISTS', secondProofKey) === '1');
    successful(await api(second, `${base}/${packageId}`), '第二名管理员可读取公共套餐模板');
    const firstBatch = await preview(admin, '第一名管理员建立自己的批次');
    const secondBatch = await preview(second, '第二名管理员建立自己的批次');
    await denyForeign(second, firstBatch, '第二人对第一人待确认批次');
    await denyForeign(admin, secondBatch, '第一人对第二人待确认批次');
    const own = successful(await action(second, secondBatch, ''), '第二名管理员能读取自己的批次');
    check('本人读取返回原批次与预览摘要', own.syncId === secondBatch.syncId && own.preview.hash === secondBatch.preview.hash);
    const beforeVersion = snapshot(targetId).version;
    const confirmed = successful(await action(second, secondBatch, 'confirm'), '第二名管理员确认自己的批次');
    check('第二名管理员真实应用且目标租户只更新一次', confirmed.status === 'COMPLETED'
      && confirmed.items.length === 1 && confirmed.items[0].status === 'APPLIED' && snapshot(targetId).version === beforeVersion + 1);
    const confirmedSnapshot = businessSnapshot();
    successful(await action(second, secondBatch, 'confirm'), '第二名管理员重复确认读取原结果');
    check('本人重复确认不重复更新或新增同步审计', businessSnapshot() === confirmedSnapshot);
    const cancelled = successful(await action(admin, firstBatch, 'cancel'), '第一名管理员取消自己的旧预览');
    check('本人取消成功且不改变已同步租户版本', cancelled.status === 'CANCELLED' && snapshot(targetId).version === beforeVersion + 1);
    await denyForeign(admin, secondBatch, '第一人对第二人已完成批次');
    await denyForeign(second, firstBatch, '第二人对第一人已取消批次');
    check('所有同步业务审计均归属于批次真实发起人', database(`SELECT COUNT(*) FROM sys_audit_log a
      JOIN sys_tenant_package_sync b ON a.audit_field=CONCAT('tenant_package_sync:',b.sync_id) AND a.tenant_id=b.tenant_id
      WHERE b.tenant_id=100000 AND b.package_id=${packageId} AND a.create_by<>CAST(b.requested_by AS CHAR);`) === '0');
    evidence.operatorOwnership = true;
    const pendingFirst = await preview(admin, '撤销前第一人建立待处理批次');
    const pendingSecond = await preview(second, '撤销前第二人建立待处理批次');
    const proofTtl = Number(redis('TTL', proofKey));
    check('撤销前两人凭据仍在有效期内', proofTtl > 30 && Number(redis('TTL', secondProofKey)) > 30);
    const beforeRevocation = businessSnapshot();
    await updateAllowlist('990000702');
    check('仅撤销一人名单时批次、租户和审计尚未改变', businessSnapshot() === beforeRevocation);
    rejected(await api(admin, access), 403, '名单实时撤销后原平台身份立即拒绝');
    rejected(await api(admin, `${base}/list`), 403, '名单实时撤销后原会话不能读取套餐列表');
    rejected(await api(admin, `${base}/${packageId}`), 403, '名单实时撤销后原会话不能读取套餐模板');
    rejected(await api(admin, base, { method: 'PUT', body: { ...request, packageId, version: template.version, remark: '撤销身份必须拒绝' } }), 403, '名单实时撤销后原会话不能修改套餐');
    rejected(await api(admin, `${base}/${packageId}/sync-preview`, { method: 'POST', body: { tenantIds: [targetId] } }), 403, '名单实时撤销后原会话不能新建同步预览');
    for (const operation of ['', 'confirm', 'cancel']) {
      rejected(await action(admin, pendingFirst, operation), 403, `名单实时撤销后原会话不能${operation || '读取'}自己的待处理批次`);
    }
    rejected(await api(admin, `${access}/reauthenticate`, { method: 'POST', body: { password: accounts.find(item => item.username === 'g_import_admin').password } }), 403, '撤销身份后正确密码也不能重新取得平台资格');
    check('被撤销者全部拒绝且没有业务变更', businessSnapshot() === beforeRevocation
      && Number(redis('TTL', proofKey)) > 0);
    const retained = successful(await api(second, access), '仍在名单中的第二人读取原身份');
    check('第二人的原会话及独立凭据保持有效', retained.configured && retained.verified && redis('EXISTS', secondProofKey) === '1');
    successful(await api(second, `${base}/list`), '仍在名单中的第二人继续读取套餐');
    await denyForeign(second, pendingFirst, '撤销第一人后第二人');
    const resumed = successful(await action(second, pendingSecond, 'confirm'), '第二人使用原会话处理自己的待办');
    check('撤销另一管理员不阻止本人同步', resumed.status === 'COMPLETED' && resumed.items[0].status === 'APPLIED');
    const beforeEmpty = businessSnapshot();
    await updateAllowlist('');
    for (const actor of [admin, second]) {
      // 平台租户当前只有员工功能套餐；空名单移除控制面权限后，入口鉴权先返回403。
      // 原租户套餐恢复后的明确503停用状态由外层包装器独立复验。
      rejected(await api(actor, access), 403, '运行中清空名单后受限套餐旧会话无平台身份入口');
      rejected(await api(actor, `${base}/list`), 403, '运行中清空名单后受限套餐旧会话不能读取套餐');
    }
    check('清空名单保留未完成批次且不产生业务变更', businessSnapshot() === beforeEmpty);
    check('动态撤销期间两个浏览器未更换原登录令牌', (await second.evaluate(async () => (await import('/src/utils/authStorage.ts')).getAuthToken())).replace(/^Bearer /, '') === token
      && `auth:platform:recent:internal:${createHash('sha256').update((await admin.evaluate(async () => (await import('/src/utils/authStorage.ts')).getAuthToken())).replace(/^Bearer /, '')).digest('hex')}` === proofKey);
    evidence.liveAllowlistRevocation = true;
    console.log('H5_OPERATOR_BOUNDARY: actors=2; operations=read,confirm,cancel; ownership_bidirectional=true; live_configuration_rebind=true; restart_during_revocation=false; original_sessions=true; revoked_password_rejected=true; remaining_actor_operational=true; empty_allowlist_rejects_old_sessions=true; nacos_transport_tested=false; interface_doubles=0');
  } catch (error) {
    verificationFailure = error;
    throw error;
  } finally {
    const failures = [];
    try { if (secondProofKey) redis('DEL', secondProofKey); } catch (error) { failures.push(error); }
    try { await second.context().close(); } catch (error) { failures.push(error); }
    if (failures.length) throw new AggregateError([...(verificationFailure ? [verificationFailure] : []), ...failures], '第二名平台操作者清理失败');
  }
}
