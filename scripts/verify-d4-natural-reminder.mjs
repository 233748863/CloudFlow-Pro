import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createReadStream } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { readOwnedJobKeys, signJobRequest } from './job-internal-signing.mjs';
import { scanSecretStream } from './portal-checks/scan-access-logs.mjs';

const [stateFile, output] = process.argv.slice(2);
assert.ok(stateFile && output);
const state = JSON.parse((await fs.readFile(stateFile, 'utf8')).replace(/^\uFEFF/, ''));
assert.match(state.run, /^D:\\CloudFlowPro\\\.cloudflow-runtime\\d4-natural-reminder\\[a-f0-9]{32}$/);
assert.equal(path.dirname(stateFile), state.run); assert.equal(state.status, 'RUNNING');
assert.ok(Number.isInteger(state.mysqlPort) && state.mysqlPort > 1024 && state.mysqlPort < 65536);
const environment = { ...process.env }; delete environment.MYSQL_PWD;
let sqlCalls = 0;
const database = statement => {
  sqlCalls++;
  const result = spawnSync('mysql.exe', ['--no-defaults', '--protocol=TCP', '--host=127.0.0.1', `--port=${state.mysqlPort}`, '--user=root', '--skip-password', '--batch', '--raw', '--skip-column-names', '--default-character-set=utf8mb4', 'cloud_flow_db'],
    { input: statement, encoding: 'utf8', windowsHide: true, env: environment, timeout: 120000, maxBuffer: 16 * 1024 * 1024 });
  assert.equal(result.status, 0, 'Independent database request failed at query ' + sqlCalls); return result.stdout.trim();
};
assert.equal(path.resolve(database('SELECT @@datadir;')), path.join(state.run, 'mysql-data'));
const rows = statement => database(statement).split(/\r?\n/).filter(Boolean).map(value => JSON.parse(value));
const checkResults = [], requests = [], cases = [], schedules = [], observations = [];
const check = (label, value) => { checkResults.push({ label, passed: !!value }); assert.ok(value, label); };
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const keys = await readOwnedJobKeys(state), secrets = new Set(Object.values(keys));
const redisOwner = state.processes.find(item => item.name === 'redis');
assert.ok(redisOwner && /^redis-[a-f0-9]{32}\.conf$/.test(redisOwner.marker));
const redisConfig = await fs.readFile(path.join(state.run, redisOwner.marker), 'utf8');
assert.match(redisConfig, /^bind 127\.0\.0\.1$/m);
assert.match(redisConfig, new RegExp(`^port ${state.redisPort}$`, 'm'));
const redisPassword = redisConfig.match(/^requirepass (.+)$/m)?.[1]?.trim(); assert.ok(redisPassword); secrets.add(redisPassword);
const redisExecutable = 'D:/CloudFlowPro/.cloudflow-runtime/redis-8.10.1/bin/Redis-8.10.1-Windows-x64-msys2/redis-cli.exe';
const preparedThresholds = [];
const seedThreshold = (tenant, threshold) => {
  assert.ok([998600, 998601, 998602, 998603].includes(tenant) && [1, 3].includes(threshold));
  const key = tenant + ':sys:config:tenant:sys.hr.grievance.acceptWorkdays', value = JSON.stringify(String(threshold));
  const command = args => {
    const result = spawnSync(redisExecutable, ['-h', '127.0.0.1', '-p', String(state.redisPort), '--raw', ...args],
      { encoding: 'utf8', windowsHide: true, timeout: 30000, env: { ...environment, REDISCLI_AUTH: redisPassword } });
    assert.equal(result.status, 0, 'Independent threshold cache preparation failed');
    assert.ok(!/^(ERR|NOAUTH|WRONGPASS|WRONGTYPE|NOPERM)/m.test(result.stdout)); return result.stdout.trim();
  };
  check('仅初始化新租户不存在的提醒配置 ' + tenant, command(['EXISTS', key]) === '0');
  check('独立库与运行配置一致 ' + tenant, command(['SET', key, value, 'NX']) === 'OK' && command(['GET', key]) === value && database(`SELECT config_value FROM sys_config WHERE tenant_id=${tenant} AND config_key='sys.hr.grievance.acceptWorkdays' AND config_scope='1';`) === String(threshold));
  preparedThresholds.push({ tenant, threshold, cachePrepared: true });
};
for (const service of state.services) {
  const config = await fs.readFile(path.join(state.run, service.name, 'integration.properties'), 'utf8');
  for (const [, value] of config.matchAll(/^(?:spring.data.redis.password|cloudflow.encrypt.aes-key|cloudflow.file-storage.secret-key|cloudflow.message.secret-key)=([^\r\n]+)$/gm)) secrets.add(value);
}
const auth = state.services.find(item => item.name === 'auth'), hr = state.services.find(item => item.name === 'hr');
assert.ok(auth && hr);
const http = async (service, method, target, body, headers = {}) => {
  const response = await fetch(`http://127.0.0.1:${service.port}${target}`, { method, headers, body, signal: AbortSignal.timeout(15000) });
  const value = await response.json(); requests.push({ service: service.name, method, target, status: response.status, code: value.code }); return { status: response.status, value };
};
const logs = () => rows("SELECT JSON_OBJECT('id',CAST(log_id AS CHAR),'executeNo',execute_no,'status',execute_status,'affected',affected_rows,'message',result_msg,'trigger',trigger_type,'actor',trigger_by,'start',CAST(UNIX_TIMESTAMP(start_time)*1000 AS UNSIGNED),'end',CAST(UNIX_TIMESTAMP(end_time)*1000 AS UNSIGNED),'duration',duration_ms,'report',report_time) FROM sys_job_log WHERE job_id=1457 ORDER BY log_id;");
const caseIds = () => cases.map(item => item.id).join(',');
const reminders = () => rows(`SELECT JSON_OBJECT('id',CAST(grievance_id AS CHAR),'content',content,'visible',visible_to_employee_flag,'type',record_type) FROM hr_grievance_record WHERE grievance_id IN(${caseIds()}) ORDER BY grievance_id,record_id;`);
const messages = () => rows(`SELECT JSON_OBJECT('id',CAST(record_id AS CHAR),'tenant',tenant_id,'caseId',CAST(biz_id AS CHAR),'receiver',receiver_id,'status',send_status,'channel',channel_type,'title',title,'content',content,'url',link_url) FROM sys_message_record WHERE biz_type='HR_GRIEVANCE' AND biz_id IN(${caseIds()}) ORDER BY record_id;`);
const literal = value => "'" + String(value).replaceAll("'", "''") + "'";
let failure, originalCron, baseline, finishedMessages, expectedIds = [], leaks = 0, logFiles = 0;
try {
  check('仅独立空库运行且初始任务全暂停', state.tables === 374 && database("SELECT COUNT(*) FROM sys_job WHERE status='ENABLED';") === '0' && logs().length === 0);
  originalCron = database("SELECT cron_expression FROM sys_job WHERE job_id=1457 AND handler_name='hrGrievanceAcceptanceReminder';");
  check('保留原每天九点配置', originalCron === '0 0 9 * * ?');
  const today = database('SELECT CURRENT_DATE;');
  check('真实日期与上海时区一致', Intl.DateTimeFormat().resolvedOptions().timeZone === 'Asia/Shanghai' && today === new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' }).format(new Date()));
  const todayUtc = new Date(today + 'T00:00:00Z'), dateAt = offset => new Date(todayUtc.getTime() - offset * 86400000).toISOString().slice(0, 10);
  const priorWeekday = Array.from({ length: 7 }, (_, i) => i + 1).find(i => ![0, 6].includes(new Date(dateAt(i)).getUTCDay()));
  const priorSunday = Array.from({ length: 7 }, (_, i) => i + 1).find(i => new Date(dateAt(i)).getUTCDay() === 0);
  database("UPDATE sys_tenant SET status='1';");
  for (let tenantIndex = 0; tenantIndex < 4; tenantIndex++) {
    const tenant = 998600 + tenantIndex, role = 998600 + tenantIndex, userBase = 998700 + tenantIndex * 10;
    database(`INSERT INTO sys_tenant(tenant_id,tenant_code,tenant_name,status,expire_time) VALUES(${tenant},'D4-NAT-${tenantIndex}','提醒独立租户${tenantIndex}','${tenantIndex === 2 ? '1' : '0'}',${tenantIndex === 3 ? 'DATE_SUB(CURRENT_DATE,INTERVAL 1 DAY)' : 'NULL'});
INSERT INTO sys_role(role_id,tenant_id,role_name,role_key,role_sort) VALUES(${role},${tenant},'提醒人事','hr',1);
INSERT INTO sys_config(tenant_id,config_name,config_key,config_value,config_scope) VALUES(${tenant},'申诉提醒工作日','sys.hr.grievance.acceptWorkdays','${tenantIndex === 1 ? 1 : 3}','1');
INSERT INTO sys_message_channel(tenant_id,channel_type,channel_code,channel_name,implemented_flag) VALUES(${tenant},'INTERNAL','D4-INTERNAL','独立站内消息',1);
INSERT INTO sys_message_template(tenant_id,template_code,template_name,channel_type,biz_module,message_category,title_template,content_template,params_declare,force_send_flag,dedupe_window_sec,link_url_template,status)
 SELECT ${tenant},template_code,template_name,channel_type,biz_module,message_category,title_template,content_template,params_declare,force_send_flag,dedupe_window_sec,link_url_template,status FROM sys_message_template WHERE tenant_id=100000 AND template_code='HR_GRIEVANCE_NOTICE';`);
    seedThreshold(tenant, tenantIndex === 1 ? 1 : 3);
    for (let n = 0; n < 4; n++) {
      database(`INSERT INTO sys_user(user_id,tenant_id,user_name,nick_name,status) VALUES(${userBase + n},${tenant},'d4_nat_${tenantIndex}_${n}','独立人事${n}','${n === 3 ? '1' : '0'}');
INSERT INTO sys_user_role(tenant_id,user_id,role_id) VALUES(${tenant},${userBase + n},${role});`);
    }
    for (let calendarIndex = 0; calendarIndex < 3; calendarIndex++) {
      const calendar = 998800 + tenantIndex * 10 + calendarIndex;
      database(`INSERT INTO sys_holiday_calendar(calendar_id,tenant_id,calendar_code,calendar_name,default_flag,weekly_rest_days) VALUES(${calendar},${tenant},'D4-CAL-${calendarIndex}','提醒日历${calendarIndex}',${calendarIndex === 0 ? 1 : 0},'6,7');
INSERT INTO sys_dept(dept_id,tenant_id,dept_name,holiday_calendar_id) VALUES(${calendar},${tenant},'提醒部门${calendarIndex}',${calendar});`);
      if (calendarIndex > 0) {
        const date = dateAt(calendarIndex === 1 ? priorWeekday : priorSunday);
        database(`INSERT INTO sys_holiday_date(tenant_id,calendar_id,holiday_date,date_type,holiday_name,year_no) VALUES(${tenant},${calendar},'${date}','${calendarIndex === 1 ? 'HOLIDAY' : 'WORKDAY'}','独立边界',${Number(date.slice(0, 4))});`);
      }
      const employee = 998900 + tenantIndex * 10 + calendarIndex;
      database(`INSERT INTO hr_employee(id,tenant_id,employee_no,name,gender,employee_status,dept_id,user_id) VALUES(${employee},${tenant},'D4-NAT-EMP-${employee}','独立提醒员工','UNKNOWN','REGULAR',${calendar},${calendarIndex === 0 ? userBase : 'NULL'});`);
      const offsets = tenantIndex === 0 ? [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] : [0, 1, 7];
      for (const offset of offsets) {
        let workdays = 0;
        for (let daysAgo = 0; daysAgo < offset; daysAgo++) {
          let work = ![0, 6].includes(new Date(dateAt(daysAgo)).getUTCDay());
          if (calendarIndex === 1 && daysAgo === priorWeekday) work = false;
          if (calendarIndex === 2 && daysAgo === priorSunday) work = true;
          if (work) workdays++;
        }
        cases.push({ id: 9980000 + cases.length, tenant, employee, calendar, offset, workdays, threshold: tenantIndex === 1 ? 1 : 3,
          eligible: tenantIndex < 2 && workdays >= (tenantIndex === 1 ? 1 : 3), status: 'SUBMITTED', receiver: userBase + 2,
          receivers: calendarIndex === 0 ? [userBase + 2] : [userBase, userBase + 2], excludedUsers: calendarIndex === 0 ? [userBase, userBase + 1, userBase + 3] : [userBase + 1, userBase + 3] });
      }
    }
  }
  const first = cases.find(item => item.eligible);
  for (const status of ['ACCEPTED', 'INVESTIGATING', 'RESOLVED', 'CLOSED', 'ESCALATED', 'WITHDRAWN']) cases.push({ ...first, id: 9980000 + cases.length, status, eligible: false });
  cases.push({ ...first, id: 9980000 + cases.length, deleted: 1, eligible: false });
  for (const sample of cases) {
    database(`INSERT INTO hr_grievance(grievance_id,tenant_id,grievance_no,employee_id,employee_name,dept_id,grievance_type,subject,description,expectation,against_type,against_id,status,create_time,deleted)
VALUES(${sample.id},${sample.tenant},'D4-NAT-${sample.id}',${sample.employee},'独立提醒员工',${sample.calendar},'OTHER','D4_PRIVATE_SUBJECT_${sample.id}','D4_PRIVATE_DESCRIPTION_${sample.id}','D4_PRIVATE_EXPECTATION_${sample.id}','USER',${sample.receiver - 1},'${sample.status}',${literal(dateAt(sample.offset) + ' 23:59:59')},${sample.deleted || 0});`);
  }
  expectedIds = cases.filter(item => item.eligible).map(item => String(item.id)).sort();
  check('样本覆盖阈值前一天与恰好达到及超过阈值', [2, 3, 4].every(days => cases.some(item => item.tenant === 998600 && item.workdays === days)));
  check('工作日放假和周末调休产生不同提醒结果', [1, 2].every(calendarIndex => cases.some(item => item.tenant === 998600 && item.calendar === 998800 + calendarIndex && item.eligible !== cases.find(other => other.tenant === 998600 && other.calendar === 998800 && other.offset === item.offset).eligible)));
  baseline = {
    grievances: database(`SELECT * FROM hr_grievance WHERE grievance_id IN(${caseIds()}) ORDER BY grievance_id;`),
    roles: database('SELECT * FROM sys_role_menu ORDER BY role_id,menu_id;'),
    configs: database('SELECT * FROM sys_config ORDER BY config_id;'),
    calendar: database('SELECT * FROM sys_holiday_date ORDER BY date_id;'),
  };
  await fs.writeFile(path.join(output, 'fixture.json'), JSON.stringify({ today, priorWeekday: dateAt(priorWeekday), priorSunday: dateAt(priorSunday), preparedThresholds, cases, expectedIds }, null, 2));
  for (const target of ['/inner/job/execute', '/inner/job/status/not-dispatched']) {
    const response = await http(hr, target.includes('status') ? 'GET' : 'POST', target, target.includes('status') ? undefined : '{}', { 'Content-Type': 'application/json', 'X-Inner-Call': 'true', 'X-From-Service': 'cloudflow-auth', 'X-Tenant-Id': '100000' });
    check('未签名请求拒绝 ' + target, [401, 403].includes(response.status));
  }
  for (let round = 1; round <= 2; round++) {
    const due = new Date(Math.ceil((Date.now() + 75000) / 1000) * 1000), cron = `${due.getSeconds()} ${due.getMinutes()} ${due.getHours()} * * ?`;
    const schedule = { round, originalCron, fixtureCron: cron, enabledAt: Date.now(), expectedAt: due.getTime(), manualTriggers: 0, originalNineAmObserved: false };
    schedules.push(schedule);
    database(`UPDATE sys_job SET cron_expression='${cron}',status='ENABLED' WHERE job_id=1457 AND handler_name='hrGrievanceAcceptanceReminder';`);
    check('仅启用申诉受理提醒任务 ' + round, database("SELECT COUNT(*) FROM sys_job WHERE status='ENABLED';") === '1');
    console.log('D4_NATURAL_WAIT: ' + JSON.stringify({ round, expectedAt: due.toISOString(), expectedAffected: round === 1 ? expectedIds.length : 0 }));
    let observed, early = 0, nextProgress = 0;
    while (Date.now() < due.getTime() + 120000) {
      observed = logs();
      if (Date.now() < due.getTime() - 1000) { check('计划到点前没有提前执行 ' + round, observed.length === round - 1); early++; }
      if (observed.length >= round && ['SUCCESS', 'FAILED', 'SKIPPED'].includes(observed[round - 1].status)) break;
      if (Date.now() >= nextProgress) { console.log('D4_NATURAL_PROGRESS: ' + JSON.stringify({ round, remainingSeconds: Math.max(0, Math.ceil((due.getTime() - Date.now()) / 1000)), logs: observed.length })); nextProgress = Date.now() + 30000; }
      await sleep(2000);
    }
    observations.push(observed);
    check('自然触发一次并正确回报数量 ' + round, observed.length === round && observed[round - 1].status === 'SUCCESS' && observed[round - 1].affected === (round === 1 ? expectedIds.length : 0));
    const execution = observed[round - 1];
    check('触发时间及回报完整 ' + round, early > 0 && execution.trigger === 'CRON' && !execution.actor && !!execution.report && execution.start >= due.getTime() - 1000 && execution.start <= due.getTime() + 15000 && execution.end >= execution.start);
    const target = '/inner/job/status/' + execution.executeNo, headers = signJobRequest(keys, 'cloudflow-auth', 'cloudflow-service-hr', 'GET', target); secrets.add(headers['X-Job-Signature']);
    const status = await http(hr, 'GET', target, undefined, headers);
    check('执行服务状态与调度回报一致 ' + round, status.status === 200 && status.value.code === 200 && status.value.data?.executeStatus === 'SUCCESS' && status.value.data.affectedRows === execution.affected);
    const actual = reminders();
    check('仅到期申诉各一条提醒且同日重复无新增 ' + round, JSON.stringify(actual.map(item => item.id).sort()) === JSON.stringify(expectedIds));
    check('提醒内部可见并记录本次真实日期 ' + round, actual.every(item => item.type === 'COMMENT' && item.visible === 0 && item.content === `超时未受理提醒（${today}）`));
    const deadline = Date.now() + 60000, expectedMessages = cases.filter(item => item.eligible).reduce((total, item) => total + item.receivers.length, 0);
    while (Date.now() < deadline && messages().filter(item => item.status === 'SUCCESS').length < expectedMessages) await sleep(1000);
    const delivered = messages();
    check('每个到期申诉仅向无利益冲突HR各发送一条站内成功消息 ' + round, delivered.length === expectedMessages && delivered.every(item => {
      const sample = cases.find(value => String(value.id) === item.caseId);
      return sample.eligible && item.tenant === sample.tenant && sample.receivers.includes(item.receiver) && item.channel === 'INTERNAL' && item.status === 'SUCCESS' && item.title === '有员工申诉超过受理提醒时限' && !/D4_PRIVATE_/.test(item.content + item.title) && item.url === '/hr/grievances?id=' + sample.id;
    }));
    check('各案收件人集合准确且没有重复', cases.filter(item => item.eligible).every(sample => JSON.stringify(delivered.filter(item => item.caseId === String(sample.id)).map(item => item.receiver).sort()) === JSON.stringify([...sample.receivers].sort())));
    if (round === 1) finishedMessages = JSON.stringify(delivered); else check('同日去重没有产生重复或跳过消息', JSON.stringify(delivered) === finishedMessages);
  }
  const finalReminders = reminders();
  check('已受理及终态和租户隔离不产生提醒', cases.filter(item => !item.eligible).every(item => !finalReminders.some(row => row.id === String(item.id))));
  check('提醒审计逐案唯一', Number(database(`SELECT COUNT(*) FROM hr_audit_log WHERE business_domain='GRIEVANCE' AND operation_type='REMIND' AND business_id IN(${caseIds()});`)) === expectedIds.length);
  check('原始样本日期和状态完整保持', database(`SELECT * FROM hr_grievance WHERE grievance_id IN(${caseIds()}) ORDER BY grievance_id;`) === baseline.grievances);
  check('角色菜单及规则日历保持', database('SELECT * FROM sys_role_menu ORDER BY role_id,menu_id;') === baseline.roles && database('SELECT * FROM sys_config ORDER BY config_id;') === baseline.configs && database('SELECT * FROM sys_holiday_date ORDER BY date_id;') === baseline.calendar);
  check('验证期间未跨日', database('SELECT CURRENT_DATE;') === today);
} catch (error) { failure = error.message; }
finally {
  try { database(`UPDATE sys_job SET status='PAUSED'${originalCron ? ',cron_expression=' + literal(originalCron) : ''} WHERE job_id=1457;`); check('恢复原九点配置且任务全部暂停', database("SELECT COUNT(*) FROM sys_job WHERE status='ENABLED';") === '0' && (!originalCron || database('SELECT cron_expression FROM sys_job WHERE job_id=1457;') === originalCron)); } catch (error) { failure = [failure, error.message].filter(Boolean).join('; '); }
  try {
    for (const service of state.services) {
      const directory = path.join(state.run, service.name), entries = await fs.readdir(directory, { recursive: true, withFileTypes: true });
      for (const entry of entries.filter(item => item.isFile() && item.name.endsWith('.log'))) { const scan = await scanSecretStream(createReadStream(path.join(entry.parentPath, entry.name)), [...secrets]); logFiles++; leaks += scan.leaks; }
    }
    const audit = database('SELECT * FROM sys_log; SELECT * FROM sys_api_error_log; SELECT * FROM sys_audit_log;');
    for (const secret of secrets) if (audit.includes(secret)) leaks++;
    check('独立服务及审计没有密钥明文', logFiles >= 4 && leaks === 0);
  } catch (error) { failure = [failure, error.message].filter(Boolean).join('; '); }
  await fs.writeFile(path.join(output, 'observed.json'), JSON.stringify({ schedules, observations, requests, reminders: cases.length ? reminders() : [], messages: cases.length ? messages() : [] }, null, 2));
  const result = { passed: !failure, failure, checks: checkResults.length, failed: checkResults.filter(item => !item.passed).length, cases: cases.length, expectedReminders: expectedIds.length, requests: requests.length, sqlCalls, naturalScheduler: true, originalNineAmObserved: false, schedules, checkResults, independentMysql: true, independentRedis: true, realHttp: true, manualTriggers: 0, clockChanges: 0, priorRuntimeWritten: false, secrets: { files: logFiles, leaks }, all13Complete: false, globalComplete: false };
  await fs.writeFile(path.join(output, 'result.json'), JSON.stringify(result, null, 2));
  console.log('D4_NATURAL_RESULT: ' + JSON.stringify({ ...result, checkResults: undefined }));
}
if (failure) process.exitCode = 1;
