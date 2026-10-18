import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { tenantPackageBoundFiles } from './verify-tenant-package-bound-files.mjs';
import { additionalUploadPermissions, verifyAdditionalUploadEntries } from './verify-tenant-package-upload-entries.mjs';
import { meetingPhotoPermissions, verifyMeetingPhotoCapacity } from './verify-tenant-package-meeting-photo.mjs';
import { workflowFilePermissions, verifyWorkflowFileCapacity } from './verify-tenant-package-workflow-file.mjs';
import { severancePolicyPermissions, verifySeverancePolicyCapacity } from './verify-tenant-package-severance-policy.mjs';
import { importFilePermissions, verifyImportFileCapacity } from './verify-tenant-package-import-files.mjs';
import { trainingAgreementPermissions, verifyTrainingAgreementCapacity } from './verify-tenant-package-training-agreement.mjs';
import { exitInterviewPermissions, verifyExitInterviewCapacity } from './verify-tenant-package-exit-interview.mjs';
import { advanceProofPermissions, verifyAdvanceProofCapacity } from './verify-tenant-package-advance-proof.mjs';
import { contractFilePermissions, verifyContractFileCapacity } from './verify-tenant-package-contract-files.mjs';
import { verifyImportGeneratedCapacity } from './verify-tenant-package-import-generated.mjs';

