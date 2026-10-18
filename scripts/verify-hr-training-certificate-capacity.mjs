import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import { scanOwnedAuditLogs, scanSecretStream } from './portal-checks/scan-access-logs.mjs';

// Course and employee identity are owned fixture inputs. Issuing, regenerating and
// downloading use the actual authenticated HR endpoints; no approval is fabricated.
export async function verifyHrTrainingCertificateCapacity({ admin, api, successful, session, database,
  check, caseTag, state, evidence, accounts }) {
  assert.match(caseTag, /^[a-f0-9]{12}$/);
  assert.equal(state.status, 'RUNNING');
  const run = await fs.realpath(state.run);
  assert.ok(run.toLowerCase().startsWith('d:\\cloudflowpro\\.cloudflow-runtime\\batch-g-integration\\'));
  const storage = await fs.realpath(path.join(run, 'hr/private-files'));
  assert.ok(storage.startsWith(run + path.sep));
  const sql = value => `CONVERT(0x${Buffer.from(String(value)).toString('hex')} USING utf8mb4)`;
  const rows = statement => database(statement).split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
  const username = `h5tc_${caseTag}`;
  const courseCode = `H5_TC_${caseTag}`;
  const grants = () => database('SELECT tenant_id,role_id,menu_id FROM sys_role_menu ORDER BY tenant_id,role_id,menu_id;');
  const originalGrants = grants();
  const tenant = () => JSON.parse(database('SELECT JSON_OBJECT(\'limit\',storage_limit,\'used\',storage_used,\'version\',version) FROM sys_tenant WHERE tenant_id=100000 AND deleted=0;'));
  const usage = () => Number(database(`SELECT COALESCE(SUM(physical.object_size),0) FROM (
    SELECT MAX(GREATEST(COALESCE(file_size,0),0)) AS object_size FROM sys_file WHERE tenant_id=100000 AND deleted=0
    GROUP BY storage_type,config_id,CAST(COALESCE(NULLIF(file_path,''),CAST(file_id AS CHAR)) AS BINARY)) physical;`));
  const walk = async parent => {
    const result = [];
    for (const entry of await fs.readdir(parent, { withFileTypes: true })) {
      assert.ok(!entry.isSymbolicLink(), 'Redirected storage rejected');
      const target = path.join(parent, entry.name);
      if (entry.isDirectory()) result.push(...await walk(target));
      else if (entry.isFile()) result.push(target);
    }
    return result.sort();
  };
  const original = tenant(); const initialUsage = usage(); const initialPhysical = JSON.stringify(await walk(storage));
  assert.equal(database(`SELECT COUNT(*) FROM sys_user WHERE tenant_id=100000 AND user_name=${sql(username)};`), '0');
  database(`INSERT INTO sys_user (tenant_id,dept_id,user_name,nick_name,password,status,deleted,pwd_reset_required,create_by)
    SELECT 100000,100,${sql(username)},${sql(username)},password,'0',0,'0','isolated-training-capacity'
    FROM sys_user WHERE tenant_id=100000 AND user_name='g_import_admin';`);
  const userId = database(`SELECT user_id FROM sys_user WHERE tenant_id=100000 AND user_name=${sql(username)} AND create_by='isolated-training-capacity';`);
  assert.match(userId, /^[1-9][0-9]*$/);
  database(`INSERT INTO sys_user_role(tenant_id,user_id,role_id) VALUES(100000,${userId},1);
    INSERT INTO hr_employee(tenant_id,employee_no,name,gender,dept_id,employee_status,user_id,create_by)
    VALUES(100000,${sql(username)},${sql(username)},'UNKNOWN',100,'REGULAR',${userId},'isolated-training-capacity');
    INSERT INTO hr_training_course(tenant_id,course_code,course_name,status,create_by)
    VALUES(100000,${sql(courseCode)},${sql(courseCode)},'PUBLISHED','isolated-training-capacity');`);
  const employeeId = database(`SELECT id FROM hr_employee WHERE tenant_id=100000 AND employee_no=${sql(username)} AND user_id=${userId};`);
  const courseId = database(`SELECT id FROM hr_training_course WHERE tenant_id=100000 AND course_code=${sql(courseCode)};`);
  const templateId = database('SELECT MIN(id) FROM hr_training_certificate_template WHERE tenant_id=100000 AND deleted=0;');
  assert.match(templateId, /^[1-9][0-9]*$/);
  assert.match(employeeId, /^[1-9][0-9]*$/); assert.match(courseId, /^[1-9][0-9]*$/);
  const owner = await session(username, 'g_import_admin');
  const sensitive = new Set(accounts.map(account => account.password).filter(Boolean));
  for (const page of [admin, owner]) {
    const value = await page.evaluate(async () => (await import('/src/utils/authStorage.ts')).getAuthToken());
    assert.ok(value); sensitive.add(value.replace(/^Bearer /, ''));
  }
  const files = () => rows(`SELECT JSON_OBJECT('id',file_id,'path',file_path,'size',file_size,'name',file_name,'type',file_type,'deleted',deleted)
    FROM sys_file WHERE tenant_id=100000 AND create_by=${sql(username)} ORDER BY file_id;`);
  const certificates = () => database(`SELECT * FROM hr_training_certificate WHERE tenant_id=100000 AND employee_id=${employeeId} AND course_id=${courseId} ORDER BY id;`);
  const archives = () => database(`SELECT * FROM hr_training_archive WHERE tenant_id=100000 AND employee_id=${employeeId} ORDER BY id;`);
  assert.equal(files().length, 0); assert.equal(certificates(), ''); assert.equal(archives(), '');
  const physical = async file => {
    const target = await fs.realpath(file.path);
    assert.ok(target.startsWith(storage + path.sep), 'Only owned HR files may be inspected or removed');
    return target;
  };
  let currentLimit = original.limit;
  const limit = maximum => {
    assert.ok(maximum == null || Number.isSafeInteger(maximum));
    if (currentLimit === maximum) return;
    assert.equal(database(`UPDATE sys_tenant SET storage_limit=${maximum ?? 'NULL'} WHERE tenant_id=100000 AND deleted=0
      AND version=${original.version} AND storage_limit <=> ${currentLimit ?? 'NULL'}; SELECT ROW_COUNT();`), '1');
    currentLimit = maximum;
  };
  const denied = (result, label) => check(`${label} HTTP=${result.status} code=${result.body?.code}`, result.status === 409 && result.body?.code === 409
    && result.body?.msg === '租户可用存储空间不足，无法新增文件');
  const generousLimit = Math.ceil((initialUsage + 1200000) / 1048576) + 2;
  let failure;
  try {
    limit(generousLimit);
    const filler = Buffer.alloc(1200000, 65);
    const saved = successful(await api(owner, '/hr/grievances/files', { method: 'POST',
      file: { name: `${username}-capacity.txt`, type: 'text/plain', content: filler.toString('base64') } }), '培训容量前置真实保存占额附件');
    const fillerFile = files().find(file => String(file.id) === String(saved.fileId)); assert.ok(fillerFile);
    check('培训容量前置按真实字节占用共享额度', usage() === initialUsage + filler.length
      && (await fs.readFile(await physical(fillerFile))).equals(filler));
    limit(1);
    const beforeFiles = JSON.stringify(files()); const beforePhysical = JSON.stringify(await walk(storage));
    const body = { employeeId, courseId, templateId };
    denied(await api(owner, '/hr/training/certificates/issue', { method: 'POST', body }), '培训首次生成额度不足返回明确409');
    check('首次生成失败撤回证书与档案，且不留下文件或额外用量', certificates() === '' && archives() === ''
      && JSON.stringify(files()) === beforeFiles && JSON.stringify(await walk(storage)) === beforePhysical
      && usage() === initialUsage + filler.length);
    limit(generousLimit);
    const certificateId = String(successful(await api(owner, '/hr/training/certificates/issue', { method: 'POST', body }), '扩容后真实颁发培训证书'));
    assert.match(certificateId, /^[1-9][0-9]*$/);
    const cert = JSON.parse(database(`SELECT JSON_OBJECT('id',id,'fileId',pdf_file_id,'status',status)
      FROM hr_training_certificate WHERE tenant_id=100000 AND id=${certificateId} AND employee_id=${employeeId} AND course_id=${courseId};`));
    const pdf = files().find(file => String(file.id) === String(cert.fileId)); assert.ok(pdf);
    const bytes = await fs.readFile(await physical(pdf));
    check('扩容重试生成有效培训证书并准确计量PDF', cert.status === 'VALID' && bytes.subarray(0, 5).toString() === '%PDF-'
      && pdf.size === bytes.length && usage() === initialUsage + filler.length + bytes.length);
    const download = async label => {
      const result = await api(owner, `/hr/training/certificates/${certificateId}/pdf`);
      check(label, result.status === 200 && result.size === bytes.length && result.sha256 === createHash('sha256').update(bytes).digest('hex'));
    };
    await download('培训本人真实下载生成PDF且字节一致');
    const other = await api(admin, `/hr/training/certificates/${certificateId}/pdf`);
    check('非本人管理员不能下载培训证书', [400, 403, 404].includes(other.status) && other.body?.code !== 200);
    const deadline = Date.now() + 20000;
    while (!archives() && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 250));
    assert.ok(archives(), 'Wait for owned certificate archive refresh before comparing regeneration');
    limit(1);
    const retainedCert = certificates(); const retainedFiles = JSON.stringify(files());
    const retainedArchive = archives(); const retainedPhysical = JSON.stringify(await walk(storage)); const retainedUsage = usage();
    denied(await api(owner, `/hr/training/certificates/${certificateId}/regenerate`, { method: 'POST' }), '再次降额后培训重生成返回明确409');
    check('培训重生成失败完整保留原证书、档案、PDF及用量', certificates() === retainedCert && archives() === retainedArchive
      && JSON.stringify(files()) === retainedFiles && JSON.stringify(await walk(storage)) === retainedPhysical && usage() === retainedUsage);
    await download('培训重生成失败后本人仍可下载原PDF');
    evidence.storageTrainingCertificate = true;
  } catch (error) { failure = error; throw error; }
  finally {
    const failures = [];
    try {
      database(`DELETE FROM hr_training_certificate WHERE tenant_id=100000 AND employee_id=${employeeId} AND course_id=${courseId} AND create_by=${sql(username)};
        DELETE FROM hr_training_archive WHERE tenant_id=100000 AND employee_id=${employeeId};`);
      assert.equal(certificates(), '');
      for (const file of files()) {
        const target = await physical(file);
        assert.ok(file.name === `${username}-capacity.txt` && file.type === 'HR_GRIEVANCE'
          || file.name.startsWith('training-certificate-') && file.type === 'application/pdf');
        assert.equal(database(`SELECT COUNT(*) FROM hr_training_certificate WHERE pdf_file_id=${file.id};`), '0');
        assert.equal(database(`DELETE FROM sys_file WHERE tenant_id=100000 AND file_id=${file.id} AND create_by=${sql(username)}
          AND file_path=${sql(file.path)} AND deleted=0; SELECT ROW_COUNT();`), '1');
        assert.equal(database(`SELECT COUNT(*) FROM sys_file WHERE deleted=0 AND CAST(file_path AS BINARY)=CAST(${sql(file.path)} AS BINARY);`), '0');
        await fs.unlink(target);
      }
      assert.equal(usage(), initialUsage); assert.equal(JSON.stringify(await walk(storage)), initialPhysical);
      database(`UPDATE sys_tenant SET storage_used=${original.used ?? 'NULL'} WHERE tenant_id=100000 AND version=${original.version};`);
    } catch (error) { failures.push(error); }
    try { limit(original.limit); } catch (error) { failures.push(error); }
    if (failures.length) throw new AggregateError([...(failure ? [failure] : []), ...failures], '培训生成容量清理或恢复失败');
    check('培训测试文件与证书精确清理，原额度、用量及授权恢复，审计保留', files().length === 0 && certificates() === ''
      && archives() === '' && JSON.stringify(tenant()) === JSON.stringify(original) && grants() === originalGrants);
    evidence.storageTrainingCertificateCleanup = true;
  }
  let scannedFiles = 0; let scannedBytes = 0; let leaks = 0;
  for (const service of state.services) {
    const serviceRoot = path.join(run, service.name);
    const names = await fs.readdir(path.join(serviceRoot, 'logs')).catch(error => {
      if (error.code === 'ENOENT') return []; throw error;
    });
    for (const name of ['stdout.log', 'stderr.log', ...names.filter(name => name.endsWith('.log')).map(name => path.join('logs', name))]) {
      const scan = await scanSecretStream(createReadStream(path.join(serviceRoot, name)), [...sensitive]);
      scannedFiles++; scannedBytes += scan.bytes; leaks += scan.leaks;
    }
  }
  const audit = await scanOwnedAuditLogs(state, [...sensitive], { log: '0', error: '0', audit: '0' });
  console.log(`H5_TRAINING_CAPACITY_SECRET_SCAN: files=${scannedFiles}; bytes=${scannedBytes}; values=${sensitive.size}; leaks=${leaks}; database_bytes=${audit.bytes}; database_leaks=${audit.leaks}; historical_rotated_logs_recertified=false`);
  check('培训容量当前服务输出与数据库日志无本次凭据泄漏', leaks === 0 && audit.leaks === 0);
  evidence.storageTrainingCertificateSecrets = true;
  console.log('H5_TRAINING_CAPACITY_SCOPE: actual_issue_regenerate_download=true; employee_and_course_fixture=true; temporary_files_cleaned=true; fixture_identity_retained=true; enrollment_approval_verified=false; production_modified=false');
}
