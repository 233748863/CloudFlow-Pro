import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import { scanOwnedAuditLogs, scanSecretStream } from './portal-checks/scan-access-logs.mjs';

export async function verifyHrGrievanceArchiveCapacity({ admin, api, successful, session, database,
  check, caseTag, state, evidence, accounts }) {
  assert.match(caseTag, /^[a-f0-9]{12}$/); assert.equal(state.status, 'RUNNING');
  const run = await fs.realpath(state.run);
  assert.ok(run.toLowerCase().startsWith('d:\\cloudflowpro\\.cloudflow-runtime\\batch-g-integration\\'));
  const storage = await fs.realpath(path.join(run, 'hr/private-files'));
  assert.ok(storage.startsWith(run + path.sep));
  const sql = value => `CONVERT(0x${Buffer.from(String(value)).toString('hex')} USING utf8mb4)`;
  const rows = statement => database(statement).split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
  const username = `h5ga_${caseTag}`;
  assert.equal(database(`SELECT COUNT(*) FROM sys_user WHERE tenant_id=100000 AND user_name=${sql(username)};`), '0');
  database(`INSERT INTO sys_user(tenant_id,dept_id,user_name,nick_name,password,status,deleted,pwd_reset_required,create_by)
    SELECT 100000,100,${sql(username)},${sql(username)},password,'0',0,'0','isolated-grievance-capacity'
    FROM sys_user WHERE tenant_id=100000 AND user_name='g_holiday_employee';`);
  const userId = database(`SELECT user_id FROM sys_user WHERE tenant_id=100000 AND user_name=${sql(username)} AND create_by='isolated-grievance-capacity';`);
  assert.match(userId, /^[1-9][0-9]*$/);
  database(`INSERT INTO sys_user_role(tenant_id,user_id,role_id) VALUES(100000,${userId},5);
    INSERT INTO hr_employee(tenant_id,employee_no,name,gender,dept_id,employee_status,user_id,create_by)
    VALUES(100000,${sql(username)},${sql(username)},'UNKNOWN',100,'REGULAR',${userId},'isolated-grievance-capacity');`);
  const hr = await session('g_holiday_hr'); const employee = await session(username, 'g_holiday_employee');
  const secrets = new Set(accounts.map(account => account.password).filter(Boolean));
  for (const page of [admin, hr, employee]) {
    const token = await page.evaluate(async () => (await import('/src/utils/authStorage.ts')).getAuthToken());
    assert.ok(token); secrets.add(token.replace(/^Bearer /, ''));
  }
  const marker = `H5_GR_ARCHIVE_${caseTag}`;
  const grants = () => database('SELECT tenant_id,role_id,menu_id FROM sys_role_menu ORDER BY tenant_id,role_id,menu_id;');
  const originalGrants = grants();
  const tenant = () => JSON.parse(database("SELECT JSON_OBJECT('limit',storage_limit,'used',storage_used,'version',version) FROM sys_tenant WHERE tenant_id=100000 AND deleted=0;"));
  const usage = () => Number(database(`SELECT COALESCE(SUM(physical.object_size),0) FROM (
    SELECT MAX(GREATEST(COALESCE(file_size,0),0)) AS object_size FROM sys_file WHERE tenant_id=100000 AND deleted=0
    GROUP BY storage_type,config_id,CAST(COALESCE(NULLIF(file_path,''),CAST(file_id AS CHAR)) AS BINARY)) physical;`));
  const walk = async parent => {
    const result = [];
    for (const entry of await fs.readdir(parent, { withFileTypes: true })) {
      assert.ok(!entry.isSymbolicLink(), 'Redirected HR storage rejected');
      const target = path.join(parent, entry.name);
      if (entry.isDirectory()) result.push(...await walk(target)); else if (entry.isFile()) result.push(target);
    }
    return result.sort();
  };
  const original = tenant(); const initialUsage = usage(); const initialPhysical = await walk(storage);
  let currentLimit = original.limit;
  const limit = maximum => {
    assert.ok(maximum == null || Number.isSafeInteger(maximum));
    if (maximum === currentLimit) return;
    assert.equal(database(`UPDATE sys_tenant SET storage_limit=${maximum ?? 'NULL'} WHERE tenant_id=100000 AND deleted=0
      AND version=${original.version} AND storage_limit <=> ${currentLimit ?? 'NULL'}; SELECT ROW_COUNT();`), '1');
    currentLimit = maximum;
  };
  const generousLimit = Math.ceil((initialUsage + 1200000) / 1048576) + 2;
  const fileRows = names => rows(`SELECT JSON_OBJECT('id',file_id,'path',file_path,'name',file_name,'size',file_size,'type',file_type,'deleted',deleted,'owner',create_by)
    FROM sys_file WHERE tenant_id=100000 AND file_name IN (${names.map(sql).join(',')}) ORDER BY file_id;`);
  const physical = async file => {
    const target = await fs.realpath(file.path); assert.ok(target.startsWith(storage + path.sep)); return target;
  };
  assert.equal(database(`SELECT COUNT(*) FROM hr_grievance WHERE tenant_id=100000 AND subject=${sql(marker)};`), '0');
  const id = String(successful(await api(employee, '/hr/ess/grievances', { method: 'POST', body: {
    grievanceType: 'OTHER', subject: marker, description: `${marker}容量事务验证`, againstType: 'NONE', fileIds: [] } }), '员工真实提交归档容量测试申诉'));
  assert.match(id, /^[1-9][0-9]*$/);
  const grievance = () => JSON.parse(database(`SELECT JSON_OBJECT('id',grievance_id,'number',grievance_no,'status',status,'disputeId',escalated_dispute_id)
    FROM hr_grievance WHERE tenant_id=100000 AND grievance_id=${id} AND subject=${sql(marker)};`));
  successful(await api(hr, `/hr/grievances/${id}/accept`, { method: 'POST', body: { content: `${marker}受理` } }), '人事真实受理申诉');
  check('申诉容量前置由真实提交与人事受理形成', grievance().status === 'ACCEPTED' && grievance().disputeId == null);
  const source = `来源申诉：${grievance().number}`;
  const disputeQuery = `SELECT id FROM hr_labor_dispute WHERE tenant_id=100000 AND close_reason=${sql(source)}`;
  const business = () => database(`SELECT * FROM hr_grievance WHERE tenant_id=100000 AND grievance_id=${id};
    SELECT * FROM hr_grievance_record WHERE tenant_id=100000 AND grievance_id=${id} ORDER BY record_id;
    SELECT * FROM hr_labor_dispute WHERE tenant_id=100000 AND close_reason=${sql(source)} ORDER BY id;
    SELECT * FROM hr_dispute_evidence WHERE tenant_id=100000 AND dispute_id IN (${disputeQuery}) ORDER BY id;`);
  const fillerName = `${marker}-capacity.txt`; const archiveName = `grievance-${id}.json`;
  const ownedFiles = () => fileRows([fillerName, archiveName]);
  assert.equal(ownedFiles().length, 0);
  let retainedArchive; let failure;
  try {
    limit(generousLimit);
    const filler = Buffer.alloc(1200000, 65);
    const saved = successful(await api(hr, '/hr/grievances/files', { method: 'POST', file: {
      name: fillerName, type: 'text/plain', content: filler.toString('base64') } }), '申诉容量前置真实上传占额文件');
    const fillerFile = ownedFiles().find(file => String(file.id) === String(saved.fileId)); assert.ok(fillerFile);
    check('申诉前置文件真实计入共享额度', usage() === initialUsage + filler.length && (await fs.readFile(await physical(fillerFile))).equals(filler));
    limit(1);
    const before = business(); const beforeFiles = JSON.stringify(ownedFiles()); const beforePhysical = JSON.stringify(await walk(storage));
    const body = { content: `${marker}升级原因` };
    const rejected = await api(hr, `/hr/grievances/${id}/escalate`, { method: 'POST', body });
    check(`申诉升级容量不足明确409 HTTP=${rejected.status} code=${rejected.body?.code}`, rejected.status === 409 && rejected.body?.code === 409
      && rejected.body?.msg === '租户可用存储空间不足，无法新增文件');
    check('升级失败整笔保留受理状态与原轨迹，不残留争议、证据或文件', business() === before
      && ownedFiles().every(file => file.name === fillerName) && JSON.stringify(ownedFiles()) === beforeFiles
      && JSON.stringify(await walk(storage)) === beforePhysical && usage() === initialUsage + filler.length);
    limit(generousLimit);
    await new Promise(resolve => setTimeout(resolve, 5100));
    successful(await api(hr, `/hr/grievances/${id}/escalate`, { method: 'POST', body }), '扩容后真实重试申诉升级');
    const current = grievance();
    check('扩容后只产生一笔真实升级争议', current.status === 'ESCALATED' && Number(current.disputeId) > 0
      && database(`SELECT COUNT(*) FROM hr_labor_dispute WHERE tenant_id=100000 AND close_reason=${sql(source)};`) === '1');
    const archives = ownedFiles().filter(file => file.name === archiveName); assert.equal(archives.length, 1);
    retainedArchive = archives[0]; assert.equal(retainedArchive.type, 'HR_GRIEVANCE_EVIDENCE');
    const bytes = await fs.readFile(await physical(retainedArchive)); const archive = JSON.parse(bytes.toString('utf8'));
    check('真实归档保留申诉和受理轨迹并仅绑定本次争议', String(archive.grievance.grievanceId) === id
      && archive.grievance.subject === marker && archive.escalationReason === body.content && archive.records.length >= 2
      && database(`SELECT COUNT(*) FROM hr_dispute_evidence WHERE tenant_id=100000 AND dispute_id=${current.disputeId} AND file_id=${retainedArchive.id};`) === '1'
      && usage() === initialUsage + filler.length + bytes.length);
    limit(1);
    const downloaded = await api(hr, `/hr/grievances/${id}/files/${retainedArchive.id}`);
    check('降额后有权人事仍能下载完整归档字节', downloaded.status === 200 && downloaded.size === bytes.length
      && downloaded.sha256 === createHash('sha256').update(bytes).digest('hex'));
    const denied = await api(employee, `/hr/ess/grievances/${id}/files/${retainedArchive.id}`);
    check('员工本人仍不能通过本人附件入口读取内部归档', denied.status === 403 && denied.body?.code === 'FORBIDDEN'
      && denied.body?.message === '无权访问该附件' && JSON.stringify(denied.body?.data) === '{}');
    evidence.storageGrievanceArchive = true;
  } catch (error) { failure = error; throw error; }
  finally {
    const failures = [];
    try {
      for (const file of ownedFiles().filter(file => file.name === fillerName)) {
        assert.equal(file.owner, 'g_holiday_hr'); assert.equal(file.type, 'HR_GRIEVANCE');
        const target = await physical(file);
        assert.equal(database(`SELECT COUNT(*) FROM hr_dispute_evidence WHERE file_id=${file.id};`), '0');
        assert.equal(database(`DELETE FROM sys_file WHERE tenant_id=100000 AND file_id=${file.id} AND file_name=${sql(fillerName)}
          AND create_by='g_holiday_hr' AND file_path=${sql(file.path)} AND deleted=0; SELECT ROW_COUNT();`), '1');
        assert.equal(database(`SELECT COUNT(*) FROM sys_file WHERE deleted=0 AND CAST(file_path AS BINARY)=CAST(${sql(file.path)} AS BINARY);`), '0');
        await fs.unlink(target);
      }
      const archives = ownedFiles().filter(file => file.name === archiveName);
      assert.equal(archives.length, retainedArchive ? 1 : 0, 'Unexpected partial archive retained for investigation');
      const retainedBytes = retainedArchive?.size ?? 0;
      assert.equal(usage(), initialUsage + retainedBytes);
      const expectedPaths = [...initialPhysical, ...(retainedArchive ? [await physical(retainedArchive)] : [])].sort();
      assert.equal(JSON.stringify(await walk(storage)), JSON.stringify(expectedPaths));
      // Keep the successful escalation, its restricted archive and audit history.
      database(`UPDATE sys_tenant SET storage_used=${Math.ceil(usage() / 1048576)} WHERE tenant_id=100000 AND version=${original.version};`);
    } catch (error) { failures.push(error); }
    try { limit(original.limit); } catch (error) { failures.push(error); }
    if (failures.length) throw new AggregateError([...(failure ? [failure] : []), ...failures], '申诉容量清理或恢复失败');
    check('占额临时文件清理且原上限和授权恢复，成功归档及历史保留', ownedFiles().every(file => file.name === archiveName)
      && tenant().limit === original.limit && tenant().version === original.version
      && tenant().used === Math.ceil(usage() / 1048576) && grants() === originalGrants);
    evidence.storageGrievanceArchiveCleanup = true;
  }
  let count = 0; let bytes = 0; let leaks = 0;
  for (const service of state.services) {
    const root = path.join(run, service.name);
    const names = await fs.readdir(path.join(root, 'logs')).catch(error => { if (error.code === 'ENOENT') return []; throw error; });
    for (const file of ['stdout.log', 'stderr.log', ...names.filter(name => name.endsWith('.log')).map(name => path.join('logs', name))]) {
      const scan = await scanSecretStream(createReadStream(path.join(root, file)), [...secrets]); count++; bytes += scan.bytes; leaks += scan.leaks;
    }
  }
  const audit = await scanOwnedAuditLogs(state, [...secrets], { log: '0', error: '0', audit: '0' });
  console.log(`H5_GRIEVANCE_CAPACITY_SECRET_SCAN: files=${count}; bytes=${bytes}; values=${secrets.size}; leaks=${leaks}; database_bytes=${audit.bytes}; database_leaks=${audit.leaks}`);
  check('申诉容量六服务及数据库日志无本次凭据泄漏', leaks === 0 && audit.leaks === 0);
  evidence.storageGrievanceArchiveSecrets = true;
  console.log(`H5_GRIEVANCE_CAPACITY_SCOPE: grievance=${id}; real_submission_acceptance_escalation=true; successful_archive_retained=true; temporary_filler_removed=true; production_modified=false`);
}
