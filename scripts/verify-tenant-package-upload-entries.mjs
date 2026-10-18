import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

export const additionalUploadPermissions = ['hr:leave:mine', 'hr:payroll:mine', 'hr:grievance:mine:create',
  'hr:referral:submit', 'oa:rfq:quote', 'crm:email:archive'];

// 使用已建立的隔离员工和客户；仅上传未绑定文件，不提交请假、税务、推荐、报价或来信。
export async function verifyAdditionalUploadEntries({ tenantAdmin, api, successful, database, check, caseTag,
  state, targetId, customerId, applyLimit, usage, physicalSnapshot, evidence }) {
  const prefix = `${caseTag}-entry-`;
  const sql = value => `CONVERT(0x${Buffer.from(String(value)).toString('hex')} USING utf8mb4)`;
  const definitions = [
    ['leave', '/hr/ess/leave/files', 'HR_LEAVE_PROOF', 'hr/private-files'],
    ['tax', '/hr/ess/tax-deductions/proof', 'HR_TAX_PROOF', 'hr/private-files'],
    ['grievance', '/hr/ess/grievances/files', 'HR_GRIEVANCE', 'hr/private-files'],
    ['referral', '/hr/referral/resume', 'HR_REFERRAL_RESUME', 'hr/private-files'],
    ['quotation', '/oa/rfq/quotation-files', 'OA_RFQ_QUOTATION', 'profile/oa-private/RFQ_QUOTATION'],
    ['inbound', `/crm/email/attachments/inbound-upload?bizType=CUSTOMER&bizId=${customerId}`, 'CRM_EMAIL_ATTACHMENT', 'profile/crm-private'],
  ].map(([name, route, type, root]) => ({ name, route, type, root: path.join(state.run, root) }));
  const metadata = () => database(`SELECT JSON_OBJECT('id',file_id,'name',file_name,'path',file_path,'type',file_type,
    'business',biz_type,'businessId',biz_id,'size',file_size,'url',url,'deleted',deleted) FROM sys_file
    WHERE tenant_id=${targetId} AND file_name LIKE ${sql(prefix + '%')} ORDER BY file_id;`)
    .split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
  const acceptedBytes = new Map();
  const lastRequest = new Map();
  const upload = async (definition, phase) => {
    const remaining = (lastRequest.get(definition.name) || 0) + 5100 - Date.now();
    if (remaining > 0) await new Promise(resolve => setTimeout(resolve, remaining));
    const name = `${prefix}${definition.name}-${phase}.pdf`;
    const bytes = Buffer.alloc(8192, 32);
    Buffer.from(`%PDF-1.4\n${name}\n`).copy(bytes);
    acceptedBytes.set(name, bytes);
    const response = await api(tenantAdmin, definition.route, { method: 'POST',
      file: { name, type: 'application/pdf', content: bytes.toString('base64') } });
    lastRequest.set(definition.name, Date.now());
    return response;
  };
  const ownedPath = async file => {
    const definition = definitions.find(item => file.name.startsWith(`${prefix}${item.name}-`));
    assert.ok(definition && file.type === definition.type && file.deleted === 0 && file.size === 8192);
    const root = await fs.realpath(definition.root);
    const target = await fs.realpath(file.path);
    assert.ok(root.startsWith(await fs.realpath(state.run) + path.sep) && target.startsWith(root + path.sep));
    assert.ok(!file.url, 'Private upload must have no public URL');
    if (definition.name === 'inbound') {
      assert.equal(file.business, 'CRM_EMAIL_ATTACHMENT');
      assert.equal(file.businessId, `CUSTOMER:${customerId}`);
      assert.equal(database(`SELECT COUNT(*) FROM crm_email_record WHERE tenant_id=${targetId}
        AND JSON_CONTAINS(attachment_file_ids, CAST(${file.id} AS JSON), '$');`), '0');
    } else {
      assert.equal(file.business, null);
      assert.equal(file.businessId, null);
    }
    return target;
  };
  const beforeUsage = usage();
  const beforeFiles = await physicalSnapshot();
  assert.equal(metadata().length, 0);
  let failure;
  try {
    const info = successful(await api(tenantAdmin, '/auth/info'), '读取额外附件入口实际授权');
    check('六个额外入口来自套餐和原角色交集', additionalUploadPermissions.every(permission => info.permissions.includes(permission)));
    await applyLimit(8);
    for (const definition of definitions) {
      const uploaded = successful(await upload(definition, 'allowed'), `${definition.name}真实业务入口容量充足可上传`);
      const file = metadata().find(item => item.id === uploaded.fileId);
      assert.ok(file, `${definition.name} must persist its actual returned file ID`);
      const target = await ownedPath(file);
      check(`${definition.name}保存完整原始字节且无公开地址`, (await fs.readFile(target)).equals(acceptedBytes.get(file.name)));
    }
    check('额外六入口精确增加六份8192字节文件', metadata().length === definitions.length && usage() === beforeUsage + definitions.length * 8192);
    await applyLimit(1);
    const retained = JSON.stringify(metadata());
    const retainedFiles = await physicalSnapshot();
    for (const definition of definitions) {
      const response = await upload(definition, 'denied');
      check(`${definition.name}降额后由容量规则明确拒绝`, response.status === 409 && response.body?.code === 409
        && /存储空间不足/.test(response.body?.msg || ''));
    }
    check('六入口拒绝新增后原文件记录和磁盘内容均保留', retained === JSON.stringify(metadata())
      && JSON.stringify(retainedFiles) === JSON.stringify(await physicalSnapshot())
      && usage() === beforeUsage + definitions.length * 8192);
    for (const file of metadata()) check(`额外入口${file.type}降额后原始字节未损坏`,
      (await fs.readFile(await ownedPath(file))).equals(acceptedBytes.get(file.name)));
    evidence.storageAdditionalEntries = true;
  } catch (error) {
    failure = error;
    throw error;
  } finally {
    const failures = [];
    for (const file of metadata()) {
      try {
        const target = await ownedPath(file);
        database(`DELETE FROM sys_file WHERE tenant_id=${targetId} AND file_id=${file.id} AND file_name=${sql(file.name)} AND deleted=0;`);
        await fs.unlink(target);
      } catch (error) { failures.push(error); }
    }
    try { await applyLimit(1); } catch (error) { failures.push(error); }
    if (failures.length) throw new AggregateError([...(failure ? [failure] : []), ...failures], '额外上传入口清理不完整');
    check('额外六入口仅清理本轮未绑定附件并恢复原字节用量', metadata().length === 0 && usage() === beforeUsage
      && JSON.stringify(beforeFiles) === JSON.stringify(await physicalSnapshot()));
    evidence.storageAdditionalCleanup = true;
  }
}
