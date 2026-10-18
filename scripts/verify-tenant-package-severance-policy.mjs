import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

export const severancePolicyPermissions = ['hr:severance:manage'];

// Keep this policy incomplete and in DRAFT: no payroll or settlement can use it.
export async function verifySeverancePolicyCapacity({ tenantAdmin, api, successful, database, check, caseTag,
  state, targetId, applyLimit, usage, physicalSnapshot, evidence }) {
  const marker = `H5_POLICY_${caseTag}`;
  const prefix = `${caseTag}-capacity-policy-`;
  const sql = value => `CONVERT(0x${Buffer.from(String(value)).toString('hex')} USING utf8mb4)`;
  const rows = query => database(query).split(/\r?\n/).filter(Boolean).map(row => JSON.parse(row));
  const files = () => rows(`SELECT JSON_OBJECT('id',file_id,'name',file_name,'path',file_path,'size',file_size,
    'business',biz_type,'businessId',biz_id,'type',file_type,'url',url,'deleted',deleted,'references',ref_count)
    FROM sys_file WHERE tenant_id=${targetId} AND file_name LIKE ${sql(prefix + '%')} ORDER BY file_id;`);
  const beforeUsage = usage();
  const beforeFiles = await physicalSnapshot();
  let ruleId;
  let failure;
  const bytes = phase => Buffer.from(`%PDF-1.4\n${marker}:${phase}\n%%EOF\n`);
  const read = async () => successful(await api(tenantAdmin, `/hr/severance-rule/${ruleId}`), '读取隔离政策草稿');
  const upload = async phase => {
    const rule = await read();
    return api(tenantAdmin, `/hr/severance-rule/${ruleId}/policy?version=${rule.version}`, { method: 'POST',
      file: { name: `${prefix}${phase}.pdf`, type: 'application/pdf', content: bytes(phase).toString('base64') } });
  };
  const ownedPath = async file => {
    assert.equal(file.business, 'HR_SEVERANCE_POLICY');
    assert.equal(file.businessId, String(ruleId));
    assert.equal(file.type, 'HR_SEVERANCE_POLICY');
    assert.ok(!file.url);
    const root = await fs.realpath(path.join(state.run, 'hr/private-files'));
    const target = await fs.realpath(file.path);
    assert.ok(target.startsWith(root + path.sep));
    return target;
  };
  const verifyDownload = async phase => {
    const downloaded = await api(tenantAdmin, `/hr/severance-rule/${ruleId}/policy`);
    check(`${phase}原政策文件保持完整且禁止缓存`, downloaded.status === 200
      && downloaded.size === bytes('allowed').length
      && downloaded.sha256 === createHash('sha256').update(bytes('allowed')).digest('hex')
      && /no-store/.test(downloaded.cacheControl || ''));
  };
  assert.equal(files().length, 0);
  assert.equal(database(`SELECT COUNT(*) FROM hr_severance_rule WHERE tenant_id=${targetId} AND rule_code=${sql(marker)};`), '0');
  try {
    await applyLimit(8);
    ruleId = Number(successful(await api(tenantAdmin, '/hr/severance-rule', { method: 'POST', body: {
      ruleCode: marker, ruleName: marker, effectiveFrom: '2026-01-01', salaryComponentIds: [], averagingMonths: 12,
      serviceRounding: 'ACTUAL_MONTHS', noticeMonths: '0.0000', slabs: [], remark: marker,
    } }), '真实创建未核定的隔离政策草稿'));
    assert.ok(Number.isSafeInteger(ruleId) && ruleId > 0);
    const saved = successful(await upload('allowed'), '补偿政策文件真实上传并绑定草稿');
    const original = files().find(file => file.id === Number(saved.policyFile.fileId));
    assert.ok(original && original.deleted === 0);
    assert.equal(saved.status, 'DRAFT');
    check('政策原始字节完整且计入当前租户容量', (await fs.readFile(await ownedPath(original))).equals(bytes('allowed'))
      && usage() === beforeUsage + bytes('allowed').length && files().length === 1);
    await verifyDownload('降额前');
    await applyLimit(1);
    const retained = JSON.stringify(files());
    const retainedRule = JSON.stringify(await read());
    const retainedFiles = await physicalSnapshot();
    await new Promise(resolve => setTimeout(resolve, 5100));
    const rejected = await upload('denied');
    console.log(`H5_SEVERANCE_POLICY_CAPACITY: http=${rejected.status}; code=${rejected.body?.code}; capacity_message=${/存储空间不足/.test(rejected.body?.msg || '')}; real_hr=true`);
    check('降额后政策替换明确返回容量不足409', rejected.status === 409 && rejected.body?.code === 409
      && /存储空间不足/.test(rejected.body?.msg || ''));
    check('政策替换失败保留旧文件绑定和版本', retained === JSON.stringify(files()) && retainedRule === JSON.stringify(await read())
      && JSON.stringify(retainedFiles) === JSON.stringify(await physicalSnapshot()) && usage() === beforeUsage + original.size);
    await verifyDownload('降额替换失败后');
    evidence.storageSeverancePolicy = true;
  } catch (error) { failure = error; throw error; }
  finally {
    const failures = [];
    if (ruleId) {
      try {
        const owned = files();
        const paths = await Promise.all(owned.map(ownedPath));
        const rule = await read();
        assert.equal(rule.ruleCode, marker); assert.equal(rule.status, 'DRAFT'); assert.equal(rule.confirmedBy, null);
        database(`START TRANSACTION;
          DELETE FROM hr_severance_rule_slab WHERE tenant_id=${targetId} AND rule_id=${ruleId};
          DELETE FROM hr_severance_rule WHERE tenant_id=${targetId} AND rule_id=${ruleId} AND rule_code=${sql(marker)} AND status='DRAFT';
          COMMIT;`);
        assert.equal(database(`SELECT COUNT(*) FROM hr_severance_rule WHERE tenant_id=${targetId} AND rule_id=${ruleId};`), '0');
        for (let index = 0; index < owned.length; index++) {
          const file = owned[index];
          database(`DELETE FROM sys_file WHERE tenant_id=${targetId} AND file_id=${file.id} AND file_name=${sql(file.name)}
            AND biz_type='HR_SEVERANCE_POLICY' AND biz_id='${ruleId}';`);
          await fs.unlink(paths[index]);
        }
      } catch (error) { failures.push(error); }
    }
    try { await applyLimit(1); } catch (error) { failures.push(error); }
    if (failures.length) throw new AggregateError([...(failure ? [failure] : []), ...failures], '政策文件容量验证清理不完整');
    check('隔离政策和文件清理且容量恢复', files().length === 0 && usage() === beforeUsage
      && JSON.stringify(beforeFiles) === JSON.stringify(await physicalSnapshot())
      && database(`SELECT COUNT(*) FROM hr_severance_rule WHERE tenant_id=${targetId} AND rule_code=${sql(marker)};`) === '0');
    evidence.storageSeverancePolicyCleanup = true;
  }
}
