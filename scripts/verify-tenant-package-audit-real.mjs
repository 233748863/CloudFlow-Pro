import assert from 'node:assert/strict';

export async function verifyTenantPackageAudit({ admin, api, successful, database, check, caseTag, packageId, targetId, snapshot, evidence }) {
  assert.match(caseTag, /^[a-f0-9]{12}$/);
  for (const identifier of [packageId, targetId]) assert.ok(Number.isSafeInteger(identifier) && identifier > 0);
  const base = '/auth/system/tenant-package';
  const trigger = `h5_package_audit_${caseTag}`;
  const sql = value => `CONVERT(UNHEX('${Buffer.from(String(value)).toString('hex')}') USING utf8mb4)`;
  const auditCount = (name, field) => Number(database(`SELECT COUNT(*) FROM sys_audit_log WHERE tenant_id=100000 AND audit_name=${sql(name)} AND audit_field=${sql(field)};`));
  const triggerCount = () => database(`SELECT COUNT(*) FROM information_schema.triggers WHERE trigger_schema=DATABASE() AND trigger_name=${sql(trigger)};`);
  const safeFailure = (response, label) => check(label, response.status === 500 && response.body?.code === 500
    && response.body?.data == null && /^服务异常，请联系管理员，traceId=[a-zA-Z0-9_-]+$/.test(response.body?.msg || '')
    && !/H5_OWNED_PACKAGE_AUDIT_FAILURE|sys_audit_log|SQLException|Mapper|INSERT|SQL state/i.test(JSON.stringify(response.body)));
  const withAuditFailure = async (name, field, operation) => {
    assert.equal(triggerCount(), '0', 'Scoped audit trigger must not already exist');
    database(`DELIMITER $$
      CREATE TRIGGER ${trigger} BEFORE INSERT ON sys_audit_log FOR EACH ROW BEGIN
        IF NEW.tenant_id=100000 AND NEW.audit_name=${sql(name)} AND NEW.audit_field=${sql(field)} THEN
          SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='H5_OWNED_PACKAGE_AUDIT_FAILURE';
        END IF;
      END$$
      DELIMITER ;`);
    let operationFailure;
    let cleanupFailure;
    try { await operation(); } catch (error) { operationFailure = error; }
    finally {
      try {
        database(`DROP TRIGGER ${trigger};`);
        check('仅移除本次套餐审计故障触发器', triggerCount() === '0');
      } catch (error) { cleanupFailure = error; }
    }
    if (operationFailure && cleanupFailure) throw new AggregateError([operationFailure, cleanupFailure], 'Package audit verification and scoped cleanup both failed');
    if (operationFailure) throw operationFailure;
    if (cleanupFailure) throw cleanupFailure;
  };
  const beforeTemplate = successful(await api(admin, `${base}/${packageId}`), '读取套餐审计故障前模板');
  const fields = ['packageId', 'version', 'packageCode', 'packageName', 'menuIds', 'enabledModules', 'maxUsers', 'maxStorageMb', 'price', 'billingCycle', 'sortNo', 'status', 'remark'];
  const update = { ...Object.fromEntries(fields.map(field => [field, beforeTemplate[field]])), remark: `隔离审计验证${caseTag}` };
  const templateAuditField = `tenant_package:${packageId}`;
  const templateAudits = auditCount('TENANT_PACKAGE_TEMPLATE_UPDATED', templateAuditField);
  const beforeTenant = snapshot(targetId);
  await withAuditFailure('TENANT_PACKAGE_TEMPLATE_UPDATED', templateAuditField, async () => {
    safeFailure(await api(admin, base, { method: 'PUT', body: update }), '模板真实审计写入失败返回安全错误');
    const after = successful(await api(admin, `${base}/${packageId}`), '失败后重新读取实际模板');
    check('模板审计失败整笔撤回版本及内容且保留租户', JSON.stringify(after) === JSON.stringify(beforeTemplate)
      && JSON.stringify(snapshot(targetId)) === JSON.stringify(beforeTenant)
      && auditCount('TENANT_PACKAGE_TEMPLATE_UPDATED', templateAuditField) === templateAudits);
  });
  await new Promise(resolve => setTimeout(resolve, 5100));
  const updated = successful(await api(admin, base, { method: 'PUT', body: update }), '撤回审计故障后原模板请求可成功');
  check('模板恢复仅更新一次版本并保存一条业务审计', updated.version === beforeTemplate.version + 1
    && auditCount('TENANT_PACKAGE_TEMPLATE_UPDATED', templateAuditField) === templateAudits + 1);

  const batch = successful(await api(admin, `${base}/${packageId}/sync-preview`, { method: 'POST', body: { tenantIds: [targetId] } }), '创建审计故障专项真实同步预览');
  assert.ok(Number.isSafeInteger(batch.syncId) && batch.syncId > 0);
  const batchField = `tenant_package_sync:${batch.syncId}`;
  const confirm = () => api(admin, `${base}/sync/${batch.syncId}/confirm`, { method: 'POST', body: { previewHash: batch.preview.hash } });
  const read = async () => successful(await api(admin, `${base}/sync/${batch.syncId}`), '按原批次读取实际审计故障结果');
  await withAuditFailure('TENANT_PACKAGE_CONFIRM', batchField, async () => {
    safeFailure(await confirm(), '同步确认真实审计失败返回安全错误');
    check('确认审计失败保留完整预览及目标租户', JSON.stringify(await read()) === JSON.stringify(batch)
      && JSON.stringify(snapshot(targetId)) === JSON.stringify(beforeTenant)
      && auditCount('TENANT_PACKAGE_CONFIRM', batchField) === 0);
  });
  await new Promise(resolve => setTimeout(resolve, 5100));
  await withAuditFailure('TENANT_PACKAGE_ITEM_APPLIED', batchField, async () => {
    const failed = successful(await confirm(), '单户审计失败返回可恢复批次');
    check('单户审计失败明确标为未完成且实际租户整笔撤回', failed.status === 'PARTIAL' && failed.items.length === 1
      && failed.items[0].status === 'FAILED' && failed.items[0].errorCode === 'APPLY_FAILED'
      && JSON.stringify(snapshot(targetId)) === JSON.stringify(beforeTenant)
      && auditCount('TENANT_PACKAGE_ITEM_APPLIED', batchField) === 0
      && auditCount('TENANT_PACKAGE_ITEM_FAILED', batchField) === 1);
  });
  await new Promise(resolve => setTimeout(resolve, 5100));
  const resumed = successful(await confirm(), '故障移除后继续同一同步批次');
  const afterTenant = snapshot(targetId);
  check('恢复同批次实际应用一次并保存业务审计', resumed.status === 'COMPLETED'
    && resumed.items.length === 1 && resumed.items[0].status === 'APPLIED'
    && afterTenant.version === beforeTenant.version + 1 && afterTenant.package_version === updated.version
    && auditCount('TENANT_PACKAGE_ITEM_APPLIED', batchField) === 1);
  await new Promise(resolve => setTimeout(resolve, 5100));
  const repeated = successful(await confirm(), '重读已完成审计恢复批次');
  check('审计故障恢复后重复确认不重复应用或入审计', repeated.status === 'COMPLETED'
    && JSON.stringify(snapshot(targetId)) === JSON.stringify(afterTenant)
    && auditCount('TENANT_PACKAGE_ITEM_APPLIED', batchField) === 1);
  evidence.auditHttp = true;
  evidence.auditRollback = true;
  evidence.auditRetry = true;
  evidence.auditCleanup = true;
}
