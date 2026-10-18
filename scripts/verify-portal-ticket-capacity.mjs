import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

// Uses the actual portal session and one-use download tickets supplied by the ticket suite.
export async function verifyPortalTicketCapacity({ call, access, download, successful, database, check,
  caseTag, state, portalUserId, evidence }) {
  assert.match(caseTag, /^[a-f0-9]{12}$/);
  assert.match(String(portalUserId), /^[1-9][0-9]*$/);
  assert.equal(state.status, 'RUNNING');
  const run = await fs.realpath(state.run);
  assert.ok(run.toLowerCase().startsWith('d:\\cloudflowpro\\.cloudflow-runtime\\batch-g-integration\\'));
  const profile = await fs.realpath(path.join(run, 'profile'));
  assert.ok(profile.startsWith(run + path.sep), 'Portal profile must stay inside the owned fixture');
  const sql = value => `CONVERT(0x${Buffer.from(String(value)).toString('hex')} USING utf8mb4)`;
  const rows = query => database(query).split(/\r?\n/).filter(Boolean).map(row => JSON.parse(row));
  const prefix = `portal-capacity-${caseTag}-`;
  const files = () => rows(`SELECT JSON_OBJECT('id',file_id,'name',file_name,'path',file_path,'size',file_size,
    'hash',file_hash,'business',biz_type,'businessId',biz_id,'portalOwner',portal_owner_id,'access',access_type,
    'storage',storage_type,'deleted',deleted,'url',url) FROM sys_file
    WHERE tenant_id=100000 AND file_name LIKE ${sql(prefix + '%')} ORDER BY file_id;`);
  const tenant = () => JSON.parse(database(`SELECT JSON_OBJECT('limit',storage_limit,'used',storage_used,'version',version)
    FROM sys_tenant WHERE tenant_id=100000 AND deleted=0;`));
  const usage = () => Number(database(`SELECT COALESCE(SUM(physical.object_size),0) FROM (
    SELECT MAX(GREATEST(COALESCE(file_size,0),0)) AS object_size FROM sys_file WHERE tenant_id=100000 AND deleted=0
    GROUP BY storage_type,config_id,CAST(COALESCE(NULLIF(file_path,''),CAST(file_id AS CHAR)) AS BINARY)) physical;`));
  const walk = async directory => {
    const paths = [];
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      assert.ok(!entry.isSymbolicLink(), 'Redirected profile storage rejected');
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) paths.push(...await walk(target));
      else if (entry.isFile()) paths.push(target);
    }
    return paths.sort();
  };
  const original = tenant(); const initialUsage = usage(); const initialPhysical = JSON.stringify(await walk(profile));
  assert.ok(Number.isSafeInteger(initialUsage) && initialUsage >= 0);
  assert.equal(files().length, 0);
  let currentLimit = original.limit;
  const limit = maximum => {
    assert.ok(maximum == null || Number.isSafeInteger(maximum));
    if (currentLimit === maximum) return;
    assert.equal(database(`UPDATE sys_tenant SET storage_limit=${maximum ?? 'NULL'} WHERE tenant_id=100000
      AND deleted=0 AND version=${original.version} AND storage_limit <=> ${currentLimit ?? 'NULL'}; SELECT ROW_COUNT();`), '1');
    currentLimit = maximum;
  };
  const bytes = Buffer.alloc(1200000, 65);
  Buffer.from(`${prefix}retained\n`).copy(bytes);
  const multipart = { requestKey: randomUUID(), file: { name: `${prefix}retained.txt`, mimeType: 'text/plain', buffer: bytes } };
  const physical = async file => {
    assert.equal(file.storage, 'LOCAL'); assert.equal(file.access, 'PRIVATE');
    assert.equal(String(file.portalOwner), String(portalUserId));
    assert.equal(file.business, 'PORTAL_TICKET_UPLOAD'); assert.equal(file.businessId, multipart.requestKey);
    assert.ok(!file.url);
    const target = await fs.realpath(path.resolve(profile, file.path.replace(/^\//, '')));
    assert.ok(target.startsWith(profile + path.sep));
    return target;
  };
  const downloadOriginal = async fileId => {
    const result = await download(await access(fileId));
    check('门户降额后仍凭本人一次性下载凭据取得原文件', result.status === 200 && result.size === bytes.length
      && result.sha256 === createHash('sha256').update(bytes).digest('hex')
      && result.headers['cache-control'].includes('no-store'));
  };
  let failure;
  try {
    limit(Math.ceil((initialUsage + bytes.length) / 1048576) + 1);
    const saved = successful(await call('/portal/file/upload', { multipart }), '门户本人真实上传容量测试附件');
    const file = files().find(row => String(row.id) === String(saved.fileId)); assert.ok(file);
    check('门户上传私有文件按实际字节计入共享额度', (await fs.readFile(await physical(file))).equals(bytes)
      && usage() === initialUsage + bytes.length);
    limit(1);
    const retained = JSON.stringify(files()); const retainedPhysical = JSON.stringify(await walk(profile)); const retainedUsage = usage();
    const repeated = successful(await call('/portal/file/upload', { multipart }), '门户超额后重试同一上传请求');
    check('门户重试原上传返回同一文件且不重复占用容量', repeated.fileId === saved.fileId && usage() === retainedUsage);
    const denied = await call('/portal/file/upload', { multipart: { requestKey: randomUUID(),
      file: { name: `${prefix}rejected.txt`, mimeType: 'text/plain', buffer: Buffer.from('new-file') } } });
    check('门户真实上传容量不足返回明确409', denied.status === 409 && denied.body?.code === 409
      && denied.body?.msg === '租户可用存储空间不足，无法新增文件');
    check('门户额度拒绝不增加元数据、磁盘文件或用量且保留原附件', retained === JSON.stringify(files())
      && retainedPhysical === JSON.stringify(await walk(profile)) && usage() === retainedUsage);
    await downloadOriginal(saved.fileId);
    evidence.storagePortalFile = true;
  } catch (error) { failure = error; throw error; }
  finally {
    const failures = [];
    try {
      for (const file of files().filter(row => row.deleted === 0)) {
        const target = await physical(file);
        successful(await call(`/portal/file/${file.id}`, { method: 'DELETE' }), '门户本人实际移除容量测试暂存文件');
        assert.equal(await fs.stat(target).catch(error => { if (error.code === 'ENOENT') return null; throw error; }), null);
      }
      assert.equal(usage(), initialUsage);
      assert.equal(JSON.stringify(await walk(profile)), initialPhysical);
      database(`UPDATE sys_tenant SET storage_used=${original.used ?? 'NULL'} WHERE tenant_id=100000 AND version=${original.version};`);
    } catch (error) { failures.push(error); }
    try { limit(original.limit); } catch (error) { failures.push(error); }
    if (failures.length) throw new AggregateError([...(failure ? [failure] : []), ...failures], '门户容量验证恢复不完整');
    check('门户容量测试仅移除本轮暂存附件并恢复原额度和用量', files().every(row => row.deleted === 1)
      && JSON.stringify(tenant()) === JSON.stringify(original));
    evidence.storagePortalFileCleanup = true;
  }
}