export async function verifyTenantPackageStorage({ admin, tenantAdmin, api, successful, database, check, caseTag, state,
  targetId, catalog, request, quotaTemplate, saveTenant, adjustments, snapshot, evidence, redis }) {
  const sql = value => `CONVERT(0x${Buffer.from(String(value)).toString('hex')} USING utf8mb4)`;
  const rows = statement => database(statement).split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
  const prefix = `${caseTag}-cross-`;
  const customerCode = `QUOTA_${caseTag}`;
  const trigger = `h5_quota_fault_${caseTag}`;
  const selected = new Set(quotaTemplate.menuIds);
  const permissions = ['hr:grievance:manage:handle', 'oa:rfq:edit', 'crm:email:send', 'crm:customer:add', 'crm:customer:remove'];
  const boundMode = process.argv.includes('--tenant-package-storage-bound-only');
  const importMode = process.argv.includes('--tenant-package-storage-import-only');
  const generatedMode = process.argv.includes('--tenant-package-storage-generated-only');
  if (importMode || generatedMode) permissions.push(...importFilePermissions);
  const hrMode = process.argv.includes('--tenant-package-storage-hr-only');
  if (hrMode) permissions.push(...trainingAgreementPermissions, ...exitInterviewPermissions, ...advanceProofPermissions);
  const contractMode = process.argv.includes('--tenant-package-storage-contract-only');
  if (contractMode) permissions.push(...contractFilePermissions);
  if (boundMode) permissions.push('hr:grievance:mine:create', 'hr:grievance:mine:list', 'oa:rfq:list', 'crm:email:list', 'crm:contact:add', ...additionalUploadPermissions, ...meetingPhotoPermissions, ...workflowFilePermissions, ...severancePolicyPermissions);
  for (const permission of permissions) {
    const feature = catalog.features.find(item => item.permissions === permission);
    assert.ok(feature, `Registered upload permission: ${permission}`);
    selected.add(feature.menuId);
    if (feature.menuType === 'F' && !feature.independentOperation) {
      let parent = catalog.features.find(item => item.menuId === feature.parentId);
      while (parent && parent.menuType !== 'C') parent = catalog.features.find(item => item.menuId === parent.parentId);
      assert.ok(parent, `Registered upload page: ${permission}`);
      selected.add(parent.menuId);
    }
  }
  const template = successful(await api(admin, '/auth/system/tenant-package', { method: 'PUT', body: {
    ...request, packageId: quotaTemplate.packageId, version: quotaTemplate.version, menuIds: [...selected],
    enabledModules: ['HR', 'OA', 'CRM', 'WORKFLOW'], remark: '四服务真实附件共享额度',
  } }), '新增四服务附件验证模板版本');
  const applyLimit = async maximum => successful(await saveTenant(targetId, template, { ...adjustments, maxUsers: 1, maxStorageMb: maximum }), '真实调整共享文件额度');
  let customerId;
  let failure;
  let triggerCreated = false;
  let bound;
  const definitions = [
    { service: 'AUTH', route: '/auth/system/file/upload', root: path.join(state.run, 'profile'), type: null },
    { service: 'HR', route: '/hr/grievances/files', root: path.join(state.run, 'hr/private-files'), type: 'HR_GRIEVANCE' },
    { service: 'OA', route: '/oa/rfq/invitation-files', root: path.join(state.run, 'profile/oa-private/RFQ_INVITATION'), type: 'OA_RFQ_INVITATION' },
    { service: 'CRM', route: null, root: path.join(state.run, 'profile/crm-private'), type: 'CRM_EMAIL_ATTACHMENT' },
  ];
  const metadata = () => rows(`SELECT JSON_OBJECT('id',file_id,'name',file_name,'path',file_path,'type',file_type,
    'business',biz_type,'businessId',biz_id,'url',url,'size',file_size,'deleted',deleted) FROM sys_file
    WHERE tenant_id=${targetId} AND file_name LIKE ${sql(prefix + '%')} ORDER BY file_id;`);
  const usage = () => Number(database(`SELECT COALESCE(SUM(file_size),0) FROM sys_file WHERE tenant_id=${targetId} AND deleted=0;`));
  const expectedBytes = new Map();
  const uploads = new Map();
  const uploadTimes = new Map();
  const upload = async (definition, suffix, size = 600000) => {
    const remaining = (uploadTimes.get(definition.service) || 0) + 5100 - Date.now();
    if (remaining > 0) await new Promise(resolve => setTimeout(resolve, remaining));
    const name = `${prefix}${definition.service}-${suffix}.pdf`;
    const bytes = Buffer.alloc(size, 32);
    Buffer.from(`%PDF-1.4\n${name}\n`).copy(bytes);
    expectedBytes.set(name, bytes);
    const response = await api(tenantAdmin, definition.route, { method: 'POST', file: { name, type: 'application/pdf', content: bytes.toString('base64') } });
    if (response.status === 200 && response.body?.code === 200) uploads.set(definition.service, response.body.data);
    uploadTimes.set(definition.service, Date.now());
    return { service: definition.service, response };
  };
  const succeeded = result => result.response.status === 200 && result.response.body?.code === 200;
  const uploadAll = async (suffix, size) => {
    const settled = await Promise.allSettled(definitions.map(item => upload(item, suffix, size)));
    const failures = settled.filter(item => item.status === 'rejected').map(item => item.reason);
    if (failures.length) throw new AggregateError(failures, '四服务上传请求异常，已等待全部请求结束');
    return settled.map(item => item.value);
  };
  const capacityRejected = result => result.response.status === 409 && result.response.body?.code === 409 && /存储空间不足/.test(result.response.body?.msg || '');
  const describe = results => results.map(item => ({ service: item.service, status: item.response.status, code: item.response.body?.code, message: item.response.body?.msg }));
  const walk = async directory => {
    const entries = await fs.readdir(directory, { withFileTypes: true }).catch(error => { if (error.code === 'ENOENT') return []; throw error; });
    const files = [];
    for (const entry of entries) {
      assert.ok(!entry.isSymbolicLink(), 'Storage snapshot rejects redirected paths');
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) files.push(...await walk(full));
      else if (entry.isFile()) files.push(full);
    }
    return files;
  };
  const physicalSnapshot = async () => [...new Set((await Promise.all(definitions.map(item => walk(item.root)))).flat())].sort();
  const physical = async file => {
    const definition = definitions.find(item => file.name.startsWith(`${prefix}${item.service}-`));
    assert.ok(definition && file.deleted === 0 && file.size > 0);
    if (definition.type) assert.equal(file.type, definition.type);
    const root = await fs.realpath(definition.root);
    assert.ok(root.startsWith(await fs.realpath(state.run) + path.sep));
    const target = await fs.realpath(definition.service === 'AUTH' ? path.resolve(root, file.path.replace(/^\//, '')) : file.path);
    assert.ok(target.startsWith(root + path.sep), 'Only owned isolated upload files may be inspected or removed');
    return { target, definition };
  };
  const originalBytes = usage();
  assert.equal(metadata().length, 0);
  try {
    await applyLimit(2);
    const info = successful(await api(tenantAdmin, '/auth/info'), '读取四服务真实文件权限');
    check('四服务上传使用租户原角色授权与已选套餐交集', permissions.every(permission => info.permissions.includes(permission)));
    successful(await api(tenantAdmin, '/crm/customer', { method: 'POST', body: { customerCode, customerName: customerCode, ownerId: info.user.userId } }), '真实创建本次邮件附件业务客户');
    customerId = Number(database(`SELECT customer_id FROM crm_customer WHERE tenant_id=${targetId} AND customer_code=${sql(customerCode)} AND deleted=0;`));
    assert.ok(Number.isSafeInteger(customerId) && customerId > 0);
    definitions.find(item => item.service === 'CRM').route = `/crm/email/attachments/upload?bizType=CUSTOMER&bizId=${customerId}`;
    check('跨服务并发前仅能容纳一份600000字节文件', originalBytes + 600000 <= 2 * 1024 * 1024 && originalBytes + 1200000 > 2 * 1024 * 1024);
    const race = await uploadAll('race');
    console.log(`H5_CROSS_STORAGE_RACE: ${JSON.stringify(describe(race))}`);
    check('AUTH/HR/OA/CRM同时上传共享2MB，仅一份成功', race.filter(succeeded).length === 1 && race.filter(capacityRejected).length === 3
      && metadata().length === 1 && usage() === originalBytes + 600000 && snapshot(targetId).storage_used === 2);
    await applyLimit(4);
    for (const result of race.filter(item => !succeeded(item))) {
      const definition = definitions.find(item => item.service === result.service);
      successful((await upload(definition, 'expanded')).response, `扩容后${definition.service}真实上传成功`);
    }
    const accepted = metadata();
    check('四个真实服务均有成功上传且共享用量精确一致', accepted.length === 4 && definitions.every(item => accepted.some(file => file.name.startsWith(`${prefix}${item.service}-`)))
      && usage() === originalBytes + 2400000 && snapshot(targetId).storage_used === 4);
    if (boundMode) {
      bound = tenantPackageBoundFiles({ tenantAdmin, api, successful, database, check, caseTag, targetId,
        customerId, accepted, uploads, expectedBytes, evidence });
      await bound.bind();
      await bound.verifyDownloads('降额前');
    }
    await applyLimit(1);
    const retained = JSON.stringify(metadata());
    const existingFiles = await physicalSnapshot();
    const denied = await uploadAll('over-limit');
    console.log(`H5_CROSS_STORAGE_OVER_LIMIT: ${JSON.stringify(describe(denied))}`);
    check('降额后四服务全部拒绝新增且没有新增记录或磁盘文件', denied.every(capacityRejected) && JSON.stringify(metadata()) === retained
      && JSON.stringify(await physicalSnapshot()) === JSON.stringify(existingFiles) && usage() === originalBytes + 2400000);
    for (const file of accepted) {
      const owned = await physical(file);
      const expected = expectedBytes.get(file.name);
      check(`降额保留${owned.definition.service}附件完整600000字节`, (await fs.readFile(owned.target)).equals(expected));
      const response = await api(tenantAdmin, `/auth/system/file/${file.id}/content`);
      if (owned.definition.service === 'AUTH') {
        check('跨服务降额后AUTH原文件仍能真实下载', response.status === 200 && response.size === expected.length
          && response.sha256 === createHash('sha256').update(expected).digest('hex'));
      } else {
        check(`${owned.definition.service}私有附件仍禁止通过通用下载绕过业务权限`, [400, 403].includes(response.status) && response.body?.code !== 200);
        check(`${owned.definition.service}附件没有公开地址`, !file.url);
      }
    }
    if (bound) {
      await bound.verifyDownloads('降额后');
      await verifyAdditionalUploadEntries({ tenantAdmin, api, successful, database, check, caseTag, state,
        targetId, customerId, applyLimit, usage, physicalSnapshot, evidence });
      await verifyMeetingPhotoCapacity({ tenantAdmin, api, successful, database, check, caseTag, state,
        targetId, applyLimit, usage, physicalSnapshot, evidence });
      await verifyWorkflowFileCapacity({ tenantAdmin, api, successful, database, check, caseTag, state,
        targetId, applyLimit, usage, physicalSnapshot, evidence, redis });
      await verifySeverancePolicyCapacity({ tenantAdmin, api, successful, database, check, caseTag, state,
        targetId, applyLimit, usage, physicalSnapshot, evidence });
    }
    if (importMode) {
      await verifyImportFileCapacity({ tenantAdmin, api, successful, database, check, caseTag, state,
        targetId, applyLimit, usage, physicalSnapshot, evidence });
    }
    if (hrMode) {
      await verifyTrainingAgreementCapacity({ tenantAdmin, api, successful, database, check, caseTag, state,
        targetId, applyLimit, usage, physicalSnapshot, evidence });
      await verifyExitInterviewCapacity({ tenantAdmin, api, successful, database, check, caseTag, state,
        targetId, applyLimit, usage, physicalSnapshot, evidence });
      await verifyAdvanceProofCapacity({ tenantAdmin, api, successful, database, check, caseTag, state,
        targetId, applyLimit, usage, physicalSnapshot, evidence });
    }
    if (contractMode) {
      await verifyContractFileCapacity({ tenantAdmin, api, successful, database, check, caseTag, state,
        targetId, applyLimit, usage, physicalSnapshot, evidence });
    }
    if (generatedMode) {
      await verifyImportGeneratedCapacity({ tenantAdmin, api, successful, database, check, caseTag, state,
        targetId, applyLimit, usage, physicalSnapshot, evidence });
    }
    evidence.storageCrossServices = true;
    await applyLimit(8);
    assert.equal(database(`SELECT COUNT(*) FROM information_schema.triggers WHERE trigger_schema=DATABASE() AND trigger_name=${sql(trigger)};`), '0');
    database(`DELIMITER $$
      CREATE TRIGGER ${trigger} BEFORE INSERT ON sys_file FOR EACH ROW BEGIN
        IF NEW.tenant_id=${targetId} AND NEW.file_name LIKE ${sql(prefix + '%-fault.pdf')} THEN
          SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='H5_OWNED_STORAGE_WRITE_FAILURE';
        END IF;
      END$$
      DELIMITER ;`);
    triggerCreated = true;
    const beforeFault = JSON.stringify(metadata());
    const beforeFaultFiles = await physicalSnapshot();
    const faults = await uploadAll('fault', 8192);
    console.log(`H5_CROSS_STORAGE_WRITE_FAILURE: ${JSON.stringify(describe(faults))}`);
    check('四服务真实插入失败均返回失败且未伪装额度拒绝', faults.every(item => !succeeded(item) && !capacityRejected(item)));
    check('四服务故障响应均为500且只返回安全说明与追踪编号', faults.every(item => item.response.status === 500
      && item.response.body?.code === 500 && item.response.body?.data == null
      && /^服务异常，请联系管理员，traceId=[a-zA-Z0-9_-]+$/.test(item.response.body?.msg || '')
      && !/H5_OWNED_STORAGE_WRITE_FAILURE|sys_file|SQLException|Mapper|INSERT|SQL state/i.test(JSON.stringify(item.response.body))));
    check('四服务文件写入失败均回滚记录并清除落盘内容', JSON.stringify(metadata()) === beforeFault
      && JSON.stringify(await physicalSnapshot()) === JSON.stringify(beforeFaultFiles) && usage() === originalBytes + 2400000);
    database(`DROP TRIGGER ${trigger};`);
    triggerCreated = false;
    const recovered = await uploadAll('after-fault', 8192);
    check('撤回自有插入故障后四服务真实上传全部恢复', recovered.every(succeeded) && metadata().length === 8
      && usage() === originalBytes + 2400000 + 4 * 8192);
    evidence.storageRollback = true;
  } catch (error) {
    failure = error;
    throw error;
  } finally {
    const failures = [];
    if (triggerCreated) {
      try { database(`DROP TRIGGER ${trigger};`); } catch (error) { failures.push(error); }
    }
    let bindingsCleared = !bound;
    if (bound) {
      try { await bound.cleanup(); bindingsCleared = true; } catch (error) { failures.push(error); }
    }
    for (const file of metadata().filter(item => item.deleted === 0 && bindingsCleared)) {
      try {
        const owned = await physical(file);
        if (owned.definition.service === 'AUTH') {
          successful(await api(tenantAdmin, `/auth/system/file/${file.id}`, { method: 'DELETE' }), '真实删除跨服务竞争的AUTH测试文件');
        } else {
          if (owned.definition.service === 'CRM') assert.equal(file.businessId, `CUSTOMER:${customerId}`);
          database(`DELETE FROM sys_file WHERE file_id=${file.id} AND tenant_id=${targetId} AND file_name=${sql(file.name)} AND deleted=0;`);
          await fs.unlink(owned.target);
        }
        const remaining = await fs.stat(owned.target).catch(error => { if (error.code === 'ENOENT') return null; throw error; });
        check(`清理自有${owned.definition.service}已无业务引用的测试附件及物理文件`, !remaining
          && database(`SELECT COUNT(*) FROM sys_file WHERE tenant_id=${targetId} AND file_id=${file.id} AND deleted=0;`) === '0');
      } catch (error) { failures.push(error); }
    }
    if (customerId) {
      try {
        successful(await api(tenantAdmin, `/crm/customer/${customerId}`, { method: 'DELETE' }), '真实删除本次没有邮件记录的测试客户');
        check('测试客户已逻辑删除且未发送任何邮件', database(`SELECT COUNT(*) FROM crm_customer WHERE tenant_id=${targetId} AND customer_id=${customerId} AND deleted=0;`) === '0'
          && database(`SELECT COUNT(*) FROM crm_email_record WHERE tenant_id=${targetId} AND customer_id=${customerId};`) === '0');
      } catch (error) { failures.push(error); }
    }
    try { await applyLimit(1); } catch (error) { failures.push(error); }
    if (failures.length) throw new AggregateError([...(failure ? [failure] : []), ...failures], '跨服务附件验收清理不完整');
    check('跨服务测试恢复原存储字节且删除自有故障触发器', usage() === originalBytes
      && database(`SELECT COUNT(*) FROM information_schema.triggers WHERE trigger_schema=DATABASE() AND trigger_name=${sql(trigger)};`) === '0');
    evidence.storageCleanup = true;
  }
}
