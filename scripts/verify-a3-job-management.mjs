import assert from 'node:assert/strict';
import { createReadStream } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { scanOwnedAuditLogs, scanSecretStream } from './portal-checks/scan-access-logs.mjs';
import { readOwnedJobKeys } from './job-internal-signing.mjs';

export async function verifyA3JobManagement({ admin, api, successful, session, database, check, caseTag, state, accounts, evidence }) {
  const marker = `a3_management_${caseTag}`;
  const sql = value => `CONVERT(0x${Buffer.from(String(value)).toString('hex')} USING utf8mb4)`;
  const rows = query => database(query).split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
  const employee = await session('g_holiday_employee');
  const foreign = await session('g_import_tenant');
  const secrets = new Set(accounts.map(account => account.password).filter(Boolean));
  for (const key of Object.values(await readOwnedJobKeys(state))) secrets.add(key);
  for (const page of [admin, employee, foreign]) {
    const token = await page.evaluate(async () => (await import('/src/utils/authStorage.ts')).getAuthToken());
    assert.ok(token); secrets.add(token.replace(/^Bearer /, ''));
  }
  const grants = () => database('SELECT tenant_id,role_id,menu_id FROM sys_role_menu ORDER BY tenant_id,role_id,menu_id;');
  const originalGrants = grants();
  const configurations = () => database(`SELECT JSON_OBJECT('id',job_id,'tenant',tenant_id,'name',job_name,'service',service_name,
    'handler',handler_name,'param',handler_param,'type',trigger_type,'cron',cron_expression,'interval',interval_ms,'status',status,
    'critical',critical_flag,'deleted',deleted) FROM sys_job WHERE job_name<>${sql(marker)} ORDER BY job_id;`);
  const originalConfiguration = configurations();
  const root = '/auth/system/job';
  const payload = { jobName: marker, jobGroup: 'A3_VERIFY', serviceName: 'cloudflow-auth', handlerName: 'holidayYearlyRemind',
    handlerParam: marker, triggerType: 'FIXED_RATE', intervalMs: 3000, status: 'PAUSED', concurrentFlag: 0,
    misfireStrategy: 'IGNORE', retryCount: 0, retryIntervalSec: 1, dispatchRetryCount: 0, dispatchRetryIntervalSec: 1,
    timeoutSeconds: 30, lockTimeSeconds: 30, criticalFlag: 1, logSuccessFlag: 1, alarmOnFailFlag: 0, alarmReceiver: '', remark: marker };
  let jobId; let failure;
  const logRows = () => rows(`SELECT JSON_OBJECT('executeNo',execute_no,'trigger',trigger_type,'actor',trigger_by,'status',execute_status,
    'duration',duration_ms,'affected',affected_rows,'message',result_msg,'started',start_time,'ended',end_time,'report',report_time,
    'executor',executor_ip,'dispatcher',dispatcher_ip) FROM sys_job_log WHERE tenant_id=100000 AND job_id=${jobId} ORDER BY log_id;`);
  const waitFor = async (read, accept, label, milliseconds = 30000) => {
    const deadline = Date.now() + milliseconds;
    do { const value = await read(); if (accept(value)) return value; await new Promise(resolve => setTimeout(resolve, 250)); } while (Date.now() < deadline);
    throw new Error(label);
  };
  const paused = () => database(`SELECT status FROM sys_job WHERE tenant_id=100000 AND job_id=${jobId} AND job_name=${sql(marker)};`) === 'PAUSED';
  const toggle = async status => successful(await api(admin, `${root}/${jobId}/toggle`, { method: 'PUT', body: { status, confirmCritical: true } }), '实际切换本轮任务状态');
  const denied = response => response.status >= 400 && response.status < 500 && response.body?.code !== 200 && !response.body?.data;
  const pageErrors = []; admin.on('pageerror', error => pageErrors.push(error.name));
  let uiRequests = 0;
  const uiResponse = async (endpoint, method, action) => {
    const pending = admin.waitForResponse(response => new URL(response.url()).pathname === `/api${endpoint}` && response.request().method() === method);
    const [response] = await Promise.all([pending, action()]);
    uiRequests++;
    return successful({ status: response.status(), body: await response.json() }, '页面实际业务请求');
  };
  const taskRow = () => admin.getByRole('row').filter({ hasText: marker });
  const openEditor = async () => {
    await taskRow().getByRole('button', { name: '编辑任务', exact: true }).click();
    const dialog = admin.getByRole('dialog', { name: '编辑定时任务', exact: true });
    await dialog.waitFor();
    return dialog;
  };
  const chooseTrigger = async (dialog, label) => {
    await dialog.locator('label').filter({ hasText: /^触发类型/ }).getByRole('button').click();
    await admin.getByRole('option', { name: label, exact: true }).click();
  };
  const uiToggle = async status => {
    const action = status === 'ENABLED' ? '启用' : '暂停';
    await taskRow().getByRole('button', { name: `${action}任务`, exact: true }).click();
    const dialog = admin.getByRole('dialog', { name: `${action}定时任务`, exact: true });
    const confirm = dialog.getByRole('button', { name: `确认${action}`, exact: true });
    check(`页面关键任务${action}前要求重新勾选影响确认`, await confirm.isDisabled());
    await dialog.getByRole('checkbox').check();
    const started = Date.now();
    await uiResponse(`${root}/${jobId}/toggle`, 'PUT', () => confirm.click());
    await taskRow().getByRole('button', { name: status === 'ENABLED' ? '暂停任务' : '启用任务', exact: true }).waitFor();
    return started;
  };
  try {
    const heartbeats = rows("SELECT JSON_OBJECT('service',service_name,'handlers',COUNT(*),'recent',MIN(last_report_time >= DATE_SUB(NOW(),INTERVAL 180 SECOND))) FROM sys_job_handler WHERE service_name IN ('auth','hr','oa','crm','workflow') AND status='ONLINE' GROUP BY service_name;");
    check('五个实际服务均通过签名上报并保持处理器心跳在线', heartbeats.length === 5 && heartbeats.every(item => item.handlers > 0 && item.recent === 1));
    const handlers = successful(await api(admin, `${root}/handlers?serviceName=cloudflow-auth`), '读取实际注册处理器');
    check('实际心跳已上报本轮使用的处理器且状态在线', handlers.some(handler => handler.handlerName === payload.handlerName && handler.status === 'ONLINE'));
    const invalidCron = successful(await api(admin, `${root}/cron/validate`, { method: 'POST', body: { triggerType: 'CRON', cronExpression: 'invalid-cron' } }), '校验非法表达式');
    check('非法表达式返回无效及空预览', invalidCron.valid === false && invalidCron.nextFireTimes.length === 0);
    const validCron = successful(await api(admin, `${root}/cron/validate`, { method: 'POST', body: { triggerType: 'CRON', cronExpression: '*/5 * * * * *' } }), '预览有效表达式');
    const times = validCron.nextFireTimes.map(value => new Date(value.replace(' ', 'T')).getTime());
    check('合法表达式返回五次实际执行时间且相邻为五秒', validCron.valid === true && times.length === 5
      && times.every(Number.isFinite) && times.slice(1).every((value, index) => value - times[index] === 5000));
    const invalidName = `${marker}_invalid`;
    for (const invalid of [{ ...payload, jobName: invalidName, triggerType: 'CRON', cronExpression: 'invalid-cron' },
      { ...payload, jobName: invalidName, handlerName: `${marker}_unknown` }, { ...payload, jobName: invalidName, intervalMs: 0 }]) {
      const response = await api(admin, root, { method: 'POST', body: invalid });
      check('非法配置保存被明确拒绝且没有任务记录', denied(response)
        && database(`SELECT COUNT(*) FROM sys_job WHERE tenant_id=100000 AND job_name=${sql(invalidName)};`) === '0');
    }
    evidence.validation = true;
    successful(await api(admin, root, { method: 'POST', body: payload }), '创建本轮独立暂停任务');
    jobId = database(`SELECT job_id FROM sys_job WHERE tenant_id=100000 AND job_name=${sql(marker)} AND handler_param=${sql(marker)} AND deleted=0;`);
    assert.match(jobId, /^[1-9][0-9]*$/);
    check('新建任务保持暂停且无运行记录', paused() && logRows().length === 0);
    await admin.goto(new URL('/job', admin.url()).href, { waitUntil: 'domcontentloaded' });
    await admin.getByPlaceholder('按任务名称搜索').fill(marker);
    await admin.getByRole('button', { name: '查询', exact: true }).click();
    await taskRow().waitFor();
    // Hold the genuine detail response to reproduce the late-response overwrite; its body is unchanged.
    const detailUrl = new URL(`/api${root}/${jobId}`, admin.url()).href;
    let releaseDetail; let detailFetched; let detailDelivered;
    const detailGate = new Promise(resolve => { releaseDetail = resolve; });
    const fetched = new Promise(resolve => { detailFetched = resolve; });
    const delivered = new Promise(resolve => { detailDelivered = resolve; });
    const holdDetail = async route => {
      const response = await route.fetch();
      detailFetched();
      await detailGate;
      await route.fulfill({ response });
      detailDelivered();
    };
    await admin.route(detailUrl, holdDetail);
    try {
      await taskRow().getByRole('button', { name: '编辑任务', exact: true }).click();
      await Promise.race([fetched, new Promise((_, reject) => setTimeout(() => reject(new Error('Actual detail response did not arrive')), 10000))]);
      check('真实详情返回前禁止编辑并显示加载状态', await admin.getByRole('dialog', { name: '编辑定时任务', exact: true }).count() === 0
        && await taskRow().getByRole('button', { name: '编辑任务', exact: true }).isDisabled());
      await admin.getByRole('button', { name: '新增任务', exact: true }).click();
      const createDialog = admin.getByRole('dialog', { name: '新增定时任务', exact: true });
      await createDialog.getByPlaceholder('例如 员工入职转正提醒').fill(`${marker}_unsaved`);
      releaseDetail(); await delivered;
      await admin.waitForTimeout(250);
      check('迟到的真实详情不能覆盖新建表单输入', await createDialog.isVisible()
        && await createDialog.getByPlaceholder('例如 员工入职转正提醒').inputValue() === `${marker}_unsaved`);
      await createDialog.getByRole('button', { name: '取消', exact: true }).click();
      evidence.lateDetail = true;
    } finally {
      releaseDetail();
      await admin.unroute(detailUrl, holdDetail);
    }
    let editor = await openEditor();
    check('关键任务编辑页禁用直接修改状态', await editor.locator('label').filter({ hasText: /^任务状态/ }).getByRole('button').isDisabled());
    await chooseTrigger(editor, 'CRON 表达式');
    await editor.getByPlaceholder('0 0 * * * *').fill('invalid-cron');
    const invalidPreview = await uiResponse(`${root}/cron/validate`, 'POST', () => editor.getByRole('button', { name: '保存修改', exact: true }).click());
    check('页面非法规则保存停留编辑状态且数据库保持原配置', !invalidPreview.valid && await editor.isVisible()
      && database(`SELECT trigger_type FROM sys_job WHERE tenant_id=100000 AND job_id=${jobId};`) === 'FIXED_RATE');
    await editor.getByPlaceholder('0 0 * * * *').fill('*/3 * * * * *');
    const preview = await uiResponse(`${root}/cron/validate`, 'POST', () => editor.getByRole('button', { name: '校验规则', exact: true }).click());
    await editor.getByText(/^未来 5 次：/).waitFor();
    const displayedPreview = await editor.getByText(/^未来 5 次：/).textContent();
    check('页面显示服务端计算的未来五次执行时间', preview.valid && preview.nextFireTimes.length === 5
      && preview.nextFireTimes.every(value => displayedPreview.includes(value)));
    await uiResponse(root, 'PUT', () => editor.getByRole('button', { name: '保存修改', exact: true }).click());
    await editor.waitFor({ state: 'hidden' });
    check('页面保存三秒规则后任务仍暂停', paused() && database(`SELECT cron_expression FROM sys_job WHERE tenant_id=100000 AND job_id=${jobId};`) === '*/3 * * * * *');
    evidence.editorUi = true;
    const trigger = successful(await api(admin, `${root}/${jobId}/trigger`, { method: 'POST', body: { handlerParam: `${marker}_manual` } }), '真实手动触发任务');
    check('手动触发返回独立执行编号并被接收', trigger.accepted === true && typeof trigger.executeNo === 'string' && trigger.executeNo.length > 0);
    const completed = await waitFor(logRows, values => values.some(value => value.executeNo === trigger.executeNo && value.status === 'SUCCESS'), '手动任务未完成实际回报');
    const manual = completed.find(value => value.executeNo === trigger.executeNo);
    check('手动日志保存MANUAL及真实操作者', manual.trigger === 'MANUAL' && manual.actor === 'g_import_admin');
    check('实际执行日志保存耗时处理数摘要和回报时间', Number(manual.duration) >= 0 && manual.affected === 0
      && manual.message === '节假日日历维护提醒已生成' && manual.started && manual.ended && manual.report && manual.executor && manual.dispatcher);
    const logPage = successful(await api(admin, `${root}/log?jobId=${jobId}&executeStatus=SUCCESS&pageNum=1&pageSize=100`), '按任务与状态读取执行日志');
    check('日志接口可定位本次手动执行', logPage.rows.some(value => value.executeNo === trigger.executeNo));
    evidence.manual = true;
    const forbiddenToggle = await api(admin, `${root}/${jobId}/toggle`, { method: 'PUT', body: { status: 'ENABLED', confirmCritical: false } });
    check('关键任务未经再次确认不能启用', denied(forbiddenToggle) && paused());
    const enabledAt = await uiToggle('ENABLED');
    await waitFor(logRows, values => values.some(value => value.trigger === 'CRON' && value.status === 'SUCCESS'), '启用后未在十秒内实际执行', 10000);
    const firstElapsed = Date.now() - enabledAt;
    check('关键任务确认启用后十秒内实际按周期运行', firstElapsed <= 10000);
    const persisted = successful(await api(admin, `${root}/${jobId}`), '读取待修改任务');
    const forbiddenEdit = await api(admin, root, { method: 'PUT', body: { ...persisted, status: 'PAUSED', confirmCritical: false } });
    check('编辑表单请求不能绕过关键任务暂停确认', denied(forbiddenEdit) && !paused());
    await uiToggle('PAUSED');
    await waitFor(logRows, values => values.every(value => value.status !== 'RUNNING'), '暂停后原执行未结束');
    const pausedCount = logRows().length;
    await new Promise(resolve => setTimeout(resolve, 6500));
    check('暂停超过两个原周期后没有新增执行', paused() && logRows().length === pausedCount);
    editor = await openEditor();
    await chooseTrigger(editor, '固定频率');
    await editor.locator('label').filter({ hasText: /^执行间隔（毫秒）/ }).locator('input').fill('2000');
    await uiResponse(root, 'PUT', () => editor.getByRole('button', { name: '保存修改', exact: true }).click());
    await editor.waitFor({ state: 'hidden' });
    check('页面修改固定频率后数据库确实保存2000毫秒', database(`SELECT CONCAT(trigger_type,':',interval_ms) FROM sys_job WHERE tenant_id=100000 AND job_id=${jobId};`) === 'FIXED_RATE:2000');
    const resumedAt = await uiToggle('ENABLED');
    await waitFor(logRows, values => values.filter(value => value.status === 'SUCCESS').length >= pausedCount + 2, '恢复后未按新周期实际执行', 10000);
    check('修改周期并恢复后十秒内完成至少两次执行', Date.now() - resumedAt <= 10000
      && database(`SELECT CONCAT(trigger_type,':',interval_ms) FROM sys_job WHERE tenant_id=100000 AND job_id=${jobId};`) === 'FIXED_RATE:2000');
    const resumedElapsed = Date.now() - resumedAt;
    const liveCount = logRows().filter(value => value.status === 'SUCCESS').length;
    editor = await openEditor();
    await editor.locator('label').filter({ hasText: /^执行间隔（毫秒）/ }).locator('input').fill('1000');
    const changedAt = Date.now();
    await uiResponse(root, 'PUT', () => editor.getByRole('button', { name: '保存修改', exact: true }).click());
    await editor.waitFor({ state: 'hidden' });
    await waitFor(logRows, values => values.filter(value => value.status === 'SUCCESS').length >= liveCount + 2, '启用中的任务修改周期未在十秒内生效', 10000);
    const liveElapsed = Date.now() - changedAt;
    check('页面直接修改运行中任务后十秒内生效且保持启用', liveElapsed <= 10000
      && database(`SELECT CONCAT(trigger_type,':',interval_ms,':',status) FROM sys_job WHERE tenant_id=100000 AND job_id=${jobId};`) === 'FIXED_RATE:1000:ENABLED');
    evidence.liveChange = true;
    await uiToggle('PAUSED');
    evidence.scheduling = true;
    for (const width of [1440, 375, 320]) {
      await admin.setViewportSize({ width, height: 1000 });
      const editButton = taskRow().getByRole('button', { name: '编辑任务', exact: true });
      await editButton.scrollIntoViewIfNeeded();
      const bounds = await editButton.boundingBox();
      const overflow = await admin.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      console.log(`A3_JOB_LAYOUT: page=management; width=${width}; overflow=${overflow}; button_width=${bounds?.width}; button_height=${bounds?.height}`);
      check(`任务管理${width}像素无页面溢出且手机操作区不少于44像素`, overflow <= 1 && bounds?.height > 0 && (width > 639 || bounds.height >= 44 && bounds.width >= 44));
      await admin.screenshot({ path: path.join(state.run, `a3-job-management-${caseTag}-${width}.png`), fullPage: true });
    }
    await admin.setViewportSize({ width: 1440, height: 1000 });
    await taskRow().getByRole('button', { name: '手动触发', exact: true }).click();
    const triggerDialog = admin.getByRole('dialog', { name: '手动触发任务', exact: true });
    await triggerDialog.getByPlaceholder('可填写 JSON 或普通文本').fill(`${marker}_ui_manual`);
    const uiTrigger = await uiResponse(`${root}/${jobId}/trigger`, 'POST', () => triggerDialog.getByRole('button', { name: '立即触发', exact: true }).click());
    await triggerDialog.getByText('执行请求已受理', { exact: true }).waitFor();
    const uiCompleted = await waitFor(logRows, values => values.some(value => value.executeNo === uiTrigger.executeNo && value.status === 'SUCCESS'), '页面手动触发未完成');
    check('页面手动触发完成且临时参数没有覆盖任务配置', uiCompleted.some(value => value.executeNo === uiTrigger.executeNo && value.trigger === 'MANUAL' && value.actor === 'g_import_admin')
      && database(`SELECT handler_param FROM sys_job WHERE tenant_id=100000 AND job_id=${jobId};`) === marker);
    await triggerDialog.getByRole('button', { name: '关闭', exact: true }).click();
    await taskRow().getByRole('button', { name: '查看执行日志', exact: true }).click();
    const manualRow = admin.getByRole('row').filter({ hasText: uiTrigger.executeNo });
    await manualRow.waitFor();
    check('列表日志入口携带本任务且显示手动操作人', new URL(admin.url()).searchParams.get('jobId') === jobId
      && (await manualRow.textContent()).includes('g_import_admin') && (await manualRow.textContent()).includes('MANUAL'));
    for (const width of [1440, 375, 320]) {
      await admin.setViewportSize({ width, height: 1000 });
      const button = manualRow.getByRole('button', { name: '查看日志详情', exact: true });
      await button.scrollIntoViewIfNeeded();
      const bounds = await button.boundingBox();
      const overflow = await admin.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      console.log(`A3_JOB_LAYOUT: page=log; width=${width}; overflow=${overflow}; button_width=${bounds?.width}; button_height=${bounds?.height}`);
      check(`任务日志${width}像素可操作且手机操作区不少于44像素`, overflow <= 1
        && bounds?.height > 0 && (width > 639 || bounds.height >= 44 && bounds.width >= 44));
      await admin.screenshot({ path: path.join(state.run, `a3-job-log-${caseTag}-${width}.png`), fullPage: true });
    }
    await manualRow.getByRole('button', { name: '查看日志详情', exact: true }).click();
    const detail = admin.getByRole('dialog', { name: '任务日志详情', exact: true });
    await detail.getByText('节假日日历维护提醒已生成', { exact: true }).waitFor();
    check('实际日志详情显示处理摘要且页面没有运行异常', await detail.getByText('MANUAL', { exact: true }).count() === 1 && pageErrors.length === 0);
    evidence.logUi = true;
    for (const endpoint of [`${root}/list`, `${root}/${jobId}`, `${root}/log?jobId=${jobId}`]) {
      const response = await api(employee, endpoint);
      check('普通员工无权读取任务管理和运行日志', response.status === 403 && !response.body?.data);
    }
    const foreignRead = await api(foreign, `${root}/${jobId}`);
    check('跨租户管理员不能读取本轮任务', denied(foreignRead));
    const forged = await api(admin, '/auth/inner/job/execute', { method: 'POST', headers: { 'X-Inner-Call': 'true', 'X-From-Service': 'cloudflow-auth' },
      body: { executeNo: `${marker}_forged`, handlerName: payload.handlerName, handlerParam: marker, concurrentFlag: 0, timeoutSeconds: 30 } });
    check('网关拒绝伪造内部来源触发任务', denied(forged) && database(`SELECT COUNT(*) FROM sys_job_log WHERE execute_no=${sql(`${marker}_forged`)};`) === '0');
    for (const service of state.services.filter(value => ['auth', 'hr', 'oa', 'crm', 'workflow'].includes(value.name))) {
      assert.ok(Number.isInteger(service.port) && service.port > 1024 && service.port < 65536);
      const executeNo = `${marker}_forged_${service.name}`;
      const body = { executeNo, handlerName: payload.handlerName, handlerParam: marker, concurrentFlag: 0, timeoutSeconds: 30 };
      const gateway = await api(admin, `/${service.name}/inner/job/execute`, { method: 'POST', headers: { 'X-Inner-Call': 'true', 'X-From-Service': 'cloudflow-auth' }, body });
      check(`${service.name}经网关拒绝伪造内部执行`, gateway.status === 403 && !gateway.body?.data);
      for (const [method, endpoint] of [['POST', '/inner/job/execute'], ['GET', `/inner/job/status/${executeNo}`]]) {
        const direct = await fetch(`http://127.0.0.1:${service.port}${endpoint}`, { method, redirect: 'error', signal: AbortSignal.timeout(10000),
          headers: { 'Content-Type': 'application/json', 'X-Inner-Call': 'true', 'X-From-Service': 'cloudflow-auth' },
          ...(method === 'POST' ? { body: JSON.stringify(body) } : {}) });
        const result = await direct.json();
        check(`${service.name}直连${method}内部任务接口拒绝伪造来源`, direct.status === 403 && result.code === 403 && !result.data);
      }
      check(`${service.name}伪造调用未写入任务日志`, database(`SELECT COUNT(*) FROM sys_job_log WHERE execute_no=${sql(executeNo)};`) === '0');
    }
    check('已核对全部五个实际执行服务', state.services.filter(value => ['auth', 'hr', 'oa', 'crm', 'workflow'].includes(value.name)).length === 5);
    evidence.internalBoundary = true;
    console.log('A3_JOB_INNER_BOUNDARY: services=5; gateway_requests=5; direct_requests=10; denied=15; fabricated_execution_logs=0');
    evidence.permissions = true;
    console.log(`A3_JOB_MANAGEMENT_TIMING: first_scheduled_execution_ms=${firstElapsed}; resumed_two_executions_ms=${resumedElapsed}; live_change_ms=${liveElapsed}; tested_cron=*/3; tested_intervals_ms=2000,1000; ui_requests=${uiRequests}; two_auth_instances=false`);
  } catch (error) { failure = error; }
  finally {
    if (jobId && !paused()) await toggle('PAUSED');
    check('本轮任务停止且原业务任务配置与授权保持', (!jobId || paused()) && configurations() === originalConfiguration && grants() === originalGrants);
    evidence.restoration = true;
  }
  let files = 0; let bytes = 0; let leaks = 0;
  for (const service of state.services) {
    const directory = path.join(state.run, service.name);
    const names = await fs.readdir(path.join(directory, 'logs')).catch(error => { if (error.code === 'ENOENT') return []; throw error; });
    for (const filename of ['stdout.log', 'stderr.log', ...names.filter(name => name.endsWith('.log')).map(name => path.join('logs', name))]) {
      const scan = await scanSecretStream(createReadStream(path.join(directory, filename)), [...secrets]); files++; bytes += scan.bytes; leaks += scan.leaks;
    }
  }
  const audit = await scanOwnedAuditLogs(state, [...secrets], { log: '0', error: '0', audit: '0' });
  check('任务管理六服务与数据库日志无凭据泄漏', leaks === 0 && audit.leaks === 0); evidence.secrets = true;
  console.log(`A3_JOB_MANAGEMENT_SECRET_SCAN: files=${files}; bytes=${bytes}; values=${secrets.size}; leaks=${leaks}; database_bytes=${audit.bytes}; database_leaks=${audit.leaks}`);
  console.log(`A3_JOB_MANAGEMENT_SCOPE: real_management_scheduler_dispatch_execution_and_report=true; actual_editor_toggle_manual_log_and_responsive_ui=${evidence.editorUi && evidence.logUi && evidence.scheduling}; existing_holiday_handler_is_protocol_probe=true; holiday_business_not_verified=true; no_cluster_acceptance=true; original_configuration_retained=true; production_modified=false`);
  if (failure) throw failure;
}
