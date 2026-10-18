import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import { scanOwnedAuditLogs, scanSecretStream } from './portal-checks/scan-access-logs.mjs';

export async function verifySettlementCapacitySecrets({ sessionSecrets, state, check, evidence }) {
  const accounts = JSON.parse(await fs.readFile(path.join(state.run, 'private/accounts.json'), 'utf8'));
  const values = accounts.map(account => account.password).filter(Boolean);
  assert.ok(sessionSecrets instanceof Set && sessionSecrets.size >= 4, 'Capture all four real login sessions before any business rejection can clear a page token');
  values.push(...sessionSecrets);
  const secrets = [...new Set(values)];
  let count = 0; let bytes = 0; let leaks = 0;
  for (const service of ['auth', 'hr', 'oa', 'crm', 'workflow', 'gateway']) {
    const root = path.join(state.run, service);
    const names = await fs.readdir(path.join(root, 'logs')).catch(error => {
      if (error.code === 'ENOENT') return []; throw error;
    });
    for (const file of ['stdout.log', 'stderr.log', ...names.filter(name => name.endsWith('.log')).map(name => path.join('logs', name))]) {
      const result = await scanSecretStream(createReadStream(path.join(root, file)), secrets);
      count++; bytes += result.bytes; leaks += result.leaks;
    }
  }
  const audit = await scanOwnedAuditLogs(state, secrets, { log: '0', error: '0', audit: '0' });
  console.log(`H5_SETTLEMENT_CAPACITY_SECRET_SCAN: files=${count}; bytes=${bytes}; sensitive_values=${secrets.length}; leaks=${leaks}; database_bytes=${audit.bytes}; database_leaks=${audit.leaks}`);
  check('结算容量及真实收款流程的六服务日志和数据库审计无本次凭据泄漏', leaks === 0 && audit.leaks === 0);
  evidence.storageSettlementProofSecrets = true;
}

