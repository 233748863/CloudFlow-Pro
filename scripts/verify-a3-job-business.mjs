import assert from 'node:assert/strict';
import { createReadStream } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { scanOwnedAuditLogs, scanSecretStream } from './portal-checks/scan-access-logs.mjs';
import { readOwnedJobKeys } from './job-internal-signing.mjs';

// Business rows/dates are fixtures. Jobs 102/106, dispatch, handlers, reports and delivery are real.
export async function verifyA3JobBusiness({ admin, api, successful, session, database, check, caseTag, state, accounts, evidence }) {
  const marker = 'A3B' + caseTag;
  const sql = value => 'CONVERT(0x' + Buffer.from(String(value)).toString('hex') + ' USING utf8mb4)';
  const rows = query => database(query).split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
  const root = '/auth/system/job';
  const employee = await session('g_holiday_employee');
  const secrets = new Set(accounts.map(account => account.password).filter(Boolean));
  for (const key of Object.values(await readOwnedJobKeys(state))) secrets.add(key);
  for (const page of [admin, employee]) {
    const token = await page.evaluate(async () => (await import('/src/utils/authStorage.ts')).getAuthToken());
    assert.ok(token); secrets.add(token.replace(/^Bearer /, ''));
  }
  const owner = rows("SELECT JSON_OBJECT('id',CAST(user_id AS CHAR),'dept',CAST(dept_id AS CHAR)) FROM sys_user WHERE tenant_id=100000 AND user_name='g_holiday_employee' AND deleted=0 AND status='0';")[0];
  assert.match(owner.id, /^[1-9][0-9]*$/); assert.match(owner.dept, /^[1-9][0-9]*$/);
  const originals = new Map();
  for (const id of [102, 106]) {
    const job = successful(await api(admin, root + '/' + id), '读取指定原任务');
    assert.equal(job.status, 'PAUSED', 'Owned business fixture expects originally paused jobs');
    originals.set(id, job);
  }
  assert.equal(originals.get(102).handlerName, 'customerPoolRelease');
  assert.equal(originals.get(106).handlerName, 'employeeContractExpire');
  assert.equal(database("SELECT COUNT(*) FROM sys_job WHERE deleted=0 AND status='ENABLED' AND handler_name IN ('customerPoolRelease','employeeContractExpire');"), '0');
  const configuration = () => database("SELECT tenant_id,job_id,job_name,job_group,service_name,handler_name,COALESCE(handler_param,''),trigger_type,COALESCE(cron_expression,''),COALESCE(interval_ms,0),status,concurrent_flag,misfire_strategy,retry_count,retry_interval_sec,dispatch_retry_count,dispatch_retry_interval_sec,timeout_seconds,lock_time_seconds,critical_flag,log_success_flag,alarm_on_fail_flag,COALESCE(alarm_receiver,''),deleted FROM sys_job ORDER BY tenant_id,job_id;");
  const grants = () => database('SELECT tenant_id,role_id,menu_id FROM sys_role_menu ORDER BY tenant_id,role_id,menu_id;');
  const oldConfiguration = configuration(); const oldGrants = grants();
  const ruleConfiguration = () => database('SELECT tenant_id,rule_id,status FROM crm_assignment_rule WHERE create_by<>' + sql(marker) + ' ORDER BY tenant_id,rule_id;');
  const oldRules = ruleConfiguration();
  const logRows = id => rows("SELECT JSON_OBJECT('id',CAST(log_id AS CHAR),'executeNo',execute_no,'trigger',trigger_type,'actor',trigger_by,'status',execute_status,'affected',affected_rows,'message',result_msg,'duration',duration_ms,'start',start_time,'end',end_time,'report',report_time) FROM sys_job_log WHERE tenant_id=100000 AND job_id=" + id + ' ORDER BY log_id;');
  const waitFor = async (read, accept, message, milliseconds = 90000) => {
    const deadline = Date.now() + milliseconds;
    do { const value = await read(); if (accept(value)) return value; await new Promise(resolve => setTimeout(resolve, 200)); } while (Date.now() < deadline);
    throw new Error(message);
  };
  const toggle = async status => successful(await api(admin, root + '/102/toggle', { method: 'PUT', body: { status, confirmCritical: true } }), '切换指定客户公海任务');
  const lastTriggers = new Map();
  const trigger = async id => {
    const remaining = 5200 - (Date.now() - (lastTriggers.get(id) || 0));
    if (remaining > 0) await new Promise(resolve => setTimeout(resolve, remaining));
    const accepted = successful(await api(admin, root + '/' + id + '/trigger', { method: 'POST', body: {} }), '手动触发指定业务任务');
    lastTriggers.set(id, Date.now());
    assert.equal(accepted.accepted, true);
    const completed = await waitFor(() => logRows(id), items => items.some(item => item.executeNo === accepted.executeNo && ['SUCCESS', 'FAILED', 'TIMEOUT', 'DISPATCH_FAILED'].includes(item.status)), '指定业务任务未完成');
    const result = completed.find(item => item.executeNo === accepted.executeNo);
    check('指定任务' + id + '实际执行成功并回报MANUAL和真实操作者', result.status === 'SUCCESS' && result.trigger === 'MANUAL' && result.actor === 'g_import_admin'
      && result.start && result.end && result.report && Number.isInteger(result.duration) && result.duration >= 0);
    return result;
  };
  let employeeId; let createdEmployee = false; let ruleId; let failure; const metrics = [];
  const contracts = [];
  const customers = [];
  const contract = (suffix, offset, status, deleted = 0) => {
    const number = marker + suffix;
    database("INSERT INTO hr_employee_contract(tenant_id,employee_id,contract_type,contract_no,sign_date,start_date,end_date,status,deleted,create_by) VALUES(100000," + employeeId + ",'LABOR'," + sql(number)
      + ',DATE_SUB(CURRENT_DATE,INTERVAL 365 DAY),DATE_SUB(CURRENT_DATE,INTERVAL 365 DAY),DATE_ADD(CURRENT_DATE,INTERVAL ' + offset + ' DAY),' + sql(status) + ',' + deleted + ',' + sql(marker) + ');');
    const id = database('SELECT id FROM hr_employee_contract WHERE tenant_id=100000 AND contract_no=' + sql(number) + ';');
    assert.match(id, /^[1-9][0-9]*$/); const item = { id, suffix, offset, status, deleted }; contracts.push(item); return item;
  };
  const customer = (suffix, days, { deleted = 0, pool = '0', tag = marker } = {}) => {
    const name = marker + suffix;
    database('INSERT INTO crm_customer(tenant_id,customer_code,customer_name,level_code,customer_tags,owner_id,owner_name,dept_id,pool_flag,last_follow_up_time,deleted,create_by) VALUES(100000,'
      + [sql(name), sql(name), sql(marker), sql(tag), owner.id, sql(marker), owner.dept, sql(pool), days === null ? 'NULL' : 'DATE_SUB(NOW(),INTERVAL ' + days + ' DAY)', deleted, sql(marker)].join(',') + ');');
    const id = database('SELECT customer_id FROM crm_customer WHERE tenant_id=100000 AND customer_code=' + sql(name) + ';');
    assert.match(id, /^[1-9][0-9]*$/); const item = { id, suffix, days, deleted, pool, tag }; customers.push(item); return item;
  };
  const messages = id => rows("SELECT JSON_OBJECT('id',CAST(record_id AS CHAR),'status',send_status,'channel',channel_type,'receiver',CAST(receiver_id AS CHAR),'business',biz_type) FROM sys_message_record WHERE tenant_id=100000 AND biz_id=" + sql(id) + " AND biz_type IN ('HR_CONTRACT_EXPIRING','HR_CONTRACT_EXPIRED') ORDER BY record_id;");
  const contractCandidates = () => rows("SELECT JSON_OBJECT('id',CAST(c.id AS CHAR),'target',IF(c.end_date<CURRENT_DATE,'EXPIRED','EXPIRING')) FROM hr_employee_contract c JOIN sys_tenant t ON t.tenant_id=c.tenant_id AND t.status='0' AND (t.expire_time IS NULL OR t.expire_time>NOW()) WHERE c.deleted=0 AND ((c.end_date BETWEEN CURRENT_DATE AND DATE_ADD(CURRENT_DATE,INTERVAL 30 DAY) AND c.status IN ('ACTIVE','EFFECTIVE')) OR (c.end_date<CURRENT_DATE AND c.status NOT IN ('EXPIRED','TERMINATED'))) ORDER BY c.id;");
  const poolCandidates = () => rows("SELECT DISTINCT JSON_OBJECT('id',CAST(c.customer_id AS CHAR)) FROM crm_customer c JOIN crm_assignment_rule r ON r.tenant_id=c.tenant_id AND r.rule_type='AUTO_RELEASE' AND r.status='ACTIVE' AND r.deleted=0 JOIN sys_tenant t ON t.tenant_id=c.tenant_id AND t.status='0' AND (t.expire_time IS NULL OR t.expire_time>NOW()) WHERE c.deleted=0 AND c.pool_flag='0' AND c.owner_id IS NOT NULL AND r.inactive_days>0 AND (c.last_follow_up_time<DATE_SUB(NOW(),INTERVAL r.inactive_days DAY) OR c.last_follow_up_time IS NULL) AND (r.dept_id IS NULL OR r.dept_id=c.dept_id) AND (r.customer_level IS NULL OR r.customer_level='' OR r.customer_level=c.level_code) AND (r.customer_tags IS NULL OR r.customer_tags='' OR c.customer_tags LIKE CONCAT('%',r.customer_tags,'%'));");
  const poolEvents = id => Number(database('SELECT COUNT(*) FROM crm_customer_pool_log WHERE customer_id=' + id + " AND action_type='AUTO_RELEASE';"));
  const observeMetrics = (label, result, expected, summary) => {
    metrics.push(Number.isInteger(result.affected) && result.affected === expected && result.message === summary);
    console.log('A3_BUSINESS_RESULT_OBSERVED: ' + JSON.stringify({ label, status: result.status, expected, affected: result.affected, summary: result.message, exactSummary: summary }));
  };
  const pageErrors = []; admin.on('pageerror', error => pageErrors.push(error.name));
  try {
    employeeId = database('SELECT id FROM hr_employee WHERE tenant_id=100000 AND user_id=' + owner.id + ' AND deleted=0;');
    if (!employeeId) {
      database('INSERT INTO hr_employee(tenant_id,employee_no,name,gender,dept_id,employee_status,user_id,create_by) VALUES(100000,' + sql(marker) + ',' + sql(marker) + ",'UNKNOWN'," + owner.dept + ",'ACTIVE'," + owner.id + ',' + sql(marker) + ');');
      employeeId = database('SELECT id FROM hr_employee WHERE tenant_id=100000 AND employee_no=' + sql(marker) + ';'); createdEmployee = true;
    }
    assert.match(employeeId, /^[1-9][0-9]*$/);
    contract('today', 0, 'ACTIVE'); contract('day30', 30, 'EFFECTIVE'); contract('day31', 31, 'ACTIVE'); contract('past', -1, 'ACTIVE');
    contract('terminated', -1, 'TERMINATED'); contract('expired', -1, 'EXPIRED'); contract('deleted', -1, 'ACTIVE', 1);
    const expected = contractCandidates();
    const expiring = expected.filter(item => item.target === 'EXPIRING').length;
    const expired = expected.filter(item => item.target === 'EXPIRED').length;
    const manual = await trigger(106);
    for (const item of contracts) {
      const changed = !item.deleted && ['ACTIVE', 'EFFECTIVE'].includes(item.status) && item.offset <= 30;
      const target = changed ? item.offset < 0 ? 'EXPIRED' : 'EXPIRING' : item.status;
      check('员工合同' + item.suffix + '按真实日期边界更新状态', database('SELECT status FROM hr_employee_contract WHERE id=' + item.id + ';') === target);
      if (changed) {
        const delivered = await waitFor(() => messages(item.id), values => values.length === 1 && values[0].status === 'SUCCESS', '员工合同提醒未实际送达');
        check('员工合同' + item.suffix + '送达实际员工账号且仅用站内渠道', delivered[0].channel === 'INTERNAL' && delivered[0].receiver === owner.id);
        successful(await api(employee, '/auth/system/message/mine/' + delivered[0].id), '员工读取实际合同提醒');
      } else check('员工合同' + item.suffix + '没有误发到期提醒', messages(item.id).length === 0);
    }
    check('本次扫描覆盖的全部租户候选均更新为对应合同状态', expected.every(item => database('SELECT status FROM hr_employee_contract WHERE id=' + item.id + ';') === item.target));
    observeMetrics('employeeContractExpire', manual, expected.length, '员工合同到期扫描完成：即将到期' + expiring + '份，已到期' + expired + '份');
    const repeated = await trigger(106);
    check('重复手动合同扫描不增加已送达消息', contracts.every(item => messages(item.id).length === (!item.deleted && ['ACTIVE', 'EFFECTIVE'].includes(item.status) && item.offset <= 30 ? 1 : 0)));
    observeMetrics('employeeContractExpire-repeat', repeated, 0, '员工合同到期扫描完成：即将到期0份，已到期0份');
    evidence.contract = true; evidence.delivery = true;

    database('INSERT INTO crm_assignment_rule(tenant_id,rule_name,rule_type,status,inactive_days,customer_level,customer_tags,create_by) VALUES(100000,' + sql(marker) + ",'AUTO_RELEASE','ACTIVE',45," + sql(marker) + ',' + sql(marker) + ',' + sql(marker) + ');');
    ruleId = database('SELECT rule_id FROM crm_assignment_rule WHERE tenant_id=100000 AND rule_name=' + sql(marker) + ';'); assert.match(ruleId, /^[1-9][0-9]*$/);
    customer('stale', 46); customer('never', null); customer('recent', 44); customer('deleted', 46, { deleted: 1 }); customer('pooled', 46, { pool: '1' }); customer('otherTag', 46, { tag: marker + 'X-other' });
    // A disjoint tag avoids accidentally matching the contains-based rule above.
    database('UPDATE crm_customer SET customer_tags=' + sql('other' + caseTag) + ' WHERE customer_id=' + customers.at(-1).id + ';');
    const candidates = poolCandidates(); const beforeEvents = new Map(candidates.map(item => [item.id, poolEvents(item.id)]));
    const released = await trigger(102);
    check('公海扫描全部候选实际回收且每名客户新增一笔回收轨迹', candidates.length >= 2 && candidates.every(item => database('SELECT CONCAT(pool_flag,\':\',IF(owner_id IS NULL,1,0)) FROM crm_customer WHERE customer_id=' + item.id + ';') === '1:1' && poolEvents(item.id) === beforeEvents.get(item.id) + 1));
    for (const item of customers) {
      const shouldRelease = ['stale', 'never'].includes(item.suffix);
      check('公海样本' + item.suffix + '没有越过跟进日期标签删除和入池边界', poolEvents(item.id) === (shouldRelease ? 1 : 0));
      if (shouldRelease) check('公海回收保留真实原负责人', database('SELECT original_owner_id FROM crm_customer WHERE customer_id=' + item.id + ';') === owner.id);
    }
    observeMetrics('customerPoolRelease', released, candidates.length, '客户公海释放完成：已释放' + candidates.length + '名客户'); evidence.pool = true;

    await admin.goto(new URL('/job', admin.url()).href, { waitUntil: 'domcontentloaded' });
    await admin.getByPlaceholder('按任务名称搜索').fill(originals.get(102).jobName);
    await admin.getByRole('button', { name: '查询', exact: true }).click();
    const taskRow = () => admin.getByRole('row').filter({ hasText: originals.get(102).jobName });
    await taskRow().waitFor();
    await toggle('ENABLED');
    const dynamic = customer('dynamic', 46);
    const prior = new Set(logRows(102).map(item => item.executeNo));
    await taskRow().getByRole('button', { name: '编辑任务', exact: true }).click();
    const dialog = admin.getByRole('dialog', { name: '编辑定时任务', exact: true }); await dialog.waitFor();
    await dialog.getByPlaceholder('0 0 * * * *').fill('*/3 * * * * *');
    const changedAt = Date.now();
    const saved = admin.waitForResponse(response => new URL(response.url()).pathname === '/api' + root && response.request().method() === 'PUT');
    await dialog.getByRole('button', { name: '保存修改', exact: true }).click();
    const response = await saved; successful({ status: response.status(), body: await response.json() }, '页面保存指定公海任务周期');
    await dialog.waitFor({ state: 'hidden' });
    const launched = await waitFor(() => logRows(102), items => items.some(item => !prior.has(item.executeNo) && item.trigger === 'CRON'), '指定公海任务页面改周期未在十秒内生效', 10000);
    const elapsed = Date.now() - changedAt;
    check('页面修改真实公海释放周期后十秒内开始自动执行且无需重启', elapsed <= 10000);
    const scheduled = launched.find(item => !prior.has(item.executeNo) && item.trigger === 'CRON');
    await toggle('PAUSED');
    const finished = await waitFor(() => logRows(102), items => items.some(item => item.executeNo === scheduled.executeNo && item.status === 'SUCCESS'), '公海自动任务未完成');
    const actual = finished.find(item => item.executeNo === scheduled.executeNo);
    check('实际自动扫描回收新候选且只留一笔回收轨迹', database('SELECT pool_flag FROM crm_customer WHERE customer_id=' + dynamic.id + ';') === '1' && poolEvents(dynamic.id) === 1);
    observeMetrics('customerPoolRelease-scheduled', actual, 1, '客户公海释放完成：已释放1名客户');
    console.log('A3_BUSINESS_TIMING: handler=customerPoolRelease; changed_to=*/3; first_execution_ms=' + elapsed + '; limit_ms=10000; service_restarted=false');
    evidence.scheduling = true;
    const zero = await trigger(102); observeMetrics('customerPoolRelease-repeat', zero, 0, '客户公海释放完成：已释放0名客户');
    check('再次公海扫描不重复回收原客户', customers.every(item => poolEvents(item.id) === (['stale', 'never', 'dynamic'].includes(item.suffix) ? 1 : 0)));

    const detail = successful(await api(admin, root + '/log/' + manual.id), '读取实际合同任务日志详情');
    check('日志查询与真实业务执行编号和处理数一致', detail.executeNo === manual.executeNo && detail.affectedRows === manual.affected && detail.resultMsg === manual.message);
    for (const endpoint of [root + '/106', root + '/log/' + manual.id]) {
      const denied = await api(employee, endpoint); check('普通员工不能读取调度配置或后台执行日志', denied.status === 403 && !denied.body?.data);
    }
    for (const width of [1440, 375, 320]) {
      await admin.setViewportSize({ width, height: 1000 });
      const button = taskRow().getByRole('button', { name: '编辑任务', exact: true }); await button.scrollIntoViewIfNeeded();
      const bounds = await button.boundingBox();
      check('指定业务任务页面' + width + '像素可操作', await admin.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)
        && bounds && (width > 375 || bounds.width >= 44 && bounds.height >= 44));
      await admin.screenshot({ path: path.join(state.run, 'a3-business-' + caseTag + '-' + width + '.png'), fullPage: true });
    }
    await taskRow().getByRole('button', { name: '查看执行日志', exact: true }).click();
    const actualRow = admin.getByRole('row').filter({ hasText: released.executeNo });
    await actualRow.waitFor();
    check('原公海任务日志页面显示真实MANUAL与触发人', new URL(admin.url()).searchParams.get('jobId') === '102'
      && (await actualRow.textContent()).includes('g_import_admin') && (await actualRow.textContent()).includes('MANUAL'));
    await actualRow.getByRole('button', { name: '查看日志详情', exact: true }).click();
    const resultDialog = admin.getByRole('dialog', { name: '任务日志详情', exact: true });
    await resultDialog.getByText(released.message, { exact: true }).waitFor();
    check('手机实际日志详情显示业务摘要与处理数', (await resultDialog.textContent()).includes('影响行数')
      && (await resultDialog.textContent()).includes(String(released.affected ?? '-')));
    await admin.screenshot({ path: path.join(state.run, 'a3-business-log-' + caseTag + '-320.png'), fullPage: true });
    check('指定任务页面无运行异常', pageErrors.length === 0); evidence.permissions = true; evidence.ui = true;
  } catch (error) { failure = error; }
  finally {
    if (database('SELECT status FROM sys_job WHERE job_id=102 AND tenant_id=100000;') !== 'PAUSED') await toggle('PAUSED');
    const fields = ['jobId', 'jobName', 'jobGroup', 'serviceName', 'handlerName', 'handlerParam', 'triggerType', 'cronExpression', 'intervalMs', 'status', 'concurrentFlag', 'misfireStrategy', 'retryCount', 'retryIntervalSec', 'dispatchRetryCount', 'dispatchRetryIntervalSec', 'timeoutSeconds', 'lockTimeSeconds', 'criticalFlag', 'logSuccessFlag', 'alarmOnFailFlag', 'alarmReceiver', 'remark'];
    successful(await api(admin, root, { method: 'PUT', body: { ...Object.fromEntries(fields.map(field => [field, originals.get(102)[field] ?? null])), confirmCritical: true } }), '恢复原公海任务配置');
    if (ruleId) database("UPDATE crm_assignment_rule SET status='INACTIVE' WHERE rule_id=" + ruleId + ' AND create_by=' + sql(marker) + ';');
    await waitFor(() => logRows(106), values => values.every(row => row.status !== 'RUNNING'), 'Actual contract work must finish before fixture cleanup', 60000);
    const contractSnapshot = rows("SELECT JSON_OBJECT('id',CAST(id AS CHAR),'number',contract_no,'status',status,'deleted',deleted,'end',end_date) FROM hr_employee_contract WHERE tenant_id=100000 AND create_by=" + sql(marker) + ' ORDER BY id;');
    assert.equal(contractSnapshot.length, contracts.length);
    await fs.writeFile(path.join(state.run, 'a3-business-' + caseTag + '-contracts-before-cleanup.json'), JSON.stringify(contractSnapshot, null, 2), { flag: 'wx' });
    for (const item of contracts) database('UPDATE hr_employee_contract SET deleted=1 WHERE tenant_id=100000 AND id=' + item.id + ' AND create_by=' + sql(marker) + ';');
    if (createdEmployee) database('UPDATE hr_employee SET deleted=1 WHERE id=' + employeeId + ' AND employee_no=' + sql(marker) + ';');
    check('原任务配置规则和角色授权恢复且新规则已停用', configuration() === oldConfiguration && grants() === oldGrants && ruleConfiguration() === oldRules
      && (!ruleId || database('SELECT status FROM crm_assignment_rule WHERE rule_id=' + ruleId + ';') === 'INACTIVE')
      && contracts.every(item => database('SELECT deleted FROM hr_employee_contract WHERE id=' + item.id + ';') === '1'));
    evidence.restoration = true;
    console.log('A3_BUSINESS_RESTORED: original_job_configuration=true; original_rules=true; grants=true; new_rule_inactive=true; new_contracts_inactive=true; contract_snapshot_retained=true; business_and_audit_retained=true');
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
  check('指定业务任务服务和审计日志无本轮凭据泄漏', leaks === 0 && audit.leaks === 0); evidence.secrets = true;
  console.log(`A3_BUSINESS_SECRET_SCAN: files=${files}; bytes=${bytes}; values=${secrets.size}; leaks=${leaks}; database_bytes=${audit.bytes}; database_leaks=${audit.leaks}`);
  if (failure) throw failure;
  check('两种实际业务任务的五次执行都回传准确处理数和业务摘要', metrics.length === 5 && metrics.every(Boolean)); evidence.metrics = true;
  console.log('A3_BUSINESS_SCOPE: actual_handlers=customerPoolRelease,employeeContractExpire; actual_job_ids=102,106; fixture_dates_and_business_rows=true; real_dispatch_execution_report_internal_delivery=true; no_cluster_acceptance=true; production_modified=false');
}
