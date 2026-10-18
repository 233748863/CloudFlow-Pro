import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

export async function verifyMessageDelivery({ admin, api, successful, session, database, check, directory, caseTag, accounts }) {
  const base = '/auth/system/message/delivery';
  const operator = accounts.find(account => account.username === 'g_import_admin');
  const otherOperator = accounts.find(account => account.username === 'g_import_other');
  const outsider = accounts.find(account => account.username === 'g_import_tenant');
  assert.ok(operator && otherOperator && outsider);
  const sqlText = value => `CONVERT(UNHEX('${Buffer.from(String(value), 'utf8').toString('hex')}') USING utf8mb4)`;
  const auditBefore = database('SELECT COALESCE(MAX(audit_id),0) FROM sys_audit_log;');
  const logBefore = database('SELECT COALESCE(MAX(log_id),0) FROM sys_log;');
  const createUnknown = suffix => {
    const identity = randomUUID();
    const title = `投递核验_${caseTag}_${suffix}`;
    const recordId = database(`INSERT INTO sys_message_record(tenant_id,outbox_event_id,channel_type,receiver_type,receiver_addr_mask,title,content,message_category,biz_type,send_status,retry_count,read_flag,create_by,create_time,update_by,update_time) VALUES (100000,'${identity}','EMAIL','EMAIL','re***@example.test',${sqlText(title)},'原始内容受保护','SYSTEM','DELIVERY_HTTP_TEST','UNKNOWN',0,0,'message-fixture',NOW(),'message-fixture',NOW()); SELECT LAST_INSERT_ID();`);
    assert.match(recordId, /^\d+$/);
    const digest = createHash('sha256').update(identity).digest('hex');
    const deliveryId = database(`INSERT INTO sys_message_delivery(tenant_id,record_id,outbox_event_id,channel_type,receiver_key,payload_hash,status,attempt_count,version,last_error_code,create_by,create_time,update_by,update_time) VALUES (100000,${recordId},'${identity}','EMAIL','${digest}','${digest}','UNKNOWN',1,0,'SMTP_OUTCOME_UNKNOWN','message-fixture',NOW(),'message-fixture',NOW()); SELECT LAST_INSERT_ID();`);
    assert.match(deliveryId, /^\d+$/);
    return { recordId, deliveryId, title };
  };
  const unaccepted = createUnknown('unaccepted');
  const accepted = createUnknown('accepted');
  const limited = createUnknown('limited');
  const body = (current, conclusion, password, evidence) => ({ version: 0, conclusion, password, evidence: evidence || `隔离服务查询编号${caseTag}，已核对接纳结果。` });
  const inspect = current => JSON.parse(database(`SELECT JSON_OBJECT('status',status,'version',version,'resolvedBy',resolved_by,'evidence',resolution_reason) FROM sys_message_delivery WHERE delivery_id=${current.deliveryId};`));
  const requestBody = body(unaccepted, 'NOT_ACCEPTED', operator.password);
  const first = successful(await api(admin, `${base}/${unaccepted.deliveryId}`), '管理员真实投递详情');
  check('管理员看到真实UNKNOWN及版本，响应没有载荷和领取凭据', first.status === 'UNKNOWN' && first.version === 0 && !['payloadEncrypted', 'receiverKey', 'claimOwner', 'payloadHash'].some(field => Object.hasOwn(first, field)));
  const list = successful(await api(admin, '/auth/system/message/record/list?pageNum=1&pageSize=100&bizType=DELIVERY_HTTP_TEST'), '读取投递记录列表');
  check('发送记录列表批量关联正确投递编号', list.rows.some(row => String(row.recordId) === unaccepted.recordId && String(row.deliveryId) === unaccepted.deliveryId));
  const skipped = successful(await api(admin, `/auth/system/message/record/${unaccepted.recordId}/resend`, { method: 'POST' }), '尝试重发未知结果');
  check('旧重发入口拒绝UNKNOWN且未创建新记录', skipped.accepted === 0 && inspect(unaccepted).status === 'UNKNOWN');
  const anonymous = await fetch(new URL(`/api${base}/${unaccepted.deliveryId}`, admin.url()));
  check('匿名访问投递详情被真实网关拒绝', anonymous.status === 401 || (await anonymous.json()).code === 401);
  const employee = await session('g_holiday_employee');
  const crossTenant = await session('g_import_tenant');
  const other = await session('g_import_other');
  try {
    const employeeRead = await api(employee, `${base}/${unaccepted.deliveryId}`);
    check('EMPLOYEE没有读取全租户消息投递详情的权限', employeeRead.status === 403 || employeeRead.body?.code === 403);
    const employeeWrite = await api(employee, `${base}/${unaccepted.deliveryId}/resolve`, { method: 'POST', body: { ...requestBody, password: 'not-a-password' } });
    check('EMPLOYEE不能人工核验或获得非预期写权限', (employeeWrite.status === 403 || employeeWrite.body?.code === 403) && inspect(unaccepted).status === 'UNKNOWN');
    const wrongTenant = await api(crossTenant, `${base}/${unaccepted.deliveryId}`);
    check('其他租户管理员不能读取同编号投递记录', wrongTenant.status === 404 || wrongTenant.body?.code === 404);
    const wrongTenantWrite = await api(crossTenant, `${base}/${unaccepted.deliveryId}/resolve`, { method: 'POST', body: { ...requestBody, password: outsider.password } });
    check('其他租户管理员不能修改本租户投递', [403, 404, 409].includes(wrongTenantWrite.status) || [403, 404, 409].includes(wrongTenantWrite.body?.code));
    const badPassword = await api(admin, `${base}/${unaccepted.deliveryId}/resolve`, { method: 'POST', body: { ...requestBody, password: 'incorrect-current-password' } });
    check('当前密码错误时真实HTTP拒绝且状态不变', (badPassword.status === 403 || badPassword.body?.code === 403) && inspect(unaccepted).version === 0);
    await admin.goto(new URL('/message/record', admin.url()).href);
    const row = current => admin.getByRole('row').filter({ has: admin.getByText(current.title, { exact: true }) });
    await row(unaccepted).getByRole('button', { name: '查看详情', exact: true }).click();
    const dialog = admin.getByRole('dialog', { name: '发送记录详情', exact: true });
    await dialog.getByRole('button', { name: '确认并保存核验结论', exact: true }).waitFor();
    for (const width of [1440, 375, 320]) {
      await admin.setViewportSize({ width, height: 1000 });
      await dialog.getByRole('button', { name: '确认并保存核验结论', exact: true }).scrollIntoViewIfNeeded();
      check(`投递核验${width}px页面没有横向溢出`, await admin.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
      const submit = await dialog.getByRole('button', { name: '确认并保存核验结论', exact: true }).boundingBox();
      console.log(`MESSAGE_RESOLUTION_TOUCH_TARGET: viewport=${width}; width=${submit?.width}; height=${submit?.height}`);
      check(`投递核验${width}px确认按钮高度至少44px`, submit && submit.height >= 44);
      await admin.screenshot({ path: path.join(directory, `message-delivery-${caseTag}-${width}.png`), fullPage: true });
    }
    check('UNKNOWN详情没有直接重发按钮', await dialog.getByRole('button', { name: '重新发送', exact: true }).count() === 0);
    await dialog.getByRole('button', { name: '服务商核验结论', exact: true }).click();
    await admin.getByRole('option', { name: '核验未接纳，允许另行重发', exact: true }).click();
    await dialog.locator('textarea').fill(requestBody.evidence);
    await dialog.locator('input[type="password"]').fill(operator.password);
    const resolutionResponse = admin.waitForResponse(response => response.url().endsWith(`${base}/${unaccepted.deliveryId}/resolve`) && response.request().method() === 'POST');
    await dialog.getByRole('button', { name: '确认并保存核验结论', exact: true }).click();
    const resolution = await resolutionResponse;
    check('手机页面通过真实密码核验保存未接纳结论', resolution.status() === 200 && (await resolution.json()).code === 200);
    await dialog.getByRole('button', { name: '确认并保存核验结论', exact: true }).waitFor({ state: 'detached' });
    const stored = inspect(unaccepted);
    check('人工核验人、依据和FAILED真实落库', stored.status === 'FAILED' && String(stored.resolvedBy) === String(operator.userId) && stored.evidence === requestBody.evidence);
    check('保存后详情保留且不再呈现密码输入', await dialog.isVisible() && await dialog.locator('input[type="password"]').count() === 0);
    check('核验只更新原记录，没有新增一封邮件', database(`SELECT COUNT(*) FROM sys_message_record WHERE resend_from_id=${unaccepted.recordId};`) === '0');
    const repeated = await api(admin, `${base}/${unaccepted.deliveryId}/resolve`, { method: 'POST', body: { ...requestBody, evidence: `${requestBody.evidence}重复核验` } });
    check('已经核验的结果不能重复改写', repeated.status === 409 || repeated.body?.code === 409);
    const acceptedBody = body(accepted, 'ACCEPTED', operator.password);
    const stale = await api(admin, `${base}/${accepted.deliveryId}/resolve`, { method: 'POST', body: { ...acceptedBody, version: 10 } });
    check('人工核验拒绝错误版本且原记录保持UNKNOWN', (stale.status === 409 || stale.body?.code === 409) && inspect(accepted).status === 'UNKNOWN');
    successful(await api(admin, `${base}/${accepted.deliveryId}/resolve`, { method: 'POST', body: acceptedBody }), '核验外部已接纳');
    check('真实已接纳核验写入SENT和普通记录SUCCESS', inspect(accepted).status === 'SENT' && database(`SELECT send_status FROM sys_message_record WHERE record_id=${accepted.recordId};`) === 'SUCCESS');
    check('两种核验结果都产生绑定正确的真实结果事件', database(`SELECT COUNT(*) FROM outbox_event WHERE event_type='MESSAGE_DELIVERY_RESULT' AND aggregate_id IN (${unaccepted.deliveryId},${accepted.deliveryId});`) === '2');
    for (let attempt = 0; attempt < 5; attempt++) {
      const response = await api(other, `${base}/${limited.deliveryId}/resolve`, { method: 'POST', body: body(limited, 'ACCEPTED', `wrong-${attempt}`, `限流隔离核验第${attempt}次，密码错误不可改写状态。`) });
      check(`第${attempt + 1}次错误密码核验被身份校验拒绝`, response.status === 403 || response.body?.code === 403);
    }
    const blocked = await api(other, `${base}/${limited.deliveryId}/resolve`, { method: 'POST', body: body(limited, 'ACCEPTED', otherOperator.password, '第六次核验具备正确密码，仍须被每分钟限额阻止。') });
    check('同用户每分钟第6次核验被限流且UNKNOWN保持', (blocked.status === 429 || blocked.body?.code === 429) && inspect(limited).status === 'UNKNOWN');
    const recovering = createUnknown('expired-sending');
    database(`UPDATE sys_message_delivery SET status='SENDING',claim_owner='expired-isolated-worker',claim_until=DATE_SUB(NOW(),INTERVAL 1 MINUTE),send_started_time=DATE_SUB(NOW(),INTERVAL 2 MINUTE) WHERE delivery_id=${recovering.deliveryId}; UPDATE sys_message_record SET send_status='SENDING' WHERE record_id=${recovering.recordId};`);
    const handlers = successful(await api(admin, '/auth/system/job/handlers?serviceName=auth'), '真实任务注册表');
    check('安全恢复任务已在真实auth服务注册', handlers.some(handler => handler.handlerName === 'messageDeliveryRecovery'));
    const jobId = database("SELECT job_id FROM sys_job WHERE tenant_id=100000 AND handler_name='messageDeliveryRecovery' AND deleted=0;");
    assert.match(jobId, /^\d+$/);
    const triggered = successful(await api(admin, `/auth/system/job/${jobId}/trigger`, { method: 'POST', body: {} }), '集中调度真实投递恢复任务');
    check('集中调度接受真实恢复任务', triggered.accepted === true);
    let execution;
    for (let attempt = 0; attempt < 80; attempt++) {
      execution = database(`SELECT execute_status FROM sys_job_log WHERE execute_no=${sqlText(triggered.executeNo)};`);
      if (['SUCCESS', 'FAILED', 'TIMEOUT', 'DISPATCH_FAILED'].includes(execution)) break;
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    check('真实恢复任务执行完成并成功回报集中调度', execution === 'SUCCESS');
    check('恢复任务把超时SENDING保存为UNKNOWN且不增加外发次数', inspect(recovering).status === 'UNKNOWN' && database(`SELECT attempt_count FROM sys_message_delivery WHERE delivery_id=${recovering.deliveryId};`) === '1');
    check('恢复任务保留未核验UNKNOWN并写出真实结果事件', inspect(limited).status === 'UNKNOWN' && database(`SELECT COUNT(*) FROM outbox_event WHERE event_type='MESSAGE_DELIVERY_RESULT' AND aggregate_id=${recovering.deliveryId};`) === '1');
    const secrets = [operator.password, otherOperator.password, outsider.password, 'incorrect-current-password'];
    const audit = database(`SELECT CONCAT_WS('|',before_val,after_val,before_json,after_json,diff_json) FROM sys_audit_log WHERE audit_id>${auditBefore};`);
    const operationLog = database(`SELECT CONCAT_WS('|',params,exception,request_uri) FROM sys_log WHERE log_id>${logBefore};`);
    check('人工核验实际产生高风险审计记录', Number(database(`SELECT COUNT(*) FROM sys_audit_log WHERE audit_id>${auditBefore} AND audit_name LIKE '%核验%';`)) > 0);
    check('实际操作日志与审计日志不包含当前账号密码', secrets.every(value => !audit.includes(value) && !operationLog.includes(value)));
    let files = 0;
    let leaks = 0;
    async function inspectLogs(folder) {
      for (const entry of await fs.readdir(folder, { withFileTypes: true })) {
        if (entry.isSymbolicLink() || ['private', 'mysql-data', 'profile'].includes(entry.name)) continue;
        const filename = path.join(folder, entry.name);
        if (entry.isDirectory()) await inspectLogs(filename);
        else if (entry.name.endsWith('.log')) {
          const content = await fs.readFile(filename, 'utf8');
          files++;
          for (const secret of secrets) if (content.includes(secret)) leaks++;
        }
      }
    }
    await inspectLogs(directory);
    check('人工核验真实运行日志无密码明文', files > 0 && leaks === 0);
    console.log(`MESSAGE_RESOLUTION_LOG_SCAN: files=${files}; secrets=${secrets.length}; leaks=${leaks}; unknown_state_fixture=true; smtp_contacts=0`);
  } finally {
    await employee.context().close();
    await crossTenant.context().close();
    await other.context().close();
  }
}