// Runs inside the real, independently approved and confirmed negative settlement lifecycle.
// Only the isolated tenant's storage limit is a reversible boundary input; no approval is fabricated.
export async function verifySettlementProofCapacity({ finance, hr, api, successful, database, check, id,
  caseTag, state, evidence }) {
  const tenantId = 100000;
  assert.match(String(id), /^[1-9][0-9]*$/);
  assert.match(caseTag, /^[a-f0-9]{12}$/);
  assert.equal(state.status, 'RUNNING');
  const run = await fs.realpath(state.run);
  assert.ok(run.toLowerCase().startsWith('d:\\cloudflowpro\\.cloudflow-runtime\\batch-g-integration\\'));
  const root = `/hr/settlement/${id}`;
  const prefix = `settlement-capacity-${caseTag}-`;
  const sql = value => `CONVERT(0x${Buffer.from(String(value)).toString('hex')} USING utf8mb4)`;
  const rows = query => database(query).split(/\r?\n/).filter(Boolean).map(row => JSON.parse(row));
  const bytesUsed = () => Number(database(`SELECT COALESCE(SUM(physical.object_size),0) FROM (
    SELECT MAX(GREATEST(COALESCE(file_size,0),0)) AS object_size FROM sys_file
    WHERE tenant_id=${tenantId} AND deleted=0
    GROUP BY storage_type,config_id,CAST(COALESCE(NULLIF(file_path,''),CAST(file_id AS CHAR)) AS BINARY)) physical;`));
  const tenant = () => JSON.parse(database(`SELECT JSON_OBJECT('limit',storage_limit,'used',storage_used,'version',version)
    FROM sys_tenant WHERE tenant_id=${tenantId} AND deleted=0;`));
  const files = () => rows(`SELECT JSON_OBJECT('id',file_id,'name',file_name,'path',file_path,'size',file_size,
    'hash',file_hash,'type',file_type,'business',biz_type,'businessId',biz_id,'access',access_type,'url',url,
    'storage',storage_type,'deleted',deleted,'owner',create_by,'portal',portal_owner_id)
    FROM sys_file WHERE tenant_id=${tenantId} AND file_name LIKE ${sql(prefix + '%')} ORDER BY file_id;`);
  const business = () => database(`SELECT * FROM hr_final_settlement WHERE tenant_id=${tenantId} AND settlement_id=${id};
    SELECT * FROM hr_final_settlement_item WHERE tenant_id=${tenantId} AND settlement_id=${id} ORDER BY item_id;`);
  const original = tenant(); const initialBytes = bytesUsed(); const initialBusiness = business();
  const walk = async directory => {
    const paths = [];
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      assert.ok(!entry.isSymbolicLink(), 'Redirected private file path rejected');
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) paths.push(...await walk(target));
      else if (entry.isFile()) paths.push(target);
    }
    return paths.sort();
  };
  const physicalFiles = () => walk(path.join(run, 'hr/private-files'));
  const initialPhysical = JSON.stringify(await physicalFiles());
  assert.ok(Number.isSafeInteger(initialBytes) && initialBytes >= 0);
  assert.equal(files().length, 0);
  const read = successful(await api(hr, root), '容量前读取实际已审批负净额结算');
  check('凭据容量检查以真实审批确认且尚未收款的原单为前置', read.status === 'CONFIRMED'
    && Number(read.netAmount) < 0 && read.funds.proofFileId == null && Boolean(read.funds.confirmedTime)
    && read.items.every(item => !item.posted));
  let currentLimit = original.limit;
  const limit = maximum => {
    assert.ok(maximum == null || Number.isSafeInteger(maximum));
    if (maximum === currentLimit) return;
    assert.equal(database(`UPDATE sys_tenant SET storage_limit=${maximum ?? 'NULL'} WHERE tenant_id=${tenantId}
      AND deleted=0 AND version=${original.version} AND storage_limit <=> ${currentLimit ?? 'NULL'}; SELECT ROW_COUNT();`), '1');
    currentLimit = maximum;
  };
  const upload = (name, bytes) => api(finance, `${root}/proof`, { method: 'POST', file: {
    name, type: 'application/pdf', content: bytes.toString('base64'),
  } });
  const content = Buffer.alloc(1200000, 32);
  Buffer.from(`%PDF-1.7\n${prefix}retained\n`).copy(content);
  const rejectedContent = Buffer.from(`%PDF-1.7\n${prefix}rejected\n%%EOF`);
  const physical = async file => {
    assert.equal(file.storage, 'LOCAL'); assert.equal(file.deleted, 0);
    assert.equal(file.type, 'HR_SETTLEMENT_PROOF'); assert.equal(file.business, file.type);
    assert.equal(String(file.businessId), String(id)); assert.equal(file.portal, null);
    assert.equal(file.access, 'PRIVATE'); assert.equal(file.url, '');
    const directory = await fs.realpath(path.join(run, 'hr/private-files'));
    const target = await fs.realpath(file.path);
    assert.ok(target.startsWith(directory + path.sep));
    return target;
  };
  const download = async (file, phase) => {
    const result = await api(finance, `${root}/proof/${file.id}`);
    check(`${phase}财务可通过结算业务入口完整下载原凭据`, result.status === 200
      && result.size === content.length && result.sha256 === createHash('sha256').update(content).digest('hex'));
  };
  let failure;
  try {
    limit(Math.ceil((initialBytes + content.length) / 1048576) + 1);
    const saved = successful(await upload(`${prefix}retained.pdf`, content), '实际上传并绑定结算收款凭据');
    const file = files().find(row => String(row.id) === String(saved.fileId)); assert.ok(file);
    check('收款凭据保存真实文件并按实际字节计入用量', (await fs.readFile(await physical(file))).equals(content)
      && bytesUsed() === initialBytes + content.length);
    await download(file, '降额前');
    limit(1);
    const retained = JSON.stringify(files()); const retainedBytes = bytesUsed();
    const retainedPhysical = JSON.stringify(await physicalFiles());
    await new Promise(resolve => setTimeout(resolve, 5100));
    const denied = await upload(`${prefix}rejected.pdf`, rejectedContent);
    check('结算凭据额度不足返回明确409', denied.status === 409 && denied.body?.code === 409
      && denied.body?.msg === '租户可用存储空间不足，无法新增文件');
    check('拒绝新增保留原凭据和原审批确认金额及来源状态', retained === JSON.stringify(files())
      && bytesUsed() === retainedBytes && business() === initialBusiness
      && retainedPhysical === JSON.stringify(await physicalFiles())
      && (await fs.readFile(await physical(file))).equals(content));
    await download(file, '降额后');
    evidence.storageSettlementProof = true;
  } catch (error) { failure = error; throw error; }
  finally {
    const failures = [];
    try {
      assert.equal(business(), initialBusiness, 'Settlement changed; retain proof for investigation');
      for (const file of files()) {
        const target = await physical(file);
        assert.equal(database(`SELECT COUNT(*) FROM hr_final_settlement WHERE settlement_proof_file_id=${file.id};`), '0');
        assert.equal(database(`DELETE FROM sys_file WHERE tenant_id=${tenantId} AND file_id=${file.id}
          AND file_name=${sql(file.name)} AND biz_type='HR_SETTLEMENT_PROOF' AND biz_id=${sql(id)}
          AND file_path=${sql(file.path)} AND deleted=0; SELECT ROW_COUNT();`), '1');
        assert.equal(database(`SELECT COUNT(*) FROM sys_file WHERE deleted=0 AND CAST(file_path AS BINARY)=CAST(${sql(file.path)} AS BINARY);`), '0');
        await fs.unlink(target);
      }
      assert.equal(bytesUsed(), initialBytes);
      database(`UPDATE sys_tenant SET storage_used=${original.used ?? 'NULL'} WHERE tenant_id=${tenantId} AND version=${original.version};`);
    } catch (error) { failures.push(error); }
    try { limit(original.limit); } catch (error) { failures.push(error); }
    if (failures.length) throw new AggregateError([...(failure ? [failure] : []), ...failures], '结算凭据容量验证恢复不完整');
    check('容量测试凭据精确清理且原额度和用量恢复，保留操作审计', files().length === 0
      && JSON.stringify(tenant()) === JSON.stringify(original) && business() === initialBusiness
      && initialPhysical === JSON.stringify(await physicalFiles()));
    evidence.storageSettlementProofCleanup = true;
  }
}
