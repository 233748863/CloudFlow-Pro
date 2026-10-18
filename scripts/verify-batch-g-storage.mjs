import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { watch } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';

export async function verifyStorage(harness) {
  const { admin, api, successful, session, database, check, state, directory, caseTag, requests, pending } = harness;
  const other = await session('g_import_other');
  const tenant = await session('g_import_tenant');
  const readonly = await session('g_import_readonly');
  const masterQuery = 'SELECT COALESCE(GROUP_CONCAT(config_id ORDER BY config_id),\'\') FROM sys_file_config WHERE tenant_id IN (100000,100001) AND master_flag=1 AND deleted=0;';
  const originalMasters = database(masterQuery);
  assert.match(originalMasters, /^(?:[1-9][0-9]*(?:,[1-9][0-9]*)*)?$/);
  const pause = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
  const nextUploads = new Map();
  const digest = content => createHash('sha256').update(content).digest('hex');
  const isDenied = result => result.status >= 400 || (result.body && result.body.code !== 200);
  const numeric = value => { assert.match(String(value), /^[1-9][0-9]*$/); return value; };
  const fileRecord = fileId => JSON.parse(database(`SELECT JSON_OBJECT('fileId',file_id,'configId',config_id,'path',file_path,'url',url,'hash',file_hash,'size',file_size,'refs',ref_count,'owner',create_by,'bizType',biz_type,'deleted',deleted) FROM sys_file WHERE file_id=${numeric(fileId)};`));
  const localPath = file => {
    const root = path.join(directory, 'profile');
    const target = path.resolve(root, file.filePath.replace(/^\//, ''));
    assert.ok(target.startsWith(root + path.sep), 'File remains in isolated profile');
    return target;
  };
  const physicalBytes = () => Number(database("SELECT COALESCE(SUM(object_size),0) FROM (SELECT MAX(file_size) object_size FROM sys_file WHERE tenant_id=100000 AND deleted=0 GROUP BY storage_type,config_id,CAST(file_path AS BINARY)) objects;"));
  const upload = async (page, content, label, extension = 'txt') => {
    await pause(Math.max(0, (nextUploads.get(page) || 0) - Date.now()));
    nextUploads.set(page, Date.now() + 5300);
    return api(page, '/auth/system/file/upload', { method: 'POST', file: { name: `${caseTag}-${label}.${extension}`, type: extension === 'csv' ? 'text/csv' : 'text/plain', content: content.toString('base64') } });
  };
  const simultaneous = async operations => {
    await pause(Math.max(0, ...operations.map(operation => (nextUploads.get(operation.page) || 0) - Date.now())));
    return Promise.all(operations.map(operation => upload(operation.page, operation.content, operation.label)));
  };
  const configuration = async (storageType, suffix, additions = {}) => successful(await api(admin, '/auth/system/file/config', { method: 'POST', body: {
    configCode: `G_${caseTag}_${suffix}`, configName: `存储真实验收-${suffix}`, storageType, masterFlag: 1,
    basePath: `g-storage/${caseTag}/${suffix}`, maxFileSize: 1048576, allowedExtensions: 'txt,csv', accessPolicy: '0', status: 'ENABLED', signedUrlExpireSeconds: 60, ...additions,
  } }), `${storageType}配置保存`);
  const remove = async (page, file) => successful(await api(page, `/auth/system/file/${numeric(file.fileId)}`, { method: 'DELETE' }), '删除本人文件引用');
  const download = async (page, file, expected) => {
    const token = await page.evaluate(async () => (await import('/src/utils/authStorage.ts')).getAuthToken());
    const gateway = state.services.find(service => service.name === 'gateway');
    const resource = `/auth/system/file/${numeric(file.fileId)}/content`;
    let response = await fetch(`http://127.0.0.1:${gateway.port}${resource}`, { headers: { Authorization: token.startsWith('Bearer ') ? token : `Bearer ${token}` }, redirect: 'manual' });
    requests.push({ path: resource, method: 'GET', status: response.status, traceId: response.headers.get('X-Trace-Id') });
    assert.match(response.headers.get('X-Trace-Id') || '', /^[a-f0-9]{32}$/);
    if (response.status === 302) {
      assert.ok(state.objectStorage, 'Redirect requires real isolated object storage');
      const signed = new URL(response.headers.get('Location'));
      assert.equal(signed.origin, state.objectStorage.endpoint, 'Signed redirect stays on isolated storage');
      assert.ok(signed.searchParams.has('X-Amz-Signature'));
      response = await fetch(signed, { redirect: 'error' });
    }
    assert.equal(response.status, 200, 'Authenticated content is readable');
    const content = Buffer.from(await response.arrayBuffer());
    assert.equal(digest(content), digest(expected), 'Downloaded file preserves original bytes');
  };

  try {
    database('UPDATE sys_file_config SET master_flag=0 WHERE tenant_id IN (100000,100001) AND deleted=0;');
    const fallbackContent = Buffer.from(`shared-default-${caseTag}`);
    const firstTenant = successful(await upload(admin, fallbackContent, 'default-owner'), '默认存储上传');
    const secondTenant = successful(await upload(tenant, fallbackContent, 'default-tenant'), '其他租户默认存储上传');
    check('相同默认配置下跨租户不复用物理对象', firstTenant.configId === secondTenant.configId && firstTenant.filePath !== secondTenant.filePath);
    check('跨租户不能读取相同内容的他人文件编号', isDenied(await api(tenant, `/auth/system/file/${numeric(firstTenant.fileId)}/content`)));
    await download(tenant, secondTenant, fallbackContent);
    await remove(admin, firstTenant);
    await remove(tenant, secondTenant);

    const local = await configuration('LOCAL', 'LOCAL_A');
    const connectionEvents = [];
    const watcher = watch(path.join(directory, 'profile'), { recursive: true }, (event, filename) => { if (String(filename).includes('.cloudflow-connection-')) connectionEvents.push(event); });
    try {
      successful(await api(admin, `/auth/system/file/config/${numeric(local.configId)}/test`, { method: 'POST' }), '本地连通性测试');
      await pause(200);
    } finally { watcher.close(); }
    check('本地连通性测试真实创建并清理探测文件', connectionEvents.length > 0 && (await fs.readdir(path.join(directory, 'profile', local.basePath))).length === 0);
    const content = Buffer.from(`same-content-${caseTag}\r\n`);
    const original = successful(await upload(admin, content, 'shared-owner'), '上传首个物理对象');
    check('上传后原始记录不持久化私有访问URL', fileRecord(original.fileId).url === '');
    check('同租户其他上传者不能读取原文件编号', isDenied(await api(other, `/auth/system/file/${numeric(original.fileId)}/content`)));
    const duplicate = successful(await upload(other, content, 'shared-other', 'csv'), '跨上传者复用');
    check('同租户同配置同内容跨上传者和扩展名复用', original.filePath === duplicate.filePath && original.fileId !== duplicate.fileId && duplicate.fileType === 'csv');
    check('共享物理对象保留两个上传者的独立归属及引用计数', fileRecord(original.fileId).owner === 'g_import_admin' && fileRecord(duplicate.fileId).owner === 'g_import_other' && fileRecord(original.fileId).refs === 2 && fileRecord(duplicate.fileId).refs === 2);
    check('复用后仍不能读取他人的文件编号', isDenied(await api(other, `/auth/system/file/${numeric(original.fileId)}/content`)));
    await download(other, duplicate, content);
    const oldEntry = await api(other, `/auth/system/file/access?path=${encodeURIComponent(original.filePath)}`);
    check('旧路径入口按本人独立引用读取同一物理对象', oldEntry.status === 200 && oldEntry.sha256 === digest(content));
    const beforeRemoval = physicalBytes();
    await remove(admin, original);
    check('删除第一个引用保留物理文件且不释放配额', fileRecord(duplicate.fileId).refs === 1 && physicalBytes() === beforeRemoval && (await fs.stat(localPath(duplicate))).size === content.length);
    await download(other, duplicate, content);
    await remove(other, duplicate);
    check('删除最后引用才移除物理文件并释放实际字节', physicalBytes() === beforeRemoval - content.length && !(await fs.stat(localPath(duplicate)).then(() => true, () => false)));

    const types = successful(await api(admin, '/auth/system/import/types'), '真实导入业务定义');
    const holiday = types.find(definition => definition.bizType === 'HOLIDAY');
    assert.ok(holiday);
    const row = { calendarId: 'G_IMPORT_CALENDAR', holidayDate: '2058-02-03', dateType: 'HOLIDAY', yearNo: '2058', holidayName: `storage-${caseTag}` };
    const quote = value => `"${String(value ?? '').replaceAll('"', '""')}"`;
    const importedContent = Buffer.from('\uFEFF' + [holiday.columns.map(column => quote(column.name)).join(','), holiday.columns.map(column => quote(row[column.field])).join(',')].join('\r\n') + '\r\n');
    successful(await api(admin, '/auth/system/import/HOLIDAY/upload', { method: 'POST', file: { name: `${caseTag}-bound.csv`, type: 'text/csv', content: importedContent.toString('base64') } }), '上传真实导入业务附件');
    const boundId = database(`SELECT file_id FROM sys_file WHERE tenant_id=100000 AND file_hash='${digest(importedContent)}' AND biz_type IS NOT NULL AND deleted=0 ORDER BY file_id DESC LIMIT 1;`);
    numeric(boundId);
    const unbound = successful(await upload(admin, importedContent, 'after-bound', 'csv'), '复用已有业务附件');
    check('已绑定真实导入业务的内容仍参与物理去重', unbound.filePath === fileRecord(boundId).path && fileRecord(boundId).refs === 2);
    check('复用引用保持未绑定业务状态且不继承源文件权限', !fileRecord(unbound.fileId).bizType && isDenied(await api(admin, `/auth/system/file/${boundId}/content`)));
    const afterBound = await api(admin, `/auth/system/file/access?path=${encodeURIComponent(unbound.filePath)}`);
    check('旧路径查找跳过更早的业务引用并选择本人可访问引用', afterBound.status === 200 && afterBound.sha256 === digest(importedContent));

    const pairedContent = Buffer.from(`concurrent-dedup-${caseTag}`);
    const paired = (await simultaneous([{ page: admin, content: pairedContent, label: 'parallel-owner' }, { page: other, content: pairedContent, label: 'parallel-other' }])).map(result => successful(result, '两个真实登录用户并发上传'));
    check('两个用户并发同内容上传只产生一个物理对象', paired[0].filePath === paired[1].filePath && paired[0].fileId !== paired[1].fileId && paired.every(file => fileRecord(file.fileId).refs === 2));
    const summary = successful(await api(admin, '/auth/system/file/storage/summary'), '实际存储用量');
    check('租户用量按去重物理字节向上换算MB', Number(summary.storageUsed) === Math.ceil(physicalBytes() / 1048576));

    const previousLimit = database('SELECT storage_limit FROM sys_tenant WHERE tenant_id=100000;');
    const limitedMegabytes = Math.floor(physicalBytes() / 1048576) + 1;
    const remainingBytes = limitedMegabytes * 1048576 - physicalBytes();
    const attemptedBytes = Math.floor(remainingBytes / 2) + 1;
    database(`UPDATE sys_tenant SET storage_limit=${limitedMegabytes} WHERE tenant_id=100000;`);
    try {
      const quotaAttempts = await simultaneous([{ page: admin, content: Buffer.alloc(attemptedBytes, 65), label: 'quota-owner' }, { page: other, content: Buffer.alloc(attemptedBytes, 66), label: 'quota-other' }]);
      const allowed = quotaAttempts.filter(result => result.status === 200 && result.body?.code === 200);
      const refused = quotaAttempts.filter(isDenied);
      check(`两用户并发争用${remainingBytes}字节余量只允许一个${attemptedBytes}字节文件`, allowed.length === 1 && refused.length === 1 && physicalBytes() <= limitedMegabytes * 1048576 && /存储空间不足/.test(refused[0].body?.msg || refused[0].body?.message || ''));
      const winningIndex = quotaAttempts.indexOf(allowed[0]);
      await remove(winningIndex === 0 ? admin : other, allowed[0].body.data);
    } finally { database(`UPDATE sys_tenant SET storage_limit=${numeric(previousLimit)} WHERE tenant_id=100000;`); }

    const switched = await configuration('LOCAL', 'LOCAL_B');
    check('切换主配置保持每租户仅一个主用配置', database('SELECT COUNT(*) FROM sys_file_config WHERE tenant_id=100000 AND master_flag=1 AND deleted=0;') === '1');
    await download(admin, paired[0], pairedContent);
    const separate = successful(await upload(admin, pairedContent, 'new-configuration'), '新配置上传相同内容');
    check('切换后旧文件可读且不同配置不去重', String(separate.configId) === String(switched.configId) && separate.filePath !== paired[0].filePath);
    const priorConfig = successful(await api(admin, `/auth/system/file/config/${numeric(local.configId)}`), '旧配置详情');
    check('仍有文件引用的配置不能删除', isDenied(await api(admin, `/auth/system/file/config/${numeric(local.configId)}`, { method: 'DELETE' })));
    check('仍有文件引用的配置不能改变存储位置', isDenied(await api(admin, '/auth/system/file/config', { method: 'PUT', body: { ...priorConfig, basePath: `g-storage/${caseTag}/moved` } })));
    check('其他租户不能读取存储配置', isDenied(await api(tenant, `/auth/system/file/config/${numeric(local.configId)}`)));
    check('只读用户不能创建文件或列出配置', isDenied(await upload(readonly, content, 'readonly')) && isDenied(await api(readonly, '/auth/system/file/config/list')));

    if (!state.objectStorage) {
      pending.push('未配置真实MinIO，未执行对象存储验收');
      return;
    }
    const credentials = JSON.parse((await fs.readFile(path.join(directory, 'private', 'storage.json'), 'utf8')).replace(/^\uFEFF/, ''));
    const probeArguments = (await fs.readFile(path.join(directory, 'storage-fixtures.args'), 'utf8')).trim().split(/\r?\n/);
    probeArguments[probeArguments.length - 1] = 'inventory';
    const probeFile = path.join(directory, `storage-inventory-${caseTag}.args`);
    await fs.writeFile(probeFile, probeArguments.join('\n'));
    const inventory = () => {
      const result = spawnSync(path.join(process.env.JAVA_HOME, 'bin', 'java.exe'), [`@${probeFile}`], { encoding: 'utf8', timeout: 45000, windowsHide: true });
      assert.equal(result.status, 0, 'Isolated object storage inventory succeeds');
      const report = result.stdout.split(/\r?\n/).find(line => line.startsWith('STORAGE_RESULT:'));
      assert.ok(report, 'Object inventory is returned by real S3 service');
      return JSON.parse(report.slice('STORAGE_RESULT:'.length)).objects;
    };
    for (const storageType of ['MINIO', 'S3', 'OSS', 'COS']) {
      const config = await configuration(storageType, storageType, { endpoint: credentials.endpoint, region: 'us-east-1', bucket: credentials.bucket, accessKey: credentials.accessKey, secretKey: credentials.secretKey });
      const saved = database(`SELECT secret_key_cipher FROM sys_file_config WHERE config_id=${numeric(config.configId)};`);
      check(`${storageType}密钥加密落库且配置响应不回显凭据`, saved.length > credentials.secretKey.length && !saved.includes(credentials.secretKey) && !JSON.stringify(config).includes(credentials.secretKey) && !JSON.stringify(config).includes(credentials.accessKey));
      const before = inventory();
      successful(await api(admin, `/auth/system/file/config/${numeric(config.configId)}/test`, { method: 'POST' }), `${storageType}真实连通性测试`);
      check(`${storageType}连通性测试结束后无探测对象残留`, JSON.stringify(inventory()) === JSON.stringify(before));
      const objectContent = Buffer.from(`object-storage-${storageType}-${caseTag}`);
      const remote = successful(await upload(admin, objectContent, storageType), `${storageType}上传`);
      const shared = successful(await upload(other, objectContent, `${storageType}-other`, 'csv'), `${storageType}复用`);
      check(`${storageType}真实对象写入且两个用户仅占一个对象`, remote.filePath === shared.filePath && inventory().filter(object => object.key === remote.objectKey).length === 1 && fileRecord(remote.fileId).refs === 2);
      await download(admin, remote, objectContent);
      await download(other, shared, objectContent);
      const anonymous = await fetch(`${credentials.endpoint}/${credentials.bucket}/${remote.objectKey}`, { redirect: 'error' });
      check(`${storageType}存储对象匿名直链被拒绝`, anonymous.status === 403);
      check(`${storageType}共享对象仍隔离文件编号权限`, isDenied(await api(other, `/auth/system/file/${numeric(remote.fileId)}/content`)));
      await remove(admin, remote);
      check(`${storageType}删除首个引用保留远程对象`, inventory().some(object => object.key === shared.objectKey) && fileRecord(shared.fileId).refs === 1);
      await download(other, shared, objectContent);
      await remove(other, shared);
      check(`${storageType}最后引用删除后真实远程对象消失`, !inventory().some(object => object.key === shared.objectKey));
    }
    const invalidPolicy = await api(admin, '/auth/system/file/config', { method: 'POST', body: { configCode: `G_${caseTag}_PUBLIC`, configName: '公共策略拒绝验收', storageType: 'OSS', endpoint: credentials.endpoint, region: 'us-east-1', bucket: credentials.bucket, accessKey: credentials.accessKey, secretKey: credentials.secretKey, accessPolicy: '1' } });
    check('非私有OSS配置保存被拒绝且没有配置落库', isDenied(invalidPolicy) && database(`SELECT COUNT(*) FROM sys_file_config WHERE config_code='G_${caseTag}_PUBLIC';`) === '0');
    const wrong = await configuration('MINIO', 'INVALID_KEY', { masterFlag: 0, endpoint: credentials.endpoint, region: 'us-east-1', bucket: credentials.bucket, accessKey: 'invalid-isolated-key', secretKey: 'invalid-isolated-secret' });
    const rejected = await api(admin, `/auth/system/file/config/${numeric(wrong.configId)}/test`, { method: 'POST' });
    check('错误凭据的真实连通性测试拒绝成功且不泄露密钥', isDenied(rejected) && !JSON.stringify(rejected).includes('invalid-isolated-secret'));
    for (const service of state.services) {
      for (const filename of ['stdout.log', 'stderr.log']) {
        const log = await fs.readFile(path.join(directory, service.name, filename), 'utf8');
        check(`${service.name}/${filename}不包含存储密钥明文`, !log.includes(credentials.secretKey));
      }
    }
    const errors = database("SELECT CONCAT_WS('|',request_params,exception_message,exception_stack) FROM sys_api_error_log WHERE tenant_id=100000;");
    check('异常落库不包含存储密钥明文', !errors.includes(credentials.secretKey) && !errors.includes('invalid-isolated-secret'));
    check('存储验收接口响应均返回唯一追踪号', requests.every(request => /^[a-f0-9]{32}$/.test(request.traceId || '')));
    pending.push('S3/OSS/COS适配使用真实MinIO验证协议兼容；各云厂商托管账号未验收', '完整17类业务附件校验与新签名接口仍等待D/E/F依赖');
  } finally {
    try {
      const restore = originalMasters ? `UPDATE sys_file_config SET master_flag=1 WHERE config_id IN (${originalMasters}) AND tenant_id IN (100000,100001) AND deleted=0;` : '';
      database(`START TRANSACTION; UPDATE sys_file_config SET master_flag=0 WHERE tenant_id IN (100000,100001) AND deleted=0; ${restore} COMMIT;`);
      check('存储回归结束后还原原有租户主配置', database(masterQuery) === originalMasters);
    } finally {
      await Promise.all([other, tenant, readonly].map(page => page.context().close()));
    }
  }
}
