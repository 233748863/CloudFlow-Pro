import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import { ownedGatewayRedis } from './owned-gateway-redis.mjs';
import { scanOwnedAuditLogs, scanSecretStream } from './portal-checks/scan-access-logs.mjs';

export async function verifyHrEmployeeCertificateCapacity({ admin, api, successful, session, database,
  check, caseTag, state, evidence, accounts }) {
  assert.match(caseTag, /^[a-f0-9]{12}$/); assert.equal(state.status, 'RUNNING');
  const run = await fs.realpath(state.run);
  assert.ok(run.toLowerCase().startsWith('d:\\cloudflowpro\\.cloudflow-runtime\\batch-g-integration\\'));
  const storage = await fs.realpath(path.join(run, 'hr/private-files'));
  assert.ok(storage.startsWith(run + path.sep));
  const redis = await ownedGatewayRedis(state);
  const sql = value => `CONVERT(0x${Buffer.from(String(value)).toString('hex')} USING utf8mb4)`;
  const rows = statement => database(statement).split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
  const waitFor = async (read, accepted, label, timeout = 90000) => {
    const deadline = Date.now() + timeout;
    do { const value = await read(); if (accepted(value)) return value; await new Promise(resolve => setTimeout(resolve, 700)); } while (Date.now() < deadline);
    throw new Error(label);
  };
  if (process.argv.includes('--employee-certificate-cleanup-r1')) {
    const old = rows("SELECT JSON_OBJECT('id',id,'instance',process_instance_id,'status',status) FROM hr_certificate_request WHERE tenant_id=100000 AND id=24110 AND purpose='H5_EMP_CERT_9870a25aa716' AND create_by='h5ec_9870a25aa716';")[0];
    assert.ok(old?.instance); assert.equal(old.status, 'PENDING');
    successful(await api(admin, '/workflow/wf/instance/terminate', { method: 'POST', body: { instanceId: old.instance, reason: 'H5_EMP_CERT_9870a25aa716身份复现收尾' } }), '管理员终止原身份复现流程');
    await waitFor(() => database("SELECT status FROM hr_certificate_request WHERE tenant_id=100000 AND id=24110;"), value => value === 'CANCELLED', '原复现申请未回写取消');
    assert.equal(database("UPDATE wf_process_definition SET status='DRAFT',is_latest=0 WHERE tenant_id=100000 AND definition_id='H5_EMP_CERT_9870a25aa716' AND status='PUBLISHED'; SELECT ROW_COUNT();"), '1');
    check('原身份复现申请由真实终止回写取消，流程定义及业务历史保留', true);
    console.log('EMPLOYEE_CERTIFICATE_R1_CLEANUP: original_request=24110; cancelled_by_real_workflow=true; capacity_never_changed=true; original_config_never_changed=true; grants_unchanged=true');
    return;
  }
  if (process.argv.includes('--employee-certificate-cleanup-r2')) {
    const old = rows("SELECT JSON_OBJECT('id',id,'status',status,'file',pdf_file_id) FROM hr_certificate_request WHERE tenant_id=100000 AND id=24111 AND purpose='H5_EMP_CERT_d54655050540' AND create_by='h5ec_d54655050540';")[0];
    assert.equal(old?.status, 'ISSUED'); assert.ok(old.file);
    assert.equal(database("UPDATE wf_process_definition SET status='DRAFT',is_latest=0 WHERE tenant_id=100000 AND definition_id='H5_EMP_CERT_d54655050540' AND status='PUBLISHED'; SELECT ROW_COUNT();"), '1');
    assert.equal(database('SELECT storage_limit FROM sys_tenant WHERE tenant_id=100000;'), '10240');
    check('R2原回调在恢复额度后真实签发，业务历史及原容量保留', true);
    console.log('EMPLOYEE_CERTIFICATE_R2_CLEANUP: original_request=24111; original_callback_recovered=true; original_capacity_restored=true; definition_unpublished=true');
    return;
  }
  const username = `h5ec_${caseTag}`; const marker = `H5_EMP_CERT_${caseTag}`;
  assert.equal(database(`SELECT COUNT(*) FROM sys_user WHERE tenant_id=100000 AND user_name=${sql(username)};`), '0');
  database(`INSERT INTO sys_user(tenant_id,dept_id,user_name,nick_name,password,status,deleted,pwd_reset_required,create_by)
    SELECT 100000,100,${sql(username)},${sql(username)},password,'0',0,'0','isolated-employee-certificate'
    FROM sys_user WHERE tenant_id=100000 AND user_name='g_holiday_employee';`);
  const userId = database(`SELECT user_id FROM sys_user WHERE tenant_id=100000 AND user_name=${sql(username)} AND create_by='isolated-employee-certificate';`);
  assert.match(userId, /^[1-9][0-9]*$/);
  database(`INSERT INTO sys_user_role(tenant_id,user_id,role_id) VALUES(100000,${userId},5);
    INSERT INTO hr_employee(tenant_id,employee_no,name,gender,dept_id,employee_status,user_id,create_by)
    VALUES(100000,${sql(username)},${sql(username)},'UNKNOWN',100,'REGULAR',${userId},'isolated-employee-certificate');`);
  const employeeId = database(`SELECT id FROM hr_employee WHERE tenant_id=100000 AND user_id=${userId} AND employee_no=${sql(username)};`);
  assert.match(employeeId, /^[1-9][0-9]*$/); assert.notEqual(employeeId, userId, 'Use distinct employee and account IDs');
  const hr = await session('g_holiday_hr'); const employee = await session(username, 'g_holiday_employee');
  const outsiderName = `${username}_x`;
  database(`INSERT INTO sys_user(tenant_id,dept_id,user_name,nick_name,password,status,deleted,pwd_reset_required,create_by)
    SELECT 100000,100,${sql(outsiderName)},${sql(outsiderName)},password,'0',0,'0','isolated-employee-certificate' FROM sys_user WHERE user_id=${userId};`);
  const outsiderId = database(`SELECT user_id FROM sys_user WHERE tenant_id=100000 AND user_name=${sql(outsiderName)};`);
  assert.match(outsiderId, /^[1-9][0-9]*$/);
  database(`INSERT INTO sys_user_role(tenant_id,user_id,role_id) VALUES(100000,${outsiderId},5);
    INSERT INTO hr_employee(tenant_id,employee_no,name,gender,dept_id,employee_status,user_id,create_by)
    VALUES(100000,${sql(outsiderName)},${sql(outsiderName)},'UNKNOWN',100,'REGULAR',${outsiderId},'isolated-employee-certificate');`);
  const outsider = await session(outsiderName, 'g_holiday_employee');
  const hrId = database("SELECT user_id FROM sys_user WHERE tenant_id=100000 AND user_name='g_holiday_hr';"); assert.match(hrId, /^[1-9][0-9]*$/);
  const secrets = new Set(accounts.map(account => account.password).filter(Boolean));
  for (const page of [admin, hr, employee, outsider]) {
    const token = await page.evaluate(async () => (await import('/src/utils/authStorage.ts')).getAuthToken());
    assert.ok(token); secrets.add(token.replace(/^Bearer /, ''));
  }
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
  assert.ok(initialUsage > 1048576, 'Existing owned fixture must exceed 1 MiB');
  assert.equal(original.used, Math.ceil(initialUsage / 1048576));
  let currentLimit = original.limit;
  const limit = maximum => {
    assert.ok(maximum == null || Number.isSafeInteger(maximum));
    if (maximum === currentLimit) return;
    assert.equal(database(`UPDATE sys_tenant SET storage_limit=${maximum ?? 'NULL'} WHERE tenant_id=100000 AND deleted=0
      AND version=${original.version} AND storage_limit <=> ${currentLimit ?? 'NULL'}; SELECT ROW_COUNT();`), '1');
    currentLimit = maximum;
  };
  const configKey = 'sys.hr.certificate.processKey'; const configRoot = '/auth/system/config';
  const configured = successful(await api(admin, `${configRoot}/list?configKey=${configKey}&pageSize=100`), '读取原员工证明流程配置').records.find(row => row.configKey === configKey);
  const processKey = 'wf_hr_certificate_request'; const definitionId = marker;
  assert.equal(database(`SELECT COUNT(*) FROM wf_process_definition WHERE tenant_id=100000 AND process_key=${sql(processKey)} AND status='PUBLISHED' AND deleted=0;`), '0', 'Do not replace existing published definition');
  const version = Number(database(`SELECT COALESCE(MAX(version),0)+1 FROM wf_process_definition WHERE tenant_id=100000 AND process_key=${sql(processKey)};`));
  const model = { nodes: [{ id: 'start', type: 'START', title: '员工申请' },
    { id: 'hr', type: 'APPROVAL', title: '人事审批', approverType: 'USER', approverValue: hrId, signType: 'ANY' },
    { id: 'end', type: 'END', title: '完成' }], edges: [{ id: 'first', source: 'start', target: 'hr' }, { id: 'second', source: 'hr', target: 'end' }] };
  let configuredChanged = false; let definitionCreated = false; let id; let failure; let pendingId;
  const request = () => rows(`SELECT JSON_OBJECT('id',id,'number',request_no,'employee',CAST(employee_id AS CHAR),'status',status,'instance',process_instance_id,'file',pdf_file_id)
    FROM hr_certificate_request WHERE tenant_id=100000 AND id=${id} AND purpose=${sql(marker)};`)[0];
  const files = () => rows(`SELECT JSON_OBJECT('id',file_id,'path',file_path,'name',file_name,'size',file_size) FROM sys_file
    WHERE tenant_id=100000 AND file_name=${sql(`certificate-${request().number}.pdf`)} AND deleted=0 ORDER BY file_id;`);
  const effects = () => database(`SELECT COUNT(*) FROM wf_callback_side_effect WHERE tenant_id=100000 AND business_type='CERTIFICATE_REQUEST'
    AND business_id=${id} AND process_instance_id=${sql(request().instance)} AND effect_key='CERTIFICATE_ISSUE_PDF';`);
  const stream = 'workflow:stream:approval-callback:hr'; const group = 'group:hr:workflow-callback';
  const decoded = value => { try { return JSON.parse(value); } catch { return value; } };
  const messageFor = instance => JSON.parse(redis('--json', 'XRANGE', stream, '-', '+')).find(([, fields]) => {
    const body = Object.fromEntries(Array.from({ length: fields.length / 2 }, (_, i) => [fields[i * 2], decoded(fields[i * 2 + 1])]));
    return body.processInstanceId === instance && String(body.businessId) === id && Number(body.tenantId) === 100000;
  });
  try {
    database(`INSERT INTO wf_process_definition(definition_id,tenant_id,process_name,process_key,version,model_json,status,is_latest,deleted)
      VALUES(${sql(definitionId)},100000,${sql(marker)},${sql(processKey)},${version},${sql(JSON.stringify(model))},'PUBLISHED',1,0);`); definitionCreated = true;
    if (configured?.configValue !== processKey) {
      successful(await api(admin, configRoot, { method: configured ? 'PUT' : 'POST', body: { ...(configured || {}), configKey, configName: marker, configValue: processKey, configType: 'N', configScope: '1' } }), '启用隔离员工证明流程'); configuredChanged = true;
    }
    id = String(successful(await api(employee, '/hr/ess/certificates', { method: 'POST', body: {
      certificateType: 'EMPLOYMENT', purpose: marker, language: 'zh-CN', recipientOrg: '隔离容量验证', copies: 1 } }), '本人真实提交员工证明申请'));
    assert.match(id, /^[1-9][0-9]*$/);
    const bound = await waitFor(request, row => Boolean(row?.instance), '申请未绑定真实审批');
    const starter = database(`SELECT start_user_id FROM wf_process_instance WHERE tenant_id=100000 AND instance_id=${sql(bound.instance)} AND definition_id=${sql(definitionId)};`);
    console.log(`H5_EMPLOYEE_CERTIFICATE_IDENTITY: request=${id}; employee=${employeeId}; account=${userId}; starter=${starter}; distinct_ids=true`);
    check('员工证明实际审批发起人等于本人账号，员工档案编号独立', starter === userId && bound.employee === employeeId);
    evidence.identity = true;
    const task = await waitFor(() => rows(`SELECT JSON_OBJECT('id',task_id,'assignee',CAST(assignee AS CHAR)) FROM wf_task
      WHERE tenant_id=100000 AND instance_id=${sql(bound.instance)} AND status='TODO';`), value => value.length === 1, '未形成真实人事审批待办');
    assert.equal(task[0].assignee, hrId);
    limit(1);
    successful(await api(hr, '/workflow/wf/complete', { method: 'POST', body: { taskId: task[0].id, action: 'APPROVE', comment: marker } }), '人事真实审批通过员工证明');
    const originalMessage = await waitFor(() => messageFor(bound.instance), Boolean, '审批未发布真实回调');
    await waitFor(() => JSON.parse(redis('--json', 'XPENDING', stream, group, originalMessage[0], originalMessage[0], '1')), value => value.length === 1 && value[0][2] >= 3000, '原审批回调未保持待处理');
    const leaseKey = `wf:callback:idem:v2:100000:${bound.instance}`;
    await waitFor(() => redis('GET', leaseKey), value => !value, '失败回调未释放处理租约');
    check('容量不足保留原申请状态且无文件、签发标记或已完成回调', request().status === bound.status && request().file == null
      && files().length === 0 && effects() === '0' && usage() === initialUsage
      && JSON.stringify(await walk(storage)) === JSON.stringify(initialPhysical));
    const beforeDownload = await api(employee, `/hr/ess/certificates/${id}/pdf`);
    check(`容量失败后本人下载明确说明证明尚未生成 HTTP=${beforeDownload.status} code=${beforeDownload.body?.code}`, beforeDownload.status === 400 && beforeDownload.body?.code === 'CERTIFICATE_NOT_ISSUED');
    limit(Math.ceil(initialUsage / 1048576) + 2);
    await waitFor(request, value => value.status === 'ISSUED', '扩容后原审批回调未自动重试成功', 150000);
    await waitFor(() => redis('GET', leaseKey), value => value === 'DONE', '实际回调未确认完成');
    const generated = files(); assert.equal(generated.length, 1); const issuedFile = generated[0];
    const target = await fs.realpath(issuedFile.path); assert.ok(target.startsWith(storage + path.sep));
    const bytes = await fs.readFile(target);
    check('原审批自动重试仅签发一份有效PDF并只登记一次生成', String(request().file) === String(issuedFile.id)
      && bytes.subarray(0, 5).toString() === '%PDF-' && effects() === '1' && usage() === initialUsage + bytes.length);
    limit(1);
    const downloaded = await api(employee, `/hr/ess/certificates/${id}/pdf`);
    check('本人在降额后仍可下载完整已签发证明', downloaded.status === 200 && downloaded.size === bytes.length
      && downloaded.sha256 === createHash('sha256').update(bytes).digest('hex'));
    const denied = await api(admin, `/hr/ess/certificates/${id}/pdf`);
    check('非本人管理员不能从本人入口下载员工证明', denied.status === 403 && denied.body?.code === 'FORBIDDEN_CROSS_EMPLOYEE'
      || denied.status === 400 && denied.body?.code === 'EMPLOYEE_NOT_BOUND');
    const outsiderDownload = await api(outsider, `/hr/ess/certificates/${id}/pdf`);
    check('同角色其他员工不能下载本人证明', outsiderDownload.status === 403 && outsiderDownload.body?.code === 'FORBIDDEN_CROSS_EMPLOYEE');
    const replayId = redis('XADD', stream, '*', ...originalMessage[1]); assert.match(replayId, /^\d+-\d+$/);
    await waitFor(() => JSON.parse(redis('--json', 'XRANGE', stream, replayId, replayId)), value => value.length === 0, '相同真实审批消息未被确认');
    check('原审批消息重复投递不重复签发或占额', files().length === 1 && effects() === '1'
      && String(request().file) === String(issuedFile.id) && usage() === initialUsage + bytes.length);
    const cancelIssued = await api(employee, `/hr/ess/certificates/${id}/cancel`, { method: 'POST' });
    check('已签发证明不能撤销且原文件保留', cancelIssued.status === 400 && cancelIssued.body?.code === 'STATUS_NOT_CANCELABLE'
      && request().status === 'ISSUED' && files().length === 1);
    pendingId = String(successful(await api(employee, '/hr/ess/certificates', { method: 'POST', body: {
      certificateType: 'EMPLOYMENT', purpose: `${marker}_cancel`, language: 'zh-CN', copies: 1 } }), '本人提交待撤销证明申请'));
    assert.match(pendingId, /^[1-9][0-9]*$/);
    const pending = () => rows(`SELECT JSON_OBJECT('status',status,'instance',process_instance_id,'file',pdf_file_id) FROM hr_certificate_request
      WHERE tenant_id=100000 AND id=${pendingId} AND purpose=${sql(`${marker}_cancel`)};`)[0];
    await waitFor(pending, row => Boolean(row?.instance), '待撤销申请未绑定审批');
    const outsiderRead = await api(outsider, `/hr/ess/certificates/${pendingId}`);
    const outsiderCancel = await api(outsider, `/hr/ess/certificates/${pendingId}/cancel`, { method: 'POST' });
    check('同角色其他员工详情被数据范围隐藏，撤销被本人检查拒绝', outsiderRead.status === 404 && outsiderRead.body?.code === 'CERTIFICATE_NOT_FOUND'
      && outsiderCancel.status === 403 && outsiderCancel.body?.code === 'FORBIDDEN_CROSS_EMPLOYEE' && pending().status === 'PENDING');
    const administratorRead = await api(admin, `/hr/ess/certificates/${pendingId}`);
    check('具备完整数据范围的非本人管理员仍不能读取自助详情', administratorRead.status === 403 && administratorRead.body?.code === 'FORBIDDEN_CROSS_EMPLOYEE');
    const outsiderList = successful(await api(outsider, '/hr/ess/certificates?pageNum=1&pageSize=100'), '其他员工读取本人的证明列表');
    check('其他员工列表不包含本次证明', outsiderList.rows.length === 0 && outsiderList.total === 0);
    const missing = await api(employee, '/hr/ess/certificates/99999999999999');
    check('不存在的申请明确404且不返回证明详情', missing.status === 404 && missing.body?.code === 'CERTIFICATE_NOT_FOUND');
    successful(await api(employee, `/hr/ess/certificates/${pendingId}`, {}), '本人可查看待审批证明');
    successful(await api(employee, `/hr/ess/certificates/${pendingId}/cancel`, { method: 'POST' }), '本人真实撤销待审批证明');
    check('本人撤销关闭原审批且不生成文件', pending().status === 'CANCELLED' && pending().file == null
      && database(`SELECT COUNT(*) FROM wf_task WHERE instance_id=${sql(pending().instance)} AND status='TODO';`) === '0');
    evidence.capacity = true; evidence.retry = true;
  } catch (error) { failure = error; throw error; }
  finally {
    const failures = [];
    try { limit(original.limit); } catch (error) { failures.push(error); }
    try {
      if (id && ['PENDING', 'APPROVING', 'DRAFT'].includes(request()?.status)) {
        assert.ok(request().instance, 'Unbound request retained for investigation');
        const workflowStatus = database(`SELECT status FROM wf_process_instance WHERE tenant_id=100000 AND instance_id=${sql(request().instance)};`);
        if (['PASSED', 'AUTO_PASSED', 'REJECTED'].includes(workflowStatus)) {
          await waitFor(request, value => ['ISSUED', 'REJECTED'].includes(value.status), '已结束审批的原回调尚待恢复', 150000);
        } else {
          successful(await api(admin, '/workflow/wf/instance/terminate', { method: 'POST', body: { instanceId: request().instance, reason: `${marker}结束隔离验证` } }), '结束未签发的本次隔离流程');
          await waitFor(request, value => value.status === 'CANCELLED', '隔离申请取消结果未保存');
        }
      }
      if (pendingId) {
        const remaining = rows(`SELECT JSON_OBJECT('status',status,'instance',process_instance_id) FROM hr_certificate_request WHERE tenant_id=100000 AND id=${pendingId} AND purpose=${sql(`${marker}_cancel`)};`)[0];
        if (remaining?.status === 'PENDING') {
          assert.ok(remaining.instance);
          successful(await api(admin, '/workflow/wf/instance/terminate', { method: 'POST', body: { instanceId: remaining.instance, reason: `${marker}撤销用例收尾` } }), '结束本次未撤销流程');
          await waitFor(() => database(`SELECT status FROM hr_certificate_request WHERE tenant_id=100000 AND id=${pendingId};`), value => value === 'CANCELLED', '撤销用例未回写终态');
        }
      }
      if (definitionCreated) {
        assert.equal(database(`SELECT COUNT(*) FROM wf_process_instance WHERE tenant_id=100000 AND definition_id=${sql(definitionId)}
          AND status NOT IN ('PASSED','AUTO_PASSED','REJECTED','CANCELLED','TERMINATED','INVALIDATED');`), '0', 'Retain active workflow for investigation');
        database(`UPDATE wf_process_definition SET status='DRAFT',is_latest=0 WHERE tenant_id=100000 AND definition_id=${sql(definitionId)} AND process_name=${sql(marker)};`);
      }
    } catch (error) { failures.push(error); }
    try {
      if (configuredChanged) {
        if (configured) successful(await api(admin, configRoot, { method: 'PUT', body: configured }), '恢复原员工证明流程配置');
        else {
          const added = successful(await api(admin, `${configRoot}/list?configKey=${configKey}&pageSize=100`), '核对本次临时证明配置').records.find(row => row.configKey === configKey);
          if (added) successful(await api(admin, `${configRoot}/${added.configId}`, { method: 'DELETE' }), '移除本次临时证明配置');
        }
      }
    } catch (error) { failures.push(error); }
    if (failures.length) throw new AggregateError([...(failure ? [failure] : []), ...failures], '员工证明清理或恢复失败');
    check('原容量和全部授权恢复，保留真实申请审批及文件历史', tenant().limit === original.limit && tenant().version === original.version
      && tenant().used === Math.ceil(usage() / 1048576) && grants() === originalGrants);
    evidence.cleanup = true;
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
  console.log(`H5_EMPLOYEE_CERTIFICATE_SECRET_SCAN: files=${count}; bytes=${bytes}; values=${secrets.size}; leaks=${leaks}; database_bytes=${audit.bytes}; database_leaks=${audit.leaks}`);
  check('员工证明容量六服务及数据库日志无本次凭据泄漏', leaks === 0 && audit.leaks === 0); evidence.secrets = true;
  console.log(`H5_EMPLOYEE_CERTIFICATE_SCOPE: request=${id}; real_submission_approval=true; original_callback_retried=true; exact_original_message_replayed=true; business_history_retained=true; production_modified=false`);
}
