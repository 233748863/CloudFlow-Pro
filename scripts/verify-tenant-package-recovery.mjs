import assert from 'node:assert/strict';

export async function verifyTenantPackageRecovery({ admin, api, successful, check, packageId, targetId, createdTenantId, snapshot,
  saveTenant, quotaTemplate, account, evidence }) {
  const base = '/auth/system/tenant-package';
  const lastPreviews = new Map();
  const preview = async tenantIds => {
    const key = JSON.stringify(tenantIds);
    const remaining = (lastPreviews.get(key) ?? 0) + 5100 - Date.now();
    if (remaining > 0) await new Promise(resolve => setTimeout(resolve, remaining));
    const result = successful(await api(admin, `${base}/${packageId}/sync-preview`, { method: 'POST', body: { tenantIds } }), '真实生成恢复边界预览');
    lastPreviews.set(key, Date.now());
    return result;
  };
  const confirm = batch => api(admin, `${base}/sync/${batch.syncId}/confirm`, { method: 'POST', body: { previewHash: batch.preview.hash } });
  const cancel = async batch => successful(await api(admin, `${base}/sync/${batch.syncId}/cancel`, { method: 'POST', body: { previewHash: batch.preview.hash } }), '取消未应用项');
  const overrides = snapshot(targetId).package_override;
  assert.ok(overrides && typeof overrides === 'object' && Array.isArray(overrides.addMenuIds));
  const partialPreview = await preview([targetId, createdTenantId]);
  const untouched = snapshot(createdTenantId);
  successful(await saveTenant(targetId, quotaTemplate, overrides), '预览后通过真实接口调整目标租户版本');
  const changed = snapshot(targetId);
  const partial = successful(await confirm(partialPreview), '真实逐项应用并记录单户冲突');
  check('真实两户同步一户冲突、一户应用，冲突租户不被覆盖', partial.status === 'PARTIAL' && partial.items.length === 2
    && partial.items.some(item => item.tenantId === targetId && item.status === 'CONFLICT' && item.errorCode === 'TENANT_VERSION_CONFLICT')
    && partial.items.some(item => item.tenantId === createdTenantId && item.status === 'APPLIED')
    && JSON.stringify(snapshot(targetId)) === JSON.stringify(changed) && snapshot(createdTenantId).version === untouched.version + 1);
  const applied = snapshot(createdTenantId);
  const continued = successful(await confirm(partialPreview), '继续部分完成批次');
  check('继续原批次不重复应用已成功项，不跳过已有冲突', continued.status === 'PARTIAL'
    && JSON.stringify(snapshot(targetId)) === JSON.stringify(changed) && JSON.stringify(snapshot(createdTenantId)) === JSON.stringify(applied));
  const cancelled = await cancel(partialPreview);
  check('取消只停止未应用项，已成功租户保持原结果', cancelled.status === 'CANCELLED'
    && JSON.stringify(snapshot(createdTenantId)) === JSON.stringify(applied));
  const cancelledWrite = await confirm(partialPreview);
  check('已取消批次不能继续写入', cancelledWrite.status === 409 && cancelledWrite.body?.code === 409
    && JSON.stringify(snapshot(targetId)) === JSON.stringify(changed));

  const outdated = await preview([targetId]);
  const allowedFields = ['packageId', 'version', 'packageCode', 'packageName', 'menuIds', 'enabledModules', 'maxUsers', 'maxStorageMb', 'price', 'billingCycle', 'sortNo', 'status', 'remark'];
  const nextRequest = Object.fromEntries(allowedFields.map(field => [field, quotaTemplate[field]]));
  const nextTemplate = successful(await api(admin, base, { method: 'PUT', body: nextRequest }), '真实更新模板使原预览失效');
  const rejected = await confirm(outdated);
  check('模板版本更新后原预览不能确认', rejected.status === 409 && rejected.body?.code === 409
    && JSON.stringify(snapshot(targetId)) === JSON.stringify(changed));
  await cancel(outdated);
  const concurrent = await preview([targetId]);
  const responses = await Promise.all([confirm(concurrent), confirm(concurrent)]);
  check('真实并发确认同一批次只增加一次租户版本', responses.every(response => response.status === 200 && response.body?.code === 200 && response.body.data.status === 'COMPLETED')
    && snapshot(targetId).version === changed.version + 1 && snapshot(targetId).package_version === nextTemplate.version);
  evidence.syncRecovery = true;

  const expiring = await preview([targetId]);
  const createdAt = Date.parse(expiring.preview.createdAt);
  const expiresAt = Date.parse(expiring.preview.expiresAt);
  check('真实预览有效期精确300秒', Number.isFinite(createdAt) && expiresAt - createdAt === 300000);
  const beforeExpiry = snapshot(targetId);
  const remaining = expiresAt - Date.now() + 1000;
  assert.ok(remaining > 0 && remaining <= 301000);
  console.log(`H5_TENANT_PACKAGE_NATURAL_EXPIRY_WAIT: milliseconds=${remaining}; clock_modified=false; database_time_modified=false`);
  await new Promise(resolve => setTimeout(resolve, remaining));
  const expiredIdentity = await api(admin, `${base}/list`);
  check('自然等待后平台再次验证凭据已过期', expiredIdentity.status === 403 && expiredIdentity.body?.code === 403);
  successful(await api(admin, '/auth/system/platform/access/reauthenticate', { method: 'POST', body: { password: account.password } }), '预览过期后重新真实密码验证');
  const expired = await confirm(expiring);
  check('重新验证身份后仍禁止确认已自然过期预览', expired.status === 409 && expired.body?.code === 409
    && JSON.stringify(snapshot(targetId)) === JSON.stringify(beforeExpiry) && Date.now() >= expiresAt);
  const completed = successful(await confirm(concurrent), '过期后读取既有已确认批次');
  check('已确认成功批次跨过300秒仍能恢复且不重复写入', completed.status === 'COMPLETED'
    && JSON.stringify(snapshot(targetId)) === JSON.stringify(beforeExpiry));
  await cancel(expiring);
  evidence.naturalExpiry = true;
}
