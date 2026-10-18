import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createReadStream } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { readOwnedJobKeys, signJobRequest } from './job-internal-signing.mjs';
import { scanSecretStream } from './portal-checks/scan-access-logs.mjs';

const [stateFile, output] = process.argv.slice(2);
assert.ok(stateFile && output, 'Owned runtime and evidence required');
const state = JSON.parse((await fs.readFile(stateFile, 'utf8')).replace(/^\uFEFF/, ''));
assert.match(state.run, /^D:\\CloudFlowPro\\\.cloudflow-runtime\\d2-natural-daily\\[a-f0-9]{32}$/);
assert.equal(path.dirname(stateFile), state.run);
assert.equal(state.status, 'RUNNING');
assert.ok(Number.isInteger(state.mysqlPort) && state.mysqlPort > 1024 && state.mysqlPort < 65536);
const environment = { ...process.env }; delete environment.MYSQL_PWD;
let sqlCalls = 0;
const database = query => {
  sqlCalls++;
  const result = spawnSync('mysql.exe', ['--no-defaults', '--protocol=TCP', '--host=127.0.0.1', `--port=${state.mysqlPort}`, '--user=root', '--skip-password', '--batch', '--raw', '--skip-column-names', '--default-character-set=utf8mb4', 'cloud_flow_db'], { input: query, encoding: 'utf8', windowsHide: true, env: environment, timeout: 120000, maxBuffer: 16 * 1024 * 1024 });
  assert.equal(result.status, 0, 'Independent database request failed at query ' + sqlCalls);
  return result.stdout.trim();
};
assert.equal(path.resolve(database('SELECT @@datadir;')), path.join(state.run, 'mysql-data'));
const rows = query => database(query).split(/\r?\n/).filter(Boolean).map(item => JSON.parse(item));
const checkResults = [], requests = [];
const check = (label, condition) => { checkResults.push({ label, passed: !!condition }); assert.ok(condition, label); };
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const keys = await readOwnedJobKeys(state);
const secrets = new Set(Object.values(keys));
for (const service of state.services) {
  const config = await fs.readFile(path.join(state.run, service.name, 'integration.properties'), 'utf8');
  for (const [, value] of config.matchAll(/^(?:spring.data.redis.password|cloudflow.encrypt.aes-key|cloudflow.file-storage.secret-key|cloudflow.message.secret-key)=([^\r\n]+)$/gm)) secrets.add(value);
}
const auth = state.services.find(item => item.name === 'auth'), hr = state.services.find(item => item.name === 'hr');
assert.ok(auth && hr);
const http = async (service, method, target, body, headers = {}) => {
  const response = await fetch(`http://127.0.0.1:${service.port}${target}`, { method, headers, body, signal: AbortSignal.timeout(15000) });
  const value = await response.json();
  requests.push({ service: service.name, method, target, status: response.status, code: value.code });
  return { status: response.status, value };
};
const logs = () => rows("SELECT JSON_OBJECT('id',CAST(log_id AS CHAR),'executeNo',execute_no,'status',execute_status,'affected',affected_rows,'message',result_msg,'trigger',trigger_type,'actor',trigger_by,'start',CAST(UNIX_TIMESTAMP(start_time)*1000 AS UNSIGNED),'end',CAST(UNIX_TIMESTAMP(end_time)*1000 AS UNSIGNED),'duration',duration_ms,'report',report_time) FROM sys_job_log WHERE job_id=1454 ORDER BY log_id;");
const rawFacts = () => database('SELECT checkin_id,tenant_id,employee_id,attendance_date,check_time,log_type,check_method,location_valid_flag,offshift_flag,skip_auto_flag FROM hr_attendance_checkin ORDER BY checkin_id;');
const protectedRows = () => database('SELECT * FROM hr_attendance_record WHERE employee_id IN(996903,996904) ORDER BY id;');
const sealed = () => database('SELECT * FROM hr_attendance_monthly WHERE employee_id=996904;');
let failure, schedule, observed, baseline, leakCount = 0, logFiles = 0;
try {
  check('仅独立空库运行且全部初始任务暂停', state.tables === 374 && database("SELECT COUNT(*) FROM sys_job WHERE status='ENABLED';") === '0' && logs().length === 0);
  const originalCron = database('SELECT cron_expression FROM sys_job WHERE job_id=1454;');
  check('保留原每天凌晨五点配置的真实来源', originalCron === '0 0 5 * * ?');
  database(`START TRANSACTION;
UPDATE sys_tenant SET status='1';
INSERT INTO sys_tenant(tenant_id,tenant_code,tenant_name,status,expire_time) VALUES
(996900,'D2-NATURAL-0','自然每日主租户','0',NULL),(996901,'D2-NATURAL-1','自然每日另一租户','0',NULL),
(996902,'D2-NATURAL-2','停用租户','1',NULL),(996903,'D2-NATURAL-3','过期租户','0',DATE_SUB(CURRENT_DATE,INTERVAL 1 DAY));
INSERT INTO sys_holiday_calendar(calendar_id,tenant_id,calendar_code,calendar_name,default_flag,weekly_rest_days) VALUES
(996900,996900,'D2-NATURAL-WORK','每日工作日',1,'6,7'),(996901,996900,'D2-NATURAL-HOLIDAY','每日假日',0,'6,7'),(996902,996901,'D2-NATURAL-OTHER','其他租户',1,'6,7');
INSERT INTO sys_holiday_date(tenant_id,calendar_id,holiday_date,date_type,holiday_name,year_no) VALUES
(996900,996900,DATE_SUB(CURRENT_DATE,INTERVAL 1 DAY),'WORKDAY','固定测试日型',YEAR(DATE_SUB(CURRENT_DATE,INTERVAL 1 DAY))),
(996900,996901,DATE_SUB(CURRENT_DATE,INTERVAL 1 DAY),'HOLIDAY','固定测试日型',YEAR(DATE_SUB(CURRENT_DATE,INTERVAL 1 DAY))),
(996901,996902,DATE_SUB(CURRENT_DATE,INTERVAL 1 DAY),'WORKDAY','固定测试日型',YEAR(DATE_SUB(CURRENT_DATE,INTERVAL 1 DAY)));
INSERT INTO sys_dept(dept_id,tenant_id,dept_name) VALUES(996900,996900,'每日部门'),(996901,996901,'其他租户部门');
INSERT INTO hr_shift(id,tenant_id,shift_code,shift_name,start_time,end_time,break_minutes,work_minutes,holiday_calendar_id,auto_attendance_flag,late_grace_minutes,process_attendance_after) VALUES
(996900,996900,'D2-NATURAL-ON','正常','09:00','18:00',60,480,996900,1,10,NULL),
(996901,996900,'D2-NATURAL-OFF','关闭','09:00','18:00',60,480,996900,0,10,NULL),
(996902,996900,'D2-NATURAL-LATER','起算','09:00','18:00',60,480,996900,1,10,CURRENT_DATE),
(996903,996900,'D2-NATURAL-HOL','假日','09:00','18:00',60,480,996901,1,10,NULL),
(996904,996901,'D2-NATURAL-OTHER','其他租户','09:00','18:00',60,480,996902,1,10,NULL);
COMMIT;`);
  for (let index = 0; index < 8; index++) {
    database(`INSERT INTO hr_employee(id,tenant_id,employee_no,name,gender,dept_id,employee_status,hire_date) VALUES(${996900 + index},996900,'D2-NATURAL-EMP-${index}','自然每日员工${index}','UNKNOWN',996900,'REGULAR',${index === 5 ? 'CURRENT_DATE' : 'DATE_SUB(CURRENT_DATE,INTERVAL 1 YEAR)'});`);
    if (index < 7) {
      const shift = index === 1 ? 996901 : index === 2 ? 996902 : index === 6 ? 996903 : 996900;
      database(`INSERT INTO hr_schedule_assignment(tenant_id,target_type,target_id,shift_id,effective_start,status) VALUES(996900,'EMPLOYEE',${996900 + index},${shift},DATE_SUB(CURRENT_DATE,INTERVAL 1 YEAR),'ACTIVE');`);
    }
  }
  for (let index = 1; index <= 3; index++) database(`INSERT INTO hr_employee(id,tenant_id,employee_no,name,gender,dept_id,employee_status,hire_date) VALUES(${996910 + index},${996900 + index},'D2-NATURAL-OTHER-${index}','另一租户员工${index}','UNKNOWN',996901,'REGULAR',DATE_SUB(CURRENT_DATE,INTERVAL 1 YEAR));`);
  database("INSERT INTO hr_schedule_assignment(tenant_id,target_type,target_id,shift_id,effective_start,status) VALUES(996901,'EMPLOYEE',996911,996904,DATE_SUB(CURRENT_DATE,INTERVAL 1 YEAR),'ACTIVE');");
  for (const employee of [996900, 996903, 996904, 996911]) for (const kind of ['IN', 'OUT']) database(`INSERT INTO hr_attendance_checkin(tenant_id,employee_id,attendance_date,check_time,log_type,check_method,location_valid_flag,offshift_flag,skip_auto_flag) VALUES(${employee === 996911 ? 996901 : 996900},${employee},DATE_SUB(CURRENT_DATE,INTERVAL 1 DAY),TIMESTAMP(DATE_SUB(CURRENT_DATE,INTERVAL 1 DAY),'${kind === 'IN' ? '09:08:00' : '18:00:00'}'),'${kind}','APP',1,0,0);`);
  database(`INSERT INTO hr_attendance_record(tenant_id,employee_id,attendance_date,shift_id,status,work_minutes,manual_adjusted_flag,remark) VALUES
(996900,996903,DATE_SUB(CURRENT_DATE,INTERVAL 1 DAY),996900,'NORMAL',333,1,'原人工保护'),(996900,996904,DATE_SUB(CURRENT_DATE,INTERVAL 1 DAY),996900,'NORMAL',444,0,'原封账');
INSERT INTO hr_attendance_monthly(tenant_id,employee_id,year,month,status) VALUES(996900,996904,YEAR(DATE_SUB(CURRENT_DATE,INTERVAL 1 DAY)),MONTH(DATE_SUB(CURRENT_DATE,INTERVAL 1 DAY)),'CONFIRMED');`);
  baseline = { raw: rawFacts(), protected: protectedRows(), sealed: sealed(), other: database('SELECT * FROM hr_attendance_record WHERE tenant_id NOT BETWEEN 996900 AND 996903 ORDER BY id;'), grants: database('SELECT * FROM sys_role_menu ORDER BY role_id,menu_id;') };
  await fs.writeFile(path.join(output, 'fixture.json'), JSON.stringify({ date: database('SELECT DATE_SUB(CURRENT_DATE,INTERVAL 1 DAY);'), tenants: [996900, 996901, 996902, 996903], employees: 11, baseline }, null, 2));
  for (const [service, method, target, from] of [[hr, 'POST', '/inner/job/execute', 'cloudflow-auth'], [hr, 'GET', '/inner/job/status/D2-NATURAL-UNSIGNED', 'cloudflow-auth'], [auth, 'POST', '/inner/job/report', 'cloudflow-service-hr']]) {
    const response = await http(service, method, target, method === 'POST' ? '{}' : undefined, { 'Content-Type': 'application/json', 'X-Inner-Call': 'true', 'X-From-Service': from, 'X-Tenant-Id': '100000' });
    check('冒充内部服务不能通过 ' + target, [401, 403].includes(response.status));
  }
  const due = new Date(Math.ceil((Date.now() + 90000) / 1000) * 1000);
  const cron = `${due.getSeconds()} ${due.getMinutes()} ${due.getHours()} * * ?`;
  schedule = { originalCron, fixtureCron: cron, enabledAt: Date.now(), expectedAt: due.getTime(), timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, periodDays: 1, manualTriggers: 0, databaseTimeWrites: 0, clockChanges: 0, originalFiveAmObserved: false };
  check('操作系统及数据库日期与上海时区一致', schedule.timezone === 'Asia/Shanghai' && database('SELECT CURRENT_DATE;') === new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' }).format(new Date()));
  database(`UPDATE sys_job SET cron_expression='${cron}',status='ENABLED' WHERE job_id=1454 AND handler_name='hrAttendanceDailyCalc';`);
  check('仅启用正式每日考勤处理方法', database("SELECT COUNT(*) FROM sys_job WHERE status='ENABLED';") === '1');
  console.log('D2_NATURAL_SCHEDULE: ' + JSON.stringify(schedule));
  const deadline = due.getTime() + 90000;
  let earlyObservations = 0, nextProgress = 0;
  while (Date.now() < deadline) {
    observed = logs();
    if (Date.now() < due.getTime() - 1000) { check('本次到点前没有提前执行', observed.length === 0); earlyObservations++; }
    if (observed.some(item => ['SUCCESS', 'FAILED', 'SKIPPED'].includes(item.status))) break;
    if (Date.now() >= nextProgress) { console.log('D2_NATURAL_PROGRESS: ' + JSON.stringify({ remainingSeconds: Math.max(0, Math.ceil((due.getTime() - Date.now()) / 1000)), logs: observed.length })); nextProgress = Date.now() + 30000; }
    await sleep(2000);
  }
  check('真实每日定时执行一次且成功回报四条', observed.length === 1 && observed[0].status === 'SUCCESS' && observed[0].affected === 4);
  const execution = observed[0];
  check('自然触发身份及结果回报完整', execution.trigger === 'CRON' && !execution.actor && !!execution.report && execution.end >= execution.start && Number.isInteger(execution.duration));
  check('按配置时刻自然触发且此前持续等待', earlyObservations > 0 && execution.start >= due.getTime() - 1000 && execution.start <= due.getTime() + 10000);
  const target = '/inner/job/status/' + execution.executeNo;
  const headers = signJobRequest(keys, 'cloudflow-auth', 'cloudflow-service-hr', 'GET', target);
  secrets.add(headers['X-Job-Signature']);
  const status = await http(hr, 'GET', target, undefined, headers);
  check('真实执行服务状态与调度中心回报一致', status.status === 200 && status.value.code === 200 && status.value.data?.executeStatus === 'SUCCESS' && status.value.data.affectedRows === 4 && status.value.data.executeNo === execution.executeNo && status.value.data.resultMsg === execution.message);
  const count = query => Number(database(query));
  check('昨日正常打卡得到472分钟且未迟到', count("SELECT COUNT(*) FROM hr_attendance_record WHERE employee_id=996900 AND attendance_date=DATE_SUB(CURRENT_DATE,INTERVAL 1 DAY) AND status='NORMAL' AND work_minutes=472 AND late_minutes=0;") === 1);
  check('关闭自动考勤及起算日和入职日期保护', count('SELECT COUNT(*) FROM hr_attendance_record WHERE employee_id IN(996901,996902,996905);') === 0);
  check('假日日历生成零应出勤结论', count("SELECT COUNT(*) FROM hr_attendance_record WHERE employee_id=996906 AND status='HOLIDAY' AND expected_minutes=0;") === 1);
  check('未排班员工待确认且不虚构缺勤', count("SELECT COUNT(*) FROM hr_attendance_record WHERE employee_id=996907 AND status='PENDING';") === 1);
  check('第二个有效租户得到正确考勤', count("SELECT COUNT(*) FROM hr_attendance_record WHERE tenant_id=996901 AND employee_id=996911 AND status='NORMAL' AND work_minutes=472;") === 1);
  check('停用和过期租户未生成考勤', count('SELECT COUNT(*) FROM hr_attendance_record WHERE tenant_id IN(996902,996903);') === 0);
  check('仅处理前一日且每人每日唯一', count('SELECT COUNT(*) FROM hr_attendance_record WHERE tenant_id BETWEEN 996900 AND 996903 AND attendance_date<>DATE_SUB(CURRENT_DATE,INTERVAL 1 DAY);') === 0 && count('SELECT COUNT(*) FROM (SELECT tenant_id,employee_id,attendance_date,COUNT(*) n FROM hr_attendance_record GROUP BY tenant_id,employee_id,attendance_date HAVING n>1) duplicate_days;') === 0);
  check('人工调整及封账的完整记录保持', protectedRows() === baseline.protected && sealed() === baseline.sealed);
  check('原始打卡事实保持且正确关联当日日结论', rawFacts() === baseline.raw && count('SELECT COUNT(*) FROM hr_attendance_checkin c JOIN hr_attendance_record r ON r.id=c.attendance_record_id AND r.tenant_id=c.tenant_id AND r.employee_id=c.employee_id AND r.attendance_date=c.attendance_date WHERE c.employee_id IN(996900,996911);') === 4);
  check('其他初始日结论和角色授权保持', database('SELECT * FROM hr_attendance_record WHERE tenant_id NOT BETWEEN 996900 AND 996903 ORDER BY id;') === baseline.other && database('SELECT * FROM sys_role_menu ORDER BY role_id,menu_id;') === baseline.grants);
  database("UPDATE sys_job SET status='PAUSED' WHERE job_id=1454;");
  const completed = JSON.stringify(logs());
  await sleep(11000);
  check('暂停后没有新增执行且全部任务暂停', JSON.stringify(logs()) === completed && database("SELECT COUNT(*) FROM sys_job WHERE status='ENABLED';") === '0');
  await fs.writeFile(path.join(output, 'observed.json'), JSON.stringify({ schedule, earlyObservations, logs: observed, requests, records: database('SELECT * FROM hr_attendance_record WHERE tenant_id BETWEEN 996900 AND 996903 ORDER BY id;'), monthly: database('SELECT * FROM hr_attendance_monthly WHERE tenant_id BETWEEN 996900 AND 996903 ORDER BY id;') }, null, 2));
} catch (error) { failure = error.message; }
finally {
  try { database("UPDATE sys_job SET status='PAUSED' WHERE job_id=1454;"); } catch { failure = [failure, 'Pause cleanup failed'].filter(Boolean).join('; '); }
  try {
    for (const service of state.services) {
      const directory = path.join(state.run, service.name);
      const entries = await fs.readdir(directory, { recursive: true, withFileTypes: true });
      for (const entry of entries.filter(item => item.isFile() && item.name.endsWith('.log'))) {
        const scan = await scanSecretStream(createReadStream(path.join(entry.parentPath, entry.name)), [...secrets]);
        logFiles++; leakCount += scan.leaks;
      }
    }
    const audit = database('SELECT * FROM sys_log; SELECT * FROM sys_api_error_log; SELECT * FROM sys_audit_log;');
    for (const secret of secrets) if (audit.includes(secret)) leakCount++;
    check('服务与审计日志无测试凭据明文', leakCount === 0 && logFiles >= 4);
  } catch (error) { failure = [failure, error.message].filter(Boolean).join('; '); }
  const result = { passed: !failure, failure, checks: checkResults.length, failed: checkResults.filter(item => !item.passed).length, requests: requests.length, sqlCalls, naturalScheduler: true, originalFiveAmObserved: false, schedule, execution: observed, independentMysql: true, independentRedis: true, realHttp: true, realDistributedLock: true, secrets: { files: logFiles, leaks: leakCount }, checkResults };
  await fs.writeFile(path.join(output, 'result.json'), JSON.stringify(result, null, 2));
  console.log('D2_NATURAL_RESULT: ' + JSON.stringify({ ...result, checkResults: undefined, execution: undefined }));
}
if (failure) process.exitCode = 1;
